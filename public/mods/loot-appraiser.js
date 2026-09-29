// loot-appraiser - loot-value scanner tweak (ShipLoot / scan tweaks family). The scanner only ever showed loot you point at.
// /appraise (or terminal APPRAISE) asks The Algorithm for the loose scrap left on this moon: how many pieces and roughly how
// much they are worth. The Algorithm is a liar, so the total is blurred by +-15% (config: exact). Cooldown 20 s.
KefalAPI.defineMod({
  id: 'loot-appraiser',
  name: 'Loot Appraiser',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'ShipLoot + scan tweaks',
  builtin: true,
  scope: 'local',
  category: 'qol',
  enabledByDefault: true,
  description: 'Type /appraise (or APPRAISE on the terminal) on a moon: the Algorithm estimates how much loose scrap is left, blurred by 15%. Exact mode in settings.',
  config: {
    exact: { type: 'boolean', default: false, label: 'Exact numbers (no Algorithm blur)' },
    cooldown: { type: 'number', default: 20, min: 0, max: 120, label: 'Cooldown (s)' },
  },
  init(api, cfg) {
    const t = api.t, tf = api.tf;
    let next = 0;
    function appraise(game, say) {
      const run = game.run;
      if (!run || run.phase !== 'moon') { say(t('Nothing to appraise. Land on a moon first.')); return; }
      const now = performance.now() / 1000;
      if (now < next) { say(tf('The Algorithm is busy. Ask again in {s}s.', { s: Math.ceil(next - now) })); return; }
      next = now + Math.max(0, Number(cfg.cooldown) || 0);
      let n = 0, sum = 0, best = 0;
      for (const it of game.items.all()) {
        if (it.state !== 'world' || it.soulbound || it.type === 'body' || !it.value || !api.isSellable(it.def) || api.insideShip(it.obj.position)) continue;
        n++; sum += it.value; if (it.value > best) best = it.value;
      }
      if (!n) { say(t('The moon is picked clean. Go home.')); return; }
      const rng = new api.RNG('appraise:' + (run.seed ?? 0) + ':' + (run.day ?? 0));
      const k = cfg.exact ? 1 : 0.85 + rng.next() * 0.3;
      const cnt = cfg.exact ? n : Math.max(1, n + Math.round((rng.next() - 0.5) * 2));
      say(tf('APPRAISAL: about {n} pieces of loose scrap, roughly {v} Credits. Best piece: {b}.', { n: cnt, v: Math.round(sum * k / 10) * 10, b: Math.round(best * k / 5) * 5 }));
      game.sfx?.('ui_confirm', 0.4);
      game.cosm5?.bump?.('appraised');
    }
    api.registerChatCommand('appraise', (args, game) => appraise(game, (s) => game.ui.toast(s, 'info')));
    api.registerCommand('appraise', (rest, term, game) => appraise(game, (s) => term.print(s)), 'estimate the loose scrap left on the moon');
  },
});
