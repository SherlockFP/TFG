# Multiplayer hotfix — 2026-09-30

Based on main c7567e4. P2P remains Trystero/WebRTC: the host is a player's browser, not a dedicated game server.

## Verified code defects and changes

- W9 commit 77e29df introduced PLAY that immediately hosted a private lobby, with separate HOST / QUICK SHIFT / JOIN entries. There is now one PLAY gateway to the server browser. HOST GAME sits beside Refresh; public listing defaults on. Campaign and Quick Shift are options in host creation; save slots and private/password lobbies remain available.
- A lobby-row Join button bubbled into the row handler and started two joins. The row skips button clicks, `joinLobby` has a pending guard, and `App.startGame` prevents overlapping session startup, including while assets are loading.
- A client previously entered the game before receiving its world snapshot, and Session marked `connected` before the snapshot handler could fail. Startup now waits for successful world application, and sends no player/item snapshots before that. The initial timeout is 45 seconds; an unsuccessful handler can retry.
- Missing client-to-client ICE links depended on delayed link reports. Gameplay messages (`ps`, `pst`, `pinfo`, `itst`, `is`, `chat`, `fx`, `modmsg`, `ping`) now go through the host peer once, with the original sender retained. Host forwarding no longer depends on mesh link reports. `broadcast()` uses the same routing for client-originated messages. Relayed state respects backpressure. Voice/media and host-migration election retain their existing mesh behavior.
- The 29 September backpressure change waited for 30 unresolved sends before dropping movement snapshots. With 12-KiB packets, that could let far more than Trystero's 64-KiB low-water threshold accumulate. Trystero 0.25.4 waits up to 10 seconds for its data channel to drain, then stops sending the remaining chunks of that message. The previous hotfix still used the old cutoff; this follow-up corrects it to four in-flight packets. The session keeps reliable packet order, sheds stale latest-wins state only for congested peers, compacts repeated state within a frame, and splits large creature, item and deployable snapshots at the 12-KiB byte cap. Each peer is checked independently. `NETSTATS` byte accounting now measures UTF-8 payload size.
- Real-game bytes per second have not been measured over a real WebRTC link here. The regression sim saturates one peer at four pending sends while another stays healthy; it checks reliable event delivery, stale-state shedding and large-row packet limits. This is a buffer-safety fix based on the library's actual limits, not a measured bitrate claim.
- Host admissions carry `pjoin`; welcome rosters populate Session.players as well as avatars. Losing an incidental client-to-client link does not evict a player still reachable through the host. Rejected mod/late joins release their slot immediately and cannot bypass admission by retrying as a resume.
- Periodic player state heals missed death/revive visibility transitions.
- Refresh now queries public hosts instead of only redrawing an old list. Advertisements include the network strategy, used when joining. The stale-list window is 30 seconds instead of 7.5. Stopping discovery during async startup cannot leave an orphan timer/room.
- Nostr uses 10 library-default relays instead of 5 (same stable appId and overlap with existing default endpoints). Optional VITE_NOSTR_RELAY_URLS can override the complete list for both discovery and gameplay. This improves redundancy; no particular endpoint has been verified live here. A client with no host announcement retries signaling after 10 seconds (rate limited).
- Wire version is 0.11.0; all players must reload after deployment.

## Historical comparison

The earliest available clean commit 6da9485 already used the same appId, Nostr default relay selection, and WebRTC transport. 590e2e9 added batching/delta snapshots; 6535c07 added connection recovery/backpressure; 50a6263 added host migration; 77e29df changed menu entry behavior. None of this proves which historical revision worked on the owner's two computers. No wholesale rollback or switch to a dedicated server was made.

## Validation

Passed: `npm test -- -j 3 multiplayer_hotfix net_session netaudit hostmig joinplay downed profile mirror` (8 suites), `node tools/harness/net_collisions.mjs` (0 unwrapped collisions), syntax/diff checks and `npm run build`.

The new regression suite simulates both star topology (no A-B link) and full mesh: roster admission, exactly-once movement, inventory broadcasts, client request → host item event, failed snapshot retry, revive visibility, discovery refresh/unlist, async cancellation and the Trystero adapter contract.

NOT verified: actual browser layout/3D rendering, two physical computers over real WebRTC, microphone routing. Chromium was unavailable and its download was blocked. GitHub writes were unavailable, so this fix is packaged but not live-deployed.

## Internet configuration / remaining limit

Signaling relays only introduce peers; gameplay stays between players. Existing TURN support remains optional: `VITE_TURN_URL` (comma-separated URLs), `VITE_TURN_USER`, `VITE_TURN_CRED`, or local `tfg.turn` JSON. No relay service or credentials have been provisioned. A pair whose host-client ICE connection cannot cross its NAT/firewall still needs a suitable relay; changes to game synchronization cannot override that network restriction. The owner's report of formerly working P2P is not treated as proof of a NAT problem.

Before calling this production-verified: deploy, reload all players, find/join a public lobby on two different computers, move and watch both avatars, pick/drop/use an item, change phase and late join, then test a third client. Voice requires a separate real-microphone check.

## Follow-up — 2026-09-30 evening (owner: "P2P Fix Test still broken; it broke after a network change on the 29th")

Tested on the owner's PC with the real Nostr signalling (not LocalTransport): host in one tab, `?autojoin=CODE&net=nostr`
in a second tab, lobby browser in a third. Host ⇄ joiner sync both ways, the lobby appeared in the browser in 0.5 s.
While the test lobby was public, a real stranger ("Intern389") found it in the server browser and joined over the
internet: ICE path `srflx -> srflx` (direct through NAT via STUN), 62 ms. So the protocol works over the internet;
what fails is **specific networks** and the **29-09 rejoin logic**.

Changes:
- **Rejoin regression (6535c07, 29-09):** a joiner that had not met the host after 10 s left the Trystero room and
  re-entered it, and the HOST did the same whenever it had lost players and no link left. Trystero's own handshake
  windows are longer (answer TTL 23.3 s, disconnected-peer grace 7.5 s), so a slow first handshake (slow relays, real
  NAT) was aborted and restarted forever, and a host rejoin dropped everyone else plus every in-progress join.
  Now: first-join rejoin after 35 s, lost-host rejoin after 25 s (every 30 s at most), **the host never rejoins**.
- **NAT failures are no longer silent:** Trystero's "could not connect to peer … after exchanging SDP" (= the two
  peers found each other but no ICE path exists: symmetric NAT / CGNAT / firewall) is tagged `kind: 'nat'`; a joiner
  gets a clear fatal after 8 s ("blocked by a router / mobile network (NAT), a TURN relay is needed"), the host a toast.
- **Same network for everyone:** settings v3 migrates every saved `netStrategy` to `nostr` once (a friend left on
  MQTT / torrent / local never sees your lobby and a code join times out).
- **Lobby browser status line** shows real numbers: players online in the lobby network (actual WebRTC links) and
  signal relays reachable (`n/10`); 0 relays shows a red warning.
- **NETSTATS** (ship terminal) now prints relays open, TURN yes/no and per player `ice` state + path
  (`host->host` LAN, `srflx->srflx` direct through NAT, `relay` = TURN) and players still in the loss grace window.
- `tools/harness/netaudit_wave8.test.mjs` crashed on Windows (`URL.pathname` → `D:\D:\…`); fixed with
  `fileURLToPath`. It now runs: 148/154 — the 6 failures are pre-existing static checks for `hubgate.js` / `repomaps.js`
  message types (not touched here).

### TURN relay (needed for friends on mobile data / CGNAT / strict routers)
No free public TURN works any more (tested 2026-09-30: openrelay.metered.ca public creds and freestun.net are dead).
Without TURN, two players whose NATs are both strict can never connect — no code change can fix that.
1. Create a free TURN account (e.g. metered.ca → "TURN Server" free plan; it gives URLs like
   `turn:global.relay.metered.ca:80`, `turn:global.relay.metered.ca:443`, `turns:global.relay.metered.ca:443?transport=tcp`
   plus a username and credential).
2. On Render → the service → Environment, add `VITE_TURN_URL` (comma-separated URLs), `VITE_TURN_USER`,
   `VITE_TURN_CRED`, then redeploy (Vite bakes them in at build time). Everyone reloads.
3. Check in game: terminal `NETSTATS` → `TURN: yes`; a friend who only works through TURN shows `path relay->…`.
   Quick per-browser test without a deploy: `localStorage['tfg.turn'] = '{"urls":["turn:…"],"username":"…","credential":"…"}'`.
Note: TURN credentials in a static site are public; anyone reading the bundle can use the quota.
