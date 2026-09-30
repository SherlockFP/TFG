// employee-assignments — port of EmployeeAssignments (amnsoft).
// TFG built-in feature (crew switch). When the ship lands, The Algorithm hands every employee a
// personal assignment: secure a haul, take down creatures, reach the deepest room, drag a big
// valuable home, rescue a cat, bring back a carcass... Complete it before takeoff for a Credits
// bonus to the crew plus personal XP / Clout. Dying fails it. Host-authoritative: the host assigns,
// tracks (hostData.dayStats, collected items, positions) and pays; everyone sees their own card.
KefalAPI.defineMod({
  id: 'employee-assignments',
  name: 'Employee Assignments',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'EmployeeAssignments',
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Every landing each employee gets a personal assignment (haul, hunt, deep dive, heavy lift, cat rescue...). Finish it for a crew Credits bonus plus XP and Clout. Die and it fails.',
  config: {
    payMul: { type: 'number', default: 1, min: 0, max: 5, step: 0.25, label: 'Payout multiplier' },
    showCrew: { type: 'boolean', default: true, label: 'Show crewmates\' assignments on the card' },
  },
  init(api, cfg) {
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------------------ task kinds (host)
    // make(game, pid, ctx) -> task fields | null (not possible today); prog(game, a) -> number
    const KINDS = {
      loot: {
        w: 5, pay: 40,
        make(game, pid, ctx) {
          const goal = Math.round(Math.min(420, Math.max(60, 45 + ctx.tier * 35 + ctx.qi * 22)) / 5) * 5;
          return { goal, base: ctx.per(pid).loot, text: `Secure ▮${goal} of scrap in the ship` };
        },
        prog: (game, a, ctx) => ctx.per(a.pid).loot - a.base,
      },
      hunt: {
        w: 4, pay: 50,
        make(game, pid, ctx) { if ((ctx.qi | 0) < 3) return null; const goal = ctx.tier >= 3 ? 2 : 1; return { goal, base: ctx.per(pid).kills, text: goal > 1 ? `Take down ${goal} creatures` : 'Take down a creature' }; },   // [onegoal] kill-count waits for quota 3
        prog: (game, a, ctx) => ctx.per(a.pid).kills - a.base,
      },
      deep: {
        w: 3, pay: 45,
        make(game) {
          const fac = game.world.facility;
          const spots = (fac?.bigSpots?.length ? fac.bigSpots : fac?.scrapSpots || []).filter((s) => Number.isFinite(s.dist));
          if (!spots.length) return null;
          const s = spots.reduce((a, b) => ((b.dist || 0) > (a.dist || 0) ? b : a));
          if ((s.dist || 0) < 4) return null;
          return { goal: 1, base: 0, at: [s.x, s.y, s.z], text: 'Deep dive: reach the far end of the facility' };
        },
        prog(game, a) {
          const p = game.aiPlayerById(a.pid);
          if (!p || p.dead || !a.at) return 0;
          return Math.hypot(p.pos.x - a.at[0], p.pos.z - a.at[2]) < 6 && Math.abs(p.pos.y - a.at[1]) < 3 ? 1 : 0;
        },
      },
      heavy: {
        w: 3, pay: 45,
        make() { return { goal: 1, base: 0, text: 'Heavy lift: get a big valuable into the ship' }; },
        prog: (game, a, ctx) => ctx.securedBy(a.pid, (it) => it.def?.kind === 'big' && !String(it.type).startsWith('corpse_')),
      },
      cat: {
        w: 3, pay: 40,
        make() { return api.featureOn('needy-cats') ? { goal: 1, base: 0, text: 'Rescue a lost cat (bring it to the ship)' } : null; },
        prog: (game, a) => a.cats || 0,
      },
      carcass: {
        w: 2, pay: 45,
        make(game, pid, ctx) { return api.featureOn('sell-bodies') && ctx.tier >= 2 && (ctx.qi | 0) >= 3 ? { goal: 1, base: 0, text: 'Bring a creature carcass to the ship' } : null; },
        prog: (game, a, ctx) => ctx.securedBy(a.pid, (it) => String(it.type).startsWith('corpse_')),
      },
      hoarder: {
        w: 2, pay: 35,
        make() { return { goal: 3, base: 0, text: 'Hoarder: carry 3 pieces of scrap at once' }; },
        prog(game, a) {
          let n = 0;
          for (const it of game.items.all()) if (it.holder === a.pid && api.isSellable(it.def) && !it.soulbound && it.def?.kind !== 'weapon') n++;
          return Math.max(a.best || 0, n);
        },
      },
    };

    // ------------------------------------------------------------------ host state
    let list = [];            // [{ pid, name, kind, text, goal, base, prog, st, pay, at?, cats? }]
    let dirty = false, tick = 0, sendT = 0;
    const secured = new Map();   // pid -> Set(item ids already counted for 'heavy' / 'carcass')

    function ctxFor(game) {
      const hd = game.hostData || {};
      const moon = api.MOONS[game.run?.moon] || {};
      return {
        tier: moon.tier || 1, qi: game.run?.quotaIndex || 0,
        per: (pid) => hd.dayStats?.per?.[pid] || { loot: 0, kills: 0 },
        securedBy(pid, pred) {
          const set = secured.get(pid) || new Set();
          secured.set(pid, set);
          for (const it of game.items.all()) {
            if (it.lastHolder !== pid || !hd.collected?.has(it.id) || !pred(it)) continue;
            set.add(it.id);
          }
          return set.size;
        },
      };
    }

    function assign(game, pid) {
      if (list.some((a) => a.pid === pid)) return;
      const ctx = ctxFor(game);
      const taken = new Set(list.map((a) => a.kind));
      const opts = [];
      for (const [kind, K] of Object.entries(KINDS)) {
        const t = K.make(game, pid, ctx);
        if (t) opts.push({ kind, K, t, w: K.w * (taken.has(kind) ? 0.25 : 1) });
      }
      if (!opts.length) return;
      let r = Math.random() * opts.reduce((s, o) => s + o.w, 0);
      let pick = opts[0];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
      const pay = Math.round(pick.K.pay * (1 + (ctx.tier - 1) * 0.3 + ctx.qi * 0.12) * Math.max(0, num(cfg.payMul, 1)) / 5) * 5;
      list.push({ pid, name: game.playerName(pid), kind: pick.kind, ...pick.t, prog: 0, st: 'active', pay });
      dirty = true;
    }

    function complete(game, a) {
      a.st = 'done'; dirty = true;
      const run = game.run;
      run.credits = (run.credits || 0) + a.pay;
      game.broadcastRun(['credits']);
      api.reward(a.pid, 90 + (api.MOONS[run.moon]?.tier || 1) * 25, 12 + (run.quotaIndex || 0) * 3, 'Assignment complete');
      game.net.broadcast('sys', { text: `ASSIGNMENT COMPLETE: ${a.name} - ${a.text}. +▮${a.pay} to the crew.`, kind: 'good' });
      api.send({ k: 'tfg-asg-fx', pid: a.pid, e: 'done', pay: a.pay });
    }

    function sendState(game) {
      dirty = false;
      api.send({ k: 'tfg-asg', list: list.map((a) => ({ pid: a.pid, name: a.name, text: a.text, prog: Math.min(a.goal, Math.max(0, Math.floor(a.prog))), goal: a.goal, st: a.st, pay: a.pay })) });
    }

    api.on('moonPopulated', (game) => {
      list = []; secured.clear();
      for (const p of game.aiPlayers()) if (!p.dead) assign(game, p.id);
      sendState(game);
    });
    api.on('playerJoin', (id, info, game) => {
      if (game.run?.phase !== 'moon') { if (list.length) sendState(game); return; }
      game.later(() => { if (game.run?.phase === 'moon') { assign(game, id); sendState(game); } }, 2500);
    });
    api.on('tfg:catRescued', (d) => { const a = list.find((x) => x.pid === d?.by && x.kind === 'cat' && x.st === 'active'); if (a) { a.cats = (a.cats || 0) + 1; } });
    api.on('phase', (ph, game) => {
      if (!game.isHost) return;
      if (ph === 'takeoff' && list.length) {
        const open = list.filter((a) => a.st === 'active');
        if (open.length) game.net.broadcast('sys', { text: `Assignments not finished: ${open.map((a) => a.name).join(', ')}.`, kind: 'info' });
      }
      if (ph === 'orbit' || ph === 'landing') { list = []; secured.clear(); sendState(game); }
    });

    function hostUpdate(game, dt) {
      if (game.run?.phase !== 'moon' || !list.length) return;
      tick -= dt;
      if (tick <= 0) {
        tick = 0.75;
        const ctx = ctxFor(game);
        for (const a of list) {
          if (a.st !== 'active') continue;
          const p = game.aiPlayerById(a.pid);
          if (!p) continue;
          if (p.dead && (game.downed?.isDowned?.(a.pid) || (game.remotes?.get?.(a.pid)?.flags & 64))) continue;   // [threatmerge] bleeding out is not fired: the assignment stays open until a real death
          if (p.dead) { a.st = 'failed'; dirty = true; game.net.broadcast('sys', { text: `Assignment failed: ${a.name} is no longer with the company.`, kind: 'bad' }); continue; }
          const v = KINDS[a.kind].prog(game, a, ctx);
          if (a.kind === 'hoarder') a.best = Math.max(a.best || 0, v);
          if (Math.floor(v) !== Math.floor(a.prog)) { a.prog = v; dirty = true; }
          if (v >= a.goal) complete(game, a);
        }
      }
      sendT -= dt;
      if (dirty && sendT <= 0) { sendT = 0.6; sendState(game); }
    }

    // ------------------------------------------------------------------ client card
    const CSS = `
.tfg-asg { position: absolute; right: 30px; top: 98px; max-width: 380px; text-align: right; pointer-events: none; text-shadow: 0 0 4px #000, 1px 1px 0 #000; }
.tfg-asg .h { font-size: 15px; letter-spacing: 3px; color: #ffcf8a; opacity: 0.85; }
.tfg-asg .me { font-size: 20px; color: #fff; line-height: 1.05; }
.tfg-asg .me.done { color: #7dff7d; } .tfg-asg .me.failed { color: #ff8a7a; text-decoration: line-through; }
.tfg-asg .bar { height: 5px; border: 1px solid rgba(255,207,138,0.6); margin: 3px 0 2px auto; width: 180px; position: relative; }
.tfg-asg .bar i { position: absolute; right: 0; top: 0; bottom: 0; background: #ffcf8a; }
.tfg-asg .pay { font-size: 16px; color: #ffe08a; }
.tfg-asg .crew { font-size: 15px; opacity: 0.75; margin-top: 2px; }
.tfg-asg.pop { animation: tfgAsgPop 0.6s ease-out; }
html[data-hud="standard"] .tfg-asg, html[data-hud="minimal"] .tfg-asg { display: none; }
@keyframes tfgAsgPop { 0% { transform: scale(1.25); filter: brightness(2); } 100% { transform: scale(1); filter: none; } }`;
    let card = null, state = [], lastHtml = '';
    const ensure = (game) => {
      if (card?.isConnected) return true;
      const hudEl = game.ui?.hud?.el;
      if (!hudEl) return false;
      if (!document.getElementById('tfg-asg-css')) { const s = document.createElement('style'); s.id = 'tfg-asg-css'; s.textContent = CSS; document.head.appendChild(s); }
      card = document.createElement('div'); card.className = 'tfg-asg'; hudEl.appendChild(card); lastHtml = '';
      return true;
    };
    function render(game) {
      if (!ensure(game)) return;
      const me = state.find((a) => a.pid === game.selfId);
      const ph = game.run?.phase;
      if (!state.length || (ph !== 'moon' && ph !== 'takeoff') || game.player.dead && !me) { if (lastHtml) { card.innerHTML = ''; lastHtml = ''; } return; }
      let html = '<div class="h">ASSIGNMENT</div>';
      if (me) {
        html += `<div class="me ${me.st}">${me.st === 'done' ? '✔ ' : me.st === 'failed' ? '✖ ' : ''}${esc(me.text)}</div>`;
        if (me.st === 'active' && me.goal > 1) html += `<div class="bar"><i style="width:${Math.round((me.prog / me.goal) * 100)}%"></i></div>`;
        html += `<div class="pay">${me.st === 'done' ? 'PAID' : me.st === 'failed' ? 'FAILED' : `pays ▮${me.pay}${me.goal > 1 ? ` · ${me.prog}/${me.goal}` : ''}`}</div>`;
      } else html += '<div class="me">Waiting for your assignment...</div>';
      if (cfg.showCrew) {
        const others = state.filter((a) => a.pid !== game.selfId);
        for (const a of others.slice(0, 3)) html += `<div class="crew">${esc(a.name)}: ${a.st === 'done' ? '✔' : a.st === 'failed' ? '✖' : `${a.prog}/${a.goal}`} ${esc(a.text)}</div>`;
      }
      if (html !== lastHtml) { card.innerHTML = html; lastHtml = html; }
    }

    let uiT = 0;
    api.on('update', (dt, game) => {
      if (game.isHost) hostUpdate(game, dt);
      uiT -= dt;
      if (uiT <= 0) { uiT = 0.25; render(game); }
    });
    api.on('message', (d) => {
      const game = api.game;
      if (!game) return;
      if (d?.k === 'tfg-asg' && Array.isArray(d.list)) {
        const prevMe = state.find((a) => a.pid === game.selfId);
        state = d.list.slice(0, 16).map((a) => ({ pid: String(a.pid), name: String(a.name || '').slice(0, 24), text: String(a.text || '').slice(0, 80), prog: Number(a.prog) || 0, goal: Math.max(1, Number(a.goal) || 1), st: ['active', 'done', 'failed'].includes(a.st) ? a.st : 'active', pay: Number(a.pay) || 0 }));
        const me = state.find((a) => a.pid === game.selfId);
        if (me && !prevMe && me.st === 'active') {
          game.ui.toast(`New assignment: ${me.text} (▮${me.pay})`, 'info');
          game.sfx('ui_notify', 0.5);
        }
        render(game);
      } else if (d?.k === 'tfg-asg-fx' && d.pid === game.selfId) {
        game.audio.ui?.('ui_quota_met', 0.5);
        game.ui.hud?.bigText('ASSIGNMENT COMPLETE', `+▮${Number(d.pay) || 0} for the crew`);
        if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      }
    });
    // [onegoal] the assignment is ONE tracker line (category job): the Standard HUD shows it only when nothing more urgent is on, the
    // hold-Tab card always lists it. The big card stays for the Full HUD density. Kill-count kinds (hunt, carcass) wait for quota 3.
    api.on('objectives', (add, game, phase) => {
      const me = state.find((a) => a.pid === game?.selfId);
      if (phase !== 'moon' || !me || me.st !== 'active') return;
      const o = add((api.tf ? api.tf('Assignment: {text}', { text: me.text }) : `Assignment: ${me.text}`) + ` (▮${me.pay})`, 'sub', false, me.goal > 1 ? Math.min(1, me.prog / me.goal) : null);
      if (o && typeof o === 'object') o.cat = 'job';
    });
    api.on('sessionEnd', () => { state = []; list = []; card?.remove(); card = null; lastHtml = ''; });
  },
});
