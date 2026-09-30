// CREATURES11 wave 11 - pure rules of the three "new rule" creatures (docs/wave11/creatures11.md). No THREE / DOM: node-tested.
//   CAPTCHA      doorway gatekeeper. Enter its zone -> 5 s "PROVE YOU ARE HUMAN" tile test (one answerer at a time). Pass = it slides aside for 20 s.
//                Fail / ESC / timeout = alarm (1 s wind-up) -> stun burst + a loud noise that calls the creatures around it.
//   SHADOWBAN    hunts ONE player for 25 s; that player's name tag / pings / voice / chat vanish for the rest of the crew. A teammate touching them lifts it.
//   RECOMMENDER  learns which door each player takes next (routes + relative-turn habits) and ambushes the room it predicts; pattern breaks make it miss.
import { RNG } from '../core/rng.js';

export const IDS = Object.freeze({ captcha: 'c11_captcha', shadowban: 'c11_shadowban', recommender: 'c11_recommender' });
export const ALL_IDS = Object.freeze([IDS.captcha, IDS.shadowban, IDS.recommender]);

export const TUNE = Object.freeze({
  // every timer below that precedes damage / a penalty is a telegraph of >= 0.9 s
  cap: { zone: 2.2, cancelR: 3.8, scan: 0.9, limit: 5, grace: 1.5, pass: 20, closeWarn: 3, alarm: 1.0, alarmT: 0.5, burstR: 9, burstDmg: 12, stun: 1.2, noise: 3.4, reload: 8, slide: 1.7, slideT: 0.8, clear: 1.3, clearMax: 4, retry: 3 },
  ban: { markR: 22, mark: 1.2, dur: 25, soloDur: 12, touch: 1.5, touchT: 0.4, reach: 1.8, hitReach: 2.6, windup: 1.0, attackT: 0.6, cd: 3, off: 3.5, rest: [24, 34], walk: 2.0, run: 3.6, sense: 26 },
  rec: { glow: 2.0, glowMin: 8, glowMax: 18, glowK: 2.6, moveMin: 0.5, wait: 7, trigger: 2.4, windup: 0.9, attackT: 0.6, hitReach: 2.6, dismiss: 1.2, rest: [18, 28], learnMin: 2, share: 0.6, habitMin: 3, habitShare: 0.6, hist: 12, far: 1.2 },
  minQuota: { c11_captcha: 1, c11_shadowban: 2, c11_recommender: 2 },
  spawn: {
    c11_captcha: { zone: 'in', w: [0, 3, 5, 6], interior: { office: 1.3, serverfarm: 1.3, factory: 1.1 } },
    c11_shadowban: { zone: 'in', w: [0, 2, 4, 5], interior: { mansion: 1.2, hospital: 1.2 } },
    c11_recommender: { zone: 'in', w: [0, 2, 4, 5], interior: { office: 1.4, serverfarm: 1.2 } },
  },
});
export const quotaAllows = (id, quotaIndex) => (quotaIndex | 0) >= (TUNE.minQuota[id] ?? 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ CAPTCHA
export const CAP_CATS = Object.freeze(['scrap', 'lights']);
export const CAP_ICONS = Object.freeze({
  scrap: ['cog', 'can', 'pipe', 'bolt'], lights: ['lightR', 'lightY', 'lightG'],
  decoy: ['smile', 'heart', 'cloud', 'bug', 'star', 'coin', 'bus', 'key'],
});
/** one deterministic 3x3 round from an int seed: 3 tiles of the asked category, 6 decoys (the other category joins the decoy pool). tiles[i] = {icon, ok} */
export function captchaRound(seed) {
  const r = new RNG(seed >>> 0 || 1);
  const cat = CAP_CATS[r.int(0, CAP_CATS.length - 1)];
  const other = CAP_CATS.find((c) => c !== cat);
  const good = r.shuffle(CAP_ICONS[cat].slice()).slice(0, 3);
  const bad = r.shuffle([...CAP_ICONS.decoy, ...CAP_ICONS[other]]).slice(0, 6);
  const tiles = r.shuffle([...good.map((icon) => ({ icon, ok: 1 })), ...bad.map((icon) => ({ icon, ok: 0 }))]);
  return { cat, tiles, answer: tiles.flatMap((t, i) => (t.ok ? [i] : [])) };
}
/** picks = tile indices (any order); exactly the 3 right tiles */
export function checkPicks(round, picks) {
  if (!round || !Array.isArray(picks)) return false;
  const set = new Set(picks.map((v) => v | 0));
  return set.size === round.answer.length && round.answer.every((i) => set.has(i));
}
/** seconds left of a running test (0 = expired); `slack` is the network grace the host adds */
export const capLeft = (t, limit = TUNE.cap.limit) => Math.max(0, limit - t);

/**
 * Where the gatekeeper stands: an unlocked doorway (arches first) whose centre lies within 2.6 m of the route entrance -> target and 20..85 % along it.
 * layout: { ox, oz, cell, cells, edgeInfo: Map, distOf? }; route: [{x, z}] polyline (nav path); r: () => [0,1). Returns the edge info or null.
 */
export function pickGate(layout, route, r = Math.random, avoid = null) {
  const cand = [];
  const at = (i) => layout.cells?.[i] > 0;
  const total = routeLen(route);
  for (const info of layout.edgeInfo?.values?.() || []) {
    if ((info.type !== 'arch' && info.type !== 'door') || info.locked || info.treasure || info.arena || info.a < 0 || info.b < 0 || !at(info.a) || !at(info.b)) continue;
    const p = doorCenter(layout, info);
    if (avoid && Math.hypot(p.x - avoid.x, p.z - avoid.z) < 12) continue;
    let w = info.type === 'arch' ? 3 : 1;
    if (route && route.length > 1 && total > 8) {
      const q = nearestOnRoute(route, p);
      if (q.d > 2.6 || q.s / total < 0.2 || q.s / total > 0.85) continue;
      w *= 2;
    } else w *= 0.5;
    cand.push({ info, w });
  }
  if (!cand.length) return null;
  let sum = 0; for (const c of cand) sum += c.w;
  let x = r() * sum;
  for (const c of cand) { x -= c.w; if (x <= 0) return c.info; }
  return cand[cand.length - 1].info;
}
export const doorCenter = (L, info) => ({ x: L.ox + info.cx * L.cell, z: L.oz + info.cz * L.cell });
/** unit normal of a doorway (dir 0 = the door plane faces +x, dir 1 = +z) */
export const doorNormal = (info) => (info.dir === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 });
function routeLen(route) { let s = 0; for (let i = 1; i < (route?.length || 0); i++) s += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z); return s; }
/** nearest point of a polyline: { d: distance, s: length along the route } */
export function nearestOnRoute(route, p) {
  let best = { d: 1e9, s: 0 }, acc = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    const u = l2 > 1e-9 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2, 0, 1) : 0;
    const d = Math.hypot(p.x - (a.x + dx * u), p.z - (a.z + dz * u));
    if (d < best.d) best = { d, s: acc + l * u };
    acc += l;
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ SHADOWBAN
/** the ban record: { id: player, left: s, touch: s of continuous teammate contact, cid: creature id } */
export const newBan = (id, cid, solo = false) => ({ id, cid, left: solo ? TUNE.ban.soloDur : TUNE.ban.dur, touch: 0 });
/** one host tick: returns 'lift' (a teammate touched them), 'end' (time is up) or null. touching = a living crewmate within TUNE.ban.touch */
export function banStep(b, dt, touching) {
  b.left -= dt;
  b.touch = touching ? b.touch + dt : Math.max(0, b.touch - dt * 2);
  if (b.touch >= TUNE.ban.touchT) return 'lift';
  return b.left <= 0 ? 'end' : null;
}
/** the isolated one: the player farthest from any crewmate (a lone wolf); ties / solo -> the nearest to `from`. players: [{id, pos:{x,z}}] */
export function pickBanTarget(players, from) {
  if (!players.length) return null;
  let best = null, bs = -1;
  for (const p of players) {
    let near = 1e9;
    for (const q of players) if (q !== p) near = Math.min(near, Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z));
    const s = players.length > 1 ? near : 0;
    const dd = from ? Math.hypot(p.pos.x - from.x, p.pos.z - from.z) : 0;
    const score = s - dd * 0.15;
    if (score > bs) { bs = score; best = p; }
  }
  return best;
}
