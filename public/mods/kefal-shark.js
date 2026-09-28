// kefal-shark — a brand-new indoor creature: the Kefal Shark, a "land shark" that swims through the
// facility floor. All you see is its dorsal fin cutting through the concrete... until it bites.
// It hunts by vibration (footsteps, voices, noisy items): crouch-walk and it loses you.
KefalAPI.defineMod({
  id: 'kefal-shark',
  name: 'Kefal Shark',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'LethalThings / custom-enemy mods ("land shark")',
  enabledByDefault: false,
  cheat: true,
  description: 'New indoor creature: a shark that swims through the floor (only its fin shows), hunts by vibration and bites hard. Crouch to lose it. Killable; drops a Shark Fin. Everyone should run it.',
  config: {
    spawnWeight: { type: 'number', default: 8, min: 0, max: 40, label: 'Spawn weight' },
    damage: { type: 'number', default: 35, min: 5, max: 120, label: 'Bite damage' },
  },
  init(api, cfg) {
    const TYPE = 'kefalshark';

    // ---------------------------------------------------------------- model
    function sharkModel(THREE, opts = {}) {
      const root = new THREE.Group();
      const skin = new THREE.MeshLambertMaterial({ color: 0x5d7488, flatShading: true });
      const belly = new THREE.MeshLambertMaterial({ color: 0xcfd6d8, flatShading: true });
      const mouthM = new THREE.MeshBasicMaterial({ color: 0x3a0808 });
      const toothM = new THREE.MeshBasicMaterial({ color: 0xf4f0e0 });
      const eyeM = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
      const crackM = new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      // dorsal fin (lies in the YZ plane, leading edge towards +Z)
      const shape = new THREE.Shape();
      shape.moveTo(-0.38, 0); shape.lineTo(0.32, 0); shape.quadraticCurveTo(0.08, 0.35, -0.18, 0.78); shape.quadraticCurveTo(-0.22, 0.35, -0.38, 0);
      const finGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
      finGeo.translate(0, 0, -0.035); finGeo.rotateY(-Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, skin);
      root.add(fin);
      // wake / crack in the floor around the fin
      const wake = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.55, 12, 1), crackM);
      wake.rotation.x = -Math.PI / 2; wake.position.y = 0.015; wake.scale.set(0.8, 1.8, 1);
      root.add(wake);
      // body (lives under the floor, rises to bite)
      const body = new THREE.Group(); body.position.y = -0.75; root.add(body);
      const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), skin); torso.scale.set(0.95, 0.85, 2.2); body.add(torso);
      const under = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 6), belly); under.scale.set(0.9, 0.7, 2.05); under.position.y = -0.1; body.add(under);
      const head = new THREE.Group(); head.position.set(0, 0.02, 0.95); body.add(head);
      const jawTop = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 7), skin); jawTop.rotation.x = Math.PI / 2; jawTop.position.set(0, 0.08, 0.2); jawTop.scale.set(1, 1, 0.55); head.add(jawTop);
      const jaw = new THREE.Group(); jaw.position.set(0, -0.05, -0.05); head.add(jaw);
      const jawLow = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.55, 7), belly); jawLow.rotation.x = Math.PI / 2; jawLow.position.set(0, -0.06, 0.2); jawLow.scale.set(1, 1, 0.4); jaw.add(jawLow);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.35), mouthM); mouth.position.set(0, 0.0, 0.15); head.add(mouth);
      for (let i = 0; i < 7; i++) {
        const a = (i / 6 - 0.5) * 2.2;
        const tt = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 3), toothM);
        tt.position.set(Math.sin(a) * 0.22, 0.0, 0.18 + Math.cos(a) * 0.12); tt.rotation.x = Math.PI; head.add(tt);
        const tb = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 3), toothM);
        tb.position.set(Math.sin(a) * 0.19, -0.02, 0.18 + Math.cos(a) * 0.1); jaw.add(tb);
      }
      const eyes = [];
      for (const x of [-0.24, 0.24]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), eyeM); e.position.set(x, 0.12, 0.1); head.add(e); eyes.push(e); }
      const tail = new THREE.Group(); tail.position.set(0, 0, -1.05); body.add(tail);
      const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), skin); tailFin.rotation.x = -Math.PI / 2; tailFin.scale.set(0.15, 1, 1.6); tailFin.position.z = -0.25; tail.add(tailFin);
      const mats = [skin, belly];
      let t = 0, rise = 0, open = 0, sink = 0, loop = null, flip = 0;
      if (opts.elite) setElite(true);
      function setElite(on) { eyeM.color.setHex(on ? 0xff2a1a : 0x0a0a0a); skin.color.setHex(on ? 0x3b4a58 : 0x5d7488); }
      return {
        root, parts: { head, fin, body, eyes }, height: 1.0, radius: 0.7,
        update(dt, anim) {
          t += dt;
          const st = anim.state, sp = anim.speed || 0;
          const biting = st === 'bite' || st === 'attack';
          const dead = st === 'dead';
          rise += ((biting ? 1 : dead ? 0.8 : 0) - rise) * Math.min(1, dt * (biting ? 10 : 4));
          open += (((biting && (anim.t || 0) < 0.45) ? 1 : 0) - open) * Math.min(1, dt * 14);
          sink += ((st === 'dive' ? 1 : 0) - sink) * Math.min(1, dt * 5);
          flip += ((dead ? 1 : 0) - flip) * Math.min(1, dt * 3);
          body.position.y = -0.75 + rise * 1.05;
          body.rotation.x = -0.55 * rise * (1 - flip);
          body.rotation.z = flip * Math.PI;
          jaw.rotation.x = open * 0.7;
          fin.position.y = -sink * 0.85 - rise * 0.1;
          fin.rotation.z = Math.sin(t * (2 + sp)) * (0.05 + Math.min(sp, 8) * 0.012);
          fin.visible = !dead;
          tail.rotation.y = Math.sin(t * (4 + sp * 1.2)) * (0.25 + Math.min(sp, 8) * 0.04);
          wake.visible = !dead && sink < 0.8;
          const pulse = 1 + Math.sin(t * 9) * 0.08;
          wake.scale.set(0.8 * pulse + Math.min(sp, 9) * 0.05, 1.8 + Math.min(sp, 9) * 0.25, 1);
          if (st === 'stunned') fin.rotation.z = Math.sin(t * 20) * 0.25;
          // rumbling loop that follows the fin (client side)
          const audio = (typeof KefalAPI !== 'undefined' && KefalAPI.game?.audio) || null;
          if (audio && !loop && !dead) loop = audio.play('sandkefal_rumble', { loop: true, follow: root, volume: 0.001, occlude: true, refDistance: 2.5, maxDistance: 28, pitch: 1.6 });
          if (loop) { if (dead) { loop.stop(0.5); loop = null; } else loop.setVolume(0.12 + Math.min(sp, 9) * 0.04, 0.2); }
        },
        setElite,
        setHitFlash(v) { for (const m of mats) m.emissive?.setRGB(v * 0.6, v * 0.08, v * 0.05); },
        dispose() { loop?.stop(0.2); loop = null; root.traverse((o) => o.geometry?.dispose()); },
      };
    }

    // ---------------------------------------------------------------- AI (host)
    function behavior(c, dt, M) {
      const d = c.data;
      const players = M.playersFor(c).filter((p) => !p.inShip);
      if (c.state === 'idle' || c.state === 'walk') c.setState('swim');
      if (c.state === 'bite') {
        if (c.t > 0.9) {
          c.setState('dive'); d.diveT = 1.6;
          const a = Math.random() * Math.PI * 2;
          M.goTo(c, c.pos.x + Math.cos(a) * 7, c.pos.z + Math.sin(a) * 7);
        }
        return;
      }
      if (c.state === 'dive') { d.diveT -= dt; M.follow(c, dt, c.def.walk * 1.3); if (d.diveT <= 0) c.setState('swim'); return; }
      if (c.state !== 'hunt') c.target = null;
      let tgt = c.target ? players.find((p) => p.id === c.target) : null;
      if (!tgt) {
        // vibration: footsteps / voices / thrown things
        const n = M.hear(c, 18);
        if (n) {
          const owner = n.owner && players.find((p) => p.id === n.owner);
          if (owner && owner.pos.distanceTo(c.pos) < 26) tgt = owner;
          else if (c.state === 'swim' && !d.investigating) { M.goTo(c, n.pos.x, n.pos.z); d.investigating = true; }
        }
        if (!tgt) { const near = M.nearest(c, players, 4.5); if (near && !near.p.crouch) tgt = near.p; }
        if (tgt) { c.target = tgt.id; c.setState('hunt'); d.lostT = 0; d.investigating = false; M.sound(c, 'hound_growl', 0.8); }
      }
      if (c.state === 'hunt') {
        if (!tgt) { c.target = null; c.setState('swim'); return; }
        const dist = tgt.pos.distanceTo(c.pos);
        const loud = (tgt.noise || 0) > 0.1 || (tgt.voice || 0) > 0.05 || dist < 3.2;
        d.lostT = loud ? 0 : (d.lostT || 0) + dt;
        if (d.lostT > 3.5 || dist > 34 || Math.abs(tgt.pos.y - c.pos.y) > 3) { c.target = null; c.setState('swim'); M.sound(c, 'sludge_gurgle', 0.5); return; }
        if (dist < 1.9 && c.cooldown <= 0) {
          c.yaw = Math.atan2(tgt.pos.x - c.pos.x, tgt.pos.z - c.pos.z);
          c.setState('bite'); c.cooldown = 2.4;
          M.attack(c, tgt, c.dmg, TYPE);
          M.sound(c, 'lurker_snap', 1);
          return;
        }
        M.moveToward(c, tgt.pos, dt, c.def.run, 5);
        return;
      }
      // swim around
      if (M.follow(c, dt, c.def.walk)) {
        d.investigating = false;
        d.restT = (d.restT ?? 0) - dt;
        if (d.restT <= 0) { M.wander(c, 16); d.restT = 0.5 + Math.random() * 2.5; }
      }
    }

    api.registerItem({ id: 'drop_sharkfin', name: 'Shark Fin', kind: 'drop', value: [70, 130], weight: 6, hands: 1 }, {
      model(T) {
        const g = new T.Group();
        const s = new T.Shape(); s.moveTo(-0.15, 0); s.lineTo(0.13, 0); s.quadraticCurveTo(0.03, 0.14, -0.07, 0.3); s.lineTo(-0.15, 0);
        const m = new T.Mesh(new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }), new T.MeshLambertMaterial({ color: 0x5d7488 }));
        g.add(m);
        return g;
      },
    });

    const w = Math.max(0, Number(cfg.spawnWeight) || 0);
    const moons = {};
    if (w > 0) {
      const table = { hamsi: 0.4, lufer: 0.7, palamut: 0.8, levrek: 1.2, cipura: 1, orkinos: 1.2, istavrit: 1, kalkan: 0.8, lagos: 1.2 };
      for (const [id, k] of Object.entries(table)) moons[id] = Math.round(w * k * 10) / 10;
    }
    api.registerCreature(TYPE, {
      name: 'Kefal Shark', hp: 200, dmg: Math.round(Number(cfg.damage) || 35), walk: 2.6, run: 8.2, power: 2, xp: 150, coin: 26,
      zone: 'in', radius: 0.7, height: 1.0, drop: ['drop_sharkfin', 0.5],
      lore: 'A kefal that went very, very wrong. Swims through solid concrete like water; only the fin shows. It feels footsteps and voices through the floor. Crouch-walk and it loses you.',
    }, behavior, { model: (T, opts) => sharkModel(T, opts), moons });

    // nicer death message
    api.on('netReady', (net, game) => {
      const orig = game.deathText;
      game.deathText = function (cause) { return cause === TYPE ? 'was eaten by the Kefal Shark.' : orig.call(this, cause); };
    });
  },
});
