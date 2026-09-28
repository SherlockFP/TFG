// Keyboard / mouse input with pointer lock, action bindings and per-frame edge detection.
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

    window.addEventListener('keydown', (e) => {
      if (this.onKeyAny && this.onKeyAny(e) === true) return;
      if (this.isTyping()) return;
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
      if (this.locked && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ControlLeft', 'KeyF', 'KeyS', 'KeyD', 'KeyW'].includes(e.code)) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
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
      if (!this.locked) { this.down.clear(); this.mouseButtons.clear(); }
      this.onLockChange?.(this.locked);
    });
  }
  isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } });
    } catch { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  key(action) { return this.settings.keys[action] || action; }
  isDown(action) { return this.enabled && this.down.has(this.key(action)); }
  pressed(action) { return this.enabled && this.pressedSet.has(this.key(action)); }
  released(action) { return this.releasedSet.has(this.key(action)); }
  codeDown(code) { return this.enabled && this.down.has(code); }
  codePressed(code) { return this.enabled && this.pressedSet.has(code); }
  mouseDown(b) { return this.enabled && this.mouseButtons.has(b); }
  mouseClicked(b) { return this.enabled && this.mousePressed.has(b); }
  mouseUp(b) { return this.mouseReleased.has(b); }
  consumeMouse() {
    const s = this.settings.sensitivity * 0.0022;
    const dx = this.mouseDX * s, dy = this.mouseDY * s * (this.settings.invertY ? -1 : 1);
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx: this.enabled ? dx : 0, dy: this.enabled ? dy : 0 };
  }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return this.enabled ? w : 0; }
  endFrame() {
    this.pressedSet.clear(); this.releasedSet.clear();
    this.mousePressed.clear(); this.mouseReleased.clear();
  }
}
