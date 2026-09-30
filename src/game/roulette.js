// THE ALGORITHM'S REVOLVER: Russian-roulette power-ups (wave 2, anomaly add-on). Installed from src/game/anomaly.js (ctx.roulette).
//
// A small round table (1-4 players) with a 6-chamber revolver. The HOST spins the cylinder (1 live round in 6) and runs the round; the gun goes
// round the seated players. On your turn: PULL (hold LMB 1 s), PASS (ONE per player per table session, the next seated player must take the gun,
// solo = no pass) or CASH OUT (only after you survived a pull). Every survived pull raises your personal POT (1 common power-up, 2 uncommon+,
// 3 epic power / rare item, 4 legendary powers + shards, 5 mythic item + huge power). Live round: the shooter dies ('lost at roulette', body at
// the table), everybody else seated is paid out + gets a survivor's rush, the table closes for the day. Five empty chambers: the sixth is the
// bullet, the table pays everyone and resets (max 3 rounds). Tables: replace ~half of the Loot Box Shrine spawns (quota >= 1) + a bonus table in
// the ship once per quota. Nothing here touches the light count (lamp = emissive + additive cone).
//
// Net: 'rr' (client -> host request: sit | stand | pull | pass | cash), 'rrfx' (host -> all, HOST_ONLY: state | sync | pull | pass | cash | stand |
// sit | grant | err). The live chamber never leaves the host. Late join: host sends every table's public state on playerJoin.
//
// game.anomaly.roulette = { spawn(plan), tables(), state(tid), sit/stand/pull/pass/cash(tid?), force: { live(n) }, debug(), ... }
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { ITEMS } from './items.js';
import { tierIndex, tierOfItem } from './tiers.js';
import { POWERUPS } from './powerups.js';
import { planShrine } from './dice.js';
import { createRouletteTable, ROULETTE, seatPos, seatYaw, CHIP_COLORS } from '../models/roulette.js';
import { G } from '../physics/physics.js';

HOST_ONLY.add('rrfx');

// ------------------------------------------------------------------------------------------------ numbers
export const RR = {
  chambers: 6, seats: 4, holdSec: 1.0, turnSec: 45, maxRounds: 3, actGap: 1.0, animSec: 1.1, bangDelay: 0.45,
  moonChance: 0.5, shipChance: 0.45, minQuota: 1, reach: 3.6, leash: 2.6, maxPot: 5,
  noise: { sit: 0.3, pull: 0.5, pass: 0.3, cash: 0.8, bang: 3.0 },
  rush: { id: 'm_legs', dur: 25, heal: 25 },
};
export const SHIP_TABLE = { x: 3.6, y: 0, z: -0.7, yaw: 0.4 };
/** Why an action is unavailable (English keys, translated on display). */
export const WHY = {
  solo: 'Nobody to hand the gun to. Solo means no pass.', used: 'Your one pass is spent.', forced: 'The gun was passed to you. You must pull.',
  notturn: 'Not your turn.', nopot: 'Survive a pull first.', closed: 'The table is closed.', busy: 'Wait for the table.',
};

// ------------------------------------------------------------------------------------------------ pure table rules (host state; the public mirror has the same shape minus `live`)
export function newTable(rnd = Math.random) {
  return { seats: [null, null, null, null], turn: -1, live: Math.floor(rnd() * RR.chambers) % RR.chambers, fired: 0, pots: {}, passUsed: {}, forced: false, round: 1, closed: false, dead: null };
}
/** re-spin: a fresh live chamber, nothing fired */
export function spinCylinder(tb, rnd = Math.random) { tb.live = Math.floor(rnd() * RR.chambers) % RR.chambers; tb.fired = 0; return tb; }
export const seatOf = (tb, id) => tb.seats.indexOf(id);
export const seatedIds = (tb) => tb.seats.filter(Boolean);
export const turnId = (tb) => (tb.turn >= 0 ? tb.seats[tb.turn] || null : null);
/** next occupied seat after `from` (cyclic; the seat itself when it is the only one), -1 when nobody sits */
export function nextSeat(tb, from) { for (let i = 1; i <= RR.seats; i++) { const s = (from + i) % RR.seats; if (tb.seats[s]) return s; } return -1; }
/** take a seat (preferred seat when free, else the first free one). Returns the seat index or -1. */
export function sitAt(tb, id, seat = -1) {
  if (tb.closed || seatOf(tb, id) >= 0) return -1;
  let s = seat;
  if (!(s >= 0 && s < RR.seats) || tb.seats[s]) s = tb.seats.findIndex((x) => !x);
  if (s < 0) return -1;
  tb.seats[s] = id;
  if (tb.pots[id] === undefined) tb.pots[id] = 0;
  if (tb.turn < 0) tb.turn = s;
  return s;
}
/** leave the table; the pot is returned (the caller pays it out). The gun moves on when it was theirs. */
export function standUp(tb, id) {
  const s = seatOf(tb, id);
  if (s < 0) return null;
  const pot = tb.pots[id] || 0;
  delete tb.pots[id];
  tb.seats[s] = null;
  if (tb.turn === s) { tb.turn = nextSeat(tb, s); tb.forced = false; }
  if (!seatedIds(tb).length) { tb.turn = -1; tb.forced = false; }
  return { seat: s, pot };
}
export function pullCheck(tb, id) {
  if (tb.closed) return { ok: false, why: 'closed' };
  if (turnId(tb) !== id) return { ok: false, why: 'notturn' };
  return { ok: true };
}
export function passCheck(tb, id) {
  if (tb.closed) return { ok: false, why: 'closed' };
  if (turnId(tb) !== id) return { ok: false, why: 'notturn' };
  if (tb.forced) return { ok: false, why: 'forced' };
  if (seatedIds(tb).length < 2) return { ok: false, why: 'solo' };
  if (tb.passUsed[id]) return { ok: false, why: 'used' };
  return { ok: true };
}
export function cashCheck(tb, id) {
  if (tb.closed) return { ok: false, why: 'closed' };
  if (turnId(tb) !== id) return { ok: false, why: 'notturn' };
  if (tb.forced) return { ok: false, why: 'forced' };
  if (!((tb.pots[id] || 0) >= 1)) return { ok: false, why: 'nopot' };
  return { ok: true };
}
/** spend the pass: the NEXT seated player must take the gun (forced: no pass, no cash out, pull only). Returns the receiving id. */
export function doPass(tb, id) {
  tb.passUsed[id] = 1;
  tb.turn = nextSeat(tb, seatOf(tb, id));
  tb.forced = true;
  return turnId(tb);
}
/** take the money and leave. Returns the pot level paid. */
export function doCash(tb, id) { const r = standUp(tb, id); return r ? r.pot : 0; }
/** pull the trigger. Live: { res:'live', lost, survivors:[{id,pot}] } (the table closes, everyone is stood up). Empty: { res:'empty', pot, reset?, paid?, closed? }. */
export function doPull(tb, id, rnd = Math.random) {
  const chamber = tb.fired;
  const hit = chamber === tb.live;
  tb.fired++;
  const seat = seatOf(tb, id);
  if (hit) {
    const lost = tb.pots[id] || 0;
    const survivors = seatedIds(tb).filter((x) => x !== id).map((x) => ({ id: x, pot: tb.pots[x] || 0 }));
    tb.closed = true; tb.dead = id; tb.turn = -1; tb.forced = false;
    tb.seats = [null, null, null, null]; tb.pots = {};
    return { res: 'live', chamber, lost, survivors };
  }
  tb.pots[id] = Math.min(RR.maxPot, (tb.pots[id] || 0) + 1);
  tb.forced = false;
  const out = { res: 'empty', chamber, pot: tb.pots[id] };
  if (tb.fired >= RR.chambers - 1) {   // five empty chambers: the sixth is the bullet nobody hit. Everyone is paid, the table resets.
    out.reset = true;
    out.paid = seatedIds(tb).map((x) => ({ id: x, pot: tb.pots[x] || 0 })).filter((x) => x.pot > 0);
    tb.pots = {}; for (const x of seatedIds(tb)) tb.pots[x] = 0;
    tb.round++;
    if (tb.round > RR.maxRounds) { out.closed = true; tb.closed = true; tb.turn = -1; tb.seats = [null, null, null, null]; }
    else { spinCylinder(tb, rnd); tb.turn = nextSeat(tb, seat); }
    return out;
  }
  tb.turn = nextSeat(tb, seat);
  return out;
}
/** what the peers may know (never `live`) */
export function publicState(tb) {
  return { seats: tb.seats.slice(), turn: tb.turn, fired: tb.fired, pots: { ...tb.pots }, passUsed: { ...tb.passUsed }, forced: !!tb.forced, round: tb.round, closed: !!tb.closed, dead: tb.dead };
}
/** validate / clamp a public state that came over the wire */
export function cleanState(s) {
  const o = { seats: [null, null, null, null], turn: -1, fired: 0, pots: {}, passUsed: {}, forced: false, round: 1, closed: false, dead: null };
  if (!s || typeof s !== 'object') return o;
  if (Array.isArray(s.seats)) for (let i = 0; i < RR.seats; i++) o.seats[i] = typeof s.seats[i] === 'string' ? s.seats[i].slice(0, 64) : null;
  o.turn = Math.max(-1, Math.min(RR.seats - 1, s.turn | 0));
  o.fired = Math.max(0, Math.min(RR.chambers, s.fired | 0));
  for (const k of ['pots', 'passUsed']) if (s[k] && typeof s[k] === 'object') for (const [id, v] of Object.entries(s[k])) if (Object.keys(o[k]).length < 8) o[k][String(id).slice(0, 64)] = Math.max(0, Math.min(RR.maxPot, v | 0));
  o.forced = !!s.forced; o.closed = !!s.closed; o.round = Math.max(1, Math.min(9, s.round | 0 || 1));
  o.dead = typeof s.dead === 'string' ? s.dead.slice(0, 64) : null;
  return o;
}

// ------------------------------------------------------------------------------------------------ pot ladder (pure; uses powerups.js / tiers.js / items.js at runtime)
export const POT_TIER = ['', 'common', 'uncommon', 'epic', 'legendary', 'mythic'];
export const POT_LABEL = ['', 'COMMON POWER-UP', 'UNCOMMON POWER-UP', 'EPIC POWER-UP / RARE ITEM', 'LEGENDARY POWERS + SHARDS', 'MYTHIC ITEM + HUGE POWER'];
export const POT_COLOR = ['#888888', ...CHIP_COLORS.slice(1).map((c) => '#' + c.toString(16).padStart(6, '0'))];
const POOL_C = ['p_premium', 'p_adfree', 'p_oc', 'p_xp'];
const POOL_U = ['p_viral', 'p_xp', 'p_oc', 'p_premium', 'p_cloud'];
const POOL_ALL = ['p_xp', 'p_premium', 'p_adfree', 'p_oc', 'p_viral', 'p_cloud'];
const MYTHIC_ITEMS = ['goldbar', 'playbutton', 'usbidol', 'ring'];
const alive = (arr) => arr.filter((id) => POWERUPS[id]);
const pick = (a, rnd) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
function pickN(pool, n, rnd, have = []) {
  const left = alive(pool).filter((x) => !have.includes(x)), out = [...have.filter((x) => POWERUPS[x])];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rnd() * left.length) % left.length, 1)[0]);
  return out;
}
const durOf = (id, mul) => (POWERUPS[id].dur > 0 ? Math.round(POWERUPS[id].dur * mul) : 0);
/** an existing scrap item of a tier range (or null when the table has none) */
export function pickRewardItem(rnd, lo = 'rare', hi = 'epic') {
  const a = tierIndex(lo), b = tierIndex(hi), c = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (d.kind !== 'scrap' || !d.value || d.cursed || d.hands !== 1 || id === 'key') continue;
    const tr = tierOfItem(null, d), ti = tierIndex(tr);
    if (ti >= a && ti <= b) c.push({ type: id, tier: tr });
  }
  return c.length ? pick(c, rnd) : null;
}
/** Pure: the reward of a pot level 1..5. rnd = () => [0,1), q = quota index. */
export function potReward(level, rnd = Math.random, q = 0) {
  level = Math.max(1, Math.min(RR.maxPot, level | 0));
  const o = { level, tier: POT_TIER[level], pus: [], item: null, coins: 0, xp: 0, heal: 0, clean: 0 };
  const add = (ids, mul) => { for (const id of ids) o.pus.push([id, durOf(id, mul)]); };
  if (level === 1) { add(pickN(POOL_C, 1, rnd), 1); o.xp = 40; }
  else if (level === 2) { add(pickN(POOL_U, 1, rnd), 1.5); o.xp = 90; }
  else if (level === 3) {
    o.xp = 180; o.coins = 30 + 15 * q;
    const it = rnd() < 0.4 ? pickRewardItem(rnd, 'rare', 'epic') : null;
    if (it) { o.item = it; add(pickN(POOL_U, 1, rnd), 1.5); } else add(pickN(POOL_ALL, 2, rnd), 1.5);
  } else if (level === 4) { add(pickN(POOL_ALL, 3, rnd, ['p_cloud']), 2); o.coins = 120 + 40 * q; o.xp = 320; o.heal = 30; }
  else {
    add(pickN(POOL_ALL, 3, rnd, ['p_cloud', 'p_xp', 'p_viral']), 2.5);
    const mi = MYTHIC_ITEMS.filter((x) => ITEMS[x]);
    o.item = mi.length ? { type: pick(mi, rnd), tier: 'mythic' } : pickRewardItem(rnd, 'legendary', 'mythic');
    o.coins = 300 + 80 * q; o.xp = 800; o.heal = 100; o.clean = 100;
  }
  return o;
}

// ------------------------------------------------------------------------------------------------ pure world plans
/** does the roulette take this Loot Box Shrine spawn? (seeded; never before quota 1) */
export function claimsShrine(seed, quota) {
  if (quota < RR.minQuota) return false;
  return new RNG((((seed >>> 0) ^ 0x52ee7) >>> 0) || 1).chance(RR.moonChance);
}
/** the bonus table in the ship: once per quota (seeded), never before quota 1 */
export function planShipTable(seed, quota) {
  if (quota < RR.minQuota) return null;
  const rng = new RNG(((((seed >>> 0) ^ 0x51b0a7) + Math.imul(quota | 0, 7919)) >>> 0) || 1);
  return rng.chance(RR.shipChance) ? { ...SHIP_TABLE } : null;
}

// ------------------------------------------------------------------------------------------------ text
const LINES = {
  sit: ['Welcome to the table. Terms and conditions apply to your skull.'],
  safe: ['Bold content. The viewers love it.', 'Click. Retention is up four percent.', 'Still breathing. How wonderfully inefficient.', 'Nothing. The chat wants another.'],
  pass: ['A pass. Delegating risk is management material.', 'Hot potato is also a genre.'],
  cash: ['Leaving early? Retention metrics disagree.', 'A wise exit. Boring, but wise.'],
  bang: ['Content removed for violating community guidelines.', 'The house always wins.', 'That is one way to leave a review.'],
  reset: ['Five clicks. The sixth was mine. The table resets.'],
  out: ['The table has seen enough. Come back tomorrow.'],
};
addTranslations({
  'Welcome to the table. Terms and conditions apply to your skull.': 'Masaya hoş geldin. Şartlar ve koşullar kafatasın için de geçerlidir.',
  'Bold content. The viewers love it.': 'Cesur içerik. İzleyiciler bayılıyor.', 'Click. Retention is up four percent.': 'Klik. Tutundurma yüzde dört arttı.',
  'Still breathing. How wonderfully inefficient.': 'Hâlâ nefes alıyor. Ne kadar verimsiz.', 'Nothing. The chat wants another.': 'Hiçbir şey. Sohbet bir tane daha istiyor.',
  'A pass. Delegating risk is management material.': 'Pas. Riski devretmek yönetici işi.', 'Hot potato is also a genre.': 'Sıcak patates de bir türdür.',
  'Leaving early? Retention metrics disagree.': 'Erken mi ayrılıyorsun? Tutundurma verileri aynı fikirde değil.', 'A wise exit. Boring, but wise.': 'Akıllıca çıkış. Sıkıcı ama akıllıca.',
  'Content removed for violating community guidelines.': 'İçerik topluluk kurallarını ihlal ettiği için kaldırıldı.', 'The house always wins.': 'Kasa her zaman kazanır.',
  'That is one way to leave a review.': 'Yorum bırakmanın bir yolu da bu.', 'Five clicks. The sixth was mine. The table resets.': 'Beş klik. Altıncısı benimdi. Masa sıfırlanıyor.',
  'The table has seen enough. Come back tomorrow.': 'Masa yeterince gördü. Yarın gel.',
  "THE ALGORITHM'S REVOLVER": 'ALGORİTMANIN TABANCASI', 'Roulette Table [E]': 'Rulet Masası [E]', 'The table is cold.': 'Masa soğuk.', 'The table is full.': 'Masa dolu.',
  'seated': 'oturuyor', 'YOUR TURN': 'SIRA SENDE', 'has the gun': 'tabancayı tutuyor', 'CHAMBERS LEFT': 'KALAN NAMLU', 'live round: 1 in': 'kurşun ihtimali: 1 /',
  'PULL': 'ÇEK', 'PASS': 'PAS', 'CASH OUT': 'PARAYI AL', 'STAND UP': 'KALK', 'hold LMB': 'SOL TIK BASILI TUT', 'YOUR POT': 'POTUN', 'NEXT': 'SONRAKİ', 'empty': 'boş', 'FORCED': 'ZORUNLU',
  'COMMON POWER-UP': 'SIRADAN GÜÇ ARTIŞI', 'UNCOMMON POWER-UP': 'NADİR GÜÇ ARTIŞI', 'EPIC POWER-UP / RARE ITEM': 'DESTANSI GÜÇ ARTIŞI / NADİR EŞYA',
  'LEGENDARY POWERS + SHARDS': 'EFSANEVİ GÜÇLER + KIRIKLAR', 'MYTHIC ITEM + HUGE POWER': 'MİTİK EŞYA + DEVASA GÜÇ',
  'Nobody to hand the gun to. Solo means no pass.': 'Tabancayı verecek kimse yok. Tek başına pas yok.', 'Your one pass is spent.': 'Tek pasını kullandın.',
  'The gun was passed to you. You must pull.': 'Tabanca sana pas edildi. Çekmek zorundasın.', 'Not your turn.': 'Sıra sende değil.', 'Survive a pull first.': 'Önce bir çekişten sağ çık.',
  'The table is closed.': 'Masa kapalı.', 'Wait for the table.': 'Masayı bekle.', 'You have the gun. Pull or pass.': 'Tabanca sende. Çek ya da pasla.',
  'PAID OUT': 'ÖDENDİ', 'shards': 'kırık', 'lost at roulette.': 'ruletta kaybetti.', 'SURVIVOR\'S RUSH': 'HAYATTA KALAN COŞKUSU', 'walked away': 'masadan kalktı', 'timed out': 'zaman aşımı',
  'passes the gun to': 'tabancayı şuna verdi:', 'pulls...': 'çekiyor...', 'CLICK. Empty.': 'KLİK. Boş.', 'BANG': 'PATLAMA', 'A stranger walks into the ship. Nobody remembers hiring a bartender.': 'Gemiye bir yabancı girdi. Kimse barmen tuttuğunu hatırlamıyor.',
  'ROUND': 'TUR', 'NO PASS: SOLO': 'PAS YOK: TEK BAŞINA', 'PASS SPENT': 'PAS KULLANILDI', 'CLOSED': 'KAPALI', 'REVOLVER': 'TABANCA',
});
const LINE_COUNT = (k) => LINES[k].length;

// ------------------------------------------------------------------------------------------------ css (built lazily, once)
const CSS = `
.rr-hud{position:fixed;left:50%;bottom:7%;transform:translateX(-50%);z-index:31;width:min(560px,94vw);pointer-events:none;font-family:var(--font,'VT323',monospace);color:#ffe8d0;
background:linear-gradient(180deg,rgba(24,8,8,.86),rgba(8,4,4,.9));border:1px solid #c9302c;box-shadow:0 0 30px rgba(201,48,44,.35);padding:8px 14px 10px}
.rr-hud h3{margin:0;font-family:var(--font2,monospace);font-size:14px;letter-spacing:3px;color:#ff5a4a}
.rr-hud .turn{font-size:26px;line-height:1;margin:2px 0 4px}.rr-hud .turn.me{color:#ffd35a;text-shadow:0 0 10px rgba(255,211,90,.6)}
.rr-hud .ch{display:flex;gap:6px;align-items:center;font-size:18px;margin:3px 0}
.rr-hud .ch i{width:14px;height:14px;border-radius:50%;border:1px solid #ffb090;display:inline-block}.rr-hud .ch i.f{background:#2a1a1a;border-color:#553}
.rr-hud .row{display:flex;gap:16px;font-size:20px;margin-top:3px;flex-wrap:wrap}.rr-hud .row span{white-space:nowrap}
.rr-hud .off{opacity:.42}.rr-hud .why{font-size:17px;color:#ff9a7a;margin-top:2px;min-height:18px}
.rr-hud .bar{height:6px;background:rgba(255,255,255,.12);margin-top:5px}.rr-hud .bar b{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff9a3a,#ff2a2a)}
.rr-hud .seats{font-size:17px;opacity:.85;margin-top:4px}
.rr-hud .pot{font-size:19px}`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'tfg-roulette-css'; s.textContent = CSS; document.head.appendChild(s);
}

// ------------------------------------------------------------------------------------------------ runtime
export function installRoulette(ctx) {
  const game = ctx.game;
  const tables = new Map();              // tid ('m' moon, 's' ship) -> table
  const pending = new Map();             // state that arrived before the local table existed
  const closedKeys = new Set();          // host: table keys that closed (a rebuilt table stays closed)
  const offs = [], restores = [], timers = [];
  const L = { tid: null, seat: -1, hold: 0, sent: false, wait: 0, lock: 0, hbT: 0, baseYaw: 0, cocked: false, hud: null, hudT: 0, hudSig: '' };
  let sig = '', want = {}, disposed = false, forceLive = null, salt = 0, hostRng = null;
  const self = () => game.selfId;
  const quota = () => Math.max(0, game.run?.quotaIndex || 0);
  const later = (fn, sec) => { timers.push({ at: game.time + sec, fn }); };
  const name = (id) => game.playerName?.(id) || 'Player';

  function wrap(obj, key, make) {
    const orig = obj?.[key];
    if (typeof orig !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const w = make(orig);
    obj[key] = w;
    restores.push(() => { if (obj[key] === w) { if (had) obj[key] = orig; else delete obj[key]; } });
  }
  function hrnd() {
    if (!hostRng) { salt = (Math.random() * 4294967296) >>> 0; hostRng = new RNG((((game.run?.seed >>> 0) ^ salt) >>> 0) || 1); }
    return hostRng.next();
  }
  const freshTable = () => { const h = newTable(hrnd); if (forceLive != null) h.live = forceLive; return h; };

  // ---------------------------------------------------------------- world: build / dispose tables (deterministic on every peer)
  function buildTable(id, plan, key) {
    disposeTable(id);
    const model = createRouletteTable();
    model.group.position.set(plan.x, plan.y, plan.z);
    model.group.rotation.y = plan.yaw || 0;
    game.scene.add(model.group);
    let col = null;
    try { col = game.physics.addStaticBox(plan.x, plan.y + 0.42, plan.z, 0.72, 0.42, 0.72, plan.yaw || 0, G.STATIC, { kind: 'static' }); } catch (e) { console.warn('[roulette] collider', e); }
    const T = { id, key, x: plan.x, y: plan.y, z: plan.z, yaw: plan.yaw || 0, pos: new THREE.Vector3(plan.x, plan.y, plan.z), model, col, v: cleanState(null), h: null,
      actAt: 0, turnAt: 0, lastTurn: -2, animUntil: 0, spinBase: 0, shownFired: -1, ship: id === 's' };
    if (game.isHost) { T.h = freshTable(); if (closedKeys.has(key)) T.h.closed = true; T.v = cleanState(publicState(T.h)); }
    const ps = pending.get(id); if (ps) { T.v = cleanState(ps); pending.delete(id); }
    tables.set(id, T);
    model.setLamp(!T.v.closed); model.setClosed(T.v.closed);
    return T;
  }
  function disposeTable(id) {
    const T = tables.get(id);
    if (!T) return;
    if (L.tid === id) leaveSeat();
    try { if (T.col) game.physics?.removeCollider(T.col); } catch { /* ignore */ }
    T.model.dispose();
    tables.delete(id);
  }
  function wanted() {
    const run = game.run, out = {};
    if (!run) return out;
    const ph = run.phase, q = quota(), fac = game.world?.facility;
    if (fac && (ph === 'moon' || ph === 'landing') && claimsShrine(run.seed, q)) {
      const plan = planShrine(fac.scrapSpots, run.seed);
      if (plan) out.m = { plan, key: 'm' + run.seed };
    }
    if (ph === 'orbit' || ph === 'moon') { const sp = planShipTable(run.seed, q); if (sp) out.s = { plan: sp, key: 's' + q }; }
    return out;
  }
  function syncWorld() {
    const run = game.run;
    const s = `${run?.phase}|${run?.seed}|${quota()}|${game.world?.facility ? 1 : 0}`;
    if (s === sig) return;
    sig = s;
    want = wanted();
    for (const [id, T] of [...tables]) { if (T.debug) continue; if (!want[id] || want[id].key !== T.key) disposeTable(id); }
    for (const [id, w] of Object.entries(want)) if (!tables.has(id)) buildTable(id, w.plan, w.key);
  }

  // ---------------------------------------------------------------- host: requests
  function nearestSeat(T, from) {
    const ap = game.aiPlayerById?.(from);
    if (!ap) return -1;
    let best = -1, bd = 1e9;
    const v = new THREE.Vector3();
    for (let i = 0; i < RR.seats; i++) {
      if (T.h.seats[i]) continue;
      const d = seatPos(T.x, T.y, T.z, T.yaw, i, v).distanceTo(ap.pos);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  const fx = (d) => game.net?.broadcast('rrfx', d);
  const fxTo = (id, d) => game.net?.sendTo(id, 'rrfx', { ...d, to: id });
  const pushState = (T) => fx({ k: 'state', id: T.id, s: publicState(T.h) });
  const noise = (T, n) => { try { game.balance?.noise?.(T.pos, n); } catch { /* optional */ } };
  const seatAt = (T, id, out = new THREE.Vector3()) => { const s = T.h ? seatOf(T.h, id) : -1; return seatPos(T.x, T.y, T.z, T.yaw, Math.max(0, s), out); };
  function tableOf(from) { for (const T of tables.values()) if (T.h && seatOf(T.h, from) >= 0) return T; return null; }

  function hostPayout(T, id, level, opts = {}) {
    const rw = level >= 1 ? potReward(level, hrnd, quota()) : null;
    if (rw?.item && ITEMS[rw.item.type] && game.items?.hostSpawn) {
      const at = seatAt(T, id).add(new THREE.Vector3(0, 1.3, 0));
      try { game.items.hostSpawn(rw.item.type, at, { tier: rw.item.tier, linvel: [0, 2.2, 0] }); } catch (e) { console.warn('[roulette] item', e); }
    }
    fxTo(id, { k: 'grant', id: T.id, level, pus: rw?.pus || [], coins: rw?.coins || 0, xp: rw?.xp || 0, heal: rw?.heal || 0, clean: rw?.clean || 0, item: rw?.item?.type || null, rush: opts.rush ? 1 : 0, delay: opts.delay || 0, why: opts.why || '' });
    return rw;
  }
  function hostSit(T, from) {
    const h = T.h, ap = game.aiPlayerById?.(from);
    if (!h || !ap || ap.dead) return;
    if (h.closed) return fxTo(from, { k: 'err', msg: 'The table is closed.' });
    if (ap.pos.distanceTo(T.pos) > RR.reach + 0.6) return;
    if (tableOf(from)) return;
    const seat = nearestSeat(T, from);
    if (seat < 0) return fxTo(from, { k: 'err', msg: 'The table is full.' });
    const first = !seatedIds(h).length;
    if (sitAt(h, from, seat) < 0) return;
    if (first) T.turnAt = game.time;
    T.lastTurn = -2;
    noise(T, RR.noise.sit);
    fx({ k: 'sit', id: T.id, by: from, seat, line: first ? 0 : -1 });
    pushState(T);
  }
  function hostStand(T, id, why) {
    const h = T.h;
    const r = h && standUp(h, id);
    if (!r) return;
    if (r.pot > 0) hostPayout(T, id, r.pot, { why: why || 'walked away' });
    fx({ k: 'stand', id: T.id, by: id, seat: r.seat, pot: r.pot, why: why || '' });
    pushState(T);
  }
  function hostPull(T, id) {
    const h = T.h;
    if (!h || !pullCheck(h, id).ok || game.time < T.actAt) return;
    T.actAt = game.time + RR.actGap; T.turnAt = game.time;
    const seat = seatOf(h, id);
    const r = doPull(h, id, hrnd);
    noise(T, RR.noise.pull);
    if (r.res === 'live') {
      closedKeys.add(T.key);
      noise(T, RR.noise.bang);
      fx({ k: 'pull', id: T.id, by: id, seat, res: 'live', n: r.chamber + 1, lost: r.lost, line: Math.floor(hrnd() * LINE_COUNT('bang')) });
      for (const s of r.survivors) hostPayout(T, s.id, s.pot, { rush: true, delay: RR.bangDelay + 0.5, why: 'survived' });
    } else {
      if (r.closed) closedKeys.add(T.key);
      fx({ k: 'pull', id: T.id, by: id, seat, res: 'empty', n: r.chamber + 1, pot: r.pot, reset: r.reset ? 1 : 0, closed: r.closed ? 1 : 0,
        line: r.reset ? (r.closed ? -2 : -3) : Math.floor(hrnd() * LINE_COUNT('safe')) });
      if (r.reset) for (const p of r.paid) hostPayout(T, p.id, p.pot, { delay: 1.0, why: 'reset' });
    }
    pushState(T);
  }
  function hostPass(T, id) {
    const h = T.h;
    if (!h || !passCheck(h, id).ok || game.time < T.actAt) return;
    T.actAt = game.time + RR.actGap * 0.6; T.turnAt = game.time;
    const to = doPass(h, id);
    noise(T, RR.noise.pass);
    fx({ k: 'pass', id: T.id, by: id, to, line: Math.floor(hrnd() * LINE_COUNT('pass')) });
    pushState(T);
  }
  function hostCash(T, id) {
    const h = T.h;
    if (!h || !cashCheck(h, id).ok || game.time < T.actAt) return;
    T.actAt = game.time + RR.actGap * 0.6; T.turnAt = game.time;
    const pot = doCash(h, id);
    noise(T, RR.noise.cash);
    hostPayout(T, id, pot, { why: 'cash' });
    fx({ k: 'cash', id: T.id, by: id, pot, line: Math.floor(hrnd() * LINE_COUNT('cash')) });
    pushState(T);
  }
  function hostRequest(d, from) {
    if (!d || typeof d !== 'object' || !game.isHost) return;
    if (d.op === 'sit') { const T = tables.get(d.tid === 's' ? 's' : 'm'); if (T?.h) hostSit(T, from); return; }
    const T = tableOf(from);
    if (!T) return;
    if (d.op === 'stand') { if (turnId(T.h) === from && (T.h.pots[from] || 0) < 1 && seatedIds(T.h).length > 1) return; hostStand(T, from, 'walked away'); }
    else if (d.op === 'pull') hostPull(T, from);
    else if (d.op === 'pass') hostPass(T, from);
    else if (d.op === 'cash') hostCash(T, from);
  }
  function hostTick() {
    for (const T of tables.values()) {
      const h = T.h;
      if (!h) continue;
      if (h.turn !== T.lastTurn) { T.lastTurn = h.turn; T.turnAt = game.time; }
      for (const id of seatedIds(h)) {
        const ap = game.aiPlayerById?.(id);
        if (!ap || ap.dead || ap.pos.distanceTo(seatAt(T, id)) > RR.leash) { hostStand(T, id, 'walked away'); }
      }
      if (h.turn >= 0 && game.time - T.turnAt > RR.turnSec) { const id = turnId(h); if (id) hostStand(T, id, 'timed out'); }
    }
  }

  // ---------------------------------------------------------------- client: state + events
  function applyState(id, s) {
    const T = tables.get(id);
    if (!T) { pending.set(id, s); return; }
    T.v = cleanState(s);
    T.model.setClosed(T.v.closed); T.model.setLamp(!T.v.closed);
    const my = T.v.seats.indexOf(self());
    if (my >= 0 && L.tid !== id && !game.player?.dead) enterSeat(T, my);
    else if (my < 0 && L.tid === id) leaveSeat();
    else if (my >= 0 && L.tid === id) L.seat = my;
  }
  function payText(d) {
    const parts = (d.pus || []).map(([pid]) => (POWERUPS[pid] ? t(POWERUPS[pid].name) : pid));
    if (d.item && ITEMS[d.item]) parts.push(t(ITEMS[d.item].name || d.item));
    if (d.coins) parts.push(`+${d.coins} ${t('shards')}`);
    return parts.join(' + ');
  }
  function onGrant(d) {
    const p = game.player;
    if (!p || p.dead) return;
    const apply = () => {
      if (game.player?.dead) return;
      for (const [pid, dur] of d.pus || []) if (POWERUPS[pid]) ctx.grantBuff(pid, dur);
      if (d.rush) { ctx.grantBuff(RR.rush.id, RR.rush.dur); game.player.hp = Math.min(game.stats.maxHp, game.player.hp + RR.rush.heal); game.net?.send?.('pst', { hp: Math.round(game.player.hp) }); }
      if (d.heal) { game.player.hp = Math.min(game.stats.maxHp, game.player.hp + d.heal); game.net?.send?.('pst', { hp: Math.round(game.player.hp) }); ctx.snd(['heal'], 0.6); }
      if (d.clean) ctx.static?.addExposure(-d.clean);
      if (d.coins) game.progress?.addCoins?.(d.coins, 'Roulette');
      if (d.xp) game.progress?.addXp?.(d.xp, 'Roulette');
      const lvl = Math.max(0, Math.min(RR.maxPot, d.level | 0));
      if (lvl >= 1) {
        const txt = payText(d);
        ctx.toast(`${t('PAID OUT')} [${lvl}] ${t(POT_LABEL[lvl])}${txt ? ': ' + txt : ''}`, 'good');
        ctx.snd(lvl >= 4 ? ['ui_quota_met', 'ui_levelup'] : ['ui_confirm', 'coins'], 0.7);
        game.engine?.flash?.(parseInt(POT_COLOR[lvl].slice(1), 16), lvl >= 4 ? 0.4 : 0.2);
      }
      if (d.rush) ctx.toast(t("SURVIVOR'S RUSH"), 'good');
    };
    if (d.delay > 0) later(apply, Math.min(4, d.delay)); else apply();
  }
  function say(kind, idx) { const a = LINES[kind]; if (a && idx >= 0) ctx.say(a[idx % a.length]); }
  function onPull(T, d) {
    if (!T) return;
    const m = T.model;
    T.animUntil = game.time + RR.animSec;
    m.aim(T.v.seats.indexOf(d.by) >= 0 ? T.v.seats.indexOf(d.by) : d.seat | 0);
    m.click();
    m.setChamber(T.spinBase + Math.max(0, d.n | 0));
    ctx.snd(['safe_click', 'slot_stop'], 0.75, T.pos, 0.8);
    if (d.by === self()) { L.hold = 0; L.sent = false; L.cocked = false; }
    if (d.res === 'live') {
      later(() => bang(T, d), RR.bangDelay);
      say('bang', d.line);
    } else {
      game.particles?.burst?.(m.centerWorld(new THREE.Vector3()), { count: 6, color: [0xffe8c0], speed: 0.8, up: 0.6, life: 0.4, size: 0.03, gravity: 1, drag: 2, additive: true });
      if (d.reset) { T.spinBase += 12; m.setChamber(T.spinBase); ctx.snd(['slot_spin'], 0.6, T.pos); ctx.toast(t(d.closed ? LINES.out[0] : LINES.reset[0]), 'info'); say(d.closed ? 'out' : 'reset', 0); }
      else say('safe', d.line);
    }
  }
  function bang(T, d) {
    if (disposed || !tables.has(T.id)) return;
    const m = T.model, p = game.player;
    m.fire(); m.setClosed(true);
    ctx.snd(['shotgun_fire', 'explosion', 'stun_bang'], 1, T.pos);
    ctx.snd(['death_sting'], 0.5);
    const muz = m.muzzleWorld(new THREE.Vector3());
    game.particles?.burst?.(muz, { count: 40, color: [0xffd28a, 0xff5a2a, 0xffffff], speed: 5, up: 1.5, life: 0.7, size: 0.09, gravity: 1.5, drag: 1.5, additive: true });
    game.particles?.burst?.(muz, { count: 18, color: [0x8a0a0a, 0x550000], speed: 3, up: 2.5, life: 1, size: 0.08, gravity: 6, drag: 1 });
    if (p && p.pos.distanceTo(T.pos) < 30) { game.engine?.flash?.(0xffffff, 0.8); game.engine?.shake?.(0.55); }
    if (d.by === self()) {
      if (game.godMode) { ctx.toast(t('BANG') + ' (god mode)', 'warn'); return; }
      game.die?.('lost at roulette');
    }
  }
  function onFx(d) {
    if (!d || typeof d !== 'object' || disposed) return;
    if (d.to && d.to !== self()) return;
    const T = d.id ? tables.get(String(d.id)) : null;
    switch (d.k) {
      case 'state': applyState(String(d.id), d.s); break;
      case 'sync': if (d.tables && typeof d.tables === 'object') for (const [id, s] of Object.entries(d.tables)) applyState(id, s); break;
      case 'pull': onPull(T, d); break;
      case 'pass': if (T) { T.animUntil = game.time + 0.7; ctx.snd(['inventory_switch', 'safe_click'], 0.5, T.pos, 0.7); say('pass', d.line | 0); if (d.to === self()) ctx.toast(t(WHY.forced), 'warn'); } break;
      case 'cash': if (T) { ctx.snd(['coins', 'register'], 0.5, T.pos); say('cash', d.line | 0); } break;
      case 'stand': if (T && d.by !== self()) ctx.snd(['cloth_rustle'], 0.4, T.pos); if (d.why === 'timed out' && d.by === self()) ctx.toast(t('timed out'), 'warn'); break;
      case 'sit': if (T) { ctx.snd(['inventory_switch', 'slot_spin'], 0.5, T.pos); if (d.line === 0) { T.spinBase += 12; T.model.setChamber(T.spinBase + T.v.fired); say('sit', 0); } } break;
      case 'grant': onGrant(d); break;
      case 'err': ctx.toast(t(String(d.msg || '')), 'bad'); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- client: sitting, hold-to-pull, HUD
  function enterSeat(T, seat) {
    const p = game.player;
    if (!p || p.dead) return;
    L.tid = T.id; L.seat = seat; L.hold = 0; L.sent = false; L.wait = 0; L.cocked = false; L.lock = game.time + 0.5;
    const sp = seatPos(T.x, T.y, T.z, T.yaw, seat);
    const yaw = seatYaw(T.x, T.z, T.yaw, seat);
    p.teleport(sp, yaw);
    p.pitch = -0.55;
    L.baseYaw = yaw;
    game.grab?.stop?.();
    ensureCss();
    buildHud();
    ctx.snd(['inventory_switch'], 0.5);
  }
  function leaveSeat() {
    L.tid = null; L.seat = -1; L.hold = 0; L.sent = false; L.cocked = false;
    L.hud?.remove(); L.hud = null; L.hudSig = '';
    game.ui?.hud?.setPrompt?.(null);
  }
  function buildHud() {
    if (typeof document === 'undefined') return;
    L.hud?.remove();
    const el = document.createElement('div');
    el.className = 'rr-hud';
    el.innerHTML = '<h3></h3><div class="turn"></div><div class="ch"></div><div class="pot"></div><div class="row"></div><div class="why"></div><div class="bar"><b></b></div><div class="seats"></div>';
    (document.getElementById('ui') || document.body).appendChild(el);
    L.hud = el; L.hudSig = '';
  }
  function updateHud(T) {
    const el = L.hud;
    if (!el || !T) return;
    const v = T.v, me = self(), mine = turnId(v) === me, pot = v.pots[me] || 0;
    const pc = passCheck(v, me), cc = cashCheck(v, me);
    const holdPct = Math.round(Math.min(1, L.hold / RR.holdSec) * 100);
    const left = RR.chambers - v.fired;
    const seatsTxt = v.seats.map((id, i) => (id ? `${turnId(v) === id ? '&gt; ' : ''}${name(id).replace(/[<>&]/g, '')} [${v.pots[id] || 0}]${v.passUsed[id] ? ' ' + t('PASS SPENT').toLowerCase() : ''}` : '')).filter(Boolean).join(' &nbsp;|&nbsp; ');
    const canPull = mine && !v.closed;
    const why = v.closed ? t(WHY.closed) : !mine ? '' : !pc.ok && pc.why === 'solo' ? t(WHY.solo) : !pc.ok && pc.why === 'used' ? t(WHY.used) : v.forced ? t(WHY.forced) : (!cc.ok && cc.why === 'nopot' ? t('Survive a pull first.') : '');
    const s = [v.turn, v.fired, pot, v.forced, v.round, v.closed, seatsTxt, why, mine, holdPct, pc.ok, cc.ok, getLangKey()].join('|');
    if (s === L.hudSig) return;
    L.hudSig = s;
    el.querySelector('h3').textContent = t("THE ALGORITHM'S REVOLVER") + ` · ${t('ROUND')} ${v.round}/${RR.maxRounds}`;
    const tn = el.querySelector('.turn');
    tn.className = 'turn' + (mine ? ' me' : '');
    tn.textContent = v.closed ? t('CLOSED') : mine ? t('YOUR TURN') + (v.forced ? ' · ' + t('FORCED') : '') : (turnId(v) ? `${name(turnId(v))} ${t('has the gun')}` : '');
    el.querySelector('.ch').innerHTML = Array.from({ length: RR.chambers }, (_, i) => `<i class="${i < v.fired ? 'f' : ''}"></i>`).join('') + `<span>&nbsp;${left} ${t('CHAMBERS LEFT')} · ${t('live round: 1 in')} ${Math.max(1, left)}</span>`;
    el.querySelector('.pot').innerHTML = `${t('YOUR POT')}: <b style="color:${POT_COLOR[pot]}">${pot ? t(POT_LABEL[pot]) : '-'}</b> &nbsp; ${t('NEXT')}: <span style="color:${POT_COLOR[Math.min(5, pot + 1)]}">${t(POT_LABEL[Math.min(5, pot + 1)])}</span>`;
    el.querySelector('.row').innerHTML = `<span class="${canPull ? '' : 'off'}">[${t('hold LMB')}] ${t('PULL')}</span><span class="${pc.ok ? '' : 'off'}">[Q] ${t('PASS')}</span><span class="${cc.ok || !mine ? '' : 'off'}">[E] ${mine ? t('CASH OUT') : t('STAND UP')}</span>`;
    el.querySelector('.why').textContent = why;
    el.querySelector('.bar b').style.width = holdPct + '%';
    el.querySelector('.seats').innerHTML = seatsTxt;
  }
  const getLangKey = () => t('PULL');   // changes with the language: forces a HUD redraw
  function hint(msg) { ctx.toast(t(msg), 'warn'); ctx.snd(['ui_error'], 0.35); }

  /** replaces Game.localActions while seated (like the van seat does) */
  function seatedActions(dt, input) {
    const T = tables.get(L.tid);
    if (!T) return;
    try { game.ensureSlots?.(); } catch { /* ignore */ }
    const v = T.v, me = self(), mine = turnId(v) === me && !v.closed && game.time >= T.animUntil && game.time >= L.lock;
    game.ui?.hud?.setPrompt?.(null);
    L.wait = Math.max(0, L.wait - dt);
    if (!input.enabled) { L.hold = 0; T.model.setCock(0); return; }
    // ---- PULL: hold LMB for a second (slow hammer click, heartbeat and tunnel vision are driven from update())
    const lmb = input.mouseDown(0);
    if (lmb && mine && !L.sent && L.wait <= 0) {
      if (L.hold === 0) ctx.snd(['safe_click'], 0.5, T.pos, 0.55);
      L.hold += dt;
      const prog = Math.min(1, L.hold / RR.holdSec);
      T.model.setCock(prog);
      if (prog >= 1) {
        L.sent = true; L.wait = 1.3; L.hold = RR.holdSec;
        ctx.snd(['safe_click'], 0.8, T.pos, 0.7);
        game.net?.request('rr', { op: 'pull', tid: T.id });
      }
    } else {
      if (!lmb) { if (L.hold > 0 && !L.sent) ctx.snd(['safe_click'], 0.25, T.pos, 0.9); L.hold = L.sent ? RR.holdSec : 0; if (L.wait <= 0) { L.sent = false; L.hold = 0; } }
      else if (!L.sent) L.hold = 0;
      T.model.setCock(L.sent ? 1 : 0);
      if (input.mouseClicked(0) && !mine && turnId(v) !== me && !v.closed) hint(WHY.notturn);
    }
    // ---- PASS
    if (input.codePressed('KeyQ')) {
      const c = passCheck(v, me);
      if (c.ok && game.time >= T.animUntil) game.net?.request('rr', { op: 'pass', tid: T.id }); else if (!c.ok) hint(WHY[c.why] || WHY.notturn);
    }
    // ---- CASH OUT (your turn) / STAND UP (otherwise)
    if (input.pressed('interact') && game.time >= L.lock) {
      if (turnId(v) === me && !v.closed) {
        const c = cashCheck(v, me);
        if (c.ok && game.time >= T.animUntil) game.net?.request('rr', { op: 'cash', tid: T.id });
        else if (!c.ok) hint(c.why === 'nopot' && v.seats.filter(Boolean).length > 1 ? 'You have the gun. Pull or pass.' : WHY[c.why]);
      } else game.net?.request('rr', { op: 'stand', tid: T.id });
    }
    if (input.pressed('flashlight')) game.toggleFlashlight?.();
    if (input.mouseClicked(2)) game.scan?.();
  }
  wrap(game, 'localActions', (orig) => function (dt, input) {
    if (L.seat >= 0 && !disposed) { seatedActions(dt, input); return; }
    return orig.call(this, dt, input);
  });
  wrap(game, 'deathText', (orig) => function (cause) { return cause === 'lost at roulette' ? t('lost at roulette.') : orig.call(this, cause); });

  // ---------------------------------------------------------------- interaction prompt
  offs.push(ctx.mods.on('interactables', (out, g) => {
    if (g !== game || L.seat >= 0) return;
    const p = game.player;
    if (!p || p.dead) return;
    for (const T of tables.values()) {
      const v = T.v, n = seatedIds(v).length;
      out.push({ pos: new THREE.Vector3(T.x, T.y + 0.95, T.z), r: 1.2, reach: RR.reach, label: t('Roulette Table [E]'),
        sub: v.closed ? t('The table is cold.') : `${n}/${RR.seats} ${t('seated')} · ${RR.chambers - v.fired} ${t('CHAMBERS LEFT')}`,
        action: () => { if (v.closed) { ctx.snd(['ui_error'], 0.4); ctx.toast(t('The table is cold.'), 'info'); } else if (n >= RR.seats) hint('The table is full.'); else game.net?.request('rr', { op: 'sit', tid: T.id }); } });
    }
  }));

  // ---------------------------------------------------------------- net + lifecycle
  offs.push(ctx.mods.on('registerHandlers', (H, g) => { if (g === game) H('rr', hostRequest); }));
  offs.push(ctx.mods.on('netReady', (net, g) => {
    if (g !== game) return;
    net.on_('rrfx', onFx);
    offs.push(net.on('peerLeave', (id) => { if (!game.isHost) return; const T = tableOf(id); if (T) hostStand(T, id, 'walked away'); }));
  }));
  offs.push(ctx.mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !game.isHost) return;
    const s = {};
    for (const T of tables.values()) if (T.h) s[T.id] = publicState(T.h);
    if (Object.keys(s).length) game.net.sendTo(id, 'rrfx', { k: 'sync', tables: s });
  }));
  offs.push(ctx.mods.on('phase', (ph, g) => {
    if (g !== game) return;
    sig = '';   // re-plan the tables next frame
    if (game.isHost) for (const T of tables.values()) if (T.h) for (const id of seatedIds(T.h)) hostStand(T, id, 'walked away');
  }));
  offs.push(ctx.mods.on('localDeath', (c, g) => { if (g === game && L.seat >= 0) leaveSeat(); }));

  // ---------------------------------------------------------------- frame
  let hostT = 0;
  function update(dt) {
    if (disposed) return;
    syncWorld();
    for (let i = timers.length - 1; i >= 0; i--) if (game.time >= timers[i].at) { const f = timers.splice(i, 1)[0].fn; try { f(); } catch (e) { console.warn('[roulette] timer', e); } }
    if (game.isHost) { hostT += dt; if (hostT >= 0.25) { hostT = 0; hostTick(); } }
    const p = game.player, cam = game.camera;
    for (const T of tables.values()) {
      if (cam && T.pos.distanceToSquared(cam.position) > 3600) continue;   // [perf5] a table 60 m away is not drawn / heard: its model animates again (from its targets) when you come back
      const v = T.v, m = T.model;
      const lv = [0, 0, 0, 0];
      for (let i = 0; i < RR.seats; i++) lv[i] = v.seats[i] ? Math.min(5, v.pots[v.seats[i]] || 0) : 0;
      m.setChips(lv);
      if (game.time >= T.animUntil) {
        if (!v.closed) m.aim(v.turn);
        if (T.shownFired !== v.fired) { T.shownFired = v.fired; m.setChamber(T.spinBase + v.fired); }
      }
      const tn = turnId(v);
      m.setSign(v.closed ? t('CLOSED') : tn ? `${name(tn)}`.slice(0, 14) : t('REVOLVER'), v.closed ? t('The table is cold.') : `${RR.chambers - v.fired} ${t('CHAMBERS LEFT')}`, v.closed ? '#8a8a8a' : '#ff5a4a');
      m.update(dt, game.time, cam);
    }
    // seated player: hold the pose, look around a little, tunnel vision while the hammer is back
    if (L.seat >= 0 && p) {
      const T = tables.get(L.tid);
      if (!T || p.dead) { leaveSeat(); return; }
      p.stunT = Math.max(p.stunT || 0, 0.2);
      const dy = Math.atan2(Math.sin(p.yaw - L.baseYaw), Math.cos(p.yaw - L.baseYaw));
      if (Math.abs(dy) > 1.5) p.yaw = L.baseYaw + Math.sign(dy) * 1.5;
      p.pitch = Math.max(-1.2, Math.min(0.55, p.pitch));
      const prog = Math.min(1, L.hold / RR.holdSec);
      if (prog > 0) {
        const fxs = game.engine?.fx;
        if (fxs) { fxs.blind = Math.max(fxs.blind, 0.5 * prog * prog); fxs.lowHp = Math.max(fxs.lowHp, 0.85 * prog); }
        L.hbT -= dt;
        if (L.hbT <= 0) { L.hbT = 0.95 - 0.5 * prog; game.sfx?.('heartbeat', 0.35 + 0.5 * prog, 0.9 + 0.2 * prog); game.engine?.beat?.(0.5 + 0.5 * prog); }
      }
      L.hudT -= dt;
      if (L.hudT <= 0) { L.hudT = 0.08; updateHud(T); }
    }
  }

  // ---------------------------------------------------------------- public api
  const api = {
    update,
    tables: () => [...tables.values()],
    state: (tid = 'm') => { const T = tables.get(tid); return T ? { ...T.v } : null; },
    hostState: (tid = 'm') => { const T = tables.get(tid); return T?.h ? { ...T.h, seats: T.h.seats.slice(), pots: { ...T.h.pots } } : null; },
    /** tests / debug: put a table at a spot regardless of the seeded plan / quota (id 'm' by default) */
    spawn(p, yaw = 0, tid = 'm') { const T = buildTable(tid, { x: p.x, y: p.y, z: p.z, yaw }, 'dbg' + tid); T.debug = true; return T; },
    sit: (tid = 'm') => game.net?.request('rr', { op: 'sit', tid }),
    stand: (tid = 'm') => game.net?.request('rr', { op: 'stand', tid }),
    pull: (tid = 'm') => game.net?.request('rr', { op: 'pull', tid }),
    pass: (tid = 'm') => game.net?.request('rr', { op: 'pass', tid }),
    cash: (tid = 'm') => game.net?.request('rr', { op: 'cash', tid }),
    /** tests: force the live chamber (0..5) of a table on the host (or of the next fresh one) */
    force: { live(n, tid = 'm') { forceLive = n == null ? null : n; const T = tables.get(tid); if (T?.h && n != null) T.h.live = n; }, actGap() { for (const T of tables.values()) T.actAt = 0; } },
    seated: () => L.seat >= 0,
    /** claim a shrine spawn? (used by dice.js) */
    claims(plan, seed) { void plan; return claimsShrine(seed, quota()); },
    debug: () => ({ tables: [...tables.values()].map((T) => ({ id: T.id, key: T.key, closed: T.v.closed, seats: T.v.seats, turn: T.v.turn, fired: T.v.fired, pots: T.v.pots, live: T.h?.live })), seated: L.seat, want: Object.keys(want) }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      leaveSeat();
      for (const id of [...tables.keys()]) disposeTable(id);
      timers.length = 0;
    },
  };
  return api;
}
void ROULETTE;
