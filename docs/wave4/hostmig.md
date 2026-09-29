# Wave 4 - HOST MIGRATION (module `hostmig`)

Status: node-tested (`tools/harness/hostmig.test.mjs`: 3-4 real `Session` objects over an in-memory mesh + fake games) and driven once in the real
game with two tabs (`tools/harness/wave4_hostmig_mp.mjs`, LocalTransport). NOT tested over real WebRTC / real internet.

## What it does

When the host quits (bye) or crashes (transport drops, no bye) the crew no longer gets "The host has left. Session ended.":

1. Every remaining peer runs the same election: candidates = self + every peer that said hello and is currently linked and not `lost`, minus
   the old host; the winner is the lowest rank in the crew order. The order is the host's join order, broadcast by the host every 3 s in `hmx`
   (peers that joined after the last `hmx` come after the listed ones, sorted by id). Unreachable peers are ignored.
2. A dialog (`.overlay` + CRT panel, EN/TR/RU) says **HOST LEFT - Host disconnected. Continue with <name> as host?** with
   **[Continue (new host)]** and **[Leave to menu]**.
   - bye / grace expiry: the dialog opens at once. Plain connection loss (no bye): the wave-3 45 s grace + resume is unchanged and the dialog
     only opens after `HM.PROMPT_DELAY_MS` (6 s). If the old host resumes (peerResume / hello) the dialog closes and nothing migrates.
   - the successor takes over when it presses Continue, or automatically after `HM.AUTO_CLAIM_MS` (12 s). Everyone else follows the successor's
     claim at once (they do not have to press anything; pressing Continue only switches the dialog to "Waiting for <name>...").
   - a successor that never answers (frozen tab) is skipped by the others after AUTO_CLAIM + CLAIM_WAIT (12 + 30 s) and the next candidate is elected.
   - solo (nobody else left): you are the only candidate -> you become host and the run continues.
3. The successor (`becomeHost`): `net.migrateTo(self, epoch+1)` (isHost, hostId, roster), broadcasts `hmclaim` FIRST (per-peer message order is
   preserved so followers re-point before any host-only message arrives), then rebuilds host-side state (below), `registerHandlers()`,
   drops the old host as a leaver (`hostOnPlayerLeave`: its held items fall, latched leeches release, `pleft`), re-broadcasts every run field
   (`gs`, `_runSent` reset) and restarts the delta-row keyframes. Followers `net.migrateTo(claimant)`, drop the old avatar, re-apply item
   physics authority (`owner || hostId` is now the new host), toast, and emit the mods event.
4. mods event **`hostMigrated`** `(game, { oldHostId, newHostId, epoch, self, degraded })` on every peer (also `game.emit('hostMigrated', info)`).

## What is restored (and from where)

| State | Source | Result |
|---|---|---|
| run (phase, moon, seed, time, quota, credits, upgrades, `run.*` of every module) | already mirrored by `applyRunState` on each client | exact (time is up to 3 s old) |
| items (world, held, bags, tiers, battery...) | already replicated on every client | exact; owner = old host -> physics authority moves to the new host; the old host's held items drop where its avatar stood; item id counter jumps past every known id |
| creatures | client `CreatureView` (`view.spawnData` = the original `sp` event, kept by a one-line change in creatures.js) + last `cs` rows | re-created with `hostSpawn(..., {id})` under the SAME id (clients ignore the duplicate `sp`): type, level, elite, variant, affix, tier, hp, position, state. Dead corpses get a delayed `rm`. `HostCreature.data` (nest camps, boss phases, ai timers, targets) is not replicated: **defaults after migration** |
| `hostData` (dayStats, pressureStage, moonT, power used, takeoff reason, `collected` set) | `hmx` snapshot (<= 3 s old); `collected` rebuilt from item `col` flags | restored; without any `hmx` (host died in the first 3 s) defaults + the `hostData` note in `degraded` |
| `config` (features, day length...) | `hmx.cf` (skipped if > 3 KB) | restored |
| doors / power / ship door | facility door objects + `run.powerOn` are mirrored on every client | exact |
| landing / takeoff timers | a `landing` / `takeoff` phase that was running on the old host gets `hostFinishLanding` / `hostFinishTakeoff` scheduled 3 s after the takeover | continues |
| save slot | the new host saves the migrated run into slot `'mig'` (`kefal.run.v1.mig`), never into one of its own slots 1-3 | invisible in the slot list |

## Modules that may lose state (nothing crashes, they reset to phase-safe defaults)

`hostStart` is deliberately NOT re-emitted: `cycle` (resets `run.cycle` to the gate), `lore` (regenerates contracts), `aptitudes` (re-assigns roles)
would reset mid-run state. Consequence: hooks that only run on `hostStart` do not run on the successor. Affected (react to `hostMigrated` if you need it):
- `homeworld`, `shipyard`, `crew`: their `attach()` / `pushCrew()` host-side setup; the replicated `run.hw` / `run.sy` fields survive, host-only caches do not.
- `aptitudes`: role assignments already delivered stay; new joiners after a migration are assigned again by its `playerJoin` hook.
- Anything that keeps host-only state in module closures: `balance` (Threat meter), `director` (pressure / relief timers), `horde` invasions, `factions`,
  `algorithm`, `contracts`, `secureloot` drills, `deployables`, `pets_net`, `siege`, `cycle_inst` / bosses fights in progress, `weekly`, `roulette`,
  `boardgame`. They keep running with their defaults or idle until the next phase change; `game.hostData.*` fields they add are gone.
- Every `registerHandlers` hook runs again on the successor (request handlers are re-registered), so requests work; but a handler that relies on
  host-only state built in `hostStart` sees it empty.
Not migrated at all: the public lobby-browser listing (main.js announces only for the original host; friends still join with the lobby code, the
room name is the same), voice/mic (unchanged, WebRTC streams are per peer), the host's `hostSave` slot.

## Safety rules / split-brain

- Every claim carries an epoch (`net.hostEpoch`, +1 per migration, synced from `hmx` / direct claims for late joiners). A claim is only accepted while
  we have ourselves seen the host go away (`lost` / prompt / waiting) or when it is from a lower-ranked peer at the same epoch; a claim that arrives
  earlier than our own detection is kept as `pending` for 60 s.
- A claimant is not accepted while a better-ranked candidate is still alive in our view (it gets the skip timeout first).
- Same epoch conflict: the lowest rank wins everywhere; the other one demotes (`follow()` clears its host state and timers).
- The old host reappears after the crew moved on: the new host sends it a direct `hmclaim` on `peerConnect`; a host with **no other healthy linked
  crewmate** yields (`fatal`: "The crew continued without you ... Rejoin with the lobby code" -> menu). A host that still has a healthy crewmate assumes the
  claimant is the one with the bad link: it keeps hosting, adopts the epoch and broadcasts `hmclaim {k:1}` - the claimant demotes and follows it again.
- Anybody in the crew can hijack the host with a forged claim while a loss is pending (friends game, same trust model as the rest of the protocol).
- Real network partitions (A sees B dead and B sees A dead) can still produce two hosts until the links heal; the rules above then merge them.

## Files / shared-file changes (all tiny)

- `src/game/hostmig_core.js` (new): pure rules (`candidates`, `cmpRank`, `nextOrder`, `creatureOptsFromView`, `buildX`, `hostDataFrom`, `HM` knobs).
- `src/game/hostmig.js` (new): module `hostmig`, dialog, protocol, state rebuild, EN/TR/RU strings.
- `src/net/session.js`: `hostEpoch = 0` + method `migrateTo(newHostId, epoch, keepOld)` (flips `hostId`/`isHost`/`connected`, forgets the old host's lost/lastSeen/links/player record, marks `players[].host`). No behavioural change unless called. `finalizeLeave`, grace, resume, heartbeats untouched.
- `src/game/game.js`: import + `useModule('hostmig', installHostMig)`; the `hostLeft` handler is now `this.hostmig?.onHostLeft?.(why) || this.emit('fatal', ...)` (module returns true when it took over; false for a joiner that was never welcomed, a destroyed game, or `config.hostMig === false` -> exact old behaviour).
- `src/entities/creatures.js`: `CreatureView.spawnData = d` (keeps the `sp` event) and `hostSpawn` honours `opts.id`.
- `src/net/lobby.js`: untouched (GAME_VERSION unchanged, so old/new builds still talk; old clients ignore `hmx` / `hmclaim`).

## Net messages (all `hm*`)
- `hmx` host -> crew (every 3 s, and 0.6 s after a join): `{ e epoch, o join order, ds dayStats, ps pressureStage, mt moonT, pu power used, tr takeoffReason, ln lobby name, t time, cf config? }`. Accepted only from `net.hostId`.
- `hmclaim` `{ e epoch, r rank, o order, k? }`: successor -> crew (also relayed by a host: in `relayTypes`); new host -> every peer that connects afterwards; `k` = "the old host is alive and kept its crew".

## Knobs (`HM` in hostmig_core.js, mutable)
`PROMPT_DELAY_MS` 6000, `AUTO_CLAIM_MS` 12000, `CLAIM_WAIT_MS` 30000, `XCAST_MS` 3000, `PENDING_MS` 60000, `MAX_X_BYTES` 6000. `config.hostMig = false` (host option) disables the whole feature.

## How to test
- `node tools/harness/hostmig.test.mjs` (56 checks: election rules, crash + auto election, bye + clicks, silent successor skipped, resume inside grace, stale host yields,
  mistaken claim / demotion, solo chain, disabled/never-welcomed fallbacks; asserts no exception or warning is logged).
- Real game: `flock /tmp/tfg-browser.lock node tools/harness/wave4_hostmig_mp.mjs --port 5181 [--shot x.png]` (two tabs, host tab closes).
- By hand: host + 1-2 friends, close the host tab: the crew sees the dialog; Continue; the lowest-rank friend is the host, creatures and items are still there.

## Known gaps
- Not tried over real WebRTC (Trystero) - the peer set used for "alive" is `transport.peers` minus `lost`; a peer without a direct link to somebody may compute a different candidate list (the rank/epoch rules then converge, see above).
- Creature AI side state, host-only module state (list above) resets; a boss fight in progress is not resumed.
- Lobby browser does not list a migrated session; no "old host may rejoin as a normal player" flow (it must rejoin by code; the game does not auto-rejoin).
- The dialog does not show after the game-over / while a fatal alert is open; ESC does not dismiss it.
