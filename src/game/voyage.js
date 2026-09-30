// VOYAGE (wave 4): the macro adventure layer. Installed with `this.useModule('voyage', installVoyage)` in game.js. Design + knobs: docs/wave4/voyage.md.
//   1. RANDOM MOONS   terminal `MOON RANDOM` (small fee, a fully random seed) + `SIGNALS` (3 uncharted signals that rotate with the in-run day). A voyage moon is a
//                     pure function of its id (`vy<tier><content>_<seed36>`), so clients rebuild it from run.moon alone (game/voyage_core.js generateVoyageMoon).
//   2. WARP EVENTS    at the lever (12 %, never in the first 2 quotas unless `WARP EARLY`): navigation glitch (forced) or distress signal (crew vote B / M).
//   3. MISSIONS       terminal `MISSIONS` / `TAKE n` / `DROPJOB`: 9 job types (rescue, black box, relay, marked hunt, drone escort, survey, defend rig, heist, photo),
//                     pure state machine in voyage_core.js, host runtime here, objective lines + screen markers on every peer.
//   4. CONTENTS       7 set pieces on voyage moons (world/voyage_sites.js): loot, guards, interaction points (recorder, log, relic, stalls, strongbox, cargo), meteor showers.
//   5. HAZARDS        low gravity biomes, acid shore, the meteor director.
// Net (all 'vy*'): 'vyreq' client -> host request {op}, 'vyx' host -> everyone/one peer {k}, 'vyn' host -> everyone npc stream.
// Host-authoritative: the host owns run.vy (synced with broadcastRun(['vy']), saved with the run), NPCs, missions, loot, meteors. Clients only render + send requests.
import * as THREE from 'three';
import { MOONS, MOON_ORDER } from './moons.js';
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, t, tf, tfIn, sysMsg } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { hudDock } from '../ui/dock.js';
import { ITEMS, registerItem, scrapTableFor } from './items.js';
import { CREATURES, registerCreature } from './creatures.js';
import { scrapValueMul } from './progression.js';
import { insideShip } from '../world/ship.js';
import { fallbackChestLoot } from './chests.js';
import { COMPONENT_IDS } from './components.js';
import { sectorMoons } from './moongen.js';
import { biomeName, INTERIOR_NAMES } from './moongen.js';
import { createNpcModel, createSpecimenModel } from '../world/voyage_sites.js';
import { NO_LOOK } from '../render/tierlooks.js';
import * as V from './voyage_core.js';
import { createArtModel } from '../models/artpass.js';
import { TR, RU } from './voyage_i18n.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const SHIP_DROP = () => new THREE.Vector3(4.5 + Math.random() * 1.5, 1.2, -2 + Math.random() * 1.2);   // same delivery corner as the store
const STYLE = `.vy-marks{position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden}
.vy-mk{position:absolute;transform:translate(-50%,-50%);font:12px var(--font2,monospace);color:#8ff4ff;text-shadow:0 0 4px #000,0 0 8px #000;white-space:nowrap;text-align:center}
.vy-mk i{display:block;width:10px;height:10px;margin:0 auto 2px;border:2px solid #8ff4ff;transform:rotate(45deg);box-shadow:0 0 6px #4ad}
.vy-mk.warn{color:#ff9a7a}.vy-mk.warn i{border-color:#ff7a5a}
.vy-prompt{min-width:300px;max-width:440px;padding:10px 14px;background:rgba(6,10,16,.9);border:1px solid #4ad;border-left:5px solid #4ad;color:#dff;font:14px var(--font,monospace);text-align:left;box-shadow:0 0 14px rgba(70,170,230,.3)}
.vy-prompt b{color:#8ff4ff;letter-spacing:1px}.vy-prompt .vy-k{display:inline-block;padding:0 6px;margin:0 2px;border:1px solid #8ff4ff;color:#8ff4ff}
.vy-prompt .vy-bar{height:4px;margin-top:6px;background:rgba(255,255,255,.12)}.vy-prompt .vy-bar span{display:block;height:100%;background:#4ad}`;

// ------------------------------------------------------------------------------------------------ items / creature / models (registered once)
const ITEM_DEFS = {
  vy_blackbox: { id: 'vy_blackbox', name: 'Black Box', kind: 'tool', hands: 1, weight: 5, price: 0, value: [0, 0], tip: 'A flight recorder for a voyage job. Carry it to the ship. Not sellable.' },
  vy_relic: { id: 'vy_relic', name: 'Alien Relic', kind: 'scrap', hands: 1, weight: 6, value: [230, 330], tip: 'A humming relic from a temple altar. It knows who took it.' },
  vy_meteorite: { id: 'vy_meteorite', name: 'Meteorite', kind: 'scrap', hands: 1, weight: 5, value: [55, 95], tip: 'A warm chunk of sky. Collectors pay well.' },
};
let registered = false;
function registerContent() {
  if (registered) return;
  registered = true;
  for (const d of Object.values(ITEM_DEFS)) if (!ITEMS[d.id]) registerItem({ ...d });
  if (!CREATURES.vy_specimen) {
    registerCreature('vy_specimen', {
      name: 'Aurora Stag', hp: 70, dmg: 0, walk: 1.7, run: 7.0, power: 0, xp: 0, coin: 0, zone: 'out', radius: 0.6, height: 2.4, noSpawn: true, noHunt: true,
      lore: 'A rare glowing stag that only shows itself to voyagers. Shy: it bolts when you get closer than about 13 m. Photograph it with the Instant Camera from under 30 m.',
    }, specimenBehavior);
    try { NO_LOOK.add('vy_specimen'); } catch { /* optional */ }
  }
}
function specimenBehavior(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = true; d.home = c.pos.clone(); }
  const players = M.playersFor(c).filter((p) => !p.inShip && !p.dead);
  const near = M.nearest(c, players, 13);
  if (near?.p) {
    const p = near.p;
    if (c.state !== 'run') c.setState('run');
    M.goToLazy(c, c.pos.x + (c.pos.x - p.pos.x), c.pos.z + (c.pos.z - p.pos.z), 4);
    M.follow(c, dt, c.def.run);
    return;
  }
  if (c.state === 'run') c.setState('idle');
  if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
  if (c.t > 4 + Math.random() * 5) { M.wander(c, 14); c.setState('walk'); }
}

// ------------------------------------------------------------------------------------------------ module
export function installVoyage(game) {
  const mods = game.mods;
  if (!mods) return null;
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  registerContent();
  for (const k of ['vyx', 'vyn']) HOST_ONLY.add(k);
  const offs = [], restores = [];
  let disposed = false, boundNet = null;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const host = () => !!game.isHost;
  const enabled = () => game.config?.voyage !== false && !game.onboard?.locked?.('voyage');   // [onboard] gifted at quota 2
  const run = () => game.run;
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.itemModels) { for (const id of ['vy_blackbox', 'vy_relic', 'vy_meteorite']) mm.itemModels.set(id, () => createArtModel(id)); }   // [artpass]
  if (mm?.creatureModels) mm.creatureModels.set('vy_specimen', () => createSpecimenModel());
  if (typeof document !== 'undefined' && !document.getElementById('tfg-voyage-style')) { const s = document.createElement('style'); s.id = 'tfg-voyage-style'; s.textContent = STYLE; document.head.appendChild(s); }

  const say = (key, vars, kind = 'info') => game.net?.broadcast('sys', sysMsg(key, vars || {}, kind));
  const vyx = (d) => game.net?.broadcast('vyx', d);
  const vyxTo = (id, d) => game.net?.sendTo(id, 'vyx', d);
  const banner = (main, sub = '', kind = 'good', vars = null) => vyx({ k: 'banner', main, sub, kind, v: vars || undefined });
  const runKey = () => String(run()?.runId ?? 'legacy');
  const S = {
    host: null,                 // per-landing host runtime (reset every landing)
    views: new Map(),           // client npc views id -> { model, kind, pos, target, hp, st }
    marks: [], markEl: null,
    prompt: null, promptEl: null,
    inter: [], interKey: '',
    usedLocal: new Set(),       // client copy of run.vy.u (ids of used spots this landing)
    pendingWarp: null,
    rumor: 0, lastRef: null, hazT: 0, meteors: [],
    stats: { routes: 0, warps: 0, missionsDone: 0 },
  };
  const vy = () => { const r = run(); if (!r) return null; if (!r.vy || typeof r.vy !== 'object') r.vy = { v: 1, warp: 'on', prev: null, mission: null, done: 0, earned: 0, lastWarpDay: -99, u: [] }; return r.vy; };
  const pushVy = () => { if (host()) game.broadcastRun(['vy']); };

  // ============================================================================================ registration of voyage moons on every peer
  function registerFromRun(d) {
    const ids = [d?.moon, d?.vy?.mission?.moon, d?.vy?.prev];
    for (const id of ids) if (id && V.isVoyageId(id)) V.registerVoyageMoon(id);
  }
  function wrap(obj, name, make) {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  }
  wrap(game, 'applyRunState', (orig) => function (d, silent) { try { registerFromRun(d); registerFromRun(this.run); } catch (e) { console.warn('[voyage] register', e); } return orig.call(this, d, silent); });
  V.setMissionProvider(() => (enabled() ? run()?.vy?.mission || null : null));
  if (run()) registerFromRun(run());

  const isVoyage = (id = run()?.moon) => V.isVoyageId(id);
  const moonName = (id) => MOONS[id]?.name || (V.isVoyageId(id) ? V.generateVoyageMoon(id)?.name : id) || id;
  const contentName = (c) => (c ? V.CONTENT[c]?.name || c : '');
  const charted = () => MOON_ORDER.map((id) => MOONS[id]).filter((m) => m && !m.company && !m.home && !m.instance && !m.stale && !m.expedition);
  const signals = () => V.signalsFor(runKey(), run()?.day | 0, run()?.quotaIndex | 0);

  // ============================================================================================ HOST: routing (signals + random)
  const replyTo = (to, text, err, vars) => game.net.sendTo(to, 'term', { to, text: tfIn('en', text, vars || {}), k: vars ? text : undefined, v: vars, err, cls: err ? 'err' : '' });
  function rememberPrev() {
    const s = vy(), r = run();
    if (!isVoyage(r.moon)) s.prev = r.moon;
  }
  function setRoute(id, fee = 0) {
    const r = run(), s = vy();
    rememberPrev();
    V.registerVoyageMoon(id);
    const m = MOONS[id];
    r.credits -= fee;
    r.moon = id;
    r.forecast = { ...(r.forecast || {}), [id]: m.weather[Math.floor(Math.random() * m.weather.length)] };
    s.u = [];
    game.broadcastRun(['moon', 'credits', 'forecast', 'vy']);
    try { game.env.setSpace(game.planetColorFor(id)); } catch { /* optional */ }
  }
  function canRoute(from, m) {
    const r = run();
    if (r.phase !== 'orbit') { replyTo(from, 'Routing is only possible while in orbit.', true); return false; }
    if ((r.daysLeft | 0) <= 0) { replyTo(from, 'Deadline reached: only 0-Algorithm HQ is available.', true); return false; }
    const blocked = game.cycle?.routeBlocked?.(m || { id: 'x' });
    if (blocked && !MOONS[r.moon]?.voyage) { replyTo(from, blocked, true); return false; }
    return true;
  }
  function hostRouteSignal(n, from) {
    const list = signals(), id = list[n - 1];
    if (!id) { replyTo(from, 'No such signal. Type SIGNALS.', true); return; }
    const m = V.registerVoyageMoon(id);
    if (!canRoute(from, m)) return;
    const fee = game.shipyard?.routeFee ? game.shipyard.routeFee(m, !!game.config?.freeTravel) : (game.config?.freeTravel ? 0 : m.cost);
    if (run().credits < fee) { replyTo(from, 'Insufficient credits: {@m} costs ▮{cost}, you have ▮{c}.\nSell scrap at 0-Algorithm HQ (ROUTE HQ) or pick a FREE moon.', true, { m: m.name, cost: fee, c: run().credits }); return; }
    setRoute(id, fee);
    S.stats.routes++;
    say('Autopilot routed to {@m}. Pull the lever to land.', { m: m.name }, 'info');
    replyTo(from, 'Routing autopilot to {@m}. Your new balance is ▮{c}.\nPull the lever to land.', false, { m: m.name, c: run().credits });
  }
  function hostRouteRandom(from) {
    const r = run();
    if (!canRoute(from, null)) return;
    const fee = V.randomFee(r.quotaIndex);
    if (r.credits < fee) { replyTo(from, 'MOON RANDOM costs ▮{cost}. You have ▮{c}.', true, { cost: fee, c: r.credits }); return; }
    const R = new RNG((Math.random() * 4294967296) >>> 0);
    const id = V.rollVoyageId(R, V.tierForQuota(r.quotaIndex, R), { pNone: 0.25 });
    const m = V.registerVoyageMoon(id);
    setRoute(id, fee);
    S.stats.routes++;
    say('RANDOM DESTINATION: {@m}. Pull the lever to land. Anything can be down there.', { m: m.name }, 'warn');
    replyTo(from, 'Random voyage locked in: {@m} (T{tier}). Fee ▮{fee}, balance ▮{c}.\nPull the lever to land.', false, { m: m.name, tier: m.tier, fee, c: r.credits });
  }

  // ============================================================================================ HOST: warp events (lever wrapper)
  const playersNow = () => game.aiPlayers();
  function warpState() {
    const r = run(), s = vy(), m = MOONS[r.moon] || {};
    return { quotaIndex: r.quotaIndex | 0, mode: s.warp || 'on', sinceDays: (r.day | 0) - (s.lastWarpDay ?? -99), company: !!m.company, home: !!m.home, instance: !!m.instance || !!m.core, voyage: isVoyage(r.moon), daysLeft: r.daysLeft | 0 };
  }
  function startWarp(w, proceed) {
    const r = run(), s = vy();
    rememberPrev();
    s.lastWarpDay = r.day | 0;
    S.stats.warps++;
    const id = w.id;
    V.registerVoyageMoon(id);
    setRoute(id, 0);
    const m = MOONS[id];
    if (w.kind === 'glitch') banner('NAVIGATION GLITCH', 'Coordinates corrupted. Destination: {@m}', 'bad', { m: m.name });
    else banner('DISTRESS ANSWERED', 'Course set for {@m}', 'good', { m: m.name });
    say(w.kind === 'glitch' ? 'NAVIGATION GLITCH! The autopilot dropped a random destination: {@m}.' : 'The crew answers the distress signal. Course: {@m}.', { m: m.name }, 'warn');
    game.later(() => { S.pendingWarp = null; proceed(); }, V.WARP.glitchDelaySec * 1000);
  }
  function resolveVote(v) {
    if (!S.pendingWarp || S.pendingWarp !== v || v.done) return;
    v.done = true;
    const yes = v.yes.size, no = v.no.size;
    const ok = V.voteOutcome(yes, no);
    vyx({ k: 'promptEnd', ok });
    if (ok) startWarp({ kind: 'distress', id: v.id }, v.proceed);
    else { S.pendingWarp = null; say('The crew ignores the distress signal. Landing as planned.', {}, 'info'); v.proceed(); }
  }
  wrap(game, 'hostLever', (orig) => function (from) {
    const r = this.run;
    if (!enabled() || !r || r.phase !== 'orbit') return orig.call(this, from);
    if (S.pendingWarp) return;   // a warp / vote is resolving: the lever is locked
    const inShip = from === this.selfId ? this.player.inShip : insideShip(this.remotes.get(from)?.pos || new THREE.Vector3(0, -99, 0));
    if (!inShip) return orig.call(this, from);
    const s = vy();
    const st = warpState();
    const job = s.mission && (s.mission.st === 'accepted' || s.mission.st === 'active') && s.mission.moon === r.moon;
    let w = null;
    if (!job) w = V.rollWarp(new RNG((Math.random() * 4294967296) >>> 0), st);
    if (!w) return orig.call(this, from);
    const proceed = () => { if (!disposed) orig.call(this, from); };
    if (w.kind === 'glitch') { S.pendingWarp = { kind: 'glitch' }; startWarp(w, proceed); return; }
    // distress: crew vote
    const m = V.registerVoyageMoon(w.id);
    const v = { kind: 'distress', id: w.id, yes: new Set(), no: new Set(), done: false, proceed };
    S.pendingWarp = v;
    vyx({ k: 'prompt', id: w.id, name: m.name, content: m.content || '', tier: m.tier, sec: V.WARP.voteSec });
    say('DISTRESS SIGNAL detected. Answer it? (B = answer, M = ignore)', {}, 'warn');
    v.timer = game.later(() => resolveVote(v), V.WARP.voteSec * 1000);
  });
  function hostVote(from, yes) {
    const v = S.pendingWarp;
    if (!v || v.kind !== 'distress' || v.done) return;
    v.yes.delete(from); v.no.delete(from);
    (yes ? v.yes : v.no).add(from);
    const n = Math.max(1, playersNow().length);
    if (v.yes.size + v.no.size >= n) resolveVote(v);
  }

  // ============================================================================================ HOST: day flow wrappers (revert routes, day length, mission take-off)
  wrap(game, 'hostFinishTakeoff', (orig) => function () {
    const r = this.run, was = r?.phase === 'takeoff' && isVoyage(r.moon) ? r.moon : null;
    const res = orig.call(this);
    if (was && r.moon === was) {
      const s = vy();
      const back = (s.prev && MOONS[s.prev] && !MOONS[s.prev].stale && s.prev !== was) ? s.prev : (sectorMoons()[0]?.id || 'hamsi');
      r.moon = back;
      s.u = [];
      game.broadcastRun(['moon', 'vy']);
      try { game.env.setSpace(game.planetColorFor(back)); } catch { /* optional */ }
      say('Voyage complete. The autopilot is back on course for {@m}.', { m: MOONS[back]?.name || back }, 'info');
    }
    return res;
  });
  wrap(game, 'hostBeginTakeoff', (orig) => function (reason) {
    const r = this.run;
    if (r && (r.phase === 'moon' || r.phase === 'company')) { try { hostTick(0, true); mstep({ t: 'takeoff' }); } catch (e) { console.warn('[voyage] takeoff', e); } }
    return orig.call(this, reason);
  });
  wrap(game, 'hostUpdate', (orig) => function (dt) {
    const r = this.run, moon = MOONS[r?.moon];
    const res = orig.call(this, dt);
    if (r?.phase === 'moon' && moon?.voyage && moon.timeMul && moon.timeMul !== 1 && r.time < 24 * 60) {
      r.time += dt * ((16 * 60) / (this.config.dayLengthSec || 720)) * (moon.timeMul - 1);
    }
    return res;
  });

  // ============================================================================================ missions (host)
  const mission = () => vy()?.mission || null;
  function mstep(ev) {
    const s = vy(), m = s?.mission;
    if (!m || !host()) return;
    const before = m.st;
    const r = V.stepMission(m, ev);
    if (r.m === m) return;
    s.mission = r.m;
    pushVy();
    for (const f of r.fx) {
      if (f.k === 'active') vyx({ k: 'mstate', st: 'active', type: m.type });
      else if (f.k === 'progress') vyx({ k: 'mprog', type: m.type, i: ev.i, ev: ev.t });
      else if (f.k === 'done') finishMission(r.m);
      else if (f.k === 'failed') { vyx({ k: 'mstate', st: 'failed', type: m.type, why: f.why }); say('MISSION FAILED: {@name}', { name: V.MISSION_TYPES[m.type].name }, 'bad'); }
    }
    void before;
  }
  function spawnLoot(list, pos, base = 1) {
    for (const e of list) {
      const a = Math.random() * 6.28;
      game.items.hostSpawn(e.type, new THREE.Vector3(pos.x + Math.cos(a) * 0.15, pos.y, pos.z + Math.sin(a) * 0.15), { tier: e.tier, valueMul: base, linvel: [Math.cos(a) * 1.4, 3.6, Math.sin(a) * 1.4] });
    }
  }
  function rollChest(tierId, seed) {
    const rng = new RNG(seed);
    let list = null;
    try { list = game.crafting?.rollChestLoot?.(tierId, rng); } catch { /* fallback */ }
    if (Array.isArray(list)) list = list.filter((e) => e && ITEMS[e.type]);
    if (!Array.isArray(list) || !list.length) list = fallbackChestLoot(tierId, rng);
    return list;
  }
  function finishMission(m) {
    const r = run(), s = vy();
    r.credits += m.pay;
    s.done = (s.done | 0) + 1; s.earned = (s.earned | 0) + m.pay;
    S.stats.missionsDone++;
    game.broadcastRun(['credits', 'vy']);
    const seed = hashString(m.id + ':' + r.seed);
    spawnLoot(rollChest(m.loot, seed), SHIP_DROP(), 1);
    if (m.comps) { const R = new RNG(seed ^ 0xc0de); const ids = COMPONENT_IDS.filter((id) => ITEMS[id] && !ITEMS[id].keyItem); for (let i = 0; i < m.comps && ids.length; i++) game.items.hostSpawn(R.pick(ids), SHIP_DROP()); }
    for (const p of playersNow()) if (!p.dead) game.net.broadcast('xp', { to: p.id, xp: m.xp, coin: 5 + m.tier * 4, reason: 'Mission complete' }, true);
    vyx({ k: 'mstate', st: 'done', type: m.type, pay: m.pay });
    try { mods.emit('tfg:voyage', { k: 'done', type: m.type, patron: m.patron || V.missionPatron(m.type), pay: m.pay }, game); } catch { /* [story] optional */ }
    say('MISSION COMPLETE: {@name}  +▮{pay}. Loot delivered to the ship.', { name: V.MISSION_TYPES[m.type].name, pay: m.pay }, 'good');
    const H = S.host;
    if (H && m.type === 'heist') { vyx({ k: 'vault' }); }
  }
  function hostBoard(from) {
    const r = run();
    const offers = V.boardFor(runKey(), r.day | 0, r.quotaIndex | 0, charted(), signals());
    vyxTo(from, { k: 'board', offers, cur: mission() });
  }
  function hostTake(from, n) {
    const r = run(), s = vy();
    if (r.phase !== 'orbit') { replyTo(from, 'Routing is only possible while in orbit.', true); return; }
    if (s.mission && (s.mission.st === 'accepted' || s.mission.st === 'active')) { replyTo(from, 'You already have a job. DROPJOB first.', true); return; }
    const offers = V.boardFor(runKey(), r.day | 0, r.quotaIndex | 0, charted(), signals());
    const o = offers[n - 1];
    if (!o) { replyTo(from, 'No such job. Type MISSIONS.', true); return; }
    if (V.isVoyageId(o.moon)) V.registerVoyageMoon(o.moon);
    s.mission = V.newMission(o, r.day | 0);
    pushVy();
    say('JOB ACCEPTED: {@name} at {@m}', { name: V.MISSION_TYPES[o.type].name, m: moonName(o.moon) }, 'good');
    replyTo(from, 'Job accepted: {@name} at {@m} (pay ▮{pay}).', false, { name: V.MISSION_TYPES[o.type].name, m: moonName(o.moon), pay: o.pay });
    if (r.moon !== o.moon) {   // set the course for the crew
      if (V.isVoyageId(o.moon)) {
        const idx = signals().indexOf(o.moon);
        if (idx >= 0) hostRouteSignal(idx + 1, from);
      } else if (game.terminal?.hostExecute) game.terminal.hostExecute({ op: 'route', moon: o.moon }, from);
    }
  }
  function hostDrop(from) {
    const s = vy();
    if (!s.mission || s.mission.st === 'done' || s.mission.st === 'failed') { replyTo(from, 'You have no job.', true); return; }
    if (s.mission.st === 'active' && run().phase === 'moon') mstep({ t: 'abandon' });
    else { s.mission = null; pushVy(); }
    replyTo(from, 'Job dropped.', false);
  }

  // ============================================================================================ HOST: per-landing runtime
  const outdoor = () => game.world?.outdoor || null;
  const vworld = () => outdoor()?.voyage || null;
  const groundY = (x, z) => game.world?.terrain?.heightAt(x, z) ?? 0;
  const V3 = (p, dy = 0) => new THREE.Vector3(p.x, (p.y ?? groundY(p.x, p.z)) + dy, p.z);
  function guardType(g) { return CREATURES[g.type] ? g.type : (g.fallback && CREATURES[g.fallback] ? g.fallback : 'hound'); }
  function spawnGuards(list, tag) {
    let n = 0;
    for (const g of list || []) {
      const type = guardType(g), cnt = Math.min(g.n || 1, 6);
      for (let i = 0; i < cnt && S.host.guards < 14; i++) {
        const a = Math.random() * 6.28, d = Math.random() * (g.r || 4);
        const x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
        const c = game.creatures.hostSpawn(type, new THREE.Vector3(x, groundY(x, z), z), { level: game.rollLevel?.() || 1, elite: false, zone: 'out', data: { vyTag: tag } });
        if (c) { S.host.guards++; n++; }
      }
    }
    return n;
  }
  function hostPopulate() {
    if (!host() || !enabled()) return;
    const r = run(), moon = MOONS[r.moon], vw = vworld();
    S.host = { key: `${r.seed}:${r.moon}`, used: new Set(), npcs: new Map(), guards: 0, meteor: { next: 75, n: 0 }, hold: null, marks: [], t: 0, tickT: 0, sendT: 0, bb: null, spec: null, specTries: 0, wares: null, respawn: 0 };
    vy().u = []; pushVy();
    if (!vw) { const m0 = mission(); if (m0) mstep({ t: 'land', moon: r.moon }); return; }
    const rng = new RNG((r.seed ^ 0x76797a) >>> 0);
    const theme = game.world.facility?.layout?.theme || moon.interior;
    const table = scrapTableFor(theme).map(([id, w]) => ({ id, w })).filter((e) => ITEMS[e.id] && e.id !== 'key');
    const valueMul = (moon.scrapMul || 1) * scrapValueMul(r.quotaIndex) * 0.9;
    const cont = vw.content;
    if (cont) {
      const lootMul = V.CONTENT[moon.content]?.loot || 1;
      for (const s of cont.loot || []) {
        let id;
        if (s.kind === 'meteor') id = 'vy_meteorite';
        else if (s.kind === 'prize') id = rng.pick(['goldbar', 'ring', 'figurine', 'trophy'].filter((x) => ITEMS[x]));
        else id = rng.weighted(table).id;
        if (id && ITEMS[id]) hostSpawnAt(id, s, { valueMul: valueMul * (s.mul || 1) * lootMul }, 0.5);
      }
      spawnGuards(cont.guards, 'content');
    }
    for (const s of outdoor()?.decor?.info?.cache || []) { const id = rng.weighted(table).id; game.items.hostSpawn(id, V3(s, 0.4), { valueMul: valueMul * 1.5 }); }
    const m0 = mission();
    if (m0 && m0.moon === r.moon && (m0.st === 'accepted' || m0.st === 'active')) setupMission(m0, vw);
    if (mission()) mstep({ t: 'land', moon: r.moon });
  }
  function hostSpawnAt(id, s, opts, dy = 0.5) { return game.items.hostSpawn(id, V3(s, dy), opts); }

  function setupMission(m, vw) {
    const H = S.host, r = run();
    const site = vw.sites[0], site2 = vw.sites[1];
    switch (m.type) {
      case 'rescue': if (site?.npc) H.npcs.set('n1', { id: 'n1', kind: 'crew', x: site.npc.x, y: groundY(site.npc.x, site.npc.z), z: site.npc.z, yaw: 0, hp: 100, max: 100, st: 'stranded' }); break;
      case 'drone': if (site?.npc && site2?.goal) H.npcs.set('d1', { id: 'd1', kind: 'drone', x: site.npc.x, y: groundY(site.npc.x, site.npc.z) + 1.6, z: site.npc.z, yaw: 0, hp: 220, max: 220, st: 'idle', goal: site2.goal, total: flat(site.npc, site2.goal), amb: [false, false] }); break;
      case 'blackbox': if (site?.spot) H.bb = hostSpawnAt('vy_blackbox', site.spot, {}, 0.6); break;
      case 'hunt': if (site?.spot) spawnMark(site.spot, m); break;
      case 'photo': spawnSpecimen(); break;
      default: break;
    }
    void r;
  }
  function spawnMark(spot, m) {
    const tier = m.tier || 1;
    const type = tier >= 3 && CREATURES.clickbait ? 'clickbait' : 'hound';
    const c = game.creatures.hostSpawn(type, V3(spot, 0.1), { level: (game.rollLevel?.() || 1) + 2, elite: true, zone: 'out', data: { vyMark: true } });
    if (c) S.host.marks.push(c);
  }
  function spawnSpecimen() {
    const H = S.host, o = outdoor();
    let x = 0, z = 0, ok = false;
    for (let t = 0; t < 40 && !ok; t++) {
      const a = Math.random() * 6.28, d = 45 + Math.random() * 55;
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      ok = !o?.avoid?.(x, z, 2);
    }
    const c = game.creatures.hostSpawn('vy_specimen', new THREE.Vector3(x, groundY(x, z), z), { level: 1, elite: false, zone: 'out' });
    if (c) { H.spec = c; }
  }

  // ---- interaction (host validates)
  function allSpots() {
    const vw = vworld();
    if (!vw) return [];
    const out = [];
    for (const s of vw.content?.inter || []) out.push({ ...s, src: 'content' });
    vw.sites.forEach((site, si) => { for (const s of site.inter || []) out.push({ ...s, src: 'mission', si }); });
    for (const a of vw.anoms) out.push({ id: 'a' + a.i, kind: 'anom', x: a.x, y: a.y, z: a.z, r: 1.4, i: a.i, src: 'mission' });
    return out;
  }
  function waresFor(moon) {
    const R = new RNG(hashString('vywares:' + moon.id));
    const pool = ['medkit', 'flashlight', 'adrenaline', 'stungrenade', 'lockpick', 'glowstick', 'walkie', 'proflash', 'booster', 'inhaler'].filter((id) => ITEMS[id]);
    R.shuffle(pool);
    const list = pool.slice(0, 2).map((id) => ({ item: id, price: Math.max(15, Math.round(((ITEMS[id].price || 30) * 1.25) / 5) * 5) }));
    const tier = moon.tier >= 3 ? 'gold' : 'iron';
    list.push({ crate: tier, price: tier === 'gold' ? 260 : 110 });
    return list;
  }
  function hostUse(id, from) {
    const H = S.host, r = run();
    if (!H || r.phase !== 'moon') return;
    const p = game.aiPlayerById(from);
    if (!p || p.dead) return;
    const moon = MOONS[r.moon];
    let spot = allSpots().find((s) => s.id === id && s.src);
    let npcSpot = null;
    if (!spot && (id === 'free' || id === 'power')) { for (const n of H.npcs.values()) if ((id === 'free' && n.kind === 'crew') || (id === 'power' && n.kind === 'drone')) npcSpot = { id, kind: id, x: n.x, y: n.y + 1, z: n.z, n }; spot = npcSpot; }
    if (!spot) return;
    if (flat(p.pos, spot) > 8 || Math.abs(p.pos.y - (spot.y ?? p.pos.y)) > 12) return;
    const usedKey = spot.id + (spot.si !== undefined ? '@' + spot.si : '');
    if (H.used.has(usedKey) && spot.kind !== 'talk') return;
    const use = () => { H.used.add(usedKey); const s = vy(); s.u = [...H.used]; pushVy(); };
    const tier = moon.tier || 1;
    const m = mission();
    const active = m && m.st === 'active';
    switch (spot.kind) {
      case 'recorder': case 'log': {
        use();
        const cr = (spot.kind === 'recorder' ? 40 : 25) + tier * 15;
        r.credits += cr; game.broadcastRun(['credits']);
        spawnLoot(rollChest(spot.kind === 'recorder' ? 'iron' : 'wood', hashString(usedKey + r.seed)), V3(spot, 0.6), 1);
        vyx({ k: 'found', what: spot.kind, cr });
        break;
      }
      case 'relic': {
        use();
        hostSpawnAt('vy_relic', spot, { valueMul: (r.quotaIndex ? scrapValueMul(r.quotaIndex) : 1) * (moon.scrapMul || 1) * 0.9 }, 0.5);
        const vw = vworld();
        spawnGuards(vw?.content?.ambush, 'ambush');
        vyx({ k: 'relic' });
        say('The relic screams. Something answers.', {}, 'bad');
        break;
      }
      case 'ware': {
        const wares = (H.wares ||= waresFor(moon));
        const w = wares[+spot.id.slice(4)];
        if (!w) return;
        if (r.credits < w.price) { game.net.sendTo(from, 'sys', sysMsg('Not enough credits: ▮{p} needed.', { p: w.price }, 'bad')); return; }
        use();
        r.credits -= w.price; game.broadcastRun(['credits']);
        if (w.item) hostSpawnAt(w.item, spot, {}, 0.6); else spawnLoot(rollChest(w.crate, hashString('vycrate' + r.seed + usedKey)), V3(spot, 0.7), 1);
        game.net.sendTo(from, 'sys', sysMsg('Purchased for ▮{p}.', { p: w.price }, 'good'));
        break;
      }
      case 'strongbox': case 'cargo': {
        use();
        const ti = spot.kind === 'strongbox' ? (tier >= 3 ? 'gold' : 'iron') : (tier >= 3 ? 'iron' : 'wood');
        spawnLoot(rollChest(ti, hashString(usedKey + r.seed)), V3(spot, 0.7), 1);
        if (spot.kind === 'strongbox') { r.credits += 30 + tier * 20; game.broadcastRun(['credits']); }
        vyx({ k: 'found', what: spot.kind, cr: spot.kind === 'strongbox' ? 30 + tier * 20 : 0 });
        break;
      }
      case 'free': {
        if (!active || m.type !== 'rescue' || spot.n.st !== 'stranded') return;
        spot.n.st = 'follow'; use();
        mstep({ t: 'npc_freed' });
        vyx({ k: 'npcsay', kind: 'crew', line: 0 });
        break;
      }
      case 'power': {
        if (!active || m.type !== 'drone' || spot.n.st !== 'idle') return;
        spot.n.st = 'route'; use();
        mstep({ t: 'drone_on' });
        break;
      }
      case 'panel': {
        if (!active || m.type !== 'relay') return;
        use(); mstep({ t: 'panel', i: spot.i });
        vyx({ k: 'panel', i: spot.i, si: spot.si });
        const n = (mission()?.p?.panels || []).filter(Boolean).length;
        if (n === 2 || n === 1) spawnGuards(vworld()?.sites?.[spot.si]?.ambush, 'ambush');
        break;
      }
      case 'anom': {
        if (!active || m.type !== 'survey') return;
        use(); mstep({ t: 'read', i: spot.i });
        vyx({ k: 'anom', i: spot.i });
        if (Math.random() < 0.35) { const a = Math.random() * 6.28; const x = spot.x + Math.cos(a) * 9, z = spot.z + Math.sin(a) * 9; game.creatures.hostSpawn(CREATURES.zombot ? 'zombot' : 'hound', new THREE.Vector3(x, groundY(x, z), z), { level: game.rollLevel?.() || 1, zone: 'out' }); }
        break;
      }
      case 'rig': case 'vault': {
        if (!active || (m.type !== 'defend' && m.type !== 'heist') || m.p.on) return;
        use(); mstep({ t: 'hold_start' });
        const site = vworld()?.sites?.[0];
        H.hold = { site, pos: site?.rigPos || spot, hp: 100, k: 0, wave: 2, away: 0, kind: m.type };
        vyx({ k: 'hold', on: 1, type: m.type });
        break;
      }
      case 'talk': break;
      default: break;
    }
  }

  // ---- ticks (host)
  const aliveOut = () => playersNow().filter((p) => !p.dead && !p.inShip && p.zone === 'out');
  function hostTick(dt, force = false) {
    const H = S.host, r = run();
    if (!H || r?.phase !== 'moon') return;
    H.t += dt; H.tickT -= dt;
    // fast: npc movement every frame
    const ps = aliveOut();
    for (const n of H.npcs.values()) tickNpc(n, dt, ps);
    tickHold(dt);
    if (H.tickT > 0 && !force) return;
    H.tickT = 0.5;
    const m = mission(), vw = vworld();
    // meteor director
    const cont = MOONS[r.moon]?.content;
    if (cont === 'meteor' && vw?.content) { H.meteor.next -= 0.5; if (H.meteor.next <= 0 && H.meteor.n < 7 && r.time < 22.5 * 60) meteorStrike(ps, vw); }
    if (!m || m.st !== 'active') return;
    switch (m.type) {
      case 'blackbox': {
        const it = H.bb ? game.items.get(H.bb) : null;
        if (!it) { if (H.bb) mstep({ t: 'abandon' }); break; }
        if (it.state === 'world' && insideShip(it.obj.position) || game.items.inShipItems().includes(it)) mstep({ t: 'delivered' });
        break;
      }
      case 'hunt': if (H.marks.length && H.marks.every((c) => c.dead || !game.creatures.host.has(c.id))) mstep({ t: 'target_dead' }); break;
      case 'photo': if (H.spec && (H.spec.dead || !game.creatures.host.has(H.spec.id)) && H.specTries < 3) { H.specTries++; spawnSpecimen(); } break;
      default: break;
    }
  }
  function tickNpc(n, dt, ps) {
    if (n.st === 'stranded' || n.st === 'safe' || n.st === 'dead' || n.st === 'idle') { npcHurt(n, dt); return; }
    const gs = game.world?.terrain;
    if (n.kind === 'crew') {
      let near = null, nd = 1e9;
      for (const p of ps) { const d = flat(p.pos, n); if (d < nd) { nd = d; near = p; } }
      if (near && nd > 3.4 && nd < 70) {
        const sp = Math.min(3.9, 1.6 + nd * 0.35) * dt, a = Math.atan2(near.pos.x - n.x, near.pos.z - n.z);
        n.x += Math.sin(a) * sp; n.z += Math.cos(a) * sp; n.yaw = a;
      }
      n.y = gs ? gs.heightAt(n.x, n.z) : n.y;
      // safe = inside the ship, or right at its door
      if (insideShip(new THREE.Vector3(n.x, n.y + 0.5, n.z)) || Math.hypot(n.x, n.z) < 6.5) { n.st = 'safe'; mstep({ t: 'npc_safe' }); vyx({ k: 'npcsay', kind: 'crew', line: 1 }); }
    } else if (n.kind === 'drone') {
      const near = ps.some((p) => flat(p.pos, n) < 15);
      if (near) {
        const d = flat(n, n.goal), a = Math.atan2(n.goal.x - n.x, n.goal.z - n.z), sp = Math.min(d, 2.5 * dt);
        n.x += Math.sin(a) * sp; n.z += Math.cos(a) * sp; n.yaw = a;
        n.y = (gs ? gs.heightAt(n.x, n.z) : n.y) + 1.6;
        const frac = clamp(1 - d / Math.max(1, n.total), 0, 1);
        n.frac = frac;
        n.mT = (n.mT || 0) - dt;
        if (n.mT <= 0) { n.mT = 1; mstep({ t: 'drone_move', frac }); }
        for (let k = 0; k < 2; k++) if (!n.amb[k] && frac > 0.32 + 0.36 * k) { n.amb[k] = true; ambushAt(n, k); }
        if (d < 2.5) { n.st = 'safe'; mstep({ t: 'drone_done' }); }
      }
    }
    npcHurt(n, dt);
  }
  function ambushAt(n, k) {
    const type = CREATURES.zombot ? 'zombot' : 'hound';
    const a = n.yaw + (k ? 1.2 : -1.2);
    for (let i = 0; i < 2 + (MOONS[run().moon].tier >= 3 ? 1 : 0); i++) {
      const x = n.x + Math.sin(a) * (14 + i * 2), z = n.z + Math.cos(a) * (14 + i * 2);
      game.creatures.hostSpawn(k ? 'hound' : type, new THREE.Vector3(x, groundY(x, z), z), { level: game.rollLevel?.() || 1, zone: 'out' });
    }
    say('Hostiles are closing in on the drone!', {}, 'warn');
  }
  function npcHurt(n, dt) {
    if (n.st === 'safe' || n.st === 'dead') return;
    let dps = 0;
    for (const c of game.creatures.host.values()) {
      if (c.dead || c.def?.hazard || c.data?.vyMark === undefined && c.def?.zone === 'in') continue;
      if (c.type === 'vy_specimen' || c.def?.dmg === 0) continue;
      if (Math.hypot(c.pos.x - n.x, c.pos.z - n.z) < 2.2) dps += 12;
    }
    if (!dps) return;
    n.hp -= dps * dt;
    if (n.hp <= 0) { n.st = 'dead'; n.hp = 0; mstep({ t: n.kind === 'drone' ? 'drone_dead' : 'npc_dead' }); vyx({ k: 'npcdead', kind: n.kind }); }
  }
  function tickHold(dt) {
    const H = S.host, m = mission(), h = H?.hold;
    if (!h || !m || m.st !== 'active' || !m.p.on) return;
    const pos = h.pos, ps = aliveOut();
    const near = ps.some((p) => flat(p.pos, pos) < 18);
    if (near) { h.away = 0; mstep({ t: 'hold_tick', dt }); }
    else h.away += dt;
    if (mission()?.st !== 'active') { H.hold = null; return; }
    // waves
    h.k -= dt;
    if (h.k <= 0) {
      h.k = m.type === 'heist' ? 8 : 15;
      const n = Math.min(4, 1 + Math.floor(h.wave / 3) + (m.tier >= 3 ? 1 : 0));
      h.wave++;
      let alive = 0; for (const c of game.creatures.host.values()) if (!c.dead && c.data?.vyHold) alive++;
      for (let i = 0; i < n && alive < 9; i++) {
        const a = Math.random() * 6.28, d = 26 + Math.random() * 6, x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
        const type = m.type === 'heist' ? (CREATURES.scavraider && Math.random() < 0.6 ? 'scavraider' : 'zombot') : (Math.random() < 0.35 ? 'hound' : (CREATURES.zombot ? 'zombot' : 'hound'));
        game.creatures.hostSpawn(CREATURES[type] ? type : 'hound', new THREE.Vector3(x, groundY(x, z), z), { level: game.rollLevel?.() || 1, zone: 'out', data: { vyHold: true } });
        alive++;
      }
    }
    // the rig takes damage from anything standing next to it
    if (m.type === 'defend') {
      let dps = 0;
      for (const c of game.creatures.host.values()) if (!c.dead && c.data?.vyHold && flat(c.pos, pos) < 4.5) dps += 5;
      h.hp = Math.max(0, h.hp - dps * dt);
      if (h.hp <= 0) mstep({ t: 'hold_fail' });
    }
  }
  function meteorStrike(ps, vw) {
    const H = S.host;
    H.meteor.n++; H.meteor.next = 35 + Math.random() * 25;
    const tgt = ps.length && Math.random() < 0.7 ? ps[Math.floor(Math.random() * ps.length)].pos : (vw.content.craters?.length ? vw.content.craters[Math.floor(Math.random() * vw.content.craters.length)] : { x: 0, z: 30 });
    const a = Math.random() * 6.28, d = 8 + Math.random() * 10, x = tgt.x + Math.cos(a) * d, z = tgt.z + Math.sin(a) * d;
    vyx({ k: 'meteor', x, z, sec: 2.6 });
    game.later(() => {
      if (disposed || run()?.phase !== 'moon') return;
      vyx({ k: 'impact', x, z });
      for (const p of playersNow()) if (!p.dead && !p.inShip && p.zone === 'out' && flat(p.pos, { x, z }) < 5.5) game.hostHurtPlayer(p.id, 34 + (MOONS[run().moon].tier || 1) * 6, 'meteor', null, new THREE.Vector3(x, groundY(x, z), z));
      if (Math.random() < 0.55) game.items.hostSpawn('vy_meteorite', new THREE.Vector3(x, groundY(x, z) + 0.5, z), { valueMul: 1 + (run().quotaIndex || 0) * 0.05 });
    }, 2600);
  }
  function sendNpcs() {
    const H = S.host;
    if (!H) return;
    const rows = [];
    for (const n of H.npcs.values()) rows.push([n.id, n.kind, +n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2), +n.yaw.toFixed(2), Math.round((n.hp / n.max) * 100), n.st]);
    if (H.hold) rows.push(['rig', 'rig', +H.hold.pos.x.toFixed(1), 0, +H.hold.pos.z.toFixed(1), 0, Math.round(H.hold.hp), 'on']);
    if (!rows.length) return;
    game.net.broadcast('vyn', { r: rows });
  }

  // ============================================================================================ requests (host) + messages (everyone)
  on('registerHandlers', (Hh, g) => {
    if (g !== game) return;
    Hh('vyreq', (d, from) => {
      try {
        if (!d || !enabled()) return;
        switch (d.op) {
          case 'random': hostRouteRandom(from); break;
          case 'signal': hostRouteSignal(d.n | 0, from); break;
          case 'board': hostBoard(from); break;
          case 'take': hostTake(from, d.n | 0); break;
          case 'drop': hostDrop(from); break;
          case 'vote': hostVote(from, !!d.yes); break;
          case 'use': hostUse(String(d.id || ''), from); break;
          case 'warp': {
            if (!['on', 'off', 'early'].includes(d.mode)) { replyTo(from, `WARP is ${vy().warp}. Usage: WARP ON | OFF | EARLY`, false); break; }
            vy().warp = d.mode; pushVy();
            say('Random warp events: {m}', { m: d.mode.toUpperCase() }, 'info');
            break;
          }
          case 'photo': {
            const H = S.host, m = mission(), p = game.aiPlayerById(from);
            if (!H || !m || m.st !== 'active' || m.type !== 'photo' || !H.spec || H.spec.dead || !p) break;
            if (flat(p.pos, H.spec.pos) < 34) mstep({ t: 'photo' });
            break;
          }
          default: break;
        }
      } catch (e) { console.error('[voyage] vyreq', e); }
    });
  });
  const askHost = (op, extra = {}) => game.net?.request('vyreq', { op, ...extra });

  function onVyx(m) {
    if (disposed || !m) return;
    switch (m.k) {
      case 'banner': game.ui?.hud?.bigText?.(tf(m.main, m.v || {}), m.sub ? tf(m.sub, m.v || {}) : ''); game.sfx?.('ship_alarm', 0.35); break;
      case 'prompt': showPrompt(m); break;
      case 'promptEnd': hidePrompt(m.ok); break;
      case 'board': printBoard(m); break;
      case 'mstate': onMissionState(m); break;
      case 'mprog': game.ui?.toast?.(t('Objective updated.'), 'good'); game.sfx?.('ui_click', 0.6); break;
      case 'found': game.ui?.toast?.(m.what === 'recorder' ? tf('Flight recorder recovered! +▮{c}', { c: m.cr }) : m.what === 'log' ? tf('Colony log read: {n}', { n: t(LOG_LINES[Math.floor(Math.random() * LOG_LINES.length)]) }) : m.what === 'strongbox' ? tf('Strongbox cracked! +▮{c}', { c: m.cr }) : t('Cargo crate opened!'), 'good'); game.sfx?.('vault_open', 0.6); break;
      case 'relic': game.engine?.shake?.(0.6); game.engine?.flash?.(0x40f0d0, 0.4); game.sfx?.('sandkefal_roar', 0.5); break;
      case 'panel': game.sfx?.('spark', 0.7); { const site = vworld()?.sites?.[m.si || 0]; vworld()?.setPanel?.(site, m.i, true); } break;
      case 'anom': game.sfx?.('scan', 0.6); vworld()?.markAnomaly?.(m.i); break;
      case 'hold': game.ui?.toast?.(m.type === 'heist' ? t('ALARM! Hold the door until the vault cracks.') : t('The rig is running. Defend it!'), 'warn'); game.sfx?.('ship_alarm', 0.5); break;
      case 'vault': vworld()?.openVault?.(vworld()?.sites?.[0], game.physics); game.sfx?.('vault_open', 0.8); break;
      case 'npcsay': game.ui?.toast?.(t(NPC_LINES[m.kind]?.[m.line] || NPC_LINES.crew[0]), 'info'); break;
      case 'npcdead': game.ui?.toast?.(m.kind === 'drone' ? t('The cargo drone was destroyed.') : t('The crewmate did not make it.'), 'bad'); break;
      case 'meteor': spawnWarn(m.x, m.z, m.sec); break;
      case 'impact': impactFx(m.x, m.z); break;
      default: break;
    }
  }
  const LOG_LINES = ['Day 41: the generator failed again.', 'Day 44: nobody answers the radio.', 'Day 47: something is walking the fence at night.', 'Day 52: we left the lights on for the others.'];
  const NPC_LINES = { crew: ['Thank god. Get me out of here!', 'Safe. I owe you a beer.'] };
  function onMissionState(m) {
    const spec = V.MISSION_TYPES[m.type];
    if (m.st === 'active') game.ui?.hud?.bigText?.(t(spec?.name || 'Mission'), t('Job started'));
    else if (m.st === 'done') { game.ui?.hud?.bigText?.(t('MISSION COMPLETE'), tf('+▮{pay} and loot', { pay: m.pay })); game.sfx?.('quota_met', 0.6); }
    else if (m.st === 'failed') { game.ui?.toast?.(m.why === 'left' ? t('Mission failed: you left the moon.') : t('Mission failed.'), 'bad'); clearViews(); }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:vyx', onVyxMsg); boundNet?.off?.('msg:vyn', onVynMsg);
    boundNet = net; net.on('msg:vyx', onVyxMsg); net.on('msg:vyn', onVynMsg);
  }
  const onVyxMsg = (m, from) => { if (from === game.selfId || from === game.net?.hostId) onVyx(m); };
  const onVynMsg = (m, from) => { if ((from === game.selfId || from === game.net?.hostId) && m?.r) applyNpcRows(m.r); };
  on('netReady', (n, g) => { if (g === game) bindNet(n); });
  if (game.net) bindNet(game.net);

  // ============================================================================================ CLIENT: npc views
  function ensureView(id, kind) {
    let v = S.views.get(id);
    if (v || kind === 'rig') return v;
    const model = createNpcModel(kind);
    game.scene.add(model.root);
    v = { id, kind, model, pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, hp: 100, st: '', fresh: true };
    S.views.set(id, v);
    return v;
  }
  function applyNpcRows(rows) {
    for (const [id, kind, x, y, z, yaw, hp, st] of rows) {
      if (kind === 'rig') { S.rigHp = hp; continue; }
      const v = ensureView(id, kind);
      if (!v) continue;
      v.target.set(x, y, z); v.yaw = yaw; v.hp = hp; v.st = st;
      if (v.fresh) { v.pos.copy(v.target); v.fresh = false; }
    }
  }
  function clearViews() { for (const v of S.views.values()) { v.model.root.removeFromParent(); v.model.dispose?.(); } S.views.clear(); S.rigHp = null; }
  function updateViews(dt, tt) {
    for (const v of S.views.values()) {
      v.pos.lerp(v.target, Math.min(1, dt * 6));
      const r = v.model.root;
      r.position.copy(v.pos);
      r.rotation.y += (v.yaw - r.rotation.y) * Math.min(1, dt * 8);
      if (v.kind === 'drone') { for (const rotor of v.model.rotors) rotor.rotation.y += dt * 40; r.position.y += Math.sin(tt * 2.4) * 0.08; v.model.led.material.color.setHex(v.st === 'route' ? 0x40ff70 : 0xff9a30); }
      else { v.model.beacon.visible = v.st === 'stranded' && Math.sin(tt * 6) > 0; if (v.st === 'stranded') { v.model.armL.rotation.z = 2.4 + Math.sin(tt * 5) * 0.4; } else v.model.armL.rotation.z = 0; }
      r.visible = v.st !== 'dead';
    }
  }

  // ============================================================================================ CLIENT: prompt (distress vote)
  function showPrompt(m) {
    hidePrompt();
    S.promptEl = hudDock('bottom', 'vyprompt', 2);
    S.prompt = { id: m.id, name: m.name, content: m.content, tier: m.tier, t0: performance.now(), sec: m.sec || 15, voted: false };
    renderPrompt();
    game.sfx?.('ship_alarm', 0.4);
  }
  function renderPrompt() {
    const p = S.prompt;
    if (!p || !S.promptEl) return;
    const left = Math.max(0, p.sec - (performance.now() - p.t0) / 1000);
    S.promptEl.innerHTML = `<div class="vy-prompt"><b>${esc(t('DISTRESS SIGNAL'))}</b><div>${esc(tf('A ship calls for help from {name} (T{tier}){c}.', { name: p.name, tier: p.tier, c: p.content ? ' · ' + t(contentName(p.content)) : '' }))}</div>`
      + `<div style="margin-top:6px"><span class="vy-k">B</span> ${esc(t('answer'))} &nbsp; <span class="vy-k">M</span> ${esc(t('ignore'))} &nbsp; ${p.voted ? esc(t('vote cast')) : ''}</div><div class="vy-bar"><span style="width:${Math.round(left / p.sec * 100)}%"></span></div></div>`;
  }
  function hidePrompt(ok) {
    if (S.promptEl) { S.promptEl.remove(); S.promptEl = null; }
    if (S.prompt && ok !== undefined) game.ui?.toast?.(ok ? t('The crew answers the distress call.') : t('The crew ignores the distress call.'), ok ? 'good' : 'info');
    S.prompt = null;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const onKey = (e) => {
    if (!S.prompt || S.prompt.voted || game.terminal?.active || e.repeat) return;
    if (e.code !== 'KeyB' && e.code !== 'KeyM') return;
    e.preventDefault(); e.stopImmediatePropagation();   // the open vote prompt owns B/M (trade decline / emote wheel yield)
    S.prompt.voted = true;
    askHost('vote', { yes: e.code === 'KeyB' });
    renderPrompt();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  // ============================================================================================ CLIENT: terminal
  const tierBar = (m) => { const n = clamp(Math.round(m.riskScore ?? m.tier ?? 1), 1, 5); return '[' + '#'.repeat(n) + '-'.repeat(5 - n) + ']'; };
  function sigLines() {
    const r = run(), out = [];
    if (!r || !enabled()) return out;
    signals().forEach((id, i) => {
      const m = V.generateVoyageMoon(id);
      if (!m) return;
      const cont = m.content ? '  ·  ' + t(contentName(m.content)) : '';
      out.push(`~${i + 1} ${m.name.padEnd(28)} T${m.tier} ${m.cost ? '▮' + m.cost : t('FREE')}  ${tierBar(m)} ${t(m.risk)}`);
      out.push(`     ${t(biomeName(m.biome))} / ${t(INTERIOR_NAMES[m.interior] || m.interior)}${cont}${m.gravity < 1 ? '  ·  ' + t('LOW GRAVITY') : ''}`);
    });
    return out;
  }
  function printBoard(m) {
    const term = game.terminal;
    const lines = [t('MISSION BOARD') + '  ' + tf('(day {d})', { d: run()?.day | 0 }), t('Pay is credits + loot. TAKE <n> accepts a job, DROPJOB cancels it.'), ''];
    (m.offers || []).forEach((o, i) => {
      const spec = V.MISSION_TYPES[o.type];
      lines.push(`[${i + 1}] ${t(spec.name)}${o.patron ? ' <' + t(o.patron === 'company' ? 'COMPANY' : 'ALGORITHM') + '>' : ''}  ▮${o.pay}  ${t('loot')}: ${o.loot}${o.comps ? ' +' + o.comps + ' ' + t('parts') : ''}   T${o.tier}`);
      lines.push(`    ${t('Where')}: ${moonName(o.moon)}${V.isVoyageId(o.moon) ? '  [' + t('SIGNAL') + ']' : ''}`);
      lines.push(`    ${brief(o)}`);
    });
    if (m.cur && (m.cur.st === 'accepted' || m.cur.st === 'active')) lines.push('', tf('ACTIVE JOB: {n} at {m}', { n: t(V.MISSION_TYPES[m.cur.type].name), m: moonName(m.cur.moon) }));
    term?.print(lines.join('\n'));
  }
  const brief = (o) => {
    const base = t(V.MISSION_TYPES[o.type].brief);
    if (o.type === 'survey') return tf('{b} ({n} readings)', { b: base, n: o.n });
    if (o.type === 'defend' || o.type === 'heist') return tf('{b} ({n} s)', { b: base, n: o.n });
    return base;
  };
  function passthrough(name, term, line) {
    const cmds = mods.commands;
    const saved = cmds?.get(name);
    if (!saved) { term.exec(line); return; }
    cmds.delete(name);
    try { term.exec(line); } finally { cmds.set(name, saved); }
  }
  const cmdRoot = { current: [] };
  function registerCommands() {
    const api = mods.api || (typeof window !== 'undefined' ? window.KefalAPI : null);
    if (!api?.registerCommand) return;
    const reg = (name, fn, help) => { api.registerCommand(name, fn, help); cmdRoot.current.push(name); };
    reg('moon', (rest, term) => {
      if (rest[0] === 'random' || rest[0] === 'rnd' || rest[0] === 'rand') {
        if (!enabled()) { term.print(t('Voyages are disabled.'), 'err'); return; }
        term.print(tf('Rolling a random destination... fee ▮{f}.', { f: V.randomFee(run()?.quotaIndex | 0) }));
        askHost('random');
        return;
      }
      passthrough('moon', term, 'moon' + (rest.length ? ' ' + rest.join(' ') : ''));
    }, 'MOON RANDOM: fly to a fully random place with random content (small fee)');
    reg('moons', (rest, term) => {
      passthrough('moons', term, 'moons');
      const lines = sigLines();
      if (lines.length) term.print(['', t('UNCHARTED SIGNALS (rotate daily):'), ...lines, '', t('SIGNAL <n> to fly there, MOON RANDOM for a total gamble, MISSIONS for jobs.')].join('\n'));
    }, 'list moons, weather + the uncharted signals');
    reg('signals', (rest, term) => {
      const n = parseInt(rest[0], 10);
      if (n >= 1 && n <= 3) { askHost('signal', { n }); return; }
      const lines = sigLines();
      term.print(lines.length ? [t('UNCHARTED SIGNALS (rotate daily):'), ...lines, '', t('SIGNAL <n> to fly there.')].join('\n') : t('No signals in range.'));
    }, 'uncharted signals (rotate daily); SIGNALS <n> routes to one');
    reg('route', (rest, term) => {
      const m = /^(?:s|~|sig|signal)\s*([1-3])$/.exec(rest.join(' '));
      if (m) { askHost('signal', { n: +m[1] }); return; }
      passthrough('route', term, 'route' + (rest.length ? ' ' + rest.join(' ') : ''));
    }, 'ROUTE <moon> | ROUTE S1..S3 (uncharted signals)');
    reg('missions', (rest, term) => { if (!enabled()) { term.print(t('Voyages are disabled.'), 'err'); return; } askHost('board'); }, 'the mission board: per-destination jobs with pay + loot');
    reg('take', (rest, term) => { const n = parseInt(rest[0], 10); if (!(n >= 1 && n <= 4)) { term.print(t('Usage: TAKE <1-4> (see MISSIONS)'), 'err'); return; } askHost('take', { n }); }, 'TAKE <n>: accept a job from the mission board');
    reg('dropjob', (rest, term) => askHost('drop'), 'cancel the active job');
    reg('warp', (rest, term) => {
      const mode = (rest[0] || '').toLowerCase();
      if (!['on', 'off', 'early'].includes(mode)) { term.print(tf('Random warp events: {m}. Usage: WARP ON | OFF | EARLY (EARLY also allows them in the first two quotas).', { m: (vy()?.warp || 'on').toUpperCase() })); return; }
      askHost('warp', { mode });
    }, 'random warp events: WARP ON / OFF / EARLY');
    reg('voyage', (rest, term) => {
      const s = vy();
      term.print([t('VOYAGE: the adventure layer.'), t('>MOON RANDOM   fly to a random place with random content (small fee)'), t('>SIGNALS       3 uncharted signals, rotate daily (SIGNAL <n> to fly)'), t('>MISSIONS      jobs with pay + loot; TAKE <n>, DROPJOB'), t('>WARP ON|OFF|EARLY  random navigation glitches / distress calls'),
        tf('Jobs done: {n}  ·  earned ▮{e}  ·  warp: {w}', { n: s?.done | 0, e: s?.earned | 0, w: (s?.warp || 'on').toUpperCase() })].join('\n'));
    }, 'overview of random voyages, signals, missions');
  }
  registerCommands();

  // ============================================================================================ CLIENT: interactables, objectives, markers
  const me = () => game.player;
  const useFn = (id) => () => askHost('use', { id });
  function buildInter() {
    const vw = vworld(), moon = MOONS[run()?.moon];
    S.inter = [];
    if (!vw || !moon) return;
    const add = (o) => S.inter.push(o);
    const usedHas = (id) => S.usedLocal.has(id);
    for (const s of vw.content?.inter || []) {
      const pos = new THREE.Vector3(s.x, s.y, s.z);
      const id = s.id;
      const base = { pos, r: s.r || 1.4, reach: 3.6, action: useFn(id) };
      if (s.kind === 'recorder') add({ ...base, id, label: () => (usedHas(id) ? null : t('Pull the flight recorder [E]')), sub: () => t('Derelict ship') });
      else if (s.kind === 'log') add({ ...base, id, label: () => (usedHas(id) ? null : t('Read the colony log [E]')), sub: () => t('Abandoned colony') });
      else if (s.kind === 'relic') add({ ...base, id, label: () => (usedHas(id) ? null : t('Take the relic [E]')), sub: () => t('Something will wake up') });
      else if (s.kind === 'ware') {
        const wares = waresFor(moon), w = wares[+id.slice(4)];
        add({ ...base, id, label: () => (!w || usedHas(id) ? null : w.item ? tf('Buy {n} - ▮{p} [E]', { n: ITEMS[w.item]?.name || w.item, p: w.price }) : tf('Buy a {n} crate - ▮{p} [E]', { n: w.crate, p: w.price })), sub: () => t('Merchant outpost') });
      } else if (s.kind === 'talk') add({ ...base, id, label: () => t('Talk to the merchant [E]'), action: () => game.ui?.toast?.(t(RUMORS[(S.rumor++) % RUMORS.length]), 'info') });
      else if (s.kind === 'strongbox') add({ ...base, id, label: () => (usedHas(id) ? null : t('Crack the strongbox [E]')), sub: () => t('Pirate camp') });
      else if (s.kind === 'cargo') add({ ...base, id, label: () => (usedHas(id) ? null : t('Break open the cargo crate [E]')), sub: () => t('Crashed freighter') });
    }
    vw.sites.forEach((site, si) => {
      for (const s of site.inter || []) {
        const key = s.id + '@' + si, pos = new THREE.Vector3(s.x, s.y, s.z), base = { pos, r: s.r || 1.4, reach: 3.6, action: useFn(s.id) };
        if (s.kind === 'panel') add({ ...base, id: key, label: () => { const m = mission(); return m?.st === 'active' && !usedHas(key) ? t('Restore the power panel [E]') : null; } });
        else if (s.kind === 'power') add({ ...base, id: key, label: () => { const m = mission(); return m?.st === 'active' && !m.p.on ? t('Power up the cargo drone [E]') : null; } });
        else if (s.kind === 'rig') add({ ...base, id: key, label: () => { const m = mission(); return m?.st === 'active' && !m.p.on ? t('Start the mining rig [E]') : null; } });
        else if (s.kind === 'vault') add({ ...base, id: key, label: () => { const m = mission(); return m?.st === 'active' && !m.p.on ? t('Crack the vault [E]') : null; } });
      }
    });
    for (const a of vw.anoms) {
      const key = 'a' + a.i, pos = new THREE.Vector3(a.x, a.y, a.z);
      add({ pos, r: 1.5, reach: 3.4, id: key, action: useFn(key), label: () => { const m = mission(); return m?.st === 'active' && !usedHas(key) ? t('Take a reading [E]') : null; }, sub: () => tf('Anomaly {i}', { i: a.i + 1 }) });
    }
  }
  const RUMORS = ['They say the next signal pays double if you bring a camera.', 'Do not touch the relic. Everyone touches the relic.', 'Meteors only fall on people who look up.', 'I buy nothing. I sell everything. Cash only.'];
  on('interactables', (out, g) => {
    if (g !== game || disposed || run()?.phase !== 'moon' || me().indoor || me().dead) return;
    const key = `${run().seed}:${run().moon}:${game.world.outdoor ? 1 : 0}`;
    if (S.interKey !== key) { S.interKey = key; buildInter(); }
    S.usedLocal = new Set((run().vy?.u) || []);
    for (const it of S.inter) { const lbl = typeof it.label === 'function' ? it.label() : it.label; if (lbl) out.push({ pos: it.pos, r: it.r, reach: it.reach, label: lbl, sub: typeof it.sub === 'function' ? it.sub() : it.sub, action: it.action }); }
    // stranded crewmate / drone (moving views)
    const m = run().vy?.mission;
    if (m?.st === 'active') for (const v of S.views.values()) {
      if (v.kind === 'crew' && v.st === 'stranded' && m.type === 'rescue') out.push({ pos: v.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), r: 1.3, reach: 3.4, label: t('Free the crewmate [E]'), action: useFn('free') });
    }
  });
  const dist2 = (p) => Math.round(Math.hypot(me().pos.x - p.x, me().pos.z - p.z));
  function missionTargets() {
    const vw = vworld(), m = run()?.vy?.mission, out = [];
    if (!vw || !m || m.st !== 'active' || run().phase !== 'moon') return out;
    const s0 = vw.sites[0], s1 = vw.sites[1];
    const view = (kind) => { for (const v of S.views.values()) if (v.kind === kind) return v; return null; };
    const shipPos = { x: 0, y: 3, z: 0 };
    switch (m.type) {
      case 'rescue': { const v = view('crew'); if (!m.p.freed) out.push({ p: v ? v.pos : s0?.marker, label: 'Stranded crew' }); else out.push({ p: shipPos, label: 'Ship' }); break; }
      case 'blackbox': { const held = game.player.slots?.some((id) => id && game.items.get(id)?.type === 'vy_blackbox'); if (!held) { let ip = null; for (const it of game.items.all()) if (it.type === 'vy_blackbox' && it.state === 'world') ip = it.obj.position; out.push({ p: ip || s0?.marker, label: 'Black box' }); } else out.push({ p: shipPos, label: 'Ship' }); break; }
      case 'relay': { const nxt = (s0?.inter || []).find((s) => !(m.p.panels || [])[s.i]); out.push({ p: nxt || s0?.marker, label: 'Relay panel' }); break; }
      case 'hunt': { let cp = null; for (const v of game.creatures.views.values()) if (v.mark || v.data?.vyMark) cp = v.pos; out.push({ p: cp || s0?.marker, label: 'Marked target' }); break; }
      case 'drone': { const v = view('drone'); if (!m.p.on) out.push({ p: v ? v.pos : s0?.marker, label: 'Cargo drone' }); else out.push({ p: s1?.goal || s1?.marker, label: 'Drop beacon' }); if (m.p.on && v) out.push({ p: v.pos, label: 'Drone' }); break; }
      case 'survey': { let best = null; for (const a of vw.anoms) if (!(m.p.reads || [])[a.i]) if (!best || dist2(a) < dist2(best)) best = a; if (best) out.push({ p: best, label: 'Anomaly' }); break; }
      case 'defend': case 'heist': out.push({ p: s0?.marker, label: m.type === 'heist' ? 'Vault' : 'Mining rig' }); break;
      case 'photo': { let sp = null; for (const v of game.creatures.views.values()) if (v.type === 'vy_specimen' && v.state !== 'dead') sp = v.pos; if (sp) out.push({ p: sp, label: 'Rare creature' }); break; }
      default: break;
    }
    return out.filter((o) => o.p);
  }
  const contentTarget = () => {
    const vw = vworld(), moon = MOONS[run()?.moon];
    if (!vw?.content || !moon?.content) return null;
    return { p: { x: vw.content.flat.x, y: (vw.content.y0 || 0) + 3, z: vw.content.flat.z }, label: contentName(moon.content) };
  };
  on('objectives', (add, g, phase) => {
    if (g !== game || disposed) return;
    const r = run(), s = r?.vy;
    if (!s) return;
    const m = s.mission;
    if (phase === 'orbit') {
      if (m && (m.st === 'accepted')) add(tf('JOB: {n} at {m}', { n: t(V.MISSION_TYPES[m.type].name), m: moonName(m.moon) }), 'sub');
      if (isVoyage(r.moon)) { const mo = MOONS[r.moon]; add(tf('Uncharted: {m}{c}', { m: mo?.name || r.moon, c: mo?.content ? ' · ' + t(contentName(mo.content)) : '' }), 'sub'); }
      if (S.pendingWarp && S.pendingWarp.kind === 'glitch') add(t('NAVIGATION GLITCH: brace for landing'), 'warn');
      return;
    }
    if (phase !== 'moon') return;
    if (m && m.st === 'active') {
      const tg = missionTargets()[0], d = tg ? ` (${dist2(tg.p)} m)` : '', p = m.p;
      const nm = t(V.MISSION_TYPES[m.type].name), prog = V.missionProgress(m);
      switch (m.type) {
        case 'rescue': add(p.freed ? tf('Escort the crewmate to the ship{d}', { d }) : tf('Free the stranded crewmate{d}', { d }), 'main', false, prog); break;
        case 'blackbox': add(tf('Recover the black box and bring it to the ship{d}', { d }), 'main', false, prog); break;
        case 'relay': add(tf('Repair the relay tower: {n}/{t} panels{d}', { n: (p.panels || []).filter(Boolean).length, t: V.TOWER_PANELS, d }), 'main', false, prog); break;
        case 'hunt': add(tf('Kill the marked creature{d}', { d }), 'main'); break;
        case 'drone': add(p.on ? tf('Escort the drone to the beacon{d}', { d }) : tf('Power up the cargo drone{d}', { d }), 'main', false, prog); break;
        case 'survey': add(tf('Anomaly survey: {n}/{t} readings{d}', { n: (p.reads || []).filter(Boolean).length, t: m.n, d }), 'main', false, prog); break;
        case 'defend': add(p.on ? tf('Defend the rig: {t} s left - rig {h}%', { t: Math.max(0, Math.round(m.n - (p.t || 0))), h: S.rigHp ?? 100 }) : tf('Start the mining rig{d}', { d }), p.on ? 'warn' : 'main', false, prog); break;
        case 'heist': add(p.on ? tf('Hold the door: vault opens in {t} s', { t: Math.max(0, Math.round(m.n - (p.t || 0))) }) : tf('Crack the vault{d}', { d }), p.on ? 'warn' : 'main', false, prog); break;
        case 'photo': add(t('Photograph the rare creature (Instant Camera, under 30 m)'), 'main'); break;
        default: add(nm, 'main'); break;
      }
    } else if (m && m.st === 'done') add(t('Job done. Head home with the loot.'), 'sub', true);
    const ct = contentTarget();
    if (ct && !(m && m.st === 'active') && dist2(ct.p) > 12) add(tf('Signal source: {n} ({d} m)', { n: t(ct.label), d: dist2(ct.p) }), 'sub');
  });
  function ensureMarkEl() {
    if (S.markEl || typeof document === 'undefined') return;
    S.markEl = document.createElement('div');
    S.markEl.className = 'vy-marks';
    (document.getElementById('ui') || document.body).appendChild(S.markEl);
  }
  const _v = new THREE.Vector3();
  function updateMarkers() {
    ensureMarkEl();
    if (!S.markEl) return;
    const tg = run()?.phase === 'moon' && !me().dead && !me().indoor ? missionTargets() : [];
    const ct = contentTarget();
    if (ct && !(run().vy?.mission?.st === 'active') && !me().indoor && run().phase === 'moon' && dist2(ct.p) > 20) tg.push({ ...ct, soft: 1 });
    while (S.marks.length < tg.length) { const el = document.createElement('div'); el.className = 'vy-mk'; el.innerHTML = '<i></i><span></span>'; S.markEl.appendChild(el); S.marks.push(el); }
    const w = window.innerWidth, h = window.innerHeight;
    S.marks.forEach((el, i) => {
      const o = tg[i];
      if (!o) { el.style.display = 'none'; return; }
      _v.set(o.p.x, (o.p.y ?? 0) + (o.p.y === undefined ? 2 : 0), o.p.z).project(game.camera);
      let x = (_v.x * 0.5 + 0.5) * w, y = (1 - (_v.y * 0.5 + 0.5)) * h;
      if (_v.z > 1) { x = w - x; y = h - 40; }
      x = clamp(x, 40, w - 40); y = clamp(y, 60, h - 60);
      el.style.display = ''; el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.opacity = o.soft ? '0.65' : '1';
      el.lastChild.textContent = `${t(o.label)} ${dist2(o.p)} m`;
    });
  }

  // ============================================================================================ CLIENT: meteor warning ring + impact
  const fxObjs = [];
  function spawnWarn(x, z, sec) {
    const y = (game.world?.terrain?.heightAt(x, z) ?? 0) + 0.15;
    const geo = new THREE.RingGeometry(0.4, 5.5, 24), mat = new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(geo, mat); ring.rotation.x = -Math.PI / 2; ring.position.set(x, y, z);
    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, 34, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.6, depthWrite: false }));
    streak.position.set(x + 8, y + 40, z);
    game.scene.add(ring, streak);
    fxObjs.push({ ring, streak, t: 0, sec, x, z, y });
    game.ui?.toast?.(t('Incoming meteor! Watch the ground.'), 'warn');
  }
  function impactFx(x, z) {
    const y = game.world?.terrain?.heightAt(x, z) ?? 0;
    game.particles?.burst?.(new THREE.Vector3(x, y + 0.5, z), 'sparks', null, 3);
    if (Math.hypot(me().pos.x - x, me().pos.z - z) < 40) { game.engine?.shake?.(0.5); game.engine?.flash?.(0xff8a30, 0.25); game.sfx?.('explode', 0.7); }
    for (let i = fxObjs.length - 1; i >= 0; i--) if (Math.abs(fxObjs[i].x - x) < 0.5 && Math.abs(fxObjs[i].z - z) < 0.5) { disposeFx(fxObjs[i]); fxObjs.splice(i, 1); }
  }
  function disposeFx(f) { for (const o of [f.ring, f.streak]) { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); } }
  function updateFx(dt) {
    for (let i = fxObjs.length - 1; i >= 0; i--) {
      const f = fxObjs[i]; f.t += dt;
      const k = clamp(f.t / f.sec, 0, 1);
      f.ring.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(f.t * 8));
      f.ring.scale.setScalar(1.1 - 0.3 * k);
      f.streak.position.y = f.y + 40 * (1 - k * k) + 2; f.streak.position.x = f.x + 8 * (1 - k);
      if (f.t > f.sec + 1) { disposeFx(f); fxObjs.splice(i, 1); }
    }
  }

  // ============================================================================================ CLIENT: photo detection, hazards, low gravity
  function pollPhoto() {
    const m = run()?.vy?.mission;
    if (!m || m.st !== 'active' || m.type !== 'photo') return;
    const cam = game.horde?.camera;
    if (!cam || cam.lastInFrame === S.lastRef) return;
    S.lastRef = cam.lastInFrame;
    for (const f of cam.lastInFrame || []) if (f.type === 'vy_specimen' && f.dist < 30) { askHost('photo'); game.ui?.toast?.(t('Nice shot. Checking the frame...'), 'good'); break; }
  }
  const gravityNow = () => { const r = run(); if (r?.phase !== 'moon') return 1; const g = MOONS[r.moon]?.gravity; return g && g < 1 && !me().inShip ? g : 1; };
  const P = game.player, origUpdate = P.update;
  const wrappedUpdate = function (dt, input) {
    const gm = gravityNow();
    const res = origUpdate.call(this, dt, input);
    if (gm < 1 && !this.grounded && !this.dead && !this.frozen) this.vel.y += 19.6 * (1 - gm) * dt;   // the base controller applies 19.6 m/s2; give back the difference
    return res;
  };
  P.update = wrappedUpdate;
  function acidTick(dt) {
    const terrain = game.world?.terrain, p = me();
    if (!terrain?.biome?.acid || p.dead || p.indoor || p.inShip || run()?.phase !== 'moon') return;
    const fl = terrain.flood ?? -1.4;
    if (p.pos.y < fl + 0.3 && terrain.heightAt(p.pos.x, p.pos.z) < fl) {
      S.hazT -= dt;
      p.slowT = Math.max(p.slowT || 0, 0.3);
      if (S.hazT <= 0) { S.hazT = 0.5; game.damageLocal(7, 'acid', null); game.engine?.flash?.(0x98ff30, 0.25); game.sfx?.('spark', 0.35); }
    } else S.hazT = 0;
  }
  const origDeath = game.deathText;
  if (typeof origDeath === 'function') game.deathText = function (cause) { return cause === 'acid' ? 'took a dip in the acid sea.' : cause === 'meteor' ? 'was hit by a falling rock.' : origDeath.call(this, cause); };

  // ============================================================================================ events
  let tt = 0, hostSendT = 0;
  on('update', (dt, g) => {
    if (g !== game || disposed) return;
    tt += dt;
    updateViews(dt, tt);
    updateFx(dt);
    if (S.prompt) { S.prompt.tick = (S.prompt.tick || 0) - dt; if (S.prompt.tick <= 0) { S.prompt.tick = 0.25; renderPrompt(); } }
    if (run()?.phase === 'moon') { updateMarkers(); acidTick(dt); pollPhoto(); }
    else if (S.marks.length) S.marks.forEach((el) => { el.style.display = 'none'; });
    if (host() && enabled()) {
      try { hostTick(dt); } catch (e) { if (!S._warned) { S._warned = 1; console.warn('[voyage] tick', e); } }
      hostSendT -= dt;
      if (hostSendT <= 0) { hostSendT = 0.25; if (run()?.phase === 'moon') sendNpcs(); }
    }
  });
  on('moonPopulated', (g) => { if (g && g !== game) return; try { hostPopulate(); } catch (e) { console.warn('[voyage] populate', e); } });
  on('mapLoaded', () => { S.interKey = ''; S.inter = []; clearViews(); S.markEl && S.marks.forEach((el) => { el.style.display = 'none'; }); });
  on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph === 'orbit' || ph === 'takeoff') { clearViews(); for (const f of fxObjs.splice(0)) disposeFx(f); S.interKey = ''; }
    if (host()) {
      if (ph === 'orbit') {
        S.host = null;
        const s = vy();
        if (s?.mission && (s.mission.st === 'done' || s.mission.st === 'failed')) { s.mission = null; s.u = []; pushVy(); }
      }
      if (ph === 'landing') { S.pendingWarp = null; }
    }
  });
  on('hostStart', (g) => {
    if (g !== game) return;
    const s = vy();
    if (s.mission && s.mission.st === 'active') s.mission = { ...s.mission, st: 'accepted', p: {} };   // a save never resumes inside a job: the job can be flown again
    s.u = [];
    if (isVoyage(run().moon)) { V.registerVoyageMoon(run().moon); }
  });

  const api = {
    core: V, state: vy, stats: S.stats, signals, board: () => V.boardFor(runKey(), run()?.day | 0, run()?.quotaIndex | 0, charted(), signals()),
    routeRandom: () => hostRouteRandom(game.selfId), routeSignal: (n) => hostRouteSignal(n, game.selfId), take: (n) => hostTake(game.selfId, n),
    populate: hostPopulate, host: () => S.host, mstep, use: hostUse,
    /** true while the distress-vote prompt still waits for B / M */
    votePromptOpen: () => !!(S.prompt && !S.prompt.voted),
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      restores.length = 0;
      try { boundNet?.off?.('msg:vyx', onVyxMsg); boundNet?.off?.('msg:vyn', onVynMsg); } catch { /* ignore */ }
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      if (P.update === wrappedUpdate) { if (Object.prototype.hasOwnProperty.call(P, 'update')) delete P.update; else P.update = origUpdate; }
      if (typeof origDeath === 'function' && Object.prototype.hasOwnProperty.call(game, 'deathText')) delete game.deathText;
      for (const n of cmdRoot.current) mods.commands?.delete(n);
      hidePrompt(); clearViews();
      for (const f of fxObjs.splice(0)) disposeFx(f);
      S.markEl?.remove(); S.markEl = null;
      V.setMissionProvider(null);
    },
  };
  return api;
}
