// Tiny event emitter used across systems (and exposed to mods).
export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  once(ev, fn) {
    const off = this.on(ev, (...a) => { off(); fn(...a); });
    return off;
  }
  off(ev, fn) { this._h.get(ev)?.delete(fn); }
  emit(ev, ...args) {
    const set = this._h.get(ev);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (e) { console.error(`[event ${ev}]`, e); }
    }
  }
  clear() { this._h.clear(); }
}

// Global bus
export const bus = new Emitter();
