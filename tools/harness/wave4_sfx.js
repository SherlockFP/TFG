// SFX module check (body for tools/harness/headless.mjs --script):
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5197 --script tools/harness/wave4_sfx.js --shot /tmp/sfx.png --wait 4000
// Lands on a moon, spawns a mixed crowd through the REAL creature path, counts the cues the sfx module plays (idle / alert / chase / steps / hurt / death),
// checks the ambience bed, then loads a tiny custom sound pack (generated WAVs) through the same importFiles() the Settings panel uses:
// creature_lurker_alert.wav must win over the synth, ui_click.wav must replace the game sound and be restored by clear(); IndexedDB persistence is checked
// with a second PackStore. Finally opens Settings > Audio for the screenshot.
const g = kefal.game, a = g.audio, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
if (!a.ctx) await a.init();
await a.resume();
await wait(400);
out.audio = { state: a.state(), sfx: !!g.sfx, packAttached: !!a.pack, packEnabled: a.pack?.enabled };

g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) await tick();
const T = g.world.terrain, P = (x, z) => new THREE.Vector3(x, T.heightAt(x, z), z);
const me = P(30, 30); g.player.teleport(me.clone().add(new THREE.Vector3(0, 0.2, 0))); await tick(10);
for (const c of [...g.creatures.host.values()]) g.creatures.hostRemove(c.id);
await tick(4);

// ---- 1. a crowd through the real path: every type walks / runs around the player
const cues = [], off = g.sfx.onCue((c) => cues.push(c));
const types = ['lurker', 'crawler', 'scuttler', 'scuttler', 'scuttler', 'giant', 'hound', 'mannequin', 'jester', 'moderator', 'screamer', 'yoinker'];
const spawned = types.map((t, i) => {
  const ang = (i / types.length) * Math.PI * 2, r = 9 + (i % 3) * 3;
  const c = g.creatures.hostSpawn(t, P(me.x + Math.cos(ang) * r, me.z + Math.sin(ang) * r), { zone: 'out', state: i % 2 ? 'run' : 'idle', level: 1 });
  c.age = 10; return c;
});
const t0 = performance.now();
for (let i = 0; i < 30; i++) await tick(10);       // 10 game-seconds
out.tickMs = Math.round(performance.now() - t0);
const byEvent = {}, byType = {};
for (const c of cues) { byEvent[c.event] = (byEvent[c.event] || 0) + 1; byType[c.type] = (byType[c.type] || 0) + 1; }
out.cues = { total: cues.length, byEvent, byType, maxDist: Math.max(0, ...cues.map((c) => c.dist)) };
out.voices = a.handles.size;
out.buffers = [...a.buffers.keys()].filter((k) => k.startsWith('sx:')).length;
out.views = g.creatures.views.size;

// ---- 2. hurt + death through the hp / die events
const v = [...g.creatures.views.values()].find((x) => x.type === 'crawler');
const n1 = cues.length;
g.creatures.onEvent({ e: 'hp', id: v.id, hp: 50, dmg: 12 });
g.creatures.onEvent({ e: 'die', id: v.id, xp: 0, coin: 0 });
await tick(3);
out.hurtDeath = cues.slice(n1).map((c) => c.event);

// ---- 3. ambience bed of the moon (hamsi = hills)
await tick(70);
out.bed = { name: g.sfx.bed, playing: !!a.ambience.get('sxbed'), buffer: a.buffers.has('sx:bed:hills') };
off();

// ---- 4. custom sound pack
const wav = (freq, dur = 0.25) => {
  const sr = 22050, n = Math.round(sr * dur), b = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 12000 * (1 - i / n)), true);
  return b.buffer;
};
const file = (name, f) => new File([wav(f)], name, { type: 'audio/wav' });
const pk = a.pack, origClick = a.buffers.get('ui_click') || null;
const r = await pk.importFiles([file('creature_lurker_alert.wav', 440), file('creature_any_hurt_2.wav', 660), file('voice_1.wav', 330), file('ui_click.wav', 880), file('notes.txt', 1)]);
out.pack = { added: r.added, ignored: r.ignored.map((i) => i.file + ':' + i.reason), count: pk.count, summary: { ...pk.summary(), types: undefined }, persistent: pk.persistent,
  has: pk.has('creature_lurker_alert'), clickReplaced: a.buffers.get('ui_click') !== origClick };
// which buffer does the creature layer pick now?
const before = new Set(a.handles);
g.sfx.playType('lurker', 'alert', me.clone().add(new THREE.Vector3(0, 0, -5)), { id: 'packtest' });
const h = [...a.handles].find((x) => !before.has(x));
out.pack.playedName = h?.name || null;
// IndexedDB really holds the files (second store instance)
const core = await import('/src/audio/soundpack_core.js');
const s2 = new core.PackStore();
out.pack.idbFiles = (await s2.all()).length; out.pack.idbPersistent = s2.persistent;
// screenshot: Settings > Audio with the loaded pack
kefal.ui.settingsTab = 'Audio'; kefal.ui.openPanel(kefal.ui.settingsPanel(true));
await wait(300);
out.panelText = (document.querySelector('.sxpack')?.innerText || '').slice(0, 260);
const shotPack = pk;   // (kept loaded for the screenshot)
out.errs = errs;
return out;
