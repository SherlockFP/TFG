// VOYAGE world hook (wave 4): called by world/terrain.js buildMoonOutdoor for every outdoor map. Builds the set piece ("content") of a voyage moon and the
// structures of the active mission on the flat zones that planMoon reserved (plan.flats, see voyageFlats in game/voyage_core.js), plus the survey anomalies.
// Returns null when the moon has neither content nor a mission here. Spots (loot / guards / interaction points / npc positions) are in WORLD coordinates
// and identical on every peer: the host runtime in game/voyage.js reads them to spawn loot and creatures; clients read them for prompts and markers.
import * as THREE from 'three';
import { RNG, hashString } from '../core/rng.js';
import { Kit } from './voyage_kit.js';
import { buildContent, buildMissionSite, buildAnomaly } from './voyage_sites.js';
import { activeMissionFor } from '../game/voyage_core.js';
import './voyage_decor.js';   // registers the 8 biome decor builders (side effect)

export function buildVoyageWorld(ctx) {
  const { seed, moon, plan, terrain, group, addBox, emitters, colliders, reserved } = ctx;
  const mission = activeMissionFor(moon?.id);
  const flats = plan.flats || [];
  if (!moon?.content && !mission) return null;
  const objs = [], geos = [], mats = [];
  const env = {
    add: (o) => { group.add(o); objs.push(o); return o; },
    own: (g) => { geos.push(g); return g; },
    mat: (m) => { mats.push(m); return m; },
    addBox, emitters,
  };
  const out = { content: null, sites: [], anoms: [], flats, mission, colliders };
  const dyns = [];
  const info = { tier: moon.tier || 1, moon, seed };
  for (const f of flats) {
    const y0 = terrain.heightAt(f.x, f.z);
    const K = new Kit(env, f.x, y0, f.z, f.yaw);
    const R = new RNG((seed ^ hashString('vysite:' + f.key + moon.id)) >>> 0);
    let built = null;
    if (f.key === 'content') built = buildContent(moon.content, K, R, info);
    else if (mission) built = buildMissionSite(mission.type, +f.key.slice(1), K, R, info);
    if (!built) continue;
    built.flat = f; built.key = f.key; built.y0 = y0;
    if (f.key === 'content') out.content = built; else out.sites.push(built);
    if (built.dyn) dyns.push(built.dyn);
    reserved?.push({ x: f.x, z: f.z, radius: f.r + 2 });
  }
  // survey anomalies: scattered readings, own RNG stream
  if (mission?.type === 'survey') {
    const R = new RNG((seed ^ hashString('vysurvey:' + mission.id)) >>> 0);
    const sc = plan.scale || 1;
    for (let t = 0; t < 400 && out.anoms.length < mission.n; t++) {
      const x = R.float(-105, 105) * sc, z = R.float(-105, 105) * sc;
      if (Math.hypot(x, z) < 34 || Math.hypot(x - plan.entrance.x, z - plan.entrance.z) < 22) continue;
      if (ctx.avoid(x, z, 3) || out.anoms.some((a) => Math.hypot(a.x - x, a.z - z) < 26)) continue;
      const a = buildAnomaly(env, x, terrain.heightAt(x, z), z, out.anoms.length);
      out.anoms.push({ ...a, x, y: terrain.heightAt(x, z) + 1.2, z, i: out.anoms.length });
    }
  }
  let t = 0;
  out.update = (dt) => {
    t += dt;
    for (const d of dyns) for (const p of d.pulses || []) p.mat.color.copy(p.base).multiplyScalar(0.62 + 0.38 * Math.sin(t * p.speed + p.phase));
    for (const a of out.anoms) { if (a.done) continue; a.core.rotation.y += dt * 1.4; a.mat.color.setHex(0x30e8ff).multiplyScalar(0.7 + 0.3 * Math.sin(t * 3 + a.i)); }
  };
  out.markAnomaly = (i) => { const a = out.anoms[i]; if (a) { a.done = true; a.mat.color.setHex(0x40474e); a.core.rotation.y = 0; } };
  out.setPanel = (site, i, on) => { const m = site?.dyn?.panels?.[i]; if (m) m.material.color.setHex(on ? 0x40ff70 : 0xff3a24); };
  out.openVault = (site, physics) => {
    const d = site?.dyn;
    if (!d) return;
    if (d.door) d.door.visible = false;
    if (d.doorCollider) { try { physics?.removeCollider(d.doorCollider); } catch { /* already gone */ } const i = colliders.indexOf(d.doorCollider); if (i >= 0) colliders.splice(i, 1); d.doorCollider = null; }
  };
  out.dispose = () => {
    for (const o of objs) o.removeFromParent();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    objs.length = 0; geos.length = 0; mats.length = 0;
  };
  void THREE;
  return out;
}
