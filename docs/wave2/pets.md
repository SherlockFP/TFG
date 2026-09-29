# PETS (module `pets`, design: docs/MASTERPLAN.md section 18) - FIRST CUT, node-tested only (NOT hand-played, no headless run)

Files: `src/game/pets_core.js` (pure rules/data), `src/game/pets.js` (install), `src/models/pets.js` (9 procedural species), `src/ui/panels/pets.js` (PET panel), `tools/harness/pets.test.mjs`.
Wired with `this.useModule('pets', installPets)` in game.js. Persisted in `profile.pets` (survives run resets). Keys: **N** = PET panel, terminal `PETS`.

## Done
- 9 species (cat dog fox bear bee owl parrot crow bot): role, base stats, 3 ability slots (Lv 1/10/20) with numeric `fx`, 3 evolution stages (Lv 1/10/20, e.g. Pup > Dog > Server Hound), traits (8), shiny (2%, palette swap + sparkle), colour variants.
- XP/levels 1-30, loyalty + obey chance, capture odds (`captureChance`, Pet Carrier item registered), eggs `pet_egg_common|wild|glitch` + Unknown Egg -> incubator (2 slots, hatch after N game days, tracked by `profile.pets.clock`), KO/rest rules, stable of 6, release/rename/set active.
- Skins: collars, hats, colour, seasonal (Store Clout / achievement gated / in-season). HQ pet shop = panel SHOP tab (Clout, HQ only). Items in Company Store category `pets`.
- Panel tabs: STABLE (stats, abilities, evolution tree) - NEST - SKINS - SHOP. EN + TR + RU strings. A client-side follower shows YOUR active pet next to you (waits during mirror/board: `game.mirror?.active`, `game.boardgame?.active`, `game.petsBlocked`).

## NOT done (next round; rules are ready in `petStats()`)
Host-simulated behaviour and net sync: fetch (walk to small scrap, carry to owner/ship), attack (aim key), guard, role abilities (cat sense marks, fox nest theft, bear tank via `hostHurtPlayer` wrap, bee DoT, owl night vision, parrot decoy, crow tier luck, bot shield/recharge), 'pt*' net types + late join, physical incubator prop + HQ shop kiosk, chest/boss egg drops, pet achievements. Suggested design: host map ownerId -> pet record, owner sends `{op:'sync'}`/`{op:'cmd'}` through one request handler `pt`, host broadcasts `ptinfo` (appearance) + `ptst` rows; carried items use holder `c:pt<owner>`.

**UPDATE (wave 3 [finish]):** the NOT-done list above (host-simulated fetch / attack / guard, role abilities, `pt*` net sync, Pet Carrier + treat handlers, incubator prop) is implemented: see docs/wave3/finish.md.
