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
