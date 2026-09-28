// big-heads — the classic silly mod: every crewmate gets a comically large helmet.
// Purely visual and local. Mimics get big heads too (so they stay convincing) unless you turn that off.
KefalAPI.defineMod({
  id: 'big-heads',
  name: 'Big Heads',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'BigHeads / Bobblehead mods',
  enabledByDefault: false,
  cheat: true,
  description: 'Crewmates get comically huge heads (visual, local). Mimics too, so they are not given away... or are they?',
  config: {
    scale: { type: 'number', default: 2, min: 1, max: 4, step: 0.1, label: 'Head scale' },
    bobble: { type: 'boolean', default: true, label: 'Bobblehead wobble' },
    mimics: { type: 'boolean', default: true, label: 'Mimics get big heads too' },
  },
  init(api, cfg) {
    const S = Math.max(1, Math.min(4, Number(cfg.scale) || 2));
    api.on('configure', (config) => { config.bigHeads = true; });
    api.on('update', (dt, game) => {
      const t = game.time;
      for (const r of game.remotes.values()) {
        const head = r.avatar?.parts?.head;
        if (!head) continue;
        head.scale.setScalar(S);
        if (cfg.bobble) head.rotation.z += Math.sin(t * 7 + (r.id.charCodeAt(0) || 0)) * 0.07;
        if (r.tag) r.tag.position.y = 2.15 + (S - 1) * 0.33;
      }
      if (!cfg.mimics) return;
      for (const v of game.creatures.views.values()) {
        if (v.type !== 'mimic') continue;
        const head = v.model?.parts?.head;
        if (head && head !== v.model.root) head.scale.setScalar(S);
      }
    });
  },
});
