// [finish] HOMEWORLD ON-SITE RAID core (pure, node-tested by tools/harness/homeworld_raid.test.mjs). When the crew flies home during a raid the abstract
// RaidSim (homeworld_core.js) is kept as the DATA HOLDER (building hp, core, wave counters, rewards, result) but the raiders are real creatures
// (siege creatures sg_swarmer / sg_runner / sg_brute) walking a siege_core FlowField to the pad; towers really shoot them and raiders really hit
// buildings. This file has the numbers and the per-step logic on plain objects; src/game/homeworld_raid.js maps it onto game creatures.
//   raider   = { id, type, x, z, hp, maxHp, slowT, slowMul }         (view of a host creature)
//   tower    = sim.def.towers[i] { id, t, lv, x, z, dps, range, chain, slow }   (live defence buildings, hp lives in sim.hp)
import { SG, planWave } from './siege_core.js';
import { RAID, isWall, BUILDINGS, cellCenter } from './homeworld_core.js';

export const SITE = {
  enterPrep: 22,            // seconds of grace when the crew arrives mid-raid before the next wave spawns
  spawnPerSec: 3, maxAlive: 36, aggro: 8, brutesAggro: 6, bossAggro: 16, hitMul: RAID.dpsMul,   // raiders do the abstract sim's damage per hit
  coreHitMul: 1.0,          // core % lost per S.hull point per hit (siege_core SG[..].hull)
  towerH: { gun: 2.2, tesla: 3.0, flame: 1.6, cryo: 2.4, sniper: 3.8 },
  cadence: { gun: 0.4, tesla: 0.9, flame: 0.25, cryo: 0.6 },
  sniperMin: 2.6, teslaHop: 6, flameSplash: 2.4, trapTick: 0.5, mineR: 2.2,
  spawnArc: 0.4, waveTimeout: 70, hardCap: 480,   // real waves take longer than the abstract 150 s cap
};
const hyp = Math.hypot;

/** per-tower runtime state (cooldowns) keyed by building id */
export function newTowerState() { return new Map(); }

/** raiders of the next wave as [{ type, n }] (boss -> three more blobs, hp carried over from an abandoned abstract wave -> swarmers) */
export function siteWave(sim, carryHp = 0) {
  const plan = planWave(sim.w + 1, sim.W, sim.P);
  const tank = plan.tank + (plan.boss ? 3 : 0);
  const extra = carryHp > 0 ? Math.min(20, Math.ceil(carryHp / SG.sg_swarmer.hp)) : 0;
  const list = [{ type: 'sg_swarmer', n: plan.swarm + extra }];
  if (plan.runner) list.push({ type: 'sg_runner', n: plan.runner });
  if (tank) list.push({ type: 'sg_brute', n: tank });
  return { list, total: list.reduce((a, e) => a + e.n, 0), plan };
}
/** spawn points along the raid's seeded bearing (same bearing the abstract sim uses), spread across an arc */
export function spawnPoint(sim, i, R = RAID.spawnR) {
  const a = sim.ang + (((i * 0.6180339) % 1) - 0.5) * 2 * SITE.spawnArc;
  return { x: Math.cos(a) * R, z: Math.sin(a) * R };
}

// ---------------------------------------------------------------------------------------------------------------- buildings
/** damage a building through the sim (hp lives in sim.hp). Returns { hp, wrecked } */
export function hitBuilding(sim, id, dmg) {
  const h = sim.hp.get(id);
  if (h === undefined || !(dmg > 0)) return { hp: h ?? 0, wrecked: false };
  const nh = Math.max(0, h - dmg);
  sim.hp.set(id, nh);
  return { hp: nh, wrecked: nh <= 0 && h > 0 };
}
export function hitCore(sim, S, mul = 1) {
  sim.core = Math.max(0, sim.core - S.hull * SITE.coreHitMul * mul);
  return sim.core;
}
/** what a raider of `type` at (x, z) attacks: the nearest live structure in reach (walls for blobs, machines / towers for the rest) */
export function pickBuildingTarget(sim, type, x, z) {
  const aggro = type === 'sg_boss' ? SITE.bossAggro : type === 'sg_brute' ? SITE.brutesAggro : SITE.aggro;
  let best = null, bd = aggro, bs = 1e9;
  for (const [id, inf] of sim.info) {
    if (!sim.alive(id)) continue;
    const d = BUILDINGS[inf.t];
    if (d.trap) continue;
    const dist = hyp(inf.x - x, inf.z - z) - d.size * 1.2;
    if (dist > bd) continue;
    // preference: blobs like walls, everybody else likes towers, then anything
    const pref = type === 'sg_brute' ? (isWall(inf.t) ? 0 : 3) : (d.tw ? 0 : isWall(inf.t) ? 4 : 2);
    const score = dist + pref * 2.5;
    if (score < bs) { bs = score; best = { id, x: inf.x, z: inf.z, size: d.size, wall: isWall(inf.t) }; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------- towers
const near = (raiders, x, z, range, pred) => {
  let best = null, bd = range;
  for (const r of raiders) { if (r.hp <= 0 || (pred && !pred(r))) continue; const d = hyp(r.x - x, r.z - z); if (d <= bd) { bd = d; best = r; } }
  return best;
};
/** one tower step. Returns shots: [{ t, id, ax, ay, az, hits: [{ id, dmg, slow? }], bx, bz }] (visual + damage list, applied by the caller) */
export function towerStep(sim, tstate, raiders, dt, baseY = 0) {
  const shots = [];
  for (const tw of sim.def.towers) {
    if (!sim.alive(tw.id)) continue;
    let st = tstate.get(tw.id);
    if (!st) tstate.set(tw.id, st = { cd: Math.random() * 0.3 });
    st.cd -= dt;
    const ay = baseY + (SITE.towerH[tw.t] || 2);
    if (tw.t === 'cryo') {   // slow aura + a little damage
      const t0 = near(raiders, tw.x, tw.z, tw.range);
      if (!t0) continue;
      const hits = [];
      for (const r of raiders) if (r.hp > 0 && hyp(r.x - tw.x, r.z - tw.z) <= tw.range) hits.push({ id: r.id, dmg: 0, slow: tw.slow });
      if (st.cd <= 0) { st.cd = SITE.cadence.cryo; hits.find((h) => h.id === t0.id).dmg = tw.dps * SITE.cadence.cryo; shots.push({ t: 'cryo', id: tw.id, ax: tw.x, ay, az: tw.z, bx: t0.x, bz: t0.z, hits }); }
      else shots.push({ t: 'cryo', id: tw.id, hits, quiet: true });
      continue;
    }
    if (st.cd > 0) continue;
    if (tw.t === 'sniper') {
      let best = null;   // strongest in range, never point blank
      for (const r of raiders) { if (r.hp <= 0) continue; const d = hyp(r.x - tw.x, r.z - tw.z); if (d <= tw.range && d >= SITE.sniperMin && (!best || r.hp > best.hp)) best = r; }
      if (!best) { st.cd = 0.25; continue; }
      const dmg = BUILDINGS.sniper.tw.shot[tw.lv - 1] * (tw.dps / BUILDINGS.sniper.tw.dps[tw.lv - 1]);   // heavy shot, scaled by the power ratio
      st.cd = BUILDINGS.sniper.tw.shot[tw.lv - 1] / BUILDINGS.sniper.tw.dps[tw.lv - 1];
      shots.push({ t: 'sniper', id: tw.id, ax: tw.x, ay, az: tw.z, bx: best.x, bz: best.z, hits: [{ id: best.id, dmg }] });
      continue;
    }
    const tgt = near(raiders, tw.x, tw.z, tw.range);
    if (!tgt) { st.cd = 0.2; continue; }
    if (tw.t === 'gun') {
      st.cd = SITE.cadence.gun;
      shots.push({ t: 'gun', id: tw.id, ax: tw.x, ay, az: tw.z, bx: tgt.x, bz: tgt.z, hits: [{ id: tgt.id, dmg: tw.dps * SITE.cadence.gun }] });
    } else if (tw.t === 'flame') {
      st.cd = SITE.cadence.flame;
      const hits = [];
      for (const r of raiders) if (r.hp > 0 && hyp(r.x - tgt.x, r.z - tgt.z) <= SITE.flameSplash) hits.push({ id: r.id, dmg: tw.dps * SITE.cadence.flame });
      shots.push({ t: 'flame', id: tw.id, ax: tw.x, ay, az: tw.z, bx: tgt.x, bz: tgt.z, hits });
    } else if (tw.t === 'tesla') {
      st.cd = SITE.cadence.tesla;
      const hits = [{ id: tgt.id, dmg: tw.dps * SITE.cadence.tesla }], seen = new Set([tgt.id]), arcs = [[tgt.x, tgt.z]];
      let cur = tgt;
      for (let h = 1; h < tw.chain; h++) {
        const nx = near(raiders, cur.x, cur.z, SITE.teslaHop, (r) => !seen.has(r.id));
        if (!nx) break;
        seen.add(nx.id); hits.push({ id: nx.id, dmg: tw.dps * SITE.cadence.tesla * 0.8 }); arcs.push([nx.x, nx.z]); cur = nx;
      }
      shots.push({ t: 'tesla', id: tw.id, ax: tw.x, ay, az: tw.z, bx: tgt.x, bz: tgt.z, hits, arcs });
    }
  }
  return shots;
}

// ---------------------------------------------------------------------------------------------------------------- traps
/** spikes hurt raiders standing on them, mines blow once (charges live in sim.mines). Returns hits [{ id, dmg, blast? { x, z } }] */
export function trapStep(sim, raiders, dt, acc) {
  const hits = [];
  for (const s of sim.def.traps) {
    if (!sim.alive(s.id)) continue;
    if (s.t === 'spikes') {
      for (const r of raiders) if (r.hp > 0 && hyp(r.x - s.x, r.z - s.z) <= 1.9) hits.push({ id: r.id, dmg: s.dps * dt });
    } else if (s.t === 'mines') {
      const ch = sim.mines.get(s.id) || 0;
      if (ch <= 0) continue;
      const trig = raiders.find((r) => r.hp > 0 && hyp(r.x - s.x, r.z - s.z) <= SITE.mineR);
      if (!trig) continue;
      sim.mines.set(s.id, ch - 1);
      const R = BUILDINGS.mines.trap.r;
      for (const r of raiders) if (r.hp > 0 && hyp(r.x - s.x, r.z - s.z) <= R) hits.push({ id: r.id, dmg: s.burst, blast: { x: s.x, z: s.z } });
    }
  }
  void acc;
  return hits;
}

// ---------------------------------------------------------------------------------------------------------------- waves + timers (drives sim.phase / sim.w for the HUD and the result)
/** call when a wave's raiders are all dead: pays the wave reward exactly like the abstract sim and starts the lull */
export function waveCleared(sim, n) {
  sim.killed += n;
  const q = sim.P;
  sim.reward.cr += Math.round(30 * q * (1 + 0.15 * sim.w)); sim.reward.parts += 1 + Math.ceil(sim.w / 2); sim.reward.clout += 1;
  sim.pool = null; sim.phase = 'lull'; sim.timer = RAID.lull + 4;
}
/** the crew arrived: fold an abstract wave in progress into the next real one (carry hp), give the crew time to get ready */
export function enterSite(sim) {
  let carry = 0;
  if (sim.phase === 'wave' && sim.pool) { carry = Math.max(0, sim.pool.hp); sim.w = Math.max(0, sim.w - 1); sim.pool = null; sim.phase = 'prep'; }
  sim.timer = Math.max(sim.timer || 0, SITE.enterPrep);
  sim.site = true;
  return carry;
}
/** the crew left: whatever is still alive folds back into the abstract sim (remaining hp carried, wave re-run) */
export function leaveSite(sim, remainingHp) {
  sim.site = false;
  if (remainingHp > 0) { sim.carry = (sim.carry || 0) + remainingHp; sim.w = Math.max(0, sim.w - 1); }
  sim.pool = null; sim.phase = 'lull'; sim.timer = 2;
}
/** HUD pool for frame(): raiders % = alive hp / wave hp */
export function setPool(sim, alive, total, hp, hp0) { sim.pool = total > 0 ? { n: alive, hp, hp0: Math.max(1, hp0), dps: 0, age: 0, r: RAID.engageR, mined: true } : null; }
export const towerCount = (sim) => sim.def.towers.filter((t) => sim.alive(t.id)).length;
export { cellCenter };
