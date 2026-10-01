# Wave29 independent review

Opened 2026-10-01. Root reports clean main `9925fc1`; the owner's current
experience baseline remains **5/10**. [Wave28's review](../wave28/REVIEW.md) is
historical evidence for its particular source boundaries. This review owns only
documentation and read-only source/result checks; no browser, heavy tests, Git
or runtime source edits are performed by review27.

## Initial assessment

1. **The ordinary route remains incomplete, with no proven blocked door.**
   Wave28 earned dispatch and first landing, but its final player position was
   well left of the actual doorway. A static eye-ray contact there does not
   certify the capsule path or an exit obstruction. Before moving furniture or
   widening geometry, establish the live spawn-to-door route using the actual
   furnished ship, native controller, floor/contact data and real door state.
   An empty hull or direct outside setup would conceal this acceptance boundary.

2. **Physical salvage must become the first meaningful action.**
   Starter Chalk, Lead Pipe and Spray Paint supplied by landing are useful tools,
   but their appearance/selection is not a world-loot pickup. Record a genuine
   facility E, the chosen world item, native item ID/type/value and custody before
   and after real pickup/carry. Returning that same item is a distinct next
   milestone. Do not manufacture easy loot or remove threats simply to pass the
   route; preserve the gentle fresh-session admission and existing access rules.

3. **Stutter needs cause attribution before another optimization.**
   Wave28's final software diagnostic includes 11 updates over 50 ms and a
   428.1-ms maximum; physics had no samples over 50 ms. Its route differs from the
   dock-only baseline, and renderer/driver costs are outside those update timings.
   Separate transition/build spikes, repeated native/mod work and frame scheduling.
   The installed hotbar/static-screen cost fix already has scoped evidence; do not
   retest or replace that stable path without a newly observed reason.

4. **Route guidance must help a decision without adding chores.**
   Keep the dead-internet maintenance identity, matte PSX ship and open feature
   access. Use existing goals, actual target labels and concise context only when
   observed confusion requires it. Any marker/advice must follow the current
   landing/facility lifecycle, disappear on completion/unload, and avoid another
   mandatory panel, permanent visual overlay or tutorial queue. Source-assisted
   agent walking is useful physical evidence, not blind-human readability.

## Acceptance rubric

| Dimension | Observable acceptance / limit |
| --- | --- |
| Usability | Real movement reaches the furnished doorway/outside; facility and loot E select the intended label through normal range/LOS. Preserve an unsuccessful operator approach separately from a native obstruction. |
| Readability | Current goal/label refers to an available next action, stays useful while reading, and does not survive a departed context. No extra always-visible layers merely to pass guided QA. |
| Pacing | First loot/carry creates a meaningful route/risk choice. Record mandatory interruptions and repeated chores; guided wall time alone does not measure human difficulty or enjoyment. |
| PSX coherence | Any changed signage/geometry fits faceted matte industrial archive art and existing silhouettes. No glossy toy replacements, broad green emission or gratuitous lights. Physical route correction is not an overall art-score increase. |
| Stability | Attributed repeated cost or a reproduced transition defect improves at a matched boundary; timers/listeners/resources remain bounded after landing, reload and teardown. SwiftShader/native timing is diagnostic, not hardware FPS. |
| Cooperation | Shared doors/world and real cargo identity remain host-authoritative. A solo carry proves that action only; teammate roles, Internet reliability and cooperative fun require separate evidence. |

## Boundaries for proposed fixes

Review actual callers and installed wrappers, not isolated helper APIs. For route
changes, preserve native query refresh, doors/capsule clearance and furnished
return access; reject arbitrary teleports or LOS bypasses. For advice changes,
review downstream native queue delivery and map/phase ownership. For performance
changes, inspect real repeated work, invalidation inputs, resource ownership and
actual installed mod behavior. If shared host/map/custody contracts change, root
owns the required final combined regression.

A failed baseline remains visible after a passing retry. Each source digest and
check/browser result retains its scope. Lifecycle/position/outcome fixtures may
test contracts, but cannot be relabelled as the ordinary first-session playthrough.
Publish a partial result if the cap, death or valid physical blocker prevents the
larger route; do not inject completion.

## Proposed source boundaries — before implementation

The standing Courier route audit reports native clearance from all eight spawns
and recovery from the prior off-center lane. This supports retaining furnished
geometry; it is not a new normal-input browser completion. Baseline sources remain
frozen. Root reports a helper waypoint timeout under diagnosis, so no product
collision verdict follows from that operator budget.

**Carried-loot honesty:** source reading confirms Objectives counts slot IDs,
OneGoal prices slot IDs and Guide's `holdsScrap` scans slots. Stashing loot removes
that slot entry while native Inventory `bagItems()` still exposes the self-held
item. Guide can then award its ship step on apparent `!carrying`. Root reports an
actual native 31-credit bag case. The proposed shared enumeration should resolve
current native IDs from slots and bagItems, require self-held custody, deduplicate
IDs and preserve sellable/body/soulbound filters. Count, per-item taxed values and
Guide truth must agree across stash/unpack/drop/removal/foreign-holder transitions.
No item or wallet mutation belongs in this presentation helper. Bag enumeration
scans native items, so avoid duplicate calls within a single callback; a persistent
cache would require a real invalidation contract.

**Discarded descent paths:** discovery eligibility builds an A* path per room
from the same entry, then discards every smoothed path. The initial flood proposal
is superseded: connectivity and a 90,000-pop bound alone cannot preserve the actual
legacy fixed-size heap's duplicate-push behavior. Root instead requests explicit
native reachability-only A*, preserving nearest-walkable selection, search order,
heap/maxIter behavior and null failures, with an early return after native success.
All ordinary physical callers must retain array/null, including start-equals-goal.
Complete plans must match an executable old-algorithm oracle, including blocked
gates, final furniture mask, changed snapshots and large/custom layouts.

Haul's geometry-free native counter reports 265,108 recorded-seed `canStep` calls,
of which 36,126 belong to 1,199 discarded smoothing LOS checks. That is measured
unnecessary work, not attribution of the recorded hitch or hardware smoothness.
Review the actual implemented opt-in/default boundary and final native results
before accepting this change.

The Guide review additionally flags its old empty-hands inference: after picking
up scrap, dropping it outside and returning empty can still satisfy
`S.last.scrap && inShip && !carrying`. The bag helper alone does not turn absence
of held loot into proof of delivery. Root was asked for a drop-outside/empty-return
negative control or a clearly documented remaining gap. Existing native
`inShipItems` plus collected flags provide a separate delivery observation.

## First baseline result — driver budget, not blocked ship

I read [BASELINE](BASELINE.md) and the recorded stop fields. Fresh native Local
Host earned clerk E and free Courier claim, then stopped after 29.345 seconds
because a 20-wall-second exact-waypoint budget expired. Native Board Packet
Courier was already selected near the kiosk; final grounded player had HP 100,
empty keys, null obstruction ray and no standing capsule overlap. Boarding E was
not sent. This case proves neither ship exit nor a physical blockage.

The first trace attributes its worst 53.6-ms orbit update to an inclusive
49.4-ms `mods.emit:update` region. LandingQueue is empty. That aggregate region
does not identify an individual hook or explain renderer/driver delay. The record
preserves zero page/caught errors, bootstrap errors, exact seven-wrapper cleanup
and browser closure. A fresh corrected-driver attempt keeps frozen game source
and the global ten-minute cap while accepting a waypoint when its actual native
interaction is available; its result remains separate and pending.

## Interim source assessment

The second baseline earned boarding/landing, then stopped for delayed-keyup
oscillation; no physical exit failure is claimed. Source changes are now present.
Independent reading accepts their narrow boundaries pending final checks/results:

- The cargo helper resolves current ItemManager identities from actual slots and
  bagItems, deduplicates and requires self-held state, excluding body/soulbound/
  nonsellable/equipped custody. OneGoal now guards untagged players first and
  reuses one values list in its callback. No persistent cache or economy mutation.
- Guide requires a living non-downed player, actual ship geometry and carried
  cargo or a native collected floor receipt. Its empty-hands inference is gone.
  This closes the separately raised drop-outside/empty-return false completion;
  bringing held cargo home and unloading it remain different native outcomes.
- Ordinary first-landing Objectives name AIRLOCK before the distant entrance;
  actual aboard cargo names unloading even after facility-entry history. Warnings
  and special destinations retain their paths. The obsolete orbit STORE/BUY hint
  is removed. Current EN/TR/RU strings use the normal translation owner.
- Native hasPath shares the original A* search, cutoff/heap/fallback behavior;
  default physical paths are unchanged. The full-plan harness now routes its
  legacy searches through the frozen old algorithm after an independently caught
  oracle gap. Haul reports 31 scenario groups and 7/7 depth neighbors passing,
  including actual furnished nav and preserved physical candidate searches.
- AIRLOCK uses the existing sign atlas's spare cell: nine to ten signs, the same
  512×400 texture and one mesh/material, two additional triangles. It adds one
  decorative obstacle entry above Y 2.74, with no physical collider/light change.
  Existing deco owns geometry/material/texture disposal. Locale is selected when
  the ship is built; this is not a whole-game art or discovery-score improvement.

The final normal-input route, attributed costs, frozen aggregate source and root's
combined regression/build remain pending. No release verdict or improved human
rating is claimed yet. The **5/10** baseline stays current; source readiness,
physical route proof, human enjoyment and hardware stability remain separate.

## Source freeze accepted — result boundary remains open

Final read-only source acceptance closes the changed contracts above. I read the
actual carry native PASS log (1.847 seconds), including canonical custody, physical
flat-floor controller return, collected floor receipt, empty-return negatives,
warning priority and installed special filtering. Its initial arrival/floor/loose
cargo and adversarial state are labelled fixtures; it is not the seeded expedition.

The full-plan oracle routing correction is present. The final hasPath source
preserves native search and default physical results; discovery alone skips unused
construction. Haul's furnished native counter removes 43,829 of 302,079 discovery
checks (14.5%), 1,478 LOS checks and 64 waypoints, retaining 258,250 search checks,
41 physical searches and 5 physical smoothing calls. These work counts establish
the implementation saving, not attribution of the recorded aggregate hook spike.

I read [helper-controls](helper-controls.txt): the optional callback observer uses
native Emitter cache identity and a separate WeakMap shadow, preserving snapshot
dispatch, same-size off/add replacement, arguments, order, error catches and exact
Map.get restoration. Original registered Sets/cache arrays remain untouched.
Expected error negatives and the initial incorrect checker assumption are retained.
First uncached emissions are explicitly untraced; final attribution must not claim
complete individual-hook coverage from that diagnostic.

Root freezes JS
`100d8ca3954b070fac6a92429de0e153c133cec9325149b5639ba2d8debf4d44`,
all `src`
`42be1a15f016cd7dfd33edda6f4aafd04081a3342eda33beebc66af33aa9cc49`,
and combined `src` plus all public mods
`ccbfccddeeb448f66c02ec7777347a46298ea88dcf774393be4512de7bc378cc`.
I independently recomputed the combined digest and it matches. No source blocker
remains in the changed scope. Root's full 258-file regression/build and the fresh
normal-input result are still pending; publication acceptance stays open.

## Combined checks — retained fixture failure, focused closure

I read the initial full-run log: **257/258** files pass in 253 seconds. The sole
failed file, `onegoal.test.mjs`, loses three TAGGED assertions because its old
`items.get` returns an anonymous object for any ID, without native ID/state/holder.
The new helper correctly rejects that custody-less object. Root changes only that
fixture to ID `a`, held state, holder `me`, and null for missing IDs. Existing
distance, priority and tax assertions remain; production source is unchanged.

The actual focused `onegoal` plus `carryfeedback29` follow-up passes **2/2** in
2 seconds. I read the final build log: **2.97 seconds**, with existing recorded
chunk/config warnings. This is scoped failure closure after the earlier full run,
not a claimed full 258/258 rerun. Final source hashes remain those above. Fresh
native browser acceptance is now the remaining result boundary.

## First final replay and installed-sign placement

I read the first final-source result and independently viewed its saved 960px
AIRLOCK approach frame. Native claim, board and first landing lead to a physical
furnished ship exit at 132.971 seconds. The open doorway and AIRLOCK HUD instruction
are visible. The player is alive, grounded outside with no recorded standing
capsule overlap. The next surface stage was not attempted: the driver required a
positive-X join while the generated entrance was at X -40.899. That quadrant
assumption is preserved as an operator failure, not a facility or terrain defect.

The baked sign was not readable in this approach. Further installed-source reading
confirms an additive placement mistake: its old X2.15–3.05/Y2.74–3.06 quad at Z3.47
sits entirely behind the enabled default loot board, which spans X1.74–3.46 and
Y2.74–3.30 with its screen in front. The earlier recording-canvas/atlas fixture
missed that installed occlusion. A coordinate-only move to the right jamb center
`[4.18, 2.4, 3.47]` puts the same quad at X3.73–4.63/Y2.24–2.56, outside the board
and doorframe and above the panel/bunks. This is a bounded art-placement correction,
not a ship collider fix or a claim that players discover the exit unassisted.

The normal-route source freeze and its full/focused checks above remain intact.
If the coordinate correction is applied afterward, its final digest, focused ship
checks, build and explicitly labelled rendered fixture must remain a separate
boundary; it cannot retroactively become the source of the normal replay.

## Final coordinate-only source and focused checks

The final source puts the existing quad at the reviewed jamb coordinates. I read
the final ship hull/overlap log (2/2, longest file 0.4 seconds) and build log
(2.65 seconds, recorded existing chunk warnings). This follow-up does not replace
the earlier full/focused verification boundary or relabel either normal replay.
No collider, light, texture size or disposal owner changes in this correction.
Its decorative sign AABB now spans Y2.24–2.56 rather than the old header's range.

Final publication source is JS
`9a5aadb4d31350e1fa79f52680397e3a11ecfe82b0ca206daf5fcadd2249e4ba`,
all `src`
`7cf0c4c6f9ba6c83390b59e5c343a226fd82ccb4219a55179e3c19dcae9c6bc0`,
combined `src` plus all public mods
`b52935e44b4f4e4f664c8da072291af1741308e012f6229e0b84c5ba7cede3f8`.
I independently recomputed the final combined digest and it matches. The labelled
final rendered fixture remains the visual acceptance boundary.

## Final normal-input result — furnished exit, incomplete salvage

I read [final-focused evidence](final-focused-evidence.json), including actual
milestones, contact receipts and cleanup, and viewed its saved contact frame.
Fresh Local Host on natural landing seed699464887 earns claim, boarding, landing
and the actual furnished ship exit at 153.766 seconds. The grounded, living player
is outside, door open and no standing capsule overlaps recorded. This is useful
physical route evidence beyond Wave28's off-center approach.

The finite exterior detour goes through `[2.6,7.5]` and `[-8.5,7.5]` toward
`[-8.5,-5.5]`; it is not a diagonal walk through the hull. Three genuine held-W
bursts make only about 0.017–0.023m progress near X-8.518/Z3.160. A static ray hits
Z2.8 with outward normal, with the player grounded on terrain and an exterior
rock/mass visible in the screenshot. The generic ray does not identify a collider.
This establishes contact on the chosen detour, not an inaccessible surface or
facility. The attempt stops on that first contact at 182.933 seconds and closes at
186.840 seconds, preserving its predeclared failure rule.

Facility E, physical world scrap pickup, native pocket stash and tracked cargo
return are **not earned**. Their changed custody/feedback contract has native
integration proof above, but that labelled fixture cannot substitute for the
natural expedition. All eight diagnostic wrappers restore exactly, original
registered callback identities/cache arrays remain intact, keys are empty and
browser is closed. Zero page/caught errors, 18 bootstrap console errors and one
warning remain recorded; this is not an Internet-network acceptance run.

The final 881-update trace has 13 updates over 50 ms and a 329.7-ms maximum,
including 323.7ms in mods.emit:update and an anonymous cached callback at 318.3ms.
The recorded source hint `(dt) => q.tick(dt)` uniquely matches the native
LandingQueue update hook at `src/game/landingq.js:50` across src/public mods; I
checked that match independently. This is a scoped source-owner attribution,
not an inference from callback index. Its job report includes an atomic facility
cost of 301.6ms, although aggregate report entries are not exact per-frame links.
Atomic facility and outdoor jobs remain expensive; seeds, route and observer
coverage differ from baseline. Native discovery work is reduced, but stutter
resolution and a representative hardware speedup are unproven.

## Final rendered fixture and release verdict

I read [sign-final evidence](sign-final-evidence.json) and independently viewed
both final 960px and 1280px images. AIRLOCK letters are visibly readable beside
the actual open doorway, with the installed default loot board still present.
The native scene ray first hits the sign mesh, face19, rather than the board.
The 960px landing overlay remains in the capture; it was not removed to manufacture
a clean frame. The plaque retains the existing matte sign style and costs.

This is explicitly a **rendered fixture**, with recorded native lifecycle/seed and
body/camera setup, one native RAF and no claimed physical walk, expedition or cargo.
It closes the installed occlusion defect at the final `b52935e4…ede3f8` boundary,
not blind discovery or the larger normal route. The retained unnecessary-canvas-
click setup timeout is separate from the corrected 13.317-second fixture. Empty
keys, browser closure, zero page/caught errors, 11 bootstrap console errors and
two warnings are recorded.

**No release blocker remains in the changed scope.** Source review, retained full
failure plus focused closure, final coordinate-only ship checks/build and scoped
visual evidence support publishing these narrow fixes. The result remains
**PARTIAL_NATIVE_SHIP_EXIT** and the owner's **5/10** is unchanged. No complete
salvage shift, improved human enjoyment, unassisted discovery, Internet co-op or
representative hardware smoothness is established.

The next quality loop should identify the exterior contact owner, earn natural
facility/loot/carry/return with real custody, and profile/split the expensive native
LandingQueue jobs before claiming stutter resolution. Direct player reassessment remains
necessary; more feature systems would not close those evidence gaps.
