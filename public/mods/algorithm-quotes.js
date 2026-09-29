// algorithm-quotes - TFG take on the Skinwalkers / Mirage idea, in TEXT: The Algorithm quotes your own chat back at you.
// Voice replay already exists (skinwalker-echoes). This one is the opt-in, text-only cousin: the host remembers the last few
// chat lines each crewmate typed (memory only, never saved, never sent anywhere except to the crew that already saw them)
// and now and then the intercom reads one back with a snide caption. Being quoted often unlocks a secret cosmetic.
KefalAPI.defineMod({
  id: 'algorithm-quotes',
  name: 'The Algorithm Quotes You',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Skinwalkers + Mirage (text edition)',
  builtin: true,
  scope: 'host',
  category: 'horror',
  enabledByDefault: false,
  description: 'Opt-in. The Algorithm reads your own chat lines back on the intercom, with a snide caption. Host memory only, peers only, nothing is saved. Being quoted 8 times unlocks a secret suit.',
  config: {
    interval: { type: 'number', default: 150, min: 45, max: 600, label: 'Avg seconds between quotes' },
    minAge: { type: 'number', default: 40, min: 10, max: 300, label: 'Quote lines older than (s)' },
  },
  init(api, cfg) {
    const tf = api.tf;
    const T = [
      'Viewers, a quote from {name}: "{q}" Rated 2 stars.',
      '{name} said "{q}" earlier. The Algorithm has not forgotten.',
      'Trending now: "{q}" by {name}. 4,012 people are laughing at you.',
      'Reminder, {name}: you typed "{q}". It is in your permanent record.',
    ];
    const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
    const lines = new Map();   // host only: peer id -> [{ x, at }]
    let wait = 90;

    api.on('chat', (d, from, game) => {
      if (!game.isHost || !d || typeof d.text !== 'string') return;
      const x = clean(d.text, 90);
      if (x.length < 6 || x.startsWith('/')) return;
      const list = lines.get(from) || [];
      list.push({ x, at: game.time || 0 });
      lines.set(from, list.slice(-6));
    });
    api.on('phase', (ph, game) => { if (ph === 'landing' && game.isHost) wait = 60 + Math.random() * 60; });
    api.on('update', (dt, game) => {
      if (!game.isHost || game.run?.phase !== 'moon') return;
      wait -= dt;
      if (wait > 0) return;
      const iv = Math.max(45, Number(cfg.interval) || 150), age = Math.max(10, Number(cfg.minAge) || 40);
      wait = iv * (0.7 + Math.random() * 0.6);
      const pool = [];
      for (const [id, list] of lines) for (const l of list) if ((game.time || 0) - l.at >= age) pool.push([id, l]);
      if (!pool.length) return;
      const [id, l] = pool[Math.floor(Math.random() * pool.length)];
      lines.set(id, lines.get(id).filter((z) => z !== l));
      game.net.broadcast('modmsg', { k: 'lcm-quote', id, n: clean(game.playerName(id), 24), x: l.x, i: Math.floor(Math.random() * T.length) });
    });
    api.on('message', (d) => {
      const game = api.game;
      if (!game || d?.k !== 'lcm-quote' || typeof d.x !== 'string') return;
      const text = tf(T[(d.i | 0) % T.length], { name: clean(d.n, 24), q: clean(d.x, 90) });
      if (game.lore?.say) game.lore.say(text); else game.ui.toast(text, 'info');
      if (d.id === game.selfId) game.cosm5?.bump?.('quoted');
    });
  },
});
