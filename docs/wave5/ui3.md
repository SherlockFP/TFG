# UI3 - HUD overlap fixes + the remaining panels on the ui2 look (module: none, CSS layer `tfg-ui3`, wave 5)

Scope from the checkup (docs/wave4/checkup.md "Bugs remaining" 3-9) plus "move the remaining panels onto the ui2 base classes / look, no
functionality changes". Everything visual is behind class `tfg-ui3` on `<html>` (added by `src/ui/theme.js`, rules in `src/ui/ui3.css`,
every selector starts with `html.tfg-ui3`, checked by `tools/harness/ui3.test.mjs`). Remove the class in devtools to see the old state.

## What changed

| # | Bug | Fix | Verified |
|---|---|---|---|
| 1 | Mirror timer + reflection bar drawn over the clock / quota / compass | `.mr-timer` top 14 -> 112 px, `.mr-meter` 92 -> 196 px (smaller clock digits), 720p variant | screenshot: clean |
| 2 | Compass prints SHIP and ENTRANCE on top of each other | `src/ui/compass_labels.js spreadLabels()` pushes coinciding captions apart sideways (order kept, inside the tape); used by `HUD.drawCompass` | node test only (see gaps) |
| 3 | "THE ALGORITHM - LIVE" banner over open panels | banner `z-index` 25 -> 15 (panels are 20) and `#ui:has(> .overlay:not(.hidden)) .algo-sub` hides it while a panel is open; hard shadow instead of glow | CSS only, banner had already expired in the shots (see gaps) |
| 4 | Backrooms VHS caption covers hotbar slots 3-5 and the body icon | liminal captions got classes (`lv-rec/bat/play/stamp`); REC + BATT sit under the clock, the date moves to the bottom-left next to PLAY | screenshot: clean |
| 5 | `▮` is a white box in the QUOTA MET font | not reproducible after ui2 (screenshot shows a normal narrow credit sign in both states). Added `font-synthesis: none` + regular weight on `.qm-rows b` so the one-weight credit face can never be faux-bolded again | screenshot |
| 6 | "Tester is now a Enforcer" | `aAn()` in `core/util.js`; toast key is now `{n} is now {art} {name}.` (TR/RU entries added in rpg.js; TR/RU do not use the article); chat broadcast, `aptitudes.js` reroll msg and `rpgctl.js` msg use it too | `ui3.test.mjs` |
| 7 | Hotbar name over item / stray "LIGHT" | item name is now one strip (single line, ellipsis, dark plate) above the battery / durability bar; icon 44 px. The stray label could not be found in code or in the DOM dump (`Pro Flashlight` wrapping to `FLASH / LIGHT` in the 2-line clamp is the likely cause) | screenshot |
| 8 | Shipyard / forge footers repeat key hints | `ui.panelFoot()` skips an extra hint whose key or label is already in the default row (`ESC BACK`, `E CONFIRM`) | screenshot (forge before: 5 hints, after: 3) |

Also fixed while looking: selected `.btn.chip.sel` tabs (social hub PLAYERS tab) were dark ink on a dark plate (ui2 `.menu-frame .btn` background beat `.chip.sel`); pets panel title stretched over the full width and had no tape.

### Panels moved onto the ui2 look (CSS classes only, no logic)
shop (coloured top edge instead of gradient tile + left bar, flat icon well), forge + shipyard (tier colour as an inset edge on hover/selection, no glow, condensed names), pets (edge selection, segmented bar, 14 px tags, tape under the plate title), homeworld + homeworld2 (edge hover), trade (flat tier tiles, no pulsing, no glow lamps, segmented bar), survival crate / stove (needle marker without glow), daily (no pulsing glow, flat crate tile, 14 px "NEW"), social hub (square lamps, hard toast), plus `border-radius: 0` for everything inside `#ui .overlay`. Settings, skill tree and the other `ui.frame()` panels were already on the base classes (checked in the shots).

### Emoji -> pictograms
`src/ui/glyphs.js` gained `glyphify(html)` (swap the leftover symbols in an already escaped HTML string), and `glyphEl(name)` (a span for `el()` children). Converted: homeworld + homeworld2 (bolt / snow / gear / flame in power, cooling, costs, chips), crafting (lock, blueprint book), profile (lock on frames, camera on TAKE SNAPSHOT), wardrobe (lock, check), shop (van / gear icon), spellbook (mic), forge (bolt + overclock icons). `▮`, `◈` and the arrow characters stay (own fonts). The overlay observer in `ui.js` that blanks emoji is untouched.

## How to test
```
node tools/harness/ui3.test.mjs           # a/an, spreadLabels, glyphify, no emoji left, every ui3.css selector is scoped
node tools/harness/ui2_glyphs.test.mjs
npm run build
npx vite --port 5197 --strictPort &       # from the worktree root
flock /tmp/tfg-browser.lock node tools/harness/ui2_shots.mjs --port 5197 --out docs/wave5/ui3 --sizes 1280x720,1920x1080 --only ui3
```
`--only ui3` freezes the rAF loop, gives the player five hotbar items, then captures per size: `hud_compass`, `hud_algo`, `hud_algo_panel`,
`hud_mirror`, `hud_vhs`, `quota_met` and 12 panels. `before_*` = `tfg-ui3` removed (state re-created, so JS-side fixes show up too), `after_*` = on.
1920x1080 keeps "before" only for the HUD states (`--ui3-before-big` adds the panels). JPEGs are re-encoded until <= 150 KB. Output: `docs/wave5/ui3/`.

## Screenshot review (honest)
- Looked at (1280x720): mirror, VHS, QUOTA MET, shop, forge, shipyard, pets, daily, stove, hub, tree - before/after as described above. 1920x1080 shots were written but only spot-checked by file, not read.
- The homeworld / homeworld2 shots are not in the folder: `open()` did not open a panel away from the homeworld (the shots showed the plain HUD, so they were deleted). Trade needs a live session and was not captured. The crate panel opened but was not compared.
- The compass shot has no compass: the player was still inside the ship, so `hud_compass_*` only shows the hotbar change. The overlap fix is covered by the node test of `spreadLabels`, not by a picture.
- The Algorithm banner had already expired in the panel shots (before also has none), so the z-order fix is unverified visually; the `:has()` rule is plain CSS.
- Edits made AFTER the run and not re-shot: hotbar name font (condensed face, so "Walkie-Talkie" fits), QUOTA MET headline glow, pets title/tape, hub chip tab fix. The `after_*` files show the run state, not these final tweaks.
- `NEXT QUOTA ▮NaN` in the QUOTA MET shots is the test payload (no `quota` field), not a game bug.
- Console noise in the run: 403 for one resource and blocked nostr WebSockets (sandbox proxy), no page errors.

## Known gaps
- Text-only glows inside panels are still handled by the old blanket `#ui .overlay * { text-shadow: none }`; panels that mount outside `#ui` are not covered.
- `panelFoot` dedupe compares key or label, so a panel that deliberately wants `E CONFIRM` next to `ENTER CONFIRM` loses the second hint (forge does; ENTER still works there).
- The a/an helper is English-only on purpose; TR/RU strings do not use an article.
