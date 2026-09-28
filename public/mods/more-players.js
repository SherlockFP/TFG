// more-players — port of MoreCompany + BiggerLobby.
// Lifts the 4-player crew cap (host menu offers up to the configured maximum), adds extra ship
// spawn points so big crews don't stack, and a /crew chat command.
KefalAPI.defineMod({
  id: 'more-players',
  name: 'More Players',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'MoreCompany + BiggerLobby',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  description: 'Raise the lobby cap up to 16 crewmates. Pick the size in HOST GAME. Only the host needs it to allow more players, but everyone should have it for spawn points.',
  config: {
    maxPlayers: { type: 'number', default: 8, min: 2, max: 16, label: 'Max players' },
  },
  init(api, cfg) {
    const cap = Math.max(2, Math.min(16, Math.round(Number(cfg.maxPlayers) || 8)));
    // main.js: mods.maxPlayersAllowed = () => mods.maxPlayers || 4  (read by the Host menu)
    if (typeof window !== 'undefined' && window.__kefalMods) window.__kefalMods.maxPlayers = cap;

    api.on('configure', (config, game) => {
      if (game.opts?.host) config.maxPlayers = Math.max(2, Math.min(cap, config.maxPlayers || 4));
    });

    // extra spawn points on the ship floor (the base ship has 8)
    api.on('netReady', (net, game) => {
      const sp = game.ship?.spawns;
      if (!sp || !sp.length || sp.length >= cap) return;
      const V = api.THREE.Vector3;
      const y = sp[0].y;
      const extra = [];
      for (let z = -2.2; z <= 2.2; z += 1.1) for (let x = -5.5; x <= 5.5; x += 1.1) extra.push(new V(x, y, z));
      extra.sort(() => Math.random() - 0.5);
      for (const p of extra) {
        if (sp.length >= cap) break;
        if (sp.every((q) => q.distanceTo(p) > 0.9)) sp.push(p);
      }
    });

    api.registerChatCommand('crew', (args, game) => {
      const names = [game.profile.name, ...[...game.remotes.values()].map((r) => r.name + (r.dead ? ' †' : ''))];
      game.ui.chatMessage(null, `Crew ${names.length}/${game.config.maxPlayers}: ${names.join(', ')}`, false, 'info');
    });
  },
});
