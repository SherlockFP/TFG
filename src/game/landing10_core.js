// landing10_core.js - wave 10: the LANDING SEQUENCER rules (pure, node-testable; the DOM / net glue is landing10.js).
// Problem: the moment the ship touches down, ~10 systems announce themselves at once (sys lines -> chat + toasts, title card, case card, banners).
// The sequence is now: 1) the moon title card (soul.js, skippable)  2) ONE compact briefing panel that merges every `sys` line of the landing  3) the normal HUD.
// This class only decides WHAT the panel says and WHEN it may open; it never touches the DOM.
//
//   stage  idle -> landing (descent, moon phase not reached yet) -> wait (touched down, collecting) -> panel (visible) -> done
//   add()  returns true when the line was captured (the caller then keeps it out of the toasts; it still goes to the chat history, silently)
//   tick() returns null | { type:'show'|'update'|'hide', ... } for the glue to render

export const CFG = {
  maxLines: 5,        // lines on the panel
  maxLen: 92,         // characters per line (longer ones are clipped with an ellipsis; the full text is in the chat log)
  settleMs: 900,      // after touchdown the panel waits at least this long (the title card / thrusters get the first beat)
  forceMs: 11000,     // ... and opens by then even if some other card is still up (or gives up when nothing was captured)
  hardMs: 45000,      // the whole sequence never outlives this (a stuck phase must not eat messages forever)
  minShowMs: 5200, perLineMs: 1200, maxShowMs: 9500, lateExtendMs: 3200,
  keep: 24,           // captured lines held before the panel opens (oldest low priority ones drop)
};

const PRI = { bad: 0, warn: 1, signal: 2, info: 2, good: 3 };
export const priOf = (kind) => (kind in PRI ? PRI[kind] : 2);

/** strip leading symbols / emoji (the panel draws its own tick), collapse whitespace */
export function cleanText(s) {
  return String(s == null ? '' : s).replace(/^[^\p{L}\p{N}\[\(]+/u, '').replace(/\s+/g, ' ').trim();
}
/** identity of a line: digits are folded, so "Crew tasks: 1/5" replaces "Crew tasks: 0/5" and an exact repeat never doubles */
export function dedupeKey(s) { return cleanText(s).toLowerCase().replace(/\d+/g, '#'); }
export function clip(s, max = CFG.maxLen) { return s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : s; }

export class LandingSeq {
  constructor(cfg = {}) {
    this.cfg = { ...CFG, ...cfg };
    this.stage = 'idle'; this.key = null; this.lines = []; this.n = 0;
    this.t0 = 0; this.touchAt = 0; this.shownAt = 0; this.hideAt = 0; this.dirty = false; this.pausedAt = null;
  }
  /** a landing starts. Same key twice = ignored (a resume / duplicate phase message must not restart it). `touched` = the moon phase is already here. */
  begin(key, now, touched = false) {
    if (key != null && key === this.key && this.stage !== 'idle') return false;
    this.key = key; this.stage = touched ? 'wait' : 'landing'; this.lines = []; this.n = 0; this.t0 = now; this.touchAt = touched ? now : 0; this.shownAt = 0; this.hideAt = 0; this.dirty = false; this.pausedAt = null;
    return true;
  }
  /** true while the sequence owns the screen (toasts / big banners of other systems wait) */
  holding() { return this.stage === 'landing' || this.stage === 'wait' || this.stage === 'panel'; }
  active() { return this.holding(); }

  /** offer one system line. Returns true = captured (it will be on the panel; do not toast it). */
  add(text, kind = 'info', now = 0) {
    if (!this.holding()) return false;
    const c = cleanText(text);
    if (!c) return false;
    if (this.stage === 'panel' && now > this.shownAt + this.cfg.maxShowMs - 900) return false;   // too late: the panel is about to go, let it toast normally
    const k = dedupeKey(c), pri = priOf(kind);
    const old = this.lines.find((l) => l.k === k);
    if (old) { old.text = c; old.kind = kind; old.pri = pri; old.n = ++this.n; }   // the newest wording (a counter) replaces the old one, keeps its slot
    else {
      this.lines.push({ k, text: c, kind, pri, n: ++this.n });
      if (this.lines.length > this.cfg.keep) {   // drop the oldest of the lowest priority
        let worst = 0;
        for (let i = 1; i < this.lines.length; i++) { const a = this.lines[i], b = this.lines[worst]; if (a.pri > b.pri || (a.pri === b.pri && a.n < b.n)) worst = i; }
        this.lines.splice(worst, 1);
      }
    }
    if (this.stage === 'panel') { this.dirty = true; this.hideAt = Math.min(Math.max(this.hideAt, now + this.cfg.lateExtendMs), this.shownAt + this.cfg.maxShowMs); }
    return true;
  }
  /** what the panel shows now: the best `maxLines` by priority, shown in arrival order. dropped = lines that did not fit (they are in the chat log) */
  view() {
    const { maxLines, maxLen } = this.cfg;
    const best = this.lines.slice().sort((a, b) => a.pri - b.pri || a.n - b.n).slice(0, maxLines).sort((a, b) => a.n - b.n);
    return { lines: best.map((l) => ({ text: clip(l.text, maxLen), kind: l.kind })), dropped: Math.max(0, this.lines.length - best.length) };
  }
  showMs() { return Math.max(this.cfg.minShowMs, Math.min(this.cfg.maxShowMs, this.cfg.minShowMs - 1500 + this.cfg.perLineMs * Math.min(this.lines.length, this.cfg.maxLines))); }

  /** the player skipped it / left the moon: close now */
  skip() { if (this.stage === 'panel') { this.stage = 'done'; return { type: 'hide' }; } if (this.holding()) this.stage = 'done'; return null; }

  /** per frame. env = { phase, centerBusy (a title card / case card / report / banner is on screen or reserved), dead } */
  tick(now, env = {}) {
    if (!this.holding()) return null;
    const { phase, centerBusy, dead } = env;
    const wasPanel = this.stage === 'panel';
    if (now - this.t0 > this.cfg.hardMs || phase === 'takeoff' || phase === 'orbit' || phase === 'fired') { this.stage = 'done'; return wasPanel ? { type: 'hide' } : null; }
    // Safety overrides the force-show deadline. Retain the same sequence and unread duration.
    if (env.danger) {
      if (this.pausedAt === null) { this.pausedAt = now; return wasPanel ? { type: 'pause' } : null; }
      return null;
    }
    if (this.pausedAt !== null) {
      const paused = Math.max(0, now - this.pausedAt); this.pausedAt = null;
      this.touchAt += paused; this.hideAt += paused; this.shownAt += paused;
      if (wasPanel) return { type: 'resume', ms: this.hideAt - now, ...this.view() };
    }
    if (this.stage === 'landing') {
      if (phase === 'moon' || phase === 'company') { this.stage = 'wait'; this.touchAt = now; }
      return null;
    }
    if (this.stage === 'wait') {
      const since = now - this.touchAt;
      if (since < this.cfg.settleMs) return null;
      if (!this.lines.length) { if (since >= this.cfg.forceMs) this.stage = 'done'; return null; }   // nothing to say: never show an empty card
      if (dead) { this.stage = 'done'; return null; }
      if (centerBusy && since < this.cfg.forceMs) return null;
      this.stage = 'panel'; this.shownAt = now; this.hideAt = now + this.showMs(); this.dirty = false;
      return { type: 'show', ms: this.hideAt - now, ...this.view() };
    }
    // panel
    if (dead || now >= this.hideAt) { this.stage = 'done'; return { type: 'hide' }; }
    if (this.dirty) { this.dirty = false; return { type: 'update', ...this.view() }; }
    return null;
  }
}
