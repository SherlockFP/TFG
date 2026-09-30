// DOWNED (wave 8, docs/wave8/downed.md). Installed with `this.useModule('downed', installDowned)` (game.js).
// Owner decision: NO instant death by default. 0 HP = you go DOWN. A crewmate revives you (hold E, 3 s) or you bleed out; only then the old death flow runs
// (loot stays on the floor, spectator, ghost replay). True one-hit kills exist on HARD only (difficulty.js mode 'hard' -> this module does nothing).
//   pure    RULES / bleedSecs / DownBook (host state machine: bleed timers, revive progress, second-down penalty)  -> node-testable (tools/harness/downed.test.mjs)
//   local   game.damageLocal is wrapped: a lethal hit downs the player instead of game.die(). Downed = crawl (localplayer.downed), camera on the floor,
//           no items (game.localActions is skipped), muffled audio, red vignette, the usual low-HP heartbeat (hp is pinned to 1).
//   solo    nobody who could revive you: one self-revive per landing when a medkit / adrenaline is carried, else death exactly as before.
//   host    game.aiPlayers reports downed players as dead (creatures ignore them); bleed-out sends 'bleed' and the victim runs game.die(cause).
//   remote  ps flag 64 (game.js netSend) -> the avatar lies face-down (remoteAvatar hook); a world marker shows name / bleed time / revive ring to the crew.
// Net (prefix dn): 'dnreq' client -> host {k:'down'|'hold'|'stop'}; 'dn' host -> everyone {k:'on'|'pg'|'up'|'bleed'|'clear'|'say'}.
// Mods events (emitted on every peer): 'tfg:downed' {id, name, cause}, 'tfg:revived' {id, name, by, self}.
import * as THREE from 'three';
import { addTranslations, t, tf } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { getMode } from './difficulty.js';

// ------------------------------------------------------------------------------------------------ pure rules
export const RULES = Object.freeze({
  bleed: Object.freeze({ casual: 30, standard: 20, hard: 0 }),   // s until bleed-out; 0 = the feature is off (Hard: normal death)
  reviveS: 3,            // s a crewmate holds E
  reviveMedic: 0.6,      // reviver time multiplier for the Medic role (40 % faster)
  kitHp: 0.4,            // a medkit / adrenaline used on a downed crewmate stands them up at this fraction
  selfS: 6,              // solo: s holding E to get yourself up (once per landing)
  selfHp: 0.25,          // solo self stand-up HP fraction
  reviveHp: 0.3,         // fraction of max HP after a revive
  orbitHp: 0.5,          // downed players still lying there when the ship reaches orbit
  repeatWin: 60,         // s: a second down inside this window bleeds out ...
  repeatMul: 0.5,        // ... twice as fast (duration x this)
  range: 2.6,            // m: reviver reach (client prompt)
  hostRange: 3.6,        // m: host check (lag slack)
  grace: 0.7,            // s without a 'hold' packet = the reviver let go
  decay: 1.5,            // progress lost per second after they let go / were hit
  crawl: 0.9,            // m/s (localplayer.downed)
  sayGap: 90,            // s between two Algorithm lines
});
/** causes that cannot be revived from (no body / no floor) */
export const TRUE_DEATH = new Set(['void', 'left', 'ejected', 'sandkefal', 'giant']);
export const KITS = Object.freeze(['medkit', 'adrenaline']);   // solo self-revive items
export const bleedSecs = (mode) => RULES.bleed[mode] ?? RULES.bleed.standard;
/** does a hit of `dmg` at `hp` send the player down (true) or is it left to the old death path? */
export const shouldDown = (mode, cause, hp, dmg) => bleedSecs(mode) > 0 && !TRUE_DEATH.has(cause) && hp - dmg <= 0;

/** host book: who is down, how long they have left, revive progress. now = seconds on any monotonic clock. */
export class DownBook {
  constructor() { this.e = new Map(); this.last = new Map(); }
  /** a player went down. null = refused (already down / feature off) */
  down(id, now, mode, pos, cause) {
    const base = bleedSecs(mode);
    if (this.e.has(id) || !(base > 0)) return null;
    const prev = this.last.get(id);
    const fast = prev != null && now - prev < RULES.repeatWin;
    const dur = fast ? base * RULES.repeatMul : base;
    this.last.set(id, now);
    const e = { id, dur, left: dur, prog: 0, by: null, holdAt: -99, pos, cause: cause || 'down', fast };
    this.e.set(id, e);
    return e;
  }
  /** a crewmate holds E on `id` (called ~5x/s). returns the entry, {done:true} entry when the 3 s are full, or null (refused) */
  hold(id, by, now, dist, mul = 1) {
    const e = this.e.get(id);
    if (!e || by === id || this.e.has(by) || !(dist <= RULES.hostRange)) return null;
    if (e.by && e.by !== by && now - e.holdAt < RULES.grace) return null;   // one reviver at a time
    const dt = e.by === by ? Math.min(0.4, Math.max(0, now - e.holdAt)) : 0.1;
    e.by = by; e.holdAt = now; e.prog += dt / (mul > 0 ? mul : 1);
    if (e.prog >= RULES.reviveS) { this.e.delete(id); e.done = true; }
    return e;
  }
  /** the reviver was hit / let go */
  stop(id, by) { const e = this.e.get(id); if (e && e.by === by) { e.prog = 0; e.by = null; } return e || null; }
  /** advance the clock; returns the entries that bled out. Bleeding pauses while somebody holds E. */
  tick(dt, now) {
    const out = [];
    for (const e of this.e.values()) {
      const held = !!e.by && now - e.holdAt < RULES.grace;
      if (!held) { e.by = null; e.prog = Math.max(0, e.prog - dt * RULES.decay); e.left -= dt; }
      if (e.left <= 0) out.push(e);
    }
    for (const e of out) this.e.delete(e.id);
    return out;
  }
  clear(id) { if (id == null) { this.e.clear(); this.last.clear(); } else this.e.delete(id); }
}

// ------------------------------------------------------------------------------------------------ i18n
const TR = {
  'YOU ARE DOWN': 'YERE DÜŞTÜN', 'BLEEDING OUT': 'KANAMADAN ÖLÜYORSUN', 'Crawl to your crew. A crewmate can hold [E] on you to get you up.': 'Ekibine sürün. Bir ekip arkadaşı [E] basılı tutarak seni kaldırabilir.',
  'Nobody can reach you. Hold on.': 'Kimse sana ulaşamıyor. Dayan.',
  'Get up… hold [E]': 'Kalk… [E] basılı tut', 'The Algorithm notes you got up alone. Once.': 'Algoritma tek başına kalktığını not etti. Bir kez.',
  'HOLD [E] TO REVIVE': 'KALDIRMAK İÇİN [E] BASILI TUTUN', 'REVIVING': 'KALDIRILIYOR', 'DOWN': 'YERDE',
  '{name} is down! Hold [E] on them to revive.': '{name} yere düştü! Kaldırmak için [E] basılı tut.',
  '{by} revived {name}.': '{by}, {name} adlı oyuncuyu kaldırdı.', 'You were revived by {name}.': '{name} seni ayağa kaldırdı.',
  'You jabbed a {item}. Back on your feet.': '{item} kullandın. Ayaktasın.', 'You are back on your feet.': 'Ayaktasın.',
  'Revive interrupted.': 'Kaldırma yarıda kaldı.',
  '{name} is down. Chat is placing bets on the bleed-out.': '{name} yerde. Sohbet kanamadan ölme süresine bahis oynuyor.',
  '{name} got back up. Chat is disappointed. Then delighted.': '{name} tekrar ayakta. Sohbet hayal kırıklığına uğradı. Sonra çok sevindi.',
};
const RU = {
  'YOU ARE DOWN': 'ТЫ УПАЛ', 'BLEEDING OUT': 'ИСТЕКАЕШЬ КРОВЬЮ', 'Crawl to your crew. A crewmate can hold [E] on you to get you up.': 'Ползи к команде. Напарник может удержать [E] на тебе и поднять.',
  'Nobody can reach you. Hold on.': 'До тебя никто не добраться. Держись.',
  'Get up… hold [E]': 'Вставай… удерживай [E]', 'The Algorithm notes you got up alone. Once.': 'Алгоритм отметил, что ты встал сам. Один раз.',
  'HOLD [E] TO REVIVE': 'УДЕРЖИВАЙ [E], ЧТОБЫ ПОДНЯТЬ', 'REVIVING': 'ПОДНИМАЕМ', 'DOWN': 'ЛЕЖИТ',
  '{name} is down! Hold [E] on them to revive.': '{name} упал! Удерживай [E], чтобы поднять.',
  '{by} revived {name}.': '{by} поднял {name}.', 'You were revived by {name}.': '{name} поднял тебя.',
  'You jabbed a {item}. Back on your feet.': 'Ты использовал {item}. Снова на ногах.', 'You are back on your feet.': 'Ты снова на ногах.',
  'Revive interrupted.': 'Подъём прерван.',
  '{name} is down. Chat is placing bets on the bleed-out.': '{name} лежит. Чат делает ставки на время до конца.',
  '{name} got back up. Chat is disappointed. Then delighted.': '{name} снова на ногах. Чат разочарован. Потом в восторге.',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

const CSS = `.dn-bar{background:#12130d;border:2px solid #ff4a3a;color:#ffe9d0;font:700 15px/1.2 'Bahnschrift','Arial Narrow',sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px 14px;display:flex;flex-direction:column;gap:3px;align-items:center;box-shadow:0 0 0 2px #12130d,0 0 18px rgba(255,74,58,.35);min-width:260px}
.dn-bar i{font:600 12px/1.2 'Bahnschrift','Arial Narrow',sans-serif;letter-spacing:.04em;text-transform:none;color:#d8c9b4;font-style:normal;text-align:center;max-width:340px}
.dn-bar u{display:block;height:6px;width:100%;background:#2a1410;text-decoration:none}.dn-bar u b{display:block;height:100%;background:#ff4a3a}
.dn-vig{position:fixed;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 38%,rgba(70,0,0,.55) 78%,rgba(20,0,0,.9) 100%);animation:dnpulse 1.1s ease-in-out infinite}
@keyframes dnpulse{50%{opacity:.62}}
.dn-root{position:fixed;inset:0;pointer-events:none;z-index:7;overflow:hidden}
.dn-mark em{font-style:normal;color:#ff6a4a;font-size:16px;line-height:1}
.dn-mark{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;font:700 12px/1 'Bahnschrift','Arial Narrow',sans-serif;color:#ffe9d0;text-transform:uppercase;letter-spacing:.05em;text-shadow:0 0 4px #000}
.dn-ring{width:46px;height:46px;border-radius:50%;background:conic-gradient(#7dff9b var(--p,0%),#3a1410 0);display:flex;align-items:center;justify-content:center}
.dn-ring b{width:34px;height:34px;border-radius:50%;background:#12130d;display:flex;align-items:center;justify-content:center;font-size:15px;color:#ff8a7a}
.dn-mid{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:3px;font:700 13px/1 'Bahnschrift','Arial Narrow',sans-serif;color:#ffe9d0;letter-spacing:.06em;text-shadow:0 0 4px #000}
.dn-mid .dn-ring{width:74px;height:74px}.dn-mid .dn-ring b{width:60px;height:60px;color:#7dff9b;font-size:17px}`;

const arr3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];

export function installDowned(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false, boundNet = null, style = null, dock = null, root = null, vig = null, mid = null, lp = null;
  const S = {
    clock: 0, book: new DownBook(), down: new Map(),   // down: every peer's view id -> {dur, left, prog, by, p:[x,y,z], name}
    me: null, hold: null, selfUsed: false, soloUsed: false, sendT: 0, pgT: 0, sweepT: 0, lastSay: -999, marks: new Map(), lastPg: new Map(),
  };
  const host = () => !!game.isHost;
  const mode = () => getMode();
  const enabled = () => bleedSecs(mode()) > 0 && game.config?.downed !== false;
  const send = (d) => { try { game.net.broadcast('dn', d); } catch { /* net closing */ } };
  const nameOf = (id) => { try { return game.playerName?.(id) || (id === game.selfId ? game.profile?.name : null) || '?'; } catch { return '?'; } };
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const origAi = typeof game.aiPlayers === 'function' ? game.aiPlayers : null;
  const rawPlayers = () => (origAi ? origAi.call(game) : []);
  const rawPlayer = (id) => rawPlayers().find((p) => p.id === id);

  // ------------------------------------------------------------ host: creatures see downed players as dead
  let aiRaw = null, aiOut = null, aiSize = -1;
  wrap(game, 'aiPlayers', (orig) => function () {
    const list = orig.call(this);
    if (!S.down.size) return list;
    if (list === aiRaw && aiSize === S.down.size) return aiOut;
    aiRaw = list; aiSize = S.down.size;
    aiOut = list.map((p) => (S.down.has(p.id) && !p.dead ? { ...p, dead: true, downed: true } : p));
    return aiOut;
  });

  // ------------------------------------------------------------ net
  function onMsg(m, fromId) {
    if (disposed || !m || typeof m.k !== 'string' || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    const id = m.id;
    if (m.k === 'on') {
      S.down.set(id, { dur: +m.dur || 20, left: +m.dur || 20, prog: 0, by: null, p: m.p || null, name: nameOf(id) });
      if (S.me && id === game.selfId) S.me.seen = true;
      try { mods.emit('tfg:downed', { id, name: nameOf(id), cause: m.c || 'down', fast: !!m.fast }, game); } catch (e) { console.warn('[downed] emit', e); }
      if (id !== game.selfId) { game.ui?.systemMessage?.(tf('{name} is down! Hold [E] on them to revive.', { name: nameOf(id) }), 'warn'); game.sound2?.cue('down_thud', m.p ? { x: m.p[0], y: m.p[1], z: m.p[2] } : null, 0.7); }
    } else if (m.k === 'pg') {
      const e = S.down.get(id);
      if (e) { e.prog = +m.p || 0; e.by = m.by || null; if (Number.isFinite(m.l)) e.left = m.l; }
    } else if (m.k === 'up') {
      const e = S.down.get(id); S.down.delete(id);
      const nm = e?.name || nameOf(id);
      try { mods.emit('tfg:revived', { id, name: nm, by: m.by || null, self: false }, game); } catch (err) { console.warn('[downed] emit', err); }
      if (id === game.selfId) localRevive(+m.hp || RULES.reviveHp, m.by === id ? null : m.by);
      else game.ui?.systemMessage?.(tf('{by} revived {name}.', { by: nameOf(m.by), name: nm }), 'good');
    } else if (m.k === 'bleed') {
      S.down.delete(id);
      if (id === game.selfId && S.me) localBleed(m.c);
    } else if (m.k === 'clear') {
      S.down.clear();
      if (S.me) localRevive(RULES.orbitHp, null);
    } else if (m.k === 'say') {
      try { game.lore?.say?.(tf(m.s, m.v || {})); } catch { /* lore optional */ }
    }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:dn', onMsg);
    boundNet = net; net.on('msg:dn', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  function maybeSay(s, v, chance) {
    if (S.clock - S.lastSay < RULES.sayGap || Math.random() > chance) return;
    S.lastSay = S.clock;
    send({ k: 'say', s, v });
  }
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('dnreq', (d, from) => {
      if (!host() || disposed || !d) return;
      if (d.k === 'down') {
        const p = rawPlayer(from);
        if (!enabled() || !p || p.dead) return;
        const pos = Array.isArray(d.p) && d.p.length === 3 && d.p.every(Number.isFinite) ? d.p : arr3(p.pos);
        const e = S.book.down(from, S.clock, mode(), pos, String(d.c || '').slice(0, 24));
        if (!e) return;
        send({ k: 'on', id: from, dur: e.dur, fast: e.fast ? 1 : 0, p: pos, c: e.cause });
        maybeSay('{name} is down. Chat is placing bets on the bleed-out.', { name: nameOf(from) }, 0.5);
      } else if (d.k === 'hold') {
        const e = S.book.e.get(d.id), rp = rawPlayer(from), vp = rawPlayer(d.id);
        if (!e || !rp || rp.dead || !vp) return;
        const r = S.book.hold(d.id, from, S.clock, rp.pos.distanceTo(vp.pos), d.m ? RULES.reviveMedic : 1);
        if (!r) return;
        if (r.done) {
          send({ k: 'up', id: r.id, by: from, hp: RULES.reviveHp });
          maybeSay('{name} got back up. Chat is disappointed. Then delighted.', { name: nameOf(r.id) }, 0.4);
        }
      } else if (d.k === 'kit') {   // a crewmate jabbed a medkit / adrenaline into a downed player
        const e = S.book.e.get(d.id), rp = rawPlayer(from), vp = rawPlayer(d.id);
        if (!e || !rp || rp.dead || !vp || S.book.e.has(from) || from === d.id || !(rp.pos.distanceTo(vp.pos) <= RULES.hostRange)) return;
        const kit = game.items?.get?.(d.it);   // the reviver must really hold the kit; the host consumes it (no separate `consume`)
        if (!kit || kit.holder !== from || !KITS.includes(kit.type)) return;
        try { game.net.broadcast('it', { e: 'rm', id: kit.id }); } catch { /* net closing */ }
        S.book.e.delete(d.id);
        send({ k: 'up', id: d.id, by: from, hp: RULES.kitHp });
      } else if (d.k === 'self') {   // solo stand-up: only for yourself, only when the host also sees nobody who could revive you
        const e = S.book.e.get(from);
        if (!e || d.id !== from || rawPlayers().some((q) => q.id !== from && !q.dead && !S.book.e.has(q.id))) return;
        S.book.e.delete(from);
        send({ k: 'up', id: from, by: from, hp: RULES.selfHp });
        maybeSay('The Algorithm notes you got up alone. Once.', {}, 0.4);
      } else if (d.k === 'stop') {
        const e = S.book.stop(d.id, from);
        if (e) send({ k: 'pg', id: e.id, p: 0, by: null, l: e.left });
      }
    });
  }));
  // late join / resume: the joiner never saw the 'on' broadcast, so replay every open entry to them (marker + revive ring + bleed clock)
  offs.push(mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !host() || id === game.selfId) return;
    for (const e of S.book.e.values()) {
      try { game.net.sendTo(id, 'dn', { k: 'on', id: e.id, dur: e.dur, fast: e.fast ? 1 : 0, p: e.pos, c: e.cause }); game.net.sendTo(id, 'dn', { k: 'pg', id: e.id, p: +e.prog.toFixed(2), by: e.by, l: +e.left.toFixed(1) }); } catch { /* joiner gone */ }
    }
  }));
  // host migration: the old host's DownBook died with it; every peer mirrors S.down, so the new host rebuilds the book from its own mirror
  offs.push(mods.on('hostMigrated', (g, info) => {
    if (g !== game || !info?.self || !host()) return;
    for (const [id, e] of S.down) {
      if (S.book.e.has(id)) continue;
      S.book.e.set(id, { id, dur: e.dur, left: Math.max(1, e.left), prog: 0, by: null, holdAt: -99, pos: e.p || [0, 0, 0], cause: 'down', fast: false });
    }
  }));
  // ship reaches orbit: everybody still lying down is picked up (same idea as the old "crew revives in orbit"); a new landing forgets the second-down penalty
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'moon') { S.selfUsed = false; S.soloUsed = false; if (host()) S.book.last.clear(); }
    if (ph === 'orbit' && host() && (S.book.e.size || S.down.size)) { S.book.clear(); send({ k: 'clear' }); }
  }));

  // ------------------------------------------------------------ local: go down / get up / bleed out
  const kitId = () => {
    for (const it of game.items?.all?.() || []) if (it.holder === game.selfId && KITS.includes(it.type)) return it;
    return null;
  };
  const crewAlive = () => {
    for (const r of game.remotes?.values?.() || []) if (!r.dead && !(r.flags & 64) && !S.down.has(r.id)) return true;
    return false;
  };
  function goDown(cause, dmg, fromPos, solo) {
    const p = game.player;
    p.downed = true; p.hp = 1; p.latched = null;
    S.me = { cause, t: 0, seen: false, solo: !!solo, selfT: 0 };
    S.hold = null;
    game.grab?.stop?.(); game.closeMinigame?.(); game.terminal?.close?.(); game.inventory?.close?.();
    game.engine.hurt?.(Math.min(1, Math.max(0.25, dmg / 50)));
    p.onHurt?.(dmg, fromPos);
    game.sfx?.(game.audio?.variant?.('hurt') || 'heartbeat', 0.6); game.sound2?.cue('down_thud', null, 0.8);
    game.engine.flash?.(0x550000, 0.7);
    if (fromPos) game.ui?.hud?.damageDirection?.(fromPos, game);
    game.lastHurtT = game.time;
    game.net.send('pst', { hp: 1 });
    game.net.request('dnreq', { k: 'down', p: arr3(p.pos), c: cause });
    game.ui?.toast?.(t('YOU ARE DOWN'), 'bad');
  }
  function localRevive(frac, by) {
    const p = game.player;
    if (!p || p.dead) { S.me = null; return; }
    p.downed = false; S.me = null;
    p.hp = Math.max(1, Math.round((p.maxHp || 100) * frac));
    p.stunT = 0; p.slowT = 0;
    try { game.net.send('pst', { hp: Math.round(p.hp) }); } catch { /* net closing */ }
    game.engine.flash?.(0xffffff, 0.6);
    game.ui?.toast?.(by ? tf('You were revived by {name}.', { name: nameOf(by) }) : t('You are back on your feet.'), 'good');
    game.sound2?.cue('stand_up', null, 0.6); game.sfx?.('heal', 0.4);
  }
  function localBleed(cause) {
    const p = game.player;
    S.me = null;
    if (p) p.downed = false;
    if (p && !p.dead) game.die(cause || 'down');
  }
  wrap(game, 'damageLocal', (orig) => function (dmg, cause, fromPos) {
    const p = this.player;
    if (disposed || !p || p.dead || dmg <= 0 || this.godMode || !enabled()) return orig.call(this, dmg, cause, fromPos);
    if (p.downed) {
      if (S.me?.solo && S.me.selfT > 0 && !TRUE_DEATH.has(cause)) { S.me.selfT = 0; this.ui?.toast?.(t('Revive interrupted.'), 'warn'); }   // damage breaks the solo stand-up
      // already down: creatures ignore you; only a fall into the void / left behind / eaten finishes you at once
      if (TRUE_DEATH.has(cause)) { S.me = null; p.downed = false; p.hp = 0; return orig.call(this, 9999, cause, fromPos); }
      return;
    }
    if (!shouldDown(mode(), cause, p.hp, dmg)) return orig.call(this, dmg, cause, fromPos);
    if (this.hasPerk?.('secondwind') && !this.secondWindUsed && dmg < 999) return orig.call(this, dmg, cause, fromPos);   // Second Wind stays as it was
    if (!crewAlive() && !S.soloUsed) { S.soloUsed = true; goDown(cause, dmg, fromPos, true); return; }   // first solo down per landing: slow self-revive
    if (!crewAlive()) {
      // solo (or the whole crew is down / dead): one self-revive per landing with a medkit / adrenaline, else death as before
      const kit = !S.selfUsed ? kitId() : null;
      if (!kit) return orig.call(this, dmg, cause, fromPos);
      S.selfUsed = true;
      try { this.net.request('consume', { id: kit.id }); } catch { /* net closing */ }
      p.hp = Math.max(1, Math.round((p.maxHp || 100) * RULES.reviveHp));
      this.engine.hurt?.(0.8); this.engine.flash?.(0xffffff, 0.6);
      this.net.send('pst', { hp: Math.round(p.hp) });
      this.ui?.toast?.(tf('You jabbed a {item}. Back on your feet.', { item: kit.def?.name || kit.type }), 'good');
      try { mods.emit('tfg:revived', { id: this.selfId, name: nameOf(this.selfId), by: null, self: true }, game); } catch { /* soft */ }
      return;
    }
    goDown(cause, dmg, fromPos);
  });
  // downed: no items, no interacting, no hotbar (the whole per-frame action block is skipped)
  wrap(game, 'localActions', (orig) => function (dt, input) {
    if (game.player?.downed) { this.interactTarget = null; this.ui?.hud?.setPrompt?.(null); return; }
    return orig.call(this, dt, input);
  });
  // a crewmate's revive prompt
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || S.me || !S.down.size || game.player?.dead) return;
    for (const [id, e] of S.down) {
      const r = game.remotes?.get(id);
      if (!r || r.dead) continue;
      const act = () => {};
      act.__dn = id;
      out.push({ pos: new THREE.Vector3(r.pos.x, r.pos.y + 0.35, r.pos.z), r: 1.1, reach: RULES.range, label: () => t('HOLD [E] TO REVIVE'), sub: () => `${e.name}  ·  ${Math.ceil(Math.max(0, e.left))} s`, action: act });
    }
  }));
  offs.push(mods.on('localHurt', () => {
    if (!S.hold) return;
    const id = S.hold.id; S.hold = null;
    try { game.net.request('dnreq', { k: 'stop', id }); game.ui?.toast?.(t('Revive interrupted.'), 'warn'); } catch { /* net closing */ }
  }));
  offs.push(mods.on('localDeath', () => { S.me = null; S.hold = null; if (game.player) game.player.downed = false; }));
  // a downed player switches nothing: items can not be used
  offs.push(mods.on('useItem', (it, hk, g) => { if (g !== game) return;
    if (game.player?.downed) { hk.handled = true; return; }
    const tid = game.interactTarget?.action?.__dn;   // medkit / adrenaline on the downed crewmate I am looking at
    if (!hk.handled && it && KITS.includes(it.type) && tid && S.down.has(tid)) {
      hk.handled = true;
      try { game.net.request('dnreq', { k: 'kit', id: tid, it: it.id }); } catch { /* net closing */ }
    }
  }));

  // ------------------------------------------------------------ remote avatars lie face-down
  offs.push(mods.on('remoteAvatar', (r) => {
    const on = !!(r.flags & 64) && !r.dead;
    if (on) { r.root.rotation.order = 'YXZ'; r.root.rotation.x = 1.42; r.root.position.y += 0.1; r._dnPose = true; }
    else if (r._dnPose) { r.root.rotation.x = 0; r.root.rotation.order = 'XYZ'; r._dnPose = false; }
  }));

  // ------------------------------------------------------------ UI (bleed bar, vignette, world markers, revive ring)
  function ensureUi() {
    if (root || typeof document === 'undefined') return;
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.className = 'dn-root';
    mid = document.createElement('div'); mid.className = 'dn-mid'; root.appendChild(mid);
    (document.getElementById('ui') || document.body).appendChild(root);
    dock = hudDock('bottom', 'dn_bar', 4);
  }
  const ring = (frac, txt) => `<div class="dn-ring" style="--p:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"><b>${txt}</b></div>`;
  const _v = new THREE.Vector3();
  function paint() {
    if (!root && !S.me && !S.down.size) return;
    ensureUi();
    if (!root) return;
    const me = S.me, mine = S.down.get(game.selfId);
    // victim bar + vignette
    if (me) {
      if (!vig) { vig = document.createElement('div'); vig.className = 'dn-vig'; (document.getElementById('ui') || document.body).appendChild(vig); }
      const left = mine ? Math.max(0, mine.left) : 0, frac = mine ? left / mine.dur : 1;
      const html = `<div class="dn-bar"><span>${t('BLEEDING OUT')} ${mine ? Math.ceil(left) + ' s' : ''}</span><u><b style="width:${Math.round(frac * 100)}%"></b></u>${me.solo && !crewAlive() && me.selfT > 0 ? `<u><b style="width:${Math.round(Math.min(1, me.selfT / RULES.selfS) * 100)}%;background:#7dff9b"></b></u>` : ''}<i>${t(me.solo && !crewAlive() ? 'Get up… hold [E]' : crewAlive() ? 'Crawl to your crew. A crewmate can hold [E] on you to get you up.' : 'Nobody can reach you. Hold on.')}${mine?.prog > 0 ? ' · ' + t('REVIVING') : ''}</i></div>`;
      if (dock.dataset.h !== html) { dock.dataset.h = html; dock.innerHTML = html; }
      dock.style.display = '';
    } else {
      if (dock) dock.style.display = 'none';
      if (vig) { vig.remove(); vig = null; }
    }
    // markers over the downed crewmates + the ring in the middle of the screen while I hold E
    const cam = game.camera;
    const seen = new Set();
    for (const [id, e] of S.down) {
      if (id === game.selfId) continue;
      const r = game.remotes?.get(id);
      if (!r || r.dead || !cam) continue;
      _v.set(r.pos.x, r.pos.y + 1.1, r.pos.z).project(cam);
      let m = S.marks.get(id);
      if (!m) { m = document.createElement('div'); m.className = 'dn-mark'; root.appendChild(m); S.marks.set(id, m); }
      seen.add(id);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      m.style.display = '';
      // off-screen: pin the marker to the screen edge with an arrow pointing at the body
      let sx = _v.x, sy = _v.y;
      if (_v.z >= 1) { sx = -sx; sy = -sy; }
      let arrow = '';
      if (!vis) {
        const k = Math.max(Math.abs(sx), Math.abs(sy), 1e-3), ex = sx / k * 0.88, ey = sy / k * 0.82;
        arrow = `<em style="transform:rotate(${Math.round(Math.atan2(-sy, sx) * 180 / Math.PI)}deg)">&#9654;</em>`;
        sx = ex; sy = ey;
      }
      m.style.left = ((sx * 0.5 + 0.5) * 100).toFixed(1) + '%'; m.style.top = ((-sy * 0.5 + 0.5) * 100).toFixed(1) + '%';
      const html = `${arrow}${ring(e.prog / RULES.reviveS, Math.ceil(Math.max(0, e.left)))}<span>${e.name}</span>`;
      if (m.dataset.h !== html) { m.dataset.h = html; m.innerHTML = html; }
    }
    for (const [id, m] of S.marks) if (!seen.has(id)) { m.remove(); S.marks.delete(id); }
    const hold = S.hold, he = hold && S.down.get(hold.id);
    if (he) {
      const html = `${ring(he.prog / RULES.reviveS, Math.ceil(RULES.reviveS - he.prog))}<span>${t('REVIVING')} ${he.name}</span>`;
      if (mid.dataset.h !== html) { mid.dataset.h = html; mid.innerHTML = html; }
      mid.style.display = 'flex';
    } else mid.style.display = 'none';
  }

  // ------------------------------------------------------------ muffled audio while down
  function muffle(on) {
    const a = game.audio;
    if (!lp) {
      if (!on || !a?.ctx || !a.tone || !a.comp) return;
      try { lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; a.tone.disconnect(); a.tone.connect(lp); lp.connect(a.comp); } catch { lp = null; return; }
    }
    try { lp.frequency.setTargetAtTime(on ? 620 : 20000, a.ctx.currentTime, 0.2); } catch { /* audio closing */ }
  }

  // ------------------------------------------------------------ per-frame (every peer)
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    S.clock += dt;
    const p = game.player;
    if (S.down.size && game.sound2) {   // [sound2] revive progress: a soft pulse that speeds up while somebody is being lifted
      for (const e of S.down.values()) if (e.by && e.prog > 0) { const f = Math.min(1, e.prog / RULES.reviveS); game.sound2.hold('revive', 'revive_loop', { vol: 0.4 + 0.5 * f, pitch: 0.85 + 0.45 * f, lease: 0.6, pos: e.p ? { x: e.p[0], y: e.p[1], z: e.p[2] } : undefined }); break; }
    }
    // host: bleed timers, revive progress broadcast, cleanup of players who left / died
    if (host() && S.book.e.size) {
      for (const e of S.book.tick(dt, S.clock)) send({ k: 'bleed', id: e.id, c: e.cause });
      S.pgT += dt; S.sweepT += dt;
      if (S.pgT >= 0.25) {
        S.pgT = 0;
        for (const e of S.book.e.values()) {
          const q = e.prog > 0 || S.lastPg.get(e.id) > 0;
          S.lastPg.set(e.id, e.prog);
          if (q || Math.round(e.left) % 5 === 0) send({ k: 'pg', id: e.id, p: +e.prog.toFixed(2), by: e.by, l: +e.left.toFixed(1) });
        }
      }
      if (S.sweepT >= 1) {
        S.sweepT = 0;
        for (const id of [...S.book.e.keys()]) { const rp = rawPlayer(id); if (!rp || rp.dead) { S.book.clear(id); send({ k: 'bleed', id, c: 'gone' }); } }
      }
    }
    // local countdown mirror (display only; the host decides)
    for (const e of S.down.values()) { if (e.prog <= 0) e.left -= dt; }
    if (S.me && p) {
      S.me.t += dt;
      p.hp = 1;                                   // pinned: heals / regen can not stand you up, only a revive
      p.downed = true;
      game.engine.setLowHealth?.(0.9 + 0.1 * Math.sin(S.clock * 7));
      const mine = S.down.get(game.selfId);
      if ((S.me.t > 3 && !mine && !S.me.seen) || (S.me.seen && !mine)) localBleed(S.me.cause);   // the host never confirmed / dropped us: die as before
    }
    // solo: hold E ~6 s to get yourself up (damage resets it in damageLocal)
    if (S.me?.solo && p && game.input?.enabled && !crewAlive() && game.input.isDown('interact')) {
      S.me.selfT += dt;
      if (S.me.selfT >= RULES.selfS && !S.me.req) { S.me.req = true; try { game.net.request('dnreq', { k: 'self', id: game.selfId }); } catch { /* net closing */ } }
    } else if (S.me?.solo && !S.me.req) S.me.selfT = Math.max(0, S.me.selfT - dt * RULES.decay);
    // crewmate holding E on a downed player
    const input = game.input;
    const tid = game.interactTarget?.action?.__dn;
    const holding = !!(tid && p && !p.dead && !p.downed && input?.enabled && input.isDown('interact') && S.down.has(tid));
    if (holding) {
      if (!S.hold || S.hold.id !== tid) S.hold = { id: tid, t: 0 };
      S.hold.t += dt;
      const e = S.down.get(tid); e.prog = Math.min(RULES.reviveS, e.prog + dt / (game.rpg?.role?.() === 'medic' ? RULES.reviveMedic : 1));
      S.sendT -= dt;
      if (S.sendT <= 0) { S.sendT = 0.2; game.net.request('dnreq', { k: 'hold', id: tid, m: game.rpg?.role?.() === 'medic' ? 1 : 0 }); }
    } else if (S.hold) {
      const e = S.down.get(S.hold.id); if (e) e.prog = Math.max(0, e.prog - dt * RULES.decay);
      S.hold = null; S.sendT = 0;
    }
    muffle(!!S.me);
    paint();
  }));

  return {
    S, RULES,
    isDowned: (id) => (id == null || id === game.selfId ? !!S.me : S.down.has(id)),
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* soft */ } }
      for (const r of restores.splice(0).reverse()) { try { r(); } catch { /* soft */ } }
      boundNet?.off?.('msg:dn', onMsg);
      try {
        if (lp && game.audio?.tone) { game.audio.tone.disconnect(); lp.disconnect(); game.audio.tone.connect(game.audio.comp); }
        if (game.player) game.player.downed = false;
      } catch { /* audio closing */ }
      root?.remove(); vig?.remove(); style?.remove(); dock?.remove();
    },
  };
}
