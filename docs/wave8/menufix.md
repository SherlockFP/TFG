# Wave 8 menufix: main-menu mouse look after standing up

## Root causes (found by reading + a real-mouse Playwright run)
1. `main.js leaveGame()` never reset `input.enabled`. `game.update` sets it every frame to `!ui.blocksInput() && ...`; the last frame of a run is usually with the pause/quit panel open, so it stayed `false`. Back in the menu room `consumeMouse()` returns 0 and `isDown()` is false: standing up worked, looking / walking did not. Fix: `input.enabled = true` in `leaveGame`, and `MenuRoom.stepState` re-asserts it (unless the terminal is open).
2. `Input.lock()` ([ctrlw]) called `requestFullscreen` BEFORE `requestPointerLock`. Fullscreen consumes the transient user activation, so the lock was refused ("click to resume" needed twice; after ESC it repeated). Fix: pointer lock first (synchronous, same gesture), then fullscreen; plus a one-shot retry on `fullscreenchange` within 2.5 s of a lock request.
3. `MenuRoom.onClick` only handled state `free`, and set `needClick=false` even when the lock failed (hint hidden). Now `standing` also (re)locks and `needClick` is cleared only by `pointerlockchange`.

## Verify
Scratch Playwright run (real key mashing, real clicks, `kefal.input.enabled=false` pre-set, fullscreen exited): stand up -> click -> lock true -> mousemove changes `room.free.yaw` -> ESC returns to the chair.
Result: the pre-fix run (enabled left true) showed the pipeline works in headless; a post-fix rerun (input.enabled preset false) got lock OK but `free.yaw` did not move after a synthetic mousemove and could not be re-diagnosed (shared browser lock starved, run cancelled by lead): QA must re-check stand -> click -> look with `kefal.input.enabled=false` preset and log `room.modal`/`terminal.active` (a click on the crosshair target may open a modal that pauses look).
Known gaps: real-browser fullscreen+lock ordering is only checked in headless Chromium (no real activation enforcement).

## Bug sweep
All node tests pass unchanged: onboard, algo1, algo2, roledays, zones, zones2 (+host), story (+host), hardmode (install/rules), lockpick2, dance, score, a11y, perf2. Doc "known gaps" for onboard/algo1/roledays/dance/lockpick2 were read: each is a documented design limit (host migration drops an open vote, ghost-raid `run.moon='home'` unguarded, held weapon not stripped but use is blocked via `useItem`, dance remote music not beat-locked); no confirmable logic bug, nothing changed.
