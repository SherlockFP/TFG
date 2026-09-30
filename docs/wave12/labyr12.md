# Wave 12 - LABYR12: The Dark Web + The Overload Hotel

Two more labyrinth interiors on top of the facility generator (same pattern as wave 10, no fork of `facility.js`). Ids are fixed: **`darkweb`** and **`hotel`**.
A moon with `interior: 'darkweb'` / `'hotel'` picks them up through the interior registry (`world/interiors/index.js`). Generated moons of tier >= 2 draw them from their
interior pool through `labInterior12()` (own hash stream, feature-detected with `interiorAvailable`, falls back to the interior picked before). Static moons are unchanged.
Identity: a company crew surviving inside the live stream of The Algorithm - the network's basement, and a hotel nobody ever checked out of.

## The rules (one sentence each, learnable in one landing)

| | The Dark Web (`darkweb`) | The Overload Hotel (`hotel`) |
|---|---|---|
| rule | **Noise draws the map.** Any loud noise sends a sonar pulse that outlines the tunnel walls for 1.6 s, expanding from the source; the same noise alerts creatures. | **One elevator, one missing floor.** The doors close 3 s after the chime, the car rides 5-8 s, whoever is left outside waits. The panel skips a floor: only the stairs reach it. |
| input | key **M** = knock (2.6 s cooldown, loud 1.4). Sprint steps (0.7), hard item drops (0.5), decoys, gunshots ping too. Walking (0.3) and crouching do not. | E on a call panel / a cab button. E with a `key` item on a DO NOT DISTURB door (consumed). |
| tell | cyan wireframe (amber door frames) that survives the fog; LED strips at the skirting colour by depth (cyan / blue / magenta); dim amber door frames (`fog: false`) | red / green lamp over every shaft door, flashing during the warning, three chimes; the cab button panel has a taped-over 4th button (interactable: "the button was never installed") |
| counterplay | knock only when you must; sneak / crouch is silent; `lightfoot` halves sprint noise below the pulse threshold; a decoy pulses somewhere else | step in during the chime or wait for the next car; the motor is loud in the lobby (every ride) and the arrival bell at the destination: listen before you open the doors |
| loot | `.ONION MARKET` hub: auction terminal, 7 tarp stalls, a guaranteed **gold bar**; a hidden-service spot in every cell room | lobby desk: a guaranteed **master key**; a key on a room-service tray on floor 2; DND rooms hold guaranteed items; hidden floor 13: suite **1313** with a guaranteed **ring** |

## Layout

- **Dark Web** (`labyr12_darkweb.js`): ordinary room labyrinth, plan `rooms`, loops 0.75, corridor height 2.6 m, hub `dw_market` 5x5 (always). Rooms: server racks, cells, relays. **No lamps**: corridor
  lamp slot holds a cobweb prop (the generator always walks its lamp grid), room styles have `lamp: null`, atmosphere `{ fog 0x000205, density 0.09, hemi 0.012, ambient 0 }`, practicals are a dim teal.
  Cable bundles crowd the corridor walls (visual only, they read as narrow tunnels). Two sets of hex "packets" crawl along the LED strips (`lab.tick`).
- **Echo shell** (`labyr12_echo.js`): ONE `LineSegments` mesh built once from the layout (about 10 segments per wall edge + a 2 m floor grid + doorway outlines, ~55k segments in the test),
  a 20-line `ShaderMaterial`: up to 4 pulses `{x,y,z,age,radius}` as uniforms, additive, depth-tested (walls hide what is behind them), no fog, no lights. Constant scene cost.
- **Hotel** (`labyr12_hotel.js`): the hub `hotel_core` (8x6 cells = 32 x 24 m, 16 m tall) is the LOBBY and holds the rest of the building (prison / tower pattern, LabBuilder + `stairs.js` ramps):
  level 0 lobby (reception, sofas, a piano, key on the desk), levels 1-3 = floors 2, 3 and the hidden **13** (4 m pitch, 0.3 m slabs with holes), a central CORE (16 x 8 m: stairwell with three zig-zag flights
  + the elevator shaft), a ring corridor around it and 22 rooms around the outside per floor (sealed = solid block with a door decal and a brass number plaque, open = furnished, DND = real leaf + collider).
  Floor 13 has no shaft door that opens (a dead steel door with a "13" plaque), cold flickering sconces (separate meshes toggled in `lab.tick`) and the merged suite 1313.
  The ground floor is the ordinary generator: carpeted corridors, numbered guest rooms (`101..`, plaques next to the door), kitchen, laundry, ballroom.
- Upper floors have no creature nav (prison / tower rule): their spots are `elevated`, the whole core is blocked on the ground nav (a 1 m grid ignores 0.3 m walls), spots slide to the nearest clear ground cell.
- Loot tables use existing item ids only; guaranteed spots use `item` + `hero` (the host spawns those first).

## Net + runtime (`game/labyr12.js`, pure rules in `labyr12_core.js`)

- `lab12req` client -> host: `{op:'knock'}`, `{op:'go', to}`, `{op:'dnd', id, key}`, `{op:'sync'}`. `lab12fx` host -> all (HOST_ONLY): `{k:'p', p, l}` pulse, `{k:'go', from, to, n, warn, dur}`, `{k:'dnd', id}`, `{k:'hstate', at, n, dnd[]}` (late join).
- Dark web: the host wraps `creatures.noise` (unwrapped on dispose). Any noise >= 0.5 broadcasts a pulse (merged within 0.22 s); the knock is validated per player on the host (cooldown), makes ONE loud noise and ONE pulse.
  Peers keep up to 8 pulses, the 4 nearest go to the shader. Small HUD dock item "ECHO 1.4s / ready [M]".
- Hotel: every peer runs the same clock from `go` (3 s warning with three chimes and a flashing lamp, then the gate closes (mesh + collider, never on someone standing in the door), the car rides with a smooth ease,
  a rider (inside the cab when the doors close) is carried by per-frame teleports, the destination opens with a bell). The host validates: idle, level valid, requester within 10 m of the shaft. Ride time `hzRide(seed, n, from, to)`.
  Host noise: motor at the ground shaft (1.0) at departure, the bell (0.7) at the destination. DND: the host checks reach, that the key is a `key` item held by the requester, consumes it (`it` rm) and broadcasts.
- Merged into existing systems instead of new UI: `LAB_HINT` (labyrinths_core) gets the two mechanic lines (landing card row + terminal moon info), `SCRAP_TABLE` / `BIG_TABLES`, `BEDS` (atmosphere beds), moongen `INTERIOR_NAMES`.

## Files

New: `world/interiors/labyr12_{darkweb,hotel,echo,themes}.js`, `render/labyr12_textures.js` (`dw_*`, `hz_*`, plaques on demand), `audio/sfxlib_l12.js`, `game/labyr12.js`, `game/labyr12_core.js`, `game/labyr12_text.js` (TR + RU), `tools/harness/labyr12.test.mjs`.
Shared files touched (one-liners): `world/interiors/index.js` (+2), `audio/sfxlib.js` (+2), `audio/extassets.js` (+2 one-shot sets), `game/moongen.js` (+2: import + `labInterior12` line), `game/game.js` (own import + slot).

## Knobs

`labyr12_core.js`: `KNOCK` (key, cd, loud, minLoud, life, speed, gap), `pulseRadius()`, `HZ` (floorH, warn, base, perLevel, noise, ding), `labInterior12` probabilities. Hotel geometry `HZ_GEO` (room depth 5.4, corridor 2.6, core 16 x 8, lane, hole half width), DND count per floor (3 / 3 / 2), open rooms per floor (6 / 6 / 4). Darkness: `DARKWEB.atmosphere` (`hemi`, `ambient`, `density`).

## Test

`node tools/harness/labyr12.test.mjs` (~1 min): registry / names / TR + RU / sounds render, pulse and ride maths, moon-pool distribution, 3 seeds x 2 sizes per theme (reachability, fire exit, hero spots + nav paths, doors never blocked, mesh count vs older themes, THREE lights = 0, determinism);
dark web: echo shell size + shader constants + `setPulses`, trim, hero; hotel: `checkStairs` on all three flights, join levels, headroom under every slab, top landings free, holes, gates, cab fits the shaft, DND doors + spots, keys, hero suite, room numbers;
runtime on a stub game: noise -> pulse thresholds, merge, knock cooldown per player, key M, unwrap on dispose; elevator warn / chimes / doors / ride / rider carried / outsider left behind / far player refused / same-level refused, DND with the wrong / right key, late-join state, silence in other interiors.
Neighbours re-run green: `geomfix` (80 facilities, all 0), `labyrinths`, `stealth_maze` (20 themes x 5 sizes x 200 seeds), `facjobs`, `worlds3`, `maps2`, `sound2`.

## Known gaps / NOT verified

- Never seen in a browser: the echo shader look (line thickness in the PSX buffer, additive strength, ring width), how dark 0.012 hemi feels with the torch, cable-bundle "narrowness", hotel proportions (a 32 x 24 m lobby with a 16 x 8 core, 5.4 m deep rooms), carpet / wallpaper texture taste, door plaque readability, elevator motion feel (per-frame teleport, like the tower), stair feel (ramp 26.6 deg, rails), chime / ambience loops (rendered in node only).
- Upper floors have no creature nav: creatures only meet the crew in the lobby and through the elevator noise. No creature rides the car.
- Peers other than the host see a remote rider move through the shaft by their synced position (per-frame teleports run on the rider's own peer only).
- Static moons keep their interior (the two themes appear on generated tier >= 2 moons). Bosses (`cycle_core BOSS_TABLE`), codex and the endless generator have no entries for the new ids (fallback: `factory`), same as wave 10.
- Lockpicks do not open DND doors (only the master key). Pulses are geometry only: they do not reveal creatures or items.
