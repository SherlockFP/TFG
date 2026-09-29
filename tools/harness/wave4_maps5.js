// maps5 headless check (body of an async fn; window.kefal.game exists). Run:
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5188 --script tools/harness/wave4_maps5.js --shot out.png --wait 4000 > out.json
// Lands on hamsi (baseline), Estate 9 (hedge maze, warden, paper archive + ladder) and Cold Storage (server stacks shift, cryo caves, sleeper), returns
// numbers (renderer draw calls / triangles per view, collider counts, states) + downscaled jpeg data URLs in `shots` (extract with tools/harness/_shots.mjs).
const g = kefal.game, T = THREE, errs = [];
addEventListener('error', (e) => errs.push('E:' + e.message));
const out = { shots: {}, views: {}, notes: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grab = (label) => {
  kefal.tick(2, 1 / 60, true);
  const cv = g.engine.renderer.domElement, c2 = document.createElement('canvas');
  c2.width = 640; c2.height = 360; c2.getContext('2d').drawImage(cv, 0, 0, 640, 360);
  out.shots[label] = c2.toDataURL('image/jpeg', 0.7);
  out.views[label] = { ...g.engine.sceneStats };
};
async function land(moon) {
  if (g.run.phase !== 'orbit') { g.player.teleport(new T.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(5); } }   // must be in orbit before the next lever
  g.run.daysLeft = 3; g.run.moon = moon; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await sleep(5); }
}
const at = (x, y, z, yaw, pitch = 0) => { g.player.inShip = false; g.player.teleport(new T.Vector3(x, y + 0.05, z), yaw); g.player.pitch = pitch; kefal.tick(20, 1 / 60, false); };
const off = (o, f, dz) => [o.x + dz * Math.sin(f.rot), o.z + dz * Math.cos(f.rot)];
const lp = (f, lx, lz) => [f.x + lx * Math.cos(f.rot) + lz * Math.sin(f.rot), f.z - lx * Math.sin(f.rot) + lz * Math.cos(f.rot)];
const states = (types) => [...g.creatures.host.values()].filter((c) => types.includes(c.type)).map((c) => `${c.type}:${c.state}`);
const tm = () => performance.now();

// ---- baseline: an old moon still lands + renders
let t0 = tm();
await land('hamsi');
kefal.tick(2, 1 / 60, true);
out.views.baseline_hamsi = { ...g.engine.sceneStats, moon: g.run.moon, theme: g.world.facility?.layout?.theme };
out.notes.push('hamsi landed in ' + Math.round(tm() - t0) + ' ms');

// ---- ESTATE 9
t0 = tm();
await land('m5est');
out.notes.push('m5est landed in ' + Math.round(tm() - t0) + ' ms; maps5 module: ' + !!g.maps5);
if (!g.world.outdoor?.decor) return { diag: { moon: g.run.moon, phase: g.run.phase, moonId: g.world.moonId, biome: g.env?.biome?.decor, outdoor: !!g.world.outdoor, notes: out.notes, errs } };
const ei = g.world.outdoor.decor.info, h = ei.hedge, a = ei.archive;
out.estate = { kind: ei.kind, counts: ei.counts, hedgeColliders: h?.colliders, archiveColliders: a?.colliders, zones: ei.zones.map((z) => z.id), prizes: ei.prizes.length, loot: ei.loot.length,
  creatures: states(['m5warden', 'm5sleeper']), m5items: [...g.items.all()].map((i) => i.type).filter((ty) => ty && ty.startsWith('m5_')), landedMoon: g.run.moon };
const hf = h.frame;
// hedge: outside the gate, just inside, the centre
let p = off(h.gates[0], hf, 5); at(p[0], h.gates[0].y, p[1], hf.rot); grab('hedge_gate');
p = off(h.gates[0], hf, -2.4); at(p[0], h.gates[0].y, p[1], hf.rot); grab('hedge_inside');
p = off(h.prize, hf, 3.4); at(p[0], h.prize.y - 1, p[1], hf.rot, -0.05); grab('hedge_centre');
out.estate.zoneAtCentre = g.maps5.state.lastZone;
// the warden: stand next to its statue, it should wake (telegraph) and start hunting
const ws = h.wardenSpot;
at(ws.x + 1.8, ws.y, ws.z + 1.8, Math.atan2(-(ws.x - (ws.x + 1.8)), -(ws.z - (ws.z + 1.8))));
const seen = new Set();
for (let i = 0; i < 12; i++) { kefal.tick(15, 1 / 30, false); states(['m5warden']).forEach((s) => seen.add(s)); }
out.estate.wardenStates = [...seen];
grab('warden_awake');
// paper archive: level 0 inside the door, then the ladder climb, then the deck
const af = a.frame;
p = off(a.gates[0], af, -2.6); at(p[0], a.y0, p[1], af.rot); grab('archive_l0');
const L = a.ladder;
at(L.x - L.face.x * 0.3, L.y0, L.z - L.face.z * 0.3, Math.atan2(-L.face.x, -L.face.z));
const y0 = g.player.pos.y;
const isDown0 = g.input.isDown.bind(g.input);
g.input.isDown = (k) => k === 'forward' || isDown0(k);
let maxY = y0, latched = false;
for (let i = 0; i < 40; i++) { kefal.tick(3, 1 / 60, false); maxY = Math.max(maxY, g.player.pos.y); latched = latched || g.maps5.state.climb; }
out.estate.ladder = { startY: +y0.toFixed(2), maxY: +maxY.toFixed(2), deckTop: +a.deckTop.toFixed(2), latched };
g.input.isDown = isDown0;
kefal.tick(60, 1 / 60, false);
out.estate.ladder.afterReleaseY = +g.player.pos.y.toFixed(2);
p = [L.x + L.face.x * 1.15, L.z + L.face.z * 1.15];
at(p[0], a.deckTop, p[1], Math.atan2(-L.face.x, -L.face.z), -0.1); grab('archive_deck');
out.estate.deckStandingY = +g.player.pos.y.toFixed(2);

// ---- COLD STORAGE
await land('m5cold');
const ci = g.world.outdoor.decor.info, st = ci.stacks;
out.cold = { kind: ci.kind, counts: ci.counts, stackColliders: st.colliders, movable: st.walls.length, caves: ci.caves.length, pods: ci.pods.length, zones: ci.zones.map((z) => z.id),
  creatures: states(['m5warden', 'm5sleeper']), landedMoon: g.run.moon };
const sf = st.frame;
p = off(st.gates[0], sf, 5); at(p[0], st.y0, p[1], sf.rot); grab('stacks_gate');
p = off(st.gates[0], sf, -2.6); at(p[0], st.y0, p[1], sf.rot); grab('stacks_inside');
// telegraph + shift through the real net path (host broadcast -> every peer)
g.net.broadcast('m5sw', { k: 'warn', n: 1 });
kefal.tick(20, 1 / 30, false);
const warned = st.walls.filter((w) => w.warn).length;
kefal.tick(15, 1 / 30, false);
grab('stacks_warning');
const before = st.walls.map((w) => w.tgt).join('');
g.net.broadcast('m5sw', { k: 'go', n: 1 });
kefal.tick(90, 1 / 30, false);
out.cold.shift = { warned, changed: before !== st.walls.map((w) => w.tgt).join(''), k: st.k, extSettled: st.walls.every((w) => w.ext === w.tgt), collidersOn: st.walls.filter((w) => w.enabled).length, holds: st.walls.filter((w) => w.hold).length };
grab('stacks_after_shift');
// cryo cave: mouth, chamber, sleeper
const cv = ci.caves[0], cf = cv.frame;
p = lp(cf, 0, 18); at(p[0], cv.y0, p[1], cf.rot + Math.PI); grab('cave_mouth');
p = lp(cf, 0, -8); at(p[0], cv.y0, p[1], cf.rot + Math.PI, -0.02); grab('cave_chamber');
const sl = [...g.creatures.host.values()].find((c) => c.type === 'm5sleeper');
if (sl) {
  at(sl.pos.x + 2.6, sl.pos.y, sl.pos.z, Math.atan2(2.6, 0));
  const s2 = new Set();
  for (let i = 0; i < 10; i++) { kefal.tick(15, 1 / 30, false); s2.add(sl.state); }
  out.cold.sleeperStates = [...s2];
  grab('sleeper');
}
out.errs = errs;
return out;
