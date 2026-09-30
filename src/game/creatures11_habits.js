// CREATURES11 wave 11 - the RECOMMENDER's model of each player: which doorway they cross next (docs/wave11/creatures11.md). Pure (no THREE / DOM), node-tested.
// Every doorway crossing of a player (an edge of layout.edgeInfo, walked cell -> cell) is an event with a direction. When a player ENTERS a room the tracker
// lists that room's exits and waits for the one they take. It learns two things:
//   route  "after entering through X you leave through Y"      (count >= learnMin and share >= share: a repeated route)
//   habit  "you take the straight / left / right / back door"  (>= habitMin of the last `hist` exits agree: a relative-turn habit)
// Crouching is INCOGNITO: nothing is learned from a crouching player. A prediction that was shown and missed is un-learned (-1 on that route).
import { TUNE, doorCenter } from './creatures11_core.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // edgeKey dir codes: 0 +x, 1 +z, 2 -x, 3 -z

export class Habits {
  /** layout: { w, h, ox, oz, cell, cells, roomOf, edgeInfo: Map, edgeKey(x, z, dir) } (world/facility.js layout) */
  constructor(layout, tune = TUNE.rec) {
    this.L = layout; this.T = tune; this.P = new Map(); this.byRoom = new Map(); this.stat = { hit: 0, miss: 0 };
    for (const info of layout.edgeInfo?.values?.() || []) {
      const rooms = new Set();
      for (const c of [info.a, info.b]) if (c >= 0 && layout.roomOf[c] >= 0) rooms.add(layout.roomOf[c]);
      if (rooms.size === 2 && layout.roomOf[info.a] === layout.roomOf[info.b]) continue;
      for (const r of rooms) { if (!this.byRoom.has(r)) this.byRoom.set(r, []); this.byRoom.get(r).push(info); }
    }
  }
  cellAt(x, z) {
    const L = this.L, gx = Math.floor((x - L.ox) / L.cell), gz = Math.floor((z - L.oz) / L.cell);
    return gx < 0 || gz < 0 || gx >= L.w || gz >= L.h ? -1 : gz * L.w + gx;
  }
  p(id) { let s = this.P.get(id); if (!s) { s = { cell: -1, pend: null, trans: new Map(), cats: [], shown: null, ev: null, evN: 0 }; this.P.set(id, s); } return s; }
  forget(id) { this.P.delete(id); }
  reset() { this.P.clear(); this.stat.hit = this.stat.miss = 0; }
  /** edge crossed by a step between two adjacent cells: { info, code } or null */
  edgeBetween(a, b) {
    const L = this.L, ax = a % L.w, az = Math.floor(a / L.w), bx = b % L.w, bz = Math.floor(b / L.w);
    const code = DIRS.findIndex(([dx, dz]) => bx - ax === dx && bz - az === dz);
    if (code < 0) return null;
    const info = L.edgeInfo.get(L.edgeKey(ax, az, code));
    return info ? { info, code } : null;
  }
  /**
   * Feed one position sample. Returns the crossing event {id, key, sign, room, t, incognito} when the player crossed a doorway, else null.
   * A crouching player is not learned from (the event still exists so the ambush can tell "they went elsewhere").
   */
  observe(id, x, z, crouch, t) {
    const S = this.p(id), cell = this.cellAt(x, z);
    if (cell < 0 || !(this.L.cells[cell] > 0)) return null;
    const prev = S.cell; S.cell = cell;
    if (prev < 0 || prev === cell) return null;
    const e = this.edgeBetween(prev, cell);
    if (!e) return null;
    const sign = e.code < 2 ? 1 : -1, room = this.L.roomOf[cell];
    const ev = { id: `${e.info.key}:${sign}`, key: e.info.key, sign, code: e.code, info: e.info, room, t, incognito: !!crouch, n: ++S.evN };
    S.ev = ev;
    if (crouch) { S.pend = null; S.shown = null; return ev; }
    this._learn(S, ev);
    return ev;
  }
  _learn(S, ev) {
    if (S.pend) {
      const cat = S.pend.exits.find((x) => x.id === ev.id)?.cat || 'other';
      bump(S.trans, S.pend.entryId, ev.id, 1);
      if (S.shown && S.shown.entryId === S.pend.entryId) {
        if (S.shown.exitId === ev.id) this.stat.hit++;
        else { this.stat.miss++; bump(S.trans, S.pend.entryId, S.shown.exitId, -1); }   // the pattern broke: it un-learns the guess
      }
      S.cats.push(cat); if (S.cats.length > this.T.hist) S.cats.shift();
    }
    S.shown = null;
    S.pend = ev.room >= 0 ? { room: ev.room, entryId: ev.id, ev, exits: this.exitsOf(ev.room, ev) } : null;
  }
  /** the doorways of a room, each with the id of the crossing that leaves through it and its turn relative to how the player came in
   *  (the direction they would LEAVE through it vs the direction they entered: same = straight, perpendicular = left / right, opposite or the entry door itself = back) */
  exitsOf(room, ev) {
    const L = this.L, out = [], [dx, dz] = DIRS[ev.code];
    for (const info of this.byRoom.get(room) || []) {
      const sign = L.roomOf[info.a] === room ? 1 : -1, [ex, ez] = DIRS[info.dir + (sign > 0 ? 0 : 2)];
      const dot = dx * ex + dz * ez, cross = dx * ez - dz * ex;
      const cat = info.key === ev.key || dot < -0.5 ? 'back' : dot > 0.5 ? 'straight' : cross > 0 ? 'left' : 'right';
      out.push({ info, sign, id: `${info.key}:${sign}`, cat });
    }
    return out;
  }
  /** the room they are in now (entered through a doorway, exit not taken yet), or null */
  pending(id) { return this.P.get(id)?.pend || null; }
  lastEvent(id) { return this.P.get(id)?.ev || null; }
  /** best guess for the exit the player takes next: { exit, why: 'route'|'habit', conf } or null. pos = current position (tie-break) */
  predict(id, pos = null) {
    const S = this.P.get(id), T = this.T;
    if (!S?.pend) return null;
    const ex = S.pend.exits, row = S.trans.get(S.pend.entryId);
    if (row) {
      let tot = 0, best = null;
      for (const x of ex) { const n = row.get(x.id) || 0; tot += n; if (n > 0 && (!best || n > best.n)) best = { x, n }; }
      if (best && best.n >= T.learnMin && best.n / tot >= T.share) return { exit: best.x, why: 'route', conf: best.n / tot, room: S.pend.room };
    }
    const cats = S.cats;
    if (cats.length >= T.habitMin) {
      const cnt = {}; for (const c of cats) cnt[c] = (cnt[c] || 0) + 1;
      let bc = null; for (const c of Object.keys(cnt)) if (cnt[c] >= T.habitMin && cnt[c] / cats.length >= T.habitShare && (!bc || cnt[c] > cnt[bc])) bc = c;
      if (bc) {
        const list = ex.filter((x) => x.cat === bc);
        if (list.length) {
          let pick = list[0];   // several doors fit the habit: the one nearest to the player (else to where they came in)
          const ref = pos || doorCenter(this.L, S.pend.ev.info);
          let bd = 1e9; for (const x of list) { const p = doorCenter(this.L, x.info), d = Math.hypot(p.x - ref.x, p.z - ref.z); if (d < bd) { bd = d; pick = x; } }
          return { exit: pick, why: 'habit', conf: cnt[bc] / cats.length, room: S.pend.room };
        }
      }
    }
    return null;
  }
  /** the ambush committed to this prediction: a miss un-learns it when the player leaves elsewhere */
  markShown(id, pred) { const S = this.P.get(id); if (S?.pend && pred) S.shown = { entryId: S.pend.entryId, exitId: pred.exit.id }; }
}
function bump(m, a, b, d) { let r = m.get(a); if (!r) m.set(a, (r = new Map())); r.set(b, Math.max(0, (r.get(b) || 0) + d)); }
