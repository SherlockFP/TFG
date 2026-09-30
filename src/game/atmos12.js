// ATMOS12 (wave 12, docs/wave12/atmos12.md): INTERIOR ATMOSPHERE PASS for every interior theme. Local presentation only (no net messages, no host state): the plan comes
// from the facility layout + its lamp emitters, so every peer that has the same facility sees the same decals / vents / leaks. NEVER adds a THREE light.
//   decals    puddles (with a wet glint toward the nearest lamp), stains, cable runs, paper, leaves, scorch, moss, frost, confetti, rubble, glass, drain grates, ceiling vents
//   shafts    additive light shafts + floor pools under ceiling lamps (flicker with the lamp, die with the power), window beams, breathing vent plumes
//   dust      one pooled Points: motes that live ONLY inside the cones of the 4 lamps nearest the camera (lamp coloured), plus drips (bead -> fall -> ripple + plink),
//             sparks under broken lamps (a scorch mark below) and vent puffs (a soft exhale every 5-8 s)
//   grade     a per-theme post multiplier (engine uniform uTint) eased in / out when you enter / leave a facility
// Cost: 3 draw calls per facility (decals, light, points), no per-frame allocation, vertex colours rewritten only for groups whose factor changed.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { QUALITY } from '../render/quality.js';
import { synth, ex } from './combat_kit.js';
import { planAtmos, lampFactor, BURST_AT } from './atmos12_core.js';
import { buildAtmos, makePoints, warmObjects } from './atmos12_art.js';

const TAU = Math.PI * 2, DN = 200, TN = 72, NA = 4;
const SOUNDS = {
  a12_drip: (sr) => synth(sr, 0.22, (tt) => Math.sin(TAU * (700 * tt + 900 * (1 - Math.exp(-tt * 30)) / 30)) * ex(tt, 26) * 0.6 + (tt < 0.003 ? (Math.random() - 0.5) * 0.5 : 0)),
  a12_spark: (sr) => { let p = 0; return synth(sr, 0.4, (tt) => { const w = Math.random() * 2 - 1, v = w - p * 0.85; p = w; let c = 0; for (const t0 of [0, 0.07, 0.13, 0.22]) if (tt >= t0) c += ex(tt - t0, 90) * (t0 ? 0.6 : 1); return v * c * 0.55; }); },
  a12_vent: (sr) => { let y = 0, z = 0; return synth(sr, 1.5, (tt) => { y += 0.07 * (Math.random() * 2 - 1 - y); z += 0.2 * (y - z); const e = Math.sin(Math.PI * Math.min(1, tt / 1.5)); return z * e * e * 1.6; }); },
};

export function installAtmos12(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  if (mods.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mods.soundGens.has(n)) mods.soundGens.set(n, fn);
  let disposed = false, clock = 0, anchorT = 0, buildMs = 0;
  const S = { fac: null, wait: -1, plan: null, art: null, P: null, root: null, on: { decals: true, shafts: true, dust: true, fx: true, tint: true }, tint: [1, 1, 1], force: null };
  // dust
  const dpx = new Float32Array(DN), dpy = new Float32Array(DN), dpz = new Float32Array(DN), dvx = new Float32Array(DN), dvy = new Float32Array(DN), dvz = new Float32Array(DN);
  const dage = new Float32Array(DN), dlife = new Float32Array(DN), dbri = new Float32Array(DN), dlamp = new Int16Array(DN).fill(-1);
  let anchors = new Int16Array(NA).fill(-1), nAnch = 0, lampRGB = null, dustActive = 0;
  // transients: 1 drop, 2 ripple, 3 spark, 4 puff
  const tk = new Uint8Array(TN), tx = new Float32Array(TN), ty = new Float32Array(TN), tz = new Float32Array(TN), tvx = new Float32Array(TN), tvy = new Float32Array(TN), tvz = new Float32Array(TN);
  const tage = new Float32Array(TN), tlife = new Float32Array(TN), tfl = new Float32Array(TN), tcr = new Float32Array(TN), tcg = new Float32Array(TN), tcb = new Float32Array(TN), thead = new Uint8Array(TN);
  let tCursor = 0, dripT = null, dripFloor = null, sparkT = null, ventPrev = null;
  const lastSnd = {};
  const _v = new THREE.Vector3();

  const snd = (name, x, y, z, vol) => {
    const now = clock; if (now - (lastSnd[name] || -9) < (name === 'a12_vent' ? 1.5 : 0.35)) return;
    lastSnd[name] = now;
    try { game.audio?.play?.(name, { volume: vol, bus: 'sfx', pos: _v.set(x, y, z), refDistance: 2.5, maxDistance: 22 }); } catch { /* audio optional */ }
  };

  offs.push(mods.on('warm', (reg) => { try { for (const o of warmObjects()) reg(o); } catch { /* warm set optional */ } }));   // the landing warm set compiles the 3 material flavours before the first frame indoors

  // ------------------------------------------------------------------ build / teardown
  function teardown() {
    S.art?.dispose(); S.P?.dispose(); S.root?.removeFromParent();
    S.art = S.P = S.root = S.plan = null; nAnch = 0; dlamp.fill(-1); tk.fill(0); dripT = sparkT = ventPrev = dripFloor = lampRGB = null; dustActive = 0;
  }
  function build(F) {
    teardown();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const L = F.layout, Y = L.y, phys = game.physics;
    const plan = planAtmos(F, 0, Math.max(0.3, QUALITY.decor ?? 1));
    // is the physics query pipeline alive yet? (probe a few cells; if not, assume flat floors at layout Y so the pass still shows)
    const cast = (x, y, z, len) => { try { return phys?.raycast?.({ x, y, z }, { x: 0, y: -1, z: 0 }, len, G.STATIC) || null; } catch { return null; } };
    let alive = false;
    for (const d of plan.decals.slice(0, 12)) if (cast(d.x, Y + 1.2, d.z, 2.5)) { alive = true; break; }
    const floorAt = (x, yFrom, z) => {
      if (!alive) return Y;
      const h = cast(x, yFrom, z, 12);
      return h && (h.normal?.y ?? 1) > 0.8 ? h.point.y : null;
    };
    const art = buildAtmos(plan, { emitters: F.emitters || [], floorAt, Y });
    const P = makePoints(TN + DN);
    const root = new THREE.Group(); root.name = 'atmos12root';
    root.add(art.group, P.pts);
    game.scene.add(root);
    S.art = art; S.P = P; S.root = root; S.plan = plan;
    lampRGB = new Float32Array(plan.lamps.length * 3);
    const c = new THREE.Color();
    plan.lamps.forEach((l, i) => { c.set(F.emitters[l.k]?.color ?? 0xffe6c0); lampRGB[i * 3] = c.r * 0.7 + 0.3; lampRGB[i * 3 + 1] = c.g * 0.7 + 0.3; lampRGB[i * 3 + 2] = c.b * 0.7 + 0.3; });
    dripFloor = plan.drips.map((d) => floorAt(d.x, d.y - 0.3, d.z) ?? Y);
    dripT = plan.drips.map(() => 1 + Math.random() * 5);
    sparkT = plan.broken.map(() => 1 + Math.random() * 4);
    ventPrev = plan.vents.map(() => 0);
    dustActive = Math.min(DN, Math.round(150 * plan.profile.dust * (QUALITY.particles ?? 1)));
    P.geo.setDrawRange(0, TN + dustActive);
    for (let j = 0; j < DN; j++) { dlamp[j] = -1; dage[j] = 0; dlife[j] = 0; }
    anchorT = 0;
    buildMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
    applyFlags();
  }
  function applyFlags() {
    if (S.art?.decals) S.art.decals.visible = S.on.decals;
    if (S.art?.light) S.art.light.visible = S.on.shafts;
    if (S.P) S.P.pts.visible = S.on.dust || S.on.fx;
  }

  // ------------------------------------------------------------------ dust anchors + motes
  const bx = new Float32Array(NA);
  function pickAnchors(cp, gd) {
    const plan = S.plan, info = S.art.lampInfo, em = S.fac.emitters;
    nAnch = 0;
    if (gd < 0.05) return;
    for (let i = 0; i < plan.lamps.length; i++) {
      if (!info[i]) continue;
      const l = plan.lamps[i], e = em[l.k];
      if (!e?.enabled) continue;
      const d2 = (l.x - cp.x) ** 2 + (l.y - cp.y) ** 2 + (l.z - cp.z) ** 2;
      if (d2 > 20 * 20 || lampFactor(e, game.lights?.time || 0) < 0.3) continue;
      let at = nAnch < NA ? nAnch : NA - 1;
      if (nAnch >= NA && d2 >= bx[NA - 1]) continue;
      while (at > 0 && bx[at - 1] > d2) { bx[at] = bx[at - 1]; anchors[at] = anchors[at - 1]; at--; }
      bx[at] = d2; anchors[at] = i;
      if (nAnch < NA) nAnch++;
    }
  }
  function spawnMote(j) {
    const plan = S.plan, li = anchors[((j + ((Math.random() * NA) | 0)) % nAnch)], l = plan.lamps[li], info = S.art.lampInfo[li];
    if (!info) { dlamp[j] = -1; return; }
    const t = Math.pow(Math.random(), 0.8), r = (0.14 + (info.r1 - 0.14) * t) * Math.sqrt(Math.random()), a = Math.random() * TAU;
    dpx[j] = l.x + Math.cos(a) * r; dpz[j] = l.z + Math.sin(a) * r; dpy[j] = l.y - 0.1 - t * info.fh;
    dvx[j] = (Math.random() - 0.5) * 0.06; dvz[j] = (Math.random() - 0.5) * 0.06; dvy[j] = -0.025 + (Math.random() - 0.5) * 0.05;
    dage[j] = 0; dlife[j] = 5 + Math.random() * 7; dbri[j] = 0.6 + Math.random() * 0.4; dlamp[j] = li;
  }
  function updateDust(dt, gd) {
    const P = S.P, col = P.col, pos = P.pos, plan = S.plan, em = S.fac.emitters, lt = game.lights?.time || clock;
    for (let j = 0; j < dustActive; j++) {
      const o = (TN + j) * 3;
      if (dlamp[j] < 0 || dage[j] >= dlife[j]) {
        if (nAnch) spawnMote(j); else dlamp[j] = -1;
        if (dlamp[j] < 0) { col[o] = col[o + 1] = col[o + 2] = 0; continue; }
      }
      dage[j] += dt;
      const s = Math.sin(dage[j] * 0.7 + j * 1.7) * 0.035, s2 = Math.cos(dage[j] * 0.5 + j * 2.3) * 0.03;
      dpx[j] += (dvx[j] + s) * dt; dpy[j] += (dvy[j] + s2 * 0.5) * dt; dpz[j] += (dvz[j] + s2) * dt;
      pos[o] = dpx[j]; pos[o + 1] = dpy[j]; pos[o + 2] = dpz[j];
      const env = Math.sin(Math.PI * Math.min(1, dage[j] / dlife[j])), li = dlamp[j];
      const k = env * dbri[j] * lampFactor(em[plan.lamps[li].k], lt) * gd * 1.15;
      col[o] = lampRGB[li * 3] * k; col[o + 1] = lampRGB[li * 3 + 1] * k; col[o + 2] = lampRGB[li * 3 + 2] * k;
    }
  }

  // ------------------------------------------------------------------ transients (drips / ripples / sparks / puffs)
  function slot() { for (let n = 0; n < TN; n++) { const i = (tCursor + n) % TN; if (!tk[i]) { tCursor = (i + 1) % TN; return i; } } return -1; }
  function spawn(kind, x, y, z, vx, vy, vz, life, r, g, b, fl, head = 0) {
    const i = slot(); if (i < 0) return -1;
    tk[i] = kind; tx[i] = x; ty[i] = y; tz[i] = z; tvx[i] = vx; tvy[i] = vy; tvz[i] = vz; tage[i] = 0; tlife[i] = life; tcr[i] = r; tcg[i] = g; tcb[i] = b; tfl[i] = fl; thead[i] = head;
    return i;
  }
  function ripple(x, z, fl) { const a0 = Math.random() * TAU; for (let k = 0; k < 5; k++) spawn(2, x, fl + 0.03, z, a0 + k * TAU / 5, 0, 0, 0.6, 0.7, 0.85, 1, fl); }
  function updateTransients(dt) {
    const P = S.P, col = P.col, pos = P.pos;
    for (let i = 0; i < TN; i++) {
      const o = i * 3;
      if (!tk[i]) { col[o] = col[o + 1] = col[o + 2] = 0; continue; }
      tage[i] += dt;
      const a = tage[i], u = a / tlife[i], k = tk[i];
      let f = 1;
      if (k === 1) {   // drop: bead swells at the ceiling for tvz s, then falls
        if (a < tvz[i]) f = 0.25 + 0.75 * (a / tvz[i]);
        else { tvy[i] -= 9.8 * dt; ty[i] += tvy[i] * dt; if (ty[i] <= tfl[i] + 0.02) { if (thead[i]) { ripple(tx[i], tz[i], tfl[i]); snd('a12_drip', tx[i], tfl[i], tz[i], 0.28); } tk[i] = 0; col[o] = col[o + 1] = col[o + 2] = 0; continue; } }
        pos[o] = tx[i]; pos[o + 1] = ty[i]; pos[o + 2] = tz[i];
      } else if (k === 2) {   // ripple ring point
        const r = a * 0.8;
        pos[o] = tx[i] + Math.cos(tvx[i]) * r; pos[o + 1] = ty[i]; pos[o + 2] = tz[i] + Math.sin(tvx[i]) * r;
        f = (1 - u) * 0.9;
      } else {   // spark (gravity) / puff (drag)
        if (k === 3) { tvy[i] -= 7 * dt; } else { const d = 1 - 1.6 * dt; tvx[i] *= d; tvy[i] *= d; tvz[i] *= d; }
        tx[i] += tvx[i] * dt; ty[i] += tvy[i] * dt; tz[i] += tvz[i] * dt;
        if (k === 3 && ty[i] <= tfl[i] + 0.02) { tk[i] = 0; col[o] = col[o + 1] = col[o + 2] = 0; continue; }
        pos[o] = tx[i]; pos[o + 1] = ty[i]; pos[o + 2] = tz[i];
        f = k === 3 ? 1 - u * u : Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.8;
      }
      if (u >= 1 && k !== 1) { tk[i] = 0; col[o] = col[o + 1] = col[o + 2] = 0; continue; }
      col[o] = tcr[i] * f; col[o + 1] = tcg[i] * f; col[o + 2] = tcb[i] * f;
    }
  }
  function updateSources(dt, cp, gd) {
    const plan = S.plan, em = S.fac.emitters;
    if (S.on.fx) {
      for (let i = 0; i < plan.drips.length; i++) {
        const d = plan.drips[i];
        if ((d.x - cp.x) ** 2 + (d.z - cp.z) ** 2 > 18 * 18) continue;
        if ((dripT[i] -= dt) > 0) continue;
        dripT[i] = 2 + Math.random() * 5;
        spawn(1, d.x, d.y - 0.03, d.z, 0, 0, 0.75, 9, 0.6, 0.8, 1, dripFloor[i], 1);
        spawn(1, d.x, d.y + 0.11, d.z, 0, 0, 0.75, 9, 0.28, 0.4, 0.55, dripFloor[i], 0);
      }
      if (gd > 0.3) for (let i = 0; i < plan.broken.length; i++) {
        const l = plan.broken[i];
        if ((l.x - cp.x) ** 2 + (l.z - cp.z) ** 2 > 16 * 16) continue;
        if ((sparkT[i] -= dt) > 0) continue;
        sparkT[i] = 1.5 + Math.random() * 4;
        if (!em[l.k]?.enabled) continue;
        const fl = S.art.lampInfo[plan.lamps.indexOf(l)]?.floorY ?? (S.fac.layout.y);
        const n = 5 + ((Math.random() * 4) | 0);
        for (let k = 0; k < n; k++) spawn(3, l.x, l.y - 0.15, l.z, (Math.random() - 0.5) * 1.6, -0.2 + Math.random() * 0.9, (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 0.5, 1, 0.7 + Math.random() * 0.25, 0.25, fl);
        snd('a12_spark', l.x, l.y, l.z, 0.3);
      }
      for (let i = 0; i < plan.vents.length; i++) {
        const v = plan.vents[i], x = (((clock + v.ph) / v.per) % 1 + 1) % 1;
        const fired = ventPrev[i] < BURST_AT && x >= BURST_AT;
        ventPrev[i] = x;
        if (!fired || gd < 0.2 || (v.x - cp.x) ** 2 + (v.z - cp.z) ** 2 > 16 * 16) continue;
        for (let k = 0; k < 5; k++) spawn(4, v.x + (Math.random() - 0.5) * 0.5, v.y - 0.1, v.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7, -0.9 - Math.random() * 0.5, (Math.random() - 0.5) * 0.7, 1.3, 0.5, 0.58, 0.66, 0);
        snd('a12_vent', v.x, v.y, v.z, 0.16);
      }
    }
  }

  // ------------------------------------------------------------------ frame
  function grade(dt, want) {
    const u = game.engine?.postMat?.uniforms?.uTint;
    if (!u) return;
    const tgt = want && S.on.tint ? (S.force || S.plan?.profile.tint || null) : null, k = Math.min(1, dt * 1.4);
    for (let c = 0; c < 3; c++) S.tint[c] += ((tgt ? tgt[c] : 1) - S.tint[c]) * k;
    u.value.set(S.tint[0], S.tint[1], S.tint[2]);
  }
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    clock += dt;
    const F = game.world?.facility || null;
    if (F !== S.fac) { teardown(); S.fac = F; S.wait = F ? 0.5 : -1; }
    if (S.wait >= 0) { S.wait -= dt; if (S.wait < 0) { try { build(S.fac); } catch (e) { console.warn('[atmos12] build', e); teardown(); S.wait = -2; } } }
    const p = game.player, indoor = !!(S.art && p && p.indoor && !p.dead);
    if (S.root) S.root.visible = !!(p && p.indoor);
    grade(dt, indoor);
    if (!indoor) return;
    const cp = game.engine.camera.position, gd = game.lights?.globalDim ?? 1;
    S.art.update(game.lights?.time || clock, gd, clock);
    if (!S.on.dust && !S.on.fx) return;
    anchorT -= dt;
    if (anchorT <= 0) { anchorT = 0.4; pickAnchors(cp, gd); }
    if (S.on.dust) updateDust(dt, gd); else for (let j = 0; j < dustActive; j++) { const o = (TN + j) * 3; S.P.col[o] = S.P.col[o + 1] = S.P.col[o + 2] = 0; }
    updateSources(dt, cp, gd);
    updateTransients(dt);
    S.P.pa.needsUpdate = true; S.P.ca.needsUpdate = true;
  }));

  // ------------------------------------------------------------------ debug (kefal.game.atmos12.debug)
  const debug = {
    state() { const a = S.art; return { theme: S.plan?.theme, sig: S.plan?.sig, built: !!a, buildMs: +buildMs.toFixed(1), stats: a?.stats, anchors: nAnch, dustActive, tint: S.tint.map((x) => +x.toFixed(3)), on: { ...S.on } }; },
    plan: () => S.plan,
    rebuild() { if (S.fac) build(S.fac); return debug.state(); },
    set(flag, on = true) { S.on[flag] = !!on; applyFlags(); return { ...S.on }; },
    /** try a theme's colour grade without changing the facility: debug.grade('deadmall'); debug.grade(null) resets */
    grade(id) { S.force = id ? (S.plan && S.plan.theme === id ? S.plan.profile.tint : null) : null; return S.force; },
    /** fire a source now: 'spark' | 'drip' | 'vent' (nearest one to the camera) */
    burst(kind = 'spark') {
      const plan = S.plan, cp = game.engine.camera.position; if (!plan) return null;
      const near = (arr) => arr.slice().sort((a, b) => ((a.x - cp.x) ** 2 + (a.z - cp.z) ** 2) - ((b.x - cp.x) ** 2 + (b.z - cp.z) ** 2))[0];
      if (kind === 'spark') { const i = plan.broken.indexOf(near(plan.broken)); if (i >= 0) sparkT[i] = 0; return i; }
      if (kind === 'drip') { const i = plan.drips.indexOf(near(plan.drips)); if (i >= 0) dripT[i] = 0; return i; }
      if (kind === 'vent') { const i = plan.vents.indexOf(near(plan.vents)); if (i >= 0) ventPrev[i] = 0; return i; }
      return null;
    },
    /** teleport-free tour helper: nearest lamp / puddle / vent / drip positions to the camera */
    near() { const plan = S.plan, cp = game.engine.camera.position; if (!plan) return null; const d = (o) => Math.hypot(o.x - cp.x, o.z - cp.z).toFixed(1); return { lamp: plan.lamps.slice(0, 3).map(d), puddles: plan.decals.filter((x) => x.k === 'puddle').slice(0, 3).map((x) => d(x)), drips: plan.drips.map(d), vents: plan.vents.map(d) }; },
  };
  return {
    debug,
    dispose() {
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      try { const u = game.engine?.postMat?.uniforms?.uTint; u?.value.set(1, 1, 1); } catch { /* engine gone */ }
      teardown();
    },
  };
}
