// Gamepad mapping (wave 7 a11y). PURE: takes a snapshot { buttons: [bool x17], axes: [4] } and returns input events, so it can be
// unit tested in node. src/core/input.js polls navigator.getGamepads() and feeds the events into the same key / mouse state as the
// keyboard: a pad button "presses" the key that action is bound to, so every rebind, hold-to-toggle and hard-coded handler keeps working.
// Menus use the older ui.js pollPad (D-pad / A / B / LB-RB / Start) and are untouched.

/** Standard-mapping button index -> what it does in play. `action` = press the key bound to that action, `mouse` = mouse button,
 *  `wheel` = hotbar scroll. In the emote wheel D-pad left/right/up become the wheel's arrow keys (page / favourite). */
export const PAD_MAP = [
  { btn: 0, action: 'jump' },
  { btn: 1, action: 'crouch' },
  { btn: 2, action: 'interact' },
  { btn: 3, action: 'reload' },
  { btn: 4, action: 'roleSkill1' },
  { btn: 5, action: 'roleSkill2' },
  { btn: 6, mouse: 2 },                     // LT: scan / aim (RMB)
  { btn: 7, mouse: 0 },                     // RT: use / grab (LMB)
  { btn: 8, action: 'inventory' },          // View / Share
  // 9 (Menu / Options) = pause, owned by ui.js
  { btn: 10, action: 'sprint' },            // L3
  { btn: 11, action: 'emoteWheel' },        // R3 (hold)
  { btn: 12, action: 'flashlight' },        // D-pad up
  { btn: 13, action: 'ping' },              // D-pad down
  { btn: 14, wheel: -1, wheelKey: 'ArrowLeft' },
  { btn: 15, wheel: 1, wheelKey: 'ArrowRight' },
];
export const PAD_WHEEL_UP = { btn: 12, key: 'ArrowUp' };   // while the emote wheel is open

/** stick movement -> the four move actions (hysteresis so a stick resting near the threshold does not chatter) */
export const MOVE_ON = 0.42, MOVE_OFF = 0.3, LOOK_DEAD = 0.14, TRIGGER_ON = 0.35;
export const LOOK_SPEED = 900;   // mouse-pixel equivalents per second at full deflection and padLook = 1

export const PAD_LABELS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'],
  ps: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'],
};
/** 'xbox' | 'ps' from Gamepad.id ("054c-05c4-Wireless Controller", "Xbox 360 Controller (XInput STANDARD GAMEPAD)") */
export const padKind = (id) => (/054c|sony|dualshock|dualsense|playstation|wireless controller/i.test(String(id || '')) ? 'ps' : 'xbox');
/** glyph label of an action for the given pad kind, or null when the pad has no button for it */
export function padGlyph(action, kind = 'xbox') {
  const e = PAD_MAP.find((m) => m.action === action);
  if (!e) return null;
  return (PAD_LABELS[kind] || PAD_LABELS.xbox)[e.btn];
}
export function padGlyphMouse(button, kind = 'xbox') {
  const e = PAD_MAP.find((m) => m.mouse === button);
  return e ? (PAD_LABELS[kind] || PAD_LABELS.xbox)[e.btn] : null;
}
/** the label the HUD shows for an action: pad glyph while the pad is the active device, key name otherwise */
export function actionLabel(action, keys, usingPad, kind = 'xbox') {
  if (usingPad) { const g = padGlyph(action, kind); if (g) return g; }
  const c = keys?.[action];
  return c ? String(c).replace(/^Key|^Digit/, '').replace(/^Arrow/, '').replace('ShiftLeft', 'L-Shift').replace('ControlLeft', 'L-Ctrl').replace('Backquote', '`') : '';
}

const dz = (v, d) => { const a = Math.abs(v); return a < d ? 0 : Math.sign(v) * (a - d) / (1 - d); };
/** whole table as text rows for the settings screen: [glyph label per kind, English action label] */
export const PAD_HELP = [
  ['Left stick', 'Move'], ['Right stick', 'Look'], ['A / Cross', 'Jump'], ['B / Circle', 'Crouch'], ['X / Square', 'Interact'], ['Y / Triangle', 'Reload / rotate'],
  ['LB / RB', 'Role skills 1 / 2'], ['LT', 'Scan / aim'], ['RT', 'Use item / grab'], ['L3', 'Sprint'], ['R3', 'Emote wheel (hold)'],
  ['D-pad up', 'Flashlight'], ['D-pad down', 'Ping'], ['D-pad left / right', 'Hotbar previous / next'], ['View', 'Inventory'], ['Menu', 'Pause'],
];

/** Fresh edge-detection state for padStep. */
export const newPadState = () => ({ btn: new Array(17).fill(false), move: { forward: false, back: false, left: false, right: false } });

/**
 * One poll. snap = { buttons: bool[], axes: number[] }, ctx = { wheelOpen }, cfg = { look (multiplier), invertY, deadzone }, dt seconds.
 * Returns [{ t: 'action', action, down } | { t: 'key', code, down } | { t: 'mouse', b, down } | { t: 'wheel', d } | { t: 'look', dx, dy }].
 */
export function padStep(st, snap, ctx, cfg, dt) {
  const ev = [];
  const b = snap.buttons, ax = snap.axes;
  const lx = ax[0] || 0, ly = ax[1] || 0;
  // movement (left stick) with hysteresis
  const want = { forward: ly < -(st.move.forward ? MOVE_OFF : MOVE_ON), back: ly > (st.move.back ? MOVE_OFF : MOVE_ON), left: lx < -(st.move.left ? MOVE_OFF : MOVE_ON), right: lx > (st.move.right ? MOVE_OFF : MOVE_ON) };
  for (const k of Object.keys(want)) if (want[k] !== st.move[k]) { st.move[k] = want[k]; ev.push({ t: 'action', action: k, down: want[k] }); }
  // look (right stick), squared response for fine aim
  const d = cfg?.deadzone ?? LOOK_DEAD;
  const rx = dz(ax[2] || 0, d), ry = dz(ax[3] || 0, d);
  if (rx || ry) {
    const k = LOOK_SPEED * (cfg?.look ?? 1) * dt;
    ev.push({ t: 'look', dx: Math.sign(rx) * rx * rx * k, dy: Math.sign(ry) * ry * ry * k * (cfg?.invertY ? -1 : 1) });
  }
  for (const m of PAD_MAP) {
    const on = !!b[m.btn], was = st.btn[m.btn];
    if (on === was) continue;
    st.btn[m.btn] = on;
    if (ctx?.wheelOpen && m.wheelKey) { ev.push({ t: 'key', code: m.wheelKey, down: on }); continue; }
    if (ctx?.wheelOpen && m.btn === PAD_WHEEL_UP.btn) { ev.push({ t: 'key', code: PAD_WHEEL_UP.key, down: on }); continue; }
    if (m.action) ev.push({ t: 'action', action: m.action, down: on });
    else if (m.mouse !== undefined) ev.push({ t: 'mouse', b: m.mouse, down: on });
    else if (m.wheel && on) ev.push({ t: 'wheel', d: m.wheel });
  }
  return ev;
}
/** true when any input on the snapshot is beyond noise (switches the on-screen glyphs to the pad) */
export const padTouched = (snap) => snap.buttons.some(Boolean) || (snap.axes || []).some((v) => Math.abs(v) > 0.5);
