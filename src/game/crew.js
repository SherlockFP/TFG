// CREW identity (guild-like): the lobby host's crew name + tag + level is shared with everyone in the session
// (run.crew), shown on name tags ("[TAG] ★2 Title"), in the lobby browser and in the Service Record.
// Crew XP is earned by the host's sessions: days survived, scrap sold, quotas met. Every member gets +1% XP per
// crew level (max +25%, applied by Progress.xpMultiplier). The crew lives on the host's profile (profile.crew).
import { hashString } from '../core/rng.js';
import { setTitleDecor } from './achievements.js';
import { wrapMethod } from './dailyEvents.js';
import { unlockEmote } from './emotes.js';
import { MOONS } from './moons.js';

export const CREW_MAX_LEVEL = 50;
/** Crew XP needed to go from crew level L to L+1. */
export function crewXpFor(level) { return Math.round(250 * Math.pow(Math.max(1, level), 1.3)); }
/** { level, into, need } for a total crew XP. */
export function crewLevelOf(xp) {
  let lv = 1, left = Math.max(0, Math.floor(Number(xp) || 0));
  while (lv < CREW_MAX_LEVEL && left >= crewXpFor(lv)) { left -= crewXpFor(lv); lv += 1; }
  return { level: lv, into: left, need: crewXpFor(lv) };
}

const ADJ = ['Dead Link', 'Night Shift', '404', 'Buffering', 'Lag Spike', 'Clickbait', 'Offline', 'Ratio', 'Glitch', 'Pixel', 'Doomscroll', 'Low Ping', 'Cursed', 'Unverified', 'Shadowban', 'Null Pointer'];
const NOUN = ['Syndicate', 'Collective', 'Janitors', 'Union', 'Cartel', 'Guild', 'Society', 'Division', 'Brigade', 'Salvage Co.', 'Crew', 'Unit'];
/** Deterministic starter crew name for a profile id. */
export function defaultCrewName(seedStr) {
  const h = hashString('crew:' + (seedStr || 'x'));
  return `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
}
export function tagFromName(name) {
  const words = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let t = words.map((w) => w[0]).join('').slice(0, 4);
  if (t.length < 2 && words[0]) t = words[0].slice(0, 3);
  return t || 'TFG';
}
export const cleanCrewName = (s) => String(s || '').replace(/[\u0000-\u001f<>[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
export const cleanTag = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export function ensureCrewProfile(p) {
  if (!p) return p;
  const c = p.crew && typeof p.crew === 'object' ? p.crew : (p.crew = {});
  if (!c.name) c.name = defaultCrewName(p.id);
  c.name = cleanCrewName(c.name) || defaultCrewName(p.id);
  c.tag = cleanTag(c.tag) || tagFromName(c.name);
  if (typeof c.xp !== 'number' || !isFinite(c.xp) || c.xp < 0) c.xp = 0;
  if (!c.founded) c.founded = Date.now();
  if (!c.members || typeof c.members !== 'object') c.members = {};
  if (typeof c.days !== 'number') c.days = 0;
  if (typeof c.quotas !== 'number') c.quotas = 0;
  return p;
}
/** The shared (network) view of a crew. */
export function publicCrew(c) {
  const lv = crewLevelOf(c.xp);
  return { name: cleanCrewName(c.name), tag: cleanTag(c.tag), level: lv.level, xp: Math.floor(c.xp), into: lv.into, need: lv.need, members: Object.keys(c.members || {}).length, quotas: c.quotas || 0 };
}

export function installCrew(game) {
  const p = ensureCrewProfile(game.profile);
  const st = { disposed: false, lastSig: '', pollT: 0 };
  const offs = [];
  const restores = [];
  const save = () => game.progress?.save?.();

  const pushCrew = () => {
    if (!game.isHost || !game.run) return;
    game.run.crew = publicCrew(p.crew);
    game.broadcastRun?.(['crew']);
  };
  /** Host: add crew XP (level-ups are announced to the lobby). */
  function addXp(n, why) {
    if (!game.isHost || !(n > 0)) return;
    const before = crewLevelOf(p.crew.xp).level;
    p.crew.xp += Math.round(n);
    const after = crewLevelOf(p.crew.xp).level;
    save();
    pushCrew();
    if (after > before) {
      game.net?.broadcast('sys', { text: `CREW LEVEL UP! ${p.crew.name} is now crew level ${after} (+${Math.min(25, after)}% XP for every member).`, kind: 'good' });
      game.net?.broadcast('fx', { k: 'snd', s: 'ui_quota_met', p: [0, 1.5, 0], v: 0.7 });
    }
    void why;
  }
  function rename(name, tag) {
    if (!game.isHost && game.net) return 'Only the lobby host can rename the crew (the crew belongs to the host).';
    const n = cleanCrewName(name);
    if (name !== undefined && n.length < 3) return 'Crew name: 3-24 characters.';
    if (name !== undefined) { p.crew.name = n; if (tag === undefined) p.crew.tag = tagFromName(n); }
    if (tag !== undefined) { const t = cleanTag(tag); if (t.length < 2) return 'Crew tag: 2-4 letters/digits.'; p.crew.tag = t; }
    save();
    pushCrew();
    if (game.net && game.isHost) { game.net.broadcast('sys', { text: `The crew is now [${p.crew.tag}] ${p.crew.name}.`, kind: 'info' }); game.hostAnnounce?.(); }
    return '';
  }

  // host XP sources (instance wraps; sell results + quota evaluation + day end all run on the host)
  restores.push(wrapMethod(game, 'onSellResult', (orig) => function (d, ...a) {
    const r = orig.call(this, d, ...a);
    if (!st.disposed && game.isHost && d && !d.pending && d.total > 0) addXp(d.total * 0.08, 'sell');
    return r;
  }));
  restores.push(wrapMethod(game, 'hostEvaluateQuota', (orig) => function (...a) {
    const qi = game.run?.quotaIndex || 0;
    const r = orig.apply(this, a);
    if (!st.disposed && (game.run?.quotaIndex || 0) > qi) { p.crew.quotas += 1; addXp(150 + 60 * game.run.quotaIndex, 'quota'); }
    return r;
  }));
  restores.push(wrapMethod(game, 'hostFinishTakeoff', (orig) => function (...a) {
    const run = game.run;
    const day = run?.day;
    const onMoon = run && !MOONS[run.moon]?.company;
    const r = orig.apply(this, a);
    if (!st.disposed && onMoon && run.day > day) {
      p.crew.days += 1;
      const players = game.aiPlayers?.() || [];
      for (const q of players) {
        const pid = q.id === game.selfId ? game.profile.id : (game.net?.players.get(q.id)?.pid || q.id);
        const m = p.crew.members[pid] || (p.crew.members[pid] = { name: '', days: 0 });
        m.name = String(game.playerName(q.id) || '').slice(0, 18);
        m.days = (m.days || 0) + 1;
        m.last = Date.now();
      }
      const ids = Object.keys(p.crew.members);
      if (ids.length > 40) { ids.sort((x, y) => (p.crew.members[x].last || 0) - (p.crew.members[y].last || 0)); for (const id of ids.slice(0, ids.length - 40)) delete p.crew.members[id]; }
      addXp(40 + 15 * players.length, 'day');
    }
    return r;
  }));

  // lobby browser info (the App forwards 'announce' to the lobby directory; this listener runs first)
  offs.push(game.on('announce', (info) => {
    if (!info || !game.isHost) return;
    const c = publicCrew(p.crew);
    info.crew = c.name; info.crewTag = c.tag; info.crewLv = c.level;
    info.stars = game.profile?.prestige?.stars || 0;
  }));

  const mods = game.mods;
  if (mods?.on) {
    offs.push(mods.on('hostStart', (g) => { if (!g || g === game) pushCrew(); }));
    // name tags: the lobby crew tag goes in front of everyone's title; resend pinfo when it changes
    offs.push(mods.on('update', (dt, g) => {
      if ((g && g !== game) || st.disposed) return;
      st.pollT -= dt;
      if (st.pollT > 0) return;
      st.pollT = 1;
      const c = game.run?.crew;
      const sig = c ? `${c.tag}|${c.level}` : '';
      if (sig === st.lastSig) return;
      st.lastSig = sig;
      if (setTitleDecor({ crewTag: c?.tag || '' }) && game.net) {
        try { const hd = game.helloData(); game.net.helloData = hd; game.net.send('pinfo', hd); } catch { /* ignore */ }
      }
      if (c) {
        const s = game.profile.stats || (game.profile.stats = {});
        const lv = Math.max(1, Math.min(CREW_MAX_LEVEL, c.level | 0));
        if (lv > (s.bestCrewLevel || 0)) { s.bestCrewLevel = lv; save(); }
        if (lv >= 5 && unlockEmote(game.profile, 'rally')) { save(); game.ui?.toast?.('Emote unlocked: Rally the Crew (hold B)', 'good'); }
      }
    }));
  }

  return {
    get crew() { return p.crew; },
    get shared() { return game.run?.crew || null; },
    rename, addXp, pushCrew,
    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      for (const r of restores) { try { r(); } catch { /* ignore */ } }
      setTitleDecor({ crewTag: '' });
    },
  };
}
