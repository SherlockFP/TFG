# Wave 1 — facilitysys: Living Facility, objective chain, extraction, locked-door fix

Module `facilitysys` (`game.facilitysys`). MASTERPLAN §3.1 / §3.5 / §5.5.

## Files
| File | Role |
|---|---|
| `src/world/facility.js` (owned) | layout: containment chamber (`core` room), treasure rooms, **locked-door rule**, fire-exit fallback + exit mapping, core room style, `chestSpots`, calls the facility-systems builder |
| `src/world/interiors/facsys.js` (new) | pure planners (`facilityReach`, `exitField`, `planFacilitySystems`, `planChestSpots`) + mesh builder (`buildFacilitySystems`) with `refresh(fac)` / `animate(dt, fac, game)` / `dispose()` |
| `src/game/facilitysys.js` (new) | runtime: host state machine, net, interactables, objectives, set pieces, extraction, terminal `FACILITY`, `fac_core` item |
| `src/ui/facilityhud.js` (new) | FACILITY STATUS widget (`hudDock('right','facility',20)`), note reader + keypad panels (registered as minigames `fac_note`, `fac_keypad`) |
| `src/world/interiors/common.js`, `src/world/setpieces.js` (owned) | `'core'` added to the special / skipped room sets |
| `src/game/game.js` | the two placeholder lines only |
| `tools/harness/wave1_facility_paths.mjs` | node path test (100 seeds x 8 themes x 6 sizes) |
| `tools/harness/wave1_facilitysys.js` | headless chain driver (body for `headless.mjs`) |

## 1. Locked doors never block the only way (owner bug)
`generateLayout` now, after doors and fire exits are placed:
* BFS from the main entrance + every fire exit that has an outdoor twin, **locked doors / vaults / the containment door = walls**.
* Every floor cell outside the intentionally sealed rooms (vaults, containment chamber, treasure rooms) must be reached; locked doors on the frontier of the reached region are unlocked (lowest edge key first, deterministic) until that holds. `L.unlockedByRule` counts them (~1 per facility — the old bug was real).
* **Treasure rooms**: 1 (2 when size ≥ 1.6) dead-end rooms (exactly one way in, depth ≥ 5, ≤ 16 cells) get a locked door on purpose. The host spawns one extra `key` per treasure room in a reachable room; the lockpicker works too; the OVERLOAD gamble can pop one open.
* Every facility has ≥ 2 entrances: main + fire exit (a corridor fallback if no far room had an outside wall). A 3rd indoor fire exit (size ≥ 2) used to point at a non-existent outdoor exit and did nothing — it now leads out through outdoor fire exit #1 (`door.exitIndex = 1 + k % L.outdoorFires`).
* Test: `node tools/harness/wave1_facility_paths.mjs [seeds]` → `PASS: 4800 layouts` (also checks: whole facility connected with all doors open, every sealed room's door is reachable, generator + puzzle rooms reachable, core room has a containment door). ~14 s.

## 2. Facility state (host-authoritative, `game.run.fac`)
```
{ seed, power: off|low|normal|overload, security: passive|active|alarm|lockdown, containment: normal|breach|failure,
  vent: clean|gas|fire|toxic, stage, extraction, chain: voltage|order|codes, need, core, fuel, gen, wing, volt[3], ord[],
  codes, coreId, ext:{left,total}|null, ev: blackout|unknown|null, evLeft, alarm, lock, gas, purge, tOff, ovCd, result }
```
Discrete changes are pushed with `broadcastRun(['fac'])`; timers ride the generic 1 Hz run sync. Late joiners get it in `welcome.run`; the containment door state rides the normal door list. Everything is scoped by `fac.seed === run.seed`; the host clears it at orbit / landing / company.

Interactions between systems:
* **Power** mirrors `run.powerOn` (director blackouts, apparatus, daily blackout event, fuse boxes keep working): `off` if the power is cut, else `normal` once the generator runs, else `low`. `low` = lights at 45 %, containment wing dead. `overload` is a 2.2 s transient (lights strobe).
* **Blackout** (`off`): powered consoles/panels are dead, laser grids go dark, red emergency lights come on (group `fac_em`, not dimmed by `globalDim`), `tfg:darkness {on:true}` for dark-loving creatures.
* **Security**: `lockdown` (timer) > `alarm` (timer or extraction) > `active` (generator on, power on, console not hacked) > `passive`. **Turrets only run while security is not passive and main power is on** (restoring power wakes them: that is the trade-off). Alarm = loud host noise every 6 s (on the core carrier during extraction), lasers flash, klaxon, red lights. Lockdown closes every open coded blast door and reopens the same ones after.
* **Containment**: `breach` when the core leaves its pedestal (spawn wave + `hostData.powerBoost += 2`), `failure` when extraction fails (toxic vent 45 s, `powerBoost += 3`, full spawn wave, core value halved).
* **Ventilation**: `gas` (seeded vent failure per theme 20-60 % of days, 170-420 s in; 75 s or until purged), `fire` (30 % of overload blackouts, generator room, 25 s), `toxic` (containment failure). 3 HP/s gas, 5 HP/s toxic, 8 HP/s fire near the generator; **clean-air rooms** (entrance + one more, green scrubber light) and a `gasProof` suit protect. Vent control purges in 8 s (14 s toxic). Indoor fog tints green / red.

## 3. Objective chain (seeded per facility, varies per theme)
`find` generator room → `fuel` (insert the theme's component) → `start` (router-rewiring = fuse minigame) → `route` (puzzle) → `core` (containment door opens) → `extract` → `done` | `failed`.

| Theme | Component | Puzzle roll | Core name |
|---|---|---|---|
| factory | Fuse | voltage / order | DATA CORE |
| mansion | Fuse | codes (2x) / order | HEART.EXE |
| mineshaft | Fuel Canister | order / voltage | DEEP CORE |
| office | Fuse | codes / order | ROOT SERVER |
| backrooms | Battery Cell | voltage / codes | NOCLIP CORE |
| serverfarm | Coolant | voltage / order | COLD CORE |
| sewer | Fuel Canister | order / codes | SLUDGE CORE |
| hospital | Battery Cell | codes / voltage | PATIENT ZERO |

* Components: the host spawns 2 (3 when size > 1.6) of the needed component in reachable rooms away from the generator. Insert = the held/hotbar item (host checks holder + type), or `game.inventory.countItem/consume` (backpack, trusted).
* **Voltage**: three BUS panels A/B/C in three spread rooms (dial 1-9, lamp green when right); the targets are on a MAINTENANCE LOG note in another room.
* **Fuse order**: four breakers on the containment panel; wrong lever = 12 dmg shock + noise + reset. Sequence on a BREAKER SEQUENCE note.
* **Code fragments**: three notes in three rooms (`4 _ _`, `_ 7 _`, `_ _ 2`), keypad on the containment panel; 3 wrong codes = 30 s alarm.
* **OVERLOAD gamble** (generator, power on, 45 s cooldown): 60 % surge routed (skips the puzzle, or opens a treasure room, or opens blast doors), 25 % 60 s blackout (+30 % generator fire, 15 dmg within 3 m), 10 % alarm, 5 % FACILITY STATUS: UNKNOWN.
* **CORE** (`fac_core`, big physics valuable, 260-380 x moon/quota multipliers, fragile 0.35, grab beam) sits on a pedestal in the containment chamber (3x3 or 2x2 attached room, 5.2 m tall, cyan field + rings). If no chamber fits, an open pedestal in the deepest room gets the core when the wing is powered.
* **Extraction** (core moved > 1.4 m / grabbed / held): timer 150 s + 25 s x size, security alarm, red emergency lights, klaxon, exit signs pulse, every open door slams shut, lockdown pulses every 40-55 s for 15-22 s, spawn wave, route marker (HUD arrow + metres along the exit field: cell BFS to the nearest exit). Success = core inside the ship: **+▮(60 + 25 x quotaIndex)** credits, **220 + 40 q XP / 25 + 6 q Clout** to every player, plus its sell value. Timeout / lost core = containment failure.

## 4. Set pieces (host, rare, never during extraction)
From 150 s moon time, rolls every 180-300 s (max 2 per day, seeded host RNG): blackout 60 s (22 %), lockdown 30-60 s (18 %), **FACILITY STATUS: UNKNOWN** (7 %: every door opens incl. ordinary locked ones, ambience goes silent, lights steady, indoor creatures vanish for 20 s and come back where they were; mimics / leeches / Pop-ups are stunned instead).
Counterplay: security console hack (Simon keypad) silences an alarm / ends a lockdown / disables turrets 60 s (fail = 45 s alarm); terminal `FACILITY OVERRIDE` ends a lockdown for ▮25; generator restart after a stall.

## 5. Net
* client → host `facAct {a}`: `insert {item|inv}`, `start`, `restart`, `overload`, `volt {i}`, `flip {i}`, `code {code}`, `read {i}`, `sec {op}`, `secfail`, `purge`, `override`. Host validates distance (6 m), stage, power, chain.
* host → all `facFx {k}`: `snd {s,p,v}`, `spark {p}`, `toast {text,kind}` (accepted only from `net.hostId`).
* Doors: the containment door is `kind:'vault'` + `contain:true` for the host rules (no manual toggle, no key, creatures ignore it, nav-blocked while shut) but its collider is a plain static prop box (the look-at ray never shows vault prompts) animated by `sys.animate`.

## 6. Events (game.mods)
`tfg:facility (fac, game)` on every change of power/security/containment/vent/stage/extraction (every peer) · `tfg:extraction {phase:'start'|'end', success, total}` · `tfg:objective {id, text, done}` · `tfg:darkness {on}` · `tfg:breach {level:'breach'|'failure', pos}` · `tfg:alarm {on}` · `tfg:facEvent {kind:'blackout'|'unknown'|'overload', result}`.
Exports for other modules: `facility.chestSpots = [{x,y,z,room,tier,kind:'deadend'|'treasure'|'vault',sealed}]`, `facility.sys` (panel positions, safeRooms, exitField...), `game.facilitysys.{state, sys, act(a,d), force(kind)}`.

## 7. Visuals / performance
Consoles are merged GeoBuilder boxes (one mesh per material); separate meshes only for levers, needles, knobs, lamps, CRT screens (CanvasTexture, redrawn on state change), the vent fan, core rings/field and the door leaves. Emergency beacons: one merged mesh + ~30-80 virtual emitters in the constant light pool (enabled only when needed; light count never changes, `visible` never toggled).

## 8. Testing
* `node tools/harness/wave1_facility_paths.mjs` → PASS 4800 layouts.
* `flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5182 --script tools/harness/wave1_facilitysys.js --shot /tmp/facilitysys.png` → transitions `find|low|passive → fuel → start → route|normal|active → core → extract|alarm|breach → done|active`, credits +60, UNKNOWN (16 → 5 → 18 creatures), overload, gas, lockdown; `errs: []` (orders + voltage chains both driven).
* `tools/harness/smoke_land.js` → `errs: []` (factory, mineshaft, mansion).

## 9. Known issues / next
* The shared right HUD dock (top 150 px) overlaps the tail of the existing Employee Assignments panel at the top right — dock owner should move one of them.
* Not tested with 2 real peers (client paths are the same requests/broadcasts; `facFx` is host-only).
* Turrets start offline until the generator runs (deliberate early-game relief) — balance agent may want to tune.
* The core counts as normal scrap for the day summary / assignments on top of the extraction bonus.
* Boss lair selection (bosses.js, not owned) could in rare tiny maps pick the containment chamber (largest room); the boss would wait behind the door.
* Note bodies: lore lines and titles are translated; the digit/level lines are language-neutral.
