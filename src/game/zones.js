// ZONES (wave 5, MASTERPLAN §26 v1): the "reclaim the sectors" meta layer. Installed with `this.useModule('zones', installZones)` in game.js. Docs: docs/wave5/zones.md
//   1. every charted / voyage moon is split (seeded) into 3-6 zones, each with a core (signal relay) placed on reachable ground at landing time
//   2. CAPTURE  clear the area (no hostile within 28 m for 20 s), stand at the core, press E: plant a Beacon (credits, 4 s) -> zone owned (crew colour pillar + border ring)
//   3. FORTIFY  in an owned zone build defences from the sector-map panel (existing deployables: turrets, tesla, barricades, spikes, mines, floodlight, shield)
//   4. INCOME   each day every owned zone pays credits + biome material, hard-capped (25 % of the quota), minus defence upkeep; capped offline catch-up
//   5. ATTACK   at day end the Algorithm votes 1-2 owned zones (never before quota 2). Crew on that moon at dusk -> live defence (siege waves); else auto-resolve
//   6. MAP      terminal `ZONES` + the sector-map panel (src/ui/panels/zones.js)
// Net (all 'zn*'): 'znreq' client -> host {op}, 'znx' host -> everyone {k} (state 1 Hz: cores, clear timers, planting, live defence). State: run.zn (synced + saved).
// Host-authoritative: the host owns run.zn, the creatures, the credits. Clients render + send requests.
import * as THREE from 'three';
import { MOONS, MOON_ORDER } from './moons.js';
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, t, tf, tfIn, tIn, sysMsg } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { saveProfile } from '../core/save.js';
import { generateVoyageMoon, isVoyageId } from './voyage_core.js';
import * as Z from './zones_core.js';
import { TR, RU } from './zones_i18n.js';
import { createZonesPanel } from '../ui/panels/zones.js';

const ZN = Z.ZN, SG = Z.SG;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const STYLE = `.zn-bar{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);min-width:260px;padding:6px 12px;background:rgba(6,10,16,.9);border:1px solid #f0b040;border-left:5px solid #f0b040;color:#ffe7b0;font:15px var(--font2,monospace);z-index:6;pointer-events:none;text-align:center;letter-spacing:1px}
.zn-bar i{display:block;height:4px;margin-top:5px;background:rgba(255,255,255,.14)}.zn-bar i b{display:block;height:100%;background:#f0b040;width:0}`;

export function installZones(game) {
  const mods = game.mods;
  if (!mods) return null;
  const fresh = (map, l) => Object.fromEntries(Object.entries(map).filter(([k]) => tIn(l, k) === k));   // never override another module's entry
  addTranslations(fresh(TR, 'tr'), 'tr'); addTranslations(fresh(RU, 'ru'), 'ru');
  HOST_ONLY.add('znx');
  const offs = [], restores = [];
  let disposed = false, boundNet = null;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const host = () => !!game.isHost;
  const enabled = () => game.config?.zones !== false;
  const run = () => game.run;
  const runKey = () => String(run()?.runId ?? 'legacy');
  if (typeof document !== 'undefined' && !document.getElementById('tfg-zones-style')) { const s = document.createElement('style'); s.id = 'tfg-zones-style'; s.textContent = STYLE; document.head.appendChild(s); }

  const say = (key, vars, kind = 'info') => game.net?.broadcast('sys', sysMsg(key, vars || {}, kind));
  const znx = (d) => game.net?.broadcast('znx', d);
  const replyTo = (to, text, err, vars) => game.net?.sendTo(to, 'term', { to, text: tfIn('en', text, vars || {}), k: vars ? text : undefined, v: vars, err, cls: err ? 'err' : '' });
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };

  // ------------------------------------------------------------------------------------------ state helpers (run.zn)
  const zn = () => { const r = run(); if (!r) return null; r.zn = Z.ensureState(r.zn, runKey()); return r.zn; };
  const pushZn = (...extra) => { if (host()) game.broadcastRun(['zn', ...extra]); };
  const moonDef = (id) => MOONS[id] || (isVoyageId(id) ? generateVoyageMoon(id) : null);
  const moonName = (id) => moonDef(id)?.name || id;
  const isActive = (id) => Z.zonesEligible(moonDef(id));
  const spec = (id) => { const m = moonDef(id); return m && Z.zonesEligible(m) ? Z.zoneSpec(m, runKey()) : null; };
  const zoneOf = (m, z) => spec(m)?.zones.find((q) => q.id === z) || null;
  const qi = () => run()?.quotaIndex | 0;
  const ownedCount = () => Z.listZones(zn(), isActive).filter((e) => e.active && e.st.s === 'own').length;
  const crewSize = () => Math.max(1, game.aiPlayers?.().filter((p) => !p.dead).length || 1);
  const bumpProfile = (k) => { try { const p = game.profile; if (!p) return; p.zn = p.zn || { captured: 0, held: 0, lost: 0 }; p.zn[k] = (p.zn[k] | 0) + 1; saveProfile(p); } catch { /* optional */ } };
  const mineNow = () => (run()?.phase === 'moon' ? run().moon : null);

  // ------------------------------------------------------------------------------------------ runtime (both sides)
  const S = {
    cores: [], coresKey: '', clr: {}, plant: null, live: null,     // client copy of the host's 1 Hz state
    views: new Map(), viewKey: '', inter: [], interKey: '',
    host: { deps: new Map(), plant: null, clearT: {}, clearAcc: 0, sendT: 0, live: null, coresFor: '', matT: 0 },
    panel: null, barEl: null,
  };
  const coreOf = (id) => S.cores.find((c) => c.id === id) || null;
  const me = () => game.player;

  // ============================================================================================ HOST: cores (placed per landing on the real terrain)
  function hostComputeCores() {
    const r = run(), m = moonDef(r.moon), ter = game.world?.terrain;
    if (!Z.zonesEligible(m) || !ter?.plan) { S.cores = []; S.coresKey = ''; return; }
    const key = `${r.seed}:${r.moon}`;
    if (S.coresKey === key && S.cores.length) return;
    const sp = Z.zoneSpec(m, runKey());
    const placed = Z.placeCores(sp, ter.plan, Z.coreProbe(ter), ter.playHalf, runKey());
    S.cores = placed.filter((c) => c.x !== null).map((c) => ({ id: c.id, x: c.x, z: c.z, y: ter.heightAt(c.x, c.z) }));
    S.coresKey = key;
    S.host.clearT = {}; S.host.plant = null;
    game.later(() => { try { materialize(); } catch (e) { console.warn('[zones] materialize', e); } }, 2500);
  }

  // ============================================================================================ HOST: hostile scan (capture rule) + planting
  const hostile = (c) => !c.dead && c.def && !c.def.hazard && (c.def.dmg > 0 || c.def.siege) && c.maxHp !== null && c.state !== 'hidden';
  function hostileNear(core, R = ZN.clearR) {
    const list = game.creatures?.host;
    if (!list) return false;
    for (const c of list.values()) if (hostile(c) && flat(c.pos, core) < R && Math.abs(c.pos.y - core.y) < 14) return true;
    return false;
  }
  const playersNear = (core, R) => game.aiPlayers().filter((p) => !p.dead && !p.inShip && flat(p.pos, core) < R);
  function stateCtx(zid, from) {
    const r = run(), core = S.cores.find((c) => c.id === zid), m = r.moon, zone = zoneOf(m, zid), st = Z.getZ(zn(), m, zid);
    const p = from != null ? game.aiPlayerById(from) : null;
    return { core, m, zone, st, p, r };
  }
  function hostStartPlant(zid, from) {
    const { core, m, zone, st, p, r } = stateCtx(zid, from);
    if (!core || !zone || !p) return;
    if (S.host.plant) { replyTo(from, 'A beacon is already being planted.', true); return; }
    const owned = ownedCount();
    const cost = Z.captureCost(moonDef(m), zone, owned, st?.s === 'inf');
    const res = Z.canCapture({ phase: r.phase, moonId: m, currentMoon: r.moon, dist: flat(p.pos, core), quotaIndex: qi(), minQ: zone.minQ, credits: r.credits, cost, owned, st, clearT: S.host.clearT[zid] || 0, hostileNear: hostileNear(core), dead: p.dead });
    if (!res.ok) { game.net.sendTo(from, 'znx', { k: 'deny', why: res.why }); return; }
    S.host.plant = { z: zid, by: from, t: 0, cost, m };
    znx({ k: 'plant', z: zid, p: 0 });
    game.net.broadcast('fx', { k: 'snd', s: 'scan', p: [core.x, core.y + 1, core.z], v: 0.8 });
  }
  function hostTickPlant(dt) {
    const pl = S.host.plant;
    if (!pl) return;
    const core = S.cores.find((c) => c.id === pl.z), p = game.aiPlayerById(pl.by), r = run();
    const cancel = (why) => { S.host.plant = null; znx({ k: 'plant', z: pl.z, p: -1 }); if (why) game.net.sendTo(pl.by, 'znx', { k: 'deny', why }); };
    if (!core || !p || p.dead || flat(p.pos, core) > ZN.plantR + 1.5) { cancel('Beacon cancelled: stay next to the core.'); return; }
    if (hostileNear(core)) { cancel('Beacon cancelled: hostiles near the core.'); return; }
    if (r.credits < pl.cost) { cancel('Not enough credits for a beacon.'); return; }
    pl.t += dt;
    pl.tx = (pl.tx || 0) - dt;
    if (pl.tx <= 0) { pl.tx = 0.25; znx({ k: 'plant', z: pl.z, p: Math.min(1, pl.t / ZN.plantSec) }); }
    if (pl.t >= ZN.plantSec) { S.host.plant = null; hostCapture(pl); }
  }
  function hostCapture(pl) {
    const r = run(), z = zn(), zone = zoneOf(pl.m, pl.z), old = Z.getZ(z, pl.m, pl.z);
    r.credits -= pl.cost;
    Z.setZ(z, pl.m, pl.z, { s: 'own', d: old?.d && old.s === 'inf' ? old.d : {}, up: old?.up | 0, since: r.day | 0 });
    z.stat.cap = (z.stat.cap | 0) + 1;
    bumpProfile('captured');
    pushZn('credits');
    znx({ k: 'taken', z: pl.z, m: pl.m });
    say('ZONE CAPTURED: {z} on {m}. Beacon online.', { z: zone?.name || pl.z, m: moonName(pl.m) }, 'good');
    algo('taken', { z: zone?.name || pl.z, m: moonName(pl.m) });
    game.net.broadcast('fx', { k: 'snd', s: 'quota_met', p: [0, 1.5, 0], v: 0.6 });
    try { game.hostSave?.(); } catch { /* optional */ }
    materialize();
  }

  // ============================================================================================ HOST: defences (existing deployables through debugPlace)
  const RING_OUT = new Set(['barr_wood', 'barr_metal', 'spikes', 'mine']);
  function expandDefs(st) { const out = []; for (const id of Z.DEF_IDS) for (let i = 0; i < (st?.d?.[id] | 0); i++) out.push(id); return out; }
  function clearZoneDeps(key) {
    const D = game.deployables, ids = S.host.deps.get(key) || [];
    for (const id of ids) { try { D?.destroy?.(id, 'clear'); } catch { /* gone */ } }
    S.host.deps.delete(key);
  }
  function materializeZone(m, zid) {
    const D = game.deployables, core = S.cores.find((c) => c.id === zid), st = Z.getZ(zn(), m, zid);
    const key = `${m}:${zid}`;
    clearZoneDeps(key);
    if (!D?.debugPlace || !core || st?.s !== 'own') return;
    const list = expandDefs(st), ids = [], ter = game.world?.terrain;
    const base = (hashString(key + runKey()) % 628) / 100;
    list.forEach((def, k) => {
      const a = base + k * 2.399, out = RING_OUT.has(def), rad = out ? 9.5 + (k % 3) * 1.4 : 4.5 + (k % 3) * 1.3;
      const x = core.x + Math.cos(a) * rad, zz = core.z + Math.sin(a) * rad;
      if (ter && Math.hypot(x, zz) < 13) return;   // never on the ship pad
      const dep = D.debugPlace(def, x, zz, a + Math.PI, null, null);
      if (dep) { ids.push(dep.id); if (st.dry && dep.def?.supply) dep.res = 0; }
    });
    S.host.deps.set(key, ids);
  }
  function materialize() {
    if (!host() || run()?.phase !== 'moon') return;
    const m = run().moon;
    for (const c of S.cores) if (Z.getZ(zn(), m, c.id)?.s === 'own') materializeZone(m, c.id);
  }
  function hostBuild(d, from) {
    const r = run(), p = game.aiPlayerById(from), m = r.moon, core = S.cores.find((c) => c.id === d.z);
    if (!p || !core || r.phase !== 'moon') return;
    const st = Z.getZ(zn(), m, d.z);
    const res = Z.canBuild({ def: d.def, st, dist: flat(p.pos, core), quotaIndex: qi(), credits: r.credits });
    if (!res.ok) { game.net.sendTo(from, 'znx', { k: 'deny', why: res.why }); return; }
    r.credits -= Z.DEFS[d.def].cost;
    st.d = { ...(st.d || {}), [d.def]: ((st.d || {})[d.def] | 0) + 1 };
    pushZn('credits');
    materializeZone(m, d.z);
    game.net.broadcast('fx', { k: 'snd', s: 'lockpick_success', p: [core.x, core.y + 1, core.z], v: 0.7 });
  }
  function hostSell(d, from) {
    const r = run(), p = game.aiPlayerById(from), m = r.moon, core = S.cores.find((c) => c.id === d.z);
    const st = Z.getZ(zn(), m, d.z);
    if (!p || !core || !st || st.s !== 'own' || !Z.DEFS[d.def] || !(st.d?.[d.def] > 0) || flat(p.pos, core) > ZN.zoneR) return;
    st.d[d.def] -= 1; if (st.d[d.def] <= 0) delete st.d[d.def];
    r.credits += Math.floor(Z.DEFS[d.def].cost * 0.5);
    pushZn('credits');
    materializeZone(m, d.z);
  }
  function hostUp(d, from) {
    const r = run(), st = Z.getZ(zn(), d.m, d.z);
    if (!st || st.s !== 'own' || (st.up | 0) >= ZN.maxUp) return;
    const cost = ZN.upCost[st.up | 0];
    if (r.credits < cost) { game.net.sendTo(from, 'znx', { k: 'deny', why: 'Not enough credits.' }); return; }
    r.credits -= cost; st.up = (st.up | 0) + 1;
    pushZn('credits');
  }

  // ============================================================================================ HOST: the day tick (income, upkeep, resolve last night's attack, vote for the next one)
  const algo = (kind, v) => znx({ k: 'algo', kind, v, seed: hashString(`${runKey()}:${run()?.day}:${kind}:${v?.z || ''}`) });
  const zoneKey = (e) => `${e.m}:${e.z}`;
  function dayTick() {
    const r = run(), z = zn();
    if (!z || !enabled()) return;
    const out = [];
    const rng = new RNG(hashString(`${runKey()}:zday:${r.day}`));
    // 1. resolve pending attacks nobody defended live
    for (const pe of z.pend.splice(0)) {
      const st = Z.getZ(z, pe.m, pe.z), zone = zoneOf(pe.m, pe.z);
      if (!st || st.s !== 'own' || !zone) continue;
      const res = Z.resolveAuto(Z.defencePower(st, !!st.dry), zone.threat, qi(), crewSize(), rng.next());
      settle(pe.m, pe.z, res.win, res.credits, false, out);
    }
    // 2. income + upkeep of everything still owned on a reachable moon
    const own = Z.listZones(z, isActive).filter((e) => e.active && e.st.s === 'own');
    const rows = own.map((e) => Z.zoneIncome(moonDef(e.m), zoneOf(e.m, e.z), e.st));
    const inc = Z.capIncome(rows, r.quota);
    const up = Z.payUpkeep(r.credits + inc.credits, own.map((e) => ({ key: zoneKey(e), st: e.st })));
    for (const e of own) e.st.dry = up.dry.includes(zoneKey(e)) ? 1 : 0;
    r.credits = Math.max(0, r.credits + inc.credits - up.paid);
    z.stat.earned = (z.stat.earned | 0) + inc.credits;
    z.rep = { day: r.day | 0, income: inc.credits, gross: inc.gross, capped: inc.capped, upkeep: up.paid, dry: up.dry.length, n: own.length };
    if (own.length) {
      say('ZONES: +▮{i} income, -▮{u} upkeep from {n} zones.', { i: inc.credits, u: up.paid, n: own.length }, 'info');
      if (inc.capped) algo('cap', {});
      if (up.dry.length) say('Upkeep unpaid on {n} zones: their defences run at 40%.', { n: up.dry.length }, 'warn');
    }
    dropMaterials(inc.mats);
    // 3. the Algorithm picks tonight's targets (never before quota 2)
    z.pend = Z.pickAttacks(z, qi(), rng, isActive).map((pk) => ({ ...pk, d: r.day | 0 }));
    for (const pk of z.pend) {
      const zone = zoneOf(pk.m, pk.z), v = { z: zone?.name || pk.z, m: moonName(pk.m) };
      say('THREAT: the Algorithm targets {z} on {m}. Fly there to defend it live, or the defences hold it alone.', v, 'warn');
      algo('vote', v);
    }
    z.day = r.day | 0; z.rt = Date.now();
    pushZn('credits');
    for (const line of out) say(line.k, line.v, line.kind);
  }
  function settle(m, zid, win, credits, live, out) {
    const r = run(), z = zn(), st = Z.getZ(z, m, zid), zone = zoneOf(m, zid), v = { z: zone?.name || zid, m: moonName(m) };
    if (!st) return;
    if (win) {
      const bonus = Math.round(credits * (live ? 1.5 : 1));
      r.credits += bonus; z.stat.held = (z.stat.held | 0) + 1; bumpProfile('held');
      out.push({ k: live ? 'ZONE HELD LIVE: {z} on {m}. Bonus ▮{c}.' : 'Zone {z} on {m} held on its own. Bonus ▮{c}.', v: { ...v, c: bonus }, kind: 'good' });
      dropMaterials({ [Z.matOf(moonDef(m))]: 2 });
      algo('held', v);
    } else {
      st.s = 'inf'; st.dry = 0;
      for (const k of Object.keys(st.d || {})) { st.d[k] = Math.floor(st.d[k] / 2); if (!st.d[k]) delete st.d[k]; }
      z.stat.lost = (z.stat.lost | 0) + 1; bumpProfile('lost');
      out.push({ k: 'ZONE LOST: {z} on {m} is infected. No income until you recapture it.', v, kind: 'bad' });
      algo('lost', v);
    }
    z.pend = z.pend.filter((p) => !(p.m === m && p.z === zid));
    pushZn('credits');
  }
  function dropMaterials(mats) {
    const items = game.items;
    if (!items?.hostSpawn) return;
    let k = 0;
    for (const [id, n] of Object.entries(mats || {})) for (let i = 0; i < n; i++) {
      game.later(() => { try { items.hostSpawn(id, new THREE.Vector3(4.5 + Math.random() * 1.5, 1.2, -2 + Math.random() * 1.2), {}); } catch { /* item optional */ } }, 1500 + 350 * k++);
    }
  }
  wrap(game, 'hostFinishTakeoff', (orig) => function () {
    const r = this.run, before = r ? { day: r.day, phase: r.phase } : null;
    const res = orig.call(this);
    try { if (before && before.phase === 'takeoff' && r.day > before.day) dayTick(); } catch (e) { console.warn('[zones] dayTick', e); }
    return res;
  });
  function offlineCatchUp() {
    const r = run(), z = zn();
    if (!z || !enabled()) return;
    const el = z.rt ? (Date.now() - z.rt) / 1000 : 0, days = Z.offlineDays(el);
    z.rt = Date.now();
    if (!days) return;
    const own = Z.listZones(z, isActive).filter((e) => e.active && e.st.s === 'own');
    if (!own.length) return;
    const cr = Z.offlineIncome(days, own.map((e) => Z.zoneIncome(moonDef(e.m), zoneOf(e.m, e.z), e.st)), r.quota);
    if (cr <= 0) return;
    r.credits += cr; z.stat.earned = (z.stat.earned | 0) + cr;
    pushZn('credits');
    game.later(() => say('Your zones kept paying while you were away: +▮{c} ({d} days, capped).', { c: cr, d: days }, 'good'), 4000);
  }

  // ============================================================================================ HOST: live defence (dusk, crew on the moon)
  function liveStart(pe) {
    const r = run(), zone = zoneOf(pe.m, pe.z), core = S.cores.find((c) => c.id === pe.z), st = Z.getZ(zn(), pe.m, pe.z);
    if (!zone || !core || !st || st.s !== 'own') return;
    const lw = Z.liveWaves(zone.threat, qi(), crewSize());
    const dry = st.dry ? 0.4 : 1;
    const L = { m: pe.m, z: pe.z, zone, core, wave: 0, W: lw.W, plan: lw.waves, phase: 'prep', t: 12, queue: [], members: new Map(), acc: 0, waveT: 0, hp: ZN.coreHp + ZN.coreHpUp * (st.up | 0), hpMax: ZN.coreHp + ZN.coreHpUp * (st.up | 0), rng: new RNG(hashString(`${runKey()}:live:${r.day}:${pe.z}`)), dry, sync: 0 };
    S.host.live = L;
    znx({ k: 'banner', main: 'COUNTER-ATTACK', sub: '{z} is under attack! Defend the core.', v: { z: zone.name } });
    game.net.broadcast('fx', { k: 'snd', s: 'ship_alarm', p: [core.x, core.y + 2, core.z], v: 0.8 });
    algo('live', { z: zone.name, m: moonName(pe.m) });
  }
  function liveBeginWave(L, n) {
    L.wave = n; L.phase = 'wave'; L.waveT = 0; L.queue = [];
    const wp = L.plan[n - 1], level = 1 + Math.floor(qi() / 5);
    const push = (type, k, lv = level) => { for (let i = 0; i < k; i++) L.queue.push({ type, level: lv }); };
    push('sg_swarmer', wp.swarm); push('sg_brute', wp.tank); push('sg_runner', wp.runner);
    for (let i = L.queue.length - 1; i > 0; i--) { const j = L.rng.int(0, i); [L.queue[i], L.queue[j]] = [L.queue[j], L.queue[i]]; }
    if (wp.boss) L.queue.push({ type: 'sg_boss', level: Math.min(4, crewSize()) });
    const lim = (game.world?.terrain?.playHalf || 130) - 8, a0 = L.rng.float(0, Math.PI * 2);
    L.queue.forEach((e, i) => {
      const a = a0 + (i % 3) * 2.1 + L.rng.float(-0.4, 0.4), d = L.rng.float(44, 58);
      e.x = Math.max(-lim, Math.min(lim, L.core.x + Math.cos(a) * d)); e.z = Math.max(-lim, Math.min(lim, L.core.z + Math.sin(a) * d));
    });
    znx({ k: 'banner', main: 'WAVE {n}', sub: '{z}', v: { n, z: L.zone.name } });
  }
  function liveSpawn(L, e) {
    const y = game.world?.terrain?.heightAt?.(e.x, e.z) ?? 0;
    const c = game.creatures.hostSpawn(e.type, new THREE.Vector3(e.x, y, e.z), { level: e.level, zone: 'out', state: 'run', affix: null, variant: null });
    if (!c) return;
    c.data.zl = 1; c.data.tt = 0; c.data.tg = null;
    L.members.set(c.id, true);
  }
  function raiderTarget(L, c, S_) {
    const near = playersNear(c.pos, 14).sort((a, b) => flat(a.pos, c.pos) - flat(b.pos, c.pos))[0];
    if (near) return { k: 'p', id: near.id };
    const dep = game.deployables?.nearest?.(c.pos.x, c.pos.z, S_.deps ? 14 : 11, null);
    if (dep) return { k: 'd', id: dep.id };
    return { k: 'c' };
  }
  function raiderStep(L, c, dt) {
    const S_ = SG[c.type]; if (!S_ || c.stunT > 0) return;
    const M = game.creatures, D = game.deployables;
    const doAttack = (fn) => { if (c.age < 1) return; if (c.state !== 'attack') c.setState('attack'); if (c.cooldown <= 0) { c.cooldown = S_.cd; fn(); } };
    c.data.tt -= dt;
    if (c.data.tt <= 0) { c.data.tt = 0.4 + Math.random() * 0.2; c.data.tg = raiderTarget(L, c, S_); }
    if (c.state === 'attack' && c.t < 0.4) return;
    const tg = c.data.tg || { k: 'c' };
    let tx, tz, reach = S_.reach, act = null;
    if (tg.k === 'p') {
      const p = game.aiPlayerById(tg.id);
      if (!p || p.dead || p.inShip) { c.data.tg = null; c.data.tt = 0; return; }
      tx = p.pos.x; tz = p.pos.z; act = () => M.attack(c, p, Math.round(c.dmg), 'siege');
    } else if (tg.k === 'd') {
      const dep = D?.get?.(tg.id);
      if (!dep || dep.dead) { c.data.tg = null; c.data.tt = 0; return; }
      tx = dep.pos.x; tz = dep.pos.z; reach += Math.max(dep.def.hx, dep.def.hz) * 0.7; act = () => D.damage(dep, S_.dep * (1 + 0.1 * ((c.level || 1) - 1)));
    } else { tx = L.core.x; tz = L.core.z; reach += 1.6; act = () => { L.hp -= S_.hull * S_.cd * 12 * (1 + 0.1 * ((c.level || 1) - 1)); }; }
    const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d <= reach) { c.yaw = Math.atan2(dx, dz); doAttack(act); return; }
    c.setState('run');
    let speed = M.speedMul(c, S_.run); if (c.slowT > 0) speed *= c.slowMul || 0.55;
    c.pos.x += (dx / d) * speed * dt; c.pos.z += (dz / d) * speed * dt;
    const ter = game.world?.terrain; if (ter) c.pos.y = ter.heightAt(c.pos.x, c.pos.z);
    c.yaw = Math.atan2(dx, dz);
  }
  function liveEnd(L, win) {
    for (const id of L.members.keys()) { const c = game.creatures.host.get(id); if (c && !c.dead) game.creatures.kill(c, null, { silent: true }); }
    L.members.clear();
    S.host.live = null;
    const out = [];
    settle(L.m, L.z, win, Math.round(Z.wavePowerMean(L.zone.threat, qi(), crewSize()) * ZN.winBonusMul), true, out);
    for (const line of out) say(line.k, line.v, line.kind);
    znx({ k: 'live', on: false });
  }
  function liveTick(dt) {
    const r = run(), z = zn();
    let L = S.host.live;
    if (!L) {
      if (r.phase !== 'moon' || r.time < ZN.dusk || !z.pend.length) return;
      const pe = z.pend.find((p) => p.m === r.moon && S.cores.some((c) => c.id === p.z));
      if (pe && game.aiPlayers().some((p) => !p.dead && !p.inShip)) liveStart(pe);
      return;
    }
    if (r.phase !== 'moon') { liveEnd(L, false); return; }
    if (L.hp <= 0) { liveEnd(L, false); return; }
    if (L.phase === 'prep') { L.t -= dt; if (L.t <= 0) liveBeginWave(L, 1); }
    else if (L.phase === 'wave') {
      L.waveT += dt; L.acc += dt * 3;
      while (L.acc >= 1 && L.queue.length && L.members.size < 24) { L.acc -= 1; liveSpawn(L, L.queue.shift()); }
      if (!L.queue.length) L.acc = Math.min(L.acc, 1);
      for (const id of [...L.members.keys()]) {
        const c = game.creatures.host.get(id);
        if (!c || c.dead) { L.members.delete(id); continue; }
        try { raiderStep(L, c, dt); } catch (e) { console.warn('[zones] raider', e); }
      }
      const done = !L.queue.length && L.members.size === 0;
      if (done || L.waveT > 80) {
        for (const id of [...L.members.keys()]) { const c = game.creatures.host.get(id); if (c && !c.dead) game.creatures.kill(c, null, { silent: true }); }
        L.members.clear();
        if (L.wave >= L.W) { liveEnd(L, true); return; }
        L.phase = 'lull'; L.t = 10;
        znx({ k: 'banner', main: 'WAVE {n} CLEARED', sub: '', v: { n: L.wave } });
      }
    } else if (L.phase === 'lull') { L.t -= dt; if (L.t <= 0) liveBeginWave(L, L.wave + 1); }
    L.sync -= dt;
    if (L.sync <= 0) { L.sync = 0.5; znx({ k: 'live', on: true, z: L.z, w: L.wave, W: L.W, hp: Math.max(0, Math.round((L.hp / L.hpMax) * 100)), ph: L.phase, left: L.queue.length + L.members.size }); }
  }
  function liveAbort() {
    const L = S.host.live; if (!L) return;
    // the crew left mid-fight: the built defences finish the job on their own
    for (const id of L.members.keys()) { const c = game.creatures?.host?.get(id); if (c && !c.dead) game.creatures.kill(c, null, { silent: true }); }
    L.members.clear(); S.host.live = null;
    znx({ k: 'live', on: false });
  }

  // ============================================================================================ HOST: per-frame tick + periodic state
  function hostTick(dt) {
    const r = run();
    if (r.phase !== 'moon') { S.host.plant = null; return; }
    if (S.coresKey !== `${r.seed}:${r.moon}`) { try { hostComputeCores(); } catch (e) { if (!S._w) { S._w = 1; console.warn('[zones] cores', e); } } }
    if (!S.cores.length) return;
    const z = zn();
    S.host.clearAcc += dt;
    if (S.host.clearAcc >= 0.5) {
      const step = S.host.clearAcc; S.host.clearAcc = 0;
      for (const c of S.cores) {
        const st = Z.getZ(z, r.moon, c.id);
        if (st?.s === 'own') continue;
        const near = playersNear(c, 45).length > 0;
        S.host.clearT[c.id] = near ? Z.stepClear(S.host.clearT[c.id], step, hostileNear(c)) : 0;
      }
    }
    hostTickPlant(dt);
    liveTick(dt);
    S.host.sendT -= dt;
    if (S.host.sendT <= 0) {
      S.host.sendT = 1;
      znx({ k: 'st', moon: r.moon, cores: S.cores.map((c) => [c.id, c.x, Math.round(c.y * 10) / 10, c.z]), clr: S.host.clearT, pl: S.host.plant ? { z: S.host.plant.z, p: S.host.plant.t / ZN.plantSec } : null });
    }
  }

  // ============================================================================================ requests (client -> host)
  on('registerHandlers', (Hh, g) => {
    if (g !== game) return;
    Hh('znreq', (d, from) => {
      try {
        if (!d || !enabled() || !host()) return;
        switch (d.op) {
          case 'plant': hostStartPlant(String(d.z || ''), from); break;
          case 'build': hostBuild({ z: String(d.z || ''), def: String(d.def || '') }, from); break;
          case 'sell': hostSell({ z: String(d.z || ''), def: String(d.def || '') }, from); break;
          case 'up': hostUp({ m: String(d.m || ''), z: String(d.z || '') }, from); break;
          default: break;
        }
      } catch (e) { console.error('[zones] znreq', e); }
    });
  });
  const askHost = (op, extra = {}) => game.net?.request('znreq', { op, ...extra });

  // ============================================================================================ CLIENT: net -> state, banners, intercom
  function onZnx(m) {
    if (disposed || !m) return;
    switch (m.k) {
      case 'st':
        if (m.moon === run()?.moon) { if (!host()) { S.cores = (m.cores || []).map(([id, x, y, z]) => ({ id, x, y, z })); S.stMoon = m.moon; } S.clr = m.clr || {}; S.plant = m.pl || null; }
        break;
      case 'plant': S.plant = m.p >= 0 ? { z: m.z, p: m.p } : null; break;
      case 'deny': game.ui?.toast?.(t(m.why || 'Not possible.'), 'warn'); game.sfx?.('ui_click', 0.4); break;
      case 'taken': game.ui?.hud?.bigText?.(t('ZONE CAPTURED'), zoneName(run()?.moon, m.z)); game.sfx?.('quota_met', 0.6); syncViews(true); break;
      case 'banner': game.ui?.hud?.bigText?.(tf(m.main, m.v || {}), m.sub ? tf(m.sub, m.v || {}) : ''); game.sfx?.('ship_alarm', 0.3); break;
      case 'live': S.live = m.on ? m : null; break;
      case 'algo': { const line = tf(Z.pickLine(m.kind, m.seed), m.v || {}); if (game.lore?.say) game.lore.say(line); else game.ui?.toast?.(line, 'info'); break; }
      default: break;
    }
  }
  const onZnxMsg = (m, from) => { if (from === game.selfId || from === game.net?.hostId) onZnx(m); };
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:znx', onZnxMsg);
    boundNet = net; net.on('msg:znx', onZnxMsg);
  }
  on('netReady', (n, g) => { if (g === game) bindNet(n); });
  if (game.net) bindNet(game.net);
  const zoneName = (m, z) => t(zoneOf(m, z)?.name || z);

  // ============================================================================================ CLIENT: 3D views (pylon + emissive pillar + border ring, no lights)
  function disposeViews() {
    for (const v of S.views.values()) { v.g.removeFromParent(); v.g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    S.views.clear(); S.viewKey = '';
  }
  function makeView(core, col, kind) {
    const g = new THREE.Group(); g.position.set(core.x, core.y, core.z);
    const c = new THREE.Color(col);
    const dark = new THREE.MeshLambertMaterial({ color: 0x2c3036, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ color: c });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 3.2, 6), dark); post.position.y = 1.6; g.add(post);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.4, 8, 1, true), dark); dish.position.y = 3.2; dish.rotation.x = Math.PI; dish.material.side = THREE.DoubleSide; g.add(dish);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), glow); lamp.position.y = 3.65; g.add(lamp);
    const parts = { dish, lamp, glow };
    const h = kind === 'own' ? 60 : kind === 'inf' ? 26 : 9, op = kind === 'own' ? 0.3 : kind === 'inf' ? 0.32 : 0.1;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h, 8, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    pillar.position.y = 3.6 + h / 2; g.add(pillar); parts.pillar = pillar; parts.op = op;
    const ter = game.world?.terrain, R = ZN.zoneR, N = 72, pos = [], idx = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (const rr of [R - 0.45, R]) { const wx = core.x + ca * rr, wz = core.z + sa * rr; pos.push(ca * rr, (ter ? ter.heightAt(wx, wz) : core.y) - core.y + 0.28, sa * rr); }
      const j = (i + 1) % N; idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx);
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: kind === 'free' ? 0.0 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.frustumCulled = false; g.add(ring); parts.ring = ring;
    g.userData.parts = parts;
    return g;
  }
  function syncViews(force) {
    const r = run();
    if (!r || r.phase !== 'moon' || !S.cores.length) { if (S.views.size) disposeViews(); return; }
    const z = r.zn, col = Z.crewColor(z);
    const sig = S.cores.map((c) => `${c.id}${c.x}${Z.getZ(z, r.moon, c.id)?.s || '-'}`).join('|') + col + r.moon + r.seed;
    if (!force && sig === S.viewKey) return;
    disposeViews(); S.viewKey = sig;
    for (const c of S.cores) {
      const s = Z.getZ(z, r.moon, c.id)?.s || 'free';
      const g = makeView(c, s === 'own' ? col : s === 'inf' ? '#ff3a4a' : '#9aa4b0', s);
      game.scene.add(g); S.views.set(c.id, { g, kind: s });
    }
  }
  function animViews(tt) {
    for (const v of S.views.values()) {
      const p = v.g.userData.parts; if (!p) continue;
      p.dish.rotation.y = tt * 0.8;
      const fl = v.kind === 'inf' ? (Math.sin(tt * 19) > 0.2 ? 1 : 0.35) : 0.85 + 0.15 * Math.sin(tt * 3);
      p.pillar.material.opacity = p.op * fl;
      p.lamp.visible = v.kind === 'own' || Math.sin(tt * 4) > 0;
    }
  }

  // ============================================================================================ CLIENT: interactables, plant bar, objectives
  function plantBar(txt, frac) {
    if (!txt) { if (S.barEl) S.barEl.style.display = 'none'; return; }
    if (!S.barEl) { S.barEl = document.createElement('div'); S.barEl.className = 'zn-bar'; S.barEl.innerHTML = '<span></span><i><b></b></i>'; document.body.appendChild(S.barEl); }
    S.barEl.style.display = 'block'; S.barEl.firstChild.textContent = txt; S.barEl.querySelector('b').style.width = Math.round(frac * 100) + '%';
  }
  on('interactables', (out, g) => {
    if (g !== game || disposed || !enabled()) return;
    const r = run();
    if (r?.phase !== 'moon' || me().indoor || me().dead || !S.cores.length) return;
    const p = me().pos;
    for (const c of S.cores) {
      if (flat(p, c) > 30) continue;
      const st = Z.getZ(r.zn, r.moon, c.id), zone = zoneOf(r.moon, c.id);
      if (!zone) continue;
      const pos = new THREE.Vector3(c.x, c.y + 1.4, c.z), name = t(zone.name);
      if (st?.s === 'own') {
        out.push({ pos, r: 2.4, reach: 4.5, label: tf('Zone console: {n} [E]', { n: name }), sub: tf('Defence {p} - build, upgrade, map', { p: Z.defencePower(st, !!st.dry) }), action: () => openPanel() });
      } else {
        const cost = Z.captureCost(moonDef(r.moon), zone, ownedCount(), st?.s === 'inf'), clr = S.clr?.[c.id] || 0;
        const locked = qi() < zone.minQ;
        const label = locked ? tf('{n}: locked until a later quota', { n: name }) : clr >= ZN.clearSec ? tf('Plant beacon on {n} - ▮{c} [E]', { c: cost, n: name }) : tf('{n}: relay scanning, keep it clear ({s}s)', { s: Math.max(0, Math.ceil(ZN.clearSec - clr)), n: name });
        out.push({ pos, r: 2.4, reach: 4.5, label, sub: st?.s === 'inf' ? t('INFECTED - recapture at half price') : tf('Threat {t}', { t: zone.threat }), action: () => { if (!locked) askHost('plant', { z: c.id }); } });
      }
    }
  });
  on('objectives', (add, g, phase) => {
    if (g !== game || disposed || !enabled()) return;
    const r = run(), z = r?.zn;
    if (!z) return;
    if (S.live && phase === 'moon') { add(tf('ZONE DEFENCE: wave {a}/{b}, core {h}%', { a: S.live.w || 0, b: S.live.W || 2, h: S.live.hp ?? 100 }), 'warn'); return; }
    for (const pe of z.pend || []) {
      if (phase === 'orbit' || (phase === 'moon' && pe.m === r.moon)) add(tf('THREAT: {z} on {m}', { z: zoneName(pe.m, pe.z), m: moonName(pe.m) }) + (phase === 'moon' ? ' ' + t('(dusk)') : ''), 'warn');
    }
  });

  // ============================================================================================ CLIENT: terminal + panel
  function snapshot() {
    const r = run(), z = zn(), ids = [];
    const add = (id) => { if (id && !ids.includes(id) && isActive(id)) ids.push(id); };
    MOON_ORDER.forEach(add); Object.keys(z?.m || {}).forEach(add); add(r?.moon);
    const rows = ids.map((id) => {
      const m = moonDef(id), sp = spec(id), here = mineNow() === id;
      const zones = sp.zones.map((q) => {
        const st = Z.getZ(z, id, q.id), s = st ? st.s : (qi() < q.minQ ? 'locked' : 'free');
        const core = here ? coreOf(q.id) : null;
        return { id: q.id, name: q.name, kind: q.kind, ang: q.ang, dist: q.dist, wing: q.wing, threat: q.threat, s, st, minQ: q.minQ,
          income: s === 'own' ? Z.zoneIncome(m, q, st).credits : 0, upkeep: Z.upkeepOf(st), def: st ? Z.defencePower(st, !!st.dry) : 0, slots: Z.slotsOf(st), used: Z.defCount(st),
          cost: Z.captureCost(m, q, ownedCount(), s === 'inf'), pending: !!(z?.pend || []).find((p) => p.m === id && p.z === q.id), core: core ? { x: core.x, z: core.z } : null,
          odds: st && s === 'own' ? Math.round(Z.winChance(Z.defencePower(st, !!st.dry), q.threat, qi(), crewSize()) * 100) : null };
      });
      return { id, name: m.name, tier: m.tier | 0, biome: m.biome, here, zones, owned: zones.filter((q) => q.s === 'own').length };
    });
    const own = Z.listZones(z, isActive).filter((e) => e.active && e.st.s === 'own');
    const inc = Z.capIncome(own.map((e) => Z.zoneIncome(moonDef(e.m), zoneOf(e.m, e.z), e.st)), r?.quota | 0);
    const inZone = (() => { const m = mineNow(); if (!m) return null; const p = me()?.pos; for (const c of S.cores) if (p && flat(p, c) <= ZN.zoneR) return { m, z: c.id }; return null; })();
    return { moons: rows, col: Z.crewColor(z), credits: r?.credits | 0, qi: qi(), income: inc, upkeep: own.reduce((a, e) => a + Z.upkeepOf(e.st), 0), maxOwned: Z.maxOwned(qi()), owned: own.length, inZone, rep: z?.rep || null, pend: z?.pend || [], stat: z?.stat || {}, mat: (m) => Z.matOf(moonDef(m)) };
  }
  const panelApi = {
    snapshot, DEFS: Z.DEFS, DEF_IDS: Z.DEF_IDS, ZN,
    build: (z, def) => askHost('build', { z, def }), sell: (z, def) => askHost('sell', { z, def }), up: (m, z) => askHost('up', { m, z }),
    unlocked: (id) => qi() >= Z.DEFS[id].minQ,
  };
  function closePanel() { try { S.panel?.dispose?.(); } catch { /* gone */ } S.panel = null; }
  function openPanel() {
    if (!game.ui?.openPanel || typeof document === 'undefined' || disposed) return;
    if (game.ui.panelOpen) game.ui.closePanel?.();
    closePanel();
    S.panel = createZonesPanel(game, panelApi);
    game.ui.openPanel(S.panel.el);
    game.ui.onPanelClose = () => { closePanel(); return false; };
  }
  const cmdNames = [];
  function registerCommands() {
    const api = mods.api || (typeof window !== 'undefined' ? window.KefalAPI : null);
    if (!api?.registerCommand) return;
    api.registerCommand('zones', (rest, term) => {
      if (!enabled()) { term.print(t('Zones are disabled.'), 'err'); return; }
      const s = snapshot();
      const lines = [t('SECTOR MAP: reclaimed zones'), tf('Zones held {n}/{m}  ·  income ▮{i}/day (cap ▮{c})  ·  upkeep ▮{u}/day', { n: s.owned, m: s.maxOwned, i: s.income.credits, c: s.income.cap, u: s.upkeep }), ''];
      for (const mo of s.moons) {
        if (!mo.owned && !mo.here) continue;
        lines.push(`${mo.name}  T${mo.tier}  ${mo.owned}/${mo.zones.length}`);
        for (const q of mo.zones) if (q.s === 'own' || q.s === 'inf') lines.push(`  ${q.id} ${t(q.name)}  ${q.s === 'inf' ? t('INFECTED') : `▮${q.income}/${t('day')}  ${t('DEF')} ${q.def}  ${t('threat')} ${q.threat}`}`);
      }
      if (!s.owned) lines.push(t('No zone yet. Land, clear the area around a signal relay, plant a beacon.'));
      for (const pe of s.pend) lines.push(tf('THREAT: {z} on {m}', { z: zoneName(pe.m, pe.z), m: moonName(pe.m) }));
      term.print(lines.join('\n'));
      if (rest[0] !== 'text') { term.print(t('Opening the sector map...')); try { term.close(); } catch { /* optional */ } openPanel(); }
    }, 'ZONES: the sector map of reclaimed zones (ZONES TEXT prints only)');
    cmdNames.push('zones');
  }
  registerCommands();

  // ============================================================================================ events
  let tt = 0;
  on('update', (dt, g) => {
    if (g !== game || disposed || !enabled()) return;
    tt += dt;
    const r = run();
    if (r?.phase === 'moon') {
      if (!host() && S.cores.length && S.stMoon !== r.moon) { S.cores = []; disposeViews(); }
      syncViews(false); animViews(tt);
      if (S.plant) plantBar(tf('PLANTING BEACON: {z}', { z: zoneName(r.moon, S.plant.z) }), S.plant.p);
      else plantBar(null);
    } else { if (S.views.size) disposeViews(); plantBar(null); if (S.cores.length) { S.cores = []; S.clr = {}; S.plant = null; S.live = null; } }
    if (host()) { try { hostTick(dt); } catch (e) { if (!S._w2) { S._w2 = 1; console.warn('[zones] tick', e); } } }
  });
  on('mapLoaded', () => { S.cores = []; S.coresKey = ''; S.stMoon = ''; S.clr = {}; S.plant = null; S.live = null; S.host.deps.clear(); disposeViews(); });
  on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph !== 'moon') { closePanel(); if (host()) { liveAbort(); S.host.plant = null; S.host.deps.clear(); S.coresKey = ''; if (zn()) zn().rt = Date.now(); } }
  });
  on('hostStart', (g) => { if (g === game) { try { zn(); offlineCatchUp(); } catch (e) { console.warn('[zones] offline', e); } } });
  on('moonPopulated', (g) => { if (g && g !== game) return; if (host() && enabled()) { try { hostComputeCores(); } catch (e) { console.warn('[zones] cores', e); } } });

  return {
    core: Z, state: zn, snapshot, cores: () => S.cores, open: openPanel, dayTick, hostComputeCores, materialize, live: () => S.host.live,
    zoneSpec: spec, moonDef,
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      restores.length = 0;
      try { boundNet?.off?.('msg:znx', onZnxMsg); } catch { /* ignore */ }
      for (const n of cmdNames) mods.commands?.delete(n);
      closePanel(); disposeViews(); S.barEl?.remove(); S.barEl = null;
      liveAbort();
    },
  };
}
