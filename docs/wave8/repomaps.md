# Wave 8 - REPOMAPS: themed interiors (module `repomaps`)

Owner: "add R.E.P.O.-style maps to the labyrinth/interior places, and stop being a Lethal Company clone."
Idea taken: a hand-themed, room-module level with a strong identity, readable silhouettes, physics-comedy props and fragile valuables.
Nothing else is taken: every name, texture and prop is TFG-original and tied to the Algorithm's live stream (corporate horror).

## The four themes (interior ids)

| id | name | moon | look | signature mechanic |
|----|------|------|------|--------------------|
| `influencer` | Influencer Mansion | `m5est` E9-Estate of the Departed | pink/gold wallpaper, velvet carpet, marble, chandeliers; studios with ring lights + neon backdrops, trophy rooms, lounges, vanities, juice bar; atrium hub | **VIRAL** loot grows in value while carried (+0.6 %/s of base, x2.5 inside a studio, cap 140 %); bumps still cost value |
| `academy` | Content Academy | `palamut` 33-Guestbook | cream/green school walls, linoleum, wainscot, lockers; lecture halls (rows of desks + blackboards), detention, cafeteria, locker rooms, principal, assembly quad hub | **Sliding library shelves** on floor rails: bell toast 5 s ahead, then everybody moves them (every 40 s while someone is inside; the host waits while a player stands in the destination) |
| `colddata` | Cold Storage Data Station | `m5cold` C0-Cold Storage Vault | frost panels, ice floors, frosted racks, ice columns, cryo bay (m5 pods), warm control room; freezer / cold aisle / ice hall | **FROZEN** loot thaws (1.6 %/s of base) in warm station rooms (entrance, control, generator, vault) and 0.4 %/s outdoors; corridors / freezers / ship are safe. **Freezer + ice-hall floors slide** |
| `museum` | Museum of Deleted Content | `orkinos` 404-Not Found | white gallery walls, dark polished floor, glass cases, stanchions, framed "deleted" posts, redacted banned wing, archive, restoration lab, gift shop; rotunda hub | **Laser-grid corridors** (hazards.js LASER_RATE museum [2, 1.6]) + **ART** loot sets off the facility alarm (facilitysys.force('alarm') + noise 2.6, 20 s cooldown) when it loses value on the floor or is broken |

Terminal moon lists / HUD show the theme name because it is the moon's `interior` (registry names). A landing title card (name + blurb, 3 s after landing) and a one-line signature tip (9 s later) come from the module. Endless / voyage generated moons do not pick the new themes (`moongen.js INTERIOR_W` is untouched).

## Loot (17 registered items, all fragile: value lost on bumps and drops through the stock `onItemImpact`)

- Influencer (viral): Gold Ring Light, Diamond Play Button, Sponsored Champagne, big Gold Toilet (Sponsored).
- Academy: Antique Globe, Spelling Bee Trophy, Detention Inkwell, Lab Microscope, big Anatomy Skeleton.
- Cold (frozen): Frozen Data Drive, Cryo Vial, Ice-Locked Blade, big Chilled Core Stack.
- Museum (art): Banned Canvas, Cancelled Bust, Framed Deleted Post, big The Last Meme (Sculpture).

Per-theme `SCRAP_TABLE[theme]` / `BIG_TABLES[theme]` = familiar internet junk (existing ids) + the theme's fragile valuables; the stock loot placement picks them up on every peer (tables set at module install, before any world is generated).

## Files

- `src/world/interiors/themes_studio.js` the 4 theme defs (style per room type, room types, layout rules, lamps, posters, footsteps, ambience, atmosphere) + decorate hooks (pink/blue glow emitter per key room; Academy rail shelves: `layout.stShelves`). Registered by 2 lines in `interiors/index.js`.
- `src/models/studio_props.js` 12 `st:` props (ring_light, trophy_case, neon_backdrop, school_desk, lectern, blackboard, rail_shelf, frost_rack, ice_column, glass_case, stanchion, art_frame): unlit MeshBasic glow only, no scene lights, colliders on the floor.
- `src/render/studio_textures.js` 9 `st_*` textures (via the new `registerTexture` export in `render/textures.js`).
- `src/models/studio_items.js` 17 item models.
- `src/game/repomaps_core.js` pure rules + item defs + tables (constants: `VIRAL_CAP`, `VIRAL_RATE`, `THAW_WARM`, `THAW_OUTSIDE`, `ALARM_COOLDOWN`, `SHELF_STEP`, `SHELF_WARN`, `ICE_SLIDE`).
- `src/game/repomaps.js` runtime (host ticks, `rmap` net message, shelf sliding + collider swap, ice slide wrap of `player.update`, title card). `src/game/repomaps_text.js` TR + RU.
- Shared-file edits (tiny, marked `[repomaps]`): `render/textures.js` (+1 export), `world/propfactory.js` (+2 lines `st:`), `world/interiors/index.js` (+2), `world/interiors/hazards.js` (LASER_RATE entries), `game/moons.js` (palamut / orkinos interior + desc), `world/maps5_data.js` (m5est / m5cold interior), `game/game.js` (import + slot).

## Networking

`rmap` (host -> everyone, HOST_ONLY): `{k:'warn', n}` bell toast, `{k:'go', n}` shift number n (slide 1.6 m/s, collider removed while sliding and re-added at the destination), `{k:'set', n}` idempotent resync every 25 s (late joiners jump instantly), `{k:'alarm', p}` banner + sound. Item value changes ride the stock `it val` broadcast. Everything else (layout, shelf start positions, loot) is deterministic from the seed.

## Knobs / how to test

- `node tools/harness/repomaps.test.mjs [seeds]`: registry + moons, 4 themes x N seeds x 3 sizes (reachable, hub, every room type styled + generated), props on the floor with colliders, Academy shelves inside rooms with aisles, items + tables, mechanic rules, TR/RU coverage, and a stub-game install (title card, alarm + cooldown, viral, thaw, ice slide, shelf slide + block + resync, dispose).
- In game (host console): `game.repomaps.shiftNow()` shifts the Academy shelves now; `game.repomaps.state` shows step / stats.

## Known gaps

- Not seen in a browser (jammed queue): the four looks, prop scale next to walls, slide feel, ice slide feel, alarm chain are unverified. First job for the next agent: land on palamut / orkinos / m5est / m5cold and look.
- Themes are re-skins of the facility generator's rectangles, not bespoke set pieces; walls are not palette-tinted beyond textures, fog and lamp colour.
- Bosses (`cycle_core BOSS_TABLE`), codex/achievements and the endless moon generator have no entries for the new theme ids (they fall back to `factory`).
- A shelf can land on a client whose position the host has not seen for ~1 s.
