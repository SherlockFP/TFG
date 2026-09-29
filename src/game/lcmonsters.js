// LCMONSTERS wave 8 (docs/wave8/lcmonsters.md). Installed with `this.useModule('lcmonsters', installLcmonsters)` in game.js.
// Six "Lethal Company mod" style threats, each with ONE readable rule, a telegraph and a first-encounter caption:
//   1. Blood Witch     outdoors at dusk: paints a blood circle; in it + in her sight = curse (slow bleed). Break line of sight.
//   2. Lantern Keeper  indoors: its lantern beam MARKS you for the other creatures; snatch it from behind / smash it for a payout.
//   3. Trick-or-Treater knocks x3, offers a bucket: E = gamble (treat: loot / credits, trick: teleport, bugs, drop, static).
//   4. Cursed Scraps   ~7 % of scrap is cursed (heavy / whispers / lure / inverted controls), worth x1.6, scan tell; sell it or purge it in the ship.
//   5. The Other Side  lights blink RUN, a wall rift opens, the Rift Stalker steps out (lights flicker near it).
//   6. Mimics          Loot Mimic (scrap that bites when grabbed, breathes + twitches) and Masked (+ cursed Fan Mask scrap that calls one).
// Host-authoritative AI (lcmonsters_ai.js). Spawns are cheap to gate: game.crdirector?.canSpawn?.(type, pos) === false vetoes one; own caps:
// max 1 of each kind alive, 2 (quota 0-2) / 3 (later) scheduled per landing. Never touches scene lights (fx uses basic materials + emitter flicker).
// Net: 'lm' (host -> all, HOST_ONLY; k = ci cx bl mk os tt sn mw ml cu cc cm drop cl) and 'lmq' (client -> host request; k = mg sn tt cl).
import * as THREE from 'three';
import { addTranslations, t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { RNG } from '../core/rng.js';
import { CREATURES } from './creatures.js';
import { ITEMS, itemDef, isSellable, scrapTableFor } from './items.js';
import { MOONS } from './moons.js';
import { G } from '../physics/physics.js';
import * as C from './lcmonsters_core.js';
import { registerLcContent, csnd, LC_TYPES } from './lcmonsters_ai.js';
import { installLcFx } from './lcmonsters_fx.js';
import { registerLcModels, createLcItemModel, LC_ITEM_IDS, mimicLookOf } from '../models/lcmonsters_models.js';
import { TR, RU } from './lcmonsters_text.js';

HOST_ONLY.add('lm');
const T = C.TUNE;
const FACILITY_Y = -300;
const UP = new THREE.Vector3(0, 1, 0);

export function installLcmonsters(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  registerLcContent();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  registerLcModels(mm?.creatureModels);
  for (const id of LC_ITEM_IDS) if (mm?.itemModels && !mm.itemModels.has(id)) mm.itemModels.set(id, () => createLcItemModel(id));
  const offs = [], undo = [];
  let disposed = false;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const cursed = new Map();                               // item id -> curse kind (every peer keeps the map; the host is the only writer)
  const fx = installLcFx(g, { cursed });

  // host state
  const H = { clock: 0, day: '', plan: [], tries: new Map(), circles: new Map(), exp: new Map(), immune: new Map(), marks: new Map(), os: null,
    maskT: new Map(), maskWarned: new Set(), hit: new Map(), lureT: new Map(), cursedN: 0, spawnN: 0, tickT: 0, slowT: 0, log: [] };
  const run = () => g.run;
  const isMoon = () => run()?.phase === 'moon' && !MOONS[run()?.moon]?.company && !MOONS[run()?.moon]?.home;
  const fac = () => g.world?.facility;
  const veto = (type, pos) => { try { return g.crdirector?.canSpawn?.(type, pos) === false; } catch { return false; } };
  const alive = (type) => { let n = 0; for (const c of g.creatures?.host?.values?.() || []) if (c.type === type && !c.dead) n++; return n; };
  const players = (zone) => g.aiPlayers().filter((p) => !p.dead && !p.inShip && (!zone || p.zone === zone));
  const bc = (d) => g.net.broadcast('lm', d);
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w; undo.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  const level = () => { try { return g.rollLevel?.() || 1; } catch { return 1; } };
  const spawn = (type, pos, opts = {}) => {
    if (!CREATURES[type] || alive(type) >= (CREATURES[type].maxAlive || 1) || veto(type, pos)) return null;
    const c = g.creatures.hostSpawn(type, pos, { level: level(), affix: null, ...opts });   // affix: null = no random elite affix on top of the rule
    if (c) H.log.push([Math.round(H.clock), type]);
    return c;
  };
  const despawn = (c) => { if (c && g.creatures?.host?.has(c.id)) g.creatures.hostRemove(c.id); };

  // ------------------------------------------------------------------ spots
  function indoorSpot(minD, maxD = 1e9, want = 0) {
    const f = fac(); if (!f) return null;
    const pl = players('in');
    const early = typeof g.hostEarlySafeFilter === 'function' ? g.hostEarlySafeFilter(minD) : null;
    let best = null, bs = 1e9;
    for (const s of f.scrapSpots || []) {
      if (s.elevated) continue;
      let d = 1e9; for (const p of pl) d = Math.min(d, Math.hypot(p.pos.x - s.x, p.pos.z - s.z));
      if (pl.length && (d < minD || d > maxD)) continue;
      if (early && !early(s)) continue;
      const score = Math.abs(d - want) + Math.random() * 6;
      if (score < bs) { bs = score; best = s; }
    }
    return best ? new THREE.Vector3(best.x, best.y, best.z) : null;
  }

  // ------------------------------------------------------------------ spawners (host)
  const SPAWN = {
    witch() {
      const pl = players('out'); if (!pl.length) return false;
      const tgt = pl[Math.floor(Math.random() * pl.length)];
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, d = 38 + Math.random() * 14, x = tgt.pos.x + Math.cos(a) * d, z = tgt.pos.z + Math.sin(a) * d;
        if (Math.hypot(x, z) < 42) continue;                                                 // never at the ship / entrance
        const y = g.world.terrain?.heightAt?.(x, z) ?? tgt.pos.y;
        return !!spawn('lm_witch', new THREE.Vector3(x, y, z), { zone: 'out' });
      }
      return false;
    },
    keeper() { const p = indoorSpot(24); return !!(p && spawn('lm_keeper', p, { zone: 'in' })); },
    treat() {
      const pl = players('in'); if (!pl.length) return false;
      const p = indoorSpot(8, 22, 13); return !!(p && spawn('lm_treater', p, { zone: 'in', state: 'knock' }));
    },
    lootmimic() { const p = indoorSpot(12); return !!(p && spawn('lm_lootmimic', p, { zone: 'in' })); },
    masked() {
      const p = indoorSpot(22); if (!p) return false;
      const names = [g.profile?.name, ...[...g.remotes.values()].map((r) => r.name)].filter(Boolean);
      const nm = names[Math.floor(Math.random() * names.length)] || 'Intern';
      return !!spawn('lm_masked', p, { zone: 'in', name: nm, fakeLv: 2 + Math.floor(Math.random() * 6) });
    },
    otherside() {
      const f = fac(), pl = players('in'); if (!f || !pl.length || H.os) return false;
      const tgt = pl[Math.floor(Math.random() * pl.length)];
      const cands = (f.wallSpots || []).filter((s) => { const d = Math.hypot(s.x - tgt.pos.x, s.z - tgt.pos.z); return d > 12 && d < 30; });
      const s = cands[Math.floor(Math.random() * cands.length)]; if (!s) return false;
      const pos = new THREE.Vector3(s.x, s.y, s.z);
      if (alive('lm_hunter') || veto('lm_hunter', pos)) return false;
      H.os = { t: 0, ph: 'warn', p: [s.x, s.y, s.z], yaw: s.rotY || 0, spawned: false };
      bc({ k: 'os', ph: 'warn', p: H.os.p, yaw: H.os.yaw });
      return true;
    },
  };
  function osTick(dt) {
    const o = H.os; if (!o) return;
    o.t += dt;
    const ph = C.osPhase(o.t);
    if (ph === o.ph) return;
    o.ph = ph;
    if (ph === 'closed') { H.os = null; bc({ k: 'os', ph: 'closed', p: o.p, yaw: o.yaw }); return; }
    bc({ k: 'os', ph, p: o.p, yaw: o.yaw });
    if (ph === 'open' && !o.spawned) {
      o.spawned = true;
      const pos = new THREE.Vector3(o.p[0] + Math.sin(o.yaw) * 1.1, o.p[1], o.p[2] + Math.cos(o.yaw) * 1.1);
      spawn('lm_hunter', pos, { zone: 'in', yaw: o.yaw, state: 'emerge' });
    }
  }

  // ------------------------------------------------------------------ day plan
  function newDay() {
    const r = run(); if (!r) return;
    const q = r.quotaIndex | 0, m = MOONS[r.moon];
    H.day = r.seed + ':' + r.day; H.tries.clear(); H.cursedN = 0; H.spawnN = 0; H.os = null; H.maskT.clear(); H.maskWarned.clear(); H.hit.clear(); H.marks.clear(); H.circles.clear(); H.exp.clear(); H.immune.clear();
    H.plan = isMoon() ? C.planDay(r.seed, r.day, q, { indoor: !!fac(), outdoor: !m?.noOutdoor && !!g.world?.terrain }).map((e) => ({ ...e, done: false })) : [];
    H.log.length = 0;
  }
  function planTick() {
    const r = run(), moonT = g.hostData?.moonT || 0;
    for (const e of H.plan) {
      if (e.done) continue;
      if (e.at === 'dusk') { if (!((r.time || 0) >= T.duskMin || r.weather === 'eclipsed')) continue; }
      else if (moonT < e.at) continue;
      if ((e.next || 0) > H.clock) continue;
      let ok = false;
      try { ok = !!SPAWN[e.kind]?.(); } catch (err) { console.warn('[lcmonsters] spawn', e.kind, err); }
      if (ok) e.done = true;
      else { e.n = (e.n || 0) + 1; e.next = H.clock + 15; if (e.n >= 6) e.done = true; }
    }
  }

  // ------------------------------------------------------------------ API used by the creature behaviours
  const api = {
    circleBegin(c) {
      const id = c.id + ':' + (c.data.cn = (c.data.cn || 0) + 1);
      const mine = [...H.circles.entries()].filter(([, v]) => v.owner === c.id);
      if (mine.length >= 2) { H.circles.delete(mine[0][0]); bc({ k: 'cx', id: mine[0][0] }); }
      H.circles.set(id, { owner: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, born: H.clock, live: false });
      bc({ k: 'ci', id, x: c.pos.x, y: c.pos.y, z: c.pos.z, r: T.circleR, castS: T.castS, life: T.circleLife });
    },
    circleLive(c) { for (const v of H.circles.values()) if (v.owner === c.id && !v.live) v.live = true; },
    mark(pid, keeper) {
      const m = H.marks.get(pid), fresh = !m || m.until < H.clock;
      H.marks.set(pid, { until: H.clock + T.markT, next: m && !fresh ? m.next : H.clock + 0.4, sent: fresh ? H.clock : m.sent });
      if (fresh || H.clock - m.sent > 6) { H.marks.get(pid).sent = H.clock; g.net.sendTo(pid, 'lm', { k: 'mk', to: pid, t: T.markT }); if (keeper) csnd(g.creatures, keeper, ['bell_ding', 'glass'], 0.6, 0.8, 6, 40); }
    },
    maskedHit(pid) { H.hit.set(pid, H.clock); },
    despawn,
    state() { return { day: H.day, plan: H.plan.map((e) => ({ kind: e.kind, at: e.at, done: e.done })), circles: H.circles.size, marks: H.marks.size, os: H.os ? H.os.ph : null, cursed: cursed.size, log: H.log.slice(-20), fx: fx.state() }; },
    /** debug / test: force one kind now (host) */
    debugSpawn(kind) { return !!SPAWN[kind]?.(); },
    debugCurse(id, kind) { if (g.isHost) setCurse(id, kind); },
    cursed,
    dispose() { dispose(); },
  };
  g.lcm = api;

  // ------------------------------------------------------------------ host: blood circle exposure + marks + curses
  function circleTick(dt) {
    if (!H.circles.size) return;
    for (const [id, v] of [...H.circles]) {
      const w = g.creatures.host.get(v.owner);
      if (!w || w.dead || H.clock - v.born > T.circleLife + T.castS) { H.circles.delete(id); bc({ k: 'cx', id }); }
    }
    for (const [id, v] of H.circles) {
      if (!v.live) continue;
      const w = g.creatures.host.get(v.owner); if (!w) continue;
      const eye = new THREE.Vector3(w.pos.x, w.pos.y + 2.0, w.pos.z);
      for (const p of players('out')) {
        const inside = C.inCircle(p.pos.x, p.pos.z, v.x, v.z, T.circleR);
        const key = p.id;
        let los = false;
        if (inside) los = g.physics.lineOfSight(eye, p.eye, G.STATIC | G.DOOR);
        const imm = (H.immune.get(key) || 0) - H.clock;
        const s = C.witchStep(H.exp.get(key) || 0, inside, los, dt, imm);
        H.exp.set(key, s.exp);
        if (s.cursed) { H.immune.set(key, H.clock + T.curseImmune); g.net.sendTo(key, 'lm', { k: 'bl', to: key, t: T.bleedT }); }
      }
    }
  }
  function markTick() {
    for (const [pid, m] of [...H.marks]) {
      if (H.clock > m.until) { H.marks.delete(pid); continue; }
      if (H.clock < m.next) continue;
      m.next = H.clock + T.markPing;
      const p = g.aiPlayerById(pid);
      if (p && !p.dead && !p.inShip && p.zone === 'in') g.creatures.noise(p.pos.clone(), T.lureLoud + 0.2, pid);   // "marked": creatures nearby come to look
    }
  }

  // ------------------------------------------------------------------ cursed scraps (host assigns, everyone keeps the map)
  function setCurse(id, kind) {
    cursed.set(id, kind); bc({ k: 'cu', id, c: kind });
    g.later?.(() => { const it = g.items.get(id); if (it && !disposed) g.net.broadcast('it', { e: 'val', id, v: C.cursedValue(it.value) }); }, 120);
  }
  function maybeCurse(id, type, opts) {
    if (!g.isHost || !isMoon() || !id) return;
    const def = itemDef(type);
    if (def.kind !== 'scrap' || !def.value || def.cursed || def.mask || def.hands !== 1 || type === 'key' || type === 'body' || opts?.holder || opts?.label || opts?.soulbound || !isSellable(def)) return;
    const rng = new RNG(((C.hash32(H.day + ':cu:' + (H.spawnN++)) ^ 0xc0de) >>> 0));
    const kind = C.rollCurse(rng.fn(), run().quotaIndex | 0, H.cursedN);
    if (!kind) return;
    H.cursedN++; setCurse(id, kind);
  }
  function lureTick(dt) {
    for (const it of g.items.all()) {
      if (!it.holder || cursed.get(it.id) !== 'lure') continue;
      const p = g.aiPlayerById(it.holder); if (!p || p.dead || p.inShip) continue;
      const n = (H.lureT.get(it.id) ?? T.lureEvery * 0.5) - dt;
      if (n <= 0) { H.lureT.set(it.id, T.lureEvery); g.creatures.noise(p.pos.clone(), T.lureLoud, it.holder); } else H.lureT.set(it.id, n);
    }
  }
  function cursedGc() { for (const id of [...cursed.keys()]) if (!g.items.get(id)) { cursed.delete(id); H.lureT.delete(id); if (g.isHost) bc({ k: 'cc', id }); } }

  // ------------------------------------------------------------------ Fan Mask: carried too long it calls a Masked
  function maskTick(dt) {
    for (const it of g.items.all()) {
      if (!it.def?.mask) continue;
      const p = it.holder ? g.aiPlayerById(it.holder) : null;
      if (!p || p.dead || p.inShip) { H.maskT.delete(it.id); H.maskWarned.delete(it.id); continue; }
      const s = (H.maskT.get(it.id) || 0) + dt; H.maskT.set(it.id, s);
      const ph = C.maskPhase(s);
      if (ph >= 1 && !H.maskWarned.has(it.id)) { H.maskWarned.add(it.id); g.net.sendTo(p.id, 'lm', { k: 'mw', to: p.id }); }
      if (ph >= 2) {
        H.maskT.delete(it.id); H.maskWarned.delete(it.id);
        g.net.broadcast('it', { e: 'rm', id: it.id });
        g.net.sendTo(p.id, 'lm', { k: 'ml', to: p.id });
        const at = p.pos.clone().addScaledVector(p.look, 3).setY(p.pos.y);
        const names = [g.profile?.name, ...[...g.remotes.values()].map((r) => r.name)].filter(Boolean);
        if (p.zone === 'in') spawn('lm_masked', at, { zone: 'in', name: names[Math.floor(Math.random() * names.length)] || 'Intern', fakeLv: 3 });
      }
    }
  }
  wrap(g, 'hostOnPlayerDied', (orig) => function (id, d) {
    const r = orig.call(this, id, d);
    try {
      const t0 = H.hit.get(id);
      if (isMoon() && t0 !== undefined && H.clock - t0 < C.CONVERT_WINDOW && d?.cause === 'lm_masked') {   // finished by a Masked: you wear the mask next
        const pos = d.pos ? new THREE.Vector3().fromArray(d.pos) : (g.aiPlayerById(id)?.pos || new THREE.Vector3());
        const c = g.creatures.host;
        let n = 0; for (const q of c.values()) if (q.type === 'lm_masked' && !q.dead) n++;
        if (n < T.maskedMax + 1 && !veto('lm_masked', pos)) g.creatures.hostSpawn('lm_masked', pos.clone().add(new THREE.Vector3(0, 0.2, 0)), { zone: 'in', name: g.playerName(id), fakeLv: 3, level: 2 });
      }
    } catch (e) { console.warn('[lcmonsters] convert', e); }
    return r;
  });

  // ------------------------------------------------------------------ host: client requests ('lmq')
  const pos3 = (from) => g.aiPlayerById(from);
  function hostRequest(d, from) {
    if (!g.isHost || disposed || !isMoon() || !d) return;
    const p = pos3(from); if (!p || p.dead) return;
    const c = d.id ? g.creatures.host.get(d.id) : null;
    switch (d.k) {
      case 'mg': {                                                        // grabbed a Loot Mimic
        if (!c || c.type !== 'lm_lootmimic' || c.dead || p.pos.distanceTo(c.pos) > 3.4) return;
        c.data.woke = true; c.data.tid = from; c.data.awake = 0; c.cooldown = 0; c.stunT = 0; c.setState('attack');
        break;
      }
      case 'sn': {                                                        // snatch the Keeper's lantern from behind
        if (!c || c.type !== 'lm_keeper' || c.dead || c.state === 'dark') return;
        if (!C.canSnatch(c.pos.x, c.pos.z, c.yaw, p.pos.x, p.pos.z)) return;
        c.setState('dark');
        const v = Math.round(T.lanternValue[0] + Math.random() * (T.lanternValue[1] - T.lanternValue[0]));
        g.items.hostSpawn('lm_lantern', p.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(p.look, 0.6), { value: v });
        bc({ k: 'sn', by: from });
        csnd(g.creatures, c, ['glass_break', 'glass'], 1, 0.7, 5, 45);
        g.later?.(() => { if (!disposed && !c.dead) g.creatures.attack(c, p, c.dmg, 'lm_keeper'); }, 500);   // it shoves you off (0.4 s wind-up rule applies)
        break;
      }
      case 'tt': {                                                        // take the treat: the gamble
        if (!c || c.type !== 'lm_treater' || c.dead || c.state === 'done' || p.pos.distanceTo(c.pos) > T.treatReach + 1) return;
        const res = C.gamble(Math.random, run().quotaIndex | 0);
        c.setState('done');
        const out = { k: 'tt', to: from, r: res.r, what: res.what, n: res.credits || res.value || 0 };
        if (res.r === 'treat') {
          if (res.what === 'credits') { run().credits += res.credits; g.broadcastRun?.(['credits']); }
          else {
            const table = scrapTableFor(fac()?.layout?.theme || MOONS[run().moon]?.interior).filter(([id]) => { const dd = ITEMS[id]; return dd && !dd.cursed && !dd.mask && dd.hands === 1 && dd.value; });
            let tot = 0; for (const e of table) tot += e[1];
            let r = Math.random() * tot, id = table[0][0]; for (const e of table) { r -= e[1]; if (r <= 0) { id = e[0]; break; } }
            g.items.hostSpawn(id, p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(p.look, 0.8), { value: res.value });
          }
          csnd(g.creatures, c, ['bell_ding', 'mimic_voice_1'], 0.8, 1.4, 5, 30);
        } else {
          csnd(g.creatures, c, ['mimic_voice_2', 'sting_violin_glitch'], 0.9, 0.7, 5, 40);
          if (res.what === 'teleport') {
            const spots = (fac()?.scrapSpots || []).filter((s) => !s.elevated && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 25);
            const s = spots[Math.floor(Math.random() * spots.length)];
            if (s) g.net.sendTo(from, 'tp', { p: [s.x, s.y + 0.3, s.z], yaw: Math.random() * 6.28 }); else out.what = 'static';
          } else if (res.what === 'scuttlers') {
            for (let i = 0; i < 2; i++) if (!veto('scuttler', p.pos)) g.creatures.hostSpawn('scuttler', p.pos.clone().add(new THREE.Vector3(Math.cos(i * 3 + 1) * 4, 0, Math.sin(i * 3 + 1) * 4)), { level: 1, zone: 'in' });
          } else if (res.what === 'drop') g.net.sendTo(from, 'lm', { k: 'drop', to: from });
          if (out.what === 'static') g.hostStunPlayer(from, 1.2);
        }
        g.net.sendTo(from, 'lm', out);
        break;
      }
      case 'cl': {                                                        // purge a curse on the ship
        const it = g.items.get(d.id);
        if (!it || it.holder !== from || !cursed.has(it.id) || !p.inShip) return;
        const cost = C.cleanseCost(it.value);
        if ((run().credits || 0) < cost) { g.net.sendTo(from, 'sys', { text: 'Not enough credits to purge the curse.', k: 'Not enough credits to purge the curse.', v: {}, kind: 'bad' }); return; }
        run().credits -= cost; g.broadcastRun?.(['credits']);
        cursed.delete(it.id); bc({ k: 'cc', id: it.id });
        g.net.broadcast('it', { e: 'val', id: it.id, v: C.cleansedValue(it.value) });
        g.net.sendTo(from, 'lm', { k: 'cl', to: from, n: cost });
        break;
      }
      default: break;
    }
  }
  on('registerHandlers', (Hn, gg) => { if (gg === g) Hn('lmq', hostRequest); });
  on('netReady', (net, gg) => { if (gg === g) net.on_('lm', (d) => { if (!disposed) fx.handle(d); }); });
  on('playerJoin', (id) => { if (g.isHost && cursed.size) g.later?.(() => g.net.sendTo(id, 'lm', { k: 'cm', m: Object.fromEntries(cursed) }), 800); });

  // ------------------------------------------------------------------ client: prompts, scan tells
  on('interactables', (out) => {
    if (disposed) return;
    const p = g.player, held = p.heldItem?.();
    for (const v of g.creatures?.views?.values?.() || []) {
      if (v.state === 'dead' || !LC_TYPES.has(v.type)) continue;
      const near = v.pos.distanceTo(p.pos);
      if (near > 4) continue;
      if (v.type === 'lm_lootmimic' && (v.state === 'idle')) {
        const name = itemDef(mimicLookOf(v.spawnData?.seed || 1)).name || 'scrap';
        out.push({ pos: v.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), r: 0.7, reach: 3, label: tf('Pick up {name} [E]', { name }), sub: `▮${30 + ((v.spawnData?.seed || 1) % 70)}`, action: () => g.net.request('lmq', { k: 'mg', id: v.id }) });
      } else if (v.type === 'lm_keeper' && v.state !== 'dark') {
        const ok = C.canSnatch(v.pos.x, v.pos.z, v.yaw, p.pos.x, p.pos.z);
        out.push({ pos: v.pos.clone().add(new THREE.Vector3(0.3 * Math.cos(v.yaw), 1.05, -0.3 * Math.sin(v.yaw))).addScaledVector(new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)), 0.35), r: 0.9, reach: 2.6,
          label: ok ? t('Snatch the lantern [E]') : t('Get behind it to snatch the lantern'), sub: ok ? t('It will shove you off') : '', action: () => { if (ok) g.net.request('lmq', { k: 'sn', id: v.id }); } });
      } else if (v.type === 'lm_treater' && v.state === 'idle' && near < T.treatReach + 0.6) {
        out.push({ pos: v.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), r: 0.8, reach: 3, label: t('Take the treat [E]'), sub: t('Treat 55% / trick 45%'), action: () => g.net.request('lmq', { k: 'tt', id: v.id }) });
      }
    }
    if (p.inShip && held && cursed.has(held.id)) {
      const cost = C.cleanseCost(held.value);
      out.push({ pos: p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(p.forward().setY(0).normalize(), 1.4), r: 1.6, noLos: true, label: tf('Purge the curse (-{n} credits) [E]', { n: cost }), sub: t('Keeps most of the extra value'), action: () => g.net.request('lmq', { k: 'cl', id: held.id }) });
    }
  });
  on('scanLabels', (labels, eye, fwd, gg) => {
    if (disposed || gg !== g) return;
    const tmp = new THREE.Vector3();
    for (const it of g.items.all()) {
      const k = cursed.get(it.id); if (!k || it.state !== 'world') continue;
      it.obj.getWorldPosition(tmp);
      const l = labels.find((q) => q.type === it.type && q.pos && q.pos.distanceToSquared(tmp) < 0.01);
      if (l) { l.color = '#b58cff'; l.sub = `${l.sub} · ${tf('CURSED ×{n}', { n: T.curseValueMul })} · ${t('something whispers')}`; }
    }
    for (const v of g.creatures?.views?.values?.() || []) {                     // the Loot Mimic passes for loot on the scanner too
      if (v.type !== 'lm_lootmimic' || v.state === 'dead') continue;
      const to = tmp.copy(v.pos).sub(eye), d = to.length();
      if (d > (g.stats?.scanRange || 20) || to.normalize().dot(fwd) < 0.45) continue;
      const id = mimicLookOf(v.spawnData?.seed || 1);
      labels.push({ pos: v.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), name: itemDef(id).name, sub: tf('Value: ▮{shown}{n}', { shown: 30 + ((v.spawnData?.seed || 1) % 70), n: '' }), color: '#9fd4ff', type: id });
    }
  });

  // ------------------------------------------------------------------ hooks
  wrap(g.items, 'hostSpawn', (orig) => function (type, pos, opts = {}) { const id = orig.call(this, type, pos, opts); try { maybeCurse(id, type, opts); } catch (e) { console.warn('[lcmonsters] curse', e); } return id; });
  on('moonPopulated', (gg) => { if (gg === g && g.isHost) newDay(); });
  on('phase', (ph) => { fx.reset(); if (ph !== 'moon' && g.isHost) { H.plan = []; H.os = null; H.circles.clear(); H.marks.clear(); H.exp.clear(); H.maskT.clear(); } });
  on('localDeath', () => fx.reset());
  on('update', (dt) => {
    if (disposed) return;
    fx.update(dt);
    if (!g.isHost || !g.creatures?.host) return;
    H.clock += dt;
    if (!isMoon()) return;
    H.tickT += dt; H.slowT += dt;
    osTick(dt);
    if (H.tickT >= 0.2) { const d = H.tickT; H.tickT = 0; circleTick(d); markTick(); lureTick(d); maskTick(d); }
    if (H.slowT >= 1) { H.slowT = 0; planTick(); cursedGc(); }
  });

  function dispose() {
    if (disposed) return; disposed = true;
    for (const o of offs.splice(0)) try { o(); } catch { /* soft */ }
    for (const u of undo.splice(0)) try { u(); } catch { /* soft */ }
    fx.dispose();
    if (g.lcm === api) delete g.lcm;
  }
  return api;
}
