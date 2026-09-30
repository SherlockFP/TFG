// CREATURES12 wave 12 - installer of the four PERCEPTION creatures (docs/wave12/creatures12.md).
//   404 (c12_404), The Cookie (c12_cookie), The Echo Chamber (c12_echo), The Lag Spike (c12_lag).
//   Pure rules: creatures12_core.js; definitions + host AI + registration: creatures12_ai.js; client + net (404 look / static, cookie ribbon + pull + terminal command,
//   lag rubber-band + delayed input): creatures12_fx.js; models: models/creatures12_models.js; sounds: creatures12_sfx.js; TR + RU: creatures12_text.js.
// Net: 'c12fx' host -> client (HOST_ONLY), 'c12q' client -> host request. Everything else rides the generic creature channels (cev sp / snd / hp / die + the 'cs' rows).
// Debug (host, in a facility): kefal.game.creatures12.debug.spawn('404' | 'cookie' | 'echo' | 'lag') puts one 8 m ahead (the lag spike starts its shimmer at once, the echo has
//   an empty tape); .cookieMe() latches a cookie on YOU; .reveal(sec) forces every 404 visible on this client; .tape(n) feeds the nearest echo n fake sounds (>= 6 = replay);
//   .lagNow() puts you in a live lag zone; .state() lists the live ones.
import * as THREE from 'three';
import { addTranslations } from '../core/i18n.js';
import { registerC12Content, setC12Game } from './creatures12_ai.js';
import { TR, RU } from './creatures12_text.js';
import { registerC12Models } from '../models/creatures12_models.js';
import { ensureC12Sounds } from './creatures12_sfx.js';
import { IDS, Tape } from './creatures12_core.js';
import { installC12Fx } from './creatures12_fx.js';

const KIND = { '404': IDS.nf, nf: IDS.nf, cookie: IDS.cookie, echo: IDS.echo, lag: IDS.lag };

export function installCreatures12(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  setC12Game(g);
  registerC12Content();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  registerC12Models(mm?.creatureModels);
  const offs = [];
  let disposed = false, timer = 0, tries = 0;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const fx = installC12Fx(g, offs);
  // the recipes render into audio.buffers once an AudioContext exists (first user gesture): poll a few times, then stop
  const pump = () => {
    timer = 0;
    if (disposed) return;
    let done = false;
    try { done = ensureC12Sounds(g); } catch (e) { console.warn('c12 sounds', e); }
    if (!done && ++tries < 60) timer = setTimeout(pump, 2000);
  };
  pump();
  on('update', (dt) => { if (!disposed) fx.update(dt); });

  const ahead = (d = 8) => { const dir = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)); return g.player.pos.clone().addScaledVector(dir, d); };
  const mine = (type) => { const o = []; for (const c of g.creatures?.host?.values?.() || []) if (c.type === type && !c.dead) o.push(c); return o; };
  const debug = {
    spawn(kind = '404') {
      const id = KIND[kind];
      if (!id || !g.isHost || !g.creatures?.hostSpawn) return false;
      const c = g.creatures.hostSpawn(id, ahead(8), { zone: 'in', yaw: g.player.yaw + Math.PI });
      if (!c) return false;
      c.age = 5;
      if (id === IDS.echo) { Object.assign(c.data, { init: 1, tape: new Tape(), cool: 0, hp: c.hp }); c.setState('dormant'); }
      else if (id === IDS.lag) { Object.assign(c.data, { init: 1, cool: 0 }); c.setState('scan'); }
      return c.id;
    },
    cookieMe() {
      if (!g.isHost || !g.creatures?.hostSpawn) return false;
      const c = g.creatures.hostSpawn(IDS.cookie, g.player.pos.clone(), { zone: 'in' });
      if (!c) return false;
      Object.assign(c.data, { init: 1, retry: 0, ping: 1.6, since: 0 }); c.age = 5; c.extra = g.selfId; c.setState('follow');
      return c.id;
    },
    reveal(sec = 30) { let n = 0; for (const v of g.creatures?.views?.values?.() || []) if (v.type === IDS.nf) { (v._c12 || (v._c12 = { lit: false, rearm: 0, glitch: 0, scan: 0 })).scan = sec; n++; } return n; },
    tape(n = 6) {
      const e = mine(IDS.echo)[0];
      if (!e?.data?.tape) return 'no echo (debug.spawn("echo") first)';
      const kinds = ['drop', 'bang', 'voice', 'step']; e.data.cool = 0;
      for (let i = 0; i < n; i++) { e.data.tape.gap.step = e.data.tape.gap.voice = 0; e.data.tape.add(kinds[i % 4], 0.9); e.data.tape.t += 0.6; }
      return { events: e.data.tape.ev.length, fill: e.data.tape.fill };
    },
    lagNow() {
      if (!g.isHost || !g.creatures?.hostSpawn) return false;
      const c = g.creatures.hostSpawn(IDS.lag, g.player.pos.clone(), { zone: 'in' });
      if (!c) return false;
      Object.assign(c.data, { init: 1, cool: 0 }); c.age = 5; c.setState('active');
      return c.id;
    },
    state() {
      const out = [];
      for (const c of g.creatures?.host?.values?.() || []) if (Object.values(IDS).includes(c.type) && !c.dead) out.push({ id: c.id, type: c.type, state: c.state, extra: c.extra, x: +c.pos.x.toFixed(1), y: +c.pos.y.toFixed(1), z: +c.pos.z.toFixed(1), tape: c.data.tape?.ev.length });
      return { creatures: out, lagged: fx.lagged, cookieOnMe: !!fx.cookieOn(g.selfId) };
    },
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer); timer = 0;
    for (const o of offs.splice(0)) try { o(); } catch { /* soft */ }
    fx.dispose();
    setC12Game(null);
  }
  return { ids: IDS, debug, dispose };
}
