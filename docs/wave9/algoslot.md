# ALGOSLOT: one Algorithm slot + LIVE strip (wave 9, REVIEW_W9_STATE task 8)

**What**
- The Algorithm has ONE place: a react-only subtitle under the compass (`.algo-sub`, algorithm.js). No face card, no pink box, no "THE ALGORITHM / LIVE" header, max 2 lines, transparent. It is hidden while calm and shows a line only when something is said (TAGGED, downed, first sighting, big haul, quota ...). The existing algoctx context / expiry queue and the 45 s / danger pacing are unchanged. Idle orbit chatter (`orbit_idle`) is dropped unless Settings > Chatty Algorithm (`OG.calmDrop`). Faction voices show a small coloured name line.
- LIVE strip: `● LIVE 1,470` top-left above HP, built by `src/game/algoslot.js` (prepended into `.hud-tl`). The number is algo1's viewer count (`game.algo1.viewers()`), the same one the 12 s stream overlay seeds (`seedViewers`), the report peak line and story's `viewersPeak` read. It ticks with a short `+N` on events (`tfg:viewers` with a reason: ON AIR/TAGGED, downed, escape, boss hit ...). feedcams still adds `| ON AIR` / `| TAGGED` through the `.algo-live` class.
- After the opening the stream stays alive without clutter: the strip + an occasional (>= 40 s apart, 60 % chance, moon only) one-line chat reaction ("ratking: he is down. clip it.") that goes through the SAME slot (`game.lore.say`, class flavour, so the firstrun / chase-quiet pacing still applies).
- QUOTA / CREDITS / ROUTE left the top bar: `hud.js` keeps the `.hud-quota` node hidden; the hold-Tab card (hudcalm.js) has QUOTA, Days left, CREDITS, ROUTE (orbit); the terminal has a `.term-head` status line (terminal.js `headText`).
- The day report gets a `● LIVE peak N viewers` line (daySummary extra).

**Files**: algoslot.js (new), onegoal_core.js (`calmDrop`, `liveText`, `liveDeltaText`, `reactKey`), algorithm.js, algo1.js (paint via `liveText`), hud.js, hudcalm.js, terminal.js, style.css (`.term-head`), ui3.css, game.js (1 import + 1 slot). i18n: EN keys + TR + RU (reaction lines, `LIVE peak {n} viewers`; QUOTA / CREDITS / ROUTE already translated).

**Test**: `node tools/harness/algoslot.test.mjs` (+ algoctx, onegoal, hudcalm, hud6, algo1, algo2, firstrun, tools/sim/a11y.test.mjs), `npm run build`.

**Knobs**: `REACT_GAP`, reaction chance in `OG.reactKey`, `CALM_KEYS` in onegoal_core.js.

**Not verified (no browser run)**: real shots. Check that a CALM shot has no Algorithm text, a TAGGED shot has one line, the strip does not collide with HP at 1280x720, and the terminal head fits at 900 px. The stream overlay's own lower third (12 s opening, onboard.js) is left as is. docklayout.js still pins `.algo-sub` under the compass (unchanged); the `.hud-quota` pin there is now inert.
