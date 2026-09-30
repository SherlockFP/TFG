# landing10 - the landing sequencer (wave 10)

**Problem** (lead screenshot, 1280x720, 88-Chatroom): the case card, the moon title + Algorithm line and the descent card were drawn on top of each other;
6-8 `sys` lines hit the chat log at once (CREW TASKS, Seismic sensors, WEATHER, Technician kit, PRE-FLIGHT, Takeoff blocked, CONTESTED ZONE...) and 2-3 more toasts stacked on the right.

**Cause of the overlap**: `ui.clearCinematics()` (called on the `landing` phase) removed `.report/.quotamet/.fired` but not the case card wrapper `.lcase-cine` (casefile.js), which lived on 6-9 s over the title card.
Every other landing system announced itself independently (`ui.systemMessage` = chat line + toast, soul title card, banners).

## Sequence (src/game/landing10.js + landing10_core.js, pure rules)
1. descent: hud.js briefing card; toasts / big text / Algorithm box are held (`ui.fullscreenOpen()` is true while the sequence holds).
2. touchdown: soul.js moon title card (skippable, unchanged).
3. ONE compact **CREW BRIEFING** panel (`.l10-brief`, top-centre, stacked by docklayout). Waits for the title / case / report / banner slots, opens at the latest 11 s after touchdown.
   It merges every `sys` line since the descent began: exact repeats and counters ("Crew tasks: 0/5" -> "1/5") collapse, max 5 lines (bad > warn > info > good, shown in arrival order),
   "+N more in the chat log" for the rest, long lines clipped, shown 5-9 s, extended up to 3 s for late lines, Enter / Escape dismisses. It then reserves the shared arrival-card timeline (`onboard.fr.slot`) so later cards queue behind it.
4. normal HUD (held toasts trickle out).
Nothing is lost: every captured line goes into the chat history immediately (as an already faded `.old` line, visible when chat is open). A dead player is never captured.
No new net messages: every peer runs the same sequencer off the same `sys` broadcasts and `run.phase`.

## Hooks in shared files (one line each)
- ui.js `systemMessage` -> `landHook.capture`; `fullscreenOpen` -> `landHook.hold`; `clearCinematics` selector += `.lcase-cine`.
- docklayout.js `TOP_BANNERS` += `.l10-brief`.
- facility.js: cobweb placement (below).

## Floating grey shards in the metro (probable cause + fix)
The facility.js clutter pass placed `cobweb` (a 1.4 m vertical plane with a grey web texture) at a RANDOM point of the room, 1.4 m below the ceiling = a grey shard hanging in mid-air
(the metro `nest` room has cobwebs + hanging chains). The web is now placed across a ceiling corner (45 deg, both ends touching a wall). Same rng call count, so seeded layouts stay identical.
Not verified in a browser.

## Test / knobs
`node tools/harness/landing10.test.mjs`. Console: `kefal.game.landing10.demo()` fires 8 sample lines through the real path; `.debug()`.
Knobs in `CFG` (landing10_core.js): maxLines, settleMs, forceMs, minShowMs, maxShowMs.
Known gaps: the descent card (hud.js) and the title card (soul.js) are still two cards, sequenced by the game phase, not merged; direct `ui.toast` calls are held (not merged) until the panel is gone.
