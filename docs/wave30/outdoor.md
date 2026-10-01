# Outdoor build staging

The recorded Wave29 landing had a 161.9 ms native `outdoor` queue job. Ordinary
outdoor geometry previously built entirely inside that job, even with facility
construction split afterward. Wave30 now runs the same deterministic outdoor
body synchronously or through detached queued continuations.

## Native ownership and order

`buildMoonOutdoor(seed, moon, context)` drains `createOutdoorBuild30(...).finish()`.
`queueOutdoorBuild30(seed, moon, context, queue, onReady)` inserts continuations
inside the existing outdoor job using native `addNext` and `yieldFrame`. Each
continuation admits units until its 6 ms budget expires; one expensive native unit
can exceed that budget. Instant/resume callers remain synchronous.

Terrain triangle generation yields after four complete rows in its original
row/triangle order. Texture requests and each final material/geometry bucket are
separate units. Scatter attempts yield in groups of sixteen; existing prop,
instance, harvest collider, biome, outpost, landmark and broadcast stages retain
their original order. Optional static prop merging uses the existing staged
merge helper. Native RNG calls, lazy terrain plan heights, triangles, instances,
collider shapes, spawn points and gameplay placements remain unchanged.

The detached output has no scene parent and no world publication until `onReady`.
Its descendants finish before the previously queued layout, facility, mapLoaded,
phase and prewarm jobs. Queue flush drains the same units synchronously when the
existing phase lifecycle requires a completed world.

Pending unload registers one native `onClear` cleanup. The builder tracks its
partial group, colliders, owned materials and actually added LightPool emitters.
Cancel closes the iterator and runs top-level disposal once; queued failure clears
later callbacks. Successful publication unregisters cancellation and leaves normal
map unload responsible for completed output. Lights added by outposts before the
final emitters pass are included. Repeated cancel/dispose does not re-enter native
sub-owner cleanup. The existing `freeTree`-before-sub-owner order is preserved;
legacy sub-owners can themselves dispose buffers also seen by `freeTree`. This
change does not claim one disposal event for every pre-existing shared buffer.
The redundant old final traversal is removed, and tracked material clones already
visited by `freeTree` are not explicitly disposed a second time.

## Verification

Focused native harness: [outdoor30_staged.test.mjs](../../tools/harness/outdoor30_staged.test.mjs).
It uses actual Rapier, native LightPool and LandingQueue, plus the existing
recording-canvas fixture without a renderer or external asset preload.

Frozen original-output oracle was built from exported HEAD terrain
SHA256 `8e2f1570b83cfd4d20e04b9fb63cbd4f0729675e92860531e06195eb91771ca7`
and geobuilder
SHA256 `888ae76871571a9536c606784dc27268cb91c37a4fc3795c091e5613ff9b6781`.
Only import paths were adapted for the temporary native oracle. Committed golden
fingerprints cover the geometry attribute/index bytes, transforms, instances,
materials, native collider shapes/groups/tags, terrain heights/path, exit spawns,
interactables, harvest placements, scrap/outpost/crate data and avoidance queries.
These goldens are independent of the new shared generator. Native queued output
also matches the new synchronous snapshot exactly.

| Original case | Native meshes | Native colliders |
| --- | ---: | ---: |
| Hamsi, seed660949389, merge off | 111 | 394 |
| Lufer, seed17, merge off | 144 | 365 |
| Hamsi, seed42, merge on | 157 | 419 |

The same harness checks sibling/map-hook ordering, partial publication rejection,
flush, repeated early and late cancellation, real partial terrain buffer events,
attached sub-owner events, native collider/LightPool cleanup and injected entrance
collider failure. The fault is a labelled fixture; no gameplay outcome is injected.
Existing visual-only Points particle randomness is outside the semantic snapshot.

```sh
source /workspace/.tfg-tools/activate.sh
npm test -- -j 2 outdoor30_staged
```

Focused check passed. Warm native runs crossed 6–9 continuations and 72–102 units;
observed maximum chunks were 9.9–15.5 ms in that run. These are diagnostic Node
values, not a representative browser or hardware frame-time claim.

## Remaining atomic work

The preliminary read-only native audit of the recorded Hamsi seed measured cold
whole outdoor construction at 233–237 ms and warm calls at 83 and 56 ms. Cold
terrain construction was 19–22 ms; mesh construction53–60 ms included19–23 ms of
texture initialization. Native entrance creation alone reached37–58 ms. Native
Rapier terrain creation remained11–17 ms, including its uninterruptible WASM call.
Those measurements used native source with temporary timing wrappers and the same
recording-canvas fixture. Cold cache state differs from a running browser.

This scope keeps the heightmap constructor, cold entrance/model/material work,
native Rapier trimesh and existing biome/outpost/landmark/broadcast sub-builders
atomic. It adds no texture/model cache, collider topology change, new maps or new
renderer. Spreading the previous warm56 ms job does not eliminate every hitch or
prove a hard6 ms limit. A frozen rendered queue trace must assess the final
combined Game/facility/outdoor path and remaining owners; root owns that evidence,
combined checks, build and Git publication. The owner's experience score remains
5/10 until further player evidence supports a change.
