# Wave 11 - CREATURES11 (module `creatures11`, src/game/creatures11*.js, src/minigames/captcha.js, src/models/creatures11_models.js)

Three creatures whose threat is a NEW RULE (not "chase and bite"), same integration pattern as wave 10 creatures10 (registerCreature, EXTRA_SPAWNS, threat pool row, IDENT / FIELD_NOTES / STATE_SOUNDS / LOOPS / death texts, procedural sounds, TR + RU). Every damage or penalty has a telegraph >= 0.9 s.

Files: `creatures11.js` (installer, debug, host tracker tick), `creatures11_core.js` (TUNE + pure rules: captcha round, gate pick, ban clock), `creatures11_habits.js` (the Recommender's per-player model), `creatures11_ai.js` (DEFS, host AI, registration), `creatures11_fx.js` (net + client: test flow, shadowban mute, banner), `creatures11_sfx.js` (15 sounds), `creatures11_text.js` (TR + RU), `minigames/captcha.js`, `models/creatures11_models.js`. Test: `node tools/harness/creatures11.test.mjs` (19 checks).

## The three
| creature (id) | rule (first lore sentence = first-encounter caption) | states / telegraph | counterplay |
|---|---|---|---|
| **The Captcha** `c11_captcha` (max 1, 150 HP, burst 12 dmg, quota >= 1) | It plants itself in a doorway on the entrance -> generator route (arches first) and demands PROVE YOU ARE HUMAN: enter its 2.2 m zone and pick the 3 right tiles (of 9 pixel tiles: SCRAP or TRAFFIC LIGHTS) in 5 s. | `dormant` -> `scan` 0.9 s (magenta sweep, step back beyond 3.8 m to cancel) -> `demand` (amber screen, grid flicker, draining time bar, the minigame opens on ONE player) -> pass: `off` 20 s (slides aside edge-on, blinks the last 3 s, never closes on somebody standing in the doorway) / fail, ESC, timeout, or you hurt it: `alarm` 1.0 s (siren, red screen) -> burst (everyone within 9 m: 12 dmg + 1.2 s stun) + noise 3.4 (every creature around comes) -> `reload` 8 s (gate open). | Another route; a teammate answers while the rest walk past (only the answerer is asked); back off during the scan; run out of 9 m when the siren starts. |
| **The Shadowban** `c11_shadowban` (max 1, 130 HP, 26 dmg, quota >= 2) | It picks ONE crewmate and shadowbans them: for 25 s (12 s solo) their name tag, avatar sprite, pings, voice (walkie too) and chat vanish for everybody else while it hunts only them. | `lurk` (nearly invisible, humming) -> `mark` 1.2 s (flickers solid, the red circle-slash sign flares; picks the most isolated player) -> `stalk` (3.6 m/s, only the banned one) -> `windup` 1.0 s (gavel up, sign strobes white) -> `attack` -> ban ends: `off` 3.5 s (limp) -> `lurk` (24-34 s rest). | A teammate touching the banned player for 0.4 s lifts the ban (the creature goes limp); find them by footsteps / flashlight; kill it (the ban ends); step out of the wind-up. The crew gets one unnamed toast at ban start. |
| **The Recommender** `c11_recommender` (max 1, 110 HP, 28 dmg, quota >= 2) | It learns which doorway you take next and waits behind it; a cyan RECOMMENDED FOR YOU frame glows on that doorway 2 s before it appears. | `hidden` (parked 80 m under the floor, asleep for the director) -> `foretell` 2.0 s (frame + sign at the predicted doorway; starts when you move toward it within clamp(speed*2.6, 8, 18) m) -> `ambush` (solid pop-up window on the FAR side, waits <= 7 s, triggers within 2.4 m or when you cross that doorway) -> `windup` 0.9 s (window swells, close box flashes) -> `attack` -> `dismiss` (18-28 s rest). | Break the pattern: another door, backtrack, crouch-walk (INCOGNITO: it neither learns from nor tracks you), stand still; step out of the wind-up. Every shown guess that misses un-learns that route (-1). |

## How the Recommender learns (creatures11_habits.js)
Every doorway crossing (an edge of `layout.edgeInfo`, walked cell -> cell) of every player in the facility is an event (host, 0.2 s tick; a new landing = a new `Habits(layout)`). Entering a ROOM lists its exits; the exit taken is learned two ways: **route** (entry doorway -> exit doorway, needs >= 2 counts and >= 60 % share) and **habit** (turn relative to how you came in: straight / left / right / back; >= 3 of your last 12 exits agree, >= 60 %). Crouching crossings are not learned.

## Net (prefix c11)
`c11fx` host -> all (`HOST_ONLY`): `{k:'ask', to, cid, seed, lim}` (open the test on that player), `{k:'res', to, ok}`, `{k:'sb', id|null, left, cid, why}` (ban state, re-sent every 2 s and to late joiners, cleared on lift / end / dead). `c11q` client -> host request `{cid, seed, picks, cancelled, busy}`; the host re-derives the round from the seed (`captchaRound`) and validates picks + timing (5 s + 1.5 s grace), so a client cannot claim a pass. Everything else rides `cev` / `cs`.

## Existing systems extended (no duplicates)
- **Minigames**: `MINIGAMES.captcha` registered like `swipe` (tasks.js); built on `createMinigame` / the pixel font, so it is CRT-framed, TR/RU via `fillGaps`.
- **Mute**: no shared file edited: `game.onChat`, `game.hasActiveWalkie` and the net `ping` handler are wrapped on the instance (restored on dispose); tag / avatar sprite visibility and `rp.localVolume` (voice.js multiplies it) are set per frame and restored.
- Creature system, threat director (states `dormant` / `hidden` / `lurk` are calm or asleep), `hostStunPlayer`, `hostHurtPlayer`, `M.noise` (the alarm), `pvel`.
- Shared files: `game.js` (the 2 placeholders), `threatpool.js` (one HEADLINE line, minQ 1 / 2 / 2).

## Knobs
`TUNE` in `creatures11_core.js` (zone / scan / limit / pass / burst; ban duration / touch / windup; glow / wait / windup / learning thresholds; min quota; spawn weights); HP / dmg in `creatures11_ai.js` DEFS.

## How to see it (host, in a facility)
`kefal.game.creatures11.debug.spawn('captcha')` (a gate 8 m ahead, walk up to it), `.spawn('shadowban')` (marks YOU: banner + hunt), `.spawn('recommender')` (frame on the nearest doorway, then it appears), `.captchaUi(seed)` (just the tile test), `.fakeBan(remoteId)` (hide a crewmate on this client), `.predict()` / `.habits()` (what it thinks), `.state()`.

## Not verified (no browser run)
- Nothing seen in the game: the three models (proportions, both captcha screens, the translucent shadowban figure, the pop-up window + doorway frame text), sound pitch / level, the tile icons at real size, the banner layout at 1280x720.
- The captcha "slides aside" is visual only (creatures have no collider): the gate is a rule, not a wall. Gate doorways prefer arches; a `door` doorway may put it in front of a closed door leaf.
- Rooms of the labyrinth / open-plan themes may give the Recommender few exits to learn from; the tracker needs `layout.edgeInfo` + `edgeKey` (present on all interior layouts).
- Ban state is lost on host migration (clients expire it by their own clock). No crew HUD that lists teammates by name was found; if one exists it would still show the banned player.
