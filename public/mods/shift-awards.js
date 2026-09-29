// shift-awards - Coroner / end-of-day report idea, but for the living: when the ship lifts off the host hands out silly
// "Employee of the Shift" awards, judged by the Algorithm from what it watched (distance walked, time spent dancing, chat lines,
// time hiding in the ship). Winners get a little Clout. Needs 2+ crewmates. Host-authoritative: the host does all the counting.
KefalAPI.defineMod({
  id: 'shift-awards',
  name: 'Shift Awards',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Coroner + end-of-day reports',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  description: 'After each moon the Algorithm names the Marathoner, the Life of the Party, the Chatterbox and the Homebody. Winners get 10 Clout. Needs 2+ crewmates.',
  config: {
    reward: { type: 'number', default: 10, min: 0, max: 100, label: 'Clout per award' },
  },
  init(api, cfg) {
    const tf = api.tf;
    const AWARDS = [
      { id: 'walk', name: 'Marathoner', unit: 'meters', min: 200 },
      { id: 'party', name: 'Life of the Party', unit: 'seconds', min: 8 },
      { id: 'chat', name: 'Chatterbox', unit: 'lines', min: 5 },
      { id: 'home', name: 'Homebody', unit: 'seconds', min: 60 },
    ];
    const stat = new Map();   // host: peer id -> { walk, party, chat, home, last }
    const rec = (id) => { let s = stat.get(id); if (!s) stat.set(id, (s = { walk: 0, party: 0, chat: 0, home: 0, last: null })); return s; };
    let acc = 0, had = false;
    const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

    api.on('chat', (d, from, game) => { if (game.isHost && game.run?.phase === 'moon' && !String(d?.text || '').startsWith('/')) rec(from).chat++; });
    api.on('update', (dt, game) => {
      if (!game.isHost || game.run?.phase !== 'moon') return;
      acc += dt;
      if (acc < 0.5) return;
      const step = acc; acc = 0; had = true;
      for (const p of game.aiPlayers()) {
        if (p.dead) continue;
        const s = rec(p.id);
        if (s.last) { const d = Math.hypot(p.pos.x - s.last.x, p.pos.z - s.last.z); if (d < 6) s.walk += d; }   // ignore teleports
        s.last = { x: p.pos.x, z: p.pos.z };
        if (p.inShip) s.home += step;
        const em = p.id === game.selfId ? game.emotes?.current?.id : game.remotes.get(p.id)?.emoteNet;
        if (em) s.party += step;
      }
    });
    api.on('phase', (ph, game) => {
      if (!game.isHost) return;
      if (ph === 'landing') { stat.clear(); had = false; return; }
      if (ph !== 'orbit' || !had) return;
      had = false;
      const ids = [...stat.keys()].filter((id) => id === game.selfId || game.remotes.has(id));
      if (ids.length < 2) return;
      const out = [];
      for (const a of AWARDS) {
        let best = null;
        for (const id of ids) { const v = stat.get(id)[a.id]; if (v >= a.min && (!best || v > best.v)) best = { id, v }; }
        if (best) {
          out.push([a.id, best.id, clean(game.playerName(best.id), 24), Math.round(best.v)]);
          if ((Number(cfg.reward) || 0) > 0) api.reward(best.id, 0, Number(cfg.reward), 'Shift award');
        }
      }
      if (out.length) game.net.broadcast('modmsg', { k: 'lcm-awards', a: out });
    });
    api.on('message', (d) => {
      const game = api.game;
      if (!game || d?.k !== 'lcm-awards' || !Array.isArray(d.a)) return;
      game.ui.systemMessage?.(api.t('SHIFT AWARDS - judged by The Algorithm'), 'info');
      for (const [id, , name, v] of d.a.slice(0, 4)) {
        const a = AWARDS.find((x) => x.id === id);
        if (a) game.ui.systemMessage?.(tf('{award}: {name} ({v} {unit})', { award: api.t(a.name), name: clean(name, 24), v: Number(v) || 0, unit: api.t(a.unit) }), 'good');
      }
    });
  },
});
