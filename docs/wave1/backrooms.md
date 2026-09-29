# Wave 1 module `backrooms` — NOCLIP into the Backrooms (pocket realm + Level 0 moon)

Owner request (TR): "oyuna böyle backrooms imgeleri de ekle, backrooms'u da oyuna entegre etmeye çalış".
This module turns the Backrooms into a place you can **fall into** from any moon, plus a handcrafted Level 0 moon.

## What was built
| File | What |
|---|---|
| `src/world/backrooms_plan.js` | Pure, node-testable generator `generatePocket(key)`: 13-15 x 13-15 cells of 6 m, random spanning tree + extra walls / doorless openings / wall stubs, 2-4 open halls with pillars, 2-4 dark zones, strict 3 m troffer grid (lit / flickering / dead), EXIT on a solid wall of one of the farthest cells, loot + landing + decoration slots, NavGrid-compatible `layout`. `pocketKey(seed, day, index)`. |
| `src/world/backrooms_pocket.js` | `buildPocket(plan, {physics, lightPool})`: merged geometry (~8 draw calls), per-vertex **baked light** (troffer field with wall occlusion between cells, injected as emissive into Lambert via `onBeforeCompile`, so dark zones are really dark and flashlights still work), baseboards, corner posts, pillars, outlets, vents, marker graffiti (canvas atlas, rare "=)"), carpet/ceiling stains, puddles, stacking chairs (`tfg_stack_chair` GLB), green EXIT door + lit sign, colliders, `NavGrid`, pooled `LightPool` emitters (group `br_pocket`), `setLight(k)` for blackouts. |
| `src/game/backrooms.js` | `installBackrooms(game)`: glitch wall, noclip cinematic, host membership/loot/hunts/lost, EXIT, HUD, audio, env overrides, creature/walkie/footstep/objectives patches, Level 0 moon, NOCLIP terminal egg, TR strings. |
| `src/game/br_items.js` | Items + procedural models; Almond Water patch. |
| `src/render/br_fx.js` | Glitch patch shader, noclip tear/fall overlay, found-footage (VHS) overlay, procedural sounds (`br_tear`, `br_fall`, `br_hum`, `br_glitch_hum`, `br_exit`), Liminal Polaroid fallback photo card, world marker. |
| `tools/harness/br_noclip.js` | Headless feature test (harness body). |
| `tools/harness/br_noclip_mp.mjs` | Host + client + late joiner test (3 pages, `local` network). |

Visual choices: wallpaper `tfg_backrooms_wallpaper` (chevron stripes + water stains, the most readable of the shipped
backrooms textures), carpet `tfg_backrooms_carpet`, ceiling `gbr_backrooms_ceiling` desaturated to off-white, panels
`gbr_backrooms_light`; fallbacks are the geobuilder keys `wallpaper_yellow` / `carpet_wet` / `ceiling_stained`. Fog is a
yellow haze (`0xa8955a`, exp2 0.034) that darkens with the local light (dark zones fade to black, lit halls to yellow).

## Gameplay
- **Glitch wall**: 0-1 per facility per day (seeded, 35%; `moon.brGlitch` overrides, Level 0 = 100%), on a facility
  `wallSpot` ≥ 2 rooms deep. Animated rift shader showing yellow wallpaper through RGB static, a pooled yellow lamp and a
  positional hum. "Touch the wall [E]" or press against it for 0.35 s. After the first use it stays **open 75 s**
  (followers land next to the first one in the same pocket), then **seals** for the day.
- **Falling off the outdoor map**: crossing y = -150 while falling (only if you were on the outdoor map in the last 15 s,
  not ship/orbit/company/facility) → 50% noclip (`S.forceFall` test hook), otherwise the normal void death.
- **Cinematic** (local): tear (static, warp, RGB slices, rift) 0.95 s → black fall with streaks + wind → teleport when the
  host answered and the pocket is built → thud (camera dip, land_hard) → "LEVEL 0 / You noclipped out of reality."
- **Inside**: bottom-left dock "LEVEL 0 · "The Lobby" · ⌁ NO SIGNAL · ENTITIES: DORMANT/HUNTING", found-footage overlay
  (scanlines, tracking band, vignette, "● PLAY ▶ 00:03:27"), hum ambience (`ambience_backrooms` + procedural 120 Hz
  buzz), carpet/puddle footsteps, random brownout blinks, walkie radio disabled in/into the pocket, objectives
  "Find the green EXIT sign". EXIT door: "Take the EXIT [E]" → facility main entrance (ship door if no facility),
  items in hand come along, +90 XP / 12 Clout "Escaped the Backrooms".
- **Loot** (host, deterministic spots): 2-3 Almond Water, 1-2 Damp Carpet Sample, 1-2 Liminal Polaroid, 3 backrooms
  scrap, 1 EXIT Sign (prefers a dark zone), 30% Level Key (dark zone). Value × (1 + 0.12 · quotaIndex).
- **Items**: `br_polaroid` Liminal Polaroid (rare, strange, 45-95; LMB → `game.liminal.showPhoto(seed)` or the built-in
  polaroid card), `br_exitsign` EXIT Sign (epic, 110-190), `br_levelkey` Level Key (legendary, 180-300; LMB inside →
  EXIT marker with distance for 9 s), `br_carpet` Damp Carpet Sample (common junk, 3-11). `x_almondwater` keeps its value
  but LMB drinks it: +25 HP, full stamina, clears noise/blind, emits `tfg:calm`. Carpet + polaroid also join the
  Backrooms interior scrap table (weights 3 / 1).
- **Hunts**: 200 s warning ("You are not alone on this level."), from 240 s a hunter every 32-52 s up to
  `min(5, 1 + members + age/150)`, spawned ≥ 14 m walking distance from every member (smilers / lurkers prefer dark
  zones). Ids: `br_smiler`, `br_hound`, `br_partygoer` when the entities module registered them, else `lurker`,
  `hound` (forced zone 'in'), `mannequin`.
- **Lost**: when the ship takes off, members get "THE SHIP HAS LEFT" + the pocket blacks out; 3.2 s later the host kills
  them with cause `br_lost` ("got lost in the Backrooms.").
- **Level 0 moon**: `br_level0` "∅-Level 0", tier 3, ▮404, size 1.6, interior `backrooms`, biome `br_liminal`
  (= `moor` with a yellow tint/sky/fog, lamp posts / fences / ruins), scrap 18-24 ×1.3, glitch wall guaranteed.
  Creature table uses backrooms-flavoured existing ids + `br_smiler/br_partygoer/br_hound` (registerMoon does not validate
  ids; the host filters unknown ids at spawn time, so they appear as soon as the entities module registers them).
- Terminal: `NOCLIP` → "You can't do that from here. Try a wall." (help text "???").

## Net messages (all host-authoritative)
| Type | Dir | Data |
|---|---|---|
| request `brEnter` | client → host | `{r: 'spot'|'fall'|'debug', p: [x,y,z]}` (claimed position trusted if within 30 m of the last seen one; `debug` host-only) |
| request `brLeave` | client → host | `{r: 'exit'|'kick'}` |
| `brgo` | host → one peer | `{ok, k, p, yaw}` or `{ok: false, why: 'phase'|'dead'|'sealed'|'far'|...}` |
| `brst` | host → all | `{k}` build (or `k: 0` unload) the pocket **now**, sent after `run.br` and before any loot |
| `brfx` | host → all | `{k: 'noclip', id, p}` (static burst + chat line for others), `warn`, `hunt`, `lost` |
| `run.br` | synced run field | `{d: day, n: pockets opened today, k: key|0, m: [peer ids], sp: 'idle'|'open'|'sealed', hunt}` |

Every peer builds the same pocket from `k`. Late joiners build it on `mapLoaded` (inside `onWelcome`, before the
welcome's items are created). The host drops members that died, disconnected or stayed outside the pocket for 6 s, and
unloads an empty pocket after 4 s unless the wall is still open (creatures + world items inside are removed first).
`run.br` is cleared in orbit.

## Soft interfaces
- `game.backrooms = { inPocket(peerId?), pocket, spot, state, enter(reason), exit(), hostSpawnHunter(type?), debug, dispose }`
- `game.mods.emit('tfg:backrooms', { phase: 'enter'|'exit', who, key })` on every peer (diff of `run.br.m`).
- `game.mods.emit('tfg:calm', { who, t })` when Almond Water is drunk.
- Uses `game.liminal?.showPhoto?.(seed)` if the liminal module provides it.
- Instance patches (restored on dispose, chained to whatever was there): `creatures.nav / playersFor / placeAt`
  (creatures standing in the pocket use the pocket NavGrid, see only pocket players and stay on its floor; facility
  creatures ignore pocket players), `game.hasActiveWalkie`, `game.deathText`, `game.updateAmbience`, `game.footstep`,
  `objectives.compute` (hides facility-distance hints inside). Env overrides while the camera is in the pocket:
  `env.interiorFog`, hemisphere/ambient intensity + colour (restored on leaving).

## Numbers (headless, shared 4-CPU box)
- Pocket build: plan 1-8 ms, geometry 53-100 ms, buffers/nav/emitters 12-37 ms (total ~75-130 ms after warm-up).
- 182-225 cells, ~700-900 troffers, ~630-780 pooled emitters, ~670-750 colliders, 37-44k tris, scene draw calls 33-44
  inside (facility included). Generator: 200 keys, 0 unreachable cells, spawn → EXIT path always found, exit ≈ 13 cells.
- `br_noclip.js` (last run): spot prompt ok, cinematic 3.0 s, in pocket, loot 10/10 resting on the floor, walkie blocked,
  exit path 53 m, hunter uses pocket nav and moved 26 m, Almond Water 40 → 65 HP and consumed, fall noclip ok (roll
  forced), lost → dead with `br_lost`, back in orbit with `run.br = null`, errs [].
- `br_noclip_mp.mjs`: client noclip → same key on host + client, 11/11 loot on the client floor, dock shown; late joiner
  builds the same key with 11/11 loot on the floor.

## Known issues / notes
- Harness bodies (`br_noclip.js`, like `smoke_land.js`) end with a top-level `return`, so plain `node --check` on them
  reports "Illegal return"; they check fine wrapped in a function (`(echo "export default async () => {"; cat f; echo "};")`).
- The multiplayer test needs sticky peers (init script) and a long wall-open time on this overloaded machine: a
  synchronous map build can stall a page > 5 s and the `local` transport then drops the peer. Not a module issue.
- 403s in the logs are font files outside the worktree's Vite fs root (node_modules symlink), not this module.
- Pocket geometry is built on every peer when the first player enters (spec); on slow machines that is a ~0.1 s hitch
  for players who are not inside. Could be made lazy for clients (the host simulates pocket items) if it matters.
- Hunters are fallbacks until `brcreatures` registers `br_*`; their behaviours inherit the pocket nav patch.
- Body of a player lost in the pocket stays there until the pocket unloads (not recoverable, by design).
