# Wave 10 - MOONS10 (module `moons10`): two outdoor-identity moons

Owner complaint: "soulless, low budget". Both moons are places you can describe in one sentence, have a silhouette you recognise from the ship, a sound, and a small
scene with a note in the TFG voice. No network messages: everything is seeded local presentation (layout + colliders come from the map seed on every peer).

| | 503-SERVICE UNAVAILABLE (`x503`) | ∞-FEED (`x8feed`) |
|---|---|---|
| route board | tier 4, cost 800, x1.8 scrap (below 404 x2.0), opens with the Deep Feed (quota 5) | tier 3, cost 380, x1.45 scrap, joins the **quota-3 rung** (with Panelka + Cold Storage) |
| place | frozen tundra of dead data centers, cold blue palette, snowfall + gusts | dune desert (terrain `dunes`), sunset-magenta palette, hot-pixel motes |
| interior | `funhouse` | `deadmall` |
| outdoor pool | Trolls (hound) 12, Influencer 6, Deepfake 5 (+ the Clickbait / Reply Guy extras) | The Worm (sandkefal) 9, Troll 4, Deepfake 4, Influencer 2 |
| weather | clear, foggy x2, stormy, eclipsed | clear x3, eclipsed, foggy |
| landmarks | 3 cooling towers (one collapsed) venting steam sprites, 2 roofless data halls you can walk into, the collapsed satellite dish (bowl 40 m across, one rim buried) | 26 fallen phone monoliths (frozen posts, half flicker), the colossal cracked phone at the horizon (64 m, beyond the entrance), a giant USB plug + its cable, ~34 floating red notification badges |
| story beat | the last technician's hut under the dish: heater, monitor stuck on 503, 41 tally marks, a note (`E` reads it) | a seated hoodie figure facing a live slab, a phone in its hands, a note taped to the chair (`E` reads it) |
| loot | scrap at the hut door and in the first data hall | scrap next to the figure and a monolith |

## Files
- `src/game/moons10_core.js` - pure: biomes (`tundra503`, `feed8`), the two `registerMoon` calls (at import, every peer), `PALETTES` entries (soul keeps the authored biome, only the post saturation is applied),
  route-board data (`HOOKS`, `SILHOUETTE.tundra503/feed8`, `ladderAdd`), the seeded layouts `planTundra` / `planFeed` (own RNG streams per element, avoid / path / entrance / ship clearing aware).
- `src/game/moons10_text.js` - every string EN/TR/RU (`TX`); canvas text is looked up with `tx(key, lang)`, the rest goes through `addTranslations`.
- `src/world/moons10_decor.js` - biome decor builders (registered with `registerDecor`): one voyage `Kit` per map (2 merged meshes for all solids + glow), a few instanced meshes, pooled emitters only.
- `src/game/moons10.js` - runtime: the `E` note reader (existing `m2_note` reader, toast fallback), the outdoor ambience bed (tundra = wind, no crickets).
- `tools/harness/moons10.test.mjs` - 365 checks (registration, ladder / cards, TR/RU, interiors fallback, deterministic layouts over 8 seeds, decor builds on a stub terrain, painters on a fake canvas).

## Interior fallback
`moon.interior` is a getter: `funhouse` / `deadmall` once `moongen.interiorAvailable(id)` says the theme registry knows it, else `factory` (a throwing probe also gives `factory`). Resolved at landing time, so the
other interior module can land in any order. The card silhouette is the moon's own (`cardSil`), independent of the interior.

## Shared-file edits (all one-liners)
`routeboard_core.js` (`ladderAdd(q, ids)` for the Feed's rung), `routeboard.js` (`m.cardSil || m.interior` for the card art), `game.js` (import + slot).

## Sound
Tundra: wind layer follows the gusts (0.2-0.7), `pipe_groan` from towers / the dish, `hdd_click` + `bios_beep` from the live rack in a hall. Feed: `light_flicker` ticks near a flickering monolith,
`ui_notify` pings from a distant badge, `spark` from the plug, night crickets replaced by low wind. All positional (`audio.at`), all guarded with `audio.has`.

## Knobs
`planTundra` / `planFeed` (counts, radii, distances), `gustAt` and the `motes` calls in the decor, `TX`, moon defs (tier / cost / scrapMul / creatures), `FEED_RUNG`.

## Not verified (no browser in this pass)
Every look: palette readability at day / dusk / night, the dish bowl orientation and how deep the front rim sits, tower scale against the 0.86 x map, steam sprite size / opacity, screen textures at distance, the
colossus's visibility through the fog cap, badge point size, hut interior fit, flicker feel. Slab colliders ignore the small tilt. Performance on Low (`propFar` 85 hides far sprites only).
