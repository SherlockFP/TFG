// [finish] MAPS2 RULES (pure, node-tested by tools/harness/maps2_rules.test.mjs): the numbers and state machines of the challenge rooms and
// the Collapse / Migration events. No three.js, no game object. Runtime glue: maps2_challenge.js / maps2_events.js.

// ---------------------------------------------------------------------------------------------------- PHYSICS room (weight on a plate)
export const PLATE = { need: 60, hold: 1.4, r: 1.05, weights: ['bell', 'pot', 'axle', 'bolt'], reward: 3 };
/** total weight of the items lying on the plate (items: [{ x, y, z, weight }]) */
export function plateWeight(items, cx, cy, cz, r = PLATE.r) {
  let w = 0;
  for (const it of items) if (Math.hypot(it.x - cx, it.z - cz) <= r && Math.abs(it.y - cy) < 1.3) w += it.weight || 0;
  return w;
}
/** hold timer: returns { f, t, done } after dt seconds with `weight` on the plate */
export function plateStep(st, weight, dt) {
  const f = Math.min(1, weight / PLATE.need);
  st.f = f;
  st.t = f >= 1 ? (st.t || 0) + dt : 0;
  st.done = st.done || st.t >= PLATE.hold;
  return st;
}

// ---------------------------------------------------------------------------------------------------- GAMBLE room (fate lever)
export const GAMBLE = { cost: 40, cooldown: 2.5, maxPulls: 6 };
// weights: jackpot / win / loot / nothing / curse / blast
export const GAMBLE_TABLE = [['jackpot', 5], ['win', 24], ['loot', 24], ['nothing', 27], ['curse', 12], ['blast', 8]];
export function gambleOutcome(rand = Math.random, quotaIndex = 0) {
  let tot = 0; for (const [, w] of GAMBLE_TABLE) tot += w;
  let r = rand() * tot, kind = 'nothing';
  for (const [k, w] of GAMBLE_TABLE) { r -= w; if (r < 0) { kind = k; break; } }
  const qi = Math.max(0, quotaIndex);
  switch (kind) {
    case 'jackpot': return { kind, credits: 220 + 25 * qi, items: 2 };
    case 'win': return { kind, credits: 90 + 10 * qi };
    case 'loot': return { kind, items: 1 };
    case 'curse': return { kind, spawn: 2 };
    case 'blast': return { kind, dmg: 22 };
    default: return { kind: 'nothing' };
  }
}
/** expected credit value of one pull (test asserts it is close to the cost: a fair-ish gamble with real risk) */
export function gambleEV(quotaIndex = 0, itemValue = 45) {
  let tot = 0, ev = 0;
  for (const [k, w] of GAMBLE_TABLE) {
    tot += w;
    const o = k === 'jackpot' ? { credits: 220 + 25 * quotaIndex, items: 2 } : k === 'win' ? { credits: 90 + 10 * quotaIndex } : k === 'loot' ? { items: 1 } : {};
    ev += w * ((o.credits || 0) + (o.items || 0) * itemValue);
  }
  return ev / tot;
}

// ---------------------------------------------------------------------------------------------------- PUZZLE room (two levers + colour code)
export const PUZZLE = { window: 1.0, soloWindow: 6.0, reveal: 25, leverReturn: 1.3 };
export function newPuzzle() { return { t: [-99, -99], revealT: 0, pos: 0, done: false, fails: 0 }; }
/** a lever i was pulled at time `now` (seconds). Returns 'reveal' when both levers landed inside the window. */
export function puzzleLever(st, i, now, crew = 2) {
  if (st.done) return 'done';
  st.t[i] = now;
  const other = st.t[1 - i], win = crew > 1 ? PUZZLE.window : PUZZLE.soloWindow;
  if (now - other <= win) { st.revealT = now + PUZZLE.reveal; st.pos = 0; st.t = [-99, -99]; return 'reveal'; }
  return 'wait';
}
/** a colour button was pressed. Returns 'ok' | 'solved' | 'fail' | 'locked' (code not revealed) */
export function puzzleButton(st, i, seq, now) {
  if (st.done) return 'done';
  if (now > st.revealT) return 'locked';
  if (seq[st.pos] === i) { st.pos++; if (st.pos >= seq.length) { st.done = true; return 'solved'; } return 'ok'; }
  st.pos = 0; st.revealT = 0; st.fails++;
  return 'fail';
}

// ---------------------------------------------------------------------------------------------------- ARENA room (two waves behind shutters)
export const ARENA = { timeout: 190, wipe: 10, waves: 2 };
/** creature list for a wave: [{ type, n }] (types exist for the 'in' zone; scuttler swarm, crawler brute) */
export function arenaWave(wave, crew = 1, quotaIndex = 0) {
  crew = Math.max(1, Math.min(8, crew));
  if (wave <= 1) return [{ type: 'scuttler', n: 3 + crew }];
  return [{ type: 'scuttler', n: 2 + crew }, { type: 'crawler', n: 1 + Math.floor((crew - 1) / 3) + (quotaIndex >= 8 ? 1 : 0) }];
}
export function arenaReward(crew = 1, quotaIndex = 0) { return { credits: 70 + 15 * quotaIndex, items: 3 + (crew > 2 ? 1 : 0) }; }

// ---------------------------------------------------------------------------------------------------- TREASURE room (idol -> collapse)
export const TREASURE = { warn: 3.5, seal: 5, rocks: 9, rockEvery: 1.5, telegraph: 1.2, dmg: 18, hitR: 1.6 };
/** rock fall points inside a room rect (rand injected, keeps 1.2 m from the walls) */
export function rockPoints(r, n, rand = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([r.x0 + 1.2 + rand() * Math.max(0.1, r.x1 - r.x0 - 2.4), r.z0 + 1.2 + rand() * Math.max(0.1, r.z1 - r.z0 - 2.4)]);
  return out;
}

// ---------------------------------------------------------------------------------------------------- EVENTS
export const EVENTS = { minQuota: 1, collapseChance: 0.24, migrationChance: 0.2, startMin: 70, startMax: 260, migrateFor: 45, migrateSpawn: [3, 5] };
/** which event (if any) a moon day gets: returns 'collapse' | 'migration' | null */
export function rollEvent(rand = Math.random, quotaIndex = 0, facilityOk = true) {
  if (!facilityOk || quotaIndex < EVENTS.minQuota) return null;
  const r = rand();
  if (r < EVENTS.collapseChance) return 'collapse';
  if (r < EVENTS.collapseChance + EVENTS.migrationChance) return 'migration';
  return null;
}
/** choose a corridor edge to collapse: 14..45 m from the nearest player (never on top of the crew), prefers ~24 m ahead of a random one */
export function pickCollapseEdge(edges, players, rand = Math.random) {
  if (!edges?.length || !players?.length) return null;
  const anchor = players[Math.floor(rand() * players.length) % players.length];
  const cands = [];
  for (const e of edges) {
    let dmin = 1e9;
    for (const p of players) dmin = Math.min(dmin, Math.hypot(p.x - e.x, p.z - e.z));
    if (dmin < 14 || dmin > 45) continue;
    cands.push({ e, s: Math.abs(Math.hypot(anchor.x - e.x, anchor.z - e.z) - 24) + rand() * 6 });
  }
  cands.sort((a, b) => a.s - b.s);
  return cands[0]?.e || null;
}
/** farthest room centre from every player (migration target / spawn side) */
export function pickFarRoom(rooms, players, rand = Math.random) {
  if (!rooms?.length) return null;
  const scored = rooms.map((r) => ({ r, d: players.length ? Math.min(...players.map((p) => Math.hypot(p.x - r.cx, p.z - r.cz))) : rand() * 50 }));
  scored.sort((a, b) => b.d - a.d);
  return scored[Math.floor(rand() * Math.min(3, scored.length))].r;
}

// ---------------------------------------------------------------------------------------------------- FURNITURE (drawers / PCs / radios / phones)
export const FURN = { drawerLoot: 0.32, drawerNote: 0.14, drawerJunk: 0.2, pcCredits: 0.22, phoneRing: 0.12 };
/** deterministic content of a piece of furniture: same result on every peer for (seed, id). kinds: drawer pc radio phone */
export function furnitureRoll(seedInt, id, kind, rnd) {
  const r = rnd(seedInt, id);
  if (kind === 'drawer') {
    if (r < FURN.drawerLoot) return { what: 'loot' };
    if (r < FURN.drawerLoot + FURN.drawerNote) return { what: 'note', n: Math.floor(rnd(seedInt, id + 'n') * 1000) };
    if (r < FURN.drawerLoot + FURN.drawerNote + FURN.drawerJunk) return { what: 'junk' };
    return { what: 'empty' };
  }
  if (kind === 'pc') {
    if (r < FURN.pcCredits) return { what: 'credits', n: 12 + Math.floor(rnd(seedInt, id + 'c') * 24) };
    return { what: 'log', n: Math.floor(rnd(seedInt, id + 'n') * 1000) };
  }
  if (kind === 'radio') return { what: r < 0.5 ? 'signal' : 'static', n: Math.floor(rnd(seedInt, id + 'n') * 1000) };
  if (kind === 'phone') return { what: r < FURN.phoneRing ? 'noise' : 'voicemail', n: Math.floor(rnd(seedInt, id + 'n') * 1000) };
  return { what: 'empty' };
}
export function hash01(seed, str) {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
