# First-shift physical trading audit

No new root installer. industry13 internally creates trading15 alongside its workshop. Tools opens the Tools catalogue instead of the default Weapons tab. A short line explains that manufacturing and equipment spend the same crew Credits; starting funds and prices remain untouched.

Each broker has a blue pickup pallet with a real static Rapier surface. Coordinates derive from the vendor's current world transform, including the hidden-y=-260 builder transition. Collider placement updates with it. All equipment deliveries preflight a downward STATIC/DOOR ray on that surface before money is debited. World items spawn above the pallet, settle through normal physics, and use the normal E pick -> host held -> player hotbar flow. No automatic inventory grant and no ship fallback while physical trading is active.

Mixed orders now share one global delivery index rather than placing every item category onto the same first slot. The physical pickup tray has 12 slots and avoids positions occupied by uncollected world items. An order that cannot fit fails before charging; collect prior deliveries before ordering more. This bounds package clutter and physics cost without changing prices or crew economy. The purchase sound comes from the delivered package location and the success toast tells players to find the blue tray and aim at a tool with E.

Shop UI checkout is latched while awaiting its result (5s timeout). Each new checkout adds a unique orderId; the living-near-broker host wrapper records the latest 64 successful order IDs in the existing industry ledger and rejects transport replays, including restored run state. The existing store recomputes prices, funds, stock, trade-in and unlock validation. Terminal purchases remain host-bound to the physical broker. Production still uses one ledger, three bays, real completed shifts, calibration and existing per-shift sale budget; no passive currency or quota shortcut was added.

Verification:
- Existing workshop14 test now uses actual Rapier: hidden parent -> visible placement, delivery above actual pallet, distinct mixed-order positions, occupied-slot avoidance and finite capacity.
- Existing industry13 test exercises the actual checkout wrapper: repeated click sends one request, distinct purchases get distinct tokens, distant host purchase cannot reach the underlying store or spend funds.
- All prior manufacturing/deferred takeoff/migration tests still pass.
- Edited module syntax checks pass.

Lead QA performs the first expedition without money/teleport cheats. Browser E purchase -> world-tool pickup -> hotbar, including hub/moon/company, remains the important end-to-end check. The finite replay history does not promise indefinite archival deduplication of arbitrarily old requests. If a result times out, inspect the pickup tray before buying again.
