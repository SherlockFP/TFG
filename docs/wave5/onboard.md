# Wave 5 - ONBOARD: "Hiring Day" first start + staged unlocks (module `onboard`, MASTERPLAN 25.1 + 23.1)

Status: node test (510 checks, incl. a full Hiring Day driven on a stub game with a fake DOM) + `npm run build` green; one short headless run (see "Browser" below). NOT hand-played, NOT tested with 2 real players.

`this.useModule('onboard', installOnboard)` (last slot in `game.js`) -> `game.onboard`. **No new net message types**: the wing is local to the host player, the crew is told through the existing `'sys'` message.

## Files
| File | Role |
|---|---|
| `src/game/onboard_core.js` | PURE: flow state machine (`newFlow`, `note`, `forceTo`, `skipFlow`, `stageOf`), `shouldRun` skip rules, `isVeteran`, `remarkFor`, unlock schedule (`UNLOCKS`, `decideMode`, `progressOf`, `fold`, `isOpen`, `pendingGifts`) |
| `src/game/onboard_text.js` | every string as `[en, tr, ru]` (`x(id)` / `xf(id, vars)`, registered into the i18n tables at import) |
| `src/game/onboard_world.js` | the set: Cell 07, corridor, locker room, break room, hangar with the Mini-Skeld. Merged geometry + static Rapier boxes |
| `src/game/onboard.js` | install: timeline, per-frame fact polling, interactables, objectives, guide hooks, unlock guards, `game.onboard` API |
| `tools/harness/onboard.test.mjs` | node test |
| `tools/harness/wave5_onboard.js` | headless script (screenshots of every area) |

Shared edits (all tiny, each marked `[onboard]`): `game.js` (import + slot, 2 lines); `guide.js` (2 guards: `game.onboard?.active?.()` holds the guide's tutorial objectives / lines while Hiring Day runs); `ui.js` (2 Settings checkboxes + 1 import); one guard line each in `forge.js` (`open`), `pets.js` (`api.open`), `voyage.js` (`enabled` + `sigLines`), `cycle3_gates.js` (`dayRoll`), `terminal.js` (host `route`).

## The player's path (Hiring Day)
1. **Cell 07 (0-30 s).** Black -> blink -> wake. Company announcement in a top bar (3 lines, hazard-tape header), then The Algorithm on the intercom: "Hello, Employee. I am The Algorithm. I'm watching you." + "Everything you do from now on is content. Smile." The cell door slides open.
2. **Corridor (2-3 min)**, linear, every step is a *fact* so nothing can get stuck:
   * walk 10 m -> **crouch** under a 1.3 m duct (standing capsule 1.8 m does not fit, crouched 1.12 m does) -> **sprint**: crossing the yellow line drops a shutter 14 m ahead after 2.2 s (walking 5 m/s = 2.8 s fails, sprint 8.2 m/s = 1.7 s passes; it reopens after 1.6 s; after 3 misses it stays open: "the Company is feeling generous"),
   * **locker room**: `Company locker 07 [E]` -> a flashlight drops out (loan; you keep it), press F (guide step `flash`),
   * **break room**: a coffee mug on the desk = first loot pickup (guide step `scrap`),
   * a gate opens; passing it starts the **blackout**: lights die (main material swaps MeshBasic -> dark MeshLambert, emissive mesh dims), a black figure with two magenta eyes stands at the corridor end (harmless), leaves after you look at it 0.7 s (or 5.5 s), lights flicker back, "It is contractually harmless. Mostly.",
   * **filing cabinet**: `game.openMinigame('lockpick', {tier:'simple'})` (lockpick2; retry forever; attempts are counted). Success opens the hangar door.
3. **Hangar**: big board over the Mini-Skeld explains TERMINAL / LEVER / DOOR (EN/TR/RU), `Board the Mini-Skeld [E]` -> fade -> the wing is **disposed** and the player is put into the real ship (`spawnInShip`).
4. **Real ship**: objectives TERMINAL (a typed command, or closing it after 4 s) -> LEVER (route is the default easiest moon 56K-Dialup, free) -> land -> open the ship DOOR -> ONE goal: **bring 50 of scrap to the ship** (`hostData.dayStats.collected`, clients: ship items) -> leave.
5. **First return**: the normal day summary; when its panel closes The Algorithm makes ONE remark chosen from what you did (`remarkFor`: died / short of 50 / N lock attempts / shutter misses / hugged the left or right wall / clean). +50 XP. `profile.onboard.s = 'done'`.

The guide's own tutorial (7 steps) keeps running underneath: `move` (after the shutter), `flash`, `scrap` are marked as they happen through `game.guide.tutEvent`; `inv`, `scan`, `ship`, `sell` continue after Hiring Day. While Hiring Day is active the guide shows nothing of its own.
**Skip any time:** hold Backspace 2 s (hint is always in the objective list) -> straight to the ship, flag `skip`.

## Who gets it (`shouldRun`, node-tested)
Runs only for a **fresh host**: not a veteran (`stats.days / quotasMet / scrapCollected / sold > 0` or level >= 4; `runs` is deliberately not counted so quitting Hiring Day and retrying works), a **new** run (no loaded save, orbit, day 1, quota 0), `settings.skipHiringDay` off, no `profile.onboard` flag of `done` / `skip`. Everything else skips: veterans and joiners get a `skip` flag written (`why` = veteran / joined), dev auto-host (`?autohost` / `?autojoin` in the URL: **all existing harness scripts are unaffected**; force it with `&hiringday=1`).
**Co-op:** the host's onboarding does not block anybody: joiners are in the real ship (the "hangar"), get a toast, and cannot pull the lever until the host reaches the lever step (`hostLever` wrap + a `'sys'` message). If somebody lands the ship while the host is still in the wing, the host is put back in the ship and the flow jumps to the door step.

## Staged unlocks (MASTERPLAN 23.1)
| System | Opens | Guard |
|---|---|---|
| FORGE (Monetizer / Altar / Exchange panels) | quota 1 | `forge.js open()` |
| PETS (panel N, `PETS`) | quota 2 | `pets.js api.open()` + terminal wrap |
| VOYAGE (MOON RANDOM, SIGNALS, MISSIONS, warp events) | quota 2 | `voyage.js enabled()` (host + client) + terminal wrap |
| HOMEWORLD + FACTORY (`ROUTE HOME`, `HOME`, `FACTORY`, `GHOST`) | quota 3 | terminal host `route` (`routeBlocked`) + terminal wrap |
| GLITCH GATES | first sector boss (`run.cycle.firstKills` / `sector` / `cores` / `bossDead`) | `cycle3_gates.js dayRoll()` |

`profile.unlocks = { mode: 'staged'|'all', q, boss, given }`: fresh profiles are `staged`, **veterans (existing saves) are `all`** (decided once on the first install), `q` / `boss` only ever increase so a second run keeps what the first earned. When a system opens The Algorithm "gifts" it (intercom line + `NEW TOY` toast + a hint in the objective list for 4 min), one per 9 s, only in orbit / at HQ with no panel open and never during Hiring Day. Locked access shows `LOCKED: FORGE. The Algorithm gifts it after quota 1.` (toast, or terminal text). **Settings > Gameplay > "Unlock everything"** (`settings.unlockAll`) opens all; "Skip Hiring Day" (`settings.skipHiringDay`) is next to it.

## Geometry / performance
`buildWing` = one vertex-coloured mesh (baked light pools per vertex, quads subdivided <= 1.5 m) + one emissive mesh + 4 door slabs + locker door + 8 sign planes (canvas textures) + the figure = about 20 draw calls, **0 THREE lights** (constant light count, checked in the test), ~120 static boxes. Built far away (`ORIGIN` x = 1600) and **disposed at boarding** (colliders, meshes, textures). Verts / tris are printed by `game.onboard.debug().stats`.

## Knobs
`onboard_core.js`: `GOAL` (50), `WALK_DIST` (10), `SPRINT_FAILS_FREE` (3), `UNLOCKS` (the schedule), `remarkFor`. `onboard.js`: `SKIP_HOLD` (2 s), the timeline in `begin()`, shutter timing in `shutterTick` (2.2 s, 1.6 s reopen). `onboard_world.js`: `SHUTTER` (trigger z, shutter z), layout constants, `L_AMB` (ambient of the baked light).
Debug: `kefal.game.onboard.debug()`, `.skip()`, `.force('terminal'|'door'|...)`, `.note('flash')`, `.wing()` (`setLight(0)`, `showFigure(true)`, `doors.*.set(true)`), `.unlocks()`, `.locked('forge')`.

## Test
`node tools/harness/onboard.test.mjs` (flow order / out-of-order facts / forceTo / repair, remark branches, skip matrix, unlock schedule + gifts + profile memory, EN/TR/RU table with placeholder parity, then the install test: dev auto-host does nothing, guards + terminal wrap, gifts, forced Hiring Day end to end incl. the shutter misses, locker, mug, blackout, 3 lock attempts, boarding disposal, co-op lever block, landing, goal, return, remark, skip, joiner flag, interruption).
Headless: `flock /tmp/tfg-browser.lock node tools/harness/headless_shots.mjs --port P --url '/?autohost=local&code=T1&name=Tester&hiringday=1' --script tools/harness/wave5_onboard.js --shotdir /tmp/ob`.

## Known gaps / NOT verified
* Hand feel: shutter timing (2.2 s / 14 m), blackout darkness with a real flashlight, the wake blink, PA / intercom overlap at 1280x720.
* The flashlight is a loan in the story only (you keep it); nothing deducts it. The Mini-Skeld in the hangar is a visual set piece; boarding teleports into the real ship interior (no walk-through of the hull).
* In co-op the host is far away in the wing: crewmates see the host avatar at 1600 m and a floating flashlight / mug item until the wing is disposed (items are ordinary host-spawned items). Two real clients not tested.
* Unlock guards cover panels, commands and host routes; a saved run that is already at the homeworld with a staged profile is not evicted. `ROUTE HOME` reaches the homeworld only through `terminal.js`; other code that sets `run.moon = 'home'` directly (ghost raids) is not guarded.
* The 50-scrap objective is shown next to the normal "bring scrap" line of the tracker (they are almost the same number on the first moon).
