# Wave 10 - LABYR10: The Dead Mall + Mirror Funhouse

Two new labyrinth interiors on top of the existing facility generator (no fork of `facility.js`). Ids are fixed: **`deadmall`** and **`funhouse`**.
A moon definition with `interior: 'deadmall'` / `'funhouse'` picks them up through the interior registry (`world/interiors/index.js`), same as metro / prison / tower.
Identity: a company crew surviving inside the live stream of The Algorithm - abandoned retail and a viral challenge that never ended.

## What ships

| | The Dead Mall (`deadmall`) | Mirror Funhouse (`funhouse`) |
|---|---|---|
| layout (`labyr10_plan.js`) | a cross of wide halls: foyer -> atrium at the crossing, E-W promenade (3 cells = 12 m wide), N-S concourse up to an anchor store, shops (3x3 rooms) shoulder to shoulder on both halls, each with ONE arch onto its hall; staff corridors + back-of-house shops from the ordinary generator (`plan: 'wings'`, `arch: 'mall'`, `doorP: 0` so shopfronts are arches) | foyer -> midway hall -> spinning-tunnel room (1 x 8 cells) -> mirror MAZE room (carved by the facility maze code, pushed into `mazeRooms`), a crooked room each side of the midway, random mirror halls / crooked / prize / backstage rooms (`arch: 'fun'`) |
| look | warm-sick fluorescent light (merged ceiling panels + LightPool emitters), terrazzo promenade, peach walls, dead shopfronts with parody brand boards (BLOCKBUSTED, GAMESTOPPED, SPOTIFAIL, FOOT LOCKED, HOT TOPICAL, AMAZOOM, CLAIRES.EXE, ORANGE JULIAN; ~60 % still have a neon frame that flickers), roll-down grilles hung half-down (visual only, bottom edge 2.0 m: arches stay clear), kiosks / planters / benches as a slalom through the halls, food court carpet, cinema | big-top stripes, purple checker floors, carnival bulbs chasing along corridors and the midway (two glow sets that alternate), 4 clown-meme murals, mirror walls (`fh_mirror`: glare + wave lines, NO real-time reflection) with "ghost" reflections of a figure that is not there, free-standing mirror panels in halls, crooked rooms (diagonal wall texture, vertigo floor, canted false ceiling, furniture rolled 8-16 degrees with upright colliders), game booths in the midway |
| hero room | the ATRIUM (7.6 m tall): dry fountain with wishing-well coins and a golden thumbs-up statue, dead palms, dusk skylight, stalled ESCALATOR (a real ramp from `world/stairs.js`, `checkStairs` clean) up to a mezzanine deck with rails and elevated loot spots. **Guaranteed `trophy` spot** inside the basin (`scrapSpots` entry with `item` + `hero`: the host spawns those first) | the SPINNING TUNNEL: flat still walkway, a striped octagonal shell (BackSide MeshBasic, own mesh) turns around it (visual only, `lab.tick`), yellow mouth frames, floor studs. **Guaranteed `figurine` spot** in the middle + 2 ordinary spots |
| sound | `ambience_deadmall` (32 s procedural muzak loop through a "ceiling speaker", HVAC, ballast hum), PA chime `mall_chime` + PA announcements, one-shots (`THEME_ONESHOTS`) | `ambience_funhouse` (28.8 s loop: a calliope waltz that droops off-key, oom-pah bass, the tunnel motor), `fun_honk` one-shot, PA announcements |
| loot | themed `SCRAP_TABLE` / `BIG_TABLES` from EXISTING item ids (register, vhs, memecart, pocketpet... / clownhorn, airhorn, duck, figurine...) | see left |
| atmosphere | fog `0x1a1c0e` d 0.05, atmos bed `deadmall` (chime / flicker events) | fog `0x14061c` d 0.055, atmos bed `funhouse` |

Both: merged static geometry (one `LabBuilder` each: mesh count on par with office / hospital, see the test print-out), no THREE lights (LightPool emitters), deterministic (layout seed + `hash2` of layout coordinates), PSX textures registered by name (`render/labyr10_textures.js`: `ml_*` mall, `fh_*` funhouse, 64 px tiles, signs 128x32).
No net messages: everything runtime is cosmetic and local (PA lines are picked from the run seed, so peers hear the same order).

## Files (all new unless marked)

- `src/world/interiors/labyr10_plan.js` pure planners `planMall` / `planFun` (called through `planLabArch`).
- `src/world/interiors/labyr10_kit.js` door lanes, placement guard (`makeFree`: plain nav floor + outside every doorway lane), `panel` / `frameBars` (wall quads), `tiltBox` (rolled box), used by both decorators.
- `src/world/interiors/labyr10_mall.js`, `labyr10_fun.js` theme definitions + `decorate()`; `labyr10_themes.js` registers both + TR/RU.
- `src/render/labyr10_textures.js`, `src/audio/sfxlib_l10.js`, `src/game/labyr10.js` (runtime), `src/game/labyr10_text.js` (TR + RU, PA lines).
- `tools/harness/labyr10.test.mjs`.
- Shared files touched (minimal): `world/facility.js` (declare `mazeRooms` before the theme plan + pass it in the `planLabArch` ctx: 2 lines moved/edited), `world/interiors/lab_themes.js` (`planLabArch` forwards to `planLab10`, +1 import), `world/interiors/index.js` (+2 lines), `audio/sfxlib.js` (+2 lines: import + `installL10`), `audio/extassets.js` (+2 one-shot sets), `game/game.js` (own import + slot).

## Knobs

`planMall`: atrium width (`aw` 5 / 7 cells by size), promenade rows (3), shop size 3x3, concourse start row. `planFun`: tunnel length (`tLen` 8), maze size 7x5, `mazeStyle`. Decorate: kiosk kind thresholds (0.42 / 0.72), shop board `on` probability 0.6, grille probability 0.55, mirror ghost chance 0.16 (halls) / 0.2 (maze walls), mural chance 0.11 (max 16), shell radius `RAD` 2.1, chase rate 2.2 Hz (`lab.tick`), PA gap 50-110 s (`labyr10.js`).

## Test

`node tools/harness/labyr10.test.mjs` (~2 min): 3 seeds x 2 sizes per theme: every cell reachable (locked doors closed), fire exit, plan rooms exist, real build, hero item spot walkable, scrap / spawn spots, nav path entrance -> hero + sampled spots (entrance OR outdoor-twin fire exit, the generator's own rule), every open arch / unlocked door crossed on the nav grid (no detour > 11 m), none of the theme's own solids inside a door lane, mesh count <= 1.25 x the largest of office / metro / hospital, escalator `checkStairs` + top meets the deck, brand boards face into a hall, funhouse shell spins / chase sets exist, determinism (same seed twice), sounds render at 8 kHz (finite, not silent), TR + RU for names / blurbs / PA lines, stub-game runtime (loot tables, atmos beds, PA, neon flicker, shell turns, no PA when nobody is inside).
Neighbours re-run green: `geomfix` (4 seeds, all themes: propOverlap 0, blocking 0), `labyrinths`, `stealth_maze` (18 themes x 200 seeds), `facjobs`, `worlds3`, `maps2`, `repomaps`, `mazegen`, `sound2`.

## Known gaps / NOT verified

- Never seen in a browser: proportions of the 12 m halls (they may read empty), kiosk / grille / sign scale, escalator feel (ramp 26.6 deg, rails), spinning shell scale and clipping when standing at the walkway edge, mirror texture taste, murals, carnival chase speed, ambience loops (rendered in node only).
- Halls carry only the slalom furniture, not wall props; the food court / cinema are ordinary generator rooms with row props.
- Random staff-corridor stubs from the comb / repair step can still pierce a shop or tunnel wall (harmless extra doorways, same as the metro tunnel).
- The escalator mezzanine is skipped on the 5-cell atrium (size < 1.4). The decorative shell does not react to players; nothing in the funhouse hurts you - it is atmosphere plus the guaranteed hero loot.
- Bosses (`cycle_core BOSS_TABLE`), codex and the endless moon generator have no entries for the new ids (they fall back to `factory`), same as the repomaps themes. Moons that use the ids are added by the moons10 module.
