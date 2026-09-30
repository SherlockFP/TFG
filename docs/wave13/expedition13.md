# Expedition 13 — one optional field job

The expedition module introduces player actions on existing ordinary moons instead of adding another loot dungeon. It becomes available after the first completed quota. Each landing offers at most one job: an existing bonus vault relay puzzle on an eligible odd seed, otherwise a path-based Signal Run. Home, company, voyage, raid, custom-terrain and major-goal moons are excluded; Echo Registry and Ember Cache keep their existing district activities without another objective layered over them. A job only appears in the objective tracker after players accept it at its physical control.

## Signal Run

Three numbered transmitter consoles are placed along the existing traversable ship-to-facility path. Solid footprints and lava/custom terrain are checked before placement. Left control cycles a three-position band dial; right control confirms it against the displayed target. Players can split up, or a solo player can tune them in any order. Wrong bands do not erase completed work. After all three, return to the first beacon to collect one physical Toy Robot salvage parcel worth 65 base credits. It must be carried home and sold through the normal game economy. There is no immediate quota credit or repeatable cash claim.

## Three-relay bonus vault

This uses an existing ordinary vault and its already finite generated loot. It adds three numbered relay controls in distinct rooms connected to the entrance, checking actual nav paths to all controls and the gate approach. It never reshapes the facility, closes an essential return route, or adds a boss door. Players activate relays independently in any order. At completion the vault permanently unlocks and opens through the existing door network/animation code, which releases its nav edge and physical collider on every peer. The old keypad is disconnected; ordinary vault/key/open requests cannot bypass the puzzle. Progress survives a same-map reload/late join and clears in orbit.

At the gate players can hire the workshop helper scout for 35 credits. This reuses the scout service concept without adding an ownership/upgrade tree. Busy outbound scout missions or unclaimed scout reports block hiring; the workshop cannot dispatch another scout while this helper is working. The helper needs 45 seconds of actual active host simulation in this same landing, checking a relay every 15 seconds. Large delta jumps are clamped; waiting in orbit, another map, or offline contributes no progress. Players can explore during the wait or finish remaining relays manually. Completion never charges again or creates additional vault loot.

## Rare tension and escape guidance

An accepted relay job can trigger at most one cosmetic figure scare per landing, only at quota index 2+, only on one of eight seed residues, after a second manual relay completion, and only for a healthy indoor player with no nearby known creature. A soft warning gives three seconds and invites the player to step away. Moving more than five metres, leaving, or dying cancels the figure. It calls the existing horror director figure effect and introduces no damage, forced combat, or unavoidable chase. A short acceptance hint points players to existing crouched hiding, sight breaking, door closing and door jamming when an actual stalker follows. This does not duplicate the stealth system or pretend to add a scripted Outlast chase campaign.

## Integration and APIs

In game.js import `installExpedition13` from `./expedition13.js` and install `this.useModule('expedition13', installExpedition13)` after `industry13`, so its handler wrapper can enforce scout availability. Public API: `game.expedition13.state()`, `.plan()` (actual controls, gate and anchor), `.requestRobot()` (normal host request, still requires gate proximity). Host requests use `e13req` with map token and operation `accept`, `dial`, `seal`, `relay`, `parcel`, or `robot`. Newly translated EN/TR/RU text lives in expedition13_text.js.

Geometry is merged into four material buckets with no added renderer lights or static colliders. Existing facilities retain their own disposal and door ownership; module-owned geometry is removed/disposed at reload or leave.

## Validation and remaining limits

`node tools/harness/expedition13.test.mjs` checks six real generated facilities, control reachability, genuine Game.onDoor/updateDoors collider and nav release, gate bypass rejection, remote relay rejection, one-time 35-credit service, busy-scout rejection, staged 45-second progress, off-map pause, same-map completion persistence, finite signal calibration and exactly one real host-handler parcel claim with no direct cash, stale-map-token rejection, special terrain exclusion and bounded geometry. Existing district tests remain separate. Browser and real remote-network playtesting are still required.

This is a focused optional side job. It adds a small calibration puzzle, relay choice/route planning, and paid automation; it does not add a full boss campaign or an Outlast-style forced chase. Future work should add an animated physical helper travelling between controls, authored clue patterns, a tougher opt-in vault variant and human tuning of activity time versus salvage value.
