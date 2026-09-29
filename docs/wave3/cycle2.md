# Wave 3 - cycle2: Sector Core + 3 new bosses + Keystone + Raid + Endless glue (module `cycle`)

Status: **built, node-tested, NOT run in a browser** (wave-3 rule: no browser runs). Default ON (`game.config.cycle !== false`).
The pure rules from wave 2 (`cycle_core.js`, `docs/wave2/cycle.md`) are unchanged except one new event (`endlessExit`); everything below is glue,
content and generator options. Nothing here changes light counts; world generation stays deterministic (facility layouts use the seeded `RNG`).

## What the player sees
```
quota met on the last day (HQ)  ->  "SECTOR GATE OPEN": autopilot locked on the Sector Core (ROUTE elsewhere is refused, the lever overrides it)
   land (no time pressure: the day clock stops at 16:30, Threat budget +0.5 / min)  ->  3 wings + a labyrinth + a locked boss arena
   wings: elites  |  key holders (mini-bosses) drop ARENA ACCESS CARDS (1 card at sector 0, 2 from sector 1)  |  arena door opens with the cards
   boss dies -> BOSS CHEST (Legendary+ weapon, shards, trophy, gold)  -> pull the lever
   WIN            -> sector + 1, first-kill bonus, "SECTOR CLEARED", crew XP / Clout; the core day does not cost a quota day
   LOSS (lever, wipe, recall after 1800 s) -> GRACE DAY (one free day, no quota, then the gate re-opens)
   2nd LOSS       -> SHAMEFUL EXIT: sector advances, no chest, faction rep -12
   boss dead then everybody dies = win.   3 cores cleared -> "PATCH 1.0" offer -> ENDLESS
```
Terminal: `CORE` (briefing: boss, HP for your crew, recommended level, mechanic, structure, rules), `CYCLE` (status), `KEYSTONE`, `RAID`, `GATE`,
`ENDLESS [ACCEPT|DECLINE]`, `CASHOUT`. They appear in `HELP` (mod commands) and as objective lines (`SECTOR GATE OPEN`, `GRACE DAY`, keystone
timer / forces, raid mini-bosses, endless depth + meter). `KEYSTONE` / `RAID` lines show in orbit from sector 2 (`config.keystoneFrom`, default 1).

## Files
| File | Role |
|---|---|
| `src/game/cycle_core.js` | pure state machine + endless rules (wave 2). New: `endlessExit` event (cash out -> classic, cores counter restarts) |
| `src/game/cycle_plan.js` | pure: `coreMoonDef`, `planContent`, keystone rules (affixes, timer, forces, result), `weekKey`, weekly best, raid rules (crew scaling, bosses, moon, weekly lock) |
| `src/game/cycle.js` | glue: state, instance wrappers of host.js / game.js, moon registration, unlock handler, terminal / net wiring |
| `src/game/cycle_inst.js` | instance runtime (core / gate / keystone / raid): populate, key holders, cards, arena lock, chest, keystone timer + spawner + forces, recall |
| `src/game/cycle_endless.js` | endless glue: meter mirror, sales, day end, PATCH NOTES, S-rank gates, mutator knobs, cash out, fired |
| `src/game/cycle_bosses.js` + `cycle_bossfx.js` | 3 new bosses + generic elite-boss kits + key holder, engine, damage hook, models, name card / HP bar / rings |
| `src/game/cycle_console.js` | terminal commands, `cyreq` host handler, client `cyx` messages, objectives |
| `src/game/cycle_i18n.js` | EN -> TR / RU (checked by `cycle2_i18n.test.mjs`) |
| `src/world/facility.js` | `generateLayout(seed, theme, size, opts)` - see "Generator options" |

Shared-file edits (all tiny): `game.js` (`generateLayout(..., moon.layoutOpts)`), `actions.js` (arena door prompt), `terminal.js` (route guard),
`moongen.js` (deep server `layoutOpts`), `rooms2.js` / `setpieces.js` / `hazards.js` / `facsys.js` (skip arena + maze rooms).

Net types: `cyx` (host -> everyone: banner, card, ring, dark, shake, p2, win, bossdown, chest, ksdone, raiddone, cashout) and `cyreq` (client -> host:
keystone, raid, gate, endless, cashout). State in `run.cycle` (saved, generic run sync): `{mode, stage, sector, fails, cores, bossDead, attempts,
declined, firstKills, endless, ks:{level}, inst:{kind,id,state,...}, live:{...mirror for HUD}, keysUsed, offer}`.

## Generator options (facility.js, deterministic, default = old behaviour bit for bit)
`generateLayout(seed, theme, size, { plan:'wings', wings:2|3, labyrinth:n, arena:true, roomMul, keys })`
- **wings**: theme plans of type `rooms` switch to the wing (spine + comb) plan; wing zones are multi-source BFS clusters from far-apart seeds (any theme).
- **labyrinth**: n big rooms (6-7 x 5-6 cells) are turned into a perfect maze (random spanning tree + ~12 % loops) after the corridors exist, so every
  corridor that crossed the room stays connected; no props inside; loot spots are kept inside cells (checked: never in a wall).
- **arena**: a big dead-end room at the deepest free spot, one locked door (`info.arena`, needs `keys` access cards), tall ceiling, excluded from
  vents / catwalks / flooding / chests / story rooms / treasure logic. The locked-door rule treats it like a vault (sealed until opened).
- output: `layout.wings`, `keyRooms` (maze-holding wing first), `areas` + `areaOf` (zones: lobby, wing A-C, labyrinth, arena), `arena`, `mazes`.
  The client toasts `ENTERING: WING B / LABYRINTH / BOSS ARENA` when the player crosses zones.
- Used by: Sector Cores (2-3 wings, 1 maze, arena), Raid (3 wings, 2 mazes, arena), Keystone (2 wings, maze, open arena), and from sector 2 the
  **deepest generated server of every sector** (wings + maze, no arena), so normal play gets the new structure too.

## Bosses (creature ids; hp x (1 + 0.35 x sector) x crew 1 / 1.6 / 2.1 / 2.5; second phase from sector 3 or in raids)
All run one engine (aggro, target, telegraphed abilities via `cyx ring`, stun immune, evade + heal when the crew leaves, `extra` flags for the HP bar).
Damage taken is scaled per instance (`c.data.takeMul`) through a wrapper around `creatures.damage` - that is the mechanic of the first three.
| Boss (theme) | Mechanic |
|---|---|
| **The Load Balancer** (serverfarm) | stationary rack colossus; its attack is routed to the WEAKEST player (marker where he stood: dodge it, friends soak the splash); 3-4 **server nodes** in the arena: armour 80 % -> 0 as nodes die (x0.2 .. x1.0); throttle (room slow), reroute (spawns bots per live node) |
| **Middle Manager** (office) | orbiting **paper shields** (x0.35 damage; respawn every 11 s); **MANDATORY MEETING** every 24 s: a marked circle, 7 s later everyone outside is hit + slowed, he is distracted (x1.5) while presenting; memo (single target) |
| **Comment Section Hydra** (sewer) | root immobile and x0.12 damage while any of the 3 (4 from sector 3) **heads** lives; a killed head spawns **2 replies** and regrows after 14 s; with no head the **root is exposed** (x1.0); spit + thrash |
| Head Surgeon (hospital) | pulls the weakest player onto the table 3.4 s (freed early by 10 % of his HP in damage), slam, bots |
| The Host (mansion) | blinks behind you (purple marker), slam |
| The Excavator (mineshaft) | quake: the middle next to him is safe, the ring is not; slam |
| The Lobby Manager (backrooms) | lights out overlay 4 s + speed x1.6, charges, slam |
| Key Holder (mini-boss) | charge in straight lines, calls bots; drops the ARENA ACCESS CARD |
| The Foreman (factory), Legacy Bot (every 5th sector) | existing (`bosses.js`); the Foreman is spawned into the arena with the cycle HP; the Legacy Bot outdoors, awake, no cards |

## KEYSTONE (MASTERPLAN 11 #15)
`KEYSTONE` = info; `KEYSTONE GO [moon|#slot] [L<n>]` arms a run on the routed (or named) real moon, `KEYSTONE CANCEL`. The pull of the lever lands on a
re-generated version of that moon (wings + maze + open arena). It is a normal day (costs a quota day, loot still counts) with:
- **timer** (`540 + 170 x size - 6 x (level-2)` s, floor 420) and **enemy forces** (kills give `power`, elites x2; the spawner keeps feeding creatures);
  at 100 % the **Guardian** (the theme boss, weaker: hp x (0.6 + 0.06 x (level-1))) awakens in the arena. Kill it before the timer = success.
- key level (crew, `run.cycle.ks.level`, starts +2): success **+1 / +2 / +3** (time left >= 0 / 20 % / 40 %), depleted = -1 (min +2). Weekly best (local, per week,
  ISO week key) in `profile.cycle2.ksBest`. Reward: credits, XP, chest (weapon(s) with rarity floor by level).
- affixes by level (all wired): **Viral** (+2: dying creature spawns 2 bots), **Laggy** (+3: doors open 2.5 s late), **Demonetized** (+4: scrap -25 %, XP +30 % on the reward),
  **Overclocked** (+5: creatures +15 % speed), **Sponsored** (+6: creature level +2), **Trending** (+7: elites x3). Also +1 creature level every 3 levels.
- routing away before the lever disarms it; a loaded save clears it.

## RAID (MASTERPLAN 11 #16)
`RAID` = info; `RAID GO [normal|heroic|mythic]`, `RAID CANCEL`. "THE ALGORITHM'S CORE": size 2.6, 3 wings, 2 labyrinths, arena; **3 bosses** drawn from the whole table
(seeded by run + ISO week; final = highest rank): two mini-bosses (hp x0.7) in wing key rooms drop the 2 access cards, the final in the arena. **Any crew 1-8**: boss hp
x `raidCrewMul(n)` (1, 1.6, 2.1, 2.5, 2.9 .. 4.1), damage x(0.9 + 0.05 n), elites per wing `(2 + ceil(n/2)) x diff`. Difficulty x hp 1 / 1.7 / 2.6, dmg 1 / 1.2 / 1.45, tier +0/1/2.
**Weekly lock** per difficulty on the chest (host profile `cycle2.raid`): later clears pay credits / XP but no chest. Fixed layout per week. Recall after 45 min.

## ENDLESS (MASTERPLAN 14.2)
After 3 cores: `ENDLESS ACCEPT` (or DECLINE). No deadline: `run.quota` / `run.sold` mirror the **Engagement Meter** (sold = meter % of the credits needed for a full meter);
sales fill it, every moon day = depth + 1 and the meter decays (relief every 5th day), 0 = fired (cash-out halved, normal fired flow). **PATCH NOTES** every 3 depths
(mutator added, 25 % rollback, loot x1.08), an **S-rank / Red / Finale gate** roll each day: `GATE` arms a core-style instance (Red gate: no exit until the boss falls, 1800 s cap).
`CASHOUT`: Clout, XP, prestige star per 15 depths, title, endless cosmetic token, local top-20 leaderboard (`profile.cycle2.board`). Mutator knobs wired: dangerMul,
valueMul, scrapKeep, scrapAdd, speedMul, eliteMul, dmgTaken, dmgDealt, weather, dayLenMul, blackout, jumpMul, staminaRegen. **Not wired:** `shrines` (Double shrines).

## Tests (all node, no browser)
| Command | Covers |
|---|---|
| `node tools/harness/cycle.test.mjs` | pure state machine + endless rules (wave 2) |
| `node tools/harness/cycle2_plan.test.mjs` | ~22 000 checks: default layouts unchanged, core / raid / deep layouts over 8 themes x sizes x seeds (arena sealed until the door opens, keys / elites reachable, maze connected, zones), build smoke + no loot in maze walls, moon defs, keystone / raid / weekly rules |
| `node tools/harness/cycle2_bosses.test.mjs` | real CreatureManager: HP formula, every boss mechanic, generic kits, stun immunity, evade, models + UI DOM-safe |
| `node tools/harness/cycle2_flow.test.mjs` | the glue on the REAL host.js flow (lever / landing / populate / takeoff / evaluate / update): gate -> core -> win, grace, shameful, recall, wipe, fired, save/load, `cycle:false`, cards, chest, keystone, raid + weekly lock, endless (meter, patches, gate, cash out, fired), Legacy sector, all 8 themes, 24 random-operation runs + a "give up" policy proving the days stage is always reachable |
| `node tools/harness/cycle2_i18n.test.mjs` | every string has TR + RU with the same placeholders |

## Honest gaps
- **Never run in a browser**: boss model proportions / animation, name card + HP bar layout, ring telegraphs, the maze + arena look (props, lamps, lighting), zone toasts,
  terminal text, 2-player sync of `cyx` / `run.cycle`, host migration. The facility builder ran in node with stub physics (geometry + spots), not in a renderer.
- Not done: the "1 short puzzle" per core (the arena auto-opens after 720 s instead), Trophy Hall placement + ship part + first-kill cosmetic (first kill = extra shard only),
  faction rep is applied directly and a CASE entry is only announced through the events `tfg:sectorCleared` / `tfg:shamefulExit`, Hidden Gate, Gate Break -> SIEGE, ARCHIVE
  (MASTERPLAN 14.1), Hunter Rank; boss sounds reuse existing samples (`hit_metal`, `spark`, `explosion`...).
- Numbers (boss dmg / timers / keystone scaling / raid crew mul) are design values, never hand-balanced. Keystone forces are farmable by design (spawner) but capped by `cap = 14 + level` alive.
- `hostFinishTakeoff` is wrapped: another module that wraps it later still sees the original day numbers (daysLeft is restored *after* the original ran).
