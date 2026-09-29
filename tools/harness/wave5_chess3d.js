// wave5 chess3d check (body for tools/harness/headless.mjs): sit at the ship table, open the 3D view, let the camera ease in, click e2 then e4 with synthetic mouse events
// (real raycast path), let the AI answer, report draw calls of the pieces + camera blend, and open/close once. Screenshot shows the 3D board + HUD.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave5_chess3d.js --shot /tmp/chess3d.png --wait 4000
const g = kefal.game, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (n = 10) => kefal.tick(n, 1 / 30, false);
const A = g.arcade, send = (op, d) => g.net.request('arreq', { op, ...d });
tick(20);
g.player.teleport(new THREE.Vector3(3.4, 0.05, -1.4)); g.player.inShip = true; tick(5);
send('sit', { id: 'ship', c: 'w' }); tick(2); send('ai', { id: 'ship', c: 'b', lv: 1 }); tick(2);
A.open('ship'); tick(60);
const c3 = A.chess3d;
out.active = c3.active; out.blend = +c3.blend.toFixed(3); out.camY = +g.camera.position.y.toFixed(2);
const v = A.site('ship'); out.site = v && [v.x, v.y, v.z].map((n) => +n.toFixed(2));
const view = () => { const m = new THREE.Vector3(); return m; };
void view;
// project a square centre to client pixels
const table = g.engine.scene.getObjectByName('arcade_table');
const proj = (sq) => {
  const f = sq & 7, r = sq >> 3, p = new THREE.Vector3((f - 3.5) * 0.1, 0.815, (3.5 - r) * 0.1);
  table.updateWorldMatrix(true, false); g.camera.updateMatrixWorld(true); table.localToWorld(p); p.project(g.camera);   // (no render happened yet: refresh the matrices)
  const rc = g.engine.canvas.getBoundingClientRect();
  return { x: rc.left + (p.x + 1) / 2 * rc.width, y: rc.top + (1 - p.y) / 2 * rc.height };
};
const fire = (type, p) => window.dispatchEvent(new MouseEvent(type, { clientX: p.x, clientY: p.y, button: 0, bubbles: true }));
const click = (sq) => { const p = proj(sq); fire('mousemove', p); fire('mousedown', p); fire('mouseup', p); tick(2); };
click(12); out.sel = c3.picker().sel; click(28); tick(4);
out.ply = A.state().tables.ship.ply;
await sleep(1800); tick(30);
out.plyAfterAI = A.state().tables.ship.ply;
const ps = table.getObjectByName('chess3d_pieces');
out.instancedMeshes = ps.children.filter((m) => m.isInstancedMesh && m.count > 0).length;
out.calls = g.engine.renderer.info.render.calls;
await sleep(300); tick(10);
out.shot = true;
window.__c3 = out;
if (new URLSearchParams(location.search).get('keep') !== '1') { /* leave the view open for the screenshot */ }
out.errs = errs;
return out;
