# WAVE 3 - FINISH (pets + maps2 + homeworld): what was completed

Status: **node-tested + `npm run build` only. Nothing here was run in a browser** (no browser budget). Expect first-run fixes in the glue files
listed under "Risk / first thing to check". All edits in shared files carry `// [finish]`.

Green (must stay green): `node tools/harness/pets.test.mjs`, `maps2.test.mjs` (960 layouts), `homeworld.test.mjs` (26 checks), `wave1_facility_paths.mjs` (4800 layouts).
New tests: `pets_sim.test.mjs` (12 groups), `maps2_rules.test.mjs` (9), `homeworld_raid.test.mjs` (7).

---------------------------------------------------------------------------------------------------------------------------------------------------
## 1. PETS (module `pets`)

| File | What |
|---|---|
| `src/game/pets_sim.js` | Pure HOST brain of one pet (no three / no game). `makeRec / applyPet / stepPet / command / tankShare / absorbShield / hurtPet`. Driven by an `env` adapter. |
| `src/game/pets_net.js` | The adapter + net + client parts: host sim per owner, net sync, views, HUD marks, keys, Pet Carrier, night vision, wraps. |
| `src/game/pets_incubator.js` | Ship INCUBATOR prop (glass dome on the +z wall at x -0.7, z 2.95): egg meshes per slot, progress bars, glow when ready, `[E]` places the held egg or opens the PET panel NEST tab. Emissive only (no light added). |
| `src/game/pets.js`, `src/ui/panels/pets.js` | Hooks: local follower replaced by the host-driven view when the net part loads (falls back to the old follower if it throws); terminal `PETS MODE / DEST`; panel STABLE tab has mode + delivery buttons. |

**Controls:** `O` cycle mode (follow / stay / fetch / guard), `Shift+O` deliver to me / to the ship, `L` command (attack the creature you aim at; parrot = decoy at the aimed point), `N` panel, `[E]` on the pet = pet / feed.
Terminal: `PETS MODE <m>`, `PETS DEST <me|ship>`.

**Behaviour (all host-simulated, `SIM` constants in pets_sim.js):**
* **Fetch** (mode fetch, species with fetch range): picks a loose sellable item within the fetch range of the OWNER (small = weight <= 4; bear Lv10 `big` up to 22, at 55 % speed; fox also takes Collector-nest items; crow takes the best tier first; carry 1-2), walks the nav path (facility) / straight (outdoors, slides around the hull), takes it (`it` event `held`, holder `c:pt<owner>`), brings it to the owner or to the ship door (drops inside the ship if the door is open), pet XP + loyalty on delivery. Daily cap `fetchDaily`, cooldown `fetchCd`, `obeys()` loyalty roll per trip, owner inside the ship = drop at once, carried items are put down when the phase changes / the pet is KO'd / released.
* **Attack:** assist species (`assist`) auto-fight creatures that target the owner / stand within 6 m (never hazards / bosses unless commanded); any pet obeys `L`. Damage = `petStats.atk` through `creatures.damage(id, dmg, null)` (no player aggro), bee DoT (3 ticks) + Hive Mind AoE, owl first strike x2, bear stun. Kills give the pet XP.
* **Guard:** holds a point 3 m outside the ship door, fights anything within 12 m of it (falls back to follow outside moon phases).
* **Role abilities:** cat / dog bark / owl(Lv20) sense marks on YOUR HUD (sprites, hazards from cat Lv20); owl farsight = loose loot marks; owl night vision (post gamma / vignette while it is near and it is dark); fox nose = closed chest marks; bear tank + bot firewall by wrapping `game.hostHurtPlayer` (tank share goes to the pet at 70 %, shield absorbs one hit, `shareShield` covers crew within 8 m); bee pollen heal, bot battery recharge (`itst`), parrot decoy (noise pulses at the aimed point + scare stun at Lv20), crow luck (wraps `inventory.hostLootLuck`, crew wide) + dig (max 4 finds / day), cat Nine Lives revive once per day.
* **Pet HP / KO:** creatures next to the pet hurt it (30 % of their damage, 1.2 s cooldown, dodge stat); KO -> `C.knockOut` on the owner's profile (rests one game day), item carry dropped.
* **Net:** owner sends request `pt {op:'sync'|'atk'|'cap'|'gone'}`; host broadcasts `ptinfo` (appearance, also replayed to a late joiner on `playerJoin`), `ptst` rows (delta compressed, 10 Hz: owner, x y z, yaw, anim, hp %, mode, carry, speed, hidden) and sends `ptev` to the owner (fetched / kill / ko / revive / heal / recharge / mk / bark / cap / say / shield). Every peer builds a model view per pet; `mirror` / `boardgame` / `petsBlocked` hide + freeze your own pet (`bl` flag).
* **Pet Carrier** (`pet_carrier` use handler): aim at a creature within 7 m, HP <= 25 %, species in `CAPTURE`: shows the odds, host rolls (`captureChance`), success = silent kill + new pet in your stable (carrier consumed), failure = "It broke free" (creature angry). `pet_treat` handler (feed the active pet, +12 loyalty) was already there.
* Not done: chest / boss egg drops, pet achievements, HQ pet shop kiosk prop (the shop stays a panel tab), pets do not collide with terrain props (outdoors straight line + hull slide only).

## 2. MAPS2

* **`M2_CHALLENGE_ON = true`** (rooms2.js). Challenge chance per facility lowered to 16 / 24 / 34 % (size < 0.8 / < 1.5 / larger) because they are live now. Spots now carry the prop (`spot.obj`) so the runtime can drive the prop anchors.
* **Bug fixed in wave-2 code:** the extra drawer cabinets / PCs / radios / phones were NEVER placed (footprint inset 0.4 m vs 0.3 m from the wall). Inset is 0.2 now; they exist and expose `spots` (`drawer`, `pc`, `radio`, `phone`).
* Files: `maps2_world.js` (shared: `m2s` broadcast + `m2` request handler, barriers = rubble/shutter mesh + static collider + nav edge block, `run.m2s` mirror for late joiners, helpers), `maps2_rules.js` (pure numbers + state machines), `maps2_challenge.js`, `maps2_events.js`, `maps2_furniture.js`, `maps2_text2.js` (EN/TR/RU). `maps2.js` installs them (each part failure-isolated).

**Challenge rooms** (host-authoritative; clients animate the prop anchors):

| Room | Mechanic |
|---|---|
| PHYSICS | 4 heavy scrap items (bell, pot, axle, bolt = 84 lb) spawn on the yellow pad. Host sums the weight of loose items on the plate every 0.25 s; >= 60 lb held 1.4 s -> plate turns green, 3 rare+ items drop. Ring colour follows the load. |
| GAMBLE | Fate lever, 40 credits per pull (max 6 per room per day, 2.5 s cooldown). Odds: jackpot 5 (220+25/qi credits + 2 epic items), win 24 (90+10/qi), loot 24 (1 uncommon item), nothing 27, curse 12 (scuttler + yoinker crawl out), blast 8 (22 dmg near the lever). EV ~ 46 credits vs cost 40 (test: 0.8x-1.6x). |
| ARENA | Console seals every opening with shutters (barrier + collider + nav block), wave 1 = 3+crew scuttlers, wave 2 = 2+crew scuttlers + crawler(s); clear = shutters rise, credits (70+15/qi) + 3-4 rare items at the `reward` spot. Abort (shutters up, creatures removed) after 10 s with nobody alive inside or 190 s. |
| PUZZLE | Two levers at opposite ends: pull both within 1 s (crew) / 6 s (solo) -> the panel lamps show the 4-colour code for 25 s; press the 4 colour buttons in order (wrong = reset + "WRONG CODE"; reset button). Solved: 4 rare items + credits. |
| TREASURE | Epic `usbidol` on the pedestal. Lifting it = the room groans (3.5 s warning), one non-bridge passage seals at 5 s, 9 rock falls (1.2 s shadow telegraph, 18 dmg, 1.6 m radius) every 1.5 s. Only ONE permanent seal per day (treasure OR collapse) so two non-bridge edges can never disconnect the facility. |

**Events** (`maps2_events.js`, one per moon day at most, quota index >= 1, 70-260 s into the day while somebody is inside; 24 % / 20 %):
* **COLLAPSE:** a corridor edge from `corridorSealEdges` (non-bridge, 14-45 m from the crew) caves in for everybody (rubble drops, collider, nav edge blocked).
* **MIGRATION:** a herd (3-5 scuttlers, a crawler from quota 5) spawns in a far room and walks to the target while host noise pulses at the target for 45 s pull the facility's creatures there; banner tells the compass direction.
* (Elevator Stop was not asked for and is not built.)

**Stateful furniture** (`maps2_furniture.js`): each drawer / PC / radio / phone can be used once per day; content is a deterministic function of (layout seed, id): drawer 32 % scrap, 14 % note, 20 % junk; PC log or +12..36 credits; radio = signal that points at the nearest challenge / story room (distance + compass) or static; phone = voicemail or (12 %) a scream that draws creatures. Used state = `run.m2s.used` (late join). Vending machines / fridges stay with `food.js`.

## 3. HOMEWORLD - on-site raid

* `homeworld_raid_core.js` (pure, tested) + `homeworld_raid.js` (glue), hooked into `homeworld.js hostTick`. Abstract raid (crew away) is unchanged. **When the crew is on HOME during a raid**, `RaidSim` becomes the data holder (building hp, core %, wave counters, rewards, result) and REAL raiders take over:
  * `sg_swarmer / sg_runner / sg_brute` (siege.js creatures, boss -> 3 more blobs) spawn along the raid bearing at 52 m (3/s, max 36 alive), walk a `siege_core.FlowField` built from the base (walls cost 6, other buildings 14, plus `game.deployables.blockers()`), attack players within reach, the nearest structure in reach (blobs like walls, others towers), crew deployables, else the pad (core %). Damage per hit = the abstract sim's (`S.dep x 0.4`).
  * Towers really shoot (`towerStep`): gun 0.4 s cadence tracers, sniper heavy slow shot (never point blank), tesla arcs chain (`chain` hops within 6 m), flame short range splash, cryo slows real creatures (`c.slowT`), spikes hurt walkers, mines blow (charges from `sim.mines`). The crew's own deployed turrets and weapons hit the raiders too.
  * Visuals on every peer: `hwmsg` `fx` (tracers, tesla zigzags, flame particles, mine explosions, turret sounds), `hp` (buildings <60 % smoke, 0 % wrecked look at once), `banner`. HUD panel says "Crew on site: raiders are real, defend the base!".
  * Timing: arriving folds an abstract wave in progress into the next real one (hp carried), 22 s grace; waves clear -> abstract reward formula + lull; non-final wave stragglers retreat after 70 s (hp carried); hard cap 480 s; core 0 = breached. Crew leaves -> raiders removed, remaining hp folded back into the abstract sim (`leaveSite`).
  * `run.siegeDay` is set while the on-site raid runs so a ship siege can not start on top of it.
* Test: an undefended base is breached every time, the reference defended base (13 towers + 10 walls) is repelled / held in >= 4 of 6 seeds.
* Not done: NPC workers, ship CRT raid feed, Trophy Hall exhibits, per-building health bars (smoke / wreck cues only).

## Risk / first thing to check in a browser
1. `pets_net.js`: `net.on('msg:pt*')` binding order, view creation on first `ptst` row, the marks sprites, `game.later` availability, fox / dog nav in the facility (`fac.nav.findPath`).
2. `maps2_world.js` barrier drop animation + collider on clients that load the map late; `moonPopulated` timing for the physics weights / idol spawn.
3. `homeworld_raid.js`: creature `speedMul` early-sector speed cap slows raiders, tracer scale, `siege` deployables interplay.
4. Balance numbers (gamble EV, arena size, raid on-site power) are from math / node sims only.
