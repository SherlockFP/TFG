// EXPEDITION MOONS (wave 8, module 'expeditions'; docs/wave8/expeditions.md). Three hand-designed special moons whose need and goal are not "loot a facility":
//   ex_barge  Sunken Server Barge    OXYGEN  air outside pockets / bubble vents, currents, a trench eel      goal: 3 data cores back to the ship
//   ex_dune   Dune Relay Caravan     HEAT    sun / shade / canteens, a relay crawler to escort + repair      goal: 3 checkpoints before the sandstorm
//   ex_roof   Rooftop Blackout City  POWER   planks + zip-lines, one power cell to carry                    goal: relight 4 billboards (the Algorithm's ads)
// They are custom-map moons (moon.customMap, no facility) registered at import; they join the terminal moon list after the hubgate voyage unlock (quota 5) or
// as a random one-day "expedition contract" earlier. Layouts: game/expeditions_core.js (pure) + world/expeditions_maps.js (geometry). Host-authoritative goal
// state (run.ex), per-player needs are local (damage goes through game.damageLocal, so the downed rules apply). Net prefix `ex`:
//   exreq client -> host {op:'sync'} | {op:'water', i} | {op:'relight', i} | {op:'charge'}      exfx host -> everyone {k:'cw'|'pay'|'say'|'lit'|'banner', ...}
import * as THREE from 'three';
import { t, tf, addTranslations, sysMsg, localizeFields } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { MOONS, MOON_ORDER, BIOMES } from './moons.js';
import { registerItem, ITEMS } from './items.js';
import { registerCreature, CREATURES } from './creatures.js';
import { hudDock } from '../ui/dock.js';
import { buildExpeditionMap } from '../world/expeditions_maps.js';
import * as K from './expeditions_core.js';
import { TR, RU } from './expeditions_text.js';

HOST_ONLY.add('exfx');
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
const V3 = THREE.Vector3;

// ------------------------------------------------------------------------------------------------ registration (every peer, at import)
const BIOME_BASE = {
  ex_barge: { name: 'Flooded Server Barge', ground: 'mud', ground2: 'metal_plate', rock: 'metal_dark', tint: 0x5f8088, pathTint: 0x6a8a90, rockTint: 0x40525a, sky: 0x0c2a3a, fog: 0x0a4a62, fogDensity: 0.016, night: 0x041420, sun: 0x9fe0ff, height: 0, rough: 0, trees: null, noBushes: true, step: 'metal', planet: 0x2a8ab0, fx: 'spores', hemiW: 0.4 },
  ex_dune: { name: 'Dune Relay Route', ground: 'red_sand', ground2: 'sand', rock: 'rock', tint: 0xf2cf9a, pathTint: 0xe8c48a, rockTint: 0xb08a66, sky: 0xd59462, fog: 0xc89060, fogDensity: 0.009, night: 0x140a08, sun: 0xffe0b0, height: 6, rough: 0.35, dunes: 9, trees: null, noBushes: true, step: 'gravel', planet: 0xd0904a },
  ex_roof: { name: 'Blackout City', ground: 'asphalt', ground2: 'concrete_dark', rock: 'concrete_dark', tint: 0x7a7f92, pathTint: 0x6a6f80, rockTint: 0x505468, sky: 0x140a2a, fog: 0x1c1234, fogDensity: 0.011, night: 0x05030f, sun: 0x8a90ff, minNight: 0.94, height: 0, rough: 0, trees: null, noBushes: true, step: 'concrete', planet: 0x6a3ad0, fx: 'ash', hemiW: 0.25, hemiG: 0x0c0818 },
};
for (const [id, b] of Object.entries(BIOME_BASE)) if (!BIOMES[id]) BIOMES[id] = { ...b };
const moonDef = (kind, o) => ({
  id: K.MOON_IDS[kind], tier: 3, cost: 0, interior: 'factory', size: 1, weather: ['clear'], scrapCount: [0, 0], scrapMul: 1, power: 0, outdoorPower: 0, creatures: {}, outdoor: {},
  expedition: kind, noExtraSpawns: true, customMap: (seed, moon, ctx) => buildExpeditionMap(kind, seed, moon, ctx), ...o,
});
const MOON_DEFS = [
  moonDef('barge', { name: 'Sunken Server Barge', short: 'BARGE', biome: 'ex_barge', tier: 3,
    desc: 'A flooded server barge on the seabed. Your air is limited: refill at bubble vents and inside the cabins. Recover 3 data cores from the flooded decks. Currents pull, something hunts in the dark water.' }),
  moonDef('dune', { name: 'Dune Relay Caravan', short: 'DUNE', biome: 'ex_dune', tier: 2,
    desc: 'The sun drains you: find shade, drink from canteens. Escort and repair the relay crawler across 3 checkpoints before the sandstorm buries it. Burrowers hunt by vibration.' }),
  moonDef('roof', { name: 'Rooftop Blackout City', short: 'ROOFS', biome: 'ex_roof', tier: 3,
    desc: 'A city in blackout. Cross the rooftops by plank and zip-line, carry the power cell and relight 4 billboards for the Algorithm. A fall hurts. Drones patrol the skyline.' }),
];
for (const d of MOON_DEFS) if (!MOONS[d.id]) MOONS[d.id] = localizeFields(d, ['name', 'desc', 'short']);   // NOT in MOON_ORDER: the module lists them once unlocked

const ITEM_DEFS = [
  { id: 'ex_core', name: 'Flooded Data Core', kind: 'scrap', weight: 14, hands: 2, value: [110, 150], tier: 'rare', tip: 'A sealed server core from the sunken barge. The Algorithm wants it dry.' },
  { id: 'ex_blade', name: 'Barnacled Server Blade', kind: 'scrap', weight: 6, hands: 1, value: [45, 80], tier: 'uncommon', tip: 'A rack blade grown over with barnacles. Somebody will pay.' },
  { id: 'ex_tank', name: 'Air Tank', kind: 'tool', weight: 4, hands: 1, tip: 'LMB: breathe from it, about 26 s of air. Single use.' },
  { id: 'ex_glass', name: 'Sun-Fused Glass', kind: 'scrap', weight: 5, hands: 1, value: [50, 90], tier: 'uncommon', tip: 'Sand fused by a lightning-hot dune. It glows when the sun hits it.' },
  { id: 'ex_capacitor', name: 'Relay Capacitor', kind: 'scrap', weight: 7, hands: 1, value: [70, 110], tier: 'rare', tip: 'Pulled from the relay crawler at a checkpoint. Still warm.' },
  { id: 'ex_canteen', name: 'Canteen', kind: 'tool', weight: 2, hands: 1, tip: 'LMB: drink. Cools you down. Single use.' },
  { id: 'ex_cell', name: 'Power Cell', kind: 'tool', weight: 20, hands: 2, tip: 'Carry it to a billboard kiosk [E] to relight it. It drains while carried; swap it at the generator.' },
  { id: 'ex_adreel', name: 'Ad Reel Spool', kind: 'scrap', weight: 5, hands: 1, value: [55, 95], tier: 'uncommon', tip: 'A spool of unskippable ads. Collectors love it.' },
  { id: 'ex_neon', name: 'Dead Neon Letter', kind: 'scrap', weight: 6, hands: 1, value: [40, 75], tier: 'uncommon', tip: 'A letter from a sign that used to say something.' },
];
for (const d of ITEM_DEFS) if (!ITEMS[d.id]) registerItem({ ...d });

function itemModel(id) {
  const g = new THREE.Group(), L = (c) => new THREE.MeshLambertMaterial({ color: c }), B = (c) => new THREE.MeshBasicMaterial({ color: c }), add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const cyl = (r, h, s = 10) => new THREE.CylinderGeometry(r, r, h, s), bx = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  if (id === 'ex_core') { add(cyl(0.15, 0.42), L(0x2b3138)); add(cyl(0.155, 0.05), B(0x40f0ff), 0, 0.1); add(cyl(0.155, 0.05), B(0x40f0ff), 0, -0.1); add(cyl(0.1, 0.06), L(0x555d66), 0, 0.24); }
  else if (id === 'ex_blade') { add(bx(0.34, 0.05, 0.22), L(0x2f6b3a)); add(bx(0.3, 0.02, 0.04), B(0xd8b040), 0, 0.03, -0.09); for (const [x, z] of [[-0.1, 0.03], [0.08, 0.06], [0.02, -0.02]]) add(new THREE.SphereGeometry(0.04, 5, 4), L(0xb9b09a), x, 0.04, z); }
  else if (id === 'ex_tank') { add(cyl(0.11, 0.46), L(0xd9b21c)); add(cyl(0.05, 0.08), L(0x555555), 0, 0.27); add(bx(0.1, 0.04, 0.04), B(0xff5a3a), 0, 0.33); }
  else if (id === 'ex_glass') { add(new THREE.IcosahedronGeometry(0.14, 0), B(0xffa640)); add(new THREE.IcosahedronGeometry(0.1, 0), B(0xffd890), 0.02, 0.03, 0); }
  else if (id === 'ex_capacitor') { add(cyl(0.09, 0.3), L(0x2a5aa0)); add(cyl(0.092, 0.05), L(0xdddddd), 0, 0.1); add(cyl(0.02, 0.1), L(0x999999), -0.03, 0.2); add(cyl(0.02, 0.1), L(0x999999), 0.03, 0.2); }
  else if (id === 'ex_canteen') { add(bx(0.2, 0.26, 0.1), L(0x5a6a3a)); add(cyl(0.04, 0.06), L(0x333333), 0, 0.16); add(bx(0.22, 0.03, 0.11), L(0x3a4526), 0, -0.05); }
  else if (id === 'ex_cell') { add(bx(0.3, 0.5, 0.22), L(0x262b31)); add(bx(0.32, 0.1, 0.24), B(0xffd040), 0, 0.05); add(bx(0.2, 0.05, 0.05), L(0x777777), 0, 0.29); add(bx(0.05, 0.12, 0.05), L(0x777777), -0.1, 0.27); add(bx(0.05, 0.12, 0.05), L(0x777777), 0.1, 0.27); }
  else if (id === 'ex_adreel') { const m = add(cyl(0.2, 0.06, 16), L(0x2a2030)); m.rotation.x = Math.PI / 2; const r = add(new THREE.TorusGeometry(0.16, 0.02, 4, 16), B(0xff40b0)); void r; add(cyl(0.05, 0.08, 8), L(0x999999)).rotation.x = Math.PI / 2; }
  else { for (const [x, y, w, h] of [[-0.12, 0, 0.05, 0.36], [0.12, 0, 0.05, 0.36], [0, 0.0, 0.05, 0.44]]) { const m = add(bx(w, h, 0.05), B(0xff5ac0), x, y, 0); if (w === 0.05 && x === 0) m.rotation.z = 0.5; } }   // ex_neon: an N
  return g;
}

// the trench eel: hunts submerged players who are in the dark (not at a vent, not in a cabin); path over the hull's nav grid, telegraphed lunge
registerCreature('ex_eel', {
  name: 'Trench Eel', model: 'leech', modelScale: 2.6, hp: 150, dmg: 28, walk: 3.0, run: 6.2, power: 0, xp: 170, coin: 30, zone: 'out', radius: 0.7, height: 0.9, noSpawn: true, noHunt: true, noCompDrop: true,
  deathText: 'was eaten by a trench eel.',
  lore: 'It lives in the barge and hates the light. Bubble vents and air cabins keep it away; in the open dark water it is faster than you.',
}, (c, dt, M) => {
  const g = M.game, X = g.expeditions?.bargeCtx?.();
  if (!X) return;
  const d = c.data; d.rp = (d.rp || 0) - dt; d.cd = (d.cd || 0) - dt;
  const safe = (p) => K.ventNear(X.P, p.pos.x, p.pos.z, 4.8) || !!K.pocketAt(X.P, p.pos.x, p.pos.y + 1, p.pos.z);
  const prey = M.playersFor(c).filter((p) => !p.inShip && !p.dead && K.submerged(p.pos.y + 1.5) && !safe(p) && Math.abs(p.pos.y - c.pos.y) < 2.6);
  let best = null, bd = c.state === 'run' || c.state === 'attack' ? 30 : 16;
  for (const p of prey) { const dd = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z); if (dd < bd) { best = p; bd = dd; } }
  const go = (x, z, sp) => {
    if (d.rp <= 0 || !c.path || c.pathIdx >= c.path.length) { d.rp = 0.7; c.path = K.gridPath(X.grid, c.pos, { x, z }) || null; c.pathIdx = 0; }
    if (c.path) M.follow(c, dt, sp);
  };
  if (!best) {
    if (c.state === 'run' || c.state === 'attack') { c.setState('idle'); c.path = null; }
    if (c.state === 'idle' && c.t > 2 + Math.random() * 3) { const L = X.P.lair; c.dest = { x: L.x + (Math.random() - 0.5) * 50, z: L.z + (Math.random() - 0.5) * 20 }; d.rp = 0; c.setState('walk'); }
    if (c.state === 'walk') { go(c.dest.x, c.dest.z, c.def.walk); if (!c.path || c.pathIdx >= c.path.length) c.setState('idle'); }
    return;
  }
  const dist = Math.hypot(best.pos.x - c.pos.x, best.pos.z - c.pos.z);
  c.yaw = Math.atan2(best.pos.x - c.pos.x, best.pos.z - c.pos.z);
  if (dist < 1.9) {
    if (c.state !== 'attack') { c.setState('attack'); d.cd = Math.max(d.cd, 0.5); }   // 0.5 s wind-up before the bite
    if (d.cd <= 0) { M.attack(c, best, c.dmg, 'ex_eel'); d.cd = 2.2; }
    return;
  }
  if (c.state !== 'run') c.setState('run');
  go(best.pos.x, best.pos.z, c.def.run);
});

// ------------------------------------------------------------------------------------------------ CSS
const CSS = `.ex-bar{background:#12130d;border:2px solid #40c8e8;color:#e8f6ff;font:700 13px/1.1 'Bahnschrift','Arial Narrow',sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;display:flex;gap:8px;align-items:center;box-shadow:0 0 0 2px #12130d;min-width:190px}
.ex-bar u{flex:1;height:7px;background:rgba(255,255,255,.14);display:block;text-decoration:none}.ex-bar u b{display:block;height:100%;background:#40c8e8}
.ex-bar i{font-style:normal;opacity:.85;min-width:34px;text-align:right}
.ex-bar.dune{border-color:#ff9a3a}.ex-bar.dune u b{background:#ff8a2a}.ex-bar.roof{border-color:#ffd040}.ex-bar.roof u b{background:#ffd040}
.ex-bar.low{animation:exblink .6s steps(2) infinite}@keyframes exblink{50%{border-color:#ff3a2a}}
.ex-ov{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .4s}`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function installExpeditions(game) {
  const mods = game.mods;
  if (!mods) return null;
  if (mods.itemModels) for (const d of ITEM_DEFS) if (!mods.itemModels.has(d.id)) mods.itemModels.set(d.id, () => itemModel(d.id));
  const offs = [], restores = [];
  let disposed = false, boundNet = null, dock = null, ov = null, style = null;
  const S = {
    kind: null, P: null, ex: null, grid: null, oxy: K.OXY.max, heat: 0, hurtT: 0, fogK: 0, tank: false, drink: false, zip: null, zipCd: 0, lowSaid: false,
    cw: null, cwView: 0, cwCol: null, storm: 0, listT: 0, hud: '', briefKey: '', boardsLit: [], H: null, uiT: 0, hotSaid: false,
  };
  const run = () => game.run, host = () => !!game.isHost;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const sfx = (n, v = 0.6) => { try { game.sfx?.(n, v); } catch { /* unknown sound */ } };
  const say = (s, v) => { try { game.lore?.say?.(tf(s, v || {}), { mood: 'curious' }); } catch { /* lore optional */ } };
  const fx = (d) => { try { game.net.broadcast('exfx', d); } catch { /* net closing */ } };
  const sync = (keys = ['ex']) => { try { game.broadcastRun?.(keys); } catch { /* not ready */ } };
  const active = () => run()?.phase === 'moon' && !!S.ex && !!game.world?.outdoor?.ex;
  const EX = () => (run()?.ex && run().ex.m === S.kind ? run().ex : null);
  const me = () => game.player;
  const ladderOpen = () => { try { return game.onboard?.locked ? !game.onboard.locked('voyage') : true; } catch { return true; } };
  const nameOf = (k) => MOONS[K.MOON_IDS[k]]?.$name || MOONS[K.MOON_IDS[k]]?.name || k;
  const later = (fn, ms) => (game.later ? game.later(fn, ms) : setTimeout(fn, ms));
  const levelNow = () => Math.max(1, 1 + Math.floor((run()?.quotaIndex | 0) / 3));

  // ------------------------------------------------------------------------------------------ text (landing card, objectives, terminal)
  const INFO = {
    barge: { need: 'OXYGEN', needS: 'Air: bubble vents, cabins', goal: 'Recover 3 data cores', goalS: 'Recover the 3 data cores and bring them to the ship', hint: 'Air only lasts about 30 s in the open water. Refill at a bubble vent or inside a cabin.' },
    dune: { need: 'HEAT', needS: 'Heat: shade, canteens', goal: 'Escort the relay crawler', goalS: 'Escort and repair the relay crawler across 3 checkpoints before the sandstorm', hint: 'The sun heats you up. Stand in shade, drink from a canteen.' },
    roof: { need: 'POWER CELL', needS: 'Power cell drains', goal: 'Relight 4 billboards', goalS: 'Carry the power cell and relight the 4 billboards', hint: 'The cell drains while carried. Swap it at the generator.' },
  };
  function briefRows() {
    const r = run();
    if (!r || r.phase !== 'landing' || typeof document === 'undefined') return;
    const kind = MOONS[r.moon]?.expedition;
    const grid = kind && document.querySelector('.br-card .br-grid');
    if (!grid || grid.querySelector('.ex-row')) return;
    const first = grid.firstElementChild;
    if (first) { const s = first.querySelector('span'), b = first.querySelector('b'); if (s) s.textContent = t('EXPEDITION'); if (b) b.textContent = t(nameOf(kind)); first.classList.add('ex-row'); }
    for (const [lab, txt] of [[t('NEED'), t(INFO[kind].needS)], [t('GOAL'), t(INFO[kind].goal)]]) {
      const d = document.createElement('div'); d.className = 'ex-row';
      const a = document.createElement('span'); a.textContent = lab; const b = document.createElement('b'); b.textContent = txt; b.style.cssText = 'font-size:.85em;text-align:right';
      d.append(a, b); grid.appendChild(d);
    }
  }
  function moonInfo(m, run2, brief) {
    const kind = m.expedition, I = INFO[kind], lines = [];
    if (!brief) lines.push(String(m.$name || m.name).toUpperCase() + '  [' + t('EXPEDITION') + ']');
    lines.push(`${t('Tier')} ${m.tier}  ·  ${t('FREE')}`);
    lines.push(`${t('NEED')}: ${t(I.need)}. ${t(I.hint)}`);
    lines.push(`${t('GOAL')}: ${t(I.goalS)}`);
    lines.push(`${t('Payout')}: ${t('scaled to the quota, plus unique loot')}`);
    lines.push(m.desc || '');
    void run2;
    return lines.join('\n');
  }
  const T0 = game.terminal;
  if (T0 && typeof T0.moonInfo === 'function') {
    const orig = T0.moonInfo;
    T0.moonInfo = function (m, r, brief) { return m?.expedition ? moonInfo(m, r, brief) : orig.call(this, m, r, brief); };
    restores.push(() => { T0.moonInfo = orig; });
  }

  // ------------------------------------------------------------------------------------------ availability: terminal moon list (voyage unlock or a one-day contract)
  function listTick() {
    const r = run(); if (!r) return;
    const open = ladderOpen() && !r.quick, offer = r.exo && r.exo.d === r.day ? r.exo.m : null;
    for (const kind of K.KINDS) {
      const id = K.MOON_IDS[kind], want = open || offer === kind || r.moon === id;
      const i = MOON_ORDER.indexOf(id);
      if (want && i < 0) MOON_ORDER.push(id);
      else if (!want && i >= 0) MOON_ORDER.splice(i, 1);
    }
  }
  function hostContract() {
    const r = run(); if (!r || !host() || r.quick) return;
    if (r.exo && r.exo.d !== r.day) { r.exo = null; sync(['exo']); }
    const kind = K.contractRoll(r.seed, r.day, r.quotaIndex, ladderOpen());
    if (!kind || (r.exo && r.exo.d === r.day)) return;
    r.exo = { m: kind, d: r.day }; sync(['exo']);
    game.net.broadcast('sys', sysMsg('EXPEDITION CONTRACT: {@n} is listed in the moon list for today only. Type MOONS.', { n: MOONS[K.MOON_IDS[kind]].$name || MOONS[K.MOON_IDS[kind]].name }, 'good'));
    fx({ k: 'say', s: 'A contract just came in. A moon that is not on any map. Do not ask who signs it.' });
  }

  // ------------------------------------------------------------------------------------------ UI (need bar, screen tint)
  function ensureUi() {
    if (typeof document === 'undefined') return;
    if (!style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
    if (!ov) { ov = document.createElement('div'); ov.className = 'ex-ov'; (document.getElementById('ui') || document.body).appendChild(ov); }
    if (!dock) dock = hudDock('bottom', 'ex_need', 6);
  }
  function hideUi() { if (dock) { dock.style.display = 'none'; dock.dataset.h = ''; } if (ov) ov.style.opacity = '0'; }
  const bar = (cls, label, frac, right, low) => `<div class="ex-bar ${cls}${low ? ' low' : ''}"><span>${label}</span><u><b style="width:${Math.round(clamp(frac, 0, 1) * 100)}%"></b></u><i>${right}</i></div>`;
  function hudTick() {
    ensureUi(); if (!dock) return;
    const ex = EX(); if (!ex) { hideUi(); return; }
    const pr = K.progressOf(ex);
    let html = '';
    if (S.kind === 'barge') html = bar('barge', 'O2', S.oxy / K.OXY.max, Math.ceil(S.oxy) + ' s', S.oxy <= K.OXY.warn && S.subNow) + `<div class="ex-bar barge"><span>${t('CORES')}</span><i style="flex:1;text-align:right">${pr.n} / ${pr.of}</i></div>`;
    else if (S.kind === 'dune') {
      const st = K.stormAt(run().time), sec = Math.max(0, Math.round((K.STORM.peak - run().time) * (game.config?.dayLengthSec || 720) / 960)), left = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      html = bar('dune', t('HEAT'), S.heat / K.HEAT.max, Math.round(S.heat) + '%', S.heat >= K.HEAT.burn)
        + `<div class="ex-bar dune"><span>${t('STORM')}</span><i style="flex:1;text-align:right">${st >= 0.99 ? t('NOW') : left}</i></div>`;
    } else html = bar('roof', t('CELL'), (ex.c || 0) / K.CELL.max, Math.round(ex.c || 0) + '%', (ex.c || 0) < K.CELL.cost) + `<div class="ex-bar roof"><span>${t('ADS')}</span><i style="flex:1;text-align:right">${pr.n} / ${pr.of}</i></div>`;
    if (dock.dataset.h !== html) { dock.dataset.h = html; dock.innerHTML = html; }
    dock.style.display = '';
  }
  function overlayTick(dt) {
    if (!ov) return;
    let bg = 'none', op = 0;
    if (S.kind === 'barge' && S.subNow) { bg = 'radial-gradient(ellipse at 50% 45%,rgba(20,90,120,.16) 30%,rgba(4,28,48,.6))'; op = 1; }
    else if (S.kind === 'dune') {
      const k = clamp((S.heat - 45) / 55, 0, 1), st = S.storm;
      if (k > 0.02 || st > 0.05) { bg = `radial-gradient(ellipse at 50% 50%,rgba(255,150,40,0) 35%,rgba(255,110,20,${(k * 0.5).toFixed(2)})),linear-gradient(rgba(200,140,80,${(st * 0.3).toFixed(2)}),rgba(200,140,80,${(st * 0.3).toFixed(2)}))`; op = 1; }
    }
    if (ov.dataset.b !== bg) { ov.dataset.b = bg; ov.style.background = bg; }
    ov.style.opacity = String(op); void dt;
  }

  // ------------------------------------------------------------------------------------------ needs (local player)
  function fogSet(k, kind) {
    const b = BIOMES[K.MOON_IDS[kind]], base = BIOME_BASE[K.MOON_IDS[kind]]; if (!b) return;
    if (kind === 'barge') { b.fogDensity = base.fogDensity + k * 0.034; b.fog = k > 0.5 ? 0x0a5068 : base.fog; }
    else if (kind === 'dune') { b.fogDensity = base.fogDensity + S.storm * 0.052; b.fog = S.storm > 0.3 ? 0x9a6a3a : base.fog; }
  }
  function restoreFog() { for (const [id, base] of Object.entries(BIOME_BASE)) if (BIOMES[id]) { BIOMES[id].fogDensity = base.fogDensity; BIOMES[id].fog = base.fog; } }
  function clearPlayer() { const p = me(); if (p) { p.exMul = 1; p.exPush = null; } }
  const eyeY = () => game.camera?.position?.y ?? (me().pos.y + 1.6);
  function bargeNeed(dt) {
    const p = me(), P = S.P, sub = K.submerged(eyeY()) && !p.inShip, feet = p.pos.y < K.BARGE.water && !p.inShip;
    const pocket = K.pocketAt(P, p.pos.x, p.pos.y + 1, p.pos.z), vent = K.ventNear(P, p.pos.x, p.pos.z) && p.pos.y < K.BARGE.water + 1;
    const air = !!pocket || vent;
    S.subNow = sub && !air;
    if (!p.downed) {
      const r = K.oxyStep(S.oxy, dt, { sub, air, tank: S.tank }); S.oxy = r.v; S.tank = false;
      if (r.hurt) { S.hurtT -= dt; if (S.hurtT <= 0) { S.hurtT = 1; try { game.damageLocal?.(K.OXY.hurt, 'drown', null); } catch { /* not ready */ } } } else S.hurtT = 0.4;
      if (S.oxy <= K.OXY.warn && S.subNow && !S.lowSaid) { S.lowSaid = true; toast(t('AIR LOW: find a bubble vent or a cabin'), 'warn'); sfx('ui_error', 0.4); }
      if (S.oxy > K.OXY.warn + 6) S.lowSaid = false;
    }
    p.exMul = feet ? K.OXY.slow : 1;
    const c = sub ? K.currentAt(P, p.pos.x, p.pos.y + 0.8, p.pos.z) : null;
    p.exPush = c && (c.x || c.z) ? c : null;
    S.fogK += ((S.subNow ? 1 : feet ? 0.35 : 0) - S.fogK) * Math.min(1, dt * 3.5);
    fogSet(S.fogK, 'barge');
  }
  function duneNeed(dt) {
    const p = me(), P = S.P, r = run();
    S.storm = K.stormAt(r.time);
    if (S.ex) S.ex.storm = S.storm;
    const cwPark = S.cw && (S.cw.m === 'park' || S.cw.m === 'done' || S.cw.m === 'dead') && S.ex?.cwPos;
    const shade = p.inShip || K.inShade(P, p.pos.x, p.pos.z) || (cwPark && Math.hypot(S.ex.cwPos.x - p.pos.x, S.ex.cwPos.z - p.pos.z) < 4.6);
    if (!p.downed) {
      const h = K.heatStep(S.heat, dt, { shade: !!shade, ship: !!p.inShip, sun: K.sunFactor(r.time), storm: S.storm, drink: S.drink }); S.heat = h.v; S.drink = false;
      if (h.burn) { S.hurtT -= dt; if (S.hurtT <= 0) { S.hurtT = 1; try { game.damageLocal?.(K.HEAT.hurt, 'heat', null); } catch { /* not ready */ } } } else S.hurtT = 0.5;
      if (h.hot && !S.hotSaid) { S.hotSaid = true; toast(t('You are overheating: find shade or drink'), 'warn'); }
      if (S.heat < K.HEAT.hot - 15) S.hotSaid = false;
    }
    p.exMul = S.heat >= K.HEAT.hot ? K.HEAT.slow : 1;
    p.exPush = S.storm > 0.35 && !shade ? { x: -0.9 * S.storm, z: 0.35 * S.storm } : null;
    fogSet(0, 'dune');
  }

  // ------------------------------------------------------------------------------------------ zip-lines (roof)
  function zipTick(dt) {
    const p = me();
    S.zipCd = Math.max(0, S.zipCd - dt);
    const z = S.zip; if (!z) return;
    if (p.dead || p.downed) { S.zip = null; return; }
    z.t += dt;
    const s = clamp(z.t / z.dur, 0, 1), e = s * s * (3 - 2 * s) * 0.35 + s * 0.65, pt = K.zipPoint(z.zp, z.end, e);
    p.teleport(new V3(pt.x, pt.y, pt.z));
    if (s >= 1) { const st = z.end === 'a' ? z.zp.standB : z.zp.standA; p.teleport(new V3(st.x, st.y + 0.05, st.z)); S.zip = null; S.zipCd = K.ZIP.cd; sfx('land_soft', 0.4); }
  }
  function startZip(zp, end) {
    const p = me(); if (S.zip || S.zipCd > 0 || p.dead || p.downed) return;
    S.zip = { zp, end, t: 0, dur: K.zipDur(zp) }; sfx('cloth_rustle', 0.5); sfx('lever_pull', 0.3);
  }

  // ------------------------------------------------------------------------------------------ interactables
  const holdsType = (id, type) => { for (const it of game.items.all()) if (it.holder === id && it.type === type) return it; return null; };
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || !active()) return;
    const p = me(), P = S.P, ex = EX(); if (!p || p.dead || !ex) return;
    const req = (d) => { try { game.net.request('exreq', d); } catch { /* net closing */ } };
    if (S.kind === 'roof') {
      for (const zp of P.zips) for (const end of ['a', 'b']) {
        const pole = end === 'a' ? zp.a : zp.b;
        if (Math.hypot(pole.x - p.pos.x, pole.z - p.pos.z) > 6 || Math.abs(pole.y - p.pos.y) > 3) continue;
        out.push({ pos: new V3(pole.x, pole.y + 1.1, pole.z), r: 0.7, reach: K.ZIP.reach, label: () => t('Ride the zip-line [E]'), sub: () => t('Hold on. It is faster than the stairs.'), action: () => startZip(zp, end) });
      }
      for (const q of P.bbs) {
        if (ex.b[q.i] || Math.hypot(q.kiosk.x - p.pos.x, q.kiosk.z - p.pos.z) > 8) continue;
        out.push({ pos: new V3(q.kiosk.x, q.y + 1.2, q.kiosk.z), r: 0.7, reach: 2.6, label: () => t(holdsType(game.selfId, 'ex_cell') ? 'Relight the billboard [E]' : 'The kiosk needs the power cell'), sub: () => `${Math.round(ex.c || 0)}% · -${K.CELL.cost}%`, action: () => req({ op: 'relight', i: q.i }) });
      }
      if (Math.hypot(P.gen.x - p.pos.x, P.gen.z - p.pos.z) < 8) out.push({ pos: new V3(P.gen.x, P.gen.y + 1.0, P.gen.z), r: 1.0, reach: 3.2, label: () => t('Swap the cell at the generator [E]'), sub: () => '+' + K.CELL.gain + '%', action: () => req({ op: 'charge' }) });
    } else if (S.kind === 'dune') {
      P.barrels.forEach((q, i) => {
        if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 8) return;
        out.push({ pos: new V3(q.x, (game.world.terrain?.heightAt?.(q.x, q.z) ?? 0) + 1.0, q.z), r: 0.8, reach: 3.0, label: () => t('Take a canteen [E]'), sub: () => tf('{n} canteens left', { n: ex.w?.[i] ?? 0 }), action: () => req({ op: 'water', i }) });
      });
    }
  }));

  // ------------------------------------------------------------------------------------------ objectives
  function lines(add) {
    const ex = EX(), r = run(); if (!ex || !r) return;
    const pr = K.progressOf(ex), p = me(), I = INFO[S.kind];
    const frac = pr.of ? pr.n / pr.of : 0;
    if (S.kind === 'barge') {
      add(ex.st === 'won' ? t('All cores recovered. Head back to the ship.') : tf('Recover the data cores: {n} / {of}', { n: pr.n, of: pr.of }), ex.st === 'won' ? 'hint' : 'main', ex.st === 'won', frac);
      if (ex.st !== 'won') add(t(I.hint), 'sub');
      if (S.subNow && S.oxy <= K.OXY.warn) add(t('AIR LOW: find a bubble vent or a cabin'), 'warn');
    } else if (S.kind === 'dune') {
      const cw = S.cw, min = r.time;
      if (ex.st === 'won') add(t('Relay online. Get back to the ship before the storm.'), 'hint', true);
      else if (ex.st === 'lost') add(t('The sandstorm buried the crawler. Get back to the ship.'), 'warn');
      else {
        add(tf('Escort the relay crawler: checkpoint {n} / {of}', { n: pr.n, of: pr.of }), 'main', false, frac);
        if (cw?.m === 'park') add(tf('Stay near the crawler to repair it: {n}%', { n: Math.round((cw.r || 0) * 100) }), 'sub');
        else if (cw?.m === 'go' && cw.h) add(t('The crawler waits for its escort: stay within 35 m'), 'warn');
        else add(t('Keep up with the crawler. Burrowers hunt by vibration: crouch.'), 'sub');
        if (K.stormAt(min) > 0.05) add(t('SANDSTORM incoming: finish before it peaks'), 'warn');
      }
    } else {
      if (ex.st === 'won') add(t('The billboards are lit. The Algorithm is pleased. Head back to the ship.'), 'hint', true);
      else {
        add(tf('Relight the billboards: {n} / {of}', { n: pr.n, of: pr.of }), 'main', false, frac);
        const held = holdsType(game.selfId, 'ex_cell');
        if (!heldByAnyone()) add(t('Fetch the power cell from the plaza next to the ship'), 'sub');
        else add(tf('Power cell: {n}%', { n: Math.round(ex.c || 0) }) + (held ? '' : ' (' + t('a crewmate carries it') + ')'), (ex.c || 0) < K.CELL.cost ? 'warn' : 'sub');
      }
    }
    if (r.time > 23 * 60) add(t('THE SHIP LEAVES AT MIDNIGHT - RUN BACK NOW'), 'warn');
    void p;
  }
  function filterLines(out) {   // the facility lines of the ordinary tracker make no sense here
    const drop = [t('Find the facility entrance ({d} m)'), t('Bring scrap to the ship: ▮{a} / ▮{b} today')].map((s) => s.split('{')[0].trim()).filter(Boolean);
    for (let i = out.length - 1; i >= 0; i--) if (drop.some((d) => String(out[i].text).startsWith(d))) out.splice(i, 1);
  }
  const heldByAnyone = () => { for (const it of game.items.all()) if (it.type === 'ex_cell' && it.holder && !String(it.holder).startsWith('c:')) return true; return false; };
  offs.push(mods.on('objectives', (add, g, phase) => { if (g === game && !disposed && phase === 'moon' && active() && !me().dead) lines(add); }));

  // ------------------------------------------------------------------------------------------ item use
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled) return;
    if (it.type === 'ex_tank') {
      hk.handled = true;
      if (S.kind !== 'barge' || S.oxy >= K.OXY.max - 2) { toast(t('Your air is already full.')); return; }
      S.tank = true; try { game.net.request('consume', { id: it.id }); } catch { /* net closing */ } sfx('heal', 0.5); toast(t('You breathe from the tank.'), 'good');
    } else if (it.type === 'ex_canteen') {
      hk.handled = true;
      if (S.kind !== 'dune' || S.heat < 6) { toast(t('You are not hot enough to drink now.')); return; }
      S.drink = true; try { game.net.request('consume', { id: it.id }); } catch { /* net closing */ } sfx('heal', 0.5); toast(t('You drink. The heat eases.'), 'good');
    }
  }));
  offs.push(mods.on('tfg:revived', (d, g) => { if (g === game && d?.id === game.selfId) { S.oxy = Math.max(S.oxy, K.OXY.max * K.OXY.revive); S.heat = Math.min(S.heat, K.HEAT.max * K.HEAT.revive); } }));

  // ------------------------------------------------------------------------------------------ host: state, spawns, goal logic
  const H = () => S.H;
  const pay = (n, why) => { const r = run(); r.credits = (r.credits | 0) + n; sync(['credits']); fx({ k: 'pay', n, why }); };
  const pl = () => K.payout(S.kind, run().quota || 100);
  const spawnItem = (type, x, y, z, o = {}) => { try { game.items.hostSpawn(type, new V3(x, y + 0.5, z), o); } catch (e) { console.warn('[expeditions] item', type, e); } };
  const groundY = (x, z) => game.world.terrain?.heightAt?.(x, z) ?? 0;
  const spawnMaw = (pos, o) => { if (CREATURES.dunemaw) game.creatures.hostSpawn('dunemaw', pos, o); };   // registered by worlds2 at boot
  function hostSpawnAll() {
    const P = S.P, r = run(), pay0 = pl(), h = H(); h.spawned = true;
    if (S.kind === 'barge') {
      for (const c of P.cores) spawnItem('ex_core', c.x, c.y, c.z, { value: Math.round(pay0.item * (0.9 + Math.random() * 0.2)), tier: 'rare' });
      for (const b of P.blades) spawnItem('ex_blade', b.x, b.y, b.z, { value: Math.round(pay0.loot * (0.8 + Math.random() * 0.5)), tier: 'uncommon' });
      for (const q of P.tanks) spawnItem('ex_tank', q.x, q.y, q.z);
      game.creatures.hostSpawn('ex_eel', new V3(P.lair.x, K.BARGE.seabed, P.lair.z), { zone: 'out', level: levelNow(), state: 'idle', affix: null, variant: null });
    } else if (S.kind === 'dune') {
      for (const q of P.canteens) spawnItem('ex_canteen', q.x, groundY(q.x, q.z), q.z);
      for (const q of P.glass) spawnItem('ex_glass', q.x, groundY(q.x, q.z), q.z, { value: Math.round(pay0.loot * (0.8 + Math.random() * 0.5)), tier: 'uncommon' });
      for (const q of P.burrows.slice(0, 2)) spawnMaw(new V3(q.x, groundY(q.x, q.z), q.z), { zone: 'out', level: levelNow(), state: 'hidden' });
    } else {
      spawnItem('ex_cell', P.spawnCell.x, P.spawnCell.y, P.spawnCell.z);
      for (const q of P.loot) spawnItem(q.kind === 'neon' ? 'ex_neon' : 'ex_adreel', q.x, q.y, q.z, { value: Math.round(pay0.loot * (0.8 + Math.random() * 0.5)), tier: 'uncommon' });
    }
    void r;
  }
  function hostTick(dt) {
    const h = H(), ex = EX(), r = run(); if (!h || !ex) return;
    if (!h.spawned && game.time > 0) hostSpawnAll();
    h.t += dt;
    if (S.kind === 'barge') {
      h.scanT -= dt;
      if (h.scanT <= 0 && ex.st === 'go') {
        h.scanT = 1;
        for (const it of game.items.inShipItems()) if (it.type === 'ex_core' && !h.paid.has(it.id)) {
          h.paid.add(it.id); ex.n = h.paid.size; pay(pl().step, 'core'); sync();
          fx({ k: 'say', s: 'Core received. Dry, mostly. The viewers loved the bubbles.' });
          if (ex.n === 2 && !h.eel2) { h.eel2 = true; const L = S.P.lair; game.creatures.hostSpawn('ex_eel', new V3(L.x - 30, K.BARGE.seabed, L.z + 2), { zone: 'out', level: levelNow(), state: 'idle', affix: null, variant: null }); }
          if (ex.n >= ex.of) { ex.st = 'won'; pay(pl().final, 'goal'); sync(); fx({ k: 'banner', main: 'ALL CORES RECOVERED', sub: 'The Algorithm is pleased.' }); }
        }
      }
    } else if (S.kind === 'dune') duneHost(dt, ex);
    else if (S.kind === 'roof') roofHost(dt, ex);
  }
  function duneHost(dt, ex) {
    const h = H(), P = S.P, cw = h.cw, r = run();
    const alive = game.aiPlayers().filter((p) => !p.dead && !p.inShip);
    if (ex.st === 'go') {
      const pos = K.routeAt(P, cw.s);
      const near = (R) => alive.some((p) => Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < R);
      const evs = K.crawlerStep(cw, P, dt, { rep: near(K.DUNE.repR), escort: near(K.DUNE.escortR) });
      for (const e of evs) {
        if (e === 'repaired') { ex.rp = (ex.rp | 0) + 1; sync(); fx({ k: 'say', s: 'Repair done. The crawler is moving. Keep it company.' }); if (cw.i < 3) { const q = P.burrows[(cw.i + 1) % P.burrows.length]; spawnMaw(new V3(q.x, groundY(q.x, q.z), q.z), { zone: 'out', level: levelNow(), state: 'hidden' }); } }
        else if (e === 'arrived') {
          ex.cp = cw.i; pay(pl().step, 'checkpoint'); const rp = K.routeAt(P, cw.s);
          spawnItem('ex_capacitor', rp.x + 3, groundY(rp.x + 3, rp.z), rp.z, { value: Math.round(pl().item * (0.85 + Math.random() * 0.3)), tier: 'rare' });
          for (const q of P.canteens.slice(0, 1)) spawnItem('ex_canteen', rp.x - 4, groundY(rp.x - 4, rp.z), rp.z);
          sync(); fx({ k: 'banner', main: 'CHECKPOINT {n} / {of}', v: { n: cw.i, of: K.DUNE.legs }, sub: '' });
        } else if (e === 'done') { ex.st = 'won'; pay(pl().final, 'goal'); sync(); fx({ k: 'banner', main: 'RELAY ONLINE', sub: 'The Algorithm has signal. Get to the ship.' }); }
      }
      if (K.stormAt(r.time) >= 0.999 && ex.st === 'go') { ex.st = 'lost'; cw.mode = 'dead'; sync(); fx({ k: 'banner', main: 'SANDSTORM', sub: 'The crawler is buried. Back to the ship.' }); fx({ k: 'say', s: 'The sandstorm won. I will file that under weather.' }); }
    }
    if (K.stormAt(r.time) > 0.8 && !h.stormSpawn) { h.stormSpawn = true; for (const q of P.burrows.slice(1)) spawnMaw(new V3(q.x, groundY(q.x, q.z), q.z), { zone: 'out', level: levelNow(), state: 'hidden' }); }
    h.sendT -= dt;
    if (h.sendT <= 0) { h.sendT = cw.mode === 'go' ? 0.4 : 1.5; sendCw(); }
    applyCw({ i: cw.i, s: cw.s, m: cw.mode, r: cw.rep, h: cw.hold ? 1 : 0 });
  }
  const sendCw = (to) => { const c = H()?.cw; if (!c) return; const d = { k: 'cw', i: c.i, s: +c.s.toFixed(2), m: c.mode, r: +c.rep.toFixed(3), h: c.hold ? 1 : 0 }; if (to) game.net.sendTo(to, 'exfx', d); else fx(d); };
  function roofHost(dt, ex) {
    const h = H(); h.chT -= dt;
    if (ex.st === 'go') {
      const before = ex.c; ex.c = K.cellDrain(ex.c, dt, heldByAnyone());
      if (h.chT <= 0 && Math.abs(ex.c - h.lastC) >= 1) { h.chT = 1; h.lastC = ex.c; ex.c = +ex.c.toFixed(1); sync(); }
      void before;
    }
  }
  function hostReq(d, from) {
    if (!host() || !d) return;
    const ex = EX(), P = S.P; if (!ex || !P) return;
    const pl0 = game.aiPlayers().find((p) => p.id === from);
    if (d.op === 'sync') { if (S.kind === 'dune') sendCw(from); return; }
    if (!pl0 || pl0.dead) return;
    if (d.op === 'water' && S.kind === 'dune') {
      const i = d.i | 0, q = P.barrels[i]; if (!q || !(ex.w?.[i] > 0) || Math.hypot(q.x - pl0.pos.x, q.z - pl0.pos.z) > 5) return;
      ex.w[i]--; spawnItem('ex_canteen', pl0.pos.x + 0.6, pl0.pos.y, pl0.pos.z + 0.6); sync();
    } else if (d.op === 'relight' && S.kind === 'roof') {
      const i = d.i | 0, q = P.bbs[i]; if (!q || Math.hypot(q.kiosk.x - pl0.pos.x, q.kiosk.z - pl0.pos.z) > K.CELL.reach) return;
      const ok = K.canRelight(ex, i, !!holdsType(from, 'ex_cell'));
      if (!ok.ok) { game.net.sendTo(from, 'exfx', { k: 'no', why: ok.why }); return; }
      ex.b[i] = 1; ex.c = Math.max(0, ex.c - K.CELL.cost); pay(pl().step, 'billboard'); fx({ k: 'lit', i });
      const n = ex.b.reduce((s, v) => s + (v ? 1 : 0), 0);
      if (n >= ex.of) { ex.st = 'won'; pay(pl().final, 'goal'); fx({ k: 'banner', main: 'THE ADS ARE BACK', sub: 'The Algorithm is pleased.' }); }
      sync();
    } else if (d.op === 'charge' && S.kind === 'roof') {
      if (Math.hypot(P.gen.x - pl0.pos.x, P.gen.z - pl0.pos.z) > 5 || !holdsType(from, 'ex_cell')) { game.net.sendTo(from, 'exfx', { k: 'no', why: holdsType(from, 'ex_cell') ? 'far' : 'nocell' }); return; }
      const now = game.time; if (now < (ex.g[0] || 0)) { game.net.sendTo(from, 'exfx', { k: 'no', why: 'cd', s: Math.ceil((ex.g[0] || 0) - now) }); return; }
      ex.c = Math.min(K.CELL.max, ex.c + K.CELL.gain); ex.g[0] = Math.round(now + K.CELL.genCd); sync(); fx({ k: 'chg' });
    }
  }
  offs.push(mods.on('registerHandlers', (Hh, g) => { if (g === game) Hh('exreq', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[expeditions] req', e); } }); }));

  // ------------------------------------------------------------------------------------------ client: messages, crawler view, roof boards
  function applyCw(d) {
    if (!d || S.kind !== 'dune') return;
    const prev = S.cw; S.cw = { ...d, t: game.time }; S.cwView = d.s;
    if (!prev || prev.m !== d.m) S.cwColDirty = true;
  }
  function cwTick(dt) {
    const ex = S.ex, cw = S.cw; if (!ex || !cw) return;
    if (cw.m === 'go' && !cw.h) S.cwView = Math.min(S.P.d[Math.min(3, cw.i + 1)], S.cwView + K.DUNE.cwSpeed * dt);
    const cp = EX()?.cp ?? cw.i;
    ex.setCrawler(S.cwView, cw.m, cw.r, cp);
    if (S.cwColDirty) { S.cwColDirty = false; ex.setCollider(cw.m !== 'go', game.physics); }
  }
  function onMsg(d) {
    if (disposed || !d) return;
    if (d.k === 'say') { if (d.s) say(d.s, d.v); }
    else if (d.k === 'pay') { toast(tf('Expedition pay: ▮{n}', { n: d.n }), 'good'); sfx('register', 0.5); }
    else if (d.k === 'banner') { const m = tf(d.main, d.v || {}); try { game.ui?.hud?.bigText?.(m, t(d.sub || '')); } catch { toast(m, 'good'); } sfx('ui_levelup', 0.5); }
    else if (d.k === 'cw') applyCw(d);
    else if (d.k === 'lit') { S.ex?.setBoard?.(d.i, true); sfx('power_up', 0.7); say('Billboard online. Somebody is being sold something.'); }
    else if (d.k === 'chg') { sfx('battery_charge', 0.6); toast(t('Cell swapped. Fresh charge.'), 'good'); }
    else if (d.k === 'no') toast(t(d.why === 'nocell' ? 'You need to carry the power cell.' : d.why === 'low' ? 'The cell is too weak. Swap it at the generator.' : d.why === 'cd' ? 'The generator is still recharging.' : 'Nothing happens.'), 'warn');
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:exfx', onMsg);
    boundNet = net; net.on('msg:exfx', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  function boardsTick() {
    const ex = EX(), o = S.ex; if (!ex || !o?.setBoard) return;
    for (let i = 0; i < K.CELL.boards; i++) { const on = !!ex.b?.[i]; if (S.boardsLit[i] !== on) { S.boardsLit[i] = on; o.setBoard(i, on); } }
  }
  function beaconTick() {
    const o = S.ex; if (!o?.beacons) return;
    S.uT2 = (S.uT2 || 0) - 1; if (S.uT2 > 0) return; S.uT2 = 30;
    S.P.cores.forEach((c, i) => {
      let there = false;
      for (const it of game.items.all()) if (it.type === 'ex_core' && it.state === 'world' && Math.hypot(it.obj.position.x - c.x, it.obj.position.z - c.z) < 2.5) { there = true; break; }
      o.beacons[i].visible = there;
    });
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  function reset() {
    clearPlayer(); restoreFog(); hideUi();
    if (S.ex?.setCollider) { try { S.ex.setCollider(false, game.physics); } catch { /* gone */ } }
    Object.assign(S, { kind: null, P: null, ex: null, grid: null, oxy: K.OXY.max, heat: 0, zip: null, cw: null, boardsLit: [], H: null, storm: 0, subNow: false, fogK: 0, tank: false, drink: false, cwColDirty: false, lowSaid: false, hotSaid: false });
  }
  offs.push(mods.on('mapLoaded', (w, g) => {
    if (g !== game || disposed) return;
    reset();
    const out = w?.outdoor; if (!out?.ex) return;
    S.ex = out.ex; S.kind = out.ex.kind; S.P = out.ex.plan;
    if (S.kind === 'barge') S.grid = K.gridOf(S.P.solids, S.P.nav, K.BARGE.seabed, K.BARGE.seabed + 1.7);
    if (host()) { run().ex = K.initState(S.kind, run().day); S.H = { spawned: false, t: 0, scanT: 1, paid: new Set(), cw: K.newCrawler(), sendT: 0, chT: 0, lastC: 100, eel2: false, stormSpawn: false }; sync(); }
    else { try { game.net.request('exreq', { op: 'sync' }); } catch { /* net closing */ } }
    ensureUi();
    S.boardsLit = [];
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph === 'orbit') { reset(); if (host() && run().ex) { run().ex = null; sync(); } hostContract(); }
    else if (ph === 'takeoff' || ph === 'company') { clearPlayer(); restoreFog(); hideUi(); }
  }));
  offs.push(mods.on('localDeath', () => { S.zip = null; }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || !run()) return;
    S.listT -= dt; if (S.listT <= 0) { S.listT = 1; listTick(); }
    briefRows();
    if (!active()) { if (S.kind && run().phase !== 'landing') { clearPlayer(); hideUi(); } return; }
    const p = me(); if (!p) return;
    if (p.dead) { clearPlayer(); hideUi(); return; }
    if (S.kind === 'barge') { bargeNeed(dt); beaconTick(); }
    else if (S.kind === 'dune') { duneNeed(dt); cwTick(dt); }
    else if (S.kind === 'roof') { zipTick(dt); boardsTick(); }
    S.uiT -= dt; if (S.uiT <= 0) { S.uiT = 0.2; hudTick(); }
    overlayTick(dt);
    if (host()) hostTick(dt);
  }));

  const api = {
    bargeCtx: () => (S.kind === 'barge' && S.P && S.grid ? { P: S.P, grid: S.grid } : null),
    lines, filterLines, moonInfo, state: S, listTick,
    /** spots for tests / geomfix: [{ id, x, y, z, gy }] on the current map */
    plan() { const P = S.P; if (!P) return []; if (S.kind === 'barge') return [...P.cores.map((c) => ({ id: 'core' + c.id, x: c.x, y: c.y, z: c.z })), ...P.vents.map((v, i) => ({ id: 'vent' + i, x: v.x, y: K.BARGE.seabed, z: v.z }))]; return []; },
    dispose() {
      disposed = true;
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      for (const fn of restores.splice(0)) { try { fn(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:exfx', onMsg); } catch { /* ignore */ }
      clearPlayer(); restoreFog();
      dock?.remove(); ov?.remove(); style?.remove(); dock = ov = style = null;
      for (const kind of K.KINDS) { const i = MOON_ORDER.indexOf(K.MOON_IDS[kind]); if (i >= 0) MOON_ORDER.splice(i, 1); }
    },
  };
  void later; void nameOf;
  return api;
}
