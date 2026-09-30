// COOP 12 core (wave 12, docs/wave12/coop12.md): pure rules for the "friends have to work together" layer. No THREE / DOM, node-tested by tools/harness/coop12.test.mjs.
//   1. TEAM LIFT   giant loot (2 hands, `giant: true`, also `bulky` so carry2's helper grip applies): solo = drag, pair = speed by SYNC, falls hurt
//   2. HEAVY DOORS cracked vault doors need a lever held (E) while others pass; slam after a 1 s telegraph
//   3. BUDDY BOND  two players close together for ~30 s: icon, faster revive, shared stamina regen, highlighted pings; decays when apart (never punishes)
//   4. HIGH-FIVE   both press + hold E facing each other within 2.8 m: tiny morale buff + a sound

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------------------------------------ giant loot
export const GIANT_DEFS = Object.freeze([
  { id: 'cg_rack', name: 'Tier-4 Server Rack', kind: 'scrap', value: [380, 520], weight: 118, hands: 2, fragile: 0.55, bulky: true, giant: true, tier: 'epic',
    tip: 'GIANT. Two people lift it in step; alone you can only drag it. Falls crack the blades.' },
  { id: 'cg_arcade', name: 'Arcade Cabinet DOOM SCROLL', kind: 'scrap', value: [420, 590], weight: 104, hands: 2, fragile: 0.5, bulky: true, giant: true, tier: 'epic',
    tip: 'GIANT. The screen still scrolls. Two people, one direction.' },
  { id: 'cg_vending', name: 'Double-Wide Vending Machine', kind: 'scrap', value: [360, 500], weight: 122, hands: 2, fragile: 0.6, bulky: true, giant: true, tier: 'epic',
    tip: 'GIANT. Every slot is full and none of them are for you. Do not drop it down the stairs.' },
  { id: 'cg_like', name: 'The Golden Like', kind: 'scrap', value: [560, 780], weight: 130, hands: 2, fragile: 0.4, bulky: true, giant: true, tier: 'legendary',
    tip: 'GIANT. The Algorithm mascot in gold. Worth a fortune, heavier than the crew morale.' },
]);
export const GIANT_IDS = Object.freeze(GIANT_DEFS.map((d) => d.id));
/** [id, weight] additions per interior theme (rare on purpose: a giant is an event, not a chore) */
export const GIANT_LOOT = Object.freeze({
  factory: [['cg_rack', 2], ['cg_vending', 2]], office: [['cg_arcade', 3], ['cg_vending', 2]], serverfarm: [['cg_rack', 4]],
  mansion: [['cg_like', 3], ['cg_arcade', 2]], hospital: [['cg_vending', 2]], mineshaft: [['cg_like', 2]], sewer: [['cg_like', 1]], backrooms: [['cg_arcade', 2]],
});
export const isGiant = (def) => !!def && (def.giant === true || GIANT_IDS.includes(def.id));

// ------------------------------------------------------------------------------------------------ sync
export const LIFT = {
  soloSpeed: 0.18,       // one carrier, nobody gripping: a drag (~0.8 m/s)
  minSpeed: 0.3, maxSpeed: 0.95,   // pair: speed multiplier at sync 0 / 1
  still: 0.4,            // m/s: below this a player counts as standing still
  bondBonus: 0.12,       // buddies read each other: a small sync bonus
  wobbleBelow: 0.5,      // sync under this = the item wobbles (camera sway + creak)
  turnSolo: 0.55, turnPair: 0.9,
};
/** how well two lifters move together, 0..1. va / vb = horizontal velocity {x, z} (m/s) of the two players */
export function syncOf(va, vb, bonded = false) {
  const ax = num(va?.x), az = num(va?.z), bx = num(vb?.x), bz = num(vb?.z);
  const sa = Math.hypot(ax, az), sb = Math.hypot(bx, bz), still = LIFT.still;
  let s;
  if (sa < still && sb < still) s = 1;                               // both standing: calm
  else if (sa < still || sb < still) s = Math.max(sa, sb) > 1 ? 0.35 : 0.7;   // one pulls, one stands: a drag (or just starting)
  else {
    const dot = (ax * bx + az * bz) / (sa * sb);                     // -1 opposite .. 1 same way
    const k = Math.pow((dot + 1) / 2, 1.5), ratio = Math.min(sa, sb) / Math.max(sa, sb);
    s = k * (0.6 + 0.4 * ratio);
  }
  return clamp(s + (bonded ? LIFT.bondBonus : 0), 0, 1);
}
export const liftSpeed = (sync) => lerp(LIFT.minSpeed, LIFT.maxSpeed, clamp(num(sync), 0, 1));
/** UI word for the bar */
export const syncWord = (sync) => (sync >= 0.75 ? 'SYNC' : sync >= 0.45 ? 'DRIFT' : 'FIGHTING IT');
/** exponential smoothing of a velocity sample. st = {x, z, px, pz, has} */
export function velStep(st, x, z, dt, k = 8) {
  if (!st.has) { st.has = true; st.px = x; st.pz = z; st.x = 0; st.z = 0; return st; }
  const d = Math.max(dt, 1e-3), vx = (x - st.px) / d, vz = (z - st.pz) / d, a = 1 - Math.exp(-k * d);
  st.px = x; st.pz = z;
  if (Math.hypot(vx, vz) > 20) return st;   // teleport / snap: ignore
  st.x += (vx - st.x) * a; st.z += (vz - st.z) * a;
  return st;
}

// ------------------------------------------------------------------------------------------------ falls
export const FALL = { min: 0.9, base: 0.06, perM: 0.07, max: 0.5, floor: 0.35, rest: 0.5, settle: 0.15 };
/** share of the base value lost by a fall of h metres (0 under FALL.min) */
export const fallPct = (h) => (num(h) < FALL.min ? 0 : clamp(FALL.base + (num(h) - FALL.min) * FALL.perM, 0, FALL.max));
/** value lost: pct of the base value, never below floor * base, whole numbers */
export function lossOf(base, cur, pct) {
  base = Math.max(0, num(base)); cur = Math.max(0, num(cur, base));
  const want = Math.max(1, Math.round(base * clamp(num(pct), 0, 1)));
  return Math.max(0, Math.min(want, cur - Math.ceil(base * FALL.floor)));
}
/** per-item fall tracker for an item lying in the world (host). st = {y, peak, rest}. Returns the fall height when it comes to rest, else 0 */
export function fallStep(st, y, dt, held) {
  if (held) { st.y = null; st.peak = -Infinity; st.rest = 0; return 0; }
  if (st.y == null) { st.y = y; st.peak = y; st.rest = 0; return 0; }
  const vy = (y - st.y) / Math.max(dt, 1e-3);
  st.y = y;
  if (y > st.peak) st.peak = y;
  if (Math.abs(vy) < FALL.rest) {
    st.rest += dt;
    if (st.rest >= FALL.settle) { const h = st.peak - y; st.peak = y; st.rest = FALL.settle; return h > 0 ? h : 0; }
  } else st.rest = 0;
  return 0;
}

// ------------------------------------------------------------------------------------------------ heavy doors
export const DOOR = {
  warn: 1.0,        // s of "nobody holds the lever" before the slam (alarm + flashing lever = the telegraph)
  grace: 9,         // s a freshly cracked door stays open before the rule bites
  ttl: 0.7,         // s a lever keepalive counts
  ping: 0.25,       // s between client keepalives
  near: 30,         // m: the door is heavy only while 2+ living crew are within this range (a lone player is never locked out or in)
  leverLat: 1.65,   // m: lever position along the wall from the door centre
  hold: 1.75,       // m client: max distance to the lever while holding
  holdHost: 2.1,    // m host slack
  busyR: 5,         // m: a giant carrier this close keeps the door open (never trap a team lift inside a vault)
  jamb: 1.3, plane: 0.9,   // m: the doorway box (half width / half depth): nobody holds the lever from inside it
  speedUp: 1.6,     // extra door.t units per second on top of the stock vault speed (0.5): a slam, and a quick hold-open
};
/** door frame {cx, cz, lx, lz (unit lateral), nx, nz (unit normal)} from a facility door ({ pos, info: { dir } }) */
export function doorFrame(door) {
  const along = door?.info?.dir === 1;
  return { cx: num(door?.pos?.x), cz: num(door?.pos?.z), y: num(door?.pos?.y), lx: along ? 1 : 0, lz: along ? 0 : 1, nx: along ? 0 : 1, nz: along ? 1 : 0 };
}
/** the two lever spots (one on each face of the door), {x, z} */
export function leverPoints(door) {
  const f = doorFrame(door), lat = DOOR.leverLat, off = 0.2;
  return [1, -1].map((s) => ({ x: f.cx + f.lx * lat + f.nx * off * s, z: f.cz + f.lz * lat + f.nz * off * s, side: s }));
}
/** lateral / normal offsets of a point from the door centre */
export function doorLocal(door, pos) {
  const f = doorFrame(door), dx = num(pos?.x) - f.cx, dz = num(pos?.z) - f.cz;
  return { lat: dx * f.lx + dz * f.lz, nrm: dx * f.nx + dz * f.nz };
}
export const inDoorway = (door, pos) => { const l = doorLocal(door, pos); return Math.abs(l.lat) < DOOR.jamb && Math.abs(l.nrm) < DOOR.plane; };
/** may `pos` hold the lever of this door (near a lever, not standing in the doorway)? */
export function holdOk(door, pos, limit = DOOR.hold) {
  if (!door || !pos || inDoorway(door, pos)) return false;
  return leverPoints(door).some((p) => Math.hypot(p.x - pos.x, p.z - pos.z) <= limit) && Math.abs(num(pos.y) - num(door.pos?.y)) < 3;
}
/** the door state machine (host). st = {last, warned}; ctx = { open, held, busy, enabled, now }. Returns 'open' | 'close' | 'warn' | null */
export function doorStep(st, ctx) {
  const now = num(ctx.now);
  if (st.last == null) { st.last = now + DOOR.grace; st.warned = false; }
  if (!ctx.enabled) { st.last = now + DOOR.grace * 0.9; st.warned = false; st.was = false; return ctx.open ? null : 'open'; }
  if (!st.was) { st.was = true; if (ctx.open) st.last = Math.max(st.last, now + DOOR.grace * 0.9); }   // partner walked into range: fresh grace
  if (ctx.held) { st.last = now; st.warned = false; return ctx.open ? null : 'open'; }
  if (!ctx.open) return null;
  if (ctx.busy) { st.last = now; st.warned = false; return null; }
  const idle = now - st.last;
  if (idle >= DOOR.warn) { st.warned = false; st.last = now + DOOR.grace * 0.3; return 'close'; }
  if (idle > 0 && !st.warned) { st.warned = true; return 'warn'; }
  return null;
}

// ------------------------------------------------------------------------------------------------ buddy bond
export const BOND = {
  near: 8, dy: 4,         // m: "together"
  gain: 1 / 40, decay: 1 / 90,   // per second: 40 s together fills it, 90 s apart empties it
  form: 0.75, lose: 0.35, // hysteresis: a bond forms at 75 %, only breaks under 35 % (~1 min apart)
  reviveMul: 0.65,        // reviver time x 0.65 for buddies (stacks with the Medic)
  stamina: 3.5,           // extra stamina / s while resting near the buddy (<= 14 m)
  staminaR: 14,
  pingLife: 4,            // s longer ping markers from a buddy
};
export class BondBook {
  constructor() { this.m = new Map(); }
  static key(a, b) { return String(a) < String(b) ? a + '|' + b : b + '|' + a; }
  /** players: [{ id, x, y, z, frozen }] (frozen = down / dead: the bond neither grows nor decays). Returns { formed: [[a,b]], lost: [[a,b]] } */
  step(dt, players) {
    const out = { formed: [], lost: [] }, ids = new Set(players.map((p) => String(p.id)));
    for (const k of [...this.m.keys()]) { const [a, b] = k.split('|'); if (!ids.has(a) || !ids.has(b)) { if (this.m.get(k).on) out.lost.push([a, b]); this.m.delete(k); } }
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const A = players[i], B = players[j];
      if (A.frozen || B.frozen) continue;
      const k = BondBook.key(A.id, B.id);
      let e = this.m.get(k);
      const near = Math.hypot(A.x - B.x, A.z - B.z) <= BOND.near && Math.abs(A.y - B.y) <= BOND.dy;
      if (!e) { if (!near) continue; e = { v: 0, on: false }; this.m.set(k, e); }
      e.v = clamp(e.v + (near ? BOND.gain : -BOND.decay) * dt, 0, 1);
      if (!e.on && e.v >= BOND.form && near) { e.on = true; out.formed.push(k.split('|')); }
      else if (e.on && e.v < BOND.lose) { e.on = false; out.lost.push(k.split('|')); }
      else if (!e.on && e.v <= 0) this.m.delete(k);
    }
    // one buddy each: the stronger bond wins, the weaker one drops (silently back under the formation line)
    const best = new Map();
    for (const [k, e] of this.m) if (e.on) for (const id of k.split('|')) { const b = best.get(id); if (!b || e.v > this.m.get(b).v) best.set(id, k); }
    for (const [k, e] of this.m) if (e.on && k.split('|').some((id) => best.get(id) !== k)) { e.on = false; e.v = Math.min(e.v, BOND.form - 0.05); out.lost.push(k.split('|')); }
    return out;
  }
  /** a shared moment (high-five) pushes the bond up */
  boost(a, b, dv) { const k = BondBook.key(a, b), e = this.m.get(k) || { v: 0, on: false }; e.v = clamp(e.v + dv, 0, 1); this.m.set(k, e); }
  buddyOf(id) { id = String(id); for (const [k, e] of this.m) if (e.on) { const [a, b] = k.split('|'); if (a === id) return b; if (b === id) return a; } return null; }
  bonded(a, b) { return !!this.m.get(BondBook.key(a, b))?.on; }
  strength(a, b) { return this.m.get(BondBook.key(a, b))?.v ?? 0; }
  pairs() { const o = []; for (const [k, e] of this.m) if (e.on) o.push(k.split('|')); return o; }
  /** rebuild from a mirrored snapshot (late join / host migration) */
  load(pairs) { this.m.clear(); for (const p of pairs || []) if (Array.isArray(p) && p.length >= 2) this.m.set(BondBook.key(p[0], p[1]), { v: 0.9, on: true }); }
}
/** reviver time multiplier for a bonded reviver / victim pair */
export const reviveMul = (bonded) => (bonded ? BOND.reviveMul : 1);

// ------------------------------------------------------------------------------------------------ high five
export const HF = {
  reach: 2.8,        // m between the two hands
  prompt: 2.6,       // m: the [E] prompt shows on a crewmate this close (in front)
  fresh: 0.7,        // s an offer counts (keepalive every 0.2 s while E is held)
  ping: 0.2,
  cd: 8,             // s per pair
  face: 0.35,        // cos: each must look at the other
  buffS: 45, stamina: 25, regen: 2.5,   // morale: +25 stamina now, +2.5 / s regen for 45 s (tiny on purpose)
  handTtl: 3,        // s the "raised hand" prompt stays on the receiving side
};
/** does a player at `from` looking with `yaw` (camera yaw, forward = (-sin, -cos)) face `to`? */
export function facing(yaw, from, to, min = HF.face) {
  const dx = num(to?.x) - num(from?.x), dz = num(to?.z) - num(from?.z), d = Math.hypot(dx, dz);
  if (d < 1e-3) return true;
  return (-Math.sin(num(yaw)) * dx - Math.cos(num(yaw)) * dz) / d >= min;
}
export class HighFiveBook {
  constructor() { this.offers = new Map(); this.cd = new Map(); }
  /** `from` holds a hand out to `to`. Returns 'hand' when this is a new offer (announce it), else null */
  offer(from, to, now) {
    const o = this.offers.get(from), isNew = !o || o.to !== to || now - o.t > HF.fresh;
    this.offers.set(from, { to, t: now });
    return isNew ? 'hand' : null;
  }
  cancel(from) { this.offers.delete(from); }
  /** both hands out at the same time, close enough, facing, not on cooldown -> true (and starts the cooldown) */
  match(a, b, now, info) {
    const oa = this.offers.get(a), ob = this.offers.get(b);
    if (!oa || !ob || oa.to !== b || ob.to !== a || now - oa.t > HF.fresh || now - ob.t > HF.fresh) return false;
    const k = BondBook.key(a, b);
    if (now - (this.cd.get(k) ?? -99) < HF.cd) return false;
    if (!(info.dist <= HF.reach) || !info.faceA || !info.faceB) return false;
    this.cd.set(k, now); this.offers.delete(a); this.offers.delete(b);
    return true;
  }
}
