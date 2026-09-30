// HEADLINE (wave 8 trim, docs/wave8/trim.md): ONE headline modifier per landing. Wraps hostSetPhase('landing') (installed AFTER mapmods so it runs first)
// and stamps run.hl = { k, n, d } (k = mapmods | role | warp | daily | trend | none) next to the dailyEvent the phase message carries. Everything that did not win is
// suppressed that day: the daily event is nulled (role / warp / mapmods days), the role day is cancelled (mapmods / weekly), the trend creature reads run.hl (story.trendOn).
// Rolled earlier so they never collide: role day skipped when the coming map has affixes (roledays.hostRoll), voyage warp skipped on affix / role days (voyage lever).
// Net: none (run.hl rides the phase message like dailyEvent / mm). Order + rules: headline_core.js.
import { wrapMethod } from './dailyEvents.js';
import { MOONS } from './moons.js';
import * as HC from './headline_core.js';
import * as RK from './roledays_core.js';
import './headline_i18n.js';

export function installHeadline(game) {
  let disposed = false;
  const restore = wrapMethod(game, 'hostSetPhase', (orig) => function (phase, extra, ...a) {
    if (phase === 'landing' && !disposed) { try { extra = decide(extra || {}); } catch (e) { console.warn('[headline]', e); } }
    return orig.call(this, phase, extra, ...a);
  });

  function decide(extra) {
    const r = game.run;
    if (!r) return extra;
    const moon = MOONS[r.moon] || {};
    if (moon.company || moon.home) { r.hl = { k: 'none' }; return { ...extra, hl: r.hl }; }
    const weekly = !!r.dailyEvent?.weekly;
    const role = game.roledays?.state?.cur || null;
    const trend = game.config?.story !== false ? game.story?.trend?.() || null : null;
    const cands = {
      mapmods: (game.mapmods?.plan?.() | 0) > 0,
      role: !!role && !weekly,
      warp: (r.vy?.lastWarpDay | 0) === (r.day | 0),
      daily: !!r.dailyEvent, weekly, trend: !!trend,
    };
    const k = HC.pickHeadline(cands);
    if (k !== 'daily' && r.dailyEvent) r.dailyEvent = null;   // suppressed: the winner has its own card / numbers
    if (role && k !== 'role') { try { game.roledays?.debug?.clear?.(); } catch { /* roledays optional */ } }   // (mapmods / weekly beat a role day that was rolled before the affixes were)
    let n = '', d = '';
    if (k === 'role') { const c = RK.CARDS[role.card]; n = c?.name || ''; d = c?.line || ''; }
    else if (k === 'trend') { n = game.story?.trendName?.() || ''; d = 'More of them, one level higher, extra loot.'; }
    else if (k === 'warp') { n = 'VOYAGE WARP'; d = 'The route changed on the way down.'; }
    r.hl = { k, n, d };
    return { ...extra, dailyEvent: r.dailyEvent, hl: r.hl };
  }

  return {
    decide, order: HC.ORDER,
    dispose() { disposed = true; try { restore?.(); } catch { /* ignore */ } },
  };
}
