# Wave32 independent review

2026-10-03. Reviewed against publication
`b4af15223a85ed5ef2a7999517966af1524de324`. This reviewer audited the existing
asset pipeline before curation, then independently checked the new selections.
No application, asset payload, test oracle, staging or browser state was changed
by this review; this report is the reviewer's only repository write.

The model/catalog and creature-plan owners confirmed their final source freeze.
Asset results below cover the frozen combined
[library catalog](../../public/assets/ext/wave32-library.json).

## Primary license evidence

Fresh reads of the actual creator pages confirm CC0 for
[FoxTex by Foxhead](https://foxh3ad.itch.io/foxtexcom),
[PSX Electronics by Animimo Studios](https://animimostudios.itch.io/psx-electronics-asset-pack-free),
[Office PSX Demo by ALEX](https://apfelgarten.itch.io/office-psx-asset-pack), and
[LOWPO Horror by Standout 7](https://standout7.itch.io/horror-character-pack).
The Office page's optional credit request does not change its stated CC0 terms.
The LOWPO free download contains Ghost/Vampire/Zombie FBX references; the creator
explicitly states that the rigged characters have no animations. Paid variants
are not part of this acquisition or runtime proof.

Raw downloads and acquisition records remain in the external
`C:/Users/Sher/Desktop/TFG-asset-library/wave32/` library. This review independently
checks selected FoxTex ZIP members, rather than repeating the owner's whole
1.42 GB archive CRC/hash pass. Acquisition records retain the owner's whole
archive verification; that distinction is intentional.

## Verified texture payload

All **39/39** selected output PNGs decode fully with Pillow 12.3.0 under bundled
Python 3.12.14. The outputs are indexed `P`, contain at most 256 effective RGBA
colors and have maximum dimension 128: **36 at 128x128, three at 64x128**.
Their total is **533,496 bytes**. Output SHA256/byte count/dimensions match the
combined catalog. Each original ZIP member was read with CRC validation,
decoded, and checked against its source SHA256/dimensions. No mismatch occurred.
The contact sheet was visually inspected: muted metal, concrete and wood fit
the current industrial palette. This is a catalog review, not rendered gameplay
lighting, tileability, alpha-use or frame-time acceptance.

## Findings and remediation

- P2: source-authored front faces were not uniformly native +Z. Early radio
  bounds put the wide front along X; the model owner confirmed with axis-specific
  renders that the FM face is +X and ALEX cabinet drawers face -X. Fixed before
  final catalog verification: radio/VHS yaw -90 degrees, cabinet yaw +90 degrees.
  The final studio preview shows the intended faces; independent native bounds
  checks confirm the corrected width/height/depth and bottom-center conventions.
- Root requires embedded model atlases to use at most 256 colors without
  dithering, preserving alpha. Initial radio/VHS atlases decoded correctly but
  exceeded 256 colors: the existing Blender converter downsizes images without
  palette reduction. Fixed with no-dither quantization before the final hashes
  and studio preview. Independent decoding confirms the requested color limit.

## Verified model payload and catalog

All **6/6** final GLBs match their combined-catalog SHA256 and byte counts:
**136,896 bytes, 470 triangles**. They contain embedded PNG images and binary
buffers, with no external image/buffer URI dependency. Every embedded PNG fully
decodes: four radio/VHS atlases are 128x128 with 255/256/255/255 effective colors;
the two cabinet atlases are 256x256 with 27 colors. All six decoded alpha planes
are opaque. Samplers use nearest magnification and nearest mip sampling;
materials have metallic0/roughness1 and no emission. No animation is claimed.

Actual Three 0.186.1 `GLTFLoader.parseAsync` loads all six geometries with finite
positions, exact catalog triangle counts, bottom Y0 and centered X/Z. Native
world bounds match the recorded dimensions within 0.002 m. Only for this geometry
pass were image declarations stripped in memory because Node has no image
decoder; the separate Pillow pass validates the real embedded image payloads.
The owner also reimported/rendered final GLBs in Blender. The reviewer inspected
the final original/processed studio sheet: FM radio, vintage radio, four-VHS
stack, single VHS and open/closed filing cabinets are accurately named. There
is no VCR claim. Each tile is independently framed, not a relative-scale proof.

The combined catalog contains **39 PNG + six GLB**, **670,392 processed bytes**
and four source-pack records. All payload files exist and their hashes match;
new IDs do not collide with the existing main manifest. No absolute local or
`file:` references appear in the public catalog. The reviewer independently
verified hashes/CRC for the three small source archives and source hashes for
both model source members; selected FoxTex members were checked as described
above. The owner's full FoxTex archive verification remains separately labelled.
The two intermediate fragments were copied outside Git and removed from the
public directory by root; the combined catalog is the publication reference.

Credits accurately describe the selected library as unplaced and the LOWPO
characters as external references without animations. No main-manifest or
runtime source diff is present against publication `b4af152`. Thus the new
library adds no model preload, global texture override or world placement.

File counts do not establish a higher fun score; the current owner's baseline
is **1/10**. Root owns the final production build and staged publication check.
No new creature behavior, first-person encounter or human playtest has been
executed in this asset review.

## Creature-plan contract review

Read both frozen [specification](CREATURE_SPEC.md) and
[implementation plan](CREATURE_PLAN.md) against their actual native callers.
The author corrected the review's admission details: `game.descentThreat21`
is the real installed API; explicit `allow(type)` is required because
`allowSpawn(type,opts)` intentionally exempts owned custom/scripted data.
`run.quotaIndex >= 2` is the intended gate, rather than the credit-goal field
`run.quota`. NEW_IDS registration counts the family within existing new-rule
slots. The proposed industrial 25-second arrival veto is labelled a new narrow
rule; existing descent quiet applies only to liminal floors. The referenced
mapLoaded/facilityChanged/facilityWillChange events exist in native lifecycle.

The plan now reserves a floor attempt and publishes its immutable run receipt
before synchronous native spawn publication; it specifies own-attempt rollback
and a real Session replay test. Those tests are implementation requirements,
not results run in this wave. The two FSMs retain the native host clock,
once-only native damage, stun cancellation, real collision/LOS, safe return
route and cargo identity. Migration and join-in-progress cancel an unseen
attack into rest, then require a fresh warning. A future incompatible creature
runtime requires the existing protocol gate to advance; today's asset/plan wave
keeps version0.12.4 and contains no creature runtime edits.

The plan clearly distinguishes the new behaviors from existing Crawler/Buffer
Brute, keeps initial natural admission disabled, and preserves first-floor
exclusion and the current 1/10 baseline. Valve's cited
[cooperative design presentation](https://cdn.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)
supports the stated enemy-role/team-rescue inspiration; it does not establish
that these proposed TFG encounters are fun. The fixed arena seed, escape-space
geometry, balance values, animation/audio readability, multiplayer lifecycle
and player response remain untested implementation hypotheses. Their native,
first-person and human acceptance steps remain explicitly unchecked.

**Verdict:** no outstanding P1/P2 finding in the frozen asset payload, license,
catalog or plan consistency reviewed here. This approves the unused library and
documented plan within that scope; it does not approve a creature implementation,
world placement, gameplay performance or an improved experience score.
