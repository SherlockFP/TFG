# Wave35 art — overcast enclosed places

2026-10-03. Task2 owns `src/world/interiors/openplaces35_art.js`, the opted atmosphere branch in `src/game/brlevels.js`, and one native art harness. Root owns browser, combined checks and Git. No assets were downloaded and no renderer, browser or saved audio settings were used by this task.

## Presentation contract

`openPlaceStyle35(baseDef, layout)` returns the exact base object for legacy, wrong-version or unknown-kind layouts. An admitted layout receives a copied definition/style/room table; the registered theme and its original private room styles remain untouched. The public and bay room types are `open35_public` and `open35_bay`; the builder's per-room callback also checks the admitted room IDs.

The public interiors use existing matte concrete, plaster, marble or faded office carpet. Public rooms have no center furniture, row/grid props, clutter, wall props or lamps; sparse covered bays use the existing wall-lamp emitter path. Native entrance/generator/core/vault styles and gameplay owners remain intact. No new THREE light is constructed. Name keys have EN/TR/RU translations: Service Courtyard / Servis Avlusu / Служебный двор; Empty Concourse / Boş Alışveriş Holü / Пустая торговая галерея; Reception Atrium / Karşılama Atriyumu / Атриум приёмной.

Copied atmosphere starts at neutral grey fog `0x71756f`, exponential density `.016`, hemisphere `.22`, ambient `.18`, with `viewFar:96`. These are visual tuning hypotheses. Root reads view metadata from the current actual facility; native `player.indoor` stays unchanged. In Backrooms, only admitted public reception rooms use the copied haze/ambient. Native dim-cell, room-breaker and facility-power blending still reaches the original dark look; other rooms and legacy layouts keep their native look.

## Sky ownership and ceiling

`openPlaceCeiling35(layout, cellIndex)` masks only the visual ceiling of `skyRooms`. The facility builder retains its original solid ceiling collider. The cloudy hemisphere is visible through this enclosed skylight, independently of the global exterior sky that is hidden indoors.

`buildOpenPlaceSky35(ctx)` adds one named mesh directly beneath the owned facility group. Its 42 m radius and 16×8 hemisphere segments cover the current central public-room footprints. BackSide, fog off, depth writing off, render order −10, noMerge and PSX_NOSNAP preserve the backdrop through ordinary indoor fog and static-geometry merging. A same-live-group repeated builder call reuses that mesh; another actual facility receives independent resources.

The single 128² RGBA DataTexture uses an isolated `src/core/rng.js` stream and periodic value noise. Grey channels stay equal, cloud cover stays opaque, and a small quantized palette remains nearest-filtered without mipmaps. There is no sun disk, broad green emission, sky animation, extra weather, dynamic light or external texture lifetime.

Measured native cost: **one cloud draw, 240 triangles, 153 vertices, one material, one texture, 65,536 texture bytes**. The actual LightPool fixture stays at **17 THREE lights** before/after building and disposal. Cloud geometry/material/texture are map-owned; the existing facility `freeTree(group)` frees all three once. There is no additional manual disposer or shared environment resource to release.

## Native evidence and limits

Bundled Node **24.19.0** runs `tools/harness/openplaces35_art.test.mjs` directly. [Initial RED](art-red.txt) fails the actual generateLayout/buildFacility result because the admitted facility has no owned cloudy skylight mesh. It reaches real Rapier and LightPool setup; this is an assertion failure, not a missing import. The first integration rerun used the wrong ray-wrapper property `toi`; inspecting native `Physics.raycast` showed `distance`, and the fixture was corrected without a roof production change.

[Final GREEN](art-green.txt) reports **6 PASS groups**, exit0 in approximately1s:

- Copied sparse style, unchanged legacy definition identity and three translated name keys.
- Actual Three.js upward view ray reaches the cloud through the visual roof; actual Rapier upward query hits the retained solid roof.
- Once-only geometry/material/texture dispose events through repeated native facility disposal, then a deterministic rebuild with distinct fresh resources.
- Native concourse and reception builds also expose their own cloud mesh while retaining enclosed ceiling collision.
- Actual Backrooms module callbacks retain legacy Level0 haze, admit long public reception haze, and preserve power/room-breaker darkness; no swallowed Emitter errors or native indoor mutation.

Node syntax checks and scoped `git diff --check` pass. These are **NATIVE_INTEGRATION / geometry-resource** checks. They directly invoke the production facility owner, rather than a complete Game.unloadMap session; root owns the combined Game/travel acceptance. Three.js ray visibility is not an actual rendered frame. Cloud appearance, matte first-person readability, all public-room viewpoints, distant view culling, normal input, human enjoyment and representative hardware performance remain for root's labelled visual/play evidence. No quality score is inferred from this task.
