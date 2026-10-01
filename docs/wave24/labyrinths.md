# Original dead-network labyrinths

Three finite themes use authored native ground-level plans, rather than elevated rooms without creature navigation. The existing generator still owns room filling, ordinary edges, floor and wall geometry, and optional native special-room attachments. No mandatory puzzle, currency or new meter is introduced by these maps.

| Theme ID | Physical identity | Route decision |
| --- | --- | --- |
| `deadletter24` | Long sorting spine, suspended parcel rails, dispatch hall and offset return bays | Short exposed spine versus longer loop through physically sheltered return bays |
| `mutedswitch24` | Central switchboard court, perimeter ring and disconnected booth branches | Direct central approach versus outer ring through taller booth cover |
| `permissions24` | Broad twin access galleries, repeated permission lintels and archive court | Right access gallery versus longer left service-gallery approach with cover |

Each theme has one ordinary, ground-level hub court with an 8–10 metre central arena radius, depending on room dimensions. This is geometry available to the separate mode director, not an automatically spawned or awarded boss. The arena and authored route rooms are protected from native Maps2 retyping by their hub metadata. Native optional treasure/shortcut locks remain possible outside the required graph; the authored routes require no special core keys. Ordinary creatures use the same native navigation as players.

Decoration uses four merged material batches, neutral steel/ivory, restrained ochre and faceted matte geometry. Sorting parcels, switchboard ribs and gallery lintels have different silhouettes and remain above walking headroom. Low return cases, booth partitions and permission cover have real STATIC box colliders, matching native nav footprints and `propBoxes` entries. Cover is deliberately offset from the court centre and entrance. The helper creates no additional light emitters, render targets, canvas textures or per-frame updates.

## Integration contracts

`src/world/interiors/deadletter24.js` exports `LAB24_IDS`, `LAB24_THEMES` and pure `planLab24(ctx)`. The existing interior registry includes the definitions; a narrow `planLabArch` dispatch invokes their authored spines. Native `buildFacility()` exposes the decorator contract as `fac.lab`:

- `id` and `arena: {room,x,y,z,radius,w,h}` with native floor Y.
- `routes: {exposed,covered}` as bounded build-time cardinal waypoints, including the entrance, branch and court positions. Preserving turns avoids smoothed diagonals skimming physical doorway frames.
- `spawnSpots: [{x,y,z,room}]` for clear, connected standing-body positions.
- `cover: [{x,y,z,size:[w,h,d],room}]` and `metrics` for actual authored resources.

Geometry/material disposal belongs to the decorator exactly once; native facility disposal owns its added static colliders. No second physics or item ledger is created.

`src/game/lab24_moons.js` exports `LAB24_MOON_DEFS` and explicit `registerLab24Moons()`. Root integration calls registration once. Destinations are `letter24` / 31-Dead Letter, `switch24` / 42-Muted Exchange and `permit24` / 64-Expired Permission. These mode-only IDs are registered in native `MOONS` but excluded from `MOON_ORDER`, which normal terminal charts and text route resolution use. Root integration must also reject direct forged normal-route requests for mode definitions. Their `instance:true` and `deadletter24:true` flags distinguish mode admission; empty ambient tables, zero power and zero native salvage prevent ordinary expedition population from adding a competing economy/director. English/Turkish/Russian theme names, destinations and descriptions are registered. Ordinary procedural depth theme selection remains root-owned.

## Native evidence and limits

The single `tools/harness/lab24.test.mjs` builds all three actual facilities at seeds 17 and 42 / size 1.1, plus seed 77 / size .75. Real Rapier standing controllers walk the direct route, longer covered route, reverse return and all certified cabin arrival paths with physical geometry intact. It checks arena perimeter clearance, native spawn connectivity and standing clearance, solid cover/native-nav agreement, missing required ordinary locks, bounded geometry and native collider/resource disposal. Mode-only destinations register the intended themes and zero native ambient budget.

These checks prove the sampled geometry contracts, not every procedural seed, naturally played combat, browser readability or hardware frame rate. Mode authority, projectiles, waves, bosses, drafts and crew transition tests belong to their separate runtime implementation. Internet-inspired names and floor mechanics are original; no commercial map, guardian or art assets are copied.

Ordinary exploration also receives native routable variants `letterfield24` (tier 1, free), `switchfield24` (tier 1, 40 credits) and `permitfield24` (tier 2, 95 credits). They use the same tested authored interiors with conventional finite ambient creature tables, power 4/4/5 and salvage counts 12–16/12–16/14–18. They carry neither mode flag nor a second reward ledger. The registration test distinguishes real expeditions from hidden zero-population trials.
