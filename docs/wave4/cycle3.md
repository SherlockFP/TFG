# Wave 4 - cycle3: Glitch Gates in full, Trophy Wall, cycle case files, Elevator Stop, three relays, Double shrines (module `cycle3`)

Status: node-tested (pure rules, the real host flow, real layouts) + `npm run build` + one short headless browser run (see "Browser run" at the end). Default ON
(`game.config.cycle3 !== false`, and `config.cycle !== false`). Design: `docs/MASTERPLAN.md` 14, 14.1 (Glitch Gates), 14.2, 19 (early comfort). It closes the "Honest gaps" list of
`docs/wave3/cycle2.md`. Installed after `cycle` (`this.useModule('cycle3', installCycle3)` in `game.js`, slot `[slot:cycle3]`, import `[import:cycle3]`); `game.cycle3` = `{ trophy, caseFiles, gates, elevator, puzzle, C3, K }`.

## What the player sees
| Feature | How it plays |
|---|---|
| **Glitch Gates** | After a moon day (quota 1+) a gate may open. Terminal `GATES` lists them: rank E-S, theme (interior), the theme boss, "breaks in N days", RED / HIDDEN tags. `GATE GO <n>` (in orbit) arms one, the lever lands on it (exactly like a keystone); `GATE CANCEL` disarms. The dungeon is the Sector Core generator scaled by rank: E = 2 wings, no cards, boss hp x0.28; D 1 card; C adds a labyrinth; B 3 wings; A / S 2 cards. Boss = the theme boss, hp x rank table, chest = rank table (rarity floor rare -> legendary, shards, gold). Clear = XP + coin + the boss trophy. Leaving early keeps the gate open. |
| **Red gate** (14 %, rank D+) | Landing seals the exit until the boss falls (`RED GATE` objective), boss hp x1.35, damage x1.2, +1 elite per wing, chest: +1 weapon, x2 shards / gold, +1 rarity step, XP x1.5. |
| **Hidden gate** (7 %, quota 2+, rank C+) | Not listed. A clue names the server type ("an unregistered signal was traced to a <Cloud Storage> server"). `PING` (terminal, orbit) answers HOT / warm / cold for the routed moon. On the right moon a glitch tear hangs deep in the facility (faint flicker within ~11 m); a **scan pulse** (middle mouse) within 26 m logs the gate ("HIDDEN GATE LOGGED"), from then on it is listed and armable. Inside: a hidden **Sanctum** room with the three-rules statue puzzle (plaque lists "1. Respect the Algorithm. 2. Worship the viewers. 3. Stay alive." in scrambled order; touch the statues in rule order; a wrong touch zaps 45 HP and resets) -> mythic chest (2 legendary weapons, shards, gold), the title **Glitch Walker**, the Hidden Gate trophy. The boss chest is doubled. |
| **Gate Break** | A gate not cleared within 2 days breaks. From quota 2 that starts a **SIEGE** (event `tfg:siege`, reason `gatebreak`, ~2 min into the next regular moon day; siege.js decides eligibility, max one per day); at quota 1 it only closes (early game comfort). |
| **Trophy Wall** | The ship's +z wall (x -5.4 .. 0.3, free of props) has 12 mounts: the 9 bosses, Raid, Keystone, Hidden Gate. Every kill / completion mounts a trophy on the spot; unearned mounts are dark silhouettes. **E at a mount** = card: first kill (date, sector, time, crew), latest kill, fastest, total kills, best raid difficulty / highest key, the boss dossier. Terminal `TROPHIES`. |
| **CASE dossiers** | One permanent case file per boss, raid, keystone, hidden gate, red gate, the Deep Feed (open at PATCH 1.0, closed at cash out / fired) and the shameful exit, in the normal archive (`CASES`, `CASE <n>`, ship board tab, numbers 90000+). First time = the paper card plays after the day report. Terminal `DOSSIER [name]` prints the two-line dossier + field note (EN / TR / RU). |
| **Elevator Stop** | 50 % of the facilities (seeded) have a freight elevator: a door near the entrance and one in a deep room. E at a door: everybody standing there rides to the other door (5.5 s; a real shortcut). 40-60 % of rides stop between floors: lights flicker, something knocks on the cab roof; 45-60 s to press the fuse panel's red / green / blue buttons in the order shown (a wrong button resets it) while someone **braces the door lever** before each knock (unbraced: -1 fuse step and 8-12 damage from quota 1). Fixed = the cab resumes and arrives, +1-3 scrap + XP (first 2 per day); timer out = the cab drops (15-22 damage, no reward). Quota 0: never any damage. |
| **Three relays** (core puzzle) | Every Sector Core (not the Legacy sector) has three signal relays in three rooms (one per wing). Each stays lit 75 s solo / 55 s crew; all three lit AT THE SAME TIME drops the ARENA SHIELD; until then the arena door refuses the access cards. The old 720 s arena auto-open still applies (never a soft lock). |
| **Double shrines** (endless mutator) | `SHRINE_NUM.chance` 0.35 -> 0.70 and the Cursed Die scrap weight x2 while the mutator is active (all peers, from `run.cycle.endless.mutators`). |

## Files
| File | Role |
|---|---|
| `src/game/cycle3_core.js` | pure rules: ranks / `rollGate` / `tickGates` / red + hidden / chest spec / `gateMoonFrom` / ping / tear spot / statue puzzle / trophy records (`recordKill`, `mergeRecord`, `saveToProfile`, `seedFromProfile`) / `ElevatorRun` + `pickElevatorRooms` / `RelayPuzzle` + `pickRelayRooms` / shrine knobs |
| `src/game/cycle3.js` | orchestrator: `run.c3`, net (`c3req` / `c3s`), part mounting, hooks, shrines |
| `src/game/cycle3_gates.js` | day roll, terminal `GATES` / `GATE` / `PING`, hidden tear (scan hook), sanctum + statues, gate result, gate break -> siege |
| `src/game/cycle3_trophy.js` | kill hook, the 3D wall, the card, persistence |
| `src/game/cycle3_case.js` | dossiers (`kind:'cycle'` case records, renderer registered in `ui/panels/casefile.js`), terminal `DOSSIER` |
| `src/game/cycle3_elevator.js` | doors, cab pocket (x = +6400), ride host logic, fuse panel / lever interactables |
| `src/game/cycle3_puzzle.js` | relays + the arena shield (wraps the `unlock` handler) |
| `src/game/cycle3_lore.js`, `cycle3_i18n.js` | dossier texts + all EN -> TR / RU strings (`cycle3_i18n` never overrides another module's translation) |
| `src/game/cycle3_fx.js` | mesh helpers (dispose, canvas text planes) |

Shared-file edits (all tiny): `cycle.js` (`ext = { gateDef, onResult[] }`, `api.ext / arm / patchCy / disarm / instRequirements`, `ctx.gate` also reads `run.cycle.inst.gate`, `armInstance('gate', { gate, info })`, result hook,
classic gates do not print "S-RANK"), `cycle_inst.js` (`perWing: opts.perWing`, `gate.chestSpec` chest, `res.time`), `cycle_console.js` (armed-gate objective), `cycle_i18n.js` (1 string),
`ui/panels/casefile.js` (`caseRenderers` / `caseTexts` registries) and `game/casefile.js` (`caseTexts`), `game.js` (slot + import).

## Net and state
- `c3req` (client -> host): `gate {n|cancel}`, `ping`, `scan`, `statue {s}`, `relay {i}`, `ecall {side}`, `ebtn {i}`, `ebrace`.
- `c3s` (host -> everyone): `banner`, `trophy`, `case`, `found`, `gateclear`, `title`, `statue`, `relay`, `eride`, `estate`, `estop`, `ewarn`, `eknock`, `eev`, `efail`, `earrive`.
- `run.c3 = { v, trophies, gates:{ seq, lastRoll, rolled, list }, siegeDue }` (saved with the run, generic run sync); `run.c3live = { sanctum, relays }` (per moon day, cleared at landing / takeoff / orbit).
  Instance state of an armed / live gate: `run.cycle.inst = { kind:'gate', spec:<gate record>, gate:<info for cycle_inst>, seed, red }`.
- Trophies: run (`run.c3.trophies`, crew-shared: every peer sees the same wall, late joiners too) + host `profile.cycle3.trophies` (survives "fired" / a new run: the run is re-seeded from the host profile every 2 s if
  `run.c3` is missing) + every crew member stores the records of the fights they were in (`K.saveToProfile`). Kill counts are cumulative across runs.

## Knobs (cycle3_core.js)
`GATE` (fromQuota 1, hiddenFromQuota 2, siegeFromQuota 2, breakDays 2, maxOpen 2, redChance .14, hiddenChance .07, baseChance .32 + .03 / quota, pingRange 26) - `RANK_CFG` (hp / damage / size / wings / labyrinth / keys / elites / rarity / shards / gold / xp per rank) -
`ELEV` (existsChance .5, stopChance .4 / .55 / .6, rideSec 5.5, timer 60 / 50 / 45 s, knockEvery 9 / 7.5 / 6.5 s, holdAdd / holdDecay / braceMin, seqLen 3 / 3 / 4, hitDmg / failDmg, callRange) - `RELAY` (75 / 55 s) -
in `cycle3_elevator.js`: `CAB`, `MAX_RIDE` 120 s, `COOLDOWN` 20 s, `MAX_REWARDS_PER_DAY` 2. Config: `config.cycle3 = false` disables everything.
Debug: `game.cycle3.elevator.forceExists = true` then `.start('a', { stops: true })`; `game.cycle3.trophy.record({ id, src, t })`; `game.cycle3.gates.dayRoll()`; a forced gate: `K.rollGate({ ..., force: { rank, red, hidden } })` + `K.addGate`.

## Tests
| Command | Covers |
|---|---|
| `node tools/harness/cycle3.test.mjs` (~40 000 checks) | rank / roll / red / hidden / break rules, 384 real gate dungeons (8 themes x 6 ranks x plain / red x 4 seeds: arena, wings, labyrinth, reachability, sealed arena, sanctum room), moon defs, statue + relay puzzles, elevator door placement over 80 layouts + the sim (fuzz: every ride ends), trophy records + persistence (run <-> profile <-> peers, JSON round trip, fired reseed), shrine knobs, EN / TR / RU strings |
| `node tools/harness/cycle3_flow.test.mjs` (158 checks) | the glue on the REAL host.js flow + cycle.js: trophies / dossiers / save / fired, gate roll -> `GATES` -> `GATE GO` -> land -> rank-scaled boss / cards / chest -> cleared, red seal, hidden (PING, scan, sanctum statues, mythic chest, title), gate break -> siege event (quota 2 vs 1), relays + shield + the 720 s fallback, elevator (call, ride, stop, wrong button, brace, fix, fail, quota 0, takeoff abort, hard cap), shrines knob, `cycle3:false` |
| `tools/harness/wave4_cycle3.js` | browser body for `headless.mjs`: trophies + dossier card, Elevator Stop, a red + hidden gate landing, ends in front of the Trophy Wall |

## Known gaps (honest)
- Not hand-played. The browser run only proves "no exceptions, things exist and move"; readability of the statues / plaque / relays / cab, the elevator door prop overlapping a room's own props, and the balance numbers are design values.
- The elevator cab is a pocket at x = +6400: creatures that hunt a rider path towards it and stall (no nav there); a rider who disconnects mid-ride stays in the cab until the ride ends (the host ends it after <= 120 s and sends everybody's teleport; a peer that is gone is ignored).
- Trophy Wall only on the ship (not on the homeworld: the Homeworld "Trophy Hall" building still counts bestiary kills, it does not show boss trophies). The shipyard Trophy Hall module (creature heads) is untouched and independent.
- Hidden-gate discovery needs `fac.scrapSpots` on every peer (used for the tear); the tear is drawn only in the anchor moon's facility, never outdoors. No Hunter Rank, no ARCHIVE (Archived Copy) yet (MASTERPLAN 14.1 rest).
- Relay puzzle only in Sector Cores (not gates / raid / keystone). Boss trophies of a raid's mid-bosses count as boss kills too (same slot).
- After a keystone / raid the ship stays routed to the dead instance id until the next lever (host autopilot fallback reroutes); gates reroute cleanly (fixed here only for gates).
- Endless mode keeps its own S-rank gate (`GATE` in the Deep Feed); classic gates are not rolled while endless.
