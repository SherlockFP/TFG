// SOUL (wave 8, module 'soul'; docs/wave8/soul.md): the "this game has no soul" pass. Installed with this.useModule('soul', installSoul) -> game.soul.
//   1. one colour identity per moon (BIOMES patched at install, generated sectors get a seeded shift, post saturation grade) - no new lights
//   2. outdoor STORY BEATS every ~25 m between the ship and the entrance (sponsor signs, last-crew camps with a note, Company crates, body bags, tire tracks, crashed drones, tape)
//   3. SHIP soul: whiteboard with real stats, Company poster, crew shelf (mugs + a plant that grows with quotas), sticky notes (positions: world/shiplayout.js SOUL)
//   4. moments: touchdown title card, sale count-up + register + Algorithm reaction, quota PA line, pickup pop, low-HP audio muffle (the heartbeat lives in feel.js / downed.js)
//   5. voice: Algorithm + Company PA lines, <= 1 per 45 s, silent while chased, all EN/TR/RU (soul_core.js TX)
// Everything is local presentation (no net messages, no host state): the beats are seeded by (moon, seed) so every peer sees the same ones.
import * as THREE from 'three';
import { MOONS, BIOMES } from './moons.js';
import { G } from '../physics/physics.js';
import { Bag } from './mapart_art.js';
import { synth, sin, ex } from './combat_kit.js';
import { lowHpLevel } from './feel_core.js';
import { t, onLangChange } from '../core/i18n.js';
import { fmtMoney } from '../core/util.js';
import { hashString } from '../core/rng.js';
import { SOUL } from '../world/shiplayout.js';
import * as C from './soul_core.js';

const TAU = Math.PI * 2;
const SOUNDS = {
  sl_cha: (sr) => synth(sr, 0.9, (tt) => (sin(1568, tt) * ex(tt, 16) + (tt > 0.09 ? (sin(2093, tt - 0.09) + 0.4 * sin(4186, tt - 0.09)) * ex(tt - 0.09, 5.5) * 0.8 : 0)) * 0.32),
  sl_tick: (sr) => synth(sr, 0.07, (tt) => sin(1900, tt) * ex(tt, 55) * 0.3),
  sl_pop: (sr) => synth(sr, 0.16, (tt) => sin(480 + 900 * (1 - Math.exp(-tt * 38)), tt) * ex(tt, 20) * 0.32),
};
const CSS = `.sl-card{position:fixed;left:0;right:0;top:30%;text-align:center;pointer-events:none;z-index:45;font-family:var(--cond,'Barlow Condensed','Arial Narrow',sans-serif);color:#ece4cf;opacity:0;transition:opacity .55s;text-shadow:0 2px 10px #000}
.sl-card.on{opacity:1}.sl-card .k{font-size:15px;letter-spacing:.42em;color:#f2c230;text-transform:uppercase}.sl-card .n{font-size:54px;letter-spacing:.06em;margin:4px 0 8px;text-transform:uppercase}
.sl-card .l{font-size:19px;font-style:italic;max-width:640px;margin:0 auto;color:#ffb86a}.sl-card .s{font-size:12px;letter-spacing:.2em;color:#8a8474;margin-top:16px}
.sl-pop{position:fixed;left:50%;top:60%;transform:translateX(-50%);pointer-events:none;z-index:44;font-family:var(--cond,'Barlow Condensed','Arial Narrow',sans-serif);font-size:24px;color:#f2c230;text-shadow:0 2px 6px #000;opacity:0}
.sl-react{margin-top:8px;font-style:italic;color:#ffb86a;font-size:15px;line-height:1.25;text-align:center}`;

export function installSoul(game) {
  const mods = game.mods;
  if (!mods) return null;
  C.registerSoulText();
  const offs = [], restores = [], timers = [], cols = [];
  let disposed = false, style = null;
  const gate = C.makeGate();
  const S = { time: 0, prevPhase: null, map: null, pending: null, visited: new Set(), moonT: 0, walkT: C.VOICE.firstAfter, paT: 0, paN: 0, lines: 0, popT: 0, muff: 0, muffSet: 0, card: null, ship: null, shipKey: '' };
  const backup = [];   // [obj, key, old] for the BIOMES patch
  const later = (fn, ms) => { const id = setTimeout(() => { if (!disposed) fn(); }, ms); timers.push(id); return id; };
  const snd = (name, vol = 0.7, pitch) => { try { mods.ensureSound?.(name); game.audio?.play?.(name, { volume: vol, bus: 'ui', pitch }); } catch { /* audio optional */ } };
  const tx = C.tx;
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const own = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] !== w) return; if (own) obj[name] = orig; else delete obj[name]; });
  };
  if (mods.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mods.soundGens.has(n)) mods.soundGens.set(n, fn);
  if (typeof document !== 'undefined') {
    style = document.createElement('style'); style.textContent = CSS; document.head?.appendChild(style);
  }

  // ================================================================== 1. palettes
  for (const [moonId, pal] of Object.entries(C.PALETTES)) {
    void moonId;
    const b = BIOMES[pal.biome];
    if (!b) continue;
    for (const k of C.GRADE_KEYS) if (pal[k] !== undefined) { backup.push([b, k, b[k]]); b[k] = pal[k]; }
  }
  let curSat = 1;
  function setSat(v) {
    curSat = v;
    try { const u = game.engine?.postMat?.uniforms?.uSat; if (u) u.value = v; } catch { /* no post yet */ }
  }
  function palOf(moonId) { return C.PALETTES[moonId] || null; }
  function applyPalette(world) {
    const moon = MOONS[world?.moonId];
    if (!moon || moon.customMap || moon.home) { setSat(1); return; }
    let pal = palOf(world.moonId);
    if (!pal && game.env?.biome) {   // generated sector / other map: seeded shift of its own biome so no two look alike
      pal = C.paletteFor(world.moonId, game.env.biome, world.seed);
      if (pal) game.env.biome = { ...game.env.biome, ...pal };
    }
    setSat(pal?.sat ?? 1);
  }

  // ================================================================== 2. story beats
  function panelTex(text, W, H, o = {}) {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    if (!c) return null;
    c.fillStyle = o.bg || '#151820'; c.fillRect(0, 0, W, H);
    if (o.border) { c.strokeStyle = o.border; c.lineWidth = Math.max(3, W / 64); c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth); }
    if (o.stripe) { for (let x = -H; x < W; x += 22) { c.fillStyle = (x / 22) & 1 ? '#111' : '#f0c020'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 14, 0); c.lineTo(x + 14 - 10, 10); c.lineTo(x - 10, 10); c.fill(); } }
    const pad = Math.round(W * 0.06), top = o.tag ? Math.round(H * 0.2) : pad;
    fitText(c, text, pad, top, W - pad * 2, H - top - pad, o.fg || '#f2e8c8', o.font || "'Barlow Condensed','Arial Narrow',sans-serif", o.max || 56, o.align || 'center', o.upper);
    if (o.tag) { c.font = `bold ${Math.round(H * 0.11)}px 'Barlow Condensed',sans-serif`; c.fillStyle = o.tagFg || '#f2c230'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(o.tag, pad, Math.round(H * 0.05)); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    return tex;
  }
  function fitText(c, text, x, y, w, h, fg, font, max, align) {
    const paras = String(text).split('\n');
    let size = max, lines = [];
    for (; size >= 9; size -= 2) {
      c.font = `${size}px ${font}`;
      lines = [];
      for (const p of paras) {
        let cur = '';
        for (const wd of p.split(' ')) { const tryL = cur ? cur + ' ' + wd : wd; if (c.measureText(tryL).width > w && cur) { lines.push(cur); cur = wd; } else cur = tryL; }
        lines.push(cur);
      }
      if (lines.length * size * 1.15 <= h) break;
    }
    c.fillStyle = fg; c.textAlign = align; c.textBaseline = 'middle';
    const lh = size * 1.15, y0 = y + (h - lines.length * lh) / 2 + lh / 2;
    lines.forEach((ln, i) => c.fillText(ln, align === 'center' ? x + w / 2 : x, y0 + i * lh));
  }

  const COL = { metal: 0x59606a, dark: 0x1a1c22, rust: 0x7a4a30, crate: 0x8a6a3a, crate2: 0x6e5430, yel: 0xd8b020, white: 0xcfcab8, tent: 0xc0662c, tent2: 0x8f4a20, bag: 0x1f2428, zip: 0x3a4248, wood: 0x5a4030, ash: 0x2a2624, stone: 0x6a6a6a };

  function buildBeats(specs, out) {
    const h = (x, z) => out.terrain.heightAt(x, z);
    const solid = new Bag(), glow = new Bag(), tread = [];
    const group = new THREE.Group(); group.name = 'soul_beats';
    const mats = [], texs = [], geos = [], colliders = [];
    const accent = (BIOMES[MOONS[game.world?.moonId]?.biome]?.dusk) ?? 0xff7a2a;
    for (const s of specs) {
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      const W = (lx, lz) => [s.x + c * lx + sn * lz, s.z - sn * lx + c * lz];
      let base = h(s.x, s.z);
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const [wx, wz] = W(ax * s.r * 0.7, az * s.r * 0.7); base = Math.min(base, h(wx, wz)); }
      s.gy = base;
      const B = (lx, y0, lz, sx, sy, sz, color, ry = 0, rx = 0, rz = 0, g = solid) => {
        const [wx, wz] = W(lx, lz), skirt = y0 < 0.15 && !rx && !rz ? 0.4 : 0;
        g.box(wx, base + y0 + (sy - skirt) / 2, wz, sx, sy + skirt, sz, color, s.yaw + ry, rx, rz);
      };
      const K = (lx, y0, lz, sx, sy, sz, ry = 0) => { const [wx, wz] = W(lx, lz), gb = Math.max(base, h(wx, wz) - 0.3); colliders.push({ x: wx, y: gb + y0 + sy / 2 - 0.2, z: wz, sx, sy: sy + 0.4, sz, ry: s.yaw + ry, data: { kind: 'prop', id: 'soul:' + s.id } }); };
      const Q = (text, lx, y0, lz, w, hh, ry, o = {}) => {
        const tex = panelTex(text, o.W || 256, o.H || Math.round((o.W || 256) * hh / w), o);
        const mat = new THREE.MeshBasicMaterial({ map: tex || undefined, color: tex ? 0xffffff : 0x404050, side: THREE.DoubleSide, fog: true });
        const g = new THREE.PlaneGeometry(w, hh);
        const m = new THREE.Mesh(g, mat);
        const [wx, wz] = W(lx, lz);
        m.position.set(wx, base + y0 + hh / 2, wz); m.rotation.y = s.yaw + ry;
        m.name = 'soul_txt'; group.add(m);
        mats.push(mat); geos.push(g); if (tex) texs.push(tex);
        return m;
      };
      switch (s.kind) {
        case 'sponsor': {
          const txt = t(C.TX.sponsor[s.v % C.TX.sponsor.length][0]);
          const bgs = ['#141826', '#1c1218', '#10201c', '#20180c', '#181818', '#16122a'];
          for (const sx of [-1.55, 1.55]) { B(sx, 0, 0, 0.16, 3.2, 0.16, COL.metal); K(sx, 0, 0, 0.3, 3.2, 0.3); }
          B(0, 1.5, -0.05, 3.5, 1.7, 0.1, COL.dark);
          B(0, 3.2, 0, 3.5, 0.08, 0.16, accent, 0, 0, 0, glow);
          Q(txt, 0, 1.55, 0.02, 3.3, 1.55, 0, { W: 384, H: 180, bg: bgs[s.v % bgs.length], fg: '#f4ead0', border: '#' + new THREE.Color(accent).getHexString(), tag: t(C.TX.sponsorTag[0][0]), max: 46 });
          break;
        }
        case 'camp': {
          const note = t(C.TX.camp[s.v % C.TX.camp.length][0]);
          const phi = 0.588, L = 1.8;
          B(-2.3 - 0.5, 0, 0, 0.05, L, 2.4, COL.tent, 0, 0, -phi); B(-2.3 + 0.5, 0, 0, 0.05, L, 2.4, COL.tent2, 0, 0, phi);
          for (const sz of [-1.2, 1.2]) B(-2.3, 0, sz, 1.0, 1.5, 0.04, COL.tent2);   // gable ends
          K(-2.3, 0, 0, 2.1, 1.5, 2.4);
          for (let k = 0; k < 8; k++) { const a = k * TAU / 8; B(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6 + 0.6, 0.26, 0.22, 0.26, COL.stone, a); }   // fire ring
          B(0, 0, 0.6, 0.8, 0.06, 0.8, COL.ash);
          B(1.6, 0, -0.4, 0.75, 0.14, 1.9, 0x3a5a6a, 0.2); B(1.9, 0, 1.9, 0.75, 0.14, 1.9, 0x6a4a3a, -0.4);   // bedrolls
          B(0.9, 0, 2.3, 0.14, 1.7, 0.14, COL.wood); K(0.9, 0, 2.3, 0.3, 1.7, 0.3);
          B(-0.55, 0, 2.0, 0.22, 0.32, 0.22, 0x8a8a70); B(-0.55, 0.32, 2.0, 0.1, 0.1, 0.1, 0xffc060, 0, 0, 0, glow);   // dead lantern that still glows a little
          Q(note, 0.9, 1.05, 2.34, 0.85, 0.6, 0, { W: 256, H: 180, bg: '#e8dcb0', fg: '#3a2c1a', font: "'Segoe Print','Comic Sans MS',cursive", max: 22, align: 'left' });
          break;
        }
        case 'crate': {
          const txt = t(C.TX.crate[s.v % C.TX.crate.length][0]);
          B(0, 0, 0, 1.3, 0.85, 1.05, COL.crate); B(0.1, 0.85, 0.05, 0.95, 0.72, 0.9, COL.crate2, 0.3);
          B(1.5, 0, 0.5, 0.9, 0.55, 0.8, COL.crate, 0.9, 0, 0.18);   // one tipped over
          B(0, 0.86, 0, 1.34, 0.05, 0.12, COL.yel); B(0, 0.4, 0.53, 1.34, 0.1, 0.05, COL.yel);
          K(0, 0, 0, 1.5, 1.55, 1.25); K(1.5, 0, 0.5, 1.0, 0.6, 0.9, 0.9);
          Q(txt, 0, 0.16, 0.535, 1.15, 0.5, 0, { W: 256, H: 112, bg: '#8a6a3a', fg: '#1a1208', font: "'Courier New',monospace", max: 26, stripe: false });
          break;
        }
        case 'bag': {
          B(0, 0, 0, 0.62, 0.24, 1.95, COL.bag); B(0, 0.24, 0, 0.5, 0.06, 1.7, COL.bag); B(0, 0.29, 0, 0.04, 0.02, 1.6, COL.zip);
          B(0.95, 0, 0.5, 0.06, 0.55, 0.06, COL.wood);
          Q(t(C.TX.bag[s.v % C.TX.bag.length][0]), 0.95, 0.5, 0.56, 0.5, 0.36, 0, { W: 200, H: 144, bg: '#d8d0b0', fg: '#201810', font: "'Courier New',monospace", max: 24 });
          break;
        }
        case 'drone': {
          B(0, 0.1, 0, 0.8, 0.2, 0.8, 0x2a2e36, 0.4, 0.35, 0.1);
          for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + Math.PI / 4; if (k === 2) continue; B(Math.cos(a) * 0.55, 0.15, Math.sin(a) * 0.55, 0.06, 0.05, 0.85, COL.metal, -a + Math.PI / 2, 0.1, 0); B(Math.cos(a) * 0.9, 0.2, Math.sin(a) * 0.9, 0.62, 0.02, 0.62, 0x14161a, a); }
          B(1.25, 0, 0.6, 0.62, 0.02, 0.62, 0x14161a, 0.6);   // rotor that came off
          B(0, 0.12, 0.42, 0.14, 0.14, 0.05, 0x501010, 0.4);
          B(-0.9, 0, 1.1, 0.06, 0.5, 0.06, COL.wood);
          K(0, 0, 0, 1.1, 0.5, 1.1);
          Q(t(C.TX.drone[s.v % C.TX.drone.length][0]), -0.9, 0.45, 1.15, 0.5, 0.36, 0, { W: 200, H: 144, bg: '#d8d0b0', fg: '#201810', font: "'Courier New',monospace", max: 24 });
          break;
        }
        case 'tape': {
          const stakeH = 1.1;
          for (const sx of [-1.7, 1.7]) B(sx, 0, 0, 0.07, stakeH, 0.07, COL.wood);
          for (let k = 0; k < 14; k++) { const u = (k + 0.5) / 14, x = -1.7 + 3.4 * u, sag = Math.sin(u * Math.PI) * 0.12; B(x, stakeH - 0.15 - sag, 0, 3.4 / 14, 0.08, 0.012, k & 1 ? 0x111111 : 0xf0c020); }
          Q(t(C.TX.tape[s.v % C.TX.tape.length][0]), -1.7, 0.55, 0.06, 0.62, 0.42, 0, { W: 200, H: 136, bg: '#f0c020', fg: '#111', max: 26 });
          break;
        }
        case 'tracks': {
          const P = s.pts || [];
          for (const off of [-0.7, 0.7]) {
            for (let i = 0; i + 1 < P.length; i++) {
              const a = P[i], b = P[i + 1], w = 0.15;
              const q = (p, sd) => { const x = p.x + -p.tz * (off + sd), z = p.z + p.tx * (off + sd); return [x, h(x, z) + 0.07, z]; };
              const v = [q(a, -w), q(a, w), q(b, w), q(b, -w)];
              tread.push(v[0], v[1], v[2], v[0], v[2], v[3]);
            }
          }
          const e = P[P.length - 1];
          if (e) {   // a lost handcart at the end of the ruts
            const bx = e.x + -e.tz * 1.5, bz = e.z + e.tx * 1.5, yaw = Math.atan2(e.tx, e.tz);
            const gy = h(bx, bz);
            const Bw = (lx, y0, lz, sx, sy, sz, color, ry = 0) => solid.box(bx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, gy + y0 + sy / 2, bz - Math.sin(yaw) * lx + Math.cos(yaw) * lz, sx, sy, sz, color, yaw + ry);
            Bw(0, 0.3, 0, 0.9, 0.42, 1.3, COL.rust); Bw(0, 0.62, 0.7, 0.08, 0.06, 0.7, COL.metal);
            for (const sx of [-0.5, 0.5]) solid.cyl(bx + Math.cos(yaw) * sx, gy + 0.28, bz - Math.sin(yaw) * sx, 0.28, 0.28, 0.08, COL.dark, 8, 0, Math.PI / 2, yaw);
            colliders.push({ x: bx, y: gy + 0.4, z: bz, sx: 1.1, sy: 0.9, sz: 1.5, ry: yaw, data: { kind: 'prop', id: 'soul:' + s.id } });
          }
          break;
        }
        default: break;
      }
    }
    const sg = solid.build(), gg = glow.build();
    if (sg) { const m = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.name = 'soul_solid'; group.add(m); mats.push(m.material); geos.push(sg); }
    if (gg) { const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); m.name = 'soul_glow'; group.add(m); mats.push(m.material); geos.push(gg); }
    if (tread.length) {
      const pos = new Float32Array(tread.length * 3), nrm = new Float32Array(tread.length * 3), col = new Float32Array(tread.length * 3);
      tread.forEach((v, i) => { pos.set(v, i * 3); nrm.set([0, 1, 0], i * 3); col.set([0.1, 0.08, 0.06], i * 3); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
      const m = new THREE.Mesh(g, mat); m.name = 'soul_tracks'; group.add(m); mats.push(mat); geos.push(g);
    }
    return { group, colliders, dispose() { group.removeFromParent(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const x of texs) x.dispose(); } };
  }

  function clearBeats() {
    if (S.map) { try { S.map.art.dispose(); } catch { /* ignore */ } }
    for (const c of cols.splice(0)) { try { game.physics.removeCollider(c); } catch { /* gone with the world */ } }
    S.map = null; S.pending = null; S.visited.clear();
  }
  function onMapLoaded(world) {
    clearBeats();
    const out = world?.outdoor, moon = MOONS[world?.moonId];
    if (disposed || !out || !moon || world.company || moon.customMap || moon.home) return;
    applyPalette(world);
    if (!out.plan || !out.terrain?.heightAt || !out.group) return;
    if (game.mapart) S.pending = world;   // let mapart place its billboards / signs first (installed after us): build on the first update
    else buildFor(world);
  }
  function buildFor(world) {
    const out = world.outdoor, terrain = out.terrain, plan = out.plan, b = plan.biome || {};
    const trees = (out.harvest?.trees || []).concat(out.harvest?.rocks || []);
    const scrap = out.decor?.scrapSpots || [];
    const others = [];
    try { for (const sp of game.mapart?.plan?.() || []) if (Number.isFinite(sp.x)) others.push({ x: sp.x, z: sp.z, r: sp.r || 2 }); } catch { /* mapart optional */ }
    const extraOk = (px, pz, r) => {
      if (terrain.lavaDepthAt && terrain.lavaDepthAt(px, pz) > -0.6) return false;
      if (out.solidAt && out.solidAt(px, pz, Math.min(r, 2.5))) return false;   // [pacing] compact maps are denser: keep off rocks / POI solids too
      for (const tr of trees) if (Math.abs(tr.x - px) < r + 2 && Math.abs(tr.z - pz) < r + 2 && Math.hypot(tr.x - px, tr.z - pz) < r + 1.6) return false;
      for (const s of scrap) if (Math.hypot(s.x - px, s.z - pz) < r + 2.5) return false;
      return true;
    };
    const specs = C.planBeats({
      seed: world.seed | 0, moonId: world.moonId, pathPts: terrain.pathPts, heightAt: (x, z) => terrain.heightAt(x, z), plan, half: terrain.half,
      floodY: b.flood ?? null, avoid: out.avoid || null, extraOk, others,
    });
    if (!specs.length) return;
    const art = buildBeats(specs, out);
    out.group.add(art.group);
    for (const c of art.colliders) {
      try { cols.push(game.physics.addStaticBox(c.x, c.y, c.z, c.sx / 2, c.sy / 2, c.sz / 2, c.ry, G.STATIC, c.data || { kind: 'prop' })); } catch (e) { console.warn('[soul] collider', e); }
    }
    S.map = { key: `${world.moonId}|${world.seed}`, out, specs, art };
  }

  // ================================================================== 3. ship soul
  function canvasTex(W, H, draw) {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    if (!c) return null;
    draw(c, W, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  function drawBoard(c, W, H) {
    const m = C.boardModel(game.run, game.profile?.stats);
    c.fillStyle = '#e6eae2'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#c9cec6'; c.fillRect(0, 0, W, 10); c.fillRect(0, H - 10, W, 10);
    c.textBaseline = 'middle';
    c.font = "bold 40px 'Barlow Condensed','Arial Narrow',sans-serif"; c.fillStyle = '#b02a22'; c.textAlign = 'left';
    c.fillText(t(C.TX.boardTitle[0][0]), 24, 44);
    const rows = [[C.TX.boardDays, m.days, '#1f4a8a'], [C.TX.boardDead, m.dead, '#b02a22'], [C.TX.boardBest, m.best ? '▮' + m.best : '-', '#1c6a3a'], [C.TX.boardQuota, m.quotas, '#1f4a8a']];
    rows.forEach(([tk, v, col], i) => {
      const y = 104 + i * 62;
      c.font = "26px 'Segoe Print','Comic Sans MS',cursive"; c.fillStyle = col; c.textAlign = 'left';
      c.fillText(t(tk[0][0]), 24, y);
      c.textAlign = 'right'; c.font = "bold 34px 'Segoe Print','Comic Sans MS',cursive"; c.fillText(String(v), W - 24, y);
      if (i < 2) {   // tally marks under the numbers: days and deaths
        const groups = C.tallyGroups(i === 0 ? m.days : m.dead, 20);
        let x = 26; c.strokeStyle = col; c.lineWidth = 3;
        for (const g of groups) { for (let k = 0; k < Math.min(g, 4); k++) { c.beginPath(); c.moveTo(x + k * 9, y + 16); c.lineTo(x + k * 9, y + 34); c.stroke(); } if (g === 5) { c.beginPath(); c.moveTo(x - 4, y + 31); c.lineTo(x + 32, y + 19); c.stroke(); } x += 48; }
      }
    });
    c.font = "italic 20px 'Segoe Print','Comic Sans MS',cursive"; c.fillStyle = '#7a7a72'; c.textAlign = 'left';
    c.fillText(t(C.TX.boardFoot[0][0]), 24, H - 26);
  }
  function buildShipSoul() {
    const ship = game.ship;
    if (!ship?.group || S.ship) return;
    const grp = new THREE.Group(); grp.name = 'soul_ship';
    const mats = [], geos = [], texs = {};
    const M = (o) => { const m = new THREE.MeshLambertMaterial(o); mats.push(m); return m; };
    const G_ = (g) => { geos.push(g); return g; };
    const Wb = SOUL.whiteboard, Sh = SOUL.shelf, Po = SOUL.poster;
    // whiteboard
    const back = new THREE.Mesh(G_(new THREE.BoxGeometry(Wb.t, Wb.h, Wb.w)), M({ color: 0x9aa09a })); back.position.set(Wb.x, Wb.y, Wb.z); grp.add(back);
    texs.board = canvasTex(512, Math.round(512 * (Wb.h - 0.06) / (Wb.w - 0.06)), drawBoard);
    const face = new THREE.Mesh(G_(new THREE.PlaneGeometry(Wb.w - 0.06, Wb.h - 0.06)), M({ map: texs.board || null, color: texs.board ? 0xffffff : 0xdde0d8 }));
    face.position.set(Wb.x + Wb.t / 2 + 0.002, Wb.y, Wb.z); face.rotation.y = Wb.ry; grp.add(face);
    const tray = new THREE.Mesh(G_(new THREE.BoxGeometry(0.06, 0.025, 0.6)), M({ color: 0x7a7e78 })); tray.position.set(Wb.x + 0.03, Wb.y - Wb.h / 2 - 0.012, Wb.z); grp.add(tray);
    // shelf + mugs
    const shelf = new THREE.Mesh(G_(new THREE.BoxGeometry(Sh.d, Sh.t, Sh.w)), M({ color: 0x5a4a3a })); shelf.position.set(Sh.x, Sh.y, Sh.z); grp.add(shelf);
    const top = Sh.y + Sh.t / 2, mugCols = [0xd8d2c0, 0xc8a020, 0x3a78a8];
    const mugGeo = G_(new THREE.CylinderGeometry(0.038, 0.034, 0.09, 8)), handleGeo = G_(new THREE.BoxGeometry(0.02, 0.05, 0.012));
    for (const mg of SOUL.mugs) {
      const mm = new THREE.Mesh(mugGeo, M({ color: mugCols[mg.i % 3] })); mm.position.set(Sh.x, top + 0.045, mg.z); grp.add(mm);
      const hh = new THREE.Mesh(handleGeo, M({ color: mugCols[mg.i % 3] })); hh.position.set(Sh.x, top + 0.045, mg.z + 0.05); grp.add(hh);
    }
    // poster (cockpit face) + frame
    texs.poster = canvasTex(256, 352, (c, W, H) => {
      const v = C.pickIdx(C.TX.poster.length, hashString(String(game.run?.runId || game.profile?.name || 'tfg')));
      c.fillStyle = '#16264a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#d8b040'; c.lineWidth = 8; c.strokeRect(12, 12, W - 24, H - 24);
      c.fillStyle = '#d8b040'; c.beginPath(); c.arc(W / 2, 74, 34, 0, TAU); c.fill(); c.fillStyle = '#16264a'; c.beginPath(); c.arc(W / 2, 74, 24, 0, TAU); c.fill(); c.fillStyle = '#d8b040'; c.fillRect(W / 2 - 4, 58, 8, 32);
      fitText(c, t(C.TX.poster[v][0]), 24, 130, W - 48, 150, '#f2e8c8', "'Barlow Condensed','Arial Narrow',sans-serif", 44, 'center');
      c.font = "italic 20px 'Barlow Condensed',sans-serif"; c.fillStyle = '#b8a878'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t(C.TX.posterSub[0][0]), W / 2, H - 42);
    });
    const pFrame = new THREE.Mesh(G_(new THREE.BoxGeometry(Po.t, Po.h + 0.04, Po.w + 0.04)), M({ color: 0x2a2a30 })); pFrame.position.set(Po.x + 0.004, Po.y, Po.z); grp.add(pFrame);
    const pFace = new THREE.Mesh(G_(new THREE.PlaneGeometry(Po.w, Po.h)), M({ map: texs.poster || null, color: texs.poster ? 0xffffff : 0x22305a }));
    pFace.position.set(Po.x - Po.t / 2 - 0.002, Po.y, Po.z); pFace.rotation.y = Po.ry; grp.add(pFace);
    // sticky notes
    const noteCols = ['#f4e070', '#f0a0b0', '#a0e0f0', '#c0f0a0'];
    texs.notes = SOUL.notes.map((n) => canvasTex(128, 128, (c, W, H) => {
      c.fillStyle = noteCols[n.i % 4]; c.fillRect(0, 0, W, H);
      fitText(c, t(C.TX.notes[n.i % C.TX.notes.length][0]), 10, 8, W - 20, H - 16, '#2a2418', "'Segoe Print','Comic Sans MS',cursive", 20, 'left');
    }));
    SOUL.notes.forEach((n, i) => {
      const p = new THREE.Mesh(G_(new THREE.PlaneGeometry(SOUL.note, SOUL.note)), M({ map: texs.notes[i] || null, color: texs.notes[i] ? 0xffffff : 0xf4e070 }));
      p.position.set(n.x, n.y, n.z); p.rotation.y = n.ry + (i === 2 ? 0.05 : -0.04); p.rotation.z = i === 1 ? 0.06 : -0.05; grp.add(p);
    });
    // the quota plant: grows with quotas met (rebuilt when the size changes)
    S.ship = { grp, mats, geos, texs, plant: null, plantSize: -1, board: face.material };
    ship.group.add(grp);
    refreshShip();
  }
  function refreshShip() {
    const sh = S.ship;
    if (!sh) return;
    // whiteboard redraw
    const board = sh.texs.board;
    if (board?.image?.getContext) { try { const cv = board.image; drawBoard(cv.getContext('2d'), cv.width, cv.height); board.needsUpdate = true; } catch { /* no canvas */ } }
    const size = C.plantSize(game.run?.quotaIndex);
    if (size === sh.plantSize) return;
    sh.plantSize = size;
    if (sh.plant) { sh.plant.removeFromParent(); sh.plant.userData.geo?.dispose(); sh.plant.userData.mat?.dispose(); }
    const Sh = SOUL.shelf, top = Sh.y + Sh.t / 2, bag = new Bag();
    bag.cyl(Sh.x, top + 0.05, SOUL.plant.z, 0.055, 0.045, 0.1, 0xa04a2a, 7);
    bag.cyl(Sh.x, top + 0.1, SOUL.plant.z, 0.05, 0.05, 0.012, 0x3a2a1a, 7);
    const n = 1 + size, leaf = 0x3f9a3a, leaf2 = 0x5cbc4a;
    for (let k = 0; k < n; k++) {
      const a = k * 2.4, r = 0.015 + 0.012 * Math.min(k, 4), hgt = 0.06 + 0.035 * Math.min(k + 1, 5);
      bag.box(Sh.x + Math.cos(a) * r, top + 0.1 + hgt / 2, SOUL.plant.z + Math.sin(a) * r, 0.012, hgt, 0.012, 0x3a7a30);
      bag.box(Sh.x + Math.cos(a) * (r + 0.03), top + 0.1 + hgt, SOUL.plant.z + Math.sin(a) * (r + 0.03), 0.07, 0.014, 0.05, k & 1 ? leaf : leaf2, a, 0.3, 0);
    }
    if (size >= 6) bag.geo(new THREE.SphereGeometry(0.02, 5, 4), Sh.x, top + 0.42, SOUL.plant.z, 1, 1, 1, 0xf0d040);   // it flowers at 6 quotas
    const g = bag.build(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat); m.userData.geo = g; m.userData.mat = mat; m.name = 'soul_plant';
    sh.plant = m; sh.grp.add(m);
  }
  function disposeShip() {
    const sh = S.ship;
    if (!sh) return;
    sh.grp.removeFromParent();
    for (const g of sh.geos) g.dispose();
    for (const m of sh.mats) m.dispose();
    for (const x of [sh.texs.board, sh.texs.poster, ...(sh.texs.notes || [])]) x?.dispose?.();
    if (sh.plant) { sh.plant.userData.geo?.dispose(); sh.plant.userData.mat?.dispose(); }
    S.ship = null;
  }

  // ================================================================== 4. voice
  const busy = () => { try { return !!document.querySelector('.algo-sub.on'); } catch { return false; } };
  const chased = () => !!game.player?.dead || !!game.downed?.isDowned?.() || (game.chasefx?.tension?.() ?? 0) > 0.04;
  /** one line through the 45 s gate (never during a chase). returns true when it was shown */
  function say(text, force = false) {
    if (!text) return false;
    if (!force && !gate.ok(S.time, chased(), busy())) return false;
    if (force && chased()) return false;
    gate.mark(S.time); S.lines++;
    try { game.lore?.say?.(text); } catch { /* intercom optional */ }
    return true;
  }
  const pickLine = (key) => C.pickIdx(C.TX[key].length, (game.run?.seed | 0) + (game.run?.day | 0) * 7 + S.lines * 3);

  // ================================================================== 5. moments
  function showCard(moonId) {
    if (typeof document === 'undefined') return;
    if (game.onboard?.fr?.lease?.('card', 4.4, 2) === false) return;   // [firstrun] one card at a time
    S.card?.remove?.();
    const moon = MOONS[moonId], line = C.TX['land_' + moonId] ? tx('land_' + moonId) : tx('land_any');
    const el = document.createElement('div'); el.className = 'sl-card';
    el.innerHTML = `<div class="k"></div><div class="n"></div><div class="l"></div><div class="s"></div>`;
    el.querySelector('.k').textContent = `${t(C.TX.landCard[0][0])} · ${t('Day')} ${game.run?.day ?? 1}`;
    el.querySelector('.n').textContent = moon?.name || '';
    el.querySelector('.l').textContent = line;
    el.querySelector('.s').textContent = t(C.TX.skip[0][0]);
    (document.getElementById('ui') || document.body).appendChild(el);
    S.card = el;
    const kill = () => { el.classList.remove('on'); later(() => el.remove(), 700); off(); };
    const onKey = () => kill();
    const off = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onKey, true); };
    window.addEventListener('keydown', onKey, true); window.addEventListener('mousedown', onKey, true);
    requestAnimationFrame(() => el.classList.add('on'));
    later(kill, 4200);
    gate.mark(S.time);   // the card is this minute's line
  }
  function dust() {
    const p = game.particles, terr = game.world?.terrain;
    if (!p?.burst) return;
    const preset = { count: 26, color: [0x8a7a66, 0x6a5e50, 0xa89880], speed: 4.5, up: 0.9, life: 1.6, size: 0.42, gravity: -0.3, drag: 2.4 };
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6, x = Math.cos(a) * 6.5, z = Math.sin(a) * 5 + 0.5;
      const y = (terr?.heightAt?.(x, z) ?? 0) + 0.3;
      try { p.burst(new THREE.Vector3(x, y, z), preset, new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a)), 1); } catch { /* particles optional */ }
    }
  }
  function onSale(d) {
    if (!d || d.pending) return;
    const total = d.total | 0;
    const run = game.run || {};
    const need = Math.max(0, (run.quota || 0) - ((run.sold || 0) - total));
    const grade = C.saleGrade(total, need, run.quota);
    const stats = game.profile?.stats;
    let best = false;
    if (stats && total > (stats.bestHaul | 0)) { stats.bestHaul = total; best = total >= 20; try { game.progress?.save?.(); } catch { /* ignore */ } }
    refreshShip();
    if (typeof document === 'undefined') return;
    const box = document.querySelector('.summary.sale');
    const key = 'sale_' + grade, react = tx(key, C.pickIdx(C.TX[key].length, (run.seed | 0) + total));
    if (box) {
      box.querySelectorAll('.sale-row').forEach((row, i) => { try { row.animate([{ transform: 'translateX(-46px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, delay: 80 + i * 90, easing: 'ease-out', fill: 'backwards' }); } catch { /* no WAAPI */ } });
      const tot = box.querySelector('.sum-row.q span:last-child');
      if (tot) {
        const t0 = performance.now(), dur = 1200 + Math.min(1200, (d.list?.length || 0) * 90);
        let lastTick = 0;
        const step = (now) => {
          if (disposed || !box.isConnected) return;
          const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          tot.textContent = fmtMoney(total * e);
          if (now - lastTick > 70 && k < 1) { lastTick = now; snd('sl_tick', 0.35, 0.9 + 0.5 * k); }
          if (k < 1) requestAnimationFrame(step);
          else { tot.textContent = fmtMoney(total); tot.style.color = '#f2c230'; snd('sl_cha', 0.8); try { tot.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); } catch { /* no WAAPI */ } }
        };
        tot.textContent = fmtMoney(0);
        requestAnimationFrame(step);
      }
      const r = document.createElement('div'); r.className = 'sl-react';
      r.textContent = (best ? t(C.TX.pop_best[0][0]) + ' · ' : '') + react;
      box.appendChild(r);
    }
    if (grade !== 'ok') later(() => say(react), 2600);   // ok hauls only get the panel line
  }
  function onQuotaMet() {
    refreshShip();
    later(() => say(tx('quota_met')), 9000);
  }
  let popEl = null;
  function pickupPop(it) {
    if (typeof document === 'undefined' || S.time - S.popT < 0.25) return;
    const v = Math.round(it?.value || 0);
    if (v < 20) return;
    S.popT = S.time;
    if (!popEl) { popEl = document.createElement('div'); popEl.className = 'sl-pop'; (document.getElementById('ui') || document.body).appendChild(popEl); }
    popEl.textContent = '+' + fmtMoney(v);
    try { popEl.animate([{ opacity: 0, transform: 'translate(-50%,10px) scale(.8)' }, { opacity: 1, transform: 'translate(-50%,-6px) scale(1.15)', offset: 0.18 }, { opacity: 0, transform: 'translate(-50%,-38px) scale(1)' }], { duration: 950, easing: 'ease-out' }); } catch { /* no WAAPI */ }
    snd('sl_pop', 0.5, 0.85 + Math.min(0.5, v / 400));
  }
  wrap(game.ui, 'showSale', (orig) => function (d, g) { const r = orig.call(this, d, g); try { onSale(d); } catch (e) { console.warn('[soul] sale', e); } return r; });
  wrap(game.ui, 'showQuotaMet', (orig) => function (d, g) { const r = orig.call(this, d, g); try { onQuotaMet(d); } catch (e) { console.warn('[soul] quota', e); } return r; });
  if (typeof game.pickup === 'function') {
    wrap(game, 'pickup', (orig) => function (it, ...rest) {
      const r = orig.call(this, it, ...rest);
      try { if (it?.holder === game.selfId) pickupPop(it); } catch { /* cosmetic */ }
      return r;
    });
  }

  // ================================================================== 6. hooks
  offs.push(mods.on('mapLoaded', (world, g) => { if (g === game) onMapLoaded(world); }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    const prev = S.prevPhase; S.prevPhase = ph;
    if (ph === 'orbit') { setSat(1); S.paT = 28; refreshShip(); }
    else if (ph === 'landing') { S.moonT = 0; S.walkT = C.VOICE.firstAfter; S.visited.clear(); refreshShip(); }
    else if (ph === 'moon' || ph === 'company') {
      S.moonT = 0; S.walkT = C.VOICE.firstAfter; S.paT = ph === 'company' ? 25 : 0;
      if (prev === 'landing') { showCard(game.run?.moon); dust(); }
    } else if (ph === 'takeoff') S.paT = 0;
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    S.time += dt;
    if (S.pending && game.world?.outdoor === S.pending.outdoor) { const w = S.pending; S.pending = null; try { buildFor(w); } catch (e) { console.warn('[soul] beats', e); } }
    if (!S.ship && game.ship?.group) { try { buildShipSoul(); } catch (e) { console.warn('[soul] ship', e); } }
    const p = game.player, ph = game.run?.phase;
    if (!p) return;
    // low-HP audio muffle (the heartbeat + red vignette are feel.js; the downed lowpass is downed.js): a soft high-shelf cut on the master tone stage
    const a = game.audio;
    if (a?.tone && a.ctx) {
      const lvl = p.dead ? 0 : lowHpLevel(p.hp, p.maxHp);
      S.muff += (lvl - S.muff) * Math.min(1, dt * 2);
      if (Math.abs(S.muff - S.muffSet) > 0.04 || (lvl === 0 && S.muffSet > 0 && S.muff < 0.02)) {
        S.muffSet = lvl === 0 && S.muff < 0.02 ? 0 : S.muff;
        try { const now = a.ctx.currentTime; a.tone.frequency.setTargetAtTime(6500 - 4600 * S.muffSet, now, 0.12); a.tone.gain.setTargetAtTime(-3 - 13 * S.muffSet, now, 0.12); } catch { /* audio not ready */ }
      }
    }
    if (ph === 'moon' && !p.inShip && !p.indoor && !p.dead) {
      S.moonT += dt;
      // next to a story beat: one line about it
      if (S.map) {
        for (const s of S.map.specs) {
          if (S.visited.has(s.id)) continue;
          if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + C.VOICE.beatNear) {
            const key = 'b_' + s.kind;
            if (C.TX[key] && say(tx(key))) S.visited.add(s.id);
            break;
          }
        }
      }
      S.walkT -= dt;
      if (S.walkT <= 0) { if (say(tx('walk', pickLine('walk')))) S.walkT = C.VOICE.walkEvery + (S.lines % 3) * 12; else S.walkT = 6; }
    } else if ((ph === 'orbit' || ph === 'company') && S.paT > 0 && p.pos) {
      S.paT -= dt;
      if (S.paT <= 0) { if (say(tx('pa', C.pickIdx(C.TX.pa.length, (game.run?.seed | 0) + S.paN)))) { S.paN++; S.paT = ph === 'orbit' ? 150 : 0; } else S.paT = 8; }
    }
  }));
  offs.push(onLangChange(() => { const sh = S.ship; if (sh) { disposeShip(); } }));
  offs.push(mods.on('daySummary', () => refreshShip()));

  return {
    plan: () => S.map?.specs || [],
    beats: () => S.map,
    palette: (id) => palOf(id),
    say, showCard, refreshShip, dust,
    get sat() { return curSat; },
    dispose() {
      disposed = true;
      clearBeats();
      disposeShip();
      for (const id of timers) clearTimeout(id);
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.splice(0).reverse()) { try { r(); } catch { /* ignore */ } }
      for (const [o, k, v] of backup.splice(0).reverse()) { if (v === undefined) delete o[k]; else o[k] = v; }
      setSat(1);
      S.card?.remove?.(); popEl?.remove?.(); style?.remove?.();
      try { const a = game.audio; if (a?.tone && a.ctx) { a.tone.frequency.setTargetAtTime(6500, a.ctx.currentTime, 0.1); a.tone.gain.setTargetAtTime(-3, a.ctx.currentTime, 0.1); } } catch { /* ignore */ }
    },
  };
}
