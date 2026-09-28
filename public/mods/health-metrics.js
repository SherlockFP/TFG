// health-metrics — port of HealthMetrics (matsuura).
// Adds a numeric HP (and stamina) readout under the suit figure in the top-left of the visor.
KefalAPI.defineMod({
  id: 'health-metrics',
  name: 'Health Metrics',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'HealthMetrics',
  builtin: true,
  scope: 'local',
  category: 'hud',
  enabledByDefault: true,
  description: 'Numeric health (and stamina) counter next to the suit figure on your visor, colored by how hurt you are.',
  config: {
    showAsPercent: { type: 'boolean', default: false, label: 'Show health as %' },
    showStamina: { type: 'boolean', default: true, label: 'Show stamina number' },
    colorThresholds: { type: 'boolean', default: true, label: 'Color by health' },
    size: { type: 'select', options: ['small', 'medium', 'large'], default: 'medium', label: 'Text size' },
  },
  init(api, cfg) {
    let box = null, hpEl = null, stEl = null, acc = 0;
    let lastHp = '', lastSt = '', lastCol = '';

    const CSS = `
.kmod-hm { margin-top: 6px; line-height: 1; font-family: var(--font, monospace); letter-spacing: 1px; text-shadow: 0 0 6px rgba(0,0,0,0.9); }
.kmod-hm-small { font-size: 18px; } .kmod-hm-medium { font-size: 24px; } .kmod-hm-large { font-size: 32px; }
.kmod-hm-hp { transition: color 0.3s; }
.kmod-hm-st { font-size: 0.75em; opacity: 0.85; margin-top: 2px; color: #ffe0a0; }
.kmod-hm-hp.crit { animation: kmodHmBlink 0.6s infinite; }
@keyframes kmodHmBlink { 50% { opacity: 0.35; } }`;

    const ensure = (game) => {
      if (box && box.isConnected) return true;
      const hudEl = game.ui?.hud?.el;
      const tl = hudEl?.querySelector('.hud-tl');
      if (!tl) return false;
      if (!document.getElementById('kmod-hm-css')) {
        const s = document.createElement('style');
        s.id = 'kmod-hm-css'; s.textContent = CSS;
        document.head.appendChild(s);
      }
      box = document.createElement('div');
      box.className = 'kmod-hm kmod-hm-' + (cfg.size || 'medium');
      hpEl = document.createElement('div'); hpEl.className = 'kmod-hm-hp';
      stEl = document.createElement('div'); stEl.className = 'kmod-hm-st';
      box.append(hpEl, stEl);
      const stam = tl.querySelector('.hud-stam');
      if (stam) tl.insertBefore(box, stam); else tl.appendChild(box);
      lastHp = lastSt = lastCol = '';
      return true;
    };

    api.on('update', (dt, game) => {
      acc -= dt;
      if (acc > 0) return;
      acc = 0.1;
      if (!ensure(game)) return;
      const p = game.player;
      box.style.display = p.dead ? 'none' : '';
      if (p.dead) return;
      const max = Math.max(1, Math.round(p.maxHp || 100));
      const hp = Math.max(0, Math.round(p.hp));
      const frac = hp / max;
      const hpText = cfg.showAsPercent ? `HP ${Math.round(frac * 100)}%` : `HP ${hp}/${max}`;
      if (hpText !== lastHp) { hpEl.textContent = hpText; lastHp = hpText; }
      const col = !cfg.colorThresholds ? '#ffd9b0' : frac > 0.7 ? '#9dff9d' : frac > 0.4 ? '#ffd24a' : frac > 0.2 ? '#ff8a3d' : '#ff3b30';
      if (col !== lastCol) { hpEl.style.color = col; lastCol = col; }
      hpEl.classList.toggle('crit', frac < 0.2);
      if (cfg.showStamina) {
        const st = `STA ${Math.round(p.stamina)}/${Math.round(p.maxStamina || 100)}`;
        if (st !== lastSt) { stEl.textContent = st; lastSt = st; }
        stEl.style.display = '';
      } else stEl.style.display = 'none';
    });
  },
});
