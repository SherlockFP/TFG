// lethal-things — port of LethalThings (Evaisa): a themed grab-bag content pack.
// New scrap: Kefal Plushie, Dart Board, Golden Kefal Idol, Stale Simit, Toy Hammer (a squeaky,
// sellable weapon). New store tool: Signal Flare (throw it; red light for 90 s, attracts creatures).
KefalAPI.defineMod({
  id: 'lethal-things',
  name: 'Lethal Things',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'LethalThings',
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Five new scrap items (Kefal Plushie, Dart Board, Golden Kefal Idol, Stale Simit, squeaky Toy Hammer) and a Signal Flare in the terminal store. Everyone should run it (item models).',
  config: {
    spawnMul: { type: 'number', default: 1, min: 0, max: 5, step: 0.25, label: 'Scrap spawn weight multiplier' },
    flarePrice: { type: 'number', default: 12, min: 0, max: 200, label: 'Flare price' },
    flareSeconds: { type: 'number', default: 90, min: 10, max: 600, label: 'Flare burn time (s)' },
  },
  init(api, cfg) {
    const m0 = Number(cfg.spawnMul);
    const mul = Number.isFinite(m0) ? Math.max(0, m0) : 1;
    const W = (w) => (mul > 0 ? Math.max(0.25, w * mul) : 0);
    const lam = (T, c, extra) => new T.MeshLambertMaterial({ color: c, ...(extra || {}) });

    // ---------------------------------------------------------------- models (face +Z, ~real size)
    const models = {
      plushie(T) {
        const g = new T.Group();
        const body = new T.Mesh(new T.SphereGeometry(0.1, 10, 7), lam(T, 0x8fa9bd)); body.scale.set(1, 0.9, 2.1); g.add(body);
        const belly = new T.Mesh(new T.SphereGeometry(0.085, 8, 6), lam(T, 0xe8e2d6)); belly.scale.set(0.9, 0.7, 1.9); belly.position.y = -0.03; g.add(belly);
        const tail = new T.Mesh(new T.ConeGeometry(0.09, 0.14, 4), lam(T, 0x6f8aa0)); tail.rotation.x = Math.PI / 2; tail.scale.set(1.3, 1, 0.3); tail.position.z = -0.26; g.add(tail);
        const fin = new T.Mesh(new T.ConeGeometry(0.05, 0.08, 3), lam(T, 0x6f8aa0)); fin.position.set(0, 0.1, -0.02); g.add(fin);
        for (const x of [-0.06, 0.06]) { const e = new T.Mesh(new T.SphereGeometry(0.018, 6, 4), new T.MeshBasicMaterial({ color: 0x111111 })); e.position.set(x, 0.03, 0.17); g.add(e); }
        return g;
      },
      dartboard(T) {
        const g = new T.Group();
        const rings = [[0.26, 0x1a1a1a], [0.21, 0xe8dcc0], [0.17, 0xb3262a], [0.12, 0xe8dcc0], [0.08, 0x2f7a3a], [0.03, 0xb3262a]];
        rings.forEach(([r, c], i) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, 0.035 + i * 0.003, 20), lam(T, c)); m.rotation.x = Math.PI / 2; g.add(m); });
        for (let k = 0; k < 3; k++) {
          const dart = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.12, 4), lam(T, 0xd9c14a));
          dart.rotation.x = Math.PI / 2; dart.position.set(-0.07 + k * 0.06, 0.05 - k * 0.04, 0.08); g.add(dart);
        }
        return g;
      },
      goldidol(T) {
        const g = new T.Group();
        const gold = lam(T, 0xe0b83a, { emissive: 0x4a3505 });
        const base = new T.Mesh(new T.BoxGeometry(0.3, 0.1, 0.3), lam(T, 0x3b2a1a)); base.position.y = 0.05; g.add(base);
        const ped = new T.Mesh(new T.CylinderGeometry(0.06, 0.09, 0.14, 6), gold); ped.position.y = 0.17; g.add(ped);
        const fish = new T.Mesh(new T.SphereGeometry(0.1, 10, 7), gold); fish.scale.set(0.8, 1.1, 2.0); fish.position.y = 0.38; fish.rotation.x = -0.5; g.add(fish);
        const tail = new T.Mesh(new T.ConeGeometry(0.09, 0.14, 4), gold); tail.position.set(0, 0.24, -0.16); tail.rotation.x = -2.1; tail.scale.z = 0.3; g.add(tail);
        for (const x of [-0.05, 0.05]) { const e = new T.Mesh(new T.SphereGeometry(0.016, 5, 4), new T.MeshBasicMaterial({ color: 0xff2a2a })); e.position.set(x, 0.48, 0.13); g.add(e); }
        return g;
      },
      simit(T) {
        const g = new T.Group();
        const ring = new T.Mesh(new T.TorusGeometry(0.1, 0.035, 6, 14), lam(T, 0xa4602a)); ring.rotation.x = Math.PI / 2; g.add(ring);
        const seed = lam(T, 0xf0e2b0);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const s = new T.Mesh(new T.BoxGeometry(0.012, 0.006, 0.02), seed);
          s.position.set(Math.cos(a) * 0.1, 0.034, Math.sin(a) * 0.1); s.rotation.y = -a; g.add(s);
        }
        return g;
      },
      toyhammer(T) {
        const g = new T.Group();
        const handle = new T.Mesh(new T.CylinderGeometry(0.02, 0.022, 0.34, 6), lam(T, 0xf2c230)); handle.position.y = 0.17; g.add(handle);
        const head = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.2, 10), lam(T, 0xd8302a)); head.rotation.z = Math.PI / 2; head.position.y = 0.36; g.add(head);
        for (const x of [-0.105, 0.105]) { const cap = new T.Mesh(new T.CylinderGeometry(0.058, 0.058, 0.03, 10), lam(T, 0x3a7fd0)); cap.rotation.z = Math.PI / 2; cap.position.set(x, 0.36, 0); g.add(cap); }
        return g;
      },
      flare(T) {
        const g = new T.Group();
        const stick = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.24, 8), lam(T, 0xc0201a)); stick.position.y = 0.12; g.add(stick);
        const cap = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.04, 8), lam(T, 0x222222)); cap.position.y = 0.26; g.add(cap);
        const band = new T.Mesh(new T.CylinderGeometry(0.0235, 0.0235, 0.03, 8), lam(T, 0xf0f0f0)); band.position.y = 0.06; g.add(band);
        return g;
      },
    };

    // ---------------------------------------------------------------- registry
    api.registerItem({ id: 'plushie', name: 'Kefal Plushie', kind: 'scrap', value: [28, 64], weight: 1, hands: 1, use: 'noise', useSound: 'squeak', noise: 0.4 }, { scrapWeight: W(5), model: models.plushie });
    api.registerItem({ id: 'dartboard', name: 'Dart Board', kind: 'scrap', value: [36, 72], weight: 8, hands: 1 }, { scrapWeight: W(4), model: models.dartboard });
    api.registerItem({ id: 'goldidol', name: 'Golden Kefal Idol', kind: 'scrap', value: [150, 280], weight: 32, hands: 2 }, { scrapWeight: W(1), model: models.goldidol });
    api.registerItem({ id: 'simit', name: 'Stale Simit', kind: 'scrap', value: [6, 18], weight: 1, hands: 1 }, { scrapWeight: W(6), model: models.simit });
    api.registerItem({ id: 'toyhammer', name: 'Toy Hammer', kind: 'weapon', value: [18, 42], price: 0, weight: 3, hands: 1, dmg: 6, cd: 0.4, reach: 2.0, rarity: 'common' }, { scrapWeight: W(3), model: models.toyhammer });
    api.registerItem({ id: 'flare', name: 'Signal Flare', kind: 'tool', price: Math.round(Number(cfg.flarePrice) || 12), weight: 1, hands: 1, throwable: true }, { store: true, model: models.flare });

    // ---------------------------------------------------------------- behavior (every client)
    const burning = new Set();
    api.on('netReady', (net, game) => {
      burning.clear();
      const origUse = game.useHeldPress;
      game.useHeldPress = function () {
        const it = this.player.heldItem();
        if (it?.type === 'flare') {
          if (it.kmodBurnt) { this.ui.toast('This flare is spent.'); this.dropItem(it, true); return; }
          if (!it.on) {
            this.sfx('glowstick_crack', 0.9, 0.7);
            this.setItemOn(it, true);
            this.net.request('noise', { p: this.player.eyePos().toArray(), loud: 1.3 });
          }
          this.dropItem(it, true);
          return;
        }
        if (it?.type === 'toyhammer') {
          const ready = this.time >= (this.nextSwing || 0);
          origUse.call(this);
          if (ready) { this.sfx('squeak', 0.9, 0.7 + Math.random() * 0.6); this.net.broadcast('fx', { k: 'snd', s: 'squeak', p: this.player.eyePos().toArray(), v: 0.7, r: 3 }); }
          return;
        }
        return origUse.call(this);
      };
      const origState = game.onItemState;
      game.onItemState = function (it) {
        if (it?.type === 'flare') {
          if (it.on && !it.glow && !it.kmodBurnt) {
            it.glow = this.lights.add({ pos: it.obj.getWorldPosition(new api.THREE.Vector3()), color: 0xff3a20, intensity: 1.8, distance: 13, group: 'items', flicker: 0.25 });
            it.kmodBurnEnd = this.time + (Number(cfg.flareSeconds) || 90);
            it.kmodHiss = this.audio.play('steam_hiss', { follow: it.obj, loop: true, volume: 0.25, refDistance: 2, maxDistance: 20, occlude: true });
            burning.add(it);
          }
          return;
        }
        return origState.call(this, it);
      };
    });

    function extinguish(game, it) {
      if (it.glow) game.lights.remove(it.glow);
      it.glow = null;
      it.kmodHiss?.stop(0.5); it.kmodHiss = null;
      it.kmodBurnt = true;
      burning.delete(it);
    }
    api.on('update', (dt, game) => {
      if (!burning.size) return;
      for (const it of [...burning]) {
        if (game.items.get(it.id) !== it) { extinguish(game, it); continue; }
        const left = (it.kmodBurnEnd || 0) - game.time;
        if (left <= 0) { extinguish(game, it); continue; }
        if (it.glow) it.glow.intensity = 1.8 * Math.min(1, left / 8);
      }
    });
  },
});
