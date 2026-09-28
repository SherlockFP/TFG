// push-company — port of PushCompany (Sligili / others).
// TFG built-in feature (crew switch). Look at a crewmate within arm's reach and press E to shove them.
// Peer-to-peer: every player owns their own movement, so the shover sends a 'tfg-push' mod message and
// the victim applies the impulse locally (a little hop + slide, like the LC mod). Costs stamina, has a
// cooldown, and the victim gets a short shove immunity so nobody can be juggled forever.
KefalAPI.defineMod({
  id: 'push-company',
  name: 'Push Company',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'PushCompany',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  description: 'Shove your crewmates: look at one up close and press E. Great for "helping" them into the ship... or off a catwalk.',
  config: {
    force: { type: 'number', default: 7, min: 2, max: 16, step: 0.5, label: 'Shove force' },
    cooldown: { type: 'number', default: 1.2, min: 0.3, max: 10, step: 0.1, label: 'Cooldown (s)' },
    stamina: { type: 'number', default: 12, min: 0, max: 60, label: 'Stamina cost' },
    range: { type: 'number', default: 1.9, min: 1, max: 3, step: 0.1, label: 'Reach (m)' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const FORCE = Math.max(2, Math.min(16, num(cfg.force, 7)));
    const CD = Math.max(0.3, num(cfg.cooldown, 1.2));
    const STAM = Math.max(0, num(cfg.stamina, 12));
    const REACH = Math.max(1, Math.min(3, num(cfg.range, 1.9)));
    let nextPush = 0, immuneUntil = 0;
    const chest = new THREE.Vector3();

    const snd = (game, pos, vol = 0.8) => {
      const a = game.audio;
      const name = a.has('impact_punch') ? 'impact_punch' : 'hit_flesh';
      if (pos) a.at(name, pos, vol, { refDistance: 2, maxDistance: 25 }); else a.play(name, { volume: vol * 0.7, bus: 'sfx' });
    };

    function shove(game, r) {
      const p = game.player;
      if (p.dead || game.time < nextPush) return;
      if (p.stamina < STAM) { game.ui.toast('Too tired to shove.', 'info'); return; }
      nextPush = game.time + CD;
      p.stamina -= STAM;
      const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      game.net.send('modmsg', { k: 'tfg-push', to: r.id, d: [+(dx / L).toFixed(3), +(dz / L).toFixed(3)], f: FORCE });
      game.sfx('swing_whoosh', 0.5);
      snd(game, r.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.8);
      game.engine.shake(0.08);
      game.swingAnim = 0.6;   // reuse the melee arm swing on the view model
    }

    api.on('interactables', (list, game) => {
      const p = game.player;
      if (p.dead || !game.remotes.size || game.time < nextPush) return;
      for (const r of game.remotes.values()) {
        if (r.dead || r.pos.y < -900) continue;
        chest.set(r.pos.x, r.pos.y + 1.1, r.pos.z);
        if (Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) > REACH + 0.6 || Math.abs(r.pos.y - p.pos.y) > 1.6) continue;
        list.push({
          pos: chest.clone(), r: 0.5, reach: REACH,
          label: `Shove ${r.name} [E]`,
          sub: () => (p.stamina < STAM ? 'too tired' : ''),
          action: () => shove(game, r),
        });
      }
    });

    api.on('message', (d, from) => {
      const game = api.game;
      if (!game || d?.k !== 'tfg-push' || !Array.isArray(d.d)) return;
      const r = game.remotes.get(from);
      if (d.to !== game.selfId) {
        // third parties just hear it
        const v = game.remotes.get(d.to);
        if (v) snd(game, v.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.7);
        return;
      }
      const p = game.player;
      if (p.dead || game.time < immuneUntil) return;
      immuneUntil = game.time + 0.45;
      const f = Math.max(0, Math.min(16, Number(d.f) || FORCE));
      const dx = Math.max(-1, Math.min(1, Number(d.d[0]) || 0)), dz = Math.max(-1, Math.min(1, Number(d.d[1]) || 0));
      p.vel.x += dx * f; p.vel.z += dz * f;
      p.vel.y = Math.max(p.vel.y, 3.0);
      p.grounded = false;
      game.engine.shake(0.3);
      snd(game, null, 0.9);
      if (r && Math.random() < 0.25) game.ui.toast(`${r.name} shoved you!`, 'info');
    });
  },
});
