// Deterministic run-day modifiers ("DAILY EVENTS"): every landing rolls one from (run seed, day, moon), so a
// route choice gains risk/reward without making a bad roll unwinnable. Weekly challenge mutators use the same
// field vocabulary and are merged in with combineEvents().
//
// run.dailyEvent keeps the plain-data shape { id, name, desc, ...fields } (HUD / terminal / objectives read
// name + desc). Fields and who applies them:
//   valueMul, dangerMul, outdoorMul, blackout ........ host.js hostLever / hostFinishLanding / hostPopulateMoon
//   xpMul, coinMul .................................... Progress.addXp / addCoins (every peer, while on the moon)
//   hpMul, meleeMul, jumpMul, speedMul, staminaMul, scanMul, batteryMul .. stats layer below (every peer, on the moon)
//   timeMul, startTime, migrate, drops, swarm, killCoin, extraScrap, cache, eliteAdd ... host runtime below
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { SCRAP_TABLE, ITEMS, isSellable } from './items.js';
import { insideShip } from '../world/ship.js';
import { addTranslations } from '../core/i18n.js';
import { scrapValueMul } from './progression.js';

// w: roll weight (rarer = lower). mood drives the HUD / chat colour: good | bad | mixed.
export const DAILY_EVENTS = [
  { id: 'viral', name: 'VIRAL TREND', desc: 'The Algorithm is boosting this moon. Scrap is worth +25%.', valueMul: 1.25, dangerMul: 1, mood: 'good', w: 1,
    tr: ['VİRAL TREND', 'Algoritma bu ayı öne çıkarıyor. Hurda +%25 değerli.'] },
  { id: 'purge', name: 'CONTENT PURGE', desc: 'Deletion crews are active: more dangerous entities roam, but they dug up rare content. Scrap +12%.', valueMul: 1.12, dangerMul: 1.22, mood: 'bad', w: 1,
    tr: ['İÇERİK TEMİZLİĞİ', 'Silme ekipleri aktif: daha tehlikeli varlıklar dolaşıyor ama nadir içerik ortaya çıktı. Hurda +%12.'] },
  { id: 'deadlink', name: 'DEAD LINK', desc: 'Outer relays are exposed. Outdoor loot is worth +60%.', valueMul: 1.08, dangerMul: 1.05, outdoorMul: 1.6, mood: 'mixed', w: 1,
    tr: ['ÖLÜ LİNK', 'Dış röleler açıkta. Dışarıdaki ganimet +%60 değerli.'] },
  { id: 'blackout', name: 'BLACKOUT WINDOW', desc: 'Power is unstable. Valuable loot is +15%, but the facility starts dark.', valueMul: 1.15, dangerMul: 1.08, blackout: true, mood: 'mixed', w: 1,
    tr: ['KARARTMA', 'Elektrik dengesiz. Ganimet +%15 ama tesis karanlık başlıyor.'] },
  { id: 'quiet', name: 'QUIET FEED', desc: 'The network is unusually quiet. Creature pressure is reduced.', valueMul: 0.95, dangerMul: 0.78, mood: 'good', w: 1,
    tr: ['SESSİZ AKIŞ', 'Ağ alışılmadık derecede sessiz. Yaratık baskısı azaldı.'] },
  { id: 'botswarm', name: 'BOT SWARM', desc: 'Spam bots flood the building. Every creature kill pays a ◈6 bounty.', dangerMul: 1.05, swarm: 3, killCoin: 6, mood: 'mixed', w: 1,
    tr: ['BOT SÜRÜSÜ', 'Spam botlar binayı bastı. Her yaratık öldürme ◈6 ödül verir.'] },
  { id: 'migration', name: 'SERVER MIGRATION', desc: 'Loose content is being moved between rooms every minute. Scrap +20%.', valueMul: 1.2, migrate: 70, mood: 'mixed', w: 1,
    tr: ['SUNUCU TAŞIMA', 'Ortadaki içerik her dakika odalar arasında taşınıyor. Hurda +%20.'] },
  { id: 'clickbait', name: 'CLICKBAIT FRENZY', desc: 'Half again as much scrap lies around, but every piece is worth 20% less.', valueMul: 0.8, extraScrap: 0.5, mood: 'mixed', w: 1,
    tr: ['TIK TUZAĞI ÇILGINLIĞI', 'Yarısı kadar fazla hurda var ama her parça %20 daha değersiz.'] },
  { id: 'lowgrav', name: 'LOW GRAVITY PATCH', desc: 'A physics hotfix went wrong. You jump 40% higher and move 6% faster.', jumpMul: 1.4, speedMul: 1.06, dangerMul: 1.04, mood: 'good', w: 0.8,
    tr: ['DÜŞÜK YERÇEKİMİ YAMASI', 'Fizik yaması ters gitti. %40 daha yüksek zıplar, %6 daha hızlı koşarsın.'] },
  { id: 'doublexp', name: 'DOUBLE XP WEEKEND', desc: 'Engagement event! All XP earned on this moon is doubled. Creatures are hyped too.', xpMul: 2, dangerMul: 1.12, mood: 'good', w: 0.55,
    tr: ['ÇİFTE XP HAFTASONU', 'Etkileşim etkinliği! Bu ayda kazanılan tüm XP iki katı. Yaratıklar da coşkulu.'] },
  { id: 'haunted', name: 'HAUNTED CACHE', desc: 'Three cursed golden archives are hidden deep inside. Something guards them.', cache: 3, dangerMul: 1.15, eliteAdd: 0.06, mood: 'mixed', w: 0.8,
    tr: ['LANETLİ ÖNBELLEK', 'Derinlerde üç lanetli altın arşiv saklı. Bir şey onları koruyor.'] },
  { id: 'caffeine', name: 'CAFFEINE OVERDOSE', desc: 'Stamina regenerates 80% faster and you move 5% faster, but your scanner jitters (-30% range).', staminaMul: 1.8, speedMul: 1.05, scanMul: 0.7, mood: 'mixed', w: 1,
    tr: ['KAFEİN ZEHİRLENMESİ', 'Dayanıklılık %80 hızlı dolar, %5 hızlı koşarsın ama tarayıcı titrer (-%30 menzil).'] },
  { id: 'glasscannon', name: 'GLASS CANNON UPDATE', desc: 'Balance patch: -30% max health, +40% melee damage. Scrap +10%.', hpMul: 0.7, meleeMul: 1.4, valueMul: 1.1, mood: 'mixed', w: 0.9,
    tr: ['CAM TOP GÜNCELLEMESİ', 'Denge yaması: -%30 maksimum can, +%40 yakın dövüş hasarı. Hurda +%10.'] },
  { id: 'lowpower', name: 'LOW POWER MODE', desc: 'Batteries drain 50% faster. The Algorithm pays +20% for the trouble.', batteryMul: 0.67, valueMul: 1.2, mood: 'mixed', w: 1,
    tr: ['DÜŞÜK GÜÇ MODU', 'Piller %50 hızlı biter. Algoritma zahmet için +%20 öder.'] },
  { id: 'rushhour', name: 'RUSH HOUR', desc: 'The clock runs 30% faster today. Scrap is worth +30%.', timeMul: 1.3, valueMul: 1.3, mood: 'mixed', w: 0.9,
    tr: ['YOĞUN SAAT', 'Saat bugün %30 hızlı akıyor. Hurda +%30 değerli.'] },
  { id: 'slowday', name: 'SLOW NEWS DAY', desc: 'Nothing is happening. The clock runs 20% slower and creatures are lazy. Scrap -10%.', timeMul: 0.8, valueMul: 0.9, dangerMul: 0.9, mood: 'good', w: 0.9,
    tr: ['DURGUN HABER GÜNÜ', 'Hiçbir şey olmuyor. Saat %20 yavaş, yaratıklar tembel. Hurda -%10.'] },
  { id: 'nightshift', name: 'NIGHT SHIFT', desc: 'The autopilot lands at 15:00. Less daylight, +45% scrap value.', startTime: 900, valueMul: 1.45, dangerMul: 1.08, mood: 'bad', w: 0.8,
    tr: ['GECE VARDİYASI', 'Otopilot 15:00\'te iner. Daha az gün ışığı, hurda +%45 değerli.'] },
  { id: 'supplydrop', name: 'SPONSORED DROP', desc: 'A sponsor is air-dropping content near the ship every ~90 s. Grab it before it rots.', drops: 90, mood: 'good', w: 0.9,
    tr: ['SPONSORLU DÜŞÜŞ', 'Bir sponsor her ~90 sn geminin yakınına içerik atıyor. Çürümeden kap.'] },
  { id: 'toxic', name: 'TOXIC COMMENTS', desc: 'Elite creatures are far more common. Clout rewards +25%, scrap +10%.', eliteAdd: 0.15, coinMul: 1.25, valueMul: 1.1, dangerMul: 1.1, mood: 'bad', w: 0.9,
    tr: ['TOKSİK YORUMLAR', 'Elit yaratıklar çok daha yaygın. Clout ödülleri +%25, hurda +%10.'] },
  { id: 'uplink', name: 'SATELLITE UPLINK', desc: 'A clean signal: scanner range +60% and batteries last 30% longer.', scanMul: 1.6, batteryMul: 1.3, mood: 'good', w: 0.9,
    tr: ['UYDU BAĞLANTISI', 'Temiz sinyal: tarama menzili +%60, piller %30 daha uzun dayanır.'] },
];
export const DAILY_BY_ID = Object.fromEntries(DAILY_EVENTS.map((e) => [e.id, e]));
// Turkish names / descriptions for UI code that runs strings through t() (HUD, objectives)
addTranslations(Object.fromEntries(DAILY_EVENTS.flatMap((e) => (e.tr ? [[e.name, e.tr[0]], [e.desc, e.tr[1]]] : []))));

const MUL_KEYS = ['valueMul', 'dangerMul', 'outdoorMul', 'xpMul', 'coinMul', 'hpMul', 'meleeMul', 'jumpMul', 'speedMul', 'staminaMul', 'scanMul', 'batteryMul', 'timeMul'];
const ADD_KEYS = ['swarm', 'killCoin', 'extraScrap', 'cache', 'eliteAdd'];
const MIN_KEYS = ['migrate', 'drops'];        // shortest interval wins
const MAX_KEYS = ['startTime'];

/** Plain-data copy of an event (no roll weight). */
function toRun(e) {
  const { w, ...rest } = e;
  void w;
  return { ...rest };
}

export function dailyEventFor(seed, day, moonId) {
  let h = (seed ^ Math.imul(day + 17, 0x45d9f3b) ^ hash(moonId)) | 0;
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  let tot = 0;
  for (const e of DAILY_EVENTS) tot += e.w || 1;
  let r = ((h >>> 0) / 4294967296) * tot;
  for (const e of DAILY_EVENTS) { r -= e.w || 1; if (r < 0) return toRun(e); }
  return toRun(DAILY_EVENTS[DAILY_EVENTS.length - 1]);
}

/** Merge extra mutators (weekly challenge) into a day event. Multipliers multiply, counts add, intervals take the min. */
export function combineEvents(base, extras, label = 'WEEKLY') {
  const out = { ...(base || { id: 'normal', name: 'NORMAL FEED', desc: '' }) };
  const list = (extras || []).filter(Boolean);
  if (!list.length) return out;
  for (const x of list) {
    for (const k of MUL_KEYS) if (typeof x[k] === 'number') out[k] = (typeof out[k] === 'number' ? out[k] : 1) * x[k];
    for (const k of ADD_KEYS) if (typeof x[k] === 'number') out[k] = (out[k] || 0) + x[k];
    for (const k of MIN_KEYS) if (typeof x[k] === 'number') out[k] = out[k] ? Math.min(out[k], x[k]) : x[k];
    for (const k of MAX_KEYS) if (typeof x[k] === 'number') out[k] = Math.max(out[k] || 0, x[k]);
    if (x.blackout) out.blackout = true;
  }
  out.name = `${out.name} + ${label}`;
  out.desc = `${out.desc} ${label}: ${list.map((x) => x.name).join(', ')}.`.trim();
  out.weekly = true;
  if (list.some((x) => x.mood === 'bad')) out.mood = out.mood === 'good' ? 'mixed' : (out.mood || 'bad');
  return out;
}

/** Human summary lines of an event's numbers (terminal EVENTS / panels). */
export function eventEffects(e) {
  if (!e) return [];
  const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
  const out = [];
  if (e.valueMul && e.valueMul !== 1) out.push(`scrap ${pct(e.valueMul)}`);
  if (e.dangerMul && e.dangerMul !== 1) out.push(`danger ${pct(e.dangerMul)}`);
  if (e.outdoorMul) out.push(`outdoor loot ${pct(e.outdoorMul)}`);
  if (e.xpMul) out.push(`XP ${pct(e.xpMul)}`);
  if (e.coinMul) out.push(`Clout ${pct(e.coinMul)}`);
  if (e.hpMul) out.push(`max HP ${pct(e.hpMul)}`);
  if (e.meleeMul) out.push(`melee ${pct(e.meleeMul)}`);
  if (e.jumpMul) out.push(`jump ${pct(e.jumpMul)}`);
  if (e.speedMul) out.push(`speed ${pct(e.speedMul)}`);
  if (e.staminaMul) out.push(`stamina regen ${pct(e.staminaMul)}`);
  if (e.scanMul) out.push(`scan range ${pct(e.scanMul)}`);
  if (e.batteryMul) out.push(`battery ${pct(e.batteryMul)}`);
  if (e.timeMul) out.push(`clock ${pct(e.timeMul)}`);
  if (e.startTime) out.push(`lands at ${String(Math.floor(e.startTime / 60)).padStart(2, '0')}:00`);
  if (e.blackout) out.push('starts dark');
  if (e.swarm) out.push(`+${e.swarm} bot packs`);
  if (e.killCoin) out.push(`◈${e.killCoin}/kill`);
  if (e.extraScrap) out.push(`+${Math.round(e.extraScrap * 100)}% scrap count`);
  if (e.cache) out.push(`${e.cache} golden caches`);
  if (e.eliteAdd) out.push(`elites +${Math.round(e.eliteAdd * 100)}%`);
  if (e.migrate) out.push(`scrap moves every ${e.migrate}s`);
  if (e.drops) out.push(`air drops every ${e.drops}s`);
  return out;
}

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h | 0;
}

// ------------------------------------------------------------------ runtime (stats layer + host effects)
/**
 * Instance-level method wrap (meta-layer helper, also used by collection / weekly / crew). make(orig) returns the
 * wrapper; the returned restore() puts the previous own property back (or deletes ours) unless someone wrapped
 * on top of us in the meantime.
 */
export function wrapMethod(obj, name, make) {
  if (!obj || typeof obj[name] !== 'function') return () => {};
  const hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
  const orig = obj[name];
  const w = make(orig);
  obj[name] = w;
  return () => {
    if (obj[name] !== w) return;
    if (hadOwn) obj[name] = orig; else delete obj[name];
  };
}
const ON_MOON = new Set(['moon']);
const INDOOR_Y = -260;          // FACILITY_Y (-300) + 40: the same indoor test Game.update uses
const STAT_PHASES = new Set(['landing', 'moon']);
const DROP_TYPES = ['goldbar', 'ring', 'figurine', 'trophy', 'perfume', 'register', 'robot', 'tv', 'painting'];

/** The event that currently affects play (only while on a moon). */
export function activeEvent(game) {
  const run = game?.run;
  return run && ON_MOON.has(run.phase) ? run.dailyEvent || null : null;
}

/**
 * Install the daily-event runtime on a Game. Uses only mod events ('phase', 'update', 'stats', 'moonPopulated')
 * plus instance-level wraps of rollElite / hostOnCreatureKilled, so host.js keeps its original flow.
 */
export function installDailyEvents(game) {
  const mods = game.mods;
  const offs = [];
  const restores = [];
  const st = { disposed: false, migrateT: 0, dropT: 0, phase: null, lastKey: '' };

  const wrap = (name, make) => restores.push(wrapMethod(game, name, make));
  // more elites (instance wrap over the prototype method; removed on dispose)
  wrap('rollElite', (orig) => function (...a) {
    const r = orig.apply(this, a);
    const ev = activeEvent(game);
    return r || (!!ev?.eliteAdd && Math.random() < ev.eliteAdd);
  });
  // Bot Swarm bounty: extra Clout for the killer
  wrap('hostOnCreatureKilled', (orig) => function (c, by, ...a) {
    const r = orig.call(this, c, by, ...a);
    const ev = activeEvent(game);
    if (!st.disposed && ev?.killCoin && by && game.aiPlayerById?.(by) && !c?.def?.hazard) {
      game.net?.broadcast('xp', { to: by, xp: 0, coin: Math.round(ev.killCoin), reason: `${ev.name || 'Event'} bounty` });
    }
    return r;
  });

  const refresh = () => {
    game.refreshStats?.();
    const p = game.player;
    if (p && !p.dead) {
      const s = game.stats;
      if (s && p.hp > s.maxHp) p.hp = s.maxHp;
    }
  };

  if (mods?.on) {
    // stat layer (every peer): only while landing / on the moon
    offs.push(mods.on('stats', (s, g) => {
      if (g && g !== game) return;
      const run = game.run;
      const ev = run && STAT_PHASES.has(run.phase) ? run.dailyEvent : null;
      if (!ev) return;
      if (ev.hpMul) s.maxHp = Math.max(20, Math.round(s.maxHp * ev.hpMul));
      if (ev.meleeMul) s.meleeMul *= ev.meleeMul;
      if (ev.jumpMul) s.jumpMul = (s.jumpMul || 1) * ev.jumpMul;
      if (ev.speedMul) s.speedMul *= ev.speedMul;
      if (ev.staminaMul) s.staminaRegen *= ev.staminaMul;
      if (ev.scanMul) s.scanRange = Math.round(s.scanRange * ev.scanMul);
      if (ev.batteryMul) s.batteryMul *= ev.batteryMul;
    }));
    offs.push(mods.on('phase', (ph, g) => {
      if (g && g !== game) return;
      st.phase = ph;
      refresh();
      if (!game.isHost || !game.run) return;
      const run = game.run;
      // (clients get run.dailyEvent with the 'landing' phase packet from hostLever)
      if (ph === 'moon') {
        const ev = run.dailyEvent;
        st.migrateT = ev?.migrate || 0;
        st.dropT = ev?.drops ? Math.min(40, ev.drops) : 0;
        if (ev?.startTime && run.time < ev.startTime) { run.time = ev.startTime; game.broadcastRun?.(['time']); }
      }
    }));
    offs.push(mods.on('moonPopulated', (g) => {
      if ((g && g !== game) || !game.isHost) return;
      try { hostPopulateExtras(game); } catch (e) { console.warn('[dailyEvents] populate', e); }
    }));
    offs.push(mods.on('update', (dt, g) => {
      if ((g && g !== game) || st.disposed) return;
      // late joiners / gs updates: keep the stat layer in sync with the current event
      const key = (game.run?.phase || '') + ':' + (game.run?.dailyEvent?.id || '') + ':' + (game.run?.dailyEvent?.weekly ? 1 : 0);
      if (key !== st.lastKey) { st.lastKey = key; refresh(); }
      if (game.isHost) hostTick(dt);
    }));
  }

  function hostTick(dt) {
    const run = game.run;
    const ev = activeEvent(game);
    if (!ev || !run || run.phase !== 'moon') return;
    if (ev.timeMul && ev.timeMul !== 1) {
      const rate = (16 * 60) / (game.config?.dayLengthSec || 720);
      run.time = Math.min(24 * 60 - 1.5, run.time + dt * rate * (ev.timeMul - 1));
    }
    if (ev.migrate) {
      st.migrateT -= dt;
      if (st.migrateT <= 0) { st.migrateT = ev.migrate * (0.85 + Math.random() * 0.3); hostMigrate(game); }
    }
    if (ev.drops) {
      st.dropT -= dt;
      if (st.dropT <= 0 && run.time < 22 * 60) { st.dropT = ev.drops * (0.8 + Math.random() * 0.4); hostSupplyDrop(game); }
    }
  }

  return {
    get active() { return activeEvent(game); },
    refresh,
    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      for (const r of restores) { try { r(); } catch { /* ignore */ } }
    },
  };
}

function valueMulFor(game, ev) {
  const run = game.run;
  const moon = MOONS[run.moon] || {};
  const weather = { stormy: 1.2, eclipsed: 1.3, foggy: 1.1, rainy: 1.05 }[run.weather] || 1;
  return (moon.scrapMul || 1) * scrapValueMul(run.quotaIndex || 0) * weather * (ev?.valueMul || 1);
}
function scrapTableFor(game) {
  const moon = MOONS[game.run.moon] || {};
  const t = SCRAP_TABLE[moon.interior] || SCRAP_TABLE.factory;
  return t.map(([id, w]) => ({ id, w }));
}
function pickWeighted(list) {
  let tot = 0; for (const e of list) tot += e.w;
  let r = Math.random() * tot;
  for (const e of list) { r -= e.w; if (r <= 0) return e.id; }
  return list[0]?.id;
}

// host: extra scrap / golden caches / bot packs right after the moon was populated
function hostPopulateExtras(game) {
  const ev = game.run?.dailyEvent;
  const fac = game.world?.facility;
  if (!ev || !fac) return;
  const vm = valueMulFor(game, ev);
  const occupied = (s) => { for (const it of game.items.all()) if (it.state === 'world' && it.obj.position.distanceToSquared(new THREE.Vector3(s.x, s.y + 0.5, s.z)) < 0.36) return true; return false; };
  if (ev.extraScrap) {
    const table = scrapTableFor(game);
    const free = (fac.scrapSpots || []).filter((s) => !s.elevated && !occupied(s));
    const n = Math.min(free.length, Math.round((fac.scrapSpots || []).length * 0.35 * ev.extraScrap) + 2);
    for (let i = 0; i < n; i++) {
      const s = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      if (s) game.items.hostSpawn(pickWeighted(table), new THREE.Vector3(s.x, s.y + 0.5, s.z), { valueMul: vm });
    }
  }
  if (ev.cache) {
    const deep = (fac.scrapSpots || []).filter((s) => !s.elevated).sort((a, b) => (b.dist || 0) - (a.dist || 0));
    const pool = deep.slice(0, Math.max(ev.cache * 3, 6));
    for (let i = 0; i < ev.cache && pool.length; i++) {
      const s = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const t = i % 2 ? 'trophy' : 'goldbar';
      game.items.hostSpawn(t, new THREE.Vector3(s.x, s.y + 0.55, s.z), { valueMul: vm * 2.2, label: `Cursed ${ITEMS[t]?.name || 'Archive'}` });
    }
  }
  if (ev.swarm) for (let i = 0; i < ev.swarm; i++) game.hostSpawnCreatureIndoor?.('scuttler');
}

// host: SERVER MIGRATION — loose facility scrap jumps to other rooms
function hostMigrate(game) {
  const fac = game.world?.facility;
  if (!fac?.scrapSpots?.length) return;
  const players = game.aiPlayers?.() || [];
  const loose = [];
  for (const it of game.items.all()) {
    if (it.state !== 'world' || it.holder || it.owner || it.carrier || it.collected || it.soulbound || it.type === 'body' || !isSellable(it.def) || it.def.kind === 'big') continue;
    const p = it.obj.position;
    if (p.y > INDOOR_Y || insideShip(p)) continue;
    if (players.some((q) => !q.dead && q.pos.distanceTo(p) < 7)) continue;   // never yank it out of someone's hands/face
    loose.push(it);
  }
  if (!loose.length) return;
  const n = Math.min(loose.length, 2 + Math.floor(Math.random() * 3));
  for (let i = 0; i < n; i++) {
    const it = loose.splice(Math.floor(Math.random() * loose.length), 1)[0];
    const s = fac.scrapSpots[Math.floor(Math.random() * fac.scrapSpots.length)];
    if (!s || s.elevated) continue;
    const from = it.obj.position;
    game.net.broadcast('fx', { k: 'snd', s: 'spark', p: [from.x, from.y + 0.3, from.z], v: 0.6 });
    game.net.broadcast('it', { e: 'drop', id: it.id, p: [s.x, s.y + 0.5, s.z], q: [0, 0, 0, 1] });
  }
  game.net.broadcast('sys', { text: 'SERVER MIGRATION: some content has been moved to another room.', kind: 'info' });
}

// host: SPONSORED DROP — a valuable falls from the sky near the ship
function hostSupplyDrop(game) {
  const terrain = game.world?.terrain;
  if (!terrain) return;
  let x = 0, z = 20;
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 20;
    x = Math.cos(a) * d; z = 18 + Math.sin(a) * d;
    if (!insideShip({ x, y: 1, z }, 4)) break;
  }
  const y = (terrain.heightAt?.(x, z) ?? 0) + 14;
  const type = DROP_TYPES[Math.floor(Math.random() * DROP_TYPES.length)];
  game.items.hostSpawn(type, new THREE.Vector3(x, y, z), { valueMul: valueMulFor(game, game.run.dailyEvent) * 1.1, label: `Sponsored ${ITEMS[type]?.name || 'Drop'}`, linvel: [0, -4, 0] });
  game.net.broadcast('fx', { k: 'snd', s: 'ship_thrusters', p: [x, y, z], v: 0.6, r: 12, m: 160 });
  game.net.broadcast('sys', { text: 'SPONSORED DROP: a package landed near the ship!', kind: 'good' });
}
