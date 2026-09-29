// dance-party - Too Many Emotes' best side effect: crews dancing together. Two or more crewmates dancing within 9 m of each
// other build "party time". Every 20 s of it the HOST pays each dancer a little XP + Clout ("mandatory fun"), max 6 payouts
// per player per day so it cannot be farmed. Host-authoritative (positions + emote ids come from the host's view).
KefalAPI.defineMod({
  id: 'dance-party',
  name: 'Office Party',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'TooManyEmotes (dance groups)',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  description: 'Two or more crewmates dancing close together earn a small XP + Clout bonus every 20 s (max 6 per day each). Mandatory fun. Five parties unlock the Server Room Rave emote.',
  config: {
    radius: { type: 'number', default: 9, min: 3, max: 25, label: 'Party radius (m)' },
    seconds: { type: 'number', default: 20, min: 8, max: 120, label: 'Seconds of dancing per payout' },
  },
  init(api, cfg) {
    const tf = api.tf;
    const DANCE = new Set(['dance', 'party', 'spin', 'headbang', 'hop', 'cheer', 'moonwalk', 'ascend', 'rally', 'clap', 'praise', 'flip', 'mosh', 'shimmy', 'scroll', 'shuffle']);
    const base = (id) => (id && id.startsWith('x:') ? id.slice(2) : id);
    let acc = 0;
    const paid = new Map();   // peer id -> payouts today (host)
    const time = new Map();   // peer id -> seconds danced with company since the last payout (host)

    function dancerIds(game) {
      const out = [];
      if (game.emotes?.current && DANCE.has(base(game.emotes.current.id))) out.push(game.selfId);
      for (const [id, r] of game.remotes) if (r.emoteNet && DANCE.has(base(r.emoteNet))) out.push(id);
      return out;
    }
    api.on('phase', (ph, game) => { if (ph === 'landing' && game.isHost) { paid.clear(); time.clear(); } });
    api.on('update', (dt, game) => {
      if (!game.isHost) return;
      acc += dt;
      if (acc < 0.5) return;
      const step = acc; acc = 0;
      const R = Math.max(3, Number(cfg.radius) || 9), S = Math.max(8, Number(cfg.seconds) || 20);
      const ids = dancerIds(game);
      if (ids.length < 2) { if (time.size) time.clear(); return; }
      const pos = new Map(game.aiPlayers().filter((p) => !p.dead).map((p) => [p.id, p.pos]));
      const crowd = new Set();
      for (const a of ids) for (const b of ids) if (a !== b && pos.get(a) && pos.get(b) && pos.get(a).distanceTo(pos.get(b)) <= R) { crowd.add(a); crowd.add(b); }
      for (const id of [...time.keys()]) if (!crowd.has(id)) time.delete(id);
      const winners = [];
      for (const id of crowd) {
        const v = (time.get(id) || 0) + step;
        if (v >= S && (paid.get(id) || 0) < 6) { time.set(id, 0); paid.set(id, (paid.get(id) || 0) + 1); winners.push(id); } else time.set(id, v);
      }
      if (winners.length) {
        for (const id of winners) api.reward(id, 8, 5, 'Office party');
        game.net.broadcast('modmsg', { k: 'lcm-party', ids: winners.slice(0, 16), n: crowd.size });
      }
    });
    api.on('message', (d) => {
      const game = api.game;
      if (!game || d?.k !== 'lcm-party' || !Array.isArray(d.ids)) return;
      if (!d.ids.includes(game.selfId)) return;
      game.ui.toast(tf('OFFICE PARTY! {n} employees are having mandatory fun. +8 XP, +5 Clout', { n: Math.max(2, d.n | 0) }), 'good');
      game.cosm5?.bump?.('raved');
    });
  },
});
