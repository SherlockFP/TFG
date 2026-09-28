// Wave 1 facilitysys headless check (body for tools/harness/headless.mjs):
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5182 --script tools/harness/wave1_facilitysys.js --shot /tmp/facilitysys.png
// Lands on 56K-Dialup, drives the whole Living Facility chain through game calls (find generator -> insert the
// component -> start -> solve the seeded puzzle -> containment door -> grab the CORE -> extraction -> ship) and returns
// the state transitions + mod events. Ends in a LOCKDOWN in a corridor so the screenshot shows the FACILITY STATUS
// widget and the red emergency lighting.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const log = [], events = [];
const T = (tag) => { const f = g.run.fac; log.push(`${tag}: ${f ? [f.stage, f.power, f.security, f.containment, f.vent, f.extraction ? 'EXTRACT' : '-'].join(' | ') : 'no fac'}`); };
for (const ev of ['tfg:extraction', 'tfg:objective', 'tfg:breach', 'tfg:alarm', 'tfg:darkness', 'tfg:facEvent']) {
  g.mods.on(ev, (a) => { if (events.length < 60) events.push(`${ev}:${a?.phase ?? a?.id ?? a?.kind ?? a?.level ?? a?.on ?? ''}${a?.success !== undefined ? '=' + a.success : ''}`); });
}
let facEvents = 0;
g.mods.on('tfg:facility', () => { facEvents++; });
const wait = async (n = 10, render = false) => { for (let i = 0; i < n; i++) { kefal.tick(3, 1 / 30, render); await new Promise((r) => setTimeout(r, 4)); } };
g.godMode = true;
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
await wait(20);
const fs = g.facilitysys, sys = fs?.sys, F = g.world.facility;
if (!fs || !sys) return { fatal: 'facility systems missing', errs, hasSys: !!sys, hasFs: !!fs };
const Y = F.layout.y;
const tp = (v) => { g.player.teleport(new THREE.Vector3(v.x, Y + 0.1, v.z)); g.psTimer = 0; };
const credits0 = g.run.credits;
T('landed');
const info = { theme: F.layout.theme, chain: sys.chain, need: sys.need, core: sys.coreName, panels: sys.panels.length, notes: sys.notes.length,
  treasure: F.layout.rooms.filter((r) => r.treasure).length, unlockedByRule: F.layout.unlockedByRule, chestSpots: F.chestSpots?.length, fireDoors: F.fireDoors.length,
  emergency: sys.emergency.length, hasGen: !!sys.gen, hasSecurity: !!sys.security, hasVent: !!sys.vent, containDoor: !!sys.contain };
// 1) find the generator
tp(sys.gen.pos); await wait(4); T('at generator');
// 2) the needed component, held in hand
const cid = g.items.hostSpawn(g.run.fac.need, g.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: g.selfId });
await wait(2);
const ipCount = g.interactablesNow().length;
fs.act('insert', { item: cid }); await wait(3); T('component inserted');
fs.act('start'); await wait(6); T('generator started');
// 3) the seeded puzzle
const tg = sys.targets, ch = g.run.fac.chain;
if (ch === 'voltage') {
  for (const p of sys.panels) { tp(p.pos); await wait(1); let guard = 0; while (g.run.fac.volt[p.i] !== tg.volt[p.i] && guard++ < 12) fs.act('volt', { i: p.i }); }
} else if (ch === 'order') {
  tp(sys.contain.pos); await wait(1);
  fs.act('flip', { i: (tg.order[0] + 1) % 4 }); T('wrong breaker');   // wrong first flip: shock + reset
  for (const i of tg.order) fs.act('flip', { i });
} else {
  for (const n of sys.notes) { tp(n.pos); await wait(1); fs.act('read', { i: n.i }); }
  tp(sys.contain.pos); await wait(1);
  fs.act('code', { code: '000' === tg.code ? '111' : '000' }); T('wrong code');
  fs.act('code', { code: tg.code });
}
await wait(30); T('wing powered');
const doorOpen = !!sys.contain?.door?.open, doorT = +(sys.contain?.door?.t || 0).toFixed(2);
// 4) take the CORE (grab beam ownership) -> alarm + extraction
const core = g.items.get(g.run.fac.coreId);
tp(core.obj.position.clone().add(new THREE.Vector3(1.8, 0, 0))); await wait(3);
g.net.request('grab', { id: core.id }); await wait(8); T('core grabbed');
const ext0 = g.run.fac.ext ? { ...g.run.fac.ext } : null;
await wait(10); T('extraction running');
const lockBefore = g.run.fac.lock;
// 5) deliver it to the ship
const sp = g.ship.spawns[0];
g.net.request('release', { id: core.id, p: [sp.x, sp.y + 0.6, sp.z], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] });
await wait(10); T('core in ship');
const credits1 = g.run.credits;
// 6) set pieces: FACILITY STATUS UNKNOWN (creatures vanish and return), vent gas, overload gamble
const before = g.creatures.host.size;
fs.force('unknown'); await wait(3); const during = g.creatures.host.size; T('status unknown');
g.run.fac.evLeft = 0.2; await wait(5); const after = g.creatures.host.size; T('unknown over');
fs.force('gas'); await wait(3); T('vent gas');
tp(sys.gen.pos); await wait(2);
fs.act('overload'); await wait(30); T('overload resolved');
if (g.run.powerOn === false && g.run.fac.ev === 'blackout') { g.run.fac.evLeft = 0.2; await wait(5); T('blackout over'); }
// 7) screenshot: lockdown in a corridor (red emergency lights + widget)
const L = F.layout;
let best = null;
for (let z = 0; z < L.h && !best; z++) for (let x = 0; x < L.w; x++) {
  const i = L.idx(x, z);
  if (L.cells[i] !== 2 || L.distOf[i] < 3 || L.distOf[i] > 12) continue;
  const o = (d) => L.open.has(L.edgeKey(x, z, d));
  if (o(0) && o(2) && x > 2 && L.cells[L.idx(x + 1, z)] === 2 && L.cells[L.idx(x - 1, z)] === 2) { best = { x, z, yaw: -Math.PI / 2 }; break; }
  if (o(1) && o(3) && L.cells[L.idx(x, z + 1)] === 2 && L.cells[L.idx(x, z - 1)] === 2) { best = { x, z, yaw: Math.PI }; break; }
}
g.run.fac.vent = 'clean'; g.run.fac.gas = 0;   // clear air so the red emergency lighting reads in the shot
fs.force('lockdown');
if (best) { g.player.teleport(new THREE.Vector3(L.ox + (best.x + 0.5) * L.cell, Y + 0.1, L.oz + (best.z + 0.5) * L.cell), best.yaw); g.player.pitch = 0.05; }
await wait(30, true);
T('lockdown for screenshot');
// keep the shot about the facility: hide a transient achievement banner if one is up
for (const el of document.querySelectorAll('#ui *')) { const r = el.getBoundingClientRect(); if (r.width > 200 && r.width < 700 && /ACHIEVEMENT UNLOCKED/i.test(el.textContent || '')) el.style.visibility = 'hidden'; }
return {
  info, log, events: [...new Set(events)], facEvents, interactablesAtGenerator: ipCount, doorOpen, doorT, ext0, lockBefore,
  credits: { before: credits0, afterExtraction: credits1 }, unknown: { before, during, after },
  final: { ...g.run.fac, volt: undefined }, errs,
};
