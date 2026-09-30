# Wave 13 — Relay crews

The crew starts at Relay Dock, meets field traders, chooses a vessel, explores changing districts, returns to a staffed content exchange, and reinvests in rooms, production and robot surveys. The shared crew economy and the Algorithm/camera fiction remain the centre of the game; optional side income cannot replace its content quota.

- fleet13: walkable start hub; four functional vessel configurations; host selection, crew boarding, save/legacy migration.
- company13: original clearing district, staffed services, archive skyline, freight path, bounded individual bell discipline.
- casino13: enclosed club, NPC chip cashier, three distinct games, purchased chips and atomic redemption.
- industry13: physical supplies, three commissioned products, fictional contraband/customs, bounded field-shift production and robot surveys.
- cargo13: physical multiplayer cargo trolley, existing item custody, load/unload/steer and return-trip logistics.
- life13: wandering alien citizens; rival moon survey crews; conversations and bounded survey/barter choice.
- districts13: two real route destinations and labyrinths; ordered recovery and shared pressure-dial puzzles; return-route landmarks.
- threats13: two fair, readable machine creatures; positional audio pacing; perception threats delayed until quota 2.
- controls13/menu13: C crouch, moved spell wheel, saved binding migration, Escape/pointer-lock races, restrained menu chrome.
- stealth: footsteps remain audible to creatures but visual waves only briefly appear near an eligible visible threat; crouching/sneaking/empty areas stay clear.
- expedition13: one optional outdoor signal job or a three-relay bonus vault per eligible landing; paid, delayed robot assistance; rare telegraphed shadow encounter reuses existing horror and escape systems.
- arsenal13: two quota-gated weapons with explicit range, ammunition, weight and recovery tradeoffs; existing host combat and NPC sales.
- wardrobe13: eight equipment silhouettes, four backpacks and four weapon finishes; existing progression, ownership and multiplayer appearance sync; compact catalogue and preview/equip controls.
- viewmodels13/performance13: corrected horn and utility grips, small use poses, incremental GPU resource scanning and allocation-conscious trolley updates; measured CPU harness evidence, without a device-FPS claim.

See PLAYTEST.md for browser evidence and REVIEW.md for honest evaluation. Code/tests are in the current checkout; a running local test, saved environment configuration and a published multiplayer release are distinct states.

Validation ledger: the broad pre-extension run passed 194/196 suites. Its two failures (perf collider fixture and missing SFX registrations) were fixed and independently rerun successfully. Final new expedition/arsenal/wardrobe suites and relevant controls/fleet/casino/cargo/industry/districts/threats/stealth/guide/mapmods/grip/cosm5/GPU/SFX/performance regressions pass; onboard passes after the remaining Ctrl tutorial copy was migrated. Industry includes fault-delayed launch and serialized host-replacement settlement; cargo includes stopped-cart delayed takeoff. Final Vite build passes (3.49s); existing ineffective-dynamic-import warnings remain. The entire broad suite was not repeated after the final additions. CPU perf simulation totals 0.522 ms/tick across 132 handler medians; this is not browser FPS. Browser-specific outcomes and unresolved warnings are in PLAYTEST.

Final travel regression: life13 clears wandering citizens before their world is unloaded, and an actual five-citizen company build → orbit unload → update test passes. The final build also passes with that fix. Subsequent focused browser results supersede initial failures only for the specific rerun documented in PLAYTEST.
