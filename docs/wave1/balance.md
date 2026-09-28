# Wave 1 - balance (creature scaling, Threat / Greed meter, ship door)

Module `balance` (`game.balance`). Files: `src/game/balance_core.js` (pure numbers + the meter model, shared with the
sim), `src/game/balance.js` (game glue, HUD), `tools/sim/balance.mjs` (node sim), `tools/harness/wave1_balance.js`
(browser check), `src/world/doorsafe.js` + `src/world/ship.js` (door). Owner-facing summary in Turkish at the end.

## 1. Creature scaling ("weak and slow at first")

`game.balance.scale(kind)` returns `{ hp, dmg, speed, spawn, detect, pace, hunt }` for the current sector
(`run.quotaIndex`) and threat. Sector part, threat 0 (`balance_core.js SECTOR`, ramp is linear to quota 4, then slow):

| quota | hp | dmg | speed | spawn budget | detect | single-hit cap | speed cap | loot luck (T0 / T80) |
|---|---|---|---|---|---|---|---|---|
| 0 | 0.80 | 0.60 | 0.80 | 0.90 | 0.90 | 45 % HP | 8.0 m/s | 0.06 / 0.50 |
| 1 | 0.85 | 0.70 | 0.85 | 0.93 | 0.93 | 45 % HP | 8.0 m/s | 0.08 / 0.53 |
| 2 | 0.90 | 0.80 | 0.90 | 0.95 | 0.95 | 70 % HP | 9.5 m/s | 0.11 / 0.55 |
| 3 | 0.95 | 0.90 | 0.95 | 0.98 | 0.98 | - | - | 0.14 / 0.58 |
| 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | - | - | 0.16 / 0.60 |
| 6 | 1.10 | 1.10 | 1.03 | 1.00 | 1.00 | - | - | 0.21 / 0.65 |
| 8 | 1.20 | 1.20 | 1.06 | 1.00 | 1.00 | - | - | 0.26 / 0.70 |
| 12 | 1.40 | 1.40 | 1.12 | 1.00 | 1.00 | - | - | 0.36 / 0.80 |
| 14+ | 1.50 (cap) | 1.50 (cap) | 1.15 -> 1.20 (cap) | 1.00 | 1.00 | - | - | 0.36 / 0.80 |

(The `spawn` column of the live API additionally carries the threat multiplier, so the harness prints 0.77 at quota 0 /
threat 0: sector 0.90 x threat 0.85.) Speed is capped at 1.2 on purpose: above that sprinting stops being an answer.
Damage/hp/speed are further multiplied by the threat part (section 2): dmg up to x1.15, speed up to x1.12 at threat 100;
combined caps hp 1.5, dmg 1.6, speed 1.25.

**Early-game safety.** `hitCap`: one creature or trap hit never takes more than 45 % of a 100 HP bar in quota 0-1 (70 % in
quota 2), so nothing one-shots (Lurker / Pop-up / Fake Exit `dmg 999`, mines 110, mannequin 90). Player max HP is always >= 100
(`100 + vit*10 + ...`), so this is never more than 45 % of the real max HP. `speedCap`: in quota 0-2 nothing outruns a
sprinting player (8.2 m/s): crawler / Troll `run 11` become 8.0. The 90 s / 25 m entrance no-spawn window
(`hostEarlySafeFilter`) is unchanged.

**Where it is applied (generic paths, so creatures other modules register later are scaled too):**

| what | where | how |
|---|---|---|
| HP | `HostCreature` constructor (`entities/creatures.js`) | `maxHp *= scale.hp`, baked at spawn |
| damage | `Game.hostHurtPlayer` (`host.js`) | when `fromId` is a host creature: `dmg *= scale.dmg` (999 stays 999), then `capHit`. Players, lightning, "left behind" never scaled. Covers `M.attack`, bosses, mine explosions, `blast()`, mimic doors, and any module that passes its creature id |
| speed | `CreatureManager.follow` (`entities/creatures.js`) | every path-following move (`follow` / `moveToward`) x `scale.speed`, then the early speed cap |
| detection | `CreatureManager.canSee` / `hear` | range x `scale.detect` |
| hunting | `CreatureManager.wander` | with probability `scale.hunt` (0 below threat 40, 0.2 at 50, 0.4 at 75, 0.55 at 100) an idle wander heads for the nearest crewmate. Off for nest / lair / trap types (`NO_HUNT`, or `def.noHunt`) |
| budget | `Game.indoorBudget()` / `hostSpawnOutdoor` (`host.js`) | `x scale.spawn` (replaces the old flat haul-pressure +15 % / +18 % per stage: that is now the greed term of the meter) |
| pace | `hostUpdate` wave timers (`host.js`), director pressure (`director.js`) | wave interval `/ scale.pace` (0.85 at threat 0 -> 1.5 at 80); director pressure needs `PRESSURE_CALM / pace` |

Scripted lunges that write `c.pos` directly (Tamagotchi adult, Foreman / Legacy slams) do not go through `follow` and are
only scaled by damage. Bosses use `kind 'boss'` (never below 0.7 dmg / 0.9 hp / 0.85 speed), traps `kind 'hazard'` (damage only).

### Evidence (node: `node tools/sim/balance.mjs`)

Per creature, quota 0 (tier 1 moon, level rolled from the quota), OLD -> NEW: "hits" = hits to kill a 100 HP player,
"ttk" = seconds to kill it with a shovel (20 dmg, 0.8 s, 75 % hit), run in m/s (player sprint 8.2):

| creature | OLD hp / dmg / hits / ttk / run | NEW hp / dmg / hits / ttk / run |
|---|---|---|
| Spam Bot (scuttler) | 30 / 8 / 13 / 1.6 / 5.4 | 24 / 5 / 20 / 1.3 / 4.3 |
| Data Hoarder | 60 / 15 / 7 / 3.2 / 6.2 | 48 / 9 / 12 / 2.6 / 5.0 |
| Web Crawler | 160 / 40 / 3 / 8.5 / 11.0 | 128 / 24 / 5 / 6.8 / 8.0 |
| Lurker | 220 / **999 (1 hit)** / 1 / 11.7 / 9.5 | 176 / 45 / 3 / 9.4 / 7.6 |
| NPC (mannequin) | - / 90 / 2 / - / 13.0 | - / 45 / 3 / - / 8.0 |
| Web Spider | 140 / 30 / 4 / 7.5 / 7.2 | 112 / 18 / 6 / 6.0 / 5.8 |
| Troll (hound) | 180 / 45 / 3 / 9.6 / 11.0 | 144 / 27 / 4 / 7.7 / 8.0 |
| Customer Support | 150 / 50 / 2 / 8.0 / 5.6 | 120 / 30 / 4 / 6.4 / 4.5 |

Day-1 Monte Carlo (solo, 100 HP, shovel, explores the whole day; every spawned creature meets the player with p = 0.55 and is
fought 1 v 1; no healing = worst case; assumptions in `tools/sim/balance.mjs`). "camper" never leaves the facility and carries
up to 160 value all day (threat ends ~70), "cycler" goes back to the ship every 150 s to deposit:

| moon | quota | mode | creatures | met | HP lost | P(die) | P(single hit >= 45) |
|---|---|---|---|---|---|---|---|
| 56K-Dialup | 0 | OLD | 8.3 | 4.5 | 50.7 | 10.5 % | 3.3 % |
| 56K-Dialup | 0 | NEW camper | 11.8 | 6.5 | 36.9 | 1.1 % | 0.8 % |
| 56K-Dialup | 0 | NEW cycler | 8.8 | 4.8 | 27.5 | 0.6 % | 0.6 % |
| 56K-Dialup | 1 | OLD / NEW camper | 9.9 / 11.6 | 5.5 / 6.4 | 57.9 / 46.2 | 14.7 % / 3.8 % | 4.5 % / 1.1 % |
| 56K-Dialup | 2 | OLD / NEW camper / cycler | 9.7 / 12.3 / 8.9 | | 67.8 / 64.6 / 49.2 | 27.4 % / 18.5 % / 7.2 % | |
| 56K-Dialup | 4 | OLD / NEW camper / cycler | 9.7 / 12.5 / 9.6 | | 66.1 / 78.1 / 66.2 | 25.9 % / 42.8 % / 25.9 % | |
| 12-Forum | 0 | OLD / NEW camper | 7.9 / 11.1 | 4.4 / 6.1 | 60.2 / 45.2 | 25.1 % / 6.8 % | 9.6 % / 4.0 % |
| 33-Guestbook (tier 2) | 0 | OLD / NEW camper | 5.9 / 8.3 | 3.2 / 4.5 | 68.1 / 55.1 | 47.6 % / 20.2 % | 31.2 % / 11.1 % |

Reading: on day 1 a solo shovel player now meets ~5-6 creatures, loses ~30-37 % of a health bar on average and dies ~1 % of the
time (was ~10 %: half a bar lost, one death in ten). Tension stays because there are MORE creatures (the count rises with
threat) but each is survivable. From quota 4 the numbers converge on the old ones for a crew that goes back to the ship
("cycler": 25.9 % vs 25.9 %); a crew that camps in the facility is punished (42.8 % vs 25.9 %) - that is the "the longer you stay the
harder it gets" rule, and the way out is to walk to the ship. Traps are not in the sim: a mine (110) is now capped at 45 in
quota 0-1 (70 in quota 2).

Economy check (`node tools/sim/economy.mjs`, now includes `scaleFor(q, 40)`; `--no-balance` = old flat numbers): quotas met per run,
median / p90 - 4 competent 10 / 12 (old) vs 10 / 10; 4 great 12 / 15 vs 12 / 13; 2 average 4 / 7 vs 5 / 6. The mid game is
unchanged, only the first quotas are gentler.

## 2. Threat / Greed meter

`run.threat` (0-100, host writes twice a second, generic run sync carries it) drives `game.balance.threat()`. Host model
(`ThreatModel` in `balance_core.js`), stepped 4x a second in the `update` mod event, only in the `moon` phase, reset to 0 on
every `landing` / `takeoff` / `orbit` / `company`. `threat = max(base + spike, floor)`:

* **base** (slow, saturating at 72 so time + greed alone reach HUNTED but never FUCKED): grows while any living crewmate is
  inside the facility at `time + greed + noise` per second times `(1 - base/84)`.
  * time: 0.06 /s at the door rising to 0.16 /s after 10 min inside, x(1 + 0.12 per extra crewmate inside, max 1.4)
  * greed: `0.07 x min(2, (carried + 0.35 x secured) / max(60, 0.6 x quota))` per second. carried = sellable value held by players inside;
    secured = value already in the ship today. Also: every haul-pressure stage (35 / 70 / 100 % of the quota secured) adds a spike (+6 / +9 / +12).
  * noise: sprinting inside 0.12 /s per sprinter, loud voice 0.10 /s
  * x1.5 while power is in overload, x3 while an extraction is running
* **spike** (fast, decays with tau 40 s, cap 38): every `creatures.noise(pos, loud)` event with `loud >= 0.45` adds `1.4 x loud` (max 6): a shotgun
  blast +4.2, an explosion +5.6, a laser-grid alarm +4.9, a dropped heavy item +0.7. Facility events add a spike on the rising edge:
  alarm +12, lockdown +18, overload +10, extraction +25.
* **floor**: alarm 45, lockdown 62, extraction 80 while they last.
* **relief**: everybody aboard the ship -0.55 /s (25 -> CALM in ~20 s), nobody inside but somebody outside -0.10 /s, a death -15 base and half the spike,
  a director relief -4, extraction done -20.

| level | threat | colour | on the way up |
|---|---|---|---|
| CALM | 0-24 | green | - |
| UNEASY | 25-49 | yellow | toast + drum sting |
| HUNTED | 50-74 | orange | toast + violin sting, HUD pulse; the host answers with an extra spawn wave 1.4 s later (budget permitting) |
| FUCKED | 75-100 | red | toast + alarm, camera shake, HUD shakes; extra wave + outdoor wave |

The level drops only 3 points below its threshold (hysteresis), announcements are throttled to one per 2.5 s.

Effects (`threatScale`): spawn budget x0.85 / 1.0 / 1.2 / 1.45 / 1.7 at threat 0 / 25 / 50 / 75 / 100 and the same factor speeds up the wave timers,
detection x0.9 / 1.0 / 1.15 / 1.3 / 1.4, speed up to x1.12, damage up to x1.15 (from 50), wander-towards-crew chance 0 -> 0.55, loot luck
`0.06 + 0.025 x min(12, quota) + 0.55 x threat/100` (0.95 max).

Simulated stays (node `sim` section c; the browser run below drives the real host loop):

| scenario | 60 s | 120 s | 180 s | 240 s | 300 s | 10 min |
|---|---|---|---|---|---|---|
| quiet solo, no loot | 4 | 8 | 13 | 17 | 22 | 46 |
| solo, 3 pickups of 45 (quota 130) | 4 | 10 | 18 | 28 | 36 (UNEASY at 221 s) | 65 |
| solo sprinting 30 % + shouting | 6 | 12 | 18 | 24 | 30 | 55 |
| crew of 3, 2 pickups, alarm at 200 s | 5 | 11 | 20 | 45 | 45 | 64 |
| greedy + noisy solo (carrying 200) | 15 | 27 | 38 | 46 | 54 (HUNTED at 268 s) | 72 |

Real host frames (headless `wave1_balance.js`, godMode solo on 56K-Dialup, quota 0, walking only, nobody carrying anything): threat at 0 / 30 / 60 / 90 / 120 / 150 / 180 / 210 / 240 / 270 / 300 s
= 0 / 4.0 / 7.0 / 10.7 / 12.3 / 14.8 / 16.6 / 19.2 / 21.3 / 24.2 / 26.3 (UNEASY at ~290 s; the node model says 22 - the difference is
the noise spikes of the real creatures / doors), 16 creatures alive after 5 minutes (the spawn budget multiplier had grown 0.79 -> 0.91 on the way). Shotgun + explosion noise
(loud 3 and 4) took the meter from 26.3 to 36.5 within a second.

Relief: 300 s in with 90 value carried (threat 38) -> back in the ship: below 25 (CALM) after 22 s, 0 after 5 min.

Director integration: the director keeps its own per-player tension, calm timers, relief and blackout rules untouched. It reads the
threat only for pacing (`pressure` needs `PRESSURE_CALM / pace` calm seconds and repeats every `PRESSURE_GAP / pace`) and its `relief`
event (`mods 'director'`) eases the meter by 4. The relief also still delays the next wave (`hd.spawnT`) exactly as before.
The old `pressureStage` flat multipliers were removed from the budgets (they are now the greed term + a spike) to avoid double counting.

HUD: `hudDock('right', 'threat', 10)`, only in the `moon` phase: label, level name in the level colour, segmented bar with ticks at 25 / 50 / 75,
value + trend arrow, pulse on every crossing, throb from HUNTED, shake at FUCKED.

## 3. Ship door

Root causes, all in `src/world/ship.js` `door.update` (plus one in `host.js`):

1. **The collider was re-created on top of whoever stood in the doorway.** `update()` added the static box every time `t < 0.6`, without asking whether a
   character capsule was inside it. Rapier's kinematic character controller never depenetrates a capsule from a static box that appears
   inside it. Headless repro (`wave1_balance.js`, OLD logic re-created in the script): a player standing on the sill when the door closed ended up with
   the collider centred on the capsule (`colliderOnPlayer: true`, position unchanged, leaf fully closed around them). What the controller does
   next is erratic: in the first run the player could not move towards the ship at all (0.0 m in 30 frames, only out of the door), in the second
   they shuffled out freely (-0.97 m) but could only leave outwards after 0.5 m - i.e. a wedged, jittery player in a closed door, not a clean
   trap. Anyone could trigger it: closing the door with `E`, a crewmate pressing the panel, the close at takeoff.
2. **Invisible wall while the leaf was still open.** The same 0.6 threshold both ways: on the way down the door became solid while
   the leaf was still 60 % open (a 1.4 m visible gap you could not walk through); no hysteresis, so a door hovering around 0.6 flickered.
3. **Sealed out / left behind on the sill.** `hostFinishTakeoff` decides who is aboard with `insideShip` (`z < 3.5`); the sill (z 3.5-3.8) counts as outside, so a player in
   the doorway when the ship lifted off was killed as "left behind" while touching the door.
4. **Duplicate / stale requests.** `shipdoor` always broadcast, even when the door was already in that state (double press or stale label = the hydraulics played
   twice for everybody), and the interact label ignored the phase: "Open ship door" was shown in orbit / landing / takeoff where the host
   only answers "The door is sealed during flight."
5. **Same bug on every facility door** (`Game.updateDoors`): a crewmate closing a door on you re-created its collider inside your capsule.

Fix:

* `door.update`: hysteresis (collider on at `t < 0.3`, off at `t > 0.45`, like facility doors) and a **safety sensor**
  (`world/doorsafe.js boxOccupied`, a Rapier shape query for player + remote-avatar capsules): while somebody is in the doorway the leaf stops at
  `t = 0.5` (`door.blocked`) and the collider is never created; the door closes the moment the doorway is clear. Stable hold (no creeping / snapping back).
  Defensive `pushOut()` (every 0.3 s while closed): a local capsule that is somehow inside the closed door (teleport, join mid-close) is moved to the nearer side.
  Collider checks are local by design: every peer owns its copy of the collider and only its own capsule collides with it.
* `inDoorway(pos)` (z 3.45-4.5 in front of the door, x within the opening): counts as aboard at takeoff (`hostFinishTakeoff`).
* `H('shipdoor')` (host): request is a state, not a toggle; if the door is already in that state nothing is broadcast, so the last request wins and
  duplicates are silent. `door.label(phase)` gives "Ship door (sealed in flight)" / "Ship door (something is in the way)" / Open / Close.
* `Game.updateDoors` (facility doors): same hold at `t = 0.45` while a capsule is in the way (`doorwayBusy`).
* Late join: `welcome.shipDoor` already carried the door state and `setOpen(v, snap)` can snap; nothing else was wrong (the joiner spawns inside the ship
  and the leaf animates for 0.6 s). Creatures cannot pass the ship door: outdoor creatures are pushed out of a 9 m circle around the ship (`placeAt`),
  so the door state only matters to players.

Verified headless (`wave1_balance.js`, real game frames): player on the sill + door closed -> `t = 0.5`, no collider, `blocked: true`, label
"Ship door (something is in the way)", the player walks into the ship freely (-0.94 m, free-walk reference -0.97); after they step away the door
finishes closing (`t = 0`, collider present). A capsule teleported into the closed door is pushed to the nearer side (z 3.62 -> 3.1). Requests
`open, open, close, open, close` in one tick -> 3 broadcasts, final state closed. Real crawler at quota 0: maxHp 128 (base 160), run speed 8.0
(base 11), 24 damage for a base-40 hit, 45 for the Lurker's 999, 999 for a "left behind" (not a creature).

## 4. Open creature-AI minors (docs/BUGS.md, marked FIXED)

Lurker anger (already correct in code, verified), aggro on chasers (`takeAggro`, verified), A* throttling (`goTo` back-off, `goToLazy` also for the
Moderator, verified), initial loop sounds (`startLoops` starts the current state's loops - new).

## 5. API

```js
game.balance.threat()          // 0..100 (0 outside a landing); host exact, clients = synced run.threat
game.balance.level()           // { index 0..3, id: 'calm'|'uneasy'|'hunted'|'fucked', name }
game.balance.lootLuck()        // 0..1 for tier rolls (populate time = sector only, chests / drops opened later include the threat)
game.balance.scale(kind)       // 'creature' (default) | 'boss' | 'hazard' -> frozen { hp, dmg, speed, spawn, detect, pace, hunt }
game.balance.noise(pos, amount)// host: creatures hear it AND the meter rises; clients forward a 'noise' request. amount in creatures.noise units:
                               //   0.3 footstep, 0.6 tool, 1 loud item, 3 shotgun / alarm, 4 explosion
game.balance.speedCap()        // early-sector absolute creature speed cap in m/s (0 = none)
game.balance.hitDamage(dmg, c) // what hostHurtPlayer does to a creature hit
game.balance.onDeath() / onRelief(v) / onPressure(stage) / reset()   // hooks other systems may call (host)
game.balance.set(v)            // debug (host)
game.run.threat                // number, synced
game.mods.on('tfg:facility', st)    // st.security 'alarm' | 'lockdown', st.power 'overload' (also under st.state / st.fac)
game.mods.on('tfg:extraction', d)   // d.phase: anything not in idle/none/done/success/failed/... counts as running; done/success = relief
```

`registerCreature` is unchanged; a creature only needs to spawn through `CreatureManager.hostSpawn`, move through `M.follow` / `M.moveToward`, and
hurt through `M.attack` or `game.hostHurtPlayer(id, dmg, cause, creatureId, pos)` to be scaled. `def.noHunt = true` keeps a type out of the wander-towards-crew rule.

## Hooks in shared files (outside the owned list)

`src/game/game.js` (module import + `useModule` slot, `doorwayBusy` import + 3 lines in `updateDoors`), `src/game/actions.js` (1 line: ship door label),
`tools/sim/economy.mjs` (uses `scaleFor`; `--no-balance` restores the old numbers), `docs/BUGS.md` (4 items marked FIXED).

## Owner note (Turkish)

Yaratıklar artık başta zayıf ve yavaş: 1. kotada hasar x0.6, hız x0.8, can x0.8; 4. kotada normale dönüyor, sonrasında yavaşça 1.5'e kadar
çıkıyor. 1-2. kotada tek vuruşta ölüm yok (tek vuruş en fazla canın %45'i), hiçbir yaratık koşan oyuncuyu geçemiyor. Tesiste ne kadar
kalırsan, ne kadar hurda taşırsan, ne kadar gürültü yaparsan "Tehdit" sayacı (SAKİN / GERGİN / AVLANIYORSUN / BATTIN) o kadar yükseliyor:
daha çok yaratık, daha geniş algı, ama daha iyi loot. Gemiye dönünce sayaç hızla düşüyor. Gemi kapısı bugu: kapı, eşikte duran
oyuncunun içine collider koyuyordu (oyuncu sıkışıyordu); artık eşikte biri varsa kapı yarıda bekliyor, kimse yokken kapanıyor.
