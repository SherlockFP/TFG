// ship-radio - Signal Translator / walkie-text idea. The terminal's SIGNAL command only prints text and only works from the ship.
// /radio <text> (chat) or RADIO <text> (terminal) works from anywhere: every crewmate with the mod gets a crackly
// "OPERATOR" line on the intercom, read aloud by the browser's text-to-speech voice (optional, per player). 3 s cooldown.
KefalAPI.defineMod({
  id: 'ship-radio',
  name: 'Ship Radio',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Signal Translator / walkie text',
  builtin: true,
  scope: 'local',
  category: 'social',
  enabledByDefault: true,
  description: '/radio <text> from anywhere: the whole crew hears a crackly OPERATOR line, spoken aloud by text-to-speech if you like. The Signal Translator without the trip to the ship.',
  config: {
    speak: { type: 'boolean', default: true, label: 'Read radio lines aloud (text-to-speech)' },
    volume: { type: 'number', default: 0.7, min: 0.1, max: 1, step: 0.1, label: 'Voice volume' },
  },
  init(api, cfg) {
    const t = api.t, tf = api.tf;
    let next = 0, lastRx = -1e9;
    const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
    function send(game, text, say) {
      const x = clean(text, 140);
      if (!x) { say(t('Usage: /radio <message>')); return; }
      const now = performance.now() / 1000;
      if (now < next) return;
      next = now + 3;
      game.net.broadcast('modmsg', { k: 'lcm-radio', x, n: clean(game.profile.name, 24) });
    }
    api.registerChatCommand('radio', (args, game) => send(game, args.join(' '), (s) => game.ui.toast(s, 'info')));
    api.registerCommand('radio', (rest, term, game) => { send(game, String(rest || ''), (s) => term.print(s)); if (rest) term.print(t('Transmission sent.')); }, 'radio the whole crew from anywhere (text-to-speech)');

    api.on('message', (d) => {
      const game = api.game;
      if (!game || d?.k !== 'lcm-radio' || typeof d.x !== 'string') return;
      const rx = performance.now();
      if (rx - lastRx < 1500) return;   // flood guard
      lastRx = rx;
      const x = clean(d.x, 140), n = clean(d.n, 24);
      game.ui.systemMessage?.(tf('[RADIO] {name}: {msg}', { name: n.toUpperCase(), msg: x }), 'signal');
      game.sfx?.('ui_chat', 0.5);
      if (cfg.speak !== false && typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        try {
          const u = new SpeechSynthesisUtterance(x);
          u.pitch = 0.6; u.rate = 1.15; u.volume = Math.max(0.1, Math.min(1, Number(cfg.volume) || 0.7));
          window.speechSynthesis.speak(u);
        } catch { /* optional */ }
      }
    });
  },
});
