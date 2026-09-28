// yippee-sfx — port of YippeeMod (sunnobunno) + the BonkHitSFX / meme-sound family.
// Purely cosmetic, purely local sound swaps for comic relief between scares.
KefalAPI.defineMod({
  id: 'yippee-sfx',
  name: 'Yippee SFX',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'YippeeMod + BonkHitSFX',
  enabledByDefault: false,
  cheat: true,
  description: 'Meme sound swaps: YIPPEE! on pickups, clown honks on bonks, boing on hard landings, squeaky footsteps and more. Local only.',
  config: {
    chance: { type: 'number', default: 35, min: 0, max: 100, label: 'Swap chance (%)' },
    yippeePickups: { type: 'boolean', default: true, label: 'Yippee on pickups' },
    honkBonks: { type: 'boolean', default: true, label: 'Clown honk on melee hits' },
    boingLandings: { type: 'boolean', default: true, label: 'Boing on hard landings' },
    squeakySteps: { type: 'boolean', default: false, label: 'Squeaky footsteps (rare)' },
    airhornQuota: { type: 'boolean', default: true, label: 'Airhorn when the quota is met' },
    kazooDeath: { type: 'boolean', default: false, label: 'Silly death sound' },
  },
  init(api, cfg) {
    const roll = (mul = 1) => Math.random() * 100 < (Number(cfg.chance) || 0) * mul;
    const RULES = [];
    if (cfg.yippeePickups) RULES.push({ from: ['item_pickup'], to: 'yoinker_yippee', pitch: [0.95, 1.25], vol: 0.8 });
    if (cfg.honkBonks) RULES.push({ from: ['hit_flesh', 'hit_metal'], to: 'clownhorn', pitch: [0.85, 1.35], vol: 0.9 });
    if (cfg.boingLandings) RULES.push({ from: ['land_hard'], to: 'mannequin_boing', pitch: [0.9, 1.1], vol: 1, always: true });
    if (cfg.squeakySteps) RULES.push({ test: (n) => n.startsWith('step_'), to: 'squeak', pitch: [0.8, 1.4], vol: 0.6, mul: 0.15 });
    if (cfg.airhornQuota) RULES.push({ from: ['ui_quota_met'], to: 'airhorn', vol: 0.9, also: true, always: true });
    if (cfg.kazooDeath) RULES.push({ from: ['death'], to: 'mannequin_boing', pitch: [0.5, 0.6], vol: 1, always: true });

    function swap(name) {
      if (typeof name !== 'string') return null;
      for (const r of RULES) {
        if (r.from ? !r.from.includes(name) : !r.test(name)) continue;
        if (!r.always && !roll(r.mul || 1)) return null;
        return r;
      }
      return null;
    }

    api.on('boot', (app) => {
      const audio = app.audio;
      if (!audio || audio.__kmodYippee) return;
      audio.__kmodYippee = true;
      const orig = audio.play.bind(audio);
      audio.play = (name, opts = {}) => {
        const r = swap(name);
        if (!r || opts.loop) return orig(name, opts);
        const o = { ...opts };
        if (r.pitch) o.pitch = r.pitch[0] + Math.random() * (r.pitch[1] - r.pitch[0]);
        if (r.vol !== undefined) o.volume = (opts.volume ?? 1) * r.vol;
        if (r.also) { orig(name, opts); o.delay = (opts.delay || 0) + 0.15; }
        return orig(r.to, o);
      };
    });
  },
});
