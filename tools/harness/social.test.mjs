// Node test for the SOCIAL HUB pure logic (no browser, no network):  node tools/harness/social.test.mjs
// Presence expiry, DM / invite rate limits, text sanitising, beacon + message validation, friends, history.
import {
  HUB, HUB_ROOM, cleanText, cleanLobbyCode, validateBeacon, validateDm, validateInvite, RateLimiter, PresenceTable,
  addFriend, removeFriend, isFriend, sanitizeFriends, sanitizeBlocked, pushHistory, sanitizeHistory, resolveTarget,
} from '../../src/net/hub_core.js';
import { hubTexts } from '../../src/net/hub_i18n.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

const AV = 'p0' + '0123456789abcdef'.repeat(16);
const beacon = (o = {}) => ({ id: 'abcDEF1234', n: 'Hasan', av: AV, st: 'menu', v: '0.10.0', lv: 7, ...o });

// ---- room + constants
ok(HUB_ROOM === 'tfg-hub-v1', 'room id');
ok(HUB.STALE_MS === 3 * HUB.BEACON_MS, 'stale after 3 beacon periods');

// ---- text sanitising
ok(cleanText('  hello   world  ') === 'hello world', 'collapse spaces');
ok(cleanText('a\nb\r\nc\td') === 'a b c d', 'newlines -> spaces');
ok(cleanText('x\u0000y​z‮q') === 'xyzq', 'control, zero-width, bidi override removed');
ok(cleanText('<img src=x onerror=alert(1)>') === '<img src=x onerror=alert(1)>', 'markup is kept as plain text (UI uses textContent)');
ok(cleanText('a'.repeat(500)).length === HUB.DM_MAX, 'length limit');
ok(cleanText('a'.repeat(239) + '😀').length <= HUB.DM_MAX && !/[\ud800-\udbff]$/.test(cleanText('a'.repeat(239) + '😀')), 'no broken surrogate at the cut');
ok(cleanText(42) === '' && cleanText(null) === '' && cleanText({}) === '', 'non-strings -> empty');
ok(cleanText('   \n\t ') === '', 'whitespace only -> empty');
ok(cleanText('abcdef', 3) === 'abc', 'custom max');
ok(cleanLobbyCode('ab12cd') === 'AB12CD' && cleanLobbyCode('a') === '' && cleanLobbyCode('AB CD') === '' && cleanLobbyCode('<script>') === '', 'lobby code');

// ---- validation
const b = validateBeacon(beacon());
ok(b && b.id === 'abcDEF1234' && b.n === 'Hasan' && b.st === 'menu' && b.av === AV && b.lv === 7, 'beacon ok');
ok(validateBeacon(null) === null && validateBeacon('x') === null, 'beacon garbage');
ok(validateBeacon(beacon({ id: '<b>' })) === null, 'beacon bad id');
ok(validateBeacon(beacon({ n: 'x' })) === null && validateBeacon(beacon({ n: '<>' })) === null, 'beacon bad nick');
ok(validateBeacon(beacon({ st: 'hax' })).st === 'menu', 'unknown status -> menu');
ok(validateBeacon(beacon({ av: 'nope' })).av === '', 'bad avatar dropped');
ok(validateBeacon(beacon({ n: 'Ha<script>san' })).n === 'Hascriptsan', 'nick markup stripped by cleanName');
const bl = validateBeacon(beacon({ st: 'lobby', lb: { c: 'abc123', n: 'My crew', p: 2, m: 4, k: 1, s: 'mqtt' } }));
ok(bl.lb && bl.lb.c === 'ABC123' && bl.lb.p === 2 && bl.lb.m === 4 && bl.lb.k === 1 && bl.lb.s === 'mqtt', 'beacon lobby');
ok(validateBeacon(beacon({ lb: { c: '!!', n: 'x' } })).lb === undefined, 'beacon bad lobby code dropped');
ok(validateBeacon(beacon({ lb: { c: 'ABCD', n: 'x', s: 'evil' } })).lb.s === 'nostr', 'unknown strategy -> nostr');
ok(validateBeacon(beacon({ lb: { c: 'ABCD', n: 'n'.repeat(100), p: 9999, m: -5 } })).lb.n.length === HUB.LOBBY_NAME_MAX, 'lobby name cap');
ok(validateBeacon(beacon({ lb: { c: 'ABCD', p: 9999, m: 0 } })).lb.p === 64, 'lobby player clamp');
ok(validateDm({ x: '  hi  ', id: 'abcDEF1234', n: 'Hasan' }).text === 'hi', 'dm ok');
ok(validateDm({ x: '' }) === null && validateDm({}) === null && validateDm(null) === null && validateDm({ x: 5 }) === null, 'dm garbage');
ok(validateDm({ x: 'y'.repeat(999) }).text.length === HUB.DM_MAX, 'dm length');
const inv = validateInvite({ c: 'zz99', ln: 'Room', k: 1, s: 'torrent', id: 'abcDEF1234', n: 'Can' });
ok(inv && inv.code === 'ZZ99' && inv.lock === 1 && inv.strat === 'torrent' && inv.name === 'Room', 'invite ok');
ok(validateInvite({ c: '' }) === null && validateInvite({}) === null && validateInvite({ c: '../../x' }) === null, 'invite garbage');
ok(!('pw' in validateInvite({ c: 'ABCD', pw: 'secret' })) && !('password' in validateInvite({ c: 'ABCD', password: 'secret' })), 'invite never carries a password');

// ---- rate limiter (DM)
{
  const rl = new RateLimiter(HUB.DM_OUT[0], HUB.DM_OUT[1]);
  let t0 = 1000, allowed = 0;
  for (let i = 0; i < 10; i++) if (rl.allow('me', t0 + i * 10)) allowed++;
  ok(allowed === HUB.DM_OUT[0], 'burst capped at ' + HUB.DM_OUT[0] + ' -> ' + allowed);
  ok(rl.wait('me', t0 + 100) > 0 && rl.wait('me', t0 + 100) <= HUB.DM_OUT[1], 'wait time reported');
  ok(!rl.allow('me', t0 + HUB.DM_OUT[1] - 1), 'still blocked just before the window ends');
  ok(rl.allow('me', t0 + 10 + HUB.DM_OUT[1] + 1), 'allowed again after the window');
  ok(rl.allow('other', t0), 'keys are independent');
  const rl2 = new RateLimiter(1, 1000, 5);
  for (let i = 0; i < 50; i++) rl2.allow('k' + i, 0);
  ok(rl2.hits.size <= 5, 'limiter memory is bounded');
  rl.forget('me');
  ok(rl.allow('me', t0 + 200), 'forget resets a key');
  const inb = new RateLimiter(HUB.DM_IN[0], HUB.DM_IN[1]);
  let got = 0;
  for (let i = 0; i < 40; i++) if (inb.allow('peerA', i * 50)) got++;
  ok(got === HUB.DM_IN[0], 'inbound flood from one peer capped -> ' + got);
}

// ---- presence expiry
{
  const P = new PresenceTable();
  ok(P.upsert('p1', beacon(), 0) === 'new', 'first beacon is new');
  ok(P.upsert('p2', beacon({ id: 'zzzz9999', n: 'Ayse', st: 'lobby', lb: { c: 'ROOM12', n: 'Ayse crew', p: 3, m: 4 } }), 0) === 'new', 'second peer');
  ok(P.upsert('p3', { id: 'x' }, 0) === null, 'invalid beacon rejected');
  ok(P.list(1000).length === 2, 'two listed');
  ok(P.lobbies(1000).length === 1 && P.lobbies(1000)[0].lb.c === 'ROOM12', 'lobby list');
  ok(P.upsert('p1', beacon(), 100) === 'same-ignored', 'flood-dropped beacon');
  ok(P.upsert('p1', beacon({ st: 'run' }), HUB.MIN_BEACON_GAP + 1) === 'update' && P.get('p1').st === 'run', 'update after the gap');
  // p2 last seen at 0; p1 refreshed at 2501
  ok(P.list(HUB.STALE_MS).length === 2, 'not stale exactly at the limit');
  ok(P.list(HUB.STALE_MS + 1).map((e) => e.peerId).join() === 'p1', 'p2 hidden once stale (list filters even before prune)');
  const gone = P.prune(HUB.STALE_MS + 1);
  ok(gone.join() === 'p2' && P.size === 1, 'prune removes stale peers');
  ok(P.prune(HUB.MIN_BEACON_GAP + 1 + HUB.STALE_MS + 1).join() === 'p1' && P.size === 0, 'everyone eventually expires');
  ok(P.upsert('p1', beacon(), 100000) === 'new', 'a returning peer is new again');
  P.remove('p1');
  ok(P.size === 0, 'explicit remove (sobye)');
  const small = new PresenceTable({ maxPeers: 3 });
  for (let i = 0; i < 6; i++) small.upsert('q' + i, beacon({ id: 'id' + 'abcd' + i, n: 'Nick' + 'abcdef'[i] }), i * 10);
  ok(small.size === 3 && !small.get('q0') && small.get('q5'), 'table cap evicts the oldest');
  ok(new PresenceTable().upsert(5, beacon(), 0) === null, 'non-string peer id rejected');
  const dup = new PresenceTable();
  dup.upsert('a', beacon(), 0); dup.upsert('b', beacon(), 0);
  ok(dup.byStableId('abcDEF1234', 1).length === 2, 'same stable id on two peers -> both kept (no identity proof)');
}

// ---- friends / blocks / history
{
  let r = addFriend([], 'abcDEF1234', 'Hasan', 5);
  ok(r.ok && r.list.length === 1 && r.list[0].nick === 'Hasan', 'add friend');
  const r2 = addFriend(r.list, 'abcDEF1234', 'HasanNew', 6);
  ok(r2.ok && r2.existed && r2.list.length === 1 && r2.list[0].nick === 'HasanNew', 'friend nick refreshed, no duplicate');
  ok(!addFriend([], '<x>', 'Bob').ok && !addFriend([], 'abcd1234', '').ok, 'bad friend rejected');
  let big = [];
  for (let i = 0; i < HUB.FRIENDS_MAX; i++) big = addFriend(big, 'friend' + String(i).padStart(4, '0'), 'Nick' + (i % 9), 0).list;
  ok(big.length === HUB.FRIENDS_MAX && addFriend(big, 'extra9999', 'Extra').reason === 'full', 'friend cap');
  ok(isFriend(r.list, 'abcDEF1234') && !isFriend(r.list, 'nope1234') && !isFriend(null, 'x'), 'isFriend');
  ok(removeFriend(r.list, 'abcDEF1234').length === 0 && removeFriend(undefined, 'x').length === 0, 'remove friend');
  const dirty = sanitizeFriends([{ id: 'abcd1234', nick: 'Ok' }, { id: 'abcd1234', nick: 'Dup' }, { id: '!', nick: 'Bad' }, null, 5, { id: 'zzzz1234', nick: '' }]);
  ok(dirty.length === 1 && dirty[0].nick === 'Ok', 'sanitizeFriends');
  ok(sanitizeFriends('x').length === 0, 'sanitizeFriends non-array');
  ok(sanitizeBlocked(['abcd1234', 'abcd1234', '!!', 5]).join() === 'abcd1234', 'sanitizeBlocked');
  let h = [];
  for (let i = 0; i < 80; i++) h = pushHistory(h, { d: i % 2 ? 'out' : 'in', x: 'm' + i, t: i });
  ok(h.length === HUB.HISTORY_MAX && h[0].x === 'm30' && h[h.length - 1].x === 'm79', 'history keeps the last 50');
  ok(pushHistory([], { d: 'weird', x: 'a​b' })[0].d === 'in' && pushHistory([], { x: 'a​b' })[0].x === 'ab', 'history entries sanitised');
  const blob = sanitizeHistory({ abcd1234: [{ x: 'hi', d: 'in', t: 1 }, { x: 5 }, null], stranger9: [{ x: 'no' }], bad: 'x' }, [{ id: 'abcd1234', nick: 'A' }]);
  ok(Object.keys(blob).join() === 'abcd1234' && blob.abcd1234.length === 1, 'stored history only for friends, garbage dropped');
  ok(Object.keys(sanitizeHistory('junk', [])).length === 0 && Object.keys(sanitizeHistory([], [])).length === 0, 'history junk blob');
}

// ---- /w target resolution
{
  const rows = [{ id: 'a1', n: 'Hasan' }, { id: 'b2', n: 'Ayse Nur' }, { id: 'c3', n: 'Ayse' }, { id: 'd4', n: 'Can' }];
  ok(resolveTarget(rows, ['Hasan', 'hi', 'there']).text === 'hi there', 'exact nick + text');
  ok(resolveTarget(rows, ['ayse', 'nur', 'hello']).row.id === 'b2' && resolveTarget(rows, ['ayse', 'nur', 'hello']).text === 'hello', 'nick with a space, longest match first');
  ok(resolveTarget(rows, ['Ayse', 'yo']).row.id === 'c3', 'exact beats prefix');
  ok(resolveTarget(rows, ['ca', 'yo']).row.id === 'd4' && resolveTarget(rows, ['ha', 'x']).row.id === 'a1', 'unique prefix');
  ok(resolveTarget(rows, ['Ay', 'yo']) === null, 'ambiguous prefix -> null');
  ok(resolveTarget(rows, ['zzz']) === null && resolveTarget(rows, []) === null && resolveTarget(null, ['a']) === null, 'no match');
  ok(resolveTarget(rows, ['Can']).text === '', 'nick only');
}

// ---- translations: every hub string has TR + RU
{
  const missing = [];
  for (const [en, tr, ru] of hubTexts) { if (!tr || tr === en) missing.push('tr:' + en); if (!ru || ru === en) missing.push('ru:' + en); }
  ok(missing.length === 0, 'hub strings translated: ' + missing.slice(0, 6).join(' | '));
  ok(new Set(hubTexts.map((r) => r[0])).size === hubTexts.length, 'no duplicate hub keys');
}

console.log(fails ? `FAILED ${fails}/${checks}` : `social.test OK (${checks} checks)`);
process.exit(fails ? 1 : 0);
