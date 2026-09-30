// ONE GOAL (wave 8 night, docs/wave8/onegoal.md). Installed with `this.useModule('onegoal', installOneGoal)`.
//   objectives  every 'objectives' listener is tagged with its module (game.useModule) so each line knows its source; resolve() picks the
//               ONE goal (+ one warning) the Standard HUD shows, the whole list goes to the hold-Tab card (onegoal_core.js).
//   pacing      the firstrun message budget for EVERY profile: 1 Algorithm line / 45 s, silent during a chase or a director peak,
//               one card at a time (game.onboard.fr delegates here once a profile is past the first-run budget). Settings > Chatty Algorithm = off.
//   core verb   while you are TAGGED by a feed camera the goal is "get to the ship or kill that camera".
// Net: none (reads run.fc, which feedcams already syncs).
import { tf } from '../core/i18n.js';
import * as OG from './onegoal_core.js';
import * as FR from './firstrun_core.js';
import './onegoal_i18n.js';

export function installOneGoal(game) {
  const offs = [];
  let disposed = false, algoAt = 0;
  const leaseSt = { kind: '', until: 0, pri: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const chatty = () => !!game.settings?.chattyAlgo;
  const chase = () => { try { return +game.director?.chaseLevel?.() || 0; } catch { return 0; } };
  const peak = () => { try { return !!game.crdirector?.peakNow?.(); } catch { return false; } };

  /** mods.emit('objectives') with each listener's lines tagged by its source module (fn._src, set in game.useModule) */
  function emit(add, g, phase) {
    const set = game.mods?._h?.get?.('objectives');
    if (!set) { game.mods?.emit?.('objectives', add, g, phase); return; }
    for (const fn of [...set]) {
      const src = fn._src || 'mod';
      const tagged = (...a) => { const o = add(...a); if (o && typeof o === 'object' && !o.src) o.src = src; return o; };
      try { fn(tagged, g, phase); } catch (e) { console.error('[event objectives]', e); }
    }
  }

  // the core verb: a TAGGED player's one goal is to get home (feedcams keeps run.fc.p[id] = [meter, live, tagged])
  offs.push(game.mods?.on?.('objectives', (add, g, phase) => {
    if (disposed || (g && g !== game) || phase !== 'moon') return;
    const p = game.player, fp = game.run?.fc?.p?.[game.selfId];
    if (!p || p.dead || p.inShip || !fp?.[2]) return;
    const o = add(tf('TAGGED: get to the ship ({d} m) or kill the camera that tagged you', { d: Math.round(Math.hypot(p.pos.x, p.pos.z)) }), 'main');
    if (o && typeof o === 'object') { o.cat = 'escape'; o.lead = true; }
  }));

  return {
    emit,
    /** the lines the HUD shows for a density ('full' = the whole list in priority order, max 7) */
    shown(lines, dens) { return dens === 'full' ? OG.sortAll(lines).slice(0, 7) : OG.resolve(lines, dens === 'minimal' ? 1 : 2); },
    sortAll: OG.sortAll,
    resolve: OG.resolve,
    /** quiet right now (chase / director peak)? */
    hot: () => !chatty() && (peak() || chase() > OG.CHASE_QUIET),
    /** Algorithm line gate for profiles past the first-run budget (called from game.onboard.fr.algoOk) */
    algoOk(pri = false) {
      if (disposed) return true;
      const t = now();
      if (!OG.algoOk({ nowMs: t, lastMs: algoAt, pri, chatty: chatty(), chase: chase(), peak: peak() })) return false;
      algoAt = t;
      return true;
    },
    /** one card / caption at a time for every profile (called from game.onboard.fr.lease) */
    lease(kind, secs, pri = 1) { return disposed || chatty() || FR.lease(leaseSt, kind, now(), secs, pri); },
    debug: () => ({ algoAt, lease: { ...leaseSt }, chase: chase(), peak: peak(), chatty: chatty() }),
    dispose() { disposed = true; for (const f of offs) { try { f?.(); } catch { /* ignore */ } } },
  };
}
