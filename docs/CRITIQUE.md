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

## Wave 3 - WORLDS2 (Soviet raids, twin-sun planet, plasma blade, fauna, loot pacing) - node-tested only
- Everything is box geometry with flat PSX shading: the Soviet blocks should read as prefab panel buildings from 30 m (tint jitter + windows), but proportions / stair readability / billboard text orientation are unverified by eye.
  The twin-sun "second sun" is a sprite and fake shadow quads; no light is added, so the second sun does not light or shadow anything for real.
- Loot -28 % and decay / lockdown are numbers on paper: median 4-competent run ends one quota earlier in the sim, but nobody has felt it. Watch for "the last hour is punishing" (decay + lockdown + late spawns stack after 19:00) and for crews that
  simply skip the facility. The days-in-run factor is deliberately small (+3.5 % spawns per day after day 3): raise `DAYS` in `worlds2_core.js` if runs still feel flat.
- Raids reuse the wave-1 hit-squad AI (straight-line outdoors, no cover): they will feel like a clump walking at you. Cover-aware outdoor movement would make raids much better. Cantina NPCs only talk; no trading / quests yet.
- The Dune Maw can be hit while buried (only the radar hides it); the Tusked Beast charge has no dodge-window tuning beyond the 0.8 s paw telegraph.

## Food & drinks (wave 2, module `food`)
Added optional buffs + social fun (cheers, cake, table, booze). Unverified in a browser: first-person eat arcs, blur overlay, table / machine placement. Booze courage only touches STATIC; no chat bubbles exist to slur yet.

## Wave 3 - backrooms2
Noclip pocket + Backrooms entities + liminal overlay/photos are integrated but were only node-tested this round (browser budget): look at the VHS caption on small screens, the polaroid scenes, hug/struggle flow with two players, and the pocket hunt pacing (240 s warn, weighted Smiler / Hound / Partygoer) before calling it done.
- [ux wave 3] Not browser-verified: unified panel CSS may still miss panels with very specific injected styles; ship hull door opening, emote camera and new suit geometry were only node/build checked.

## avatar2 (wave 3)
- New rounded body is ~2.7x the triangles of the classic avatar (2.4k vs 0.9k) per player; fine for 4 players, watch the Doppel horde.
- Proportions/grips/first-person body were tuned by numbers only (no browser run): needs a visual pass.
## Net drops (wave 3)
Reconnect/resume, rejoin, TURN and backpressure are only exercised against a fake transport and BroadcastChannel. Never seen over real WebRTC: check `peerLost`/`peerResume` with Wi-Fi off for 10-30 s, that a resumed client keeps its held item and is not teleported, and that the 45 s ghost avatar of a crashed tab (no `bye`) is acceptable. No TURN server is configured by default.

## Wave 3 - finish (pets / maps2 / homeworld; docs/wave3/finish.md)
Node-tested + build only, no browser run. Pets now really fetch / fight / guard and everybody sees them (biggest risk: nav + net glue in `pets_net.js`, never played). maps2 challenge rooms are on: numbers (gamble EV ~46 vs 40, arena sizes, plate weight 60) are paper balance; the treasure-room collapse and Collapse / Migration events need a human to judge the fun / fairness. On-site homeworld raids use real siege creatures + flow field; tower tracers are simple beams. Honest gaps: no pet egg drops from chests / bosses, no pet achievements, Elevator Stop event, raider health bars, NPC workers.
## Wave 3 - SHIPYARD (module `shipyard`)
The ship finally grows: twelve Mk I-III modules on eight hardpoints (doorways cut into the core walls, nothing in the cabin moved), Frame Console + ship-part drops, paint / name plate, weight = route cost + Threat + siege hull. Honest critique: it is all node-tested (rules, model sanity, an installer run against the real ship + a fake game) and never seen in a renderer, so scale, prop placement, paint z-fighting on the hull and the roof lift are unchecked.
Design weak spots: free travel is on by default so the "+5 % route cost" is a small surcharge unless the host turns it off; several effects are small numbers (Rested buff, Overwatch) that may not read as gameplay; the Trophy Hall is per-client cosmetic; creatures ignore module walls outside SIEGE; there is no -x hardpoint, no furniture placement mode, no faction unlocks. Module count vs sockets (12 vs 8) is meant to force choices, but nobody has played it to see if it feels like a choice or a chore.
## Wave 3 - cycle2: Sector Core, 3 new bosses, Keystone, Raid, Endless (module `cycle`, docs/wave3/cycle2.md)
The 3-day + boss loop is now real (gate -> core with wings, a labyrinth and a card-locked arena -> chest / grace day / shameful exit) and the Mythic+ / raid asks are reachable from the terminal (`KEYSTONE GO`, `RAID GO`, listed in the objectives from sector 2).
Proven by numbers only: node tests drive the REAL host.js flow, the real CreatureManager and real layouts (soft-lock fuzz, weekly lock, all 8 themes); nothing was seen in a browser.
Risks: boss models and telegraph readability, the maze / arena look and lighting, whether a labyrinth is fun with creatures in it (it is a spanning tree + few loops), keystone / raid numbers (design values), 2-player sync of `run.cycle` and `cyx`,
the arena auto-open (720 s) as the only fallback for lost cards, Legacy Bot sector (outdoor boss, no cards) never seen, `shrines` mutator unwired, no Trophy Hall / CASE entry / first-kill cosmetic yet.

**Wave 4 - cycle3 (Glitch Gates in full, Trophy Wall, cycle dossiers, Elevator Stop, relays, Double shrines).**
Numbers-only proof again (node flow test on the real host.js + a short headless run): the sector cycle now has the promised depth (ranked / red / hidden gates, a gate break that can start a SIEGE, a puzzle at every core, a trophy per boss you beat) but nobody has walked it.
Risks: the Elevator Stop is a cab pocket at x = +6400 (creature AI towards an unreachable rider, teleports over the generic `tp` message, the door prop next to a room's own furniture), the statue / plaque / relay / tear visuals are untested for readability, red + hidden gates and the relay shield add friction to a loop that was already long (all fair-early rules hold: quota 0 = no gates, no elevator damage, E rank has no cards), balance numbers are design values.
Still open from MASTERPLAN 14.1: ARCHIVE (Archived Copy of a defeated boss), Hunter Rank; trophies are only on the ship (not the homeworld).

## Wave 4 - host migration (module `hostmig`, docs/wave4/hostmig.md)
"Host left = session over" is gone on paper: election, dialog, state rebuild and split-brain rules are node-tested with real `Session` objects and one 2-tab local run; never tried over real WebRTC or with a friend's flaky link.
Honest weak spots: only what clients already replicate survives (run, items, creature views) plus a 3-second `hmx` snapshot; creature AI side state, boss fights in progress and every host-only module cache (director, balance/Threat, horde, factions, contracts, siege...) reset to defaults because `hostStart` is deliberately not re-run; migrated sessions are not listed in the lobby browser; the "alive" test is `transport.peers` so a peer without a direct link to someone can disagree until the rank/epoch rules converge; anybody in the crew can forge a claim while a loss is pending (friends-game trust model).
## Wave 4 - GUIDE: the Algorithm as advisor + optional tutorial (module `guide`, docs/wave4/guide.md)
The terminal has ~40 commands and ~30 hotkeys/systems that new players never find; now The Algorithm nudges about things not yet used (context + cooldown, mutable), `GUIDE` lists and explains everything in EN/TR/RU, and a skippable 7-step onboarding runs through the objectives tracker.
Risks: tip tone/frequency is a guess (tune `COOLDOWN_S`, `MAX_PER_SESSION`), usage detection of remapped keys / daily-rewards UI is heuristic, tips share the intercom box with the villain lines (they wait while it is busy), the sell step needs an HQ trip, nothing seen with a real 2-player crew.
## Wave 4 - COSM5 cosmetics drop (module `cosm5`, docs/wave4/cosm5.md)
59 new cosmetics (14 suits, 19 hats, 10 back items, 10 weapon skins, 6 emotes) with a rotating shop, boss trophies, secrets and a `cosmeticPool(tier)` helper for crates. Everything is procedural and node-tested (every id builds, FP-clip check, sync roundtrip, skins on real weapon models); the GLSL skins and the Glitch shell were only seen in software GL headless runs.
Weak spots: skins are not on inventory icons, one global skin per player, hats / suits were tuned by numbers not by eye on the avatar2 proportions (tune `cosm5_models.js`), the shop uses the local UTC day, the daily-reward wiring is the other module's job.
## Wave 4 - polish4 (docs/wave4/polish4.md)
Closed the small wave-2/3 gaps (egg drops, ship decals / furniture / Workshop luck, cantina barter, buried Dune Maw, squad flanking, role cooldown floors + m:ss HUD, PET panel with turntable, i18n to 0 missing TR / RU). Honest critique: the placement ghost, barter panel and squad tactics are host-path / headless-tested only, never hand-played; the barter is a single stock table with no NPC personality; squads flank with a fixed 9 m swing and a 1.4 m head-height ray detour (slopes read as walls); the early sim shows ~30x surplus over quota 0, so the "comfortable start" is already generous and extra loot cuts should be done with knobs, not more content. Furniture is floor-only (no wall pieces, no decal on the roof, no faction unlocks).
## Wave 4 - DAILY: login calendar, challenges, crates, season track (module `daily`, docs/wave4/daily.md)
There is finally a reason to come back tomorrow that is not a grind: a gentle 7-day calendar with a grace day, three daily + three weekly challenges everybody shares, crates that are earned (never bought) with a proper reveal, a free monthly season track, first-win x2 and a bit of level-up / quota juice.
Proven by node tests (streak / grace / clock guard / seeded sets / crates / season / service on the real cosmetics catalog); the browser scripts exist but were never run and nothing was hand-played. Risks: reward numbers are guesses, the reel needs a look with real audio, "survive an anomaly" is a proxy (STATIC stage 2 + survive), kill-based challenges ignore pet / grenade kills, the clock guard is a deterrent only (all local), nobody tested `dyclaim` with two players.
## Wave 4 - arcade: chess, dama, carnival (module `arcade`, docs/wave4/arcade.md)
Downtime finally has something to do with friends: chess / dama tables (ship, HQ pier, homeworld pad) and a three-booth carnival on the HQ pier. Rules are node-proven (perft, mate, dama captures, prize economy); the feel is not: piece glyphs depend on the system font, the carnival is a small corner that may feel sparse, booth physics are hand-rolled and forgiving, and the client-played rounds are only clamped by the host (fine for co-op, not for leaderboards). No draw offers, clocks or hard AI; carnival only exists on the HQ pier (not on the homeworld).
## Wave 4 - SOCIAL hub (module `social`, docs/wave4/social.md)
Players can finally see each other outside a lobby: HUB panel (online / public lobbies / friends), DMs, invites with Join, ship phone notice and a walkie text radio, all serverless and opt-out. Weak spots: it is a full-mesh Trystero room (fine for dozens, not hundreds), identity is self-declared (a stranger can claim a friend's id), friends are one-sided bookmarks with no request handshake, no offline messages, and only hosts who share through the hub appear under LOBBIES. Verified with node tests and headless pages on the local BroadcastChannel transport only; never over real WebRTC between two machines.
## Wave 4 - maps5: Estate 9 + Cold Storage (module `maps5`, docs/wave4/maps5.md)
Two hand-authored moons with three real labyrinths (hedge maze, two-level paper archive with a ladder and bridges, shifting server stacks) plus a warden and sleeper creature; the plans are proven solvable over 200 seeds and the REAL box colliders are flood-filled with a 0.4 m body in every stack phase, but nothing was seen in a browser (the headless script is written, not run).
Weak spots: readability of the shifting walls (amber strips vs the dark hall), hedge / rack texture look, ladder feel (gravity-cancel climb, no sound, remote avatars just float up), warden / sleeper numbers are first guesses, no multiplayer test of the `m5sw` shifts, moons are presets (not in generated sectors).
