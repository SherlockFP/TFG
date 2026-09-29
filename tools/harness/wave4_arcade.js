// wave4 arcade check (body for tools/harness/headless.mjs). Usage:
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5185 --script tools/harness/wave4_arcade.js --shot /tmp/arcade.png --wait 4000
// Set `mode` below (or pass ?mode via window.__arMode before): 'ship' = chess on the ship table + panel, 'dama' = dama panel, 'hq' = HQ pier tables + carnival corner.
const mode = window.__arMode || 'ship';
const g = kefal.game, out = { mode }, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (n = 10) => kefal.tick(n, 1 / 30, false);
const A = g.arcade;
out.api = !!A;
const send = (op, d) => g.net.request('arreq', { op, ...d });
const st = () => A.state();
tick(20);
out.views0 = st().views;
if (mode === 'ship' || mode === 'dama') {
  g.player.teleport(new THREE.Vector3(3.4, 0.05, -1.4)); g.player.inShip = true; tick(5);
  const kind = mode === 'dama' ? 'draughts' : 'chess';
  send('sit', { id: 'ship', c: 'w' }); tick(2);
  send('ai', { id: 'ship', c: 'b', lv: 2 }); tick(2);
  if (kind === 'draughts') send('kind', { id: 'ship', k: 'draughts' });
  tick(2);
  out.afterSit = st().tables.ship;
  // illegal move first (must be rejected), then a legal opening
  send('move', { id: 'ship', m: kind === 'chess' ? [12, 44] : [8, 40] }); tick(2);
  const ply0 = st().tables.ship.ply;
  send('move', { id: 'ship', m: kind === 'chess' ? [12, 28] : [20, 28] }); tick(2);
  out.plyAfterMove = st().tables.ship.ply;
  out.illegalRejected = ply0 === 0;
  await sleep(1800);   // AI answers (real timer)
  tick(4);
  out.plyAfterAI = st().tables.ship.ply;
  // a few more moves: pick the first legal move from the client decode each time
  for (let i = 0; i < 4; i++) {
    const e = A.get('ship');
    if (e.snap.over || e.dec.st.turn !== 'w') { await sleep(1500); tick(3); continue; }
    const m = e.dec.moves[0];
    send('move', { id: 'ship', m: kind === 'chess' ? (m.p ? [m.f, m.t, m.p] : [m.f, m.t]) : [m.f, ...m.path] }); tick(2);
    await sleep(1600); tick(4);
  }
  out.finalPly = st().tables.ship.ply;
  out.log = A.get('ship').snap.log.slice(-6);
  A.open('ship'); tick(3);
  out.panel = !!document.querySelector('.arp .arp-board');
  out.squares = document.querySelectorAll('.arp .sq').length;
  out.pieces = document.querySelectorAll('.arp .pc, .arp .dm').length;
} else {
  // HQ pier: land on the company, look at the tables + the carnival corner
  // smoke: one normal moon first (proves the module survives a landing + takeoff), then the HQ pier
  g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 12; i++) { tick(10); await sleep(10); }
  out.smokeTheme = g.world.facility?.layout?.theme;
  g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); tick(5);
  g.run.daysLeft = 3; g.run.moon = 'hq';
  g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { tick(10); await sleep(10); }
  out.phase = g.run.phase; out.state = st();
  const c = A.boothPos('gallery');
  out.boothPos = c && c.toArray();
  // play every booth once through the real host path
  const results = [];
  const off = g.net.on_ ? null : null; void off;
  for (const b of ['cans', 'gallery', 'strength']) {
    const p = A.boothPos(b);
    g.player.teleport(new THREE.Vector3(p.x, -1.2, p.z + 1.6)); tick(4);
    const credits0 = g.run.credits;
    send('play', { booth: b }); tick(3);
    const s = A.booths.active;
    results.push({ b, started: !!s, fee: credits0 - g.run.credits });
    if (!s) continue;
    g.player.yaw = 0; g.player.pitch = 0;
    if (b === 'cans') { for (let i = 0; i < 3; i++) { A.booths.fire(); for (let k = 0; k < 30; k++) tick(1); } }
    if (b === 'gallery') { for (let k = 0; k < 40; k++) { A.booths.fire(); tick(9); } }
    if (b === 'strength') { for (let i = 0; i < 3; i++) { A.booths.fire(); tick(20); A.booths.fire(); tick(60); } }
    for (let k = 0; k < 400 && A.booths.active; k++) { tick(10); }
    results[results.length - 1].done = !A.booths.active;
    await sleep(300); tick(3);
  }
  out.results = results;
  out.creditsEnd = g.run.credits;
  // rock-paper-scissors: drive the client with fake host events (one local player only) + the real request path for the error cases
  {
    const R = A.rps, me = g.selfId, key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    g.net.request('arreq', { op: 'rps', s: 'ch', to: 'nobody', w: 0 }); tick(2);           // host refuses (no such crewmate), no crash
    R.onMsg({ k: 'rpsc', id: 7, a: 'X', b: me, wager: 0, sec: 20 }); tick(2);
    const askHud = document.getElementById('ar-rps')?.innerText || '';
    key('KeyY'); tick(1);                                                                    // accept goes to the host (refused: no such match) - fine
    R.onMsg({ k: 'rpsr', id: 7, round: 1, sc: { a: 0, b: 0 }, sec: 8, intro: 1.6 }); tick(2);
    const pickHud = document.getElementById('ar-rps')?.innerText || '';
    key('Digit2'); tick(1);
    const pickedHud = document.getElementById('ar-rps')?.innerText || '';
    R.onMsg({ k: 'rpsp', id: 7, who: 'a' }); R.onMsg({ k: 'rpsv', id: 7, a: 'X', b: me, round: 1, picks: [0, 1], win: 'b', sc: { a: 0, b: 1 }, auto: { a: false, b: false }, last: false }); tick(60);
    const revealHud = document.getElementById('ar-rps')?.innerText || '';
    out.rps = { askHud, pickHud, pickedHud, revealHud, state: R.state().m && { round: R.state().m.round, myPick: R.state().m.myPick, sc: R.state().m.sc } };
    R.onMsg({ k: 'rpsr', id: 7, round: 2, sc: { a: 0, b: 1 }, sec: 8, intro: 1.6 }); tick(2);
    R.onMsg({ k: 'rpsv', id: 7, a: 'X', b: me, round: 2, picks: [2, 1], win: 'a', sc: { a: 1, b: 1 }, auto: { a: false, b: true }, last: false }); tick(60);
  }
  // camera at the carnival for the screenshot
  const p = A.boothPos('gallery');
  g.player.teleport(new THREE.Vector3(p.x - 2.5, -1.2, p.z + 7)); g.player.yaw = 0.25; g.player.pitch = 0.1; tick(6);
}
out.errs = errs;
return out;
