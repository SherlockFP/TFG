// Body for headless_menu.mjs: break free of the chair, stand up (camera rise), walk, use the terminal (HELP), sit back down (menu returns).
// Drives the menu with real keyboard events on window and manual kefal.menu.update(dt) steps (background tabs pause rAF).
const app = kefal, out = {};
const room = app.menu.room;
const step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) app.menu.update(dt); };
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
out.hasRoom = !!room;
room.skipBoot?.();
step(20);
out.seated = { state: room.state, eyeY: +app.engine.camera.position.y.toFixed(3), menuActive: room.menuActive() };
// break the straps: alternate A / D
for (let i = 0; i < 60 && room.state === 'seated'; i++) { key('keydown', i % 2 ? 'KeyD' : 'KeyA'); key('keyup', i % 2 ? 'KeyD' : 'KeyA'); step(3); }
out.afterMash = room.state;
step(20); out.snapT = room.state;
step(200);
out.standing = { state: room.state, eyeY: +app.engine.camera.position.y.toFixed(3), armsVisible: room.arms?.visible };
// walk forward for 2 s and check the collision-limited position + head bob
const p0 = { x: room.free.x, z: room.free.z };
key('keydown', 'KeyW'); step(60); key('keyup', 'KeyW');
out.walked = { moved: +Math.hypot(room.free.x - p0.x, room.free.z - p0.z).toFixed(2), state: room.state, insideRoom: room.free.x > -4.5 && room.free.x < 4.5 && room.free.z > -3.2 && room.free.z < 4.6 };
// piano: sit, play the lullaby (A A G G H H G), the door unlocks
room.free.x = 1.85; room.free.z = 3.1; room.free.yaw = Math.atan2(-(1.25 - 1.85), -(3.95 - 3.1)); room.free.pitch = -0.4; step(3);
out.pianoTarget = room.target?.id;
room.interact(); step(45);
for (const c of ['KeyA', 'KeyA', 'KeyG', 'KeyG', 'KeyH', 'KeyH', 'KeyG']) { key('keydown', c); step(3); key('keyup', c); step(2); }
out.piano = { state: room.state, lullaby: !!app.profile.menuSecrets?.lullaby, doorWanted: room.doorOpenWanted };
key('keydown', 'Escape'); step(45); out.afterPiano = room.state;
// terminal: HELP
room.openTerminal(); step(2);
const inp = document.querySelector('.cell-term-in');
inp.value = 'help'; inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
const txt = document.querySelector('.cell-term-out').innerText;
out.terminal = { active: room.terminal.active, helpOk: /COMMANDS/.test(txt) && /ARCADE/.test(txt) && /LOGIN/.test(txt), sample: txt.split('\n').slice(0, 14).join(' | ').slice(0, 260) };
inp.value = 'dir'; inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
inp.value = 'arcade'; inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
out.terminal.dirOk = /README\.TXT/.test(document.querySelector('.cell-term-out').innerText);
// launch DEAD FEED, run some frames, quit with ESC
inp.value = 'arcade deadfeed'; inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
step(10);
out.deadfeed = { mgOpen: !!room.terminal.mg };
key('keydown', 'Space'); step(60); key('keydown', 'KeyD'); step(30); key('keydown', 'ArrowRight'); step(60); key('keyup', 'ArrowRight');
key('keydown', 'Escape'); step(5);
out.deadfeed.closed = !room.terminal.mg;
inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
out.terminalClosed = !room.terminal.active;
// one real render with the cell in view (shader/material compile errors show up in LOGS)
try { app.engine.render(1 / 60); out.render = 'ok'; } catch (e) { out.render = 'ERR ' + e.message; }
// back to the CRT menu (E on chair == startSit)
room.startSit(); step(60);
out.back = { state: room.state, eyeY: +app.engine.camera.position.y.toFixed(3), menuActive: room.menuActive(), items: app.menu.items.length };
out.secrets = Object.keys(app.profile.menuSecrets || {});
out.errs = room.errs;
return out;
