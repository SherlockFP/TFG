# Wave36 physical landmarks

2026-10-03. Map worker source freeze: `openplaces36_landmarks.js` plus one import/one helper call in `facility.js`. Starting published main: baab7fc06fa883485476b506bcfcd3307162b00e. Root owns combined Git, full suite/build and fresh silent browser verification.

## What changed

The wide halls now have one real entrance header and four distinct bay headers. Courtyard labels describe fuse/pump/storage/night maintenance; concourse labels identify closed electronics, an empty arcade, vacant displays and a returns desk; reception labels identify undelivered/lost/no-reply/return-to-sender counters. Each purpose has finite EN/TR/RU text. The entrance says Main Entrance; only surface courtyard/concourse append Ship Access. Deep reception appends Entry00 because its physical entrance is not the lift's surface-return control. No arrow invents a route.

`src/world/interiors/openplaces36_landmarks.js:38` locates the actual built primary entrance by native door kind/key and spawn. `:44` derives each bay's real shared open frontage from room cells, native open edges and adjacent public room IDs. Bay headers sit on the existing upper lintel, at the actual neighboring public height minus.9m. The entrance's lower edge is3.82m above floor; bay headers begin5.84m above floor. No floor prop, collision, nav, sky, light, emitter, cargo, economy or topology state changes.

`facility.js:26` imports the helper; `:1510` calls it with the existing theme context and built doors. Non-admitted legacy facilities allocate no landmark group. Five quads merge into one map-parented `openplaces36-signs` mesh and one matte Lambert material. The512×256 nearest-filtered atlas uses dirty ivory/charcoal/ochre, no emissive colour or broad green. Current-language atlas redraw changes only local pixels, not shared placement.

The facility's existing `freeTree` owns geometry/material/atlas disposal. Atlas disposal removes the language listener (`openplaces36_landmarks.js:80`). The same live map helper call reuses its existing group; rebuilding creates independent resources.

## Evidence

Focused command explicitly selects bundled Node24.19:

```powershell
& 'C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' 'tools/harness/openplaces36_landmarks.test.mjs'
```

Final exit0: [landmarks-green.log](landmarks-green.log). Genuine initial actual-facility missing-sign RED, captured before helper implementation: [landmarks-red.log](landmarks-red.log). That first run also captured pre-edit native physical SHA256 baselines for all three places.

The final test builds real facilities with Rapier and LightPool and verifies:

- Exact pre-edit collider shapes/transforms, nav cells/locks, native doors, salvage/cargo candidates and emitter snapshots for courtyard/concourse/reception.
- Actual first-person approach view rays hit the sign before existing wall/roof geometry, with native standing LOS, for all fifteen signs. Entrance/bay provenance is checked against actual door and cell metadata.
- A three-metre cargo envelope crosses each bay mouth. Native certified lift entry/cabin routes still build and all four crew capsule footprints remain clear after query refresh.
- Actual canvas drawing calls produce changed EN/TR/RU labels; Cyrillic is written by the atlas draw. Language updates preserve geometry. This is drawing-command evidence, not rendered pixel QA.
- One actual merged mesh, ten triangles, twenty vertices, one512×256 atlas (524288RGBA bytes), one material, zero new Three.js lights and zero new colliders per admitted map.
- Actual repeated facility disposal releases geometry/material/texture once, removes the language callback and leaves zero tracked native collision. Independent rebuild and time-sliced build preserve exact geometry/native physical snapshots. Legacy and foreign-marker negatives remain unadmitted.

Observed complete focused-case durations were456/304/312ms. These include initial facility construction, view/cargo/lift checks, disposal, rebuild and staged construction; they do not measure sign-only build time or representative hardware FPS. Texture byte count describes an unmipped RGBA surface, not measured GPU memory.

The existing Wave35 world neighbor was rerun after the initial signs and passed its four legacy goldens, eighteen deterministic layouts,44/52/44m native hall sightlines, standing controller entry/hall/lift traversal, early glass admission, actual cargo dimensions, staged equality and cancellation. Actual map totals increased by one mesh/ten triangles only. Root's final freeze suite owns the combined current result after the local material lifecycle fix.

## Concrete stops and fixes

Actual concourse view rays exposed a retained native catwalk grate and rail in front of low bay text. The header was moved onto the existing upper lintel using its actual public cell height; all approach rays then passed. The catwalk and open floor were retained.

A read-only runtime audit found that Backrooms `bakeMaterial` caches clones by source UUID. A per-map Lambert sign would therefore lose its original material from `freeTree` and add an atlas reference to that global cache. [landmarks-runtime-red.log](landmarks-runtime-red.log) proves the actual installed Backrooms module replaced the sign's material before the fix.

The root-approved local fix at `openplaces36_landmarks.js:93` marks the map-owned Lambert as `brBake`, the native bake function's explicit return-same opt-out. It keeps ordinary Lambert/native-light darkness without adding baked emission or a global cached replacement. The final test installs actual `brlevels`, confirms identical material identity after setup, then proves once-only native unload resource disposal. No Backrooms source or global cache behavior was modified by this worker.

These are native resource/geometry tests with setup fixtures. They do not establish font legibility in a browser, human route understanding, Internet multiplayer reliability, cargo delivery to ship or fun. Root owns fresh rendered/controller acceptance and publication; the owner's1/10 experience baseline remains unchanged by test counts.
