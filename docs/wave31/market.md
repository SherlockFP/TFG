# Wave31 — Phish Dayı purchase repair

Published starting source: `2e50c8b588343769fbc9e10cfada24be62bba189`.
Scope: `UI.openMarket`, `src/game/market31.js`, one focused native harness.
Root installs/disposes the service in Game's existing network lifecycle.

The original real UI buy callback checked the follower milestone, pushed an
ownership ID/loadout and saved locally. It neither requested host approval nor
debited the wallet. Weapons only reached the world through the later respawn
loadout path. The initial regression reproduced `3000 !== 2880` after buying
the 120-price shovel; the original callback had already played purchase audio.

The owner's explicit money-spending request takes precedence over the old
follower-claim behavior for this market. Its existing `MARKET.coin` prices debit
the existing `profile.coins` field; no currency conversion or parallel wallet is
introduced. Other follower milestone systems retain their existing behavior.
The market shows money and the actual buy price. It waits for an authenticated
host receipt before its success message/audio or local profile changes.

The host validates native Company phase, live player, real stall range/LOS,
catalogue ID, level, existing ownership, funds and native held capacity. Weapons
spawn as ordinary held soulbound ItemManager items, using a validated bag spot
when the hotbar is full. Failed delivery removes the partial item and charges
nothing. Armor/perks grant their existing owned/loadout slots; cosmetics grant
their existing collection and explain where to wear them.

Double clicks share one pending order. Crypto request epochs distinguish new
installers; receipts correlate ID/nonce/run, and replay cannot debit or deliver
again. The bounded serializable approval ledger lives in the native run and
survives its save/migration snapshots. The native saved profile remembers only
the applied run/spend receipt watermark. A missing receipt can be reconciled
against the saved run, applying the missing relative debit and ownership once.
Old-run state/requests are ignored; a new run gets its own ledger.

Independent review exposed a native self-broadcast reentrancy gap: replaying
the same request inside the real item-spawn callback produced an early "owned"
failure before the original success was committed. The buyer then had a held
weapon without the approved wallet/ownership receipt. The harness reproduced
the failure through actual Session receive and ItemManager callbacks before the
fix. A per-profile transaction guard now suppresses nested requests until the
original receipt is committed, and `finally` releases the guard on every exit.
The same native callback replay now receives one successful debit/ownership and
one physical item.

A second independent review found that saving the host ledger alone left a
successor's replicated run behind until the generic run-sync tick. The harness
reproduced a missing successor ledger immediately after the purchase receipt.
Approval now publishes `market31` through native `broadcastRun` and flushes the
existing Session queue before sending the receipt. The native GS callback
asserts ledger delivery before the receipt, then promotes the peer with a fresh
market installer and accepts its next purchase. When historical ledger data is
absent, initialization trusts the saved profile's acknowledged spend watermark
under the same peer-owned profile boundary; it preserves current money and
ownership and fabricates neither funds nor unknown approvals.

Final review added an explicit native delivery-failure fault: the host's real
item callback removes a newly spawned weapon locally after its spawn was queued
for the peer. The first regression left one remote weapon (`1 !== 0`) despite
the rejected purchase. Rollback now always broadcasts removal for the returned
item ID, even when the local object is already gone. The same fault leaves no
remote item, debit or ownership grant. This is failure-contract integration,
not an observed natural gameplay failure.

Connection loss before sending returns a clear rejection. Loss after sending
keeps the uncertain order pending, tells the player it is waiting, and retries
the same order on resume or once after ten seconds. It never reports that a
possibly committed payment failed. Session disposal settles pending UI work
with an explicit missing-receipt message. An approved saved order can recover
on the next installer.

Personal rewards remain peer-owned in native Progress. The host trusts the
initial saved profile and subsequent reported earned growth only when the
snapshot acknowledges every approved debit. Stale pre-debit snapshots cannot
refill money or overwrite ownership. Relative debits preserve rewards earned
while a receipt is in flight. This is not a new central authority for all reward
earning or an anti-cheat claim; a peer can still lie about its own earned growth.

`NATIVE_INTEGRATION`: bundled Node24.19.0 ran
`tools/harness/market31.test.mjs` successfully. The actual UI callback, real
Session local/direct/batched delivery, ItemManager and Rapier run together.
Assertions cover host/peer wallet and held soulbound delivery, armor/perk/cosmetic
delivery, double click/replay, funds/level/range/native LOS wall/full-hotbar
rejections, pending reward preservation, new earnings becoming spendable,
lost acknowledgment/resume, forged sender, stale snapshot, saved-run installer
replacement, a new run and delayed prior-run state. The full-capacity fixture
has no optional bag module, so successful bag fallback is source/native API
integration rather than a separately exercised bag-grid scenario.

The first harness Rapier failure came from a test-only `window` object lacking
browser crypto. Matching the established `window = globalThis` fixture fixed
it; no game physics change or error suppression was used. No browser, blind
human enjoyment, Internet transport or hardware performance evidence is claimed
by this module report. Root owns combined checks and publication.
