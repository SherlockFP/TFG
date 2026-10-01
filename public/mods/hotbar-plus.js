// hotbar-plus — port of HotbarPlus (FlipMods).
// Configurable inventory size (4-8), compact slots, scrap values on slots, carried-loot total and a
// storm warning when you're outside with metal in your pockets. The host's slot count wins.
KefalAPI.defineMod({
  id: 'hotbar-plus',
  name: 'Hotbar Plus',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'HotbarPlus',
  builtin: true,
  scope: 'host',
  category: 'qol',
  enabledByDefault: true,
  description: 'Scrap values on your hotbar slots, total carried value, and a lightning warning when you carry metal outside in a storm. The host can also resize the hotbar (4-8 slots, keys 1-8).',
  config: {
    hotbarSize: { type: 'number', default: 4, min: 4, max: 8, label: 'Hotbar size (host)' },
    showValues: { type: 'boolean', default: true, label: 'Scrap values on slots' },
    showTotal: { type: 'boolean', default: true, label: 'Total carried value' },
    showStormWarning: { type: 'boolean', default: true, label: 'Storm warning' },
  },
  init(api, cfg) {
    const size = Math.max(4, Math.min(8, Math.round(Number(cfg.hotbarSize) || 4)));
    const on = () => (api.enabled ? api.enabled() : true);
    const METAL = ['shovel', 'pipe', 'stopsign', 'sledge', 'bolt', 'axle', 'cog', 'goldbar', 'pot', 'machete'];
    const sellable = (d) => !!d && (['scrap', 'big', 'fish', 'drop'].includes(d.kind) || (!!d.value && d.kind !== 'tool'));

    // relative to the default 4 so it stacks with reserved-slots / perks
    api.on('configure', (config) => { config.inventorySlots = Math.max(1, (config.inventorySlots || 4) + (size - 4)); });

    const CSS = `
.hud-inv.kmod-hb-compact { gap: 5px; }
.hud-inv.kmod-hb-compact .inv-slot { width: 78px; height: 62px; font-size: 16px; }
.hud-inv.kmod-hb-tiny .inv-slot { width: 66px; height: 58px; font-size: 15px; }
.hud-inv .inv-slot .kmod-hb-v { position: absolute; right: 4px; top: 2px; font-size: 14px; color: #ffe08a; opacity: 0.85; }
.hud-inv .kmod-hb-total { position: absolute; left: 0; top: -24px; font-size: 18px; opacity: 0.85; white-space: nowrap; }
.kmod-hb-storm { position: absolute; left: 50%; top: 130px; transform: translateX(-50%); font-size: 24px; color: #ffe14a; border: 1px solid #ffe14a; padding: 0 12px; background: rgba(0,0,0,0.4); animation: kmodHbBlink 0.8s infinite; }
@keyframes kmodHbBlink { 50% { opacity: 0.4; } }`;
    const css = () => { if (!document.getElementById('kmod-hb-css')) { const s = document.createElement('style'); s.id = 'kmod-hb-css'; s.textContent = CSS; document.head.appendChild(s); } };

    api.on('boot', (app) => {
      const hud = app.ui?.hud;
      if (!hud || hud.__kmodHb) return;
      hud.__kmodHb = true;
      css();
      const orig = hud.setInventory.bind(hud);
      hud.setInventory = (items, active) => {
        orig(items, active);
        const inv = hud.$?.inv;
        if (!inv) return;
        const enabled = on();
        for (const [name, wanted] of [['kmod-hb-compact', enabled && items.length > 5], ['kmod-hb-tiny', enabled && items.length > 7]]) {
          if (inv.classList.contains(name) !== wanted) inv.classList[wanted ? 'add' : 'remove'](name);
        }
        const kids = Array.from(inv.children).filter(el => el.classList.contains('inv-slot'));
        const values = [];
        let sum = 0;
        if (enabled) items.forEach((it, i) => {
          if (!it || !it.value || !sellable(it.def) || it.def?.kind === 'weapon') return;
          sum += it.value;
          if (cfg.showValues) values[i] = '▮' + it.value;
        });
        for (let i = 0; i < kids.length; i++) {
          const el = kids[i], labels = Array.from(el.querySelectorAll('.kmod-hb-v'));
          if (values[i]) {
            let label = labels.shift();
            if (!label) { label = document.createElement('div'); label.className = 'kmod-hb-v'; el.appendChild(label); }
            if (label.textContent !== values[i]) label.textContent = values[i];
          }
          for (const label of labels) label.remove();
        }
        const totals = Array.from(inv.children).filter(el => el.classList.contains('kmod-hb-total'));
        if (enabled && cfg.showTotal && sum > 0) {
          let total = totals.shift();
          if (!total) { total = document.createElement('div'); total.className = 'kmod-hb-total'; inv.appendChild(total); }
          const text = `carrying ▮${sum}`;
          if (total.textContent !== text) total.textContent = text;
        }
        for (const total of totals) total.remove();
      };
    });

    let storm = null, acc = 0;
    api.on('update', (dt, game) => {
      acc -= dt;
      if (acc > 0) return;
      acc = 0.25;
      const hudEl = game.ui?.hud?.el;
      if (!hudEl) return;
      css();
      if (!storm || !storm.isConnected) { storm = document.createElement('div'); storm.className = 'kmod-hb-storm'; storm.textContent = '⚡ STORM — you are carrying metal!'; hudEl.appendChild(storm); }
      const p = game.player;
      let metal = false;
      for (const id of p.slots) { const it = id && game.items.get(id); if (it && METAL.includes(it.type)) metal = true; }
      const run = game.run || {};
      const danger = cfg.showStormWarning && metal && !p.dead && run.phase === 'moon' && run.weather === 'stormy' && !p.indoor && !p.inShip;
      storm.style.display = danger ? '' : 'none';
    });
  },
});
