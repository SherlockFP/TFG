// Keyboard / mouse / gamepad input with pointer lock, action bindings and per-frame edge detection.
import { padStep, newPadState, padKind, padTouched, TRIGGER_ON } from './gamepad_core.js';   // [a11y]
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.locked = false;
    this.enabled = true;          // gameplay input (disabled while typing / in menus)
    this.textFocus = false;
    this.wantLock = false;
    this.onLockChange = null;
    this.onKeyAny = null;         // raw key hook (terminal, chat)
    this.frame = 0; this.tog = {};              // [a11y] hold-to-toggle state
    this.padSt = newPadState(); this.usingPad = false; this.padKind = 'xbox'; this.padName = ''; this.padCtx = {};   // [a11y] gamepad
    this.padLX = 0; this.padLY = 0;

    window.addEventListener('keydown', (e) => {
      if (e.isTrusted !== false) this.usingPad = false;   // [a11y] a real key: prompts show key names again
      if (e.code === 'Escape' && e.repeat) return;
      // Browser shortcuts keep their native action and do not become gameplay input.
      if (e.ctrlKey || e.metaKey || e.code === 'ControlLeft' || e.code === 'ControlRight') return;
      if (this.onKeyAny && this.onKeyAny(e) === true) return;
      if (this.isTyping()) return;
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
      if (this.locked && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'KeyF', 'KeyS', 'KeyD', 'KeyW'].includes(e.code)) e.preventDefault();
      if (this.locked && e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouseButtons.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against the occasional huge spike some browsers emit on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseButtons.add(e.button); this.mousePressed.add(e.button);
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button); this.mouseReleased.add(e.button);
    });
    document.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => { if (this.locked || e.target === canvas) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      // A panel may open while requestPointerLock is still pending. Cancel its late capture.
      if (this.locked && !this.wantLock) {
        this.intentionalUnlock = true; document.exitPointerLock(); return;
      }
      if (!this.locked) { this.down.clear(); this.mouseButtons.clear(); }
      const intentional = !this.locked && !!this.intentionalUnlock;
      this.intentionalUnlock = false;
      this.onLockChange?.(this.locked, intentional);
    });
    document.addEventListener('pointerlockerror', () => { this.onLockFail?.(); });   // [ux] browser refused (ESC cooldown): main shows click-to-resume
  }
  isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  lock() {
    if (this.locked) return;
    this.wantLock = true;
    const request = this.lockRequest = (this.lockRequest || 0) + 1;
    const current = () => this.wantLock && request === this.lockRequest;
    try {   // pointer lock FIRST, synchronously inside the user gesture ([menufix]: requestFullscreen consumes the activation, so lock-after-fullscreen was refused)
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { if (!current()) return; try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => { if (current()) this.onLockFail?.(); }); } catch { this.onLockFail?.(); } });
    } catch { try { this.canvas.requestPointerLock(); } catch { this.onLockFail?.(); } }   // [ux]
    // Enter fullscreen once; resuming after browser Escape keeps the chosen view.
    if (!this.fullscreenAttempted && this.settings.fullscreenPlay !== false && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      this.fullscreenAttempted = true; // Esc may exit browser fullscreen; resuming must not force it back.
      try { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* not allowed */ }
    }
  }
  unlock() { this.wantLock = false; this.lockRequest = (this.lockRequest || 0) + 1; if (document.pointerLockElement) { this.intentionalUnlock = true; document.exitPointerLock(); } }
  key(action) { return this.settings.keys[action] || action; }
  isDown(action) {
    if (this.settings.toggleHold?.[action]) return this.toggled(action, this.down.has(this.key(action)), this.pressedSet.has(this.key(action)));
    return this.enabled && this.down.has(this.key(action));
  }
  // [a11y] hold-to-toggle: a press flips the state (once per frame), losing input control clears it
  toggled(name, _down, pressed) {
    const st = this.tog[name] || (this.tog[name] = { on: false, f: -1 });
    if (!this.enabled) { st.on = false; return false; }
    if (st.f !== this.frame) { st.f = this.frame; if (pressed) st.on = !st.on; }
    return st.on;
  }
  pressed(action) { return this.enabled && this.pressedSet.has(this.key(action)); }
  released(action) { return this.releasedSet.has(this.key(action)); }
  codeDown(code) { return this.enabled && this.down.has(code); }
  codePressed(code) { return this.enabled && this.pressedSet.has(code); }
  mouseDown(b) {
    if (b === 2 && this.settings.toggleHold?.aim) return this.toggled('aim', this.mouseButtons.has(2), this.mousePressed.has(2));   // [a11y]
    return this.enabled && this.mouseButtons.has(b);
  }
  mouseClicked(b) { return this.enabled && this.mousePressed.has(b); }
  mouseUp(b) { return this.mouseReleased.has(b); }
  // [a11y] Gamepad: poll once per frame (main.js loop). Buttons press the key their action is bound to; right stick adds to the mouse delta.
  pollPad(dt, inGame = true) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads || []) if (p && p.connected) { pad = p; break; }
    if (!pad || this.settings.padEnabled === false) { if (this.padSt.btn.some(Boolean)) this.padSt = newPadState(); return; }
    const snap = { buttons: [], axes: [pad.axes[0] || 0, pad.axes[1] || 0, pad.axes[2] || 0, pad.axes[3] || 0] };
    for (let i = 0; i < 17; i++) { const b = pad.buttons[i]; snap.buttons.push(!!b && (b.pressed || b.value > TRIGGER_ON)); }
    if (padTouched(snap)) { if (!this.usingPad || this.padName !== pad.id) { this.padName = pad.id; this.padKind = this.settings.padGlyphs && this.settings.padGlyphs !== 'auto' ? this.settings.padGlyphs : padKind(pad.id); } this.usingPad = true; }
    const live = this.enabled && this.locked;
    // not in play (menu / panel / unlocked): let go of everything, ui.js pollPad drives the menus
    const ev = padStep(this.padSt, live ? snap : { buttons: new Array(17).fill(false), axes: [0, 0, 0, 0] }, this.padCtx, { look: this.settings.padLook ?? 1 }, dt);
    for (const e of ev) {
      if (e.t === 'action') this.virtualKey(this.key(e.action), e.down);
      else if (e.t === 'key') this.virtualKey(e.code, e.down);
      else if (e.t === 'mouse') { if (e.down) { this.mouseButtons.add(e.b); this.mousePressed.add(e.b); } else { this.mouseButtons.delete(e.b); this.mouseReleased.add(e.b); } }
      else if (e.t === 'wheel') this.wheel += e.d;
      else if (e.t === 'look') { this.mouseDX += e.dx / (this.settings.sensitivity || 1); this.mouseDY += e.dy / (this.settings.sensitivity || 1); }
    }
    // resume from the click-to-play state with A / X (Chrome counts a gamepad press as user activation; otherwise a click is needed)
    if (inGame && !this.locked && this.enabled && (snap.buttons[0] || snap.buttons[2]) && !this._padLockT) { this._padLockT = 1; this.lock(); setTimeout(() => { this._padLockT = 0; }, 800); }
  }
  // a pad button is a real (synthetic) key event for the bound key: hard-coded window key listeners (inventory, tree, daily...) see it too
  virtualKey(code, down) {
    if (!code || down === this.down.has(code)) return;
    try { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true })); }
    catch { if (down) { this.pressedSet.add(code); this.down.add(code); } else { this.down.delete(code); this.releasedSet.add(code); } }
  }
  consumeMouse() {
    const s = this.settings.sensitivity * 0.0022;
    const dx = this.mouseDX * s, dy = this.mouseDY * s * (this.settings.invertY ? -1 : 1);
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx: this.enabled ? dx : 0, dy: this.enabled ? dy : 0 };
  }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return this.enabled ? w : 0; }
  endFrame() {
    this.frame++;
    this.pressedSet.clear(); this.releasedSet.clear();
    this.mousePressed.clear(); this.mouseReleased.clear();
  }
}
