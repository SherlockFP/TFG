// ONE GOAL (wave 8 night, docs/wave8/onegoal.md). Installed with `this.useModule('onegoal', installOneGoal)`.
//   objectives  every 'objectives' listener is tagged with its module (game.useModule) so each line knows its source; resolve() picks the
//               ONE goal (+ one warning) the Standard HUD shows, the whole list goes to the hold-Tab card (onegoal_core.js).
//   pacing      the firstrun message budget for EVERY profile: 1 Algorithm line / 45 s, silent during a chase or a director peak,
//               one card at a time (game.onboard.fr delegates here once a profile is past the first-run budget). Settings > Chatty Algorithm = off.
//   core verb   while you are TAGGED by a feed camera the goal is "get to the ship or kill that camera".
// Net: none (reads run.fc, which feedcams already syncs).
import { attentionHot, encounterObjectives } from '../ui/hud_attention.js';
import { t, tf } from '../core/i18n.js';
import { carriedSalvage29 } from './carried_salvage29.js';
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

  /** [greed] values of the sellable scrap in the local player's hands / bag slots */
  const carriedValues = () => carriedSalvage29(game).map(it => it.value || 0);

  // the core verb: a TAGGED player's one goal is to get home (feedcams keeps run.fc.p[id] = [meter, live, tagged])
  offs.push(game.mods?.on?.('objectives', (add, g, phase) => {
    if (disposed || (g && g !== game) || phase !== 'moon') return;
    const p = game.player, fp = game.run?.fc?.p?.[game.selfId];
    if (!p || p.dead || p.inShip || !fp?.[2]) return;
    const values = carriedValues();
    if (!OG.taggedGoalOn(fp[2], values.length)) return;   // [greed] only when the tagged player carries scrap
    const pv = OG.carryPreview(values), d = Math.round(Math.hypot(p.pos.x, p.pos.z));   // [greed] the tagged goal carries the price of staying on air
    const o = pv.net < pv.v ? add(p.indoor ? tf('TAGGED ▮{v} → ▮{n}: get out to the ship or kill the camera that tagged you', { v: pv.v, n: pv.net }) : tf('TAGGED ▮{v} → ▮{n}: get to the ship ({d} m) or kill the camera', { v: pv.v, n: pv.net, d }), 'main')
      : add(p.indoor ? t('TAGGED: get out to the ship or kill the camera that tagged you') : tf('TAGGED: get to the ship ({d} m) or kill the camera that tagged you', { d }), 'main');   // [qa2] indoors the x/z distance is meaningless (the facility is offset)
    if (o && typeof o === 'object') { o.cat = 'escape'; o.lead = true; }
  }));

  return {
    emit, carriedValues, preview: () => OG.carryPreview(carriedValues()),
    /** the lines the HUD shows for a density ('full' = the whole list in priority order, max 7) */
    shown(lines, dens) {
      const visible = encounterObjectives(game, lines);
      if (game.deadletter24?.active?.()) {
        const ordered = OG.sortAll(visible), warning = ordered.find(l => l.kind === 'warn');
        const mode = visible.filter(l => l.src === 'deadletter24');
        const header = mode.find(l => l.kind === 'main'), cue = mode.find(l => l.kind === 'sub');
        const out = warning ? [warning, header].filter(Boolean) : [header, cue].filter(Boolean);
        return out.slice(0, dens === 'minimal' ? 1 : 2);
      }
      return dens === 'full' && !attentionHot(game) ? OG.sortAll(visible).slice(0, 7) : OG.resolve(visible, dens === 'minimal' ? 1 : 2);
    },
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
