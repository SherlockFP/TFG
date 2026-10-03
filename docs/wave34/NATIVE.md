# Wave34 native early haul

2026-10-03. Production source frozen after the first focused GREEN. Root owns combined regression/build/browser/publication. This report covers native integration and source evidence; it does not establish fun, human discovery, Internet reliability or hardware performance. The owner's experience rating remains **1/10**.

## Result and integration

The first eligible quota0 ordinary surface factory visit can replace exactly one existing big valuable slot with existing Indexed Glass. Ordinary small loot remains available. A safe early branch is optional: if planning fails, stock population continues and a later fresh visit remains eligible. A consumed campaign receipt blocks replacement after removal, death, migration and surface return.

Owned changes:

- `src/game/earlyhaul34.js`: admission, bounded physical placement proof, one private proposal and one persistent receipt. No update/fixed-step/render hook, new HUD, economy, timer, hazard or runtime actor.
- `src/game/host.js`: only the existing big-value population seam. Compute normal count/shuffle/table as before; ask for one proposal; pass it only on the first stock spawn. The normal weighted type is still supplied to `hostSpawn`. Original `bigSpots` stays unchanged, including the later guaranteed deep prize selection.
- `src/entities/items.js`: only a narrow internal replacement after original tier/value/ID/yaw rolls and payload construction. Validate host, source/target same `big` kind, target `indexedglass27`, no holder/inventory, finite three-number position/yaw and exact privately owned proposal identity. Change only `ty`, `p`, `q`; preserve every economic/identity field. Native item broadcast, model/body, custody, impact and sale remain owners.
- `tools/harness/earlyhaul34.test.mjs`: one focused native file. Node/CSS/DOM fixtures support actual source modules; no browser fixture exports from this Node harness.

Root integration: import `installEarlyHaul34`, install as `game.earlyHaul34` **after `installSalvage27`** registers the real item/model, before normal population. The module does not require descent to exist at installation. API:

```js
installEarlyHaul34(game) => {
  populationOffer(bigSpots, bigN), // private frozen proposal or null
  consume(offer, id),              // called only by validated ItemManager seam
  plan(),                        // frozen nondestructive host diagnostic, or null
  stats(),                       // copied bounded planning counters and milliseconds
  dispose()
}
```

`plan()` returns `{type,p:[x,y,z],yaw,size:[x,y,z],approach:[feet],path:[[feet]...],doors:[native IDs],length,room,source:'mainEntrance'}`. This is an inspection surface, not a spawn/teleport/outcome API. Peer welcome does not need the private host plan; native run/item snapshots are authoritative.

## Admission, persistence and callback ordering

Admission requires host, `phase:'moon'`, `quotaIndex:0`, no existing truthy `run.earlyHaul34`, factory facility, matching actual world moon/seed, surface depth0, valid current descent token if present, ordinary native moon and no active Dead Letter/mission/escape/cycle instance. Old saves missing the additive receipt are eligible; any existing consumed receipt blocks further offers.

One private proposal is cached per actual run/map/seed/day visit. A failed visit is not replanned every population/frame. A fresh map/run/day may try again. `mapUnloaded`, session end/start and disposal clear private planning state; none removes a consumed run receipt. Disposal is idempotent and unregisters owned listeners.

`consume` installs a frozen small `{id,moon,seed,day}` receipt and closes the private proposal **before `broadcastRun(['earlyHaul34'])`**. That native `gs` self-delivers synchronously; the following native item `sp` also self-delivers. Reentry from either callback sees the consumed receipt. An item removed during its `sp` callback still consumes the campaign offer. No `rm`/respawn, extra ID, per-floor catalogue or new network type is introduced. Generic `hostSave`, welcome and descent/run lifecycle preserve the additive receipt.

## Physical proof and cost

The planner uses the registered model through `WorldItem.makeVisual`'s actual Box3 centering and size path. The off-scene probe creates no physics body, item ID or economy record. Its cloned geometry is disposed in `finally`; shared materials/model lease remain Salvage27-owned. Native measured glass bounds are approximately **0.7600 × 1.2125 × 0.3600 m**. Missing registration or invalid bounds rejects the offer.

Stock big positions on sampled factories are deep, so the planner inspects only native sub-cells within 24 m of the **main entrance**, at least6 m away. Sealed/arena/entry/vault/containment/core/generator rooms are excluded; ordinary early corridors can qualify. The native half-metre `NavGrid` preserves dynamic blocked edges. Narrow doors use their actual measured center; all resulting segments still pass native physics sweeps. At most18 candidate sites share one flood/clearance cache.

Proof includes actual STATIC floor rays, standing capsule clearance, registered glass cuboid casts at each route segment, conservative full-yaw cuboid envelope at every turn, sampled floor continuity, native structural edge constraints, strict current pickup LOS and actual unclipped placement. Other planned big positions are excluded from both site and route clearance. Locked/code/special doors are forbidden. Ordinary closed doors are explicitly recorded as native E-openable route steps; only their own tagged collider is ignored for that conditional route proof, while strict placement/pickup LOS retain actual door collision. The module never opens a door, simulates an extra frame or repairs a route by teleport/`noLos`.

Bounds:18 attempted sites,1024 expanded route nodes,12000 counted floor/shape/sweep/LOS probes,40 m route length, one planning pass per visit. Neighborhood enumeration is bounded to a97×97 half-metre window before candidate filtering. Native grid construction and one registered bounds probe occur only at that pass; there is no per-frame allocation/work.

Observed admission smoke from the final focused run:

| Native factory seed / size | Result | Route | Expanded nodes / probes | Planning time |
|---|---|---:|---:|---:|
|1235 / actual Hamsi0.8|Offered|12.91 m|435 /2879|20.65 ms|
|17 /0.8|Offered|14.29 m|456 /2981|10.50 ms|
|1 /0.8|Offered|11.29 m|390 /2585|16.96 ms|
|1235 / supplementary1.0|Offered|13.60 m|458 /3072|16.56 ms|

These are bounded desktop Node observations, not representative frame/hardware profiling or an exhaustive seed guarantee. The module deliberately falls back when access is unsafe.

## Native verification

Meaningful first RED used an imported capability stub returning no offer. The native original population still ran and asserted **0 instead of1** existing-slot replacement. It was not a missing-module failure. Earlier missing fixture `hostData` was corrected and excluded as behavior evidence. Retained output: `native-red.txt`.

Final command, bundled Node24.19:

```powershell
& 'C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/harness/earlyhaul34.test.mjs
```

**Exit0,13 PASS groups,3.55 s**, retained `native-green.txt`. They cover:

- Paired actual `hostPopulateMoon`/ItemManager/Session populations: exactly one type/pose replacement, identical item count, direct original spawn entropy draws, every native economic/identity field and later deep-prize payload. A source assertion confirms the original tier/value/ID/yaw calls precede replacement.
- Actual Hamsi generation0.8 seeds1235/17/1 and supplementary factory1.0; registered live item bounds equal the proven model size and plans remain within all limits.
- True synchronous native `gs`/`it sp` callbacks, reentry and immediate `rm`; no second receipt/offer on death, migration hooks or surface return.
- Actual `hostSave`/`loadRun`; actual `hostOnPlayerJoin` and paired Session delivery/serialization restore receipt and exactly one same-ID item. Promoted peer keeps admission closed. In-memory transport is a labelled delivery fixture, not an Internet test.
- Private proposal forgery, wrong kind, held/pocket spawn and stale world seed rejected without consuming admission.
- Real native locked entrance branch and actual STATIC wall rejection; stock fallback leaves receipt absent. Failed visit caches once; a fresh map lifecycle can try again.
- Off-scope phase/quota/depth/peer/context and idempotent disposal preserve stock.
- Actual `Game.onDoor`/`updateDoors`, host request and door collider removal, then native character-controller movement over the certified path with measured progress. Actual native pickup ray finds the offered glass, real GrabBeam ownership/physics moves it and real release returns host authority. Movement is through the controller; endpoints are not assigned to obtain traversal results.
- Setup-labelled moving glass and partner stance with true peer Session Cargo20 request: over0.5 s, native slide travel **0.8924 →0.1610 m**. Gravity, ownership, ID and fragile value stay native. Separate actual ownership, occupied hands and STATIC LOS obstruction negatives reject brace.
- Existing native Cargo13 load/unload keeps the offered ID, removes/restores its real body, rejects duplicate custody and unloads once. The setup-labelled trolley begins at the load site in this isolated custody check. Native inventory sizing/bag rejection confirms glass cannot be bagged.
- Global emitter error count unchanged; no swallowed callback failures.

Entropy replay is **comparison-only original direct `ItemManager.hostSpawn` value/ID/yaw entropy**, not gameplay outcome injection. Native Three UUID/model allocation calls use their normal raw entropy and inherently differ between old/new models and the off-scene probe. Therefore this report does **not** claim identical global `Math.random` draw counts or identical future random values under an externally fixed global entropy tape. The original direct economy calls, seeded population/table/deep-prize selection and tier stream execute unchanged; all original economic payloads match under the labelled spawn entropy comparison. Production introduces no global RNG interception or dummy model allocation. World placement uses its isolated native seeded RNG.

## Remaining evidence boundary

The physical beam supports indoor hauling alone. Cargo20 brake helps only an approaching **loose, unowned** glass; it does not grant simultaneous beam assistance or fragility immunity. Existing Cargo13 is required to move this big item through the facility portal because native player-only exit does not carry a beam-owned body. This feature does not alter that transport boundary.

This subagent did not run a full suite, browser, Git publication, human play or hardware profiling. Root owns final combined checks and actual Game entrance/haul/portal acceptance. The isolated native custody check does not prove the entire outdoor trolley journey or sale. Price/value/tier remain original native payloads; physical damage/cargo/unload/sale owners are unchanged. Root's final PLAYTEST/REVIEW should retain any observed obstruction/failure and keep guided input separate from human discovery/fun evidence.
