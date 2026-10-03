# Wave33 native creatures — implementation and evidence

Date: 2026-10-03. Baseline: `bf4f577ab2fde624b0cfd02bf5c5cd098353b5df`, `main`.
The shared Windows checkout already contained extensive unrelated/line-ending changes before this work. This owner initially changed only `src/game/creatures32.js`, `tools/harness/creatures32.test.mjs`, `tools/harness/creatures32_arena.mjs`, and this report. Root later authorized the narrowly required three-line `src/game/grenades.js` attack-wrapper correction and `docs/wave33/grenade-red.txt` evidence after real-game browser integration exposed an existing wrapper bug. Root owns staging/publication and other integration into existing files. Native source is frozen again after that regression/fix; this report is evidence for this native owner, not a substitute for final root validation.

The user's current fun baseline remains **1/10**. Native assertions do not establish readability, fun, a natural discovery experience, representative FPS, or Internet multiplayer reliability. Normal admission remains disabled unless `game.config.creatures32 === true`; opting in still cannot bypass any admission veto.

## Delivered contracts

`installCreatures32(game)` synchronously registers `c32_dormant` and `c32_ram` and returns `{ids, choice, dispose}`. `C32_IDS` and frozen `C32` export the authored constants. All FSM helpers remain private. `choice()` returns the stable floor-family choice or `null` for its rejected 25% roll; it does not itself admit an actor.

Install after the manager exists, adjacent to C20, **before** the descent indoor wrapper. The descent wrapper must call the captured C32 indoor wrapper after it chooses a C32 resident. The C32 wrapper then chooses its seeded family/position; installing C32 outside descent's wrapper would allow descent's internal native call to bypass this position selector. `game.descentThreat21` is consulted lazily, so it need not exist at installation time.

Root's presentation module owns models, IDENT/FIELD_NOTES, translations, state sound mappings and audio registration. Native definitions use `Silent Worker` / `Lane Breaker`. The native definition initially points at the existing real worker template, then presentation assigns each authored C32 model. Native FSMs do not allocate geometry/materials or create lights/audio loops.

`tools/harness/creatures32_arena.mjs` exports:

- `makeNativeArena32()` — async native fixture with `{game,physics,manager,items,fixture,step,advance,walkPlayerTo,hits,dispose}` plus explicitly named setup helpers.
- `selectArena32(game)` — the same actual geometry selection used by native and browser setup.
- `prepareBrowserArena32(game,type)` — setup only, returns a cleanup function with `.fixture` and `.creatureId`; it starts no update loop.

The arena module has no Node-specific imports, so the browser helper can be imported by Vite. The native test file's CSS-only Node loader is the existing `darkcollapse20` pattern and is used solely to import `Game.prototype.onDoor/updateDoors` for a real door test.

## Native behavior

Silent Worker observes a single eligible visible player's continuous trigger. Real `M.canSee`, `M.isLookedAt`, strict physical distances, flash/noise/voice fields, and the native hit marker are used. A quiet player outside touch range causes no damage. The complete wake is 1.5 seconds; chase is bounded to six seconds, ten metres from home and one second lost LOS; a separate 0.8-second swipe must finish before one hit. Withdrawal, lost sight, downed/dead/leave/ship/safe-zone state, normal native stun, and another active chase in the room cancel attacks. The first native weapon hit before the first AI frame is retained rather than erased by initialization.

Lane Breaker acquires visible noise or a real visibly held sellable item at 4–10 metres. World/bagged cargo does not acquire a target. It captures yaw/direction once at the beginning of the 1.4-second windup. Each warning frame rechecks the physical lane, floor and side access. Charge uses its own fixed direction, never nav following/opening doors; speed is 6.5 m/s, bounded to 8 metres and 1.25 seconds. Static/DOOR capsule sweeps and continuous floor support precede pairwise Rapier creature/player capsule casts. Native standing/crouched player radii and feet positions are used; the smallest player TOI before the obstacle wins. A 0.25-second AI frame still cannot jump through a panel/player. One charge ends on first valid hit/obstacle and rests for 2.5 seconds.

Before damage or any completion sound can reenter native callbacks, the episode is consumed and the actor enters rest. Damage goes through `M.attack(...,true)` after the authored full warning, never direct HP changes. Root's real `hostHurtPlayer` cap is tested after a 999-damage balance scale and produces 35 damage; environment damage remains unaffected. No pin/grab/drag/drop/impulse/reward mechanism was added. The module only reads native cargo custody; the held item ID/holder/inventory/body references are asserted unchanged across a genuine charge hit.

Native stun is handled by an additive manager `damage` wrapper because the existing manager intentionally skips behavior while stunned and changes `stunned` back to `idle` on expiry. The wrapper clears the old hit marker and sets a native-time rest deadline extending past stun. The wrapper leaves all non-C32 damage calls unchanged.

Crew membership comes from the existing Session records with native-player fallback. A newly admitted crew identity cancels wake/windup/chase/charge into 2.5-second rest. Leave, lost-session status and native eligibility prevent old-target damage. Actual native view migration retains ID/HP/position/yaw, but clears target/direction/attack state into rest; unknown arrival age grants a fresh 25-second admission quiet period. No private AI state is assumed present in the generic migration serializer.

## Admission and receipts

The instance manager and native indoor method both receive additive C32-only guards. Other types call their previous methods unchanged. Natural acceptance requires host ownership, explicit config opt-in, normal moon phase, matching native descent token, depth >=3, earned `run.quotaIndex >=2`, actual factory/office layout, and no company/home/Dead Letter/mission/escape mode. Native `game.time` records arrival; map/facility changes and migration reset it. No independent clock/timer or update listener runs the AI.

The stable key is `creatures32:<descentToken>:<depth>:<facilitySeed>`. Independent seeded position/actor/level forks preserve the same roll, species, yaw, seed, and natural level across requests. Position candidates are native scrap points and room centres. Actual floor/capsule clearance, native nav return reachability, two accessible room exits, >14m live-player distance, native early-safe filtering, door/lift clearance, side bypass/lane geometry and existing active room chase are checked. Unsuitable geometry produces no actor; no room reshaping, LOS bypass or teleport is used by production admission.

Existing `canSpawnMore`, `crdirector.canSpawn`, explicit `descentThreat21.allow`, native power and shared new-rule slots remain additional gates. `opts.scripted`, `opts.data`, `noSpawn` custom ownership and arbitrary `opts.id` cannot bypass the C32 wrapper. A migration restore is accepted only under an already existing same-type live view identity with no existing host actor.

The in-flight floor reservation and a new frozen `run.creatures32SeenFloors` array are set before run publication and native `hostSpawn`; real `cev sp` self-delivery sees the receipt already published. Recursive spawn is rejected. Capacity 128 vetoes before mutation and never evicts history. A returned native actor consumes the floor even if a synchronous callback subsequently removes it. A native null/throw that adds no actor rolls back only that attempt's key, publishes rollback and releases its own reservation. Save/load and native run diff ordering are tested; the generic existing save format carries this field.

## RED → GREEN record

All listed RED cases ran with the module/fixture importing successfully; no missing-import failure is counted as behavior evidence.

| Observation before fix | Result after implementation/fix |
| --- | --- |
| Registered dormant stub stayed `idle`, expected `wake`, after a real visible one-second flashlight trigger. | Full native warning, quiet bypass and controller withdrawal pass. |
| Native stun recovery returned `idle`, expected `rest`; the manager skipped the FSM while stunned. | Additive native damage cancellation preserves rest and clears marker. |
| Registered ram stub stayed `idle`, expected `windup`. | Native warning and fixed-axis controller sidestep pass. |
| Native migration emitted no owned rest reset (`idle` versus expected `rest`). | Existing-view restore plus `hostMigrated` makes attack state harmless. |
| Spawn callback removal erased the receipt (`0` versus expected `1`). | A successful returned actor consumes its floor even after synchronous removal. |
| Real LocalPlayer forward vector faced away from the creature lane. | Fixture yaw now equals creature lane yaw; actual `forward().dot(-axis) > .99` passes. |

A peer cue count initially included both host and peer because the test fixture shared one audio recorder. This was a test-boundary mistake, not a product behavior failure: separate peer audio recording now verifies exactly one peer cue across repeated rows. An admission-positive fixture initially described factory geometry with an implicit planned liminal floor, so real descent correctly rejected its zero new-rule slots. Explicit initial native `currentChoice` metadata now matches the generated factory fixture; no admission rule was relaxed.

## Verification and evidence limits

The initial 58-scenario native run did not install the entire real-game module stack. Root's subsequent real `Game` browser positive control exposed a lost argument in the existing grenade attack wrapper: it forwarded four arguments while native `CreatureManager.attack` and the balance gate use a fifth `_late` argument for an already completed warning. C32 correctly consumed its episode and entered rest, but the wrapper dropped `_late`, scheduled a second generic warning, then dropped `_late` on that timer's replay too; native `minGap` suppressed the hit. This was a real integration defect, not a missing C32 outcome assertion that should be bypassed in the fixture.

The grenade wrapper now forwards `_late` unchanged and applies its existing blackout bonus only on the original call. A generic delayed blackout hit otherwise would multiply damage again: `20 → 25 → 31`. Both behavior REDs are preserved in [grenade-red.txt](grenade-red.txt): **0 versus 1 immediate native hurt** before forwarding, then **31 versus 25 blackout damage** after forwarding but before preventing re-scaling.

Four added scenarios install actual `installGrenades` and `installBalanceRules`, retain the real manager method, and assert actual `hostMethods.hostHurtPlayer` → Session `hurt` delivery. Both C32 species complete their full authored warning, immediately produce exactly one hit, and schedule no generic warning or duplicate. An ordinary lurker attack still waits 0.4 seconds, deals once, and obeys native `minGap`; the blackout variant detonates a real grenade through its native API and receives exactly 25 from a base 20 attack. Disposal restores the original native attack method. The presentation-only DOM fixture captures and clears the real shared HUD interval, and the labelled timer fixture uses only the arena's existing `game.time` deadlines. No attack method, contact, damage result, blackout multiplier or LOS result is stubbed.

Fresh command on frozen native source:

```powershell
& 'C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/harness/creatures32.test.mjs
```

Exit **0**, bundled Node **v24.19.0**, about **11.5 seconds**, **62 named native scenarios**. This owner did not run the full suite or browser; root owns renewed combined focused/full/build validation and fresh frozen browser QA after the grenade correction.

The scenarios include positive vulnerable targets, full warnings and withdrawal; panel LOS, weapon/stun, downed/dead/ship/leave and same-room native crawler chase; first-hit TOI, real held/bagged/world ItemManager cargo, 0.25-second obstruction frames and time/distance budgets; actual Session broadcast self-delivery and peer state/yaw/repeated-row cue behavior; crew JIP, native-view restore, final scaled damage cap; stable 25% rejection, native admitted room, receipt save/diff order, recursive spawn, synchronous actor removal, native null/throw rollback; and the config/depth/quota/theme/mode/arrival/power/family/capacity/capsule/single-exit/narrow-space veto matrix.

The real door case uses an **existing generated ordinary door**, native `hostSetDoor` → Session `door` → `Game.prototype.onDoor`, and normal `Game.prototype.updateDoors` animation. Rapier builds its real DOOR collider before the wound-up swipe finishes; the swipe cancels. The earlier synthetic G.DOOR thin panel remains separately labelled as a capsule-sweep boundary test.

Fixture initial placement, metadata and actor setup are labelled fixture setup. `CreatureManager.prototype.hostSpawn.call` bypasses admission only in this test/browser setup utility, never in the application API. `walkPlayerTo` advances the real LocalPlayer capsule/controller through ordinary collision queries, then the single `step` path advances physics/time/manager. No AI outcome, LOS result, contact, damage or movement transform is injected.

Session transport adapters deliver native Session envelopes/callbacks in memory; they do not prove WebRTC/TURN/NAT reliability. Peer warning snapshots show state/yaw and duplicate cue behavior; human recognition, guidance-free discovery, hardware profiling and first-floor browser acceptance remain distinct evidence owned elsewhere. The explicit opt-in remains experimental and defaults off.
