// Shared pacing predicate for existing HUD/achievement queues; no new overlay or runtime module.
import { CHASE_QUIET } from '../game/onegoal_core.js';
export function attentionHot(game) {
 if(!game || game.destroyed || game.player?.dead) return false;
 try { return !!game.onegoal?.hot?.() || (+game.director?.chaseLevel?.() || 0) > CHASE_QUIET || !!game.crdirector?.peakNow?.() || (+game.chase?.tension?.() || 0) > 0.12; }
 catch { return false; }
}
export const toastUrgent = kind => ['bad','warn','warning','danger'].includes(kind);

/** Hide teaching-only steps during encounters; full status and tutorial progress retain the original rows. */
export function encounterObjectives(game, lines) {
 if (!attentionHot(game)) return lines;
 return lines.filter(line => line.kind === 'warn' || (line.src !== 'guide' && line.cat !== 'teach'));
}
