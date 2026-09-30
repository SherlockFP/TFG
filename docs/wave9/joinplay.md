# W9 join link + PLAY button (REVIEW_W9_STATE §3.3, tasks 2 + 3)

## What
- `src/net/joinlink.js`: `parseJoin(search, fallback)`, `joinLinkFor(game)`, `copyJoinLink(ui, game)`. Link = `origin+path?join=CODE&net=MODE`; the net mode travels in the link, so it cannot mismatch.
- `src/main.js`: `?join=CODE&net=X` calls `joinGame` (after the `autohost` / `autojoin` dev params). The code is upper-cased and stripped to `A-Z0-9-`; an unknown mode falls back to the saved setting.
- Pause menu: primary button "Copy join link" (above "Copy invite code"). Terminal: a `.term-code` header ("LOBBY CODE  [Copy join link]", clickable) stays visible in a run.
- Host toast and Quick Shift start toast now say "ESC > Copy join link" and last 9 s (`hud.toast(text, kind, 9000)`; 9000 = `TOAST_LONG_MS`, the lanes cap opt-in, tested in hud_overlap.test.mjs). The HUD gate still queues them behind loading / stream overlays; they show after it instead of vanishing in 4 s. A button inside a toast is unusable under pointer lock, so the action lives in Pause and the terminal header.
- Main menu (`crtmenu.js`): first entry PLAY = private lobby, saved net / difficulty, latest campaign slot (or a new run in slot 1), straight to the stream. CONTINUE is gone (PLAY continues; HOST GAME still has the slot picker and preselects the latest slot). DAILY and HUB show only after the first quota is met, or for veterans (`decideMode` + `isOpen('shop')`).
- Host form (`ui.js screen_host`): lobby name / public / password / max / network / difficulty fold under ADVANCED (`<details>`); Public is off by default. Artdir menu: PLAY in the left column, column header renamed GAME, hint added.

## Test
`node tools/harness/joinplay.test.mjs` (23 pure checks).
Browser: `flock /tmp/tfg-browser.lock node tools/harness/joinplay.test.mjs --browser --port N [--play-only] [--shot f.jpg]`. It opens a host tab and a client tab that joins from `?join=CODE&net=local` alone, checks the Pause and terminal wiring, then menu PLAY to the run (shot docs/wave8/qa_shots/w9_play.jpg, 46 KB).
Also run: onboard, hubgate, netaudit_wave8, routeboard, build.

## Gaps
- Password-protected lobbies: the link carries no password, so they cannot be joined by link.
- A real cross-machine join over Nostr / MQTT was not tested (two tabs over the local transport only).
- "2 clicks": menu PLAY is one click, the second is the pointer-lock click in the stream; the test calls `menu.activate(0)` instead of a mouse click on the CRT.
