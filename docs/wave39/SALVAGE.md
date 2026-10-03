# One valuable optional bay

The hypothesis is that a valuable at the end of a recognizable side room can make a detour worth considering. The source and its limits are in [RESEARCH](RESEARCH.md): David Pittman's GDC2015 Eldritch presentation discusses dead-end loot and landmarks. This implementation uses existing PSX bay signs and existing cargo. It adds no asset, light, room, item, currency or reward roll.

`hostPopulateMoon` collects the IDs returned by the existing small-item spawn loop. Immediately after that loop, `relocateSalvage39` may move one already-rolled ordinary scrap item worth at least90 through the native `it:tp` event. The original spawn position, ID, item definition, tier, value, yaw and every original random draw remain unchanged. The subsequent big-item and creature population continues normally. Original used small-item positions and all big/vault/reactor positions stay reserved when checking the destination.

Admission requires the fresh `exploration38===1` receipt, matching surface run/world/layout identity and native courtyard or concourse landmarks. Old saves, peers, stale worlds, deeper floors and special campaigns retain their original placement. Held, owned, collected, fragile, apparatus, reactor and legacy `fj` items are excluded. A bay containing a fire exit is excluded. The optional room must connect only to one public room and already have its own native bay sign.

The helper uses `hashString` for bounded deterministic selection, separate from population RNG. It refreshes modified native bodies without stepping physics, then checks `physicalReach21`, real floor, standing capsule clearance, the item's actual rotated cuboid, room bounds, existing occupancy, ordinary pickup range and static/door LOS. The item sits at least4m behind its sign; its route is at most120m. At least one cheaper positive-value item must remain accessible outside that bay on a route at least4m shorter. If any condition fails, ordinary placement remains intact.

`run.salvage39` is reserved before the existing Session broadcast self-delivers. Reentrant item/run handlers cannot relocate the same population twice. The existing native body and custody identity survive the move, and peers receive the same event. No extra timer or teardown owner is introduced.

Focused TDD evidence, Windows Node24.19:

```powershell
& 'C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/harness/salvage39.test.mjs
```

The initial RED failed because no optional plan existed. The expanded focused run passed in about7s. Three explicit positive-control setups walked native capsules to PUMP SERVICE (Hamsi35), FUSE WORKSHOP (Hamsi1235) and EMPTY ARCADE (Lufer413), retaining real floor, pickup range and LOS. Each fixture builds the actual lazy `buildDescent21` lift after relocation, refreshes native query bodies, recomputes `physicalReach21` against its added static walls, checks item/standing bounds and walks the final route. Hamsi1235 places the lift and valuable in the same bay; their final access still passes. Those initial maps, entrance poses and goldbar/cheap-item choices are labelled test setup. Their success is native access evidence, not blind exploration or a completed earned haul.

Paired actual `hostPopulateMoon` runs for seeds35,1235,17 and413 produced identical original spawn messages and direct native item entropy draws. Seeds35 and413 admitted one move;1235 and17 retained stock placement. Both populations build the actual final lift; offered fresh populations then recompute and walk the native route with all native small/big cargo present. The test also covers blocked bays, incompatible contexts, item exclusions, synchronous reentry, unchanged cheap alternatives, unchanged body/economy/custody and full native body cleanup, including the lift's three added colliders. Creature spawning is an inert fixture boundary in these paired population checks. Root owns the separate live Gauntlet, shared lifecycle suite and publication verification.

No human observation has established increased enjoyment or voluntary retry. The owner's1/10 baseline remains unchanged. A useful human follow-up is whether the sign and cargo make the detour understandable, whether the crew deliberately chooses it, and what makes it turn back.
