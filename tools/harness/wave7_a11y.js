// wave 7 a11y: headless body for tools/harness/headless.mjs. Palette apply, fake gamepad -> key state, keybinding conflict, Accessibility tab.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const A = await import('/src/core/a11y_core.js');
const { TIERS } = await import('/src/game/tiers.js');
const out = { hasModule: !!g.a11y };
const before = TIERS.rare.color;
kefal.settings.cbMode = 'deuteranopia'; kefal.applySettings();
out.tierRare = [before, TIERS.rare.color];
out.cssBad = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim();
kefal.settings.cbMode = 'off'; kefal.applySettings();
out.restored = TIERS.rare.color === before;
// fake pad: left stick forward + A + X
const inp = kefal.input;
const pad = { connected: true, id: '054c-09cc-Wireless Controller', axes: [0, -1, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
navigator.getGamepads = () => [pad];
inp.enabled = true; inp.locked = true;
pad.buttons[0].pressed = true; pad.buttons[2].pressed = true;
inp.pollPad(1 / 60, true);
out.padDown = { forward: inp.isDown('forward'), jump: inp.isDown('jump'), interact: inp.isDown('interact'), kind: inp.padKind, usingPad: inp.usingPad };
pad.axes = [0, 0, 0, 0]; pad.buttons[0].pressed = false; pad.buttons[2].pressed = false;
inp.pollPad(1 / 60, true);
out.padUp = { forward: inp.isDown('forward'), jump: inp.isDown('jump') };
navigator.getGamepads = () => [];
inp.locked = false;
// hold-to-toggle sprint
kefal.settings.toggleHold.sprint = true;
inp.enabled = true; inp.virtualKey('ShiftLeft', true); inp.virtualKey('ShiftLeft', false);
const s1 = inp.isDown('sprint'); inp.endFrame();
const s2 = inp.isDown('sprint'); inp.endFrame();
out.toggleSprint = [s1, s2];
kefal.settings.toggleHold.sprint = false;
// settings screen: conflict banner, then the Accessibility tab
kefal.settings.keys.jump = 'KeyE';
kefal.ui.settingsTab = 'Controls';
kefal.ui.openPanel(kefal.ui.settingsPanel(true));
out.warn = document.querySelector('.a11y-warn')?.textContent || null;
kefal.settings.keys = A.resetKeys();
kefal.ui.settingsTab = 'Accessibility';
kefal.ui.openPanel(kefal.ui.settingsPanel(true));
out.swatches = document.querySelectorAll('.a11y-sw').length;
out.padRows = document.querySelectorAll('.a11y-pad-table .bind-row').length;
await new Promise((r) => setTimeout(r, 300));
out.errs = errs;
return out;
