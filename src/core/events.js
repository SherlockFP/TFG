// Tiny event emitter used across systems (and exposed to mods).
export class Emitter {
  constructor() { this._h = new Map(); this._a = new Map(); }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    this._a.delete(ev);
    return () => this.off(ev, fn);
  }
  once(ev, fn) {
    const off = this.on(ev, (...a) => { off(); fn(...a); });
    return off;
  }
  off(ev, fn) { this._h.get(ev)?.delete(fn); this._a.delete(ev); }
  emit(ev, ...args) {
    const set = this._h.get(ev);
    if (!set) return;
    // [perf3] the snapshot array is cached per event (handlers may add/remove during an emit): 'update' fires every frame, so no [...set] copy per call
    let arr = this._a.get(ev);
    if (!arr) { arr = [...set]; this._a.set(ev, arr); }
    for (let i = 0; i < arr.length; i++) {
      try { arr[i](...args); } catch (e) { console.error(`[event ${ev}]`, e); }
    }
  }
  clear() { this._h.clear(); this._a.clear(); }
}

// Global bus
export const bus = new Emitter();
