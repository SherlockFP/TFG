// chess seats + capture check (body for tools/harness/headless.mjs): seat interactables exist, E-style sit opens the 3D view locked to White, a real synthetic-mouse click
// sequence captures e4xd5 (position forced on the host table), then standing up frees the seat.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/chess_seats.js --shot /tmp/chess_seats.png --wait 4000
const g = kefal.game, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (n = 10) => kefal.tick(n, 1 / 30, false);
const C = await import('/src/game/chess_rules.js');
const A = g.arcade, send = (op, d) => g.net.request('arreq', { op, ...d });
tick(20);
const s0 = A.site('ship');
g.player.teleport(new THREE.Vector3(s0.x + 1.2, s0.y + 0.05, s0.z)); g.player.inShip = true; tick(5);
const labels = () => g.interactablesNow().map((i) => (typeof i.label === 'function' ? i.label() : i.label)).filter((l) => /Sit at|Stand up|Watch the game|Seat taken/.test(l));
out.labels0 = labels();
// pressing E on the White stool == this action
const seatIp = g.interactablesNow().find((i) => typeof i.label === 'function' && /Sit at White/.test(i.label()));
out.hasWhiteSeat = !!seatIp; out.hasBlackSeat = g.interactablesNow().some((i) => typeof i.label === 'function' && /Sit at Black/.test(i.label()));
seatIp?.action(); tick(10); await sleep(300); tick(20);
out.seats = A.state().tables.ship?.seats;
// force 1.e4 d5 on the host table, then resync through a no-op ai request
const tb = A.host.tables.get('ship');
tb.st = C.parseFen('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'); tb.ply = 2; tb.ver++;
send('ai', { id: 'ship', c: 'b', lv: 0 }); tick(5); await sleep(300); tick(60);
const c3 = A.chess3d;
out.active = c3.active; out.blend = +c3.blend.toFixed(2);
const table = g.engine.scene.getObjectByName('arcade_table');
const proj = (sq) => {
  const f = sq & 7, r = sq >> 3, p = new THREE.Vector3((f - 3.5) * 0.1, 0.83, (3.5 - r) * 0.1);
  table.updateWorldMatrix(true, false); g.camera.updateMatrixWorld(true); table.localToWorld(p); p.project(g.camera);
  const rc = g.engine.canvas.getBoundingClientRect();
  return { x: rc.left + (p.x + 1) / 2 * rc.width, y: rc.top + (1 - p.y) / 2 * rc.height };
};
const fire = (type, p) => window.dispatchEvent(new MouseEvent(type, { clientX: p.x, clientY: p.y, button: 0, bubbles: true }));
const click = (sq) => { const p = proj(sq); fire('mousemove', p); fire('mousedown', p); fire('mouseup', p); tick(2); };
click(28); out.sel = c3.picker().sel;
out.targets = [...c3.picker().targets(A.get('ship').snap, A.get('ship').dec, 'w')].map(([s, c]) => `${C.sqName(s)}${c ? 'x' : ''}`);
click(35); tick(4); await sleep(500); tick(10);
out.plyAfter = A.state().tables.ship.ply;
out.d5 = C.parseFen(C.toFen(A.get('ship').dec.st)).b[35];
tick(40); await sleep(300); tick(20);
out.hud = document.querySelector('.a3h')?.innerText?.replace(/\n/g, ' | ').slice(0, 300);
window.__shot = true;
// black seat is a different player: a second sit for me must not double-seat
send('sit', { id: 'ship', c: 'b' }); tick(3); await sleep(200); tick(5);
out.afterSecondSit = JSON.stringify(A.state().tables.ship.seats);
// stand up like ESC / E does
g.ui.closePanel(); tick(5); await sleep(300); tick(10);
out.afterStand = JSON.stringify(A.state().tables.ship.seats);
out.errs = errs;
return out;
