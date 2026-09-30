# Field armory

Install after combat, hubgate and field broker: `import { installArsenal13 } from './arsenal13.js'`; `this.useModule('arsenal13', installArsenal13)`.

Two new midgame industrial weapons register through the existing item registry at install. Both are in the data-driven weapons catalogue and locked until quota index 2. The module wraps the existing hubgate shopLock, which stockFor runs for both UI and host shop transaction; the field broker remains the purchase point established by industry13. No starter loot is replaced, no ammunition grant, and no hit network handler is added.

Pressure Riveter: Credits390, weight11, two hands, three-round magazine, 42damage, 0.95s shot interval, range14m, reload2.4s. Uses existing Rifle Rounds. Loud2.8 noise and strong recoil/tracer warn nearby hunters. Generic combat hitscan/reload/ammo pipelines handle actual shots and host damage. Sustained damage is ~24/s versus existing rifle ~40/s; it trades range and sustain for compact industrial identity and a heavy close shot.

Pneumatic Baton: Credits310, weight7, damage10, interval1.1s, reach1.8m. A narrow three-hit chain and charged pneumatic thrust use the existing host cbhit melee system. Heavy stagger max1.3s, heavy animation/recovery1.98s before charge, weak35% block and short140ms parry. This is a rescue/stagger option with much lower damage than a starter pipe, not a stun-lock weapon. Boss resistance still uses existing creature rules.

Models, sounds and recoil are installed into existing combat registries. EN/TR/RU names, descriptions and lock explanation provided. First-person animation uses existing combat arcs and runtime WEAPON_RECOIL entry. Procedural compressed-air/impact report is positional for multiplayer. No new dynamic lights.

Test: `node tools/harness/arsenal13.test.mjs`: sustained damage relative to rifle, starter damage comparison, stagger shorter than recovery, quota unlock and nonempty bounded weapon models. JS syntax checks passed. Lead browser QA still required for visual hand fit and field broker catalogue. Existing combat network/ammo validation limitations remain those of the shared combat system; this module does not introduce an alternate damage route.
