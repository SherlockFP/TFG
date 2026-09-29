# Wave 4 - SHIP2 (module `ship2`; Mini-Skeld ship, hull damage + outside repair, defence mounts, planters)

Owner: "Gemide bazi seyler ic ice girmis, fixle. Duz default gemiyi gelistir, Among Us gemisi gibi olsun (kucuk versiyonu).
Gemiyi disaridan da tamir etme ozelligi ekle: shop'tan mekanik alet (Ingiliz anahtari vs.) satin alalim."
Follow-ups from the lead: extra rooms (greenhouse / planters), ship defences on hull mount points.

Status: node-tested (`ship2_overlap`, `ship2_hull`, `ship2_install`), `npm run build` clean, ONE short headless run
(`tools/harness/wave4_ship2.js`, screenshot in the report). Not hand-played, not tested with two real players.

## 1. Clipping fix (before / after)
`node tools/harness/ship2_overlap.test.mjs [--verbose]` builds an AABB for every fixture (real prop bounding boxes, module-owned fixtures with their
model dimensions), then counts overlaps fixture x fixture / partition, fixtures poking into the hull walls or ceiling, doorway aisles that are blocked,
spawn capsules inside props and signs / windows overlapping something.

| | overlaps | inside walls | blocked doorways | spawns in props | total |
|---|---|---|---|---|---|
| BEFORE (legacy placements, kept in `LEGACY_SPOTS`) | 3 | 2 | 0 | 0 | **5** |
| AFTER (`SPOTS`) | 0 | 0 | 0 | 0 | **0** |

Found and fixed: Frame Console x Horn panel, Contract board x Mirror, Pet incubator x Decon shower (1.1 m boxes 0.4 m apart), Bunk bed 0.10 m through the
+z wall, Decon shower 0.02 m through the +z wall. Also proven now: the aisle to every shipyard doorway (R1 / N1 / N2) stays free, the food-table candidates are
individually free, the real `buildShip()` colliders stay inside the cabin, and every partition has a collider.
Single source of truth: `src/world/shiplayout.js` (`SPOTS`, `TABLE_SPOTS`, `DECOR`, `LAMPS`, `SPAWNS`, `PARTITIONS`...). The modules that own a fixture read their
position from it (one-line edits): shipfeatures (horn / mirror / TP button), lore (contract board), shop (kiosk), pets_incubator, models/anomaly (DECON),
crafting (bench), food_data (TABLE_SPOTS), fun (mirror spot). `terminal.js` / `shop.js` deliveries land in the yellow LOOT BAY (`dropPoint()`).

## 2. The default ship is a "Mini-Skeld" (world/shiplayout.js + world/shipdeco.js + small ship.js edits)
Same 14 x 7 x 3.4 m core, same doorway gaps (R1 / N1 / N2), same +z door with the ux opening: the door still looks open from outside.
```
 z -3.5  +--COCKPIT--+---------- HUB / GALLEY ------------+---- ENGINE ----+
         | monitors  | quota+charger  coffee  TP  arcade  | workbench      |  N1 doorway (cockpit north wall), N2 (hub)
         | lever     |   food table       pad             | reactor core   |
 z  0    |  <hatch>  |                                    +--R1 doorway----+
         | terminal  |   store  incubator  decon(MED)     |  suits  CARGO  |
 z +3.5  +-frame console-mirror-board-....-AIRLOCK door-bunk-crates/planter+
```
* Cockpit (blue): terminal, lever, monitor bank, Frame Console, big window with a rounded frame; hatch bulkhead at x = -4 (1.8 m opening, rounded posts, blue header band).
* Hub / galley (teal): store kiosk + contract board, mirror, pet incubator, decon shower with a MED sign, coffee, arcade, teleporter pad, quota screen + charger, food table, 3 clerestory windows (real holes through both hull plates).
* Engine room (orange): open arch at x = 3.2, workbench, glowing reactor core (unlit mesh + one pooled light), pipes, junction box.
* Cargo / quarters (yellow): bunk bed, suit rack, storage cupboard, crates, a **LOOT BAY** (yellow frame, sign) where store orders and dropships land.
* Coloured floor tints per room, guide stripes from the airlock (blue to the cockpit, orange to engineering, green to med, yellow loot bay), 7 room signs (one canvas atlas, one mesh).
* Rounded look: rounded door-frame posts + corner balls, sphere-capped window frames, half-dome nose with an orange band, glass in the new windows.
* Draw calls: everything new is merged (partitions + trims 2 meshes, floor tints 1, signs 1, deco/reactor 2, nose + ring 2, glass 3, hull damage 1-2 per active spot). The ship group has ~150 meshes (was ~135; the old props are not merged).
* Light count never changes (LightPool emitters only).

### Attachment points for shipyard / other agents (polish4: furniture, decals, greenhouse room)
* Doorways: `world/hardpoints.js` `CORE_GAPS` (R1 +x wall z -1.125, N1 -z wall x -5.4, N2 -z wall x 2.25) and `SOCKETS` are unchanged; `shiplayout.AISLES` documents the free walkway in front of each and the test enforces it.
  New rooms grow OUTSIDE those doorways exactly as before (`ship.hardpoints[id].setOpen`, `gapWall` in `world/ship.js` exported).
* Planters: `game.ship2.addPlanterSlot({ id, x, z, y = 0.5 (pot top), ry })` grows the plant (and gives Hydro Apples) on any pot a room builds; `removePlanterSlot(id)`. State is keyed by id in
  `profile.ship2.planters` (mirrored in `run.s2.pl`). A greenhouse module only has to build a pot + collider and call `addPlanterSlot` after it is built.
* `ship.layout.obstacles` (AABBs) is what the fault-panel placer avoids; new fixtures should add themselves (or be meshes < 5.5 m, which the placer already scans).
* Roof: `insideShip()` now treats the roof (y >= 3.7, over the hull) as aboard; roof ladder at x 6.75 on the +z face; roof rails collide.

## 3. Hull damage + outside repair (`game/ship2.js`, rules `game/ship2_core.js`, models `models/ship2.js`)
State `run.s2 = { sp: [{i, k, s, t}], seq, mt, pl, on, ps }` (host authoritative, generic run sync, late joiners get it in `welcome`); `run.hullDamage` (0-100) feeds `shipfaults.js`.
* Spots (12 hull slots, mostly the door side + nose + far side): **dent** (6 %), **leak** (10 %), **sparking panel** (12 %, orange emissive sparks + pooled light), **breach** (22 %, glowing rim + smoke). Integrity 100 -> 0.
* Sources (host): rough landing (chance rises with storms), weather every 100 s (stormy 1.0 / eclipsed 0.6 / rainy 0.35 / foggy 0.15), creatures next to the hull every 12 s (door slot preferred), raid squads (`horde.spawnHitSquad` wrap + `tfg:war` invasion), siege hull loss, `ship2.damage(source)` for other modules.
* Tiers: 0 (>= 85 %) nothing; 1 (>= 60 %) cosmetic; 2 (>= 35 %) lights flicker 22 %, door jams 20 %, takeoff +6 s; 3 (< 35 %) flicker 50 %, door jams 50 % (never twice in a row per player), takeoff +14 s (lever takeoffs only, never midnight / all-dead), power slots -1, pre-flight outer fault.
* Unrepaired spark / leak may become a breach overnight from quota 1 (35 %).
* **Early game (MASTERPLAN 19)**: quota 0 = only dents, at most 2, never a tier, no effects, halved chances, the red arc only slows; quota 1 = up to 5 spots, tier <= 2, no breaches; quota 2+ = everything.
* **Shipfaults integration** (no duplication): `OUTER_FAULTS.hullx` "Outer Hull Breach" is appended by `begin()` when `game.ship2.outerFaultWanted()` (quota >= 1 and a breach or tier 3), shows in the normal PRE-FLIGHT checklist / purge timers, is fixed from OUTSIDE and completed through `faults.fixOuter()`. `run.hullDamage` also adds the existing extra fault. Edits in `shipfaults.js`: ~10 lines, all marked `[ship2]`.
* Door: `host.js` `shipdoor` handler calls `game.ship2.doorJam(from, open)` (1 line).
* **Tools** (Company Store > Tools, terminal BUY): **Wrench** 35 (fixes dents / leaks / sparks, patches a breach down to sparks), **Welding Torch** 120 (faster, the only tool that fully seals a breach), **Repair Kit** 25 (consumable, 1.3 s hold, fixes a spot or patches a breach a step). Engineer / technician `repairSpeed` applies.
* **Minigame**: interact on a spot with a tool in hand starts a host session; keep holding E. A timing ring (deterministic from a seed) rotates: needle in the GREEN arc = x2.2 speed, plain = x1, RED arc = arc flash (-0.35 and a small shock, only slows in quota 0): let go. Releasing decays progress; the session ends after 3 s idle, on leaving range, on swapping tools or when the ship lifts. The host integrates progress (`stepSession`), the client only draws + predicts.
* Rewards: XP + coin per repair (breach bonus). Repair also works at the HQ (company phase).

## 4. Defence mounts (reuse the siege deployables)
5 roof mount plates (`MOUNTS`, away from the shipyard deck / turret sockets), reached by the roof ladder (+z face, x 6.75; "Climb to the roof [E]"). Holding a deployable kit (turret MK1-3, tesla, floodlight tower, sensor, repair drone) and pressing E places it through `game.deployables.debugPlace` (no rewrite of the turret AI: range, damage, targeting, HP, ammo, packing up, scrap repair all come from `deployables.js`).
* Persistent: `profile.ship2.mounts` (type, tier, hp); re-created on every landing, hp saved every 2 s. Packing up / destroying a defence empties its mount.
* Ship power budget (`powerSlots`): 1 slot in quota 0, 2 later, +1 per Engine Room tier, -1 while the hull is critical. Powered mounts get a full cell every 0.5 s, extra ones stay dark (HUD "DEFENCES POWER a/b", ring on the plate: green on / red off / amber free). MK1 is ammo fed and uses no slot.
* Wrench / torch / kit repair a damaged mounted defence (hold E, ring). Balance: turrets only exist on the moon, their range is the deployables' (22-30 m) so they cover the ship area, not the facility.

## 5. Planters
2 pots in the core (hub north wall, cargo corner). E: plant a seed (free) -> water (+0.5 growth) -> Seed / Sprout / Sapling / Tree / Fruiting over game days (0 / 1 / 2 / 4 / 6), one growth per day key (`runId:day`, applied when the ship reaches orbit). Harvest = 2-3 **Hydro Apples** (`fd_hydro`, eaten through the food module: +18 HP, +30 stamina, short sugar buff), the tree regrows in 2 days. State survives fired runs (host profile).

## 6. Net (all prefixed `s2`)
`s2req` (client -> host): `rstart {tg, item}`, `rhold {down}`, `rstop`, `mount {m, item}`, `pl {id, sub}`, `sync`.
`s2msg` (host -> client, `HOST_ONLY`): `rs` (session start: need, seed, tool), `rp` (progress), `rd` (done), `rx` (stopped: why), `hit`, `fixed`, `jam`, `shock`, `banner`, `err`, `mounted`, `pl`, `sync`.
World state = `run.s2` via `broadcastRun(['s2', 'hullDamage'])`. No new per-frame traffic (progress 6 Hz to the one repairing player).

## 7. Knobs
`ship2_core.js`: `KINDS` (cost / hold seconds), `SOURCES` (chances), `WEATHER_EVERY`, `CREATURE_EVERY`, `capsFor` (early-game caps), `takeoffDelay` / `doorJamChance` / `lightFlicker`, `RING`, `ZONE_RATE`, `TOOLS` (prices), `MOUNTS`, `powerSlots`, `PLANT`. `game.config.ship2 = false` turns the damage system off.

## 8. Tests
`node tools/harness/ship2_overlap.test.mjs` (10: before/after report, table candidates, real-ship colliders, aisles), `ship2_hull.test.mjs` (19: state machine, early caps, repair rules, ring, power budget, planter, tools), `ship2_install.test.mjs` (19: shop entries, damage sources, host repair sessions, tool validation, door jam pity, takeoff delay, shipfaults hooks, mounts, planters, dispose). Regression: `shipyard*.test.mjs`, `gameplay2.test.mjs`, `food*.test.mjs`, `pets.test.mjs` pass.
Browser: `tools/harness/wave4_ship2.js` (land, 4-view collage, damage, wrench repair via the host path, planter).

## 9. Known gaps / honest list
* Only one short headless run; nothing hand-played. Not verified by eye: the height of the outside hull spots for a player standing on the ground (slots are y 0.1-1.2), the roof ladder feel, rail colliders vs the shipyard deck, partition colours under the PSX shader, sign readability, glass tint.
* The old ship props are still separate meshes (no merge pass) - draw calls are +18 over the old ship, not lower.
* "Flak" is not a separate defence: MK3 (triple barrel) fills that role; no new turret AI was written. Tesla / MK2-3 range is the deployables' value.
* Hull damage is not shown in the terminal (no HULL command yet); the HUD dock + objectives show it.
* The weather roll uses `Math.random` on the host only (not world-gen, so not deterministic by design).
* Creature "attacks on the ship" outside sieges are approximated by hostile creatures standing at the hull; creatures do not actually shoot the hull.
* Hull slots 7 / 8 (far side) sit in the gaps between the N1 / N2 module rooms and the tail, so shipyard modules never cover them; nothing else on the hull is hidden by a module. No hull spots on the +x face (the R1 module wall).
