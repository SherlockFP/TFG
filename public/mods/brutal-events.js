// brutal-events — port of Brutal Company (Plus / Minus / Reborn).
// Every landing the host rolls random "daily events" that change the day: blackouts, hordes,
// gold rushes, minefields, turret parties, dense fog, time warps, meteor showers, night shifts...
KefalAPI.defineMod({
  id: 'brutal-events',
  name: 'Brutal Events',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Brutal Company Plus / Minus / Reborn',
  enabledByDefault: false,
  description: 'Each day on a moon rolls random events (Power Outage, Infestation, Gold Rush, Minefield, Turret Party, Dense Fog, Time Warp, Meteor Shower, Night Shift, Low Gravity, Calm Day). Host-driven; type EVENTS in the terminal.',
  config: {
    eventsPerDay: { type: 'number', default: 1, min: 1, max: 3, label: 'Events per day' },
    severity: { type: 'number', default: 1, min: 0.5, max: 2.5, step: 0.1, label: 'Severity' },
    pool: { type: 'select', options: ['everything', 'mild', 'brutal only'], default: 'everything', label: 'Event pool' },
    scaleWithDanger: { type: 'boolean', default: true, label: 'Severity grows with moon tier / quota' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const sellable = (d) => !!d && (['scrap', 'big', 'fish', 'drop'].includes(d.kind) || (!!d.value && d.kind !== 'tool'));
    const inShip = (p) => p.x > -7 && p.x < 7 && p.z > -3.5 && p.z < 3.5 && p.y > -0.8 && p.y < 3.9;
    const rand = (a, b) => a + Math.random() * (b - a);

    // ------------------------------------------------------------------ event table
    const EVENTS = {
      blackout: { name: 'POWER OUTAGE', desc: 'The facility grid is down. Find a fuse box.', w: 10, pools: ['everything', 'mild', 'brutal only'],
        apply(g) { g.hostSetPower(false); } },
      horde: { name: 'INFESTATION', desc: 'Something has been breeding inside. Expect company.', w: 10, pools: ['everything', 'brutal only'],
        apply(g, sev) {
          const hd = g.hostData;
          hd.powerBoost = (hd.powerBoost || 0) + Math.round((3 + (hd.danger || 1)) * sev);
          g.hostSpawnWave(0.9);
        } },
      goldrush: { name: 'GOLD RUSH', desc: 'The scrap here is worth a fortune today.', w: 8, pools: ['everything', 'mild'],
        apply(g, sev) {
          const mul = 1 + 0.5 * sev;
          for (const it of [...g.items.all()]) {
            if (it.state !== 'world' || !sellable(it.def) || it.soulbound || it.type === 'body' || inShip(it.obj.position)) continue;
            g.net.broadcast('it', { e: 'val', id: it.id, v: Math.round((it.value || 0) * mul) });
          }
        } },
      minefield: { name: 'MINEFIELD', desc: 'Watch your step. Every step.', w: 8, pools: ['everything', 'brutal only'],
        apply(g, sev) { spawnHazards(g, 'mine', Math.round(rand(6, 11) * sev)); } },
      turrets: { name: 'TURRET PARTY', desc: 'Company security was upgraded. Not for you.', w: 7, pools: ['everything', 'brutal only'],
        apply(g, sev) { spawnHazards(g, 'turret', Math.round(rand(2, 4.5) * sev)); } },
      fog: { name: 'DENSE FOG', desc: 'You can barely see your own hands.', w: 8, pools: ['everything', 'mild'], apply() {} },
      fastclock: { name: 'TIME WARP', desc: 'The day passes much faster than usual.', w: 7, pools: ['everything', 'mild', 'brutal only'],
        apply(g, sev) {
          if (state.savedDayLen == null) state.savedDayLen = g.config.dayLengthSec || 720;
          g.config.dayLengthSec = Math.round(state.savedDayLen / (1 + 0.6 * sev));
        } },
      meteors: { name: 'METEOR SHOWER', desc: 'Stay indoors after noon. Seriously.', w: 6, pools: ['everything', 'brutal only'],
        apply() { state.meteorT = 20; } },
      nightshift: { name: 'NIGHT SHIFT', desc: 'The night creatures are already awake.', w: 6, pools: ['everything', 'brutal only'],
        apply(g, sev) {
          const hd = g.hostData;
          const before = hd.outPowerUsed || 0;
          const n = Math.max(1, Math.round(1 + 1.5 * sev));
          for (let i = 0; i < n; i++) g.hostSpawnOutdoor();
          hd.outPowerUsed = before;   // these are extra: the normal night budget is untouched
        } },
      lowgrav: { name: 'LOW GRAVITY', desc: 'Jumps go higher. Landings... also higher.', w: 5, pools: ['everything', 'mild'], apply() {} },
      calm: { name: 'CALM DAY', desc: 'Nothing unusual. Suspicious.', w: 5, pools: ['everything', 'mild'], apply() {} },
    };

    const state = { savedDayLen: null, meteorT: 0, applied: '', meteors: [], fogMul: 1 };

    function currentEvents(game) { const e = game?.run?.brutal; return Array.isArray(e) ? e : []; }

    // ------------------------------------------------------------------ hazard spawning (host)
    function usedCodes(g) {
      const s = new Set();
      for (const d of g.world.facility?.doors || []) if (d.code) s.add(d.code);
      for (const c of g.creatures.host.values()) if (c.code) s.add(c.code);
      return s;
    }
    function newCode(used) {
      for (let i = 0; i < 400; i++) {
        const c = String.fromCharCode(97 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * (i < 200 ? 10 : 100));
        if (!used.has(c)) { used.add(c); return c; }
      }
      return null;
    }
    function spawnHazards(g, type, n) {
      const fac = g.world.facility;
      if (!fac || n <= 0) return;
      const used = usedCodes(g);
      const Y = fac.scrapSpots?.[0]?.y ?? fac.layout?.y ?? -300;
      const exits = [fac.mainDoor, ...(fac.fireDoors || [])].filter(Boolean).map((d) => d.spawn || d.pos).filter(Boolean);
      const taken = [...g.creatures.host.values()].filter((c) => c.type === 'mine' || c.type === 'turret').map((c) => c.pos);
      const ok = (x, z) => exits.every((e) => Math.hypot(e.x - x, e.z - z) > 8) && taken.every((t) => Math.hypot(t.x - x, t.z - z) > 2.2);
      const cands = [];
      const pref = type === 'turret' ? fac.turretSpots || [] : (fac.mineSpots || []).filter((s) => !s.web);
      for (const s of pref) cands.push({ x: s.x, z: s.z, yaw: s.rotY });
      for (let i = 0; i < 80 && fac.nav; i++) { const p = fac.nav.randomWalkable(Math.random); if (p) cands.push({ x: p.x, z: p.z }); }
      cands.sort(() => Math.random() - 0.5);
      let placed = 0;
      for (const s of cands) {
        if (placed >= n) break;
        if (!ok(s.x, s.z)) continue;
        const code = newCode(used);
        const pos = new THREE.Vector3(s.x, Y, s.z);
        if (type === 'turret') g.creatures.hostSpawn('turret', pos, { yaw: s.yaw ?? Math.floor(Math.random() * 4) * Math.PI / 2, code, state: 'idle' });
        else g.creatures.hostSpawn('mine', pos, { code, state: 'armed' });
        taken.push(pos);
        placed++;
      }
    }

    function severity(g) {
      let s = Math.max(0.3, Number(cfg.severity) || 1);
      if (cfg.scaleWithDanger) s *= 1 + Math.max(0, (g.hostData?.danger || 1) - 1) * 0.12;
      return Math.min(4, s);
    }

    function roll() {
      const pool = Object.entries(EVENTS).filter(([, e]) => e.pools.includes(cfg.pool || 'everything'));
      const n = Math.max(1, Math.min(3, Math.round(Number(cfg.eventsPerDay) || 1)));
      const out = [];
      for (let k = 0; k < n; k++) {
        const left = pool.filter(([id]) => !out.includes(id) && !(out.length && id === 'calm'));
        let tot = 0; for (const [, e] of left) tot += e.w;
        let r = Math.random() * tot;
        for (const [id, e] of left) { r -= e.w; if (r <= 0) { out.push(id); break; } }
        if (out[0] === 'calm') break;
      }
      return out;
    }

    // ------------------------------------------------------------------ host flow
    api.on('moonPopulated', (g) => {
      const evs = roll();
      const sev = severity(g);
      g.run.brutal = evs;
      g.broadcastRun(['brutal']);
      for (const id of evs) { try { EVENTS[id].apply(g, sev); } catch (e) { console.warn('[brutal-events]', id, e); } }
      const text = evs.map((id) => EVENTS[id].name).join(' + ');
      g.net.broadcast('sys', { text: `DAILY EVENT: ${text} — ${evs.map((id) => EVENTS[id].desc).join(' ')}`, kind: evs[0] === 'calm' ? 'info' : 'bad' });
      g.net.broadcast('kmod:brutal', { e: 'announce', ev: evs });
    });

    api.on('phase', (ph, g) => {
      if (!g.isHost) return;
      if (ph === 'takeoff' || ph === 'orbit') {
        if (state.savedDayLen != null) { g.config.dayLengthSec = state.savedDayLen; state.savedDayLen = null; }
        state.meteorT = 0;
        if (currentEvents(g).length) { g.run.brutal = []; g.broadcastRun(['brutal']); }
      }
    });

    function hostMeteors(g, dt) {
      if (!currentEvents(g).includes('meteors') || g.run.phase !== 'moon' || (g.run.time || 0) < 12 * 60) return;
      state.meteorT -= dt;
      if (state.meteorT > 0) return;
      const sev = severity(g);
      state.meteorT = rand(6, 14) / Math.max(0.5, sev);
      const outside = g.aiPlayers().filter((p) => !p.dead && p.zone === 'out' && !p.inShip);
      if (!outside.length || !g.world.terrain) return;
      const p = outside[Math.floor(Math.random() * outside.length)];
      const a = Math.random() * Math.PI * 2, r = rand(3, 24);
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      if (Math.hypot(x, z) < 13) return;   // the ship is armored
      const y = g.world.terrain.heightAt(x, z);
      const fall = 1.8;
      g.net.broadcast('kmod:brutal', { e: 'meteor', p: [x, y, z], t: fall });
      const world = g.world.outdoor;
      setTimeout(() => {
        if (g.run?.phase !== 'moon' || g.world.outdoor !== world) return;
        g.hostExplosion(new THREE.Vector3(x, y + 0.3, z), 5.5, Math.round(60 * sev), null);
      }, fall * 1000);
    }

    // ------------------------------------------------------------------ clients
    api.on('netReady', (net, game) => {
      state.meteors.length = 0; state.applied = '';
      net.on_('kmod:brutal', (d) => {
        if (d.e === 'announce') {
          const ev = (d.ev || []).filter((id) => EVENTS[id]);
          if (ev.length) setTimeout(() => game.ui.hud?.bigText(ev.map((id) => EVENTS[id].name).join(' + '), ev.map((id) => EVENTS[id].desc).join(' ')), 1500);
          game.audio.play('ship_alarm', { volume: 0.35 });
        } else if (d.e === 'meteor') spawnMeteor(game, d);
      });
    });

    function spawnMeteor(game, d) {
      const target = new THREE.Vector3().fromArray(d.p);
      const start = target.clone().add(new THREE.Vector3(rand(-40, 40), 140, rand(-40, 40)));
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false }));
      const trail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 9, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
      trail.position.y = 4.5;
      const g = new THREE.Group(); g.add(mesh); g.add(trail);
      g.position.copy(start);
      g.lookAt(target); g.rotateX(-Math.PI / 2);
      game.scene.add(g);
      const light = game.lights.add({ pos: start.clone(), color: 0xff7a30, intensity: 3, distance: 22, group: 'fx' });
      const snd = game.audio.play('jetpack', { follow: g, volume: 1, pitch: 0.45, refDistance: 12, maxDistance: 200, loop: true });
      state.meteors.push({ g, light, snd, start, target, t: 0, dur: d.t || 1.8 });
    }

    api.on('update', (dt, game) => {
      const evs = currentEvents(game);
      const key = evs.join(',');
      if (key !== state.applied) { state.applied = key; game.refreshStats(); }
      if (game.isHost) hostMeteors(game, dt);
      // meteors in flight
      for (const m of [...state.meteors]) {
        m.t += dt;
        const k = Math.min(1, m.t / m.dur);
        m.g.position.lerpVectors(m.start, m.target, k * k);
        m.light.pos.copy(m.g.position);
        m.g.children[0].rotation.x += dt * 9;
        if (k >= 1) {
          m.g.removeFromParent(); m.g.traverse((o) => o.geometry?.dispose());
          game.lights.remove(m.light); m.snd?.stop(0.1);
          state.meteors.splice(state.meteors.indexOf(m), 1);
        }
      }
      // dense fog (client side, after the environment has set its own fog this frame)
      if (evs.includes('fog') && (game.run?.phase === 'moon' || game.run?.phase === 'takeoff') && game.scene.fog) {
        const f = game.scene.fog;
        if (game.player.indoor) f.density = Math.max(f.density, 0.11);
        else { f.density = Math.max(f.density * 3.2, 0.065); f.color.lerp(new THREE.Color(0x8a9096), 0.5); game.scene.background?.copy?.(f.color); }
      }
    });

    api.on('stats', (s, game) => {
      if (currentEvents(game).includes('lowgrav')) s.jumpMul = (s.jumpMul || 1) * 1.7;
    });

    api.registerCommand('events', (args, term, game) => {
      const evs = currentEvents(game);
      if (!evs.length) { term.print(game.run?.phase === 'moon' ? 'No unusual activity reported today.' : 'Events are rolled when the ship lands on a moon.\nPOSSIBLE EVENTS:\n' + Object.values(EVENTS).map((e) => `* ${e.name.padEnd(15)} ${e.desc}`).join('\n')); return; }
      term.print('TODAY\'S EVENTS:\n' + evs.map((id) => `* ${EVENTS[id].name}\n  ${EVENTS[id].desc}`).join('\n'));
    }, 'show today\'s Brutal Events');
  },
});
