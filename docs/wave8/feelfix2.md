# Wave 8 feelfix2 (QA night 2 feel problems + low bugs)

Node-tested only (`node tools/harness/feelfix2.test.mjs` plus hubgate, feedcams, feedcams2, carry2, labyrinths, repomaps, qa1, hudcalm, onboard; `npm run build`). No browser run: check the shots listed under "Look at" on a real run.

| # | change | where | knob |
|---|---|---|---|
| 1 | Stream overlay end: player yaw set to the terminal. Locked "Unlocks at quota N" prompt only when within 1.5 m of the fixture. Tarp also hides any ship-group child (the black lid) whose centre is in the fixture footprint (rotated into local space, below the tarp top + 0.3, not room-sized) | `onboard.js beginStream`, `hubgate.js` (`LOCK_NEAR`, `inFoot`) | `LOCK_NEAR` |
| 2 | Drone beam: 56 slices, vertex-colour gradient (bright at the lamp, 0 at the rim), additive, no depth write; ground patch = 5-ring radial-falloff disc instead of a 24-gon. Camera floor cone: 20 slices (was 8), rim alpha 4 % | `feedcams2.js softCone/softDisc`, `feedcams.js M` | opacities in the material lines |
| 3 | Bulky two-hand carry: `fitGrip` slides the item low + right (hands follow) until its screen share <= `COVER_MAX` 0.25, then scales the visual down (min 0.55); `fpbody.js ghostTick` draws it at 60 % opacity (cloned materials, restored when no longer held) | `fpbody_grip.js`, `fpbody.js` | `COVER_MAX`, opacity 0.6 |
| 4 | Host `carryMul` while gripped = `coopSpeed` 0.92 (was weight-compensated up to 1.2); the weight penalty is cancelled in `localplayer.js` via `P.carryCancel`, so the pair still walks at ~0.92 | `carry2_core.js coopHolderMul`, `carry2.js`, `localplayer.js` | `FEEL.coopSpeed` |
| 5 | Metro: platform / terminus checker floor, ceiling strips + light every ~10 m (max 14), hazard band + glow trim on hall walls, corridor lamps every 2 (flicker 0.12). Influencer: pale marble corridor floor, warm gold lamps, lighter fog (0x2a0c1c / 0.045), emitters in 8 room types. Both: `practicals.corridor = 2` (new theme knob, default 5) | `lab_themes.js`, `themes_studio.js`, `practicals.js` | `practicals.corridor` |
| 6 | Day report: `body:has(.report) .hud-quota{visibility:hidden}` (the report has its own quota footer) | `docklayout.js` | - |

Look at: `n2_tarps`, `n2_dim_metro`, `n2_dim_influencer`, `n2_drone`, `n2_tagged`, vending machine carry (solo + two-player), `n2_day_summary`.
Known gaps: ghost is a flat 60 % (no dither); the ghosted item still uses `depthWrite` on; the strap line to the helper is still not verified visible.
