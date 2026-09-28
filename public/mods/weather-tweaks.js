// weather-tweaks — port of WeatherTweaks (mrov) combined + progressing weathers.
// TFG built-in feature (crew switch). When the ship lands the host may roll:
//  - a COMBINED weather (e.g. Rainy + Foggy, Eclipsed + Stormy): both effects at once, and the scrap
//    on that moon is worth more (hazard pay);
//  - a PROGRESSING weather: the sky turns during the day (Clear > Stormy, Foggy > Clear,
//    Clear > Eclipsed...) at a random afternoon hour, announced to the crew.
// State lives in run.wx (replicated with the run state, so late joiners get it too). Every peer
// layers the secondary effects on top of the normal environment (fog density, rain, lightning).
KefalAPI.defineMod({
  id: 'weather-tweaks',
  name: 'Weather Tweaks',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'WeatherTweaks',
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Combined weathers (Rainy + Foggy, Eclipsed + Stormy...) with bonus scrap value, and weather that changes during the day (Clear > Stormy, Foggy > Clear...). Type WEATHER on the terminal.',
  config: {
    combinedChance: { type: 'number', default: 25, min: 0, max: 100, label: 'Combined weather chance (%)' },
    progressChance: { type: 'number', default: 20, min: 0, max: 100, label: 'Progressing weather chance (%)' },
    combinedValueBonus: { type: 'number', default: 15, min: 0, max: 100, label: 'Combined weather scrap bonus (%)' },
  },
  init(api, cfg) {
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const KNOWN = ['clear', 'rainy', 'foggy', 'stormy', 'eclipsed'];
    const wname = (w) => api.WEATHER[w]?.name || (w ? w[0].toUpperCase() + w.slice(1) : 'Clear');
    const clock = (min) => { const m = Math.round(min); let h = Math.floor(m / 60) % 24; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m % 60).padStart(2, '0')} ${ap}`; };
    const pick = (list) => { let t = 0; for (const [, w] of list) t += w; let r = Math.random() * t; for (const [v, w] of list) { r -= w; if (r <= 0) return v; } return list[list.length - 1][0]; };

    function roll(primary) {
      if (!KNOWN.includes(primary)) return null;
      const wx = { s: null, at: null, to: null, done: false };
      if (Math.random() * 100 < num(cfg.combinedChance, 25)) {
        const opts = { clear: [], rainy: [['foggy', 3], ['stormy', 1]], foggy: [['rainy', 3], ['stormy', 2]], stormy: [['foggy', 3]], eclipsed: [['foggy', 2], ['stormy', 2], ['rainy', 1]] }[primary];
        if (opts?.length) wx.s = pick(opts);
      }
      if (Math.random() * 100 < num(cfg.progressChance, 20)) {
        const opts = { clear: [['rainy', 3], ['stormy', 3], ['foggy', 2], ['eclipsed', 1]], rainy: [['stormy', 3], ['clear', 2]], foggy: [['clear', 3], ['rainy', 1]], stormy: [['clear', 2], ['rainy', 2]], eclipsed: [['clear', 1]] }[primary];
        if (opts?.length) {
          wx.to = pick(opts);
          if (wx.to === wx.s) wx.s = null;
          wx.at = 12 * 60 + Math.floor(Math.random() * 5 * 60);   // 12:00 .. 17:00
        }
      }
      return wx.s || wx.to ? wx : null;
    }
    const describe = (run) => {
      const wx = run.wx;
      let t = wname(run.weather);
      if (wx?.s) t += ' + ' + wname(wx.s);
      if (wx?.to && !wx.done) t += ` > ${wname(wx.to)} (~${clock(wx.at)})`;
      return t;
    };

    // ------------------------------------------------------------------ host
    api.on('phase', (ph, game) => {
      if (!game.isHost || !game.run) return;
      const run = game.run;
      if (ph === 'landing') {
        run.wx = api.MOONS[run.moon]?.company ? null : roll(run.weather);
        game.broadcastRun(['wx']);
      } else if (ph === 'orbit' && run.wx) {
        run.wx = null;
        game.broadcastRun(['wx']);
      }
    });
    api.on('moonPopulated', (game) => {
      const run = game.run;
      if (!run?.wx) return;
      const shift = run.wx.to ? ` The sky will turn ${wname(run.wx.to).toUpperCase()} this afternoon.` : '';
      game.net.broadcast('sys', { text: `WEATHER: ${describe(run)}.${run.wx.s ? ' Combined weather: scrap is worth more today.' : ''}${shift}`, kind: 'warn' });
      const bonus = run.wx.s ? Math.max(0, num(cfg.combinedValueBonus, 15)) / 100 : 0;
      if (bonus > 0) {
        for (const it of game.items.all()) {
          if (it.state !== 'world' || !api.isSellable(it.def) || it.soulbound || it.type === 'body' || api.insideShip(it.obj.position) || !it.value) continue;
          game.net.broadcast('it', { e: 'val', id: it.id, v: Math.round(it.value * (1 + bonus)) });
        }
      }
    });
    let hostT = 0;
    function hostTick(game, dt) {
      const run = game.run, wx = run?.wx;
      if (!wx || wx.done || !wx.to || run.phase !== 'moon') return;
      hostT -= dt;
      if (hostT > 0) return;
      hostT = 1;
      if ((run.time || 0) < wx.at) return;
      const from = run.weather;
      wx.done = true;
      run.weather = wx.to;
      game.broadcastRun(['weather', 'wx']);
      const extra = wx.to === 'eclipsed' ? ' The sun is gone. Everything outside is awake.' : wx.to === 'stormy' ? ' Drop your metal.' : wx.to === 'clear' ? ' Visibility restored.' : '';
      game.net.broadcast('sys', { text: `WEATHER SHIFT: ${wname(from)} > ${wname(wx.to)}.${extra}`, kind: wx.to === 'clear' ? 'info' : 'warn' });
    }

    // ------------------------------------------------------------------ every peer: environment layering
    let lightT = 10, applied = null;
    api.on('update', (dt, game) => {
      if (game.isHost) hostTick(game, dt);
      const run = game.run, env = game.env;
      if (!run || !env || env.mode !== 'moon' || !game.world.outdoor) { applied = null; return; }
      if (run.phase !== 'moon' && run.phase !== 'landing' && run.phase !== 'takeoff') return;
      const wx = run.wx || null;
      // primary changed mid-day (progressing weather): rebuild the environment weather
      const key = run.weather + '|' + (wx?.s || '');
      if (applied !== key && KNOWN.includes(run.weather)) {
        const primaryChanged = env.weather !== run.weather;
        if (primaryChanged) {
          env.weather = run.weather;
          env.eclipse = run.weather === 'eclipsed';
          env.startWeather(run.weather);
        }
        if ((wx?.s === 'rainy' || wx?.s === 'stormy') && !env.rain) env.startWeather('rainy');
        game.weatherMud = ['rainy', 'stormy'].includes(run.weather) || ['rainy', 'stormy'].includes(wx?.s);
        if (applied !== null && primaryChanged) game.ui.hud?.bigText(wname(run.weather).toUpperCase(), 'The weather is changing');
        applied = key;
      }
      if (!wx?.s || env.indoor) return;
      const fog = game.scene.fog;
      if (wx.s === 'foggy' && fog) fog.density *= 2.1;
      else if ((wx.s === 'rainy' || wx.s === 'stormy') && fog) fog.density *= 1.3;
      if (wx.s === 'stormy' && run.phase === 'moon') {
        lightT -= dt;
        if (lightT <= 0) {
          lightT = 7 + Math.random() * 15;
          env.lightningFlash = 1;
          game.onLightning?.();
        }
      }
    });
    api.on('phase', (ph, game) => {
      if (ph !== 'moon' || !game.run?.wx) return;
      setTimeout(() => { if (api.game === game && game.run?.wx) game.ui.toast('Weather: ' + describe(game.run), 'info'); }, 2500);
    });

    // ------------------------------------------------------------------ terminal
    api.registerCommand('weather', (rest, term, game) => {
      const run = game.run || {};
      const lines = [];
      if (run.phase === 'moon' || run.phase === 'landing') lines.push('TODAY: ' + describe(run), '');
      lines.push('FORECAST (base weather, WeatherTweaks may combine or shift it on landing):');
      for (const id of api.MOON_ORDER) {
        const m = api.MOONS[id];
        if (!m || m.company) continue;
        lines.push(`  ${(m.name || id).padEnd(20)} ${wname(run.forecast?.[id] || 'clear')}`);
      }
      term.print(lines.join('\n'));
    }, 'today\'s weather incl. combined / progressing weather');
  },
});
