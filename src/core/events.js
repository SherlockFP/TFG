// Tiny event emitter used across systems (and exposed to mods).
export class Emitter {
  constructor() { this._h = new Map(); this._a = new Map(); }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    this._a.delete(ev);
    if (ev === 'mapLoaded' && typeof fn === 'function' && !fn._tag) { try { fn._tag = (new Error().stack.match(/[\w.]+\.m?js\b/g) || []).find((m) => !/^events\.js/.test(m)) || ''; } catch { /* tag is only a label */ } }
    return () => this.off(ev, fn);
  }
  once(ev, fn) {
    const off = this.on(ev, (...a) => { off(); fn(...a); });
    return off;
  }
  /** [perf4] like emit(), but every handler becomes one job: add(name, job). Same handlers, same order, spread over frames by the caller's queue.
   *  A handler that was removed before its turn is skipped. Job names come from the registering module (see tag). */
  emitSliced(ev, args, add) {
    const set = this._h.get(ev);
    if (!set) return;
    [...set].forEach((fn, i) => add(`${ev}:${fn._tag || fn.name || i}`, () => {
      if (!this._h.get(ev)?.has(fn)) return;
      try { fn(...args); } catch (e) { console.error(`[event ${ev}]`, e); }
    }));
  }
  off(ev, fn) { this._h.get(ev)?.delete(fn); this._a.delete(ev); }
  emit(ev, ...args) {
    const set = this._h.get(ev);
    if (!set) return;
    // [perf3] the snapshot array is cached per event (handlers may add/remove during an emit): 'update' fires every frame, so no [...set] copy per call
    let arr = this._a.get(ev);
    if (!arr) { arr = [...set]; this._a.set(ev, arr); }
    // [perf5] fixed-arity calls: `fn(...args)` allocated + iterated an array per handler (~100 'update' handlers x 60 Hz)
    const n = args.length, a0 = args[0], a1 = args[1], a2 = args[2];
    for (let i = 0; i < arr.length; i++) {
      const fn = arr[i];
      try { if (n === 2) fn(a0, a1); else if (n === 1) fn(a0); else if (n === 0) fn(); else if (n === 3) fn(a0, a1, a2); else fn(...args); } catch (e) { console.error(`[event ${ev}]`, e); }
    }
  }
  clear() { this._h.clear(); this._a.clear(); }
}

// Global bus
export const bus = new Emitter();
