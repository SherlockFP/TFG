# Wave 9 - Three message lanes (REVIEW_W9_STATE section 4)

**Status: partly met.** Toasts, the Algorithm slot and the centre prompt are the three lanes and are capped/pinned; message-like banners of other modules (`#p4-hint`, `.cd-cap`, `.ob-pa`, `.zn-bar`, `.ob-skip`, `.a1-vote`, `.sg-banner`, `.hban`, `.g2-card`, `.hud-big`, hud-chips) still have their own fixed elements and are only stacked by docklayout (now including: toasts clear the whole centre banner stack, not just `.algo-sub`). Folding them into a lane is a later job.

The three lanes:
1. **Algorithm slot** under the compass (algoslot / algorithm.js `.algo-sub`, `game.lore.say`). Unchanged; pinned 10 px under the clock/compass by docklayout.
2. **Toasts**, right column: `TOAST_MAX = 2` visible, `TOAST_MS = 4000` (callers may ask for shorter, never longer; `ms >= TOAST_LONG_MS` = 9 s is the opt-in for must-read ones such as the lobby code), deduped (a repeat refreshes the live toast). A third toast is QUEUED (max 8) and appears when a slot frees; nothing is evicted unread, and `flushPending` waits while both slots are busy. `src/ui/hud.js` `showToast` / `armToast`.
3. **Centre interact prompt** only. The bottom dock budget now ends under the prompt (`promptBottom(H)` in docklayout), so a dock item can no longer sit in the prompt column.

Also:
- **Tab card** (`hudcalm.js`): Standard/Minimal render head + exactly 5 lines (goal-or-warning, day + quota, credits + followers, next milestone, you + crew hp). Full keeps the two-column card and is the only density with FACILITY STATUS (`facility`) and PATRON (`story`) cells. Veterans (`isVeteran(profile)`) never see the pinned TUTORIAL step or hint lines, in any density.
- **Terminal**: `HELP` lists the 8 everyday commands + `HELP ALL`; modapi's module-command list prints only on `HELP ALL` (short HELP: one line with the count); `MOONS ALL` no longer re-lists every uncharted server (one line pointing to SECTOR, which prints them once); `MOONS` no longer appends the SECTOR MAP readout (mapmods wrapper removed; `ATLAS` prints it).
- **docklayout.js**: the dock budget math moved into pure `planDocks(H, o)` / `toastPush(algo, baseTop, W)` (same numbers as before, plus the prompt reserve) so the test can use it.

## Test
`node tools/harness/hud_overlap.test.mjs`: covers only the always-on frame (not the stacked banners, hud-chips or .tfg-asg); builds 14 HUD rects at 1280x720 (pinned ones from style.css / algorithm.js rules, docks from `planDocks`, content-sized boxes from documented worst cases: 6-slot hotbar, 2 toasts, 2 goals, 4 chat lines) and fails on any overlap or off-frame element; plus behaviour checks with a fake DOM/timers (toast queue, 9 s opt-in, flushPending, HELP with 30 module commands) and static checks for the lane caps, the 5-line card and the terminal cuts.

## Known gaps
Not run in a browser. Modules that still create their own fixed banners (siege/horde/vote banners, `.hud-big`) are only stacked by docklayout, not folded into a lane. Content-sized heights in the lint are estimates; a real-DOM version is a later job.
