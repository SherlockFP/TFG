// Upper Deck tour (wave 5 shipdeck): body for tools/harness/headless_shots.mjs.
//   flock /tmp/tfg-browser.lock timeout 300 node tools/harness/headless_shots.mjs --port PORT --script tools/harness/wave5_shipdeck.js --shotdir OUT --wait 4000
// Buys the deck to Mk III through the profile state (the shipdeck module polls run.sy), then shoots: the stair well in the hub, lane B looking up, the deck
// (rooms), the dome from inside, the hull from outside, and the shipyard panel's UPPER DECK tab. Returns page errors + mesh counts.
const g = kefal.game, out = { errs: [] }; addEventListener('error', (e) => out.errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cv = g.engine.renderer.domElement, cam = g.engine.camera, fov0 = cam.fov, near0 = cam.near;
let pose = null; const eng = g.engine, render0 = eng.render.bind(eng);
eng.render = (dt) => {
  if (pose) { for (const c of cam.children) c.visible = false; const fb = g.scene.getObjectByName('fpbody'); if (fb) fb.visible = false; cam.fov = pose.fov; cam.near = 0.05; cam.updateProjectionMatrix(); cam.position.set(...pose.pos); cam.lookAt(...pose.look); cam.updateMatrixWorld(true); }
  render0(dt);
};
const sy = g.shipyard, Y = sy.core;
const s = Y.sanitize(g.profile.shipyard || {}); s.deck = { t: 3, rooms: ['bunk', 'turret', 'store', 'lounge'] };
g.profile.shipyard = s; g.run.sy = s;
await tick(40, 0.1);
out.deckTier = g.shipdeck?.tier(); out.hatchOpen = g.ship.deckHatch?.open;
let n = 0; g.ship.group.getObjectByName('ship_upper_deck')?.traverse((o) => { if (o.isMesh) n++; }); out.deckMeshes = n;
const shot = async (name, pos, look, feetY = 0.05) => {
  g.player.teleport(V(pos[0], feetY, pos[2]), 0); g.player.inShip = true; await tick(3);
  const hide = [...document.body.querySelectorAll('*')].filter((el) => el !== cv && !el.contains(cv) && el.style.visibility !== 'hidden');
  for (const el of hide) el.style.visibility = 'hidden';
  pose = { pos, look, fov: 72 }; eng.render(1 / 30); eng.render(1 / 30); await wait(60);
  await window.__shot('deck_' + name);
  pose = null; cam.fov = fov0; cam.near = near0; cam.updateProjectionMatrix(); for (const el of hide) el.style.visibility = '';
};
await shot('1_well_hub', [1.9, 1.7, 3.0], [1.9, 1.6, -0.5]);
await shot('2_laneB_up', [2.45, 3.3, -0.4], [2.45, 5.0, 1.6], 1.6);
await shot('3_deck_rooms', [2.4, 5.4, 1.9], [1.2, 4.8, -2.4], 4.0);
await shot('4_deck_dome', [0.3, 4.9, 2.6], [3.4, 6.6, -1.0], 4.0);
await shot('5_outside', [-9.5, 4.5, 10.5], [1.5, 4.5, 0.5], 0.05);
g.player.teleport(V(-4.9, 0.05, 2.5), 0); await tick(3);
sy.open('upper'); await wait(400); out.panelSvg = document.querySelector('.shipyard svg')?.outerHTML.length || 0;
await window.__shot('deck_6_panel');
return out;
