# First sighting (wave 8 morning review, task 2)

## What
The creature director now stages a first sighting. Before this, no creature appeared in any night-3 shot.
- **When (host).** The beat runs at most once per landing, for the first creature in the moon's pool (`threatpool.poolFor`, in pool order) that this run has not met yet. The run's list is `run.fsSeen`. It is diff-synced, so it survives co-op sync, host migration and saves.
  - A pool creature that comes within 18 m of a crewmate counts as met.
  - Disguises (Loot Mimic, Masked) are never staged.
  - The first landing of a run therefore always gets a beat, and every later pool creature gets its own beat on the landing where it is new.
  - Conditions:
    - a crewmate has been in the creature's zone (inside or outside) for 5 s;
    - the director is not at a peak;
    - no hunting creature is within 40 m of any crewmate (never during a chase);
    - the one gate `crdirector.canSpawn(type, pos, 'firstsight')` says yes. The beat is a calm-phase event, so it uses the calm share of the threat budget.
- **Where.** `firstsight_core.findSpot` looks in the crewmate's view cone (0 / +-6 / +-12 / +-18 deg).
  - It marches the floor along each direction (nav grid inside, terrain outside) and scores spots at 12 / 13.5 / 15 m and at the corridor end.
  - It prefers: the centre of the view; about 13.5 m; the end of a corridor or across a room (within 2 m of the wall that ends the line); under a lamp (graded by facility emitter intensity and range); a ridge outdoors.
  - Only the best candidates get the two line-of-sight raycasts.
  - Everything is deterministic per run and creature (`RNG(hash('firstsight:'+runId+':'+type))`).
- **Beat (host).**
  1. The creature is spawned side-on, with its AI frozen for the whole beat. `stunT` makes `CreatureManager.hostUpdate` skip the behaviour, so there is no chase, no attack and no damage.
  2. At 0.8 s it turns slowly to face the crewmate (state `stare`) and holds for 2-4 s (seeded).
  3. It walks to a floor cell that is out of view (round a corner, path at most 14 m) and is removed once no crewmate can see it (after at most 4.5 s).
  - If no hidden cell exists, it vanishes in a light flicker.
  - Any of these ends the beat at once: a crewmate within 5 m, any damage to it, or a peak.
- **Client (every player within 34 m).**
  - When it appears: lights dip near the player and the creature, plus dust.
  - At the stare:
    - its signature tell (`crdirector_core.TELLS`) plus a low sting;
    - director eye quads in its tell colour;
    - the creature_read stare pose (forward lean, hunch, head tilt, eye dots flare).
  - **Bodycam autofocus** while the stare is on and it is in view: `camera.zoom` rises to about 3.5 at 12-15 m, aiming at about 5 % of the frame. The zoom is capped so the body stays inside the frame. The viewmodel is squashed by 1/zoom, so the hands keep their size. There is no zoom with `settings.reduceMotion`.
  - After the hold, the first-encounter rule caption plays through the director's one caption gate (`crdirector.teach` -> `onboard.fr` slot / lease -> `lore.say`). `algorithm.js` is untouched.
- **Director hooks (crdirector.js).**
  - `stage(id)`: while a body is staged, the director's scan leaves it alone (no early caption or tell) and turns its eyes on.
  - `teach(type, id)`, `cue(list, opts)` and `dip(dur, r, at)`.
  - `stare` is a calm state in `crdirector_core`, so it gives no tracking edge cue.
- Net: `fsight` {k:'in', id, ty, p, at, h} is sent before the spawn, so no client captions it early. {k:'out', id, p, why} closes the beat.

## Test
- `node tools/harness/firstsight.test.mjs`: 31 checks. Pure maths, plus a stub-game host+client sim: placed 12-20 m in the cone, in -> stare -> go -> removed, AI frozen with 0 bites, rule caption, autofocus zooms and restores, run memory, peak / chase veto, walking up aborts, and wiring greps.
- Also run: `crdirector`, `threatmerge`, `creature_read`, `lcmonsters`, `balance_rules`, `onegoal`, and `npm run build`.
- Headless on hamsi, fresh tab, runId pinned to `r1`, so the pool is Loot Mimic, Lantern Keeper, Spider, Robot, and the Keeper is staged:
  - The harness looks for a room with a long view with the beat off, removes resident creatures within 50 m (otherwise the budget gate vetoes, as it should: `vetoed: 25` in run 1), and waits.
  - The beat started 8.7 s of game time after the landing.
  - `docs/wave8/qa_shots/firstsight.jpg` (84 KB): the Keeper at 15.1 m, mid-stare, zoom 3.51. Its body meshes cover **3.64 %** of the frame.
  - After the beat: 0 HP lost, the creature is removed (`left`), and zoom and viewmodel scale are back to 1. `tfg.cd.seen` holds `lm_keeper` (caption taught). No page errors.
  - For the capture, the harness freezes `game.update`. The software-GL screenshot takes about 40 s and the page's own loop keeps running, so run 1's shot landed after the zoom had eased out.

## Knobs
`FS` in `firstsight_core.js`:
- `dMin` / `dMax` / `dPref` / `dists` / `dFar`
- `cone`, `wallBonus`, `litBonus`
- `inDelay`, `stareAt`, `hold`, `leaveMax`
- `near`, `chaseR`, `nearbyR`
- `zoomMax` (1 = no autofocus), `zoomCover`
- `disguise`

`game.config.firstSight = false` turns it off. It is also off when `game.config.crdirector === false`.

## Known gaps
- **The shot reads as a silhouette with eyes.** The Keeper in the shot stands in an unlit spot at 15 m. The lamp bonus (graded, `litBonus` 0.6) and the 12 / 13.5 / 15 m candidates were added after that run, so they are node-tested only. Reshoot in QA night 4.
- **Zoom strength is untested with players.** A 3.5x zoom is strong. Tune `zoomMax` after a human playtest.
- **Host migration.** A migration during the 2-8 s beat hands a normal (un-frozen) creature to the new host.
- **Late joiners.** A player who joins mid-beat sees the creature without the tell or zoom.
- **Outdoors.** The beat is untested outdoors (Blood Witch). It leaves in a straight line and is removed after 4.5 s. There are no facility lamps outside, so there is no flicker.
- **Theme creatures.** They (e.g. `robot`) can be staged as pool creatures.
