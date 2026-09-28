// TFG wave 2 - combat weapons: item data (6 new melee weapons, rocket / grenade launchers, SMG, rifle, Grav-Tool, 4 ammo types),
// their first-person recoil, procedural sounds, and the ranged / tech behaviour (rockets + rocket jump, bouncing grenades, hitscan,
// gravity tool). The melee move sets live in combat.js (classes); the models in models/combat_wave2.js.
// Host-authoritative: the shooter's client predicts (raycast / projectile), the host recomputes damage (`cbshot`, `cbboom`, `cbgrav`).
import * as THREE from 'three';
import { ITEMS, registerItem } from './items.js';
import { WEAPON_RECOIL } from '../models/avatar.js';
import { COMBAT_MODELS, createRocketMesh, createGrenadeMesh } from '../models/combat_wave2.js';
import { G } from '../physics/physics.js';
import { applyAffixes, applyAffixEffects } from './loot.js';
import { relMul } from './weapons.js';
import { addTranslations, t } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { clamp, fin3, arr3, synth, sin, ex, nz, movable } from './combat_kit.js';

// ================================================================================================== item data
// dmg at the item's own tier (ranged: relMul(it) scales instances), cd s, reach m. price = credits (shop: Company Store category).
const W = (id, name, o) => ({ id, name, kind: 'weapon', hands: 1, weight: 5, shop: 'weapons', ...o });
export const COMBAT_WEAPON_DEFS = [
  // ---- melee (move sets: combat.js CLASSES)
  W('longsword', 'Longsword', { price: 420, weight: 4, dmg: 28, cd: 0.5, reach: 2.5, knock: 1.2, rarity: 'rare', tier: 'rare', value: [60, 95], cclass: 'sword',
    blurb: 'Balanced steel. 3-hit combo, strong guard - time your block to parry.' }),
  W('greatsword', 'Greatsword', { price: 820, weight: 12, hands: 2, dmg: 46, cd: 0.9, reach: 2.9, knock: 1.6, rarity: 'epic', tier: 'epic', value: [120, 180], cclass: 'great',
    blurb: 'Two-handed and slow, but every swing cleaves up to four enemies.' }),
  W('twindaggers', 'Twin Daggers', { price: 380, weight: 2, dmg: 11, cd: 0.26, reach: 1.7, rarity: 'rare', tier: 'rare', value: [55, 85], cclass: 'dagger', twin: true, backstab: 2,
    blurb: 'Blinding speed. Backstabs hit for double.' }),
  W('spear', 'Spear', { price: 360, weight: 6, dmg: 25, cd: 0.62, reach: 3.3, rarity: 'rare', tier: 'rare', value: [50, 80], cclass: 'spear',
    blurb: 'Long reach thrusts that pierce two enemies in a line.' }),
  W('waraxe', 'War Axe', { price: 700, weight: 9, dmg: 38, cd: 0.8, reach: 2.3, rarity: 'epic', tier: 'epic', value: [100, 150], cclass: 'axe', bleed: { dps: 5, t: 4 },
    blurb: 'Heavy chops that leave enemies bleeding for 4 s.' }),
  W('warhammer', 'War Hammer', { price: 760, weight: 18, hands: 2, dmg: 52, cd: 1.15, reach: 2.5, knock: 2, rarity: 'epic', tier: 'epic', value: [110, 170], cclass: 'hammer', heavyStun: 2.5,
    blurb: 'Hold LMB for a slam that stuns up to 2.5 s.' }),
  // ---- ranged / tech (cfire = combat_weapons behaviour)
  W('rocketlauncher', 'Rocket Launcher', { price: 1200, weight: 14, hands: 2, dmg: 80, cd: 1.4, reach: 90, ammo: 1, ammoItem: 'rockets', reload: 1.9, ranged: true, cfire: 'rocket', speed: 24, R: 4.2, knock: 14, noise: 3.5,
    rarity: 'epic', tier: 'epic', blurb: 'Slow visible rocket, big splash and knockback. Fire at your feet to ROCKET JUMP (reduced self damage).' }),
  W('grenadelauncher', 'Grenade Launcher', { price: 900, weight: 10, hands: 2, dmg: 55, cd: 0.75, reach: 60, ammo: 4, ammoItem: 'grenades40', reload: 2.4, ranged: true, cfire: 'grenade', speed: 18, fuse: 1.7, R: 3.6, knock: 10, noise: 2,
    rarity: 'epic', tier: 'epic', blurb: 'Bouncing grenades with a 1.7 s fuse. Bank shots around corners.' }),
  W('smg', 'SMG', { price: 480, weight: 5, dmg: 5, cd: 0.09, reach: 35, ammo: 30, ammoItem: 'smgammo', reload: 1.5, ranged: true, cfire: 'hitscan', auto: true, spread: 0.06, noise: 1.6, fireSnd: 'cb_smg', knock: 0.4,
    rarity: 'rare', tier: 'rare', blurb: 'Fast and weak. Hold the trigger, spend a lot of ammo.' }),
  W('rifle', 'Rifle', { price: 560, weight: 8, hands: 2, dmg: 34, cd: 0.6, reach: 80, ammo: 8, ammoItem: 'rifleammo', reload: 2.0, ranged: true, cfire: 'hitscan', spread: 0.002, noise: 2.6, fireSnd: 'cb_rifle', knock: 1.0,
    rarity: 'rare', tier: 'rare', blurb: 'Accurate, medium damage, 8-round magazine.' }),
  W('gravtool', 'Grav-Tool', { price: 950, weight: 6, dmg: 0, cd: 0.4, reach: 16, ranged: true, cfire: 'grav', shop: 'tools',
    rarity: 'epic', tier: 'epic', blurb: 'LMB: hold loose items and small creatures at a distance. RMB: punt them. Thrown junk hurts.' }),
];
const A = (id, name, o) => ({ id, name, kind: 'consumable', hands: 1, weight: 0.5, ammoFor: true, shop: 'consumables', ...o });
export const COMBAT_AMMO_DEFS = [
  A('rockets', 'Rocket Crate', { price: 75, charges: 3, weight: 2, blurb: '3 rockets for the Rocket Launcher.' }),
  A('grenades40', '40mm Grenades', { price: 60, charges: 6, weight: 1.5, blurb: '6 grenades for the Grenade Launcher.' }),
  A('smgammo', 'SMG Ammo Box', { price: 40, charges: 60, blurb: '60 rounds for the SMG.' }),
  A('rifleammo', 'Rifle Rounds', { price: 36, charges: 16, blurb: '16 rounds for the Rifle.' }),
];
for (const d of [...COMBAT_WEAPON_DEFS, ...COMBAT_AMMO_DEFS]) if (!ITEMS[d.id]) registerItem(d);

WEAPON_RECOIL.rocketlauncher = { dur: 0.55, jitter: 0.004, K: { x: 0.5, e: 0.3, pz: 0.2, py: 0.06, wr: -0.3 } };
WEAPON_RECOIL.grenadelauncher = { dur: 0.4, jitter: 0.003, K: { x: 0.4, e: 0.2, pz: 0.14, py: 0.04 } };
WEAPON_RECOIL.smg = { dur: 0.1, jitter: 0.012, K: { x: 0.07, pz: 0.03, py: 0.006 } };
WEAPON_RECOIL.rifle = { dur: 0.42, jitter: 0.002, K: { x: 0.34, e: 0.16, pz: 0.14, py: 0.03, wr: -0.2 } };
WEAPON_RECOIL.gravtool = { dur: 0.3, jitter: 0.002, K: { x: 0.2, pz: 0.08, py: 0.02 } };

addTranslations({
  Longsword: 'Uzun Kılıç', Greatsword: 'Büyük Kılıç', 'Twin Daggers': 'İkiz Hançer', Spear: 'Mızrak', 'War Axe': 'Savaş Baltası', 'War Hammer': 'Savaş Çekici',
  'Rocket Launcher': 'Roketatar', 'Grenade Launcher': 'Bomba Atar', SMG: 'Hafif Makineli', Rifle: 'Tüfek', 'Grav-Tool': 'Yerçekimi Aleti',
  'Rocket Crate': 'Roket Kasası', '40mm Grenades': '40mm Bombalar', 'SMG Ammo Box': 'SMG Mermi Kutusu', 'Rifle Rounds': 'Tüfek Mermisi',
  'Balanced steel. 3-hit combo, strong guard - time your block to parry.': 'Dengeli çelik. 3 vuruşluk kombo, güçlü savunma - bloğu zamanla, karşıla.',
  'Two-handed and slow, but every swing cleaves up to four enemies.': 'İki elli ve yavaş, ama her savuruş dört düşmana kadar biçer.',
  'Blinding speed. Backstabs hit for double.': 'Göz kamaştıran hız. Arkadan vuruşlar iki katı vurur.',
  'Long reach thrusts that pierce two enemies in a line.': 'Uzun menzilli saplamalar, sıradaki iki düşmanı deler.',
  'Heavy chops that leave enemies bleeding for 4 s.': 'Ağır darbeler düşmanı 4 sn kanatır.',
  'Hold LMB for a slam that stuns up to 2.5 s.': 'Sol tık basılı tut: 2.5 sn\'ye kadar sersemleten ezme.',
  'Slow visible rocket, big splash and knockback. Fire at your feet to ROCKET JUMP (reduced self damage).': 'Yavaş, görünür roket; büyük alan hasarı ve geri itme. Ayaklarına ateş et: ROKET ZIPLAMASI (azaltılmış kendi hasarı).',
  'Bouncing grenades with a 1.7 s fuse. Bank shots around corners.': '1.7 sn fitilli sekerek giden bombalar. Köşelerden sektirerek at.',
  'Fast and weak. Hold the trigger, spend a lot of ammo.': 'Hızlı ve zayıf. Tetiği basılı tut, çok mermi harca.',
  'Accurate, medium damage, 8-round magazine.': 'İsabetli, orta hasar, 8 mermilik şarjör.',
  'LMB: hold loose items and small creatures at a distance. RMB: punt them. Thrown junk hurts.': 'Sol tık: uzaktaki eşyaları ve küçük yaratıkları tut. Sağ tık: fırlat. Fırlatılan hurda acıtır.',
  '3 rockets for the Rocket Launcher.': 'Roketatar için 3 roket.', '6 grenades for the Grenade Launcher.': 'Bomba Atar için 6 bomba.',
  '60 rounds for the SMG.': 'SMG için 60 mermi.', '16 rounds for the Rifle.': 'Tüfek için 16 mermi.',
  'Out of ammo. [R] to reload.': 'Mermi bitti. [R] ile doldur.', 'No ammo for this weapon in your slots.': 'Envanterinde bu silah için mermi yok.', 'Already fully loaded.': 'Zaten dolu.', 'Reloading...': 'Dolduruluyor...',
});

// ================================================================================================== procedural sounds
const SOUNDS = {
  cb_smg: (sr) => { let lp = 0; return synth(sr, 0.13, (tt) => { lp += (nz() - lp) * 0.5; return lp * ex(tt, 70) * 1.2 + sin(150, tt) * ex(tt, 40) * 0.6; }); },
  cb_rifle: (sr) => { let lp = 0; return synth(sr, 0.6, (tt) => { lp += (nz() - lp) * 0.3; return lp * ex(tt, 40) * 1.3 + sin(55 + 90 * ex(tt, 18), tt) * ex(tt, 10) + nz() * ex(tt, 6) * 0.1; }); },
  cb_rocket: (sr) => { let lp = 0; return synth(sr, 0.9, (tt) => { lp += (nz() - lp) * 0.12; return lp * (0.6 + 0.4 * Math.min(1, tt * 20)) * ex(tt, 3.5) * 1.3 + sin(60 + 40 * ex(tt, 8), tt) * ex(tt, 7); }); },
  cb_gl: (sr) => synth(sr, 0.35, (tt) => sin(90 + 120 * ex(tt, 30), tt) * ex(tt, 14) + nz() * ex(tt, 90) * 0.5),
  cb_bounce: (sr) => synth(sr, 0.15, (tt) => sin(220 + 100 * ex(tt, 40), tt) * ex(tt, 30) + nz() * ex(tt, 120) * 0.3),
  cb_empty: (sr) => synth(sr, 0.12, (tt) => (nz() * 0.7 + sin(1800, tt)) * ex(tt, 90)),
  cb_reload: (sr) => synth(sr, 0.6, (tt) => { const c = (t0, k) => (tt >= t0 ? nz() * ex(tt - t0, k) : 0); return c(0, 120) * 0.8 + c(0.3, 90) * 0.9 + sin(2200, tt) * c(0.3, 200) * 0.4; }),
  cb_grav: (sr) => synth(sr, 0.5, (tt) => sin(120 + 260 * tt, tt) * Math.min(1, tt * 12) * (1 - tt * 1.6) * 0.6 + sin(480, tt) * ex(tt, 6) * 0.3),
  cb_punt: (sr) => synth(sr, 0.4, (tt) => sin(70 + 200 * ex(tt, 14), tt) * ex(tt, 9) + nz() * ex(tt, 45) * 0.6),
};

// ================================================================================================== install
export function installCombatWeapons(g, K) {
  K.sounds(SOUNDS);
  K.models(COMBAT_MODELS);
  const held = () => g.player?.heldItem?.() || null;
  const isCf = (it) => !!it?.def?.cfire;
  const fwdOf = () => new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize();
  const muzzleOf = (fwd) => {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion), down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.camera.quaternion);
    return g.camera.position.clone().addScaledVector(fwd, 0.75).addScaledVector(right, 0.16).addScaledVector(down, 0.1);
  };
  const rangedMul = () => clamp(g.stats.rangedMul || g.stats.meleeMul || 1, 0.5, 2.5);
  const toast = (s, kind) => g.ui?.toast?.(t(s), kind);
  const tmp = new THREE.Vector3();

  // ---------------------------------------------------------------- ammo HUD + reload
  const ammoBox = hudDock('bottom', 'cbammo', 10);
  ammoBox.style.cssText = 'display:none;font-family:var(--font);font-size:20px;color:#ffe7c4;text-shadow:0 0 6px #000;letter-spacing:1px';
  let reload = null;                       // { it, t, dur }
  const boxesFor = (def) => {
    const out = [];
    for (const id of g.player.slots) { const b = id && g.items.get(id); if (b && b.type === def.ammoItem && (b.charges ?? 0) > 0) out.push(b); }
    for (const b of g.inventory?.bagItems?.() || []) if (b.type === def.ammoItem && (b.charges ?? 0) > 0) out.push(b);
    return out;
  };
  function startReload(it) {
    const def = it.def;
    if (reload) return;
    if ((it.ammo ?? 0) >= def.ammo) { toast('Already fully loaded.'); return; }
    if (!boxesFor(def).length) { K.snd('cb_empty', null, 0.6); toast('No ammo for this weapon in your slots.', 'bad'); return; }
    reload = { it, t: 0, dur: def.reload || 1.5 };
    K.snd('cb_reload', null, 0.8);
  }
  function finishReload() {
    const { it } = reload, def = it.def;
    let need = def.ammo - (it.ammo ?? 0);
    for (const box of boxesFor(def)) {
      if (need <= 0) break;
      const take = Math.min(need, box.charges);
      it.ammo = (it.ammo ?? 0) + take; box.charges -= take; need -= take;
      if (box.charges <= 0) g.net.request('consume', { id: box.id }); else g.net.broadcast('itst', { id: box.id, c: box.charges });
    }
    g.net.broadcast('itst', { id: it.id, am: it.ammo });
  }
  K.wrap(g, 'reload', (orig) => function () {
    const it = held();
    if (isCf(it) && it.def.ammoItem) { startReload(it); return; }
    return orig();
  });

  // ---------------------------------------------------------------- projectiles (client-predicted copy on every peer; the shooter's copy reports the burst)
  const proj = [];
  let nextRid = 1;
  const trailOpts = { count: 2, color: [0xffc040, 0x999999, 0x444444], speed: 0.5, up: 0.2, life: 0.5, size: 0.06, gravity: -0.5, drag: 3 };
  function removeProj(p) {
    const i = proj.indexOf(p);
    if (i >= 0) proj.splice(i, 1);
    if (p.mesh) { p.mesh.removeFromParent(); p.mesh.userData.dispose?.(); }
  }
  function spawnProj(d, kind) {
    const pos = fin3(d.o), vel = fin3(d.v);
    if (!pos || !vel) return;
    const mine = d.by === g.selfId;
    const mesh = kind === 'rocket' ? createRocketMesh() : createGrenadeMesh();
    g.scene.add(mesh);
    mesh.position.copy(pos);
    proj.push({ rid: d.rid, kind, pos, vel, mesh, mine, w: d.w, t: 0, life: kind === 'rocket' ? 3.2 : (d.fuse || 1.7) + 0.6, fuse: d.fuse || 1.7, grav: kind === 'rocket' ? 0 : 14, trailT: 0, rest: false, mul: d.mul || 1 });
  }
  K.onFx('rocket', (d) => spawnProj(d, 'rocket'));
  K.onFx('grenade', (d) => spawnProj(d, 'grenade'));
  function detonate(p, at, directCid) {
    if (p.mine && p.w) g.net.request('cbboom', { w: p.w, p: arr3(at), cid: directCid || undefined, rid: p.rid, mul: p.mul });
    removeProj(p);
  }
  K.update((dt) => {
    for (let i = proj.length - 1; i >= 0; i--) {
      const p = proj[i];
      p.t += dt;
      if (p.t > p.life) { if (p.kind === 'grenade' && p.mine) detonate(p, p.pos); else removeProj(p); continue; }
      if (p.kind === 'grenade' && p.mine && p.t >= p.fuse) { detonate(p, p.pos); continue; }
      const steps = Math.max(1, Math.ceil(dt / 0.02)), h = dt / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead && !p.rest; s++) {
        if (p.grav) p.vel.y -= p.grav * h;
        const len = p.vel.length() * h;
        if (len < 1e-5) continue;
        const dir = p.vel.clone().normalize();
        const wall = g.physics.raycast(p.pos, dir, len + 0.05, G.STATIC | G.DOOR);
        const cr = g.creatures.raycast(p.pos, dir, wall ? wall.distance : len);
        if (cr && !(p.kind === 'grenade' && p.t < 0.06)) { p.pos.addScaledVector(dir, cr.t); if (p.mine) detonate(p, p.pos, cr.view.id); else removeProj(p); dead = true; }
        else if (wall) {
          p.pos.set(wall.point.x, wall.point.y, wall.point.z);
          if (p.kind === 'rocket') { if (p.mine) detonate(p, p.pos); else removeProj(p); dead = true; }
          else {
            const n = wall.normal || { x: 0, y: 1, z: 0 }, nv = new THREE.Vector3(n.x, n.y, n.z), vn = p.vel.dot(nv);
            p.vel.addScaledVector(nv, -2 * vn).multiplyScalar(0.45);
            p.pos.addScaledVector(nv, 0.07);
            if (Math.abs(vn) > 2.5) K.snd('cb_bounce', p.pos, 0.6, 0.9 + Math.random() * 0.3, { ref: 3 });
            if (nv.y > 0.6 && p.vel.length() < 1.6) { p.vel.set(0, 0, 0); p.rest = true; }
          }
        } else p.pos.addScaledVector(dir, len);
      }
      if (dead) continue;
      p.mesh.position.copy(p.pos);
      if (p.kind === 'rocket') {
        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), p.vel.clone().normalize());
        p.mesh.userData.flame.scale.setScalar(0.8 + Math.random() * 0.5);
        p.trailT -= dt;
        if (p.trailT <= 0) { p.trailT = 0.03; K.burst(p.pos.clone().addScaledVector(p.vel.clone().normalize(), -0.3), trailOpts, null, 1); }
      } else {
        p.mesh.rotation.x += dt * 8; p.mesh.rotation.z += dt * 5;
        const blink = p.t > p.fuse - 0.6 ? Math.sin(p.t * 40) > 0 : Math.sin(p.t * 8) > 0.6;
        p.mesh.userData.led.visible = blink;
      }
    }
    // reload progress + ammo readout
    const it = held();
    if (reload) {
      if (!it || it.id !== reload.it.id || g.player.dead) reload = null;
      else { reload.t += dt; if (reload.t >= reload.dur) { finishReload(); reload = null; } }
    }
    if (isCf(it) && it.def.ammoItem) {
      let res = 0; for (const b of boxesFor(it.def)) res += b.charges;
      ammoBox.style.display = 'block';
      ammoBox.textContent = reload ? t('Reloading...') : `${it.ammo ?? 0}/${it.def.ammo}  |  ${res}`;
    } else if (ammoBox.style.display !== 'none') ammoBox.style.display = 'none';
    // full-auto: hold the trigger
    if (it?.def?.auto && isCf(it) && g.input.enabled && !g.player.dead && g.input.mouseDown(0) && !g.grab?.item && !g.ui.blocksInput()) fire(it);
    gravTick(dt);
  });

  // ---------------------------------------------------------------- firing
  let autoN = 0;
  function fire(it) {
    const def = it.def;
    if (reload || g.time < (g.nextSwing || 0)) return;
    if ((it.ammo ?? 0) <= 0) { g.nextSwing = g.time + 0.35; K.snd('cb_empty', null, 0.7); toast('Out of ammo. [R] to reload.', 'bad'); return; }
    g.nextSwing = g.time + def.cd;
    it.ammo = Math.max(0, it.ammo - 1);
    const n = (autoN = def.auto ? autoN + 1 : 0), chatty = !def.auto || n % 3 === 1 || it.ammo === 0;
    if (chatty) g.net.broadcast('itst', { id: it.id, am: it.ammo });
    g.swingAnim = 0.6;
    g.viewModel?.kick?.(it.type);
    const fwd = fwdOf();
    if (def.cfire === 'hitscan') {
      g.engine.punch?.(def.auto ? 0.012 : 0.05, (Math.random() - 0.5) * 0.02, 0);
      g.engine.shake(def.auto ? 0.06 : 0.25);
      if (chatty) { g.net.request('noise', { p: arr3(g.camera.position), loud: def.noise }); K.bsnd(def.fireSnd, g.camera.position, 1, def.auto ? 0.92 + Math.random() * 0.16 : undefined); }
      fireHitscan(it, def, fwd);
    } else if (def.cfire === 'rocket') {
      g.engine.punch?.(0.09, 0, 0); g.engine.shake(0.5); g.engine.flash?.(0xffd080, 0.2);
      g.net.request('noise', { p: arr3(g.camera.position), loud: def.noise });
      K.bsnd('cb_rocket', g.camera.position, 1);
      K.fx('rocket', { rid: `${g.selfId}:${nextRid++}`, o: arr3(muzzleOf(fwd)), v: arr3(fwd.clone().multiplyScalar(def.speed)), by: g.selfId, w: it.id, mul: +rangedMul().toFixed(2) });
    } else if (def.cfire === 'grenade') {
      g.engine.punch?.(0.06, 0, 0); g.engine.shake(0.3);
      g.net.request('noise', { p: arr3(g.camera.position), loud: def.noise });
      K.bsnd('cb_gl', g.camera.position, 1);
      K.fx('grenade', { rid: `${g.selfId}:${nextRid++}`, o: arr3(muzzleOf(fwd)), v: arr3(fwd.clone().multiplyScalar(def.speed).add(new THREE.Vector3(0, 3.2, 0))), by: g.selfId, w: it.id, fuse: def.fuse, mul: +rangedMul().toFixed(2) });
    }
  }
  function fireHitscan(it, def, fwd) {
    const eye = g.camera.position.clone(), dir = fwd.clone();
    if (def.spread) dir.add(tmp.set((Math.random() - 0.5) * def.spread, (Math.random() - 0.5) * def.spread, (Math.random() - 0.5) * def.spread)).normalize();
    const wall = g.physics.raycast(eye, dir, def.reach, G.STATIC | G.DOOR), maxD = wall ? wall.distance : def.reach;
    const r = g.creatures.raycast(eye, dir, maxD), end = eye.clone().addScaledVector(dir, r ? r.t : maxD);
    K.fx('tr', { a: arr3(muzzleOf(fwd)), b: arr3(end), w: !r && wall ? 1 : 0, s: def.auto ? 1 : 0 });
    if (r) {
      const crit = Math.random() < (g.stats.crit || 0);
      g.net.request('cbshot', { id: it.id, cid: r.view.id, crit, mul: +rangedMul().toFixed(2) });
      if (it.affix) { const a = applyAffixes(it.affix, { dmg: def.dmg, crit, cd: def.cd, stun: 0 }); applyAffixEffects(g, a, r.view); }
      g.hitstopT = Math.max(g.hitstopT || 0, crit ? 0.06 : 0.025);
      g.viewModel?.impact?.(r.view.maxHp === null ? 'metal' : 'flesh', 0.6);
    } else if (wall) g.net.request('noise', { p: arr3(end), loud: 0.3 });
  }
  K.onFx('tr', (d) => {
    const a = fin3(d.a), b = fin3(d.b);
    if (!a || !b) return;
    K.beam(a, b, 0xffe8a0, 0.07, d.s ? 0.008 : 0.014);
    if (d.w) K.burst(b, 'sparks', null, 0.5);
  });
  K.on('useItem', (it, hk, gg) => {
    if (gg !== g || hk.handled || !isCf(it)) return;
    hk.handled = true;
    if (it.def.cfire === 'grav') gravPress(it); else fire(it);
  });

  // ---------------------------------------------------------------- host: hitscan damage and explosions
  const hostLast = new Map();
  K.hostOn('cbshot', (d, from) => {
    const it = g.items.get(d?.id), def = it?.def;
    if (!it || it.holder !== from || def?.cfire !== 'hitscan') return;
    const now = g.time;
    if (now - (hostLast.get(it.id) ?? -9) < def.cd * 0.5) return;
    hostLast.set(it.id, now);
    const c = g.creatures.host.get(d.cid);
    if (!c || c.dead) return;
    const sp = K.posOf(from);
    if (sp && sp.distanceTo(c.pos) > def.reach + 8) return;
    let dmg = def.dmg * relMul(it) * clamp(Number(d.mul) || 1, 0.5, 2.5);
    const crit = !!d.crit;
    if (crit) dmg *= 2;
    let out = { dmg, stun: 0, crit };
    if (it.affix) { const a = applyAffixes(it.affix, { dmg, crit, cd: def.cd, stun: 0 }); out = { dmg: a.dmg, stun: a.stun, crit: a.crit }; }
    const hit = g.net.handlers.get('hit');
    if (hit) hit({ cid: c.id, dmg: out.dmg, stun: out.stun, crit: out.crit, kb: def.knock || 0.5 }, from); else K.hurt(c, out.dmg, from, { stun: out.stun, crit: out.crit });
  });
  K.hostOn('cbboom', (d, from) => {
    const it = g.items.get(d?.w), def = it?.def;
    if (!it || it.holder !== from || (def?.cfire !== 'rocket' && def?.cfire !== 'grenade')) return;
    const p = fin3(d.p);
    if (!p) return;
    const sp = K.posOf(from);
    if (sp && sp.distanceTo(p) > def.reach + 15) return;
    const now = g.time;
    it._cbb = (it._cbb || []).filter((x) => now - x < 3);
    if (it._cbb.length >= (def.cfire === 'rocket' ? 2 : 6)) return;
    it._cbb.push(now);
    K.explode(p, { R: def.R, dmg: def.dmg * relMul(it) * clamp(Number(d.mul) || 1, 0.5, 2.5), from, knock: def.knock, stun: def.cfire === 'rocket' ? 0.8 : 0.5, noise: 3.5, direct: typeof d.cid === 'string' ? d.cid : null });
    K.fx('boom', { p: arr3(p), R: def.R, by: from, rid: d.rid, kind: def.cfire });
  });
  // every peer: remove the visual rocket; the shooter gets the rocket-jump kick and a reduced self hit
  K.onFx('boom', (d) => {
    const p = fin3(d.p);
    if (!p) return;
    const i = proj.findIndex((q) => q.rid === d.rid);
    if (i >= 0) removeProj(proj[i]);
    K.ring(p, 0xffb040, 0.4, d.R || 4, 0.35);
    K.burst(p, 'sparks', null, 2);
    const me = g.player;
    if (d.by !== g.selfId || me.dead) return;
    const ctr = me.pos.clone().setY(me.pos.y + 0.9), to = ctr.sub(p), dist = to.length();
    if (dist > (d.R || 4)) return;
    const f = 1 - clamp(dist / (d.R || 4), 0, 1);
    const nrm = dist > 0.05 ? to.divideScalar(dist) : new THREE.Vector3(0, 1, 0), k = 15 * f;
    me.vel.x += nrm.x * k * 0.75; me.vel.z += nrm.z * k * 0.75;
    me.vel.y = Math.min(12.5, Math.max(me.vel.y, 0) + Math.max(nrm.y, 0.35) * k * 1.05);
    me.grounded = false;
    const dmg = Math.round(28 * f * (d.kind === 'rocket' ? 1 : 0.7));               // enemies take ~3x this at the same spot
    if (dmg > 0) g.damageLocal(Math.min(dmg, Math.max(0, me.hp - 1)), 'explosion', p);   // a rocket jump never kills you
    g.engine.shake(0.5);
  });

  // ---------------------------------------------------------------- GRAV-TOOL (LMB grab / hold, RMB punt)
  const GT = { it: null, cid: null, t0: 0, puntNext: false, cd: 0, aimT: 0, flying: new Map() };
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.85, fog: false }));
  beam.frustumCulled = false; beam.visible = false; g.scene.add(beam);
  const findItem = (eye, dir, range) => {
    let best = null, bs = -1;
    for (const it of g.items.all()) {
      if (it.state !== 'world' || !it.body || it.ladder || it.carrier || it.holder || (it.owner && it.owner !== g.selfId)) continue;
      it.obj.getWorldPosition(tmp);
      const to = tmp.clone().sub(eye), d = to.length();
      if (d > range || d < 0.5) continue;
      const dot = to.divideScalar(d).dot(dir);
      if (dot < 0.95 || !g.physics.lineOfSight(eye, tmp, G.STATIC | G.DOOR)) continue;
      const s = dot * 2 - d / range;
      if (s > bs) { bs = s; best = it; }
    }
    return best;
  };
  const findCreature = (eye, dir, range) => {
    const r = g.creatures.raycast(eye, dir, range);
    const v = r?.view;
    if (!v || v.hidden || v.def?.boss || v.def?.hazard || (v.def?.hp ?? 999) > 200 || (v.radius || 0.5) > 1) return null;
    return v;
  };
  function gravPress(it) {
    if (GT.it || GT.cid) return;
    const { eye, dir } = K.eye(), range = it.def.reach;
    const item = findItem(eye, dir, range);
    if (item) { g.net.request('grab', { id: item.id }); GT.it = item; GT.t0 = g.time; GT.puntNext = false; K.snd('cb_grav', null, 0.6); return; }
    const v = findCreature(eye, dir, 12);
    if (v) { g.net.request('cbgrav', { op: 'cgrab', cid: v.id }); GT.cid = v.id; GT.t0 = g.time; GT.aimT = 0; K.snd('cb_grav', null, 0.6); return; }
    K.snd('cb_empty', null, 0.4);
  }
  function releaseItem(vel) {
    const it = GT.it;
    GT.it = null; GT.puntNext = false;
    if (!it || !it.body || it.owner !== g.selfId) return;
    const tr = it.body.translation(), r = it.body.rotation(), lv = vel || it.body.linvel(), av = it.body.angvel();
    g.net.request('release', { id: it.id, p: [tr.x, tr.y, tr.z], q: [r.x, r.y, r.z, r.w], lv: [lv.x, lv.y, lv.z], av: [av.x, av.y, av.z] });
  }
  function launchItem() {
    const it = GT.it;
    if (!it?.body || it.owner !== g.selfId) return false;
    const mass = it.def.mass ?? Math.max(0.5, (it.def.weight || 5) * 0.2);
    const sp = clamp(30 / Math.max(1, Math.sqrt(mass / 3)), 9, 30), dir = fwdOf();
    const v = { x: dir.x * sp, y: dir.y * sp + 1.2, z: dir.z * sp };
    it.body.setLinvel(v, true);
    it.body.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 }, true);
    it.impactCooldown = 0.5;
    GT.flying.set(it.id, { until: g.time + 1.6, hit: new Set() });
    releaseItem(v);
    GT.cd = g.time + 1.0;
    K.snd('cb_punt', null, 0.9); g.engine.punch?.(0.05, 0, 0); g.engine.shake(0.2);
    return true;
  }
  K.onRmb((it) => {
    if (it?.def?.cfire !== 'grav') return false;
    if (g.time < GT.cd) return true;
    const { eye, dir } = K.eye();
    if (GT.it) { if (!launchItem()) GT.puntNext = true; return true; }
    if (GT.cid) { g.net.request('cbgrav', { op: 'punt', d: arr3(dir) }); GT.cid = null; GT.cd = g.time + 1.0; K.snd('cb_punt', null, 0.9); g.engine.shake(0.2); return true; }
    const item = findItem(eye, dir, 9);
    if (item) { g.net.request('grab', { id: item.id }); GT.it = item; GT.t0 = g.time; GT.puntNext = true; return true; }
    const v = findCreature(eye, dir, 9);
    if (v) { g.net.request('cbgrav', { op: 'cgrab', cid: v.id }); g.net.request('cbgrav', { op: 'punt', d: arr3(dir) }); GT.cd = g.time + 1.0; K.snd('cb_punt', null, 0.9); return true; }
    return true;
  });
  function gravTick(dt) {
    const it = held(), holding = it?.def?.cfire === 'grav' && !g.player.dead;
    if (!holding && (GT.it || GT.cid)) { if (GT.cid) g.net.request('cbgrav', { op: 'drop' }); releaseItem(); GT.cid = null; }
    if (holding && GT.it) {
      const item = GT.it;
      if (item.state !== 'world' || g.items.get(item.id) !== item) { GT.it = null; }
      else if (!g.input.mouseDown(0) && !GT.puntNext) releaseItem();
      else if (item.owner === g.selfId && item.body) {
        const { eye, dir } = K.eye(), target = eye.clone().addScaledVector(dir, 3.4);
        if (GT.puntNext) { GT.puntNext = false; launchItem(); }
        else {
          const tr = item.body.translation(), lv = item.body.linvel(), av = item.body.angvel();
          const dv = new THREE.Vector3(target.x - tr.x, target.y - tr.y, target.z - tr.z).multiplyScalar(10);
          if (dv.length() > 14) dv.setLength(14);
          const k = Math.min(1, dt * 10);
          item.body.setLinvel({ x: lv.x + (dv.x - lv.x) * k, y: lv.y + (dv.y - lv.y) * k, z: lv.z + (dv.z - lv.z) * k }, true);
          item.body.setAngvel({ x: av.x * 0.9, y: av.y * 0.9, z: av.z * 0.9 }, true);
          item.impactCooldown = Math.max(item.impactCooldown || 0, 0.3);
          if (Math.hypot(target.x - tr.x, target.y - tr.y, target.z - tr.z) > 22) releaseItem();
          else { const a = muzzleOf(dir).toArray(); const pos = beam.geometry.attributes.position; pos.setXYZ(0, a[0], a[1], a[2]); pos.setXYZ(1, tr.x, tr.y, tr.z); pos.needsUpdate = true; beam.visible = true; }
        }
      } else if (g.time - GT.t0 > 1.5) { GT.it = null; GT.puntNext = false; }
    } else if (holding && GT.cid) {
      const v = g.creatures.views.get(GT.cid);
      if (!v || v.state === 'dead' || !g.input.mouseDown(0)) { g.net.request('cbgrav', { op: 'drop' }); GT.cid = null; }
      else {
        const { eye, dir } = K.eye(), target = eye.clone().addScaledVector(dir, 3.2);
        GT.aimT -= dt;
        if (GT.aimT <= 0) { GT.aimT = 0.1; g.net.request('cbgrav', { op: 'aim', to: arr3(target) }); }
        const a = muzzleOf(dir).toArray(), pos = beam.geometry.attributes.position;
        pos.setXYZ(0, a[0], a[1], a[2]); pos.setXYZ(1, v.pos.x, v.pos.y + (v.height || 1) * 0.5, v.pos.z); pos.needsUpdate = true; beam.visible = true;
      }
    }
    if (!GT.it && !GT.cid) beam.visible = false;
    // punted junk hurts what it hits
    for (const [id, f] of GT.flying) {
      const item = g.items.get(id);
      if (!item?.body || g.time > f.until) { GT.flying.delete(id); continue; }
      const lv = item.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp < 8) continue;
      item.obj.getWorldPosition(tmp);
      for (const v of g.creatures.views.values()) {
        if (v.state === 'dead' || v.hidden || f.hit.has(v.id)) continue;
        const ctr = v.pos.clone().setY(v.pos.y + Math.min(v.height || 1, 2) * 0.5);
        if (ctr.distanceTo(tmp) > (v.radius || 0.5) + 0.55) continue;
        f.hit.add(v.id);
        g.net.request('cbgrav', { op: 'ihit', id, cid: v.id, sp: +sp.toFixed(1) });
        g.hitstopT = Math.max(g.hitstopT || 0, 0.05);
      }
    }
  }
  // host side of the grav tool
  const grabs = new Map();      // holder peer -> { cid, to, t0 }
  K.hostOn('cbgrav', (d, from) => {
    const st = grabs.get(from), sp = K.posOf(from);
    if (d?.op === 'cgrab') {
      const c = g.creatures.host.get(d.cid);
      if (!c || c.dead || !movable(c) || (c.maxHp ?? 999) > 260 || (sp && sp.distanceTo(c.pos) > 16)) return;
      for (const [k, v] of grabs) if (v.cid === c.id) grabs.delete(k);
      grabs.set(from, { cid: c.id, to: c.pos.clone().setY(c.pos.y + 1), t0: g.time, y0: c.pos.y });
      K.stun(c, 0.5, from);
    } else if (d?.op === 'aim' && st) {
      const to = fin3(d.to);
      if (to && (!sp || to.distanceTo(sp) < 7)) st.to.copy(to);
    } else if (d?.op === 'drop') grabs.delete(from);
    else if (d?.op === 'punt') {
      const dir = fin3(d.d);
      const s2 = st || null;
      if (!s2 || !dir) { grabs.delete(from); return; }
      const c = g.creatures.host.get(s2.cid);
      grabs.delete(from);
      if (c && !c.dead) { const L = Math.hypot(dir.x, dir.z) || 1; K.fling(c, (dir.x / L) * 24, (dir.z / L) * 24, from, { slam: 26, life: 1.1 }); K.stun(c, 1.4, from); K.fx('slam', { p: arr3(K.ctrOf(c)) }); }
    } else if (d?.op === 'ihit') {
      const it = g.items.get(d.id), c = g.creatures.host.get(d.cid);
      if (!it || !c || c.dead || (it.lastHolder !== from && it.owner !== from)) return;
      const spd = clamp(Number(d.sp) || 0, 0, 45), key = `${it.id}|${c.id}`, now = g.time;
      hostIHit.set(key, hostIHit.get(key) ?? -9);
      if (now - hostIHit.get(key) < 0.6 || spd < 7) return;
      hostIHit.set(key, now);
      const ip = it.obj.position;
      if (Math.hypot(ip.x - c.pos.x, ip.z - c.pos.z) > 9) return;
      K.hurt(c, clamp(4 + (it.def.weight || 4) * spd * 0.12, 3, 45), from, { stun: 0.6 });
    }
  });
  const hostIHit = new Map();
  K.update((dt) => {
    if (!g.isHost) return;
    for (const [from, s] of grabs) {
      const c = g.creatures.host.get(s.cid);
      if (!c || c.dead || g.time - s.t0 > 7) { grabs.delete(from); continue; }
      const nav = g.creatures.nav(c);
      const nx = c.pos.x + (s.to.x - c.pos.x) * Math.min(1, dt * 8), nz = c.pos.z + (s.to.z - c.pos.z) * Math.min(1, dt * 8);
      if (!nav || nav.walkableAt(nx, nz)) g.creatures.placeAt(c, nx, nz);
      c.pos.y = Math.max(c.pos.y, s.to.y - 0.7);
      c.path = null; c.dest = null;
      s.stunT = (s.stunT || 0) - dt;
      if (s.stunT <= 0) { s.stunT = 0.25; K.stun(c, 0.5, from); }
    }
    if (hostIHit.size > 200) hostIHit.clear();
  });

  return {
    projectiles: proj, reloading: () => !!reload,
    dispose() { for (const p of [...proj]) removeProj(p); ammoBox.remove(); beam.removeFromParent(); beam.geometry.dispose(); beam.material.dispose(); },
  };
}
