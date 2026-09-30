// HOMESTEAD core ("KEFAL YURDU", wave 8 tycoon, module 'homestead'; docs/wave8/tycoon.md): a Roblox-style plot tycoon on the homeworld. PURE data + rules (no three / DOM / game
// access), node-tested by tools/harness/homestead.test.mjs. A dropper -> belt -> gate -> collector line pays a small, hard-capped trickle of credits and the money builds a
// lodge (house) one glowing pad at a time. Persistent state = profile.homestead (sanitize), mirrored to everyone as run.hs.
// Economy rules that matter (the sim gate in tools/sim/economy.mjs checks them): production is REAL time while a run is live, capped per game day (capOf), the pile holds at most
// 2 days, a new run id never refreshes the day cap, credits are never multiplied, Clout is paid at most once per game day. The plot is a net credit sink for ~40 game days.

export const VERSION = 1;

// ---------------------------------------------------------------------------------------------- plot (world metres, homeworld plateau half = 58)
// South band outside the build square (|x|,|z| <= 45), between the SW memorial (x <= -46.7) and the south lane (|x| < 7). Its nearest corner (-20, 48.6) is 52.55 m from the origin,
// beyond RAID.spawnR (52) + 0.4, so raiders never spawn inside it. Fence panels at z = 47.3 are soft (no collider).
export const PLOT = { x0: -44, x1: -20, z0: 48.6, z1: 56.4 };
export const BELT = { z: 49.6, x0: -42.5, x1: -23.5, w: 0.8 };                // belt row, flows west -> east into the collector
export const LODGE = { x0: -43.5, x1: -27, z0: 52.4, z1: 56.4, wall: 0.2, door: 1.6, h: 2.6 };
export const ROOMS = [[-43.5, -38], [-38, -32.5], [-32.5, -27]];              // three rooms of 5.5 m, each with a door gap in the front wall (facing the walkway)
export const PORCH = { x0: -26.5, x1: -24, z0: 52.4, z1: 56.4 };
export const COLLECTOR = { x: -21.5, z: 49.8 };                                  // gold collector pad (stand on it to collect)
export const BOOTH = { x: -21.5, z: 48.9, hx: 0.9, hz: 0.3, h: 2.2 };          // booth with the tally board
export const CLAIM_PAD = [-21, 52.6];
export const RECLAIM_PAD = [-21.2, 54.9];
export const DWELL_R = 0.95, USE_R = 2.4;                                        // stand radius on a pad / server-side distance check

/** Line pieces (line:true) reset on Re-Claim, lodge pieces stay. cap = game-day production cap once built (highest one wins). at = machine origin, pad = the glowing buy pad. */
export const PIECES = [
  { id: 'claim', kind: 'claim', line: true, name: 'Claim the plot', cost: 0, req: null, at: [-21, 52.6], pad: CLAIM_PAD },
  { id: 'drop1', kind: 'drop', line: true, name: 'Scrap Dropper I', cost: 40, req: 'claim', at: [-42, 49.6], pad: [-42, 51.4], col: [[0, 0, 0.35, 0.35]] },
  { id: 'belt', kind: 'belt', line: true, name: 'Belt', cost: 30, req: 'drop1', cap: 16, at: [-33, 49.6], pad: [-35.8, 51.4] },
  { id: 'gate1', kind: 'gate', tier: 1, line: true, name: 'Smelter Gate', cost: 80, req: 'belt', cap: 24, at: [-33.6, 49.6], pad: [-33.6, 51.4], col: [[0, -0.55, 0.3, 0.12], [0, 0.55, 0.3, 0.12]] },
  { id: 'drop2', kind: 'drop', line: true, name: 'Scrap Dropper II', cost: 90, req: 'gate1', cap: 30, at: [-40, 49.6], pad: [-40, 51.4], col: [[0, 0, 0.35, 0.35]] },
  { id: 'gate2', kind: 'gate', tier: 2, line: true, name: 'Press Gate', cost: 180, req: 'drop2', cap: 38, at: [-31.4, 49.6], pad: [-31.4, 51.4], col: [[0, -0.55, 0.3, 0.12], [0, 0.55, 0.3, 0.12]] },
  { id: 'drop3', kind: 'drop', line: true, name: 'Scrap Dropper III', cost: 260, req: 'gate2', cap: 44, at: [-38, 49.6], pad: [-38, 51.4], col: [[0, 0, 0.35, 0.35]] },
  { id: 'gate3', kind: 'gate', tier: 3, line: true, name: 'Polish Gate', cost: 450, req: 'drop3', cap: 50, at: [-29.2, 49.6], pad: [-29.2, 51.4], col: [[0, -0.55, 0.3, 0.12], [0, 0.55, 0.3, 0.12]] },
  { id: 'auto', kind: 'auto', line: true, name: 'Sweeper Arm', cost: 400, req: 'drop2', at: [-25.2, 49.6], pad: [-27, 51.4], col: [[0, -0.5, 0.2, 0.2]] },
  { id: 'found', kind: 'lodge', name: 'Lodge Foundation', cost: 120, req: 'claim', at: [-35.2, 54.4], pad: [-42.6, 53.5] },
  { id: 'bunk', kind: 'lodge', room: 0, name: 'Bunk Room', cost: 150, req: 'found', at: [-40.75, 54.4], pad: [-40.75, 54.6] },
  { id: 'hearth', kind: 'lodge', room: 1, name: 'Hearth', cost: 260, req: 'bunk', at: [-35.25, 55.9], pad: [-35.25, 54.4] },
  { id: 'shop', kind: 'lodge', room: 2, name: 'Workshop', cost: 380, req: 'hearth', at: [-29.75, 55.6], pad: [-29.75, 54.4] },
  { id: 'porch', kind: 'lodge', name: 'Porch', cost: 180, req: 'shop', at: [-25.25, 54.4], pad: [-25.25, 55.3] },
  { id: 'roof', kind: 'lodge', name: 'Roof', cost: 600, req: 'porch', at: [-35.2, 54.4], pad: [-25.25, 53.3] },
];
export const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]));
export const PIECE_IDS = PIECES.map((p) => p.id);
export const LINE_IDS = PIECES.filter((p) => p.line && p.cost > 0).map((p) => p.id);
export const LODGE_IDS = PIECES.filter((p) => !p.line).map((p) => p.id);
export const lineTotal = () => PIECES.filter((p) => p.line).reduce((a, p) => a + p.cost, 0);
export const lodgeTotal = () => PIECES.filter((p) => !p.line).reduce((a, p) => a + p.cost, 0);
export const padOf = (p) => p.pad || p.at;
export const MAX_RB = 3;

/** every constant of the economy (the sim gate lowers capScale only, never prices) */
export const TY = {
  rampS: 180,          // seconds for a fresh day's cap to pour out (cap / rampS per second)
  capScale: 1,         // 0.5..1, the sim knob
  pileMul: 2,          // the collector pile holds 2 days of cap
  autoEvery: 30,       // sweeper arm period (s), HOME only, pays no Clout
  cloutMax: 6,         // Clout per collect (once per game day): min(cloutMax, 1 + rooms + rb)
  rebuildMul: 0.75,    // line re-buy price after a Re-Claim
  reclaimBase: 1200, reclaimStep: 600,
  dtMax: 5,            // one tick never books more than this many seconds
  maxBy: 8,
};
export const reclaimCost = (rb) => TY.reclaimBase + TY.reclaimStep * Math.max(0, rb | 0);
export const beltSpeedMul = (rb) => 1 + 0.12 * Math.max(0, Math.min(MAX_RB, rb | 0));   // cosmetic only (never raises the cap)
export const SKINS = ['plain', 'chrome', 'neon', 'prism'];                            // cube skin per star

const num = (v, lo, hi, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const cleanName = (v) => String(v ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 24);

export function blank() {
  return { v: VERSION, b: [], rb: 0, pile: 0, g: { run: '', day: 0, n: 0 }, cl: 1, who: {}, by: {}, st: { earned: 0, collects: 0 } };
}
export const has = (s, id) => s.b.includes(id);
export const capScale = () => num(TY.capScale, 0.5, 1, 1);
/** game-day production cap of the highest cap piece built x capScale (0 without the belt) */
export const capOf = (s) => capScale() * PIECES.reduce((m, p) => (p.cap && has(s, p.id) ? Math.max(m, p.cap) : m), 0);
export const pileCap = (s) => capOf(s) * TY.pileMul;
/** furnished rooms (bunk / hearth / workshop) */
export const roomsOf = (s) => PIECES.filter((p) => p.room != null && has(s, p.id)).length;
export const cloutOf = (s) => Math.min(TY.cloutMax, 1 + roomsOf(s) + s.rb);
/** price of a piece for this state (line pieces cost 75 % after a Re-Claim) */
export const priceOf = (s, p) => (p.line && s.rb > 0 ? Math.round(p.cost * TY.rebuildMul) : p.cost);

export function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  s.b = (Array.isArray(raw.b) ? raw.b : []).filter((id, i, a) => typeof id === 'string' && PIECE[id] && a.indexOf(id) === i);
  for (let pass = 0; pass < PIECES.length; pass++) { const n = s.b.length; s.b = s.b.filter((id) => !PIECE[id].req || s.b.includes(PIECE[id].req)); if (s.b.length === n) break; }
  s.rb = Math.floor(num(raw.rb, 0, MAX_RB));
  s.cl = raw.cl === 0 ? 0 : 1;
  if (raw.g && typeof raw.g === 'object') s.g = { run: String(raw.g.run || '').slice(0, 40), day: Math.floor(num(raw.g.day, 0, 99999)), n: num(raw.g.n, 0, 99999) };
  if (raw.who && typeof raw.who === 'object') for (const [k, v] of Object.entries(raw.who)) if (PIECE[k] && s.b.includes(k)) { const nm = cleanName(v); if (nm) s.who[k] = nm; }
  if (raw.by && typeof raw.by === 'object') {
    const e = Object.entries(raw.by).map(([k, v]) => [cleanName(k), num(v, 0, 1e9)]).filter(([k, v]) => k && v > 0).sort((a, b) => b[1] - a[1]).slice(0, TY.maxBy);
    for (const [k, v] of e) s.by[k] = Math.round(v);
  }
  if (raw.st && typeof raw.st === 'object') for (const k of Object.keys(s.st)) s.st[k] = Math.floor(num(raw.st[k], 0, 1e9));
  s.pile = Math.min(num(raw.pile, 0, 1e6), Math.max(pileCap(s), 0));
  return s;
}

/** the next pads to show: not built, requirement met, catalogue order, at most n */
export const available = (s, n = 3) => PIECES.filter((p) => !has(s, p.id) && (!p.req || has(s, p.req))).slice(0, n);

/** buy a piece: {ok, why?, cost}. Mutates only on success. wallet = {cr}. who = buyer name (plaque + spenders list). */
export function tryBuy(s, wallet, id, who = '') {
  const p = PIECE[id];
  if (!p) return { ok: false, why: 'Unknown piece.' };
  if (has(s, id)) return { ok: false, why: 'owned' };
  if (p.req && !has(s, p.req)) return { ok: false, why: 'Build the previous piece first.' };
  const cost = priceOf(s, p);
  if (!(wallet.cr >= cost)) return { ok: false, why: 'Not enough credits.' };
  wallet.cr -= cost; s.b.push(id);
  const nm = cleanName(who);
  if (nm) {
    s.who[id] = nm;
    if (cost > 0) {
      s.by[nm] = (s.by[nm] || 0) + cost;
      const e = Object.entries(s.by).sort((a, b) => b[1] - a[1]).slice(0, TY.maxBy); s.by = Object.fromEntries(e);
    }
  }
  return { ok: true, cost };
}

/** day / run bookkeeping. A new run id only re-anchors the mark; a rewound day is ignored; only day > mark within the same run refreshes the day cap + Clout. Returns true on refresh. */
export function advance(s, runId, day) {
  const g = s.g; runId = String(runId || ''); day = Math.floor(Number(day) || 0);
  if (g.run !== runId) { g.run = runId; g.day = day; return false; }
  if (day > g.day) { g.day = day; g.n = 0; s.cl = 1; return true; }
  return false;
}
/** production for dt seconds of real time. Returns the amount added to the pile. */
export function tick(s, dt, runId, day) {
  advance(s, runId, day);
  const cap = capOf(s);
  dt = num(dt, 0, TY.dtMax);
  if (!(cap > 0) || !(dt > 0)) return 0;
  const add = Math.max(0, Math.min(cap / TY.rampS * dt, cap - s.g.n, pileCap(s) - s.pile));
  s.g.n += add; s.pile += add; return add;
}
/** pay floor(pile) into the wallet. auto = the sweeper arm (never pays Clout). Returns {ok, n, clout}. */
export function collect(s, wallet, auto = false) {
  const n = Math.floor(s.pile + 1e-9);
  if (n < 1) return { ok: false, n: 0, clout: 0 };
  s.pile = Math.max(0, s.pile - n); wallet.cr += n; s.st.earned += n; s.st.collects += 1;
  let clout = 0;
  if (!auto && s.cl) { clout = cloutOf(s); s.cl = 0; }
  return { ok: true, n, clout };
}
export const canReclaim = (s) => has(s, 'roof') && has(s, 'gate3') && s.rb < MAX_RB;
/** Re-Claim: a credit sink for a star (cube skin + belt speed look). Line pieces and the pile reset (the pile is paid out first), the lodge stays, caps are unchanged. */
export function reclaim(s, wallet) {
  if (!has(s, 'gate3') || !has(s, 'roof')) return { ok: false, why: 'Needs the Polish Gate and the Roof.' };
  if (s.rb >= MAX_RB) return { ok: false, why: 'Maximum stars.' };
  const cost = reclaimCost(s.rb);
  if (!(wallet.cr >= cost)) return { ok: false, why: 'Not enough credits.' };
  wallet.cr -= cost;
  const paid = Math.floor(s.pile + 1e-9); wallet.cr += paid; s.st.earned += paid; s.pile = 0;
  s.b = s.b.filter((id) => !PIECE[id].line || id === 'claim');
  for (const id of Object.keys(s.who)) if (!s.b.includes(id)) delete s.who[id];
  s.rb += 1;
  return { ok: true, cost, paid, rb: s.rb };
}

// ---------------------------------------------------------------------------------------------- collision + layout data (shared by view, module and the overlap tests)
/** static AABBs {x, z, hx, hz, h} of ONE piece: the claim booth, the lodge walls (with a door gap per room) for 'found', machine posts */
export function collidersFor(id) {
  const out = [], box = (x, z, hx, hz, h) => out.push({ x, z, hx, hz, h });
  const p = PIECE[id];
  if (!p) return out;
  if (id === 'claim') box(BOOTH.x, BOOTH.z, BOOTH.hx, BOOTH.hz, BOOTH.h);
  if (id === 'found') {
    const L = LODGE, w = L.wall / 2;
    box((L.x0 + L.x1) / 2, L.z1 - w, (L.x1 - L.x0) / 2, w, L.h);                         // back wall
    for (const [a, b] of ROOMS) {
      const cx = (a + b) / 2, d = L.door / 2;
      box((a + cx - d) / 2, L.z0 + w, (cx - d - a) / 2, w, L.h); box((cx + d + b) / 2, L.z0 + w, (b - cx - d) / 2, w, L.h);   // front wall left / right of the door
    }
    for (const x of [ROOMS[0][0], ROOMS[1][0], ROOMS[2][0], ROOMS[2][1]]) box(x, (L.z0 + L.z1) / 2, w, (L.z1 - L.z0) / 2, L.h);   // side + partition walls
  }
  for (const [dx, dz, hx, hz] of p.col || []) box(p.at[0] + dx, p.at[1] + dz, hx, hz, 1.6);
  return out;
}
/** all AABBs of the built pieces (s = null: every piece, for the overlap tests) */
export const collidersOf = (s) => PIECES.filter((p) => !s || has(s, p.id)).flatMap((p) => collidersFor(p.id));
export const ALL_PADS = () => [...PIECES.filter((p) => p.cost > 0 || p.id === 'claim').map((p) => ({ id: p.id, x: padOf(p)[0], z: padOf(p)[1] })), { id: 'reclaim', x: RECLAIM_PAD[0], z: RECLAIM_PAD[1] }];
export const inPlot = (x, z, m = 0) => x >= PLOT.x0 + m && x <= PLOT.x1 - m && z >= PLOT.z0 + m && z <= PLOT.z1 - m;
