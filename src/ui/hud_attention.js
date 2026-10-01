// Shared pacing predicate for existing HUD/achievement queues; no new overlay or runtime module.
import { CHASE_QUIET } from '../game/onegoal_core.js';
/** The optional Warden uses its own encounter state, outside the ambient director's budget. */
export function wardenPressure(game) {
 const encounter=game?.run?.escape14;
 if(game?.run?.phase!=='moon'||encounter?.result!=='active'||!encounter.warden) return false;
 const host=game.creatures?.host?.get?.(encounter.warden);
 const creature=host||game.creatures?.views?.get?.(encounter.warden);
 if(!creature||creature.dead||!['warning','chase','windup','attack','strike','search'].includes(creature.state)) return false;
 // Host target is authoritative; replica target is a position, so peers use the synced encounter owner.
 return (host?host.target:encounter.target) === game.selfId;
}
export function attentionHot(game) {
 if(!game || game.destroyed || game.player?.dead) return false;
 try { return wardenPressure(game) || !!game.onegoal?.hot?.() || (+game.director?.chaseLevel?.() || 0) > CHASE_QUIET || !!game.crdirector?.peakNow?.() || (+game.chase?.tension?.() || 0) > 0.12; }
 catch { return false; }
}
/** Local lift presentation never contributes to combat pressure. */
export function attentionArrival(game) {
 if (!game || game.destroyed || game.player?.dead) return false;
 try { return !!game.descent21?.presentationBusy?.(); } catch { return false; }
}
export const routineAttentionBusy = game => attentionHot(game) || attentionArrival(game);
export const toastUrgent = kind => ['bad','warn','warning','danger'].includes(kind);

/** Hide teaching-only steps during encounters; full status and tutorial progress retain the original rows. */
export function encounterObjectives(game, lines) {
 if (attentionArrival(game) && !attentionHot(game)) return lines.filter(line => line.kind === 'warn');
 if (!attentionHot(game)) return lines;
 return lines.filter(line => line.kind === 'warn' || (line.src !== 'guide' && line.cat !== 'teach'));
}
