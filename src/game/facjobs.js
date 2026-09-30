// FACILITY JOBS (wave 8, module 'facjobs'; docs/wave8/facjobs.md). Every landing on a regular moon rolls ONE main job + 0-1 side job (pure roll in
// facjobs_core.js, shown on the terminal (JOBS) and the landing card before touchdown) and a layout archetype (world/facility_arch.js). Jobs:
//   power   3 fuses -> breaker panel (lights on: +loot, but a wave wakes up)     core    carry the heavy server core to the ship
//   feed    hold a camera-room panel for 20 s (cut the Algorithm feed)            drone   escort a Company drone along the facility path
//   vault   3 clue notes -> a 3-digit code -> vault panel                          rescue  carry a stranded contractor to the ship
//   sample  5 glowing samples to the ship (DRG style, partial pay)                photo   Instant Camera photo of an anomaly (camera_item.js)
// Reward: credits (run) + Clout / XP (per player) + a guaranteed loot crate (tier per job) on full completion; partial work pays 70 % of its share
// (>= 25 %); a main job ending at takeoff with no progress costs a small fee. No new permanent HUD widget: the objectives list carries the lines.
//
// Net (prefix 'fj'): 'fjreq' client -> host {op:'fuse'|'feed'|'code'|'photo', ...}; 'fjfx' host -> everyone {k:'pay'|'msg'|'bad', ...}; 'fjd' host -> everyone
// (drone position). Job state = game.run.fj (host-authoritative, auto-synced by broadcastRun): { day, arch, j: [{ id, sl:'m'|'s', st:0|1|2, p, n, pos, ex, pd }] }.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { ITEMS, registerItem } from './items.js';
import { MOONS } from './moons.js';
import { LAB_IDS } from './labyrinths_core.js';   // [labyrinths]
import { insideShip } from '../world/ship.js';
import { fallbackChestLoot } from './chests.js';
import * as C from './facjobs_core.js';
import './facjobs_i18n.js';

HOST_ONLY.add('fjfx'); HOST_ONLY.add('fjd');

// literal keys so tools/i18n_audit.mjs sees them
const TITLE = { power: 'RESTORE POWER', core: 'EXTRACT THE SERVER CORE', feed: 'CUT THE ALGORITHM FEED', drone: 'ESCORT THE COMPANY DRONE', vault: 'CRACK THE VAULT', rescue: 'RESCUE THE CONTRACTOR', sample: 'COLLECT SAMPLES', photo: 'PHOTOGRAPH THE ANOMALY' };
const BRIEF = {
  power: 'Find 3 fuses and slot them into the breaker panel. Lights on means richer halls, and louder ones.',
  core: 'Carry the core to the ship. It takes both hands and slows you down. Share the load.',
  feed: 'Reach the camera room and cut the feed. Stay near the panel until it is done.',
  drone: 'Guide the drone to the far dock. It only moves while you are close, and creatures hurt it.',
  vault: 'Notes around the maze hold the 3-digit code. Read them all, then use the vault panel.',
  rescue: 'A contractor is stranded inside. Carry them to the ship.',
  sample: 'Bring {n} glowing samples back to the ship.',
  photo: 'Photograph the anomaly with an Instant Camera. The Algorithm pays for content.',
};
const STAGE = { power: 'Find the fuses and the breaker panel', core: 'Bring the core to the ship', feed: 'Find the camera room panel', drone: 'Follow the drone, keep it alive', vault: 'Find the notes, then the vault panel', rescue: 'Bring the contractor to the ship', sample: 'Bring samples to the ship: {a} / {n}', photo: 'Find and photograph the anomaly' };
const ARCH_NAME = { atrium: 'Atrium', ring: 'Ring', catacomb: 'Catacomb' };
const ARCH_DESC = { atrium: 'A central atrium with long spokes.', ring: 'A ring corridor with cross shortcuts.', catacomb: 'Dead ends and mazes, few loops.' };
const CRATE = { wood: 'wooden crate', iron: 'iron crate', gold: 'gold crate' };

const V3 = THREE.Vector3;
const ITEM_DEFS = [
  { id: 'fj_fuse', name: 'Fuse', kind: 'tool', weight: 2, hands: 1, tip: 'A breaker fuse. It hums faintly.' },
  { id: 'fj_sample', name: 'Sample', kind: 'tool', weight: 1, hands: 1, tip: 'A glowing sample vial. Deliver it to the ship.' },
  { id: 'fj_core', name: 'Server Core', kind: 'scrap', value: [120, 170], weight: 38, hands: 2, tier: 'epic', tip: 'Heavy and warm. The Company wants it back.' },
  { id: 'fj_contractor', name: 'Stranded Contractor', kind: 'tool', weight: 22, hands: 2, tip: 'He mumbles: "is the quota met?"' },
];

export function installFacjobs(game) {
  const mods = game.mods;
  const offs = [];
  let disposed = false, tickT = 0, droneT = 0;
  const S = { key: '', fac: null, meshes: [], clues: new Map(), ui: null, drone: null, dTarget: new V3(), briefKey: '' };
  const mem = { drone: null, ids: {} };   // host-only runtime (item ids, drone path)
  const run = () => game.run;
  const host = () => !!game.isHost;
  const fj = () => run()?.fj || null;
  const fac = () => game.world?.facility || null;
  const toast = (text, kind = 'info') => { try { game.ui?.hud?.toast?.(text, kind); } catch { /* hud optional */ } };
  const bcast = () => { try { game.broadcastRun?.(['fj']); } catch { /* net closing */ } };
  const fx = (d) => { try { game.net.broadcast('fjfx', d); } catch { /* net closing */ } };
  const title = (id) => t(TITLE[id]);

  // ------------------------------------------------------------------------------------------ items (registered once, idempotent)
  const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const bas = (c) => new THREE.MeshBasicMaterial({ color: c });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); return q; };
  const MODELS = {
    fj_fuse: () => { const g = new THREE.Group(); g.add(box(0.05, 0.16, 0.05, mat(0xe8d9a0))); g.add(box(0.06, 0.03, 0.06, mat(0x9a9a9a), 0, 0.09, 0)); g.add(box(0.06, 0.03, 0.06, mat(0x9a9a9a), 0, -0.09, 0)); return g; },
    fj_sample: () => { const g = new THREE.Group(); g.add(box(0.05, 0.16, 0.05, bas(0x8aff5a))); g.add(box(0.07, 0.03, 0.07, mat(0x333333), 0, 0.095, 0)); return g; },
    fj_core: () => { const g = new THREE.Group(); g.add(box(0.5, 0.36, 0.36, mat(0x23262c))); g.add(box(0.52, 0.04, 0.38, bas(0x4aa8ff), 0, 0.1, 0)); g.add(box(0.52, 0.04, 0.38, bas(0x4aa8ff), 0, -0.1, 0)); return g; },
    fj_contractor: () => { const g = new THREE.Group(); g.add(box(0.55, 0.28, 0.32, mat(0xd9822b), 0.15, 0, 0)); g.add(box(0.3, 0.26, 0.26, mat(0xe0b48a), -0.28, 0, 0)); g.add(box(0.5, 0.2, 0.28, mat(0x2a3f66), 0.55, 0, 0)); return g; },
  };
  for (const d of ITEM_DEFS) {
    try { registerItem({ ...d }); window.__kefalMods?.itemModels?.set(d.id, () => MODELS[d.id]()); } catch (e) { console.warn('[facjobs] item', d.id, e); }
  }

  // ------------------------------------------------------------------------------------------ text helpers
  const nOf = (j) => j.n;
  const pctJob = (j) => j.n === 100;
  const lineOf = (j) => {
    const stage = j.id === 'sample' ? tf(STAGE.sample, { a: j.p, n: j.n }) : t(STAGE[j.id]);
    const head = tf(j.sl === 'm' ? 'JOB {job}: {p} / {n}' : 'SIDE {job}: {p} / {n}', { job: title(j.id), p: pctJob(j) ? Math.round(j.p) + '%' : j.p, n: pctJob(j) ? '100%' : nOf(j) });
    return { head, stage };
  };
  function rewardText(id, sl, qi) {
    const r = C.payout(id, 1, qi, sl === 's');
    return tf('Reward: ▮{cr} + ◈{cl} + a {crate}', { cr: r.cr, cl: r.cl, crate: t(CRATE[r.crate || 'wood']) });
  }

  // ------------------------------------------------------------------------------------------ host: setup on populate
  function jobOf(sl) { return (fj()?.j || []).find((j) => j.sl === sl); }
  function activeJobs() { return (fj()?.j || []).filter((j) => j.st === 0); }
  function spawnItem(type, p, dy = 0.45, opts = {}) { try { return game.items.hostSpawn(type, new V3(p.x, p.y + dy, p.z), opts); } catch (e) { console.warn('[facjobs] spawn', type, e); return null; } }
  const r2 = (n) => Math.round(n * 100) / 100;
  const P3 = (s, dy = 0) => [r2(s.x), r2(s.y + dy), r2(s.z)];

  function hostSetup() {
    const r = run();
    if (!host() || !r) return;
    mem.drone = null; mem.ids = {};
    const moon = MOONS[r.moon], F = fac();
    if (!C.jobMoon(moon) || !F || game.onboard?.fr?.calm?.('facjobs')) { if (r.fj) { r.fj = null; bcast(); } return; }   // [firstrun] the first landing has ONE goal: no facility job / fee before the first sale
    const roll = C.rollJobs(r.runId ?? 'x', r.day ?? 1, r.moon, r.quotaIndex | 0);
    const rng = new RNG((r.seed ^ 0xfa11) >>> 0);
    const floor = (F.scrapSpots || []).filter((s) => !s.elevated && !s.sealed && s.room >= 0);
    const bigs = (F.bigSpots || []).length >= 2 ? F.bigSpots : floor;
    const used = [];
    const take = (list, n, { deep = false, minDist = 0, sep = 7 } = {}) => {
      const base = list.filter((s) => (s.dist || 0) >= minDist);
      let pool = base.length ? base : list;
      if (deep) { const sorted = pool.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0)); pool = sorted.slice(0, Math.max(n, Math.ceil(sorted.length * 0.4))); }
      const got = C.pickSpots(pool, n, rng, { sep, used });
      used.push(...got);
      return got;
    };
    const jobs = [];
    const make = (id, sl) => {
      const J = C.JOBS[id], n = sl === 's' && id === 'sample' ? 3 : J.n;
      const j = { id, sl, st: 0, p: 0, n, pos: [0, 0, 0], ex: {}, pd: 0 };
      try {
        if (id === 'power') {
          const [panel] = take(bigs, 1, { deep: true }); if (!panel) return null;
          j.pos = P3(panel);
          mem.ids[sl] = take(floor, 3, { sep: 6 }).map((s) => spawnItem('fj_fuse', s));
        } else if (id === 'core') {
          const [s] = take(bigs, 1, { deep: true }); if (!s) return null;
          j.pos = P3(s); mem.ids[sl] = spawnItem('fj_core', s, 0.6);
        } else if (id === 'feed') {
          const [s] = take(bigs, 1, { deep: true }); if (!s) return null;
          j.pos = P3(s); j.ex = { on: 0 };
        } else if (id === 'drone') {
          const L = F.layout, dock = take(bigs, 1, { deep: true })[0]; if (!dock) return null;
          const from = L.idx(L.entrance.room.cx, L.entrance.room.cz);
          const to = L.idx(Math.floor((dock.x - L.ox) / L.cell), Math.floor((dock.z - L.oz) / L.cell));
          const path = C.cellPath(L, from, to); if (!path || path.length < 2) return null;
          const y = L.y + 1.5;
          let total = 0; for (let k = 1; k < path.length; k++) total += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
          mem.drone = { path, k: 1, x: path[0][0], y, z: path[0][1], hp: C.DRONE_HP, total, done: 0, sendT: 0 };
          j.pos = [r2(path[path.length - 1][0]), r2(L.y), r2(path[path.length - 1][1])];
          j.ex = { hp: C.DRONE_HP };
        } else if (id === 'vault') {
          const [panel] = take(bigs, 1, { deep: true }); if (!panel) return null;
          const notes = take(floor, C.CODE_LEN, { sep: 8, minDist: 3 });
          j.pos = P3(panel); j.ex = { cd: C.vaultCode(r.seed), nt: notes.map((s) => P3(s)) };
        } else if (id === 'rescue') {
          const [s] = take(floor, 1, { deep: true }); if (!s) return null;
          j.pos = P3(s); mem.ids[sl] = spawnItem('fj_contractor', s, 0.5);
        } else if (id === 'sample') {
          const got = take(floor, n, { sep: 6, minDist: 4 }); if (!got.length) return null;
          j.pos = P3(got[0]); mem.ids[sl] = got.map((s) => spawnItem('fj_sample', s));
        } else if (id === 'photo') {
          const [s] = take(floor, 1, { deep: true, minDist: 4 }); if (!s) return null;
          j.pos = P3(s); const d = F.mainDoor?.spawn;
          if (ITEMS.instacam && d) spawnItem('instacam', { x: d.x + 1.2, y: d.y, z: d.z + 0.6 }, 0.4);   // job kit: a camera by the door
        }
      } catch (e) { console.warn('[facjobs] setup', id, e); return null; }
      return j;
    };
    const m = make(roll.main, 'm');
    if (m) jobs.push(m);
    else { const fb = make('sample', 'm'); if (fb) jobs.push(fb); }
    if (roll.side && jobs.length) { const s = make(roll.side, 's'); if (s) jobs.push(s); }
    r.fj = jobs.length ? { day: r.day ?? 1, arch: roll.arch, j: jobs } : null;
    bcast();
  }

  // ------------------------------------------------------------------------------------------ host: progress + payout
  function itemsInShip(type) {
    let n = 0;
    const players = game.aiPlayers?.() || [];
    for (const it of game.items.all()) {
      if (it.type !== type) continue;
      if (it.state === 'world') { if (insideShip(it.obj.position)) n++; } else if (it.holder && players.find((p) => p.id === it.holder)?.inShip) n++;
    }
    return n;
  }
  function pay(j, frac, why) {
    const r = run();
    if (j.pd) return;
    j.pd = 1;
    const P = C.payout(j.id, frac, r.quotaIndex | 0, j.sl === 's');
    let fee = 0;
    if (!P.cr && !P.cl && j.sl === 'm' && why === 'takeoff' && frac <= 0) fee = Math.min(C.FAIL_FEE, Math.max(0, r.credits | 0));
    if (P.cr || fee) { r.credits = Math.max(0, (r.credits | 0) + P.cr - fee); try { game.broadcastRun(['credits']); } catch { /* ignore */ } }
    fx({ k: 'pay', j: j.id, sl: j.sl, cr: P.cr, cl: P.cl, full: frac >= 1 ? 1 : 0, fee });
    if (P.crate) crate(j, P.crate);
  }
  function crate(j, tier) {
    const rng = new RNG(((run().seed | 0) ^ (j.sl === 'm' ? 0xc4a7e : 0xc4a7f)) >>> 0);
    let list = null;
    try { list = game.crafting?.rollChestLoot?.(tier, rng); } catch { /* fallback below */ }
    if (Array.isArray(list)) list = list.filter((e) => e && ITEMS[e.type]);
    if (!Array.isArray(list) || !list.length) list = fallbackChestLoot(tier, rng);
    const p = j.pos;
    list.forEach((e, i) => {   // the crate bursts open around the job site
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      spawnItem(e.type, { x: p[0] + Math.cos(a) * 0.7, y: p[1], z: p[2] + Math.sin(a) * 0.7 }, 1.0, { tier: e.tier, linvel: [Math.cos(a) * 1.5, 2.5, Math.sin(a) * 1.5] });
    });
  }
  function complete(j) {
    if (j.st !== 0) return;
    j.st = 1; j.p = j.n;
    pay(j, 1, 'done');
    if (j.id === 'power') {   // the grid comes back: a little extra loot around the panel, and the halls notice
      const p = j.pos;
      for (let i = 0; i < 4; i++) { try { game.hostSpawnRandomScrap?.(new V3(p[0] + Math.cos(i * 1.6) * 1.6, p[1] + 0.5, p[2] + Math.sin(i * 1.6) * 1.6)); } catch { /* optional */ } }
      try { game.hostSpawnWave?.(0); } catch { /* optional */ }
      fx({ k: 'msg', m: 'The grid hums back to life. The halls wake up too.', kind: 'warn' });
    } else if (j.id === 'feed') fx({ k: 'msg', m: 'Feed cut. The Algorithm is blind for a while.', kind: 'good' });
    else if (j.id === 'vault') fx({ k: 'msg', m: 'The vault opens.', kind: 'good' });
    else if (j.id === 'photo') fx({ k: 'msg', m: 'The photo is on the feed. The Algorithm is delighted.', kind: 'good' });
    else if (j.id === 'drone') fx({ k: 'msg', m: 'The drone reached the dock.', kind: 'good' });
    fx({ k: 'msg', m: 'The Company drops a crate of supplies for the crew.', kind: 'info' });
    bcast();
  }
  function failJob(j, msg, v) { if (j.st !== 0) return; j.st = 2; if (msg) fx({ k: 'msg', m: msg, v, kind: 'bad' }); bcast(); }
  const near = (from, pos, d) => { const p = (game.aiPlayers?.() || []).find((q) => q.id === from); return !!p && !p.dead && Math.hypot(p.pos.x - pos[0], p.pos.z - pos[2]) <= d && Math.abs(p.pos.y - pos[1]) < 5; };

  function hostReq(d, from) {
    if (!host() || !d || !fj() || run().phase !== 'moon') return;
    if (d.op === 'fuse') {
      const j = activeJobs().find((q) => q.id === 'power'); const it = j && game.items.items?.get?.(String(d.id));
      if (!j || !it || it.type !== 'fj_fuse' || it.holder !== from || !near(from, j.pos, 5)) return;
      try { game.net.broadcast('it', { e: 'rm', id: it.id }); } catch { /* ignore */ }
      j.p = Math.min(j.n, j.p + 1);
      fx({ k: 'msg', m: 'Fuse installed', kind: 'good' });
      if (j.p >= j.n) complete(j); else bcast();
    } else if (d.op === 'feed') {
      const j = activeJobs().find((q) => q.id === 'feed');
      if (j && !j.ex.on && near(from, j.pos, 5)) { j.ex.on = 1; bcast(); }
    } else if (d.op === 'code') {
      const j = activeJobs().find((q) => q.id === 'vault');
      if (!j || !near(from, j.pos, 5)) return;
      if (String(d.c) === j.ex.cd) complete(j); else { try { game.net.sendTo(from, 'fjfx', { k: 'bad' }); } catch { /* ignore */ } }
    } else if (d.op === 'photo') {
      const j = activeJobs().find((q) => q.id === 'photo');
      if (j && near(from, j.pos, 16)) complete(j);
    }
  }

  function hostTick(dt) {
    const r = run(), list = activeJobs();
    if (!list.length) return;
    const players = (game.aiPlayers?.() || []).filter((p) => !p.dead && p.zone === 'in');
    let dirty = false;
    for (const j of list) {
      if (j.id === 'core' || j.id === 'rescue') {
        const id = mem.ids[j.sl], type = j.id === 'core' ? 'fj_core' : 'fj_contractor';
        if (id && !game.items.items?.get?.(id)) { failJob(j, 'Job failed: {job}', { job: title(j.id) }); continue; }
        if (itemsInShip(type) > 0) complete(j);
      } else if (j.id === 'sample') {
        const p = Math.min(j.n, itemsInShip('fj_sample'));
        if (p !== j.p) { j.p = p; dirty = true; }
        if (p >= j.n) complete(j);
      } else if (j.id === 'feed' && j.ex.on) {
        const here = players.filter((p) => Math.hypot(p.pos.x - j.pos[0], p.pos.z - j.pos[2]) <= 9).length;
        if (here) { j.p = Math.min(100, j.p + dt * (100 / C.FEED_SECONDS) * (here > 1 ? 1.5 : 1)); dirty = true; if (j.p >= 100) complete(j); }
      }
    }
    void r;
    if (dirty) bcast();
  }

  function droneTick(dt) {
    const j = activeJobs().find((q) => q.id === 'drone'), D = mem.drone;
    if (!j || !D) return;
    const near = (game.aiPlayers?.() || []).some((p) => !p.dead && p.zone === 'in' && Math.hypot(p.pos.x - D.x, p.pos.z - D.z) <= C.DRONE_FOLLOW);
    if (near && D.k < D.path.length) {
      const tx = D.path[D.k][0], tz = D.path[D.k][1], dx = tx - D.x, dz = tz - D.z, dist = Math.hypot(dx, dz), step = Math.min(dist, C.DRONE_SPEED * dt);
      if (dist > 1e-3) { D.x += (dx / dist) * step; D.z += (dz / dist) * step; D.done += step; }
      if (dist - step < 0.05) D.k++;
    }
    let hit = false;
    for (const c of game.creatures?.host?.values?.() || []) {
      if (c.dead || c.def?.boss || !c.pos) continue;
      if (Math.hypot(c.pos.x - D.x, c.pos.z - D.z) < 3 && Math.abs(c.pos.y - D.y) < 3.5) { hit = true; break; }
    }
    if (hit) { D.hp = Math.max(0, D.hp - 7 * dt); if (!D.warned || D.warned < game.time - 8) { D.warned = game.time; fx({ k: 'msg', m: 'The drone is under attack!', kind: 'warn' }); } }
    const p = Math.min(100, Math.round((D.done / Math.max(1, D.total)) * 100));
    D.sendT -= dt;
    if (D.sendT <= 0) { D.sendT = 0.3; try { game.net.broadcast('fjd', { x: D.x, y: D.y, z: D.z, hp: Math.round(D.hp) }); } catch { /* ignore */ } }
    if (p !== j.p) { j.p = p; bcast(); }
    if (D.hp <= 0) failJob(j, 'The drone is destroyed.');
    else if (D.k >= D.path.length) complete(j);
  }

  function hostTakeoff() {
    const f = fj();
    if (!f) return;
    for (const j of f.j) if (!j.pd) pay(j, j.st === 1 ? 1 : j.p / j.n, 'takeoff');
    bcast();
  }

  // ------------------------------------------------------------------------------------------ client: effects
  function onFx(d) {
    if (disposed || !d) return;
    if (d.k === 'msg') toast(d.v ? tf(d.m, d.v) : t(d.m), d.kind || 'info');
    else if (d.k === 'bad') toast(t('Wrong code.'), 'bad');
    else if (d.k === 'pay') {
      const ttl = title(d.j);
      if (d.fee) toast(tf('Job failed: {job} (-▮{fee})', { job: ttl, fee: d.fee }), 'bad');
      else if (d.cr || d.cl) {
        toast(tf(d.full ? 'Job complete: {job} (+▮{cr}, +◈{cl})' : 'Job partly done: {job} (+▮{cr}, +◈{cl})', { job: ttl, cr: d.cr, cl: d.cl }), 'good');
        try { if (d.cl) game.progress?.addCoins?.(d.cl, 'Facility job'); game.progress?.addXp?.(Math.round((d.cr || 0) / 4), 'Facility job'); } catch { /* progress optional */ }
      } else if (d.sl === 'm') toast(tf('Job failed: {job}', { job: ttl }), 'bad');
    }
  }
  function onDrone(d) {
    if (!d) return;
    S.dTarget.set(d.x, d.y, d.z); S.dHave = true;
    if (S.drone && !S.drone.visible) { S.drone.position.copy(S.dTarget); S.drone.visible = true; }
  }

  // ------------------------------------------------------------------------------------------ client: props (panels, notes, anomaly, drone)
  const G = { box: new THREE.BoxGeometry(1, 1, 1), oct: new THREE.OctahedronGeometry(0.22) };
  function clearProps() {
    for (const m of S.meshes) { m.parent?.remove(m); }
    S.meshes = [];
    if (S.drone) { S.drone.parent?.remove(S.drone); S.drone = null; }
  }
  function panelMesh(color, done) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(G.box, mat(0x2a2f36)); body.scale.set(0.8, 1.2, 0.4); body.position.y = 0.6; g.add(body);
    const screen = new THREE.Mesh(G.box, bas(done ? 0x59ff8a : color)); screen.scale.set(0.6, 0.4, 0.05); screen.position.set(0, 0.85, 0.21); g.add(screen);
    const gem = new THREE.Mesh(G.oct, bas(done ? 0x59ff8a : color)); gem.position.y = 1.7; gem.name = 'spin'; g.add(gem);
    return g;
  }
  function buildProps() {
    const f = fj(), F = fac(), r = run();
    const key = f && F && r?.phase === 'moon' ? `${r.seed}:${f.j.map((j) => j.id + j.st).join(',')}` : '';
    if (key === S.key && F === S.fac) return;
    clearProps();
    S.key = key; S.fac = F;
    if (!key) return;
    const add = (o, p, ry = 0) => { o.position.set(p[0], p[1], p[2]); o.rotation.y = ry; F.group.add(o); S.meshes.push(o); };
    for (const j of f.j) {
      const color = C.JOBS[j.id].color, done = j.st === 1;
      if (j.id === 'power' || j.id === 'feed' || j.id === 'vault') add(panelMesh(color, done), j.pos, ((j.pos[0] * 7 + j.pos[2] * 3) % 4) * (Math.PI / 2));
      if (j.id === 'vault') j.ex.nt.forEach((p, i) => { const n = new THREE.Mesh(G.box, bas(0xfff2b0)); n.scale.set(0.28, 0.01, 0.36); add(n, [p[0], p[1] + 0.01, p[2]], i * 1.1); });
      if (j.id === 'photo' && !done) {
        const g = new THREE.Group();
        const ped = new THREE.Mesh(G.box, mat(0x3a3340)); ped.scale.set(0.5, 0.5, 0.5); ped.position.y = 0.25; g.add(ped);
        const cube = new THREE.Mesh(G.box, bas(color)); cube.scale.set(0.32, 0.32, 0.32); cube.position.y = 0.85; cube.name = 'spin'; g.add(cube);
        add(g, j.pos);
      }
    }
    const dj = f.j.find((j) => j.id === 'drone' && j.st === 0);
    if (dj) {   // the drone: a hovering body + fin; follows the host position message
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(0xdfe6ea)));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 14), bas(C.JOBS.drone.color)); ring.rotation.x = Math.PI / 2; g.add(ring);
      g.position.copy(S.dTarget); g.visible = !!S.dHave;   // hidden until the first host position arrives
      F.group.add(g); S.drone = g;
    }
  }
  function animateProps(dt) {
    for (const m of S.meshes) { const s = m.getObjectByName('spin'); if (s) s.rotation.y += dt * 1.6; }
    if (S.drone) {
      S.drone.position.lerp(S.dTarget, Math.min(1, dt * 4));
      S.drone.position.y = S.dTarget.y + Math.sin(game.time * 2) * 0.06;
    }
  }

  // ------------------------------------------------------------------------------------------ client: vault code entry (keyboard only)
  function closeCode() { if (S.ui) { window.removeEventListener('keydown', S.ui.key, true); S.ui.el.remove(); S.ui = null; } }
  function openCode() {
    if (S.ui) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);z-index:60;padding:14px 22px;background:rgba(10,12,16,.92);border:1px solid #d9b45a;color:#f3e6b8;font:600 15px/1.4 ui-monospace,Consolas,monospace;text-align:center;min-width:220px';
    const ttl = document.createElement('div'); ttl.textContent = t('VAULT CODE'); ttl.style.cssText = 'font-size:12px;letter-spacing:.18em;color:#d9b45a';
    const val = document.createElement('div'); val.style.cssText = 'font-size:28px;letter-spacing:.35em;margin:6px 0';
    const hint = document.createElement('div'); hint.textContent = `[Enter] ${t('ENTER')}   [Esc] ${t('CLOSE')}`; hint.style.cssText = 'font-size:11px;opacity:.7';
    el.append(ttl, val, hint); document.body.appendChild(el);
    let buf = '';
    const known = () => activeJobs().some((j) => j.id === 'vault');
    const draw = () => { let s = ''; for (let i = 0; i < C.CODE_LEN; i++) s += (buf[i] ?? (S.clues.has(i) ? '·' : '_')) + ' '; val.textContent = s.trim(); };
    const key = (e) => {
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.key === 'Escape') { closeCode(); return; }
      if (e.key === 'Enter') { if (buf.length === C.CODE_LEN && known()) { try { game.net.request('fjreq', { op: 'code', c: buf }); } catch { /* net closing */ } buf = ''; closeCode(); } return; }
      if (e.key === 'Backspace') buf = buf.slice(0, -1);
      else if (/^[0-9]$/.test(e.key) && buf.length < C.CODE_LEN) buf += e.key;
      draw();
    };
    window.addEventListener('keydown', key, true);
    S.ui = { el, key }; draw();
  }

  // ------------------------------------------------------------------------------------------ hooks
  const inFac = () => { const p = game.player; return !!p && !p.dead && run()?.phase === 'moon' && !!fac() && !!p.indoor; };
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || !fj() || !inFac()) return;
    const pp = game.player.pos, req = (d) => { try { game.net.request('fjreq', d); } catch { /* net closing */ } };
    const far = (p, d) => Math.hypot(pp.x - p[0], pp.z - p[2]) > d || Math.abs(pp.y - p[1]) > 4;
    for (const j of activeJobs()) {
      if (j.id === 'power' && !far(j.pos, 6)) {
        out.push({ pos: new V3(j.pos[0], j.pos[1] + 1.0, j.pos[2]), r: 1.0, reach: 2.6,
          label: () => { const h = game.player?.heldItem?.(); return h?.type === 'fj_fuse' ? t('Slot the fuse [E]') : tf('Breaker panel: {a}/{n} fuses [E]', { a: j.p, n: j.n }); },
          sub: () => t('Hold a fuse and use the panel.'),
          action: () => { const h = game.player?.heldItem?.(); if (h?.type === 'fj_fuse') req({ op: 'fuse', id: h.id }); else toast(t('Hold a fuse and use the panel.'), 'warn'); } });
      } else if (j.id === 'feed' && !far(j.pos, 6)) {
        out.push({ pos: new V3(j.pos[0], j.pos[1] + 0.9, j.pos[2]), r: 1.0, reach: 2.6,
          label: () => (j.ex.on ? tf('Feed splitter: {p}%', { p: Math.round(j.p) }) : t('Feed splitter: cut the feed [E]')),
          sub: () => t('Stay near the splitter or the cut stalls.'),
          action: () => { if (!j.ex.on) req({ op: 'feed' }); else toast(t('Stay near the splitter or the cut stalls.'), 'warn'); } });
      } else if (j.id === 'vault') {
        if (!far(j.pos, 6)) out.push({ pos: new V3(j.pos[0], j.pos[1] + 1.0, j.pos[2]), r: 1.0, reach: 2.6, label: () => t('Vault panel: enter the code [E]'), sub: () => { const c = codeText(j); return c ? tf('Code: {c}', { c }) : ''; }, action: () => openCode() });
        j.ex.nt.forEach((p, i) => { if (!far(p, 4)) out.push({ pos: new V3(p[0], p[1] + 0.1, p[2]), r: 0.7, reach: 2.2, label: () => t('Read the note [E]'), action: () => { S.clues.set(i, j.ex.cd[i]); toast(tf('Note: digit {i} of the code is {d}', { i: i + 1, d: j.ex.cd[i] }), 'info'); } }); });
      }
    }
  }));
  function codeText(j) { if (!S.clues.size) return ''; let s = ''; for (let i = 0; i < C.CODE_LEN; i++) s += (S.clues.get(i) ?? '_') + ' '; return s.trim(); }

  offs.push(mods.on('useItem', (it, hk, g) => {   // photograph the anomaly (Instant Camera; camera_item.js handles the flash / polaroid)
    if (g !== game || disposed || !it || it.type !== 'instacam' || !fj()) return;
    const j = activeJobs().find((q) => q.id === 'photo'); if (!j || !inFac()) return;
    const cam = game.camera; if (!cam) return;
    const tgt = new V3(j.pos[0], j.pos[1] + 0.85, j.pos[2]), to = tgt.clone().sub(cam.position), dist = to.length();
    const fwd = new V3(); cam.getWorldDirection(fwd);
    if (dist > 40 || to.normalize().dot(fwd) < 0.82) return;
    if (dist > 14) { toast(t('Get closer to the anomaly.'), 'warn'); return; }
    try { game.net.request('fjreq', { op: 'photo' }); } catch { /* net closing */ }
  }));

  offs.push(mods.on('objectives', (add, g, phase) => {
    if (g !== game || disposed) return;
    const r = run();
    if (phase === 'orbit') {
      const moon = MOONS[r.moon];
      if (!C.jobMoon(moon)) return;
      const roll = C.rollJobs(r.runId ?? 'x', r.day ?? 1, r.moon, r.quotaIndex | 0);
      add(tf('Job: {job}', { job: title(roll.main) }), 'hint');
      add(t("Terminal: JOBS shows today's facility jobs"), 'hint');
      return;
    }
    if (phase !== 'moon' || !fj()) return;
    for (const j of fj().j) {
      const L = lineOf(j);
      if (j.st === 1) add(`${title(j.id)}`, j.sl === 'm' ? 'main' : 'sub', true);
      else if (j.st === 0) {
        add(`${L.head}`, j.sl === 'm' ? 'main' : 'sub', false, j.p / j.n);
        if (j.id === 'vault') { const c = codeText(j); if (c) add(tf('Code: {c}', { c }), 'sub'); }
        else if (j.p === 0 || j.id === 'core' || j.id === 'rescue') add(L.stage, 'hint');
      }
    }
  }));

  // landing card: add the job + layout rows to the existing briefing (hud.js) without touching it
  function briefRows() {
    const r = run();
    if (!r || r.phase !== 'landing' || typeof document === 'undefined') { S.briefKey = ''; return; }
    const grid = document.querySelector('.br-card .br-grid');
    if (!grid || grid.querySelector('.fj-row')) return;
    if (!C.jobMoon(MOONS[r.moon]) || game.onboard?.fr?.calm?.('facjobs')) return;
    const roll = C.rollJobs(r.runId ?? 'x', r.day ?? 1, r.moon, r.quotaIndex | 0);
    const row = (k, v) => { const d = document.createElement('div'); d.className = 'fj-row'; const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; d.append(a, b); grid.appendChild(d); };
    row(t('JOB'), title(roll.main));
    if (roll.side) row(t('SIDE'), title(roll.side));
    row(t('LAYOUT'), roll.arch && !LAB_IDS.includes(MOONS[r.moon]?.interior) ? t(ARCH_NAME[roll.arch]) : t('Classic'));   // [labyrinths]
  }

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    briefRows();
    try { buildProps(); animateProps(dt); } catch (e) { console.warn('[facjobs] props', e); clearProps(); S.key = 'err'; }
    if (!host() || run()?.phase !== 'moon' || !fj()) return;
    tickT += dt; droneT += dt;
    if (droneT >= 0.1) { const d = droneT; droneT = 0; try { droneTick(d); } catch (e) { console.warn('[facjobs] drone', e); } }
    if (tickT >= 0.5) { const d = tickT; tickT = 0; try { hostTick(d); } catch (e) { console.warn('[facjobs] tick', e); } }
  }));
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('fjreq', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[facjobs] req', e); } }); }));
  let boundNet = null;
  const bindNet = (net) => {
    if (!net || boundNet === net) return;
    boundNet = net; net.on('msg:fjfx', onFx); net.on('msg:fjd', onDrone);
  };
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('moonPopulated', (g) => { if (g === game) { try { hostSetup(); } catch (e) { console.warn('[facjobs] setup', e); } } }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'takeoff' && host()) { try { hostTakeoff(); } catch (e) { console.warn('[facjobs] takeoff', e); } }
    if (ph !== 'moon' && ph !== 'landing') { S.clues.clear(); closeCode(); mem.drone = null; S.dHave = false; }
    if (ph === 'orbit' && host() && run()?.fj) { run().fj = null; bcast(); }
  }));

  // ------------------------------------------------------------------------------------------ terminal: JOBS
  function printJobs(term) {
    const r = run(), moon = MOONS[r?.moon];
    if (!C.jobMoon(moon)) { term.print(t('No jobs on this moon.')); return; }
    const roll = C.rollJobs(r.runId ?? 'x', r.day ?? 1, r.moon, r.quotaIndex | 0);
    const lines = [tf("TODAY'S JOBS - {moon}", { moon: moon.name || r.moon }), ''];
    for (const [sl, id] of [['m', roll.main], ['s', roll.side]]) {
      if (!id) continue;
      lines.push(`${t(sl === 'm' ? 'MAIN' : 'SIDE')}: ${title(id)}`, '  ' + tf(BRIEF[id], { n: sl === 's' && id === 'sample' ? 3 : C.JOBS[id].n }), '  ' + rewardText(id, sl, r.quotaIndex | 0));
    }
    lines.push('', `${t('LAYOUT')}: ${roll.arch ? `${t(ARCH_NAME[roll.arch])} - ${t(ARCH_DESC[roll.arch])}` : t('Classic')}`);
    term.print(lines.join('\n'));
  }
  try { window.KefalAPI?.registerCommand?.('jobs', (rest, term) => printJobs(term), t("today's facility jobs and layout")); } catch { /* no terminal */ }

  return {
    /** layoutOpts for game.js loadMap: the day's archetype (null = classic) */
    layoutOpts: (moon, r) => C.layoutOptsFor(moon, r),
    roll: () => { const r = run(); return r ? C.rollJobs(r.runId ?? 'x', r.day ?? 1, r.moon, r.quotaIndex | 0) : null; },
    hostSetup, hostReq, hostTick, droneTick, _mem: mem,
    dispose() {
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:fjfx', onFx); boundNet?.off?.('msg:fjd', onDrone); } catch { /* ignore */ }
      closeCode(); clearProps();
      try { window.__kefalMods?.commands?.delete?.('jobs'); } catch { /* ignore */ }
    },
  };
}
