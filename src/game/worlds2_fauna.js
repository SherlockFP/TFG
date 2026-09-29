// WAVE 3 worlds2 - visible PLANET FAUNA. Every outdoor moon gets ambient herds (grazers) and flyers, planned deterministically from the run
// seed + moon (world/worlds2_core.js planFauna) and drawn client-side with a handful of InstancedMeshes (2 draw calls for the herds' bodies + legs,
// 3 for the flyers). They are cosmetic: no colliders, no net traffic (each peer animates the same seeded paths on its own clock).
//   * herds start 38-95 m from the ship, so they are visible from the landing spot and the ship windows; flyers circle 20-42 m up around it
//   * the herds wander off at dusk (real, hostile Dusk Prowlers replace them - worlds2.js night director)
//   * the ship's radar monitor shows the herds as amber dots (screens.js drawRadar is wrapped on the instance)
// The hostile side (Tusked Beasts, Dusk Prowlers) is real CreatureManager content, see worlds2_creatures.js.
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { planFauna, herdPos, flyerPos, faunaFamily } from './worlds2_core.js';
import { createGrazerGeometries, createFlyerGeometries } from '../models/worlds2_models.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);
const qYaw = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), qFlip = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);

export function installFauna(game) {
  const g = game;
  let S = null;   // current map: { plan, group, meshes, geos, mats, legs }
  const api = { plan: () => S?.plan || null, herds: () => S?.plan?.herds || [], stats: () => (S ? { herds: S.plan.herds.length, grazers: S.nG, flyers: S.plan.flyers.length, drawCalls: S.meshes.length, family: S.plan.family } : null), dispose: () => clear() };

  function clear() {
    if (!S) return;
    for (const m of S.meshes) m.removeFromParent();
    for (const x of S.geos) x.dispose();
    for (const x of S.mats) x.dispose();
    S.group.removeFromParent();
    S = null;
  }

  function build(world) {
    clear();
    const run = g.run, moon = MOONS[run?.moon];
    const terrain = world?.terrain, outdoor = world?.outdoor;
    if (!moon || moon.company || moon.home || !terrain || !outdoor) return;
    const biomeId = moon.biome;
    const plan = planFauna(run.seed | 0, moon.id, biomeId, { half: terrain.playHalf || 130, scale: terrain.scale || 1, avoid: (x, z, m) => outdoor.avoid?.(x, z, m) || false });
    if (!plan.herds.length && !plan.flyers.length) return;
    const group = new THREE.Group();
    group.name = 'worlds2-fauna';
    (world.mapGroup || outdoor.group || g.scene).add(group);   // child of the map group: it descends with the terrain during the landing, so herds are seen from the ship
    const geos = [], mats = [], meshes = [];
    const nG = plan.herds.reduce((a, h) => a + h.members.length, 0);
    const G = createGrazerGeometries(), F = createFlyerGeometries();
    geos.push(G.body, G.leg, F.body, F.wing);
    const mk = (geo, n, glow = false) => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: glow ? 0x223322 : 0x000000 });
      mats.push(m);
      const im = new THREE.InstancedMesh(geo, m, Math.max(1, n));
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = n;
      group.add(im); meshes.push(im);
      return im;
    };
    const glitchy = plan.family === 'glitch' || plan.family === 'crystal';
    const bodies = mk(G.body, nG, glitchy), legs = mk(G.leg, nG * 4);
    const fBody = mk(F.body, plan.flyers.length, glitchy), wingL = mk(F.wing, plan.flyers.length, glitchy), wingR = mk(F.wing, plan.flyers.length, glitchy);
    let i = 0;
    for (const h of plan.herds) for (const m of h.members) { bodies.setColorAt(i, tmpC.setHex(m.col)); for (let k = 0; k < 4; k++) legs.setColorAt(i * 4 + k, tmpC.setHex(0xffffff)); i++; }
    plan.flyers.forEach((f, k) => { for (const im of [fBody, wingL, wingR]) im.setColorAt(k, tmpC.setHex(f.col)); });
    for (const im of [bodies, legs, fBody, wingL, wingR]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    S = { plan, group, meshes, geos, mats, bodies, legs, fBody, wingL, wingR, nG, radarT: 0, outdoor };
  }

  function update(dt) {
    wrapRadar();
    if (!S) return;
    if (g.world?.outdoor !== S.outdoor) { clear(); return; }   // the map was unloaded / replaced
    const p = g.player, env = g.env;
    const outside = !p.indoor && !p.inShip || (p.inShip && g.run?.phase === 'moon');
    S.group.visible = !!outside && env?.mode !== 'space';
    if (!S.group.visible) return;
    const t = g.time || 0, terrain = g.world?.terrain;
    if (!terrain) return;
    // dusk: the herds wander off (scale down to nothing between 18:00 and 19:00)
    const clock = g.run?.time ?? 600;
    const hide = clock > 18 * 60 ? Math.min(1, (clock - 18 * 60) / 60) : 0;
    const showG = 1 - hide;
    let i = 0;
    const cam = g.camera.position;
    for (const h of S.plan.herds) {
      for (const m of h.members) {
        const pos = herdPos(h, m, t);
        const y = terrain.heightAt(pos.x, pos.z);
        const far = (pos.x - cam.x) ** 2 + (pos.z - cam.z) ** 2 > 230 * 230;
        const sc = (far ? 0 : showG) * h.size * m.sz;
        tmpQ.setFromAxisAngle(UP, pos.yaw);
        tmpM.compose(tmpP.set(pos.x, y, pos.z), tmpQ, tmpS.set(sc, sc, sc));
        S.bodies.setMatrixAt(i, tmpM);
        // legs: 4 boxes swung by the gait (opposite pairs)
        const ph = t * 5 * m.sp + m.ph;
        for (let k = 0; k < 4; k++) {
          const lx = k % 2 ? 0.2 : -0.2, lz = k < 2 ? 0.42 : -0.42, sw = Math.sin(ph + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.55 * (pos.moving ? 1 : 0);
          tmpE.set(sw, pos.yaw, 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
          const cs = Math.cos(pos.yaw), sn = Math.sin(pos.yaw);
          tmpM.compose(tmpP.set(pos.x + (lx * cs + lz * sn) * sc, y + 0.56 * sc, pos.z + (-lx * sn + lz * cs) * sc), tmpQ, tmpS.set(sc, sc, sc));
          S.legs.setMatrixAt(i * 4 + k, tmpM);
        }
        i++;
      }
    }
    S.bodies.instanceMatrix.needsUpdate = true; S.legs.instanceMatrix.needsUpdate = true;
    S.plan.flyers.forEach((f, k) => {
      const pos = flyerPos(f, t), gy = terrain.heightAt(pos.x, pos.z);
      const y = Math.max(gy + 9, pos.y);
      tmpE.set(0, pos.yaw, pos.bank, 'YXZ'); tmpQ.setFromEuler(tmpE);
      tmpP.set(pos.x, y, pos.z); tmpS.set(f.sz, f.sz, f.sz);
      tmpM.compose(tmpP, tmpQ, tmpS); S.fBody.setMatrixAt(k, tmpM);
      const flap = Math.sin(t * f.fl + f.ph) * 0.7;
      qYaw.setFromAxisAngle(UP, pos.yaw);
      for (const [im, right] of [[S.wingR, true], [S.wingL, false]]) {
        qRoll.setFromAxisAngle(FWD, pos.bank + (right ? flap : -flap));
        tmpQ.copy(qYaw).multiply(qRoll);
        if (!right) tmpQ.multiply(qFlip);                 // left wing = the same geometry turned 180 degrees (no negative scale: winding stays right)
        tmpM.compose(tmpP, tmpQ, tmpS);
        im.setMatrixAt(k, tmpM);
      }
    });
    S.fBody.instanceMatrix.needsUpdate = true; S.wingL.instanceMatrix.needsUpdate = true; S.wingR.instanceMatrix.needsUpdate = true;
  }

  // ---- ship radar: herds as amber dots (wraps the instance method lazily - the screens exist after the game - restored in dispose)
  let origRadar = null, wrapped = null;
  function wrapRadar() {
    const scr = g.screens;
    if (wrapped || !scr || typeof scr.drawRadar !== 'function') return;
    origRadar = scr.drawRadar;
    wrapped = scr.drawRadar = function () {
      const r = origRadar.apply(this, arguments);
      try {
        const s = this.radar;
        if (!s || !S || !g.world?.outdoor || g.player.indoor) return r;
        const tid = g.terminal?.radarTarget || g.selfId;
        const tpos = tid === g.selfId ? g.player.pos : g.remotes.get(tid)?.pos || g.player.pos;
        const { ctx, c } = s, W = c.width, H = c.height, scale = 2.2, t = g.time || 0;
        ctx.fillStyle = '#e8b040';
        for (const h of S.plan.herds) {
          const pos = herdPos(h, h.members[0], t);
          const sx = W / 2 + (pos.x - tpos.x) * scale, sy = H / 2 + (pos.z - tpos.z) * scale;
          if (sx < -6 || sy < -6 || sx > W + 6 || sy > H + 6) continue;
          for (let k = 0; k < Math.min(4, h.members.length); k++) ctx.fillRect(sx + (k % 2) * 3 - 2, sy + Math.floor(k / 2) * 3 - 2, 2, 2);
        }
        s.t.needsUpdate = true;
      } catch { /* radar decoration is optional */ }
      return r;
    };
  }
  api.build = build; api.update = update;
  api.dispose = () => {
    clear();
    const scr = g.screens;
    if (scr && wrapped && scr.drawRadar === wrapped && Object.prototype.hasOwnProperty.call(scr, 'drawRadar')) delete scr.drawRadar;
  };
  void faunaFamily;
  return api;
}
