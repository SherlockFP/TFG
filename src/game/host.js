// Host-only game logic (installed on Game.prototype): run state, phases, day clock, quota,
// economy, spawning, request handlers, AI glue, rewards.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { MOONS, MOON_ORDER } from './moons.js';
import { ITEMS, itemDef, SCRAP_TABLE, BIG_TABLE, isSellable, scrapTableFor, bigTableFor } from './items.js';
import { CREATURES } from './creatures.js';
import { spawnTable, canSpawnMore } from './creatures.js';
import { nextQuota, buyRate, scrapValueMul, scrapCountBonus, indoorPowerMul, outdoorPowerMul, creatureBaseLevel } from './progression.js';
import { insideShip, inDoorway, SHIP } from '../world/ship.js';
import { saveRun } from '../core/save.js';
import { lobbyCode } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { hostPopulateOutposts } from '../world/outposts.js';
import { rollWeaponAffixes, lootLevelFor, affixDisplayName } from './loot.js';
import { dailyEventFor } from './dailyEvents.js';

const EARLY_SAFE_T = 90;   // s after landing with no creature spawns near the facility doors
const EARLY_SAFE_D = 25;   // m of walking distance
const EARLY_SAFE_D_LETHAL = 40;   // one-shot / 90+ damage creatures (Lurker, Pop-up, Parasocial, NPC...) keep further away
const isLethalType = (type) => (CREATURES[type]?.dmg || 0) >= 90;

export function newRun() {
  return {
    phase: 'orbit', moon: 'hamsi', seed: Math.floor(Math.random() * 1e9), weather: 'clear',
    time: 480, day: 1, daysLeft: 3, quota: nextQuota(0, 0), quotaIndex: 0, sold: 0, credits: 60,
    upgrades: {}, powerOn: true, buyRnd: Math.random(), forecast: {}, totalScrap: 0, runId: lobbyCode(), threat: 0,
  };
}

function rollForecast(run) {
  const f = {};
  for (const id of MOON_ORDER) {
    const m = MOONS[id];
    const opts = m.weather || ['clear'];
    f[id] = opts[Math.floor(Math.random() * opts.length)];
  }
  run.forecast = f;
}

export const hostMethods = {
  hostInit(runData, slot) {
    this.saveSlot = slot || 1;
    const run = runData ? { ...newRun(), ...runData, phase: 'orbit', time: 480 } : newRun();
    if (!run.forecast || !Object.keys(run.forecast).length) rollForecast(run);
    this.run = run;
    this.hostData = { collected: new Set(), dayStats: this.freshDayStats(), spawnT: 0, outdoorSpawnT: 0, powerUsed: 0, outPowerUsed: 0, lastTimeSync: 0, alarmPlayed: false, allDeadT: 0 };
    this.applyRunState(run, true);
    this.env.setSpace(this.planetColorFor(run.moon));
    this.env.landingT = 0;
    // restore ship items
    for (const s of runData?.shipItems || []) {
      this.items.onEvent({ e: 'sp', id: this.items.hostSpawnId?.() || ('i' + Math.random().toString(36).slice(2, 9)), ty: s.ty, v: s.v, bv: s.bv ?? s.v, p: s.p, q: s.q, b: s.b, c: s.c, am: s.am, af: s.af, bg: s.bg, ...this.inventory?.loadFields?.(s) });
    }
    this.registerHandlers();
    this.spawnInShip();
    this.updateAmbience();
    this.ui.toast('You are the host. Lobby code: ' + this.net.code);
    this.hostAnnounce();
    this.tutorialHint('orbit');
    this.mods?.emit('hostStart', this);
  },

  later(fn, ms) {
    const id = setTimeout(() => { this._timers?.delete(id); if (!this.destroyed) fn(); }, ms);
    (this._timers = this._timers || new Set()).add(id);
    return id;
  },

  freshDayStats() { return { collected: 0, kills: 0, deaths: [], startCredits: this.run?.credits || 0, per: {} }; },
  dayPer(id) { const per = this.hostData.dayStats.per || (this.hostData.dayStats.per = {}); return per[id] || (per[id] = { loot: 0, kills: 0 }); },

  hostAnnounce() {
    const info = {
      code: this.net.code, name: this.opts.lobbyName || (this.profile.name + "'s crew"), host: this.profile.name,
      players: this.net.playerCount(), max: this.config.maxPlayers, phase: this.run.phase, moon: MOONS[this.run.moon]?.short,
      quota: this.run.quota, day: this.run.day, locked: !!this.opts.password, mods: this.mods?.enabledIds() || [],
      level: this.profile.level,
    };
    this.emit('announce', info);
  },

  // Broadcast run fields. With `keys` only those; without, every top-level field that changed since it was
  // last sent (so fields other modules add to `run` reach clients without per-field whitelists).
  broadcastRun(keys) {
    const run = this.run;
    if (!run) return;
    const sent = (this._runSent ||= new Map());
    const d = {};
    let any = false;
    const list = keys || new Set([...Object.keys(run), ...sent.keys()]);
    for (const k of list) {
      if (k === 'phase' && !keys) continue;          // phase changes travel as 'phase' events (they drive map loads)
      const v = run[k];
      let j;
      try { j = JSON.stringify(v === undefined ? null : v); } catch { continue; }
      if (!keys && sent.get(k) === j) continue;
      sent.set(k, j);
      d[k] = v === undefined ? null : v;
      any = true;
    }
    if (any || keys) this.net.broadcast('gs', d);
  },
  // remember what a full-state message ('phase') already carried so the diff sync skips it
  markRunSent(obj) {
    const sent = (this._runSent ||= new Map());
    for (const k of Object.keys(obj || {})) { try { sent.set(k, JSON.stringify(obj[k] === undefined ? null : obj[k])); } catch { /* ignore */ } }
  },

  hostOnPlayerJoin(id, info) {
    if (this.mods?.gateJoin && !this.mods.gateJoin(id, info, this)) return;   // Late Join switch + missing content mods: reject before any world data is sent
    this.ensureRemote(id, info);
    const players = [];
    players.push({ id: this.selfId, ...this.helloData(), dead: this.player.dead, st: this.lastPs });
    for (const r of this.remotes.values()) players.push({ id: r.id, name: r.name, level: r.level, suit: r.suit, hat: r.hat, title: r.title || '', dead: r.dead, st: r.lastState });
    const doors = (this.world.facility?.doors || []).map((d) => ({ id: d.id, open: d.open, locked: d.locked, silent: true }));
    this.net.sendTo(id, 'welcome', {
      run: this.run, config: this.config, players,
      items: this.items.serialize(), creatures: this.creatures.serializeFor(), doors, shipDoor: this.ship.door.open,
    });
    this.net.broadcast('sys', { text: `${info.name} joined the crew.`, kind: 'info' }, false);
    this.hostAnnounce();
    this.mods?.emit('playerJoin', id, info, this);
  },
  hostOnPlayerLeave(id) {
    // clients without a direct link to the leaver never get a transport 'leave' for them: tell everyone
    this.net.broadcast('pleft', { id }, false);
    // release a leech that was latched onto the leaver
    for (const c of this.creatures.host.values()) if (c.type === 'leech' && c.extra === id) { this.hostLatch(c, id, false); c.extra = 0; c.setState?.('walk'); }
    // drop everything they held
    for (const it of this.items.all()) {
      if (it.holder === id) {
        const r = this.remotes.get(id);
        const p = r ? r.pos.clone() : new THREE.Vector3(0, 1, 0);
        this.net.broadcast('it', { e: 'drop', id: it.id, p: [p.x, p.y + 1, p.z], q: [0, 0, 0, 1] });
      }
      if (it.owner === id) this.net.broadcast('it', { e: 'own', id: it.id, o: null });
    }
    this.hostAnnounce();
  },

  // ------------------------------------------------------------------ request handlers
  registerHandlers() {
    const net = this.net;
    const H = (a, fn) => net.handle(a, fn);
    const posOf = (from) => (from === this.selfId ? this.player.pos : this.remotes.get(from)?.pos);

    H('pick', (d, from) => {
      const it = this.items.get(d.id);
      // Every rejection answers, with the host's transform, so the client's predicted pick never becomes a ghost.
      const fail = () => {
        const o = it?.obj;
        this.net.sendTo(from, 'pickfail', o && it.state === 'world' ? { id: d.id, p: o.position.toArray(), q: o.quaternion.toArray() } : { id: d.id });
      };
      // (the host's own prediction already marked it held by the host)
      if (!it || it.carrier || (it.state !== 'world' && it.holder !== from)) { fail(); return; }
      if (it.owner && it.owner !== from) { fail(); return; }
      // one body per carrier (a second pick is refused; the client answers with a toast before it ever asks)
      if (it.type === 'body' && [...this.items.all()].some((o) => o !== it && o.type === 'body' && o.holder === from)) { fail(); return; }
      // distance check against the last position the client REPORTED (the damped avatar lags behind after teleports)
      const rr = from === this.selfId ? null : this.remotes.get(from);
      const p = from === this.selfId ? this.player.pos : (rr && rr.lastUpdate ? rr.target : null);
      if (p && p.distanceTo(it.obj.position) > 7) { fail(); return; }
      this.net.broadcast('it', { e: 'held', id: it.id, h: from, sl: d.slot });
      it.lastHolder = from;
      if (it.def.special === 'apparatus' && this.run.powerOn && !it.pulled) {
        it.pulled = true;
        this.hostSetPower(false);
        this.hostData.powerBoost = (this.hostData.powerBoost || 0) + 3;
        this.net.broadcast('sys', { text: 'Something has been disconnected... the facility goes dark.', kind: 'bad' });
      }
    });
    H('drop', (d, from) => {
      const it = this.items.get(d.id);
      if (!it || it.holder !== from) return;
      it.lastHolder = from;
      this.net.broadcast('it', { e: 'drop', id: it.id, p: d.p, q: d.q, lv: d.lv });
      if (d.fuse) this.hostArmThrowable(it, d.fuse);
    });
    H('grab', (d, from) => {
      const it = this.items.get(d.id);
      if (!it || it.state !== 'world' || (it.owner && it.owner !== from) || it.carrier || it.type === 'body') return;   // bodies are carried in the hands, never beamed (they would be left behind at every door)
      const p = it.obj.position, q = it.obj.quaternion;
      this.net.broadcast('it', { e: 'own', id: it.id, o: from, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] });
      it.lastHolder = from;
    });
    H('release', (d, from) => {
      const it = this.items.get(d.id);
      if (!it || it.owner !== from) return;
      this.net.broadcast('it', { e: 'own', id: it.id, o: null, p: d.p, q: d.q, lv: d.lv, av: d.av });
    });
    H('dmgItem', (d) => this.hostDamageItem(d.id, d.amt));
    H('consume', (d, from) => {
      const it = this.items.get(d.id);
      if (!it || it.holder !== from) return;
      this.net.broadcast('it', { e: 'rm', id: it.id });
    });
    H('door', (d, from) => {
      const door = this.doorById(d.id);
      if (!door || door.kind === 'vault' || door.teleport) return;
      if (door.locked && d.open) { this.net.sendTo(from, 'fx', { k: 'snd', s: 'door_locked', p: [door.pos.x, door.pos.y + 1, door.pos.z], v: 0.8 }); return; }
      this.hostSetDoor(door.id, !!d.open);
    });
    H('unlock', (d, from) => {
      const door = this.doorById(d.id);
      if (!door || !door.locked || door.kind === 'vault') return;
      if (d.key) { const k = this.items.get(d.key); if (!k || k.holder !== from) return; this.net.broadcast('it', { e: 'rm', id: k.id }); }
      door.locked = false;
      this.hostSetDoor(door.id, true);
    });
    H('vault', (d, from) => {
      const door = this.doorById(d.id);
      if (!door || door.kind !== 'vault' || !door.locked) return;
      door.locked = false;
      this.hostSetDoor(door.id, true);
      this.net.broadcast('xp', { to: from, xp: 120 + this.run.quotaIndex * 20, coin: 25, reason: 'Vault cracked', bounty: { type: 'minigame', target: 'safe' } });
    });
    H('alarm', (d) => {
      if (!Array.isArray(d.p) || d.p.length < 3 || !d.p.every(Number.isFinite)) return;
      const p = new THREE.Vector3().fromArray(d.p);
      this.creatures.noise(p, 3.5);
      this.net.broadcast('fx', { k: 'snd', s: 'alarm_loop', p: d.p, v: 1, r: 8, m: 90 });
    });
    H('fuse', (d, from) => {
      const fk = (d.fuse || 'fuse') + ':' + from;
      this.hostData.fuseDone = this.hostData.fuseDone || new Set();
      const repeat = this.hostData.fuseDone.has(fk) && this.run.powerOn;
      this.hostData.fuseDone.add(fk);
      if (repeat) { this.net.sendTo(from, 'sys', { text: 'Diagnostics: all systems nominal.', kind: 'info' }); return; }
      if (!this.run.powerOn) {
        this.hostSetPower(true);
        this.net.broadcast('sys', { text: `${this.playerName(from)} restored the power.`, kind: 'good' });
      } else {
        for (const door of this.world.facility?.doors || []) if (door.kind === 'blast' && !door.open) this.hostSetDoor(door.id, true);
        this.net.broadcast('sys', { text: 'Security override: all secure doors opened.', kind: 'info' });
      }
      this.net.broadcast('xp', { to: from, xp: 70, coin: 10, reason: 'Fuse box repaired', bounty: { type: 'minigame', target: 'fuse' } });
    });
    H('fish', (d, from) => {
      if (!ITEMS[d.type] || ITEMS[d.type].kind !== 'fish') return;
      const p = posOf(from) || new THREE.Vector3();
      this.items.hostSpawn(d.type, p.clone().add(new THREE.Vector3(0, 1, 0)), { holder: d.slot >= 0 ? from : null, valueMul: 1 + this.run.quotaIndex * 0.05 });
      // hostSpawn with holder: we also need the slot -> handled by client picking the first free slot on 'sp'
    });
    H('shipdoor', (d, from) => {
      if (['landing', 'takeoff', 'orbit', 'fired'].includes(this.run.phase)) { this.net.sendTo(from, 'sys', { text: 'The door is sealed during flight.', kind: 'bad' }); return; }
      // state-set request, not a toggle: two players pressing at once end in the last request, and a request for the state the door
      // is already in (double press, stale label) is dropped instead of replaying the hydraulics for everybody
      if (this.ship.door.open === !!d.open) return;
      this.net.broadcast('door', { id: 'ship', open: !!d.open });
    });
    H('lever', (d, from) => this.hostLever(from));
    H('term', (d, from) => this.terminal.hostExecute(d.cmd, from));
    H('bell', (d, from) => this.hostSell(from));
    H('hit', (d, from) => {
      const c = this.creatures.host.get(d.cid);
      if (!c) return;
      if (c.type === 'leech' && c.state === 'ceiling') c.setState('fall');
      this.creatures.damage(d.cid, clamp(Number(d.dmg) || 0, 0, 400), from, { stun: clamp(Number(d.stun) || 0, 0, 8), crit: !!d.crit });
      // knockback: shove small/medium creatures away from the attacker (never into walls)
      const ap = posOf(from);
      if (ap && !c.dead && !c.def?.boss && c.maxHp !== null && !['mimicdoor', 'sandkefal', 'giant', 'web', 'leech'].includes(c.type)) {
        const dx = c.pos.x - ap.x, dz = c.pos.z - ap.z, L = Math.hypot(dx, dz) || 1;
        const k = 0.45 * clamp(d.kb || 1, 0.5, 3) * (d.crit ? 1.5 : 1);
        const nx = c.pos.x + (dx / L) * k, nz = c.pos.z + (dz / L) * k;
        const nav = this.creatures.nav(c);
        if (!nav || nav.walkableAt(nx, nz)) { c.pos.x = nx; c.pos.z = nz; }
      }
      if (c.type === 'leech' && c.hp <= 0 && c.extra) this.hostLatch(c, c.extra, false);
    });
    H('loadout', (d, from) => {
      const w = d.weapon;
      if (!w || !ITEMS[w] || ITEMS[w].kind !== 'weapon') return;
      for (const it of this.items.all()) if (it.soulbound === d.pid && it.type === w) return;
      this.items.hostSpawn(w, (posOf(from) || new THREE.Vector3()).clone().add(new THREE.Vector3(0, 1, 0)), { holder: from, soulbound: d.pid });
    });
    H('mimicdoor', (d, from) => {
      const c = this.creatures.host.get(d.cid);
      if (!c || c.type !== 'mimicdoor' || c.dead) return;
      c.setState('attack');
      this.hostHurtPlayer(from, 999, 'mimicdoor', c.id, c.pos);
    });
    H('noise', (d) => { if (Array.isArray(d.p) && d.p.length >= 3 && d.p.every(Number.isFinite)) this.creatures.noise(new THREE.Vector3().fromArray(d.p), clamp(Number(d.loud) || 0, 0, 4)); });
    H('charge', (d, from) => {
      const it = this.items.get(d.id);
      if (!it || it.holder !== from) return;
      const full = it.def.battery ? Math.round(it.def.battery * clamp(Number(d.mul) || 1, 1, 3)) : null;
      if (full) { it.battery = full; this.net.broadcast('itst', { id: it.id, b: full }); this.onItemState?.(it); }
      this.net.broadcast('fx', { k: 'snd', s: 'spark', p: [this.ship.points.charger?.x || 0, 1.2, this.ship.points.charger?.z || 0], v: 0.8 });
    });
    H('dropship', () => {});
    H('emote', () => {});
    H('killSelf', () => {});
    this.mods?.emit('registerHandlers', H, this);
  },

  // ------------------------------------------------------------------ phases
  hostSetPhase(phase, extra = {}) {
    this.run.phase = phase;
    Object.assign(this.run, extra);
    const msg = { phase, moon: this.run.moon, seed: this.run.seed, weather: this.run.weather, time: this.run.time, powerOn: this.run.powerOn, ...extra };
    this.markRunSent(msg);
    this.net.broadcast('phase', msg);
    this.hostAnnounce();
  },

  hostLever(from) {
    const run = this.run;
    const inShip = from === this.selfId ? this.player.inShip : insideShip(this.remotes.get(from)?.pos || new THREE.Vector3(0, -99, 0));
    if (!inShip) return;
    if (run.phase === 'orbit') {
      if (run.daysLeft <= 0 && run.moon !== 'hq') {
        this.net.sendTo(from, 'sys', { text: 'DEADLINE! Route to 0-Algorithm HQ and sell your scrap.', kind: 'bad' });
        return;
      }
      run.seed = Math.floor(Math.random() * 1e9);
      run.weather = MOONS[run.moon]?.company ? 'clear' : (run.forecast?.[run.moon] || 'clear');
      run.time = 480;
      run.powerOn = true;
      { const ev = MOONS[run.moon]?.company ? null : dailyEventFor(run.seed, run.day, run.moon); run.dailyEvent = ev ? { ...ev } : null; }   // copy: never mutate the event table
      this.meta?.weekly?.hostOnLever(run);   // weekly challenge: fixed seed per (week, day, moon) + weekly mutators merged into run.dailyEvent
      this.hostData.dayStats = this.freshDayStats();
      this.hostData.collected = new Set();
      this.hostData.pressureStage = 0;   // haul pressure is per day
      this.hostData.moonT = 0;
      this.hostData.fuseDone = new Set();   // fuse-box XP is once per player per DAY (new facility), not per session
      this.hostSetPhase('landing', { dailyEvent: run.dailyEvent });
      this.later(() => this.hostFinishLanding(), 9000);
    } else if (run.phase === 'moon' || run.phase === 'company') {
      this.hostBeginTakeoff('lever');
    }
  },

  hostFinishLanding() {
    if (this.run.phase !== 'landing') return;
    if (!MOONS[this.run.moon]) { this.run.moon = 'hamsi'; this.broadcastRun(['moon']); this.net.broadcast('sys', { text: 'Autopilot error: that moon is not installed on this ship. Landing aborted - rerouted to 56K-Dialup.', kind: 'bad' }); this.hostSetPhase('orbit'); return; }
    const moon = MOONS[this.run.moon];
    if (moon.company) {
      this.hostSetPhase('company');
      this.run.buyRate = buyRate(this.run.daysLeft, this.run.buyRnd);
      this.broadcastRun(['buyRate']);
    } else {
      this.hostSetPhase('moon');
      const ev = this.run.dailyEvent;
      this.net.broadcast('sys', { text: `DAILY EVENT: ${ev?.name || 'NORMAL FEED'} — ${ev?.desc || ''}`, kind: ev?.dangerMul > 1.15 ? 'warn' : 'info' });
      this.hostData.pressureStage = 0;
      this.hostData.moonT = 0;
      this.hostPopulateMoon();
      // blackout event: a real power cut (dims every peer's lights, opens secure doors); a fuse box restores it
      if (ev?.blackout && this.run.powerOn) this.hostSetPower(false);
    }
    this.net.broadcast('door', { id: 'ship', open: true });
  },

  hostBeginTakeoff(reason) {
    if (this.run.phase !== 'moon' && this.run.phase !== 'company') return;
    this.hostData.takeoffReason = reason;
    this.net.broadcast('door', { id: 'ship', open: false });
    // everybody outside the ship is left behind (only when the ship leaves at midnight / all dead)
    this.hostSetPhase('takeoff');
    this.later(() => this.hostFinishTakeoff(), 7000);
  },

  hostFinishTakeoff() {
    if (this.run.phase !== 'takeoff') return;
    const run = this.run;
    const moon = MOONS[run.moon];
    const hd = this.hostData;
    // who is aboard?
    const players = this.aiPlayers();
    // (standing in the doorway counts as aboard: the door leaf waits for them, so nobody is sealed out or 'left behind' on the sill)
    const aboardNow = (p) => p.inShip || inDoorway(p.pos);
    const aboard = players.filter((p) => !p.dead && aboardNow(p));
    const leftBehind = players.filter((p) => !p.dead && !aboardNow(p));
    for (const it of [...this.items.all()]) if (it.holder && leftBehind.some((p) => p.id === it.holder)) this.net.broadcast('it', { e: 'rm', id: it.id });
    hd.leftBehindIds = new Set(leftBehind.map((p) => p.id));
    for (const p of leftBehind) this.hostHurtPlayer(p.id, 999, 'left');
    const allDead = aboard.length === 0 && !moon.company;
    // scrap still lying around on the moon (for the performance grade)
    let leftValue = 0;
    if (!moon.company) for (const it of this.items.all()) {
      if (it.collected || it.holder || !isSellable(it.def) || it.soulbound || it.type === 'body' || insideShip(it.obj.position)) continue;
      leftValue += it.value;
    }
    // tally scrap on board
    let shipValue = 0;
    const shipItems = this.items.inShipItems();
    for (const it of shipItems) if (isSellable(it.def) && !it.soulbound) shipValue += it.value;
    for (const it of this.items.all()) if (it.holder && aboard.some((p) => p.id === it.holder) && isSellable(it.def) && !it.soulbound) shipValue += it.value;
    // deaths & fines
    const deaths = hd.dayStats.deaths.filter((dd) => !hd.leftBehindIds.has(dd.id)).concat(leftBehind.map((p) => ({ id: p.id, name: this.playerName(p.id), cause: 'left' })));
    let fines = 0;
    if (!moon.company) {
      for (const dd of deaths) {
        // a body still in the carrier's hands counts as delivered when the carrier is aboard
        const bodyInShip = shipItems.some((it) => it.type === 'body' && it.label === dd.name)
          || [...this.items.all()].some((it) => it.type === 'body' && it.label === dd.name && it.holder && aboard.some((p) => p.id === it.holder));
        fines += Math.round(run.credits * (bodyInShip ? 0.05 : 0.15));
      }
      fines = Math.min(fines, run.credits);
      run.credits -= fines;
    }
    // everyone dead -> scrap lost
    if (allDead) {
      for (const it of [...this.items.all()]) if (isSellable(it.def) && !it.soulbound) this.net.broadcast('it', { e: 'rm', id: it.id });
      for (const it of [...this.items.all()]) if (it.bag?.length) this.net.broadcast('it', { e: 'bag', id: it.id, bg: [] });
      shipValue = 0;
    }
    // bodies disappear (crew revives in orbit)
    for (const it of [...this.items.all()]) if (it.type === 'body') this.net.broadcast('it', { e: 'rm', id: it.id });
    const summary = {
      moon: moon.name, company: !!moon.company, collected: hd.dayStats.collected, shipValue, deaths, fines, allDead,
      kills: hd.dayStats.kills, day: run.day, quota: run.quota, sold: run.sold, daysLeft: moon.company ? run.daysLeft : Math.max(0, run.daysLeft - 1),
      leftValue, credits: run.credits,
      players: players.map((p) => ({ id: p.id, name: this.playerName(p.id), ...(hd.dayStats.per?.[p.id] || { loot: 0, kills: 0 }),
        dead: deaths.some((dd) => dd.id === p.id), cause: deaths.find((dd) => dd.id === p.id)?.cause })),
    };
    if (!moon.company) {
      run.daysLeft = Math.max(0, run.daysLeft - 1);
      run.day += 1;
      // survivors XP
      for (const p of aboard) this.net.broadcast('xp', { to: p.id, xp: 40 + moon.tier * 20 + run.quotaIndex * 10, coin: 5 + moon.tier * 3, reason: 'Survived the day', bounty: { type: 'survive', target: 'day' } }, true);
    }
    rollForecast(run);
    run.buyRnd = Math.random();
    run.time = 480;
    this.broadcastRun(['buyRnd']);
    this.net.broadcast('summary', summary);
    this.hostSetPhase('orbit', { daysLeft: run.daysLeft, day: run.day, credits: run.credits, forecast: run.forecast, powerOn: true });
    // quota evaluation after leaving the company on deadline day
    if (moon.company && run.daysLeft <= 0) this.hostEvaluateQuota();
    else if (run.daysLeft <= 0) {
      this.net.broadcast('sys', { text: 'Deadline reached. Route to 0-Algorithm HQ and sell!', kind: 'bad' });
      run.moon = 'hq';
      this.broadcastRun(['moon']);
    }
    this.hostSave();
  },

  hostEvaluateQuota() {
    const run = this.run;
    if (run.sold >= run.quota) {
      const surplus = run.sold - run.quota;
      const bonus = Math.floor(surplus / 5);
      run.credits += bonus;
      run.quotaIndex += 1;
      const prev = run.quota;
      run.quota = Math.round(prev + (nextQuota(prev, run.quotaIndex) - prev) * (this.config.quotaMul || 1));
      run.sold = 0;
      run.daysLeft = 3;
      this.broadcastRun(['credits', 'quotaIndex', 'quota', 'sold', 'daysLeft']);
      this.net.broadcast('sys', { text: `QUOTA MET! Overtime bonus ▮${bonus}. New quota: ▮${run.quota}`, kind: 'good' });
      this.net.broadcast('quotamet', { bonus, surplus, prev, quota: run.quota, quotaIndex: run.quotaIndex });
      this.net.broadcast('fx', { k: 'snd', s: 'ui_quota_met', p: [0, 1.5, 0], v: 1 });
      this.net.broadcast('xp', { xp: 150 + run.quotaIndex * 80, coin: 30 + run.quotaIndex * 15, reason: 'Quota met', quota: true });
    } else {
      this.net.broadcast('fired', { quotaIndex: run.quotaIndex, sold: run.sold, quota: run.quota, days: run.day });
      this.hostSetPhase('fired');
      const fresh = newRun();
      rollForecast(fresh);
      { const { phase, ...rest } = fresh; saveRun(this.saveSlot, { ...rest, shipItems: [], crew: [this.profile.name] }); }
      this.hostData.firedRun = true;
      this.later(() => {
        this.hostData.firedRun = false;
        for (const it of [...this.items.all()]) this.net.broadcast('it', { e: 'rm', id: it.id });
        this.net.broadcast('door', { id: 'ship', open: false });
        // reset the run IN PLACE (director/mods hold references) and clear fields the fresh run lacks on clients
        const cleared = {};
        for (const k of Object.keys(this.run)) if (!(k in fresh)) { cleared[k] = null; delete this.run[k]; }
        Object.assign(this.run, fresh);
        this._runSent?.clear();
        this.net.broadcast('gs', { ...cleared, ...fresh });
        this.hostSetPhase('orbit');
        this.hostSave();
        for (const r of [...this.remotes.keys(), this.selfId]) this.net.sendTo(r, 'tp', { p: this.ship.spawns[0].toArray(), yaw: Math.PI / 2 });
      }, 8000);
    }
  },

  hostSave() {
    if (this.destroyed || this.hostData?.firedRun) return;
    const held = [...this.items.all()].filter((it) => it.holder && !String(it.holder).startsWith('c:') && !it.soulbound && it.type !== 'body' && (this.run.phase === 'orbit' || this.run.phase === 'company'));
    const shipItems = [...this.items.inShipItems(), ...held].filter((it) => !it.soulbound && it.type !== 'body').map((it, k) => ({
      ty: it.type, v: it.value, bv: it.baseValue, p: it.holder ? [3.5 + (k % 4) * 0.5, 1.0, -1.5 + Math.floor(k / 4) * 0.5] : it.obj.position.toArray(), q: it.holder ? [0, 0, 0, 1] : it.obj.quaternion.toArray(), col: it.collected ? 1 : undefined, af: it.affix || undefined, b: it.battery ?? undefined, c: it.charges ?? undefined, am: it.ammo ?? undefined,
      bg: it.bag?.length ? it.bag.map((e) => ({ ...e })) : undefined, ...this.inventory?.saveFields?.(it),
    }));
    const { phase, ...rest } = this.run;
    saveRun(this.saveSlot, { ...rest, shipItems, crew: [this.profile.name, ...[...this.remotes.values()].map((r) => r.name)] });
  },

  // ------------------------------------------------------------------ moon population
  hostPopulateMoon() {
    const run = this.run;
    const moon = MOONS[run.moon];
    const fac = this.world.facility;
    const out = this.world.outdoor;
    if (!fac) return;
    const rng = new RNG(run.seed ^ 0x5eed);
    const event = run.dailyEvent || {};
    const danger = (moon.tier + run.quotaIndex * 0.35) * (this.config.dangerMul || 1) * (event.dangerMul || 1);
    this.hostData.danger = danger;
    const weatherBonus = { stormy: 1.2, eclipsed: 1.3, foggy: 1.1, rainy: 1.05 }[run.weather] || 1;
    const valueMul = moon.scrapMul * scrapValueMul(run.quotaIndex) * weatherBonus * (event.valueMul || 1);
    const table = scrapTableFor(fac.layout?.theme || moon.interior);   // per-theme loot (office, backrooms, serverfarm, sewer, hospital...)
    const tableW = table.map(([id, w]) => ({ id, w }));
    const afRng = new RNG((run.seed ^ 0xaff1c5) >>> 0);   // own stream: weapon affixes don't shift the world rolls
    const lootLvl = lootLevelFor(danger);
    // scrap inside
    const count = Math.round(rng.int(moon.scrapCount[0], moon.scrapCount[1]) + scrapCountBonus(run.quotaIndex));
    const spots = rng.shuffle(fac.scrapSpots.slice());
    spots.sort((a, b) => (b.item ? 1 : 0) - (a.item ? 1 : 0));   // set-piece spots that ask for an item (skull at blood trails) first
    for (let i = 0; i < Math.min(count, spots.length); i++) {
      const s = spots[i];
      const rolled = rng.weighted(tableW).id;
      const type = s.item || rolled;
      // Deep rooms are intentionally a little richer: exploration should pay for the extra danger.
      const depthMul = 1 + Math.min(0.22, Math.max(0, (s.dist || 0) - 5) * 0.018);
      const iid = this.items.hostSpawn(type, new THREE.Vector3(s.x, s.y + 0.5, s.z), { valueMul: valueMul * depthMul, af: rollWeaponAffixes(itemDef(type), lootLvl, afRng) });
      void iid;
    }
    // big physics valuables
    const bigN = Math.min(fac.bigSpots.length, rng.int(1, 2 + Math.floor(moon.tier / 2)));
    const bigSpots = rng.shuffle(fac.bigSpots.slice());
    const bigW = bigTableFor(fac.layout?.theme || moon.interior).map(([id, w]) => ({ id, w }));
    for (let i = 0; i < bigN; i++) this.items.hostSpawn(rng.weighted(bigW).id, new THREE.Vector3(bigSpots[i].x, bigSpots[i].y + 1, bigSpots[i].z), { valueMul });
    // One guaranteed deep-room prize makes the back half of a dungeon worth reaching.
    const deepBig = bigSpots.filter((s) => (s.dist || 0) >= 7);
    if (deepBig.length) {
      const s = deepBig[0];
      const prize = rng.pick(['goldbar', 'ring', 'figurine', 'trophy']);
      this.items.hostSpawn(prize, new THREE.Vector3(s.x + 0.7, s.y + 0.55, s.z - 0.5), { valueMul: valueMul * 1.65 });
    }
    // vault loot
    for (const s of fac.vaultSpots) {
      if (!rng.chance(0.8)) continue;
      const t = rng.pick(['goldbar', 'ring', 'figurine', 'goldbar', 'perfume', 'trophy', 'register']);
      this.items.hostSpawn(t, new THREE.Vector3(s.x, s.y + 0.5, s.z), { valueMul: valueMul * 1.4 });
    }
    // reactor core
    if (fac.reactorSpot) this.items.hostSpawn('reactor', fac.reactorSpot.clone().add(new THREE.Vector3(0, 0.6, 0)), { valueMul: 1 + run.quotaIndex * 0.1 });
    // keys
    for (let k = 0; k < 2; k++) { const s = rng.pick(fac.scrapSpots); if (s) this.items.hostSpawn('key', new THREE.Vector3(s.x, s.y + 0.4, s.z)); }
    // outdoor scrap
    for (const s of (out?.outdoorScrapSpots || []).slice(0, 3)) this.items.hostSpawn(rng.weighted(tableW).id, new THREE.Vector3(s.x, s.y + 0.6, s.z), { valueMul: valueMul * 0.8 * (event.outdoorMul || 1) });

    // outposts: scrap at the outdoor points of interest (value scaled by moon.scrapMul via valueMul) + crate handlers
    if (out?.outposts) hostPopulateOutposts(this, out.outposts, { table: tableW, valueMul });
    // hazards
    const codes = new Set((fac.doors || []).map((d) => d.code).filter(Boolean));
    const mkCode = () => { for (;;) { const c = String.fromCharCode(97 + rng.int(0, 25)) + rng.int(0, 9); if (!codes.has(c)) { codes.add(c); return c; } } };
    const nTur = Math.min(fac.turretSpots.length, Math.round((moon.creatures.turret || 0) / 5 + danger * 0.4));
    for (const s of rng.shuffle(fac.turretSpots.slice()).slice(0, nTur)) this.creatures.hostSpawn('turret', new THREE.Vector3(s.x, s.y, s.z), { yaw: s.rotY, code: mkCode(), state: 'idle' });
    const nMine = Math.min(fac.mineSpots.filter((s) => !s.web).length, Math.round((moon.creatures.mine || 0) / 4 + danger * 0.8));
    for (const s of rng.shuffle(fac.mineSpots.filter((q) => !q.web)).slice(0, nMine)) this.creatures.hostSpawn('mine', new THREE.Vector3(s.x, s.y, s.z), { code: mkCode(), state: 'armed' });
    // mimic doors (fake fire exits)
    const nMimicDoor = danger >= 1.5 ? rng.int(0, 1 + Math.floor(danger / 2.5)) : (rng.chance(0.3) ? 1 : 0);
    const ws = rng.shuffle((fac.wallSpots || []).filter((s) => s.dist > 4));
    for (const s of ws.slice(0, nMimicDoor)) this.creatures.hostSpawn('mimicdoor', new THREE.Vector3(s.x, s.y, s.z), { yaw: s.rotY, level: 1 + Math.floor(danger) });
    // initial creatures: ~35% of the indoor budget
    this.hostData.powerUsed = 0; this.hostData.outPowerUsed = 0; this.hostData.powerBoost = 0;
    this.hostData.spawnT = 20; this.hostData.outdoorSpawnT = 10;
    this.hostSpawnWave(0.35);
    this.bosses?.hostOnMoonPopulated();   // boss roll; idempotent (the mods 'moonPopulated' event triggers it too)
    this.mods?.emit('moonPopulated', this);
  },

  indoorBudget() {
    const moon = MOONS[this.run.moon];
    // Threat + sector scale (game.balance). Haul pressure used to be a flat +15 % per stage here: it is now part of the
    // Threat meter (greed term + a spike per stage), so it is not counted twice.
    const pressure = this.balance ? this.balance.scale().spawn : 1;
    // daily event danger (CONTENT PURGE +22%, QUIET FEED -22%...) scales the creature budget, not just the traps
    const ev = this.run.phase === 'moon' ? (this.run.dailyEvent?.dangerMul || 1) : 1;
    return (moon.power || 3) * indoorPowerMul(this.run.quotaIndex) * (this.config.dangerMul || 1) * ev * pressure + (this.hostData.powerBoost || 0);
  },

  rollLevel() {
    const moon = MOONS[this.run.moon];
    const base = creatureBaseLevel(moon.tier, this.run.quotaIndex);
    return Math.max(1, base + Math.floor(Math.random() * 4) - 1);
  },
  rollElite() {
    const moon = MOONS[this.run.moon];
    return Math.random() < 0.04 + moon.tier * 0.02 + this.run.quotaIndex * 0.01;
  },

  hostSpawnWave(fraction) {
    const fac = this.world.facility;
    const moon = MOONS[this.run.moon];
    if (!fac) return;
    const t = (this.run.time - 480) / (6 * 60);
    const allowed = this.indoorBudget() * clamp(Math.max(fraction, 0.35 + 0.65 * t), 0, 1);
    const weights = Object.entries(spawnTable(moon, 'in', this.run)).filter(([id]) => CREATURES[id] && !CREATURES[id].hazard && !CREATURES[id].boss && CREATURES[id].zone !== 'out').map(([id, w]) => ({ id, w }));
    if (!weights.length) return;
    let guard = 0;
    while (this.hostData.powerUsed < allowed && guard++ < 20) {
      const pick = weights[Math.floor(Math.random() * weights.length)] && (() => { let tot = 0; for (const e of weights) tot += e.w; let r = Math.random() * tot; for (const e of weights) { r -= e.w; if (r <= 0) return e; } return weights[0]; })();
      const def = CREATURES[pick.id];
      if (this.hostData.powerUsed + def.power > allowed + 0.5) break;
      if (!canSpawnMore(pick.id, this.creatures.host)) continue;   // per-type caps: one jester, one Parasocial, max 3 Moderators...
      if (this.hostSpawnCreatureIndoor(pick.id)) this.hostData.powerUsed += def.power;
    }
  },

  // Early-game fairness: for the first EARLY_SAFE_T seconds of a day nothing spawns within EARLY_SAFE_D metres
  // of walking distance from any facility door (main entrance + fire exits). Returns a spot filter or null.
  hostEarlySafeFilter(minDist = EARLY_SAFE_D) {
    const hd = this.hostData;
    const fac = this.world.facility;
    if (!fac || (hd.moonT || 0) >= EARLY_SAFE_T) return null;
    if (!hd.exitField || hd.exitField.fac !== fac) {
      const doors = [fac.mainDoor, ...(fac.fireDoors || [])].filter(Boolean);
      const pts = doors.map((d) => d.spawn || d.pos).filter(Boolean);
      const nav = fac.nav;
      const fields = typeof nav?.distanceField === 'function' ? pts.map((p) => nav.distanceField(p.x, p.z, Math.max(EARLY_SAFE_D, EARLY_SAFE_D_LETHAL) + 4)) : null;
      hd.exitField = { fac, pts, fields, nav };
    }
    const { pts, fields, nav } = hd.exitField;
    if (!pts.length) return null;
    return (s) => {
      for (let i = 0; i < pts.length; i++) {
        const d = fields ? nav.fieldAt(fields[i], s.x, s.z) : Infinity;
        // unreached / off-grid spots (e.g. vents in walls) fall back to straight-line distance
        const dd = d === Infinity ? Math.hypot(s.x - pts[i].x, s.z - pts[i].z) : d;
        if (dd < minDist && Math.abs((s.y ?? pts[i].y) - pts[i].y) < 6) return false;
      }
      return true;
    };
  },

  hostSpawnCreatureIndoor(type) {
    const fac = this.world.facility;
    if (!fac) return false;
    const players = this.aiPlayers().filter((p) => p.zone === 'in' && !p.dead);
    const farEnough = (s) => players.every((p) => p.pos.distanceTo(new THREE.Vector3(s.x, s.y, s.z)) > 14);
    const early = this.hostEarlySafeFilter(isLethalType(type) ? EARLY_SAFE_D_LETHAL : EARLY_SAFE_D);
    const ok = early ? (s) => farEnough(s) && early(s) : farEnough;
    const pickFrom = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
    const level = this.rollLevel(), elite = this.rollElite();
    if (type === 'leech') {
      const ceil = fac.ceilingSpots || [];
      const s = pickFrom(ceil.filter(ok)) || (early ? null : pickFrom(ceil));
      if (!s) return false;
      this.creatures.hostSpawn('leech', new THREE.Vector3(s.x, s.y, s.z), { state: 'ceiling', level, elite, up: true });
      return true;
    }
    const vents = (fac.ventSpots || []).filter(ok);
    const s = vents.length ? pickFrom(vents) : pickFrom((fac.scrapSpots || []).filter((q) => !q.elevated && ok(q)));   // never spawn creatures on catwalks
    if (!s) return false;
    const pos = new THREE.Vector3(s.x, s.y, s.z);
    if (s.obj) this.net.broadcast('fx', { k: 'snd', s: 'vent_crawl', p: [s.x, s.y + 0.5, s.z], v: 0.9 });
    const opts = { level, elite, zone: 'in' };
    if (type === 'mimic') { Object.assign(opts, this.mimicDisguise()); }
    if (type === 'jester') opts.state = 'box';
    if (type === 'scuttler') {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) this.creatures.hostSpawn('scuttler', pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)), { level: Math.max(1, level - 1), elite: elite && k === 0, zone: 'in' });
      return true;
    }
    this.creatures.hostSpawn(type, pos, opts);
    return true;
  },

  mimicDisguise() {
    const names = [this.profile.name, ...[...this.remotes.values()].map((r) => r.name)];
    const victim = names[Math.floor(Math.random() * names.length)];
    const suits = ['orange', 'green', 'blue', 'purple', 'orange'];
    const r = [...this.remotes.values()].find((q) => q.name === victim);
    const suitId = r ? r.suit : victim === this.profile.name ? this.profile.suit : suits[Math.floor(Math.random() * suits.length)];
    const peer = r ? r.id : this.selfId;
    return { name: victim, suit: suitColorOf(suitId), data: { voiceOf: peer }, fakeLv: r ? r.level : this.profile.level, fakeTitle: r ? (r.title || '') : victim === this.profile.name ? (this.helloData().title || '') : '' };
  },

  hostSpawnOutdoor() {
    const moon = MOONS[this.run.moon];
    const out = moon.outdoor || {};
    const entries = Object.entries(spawnTable(moon, 'out', this.run)).filter(([id]) => CREATURES[id] && !CREATURES[id].boss && canSpawnMore(id, this.creatures.host));
    if (!entries.length) return;
    const pressure = this.balance ? this.balance.scale().spawn : 1;   // (threat + sector scale; see indoorBudget)
    const budget = (moon.outdoorPower || 2) * outdoorPowerMul(this.run.quotaIndex) * (this.config.dangerMul || 1) * (this.run.dailyEvent?.dangerMul || 1) * pressure;
    if (this.hostData.outPowerUsed >= budget) return;
    let tot = 0; for (const [, w] of entries) tot += w;
    let r = Math.random() * tot, id = entries[0][0];
    for (const [k, w] of entries) { r -= w; if (r <= 0) { id = k; break; } }
    const def = CREATURES[id];
    this.hostData.outPowerUsed += def.power;
    // Outdoor encounters should pull crews toward points of interest instead of
    // spawning as distant background noise. Prefer a ring around the active
    // outpost network, while keeping the spawn out of immediate view.
    const op = this.world.outdoor?.outposts;
    const sites = op?.sites || [];
    const anchor = sites.length ? sites[Math.floor(Math.random() * sites.length)] : null;
    const ax = anchor?.x || 0, az = anchor?.z || 0;
    // early in the day keep outdoor spawns away from the ship and the main entrance (landing should not be a coin flip)
    const early = (this.hostData.moonT || 0) < EARLY_SAFE_T;
    const ent = this.world.outdoor?.mainExit?.pos;
    let x = 0, z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = anchor ? 18 + Math.random() * 22 : 70 + Math.random() * 35;
      x = ax + Math.cos(a) * d; z = az + Math.sin(a) * d;
      if (!early) break;
      if (Math.hypot(x, z) > 45 && (!ent || Math.hypot(x - ent.x, z - ent.z) > 35)) break;
      if (tries === 7) { this.hostData.outPowerUsed -= def.power; return; }   // no fair spot yet: try again next timer
    }
    const y = this.world.terrain?.heightAt(x, z) ?? 0;
    const opts = { level: this.rollLevel(), elite: this.rollElite(), zone: 'out' };
    if (id === 'mimic') Object.assign(opts, this.mimicDisguise());
    if (id === 'sandkefal') opts.state = 'hidden';
    if (id === 'hound') {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) this.creatures.hostSpawn('hound', new THREE.Vector3(x + k * 2, y, z + k), { ...opts });
      return;
    }
    this.creatures.hostSpawn(id, new THREE.Vector3(x, y, z), opts);
  },

  // ------------------------------------------------------------------ tick
  hostUpdate(dt) {
    const run = this.run;
    if (!run) return;
    const hd = this.hostData;
    if (run.phase === 'moon') {
      hd.moonT = (hd.moonT || 0) + dt;
      const rate = (16 * 60) / (this.config.dayLengthSec || 720);
      run.time += dt * rate;
      hd.lastTimeSync -= dt;
      if (hd.lastTimeSync <= 0) { hd.lastTimeSync = 3; this.broadcastRun(['time']); }
      // spawns
      hd.spawnT -= dt;
      const pace = this.balance ? this.balance.scale().pace : 1;   // the more you are hunted, the sooner the next wave
      if (hd.spawnT <= 0) { hd.spawnT = (45 + Math.random() * 35) / pace; this.hostSpawnWave(0); }
      const moon = MOONS[run.moon];
      const outdoorActive = run.weather === 'eclipsed' || run.time > 17 * 60;
      if (outdoorActive) {
        hd.outdoorSpawnT -= dt;
        if (hd.outdoorSpawnT <= 0) { hd.outdoorSpawnT = (40 + Math.random() * 40) / pace; this.hostSpawnOutdoor(); }
      }
      void moon;
      if (run.time >= 23 * 60 && !hd.alarmPlayed) {
        hd.alarmPlayed = true;
        this.net.broadcast('sys', { text: 'WARNING: The autopilot will leave at midnight!', kind: 'bad' });
        this.net.broadcast('fx', { k: 'snd', s: 'ship_alarm', p: [0, 2, 0], v: 1, r: 30, m: 400 });
      }
      if (run.time >= 24 * 60 - 1) { run.time = 24 * 60; hd.alarmPlayed = false; this.hostBeginTakeoff('midnight'); }
      // collected scrap rewards
      hd.collectT = (hd.collectT || 0) - dt;
      if (hd.collectT <= 0) {
        hd.collectT = 1;
        for (const it of this.items.inShipItems()) {
          if (it.collected || hd.collected.has(it.id) || !isSellable(it.def) || it.soulbound || it.type === 'body') continue;
          hd.collected.add(it.id);
          it.collected = true;
          hd.dayStats.collected += it.value;
          if (it.lastHolder) this.dayPer(it.lastHolder).loot += it.value;
          if (it.lastHolder) this.net.broadcast('xp', { to: it.lastHolder, xp: Math.round(it.value * 0.35), reason: 'Scrap secured', bounty: { type: 'collect', target: 'scrap', n: it.value }, silentSmall: true });
        }
        // Extraction should create tension, not merely reduce a number on the quota board.
        // Each secured chunk raises the encounter budget, making greedy crews attract more trouble.
        const q = Math.max(1, run.quota || 1);
        const secured = hd.dayStats.collected;
        const nextStage = secured >= q ? 3 : secured >= q * 0.7 ? 2 : secured >= q * 0.35 ? 1 : 0;
        if (nextStage > (hd.pressureStage || 0)) {
          hd.pressureStage = nextStage;
          this.balance?.onPressure?.(nextStage);   // greed: a spike on the Threat meter per stage
          const msg = nextStage === 1
            ? 'The haul is getting noticed. More creatures are moving in.'
            : nextStage === 2
              ? 'The crew is rich enough to be a target. Threat levels rising.'
              : 'QUOTA-SIZE HAUL SECURED. Everything nearby is getting hungry.';
          this.net.broadcast('sys', { text: msg, kind: nextStage >= 2 ? 'warn' : 'info' });
          this.hostSpawnWave(1);
          if (run.weather === 'eclipsed' || run.time > 17 * 60) this.hostSpawnOutdoor();
        }
      }
      // everyone dead?
      const ps = this.aiPlayers();
      if (ps.length && ps.every((p) => p.dead)) {
        hd.allDeadT += dt;
        if (hd.allDeadT > 4) { hd.allDeadT = 0; this.net.broadcast('sys', { text: 'All crew lost. The autopilot is returning to orbit.', kind: 'bad' }); this.hostBeginTakeoff('alldead'); }
      } else hd.allDeadT = 0;
      this.creatures.hostUpdate(dt);
    } else if (run.phase === 'company') {
      const cps = this.aiPlayers();
      if (cps.length && cps.every((p) => p.dead)) { hd.allDeadT = (hd.allDeadT || 0) + dt; if (hd.allDeadT > 4) { hd.allDeadT = 0; this.hostBeginTakeoff('alldead'); } } else hd.allDeadT = 0;
      this.creatures.hostUpdate(dt);
    }
    this.hostThrowables(dt);   // fuses tick in every phase (a grenade thrown before takeoff still goes off)
    // generic run-state sync: any top-level run field that changed (incl. ones other modules add) reaches clients
    hd.runSyncT = (hd.runSyncT || 0) - dt;
    if (hd.runSyncT <= 0) {
      hd.runSyncT = 1;
      this.markRunSent({ time: run.time });   // time has its own 3 s sync
      this.broadcastRun();
    }
    // lobby announce refresh
    hd.announceT = (hd.announceT || 0) - dt;
    if (hd.announceT <= 0) { hd.announceT = 5; this.hostAnnounce(); }
  },

  // ------------------------------------------------------------------ world interactions
  hostSetDoor(id, open, silent) {
    const door = this.doorById(id);
    if (!door) return;
    if (door.open === open) return;
    this.net.broadcast('door', { id, open, locked: door.locked, silent });
  },
  hostSetPower(on) {
    this.run.powerOn = on;
    this.net.broadcast('power', { on });
    if (!on) for (const d of this.world.facility?.doors || []) if (d.kind === 'blast' && !d.open) this.hostSetDoor(d.id, true);
  },

  hostHurtPlayer(id, dmg, cause, fromId, fromPos) {
    if (!id) return;
    // Sector scale + early-game hit cap for EVERY creature / trap hit, whichever behaviour (built in or a module's) made
    // it: the source is a host creature id. Players, lightning, 'left behind' and the like are never scaled.
    if (fromId && this.balance) { const src = this.creatures?.host?.get(fromId); if (src) dmg = this.balance.hitDamage(dmg, src); }
    const p = fromPos ? [fromPos.x, fromPos.y, fromPos.z] : null;
    this.net.sendTo(id, 'hurt', { dmg, cause, from: fromId, p });
  },
  hostStunPlayer(id, t) { this.net.sendTo(id, 'stun', { t }); },
  hostSlowPlayer(id, t) { this.net.sendTo(id, 'slow', { t }); },
  hostHoldPlayer(id, pos) { this.net.sendTo(id, 'hold', { p: [pos.x, pos.y, pos.z] }); },
  hostLatch(c, playerId, on) { this.net.broadcast('latch', { cid: c.id, pid: playerId, on }); },

  hostExplosion(pos, radius, dmg, sourceId) {
    this.net.broadcast('fx', { k: 'explode', p: [pos.x, pos.y, pos.z] });
    this.creatures.noise(pos, 4);
    for (const p of this.aiPlayers()) {
      if (p.dead) continue;
      const d = p.pos.distanceTo(pos);
      if (d < radius) this.hostHurtPlayer(p.id, Math.round(dmg * (1 - d / radius) + (d < radius * 0.4 ? 60 : 0)), 'explosion', sourceId, pos);
    }
    for (const c of this.creatures.host.values()) {
      if (c.dead || c.def.hazard) continue;
      const d = c.pos.distanceTo(pos);
      if (d < radius) this.creatures.damage(c.id, dmg * (1 - d / radius), 'explosion', { stun: 1.5 });
    }
  },

  hostDamageItem(id, amt) {
    const it = this.items.get(id);
    if (!it || !it.value) return;
    const v = Math.max(0, Math.round(it.value - amt));
    if (v === it.value) return;
    this.net.broadcast('it', { e: 'val', id, v });
    if (v <= 0 && it.def.fragile) {
      const p = it.obj.position;
      this.net.broadcast('fx', { k: 'snd', s: 'glass_break', p: [p.x, p.y, p.z], v: 1 });
      this.net.broadcast('it', { e: 'rm', id });
    }
  },

  hostArmThrowable(it, fuse) {
    const l = (this.hostData.throwables = this.hostData.throwables || []);
    const i = l.findIndex((t) => t.id === it.id);
    if (i >= 0) l.splice(i, 1);   // re-thrown grenade: restart its fuse instead of detonating on the old timer
    l.push({ id: it.id, t: clamp(Number(fuse) || 2.2, 0.5, 6), type: it.type });
  },
  hostThrowables(dt) {
    const list = this.hostData.throwables;
    if (!list?.length) return;
    for (const th of [...list]) {
      th.t -= dt;
      if (th.t > 0) continue;
      list.splice(list.indexOf(th), 1);
      const it = this.items.get(th.id);
      if (!it || it.state !== 'world') continue;
      const pos = it.obj.position.clone();
      if (th.type === 'stungrenade') {
        this.net.broadcast('fx', { k: 'stunbang', p: [pos.x, pos.y, pos.z] });
        this.creatures.noise(pos, 3);
        for (const c of this.creatures.host.values()) if (!c.dead && c.pos.distanceTo(pos) < 12 && this.physics.lineOfSight(pos, c.pos.clone().add(new THREE.Vector3(0, 1, 0)))) this.creatures.damage(c.id, 0, 'stun', { stun: 5 });
        this.net.broadcast('it', { e: 'rm', id: it.id });
      }
    }
  },

  hostBoomboxNear(pos, r) {
    for (const it of this.items.all()) {
      if (it.type !== 'boombox' || !it.on) continue;
      const p = it.holder ? (this.aiPlayerById(it.holder)?.pos) : it.obj.position;
      if (p && p.distanceTo(pos) < r) return true;
    }
    return false;
  },

  hostFindLooseScrap(pos, r, c) {
    let best = null, bd = r;
    for (const it of this.items.all()) {
      if (it.state !== 'world' || it.owner || it.carrier || !isSellable(it.def) || it.def.kind === 'big' || it.type === 'body') continue;
      if (it.nest && it.nest === c.id && it.obj.position.distanceTo(c.data.nest) < 3) continue;
      if (insideShip(it.obj.position)) continue;
      const d = it.obj.position.distanceTo(pos);
      if (d < bd && Math.abs(it.obj.position.y - pos.y) < 3) { bd = d; best = it; }
    }
    return best;
  },
  hostCreatureTakeItem(c, it) {
    c.data.carry = it.id;
    it.carrier = c.id;
    this.net.broadcast('it', { e: 'held', id: it.id, h: 'c:' + c.id, sl: 0 });
    this.creatures.sound(c, 'yoinker_yippee', 1);
  },
  hostCreatureDropItem(c, atNest) {
    const it = this.items.get(c.data.carry);
    c.data.carry = null;
    if (!it) return;
    it.carrier = null;
    if (atNest) it.nest = c.id;
    const p = c.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.8, (Math.random() - 0.5)));
    this.net.broadcast('it', { e: 'drop', id: it.id, p: [p.x, p.y, p.z], q: [0, 0, 0, 1], nest: atNest ? c.id : undefined });
  },
  hostSpawnRandomScrap(pos) {
    const table = scrapTableFor(this.world.facility?.layout?.theme || MOONS[this.run?.moon]?.interior).map(([id, w]) => ({ id, w }));
    let tot = 0; for (const e of table) tot += e.w;
    let r = Math.random() * tot; let id = table[0].id;
    for (const e of table) { r -= e.w; if (r <= 0) { id = e.id; break; } }
    this.items.hostSpawn(id, pos, {});
  },

  hostOnCreatureKilled(c, by) {
    this.hostData.dayStats.kills += 1;
    if (by) this.dayPer(by).kills += 1;
    const players = this.aiPlayers();
    for (const p of players) {
      const share = p.id === by ? 1 : (c.attackers.has(p.id) ? 0.5 : (p.zone === c.zone && p.pos.distanceTo(c.pos) < 30 ? 0.25 : 0));
      if (share <= 0) continue;
      this.net.broadcast('xp', { to: p.id, xp: Math.round(c.xp * share), coin: Math.round(c.coin * share), reason: `${c.def.name} slain`, bounty: p.id === by ? { type: 'kill', target: c.type } : null, kill: p.id === by ? c.type : null });
    }
  },

  hostOnPlayerDied(id, d) {
    const pos = d.pos ? new THREE.Vector3().fromArray(d.pos) : (this.aiPlayerById(id)?.pos || new THREE.Vector3());
    const name = this.playerName(id);
    this.hostData.dayStats?.deaths.push({ id, name, cause: d.cause });
    if (d.cause !== 'left') this.balance?.onDeath?.(id);   // relief: the building eases off after a death
    if (d.cause !== 'left' && d.cause !== 'sandkefal' && d.cause !== 'giant' && d.cause !== 'void') {
      this.items.hostSpawn('body', pos.clone().add(new THREE.Vector3(0, 0.6, 0)), { value: 0, label: name });
    }
    // drop their soulbound gear? (kept) — release their latches
    for (const c of this.creatures.host.values()) if (c.type === 'leech' && c.extra === id) { this.hostLatch(c, id, false); c.extra = 0; c.setState('walk'); }
  },

  hostLightningStrike() {
    if (this.run.phase !== 'moon') return;
    // lightning prefers metal items held outdoors
    const candidates = [];
    for (const it of this.items.all()) {
      if (!['shovel', 'pipe', 'stopsign', 'sledge', 'bolt', 'axle', 'cog', 'goldbar', 'pot', 'machete'].includes(it.type)) continue;
      const pos = it.holder ? this.aiPlayerById(it.holder)?.pos : it.obj.position;
      if (!pos || pos.y < -200 || insideShip(pos)) continue;
      candidates.push(pos.clone());
    }
    let target;
    if (candidates.length && Math.random() < 0.5) target = candidates[Math.floor(Math.random() * candidates.length)];
    else {
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 90;
      target = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      target.y = this.world.terrain?.heightAt(target.x, target.z) ?? 0;
    }
    this.net.broadcast('fx', { k: 'lightning', p: [target.x, target.y, target.z] });
    for (const p of this.aiPlayers()) if (!p.dead && p.pos.distanceTo(target) < 3) this.hostHurtPlayer(p.id, 999, 'lightning');
  },

  hostSell(from) {
    const c = this.world.company;
    if (!c || this.run.phase !== 'company') return;
    const zone = c.interactables.find((i) => i.type === 'sellzone');
    if (!zone) return;
    const half = zone.size.clone().multiplyScalar(0.5);
    const inZone = [];
    for (const it of this.items.all()) {
      if (it.state !== 'world' || it.selling || !isSellable(it.def) || it.soulbound || it.type === 'body') continue;
      const p = it.obj.position;
      if (Math.abs(p.x - zone.pos.x) < half.x + 0.3 && Math.abs(p.z - zone.pos.z) < half.z + 0.6 && p.y > zone.pos.y - 1 && p.y < zone.pos.y + 2.5) inZone.push(it);
    }
    this.net.broadcast('fx', { k: 'snd', s: 'company_bell', p: [zone.pos.x, zone.pos.y, zone.pos.z], v: 1 });
    if (!inZone.length) { this.net.sendTo(from, 'sys', { text: 'Place scrap on the counter first, then ring the bell.', kind: 'info' }); return; }
    if (this.hostData.selling) return;
    this.hostData.selling = true;
    for (const it of inZone) it.selling = true;
    const rate = buyRate(this.run.daysLeft, this.run.buyRnd) * (this.run.favor || 1);
    let total = 0;
    const list = [];
    for (const it of inZone) { const v = Math.round(it.value * rate); total += v; list.push({ name: affixDisplayName(it.def.name, it.affix), v, type: it.type }); }
    this.later(() => {
      this.hostData.selling = false;
      for (const it of inZone) this.net.broadcast('it', { e: 'rm', id: it.id });
      this.run.credits += total;
      this.run.sold += total;
      this.broadcastRun(['credits', 'sold']);
      this.net.broadcast('sell', { total, rate, list, by: from });
      const players = this.aiPlayers();
      const n = Math.max(1, players.length);
      for (const p of players) this.net.broadcast('xp', { to: p.id, xp: Math.round(total * 0.25 / Math.sqrt(n)), coin: Math.round(total * 0.1 / n), reason: 'Scrap sold', bounty: { type: 'sell', target: 'value', n: total } });
      this.hostSave();
    }, 2600);
    this.net.broadcast('sell', { pending: true, count: inZone.length });
  },
};

// local import to avoid a cycle with remote.js at module-eval time
import { suitColor as suitColorOf } from '../entities/remote.js';
