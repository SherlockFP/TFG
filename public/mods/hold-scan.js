// Original browser adaptation of the HoldScanButton convenience. Calls native scan; no extra range or loot access.
KefalAPI.defineMod({
  id: 'hold-scan', name: 'Hold Scan', version: '1.0.0', author: 'TFG Modding Team',
  inspiredBy: 'HoldScanButton', builtin: true, scope: 'local', category: 'qol', enabledByDefault: true,
  description: 'Hold the scan button to repeat normal scans. Release to stop; menus pause scanning.',
  config: { interval: { type: 'number', default: 1.8, min: 1.2, max: 4, label: 'Seconds between scans' } },
  init(api, cfg) {
    const interval = Math.max(1.2, Math.min(4, Number(cfg.interval) || 1.8));
    let held = false, wait = interval, mustRelease = false;
    api.on('update', (dt, game) => {
      const input = game.input, down = !!input?.mouseDown?.(2);
      if (!api.enabled() || !input?.enabled || input.isTyping?.() || game.player?.dead || game.player?.downed || game.terminal?.active || game.ui?.panelOpen || game.minigame) {
        held = false; wait = interval; mustRelease = down; return;
      }
      if (!down) { held = false; wait = interval; mustRelease = false; return; }
      if (mustRelease) return;
      if (!held) { held = true; wait = interval; return; } // Initial click belongs to the ordinary action handler.
      wait -= Math.max(0, Number.isFinite(dt) ? dt : 0);
      if (wait > 0) return;
      wait = interval; game.scan?.(); // One call, even after a stall; the native cooldown/range/noise still apply.
    });
    api.on('sessionEnd', () => { held = false; wait = interval; mustRelease = false; });
  },
});
