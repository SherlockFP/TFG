// CREATURES12 wave 12 - net + client side of the perception creatures (docs/wave12/creatures12.md).
//   404       per-client look of every 404: hidden / glitch outline (a flashlight beam crossing it, 0.3 s) / revealed (scanner pulse 2.5 s, scout drone view); screen static
//             that grows with its proximity and ramps to the burst during the wind-up.
//   COOKIE    the TRACKING ENABLED ribbon on the victim after 6 s, the hold-E pull on a cookied crewmate (client hold -> host validates), the terminal command COOKIES / COOKIES CLEAR.
//   LAG       the lag zone on the local player: rubber-band every ~1.5 s to where you were 0.8 s ago + 0.28 s delayed movement input (wraps input.isDown / pressed on the
//             instance, restored on dispose), a LAG chip.
// Net (prefix c12): 'c12fx' host -> client (HOST_ONLY) { k: 'pulled' {by, v} | 'cleared' {v, n} | 'noship' | 'none' }, 'c12q' client -> host request { k: 'pull', cid } | { k: 'clear' }.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { t, tf } from '../core/i18n.js';
import { IDS, TUNE, nfLook, glitchStep, staticLevel, ribbonOn, pullDone, PosHistory, inZone, bandStep, delayedDown } from './creatures12_core.js';
import { pullCookie, clearCookies, hearNoise } from './creatures12_ai.js';

HOST_ONLY.add('c12fx');
const TN = TUNE.nf, TC = TUNE.ck, TL = TUNE.lag;
const DELAYED = ['forward', 'back', 'left', 'right', 'sprint', 'crouch'];
const PLATE = 'position:fixed;left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;max-width:min(92vw,420px);padding:6px 12px 8px;text-align:center;'
  + 'background:var(--t-panel,#120d08);color:var(--t-paper,#ffd9b8);font-family:"TFG Plate","TFG Plate Cyr",VT323,monospace;';

export function installC12Fx(g, offs) {
  const undo = [];
  let disposed = false, T = 0, staticOn = false, wrapT = 0;
  const on = (ev, fn) => { const off = g.mods?.on?.(ev, fn); if (typeof off === 'function') offs.push(off); };
  const views = () => g.creatures?.views?.values?.() || [];
  const ui = (s, k = 'info') => { try { g.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const dom = (css, html = '') => { if (typeof document === 'undefined') return null; const e = document.createElement('div'); e.style.cssText = PLATE + css; e.innerHTML = html; e.style.display = 'none'; (g.ui?.root || document.body).appendChild(e); return e; };
  const wrapInst = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return null;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w; undo.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
    return orig;
  };

  // ================================================================================================ 404
  function nfTick(dt) {
    const drone = !!g.gear11?.state?.pilot, me = g.player?.pos;
    let near = 1e9, wind = 0;
    for (const v of views()) {
      if (v.type !== IDS.nf) continue;
      const s = v._c12 || (v._c12 = { lit: false, rearm: 0, glitch: 0, scan: 0 });
      s.scan = Math.max(0, s.scan - dt);
      const dead = v.state === 'dead';
      const lit = !dead && !!g.isLitByFlashlight?.(v.pos, TN.flashR);
      const r = glitchStep(s, lit, dt, TN); s.lit = r.lit; s.rearm = r.rearm; s.glitch = r.glitch;
      const dcam = g.camera ? v.pos.distanceTo(g.camera.position) : 0;
      v.model?.setLook?.(nfLook({ dead, drone: drone && dcam < TN.droneR, scan: s.scan, glitch: s.glitch }));
      if (dead || !me) continue;
      const d = Math.hypot(v.pos.x - me.x, v.pos.z - me.z);
      if (Math.abs(v.pos.y - me.y) < 6 && d < near) near = d;
      if (v.state === 'windup' && d < TN.staticR + 4) wind = Math.max(wind, typeof v.extra === 'number' ? v.extra : 0);
    }
    const fx = g.engine?.fx;
    if (!fx) return;
    const lvl = g.player?.dead ? 0 : staticLevel(near, wind, TN);
    if (lvl > 0.01) { fx.noise = Math.max(fx.noise || 0, lvl); staticOn = true; }
    else if (staticOn) { fx.noise = 0; staticOn = false; }
  }
  /** scanner pulse: every 404 within range with a clear line shows for 2.5 s (and gets a scan label) */
  on('scanLabels', (labels, eye, fwd, gg) => {
    if (gg !== g || disposed) return;
    for (const v of views()) {
      if (v.type !== IDS.nf || v.state === 'dead') continue;
      const tg = new THREE.Vector3(v.pos.x, v.pos.y + 1.1, v.pos.z);
      if (tg.distanceTo(eye) > Math.min(TN.scanR, (g.stats?.scanRange || TN.scanR) + 4)) continue;
      if (g.physics && !g.physics.lineOfSight(eye, tg, G.STATIC | G.DOOR)) continue;
      (v._c12 || (v._c12 = { lit: false, rearm: 0, glitch: 0, scan: 0 })).scan = TN.scanReveal;
      labels.push({ pos: new THREE.Vector3(v.pos.x, v.pos.y + 2.5, v.pos.z), name: t('404'), sub: t('NOT FOUND'), color: '#62e8ff', type: 'creature' });
    }
  });

  // ================================================================================================ COOKIE
  const ribbon = dom('top:110px;border:2px solid var(--t-bad,#ff5a48);opacity:.88;min-width:250px;',
    '<div class="c12r-t" style="font-size:20px;letter-spacing:2px;color:var(--t-bad,#ff5a48)"></div><div class="c12r-s" style="font-size:15px;margin-top:2px"></div>');
  if (ribbon) { ribbon.querySelector('.c12r-t').textContent = t('TRACKING ENABLED'); ribbon.querySelector('.c12r-s').textContent = t('A cookie is on your back. A teammate can pull it off, or CLEAR COOKIES at the ship terminal.'); }
  const pullHud = dom('bottom:22%;border:1px solid var(--t-line,#a86);min-width:220px;',
    '<div class="c12p-t" style="font-size:18px"></div><div style="margin-top:4px;height:6px;background:#05080a;border:1px solid var(--t-line,#552)"><i class="c12p-b" style="display:block;height:100%;width:0;background:var(--t-good,#7dff9a)"></i></div>');
  const lagChip = dom('top:64px;border:2px solid var(--t-bad,#ff5a48);min-width:150px;', '<div class="c12l-t" style="font-size:22px;letter-spacing:2px"></div><div class="c12l-s" style="font-size:14px"></div>');
  undo.push(() => { ribbon?.remove(); pullHud?.remove(); lagChip?.remove(); });
  let ribbonShown = false, held = 0, pullCd = 0, pullFor = null;
  const cookieOn = (id) => { for (const v of views()) if (v.type === IDS.cookie && v.state === 'follow' && v.extra === id) return v; return null; };
  function cookieTick(dt) {
    const p = g.player;
    // the victim's ribbon
    const mine = cookieOn(g.selfId), show = !!mine && !p?.dead && ribbonOn(mine.stateT || 0, TC);
    if (show !== ribbonShown) { ribbonShown = show; if (ribbon) ribbon.style.display = show ? 'block' : 'none'; if (show) { try { g.sfx?.('c12_cookie_ribbon', 0.5); } catch { /* audio optional */ } } }
    // the hold-E pull on a cookied crewmate in front of you
    pullCd = Math.max(0, pullCd - dt);
    let tgt = null;
    if (p && !p.dead && !p.downed && !g.minigame && !g.terminal?.active && g.input?.enabled && g.remotes) {
      const eye = p.eyePos?.(), fwd = p.forward?.();
      if (eye && fwd) for (const [id, r] of g.remotes) {
        if (r.dead || !r.pos) continue;
        const ck = cookieOn(id); if (!ck) continue;
        const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d > TC.pullR || Math.abs(r.pos.y - p.pos.y) > 2) continue;
        const dot = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / (d * Math.hypot(fwd.x, fwd.z) || 1) : 1;
        if (dot < 0.35 && d > 1.0) continue;
        tgt = { id, r, ck }; break;
      }
    }
    if (tgt && g.input.isDown('interact') && pullCd <= 0) {
      if (pullFor !== tgt.ck.id) { pullFor = tgt.ck.id; held = 0; }
      held += dt;
      if (pullDone(held, TC)) { g.net.request('c12q', { k: 'pull', cid: tgt.ck.id }); held = 0; pullCd = 0.8; }
    } else { held = 0; pullFor = null; }
    if (pullHud) {
      pullHud.style.display = tgt ? 'block' : 'none';
      if (tgt) {
        pullHud.querySelector('.c12p-t').textContent = tf('Hold [E]: pull the cookie off {name}', { name: tgt.r.name || t('a crewmate') });
        pullHud.querySelector('.c12p-b').style.width = Math.min(100, held / TC.pull * 100) + '%';
      }
    }
  }

  // terminal: COOKIES (status) / COOKIES CLEAR (victim, aboard the ship)
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.commands) {
    const cmd = {
      fn: (rest, term) => {
        const sub = String(rest?.[0] || '').toLowerCase();
        if (sub === 'clear') { g.net.request('c12q', { k: 'clear' }); term.print(t('Clearing cookies...')); return; }
        const n = cookieOn(g.selfId) ? 1 : 0;
        term.print(n ? t('Cookies detected on your back. Type COOKIES CLEAR aboard the ship to remove them.') : t('No cookies detected. Type COOKIES CLEAR to clear them when you are aboard the ship.'));
      },
      help: 'cookies on your back: COOKIES CLEAR removes them (aboard only)', owner: null,
    };
    mm.commands.set('cookies', cmd);
    undo.push(() => { if (mm.commands.get('cookies') === cmd) mm.commands.delete('cookies'); });
  }

  // ================================================================================================ LAG
  const hist = new PosHistory(TL.hist), bs = { t: 0, next: TL.snapFirst };
  const keys = [];      // [{ t, st }] the real key state per frame (delayed copies are served while lagged)
  const jumpQ = [];     // times of real jump presses
  let lagged = false, origDown = null, origPressed = null, warnScan = false;
  const inp = g.input;
  if (inp && typeof inp.isDown === 'function') {
    origDown = wrapInst(inp, 'isDown', (orig) => function (action) { return lagged && DELAYED.includes(action) ? delayedDown(keys, T, action, TL.delay) : orig.call(this, action); });
    origPressed = wrapInst(inp, 'pressed', (orig) => function (action) {
      if (lagged && action === 'jump') { if (jumpQ.length && jumpQ[0] <= T - TL.delay) { jumpQ.shift(); return true; } return false; }
      return orig.call(this, action);
    });
  }
  function lagTick(dt) {
    const p = g.player;
    if (!p || !inp) return;
    // record the real input (before the delay) and the position history
    if (origDown) {
      const st = {}; for (const a of DELAYED) st[a] = !!origDown.call(inp, a);
      keys.push({ t: T, st }); while (keys.length > 2 && T - keys[0].t > 1.2) keys.shift();
      if (origPressed && origPressed.call(inp, 'jump')) jumpQ.push(T);
      while (jumpQ.length && jumpQ[0] < T - 1.5) jumpQ.shift();
    }
    hist.push(T, p.pos.x, p.pos.y, p.pos.z);
    let zone = null, warn = null;
    for (const v of views()) {
      if (v.type !== IDS.lag) continue;
      if (v.state !== 'active' && v.state !== 'scan') continue;
      if (inZone(p.pos, v.pos, TL)) { if (v.state === 'active') zone = v; else warn = v; }
    }
    const eligible = !p.dead && !p.downed && !p.latched && !p.frozen && !g.minigame;
    const was = lagged;
    lagged = !!zone && eligible;
    warnScan = !!warn && !lagged && eligible;
    if (!lagged) { if (was) { jumpQ.length = 0; } }
    if (bandStep(bs, lagged, dt, TL)) {
      const q = hist.at(T - TL.snapBack);
      if (q && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 0.35) {
        p.teleport(new THREE.Vector3(q.x, q.y, q.z));
        hist.clear(); hist.push(T, q.x, q.y, q.z);
        try { g.engine?.flash?.(0x6a3aff, 0.2); g.sfx?.('c12_lag_snap', 0.6); } catch { /* fx optional */ }
      }
    }
    if (lagChip) {
      lagChip.style.display = lagged || warnScan ? 'block' : 'none';
      if (lagged || warnScan) {
        lagChip.querySelector('.c12l-t').textContent = lagged ? tf('LAG {ms} ms', { ms: 900 + ((T * 37) % 99 | 0) }) : t('LAG INCOMING');
        lagChip.querySelector('.c12l-t').style.color = lagged ? 'var(--t-bad,#ff5a48)' : 'var(--t-warn,#ffb84a)';
        lagChip.querySelector('.c12l-s').textContent = lagged ? t('PACKET LOSS - leave the ring') : t('Leave the ring');
        lagChip.style.opacity = lagged ? (Math.sin(T * 14) > -0.4 ? '1' : '0.6') : '0.85';
      }
    }
  }

  // ================================================================================================ net
  function onFx(d) {
    if (disposed || !d) return;
    const me = g.selfId;
    if (d.k === 'pulled') { if (d.v === me) ui(t('A teammate pulled the cookie off your back.'), 'good'); else if (d.by === me) ui(t('Cookie removed.'), 'good'); }
    else if (d.k === 'cleared') { if (d.v === me) ui(tf('Cookies cleared: {n}.', { n: d.n | 0 }), 'good'); }
    else if (d.k === 'noship') ui(t('You can only clear cookies aboard the ship.'), 'warn');
    else if (d.k === 'none') ui(t('No cookies on you.'), 'info');
  }
  on('registerHandlers', (Hn, gg) => {
    if (gg !== g) return;
    Hn('c12q', (d, from) => {
      if (!d || typeof d !== 'object') return;
      if (d.k === 'pull') pullCookie(g.creatures, String(d.cid), from);
      else if (d.k === 'clear') {
        const n = clearCookies(g.creatures, from);
        g.net.sendTo(from, 'c12fx', n < 0 ? { k: 'noship' } : n === 0 ? { k: 'none' } : { k: 'cleared', v: from, n });
      }
    });
  });
  on('netReady', (net, gg) => { if (gg === g) net.on_('c12fx', onFx); });
  if (g.net?.on_) g.net.on_('c12fx', onFx);   // installed after netReady already fired
  const hideAll = () => { for (const e of [ribbon, pullHud, lagChip]) if (e) e.style.display = 'none'; ribbonShown = false; lagged = false; hist.clear(); keys.length = 0; jumpQ.length = 0; };
  on('phase', hideAll);
  on('localDeath', hideAll);

  function update(dt) {
    if (disposed) return;
    T += dt;
    // host: every noise() near a listening Echo Chamber goes onto its tape (wrapped on the instance, restored on dispose)
    wrapT -= dt;
    if (wrapT <= 0 && g.isHost && g.creatures && !g.creatures._c12wrapped) {
      wrapT = 1;
      if (wrapInst(g.creatures, 'noise', (orig) => function (pos, loud, owner) { if (owner !== 'c12_echo') { try { hearNoise(this, pos, loud); } catch { /* soft */ } } return orig.call(this, pos, loud, owner); })) g.creatures._c12wrapped = true;
    }
    try { nfTick(dt); } catch (e) { if (!nfTick.warned) { nfTick.warned = 1; console.warn('c12 404', e); } }
    try { cookieTick(dt); } catch (e) { if (!cookieTick.warned) { cookieTick.warned = 1; console.warn('c12 cookie', e); } }
    try { lagTick(dt); } catch (e) { if (!lagTick.warned) { lagTick.warned = 1; console.warn('c12 lag', e); } }
  }
  function dispose() {
    disposed = true;
    if (staticOn && g.engine?.fx) g.engine.fx.noise = 0;
    for (const u of undo.splice(0)) try { u(); } catch { /* soft */ }
    if (g.creatures) delete g.creatures._c12wrapped;
    lagged = false;
  }
  return { update, dispose, get lagged() { return lagged; }, get held() { return held; }, cookieOn, hist, bs };
}
