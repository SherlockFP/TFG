# Wave 14 — quality pass toward an 8/10 game

The owner's next request was to keep developing with the full agent team and raise quality, rather than merely adding a catalogue of systems. This round targets the concrete weaknesses from wave13's scoped 6/10 review.

- World: recognizable dock office/gantry and company archive silhouette, localized signs and marked service paths; existing sale, casino and fleet lanes remain passable for every hull.
- Workshop: three physical production bays, timed calibration, visible ready parcels, packed-goods sale and scout status. Existing field-shift deadlines, wallet, batch caps and old saves remain authoritative.
- Casino: actual host results appear on shared table displays for nearby friends; no additional payouts.
- Readability: rewards wait during danger, one urgent toast, teaching rows defer during danger, quieter level/achievement announcements and a menu audio footer. Tutorial purchasing directions follow physical NPC traders.
- Missions: rare opt-in archive-cell recovery and an existing guardian kit in a real bonus room. Return corridor stays open; exact guardian defeat enables one physical cache. No concurrent optional expedition/stalker goal.
- Escape: original Signal Warden, warning/line-of-sight pursuit/search, physical screening alcoves, host-validated hiding and free look while movement is held. A successful evasion enables one physical recording to carry and sell. Late-game, optional, once per landing; retiring the threat does not grant free kill rewards.
- Robustness: actual hidden-map transforms and more forgiving control targets for workbenches, no expedition chests or absent-exit radar error at a social dock, bounded post-physics shelter construction, model preparation during landing and targeted browser regression loops.
- Economy: the existing full-run simulator has an explicit `--relay` extension using the real manufacturing/survey ledgers, bounded rewards and new ship/weapon costs. See economy.md for assumptions and limits.

Install `escape14` then `missions14` after expedition13 in Game. Workshop14 is installed inside industry13; port14 is attached by the existing world builders. Do not add second wallet, quota source or independent production clock.

Testing and scored review are recorded in PLAYTEST.md and REVIEW.md by the independent QA agent. A target score is not proof of fun, stable hardware FPS or a finished commercial release. Source changes are in the current checkout; no commit/push is implied by local tests.

Verification: the complete `run_all.mjs -j 2` run passed **205/205 suites in 295 s**. Final changes were followed by escape14, workshop14, movement, dock radar/chests, readability14, guide and onegoal checks; guide reports 2,158 checks and the SFX fixture 6,894. Final production build passed in 3.03 s. The full build still reports its existing ineffective dynamic-import/chunk-size limitations. Browser findings and remaining intermittent rendering evidence are collected in BUGS.md.
