// CREATURES11 wave 11 - installer of the three "new rule" creatures (docs/wave11/creatures11.md).
//   The Captcha (c11_captcha), The Shadowban (c11_shadowban), The Recommender (c11_recommender).
//   Pure rules: creatures11_core.js (+ creatures11_habits.js: the Recommender's model of each player); host AI + registration: creatures11_ai.js;
//   net / client (captcha test flow, shadowban mute, banner): creatures11_fx.js; minigame: minigames/captcha.js; models: models/creatures11_models.js;
//   sounds: creatures11_sfx.js; TR + RU: creatures11_text.js.
// Net: 'c11fx' host -> all (HOST_ONLY), 'c11q' client -> host request. Everything else rides the generic creature channels.
// Debug (host, in a facility): kefal.game.creatures11.debug.spawn('captcha' | 'shadowban' | 'recommender') puts one 8 m ahead (the Captcha becomes a gate there,
//   the Shadowban marks YOU, the Recommender glows on the nearest doorway); .captchaUi() opens the tile test locally; .fakeBan(id) hides a remote on this client;
//   .predict() lists the Recommender's guess per player; .state() lists the live ones.
import * as THREE from 'three';
import { addTranslations } from '../core/i18n.js';
import { registerC11Content, setC11Game, ST, banTick } from './creatures11_ai.js';
import { TR, RU } from './creatures11_text.js';
import { registerC11Models } from '../models/creatures11_models.js';
import { ensureC11Sounds } from './creatures11_sfx.js';
import { IDS, doorCenter, doorNormal } from './creatures11_core.js';
import { Habits } from './creatures11_habits.js';
import { installC11Fx } from './creatures11_fx.js';

const KIND = { captcha: IDS.captcha, shadowban: IDS.shadowban, ban: IDS.shadowban, recommender: IDS.recommender, rec: IDS.recommender };

export function installCreatures11(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  setC11Game(g);
  registerC11Content();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  registerC11Models(mm?.creatureModels);
  const offs = [];
  let disposed = false, timer = 0, tries = 0, trackT = 0;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const fx = installC11Fx(g, offs);
  // the recipes render into audio.buffers once an AudioContext exists (first user gesture): poll a few times, then stop
  const pump = () => {
    timer = 0;
    if (disposed) return;
    let done = false;
    try { done = ensureC11Sounds(g); } catch (e) { console.warn('c11 sounds', e); }
    if (!done && ++tries < 60) timer = setTimeout(pump, 2000);
  };
  pump();

  const isMoon = () => g.run?.phase === 'moon';
  /** host: feed the Recommender's tracker with every player's doorway crossings (learning is per landing: a new layout = a new Habits) */
  function trackTick() {
    const L = g.world?.facility?.layout;
    if (!L?.edgeInfo || !isMoon()) { ST.trk = null; return; }
    if (!ST.trk || ST.trk.L !== L) ST.trk = new Habits(L);
    for (const p of g.aiPlayers()) if (p.zone === 'in' && !p.dead && !p.inShip) ST.trk.observe(p.id, p.pos.x, p.pos.z, p.crouch, g.time || 0);
  }
  on('update', (dt) => {
    if (disposed) return;
    fx.update(dt);
    if (!g.isHost) return;
    banTick(dt, g);
    trackT += dt;
    if (trackT >= 0.2) { trackT = 0; try { trackTick(); } catch (e) { console.warn('c11 track', e); } }
  });
  on('phase', () => { ST.ban = null; ST.trk = null; });

  const ahead = (d = 8) => { const dir = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)); return g.player.pos.clone().addScaledVector(dir, d); };
  const debug = {
    spawn(kind = 'captcha') {
      const id = KIND[kind];
      if (!id || !g.isHost || !g.creatures?.hostSpawn) return false;
      const yaw = g.player.yaw, pos = ahead(8);
      const c = g.creatures.hostSpawn(id, pos, { zone: 'in', yaw: yaw + Math.PI });
      if (!c) return false;
      if (id === IDS.captcha) {                       // a gate right here, facing you along your line of sight
        Object.assign(c.data, { init: 1, slide: 0, cool: {}, res: null, hp: c.hp, tid: null, askT: 0, home: { x: pos.x, z: pos.z }, n: { x: Math.sin(yaw), z: Math.cos(yaw) }, yaw0: yaw, fy: pos.y });
        c.age = 5; c.setState('dormant');
      } else if (id === IDS.shadowban) { Object.assign(c.data, { init: 1, rest: 0, tid: g.selfId }); c.age = 5; c.setState('mark'); }
      else debug.recommend(c);
      return c.id;
    },
    /** the Recommender glows on the doorway nearest to you (no learning needed) */
    recommend(c0) {
      const L = g.world?.facility?.layout;
      if (!L?.edgeInfo) return false;
      let best = null, bd = 1e9;
      for (const info of L.edgeInfo.values()) { if (info.type !== 'arch' && info.type !== 'door') continue; const p = doorCenter(L, info), d = Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z); if (d > 3 && d < bd) { bd = d; best = info; } }
      if (!best) return false;
      const n = doorNormal(best), ctr = doorCenter(L, best), side = Math.sign((g.player.pos.x - ctr.x) * n.x + (g.player.pos.z - ctr.z) * n.z) || 1, sign = -side;
      const c = c0 || g.creatures.hostSpawn(IDS.recommender, new THREE.Vector3(ctr.x, L.y, ctr.z), { zone: 'in' });
      const exit = { info: best, sign, id: `${best.key}:${sign}` };
      Object.assign(c.data, { init: 1, rest: 0, scan: 0, tid: g.selfId, pred: { exit, why: 'debug', conf: 1 }, spot: { x: ctr.x, z: ctr.z, fx: ctr.x + n.x * sign * 1.2, fz: ctr.z + n.z * sign * 1.2 }, ev0: ST.trk?.lastEvent?.(g.selfId)?.n ?? 0 });
      c.age = 5; c.pos.set(ctr.x, L.y, ctr.z); c.setState('foretell');
      return c.id;
    },
    captchaUi(seed = 7) { g.openMinigame?.('captcha', { seed, limit: 5, difficulty: 0.5, noEase: true }, (r) => console.log('captcha result', r)); },
    fakeBan(id, sec = 25) { fx.setLocalBan(id, sec); },
    banSelf() { return debug.spawn('shadowban'); },
    predict() { const out = {}; for (const p of g.aiPlayers()) { const r = ST.trk?.predict(p.id, p.pos); out[p.id] = r ? { why: r.why, conf: +r.conf.toFixed(2), exit: r.exit.id, cat: r.exit.cat } : null; } return out; },
    habits() { const o = {}; for (const [id, s] of ST.trk?.P || []) o[id] = { cats: s.cats.slice(), pend: !!s.pend, routes: [...s.trans].map(([k, m]) => [k, Object.fromEntries(m)]) }; return { stat: ST.trk?.stat, players: o }; },
    state() {
      const out = [];
      for (const c of g.creatures?.host?.values?.() || []) if (Object.values(IDS).includes(c.type) && !c.dead) out.push({ id: c.id, type: c.type, state: c.state, extra: c.extra, x: +c.pos.x.toFixed(1), y: +c.pos.y.toFixed(1), z: +c.pos.z.toFixed(1) });
      return { creatures: out, ban: ST.ban ? { ...ST.ban } : null, clientBan: fx.banned };
    },
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer); timer = 0;
    for (const o of offs.splice(0)) try { o(); } catch { /* soft */ }
    fx.dispose();
    ST.ban = null; ST.trk = null; setC11Game(null);
  }
  return { ids: IDS, debug, dispose };
}
