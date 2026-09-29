// HARDMODE (wave 5, docs/wave5/hardmode.md, MASTERPLAN 25.4). Installed with `this.useModule('hardmode', installHardmode)` (game.js).
// The numbers live in difficulty.js (ONE table, three modes: Casual = the old values / Standard = the 25.4 table / Hard = one notch harder); the
// small hooks in progression / localplayer / shop / deployables / survival / forge read it directly. THIS module owns the rules that need game state:
//   sync     game.config.difficulty (host lobby setting -> welcome config) + run.quotaIndex -> difficulty.js ambient mode / quota, every frame
//   lock     ship door "lock warning": HUD countdown + sys lines 90 s (Standard) / 120 s (Hard) before midnight, repeat marks
//   strand   late crew are NOT killed at takeoff: they stay outside (scrap lost), come back hurt next morning (game.hmStrand, called by host.js)
//   growth   next quota grows x(1..1.15) with the surplus of the quota just met; the Algorithm says so (game.hmGrowth, called by host.js)
//   tricks   after quota 3 some creatures close doors and cut the lights for a few seconds (host)
//   food     cooked dishes age (game.hardmode.stamp from survival.js); after 3 days their heal drops; crates are cold storage (records do not age)
//   death    a death notice names the loot that stays where the player fell (the drop itself is actions.js die(), unchanged)
// Everything pressure-like only runs from quota INDEX 3 on (difficulty.js eff()). Net (prefix 'hm'): 'hms' host -> everyone {k:'lock'|'strand'|'say'}.
import * as THREE from 'three';
import { t, tf, sysMsg } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { insideShip, inDoorway } from '../world/ship.js';
import { MOONS } from './moons.js';
import { isSellable } from './items.js';
import { isDishId } from './survival_data.js';
import * as D from './difficulty.js';
import './hardmode_i18n.js';

// creatures that learn doors / lights after quota 3 (the sneaky, hunting kind; brutes and swarms just smash through)
export const DOOR_CLOSERS = Object.freeze(['stalker', 'lurker', 'mimic', 'mannequin', 'editor', 'moderator', 'support', 'replyguy']);
export const LIGHT_CUTTERS = Object.freeze(['lurker', 'stalker', 'editor']);

const CSS = `.hm-lock{background:#12130d;border:2px solid #ff4a3a;color:#ffe9d0;font:700 15px/1.2 'Bahnschrift','Arial Narrow',sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 0 0 2px #12130d,0 0 18px rgba(255,74,58,.35)}
.hm-lock b{background:#ff4a3a;color:#111;padding:1px 8px;font-size:18px;min-width:56px;text-align:center}
.hm-lock.hot{animation:hmblink .5s steps(2) infinite}@keyframes hmblink{50%{background:#3a1410}}`;

export function installHardmode(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false, boundNet = null, style = null, dock = null;
  const host = () => !!game.isHost;
  const run = () => game.run;
  const S = {
    lockMarks: null, lockI: 0, lockEnd: 0,          // host marks / client countdown target (performance.now s)
    doorT: 30, lightT: 90, doorTold: false, cut: null,
    stamps: new Map(), spoiled: new Set(),
    strandMe: null, frozen: null, told: -1, lastMode: '',
  };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const q = () => (run()?.quotaIndex | 0);
  const realMoon = () => { const m = MOONS[run()?.moon]; return !!m && !m.company && !m.home; };
  const send = (d) => { try { game.net.broadcast('hms', d); } catch { /* net closing */ } };

  // ------------------------------------------------------------ mode sync (every peer)
  function sync() {
    const r = run();
    D.setMode(game.config?.difficulty);
    D.setQuota(r?.quotaIndex | 0);
  }
  offs.push(mods.on('configure', (cfg, g) => {
    if (g !== game) return;
    const o = game.opts || {};
    if (o.host) cfg.difficulty = D.norm(o.difficulty ?? game.settings?.difficulty);
    sync();
  }));
  sync();

  // ------------------------------------------------------------ net
  function onMsg(m, fromId) {
    if (disposed || !m || typeof m.k !== 'string' || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    if (m.k === 'lock') S.lockEnd = now() + Math.max(0, +m.s || 0);
    else if (m.k === 'strand') S.strandMe = Array.isArray(m.ids) && m.ids.includes(game.selfId) ? { f: Math.max(0.05, Math.min(1, +m.f || 0.5)) } : null;
    else if (m.k === 'say') { try { game.lore?.say?.(tf(m.s, m.v || {})); } catch { /* lore optional */ } }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:hms', onMsg);
    boundNet = net; net.on('msg:hms', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const setHook = (name, fn) => { game[name] = fn; restores.push(() => { if (game[name] === fn) delete game[name]; }); };

  // ------------------------------------------------------------ host hooks called from host.js
  /** quota growth multiplier for the quota that just started (host.js hostEvaluateQuota) */
  setHook('hmGrowth', (surplus, prev) => {
    const r = run();
    if (!r) return 1;
    sync();
    const mul = D.quotaGrowthMul(prev > 0 ? surplus / prev : 0, r.quotaIndex | 0);
    if (mul > 1.02) send({ k: 'say', s: 'You are doing great. I raised the next quota to match. You are welcome.' });
    return mul;
  });
  /** takeoff: late crew stay outside alive (host.js hostFinishTakeoff); returns the Set of stranded player ids, or null = old rule (they die) */
  setHook('hmStrand', (leftBehind) => {
    sync();
    const rule = realMoon() ? D.strandRule(q()) : null;
    if (!rule || !leftBehind?.length) return null;
    const ids = leftBehind.map((p) => p.id);
    send({ k: 'strand', ids, f: rule.hpFrac });
    return new Set(ids);
  });

  // ------------------------------------------------------------ door lock warning (host) + HUD (everyone)
  function lockMarks(warn, rep) {
    const m = [warn];
    for (let x = warn - rep; x > 12; x -= rep) m.push(x);
    m.push(10);
    return m;
  }
  function lockTick() {
    const r = run(), warn = D.lockWarnSec(q());
    if (!warn || !realMoon()) { S.lockMarks = null; return; }
    const rate = (16 * 60) / (game.config?.dayLengthSec || 720);   // game minutes per real second
    const left = (24 * 60 - (r.time || 0)) / rate;
    if (left > warn + 1) { S.lockMarks = null; return; }
    if (!S.lockMarks) { S.lockMarks = lockMarks(warn, D.eff(q()).lockRepeatSec || 30); S.lockI = 0; }
    while (S.lockI < S.lockMarks.length && left <= S.lockMarks[S.lockI] + 0.5) {
      const n = Math.max(1, Math.round(left));
      S.lockI++;
      try {
        game.net.broadcast('sys', sysMsg('SHIP DOOR LOCKS IN {n} s. Everyone back aboard.', { n }, 'bad'));
        game.net.broadcast('fx', { k: 'snd', s: 'ship_alarm', p: [0, 2, 0], v: 1, r: 30, m: 400 });
      } catch { /* net closing */ }
      send({ k: 'lock', s: left });
    }
  }
  function paintLock() {
    if (typeof document === 'undefined') return;
    const r = run(), left = S.lockEnd - now();
    const on = r?.phase === 'moon' && left > 0 && left < 400;
    if (!on) { if (dock) dock.style.display = 'none'; return; }
    if (!dock) {
      if (!style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
      dock = hudDock('bottom', 'hm_lock', 5);
    }
    dock.style.display = '';
    const s = Math.ceil(left), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const html = `<div class="hm-lock${left < 15 ? ' hot' : ''}"><span>${t('DOOR LOCKS IN')}</span><b>${txt}</b></div>`;
    if (dock.dataset.h !== html) { dock.dataset.h = html; dock.innerHTML = html; }
  }

  // ------------------------------------------------------------ creature tricks (host): doors + lights
  const players = () => (game.aiPlayers?.() || []).filter((p) => !p.dead);
  function doorTrick() {
    const fac = game.world?.facility, doors = fac?.doors;
    if (!doors?.length) return false;
    let best = null, bd = 1e9;
    for (const c of game.creatures?.host?.values?.() || []) {
      if (c.dead || !DOOR_CLOSERS.includes(c.type)) continue;
      let near = null, nd = 1e9;
      for (const p of players()) {
        const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
        if (Math.abs(p.pos.y - c.pos.y) < 3 && d < nd) { nd = d; near = p; }
      }
      if (!near || nd > 24) continue;   // it only bothers when a player is around
      for (const door of doors) {
        if (door.kind !== 'door' || !door.open || door.locked || door.teleport || !door.pos) continue;
        if (Math.abs(door.pos.y - c.pos.y) > 2.5) continue;
        const dc = Math.hypot(door.pos.x - c.pos.x, door.pos.z - c.pos.z);
        if (dc > 6) continue;
        const dp = Math.hypot(door.pos.x - near.pos.x, door.pos.z - near.pos.z);
        if (dp < 3) continue;          // never on somebody standing in the doorway
        let blocked = false;
        for (const p of players()) if (Math.hypot(p.pos.x - door.pos.x, p.pos.z - door.pos.z) < 2.2 && Math.abs(p.pos.y - door.pos.y) < 3) blocked = true;
        for (const o of game.creatures.host.values()) if (!o.dead && Math.hypot(o.pos.x - door.pos.x, o.pos.z - door.pos.z) < 1.4 && Math.abs(o.pos.y - door.pos.y) < 3) blocked = true;
        if (blocked) continue;
        const score = dc + dp * 0.05;
        if (score < bd) { bd = score; best = door; }
      }
    }
    if (!best) return false;
    game.hostSetDoor?.(best.id, false);
    try {
      game.net.broadcast('fx', { k: 'snd', s: 'impact_metal_1', p: [best.pos.x, best.pos.y + 1, best.pos.z], v: 0.9, r: 4 });
      if (!S.doorTold) { S.doorTold = true; game.net.broadcast('sys', sysMsg('Something closed a door nearby.', {}, 'warn')); }
    } catch { /* net closing */ }
    return true;
  }
  function recloseBlast(list) {
    for (const id of list) {
      const door = game.doorById?.(id);
      if (!door?.open || !door.pos) continue;
      let blocked = false;
      for (const p of players()) if (Math.hypot(p.pos.x - door.pos.x, p.pos.z - door.pos.z) < 2.8 && Math.abs(p.pos.y - door.pos.y) < 3) blocked = true;
      if (!blocked) game.hostSetDoor?.(id, false);
    }
  }
  function lightTrick(tr) {
    const r = run();
    if (!r?.powerOn || S.cut || game.director?.debug?.().blackout) return false;
    let cutter = null;
    for (const c of game.creatures?.host?.values?.() || []) {
      if (c.dead || !LIGHT_CUTTERS.includes(c.type)) continue;
      if (players().some((p) => Math.abs(p.pos.y - c.pos.y) < 3 && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < 26)) { cutter = c; break; }
    }
    if (!cutter) return false;
    const blast = [];
    for (const d of game.world?.facility?.doors || []) if (d.kind === 'blast' && !d.open) blast.push(d.id);
    game.hostSetPower(false);
    S.cut = { t: tr.lightSec * (0.8 + Math.random() * 0.4), blast };
    try { game.net.broadcast('sys', sysMsg('The lights just went out. Something did that.', {}, 'warn')); } catch { /* net closing */ }
    return true;
  }
  function tricksTick(dt) {
    const tr = D.creatureTricks(q());
    const r = run(), hd = game.hostData;
    if (S.cut) {
      S.cut.t -= dt;
      if (S.cut.t <= 0 || r?.phase !== 'moon') {
        const c = S.cut; S.cut = null;
        if (r && r.phase === 'moon' && !r.powerOn) { game.hostSetPower(true); recloseBlast(c.blast); }
      }
    }
    if (!tr || r?.phase !== 'moon' || !realMoon() || (hd?.moonT || 0) < 25) return;
    S.doorT -= dt; S.lightT -= dt;
    if (S.doorT <= 0) { S.doorT = tr.doorEveryS * (0.7 + Math.random() * 0.6); doorTrick(); }
    if (tr.lightEveryS > 0 && S.lightT <= 0) { S.lightT = tr.lightEveryS * (0.7 + Math.random() * 0.6); lightTrick(tr); }
  }

  // ------------------------------------------------------------ food (host)
  /** survival.js calls this with the item id of every freshly cooked dish */
  function stamp(id) { if (id && run()) S.stamps.set(id, run().day | 0); }
  /** morning check: dishes older than the spoil window lose most of their heal. Crate records are not items, so a crate is cold storage. */
  function spoilCheck() {
    const r = run(), days = D.spoilDays(q());
    if (!r || !days) return 0;
    let n = 0;
    const alive = new Set();
    for (const it of game.items.all()) {
      if (!isDishId(it.type)) continue;
      alive.add(it.id);
      const st = S.stamps.get(it.id);
      if (st == null) { S.stamps.set(it.id, r.day | 0); continue; }   // saved / debug dish: its clock starts now
      if (S.spoiled.has(it.id) || (r.day | 0) - st < days) continue;
      S.spoiled.add(it.id);
      game.net.broadcast('it', { e: 'val', id: it.id, v: Math.max(1, Math.round((it.value || 1) * D.spoilHealMul(q()))) });
      n++;
    }
    for (const id of [...S.stamps.keys()]) if (!alive.has(id)) { S.stamps.delete(id); S.spoiled.delete(id); }
    if (n) game.net.broadcast('sys', sysMsg('Some food in the ship has spoiled.', {}, 'warn'));
    return n;
  }
  // ------------------------------------------------------------ death notice (host)
  wrap(game, 'hostOnPlayerDied', (orig) => function (id, d) {
    const out = orig.call(this, id, d);
    try {
      if (D.eff(q()).deathNotice && d?.cause !== 'left' && d?.pos && realMoon()) {
        const at = new THREE.Vector3().fromArray(d.pos), name = this.playerName?.(id) || '?';
        game.later?.(() => {
          let v = 0;
          for (const it of game.items.all()) if (!it.holder && isSellable(it.def) && !it.soulbound && it.type !== 'body' && it.obj?.position.distanceTo(at) < 4) v += it.value || 0;
          if (v > 0) game.net.broadcast('sys', sysMsg('{name} dropped ▮{v} of loot where they fell. Go get it.', { name, v: Math.round(v) }, 'warn'));
        }, 1400);
      }
    } catch (e) { console.warn('[hardmode] death notice', e); }
    return out;
  });

  // ------------------------------------------------------------ stranded crew (client): hold still while the ground unloads, return hurt at dawn
  function strandTick() {
    const p = game.player, ph = run()?.phase;
    if (!p || p.dead) { S.frozen = null; return; }
    if (ph === 'takeoff') {
      if (!S.frozen && D.strandRule(q()) && realMoon() && !insideShip(p.pos) && !inDoorway(p.pos)) S.frozen = { pos: p.pos.clone(), yaw: p.yaw };
      if (S.frozen && p.pos.y < S.frozen.pos.y - 0.4) p.teleport(S.frozen.pos, S.frozen.yaw);   // the moon colliders are gone: hover instead of falling
    }
  }
  function onPhase(ph) {
    if (ph === 'takeoff') { S.lockMarks = null; S.lockEnd = 0; }
    if (ph !== 'orbit') return;
    S.lockMarks = null; S.lockEnd = 0; S.doorTold = false;
    const p = game.player, me = S.strandMe, was = S.frozen;
    S.strandMe = null; S.frozen = null;
    if (host()) { try { spoilCheck(); } catch (e) { console.warn('[hardmode] spoil', e); } }
    if (S.cut) S.cut = null;
    if (!p || p.dead) return;
    if (me || was) {
      game.spawnInShip?.();
      if (me) {
        const max = game.stats?.maxHp || p.hp || 100;
        p.hp = Math.max(1, Math.min(p.hp, Math.round(max * me.f)));
        try { game.net.send('pst', { hp: Math.round(p.hp) }); } catch { /* net closing */ }
        game.ui?.toast?.(t('You were locked out. The crew found you at dawn, hurt.'), 'bad');
      }
    }
  }
  offs.push(mods.on('phase', (ph, g) => { if (!g || g === game) { sync(); onPhase(ph); if (ph === 'moon' && host()) announceRules(); } }));

  let toldFor = -1;
  function announceRules() {
    if (!D.isLate(q()) || toldFor === q()) return;
    toldFor = q();
    try { game.net.broadcast('sys', sysMsg('From quota 3 the {@d} rules apply: less loot, heavier hauls, spoiling food.', { d: D.LABEL[D.getMode()] }, 'info')); } catch { /* net closing */ }
  }

  // ------------------------------------------------------------ update
  let paintT = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (disposed || (g && g !== game)) return;
    sync();
    strandTick();
    paintT -= dt;
    if (paintT <= 0) { paintT = 0.25; paintLock(); }
    if (!host() || !run()) return;
    if (run().phase === 'moon') { lockTick(); tricksTick(dt); } else if (S.cut) tricksTick(dt);
  }));

  return {
    state: S,
    stamp, spoilCheck,
    mode: () => D.getMode(),
    set(mode) { game.config.difficulty = D.norm(mode); sync(); return D.getMode(); },
    /** debug / tests */
    debug: { doorTrick, lightTrick, lockTick, tricksTick, onPhase },
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:hms', onMsg); } catch { /* ignore */ }
      dock?.remove(); style?.remove(); dock = style = null;
      D.setMode(D.DEFAULT_MODE); D.setQuota(0);
    },
  };
}
