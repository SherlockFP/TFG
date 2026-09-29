# Wave 3 - NET: "friends drop from the game after a while"

Status: node-tested (`tools/harness/net_session.test.mjs`, fake transport) + one local two-tab `mp2.mjs` run (BroadcastChannel only).
NOT tested over real WebRTC / real internet, and reconnect-over-Trystero (`rejoin()`, ICE restart timing) is unverified.

## Causes found (ordered by how likely they explain "after a while")

1. **A transport leave was final.** `Trystero` closes a peer after 5 s of ICE `disconnected` (or on `failed`, a datachannel error or any
   `createOffer` error -> `exitPeer`) and does NOT restart ICE. It re-announces and usually re-discovers the same peer id seconds later,
   but the game treated the first `onPeerLeave` as a real leave: host dropped the player's items and avatar (`hostOnPlayerLeave`), a
   client whose host link blipped got `hostLeft` -> alert "The host has left" and the run was gone. (Mobile/Wi-Fi roaming, NAT rebind,
   laptop sleep, a loading hitch on a weak uplink all trigger it.)
2. **`Game.update` had ~40 unguarded stages before `netSend()`.** Any exception in `remotes[].update`, `creatures.update`,
   `hostUpdate`, `director`, `voice`, view model ... aborted the frame every frame, so that player stopped sending `ps` / `is`
   (peers see them freeze and vanish) and a host with a bad stage stopped `cs`/`gs` sync. Looks exactly like "dropped after a while"
   (the trigger is any content-dependent bug, e.g. a certain creature type or item). Fixed: `netSend` now always runs (`try/finally`)
   and the risky stages are wrapped in `guard()` (throttled console.error).
3. **No TURN.** Trystero only ships public STUN. Symmetric NATs / carrier-grade NAT pairs never connect, and pairs that connect but
   later lose the NAT mapping cannot recover. Now supported: `VITE_TURN_URL[,..]` / `VITE_TURN_USER` / `VITE_TURN_CRED` at build time or
   `localStorage['tfg.turn'] = '{"urls":"turn:host:3478","username":"u","credential":"c"}'` (JSON object or array) -> `turnConfig`.
   Someone still has to run/pay for a TURN server (coturn); nothing is configured by default.
4. **Unbounded send queues + unhandled rejections.** `_msg.send()` is async and awaits the datachannel drain per 16 KB chunk (10 s timeout,
   then silently drops the rest of that message). We never awaited or caught it: a stalled peer accumulated hundreds of pending sends
   holding chunk arrays, then burst; a vanished peer produced unhandled promise rejections. The try/catch around it never saw them.
5. **Silent tail loss of big messages.** After the 10 s backpressure timeout the remaining chunks of a message are dropped. If that is the
   `welcome` snapshot the joiner waits forever (25 s fatal "Could not reach the host"). Trystero itself does chunk (16 KB, 16-bit nonce,
   reassembly per peer) so message size alone is not a hard limit.
6. **Hidden host tab.** Timers of a hidden tab run at ~1 Hz and the fallback loop advanced only `dt <= 0.1` per fire = 10 % game speed
   and 1 Hz snapshots for the crew. (WebRTC pages are exempt from Chrome's *intensive* 1/min throttling, not from the 1 Hz one.)
7. **Voice renegotiation.** Adding the mic stream later (`room.addStream`) renegotiates every peer connection; any offer error there
   goes to Trystero's `handlers.error` -> `exitPeer`, i.e. the link is closed. Not changed (Trystero internals); mitigated by (1).
8. Not causes (checked): `Emitter.emit` catches listener exceptions, so a throwing `peerLeave` handler cannot skip Trystero's own cleanup;
   `Session.receive` guards `req` / message handlers; relay cannot loop (clients never relay, host relays only client->client types
   and `relay` envelopes are ignored by the host).

## Fixes (files)

- `src/net/session.js`
  - **Loss grace + resume**: `peerGone()`; unless the peer sent `bye`, it stays in `players` for `NET.LOST_GRACE_MS` (45 s) as `lost`
    (`peerLost` event); a `hello` from the same id inside the window (or a silently swapped link) is a resume (`peerResume`, then
    `playerJoin(id, info, resume=true)` on the host / `peerHello` on clients); expiry -> the old hard `peerLeave` / `hostLeft('timeout')`.
    `bye` (sent by `leave()`, `beforeunload`, `pagehide`) and LocalTransport's own bye are immediate leaves. A new peer id carrying the
    same `pid` frees the ghost slot at once (page reload); the inventory module already re-attaches items by `pid`.
  - **App heartbeat**: `hb` every 2 s (independent of the game loop), `lastSeen` per peer; 20 s silence -> `peerStall`; 75 s on a "linked"
    peer = zombie (host drops it, client rejoins the room).
  - **Active reconnect**: `transport.rejoin()` (leave + join the same room, same selfId, forces a fresh announce) when the host has been lost
    > 10 s, or when a lost peer exists and we have no links at all; rate-limited to once per 20 s.
  - **Packet cap**: `flush()` splits per-peer batches at `NET.PACKET_CAP` (12 KB); one bigger message goes alone.
  - **Backpressure**: `transport.congested(peer)` (> 30 unresolved sends). Latest-wins streams (`ps`, `cs`, `is`, `sgs`) are not queued
    for a congested peer (keyframes every 1.5 s heal it); directed messages to non-linked peers are dropped instead of warned about.
  - Joiner without a welcome re-sends `hello` at 8/16/24 s (host answers a known peer with a fresh welcome).
- `src/net/transport.js`: one send per peer with per-peer in-flight counters, `.catch` on every async send / binary send / leave,
  exceptions in app callbacks cannot escape into Trystero, `rejoin()`, optional TURN, `onPeerLeave(id, deliberate)`.
- `src/game/game.js`: `peerLost` / `peerResume` / `peerStall` toasts (EN/TR/RU), `hostLeft` message distinguishes leave vs network
  timeout, `onWelcome` with `resume` (keeps the player's position, held items and loadout; re-syncs items/creatures/doors/run),
  `update()` = `updateFrame()` + guaranteed `netSend`, `guard()` around risky stages.
- `src/game/host.js`: `hostOnPlayerJoin(id, info, resume)` - a resume skips `gateJoin` and the "joined the crew" message, sets
  `welcome.resume`, and still emits mods `playerJoin` (4th arg `resume`) so modules re-send their per-player state.
- `src/main.js`: hidden-tab loop catches up in up to 8 steps of 0.1 s.
- NETSTATS (terminal `NETSTATS` / chat `/net`) has a new line: `reconnects / lost (now) / grace-expired / rejoins / stalls / dropped / split-packets`.

## Handler collision scan (`node tools/harness/net_collisions.mjs`)

`Session.on_` and `Session.handle` are Maps: a second registration silently replaces the first. Result over `src/`:
74 distinct `on_` types, 70 distinct request actions, **0 real collisions**.
- `on_('g2')` is registered twice in `gameplay2.js` (netReady hook and immediately) - same function, harmless.
- `hit` (host.js -> forge.js / combat.js / combat_weapons.js) and `shipdoor` (host.js -> siege.js) are intentional wrap chains via
  `net.handlers.get()`; `lore.js` wraps `door` and restores it. Chain order depends on module install order.
- No type is both an `on_` handler and listened to as `'msg:<type>'` (that listener would never fire).
- Type names that exist as both message and request (`door`, `term`, `g2`, `lore`) live in separate maps - fine.

## Bug scan

All `tools/harness/*.test.mjs` and `wave1_facility_paths.mjs` pass (25 files). Only confirmed bug fixed: the unguarded `Game.update` /
`netSend` ordering above. `_lastRejoin || 0` style rate limits break in the first seconds after page load (`performance.now()` small):
found by the new test, fixed with `?? -1e9`.

## Not done / next

- Host migration (host tab closes = run over; clients get a clear message, no hang). Needs a state hand-off design.
- Real-internet verification: run two machines, `chrome://webrtc-internals`, kill Wi-Fi for 10-30 s and check `peerLost` -> `peerResume`.
- Provide a TURN server (coturn) and set `VITE_TURN_*`.
- Mic start renegotiation glare (voice.js) - consider starting the mic before joining rooms.
