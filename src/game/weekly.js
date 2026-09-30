// WEEKLY CHALLENGE: one fixed seed per ISO week. A host starts it on a fresh run (terminal WEEKLY START or the
// Service Record panel); from then on every landing uses a seed derived from (week, day, moon), so every crew in
// the world that week fights the same facilities, plus 3 weekly mutators (daily-event vocabulary, merged into
// run.dailyEvent) and a featured moon (+25% scrap). Score = scrap sold during the run.
//
// Leaderboard: stored locally per week (profile.weekly.boards[key]); shared with the lobby through the host
// ('wkboard' host -> peers, 'wkpost' peer -> host), so a crew sees each other's best runs.
import { RNG, hashString } from '../core/rng.js';
import { MOONS, MOON_ORDER } from './moons.js';
import { dailyEventFor, combineEvents, wrapMethod } from './dailyEvents.js';
import { tf, sysMsg } from '../core/i18n.js';

const DAY = 86400000;
const BOARD_SIZE = 10;
const KEEP_WEEKS = 8;

export const WEEKLY_MODS = [
  { id: 'glass', name: 'Glass Cannon', desc: '-30% max health, +35% melee damage.', hpMul: 0.7, meleeMul: 1.35, mood: 'bad' },
  { id: 'greed', name: 'Greed Is Good', desc: 'Scrap +20%, creatures +15%.', valueMul: 1.2, dangerMul: 1.15, mood: 'mixed' },
  { id: 'night', name: 'Graveyard Shift', desc: 'Every landing starts at 13:00. Scrap +15%.', startTime: 780, valueMul: 1.15, mood: 'bad' },
  { id: 'infest', name: 'Infestation', desc: 'Two extra bot packs per landing, ◈3 per kill.', swarm: 2, killCoin: 3, dangerMul: 1.1, mood: 'mixed' },
  { id: 'moon', name: 'Moon Boots', desc: 'Jump +35%.', jumpMul: 1.35, mood: 'good' },
  { id: 'dark', name: 'Rolling Blackouts', desc: 'Facilities start without power. Scrap +10%.', blackout: true, valueMul: 1.1, mood: 'bad' },
  { id: 'energy', name: 'Energy Drink Sponsor', desc: 'Stamina regen +60%.', staminaMul: 1.6, mood: 'good' },
  { id: 'fragile', name: 'Fragile Economy', desc: 'Scrap +30%, max health -15%.', valueMul: 1.3, hpMul: 0.85, mood: 'mixed' },
  { id: 'deadline', name: 'Crunch Time', desc: 'The clock runs 20% faster. Scrap +20%.', timeMul: 1.2, valueMul: 1.2, mood: 'bad' },
  { id: 'uplink', name: 'Clear Signal', desc: 'Scan range +50%.', scanMul: 1.5, mood: 'good' },
  { id: 'elite', name: 'Elite Queue', desc: 'Elites +10%. Followers +20%.', eliteAdd: 0.1, coinMul: 1.2, mood: 'bad' },
  { id: 'drops', name: 'Sponsored Week', desc: 'Air drops near the ship every ~2 min.', drops: 120, mood: 'good' },
];
const MOD_BY_ID = Object.fromEntries(WEEKLY_MODS.map((m) => [m.id, m]));

/** ISO-8601 week of a timestamp (UTC). */
export function isoWeek(ms = Date.now()) {
  const d = new Date(ms);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7;             // Monday = 0
  const monday = t - dow * DAY;
  const thursday = monday + 3 * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const week = 1 + Math.round((monday - week1) / (7 * DAY));
  return { year, week, key: `${year}-W${String(week).padStart(2, '0')}`, startsAt: monday, endsAt: monday + 7 * DAY };
}

/** The deterministic weekly spec for a week key: seed, 3 mutators, featured moon. */
export function weeklySpec(key = isoWeek().key) {
  const seed = hashString('tfg-weekly:' + key);
  const r = new RNG(seed);
  const pool = r.shuffle(WEEKLY_MODS.map((m) => m.id));
  const mods = [];
  for (const id of pool) {
    if (mods.length >= 3) break;
    // keep it winnable: at most one health cut per week
    if ((id === 'glass' || id === 'fragile') && mods.some((x) => x === 'glass' || x === 'fragile')) continue;
    mods.push(id);
  }
  const moons = MOON_ORDER.filter((id) => MOONS[id] && !MOONS[id].company && ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'].includes(id));
  const featured = moons.length ? moons[r.int(0, moons.length - 1)] : null;
  return { key, seed, mods, featured };
}
export const weeklyMods = (ids) => (ids || []).map((id) => MOD_BY_ID[id]).filter(Boolean);
/** Landing seed for a weekly run: identical for every crew that week (same day + moon => same world). */
export function weeklyDaySeed(key, day, moon) { return hashString(`${key}|${day | 0}|${moon}`) % 1000000000; }

// ------------------------------------------------------------------ leaderboard (profile.weekly)
export function ensureWeeklyProfile(p) {
  if (!p) return p;
  const w = p.weekly && typeof p.weekly === 'object' ? p.weekly : (p.weekly = {});
  if (!w.boards || typeof w.boards !== 'object') w.boards = {};
  if (!w.best || typeof w.best !== 'object') w.best = {};
  if (typeof w.runs !== 'number') w.runs = 0;
  if (typeof w.quotas !== 'number') w.quotas = 0;
  return p;
}
const clampInt = (v, lo, hi) => { const x = Math.floor(Number(v)); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; };
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
/** Sanitize a leaderboard entry (network input). */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const rid = str(e.rid, 32);
  if (!rid) return null;
  return {
    rid, score: clampInt(e.score, 0, 1e8), quotas: clampInt(e.quotas, 0, 999), days: clampInt(e.days, 0, 9999),
    crew: str(e.crew, 24), names: (Array.isArray(e.names) ? e.names : []).slice(0, 6).map((x) => str(x, 18)).filter(Boolean),
    at: clampInt(e.at, 0, 4e12), fin: e.fin ? 1 : 0,
  };
}
/** Merge entries into a week board (dedupe by run id, keep the best score, top BOARD_SIZE). Returns the board. */
export function mergeBoard(p, key, entries) {
  ensureWeeklyProfile(p);
  const b = new Map((p.weekly.boards[key] || []).map((e) => [e.rid, e]));
  for (const raw of entries || []) {
    const e = cleanEntry(raw);
    if (!e) continue;
    const cur = b.get(e.rid);
    if (!cur || e.score > cur.score || (e.score === cur.score && (e.quotas > cur.quotas || e.fin > cur.fin))) b.set(e.rid, e);
  }
  const list = [...b.values()].sort((x, y) => y.score - x.score || y.quotas - x.quotas || x.at - y.at).slice(0, BOARD_SIZE);
  p.weekly.boards[key] = list;
  // prune old weeks
  const keys = Object.keys(p.weekly.boards).sort();
  while (keys.length > KEEP_WEEKS) delete p.weekly.boards[keys.shift()];
  return list;
}

// ------------------------------------------------------------------ runtime
export function installWeekly(game) {
  const p = ensureWeeklyProfile(game.profile);
  const st = { disposed: false, sig: '', posted: false, pollT: 0 };
  const offs = [];
  const restores = [];
  const save = () => game.progress?.save?.();
  const run = () => game.run;
  const isHostMsg = (from) => !game.net || from === game.net.hostId || from === game.selfId;

  function crewNames() { return [game.profile.name, ...[...(game.remotes?.values() || [])].map((r) => r.name)].slice(0, 6); }
  function myEntries(key, n = 5) { return (p.weekly.boards[key] || []).slice(0, n); }

  /** Why the weekly cannot be started now ('' = OK). */
  function startBlock() {
    const r = run();
    if (!r) return 'Not in a session.';
    if (!game.isHost) return 'Only the host can start the Weekly Challenge.';
    if (r.weekly) return 'This run is already a Weekly Challenge.';
    if (r.phase !== 'orbit') return 'Start it from orbit.';
    if ((r.day || 1) !== 1 || (r.quotaIndex || 0) !== 0 || (r.sold || 0) !== 0) return 'Only a fresh run (day 1, nothing sold) can become a Weekly Challenge. Get deplatformed or use a new save slot.';
    return '';
  }
  /** Host: turn the current fresh run into this week's challenge. */
  function hostStart() {
    const why = startBlock();
    if (why) return why;
    const spec = weeklySpec();
    const r = run();
    r.weekly = { key: spec.key, seed: spec.seed, mods: spec.mods, featured: spec.featured, score: 0, quotas: 0, startedAt: Date.now() };
    if (spec.featured && MOONS[spec.featured]) r.moon = spec.featured;
    game.broadcastRun?.(['weekly', 'moon']);
    game.net?.broadcast('sys', sysMsg('WEEKLY CHALLENGE {key} STARTED: {n}. Featured moon: {n2}', { key: spec.key, n: weeklyMods(spec.mods).map((m) => m.name).join(' · '), n2: MOONS[spec.featured]?.name || '-' }, 'good'));
    game.hostSave?.();
    return '';
  }
  /** Host (hook in hostLever, right after the daily event roll): fixed seed + weekly mutators. */
  function hostOnLever(r) {
    const w = r?.weekly;
    if (!w?.key) return;
    r.seed = weeklyDaySeed(w.key, r.day, r.moon);
    if (MOONS[r.moon]?.company) { r.dailyEvent = null; return; }
    const extra = weeklyMods(w.mods);
    if (w.featured && r.moon === w.featured) extra.push({ id: 'featured', name: 'Featured Moon', valueMul: 1.25, mood: 'good' });
    r.dailyEvent = combineEvents(dailyEventFor(r.seed, r.day, r.moon), extra, 'WEEKLY');
  }

  // ---- host score tracking (instance wraps: sell results reach every peer, the host counts them)
  restores.push(wrapMethod(game, 'onSellResult', (orig) => function (d, ...a) {
    const res = orig.call(this, d, ...a);
    const r = run();
    if (!st.disposed && game.isHost && r?.weekly && d && !d.pending && d.total > 0) {
      r.weekly.score = (r.weekly.score || 0) + Math.round(d.total);
      game.broadcastRun?.(['weekly']);
    }
    return res;
  }));
  restores.push(wrapMethod(game, 'hostEvaluateQuota', (orig) => function (...a) {
    const r = run();
    const w = r?.weekly;
    const qi = r?.quotaIndex || 0;
    const res = orig.apply(this, a);
    if (!st.disposed && w) {
      if ((r.quotaIndex || 0) > qi && r.weekly === w) {
        w.quotas = r.quotaIndex;
        game.net?.broadcast('xp', { xp: 100 * r.quotaIndex, coin: 40 * r.quotaIndex, reason: 'Weekly challenge quota' });
        game.broadcastRun?.(['weekly']);
      } else if (r.phase === 'fired') {
        // the run ends: final entry (the fired handler replaces the run a few seconds later)
        w.fin = 1;
        game.broadcastRun?.(['weekly']);
      }
    }
    return res;
  }));

  // ---- every peer: keep my board entry for the current weekly run up to date
  function syncEntry() {
    const r = run();
    const w = r?.weekly;
    if (!w?.key) return;
    const sig = `${w.key}|${w.score}|${w.quotas}|${w.fin || 0}`;
    if (sig === st.sig) return;
    st.sig = sig;
    const rid = String(r.runId || ('r' + (w.startedAt || 0))) + ':' + w.key;
    const prevBest = p.weekly.best[w.key] || 0;
    mergeBoard(p, w.key, [{ rid, score: w.score || 0, quotas: w.quotas || 0, days: r.day || 1, crew: r.crew?.name || '', names: crewNames(), at: w.startedAt || Date.now(), fin: w.fin }]);
    if ((w.score || 0) > prevBest) {
      p.weekly.best[w.key] = w.score || 0;
      if (prevBest > 0 && (w.score || 0) >= prevBest * 1.05) game.ui?.toast?.(tf('New weekly personal best: ▮{score}', { score: w.score }), 'good');
    }
    p.weekly.quotas = Math.max(p.weekly.quotas || 0, w.quotas || 0);
    if (w.fin && !st.finCounted) { st.finCounted = true; p.weekly.runs = (p.weekly.runs || 0) + 1; }
    save();
  }

  // ---- lobby board sharing
  function onBoard(d, from) {
    if (st.disposed || !isHostMsg(from) || !d || typeof d.key !== 'string' || !/^\d{4}-W\d{2}$/.test(d.key)) return;
    mergeBoard(p, d.key, Array.isArray(d.entries) ? d.entries.slice(0, BOARD_SIZE) : []);
    save();
    if (!game.isHost && !st.posted && game.net) {
      st.posted = true;
      const mine = myEntries(d.key);
      if (mine.length) game.net.request('wkpost', { key: d.key, entries: mine });
    }
  }
  const mods = game.mods;
  if (mods?.on) {
    offs.push(mods.on('netReady', (net, g) => {
      if (g && g !== game) return;
      net.on_('wkboard', (d, from) => onBoard(d, from));
    }));
    offs.push(mods.on('registerHandlers', (H, g) => {
      if (g && g !== game) return;
      H('wkpost', (d) => {
        if (!d || typeof d.key !== 'string' || !/^\d{4}-W\d{2}$/.test(d.key)) return;
        const list = mergeBoard(p, d.key, Array.isArray(d.entries) ? d.entries.slice(0, 5) : []);
        save();
        game.net.broadcast('wkboard', { key: d.key, entries: list }, false);
      });
      H('wkstart', (d, from) => {
        if (from !== game.selfId) { game.net.sendTo(from, 'sys', sysMsg('Only the host can start the Weekly Challenge.', {}, 'bad')); return; }
        const why = hostStart();
        if (why) game.net.sendTo(from, 'sys', { text: why, kind: 'bad' });
      });
    }));
    offs.push(mods.on('playerJoin', (id, info, g) => {
      if ((g && g !== game) || !game.isHost) return;
      const key = run()?.weekly?.key || isoWeek().key;
      game.net.sendTo(id, 'wkboard', { key, entries: p.weekly.boards[key] || [] });
    }));
    offs.push(mods.on('update', (dt, g) => {
      if ((g && g !== game) || st.disposed) return;
      st.pollT -= dt;
      if (st.pollT > 0) return;
      st.pollT = 0.5;
      syncEntry();
    }));
  }

  return {
    spec: () => weeklySpec(),
    startBlock, hostStart, hostOnLever,
    /** Ask the host to start (works from any peer; only the host is accepted). */
    requestStart() { game.net?.request('wkstart', {}); },
    board: (key = run()?.weekly?.key || isoWeek().key) => p.weekly.boards[key] || [],
    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      for (const r of restores) { try { r(); } catch { /* ignore */ } }
    },
  };
}
