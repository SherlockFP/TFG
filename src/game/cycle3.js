// SECTOR CYCLE 3 - module 'cycle3' (docs/wave4/cycle3.md). Finishes what cycle2 left open (docs/wave3/cycle2.md "Honest gaps"):
//   gates      Glitch Gates in full: E-S ranked gates that open after moon days, Red gates, Hidden gates (PING / scan clue + the three-rules statue puzzle), Gate Break -> SIEGE
//   trophy     the Trophy Wall on the ship: every boss kill / raid / keystone / hidden gate mounts a trophy, interact = kill date, crew, time (run.c3 + host profile)
//   case       CASE FILE dossiers for every boss, the raid, the keystone, the hidden / red gate, the Deep Feed and the shameful exit
//   elevator   the "Elevator Stop" set piece: a freight elevator pair, the cab stops between floors, fuse sequence + brace the door while something knocks
//   puzzle     the three-relays core puzzle (all lit at once = the arena shield drops)
//   shrines    the "Double shrines" endless mutator (dice shrine chance and Cursed Die weight)
// Net (all prefixed 'c3'): 'c3req' client -> host {op, ...}, 'c3s' host -> everyone {k, ...}. State: run.c3 = { v, trophies, gates } (saved + synced by the generic
// run sync), run.c3live = the day's stations (relays, statues, hidden tear). Shared-file edits are tiny: cycle.js exposes `ext` / `arm`, cycle_inst.js reads `perWing` and
// the gate chest spec, ui/panels/casefile.js lets a module register a renderer for its own case kind.
import { t, tf, sysMsg } from '../core/i18n.js';
import { SHRINE_NUM } from './dice.js';
import { SCRAP_TABLE } from './items.js';
import * as K from './cycle3_core.js';
import { mutatorEffects } from './cycle_core.js';
import './cycle3_lore.js';
import './cycle3_i18n.js';
import { installTrophy } from './cycle3_trophy.js';
import { installGates } from './cycle3_gates.js';
import { installElevator } from './cycle3_elevator.js';
import { installPuzzle } from './cycle3_puzzle.js';
import { installCase } from './cycle3_case.js';

export function installCycle3(game) {
  const mods = game.mods;
  const offs = [];
  let disposed = false, boundNet = null;
  const host = () => !!game.isHost;
  const handlers = new Map(), msgs = new Map();
  const C3 = {
    game, mods, host, K,
    ticks: [], interFns: [], objFns: [], mapFns: [], phaseFns: [], hostStartFns: [], disposers: [],
    get disposed() { return disposed; },
    enabled: () => game.config?.cycle3 !== false && game.config?.cycle !== false,
    st: () => game.run?.c3 || null,
    qi: () => Math.max(0, game.run?.quotaIndex | 0),
    runKey: () => String(game.run?.runId ?? 'legacy'),
    cycle: () => game.cycle || null,
    /** host: the run's c3 block (created / migrated on demand, trophies seeded from the host profile) */
    ensure() {
      const run = game.run;
      if (!run) return null;
      if (!run.c3 || typeof run.c3 !== 'object' || run.c3.v !== 1) run.c3 = { v: 1, trophies: {}, gates: K.newGates() };
      if (!run.c3.trophies) run.c3.trophies = {};
      if (!run.c3.gates) run.c3.gates = K.newGates();
      return run.c3;
    },
    push(keys = ['c3']) { if (host()) { try { game.broadcastRun(keys); } catch { /* not ready */ } } },
    say(key, vars, kind) { try { game.net.broadcast('sys', sysMsg(key, vars || {}, kind || 'info')); } catch { /* net closing */ } },
    sayTo(id, key, vars, kind) { try { game.net.sendTo(id, 'sys', sysMsg(key, vars || {}, kind || 'info')); } catch { /* ignore */ } },
    send(d) { try { game.net.broadcast('c3s', d); } catch { /* net closing */ } },
    sendTo(id, d) { try { game.net.sendTo(id, 'c3s', d); } catch { /* ignore */ } },
    req(op, data = {}) { try { game.net.request('c3req', { op, ...data }); } catch { /* net closing */ } },
    banner(main, sub = '', kind = 'good', vars) { C3.send({ k: 'banner', main, sub, kind, v: vars }); },
    term(id, text, err, vars) { try { game.net.sendTo(id, 'term', { to: id, text: tfIn(text, vars), k: vars ? text : undefined, v: vars, err: !!err, cls: err ? 'err' : '' }); } catch { /* ignore */ } },
    handle(op, fn) { handlers.set(op, fn); },
    on(k, fn) { (msgs.get(k) || msgs.set(k, []).get(k)).push(fn); },
    crewNames() { try { return game.aiPlayers().map((p) => game.playerName(p.id)); } catch { return []; } },
    player(id) { try { return game.aiPlayerById(id) || null; } catch { return null; } },
  };
  const tfIn = (text, vars) => { try { return sysMsg(text, vars || {}).text; } catch { return text; } };

  // ------------------------------------------------------------ net
  function onMsg(m, fromId) {
    if (disposed || !m || typeof m.k !== 'string' || (fromId !== game.selfId && fromId !== game.net?.hostId)) return;
    for (const fn of msgs.get(m.k) || []) { try { fn(m, fromId); } catch (e) { console.warn('[cycle3] msg', m.k, e); } }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:c3s', onMsg);
    boundNet = net; net.on('msg:c3s', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    for (const f of C3.handlerHooks || []) { try { f(H); } catch (e) { console.warn('[cycle3] handler hook', e); } }
    H('c3req', (d, from) => {
      if (!host() || !d || typeof d.op !== 'string' || !C3.enabled()) return;
      const p = C3.player(from);
      try { handlers.get(d.op)?.(d, from, p); } catch (e) { console.error('[cycle3] c3req', d.op, e); }
    });
  }));
  C3.handlerHooks = [];

  C3.on('banner', (m) => {
    game.ui?.hud?.bigText?.(t(m.main), m.sub ? tf(m.sub, m.v || {}) : '');
    game.audio?.ui?.(m.kind === 'bad' ? 'ui_fired' : 'ui_quota_met', 0.6);
  });

  // ------------------------------------------------------------ parts (each returns { dispose })
  const parts = {};
  const mount = (name, fn) => { try { parts[name] = fn(C3) || null; C3[name] = parts[name]; } catch (e) { console.warn('[cycle3] part', name, e); parts[name] = null; } };
  mount('trophy', installTrophy);
  mount('caseFiles', installCase);
  mount('gates', installGates);
  mount('elevator', installElevator);
  mount('puzzle', installPuzzle);

  // ------------------------------------------------------------ shrines mutator (endless "Double shrines")
  const baseDie = new Map();
  let shrineKey = '';
  function syncShrines() {
    const ids = game.run?.cycle?.mode === 'endless' ? game.run.cycle.endless?.mutators || [] : [];
    const mul = mutatorEffects(ids).shrineMul || 1;
    const key = String(mul);
    if (key === shrineKey) return;
    shrineKey = key;
    SHRINE_NUM.chance = K.shrineChance(mul);
    for (const tb of Object.values(SCRAP_TABLE)) if (Array.isArray(tb)) for (const e of tb) {
      if (Array.isArray(e) && e[0] === 'cursed_die') { if (!baseDie.has(e)) baseDie.set(e, e[1]); e[1] = K.dieWeight(baseDie.get(e), mul); }
    }
  }
  C3.disposers.push(() => { shrineKey = ''; SHRINE_NUM.chance = K.SHRINE_BASE_CHANCE; for (const [e, w] of baseDie) e[1] = w; baseDie.clear(); });

  // ------------------------------------------------------------ hooks shared by the parts
  let syncT = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    for (const f of C3.ticks) { try { f(dt); } catch (e) { if (!C3._warned) { C3._warned = 1; console.warn('[cycle3] tick', e); } } }
    syncT -= dt;
    if (syncT <= 0) { syncT = 1; try { syncShrines(); } catch { /* ignore */ } }
  }));
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !game.player || game.player.dead) return;
    for (const f of C3.interFns) { try { f(list, game.player); } catch (e) { console.warn('[cycle3] interactables', e); } }
  }));
  offs.push(mods.on('objectives', (add, g, phase) => {
    if (g !== game || disposed || !C3.enabled()) return;
    for (const f of C3.objFns) { try { f(add, phase); } catch (e) { console.warn('[cycle3] objectives', e); } }
  }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g !== game || disposed) return; for (const f of C3.mapFns) { try { f(w); } catch (e) { console.warn('[cycle3] mapLoaded', e); } } }));
  offs.push(mods.on('phase', (ph, g) => { if (g !== game || disposed) return; for (const f of C3.phaseFns) { try { f(ph); } catch (e) { console.warn('[cycle3] phase', e); } } }));
  offs.push(mods.on('hostStart', (g) => {
    if (g !== game || disposed || !C3.enabled()) return;
    C3.ensure();
    for (const f of C3.hostStartFns) { try { f(); } catch (e) { console.warn('[cycle3] hostStart', e); } }
    C3.push();
  }));
  // the fired flow resets the run in place (run.c3 disappears): put it back, seeded from the host profile (trophies are forever)
  let reT = 2;
  C3.ticks.push((dt) => {
    if (!host() || !game.run) return;
    reT -= dt;
    if (reT > 0) return;
    reT = 2;
    if (C3.enabled() && (!game.run.c3 || game.run.c3.v !== 1)) { C3.ensure(); parts.trophy?.reseed?.(); C3.push(); }
  });

  const api = {
    ...parts, C3, K,
    state: () => game.run?.c3 || null,
    enabled: C3.enabled,
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      try { boundNet?.off?.('msg:c3s', onMsg); } catch { /* ignore */ }
      for (const p of Object.values(parts)) { try { p?.dispose?.(); } catch (e) { console.warn('[cycle3] dispose', e); } }
      for (const f of C3.disposers) { try { f(); } catch { /* ignore */ } }
    },
  };
  void t; void tf;
  return api;
}
