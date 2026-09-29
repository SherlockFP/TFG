# Wave 3 - WORLDS2 (Soviet district + raids, twin-sun planet, plasma blade, planet fauna, loot pacing)

Owner: *"daha detaylı mapler, Sovyet binaları, baskınlar; Star Wars benzeri yaratıklar ve atmosferler (ışın kılıcı bile); gezegen yaratıkları
görünsün; çok fazla loot var - azalt ve zaman baskısı ekle; oyun zamanla zorlaşsın; orijinal olsun, Lethal Company klonu değil."*

Module `worlds2`, installed with `this.useModule('worlds2', installWorlds2)` (game.js slot `[slot:worlds2]`). `game.worlds2 = { weapons, fauna, stats,
raidNow(), decayNow(), factors(), state, dispose() }`. **Status: node-tested + `npm run build`; NOT played in a browser** (no browser runs in this round).

## Files
| File | What |
|---|---|
| `src/game/worlds2.js` | installer: models, translations, days-in-run balance wrapper, host directors (decay / lockdown, raids, dusk prowlers, twin-sun population, decor loot), HUD clock, NPC barks, drops |
| `src/game/worlds2_core.js` | pure rules (no three / DOM): `dayFactors`, `DECAY`, raid schedule, `planFauna` / `herdPos` / `flyerPos`, `prowlerBudget` |
| `src/game/worlds2_creatures.js` | 5 creatures (Dune Maw, Tusked Beast, Scavenger Raider, Cantina Alien, Dusk Prowler) + 2 scrap items, behaviours, sounds |
| `src/game/worlds2_weapons.js` | Plasma Blade (saber move set, deflect, tier colours, hum), Blaster Pistol, Blaster Cell |
| `src/game/worlds2_fauna.js` | visible ambient fauna (instanced herds + flyers), radar dots |
| `src/game/worlds2_text.js` | TR + RU strings (EN keys) |
| `src/world/worlds2_data.js` | biome data (`soviet`, `twinsun`) + the two fixed moons via `registerMoon` (imported by moongen, so every peer rolls the same sectors) |
| `src/world/worlds2_biomes.js` | `registerDecor('soviet' / 'twinsun')`; also imported by terrain.js so any tool that builds a map has them |
| `src/world/worlds2_soviet.js`, `worlds2_twinsun.js`, `worlds2_solids.js` | the decor builders and the shared box-solid builder (merged geometry + Rapier boxes) |
| `src/models/worlds2_models.js` | procedural models: 5 creatures, grazer / flyer geometry, Plasma Blade, Blaster, Blaster Cell |
| `tools/harness/worlds2.test.mjs`, `worlds2_decor.test.mjs` | node tests (25 + 10 checks, see "Testing") |

Shared-file edits (all small): `game.js` (2 slot lines), `moongen.js` (import, 2 biome tables, one seeded swap block, 2 `def` flags), `terrain.js` (`reserved` footprints in
`avoid`, `reserve` in the decor ctx, 1 `dunes` line in `rawHeight`, 1 import), `outdoor_biomes.js` (`info` on the decor object), `host.js` + `progression.js` (loot pacing),
`combat_weapons.js` (`def.tracer` colour), `avatar.js` (expose `trailColor`), `screens.js` (radar hides buried Dune Maws), `tools/sim/economy.mjs` (count x0.7).

## 1. Soviet biome / moon (`w2sov` "1991-Runet Panelka", tier 3, cost 520, interior `office`)
* **Biome `soviet`** "Panelka District": snow ground, dirty asphalt paths, grey sky + thick grey fog (0.027), night colour, falling snow (1100 flakes), few dead trees,
  flat terrain (height 8, slope < 0.6). Also generated: sectors >= 2 may swap one slot (own RNG stream `w2:` -> sectors 0-1 keep their old rolls); generated Soviet
  moons carry the same `raid` config. 480 simulated sectors: 131 Soviet + 158 twin-sun moons in 1893.
* **Enterable khrushchyovka blocks** (2, +1 on scale > 1.15, +1 on tier >= 4 generated): 3-4 storeys of 3.0 m, 2-3 sections of 11.6 x 9.6 m. Each section has a through-going
  dogleg **stairwell** (10 full-column steps of 0.30 m per storey, alternating lanes, landing pads at both ends, roof hatch), 2 flats per landing (door at the pad), 2 rooms per
  flat (partition doorway), windows / broken sills, random wall collapses, party-wall breaches between sections, balconies with rails, furniture (beds, wardrobes, tables),
  entrance canopy + steps down to the terrain, roof with a broken parapet, vent stacks, antennas. Walls are cut into prefab-panel chunks with tint jitter (4 panel tints).
  Node check: **5400 stair steps + 1080 doorways** verified walkable with a 0.5 x 1.7 m body over 60 seeds (`worlds2_decor.test.mjs`; it caught a roof vent blocking the hatch).
* **Skyline**: 3-4 facade-only estate blocks (windows drawn on, ~8 % lit), 2-3 rusted playgrounds (swings, slide, carousel, sandbox), 2 garage rows, 2-3 heroic statues
  (worker / cosmonaut with a red star), 4+ **propaganda billboards** in TFG internet parody ("THE ALGORITHM PROVIDES", "FULFIL THE FIVE-CLICK PLAN!", "GLORY TO THE UPTIME!" ...,
  one 512x512 canvas atlas, EN / TR / RU by language), snowdrifts. Everything is one merged mesh per material key (8 draw calls for the district + billboards + drifts + snow)
  and 16-27 k triangles; ~1000-1500 extra static boxes (build time 60-300 ms in node).
* Sites are seeded (`createSiteFinder`: flat enough, clear of ship / path / exits / landmarks) and **reserve** their footprint (`ctx.reserve` -> terrain `avoid`) so trees'
  POIs / outposts / landmarks stay off them. Ordinary landmarks (tower / ruin / parkour / billboard wreck) still spawn (`landmarkBonus 1`).
* Loot: `decor.info.loot` spots (flats 25-40 %, roof prize) -> host spawns 62 % of the flats / 65 % of the roofs at moon population (part of the loot budget, see 4).
* **RAIDS** (`moon.raid = { first 170 s, every 250 s, n 3, factions }`): the host warns 20 s ahead (banner `RAID INBOUND` + alarm), then calls `game.horde.spawnHitSquad(faction, pos, n)`
  on a ring 44-58 m around the outdoor crew (22 m from the main exit when everyone is inside), squad size `3 + floor((day-2)/4)` (max 6), interval
  `every / min(1.6, 1 + 0.7 x (spawnFactor-1))` (>= 110 s, +/-15 % jitter), faction seeded from run + moon + raid number. The squad's `contact` is refreshed every 3.5 s for 40 s (a raid
  knows where you are; the horde AI then sweeps / follows the crew through the entrance). No raid while >= 6 soldiers are alive; postponed 25 s when nobody is out.

## 2. Twin-sun planet (`w2sun` "A2-Binary Dunes", tier 2, cost 260, interior `mineshaft`)
* **Biome `twinsun`** "Twin-Sun Dust Sea": crescent dunes (`biome.dunes`, terrain.js `rawHeight`, deterministic; slopes like the old desert: avg 0.35, max 1.9), sand / red-sand ground,
  warm sky + light haze, windblown sand particles.
* **Moisture harvesters** (finned towers 5-8 m, ~9 per map, footing + column collider, status lamp), **cantina outpost** ("THE THIRSTY BYTE", canvas neon sign, EN / TR / RU): octagonal
  adobe hall with a door facing the ship, corner pillars, open-oculus dome, bar counter + back shelves with coloured bottles, tables + stools, 3 neon lights, three huts, a landing pad
  with a parked skiff, drums, crates, 3 small harvesters. **Sand crawler wreck**: half-buried hull on tread pods, enterable through the rear ramp, torn side wall, roof breach,
  crates, console with a green light, 3 loot spots (one prize). **Giant ribcage + skull** landmark. **Scavenger camps** (2, +1 scale > 1.15): tents, fire light, crates.
* **Two suns + twin shadows**: two additive sun discs follow `env.sunDir` (the second 0.62 rad further round, lower, smaller, orange); every tall prop gets two fake shadow quads
  (2 instanced meshes, refreshed 2x/s from the sun directions, faded with daylight). **Heat shimmer**: subtle engine warp (0.075 x daylight) outdoors. No scene light is added or removed.
* **Creatures** (all host-authoritative, registered with `registerCreature`, generic paths give stun / hp scaling / xp / snapshots):

| id | Name | HP / dmg / speed | Behaviour + telegraph |
|---|---|---|---|
| `dunemaw` | Dune Maw (sand-worm-ish burrower) | 300 / 55 / 4.2 (buried 6.6) | buried mound + ring; tracks footsteps (noise > 0.12 or speed > 1.4, or < 9 m; a crouched silent player > 12 m is ignored); `rumble` inside 19 m; **erupts 0.85 s** after reaching < 3.4 m, one bite (r 3.6), `exposed` 3.5 s (vulnerable), re-burrows, 3 s cooldown. Drop: Maw Pearl (50 %) |
| `tuskbeast` | Tusked Beast | 380 / 38 / 1.8 (charge 8.0) | herd grazer; day: warns when a player stays < 6.5 m for 2.5 s; hit / crowded / night -> **paws 0.8 s** then charges in a **locked direction** (1.6 s), shoves the victim (`hshove`), stops on walls (stunned 1.3 s). Drop: Beast Tusk (50 %) |
| `scavraider` | Scavenger Raider (hooded) | 70 / 14 / 2.2 (run 4.6) | blaster carbine; camp alert (26 m); **raises the gun 0.85 s** before each shot, hit chance 48 % (+ near, - crouch, - target speed, - far), tracer fx via horde `hshot`, 5-shot mag, 2.2 s reload, keeps 5.5-15 m, bashes < 1.8 m. Drops: cell 45 %, blaster 8 %, **Plasma Blade 4 %** |
| `alien_npc` | Cantina Alien | 80 / 12 | **neutral**: idle / talk / drink / wander around its spot, barks a translated line to a player < 5 m (own bubble fx `w2bark`), bartender stays behind the bar; hit -> fights the attacker 30 s, flees when < 35 % HP. 5 species (bulb-head, tri-eye, long-snout, four-arm, frill-neck) x 6 robe colours |
| `prowler` | Dusk Prowler | 95 / 22 / 2.4 (run 7.4) | herd-follower by day, `chaser` (sight 26, hear 22, lunge) at night; spawned by the dusk director only |

  Generated twin-sun moons get `outdoor = { dunemaw 5+2T, tuskbeast 6+T, scavraider 4+2T }`. Landing population (host, seeded): cantina NPCs (species from the spot index), 2-4 raiders per camp,
  2-3 tusk herds of 3-4, 1-2 buried maws. Generic outdoor spawns only start at 17:00 (existing rule), so the day belongs to the herds and the camps.
* **Plasma Blade** (`plasmablade`, Company Store 1100, epic, melee `cclass: 'saber'`): humming energy blade (loop `w2_hum`), ignite animation + `w2_saber_on / off`, blade + glow colour by tier
  (common cyan, uncommon green, rare blue, epic violet, legendary amber, mythic red), the first-person swing trail takes the tier colour (`viewModel.trailColor`), whoosh + tint flash per swing.
  Saber move set added to `combat.js CLASSES`: light chain 0.9 / 0.9 / 1.3 x cd (3 targets), heavy sweep x1.9 (4 targets, 0.7 s stun), block 0.85, parry window 0.34 x `parryMul` 1.3.
  **Deflect**: RMB block + facing the shooter turns blaster bolts (cause `scavraider`, `hs_gunner`, `hs_leader`, `moderator`, `turret`) into **0 damage**, plays the deflect ring and sends
  `w2deflect`; the host validates holder / range / 0.25 s rate limit and hurts the shooter for `30 x tier statMul x 0.8` (+0.3 s stun) with a `w2bolt` tracer back. Melee blows keep the normal block / parry.
* **Blaster Pistol** (`blaster`, 420, rare): `cfire: 'hitscan'` so combat_weapons already provides ammo HUD, R reload, host validation; adds a red tracer (`def.tracer`), sound, recoil.
  **Blaster Cell** (`blastercell`, 45, 30 shots).

## 3. Planet creatures visible (every outdoor moon)
`worlds2_fauna.js`: per biome family (hills, swamp, frost, dunes, dark, jungle, glitch, ember, crystal) a seeded plan of 2-4 **herds** (12-26 grazers each) and 8-16 **flyers**
(half circle 14-42 m around the landing zone at 20-42 m altitude). Herds start 38-70 m (first) / 45-105 m from the ship, so they are visible **from the landing spot and from the ship's windows**:
the fauna is a child of the map group, so it descends with the terrain during the landing. 5 instanced draw calls (bodies, legs, flyer body, 2 wings), no colliders, no net traffic (each peer
animates the same seeded paths on its own clock). Herds wander off between 18:00 and 19:00; the **ship radar** shows herds as amber dots. The hostile side is real: Tusked Beasts (twin-sun),
and **Dusk Prowlers** from the dusk director (tier >= 2 moons, after 18:20, once someone is outside, `1 + 0.6 x tier + 0.25 x (day-3)` prowlers in packs of 3, max 7, one howl warning).

## 4. Loot pacing + time pressure + days-in-run (the numbers)
* **Fewer items (-30 %)**: `BALANCE.lootCountMul = 0.7` (progression.js). Indoor scrap = `round(rolled x 0.7 + scrapCountBonus(q))`, so the **early-game bonus (+3 / +2 items on quota 0 / 1, §19) is
  added after the cut and survives** (quota 0 on a 12-item moon: 15 -> 11). Big valuables `x0.7` (min 1), vault drops 80 % -> 56 %, outdoor spots 3 -> 2. Measured over moon counts 10-30 and quotas 2-13:
  **-27.7 % indoor scrap**. `tools/sim/economy.mjs` uses the same formula: median 4-competent run 10 -> 9 quotas, 2-competent unchanged at 7 (values per item are untouched).
* **Facility decay** (host, `DECAY` in worlds2_core.js): at **14:00, 16:30, 19:00, 21:30** every uncollected sellable item (loose in the moon, or carried by a crew member who is not in the ship;
  *not* secured / in the ship, not tools / bodies / soulbound) loses **8 %** of its value (x0.716 after the last step, the host's `it.value`, so the sell counter sees it; clients get the new values
  in one `w2decay` fx, no per-item break FX). Banner `FACILITY DECAY`. A right-hand HUD clock shows `LOOT VALUE 100 % (decay starts m:ss)` from 13:00, then the current % + time to the next drop and to the lockdown.
* **Lockdown pulses** at **19:00 and 22:00**: `game.facilitysys.force('lockdown')` (30 s, closes every open coded blast door) when a crewmate is inside; banner `FACILITY LOCKDOWN`.
* **Late-day pressure**: spawn budget x `1 + 0.30 x late` and spawn pace x `1 + 0.35 x late` (`late` = 0 at 14:00 .. 1 at 24:00), from day 2 on.
* **Days-in-run difficulty** (`dayFactors(run.day)`, wrapped onto `game.balance.scale` / `hitDamage`, so every generic creature path picks it up: spawn budgets, hp baked at spawn, speed, hit damage):
  **1.0 until day 4** (the §19 comfort period is untouched), then per day: **spawn budget +3.5 %** (cap x1.7), **hp +1.5 %** (x1.4), **damage +1 %** (x1.3), **speed +0.4 %** (x1.1). Bosses and hazards only get the
  spawn factor. Day 12 = x1.31 spawn, x1.14 hp. A sys message on landing tells the crew (`Day 12: the sector is getting harder (+31 % creatures)`). Applies only during a landing (orbit / HQ untouched).

## Net / hooks
No new net kinds: everything is `fx` broadcasts (`w2big`, `w2decay`, `w2bark`, `w2bolt` via the combat kit's `cb` channel) and the host request `w2deflect` (combat kit `hostOn`). Late joiners get the seeded
map and the creatures through the existing paths; decayed values reach them with the item snapshot. `hostOnCreatureKilled` is wrapped on the instance (drops) and restored in `dispose()`.

## Testing
```
node tools/harness/worlds2.test.mjs         # 25 checks: rules, sectors, creature state machines, weapons, deflect, fauna renderer, installer directors (fake game)
node tools/harness/worlds2_decor.test.mjs   # 10 checks: both decors on a stub terrain, determinism, footprints, 5400 steps + 1080 doorways walkable
npm run build && node --check <each file>
```
Also run once: `node tools/sim/economy.mjs` (loot pacing). Browser checks still to do: see Known issues.

## Known issues / not done
* **Never seen in a renderer.** Look for: Soviet block proportions and stairwell readability, window / door openings, billboard atlas orientation / mirrored text on the back face, statue silhouette,
  cantina dome (DoubleSide open oculus), sign facing, sun-disc size / additive blending over the sky dome, twin-shadow length on slopes (flat quads, `polygonOffset`), heat-shimmer strength,
  creature model proportions / animation (Dune Maw arch, Tusked Beast charge pose, raider gun raise), plasma-blade grip fit / glow / trail colour, blaster tracer colour.
* The Dune Maw can still be hit while buried (its mound is a normal hit target); the Soviet raid squads reuse the wave-1 hit-squad AI (outdoor movement is straight-line, no cover).
* Twin shadows are fake quads (no shadow on the player / creatures); the second sun does not light anything (light count must not change).
* Cantina NPCs do not trade or sell anything yet (they talk, drink, wander, fight when provoked). Sounds are procedural placeholders (`w2_*`).
* RU / TR strings written by hand (machine-level polish), the moon names `1991-Runet Panelka` / `A2-Binary Dunes` are proper names.
* The fixed moons appear in the ship terminal route list like the handcrafted ones (tier 3 / tier 2); generated sectors add Soviet from sector 2 on, twin-sun from sector 2 on (own RNG stream, sectors 0-1 unchanged).
* Loot pacing changes the economy: the median 4-competent run now ends about one quota earlier; if that is too harsh raise `BALANCE.lootCountMul` (0.7 -> 0.8) or `valuePerQuota`.
