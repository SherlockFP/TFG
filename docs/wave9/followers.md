# Wave 9 - Clout becomes FOLLOWERS (owner decision)

**What.** The second currency is gone. `Followers` (glyph ◈; EN Followers / TR Takipçi / RU Подписчики) is the channel's size: a number that only grows and is never spent.
Credits stay the only money. Everything that used to cost Clout is now a **milestone unlock at `unlockAt(oldPrice)` followers** (`FOLLOWER_MULT = 2`, `src/game/wallet.js`).

**Save compatibility.** The persisted field is still `profile.coins` (it IS the follower count); `followersFromSave` (`src/core/save.js`) takes the max of `coins` / `followers` / `clout`, never negative. Nobody loses a value. Already-owned cosmetics, gear and pets stay owned.

**No spend path.** `Progress.spendCoins` is deleted; `addCoins` ignores non-positive amounts; `canClaim(price)` / `claimable(followers, price)` only compare. Converted sinks:

| Old Clout sink | Now |
|---|---|
| Wardrobe suits (cosmetics.js, wardrobe.js), cosm5 rotation offers | CLAIM at N followers, progress bar + "Unlocks at N followers", nothing deducted |
| Black Market (Phish Dayı, ui.js openMarket) | same claim button |
| Company Store Clout-only stock (shotgun, stacked deck) | locked until N followers, then sold for credits (`CLOUT_CREDIT_RATE` 0.4); the host checks with its own followers; `coinbuy` / `buyCoin` / refund path removed |
| Pets: adoption + skins (pets_core.js) | unlock at N followers, free |
| Passive tree refund / respec / role switch (rpgctl.js) | free |
| Trade panel Clout field (`trade_core` `RULES.maxClout = 0`) | items only; a stray Clout offer clamps to 0, the host never asks for a debit |
| RPS wagers (arcade_rps_ui.js) | winner gains followers, loser loses nothing |
| Slots (actions.js) and the Lethal Casino mod (public/mods/lethal-casino.js) | session CHIPS, not followers |

**Sources (unchanged):** on-air moments, showcases, highlights, clean shifts, quota, arcade, dance, achievements, daily, algo2 stream pay.

**UI.** Day report (rewardviz): the income row is "Followers +N" (every positive `addCoins` of the day, whatever the source), then "Viewers today: V -> +N followers" and "Channel: T followers" (V = LIVE peak from `tfg:viewers`, so the per-day viewers stay a separate live number from the permanent count). Hold-Tab card (hudcalm): Followers + Next milestone. Character panel: count + next-milestone bar (`src/game/followers.js`, `followerCard`). HUD wallet row unchanged (◈ = followers).

**Knobs.** `FOLLOWER_MULT` (wallet.js), `CLOUT_CREDIT_RATE` (shop.js), `FOLLOWER_LADDER` (generic milestones).

**Test.** `node tools/harness/followers.test.mjs` (migration, milestone maths, no-spend static scan of src + public/mods). Updated: wallet, cosm5, pets, trade, wave1_tree, roledays.

**Known gaps.** Client-side store display uses the local follower count, the host enforces with the host's (a joiner may see a card unlocked that the host refuses). The store keeps the `cloutOpenOf` hub gate (follower stock appears after quota 1). Internal ids (`clout` currency id, `profile.coins`, `co.clout`, homeworld store key, CSS `trd-clout`) keep the old name on purpose. TR/RU grammar of the mechanical rename is approximate (no Russian case endings). No browser run.
