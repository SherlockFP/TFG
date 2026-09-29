# Wave 8: hubgate (Hub door, unlock ladder, QUICK SHIFT)

Owner decisions: side systems are not deleted, they open one by one behind a Hub door, out of the first hour and out of the HUD. The quota campaign stays the default; QUICK SHIFT is an equal big button in the main menu.

Files: `src/game/hubgate.js` (module), `src/game/hubgate_core.js` (pure), edits in `onboard_core.js` / `onboard.js` / `onboard_text.js` (ladder + guards + gift text), `world/shiplayout.js` (Hub door), one guard line each in `rpg.js`, `daily.js`, `zones.js`, `shop.js`, menu entries in `ui/crtmenu.js` + `ui/artdir_menu.js`. Test: `node tools/harness/hubgate.test.mjs`.

## Ladder (persistent per profile; the host's ladder rules the crew)

| quota | opens | what was hidden while locked |
|---|---|---|
| 1 | store rare+ tiers, skill tree | store stock shows "Unlocks at quota 1"; K key, `TREE` / `ROLE` / `RESPEC` |
| 2 | arcade + chess, pets | cabinet / chess table prompts, `ARCADE`; N panel, incubator, `PETS` |
| 3 | homeworld, farming + cooking, restaurant | `ROUTE HOME`, `HOME/FACTORY/GHOST`, docks `h2`/`h2g`; planters, stove, brew stand prompts; restaurant (module `resto` must call `game.onboard.deny('restaurant')`) |
| 4 | forge, zones | forge stations (existing guard); the whole zones layer (`enabled()`), `ZONES` |
| 5 | voyage, daily + season | `MOON RANDOM`, `SIGNALS`, `MISSIONS`, dock `vyprompt`; F2, `DAILY`, dock `daily` |
| first boss | glitch gates | unchanged (cycle3) |

- Hiding: HUD docks by CSS while locked (`hiddenDocks`), terminal words answered with the lock text and removed from HELP (onboard.js wrapper, map = `HUB_CMDS`), ship interactables inside a locked system's zone (circles around shiplayout spots) replaced by ONE "Unlocks at quota N: NAME" prompt (`interactablesNow` wrapper), hotkeys guard themselves with `game.onboard.deny(id)`.
- Unlock = onboard's gift (one Algorithm line, `gift.<id>` EN/TR/RU) + a big banner card (`hubgate.card`). Settings > "Unlock everything" (existing) opens all locally.
- Joiner: the host publishes `run.hub = { mode, q, boss }` (normal run sync); `game.hubgate.remoteHub()` makes `onboard.locked()` use it. A veteran host (`mode: 'all'`) opens everything for the crew.
- Foraging and eating at the mess table stay open on purpose (owner rule: healing only via food).
- Hub door: `SPOTS.hubDoor` (cockpit face of the bulkhead, north of the hatch), box + standing spot in shiplayout, `ship2_overlap` 0. The leaf slides open and the lamp turns green once anything is open; E opens the Hub panel (all systems, open / locked line, buttons for tree, pets, season).
- First run: one objective at a time is Hiring Day's design (unchanged); the morning vote (algo1) never opens on days 1-2 nor in Quick Shift (one condition in algo1.js).

## QUICK SHIFT

Menu button -> `hostGame({ quick: true, isPublic: false, slot: 0, runData: null })`. On `hostStart` the host writes `quickFields`: seeded moon among hamsi / lufer / palamut / levrek (tier 1-2), `daysLeft: 1`, quota 90 (tier 1) / 120 (tier 2), `config.dayLengthSec = 900`, `run.quick = { v: 1, n }`. `run.quick` reaches a joiner in the welcome / gs state, so code / link joiners get the mode. `hostSave` is skipped while `run.quick` is set; `progressOf` returns quota 0 (ladder frozen); Hiring Day is skipped; XP and clout still pay (survive XP as usual + a bonus, more when the quota is met). After the day report every peer gets the end card (`ui.playCinematic('quickend')`): results, PLAY AGAIN (new seeded moon, in-place reset like the 'fired' flow), START CAMPAIGN (fresh campaign run, first free / oldest save slot, never the newest), LEAVE. Joiners see "waiting for the host".

Knobs: `QUICK` in `hubgate_core.js` (moons, quotas, day length, rewards), `SYSTEMS` (what each id hides), `UNLOCKS` in `onboard_core.js` (ladder).

## Net

Prefix `hg`: `{ k: 'close' }` host -> crew (end card goes away after PLAY AGAIN / START CAMPAIGN). Everything else rides `run.hub` / `run.quick` in the existing run sync.

## Remaining / not verified

No browser run: Hub door mesh and panel, end card, prompt replacement radii, quota / clock balance, start-campaign slot choice. Skill tree "3 roles x 8 nodes" is a separate task. Season / daily chips in the main menu DAILY panel stay reachable from the menu.
