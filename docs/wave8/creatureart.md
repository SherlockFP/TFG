# Wave 8 - creature readability + animation pass (`src/game/creature_read.js`, `src/models/creature_variants.js`)

Owner: "zombies are invisible, they have no models / animations". Director critique: creatures must be readable.
Verification: node only (`node tools/harness/creature_read.test.mjs`, 72 creature types) + gameplay2 / crdirector / lcmonsters / horror / stealth_listener / balance_rules / artpass / perf2 + `npm run build`. **No browser run** (QA owns it): the poses and glow strengths below are NOT eyeballed.

## What was wrong (audit of the 72 types that register a model)
- The core builders (`models/creatures.js`, 26 types) were already fully rigged (gait, attack, hurt via `common()`, dead pose). Their problem was the **eyes**: yoinker, mannequin, hound, giant, moderator, stalker had near-black eye materials, so nothing glowed in the dark.
- Registered add-on models (horror shambler / forger / ambusher / warden, maps5, mirror, backrooms, listener, skeleton hand, Lc monsters) have a walk cycle and a fall, but a flat attack (no telegraph), no flinch and (mirror / backrooms / listener / skeleton swarm) no glowing tell at all.
- The Creature Director monsters re-used another creature's model verbatim: Dimmer = Data Hoarder, Follower = Parasocial (phone included), Auditor = Customer Support.
- balance_rules holds every hit for 0.4 s after the attack state starts, but the Mannequin (NPC) attacked from `run`, so the wind-up was an invisible delay.

## What changed
1. **Emissive tell for every hostile** (`ensureTell`, run once per view by `dress()`): models with eye materials get any dark eye lifted to the type's tell colour (`tellColour`, per-type overrides + palette hash; the elite red and affix colours still win); models with their own bright unlit lamp / eyes are left alone; the rest get ONE shared unlit pair of eye dots (`MeshBasicMaterial`, `fog:false`, shared geometry, at the head). No lights. Exempt on purpose (the disguise is the threat): Deepfake `mimic`, `mr_copy`, `lm_lootmimic`, `lm_masked`, hazards, the instanced `zombot` swarm.
2. **Pose layer** (`apply()`, transform only on the view root, YXZ order, under `feel.deathPose`, skipped when dead and beyond perf2 `QUALITY.lodFar`): walk / run bob + forward lean by measured speed; **attack wind-up** = lean back and crouch for `RULES.windup` (0.4 s) then a forward strike snap (states attack / lunge / stab / snip / slam / stomp / shove / kick / scratch / hug / charge / bite; windup / aim / draw hold the lean); **hit flinch** from `hitFlash`; the added tell dots swell during the wind-up. Lean is scaled by `sizeK(height)` so the 8 m Influencer does not sweep 2 m. Death keeps using `feel.deathPose` (topple / bounce / dissolve) for everything except `NO_TOPPLE` types, which have their own dead pose.
3. **Distinct models** for the Creature Director monsters, wrapping the base model (all its states are kept) and registered in `mods.creatureModels` by `installCreatureRead`:
   - `cd_dimmer`: dusky violet-grey Hoarder, anglerfish LURE (bent stalk + bulb that flares when feeding and dims when it flees) and dead bulbs along its back.
   - `cd_follower`: ashen, stretched 0.9 x 1.14 x 0.9, phone hidden, huge cold-white stare (flares while it advances), long hair curtain.
   - `cd_auditor`: brass-cast suit, top hat + band, gold monocle (glows, flares on audit / attack), chain.
4. `entities/creatures.js`: two one-line hooks (`game.creatureRead?.dress(this)` after the view is built, `game.creatureRead?.apply(this, dt)` before `feel.deathPose`) and the Mannequin now enters `attack` (stops and rears) before `M.attack`, so its 0.4 s gate is visible.

Knobs: `READ` in `creature_read.js` (bob, lean, windBack, strike, strikeT, flinch, amax); `NO_POSE`, `NO_TELL`, `TELL_COL`.

## Inventory (from `creature_read.test.mjs --table`)
tell: `eyes` = eye materials (lifted if dark), `bright` = model already has its own small unlit bright part (heuristic, NOT proof it is an eye), `added` = shared eye dots, `exempt` = see above. layer: `yes` = pose layer active, `own` = fixture / swarm / buried body that owns its transform. Last column = summed pose delta vs idle for walk / attack / dead in the model's OWN animation (0 = the model does nothing for that state; the pose layer / feel.deathPose covers it where layer = yes).

| type | model builder | tell | layer | own walk / attack / dead |
|---|---|---|---|---|
| scuttler | scuttler | eyes | yes | 3.2 / 1.1 / 13.7 |
| yoinker | yoinker | eyes | yes | 1.9 / 5.5 / 11.0 |
| crawler | crawler | eyes | yes | 1.9 / 6.0 / 4.9 |
| lurker | lurker | eyes | yes | 3.0 / 4.3 / 9.3 |
| mannequin | mannequin | eyes | yes | 1.3 / 3.4 / 3.9 |
| sludge | sludge | eyes | yes | 0.6 / 1.9 / 4.5 |
| jester | jester | eyes | yes | 2.1 / 8.1 / 13.7 |
| spider | spider | eyes | yes | 2.8 / 9.5 / 24.6 |
| leech | leech | eyes | own | 2.9 / 0.7 / 4.2 |
| screamer | screamer | eyes | yes | 2.0 / 0.3 / 11.4 |
| mimic | mimic | exempt | yes | 3.0 / 4.0 / 10.5 |
| hound | hound | eyes | yes | 2.6 / 0.8 / 10.7 |
| giant | giant | eyes | yes | 2.2 / 4.1 / 8.1 |
| sandkefal | sandkefal | eyes | own | 0.0 / 399.3 / 114.9 |
| turret | turret | exempt | own | 0.0 / 5.0 / 5.2 |
| mine | mine | exempt | own | 0.0 / 1.2 / 0.0 |
| moderator | moderator | eyes | yes | 0.9 / 0.0 / 4.6 |
| support | support | eyes | yes | 1.3 / 0.6 / 2.6 |
| ticketswarm | ticketswarm | eyes | own | 21.5 / 21.5 / 1338.7 |
| editor | editor | eyes | yes | 0.2 / 0.2 / 1.9 |
| tamagotchi | tamagotchi | eyes | yes | 0.2 / 0.1 / 1.6 |
| stalker | stalker | eyes | yes | 0.9 / 0.0 / 0.1 |
| clickbait | clickbait | eyes | yes | 3.1 / 0.1 / 2.4 |
| replyguy | replyguy | eyes | yes | 1.4 / 0.8 / 6.1 |
| h2_sentry | turret | eyes | yes | 0.0 / 3.1 / 3.3 |
| h2_guard | giant | eyes | yes | 2.2 / 4.1 / 8.1 |
| sg_swarmer | scuttler | eyes | yes | 3.2 / 1.1 / 13.7 |
| sg_runner | hound | eyes | yes | 2.6 / 0.8 / 10.7 |
| sg_brute | sludge | eyes | yes | 0.6 / 1.9 / 4.5 |
| sg_boss | crawler | eyes | yes | 1.9 / 6.0 / 4.9 |
| hr_zombie | reg | bright | yes | 2.6 / 2.7 / 4.2 |
| hr_forger | reg | bright | yes | 2.3 / 0.1 / 1.6 |
| hr_ambusher | reg | bright | yes | 1.8 / 3.8 / 5.2 |
| hr_warden | reg | bright | yes | 1.8 / 1.9 / 3.3 |
| m5warden | reg | added | yes | 1.1 / 1.4 / 2.2 |
| m5sleeper | reg | bright | yes | 0.6 / 1.0 / 2.0 |
| mr_ghost | reg | added | yes | 0.0 / 0.9 / 3.1 |
| mr_fiend | reg | added | yes | 0.3 / 0.4 / 1.6 |
| mr_copy | reg | exempt | yes | 0.7 / 3.8 / 1.5 |
| dunemaw | reg | bright | own | 0.1 / 32.3 / 14.3 |
| tuskbeast | reg | bright | yes | 0.8 / 0.6 / 1.6 |
| scavraider | reg | bright | yes | 1.0 / 2.8 / 1.6 |
| alien_npc | reg | bright | yes | 0.9 / 2.3 / 1.7 |
| prowler | reg | bright | yes | 0.8 / 0.6 / 1.5 |
| br_smiler | reg | added | yes | 1.1 / 5.8 / 3.9 |
| br_hound | reg | added | yes | 3.2 / 8.9 / 5.9 |
| br_partygoer | reg | added | yes | 2.2 / 0.2 / 5.1 |
| br_moth | reg | added | yes | 0.0 / 0.0 / 0.0 |
| skel_walker | reg | eyes | yes | 3.0 / 5.5 / 15.2 |
| skel_archer | reg | eyes | yes | 3.0 / 3.5 / 15.0 |
| skel_knight | reg | eyes | yes | 2.6 / 2.6 / 15.6 |
| skel_swarm | reg | added | own | 1.0 / 0.6 / 5.0 |
| listener | reg | added | yes | 1.4 / 24.7 / 2.2 |
| spambomb | reg | bright | own | 0.1 / 0.0 / 3.3 |
| zombot | reg | exempt | own | 0.0 / 0.0 / 0.0 |
| hs_enforcer | reg | bright | yes | 2.7 / 2.2 / 10.8 |
| hs_gunner | reg | bright | yes | 2.7 / 0.3 / 10.8 |
| hs_leader | reg | bright | yes | 2.7 / 0.3 / 10.8 |
| doppel | reg | bright | yes | 3.9 / 2.1 / 10.3 |
| collector | reg | bright | yes | 3.2 / 4.9 / 3.6 |
| janitor | reg | bright | yes | 3.3 / 3.8 / 5.2 |
| hoardnest | reg | exempt | own | 0.0 / 0.0 / 0.0 |
| janitorbin | reg | exempt | own | 0.0 / 0.0 / 0.0 |
| cd_dimmer | reg | eyes | yes | 2.1 / 5.9 / 11.4 |
| cd_follower | reg | eyes | yes | 0.9 / 0.0 / 0.1 |
| cd_auditor | reg | eyes | yes | 1.3 / 1.4 / 2.6 |
| lm_witch | reg | bright | yes | 1.0 / 0.0 / 1.3 |
| lm_keeper | reg | bright | yes | 1.0 / 0.0 / 1.5 |
| lm_treater | reg | bright | yes | 0.0 / 0.0 / 1.5 |
| lm_hunter | reg | bright | yes | 1.0 / 10.6 / 2.0 |
| lm_lootmimic | reg | exempt | yes | 25.5 / 33.2 / 1.2 |
| lm_masked | reg | exempt | yes | 3.0 / 4.0 / 10.5 |

`reg` = registered through `mods.creatureModels` (horror_models, maps5_models, mirror, creatures_backrooms, creatures_wave1 / horde, skeletons, lcmonsters_models, stealth_models, creeper, worlds2_models, creature_variants). Not covered by the node table: external glTF monsters (`extcontent`: skeleton, robot), the cycle bosses (`cycle_bosses`, their own kits + telegraphs), Foreman / Legacy (bosses.js, own kits), `vy_specimen`. Fixtures `mimicdoor` / `web` have hand-made views in `entities/creatures.js`.

## Known gaps
- Nothing was looked at in the game. Check in the browser: lean amplitude on the big models (crawler, hound, giant), the added eye dots on the registered models (position uses the model's `parts.head`), the Dimmer lure / Follower hair / Auditor hat placement on the base head pivots, and that the dark-eye lift does not look noisy on the elite / affix tints.
- `tell: bright` relies on a size + brightness heuristic; a model whose only bright small part is a tooth / lens counts as covered.
- The pose layer is additive on top of models that already animate a lean (horror shambler damps root.rotation.x itself); amplitudes are small on purpose. If a model double-leans, add its id to `NO_POSE`.
- Creature LOD: beyond `QUALITY.lodFar` the pose layer is off (rotation reset), consistent with perf2's skipped model updates.
