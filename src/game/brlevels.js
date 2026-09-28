// BACKROOMS LEVELS runtime (wave-1 module 'brlevels'): everything that happens while you walk around a
// 'backrooms' facility. World dressing lives in src/world/interiors/backrooms.js (+ _levels.js plan, _tex.js look).
//
//   installBackroomsLevels(game) -> game.brlevels = { LEVELS, levelAt(pos) -> 'l0'|'l1'|'l2'|'pool'|'fun'|'run'|'manila'|null,
//                                                     current, plan, dispose() }
//   emits game.mods.emit('tfg:brlevel', { id, prev, first, local: true }) when the LOCAL player walks into another level
//
// Per client, all cosmetic (no net messages of its own):
//   - baked flat light: after the facility is built, every static lit surface gets a per-vertex light colour from the
//     plan (Level 0 flat yellow-white, Level ! red, Poolrooms cold white, dark zones black) - see backrooms_tex.js BAKE
//   - per-level atmosphere: fog colour/density (yellow haze in Level 0, never black), ambient for dynamic objects
//   - found-footage level captions (bottom-left under the chat log, typewriter + VHS), once per level per day
//   - per-level sound: loud fluorescent hum, drips (L1), pipe groans + hiss (L2), water lapping (Poolrooms),
//     a warped music box + party horns (Level Fun), a siren when entering Level !
//   - animated bits: flickering troffers, pulsing red emergency beacons, rippling pool water
// Host only: the Manila Room's guaranteed prize (spawned on 'moonPopulated' through the normal item stream).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, addTranslations } from '../core/i18n.js';
import { ITEMS } from './items.js';
import { planBackroomsLevels, levelIdAt, LEVELS, LEVEL_BY_ID, LEVEL_IDS } from '../world/interiors/backrooms_levels.js';
import { brMaterials, bakeMaterial, BAKE } from '../world/interiors/backrooms_tex.js';
import { planDarkCorridors } from '../world/setpieces.js';

const SUBTITLE = {
  l0: 'Mono-yellow. Damp carpet. The hum never stops.',
  l1: 'Concrete, puddles, flickering lights. Supplies, maybe.',
  l2: 'Hot pipes. Narrow halls. Mind the steam.',
  pool: 'Warm water, white tiles. Nobody swims here.',
  fun: 'Someone planned a party for you. =)',
  run: 'Do not stop. Do not look back.',
  manila: 'You were never supposed to find this.',
};
addTranslations({
  'LEVEL 0 - THE LOBBY': 'SEVİYE 0 - LOBİ',
  'LEVEL 1 - HABITABLE ZONE': 'SEVİYE 1 - YAŞANABİLİR BÖLGE',
  'LEVEL 2 - PIPE DREAMS': 'SEVİYE 2 - BORU RÜYALARI',
  'LEVEL 37 - THE POOLROOMS': 'SEVİYE 37 - HAVUZ ODALARI',
  'LEVEL FUN =)': 'SEVİYE EĞLENCE =)',
  'LEVEL ! - RUN FOR YOUR LIFE': 'SEVİYE ! - CANINI KURTAR',
  'THE MANILA ROOM': 'MANİLA ODASI',
  'Mono-yellow. Damp carpet. The hum never stops.': 'Tek renk sarı. Nemli halı. Uğultu hiç durmuyor.',
  'Concrete, puddles, flickering lights. Supplies, maybe.': 'Beton, su birikintileri, titreyen ışıklar. Belki erzak.',
  'Hot pipes. Narrow halls. Mind the steam.': 'Sıcak borular. Dar koridorlar. Buhara dikkat.',
  'Warm water, white tiles. Nobody swims here.': 'Ilık su, beyaz fayanslar. Burada kimse yüzmez.',
  'Someone planned a party for you. =)': 'Biri sana parti hazırlamış. =)',
  'Do not stop. Do not look back.': 'Durma. Arkana bakma.',
  'You were never supposed to find this.': 'Burayı asla bulmaman gerekiyordu.',
  'You found the Manila Room.': 'Manila Odası\'nı buldun.',
});

// Per-level look: baked light colour (x cell light), fog colour/density, ambient for dynamic objects, hum volume
const LOOK = {
  l0: { bake: [1.0, 0.94, 0.76], fog: 0xb4a45e, dens: 0.032, amb: 0.3, ambC: 0xfff0c8, hum: 0.5 },
  l1: { bake: [0.84, 0.9, 1.0], fog: 0x707780, dens: 0.04, amb: 0.16, ambC: 0xdce8f4, hum: 0.22 },
  l2: { bake: [1.0, 0.62, 0.36], fog: 0x1e140a, dens: 0.07, amb: 0.05, ambC: 0xffb070, hum: 0 },
  pool: { bake: [0.86, 0.97, 1.0], fog: 0xd2ecf0, dens: 0.022, amb: 0.36, ambC: 0xe4f6ff, hum: 0.18 },
  fun: { bake: [1.0, 0.88, 0.84], fog: 0xc4a494, dens: 0.03, amb: 0.3, ambC: 0xffd8e0, hum: 0.3 },
  run: { bake: [1.0, 0.22, 0.15], fog: 0x3c0806, dens: 0.05, amb: 0.1, ambC: 0xff4030, hum: 0.12 },
  manila: { bake: [1.0, 0.84, 0.64], fog: 0x8a7050, dens: 0.045, amb: 0.2, ambC: 0xffe0b0, hum: 0.08 },
};
const DARK_LOOK = { fog: 0x100d08, dens: 0.07, amb: 0.025, ambC: 0xffe8c0 };
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export function installBackroomsLevels(game) {
  const offs = [];
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (off) offs.push(off); };
  const S = {
    fac: null, L: null, plan: null, cur: null, seenDay: new Set(), dayKey: '', fog: { fog: 0xb4a45e, density: 0.032 },
    fogC: new THREE.Color(0xb4a45e), fogD: 0.032, amb: 0.012, ambC: new THREE.Color(0xffffff), bakeV: 1, active: false,
    caption: null, oneShotT: 6, funLoop: null, funHornT: 12, lapBuf: false, noise: 0, noiseSet: 0, lootDone: '',
    runEmitters: [], flickT: 0, flickOn: true,
  };

  // ------------------------------------------------------------------ plan / bake on every map load
  function setup() {
    teardownAudio();
    const fac = game.world?.facility;
    S.fac = null; S.L = null; S.plan = null; S.cur = null; S.runEmitters = [];
    if (!fac || fac.layout?.theme !== 'backrooms') return;
    const L = fac.layout;
    S.plan = L.brPlan || planBackroomsLevels(L, { dark: planDarkCorridors(L) });
    S.fac = fac; S.L = L;
    S.runEmitters = (fac.emitters || []).filter((e) => e.brRun);
    const day = `${L.seed}|${game.run?.daysLeft ?? ''}|${game.run?.quotaIndex ?? ''}`;
    if (day !== S.dayKey) { S.dayKey = day; S.seenDay.clear(); }
    // breaker rooms (interiors/hazards.js) start dark until someone resets the panel: bake them dark and switch their
    // troffers off; update() re-bakes when a breaker changes state
    S.bakeStats = null;
    S.breakers = fac.hazards?.breakers || fac.setPieces?.hazards?.breakers || [];
    S.brkKey = breakerKey();
    S.brkT = 0;
    relight();
    const a0 = fac.atmosphere || { fog: LOOK.l0.fog, density: LOOK.l0.dens };
    S.fogC.set(a0.fog); S.fogD = a0.density; S.fog.fog = a0.fog; S.fog.density = a0.density;
    game.env.interiorFog = S.fog;   // mutable: update() steers colour/density per level
  }

  const breakerKey = () => (S.breakers || []).map((b) => (b.on ? 1 : 0)).join('');
  const offRooms = () => new Set((S.breakers || []).filter((b) => !b.on).map((b) => b.room));
  /** effective light of a cell (plan light, 0 inside a breaker room whose power is cut) */
  const lightOf = (i, off) => (off.size && S.L.roomOf[i] >= 0 && off.has(S.L.roomOf[i]) ? 0 : S.plan.cellLight[i]);
  function relight() {
    const off = offRooms(), t0 = performance.now();
    S.off = off;
    try { bakeFacility(S.fac, S.plan, off); } catch (e) { console.warn('brlevels bake', e); }
    try { maskTroffers(S.fac, off); } catch (e) { console.warn('brlevels troffers', e); }
    if (S.bakeStats) { S.bakeStats.ms = Math.round(performance.now() - t0); S.bakeStats.dark = off.size; S.bakeStats.runs = (S.bakeStats.runs || 0) + 1; }
  }
  /** troffer lenses of rooms without power go dark (vertex colour of the unlit 'lit' / 'flicker' quads) */
  function maskTroffers(fac, off) {
    const L = fac.layout, grp = fac.group.getObjectByName('backrooms_levels');
    if (!grp) return;
    for (const m of grp.children) {
      if (m.userData.brKey !== 'lit' && m.userData.brKey !== 'flicker') continue;
      const P = m.geometry.attributes.position, Cc = m.geometry.attributes.color;
      if (!Cc) continue;
      if (!m.userData.baseCol) m.userData.baseCol = Cc.array.slice();
      const base = m.userData.baseCol;
      for (let q = 0; q < P.count; q += 4) {
        let x = 0, z = 0;
        for (let k = 0; k < 4; k++) { x += P.getX(q + k); z += P.getZ(q + k); }
        const c = fac.cellAt(x / 4, z / 4), dark = c >= 0 && L.roomOf[c] >= 0 && off.has(L.roomOf[c]);
        for (let k = 0; k < 12; k++) Cc.array[q * 3 + k] = base[q * 3 + k] * (dark ? 0.04 : 1);
      }
      Cc.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ baked light
  function bakeFacility(fac, plan, off = new Set()) {
    const L = fac.layout, W = L.w, C = L.cell, Y = L.y;
    const cellOf = (x, z) => { const gx = Math.floor((x - L.ox) / C), gz = Math.floor((z - L.oz) / C); return gx < 0 || gz < 0 || gx >= W || gz >= L.h ? -1 : gz * W + gx; };
    const lightCol = new Float32Array(W * L.h * 3);
    for (let i = 0; i < W * L.h; i++) {
      if (!L.cells[i]) continue;
      const lv = LEVEL_IDS[plan.cellLevel[i]] || 'l0', b = LOOK[lv].bake, v = lightOf(i, off);
      lightCol[i * 3] = b[0] * v; lightCol[i * 3 + 1] = b[1] * v; lightCol[i * 3 + 2] = b[2] * v;
    }
    const connected = (a, b) => {
      if (a === b) return true;
      const ax = a % W, az = (a / W) | 0, bx = b % W, bz = (b / W) | 0;
      if (Math.abs(ax - bx) + Math.abs(az - bz) !== 1) return false;
      const d = bx > ax ? 0 : bx < ax ? 2 : bz > az ? 1 : 3;
      return L.open.has(L.edgeKey(ax, az, d));
    };
    const out = [0, 0, 0];
    // light at a point owned by cell `own` (averaging open-connected neighbours around corners / along walls)
    const sample = (px, pz, own, samples) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const [sx, sz] of samples) {
        const c = cellOf(px + sx, pz + sz);
        if (c < 0 || !L.cells[c] || (c !== own && !connected(own, c))) continue;
        r += lightCol[c * 3]; g += lightCol[c * 3 + 1]; b += lightCol[c * 3 + 2]; n++;
      }
      if (!n && own >= 0) { r = lightCol[own * 3]; g = lightCol[own * 3 + 1]; b = lightCol[own * 3 + 2]; n = 1; }
      out[0] = n ? r / n : 0; out[1] = n ? g / n : 0; out[2] = n ? b / n : 0;
      return out;
    };
    const CORNER = [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]];
    const baked = new Set();
    const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3();
    let meshes = 0, verts = 0;
    fac.group.updateMatrixWorld(true);
    fac.group.traverse((m) => {
      if (!m.isMesh || !m.visible || Array.isArray(m.material) || !m.material) return;
      const mat = m.material;
      if (mat.transparent || !(mat.isMeshLambertMaterial || mat.isMeshStandardMaterial || mat.isMeshPhongMaterial)) return;
      let geo = m.geometry;
      const P = geo?.attributes?.position, N = geo?.attributes?.normal;
      if (!P || !N) return;
      if (baked.has(geo)) { geo = geo.clone(); m.geometry = geo; }
      baked.add(geo);
      const quads = !!(m.userData.levelKey || m.userData.brKey) && geo.index && P.count % 4 === 0;
      const arr = new Float32Array(P.count * 3);
      nm.getNormalMatrix(m.matrixWorld);
      const wp = [], wn = [];
      for (let k = 0; k < P.count; k++) {
        v.fromBufferAttribute(P, k).applyMatrix4(m.matrixWorld); nv.fromBufferAttribute(N, k).applyMatrix3(nm).normalize();
        wp.push(v.x, v.y, v.z); wn.push(nv.x, nv.y, nv.z);
      }
      const step = quads ? 4 : 1;
      for (let q = 0; q < P.count; q += step) {
        // owner cell: quad centre (GeoBuilder quads) or the vertex pushed along its normal (props)
        let ox = 0, oy = 0, oz = 0;
        for (let k = 0; k < step; k++) { ox += wp[(q + k) * 3]; oy += wp[(q + k) * 3 + 1]; oz += wp[(q + k) * 3 + 2]; }
        ox /= step; oy /= step; oz /= step;
        for (let k = 0; k < step; k++) {
          const j = q + k;
          const px = wp[j * 3], py = wp[j * 3 + 1], pz = wp[j * 3 + 2], nx = wn[j * 3], ny = wn[j * 3 + 1], nz = wn[j * 3 + 2];
          const own = cellOf(ox + nx * 0.25 + (ox - px) * 0.02, oz + nz * 0.25 + (oz - pz) * 0.02);
          const hC = own >= 0 ? (L.heightOf[own] || 3) : 3;
          let f;
          if (Math.abs(ny) < 0.5) {
            // walls / vertical faces: sample along the face (never through it), brighter towards the ceiling
            const tx = -nz, tz = nx;
            sample(px + nx * 0.25, pz + nz * 0.25, own, [[tx * 0.7, tz * 0.7], [-tx * 0.7, -tz * 0.7], [0, 0]]);
            const tH = Math.min(1, Math.max(0, (py - Y) / hC));
            f = quads ? 0.66 + 0.34 * tH : 0.55 + 0.4 * Math.min(1, (py - Y) / 1.6);
          } else if (ny > 0) {
            sample(px, pz, own, quads ? CORNER : [[0, 0]]);
            f = quads ? (py - Y < 0.05 ? 0.9 : 0.95) : 0.8;
          } else {
            sample(px, pz, own, quads ? CORNER : [[0, 0]]);
            f = 0.8;
          }
          arr[j * 3] = out[0] * f; arr[j * 3 + 1] = out[1] * f; arr[j * 3 + 2] = out[2] * f;
        }
      }
      const prev = geo.getAttribute('bake');
      if (prev && prev.count === P.count) { prev.array.set(arr); prev.needsUpdate = true; } else geo.setAttribute('bake', new THREE.BufferAttribute(arr, 3));
      m.material = bakeMaterial(mat);
      meshes++; verts += P.count;
    });
    S.bakeStats = { ...(S.bakeStats || {}), meshes, verts };
  }

  // ------------------------------------------------------------------ captions (VHS, bottom-left)
  // The caption sits in the free strip under the chat log (the chat is anchored 90 px above the bottom), so it never
  // covers system messages, objectives or the hotbar. Hidden together with the HUD (menus, death cam).
  let capEl = null;
  function ensureCaption() {
    if (capEl?.isConnected) return capEl;
    try {
      capEl = document.createElement('div');
      capEl.className = 'br-cap';
      capEl.style.cssText = 'position:fixed;left:22px;bottom:10px;z-index:7;pointer-events:none;font-family:VT323,"Courier New",monospace;color:#f4f4ee;'
        + 'opacity:0;transition:opacity .5s;padding:4px 14px 6px 10px;background:linear-gradient(90deg,rgba(0,0,0,.6),rgba(0,0,0,0));min-width:340px;overflow:hidden;';
      capEl.innerHTML = '<div class="br-rec" style="font-size:14px;letter-spacing:2px;color:#ff4a3a;text-shadow:0 0 6px #ff2010;line-height:1.1"></div>'
        + '<div class="br-t" style="font-size:31px;letter-spacing:3px;line-height:1.05;text-shadow:2px 0 0 rgba(255,0,60,.75),-2px 0 0 rgba(0,220,255,.7),0 0 10px rgba(255,255,255,.35);white-space:nowrap"></div>'
        + '<div class="br-s" style="font-size:17px;letter-spacing:1px;color:#d8d2b8;opacity:.9;white-space:nowrap;line-height:1.15"></div>'
        + '<div style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px)"></div>';
      (document.getElementById('ui') || document.body).appendChild(capEl);
    } catch { capEl = null; }
    return capEl;
  }
  function showCaption(id) {
    const lv = LEVEL_BY_ID[id];
    if (!lv) return;
    S.caption = { id, title: t(lv.caption), sub: t(SUBTITLE[id] || ''), t: 0 };
    const el = ensureCaption();
    if (el) el.style.opacity = '1';
    // a burst of tape noise
    S.noise = 0.34; S.noiseSet = 0;
  }
  function updateCaption(dt) {
    const c = S.caption, el = capEl;
    if (!c || !el) return;
    c.t += dt;
    const TYPE = 0.045, total = c.title.length * TYPE, hold = 4.2;
    const n = Math.min(c.title.length, Math.floor(c.t / TYPE));
    const glitch = Math.random() < 0.06 ? `translateX(${(Math.random() * 6 - 3).toFixed(1)}px)` : 'none';
    const now = new Date();
    const hh = String(3 + (now.getMinutes() % 2)).padStart(2, '0'), mm = String(now.getSeconds()).padStart(2, '0');
    const rec = `${(c.t % 1) < 0.55 ? '●' : ' '} REC   SP   ${hh}:${mm}:${String(Math.floor((c.t * 30) % 60)).padStart(2, '0')} AM`;
    el.style.visibility = game.ui?.hud?.el?.classList.contains('hidden') ? 'hidden' : '';
    const q = (s) => el.querySelector(s);
    q('.br-rec').textContent = rec;
    q('.br-t').textContent = c.title.slice(0, n) + (n < c.title.length && (c.t * 8) % 2 < 1 ? '_' : '');
    q('.br-t').style.transform = glitch;
    q('.br-s').textContent = c.t > total + 0.25 ? c.sub.slice(0, Math.floor((c.t - total - 0.25) / 0.025)) : '';
    if (c.t > total + hold) el.style.opacity = '0';
    if (c.t > total + hold + 0.8) { S.caption = null; }
  }

  // ------------------------------------------------------------------ audio
  const au = () => game.audio;
  function lapBuffer() {
    const a = au();
    if (!a?.ctx || S.lapBuf) return;
    S.lapBuf = true;
    try {
      const sr = a.ctx.sampleRate, len = Math.floor(sr * 6), buf = a.ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0, lp2 = 0;
        const r = new RNG(77 + ch);
        for (let i = 0; i < len; i++) {
          const tt = i / sr;
          const wn = r.next() * 2 - 1;
          lp += (wn - lp) * 0.035; lp2 += (lp - lp2) * 0.05;
          const swell = 0.55 + 0.45 * Math.sin(tt * Math.PI * 2 / 3 + ch) * Math.sin(tt * Math.PI * 2 / 6);   // loops cleanly every 6 s
          d[i] = lp2 * 3.2 * swell;
        }
        for (let k = 0; k < 14; k++) {   // soft plips against the tiles
          const at = Math.floor(r.next() * (len - sr * 0.2)), f = 380 + r.next() * 520;
          for (let i = 0; i < sr * 0.12; i++) { const e = Math.exp(-i / (sr * 0.025)); d[at + i] += Math.sin((i / sr) * f * Math.PI * 2 * (1 + i / (sr * 0.2))) * e * 0.16; }
        }
        const fade = Math.floor(sr * 0.05);
        for (let i = 0; i < fade; i++) { const g = i / fade; d[i] *= g; d[len - 1 - i] *= g; }
      }
      a.buffers.set('brl_lap', buf);
      // warped party blower for Level Fun
      const hl = Math.floor(sr * 0.9), hb = a.ctx.createBuffer(1, hl, sr), hd = hb.getChannelData(0);
      let ph = 0;
      for (let i = 0; i < hl; i++) {
        const tt = i / sr, f = 520 * Math.pow(0.55, tt / 0.9) * (1 + 0.035 * Math.sin(tt * 38));
        ph += f / sr;
        const saw = (ph % 1) * 2 - 1, env = Math.min(1, tt / 0.03) * Math.exp(-Math.max(0, tt - 0.55) * 7);
        hd[i] = (saw * 0.55 + Math.sign(Math.sin(ph * Math.PI * 2)) * 0.25) * env * 0.4;
      }
      a.buffers.set('brl_horn', hb);
    } catch (e) { console.warn('brlevels sounds', e); }
  }
  function teardownAudio() {
    const a = au();
    try { a?.setAmbience?.('brl', null); a?.setAmbience?.('brlhum', null); } catch { /* ignore */ }
    try { S.funLoop?.stop?.(1.2); } catch { /* ignore */ }
    S.funLoop = null;
  }
  function levelAudio(id, dt) {
    const a = au();
    if (!a?.ctx) return;
    lapBuffer();
    const p = game.player, power = game.lights.globalDim > 0;
    const look = LOOK[id] || LOOK.l0;
    a.setAmbience('brlhum', power && look.hum > 0 ? 'lights_buzz' : null, look.hum, 2);
    a.setAmbience('brl', id === 'pool' ? 'brl_lap' : id === 'l2' ? 'ambience_facility' : null, id === 'pool' ? 0.42 : 0.3, 2.5);
    // Level Fun: the music box plays from inside the room (3D), louder as you get closer
    const fun = S.plan?.fun?.room;
    if (fun && p.indoor && !p.dead) {
      const L = S.L, c = new THREE.Vector3(L.ox + (fun.x + fun.w / 2) * L.cell, L.y + 1.2, L.oz + (fun.z + fun.h / 2) * L.cell);
      const d = c.distanceTo(p.pos);
      if (d < 34 && !S.funLoop) S.funLoop = a.play('jester_music', { loop: true, pos: c, volume: 0.6, pitch: 0.79, bus: 'amb', refDistance: 3, maxDistance: 40, rolloff: 1.1, occlude: true });
      else if (d > 40 && S.funLoop) { S.funLoop.stop(1.5); S.funLoop = null; }
      if (S.funLoop && d < 18) {
        S.funHornT -= dt;
        if (S.funHornT <= 0) { S.funHornT = 7 + Math.random() * 12; a.at('brl_horn', { x: c.x + (Math.random() - 0.5) * 6, y: c.y + 0.5, z: c.z + (Math.random() - 0.5) * 6 }, 0.55, { pitch: 0.8 + Math.random() * 0.4 }); }
      }
    } else if (S.funLoop) { S.funLoop.stop(1); S.funLoop = null; }
    // positional one-shots around the listener
    S.oneShotT -= dt;
    if (S.oneShotT > 0 || p.dead || !p.indoor) return;
    const pick = { l1: [['drip', 0.55, 3], ['drip', 0.5, 3], ['light_flicker', 0.35]], l2: [['pipe_groan', 0.5, 2], ['steam_hiss', 0.35], ['pipe_groan', 0.45, 2]], pool: [['drip', 0.5, 3]], l0: [['light_flicker', 0.3]], run: [], fun: [], manila: [] }[id] || [];
    S.oneShotT = id === 'l1' ? 2.2 + Math.random() * 3.5 : id === 'l2' ? 4 + Math.random() * 7 : 9 + Math.random() * 14;
    if (!pick.length) return;
    const [name, vol, variants] = pick[(Math.random() * pick.length) | 0];
    let snd = name;
    if (variants) { snd = `${name}_${1 + ((Math.random() * variants) | 0)}`; if (!a.has(snd)) snd = a.has(`${name}_1`) ? `${name}_1` : name; }
    if (!a.has(snd)) return;
    const ang = Math.random() * Math.PI * 2, dd = 3 + Math.random() * 7;
    a.at(snd, { x: p.pos.x + Math.cos(ang) * dd, y: p.pos.y + 1.6 + Math.random(), z: p.pos.z + Math.sin(ang) * dd }, vol);
  }

  // ------------------------------------------------------------------ per frame
  function update(dt) {
    const p = game.player;
    // contains(): only the facility's own floor band (another module's pocket level elsewhere below ground is not ours)
    const inside = !!(S.plan && S.fac && game.world.facility === S.fac && p?.indoor && !p.dead && S.fac.contains?.(p.pos));
    const M = S.plan ? brMaterials() : null;
    // shared animated materials (only matter while a backrooms facility exists)
    if (S.plan && M) {
      const dim = Math.min(1, game.lights.globalDim);
      S.bakeV += ((dim > 0 ? 1 : 0.0) - S.bakeV) * Math.min(1, dt * (dim > 0 ? 1.5 : 6));
      BAKE.value = S.bakeV;
      S.flickT -= dt;
      if (S.flickT <= 0) { S.flickOn = !S.flickOn; S.flickT = S.flickOn ? 0.05 + Math.random() * (Math.random() < 0.3 ? 2.5 : 0.35) : 0.03 + Math.random() * 0.12; }
      const base = 0.06 + 0.94 * S.bakeV;
      M.lit.color.setRGB(1.45 * base, 1.4 * base, 1.25 * base);
      const fk = S.flickOn ? base : 0.08;
      M.flicker.color.setRGB(1.45 * fk, 1.4 * fk, 1.25 * fk);
      const tt = game.time || 0;
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(tt * 5.2), 3);
      M.beacon.color.setRGB(0.35 + 1.4 * pulse, 0.04 + 0.12 * pulse, 0.03 + 0.08 * pulse);
      for (const e of S.runEmitters) e.intensity = 0.35 + 1.2 * pulse;
      if (M.water.map) { M.water.map.offset.x = (tt * 0.013) % 1; M.water.map.offset.y = (tt * 0.021) % 1; }
    }
    // tape-noise burst of a caption
    if (S.noise > 0) {
      const fx = game.engine?.fx;
      if (fx) { if (fx.noise === S.noiseSet || fx.noise < S.noise) { fx.noise = S.noise; S.noiseSet = S.noise; } }
      S.noise = Math.max(0, S.noise - dt * 0.7);
      if (S.noise === 0 && fx && fx.noise === S.noiseSet) fx.noise = 0;
    }
    updateCaption(dt);
    if (!inside) {
      if (S.active) { S.active = false; teardownAudio(); game.lights.ambient.color.set(0xffffff); }
      if (S.cur && !p?.indoor) S.cur = null;
      return;
    }
    S.active = true;
    S.brkT -= dt;
    if (S.breakers?.length && S.brkT <= 0) { S.brkT = 0.25; const k = breakerKey(); if (k !== S.brkKey) { S.brkKey = k; relight(); } }
    // which level are we in?
    const id = levelIdAt(S.L, S.plan, p.pos.x, p.pos.z) || S.cur || 'l0';
    if (id !== S.cur) {
      const prev = S.cur;
      S.cur = id;
      const first = !S.seenDay.has(id);
      if (first) { S.seenDay.add(id); showCaption(id); }
      if (id === 'run') { const a = au(); if (a?.ctx) a.play(a.has('siren') ? 'siren' : 'alarm_loop', { volume: 0.55, bus: 'sfx' }); }
      if (id === 'manila' && first) game.ui?.toast?.(t('You found the Manila Room.'), 'good');
      try { game.mods?.emit?.('tfg:brlevel', { id, prev, first, local: true }); } catch { /* listeners are optional */ }
    }
    // atmosphere: fog + ambient follow the level and how lit the cell under you is (eyes adjusting)
    const cell = S.fac.cellAt(p.pos.x, p.pos.z);
    const lightHere = cell >= 0 ? lightOf(cell, S.off || new Set()) : 1;
    const look = LOOK[id] || LOOK.l0;
    const dk = Math.max(0, Math.min(1, (0.45 - lightHere) / 0.45)) * (id === 'run' || id === 'l2' ? 0.4 : 1);
    const power = S.bakeV;
    _c1.set(look.fog).lerp(_c2.set(DARK_LOOK.fog), Math.max(dk, 1 - power));
    const wantD = look.dens + (DARK_LOOK.dens - look.dens) * Math.max(dk, 1 - power);
    const k = Math.min(1, dt * 1.2);
    S.fogC.lerp(_c1, k); S.fogD += (wantD - S.fogD) * k;
    S.fog.fog = S.fogC.getHex(); S.fog.density = S.fogD;
    const wantA = (look.amb + (DARK_LOOK.amb - look.amb) * dk) * power + 0.012 * (1 - power);
    S.amb += (wantA - S.amb) * Math.min(1, dt * 0.9);
    _c1.set(look.ambC);
    S.ambC.lerp(_c1, k);
    game.lights.ambient.intensity = S.amb;
    game.lights.ambient.color.copy(S.ambC);
    levelAudio(id, dt);
  }

  // ------------------------------------------------------------------ host: the Manila Room prize
  function hostPrize() {
    const fac = game.world?.facility;
    const plan = fac?.layout?.brPlan;
    if (!game.isHost || !plan?.manila) return;
    const key = `${fac.layout.seed}|${game.run?.daysLeft}|${game.run?.quotaIndex}`;
    if (S.lootDone === key) return;
    S.lootDone = key;
    const r = new RNG((fac.layout.seed ^ 0x3a41a) >>> 0);
    const L = fac.layout, rm = plan.manila.room;
    const cx = plan.manila.loot?.x ?? L.ox + (rm.x + rm.w / 2) * L.cell, cz = plan.manila.loot?.z ?? L.oz + (rm.z + rm.h / 2) * L.cell;
    const y = plan.manila.lootY ?? L.y + 0.95;
    const prize = r.pick(['goldbar', 'ring', 'goldbar', 'figurine', 'trophy']);
    try {
      game.items.hostSpawn(prize, new THREE.Vector3(cx, y + 0.1, cz), { valueMul: 2.2 + (game.run?.quotaIndex || 0) * 0.15 });
      for (const extra of ['x_almondwater', 'x_almondwater']) if (ITEMS[extra]) game.items.hostSpawn(extra, new THREE.Vector3(cx + r.float(-0.5, 0.5), y + 0.1, cz + r.float(-0.25, 0.25)), {});
    } catch (e) { console.warn('manila prize', e); }
  }

  on('mapLoaded', () => setup());
  on('update', (dt) => update(dt));
  on('moonPopulated', () => hostPrize());
  on('phase', (ph) => {
    if (ph !== 'orbit' && ph !== 'landing') return;
    S.seenDay.clear(); S.caption = null;
    if (capEl) capEl.style.opacity = '0';
    if (ph === 'orbit') { teardownAudio(); S.plan = null; S.fac = null; S.L = null; S.cur = null; S.runEmitters = []; BAKE.value = 1; }
  });
  if (game.world?.facility) setup();

  const api = {
    LEVELS,
    get current() { return S.cur; },
    get plan() { return S.plan; },
    get stats() { return { bake: S.bakeStats || null, level: S.cur, fog: S.fog, amb: S.amb }; },
    levelAt(pos) {
      const fac = game.world?.facility;
      if (!pos || !fac || fac.layout?.theme !== 'backrooms' || !fac.contains?.(pos)) return null;
      const plan = fac.layout.brPlan || planBackroomsLevels(fac.layout, { dark: planDarkCorridors(fac.layout) });
      return levelIdAt(fac.layout, plan, pos.x, pos.z);
    },
    /** debug: show a caption now (e.g. kefal.game.brlevels.caption('fun')) */
    caption(id) { showCaption(id); },
    dispose() {
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      offs.length = 0;
      teardownAudio();
      try { game.lights.ambient.color.set(0xffffff); } catch { /* ignore */ }
      BAKE.value = 1;
      try { capEl?.remove(); } catch { /* ignore */ }
      capEl = null;
    },
  };
  return api;
}
