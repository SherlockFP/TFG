# Wave 4 - SURVIVAL (module `survival`; node-tested + builds, NOT run in a browser)

Owner ask: herbalism / foraging, farming, cooking (food never appears in your hand, you cook it), alchemy-lite, better chests / storage, light survival touches.
Rule kept: **healing only via food** (raw ingredients heal 3 HP, cooked meals heal for real, packaged snacks were nerfed: pizza 12, box 24, noodles 0.5 hp/s, ramen 0.8 hp/s).

## Files
`src/game/survival_data.js` pure rules (plants, biome tables, growth, ingredients, dishes, quality, potions, hunger, warmth, items, recipes) ·
`src/game/survival_store.js` pure storage / structure rules (crate grid, records, sanitizers, placement) ·
`src/game/survival_i18n.js` EN -> TR / RU (generated names composed from the same tables) ·
`src/models/survival.js` plants (merged, vertex colours, emissive tint), item models, crate / planter / stove / brewing stand / campfire / ghost ·
`src/ui/panels/survival.js` cooking + brewing panel (timing needle) and the storage panel (drag and drop, reuses the inventory tile styles) ·
`src/game/survival.js` install (host handlers, views, interactions, hunger HUD).
Shared edits (tiny): `game.js` (import + `useModule('survival', installSurvival)`), `food.js` (1 line: emits `tfg:ate`), `food_data.js` (snack heal numbers + their EN/TR/RU text), the two food tests.

## How to play
* **Forage**: seeded wild plants on every outdoor moon (7 kinds, biome tables in `BIOME_PLANTS`, 8 % rare variants = tinted, double yield, guaranteed seed). Hold E (1.3 s, **Sickle** 0.6 s and +1 plant).
* **Farm**: hold seeds, aim at a planter cell, E. Watering can (E) keeps growth at full speed for 5 minutes (dry = 25 % speed). Real time (4-10 min per plant), saved. Harvest: 3-5 plants + 1-2 seeds.
* **Cook**: E on the **ship stove** (built in, -z wall) or a **campfire**. Pick 1-3 ingredients (raw meat from creatures, fish, plants). Meat = stew, fish = grill, greens = soup, berries / fruit = tart; the strongest plant property (>= 2) adds a bonus buff.
  Stop the needle: RAW < 50 % < COOKED < 72 % < PERFECT < 86 % < BURNT. Quality is the item **tier** (common burnt, uncommon undercooked, rare cooked, epic perfect). Undercooked meat can poison.
  The dish carries its numbers in the item's value fields (`value` = heal, `baseValue` = hunger * 10 + strength). Eat it (LMB): heal, hunger, buff.
* **Brew**: brewing stand (built in next to the stove, or place one), 2-3 plants, 25 s real time -> Stamina Tonic / Night Draught / Hush Tonic / Fireward Tonic (weak / strong / superb by property total).
* **Storage**: the ship has a wooden crate (label "SHIP"). Craft / place more: Wooden 6x3, Metal 8x4, Secure 10x5 (workbench, cat tools). E opens the panel: drag between crate and pockets, RMB quick move, SORT, TAKE ALL, label + 7 colours, PACK UP (empty, placed ones). Everyone in the crew can use every crate (host-authoritative).
* **Hunger** (bar, left HUD): 80 at start, empties in ~45 min on a moon (x0.3 in orbit). Satisfied (>= 70) +6 max HP, Hungry (< 25) mild stamina / speed malus, Starving small more. Never lethal.
* **Warmth**: cold moons (snow / ice / crystal, stormy moor) drain warmth outdoors (~4 min to Freezing); campfire, ship, indoors, Frostleaf meals restore it. Only speed / stamina, never damage.
* Placeable kits (crates, planter, brewing stand, campfire): hold it, LMB on the floor of the ship / homeworld (campfire: outdoors on a moon, burns 5 min, feed `comp_wood`).
* Starter: every new run gets 2 raw meat, 2 wildmint, 2 bloodberry, 2 seeds, a watering can and a sickle on the stove counter.

## State / net
Structures live in top-level run keys `run['sv:<id>']` (synced by `broadcastRun`, saved with the run). Home structures are mirrored into the HOST profile (`profile.survival.home`) and restored on hostStart. Hunger is per player in `profile.survival.hunger`.
Requests: `svh` `svplace` `svst` `svfarm` `svcook` `svbrew` `svuse` `svfire` `svsync`; host -> peers `svfx` (HOST_ONLY). Wild plant "taken" state is per landing on the host (late joiners ask `svsync`).
API for other modules: `game.survival.plantables` (`[{ kind, seed, item, growMs }]`), `.growTick(crop, nowMs)`, `.waterCrop`, `.stageOf`, `.newCrop`, `.farmYield`, `.msToRipe` (crop = `{ k, t, p, wet }`, wall-clock ms). A ship2 / homeworld2 planter only has to store crops in that shape.

## Tests
`node tools/harness/survival.test.mjs` (6300+ checks: exhaustive recipe resolution, quality, growth, storage, hunger, translations) and `node tools/harness/survival_install.test.mjs` (stub game: fixtures, eating, storage over the host handlers, farming, cooking incl. forged timings, brewing, campfire, warmth, persistence to the profile). `tools/harness/wave4_survival.js` is a headless body that was **not run**.

## Knobs
`survival_data.js`: `HUNGER`, `WARMTH`, `PLANTS[..].grow / yield`, `BIOME_PLANTS`, `COOK_ZONES`, `MAINS[..].mul`, `QUAL`, `BREW_MS`, `POTION_SECS`, `CAMPFIRE`, `STARTER`, `meatChance`. `survival_store.js`: `CRATE_TIERS`, `MAX_STRUCTS`, `CRATE_COLORS`. Fixture spots: `FIX` in `survival.js` (checked against the ship props by a node script, first free candidate is used).

## Not done / risks
* Never seen in a browser: plant / structure models, panel layout at 1280x720, ghost preview, stove position vs the shipyard rooms, eat animation reuse (uses the food module's emotes / arcs).
* Not built: kitchen station as a separate terminal command, planters on the ship2 / homeworld2 side (API is there), plants inside facilities, seed shop, cooking XP / achievements, campfire noise for creatures, secure crate has no lock (just capacity + steel look).
* Quiet potion wraps `net.request('noise')` only (footsteps / tools), not host-side noise sources; night vision shares the post-process uniforms with the anomaly mutation (the mutation wins while active).
* Home kits are placeable only on the homeworld ground; there is no on-moon persistence for anything except the campfire (never saved).
