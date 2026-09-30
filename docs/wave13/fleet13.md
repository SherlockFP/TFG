# Fleet / Relay Dock — wave 13

New campaigns start on a real walkable Relay Dock: enclosed concrete dock, drydock gantries, dock office, visible dockmaster, and departure kiosk. The host visits the broker at (0,30), chooses a hull, and dispatches the whole crew at the kiosk (3,9). An orbit ship fixture returns everyone to the dock. Late joiners rebuild the same dock from the welcome snapshot and spawn outside, or spawn aboard the host's selected hull when underway.

Four hulls use actual shipyard module geometry and established gameplay effects:

- Packet Courier, free: compact core, no additional module route weight.
- Cache Hauler, 520 credits: Cargo Bay II + Engine Room I, freight rooms and broker bonus.
- Recovery Vessel, 680: Med Bay I + Bunk I, twin side rooms, mid-shift body revival and rested buff.
- Signal Surveyor, 880: Lab I + Workshop I + Observation Deck I, side wings and roof observatory, sample/crafting/scan effects.

Purchases are host-only requests validated by dock state and distance. Repurchasing an owned ship costs nothing. The crew cannot dispatch without a selection. Ship layouts, parts, decoration and upgrades are saved separately per owned vessel; switching preserves modifications. `run.fleet13` carries authoritative state and generic run saves; `profile.fleet13` preserves ownership through new campaigns and fired resets. Old saved runs migrate the existing ship to an owned Courier without wiping modules and continue in orbit. Saved dock visits resume at the dock. Root added the onboarding guard so the old Hiring Day wing does not teleport players away from the hub.

Integration: direct `installFleet13` import and module installation after `onegoal` in game.js. The module wraps hostInit, loadMapFor, spawnInShip, applyRunState, hostLever and hostSave; it does not add a new phase to the many legacy phase switches. Orbit + `fleet13.docked` is the safe-dock state. Real map geometry lives in `world/hub13.js`, with terrain surface compatibility, collider disposal, and `mapLoaded` emission. Root industry NPC can use `world.outdoor.vendorSpace` at [-18,-1.25,29].

Validation: `node tools/harness/fleet13.test.mjs` covers affordable starter, insufficient credits, duplicate charge prevention, invalid ids, genuine distinct capabilities, host-only buy, starting dock, crew dispatch, selected ship resume and legacy save migration. Existing `shipyard.test.mjs` passes 20 checks. Syntax checks pass. Browser QA is coordinated by root.

Limits: ships share the existing cockpit/core and modular construction language, but their walkable wings, silhouettes and capabilities differ. No separate full custom hull meshes or pilot physics. The hub uses existing procedural materials; skyline and NPC are basic low-poly art. Real WebRTC session/host migration during a dock purchase has not been manually tested. This is the first fleet implementation, not a claim that all requested content is finished.
