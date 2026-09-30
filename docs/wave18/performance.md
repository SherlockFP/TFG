# Wave 18 — bounded HUD work reduction

Read-only review retained existing fixed-step physics, sliced landing/warm/disposal budgets, cached event-handler snapshots, quality presets and prop culling. No gameplay clocks, interaction polling, physics/render cadence or graphics identity changed.

One concrete repeated cost was the real HUD.update assigning unchanged weight, clock, level and rank text every frame, plus unchanged health color, stamina width, XP width and crosshair opacity. Text assignments now check the existing node; four visual styles retain their last exact desired value. Changed values still apply in the same frame. Prompt caching already existed and remains intact. Layout/resize measurement and native danger pacing remain unchanged.

Measured controlled integration evidence: construct the real HUD with a minimal counted DOM surface, set the native run and execute 300 unchanged real update calls. Before the patch: 1,200 text setter calls and 1,200 style setter calls. After: zero of either. These are setter-call counts, not a claim that every browser internally repainted each identical style. The fixture then changes health/stamina/level/skill points/XP/clock and verifies immediate updates, and changes layout geometry/window height to verify the existing right-stack measurement still adjusts.

Existing readability fixture carries this actual constructed-HUD regression alongside arrival/native-Warden/intercom checks. Shared browser QA is measuring real update/render component cost and attribution; software WebGL frame rate cannot establish player hardware performance. The fix removes demonstrated avoidable DOM work; it does not prove the owner's constant stutter has been fully diagnosed or resolved.

Shared browser baseline: short actual SwiftShader samples found HUD median 1.2ms / p95 6.2ms and update-event aggregate 2.8 / 21.8ms. Per-handler attribution on Hamsi identified voyage update at median 2.1ms / peak 28.7ms. Inspection found its empty-target marker path still called the native hotbar geometry helper; that helper caches at four measurements per second, but sampled low-rate frames regularly exceeded its cache interval. It therefore flushed layout despite having no voyage markers to place.

The narrow fix computes targets first and, when empty, hides retained markers and returns before marker DOM allocation/projection/hotbar measurement. Visible targets retain normal per-frame projection, resize handling and the existing geometry cache. No mission/NPC/hazard/update clocks changed. The installed voyage fixture drives its real update handler with elapsed frames and native replicated mission state: empty ordinary-moon callbacks perform zero hotbar reads; visible targets still project/measure and resize; mission completion hides old markers and stops reads. Full default voyage regression is used because a two-seed smoke invocation cannot satisfy its independent all-content coverage assertion.

Shared browser samples after the patches: selected HUD mutations went from 45 to zero, with HUD
median CPU time 1.2→0.2ms (15 baseline / 14 refreshed frames). The ordinary Hamsi Voyage callback
went from 2.1ms median / 28.7ms maximum to approximately 0ms / 0.1ms (18 baseline / 10 refreshed
frames). Shared hotbar geometry reads across all consumers were 24 in 3.5s before, 11 in 4s after.
The individual timings use small local SwiftShader samples; scenes, startup/load variation and other
consumers prevent treating them as a controlled hardware FPS benchmark. The removed empty-marker
work and unchanged DOM writes are directly covered by the installed-module regressions.
