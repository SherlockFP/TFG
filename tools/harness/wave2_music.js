// Feature check for the `music` module (body for headless.mjs, runs in the page after boot; does not need a landing).
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5259 --script tools/harness/wave2_music.js
// Spawns a guitar into the host's hand, enters play mode through the real useItem hook, plays chords / notes through real DOM events (window capture),
// checks the broadcast 'mu' messages, the third-person avatar + strapped-on mesh, a fake remote keytar player (receive path), exit + cleanup.
const g = kefal.game, errs = [], out = {};
addEventListener('error', (e) => errs.push(e.message));
const M = g.music;
out.installed = !!M;
if (!M) return { out, errs };
try { await g.audio.init(); await g.audio.resume(); out.audio = g.audio.state(); } catch (e) { out.audioErr = String(e); }
kefal.tick(5, 1 / 30, false);

// 1. a guitar in my hand (host spawn -> 'it' sp event -> onItemHeld puts it into a hotbar slot)
const id = g.items.hostSpawn('guitar_acoustic', g.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: g.selfId });
for (let i = 0; i < 4; i++) kefal.tick(2, 1 / 30, false);
g.player.slot = Math.max(0, g.player.slots.indexOf(id));
g.refreshHeldVisuals();
out.held = g.player.heldItem()?.type;
out.grounded = g.player.grounded;

// 2. LMB path
const hk = { handled: false };
g.mods.emit('useItem', g.player.heldItem(), hk, g);
out.enter = { handled: hk.handled, playing: M.playing, emote: g.emote, frozen: g.player.frozen };
for (let i = 0; i < 4; i++) kefal.tick(3, 1 / 30, true);   // renders: emote camera, avatar pose fx, strapped-on mesh
const torso = () => g.emotes.avatar?.parts?.torso;
out.avatar = { visible: g.emotes.avatar?.root.visible, guitarMesh: !!torso()?.children.find((c) => c.name === 'guitar_acoustic'), stillPlaying: M.playing };

// 3. real DOM events
const sent = [], origSend = g.net.send.bind(g.net);
g.net.send = (t, d) => { if (t === 'mu') sent.push(d); return origSend(t, d); };
// dispatch on <body> like a real key press (window capture -> ... -> body -> window bubble). Dispatching AT window makes the capture / bubble
// listeners of the same node run in an order where Input's own listener can see the key first (the guitar got thrown by Q in the first run).
const fire = (ev) => document.body.dispatchEvent(ev);
const key = (code, o = {}) => { fire(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...o })); fire(new KeyboardEvent('keyup', { code, bubbles: true, ...o })); };
key('Digit1'); key('Digit3', { shiftKey: true });
fire(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
key('KeyQ'); key('KeyA'); key('KeyG'); key('KeyF');          // G / F would be drop / flashlight without the capture
await new Promise((r) => setTimeout(r, 60));
out.sent = sent.flatMap((d) => d.e);
out.stillHolding = g.player.heldItem()?.type;
key('KeyQ'); key('Digit0');
out.guide = M.state().guide;
key('Digit0');
kefal.tick(3, 1 / 30, true);

// 4. a remote keytar player (receive path + strapped-on mesh + animation state)
try {
  const rid = 'peerTest';
  const r = g.ensureRemote(rid, { name: 'Bot', suit: 'blue' });
  r.applyState({ p: [g.player.pos.x + 3, g.player.pos.y, g.player.pos.z], y: 0, pt: 0, f: 0, e: 'x:mu_key', h: 'keytar' });
  g.net.receive({ t: 'mu', d: { e: [[2, 60, 100, 0], [2, 64, 100, 0], [2, 67, 100, 0], [9, 1, 1, 1]] } }, rid);
  for (let i = 0; i < 3; i++) kefal.tick(3, 1 / 30, true);
  out.remote = { emoteDef: r.emoteDef?.id, keytarMesh: !!r.avatar.parts.torso.children.find((c) => c.name === 'keytar'), notes: M.recent().find((x) => x.id === rid)?.n, hit: !!r.avatar._mu?.hit };
  r.dispose(); g.remotes.delete(rid);
} catch (e) { out.remoteErr = String(e); }

// 5. exit + cleanup
fire(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true, cancelable: true }));
kefal.tick(3, 1 / 30, true);
out.exit = { playing: M.playing, frozen: g.player.frozen, emote: g.emote, meshLeft: !!torso()?.children.find((c) => c.name === 'guitar_acoustic') };
out.itemModel = !!window.__kefalMods.itemModels.get('guitar_electric');
g.net.send = origSend;
return { out, errs };
