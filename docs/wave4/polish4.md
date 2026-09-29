# Wave 4 - POLISH4 (module `polish4`): small gaps + bug sweep

Files: `src/game/polish4.js` (glue), `src/game/polish4_core.js` (pure rules), `src/game/polish4_i18n.js` (TR + RU), `src/ui/panels/polish4_barter.js`,
`src/ui/panels/pets_studio.js` (PET turntable). Tests: `node tools/harness/polish4.test.mjs` (16), in-game run `tools/harness/wave4_polish4.js`.
Installed with `this.useModule('polish4', installPolish4)` (right after worlds2 in `game.js`). Net: request `p4act {op}` (decals / furniture), `p4bt {npc,i,item}` (barter),
host -> peer `p4msg {k}` (HOST_ONLY). Nothing else touches the wire.

## 1. Pet egg drops (host, seeded)
* Chests (`tfg:chestOpened`): wood 2 %, iron 5 %, gold 10 %, void 20 % (`CHEST_EGG`). Type by tier: wood = Spotted; iron = Spotted / Wild 70/30; gold = Spotted / Wild / Glitch 25/60/15; void = Wild / Glitch 55/45.
* Creatures (wrap of `hostOnCreatureKilled`): regular 0.5 %, elite 4 %, rare+ tier +2 % per tier step (rare: +2, epic +4 ... on top of the elite / base rate); **boss 35 % Wild + 15 % Glitch**. Never from swarm zombots, cantina NPCs, mines, turrets or hazards.
* Rolls are `RNG(hash(seed|day|kind|id))`: same source on the same seed / day always rolls the same. **Pity**: every landing without an egg is a x1.5 multiplier on the next roll (cap x3); a hard cap of **2 eggs per game day**.
* The egg falls as a normal item (`pet_egg_common|wild|glitch`, registered by `pets.js`), a `sys` line tells the crew ("A pet egg dropped!"). Hatching flow already existed (use the egg in the ship -> incubator -> hatches after 2-4 game days, PET panel NEST tab / ship incubator prop): tested end to end in `wave4_polish4.js`.
* Knobs: `CHEST_EGG`, `EGG_DAY_CAP`, `pityMul`, the tables in `rollCreatureEgg` (all `polish4_core.js`).

## 2. Shipyard gaps
* **Workshop luck**: `rpg.bonus('craftLuck')` is wrapped and now adds `shipyard.effects().craftLuck` (Mk I / II / III = +0.03 / +0.06 / +0.10, same scale as the aptitude / tree bonus). The crafting panel already sends `luck()` with every craft, so the tier roll and the upgrade odds read it.
* **Decals**: 6 emblems (skull, bolt, star, eye, phish, TFG; 20-30 credits) painted on both hull sides (x = -4.6, y = 1.5), tinted with the hull colour. Terminal `DECAL` / `DECAL <name>`.
* **Furniture + placement mode**: 6 floor pieces (rug 25, plant 20, bean bag 35, crate shelf 40, floor lamp 45, trophy pedestal 50), max 12, area inside the core cabin (`FURN_AREA`), solid pieces get a static collider on every peer, rugs are flat and walk-over. Terminal `FURNITURE`, `FURNITURE PLACE <name>` (closes the terminal, ghost follows your aim on the floor, **R** rotates, **LMB** buys + places, **RMB** cancels; the ghost is red when blocked / too close to a wall / unaffordable), `FURNITURE REMOVE <n>` (half refund). The host validates: aboard the ship, phase orbit / company / moon, credits, area, overlap with other furniture and with the cabin props (same mesh-box scan as the ship-fault panel placer).
* State rides in `profile.shipyard.deco` (`shipyard_core.sanitize` got `deco: sanitizeDeco(raw.deco)`, 3 lines) so it survives fired runs and reaches late joiners through `run.sy` exactly like the modules.
* Still missing: faction unlock rewards (Archive -> Lab etc.), Trophy Hall artifacts, second vehicle slot, decals on the roof, wall furniture, music-room instruments.

## 3. Cantina barter (`worlds2` neutral aliens)
Walk up to a cantina alien (**E**, "Barter"): a panel with 2-3 offers that **rotate every game day** (`barterOffers`, seeded by run seed + day + npc id). Per NPC: (1) a consumable for credits (shop price x1.35, 2 in stock), (2) a **swap**: hand over the cheapest scrap you carry worth at least 60-120 for a mid-tier item (jetpack / belt bag / boom box / booster / ladder / adblock / blaster / spotted egg), (3) 35 % of the aliens also hold a rare item for credits (Wild egg ~340, blaster ~520, plasma blade ~900). Swaps and buys are host-validated (distance <= 4.6 m, alien alive and not angry, stock, credits, held scrap value); sold-out counts are broadcast (`p4msg sold`).
Economy safety: swaps only convert scrap into items (they never add credits), so the barter cannot beat the Company bell.

## 4. Dune Maw + squads
* `CreatureView.hidden` (entities/creatures.js) is now true for a dunemaw in `hidden` / `rumble`: no hit ray, no scan / sonar / photo. `CreatureManager.damage` is wrapped on the host: damage > 0 to a buried maw is dropped (AoE, pets, deployables, magic all funnel through it). Exposed / emerge stay hittable.
* **Squads** (`hs_enforcer / hs_gunner / hs_leader`, so the Soviet raids too): while the crew is far the gunners swing 9 m to alternating sides of the approach line, enforcers 3 m, the leader holds the middle; the offset fades to 0 inside 15 m (`flankOffset`). The soldier AI aims at `contact + offset * 0.5`, the wrapper writes `d.offset` accordingly and restores it as soon as the squad sees a target.
  Outdoors `CreatureManager.goTo` (straight line) is wrapped for squad members: when a head-height physics ray along the line hits static geometry, a side waypoint (5 / 8 / 12 / 17 m, both sides) with two clear legs is inserted (`detourPath`). Indoors the facility nav (A*) already routed them.

## 5. i18n second pass
`tools/i18n_audit.mjs` now follows imported dictionary constants (`addTranslations(TR_FOO)` / `...TR` spreads through `import`), which removed ~60 false positives. Result: **0 keys used via t() without TR or RU** (was 95 / 404), 0 local `{en,tr}` tables without RU (cemotes victory lines, spell words got `ru`). New file `polish4_i18n.js` holds ~380 EN keys with TR + RU. Also fixed: `shipfeatures` deny / info toasts now go through `t()`, a few host refusal strings (forge, repair, homeworld, xp reasons) got entries. Still open: about 1,900 "unwrapped" candidates in the report (most are `name` / `desc` data that `display.js` localises, sound ids, dev commands); creature `lore` strings built with `+` are not in the dictionaries (fall back to English).

## 6. Bug sweep (static + node)
* `tools/undef_check.mjs` (new, file-level no-undef scan): 0 real findings (4 hits are browser globals).
* Handler registration: duplicated `H(...)` / `on_(...)` registrations across modules are all wrap-and-chain (`cycle`, `siege`, `forge`, `lore`) or the same function twice (`gameplay2 g2`); no double-handler bug.
* Listeners: every `addEventListener` on `window` / `document` in modules has a matching remove in `dispose`; `setInterval` only in `main.js`.
* `tools/sim/balance.mjs` + `economy.mjs` after the loot x0.7 change: no NaN / Infinity, early game is still comfortable (day-1 solo death chance on hamsi 1.1 % camper / 0.4 % cycler; quota 130 vs ~890 hauled per 3-day landing by a competent crew; median 4-competent run reaches quota 9; XP to Rebirth ~22 h). Nothing needed a change. **Not fixed / noticed**: the sim's early quota is very easy (30x surplus) so the "starter moon" is more generous than the loot table suggests; `pity`-style knobs would be better than lowering more loot.
* Fixed while sweeping: buried Dune Maw hittable (above); `shipyard_core.sanitize` dropped unknown state; `role_skills` cooldown clamp (below).

## 7. Role cooldowns
Abilities stay 300 s, Revive Pulse 600 s. `cdOf()` (role_skills.js) is now `max(floor, cd * (1 - cdr))` with **floor 180 s** for every ability and **420 s** for Revive (the tree / role `cooldown` bonus is capped at 50 % anyway; the floor stops it at 3 min / 7 min). HUD cell shows the remaining time as **m:ss** (`4:59`), bright text over the dim overlay; the "on cooldown" toast uses m:ss too.

## 8. PET panel redesign (stable tab)
Left: the six slots as a list with a **rendered portrait** each (ACTIVE / zZz tags). Right: a **rotating turntable** of the selected pet (`pets_studio.js`: its own small WebGL renderer + own scene / lights, so the game light count is untouched, disposed with the panel), name, evolution + role, **level bar with XP numbers**, loyalty bar, HP / ATK / SPD chips, trait, buttons **Summon / Feed (n treats) / Rename / Release**, mode + delivery rows, abilities and evolution below. Nest / Skins / Shop tabs unchanged. New `pets.feed(id)` / `pets.treats()`.

## 9. Starting loadout / flashlight (owner request)
Verified in code (no change needed): nothing grants a starting flashlight - new runs start with 60 credits and the Company Store sells the Flashlight for 15 (also chests, outposts, crafting); `respawn()` and the tutorial hint ("Buy tools with STORE / BUY (a flashlight is a good start)") add none; the soulbound loadout gives only the melee weapon. Facilities always have pooled room / corridor lamps + emergency lighting, so the first moons stay readable without a light. The `late-join` mod text ("grab a flashlight from the cupboard") is stale (the cupboard is a prop) - for the tutorial writer: say "buy a flashlight at the terminal".

## Known gaps / unverified
* Furniture placement, decals and the barter panel were exercised through the host path in `wave4_polish4.js` (see the shot); hand-feel of the ghost placement and the panel layout at 1280x720 needs a human pass.
* Squad flank / detour never watched in a real raid; tactical numbers (9 m, 15 m) are guesses. The physics ray detour treats steep slopes as blockers at head height (1.4 m).
* Barter `role` (bartender vs patron) is not used (a client cannot know it); every alien has the same rules.
