# Hero props + horror-safe glint + route card label (wave 8 morning tasks 3 + 5, REVIEW_W8_MORNING)

## What
1. **Hero props** (`src/models/artpass.js`, kit-merged, no lights, ids `cy_vending` `cy_rack` `cy_statue` `pipe`; carry2 registers them in `itemModels`, the old 5-box builders are gone):
   - vending machine: red company body, glass front over 4 shelves of cans, selector keypad, coin slot + return lamp, emissive amber price strip and header underline, logo lightbox, dispensing tray, hazard stripe (~570 tris).
   - blade rack: frame posts, 6 bezels with vents / LED pairs (unlit green, blue, amber) / pull handles, casters, hanging patch-cable bundles, hazard strip + stencil.
   - Company statue: stepped plinth with brass plaque, bronze Founder in a suit, arm raised pointing up, briefcase in the other hand, verdigris streaks.
   - lead pipe (tool, origin at the grip, tip anchor): taped grip, threaded butt, coupling with nuts, elbow ball, bent run, heavy bolted flange head, rust patches.
   Bounding boxes stay close to the old cuboids (physics / carry grip unchanged: `entities/items.js` re-centres on the bbox). Rack is ~0.64 x 0.96 x 0.57 (cables).
2. **Loot glint** (`src/game/lootglint.js`): the tall rarity pillars (inventory.js tier beams, loot.js affix beams) are gone. A rare+ world item now gets a small four-point star ON the item that flashes ~0.5 s every 2.6-6.5 s (rarer = faster / bigger, colour = rarity, phase from the item id), plus a faint floor ring only within 6 m. Both need a clear physics ray to the camera (re-checked every 0.4 s) and use depth-tested unlit additive materials, so a wall hides them. No light is added.
3. **Route card**: `interiorName()` for 56K-Dialup read "Data Center" (the generic name of the `factory` theme). `MOONS.hamsi.interiorName = 'Abandoned Web Host'` (its own description: "a small abandoned web host"), TR + RU in `routeboard.js` TEXT (`int_hamsi`). Other factory moons still say "Data Center".

## Knobs
`lootglint.js`: `RING_RANGE` 6, `STAR_RANGE` 18, `FLASH_LEN` 0.5, `GLINT[rarity] = { period, size }`.

## Test
`node tools/harness/heroprops.test.mjs` (models, glint flash / LOS / range / cleanup / no lights, route label). Also re-run artpass, carry2, shotfix, routeboard, qa1, warmset, secureloot, geomfix.

## Known gaps
Not seen in a shot (no browser run this task): silhouettes at carry distance, star size at 18 m, the `glove_torch` spot reshoot. `game/lootglint.js` uses `G` from physics for the ray; without physics it falls back to depth testing only. Terminal text still lists hamsi as "Data Center" (terminal.js maps by theme id).
