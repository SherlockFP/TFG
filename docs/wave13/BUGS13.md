# Wave 13 verified findings

Fixed:
- Wandering company citizens retained their world owner after unload and read null groundY on orbit updates. Life13 now clears before unloadMap and skips inactive updates; actual company-build/unload regression passes.
- Workshop progress records actual takeoff phase in serialized industry state. Fault repairs can bypass outer method wrappers; delayed launches and host replacement during takeoff now settle once on the advanced-day orbit event. Regression covers both.
- A stopped, loaded trolley unloads on actual takeoff even without a driver, before daily cargo accounting. Repair-delayed launches retain item ID/value and duplicate phase events cannot duplicate drops.
- Wardrobe filter/equip/reset focus uses dataset lookup instead of the stylesheet string named CSS, removing the runtime error. See PLAYTEST for the browser rerun.
- Periodic resource scans performed whole-scene traversal in one frame. Bounded incremental traversal now includes wide-parent child iteration.
- GPU sweep's permanent material WeakSet could forget reused material textures after known sets cleared. Epoch-aware discovery fixes repeated-map coverage; regression passes.
- Trolley visuals repeatedly reparented the same cargo; guard parent identity.
- Stationary trolley repeatedly mutated its collider transform; pose cache preserves moves/turns and skips idle broadphase updates.
- Trolley collision paths allocated temporary vectors each driving frame; synchronous scratch reuse keeps all collision probes.
- Horror director pressure allowed up to 0.25 power beyond the day budget. Cap is now strictly bounded by the day budget.
- Director treated quiet Checksum seeking as a chase and its threatening scan as calm. Machine-specific threat detection now follows its actual telegraph and target; Printer lane wind-up also counts as danger.
- Director charged one Spam Bot (0.5 power) for a host spawn that emits 2–4 bots (1–2 power). Pressure selection now reserves the full worst-case pack, then accounts actual synchronously spawned count. Unspawnable requests still refund the reservation.
- New machine sound registration could throw every update with a broken audio context. At most one warning per installer, with no retry storm.
- Missing labyrinth atmosphere profiles and core/gate boss aliases were fixed; atmosphere44facility and cycle3168check suites pass.
- Two regression fixtures were stale: SFX omitted actual new creature registration; perf's fake collider omitted real transform methods. Both now exercise the actual contract.

Still needing evidence / playtesting:
- Browser WebGL feedback warning: no confirmed source found in offscreen/post/photo render sequencing; do not call it fixed.
- Horror director overlaps other scripted spawners. Pressure now respects its existing daily accounting; global overlapping threat stress and subjective creature fairness still require actual crew playtesting.
- Incremental resource scanning limits scan work; map construction, first shader compilation, full final orbit sweep and audio recipe initialization may still cause spikes. Shared QA must measure these separately.

Assessment: architecture has many overlapping feature modules and directors; maintainability/complexity roughly 6/10, provisional. New creatures and map identities improve counterplay variety, but no claim of human-tested combat balance or end-to-end smooth FPS is made from Node fixtures.
