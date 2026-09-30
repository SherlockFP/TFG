// BOSS DRESS module (wave 8 night, docs/wave8/bossdress.md): the themed sector bosses (metro Last Conductor, greenhouse Pruner, prison Warden, ...) get
//   * game.bossDress.infoOf(type) -> { name, title, intro, accent } for the boss UI (name card + intro line + bar) when the boss really is the theme's boss;
//   * light lair dressing on EVERY peer: a few themed props in the arena corners + a floor ring, all in ONE emissive accent colour (unlit MeshBasicMaterial, no THREE lights);
//   * a glow tint on the boss view (model.setTint = emissive + eyes; the two custom kit bosses get a small colour lerp on their own materials).
// No new boss models, no new AI, no net messages (everything is derived from the deterministic layout + run.cycle.live). Never touches hp / dmg.
import * as THREE from 'three';
import { t, addTranslations } from '../core/i18n.js';
import { BOSS_TABLE } from './cycle_core.js';
import { planContent, roomCenter } from './cycle_plan.js';
import { DRESS, dressOf } from './bossdress_core.js';
import { TR, RU } from './bossdress_text.js';
import { disposeGroup } from './cycle3_fx.js';

addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

const HP = Math.PI / 2;
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const glow = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, fog: true, ...o });
function put(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; }
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cy = (r, h, s = 8) => new THREE.CylinderGeometry(r, r, h, s);

/** prop recipes: local coordinates, +Z faces the room centre, footprint about 2 x 2 m. `a` = the accent (unlit) material. */
const RECIPES = {
  platform(g, a) {                                    // metro: platform edge line, dead departure board, bench, luggage
    const dk = lam(0x2a2c32), wd = lam(0x5a3e24);
    put(g, bx(2.4, 0.03, 0.14), a, 0, 0.02, 0.6);
    put(g, cy(0.05, 2.4), dk, -0.8, 1.2, -0.6); put(g, cy(0.05, 2.4), dk, 0.8, 1.2, -0.6);
    put(g, bx(1.9, 0.55, 0.1), dk, 0, 2.3, -0.6); put(g, bx(1.6, 0.09, 0.11), a, 0, 2.4, -0.58); put(g, bx(1.1, 0.06, 0.11), a, -0.2, 2.2, -0.58);
    put(g, bx(1.4, 0.08, 0.45), wd, 0, 0.45, 0.1); put(g, bx(1.4, 0.4, 0.06), wd, 0, 0.7, -0.1); put(g, bx(0.08, 0.45, 0.4), dk, -0.6, 0.22, 0.1); put(g, bx(0.08, 0.45, 0.4), dk, 0.6, 0.22, 0.1);
    put(g, bx(0.6, 0.4, 0.3), lam(0x6a4a2a), 1.1, 0.2, 0.7, 0, 0.3, 0); put(g, bx(0.45, 0.3, 0.25), lam(0x3a4a6a), 1.15, 0.55, 0.7, 0, 0.1, 0);
  },
  lounge(g, a) {                                      // influencer: sponsored sofa, neon sign, ring light
    const sf = lam(0x7a2a5a);
    put(g, bx(1.8, 0.4, 0.8), sf, 0, 0.3, 0); put(g, bx(1.8, 0.55, 0.2), sf, 0, 0.75, -0.35);
    put(g, bx(0.2, 0.55, 0.8), sf, -0.9, 0.5, 0); put(g, bx(0.2, 0.55, 0.8), sf, 0.9, 0.5, 0);
    put(g, new THREE.TorusGeometry(0.42, 0.035, 5, 18), a, 0, 1.9, -0.6); put(g, bx(0.6, 0.05, 0.05), a, 0, 1.9, -0.6);
    put(g, cy(0.03, 1.6), lam(0x222226), 1.3, 0.8, 0.5); put(g, new THREE.TorusGeometry(0.3, 0.04, 5, 16), a, 1.3, 1.75, 0.5);
  },
  gallery(g, a) {                                     // museum: pedestals with a glowing exhibit, velvet rope
    const st = lam(0xcfc8b4), dk = lam(0x2a2a2e);
    put(g, bx(0.75, 1.0, 0.75), st, -0.5, 0.5, 0); put(g, new THREE.OctahedronGeometry(0.28), a, -0.5, 1.4, 0, 0, 0.5, 0);
    put(g, bx(0.7, 0.75, 0.7), st, 0.8, 0.38, -0.3); put(g, new THREE.SphereGeometry(0.2, 8, 6), a, 0.8, 0.95, -0.3);
    for (const x of [-1, 0.2]) { put(g, cy(0.04, 1.0), dk, x, 0.5, 0.9); put(g, new THREE.SphereGeometry(0.07, 6, 5), a, x, 1.03, 0.9); }
    put(g, bx(1.2, 0.03, 0.03), a, -0.4, 0.85, 0.9);
  },
  potting(g, a) {                                     // greenhouse: potting table, planters, hovering spores
    const wd = lam(0x6a4a2a), tc = lam(0xa8582c), lf = lam(0x2f7a34);
    put(g, bx(1.7, 0.08, 0.8), wd, 0, 0.9, 0); for (const [x, z] of [[-0.75, -0.3], [0.75, -0.3], [-0.75, 0.3], [0.75, 0.3]]) put(g, bx(0.08, 0.9, 0.08), wd, x, 0.45, z);
    put(g, cy(0.2, 0.3), tc, -0.4, 1.09, 0); put(g, new THREE.IcosahedronGeometry(0.25, 0), lf, -0.4, 1.4, 0);
    put(g, bx(0.5, 0.05, 0.3), lam(0x9aa0a8), 0.4, 0.97, 0.05, 0, 0.2, 0);
    for (const [x, z] of [[1.2, 0.7], [-1.2, 0.6]]) { put(g, cy(0.3, 0.5, 9), tc, x, 0.25, z); put(g, new THREE.IcosahedronGeometry(0.4, 0), lf, x, 0.8, z); }
    for (let i = 0; i < 5; i++) put(g, new THREE.OctahedronGeometry(0.05), a, -0.5 + i * 0.28, 1.9 + (i % 2) * 0.25, -0.2 + (i % 3) * 0.2);
  },
  cells(g, a) {                                       // prison: a bar wall, a bunk, an alarm lamp
    const iron = lam(0x3a3c42);
    for (let i = 0; i < 7; i++) put(g, cy(0.03, 2.6, 5), iron, -1 + i * 0.33, 1.3, 0.5);
    put(g, bx(2.1, 0.07, 0.07), iron, 0, 2.6, 0.5); put(g, bx(2.1, 0.07, 0.07), iron, 0, 0.1, 0.5); put(g, bx(2.1, 0.07, 0.07), iron, 0, 1.3, 0.5);
    put(g, bx(1.7, 0.1, 0.7), lam(0x6a6c72), 0, 0.55, -0.5); put(g, bx(1.7, 0.16, 0.6), lam(0x5a5a4a), 0, 0.68, -0.5);
    put(g, bx(0.25, 0.14, 0.14), a, 0.95, 2.75, 0.5); put(g, bx(0.7, 0.03, 0.05), a, 0, 0.03, 0.9);
  },
  boardroom(g, a) {                                   // tower: a slab of a conference table, chairs, a whiteboard with accent bars
    const dk = lam(0x1a1c22);
    put(g, bx(2.4, 0.09, 1.0), lam(0x3a2a1c), 0, 0.78, 0); put(g, bx(0.15, 0.78, 0.6), dk, 0, 0.39, 0);
    for (const x of [-0.8, 0, 0.8]) { put(g, bx(0.5, 0.08, 0.5), dk, x, 0.48, 0.85); put(g, bx(0.5, 0.55, 0.07), dk, x, 0.8, 1.1); }
    put(g, bx(1.9, 1.1, 0.06), lam(0xe8e8ee), 0, 1.7, -0.7);
    put(g, bx(1.4, 0.07, 0.07), a, -0.15, 1.95, -0.66); put(g, bx(1.0, 0.07, 0.07), a, -0.35, 1.72, -0.66); put(g, bx(1.6, 0.07, 0.07), a, 0, 1.49, -0.66);
  },
  classroom(g, a) {                                   // academy: two school desks, a chalkboard with an accent rule
    const wd = lam(0x8a6a3a), dk = lam(0x22302a);
    for (const x of [-0.7, 0.7]) { put(g, bx(0.75, 0.05, 0.55), wd, x, 0.72, 0.3); put(g, bx(0.06, 0.72, 0.06), dk, x - 0.3, 0.36, 0.1); put(g, bx(0.06, 0.72, 0.06), dk, x + 0.3, 0.36, 0.1); put(g, bx(0.06, 0.72, 0.06), dk, x - 0.3, 0.36, 0.5); put(g, bx(0.06, 0.72, 0.06), dk, x + 0.3, 0.36, 0.5); }
    put(g, bx(2.2, 1.1, 0.06), dk, 0, 1.6, -0.7); put(g, bx(2.3, 0.05, 0.08), wd, 0, 1.03, -0.68);
    put(g, bx(1.5, 0.06, 0.07), a, -0.2, 1.85, -0.66); put(g, bx(1.1, 0.06, 0.07), a, -0.4, 1.6, -0.66);
  },
  coldrack(g, a) {                                    // colddata: frosted server rack with LED strips, a coolant pipe
    put(g, bx(0.9, 2.3, 0.7), lam(0x24303a), 0, 1.15, -0.2);
    for (let i = 0; i < 6; i++) put(g, bx(0.7, 0.05, 0.03), a, 0, 0.5 + i * 0.32, 0.17);
    put(g, bx(0.94, 0.16, 0.74), lam(0xcfe8f2), 0, 2.3, -0.2);
    put(g, cy(0.07, 2.4), lam(0x5a7a8a), 0.85, 1.2, 0.1); put(g, cy(0.09, 0.15), a, 0.85, 0.6, 0.1);
    put(g, bx(0.7, 0.5, 0.5), lam(0x9ac0d0), -1.0, 0.25, 0.5, 0, 0.3, 0);
  },
};

export function installBossdress(game) {
  const offs = [];
  let group = null, sig = '', disposed = false;
  const facLayout = () => game.world?.facility?.layout || null;
  /** the dress of the boss of the current dungeon (null outside a core / gate dungeon, for the Legacy Bot and for unthemed bosses) */
  function current() {
    const run = game.run, L = facLayout(), lv = run?.cycle?.live;
    if (!L || !lv || run.phase !== 'moon' || (lv.k !== 'core' && lv.k !== 'gate') || !lv.boss) return null;
    return dressOf(L.theme, lv.boss, BOSS_TABLE);
  }
  function build(d, L) {
    const g = new THREE.Group();
    const acc = glow(d.accent), plan = planContent(L, { kind: 'core', keys: 0 }), r = L.rooms[plan.bossRoom];
    if (!r) return null;
    const c = roomCenter(L, r), hw = r.w * L.cell / 2 - 1.6, hh = r.h * L.cell / 2 - 1.6;
    const cx = L.ox + (r.x + r.w / 2) * L.cell, cz = L.oz + (r.z + r.h / 2) * L.cell;
    g.userData.spot = [cx, cz];
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.min(4.5, Math.max(1.8, Math.min(hw, hh) * 0.55)), Math.min(4.5, Math.max(1.8, Math.min(hw, hh) * 0.55)) + 0.14, 40), glow(d.accent, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -HP; ring.position.set(c.x, L.y + 0.05, c.z); g.add(ring);
    if (hw > 1 && hh > 1) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = new THREE.Group(); RECIPES[d.props]?.(p, acc);
        p.position.set(cx + sx * hw, L.y, cz + sz * hh);
        p.rotation.y = Math.atan2(-sx * hw, -sz * hh);     // +Z faces the centre
        g.add(p);
      }
    }
    return g;
  }
  function dispose_() { if (group) { disposeGroup(group); group = null; } sig = ''; }
  function tint(d) {
    const lv = game.run?.cycle?.live, views = game.creatures?.views;
    if (!views || !lv) return;
    for (const v of views.values()) {
      if (v.$dress || v.type !== lv.boss || !v.def?.cyBoss) continue;
      v.$dress = true;
      try {
        v.model?.setTint?.(d.accent, false);
        if (v.type === 'middlemanager' || v.type === 'loadbalancer') {   // kit models own their materials (setTint is a no-op there): nudge the colour
          const col = new THREE.Color(d.tint);
          for (const m of v.materials || []) if (m?.isMeshLambertMaterial && m.color) m.color.lerp(col, 0.3);
        }
      } catch { /* cosmetic */ }
    }
  }
  offs.push(game.mods.on('update', () => {
    if (disposed) return;
    const d = current(), L = facLayout();
    if (!d || !L || !game.scene || typeof document === 'undefined') { if (group) dispose_(); return; }
    const s = `${L.seed}|${L.theme}|${d.id}`;
    if (!group || sig !== s) {
      dispose_();
      try { group = build(d, L); if (group) { game.scene.add(group); sig = s; } } catch (e) { console.warn('[bossdress]', e); sig = s; }
    }
    tint(d);
  }));
  const api = {
    /** themed { name, title, intro, accent } (already translated) when `type` is the boss of the current theme, else null */
    infoOf(type) {
      const L = facLayout(), d = L ? dressOf(L.theme, type, BOSS_TABLE) : null;
      return d ? { name: t(d.name), title: t(d.title), intro: t(d.intro), accent: d.accent } : null;
    },
    nameOf(type) { return api.infoOf(type)?.name || null; },
    get group() { return group; },
    dispose() { disposed = true; dispose_(); for (const o of offs) o?.(); },
  };
  game.bossDress = api;
  return api;
}
export { DRESS, RECIPES };
