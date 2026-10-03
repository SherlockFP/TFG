# Wave34 independent review

2026-10-03. Baseline `f875f3a4b0609be301fc70764b0d0eb07c72c324`.
Status: **PASS — frozen code and bounded native extraction accepted; no outstanding scoped P1/P2.**

Scope: one optional early Indexed Glass haul using existing native items,
physics, grab beam, Cargo20 brake, trolley and economy. Reviewer owns this
report only; root owns browser, combined validation and publication.

The selected design addresses a concrete visibility gap: original salvage
does not enter beginner factory pools, while Dead Link recovery starts on even
descent floors from depth 2. Indexed Glass avoids the Reply Drum's legitimate
pocket-storage bypass. Replacing one existing big-item slot with its original
rolled value preserves the offered economy; it does not promise every glass
will use the signature item's normal value range. Ordinary small salvage must
remain an available alternative.

Design contract traps identified before implementation:

- `hostPopulateMoon` reuses `bigSpots` for its guaranteed deep-room prize.
  Relocating a glass must not mutate those source records or move that prize.
- `ItemManager.hostSpawn` resolves the original definition's tier, value, ID
  and yaw before synchronous delivery. A final type/pose override must retain
  those results and consume all original random draws, including unused yaw.
- A single campaign receipt must be committed before any run/item broadcast.
  Both broadcasts can trigger callbacks immediately. Reentry or immediate actor
  removal must not create another offer. Save/load, JIP, migration, death and
  descent surface return must preserve consumption independently of item life.
- Prove access with refreshed native queries and the registered collider,
  including cuboid clearance around turns and ordinary doors. Interior route
  certification alone does not establish exterior travel or ship unloading.
- Cargo20 braking requires loose, unowned cargo approaching the helper at
  at least 0.7 m/s. Beam-held glass cannot be braced this way. Presentation must
  describe release/spotter braking truthfully and must not advertise Carry2's
  hold-E helper for this `kind: big` item.
- The native prompt decorator must preserve action selection and price/rarity;
  proximity copy alone is not evidence of reliable first-expedition discovery.

Acceptance remains pending: unchanged original stock/economy/random streams,
safe fallback, once-only lifecycle, real native transport/brake/custody,
and root's first-expedition discovery/haul attempt. Setup replay, native
integration, guided input and blind human play must retain distinct labels.
The owner's experience rating remains **1/10**.

## Frozen presentation source review

`earlyhaul34_presentation.js` and `earlyhaul34_text.js` preserve the native
interaction object fields and action identity, appending only subtext. Cargo20's
Push/Brace action therefore remains authoritative when installed earlier.
Native item scan admission supplies `label.type` immediately after constructing
the label (`actions.js:926`); the hook annotates only those admitted glass labels.
An initial reviewer concern based on the construction line alone was withdrawn
after reading this existing next-line assignment; no repair was necessary.

The native big-item interaction currently supplies price only; scan supplies
price and rarity. The decorator preserves both callers' existing information,
but does not add rarity to the interaction prompt. EN/TR/RU text resolves through
the native translator, with the current interact binding. No world/render
resource or update listener is added. Idempotent disposal removes the scan
listener and restores the wrapper only when still owned; a later wrapper's
captured disposed layer delegates without annotation.

The cart requirement is material: native `useExit` moves the player without
beam-owned big cargo. Cargo13's driver gate moves its existing custody IDs
through the native entrance, with range/floor/clearance checks; loading requires
released cargo and capacity, and unloading uses native item drop delivery.
The chosen cue correctly mentions cart transport through the entrance. Native
beam transport inside does not earn an end-to-end solo beam extraction claim.

No scoped presentation P1/P2 remains from source review. This is not a reviewer
browser or physical co-op test. Actual viewport readability, discovery,
release/partner brake, cart gate and unloading remain final acceptance work.

## Root integration and dev-fixture review, before native freeze

Boot installs the native offer and presentation after Salvage27's model/item
registration and after Cargo20's interaction wrapper. Lobby version is 0.12.6.
No boot/protocol blocker was found. Native source was still being corrected
when read; no final implementation conclusion is issued here.

The dev iframe imports main and setup dependencies in the same realm. Initial
campaign/ship/body setup is labelled. It calls the actual landing completion
and population path once, without a second manual population or simulation
step. Synthetic keys and mouse buffers feed existing Input/localActions; RAF
waits observe the App clock. The optional entrance teleport is a separate
labelled replay, not first-expedition traversal. No result-state injection was
found during the walk/beam actions.

Pending P2 fixture findings sent to root:

- The beam-back-release completion initially checks elapsed time and ownership
  only. Zero actual player/glass displacement can pass. Require measured motion
  and the same live item before calling this a successful haul.
- Scan completion initially accepts any existing `scanWave`. It needs a fresh
  native scan and the admitted glass label/cue to establish presentation proof.
- Setup initially has no in-progress guard, and marks its page consumed only
  after an awaited map condition. Concurrent/retried setup can clear the receipt
  and repopulate. Close setup admission before mutation and require a fresh page
  after a failed setup; block other scenarios while setup is pending.

The initial item-count field also used `.length` on `ItemManager.all()`'s
iterator, yielding no count. These are evidence-fixture findings, not claimed
production gameplay failures. Final report must retain their correction status.

Fixture repair reread: the three P2 findings above are **resolved in source**.
The page closes `setupAttempt` before mutation and requires completed initial
setup before normal scenarios; repeated setup cannot repopulate. Scan requires
a new native wave and an admitted glass label containing the handling cue.
Beam acceptance now requires the same live world item/body, at least 0.5 m
player movement and 0.1 m glass movement. Item counting spreads the iterator.
Landing waits for queue completion and two ordinary App RAF frames before
population; it adds no physics/simulation clock. Root was also asked to align
the separate entrance-replay guard with setup-pending/completed state and avoid
a rejected concurrent setup click clearing another attempt's pending flag.
Native production review and fresh browser evidence remain pending.

## Frozen native source and independent focused verification

Final reread found no outstanding scoped production P1/P2 in `earlyhaul34.js`,
the `hostPopulateMoon` slot seam or `ItemManager.hostSpawn` payload override.
Root's last fixture guard fixes are present: only the owning setup attempt
clears its pending flag, and entrance replay requires completed setup.

The host replaces the first already-budgeted big-item slot. The original
population arrays remain untouched, including the later deep-prize source.
Original definition tier/value, base value, ID and yaw draws finish before a
private object-identity proposal can replace type/position/quaternion. The
campaign receipt is set and the proposal cleared before run/item delivery;
removed items do not rearm admission. Existing whole-run save/welcome and
host-migration retention preserve the receipt without a new packet family.
Off-scope contexts and unsafe sites leave the stock slot intact.

Placement uses an isolated seeded stream, bounded candidate/probe/flood work,
native floor tests, standing capsules, glass cuboid sweeps and conservative
rotation clearance. It excludes locked/special door routes and other planned
big valuables, aligns route samples with ordinary doorway centers, and keeps
the final glass out of closed-door colliders. The real registered visual's
WorldItem bounds determine its collider dimensions. The temporary off-scene
probe has no body/world item/economy identity and disposes owned geometry.
The retained plan is host diagnostics, not a second authority for item state.

Reviewer independently executed:

```text
C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe tools/harness/earlyhaul34.test.mjs
exit 0; 3.87 seconds; all reported PASS cases
```

Observed factory seeds 1235, 17 and 1 admitted bounded offers. The size-1
plan took 13.60 m; seeds 17/1 took 14.29/11.29 m. Native paired population
kept every payload field except the selected type/pose. The synchronous
run/spawn removal regression, invalid proposals, off-scope/fallback cases,
registered collider/pocket rejection, controller route, native door animation,
pickup ray, beam/release and same-ID trolley load/unload passed. A separate
actual partner Session brake request reduced measured loose-slide travel
from 0.8924 m to 0.1610 m; owner/occupied-hand/wall negatives passed. Scoped
whitespace verification exited 0.

Harness limits were checked rather than inferred from test names. Its entropy
oracle controls direct original `hostSpawn` random draws only; Three.js UUID
allocation counts differ naturally between models and no production entropy
interception exists. Controller integration supplies requested movement directly
to the native controller, not physical keyboard input. Welcome delivery and
save use actual native methods, but migration uses role promotion plus an event,
not the full election UI/protocol. The descent case toggles depth around an
existing receipt; it does not stream/restore an actual surface checkpoint.
Trolley loading starts with a setup-positioned cart and does not prove its
entrance gate, outdoor journey, ship unloading or sale. These limits do not
create a known source defect, but cannot be promoted into completed play proof.

Root's final combined tests/build and fresh normal-first-expedition or explicitly
labelled replay/extraction evidence remain pending. No higher fun rating is earned.

## Dev cart acceptance helper source review

The added cart helpers preserve the already-haul-returned glass and player
poses. Their separate initial setup changes only the empty, stopped native
Cargo13 cart pose to the inside gate destination, with that skipped approach
explicitly traced. This remains setup rather than earned empty-cart traversal.
Subsequent load/handles/exit/unload actions use native Input E and existing
interaction selection. They require the offered ID in cargo custody, removal
of its loose body, native player/cart portal arrival outside, and restoration
of the same ID's native world body on unload. No item/value/HP result injection
was found in these actions. The failed locator-key/MutationObserver attempt
must remain in the playtest record.

No scoped helper P1/P2 was found. A successful run would establish the tested
inside-gate transfer and outside unload, not the empty-cart approach, loaded
outdoor journey to the ship, ship unloading/sale, physical input or blind
discovery. Final runtime evidence is still awaited; source inspection alone
does not confirm that those helper actions succeeded.

## Saved integration evidence inspection

Reviewer read the root's saved offer/scan/beam/return traces and inspected
`early-glass.jpg`. The first case preserves `ilb` value/base 274, shows native
Grab/Push with the handling cue, and admits the same glass into a fresh native
scan with fuzzy displayed value 263. The narrow image shows the matte frame and
wrapped cue; the unlocked fixture's resume overlay overlaps the action area,
so it does not establish normal pointer-lock presentation. Native beam movement
is 2.19365 m with player movement 2.48509 m. The return moves the same glass
7.02036 m toward the entrance, with native fragile value loss to 252/base 274.
Saved App/event error counters are zero for these completed actions.

The separate fresh silent-case record `browser-silent-drive.json` preserves
`ilm` value/base 159 through native cargo load and three controller movements
around the cart to its handles, then native `Cargo trolley: push [E]` selection.
It ends with the same ID in `c:cargo13`, native driver assigned, zero App/event
errors and test master/gain 0 while normal preference remains 0.8. That saved
record ends inside; root's reported outside arrival and final unload still
await their saved artifact before independent verification.

The first outdoor walk timeout, front-side handles selection failure and
locator/MutationObserver error are retained in the saved evidence. Neither the
entrance body replay nor empty-cart setup repairs those failures into a claimed
continuous expedition. This remains **NATIVE_INTEGRATION + VISUAL_REPLAY**;
no human fun, physical-input, Internet or migration-election claim follows.

Reviewer also inspected root's final logs: focused 8/8, full 266/268 in 130 s
with the same recorded `carry2` Windows libuv abort and `outdoor30_staged`
historical oracle failure, and build success in 2.17 s. The suite is not fully
green. All seven current production SHA256 values match `source-freeze.json`.
No new scoped production or fixture P1/P2 was found in this inspection.

## Final bounded verdict

Reviewer independently inspected the final seed-1 offer, return, load, portal
and unload JSON files, `cart-unloaded.jpg`, the latest dev cart approach helper
and final console record. All seven production fingerprints still match the
source freeze. The added approach helper walks through native input around the
cart; it does not change interaction targets, range, LOS or cargo outcomes.

The final chain preserves **`inb`, value/base value 120**:

- [Offer](browser-unload-offer.json): ordinary quota-0 native population,
  existing price/Grab/Push plus handling cue, native walk from the separately
  staged entrance.
- [Return](browser-unload-return.json): the same native beam-owned glass moved
  9.745964 m to the entrance and was released.
- [Load](browser-unload-load.json): actual controller approach and `Load nearby
  item [E]` transfer the same ID into `c:cargo13`; the fixture's native-body
  removal assertion passed.
- [Portal](browser-unload-portal.json): native `Take trolley through doorway [E]`
  moves player/cart outside, preserving the same glass and value in custody.
- [Unload](browser-unload-final.json): actual controller approach selects
  `Unload one [E]`; the same ID returns to world state, with null owner/holder,
  empty cart IDs and null driver. The fixture verifies the restored body is
  valid. Player HP is 100 and input is released.

These records show test master/gain 0, normal saved preference 0.8, and zero
App/event-recorder errors. However, [final console](browser-unload-logs.json)
contains one MutationObserver `observe` TypeError at 04:06:18.848Z. It is **not
an empty console**; provenance is unestablished. No scoped gameplay defect is
inferred solely from that exception, and it must remain in the published record.

The accepted result is **NATIVE_INTEGRATION + VISUAL_REPLAY** of the optional
offer, indoor haul, cart gate and outside unloading. It retains explicit initial
campaign/body setup, separate entrance-pose replay and empty stopped-cart pose
setup. The first outdoor timeout, earlier handle/unload selection failures,
automation exception and later low-height/load-selection stops remain failures;
the successful seed-17 return remains a separate case. This does not establish
a continuous ship-to-facility expedition, empty-cart approach, loaded outdoor
trip home, ship unloading/sale, real partner browser coordination, physical
pointer input, human enjoyment, host election, streamed checkpoint restoration,
Internet reliability or representative hardware performance.

No outstanding scoped P1/P2 blocks the reviewed change. Combined checks retain
the two documented baseline full-suite failures described above. The owner's
experience baseline remains **1/10**, with no fun-score increase inferred from
the passing native mechanics or bounded extraction.
