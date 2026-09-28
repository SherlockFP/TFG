// infinite-sprint — never run out of breath (or, in "boosted" mode, just a lot less often).
// Personal: affects only your own stamina.
KefalAPI.defineMod({
  id: 'infinite-sprint',
  name: 'Infinite Sprint',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'InfiniteSprint / BetterStamina',
  enabledByDefault: false,
  cheat: true,
  description: 'Sprint forever. "Boosted" mode instead gives +75% stamina and 2.5× regeneration (BetterStamina-style).',
  config: {
    mode: { type: 'select', options: ['infinite', 'boosted'], default: 'infinite', label: 'Mode' },
  },
  init(api, cfg) {
    const infinite = cfg.mode !== 'boosted';
    api.on('configure', (config, game) => { game.infiniteSprint = infinite; });
    api.on('netReady', (net, game) => { game.infiniteSprint = infinite; });
    api.on('stats', (s) => {
      if (infinite) return;
      s.maxStamina = Math.round(s.maxStamina * 1.75);
      s.staminaRegen *= 2.5;
    });
  },
});
