// FOOD & DRINKS (module `food`, docs/wave2/food.md). Installed with `this.useModule('food', installFood)` (game.js).
// No hunger meter: optional consumables that give temporary buffs (through the anomaly buff registry / left buff bar) plus social fun:
// eat / drink animations (first person + visible to others), burps, CHEERS! (2+ drinkers within 4 m in 3 s -> Liquid Courage), Party Cake sharing,
// offering food to a crewmate, the ship mess table (eat together -> Well Fed on the next landing), vending machines / fridges in facilities,
// and drunk stacking (sway, aim drift, delayed turning, slurred chat, hiccups, harmless blackouts).
//
// Net types (all prefixed 'fd'): 'fd' request (client -> host: use | offer | take | vend | pass), 'fdfx' (host -> all, HOST_ONLY),
// 'fds' (peer -> all, relayed: drunk level / squeak / hiccup / pass state so crewmates see you sway). Item consumption is host-authoritative
// (the host removes the item and announces 'ate'); effects then apply on the eater's own client.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { ITEMS, registerItem, SCRAP_TABLE } from './items.js';
import { RECIPES } from './recipes.js';
import { EMOTE_BY_ID } from './emotes.js';
import { WEAPON_ARCS } from '../models/avatar.js';
import { G } from '../physics/physics.js';
import { boxOccupied } from '../world/doorsafe.js';
import { rollMutation } from './mutations.js';
import { FOOD_MODELS, createTable, createMachine, MACHINE_SIZE, disposeGroup } from '../models/food.js';
import {
  FOODS, BUFFS, DRUNK_IDS, FOOD_SHOP, DRUNK, CHEERS, TABLE, CAKE_RADIUS, MACHINE_STOCK, TABLE_SPOTS, FOOD_RECIPES,
  applyBuffStats, rollMeat, cakeDuration, liveStacks, addStack, drunkLevel, drunkBand, drunkEffects, slurText, detectCheers, tableWellFed,
  planFoodSpots, vendPick, lootByTheme, TR, RU,
} from './food_data.js';

HOST_ONLY.add('fdfx');   // clients only take 'fdfx' broadcasts from the host

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const EXTRA_TR = { Food: 'Yiyecek', 'H: hold it out to a crewmate (they press E).': 'H: bir ekip arkadaşına uzat (E ile alır).' };
const EXTRA_RU = { Food: 'Еда', 'H: hold it out to a crewmate (they press E).': 'H: протянуть напарнику (он берёт на E).' };
addTranslations({ ...TR, ...EXTRA_TR }, 'tr');
addTranslations({ ...RU, ...EXTRA_RU }, 'ru');

// ------------------------------------------------------------------------------------------------ items (registered at import, ids stable)
for (const [id, d] of Object.entries(FOODS)) {
  if (ITEMS[id]) continue;
  registerItem({ id, name: d.name, kind: 'consumable', food: d.kind, weight: d.weight, hands: 1, tier: d.tier, value: d.value, tip: d.tip, ...(d.price ? { price: d.price, shop: FOOD_SHOP } : {}) });
}
for (const [theme, list] of Object.entries(lootByTheme())) {
  const tb = SCRAP_TABLE[theme];
  if (!Array.isArray(tb)) continue;   // only the themes that already have a table (a fresh table would replace the factory fallback)
  for (const [id, w] of list) if (!tb.some((e) => e[0] === id)) tb.push([id, w]);
}
for (const r of FOOD_RECIPES) if (!RECIPES.some((x) => x.id === r.id)) RECIPES.push({ ...r });

// first-person eat / drink arcs (the viewmodel plays WEAPON_ARCS[heldType] on the swing timeline; see the updateViewModel wrap)
const ARC_EAT = { w: 0.24, s: 0.86, trail: 0, W: { x: 0.35, y: -0.1, e: 0.8, px: -0.19, py: 0.15, pz: 0.16, wr: -0.35 }, S: { x: 0.4, y: -0.12, e: 0.98, px: -0.19, py: 0.16, pz: 0.17, wr: -0.5 } };
const ARC_DRINK = { w: 0.28, s: 0.84, trail: 0, W: { x: 0.45, y: -0.05, e: 0.95, px: -0.18, py: 0.16, pz: 0.14, wr: -0.6 }, S: { x: 0.55, y: -0.05, e: 1.1, px: -0.18, py: 0.19, pz: 0.15, wr: -1.0 } };
for (const [id, d] of Object.entries(FOODS)) if (!WEAPON_ARCS[id]) WEAPON_ARCS[id] = d.kind === 'food' ? ARC_EAT : ARC_DRINK;

// ------------------------------------------------------------------------------------------------ third-person poses (emotes not on the wheel)
function pitchAbout(root, th, h) {   // same as emotes.js (falls over about the feet)
  root.rotation.order = 'YXZ';
  root.rotation.x = th;
  const s = Math.sin(th), c = Math.cos(th), ry = root.rotation.y;
  root.position.x += Math.sin(ry) * (-h * s);
  root.position.z += Math.cos(ry) * (-h * s);
  root.position.y += h * (1 - c);
}
// the avatar does not expose its arm pivots: handR -> forearm pivot -> shoulder pivot
function raiseArm(a, shx, elx, k, shz = 0.05) {
  const el = a.parts?.handR?.parent, sh = el?.parent;
  if (!el || !sh) return;
  sh.rotation.x += (shx - sh.rotation.x) * k; el.rotation.x += (elx - el.rotation.x) * k; sh.rotation.z += (shz - sh.rotation.z) * k;
}
const env = (t, dur) => clamp01(t * 5) * clamp01((dur - t) * 5);
const EMOTES = {
  fd_eat: { dur: 1.8, fx(a, root, t, dur) { const k = env(t, dur); raiseArm(a, -1.0, -1.85, k); const bite = Math.abs(Math.sin(t * 9)); if (a.parts?.neck) a.parts.neck.rotation.x += 0.14 * k * bite; if (a.parts?.torso) a.parts.torso.rotation.x += 0.05 * k; } },
  fd_drink: { dur: 1.5, fx(a, root, t, dur) { const k = env(t, dur); raiseArm(a, -1.1, -2.1, k); if (a.parts?.neck) a.parts.neck.rotation.x -= 0.55 * k * Math.sin(Math.PI * clamp01(t / dur)); if (a.parts?.torso) a.parts.torso.rotation.x -= 0.08 * k; } },
  fd_burp: { dur: 1.2, face: 'happy', fx(a, root, t, dur) { const k = Math.sin(Math.PI * clamp01(t / dur)); if (a.parts?.torso) a.parts.torso.rotation.x -= 0.2 * k; if (a.parts?.neck) a.parts.neck.rotation.x -= 0.3 * k + Math.sin(t * 40) * 0.03 * k; } },
  fd_cheers: { dur: 1.4, face: 'happy', fx(a, root, t, dur) { const k = env(t, dur); raiseArm(a, -1.5, -0.85, k, 0.1); root.position.y += Math.abs(Math.sin(t * 7)) * 0.05 * k; } },
  fd_pass: { dur: 3, face: 'dead', fx(a, root, t, dur) { const k = clamp01(t * 3) * clamp01((dur - t) / 0.7); pitchAbout(root, (-Math.PI / 2) * k, 0.25); root.position.y += 0.15 * k; } },
};
for (const [id, e] of Object.entries(EMOTES)) if (!EMOTE_BY_ID[id]) EMOTE_BY_ID[id] = { id, name: id, icon: '', base: null, ...e };

// ------------------------------------------------------------------------------------------------ procedural sounds (no samples)
function mkNoise(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; }
function render(sr, dur, seed, fn) {
  const n = Math.max(1, Math.floor(dur * sr));
  const out = new Float32Array(n);
  const st = { ph: 0, lp: 0, rnd: mkNoise(seed), dt: 1 / sr };
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, st); out[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const g = 0.9 / peak, fade = Math.floor(sr * 0.005);
  for (let i = 0; i < n; i++) out[i] *= g * Math.min(1, i / fade, (n - 1 - i) / fade);
  return out;
}
export const FOOD_SOUNDS = {
  fd_crunch: (sr) => render(sr, 0.17, 21, (t, s) => { s.lp += (s.rnd() - s.lp) * 0.45; const k = (t % 0.045) / 0.045; return (s.rnd() * 0.6 + s.lp) * Math.exp(-k * 9) * Math.exp(-t * 9); }),
  fd_gulp: (sr) => render(sr, 0.32, 22, (t, s) => { s.ph += (150 + 200 * Math.exp(-t * 16)) * s.dt; return (Math.sin(TAU * s.ph) + 0.3 * Math.sin(TAU * s.ph * 2.1)) * Math.exp(-t * 9) * (1 + 0.3 * Math.sin(TAU * 22 * t)); }),
  fd_burp: (sr) => render(sr, 0.75, 23, (t, s) => {
    s.ph += (95 - 35 * t + 6 * Math.sin(TAU * 9 * t)) * s.dt;
    const saw = ((s.ph % 1) * 2 - 1), gate = 0.55 + 0.45 * Math.sin(TAU * 31 * t);
    s.lp += (saw + s.rnd() * 0.5 - s.lp) * 0.16;
    return s.lp * gate * Math.min(1, t / 0.04) * Math.exp(-Math.pow(t / 0.5, 2) * 2.2);
  }),
  fd_hic: (sr) => render(sr, 0.16, 24, (t, s) => { s.ph += (520 - 900 * t) * s.dt; return Math.sin(TAU * s.ph) * Math.exp(-t * 20) * (1 + 0.4 * s.rnd()); }),
  fd_pop: (sr) => render(sr, 0.42, 25, (t, s) => { s.lp += (s.rnd() - s.lp) * 0.7; return (t < 0.012 ? Math.sin(TAU * 900 * t) * 1.2 : 0) + (s.rnd() - s.lp * 0.4) * 0.35 * Math.exp(-t * 7) * Math.min(1, t / 0.02); }),
  fd_clink: (sr) => render(sr, 0.55, 26, (t) => (Math.sin(TAU * 2350 * t) * 0.6 + Math.sin(TAU * 3870 * t) * 0.35 + Math.sin(TAU * 5210 * t) * 0.18) * Math.exp(-t * 8) * Math.min(1, t / 0.002)),
};

// ------------------------------------------------------------------------------------------------ install
export function installFood(game) {
  const mods = game.mods;
  const offs = [];
  const restores = [];
  const injected = [];
  let disposed = false;
  const audio = game.audio;

  const F = {
    stacks: [], band: 0, fx: drunkEffects(0, 0), sick: false,
    eat: null, emoteId: null, emoteEnd: 0, sched: [],
    hiccup: { next: 0, n: 0, at: -9 }, pass: null, nextBlackout: 0, blackoutCd: 0, fadeSet: false,
    megaEnd: 0, wasMega: false, pendingWf: false, wfAt: 0, lastExp: 0, pingT: 3, gasT: 4, hpSync: 0, hintShown: false, lastHeld: null,
    offers: new Map(), peers: new Map(), stateT: 0, stateSig: '',
    table: null, tableTries: 0, tableAt: 1.5, machines: [], machinesFor: null, machinesFac: null, cakeFor: null, left: new Map(),
    hostEvents: [], hostTable: [], hostLast: new Map(), hostCheersCd: 0, hostOffers: new Map(), hostStock: new Map(), hostVendLast: new Map(),
    overlay: null, overlayPx: -1,
  };
  const now = () => game.time;
  const me = () => game.selfId;
  const player = () => game.player;
  const buffs = () => game.anomaly?.buffs || null;
  const hasBuff = (id) => !!buffs()?.has(id);
  const vec = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const nameOf = (id) => game.playerName?.(id) || 'Employee';
  const posOf = (id) => (id === me() ? player()?.pos : game.remotes.get(id)?.pos) || null;
  const deadOf = (id) => (id === me() ? !!player()?.dead : !!game.remotes.get(id)?.dead);
  const toast = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const okPos = (p) => Array.isArray(p) && p.length === 3 && p.every((n) => Number.isFinite(n));

  function wrap(obj, key, make) {   // instance-level wrap; dispose puts the original back
    const orig = obj?.[key];
    if (typeof orig !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const w = make(orig);
    obj[key] = w;
    restores.push(() => { if (obj[key] === w) { if (had) obj[key] = orig; else delete obj[key]; } });
  }

  // ---------------------------------------------------------------- buff defs into the anomaly registry (ONE buff system)
  const DEFS = game.anomaly?.DEFS;
  const drunkStats = (s) => { s.speedMul += F.fx.speed; s.armor = (s.armor || 0) + F.fx.armor; };
  if (DEFS) {
    for (const [id, d] of Object.entries(BUFFS)) {
      if (DEFS[id]) continue;
      DEFS[id] = { ...d, food: true, dur: 0, stats: d.drunk ? drunkStats : (s) => applyBuffStats(d, s) };
      injected.push(id);
    }
  }
  if (mods?.itemModels) for (const [id, fn] of Object.entries(FOOD_MODELS)) if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => fn());
  for (const [name, gen] of Object.entries(FOOD_SOUNDS)) { try { mods?.soundGens?.set?.(name, gen); } catch { /* optional */ } }

  function grant(id, sec) {
    const b = buffs();
    if (!b || !BUFFS[id]) return null;
    return b.add(id, sec);
  }

  // ---------------------------------------------------------------- audio / fx helpers
  function ensureSound(name) {
    if (!audio?.ctx || audio.buffers?.has(name) || !FOOD_SOUNDS[name]) return;
    try {
      const data = FOOD_SOUNDS[name](audio.ctx.sampleRate);
      const buf = audio.ctx.createBuffer(1, data.length, audio.ctx.sampleRate);
      buf.copyToChannel(data, 0);
      audio.buffers.set(name, buf);
    } catch (e) { console.warn('[food] sound', name, e); audio.buffers?.set(name, null); }
  }
  const sfx = (name, vol = 0.7, pitch) => { try { ensureSound(name); return audio?.play?.(name, { volume: vol, bus: 'sfx', pitch }); } catch { return null; } };
  const sfxAt = (name, pos, vol = 0.8, pitch, ref = 3) => { try { ensureSound(name); return audio?.at?.(name, pos, vol, { occlude: true, refDistance: ref, maxDistance: 45, pitch }); } catch { return null; } };
  const burst = (pos, opts) => { try { game.particles?.burst?.(pos, opts); } catch { /* particles optional */ } };
  const CRUMBS = { count: 10, color: [0xd6a55a, 0x9a6a2a, 0xf0d090], speed: 1.7, up: 1.4, life: 0.75, size: 0.045, gravity: 9, drag: 1.5 };
  const SPLASH = { count: 9, color: [0x9ad8ff, 0xffffff, 0x7ad0ff], speed: 1.5, up: 1.6, life: 0.6, size: 0.04, gravity: 9, drag: 1.4 };
  const CONFETTI = { count: 26, color: [0xff7ac0, 0x7ad8ff, 0xffe066, 0x8affb0], speed: 3, up: 2.6, life: 1.1, size: 0.06, gravity: 5, drag: 1.2 };
  const SPARKS = { count: 14, color: [0xffffff, 0xffe9a0, 0xb0f0ff], speed: 2.4, up: 1.2, life: 0.5, size: 0.04, gravity: 3, drag: 2 };
  const later = (sec, fn) => { F.sched.push({ t: now() + sec, fn }); };
  function setEmote(id, dur) {
    if (game.emotes?.active || player()?.dead) return;
    F.emoteId = 'x:' + id; F.emoteEnd = now() + dur;
    game.emote = F.emoteId; game.emoteT = F.emoteEnd;
  }
  const clearEmote = () => { if (F.emoteId && game.emote === F.emoteId) game.emote = null; F.emoteId = null; };

  // ---------------------------------------------------------------- drinking state (own player)
  function syncDrunk(force) {
    const b = buffs();
    const t0 = now();
    F.stacks = liveStacks(F.stacks, t0);
    const lvl = drunkLevel(F.stacks), cnt = F.stacks.length;
    F.fx = drunkEffects(lvl, cnt);
    const band = drunkBand(lvl, cnt);
    const id = band ? DRUNK_IDS[band - 1] : null;
    if (!b) { F.band = band; return; }
    if (force || band !== F.band || (id && !b.has(id))) {
      for (const d of DRUNK_IDS) if (d !== id && b.has(d)) b.remove(d, 'swap');
      if (id) { const left = Math.max(...F.stacks.map((s) => s.until)) - t0; b.add(id, Math.max(1, left)); }
      F.band = band;
      game.refreshStats?.();
      sendState(true);
    }
  }
  function addDrink(booze) {
    F.stacks = addStack(F.stacks, booze.pw, booze.sec, now());
    F.nextBlackout = Math.max(F.nextBlackout, now() + 6);
    F.hiccup.next = Math.max(F.hiccup.next, now() + 3);
    syncDrunk(true);
  }

  // ---------------------------------------------------------------- eating (local player)
  const foodHeld = () => { const it = player()?.heldItem?.(); return it && FOODS[it.type] ? it : null; };
  function startEat(it) {
    const p = player();
    if (!p || p.dead || game.minigame || disposed) return;
    if (F.eat) { toast(t('You are already eating.'), 'info'); return; }
    const fd = FOODS[it.type];
    if (!fd) return;
    F.eat = { id: it.id, ty: it.type, fd, t: 0, dur: fd.use, done: [false, false, false] };
    setEmote(fd.kind === 'food' ? 'fd_eat' : 'fd_drink', fd.use + 0.15);
    if (fd.kind !== 'food') sfx(fd.booze ? 'fd_clink' : 'fd_pop', fd.booze ? 0.35 : 0.5, 0.95 + Math.random() * 0.1);
    else sfx('fd_crunch', 0.25, 1.4);
  }
  function updateEat(dt) {
    const e = F.eat;
    if (!e) return;
    const p = player();
    if (!p || p.dead || p.heldItem?.()?.id !== e.id || game.minigame) { F.eat = null; clearEmote(); return; }
    e.t += dt;
    const prog = e.t / e.dur;
    const marks = e.fd.kind === 'food' ? [0.32, 0.52, 0.72] : [0.38, 0.55, 0.72];
    for (let i = 0; i < 3; i++) {
      if (e.done[i] || prog < marks[i]) continue;
      e.done[i] = true;
      const pitch = 0.9 + Math.random() * 0.25;
      if (e.fd.kind === 'food') { sfx('fd_crunch', 0.55, pitch); game.viewModel?.kick?.('generic'); burst(p.eyePos().add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion), 0.4), CRUMBS); }
      else { sfx('fd_gulp', 0.55, pitch); game.viewModel?.kick?.('generic'); }
    }
    if (e.t >= e.dur) {
      F.eat = null;
      const pos = p.pos;
      game.net?.request('fd', { op: 'use', id: e.id, p: [pos.x, pos.y, pos.z] });
    }
  }

  // ---------------------------------------------------------------- consumption results (own player, after the host confirmed 'ate')
  function heal(n) {
    const p = player();
    if (!p || p.dead || !(n > 0)) return;
    p.hp = Math.min(p.maxHp, p.hp + n);
    try { game.net?.send?.('pst', { hp: Math.round(p.hp) }); } catch { /* not connected */ }
    game.engine?.flash?.(0x66ff88, 0.14);
  }
  function applyEaten(ty) {
    const fd = FOODS[ty], p = player();
    if (!fd || !p || p.dead) return;
    if (fd.hp) heal(fd.hp);
    if (fd.stam) p.stamina = Math.min(p.maxStamina, p.stamina + fd.stam);
    let note = '';
    if (fd.special === 'meat') {
      const m = rollMeat(Math.random);
      grant(m.id, m.sec);
      note = `${t(BUFFS[m.id].name)}: ${t(BUFFS[m.id].desc)}`;
      toast(note, BUFFS[m.id].good ? 'good' : 'bad');
      sfx(BUFFS[m.id].good ? 'ui_confirm' : 'ui_error', 0.4);
    } else if (fd.special === 'glitch') {
      const id = rollMutation(Math.random, 0.5, [...(game.anomaly?.buffs?.list?.() || []).map((r) => r.id)]);
      game.anomaly?.grant?.(id, 25);
    } else if (fd.booze) {
      addDrink(fd.booze);
      toast(`${t(fd.name)}: ${t(BUFFS.f_drunk1.desc)}`, 'info');
    }
    for (const [id, sec] of fd.buffs || []) {
      grant(id, sec);
      if (!note) { note = `${t(BUFFS[id].name)}: ${t(BUFFS[id].desc)}`; toast(note, BUFFS[id].good ? 'good' : 'bad'); }
    }
    if (ty === 'fd_mega') { F.megaEnd = now() + 60; F.wasMega = true; }
    if (!note && fd.hp) toast(`${t(fd.name)}: +${fd.hp} HP`, 'good');
    else if (!note && fd.stam) toast(`${t(fd.name)}: +${fd.stam}`, 'good');
    game.mods?.emit('tfg:ate', ty, fd);   // [survival] packaged snacks feed the hunger meter a little
  }

  // ---------------------------------------------------------------- net: host side
  const aliveNear = (pos, r) => {
    const out = [];
    for (const id of [me(), ...game.remotes.keys()]) {
      const q = posOf(id);
      if (!q || deadOf(id) || q.distanceTo(pos) > r) continue;
      out.push(id);
    }
    return out;
  };
  const aliveCount = () => 1 + [...game.remotes.values()].filter((r) => !r.dead).length;
  function hostUse(d, from) {
    if (!game.isHost) return;
    const it = game.items.get(d.id);
    if (!it || it.holder !== from) return;
    const fd = FOODS[it.type];
    if (!fd) return;
    const t0 = now();
    if (t0 - (F.hostLast.get(from) ?? -9) < 0.5) return;
    F.hostLast.set(from, t0);
    const pos = posOf(from);
    if (!pos) return;
    game.net.broadcast('it', { e: 'rm', id: it.id });   // consumed
    const p3 = [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)];
    game.net.broadcast('fdfx', { k: 'ate', by: from, ty: it.type, p: p3 });
    if (fd.special === 'cake') {
      const ids = aliveNear(pos, CAKE_RADIUS).slice(0, 8);
      game.net.broadcast('fdfx', { k: 'cake', ids, by: from, p: p3, dur: cakeDuration(ids.length) });
    }
    if (fd.kind === 'drink' || fd.kind === 'booze') {
      F.hostEvents = F.hostEvents.filter((e) => t0 - e.t <= CHEERS.window + 1 && e.id !== from);
      F.hostEvents.push({ id: from, t: t0, p: p3 });
      const ids = detectCheers(F.hostEvents, t0);
      if (ids && t0 >= F.hostCheersCd) {
        F.hostCheersCd = t0 + CHEERS.cooldown;
        F.hostEvents = F.hostEvents.filter((e) => !ids.includes(e.id));
        const cs = ids.map(posOf).filter(Boolean);
        const c = cs.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, cs.length));
        game.net.broadcast('fdfx', { k: 'cheers', ids: ids.slice(0, 8), p: [+c.x.toFixed(2), +(c.y + 1.4).toFixed(2), +c.z.toFixed(2)] });
      }
    }
    if (F.table && Math.hypot(pos.x - F.table.x, pos.z - F.table.z) <= TABLE.radius && pos.y < 2.5) {
      F.hostTable = F.hostTable.filter((e) => t0 - e.t <= TABLE.window);
      F.hostTable.push({ id: from, t: t0 });
      const ids = tableWellFed(F.hostTable, t0, aliveCount());
      if (ids.length) { F.hostTable = []; game.net.broadcast('fdfx', { k: 'wf', ids: ids.slice(0, 8) }); }
      else game.net.sendTo(from, 'fdfx', { k: 'tm', to: from });
    }
  }
  function hostOffer(d, from) {
    const it = game.items.get(d.id);
    if (!it || it.holder !== from || !FOODS[it.type]) return;
    F.hostOffers.set(from, { id: it.id, ty: it.type, until: now() + 15 });
    game.net.broadcast('fdfx', { k: 'offer', by: from, ty: it.type });
  }
  function hostTake(d, from) {
    const giver = String(d.from || '');
    const off = F.hostOffers.get(giver);
    const t0 = now();
    if (!off || off.until < t0 || giver === from) { game.net.sendTo(from, 'fdfx', { k: 'err', to: from, msg: 'Slow down, chef.' }); return; }
    const it = game.items.get(off.id);
    const a = posOf(giver), b = posOf(from);
    if (!it || it.holder !== giver || !a || !b || a.distanceTo(b) > 6 || deadOf(from) || deadOf(giver)) return;
    F.hostOffers.delete(giver);
    game.net.broadcast('it', { e: 'rm', id: it.id });
    game.items.hostSpawn(off.ty, b.clone().add(new THREE.Vector3(0, 1, 0)), { holder: from, value: 0 });
    game.net.broadcast('fdfx', { k: 'gave', by: giver, to: from, ty: off.ty });
  }
  function hostVend(d, from) {
    const m = F.machines[d.i | 0];
    const b = posOf(from);
    const t0 = now();
    if (!m || !b || deadOf(from) || b.distanceTo(m.pos) > 5) return;
    if (t0 - (F.hostVendLast.get(from) ?? -9) < 1) return;
    F.hostVendLast.set(from, t0);
    const left = F.hostStock.has(m.i) ? F.hostStock.get(m.i) : MACHINE_STOCK[m.kind];
    if (left <= 0) { game.net.sendTo(from, 'fdfx', { k: 'vend', i: m.i, left: 0, to: from, empty: 1 }); return; }
    F.hostStock.set(m.i, left - 1);
    const ty = vendPick(m.kind, Math.random);
    const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    game.items.hostSpawn(ty, m.pos.clone().addScaledVector(fwd, 0.75).add(new THREE.Vector3(0, 0.45, 0)), { linvel: [fwd.x * 0.6, 0.3, fwd.z * 0.6] });
    game.net.broadcast('fdfx', { k: 'vend', i: m.i, left, p: [m.pos.x, m.pos.y + 1, m.pos.z] });
  }

  // ---------------------------------------------------------------- net: everyone (host broadcasts 'fdfx')
  function onFx(d) {
    if (!d || typeof d !== 'object') return;
    if (d.to && d.to !== me()) return;
    if (d.k === 'ate') onAte(d);
    else if (d.k === 'cheers') onCheers(d);
    else if (d.k === 'cake') onCake(d);
    else if (d.k === 'wf') { if (Array.isArray(d.ids) && d.ids.includes(me())) getWellFed(); }
    else if (d.k === 'tm') toast(t('Table meal. Eat with the crew to get Well Fed.'), 'info');
    else if (d.k === 'offer') onOffer(d);
    else if (d.k === 'gave') {
      const item = t(FOODS[d.ty]?.name || '');
      if (d.to === me()) toast(tf('{name} handed you {item}.', { name: nameOf(d.by), item }), 'good');
      else if (d.by === me()) toast(tf('You handed {item} to {name}.', { item, name: nameOf(d.to) }), 'good');
      F.offers.delete(d.by);
    } else if (d.k === 'pass') { if (d.by !== me()) { toast(tf('{name} passed out.', { name: nameOf(d.by) }), 'info'); const q = posOf(d.by); if (q) sfxAt('thud_heavy', q.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.6); } }
    else if (d.k === 'vend') onVend(d);
    else if (d.k === 'err') toast(t(String(d.msg || '')), 'bad');
  }
  function onAte(d) {
    const fd = FOODS[d.ty];
    if (!fd || !okPos(d.p)) return;
    const pos = vec(d.p);
    const mouth = pos.clone().add(new THREE.Vector3(0, 1.45, 0));
    if (d.by !== me()) { burst(mouth, fd.kind === 'food' ? CRUMBS : SPLASH); sfxAt(fd.kind === 'food' ? 'fd_crunch' : 'fd_gulp', mouth, 0.55, 0.9 + Math.random() * 0.2); }
    else if (fd.kind !== 'food') burst(mouth.clone().add(new THREE.Vector3(0, -0.2, 0)), SPLASH);
    if (fd.fizzy) later(0.55, () => { sfxAt('fd_burp', mouth, 0.9, 0.85 + Math.random() * 0.3, 4); if (d.by === me()) setEmote('fd_burp', 1.2); });
    if (d.by === me()) applyEaten(d.ty);
  }
  function onCheers(d) {
    if (!okPos(d.p)) return;
    const pos = vec(d.p);
    const mine = Array.isArray(d.ids) && d.ids.includes(me());
    sfxAt('fd_clink', pos, 0.9, 0.95 + Math.random() * 0.1, 5);
    burst(pos, SPARKS);
    if (!mine) return;
    toast(t('CHEERS!'), 'good');
    game.engine?.flash?.(0xffd35a, 0.22);
    setEmote('fd_cheers', 1.4);
    grant('f_cheers', 60);
    sfx('ui_confirm', 0.4);
  }
  function onCake(d) {
    if (!okPos(d.p)) return;
    const pos = vec(d.p).add(new THREE.Vector3(0, 1.2, 0));
    burst(pos, CONFETTI);
    if (Array.isArray(d.ids) && d.ids.includes(me())) {
      grant('f_cake', Math.max(30, Math.min(150, Number(d.dur) || 60)));
      toast(t('Cake Day. Everyone nearby is happy.'), 'good');
      sfx('ui_levelup', 0.4);
    }
  }
  function getWellFed() {
    F.pendingWf = true;
    toast(t('Well Fed: the next landing starts on a full stomach.'), 'good');
    const ph = game.run?.phase;
    if (ph === 'moon' || ph === 'company') F.wfAt = now() + 0.2;
  }
  function onOffer(d) {
    const ty = FOODS[d.ty] ? d.ty : null;
    if (!ty || typeof d.by !== 'string') return;
    F.offers.set(d.by, { ty, until: now() + 15 });
    if (d.by === me()) toast(tf('You hold out the {item}. A crewmate can take it with E.', { item: t(FOODS[ty].name) }), 'info');
  }
  function onVend(d) {
    const m = F.machines[d.i | 0];
    F.left.set(d.i | 0, Math.max(0, d.left | 0));
    if (d.empty) { toast(t(m?.kind === 'fridge' ? 'It is empty.' : 'It hums. Nothing comes out.'), 'info'); sfx('ui_error', 0.4); return; }
    if (okPos(d.p)) { sfxAt('fd_pop', vec(d.p), 0.8, 0.8, 5); sfxAt('thud_heavy', vec(d.p).add(new THREE.Vector3(0, -0.5, 0)), 0.5, 1.2, 4); }
  }

  // ---------------------------------------------------------------- crew state (drunk sway / squeak / hiccups / passed out), 'fds'
  function sendState(force) {
    if (!game.net?.send) return;
    const st = { l: +F.fx.level.toFixed(1), c: F.fx.count, sq: hasBuff('f_cringe') ? 1 : 0, sk: hasBuff('f_meat_sick') ? 1 : 0, hi: F.hiccup.n, ps: F.pass ? 1 : 0 };
    const sig = JSON.stringify(st);
    if (!force && sig === F.stateSig && now() - F.stateT < 2) return;
    F.stateSig = sig; F.stateT = now();
    try { game.net.send('fds', st); } catch { /* not connected yet */ }
  }
  function onPeerState(d, from) {
    if (from === me() || !d || typeof d !== 'object') return;
    const old = F.peers.get(from);
    const hi = d.hi | 0;
    const rec = { l: Math.max(0, Math.min(12, Number(d.l) || 0)), c: Math.max(0, Math.min(8, d.c | 0)), sq: d.sq ? 1 : 0, sk: d.sk ? 1 : 0, hi, hicAt: old?.hicAt ?? -9, at: now() };
    if (old && hi !== old.hi) {
      rec.hicAt = now();
      const q = posOf(from);
      if (q) sfxAt('fd_hic', q.clone().add(new THREE.Vector3(0, 1.5, 0)), 0.5, 0.9 + Math.random() * 0.3, 3);
    }
    F.peers.set(from, rec);
  }

  // ---------------------------------------------------------------- drunk: input lag / drift, camera sway, hiccups, blackouts
  const lag = { x: 0, y: 0 };
  let inPlayerUpdate = false, playerDt = 1 / 60;
  const pl = player();
  if (pl) wrap(pl, 'update', (orig) => function (dt, input) {
    inPlayerUpdate = true; playerDt = dt;
    try { return orig.call(this, dt, input); } finally { inPlayerUpdate = false; }
  });
  if (game.input) wrap(game.input, 'consumeMouse', (orig) => function () {
    const r = orig.call(this);
    const fx = F.fx;
    if (!inPlayerUpdate || fx.level <= 0 || F.pass) return r;
    const k = 1 - Math.exp(-fx.lagRate * playerDt);   // delayed turning: the look input is low-pass filtered
    lag.x += r.dx; lag.y += r.dy;
    const ox = lag.x * k, oy = lag.y * k;
    lag.x -= ox; lag.y -= oy;
    const t0 = now();
    return { dx: ox + Math.sin(t0 * 0.63 + 1.7) * fx.drift * playerDt, dy: oy + Math.sin(t0 * 0.41) * fx.drift * 0.5 * playerDt };   // aim drift
  });
  // slurred chat (commands untouched)
  wrap(game, 'sendChat', (orig) => function (text) {
    try { if (F.fx.level > 0 && typeof text === 'string' && !text.startsWith('/')) text = slurText(text, F.fx.level, Math.random, F.fx.count); } catch { /* chat must never break */ }
    return orig.call(this, text);
  });
  // squeaky footsteps (Cringe Juice), local and crew
  wrap(game, 'footstep', (orig) => function (pos, vol, local) {
    const r = orig.call(this, pos, vol, local);
    try {
      let sq = false;
      if (local) sq = hasBuff('f_cringe');
      else for (const rp of game.remotes.values()) if (rp.pos === pos) { sq = !!F.peers.get(rp.id)?.sq && now() - F.peers.get(rp.id).at < 4; break; }
      if (sq && audio?.has?.('squeak')) {
        const pitch = 0.85 + Math.random() * 0.6;
        if (local) audio.play('squeak', { volume: 0.32, bus: 'sfx', pitch });
        else audio.at('squeak', pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.5, { occlude: true, refDistance: 2.5, maxDistance: 26, pitch });
      }
    } catch { /* audio optional */ }
    return r;
  });
  // first-person eat / drink: play the item's arc (WEAPON_ARCS[heldType]) on the viewmodel swing timeline, without touching the real swingAnim
  wrap(game, 'updateViewModel', (orig) => function (dt) {
    const e = F.eat;
    if (e && player()?.heldItem?.()?.id === e.id) {
      const sv = this.swingAnim;
      this.swingAnim = Math.max(0.001, 1 - Math.min(0.999, e.t / e.dur));
      try { return orig.call(this, dt); } finally { this.swingAnim = sv; }
    }
    return orig.call(this, dt);
  });

  function hiccup() {
    F.hiccup.n = (F.hiccup.n + 1) & 255; F.hiccup.at = now();
    sfx('fd_hic', 0.55, 0.9 + Math.random() * 0.3);
    game.engine?.punch?.(-0.035, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.03);
    sendState(true);
  }
  function startBlackout() {
    const p = player();
    F.pass = { t0: now(), dur: DRUNK.blackoutDur };
    p.stunT = Math.max(p.stunT || 0, DRUNK.blackoutDur);
    if (p.heldItem?.()) game.dropHeld?.(false);   // you fall and drop what you hold (funny, not lethal)
    setEmote('fd_pass', DRUNK.blackoutDur + 0.3);
    if (game.engine && !game.engine.fadeTarget) { game.engine.fadeTarget = 0.9; F.fadeSet = true; }
    toast(t('You blacked out.'), 'bad');
    sfx('thud_heavy', 0.7, 0.8);
    game.net?.request?.('fd', { op: 'pass' });
    sendState(true);
  }
  function endBlackout() {
    F.pass = null; F.blackoutCd = now() + DRUNK.blackoutCooldown;
    if (F.fadeSet && game.engine) game.engine.fadeTarget = 0;
    F.fadeSet = false;
    clearEmote();
    toast(t('You come to. You dropped what you were holding.'), 'info');
    sendState(true);
  }
  function localSway(dt) {
    const p = player();
    if (!p || p.dead || game.emotes?.active) return;
    const sickLvl = F.sick ? 0.9 : 0;
    const fx = F.fx.level > 0 ? F.fx : (sickLvl > 0 ? drunkEffects(sickLvl, 1) : null);
    const cam = game.camera;
    if (F.pass) {   // falling over: the camera drops and rolls, then gets up
      const u = clamp01((now() - F.pass.t0) / F.pass.dur);
      const k = clamp01(u * 5) * clamp01((1 - u) * 3.5);
      cam.position.y -= 1.05 * k; cam.rotation.z += 1.25 * k; cam.rotation.x -= 0.3 * k;
    } else if (fx) {
      const rm = game.settings?.reduceMotion ? 0.4 : 1;
      const t0 = now() * fx.freq * TAU;
      cam.rotation.z += Math.sin(t0) * fx.roll * rm;
      cam.rotation.x += Math.sin(t0 * 0.7 + 1) * fx.roll * 0.45 * rm;
      cam.rotation.y += Math.sin(t0 * 0.5 + 2) * fx.roll * 0.4 * rm;
      const yaw = p.yaw;
      cam.position.x += Math.cos(yaw) * Math.sin(t0 * 0.8) * fx.weave * rm;
      cam.position.z += -Math.sin(yaw) * Math.sin(t0 * 0.8) * fx.weave * rm;
      const hop = now() - F.hiccup.at;
      if (hop < 0.3) cam.position.y += Math.sin(Math.PI * hop / 0.3) * 0.05;
    }
    // screen blur
    if (typeof document !== 'undefined') {
      const px = fx && !F.pass ? Math.round((fx === F.fx ? fx.blur : 0.6) * 4) / 4 : 0;
      if (px !== F.overlayPx) {
        F.overlayPx = px;
        if (px > 0 && !F.overlay) {
          F.overlay = document.createElement('div');
          F.overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;';
          (document.getElementById('ui') || document.body).appendChild(F.overlay);
        }
        if (F.overlay) { F.overlay.style.backdropFilter = px > 0 ? `blur(${px}px) saturate(1.15)` : 'none'; F.overlay.style.webkitBackdropFilter = F.overlay.style.backdropFilter; }
      }
    }
  }

  // ---------------------------------------------------------------- per-frame buff effects
  function coffeePing() {
    const p = player();
    const eye = p.eyePos();
    const labels = [];
    for (const v of game.creatures.views.values()) {
      if (v.state === 'dead' || v.hidden || v.type === 'web') continue;
      const c = v.pos.clone().add(new THREE.Vector3(0, (v.height || 1.6) * 0.6, 0));
      const dist = c.distanceTo(eye);
      if (dist > BUFFS.f_coffee.ping) continue;
      labels.push({ pos: c, name: `${v.def?.name || '???'}`, sub: `${Math.round(dist)} m`, color: '#ffd9a0' });
    }
    if (labels.length) { game.scanFx?.reveal?.(labels); game.ui?.hud?.showScan?.(labels, 0); sfx('ui_scan', 0.25); }
  }
  function buffFx(dt) {
    const p = player();
    if (!p || p.dead) return;
    const b = buffs();
    if (!b) return;
    // regeneration (hps of every active buff)
    let hps = 0;
    for (const r of b.list()) if (BUFFS[r.id]?.hps) hps += BUFFS[r.id].hps;
    if (hps > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + hps * dt);
      F.hpSync += dt;
      if (F.hpSync >= 1) { F.hpSync = 0; try { game.net?.send?.('pst', { hp: Math.round(p.hp) }); } catch { /* not connected */ } }
    }
    if (b.has('f_coffee')) { F.pingT -= dt; if (F.pingT <= 0) { F.pingT = 7; coffeePing(); } } else F.pingT = 2.5;
    if (b.has('f_meat_gas')) {
      F.gasT -= dt;
      if (F.gasT <= 0) { F.gasT = 4.5 + Math.random() * 3; sfxAt('fd_burp', p.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0.85, 0.8 + Math.random() * 0.3, 5); game.balance?.noise?.(p.pos, 0.55); setEmote('fd_burp', 1.1); }
    } else F.gasT = 3;
    F.sick = b.has('f_meat_sick');
    // The Crash after Mega Engagement runs out (not when a landing / takeoff cleared the buff early)
    const mega = b.has('f_mega');
    if (F.wasMega && !mega) {
      if (now() >= F.megaEnd - 0.6) { grant('f_crash', 40); toast(`${t(BUFFS.f_crash.name)}: ${t(BUFFS.f_crash.desc)}`, 'bad'); }
      F.wasMega = false;
    }
    if (mega) F.wasMega = true;
    // courage: refund a share of every STATIC gain (booze + Liquid Courage)
    const an = game.anomaly;
    if (an && typeof an.exposure === 'number') {
      const cut = 1 - (1 - (F.fx.courage || 0)) * (1 - (b.has('f_cheers') ? BUFFS.f_cheers.courage : 0));
      const d = an.exposure - F.lastExp;
      if (cut > 0 && d > 0.001) { try { an.addExposure(-d * cut); } catch { /* anomaly optional */ } }
      F.lastExp = an.exposure;
    }
    // Well Fed lands with the next landing (the anomaly module clears buffs on phase changes, so grant a beat later)
    if (F.pendingWf && F.wfAt > 0 && now() >= F.wfAt) { F.pendingWf = false; F.wfAt = 0; grant('f_wellfed', TABLE.wellFedSec); toast(`${t(BUFFS.f_wellfed.name)}: ${t(BUFFS.f_wellfed.desc)}`, 'good'); }
  }

  // ---------------------------------------------------------------- ship table + world machines
  function placeTable() {
    F.tableTries++;
    const ship = game.ship?.group;
    for (const [x, z, ry = 0] of TABLE_SPOTS) {
      const q = Math.round(ry / (Math.PI / 2)) & 1;   // [wave5] quarter turns: ry = PI / 2 puts the stools along x (world/shiplayout.js TABLE_SPOTS)
      if (boxOccupied(game.physics, x, 0.9, z, q ? 1.15 : 0.95, 0.85, q ? 0.95 : 1.15, G.STATIC | G.DOOR)) continue;
      const model = createTable();
      model.position.set(x, 0, z); model.rotation.y = ry;
      (ship || game.scene).add(model);
      const cols = [], c = Math.cos(ry), sn = Math.sin(ry);
      for (const [cx, cy, cz, hx, hy, hz] of model.userData.colliders) { try { cols.push(game.physics.addStaticBox(x + cx * c + cz * sn, cy, z - cx * sn + cz * c, q ? hz : hx, hy, q ? hx : hz, 0, G.STATIC, { kind: 'static' })); } catch { /* physics optional */ } }
      F.table = { x, z, model, cols, pos: new THREE.Vector3(x, 0, z) };
      return;
    }
  }
  function disposeTable() {
    const tb = F.table;
    if (!tb) return;
    for (const c of tb.cols) { try { game.physics?.removeCollider(c); } catch { /* already gone */ } }
    disposeGroup(tb.model);
    F.table = null;
  }
  function disposeMachines() {
    for (const m of F.machines) { try { game.physics?.removeCollider(m.col); } catch { /* gone */ } disposeGroup(m.model); }
    F.machines = [];
  }
  function buildMachines() {
    disposeMachines();
    const fac = game.world?.facility, run = game.run;
    F.machinesFac = fac || null;
    F.machinesFor = run?.seed ?? null;
    F.left.clear(); F.hostStock.clear();
    if (!fac || !run || (run.phase !== 'moon' && run.phase !== 'landing')) return;
    const plan = planFoodSpots(fac.scrapSpots, run.seed);
    plan.machines.forEach((m, i) => {
      const model = createMachine(m.kind);
      model.position.set(m.x, m.y, m.z);
      model.rotation.y = m.yaw;
      game.scene.add(model);
      const S = MACHINE_SIZE[m.kind];
      let col = null;
      try { col = game.physics.addStaticBox(m.x, m.y + S.h / 2, m.z, (Math.abs(Math.cos(m.yaw)) > 0.5 ? S.w : S.d) / 2, S.h / 2, (Math.abs(Math.cos(m.yaw)) > 0.5 ? S.d : S.w) / 2, 0, G.STATIC, { kind: 'static' }); } catch { /* physics optional */ }
      F.machines.push({ i, kind: m.kind, yaw: m.yaw, model, col, pos: new THREE.Vector3(m.x, m.y, m.z) });
    });
    if (game.isHost && plan.cake && F.cakeFor !== run.seed) {
      F.cakeFor = run.seed;
      game.items.hostSpawn('fd_cake', new THREE.Vector3(plan.cake.x, plan.cake.y + 0.5, plan.cake.z), {});
    }
  }

  // ---------------------------------------------------------------- interactables
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game) return;
    const p = player();
    if (!p || p.dead) return;
    const held = p.heldItem?.();
    const near = (q, r) => q && p.pos.distanceTo(q) < r;
    if (F.table && near(F.table.pos, 4.5)) {
      const eatable = held && FOODS[held.type];
      out.push({
        pos: new THREE.Vector3(F.table.x, 0.95, F.table.z), r: 1.2, reach: 3.4,
        label: eatable ? t('Eat here [E]') : t('Ship table [E]'),
        sub: eatable ? '' : t('Hold food or a drink and press E. Eat together: Well Fed on the next landing.'),
        action: () => { if (eatable) startEat(held); else sfx('ui_error', 0.3); },
      });
    }
    for (const m of F.machines) {
      if (!near(m.pos, 6)) continue;
      const left = F.left.has(m.i) ? F.left.get(m.i) : MACHINE_STOCK[m.kind];
      out.push({
        pos: m.pos.clone().add(new THREE.Vector3(Math.sin(m.yaw) * 0.55, 1.15, Math.cos(m.yaw) * 0.55)), r: 0.95, reach: 3.2,
        label: t(m.kind === 'fridge' ? 'Fridge [E]' : 'Vending Machine [E]'), sub: tf('{n} left', { n: left }),
        action: () => game.net.request('fd', { op: 'vend', i: m.i }),
      });
    }
    if (p.slots?.some((s) => !s)) {
      for (const [id, off] of F.offers) {
        if (id === me() || off.until < now()) continue;
        const r = game.remotes.get(id);
        if (!r || r.dead || !near(r.pos, 3.6)) continue;
        out.push({
          pos: new THREE.Vector3(r.pos.x, r.pos.y + 1.15, r.pos.z), r: 0.9, reach: 3.6,
          label: tf('Take {item} from {name} [E]', { item: t(FOODS[off.ty].name), name: r.name || nameOf(id) }),
          action: () => game.net.request('fd', { op: 'take', from: id }),
        });
      }
    }
  }));

  // ---------------------------------------------------------------- events
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled || !FOODS[it.type]) return;
    hk.handled = true;
    startEat(it);
  }));
  offs.push(mods.on('netReady', (net, g) => {
    if (g !== game) return;
    try { net.relayTypes?.add?.('fds'); } catch { /* relay is best effort */ }
    net.on_('fdfx', (d) => onFx(d));
    net.on_('fds', (d, from) => onPeerState(d, from));
    offs.push(net.on('peerLeave', (id) => { F.peers.delete(id); F.offers.delete(id); F.hostOffers.delete(id); }));
  }));
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('fd', (d, from) => {
      if (!d || typeof d !== 'object') return;
      if (d.op === 'use') hostUse(d, from);
      else if (d.op === 'offer') hostOffer(d, from);
      else if (d.op === 'take') hostTake(d, from);
      else if (d.op === 'vend') hostVend(d, from);
      else if (d.op === 'pass') game.net.broadcast('fdfx', { k: 'pass', by: from });
    });
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if ((ph === 'landing' || ph === 'moon') && F.pendingWf) F.wfAt = now() + 0.3;
  }));
  offs.push(mods.on('localDeath', (c, g) => {
    if (g !== game) return;
    F.stacks = []; F.eat = null; F.pass = null; F.pendingWf = false; F.wasMega = false; lag.x = lag.y = 0;
    if (F.fadeSet && game.engine) game.engine.fadeTarget = 0;
    F.fadeSet = false;
    clearEmote();
    syncDrunk(true);
  }));
  offs.push(mods.on('remoteAvatar', (r) => {
    if (disposed || !r) return;
    const st = F.peers.get(r.id);
    const on = st && now() - st.at < 4 && !r.dead && (st.l > 0 || st.sk);
    if (!on) { if (r._fdOn) { r._fdOn = false; if (!r.emoteDef) { r.root.rotation.z = 0; r.root.rotation.x = 0; } } return; }
    const fx = drunkEffects(Math.max(st.l, st.sk ? 0.9 : 0), Math.max(1, st.c));
    const seed = (r.id.charCodeAt(0) || 0) * 0.37;
    const t0 = now() * fx.freq * TAU + seed;
    r._fdOn = true;
    r.root.rotation.order = 'YXZ';
    if (!r.emoteDef) { r.root.rotation.z = Math.sin(t0) * fx.roll * 1.7; r.root.rotation.x = Math.sin(t0 * 0.7 + 1) * fx.roll * 0.9; }
    const a = r.avatar?.parts;
    if (a?.torso) a.torso.rotation.z += Math.sin(t0 + 0.6) * fx.roll * 2.2;
    if (a?.neck) a.neck.rotation.z += Math.sin(t0 * 1.3) * fx.roll * 1.6;
    const yaw = r.yaw || 0;
    r.root.position.x += Math.cos(yaw) * Math.sin(t0 * 0.8) * fx.weave * 1.4;
    r.root.position.z += -Math.sin(yaw) * Math.sin(t0 * 0.8) * fx.weave * 1.4;
    const hop = now() - (st.hicAt ?? -9);
    if (hop >= 0 && hop < 0.3) r.root.position.y += Math.sin(Math.PI * hop / 0.3) * 0.06;
  }));

  // ---------------------------------------------------------------- frame
  function update(dt) {
    if (disposed) return;
    const p = player();
    if (!p) return;
    // scheduled one-shots
    for (let i = F.sched.length - 1; i >= 0; i--) if (now() >= F.sched[i].t) { const s = F.sched.splice(i, 1)[0]; try { s.fn(); } catch (e) { console.warn('[food] sched', e); } }
    if (F.emoteId && now() > F.emoteEnd) clearEmote();
    if (!p.dead) {
      const inp = game.input;
      const held = p.heldItem?.();
      if (held && FOODS[held.type] && F.lastHeld !== held.id && !F.hintShown) { F.hintShown = true; toast(t('H: hold it out to a crewmate (they press E).'), 'info'); }
      F.lastHeld = held?.id || null;
      if (inp?.enabled && inp.codePressed?.('KeyH')) {
        if (held && FOODS[held.type]) game.net?.request('fd', { op: 'offer', id: held.id });
        else toast(t('Hold food or a drink to offer it.'), 'info');
      }
      updateEat(dt);
      buffFx(dt);
      syncDrunk(false);
      const fx = F.fx;
      // hiccups + blackouts from 3 drinks on
      if (fx.hiccupEvery > 0 && !F.pass) {
        if (now() >= F.hiccup.next) { F.hiccup.next = now() + fx.hiccupEvery * (0.7 + Math.random() * 0.6); hiccup(); }
      }
      if (fx.blackout > 0 && !F.pass && now() >= F.nextBlackout) {
        F.nextBlackout = now() + DRUNK.blackoutEvery;
        if (now() >= F.blackoutCd && Math.random() < fx.blackout) startBlackout();
      }
      if (F.pass && now() - F.pass.t0 >= F.pass.dur) endBlackout();
      localSway(dt);
      sendState(false);
    }
    // table / machines (built once the ship + facility exist)
    if (!F.table && F.tableTries < 4 && now() >= F.tableAt) { placeTable(); F.tableAt = now() + 3; }
    const fac = game.world?.facility, seed = game.run?.seed;
    if (fac !== F.machinesFac || (fac && F.machinesFor !== seed)) buildMachines();
    for (const [id, o] of F.offers) if (o.until < now()) F.offers.delete(id);
    for (const [id, o] of F.hostOffers) if (o.until < now()) F.hostOffers.delete(id);
    // creature drops are wired below (host)
  }
  let updErrs = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game) return;
    try { update(dt); } catch (e) { if (++updErrs <= 3) console.warn('[food] update', e); }   // a food bug must never break the frame loop
  }));

  // Mystery Meat: creatures sometimes drop it (host; a few per landing)
  let meatDrops = 0, meatFor = null;
  wrap(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig.call(this, c, by);
    try {
      if (game.isHost && c && !c._fdMeat && !c.def?.hazard && !c.def?.boss && c.maxHp && c.pos) {
        c._fdMeat = true;
        const key = `${game.run?.seed}:${game.run?.day}`;
        if (meatFor !== key) { meatFor = key; meatDrops = 0; }
        if (meatDrops < 3 && Math.random() < (c.elite ? 0.35 : 0.1)) {
          meatDrops++;
          game.items.hostSpawn('fd_meat', c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), {});
        }
      }
    } catch (e) { console.warn('[food] meat drop', e); }
    return r;
  });

  offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));

  // ---------------------------------------------------------------- public API (debug / other modules)
  const api = {
    FOODS, BUFFS,
    get drunk() { return { level: F.fx.level, count: F.fx.count, band: F.band, stacks: F.stacks.length }; },
    /** consume without an item (debug / harness): runs the local results for that item type */
    consume(ty) { applyEaten(ty); },
    drink(ty = 'fd_lager') { const b = FOODS[ty]?.booze; if (b) addDrink(b); },
    state: () => ({ eat: !!F.eat, band: F.band, stacks: F.stacks.length, pass: !!F.pass, table: F.table ? [F.table.x, F.table.z] : null, machines: F.machines.map((m) => [m.kind, m.pos.x | 0, m.pos.z | 0]), peers: F.peers.size, pendingWf: F.pendingWf }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      for (const id of injected) delete DEFS[id];
      try { for (const id of DRUNK_IDS) game.anomaly?.buffs?.remove?.(id, 'swap'); } catch { /* ignore */ }
      if (F.fadeSet && game.engine) game.engine.fadeTarget = 0;
      F.overlay?.remove(); F.overlay = null;
      disposeTable(); disposeMachines();
      clearEmote();
    },
  };
  return api;
}
