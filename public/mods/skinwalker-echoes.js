// skinwalker-echoes — port of Skinwalkers (RugbugRedfern) + Mirage (qwbarch).
// The game already records short clips of every crewmate's proximity voice (for the Mimic).
// With this mod, other creatures lurking near the crew replay those clips from the dark.
KefalAPI.defineMod({
  id: 'skinwalker-echoes',
  name: 'Skinwalker Echoes',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Skinwalkers + Mirage',
  builtin: true,
  scope: 'host',
  category: 'horror',
  enabledByDefault: true,
  description: 'Lurkers, Music Boxes, Spiders, Hounds and friends replay recorded clips of your crewmates\' voices to lure you in. Host-driven; needs voice chat for real clips (falls back to eerie mumbles).',
  config: {
    creatures: { type: 'select', options: ['stalkers (lurker, jester, spider, hound, screamer)', 'all creatures', 'lurker + jester only'], default: 'stalkers (lurker, jester, spider, hound, screamer)', label: 'Who talks' },
    interval: { type: 'number', default: 40, min: 8, max: 240, label: 'Avg seconds between echoes (per creature)' },
    range: { type: 'number', default: 28, min: 8, max: 80, label: 'Max distance to crew (m)' },
    sharedVoice: { type: 'boolean', default: false, label: 'Mirage mode: one borrowed voice per day' },
    recordMore: { type: 'boolean', default: true, label: 'Record voice clips more often' },
  },
  init(api, cfg) {
    const NEVER = new Set(['mimic', 'turret', 'mine', 'web', 'mimicdoor', 'sandkefal']); // mimic already talks on its own
    const SETS = {
      'stalkers (lurker, jester, spider, hound, screamer)': new Set(['lurker', 'jester', 'spider', 'hound', 'screamer', 'kefalshark', 'skeleton']),
      'lurker + jester only': new Set(['lurker', 'jester']),
    };
    const allowed = (type) => {
      if (NEVER.has(type)) return false;
      const set = SETS[cfg.creatures];
      if (!set) return !api.CREATURES[type]?.hazard;
      return set.has(type);
    };
    const interval = Math.max(8, Number(cfg.interval) || 40);
    const range = Math.max(8, Number(cfg.range) || 28);
    let borrowed = null;   // Mirage: peer id whose voice everybody hears today

    api.on('moonPopulated', (game) => {
      if (!cfg.sharedVoice) { borrowed = null; return; }
      const ids = [game.selfId, ...game.remotes.keys()].filter(Boolean);
      borrowed = ids[Math.floor(Math.random() * ids.length)] || null;
    });

    let scanT = 0;
    api.on('update', (dt, game) => {
      // clients & host: shorten the voice recorder cooldown so creatures have fresh material
      const v = game.voice;
      if (cfg.recordMore && v && v.recMime && v.clipTimer > 12) v.clipTimer = 12;
      if (!game.isHost) return;
      const ph = game.run?.phase;
      if (ph !== 'moon') return;
      scanT -= dt;
      if (scanT > 0) return;
      scanT = 0.5;
      const players = game.aiPlayers().filter((p) => !p.dead && !p.inShip);
      if (!players.length) return;
      for (const c of game.creatures.host.values()) {
        if (c.dead || !allowed(c.type)) continue;
        if (c.echoT === undefined) c.echoT = interval * (0.3 + Math.random());
        c.echoT -= 0.5;
        if (c.echoT > 0) continue;
        c.echoT = interval * (0.5 + Math.random());
        // someone in the same zone must be within earshot but not face to face
        let near = null, nd = 1e9;
        for (const p of players) {
          if (c.zone !== 'any' && p.zone !== c.zone) continue;
          const d = p.pos.distanceTo(c.pos);
          if (d < nd) { nd = d; near = p; }
        }
        if (!near || nd > range || nd < 4) continue;
        const clip = cfg.sharedVoice && borrowed ? borrowed : true;
        game.net.broadcast('cev', { e: 'snd', id: c.id, clip });
      }
    });
  },
});
