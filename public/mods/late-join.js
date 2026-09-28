// late-join — port of LateCompany (anormaltwig) / VeryLateCompany.
// TFG built-in feature (crew switch, host decides).
//  ON  (default): crewmates can join while the ship is landed on a moon, at HQ, landing or taking off.
//                 They get the full world sync from the host plus: lit items re-applied (flares,
//                 glowsticks, boomboxes), a shift briefing, and the crew is told who dropped in.
//  OFF: vanilla Lethal Company - the lobby only accepts players while the ship is in orbit
//       (the check is ModManager.gateJoin, called by the host before any world data is sent).
KefalAPI.defineMod({
  id: 'late-join',
  name: 'Late Join',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'LateCompany + VeryLateCompany',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  description: 'Friends can join the lobby mid-shift (on a moon, at HQ, during landing). Late joiners get a full world sync and a shift briefing. Off = players can only join while the ship is in orbit.',
  config: {
    briefing: { type: 'boolean', default: true, label: 'Shift briefing for late joiners' },
  },
  init(api, cfg) {
    const clock = (min) => {
      const m = Math.max(0, Math.round(min || 480));
      let h = Math.floor(m / 60) % 24; const mm = String(m % 60).padStart(2, '0');
      const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
      return `${h}:${mm} ${ap}`;
    };

    function briefing(game) {
      const run = game.run;
      if (!run || !game.net) return;
      const moon = api.MOONS[run.moon];
      const crew = [...game.remotes.values()];
      const alive = crew.filter((r) => !r.dead).length;
      const phaseTxt = { moon: 'ON THE SURFACE', company: 'DOCKED AT HQ', landing: 'LANDING', takeoff: 'TAKING OFF' }[run.phase] || run.phase.toUpperCase();
      game.ui.hud?.bigText('LATE SHIFT', `${moon?.name || run.moon} · ${phaseTxt}`);
      const lines = [];
      if (run.phase === 'moon') lines.push(`It is ${clock(run.time)}. The ship leaves at midnight.`);
      lines.push(`Quota ▮${run.sold || 0} / ▮${run.quota || 0} · ${run.daysLeft} day${run.daysLeft === 1 ? '' : 's'} left · ${alive}/${crew.length} crewmates alive.`);
      if (run.phase === 'moon' && run.dailyEvent?.name) lines.push(`Today: ${run.dailyEvent.name} - ${run.dailyEvent.desc || ''}`);
      if (run.phase === 'moon') lines.push('You spawned in the ship. Grab a flashlight from the cupboard and catch up with your crew.');
      lines.forEach((l, i) => setTimeout(() => { if (api.game === game) game.ui.toast(l, 'info'); }, 900 + i * 2600));
    }

    // client side: after the welcome (full-state sync)
    api.on('netReady', (net, game) => {
      game.on('joined', () => {
        if (!api.enabled()) return;
        // item runtime effects are not part of the spawn event: re-apply them (lit flares / glowsticks,
        // playing boomboxes) so a late joiner sees and hears the same world as everyone else
        for (const it of game.items.all()) {
          if (!it.on) continue;
          try { game.onItemState(it); } catch (e) { console.warn('[late-join] item state', it.type, e); }
        }
        const ph = game.run?.phase;
        if (cfg.briefing && ph && ph !== 'orbit' && ph !== 'fired') setTimeout(() => { if (api.game === game) briefing(game); }, 1200);
      });
    });

    // host side: tell the crew
    api.on('playerJoin', (id, info, game) => {
      const ph = game.run?.phase;
      if (!ph || ph === 'orbit' || ph === 'fired') return;
      const where = api.MOONS[game.run.moon]?.name || 'the moon';
      game.net.broadcast('sys', { text: `${info?.name || 'A crewmate'} dropped in late on ${where}. They spawn in the ship.`, kind: 'info' });
    });
  },
});
