# Wave 9 trpass: Turkish pass (REVIEW_W9_STATE NEXT 5)

## What
- `<html lang>`: `index.html` now has a tiny inline script (settings lang, else `navigator.language`, else en) so the first paint is correct; `setLang()` already keeps `document.documentElement.lang` in sync afterwards. This also fixes every CSS `text-transform: uppercase` (98 rules), which follows the element lang.
- Player-facing upper-casing: about 100 raw `.toUpperCase()` calls (HUD/panels/terminal/report/identify/boss bars/route board echo/crafting/passive tree/roles/etc.) now use `.toLocaleUpperCase(getLang())`, so TR "kilit" -> "KİLİT". Left raw on purpose: ids, codes, translation-lookup keys (`t(x.toUpperCase())`), chess/draughts pieces, pixel-font canvases (`textures.js`, `models/*`, `minigames/*`, `facsys` screens: their glyph tables have no dotted I), host-broadcast `sysMsg` names (host locale would leak to clients).
- Guard: `node tools/sim/tr_pass.test.mjs` is a ratchet: raw `.toUpperCase()` count per file in `src/ui` + `src/game` may only go down (baseline table in the test). A genuine id/code line can carry `// upper-ok`. It also checks the html-lang script and that `setLang` sets it.
- 33 TR strings rewritten (natural, casual): objectives (land / deadline / sell / late / nearby lead / deep haul / vault / takeoff / quota buy rate / claim followers), tips (ping, fragile, level up), key names (forward/back/interact/crouch), emotes (Scared, Cheer), settings (Objective tracker), route board (ROUTE HERE -> BURAYA GİT, routing hint, buy rate), stream overlay reactions + peak line, followers (milestone/growth), onegoal TAGGED line.

## Test
`node tools/sim/tr_pass.test.mjs`; also ran algoslot, followers, onboard, onegoal, routeboard, a11y tests and `npm run build`.

## Known gaps
- Menu button `CREDITS` still reads `KREDİ`: same key is the money label on the HUD (`hudcalm.js`), so a change needs a separate key for the menu (suggest `YAPIMCILAR`).
- No browser TR screenshots (task said no browser run). Bitmap-font canvas text still upper-cases with plain `toUpperCase()`.
- ~85 remaining raw calls are audited-as-keep or lower-visibility (guide.js terminal text, terminal codes, siege/story terminal dumps).
