// hardcore — tougher runs for veteran crews: more (and higher level) creatures, bigger quotas,
// but more XP. Danger / quota apply when you host; the XP bonus is personal.
KefalAPI.defineMod({
  id: 'hardcore',
  name: 'Hardcore',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Brutal Company difficulty presets',
  enabledByDefault: false,
  description: 'Danger ×1.6 (more creatures and hazards), quotas ×1.3, XP ×1.5. Danger and quota are host settings; the XP bonus applies to you.',
  config: {
    dangerMul: { type: 'number', default: 1.6, min: 1, max: 4, step: 0.1, label: 'Danger multiplier' },
    quotaMul: { type: 'number', default: 1.3, min: 1, max: 3, step: 0.1, label: 'Quota multiplier' },
    xpMul: { type: 'number', default: 1.5, min: 1, max: 5, step: 0.1, label: 'XP multiplier' },
    fasterDays: { type: 'boolean', default: false, label: 'Shorter days (20% less time)' },
  },
  init(api, cfg) {
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const danger = Math.max(1, num(cfg.dangerMul, 1.6));
    const quota = Math.max(1, num(cfg.quotaMul, 1.3));
    const xp = Math.max(1, num(cfg.xpMul, 1.5));

    api.on('configure', (config, game) => {
      config.dangerMul = (config.dangerMul || 1) * danger;
      config.quotaMul = (config.quotaMul || 1) * quota;
      if (cfg.fasterDays) config.dayLengthSec = Math.round((config.dayLengthSec || 720) * 0.8);
      game.xpMul = (game.xpMul || 1) * xp;
    });

    // the very first quota of a fresh run is fixed (130); scale it once
    function mark(game, announce) {
      const run = game.run;
      if (!run || run.hardcore) return;
      run.hardcore = true;
      if ((run.quotaIndex || 0) === 0 && (run.sold || 0) === 0) run.quota = Math.round(run.quota * quota);
      game.broadcastRun(['quota', 'hardcore']);
      if (announce) game.ui.toast(`HARDCORE: danger ×${danger}, quota ×${quota}, XP ×${xp}`, 'bad');
    }
    api.on('hostStart', (game) => mark(game, true));
    // after getting fired the host starts a brand-new run object
    api.on('phase', (ph, game) => { if (ph === 'orbit' && game.isHost) mark(game, false); });
  },
});
