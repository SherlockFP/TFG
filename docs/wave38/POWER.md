# Wave38 — real facility power and voluntary departure

2026-10-03. Root owns publication and browser evidence. This worker changes native host power/fuse admission, map lighting continuity, per-floor power state and departure/door authority.

## Root causes and bounded changes

- Landing always set `powerOn=true`. A completed fuse therefore normally opened blast doors instead of restoring anything. Fresh runs now carry `power38:1`; only a facility with an existing genuinely reachable fuse panel starts dark. Old saves without that marker retain their former admission. No panel/prop/light count or geometry is added.
- Certification reuses the standing-capsule static flood, native locked-door boundaries, furniture/nav and eye-to-panel LOS from the lift procedure. No reachable proof means the map remains powered. Ship and exit groups remain powered during a facility outage. New certified depth floors get their own outage; surface return restores the saved surface power state. Late join retains native `run.powerOn`.
- Fuse completion previously sent `{}` and allowed any actor at any distance/map to restore power and claim XP. The minigame captures panel ID, moon, seed and depth before opening. The host rejects unknown/dead/downed, stale floor, remote and wall-blocked completions before any state/reward mutation. Existing native `power` broadcast and self/peer callbacks restore the actual LightPool facility group.
- Map unload reset `globalDim=1` even while the run stayed unpowered. It now preserves `run.powerOn`.
- Midnight no longer launches a living crew's ship. One explicit lever request starts an eight-second boarding countdown while phase remains moon/company and the door stays open. Repeated requests do not restart it. Then the existing seven-second flight runs. All-dead recovery remains to avoid a stranded unusable session. Saved interrupted countdowns are discarded on host init.
- A docked ship was rejected as orbit/flight when its door was operated. Dock orbit now permits native interior/exterior nearby live-player door controls with range/LOS proof. Space orbit, landing and takeoff remain sealed. External anchor matches `ship.doorOutside + (0,1.3,0)`.

## Evidence

`power38.test.mjs` first failed RED because an unknown actor restored power; after the guard it passes. The dock-door extension separately failed RED through real Session self delivery because dock orbit was rejected; the fix passes real Session opening/closing and space/far rejection. Countdown regression was added with the implementation and is not claimed as independently observed RED.

Focused native runs: `power38 broadcast18 events11 lifecycle28` **4/4** (only four filename matches); `power38 descent21_lifecycle descent21_boundaries` **3/3**. The power test builds actual factory seed1235, Rapier geometry, native standing-capsule fuse certificate and LightPool facility/ship/exit group behavior. Earlier broader `power38 descent21 descent23 atmos12` was **8/9**: old descent21 test required the CanvasTexture sign now removed by the art worker, reported to root for art-owned fixture repair. No browser/human fun/hardware claim or full suite was made by this worker.

Limits: first-power admission uses reachable existing panels rather than strategically rebuilding every panel location; unknown/unreachable layouts remain lit. Native paired lifecycle regressions pass, but this worker's power/door network test proves self delivery plus native authority boundaries, not Internet transport reliability. Top-screen countdown rendering and revised midnight HUD/help wording belong to root.
