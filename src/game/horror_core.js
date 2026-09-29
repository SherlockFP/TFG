// HORROR module - pure rules (no THREE / DOM / game access, node-testable: tools/harness/horror.test.mjs).
//   1. pay-to-arm TRAPS: table, pricing, state machine, laser sweep maths, damage / refund rules
//   2. CREATURE balance data (Shambler, Forger, Closet Thing, Warden)
//   3. CHALK: mark schema, compact encoding, per-player / total limits, store with eviction, forger forgery rules
//   4. FACILITY PLAN: where traps / portal closets / the fake closet go (layout data only, deterministic from the seed)
//   5. FAKE CLOSET outcome rules (open / knock / hook)
// Everything a peer must agree on (plan, chalk store) is derived from the layout seed or replicated by the host ('hr*' messages).
import { RNG } from '../core/rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const CELL = 4;

// ================================================================================================ 1. TRAPS
// price = credits (shared crew money, run.credits). charges = strikes per arming. armSec = how long an arming lasts if nothing triggers it.
// tele = warning before the strike, strike = active time, cd = pause between strikes. dmgC = damage to a creature, dmgP = damage to a player
// standing in the zone when it strikes (electric / flame tick every `tick` s during the strike). len = zone length in 4 m cells.
export const TRAPS = {
  laser: { id: 'laser', name: 'Laser Grid', price: 90, charges: 2, armSec: 150, tele: 1.2, strike: 1.8, cd: 2.5, tick: 0, dmgC: 230, dmgP: 55, len: 2, minLen: 2, weight: 2, blurb: 'A wall of beams sweeps the corridor and cuts through everything in it.' },
  crusher: { id: 'crusher', name: 'Ceiling Crusher', price: 45, charges: 3, armSec: 150, tele: 1.0, strike: 0.4, cd: 2.0, tick: 0, dmgC: 320, dmgP: 70, len: 1, minLen: 1, weight: 3, blurb: 'A slab drops on whatever stands under it. Shadow first, thud second.' },
  spikes: { id: 'spikes', name: 'Spike Floor', price: 35, charges: 5, armSec: 150, tele: 0.55, strike: 0.5, cd: 1.0, tick: 0, dmgC: 110, dmgP: 32, len: 2, minLen: 1, weight: 3, blurb: 'Rusty spikes rise out of the floor. Cheap, quick, five strikes.' },
  electric: { id: 'electric', name: 'Live Floor', price: 55, charges: 3, armSec: 150, tele: 0.7, strike: 4.0, cd: 1.5, tick: 0.5, dmgC: 22, dmgP: 9, len: 2, minLen: 2, weight: 2, blurb: 'The floor plates go live for four seconds. Hurts and stuns whatever stands on them.' },
  flame: { id: 'flame', name: 'Flame Vent', price: 70, charges: 3, armSec: 150, tele: 0.85, strike: 1.5, cd: 1.6, tick: 0.25, dmgC: 26, dmgP: 12, len: 2, minLen: 2, weight: 2, blurb: 'Vents along the walls roar into a fire lane. Set them alight.' },
};
export const TRAP_IDS = Object.keys(TRAPS);
export const TRAP_RULES = {
  maxArmsPerLanding: 3,        // per trap
  priceQuotaStep: 0.09,        // +9 % per sector quota index
  priceQuotaMax: 1.8,
  priceUseStep: 0.25,          // +25 % per arming already paid for on this landing (every trap together)
  refundPerKill: 0.12,         // of the price, per creature the trap kills ...
  refundMax: 0.6,              // ... but never more than 60 % of what one arming cost
  bossMul: 0.05, eliteMul: 0.7,
  playerSafeSec: 1.0,          // a player who just got hit by a trap cannot be hit again by the same strike
  minPanelDist: 2.0,
};
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
/** price of the next arming. ctx: { quotaIndex, usesThisLanding } */
export function trapPrice(type, ctx = {}) {
  const T = TRAPS[type];
  if (!T) return Infinity;
  const q = clamp(1 + (ctx.quotaIndex || 0) * TRAP_RULES.priceQuotaStep, 1, TRAP_RULES.priceQuotaMax);
  const u = 1 + Math.max(0, ctx.usesThisLanding || 0) * TRAP_RULES.priceUseStep;
  return round5(T.price * q * u);
}
/** credits handed back for one kill (kill number k within this arming, 0-based) */
export function killRefund(type, price, killsSoFarRefund = 0) {
  const cap = Math.floor(price * TRAP_RULES.refundMax);
  const one = Math.max(1, Math.round(price * TRAP_RULES.refundPerKill));
  return clamp(cap - killsSoFarRefund, 0, one);
}

export function newTrap(type) { return { type, s: 'idle', arms: 0, charges: 0, until: 0, t0: 0, by: null, refunded: 0, kills: 0, hit: null }; }
export const TRAP_STATES = ['idle', 'armed', 'tele', 'strike', 'cool', 'spent'];
/** pay-to-arm: only an idle / spent trap can be armed, at most maxArmsPerLanding times */
export function armTrap(tr, now, payer) {
  if (!tr || !TRAPS[tr.type]) return { ok: false, reason: 'bad' };
  if (tr.s !== 'idle' && tr.s !== 'spent') return { ok: false, reason: 'busy' };
  if (tr.arms >= TRAP_RULES.maxArmsPerLanding) return { ok: false, reason: 'limit' };
  const T = TRAPS[tr.type];
  tr.s = 'armed'; tr.arms++; tr.charges = T.charges; tr.until = now + T.armSec; tr.by = payer || null; tr.refunded = 0; tr.kills = 0; tr.t0 = now;
  return { ok: true };
}
/**
 * Advance the state machine. occupied = a creature (or, for armed traps that only creatures set off, a hostile) stands in the trigger zone.
 * Returns events: 'tele' | 'strike' | 'end' | 'expire' | 'spent'. Pure: the caller broadcasts / deals the damage.
 */
export function stepTrap(tr, now, occupied) {
  const out = [];
  const T = TRAPS[tr.type];
  if (!T) return out;
  switch (tr.s) {
    case 'armed':
      if (now >= tr.until) { tr.s = 'idle'; tr.charges = 0; out.push('expire'); }
      else if (occupied) { tr.s = 'tele'; tr.t0 = now; out.push('tele'); }
      break;
    case 'tele':
      if (now - tr.t0 >= T.tele) { tr.s = 'strike'; tr.t0 = now; tr.hit = new Set(); out.push('strike'); }
      break;
    case 'strike':
      if (now - tr.t0 >= T.strike) { tr.s = 'cool'; tr.t0 = now; tr.charges--; out.push('end'); }
      break;
    case 'cool':
      if (now - tr.t0 >= T.cd) {
        if (tr.charges > 0 && now < tr.until + T.armSec) { tr.s = 'armed'; tr.until = Math.max(tr.until, now + 20); }
        else { tr.s = 'spent'; out.push('spent'); }
      }
      break;
    default: break;
  }
  return out;
}
/** damage a trap deals to a creature (0 = immune). c = { hp, maxHp, boss, hazard, elite, dead } */
export function trapDamageTo(type, c) {
  const T = TRAPS[type];
  if (!T || !c || c.dead || c.hazard || c.maxHp === null || c.maxHp === undefined) return 0;
  let d = T.dmgC;
  if (c.boss) d *= TRAP_RULES.bossMul; else if (c.elite) d *= TRAP_RULES.eliteMul;
  return Math.round(d);
}
/** beam position (0..1 along the zone) at `elapsed` seconds into the strike (eased so the wall accelerates a little) */
export function laserFrac(elapsed, strike = TRAPS.laser.strike) { const p = clamp(elapsed / strike, 0, 1); return p * p * (3 - 2 * p) * 0.6 + p * 0.4; }
/** did the beam pass a victim standing s metres into a zone of `len` metres between fractions a -> b (beam thickness `w`)? */
export function sweepHit(a, b, s, len, w = 0.35) { const lo = Math.min(a, b) * len - w, hi = Math.max(a, b) * len + w; return s >= lo && s <= hi; }
/** oriented zone test. zone = { cx, cz, axis: 'x'|'z', len, wid } (metres, centre based). returns { s, u, inside } (s along the axis from the low end) */
export function zoneCoords(zone, x, z) {
  const along = zone.axis === 'x' ? x - zone.cx : z - zone.cz, across = zone.axis === 'x' ? z - zone.cz : x - zone.cx;
  return { s: along + zone.len / 2, u: across, inside: Math.abs(along) <= zone.len / 2 && Math.abs(across) <= zone.wid / 2 };
}
/** electric / flame damage per tick to a creature / player, scaled to whole ticks */
export function tickCount(type) { const T = TRAPS[type]; return T.tick > 0 ? Math.max(1, Math.floor(T.strike / T.tick)) : 1; }
/** the most one strike can do to a creature (used by balance tests) */
export function maxStrikeDamage(type) { const T = TRAPS[type]; return T.dmgC * tickCount(type); }

// ================================================================================================ 2. CREATURES (balance data)
export const HR_DEFS = {
  hr_zombie: { name: 'Shambler', hp: 42, dmg: 11, walk: 0.95, run: 1.9, power: 0.6, xp: 24, coin: 4, zone: 'in', radius: 0.42, height: 1.8, pack: [3, 5], maxAlive: 14, noSpawn: true, noHunt: true,
    deathText: 'was dragged down by the Shamblers.',
    lore: 'Slow, brittle and always in a group. A Shambler grabs and gnaws: shove it off with any hit. Headshots do more than twice the damage. '
      + 'You will not have enough bullets for all of them, so kill the ones in your way, then run.' },
  hr_forger: { name: 'The Forger', hp: 70, dmg: 20, walk: 2.1, run: 4.6, power: 1.2, xp: 120, coin: 22, zone: 'in', radius: 0.4, height: 1.7, maxAlive: 1, noSpawn: true, noHunt: true,
    deathText: 'was chalked out by the Forger.',
    lore: 'A thin thing with chalk-white fingers. It scratches out your arrows and draws its own. You hear the scratching first. '
      + 'Its arrows are too neat and grow an extra tick on the head. It runs from light and from a fair fight.' },
  hr_ambusher: { name: 'Storage Cabinet?', hp: 160, dmg: 55, walk: 2.4, run: 5.2, power: 1.5, xp: 160, coin: 30, zone: 'in', radius: 0.5, height: 1.9, maxAlive: 2, noSpawn: true, noHunt: true,
    deathText: 'opened the wrong closet.',
    lore: 'It lives in the closets that look a little too inviting. The door breathes, cold air seeps out under it and something scratches inside. '
      + 'Knock first. Crouch and knock, or hook the door open from a distance with anything long. Never open it while standing right in front.' },
  hr_warden: { name: 'Manor Warden', hp: 95, dmg: 24, walk: 2.5, run: 5.0, power: 1.4, xp: 90, coin: 16, zone: 'in', radius: 0.45, height: 1.95, maxAlive: 6, noSpawn: true, noHunt: true,
    deathText: 'was cleaved by a Manor Warden.',
    lore: 'The servants of the dark oak house. Axe up, patient, and they hate being shot at more than being outrun. They guard the good rooms.' },
};
export const SHOTS_TO_KILL = (hp, dmg, mul = 1) => Math.ceil(hp / Math.max(0.01, dmg * mul));
export const HEADSHOT_MUL = 2.2;
export const ZOMBIE = {
  packMin: 3, packMax: 5, grabRange: 1.25, grabSec: 2.2, grabTick: 0.8, grabDmg: 6, breakHit: 0.2,   // a hit worth 20 % of max hp shoves it off
  headFrac: 0.78, headWindow: 0.5, fragile: 0.18,
};
/** sidearm the outbreak wing hands out (a normal `pistol` item with `charges` loaded rounds) */
export const SIDEARM = { item: 'pistol', rounds: 8, boxItem: 'rounds', boxRounds: 6, boxChance: 0.7, wingZombies: [8, 10] };

// ================================================================================================ 3. CHALK
export const CHALK = {
  item: 'hr_chalk', perPlayer: 24, total: 160, fakeCap: 10, reach: 4.6, rateN: 5, rateSec: 3, maxDrawDist: 5.5,
  glyphs: ['arrow', 'x'], colors: [0xf2f2e6, 0xf5d76e, 0x9be7ff, 0xffa8c8, 0xb6f5a0, 0xffc38a, 0xd2b6ff, 0xffffff], forgerFadeSec: 600,
};
const Q = 20;   // position quantisation: 5 cm
export function quantMark(m) {
  return { id: m.id | 0, o: clamp(m.o | 0, 0, 255), k: clamp(m.k | 0, 0, CHALK.glyphs.length - 1), x: Math.round(m.x * Q) / Q, y: Math.round(m.y * Q) / Q, z: Math.round(m.z * Q) / Q,
    n: clamp(m.n | 0, 0, 5), r: ((m.r | 0) % 32 + 32) % 32, f: m.f ? 1 : 0, v: (m.v | 0) & 3 };
}
/** [id, owner, glyph, x*20, y*20, z*20, normalIdx, roll, fake, variant] all ints */
export function encodeMark(m) { const q = quantMark(m); return [q.id, q.o, q.k, Math.round(q.x * Q), Math.round(q.y * Q), Math.round(q.z * Q), q.n, q.r, q.f, q.v]; }
export function decodeMark(a) {
  if (!Array.isArray(a) || a.length < 10 || !a.every(Number.isFinite)) return null;
  return quantMark({ id: a[0], o: a[1], k: a[2], x: a[3] / Q, y: a[4] / Q, z: a[5] / Q, n: a[6], r: a[7], f: a[8], v: a[9] });
}
export const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/** nearest axis normal index of a hit normal */
export function normalIndex(nx, ny, nz) {
  const a = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
  const ax = a[1] >= a[0] && a[1] >= a[2] ? 1 : a[0] >= a[2] ? 0 : 2;
  const v = ax === 0 ? nx : ax === 1 ? ny : nz;
  return ax * 2 + (v >= 0 ? 0 : 1);
}
/** orthonormal basis for a mark: right (glyph x), dir (glyph y = arrow direction), normal. roll in 0..31 */
export function markBasis(n, roll) {
  const N = NORMALS[clamp(n | 0, 0, 5)];
  const ref = Math.abs(N[1]) > 0.7 ? [0, 0, -1] : [0, 1, 0];
  const d = ref[0] * N[0] + ref[1] * N[1] + ref[2] * N[2];
  let t = [ref[0] - N[0] * d, ref[1] - N[1] * d, ref[2] - N[2] * d];
  const tl = Math.hypot(...t) || 1; t = t.map((c) => c / tl);
  const b = [N[1] * t[2] - N[2] * t[1], N[2] * t[0] - N[0] * t[2], N[0] * t[1] - N[1] * t[0]];
  const th = ((roll | 0) / 32) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
  const dir = [t[0] * c + b[0] * s, t[1] * c + b[1] * s, t[2] * c + b[2] * s];
  const right = [dir[1] * N[2] - dir[2] * N[1], dir[2] * N[0] - dir[0] * N[2], dir[0] * N[1] - dir[1] * N[0]];
  return { normal: N, dir, right };
}
/** roll index (0..31) that makes the glyph's "up" point along wanted direction `w` (projected on the surface) */
export function rollFor(n, w) {
  const N = NORMALS[clamp(n | 0, 0, 5)];
  const ref = Math.abs(N[1]) > 0.7 ? [0, 0, -1] : [0, 1, 0];
  const d = ref[0] * N[0] + ref[1] * N[1] + ref[2] * N[2];
  let t = [ref[0] - N[0] * d, ref[1] - N[1] * d, ref[2] - N[2] * d];
  const tl = Math.hypot(...t) || 1; t = t.map((c) => c / tl);
  const b = [N[1] * t[2] - N[2] * t[1], N[2] * t[0] - N[0] * t[2], N[0] * t[1] - N[1] * t[0]];
  const wd = w[0] * N[0] + w[1] * N[1] + w[2] * N[2];
  const p = [w[0] - N[0] * wd, w[1] - N[1] * wd, w[2] - N[2] * wd];
  const th = Math.atan2(p[0] * b[0] + p[1] * b[1] + p[2] * b[2], p[0] * t[0] + p[1] * t[1] + p[2] * t[2]);
  return ((Math.round((th / (Math.PI * 2)) * 32) % 32) + 32) % 32;
}
/** basic validation of a client's draw request against the shooter (host side) */
export function validateDraw(req, pos) {
  if (!req || typeof req !== 'object') return null;
  const p = req.p;
  if (!Array.isArray(p) || p.length < 3 || !p.every(Number.isFinite)) return null;
  if (!pos) return null;
  const dx = p[0] - pos.x, dy = p[1] - (pos.y + 1.2), dz = p[2] - pos.z;
  if (Math.hypot(dx, dy, dz) > CHALK.maxDrawDist) return null;
  const m = quantMark({ id: 0, o: 0, k: req.k, x: p[0], y: p[1], z: p[2], n: req.n, r: req.r, f: 0, v: 0 });
  return m;
}
/** the store: FIFO per owner, hard total cap; fakes are capped separately and never evict a real mark */
export class ChalkStore {
  constructor() { this.marks = new Map(); this.nextId = 1; this.byOwner = new Map(); this.fakes = []; }
  count(owner) { return this.byOwner.get(owner)?.length || 0; }
  add(m, owner = 0) {
    const evicted = [];
    const mark = quantMark({ ...m, id: this.nextId++ });
    if (mark.f) {
      mark.o = 255;
      this.fakes.push(mark.id);
      while (this.fakes.length > CHALK.fakeCap) { const id = this.fakes.shift(); if (this.marks.delete(id)) evicted.push(id); }
    } else {
      mark.o = owner;
      const list = this.byOwner.get(owner) || [];
      list.push(mark.id); this.byOwner.set(owner, list);
      while (list.length > CHALK.perPlayer) { const id = list.shift(); if (this.marks.delete(id)) evicted.push(id); }
    }
    this.marks.set(mark.id, mark);
    while (this.marks.size > CHALK.total) {
      const oldest = this.marks.keys().next().value;
      this.remove(oldest); evicted.push(oldest);
    }
    return { mark, evicted };
  }
  remove(id) {
    const m = this.marks.get(id);
    if (!m) return false;
    this.marks.delete(id);
    if (m.f) this.fakes = this.fakes.filter((x) => x !== id);
    else { const l = this.byOwner.get(m.o); if (l) { const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); } }
    return true;
  }
  clear() { this.marks.clear(); this.byOwner.clear(); this.fakes = []; }
  all() { return [...this.marks.values()]; }
  encodeAll() { return this.all().map(encodeMark); }
  /** find the nearest mark (of a given fake-ness) to a point */
  nearest(x, y, z, maxD = 3, wantFake = null) {
    let best = null, bd = maxD;
    for (const m of this.marks.values()) {
      if (wantFake !== null && !!m.f !== wantFake) continue;
      const d = Math.hypot(m.x - x, m.y - y, m.z - z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
}
/**
 * The Forger's move. Returns { erase: id } (rub out a real arrow), { forge: mark } (a fake arrow that points the wrong way, drawn next to a real one) or null.
 * A fake has: an extra tick on the arrow head (variant 1) and a perfectly straight shaft; the real ones are wobbly. Rolls are turned 90-180 degrees.
 */
export function forgerMove(store, rand, near = null) {
  const real = store.all().filter((m) => !m.f && m.k === 0);
  if (!real.length) return null;
  const pool = near ? real.slice().sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z)).slice(0, 4) : real;
  const m = pool[Math.floor(rand() * pool.length) % pool.length];
  if (rand() < 0.45) return { erase: m.id };
  const turn = rand() < 0.5 ? 16 : rand() < 0.5 ? 8 : 24;
  return { erase: m.id, forge: { o: 255, k: 0, x: m.x, y: m.y, z: m.z, n: m.n, r: (m.r + turn) % 32, f: 1, v: 1 } };
}
/** the visible difference an attentive player can spot (documented in the UI hint) */
export const FAKE_TELL = 'Fake arrows have a clean straight shaft and a third tick on the head.';

// ================================================================================================ 4. FACILITY PLAN
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
/** cells reachable from the entrance without passing locked / vault / containment / arena doors */
export function reachableCells(L) {
  const start = L.idx(L.entrance.room.cx, L.entrance.room.cz);
  const seen = new Uint8Array(L.w * L.h);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop(), x = i % L.w, z = (i / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const j = nz * L.w + nx, k = L.edgeKey(x, z, d);
      if (!L.cells[j] || seen[j] || !L.open.has(k)) continue;
      const inf = L.edgeInfo.get(k);
      if (inf && (inf.type === 'vault' || inf.type === 'contain' || inf.arena || (inf.type === 'door' && inf.locked))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}
const edgeOpen = (L, x, z, d) => L.open.has(L.edgeKey(x, z, d));
const edgeDoor = (L, x, z, d) => L.edgeInfo.has(L.edgeKey(x, z, d));
/** straight hallway pieces: open exactly on two opposite edges, walls on the other two, no door on either open edge */
function straightAxis(L, x, z) {
  const o = [0, 1, 2, 3].map((d) => edgeOpen(L, x, z, d));
  const nOpen = o.filter(Boolean).length;
  if (nOpen !== 2) return null;
  if (o[0] && o[2] && !edgeDoor(L, x, z, 0) && !edgeDoor(L, x, z, 2)) return 'x';
  if (o[1] && o[3] && !edgeDoor(L, x, z, 1) && !edgeDoor(L, x, z, 3)) return 'z';
  return null;
}
/** maximal straight runs (>= 3 cells) of hallway cells, all reachable, away from the entrance */
export function findRuns(L, reach = null) {
  reach = reach || reachableCells(L);
  const runs = [];
  const seen = new Uint8Array(L.w * L.h);
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i] || seen[i] || !reach[i]) continue;
    const ax = straightAxis(L, x, z);
    if (!ax) continue;
    const dx = ax === 'x' ? 1 : 0, dz = ax === 'z' ? 1 : 0;
    // walk back to the start of the run
    let sx = x, sz = z;
    while (sx - dx >= 0 && sz - dz >= 0 && straightAxis(L, sx - dx, sz - dz) === ax && edgeOpen(L, sx, sz, ax === 'x' ? 2 : 3)) { sx -= dx; sz -= dz; }
    const cells = [];
    let cx = sx, cz = sz;
    while (cx < L.w && cz < L.h && straightAxis(L, cx, cz, ) === ax) {
      const ci = L.idx(cx, cz); seen[ci] = 1; cells.push([cx, cz]);
      if (!edgeOpen(L, cx, cz, ax === 'x' ? 0 : 1)) break;
      cx += dx; cz += dz;
    }
    if (cells.length >= 3 && cells.every(([a, b]) => reach[L.idx(a, b)] && (L.distOf?.[L.idx(a, b)] ?? 9) >= 3)) runs.push({ axis: ax, cells });
  }
  return runs;
}
const dist1 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
export const CLOSET = { w: 1.7, d: 1.4, h: 2.55, backGap: 0.22 };
const POCKET_WEIGHTS = { outbreak: 3, mansion: 2, ballroom: 3, warehouse: 2 };
export const POCKET_KINDS = Object.keys(POCKET_WEIGHTS);
const NO_POCKET_THEMES = new Set(['backrooms', 'mineshaft']);
/** rooms a closet may stand in: ordinary rooms with a plain closed wall on some side of a cell that has no doorway and is not a corridor */
export function closetCandidates(L, reach = null) {
  reach = reach || reachableCells(L);
  const out = [];
  for (const r of L.rooms) {
    if (!r || r.type === 'entrance' || r.type === 'vault' || r.type === 'core' || r.type === 'generator' || r.type === 'contain' || (L.arena && L.arena.id === r.id)) continue;
    if (r.w * r.h < 4 || (r.m2 || r.m2ch)) continue;
    const cand = [];
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
      const i = L.idx(x, z);
      if (L.roomOf[i] !== r.id || !reach[i] || (L.distOf?.[i] ?? 9) < 3) continue;
      if ([0, 1, 2, 3].some((d) => edgeDoor(L, x, z, d))) continue;
      for (let d = 0; d < 4; d++) {
        if (edgeOpen(L, x, z, d) || edgeDoor(L, x, z, d)) continue;
        // the wall must be a real outer wall: the cell across is empty or another room's cell that is not joined
        const nx = x + DX[d], nz = z + DZ[d];
        if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
        // keep the closet away from the cell's corners: the cell needs its neighbours along the wall to be open or walls, never a door
        const perp = d === 0 || d === 2 ? [1, 3] : [0, 2];
        if (perp.some((pd) => edgeDoor(L, x, z, pd))) continue;
        cand.push({ x, z, d, room: r.id });
      }
    }
    if (cand.length) out.push({ room: r.id, cands: cand, dist: L.distOf?.[L.idx(r.cx, r.cz)] ?? 0, maze: !!r.maze, area: r.w * r.h });
  }
  return out;
}
/** wall-mounted closet frame for a cell/side: centre, facing (out of the wall into the room), footprint. Same on every peer. */
export function closetFrame(L, c) {
  const wx = L.ox + c.x * CELL + CELL / 2, wz = L.oz + c.z * CELL + CELL / 2;
  const fx = -DX[c.d], fz = -DZ[c.d];   // facing = away from the wall
  const wallX = wx + DX[c.d] * (CELL / 2), wallZ = wz + DZ[c.d] * (CELL / 2);
  return { x: wallX + fx * (CLOSET.d / 2), z: wallZ + fz * (CLOSET.d / 2), fx, fz, wallX, wallZ, y: L.y, yaw: Math.atan2(fx, fz) };
}
/** which pocket kinds this facility gets: { closets: [{ id, kind, cell, key? }], traps, crestRoom, fake } */
export function planFacility(L, run = {}) {
  const plan = { traps: [], closets: [], crestRoom: -1, fake: null, seed: L.seed };
  if (!L || NO_POCKET_THEMES.has(L.theme)) return plan;
  const rng = new RNG(((L.seed | 0) ^ 0x4809f13) >>> 0);
  const reach = reachableCells(L);
  const size = clamp(L.size || 1, 0.5, 2.6);
  // ---- traps
  const runs = findRuns(L, reach);
  const want = clamp(Math.round(1.4 + size * 1.1 + (L.mazes?.length || 0)), 1, 5);
  const chosen = [];
  const order = rng.shuffle(runs.slice());
  const typeBag = () => rng.weighted(TRAP_IDS.map((id) => ({ id, w: TRAPS[id].weight })));
  for (const rn of order) {
    if (chosen.length >= want) break;
    const zoneCells = rn.cells.slice(1);   // the first cell hosts the panel
    let type = typeBag().id;
    const T = TRAPS[type];
    let len = Math.min(zoneCells.length, T.len + (zoneCells.length > 3 && rng.chance(0.4) ? 1 : 0));
    if (len < T.minLen) { type = 'crusher'; len = 1; }
    // centre the zone in the run (never on the panel cell); crusher = 1 cell, others len cells
    const start = Math.max(0, Math.floor((zoneCells.length - len) / 2));
    const zc = zoneCells.slice(start, start + len);
    const mid = zc[Math.floor(zc.length / 2)];
    if (chosen.some((c) => dist1(c.mid, mid) < 7)) continue;
    chosen.push({ id: chosen.length, type, axis: rn.axis, cells: zc, panelCell: rn.cells[0], mid });
  }
  plan.traps = chosen.map((c) => ({ id: c.id, type: c.type, axis: c.axis, cells: c.cells, panelCell: c.panelCell }));
  // ---- portal closets
  const cands = closetCandidates(L, reach).sort((a, b) => a.room - b.room);
  const usedRooms = new Set();
  const pick = (filter) => { const list = cands.filter((c) => !usedRooms.has(c.room) && (!filter || filter(c))); return list.length ? rng.pick(list) : null; };
  const nPockets = size < 0.8 ? (rng.chance(0.55) ? 1 : 0) : size < 1.4 ? (rng.chance(0.75) ? 1 : 0) + (rng.chance(0.3) ? 1 : 0) : 1 + (rng.chance(0.65) ? 1 : 0);
  const kinds = [];
  const bag = POCKET_KINDS.map((k) => ({ id: k, w: POCKET_WEIGHTS[k] }));
  while (kinds.length < nPockets) {
    const k = rng.weighted(bag).id;
    if (!kinds.includes(k)) kinds.push(k);
    if (kinds.length >= POCKET_KINDS.length) break;
  }
  for (const kind of kinds) {
    let c = null;
    if (kind === 'mansion') c = pick((q) => q.maze || q.area >= 12) || pick();
    else if (kind === 'outbreak') c = pick((q) => q.dist >= 4) || pick();
    else c = pick();
    if (!c) continue;
    usedRooms.add(c.room);
    const cell = rng.pick(c.cands);
    plan.closets.push({ id: plan.closets.length, kind, room: c.room, cell });
  }
  // the crest for the quarantine door lies in another reachable room, far from the entrance
  if (plan.closets.some((c) => c.kind === 'outbreak')) {
    const far = L.rooms.filter((r) => r && !usedRooms.has(r.id) && r.type !== 'entrance' && r.type !== 'vault' && reach[L.idx(r.cx, r.cz)] && (L.distOf?.[L.idx(r.cx, r.cz)] ?? 0) >= 3 && r.w * r.h >= 2);
    plan.crestRoom = far.length ? rng.pick(far).id : -1;
  }
  // ---- the fake closet (Alien-style ambush): rare, only from day 2 / sector 2, never in a room that holds a real closet
  const late = (run.day || 1) >= 2 || (run.quotaIndex || 0) >= 1;
  if (late && size >= 0.8 && rng.chance(0.3)) {
    const c = pick((q) => q.dist >= 5);
    if (c) { usedRooms.add(c.room); plan.fake = { id: 100, room: c.room, cell: rng.pick(c.cands) }; }
  }
  return plan;
}
export const closetKey = (c) => `${c.cell.x},${c.cell.z},${c.cell.d}`;

// ================================================================================================ 5. FAKE CLOSET
export const FAKE = {
  lungeReach: 2.4,          // players closer than this to the door when it opens by hand are in the lunge
  handLunge: 0.28,          // s between the door opening by hand and the lunge landing (no time to react)
  hookLunge: 0.9,           // s of growl after a hook / knock so a player can step back
  knockAnswer: 1.3,         // s after a knock before it bursts out on its own
  hookReach: 3.6, handReach: 2.4,
  minDay: 2, tellRange: 9,
};
/** what happens when the closet is opened: mode 'open' (by hand), 'hook' (long tool) or 'knock' (crouch + E). dist = opener's distance to the door. */
export function fakeOutcome(mode, dist) {
  if (mode === 'open') return { lunge: FAKE.handLunge, lethal: dist <= FAKE.lungeReach, opens: true };
  if (mode === 'hook') return { lunge: FAKE.hookLunge, lethal: dist <= FAKE.lungeReach, opens: true };
  if (mode === 'knock') return { lunge: FAKE.knockAnswer, lethal: false, opens: true, answers: true };
  return null;
}
/** which opener mode a client picks: crouching = knock; a long tool in hand = hook (from farther away); otherwise by hand */
export function openerMode({ crouch, longTool }) { return crouch ? 'knock' : longTool ? 'hook' : 'open'; }

// ================================================================================================ helpers shared by the runtime
export const HR_MSG = { req: 'hrReq', state: 'hrs', fx: 'hrfx', chalk: 'hrch' };
export function trapZoneOf(L, tr) {
  const cs = tr.cells;
  const cx0 = L.ox + cs[0][0] * CELL, cz0 = L.oz + cs[0][1] * CELL;
  const cx1 = L.ox + (cs[cs.length - 1][0] + 1) * CELL, cz1 = L.oz + (cs[cs.length - 1][1] + 1) * CELL;
  const cx = (cx0 + cx1) / 2, cz = (cz0 + cz1) / 2;
  const len = tr.axis === 'x' ? Math.abs(cx1 - cx0) : Math.abs(cz1 - cz0);
  return { cx, cz, axis: tr.axis, len, wid: CELL - 0.3, y: L.y };
}
