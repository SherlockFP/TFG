// BUGFIX (wave 2): small cross-cutting fixes that do not belong in any one feature module.
// Installed with `this.useModule('bugfix', installBugfix)` (game.js). Every fix is documented in docs/wave2/bugfix.md.
//
//  - Body carrying (owner report): a crewmate's body is a 2-handed hand-carried item (actions.js pickup / localplayer.js
//    speed), ONE per carrier, and it goes through every entrance / fire exit / teleport because held items are not
//    physical. This module adds the same for the GRAB BEAM (big scrap, Sell Bodies carcasses): when the local player
//    teleports far away (door, `tp` message, ship teleporter...) the beamed item is moved to the new spot instead of being
//    let go 300 m away (GrabBeam.physicsStep drops anything more than 4.5 m from its target).
import { addTranslations } from '../core/i18n.js';
import { G } from '../physics/physics.js';

const TR = {
  'You can only carry ONE body at a time.': 'Aynı anda sadece BİR ceset taşıyabilirsin.',
  'Carrying a body: heavy, no sprinting. Bring it to the ship to cut the fine.': 'Ceset taşıyorsun: ağır, koşamazsın. Cezayı azaltmak için gemiye götür.',
  "Carry {name}'s body to the ship (smaller fine)": '{name} cesedini gemiye taşı (daha küçük ceza)',
  'You already carry a body': 'Zaten bir ceset taşıyorsun',
  'Heavy - slows you down': 'Ağır - seni yavaşlatır',
};
const JUMP_MIN = 6;   // a position change bigger than this in one call is a teleport, not walking

export function installBugfix(game) {
  addTranslations(TR);
  const player = game.player;
  if (!player || typeof player.teleport !== 'function') return null;
  const orig = player.teleport;

  /** Carry the grab-beam item along to the player's new position (locally owned items only; anything else is released as before). */
  function followBeam() {
    const gb = game.grab, it = gb?.item;
    if (!it || !it.body || it.owner !== game.selfId || it.state !== 'world') return false;
    const eye = player.eyePos(), fwd = player.forward();
    let d = Math.min(Math.max(gb.dist || 2, 1.2), 2.0);
    const hit = game.physics.raycast(eye, fwd, d + 0.4, G.STATIC | G.DOOR);
    if (hit) d = Math.max(0.6, hit.distance - 0.4);
    const x = eye.x + fwd.x * d, y = Math.max(eye.y - 0.4, eye.y + fwd.y * d), z = eye.z + fwd.z * d;
    it.body.setTranslation({ x, y, z }, true);
    it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    it.obj.position.set(x, y, z);
    it.prevVel.set(0, 0, 0);
    it.impactCooldown = 0.6;   // no fake "impact" (fragile value loss) from the jump
    return true;
  }

  player.teleport = function teleportWithBeam(p, yaw) {
    const before = this.pos.clone();
    const r = orig.call(this, p, yaw);
    try { if (game.grab?.item && before.distanceTo(this.pos) > JUMP_MIN) followBeam(); } catch (e) { console.warn('[bugfix] beam follow', e); }
    return r;
  };

  return {
    followBeam,
    dispose() { if (Object.prototype.hasOwnProperty.call(player, 'teleport')) delete player.teleport; },
  };
}
