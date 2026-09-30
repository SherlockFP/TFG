// SWARM11 wave 11 - CREATURE ECOLOGY: creatures that interact with loot, light and each other (docs/wave11/swarm11.md).
//   SCRAPERS (sw_scraper + sw_nest)  a colony carries LOOSE scrap to a glowing nest; raid it and the swarm wakes.
//   THE STREAMER (sw_streamer)       never attacks; goes LIVE and pulls every calm creature within 30 m to it. Break the ring light, or lure it away and use it.
//   AUTOMOD (sw_automod)             deletes bodies, dropped items, chalk and blood; flags (telegraphed heavy hit) anyone who lingers next to a body.
// Pure rules swarm11_core.js; host AI + registration swarm11_ai.js; models models/swarm11_models.js; sounds swarm11_sfx.js; client visuals swarm11_fx.js; TR + RU swarm11_text.js.
// EXTENDS the wave-1 horde creatures (Collector carry helpers, Janitor Bot fx style) and the horror chalk store; nothing is duplicated.
// Net: ONE host -> all message 'swfx' (HOST_ONLY; k = blood brm sync aim say del ring live raid). Everything else rides the generic creature channels (cev / cs rows; `extra` = nest fill, ring health, flag meter).
// Debug (host): kefal.game.swarm11.debug.colony() / streamer() / goLive() / automod() / body() / dropScrap() / blood() / smashNest() / state()
import * as THREE from 'three';
import { addTranslations } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { RNG, hashString } from '../core/rng.js';
import { MOONS } from './moons.js';
import { poolFor } from './threatpool.js';
import * as C from './swarm11_core.js';
import { registerSw11Content, setSwGame, resetHost, hostTick, spawnColony, addBloodStain, H } from './swarm11_ai.js';
import { TR, RU } from './swarm11_text.js';
import { registerSw11Models } from '../models/swarm11_models.js';
import { ensureSw11Sounds } from './swarm11_sfx.js';
import { installSw11Fx } from './swarm11_fx.js';

HOST_ONLY.add('swfx');
const { IDS } = C;

export function installSwarm11(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  setSwGame(g);
  registerSw11Content();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  registerSw11Models(mm?.creatureModels);
  const offs = [], undo = [];
  let disposed = false, tickT = 0, timer = 0, tries = 0;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const fx = installSw11Fx(g);
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w; undo.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const isMoon = () => g.run?.phase === 'moon' && !MOONS[g.run?.moon]?.company && !MOONS[g.run?.moon]?.home;

  // the recipes render into audio.buffers once an AudioContext exists (created on the first user gesture): poll a few times, then stop
  const pump = () => {
    timer = 0;
    if (disposed) return;
    let done = false;
    try { done = ensureSw11Sounds(g); } catch (e) { console.warn('sw11 sounds', e); }
    if (!done && ++tries < 60) timer = setTimeout(pump, 2000);
  };
  pump();

  // ------------------------------------------------------------------ net (host -> all)
  on('netReady', (net, gg) => { if (gg === g) net.on_('swfx', (d) => { if (!disposed) fx.handle(d); }); });
  on('playerJoin', (id) => {   // late joiners get the current blood stains (creature state rides the normal creature snapshot)
    if (!g.isHost || !H.blood.length) return;
    g.later?.(() => { if (!disposed) g.net.sendTo(id, 'swfx', { k: 'sync', blood: H.blood.map((b) => [b.id, b.x, b.y, b.z, b.s]) }); }, 1500);
  });

  // ------------------------------------------------------------------ blood: where the crew got hurt (host records, everybody draws; the AutoMod cleans it)
  wrap(g, 'hostHurtPlayer', (orig) => function (id, dmg, cause, ...rest) {
    try {
      if (isMoon() && dmg >= 5 && cause !== 'left') {
        const p = g.aiPlayerById(id);
        if (p && !p.dead && !p.inShip && p.zone === 'in') addBloodStain(g, p.pos.x, p.pos.y, p.pos.z, C.bloodSize(dmg, false));
      }
    } catch (e) { console.warn('[swarm11] blood', e); }
    return orig.call(this, id, dmg, cause, ...rest);
  });
  wrap(g, 'hostOnPlayerDied', (orig) => function (id, d, ...rest) {
    try {
      if (isMoon() && d?.cause !== 'left' && d?.pos) addBloodStain(g, d.pos[0], d.pos[1], d.pos[2], C.bloodSize(0, true));
    } catch (e) { console.warn('[swarm11] death blood', e); }
    return orig.call(this, id, d, ...rest);
  });

  // ------------------------------------------------------------------ colony: one per moon sometimes (host, seeded by the run so a rebuilt world agrees)
  function seedColony() {
    if (!g.isHost || !isMoon()) return null;
    const run = g.run, moon = MOONS[run.moon];
    resetHost(); fx.reset();
    const rng = new RNG(hashString(`swarm11:${run.seed}:${run.moon}:${run.day | 0}:${run.quotaIndex | 0}`));
    let inPool = false;
    try { inPool = !!poolFor(run, moon)?.ids?.includes(IDS.scraper); } catch { /* pool is optional */ }
    if (!(rng.next() < C.colonyChance(inPool, run.quotaIndex | 0))) return null;
    return spawnColony(g, rng, run.quotaIndex | 0);
  }
  on('moonPopulated', (gg) => { if (gg === g && g.isHost) { try { seedColony(); } catch (e) { console.warn('[swarm11] colony', e); } } });
  on('phase', (ph) => { fx.reset(); if (ph !== 'moon') resetHost(); });
  on('update', (dt) => {
    if (disposed) return;
    fx.update(dt);
    if (!g.isHost || !g.creatures?.host || !isMoon()) return;
    tickT += dt;
    if (tickT >= C.TUNE.colony.tickMs / 1000) { tickT = 0; try { hostTick(g); } catch (e) { console.warn('[swarm11] tick', e); } }
  });

  // ------------------------------------------------------------------ debug (host, in a facility)
  const ahead = (m = 8) => { const dir = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)); return g.player.pos.clone().addScaledVector(dir, m); };
  const mob = (type) => { const out = []; for (const c of g.creatures?.host?.values?.() || []) if (c.type === type && !c.dead) out.push(c); return out; };
  const spawn = (type, pos, o = {}) => g.creatures?.hostSpawn?.(type, pos, { zone: 'in', level: 1, affix: null, variant: null, yaw: g.player.yaw + Math.PI, ...o });
  const debug = {
    /** a nest 10 m ahead + n bots around it (bypasses the moon roll) */
    colony(n = 6) {
      if (!g.isHost) return false;
      const at = ahead(10), nest = spawn(IDS.nest, at, { state: 'idle' });
      if (!nest) return false;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; spawn(IDS.scraper, at.clone().add(new THREE.Vector3(Math.cos(a) * 2, 0, Math.sin(a) * 2)), { state: 'walk', data: { nest: nest.id } }); }
      return nest.id;
    },
    streamer() { return g.isHost ? !!spawn(IDS.streamer, ahead(9), { state: 'walk' }) : false; },
    /** skip the cooldown: every streamer starts its LIVE countdown now */
    goLive() { let n = 0; for (const c of mob(IDS.streamer)) { if (c.data.broken) continue; c.data.init = 1; c.data.cool = 0; c.setState('boot'); n++; } return n; },
    automod() { return g.isHost ? !!spawn(IDS.automod, ahead(10), { state: 'walk' }) : false; },
    /** a body item 3 m ahead (the AutoMod wants it; stand next to it to get flagged) */
    body() { return g.isHost ? g.items.hostSpawn('body', ahead(3).add(new THREE.Vector3(0, 0.6, 0)), { value: 0, label: 'Test Intern' }) : null; },
    /** a scrap item 3 m ahead that counts as a player-dropped one for 20 s already (AutoMod) and as loose scrap (Scrapers) */
    dropScrap(type = 'bolt') {
      if (!g.isHost) return null;
      const id = g.items.hostSpawn(type, ahead(3).add(new THREE.Vector3(0, 0.6, 0)), {});
      const it = g.items.get?.(id); if (it) { it.dropHolder = g.selfId; H.drops.set(id, (g.time || 0) - 20); }
      return id;
    },
    blood(size = 1.2) { if (g.isHost) addBloodStain(g, g.player.pos.x, g.player.pos.y, g.player.pos.z, size); return H.blood.length; },
    smashNest() { let n = 0; for (const c of mob(IDS.nest)) { g.creatures.damage(c.id, 9999, g.selfId); n++; } return n; },
    state() {
      const out = [];
      for (const c of g.creatures?.host?.values?.() || []) if (C.ALL_IDS.includes(c.type) && !c.dead) out.push({ id: c.id, type: c.type, state: c.state, extra: typeof c.extra === 'number' ? +c.extra.toFixed(2) : c.extra, hp: c.hp, heap: c.data.heap?.length, x: +c.pos.x.toFixed(1), z: +c.pos.z.toFixed(1) });
      return { creatures: out, blood: H.blood.length, drops: H.drops.size, cands: H.cands.length, stats: { ...H.stats } };
    },
  };

  function dispose() {
    if (disposed) return; disposed = true;
    if (timer) clearTimeout(timer); timer = 0;
    for (const o of offs.splice(0)) try { o(); } catch { /* soft */ }
    for (const u of undo.splice(0).reverse()) try { u(); } catch { /* soft */ }
    fx.dispose(); resetHost(); setSwGame(null);
  }
  return { ids: IDS, debug, fx, dispose };
}
