# Wave38 — native paid gear upgrades and supply choices

Worker scope: `armor38.js`, `perk38.js`, their focused regressions. Root integrates modules and owns shared catalogue changes. Native inventory, Forge metadata, shared credits and ItemManager remain the owners.

## Armor and weapon upgrades

Audit found real armor already equips through inventory, has tier-scaled protection, durability, native +1..+9 Forge enhancement and ascension. Three purchasable armor definitions were categorized as tools, hiding them from the actual Suits tab. `armor38.test.mjs` observed RED (`tools !== suits`) before root repaired the catalogue mapping.

The existing physical ship charger now offers a paid upgrade for a held weapon or armor, falling back to the worn armor. Guaranteed early +1/+2/+3 cost90/180/270 shared credits. Armor at+3 can buy common→uncommon(240) and uncommon→rare(480), increasing real worn protection through existing tier rules. Endgame Forge+4..+9 and weapon overclocks retain their shard economy. Every registered native weapon kind is eligible. Native item `plus/tier` fields, `fgit` replication and save serializers carry the result. Host validates live owner, current map receipt, real station eye range/LOS, item holder and old plus/tier before spending; a bounded nonce ledger and item revision reject duplicates.

Limits: this reuses an existing industrial charger model rather than adding another colliding bench; tier enchant is the existing native protection multiplier, not a invented armor elemental proc. Original Forge weapon elemental effects remain weapon-only. This module's +3 tier route does not claim to replace the whole Forge.

## Perk drinks and salvage cabinet

The existing coffee machine's free stamina prompt becomes two original paid button interactions: Rush35credits gives actual25-second native adrenaline speed/stamina behavior; Repair45credits restores30 actual native health. These are bounded consumable effects, not permanent passive skill unlocks. A successful host reply reaches only the buying player; duplicate replies do not extend/heal again. Health sends the native `pst` update. Master audio/user settings are untouched.

The existing ship cupboard is a salvage cabinet:120credits buys one physical native world weapon in front of it. Shared seeded RNG chooses finite pipe42/shovel30/machete18/sledge8/katana2 weights, filtered to currently registered available native weapons. Quota2+ raises the delivered item to uncommon. The saved native run ledger stores roll serial and256 accepted nonces, so host migration retains the random sequence and recent paid receipts. Unknown/dead/downed/distant/wall-blocked/stale-map requests mutate neither credits nor supplies. No new wallet and no raw random shared outcome.

## Current evidence

Focused `armor38 perk38 power38 forge_rules inventory_core`:5/5 pass. The final perk regression additionally passes actual paired Session peer→host request and host→peer reply, native health on the peer, host shared charge once, self replay, blocked cabinet, unaffordable/no-spawn, range rejection, teardown and deterministic random pool checks. Native armor test verifies all registered weapon eligibility and actual worn armor stats after paid enhancement/tier upgrade, plus broken armor remains zero protection. No dedicated browser/physical aim proof or Internet reliability claim was made by this worker; root owns combined full suite/build/browser acceptance.

RPG audit: host already calls `creatureBaseLevel(moon.tier,quotaIndex)` and actual creature spawn/serialization sends level as`lv`, so stronger destinations/quotas already scale native opponents. Additional encounter/UI tuning belongs to root; this worker adds no duplicate creature-level system.
