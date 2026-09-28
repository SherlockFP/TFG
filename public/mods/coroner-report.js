// coroner-report — port of Coroner (EliteMasterEric).
// Tags every death with a detailed cause (creature, level, where, when, what you carried, your last
// words) and prints a coroner's report + epitaph into the end-of-day summary.
KefalAPI.defineMod({
  id: 'coroner-report',
  name: 'Coroner Report',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Coroner',
  builtin: true,
  scope: 'local',
  category: 'qol',
  enabledByDefault: true,
  description: 'Detailed causes of death (who or what, where, when, last words) plus an epitaph in the day report. Also gives every creature a proper death message in chat.',
  config: {
    showDetails: { type: 'boolean', default: true, label: 'Show place, time & carried loot' },
    revealCreatureName: { type: 'boolean', default: true, label: 'Name unknown creatures' },
    epitaphs: { type: 'boolean', default: true, label: 'Epitaphs' },
    lastWords: { type: 'boolean', default: true, label: 'Last words (chat)' },
  },
  init(api, cfg) {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const clock = (min) => {
      const m = Math.floor(min || 480), h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0');
      return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
    };

    const DETAIL = {
      fall: 'Blunt force trauma. Jumped from a height and did not stick the landing.',
      lurker: 'Neck snapped from behind by a Lurker.',
      jester: 'Caught by the Music Box after the music stopped.',
      giant: 'Picked up and eaten alive by a Giant.',
      sandkefal: 'Swallowed whole by the Sand Kefal.',
      turret: 'Riddled with bullets by Company security.',
      explosion: 'Blown to pieces.',
      left: 'Abandoned on the moon when the autopilot left at midnight.',
      void: 'Fell into the void. Body not recovered.',
      leech: 'Suffocated by a Ceiling Leech.',
      hound: 'Mauled by a Blind Hound. It heard them.',
      mimic: 'Killed by something wearing a crewmate\'s face.',
      mimicdoor: 'Used a fire exit that turned out to be a mouth.',
      lightning: 'Struck by lightning while carrying metal.',
      electric: 'Electrocuted while rewiring a fuse box.',
      crewmate: 'Killed by a crewmate. HR is reviewing the footage.',
      scream: 'Heart gave out during a Screamer\'s scream.',
      sludge: 'Slowly dissolved by the Sludge.',
      crawler: 'Run down by a charging Crawler.',
      spider: 'Wrapped in silk and bitten by a Spider.',
      scuttler: 'Picked apart by a pack of Scuttlers.',
      yoinker: 'Pecked to death by a Yoinker defending its hoard.',
      mannequin: 'Somebody blinked. The Mannequin moved.',
      ejected: 'Ejected through the airlock by order of the Company.',
    };
    const SHORT = {
      crawler: 'was run down by a Crawler.', spider: 'was wrapped up by a Spider.', scuttler: 'was picked apart by Scuttlers.',
      yoinker: 'was pecked to death by a Yoinker.', sludge: 'was dissolved by the Sludge.', mannequin: 'blinked.',
      scream: 'was scared to death by a Screamer.', lightning: 'was struck by lightning.', electric: 'was electrocuted.',
      crewmate: 'was killed by a crewmate.',
    };
    const EPITAPHS = {
      any: [
        'Engagement is love. Quota was life.', 'They died doing what they loved: carrying other people\'s trash.', 'Gone, but their scrap remains (somewhere).',
        'Reported missing. Replacement already hired.', 'The Algorithm thanks them for their service.', 'Should have stayed on the ship.',
        'At least the loot insurance paid out. (It did not.)', 'Here lies a loyal employee. Probably.', '><((((º> Swim with the kefal now.',
        'Their locker has been reassigned.', 'Survived by one (1) rubber ducky.', 'Last seen heading the wrong way.',
      ],
      fall: ['Gravity: 1, Employee: 0.', 'They tried flying. The floor disagreed.'],
      left: ['The ship waits for no one.', 'Should have checked the clock.'],
      jester: ['The music box always wins.', 'Pop goes the employee.'],
      mannequin: ['Don\'t. Blink.'],
      hound: ['Should have whispered.'],
      crewmate: ['Friendly fire isn\'t.'],
      explosion: ['Click. ...boom.'],
      mimic: ['"It was right behind me, I swear."'],
      giant: ['A light snack.'],
    };

    let reports = new Map();   // peerId -> report (this day)
    let lastHurt = null;
    let lastWords = new Map(); // peerId -> {text, t}
    let heldName = null, carried = 0, heldT = 0;

    function creatureInfo(game, cid) {
      const v = cid && game.creatures?.views?.get(cid);
      if (!v) return null;
      const known = !!game.profile.bestiary?.[v.type]?.seen || cfg.revealCreatureName;
      return {
        type: v.type,
        name: v.type === 'mimic' ? 'Mimic' : (known ? (v.def?.name || v.type) : 'unidentified entity'),
        lv: v.def?.hazard ? 0 : (v.level || 1), elite: !!v.elite, disguise: v.type === 'mimic' ? (v.name || null) : null,
      };
    }

    api.on('netReady', (net, game) => {
      reports = new Map(); lastHurt = null; lastWords = new Map();
      // remember what hit us last
      const origHurt = game.onHurt;
      game.onHurt = function (d) {
        try {
          const crew = d.from && d.from !== game.selfId && game.remotes.get(d.from);
          lastHurt = { cause: d.cause, t: game.time, killer: creatureInfo(game, d.from), crew: crew ? crew.name : null };
        } catch { /* ignore */ }
        return origHurt.call(this, d);
      };
      // last words
      const origChat = game.onChat;
      game.onChat = function (d, from) {
        if (d && typeof d.text === 'string' && !d.text.startsWith('/')) lastWords.set(from, { text: d.text.slice(0, 80), t: game.time });
        return origChat.call(this, d, from);
      };
      // richer death messages for every cause (incl. modded creatures)
      const origText = game.deathText;
      game.deathText = function (cause) {
        const base = origText.call(this, cause);
        if (base !== 'died.') return base;
        if (SHORT[cause]) return SHORT[cause];
        const def = api.CREATURES[cause];
        if (def) return `was killed by ${an(def.name)}.`;
        return base;
      };
    });

    api.on('phase', (ph) => { if (ph === 'landing') { reports.clear(); lastHurt = null; } });

    api.on('update', (dt, game) => {
      heldT -= dt;
      if (heldT > 0 || game.player.dead) return;
      heldT = 0.5;
      const it = game.player.heldItem();
      heldName = it ? (it.label || it.def?.name) : null;
      let v = 0;
      for (const id of game.player.slots) { const x = id && game.items.get(id); if (x && x.value && x.def?.kind !== 'tool' && x.def?.kind !== 'weapon') v += x.value; }
      carried = v;
    });

    api.on('localDeath', (cause, game) => {
      const recent = lastHurt && game.time - lastHurt.t < 3 && (lastHurt.cause === cause || cause === 'explosion');
      const p = game.player, run = game.run || {};
      const lw = lastWords.get(game.selfId);
      const r = {
        name: game.profile.name, cause,
        killer: recent ? lastHurt.killer : null, crew: recent ? lastHurt.crew : null,
        where: p.inShip ? 'aboard the ship' : p.indoor ? 'inside the facility' : run.phase === 'company' ? 'at the Company' : 'outside',
        time: run.phase === 'moon' ? clock(run.time) : null,
        moon: api.MOONS[run.moon]?.name || null,
        held: heldName, carried,
        words: lw && game.time - lw.t < 180 ? lw.text : null,
      };
      api.send({ k: 'kmod-coroner', id: game.selfId, r });
    });

    api.on('message', (d, from) => {
      if (d?.k !== 'kmod-coroner' || !d.r) return;
      reports.set(d.id || from, d.r);
    });

    function describe(game, death) {
      const r = reports.get(death.id);
      const cause = r?.cause || death.cause;
      let s;
      const k = r?.killer;
      if (k && cause !== 'left') {
        const lvl = k.lv ? ` (Lv.${k.lv}${k.elite ? ' ELITE' : ''})` : '';
        if (k.type === 'mine') s = 'Stepped on a landmine. Then stepped off it.';
        else if (k.type === 'turret') s = DETAIL.turret;
        else if (k.type === 'mimic') s = `Killed by a Mimic${k.disguise ? ` wearing ${k.disguise}'s face` : ''}${lvl}.`;
        else if (DETAIL[cause] && cause === k.type) s = DETAIL[cause].replace(/\.$/, '') + lvl + '.';
        else s = `Killed by ${an(k.name)}${lvl}.`;
      } else if (r?.crew && cause === 'crewmate') s = `Killed by crewmate ${r.crew}. HR has been notified.`;
      else s = DETAIL[cause] || (api.CREATURES[cause] ? `Killed by ${an(api.CREATURES[cause].name)}.` : 'Cause of death: unknown. The Algorithm is not liable.');
      let html = `<b>${esc(death.name)}</b>: ${esc(s)}`;
      if (cfg.showDetails && r) {
        const bits = [];
        if (r.where) bits.push(r.where);
        if (r.time) bits.push('at ' + r.time);
        if (r.held) bits.push('holding ' + r.held);
        if (r.carried) bits.push(`carrying ▮${r.carried}`);
        if (bits.length) html += ` <span style="opacity:.75">(${esc(bits.join(', '))})</span>`;
      }
      if (cfg.lastWords && r?.words) html += `<br>&nbsp;&nbsp;Last words: <i>"${esc(r.words)}"</i>`;
      if (cfg.epitaphs) {
        const pool = EPITAPHS[cause] && Math.random() < 0.6 ? EPITAPHS[cause] : EPITAPHS.any;
        html += `<br>&nbsp;&nbsp;<i style="opacity:.7">${esc(pick(pool))}</i>`;
      }
      return html;
    }

    api.on('daySummary', (summary, extra, game) => {
      if (summary.company) return;
      const deaths = summary.deaths || [];
      if (!deaths.length) { extra.push('<b>CORONER:</b> No bodies today. The coroner went fishing.'); return; }
      extra.push(`<b>☠ CORONER'S REPORT</b> — ${deaths.length} fatalit${deaths.length === 1 ? 'y' : 'ies'}`);
      for (const d of deaths) extra.push(describe(game, d));
    });
  },
});
