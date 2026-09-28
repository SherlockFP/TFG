// sell-bodies — port of SellBodies / SellBodiesFixed.
// TFG built-in feature (crew switch). Killed creatures leave a carcass you can haul back (grab beam
// for the big ones, pocket for the small ones) and sell at 0-Algorithm HQ. Value scales with the
// creature's HP, level and elite status. Bosses, hazards and huge things never leave one.
// Host: wraps game.hostOnCreatureKilled; ~1.8 s after the death animation the creature view is
// replaced by a 'corpse_<type>' item. Item defs are registered at boot for every eligible creature
// (base game + content mods), so saves with carcasses on the ship always load.
KefalAPI.defineMod({
  id: 'sell-bodies',
  name: 'Sell Bodies',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'SellBodies / SellBodiesFixed',
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Killed creatures leave a carcass worth Credits at HQ. Small ones fit in a pocket, big ones need the grab beam. Hunting finally pays.',
  config: {
    valueMul: { type: 'number', default: 1, min: 0.1, max: 5, step: 0.1, label: 'Carcass value multiplier' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const NEVER = new Set(['giant', 'sandkefal', 'web', 'mimicdoor', 'mannequin', 'sludge', 'jester', 'turret', 'mine', 'stalker']);
    const baseValue = (def) => Math.round(10 + (def.hp || 0) * 0.3);
    const eligible = (type, def) => !!def && def.hp && !def.hazard && !def.boss && !NEVER.has(type) && (def.height || 1) <= 3.2;

    function corpseModel(T, type, def) {
      const root = new T.Group();
      let body = null;
      try {
        const custom = window.__kefalMods?.creatureModels?.get(type);
        const m = custom ? custom(T, { seed: 7 }) : api.createCreatureModel(def.model || type, { seed: 7 });
        try { m.update?.(0, { state: 'idle', t: 0, time: 0, speed: 0 }); } catch { /* pose is optional */ }
        body = m.root;
        if (def.modelScale) body.scale.setScalar(def.modelScale);
        // hidden helpers (aura / telegraph effects), sprites and lights would blow up the physics box
        const junk = [];
        body.traverse((o) => { if (o !== body && (o.visible === false || o.isSprite || o.isLight || o.isPoints)) junk.push(o); });
        for (const o of junk) o.removeFromParent();
      } catch {
        body = new T.Mesh(new T.BoxGeometry((def.radius || 0.5) * 2, (def.height || 1) * 0.5, 0.5), new T.MeshLambertMaterial({ color: 0x3a2020 }));
      }
      body.rotation.set(0, 0, 0);
      const tip = new T.Group();
      tip.add(body);
      {
        const sz = new T.Box3().setFromObject(body).getSize(new T.Vector3());
        // tall things (humanoids) fall on their back, low wide things (bugs, dogs) end up legs in the air
        if (sz.y > Math.max(sz.x, sz.z) * 0.9) tip.rotation.x = -Math.PI / 2;
        else tip.rotation.z = Math.PI;
      }
      root.add(tip);
      // yellow "REPORTED" takedown tag so carcasses read as loot at a glance
      const tag = new T.Mesh(new T.BoxGeometry(0.16, 0.1, 0.02), new T.MeshBasicMaterial({ color: 0xffd23f }));
      const bb = new T.Box3().setFromObject(root);
      tag.position.set(bb.max.x - 0.05, bb.max.y + 0.02, (bb.min.z + bb.max.z) / 2);
      tag.rotation.x = -Math.PI / 2;
      root.add(tag);
      return root;
    }

    const registered = new Set();
    function registerAll() {
      for (const [type, def] of Object.entries(api.CREATURES)) {
        const id = 'corpse_' + type;
        if (registered.has(id) || !eligible(type, def)) continue;
        registered.add(id);
        const v = baseValue(def);
        const small = (def.height || 1) < 0.7;
        api.registerItem({
          id, name: `${def.name} Carcass`, kind: small ? 'scrap' : 'big', value: [Math.round(v * 0.8), Math.round(v * 1.2)],
          weight: Math.round(Math.max(small ? 6 : 18, Math.min(75, def.hp * 0.25))), hands: small ? 1 : 2, carcass: type,
        }, { model: (T) => corpseModel(T, type, def) });
      }
    }
    registerAll();                                   // base creatures
    api.on('boot', () => registerAll());             // + creatures added by other mods / features at init

    api.on('netReady', (net, game) => {
      registerAll();                                 // + creatures registered while the Game was built (bosses etc.)
      const orig = game.hostOnCreatureKilled;
      game.hostOnCreatureKilled = function (c, by) {
        const r = orig?.call(this, c, by);
        try { if (api.enabled() && this.isHost) scheduleCorpse(this, c); } catch (e) { console.warn('[sell-bodies]', e); }
        return r;
      };
    });

    function scheduleCorpse(game, c) {
      const id = 'corpse_' + c.type;
      if (!registered.has(id) || !api.ITEMS[id]) return;
      const def = c.def || api.CREATURES[c.type];
      const run = game.run || {};
      const mul = Math.max(0.1, Number(cfg.valueMul) || 1);
      const value = Math.max(5, Math.round(baseValue(def) * (1 + 0.1 * ((c.level || 1) - 1)) * (c.elite ? 1.8 : 1)
        * (1 + (run.quotaIndex || 0) * 0.05) * (0.85 + Math.random() * 0.3) * mul));
      const pos = c.pos.clone();
      const yaw = c.yaw || 0;
      game.later(() => {
        if (game.run?.phase !== 'moon') return;
        if (game.creatures.host.get(c.id) === c) game.creatures.hostRemove(c.id);
        game.items.hostSpawn(id, new THREE.Vector3(pos.x, pos.y + 0.45, pos.z), { value, yaw });
      }, 1800);
    }
  },
});
