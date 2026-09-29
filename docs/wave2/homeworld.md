# HOMEWORLD TYCOON (module `homeworld`, design: MASTERPLAN section 17)

**Status:** node-tested economy + raid maths (`node tools/harness/homeworld.test.mjs`, 26 checks) and `npm run build`. NOT run in a browser
(browser queue was cut): expect first-run harness fixes in `homeworld.js` (placement ray, panel focus, HUD position). No headless script / screenshot yet.

## Files
`src/game/homeworld_core.js` pure rules (buildings, costs, power/cooling, per-day output, caps, placement, RaidSim) · `src/game/homeworld.js` install
(moon `home`, host actions, day hook, raids, views, build mode) · `src/world/homeworld_map.js` plateau + pad + console + grid · `src/models/homeworld.js`
21 procedural buildings x 5 levels (2 draw calls each, geometry cached) · `src/ui/panels/homeworld.js` CRT panel (BUILD / MANAGE / STATUS).
Shared-file hooks (all marked `[hw]`): `game.js` import + slot + `moon.customMap` branch in `loadMapFor`; `host.js` 4 spots (`hostLever`, `hostFinishLanding`, `hostUpdate`,
`hostFinishTakeoff`): HOME has no clock, no spawns, no daily event, and leaving it costs no game day / fines / summary.

## How to play
Terminal `ROUTE HOME` (free) then the lever. Pad console `[E]` or hotkey `[H]` opens the panel. BUILD: pick a building, LMB place on the 3 m grid, `R` rotate,
`RMB`/`ESC` leave; `U` upgrade / `Delete` sell / `M` move the building under the crosshair. Storage is capped: STATUS -> COLLECT (credits to the ship, Clout to every
crew member, meals as medkits, shards as items); DEPOSIT turns held components into home components (they pay for builds); WITHDRAW drops 6. Terminal `HOME` = status.

## Economy (per GAME DAY = a moon day that ends at takeoff; HQ / HOME visits pay nothing, a new/rewound run never pays retroactively)
Level cost = base x g^(lv-1) (g 1.8-2.0, walls 1.7), components x1.7 per level, advanced buildings need Circuit Cores (Lv4) + Data Crystal (Lv5). Sell = 60 %.
Power: every building draws power, Generator / Solar supply it (free shore power 4); heat needs Cooling Units (free 6). Builds/upgrades that break either are refused.
Output/day, Lv1..5: Farm 5/9/15/24/36 credits; Rack 1/2/3/5/7 Clout; Refinery 1/2/3/5/7 components; Garden 1/2/3/4/6 meals; Distiller 1-2 shards (tier by level);
Barracks +6..36 % all (cap +50 %); Museum 1..6 Clout x (0.6 + 0.4 x bestiary/15); Lounge +3..16 % Clout; Warehouse +50..340 % caps. Caps: 500 credits, 80 Clout, 60 parts...
Value units: Clout 4, part 4, meal 5, shards 3/11/25/50 credit-equivalents.
**Targets (test-asserted):** a well-developed base (2 gens, solar, cooler, 2 farms L4, rack/refinery/distiller/garden/museum/barracks L3...) = **130 per day = 27 %** of a
mid-game active day (480); a fully MAXED base = 426 per day = 30 % of a late-game active day (1400). 20-day sim (crew invests 25 % of an active day): day 5 4 %, day 10 6 %, day 20 8 %.

## Raids
Chance per LANDED (non-home) day = min(8 %, 2 % + 0.5 % per building above 3); needs >= 3 buildings; never two days in a row (gap >= 2); measured 7.4 % long-run.
Fires 40-200 s into the day: alert + HUD mini-panel (wave n/N, raiders %, defences %, threatened, wrecked). Seeded `RaidSim` (1 s steps, 3-5 waves from `siege_core.planWave`,
Behemoth replaced by Blobs): raiders come along one bearing, towers shoot inside their range, cryo slows, walls/gates soak damage first, spikes/mines hurt at the wall
line, then buildings, then the core. Power P = 0.75 + 0.03 x sum(levels of NON-defence buildings) + 0.07 x quotaIndex (defences never raise it). Crew landing on HOME
during the raid gives x1.25 tower output (a full on-site siege with real raiders + flow-field is the next step, not built yet). Result: repelled (bonus credits + Clout + parts),
held (half bonus), breached (a machine is WRECKED = needs repair, never destroyed; 30 % of stored credits + 20 % parts stolen). Odds (200 seeds, quota 2, 3 waves):
no defences 0 % / 0 % / 100 % breached; 4 Gun L1 100 % breached; 4 Gun L3 + 2 Tesla + Cryo + Sniper + 16 walls: 48 % repelled / 25 % held / 27 % breached.

## Persistence / net
`profile.homeworld` on the HOST (survives firing / new runs), mirrored in `run.hw` (late joiners get it in `welcome`; friends visiting see the host's base).
Net types: `hwact` (request: build/up/sell/move/repair/collect/deposit/withdraw), `hwmsg` (host -> all). English + Turkish + Russian (names, panel labels, alerts).

## Not done yet
On-site real siege with creatures, tower tracers, NPC workers walking, ship CRT raid feed (HUD mini-panel only), Trophy Hall exhibits, browser verification.

**UPDATE (wave 3 [finish]):** the on-site raid (real raiders + flow field + visible tower fire when the crew is home) is built: see docs/wave3/finish.md. Still not done: NPC workers, CRT raid feed, Trophy Hall exhibits.
