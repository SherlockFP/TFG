// needy-cats — port of NeedyCats (Jordo).
// TFG built-in feature (crew switch). Lost internet cats wander the facilities. They meow (which can
// draw creatures), hop around on their own, purr when you carry them, and pay out when rescued:
// bring one into the ship for an XP / Clout reward, then sell it at HQ like any other scrap.
// Host-authoritative: the host spawns them (moonPopulated), moves them (physics owner = host) and
// pays the rescue once per cat per day (only cats secured TODAY count, so reloading can't farm it).
KefalAPI.defineMod({
  id: 'needy-cats',
  name: 'Needy Cats',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'NeedyCats',
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Lost internet cats (Keyboard Cat, Grumpy Cat, Longcat, Nyan Cat, Void Cat...) roam the facilities. Their meows attract creatures. Rescue them to the ship for a reward, then sell them at HQ.',
  config: {
    maxCats: { type: 'number', default: 2, min: 0, max: 6, label: 'Max cats per moon' },
    rescueXp: { type: 'number', default: 70, min: 0, max: 1000, label: 'Rescue XP' },
    rescueClout: { type: 'number', default: 15, min: 0, max: 500, label: 'Rescue Clout' },
    meowNoise: { type: 'boolean', default: true, label: 'Meows attract creatures' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const CATS = [
      { id: 'cat_keyboard', name: 'Keyboard Cat', fur: 0xd99a55, belly: 0xf4e3cc, eye: 0x6fd46a, value: [45, 80], extra: 'shirt' },
      { id: 'cat_grumpy', name: 'Grumpy Cat', fur: 0xd8c7a8, belly: 0x5b4636, eye: 0x6aa7ff, value: [55, 95], extra: 'grumpy' },
      { id: 'cat_long', name: 'Longcat', fur: 0xf5f5f0, belly: 0xffffff, eye: 0x333333, value: [60, 110], long: 2.4 },
      { id: 'cat_nyan', name: 'Nyan Cat', fur: 0x8f8f96, belly: 0xff9ad8, eye: 0x111111, value: [70, 120], extra: 'poptart' },
      { id: 'cat_ceiling', name: 'Ceiling Cat', fur: 0xffffff, belly: 0xf0e6dc, eye: 0x4f7a3a, value: [40, 75] },
      { id: 'cat_unit', name: 'Absolute Unit', fur: 0xff9a3c, belly: 0xffd9a8, eye: 0x7a9a2a, value: [80, 140], fat: 1.55 },
      { id: 'cat_void', name: 'Void Cat', fur: 0x121216, belly: 0x1b1b22, eye: 0xffe14a, value: [50, 100] },
    ];
    const IDS = new Set(CATS.map((c) => c.id));

    // ------------------------------------------------------------------ model
    function catModel(T, c) {
      const root = new T.Group();
      const lam = (col) => new T.MeshLambertMaterial({ color: col, flatShading: true });
      const fur = lam(c.fur), belly = lam(c.belly), pink = lam(0xff9fb0);
      const eyeM = new T.MeshBasicMaterial({ color: c.eye });
      const box = (w, h, d, m, x, y, z, parent = root) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
      const L = 0.34 * (c.long || 1), W = 0.17 * (c.fat || 1), H = 0.16 * (c.fat || 1);
      const legY = 0.06;
      // legs
      for (const [x, z] of [[-L * 0.35, W * 0.32], [-L * 0.35, -W * 0.32], [L * 0.35, W * 0.32], [L * 0.35, -W * 0.32]]) box(0.05, 0.12, 0.05, fur, x, legY, z);
      // body + belly patch
      box(L, H, W, fur, 0, 0.12 + H / 2, 0);
      box(L * 0.7, 0.02, W * 0.8, belly, 0, 0.12 + 0.01, 0);
      // head
      const head = new T.Group(); head.position.set(L / 2 + 0.07, 0.12 + H * 0.95, 0); root.add(head);
      box(0.16, 0.14, 0.17, fur, 0, 0, 0, head);
      box(0.05, 0.05, 0.1, belly, 0.08, -0.03, 0, head);     // muzzle
      box(0.015, 0.02, 0.02, pink, 0.105, -0.005, 0, head);  // nose
      for (const s of [1, -1]) {
        const ear = new T.Mesh(new T.ConeGeometry(0.035, 0.07, 4), fur); ear.position.set(-0.01, 0.09, s * 0.05); head.add(ear);
        box(0.02, 0.028, 0.028, eyeM, 0.081, 0.02, s * 0.042, head);
      }
      if (c.extra === 'grumpy') box(0.012, 0.012, 0.08, lam(0x2a2018), 0.082, 0.05, 0, head);   // frown brow
      // tail
      const tail = new T.Group(); tail.position.set(-L / 2, 0.12 + H * 0.8, 0); root.add(tail);
      const tl = box(0.035, 0.035, 0.2, fur, 0, 0.07, 0, tail); tl.rotation.x = Math.PI / 2 - 0.5; tl.position.set(-0.05, 0.08, 0);
      if (c.extra === 'shirt') box(L * 0.55, H * 0.6, W + 0.01, lam(0x3a7ad8), L * 0.08, 0.12 + H * 0.55, 0);
      if (c.extra === 'poptart') {
        box(L * 0.9, H + 0.02, W + 0.02, lam(0xf2c792), 0, 0.12 + H / 2, 0);
        box(L * 0.8, 0.01, W * 0.85, lam(0xff7ad0), 0, 0.12 + H + 0.012, 0);
        const rb = [0xff3030, 0xff9a2a, 0xffee33, 0x33dd55, 0x3399ff, 0x8844ff];
        rb.forEach((col, i) => box(0.12, 0.018, W * 0.9, new T.MeshBasicMaterial({ color: col }), -L / 2 - 0.07, 0.14 + i * 0.022, 0));
      }
      root.userData.tail = tail;
      root.userData.head = head;
      return root;
    }

    for (const c of CATS) {
      api.registerItem({ id: c.id, name: c.name, kind: 'scrap', value: c.value, weight: c.fat ? 16 : 9, hands: 1, cat: true },
        { model: (T) => catModel(T, c) });
    }

    // ------------------------------------------------------------------ sounds (procedural)
    const meow = (f0, dur, bright) => (sr) => {
      const n = Math.floor(sr * dur), out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, u = t / dur;
        const f = f0 * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.25))) * (1 - 0.18 * u);
        ph += (2 * Math.PI * f) / sr;
        const vowel = Math.sin(Math.PI * Math.min(1, u * 1.1));           // "m-e-o-w": brightest in the middle
        const env = Math.min(1, t / 0.035) * Math.pow(1 - u, 0.9);
        const s = Math.sin(ph) * 0.55 + Math.sin(2 * ph) * (0.18 + 0.3 * vowel) * bright + Math.sin(3 * ph) * 0.16 * vowel * bright + Math.sin(4 * ph) * 0.07 * vowel;
        out[i] = s * env * 0.6;
      }
      return out;
    };
    api.registerSound('tfg_meow_1', meow(560, 0.55, 1));
    api.registerSound('tfg_meow_2', meow(700, 0.42, 1.2));
    api.registerSound('tfg_meow_3', meow(460, 0.75, 0.8));
    api.registerSound('tfg_meow_4', meow(820, 0.3, 1.3));
    api.registerSound('tfg_purr', (sr) => {
      const dur = 1.4, n = Math.floor(sr * dur), out = new Float32Array(n);
      let lp = 0, seed = 7;
      for (let i = 0; i < n; i++) {
        seed = (seed * 16807) % 2147483647;
        const w = (seed / 2147483647) * 2 - 1;
        lp += (w - lp) * 0.06;
        const t = i / sr;
        const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 24 * t);
        const env = Math.min(1, t / 0.15) * Math.min(1, (dur - t) / 0.3);
        out[i] = lp * am * env * 1.8;
      }
      return out;
    });
    const meowAt = (game, it, vol = 0.8) => api.playSound('tfg_meow_' + (1 + Math.floor(Math.random() * 4)), { follow: it.obj, volume: vol, pitch: 0.9 + Math.random() * 0.25, occlude: true, refDistance: 2.5, maxDistance: 32 });

    // ------------------------------------------------------------------ host: spawn, hop, rescue
    api.on('moonPopulated', (game) => {
      const fac = game.world.facility;
      if (!fac?.scrapSpots?.length) return;
      const max = Math.max(0, Math.min(6, Math.round(num(cfg.maxCats, 2))));
      if (!max) return;
      let n = Math.random() < 0.85 ? 1 : 0;
      for (let k = 1; k < max; k++) if (Math.random() < 0.35) n++;
      const spots = fac.scrapSpots.filter((s) => (s.dist ?? 3) >= 2);
      const pool = spots.length ? spots : fac.scrapSpots;
      for (let i = 0; i < n; i++) {
        const s = pool[Math.floor(Math.random() * pool.length)];
        const c = CATS[Math.floor(Math.random() * CATS.length)];
        game.items.hostSpawn(c.id, new THREE.Vector3(s.x + (Math.random() - 0.5) * 0.6, s.y + 0.45, s.z + (Math.random() - 0.5) * 0.6), { valueMul: 1 + (game.run?.quotaIndex || 0) * 0.06 });
      }
    });

    const rewarded = new Set();
    let hostT = 0;
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    function hostTick(game, dt) {
      hostT -= dt;
      if (hostT > 0) return;
      hostT = 0.5;
      const run = game.run;
      if (!run || run.phase !== 'moon') return;
      const hd = game.hostData;
      const players = game.aiPlayers();
      for (const it of game.items.all()) {
        if (!IDS.has(it.type)) continue;
        // rescue: secured in the ship TODAY (host marks collected scrap in hostData.collected)
        if (hd?.collected?.has(it.id) && !rewarded.has(it.id)) {
          rewarded.add(it.id);
          const who = it.lastHolder || null;
          const name = who ? game.playerName(who) : 'The crew';
          game.net.broadcast('sys', { text: `${it.def.name} was rescued by ${name}!`, kind: 'good' });
          if (who) api.reward(who, num(cfg.rescueXp, 70), num(cfg.rescueClout, 15), `${it.def.name} rescued`);
          api.send({ k: 'tfg-cat', id: it.id, e: 'rescued' });
          api.emit('tfg:catRescued', { itemId: it.id, type: it.type, by: who }, game);
          continue;
        }
        if (it.state !== 'world' || !it.body || !it.isSimulatedHere() || api.insideShip(it.obj.position)) continue;
        it.tfgCatT = (it.tfgCatT ?? 2 + Math.random() * 6) - 0.5;
        if (it.tfgCatT > 0) continue;
        it.tfgCatT = 6 + Math.random() * 9;
        // meow (everyone hears it; creatures too)
        api.send({ k: 'tfg-cat', id: it.id, e: 'meow' });
        if (cfg.meowNoise) game.creatures.noise(it.obj.position, 0.55);
        // hop somewhere unless someone is right next to it (so it can be picked up)
        const near = players.some((p) => !p.dead && p.pos.distanceTo(it.obj.position) < 2.2);
        if (near || Math.random() < 0.3) continue;
        const a = Math.random() * Math.PI * 2;
        const dx = Math.sin(a), dz = Math.cos(a);
        q.setFromAxisAngle(up, Math.atan2(-dz, dx));   // the model faces +X
        it.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        it.body.setLinvel({ x: dx * 1.9, y: 2.7, z: dz * 1.9 }, true);
      }
    }

    // ------------------------------------------------------------------ everyone: sounds, purring, tail wag
    let purrT = 3, wag = 0;
    api.on('update', (dt, game) => {
      if (game.isHost) hostTick(game, dt);
      wag += dt;
      // tail wag / head tilt on visible cats (cheap: a handful of items at most)
      for (const it of game.items.all()) {
        if (!IDS.has(it.type) || it.state !== 'world') continue;
        const inner = it.obj.userData.inner;
        const tail = inner?.userData?.tail;
        if (tail) tail.rotation.y = Math.sin(wag * 3 + (it.tfgPh ??= Math.random() * 6)) * 0.45;
      }
      const held = game.player.heldItem?.();
      if (held && IDS.has(held.type) && !game.player.dead) {
        purrT -= dt;
        if (purrT <= 0) { purrT = 4 + Math.random() * 5; api.playSound(Math.random() < 0.7 ? 'tfg_purr' : 'tfg_meow_' + (1 + Math.floor(Math.random() * 4)), { volume: 0.35, bus: 'sfx', pitch: 0.95 + Math.random() * 0.1 }); }
      }
    });

    api.on('message', (d) => {
      const game = api.game;
      if (!game || d?.k !== 'tfg-cat') return;
      const it = game.items.get(d.id);
      if (!it || !IDS.has(it.type)) return;
      if (d.e === 'meow') { if (it.state === 'world') meowAt(game, it, 0.85); }
      else if (d.e === 'rescued') {
        const pos = it.worldPos(new THREE.Vector3());
        api.playSound('tfg_purr', { pos, volume: 0.7, refDistance: 3 });
        meowAt(game, it, 1);
        game.ui.hud?.floatText(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 'RESCUED! ♥', '#ff9ad8', true);
      }
    });

    api.on('phase', (ph) => { if (ph === 'landing') rewarded.clear(); });
  },
});
