// herobrine-stalker — port of Herobrine (Kittenji) + the Faceless Stalker / Slenderman family.
// A rare, passive entity: a tall faceless figure that appears far behind a crewmate, watching.
// The instant anyone looks straight at it, it is gone. It never attacks... but walk backwards
// into it and you will regret having a heart.
KefalAPI.defineMod({
  id: 'herobrine-stalker',
  name: 'Faceless Stalker',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Herobrine + FacelessStalker',
  builtin: true,
  scope: 'host',
  category: 'horror',
  enabledByDefault: true,
  description: 'A rare tall faceless figure appears far behind you and vanishes when looked at. Harmless, except for your nerves (jumpscare if you get close). Host-driven.',
  config: {
    spawnChance: { type: 'number', default: 22, min: 0, max: 100, label: 'Chance per check (%)' },
    checkEvery: { type: 'number', default: 45, min: 10, max: 300, label: 'Seconds between checks' },
    lifetime: { type: 'number', default: 40, min: 10, max: 180, label: 'Max seconds it lingers' },
    outdoors: { type: 'boolean', default: true, label: 'Also appears outdoors' },
    jumpscare: { type: 'select', options: ['full', 'mild', 'off'], default: 'full', label: 'Jumpscare' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const TYPE = 'faceless';   // NOT 'stalker': that id is the built-in Parasocial (round 3) and a mod must never replace it

    function stalkerModel(THREE) {
      const root = new THREE.Group();
      const suit = new THREE.MeshLambertMaterial({ color: 0x0c0c10 });
      const skin = new THREE.MeshLambertMaterial({ color: 0xd9d6cc });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); root.add(m); return m; };
      box(0.13, 1.3, 0.15, suit, -0.11, 0.65, 0);
      box(0.13, 1.3, 0.15, suit, 0.11, 0.65, 0);
      const torso = box(0.44, 0.82, 0.22, suit, 0, 1.7, 0);
      const armL = new THREE.Group(); armL.position.set(-0.3, 2.05, 0); root.add(armL);
      const armR = new THREE.Group(); armR.position.set(0.3, 2.05, 0); root.add(armR);
      for (const a of [armL, armR]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.1), suit); m.position.y = -0.58; a.add(m);
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.06), skin); h.position.y = -1.23; a.add(h);
      }
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.01), new THREE.MeshLambertMaterial({ color: 0xbfbfbf })); shirt.position.set(0, 1.85, 0.115); root.add(shirt);
      const neck = box(0.08, 0.14, 0.08, skin, 0, 2.17, 0);
      const head = new THREE.Group(); head.position.set(0, 2.38, 0); root.add(head);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); skull.scale.set(0.95, 1.28, 1.0); head.add(skull);
      const eyes = new THREE.Group(); eyes.visible = false; head.add(eyes);
      for (const x of [-0.065, 0.065]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.02), eyeMat); e.position.set(x, 0.03, 0.197); eyes.add(e); }
      void torso; void neck;
      let t = 0, flick = 0;
      const mats = [suit, skin];
      return {
        root, parts: { head, eyes: [] }, height: 2.6, radius: 0.35,
        update(dt, anim) {
          t += dt;
          root.rotation.z = Math.sin(t * 0.7) * 0.015;
          head.rotation.z = Math.sin(t * 0.37) * 0.14;
          armL.rotation.x = Math.sin(t * 0.5) * 0.04; armR.rotation.x = -Math.sin(t * 0.5) * 0.04;
          eyes.visible = anim.state !== 'vanish' && Math.sin(t * 1.3) > 0.97;
          if (anim.state === 'vanish') {
            flick += dt;
            root.visible = Math.random() > 0.5 && flick < 0.4;
            root.scale.set(1 - flick * 1.5, 1 + flick * 0.8, 1 - flick * 1.5);
          }
        },
        setElite() {}, setHitFlash(v) { for (const m of mats) m.emissive?.setRGB(v * 0.3, v * 0.3, v * 0.3); },
        dispose() { root.traverse((o) => o.geometry?.dispose()); },
      };
    }

    // ---------------------------------------------------------------- host behavior
    function behavior(c, dt, M) {
      const g = M.game;
      c.data.life = (c.data.life ?? (Number(cfg.lifetime) || 40)) - dt;
      if (c.state === 'vanish') { if (c.t > 0.45) M.hostRemove(c.id); return; }
      if (c.state !== 'stand') c.setState('stand');
      const players = g.aiPlayers().filter((p) => !p.dead);
      const victim = players.find((p) => p.id === c.target) || M.nearest(c, players)?.p;
      if (!victim || c.data.life <= 0 || g.run?.phase !== 'moon') { vanish(c, M, false); return; }
      c.yaw = Math.atan2(victim.pos.x - c.pos.x, victim.pos.z - c.pos.z);
      // looked at directly -> gone
      if (players.some((p) => !p.inShip && M.isLookedAt(c, p, 90, 0.93))) {
        c.data.seenT = (c.data.seenT || 0) + dt;
        if (c.data.seenT > 0.12) vanish(c, M, true);
        return;
      }
      c.data.seenT = 0;
      // walked into it
      for (const p of players) {
        if (Math.abs(p.pos.y - c.pos.y) < 3 && p.pos.distanceTo(c.pos) < 3.2) {
          if (cfg.jumpscare !== 'off') g.net.broadcast('kmod:stalker', { e: 'scare', to: p.id, p: [c.pos.x, c.pos.y + 2, c.pos.z] });
          vanish(c, M, false);
          return;
        }
      }
      // creep closer while nobody watches
      c.data.stepT = (c.data.stepT ?? 6) - dt;
      if (c.data.stepT <= 0) {
        c.data.stepT = 5 + Math.random() * 6;
        const d = victim.pos.distanceTo(c.pos);
        if (d > 7) {
          const k = Math.min(3.5, d - 5) / d;
          const nx = c.pos.x + (victim.pos.x - c.pos.x) * k, nz = c.pos.z + (victim.pos.z - c.pos.z) * k;
          const nav = M.nav(c);
          if (!nav || nav.walkableAt(nx, nz)) M.placeAt(c, nx, nz);
        }
      }
    }
    function vanish(c, M, seen) {
      c.setState('vanish');
      if (seen) M.sound(c, ['whisper_1', 'whisper_2', 'whisper_3'][Math.floor(Math.random() * 3)], 0.45);
    }

    api.registerCreature(TYPE, {
      name: 'Faceless Stalker', hp: null, dmg: 0, walk: 0, run: 0, power: 0, xp: 0, coin: 0, zone: 'any', radius: 0.35, height: 2.6,
      lore: 'Tall. Thin. No face. Always far away, always behind someone. Nobody has ever caught it looking. Field note: it is not in any Company inventory.',
    }, behavior, { model: (T) => stalkerModel(T) });

    // ---------------------------------------------------------------- host spawning
    let checkT = 20;
    function trySpawn(g) {
      const run = g.run;
      if (run.phase !== 'moon' || (run.time || 0) < 9 * 60) return;
      if ([...g.creatures.host.values()].some((c) => c.type === TYPE)) return;
      if (Math.random() * 100 >= (Number(cfg.spawnChance) || 0)) return;
      const cands = g.aiPlayers().filter((p) => !p.dead && !p.inShip && (p.zone === 'in' || cfg.outdoors));
      if (!cands.length) return;
      const p = cands[Math.floor(Math.random() * cands.length)];
      const back = new THREE.Vector3(-p.look.x, 0, -p.look.z);
      if (back.lengthSq() < 1e-4) back.set(0, 0, 1);
      back.normalize();
      let spot = null;
      if (p.zone === 'in') {
        const fac = g.world.facility;
        if (!fac?.nav) return;
        let fallback = null;
        for (let i = 0; i < 60 && !spot; i++) {
          const q = fac.nav.randomWalkable(Math.random, p.pos.x + back.x * 16, p.pos.z + back.z * 16, 10);
          if (!q) continue;
          const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
          if (d < 11 || d > 30 || (dx * back.x + dz * back.z) / d < 0.3) continue;
          const at = new THREE.Vector3(q.x, p.pos.y, q.z);
          if (g.physics.lineOfSight(p.eye, at.clone().add(new THREE.Vector3(0, 1.6, 0)))) spot = at; else fallback = fallback || at;
        }
        spot = spot || fallback;
      } else if (g.world.terrain) {
        const a = Math.atan2(back.x, back.z) + (Math.random() - 0.5) * 1.6;
        const d = 24 + Math.random() * 18;
        const x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d;
        if (Math.hypot(x, z) > 18 && Math.abs(x) < 125 && Math.abs(z) < 125) spot = new THREE.Vector3(x, g.world.terrain.heightAt(x, z), z);
      }
      if (!spot) return;
      const c = g.creatures.hostSpawn(TYPE, spot, { zone: p.zone === 'in' ? 'in' : 'out', state: 'stand', yaw: Math.atan2(p.pos.x - spot.x, p.pos.z - spot.z) });
      if (c) c.target = p.id;
    }
    api.on('update', (dt, g) => {
      if (!g.isHost || !g.run) return;
      checkT -= dt;
      if (checkT > 0) return;
      checkT = Math.max(10, Number(cfg.checkEvery) || 45) * (0.7 + Math.random() * 0.6);
      try { trySpawn(g); } catch (e) { console.warn('[stalker]', e); }
    });

    // ---------------------------------------------------------------- clients: jumpscare
    const CSS = `
.kmod-scare { position: fixed; inset: 0; z-index: 60; pointer-events: none; background: radial-gradient(ellipse 22% 34% at 50% 46%, #e9e6dc 0 60%, #bdb9ad 68%, #000 72%); animation: kmodScare 0.5s steps(3) forwards; }
.kmod-scare::before, .kmod-scare::after { content: ''; position: absolute; top: 40%; width: 3.2vw; height: 1.4vw; background: #fff; box-shadow: 0 0 30px #fff; }
.kmod-scare::before { left: 44%; } .kmod-scare::after { right: 44%; }
.kmod-scare.mild { opacity: 0.5; }
@keyframes kmodScare { 0% { transform: scale(0.6); } 40% { transform: scale(1.25); } 100% { transform: scale(1.5); opacity: 0; } }`;
    function scare(game) {
      const mild = cfg.jumpscare === 'mild';
      if (!document.getElementById('kmod-scare-css')) { const s = document.createElement('style'); s.id = 'kmod-scare-css'; s.textContent = CSS; document.head.appendChild(s); }
      const el = document.createElement('div'); el.className = 'kmod-scare' + (mild ? ' mild' : '');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 600);
      game.audio.play('screamer_scream', { volume: mild ? 0.5 : 1, bus: 'sfx' });
      if (!mild) game.audio.play('death_sting', { volume: 0.8, bus: 'music' });
      game.engine.flash(0xffffff, mild ? 0.3 : 0.7);
      game.engine.shake(mild ? 0.4 : 1.1);
      game.player.stunT = Math.max(game.player.stunT || 0, mild ? 0.2 : 0.6);
    }
    api.on('netReady', (net, game) => {
      net.on_('kmod:stalker', (d) => {
        if (d.e !== 'scare') return;
        if (d.to === game.selfId) scare(game);
        else if (d.p) game.audio.at('screamer_scream', new THREE.Vector3().fromArray(d.p), 0.5, { occlude: true });
      });
    });
  },
});
