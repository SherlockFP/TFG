# Highlights clip (wave 8, MASTERPLAN 28.2, REVIEW_W7 5.2)

At the end of a day the Algorithm "edits" the crew's best on-air moment into a ~9 s replay: the shareable clip the genre lives on.

## How it works
- **Recorder** (host only, `highlights.js` + `highlights_core.js` `Ring`): 120 frames (12 s at 10 Hz) in preallocated typed arrays. Per frame: up to 4 player slots (x, z, yaw) and 5 creature slots (x, z; only creatures within 35 m of a player, sticky slots). No per-frame allocation; only runs on a real moon.
- **Trigger**: `feedcams2.record(kind, id, v, extra)` (down, revive, drone, fans, smash, cut, show, juke, streak, live, crack, catch) calls `game.highlights.onMoment`. Moments with score < 18 are ignored, a moment within 8 s of an open / finished clip only replaces it when it scores higher. Every moment also goes into a 12-entry event list (shown as tick marks).
- **Freeze**: 3 s after the moment the window [-7 s, +3 s] is cut from the ring, decimated to 5 Hz, and packed with algo2 `packTrack` (base64 dm deltas). Creature tracks that never come within 35 m of the subject are dropped; a step > 12 m breaks a track (slot reuse / teleport). Best 3 clips per day by score.
- **Wire**: at takeoff (or orbit, once) the host broadcasts `hlclip` `{ c: [clip...] }` (HOST_ONLY). `fitClips` drops creature tracks then the lowest clip until <= 20 KB (a typical clip is 2-4 KB). Receivers sanitise every field (`clean`) before unpacking.
- **Player** (`highlights_view.js`): a CRT stream frame (DOM + one 640x360 canvas), no scene, so it works in orbit with the map unloaded. Static top-down camera fitted to the paths over a 5 m grid, trails, subject in yellow, others cyan, creatures red squares, a ring + flash on the beat, 0.5x slow-mo within 0.7 s of it. REC blink, LIVE tag, VIEWERS counter climbing (cosmetic, bigger for a better moment), 3-line Algorithm chat (intro, caption at the beat, outro). Skip: Space / Enter / Esc / Backspace / click / SKIP.
- **Offer**: the day summary gets a `WATCH HIGHLIGHT` button; once per day a pill "Watch highlight [L]" appears (after the report and any queued full-screen card, 14 s). Clicking the button again plays the next clip (1 of 3...). Nothing waits on it.
- **Captions**: `highlights_i18n.js` `CAPS`, 3 templates per kind, plus 2 intro and 2 outro lines, EN + TR + RU, studio_style voice (no dashes, no exclamation marks; test enforces).

## Test
`node tools/harness/highlights.test.mjs` (ring window, subject flag, creature filter, pack round trip, wire size, keepBest, fitClips, slow-mo clock, captions in TR/RU, module smoke host -> `hlclip` -> receiver -> summary button). Also run algo2, feedcams2, carry2, downed, soul, rewardviz.

## Knobs
`HC` in `highlights_core.js`: pre / post, netHz, maxClips, minScore, gap, near, maxBytes.

## Not verified / known gaps
No browser run: canvas look at 1280x720, pill / button clicks under pointer lock (L key works without a cursor), the real 2-player payload. The replay is schematic (no map geometry under the paths, no y / floors). Hits by creatures are not separate events (downs, catches, cracks and camera locks arrive through `record`). Clips are not stored across days or shared outside the session. Host migration mid-day loses the ring (clips of that day). 
