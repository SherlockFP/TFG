# Wave 7 - game feel (module `feel`, game.feel)

Presentation only; no damage/cooldown/balance numbers changed. Pure rules + sound recipes: `src/game/feel_core.js`; runtime: `src/game/feel.js`; test: `node tools/harness/feel.test.mjs`.

## What
- **Hitstop** 40-90 ms (`hitstopSec`: 40 + 4.5*sqrt(dmg), x1.15 heavy, x1.2 crit, +6 ms backstab). BUG FIXED: `Game.updateFrame` used to scale the whole `dt` by 0.12 (host sim, physics, timers). Now only `vdt` (particles, local player, viewmodel) is scaled; sim/net/creatures keep real dt.
- **Melee** (`combat.js` resolve/swing, `actions.js` stock path): per-class camera kick (`KICK`), class whoosh (`fl_swing_<cls>`), class x surface impact (`fl_hit_<cls>_<flesh|metal|wall>`), crit flash, metal sparks. Existing hit flash + directional blood (`creatures.js` 'hp' event) and engine `hurtFrom` indicator were already present and are kept.
- **Guns**: `feel.js` wraps `audio.at` and reacts to any fire sound in `GUN_SOUNDS` (covers local, remote peers, weapons.js and combat_weapons.js): extra punch layer `fl_shot_<class>`, indoor/outdoor tail (`fl_tail_in|out_<s|m|l>`, chosen by `player.indoor/inShip`), additive muzzle-flash sprite (pooled, no lights), smoke puff, casing puff (pistol/auto/rifle), faint outdoor screen flash.
- **Deaths**: `CreatureView.update` calls `feel.deathPose` in state 'dead': topple (4 seeded directions, size-scaled), bounce + hop, thump `fl_body` on landing, after 8 s sink + shrink over 2.5 s (transform only, shared materials untouched). Skipped for `NO_TOPPLE` types/bosses/hazards; if the model already rotates itself (>0.25 rad) only the dissolve runs. Death voices stay with `game.cvoice` (already per-creature 'death' event).
- **Player**: low-HP (<35%) now drives `engine.setLowHealth` + `engine.beat` with a `fl_heart` lub-dub whose rate rises as HP falls (the engine effect existed but nothing fed it). Pickup wraps `game.pickup`: `fl_thunk` (pitch by weight) + `fl_tick`.

## Knobs
`feel_core.js`: `HITSTOP_*`, `KICK`, `IMPACT_CLASS`, `WHOOSH_CLASS`, `GUN_FX`, `DEATH`. game.js: hitstop time scale 0.12. Screen-shake/punch respect the Reduce Motion setting via the engine.

## Test / gaps
`node tools/harness/feel.test.mjs` (95 checks: hitstop table, every melee class + every `fireSnd` has recipes, all recipes render, death state machine). Not verified in a live browser: recipe loudness balance, muzzle-flash placement on remote peers (uses their eye position), model-self-topple heuristic on all 60+ creature models. Guns keep their existing kick (not re-tuned).
