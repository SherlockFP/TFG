// ENDLESS MODE - "THE DEEP FEED" (docs/MASTERPLAN.md 14.2) glue. The pure rules are cycle_core.js (E, MUTATORS, endlessSale, endlessDayEnd,
// patchNotes, mutatorEffects, gateRoll, cashOut, leaderboard); this file turns them into game effects. State lives in run.cycle.endless
// (saved + synced by the generic run sync), the rules run on the HOST, every peer applies the permanent rewards to its own profile.
//
// Rhythm: every moon day = +1 depth. The Engagement Meter (0-100) replaces the quota: sales fill it, every day it decays, 0 = fired (cash out halved).
// run.quota / run.sold mirror the meter (sold = meter% of quota = the credits needed for a full meter) so the existing HUD bar shows it.
// Mutator knobs turned here (host): dangerMul (config.dangerMul), valueMul + scrapKeep + scrapAdd (items.hostSpawn during populate), speedMul
// (creatures.speedMul), eliteMul (rollElite), dmgTaken (hostHurtPlayer), weather / dayLenMul / blackout (per landing), jump / stamina / dmgDealt
// (player stats, every peer). `shrines` has no effect yet (the shrine plan is not exposed) - see docs/wave3/cycle2.md.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { MOONS } from './moons.js';
import { sysMsg, t, tf } from '../core/i18n.js';
import { itemDef, isSellable, scrapTableFor } from './items.js';
import * as C from './cycle_core.js';

export function createEndless(ctx) {
  const game = ctx.game;
  const restores = [];
  let populating = false, baseCfg = null;
  const cy = () => ctx.cy();
  const active = () => cy()?.mode === 'endless' && !!cy()?.endless;
  const E = () => cy().endless;
  const runKey = () => String(game.run?.runId ?? 'legacy');
  const say = (key, vars, kind) => game.net.broadcast('sys', sysMsg(key, vars || {}, kind || 'info'));

  function fx() {
    if (!active()) return null;
    const e = E();
    const f = C.mutatorEffects(e.mutators);
    f.lootMul = e.lootMul * Math.sqrt(C.depthPower(e.depth));
    f.levelBonus = Math.round((C.depthPower(e.depth) - 1) * 4);
    return f;
  }
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };

  // ------------------------------------------------------------ meter <-> HUD
  function mirror() {
    if (!active() || !game.isHost) return;
    const e = E(), run = game.run;
    run.quota = C.meterUnit(e.base, e.depth);
    run.sold = Math.round(e.meter / 100 * run.quota);
    run.daysLeft = 3;
    game.broadcastRun(['quota', 'sold', 'daysLeft', 'cycle']);
  }

  // ------------------------------------------------------------ start / stop
  function start(baseQuota) {
    const r = ctx.step({ t: 'endlessAccept', baseQuota });
    if (!r.fx.some((f) => f.k === 'endlessStart')) return false;
    mirror();
    ctx.banner('PATCH 1.0 - ENDLESS CONTENT', 'THE DEEP FEED');
    say('PATCH 1.0 - ENDLESS CONTENT is live. Keep the Engagement Meter above zero. Type ENDLESS for the rules, CASHOUT to leave with your rewards.', {}, 'good');
    return true;
  }

  // ------------------------------------------------------------ sales
  function onSale(total) {
    if (!active() || !game.isHost || !(total > 0)) return;
    const r = C.endlessSale(E(), total);
    ctx.patchEndless(r.e);
    if (r.bonusCredits > 0) { game.run.credits += r.bonusCredits; game.broadcastRun(['credits']); }
    mirror();
    say('ENGAGEMENT +{g}% (meter {m}%)', { g: Math.round(r.gain), m: Math.round(r.e.meter) }, 'good');
  }

  // ------------------------------------------------------------ a moon day ended (host, at takeoff)
  function onDayEnd() {
    if (!active() || !game.isHost) return null;
    const r = C.endlessDayEnd(E());
    let e = r.e;
    const notes = [];
    if (r.patch) {
      const p = C.patchNotes(e, Math.random);
      e = p.e;
      notes.push(p);
      ctx.banner('PATCH NOTES', p.add ? C.MUTATORS[p.add].name : p.rollback ? 'ROLLBACK' : 'LOOT IS WORTH MORE');
      if (p.add) say('PATCH NOTES v1.{n}: + {@a} - {@d}', { n: e.patches, a: C.MUTATORS[p.add].name, d: C.MUTATORS[p.add].desc }, 'warn');
      if (p.rollback) say('PATCH NOTES v1.{n}: - ROLLBACK {@r}', { n: e.patches, r: C.MUTATORS[p.rollback].name }, 'warn');
      if (!p.add && !p.rollback) say('Loot is worth more.', {}, 'info');
    }
    // S-rank gate roll for the next day (a finale every 10 depths)
    e.gate = null;
    const g = C.gateRoll(runKey(), e.depth, e.lastGate);
    if (g) { e.gate = { ...g }; e.lastGate = e.depth; }
    if (r.relief) say('RELIEF DAY: the meter does not decay today.', {}, 'good');
    ctx.patchEndless(e);
    mirror();
    if (e.gate) {
      const isFin = e.gate.kind === 'finale';
      ctx.banner(isFin ? 'SEASON FINALE' : e.gate.red ? 'RED GATE DETECTED' : 'S-RANK GLITCH GATE', 'Type GATE at the terminal to enter');
      say('{@k} - rank {r}. Type GATE at the terminal to make it today\'s destination (chest x{c}).', { k: isFin ? 'SEASON FINALE' : e.gate.red ? 'RED GATE (no exit until the boss falls)' : 'S-RANK GLITCH GATE', r: e.gate.rank, c: e.gate.chests }, 'warn');
    }
    say('DEPTH {d} - Engagement {m}% (-{x} today)', { d: e.depth, m: Math.round(e.meter), x: Math.round(r.decay) }, e.meter < 30 ? 'bad' : 'info');
    return { fired: r.fired, e, depth: e.depth };
  }

  // ------------------------------------------------------------ cash out / fired
  function payout(fired) {
    const e = E();
    const crew = game.aiPlayers().length || 1;
    const rew = C.cashOut(e.depth, { fired, crew });
    const entry = { score: C.scoreOf(e.depth, cy().cores || 0, e.sales), depth: e.depth, cores: cy().cores || 0, sales: Math.round(e.sales), at: Date.now(), crew, fired: !!fired, mutators: e.mutators.length };
    game.net.broadcast('cyx', { k: 'cashout', rew, entry, fired: !!fired });
    return rew;
  }
  /** voluntary cash out: permanent rewards, back to the classic loop (cores counter restarts) */
  function cashOut() {
    if (!active() || !game.isHost) return false;
    const e = E();
    if (e.depth < 1) { say('Survive at least one day in the Deep Feed before you cash out.', {}, 'bad'); return false; }
    payout(false);
    ctx.step({ t: 'endlessExit' }, true);
    say('CASHED OUT at depth {d}. Back to the classic loop.', { d: e.depth }, 'good');
    return true;
  }
  /** meter 0: fired, half the rewards; the caller then runs the original hostEvaluateQuota (the run resets) */
  function fire() {
    if (!active()) return;
    payout(true);
    say('THE ENGAGEMENT METER HIT ZERO. You are deplatformed. (Cash-out rewards halved.)', {}, 'bad');
  }

  // ------------------------------------------------------------ mutator knobs (host wrappers + per-landing setup)
  function install() {
    // budget: creatures
    wrap(game.creatures, 'speedMul', (orig) => function (c, speed) { const f = fx(); const s = orig.call(this, c, speed); return f && !c.def?.boss ? s * f.speedMul : s; });
    wrap(game, 'rollElite', (orig) => function () {
      const f = fx();
      if (!f || f.eliteMul === 1) return orig.call(this);
      const moon = MOONS[game.run?.moon];
      const p = 0.04 + (moon?.tier || 1) * 0.02 + (game.run.quotaIndex || 0) * 0.01;
      return Math.random() < Math.min(0.9, p * f.eliteMul);
    });
    wrap(game, 'rollLevel', (orig) => function () { const f = fx(); return orig.call(this) + (f ? f.levelBonus : 0); });
    wrap(game, 'hostHurtPlayer', (orig) => function (id, dmg, cause, fromId, fromPos) {
      const f = fx();
      if (f && f.dmgTaken !== 1 && dmg > 0 && dmg < 999 && fromId) dmg = Math.round(dmg * f.dmgTaken);
      return orig.call(this, id, dmg, cause, fromId, fromPos);
    });
    // loot at populate time
    wrap(game.items, 'hostSpawn', (orig) => function (type, pos, opts = {}) {
      const f = populating ? fx() : null;
      if (f && !opts.holder) {
        const def = itemDef(type);
        if (isSellable(def) && (def.kind === 'scrap' || def.kind === 'big' || def.kind === 'drop')) {
          if (f.scrapKeep < 1 && def.kind === 'scrap' && Math.random() > f.scrapKeep) return null;
          opts = { ...opts, valueMul: (opts.valueMul ?? 1) * f.valueMul * f.lootMul };
        }
      }
      return orig.call(this, type, pos, opts);
    });
    // player stats (every peer): jump, stamina regen, damage dealt
    const off = game.mods?.on?.('stats', (st, g) => {
      if (g !== game || !st) return;
      const f = fx();
      if (!f) return;
      st.jumpMul = (st.jumpMul || 1) * f.jumpMul;
      st.staminaRegen = (st.staminaRegen || 16) * f.staminaRegen;
      st.meleeMul = (st.meleeMul || 1) * f.dmgDealt;
      st.rangedMul = (st.rangedMul || 1) * f.dmgDealt;
    });
    if (off) restores.push(off);
  }
  /** right before host.js lands: weather, day length, danger */
  function beforeLanding() {
    const f = fx();
    const cfg = game.config;
    if (!baseCfg) baseCfg = { dayLengthSec: cfg.dayLengthSec, dangerMul: cfg.dangerMul };
    if (!f) { restoreCfg(); return; }
    cfg.dayLengthSec = Math.round((baseCfg.dayLengthSec || 720) * f.dayLenMul);
    cfg.dangerMul = +((baseCfg.dangerMul || 1) * f.dangerMul * (1 + (f.outdoorMul - 1) * 0.5)).toFixed(3);
    if (f.weather && game.run?.forecast) game.run.forecast[game.run.moon] = f.weather;
  }
  function restoreCfg() {
    if (!baseCfg) return;
    game.config.dayLengthSec = baseCfg.dayLengthSec; game.config.dangerMul = baseCfg.dangerMul;
    baseCfg = null;
  }
  function populateBegin() { populating = true; }
  function populateEnd(moon) {
    populating = false;
    const f = fx();
    if (!f || !moon || !game.isHost) return;
    const fac = game.world?.facility;
    if (fac && f.scrapAdd > 0) {
      const rng = new RNG(((game.run.seed | 0) ^ 0x7e57) >>> 0);
      const table = scrapTableFor(moon.interior).map(([id, w]) => ({ id, w }));
      const spots = rng.shuffle((fac.scrapSpots || []).slice());
      for (let i = 0; i < Math.min(f.scrapAdd, spots.length); i++) game.items.hostSpawn(rng.weighted(table).id, new THREE.Vector3(spots[i].x, spots[i].y + 0.5, spots[i].z), { valueMul: f.valueMul * f.lootMul });
    }
    if (f.blackout && game.run.powerOn) game.hostSetPower?.(false);
    if (f.blackout) say('ROLLING BLACKOUT: the facility starts without power.', {}, 'warn');
  }

  function text() {
    const c = cy();
    if (!c) return [t('No run.')];
    const out = [t('THE DEEP FEED // ENDLESS MODE')];
    if (c.mode !== 'endless') {
      out.push(c.cores >= C.TUNE.coresForEndless ? t('PATCH 1.0 is available: type ENDLESS ACCEPT (or ENDLESS DECLINE to stay in the classic loop).') : tf('Locked: clear {n} Sector Cores first.', { n: C.TUNE.coresForEndless }) + ` (${c.cores}/${C.TUNE.coresForEndless})`);
      return out;
    }
    const e = c.endless;
    const co = C.cashOut(e.depth);
    out.push(`${t('DEPTH')} ${e.depth} (${t('best')} ${e.best})   ${t('METER')} ${Math.round(e.meter)}%   ${t('decay')} -${C.dailyDecay(e.depth + 1)}/${t('day')}${C.isRelief(e.depth + 1) ? ' (' + t('next day is a RELIEF day') + ')' : ''}`);
    out.push(`${t('Loot')} x${(e.lootMul * Math.sqrt(C.depthPower(e.depth))).toFixed(2)}   ${t('creature power')} x${C.depthPower(e.depth)}   ${t('sales')} ${Math.round(e.sales)}`);
    out.push(e.mutators.length ? t('ACTIVE MUTATORS:') : t('No mutators yet (PATCH NOTES every 3 depths).'));
    for (const id of e.mutators) out.push(`  * ${t(C.MUTATORS[id].name)}: ${t(C.MUTATORS[id].desc)}`);
    if (e.gate) out.push(`${t('GATE')}: ${e.gate.kind === 'finale' ? t('SEASON FINALE') : e.gate.red ? t('RED GATE') : t('S-RANK GATE')} ${t('rank')} ${e.gate.rank} - ${tf('type GATE to enter (chest x{c}).', { c: e.gate.chests })}`);
    out.push(`CASHOUT: ${co.clout} Clout, ${co.xp} XP${co.stars ? ', +' + co.stars + ' ' + t('prestige star') : ''}${co.title ? ', ' + t('title') + ' "' + co.title + '"' : ''}.`);
    return out;
  }

  install();
  return {
    active, start, onSale, onDayEnd, cashOut, fire, mirror, text, fx, beforeLanding, populateBegin, populateEnd, restoreCfg,
    dispose() { for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } } restores.length = 0; restoreCfg(); },
  };
}
