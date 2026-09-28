// disco-facility — rainbow party lights in the facility, and makes the ship's Disco Ball upgrade
// actually do something. Local visual effect.
KefalAPI.defineMod({
  id: 'disco-facility',
  name: 'Disco Facility',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Disco / RGB lights mods',
  enabledByDefault: false,
  cheat: true,
  description: 'Facility lights cycle through the rainbow (always, or only once the ship\'s Disco Ball upgrade is installed). The Disco Ball also turns the ship into a party. /disco toggles it.',
  config: {
    mode: { type: 'select', options: ['always', 'with Disco Ball upgrade'], default: 'always', label: 'Facility disco' },
    shipParty: { type: 'boolean', default: true, label: 'Disco Ball lights up the ship' },
    speed: { type: 'number', default: 0.25, min: 0.02, max: 2, step: 0.01, label: 'Color cycle speed' },
    strobe: { type: 'boolean', default: false, label: 'Strobe pulse' },
  },
  init(api, cfg) {
    const col = new api.THREE.Color();
    let enabled = true;
    const speed = Number(cfg.speed) || 0.25;

    function paint(list, t, groupFilter) {
      let i = 0;
      for (const e of list) {
        if (groupFilter && e.group !== groupFilter) continue;
        if (e.__discoC === undefined) { e.__discoC = e.color; e.__discoI = e.intensity; }
        col.setHSL((t * speed + i * 0.137) % 1, 1, 0.55);
        e.color = col.getHex();
        if (cfg.strobe) e.intensity = e.__discoI * (0.55 + 0.45 * (Math.sin(t * 8 + i) > 0 ? 1 : 0));
        i++;
      }
    }
    function restore(list) {
      for (const e of list) {
        if (e.__discoC === undefined) continue;
        e.color = e.__discoC; e.intensity = e.__discoI;
        delete e.__discoC; delete e.__discoI;
      }
    }

    api.on('update', (dt, game) => {
      const run = game.run || {};
      const ball = !!run.upgrades?.disco;
      const t = game.time;
      const fac = game.world.facility;
      if (fac?.emitters) {
        const on = enabled && (cfg.mode === 'always' || ball);
        if (on) paint(fac.emitters, t, 'facility'); else restore(fac.emitters);
      }
      const ship = game.ship?.emitters;
      if (game.shipFeatures) { if (ship) restore(ship); return; }
      if (ship) {
        if (enabled && cfg.shipParty && ball) paint(ship, t * 1.6, null); else restore(ship);
      }
    });

    api.registerChatCommand('disco', (args, game) => {
      enabled = !enabled;
      game.ui.toast(enabled ? 'DISCO ON' : 'Disco off.', enabled ? 'good' : 'info');
    });
  },
});
