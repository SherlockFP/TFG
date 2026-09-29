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
## Wave 4 - stealth: facility variety, sneak, sound-hunters (module `stealth`, docs/wave4/stealth.md)
Facilities now have 6 maze styles, cubicle / pool / hall-loop liminal rooms, prize nooks, hatches and a latch shortcut (BFS-proven over 8000 facilities); Alt-sneak, a NOISE meter, surface loudness, wall-muffled hearing, The Listener, a sound-hearing Web Crawler and a Noisemaker.
Honest weak spots: numbers are design values, never hand-played; the Listener (8.8 m/s) barely outruns a sprint so escapes rely on doors, corners or the early speed cap; sound is a straight-line wall count, not real acoustics; the Crawler lost its sight (easier when sneaking, deadlier at 13 m when sprinting);
hatch drop is a bare teleport (no chute / damage), the latch is a keypad prop not a lever, pool water has no wading zone, Listener model + sounds unseen / reused samples, `sneak` is a new key (Alt) - browsers may steal it in windowed mode.
## Wave 4 - eggs: menu Cell secrets + moon secrets + meta-secret (module `eggs`, docs/wave4/eggs.md)
The cell is no longer just a set pieces room: 10 hidden props, a "Secrets x/19" counter and a 5-step meta-secret that sends you to the moons and back (ducks, diary, frozen employee) for a title + a hat.
Risks: props are tiny and placed by numbers (nothing was judged by eye except one menu screenshot), facility spot offsets, the wall-knock timing on a real keyboard, English-only text on the CRT / poster canvases, shrine buff values (design numbers), nothing tested with 2 real players.
## Wave 4 - SFX (creature voices, footsteps, beds, custom sound pack; module `sfx`, docs/wave4/sfx.md)
Every creature now has a distinct procedural voice + footsteps and the owner can drop in his own (Turkish) sounds. Proven by numbers only: all 1170 recipes render finite / audible / unclipped and are unique per voice, the pack parser / zip / IndexedDB / import paths are unit-tested, the headless script tools/harness/wave4_sfx.js was written but never run (browser queue). **Nobody has listened to it**: the synth recipes (FM growls, formant voices, modal hits) are educated guesses and will need a tuning pass by ear (levels, pitches, which stock roars stay layered). Weak spots: creature cues are not yet a full "sound compass" for stealth play, occlusion is the old raycast lowpass, `voice_<n>` lines are random rather than contextual, packs are per-browser and cannot replace music.
## Wave 4 - SHIP2 (module `ship2`, docs/wave4/ship2.md)
The default ship was a single room with 13 fixtures placed by hand from five different modules: an overlap checker (`tools/harness/ship2_overlap.test.mjs`) found 5 real clips (frame console x horn panel, contract board x mirror, incubator x decon, bunk and decon through the +z wall) and now every fixture position lives in `world/shiplayout.js` and is checked (0 left). The redesigned "Mini-Skeld" (cockpit / hub / engine room / cargo + loot bay, partitions, floor stripes, room signs, rounded frames + nose, clerestory windows) keeps the shipyard doorways and the +z door untouched.
Hull damage + outside repair (Wrench 35 / Welding Torch 120 / Repair Kit 25, hold E + timing ring, host authoritative) is the new outside loop: quota 0 only ever dents, effects (flicker, door jam, takeoff delay, an "Outer Hull Breach" pre-flight fault) start at quota 1-2. Defence mounts on the roof reuse the siege deployables with a power budget; planters grow Hydro Apples.
Honest critique: never run in a browser (script ready, queue was too deep), never hand-played, never with two players; the whole Mini-Skeld look is unverified by eye. Unknowns: whether hull spots at y 0.6-1.7 are comfortable to reach from the ground, whether the ring + hold reads as fun or as a chore (a tap-rhythm variant may be better), whether 5 roof mounts + a ladder is too much surface for a tiny ship, the PSX look of the partitions / signs, and balance numbers (damage chances, tier thresholds, tool prices) which are paper values. The old prop meshes are still unmerged (draw calls +18). Creatures do not really shoot the hull outside sieges (damage is approximated by hostile creatures standing next to it).
## Wave 4 - HOMEWORLD 2 (module `homeworld2`, docs/wave4/homeworld2.md)
The homeworld finally has a reason to stay: a belt factory (nodes -> miners -> belts -> smelters / assemblers -> Export Dock), rooms, trees, telegraphed waves and ghost raids, and the ground z-fighting is fixed at its root (PSX snap on giant quads).
Honest critique: economy numbers are paper balance (dock cap 12 / 18 / 26 per minute, offline 10 %, wave gate 4 things / 450 value): check that a 20-minute session feels rewarding and that waves are a challenge, not a chore. Belt building UX (drag lays a line, rotation via the next cell) has only been driven by script;
room walls are cosmetic for raiders; machines only break as a consequence of a lost wave; ghost sentries use the turret model; live crew-vs-crew is absent (async ghost codes instead). Bigger risk: the client mirror of the layout (ops versioning) was never run over real WebRTC.
## Wave 4 - HORROR (module `horror`, docs/wave4/horror.md)
Traps, an RE-style outbreak wing, a dark oak mansion, portal closets, chalk + Forger and a fake-closet ambush are in, proven by three node suites (rules, offline builds, installer against a real facility) but never seen in a browser.
Risks: readability of the laser / crusher telegraphs and the panel text, closet / pocket lighting with only pooled lamps, whether the seamless cut through the black closet back reads as "bigger inside", shambler grab feel (hold + slow, break on a hit), price balance (paper numbers), fake closet fairness (tells are subtle by design), pocket cost (~800 colliders each, up to 2 per facility).
## Wave 4 - survival (foraging / farming / cooking / storage)
Proven by node tests only (recipe + quality maths, growth timing, storage transfer + persistence, hunger drain, host handlers on a stub game); nothing was seen in a browser. Risks: stove / crate / planter default positions next to shipyard rooms, the drag-and-drop panel at 1280x720, plant models and glow, cooking needle feel (zones 50 / 72 / 86 %), whether hunger + warmth stay unannoying, heal balance of a perfect 3-ingredient stew (~80 HP) against the medkit. Left out: ship2 / homeworld2 planters (API only), seed shop, plants in facilities, secure-crate lock.

- Wave 4 voyage: the macro layer exists (random moons, signals, warp, 9 jobs, 7 set pieces) but was never seen in a browser: check set-piece scale, decor density, marker readability and NPC escorts (they ignore prop colliders); the mission board is terminal-only.
## Wave 4 - checkup (docs/wave4/checkup.md)
First real browser pass over the full loop: it runs end to end without errors, but the 1280x720 HUD is crowded (objectives vs left dock fixed; mirror header vs clock, compass label stacking, Algorithm banner over panels, VHS overlay over the hotbar still open) and geometry count climbs from 139 to 730+ over 6 landings (possible leak). worlds2 / core boss / MP stability still unseen in a browser.
## Wave 4 - UI2: one art direction (module `ui2`, docs/wave4/ui2.md)
Every surface now reads as one company-issued device (plate titles on hazard tape, hard bezel, condensed stencil labels, segmented gauges, pictograms instead of emoji) instead of the same flat dark box with three fonts. It is a CSS override layer, so it can be A/B-ed by removing `html.tfg-ui`.
Honest limits: panels whose JS builds layout with inline styles (a few dock widgets, minigame overlays, the 3D menu-room canvas text) only get shape/type via the shared selectors; the emoji strip in `ui.js` still blanks panel emoji instead of drawing pictograms; the condensed face at small sizes needs a look on a real monitor; not every panel was screenshotted (forge, homeworld, trade need the game state to open).
## Wave 5 - ship interior clean-up (docs/wave5/ship_interior.md)
First time the Mini-Skeld was actually looked at: it was a pile-up (trophy wall over the mirror / kiosk / windows, stove in a doorway, chess table inside the workbench, planter inside the kiosk, door leaf through the wall, dotted wall seams, hidden hazard strip). Now one layout file, zero overlaps in node and in the browser, readable zones (cockpit / galley counter / mess / services wall / engine / cargo) and fewer draw calls in the wide views. Still honest: nothing was pressed by hand (E prompts at the new spots), ship props are not merged, the hanging helmet-cam box is plain.
## Wave 5 - harvest2 (docs/wave5/harvest2.md)
Trees and rocks are now chopped by swinging (axe/pickaxe x2, weapons x0.6, fists x0.3) with host-validated damage and wobble/fx. Honest: never played in a browser; fists take ~50 hits per tree; tool models are placeholders; ore veins, crates and chests still use the old interactions.

## Wave 5 - lockpick 2 (docs/wave5/lockpick2.md)
Lockpicking is now a 1.5 s timing click on Simple locks and scales to timed / shuffling Algorithm locks; balance is tuned by numbers and a bot only (no human feel test, no real 2-player test), tools use charges not the durability module, and the two new picks have no models of their own.

## Wave 5 - stairs (docs/wave5/stairs.md)
Every stair builder (Soviet blocks, towers, ruins, crawler ramp, mansion staircase, catwalk stairs) now uses one inclined ramp collider instead of stepped boxes; the old boxes stalled the autostep when the player pushed into a wall or rail, which is the normal way to climb a stairwell. Proven in node with the real Rapier controller (walk / sprint / sideways push), but nobody has climbed them by hand in a browser yet; ramp climbing is slightly slower than flat walking and other players' feet clip into the visual treads by up to ~0.15 m.
## Wave 5 - algo1 (docs/wave5/algo1.md)
First real step of the identity (§21): the Algorithm now reacts to habits and lets the crew vote its rules. Pure maths is node-tested; the live glue (populate wrap, vote UI, viewers on the LIVE banner) was NOT run in a browser, so first look for layout of `.a1-vote` at 1280x720 and whether `hostPopulateMoon` wrapping stacks cleanly with cycle's.
## Wave 5 - ZONES (module `zones`, docs/wave5/zones.md)
The new core loop exists end to end in code (partition, capture, fortify, capped income + upkeep, counter-attacks live/auto, sector map) and the rules are node-tested, but nobody has seen it: pillar/ring visuals, panel layout at 1280x720 and the live-defence feel are unverified. Income cap and attack odds are paper numbers. Wings are outdoor annex relays, not interior zones; defences are outdoor deployables only.

## Wave 5 - chess3d (docs/wave5/chess3d.md)
3D chess / dama on the table with instanced lathe pieces, drag + click picking, animated moves. Honest limits: never looked at on screen after the last fix (piece silhouettes, camera framing, HUD at 1280x720 unverified); no capture fade, no touch.

## Wave 5 - aimchase (docs/wave5/aimchase.md)
NPC shooters now telegraph (laser, white lock, fire at the locked point) and creatures obey one speed table (sustained < sprint, short bursts, fatigue, door hesitation); only node-tested, laser/vignette look and difficulty feel are unverified in a browser.

## Wave 5 - shipdeck (docs/wave5/shipdeck.md)
The ship now has a proper upper floor (stair in the hub, hatch, deck, rooms, dome) that visibly changes with every tier and is proven climbable with the real controller in node; but it was never seen in a browser (the shared lock was busy; script `wave5_shipdeck.js` is ready), never hand-played or tried by two players. Room effects are tiny numbers (cosmetic-first), the U-stair block takes a good bite out of the hub floor (the chess table, a lamp, the disco ball moved), the roof turret socket and mounts moved aft, and creatures do not know the deck exists. `ship2_install` "repair" test is flaky (random hull slot), unrelated.
## Wave 5 - hardmode (docs/wave5/hardmode.md)
The difficulty is now a real setting with one table, but it is paper balance: the sim says Standard costs a competent crew about one quota and Hard about two, and it leaves quota 0-2 untouched, so the "early gains ~30x quota 0" problem is still there (deliberately, owner rule). The live glue (lock-warning HUD, hover-while-stranded, door/light tricks) is only tested against stubs; watch for the power cut opening blast doors and for stranded players landing somewhere odd at orbit. The forge row of 25.4 did not match the code (the drop rule + Backup Drive already existed), so Casual keeps the old rule and only Hard tightens it. Crates as cold storage is a loophole for the spoil rule.
## Wave 5 - unify (docs/wave5/unify.md)
Duplicate systems now share one defence table / power calculator / targeting helper, one maze library with a single solvability checker, one consumable table with a tested food rule and a two-currency wallet row. Honest limits: adapters, not rewrites (DEPS and homeworld BUILDINGS still hold their literals, live raider movement is still per system), zones' auto-resolve numbers shifted by <= 1 point per defence (turret2 17 -> 16, turret3 26 -> 27), the wallet row is only on the HUD and the homeworld panel, and nothing was seen in a browser.
## Wave 5 - onboard (docs/wave5/onboard.md)
The first ten minutes now have a story (Company office -> The Algorithm watching -> your own ship) instead of a toast list, and five heavy systems are hidden until the crew has earned them (forge q1, pets + voyage q2, homeworld q3, gates after the first boss), which answers §22 #5 (drowning new players). The logic (facts flow, skip rules, unlock schedule) is node-tested and the whole Hiring Day runs on a stub game, but nothing was hand-played: first look for the shutter timing (2.2 s over 14 m), whether the blackout is dark enough with a real flashlight and readable without one, overlap of the PA bar with the intercom box at 1280x720, and that a joiner in the ship does not see the host's flashlight / mug floating 1600 m away. Weak spot: unlock guards are per-entry-point (panel open, terminal command, host route), so any new way into the homeworld / pets would bypass them; and `stats.days > 0` veterans are auto-unlocked, so testers with old profiles will not see the staged mode unless they use a fresh profile.
## Wave 5 - ui3 (docs/wave5/ui3.md)
The known HUD overlaps (mirror header, compass labels, Algorithm banner, VHS captions, hotbar name strip, duplicate footers, "a Enforcer") are fixed behind one removable class and the last self-styled panels lost their glows and gradient fills. Judged from headless screenshots only; trade / survival panels depend on state the script cannot always create, and the source of the stray hotbar "LIGHT" label was never found in code (see the doc).
## Wave 6 - story (docs/wave6/story.md)
The identity line finally has a player-facing choice: two patrons, an allegiance meter fed by contracts and patron jobs, unlocks / creature rules / zone attack frequency that follow it, three acts and three endings (one secret, tied to the egg meta-secret) and a weekly trend creature. Honest limits: node-tested only (paper numbers for pay, thresholds and jobs per ending), voyage missions are not patron-tagged, the finale overlay / dock chip / case card are barely eyeballed, and "no healing" only sees consumables used through `useItem`. The tone change is extra intercom lines, not a rewrite of the existing Algorithm voice.
## Wave 6 - ZONES 2 (docs/wave6/zones2.md)
The five v1 gaps are closed in code (interior wings with horror traps, validated walls / gates + ring placer, extractors + archive, raiders that path round barricades + upkeep ammo, ship CRT map) and the rules are heavily node-tested, but it has never been hand-played: the trap lanes in real corridors, wall look / collision feel, the relay inside a wing, panel layout with the new rows and the CRT page are unseen. Balance numbers (trap cost x2.2, extractor payback, wall hp vs brute dps) are paper numbers. Walls are placed "where you look" with a button, no ghost / drag mode.
## Wave 6 - algo2 (docs/wave6/algo2.md)
Live-stream hype (tiers -> Clout + sponsor crate, "wants more show"), ghost replay of a dead player last 10 s, glitch exploits with a patch meter and punishment. Honest limits: node-tested only; the ghost is re-anchored to a spot relative to the entrance because layouts change every landing (a replayed path may cross walls); the "wall" glitch is a paired teleport; dodge detection is heuristic; chat / ghost / glitch visuals never looked at by a human at 1280x720.
## Wave 6 - home3 (docs/wave6/home3.md)
The homeworld stopped looking like a Lethal Company pad in the dark: it is now the crew "Off-Grid Claim" (violet dusk, Company mascot robot + hijacked LIVE tower + logo moon + data aurora on the horizon, scrap outpost with graffiti, kitchen, memorial of the fallen crew, watching drones). Still a first pass by numbers: NEVER looked at in a browser (queue), the layout is authored (not yet player-tuned) and the fence has no colliders.
## Wave 5 - zfixperf (docs/wave5/zfixperf.md)
Zombie swarm no longer depends on the horde module and shows extra poses (headless-verified); GPU leak sweep (`gpusweep`) and outdoor prop merge are in but the geometry plateau and draw-call gain were NOT confirmed in a browser (queue cancelled) - needs QA with wave5_zfixperf_plateau.js.

## Wave 6 - roledays (docs/wave6/roledays.md)
Role constraint days turn co-op communication into a rule (8 cards, host-validated door / pick, Clout + hype on completion), but there is no minimap to hide, the medic card is only a limit, and the weapon / chat rules are client-enforced; nobody has played it with two humans yet.

## Wave 6 - mapart (docs/wave6/mapart.md)
Every outdoor moon now has the same original signature layer (pylons that watch, LIVE panels, drones, glitch scars, ad billboards, crashed pods, camps with journals, tape) plus one landmark per biome family and a horizon silhouette, all seeded and merged (a handful of draw calls, no lights). Judgement: identity and variety come from the family landmarks and the corporate-decay props, which read as TFG rather than LC; the risk is scale / fog (landmarks at 60-108 m sit in dense fog on swamp / forest moons) and that the layer is not yet hand-checked on every generated biome.

## Wave 6 - dance (docs/wave6/dance.md)
The dance list is now big and readable (wheel pages, favourites, search, thumbnails) and the crew can lock to one beat, but every animation is hand-typed numbers checked by unit tests and a couple of screenshots, not by an animator's eye; sync is per-viewer and the music is not beat-locked across players, and most dances are free so the shop/crate rows are thin incentives.

## Wave 7 - feel (docs/wave7/feel.md)
Combat now has weight (hitstop, class sounds, muzzle flash, toppling corpses, heartbeat) but the procedural sound recipes have only been checked numerically, not by ear, and gun kick was left as it was.
- Wave 7 score: in-game had no music (only stingers); now an adaptive procedural score. Unverified by ear: stem loudness balance, real OfflineAudioContext render time, echo-tail seam. No in-game trigger for the Company shop motif yet.
## Wave 6 - artdir (docs/wave6/artdir.md)
The game now has an identity kit (wordmark, seal, the Algorithm's eye; amber = Company, magenta/cyan = Algorithm) and the main menu, panel headers, tabs, tooltips, loading, pause, death and report screens follow it, but it is mostly dressing: the CRT menu text is still small at 720p (2 columns helped), header stamps are decorative and keyed on title text, several panels (trade, homeworld, shipyard, forge) were not re-shot, and the eye only follows a pointer. Whether the stamps and ticker read as charm or clutter after an hour of play is untested.
## Wave 7 - a11y (docs/wave7/a11y.md)
Palettes are tuned by simulation, not by eye (tests check delta-E under CVD matrices), but nobody colour-blind has played it; baked creature-model eye colours are still red; pad buttons are not rebindable; mouse capture still needs one click.
## Wave 7 - perf2
Low preset is unverified against the 60 percent draw-call target (instanced decor thinning cuts triangles, not calls); module-added ship props (workbench, arcade table...) still unmerged; Rapier wasm (4.3 MB) dominates first load.
## Wave 8 - balance (docs/wave8/balance.md)
One-shots are gone except telegraphed hazards from quota 4, but the sim's solo shovel player still dies 40-60 % on mid quotas from attrition alone (no healing/dodge model); the 0.4 s wind-up gate is untested in a live browser and relies on behaviours setting an attack state as the visible tell.
## Wave 8 - nvgear (docs/wave8/nvgear.md)
Goggles are buyable + battery-limited, but tuning (85 cr / 90 s) is by feel, not sim; the flash dazzle wraps `engine.flash` so any module that calls it also blinds goggle users (intended, but untested against every source); the ship charger already existed - the fix is discoverability + a 3 s timed charge, not a new fixture; Algorithm-glitch drain is not wired.

## Wave 8 - chess seats (docs/wave5/chess3d.md)
Seats are two stool interactables and standing up is ESC / E, but the player body never moves onto the stool and there is no tray of captured pieces on the table (HUD glyph row only); the owner captured-pawn bug was reproduced only in rules tests (rules were already correct), so the real cause was likely UI (seat / turn confusion) and is NOT yet checked in a browser (chess_seats.js unrun).
## Wave 8 - geomfix
Geometry is now audited in node (tools/harness/geomfix.test.mjs) and the worst placement bugs are guarded, but only collider footprints are checked: visual-only overlaps of collider-less clutter, runtime-dropped items and animated props are not, and maps5 interiors / horror pockets keep their own tests.
## Wave 8 - movefix (docs/wave8/movefix.md)
The idle-bounce fix (collider sync each frame) and the mantle/vault are verified only in node against real Rapier with synthetic boxes/ramps/stairs; no browser run (lock was jammed), so ledge feel, camera pitch kick, ship-deck/terrain edge cases and the remote-player pose during a mantle are unverified.
## Wave 8 - mapmods (docs/wave8/mapmods.md)
Affixes and the Sector Map currency are node-tested but never seen in a browser: the landing card layout at 1280x720, the ATLAS terminal flow across two peers, and the Volatile blast timing are unchecked. Three asked-for affixes (Flooded, Barricaded, Algorithm hype x1.5) were skipped for lack of a clean hook. Rewards are modest (Rare about +50 % value at most) so the risk-for-reward trade may need tuning once someone plays it.
## Wave 8 - mining (docs/wave8/mining.md)
Never seen in a browser: collider feel (0.5 m stair steps on the domes), indoor slab vs facility props / loot, overlap with zone cores, visual balance of vertex-colour rock. Digging is single-cell and slow with hands by design; no rubble bodies after a cave-in, dig log lives in memory only.
## Wave 8 - arcade2 (docs/wave8/arcade2.md)
Four mini-games are only node-simulated (scripted input, ceilings, determinism), never played in a browser: feel/difficulty and the TARGETS (25 / 30 / 60 / 90) are guesses; the canvas HUD shows English arcade words (bitmap font has no Cyrillic/Turkish glyphs); the per-day cap depends on the UTC clock so a host restart only keeps it via the host profile copy; the cabinet screen still shows the old attract loop.
## Wave 8 - facjobs (docs/wave8/facjobs.md)
The interior loop finally has jobs (8 types, main + side) and three new labyrinth shapes, but none of it has been seen in a browser: prop meshes, the keyboard vault overlay, the injected landing-card rows and the drone hovering through doors are unchecked; no vertical/multi-floor archetype yet; "power on" is extra loot + a wave, not real lighting; job rewards (credits 90-170 + Clout + crate) are first-guess numbers that need a balance pass against the quota curve.

## Wave 8 - studio (docs/wave8/studio.md)
Copy and consistency pass; browser not run: the six new 64x96 posters and the pictogram achievement cards have not been looked at, the Algorithm still leans on "content / engagement" in nearly every line, and about 370 keys per language are still untranslated in the i18n audit (mostly a11y / cycle3). Placeholder tool models (axe, pickaxe, forge shards) are listed for an art pass.
## Wave 8 - declutter (docs/wave8/declutter.md)
Contextual fade is driven by a text signature per widget, so a module that rewrites words every frame stays visible; mirror/VHS captions still use ui3.css tops instead of the layout manager; level-up toast still says [TAB] for the skill tree (it is K); RPS wager Y also casts role skill 1.
## Wave 8 - atmos (docs/wave8/atmos.md)
The mix is now policy-driven (cooldowns, trims, variation, ducking) and interiors get procedural beds with silence gaps, but every level and gap was set from an offline render audit, not by ear or in the browser; creature footstep audibility under the new hum is unmeasured, the old loop layers still play (trimmed) under the new beds so some contexts may be busier than intended, and maps5 maze zones / worlds3 pockets only get a bed if their theme name matches.
## Wave 8 - worlds3 (docs/wave8/worlds3.md)
Never browser-run: every skin, prop scale and the door frame against real walls are untested by eye; the six pockets share one 13-15 cell maze layout (only skin, props and one rule differ), so after a few visits they will read as the same map in different clothes; facility dressing uses boxy primitives, not the GLB prop library.
## Wave 8 - repomaps (docs/wave8/repomaps.md)
The four themes are data + a few props, not hand-built set pieces: every room is still the facility generator's rectangle with themed textures, props and one twist, so they will read as re-skins until someone LOOKS at them in a browser (nobody has: the shared queue was jammed). Palettes are texture/emissive only (walls are not tinted per theme beyond fog + lamp colour). The signature mechanics are host-polled at coarse ticks (4 s for viral / thaw, 0.25 s for the museum) so growth looks steppy; the sliding shelves block pathing on both rail ends and rely on the host waiting while a player stands in the destination (a client-side race is possible for ~1 s); the ice slide is a velocity blend copied from worldx frozen lakes, untested for feel. Museum art alarm and thaw only exist on these four moons; bosses / achievements / codex tables still fall back to the factory entries for the new theme ids.
## Wave 8 - lcmonsters (docs/wave8/lcmonsters.md)
Six new threats (Blood Witch, Lantern Keeper, Trick-or-Treater, Cursed Scraps, Other Side / Rift Stalker, Loot Mimic + Masked) exist only as node-tested logic: no browser run, so model proportions, the circle / rift / sign visuals, the flicker telegraph, audio picks (several fall back to generic samples) and the real spawn cadence are unseen. The curse marker is not persisted across saves, and outdoor spawn pressure now also depends on the crdirector veto being wired.
## Wave 8 - creature director (docs/wave8/creatures_audit.md)
The ambient budget was never the crowd: Zombie Account groups (3-20 bodies at landing), swarm waves (up to 40), Horror-pocket Shamblers and Spam Bot packs (2-4 bodies for 0.5 power) were, and only the zombie groups / packs are trimmed now; the rest is counted, not gated. Model numbers (not a play test): quota 0 p95 concurrent bodies 4.3 -> 2.9-3.1, from quota 2 the same content in bursts. Telegraph sounds are name fallbacks nobody has listened to, the edge pulse / eyes / captions were never seen in a browser, the Follower / Dimmer / Auditor are untested with real crews (do 4 players actually shout "do not look"?), and 4 face-stealing creatures still share one rule.
## Wave 8 - resto (Alien Diner)
The tycoon loop, sim, economy caps and all host / client code paths are node-tested (pure rules + a stub-game smoke), but nobody has seen it in a browser: pad feel, plate landing on the pass counter, alien / shuttle looks, decor-boulder clipping and the panel at 1280x720 are guesses. The restaurant sits ~60 m from the ship (outer strip), there is no creature raid (abstract pests + inspector instead), passive / active income numbers are hand-set and were not fed to `tools/sim/economy.mjs`, and only the stove has a minigame (order taking, serving, paying are plain interactions).
## Wave 8 - downed (docs/wave8/downed.md)
Never browser-run: the face-down avatar pose (root.rotation.x with order YXZ from the remoteAvatar hook), the projected revive ring markers and the lowpass spliced between audio.tone and audio.comp are untested by eye/ear. Downed players count as DEAD for creature targeting, so an all-downed crew triggers the 4 s wipe countdown right away (intended, nobody could revive) but a downed player outside at takeoff is neither aboard nor left behind and just bleeds out. Creatures never drag or grab a downed body (the brief asked for "ignore or drag"; only ignore is built). Bleeding pauses while somebody holds E, which a griefer can abuse to stall a bleed-out forever. Healing items and the Revive Pulse role skill do not stand a downed player up (hp is pinned to 1 and the skill only revives bodies); the medic should get a faster hold instead.
## Wave 8 - hubgate (docs/wave8/hubgate.md)
Answers problems 1-3 (progression bloat at level 1, HUD/side-system clutter, no short session). Side systems are gated, not deleted: a 12-rung ladder (quota 1..5 + boss) hides docks, terminal commands and ship fixtures until the Algorithm gifts them; a joiner follows the host's ladder. QUICK SHIFT is the new low-commitment entry (one moon, 15 min, no save). Gaps: nothing has been seen in a browser (Hub door, panel, end card, the "Unlocks at quota N" prompts replace interactables by radius around shiplayout spots and may catch a neighbour on a modded ship); the quick quota (90 / 120) is an estimate from the economy sim, not a playtest; the resto module (restaurant) still has to call `game.onboard.deny`; foraging and mess-table eating stay open (healing must not be gated).
## Wave 8 - feedcams (docs/wave8/feedcams.md)
The one-sentence game finally exists in code: cameras with cones, ON AIR, viewer tax, ways to break or dodge them. It is node-tested only (plan, sight maths, tax, strings) plus a mocked host tick; nobody has seen the cones, lamp blink or vignette in a browser, and the 3 s lock / 25 % tax / 8 s hold numbers are guesses. Blind spots are real (under the lens, behind geometry) but the floor cone does not show prop-shaped shadows, and doors clip sight but not the drawn cone. No outdoor cameras yet; junction-box cutting is planned but not wired.
## Wave 8 - labyrinths (docs/wave8/labyrinths.md)
Only 2 of the 4 requested labyrinths exist (metro, greenhouse); Prison Block (tiers + lockdown) and the Vertical Tower (elevator, lower floors richer) are designed in the doc but not built. Everything is node-tested for solvability and geometry but never browser-run: train speed / damage / warning length, vine reach, spore blur strength and every hero-room look are unverified by eye, and the hero rooms are decorations dropped into existing rooms (they do not change the layout).
