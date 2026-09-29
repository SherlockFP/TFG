# Honest critique log (updated every development round)

## Round 1 snapshot (before the quality rounds)
| Area | What is bad right now | Planned fix (round) |
|---|---|---|
| Look | Flat, dim lighting; no light halos/volumetrics/bloom; sky is a flat gradient; props mix two art styles; ship exterior is a box | Visuals pass: halos, volumetric cones, bloom, grading, sky/clouds (R4 visuals); ship/HQ art (R4 worldart) |
| UI | Menus look like a debug page; inventory has no icons; end of day is a small text box; no objective display | UI overhaul, item icons, 3D character preview, performance report with grade (R4 ui) |
| Feel | Hits have no reaction; swing barely visible; viewmodel poses awkward; scan has no world effect; pickups feel dead | Hitstop, knockback, particles, LC scan wave, better viewmodel (R4 feel) |
| Goals | Player only sees the quota; bounties hidden at HQ; nothing tells you what to do next; weak reasons to come back tomorrow | Objective tracker, daily events, collections, achievements/titles, daily login, favor streak (R3 achievements, R4 goals) |
| Theme | Fish/"Kefal" theme doesn't resonate | Re-theme to VIRAL COMPANY / internet content (docs/THEME.md) |
| Social | Only 2 emotes, you can't see yourself, no pings, open mic by default | Emote wheel + many emotes + third-person emote cam, ship mirror, pings, push-to-talk V default (R2 ship, R3 pings, R5 emotes) |
| Pacing | Monsters can instakill you seconds after entering; spawn mix is pure dice | Horror director (tension/relief), boss encounters (R2) |
| Variety | Every facility floor is flat; outdoors mostly empty; same two interiors | Catwalks/steam/flooded set pieces, mineshaft theme, outdoor outposts with loot crates (R2, R3) |
| Audio | 21 confirmed issues (device loss, BT hands-free, etc.) | Deferred by request — docs/AUDIO_AUDIT.md |
| Onboarding | Only toast hints | Objective tracker doubles as a tutorial (R4 goals) |

## Round 3 - content wave (integrated, not yet playtested)
- Better: endless generated sectors (moongen.js) with 4 new biomes and bigger maps; 7 new creatures + Legacy Bot; 25 scrap + 5 tools;
  drivable Uplink Van; codex / weekly / rebirth / crews meta; 24 LC mods built in; feel pass (arcs, footsteps, 3D scan); CRT UI everywhere.
- Risk: huge untested surface. Balance numbers are first guesses (creature damage, rebirth XP curve, weekly), performance on 2.6-size
  facilities + 1.5x maps + 174 preloaded models is unmeasured, and many strings (toasts, terminal) are still English only.

## Round 3 - dungeons (interior themes)
- Better: 8 interior themes instead of 3 (office, backrooms, serverfarm, sewer, hospital added), each with its own layout rules, landmark hub room, light colour, fog tint, ambience and footsteps; maps up to size 2.6; laser grids / breaker rooms / cave-ins / vent shortcuts / sludge give every theme active hazards.
- Still weak: no real multi-floor dungeons; prop variety inside the new themes leans on a small new prop set (cubicle, racks, beds); hazard balance (laser 20 dmg + alarm, cave-in 30 dmg) is untested with real players; vent crawl has no third-person animation for other players.

## Round 2 snapshot (2026-09-28, after wiring all agent modules + report/cinematics/icons)
| Area | Now better | Still bad / next |
|---|---|---|
| Look | Bloom, light halos, mineshaft interior (timber, cage lanterns) looks like a real place | Facility corridors still samey; ship exterior; outdoor sky flat |
| UI | CRT Black Ops menu, animated PERFORMANCE REPORT (S–F stamp + crew badges), QUOTA MET confetti, DEPLATFORMED terminal cinematic, inventory icons | Submenus (host/join/settings) still look like web forms; no 3D character preview; `▮` glyph renders as a wide block in the pixel font |
| Feel | Death screen now has cause + tip, overlapping banners hidden while dead | Still no hitstop/knockback/hit particles; scan has no 3D wave; weapon swings weak |
| Goals | Objectives tracker, achievements + titles + daily login, affixed weapon loot (MMO rarity), boss The Foreman | No daily moon events, no collection log; boss fight feel untested by hand |
| Balance | Foreman HP 1800→1100 (solo pipe ≈ 65 s) | Early-game instant deaths near entrance still possible (spawn fairness); affix sell value up to ~6× |
| Tech | 0 console errors across 3 moons | Facility generator/vault attach bug (docs/BUGS.md) still open; audio audit deferred |

## Round 3 snapshot (2026-09-28, big content round, commit 2966687) — gauntlet scores /10
Cheap evaluation (owner request): one scripted smoke over 11 configs (3 handcrafted moons, 3 generated sector moons,
5 new interiors forced on 56K-Dialup) → **0 console errors**; draw calls 233–711; host submenu restyled; 2 screenshots.

| Area | Score | Evidence | Next gap |
|---|---|---|---|
| Content variety | 8 | 8 interiors, 10 biomes, ~25 creatures, 25+ new scrap, van | quality pass per theme (office looks flat/dark) |
| Replayability / endless | 7.5 | new sector of 3–5 generated moons every quota, 13 moon modifiers, 15+ daily events, weekly seed, prestige, codex | unverified in a real multi-day run |
| Feel | 6 | movement bug fixed (identical 4.6–4.8 m/s at 30/60/144 Hz), 3D scan wave, weapon arcs | weapon arcs tuned blind; van driving untested by hand |
| UI / menus | 6.5 | CRT room + "TFG OS" terminal-style host menu, loading tips, codex/service record panels | `▮` glyph fix unverified; no 3D character preview |
| Visuals | 6 | new biomes (datascape/marsh/ash/crystal), CC0 packs (KayKit, Kenney, GGBot PSX cars, backrooms textures) | interiors dim/flat, per-theme lighting |
| Balance | 5 | nothing hand-tested; new XP curve re-levels existing profiles (regression) | XP migration, creature weights, van damage |
| Stability | 7 | 0 errors scripted; node gen tests over seeds | new creatures/van/mods never exercised at runtime |
| Performance | 6 | serverfarm 711 calls, gen0_1 factory 511 | instancing/merging for rack aisles & props |

## Wave 1 review snapshot (2026-09-28, reviewer pass on claude/focused-hawking-32j4um; full report: docs/REVIEW_WAVE1.md)
Evidence: smoke_land 0 errors on 3 moons, vite build OK, node checks (tree 1913, inventory core, 4800 facility layouts) pass. The browser
"day in the life" script (tools/harness/wave1_day.js) is written but was NOT run (budget cut); nothing was tested with 2 peers.

| Area | Score | Evidence | Next gap |
|---|---|---|---|
| Fun / loop | 7 | contract -> facility chain -> threat/greed -> extract -> case file | never hand-played; early game much tamer |
| Onboarding | 4 | ~10 systems, no tutorial, how-to lacked I/K/C/J/B (fixed), unbounded objectives | staged unlocks, objective cap |
| Theme | 7 | Algorithm lore 9, mechanic names 5 (PUSH/HEAL/Mana, COMPANY STORE) | net-speak rename |
| UI | 6.5 | consistent tokens, vector icons; toast stack vs right dock, cine banner vs Algorithm subtitle | HUD collision pass |
| Balance | 5.5 | sims thoughtful; 5 simultaneous early nerfs; dead stats (Blood Magic, lootLuck, reviveSpeed, interactSpeed, rangedDmg) | wire/hide stats, difficulty selector |
| Stability | 7.5 | wrappers audited (no double multipliers, no id clashes) | old-save migration test |
| Performance | 6 | unmeasured; one 7 MB main chunk | code-split, dc in facility |
| Multiplayer | 4 | client-trusted values, no 2-peer test of wave 1 | mp2 run + hardening |

## Wave 2 - ANOMALY (STATIC / mutations / dice / power-ups)
Built per MASTERPLAN #23 (docs/wave2/anomaly.md). Honest gaps: nothing hand-played, feature script written but never run (budget freeze), only node-model numbers for exposure pacing;
hallucinations are audio only; Decon booth placement in the ship unchecked visually; 2-player paths untested. Risk to watch: three writers of `engine.fx.noise/warp` (creatures, stun, anomaly).
## Wave 2 - HQ FORGE (progression hook)
Added: +1..+9 enhancement with a juicy machine sequence, overclocks, tier ascension, shards from every creature tier, creature tiers with auras.
Risks: everything visual (machine sequence, camo shader, nameplates) is unverified in a real browser; creature tier damage x4 (Mythic) may spike; forge stations placed blind next to the sell counter;
overclock effects (shock / burn / vamp) untested with 2 real players; economy: shard drop rates and credit costs are design numbers, not playtested.
## Wave 2 - ITEM DURABILITY (owner request: items should break like Minecraft)
Added: durability for weapons + worn armour (tier x class x forge-plus table), shatter vs BROKEN by tier, 25 / 10 % warnings, workbench REPAIR tab, Repair Kit, HQ mechanic, ageing (-5 % max per full repair).
Risks: numbers are design guesses (pipe 120 hits, katana 600, guns 250-500 shots) and untuned by play; attack detection is a `swingAnim` edge (a spell cast counts as a whiff); only the host path ran in a browser
(client prediction / batched `duw` flush untested with 2 players); the HQ mechanic bench is placed blind (x -14.4, z -36.9); broken armour is silently 0 stats (no HUD hint besides the bar / tooltip).
## Wave 2 - combat module (added blind, budget-capped session)
Melee combos / heavy / block-parry, 6 melee + 5 tech weapons (rocket jump, grenades, grav tool), 5 spells, Blood Magic and 12 role skills were added
(`docs/wave2/combat.md`). **Feel is unverified**: arcs / guard poses / hit timing were tuned by numbers only, `tools/harness/wave2_combat.js` has not been run and
nothing was hand-played. RMB is now block-hold / scan-tap while a melee weapon is held - check that this feels right before shipping.
## Localization round (EN/TR/RU)
Was: TR covered ~900 strings, everything else (toasts, terminal, host messages, item / creature / moon names, prompts) stayed English,
no RU. Now: EN/TR/RU with a picker + `navigator.language` default, ~2.3k RU / ~1.8k TR strings, display-name getters, localised host
messages, Cyrillic font fallback, RU voice spells, audit + codemod tools (docs/wave2/i18n.md). Honest gaps: passive tree / lore-log bodies /
some minigame strings are still English in TR+RU, wave-2 files were not covered, RU layout (longer text, Cyrillic in the retro fonts)
was verified by build and a scripted run only — no screenshot review yet.
## Wave 2 - music (module `music`, node-tested only)
Playable Acoustic / Electric Guitar, Keytar and Drum Pad (LMB = play mode, real notes, chords, 4-song follow-along, jam session chip, noise on moons).
Honest gaps: never played by hand in a browser (avatar strap poses, arm animation, panel layout, latency all unverified); 2 real players untested; bass / violin /
harmonica / bongos / kazoo / theremin, rhythm-game guide, busker hat and creature dancing were cut for budget. See `docs/wave2/music.md`.
## Wave 2 - creature emotes (module cemotes, docs/wave2/cemotes.md)
Creatures emote (idle / victory + chat line + victim camera) and react to player emotes (dance-along pacifies swarm/partygoer types 4-8 s, taunts enrage predators, mimics copy, shy types flee). Risks: taunt-enrage and the dance-along freeze are balance levers tuned by numbers only; bubble legibility in dark interiors and the killer-focus camera feel are unverified; the freeze (host AI skipped via stunT) also pauses a creature's detection for its emote length.
## Wave 2 - SKELETONS + tier looks
Added: 4 skeleton creatures (collapse/rebuild/smash, wind-up archer, shield knight, skull-hand swarm) with deleted-user tags, and a generic client tier look layer (colour + armour per tier for all creatures).
Risks: collapse / rise / guard / stagger poses and the username tag glitch were never looked at; Common skeletons read dark in fog; Mythic shader cost on many creatures unmeasured (SwiftShader 1.7 s/frame for the whole 30-creature scene); the Knight block is 85 % damage reduction and a Walker effectively has two lives, so early-sector time-to-kill is untested; zombot (instanced) cannot show gear.
## Wave 2 - MIRROR DIMENSION (module `mirror`, node-tested only)
Portal mirror on ~25% of outdoor maps (sector 1+), a flipped / ASCII / dark dimension with Vampire-Survivors waves, XP crystals, 8 temporary upgrades, Reflection Meter chests + power-ups, a 3:00 countdown with overtime,
cracked-reflection respawns and a SHATTERED wipe (`docs/wave2/mirror.md`). Honest gaps: never run in a browser (the dimension shader is a separate program with a safe fallback, but its look, the portal placement / colliders, model proportions,
card layout, dash feel and every 2-player path are unverified); some creature behaviours read `aiPlayers()` directly and might still notice players in the other dimension; world-projected DOM labels are not mirrored; numbers are design values.
## Wave 2 - grenades (hold-to-throw + bombs)
Every grenade now throws the same way (hold LMB, dotted arc, cook, bounce / roll, beeps) and there are 4 new common bombs + 5 rare drop-only ones (`docs/wave2/grenades.md`).
Risks: the aim preview and cook bar were never run with a real mouse (headless has no held button); visuals (smoke puffs, blackout dome, glitch slices, vortex) are unseen; 2-player sync is
untested; rare drop rates (void chest 80 %, boss always, world 28 % per day) and damage numbers (sticky 100, glitch 140) are design numbers; blackout also dims your own screen (vignette) while inside.
## Wave 2 - nickname + avatar (docs/wave2/profile.md)
The owner could not find a way to rename himself (a bare, unvalidated text box hid inside CHARACTER) and lobbies were anonymous. Now: PROFILE on the CRT menu,
validated nickname, pixel / 3D-snapshot avatar with frames, shown in the lobby browser, TAB, chat, summary and above name tags. Honest gaps: never opened in a browser
(layout, snapshot camera framing, pointer drawing, 2-player `pf` sync unverified), no avatars in the case-file panel, no gamepad drawing, slur list is deliberately small.

## Wave 2 - player trading (module `trade`)
- Built and node-tested (state machine, host flow with mock game, planner) but never seen in a browser: check the window at 1280x720, drag & drop, the tooltip comparison block, the popup keys N / M and the glyph icon drawings by eye.
- Clout is trusted client-side (debit handshake); fine for co-op friends, not for strangers. No trade history / log panel, no trading over the terminal, no NPC / hub trading yet (hub planet idea in MASTERPLAN #13).
- Icons: audit numbers (items without a model) still to be read from `ICONAUDIT`; glyph fallbacks are stop-gaps, the real fix is a model per item.
## Wave 2 - FPBODY (first-person feel)
Found and fixed by numbers (node, real LocalPlayer + Rapier): the walking "hitch" was a controller stall (7 % of frames at 0 m/s on flat floors) caused by the constant downward stick-to-ground push, and held tools were placed with the grip offset sign wrong
(shovel / rod / sledge behind the camera, 25 of 101 item models inside the forearm). Chat bubbles, first-person legs, two-hand arm IK and the view-model-over-world depth pass are written but **never seen in a real renderer** (headless run cancelled):
check bubble size / font, leg look when crouching, elbow direction of the IK arms, outlines on the view model, and that the ship mirror does not show the first-person body. PSX vertex snap still shimmers while walking (setting `vertexJitter`).

## Food & drinks (wave 2, module `food`)
Added optional buffs + social fun (cheers, cake, table, booze). Unverified in a browser: first-person eat arcs, blur overlay, table / machine placement. Booze courage only touches STATIC; no chat bubbles exist to slur yet.

## Wave 3 - SHIPYARD (module `shipyard`)
The ship finally grows: twelve Mk I-III modules on eight hardpoints (doorways cut into the core walls, nothing in the cabin moved), Frame Console + ship-part drops, paint / name plate, weight = route cost + Threat + siege hull. Honest critique: it is all node-tested (rules, model sanity, an installer run against the real ship + a fake game) and never seen in a renderer, so scale, prop placement, paint z-fighting on the hull and the roof lift are unchecked.
Design weak spots: free travel is on by default so the "+5 % route cost" is a small surcharge unless the host turns it off; several effects are small numbers (Rested buff, Overwatch) that may not read as gameplay; the Trophy Hall is per-client cosmetic; creatures ignore module walls outside SIEGE; there is no -x hardpoint, no furniture placement mode, no faction unlocks. Module count vs sockets (12 vs 8) is meant to force choices, but nobody has played it to see if it feels like a choice or a chore.
