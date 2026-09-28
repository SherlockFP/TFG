// SECTOR CYCLE + ENDLESS MODE - module 'cycle'. STATUS: rules only, game glue NOT wired (OFF by default, inert).
// The tested pure rules live in cycle_core.js (state machine, boss scaling, endless meter / patch notes / cash out).
// Nothing here wraps host.js, registers creatures or touches run state, so the classic 3-day quota loop is unchanged and
// cannot soft-lock. What is missing (Sector Core moon, boss fights, endless glue, UI) is listed in docs/wave2/cycle.md.
// Flag reserved for the glue: game.config.cycle === true (host option, default off).
import { addTranslations } from '../core/i18n.js';
import * as CORE from './cycle_core.js';

addTranslations({
  'SECTOR CYCLE is not active in this build (rules only).': 'SEKTÖR DÖNGÜSÜ bu sürümde etkin değil (sadece kurallar).',
});

export function installCycle(game) {
  let disposed = false;
  const api = {
    core: CORE,
    /** always false until the glue lands: nothing reads run.cycle yet */
    enabled: () => false,
    flag: () => !!game.config?.cycle,
    state: () => game.run?.cycle || null,
    dispose() { disposed = true; try { window.KefalAPI?.commands?.delete?.('cycle'); } catch { /* ignore */ } },
  };
  try {
    window.KefalAPI?.registerCommand?.('cycle', (rest, term) => {
      if (disposed) return;
      term.print('SECTOR CYCLE // OFF\nSECTOR CYCLE is not active in this build (rules only).\nSee docs/wave2/cycle.md.');
    }, 'sector cycle status (experimental, off)');
  } catch (e) { console.warn('cycle command', e); }
  return api;
}
