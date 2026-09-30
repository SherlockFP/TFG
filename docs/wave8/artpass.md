# Art pass on placeholder models (wave 8)

Source list: docs/wave8/studio.md ("placeholder models"), feedcams2 (Signal Jammer had none), nvgear, lockpick2, mining.
All new builders live in `src/models/artpass.js` (Kit-merged: one mesh per material, cached materials from render/textures.js, no lights,
no Math.random). Style: company yellow (0xd8a820) / worn grey plastic, rubber grips, `hazard_stripes` bands, `label_kefal` stencil plate,
a single small emissive LED. Tools: origin = grip, forward = -Z (models/items.js convention, so `gripOffset`/viewmodel fit works), `userData.tip`.
Inventory icons: ui/icons.js renders the model once, so no separate icon art was needed.

| id | before | after |
|---|---|---|
| tool_axe | cylinder + one thin steel box | yellow fibreglass haft, rubber grip + ribs, hazard band, red painted head plate (extruded profile, eye block, poll cap, ground steel bit, rivets); ~300 tris |
| tool_pickaxe | cylinder + long thin box in line with the haft (read as a spear) | same haft, grey head across the swing plane with two curved tapering points, carbide tip caps |
| tool_pickaxe_steel | same box, lighter colour | orange haft, chrome head, thicker points, orange reinforcement collars, through-bolts |
| tool_drill | yellow box + cone | pistol-grip cordless drill: housing with vents, rubber overmould, battery pack with hazard stripe, gearbox, chuck, fluted bit, stencil, green/orange status LEDs |
| lp2_titanium | reused the plain lockpick | own handle (knurl, blue accent), three fanned anodised-titanium picks, tension wrench, amber LED |
| lp2_bypass | `null` (looked up sl_hacktool, missing) | handheld bypass box: green display, keypad, antenna with red beacon, two clip leads (red/black) |
| fc_jammer | no model at all | rugged grey brick, emitter grille, three red-capped antennas, LED bar, hazard band, stencil plates, power switch |
| nvg1 / nvg2 | three boxes + two cylinders | binocular tubes with focus rings, eye cups, bells and glowing lenses, battery cap, strap; Mk I drab olive, Mk II charcoal/yellow with IR illuminator and red LED |
| nvcell | plain yellow cylinder | canister with hazard ring, steel terminal, dark end caps, 3-bar charge readout, stencil |
| sv_pt_* potion | two spheres + cork | lathed glass bottle, emissive liquid in the property colour, paper label band + colour tag, cork, hazard seal |
| sv_sickle | cylinder + torus | -Z tool: rubber grip, yellow haft, tapering crescent blade, ferrule |
| shard_* (6) + forge_backup | one primitive each | evidence-tag pedestal; scrap: three rusted shards on it; circuit: PCB with chip, caps, glowing traces; crystal: clustered emissive crystals; ecto: core in three hazard containment rings; algo: emissive ring + prongs; source: cube in a corner cage. Backup Drive: rugged drive with orange bumpers, usb plug, hazard label |
| deployable kit (createKitModel) | flat yellow box | hard case: corner bumpers, latches, carry-handle base, hazard band, stencil, red LED; the mini deployable still sits on top |
| vy_blackbox | orange box + black stripe | orange recorder with white reflective bands, mount flanges, locator beacon, hazard strip, label plate, red LED |
| vy_relic / strange relic | one octahedron on a cylinder | hex stone plinth with glowing glyph slots, three prongs holding a faceted crystal with white core |
| vy_meteorite | two icospheres | lumpy deterministic rock with glowing fracture veins and an ember core |

Crafting components (`models/components.js`) already are Kit-authored per id and were not touched.

## Tests
`node tools/harness/artpass.test.mjs`: every art id builds finite, merged (2-14 meshes), 60-1600 tris, sane bounding box; tools point -Z with a tip
anchor; axe/pick/steel pick/drill are distinct; shards/backup/potions/sickle resolve through their owning registries; every id in the shop
catalogue, string recipe outputs and the lockpick2 item table has a model builder (builtin, component, forge, survival, art or a module
that registers it); the unknown-id box stays the only `unknown` kind.

## Known gaps
Not looked at in a browser (no run allowed): grip offsets and proportions are from bounding boxes only. Pixel decal posters (64x96) still
flat. Some module models (food, arm_*, bag_*, deployable minis) were only checked for "has a builder", not restyled.
