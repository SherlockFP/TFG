# Wave 3 `backrooms2` - noclip pocket realm + Backrooms entities + liminal imagery

Finishes the two interrupted wave-1 branches (`worktree-wf_fa5fa8a1-dc0-2` noclip realm, `-3` entities) and adds the
`liminal` module. Verified with `node --check`, `npm run build` and two node tests. **No browser run** (budget rule):
the WIP branches' own headless logs (docs/wave1/backrooms.md "Numbers") are the last live evidence.

## What is in the tree now
| Module (`useModule`) | Files | Role |
|---|---|---|
| `backrooms` | `src/game/backrooms.js`, `br_items.js`, `src/render/br_fx.js`, `src/world/backrooms_plan.js`, `backrooms_pocket.js` | noclip glitch walls in facilities (0-1 per day, seeded), falling out of the outdoor map (y < -150, 50 %), deterministic Level 0 pocket at x = +5000, almond water / liminal loot, green EXIT door back, hunts after 240 s, "lost" death when the ship takes off, `∅-Level 0` moon (`br_level0`) |
| `brcreatures` | `src/game/creatures_backrooms.js`, `creatures_backrooms_sfx.js`, `src/models/creatures_backrooms.js` | `br_smiler`, `br_hound`, `br_partygoer`, `br_moth` (+ drops, codex notes, sounds, models) |
| `liminal` (new) | `src/game/liminal.js`, `src/render/liminal_photo.js` | VHS found-footage overlay + procedural photo painter |
| i18n | `src/game/br_i18n_ru.js` | Russian for all of the above (TR sits next to each module's code) |

Slots in `src/game/game.js`: `[import/slot:backrooms]`, `[...:brcreatures]`, `[...:liminal]` replaced by the installers
(order: brlevels, backrooms, brcreatures, liminal, so `game.brlevels` exists when the others look at it lazily).

## Integration with the Level 0 overhaul (`brlevels.js`, `world/interiors/backrooms*.js`)
- Two different things share the theme and stay separate: **the facility** (interior theme `backrooms`, planned by brlevels:
  Level 0 / 1 / 2 / 37 / Fun / ! / Manila) and **the pocket** (pure noclip maze, own geometry / NavGrid / baked light).
  brlevels only touches the facility, the pocket owns fog + hemisphere while the camera is inside it and restores them.
- The `∅-Level 0` moon uses interior `backrooms`, so it is a brlevels facility with a guaranteed glitch wall into the pocket.
- Entities read `game.brlevels.levelAt(pos)` (Partygoers live in Level Fun) and `plan.cellLight` for darkness (Smilers), and
  `game.backrooms.pocket.isDark/contains/emitters` inside the pocket. `noSpawn` is a getter that is true unless the loaded
  facility theme is `backrooms`, so the generic spawner never puts them anywhere else; the pocket spawns them directly.
- Pocket hunters are now **weighted** (Smiler 45, Pale Hound 40, Partygoer 15) - the Partygoer is a Level Fun native and only
  strays in; Moths are never pocket hunters.

## Entities
- **Smiler** grin in the dark, holds still in a flashlight cone and backs away, bites when you are close and unlit; only
  advances through dark cells (waits at the edge of the light).
- **Pale Hound** blind, hunts by SOUND (`M.hear`): sprint / loud items / voice -> charge, walking -> slow sniff, crouch -> nothing.
- **Partygoer** "=)" face, waves, honks, then shuffles after you and hugs: held + squeezed (DoT, harder after 10 s) until you mash
  [E] (`brstruggle` request, 7-14 presses by level) or a teammate hits it off.
- **Moth Swarm** orbits lamps, swarms lit flashlights.

## Liminal (new)
- **VHS overlay** (`game.liminal`): shown while the local camera is in the pocket or inside a backrooms facility. Noise canvas
  (240x135, 14 Hz), CSS scanlines + vignette, rolling tracking band, occasional colour-slice glitch (more often while the pocket
  hunt is on), DOM caption: blinking REC, PLAY tape counter, battery, level name (from brlevels), camcorder date stamp
  derived from run seed + day. `prefers-reduced-motion`: no band / glitch, 4 Hz noise. `game.liminal.setVhs(true|false|null)`
  forces it. backrooms.js keeps its old simple overlay only when this module is missing.
- **Photo painter** `paintLiminalPhoto(canvas, seed, {scene, develop, stamp})`: five one-point-perspective scenes chosen by seed
  (lobby with an occasional far figure or grin, poolrooms, parking garage, school corridor with lockers, party room with a
  smiling face and a cake), grain, colour cast, flash falloff, dust, orange date stamp. `showPhoto(seed)` shows the polaroid
  card and "develops" it (dark -> picture in 5 steps); the `br_polaroid` item (LMB) calls it, and the item model texture is
  painted with the same function. Emits `tfg:photo {seed, scene}`.

## Net (unchanged, all prefixed `br`)
`brEnter` / `brLeave` requests, `brgo` (host -> one peer), `brst`, `brfx` (host -> all), synced `run.br`, `brstruggle` request.
Details in docs/wave1/backrooms.md.

## Tests (node, no browser)
- `node tools/harness/br_pocket.test.mjs`: 300 pockets: deterministic, all cells reachable, EXIT >= 6 cells away on a solid wall
  and never in a dark zone, 18 loot slots; all 5 photo scenes paint through a mock 2D context and are deterministic per seed.
- `node tools/harness/br_i18n.test.mjs`: every `t()` string of backrooms / creatures has TR + RU; entities registered, gated by
  `noSpawn`, drops exist.
- Browser harnesses from the WIP branches (NOT run this round): `tools/harness/br_noclip.js`, `br_noclip_mp.mjs`, `br_entities.js`.

## Known issues / next
- Nothing here was seen in a real renderer this round: check the VHS caption size on small screens, the polaroid card, and the
  five photo scenes by eye (`kefal.game.liminal.showPhoto(seed)` in the console with different seeds).
- The Level Fun Partygoer seeding and the pocket hunts were only exercised by the WIP branches' headless scripts.
- Body of a player lost in the pocket is not recoverable (by design). Pocket geometry is built on every peer (~0.1 s hitch).
