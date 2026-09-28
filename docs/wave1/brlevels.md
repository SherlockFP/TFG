# Wave 1 - `brlevels`: the Backrooms, Level 0 overhaul + sub-levels

Owner request (TR): "oyuna böyle backrooms imgeleri de ekle, backrooms'u da oyuna entegre etmeye çalış".
This module makes the `backrooms` interior theme read as the Backrooms at a glance and turns parts of it into the
other famous levels. Everything is deterministic world gen (same on every peer) plus local-only cosmetics.

## What you get in game
| Level | Where | Look / feel |
|---|---|---|
| **LEVEL 0 - THE LOBBY** | the default maze (corridors, open zones, yellow rooms) | strict 2 m grid of bright troffer panels (some dead, some flickering), procedural mono-yellow chevron wallpaper, baseboards, damp mustard carpet with stains, off-white drop-ceiling tiles with water rings, low ceilings (2.85-3.05 m), uniform flat "baked" light, faint yellow haze instead of black fog, pillars, short free-standing wall stubs, outlets, vents, rare red EXIT signs, rare wet-floor signs / lone stacking chairs, loud fluorescent hum |
| **LEVEL 1 - HABITABLE ZONE** | room types `l1_hall` (big, 4.6-5.4 m) / `l1_store` | concrete warehouse, shelf rows + crates, hanging tubes that flicker, dark translucent puddles, SECTOR stencils + hazard stripes, grey haze, drips |
| **LEVEL 2 - PIPE DREAMS** | room type `l2_pipes` (2.6-2.8 m) | serpentine partitions turn the room into narrow tunnels, pipes on every wall (3 heights) + ceiling runs, valves, gauges, caged orange bulbs, steam jets (setpieces `steamRooms`), dark brown haze, pipe groans + hiss |
| **LEVEL 37 - THE POOLROOMS** | the hub room (always) | shallow rippling water over most of the floor (wading = water zone), white-tiled colonnades with round arches, bright cold panels, pale cyan haze, water lapping loop |
| **LEVEL FUN =)** | rare (~38 % of facilities): one yellow room | balloons (ceiling + floor), festoon garlands, streamers, confetti over the carpet, HAPPY BIRTHDAY banner, red "=)" graffiti, party table with a cake + hats, a warped music box playing from the room (3D) + party-blower honks |
| **LEVEL ! - RUN FOR YOUR LIFE** | rare (~34 %): the longest straight corridor (>= 5 cells) | dead panels, pulsing red emergency lights + beacons, red floor LED strips, RUN graffiti + arrows, siren on entry |
| **THE MANILA ROOM** | very rare (~8-14 %): a small Level 0 room far from the entrance | every arch walled up (looks like plain wall outside) except one narrow 0.82 x 2.0 m slot; manila wallpaper, red carpet, one warm lamp, a desk with a guaranteed prize, a note ("DO NOT TELL THE ALGORITHM"). The slot is too narrow for most creatures: a secret safe room |

Found-footage caption bottom-left (under the chat log) when you walk into a level: `● REC  SP  03:12:44 AM`,
typewriter title with RGB split + scanlines, a subtitle line, a short burst of tape noise. Once per level per day.
All strings EN + TR (`addTranslations`).

## Files
- `src/world/interiors/backrooms.js` (owned) - theme definition (room types, heights, styles, layout rules) and
  `decorate(ctx)`: troffer grid, material swap, baseboards/decals, pillars/stubs, Level 1/2/37/Fun/!/Manila dressing.
- `src/world/interiors/backrooms_levels.js` (new) - **pure** planner `planBackroomsLevels(L, {dark, force})`
  (memoised on the layout as `L.brPlan`), `LEVELS`, `levelIdAt`, `reachableCells`. No THREE/DOM.
- `src/world/interiors/backrooms_tex.js` (new) - procedural canvas textures (wallpaper, carpet, ceiling, manila,
  red carpet, 512 px detail atlas), shared materials, and the **baked light** shader hook (`bakeMaterial`, `BAKE`).
- `src/game/brlevels.js` (new) - runtime module `installBackroomsLevels(game)`.
- `src/game/game.js` - only the two placeholder lines (`[import:brlevels]`, `[slot:brlevels]`).
- `tools/harness/br_levels.js` (headless feature test), `tools/harness/br_levels_paths.mjs` (node layout test).

## How the look works (numbers)
- **Troffers**: 4 per 4 m cell (0.67 x 1.33 m, one ceiling tile wide) on a 2 m lattice; ~5 % dead, ~4 % flickering
  (shared material, colour toggled by the runtime). The facility's `ceiling_panel` corridor props + their lights are
  removed in decorate; the downloaded `tfg_backrooms_pillar` models are swapped for wallpapered boxes (same footprint,
  the facility keeps their collider).
- **Pooled lights stay sparse**: one emitter per 2 x 2 cells in Level 0 (~130 emitters in a size-1.2 facility, same
  order as before: 110-138). The flat look comes from a **per-vertex bake** instead: after `mapLoaded` the runtime
  writes a `bake` colour attribute on every static lit mesh of the facility (level meshes, merged props, doors, my
  meshes) from the plan (cell light x level colour; walls brighter towards the ceiling, props darker near the floor,
  corners averaged only across open edges so light never bleeds through walls), and swaps in a material clone whose
  shader adds `albedo * bake * BAKE.value` to the emissive term. Flashlights still work in dark zones (bake 0), a
  power cut fades `BAKE.value` to 0 (all baked light and the panels go dark), breaker rooms (hazards.js) are baked
  dark and their panels switched off until the breaker is reset (re-bake ~40 ms, once per reset).
- **Fog/ambient per level** (runtime, lerped ~1 s): Level 0 `0xb4a45e` / 0.032, Level 1 `0x707780` / 0.04,
  Level 2 `0x1e140a` / 0.07, Poolrooms `0xd2ecf0` / 0.022, Fun `0xc4a494` / 0.03, Level ! `0x3c0806` / 0.05,
  Manila `0x8a7050` / 0.045; standing in an unlit cell pulls it towards `0x100d08` / 0.07 ("eyes adjusting").
  Ambient light 0.05-0.36 by level so players/items/creatures are not black silhouettes (restored to white/0.012 on
  leaving: verified by the test).
- **Draw calls** (mean of 14 random views, 3 layouts, same method, before -> after): 112 / 77.1 / 77.1 (mean 88.7)
  -> 78.7 / 86.9 / 72.6 (mean 79.4) = **-10 %**. My extra meshes: `atlas` (frames, baseboards, decals, pipes,
  balloons...), `lit`, `flicker`, `beacon`, `water`, `puddle`, `manila`, `redcarpet` - the last five only when that
  level exists; pillars / stubs / sealed arches / pool arches / Level 2 partitions are appended to the facility's own
  merged wall meshes (0 extra calls).
- **Rarity** (node, 500 layouts, odd seeds forced): natural chances `CHANCE = { fun: 0.38, run: 0.34, manila: 0.14 }`;
  Level 1 appears in ~83-92 % of facilities, Level 2 in ~73-88 %; ~15-22 pillars and ~6-9 stubs per facility.

## Soft interfaces (for other modules)
- `game.brlevels = { LEVELS, levelAt(pos) -> 'l0'|'l1'|'l2'|'pool'|'fun'|'run'|'manila'|null, current, plan, stats, caption(id), dispose() }`
- `game.mods.emit('tfg:brlevel', { id, prev, first, local: true })` when the LOCAL player enters another level
  (`first` = first time this day). E.g. spawn Partygoers when `id === 'fun'`, Hounds in `'run'`.
- `layout.brPlan` (after the facility build): `cellLevel` (Uint8Array, `LEVELS[i-1]`), `cellLight`, `fun.room`,
  `run.cells`, `manila.{room,slot,sealed,loot}`, `pillars`, `stubs`, `l2walls`, `counts`.
- Reusable look for the sibling Backrooms modules (noclip pocket etc.): `brMaterials()` / `brTexture(name)` /
  `atlasUV(region)` / `bakeMaterial(mat)` from `src/world/interiors/backrooms_tex.js`.
- Debug: `window.__brForce = { fun: true, run: true, manila: true }` before landing forces the rare levels.

## Net messages
None. Level plan, geometry, captions, audio and lighting are deterministic or local. The only host action is the
Manila Room prize: on `moonPopulated` the host spawns a gold bar / ring / figurine / trophy (value x2.2 + 0.15 per
quota) and two Almond Water (`x_almondwater`, if registered) on the desk through the normal item stream.

## Tests
- `node tools/harness/br_levels_paths.mjs 100` - 100 seeds x sizes 0.8/1.2/1.6/2.0/2.6 (500 layouts, odd seeds force
  the rare levels): rasterises walls (10 cm, doorway widths), pillars, stubs, Level 2 partitions, Manila seals + slot,
  grows solids by ~the player radius and flood-fills from the entrance. Last run: **0 fails**, 330 844 cells all
  reachable (10 863 pillars, 4 587 stubs, 2 773 Level 2 partition edges, 248 Manila Rooms), no stuck pockets, every
  Manila seal tight, plan deterministic, 45-65 s. (Mutation-checked: a 3.9 m pillar and a 0.5 m slot are both caught.)
- `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5201 --script tools/harness/br_levels.js`
  (seed 1337 has every level): all 7 levels entered, `tfg:brlevel` events `l0* l1* l2* pool* fun* run* l0 manila* l0*`,
  `levelAt` agrees with the plan 68/68, caption element shown, per-level ambience layers (`brlhum`/`brl`), siren +
  music box + lapping loop played, breaker reset re-bakes (dark rooms 1 -> 0, 40-80 ms), leaving for a mineshaft moon leaves
  no trace (ambient white 0.012, fog not ours, BAKE 1, no `brl*` layers), `errs: []`.
- `tools/harness/smoke_land.js`: `errs: []`.

## Known issues / next
- The two harness scripts are async function *bodies* (top-level `return`, like `smoke_land.js`): `node --check`
  cannot parse them; they were syntax-checked with `new AsyncFunction(code)`.
- Items and creatures are not baked (they get the per-level ambient + pooled lights), so they are a bit darker than
  the flat-lit walls - reads fine, even slightly eerie.
- Level 2 rooms are rectangles split into lanes (4 m wide) - narrower true pipe corridors would need layout support.
- The Manila Room seal only uses arches; rooms with a door on the perimeter are never picked.
- Headless screenshots use the fallback monospace font (VT323 comes from Google Fonts, blocked in the sandbox).
- The caption sits bottom-left under the chat log instead of in `hudDock('left')` (that dock column overlaps the
  chat/system log where the landing briefing text appears).
