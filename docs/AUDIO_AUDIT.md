# Audio / voice-chat silence audit (deferred: user asked to develop gameplay first)

## [major] The voice-consent prompt can appear after the player has left the game, and 'Enable mic' then opens a mic that nothing can close
- where: src/ui/ui.js:469 (lens bluetooth)
- explains report: This happens when the player leaves soon after joining. For a Bluetooth user it causes the same HFP switch, but in the title menu and with no way to undo it short of reloading the page: the menu music goes silent or tinny, and every later session keeps the headset in HFP. That fits 'no sound comes out of my headphones'.
- fix: 1. In `destroy()` (`game.js:774`), set `this.destroyed = true;` and `clearTimeout(this.joinTimeout);` first. Leave `this.net` as it is, because nulling it makes the joinTimeout callback and `actions.js:893` throw TypeErrors.
2. At `game.js:107`, use `setTimeout(() => { if (this.destroyed || this.ui.app.game !== this) return; this.ui.askVoice(this); }, 1200);`.
3. In `askVoice` (`ui.js:468`), start with `if (game.destroyed || this.app.game !== game) return;` before both the re-arm and the prompt.
4. In `choose`, check again before `game.enableMic()`: `if (consent === 'yes' && !game.destroyed && this.app.game === game) game.enableMic();`. Also change the 'mic on' status text in the menu Voice tab (`ui.js:363`) so it no longer claims a mic is active when no game is running.
5. In `VoiceChat.startMic`, add this right after the `getUserMedia` await (`voice.js:36`): `if (this.game.destroyed) { this.rawStream.getTracks().forEach((t) => t.stop()); this.rawStream = null; return; }`. This also covers the case where the player leaves while the browser's mic permission prompt is still open.

## [major] The in-game help tells Bluetooth users to choose the 'Headset (Hands-Free)' output, and that choice is saved and reapplied on every launch, keeping the headset in low-quality mode
- where: src/ui/ui.js:351 (lens bluetooth)
- explains report: This does not cause the original report, but it turns the suggested workaround into a new complaint. Playing audio to the Hands-Free render endpoint keeps the Bluetooth link in HFP by itself, so all game audio (menu included) stays mono and telephone quality, even after the mic is turned off or 'listen only' is chosen, and across page reloads.
- fix: Keep offering the Hands-Free output, but apply it only while the mic is open, instead of storing it as the permanent output.
1. In save.js, add a new setting next to outputDevice: `voiceOutputDevice: ''`.
2. In ui.js:338, when the chosen option's label matches /hands-?free|AG Audio/i, save it as `s.voiceOutputDevice` and leave `s.outputDevice` alone. Apply it right away only if `this.app.game?.voice.enabled`. Otherwise keep the current behavior.
3. In voice.js startMic(), after getUserMedia succeeds (after line 41): `if (this.settings.voiceOutputDevice) this.audio.setOutputDevice(this.settings.voiceOutputDevice);`
4. In voice.js stopMic(), add: `this.audio.setOutputDevice(this.settings.outputDevice || '');`. This also covers the ui.js:361 button and leaveGame at game.js:775.
5. audio.js:78 keeps applying only `outputDevice`, so menus and listen-only sessions stay on the stereo endpoint.
6. Change the text at ui.js:351 to: "If you use the Bluetooth headset's mic, choose 'Headset (Hands-Free)'. It is used only while your mic is on. Or use listen-only or a separate mic to keep stereo quality."
7. Optional: pick the Hands-Free output automatically. After startMic, read `rawStream.getAudioTracks()[0].getSettings().groupId`, then look in enumerateDevices() for an 'audiooutput' with the same groupId whose label matches /hands-?free/i, and apply it for that mic session only.

## [minor] The new output-device list is empty for users who never granted mic permission, and nothing reacts when devices change
- where: src/ui/ui.js:334 (lens bluetooth)
- explains report: This makes the new 'No sound?' help ineffective for exactly the users it targets. Someone who chose 'Listen only' (the recommended Bluetooth path) sees only 'System default' and cannot follow 'pick your headphones above'. When the headset switches profile, endpoints appear and disappear, and neither the list nor the AudioContext sink updates.
- fix: 1. ui.js:335-337. After enumerating, check whether any audiooutput entry has a non-empty deviceId. If none does, add a row reading 'Grant microphone access once to list your headphones' with an opt-in button. It must not fire automatically, because listen-only users explicitly declined the mic. The button runs:
```js
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(s => { s.getTracks().forEach(t => t.stop()); render(); })
  .catch(e => toast(e.name === 'NotAllowedError'
    ? 'Microphone is blocked for this site: allow it in the address-bar site settings, or change the output in Windows sound settings.'
    : 'Could not list devices: ' + e.message));
```
Before offering the button, check navigator.permissions.query({ name: 'microphone' }). If the state is 'denied' (as in the dev pane), getUserMedia rejects without showing a prompt, so show the site-settings or Windows instructions instead. The row should also warn that on Bluetooth this briefly switches the headset to hands-free mode.

2. Apply the same empty-deviceId handling to the microphone list at ui.js:356, which has the same filter.

3. While the Audio tab is open, add a devicechange listener and remove it once `meter.isConnected` is false (the existing tick loop already checks this):
```js
const onDev = () => { if (!out.isConnected) { navigator.mediaDevices.removeEventListener('devicechange', onDev); return; } render(); };
navigator.mediaDevices?.addEventListener?.('devicechange', onDev);
```

4. In AudioM

## [minor] Push-to-talk keeps the microphone open for the whole session, so it does not avoid the Bluetooth hands-free switch
- where: src/net/voice.js:36 (lens bluetooth)
- explains report: If a Bluetooth user picks 'Enable mic (push-to-talk: V)' expecting the less intrusive option, game audio still goes silent or tinny for the whole session, because the device stays open even while V is not held.
- fix: 1) Make the text clearer at ui.js:482 and on the two buttons. For example, add: "This applies to push-to-talk too: the mic stays open all session. On Bluetooth, choose Listen only or use a separate mic." Optionally give the push-to-talk button a note saying "(Bluetooth still switches to hands-free)".

2) If you add idle release for push-to-talk, do not reuse startMic()/stopMic(). Keep this.micGain, this.gate, this.dest and this.mic (the stream sent to peers) alive and attached to peers.
- Keep the MediaStreamSource in a field, e.g. this.micSrc = ctx.createMediaStreamSource(this.rawStream).
- After about 20 s in push-to-talk mode without pressing V (and not while this.recording), call this.micSrc.disconnect(), stop the rawStream tracks, and set this.rawStream = null. beginClip already skips when rawStream is null.
- When V is pressed and rawStream is null, set a guard flag (this.reacquiring) and call getUserMedia with the same constraints. Then create a new MediaStreamSource, connect it to this.micGain, and set this.rawStream.
- Never call net.removeStream/addStream in this cycle, so peers never renegotiate.
- Tell the user that each first press has 0.5-2 s of latency, and that Bluetooth game audio will still drop to hands-free while they talk. This only shortens the time spent in HFP; it does not remove the switch.

## [minor] The Voice volume setting is applied twice, so friends' voices fade much faster than the slider suggests
- where: src/net/voice.js:201 (lens bluetooth)
- explains report: This matters only if the report is about friends' voices rather than all game audio. A user who lowered 'Voice volume' to 30% actually gets 9% (about -21 dB) on proximity voice, while walkie-talkie voice gets 30%. Friends can become nearly inaudible at settings that look moderate.
- fix: Remove `(this.settings.voiceVolume ?? 1)` from voice.js:201: `p.gain.gain.setTargetAtTime(vol * (rp.localVolume ?? 1), t, 0.05);`. The bus gain already applies the setting.

## [minor] The consent dialog does not say that the game records short clips of the player's voice and sends them to everyone in the lobby
- where: src/net/voice.js:87 (lens bluetooth)
- explains report: This does not explain the missing sound. It is a side effect of capturing the mic that players are not told about, and it is the only path by which recorded mic audio reaches anyone's speakers, including the player's own.
- fix: 1. Disclosure, ui.js:482 (and the settings note at ui.js:365): add "Creatures may replay short recordings of crew voices. Clips of your voice are sent to everyone in this lobby."
2. Opt-out: add `voiceClips: true` to the defaults in src/core/save.js. Show a toggle for it in the consent dialog and in Settings > Voice. Make `beginClip()` bail out early with `if (!this.settings.voiceClips) return;`. Also have `onBinary()`/`playClip()` ignore clips when the local player has turned this off, if a full opt-out is wanted.
3. Only capture what is actually transmitted:
   - In voice.js:80, record the gated stream instead of the raw one: `new MediaRecorder(this.mic /* = this.dest.stream, post-gain, post-gate */, ...)` rather than `this.rawStream`.
   - Also stop an in-flight recorder when the player stops transmitting. In `update()`, after computing `talking`, add: `if (this.recording && !talking && this.settings.voiceMode === 'ptt') { try { this.recorder.stop(); } catch {} }`.
   - In `setMuted(m)`, add: `if (m && this.recording) { this.discardClip = true; try { this.recorder.stop(); } catch {} }`. Then have `onstop` return without sending when `discardClip` is set, and reset the flag.
4. Optional: in `playClip()`, prefer owners other than `this.game.net.selfId` when any exist. This is a design choice, not part of the privacy fix.

## [major] Chosen output device is saved and re-applied on every start, with no recovery if that device disappears; the context still reports 'running', so neither the hint nor the meter shows the silence
- where: src/audio/audio.js:78 (lens unlock)
- explains report: Strong match for 'no sound in my headphones' for anyone who has picked a device in Settings > Audio > Output device, which the game's own help text tells users to do (ui.js:351, ui.js:482). If Bluetooth headphones disconnect and reconnect, switch between stereo and hands-free mode, or a USB headset is re-plugged, the pinned output is lost. The Web Audio working group describes this case (e.g. 'losing a bluetooth connection') as the app 'silently acts as though audio is working correctly even though it's not'. Chrome reports it only through the AudioContext 'error' event. Sound then stays off u
- fix: 1. In `audio.js` `init()`, right after creating `ctx`, add listeners that ignore failure:
   - `ctx.addEventListener?.('error', () => this.recoverSink(true))`
   - `navigator.mediaDevices?.addEventListener?.('devicechange', () => this.recoverSink(false))`
   - Set `this.sinkLost = false`.

2. Add a `recoverSink(hadError)` method and serialize its calls with a promise chain (`this._sinkOp = (this._sinkOp || Promise.resolve()).then(...)`):
   - Let `want = this.settings.outputDevice`.
   - If `want` is empty: when `hadError` is true, run `await ctx.setSinkId('').catch(() => {})`, set `this.sinkLost = hadError`, and return.
   - Get the devices with `ds = await navigator.mediaDevices.enumerateDevices().catch(() => [])`.
   - Let `idsKnown = ds.some(d => d.kind === 'audiooutput' && d.deviceId)`, and `present = ds.some(d => d.kind === 'audiooutput' && d.deviceId === want)`.
   - If `idsKnown && !present`: when `ctx.sinkId !== ''`, run `await ctx.setSinkId('').catch(() => {})`. Set `this.sinkLost = true` and return.
   - If `present && (hadError || this.sinkLost || ctx.sinkId !== want)`: run `await ctx.setSinkId('').catch(() => {})`. Then `try { await ctx.setSinkId(want); this.sinkLost = false } catch { this.sinkLost = true }`.
   - The reset to '' is needed because `setSinkId` with the current id resolves without reopening the device.

3. In `main.js:265`, also show the hint when `audio.sinkLost` is true, with text like 'Audio output device disconnected - playing on system default

## [major] The output-device picker the help text points to shows only 'System default' for listen-only users and on plain-http LAN hosts, and on http it wrongly says the browser is unsupported
- where: src/ui/ui.js:336 (lens unlock)
- explains report: This does not cause silence. It blocks the fix the game offers for the most likely Windows cause, audio going to a device other than the headphones. The users told to use it are the ones who picked 'listen only' to avoid Bluetooth hands-free trouble, and they never granted mic permission, so Chrome and Edge list no individual outputs. On friends' LAN sessions over plain http (vite.config.js says friends connect via https://<ip>:5173 only when using dev:https), AudioContext.setSinkId does not exist because it needs a secure context, so the user sees 'not supported by this browser (use Chrome/Ed
- fix: Leave the audio graph alone and change only the UI in src/ui/ui.js.

(a) ui.js:334-340: split the else branch on `window.isSecureContext`. When it is false, show: 'Choosing an output device needs https:// or localhost (ask the host to run npm run dev:https). Otherwise set your headphones as the default device in Windows (Win+Ctrl+V on Windows 11, or Sound settings) and reload the page.' Keep 'not supported by this browser' only when `isSecureContext` is true and setSinkId is still missing.

(b) ui.js:335-337: after enumerating, compute `const named = ds.filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');`. If `named.length === 0`, add a dim note under the select: 'Device names are hidden until microphone permission is granted. To use headphones without the mic, set them as the default device in Windows (Win+Ctrl+V) and reload.' Do not call getUserMedia to unlock the names automatically. Opening the mic is exactly what switches Bluetooth headsets to hands-free, which listen-only users are trying to avoid. At most, offer an explicit 'Show device names (briefly uses mic)' button that stops its tracks straight away and re-renders.

(c) Register `navigator.mediaDevices?.addEventListener?.('devicechange', ...)` while the Audio tab is open, check `out.isConnected`, and re-run the enumeration. Headsets plugged in later, or a permission granted mid-session, then appear.

(d) Reword ui.js:351 and ui.js:482 so the Windows default device is the first fix give

## [minor] setAmbience/playMusic can hang the tab in an endless microtask loop when an external sound fails and has no procedural fallback
- where: src/audio/audio.js:315 (lens unlock)
- explains report: Not a quiet-audio cause: the tab would freeze with 'Page unresponsive'. It needs the sfxlib failure from the previous finding, or a mod passing an external-only name to setAmbience/playMusic, combined with a failed OGG fetch or decode. Every ambience and music name in the current code has a procedural definition, so this is latent, but it can be triggered on a flaky connection because sfxlib and the OGGs are both loaded lazily after the first click.
- fix: In getBuffer (audio.js:175-178), remove the `pending` entry once the promise settles, and do it before the promise is returned. That way the finally callback is attached before any retry callback and runs first:

```js
const p = fetch(this.external.get(name)).then((r) => r.arrayBuffer()).then((ab) => this.ctx.decodeAudioData(ab))
  .then((buf) => { this.buffers.set(name, buf); return buf; })
  .catch(() => { this.external.delete(name); return null; });
p.finally(() => { if (this.pending.get(name) === p) this.pending.delete(name); });
this.pending.set(name, p);
```

Leave the retry callbacks in setAmbience (:315) and playMusic (:329) as they are. Do NOT add a `buf &&` guard, because that blocks the procedural fallback. The second attempt then finds no `pending` entry and stops after one retry:
- It plays the procedural sound if sfxlib defines it.
- Otherwise it gives up quietly.

Also check `r.ok` in the fetch chain (`.then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })`). A 404 then fails right away instead of reaching decodeAudioData.

The play() one-shot retry at :223 is already bounded by `_retried` and needs no change.

## [major] Output-device picker is always empty for listen-only users, and the help text sends people with no headphone sound to it
- where: src/ui/ui.js:336 (lens poison)
- explains report: It does not cause the silence, but it blocks the fix being offered for exactly this report. The new help text (ui.js:351) says to 'pick your headphones above'. The new default is micConsent 'ask' (save.js:39), and the BT-safe advice is listen-only. So the users most likely to have headphone trouble have never granted mic permission, and for them Chrome returns audiooutput entries with deviceId ''. The filter removes those entries, so the select only ever shows 'System default'. A second, separate problem: at init (audio.js:78) a failed setSinkId for the saved device is only logged, yet ui.js:3
- fix: 1) ui.js:335-337: after enumerating, set `const outs = ds.filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');`. If `outs.length === 0`, add a dim note under the select: "Your headphones are only listed after you allow the microphone. Otherwise change the default output in Windows (Settings > System > Sound > Output)". Next to it, add an optional "Show devices" button. The button runs `navigator.mediaDevices.getUserMedia({audio:true}).then(st => { st.getTracks().forEach(t => t.stop()); render(); })`, and its label warns that a Bluetooth headset may switch to hands-free for a moment. Do not add a selectAudioOutput path: it cannot feed AudioContext.setSinkId in Firefox.
2) Mark the selected option from the context's real sink, not from the setting: `const cur = typeof audio.ctx?.sinkId === 'string' ? audio.ctx.sinkId : ''; ... selected: d.deviceId === cur`.
3) ui.js:338: only save once the switch works: `out.addEventListener('change', async () => { const ok = await audio.setOutputDevice(out.value); if (ok) { s.outputDevice = out.value; saveSettings(s); } else { out.value = typeof audio.ctx?.sinkId === 'string' ? audio.ctx.sinkId : ''; } this.toast(ok ? 'Output device changed.' : 'Could not switch output device.'); audio.testSound(); });`.
4) audio.js:78: keep the saved preference; do not clear it on failure, because the device may just be unplugged. Optionally record the result for the UI: `this.setOutputDevice(saved).then(ok => { this.outputDeviceFa

## [minor] Voice volume is applied twice (per-peer gain and voice bus), so remote voices are attenuated by voiceVolume squared
- where: src/net/voice.js:201 (lens poison)
- explains report: Partial, and only if the report is about friends' voices. A user who lowers 'Voice volume' gets much quieter friends than the slider shows: 50% gives 25%, 30% gives 9%. Only 0 makes them fully silent. This does not affect game SFX or music.
- fix: The proposed fix is correct. In `D:\KefalCompany\src\net\voice.js:201`, remove the settings factor so the voice bus (audio.js:140) is the only place voiceVolume is applied:

`p.gain.gain.setTargetAtTime(vol * (rp.localVolume ?? 1), t, 0.05);`

This also makes proximity voice consistent with the walkie radio path (voice.js:152/211) and with playClip (voice.js:124), which already rely on the bus alone.

## [minor] Boombox loop handle leaks when the item is removed: it keeps playing and cannot be stolen
- where: src/entities/items.js:105 (lens poison)
- explains report: No; this is the opposite of silence. A switched-on boombox that is sold, destroyed or unloaded with the moon keeps looping at its last position until leaveGame. It also takes a permanent slot in `handles` that voice stealing skips, because loops are never stolen.
- fix: In `src/entities/items.js`, the class is `WorldItem`, not `Item`. Change its `dispose()` to:

```js
dispose() {
  if (this.music) { this.music.stop(0.2); this.music = null; }
  if (this.glow) { this.mgr.game.lights?.remove(this.glow); this.glow = null; }
  this.removeBody();
  this.obj.removeFromParent();
  this.obj.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
}
```

This covers every removal path: the `rm` event, `clearAll`, and `unloadMap`. Calling `stop()` a second time is safe because `h.stopped` guards it.

Optional, and needed for gameplay consistency rather than for the leak: in `die()` (`actions.js:~836`), switch a boombox off before dropping it, for example `if (it.type === 'boombox' && it.on) this.setItemOn(it, false);`. That matches what `dropItem` already does.

Correct the evidence text as well. Replace "sold or destroyed" with "removed when the crew is fired (`host.js:358`), or left on after a death or disconnect drop and then disposed by `unloadMap` in orbit". A boombox is not sellable and not fragile.

## [minor] play() steals a voice before checking it can play, and while the context is suspended one-shots never end, so the handle set saturates and replays in a burst on resume
- where: src/audio/audio.js:215 (lens poison)
- explains report: No. Loops, ambience and music can never be stolen (`!h.loop`), and the set cannot leak until every sound steals, because stop() always deletes the handle. Two side effects remain. A play() for a name that is still pending kills a playing sound and plays nothing. While ctx.state is 'suspended', currentTime is frozen, onended never fires, and the set fills to 56. When audio resumes, up to about 56 stale one-shots (hovers, footsteps) start at once, and the compressor ducks the whole mix for a moment.
- fix: In play() (audio.js:213-225), check the buffer first and steal a voice only after that:

```js
play(name, opts = {}) {
  if (!this.ctx || !name) return null;
  const buf = this.getBuffer(name);
  if (!buf) { /* existing pending-retry logic, unchanged */ return null; }
  // Never queue one-shots while the clock is frozen; loops (ambience/music/creature loops) are fine to schedule.
  if (!opts.loop && this.ctx.state !== 'running' && performance.now() - (this._resumeAt || 0) > 250) return null;
  if (this.handles.size >= this.maxVoices) {
    for (const h of this.handles) { if (!h.loop) { h.stop(0.02); break; } }
  }
  ...
```

In resume() (:105-108), set `this._resumeAt = performance.now()` before calling `this.ctx.resume()`. The click or keypress that resumes audio can then still play its own UI sound. The stale hovers and footsteps queued earlier are dropped, whatever bus they use.

To also clean up anything already queued, stop the old one-shots once the context is running again:

```js
this.ctx.resume().then(() => {
  for (const h of [...this.handles]) if (!h.loop) h.stop(0);
})
```

Keep the loops. They are expected to keep playing.

## [minor] Game.destroy leaves audio.occluder pointing at the freed physics world and never removes voice peers
- where: src/game/game.js:774 (lens poison)
- explains report: No. After leaveGame, a late one-shot retry (audio.js:223 `p.then(() => this.play(... _retried))`) of an occluded 3D sound can land in the menu. audio.update then calls the dead game's occlusionAt, which raycasts into a Rapier world that physics.dispose() has already freed. That throws inside the menu branch of the loop's try/catch, so engine.render is skipped on those frames. Voice peer nodes and muted Audio elements stay connected to buses.voice after the session ends.
- fix: 1. src/game/game.js:62. Keep a reference to the closure:
   `this._occluder = (p) => this.occlusionAt(p); this.audio.occluder = this._occluder;`

2. src/game/game.js:774, in destroy(), before `this.physics.dispose()`:
   - Clear the occluder: `if (this.audio.occluder === this._occluder) this.audio.occluder = null;` (or set it to null unconditionally).
   - Remove the voice peers: `for (const id of [...this.voice.peers.keys()]) this.voice.removePeer(id);`
   - Drop the recorded clips: `this.voice.clips.clear();`

3. src/net/voice.js:156-162, in removePeer():
   - Before clearing srcObject, add `try { p.el.pause(); } catch {}`.
   - Also disconnect the rest of the chain: `p.lp.disconnect()` and the bp/shaper nodes. To make that possible, store `bp` and `shaper` in the peer record at line 153.

4. src/audio/audio.js. Stop old retries from playing after stopAll():
   - In stopAll(), add `this.gen = (this.gen || 0) + 1;`
   - At line 223, change the retry to:
     `const gen = this.gen; p.then(() => { if (gen === this.gen) this.play(name, { ...opts, _retried: true }); });`
   - Do the same generation check in the setAmbience and playMusic pending callbacks, if you want.

5. src/audio/audio.js:357, as a safety net:
   `let o = 0; try { o = this.occluder(p); } catch { this.occluder = null; }`
   Optionally also set a `disposed` flag in Physics.dispose() and have raycast() return null when it is set.

## [major] Leaving and rejoining the same lobby within about 2 minutes, in the same tab, reuses an RTCPeerConnection stuck in 'have-local-offer'. Voice is then dead in both directions while game data still works
- where: src/net/transport.js:54 (lens voice)
- explains report: This explains 'I hear nothing from my friend' when it starts after someone left and rejoined, including via the lobby browser, without reloading the page. It is likely because 'rejoin' is the usual thing people try when voice acts up. All other game audio stays fine, and a page reload fixes it because it gives a new selfId and a fresh RTCPeerConnection.
- fix: Close the peer connections only when leaving the game session, not the lobby directory.

In src/net/transport.js, replace the TrysteroTransport.leave at line 54 with:
```js
async leave({ closePeers = false } = {}) {
  const room = this.room; this.room = null; this.peers.clear(); this.stream = null;
  if (!room) return;
  const pcs = closePeers ? Object.values(room.getPeers?.() || {}) : [];
  try { await room.leave(); } catch { /* ignore */ }   // @_leave must go out on a still-open channel
  for (const pc of pcs) { try { pc.close(); } catch { /* ignore */ } }
}
```

In src/net/session.js:125:
```js
leave() { this.transport.leave({ closePeers: true }); this.clear(); }
```

Leave LobbyDirectory.stop() (lobby.js:61) calling plain `transport.leave()`, so joinGame's stopLobbyBrowser() does not kill the shared connection the game join is about to reuse. Closing only after room.leave() matters: closing first would make leaveAction.send throw. room.leave() would then never reach onSelfLeave, and the next joinRoom for that code would get back the stale room object (strategy.mjs:79).

Closing the connection on one side closes the other side's data channel, which clears its shared-peer entry and media cache. Stale detection in signal-handler.mjs:393-411 clears any local entry that is left over, so the next join negotiates from scratch.

A weaker library-level alternative is `cfg._test_only_sharedPeerIdleMs = 0` for both game and discovery joins. It must be set on both, because idleMs is

## [major] Esc or Tab (or any other panel opening) silently dismisses the first-run voice consent prompt, and it is never asked again that session, so the friend's stream is never sent
- where: src/ui/ui.js:468 (lens voice)
- explains report: This explains a friend never being heard: the TALKER never started their mic. The default setting micConsent:'ask' (save.js:39) sends every new player through this prompt. There is no toast and no HUD sign that they are listen-only.
- fix: Leave openPanel alone; that path cannot be reached. Handle the dismissal paths (Esc/Tab calling closePanel) in ui.js:

1. In askVoice (ui.js:468), keep a reference and a flag:
   `let chosen = false; this.voicePrompt = box;`
   In choose(), set `chosen = true; this.voicePrompt = null;` before calling this.closePanel().
   Store a callback on the box:
   `box._onDismiss = () => { if (chosen) return; this.voicePrompt = null; this.toast('Voice chat: your mic is OFF - enable it in Settings > Voice.', 'bad'); if (!this._voiceReasked) { this._voiceReasked = true; setTimeout(() => { if (this.app.game === game && this.app.settings.micConsent === 'ask' && !game.voice.enabled) this.askVoice(game); }, 20000); } };`

2. In closePanel (ui.js:458), before `this.panelOpen = null`:
   `const p = this.panelOpen; ...; p?._onDismiss?.();`
   Call it after clearing the overlay. Skip it when `silent` is true and the call comes from leaveGame, or add a check that `this.app.game` still exists.

Alternative (modal): in main.js:134 and main.js:141, skip closePanel when `this.ui.panelOpen && this.ui.panelOpen === this.ui.voicePrompt`. Compare against ui.panelOpen, which is the content element, rather than overlay.firstChild. The prompt already has a 'Listen only (no mic)' button, so the player cannot get stuck.

Do not map Esc to choose('no'). That would save micConsent='no' permanently, and future sessions would silently skip the prompt.

## [major] Opening the mic on a Bluetooth headset (default device, open mic) can silence the headset's stereo output, and nothing detects or recovers from it
- where: src/net/voice.js:36 (lens voice)
- explains report: This is the best match for the literal report 'no sound comes out of my headphones' if they are Bluetooth. Windows switches the headset to the Hands-Free profile when the mic opens, and the stereo 'Headphones' endpoint the AudioContext renders to can go silent. The friend's voice and all game audio vanish together, which fits the dev's test browser (no mic) working fine.
- fix: 1. Localize the warnings. Pass the askVoice Bluetooth text (ui.js:484), the button labels (ui.js:486-488) and the Settings > Audio "No sound?" hint (ui.js:351) through t(), and add Turkish entries to TR in src/core/i18n.js.

2. Detect the risky case after capture. In voice.js startMic, after line 36:
   const tr = this.rawStream.getAudioTracks()[0];
   this.btRisk = /hands-?free|AG Audio|bluetooth/i.test(tr?.label || '');
   Then in game.enableMic (game.js:110-116), if voice.btRisk:
   - show a persistent, localized notice: "Your headset switched to hands-free mode; if you hear nothing, choose:"
   - [Listen only]: voice.stopMic(); settings.micConsent = 'no'; settings.micEnabled = false; saveSettings(). This releases the mic so the headset returns to A2DP.
   - [Play through headset]: enumerateDevices(), find the 'audiooutput' whose label matches /hands-?free/i (and, if available, the same groupId as tr.getSettings().groupId), then call audio.setOutputDevice(thatId) and save it as settings.outputDevice.

3. For returning players (micConsent 'yes', game.js:107), run the same check and show the same notice, instead of reopening the mic silently every session.

4. Drop the devicechange -> setSinkId(same id) part: it is a no-op. If a devicechange handler is wanted, use it only to refresh the device lists and re-run the step 2 check. Do not use a bare /headset/ match, which flags wired headsets.

## [minor] startMic can run twice at once and cannot be cancelled: rawStreams leak, and the mic stays captured after 'Turn microphone off' or after leaving the game
- where: src/net/voice.js:28 (lens voice)
- explains report: This mostly matters through the Bluetooth problem above. A leaked capture keeps the headset in hands-free mode, so the headphones stay silent or degraded even after the user turns the mic off or leaves to the menu. It also produces extra silent tracks on every peer connection.
- fix: **voice.js (startMic / stopMic):**
```js
async startMic() {
  if (this.mic || !this.settings.micEnabled || this.game.destroyed) return;
  if (this._starting) return this._starting;
  const gen = ++this._gen;
  const p = (async () => {
    ...getUserMedia into local `stream`...
    if (gen !== this._gen || this.game.destroyed || !this.settings.micEnabled) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    try {
      this.rawStream = stream;
      ...build graph, set this.mic, net.addStream, enabled = true, setupRecorder...
    } catch (e) {
      stream.getTracks().forEach(t => t.stop());
      this.rawStream = null;
      this.mic = null;
      this.micError = e.message || String(e);
    }
  })();
  this._starting = p;
  try { await p; } finally { if (this._starting === p) this._starting = null; }
}
```
In `stopMic()`, add `this._gen++; this._starting = null;` before the existing teardown. Also call `try { src.disconnect(); this.micGain.disconnect(); this.gate.disconnect(); } catch {}` there, keeping `src` as `this.micSrc`.

**game.js:** in `destroy()`, set `this.destroyed = true` before `this.voice.stopMic()`. Make `enableMic()` start with `if (this.destroyed) return Promise.resolve();`. In setupVoice, change the timeout check to `if (this.destroyed || this.app?.game !== this) return;`. Don't rely on `!this.net`, which is never nulled.

**ui.js:**
- In `askVoice`, first line: `if (this.app.game !== game || game.destroyed) return;`. Repeat the same ch

## [minor] A saved micDevice is requested with {exact} and there is no fallback, so a missing headset or mic means the player never transmits
- where: src/net/voice.js:35 (lens voice)
- explains report: This explains a friend not being heard when they once picked a specific mic in Settings > Voice and that device is now absent (a different headset, BT headset off, a dock). They only get a cryptic toast such as 'Microphone unavailable: OverconstrainedError'.
- fix: The proposed fix works. A more complete version:

(1) In voice.js:35, use `constraints.audio.deviceId = { ideal: this.settings.micDevice }`. The browser then uses the saved device when it exists and otherwise falls back to the default, without throwing.

(2) Or keep `exact` and add a retry. In the catch at voice.js:37, if `this.settings.micDevice && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')`, delete `constraints.audio.deviceId`, retry getUserMedia once, and set a notice such as "Saved microphone not found - using default".

(3) Show the error by name. Use `this.micError = e.name ? e.name + (e.message ? ': ' + e.message : '') : String(e)`, and give a friendly message for OverconstrainedError.

(4) Fix the Settings > Voice dropdown at ui.js:356. After enumerateDevices resolves, if `s.micDevice` is not among the audioinput ids, either add a selected "(missing device)" option or reset `s.micDevice = ''` and save. That way the UI no longer shows "Default" while the setting still points to the missing device.

## [minor] The voice volume setting is applied twice, so the slider is effectively squared
- where: src/net/voice.js:201 (lens voice)
- explains report: This only contributes: at 50% friends play at 25% (-12 dB), and at 30% at 9% (-21 dB). Combined with distance rolloff, a quiet friend can become inaudible.
- fix: In voice.js:201, change the line to `p.gain.gain.setTargetAtTime(vol * (rp.localVolume ?? 1), t, 0.05);`. The voice bus (audio.js:140) then applies voiceVolume exactly once, to proximity voice, the walkie radio path and skinwalker clips alike. Do not add voiceVolume to radioGain (voice.js:211), because it already goes through the bus.

## [minor] When the listener dies, the per-peer occlusion lowpass is frozen, so spectators can hear some friends permanently muffled at 900 Hz
- where: src/net/voice.js:204 (lens voice)
- explains report: This contributes to a friend sounding 'gone' or unintelligible while you spectate, but not to total silence.
- fix: The reviewer's fix is correct. In src/net/voice.js at lines 204-208, add an else branch: `if (p.occlT <= 0 && !listenerDead) { ...existing... } else if (listenerDead) { p.lp.frequency.setTargetAtTime(18000, t, 0.1); }`. Optionally, also set `p.occlT = 0` in that branch so occlusion is checked again on the first frame after respawn. It already is in practice, because occlT keeps counting down while the listener is dead.
