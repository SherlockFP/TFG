# Wave31 commerce audit

Audited the field broker, commissioned production, calibration/packing, equipment
cart and physical pickup tray against source at `2e50c8b588343769fbc9e10cfada24be62bba189`.
Root corrected the initial older Git HEAD to the matching `origin/main`; this
agent made no Git mutations or browser runs. Files changed: `industry13.js`, its
two new EN/TR/RU rejection messages, the cart trade-in preflight in `shop.js`,
one public commission fixture ID in `workshop17.test.mjs`, and one focused
`commerce31.test.mjs`. Root owns terminal BUY ID forwarding and protocol update.

Two failures were reproduced before production edits:

- Receiving the same peer commission request twice deducted 24 credits from 300
  (276 remaining), rather than charging one 12-credit batch (288 remaining).
  Equipment carts already had a request receipt; broker production did not.
- A cart with two Nail Bat trade-in lines selected the same held Baseball Bat
  during both preflight passes. It removed one bat, delivered two Nail Bats, and
  charged two 60-credit upgrade prices (180 remaining from 300), rather than one
  upgrade price plus the ordinary 120-credit price (120 remaining).

Independent review then exposed another existing cart gap: real Session `gs`
self-delivery can synchronously request the same cart before its success reply
records a receipt. A new red regression reproduced 300→270 with two Flashlights,
rather than one 15-credit purchase (285 remaining). Additional red controls
confirmed that a missing ID was accepted and an old sale became payable again
after 65 other receipts evicted it from the former 64-entry list. Initial review
and its subsequent passing rerun are separate evidence.

Broker actions now attach an order ID, record successful transactions in the
existing bounded `industry13.orders15` receipt list before publishing the run,
and echo the ID in their reply. A transport replay cannot commission another
batch or sell another owned batch. Failed requests remain retryable after funds
or bay availability change. The client ignores replies belonging to an older
order, so they cannot release a newer pending action. The native synchronous
host request can clear its already-installed timeout immediately. Cart preflight
now reserves a held trade-in item once per cart; another line without a second
eligible held item uses its ordinary price. Existing item delivery and custody
remain authoritative.

Cart execution now reserves an in-flight ID before calling its existing native
transaction and releases the reservation in `finally`. Success records the ID
once and converts that reservation into its persistent receipt before publishing
the receipt. Missing, malformed, empty and overlong IDs fail before mutation.
Successful commerce receipts remain for the native run; history is limited to
4096 entries by rejecting further orders with a localized instruction to start
a new run. A reserved last slot also rejects a different reentrant request,
so the bound cannot be exceeded through synchronous callbacks. Industry and cart
receipt keys use distinct namespaces.

Fresh verification on Windows, Node `v26.7.0`:

```text
npm test -- -j 2 commerce31 industry13 workshop14 workshop17 boombot22_shop econ9 wallet
7/7 passed in 1s
git -c core.autocrlf=false diff --check -- src/game/industry13.js src/game/shop.js tools/harness/commerce31.test.mjs
exit 0
```

The new file has ten passing native scenarios: broker commission/sale replay
(including reentrant Session self-delivery and a serialized/restored ledger),
insufficient funds/retry/full bays, equipment funds/full tray/replay/native daily
stock/disconnected actor, workshop operator disconnect retaining the paid batch,
actual broker action/reply correlation, single-use trade-in discount, cart
self-delivery replay, invalid IDs/full history, retained replay after 65 other
receipts, and last-history-slot reservation under reentrant admission.
Existing workshop17 checks cover both calibration patterns, miss/cancel/stale
tokens, operator exclusivity and phase cleanup; workshop14 retains real Rapier
tray/ray and physical packing coverage. The new replay scenario completes the
real host pressure challenge and packing route with one controlled native clock.

Evidence is `NATIVE_INTEGRATION`: real Session request/receive/sendTo/broadcast
callbacks, installed commerce/workshop modules, ItemManager and Rapier. DOM,
network transport, actor positions, campaign shift setup, starting money and a
second already-owned sale batch are explicit fixtures. The test unjoined
transport supplies peer membership and records packets; no Internet reliability,
human discovery, natural calibration difficulty, hardware FPS or rendered UI
quality is established. An initial fixture run logged missing heldItem and
creature-host structures; those fixtures were repaired and the final focused
run has no caught event/mod errors. Node26 emits its experimental localStorage
warning; the prescribed cloud Node22 environment is not this Windows runtime.

Compatibility limits remain explicit: old request payloads without order IDs are
rejected; root updates the protocol and terminal text BUY flow to the modern
identified contract. Saved successful equipment receipt keys retain their old
identity, and the same native run carries its successful receipts through save
and migration snapshots. A fresh user retry after a timeout receives a new ID;
inspect existing goods/deliveries before ordering again. Root owns the combined
full regression, build, review and publication.
