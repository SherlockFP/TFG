// node tools/harness/followers.test.mjs - wave 9 Clout -> FOLLOWERS: save migration + "no spend path" + milestone maths (no browser)
import { fileURLToPath } from 'node:url';   // .pathname gives /D:/... on Windows
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { followersFromSave } from '../../src/core/save.js';
import { unlockAt, claimable, nextMilestone, followersOf, CURRENCIES } from '../../src/game/wallet.js';
import { followerUnlocks, followerCard } from '../../src/game/followers.js';
import { buyOffer, offersFor } from '../../src/game/cosm5.js';
import { buyPet, buySkin, newPetsState } from '../../src/game/pets_core.js';
import { t, tf, setLang } from '../../src/core/i18n.js';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

// 1. migration: the old Clout balance is the follower count, whatever it was called; never lost, never negative
ok(followersFromSave({ coins: 120 }) === 120, 'coins (old Clout) -> followers');
ok(followersFromSave({ clout: 50 }) === 50 && followersFromSave({ coins: 5, followers: 9 }) === 9, 'legacy names: the largest wins');
ok(followersFromSave({}, { coins: 0 }) === 0 && followersFromSave({ coins: -40 }) === 0 && followersFromSave({ coins: NaN }, { coins: 7 }) === 7, 'empty / negative / corrupt');

// 2. milestone maths
ok(unlockAt(100) === 200 && claimable(199, 100) === false && claimable(200, 100) === true, 'unlock threshold is a multiple of the old price');
const m = nextMilestone(120, [{ at: 300, name: 'Machete' }]);
ok(m.at === 250 && m.prev === 100 && m.pct > 0 && m.pct < 1, 'ladder milestone closer than the named unlock');
ok(nextMilestone(280, [{ at: 300, name: 'Machete' }]).name === 'Machete', 'named unlock is next when it is closest');
ok(nextMilestone(1e9) === null, 'past the ladder: null');
ok(followersOf({ profile: { coins: 77.9 } }) === 77 && CURRENCIES.clout.name === 'Followers' && CURRENCIES.clout.spendable === false, 'wallet: followers, not spendable');
ok(followerCard({ coins: 10, owned: [] }).next.at === 50 && followerUnlocks({ owned: ['shovel'] }).every((u) => u.name !== 'Lead Pipe' && u.at > 0), 'card + unlock list');

// 3. Milestone claims/adoptions never subtract. Wave31's explicitly requested
// host-confirmed market is the sole exception; market31.test covers its payment.
const q = { level: 30, coins: 1e6, cosm5: null, cosmetics: { suits: [], hats: [] }, stats: {}, emotes: [] };
const day = 20123, o = offersFor(q, day).offers[0];
const r = buyOffer(q, o.key, { day });
ok(r.ok && q.coins === 1e6, 'cosmetic offer claim leaves followers untouched');
const poor = { ...q, coins: 1, cosm5: null }; const pr = buyOffer(poor, offersFor(poor, day).offers[1].key, { day });
ok(!pr.ok && /^Unlocks at \d+ followers$/.test(pr.why) && poor.coins === 1, 'below the milestone: refused, nothing changes');
const prof = { coins: 5000, achievements: {} }, st = newPetsState();
ok(buyPet({ state: st, profile: prof }, 'cat').ok && prof.coins === 5000, 'pet adoption leaves followers untouched');
ok(buySkin({ state: st, profile: prof }, 'h', 'party').ok !== undefined && prof.coins === 5000, 'pet skin leaves followers untouched');
const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.(js|mjs)$/.test(f.name)) out.push(p); } return out; };
const src = walk(fileURLToPath(new URL('../../src/', import.meta.url))).concat(walk(fileURLToPath(new URL('../../public/mods/', import.meta.url))));
const paidMarket = fileURLToPath(new URL('../../src/game/market31.js', import.meta.url));
for (const f of src) {
  const s = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/spendCoins/.test(s), 'no spendCoins anywhere: ' + path.basename(f));
  if (f !== paidMarket) ok(!/\.coins\s*-=|\.coins\s*=\s*[\w.]*coins\s*-/.test(s), 'no coins decrement outside approved market: ' + path.basename(f));
}

// 4. EN / TR / RU strings of the milestone UI
for (const lang of ['tr', 'ru']) {
  setLang(lang);
  for (const k of ['Unlocks at {n} followers', 'Followers', 'Claim', 'Next milestone', 'Channel: {n} followers', 'Viewers today: {v} -> +{n} followers', '+{n} followers']) ok(t(k) !== k, `${lang} translation: ${k}`);
  ok(!/Clout/.test(tf('Unlocks at {n} followers', { n: 5 })), 'no Clout in ' + lang);
}
setLang('en');
console.log(bad ? `followers.test FAILED (${bad})` : 'followers.test: OK');
process.exit(bad ? 1 : 0);
