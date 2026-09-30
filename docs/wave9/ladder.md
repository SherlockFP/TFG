# Ladder forward + gifts (W9 task 6)

What: the unlock ladder now opens earlier and every unlock hands over one wardrobe piece.
- Ladder (src/game/onboard_core.js UNLOCKS): store + skill tree at the FIRST SALE (run.sold > 0 at the Company desk, or quota 1), arcade + pets q1, homeworld + farming + restaurant q2, forge + zones q3, voyage + season q4, gates after the first boss. Was q1/q2/q3/q4/q5.
- Progress: `progressOf` returns `{ q, boss, sale }`; `fold` persists `unlocks.sale` in the profile; Quick Shift never sets it. `hubOf/hubOpen/sameHub` carry `sale` so joiners follow the host's run.hub.
- Gifts (K.GIFTS, one per id, all real cosmetics.js entries): shop hat:beanie, tree hat:wizard, arcade face:shades, pets back:plushie, homeworld suit:construction, farming hat:bucket, restaurant face:moustache, forge hat:headlamp, zones suit:soviet, voyage back:antenna, season suit:tracksuit, gates face:gasmask. `announceGift` (onboard.js) grants it into the wardrobe of the local profile and passes "Gift: X (wardrobe)" to the existing unlock card (`hubgate.card(id, extra)`; toast fallback appends it).
- Hub panel: already lists opened systems plus only the next step (same requirement group); the sale rung uses its own key. Locked texts: `locked_sale`, `locked_term_sale`, `hg.lock_sale`, door hint "Opens after your first sale" (EN/TR/RU).
- Tests: tools/harness/onboard.test.mjs (first sale opens the store on a fresh profile, gift lands in profile.cosmetics, every id has a real gift) and hubgate.test.mjs updated to the new ladder.
Knobs: UNLOCKS rows, GIFTS table.
Gaps: gifts are cosmetics only (no coupon/seed items); no browser run.
