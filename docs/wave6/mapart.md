# MAPART: the signature layer of every outdoor moon (wave 6)

Owner: "add that kind of thing to the other maps too; it must not look like a Lethal Company knock-off, original ideas and design."
Every regular outdoor moon (base moons, generated sectors, worlds2 / maps5 / voyage biomes) now gets the same seeded layer, tied to
MASTERPLAN §21 (watched + corporate decay) and docs/LORE.md. The homeworld (`moon.customMap`) and the Company are skipped.

## What is on a map
| Group | Objects | Notes |
|---|---|---|
| The Algorithm watches | 2-3 broadcast **pylons** (25 m mast, magenta rings, a wifi-eye that turns to the nearest player), 3-5 floating **LIVE holo-panels** (glitchy variant swap, 8 texts), 3-5 **camera drones** (hover, look at you), 4-7 **glitch scars** (instanced voxel patches, cells re-colour), 3-5 **ad billboards** beside the path | ad copy is EN/TR/RU dark humour for fake Company products (SMILEX, CORPO-COLA, AFTERLIFE+, KARMA SUPPORT ...) drawn on ONE atlas canvas, redrawn on language change |
| The Company decays | 2 crashed **cargo pods** (stencilled crew number decal), 2 abandoned **survey rigs**, 1-2 **crew camps** with a readable **journal** (5 entries), 5-8 **warning signs** beside the path, **quarantine tape** squares around ~60 % of the scars | tape / signs / decals are quads of the same atlas |
| Biome signature | ONE big landmark (two on maps > 1.2x) + a **horizon silhouette ring** in the same family | see below |

Landmark family by biome decor (fallback biome id, then `dish`): `monolith` server-monolith field (datascape, neon, crystal, twinsun, blackforest) .
`datafall` frozen data waterfall (ice, cold vault, soviet, sky, storm, snow) . `crane` rust city-skeleton crane + gutted tower (ash, lava, rust, desert) .
`fungal` fungal cable forest (jungle, fungus, marsh, acid, estate, swamp) . `dish` radio dish array (hills, moor, bone, everything else).
Sky / fog palettes were already per biome (moons.js, biomes_wave1, voyage_biomes_data ...); the new part is the silhouette ring: one merged mesh,
fog-less, tinted from the live fog colour each frame so it reads as distant dark shapes by day, dusk and night.

## Three interactions (host-authoritative)
- **Pylon** [E] "Cut the feed": once per pylon; opens a 60 s **off-stream** window (further pylons extend it). While it is open the host freezes its
  creature spawn timers (`hostData.spawnT` / `outdoorSpawnT`); all peers see the eye shut, hear a power-down, get a toast and a chat line, and a toast when it ends.
- **Billboard**: shoot it (any combat-kit hitscan tracer) or hit it with a swing: the ad jingle (a nearby billboard hums a 8-note tune every ~10 s) stops for everyone and the screen shows ERROR 404.
- **Camera drone**: 3 hits (tracers or a jumping swing; hover 3.4-5.6 m) knock it down; a crafting component (circuit / sensor / battery / cable) drops once.

Net: prefix `ma`. Client -> host `mareq` `{s, op:'sab'|'hit', id, k?:'d'|'b'}`; host -> everyone `mast` (HOST_ONLY) `{s, k:'off'|'drone'|'board'|'sync', ...}`;
late joiners send `masync`. Ranged hits need no new client message: every peer already broadcasts the combat-kit tracer (`fx {k:'cb', t:'tr', a, b}`), the host
tests that segment against live drones / billboards (muzzle must be within 6 m of the sender, 50 ms per-peer rate limit). Melee wraps `game.resolveMelee` like harvest.js.
Host validates distance, once-only rules and state (rules live in `mapart_core.js`).

## How it stays deterministic and safe
- `planMapArt` uses `RNG(hashString('mapart|moon|seed'))` only; every peer rebuilds the same specs, colliders and ids. Only visuals use `Math.random`.
- Placement guards: landing zone 34 m, entrance 30 m, fire exits 16 m, ponds / frozen lakes, the engine's own `outdoor.avoid` (path 5 m, landmark sites, reserved decor
  footprints) with the object radius as margin, slope limit, flood level, lava, trees / rocks / scrap spots of the moon, and mutual spacing. Billboards / signs are placed 7-14 m beside the path (never on it).
- Constant light count: glow is `MeshBasicMaterial`, nothing goes through the light pool. Merged geometry: one mesh each for solid parts (vertex colours), glow parts, atlas quads, holo quads,
  scars (InstancedMesh), horizon; only pylon eyes and drones are individual meshes (shared geometry). Colliders: boxes only (pylon base, billboard posts, pods, rigs, camps, landmark parts).

## Files
`src/game/mapart_core.js` (plan + rules, pure) . `mapart_art.js` (atlas, bags, all props, drones, eyes) . `mapart_lm.js` (5 landmarks + horizon) . `mapart_text.js` (EN/TR/RU) .
`mapart.js` (module: build on `mapLoaded`, host rules, prompts, jingles, spawn hold) . one line each in `game.js` (import + `useModule('mapart', installMapArt)`); no terrain.js / biome file touched.

## Tests
`node tools/harness/mapart.test.mjs` (placement determinism, guards vs landing zone / entrance / fires / ponds / lakes / path over 220 seeds x 9 biomes x 2 scales,
no overlap, family coverage, sabotage / drone / billboard rules, segment maths, EN+TR+RU tables) . `node tools/harness/mapart_art.test.mjs` (geometry builds for all families without a DOM,
draw-call and triangle budgets, dispose) . `node tools/harness/mapart_install.test.mjs` (module on a stub game: build on mapLoaded, prompts, sabotage + spawn-timer freeze + reach / once-only, tracer -> billboard, 3 hits -> drone + loot once, melee wrapper, late-join sync, skips, dispose) . existing worlds2 / worlds2_decor / maps5 / maps5_install / voyage tests still pass . `npm run build`.
Browser: `tools/harness/wave6_mapart.js` (with `headless_shots.mjs`): lands on hamsi / palamut / orkinos, shoots the landmark and a pylon or billboard, reads `renderer.info`, exercises the host rules.

## Knobs
`OFF_SEC`, `DRONE_HP`, `GUARD`, `REACH` in `mapart_core.js`; counts in `planMapArt` (`big` = map scale > 1.2); `ADS` / `SIGNS` / `JOURNALS` / `HOLO` in `mapart_text.js`; `FAMILY_BY_DECOR` to re-assign landmarks.

## Known gaps
- The atlas language follows the language at build time and is redrawn on a language change; text baked into an existing frame updates on the next frame only.
- The Algorithm director (algorithm.js / algo1.js) is not told about the off-stream window (only the spawn timers are held); a scripted "director scare" can still fire.
- Ranged hits only from the wave-2 combat-kit hitscan weapons (they broadcast the tracer); older weapons.js guns and thrown items do not hit billboards / drones.
- Drone positions are per-peer animation (bob +-0.6 m); the host uses a 1.4 m hit radius to absorb that.
- NOT verified in a browser: the shared browser queue was too deep. One headless attempt got the lock but its first screenshot timed out at 30 s (software GL under load); the rerun was cancelled on the lead's instruction. `wave6_mapart.js` (lands on hamsi / palamut / orkinos, screenshots, renderer.info before / after by hiding the layer, host-rule checks) is ready for the QA pass. Scale / colour / fog visibility of the landmarks needs a human look; no screenshots in docs/wave6/mapart/.
