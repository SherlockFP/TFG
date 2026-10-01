# Wave29 — Courier airlock route

Initial read-only audit of the production Packet Courier ship on root-reported
main `9925fc1`, 2026-10-01. The route proof below preceded the small readability
change described at the end. No collider, reach or LOS change was made.

The ordinary standing capsule can reach the launch lever and leave through the
open airlock from all eight production ship spawns. The previous feet position
`[-0.095, 0.0187, 2.26]` points into solid ship furniture, approximately 2.7 m
left of the real airlock. It does not establish a doorframe obstruction.

## Physical proof and limits

The temporary native fixture `/tmp/tfg-ship29.mjs` imports the production
`buildShip`, Rapier `Physics`, `LocalPlayer`, `ItemManager` and furnishing
installers: shipyard, shipdeck, crafting, shop/weapons/deck, pets/incubator,
food/mess table, arcade, survival and static/decon. Native `netReady`,
`hostStart` and update callbacks construct the room contents; caught module
errors remain zero. The resulting setup has 83 physics entries, a real mess
table at `[-2.3, -1.2]`, and the actual incubator/decon colliders.

Setup is explicitly source-guided: a Courier layout, moon-phase `hamsi` run,
fresh profile, reduced motion, disabled head bob and a flat landing-pad box
whose surface is Y=-1.25. Each independent case starts at a production spawn,
or at the disclosed prior contact position. Initial placement uses the native
teleport API. The route itself uses ordinary forward input, look deltas,
`LocalPlayer.update` and physics steps at 1/60 s. There are no final position
writes, crouch, sprint, jump, mantle, deleted colliders or relaxed LOS.

The fixture opens and animates the native ship door before walking. It does
not execute the whole host/map landing lifecycle. The production contract is
`hostFinishLanding` in `src/game/host.js`: after entering moon/company phase,
it broadcasts `{id: 'ship', open: true}`. Thus landing opens the door; E is
only needed if a crew member closes it afterward.

This is a native geometry/input proof with the listed production furnishings,
not a whole-Game browser run, actual moon-terrain traversal, facility-entry
proof, unassisted discovery assessment or first-salvage result. No hardware
FPS or fun rating follows from it. The temporary script is outside the
repository; the browser owner verifies the actual full session separately.

Focused commands, using Node22:

```sh
source /workspace/.tfg-tools/activate.sh
node /tmp/tfg-ship29.mjs all
node /tmp/tfg-ship29.mjs wrong
```

Both exit successfully in approximately 1.8 s. All eight spawn routes finish
standing, grounded and outside `insideShip`, near X=2.6002/Z=5.962. The end is
on the native exit steps above the labelled flat-pad fixture.

At physically reached stations, the unchanged native
`actionMethods.findInteraction` selects, with ordinary range and LOS:

- Lever stand near `[-5.25, 0.02, 0.9]`, aimed at `[-5.8, 1, 0.9]`:
  `Start the ship / take off [E]` in moon phase.
- Door approach near `[2.6, 0.02, 3]`, aimed at panel `[3.98, 1.3, 3.39]`:
  `Close ship door [E]` because the door is already open.

These assertions prove native target selection, not a simulated lever action
or host request outcome.

## Finite browser input plan

Coordinates below are feet `[x,z]`. Walk and turn through successive
waypoints using normal input; stop a leg when within about 0.2 m. The native
proof does not require jumping or crouching.

| Production spawn | Verified prefix to cockpit approach `[-3,0]` |
| --- | --- |
| 0: `[-3,0.15]` | `[-3,0]` |
| 1: `[-0.8,1.3]` | `[0,1.3]` → `[0,0]` → `[-3,0]` |
| 2: `[0,-1]` | `[0,0]` → `[-3,0]` |
| 3: `[1.6,1.9]` | `[1.6,1.75]` → `[0,1.75]` → `[0,0]` → `[-3,0]` |
| 4: `[-1,-2.1]` | `[0,-2.1]` → `[0,0]` → `[-3,0]` |
| 5: `[-1.4,0.15]` | `[-1.4,0]` → `[-3,0]` |
| 6: `[2.4,1.95]` | `[2.4,1.75]` → `[0,1.75]` → `[0,0]` → `[-3,0]` |
| 7: `[4,0.3]` | `[3,0.3]` → `[0,0.3]` → `[0,0]` → `[-3,0]` |

Shared lever approach:

```text
[-3,0] → [-5.25,0] → [-5.25,0.9]
```

Aim at the actual lever point `[-5.8,1,0.9]`, confirm the native landing
prompt while in orbit, then press E. Wait for native landing completion and
the door animation. After landing, use this furnished route:

```text
[-5.25,0.9] → [-5.25,0] → [-3,0] → [0,0]
→ [0,1.75] → [2.6,1.75] → [2.6,3] → [2.6,5.9]
```

The actual door center is `[2.6,1.3,3.5]`, width 2.2 m. The optional door
panel is on its right at `[3.98,1.3,3.39]`. An already-open door should not
receive E during the exit route, because the native action closes it.

Prior-position recovery, without resetting position:

```text
[-0.095,2.26] → [-0.095,1.75] → [2.6,1.75]
→ [2.6,3] → [2.6,5.9]
```

Walking straight toward Z=4 from that prior position for 180 native frames
stays at Z=2.2599, standing and grounded. A forward static ray at Y≈0.419
hits at distance 0.3601 m, matching the incubator's front face at Z=2.62
plus the capsule/skin clearance. Moving backward out of this furniture lane
and sideways into the actual airlock exits normally. This is expected solid
furniture, not a dead end requiring a collision bypass.

## Existing cues and smallest recommendation

`src/world/shiplayout.js` already paints a blue floor route through the
cockpit hatch, along Z≈0.1 and toward the airlock at X≈2.3. The ship also
has the door hazard strip and exit steps. The green line instead guides to
MED/decon; the prior central contact is beside those service fixtures.

Baseline room signs included COCKPIT, GALLEY, ENGINE, MED, CARGO, LOOT BAY and
STORE, with no explicit AIRLOCK header. `fleet13`'s SHIP ENTRY marker is designed for
outside approach and intentionally does not appear inside the ship. The
ordinary moon objective names the facility entrance, so it does not explain
the initial sideways move to the airlock.

No collision fix is justified by this proof. The finite route was handed to
the browser owner for a full-session baseline before any source change.
Unassisted testing is still needed before claiming that a label resolves
exit discovery.

## Implemented after the baseline source freeze ended

On root's explicit source GO, `src/world/ship.js` supplies a tenth room-sign
record to the existing `buildShipDeco` helper. The final corrected center is
`[4.18, 2.4, 3.47]`, on the interior wall beside the right jamb; its front
faces the cabin (-Z). The existing atlas paints warm ivory lettering on charcoal.
The native locale helper selects AIRLOCK / HAVA KİLİDİ / ШЛЮЗ at ship build
time. A 32 px monospace label fits the Turkish text inside the 256 px cell;
the original nine room signs retain their 38 px lettering.

`src/world/shipdeco.js` accepts an optional `signs` list, defaulting to the
unchanged original nine. The supplied tenth label occupies the existing
unused atlas cell. The atlas remains 512×400, with one signs mesh, one
material and one texture. Only four vertices and two triangles are added.
There is no new collider, light, navigation object, panel, meter or lock.
The sign geometry/material/texture retain the existing `deco.dispose()`
owner; no new frame callback or resource owner is introduced.

Before the later placement correction, existing focused checks
`ship2_overlap` and `ship2_hull` passed (2/2). A temporary native check
`/tmp/tfg-sign29.mjs` also verified the default
nine-sign helper, the actual ship's tenth atlas UV cell, interior-facing
header bounds, all three selected labels, unchanged atlas dimensions and
existing sign geometry/material/texture disposal callbacks. Actual ship
builds retain 61 physics entries and eight emitters in that setup. The
listed furnished walking fixture retained 83 physics entries and all
eight exit/lever/door-selection routes passed after the initial sign change.

The recording canvas fixture verifies drawing calls and geometry, not
rendered font appearance. World-sign localization is resolved at build
time; changing language during the same ship instance does not repaint it.
No browser visual acceptance, hardware performance improvement or fun
rating is claimed by these focused checks.

### Occluded first placement and separate correction boundary

The first final browser replay showed the new objective, but its
[actual airlock frame](qa_shots/first-final-actual-airlock-cue-960.png) did
not show readable AIRLOCK lettering. I overlooked the installed,
enabled-by-default `public/mods/general-improvements.js` loot board when
choosing the initial header position `[2.6, 2.9, 3.47]`.

`MOD_SPOTS.lootBoard` mounts the real board at `[2.6, 3.02, 3.43]` facing
the cabin. Its opaque back spans X=1.74..3.46 and Y=2.74..3.30; the front
screen is at Z=3.415. The old sign's X=2.15..3.05/Y=2.74..3.06 bounds
overlap the board behind it at Z=3.47. From the captured approach eye
`[2.9088, 1.6399, 1.7204]`, the center ray crosses that screen at roughly
`[2.6097, 2.8604, 3.415]`, before reaching the sign. The native texture/UV
proof did not include this installed visual mod and could not establish
full-session visibility.

After the bounded retry stopped and root confirmed the browser was free,
root authorized a coordinate-only correction. The same atlas quad now
sits at `[4.18, 2.4, 3.47]`. Its bounds X=3.73..4.63/Y=2.24..2.56 are
outside the door's right edge X=3.7 and the loot board's X=3.46 edge. The
door panel tops at Y=1.7, bunks at Y=1.8 and cupboard at Y=2.0, so the
plaque clears those fixtures. The corresponding center ray passes the
board plane at X≈4.140, beyond its edge.

This final sign placement has its own later source-freeze boundary. The
earlier browser frame proves the initial occlusion, not the corrected
plaque's visual acceptance. No additional mesh, atlas cell, material,
texture, light, collider or navigation system was added for the correction.
