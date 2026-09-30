# fastmenu (wave 9): title menu before the 174 GLBs

Owner checklist item 3, "cold load, time to the menu".

## What changed

- `boot()` (src/main.js) now stops after physics + the ext manifest, builds `CRTMenu` and shows the title menu. The rest runs in `App.loadAssetsBg()`, stored as `app.assetsReady` (a promise that never rejects; `app.assetsDone` / `app.assetsProgress` mirror it).
- The background chain keeps the OLD order exactly: `preloadExtModels` -> `registerExtContent()` -> `mods.loadAll()` -> `mods.emit('boot')`. Item registration order and SCRAP_TABLE contents are therefore identical to before by the time any `Game` exists. (`mods.maxPlayersAllowed` is now assigned before the chain, it is only a function.)
- `startGame(opts)` (the one place that creates a `Game`: PLAY, host, join, join link, Quick Shift, daily, `?autohost` / `?autojoin`) awaits `assetsReady` before `new Game`. It shows the loading overlay with `Loading models... {d}/{n}` while waiting. If assets are done there is no await and no extra overlay.
- Join link (`?join=CODE`): `boot()` still ends with `parseJoin` -> `joinGame` -> `startGame`, so it simply waits for the assets, on the loading overlay.
- Menu safety: CRTMenu / MenuRoom props are procedural (`vending_machine`, `filing_cabinet`, `server_rack_prop`), no `ext:` ids, so it needs no models. Two menu paths did depend on mods being loaded and now wait for `assetsReady`: `ui.joinLobby` (`mods.enabledIds()` was empty -> false "Missing mods" prompt) and `screen_mods` (shows "Loading mods..." + Back, then re-renders).
- The auto-quality FpsProbe (first boot) now starts after `assetsReady`, because parsing GLBs on the main thread during the 3 s probe would skew it toward Low.
- Corner line: `#asset-line` (bottom right, VT323 green-dim, fixed, pointer-events none) shows `Loading models 34/174` (EN / TR / RU via `addTranslations` in App constructor) and is removed when the chain ends.
- `kefal.game.perfInfo().frameMs` = `{ frames, p50, p95, p99, low1pctFps, avgFps }` over the last 600 frames: a `Float32Array(600)` ring (`makeFrameRing` / `pushFrame` / `frameStats` in src/game/warmset_core.js), fed from the `update` mod hook in `installWarmSet` with `performance.now()` deltas (no per-frame allocation; sorting happens only when perfInfo is called). Gaps >= 1 s and hidden-tab frames are ignored.

## Verified

- `node --check` on the changed files, `npm run build` OK.
- `node tools/harness/run_all.mjs joinplay warmset perf5 netaudit`: 4/4 pass.
- New `tools/harness/fastmenu.test.mjs` (source-level): boot does not await the preload; chain order models -> registerExtContent -> mods.loadAll -> boot; `await this.assetsReady` precedes `new Game(` in startGame and there is no other `new Game(`; no wait when done; join link path intact; FpsProbe after assetsReady; frame ring percentile maths.

## NOT verified (no measured numbers)

- The one allowed headless run was skipped: `/tmp/tfg-browser.lock` stayed busy (checked several times, waited 240 s). So there is NO measured before/after time-to-menu and no `docs/wave9/fastmenu.jpg` screenshot, and "click PLAY while models load, game starts after the wait" was not seen in a browser.
- Expected effect: time-to-menu drops by the whole GLB preload + mods load (the old menu time equals the new `assetsDone` time). To measure: in the page, log `performance.now()` when `kefal.menu` becomes truthy vs when `kefal.assetsDone` becomes true.
- Not checked: the mods screen / MODS entry while the chain is still running (only code-read), TR/RU rendering of the corner line, that GLB decoding competing with the first menu frames does not visibly hitch the CRT animation on slow machines.
