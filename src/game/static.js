// ANOMALY / STATIC: per-player "radiation" exposure 0-100. Hot rooms in facilities (seeded), hot items, containment breach and glitch
// moons feed it; the ship, the Decon Shower, Antivirus Shots and Almond Water clean it; the Faraday Suit resists it; the Signal Counter
// clicks faster near sources. Stages: Clean 0-24 / Buzzing 25 / Glitching 50 / Corrupted 75 / DELETED 100 (6 s collapse, warning at 90).
// Each player owns their own exposure (client side); the stage is broadcast ('anst') so crewmates see the glow.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t } from '../core/i18n.js';
import { registerItem, ITEMS } from './items.js';
import { RECIPES } from './recipes.js';
import { MOONS } from './moons.js';
import { FACILITY_Y } from '../world/facility.js';
import { insideShip } from '../world/ship.js';
import { createHaze, createDecon, DECON } from '../models/anomaly.js';
import { BAD_MUT } from './mutations.js';
import { G } from '../physics/physics.js';

// ------------------------------------------------------------------------------------------------ numbers (docs/wave2/anomaly.md)
export const STAGES = [
  { id: 'clean', name: 'CLEAN', at: 0, color: '#6fdc8c' },
  { id: 'buzzing', name: 'BUZZING', at: 25, color: '#5dffd0' },
  { id: 'glitching', name: 'GLITCHING', at: 50, color: '#c58aff' },
  { id: 'corrupted', name: 'CORRUPTED', at: 75, color: '#ff4fd0' },
  { id: 'deleted', name: 'DELETED', at: 100, color: '#ff3a3a' },
];
export const STATIC_NUM = {
  warnAt: 90, collapseSec: 6, glitchEvery: 60, glitchFirst: 20,
  decayShip: 3.0, decayIndoor: 0.25, decayOutdoor: 0.5,
  faradayMul: 0.32, antivirusCut: 60, antivirusImmuneSec: 15, almondCut: 20, deconSec: 3.5,
  carryHot: { gpu: 0.4, reactor: 0.35, cryptorig: 0.25, fac_core: 0.45, legacy_core: 0.5 },   // per second while carried (floor items: half within 4 m)
  zoneBase: { core: 2.2, generator: 1.7, server: 1.5, boiler: 1.3, lab: 1.3, reactor: 1.6 },
  breachZoneMul: 1.5, breachAmbient: 0.3, failureAmbient: 0.6, glitchMoon: 0.16, overclock: 0.8,
  senseFall: 8, exposeFall: 3,
};
/** Early game is gentle: quota 0 = x0.5, quota 1 = x0.7, then full. */
export const earlyMul = (q) => (q <= 0 ? 0.5 : q === 1 ? 0.7 : 1);
/** Stage index for an exposure with 2-point hysteresis on the way down. */
export function stageOf(exp, prev = 0) {
  let s = 0;
  for (let i = 1; i < STAGES.length; i++) if (exp >= STAGES[i].at) s = i;
  if (s < prev && exp >= STAGES[prev].at - 2) return prev;
  return s;
}
/** Pure: rate (per s) of one zone at a point. box = {x0,x1,z0,z1,y0,base}; fall = falloff distance outside the room. */
export function zoneRate(z, x, y, zz, fall) {
  if (Math.abs(y - z.y0) > 9) return 0;
  const dx = Math.max(z.x0 - x, 0, x - z.x1), dz = Math.max(z.z0 - zz, 0, zz - z.z1);
  const d = Math.hypot(dx, dz);
  if (d >= fall) return 0;
  return z.base * (d <= 0 ? 1 : Math.pow(1 - d / fall, 1.5));
}
export const HOT_ROOM = /^(core|generator|server|serverfarm|rack|boiler|reactor|lab)/i;
/** Pure: pick hot rooms of a layout. Returns [{ id, type, x0,x1,z0,z1,y0,h,base }]. */
export function planHotZones(L, seed, quota) {
  const rooms = (L?.rooms || []).filter((r) => HOT_ROOM.test(r.type || ''));
  if (!rooms.length) return [];
  const rng = new RNG(((seed ^ 0xa70a1) >>> 0) || 1);
  const core = rooms.filter((r) => r.type === 'core');
  const rest = rng.shuffle(rooms.filter((r) => r.type !== 'core').sort((a, b) => a.id - b.id));
  const want = quota >= 2 ? 2 : 1;
  const pick = [...core, ...rest].slice(0, want);
  const C = L.cell;
  return pick.map((r) => ({
    id: r.id, type: r.type, x0: L.ox + r.x * C, x1: L.ox + (r.x + r.w) * C, z0: L.oz + r.z * C, z1: L.oz + (r.z + r.h) * C,
    y0: L.y ?? FACILITY_Y, h: r.height || 4.4, base: STATIC_NUM.zoneBase[String(r.type).replace(/farm$/, '')] || STATIC_NUM.zoneBase.lab,
  }));
}

// ------------------------------------------------------------------------------------------------ items
if (!ITEMS.sigcounter) registerItem({ id: 'sigcounter', name: 'Signal Counter', kind: 'tool', price: 75, shop: 'tools', tier: 'uncommon', weight: 1, hands: 1,
  tip: 'Hold it: it clicks faster near STATIC sources (hot rooms, hot items, breaches). LMB mutes the clicks. Reads the source level, not your dose.' });
if (!ITEMS.antivirus) registerItem({ id: 'antivirus', name: 'Antivirus Shot', kind: 'consumable', price: 55, shop: 'consumables', tier: 'rare', weight: 0.5, hands: 1,
  tip: 'LMB: -60 STATIC, purge every bad mutation, 15 s of immunity. Also stops a DELETION countdown.' });
if (!ITEMS.arm_faraday) registerItem({ id: 'arm_faraday', name: 'Faraday Suit', kind: 'armor', price: 260, shop: 'suits', tier: 'rare', value: [40, 70], weight: 9, hands: 1, gear: { armor: 0.05, speed: -0.03 },
  tip: 'Wear it in the SUIT slot: you take 68% less STATIC. Heavy mesh: -3% speed, 5% damage reduction.' });
if (!RECIPES.some((r) => r.id === 'antivirus')) {
  RECIPES.push({ id: 'antivirus', name: 'Antivirus Shot', cat: 'survival', out: 'antivirus', n: 1, in: [['comp_chem', 2], ['comp_circuit', 1]], tier: null, time: 2, desc: 'A syringe of clean code. -60 STATIC, purges bad mutations.' });
  RECIPES.push({ id: 'faraday', name: 'Faraday Suit', cat: 'gear', out: 'arm_faraday', n: 1, in: [['comp_cloth', 4], ['comp_cable', 3], ['comp_scrapmetal', 2]], tier: ['common', 'epic'], time: 2.6, desc: 'Copper mesh under a hoodie. Resists STATIC.' });
}

addTranslations({
  STATIC: 'STATİK', CLEAN: 'TEMİZ', BUZZING: 'VIZILTILI', GLITCHING: 'GLİTCH', CORRUPTED: 'BOZULMUŞ', DELETED: 'SİLİNDİ',
  'Signal Counter': 'Sinyal Sayacı', 'Antivirus Shot': 'Antivirüs İğnesi', 'Faraday Suit': 'Faraday Kıyafeti', 'Decon Shower': 'Dekon Duşu',
  'Hold it: it clicks faster near STATIC sources (hot rooms, hot items, breaches). LMB mutes the clicks. Reads the source level, not your dose.': 'Elinde tut: STATİK kaynaklarına (sıcak odalar, sıcak eşyalar, sızıntılar) yaklaştıkça hızlı tıklar. Sol tık sesi kısar. Dozunu değil kaynak seviyesini okur.',
  'LMB: -60 STATIC, purge every bad mutation, 15 s of immunity. Also stops a DELETION countdown.': 'Sol tık: -60 STATİK, tüm kötü mutasyonları temizler, 15 sn bağışıklık. SİLİNME sayacını da durdurur.',
  'Wear it in the SUIT slot: you take 68% less STATIC. Heavy mesh: -3% speed, 5% damage reduction.': 'KIYAFET yuvasında giy: %68 daha az STATİK alırsın. Ağır tel örgü: -%3 hız, %5 hasar azaltma.',
  'Decon Shower [E]': 'Dekon Duşu [E]', 'Decon Shower (you are clean)': 'Dekon Duşu (temizsin)', 'Step inside the booth first.': 'Önce kabinin içine gir.', 'Stay inside the booth!': 'Kabinin içinde kal!',
  DECONTAMINATING: 'TEMİZLENİYOR', 'Decontaminated. STATIC 0, bad mutations purged.': 'Temizlendi. STATİK 0, kötü mutasyonlar silindi.',
  'STATIC: Buzzing. You feel faster.': 'STATİK: Vızıltılı. Daha hızlısın.',
  'STATIC: Glitching. Max HP -15. The dice roll every minute.': 'STATİK: Glitch. Maks CAN -15. Zar her dakika atılır.',
  'STATIC: Corrupted. +25% damage. It hurts and you hear things.': 'STATİK: Bozulmuş. +%25 hasar. Acıtır ve bir şeyler duyarsın.',
  'The static recedes.': 'Statik geri çekiliyor.', 'You are clean.': 'Temizsin.',
  'DELETION IMMINENT. Reach the ship or use an Antivirus Shot!': 'SİLİNME YAKIN. Gemiye git veya Antivirüs İğnesi kullan!',
  'DELETION IN': 'SİLİNMEYE', 'deleted': 'STATİKTEN SİLİNDİ', 'was deleted by static.': 'statik yüzünden silindi.',
  'You drink the Almond Water. Cold and strange. STATIC -20.': 'Badem Suyu içtin. Soğuk ve tuhaf. STATİK -20.', 'You do not need that yet.': 'Buna henüz ihtiyacın yok.',
  'Antivirus injected. STATIC -60, bad mutations purged.': 'Antivirüs verildi. STATİK -60, kötü mutasyonlar silindi.',
  'The counter is muted.': 'Sayaç susturuldu.', 'The counter is listening.': 'Sayaç dinliyor.',
});

export function installStatic(ctx) {
  const game = ctx.game;
  const S = { exp: 0, stage: 0, zones: [], fac: null, haze: [], hazeGroup: null, glT: 0, dotT: 3, halT: 10, crackT: 1, clickAcc: 0, collapseT: 0, warnT: 0,
    immuneUntil: 0, counterMute: false, decon: { t: 0, on: false }, sense: 0, rate: 0, lastZone: null, ambient: 0, sigCd: 0, hpCap: 0 };
  const offs = [];
  const gm = [];
  let decon = null, deconColliders = [];

  const p = () => game.player;
  const quota = () => Math.max(0, game.run?.quotaIndex || 0);
  const now = () => game.time;

  // ---------------------------------------------------------------- world: hot zones + haze
  function buildWorld() {
    for (const h of S.haze) { h.haze.dispose(); }
    S.haze = []; S.zones = []; S.fac = game.world?.facility || null;
    const fac = S.fac, run = game.run;
    if (!fac || !run || (run.phase !== 'moon' && run.phase !== 'landing')) return;
    S.zones = planHotZones(fac.layout, run.seed, quota());
    for (const z of S.zones) {
      const haze = createHaze(z.x1 - z.x0, z.z1 - z.z0, Math.min(z.h, 5.4), z.id + 1);
      haze.group.position.set((z.x0 + z.x1) / 2, z.y0, (z.z0 + z.z1) / 2);
      game.scene.add(haze.group);
      S.haze.push({ z, haze });
    }
  }
  function clearWorld() { for (const h of S.haze) h.haze.dispose(); S.haze = []; S.zones = []; S.fac = null; }

  // ---------------------------------------------------------------- sources
  function breachLevel() {
    const c = game.run?.fac?.containment;
    return c === 'failure' ? 2 : c === 'breach' ? 1 : 0;
  }
  function heldHotRate() {
    let r = 0;
    for (const it of game.items.all()) {
      if (it.holder === game.selfId) { const v = it.def.static ?? STATIC_NUM.carryHot[it.type] ?? (it.def.hot ? 0.4 : 0); r += v; }
    }
    const g = game.grab?.item;
    if (g) r += STATIC_NUM.carryHot[g.type] ?? 0;
    return r;
  }
  function floorHotRate(pos) {
    let r = 0;
    for (const it of game.items.all()) {
      if (it.state !== 'world' || it.holder) continue;
      const v = it.def.static ?? STATIC_NUM.carryHot[it.type] ?? (it.def.hot ? 0.4 : 0);
      if (v && it.obj.position.distanceTo(pos) < 4) r += v * 0.5;
    }
    return r;
  }
  /** raw source rate (per s, before resistance) at a point. sense = counter falloff, else exposure falloff. */
  function sourceAt(pos, sense = false) {
    const run = game.run;
    if (!run || (run.phase !== 'moon' && run.phase !== 'landing')) return 0;
    let r = 0;
    const fall = sense ? STATIC_NUM.senseFall : STATIC_NUM.exposeFall;
    const br = breachLevel();
    const mul = br ? STATIC_NUM.breachZoneMul : 1;
    for (const z of S.zones) r = Math.max(r, zoneRate(z, pos.x, pos.y, pos.z, fall) * mul);
    const indoor = pos.y < FACILITY_Y + 40;
    if (br && indoor) r = Math.max(r, br === 2 ? STATIC_NUM.failureAmbient : STATIC_NUM.breachAmbient);
    if (!indoor && !insideShip(pos) && game.world?.terrain?.biome?.glitch) r = Math.max(r, STATIC_NUM.glitchMoon);
    return r;
  }
  function resist() {
    let m = 1;
    const armor = game.inventory?.equipped?.('armor');
    if (armor?.type === 'arm_faraday') m = Math.max(0.15, STATIC_NUM.faradayMul - 0.03 * (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(armor.tier || 'common')));
    if (now() < S.immuneUntil) m = 0;
    return m;
  }

  // ---------------------------------------------------------------- exposure API
  function addExposure(n, why) {
    const before = S.exp;
    S.exp = Math.max(0, Math.min(100, S.exp + n));
    if (S.exp !== before) ctx.markDirty();
    return S.exp;
  }
  function setExposure(v) { S.exp = Math.max(0, Math.min(100, v)); ctx.markDirty(); }
  function purgeBad() { let n = 0; for (const id of BAD_MUT) if (ctx.buffs.has(id)) { ctx.buffs.remove(id, 'purged'); n++; } return n; }

  // ---------------------------------------------------------------- stage effects
  function onStage(ns, os) {
    ctx.refreshStats();
    const st = STAGES[ns];
    if (ns > os) {
      ctx.snd(ns >= 3 ? ['sting_synth_glitch', 'walkie_static'] : ['walkie_static'], 0.5 + 0.1 * ns);
      if (ns === 1) ctx.toast(t('STATIC: Buzzing. You feel faster.'), 'info');
      else if (ns === 2) { ctx.toast(t('STATIC: Glitching. Max HP -15. The dice roll every minute.'), 'warn'); S.glT = STATIC_NUM.glitchFirst; ctx.say('You are glitching. How wonderfully engaging.'); }
      else if (ns === 3) { ctx.toast(t('STATIC: Corrupted. +25% damage. It hurts and you hear things.'), 'bad'); S.dotT = 3; S.halT = 6; }
      game.engine?.flash?.(parseInt(st.color.slice(1), 16), 0.25);
    } else if (ns === 0) ctx.toast(t('You are clean.'), 'good');
    else ctx.toast(t('The static recedes.'), 'info');
  }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    const pl = p();
    const run = game.run;
    if (!pl || !run) return;
    if (game.world?.facility !== S.fac || (S.fac && !S.zones.length && !S.haze.length && (run.phase === 'moon' || run.phase === 'landing') && S.builtFor !== run.seed)) {
      clearWorld(); buildWorld(); S.builtFor = run.seed;
    }
    const ph = run.phase;
    if (pl.dead) { S.collapseT = 0; S.exp = 0; if (S.stage) { S.stage = 0; ctx.refreshStats(); } ctx.hud.setStatic(null); return; }
    const inMoon = ph === 'moon' || ph === 'landing';
    const inShip = pl.inShip;
    const pos = pl.pos;
    // gain / decay
    let rate = 0;
    S.ambient = 0;
    if (inMoon && !inShip) {
      rate = sourceAt(pos, false) + heldHotRate() + floorHotRate(pos);
      S.ambient = rate;
      if (ctx.buffs.has('p_oc')) rate += STATIC_NUM.overclock;
      rate *= earlyMul(quota()) * resist();
    } else if (ctx.buffs.has('p_oc')) rate = STATIC_NUM.overclock * earlyMul(quota()) * resist();
    S.rate = rate;
    if (rate > 0.001) S.exp = Math.min(100, S.exp + rate * dt);
    else if (S.exp > 0) {
      const dec = inShip || !inMoon ? STATIC_NUM.decayShip : pl.indoor ? STATIC_NUM.decayIndoor : STATIC_NUM.decayOutdoor;
      S.exp = Math.max(0, S.exp - dec * dt);
    }
    const os = S.stage;
    S.stage = stageOf(S.exp, os);
    if (S.stage !== os) { onStage(S.stage, os); ctx.markDirty(); }
    // Glitching: every 60 s the host rolls the mutation dice for you
    if (S.stage >= 2) { S.glT -= dt; if (S.glT <= 0) { S.glT = STATIC_NUM.glitchEvery; ctx.netReq('gl', { st: S.stage }); } }
    // Corrupted: damage over time (never below 10 HP) + hallucinations
    if (S.stage >= 3) {
      S.dotT -= dt;
      if (S.dotT <= 0) { S.dotT = 3; if (pl.hp > 12) game.damageLocal?.(2, 'static', null); }
      S.halT -= dt;
      if (S.halT <= 0) { S.halT = 9 + Math.random() * 8; hallucinate(); }
    }
    if (pl.hp > game.stats.maxHp) pl.hp = game.stats.maxHp;
    // DELETED: warning at 90, collapse countdown at 100
    if (S.exp >= STATIC_NUM.warnAt) {
      S.warnT -= dt;
      if (S.warnT <= 0) { S.warnT = 6; ctx.toast(t('DELETION IMMINENT. Reach the ship or use an Antivirus Shot!'), 'bad'); ctx.snd(['heartbeat'], 0.6); game.engine?.beat?.(1); }
    } else S.warnT = 0;
    if (S.exp >= 100) {
      if (!S.collapseT) { S.collapseT = STATIC_NUM.collapseSec; ctx.snd(['ship_alarm', 'alarm_loop'], 0.5); }
      S.collapseT -= dt;
      game.engine?.shake?.(0.25);
      if (S.collapseT <= 0) collapse();
    } else S.collapseT = 0;
    // counter, crackle, decon, HUD
    counterUpdate(dt);
    crackle(dt, inMoon && !inShip);
    deconUpdate(dt);
    for (const h of S.haze) {
      const near = h.z.x0 - 30 < pos.x && pos.x < h.z.x1 + 30 && h.z.z0 - 30 < pos.z && pos.z < h.z.z1 + 30 && Math.abs(pos.y - h.z.y0) < 12;
      h.haze.group.visible = near;
      if (near) h.haze.update(dt, game.time, 1);
    }
    ctx.hud.setStatic({ exp: S.exp, stage: S.stage, rate: S.rate, sense: S.sense, counter: S.counterOn, collapse: S.collapseT, decon: S.decon.on ? S.decon.t / STATIC_NUM.deconSec : 0, immune: Math.max(0, S.immuneUntil - now()), resist: resist() });
    // screen: noise / warp contributions (anomaly.js writes them to the engine)
    const rm = game.settings?.reduceMotion ? 0.4 : 1;
    ctx.screen.noise = Math.max(ctx.screen.noise, [0, 0.03, 0.07, 0.12, 0.2][S.stage] * rm * (S.exp >= 90 ? 1 + 0.5 * Math.sin(game.time * 12) : 1));
    ctx.screen.warp = Math.max(ctx.screen.warp, [0, 0, 0.25, 0.55, 0.9][S.stage] * rm);
    ctx.screen.stage = S.stage;
  }

  function collapse() {
    S.collapseT = 0;
    if (ctx.buffs.has('p_cloud')) { setExposure(60); ctx.cloudRestore(); return; }
    ctx.toast(t('deleted'), 'bad');
    game.damageLocal?.(999, 'deleted', null);
  }
  function hallucinate() {
    const pl = p();
    const a = pl.yaw + (Math.random() - 0.5) * 1.2;   // forward is (-sin, -cos): +sin / +cos is behind you
    const d = 3 + Math.random() * 3;
    const at = new THREE.Vector3(pl.pos.x + Math.sin(a) * d, pl.pos.y + 0.2, pl.pos.z + Math.cos(a) * d);
    const k = Math.floor(Math.random() * 3);
    if (k === 0) ctx.snd(['crawler_step', 'mannequin_step'], 0.5, at);
    else if (k === 1) ctx.snd(['mimic_voice_1', 'mimic_voice_2'], 0.28, at);
    else { ctx.snd(['walkie_static', 'spark'], 0.35, at); game.engine?.flash?.(0x113322, 0.3); }
    ctx.blip(0.3, 0.6, 0.35);
  }

  // ---------------------------------------------------------------- Signal Counter + crackle
  function heldType() { return p()?.heldItem?.()?.type; }
  function counterUpdate(dt) {
    S.counterOn = heldType() === 'sigcounter' && !p().dead;
    if (!S.counterOn) { S.sense = 0; return; }
    const pl = p();
    const fwd = pl.forward().setY(0).normalize();
    const at = (d, w) => sourceAt(pl.pos.clone().addScaledVector(fwd, d), true) * w;
    let s = Math.max(sourceAt(pl.pos, true), at(5, 0.7), at(10, 0.45));
    s += heldHotRate() * 0.6 + floorHotRate(pl.pos);
    if (pl.inShip || game.run?.phase === 'orbit') s = 0;
    S.sense = s;
    const k = Math.min(1.6, s / 2.2);
    const cps = 0.7 + 17 * k;
    S.clickAcc += cps * dt * (0.6 + Math.random() * 0.8);
    while (S.clickAcc >= 1) {
      S.clickAcc -= 1;
      if (!S.counterMute) ctx.snd(['mine_click', 'lockpick_click'], 0.12 + 0.16 * Math.min(1, k), null, 0.9 + Math.random() * 0.4);
    }
  }
  function crackle(dt, on) {
    if (!on || S.ambient <= 0.05) return;
    S.crackT -= dt;
    if (S.crackT > 0) return;
    S.crackT = 0.35 + Math.random() * (1.4 - Math.min(1, S.ambient / 2));
    const pl = p();
    ctx.snd(['spark', 'lights_buzz'], 0.12 + 0.12 * Math.min(1, S.ambient / 2), pl.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.4, (Math.random() - 0.5) * 4)));
  }

  // ---------------------------------------------------------------- Decon Shower (ship)
  function buildDecon() {
    if (decon || !game.ship?.group) return;
    decon = createDecon();
    decon.group.position.set(DECON.x, 0, DECON.z);
    decon.group.rotation.y = Math.PI;
    game.ship.group.add(decon.group);
    for (const sx of [-1, 1]) deconColliders.push(game.physics.addStaticBox(DECON.x + sx * (DECON.w / 2), DECON.h / 2, DECON.z, 0.05, DECON.h / 2, DECON.d / 2, 0, G.STATIC, { kind: 'static' }));
  }
  function inBooth() { const pl = p(); return Math.hypot(pl.pos.x - DECON.x, pl.pos.z - DECON.z) < 0.62 && pl.pos.y < 1; }
  function deconStart() {
    if (!inBooth()) { ctx.toast(t('Step inside the booth first.'), 'info'); return; }
    S.decon = { t: 0, on: true };
    decon?.setSpray(true);
    ctx.snd(['steam_hiss', 'vent_rattle'], 0.6);
  }
  function deconUpdate(dt) {
    decon?.update(dt, game.time);
    const d = S.decon;
    if (!d.on) return;
    if (!inBooth() || p().dead) { d.on = false; decon?.setSpray(false); ctx.toast(t('Stay inside the booth!'), 'bad'); return; }
    d.t += dt;
    game.particles?.burst?.(p().pos.clone().add(new THREE.Vector3(0, 1.9, 0)), { count: 1, color: [0xa8fff0, 0xffffff], speed: 0.4, up: -1, life: 0.5, size: 0.04, gravity: 4, drag: 1, additive: true });
    if (d.t >= STATIC_NUM.deconSec) {
      d.on = false; decon?.setSpray(false);
      setExposure(0); purgeBad();
      ctx.snd(['spark', 'ui_confirm'], 0.7);
      ctx.toast(t('Decontaminated. STATIC 0, bad mutations purged.'), 'good');
    }
  }

  // ---------------------------------------------------------------- items
  function onUseItem(it, hk, g) {
    if (g !== game || !it || hk.handled) return;
    if (it.type === 'antivirus') {
      hk.handled = true;
      addExposure(-STATIC_NUM.antivirusCut); purgeBad();
      S.immuneUntil = now() + STATIC_NUM.antivirusImmuneSec;
      game.net.request('consume', { id: it.id });
      ctx.snd(['heal', 'ui_confirm'], 0.7);
      game.engine?.flash?.(0x66ffaa, 0.3);
      ctx.toast(t('Antivirus injected. STATIC -60, bad mutations purged.'), 'good');
    } else if (it.type === 'x_almondwater') {
      hk.handled = true;
      if (S.exp < 5) { ctx.toast(t('You do not need that yet.'), 'info'); return; }
      addExposure(-STATIC_NUM.almondCut);
      game.net.request('consume', { id: it.id });
      ctx.snd(['heal'], 0.5);
      ctx.toast(t('You drink the Almond Water. Cold and strange. STATIC -20.'), 'good');
    } else if (it.type === 'sigcounter') {
      hk.handled = true;
      S.counterMute = !S.counterMute;
      ctx.toast(t(S.counterMute ? 'The counter is muted.' : 'The counter is listening.'), 'info');
    }
  }
  offs.push(ctx.mods.on('useItem', onUseItem));
  offs.push(ctx.mods.on('interactables', (out, g) => {
    if (g !== game || !decon) return;
    const pl = p();
    if (!pl || pl.dead || !pl.inShip) return;
    const clean = S.exp < 1 && !BAD_MUT.some((id) => ctx.buffs.has(id));
    out.push({ pos: new THREE.Vector3(DECON.x, 1.1, DECON.z - 0.15), r: 0.9, reach: 3, label: clean ? t('Decon Shower (you are clean)') : t('Decon Shower [E]'), sub: S.exp >= 1 ? `STATIC ${Math.round(S.exp)}` : '', action: () => { if (!clean) deconStart(); } });
  }));
  offs.push(ctx.mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if (ph === 'landing' || ph === 'orbit' || ph === 'takeoff') { S.exp = 0; S.collapseT = 0; S.immuneUntil = 0; S.stage = 0; S.decon.on = false; decon?.setSpray(false); ctx.refreshStats(); ctx.markDirty(); }
    if (ph === 'orbit' || ph === 'takeoff' || ph === 'company') clearWorld();
  }));
  // death text for the new cause (instance wrap, restored on dispose)
  const origDeath = game.deathText;
  const hadOwnDeath = Object.prototype.hasOwnProperty.call(game, 'deathText');
  const deathWrap = function (cause) { return cause === 'deleted' ? t('was deleted by static.') : origDeath.call(this, cause); };
  game.deathText = deathWrap;
  gm.push(() => { if (game.deathText === deathWrap) { if (hadOwnDeath) game.deathText = origDeath; else delete game.deathText; } });

  try { buildDecon(); } catch (e) { console.warn('[anomaly] decon', e); }

  return {
    update, addExposure, setExposure, purgeBad, sourceAt, zones: () => S.zones,
    get exposure() { return S.exp; }, get stage() { return S.stage; }, get rate() { return S.rate; },
    stats(s) {
      if (S.stage >= 1) s.speedMul += 0.1;
      if (S.stage >= 2) s.maxHp = Math.max(20, s.maxHp - 15);
      if (S.stage >= 3) { s.meleeMul *= 1.25; if (s.rangedMul) s.rangedMul *= 1.25; }
    },
    deconStart, inBooth, state: S,
    dispose() {
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of gm) { try { r(); } catch { /* ignore */ } }
      clearWorld();
      for (const c of deconColliders) { try { game.physics?.removeCollider(c); } catch { /* ignore */ } }
      decon?.dispose();
    },
  };
}
