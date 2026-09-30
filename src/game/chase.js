// CHASE tension (wave 5, docs/wave5/aimchase.md, MASTERPLAN 25.13), client side: a screen-edge darkening that pulses in the rhythm of the
// nearest chasing creature (tension grows as it closes in; the director's own heartbeat sound already scales with the same distance,
// this layer only adds the visual pulse, same rhythm formula). The speed / burst / door rules are host side in
// chase_tuning.js + CreatureManager.follow().
import { tension, pulseInterval } from './chase_tuning.js';
import { setStyle } from '../ui/domdiff.js';

const CHASING = new Set(['run', 'chase', 'hunt', 'lunge', 'windup', 'charge']);

export function installChase(game) {
  const offs = [];
  let disposed = false, el = null, k = 0, beat = 0, pulse = 0;
  if (typeof document !== 'undefined') {
    el = document.createElement('div');
    el.id = 'tfg-chase-vig';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(20,0,0,.78) 100%)';
    document.body.appendChild(el);
  }
  function nearestChaser() {
    const me = game.player?.pos, views = game.creatures?.views;
    if (!me || !views) return 1e9;
    let best = 1e9;
    for (const v of views.values()) {
      if (!CHASING.has(v.state) || v.def?.hazard || (v.def?.run || 0) < 4 || v.hidden) continue;
      const d = Math.hypot(v.pos.x - me.x, v.pos.z - me.z);
      if (d < best && Math.abs(v.pos.y - me.y) < 4) best = d;
    }
    return best;
  }
  function update(dt) {
    const target = game.player?.dead ? 0 : tension(nearestChaser());
    k += (target - k) * Math.min(1, dt * (target > k ? 3 : 1.2));
    if (k < 0.01) { if (el) setStyle(el, 'opacity', '0'); beat = 0; return; }
    beat -= dt;
    if (beat <= 0) { beat = pulseInterval(k); pulse = 1; }   // (sound: the director's heartbeat already follows chaser distance; not doubled here)
    pulse = Math.max(0, pulse - dt * 4);
    if (el) setStyle(el, 'opacity', String(Math.min(0.9, k * 0.55 + pulse * k * 0.3).toFixed(3)));
  }
  offs.push(game.mods.on('update', (dt, g) => { if (!disposed && g === game) update(dt); }));
  return {
    tension: () => k,
    dispose() { disposed = true; for (const f of offs) { try { f(); } catch { /* ignore */ } } el?.remove(); el = null; },
  };
}
