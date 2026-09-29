// node tools/sim/a11y.test.mjs : palette remap coverage + colour-vision separation, keybind conflicts, gamepad mapping table (wave 7 a11y)
import * as A from '../../src/core/a11y_core.js';
import * as G from '../../src/core/gamepad_core.js';
import { TIERS } from '../../src/game/tiers.js';
import { CREW_COLORS } from '../../src/game/zones_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const hex = /^#[0-9a-f]{6}$/i;

// ---- 1. palette coverage: every mode defines every signal key, and 'off' is exactly what the game shipped with
for (const m of A.CB_MODES) {
  ok(A.PALETTES[m], 'palette ' + m);
  for (const k of A.SIGNAL_KEYS) ok(hex.test(A.remap(m, k) || ''), `mode ${m} missing / bad colour for ${k}`);
  ok(Object.keys(A.PALETTES[m]).every((k) => A.SIGNAL_KEYS.includes(k)), `mode ${m} has unknown keys`);
}
for (const id of A.TIER_IDS) ok(A.remap('off', 'tier.' + id) === TIERS[id].color, 'off tier colour == tiers.js ' + id);
ok(A.TIER_IDS.length === Object.keys(TIERS).length, 'tier list complete');
CREW_COLORS.forEach((c, i) => ok(A.remap('off', 'zone.' + (i + 1)) === c, 'off zone colour == zones_core ' + i));
ok(A.SIGNAL_KEYS.filter((k) => k.startsWith('zone.')).length === CREW_COLORS.length, 'zone colour count');
// sig() follows the active mode and falls back for unknown keys
A.setCbMode('deuteranopia'); ok(A.sig('danger') === A.remap('deuteranopia', 'danger'), 'sig follows mode'); ok(A.sig('nope', '#123456') === '#123456', 'sig fallback');
A.setCbMode('bogus'); ok(A.getCbMode() === 'off', 'bad mode -> off');
let heard = 0; const un = A.onCbMode(() => heard++); A.setCbMode('tritanopia'); A.setCbMode('tritanopia'); un(); ok(heard === 1, 'listener fires once per change'); A.setCbMode('off');

// ---- 2. the remap must actually help: under each simulated deficiency the signals stay apart (the whole point of not using a filter)
const SEE = { protanopia: 'protanopia', deuteranopia: 'deuteranopia', tritanopia: 'tritanopia', contrast: 'normal' };
const pairMin = (m, keys, kind) => { let min = 1e9, at = ''; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const d = A.deltaE(A.remap(m, keys[i]), A.remap(m, keys[j]), kind); if (d < min) { min = d; at = keys[i] + '/' + keys[j]; } } return [min, at]; };
const tierKeys = A.TIER_IDS.map((t) => 'tier.' + t), zoneKeys = A.SIGNAL_KEYS.filter((k) => k.startsWith('zone.'));
const report = [];
for (const m of ['protanopia', 'deuteranopia', 'tritanopia', 'contrast']) {
  const kind = SEE[m];
  const [tMin, tAt] = pairMin(m, tierKeys, kind), [zMin, zAt] = pairMin(m, zoneKeys, kind), [sMin, sAt] = pairMin(m, ['danger', 'ok', 'warn'], kind);
  report.push(`${m}: tiers ${tMin.toFixed(1)} (${tAt}) zones ${zMin.toFixed(1)} (${zAt}) danger/ok/warn ${sMin.toFixed(1)} (${sAt})`);
  ok(tMin >= 14, `${m} tiers too close ${tAt} ${tMin.toFixed(1)}`);
  ok(zMin >= 14, `${m} zones too close ${zAt} ${zMin.toFixed(1)}`);
  ok(sMin >= 22, `${m} danger/ok/warn too close ${sAt} ${sMin.toFixed(1)}`);
}
// the unmodified palette FAILS for red-green deficiency (documents why the remap exists)
ok(A.deltaE(A.remap('off', 'danger'), A.remap('off', 'ok'), 'deuteranopia') < 40 || A.deltaE(A.remap('off', 'tier.uncommon'), A.remap('off', 'tier.legendary'), 'deuteranopia') < 20, 'baseline is a real problem for deuteranopes');

// ---- 3. keybinds
ok(A.findConflicts(A.DEFAULT_KEYS).length === 0, 'defaults have no conflicts: ' + JSON.stringify(A.findConflicts(A.DEFAULT_KEYS)));
const grouped = KEYS_FLAT();
function KEYS_FLAT() { return A.KEY_GROUPS.flatMap(([, l]) => l); }
ok(grouped.length === new Set(grouped).size, 'no action listed twice in the settings screen');
for (const a of Object.keys(A.DEFAULT_KEYS)) { ok(grouped.includes(a), 'action rebindable in UI: ' + a); ok(typeof A.ACTION_NAMES[a] === 'string', 'action has a label: ' + a); }
for (const a of ['sneak', 'emoteWheel', 'daily', 'roleSkill1', 'roleSkill2', 'inventory', 'reload']) ok(A.DEFAULT_KEYS[a], 'new action exists ' + a);
const clash = { ...A.DEFAULT_KEYS, jump: 'KeyE' };
const cf = A.findConflicts(clash); ok(cf.length === 1 && cf[0].code === 'KeyE' && cf[0].actions.includes('jump') && cf[0].actions.includes('interact'), 'conflict found');
let r = A.bindKey(A.DEFAULT_KEYS, 'jump', 'KeyE');
ok(r.ok && r.swapped === 'interact' && r.keys.jump === 'KeyE' && r.keys.interact === 'Space' && A.findConflicts(r.keys).length === 0, 'rebind swaps, no new conflict');
r = A.bindKey(A.DEFAULT_KEYS, 'jump', 'Escape'); ok(!r.ok && r.reason === 'reserved', 'Escape refused');
r = A.bindKey(A.DEFAULT_KEYS, 'nope', 'KeyJ'); ok(!r.ok && r.reason === 'unknown', 'unknown action refused');
r = A.bindKey(A.DEFAULT_KEYS, 'jump', 'KeyH'); ok(r.ok && /Homeworld/.test(r.note || ''), 'hard-coded key warns');
r = A.bindKey(A.DEFAULT_KEYS, 'jump', 'Space'); ok(r.ok && !r.swapped, 'same key is a no-op');
ok(A.findConflicts(A.resetKeys()).length === 0 && A.resetKeys().reload === 'KeyR', 'reset to defaults');
ok(A.fillKeys({ jump: 'KeyJ' }).forward === 'KeyW', 'old saves get new defaults');

// ---- 4. gamepad mapping table
const btns = G.PAD_MAP.map((m) => m.btn);
ok(btns.length === new Set(btns).size, 'no button mapped twice');
ok(!btns.includes(9), 'Menu button is left to the pause handler');
for (const m of G.PAD_MAP) { ok(m.action ? A.DEFAULT_KEYS[m.action] : (m.mouse !== undefined || m.wheel), 'pad entry valid ' + m.btn); ok(G.PAD_LABELS.xbox[m.btn] && G.PAD_LABELS.ps[m.btn], 'pad label for ' + m.btn); }
for (const need of ['jump', 'crouch', 'sprint', 'interact', 'inventory', 'emoteWheel', 'flashlight']) ok(G.padGlyph(need), 'pad has ' + need);
ok(G.padGlyph('jump', 'xbox') === 'A' && G.padGlyph('jump', 'ps') === 'Cross' && G.padGlyph('interact', 'xbox') === 'X', 'glyph names');
ok(G.padGlyphMouse(0) === 'RT' && G.padGlyphMouse(2) === 'LT', 'trigger glyphs');
ok(G.padKind('054c-09cc-Wireless Controller') === 'ps' && G.padKind('Xbox 360 Controller (XInput STANDARD GAMEPAD)') === 'xbox', 'pad kind sniffing');
ok(G.actionLabel('interact', A.DEFAULT_KEYS, false) === 'E' && G.actionLabel('interact', A.DEFAULT_KEYS, true, 'ps') === 'Square' && G.actionLabel('drop', A.DEFAULT_KEYS, true) === 'G', 'prompt label switches keyboard / pad');
const snap = (o = {}) => ({ buttons: Array.from({ length: 17 }, (_, i) => !!(o.b && o.b.includes(i))), axes: o.axes || [0, 0, 0, 0] });
let st = G.newPadState();
let ev = G.padStep(st, snap({ axes: [0, -0.9, 0, 0] }), {}, {}, 1 / 60); ok(ev.length === 1 && ev[0].action === 'forward' && ev[0].down, 'stick up = forward');
ev = G.padStep(st, snap({ axes: [0, -0.35, 0, 0] }), {}, {}, 1 / 60); ok(ev.length === 0, 'hysteresis holds forward');
ev = G.padStep(st, snap({ axes: [0.9, -0.1, 0, 0] }), {}, {}, 1 / 60); ok(ev.some((e) => e.action === 'forward' && !e.down) && ev.some((e) => e.action === 'right' && e.down), 'release forward, press right');
ev = G.padStep(st, snap({ axes: [0.05, 0.1, 0.05, 0.05] }), {}, {}, 1 / 60); ok(!ev.some((e) => e.t === 'look'), 'stick drift ignored');
ev = G.padStep(st, snap({ axes: [0, 0, 1, 0] }), {}, { look: 1 }, 1 / 60); ok(ev.some((e) => e.t === 'look' && e.dx > 5 && e.dy === 0), 'right stick looks');
ev = G.padStep(st, snap({ axes: [0, 0, 1, 0] }), {}, { look: 2 }, 1 / 60); const l2 = ev.find((e) => e.t === 'look').dx; ev = G.padStep(st, snap({ axes: [0, 0, 1, 0] }), {}, { look: 1 }, 1 / 60); ok(l2 > ev.find((e) => e.t === 'look').dx * 1.9, 'look speed multiplier');
st = G.newPadState();
ev = G.padStep(st, snap({ b: [0] }), {}, {}, 1 / 60); ok(ev.length === 1 && ev[0].action === 'jump' && ev[0].down, 'A = jump');
ev = G.padStep(st, snap({ b: [0] }), {}, {}, 1 / 60); ok(ev.length === 0, 'no repeat while held');
ev = G.padStep(st, snap(), {}, {}, 1 / 60); ok(ev.length === 1 && ev[0].action === 'jump' && !ev[0].down, 'release');
ev = G.padStep(st, snap({ b: [7, 6] }), {}, {}, 1 / 60); ok(ev.some((e) => e.t === 'mouse' && e.b === 0 && e.down) && ev.some((e) => e.t === 'mouse' && e.b === 2 && e.down), 'RT = LMB, LT = RMB');
st = G.newPadState(); ev = G.padStep(st, snap({ b: [15] }), {}, {}, 1 / 60); ok(ev.length === 1 && ev[0].t === 'wheel' && ev[0].d === 1, 'D-pad right = next slot');
st = G.newPadState();
ev = G.padStep(st, snap({ b: [15] }), { wheelOpen: true }, {}, 1 / 60); ok(ev.length === 1 && ev[0].t === 'key' && ev[0].code === 'ArrowRight', 'D-pad right in the emote wheel = page');
ev = G.padStep(st, snap({ b: [12, 15] }), { wheelOpen: true }, {}, 1 / 60); ok(ev.some((e) => e.t === 'key' && e.code === 'ArrowUp'), 'D-pad up in the emote wheel = favourite');
ok(G.padTouched(snap({ b: [3] })) && !G.padTouched(snap()) && G.padTouched(snap({ axes: [0, 0.8, 0, 0] })), 'padTouched');
ok(G.PAD_HELP.length >= 14, 'help table');

// ---- 5. options
ok(A.clampFov(30) === A.FOV_MIN && A.clampFov(300) === A.FOV_MAX && A.clampFov(85) === 85 && A.clampFov('x') === 72 && A.clampFov(NaN) === 72, 'fov range check');
ok(A.FOV_MIN >= 55 && A.FOV_MAX <= 120, 'fov bounds sane');
ok(A.clampRange(9, 0.8, 1.5, 1) === 1.5 && A.clampRange(undefined, 0.8, 1.5, 1) === 1, 'clampRange');
ok(A.flashGate(false, 0.9, 1, 0.99).amount === 0.9, 'flash untouched when off');
ok(A.flashGate(true, 0.9, 1, -9).amount === A.FLASH_MAX_ALPHA, 'flash capped');
ok(!A.flashGate(true, 0.9, 1.1, 1).ok && A.flashGate(true, 0.9, 1.5, 1).ok, 'flash rate limit (<= 3 per second)');

console.log(report.join('\n'));
console.log(fails ? `${fails} FAILED` : 'a11y tests: all passed');
process.exit(fails ? 1 : 0);
