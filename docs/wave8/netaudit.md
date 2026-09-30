# Wave 8 multiplayer audit (static + 2-3 peer node sim)

Nothing here was tested with two real players. `tools/harness/netaudit_wave8.test.mjs` (128 checks, node only) does two things:
(A) scans `src/` for every `on_` / `msg:` listener / `H()` request handler / `broadcast` / `sendTo` / `request` per wave-8 type;
(B) runs real `Session` objects (host H, clients C, D) over an in-memory wire with stub games and drives downed, feedcams, landingq flows.
`node tools/harness/netaudit_wave8.test.mjs --table` prints the type list. `tools/harness/net_collisions.mjs` (older) still covers on_/H collisions: 0.

Session facts the audit relies on: `net.on_(type)` = ONE handler per type; if a type has an `on_` handler, `net.on('msg:type')` listeners NEVER fire
(session.js `receive`); HOST_ONLY types are dropped on the host and on a client unless `from === hostId`; `welcome` carries the whole `run`, so any
`run.*` field is late-join safe; `hostmig` re-runs `registerHandlers` on the new host and emits `mods 'hostMigrated' (game, info)`; host-side module
state (books, sims, timers) is NOT migrated unless the module rebuilds it.

## Table (type -> sender -> validated? -> late join? -> issues)

| type | sender | validated on receive / host? | late join | issues found (fixed = F) |
|---|---|---|---|---|
| `fcreq` (hit/zap/cut) | client | host: phase, camera state, 0.25 s rate, reach (5 m / 2.8 m box / 16 m) | `run.fc` in welcome | ok |
| `fcfx` | host | HOST_ONLY | plan rebuilt from seed, state from run.fc | F: `msg:sell` listener never fired (game.js `on_('sell')`), viewer-tax "sale" line was dead -> hook `onSellResult`. F: `fx` spray/tracer with NaN coords blinded/smashed cameras in reach. F: migration left run.fc timers on the old host clock (blind stayed ~15 min) -> re-based |
| `fc2req` / `fc2fx` | client / host | host: drone alive, 18 m reach / HOST_ONLY | `run.fc2` | F: drone timers re-based with the feedcams clock on migration |
| `dnreq` (down/hold/stop/kit) | client | host: enabled, not already down, rawPlayer alive, hold range 3.6 m, one reviver, kit range | none | F: joiner never saw open downs (no marker, could not revive) -> host replays `on`+`pg` on playerJoin. F: migration lost the DownBook (victim stuck "down" until orbit, nobody could revive) -> rebuilt from the mirrored `S.down`. Left: `kit` does not check the reviver really holds a kit (`consume` is separate) |
| `dn` | host | receiver checks `from` = self/host (not HOST_ONLY) | see above | ok (forged "up" from a peer ignored - tested) |
| `hg` (+ `run.hub`, `run.quick`) | host | was NOT HOST_ONLY | run fields in welcome | F: any peer could close everyone's Quick Shift end card -> HOST_ONLY. F: hub lock was UI only: host `hostCart` / `hostCoin` called `stockFor` without the lock, so a forged terminal BUY / cart bought rare+ stock while locked -> pass `g.hubgate.shopLock` |
| `rsreq` / `rsx` / `rsmsg` | client / host / host | host: home moon, 80 ms rate, reach per op, item holder; both host msgs HOST_ONLY | `run.rs` + 4 Hz snapshot | F: after migration `st()` read the NEW host's own `profile.resto` and `commit()` overwrote `run.rs` with it (crew diner wiped) -> adopt `run.rs` (`hostMigrated`). Left: `sim` (customers, cooks) restarts empty |
| `labreq` / `labfx` | client / host | host: phase, vine reach, elevator index/moving; HOST_ONLY | greenhouse `sync` op; tower had none | F: joiner saw the elevator at level 0 with wrong gates -> `sync` op now answers `estate` for the tower. Left: metro train / prison lock are transient (a joiner misses the one in flight); elevator call has no range check (grief only) |
| `w3fx` | host | receiver `fromHost` check | `run.br.th/lk` | ok |
| `rmap` (warn/go/set/alarm) | host | HOST_ONLY | `set` every 25 s only | F: joiner waited up to 25 s with shelves in the wrong step -> host sends `set` on playerJoin |
| `lm` / `lmq` (mg/sn/tt/cl) | host / client | host: moon, alive, creature type/state, distance, item holder, credits; HOST_ONLY | curses replayed on playerJoin | Left: `cursed` map is host-only (lost on migration) |
| `cd` | host | receiver checks `from` | none needed (cues) | Left: director state (`S.st`, queue) restarts on migration (rebuilt from creatures next landing) |
| `mmq` / `mm` (+ `run.mm`) | client / host | host: orbit phase, holds a Sector Map; `mm` was NOT HOST_ONLY | `run.mm` | F: any peer could print arbitrary text into every terminal / chat -> HOST_ONLY |
| `fjreq` / `fjfx` / `fjd` (+ `run.fj`) | client / host | host: phase, `near()` 5 m, item holder; HOST_ONLY | `run.fj`; drone stream 0.3 s | Left: `mem.ids` (job -> item id) and the drone sim are host-only; vault code is inside `run.fj` (visible to clients by design) |
| `mnhit` / `mnput` / `mnsync` / `mnd` | client / host | host: seed, eye reach, rate, held tool, placement rules; HOST_ONLY | full edit log via `mnsync` | ok (edit log is mirrored on every peer, migration-safe) |
| `ac2req` / `ac2s` | client / host | host: `K.submit` (game id, score cap, min play time, daily prize cap); receiver checks `from` | boards on playerJoin | Left: boards live in the host's profile (new host = fresh boards) |
| `rvpk` | host | HOST_ONLY | n/a (cosmetic) | ok |
| `arreq` sit/stand/... | client | host: `near()`, `A.sit` seat checks, peerLeave stands the seat up | snapshot on playerJoin | Left: tables are host-only (lost on migration) |
| `itst` / `charge` (nvgear) | client / client->host | `itst` relayed, applied as sent (pre-existing); `charge`: holder + mul clamped 1..3 | item snapshot | Left: `charge` has no range check (recharge anywhere), `itst` trusts the sender for any item id |
| landingq | local | n/a | joiner builds `instant` (synchronous, same job order); host's queue is flushed by `hostFinishLanding` (hostmig schedules it) | ok (tested: order, flush, throwing job) |

## Not covered / for a real 2-player session
- WebRTC only: message ordering across `_b` batches, relay through the host when two clients have no direct link (`relayTypes`: none of the wave-8 types is client->client), congestion drops.
- Timing: `game.time` is per-peer; every wave-8 module that stores timestamps in `run.*` must be re-based on migration (feedcams/feedcams2 done, others do not store any).
- Real hostmig end to end (`hostmig.js` election + dialog) with downed / feedcams / resto live; this test only calls `migrateTo` + the `hostMigrated` event.
- Two people revive / cut / dig in the same second, joining during a landing with the real 9 s descent, host quitting during `landing` (hostmig `later(hostFinishLanding)`).
- Left as listed in the table: host-only state that is still lost on migration (resto sim, lcmonsters curses, crdirector, facjobs drone, chess tables, arcade boards).
