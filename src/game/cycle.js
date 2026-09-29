// SECTOR CYCLE + ENDLESS MODE + KEYSTONE + RAID - module 'cycle' (docs/wave3/cycle2.md, design docs/MASTERPLAN.md 14 / 14.1 / 14.2 / 11 #15 #16).
// Glue only: the tested pure rules are cycle_core.js (state machine, endless meter, patch notes), cycle_plan.js (core moon, content plan, keystone /
// raid rules); the in-facility runtime is cycle_inst.js, endless effects cycle_endless.js, bosses cycle_bosses.js (+ cycle_bossfx.js visuals).
// Everything is behind game.config.cycle !== false (host option, default ON). State lives in run.cycle (saved with the run, synced by the generic
// run sync); the shared files are touched only through instance wrappers installed here (host.js hostEvaluateQuota / hostLever / hostSetPhase /
// hostPopulateMoon / hostBeginTakeoff / hostFinishTakeoff / hostUpdate, game.js applyRunState / onPhase, the 'unlock' request handler).
// Net (all 'cy*'): 'cyreq' client -> host requests {op}, 'cyx' host -> everyone messages {k}.
// The day flow (never a soft-lock, see tools/harness/cycle2.test.mjs):
//   quota met on the last day -> "SECTOR GATE OPEN" (autopilot locked on the Sector Core) -> land -> elites / key holders / arena boss ->
//   win = boss chest + next sector; lose (lever, wipe, recall) = grace day then retry; second loss = advance without a chest.
import { MOONS } from './moons.js';
import { sectorMoons } from './moongen.js';
import { hashString } from '../core/rng.js';
import { t, tf, sysMsg, tfIn } from '../core/i18n.js';
import * as CORE from './cycle_core.js';
import * as P from './cycle_plan.js';
import { installCycleBosses, BOSS_INFO } from './cycle_bosses.js';
import { createInstances, registerInstanceItems, cardModel, trophyModel, CARD } from './cycle_inst.js';
import { createEndless } from './cycle_endless.js';
import { createHostConsole } from './cycle_console.js';
import './cycle_i18n.js';

export function installCycle(game) {
  registerInstanceItems();
  const restores = [], offs = [];
  let disposed = false, boundNet = null;
  /** extension points for module 'cycle3' (classic Glitch Gates, trophies): gateDef(inst, runKey) -> moon def, onResult[] = fn(res, moon, inst) before the result is applied */
  const ext = { gateDef: null, onResult: [] };
  const enabled = () => game.config?.cycle !== false;
  const host = () => !!game.isHost;
  const cy = () => game.run?.cycle || null;
  const runKey = () => String(game.run?.runId ?? 'legacy');
  const say = (key, vars, kind) => game.net.broadcast('sys', sysMsg(key, vars || {}, kind || 'info'));
  const cyx = (d) => game.net.broadcast('cyx', d);
  const banner = (main, sub = '', kind = 'good') => cyx({ k: 'banner', main, sub, kind });
  const qiOf = () => Math.max(0, game.run?.quotaIndex | 0);
  const from = () => (game.config?.keystoneFrom ?? 1);

  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.itemModels) {
    mm.itemModels.set(CARD, () => cardModel());
    for (const tp of ['foreman', 'loadbalancer', 'middlemanager', 'hydra', 'surgeon', 'host', 'excavator', 'lobbymanager', 'legacybot']) mm.itemModels.set('trophy_' + tp, () => trophyModel());
  }

  function wrap(obj, name, make) {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  }

  // ------------------------------------------------------------ state
  function ensureCycle() {
    const run = game.run;
    if (!run) return null;
    if (!run.cycle || typeof run.cycle !== 'object' || run.cycle.v !== 1) run.cycle = { ...CORE.newCycle(), sector: qiOf() };
    if (!run.cycle.ks || typeof run.cycle.ks !== 'object') run.cycle.ks = { level: P.KS.minLevel };
    return run.cycle;
  }
  const push = (keys = ['cycle']) => { if (host()) game.broadcastRun(keys); };
  /** run one pure-rules event on the host: applies the new state, returns { cy, fx } */
  function step(ev, doPush = true) {
    const c0 = ensureCycle();
    const r = CORE.step(c0, ev);
    if (ev.t === 'fired') { r.cy.ks = c0.ks; }
    r.cy.ks = r.cy.ks || c0.ks;
    r.cy.inst = ev.t === 'fired' ? null : (r.cy.inst ?? null);
    game.run.cycle = r.cy;
    if (doPush) push();
    return r;
  }
  const patchCy = (o) => { Object.assign(ensureCycle(), o); push(); };
  const patchEndless = (e) => { ensureCycle().endless = e; push(); };

  // ------------------------------------------------------------ instance moons (every peer: deterministic from run.cycle)
  const keyOf = (c, id) => (c.inst && c.inst.id === id ? `${runKey()}|${id}|${JSON.stringify([c.inst.kind, c.inst.level, c.inst.diff, c.inst.wk, c.inst.base, c.inst.seed, c.inst.gateSector])}` : `${runKey()}|${id}|${c.sector}`);
  function registerMoons() {
    const run = game.run, c = run?.cycle;
    if (!run || !enabled() || !c) { gcMoons(); return; }
    const want = new Map();
    if (c.mode === 'classic' && (c.stage === 'gate' || c.stage === 'core')) want.set(P.coreId(c.sector), () => P.coreMoonDef(runKey(), c.sector));
    const inst = c.inst;
    if (inst) {
      if (inst.kind === 'keystone') want.set(inst.id, () => { const base = MOONS[inst.base]; return base ? P.keystoneMoonDef(base, inst.level, inst.seed) : null; });
      else if (inst.kind === 'raid') want.set(inst.id, () => P.raidMoonDef(runKey(), inst.sector | 0, inst.wk, inst.diff));
      else if (inst.kind === 'gate') want.set(inst.id, () => { const x = inst.spec && ext.gateDef ? ext.gateDef(inst, runKey()) : null; if (x) return x; const d = P.coreMoonDef(runKey(), inst.gateSector); return { ...d, id: inst.id, core: false, gate: true, name: `S-RANK GATE ${inst.gateSector + 1}`, short: 'Gate', legacyGate: false }; });
    }
    for (const [id, mk] of want) {
      const key = keyOf(c, id);
      if (MOONS[id]?._cyKey === key) continue;
      const d = mk();
      if (!d) continue;
      d.instance = true; d._cyKey = key; d.id = id;
      MOONS[id] = d;
      if (run.forecast) run.forecast[id] = d.weather?.[0] || 'clear';
    }
    gcMoons(want);
  }
  function gcMoons(want) {
    const run = game.run;
    for (const id of Object.keys(MOONS)) if (MOONS[id]?.instance && !(want && want.has(id)) && id !== run?.moon) delete MOONS[id];
  }
  const setMoon = (id) => {
    game.run.moon = id;
    push(['moon', 'cycle', 'forecast']);
    try { game.env.setSpace(game.planetColorFor(id)); } catch { /* ignore */ }
  };
  const firstSectorMoon = () => (sectorMoons()[0]?.id) || 'hamsi';

  // ------------------------------------------------------------ helpers shared with the sub modules
  const ctx = {
    game, cy, step, patchCy, patchEndless, banner, say,
    bosses: null,
    gate: () => cy()?.endless?.gate || cy()?.inst?.gate || null,
    raidLocked: (diff) => { const r = game.profile?.cycle2?.raid; return !!(r && r.wk === P.weekKey() && r.done?.[diff]); },
    applyKnobs: (k, on) => applyKnobs(k, on),
    onFinalDead: (cur) => {
      if (cur.kind === 'core') { const r = step({ t: 'bossKilled' }); handleFx(r.fx, { theme: cur.moon.interior }); }
    },
  };
  ctx.bosses = installCycleBosses(game, {});
  const inst = createInstances(ctx);
  const endless = createEndless(ctx);
  ctx.endless = endless;

  // keystone knobs (host wrappers, active only while a keystone run is live)
  let knobs = null;
  function applyKnobs(k, on) { knobs = on ? k : null; }
  wrap(game, 'rollLevel', (orig) => function () { return orig.call(this) + (knobs ? knobs.levelBonus : 0); });
  wrap(game, 'rollElite', (orig) => function () {
    if (!knobs || knobs.eliteMul === 1) return orig.call(this);
    const moon = MOONS[game.run?.moon];
    return Math.random() < Math.min(0.9, (0.04 + (moon?.tier || 1) * 0.02 + qiOf() * 0.01) * knobs.eliteMul);
  });
  wrap(game.creatures, 'speedMul', (orig) => function (c, speed) { const s = orig.call(this, c, speed); return knobs && !c.def?.boss ? s * knobs.speedMul : s; });

  // ------------------------------------------------------------ effects of a pure-rules event (host)
  function handleFx(fxs, extra = {}) {
    const run = game.run;
    for (const f of fxs) {
      if (f.k === 'gateOpen') {
        const c = cy();
        registerMoons();
        setMoon(P.coreId(c.sector));
        patchCy({ keysUsed: 0, inst: null });
        const def = MOONS[P.coreId(c.sector)];
        const b = def?.coreBoss;
        cyx({ k: 'banner', main: 'SECTOR GATE OPEN', sub: 'BOSS', ty: b?.id, kind: 'good' });
        say(f.retry ? 'THE SECTOR GATE RE-OPENS. Pull the lever to land on the Sector Core: {@n}.' : 'SECTOR GATE OPEN. The autopilot is locked on the Sector Core. Pull the lever when you are ready. Type CORE for the briefing.', { n: b?.name || 'Boss' }, 'good');
      } else if (f.k === 'coreLanded') {
        // content is spawned when host.js has populated the moon (hostPopulateMoon wrapper)
      } else if (f.k === 'bossDown') {
        // the chest already dropped (cycle_inst); the crew only has to extract
        say('Extraction: return to the ship and pull the lever.', {}, 'info');
      } else if (f.k === 'win') {
        const gain = { xp: 500 + 160 * f.sector, coin: 70 + 30 * f.sector, reason: 'Sector core cleared' };
        game.net.broadcast('xp', gain);
        cyx({ k: 'win', ty: extra.bossType || '', sector: f.sector, first: !!f.firstKill });
        game.mods?.emit('tfg:sectorCleared', { sector: f.sector, theme: f.theme, first: !!f.firstKill }, game);
        setMoon(firstSectorMoon());
        patchCy({ inst: null, live: null, keysUsed: 0 });
        say('SECTOR {n} CLEARED. A new sector is charted. Type SECTOR for the map.', { n: f.sector + 1 }, 'good');
      } else if (f.k === 'grace') {
        setMoon(firstSectorMoon());
        patchCy({ live: null, keysUsed: 0 });
        say('THE CORE HELD. GRACE DAY: one day of free collecting (no quota), then the gate re-opens and you try again.', {}, 'warn');
        banner('GRACE DAY', 'The gate re-opens after one day', 'warn');
      } else if (f.k === 'shameful') {
        setMoon(firstSectorMoon());
        for (const id of Object.keys(run.factions || {})) if (typeof run.factions[id] === 'number') run.factions[id] += f.rep;
        push(['factions']);
        patchCy({ live: null, keysUsed: 0 });
        game.mods?.emit('tfg:shamefulExit', { sector: f.sector }, game);
        say('SHAMEFUL EXIT. The sector moves on without you: no boss chest, faction reputation {r}.', { r: f.rep }, 'bad');
        banner('SHAMEFUL EXIT', 'No chest this time', 'bad');
      } else if (f.k === 'endlessOffer') {
        patchCy({ offer: true });
        banner('PATCH 1.0', 'ENDLESS CONTENT is available: type ENDLESS');
        say('You cleared {n} Sector Cores. PATCH 1.0 - ENDLESS CONTENT is available: type ENDLESS ACCEPT for the Deep Feed, or ENDLESS DECLINE.', { n: CORE.TUNE.coresForEndless }, 'good');
      } else if (f.k === 'reset') {
        // the fired flow resets the run in place: re-add the cycle once it is done
      }
    }
  }

  // ------------------------------------------------------------ starting a keystone / raid / gate
  const instRequirements = () => {
    const run = game.run, c = cy();
    if (!enabled() || !c) return 'The sector cycle is off.';
    if (run.phase !== 'orbit') return 'Only possible while in orbit.';
    if (c.mode === 'classic' && c.stage !== 'days' && c.stage !== 'grace') return 'Finish the Sector Core first (the gate is open).';
    if (run.daysLeft <= 0) return 'Deadline reached: route to 0-Algorithm HQ and sell first.';
    if (c.mode === 'classic' && Math.max(c.sector, qiOf()) < from()) return 'Not available yet: clear the first sector.';
    return null;
  };
  const pickMoon = (arg) => {
    const gens = sectorMoons();
    const ok = (m) => m && !m.company && !m.home && !m.stale && !m.instance && m.interior;
    const slot = /^#?([1-9])$/.exec(String(arg || ''));
    if (slot && ok(gens[+slot[1] - 1])) return gens[+slot[1] - 1];
    const q = String(arg || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (q) for (const id of Object.keys(MOONS)) { const m = MOONS[id]; if (ok(m) && (m.id.toLowerCase().startsWith(q) || (m.name + ' ' + (m.short || '')).toLowerCase().replace(/[^a-z0-9]/g, '').includes(q))) return m; }
    const cur = MOONS[game.run.moon];
    if (ok(cur)) return cur;
    return gens.find(ok) || MOONS.hamsi;
  };
  function armInstance(kind, o, reply) {
    const bad = instRequirements();
    if (bad) { reply(bad, true); return false; }
    const run = game.run, c = ensureCycle();
    const base = { kind, state: 'armed', sector: qiOf(), wk: P.weekKey() };
    if (kind === 'keystone') {
      const moon = pickMoon(o.moon);
      if (!moon) { reply('Unknown moon. Type MOONS.', true); return false; }
      const level = Math.max(P.KS.minLevel, Math.min(c.ks.level, o.level || c.ks.level));
      const seed = hashString(`${runKey()}:ks:${run.day}:${moon.id}:${level}`) >>> 0;
      Object.assign(base, { id: 'ks' + seed.toString(36), base: moon.id, level, seed });
    } else if (kind === 'raid') {
      const diff = P.RAID_DIFFS[o.diff] ? o.diff : 'normal';
      Object.assign(base, { id: 'raid1', diff, seed: hashString(`${runKey()}:raid:${base.wk}`) >>> 0 });
    } else if (kind === 'gate') {
      const g = o.gate || c.endless?.gate;
      if (!g) { reply('No gate is open right now.', true); return false; }
      if (o.gate) Object.assign(base, { id: 'cgate' + o.gate.n, gateSector: qiOf(), seed: o.gate.seed, red: !!o.gate.red, gate: o.info, spec: o.gate });   // module cycle3: a classic Glitch Gate
      else {
        const gateSector = (c.sector | 0) + (c.endless.depth | 0);
        Object.assign(base, { id: 'gate' + gateSector, gateSector, seed: hashString(`${runKey()}:gate:${gateSector}`) >>> 0, red: !!g.red });
      }
    }
    patchCy({ inst: base, live: null, keysUsed: 0 });
    registerMoons();
    if (!MOONS[base.id]) { patchCy({ inst: null }); reply('That server is not available.', true); return false; }
    setMoon(base.id);
    return base;
  }
  const disarm = (why) => { const c = cy(); if (c?.inst && c.inst.state === 'armed') { patchCy({ inst: null }); if (why) say(why, {}, 'info'); } };

  // ------------------------------------------------------------ host.js wrappers
  wrap(game, 'hostEvaluateQuota', (orig) => function (...a) {
    if (!enabled()) return orig.apply(this, a);
    const run = game.run, c = ensureCycle();
    const met = run.sold >= run.quota;
    const stage = c.stage, mode = c.mode;
    const r = orig.apply(this, a);
    if (met) {
      if (mode === 'classic' && stage === 'days') {
        disarm();
        const s = step({ t: 'quotaMet' });
        run.daysLeft = 3; push(['daysLeft']);
        handleFx(s.fx);
      }
    } else {
      // fired: the run is reset in place ~8 s later, which drops run.cycle; put it back (first kills + keystone level survive)
      const fresh = step({ t: 'fired' }).cy;
      game.later(() => { if (!disposed && game.run && !game.run.cycle) { game.run.cycle = { ...fresh }; registerMoons(); push(); } }, 8300);
    }
    return r;
  });

  wrap(game, 'hostSetPhase', (orig) => function (phase, extra = {}) {
    const run = game.run;
    if (enabled() && run && phase === 'landing') {
      const moon = MOONS[run.moon];
      const c = cy();
      if (moon?.instance && c) {
        // fixed layouts: a sector core / the weekly raid keep their map on a retry (the layout seed is derived from the run, not random)
        if (moon.core) run.seed = hashString(`${runKey()}:core:${c.sector}`) >>> 0;
        else if (moon.raid) run.seed = hashString(`${runKey()}:raid:${c.inst?.wk || P.weekKey()}`) >>> 0;
        else if (moon.gate) run.seed = c.inst?.seed || run.seed;
        extra = { ...extra, cycle: c };
      }
    }
    return orig.call(this, phase, extra);
  });

  wrap(game, 'hostLever', (orig) => function (fromId) {
    if (!enabled() || !host()) return orig.call(this, fromId);
    const run = game.run, c = ensureCycle();
    if (run.phase === 'orbit') {
      if (c.mode === 'classic' && c.stage === 'gate') {
        registerMoons();
        if (run.moon !== P.coreId(c.sector)) { setMoon(P.coreId(c.sector)); say('The Sector Gate overrides the autopilot: landing on the Sector Core.', {}, 'warn'); }
      } else if (c.inst && c.inst.state === 'armed') {
        registerMoons();
        if (run.moon !== c.inst.id) disarm('Keystone / raid cancelled: you routed elsewhere.');
        else if (!MOONS[c.inst.id]) disarm('That instance is no longer available.');
      }
      { const m = MOONS[run.moon]; if (m?.instance && run.forecast) run.forecast[run.moon] = m.weather?.[0] || 'clear'; }   // rollForecast() forgets instance moons at every takeoff
      endless.beforeLanding();
    } else if (run.phase === 'moon') {
      const g = c.inst;
      if (g && g.kind === 'gate' && g.red && !inst.cur?.finalDead && (inst.cur?.elapsed || 0) < CORE.TUNE.coreRecallSec) {
        game.net.sendTo(fromId, 'sys', sysMsg('RED GATE: the exit is sealed until the boss falls!', {}, 'bad'));
        return;
      }
    }
    const before = run.phase;
    orig.call(this, fromId);
    if (before === 'orbit' && run.phase === 'landing') onLanding();
  });

  function onLanding() {
    const run = game.run, c = ensureCycle(), moon = MOONS[run.moon];
    if (c.mode === 'classic' && c.stage === 'gate' && moon?.core) {
      const s = step({ t: 'land' });
      handleFx(s.fx);
    }
    if (c.inst && c.inst.state === 'armed' && run.moon === c.inst.id) {
      patchCy({ inst: { ...c.inst, state: 'live' } });
    }
  }

  wrap(game, 'hostPopulateMoon', (orig) => function () {
    if (!enabled() || !host()) return orig.call(this);
    const moon = MOONS[game.run?.moon];
    const isInst = !!(moon && (moon.core || moon.raid || moon.keystone || moon.gate));
    const cfg = game.config;
    const sv = { b: cfg.bossChance, l: cfg.legacyChance };
    if (isInst) { cfg.bossChance = 0; cfg.legacyChance = 0; }
    endless.populateBegin();
    try { orig.call(this); } finally {
      if (isInst) { if (sv.b === undefined) delete cfg.bossChance; else cfg.bossChance = sv.b; if (sv.l === undefined) delete cfg.legacyChance; else cfg.legacyChance = sv.l; }
      endless.populateEnd(moon);
    }
    if (isInst) {
      try { inst.populate(moon); } catch (e) { console.error('[cycle] populate failed', e); inst.forceOpenArena?.('error'); }
    }
  });

  wrap(game, 'hostBeginTakeoff', (orig) => function (reason) { if (game.hostData) game.hostData.takeoffReason = reason; return orig.call(this, reason); });

  wrap(game, 'hostFinishTakeoff', (orig) => function (...a) {
    if (!enabled() || !host() || game.run?.phase !== 'takeoff') return orig.apply(this, a);
    const run = game.run, c0 = ensureCycle();
    const moon = MOONS[run.moon];
    const savedDays = run.daysLeft;
    const wasCompany = !!moon?.company, wasHome = !!moon?.home;
    const isInstMoon = !!(moon && (moon.core || moon.gate || moon.raid || moon.keystone));
    const reason = game.hostData?.takeoffReason || 'lever';
    const inCore = c0.mode === 'classic' && c0.stage === 'core' && !!moon?.core;
    const res = isInstMoon ? inst.finish(reason) : null;
    orig.apply(this, a);
    if (wasHome) return;
    const c = cy();
    if (!c) return;
    if (inCore) {
      run.daysLeft = savedDays;   // a core day never counts against the quota days
      push(['daysLeft']);
      const s = step({ t: 'coreEnd', reason, theme: moon.interior });
      handleFx(s.fx, { bossType: res?.boss });
    } else if (c.mode === 'classic' && c.stage === 'grace' && !wasCompany) {
      run.daysLeft = savedDays;   // the grace day is not a quota day either
      push(['daysLeft']);
      const s = step({ t: 'dayEnd' });
      handleFx(s.fx);
    } else if (c.mode === 'classic' && c.stage === 'grace' && wasCompany) {
      const s = step({ t: 'dayEnd' });
      handleFx(s.fx);
    }
    if (res && !inCore) handleInstResult(res, moon);
    if (c.mode === 'endless' && !wasCompany) {
      const r = endless.onDayEnd();
      run.daysLeft = 3; push(['daysLeft']);
      if (r?.fired) {
        endless.fire();
        run.sold = 0; run.quota = Math.max(1, run.quota);
        game.later(() => { if (!disposed && game.run?.phase === 'orbit') game.hostEvaluateQuota(); }, 4200);
      }
    }
    game.hostSave?.();
  });

  wrap(game, 'hostUpdate', (orig) => function (dt) {
    const r = orig.call(this, dt);
    if (enabled() && host()) { try { inst.tick(dt); } catch (e) { console.error('[cycle] tick', e); } }
    return r;
  });

  wrap(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig.call(this, c, by);
    if (enabled() && host()) { try { inst.onCreatureKilled(c, by); } catch (e) { console.error('[cycle] kill', e); } }
    return r;
  });

  wrap(game, 'onSellResult', (orig) => function (d, ...a) {
    const r = orig.call(this, d, ...a);
    if (enabled() && host() && d && !d.pending && d.total > 0 && cy()?.mode === 'endless') endless.onSale(d.total);
    return r;
  });

  let mutKey = '';
  wrap(game, 'applyRunState', (orig) => function (d, silent) {
    const r = orig.call(this, d, silent);
    if (enabled()) {
      registerMoons();
      // endless mutators change the player stats (jump / stamina / damage): recompute them when the active list changes
      if (d && d.cycle !== undefined) { const k = JSON.stringify(cy()?.endless?.mutators || []); if (k !== mutKey) { mutKey = k; try { game.refreshStats?.(); } catch { /* ignore */ } } }
    }
    return r;
  });
  wrap(game, 'onPhase', (orig) => function (d) {
    if (enabled() && d?.cycle && game.run) { game.run.cycle = d.cycle; registerMoons(); }
    return orig.call(this, d);
  });

  // ------------------------------------------------------------ results of keystone / raid / gate days (host)
  function handleInstResult(res, moon) {
    const run = game.run, c = cy();
    if (!res) return;
    for (const f of ext.onResult) { try { f(res, moon, c?.inst || null); } catch (e) { console.warn('[cycle] result hook', e); } }
    if (res.kind === 'keystone') {
      const level = res.level;
      if (res.success) {
        const rw = P.keystoneReward(level, res.up, qiOf());
        run.credits += rw.credits; push(['credits']);
        game.net.broadcast('xp', { xp: rw.xp * (P.keystoneKnobs(level).xpMul || 1) | 0, coin: rw.coin, reason: 'Keystone completed' });
        say('KEYSTONE +{l} COMPLETED with {t}s left! Key level +{u}: the next key is +{n}. Reward ▮{c}.', { l: level, t: res.left, u: res.up, n: res.next, c: rw.credits }, 'good');
      } else say('KEYSTONE DEPLETED. The key drops to level {n}.', { n: res.next }, 'bad');
      const ks = { ...c.ks, level: res.next };
      patchCy({ ks, inst: null, live: null });
      cyx({ k: 'ksdone', level, next: res.next, up: res.up, left: res.left, limit: res.limit, success: !!res.success, moon: moon?.short || '' });
    } else if (res.kind === 'raid') {
      if (res.success) {
        const first = !ctx.raidLocked(res.diff);
        const rw = P.raidReward(res.diff, res.crew, first);
        run.credits += rw.credits; push(['credits']);
        game.net.broadcast('xp', { xp: rw.xp, coin: rw.coin, reason: 'Raid cleared' });
        const p = game.profile;
        p.cycle2 = p.cycle2 || {};
        const raid = p.cycle2.raid && p.cycle2.raid.wk === P.weekKey() ? p.cycle2.raid : (p.cycle2.raid = { wk: P.weekKey(), done: {} });
        raid.done[res.diff] = 1;
        game.progress?.save?.();
        say('RAID CLEARED ({@d}). Credits ▮{c}.{l}', { d: P.RAID_DIFFS[res.diff]?.name || '', c: rw.credits, l: first ? '' : ' (weekly lock: no chest)' }, 'good');
        cyx({ k: 'raiddone', diff: res.diff, first, success: true });
      } else say('The raid was abandoned. The weekly lock is untouched.', {}, 'warn');
      patchCy({ inst: null, live: null });
    } else if (res.kind === 'gate') {
      const classic = !!c.inst?.spec;
      if (res.success && !classic) say('S-RANK GATE CLEARED.', {}, 'good');
      const e = c.endless ? { ...c.endless, gate: null } : null;
      patchCy({ inst: null, live: null, endless: e || c.endless });
      if (res.success && !classic) { game.net.broadcast('xp', { xp: 600 + 40 * (c.endless?.depth || 0), coin: 90, reason: 'Gate cleared' }); }
    }
  }

  // ------------------------------------------------------------ 'unlock' handler (arena door = access cards)
  offs.push(game.mods?.on?.('registerHandlers', (H, g) => {
    if (g !== game) return;
    const prev = game.net.handlers.get('unlock');
    H('unlock', (d, fromId) => {
      if (enabled()) {
        const door = game.doorById?.(d.id);
        if (door?.info?.arena) { if (door.locked) inst.arenaUnlock(d, fromId, door); return; }
      }
      prev?.(d, fromId);
    });
    // LAGGY (keystone affix): a door opens a little after the request
    const prevDoor = game.net.handlers.get('door');
    if (prevDoor) H('door', (d, fromId) => {
      if (knobs && knobs.doorLag > 0 && d && d.open) game.later(() => { if (!disposed) prevDoor(d, fromId); }, knobs.doorLag * 1000);
      else prevDoor(d, fromId);
    });
    H('cyreq', (d, fromId) => { try { consoleHost.handle(d, fromId); } catch (e) { console.error('[cycle] cyreq', e); } });
  }));

  // ------------------------------------------------------------ net: everyone receives 'cyx'
  const consoleHost = createHostConsole({ ctx, game, enabled, host, armInstance, disarm, instRequirements, endless, handleFx, step, patchCy, banner, say, cy, qiOf, from, tfIn });
  function onCyx(m, fromId) {
    if (disposed || !m || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    consoleHost.onMessage(m);
    ctx.bosses.ui.onMsg(m, fromId);
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:cyx', onCyx);
    boundNet = net; net.on('msg:cyx', onCyx);
  }
  offs.push(game.mods?.on?.('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  // ------------------------------------------------------------ session hooks
  offs.push(game.mods?.on?.('hostStart', (g) => {
    if (g !== game || !enabled()) return;
    const c = ensureCycle();
    // a save can never resume inside a core / instance: the gate simply re-opens, the ship is in orbit
    const r = CORE.step(c, { t: 'load' });
    r.cy.ks = c.ks; r.cy.inst = null; r.cy.live = null;
    game.run.cycle = r.cy;
    registerMoons();
    if (r.cy.stage === 'gate' && game.run.moon !== P.coreId(r.cy.sector)) game.run.moon = P.coreId(r.cy.sector);
    if (!MOONS[game.run.moon]) game.run.moon = firstSectorMoon();   // a save made while a keystone / raid moon was routed
    if (r.cy.mode === 'endless') endless.mirror();
    if (r.cy.stage === 'gate') say('The Sector Gate is open. Pull the lever to land on the Sector Core (CORE for the briefing).', {}, 'good');
  }));
  // zones: "ENTERING: WING B / LABYRINTH / BOSS ARENA" when the local player crosses into another area of a wing facility
  let zoneT = 0, lastArea = -2;
  function zoneTick() {
    const fac = game.world?.facility, L = fac?.layout, p = game.player;
    if (!L?.areas || !L.wings?.length || !p || p.dead || !p.indoor) { lastArea = -2; return; }
    const i = fac.cellAt(p.pos.x, p.pos.z);
    const a = i >= 0 ? L.areaOf[i] : -1;
    if (a === lastArea) return;
    lastArea = a;
    const area = L.areas[a];
    if (area && a > 0) game.ui?.toast?.(tf('ENTERING: {a}', { a: t(area.name) }), area.kind === 'arena' ? 'warn' : 'info');
  }
  offs.push(game.mods?.on?.('update', (dt, g) => {
    if (g !== game || disposed) return;
    ctx.bosses.ui.update(dt);
    zoneT -= dt;
    if (zoneT <= 0) { zoneT = 0.5; try { zoneTick(); } catch { /* ignore */ } }
  }));
  offs.push(game.mods?.on?.('phase', (ph, g) => {
    if (g !== game) return;
    if (ph === 'orbit' && host()) { inst.abort?.(); }
  }));
  offs.push(game.mods?.on?.('objectives', (add, g, phase) => consoleHost.objectives(add, phase)));

  const api = {
    core: CORE, plan: P, inst, endless, bosses: ctx.bosses, ext, arm: (kind, o, reply) => armInstance(kind, o || {}, reply || (() => {})), patchCy, disarm, instRequirements,
    enabled, flag: () => game.config?.cycle !== false, state: cy,
    routeBlocked: (m) => (enabled() && cy() && cy().mode === 'classic' && cy().stage === 'gate' ? 'The Sector Gate is open: the autopilot is locked on the Sector Core (CORE).' : (m && MOONS[m.id]?.instance ? 'That server cannot be routed to manually.' : null)),
    registerMoons,
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      try { boundNet?.off?.('msg:cyx', onCyx); } catch { /* ignore */ }
      endless.dispose(); ctx.bosses.dispose(); consoleHost.dispose();
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      restores.length = 0;
      for (const id of Object.keys(MOONS)) if (MOONS[id]?.instance) delete MOONS[id];
    },
  };
  void BOSS_INFO;
  return api;
}
