# atmos12: interior atmosphere pass (wave 12)

Problem: the interiors read as flat tiling. Fix: one layer of readable, high-contrast, cheap dressing on every interior theme (all 18 registered ids: factory, mansion, mineshaft, office, backrooms, serverfarm, sewer, hospital, influencer, academy, colddata, museum, metro, greenhouse, prison, tower, deadmall, funhouse). It extends existing systems instead of adding parallel ones: lamp positions / colours / flicker come from `game.lights.emitters` (group `facility`), power from `lights.globalDim`, window positions from `fac.m2.windows`, floors from a physics raycast, the shader hook from the post pass.

## What the player sees
| Layer | Rule / tell | Budget |
|---|---|---|
| Ground decals | puddles (dark, with a bright wet streak pointing at the nearest lamp), stains, cable runs along corridors, paper litter (offices / academy), dead leaves (mansion / greenhouse), scorch marks under broken lamps, moss, frost, confetti, rubble, glass shards (glitter), drain grates. Mix per theme, biased by room type (bath / pool rooms wet, server rooms cables ...) | 1 draw call, 50-160 quads |
| Light shafts | 3 crossed soft sheets + a floor pool under every ceiling lamp (max 150), window beams (cold slab + floor patch). Flicker with their own lamp (same curve as the light pool), vanish when the power is cut | 1 draw call (shared with glints + vent plumes) |
| Dust motes | 150 x theme factor motes that exist ONLY inside the cones of the 4 lamps nearest the camera, lamp coloured, slow drift, fade in / out, follow the lamp's flicker and the power | 1 Points draw call (shared with the effects below) |
| Drips | a bead swells on the ceiling 0.75 s (telegraph), falls, ripples + a plink; every drip source has a puddle under it | pool of 72 transient points |
| Sparks | 10 broken lamps per facility (the flickering ones): a burst of orange sparks every 1.5-5 s + zap, scorch mark below | same pool |
| Breathing vents | ceiling grilles with a pale plume that breathes every 5.5-8 s; at the exhale peak 5 puffs fall and a soft breath sound plays | same pool |
| Colour grade | multiplicative post tint per theme, eased in over ~0.7 s when you enter, out when you leave (warm sick yellow mall + backrooms, cold teal metro, icy cold storage, green sewer / greenhouse, warm dusty mine / mansion ...) | 1 vec3 uniform |

No rule to learn beyond "a spark / drip / breath is a sound cue": sparks and drips are cosmetic and never damage anything. Everything is local presentation: no net messages, no host state, deterministic from the facility seed (`planAtmos` uses `RNG(hash(theme) ^ layout.seed)`), so every peer with the same facility sees the same decals / vents / leaks; only the motes / drip timing use `Math.random` (visual only). Late joiners simply build the plan from their own facility copy.

## Files
- `src/game/atmos12_core.js` pure: `PROFILES` (per theme: tint, dust, shaft k / r, decal weights, drips, vents, spark share), `planAtmos(fac, seed, q)`, `lampFactor` (light pool flicker curve), `breath`, `KINDS`.
- `src/game/atmos12_art.js`: atlas + glow canvas textures, geometry bags, `buildAtmos` (decals mesh + additive light mesh with lamp-linked colour groups), `makePoints`, `warmObjects` (registered on the `warm` event so the 3 material flavours compile in the landing warm set).
- `src/game/atmos12.js`: module `atmos12` (build ~0.5 s after the facility appears, per-frame drive, sounds `a12_drip / a12_spark / a12_vent`, tint easing, debug API).
- Shared edits: `src/core/engine.js` (`uniform vec3 uTint`, `col *= uTint;`, uniform init: 3 one-line hooks), `src/game/game.js` (import + slot).

## Knobs
`PROFILES[theme]` in atmos12_core.js (tint, dust, shaft, density, decals, drips, vents, spark), `SIZES` per decal kind, caps (150 lamps, 340 decals, 10 broken lamps, `DN = 200` motes / `TN = 72` transients in atmos12.js). Quality: `QUALITY.decor` thins decals, `QUALITY.particles` scales motes. Kill switches: `kefal.game.atmos12.debug.set('decals' | 'shafts' | 'dust' | 'fx' | 'tint', false)`.

## Test
`node tools/harness/atmos12.test.mjs`: all 18 themes x 2 seeds through the real `buildFacility`: plan deterministic, decals on floor cells, vents / drips under the ceiling, art geometry finite, triangle budget, a power cut dims the lamp-linked groups. Also ran an ad-hoc mock-game smoke (1500 frames per theme, sounds fire, no NaN, scene empty after dispose).

## Not verified (no browser run)
Point sizes / mote visibility at 1280x720 through the PSX post, strength of the shafts and glints against the interior fog, decal z-fight with the carpet strip, tint strength per theme, whether `floorAt` drops many decals in a real physics world (`debug.state().stats.dropped`), warm-set compile of the new materials.
