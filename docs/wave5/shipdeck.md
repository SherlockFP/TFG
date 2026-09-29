# Wave 5 - SHIPDECK: Upper Deck expansion (MASTERPLAN 25.10, second half)

Owner: "geminin ust katina cikamiyorum, gemiye ust kat koy, tycoon oyunlari gibi gemiyi overall gelistir".
Status: node-tested (`ship2_overlap` 26, `shipdeck.test.mjs` 14 with the real Rapier character controller, `shipyard_install` 28, `shipyard*`, `ship2_*`, `stairs`), `npm run build` clean, ONE short headless tour (swiftshader, see "Browser" below). Not hand-played, not tried with two real players.

## What the crew gets
Shipyard panel has a new tab **UPPER DECK** (also reachable from the terminal `SHIPYARD` command and the Frame Console): a side cross-section of the ship (built parts filled, the next upgrade dashed green), the three tiers with costs, the buy button (credits, or ship parts at the Frame Console) and the room picker.

| Tier | Price (or parts) | What changes |
|---|---|---|
| Mk I "Bare deck" | 450 (6 plate, 4 bulkhead, 1 coil, 1 bracket) | The ceiling hatch opens, a stair housing appears in the hub, a deck slab with yellow rails, 4 cyan lamp posts and a red mast beacon appears on the roof |
| Mk II "Cabin + rooms" | 800 (8 / 6 / 2 / 1) | Glass-band cabin with a roof, emissive ceiling strips, **2 room slots**; each room is chosen by the crew (120 credits, swap / clear anytime): Bunk Room, Storage, Turret Control, Observation Lounge |
| Mk III "Glass dome" | 1500 (12 / 8 / 4 / 2) | Glass observation dome with ribs + lit base ring (taller silhouette), **4 slots**, one **extra roof mount `M6`** (ship2, on the deck under the dome) and **+1 ship power slot** |

Room effects are deliberately small and only count when the matching module exists: Turret Control +10 % roof-turret fire rate (Turret Hardpoint), Storage +6 rack slots (Cargo Bay), Bunk Room +60 s Rested (Bunk module), Lounge +10 % jam XP (Lounge module). The rest is look and feel (lit rooms, furniture, glass).

## How you get up there
Inside the hub (x 0.75..3.05, z -1.6..1.3, east of the teleporter pad) a **U-shaped stair** built with `src/world/stairs.js planStairs`: lane A (foot at the hub floor, south end) climbs north to a turning platform at y 1.975, lane B climbs back south and comes out of the **hatch** (an opening in the ceiling, the roof plate and the deck slab; until the deck is bought a lid, `ship.deckHatch`, closes it) onto the deck at y 4.0. Two 1.0 m lanes, 46.1 / 46.8 deg (limit 47), ramp colliders with a quaternion, flush at both ends. Rails round the well (open only where lane B comes out) and round the deck edge; cabin walls from Mk II. Colliders: slab, rails, both ramps + skirts, platform block, divider, housing, rooms (`deckColliders(t, rooms)`).

## Architecture
* `src/world/shiplayout.js` (single authority, pure data): `WELL`, `DECK`, `deckStairs()`, `withoutWell()`, `DECK_SLOTS`, `DECK_ROOMS`, `deckColliders()`, `deckFixtures()`, `DECK_MOUNT`, `DECK_ACCESS()`, `fixtureBoxes(S, { deck: true })` (the stair housing is a floor-1 solid), ACCESS `deckStairIn` + AISLE `deckStairIn`.
* `src/game/shipyard_core.js`: `state.deck { t, rooms[4] }`, `sanitizeDeck`, `deckQuote`, `tryDeckUp`, `tryDeckRoom`, `DECK_INFO`, room bonuses in `effects()`. `src/game/shipyard.js`: host ops **`deckup`** / **`deckroom`** on the existing `syact` request (same rate limit, aboard + orbit / HQ checks, Frame Console for parts), answers with the existing `symsg` `ok` message (`what: 'deckup' | 'deckroom'`). **No new message types.** State persists in `profile.shipyard.deck` (survives fired runs), mirrored in `run.sy` (late joiners).
* `src/game/shipdeck.js` (`game.shipdeck`: `tier()`, `rooms()`, `has(room)`): every peer polls the mirrored state, opens the hatch, builds the visuals and the colliders. `src/models/shipdeck.js`: merged geometry (textured GeoBuilder set + 1 lit + 1 emissive + 1 glass mesh = about 5-7 draw calls), no lights added (emissive strips only, constant scene light count).
* `src/world/ship.js`: ceiling + roof rects built around the well, ceiling collider split around it, `deckHatch` lid (mesh + collider, `setOpen`). Roof antenna moved to the nose corner.
* `src/ui/panels/shipdeck_tab.js` + 3 lines in `ui/panels/shipyard.js`.
* EN / TR / RU strings in `shipdeck.js` (`addTranslations`).

## Things that moved to make room (all still checked by the tests)
Chess table (now x -2.25, z 1.0), the third ceiling lamp, the disco ball (`SL.DISCO`, now read by `shipfeatures.js`), 2 spawn points, the roof antenna. **TURRET roof socket moved aft** (x 4.15..6.95; the model centres on the socket room) and ship2 mounts M1-M5 got new roof positions (ids and saved mounts unchanged) + `M6` (`ship2_core.js`: `mountY`, `deck: 3`; `ship2.js` gates M6 on `game.shipdeck.tier() >= 3`, `powerSlots(..., deckTier)`). The Observation Deck (DECK socket, roof, x -6.6..-0.6) is untouched and coexists.

## Tests
* `node tools/harness/ship2_overlap.test.mjs` (26): floor 1 with the stair housing = 0 problems (0 overlaps, walkways >= 0.9 m, every interactable + the foot of the stair reachable; and the hub without the deck is clean too); floor 2 for Mk II (two room mixes) and Mk III (all rooms, another order, empty): 0 overlaps, rooms inside the cabin, not over the well, 0.9 m walker reaches every slot, the M6 mount spots, the well rim and the stair exit; both flights pass `checkStairs`, meet the platform / deck flush; head clearance (a capsule that is above the ceiling / roof plate is inside the hatch opening); ceiling / slab pieces tile the roof exactly; M6 plate fits.
* `node tools/harness/shipdeck.test.mjs` (14): rules (sanitize, buy with credits / parts, rooms, effects) + **real Rapier controller walk**: hub floor -> lane A -> platform -> lane B -> deck at 5 and 8.2 m/s with 0 / +-0.3 sideways push (all arrive at feet y 4.0), Mk I walk up and back down, the rails at the well and the deck edge hold, lane B walls hold, ceiling solid beside the hatch.
* `shipyard_install.test.mjs` (+3): buy through `syact`, hatch opens, meshes + colliders, refusals (landed / maxed), late joiner. Regression: `shipyard`, `shipyard_models` (118), `ship2_hull`, `ship2_install`, `stairs` (1712 checks).
* Knobs: `shipyard_core.js` `DECK_CR`, `DECK_ROOM_CR`, `deckPartCost`; geometry constants in `shiplayout.js`.

## Browser
`tools/harness/wave5_shipdeck.js` (body for `headless_shots.mjs`): buys Mk III through the profile state, 5 3D shots (stair well in the hub, lane B looking up, deck rooms, dome, hull from outside) + the panel tab. Result and screenshot notes are in the hand-back report; see AGENTS.md 5.19.

## Known gaps (honest)
* Not hand-played; the stair feel is only proven with the kinematic controller in node. The hub loses a 2.3 x 2.9 m block of floor (walkways stay >= 0.9 m by test, but it is tighter).
* Creatures / nav do not know the deck (they cannot go up; siege targeting is unchanged). Items dropped on the deck are ordinary world items.
* Room effects are small numbers; furniture is decor only (no interaction yet). No sell / downgrade of the deck. No terminal command for the deck (panel only).
* The deck footprint sits over the hub; if the crew also builds the Observation Deck (nose half of the roof) both exist side by side (x -6.6..-0.6 and -0.5..4.0), with only a 0.1 m gap.
* `ship2_install` "repair ... Wrench on a dent" is flaky (random hull slot; it also fails sporadically before this change), not touched here.
