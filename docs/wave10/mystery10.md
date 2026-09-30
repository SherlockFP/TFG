# Wave 10 - THE FIRST UPLOAD (module `mystery10`)

Owner complaint: "soulless, low budget". A cross-moon mystery thread that gives the crew a reason to explore. Twelve recoverable fragments of what The Algorithm was before it woke up.
Canon (fits docs/LORE.md, RANK-1 = the ranker before v7): a 7-year-old, Pip, uploaded a 14-second video of her cat Mochi. The first thing that ever watched it was the ranker.
It kept watching. Pip wanted to be watched, the ranker wanted a viewer; then everyone else found them. 03:14 UTC is the night the whole Feed became that video. The twelfth fragment says the crew is viewer number two.

## Files
- `src/game/mystery10_core.js` pure rules (fragments, `ensure`/`collect` profile + milestones, `pickFragment`, `planLanding`, wardrobe row). Node-safe.
- `src/game/mystery10_text.js` all text EN/TR/RU (`TEXT` id -> [en, tr, ru], registered with `addTranslations`). `mystery10_ui.js` archive reader, codex index, terminal text, ending scene, CSS.
- `src/game/mystery10.js` module (host plan, net, pickup, room, hum, orbit effects, terminal `UPLOAD`, codex tab). `src/models/mystery10_models.js` floppy pickup, the room, the hat.
- Shared-file hooks (one to a few lines each): `game.js` (import + slot), `cosm5_data.js` (import + `C5.push`), `cosm5_models.js` (import + `Object.assign(HAT_BUILD, MYST_HATS)`), `ui/panels/record.js` (`window.__tfgCodexExt` extra codex sub-tabs).
- Test: `node tools/harness/mystery10.test.mjs` (selection determinism, spots, persistence + repair, milestones, text tables, wardrobe row).

## How it plays
- 0-1 fragment per landing (`CHANCE`: 40 %, +15 % per landing without one, cap 85 %). Never on HQ. Tiers of four: a fresh profile is served f01-f04 first (25 % may skip ahead one tier), so the story arrives roughly in order.
- Placement: facility rooms weighted by depth from the entrance (`1 + dist^1.4`, never sealed / vault rooms), outdoor spots far from the ship (>= 32 m, prefers 100 m+). Each fragment prefers indoor / outdoor (`where`).
- Pickup = a small floppy over a faint cyan light shaft + a hum (positional loop within 22 m). E to recover. Host validates distance, broadcasts `got` to everyone; every peer stores it in its OWN `profile.mystery`, the picker gets the reader, the rest a toast. XP + Clout to the picker.
- Reading: terminal `UPLOAD` (list) / `UPLOAD 3`, or [J] service record -> Codex -> "First Upload". Some fragments carry a sealed line that stays a redaction bar until you own 8 / 10 / 12 fragments (re-reading old ones pays off).
- Milestones (once per profile): **4** in orbit the terminal glitches (screen jitter, sound, message from `ranker@feed` hinting at the room). **8** the host's next landing carries the room that should not exist (5x5 mustard wallpaper cell, school desk, CRT looping the 14 s video); watching it gives the hat "First Guest Party Hat" (`hat:firstview`, secret, legendary); the room stops appearing once anyone has claimed it. **12** in orbit: ending scene (upload card, the 14 s video, five lines, "views: 2", "Thank you for watching."), title "First Viewer".

## Net (prefix `myst`)
`mystreq` client -> host `{op: take|room, s, id?}`; `mystst` host -> all (HOST_ONLY) `{k: plan|got}`; `mystfx` host -> one `{k: reward|again|gone}`; `mystsync` late joiner -> host. The host stores plans in `run.myst.plans[runId|moon|seed]` so a reloaded landing repeats itself.

## Knobs
`CHANCE`, `MILESTONES`, `FRAGMENTS[].where/sealAt` (core); `HUM_ON/HUM_OFF/REACH` (module); `ROOM` (models); `TEXT` (all strings).

## Test in the game (console)
`kefal.game.mystery10.spawnHere('f01', true)` (host, on a moon: puts a fragment 3 m and the room 12 m in front of you), `.grant('f04')` gives the crew a fragment, `.fire('4')` runs the terminal glitch, `.fire('e')` the ending scene, `.open('f03')` the reader, `.reset()` clears your progress.

## Known gaps / unverified
- No browser run yet: floppy scale / glow, room geometry on real terrain (floor sits at the highest of 9 samples, walls skirt 0.8 m down; a 0.4 m step at the door is possible), collider convention for the yawed walls, reader / codex layout at 1280x720, ending timing, terminal glitch look, hum loudness, the hat on a real avatar.
- The room is outdoor-only; moons without terrain never get it. Two players who have different fragment sets get the same shared pickup (each just adds it to its own file).
- Fragment text is fully written in EN/TR/RU but TR/RU are not proof-read by a native speaker.
