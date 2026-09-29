# Wave 4 - maps5: Estate 9 + Cold Storage, three new labyrinths, 9 props, 2 creatures

Owner: *"yeni labirentler, yeni maplar, yeni icerikler, yeni modeller"*. Original set pieces for the Dead Feed lore (corporate / data-centre horror, docs/LORE.md), not a Lethal Company copy.
Module `maps5`, installed with `this.useModule('maps5', installMaps5)` (game.js, lines marked `[import:maps5]` / `[slot:maps5]`). `game.maps5 = { generators, info(), stacks(), state, shiftNow(), dispose() }`.
Status: node-tested (`maps5.test.mjs` 18 checks + `maps5_install.test.mjs` 10 checks) + `npm run build`. **NOT seen in a browser**: the headless script `tools/harness/wave4_maps5.js` is written (lands on hamsi / Estate 9 / Cold Storage, drives the ladder, warden, stack shift and sleeper, grabs 13 jpeg views + renderer numbers) but the shared browser queue was ~15 deep, so the lead runs it after the merge. NOT played with 2 real players.

## What is new
| | |
|---|---|
| **Moons** (fixed, registered at import like worlds2) | `m5est` **E9-Estate of the Departed** ("Estate 9", tier 2, cost 320, interior mansion, foggy overgrown estate) and `m5cold` **C0-Cold Storage Vault** ("Cold Storage", tier 3, cost 640, interior serverfarm, blizzard / diamond dust). Both slot in the terminal / route list like any moon (`MOON_ORDER`), scrap x1.35 / x1.55. Not part of generated sectors: they are hand-authored presets. |
| **Labyrinths** (3) | HEDGE MAZE (outdoor, Estate 9), PAPER ARCHIVE (two levels, Estate 9), SERVER STACKS (shifting aisles, Cold Storage). Pure planners in `src/game/maps5_core.js`, exported through `game.maps5.generators` for reuse (voyage / random moons): `planHedge(seed)`, `planStacks(seed)`, `planArchive(seed)`, `verifyStacks`, `archiveSolve`, `wallLattice`, `mazeRoute`, `carveTree`, `bfs`. |
| **Props** (10 ids, `m5:*`) | `filing_wall`, `cryo_pod`, `cryo_pod_open`, `fountain`, `topiary` (4 variants, variant 3 = the gardener), `broken_rack`, `conveyor`, `archive_ladder`, `bench`, `ice_cluster` (`src/models/maps5_props.js`, via `world/propfactory.js`). Merged geometry per material, unlit (MeshBasic) glow only, no scene lights. |
| **Creatures** (2) | `m5warden` Hedge Warden (Estate 9) and `m5sleeper` Cryo Sleeper (Cold Storage) (`maps5_creatures.js`, models in `models/maps5_models.js`). |
| **Items** (5 scrap) | Topiary Heart (hedge prize), Master Ledger (archive prize), Cryo Core (hall + cave prizes), Golden Shears (warden drop 50 %), Frost Film Reel (sleeper drop 35 %). |

## 1. Labyrinths
Every layout is a pure function of the map seed (`siteSeed(seed, 'hedge' | 'archive' | 'stacks')`, RNG from core/rng.js only) so all peers agree with no traffic. Geometry = boxes on the worlds2 `Solids` / `FrameGeo` helpers: **one merged mesh per material key
per set piece, colliders are merged straight wall runs** (a 15 x 15 hedge maze is ~120 collider boxes, not ~450 wall cells).

* **Hedge maze** (`maps5_hedge.js`): 15 x 15 cells of 3.4 m (hedge 1.0 m thick, 3.2+ m high, foliage lumps on top), growing-tree spanning tree + braid loops on dead ends, a 3 x 3 centre chamber (inner walls removed), south entrance gate + a far north
  exit gate (stone posts with lanterns), 3-6 lantern-lit dead-end pockets (small loot). Centre: pedestal with the **Topiary Heart** prize, 3 topiary statues + a 4th spot that IS the sleeping Hedge Warden, 2 benches. Two drifting mist sheets and a fog surge
  (x1.7) while you are inside (zone system in `maps5.js`). Guarantees (200 seeds): entrance reaches every cell, the centre and the exit; entrance -> centre averages 17.8 cells, entrance -> exit 36.6 cells.
* **Server Stacks** (`maps5_stacks.js`): roofed 11 x 11 hall of 3.0 m cells (rack walls 3.7 m). A cycle of 4 spanning trees (ping-pong `0 1 2 3 2 1`) plus a few permanent braid edges; consecutive phases differ by 6 edge swaps, so **~34 walls ever move** (30-36
  over 200 seeds). Because each phase is a spanning tree and the union of two phases is connected, walls are **opened first, closed second**: no aisle set is ever cut off (verified for every phase and every transition, 200 seeds). Movable walls =
  1 instanced mesh (racks) + 1 (warning strips on top, colour per instance) + 1 (floor marks), one Rapier box per wall switched with `collider.setEnabled` (nothing is created / destroyed at runtime).
  The HOST times it (message `m5sw`): first shift 30 s after somebody is within 55 m of the hall, then every 45 s (`STACKS.interval`); `warn` 6 s before (walls flash amber / red, floor marks, klaxon, banner AISLES SHIFTING), `go` lowers / raises them (1.1 / 1.5 s).
  State is absolute (`n` = cycle step) so a dropped message heals; late joiners ask `m5sync`. **A wall never closes on the local player**: within ~0.75 m it waits half-raised until you step away. Lifting the Cold Core (hall prize) starts an
  immediate reshuffle warning. Inside the hall: fog x3.4, hemisphere / sun x0.3, dark blue fog tint, server-farm ambience layer.
* **Paper Archive** (`maps5_archive.js`): roofed 7 x 7 cells of 3.2 m. Level 0 = full maze of 3.25 m book stacks, entrance door south, exit door north. Level 1 (3.6 m up) = two deck islands of 1.3 m low stacks separated by a gap column and joined **only by two
  railed bridges**; island A has one **ladder** (a dead-end deck cell with a railed hatch), island B (reward: **Master Ledger** on a pedestal) can only be entered over a bridge. 3D BFS proves entrance -> reward, entrance -> exit and full coverage
  (200 seeds; also asserted: without the bridge links the reward is unreachable).
  **Ladder** = a climb volume (r 0.58) under the hatch: face it and press W / Space (or E on the prompt) to latch, W / Space = up 3.4 m/s, S / Ctrl = down, no fall damage, gravity cancelled; `Player.update` is wrapped (like worldx) and restored on dispose.
  Not synced for remote avatars (they just seem to rise).

## 2. Zones and their atmosphere
| | Estate 9 (`m5estate`) | Cold Storage (`m5cold`) |
|---|---|---|
| Sky / fog | warm grey-green haze 0x939883, fog 0.026, low pollen drift (fx `spores`), lawn + gravel path | pale blue sky 0x7d9fbf, fog 0.022, diamond dust (fx `sparkle`) + 900 snow flakes, blizzard gusts swell fog / wind (worldx `terrain.wx.gust`) |
| Set dressing | 2 fountains with benches, 2-3 topiary walks (14 statues each, instanced), glowing lanterns along the entrance path, hedge maze, archive | conveyor line, 9 broken racks, 16 ice clusters, snow drifts + ice spikes, 1-2 cryo caves, server stacks hall |
| Audio (extra `m5amb` layer while inside) | hedge: quiet mansion drone; archive: mansion drone | hall: server-farm hum; cave: server-farm hum (low) |
| Interior | mansion (standard facility) | serverfarm (standard facility) |

Cryo cave (`maps5_cold.js buildCave`): 5.2 m ice tunnel + 14 x 15 m pod chamber with 10 pods (2 per cave are OPEN pods that hold a frozen **Cryo Sleeper**), a plinth with the **Cryo Core** prize, glowing strips, stalactites, hazard-striped mouth with steps.

## 3. Creatures (host-authoritative, generic paths give stun / hp scaling / xp / snapshots / days-in-run factor)
| id | HP / dmg / speed | Behaviour + telegraph |
|---|---|---|
| `m5warden` Hedge Warden | 260 / 32 / walk 2.4, run 5.2 (sprint 8.2 outruns it) | **Statue** in the hedge-maze centre. Wakes when a player stays within 3.4 m for 0.6 s, when the Topiary Heart is lifted, when hit, or on a loud noise next to it. **WAKE 1.4 s** (eyes glow, shears clack), then hunts **along the maze corridors** (BFS route through open cells, never through hedges), **0.7 s wind-up** (shears raised) before every cut, cooldown 1.6 s. Does not leave the maze area; 22 s without anybody in the maze -> walks home and freezes again. Drop: Golden Shears 50 %. |
| `m5sleeper` Cryo Sleeper | 170 / 26 / walk 1.4, run 4.4 | Frozen in an open pod (ice shell). Wakes within 4.2 m, when hit, or when its cave's Cryo Core is lifted. **THAW 1.3 s** (shell cracks), slow stiff hunter, **0.6 s wind-up**, 26 dmg + **1.2 s chill** (`hostSlowPlayer`). Leash 28 m around the pod; loses interest after 9 s, walks back and freezes. Drop: Frost Film Reel 35 %. |

Both are `noSpawn` (spawned by `maps5.js` at landing: 1 warden; 2 sleepers per cave) so early zones stay fair: Estate 9 is tier 2 with a single guarded reward, Cold Storage is tier 3.

## 4. Numbers
* Node (stub terrain, `maps5.test.mjs`): Estate 9 = **255 colliders, ~13.0 k tris, 31 meshes** (incl. instanced prop parts); Cold Storage = **191 colliders (+34 movable already counted), ~15.9 k tris, 41 meshes**. Hedge wall runs (colliders) max 124 over 60 seeds.
* Browser (`engine.sceneStats` calls / triangles per view, collider counts, states): not measured yet, run `wave4_maps5.js` (prints `views` with calls + tris for every screenshot label and `baseline_hamsi` for comparison).
* Existing moons for scale: Soviet district 16-27 k tris / 8 merged draw calls.

## 5. Tests
```
node tools/harness/maps5.test.mjs           # 18: 200-seed solvability (hedge / stacks incl. every transition / archive incl. bridge necessity), determinism, collider + draw-call + triangle budgets,
                                            #     collision proof: the REAL box colliders are rasterised (0.4 m body) and flood-filled: hedge gate -> prize / exit / pockets, archive level 0 + level 1 route via ladder and bridges,
                                            #     stacks in EVERY phase with movable colliders switched; stacks runtime warn / goTo / hold; props; moons
node tools/harness/maps5_install.test.mjs   # 10: fake Game: registration, translations, landing population, prize alarms, shift director + late join, ladder wrapper, zone fog, both creature AIs, TR + RU coverage
npm run build ; node tools/i18n_audit.mjs   # 0 missing TR / RU for maps5 (only the data-table display fields, which display.js localizes)
```
Headless (first job for the lead): `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_maps5.js --shot out.png > out.txt` then `node tools/harness/_shots.mjs out.txt shots/` (extracts the 13 jpeg views: hedge_gate / hedge_inside / hedge_centre / warden_awake / archive_l0 / archive_deck / stacks_gate / stacks_inside / stacks_warning / stacks_after_shift / cave_mouth / cave_chamber / sleeper, and prints the numbers). Expect: warden states include wake + run, ladder maxY > deckTop, stack shift walls settle with colliders switched, 0 page errors.

## Knobs
`STACKS` in maps5_core.js (`interval` 45 s, `warn` 6 s, `swaps` 6, `phases` 4, `perm` 0.06, cols / rows 11), `HEDGE` (15 x 15, pitch 3.4, `loops` 0.07), `ARCHIVE` (7 x 7); first-shift delay 30 s and "near" radius 55 m in `maps5.js hostStacksTick`; `CLIMB_SPEED` 3.4;
creature numbers in `maps5_creatures.js DEFS`; moon numbers in `world/maps5_data.js`; zone fog / darkness per zone object (`fog`, `dark`, `tint`) in maps5_estate.js / maps5_cold.js.

## Net
`m5sw` (host -> everyone, HOST_ONLY): `{ k: 'warn' | 'go' | 'set', n }`. Request `m5sync` (peer -> host) answered with `m5sw { k:'set', n }` to that peer. No other traffic: layouts are seeded, creatures / items use the generic paths.

## Known gaps
* Written before it was ever seen by a person: proportions of the hedge lumps, rack texture stretch on the movable walls (server_front on a unit box), archive lighting (emissive strips only), cave silhouette are worth a look.
* The ladder is not animated for remote players; no rung sound; gravity-cancel climb ignores stamina.
* The Hedge Warden hunts only players inside the maze radius; a player who runs out of the gate is left alone (by design), but a player standing on top of a hedge gap cannot happen (hedges have full-height colliders).
* Not wired into generated sectors (`moongen.js` untouched): the moons are presets; the generators are exported for voyage / random moons.
* Cold Storage frozen lakes are disabled (`frozen.lakes = 0`), only the blizzard gusts of the ice biome are reused.
* Sleepers only stand at OPEN pods (2 per cave); sleeping (closed) pods are decoration + loot-free.
