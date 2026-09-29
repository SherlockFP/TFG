# HOME3: the "Off-Grid Claim" (wave 6, module-less: `world/homeworld_decor.js` + `world/homeworld_decor_plan.js`)

Owner (Turkish): "ev gezegenini gelistir, detaylandir; cok Lethal Company cakmasi gibi gorunuyor; orijinal fikirler, orijinal tasarim ekle."
Identity (MASTERPLAN 21): the homeworld is the crew's **Off-Grid Claim**, a scrappy outpost on a dead Company mining rock that The Algorithm keeps trying to "stream".
Corporate horror + dark humour, PSX low-poly, company-equipment look. Systems are untouched (homeworld / homeworld2 build grid, pads, waves, factory, raids).

## What changed (look only)
* **Palette**: `BIOMES.homeworld` is a permanent violet dusk (sky 0x5a3a7a, amber sun, low fog) instead of the old navy night: unlike any moon.
* **Skyline** (fogless, hazy-tinted, all inside the map group so it follows the landing animation):
  half-buried **Company mascot robot** (head with a smiling screen face: dead X eye, live magenta camera, "WE LOVE OUR EMPLOYEES *terms apply", fallen hand on the plain);
  **hijacked broadcast tower** (130 m lattice, red beacon, a huge **LIVE eye** that pulses and blinks every few seconds);
  a **moon with the Company logo** (hexagon "C"); three **aurora-like data curtains** (additive, scrolling vertical streaks with travelling dashes, magenta / cyan / violet);
  tiered **strata mesas** in a ring, the plateau's sheer strata cliff and a far plain (so nothing floats), plus the **STRIP MINE**: a big mesa with a spiral haul road, lamps and a crane.
* **Outpost** (in the 13 m band between the 90 m build square and the invisible walls, kept clear of the four approach lanes):
  ragged **scrap fence** (seeded holes, gaps at the lanes) with chasing **lamp strings**; **container huts** (ribbed, lit window, AC unit, stovepipe) with **graffiti** against the Algorithm
  (THE ALGORITHM IS WATCHING. SO WHAT. / NOT LIVE / SMILE FOR THE CAMERA (NO) / RATIO'D BY A ROCK / PROPERTY OF THE COMPANY - NOT ANYMORE.);
  **antenna array** (16 m mast, guy wires, blinking beacon + LEDs, dishes; one wrapped in foil "JAMMER. DO NOT LICK."); **camp kitchen** (awning, table, stools, stove with flickering flame + one pooled fire emitter, cooler, crates, hanging pans, bulbs);
  **memorial wall** for dead crewmates (names + day from the case files, `profile.caseFiles[].deaths`, up to 8 unique newest first; hard hats on rebar crosses, flickering candles; "NOBODY YET. keep it that way." when empty);
  three **trophy totems** (barrel stack, monitor head with a lit face, horns, hung skulls); **laundry line** (10 coverall / towel cloths swaying with the gusts); two **salvage heaps**;
  a crew **emblem painted on the pad** (crossed-out Algorithm eye + "OFF-GRID CLAIM", behind the ship, flat decal on the `decal` layer).
* **Living**: 3 **Algorithm drones** orbit the base at 7-10 m, **turn to face the nearest crew member** within 60 m (their eye goes cyan -> red while locked); 26 **wind-blown debris** pieces with gusts;
  a faint `hwhum` ambience layer (`lights_buzz`, louder toward the tower side), all stopped on unload.
* Text is `t()` with EN / TR / RU (canvas textures are drawn at build time in the current language).

## How it fits the rules
* **Build grid**: the plan (`planHomeDecor`) only uses AABB footprints outside the 45 m square (`GRID_MAX * CELL`, identical to the fine grid `FMIN..FMAX * FC`), off the pad disc, the ship box and the four 7 m lanes;
  the fence is soft (no collider). Colliders exist for huts, mast base, kitchen table / stove, memorial wall, totems, laundry posts, heaps. Nothing spawns / builds there anyway (nodes stay within 46 m).
* **Z-fighting**: the emblem, graffiti and memorial plaque use `flatLayer(..., LAYER.decal)` (PSX_NOSNAP + polygonOffset), offset 2-4 cm off their surface.
* **Performance**: 5 unit geometries cloned into ONE merged Lambert mesh (`solid`) + a handful of merged unlit vertex-colour meshes (glow, 2 lamp groups, flame, candles, beacon, LEDs, far glow), 2 InstancedMeshes (cloth, debris),
  drones share geometry (6 draw calls), textured quads: emblem, graffiti atlas (1 mesh, 1 texture), memorial, robot face, tower eye, moon, aurora (merged). Scene light count unchanged (`sceneLights` is reported by the script; one extra pooled emitter for the kitchen fire, count fixed).
  Per frame: ~40 instance matrices + 3 drone quaternions. Draw-call count of the decor is asserted <= 40 in the node test; renderer.info before/after is NOT measured (see status).
* **Ghost raid arena** (`moon.ghost`) does not get the decor.

## Files
`src/world/homeworld_decor_plan.js` (pure plan + overlap helpers) - `src/world/homeworld_decor.js` (builder, textures, update, dispose) - shared edits (tiny): `homeworld_map.js` (import, one call, update / dispose hook), `game.js` (passes `profile` to `customMap`), `homeworld.js` (biome palette).
Tests: `node tools/harness/homeworld_decor.test.mjs` (19 checks: 5 seeds x {no build-cell / fine-cell / placementCheck overlap, pad / ship / lane / plateau bounds, determinism}, builder colliders, no lights, draw-call budget, update + dispose, memorial names);
`homeworld*.test.mjs` unchanged and green. Screenshot script (NOT run to completion): `tools/harness/wave6_home3.js` + `wave6_home3_save.mjs` (decor hidden + old palette = before, decor = after; also prints renderer.info with / without decor and the scene light count):
`flock /tmp/tfg-browser.lock node tools/harness/headless_shots.mjs --port PORT --script tools/harness/wave6_home3.js --wait 3000 > /tmp/h3.json; node tools/harness/wave6_home3_save.mjs /tmp/h3.json docs/wave6/home3`.
Note: a fresh host starts on the onboarding moon, so the script first takes off, then routes HOME (two earlier attempts of this task landed on that moon, not on HOME).

## Knobs / gaps
Positions live in `homeworld_decor_plan.js` (set pieces) and the sky constants in `homeworld_decor.js` (ROB, TW, moon position, mesa ring, drone `R / h / sp`). Fence colliders are intentionally absent (raiders and players walk through the ragged holes and panels alike).
Not done: an hour-of-day shift of the palette, ambient wind SFX specific to the claim, drones do not shoot / scan for gameplay, memorial does not refresh while you are already on the map (built at landing).

## Status: NOT seen in a browser
The shared browser queue was ~7 deep (two runs were spent on the wrong map because of the onboarding start, the last one never got the lock and was cancelled). Verified: node tests (decor + homeworld / homeworld2 / homeworld2_install / homeworld_raid suites), `npm run build`.
Canvas textures (graffiti atlas, memorial, emblem, robot face, tower eye, moon, aurora), the drone facing, colours / scale of the skyline and the palette have never been looked at: first job for QA is to land HOME and check the six views of the script (north skyline, corner kitchen, west memorial, east tower, pad emblem, high overview), the drone turning towards the player and the LIVE eye blink.
