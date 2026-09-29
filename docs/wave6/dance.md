# Wave 6 - DANCE (module `dance`, `game.dance`)

Owner: "oyuna daha fazla dans ekle". 21 new dances / emotes on the avatar2 rig, keyframed procedural animation, group (sync) dance with a combo pop, a redesigned emote wheel + studio, short dance music loops.

## What
| piece | file |
|---|---|
| dance table + keyframes + sampler + sync maths + wheel layout + favourites + search + EN/TR/RU strings (pure, Node-safe) | `src/game/dance_data.js` |
| rig posing, emote registration, sync clusters, combo pop, remote dancer music, `game.dance` | `src/game/dance.js` |
| radial wheel with pages + Emote Studio panel | `src/ui/emotewheel.js` |
| thumbnails (avatar pose rendered once per emote, shared offscreen renderer) | `src/ui/emotethumbs.js` |
| six 8-beat music loops `dance_office / robot / sway / glitch / disco / metal` | end of `src/audio/sfxlib.js` |
| tests | `tools/harness/dance.test.mjs` (node), `tools/harness/wave6_dance.js` (headless body) |

Shared-file edits (all tiny): `emotes.js` (`WHEEL.make` factory hook, `startMs`, wheel delegation, music volume, flash reset), `avatar2.js` (`limbs` pivots on the returned avatar), `remote.js` (reset flash when a dance ends),
`algo1_core.js` (`VIEW_GAIN.dance`), `save.js` + `ui.js` (`danceVolume` setting + slider), `game.js` (import + slot).

## The dances (21)
Loops (repeat until you move, `dur` 45 s): Office Shuffle, Spreadsheet Robot, Coffee-Break Sway, Algorithm Glitch (jitter + pixel flicker through `setHitFlash`), Firewall (floss), The Worm, Moonwalk Pro, Disco Point,
Chair Spin (mimed, uses the sit base), Panic Dance, Sync Dance (line dance, 5 m sync radius), Metal Night (headbang + horns), Victory Lap (jogs a small circle).
One-shots (fade in 0.3 s / out 0.35 s): Quota Celebration, Salary Man Bow, Layoff Flop (Taunt), Approved, Hold Position, Follow Me, Send Help (Signal), Rejected (Taunt).
Categories (wheel pages): Favourites, Dance, Social, Taunt, Signal; the older 20 emotes are mapped by `LEGACY_CAT`.

### Keyframe format
`{ id, bpm, beats, loop, keys:[{ b, e, ...channels }], half, proc, chE, nosec, ph }`. Channels (`CH`): root `y x z yaw pt rl`, torso `tx ty tz` and neck `nx ny nz` (additive on the idle pose), arms `Lx Ly Lz Le Rx Ry Rz Re`,
legs `Hl Hr Kl Kr Sl Sr` (absolute, blended in from whatever the rig did this frame). Keys are sparse per channel (a channel holds until its next key; loops wrap). Easing per key `e`: `s` smooth (default), `l`, `h` hold, `q` snap,
`i` accelerate, `o` overshoot, `b` in-out; `chE` overrides per channel. `half:true` = keys cover half the cycle, the second half is their mirror (both sides must be written). `proc(b,t)` adds run cycles / circles / jitter.
Secondary motion is automatic (unless `nosec`): the neck follows the torso with 0.2 beat lag, elbows trail the shoulders, a 2x-beat head bob on loops. Music loops share the dance bpm (8 beats), so the beat lines up locally.

## Group dance / Sync
Every 0.25 s each client clusters looping dancers (self + `game.remotes`) of the SAME dance within 3 m (chained; Sync Dance 5 m). Everyone in a cluster plays the phase of the EARLIEST starter: offset = (own start - anchor start),
eased in at 1.2 s/s so nobody pops (`approach`). Purely visual per client, no net messages. When the local player's group forms or grows a "GROUP DANCE xN +HYPE" plate pops (hazard tape) and any new / bigger cluster calls
`game.algo1?.bump('dance')` (host-only inside algo1: +4% viewers, min 25). Music: the local dancer's loop starts in `EmoteSystem.play`; remote dancers' loops are started by `dance.js` on their avatar (max 2 remote sources, never two copies of the same loop).

## Wheel + studio
Hold B: 8 slots per page; mouse picks, release plays. LEFT/RIGHT or mouse wheel = page, UP = toggle the hovered emote as favourite. Centre shows the hovered emote's thumbnail, category, LOOP / ONE-SHOT.
Tap B (release under 0.25 s without a pick): Emote Studio (uses the normal ui panel, pointer free): search (folds Turkish diacritics), category chips, thumbnail grid, drag a tile onto one of the 8 favourite slots (or click a tile then a slot), click a slot to clear,
double click a tile to play. Favourites = `profile.emoteFav` (array of 8 ids / null). Without WebGL the thumbs fall back to category glyphs; without the factory (Node) EmoteSystem keeps the classic ring.

## Unlocks
Free: 13 of 21. Shop rotation (cosm5 `src:'shop'`): Spreadsheet Robot 240, Firewall 200, Moonwalk Pro 180, Metal Night 260, Victory Lap 320. Crate / daily rewards (`src:'crate'`, `cosmeticPool('rare'|'epic'|'uncommon',{slot:'emote'})`):
The Worm, Algorithm Glitch, Quota Celebration. Rows are pushed into cosm5's `C5` by `dance.js`; owning = `profile.emotes` (`game.cosm5.reward('emote:worm')`).

## Network
No new message types. The id goes out as `x:<id>` in the player state `e` (the existing path). An old client resolves an unknown id to `null` (`emoteFromNet`) and simply shows nothing; a new client ignores ids it does not know.

## Knobs
`danceVolume` (Settings > Volume, default 0.8), `SYNC_RADIUS` (3), `SLOTS` (8), `DEFAULT_FAVS`, per-dance `bpm / beats / keys / proc`, `LAG` (secondary motion), `syncR`.

## Tests
`node tools/harness/dance.test.mjs`: keyframes + EN/TR/RU names + descriptions for every id, finite samples, seamless loops, mirror halves, cluster / phase-lock maths, slot layout round trips, pages / favourites / search, net id round trips
(unknown ids -> null), shop / crate rows, music ids exist, real avatar2 rig posing (limbs, fade in / out, Worm face down, Flop on the back). `node tools/harness/cosm5.test.mjs` still passes.

## Known gaps
Looks of individual dances are hand-tuned numbers, only spot-checked by eye; ankle / knee interplay on deep squats may clip slightly. Sync is per-viewer (two screens may disagree about the anchor when start times are within a packet of each other).
Remote music is positional but not beat-locked to the synced phase. Classic (non-avatar2) bodies skip the leg channels. The i18n audit lists `dance_data.js` names as "unwrapped" (they are translated through `translationMaps()`).

Not run in a browser (shared lock busy >10 min): tools/harness/wave6_dance.js is ready (add &dance=studio to the url for the studio); wheel + studio layout and thumbnails are NOT eyeballed.
