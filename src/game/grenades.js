// TFG wave 2 - GRENADES (docs/wave2/grenades.md). Module `grenades`, installed by game.js with
//   this.useModule('grenades', installGrenades);
//
// One throwing system for every bomb: hold LMB to aim (dotted arc with the predicted bounce), release to throw (harder with a longer
// hold, cooking past full power shortens the fuse), the ball bounces / rolls / sticks with the same simulation on every peer, beeps
// while the fuse burns and the HOST detonates it. Existing grenades (stun, cryo, molotov, EMP, crafted decoy) ride the same path.
// New: flashbang, smoke, decoy beacon, sticky charge (store + crafting) and the RARE bombs (gravity well, blackout, confetti, glitch,
// cluster: chest / boss / world drops only).
//
// Net (all names start with 'gr'): request `grth` {op:'throw'} client -> host; broadcast `grfx` host -> everyone with sub type k:
//   th (a ball was thrown), sk (a sticky charge stuck), bm (boom), dz (decoy pulse), ge (gravity / glitch end).
// Shared-file hooks: none beyond the two game.js slot lines. Everything else is an instance-level wrap restored in dispose():
//   game.useHeldPress / game.dropHeld (LMB + throw key), game.hostOnCreatureKilled (rare drops), creatures.canSee / speedMul / attack
//   (smoke, blackout, blinded creatures), lights.groupFactor (blackout kills lights: LightPool intensity, never the light count),
//   player.update (confetti dance root). HOST_ONLY gets 'grfx' added at runtime.
import * as THREE from 'three';
import { ITEMS, registerItem } from './items.js';
import { RECIPES } from './recipes.js';
import { addTranslations, t } from '../core/i18n.js';
import { G } from '../physics/physics.js';
import { insideShip } from '../world/ship.js';
import { hudDock } from '../ui/dock.js';
import { HOST_ONLY } from '../net/session.js';
import { EMOTE_BY_ID } from './emotes.js';
import { synth, sin, ex, nz, clamp, fin3, arr3, movable } from './combat_kit.js';
import { GRENADE_MODELS, createBallMesh } from '../models/grenades.js';
import * as C from './grenades_core.js';

const { KINDS, THROW } = C;

// ================================================================================================== item data + recipes + text
const BLURB = {
  flash: 'Blinds and stuns creatures in sight for 3-4 s and makes them lose track of you. Look away, or it whites you out too.',
  smoke: 'A thick cloud for 20 s. Creatures cannot see through it and lose sight-based aggro.',
  decoy: 'Plays fake footsteps and voices for 10 s. Pulls sound-hunting creatures to it.',
  sticky: 'Sticks to walls and creatures. 2.5 s fuse, huge damage. Do not stand close.',
  gravity: 'Pulls creatures and loose items into a point for 4 s. Throw it at your feet to reel loot in.',
  blackout: 'Kills every light in a wide radius for 20 s. Creatures that love the dark get stronger, the rest lose you.',
  confetti: 'A party blast: stuns partygoer-types, makes everyone nearby dance for 2 s. Harmless. Hilarious.',
  glitch: 'Creatures in the blast freeze like a paused video for 6 s, then take a burst of damage.',
  cluster: 'Bursts into 5 mini-bombs that bounce around and explode.',
  stun: 'Flash and bang. Stuns creatures in sight for 5 s.',
  cryo: 'Silent blast of cold. Freezes creatures in 5 m for 5 s.',
  molotov: 'Bursts into flames that burn creatures for 6 s.',
  emp: 'Shuts down turrets, mines and machines for 20 s.',
};
function registerItems() {
  for (const [kind, d] of Object.entries(KINDS)) {
    if (!d.item) continue;
    if (d.legacy) {
      const def = ITEMS[d.item];
      if (def) { def.grenade = kind; def.tip = BLURB[kind]; def.throwable = true; }
      continue;
    }
    if (ITEMS[d.item]) continue;
    registerItem({
      id: d.item, name: d.name, kind: 'consumable', hands: 1, weight: d.rare ? 1.5 : 1, throwable: true, grenade: kind,
      tier: d.tier, rarity: d.tier, charges: d.stack || 1, blurb: BLURB[kind], tip: BLURB[kind],
      ...(d.price ? { price: d.price, shop: 'consumables' } : { noShop: true, rare: true }),
    });
  }
}
registerItems();

const CRAFT = [
  ['flashbang', 'Flashbang (x3)', 'flashbang', [['comp_circuit', 1], ['comp_chem', 1], ['comp_battery', 1]], 1.8, 'Three flashbangs. Blinds and stuns creatures in sight for 3-4 s.'],
  ['smokegrenade', 'Smoke Grenade (x2)', 'smokegrenade', [['comp_chem', 2], ['comp_cloth', 1]], 1.6, 'Two smoke grenades. 20 s of cover.'],
  ['decoybeacon', 'Decoy Beacon (x2)', 'decoybeacon', [['comp_circuit', 1], ['comp_cable', 1], ['comp_battery', 1]], 1.8, 'Two beacons that fake footsteps and voices for 10 s.'],
  ['stickycharge', 'Sticky Charge (x2)', 'stickycharge', [['comp_fuel', 1], ['comp_chem', 1], ['comp_scrapmetal', 1]], 2.2, 'Two adhesive charges. 2.5 s fuse, big damage.'],
];
for (const [id, name, out, inn, time, desc] of CRAFT) {
  if (!RECIPES.some((r) => r.id === id)) RECIPES.push({ id, name, cat: 'combat', out, n: 1, in: inn, tier: null, time, desc });
}

const TR = {
  'Flashbang': 'Flaş Bombası', 'Smoke Grenade': 'Sis Bombası', 'Decoy Beacon': 'Tuzak Verici', 'Sticky Charge': 'Yapışkan Yük', 'Gravity Well': 'Kütleçekim Kuyusu',
  'Blackout Bomb': 'Karartma Bombası', 'Confetti Bomb': 'Konfeti Bombası', 'Glitch Bomb': 'Glitch Bombası', 'Cluster Bomb': 'Misket Bombası', 'Mini Bomb': 'Mini Bomba',
  'Flashbang (x3)': 'Flaş Bombası (x3)', 'Smoke Grenade (x2)': 'Sis Bombası (x2)', 'Decoy Beacon (x2)': 'Tuzak Verici (x2)', 'Sticky Charge (x2)': 'Yapışkan Yük (x2)',
  'Hold LMB to aim, release to throw': 'Sol tık basılı: nişan, bırak: fırlat',
  'Blinds and stuns creatures in sight for 3-4 s and makes them lose track of you. Look away, or it whites you out too.': 'Görüş alanındaki yaratıkları 3-4 sn kör edip sersemletir, seni takip etmeyi bıraktırır. Başını çevir, yoksa seni de beyaza boğar.',
  'A thick cloud for 20 s. Creatures cannot see through it and lose sight-based aggro.': '20 sn kalın bir sis bulutu. Yaratıklar içinden göremez, görüşe dayalı takibi kaybeder.',
  'Plays fake footsteps and voices for 10 s. Pulls sound-hunting creatures to it.': '10 sn boyunca sahte ayak sesi ve konuşma çalar. Ses avcısı yaratıkları kendine çeker.',
  'Sticks to walls and creatures. 2.5 s fuse, huge damage. Do not stand close.': 'Duvara ve yaratıklara yapışır. 2.5 sn fitil, çok büyük hasar. Yakında durma.',
  'Pulls creatures and loose items into a point for 4 s. Throw it at your feet to reel loot in.': 'Yaratıkları ve yerdeki eşyaları 4 sn bir noktaya çeker. Ganimeti toplamak için ayağına at.',
  'Kills every light in a wide radius for 20 s. Creatures that love the dark get stronger, the rest lose you.': 'Geniş bir alandaki tüm ışıkları 20 sn söndürür. Karanlığı sevenler güçlenir, diğerleri seni kaybeder.',
  'A party blast: stuns partygoer-types, makes everyone nearby dance for 2 s. Harmless. Hilarious.': 'Parti patlaması: partici tipleri sersemletir, yakındaki herkesi 2 sn dans ettirir. Zararsız. Komik.',
  'Creatures in the blast freeze like a paused video for 6 s, then take a burst of damage.': 'Patlamadaki yaratıklar 6 sn duraklatılmış video gibi donar, sonra ani hasar alır.',
  'Bursts into 5 mini-bombs that bounce around and explode.': '5 mini bombaya bölünür; zıplayıp patlarlar.',
  'Flash and bang. Stuns creatures in sight for 5 s.': 'Flaş ve gürültü. Görüşteki yaratıkları 5 sn sersemletir.',
  'Silent blast of cold. Freezes creatures in 5 m for 5 s.': 'Sessiz bir soğuk patlaması. 5 m içindeki yaratıkları 5 sn dondurur.',
  'Bursts into flames that burn creatures for 6 s.': 'Alev alır; yaratıkları 6 sn yakar.',
  'Shuts down turrets, mines and machines for 20 s.': 'Taret, mayın ve makineleri 20 sn kapatır.',
  'COOKING': 'FİTİL KISALIYOR', 'Blinded!': 'Kör oldun!', 'DANCE!': 'DANS!', 'Rare bomb': 'Nadir bomba',
};
addTranslations(TR);

// ================================================================================================== procedural sounds
const SOUNDS = {
  gr_beep: (sr) => synth(sr, 0.07, (tt) => sin(2400, tt) * ex(tt, 40)),
  gr_pin: (sr) => synth(sr, 0.16, (tt) => (nz() * 0.5 + sin(3100 - tt * 6000, tt)) * ex(tt, 28)),
  gr_tink: (sr) => synth(sr, 0.14, (tt) => (sin(1900, tt) + sin(2870, tt) * 0.5) * ex(tt, 34) + nz() * ex(tt, 150) * 0.2),
  gr_thud: (sr) => synth(sr, 0.2, (tt) => sin(110 + 90 * ex(tt, 25), tt) * ex(tt, 20) + nz() * ex(tt, 90) * 0.4),
  gr_bang: (sr) => { let lp = 0; return synth(sr, 0.9, (tt) => { lp += (nz() - lp) * 0.35; return lp * ex(tt, 7) * 1.3 + sin(70 + 120 * ex(tt, 25), tt) * ex(tt, 10) + sin(3400, tt) * ex(tt, 3) * 0.25; }); },
  gr_ring: (sr) => synth(sr, 4.2, (tt) => (sin(3100, tt) * 0.6 + sin(4650, tt) * 0.3 + sin(6200, tt) * 0.15) * Math.min(1, tt * 40) * Math.exp(-tt * 0.7)),
  gr_hiss: (sr) => { let lp = 0; return synth(sr, 1.6, (tt) => { lp += (nz() - lp) * 0.5; return lp * Math.min(1, tt * 12) * ex(tt, 1.6); }); },
  gr_grav: (sr) => synth(sr, 1.2, (tt) => sin(90 - 40 * tt, tt) * 0.7 + sin(180 + 300 * tt, tt) * 0.3 * tt + nz() * 0.05),
  gr_collapse: (sr) => synth(sr, 0.7, (tt) => sin(55 * ex(tt, 3) + 25, tt) * ex(tt, 5) + nz() * ex(tt, 18) * 0.5),
  gr_dark: (sr) => synth(sr, 1.1, (tt) => sin(700 * ex(tt, 3.2) + 40, tt) * ex(tt, 2.4) + nz() * ex(tt, 22) * 0.3),
  gr_party: (sr) => synth(sr, 1.1, (tt) => nz() * ex(tt, 60) * 0.9 + [0, 0.07, 0.15, 0.24, 0.34].reduce((a, t0, i) => a + (tt >= t0 ? sin(1100 + i * 330, tt - t0) * ex(tt - t0, 14) * 0.5 : 0), 0)),
  gr_glitch: (sr) => synth(sr, 0.9, (tt) => { const q = Math.floor(tt * 90); const f = 300 + ((q * 7919) % 1400); return (Math.sin(6.2832 * f * tt) > 0 ? 1 : -1) * 0.5 * ex(tt, 3) * ((q % 3) ? 1 : 0.2) + nz() * 0.15 * ex(tt, 4); }),
};

// ================================================================================================== install
export function installGrenades(game) {
  const g = game, mm = game.mods;
  const offs = [], undo = [], anims = [];
  let disposed = false, seq = 0;
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  const on = (ev, fn) => { const off = mm?.on?.(ev, fn); if (off) offs.push(off); };
  const safe = (label, fn) => { try { return fn(); } catch (e) { if (!safe.w) safe.w = new Set(); if (!safe.w.has(label)) { safe.w.add(label); console.warn('[grenades] ' + label, e); } } };
  function wrap(obj, name, make) {
    const raw = obj?.[name];
    if (typeof raw !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name);
    const mine = make(raw.bind(obj));
    obj[name] = mine;
    undo.push(() => { if (obj[name] === mine) { if (had) obj[name] = raw; else delete obj[name]; } });
  }
  if (mm?.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mm.soundGens.has(n)) mm.soundGens.set(n, fn);
  if (mm?.itemModels) for (const [id, fn] of Object.entries(GRENADE_MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn());

  const snd = (name, pos, vol = 1, pitch, opts = {}) => {
    try {
      mm?.ensureSound?.(name);
      if (pos) g.audio.at(name, pos, vol, { refDistance: opts.ref ?? 4, maxDistance: opts.max ?? 60, pitch, occlude: opts.occlude !== false });
      else g.audio.play(name, { volume: vol, bus: opts.bus || 'sfx', pitch });
    } catch { /* audio not ready */ }
  };
  const toast = (s, kind) => g.ui?.toast?.(t(s), kind);
  const ctrOf = (c) => new THREE.Vector3(c.pos.x, c.pos.y + Math.min(c.def?.height || 1.2, 2.4) * 0.5, c.pos.z);
  const noise = (pos, amt) => { if (!(amt > 0)) return; if (g.balance?.noise) g.balance.noise(pos, amt); else g.creatures?.noise?.(pos, amt); };

  // ---------------------------------------------------------------- world ray for the ball simulation (static world + doors)
  const rO = { x: 0, y: 0, z: 0 }, rD = { x: 0, y: 0, z: 0 };
  const ray = (ox, oy, oz, dx, dy, dz, len) => {
    rO.x = ox; rO.y = oy; rO.z = oz; rD.x = dx; rD.y = dy; rD.z = dz;
    const h = g.physics.raycast(rO, rD, len, G.STATIC | G.DOOR);
    return h ? { distance: h.distance, nx: h.normal?.x ?? 0, ny: h.normal?.y ?? 0, nz: h.normal?.z ?? 0 } : null;
  };

  // ---------------------------------------------------------------- tiny unlit VFX toolkit (never adds a scene light)
  const anim = (dur, upd, end) => { anims.push({ t: 0, dur, upd, end }); };
  const addMesh = (geo, color, opacity = 0.6, extra = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, ...extra }));
    m.frustumCulled = false; g.scene.add(m);
    return m;
  };
  const killMesh = (m) => { if (!m) return; m.removeFromParent(); m.geometry?.dispose?.(); m.material?.dispose?.(); };
  const ringFx = (pos, color, r0, r1, dur, flat = true) => {
    const m = addMesh(new THREE.RingGeometry(0.85, 1, 32), color, 0.75);
    m.position.copy(pos); if (flat) m.rotation.x = -Math.PI / 2;
    anim(dur, (u) => { m.scale.setScalar(r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2))); m.material.opacity = 0.75 * (1 - u); }, () => killMesh(m));
  };
  const sphereFx = (pos, color, r0, r1, dur, opacity = 0.5) => {
    const m = addMesh(new THREE.SphereGeometry(1, 12, 8), color, opacity);
    m.position.copy(pos);
    anim(dur, (u) => { m.scale.setScalar(r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2))); m.material.opacity = opacity * (1 - u); }, () => killMesh(m));
  };
  const burst = (pos, preset, mul = 1) => g.particles?.burst(pos, preset, null, mul);
  const shake = (pos, amt, range = 20) => { const d = pos.distanceTo(g.camera.position); if (d < range) g.engine.shake(amt * (1 - d / range)); };

  // ================================================================================================== balls (every peer simulates the same flight)
  const balls = new Map();
  function makeBallObj(kind, gid, by, o, v, fuse) {
    const def = KINDS[kind];
    const mesh = createBallMesh(kind, def.color);
    mesh.position.copy(o); g.scene.add(mesh);
    const b = { gid, kind, def, by, y0: o.y, p: C.makeBall(o, v, { sticky: !!def.sticky }), fuse, mesh, age: 0, stickT: -1, beepT: 0.12, ledT: 0, cid: null, off: null, spin: Math.random() * 6 };
    balls.set(gid, b);
    return b;
  }
  function removeBall(b) {
    balls.delete(b.gid);
    if (b.mesh) { b.mesh.removeFromParent(); b.mesh.userData.dispose?.(); b.mesh = null; }
  }
  function onThrowMsg(d) {
    const o = fin3(d.o), v = fin3(d.v);
    if (!o || !v || !KINDS[d.ty] || balls.has(d.gid)) return;
    if (balls.size > 40) return;
    makeBallObj(d.ty, d.gid, d.by, o, v, clamp(Number(d.f) || KINDS[d.ty].fuse, 0.3, 6));
  }
  function ballEvent(b, ev) {
    if (ev.stick) {
      b.stickT = 0;
      snd('gr_thud', tmpA.set(ev.x, ev.y, ev.z), 0.8, 1.1, { ref: 3 });
      if (g.isHost) g.net.broadcast('grfx', { k: 'sk', gid: b.gid, p: arr3(tmpA.set(ev.x, ev.y, ev.z)), n: arr3(tmpB.set(ev.nx, ev.ny, ev.nz)) });
    } else if (ev.bounce && ev.speed > 1.4) snd('gr_tink', tmpA.set(ev.x, ev.y, ev.z), clamp(ev.speed / 8, 0.15, 0.8), 0.85 + Math.random() * 0.3, { ref: 3 });
  }
  function ballClock(b) { return b.def.sticky ? b.stickT : b.age; }
  function updateBalls(dt) {
    for (const b of [...balls.values()]) {
      const p = b.p;
      b.age += dt;
      if (b.cid) {
        const v = g.creatures.views.get(b.cid);
        if (v && b.off) { p.x = v.pos.x + b.off.x; p.y = v.pos.y + b.off.y; p.z = v.pos.z + b.off.z; }
        b.stickT += dt;
      } else if (!p.stuck && !p.rest) C.advanceBall(p, dt, ray, (ev) => ballEvent(b, ev));
      else if (p.stuck) b.stickT += dt;
      // sticky charge meets a creature (host decides; everyone follows the 'sk' message)
      if (g.isHost && b.def.sticky && !p.stuck && !b.cid && b.age > 0.05) safe('stick', () => {
        for (const c of g.creatures.host.values()) {
          if (c.dead || c.type === 'web') continue;
          const r = (c.def?.radius || 0.5) + 0.16, h = Math.min(c.def?.height || 1.2, 3);
          if (p.y < c.pos.y - 0.15 || p.y > c.pos.y + h + 0.15 || Math.hypot(p.x - c.pos.x, p.z - c.pos.z) > r) continue;
          p.stuck = true; p.vx = p.vy = p.vz = 0; b.cid = c.id; b.stickT = 0;
          b.off = new THREE.Vector3(p.x - c.pos.x, p.y - c.pos.y, p.z - c.pos.z);
          snd('gr_thud', tmpA.set(p.x, p.y, p.z), 0.8, 1.3, { ref: 3 });
          g.net.broadcast('grfx', { k: 'sk', gid: b.gid, cid: c.id, off: arr3(b.off) });
          break;
        }
      });
      const m = b.mesh;
      if (m) {
        m.position.set(p.x, p.y, p.z);
        if (p.stuck && !b.cid) m.quaternion.setFromUnitVectors(tmpA.set(0, -1, 0), tmpB.set(-p.sx, -p.sy, -p.sz));
        else if (!p.stuck && !p.rest) { b.spin += dt * 9; m.rotation.x += p.vz * dt * 3; m.rotation.z -= p.vx * dt * 3; m.rotation.y += dt * 4; }
        // fuse beeps + LED
        const clock = ballClock(b), armed = clock >= 0;
        if (armed) {
          const left = b.fuse - clock;
          b.beepT -= dt;
          if (b.beepT <= 0 && left > -0.2) {
            const prog = 1 - clamp(left / b.fuse, 0, 1);
            snd('gr_beep', m.position, 0.55, 0.9 + prog * 0.6, { ref: 3, max: 40 });
            b.ledT = 0.07; b.beepT = C.beepInterval(left, b.fuse);
          }
        }
        b.ledT -= dt;
        const led = m.userData.led;
        if (led) led.visible = b.ledT > 0 || (!armed && Math.sin(b.age * 10) > 0.6);
      }
      if (g.isHost) {
        const clock = ballClock(b);
        if (clock >= b.fuse || b.age > b.fuse + 7) safe('boom', () => hostBoom(b));
        else if (p.y < b.y0 - 80) { removeBall(b);   // fell out of the world (the facility itself sits at y = -300, so this is relative to the throw)
          g.net.broadcast('grfx', { k: 'bm', gid: b.gid, ty: b.kind, dud: 1, p: [p.x, p.y, p.z] }); }
      } else if (b.age > b.fuse + 9) removeBall(b);
    }
  }

  // ================================================================================================== throw controller (local player)
  const hud = hudDock('bottom', 'grenade', 8);
  hud.style.cssText = 'display:none;font-family:var(--font);font-size:18px;color:#ffe7c4;text-shadow:0 0 6px #000;letter-spacing:1px;text-align:center';
  const hudText = document.createElement('div');
  const barBox = document.createElement('div');
  barBox.style.cssText = 'width:170px;height:7px;margin:4px auto 0;border:1px solid rgba(255,200,120,.55);background:rgba(0,0,0,.55);display:none';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'height:100%;width:0;background:linear-gradient(90deg,#ffe07a,#ff8a3d)';
  barBox.appendChild(barFill);
  const hudHint = document.createElement('div');
  hudHint.style.cssText = 'font-size:13px;opacity:.7';
  hud.append(hudText, barBox, hudHint);
  let hudKey = '';

  const cook = { it: null, kind: null, t: 0, beepT: 0 };
  let throwCd = 0;
  const held = () => g.player?.heldItem?.() || null;
  const kindOf = (it) => (it && !it.inv ? C.kindOfItem(it.type) : null);
  const canAct = () => !g.player.dead && g.input.enabled && !g.cruiser?.seated && !g.emotes?.active && !g.minigame && !g.ui?.blocksInput?.();

  // dotted arc preview: a fixed pool of points (round sprite texture) + a landing ring
  const DOTS = 46;
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const dotGeo = new THREE.BufferGeometry();
  const dotPos = new Float32Array(DOTS * 3), dotCol = new Float32Array(DOTS * 3);
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3));
  dotGeo.setDrawRange(0, 0);
  const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 0.16, sizeAttenuation: true, vertexColors: true, map: dotTex, transparent: true, depthWrite: false, alphaTest: 0.05, fog: false }));
  dots.frustumCulled = false; dots.visible = false; dots.renderOrder = 9; g.scene.add(dots);
  const landing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  landing.frustumCulled = false; landing.visible = false; landing.renderOrder = 9; g.scene.add(landing);
  const BOUNCE_COL = [[1, 0.95, 0.7], [1, 0.62, 0.25], [0.8, 0.35, 0.2], [0.6, 0.25, 0.2]];

  function aimVectors() {
    const eye = g.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion), down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.camera.quaternion);
    let o = eye.clone().addScaledVector(dir, 0.42).addScaledVector(right, 0.2).addScaledVector(down, 0.14);
    const to = o.clone().sub(eye), L = to.length();
    const hit = g.physics.raycast(eye, to.clone().divideScalar(L), L, G.STATIC | G.DOOR);
    if (hit) o = eye.clone().addScaledVector(to.divideScalar(L), Math.max(0.05, hit.distance - 0.12));
    return { eye, dir, o };
  }
  function velFor(dir, hold) {
    const pv = g.player.vel;
    const v = C.throwVelocity(dir, C.throwPower(hold), { x: pv.x, z: pv.z });
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  function drawPreview(kind, hold) {
    const def = KINDS[kind];
    const { dir, o } = aimVectors();
    const v = velFor(dir, hold);
    const fuse = C.fuseAfterCook(kind, C.cookTime(hold));
    const arc = C.predictArc(o, v, ray, { sticky: !!def.sticky, maxT: Math.min(3.2, def.sticky ? 3.2 : fuse) });
    const n = Math.min(DOTS, arc.pts.length);
    for (let i = 0; i < n; i++) {
      const pt = arc.pts[i], c = BOUNCE_COL[Math.min(pt[3], BOUNCE_COL.length - 1)];
      dotPos[i * 3] = pt[0]; dotPos[i * 3 + 1] = pt[1]; dotPos[i * 3 + 2] = pt[2];
      const fade = 1 - (i / Math.max(1, n)) * 0.45;
      dotCol[i * 3] = c[0] * fade; dotCol[i * 3 + 1] = c[1] * fade; dotCol[i * 3 + 2] = c[2] * fade;
    }
    dotGeo.setDrawRange(0, n); dotGeo.attributes.position.needsUpdate = true; dotGeo.attributes.color.needsUpdate = true;
    dots.visible = true;
    landing.position.set(arc.end.x, arc.end.y - 0.06, arc.end.z);
    landing.rotation.x = -Math.PI / 2;
    landing.material.color.setHex(def.color || 0xffffff);
    landing.scale.setScalar(def.R ? clamp(def.R * 0.12, 0.5, 1.4) : 0.8);
    landing.visible = true;
  }
  function hidePreview() { dots.visible = false; landing.visible = false; }

  function startCook(it, kind) {
    if (cook.it || g.time < throwCd || !canAct()) return;
    cook.it = it; cook.kind = kind; cook.t = 0; cook.beepT = 0;
    snd('gr_pin', null, 0.7, 1, { bus: 'sfx' });
  }
  function cancelCook() { cook.it = null; cook.kind = null; hidePreview(); barBox.style.display = 'none'; }
  function doThrow(it, kind, hold) {
    const { dir, o } = aimVectors();
    const v = velFor(dir, hold);
    const ck = C.cookTime(hold);
    g.net.request('grth', { id: it.id, o: arr3(o), v: arr3(v), ck: +ck.toFixed(2) });
    if (!g.isHost && (it.charges ?? 1) > 1) it.charges -= 1;      // predicted stack count (the host confirms with itst)
    throwCd = g.time + THROW.cooldown;
    g.swingAnim = 0.6;
    g.engine.punch?.(0.025, 0, 0);
    snd('item_throw', null, 0.6);
  }
  function releaseThrow() {
    const it = cook.it, kind = cook.kind, hold = cook.t;
    cancelCook();
    if (it && held() === it) doThrow(it, kind, hold);
  }
  wrap(g, 'useHeldPress', (orig) => function () {
    const it = held(), kind = kindOf(it);
    if (kind && !KINDS[kind].internal) { if (g.time >= throwCd) startCook(it, kind); return; }
    return orig();
  });
  wrap(g, 'dropHeld', (orig) => function (throwIt) {
    const it = held(), kind = kindOf(it);
    if (throwIt && kind && !cook.it && g.time >= throwCd && canAct()) { doThrow(it, kind, 0.35); return; }
    return orig(throwIt);
  });

  function updateThrow(dt) {
    const it = held(), kind = kindOf(it);
    // HUD
    const key = kind && !g.player.dead ? `${it.id}:${it.charges ?? 1}` : '';
    if (key !== hudKey) {
      hudKey = key;
      if (!key) hud.style.display = 'none';
      else { hud.style.display = 'block'; hudText.textContent = `${t(KINDS[kind].name).toUpperCase()}${(it.charges ?? 1) > 1 ? '  x' + it.charges : ''}`; hudHint.textContent = t('Hold LMB to aim, release to throw'); }
    }
    if (!cook.it) return;
    if (held() !== cook.it || !canAct()) { cancelCook(); return; }
    if (!g.input.mouseDown(0)) { releaseThrow(); return; }
    cook.t += dt;
    const power = C.throwPower(cook.t), cooking = cook.t > THROW.chargeT;
    drawPreview(cook.kind, cook.t);
    barBox.style.display = 'block';
    barFill.style.width = Math.round(clamp((cook.t / (THROW.chargeT + THROW.cookMax)) * 100, 0, 100)) + '%';
    barFill.style.background = cooking ? 'linear-gradient(90deg,#ff8a3d,#ff3020)' : 'linear-gradient(90deg,#ffe07a,#ff8a3d)';
    void power;
    if (cooking && !KINDS[cook.kind].sticky) {          // the fuse burns in your hand: beeps get faster
      cook.beepT -= dt;
      if (cook.beepT <= 0) {
        const left = C.fuseAfterCook(cook.kind, C.cookTime(cook.t)), prog = 1 - clamp(left / KINDS[cook.kind].fuse, 0, 1);
        snd('gr_beep', null, 0.35, 0.9 + prog * 0.6);
        cook.beepT = C.beepInterval(left, KINDS[cook.kind].fuse);
      }
    }
  }

  // ---------------------------------------------------------------- host: receive a throw
  const lastThrow = new Map();
  function hostThrow(d, from) {
    if (!g.isHost || disposed) return;
    const it = g.items.get(d?.id);
    if (!it || it.holder !== from) return;
    const kind = C.kindOfItem(it.type);
    if (!kind || KINDS[kind].internal) return;
    if (g.time - (lastThrow.get(from) ?? -9) < 0.3) return;
    const o = fin3(d.o), v = fin3(d.v);
    if (!o || !v) return;
    const sp = from === g.selfId ? g.player.pos : g.remotes.get(from)?.pos;
    if (sp && sp.distanceTo(o) > 5) return;
    lastThrow.set(from, g.time);
    if (v.length() > C.MAX_SPEED + 3) v.setLength(C.MAX_SPEED + 3);
    const left = it.charges ?? 1;
    if (left > 1) { it.charges = left - 1; g.net.broadcast('itst', { id: it.id, c: it.charges }); }
    else g.net.broadcast('it', { e: 'rm', id: it.id });
    const ck = clamp(Number(d.ck) || 0, 0, THROW.cookMax);
    spawnBall(kind, o, v, from, C.fuseAfterCook(kind, ck));
  }
  function spawnBall(kind, o, v, by, fuse) {
    const gid = ++seq;
    g.net.broadcast('grfx', { k: 'th', gid, ty: kind, o: arr3(o), v: arr3(v), by, f: +fuse.toFixed(2) });
    return gid;
  }

  // ================================================================================================== host: effects
  const zones = [];              // host: persistent effects (smoke, decoy, fire, gravity, blackout, glitch)
  const hostSmoke = [], hostDark = [];
  const creaturesNear = (pos, r, dy = 3) => {
    const out = [];
    for (const c of g.creatures.host.values()) if (!c.dead && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < r && Math.abs(c.pos.y - pos.y) < dy) out.push(c);
    return out;
  };
  function creaturesIn(pos, R, los) {
    const out = [], up = pos.clone().setY(pos.y + 0.3);
    for (const c of g.creatures.host.values()) {
      if (c.dead || c.type === 'web') continue;
      const ctr = ctrOf(c), d = ctr.distanceTo(pos);
      if (d > R + (c.def?.radius || 0.5)) continue;
      if (los && !g.physics.lineOfSight(up, ctr, G.STATIC | G.DOOR)) continue;
      out.push({ c, d, ctr });
    }
    return out;
  }
  const hurt = (c, dmg, from, opts = {}) => { if (c && !c.dead && (dmg > 0 || opts.stun)) g.creatures.damage(c.id, Math.round(dmg), from, opts); };
  function hurtArea(pos, R, dmg, by, o = {}) {
    for (const { c, d } of creaturesIn(pos, R, true)) {
      const direct = o.direct === c.id;
      const f = direct ? 1.25 : 1 - 0.6 * clamp(d / R, 0, 1);
      hurt(c, dmg * f, by, { stun: o.stun || 0 });
    }
    if (o.crew) {
      const up = pos.clone().setY(pos.y + 0.3);
      for (const p of g.aiPlayers()) {
        if (p.dead || p.inShip) continue;
        const d = p.pos.distanceTo(pos);
        if (d > R || !g.physics.lineOfSight(up, p.eye, G.STATIC | G.DOOR)) continue;
        g.hostHurtPlayer(p.id, Math.round(Math.min(35, dmg * o.crew * (1 - d / R))), 'explosion', by, pos);
      }
    }
  }
  const bcast = (d) => g.net.broadcast('grfx', d);
  const P3 = (pos) => arr3(pos);

  function hostBoom(b) {
    const p = b.p;
    const cid = b.cid;
    removeBall(b);
    const kind = b.kind, def = KINDS[kind], by = b.by;
    const at = new THREE.Vector3(p.x, p.y, p.z);
    bcast({ k: 'bm', gid: b.gid, ty: kind, p: P3(at), by });
    const fxOn = (o) => g.net.broadcast('fx', { k: 'crfx', ...o });
    switch (kind) {
      case 'stun': {
        g.net.broadcast('fx', { k: 'stunbang', p: P3(at) });
        noise(at, def.noise);
        for (const { c } of creaturesIn(at, def.R, true)) hurt(c, 0, 'stun', { stun: def.stun });
        break;
      }
      case 'flash': {
        noise(at, def.noise);
        for (const { c, d } of creaturesIn(at, def.R, true)) {
          if (c.def?.hazard) continue;
          const stun = def.stunMin + (def.stunMax - def.stunMin) * (1 - clamp(d / def.R, 0, 1));
          hurt(c, 0, 'stun', { stun });
          c.grBlindT = stun + def.blind;
          c.target = null; if (c.data) c.data.hitBy = null; c.lostT = 99;     // loses track of everyone
        }
        break;
      }
      case 'smoke': {
        const z = { kind: 'smoke', x: at.x, y: at.y + 1.2, z: at.z, R: def.R, t: 0, life: def.dur };
        zones.push(z); hostSmoke.push({ x: z.x, y: z.y, z: z.z, r: 0.5 });
        noise(at, def.noise);
        break;
      }
      case 'decoy': zones.push({ kind: 'decoy', x: at.x, y: at.y + 0.2, z: at.z, t: 0, life: def.dur, acc: 0, n: 0 }); break;
      case 'sticky': case 'mini': {
        if (kind === 'sticky') g.net.broadcast('fx', { k: 'explode', p: P3(at) });
        noise(at, def.noise);
        hurtArea(at, def.R, def.dmg, by, { stun: def.stun, direct: cid || null, crew: def.crew });
        break;
      }
      case 'cryo': {
        fxOn({ kind: 'cryo', p: P3(at), r: def.R });
        for (const c of creaturesNear(at, def.R, 3)) hurt(c, 0, 'stun', { stun: def.stun });
        break;
      }
      case 'molotov': {
        fxOn({ kind: 'fire', p: P3(at), t: def.dur, r: def.R });
        g.net.broadcast('fx', { k: 'snd', s: 'glass_break', p: P3(at), v: 1, r: 6 });
        noise(at, def.noise);
        zones.push({ kind: 'fire', x: at.x, y: at.y, z: at.z, R: def.R, t: 0, life: def.dur, acc: 0, by });
        break;
      }
      case 'emp': {
        fxOn({ kind: 'emp', p: P3(at), r: def.R });
        noise(at, def.noise);
        const MECH = new Set(['turret', 'mine', 'scuttler', 'moderator', 'support', 'ticketswarm', 'editor', 'tamagotchi', 'clickbait', 'replyguy', 'mimicdoor']);
        for (const c of creaturesNear(at, def.R, 5)) {
          if (MECH.has(c.type)) { c.disabledT = Math.max(c.disabledT || 0, def.disable); hurt(c, c.maxHp === null ? 0 : 60, by, { stun: 8 }); }
          else hurt(c, 0, 'stun', { stun: 1.5 });
        }
        break;
      }
      case 'gravity': {
        zones.push({ kind: 'grav', x: at.x, y: at.y + 0.5, z: at.z, R: def.R, t: 0, life: def.dur, by });
        noise(at, def.noise);
        break;
      }
      case 'blackout': {
        zones.push({ kind: 'dark', x: at.x, y: at.y + 1, z: at.z, R: def.R, t: 0, life: def.dur });
        hostDark.push({ x: at.x, y: at.y + 1, z: at.z, r: def.R });
        noise(at, def.noise);
        break;
      }
      case 'confetti': {
        noise(at, def.noise);
        for (const { c } of creaturesIn(at, def.R, false)) {
          if (c.def?.boss) continue;
          hurt(c, 0, 'stun', { stun: C.PARTYGOERS.has(c.type) ? def.stunParty : def.stunOther });
        }
        break;
      }
      case 'glitch': {
        noise(at, def.noise);
        const cids = [];
        for (const { c } of creaturesIn(at, def.R, true)) {
          if (c.def?.hazard) continue;
          if (!c.def?.boss) hurt(c, 0, 'stun', { stun: def.freeze });      // bosses only take the burst
          cids.push(c.id);
        }
        zones.push({ kind: 'glitch', x: at.x, y: at.y, z: at.z, R: def.R, t: 0, life: def.freeze, cids, by });
        bcast({ k: 'gl', p: P3(at), R: def.R, dur: def.freeze, cids: cids.filter((id) => !g.creatures.host.get(id)?.def?.boss) });
        break;
      }
      case 'cluster': {
        noise(at, def.noise);
        const rnd = (() => { let s = (b.gid * 2654435761) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
        for (let i = 0; i < def.mini; i++) {
          const a = (i / def.mini) * Math.PI * 2 + rnd() * 0.6, sp = 4 + rnd() * 2.6;
          spawnBall('mini', at.clone().setY(at.y + 0.25), new THREE.Vector3(Math.cos(a) * sp, 5.5 + rnd() * 2, Math.sin(a) * sp), by, KINDS.mini.fuse + i * 0.11);
        }
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- host: persistent zones
  function hostZoneTick(dt) {
    hostSmoke.length = 0; hostDark.length = 0;
    for (const c of g.creatures.host.values()) if (c.grBlindT > 0) c.grBlindT -= dt;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.t += dt;
      if (z.kind === 'smoke') hostSmoke.push({ x: z.x, y: z.y, z: z.z, r: C.smokeRadius(z.R, z.t, z.life) });
      else if (z.kind === 'dark') hostDark.push({ x: z.x, y: z.y, z: z.z, r: z.R });
      else if (z.kind === 'decoy') {
        z.acc -= dt;
        if (z.acc <= 0 && z.t < z.life) {
          z.acc = KINDS.decoy.pulse;
          const pos = tmpA.set(z.x, z.y, z.z);
          noise(pos, KINDS.decoy.noise);
          bcast({ k: 'dz', p: P3(pos), s: z.n++ % 3, r: Math.random() });
        }
      } else if (z.kind === 'fire') {
        z.acc -= dt;
        if (z.acc <= 0) {
          z.acc = 0.5;
          const fp = tmpA.set(z.x, z.y, z.z);
          for (const c of creaturesNear(fp, z.R, 2.6)) if (c.maxHp !== null && !c.def?.hazard) hurt(c, KINDS.molotov.tick, z.by, {});
          for (const p of g.aiPlayers()) if (!p.dead && Math.hypot(p.pos.x - z.x, p.pos.z - z.z) < z.R * 0.7 && Math.abs(p.pos.y - z.y) < 2) g.hostHurtPlayer(p.id, 5, 'fire', z.by, fp);
        }
      } else if (z.kind === 'grav') gravityTick(z, dt);
      else if (z.kind === 'glitch') {
        for (const id of z.cids) { const c = g.creatures.host.get(id); if (c && !c.dead && !c.def?.boss) { c.stunT = Math.max(c.stunT, 0.4); if (c.state !== 'stunned') c.setState('stunned'); c.path = null; } }
      }
      if (z.t >= z.life) { safe('zoneEnd', () => endZone(z)); zones.splice(i, 1); }
    }
    // smoke / blackout make chasers lose their target faster (their own lostT clock counts twice)
    if (hostSmoke.length || hostDark.length) for (const c of g.creatures.host.values()) {
      if (c.dead || !c.target || (c.state !== 'run' && c.state !== 'attack')) continue;
      const pl = g.aiPlayerById(c.target);
      if (pl && obscured(c, pl)) c.lostT = (c.lostT || 0) + dt;
    }
  }
  function gravityTick(z, dt) {
    const center = tmpA.set(z.x, z.y, z.z), R = z.R, def = KINDS.gravity;
    for (const { c, d, ctr } of creaturesIn(center, R, false)) {
      if (!movable(c) || d < 0.7) continue;
      if (!g.physics.lineOfSight(center, ctr, G.STATIC | G.DOOR)) continue;
      const dx = z.x - c.pos.x, dz = z.z - c.pos.z, L = Math.hypot(dx, dz);
      if (L < 0.4) continue;
      const step = Math.min(L - 0.3, C.pullSpeed(d, R, def.pull) * dt), ux = dx / L, uz = dz / L, nx = c.pos.x + ux * step, nz2 = c.pos.z + uz * step;
      const nav = g.creatures.nav(c), cy = c.pos.y + Math.min(1, (c.def?.height || 1.2) * 0.5);
      if (g.physics.raycast({ x: c.pos.x, y: cy, z: c.pos.z }, { x: ux, y: 0, z: uz }, step + (c.def?.radius || 0.5), G.STATIC | G.DOOR)) continue;
      if ((nav && !nav.walkableAt(nx, nz2)) || (c.zone === 'in' && !nav)) continue;
      g.creatures.placeAt(c, nx, nz2);
      c.path = null; c.dest = null; c.repath = 0;
      c.stunT = Math.max(c.stunT, 0.35); if (c.state !== 'stunned') c.setState('stunned');
    }
    // loose loot slides into the well (impact damage is muted so fragile scrap survives the trip)
    const Ri = R + 3;
    for (const it of g.items.all()) {
      if (it.state !== 'world' || !it.body || it.holder || it.carrier || (it.owner && it.owner !== g.selfId) || it.type === 'body' || it.ladder) continue;
      const op = it.obj.position, dx = z.x - op.x, dy = z.y - op.y, dz = z.z - op.z, d = Math.hypot(dx, dy, dz);
      if (d > Ri || d < 0.05 || insideShip(op)) continue;
      const heavy = 1 / (1 + (it.def.weight || 5) / 45), sp = clamp(2.5 + (1 - d / Ri) * 3.5, 0, 6) * heavy * (d < 1.2 ? d / 1.2 : 1);
      const lv = it.body.linvel(), k = Math.min(1, dt * 6);
      it.body.setLinvel({ x: lv.x + (dx / d * sp - lv.x) * k, y: lv.y + (dy / d * sp + 0.6 - lv.y) * k, z: lv.z + (dz / d * sp - lv.z) * k }, true);
      it.impactCooldown = Math.max(it.impactCooldown || 0, 0.4);
    }
  }
  function endZone(z) {
    const at = new THREE.Vector3(z.x, z.y, z.z);
    if (z.kind === 'grav') {
      const def = KINDS.gravity;
      bcast({ k: 'ge', ty: 'gravity', p: P3(at), R: 3 });
      for (const { c } of creaturesIn(at, 3.2, false)) if (!c.def?.boss) hurt(c, def.collapse, z.by, { stun: 1.5 }); else hurt(c, def.collapse, z.by, {});
      for (const it of g.items.all()) if (it.state === 'world' && it.body && !it.owner && it.obj.position.distanceTo(at) < 12) { const lv = it.body.linvel(); it.body.setLinvel({ x: lv.x * 0.25, y: lv.y * 0.25, z: lv.z * 0.25 }, true); }
      noise(at, 2);
    } else if (z.kind === 'glitch') {
      const def = KINDS.glitch, hits = [];
      for (const id of z.cids) {
        const c = g.creatures.host.get(id);
        if (!c || c.dead) continue;
        hurt(c, c.def?.boss ? def.bossDmg : def.dmg, z.by, { stun: c.def?.boss ? 0 : 0.8 });
        hits.push(id);
      }
      bcast({ k: 'ge', ty: 'glitch', p: P3(at), R: z.R, cids: hits });
      noise(at, 2);
    }
  }

  // ---------------------------------------------------------------- host: creature perception patches (smoke / blackout / blind)
  const eyeOf = (M, c) => { const e = M.eye(c); return { x: e.x, y: e.y, z: e.z }; };
  function obscured(c, p) {
    const M = g.creatures;
    if (hostSmoke.length && C.smokeBlocks(eyeOf(M, c), p.eye, hostSmoke)) return true;
    if (hostDark.length && !C.DARK_LOVERS.has(c.type) && C.inZone({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, hostDark) && p.pos.distanceTo(c.pos) > C.DARK_BONUS.blindRange) return true;
    return false;
  }
  wrap(g.creatures, 'canSee', (orig) => function (c, p, range = 20, fov = 70) {
    if (c.grBlindT > 0) return false;
    if (hostSmoke.length || hostDark.length) {
      if (obscured(c, p)) return false;
      if (hostDark.length && C.DARK_LOVERS.has(c.type) && C.inZone({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, hostDark)) range *= C.DARK_BONUS.sight;
    }
    return orig(c, p, range, fov);
  });
  wrap(g.creatures, 'speedMul', (orig) => function (c, speed) {
    speed = orig(c, speed);
    if (hostDark.length && C.DARK_LOVERS.has(c.type) && C.inZone({ x: c.pos.x, y: c.pos.y + 1, z: c.pos.z }, hostDark)) speed *= C.DARK_BONUS.speed;
    return speed;
  });
  wrap(g.creatures, 'attack', (orig) => function (c, p, dmg, cause) {
    if (hostDark.length && C.DARK_LOVERS.has(c.type) && dmg < 999 && C.inZone({ x: c.pos.x, y: c.pos.y + 1, z: c.pos.z }, hostDark)) dmg = Math.round(dmg * C.DARK_BONUS.dmg);
    return orig(c, p, dmg, cause);
  });

  // ---------------------------------------------------------------- host: rare drops (chest / boss / tiered creature / world)
  const dropAt = (kind, pos, vel) => {
    const d = KINDS[kind];
    if (!d?.item || !ITEMS[d.item]) return;
    g.items.hostSpawn(d.item, pos, { tier: d.tier, linvel: vel || [Math.random() - 0.5, 4, Math.random() - 0.5] });
    g.net.broadcast('sys', { text: `${t('Rare bomb')}: ${t(d.name)}`, kind: 'good' });
  };
  on('tfg:chestOpened', (d) => {
    if (!g.isHost || disposed || !d?.pos) return;
    const kind = C.rollRareDrop('chest:' + d.tier);
    if (kind) safe('chestdrop', () => dropAt(kind, new THREE.Vector3(d.pos[0], d.pos[1] + 1.2, d.pos[2])));
  });
  wrap(g, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig(c, by);
    safe('killdrop', () => {
      if (!g.isHost || !c || c.grDropped) return;
      c.grDropped = true;
      const kind = c.def?.boss ? C.rollRareDrop('boss') : (c.tier === 'legendary' || c.tier === 'mythic') ? C.rollRareDrop('tier:' + c.tier) : null;
      if (kind) dropAt(kind, c.pos.clone().add(new THREE.Vector3(0, 0.9, 0)));
    });
    return r;
  });
  on('moonPopulated', (gg) => {
    if (gg !== g || !g.isHost || disposed) return;
    safe('worlddrop', () => {
      const kind = C.rollRareDrop('world'), spots = g.world.facility?.scrapSpots || [];
      if (!kind || !spots.length) return;
      const s = spots[Math.floor(Math.random() * spots.length)];
      g.items.hostSpawn(KINDS[kind].item, new THREE.Vector3(s.x, s.y + 0.5, s.z), { tier: KINDS[kind].tier });
    });
  });

  // ================================================================================================== client: visuals for every effect
  // ---- smoke: ONE InstancedMesh of soft camera-facing puffs for all clouds
  const CLOUD_PUFFS = 40, CLOUD_CAP = CLOUD_PUFFS * 6;
  const clouds = [];
  const puffTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const px = 32 + (Math.random() - 0.5) * 26, py = 32 + (Math.random() - 0.5) * 26, r = 14 + Math.random() * 12, gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  })();
  const smokeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: puffTex, color: 0xd0d4d8, emissive: 0x2a2e34, transparent: true, opacity: 0.3, depthWrite: false, fog: true }), CLOUD_CAP);
  smokeMesh.frustumCulled = false; smokeMesh.count = 0; smokeMesh.renderOrder = 6; g.scene.add(smokeMesh);
  const dummy = new THREE.Object3D(), rollQ = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  function spawnCloud(pos, R, dur) {
    const puffs = [];
    while (puffs.length < CLOUD_PUFFS) {
      const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      if (x * x + y * y + z * z > 1) continue;
      puffs.push({ ox: x, oy: y, oz: z, s: 0.55 + Math.random() * 0.4, ph: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.4 });
    }
    clouds.push({ x: pos.x, y: pos.y + 1.2, z: pos.z, R, t0: g.time, dur, puffs });
  }
  function updateClouds() {
    let n = 0;
    const now = g.time, camQ = g.camera.quaternion, cp = g.camera.position;
    for (let ci = clouds.length - 1; ci >= 0; ci--) {
      const c = clouds[ci], tt = now - c.t0;
      if (tt >= c.dur) { clouds.splice(ci, 1); continue; }
      const R = C.smokeRadius(c.R, tt, c.dur);
      for (const pf of c.puffs) {
        if (n >= CLOUD_CAP) break;
        dummy.position.set(c.x + pf.ox * R + Math.sin(now * 0.35 + pf.ph) * 0.25, c.y + pf.oy * R * 0.65 + Math.sin(now * 0.5 + pf.ph * 2) * 0.15, c.z + pf.oz * R + Math.cos(now * 0.3 + pf.ph) * 0.25);
        const near = clamp((dummy.position.distanceTo(cp) - 0.7) / 2.2, 0.12, 1);
        dummy.scale.setScalar(pf.s * R * (0.9 + 0.1 * Math.sin(now * 0.9 + pf.ph)) * near);
        rollQ.setFromAxisAngle(zAxis, pf.spin * tt + pf.ph);
        dummy.quaternion.copy(camQ).multiply(rollQ);
        dummy.updateMatrix();
        smokeMesh.setMatrixAt(n++, dummy.matrix);
      }
    }
    smokeMesh.count = n;
    if (n) smokeMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- blackout: dome + lights killed through LightPool.groupFactor (intensity only) + a screen vignette while you stand inside
  const darkVis = [];
  const darkAmt = (z, now) => { const tt = now - z.t0; return clamp(Math.min(tt / 0.6, (z.dur - tt) / 1.5), 0, 1); };
  wrap(g.lights, 'groupFactor', (orig) => function (e) {
    let f = orig(e);
    if (darkVis.length && e.pos) {
      const now = g.time;
      for (const z of darkVis) {
        const d = Math.hypot(e.pos.x - z.p.x, e.pos.y - z.p.y, e.pos.z - z.p.z);
        if (d < z.R) f *= 1 - 0.97 * darkAmt(z, now) * clamp((z.R - d) / 2, 0, 1);
      }
    }
    return f;
  });
  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,.25),rgba(0,0,0,.8))';
  (document.getElementById('ui') || document.body).appendChild(vignette);
  function spawnDark(pos, R, dur) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false }));
    dome.position.copy(pos).setY(pos.y + 1); dome.scale.setScalar(R); dome.frustumCulled = false; dome.renderOrder = 2; g.scene.add(dome);
    const z = { p: pos.clone().setY(pos.y + 1), R, t0: g.time, dur, dome };
    darkVis.push(z);
  }
  function updateDark(dt) {
    let inside = 0;
    const now = g.time, cp = g.camera.position;
    for (let i = darkVis.length - 1; i >= 0; i--) {
      const z = darkVis[i];
      if (now - z.t0 >= z.dur) { z.dome.removeFromParent(); z.dome.geometry.dispose(); z.dome.material.dispose(); darkVis.splice(i, 1); continue; }
      const a = darkAmt(z, now);
      z.dome.material.opacity = 0.32 * a;
      const d = cp.distanceTo(z.p);
      inside = Math.max(inside, a * clamp((z.R - d) / 3, 0, 1));
    }
    const v = 0.55 * inside;
    if (Math.abs(v - (vignette._v || 0)) > 0.005) { vignette._v = v; vignette.style.opacity = String(v); }
    void dt;
  }

  // ---- gravity well vortex
  function spawnVortex(pos, R, dur) {
    const N = 70, arr = new Float32Array(N * 3), ph = Array.from({ length: N }, () => Math.random()), a0 = Array.from({ length: N }, () => Math.random() * 6.28);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.2, map: dotTex, color: 0xb98cff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true }));
    pts.frustumCulled = false; g.scene.add(pts);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x08040f, transparent: true, opacity: 0.9, fog: false }));
    core.position.copy(pos).setY(pos.y + 0.5); g.scene.add(core);
    const r1 = addMesh(new THREE.RingGeometry(0.85, 1, 28), 0xa06cff, 0.6), r2 = addMesh(new THREE.RingGeometry(0.85, 1, 28), 0x66e0ff, 0.5);
    r1.position.copy(core.position); r2.position.copy(core.position);
    anim(dur, (u, tt) => {
      const fadeOut = clamp((1 - u) / 0.15, 0, 1);
      for (let i = 0; i < N; i++) {
        const k = (ph[i] + tt * 0.6) % 1, r = R * 0.95 * Math.pow(1 - k, 1.3) + 0.1, ang = a0[i] + tt * 3 + k * 9;
        arr[i * 3] = core.position.x + Math.cos(ang) * r; arr[i * 3 + 1] = core.position.y + Math.sin(ang * 1.7 + i) * r * 0.25; arr[i * 3 + 2] = core.position.z + Math.sin(ang) * r;
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = fadeOut;
      core.scale.setScalar((0.25 + u * 0.15) * fadeOut + 0.02);
      r1.rotation.set(tt * 2, tt * 1.3, 0); r2.rotation.set(-tt * 1.4, tt * 2.1, 0);
      const s = (1.4 + Math.sin(tt * 5) * 0.15) * fadeOut; r1.scale.setScalar(s); r2.scale.setScalar(s * 0.75);
      r1.material.opacity = 0.6 * fadeOut; r2.material.opacity = 0.5 * fadeOut;
    }, () => { pts.removeFromParent(); geo.dispose(); pts.material.dispose(); core.removeFromParent(); core.geometry.dispose(); core.material.dispose(); killMesh(r1); killMesh(r2); });
    snd('gr_grav', pos, 0.9, 1, { ref: 8, max: 70 });
  }

  // ---- decoy beacon: keeps its ball as a blinking prop, pulses a ring with each fake sound
  const decoys = [];
  function spawnDecoy(pos, dur) {
    const mesh = createBallMesh('decoy'); mesh.position.copy(pos); g.scene.add(mesh);
    decoys.push({ mesh, until: g.time + dur, pos: pos.clone() });
  }
  function updateDecoys() {
    for (let i = decoys.length - 1; i >= 0; i--) {
      const d = decoys[i];
      if (g.time >= d.until) { d.mesh.removeFromParent(); d.mesh.userData.dispose?.(); decoys.splice(i, 1); continue; }
      d.mesh.userData.led.visible = Math.sin(g.time * 8) > 0;
    }
  }
  function decoyPulse(d) {
    const pos = fin3(d.p);
    if (!pos) return;
    ringFx(pos.clone().setY(pos.y - 0.1), 0x40ffe0, 0.3, 2.4, 0.9);
    if (d.s === 0) for (let i = 0; i < 4; i++) setTimeout(() => { if (!disposed) snd(`step_concrete_${1 + ((i + (d.r * 3 | 0)) % 3)}`, pos, 0.7, 0.9 + Math.random() * 0.25, { ref: 5, max: 45 }); }, i * 260);
    else if (d.s === 1) snd(d.r > 0.5 ? 'mimic_voice_1' : 'mimic_voice_2', pos, 0.8, 0.95 + d.r * 0.2, { ref: 6, max: 50 });
    else snd(`whisper_${1 + ((d.r * 3) | 0)}`, pos, 0.8, 1, { ref: 6, max: 50 });
  }

  // ---- glitch freeze: paused animation + jitter / stretch / flicker on each frozen creature, cyan + magenta slices
  const frozen = new Map();
  function freezeView(cid, dur) {
    const v = g.creatures.views.get(cid);
    if (!v || frozen.has(cid)) return;
    const f = { v, until: g.time + dur, mUpdate: v.model.update, vUpdate: v.update, sc: v.root.scale.clone(), slices: [], nextJ: 0, own: Object.prototype.hasOwnProperty.call(v, 'update') };
    v.model.update = () => {};                                          // paused video: no animation
    v.update = function (dt) {
      if (f.v.hitFlash != null && Math.random() < 0.3) f.v.hitFlash = 0.85;
      f.vUpdate.call(f.v, dt);
      if (g.time >= f.nextJ) {
        f.nextJ = g.time + 0.06 + Math.random() * 0.06;
        f.jx = (Math.random() - 0.5) * 0.14; f.jz = (Math.random() - 0.5) * 0.14; f.sx = Math.random() < 0.3 ? 1 + Math.random() * 0.3 : 1;
      }
      f.v.root.position.x += f.jx || 0; f.v.root.position.z += f.jz || 0;
      f.v.root.scale.x = f.sc.x * (f.sx || 1);
    };
    for (const col of [0x00ffd0, 0xff2bd6]) {
      const m = addMesh(new THREE.PlaneGeometry(1, 0.12), col, 0.5);
      f.slices.push(m);
    }
    frozen.set(cid, f);
  }
  function unfreeze(cid) {
    const f = frozen.get(cid);
    if (!f) return;
    frozen.delete(cid);
    f.v.model.update = f.mUpdate;
    if (f.own) f.v.update = f.vUpdate; else delete f.v.update;
    f.v.root.scale.copy(f.sc);
    for (const m of f.slices) killMesh(m);
  }
  function updateFrozen() {
    for (const [cid, f] of [...frozen]) {
      if (g.time >= f.until || !g.creatures.views.has(cid) || f.v.state === 'dead') { unfreeze(cid); continue; }
      const h = f.v.height || 1.5, r = (f.v.radius || 0.5) * 2.4;
      f.slices.forEach((m, i) => {
        m.position.set(f.v.pos.x + (Math.random() - 0.5) * r * 0.6, f.v.pos.y + Math.random() * h, f.v.pos.z + (Math.random() - 0.5) * r * 0.3);
        m.scale.set(r * (0.6 + Math.random() * 0.8), 1, 1); m.quaternion.copy(g.camera.quaternion); m.material.opacity = 0.25 + Math.random() * 0.4 * (i + 1) / 2;
      });
    }
  }

  // ---- flash: your own screen (looking at it whites you out; the ringing hangs on)
  const flashS = { t: 0, dur: 0, amt: 0 };
  function localFlash(pos, R) {
    const p = g.player;
    if (p.dead) return;
    const eye = g.camera.position, to = tmpA.copy(pos).sub(eye), dist = to.length();
    const fwd = tmpB.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const facing = dist > 0.01 ? to.clone().divideScalar(dist).dot(fwd) : 1;
    const los = g.physics.lineOfSight(pos.clone().setY(pos.y + 0.15), eye, G.STATIC | G.DOOR);
    const ex2 = C.flashExposure(dist, facing, los, R);
    if (ex2.amt < 0.06) return;
    flashS.amt = Math.max(flashS.amt * (flashS.t > 0 ? 1 : 0), ex2.amt); flashS.dur = Math.max(flashS.t, ex2.dur); flashS.t = flashS.dur;
    snd('gr_ring', null, clamp(ex2.amt, 0.2, 0.9), 1, { bus: 'sfx' });
    p.stunT = Math.max(p.stunT || 0, ex2.amt * 1.4);
    if (ex2.amt > 0.5) toast('Blinded!', 'warn');
  }
  function updateFlash(dt) {
    if (flashS.t <= 0) return;
    flashS.t -= dt;
    const u = clamp(flashS.t / Math.max(0.01, flashS.dur), 0, 1), level = flashS.amt * (u > 0.55 ? 1 : u / 0.55);
    g.engine.flash(0xffffff, level);
  }

  // ---- confetti: everyone close dances for 2 s (movement is rooted, the stock emote plays for the others)
  let danceT = 0;
  wrap(g.player, 'update', (orig) => function (dt, input) {
    if (danceT > 0) {
      danceT -= dt;
      const s = g.stats, sm0 = s.speedMul;
      s.speedMul = sm0 * 0.03;
      try { return orig(dt, input); } finally { s.speedMul = sm0; }
    }
    return orig(dt, input);
  });
  function localDance(pos, R) {
    const p = g.player;
    if (p.dead || p.pos.distanceTo(pos) > R) return;
    danceT = KINDS.confetti.dance;
    safe('dance', () => g.emotes?.play({ ...EMOTE_BY_ID.dance, dur: KINDS.confetti.dance + 0.1 }));
    toast('DANCE!', 'info');
  }

  // ---- boom dispatcher (every peer)
  const CONF = { count: 90, color: [0xff5ac8, 0xffe040, 0x40e0ff, 0x5aff8a, 0xff5a5a, 0xffffff], speed: 6.5, up: 6, life: 1.6, size: 0.09, gravity: 5, drag: 1.4 };
  function onBoom(d) {
    const pos = fin3(d.p);
    if (!pos) return;
    const b = balls.get(d.gid);
    if (b) removeBall(b);
    const def = KINDS[d.ty];
    if (!def || d.dud) return;
    switch (d.ty) {
      case 'stun': break;                                                // the stock 'stunbang' fx draws it
      case 'flash':
        snd('gr_bang', pos, 1.2, 1, { ref: 8, max: 90 });
        sphereFx(pos, 0xffffff, 0.4, 3.2, 0.3, 0.9); ringFx(pos, 0xffffff, 0.5, def.R * 0.6, 0.4, false);
        burst(pos, 'sparks', 1.5); shake(pos, 0.5, 16);
        localFlash(pos, def.R);
        break;
      case 'smoke':
        spawnCloud(pos, def.R, def.dur); snd('gr_hiss', pos, 0.9, 1, { ref: 6, max: 50 }); burst(pos, 'dust', 1.2);
        break;
      case 'decoy': spawnDecoy(pos.clone(), def.dur); snd('gr_pin', pos, 0.7, 0.8, { ref: 4 }); ringFx(pos, 0x40ffe0, 0.3, 1.8, 0.6); break;
      case 'sticky': break;                                              // 'explode' fx from the host
      case 'mini':
        sphereFx(pos, 0xff9a3a, 0.2, def.R * 0.7, 0.28, 0.7); burst(pos, 'sparks', 1.4); snd('explosion', pos, 0.6, 1.35, { ref: 5, max: 60 }); shake(pos, 0.35, 12);
        break;
      case 'cryo': ringFx(pos, 0x9ae8ff, 0.3, def.R, 0.5); sphereFx(pos, 0xbdf4ff, 0.3, def.R * 0.7, 0.4, 0.4); snd('stun_bang', pos, 0.5, 1.4, { ref: 5 }); break;
      case 'molotov': case 'emp': break;                                 // crafting's 'crfx' fx draws fire / EMP
      case 'gravity': spawnVortex(pos, def.R, def.dur); break;
      case 'blackout': spawnDark(pos, def.R, def.dur); snd('gr_dark', pos, 1, 1, { ref: 10, max: 90 }); ringFx(pos, 0x8080a0, 0.5, def.R * 0.5, 0.8); break;
      case 'confetti':
        burst(pos, CONF, 1); setTimeout(() => { if (!disposed) burst(pos.clone().setY(pos.y + 0.6), CONF, 0.6); }, 160);
        snd('gr_party', pos, 1.1, 1, { ref: 8, max: 80 }); sphereFx(pos, 0xff8ae0, 0.3, 2.5, 0.3, 0.5); shake(pos, 0.3, 14);
        localDance(pos, def.R);
        break;
      case 'glitch': break;                                              // the 'gl' message follows with the frozen creatures
      case 'cluster': sphereFx(pos, 0xff7a3a, 0.3, 1.6, 0.25, 0.7); burst(pos, 'sparks', 1.6); snd('explosion', pos, 0.7, 1.2, { ref: 6, max: 60 }); shake(pos, 0.3, 12); break;
      default: break;
    }
  }
  function onGlitch(d) {
    const pos = fin3(d.p);
    if (!pos) return;
    snd('gr_glitch', pos, 1.1, 1, { ref: 8, max: 80 });
    ringFx(pos, 0x00ffd0, 0.5, d.R, 0.6); ringFx(pos, 0xff2bd6, 0.3, d.R * 0.8, 0.8);
    burst(pos, 'glitch', 2);
    if (pos.distanceTo(g.camera.position) < d.R + 6) g.engine.flash(0x00ffd0, 0.3);
    for (const id of Array.isArray(d.cids) ? d.cids : []) if (typeof id === 'string') freezeView(id, clamp(Number(d.dur) || 6, 1, 10));
  }
  function onEnd(d) {
    const pos = fin3(d.p);
    if (!pos) return;
    if (d.ty === 'gravity') {
      sphereFx(pos, 0xa06cff, 0.3, 3.4, 0.35, 0.7); ringFx(pos, 0xffffff, 0.3, 4.5, 0.5, false); snd('gr_collapse', pos, 1.1, 1, { ref: 8, max: 80 }); burst(pos, 'sparks', 1.5); shake(pos, 0.7, 20);
    } else if (d.ty === 'glitch') {
      snd('gr_collapse', pos, 1, 1.3, { ref: 8, max: 80 });
      for (const id of Array.isArray(d.cids) ? d.cids : []) {
        if (typeof id !== 'string') continue;
        const v = g.creatures.views.get(id);
        unfreeze(id);
        if (v) { burst(v.pos.clone().setY(v.pos.y + (v.height || 1) * 0.5), 'glitch', 1.6); ringFx(v.pos, 0xff2bd6, 0.2, 1.8, 0.4); }
      }
      shake(pos, 0.5, 18);
    }
  }
  function onStick(d) {
    const b = balls.get(d.gid);
    if (!b) return;
    b.stickT = Math.max(b.stickT, 0);
    b.p.stuck = true; b.p.vx = b.p.vy = b.p.vz = 0;
    if (typeof d.cid === 'string' && fin3(d.off)) { b.cid = d.cid; b.off = fin3(d.off); return; }
    const p = fin3(d.p), n = fin3(d.n);
    if (p) { b.p.x = p.x; b.p.y = p.y; b.p.z = p.z; }
    if (n) { b.p.sx = n.x; b.p.sy = n.y; b.p.sz = n.z; }
  }
  function onNet(d, from) {
    if (disposed || !d || typeof d !== 'object') return;
    if (from && g.net && from !== g.net.hostId && from !== g.selfId) return;
    safe('net:' + d.k, () => {
      switch (d.k) {
        case 'th': onThrowMsg(d); break;
        case 'sk': onStick(d); break;
        case 'bm': onBoom(d); break;
        case 'gl': onGlitch(d); break;
        case 'dz': decoyPulse(d); break;
        case 'ge': onEnd(d); break;
        default: break;
      }
    });
  }
  on('netReady', (net, gg) => {
    if (gg !== g) return;
    try { HOST_ONLY.add('grfx'); } catch { /* the session tolerates it missing */ }
    net.on_('grfx', onNet);
  });
  on('registerHandlers', (H, gg) => { if (gg === g) H('grth', hostThrow); });

  // ---------------------------------------------------------------- housekeeping
  function clearAll() {
    for (const b of [...balls.values()]) removeBall(b);
    zones.length = 0; hostSmoke.length = 0; hostDark.length = 0;
    clouds.length = 0; smokeMesh.count = 0;
    for (const z of darkVis) { z.dome.removeFromParent(); z.dome.geometry.dispose(); z.dome.material.dispose(); }
    darkVis.length = 0; vignette.style.opacity = '0'; vignette._v = 0;
    for (const d of decoys) { d.mesh.removeFromParent(); d.mesh.userData.dispose?.(); }
    decoys.length = 0;
    for (const id of [...frozen.keys()]) unfreeze(id);
    for (const a of anims) { try { a.end?.(); } catch { /* ignore */ } }
    anims.length = 0;
    cancelCook(); danceT = 0; flashS.t = 0;
  }
  on('phase', (ph, gg) => { if (gg === g) safe('phase', clearAll); });
  on('update', (dt, gg) => {
    if (gg !== g || disposed) return;
    safe('throw', () => updateThrow(dt));
    safe('balls', () => updateBalls(dt));
    safe('anims', () => {
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        a.t += dt;
        const u = Math.min(1, a.t / a.dur);
        a.upd(u, a.t);
        if (u >= 1) { anims.splice(i, 1); a.end?.(); }
      }
    });
    safe('clouds', updateClouds);
    safe('dark', () => updateDark(dt));
    safe('decoys', updateDecoys);
    safe('frozen', updateFrozen);
    safe('flash', () => updateFlash(dt));
    if (g.isHost) safe('zones', () => hostZoneTick(dt));
  });

  const api = {
    kinds: KINDS, zones, balls, clouds, cook, core: C,
    /** host / debug: spawn a ball straight away (no item) */
    spawn(kind, pos, vel, by = g.selfId, fuse) { return spawnBall(kind, pos, vel, by, fuse ?? KINDS[kind].fuse); },
    /** debug: the throw a held item would do after `hold` seconds */
    throwHeld(hold = 0.5) { const it = held(), kind = kindOf(it); if (!it || !kind) return false; doThrow(it, kind, hold); return true; },
    stats() { return { balls: balls.size, zones: zones.map((z) => z.kind), smoke: hostSmoke.length, dark: hostDark.length, clouds: clouds.length, frozen: frozen.size, decoys: decoys.length }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      for (const u of undo.reverse()) { try { u(); } catch { /* ignore */ } }
      clearAll();
      for (const m of [dots, landing, smokeMesh]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
      dotTex.dispose(); puffTex.dispose();
      vignette.remove(); hud.remove();
    },
  };
  return api;
}
