# Wave 8 - creature audit + creature director (`src/game/crdirector*.js`, net prefix `cd`)

Owner: "I do not understand when creatures are coming, and there are way too many - with this many it stops meaning anything. Add mechanics and variety."
Verification status: node tests + build only (`node tools/harness/crdirector.test.mjs`, 88 checks, incl. the REAL install on a fake game). **No browser run** (shared browser lock jammed; the lead said skip). The concurrency numbers below are a MODEL (see assumptions), not a live measurement.

## 1. Every creature spawner (57 registered types, ~35 files call `creatures.hostSpawn`)
Single choke point for all of them: `CreatureManager.hostSpawn`. The vanilla ambient producers are in `host.js`; everything else is a module with its own timers.

| Source | What / where | Per-day count / cap | Director |
|---|---|---|---|
| host.js `hostSpawnWave` (indoor) | 35 % of the budget at landing, then a wave every 45-80 s / pace; weighted `spawnTable`; Spam Bot pack = 2-4 bodies for 0.5 power | budget = moon.power (3-9) x (1+0.03q) x threat/sector scale (0.85-1.7); scuttler/hound bodies are NOT counted (0.5 power = 2-4 bodies) | **queued + released by phase** |
| host.js `hostSpawnOutdoor` | from 17:00 / eclipse, every 40-80 s, budget moon.outdoorPower (2-8); Troll pair = 1-2 bodies | same scaling | **queued** (released when the crew is outside) |
| director.js (horror director) pressure spawn | 1 creature after 100 s calm, gap 170 s, calls `game.hostSpawnCreatureIndoor` | ~1-3 / day | goes through the queue |
| host.js hazards | turrets 0-3, mines 0-6, Fake Exit 0-2 | fixed at landing | not budgeted (traps) |
| bosses.js / cycle_bosses.js | Foreman (indoor), Legacy Bot (outdoor), cycle bosses + adds | boss chance 20 % + 5 %/quota | not gated; excluded from the budget |
| horde.js ambient groups | Zombie Accounts outdoors, 3-5 per group, `min(4, tier)` groups at landing = **3-20 bodies** | tier 1: 3-5, tier 2: 6-10, tier 3: 9-15 | **capped**: 3 (quota 0-1) / 6 (2-3) / vanilla |
| horde.js swarm waves | night / alarm / extraction: 3-5 waves of 6-20 Zombie Accounts (max 40 alive) + Hit Squads (3 soldiers) on war / contested moons | 1-2 per day at night | counted as active threat, not gated (announced set piece) |
| siege.js | tower defence: 3-5 waves, mini-boss every 3rd, quota >= 2, max 1/day | 40-100 bodies | counted, not gated |
| creatures_wave1.js | Collector (+nest), Janitor Bot (+bin), Doppel (mimic), zombies | spawn table weights | via ambient waves |
| horror_host.js (Horror pocket maps) | Shamblers per spot list (max 14), Manor Wardens (6), Forger, Storage Cabinet ambusher | fixed placement per map | counted, not gated (set piece) |
| creatures_backrooms.js | 4 locals at landing charged to the indoor budget + wrapper of `hostSpawnCreatureIndoor` for `br_*` | 3-5 | wrapper chain: still counted |
| worlds2.js / worlds2_creatures | Scavenger Raiders (camps), Tusked Beasts (herds 3-4), Dune Maw, Dusk Prowlers | seeded per world | counted |
| skeletons.js | Bone Walkers/Archers/Knights + Bone Swarm (cap 14) in crypt maps | per map | counted |
| maps5 / zones (raiders) / mirror waves / homeworld raids / voyage / pets / eggs / dice `swarm` | map- or event-specific | small | counted (they are `hostSpawn` calls) |
| bosses / mapart drones / trend creature | drones are loot, not hostile; no trend creature exists in code | - | - |

## 2. How many hostiles at once (model: `node tools/harness/crdirector.test.mjs --report`)
Model: the real `spawnTable`, moon power, `scaleFor(q, threat 25)` budget maths of `hostSpawnWave` / `hostSpawnOutdoor` over a 720 s day, 30 seeds per row. A body needs 10-25 s to arrive and is then engaged 35-70 s (killed / evaded). Indoor bodies always count, outdoor bodies only after 17:00. Same lifetime model for both columns. Bodies/day = every body created; max / p95 = concurrent engaged bodies; busy = share of the day with at least one engaged hostile.

| quota / moon | vanilla bodies, max, p95, busy | director bodies, max, p95, busy |
|---|---|---|
| 0 / 56K-Dialup | 9.6, 4.5, 4.3, 37 % | 7.5, 3.3, 2.9, 35 % |
| 0 / 12-Forum | 10.6, 4.4, 4.2, 45 % | 8.1, 3.3, 3.1, 36 % |
| 2 / 33-Guestbook | 10.4, 3.8, 3.3, 52 % | 11.0, 4.3, 3.6, 47 % |
| 2 / 88-Chatroom | 11.3, 4.0, 3.6, 58 % | 11.9, 4.6, 4.2, 48 % |
| 4 / 666-Creepypasta | 12.6, 4.0, 3.5, 62 % | 13.9, 4.4, 4.0, 55 % |
| 4 / 404-Not Found | 12.8, 3.7, 3.4, 67 % | 14.0, 4.3, 3.8, 54 % |

Reading: quota 0 (the "too many" complaint) drops from p95 4.3 to 2.9-3.1 bodies with ~25 % fewer bodies; from quota 2 the director keeps the same amount of content but arrives in bursts (peak <= body cap 4 + one featured creature, busy share -5..-13 points), i.e. more real quiet time, not fewer monsters. The ambient model does NOT include the set pieces above (zombie groups 3-20 bodies, swarms, Horror pockets): those are the real source of "way too many" and are only capped (ambient zombies) or counted.

## 3. Overlaps (creatures doing the same job)
- **Face-stealers (4):** Deepfake (`mimic`), The Doppel, Mirror Copy, The Forger. Three are the same "wears a crewmate's face" rule.
- **Swarm fodder (8):** Spam Bot, Zombie Account, Bone Swarm, Moth Swarm, Ticket Swarm, Reply Guy flock, Shambler, Reflection Wraith. Difference is only the model.
- **"Only moves when unobserved / on a beat" (3):** NPC, The Editor, Lurker (backs off when looked at). The Follower (new) is the inverse.
- **Sound hunters (3):** Troll, The Listener, Web Crawler (re-wired to the Listener brain).
- **Container ambushers (2):** Fake Exit?, Storage Cabinet?.
- **Nest guards (2):** Data Hoarder, Collector.
- Two directors: `director.js` (fear pacing, scares, relief) and the budget in `host.js`; before this wave nothing coordinated them.

## 4. Creatures without a readable rule / missing telegraphing
- Rule text existed only in the codex `lore` and after a 1.5 s scan (`identify.js`); nothing said it in the moment. Added: one-line caption on first sight.
- Round-1 creatures voice themselves only at `run` / `attack` (already on you): no pre-contact cue for Web Crawler (fast, straight), Lurker (before `angry`), Screamer, Deepfake (attack only), NPC (silent), Spider (only at `run`). Added: a distinct approach sound per type, radius 14-70 m.
- No visual tell except Moderator eye / Jester box: added emissive eyes (lit only while hunting near you: Lurker magenta, Screamer white, Moderator green, Dimmer amber, Follower white, Auditor gold), light dip (Lurker, NPC, Dimmer), ceiling dust (Crawler, Spider, Influencer).
- "Something started hunting me, from where?" had no cue except the heartbeat when very close: added a screen-edge pulse on the side of the hunter + a thump from that side (host tells only the tracked player; once per creature type per 12 s so swarms do not strobe).
- "When are creatures coming?" had no cue at all: the phase cycle now announces itself (build: low sting + lights dip + edge glow + one caption; peak: sting; relax: exhale).
- Web Spider: see 6.

## 5. The fix (`crdirector.js`, `crdirector_core.js`)
**Budget.** One cap of active threat points near the crew (cost = vanilla `power`; a Spam Bot pack costs per body): `3.5 + 0.35 q + 0.45 (tier-1) + 1 (Hard)`, times danger (daily event + mapmods through `run.dailyEvent.dangerMul`, optional `game.mapmods.threatMul`) x threat/sector `balance.scale().spawn`; body cap 3 / 4 / 4 at quota 0 / 2 / 4. Active = awake and (hunting, or within 45 m of a living crewmate of its zone, or spawned < 20 s ago). Bosses, traps and neutral defs are not budgeted.
**Phases per landing** (seeded): calm 80-105 s (first) then 55-80, build 22-32 (55 % of the cap, one release per 7 s), peak 28-42 (full cap, one per 3.5 s), relax 45-70 (nothing, far idle ambient creatures older than 90 s are removed). Later quotas: shorter calm, longer peak. A peak ends early if a crewmate is under 35 % HP or someone else overspawns (cap x 1.35 for 8 s). A greedy-haul pressure stage calls the next build early (the existing "haul is getting noticed" message now has a visible consequence).
**How the old spawners ask:** instance wrappers (restored on dispose) of `hostSpawnCreatureIndoor` / `hostSpawnOutdoor` put the request into a queue (max 6, 140 s TTL); `hostPopulateMoon` is wrapped to start the landing (1 / 1 / 2 residents pass straight through so the first minutes are not empty); Spam Bot packs are trimmed to 2 / 3 / 4 bodies (quota 0-1 / 2-3 / 4+); ambient zombie groups are capped. The queue is released only in build / peak, only if the entry fits the cap and its zone (indoor / outdoor) has crew in it. `game.config.crdirector = false` restores vanilla; `game.crdirector.ask(cost)` lets any module ask before spawning; `game.crdirector.debug()` shows phase / queue / stats.
**Featured creature.** From quota 1, once per peak (max 2 per landing) one of the three new creatures is added if it fits the cap.

## 6. Web Spider (existing creature, tuning only; owner: "do not add things that exist, just balance")
Found: 2 webs on random floor spots 6 m around the lair, webs are a dim cobweb prop, a trip only set `alarm` silently, the spider ran at the player as soon as it saw them at 8 m, never retreated, hit 30 (ok, capped by balance_rules: 45 / 60 / 85 %).
Changed (`spiderBehavior` / `webBehavior` in `crdirector_creatures.js`, wrapped onto `BEHAVIORS.spider` / `web`; the Hunter Spider variant is untouched):
- **3 webs on chokepoints**: 30 samples 3-10 m from the lair, narrowest first (fewest walkable cells around = corridor / doorway), >= 3 m apart.
- **Web readable in the dark**: an unlit strand texture that shimmers (client `decorate`, no light added); a torn / touched web twangs (`vent_rattle`, 30 m) where it is, and the owner is alerted (as before).
- **Ambush**: a player inside 6.5 m first gets a rattle from the CEILING above them (0.9 s), then the spider drops in 2.4 m behind / beside them and hunts; 35 s between ambushes. Attacks still go through the 0.4 s wind-up gate.
- **Retreat when hurt**: below 50 % HP (once) it runs back to its lair for 7 s and can be woken again by a web.
- Tell: Spider approach cue `spider_hiss` + ceiling dust at 22 m.

## 7. Variety through rules (3 new creatures, reused models, `noSpawn`, hits 12-22, no grabs)
| Creature | Rule that changes play | Counter | Model |
|---|---|---|---|
| The Dimmer (`cd_dimmer`, 90 HP, hit 12) | hunts LIGHT: a lit glowstick beats a flashlight; eats a torch (forced off ~6 s, toggle locked) or a stick (goes dark). Ignores people in the dark. | throw a glowstick away from you, kill your torch, walk off; or kill it (90 HP) | Data Hoarder, x0.85, amber tint |
| The Follower (`cd_follower`, 130 HP, hit 22) | moves only while somebody WATCHES it (creeps 1.2 -> 4.2 m/s the longer it is watched); frozen otherwise; strikes anything within 1.5 m whichever way you face. | look away, callouts ("do not look!"), keep 3 m; a photo within 7 m stuns it 0.7 s (any stun freezes it; stun grenade too) | Parasocial model made public, white tint |
| The Auditor (`cd_auditor`, 200 HP, hit 20) | hunts whoever carries the most scrap (>= 30) at a steady 3.6 m/s walk; its hit makes you drop your best item, then it stands over it 6 s. | drop the loot, hand it to a crewmate, reach the ship (never enters) | Customer Support, x1.15, gold tint |
Deepfake already copies a crewmate's voice and name tag; its remaining gap is a readable tell (approach cue = radio static) and the Doppel / Mirror Copy overlap (see 8).

## 8. Remaining ideas (priority order)
1. **Gate set pieces properly**: make horde swarm waves / Hit Squads / Horror-pocket Shamblers call `game.crdirector.ask()` and start on the next build phase (so a night swarm is announced by the same cue). Ambient zombie groups (3-20 bodies) should become 1 group at quota 0.
2. **Merge the face-stealers**: Doppel + Mirror Copy + Forger into Deepfake variants that keep the distinct rule (e.g. the Doppel copies the LAST emote / chat line of a crewmate) so "wears a crewmate's face" is one creature with 3 tells.
3. **Swarm fodder pass**: keep Spam Bot as the one small-bodies creature, turn Moth Swarm / Bone Swarm / Ticket Swarm into environmental effects (light-hunting moths, crypt-only).
4. **Live tuning pass**: play quota 0-4 with `game.crdirector.debug()` (phase, queue, stats) and the real headless script; the cap constants live in `TUNE` (crdirector_core.js). Numbers here are model numbers.
5. **Screen-edge / cue accessibility toggle** in settings (`a11y.js`): reduce the pulse, audio-only mode.
6. **Directional cue for hazards** (Fake Exit breathing, turret lock) using the same edge pulse.
7. **Per-player pacing**: the director is per landing; add per-player relief for split crews (director.js already has per-player tension: merge).
8. **Dimmer / Auditor in the codex** (bestiary art + scan hint) and a Follower photo challenge.
