// Accessibility core (wave 7, docs/wave7/a11y.md). PURE (no DOM / three) so node tests can import it.
//  - colour-blind palettes: the key SIGNAL colours are remapped per mode (not a screen filter)
//  - key bindings: defaults, groups, conflict detection, rebind with swap
//  - small option helpers (FOV range, shake / UI scale clamps, flash rate limit)

// ------------------------------------------------------------------ palettes
export const CB_MODES = ['off', 'protanopia', 'deuteranopia', 'tritanopia', 'contrast'];
export const CB_LABELS = { off: 'Off', protanopia: 'Protanopia (red-blind)', deuteranopia: 'Deuteranopia (green-blind)', tritanopia: 'Tritanopia (blue-blind)', contrast: 'High contrast' };

export const TIER_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
/** every signal colour that carries meaning by hue alone; every mode must define all of them (a11y.test.mjs) */
export const SIGNAL_KEYS = [
  ...TIER_IDS.map((t) => 'tier.' + t),
  'danger', 'ok', 'warn',                       // HUD bad / good / caution (also toasts, exhausted bar, quota late)
  'laser', 'laserDim', 'eye', 'aimtell',        // trap lasers, creature eyes / threat lines, aiming creature laser
  'zone.1', 'zone.2', 'zone.3', 'zone.4', 'zone.5', 'zone.6',   // zone ownership (crew colours)
];

/** the shipped colours: exactly what tiers.js / style.css / zones_core.js / traps / aimtell used before wave 7 */
const BASE = {
  'tier.common': '#9aa39a', 'tier.uncommon': '#4ecb5a', 'tier.rare': '#3d8bff', 'tier.epic': '#b35cff', 'tier.legendary': '#ff9a1f', 'tier.mythic': '#ff3b6b',
  danger: '#ff4a3a', ok: '#7dff7d', warn: '#ffc233',
  laser: '#ff2a2a', laserDim: '#ff4a4a', eye: '#ff2020', aimtell: '#ff2418',
  'zone.1': '#7fb7ff', 'zone.2': '#7dff9a', 'zone.3': '#ffb347', 'zone.4': '#ff6f91', 'zone.5': '#c79bff', 'zone.6': '#5fe3d0',
};

// Red-green modes: blue vs orange axis, luminance ladder; blue-yellow mode: red vs teal axis.
const RG = {
  'tier.common': '#a9a9a9', 'tier.uncommon': '#56b4e9', 'tier.rare': '#2f6bff', 'tier.epic': '#f0e442', 'tier.legendary': '#e0620a', 'tier.mythic': '#ffffff',
  danger: '#e0620a', ok: '#56b4e9', warn: '#f0e442',
  laser: '#ffd000', laserDim: '#ff9a00', eye: '#ffd000', aimtell: '#ffe14a',
  'zone.1': '#56b4e9', 'zone.2': '#f0e442', 'zone.3': '#e0620a', 'zone.4': '#ffffff', 'zone.5': '#2f6bff', 'zone.6': '#8a8a8a',
};
const TRI = {
  'tier.common': '#a9a9a9', 'tier.uncommon': '#3fe0c0', 'tier.rare': '#ff5a78', 'tier.epic': '#ffffff', 'tier.legendary': '#ffb020', 'tier.mythic': '#ff1f4a',
  danger: '#ff3a55', ok: '#3fe0c0', warn: '#ffb020',
  laser: '#ff2a4a', laserDim: '#ff5a72', eye: '#ff2a4a', aimtell: '#ff3a5a',
  'zone.1': '#3fe0c0', 'zone.2': '#ff5a78', 'zone.3': '#ffffff', 'zone.4': '#ffb020', 'zone.5': '#8a8a8a', 'zone.6': '#ff1f4a',
};
const HC = {
  'tier.common': '#d0d0d0', 'tier.uncommon': '#00ffa0', 'tier.rare': '#3fa0ff', 'tier.epic': '#ff5cff', 'tier.legendary': '#ffe000', 'tier.mythic': '#ff2020',
  danger: '#ff2a2a', ok: '#00ff90', warn: '#ffee00',
  laser: '#ff0000', laserDim: '#ff5050', eye: '#ffffff', aimtell: '#ffffff',
  'zone.1': '#3fa0ff', 'zone.2': '#00ff90', 'zone.3': '#ffe000', 'zone.4': '#ff5cff', 'zone.5': '#ffffff', 'zone.6': '#e0620a',
};
export const PALETTES = { off: BASE, protanopia: RG, deuteranopia: RG, tritanopia: TRI, contrast: HC };

let mode = 'off';
const listeners = new Set();
export const getCbMode = () => mode;
export function setCbMode(m) {
  const n = CB_MODES.includes(m) ? m : 'off';
  if (n === mode) return false;
  mode = n;
  for (const fn of listeners) { try { fn(mode); } catch { /* ignore */ } }
  return true;
}
export const onCbMode = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** signal colour for the ACTIVE mode; `fallback` when the key is unknown */
export const sig = (key, fallback) => PALETTES[mode]?.[key] ?? fallback ?? BASE[key] ?? '#ffffff';
export const sigHex = (key, fallback) => parseInt(String(sig(key, fallback)).slice(1), 16);
export const remap = (m, key) => (PALETTES[m] || BASE)[key];

// colour-vision simulation (Machado 2009, severity 1) + CIE Lab distance: used by the tests to prove a palette stays distinguishable
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export function simulate(hex, kind) {
  const [r, g, b] = rgbOf(hex).map(lin);
  const M = CVD[kind];
  if (!M) return [r, g, b];
  return M.map((row) => Math.min(1, Math.max(0, row[0] * r + row[1] * g + row[2] * b)));
}
function lab([r, g, b]) {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** perceived distance between two hex colours as seen with colour vision `kind` ('normal' = no simulation) */
export function deltaE(a, b, kind = 'normal') {
  const A = lab(simulate(a, kind)), B = lab(simulate(b, kind));
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

// ------------------------------------------------------------------ key bindings
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', crouch: 'ControlLeft', sprint: 'ShiftLeft',
  interact: 'KeyE', drop: 'KeyG', flashlight: 'KeyF', ptt: 'KeyV',
  chat: 'Enter', emote1: 'KeyZ', emote2: 'KeyX', menu: 'Tab', throwItem: 'KeyQ',
  ping: 'KeyP', sneak: 'AltLeft',   // [stealth]
  // wave 7 (a11y): everything that used to be a hard-coded key
  reload: 'KeyR', emoteWheel: 'KeyB', daily: 'F2', roleSkill1: 'KeyY', roleSkill2: 'KeyU',
  hotbar1: 'Digit1', hotbar2: 'Digit2', hotbar3: 'Digit3', hotbar4: 'Digit4',
  inventory: 'KeyI', skillTree: 'KeyK', record: 'KeyJ', pets: 'KeyN', magicWheel: 'KeyC', radio: 'Backquote',
};

export const ACTION_NAMES = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch', sprint: 'Sprint',
  interact: 'Interact / pick up', drop: 'Drop item', flashlight: 'Flashlight', ptt: 'Push to talk', chat: 'Chat', emote1: 'Quick emote 1',
  emote2: 'Quick emote 2', menu: 'Full status (hold)', throwItem: 'Throw item', ping: 'Ping', sneak: 'Sneak (quiet)',
  reload: 'Reload / rotate', emoteWheel: 'Emote wheel (hold)', daily: 'Daily rewards', roleSkill1: 'Role skill 1', roleSkill2: 'Role skill 2',
  hotbar1: 'Hotbar slot 1', hotbar2: 'Hotbar slot 2', hotbar3: 'Hotbar slot 3', hotbar4: 'Hotbar slot 4',
  inventory: 'Inventory', skillTree: 'Skill tree', record: 'Service record', pets: 'Pets', magicWheel: 'Spell wheel (hold)', radio: 'Walkie-talkie',
};
/** settings screen sections (glitch exploits and zone beacons use `interact`, so they follow that binding) */
export const KEY_GROUPS = [
  ['Movement', ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'sprint', 'sneak']],
  ['Actions', ['interact', 'drop', 'throwItem', 'flashlight', 'reload', 'ping', 'roleSkill1', 'roleSkill2', 'magicWheel']],
  ['Hotbar and panels', ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'inventory', 'menu', 'skillTree', 'record', 'pets', 'daily']],
  ['Social', ['ptt', 'chat', 'radio', 'emote1', 'emote2', 'emoteWheel']],
];
/** keys the game cannot let you take: browser / engine keys */
export const RESERVED_KEYS = ['Escape', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu'];
/** keys other, NON-rebindable features listen to (a warning, not a refusal) */
export const HARDCODED_KEYS = {
  KeyH: 'Homeworld build / cruiser horn', KeyT: 'Homeworld build (pieces)', KeyM: 'Trade decline / homeworld move', KeyO: 'Pet mode',
  KeyL: 'Pet mode', Delete: 'Homeworld sell', Backspace: 'Hold to skip (onboarding)', ArrowUp: 'Emote wheel favourite',
  ArrowLeft: 'Emote wheel page', ArrowRight: 'Emote wheel page',
};
export const isKnownAction = (a) => Object.prototype.hasOwnProperty.call(DEFAULT_KEYS, a);
export const fillKeys = (keys) => ({ ...DEFAULT_KEYS, ...(keys || {}) });
export const resetKeys = () => ({ ...DEFAULT_KEYS });
/** [{ code, actions: [a, b, ...] }] for every key bound to more than one action */
export function findConflicts(keys) {
  const by = {};
  for (const a of Object.keys(DEFAULT_KEYS)) { const c = (keys || {})[a]; if (c) (by[c] ||= []).push(a); }
  return Object.entries(by).filter(([, l]) => l.length > 1).map(([code, actions]) => ({ code, actions }));
}
/**
 * Rebind `action` to `code`. Returns { ok, keys, reason?, swapped?, note? }. A key already held by another action swaps
 * (that action gets the old key of `action`), so the result never has a NEW conflict. Reserved keys are refused.
 */
export function bindKey(keys, action, code) {
  const cur = fillKeys(keys);
  if (!isKnownAction(action)) return { ok: false, keys: cur, reason: 'unknown' };
  if (!code || RESERVED_KEYS.includes(code)) return { ok: false, keys: cur, reason: 'reserved' };
  const prev = cur[action];
  if (prev === code) return { ok: true, keys: cur };
  const other = Object.keys(DEFAULT_KEYS).find((a) => a !== action && cur[a] === code);
  const out = { ...cur, [action]: code };
  let swapped = null;
  if (other) { out[other] = prev; swapped = other; }
  return { ok: true, keys: out, swapped, note: HARDCODED_KEYS[code] || null };
}

// ------------------------------------------------------------------ other options
export const FOV_MIN = 60, FOV_MAX = 110;   // 55 was cramped on 16:9 (tunnel vision), >110 warps the PSX vertex snap and makes motion-sick players worse
export const clampFov = (v) => Math.min(FOV_MAX, Math.max(FOV_MIN, Number.isFinite(+v) ? Math.round(+v) : 72));
export const clampRange = (v, lo, hi, def) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : def));
export const UI_SCALE_MIN = 0.8, UI_SCALE_MAX = 1.5;
export const SHAKE_MIN = 0, SHAKE_MAX = 1;
export const FLASH_MAX_ALPHA = 0.22;     // reduced-flash cap for the full-screen flash
export const FLASH_MIN_GAP = 0.34;       // s between full-screen flashes (<= 3 per second, WCAG 2.3.1)
/** decides whether a full-screen flash may fire; `last` is the time of the previous one. returns { amount, ok } */
export function flashGate(reduce, amount, now, last) {
  if (!reduce) return { ok: true, amount };
  if (now - last < FLASH_MIN_GAP) return { ok: false, amount: 0 };
  return { ok: true, amount: Math.min(amount, FLASH_MAX_ALPHA) };
}
