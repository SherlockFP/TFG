# Wave 13 review — bounded browser assessment

Date: 2026-09-30. Evidence: dedicated two-tab local Chromium gauntlet plus focused fix reruns, source review, screenshots and transaction results in `PLAYTEST.md`. This is a technical/visual review of the new slice, not a human campaign or audio playthrough.

Provisional scoped impression: **6/10**. The hub/fleet and staffed side-economy structure makes the game easier to describe as its own game. It still needs stronger tactile interactions, deliberate presentation and a human co-op balance session. It would be misleading to call it finished or professionally polished from this automation.

| Axis | Scoped score | Evidence and limitation |
| --- | --- | --- |
| Originality | 6/10 | Fleet rooms, content exchange, fictional production, scouts and machine rules fit the dead-internet identity. Extraction/sell/quota remains the inherited skeleton. |
| Readability | 6/10 | Hub has one clear selection goal. C and Escape behave correctly in the actual browser. Echo still shows stacked affix/guide overlays over upper gameplay. |
| Economy / repeat loop | 6/10 | Chip accounting, bounded station reward, production and scout shift completion work and replicate; side income does not satisfy extraction quota. Casino/production interactions remain mostly buttons. Long campaign retention unmeasured. |
| Art / presentation | 5.5/10 | Green archive machinery and hazard edges are coherent; dock NPC is box-heavy and subdued. Workshop frame now matches the equipment UI. Final settled host-menu and equipped wardrobe screenshots confirm a consistent equipment frame. The world architecture remains simple and box-heavy. |
| Performance | Unscored | Throttled SwiftShader is not representative hardware. Captured console contains framebuffer-feedback warnings, so a clean rendering claim is inappropriate. No measured FPS or leak result. |
| Human combat / audio | Unscored | Models/states replicate and node fairness rules exist. No headphone listening, naturally navigated battle or two-human latency/voice check. |

## What improved

A newcomer starts outside the ship with an obvious selection task, chooses the starter through a physical fleet office, boards and can receive a late-joining friend on the chosen ship. The casino is an actual venue with separate cash/exchange and game stations. Production progresses by completed field departures rather than AFK timers; returning after work supplies a reason to revisit NPCs. The cargo trolley carries original world items and physically follows real keyboard walking, preserving value/identity across peers.

The gauntlet found and the team fixed missing local district prompts, missing hub mapLoaded integration, late pointer capture while panels opened, misleading old crouch tutorial, deferred takeoff skipping production completion, and old inaccessible shop prompts. These are concrete improvement loops, not a claimed general bug-free game.

## Prioritized next improvements

1. Keep affix/guide cards out of the central creature sightline. Delay informational toasts while aiming at a threat or in a chase.
2. Give casino results brief visible motion and NPC response; let friends observe a table instead of reading a wallet menu.
3. Make workshop production tangible through machine state/collection props. The current commission ledger is a first simulation layer.
4. Ensure purchase delivery copy and physical pickup point agree; verify the actual NPC Tools order with the proper tab.
5. Add directional dock/boarding signs and a stronger staffed exchange landmark, then test the walk without teleporting.
6. Play one full shift with two humans before changing enemy damage or quota. Measure survival, meaningful choices and recovery opportunities instead of scoring from scripted spawns.
7. Profile normal hardware and repeated landings. Keep software-WebGL warnings separate from actual user-device performance.

Expanded additions were checked selectively: NPC Tools purchases deliver near the trader; wardrobe Claim/Equip syncs a new suit; original large cargo transfers through the real facility portal; the vault helper spends35 Credits and unlocks the actual door after45 simulation seconds on both peers. The final focused wardrobe rerun removed all CSS focus errors. Horn state/usage wiring and offline transform checks pass, but the held-pose screenshots are inconclusive; visual grip assurance remains incomplete. The final fresh run also completed all3 Signal Run nodes and exactly one65-value physical parcel on both peers, and verified company citizens clear on actual takeoff with zero mod-event/runtime errors. Details are in PLAYTEST.md.

The extra systems do not automatically raise the score. Their integration is stronger, but natural discovery, tactile production, human combat/audio and campaign retention still need playtesting. The latest CPU snapshot (software Chromium,30 updates) had median3.1ms and p9538.6ms. It cannot establish normal-device FPS or prove the resource-scanner/trolley optimization speedup without a comparable baseline.

Latest coordinator fixes for persisted industry departures across migration and stopped-cart takeoff unloading passed actual-module Node regressions only; they were not rechecked through a full browser income loop. Title/host panels now have settled screenshots, while the large sound-off banner can still overlap the menu header. Central guide/affix suppression and tactile casino feedback changed after their earlier screenshots, so their perceptual feel is not treated as played evidence.
