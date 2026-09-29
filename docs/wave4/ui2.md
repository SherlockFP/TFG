# UI2 - one art direction: "company-issued equipment" (module `ui2`, wave 4)

Owner brief: "the UI looks too AI, fix it, make it not look AI". The generic tells were: every panel is the same flat dark
translucent box with a 1 px line, three unrelated fonts (VT323 body, Press Start 2P headings that overflow, an Arial Narrow
fallback for "condensed"), glow text, colour emoji, hover "lift", soft uniform shadows, and no hierarchy between a title, a
section and a tag. Nothing on screen said *what this device is*.

## The direction

TFG is a corporate-horror game: **you are issued equipment by The Algorithm**. So every surface is a worn, stamped,
company device:

| Element | Rule |
|---|---|
| Panels | rack-mounted terminal: hard corners, 2 px steel border + hard double bezel ring (no blur), scanlines, viewfinder corner marks |
| Title | an inverted **label plate** (solid phosphor colour, dark ink, condensed stencil caps) sitting on **hazard tape** (the ONE accent) |
| Section header | stamped small caps, square bullet, dashed rule (`.cp-sec`) |
| Type | VT323 for reading, **Barlow Condensed 700** (Cyrillic: Roboto Condensed 700) for every label/number/title, bundled in `src/ui/fonts/` (OFL, no CDN) |
| Buttons | flat 1 px plates, uppercase condensed; hover = solid invert (no glow); primary = solid fill; tabs = index tabs, selected one filled |
| Cards | flat tiles, coloured top/left edge for rarity or faction, hover = brighter edge (no lift/glow) |
| Bars | segmented gauges (7 px cells) - health-stamina-xp-battery-weight-objective |
| Icons | 24-grid 2 px square-cap SVG pictograms (`src/ui/glyphs.js`), never colour emoji |
| Colour | amber/paper phosphor in game, cold white-blue phosphor on the main-menu monitor (unchanged), hazard yellow accent only on tape / active hotbar slot / clock |
| Motion | unchanged (CRT power-on, flicker); hover lift/glow and tier "shine" animations removed |

## Files

- `src/ui/theme.css` - tokens (`--t-*`), font-faces, shared classes, and every override. Scoped `html.tfg-ui ...` (and `#ui` where the
  wave-3 UX block already used it) so it wins over the panel `<style>` blocks that are injected later.
- `src/ui/theme.js` - imports the css and adds class `tfg-ui` to `<html>` (`main.js`: one import line).
- `src/ui/glyphs.js` - `glyph(name)`, `glyphFromEmoji(str)`, `GLYPH_NAMES` (38 pictograms).
- `src/ui/fonts/*.woff2` - four subsets (~60 KB total).
- Small JS edits: `hud.js` (sun/moon/mic/bolt glyphs instead of text glyphs/emoji), `ui.js` (sound hint + lobby lock glyph), `record.js`
  (`card()` icons: emoji -> pictogram, one line), `index.html` (hazard tape on the loading screen).
- Panel JS was NOT rewritten. Other agents' panels (daily rewards, social hub, arcade, guide, homeworld2, ship2, wardrobe) need no changes.

**A/B switch:** in devtools `document.documentElement.classList.remove('tfg-ui')` restores the old look instantly
(`tools/harness/ui2_shots.mjs --both` uses this to produce before/after from the same page state).

## Base classes for new panels (use these and the panel is on-brand automatically)

```
ui.frame(title, ...children)            // = .menu-frame.crt-panel > .cp-head(.menu-title .cp-sub) + .cp-body + .cp-foot  (plate title + tape + bezel)
ui.panelHead(title, sub) / ui.panelFoot([[key, label], ...])
.cp-sec                                 // stamped section header;  .dim / .dim.note for secondary text
.btn  .btn.primary  .btn.small  .btn.danger  .btn.tab(.sel)  .btn.back  .chip(.sel)     (inside a .menu-frame)
.tabs                                   // row of .btn.tab
.form > .form-row > label + input/select/checkbox/range
.tfg-card / any class containing "card"  // flat tile; set --tc (tier colour) or --rc (accent) on it for the coloured edge
.tfg-plate  .tfg-tag(.solid)  .tfg-kbd  .tfg-num  .tfg-bar > i  .tfg-hazard         // small parts, work anywhere
glyph('lock')  (import { glyph } from 'src/ui/glyphs.js')                              // icons, never emoji
hudDock('right'|'left'|'bottom', id, order)                                           // HUD widgets (src/ui/dock.js), gets border-radius 0
```
Do not: add `border-radius`, `box-shadow` glows, `text-shadow` glows, gradients as card backgrounds, `backdrop-filter`, `font-family:'Press Start 2P'`
(`--font2` now IS the condensed face), emoji, or your own colour palette. Take colours from `--t-*` / `--ph*` tokens.

## Overlap / overflow fixes
Host-game panel (save slots and START were cut off at 1280x720: grid `minmax(0, ...)`, wrapping form rows), main-menu hint vs version line,
hotbar item names vs slot number (2-line clamp, number moved onto a plate), role-skill chips (`SONAR PULSE` vs key label), shop tab rows,
all Press-Start-2P labels (9-12 px, wider than their boxes) now use the condensed face at a legible 15 px minimum.

## Verification
- `node --check` on changed JS, `node tools/harness/ui2_glyphs.test.mjs`, `npm run build` (css + fonts bundled).
- One headless run: `flock /tmp/tfg-browser.lock node tools/harness/ui2_shots.mjs --port PORT --out DIR --sizes 1280x720,1920x1080 --both`
  (menu title/host/character, HUD in run, inventory, shop, roles at both sizes; tree, market, pause, shipyard, pets, crafting, bounties at 1280).
- Screenshots: `docs/wave4/ui2/{before,after}_<size>_<name>.jpg`.

## Screenshot review (honest)
Captured in one headless run (1280x720 + 1920x1080, `--both`): `docs/wave4/ui2/{before,after}_<size>_{menu_title,menu_host,menu_character,hud,inventory,roles}.jpg`.
- Host panel: before, save slots and START were cut off / cramped, after they fit; plate title + tape reads clearly as one device. Form rows now wrap label-over-input in the narrow column (slightly ragged, acceptable).
- HUD: clock/quota plates, level plate, segmented stamina/xp, numbered hotbar plates, ability chips (`HEAL BEAM`/`REVIVE PUL` no longer collide with their key). Objective list unchanged.
- Inventory and role menu: same frame/plate/tape/section language; role cards keep their accent colour on a hard top edge.
- The 1280 shop shot in that run caught the CRT power-on frame (not usable), the panel rows for shop / market / pause / shipyard / pets / crafting / bounties / forge / homeworld / trade were not captured (the run hit a screenshot timeout on the busy shared machine). They use the same base classes, but they were NOT looked at.

## Known gaps
- Panels not visually verified (above). Some small labels (9-12 px Press Start 2P) were bumped to 15 px by selector list; unlisted ones may still be small.
- Panel emoji are still blanked by the `ui.js` observer instead of being drawn as pictograms (only record.js, HUD and the sound hint use `glyph`).
- Inline-styled widgets (minigame overlays, some dock widgets) only get shape via `.hud-dock-item > *`.
- `theme.css` relies on `html.tfg-ui #ui` specificity; a panel that mounts outside `#ui` is only themed if its selector is listed (tooltips already are).
