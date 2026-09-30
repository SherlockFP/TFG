# Wave 12 - CREATURES12 (module `creatures12`, src/game/creatures12*.js, src/models/creatures12_models.js)

Four creatures built around PERCEPTION (what the crew can see, hear, and who is being heard). Same integration pattern as creatures10/11 (registerCreature, EXTRA_SPAWNS, threat pool HEADLINE row, IDENT / FIELD_NOTES / STATE_SOUNDS / LOOPS / death texts, procedural sounds, EN + TR + RU). Every hit or penalty has a telegraph >= 0.8 s.

Files: `creatures12.js` (installer + debug), `creatures12_core.js` (TUNE + pure rules), `creatures12_ai.js` (DEFS, host AI, pull / clear API, registration), `creatures12_fx.js` (client + net), `creatures12_sfx.js` (22 sounds), `creatures12_text.js` (TR + RU), `models/creatures12_models.js`. Test: `node tools/harness/creatures12.test.mjs` (10 groups).

## The four
| creature (id) | rule | states / telegraph | counterplay |
|---|---|---|---|
| **404** `c12_404` (max 1, 200 HP, quota >= 2) | Invisible on every client. Shown only by: the scanner pulse (2.5 s, within 24 m with a clear line), the scout drone camera (gear11 pilot view), a 0.3 s glitch outline when a flashlight beam (yours or a teammate's) crosses it, and it is always a red dot on the ship radar. Slow (2.1 m/s), always heads for the nearest player in the facility. | `seek` -> `windup` 1.0 s at < 2.3 m (screen static ramps to 95 %, wind-up sound, body shakes; step out of 3.6 m and it fizzles) -> `attack` = a downing hit (lethal `hurt`: DOWN on Casual/Standard, death on Hard; an ordinary capped hit at the entrance / ship) -> `off` 2.6 s. Static on your screen and a 3D hiss loop grow as it nears. | Keep moving (it is slower than a walk), scan to see it, radar callouts from the ship, kill it (200 HP) while it is revealed, step away when the static bursts. |
| **The Cookie** `c12_cookie` (max 2, 14 HP, quota >= 1) | A crumb that crawls to a player with no cookie yet and latches on their back silently. While attached, every 1.6 s the victim's position is pushed into the creature noise list (loud 3.4), so every creature that hears noises paths to them. After 6 s the victim gets a faint TRACKING ENABLED ribbon. Never damages anybody. | `crawl` -> `prime` 0.8 s (hops, ticks) -> `follow` (a calm state name for the director). | A teammate holds E for 1.2 s on the victim (host checks reach 3.4 m) -> the cookie dies (puller gets the XP); or the victim types `COOKIES CLEAR` at the ship terminal (aboard only); or kill it before it latches. |
| **The Echo Chamber** `c12_echo` (max 1, 160 HP, quota >= 1) | Stationary in the biggest non-entrance room. Its tape records loud sounds within 22 m: footsteps (>= 0.4), voice, item drops and bangs (through a wrapped `CreatureManager.noise`). Six sounds fill it; it then replays them (squeezed to <= 5.5 s) at a room >= 18 m from it and >= 12 m from every player when possible: positional `fx snd` events for the crew + lure noises for creatures. | `dormant` (ring of 8 cells fills as it records) -> `feed` (throbs, ring blinks, yellow WEAK POINT bulb glows; damage x2.5) -> `dormant` (8 s deaf). | Sneak / crouch near it (nothing recorded), do not walk to the sound, hit it while the bulb glows, destroy it. |
| **The Lag Spike** `c12_lag` (max 1, 90 HP, quota >= 1) | Floating corrupted cube that drifts toward the crew. Its 6 m zone (client-side, each peer checks itself): every 1.5 s your position snaps back to where you were 0.8 s ago, and movement input (WASD / sprint / crouch / jump) arrives 0.28 s late. Creatures are unaffected. | `fly` -> `scan` 1.5 s (floor ring shimmers in, cube tears, frame-stutter sound, LAG INCOMING chip) -> `active` 12 s (solid ring, LAG chip) -> `off` 5 s; 8-14 s rest. | Leave the ring (it shows the radius), shoot or stun it (a stun ends the zone), do not fight inside it. |

## Net (prefix c12)
`c12fx` host -> client (`HOST_ONLY`): `{k:'pulled', by, v}`, `{k:'cleared', v, n}`, `{k:'noship'}`, `{k:'none'}` (toasts only). `c12q` client -> host request: `{k:'pull', cid}` / `{k:'clear'}` (the host validates reach, victim != puller, alive, aboard). Everything else rides the generic creature channels (`cev` sp / snd / hp / die and the `cs` rows: the cookie's `extra` = victim id while `follow`). Late joiners need nothing extra (state lives in the creature snapshot).

## Existing systems extended (no duplicates)
- Creature system + threat director (`follow`, `dormant`, `scan`, `fly`, `off` are calm states), `hostHurtPlayer`, `M.noises` (creature hearing), the downed module (a 999 hit = DOWN, death on Hard), `mods 'scanLabels'` (scanner pulse reveal + label), `gear11.state.pilot` (drone view), `game.isLitByFlashlight` (glitch), the ship radar (draws every creature view, so the 404 shows there without an edit), `engine.fx.noise` (static, same idiom as boardgame / private creatures), `mods.commands` (terminal `COOKIES`).
- Instance wraps restored on dispose: `input.isDown` / `input.pressed` (lag delay) and `creatures.noise` (echo tape, host).
- Shared files: `game.js` (the 2 placeholders), `threatpool.js` (one HEADLINE line, minQ 2 / 1 / 1 / 1).

## Knobs
`TUNE` in `creatures12_core.js` (404 walk / trigger / windup / reveal times; cookie prime / ping / loud / ribbon / pull; echo ear / need / replay / weakMul; lag zone / shimmer / active / snap / delay; spawn weights + min quota); HP in `creatures12_ai.js` DEFS.

## How to see it (host, in a facility)
`kefal.game.creatures12.debug.spawn('404')` (walks at you, invisible: `.reveal(30)` shows it, or scan with the middle mouse), `.spawn('cookie')` / `.cookieMe()`, `.spawn('echo')` then `.tape(6)` (replays elsewhere, weak point glows), `.spawn('lag')` / `.lagNow()` (you stand inside a live zone), `.state()`.

## Not verified (no browser run)
- Nothing seen in the game: the four models (proportions, the 404 outline and screen text, cookie readability at 0.3 m, the echo ring and weak point, the lag ring at 6 m), sound levels, the ribbon / pull bar / LAG chip layout at 1280x720.
- Lag input delay + rubber-band feel with the real player controller (teleport resets velocity; snapping near ledges / stairs untested); the host player is affected the same as clients.
- The Instant Camera photo does NOT reveal the 404 (no hook added); the ship radar dot is the crew's early warning.
- Cookie pings attract only creatures that use `M.hear` / noises (chasers, hounds ...), not creatures with their own senses (mannequin, stalkers).
- Echo replay noises use the same `M.noises` list as player noise; a lure room with no path just makes creatures walk to the nearest reachable point.
