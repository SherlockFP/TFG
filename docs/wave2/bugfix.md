# Wave 2 - bugfix module (`src/game/bugfix.js`)

Scope: owner's body-carrying report (priority 1) plus the mp2 "The host has left." investigation. The broader hunt was
stopped early on the lead's budget instruction, so only confirmed bugs are listed. BUGS.md has one `FIXED (wave 2)` line per fix.

## Fixed

| # | Bug | Root cause | Fix (files) | Evidence |
|---|---|---|---|---|
| 1 | Body can not be carried through the entrance / a fire exit, in or out | Bodies were moved with the physics grab beam only. `useExit` (actions.js) `player.teleport`s to the other map (FACILITY_Y = -300), `GrabBeam.physicsStep` drops anything > 4.5 m from its target, so the body stayed behind at every door | Bodies are now a 2-handed **hand-carried** slot item: `pickup()` (E, or LMB with empty hands) puts it in a hotbar slot, so it is not physical and goes with the carrier through every door, `tp` message and ship teleporter, host and clients (`actions.js` findInteraction/pickup) | bugfix_body: entered facility with body, came back OUT, fire exit round trip |
| 2 | More than one body / weak slowdown | only the beam's 0.88 speed and 0.4x weight applied | ONE body per player: client toast "You can only carry ONE body at a time." + host `pick` refusal (`host.js`); bag/inventory refuse bodies (already `bagRejectReason`, verified); carrying = **no sprint**, walk x0.85 on top of the 90 lb weight factor (`localplayer.js carriesBody()`); throw = plain drop; body drops lying across the view; host refuses `grab` on bodies | walk 2.81 m/s vs 4.72 free, sprint key gives 2.81 (free sprint 7.69); second pick refused on both sides; bag refuses |
| 3 | Big scrap and Sell Bodies carcasses (`kind: 'big'`, beam) were also dropped at doors | same beam/teleport root cause | `bugfix.js` wraps `player.teleport`: a jump > 6 m with a locally owned beam item moves the item in front of the player (wall-safe raycast, no fake fragile impact) | beamed `server` rack stays 2.3 m from the player in and out |
| 4 | Body carried onto the ship did not reduce the fine | `hostFinishTakeoff` only counted world items inside the ship; a held body is `state: 'held'` | held bodies of players aboard count (`host.js`) | fine 50 (5%) with the body aboard vs 150 (15%) left behind |
| 5 | Objective tracker ignored a carried body | only world bodies were listed | "Carry X's body to the ship (smaller fine)" while carrying (`objectives.js`) | code only |
| 6 | mp2: client ends with "The host has left. Session ended." | `LocalTransport` (BroadcastChannel) evicted a peer after 5 s without a heartbeat, checked inside the same `setInterval` a blocked / hidden tab starves: after a long task (moon world-gen, hidden-tab 1 Hz timers) `last` is stale while the peer's queued heartbeats are still unread; a peer tab busy building a moon can also be silent > 5 s. It is NOT the session.js batching (reproduced before it, lead's finding). Real players on Nostr/MQTT/torrent are not affected (Trystero), this is the same-PC dev/test path | `transport.js`: skip eviction + refresh `last` when this tab's own timer stalled > 2.5 s; timeout 5 s -> 15 s (a real leave still sends `bye`) | reasoning only (no mp2 run: budget) |

Other checked behaviour (all pass in `tools/harness/bugfix_body.js`, 28 checks): drop / throw (throw speed 1.5 m/s), death of the
carrier (body dropped in the world, own body spawns too, nothing lost), late-join rows (`welcome` carries `h` = carrier; a peer
builds the item `held`, no physics body), bodies removed at take-off, Sell Bodies carcass path (beam items now cross doors; the
small carcasses use pockets as before and are unaffected by the one-body rule, which only covers `type: 'body'`).
`smoke_land.js` (3 moons): `errs: []`.

## Not fixed / not verified

- **mp2 client check not run** (budget alert): the client-side pick -> host `pickfail` path, remote avatar rendering of a carried body and
  a real late joiner were checked at the item-row level only (harness above). The host-side rule was exercised with a raw
  `net.request('pick')`.
- **Visuals unverified**: first-person hold offset (`refreshHeldVisuals`, body at 0,-0.28,-0.75 in hand space) and the remote avatar
  hand pose (`refreshRemoteHeld`, 0,0,0.35) were written for a body-in-hands that never happened before (the beam was the only path);
  the 1.4 m body bag may poke through the view or the avatar. No screenshots taken (budget).
- Teleporter description says it beams the target's body too (BUGS.md open item): still unimplemented, out of scope.
- Broader hunt (inventory, crafting, shop/weapons, magic, rpg, session sendRows) not started: stopped at the confirmed bugs.

## Files
`src/game/bugfix.js` (new), `src/game/game.js` (import + slot), `src/game/actions.js`, `src/game/host.js`, `src/entities/localplayer.js`,
`src/game/objectives.js`, `src/net/transport.js`, `tools/harness/bugfix_body.js`, `docs/BUGS.md`, this file.
