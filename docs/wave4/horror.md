# Wave 4 - HORROR (module `horror`)

Owner ask (TR): pay-to-arm traps in the labyrinths (RE laser scene etc.), an RE-style outbreak wing with zombies + a little ammo, a Minecraft woodland-mansion style manor,
bigger-on-the-inside rooms, chalk to mark the way back + creatures that fake it. Later add-on from the lead: a fake closet that ambushes.
Status: **node-tested + builds, NOT run in a browser** (owner quota rule). First job with a browser: `tools/harness/wave4_horror.js`.

## What exists
| Piece | Files | Notes |
|---|---|---|
| Pay-to-arm TRAPS (laser grid, ceiling crusher, spike floor, live floor, flame vent) | `horror_core.js` (table, pricing, state machine), `horror_traps.js` (visuals + wall panel), `horror_host.js` (damage, refunds) | Panel on a corridor wall: E = pay `run.credits`. Armed 150 s, a CREATURE entering the lane triggers telegraph -> strike. Players inside the lane get hurt too. Kills credit the payer (XP through `attackers`) and refund 12 % of the price per kill (max 60 %). Emissive/basic materials only: no lights added. |
| OUTBREAK wing (quarantine door + crest) | `horror_maps.js` OUTBREAK, `horror_pocket.js`, `horror_creatures.js` | 8-10 Shamblers (42 hp, slower than a crouching player, grab + gnaw, headshot x2.2), a `pistol` (8 rounds) on the reception desk + rare 6-round ammo box, safe room (typewriter = XP + stamina, item box stash, 3 Green Herb planters = FOOD item `fd_herb` +35 HP), its own crusher trap corridor, loot + a Sealed Sample Case. Door needs the Wolf Crest (`hr_crest`) which lies in another reachable room. |
| MANSION | `horror_maps.js` MANSION | Dark oak, 20 x 24 m tall foyer with pillars + chandelier, grand staircase to a balcony, wings, 3 secret bookcase doors with treasure rooms, 4 Manor Wardens (axe chasers). Two floors. |
| Bigger-inside CLOSETS | `horror_closet.js`, `horror_pocket.js` | 4 pocket kinds: outbreak, mansion, ballroom ("The Cupboard", 60 x 40 m, 7 m ceiling), warehouse ("The Back Room"). A 1.7 x 1.4 m wardrobe stands against a facility wall; walking into the open closet crosses a plane and `portalMap()` teleports you to the pocket's alcove with the same lateral offset, height, velocity and rotated view (round trip tested). Pockets live at x >= 8000 on the facility floor plane (indoor logic keeps working). |
| CHALK + The Forger | `horror_chalk.js`, `horror_core.js` (ChalkStore), `horror_creatures.js` | Free `hr_chalk` for everybody at landing (also 6 credits in the store). LMB arrow (points where you are heading), crouch + LMB X, E rubs out. 24 marks per player, 160 total, 10 fakes; 8 instanced quads. The Forger (rare, only once 5+ real marks exist, day >= 2) walks to your arrows, scratches (audible, telegraph) and erases / redraws them turned. Fakes are ruler-straight with a third tick on the head (item tip says so). |
| FAKE closet (ambush) | `horror_closet.js` (`fake`), `horror_host.js`, `horror_creatures.js` | 30 % of facilities from day 2 / sector 2, one per facility, far from the entrance. Tells: door "breathes", cold mist under it, faint scratching within 9 m, two too-clean Forger arrows leading to it, scanner label "Storage Cabinet?". Open by hand while close = lethal lunge (0.28 s). Counterplay: crouch + E = knock (it answers, bursts out non-lethally after 1.3 s), or a long tool in hand = hook the door from 3.3 m (0.9 s growl first). |

## How to test
* `node tools/harness/horror.test.mjs` - rules (traps, pricing, placement over 112 layouts, pocket maps, chalk, balance, fake rules, i18n) - 6.7k checks.
* `node tools/harness/horror_build.test.mjs` - stub physics: pocket geometry + nav paths to every spot, closets + portal maths, trap visuals through all states, chalk view, models, creature AI on a fake manager.
* `node tools/harness/horror_install.test.mjs` - installer against a real generated facility: mapLoaded build, populate, arm / strike / kill / refund / expiry, crest, portals both ways, chalk over the wire, headshots, fake closet, late join, dispose.
* Browser (not run): `tools/harness/wave4_horror.js` (see its header). Use a factory moon with size >= 1.2 (`orkinos`) on day >= 2.

## Net (all prefixed `hr`)
`hrReq` (request, ops arm|door|crest|fake|chalk|wipe|head|herb|rest|box|secret|sync), `hrs` (host -> all: trap table, doors, locks, herbs, secrets, box counts, full sync), `hrfx` (host -> all: shake, refund, deny, knock, unlock, rest), `hrch` (host -> all: chalk add / remove / full). `hrs`, `hrfx`, `hrch` are HOST_ONLY.

## Knobs
`TRAPS` / `TRAP_RULES` (price, charges, damage, refund) and `HR_DEFS` / `ZOMBIE` / `SIDEARM` / `CHALK` / `FAKE` in `src/game/horror_core.js`; plan weights `POCKET_WEIGHTS`, fake chance 0.3, trap count formula in `planFacility`; pocket layouts are rectangles in `horror_maps.js`.

## Integration / extension point
No generator edits. `game.horror` reads the finished layout on the `mapLoaded` event (`planFacility`, deterministic from the seed, own RNG fork) and builds extra objects; other modules can `game.mods.on('horrorPlan', (plan, game) => ...)` (fired after planning; plan.traps / plan.closets / plan.fake are mutable) and read `game.horror.{plan, closets, pockets, traps, chalk}`. Shared edits: `game.js` (import + slot only). Patched on the instance and restored on dispose: `creatures.nav / playersFor / raycast / damage`, `game.deathText`.

## Known gaps
* Never seen in a browser: closet / pocket lighting and look, trap beam readability, portal feel, panel text legibility, chalk glyph look, creature models.
* Pockets are separate rooms (portal), not wings of the facility; only one closet per room; no closet on backrooms / mineshaft themes.
* Item box keeps items only until the ship leaves (no persistence across days); weapons / bags / bodies cannot be stashed.
* Fake closet: throwing an item at the door is not a trigger (knock + hook only). The Forger never chooses routes by the real ship path, it just mangles random real arrows.
* Traps only trigger on creatures (not players); a strike does not stack XP beyond normal kill credit.
* Illager-style mansion enemies are plain chasers (no ranged / evoker types). No zombie corpse-gore variants.
