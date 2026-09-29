// Body for headless_menu.mjs (wave 4 eggs): no hands / viewmodel in the menu, the ten Cell eggs are reachable + trigger, the meta chain ends at the hatch.
//   flock /tmp/tfg-browser.lock node tools/harness/headless_menu.mjs --port 5182 --script tools/harness/wave4_eggs_menu.js --shot /tmp/eggs_menu.png
const app = kefal, out = {}, room = app.menu.room;
const step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) app.menu.update(dt); };
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
const P = app.profile;
P.eggs = undefined;   // fresh
room.skipBoot?.(); step(10);
// 1. no hands / viewmodel: the camera has no children and the strapped arms are detached
out.noHands = { camChildren: app.engine.camera.children.length, armsAttached: !!room.arms?.parent, fpLayer: app.engine.camera.layers.isEnabled(2) };
// stand up
room.unstrapped = true; room.standUp(); step(120);
out.state = room.state; out.hasEggs = !!room.eggs;
const EYE = 1.68;
const look = (px, pz, tx, ty, tz) => {
  room.free.x = px; room.free.z = pz;
  room.free.yaw = Math.atan2(-(tx - px), -(tz - pz));
  room.free.pitch = Math.atan2(ty - EYE, Math.hypot(tx - px, tz - pz));
  step(3);
};
const closeModal = () => { if (room.modal) room.closeModal(); };
const eggs = () => P.eggs || {};
const F = (id) => !!eggs().found?.[id];
const hit = {};
const use = (id, px, pz, tx, ty, tz) => { look(px, pz, tx, ty, tz); hit[id] = room.target?.id; if (room.target?.id === id) room.interact(); step(2); };
// 2. each egg: aim at it, check the crosshair target, use it
use('egg_cassette', 2.3, -2.3, 2.5, 0.08, -3.02); out.cassette = { found: F('cassette'), modal: !!room.modal }; closeModal();
room.eggs.channel = 6; use('egg_crt', -0.6, -2.25, -0.6, 0.98, -2.72); out.crt = { channel: room.eggs.channel, found: F('crt') };
use('egg_drawer', 0.3, 1.4, 0.3, 0.66, 0.85); out.drawer = { found: F('drawer') }; closeModal();
for (let i = 0; i < 50; i++) { look(1.05, 1.4, 1.05, 0.86, 0.62); if (room.target?.id === 'egg_mug') room.interact(); }
hit.egg_mug = room.target?.id; out.mug = { n: eggs().n?.mug, found: F('mug') };
// knock: tap tap tap ... tap tap (gaps 0.3 0.3 1.0 0.3)
look(-2.5, -2.3, -2.5, 1.15, -3.15); hit.egg_wall = room.target?.id;
for (const g of [0, 9, 9, 30, 9]) { step(g); room.interact(); }
out.knock = { found: F('knock'), panelFlag: !!eggs().flags?.panel };
step(90);
// poster: wait for the WANTED frame
look(0, 2.9, 0, 1.65, 4.55); hit.egg_poster = room.target?.id;
for (let i = 0; i < 200 && Math.floor(room.t / 5) % 5 !== 3; i++) step(5);
room.interact(); out.poster = { found: F('poster') };
// phone: three answered calls
for (let i = 0; i < 3; i++) { room.phone.ringing = 1; room.answerPhone(); }
out.phone = { calls: eggs().n?.call, found: F('phone') };
// lamp morse
look(1.6, 1.2, 1.6, 1.0, -0.12); hit.lamp = room.target?.id;
for (let i = 0; i < 5; i++) { room.interact(); step(6); }
out.lamp = { found: F('lamp') };
// duck behind the (opened) door
room.doorAngle = 1.75; room.doorOpenWanted = true; step(3);
use('egg_duck', -2.6, 4.9, -2.4, 0.12, 5.45); out.duck = { found: F('duck0'), ducks: eggs().n?.duck };
// piano: the Algorithm's tune (D E F G A G F E = S D F G H G F D)
room.free.x = 1.85; room.free.z = 3.1; room.free.yaw = Math.atan2(-(1.25 - 1.85), -(3.95 - 3.1)); room.free.pitch = -0.4; step(3);
room.interact(); step(45);
for (const c of ['KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyG', 'KeyF', 'KeyD']) { key('keydown', c); step(3); key('keyup', c); step(2); }
out.piano = { state: room.state, found: F('piano') };
key('keydown', 'Escape'); step(60);
// 3. meta chain: locked hatch lists what is missing, then complete it and claim
look(-2.5, -2.3, -2.5, 1.15, -3.15); hit.egg_panel = room.target?.id;
room.interact(); out.hatchLocked = { modal: room.modal?.kind, text: document.querySelector('.cell-modal .cm-body')?.textContent.slice(0, 200) }; closeModal();
P.eggs.found.diary = 1; P.eggs.found.statue = 1; P.eggs.n.duck = 3;
room.interact(); step(2);
out.meta = { found: F('lastappeal'), title: P.title, titles: P.titles, hat: P.cosmetics?.hats?.includes('crthead'), text: document.querySelector('.cell-modal .cm-body')?.textContent.slice(0, 120) };
closeModal();
out.counter = document.querySelector('.cell-secrets')?.textContent;
out.persisted = JSON.parse(localStorage.getItem('kefal.profile.v1') || '{}').eggs?.found ? Object.keys(JSON.parse(localStorage.getItem('kefal.profile.v1')).eggs.found).length : 0;
out.targets = hit;
// pretty shot: hatch open + the little CRT, from the back aisle
room.free.x = 0.4; room.free.z = -2.0; room.free.yaw = Math.atan2(-(-1.6 - 0.4), -(-3.0 + 2.0)); room.free.pitch = 0.0; room.toastT = 0; room.ui.toast.classList.add('hidden'); step(30);
try { app.engine.render(1 / 60); out.render = 'ok'; } catch (e) { out.render = 'ERR ' + e.message; }
out.errs = room.errs;
return out;
