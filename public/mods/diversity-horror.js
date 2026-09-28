// diversity-horror — port of Diversity (IntegrityChaos).
// Makes the facility creepier and less predictable: phantom whispers, distant bangs, footsteps
// behind you, lights that flicker when something is near, a heartbeat during chases, and (host)
// per-creature behavior variants so veterans can't fully pattern-match every monster.
KefalAPI.defineMod({
  id: 'diversity-horror',
  name: 'Diversity Horror',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Diversity',
  enabledByDefault: false,
  description: 'Phantom whispers, bangs and footsteps indoors, lights flicker when creatures are near, heartbeat when chased, and random creature variants (swift / sluggish / restless).',
  config: {
    ambience: { type: 'boolean', default: true, label: 'Phantom sounds' },
    ambienceEvery: { type: 'number', default: 45, min: 10, max: 300, label: 'Avg seconds between phantom sounds' },
    flicker: { type: 'boolean', default: true, label: 'Lights flicker near creatures' },
    flickerRadius: { type: 'number', default: 8, min: 3, max: 20, label: 'Flicker radius (m)' },
    heartbeat: { type: 'boolean', default: true, label: 'Heartbeat when chased' },
    variantChance: { type: 'number', default: 35, min: 0, max: 100, label: 'Creature variant chance (%) (host)' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const rand = (a, b) => a + Math.random() * (b - a);
    const CHASE = new Set(['run', 'angry', 'attack', 'popped', 'lunge', 'hunt', 'grab', 'charge']);
    const PASSIVE = new Set(['web', 'mimicdoor', 'turret', 'mine', 'stalker']);
    const VARIANT_OK = new Set(['scuttler', 'yoinker', 'crawler', 'spider', 'screamer', 'mimic', 'hound', 'sludge', 'leech', 'kefalshark', 'lurker', 'skeleton', 'robot']);

    let ambT = 20, flickT = 0, beat = null, varT = 0;
    const touched = new Set();

    function behindPos(game, dmin, dmax) {
      const p = game.player;
      const f = p.forward(); f.y = 0;
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      f.normalize().multiplyScalar(-rand(dmin, dmax));
      f.applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.9, 0.9));
      return p.pos.clone().add(f).add(new THREE.Vector3(0, rand(0.3, 2.2), 0));
    }

    function phantom(game) {
      const a = game.audio, p = game.player;
      if (p.indoor) {
        const r = Math.random();
        if (r < 0.28) a.at(a.variant('whisper'), behindPos(game, 2.5, 6), rand(0.25, 0.5), { occlude: true, refDistance: 1.5 });
        else if (r < 0.48) a.at(a.variant('distant_bang'), behindPos(game, 14, 30), rand(0.5, 0.9), { occlude: true, refDistance: 6 });
        else if (r < 0.62) a.at('vent_rattle', behindPos(game, 5, 12), 0.6, { occlude: true });
        else if (r < 0.74) a.at('door_creak', behindPos(game, 6, 14), 0.6, { occlude: true });
        else if (r < 0.84) a.at(a.variant('drip'), behindPos(game, 2, 6), 0.5, { occlude: true });
        else {
          // footsteps closing in from behind... then nothing
          const mansion = game.world.facility?.layout?.theme === 'mansion';
          const n = 3 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            setTimeout(() => {
              if (!api.game || api.game !== game || game.player.dead) return;
              a.at(a.variant(mansion ? 'step_wood' : 'step_concrete'), behindPos(game, 6 - i, 7 - i), 0.45, { occlude: true, refDistance: 1.5 });
            }, i * 480);
          }
        }
      } else if ((game.run?.time || 0) > 18 * 60 && !p.inShip) {
        if (Math.random() < 0.5) a.at('hound_howl', behindPos(game, 60, 110), 0.35, { refDistance: 20, maxDistance: 250 });
        else a.at('giant_step', behindPos(game, 50, 90), 0.4, { refDistance: 20, maxDistance: 250 });
      }
    }

    function flickerLights(game) {
      const fac = game.world.facility;
      if (!fac?.emitters) return;
      const R = Number(cfg.flickerRadius) || 8, R2 = R * R;
      const threats = [];
      for (const v of game.creatures.views.values()) if (v.state !== 'dead' && !PASSIVE.has(v.type) && !v.def?.hazard) threats.push(v.pos);
      for (const e of fac.emitters) {
        if (e.group !== 'facility') continue;
        if (e.__divFlick === undefined) e.__divFlick = e.flicker || 0;
        let near = false;
        for (const t of threats) { const dx = t.x - e.pos.x, dz = t.z - e.pos.z; if (dx * dx + dz * dz < R2 && Math.abs(t.y - e.pos.y) < 8) { near = true; break; } }
        e.flicker = near ? Math.max(e.__divFlick, 0.75) : e.__divFlick;
      }
    }

    function heartbeat(game, dt) {
      const p = game.player;
      let best = 1e9;
      if (!p.dead) for (const v of game.creatures.views.values()) {
        if (!CHASE.has(v.state) || PASSIVE.has(v.type)) continue;
        const d = v.pos.distanceTo(p.pos);
        if (d < best) best = d;
      }
      const want = best < 14 ? Math.min(1, (14 - best) / 9) * 0.8 : 0;
      if (want > 0.01) {
        if (!beat) beat = game.audio.play('heartbeat', { loop: true, volume: 0.001, bus: 'sfx' });
        beat?.setVolume(want, 0.2);
      } else if (beat) { beat.stop(0.6); beat = null; }
    }

    function hostVariants(game) {
      const chance = (Number(cfg.variantChance) || 0) / 100;
      for (const c of game.creatures.host.values()) {
        if (touched.has(c)) continue;
        touched.add(c);
        if (!VARIANT_OK.has(c.type) || Math.random() >= chance) continue;
        const r = Math.random();
        const mul = r < 0.4 ? { w: 1.25, r: 1.2, tag: 'swift' } : r < 0.75 ? { w: 0.8, r: 0.85, tag: 'sluggish' } : { w: 1.5, r: 1.0, tag: 'restless' };
        c.def = { ...c.def, walk: (c.def.walk || 2) * mul.w, run: (c.def.run || 5) * mul.r };   // per-creature copy
        c.data.variant = mul.tag;
      }
      if (touched.size > 400) { for (const c of [...touched]) if (!game.creatures.host.has(c.id)) touched.delete(c); }
    }

    api.on('netReady', () => { beat = null; touched.clear(); ambT = 20; });
    api.on('phase', (ph) => { if (ph === 'orbit') { touched.clear(); if (beat) { beat.stop(0.3); beat = null; } } });

    api.on('update', (dt, game) => {
      const ph = game.run?.phase;
      const onMoon = ph === 'moon';
      if (cfg.ambience && onMoon && !game.player.dead) {
        ambT -= dt;
        if (ambT <= 0) { ambT = (Number(cfg.ambienceEvery) || 45) * rand(0.5, 1.5); try { phantom(game); } catch { /* ignore */ } }
      }
      if (cfg.flicker && onMoon) { flickT -= dt; if (flickT <= 0) { flickT = 0.2; flickerLights(game); } }
      if (cfg.heartbeat) heartbeat(game, dt);
      if (game.isHost && onMoon) { varT -= dt; if (varT <= 0) { varT = 1; hostVariants(game); } }
    });
  },
});
