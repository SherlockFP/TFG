# ARTDIR - identity kit + UI art-direction upgrade (wave 6, class `tfg-artdir`)

Owner: "more detailed, better menus, nicer UI elements; improve the visual identity and art direction". No gameplay changes.
Builds on MASTERPLAN 21.4 (PSX + company-equipment UI; the Algorithm's own language is glitch, magenta/cyan, LIVE band), `docs/wave4/ui2.md`, `docs/wave5/ui3.md`.

Switch: setting **Art direction** (Settings > Comfort, default on) or in devtools `document.documentElement.classList.remove('tfg-artdir')`.
Everything is behind that html class (`src/ui/artdir.css`, every selector starts with `html.tfg-artdir` / `html.ad-calm.tfg-artdir`, checked by `tools/harness/ui3.test.mjs`);
JS-injected pieces carry `.ad-only` (hidden without the class). Reduce motion sets `html.ad-calm` and stops every animation added here.

## 1. Identity kit

### 1.1 Marks (code: `src/ui/logo.js`, pure SVG path data, no images; canvas twins via Path2D)
| Mark | What | Use |
|---|---|---|
| **TFG wordmark** | blocky stencil T-F-G drawn as 3 polygons (own geometry, font independent), 114 x 40 units, hazard-tape underline 5 units below. Glitch variant = magenta + cyan ghost layers offset +-3 units for ~0.15 s every ~5 s (`.ad-wm-g1/.ad-wm-g2`). | menu header, loading screen. Never recoloured except amber `#ff8a3d` (on dark) or ink `#120800` (on amber). Clear space = one letter stem (10 u). Min height 24 px. |
| **Company seal** | octagon (stop-sign / rack plate) + dashed ring + a T over a bar; ring text "APPROVED FOR PERSONNEL"; amber line art. | loading screen, menu header, faint watermark bottom-right of every rack panel (`--ad-seal-bg`, 9 % alpha). Company things only. |
| **The Algorithm's eye** | almond outline, iris ring, diamond pupil (magenta), three lashes; optional red LIVE dot. Pupil follows the cursor (`--lx/--ly`, CSS var, set by one rAF-throttled handler), blinks every ~6.5 s. On the CRT it is drawn on canvas and aimed by projecting its screen position through the camera. | main menu header ("THE ALGORITHM - LIVE"), loading screen, pause header. Algorithm things only: pupil magenta, glitch ghosts cyan/magenta. |

Rule of thumb: **amber/seal = the Company, magenta/cyan/eye = the Algorithm.** A screen may show both (main menu does) but never mixes their marks in one lock-up.

### 1.2 Colour system
| Role | Token | Ramp (dark / base / light) | Use |
|---|---|---|---|
| Company amber | `--ad-amber` | `#a8531f` / `#ff8a3d` / `#ffb266` | plates, titles, selection, stamps, seal, wordmark |
| Hazard yellow | `--ad-hazard` | `#17110a` (tape ink) / `#ffb800` | the ONE accent: tape, active hotbar slot, selected-tab underline, tip-card edge. Never text. |
| Terminal green | `--ad-term` | `#2f7a3a` / `#7dff7d` / `#c8ffc8` | memo ticker, hints, index numbers, "OK / good" |
| Algorithm magenta | `--ad-mag` | `#8a1f47` / `#ff3d7f` / `#ff8fb4` | eye pupil, product name, Algorithm banner, glitch |
| Algorithm cyan | `--ad-cyan` | `#2affff` | glitch ghost + scanline wipe head only |
| Paper / ink | `--ad-paper` `#e9dcc4`, `--ad-ink` `#120800` | | body text on dark / text on amber plates |
| Danger | `--t-bad` (ui2) `#ff5a48` | | TERMINATED stamp, low HP, exhausted |
| Tier | `tiers.js` colours | common #9aa39a, uncommon #4ecb5a, rare #3d8bff, epic #b35cff, legendary #ff9a1f, mythic #ff3b6b | item art frames only (tooltip `--tc`) |
No gradients on cards, no glow, no blur, no purple UI (epic tier excepted).

### 1.3 Type scale (faces from ui2: `TFG Plate` = Barlow Condensed 700 / Roboto Condensed Cyr for labels, VT323 for reading)
| Step | px (canvas menu / DOM) | Face | Use |
|---|---|---|---|
| Display | 37 / 60-72 | Plate, caps, letter-spacing .14-.16em | menu primary entries, TERMINATED stamp |
| Title | 26-27 / 26 | Plate | panel title plates, secondary menu entries, stamp big word |
| Label | 19 / 17-20 | Plate, caps, +.16em | section headers, tab labels, column labels (PLAY / OFFICE) |
| Body | 21-24 / 21 | VT323 | everything you read |
| Micro | 15-17 / 12-14 | Plate or VT323 | key hints, form codes, footers (stamps only below 15 px) |
Numbers: tabular, Plate (`.tfg-num`). Never Press Start 2P.

### 1.4 Iconography
24-grid, 2 px square-cap, miter-join pictograms from `src/ui/glyphs.js` (38 names, `glyphPath(name)` gives raw path data). No emoji, no filled blobs.
**Compositions** (`compositionSvg([main, a, b])` in `logo.js`): one big glyph at 1.45x, two small ones at .85x/55 % alpha, viewfinder corner ticks, dotted baseline. Every `.cp-head` gets one chosen by panel kind (`KINDS` in `artdir.js`, EN/TR/RU title stems; unknown titles pick a stable fallback by hash) plus a **stamp**: form code `TFG-27-C` (stable hash of the title) over a status word (APPROVED / CLASSIFIED / PENDING / RESTRICTED / ON BREAK), rotated -3 deg, 2 px amber frame.

### 1.5 Motion rules
1. Motion is information, not decoration: selection (plate slides to width), screen change (wipe), state warning (low HP, exhausted), the Algorithm looking at you (eye, glitch). Nothing loops without meaning.
2. CSS keyframes or the existing ~15 fps CRT canvas redraw only; no extra canvases, no per-frame DOM work. Eye tracking is one rAF-throttled `pointermove`, only while an `.ad-eye` exists.
3. Timings: wipe 0.34-0.5 s (10 steps, `steps()` not eased = "CRT/PSX"), stamp slam 0.38 s, glitch 0.14 s every 3-8 s, blink 0.16 s every 2.5-6.5 s, low-HP pulse 1.15 s.
4. `Reduce motion` (settings.reduceMotion -> `html.ad-calm`): no wipe, no glitch, no blink, no eye follow, no pulse (low HP shows a static red edge), ticker becomes one memo at a time, plate snaps to width.
5. Sound: hover/confirm reuse the existing `ui_hover` / `ui_confirm` sfx (unchanged, `uiSounds` setting respected).

## 2. What changed (all visible when the class is on)
- **Main menu (`src/ui/artdir_menu.js`, hooked in `CRTMenu.drawMenu`)**: seal + animated wordmark (light sweep clipped to the letters, periodic RGB-split glitch) + hazard tape + product name; the Algorithm's eye (follows the cursor, blinks, LIVE dot); **two-column hierarchy**: PLAY (continue / host / join / daily, large) and OFFICE (profile, hub, character, mods, settings, how to play, smaller), numbered rows, selected row = solid amber plate with a hazard edge that slides to width, `> hint` line for the selected entry, NEW! badge kept, terminal-green **"Company memo" ticker** (8 memos, EN/TR/RU), key hints, footer. Sub screens (host, settings, ...) show a stamped label plate + big pictogram + the same header on the left of the CRT, and a **scanline wipe** (cyan/white/magenta head) on every screen change; the DOM panels use a stepped clip-path wipe + slide. Picking now uses x and y ranges (`itemRects` carry `x0/x1`, `CRTMenu.pick`). Falls back to the old menu if drawing throws.
- **Sub screens use the same amber phosphor as in-game panels** (were cold blue), so settings / character / profile / hub / daily / host / howto match the HUD panels.
- **Panels**: stamped form label + glyph composition in every header, seal watermark, one **index-tab** language (notched tabs, filled selected tab with hazard underline), **tier art frame tooltips** (corner brackets + hatched header + framed icon in the tier colour, `--tc`), **empty states** (dashed tray + drawn empty-drawer icon for `.empty / .crp-empty / .dy-empty / .hub-empty`).
- **Pause**: lobby code as a ticket, numbered full-width entries, danger entry separated, eye in the header.
- **Loading screen**: seal - wordmark - eye lock-up, amber plate status, segmented bar, tip card with hazard edge, facility skyline art + "ONBOARDING IN PROGRESS".
- **Death**: `TERMINATED` rubber stamp with the reason underneath (double red frame, slams in).
- **Day report / case file**: folder tab, hazard header band, ledger dotted rows, perforated bottom edge, double-frame grade stamp.
- **HUD**: low-HP (<30 %) red edge pulse + beating body icon, stamina < 25 % warning frame (exhausted blinks), damage-direction indicator restyled as a red chevron wedge on a ring (it already existed: `HUD.damageDirection`). All CSS; settings `showCrosshair` etc. untouched; reduce motion -> static.
- New strings (EN/TR/RU) in `src/ui/artdir_i18n.js`; settings key `artDir` (default on).

Shared-file edits (all tagged `[artdir]`): `theme.js` (2 lines), `ui.js` (import, `syncArtdir(s)`, one settings checkbox), `hud.js` (stamp markup + 3 toggles), `crtmenu.js` (draw hook, dispose, pick x-range), `glyphs.js` (`glyphPath`), `tools/harness/ui2_shots.mjs` (`--only artdir [--names a,b]`).

## 3. How to test
```
node tools/harness/ui3.test.mjs     # + artdir: kit svgs, kinds EN/TR/RU, form codes, TR/RU strings, css scoping, no emoji / glow
npm run build
npx vite --port 5731 --strictPort &   # restart it after big edits: the file watcher missed changes in this sandbox
flock /tmp/tfg-browser.lock node tools/harness/ui2_shots.mjs --port 5731 --out docs/wave6/artdir --sizes 1280x720,1920x1080 --only artdir
```
`before_*` = `tfg-artdir` removed on the same page state, `after_*` = on. Screens: menu title / title wipe / host / settings / character / profile / daily / hub / howto, loading, pause, death, low HP + damage arcs, day report, shop / settings / hub / crafting / bounties panels, tier tooltip. JPEGs <= 150 KB in `docs/wave6/artdir/`.

## 4. Known gaps (honest)
- The eye on the CRT follows the pointer only while it moves over the page; with gamepad it wanders slowly. The DOM eyes need a pointer too (static otherwise).
- Damage arc: one arc was visible in the 1280 shot, the 1920 "after" low-HP shot is the run before the arc freeze fix (no arc in it). Low-HP vignette + body icon are visible in both.
- Panel kinds are matched on the visible title text; an unmatched title gets a hash-picked generic composition (not wrong, just generic). Panels that never use `.cp-head` (self-styled ones such as the inventory bar, arcade) get tabs / tooltip / empty-state styling only where their classes match.
- Pets panel was locked in the test run, so it is not in the shots (bounties instead). Trade, homeworld, shipyard, forge were not re-shot.
- The CRT shader still uses the cold blue tint; the amber content reads slightly cooler than the DOM amber.
