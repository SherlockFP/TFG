// CHESS3D pure helpers (no three / DOM): board square <-> table-local mapping, snapshot -> piece list, camera pose, and the pick -> move translator.
// Table-local frame (matches models/arcade.js): x = file, z = -rank (White sits on +z), board centred on the origin, SQ = 0.1 m per square, top at TOP_Y.
//   sq = rank * 8 + file (a1 = 0, h8 = 63), the same index as chess_rules / draughts_rules / arcade_core snapshots.
export const SQ = 0.1;
export const TOP_Y = 0.78;
export const sqFile = (sq) => sq & 7;
export const sqRank = (sq) => sq >> 3;

/** centre of a square in table-local metres */
export function sqToLocal(sq) { return { x: (sqFile(sq) - 3.5) * SQ, z: (3.5 - sqRank(sq)) * SQ }; }
/** table-local (x, z) -> square index, or -1 when off the board */
export function localToSq(x, z) {
  const f = Math.floor(x / SQ + 4), r = Math.floor(4 - z / SQ);
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
}
/** ray (table-local origin + direction) -> square under the horizontal plane y = planeY, or -1 */
export function rayToSq(o, d, planeY = TOP_Y + 0.03) {
  const p = rayToPoint(o, d, planeY);
  return p ? localToSq(p.x, p.z) : -1;
}
/** same intersection but returns the point (for dragging, clamps nothing) */
export function rayToPoint(o, d, planeY) {
  if (Math.abs(d.y) < 1e-6) return null;
  const u = (planeY - o.y) / d.y;
  return u < 0 ? null : { x: o.x + d.x * u, z: o.z + d.z * u };
}

/** snapshot -> [{ sq, t, c }]; t is 'p n b r q k' (chess) or 'man' / 'king' (dama); c is 'w' | 'b' */
export function piecesOf(kind, pos) {
  const out = [];
  if (kind === 'draughts') {
    const bs = String(pos).split('|')[0];
    for (let i = 0; i < 64 && i < bs.length; i++) {
      const ch = bs[i];
      if (ch === '.' || !ch) continue;
      out.push({ sq: i, t: ch === 'W' || ch === 'B' ? 'king' : 'man', c: ch.toLowerCase() === 'w' ? 'w' : 'b' });
    }
  } else {
    const rows = String(pos).split(' ')[0].split('/');
    for (let i = 0; i < 8; i++) {
      let f = 0;
      for (const ch of rows[i] || '') {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        out.push({ sq: (7 - i) * 8 + f, t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b' });
        f++;
      }
    }
  }
  return out;
}
/** instance count per mesh key `${t}_${c}` (one InstancedMesh each; chess <= 12 keys, dama <= 4) */
export function instanceCounts(list) {
  const n = {};
  for (const p of list) n[p.t + '_' + p.c] = (n[p.t + '_' + p.c] || 0) + 1;
  return n;
}
const START_N = { p: 8, n: 2, b: 2, r: 2, q: 1 };
/** chess: pieces each colour has LOST so far, as { w: ['q','p',..], b: [...] } (biggest first; promotions are netted off against missing pawns). draughts: {w:[],b:[]} */
export function capturedOf(kind, list) {
  const out = { w: [], b: [] };
  if (kind === 'draughts') return out;
  for (const c of ['w', 'b']) {
    const have = {}; for (const p of list) if (p.c === c) have[p.t] = (have[p.t] || 0) + 1;
    let promoted = 0;
    for (const t of ['q', 'r', 'b', 'n']) promoted += Math.max(0, (have[t] || 0) - START_N[t]);
    const miss = { p: Math.max(0, START_N.p - (have.p || 0) - promoted) };
    for (const t of ['q', 'r', 'b', 'n']) miss[t] = Math.max(0, START_N[t] - (have[t] || 0));
    for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = 0; i < miss[t]; i++) out[c].push(t);
  }
  return out;
}
/** king square of the side to move when it is in check (chess only), else -1 */
export function checkSquare(kind, list, turn, check) {
  if (kind === 'draughts' || !check) return -1;
  const k = list.find((p) => p.t === 'k' && p.c === turn);
  return k ? k.sq : -1;
}
/** which pieces moved between two piece lists: [{ from, to, t, c }] (castling = 2, a capture leaves the victim unmatched); [] when nothing moved */
export function diffMoves(prev, next) {
  const key = (p) => p.sq + p.t + p.c;
  const pk = new Set(prev.map(key)), nk = new Set(next.map(key));
  const deps = prev.filter((p) => !nk.has(key(p))).map((p) => ({ ...p })), arrs = next.filter((p) => !pk.has(key(p))).map((p) => ({ ...p }));
  const out = [];
  const dist = (a, b) => Math.abs(sqFile(a) - sqFile(b)) + Math.abs(sqRank(a) - sqRank(b));
  for (const pass of [0, 1]) {
    for (const a of arrs) {
      if (a.done) continue;
      let best = null;
      for (const d of deps) if (!d.done && d.c === a.c && (pass === 1 || d.t === a.t) && (!best || dist(d.sq, a.sq) < dist(best.sq, a.sq))) best = d;
      if (best) { best.done = a.done = true; out.push({ from: best.sq, to: a.sq, t: a.t, c: a.c }); }
    }
  }
  return out;
}

/** camera pose in table-local metres for a viewer: eye above the near edge looking at the board centre (black sits on -z) */
export function viewPose(color = 'w') {
  const s = color === 'b' ? -1 : 1;
  return { eye: { x: 0, y: TOP_Y + 0.82, z: 0.36 * s }, target: { x: 0, y: TOP_Y, z: -0.03 * s }, fov: 46 };
}

// ------------------------------------------------------------------------------------------------ pick -> move
/** Selection state machine used by the 3D view (the 2D panel keeps its own copy of the same rules). Returns move payloads for arreq 'move' ({ m }). */
export function createPicker() {
  const P = {
    sel: -1, prefix: [], promo: null,
    reset() { P.sel = -1; P.prefix = []; P.promo = null; },
    /** moves the seat may play this turn (empty when spectating / not your turn / game over) */
    candidates(snap, dec, me) { return !me || snap.over || dec.st.turn !== me ? [] : dec.moves; },
    from(snap, dec, me, sq) { return P.candidates(snap, dec, me).filter((m) => m.f === sq); },
    /** Map sq -> 'cap' | '' for the current selection */
    targets(snap, dec, me) {
      const out = new Map();
      if (P.sel < 0) return out;
      const ms = P.from(snap, dec, me, P.sel);
      if (snap.kind === 'draughts') {
        for (const m of ms) if (m.path.length > P.prefix.length && P.prefix.every((q, i) => m.path[i] === q)) out.set(m.path[P.prefix.length], m.caps.length ? 'cap' : '');
      } else for (const m of ms) out.set(m.t, m.cap ? 'cap' : '');
      return out;
    },
    /** can a press on this square start a drag (own movable piece)? */
    canPick(snap, dec, me, sq) { return !P.promo && P.candidates(snap, dec, me).some((m) => m.f === sq); },
    /** click / drop on a square -> { m?: number[], promo?: true, changed: bool } */
    click(snap, dec, me, sq) {
      if (!me || snap.over || P.promo) return { changed: false };
      const tg = P.targets(snap, dec, me);
      if (P.sel >= 0 && tg.has(sq)) {
        if (snap.kind === 'draughts') {
          P.prefix.push(sq);
          const ms = P.from(snap, dec, me, P.sel);
          const full = ms.filter((m) => m.path.length === P.prefix.length && P.prefix.every((q, i) => m.path[i] === q));
          const longer = ms.some((m) => m.path.length > P.prefix.length && P.prefix.every((q, i) => m.path[i] === q));
          if (full.length && !longer) { const m = [P.sel, ...P.prefix]; P.reset(); return { m, changed: true }; }
          return { changed: true };
        }
        const opts = P.from(snap, dec, me, P.sel).filter((m) => m.t === sq);
        if (opts.length > 1 && opts[0].p) { P.promo = { f: P.sel, t: sq }; return { promo: true, changed: true }; }
        const m = [P.sel, sq]; P.reset();
        return { m, changed: true };
      }
      if (P.canPick(snap, dec, me, sq)) { P.sel = sq === P.sel && !P.prefix.length ? -1 : sq; P.prefix = []; return { changed: true }; }
      const had = P.sel >= 0; P.reset();
      return { changed: had };
    },
    choosePromo(pc) { if (!P.promo) return null; const m = [P.promo.f, P.promo.t, pc]; P.reset(); return m; },
  };
  return P;
}
