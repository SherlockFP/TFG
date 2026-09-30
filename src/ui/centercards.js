// Centre-card arbiter: at most ONE centre card on screen at a time (moon title, level up / big text, achievement, cinematics).
// Others queue (highest priority first, FIFO inside a priority) and get { compact: true } when 2+ are waiting so the caller can shorten / collapse them.
// Cinematics (reports, case card, quota met, fired) keep their own queue in ui.js and just hold the arbiter with begin('cine') / end('cine').
// Pure (no DOM): timers are injectable, see tools/harness/centercards.test.mjs.
export const PRI = { cine: 4, moon: 3, level: 2, big: 2, ach: 1 };
export const CFG = { gapMs: 220, maxMs: 9000, maxQueue: 24, compactAt: 2 };

export function createCenterCards({ setT = (f, ms) => setTimeout(f, ms), clearT = (h) => clearTimeout(h), onChange = null, cfg = {} } = {}) {
  const C = { ...CFG, ...cfg };
  const q = [];
  let active = null, hold = 0, holdKind = null, gapT = null, guard = null, seq = 0;
  const notify = () => { try { onChange?.(active ? active.kind : (hold ? holdKind : null)); } catch { /* ui optional */ } };
  const finish = (item) => {
    if (active !== item) return;
    clearT(guard); active = null; notify();
    schedule();
  };
  function schedule() {
    if (gapT != null || active || hold || !q.length) return;
    if (C.gapMs <= 0) { pump(); return; }
    gapT = setT(() => { gapT = null; pump(); }, C.gapMs);
  }
  function pump() {
    if (active || hold || !q.length) return;
    let bi = 0;
    for (let i = 1; i < q.length; i++) if (q[i].pri > q[bi].pri) bi = i;   // stable: first of the highest priority
    start(q.splice(bi, 1)[0]);
  }
  function start(item) {
    active = item;
    const waiting = q.length;
    guard = setT(() => finish(item), item.maxMs || C.maxMs);
    notify();
    let done = false;
    const fin = () => { if (done) return; done = true; finish(item); };
    try { item.run(fin, { compact: waiting >= C.compactAt, waiting, instant: false }); } catch (e) { console.warn('[centercards]', item.kind, e); fin(); }
  }
  return {
    /** run(done, {compact, waiting}) must call done() when its card is gone. Starts at once when nothing is up. */
    request(kind, run, o = {}) {
      const item = { kind, run, pri: o.pri ?? PRI[kind] ?? 1, maxMs: o.maxMs, id: ++seq };
      if (!active && !hold && !q.length) { start(item); return item.id; }
      q.push(item);
      if (q.length > C.maxQueue) {   // never lose one: the overflow is shown in its compact form right away (caller shows a toast)
        let wi = 0;
        for (let i = 1; i < q.length; i++) if (q[i].pri < q[wi].pri) wi = i;
        const ov = q.splice(wi, 1)[0];
        try { ov.run(() => {}, { compact: true, waiting: q.length, instant: true }); } catch { /* ignore */ }
      }
      schedule();
      return item.id;
    },
    /** an external full-screen card (cinematic) is up: nothing new starts until end() */
    begin(kind = 'cine') { hold++; holdKind = kind; notify(); },
    end() { hold = Math.max(0, hold - 1); if (!hold) { holdKind = null; notify(); schedule(); } },
    clear() { q.length = 0; if (gapT != null) { clearT(gapT); gapT = null; } clearT(guard); active = null; hold = 0; holdKind = null; notify(); },
    get active() { return active ? active.kind : null; },
    get held() { return hold > 0; },
    get size() { return q.length; },
    busy() { return !!active || hold > 0; },
    queue() { return q.map((x) => x.kind); },
  };
}
