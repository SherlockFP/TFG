// control-company-lite — a light port of ControlCompany (Dev1A3 / others).
// TFG built-in feature (crew switch, needs Spectate Enemies). Dead players watching a creature
// (right-click cam) can press E to POSSESS a weak one for a short while: WASD to walk, Shift to run,
// LMB to bite, E to let go. The host runs the creature (the possessor only sends its stick input),
// damage is reduced, possession is time-limited and each ghost has a cooldown, so it stays a prank,
// not a griefing tool.
KefalAPI.defineMod({
  id: 'control-company-lite',
  name: 'Control Company (Lite)',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'ControlCompany',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  requires: ['spectate-enemies'],
  description: 'Dead players can briefly possess a weak creature they are spectating (E): walk it around, make it bite your friends, then let go. Short, weak and on a cooldown.',
  config: {
    pool: { type: 'select', options: ['weak (Spam Bot, Data Hoarder)', 'weak + medium (+ Web Spider, Web Crawler, Screamer, Troll)'], default: 'weak (Spam Bot, Data Hoarder)', label: 'Possessable creatures' },
    seconds: { type: 'number', default: 25, min: 5, max: 90, label: 'Possession time (s)' },
    cooldown: { type: 'number', default: 75, min: 10, max: 600, label: 'Cooldown per ghost (s)' },
    damageMul: { type: 'number', default: 0.6, min: 0, max: 1.5, step: 0.05, label: 'Bite damage multiplier' },
  },
  init(api, cfg) {
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const WEAK = ['scuttler', 'yoinker'];
    const MED = ['spider', 'crawler', 'screamer', 'hound'];
    const ALLOWED = new Set(String(cfg.pool || '').startsWith('weak + medium') ? [...WEAK, ...MED] : WEAK);
    const DUR = Math.max(5, Math.min(90, num(cfg.seconds, 25)));
    const CD = Math.max(10, num(cfg.cooldown, 75));
    const DMG = Math.max(0, Math.min(1.5, num(cfg.damageMul, 0.6)));

    // ------------------------------------------------------------------ host
    const hostCd = new Map();   // peer -> game.time when they may possess again
    let hostGame = null;

    function release(c, reason) {
      const P = c.tfgPoss;
      if (!P) return;
      c.tfgPoss = null;
      c.target = null; c.path = null;
      if (!c.dead) c.setState('idle');
      if (hostGame) hostCd.set(P.by, hostGame.time + CD);
      api.send({ k: 'tfg-poss', cid: c.id, by: P.by, t: 0, why: reason || '' });
    }

    function stepOk(nav, x0, z0, x1, z1) {
      const [ax, az] = nav.toGrid(x0, z0), [bx, bz] = nav.toGrid(x1, z1);
      if (ax === bx && az === bz) return nav.isWalkable(bx, bz);
      if (ax !== bx && az !== bz) return (nav.canStep(ax, az, bx, az) && nav.canStep(bx, az, bx, bz)) || (nav.canStep(ax, az, ax, bz) && nav.canStep(ax, bz, bx, bz));
      return nav.canStep(ax, az, bx, bz);
    }

    function possessedTick(c, dt, M, P) {
      const game = M.game;
      const ghost = game.aiPlayerById(P.by);
      if (!ghost || !ghost.dead || game.time > P.until || game.run?.phase !== 'moon') { release(c, game.time > P.until ? 'time' : 'gone'); return; }
      const def = c.def || {};
      const speed = P.run ? (def.run || 4) * 0.75 : (def.walk || 2) * 1.35;
      const L = Math.hypot(P.mx, P.mz);
      const busy = c.state === 'attack' && c.cooldown > 0.6;
      if (L > 0.15) {
        const dx = P.mx / L, dz = P.mz / L;
        c.yaw = Math.atan2(dx, dz);
        const nx = c.pos.x + dx * speed * dt, nz = c.pos.z + dz * speed * dt;
        const nav = M.nav(c);
        if (!nav) M.placeAt(c, nx, nz);
        else if (stepOk(nav, c.pos.x, c.pos.z, nx, nz)) M.placeAt(c, nx, nz);
        else if (stepOk(nav, c.pos.x, c.pos.z, nx, c.pos.z)) M.placeAt(c, nx, c.pos.z);
        else if (stepOk(nav, c.pos.x, c.pos.z, c.pos.x, nz)) M.placeAt(c, c.pos.x, nz);
        M.openDoorsNear?.(c);
        if (!busy) c.setState(P.run ? 'run' : 'walk');
      } else if (!busy) c.setState('idle');
      if (P.atk) {
        P.atk = false;
        if (c.cooldown <= 0) {
          c.cooldown = 1.3;
          c.setState('attack');
          const reach = (def.radius || 0.5) + 1.3;
          let best = null, bd = reach;
          for (const p of M.playersFor(c)) {
            const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
            if (d > bd || Math.abs(p.pos.y - c.pos.y) > 2) continue;
            const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
            if (d > 0.6 && ((p.pos.x - c.pos.x) * fx + (p.pos.z - c.pos.z) * fz) / d < 0.2) continue;   // must face them
            best = p; bd = d;
          }
          if (best && c.dmg > 0) M.attack(c, best, Math.max(1, Math.round(Math.min(c.dmg, 60) * DMG)), c.type);
        }
      }
    }

    // wrap the host behaviors of the possessable types (a no-op unless a ghost holds the creature)
    for (const t of ALLOWED) {
      const orig = api.BEHAVIORS[t];
      if (typeof orig !== 'function' || orig.__tfgPoss) continue;
      const wrapped = function (c, dt, M) { return c.tfgPoss ? possessedTick(c, dt, M, c.tfgPoss) : orig.call(this, c, dt, M); };
      wrapped.__tfgPoss = true;
      api.BEHAVIORS[t] = wrapped;
    }

    api.on('hostStart', (game) => { hostGame = game; hostCd.clear(); });
    api.on('registerHandlers', (H, game) => {
      hostGame = game;
      H('tfgPossess', (d, from) => {
        if (!api.enabled() || game.run?.phase !== 'moon') return;
        const c = game.creatures.host.get(d?.cid);
        const me = game.aiPlayerById(from);
        if (!c || c.dead || c.tfgPoss || !ALLOWED.has(c.type) || c.def?.boss || !me?.dead) return;
        for (const o of game.creatures.host.values()) if (o.tfgPoss?.by === from) return;   // one at a time
        if ((hostCd.get(from) || 0) > game.time) { game.net.sendTo(from, 'sys', { text: `You can possess again in ${Math.ceil(hostCd.get(from) - game.time)} s.`, kind: 'info' }); return; }
        c.tfgPoss = { by: from, until: game.time + DUR, mx: 0, mz: 0, run: false, atk: false };
        c.target = null; c.path = null; c.stunT = 0;
        c.setState('idle');
        api.send({ k: 'tfg-poss', cid: c.id, by: from, t: DUR });
      });
      H('tfgPossIn', (d, from) => {
        const c = game.creatures.host.get(d?.cid);
        const P = c?.tfgPoss;
        if (!P || P.by !== from) return;
        const mx = Number(d.mx) || 0, mz = Number(d.mz) || 0, L = Math.hypot(mx, mz);
        P.mx = L > 1 ? mx / L : mx; P.mz = L > 1 ? mz / L : mz;
        P.run = !!d.run;
        if (d.atk) P.atk = true;
      });
      H('tfgUnpossess', (d, from) => {
        const c = game.creatures.host.get(d?.cid);
        if (c?.tfgPoss?.by === from) release(c, 'released');
      });
    });
    api.on('phase', (ph, game) => {
      if (!game.isHost) return;
      if (ph === 'takeoff' || ph === 'orbit') for (const c of game.creatures.host.values()) if (c.tfgPoss) release(c, 'takeoff');
    });

    // ------------------------------------------------------------------ possessor (client)
    let poss = null;          // { cid, until, sendT, atk }
    let readyAt = 0;
    const ctl = {
      active: () => !!poss && !!api.game && api.game.time < poss.until + 1,
      hint(v, game) {
        if (!ALLOWED.has(v.type) || v.def?.boss) return '';
        const wait = readyAt - game.time;
        return wait > 0 ? ` · possess in ${Math.ceil(wait)} s` : ' · [E] POSSESS';
      },
      update(dt, input, v, game) {
        if (!api.enabled()) return false;
        if (!poss) {
          if (input.pressed('interact') && ALLOWED.has(v.type) && game.time >= readyAt && game.run?.phase === 'moon') game.net.request('tfgPossess', { cid: v.id });
          return false;
        }
        if (poss.cid !== v.id) { game.tfgSpec.cid = poss.cid; return false; }
        const yaw = game.tfgSpec.yaw;
        const f = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
        const r = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
        const mx = -Math.sin(yaw) * f + Math.cos(yaw) * r;
        const mz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
        if (input.mouseClicked(0)) poss.atk = true;
        poss.sendT -= dt;
        if (poss.sendT <= 0 || poss.atk) {
          poss.sendT = 1 / 12;
          game.net.request('tfgPossIn', { cid: poss.cid, mx: +mx.toFixed(2), mz: +mz.toFixed(2), run: input.isDown('sprint'), atk: poss.atk });
          poss.atk = false;
        }
        if (input.pressed('interact')) game.net.request('tfgUnpossess', { cid: poss.cid });
        const left = Math.max(0, Math.ceil(poss.until - game.time));
        game.ui.hud?.setSpectate(`🎮 POSSESSING ${v.def?.name || v.type} — ${left}s   [WASD] move · [Shift] run · [LMB] bite · [E] let go`);
        return true;
      },
    };

    api.on('update', (dt, game) => {
      if (game.tfgSpec && game.tfgSpec.control !== ctl) game.tfgSpec.control = ctl;
      if (poss && (!game.player.dead || game.time > poss.until + 2)) poss = null;
    });

    api.on('message', (d) => {
      const game = api.game;
      if (!game || d?.k !== 'tfg-poss') return;
      if (d.by !== game.selfId) return;
      if (d.t > 0) {
        poss = { cid: d.cid, until: game.time + d.t, sendT: 0, atk: false };
        if (game.tfgSpec) { game.tfgSpec.mode = 'creature'; game.tfgSpec.cid = d.cid; }
        game.ui.toast('You are in control. Go say hi.', 'good');
        game.sfx('ui_confirm', 0.5);
      } else {
        if (poss?.cid === d.cid) poss = null;
        readyAt = game.time + CD;
        game.ui.toast(d.why === 'time' ? 'The creature shakes you off.' : 'You let go.', 'info');
      }
    });
    api.on('sessionEnd', () => { poss = null; readyAt = 0; hostGame = null; hostCd.clear(); });
  },
});
