// WORLDS3 (wave 8, docs/wave8/worlds3.md): the Backrooms become findable + alternate worlds behind the door + bigger / fuller facilities.
//   1. THE WRONG DOOR: a visible flickering yellow doorway on the (seeded) backrooms glitch spot of a facility. Odds: 100 % on day 1 and every 3rd day,
//      22 % otherwise (~48 % overall). First sighting = HUD caption + an Algorithm line + a distance hint; terminal `BACKROOMS`.
//   2. WORLDS: the door opens onto a themed pocket (same maze generator as Level 0): Level 0 / Poolrooms / Data Center / Endless Hotel / Level Fun / Ward 13
//      (asylum). Palette + fog + audio + own loot + hunters + ONE signature rule each (see worlds3_core.THEMES). Backrooms.js keeps owning the pocket
//      lifecycle; this module skins it (material tint/texture swap, restored on unload) and adds the props / hazards via the `game.w3` hooks.
//   3. FACILITY SIZE CLASS (small / medium / large, seeded per run seed + moon; tier 1 never large) and purposeful SET DRESSING in the rooms.
//   4. EXIT SAFETY: EXIT distance hint after 100 s, world marker after 150 s, void catch, asylum lock auto-opens after 300 s.
// Net: `w3fx` (host -> all) {k:'dark', d, s} hotel blackout + plate re-roll, {k:'unlock'} asylum. run.br gains `th` (theme id) and `lk` (asylum lock).
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { RNG, hashString } from '../core/rng.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { ITEMS, registerItem } from './items.js';
import { CREATURES } from './creatures.js';
import { saveProfile } from '../core/save.js';
import { navClear } from '../world/interiors/common.js';
import { G } from '../physics/physics.js';
import { WorldMarker } from '../render/br_fx.js';
import { firstDay } from './firstrun_core.js';
import { THEMES, W3_ITEMS, POCKET_KINDS, KINDS, doorChance, doorTheme, sizeClassFor, planDressing, planPocketDressing } from './worlds3_core.js';
import { BoxBatch, addProp, paletteFor, buildDoorFrame } from '../world/worlds3_kit.js';
import { themeTextures, numberAtlas } from '../world/worlds3_tex.js';
import { TR, RU } from './worlds3_text.js';

const SKIP_DRESS = new Set(['backrooms', 'sewer', 'mineshaft']);
const ALGO_LINES = [
  'That door is not on my blueprints. Do not open it. ...I will watch closely if you do.',
  'Structural anomaly detected: a door. Nobody ordered a door. Please ignore it. Please.',
  'I count one more door than the building owns. I would not knock.',
];
const SIZE_NAME = { small: 'SMALL', medium: 'MEDIUM', large: 'LARGE' };

export function installWorlds3(game) {
  const mods = game.mods;
  if (!mods) return null;
  const api = window.KefalAPI;
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  registerItems();
  registerTerminal();

  const offs = [], patches = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const patch = (obj, key, make) => {
    if (!obj) return;
    const prev = obj[key], own = Object.prototype.hasOwnProperty.call(obj, key), fn = make(prev);
    obj[key] = fn;
    patches.push(() => { if (obj[key] === fn) { if (own) obj[key] = prev; else delete obj[key]; } });
  };
  const S = {
    door: null, doorSpot: null, doorSeen: false, indoorT: 0, hintT: 0,
    tp: { pk: null, th: 'l0' },       // themed-pocket state (skin + extras)
    dress: null, sizeBase: new Map(), size: null,
    inPk: false, inT: 0, marker: null, dark: 0, lie: 1, saltN: 0, stepT: 0, voidT: 0, zap: [], deep: [],
    forceTheme: null, dressCount: 0, hostT: { dark: 40, lock: 0, mq: new Set(), keyT: 0 },
  };
  const run = () => game.run;
  const br = () => { const r = game.run; return r?.br && r.br.d === r.day ? r.br : null; };
  const bk = () => game.backrooms;
  const fromHost = (from) => (from === game.selfId ? !!game.isHost : !!game.net && from === game.net.hostId);
  const themeId = () => { const b = br(); return b?.k ? (b.th && THEMES[b.th] ? b.th : 'l0') : null; };
  const theme = () => { const id = themeId(); return id ? THEMES[id] : null; };
  const inPocket = () => !!bk()?.pocket?.contains?.(game.player.pos);
  const sfx = (n, v = 0.6) => { try { game.sfx?.(n, v); } catch { /* ignore */ } };

  // ------------------------------------------------------------------ items (8 signature scrap + the ward key)
  function registerItems() {
    const mm = window.__kefalMods;
    for (const d of W3_ITEMS) {
      registerItem({ id: d.id, name: d.name, kind: 'scrap', value: d.value, weight: d.weight, hands: 1, tier: d.tier, tip: d.tip, noclip: true, strange: d.tier === 'epic' });
      mm?.itemModels?.set(d.id, () => {
        const g = new THREE.Group();
        for (const [w, h, dd, x, y, z, col, glow] of d.box) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), glow ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshLambertMaterial({ color: col }));
          m.position.set(x, y, z); g.add(m);
        }
        return g;
      });
    }
  }

  // ------------------------------------------------------------------ terminal
  function registerTerminal() {
    api?.registerCommand?.('backrooms', (rest, term) => {
      const m = MOONS.br_level0;
      const lines = [
        t('BACKROOMS'),
        m ? tf('ROUTE: {name} - tier {tier}, {cost}. Type ROUTE LEVEL 0.', { name: m.name, tier: m.tier, cost: m.cost ? '▮' + m.cost : t('FREE') }) : '',
        t('A flickering yellow WRONG DOOR appears in about every second facility (always on day 1). Follow the hum. Step through.'),
        t('Worlds behind the door: Level 0, Poolrooms, Data Center, Endless Hotel, Level Fun, Ward 13.'),
        t('Every world has a green EXIT. Every world has a rule.'),
      ].filter(Boolean);
      term.print(lines.join('\n'));
    }, t('BACKROOMS - route to the Backrooms + how the wrong door works'));
  }

  // ------------------------------------------------------------------ hooks used by game/backrooms.js (all optional there)
  const hooks = {
    /** chance for a wrong door in today's facility (base = moon override) */
    spotChance: (r, base) => (firstDay(r) ? 0 : doorChance(r.day, base)),   // [firstrun] the wrong door waits for day 2 (deterministic: every peer plans the same spot)
    /** theme the door opens onto (host, at pocket creation) */
    doorTheme: () => {
      if (S.forceTheme) return S.forceTheme;
      const r = run(), tier = MOONS[r?.moon]?.tier || 1;
      const th = doorTheme(r.seed, r.day, r.moon, tier);
      return th === 'l0' ? 0 : th;
    },
    theme,
    title: () => { const T = theme(); return T ? t(T.title) : t('LEVEL 0'); },
    sub: () => { const T = theme(); return T ? t(T.sub) : t('"The Lobby"'); },
    look: () => { const T = theme(); return T && T.fog ? T : null; },
    doorLabel: () => t('Open the wrong door [E]'),
    doorSub: (open) => (open ? t('It is open. Someone went through.') : t('The hum is coming from behind it.')),
    /** host: rewrite the pocket loot list for the theme; returns the value multiplier */
    lootHook(list, th, pk, spots) {
      const T = THEMES[th];
      if (!T?.loot) return 1;
      list.length = 0;
      const L = T.loot;
      const sig = L.sig.filter((id) => ITEMS[id]);
      for (let i = 0; i < L.sigN && sig.length; i++) list.push(sig[i % sig.length]);
      const pool = L.pool.filter(([id]) => ITEMS[id]);
      for (let i = 0; i < L.n && pool.length; i++) list.push(weighted(pool));
      if (ITEMS.x_almondwater) list.push('x_almondwater');
      if (th === 'asylum' && ITEMS.w3_wardkey) {
        // the key waits in the spot farthest from the landing (dark ones first)
        let best = -1, bd = -1;
        spots.forEach((s, i) => { const d = Math.hypot(s.x - pk.spawn.x, s.z - pk.spawn.z) + (s.dark ? 30 : 0); if (d > bd) { bd = d; best = i; } });
        const s = best >= 0 ? spots.splice(best, 1)[0] : null;
        if (s) S.hostT.keyId = game.items.hostSpawn('w3_wardkey', new THREE.Vector3(s.x, pk.y + 0.35, s.z), { valueMul: 1 });   // returns the id (the entity appears after the broadcast)
        const b = br(); if (b) b.lk = 1;
        Object.assign(S.hostT, { lockT: 0, keySeen: false, keyT: 0 });
      }
      return T.lootMul || 1;
    },
    /** host: weighted hunter pick for the theme ({id, dark}) or null for the Level 0 default */
    pickHunter(th) {
      const T = THEMES[th || themeId()];
      if (!T?.hunters) return null;
      const list = Object.entries(T.hunters).filter(([id]) => CREATURES[id]);
      if (!list.length) return null;
      const id = weighted(list);
      return { id, dark: id === 'br_smiler' || id === 'lurker' };
    },
    huntAfter: () => THEMES[themeId()]?.huntAfter,
    huntEvery: () => THEMES[themeId()]?.huntEvery,
    huntCap: () => THEMES[themeId()]?.huntCap,
    /** EXIT lock text while locked (asylum), else null */
    exitLock: () => (br()?.lk ? t('The ward doors are locked. Find the ward key.') : null),
    get debug() { return S; },
    forceTheme(id) { S.forceTheme = THEMES[id] && id !== 'l0' ? id : null; },
    sizeClass: () => S.size,
    dressCount: () => S.dressCount,
    dispose,
  };
  const weighted = (tbl) => {
    let tot = 0;
    for (const [, w] of tbl) tot += w;
    let x = Math.random() * tot;
    for (const [id, w] of tbl) { x -= w; if (x <= 0) return id; }
    return tbl[tbl.length - 1][0];
  };

  // ------------------------------------------------------------------ facility size class (patched into loadMapFor)
  const restoreSizes = () => { for (const [id, v] of S.sizeBase) if (MOONS[id]) MOONS[id].size = v; S.sizeBase.clear(); };
  patch(game, 'loadMapFor', (prev) => function (r, instant) {
    try {
      const needMap = ['landing', 'moon', 'company', 'takeoff'].includes(r.phase);
      const m = MOONS[r.moon];
      if (!needMap) { restoreSizes(); S.size = null; }
      else if (m && !S.sizeBase.has(m.id) && !m.company && !m.customMap && !m.home && !m.layoutOpts && m.interior !== 'backrooms') {
        const sc = sizeClassFor(r.seed, m.id, m.tier || 1);
        S.sizeBase.set(m.id, m.size);
        m.size = Math.min(2.6, Math.max(0.5, (m.size || 1) * sc.mul));
        S.size = sc.cls;
      }
    } catch (e) { console.warn('worlds3 size', e); }
    return prev.call(this, r, instant);
  });

  // ------------------------------------------------------------------ facility set dressing
  function disposeDress() {
    if (S.dress) { S.dress.removeFromParent(); S.dress.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } }); }
    S.dress = null; S.dressCount = 0;
  }
  function dressFacility() {
    disposeDress();
    const fac = game.world.facility;
    if (!fac?.layout || !fac.nav || game.world.company || SKIP_DRESS.has(fac.layout.theme)) return;
    const L = fac.layout, nav = fac.nav;
    const avoid = [];
    const add = (o, r) => { const q = o?.pos ? o.pos : o; if (q && Number.isFinite(q.x) && Number.isFinite(q.z)) avoid.push({ x: q.x, z: q.z, r }); };
    for (const s of fac.scrapSpots || []) add(s, 1.0);
    for (const s of fac.bigSpots || []) add(s, 1.4);
    for (const s of fac.wallSpots || []) add(s, 1.5);
    for (const s of fac.vaultSpots || []) add(s, 1.6);
    for (const s of fac.ventSpots || []) add(s, 1.2);
    for (const s of fac.chestSpots || []) add(s, 1.4);
    for (const s of fac.turretSpots || []) add(s, 1.2);
    for (const s of fac.mineSpots || []) add(s, 1.2);
    for (const s of fac.landmarkSpots || []) add(s, 1.6);
    for (const d of fac.doors || []) add(d, 2.0);
    for (const s of fac.interactables || []) add(s, 1.4);
    add(fac.mainDoor?.spawn, 3);
    const plan = planDressing(L, new RNG((L.seed ^ 0x3d55a1) >>> 0), {
      clear: (x0, z0, x1, z1) => navClear(nav, x0, z0, x1, z1, 0), avoid,
    });
    if (!plan.length) return;
    const batch = new BoxBatch(L.y);
    const pal = paletteFor(L.theme);
    for (const p of plan) {
      if (!addProp(batch, p, pal, false)) continue;
      const kd = KINDS[p.kind];
      if (kd.solid) {
        const rc = p.rect;
        try { fac.colliders.push(game.physics.addStaticBox((rc.x0 + rc.x1) / 2, L.y + kd.h / 2, (rc.z0 + rc.z1) / 2, (rc.x1 - rc.x0) / 2, kd.h / 2, (rc.z1 - rc.z0) / 2, 0, G.STATIC, { kind: 'static', w3: true })); } catch { /* ignore */ }
        nav.blockBox(rc.x0, rc.z0, rc.x1, rc.z1, 0.05);
      }
    }
    S.dress = batch.build('w3_dressing');
    fac.group.add(S.dress);
    S.dressCount = plan.length;
  }

  // ------------------------------------------------------------------ the wrong door (facility side)
  function disposeDoor() {
    if (S.door) {
      S.door.group.removeFromParent();
      S.door.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
      S.door.glowMat.dispose(); S.door.spillMat.dispose(); S.door.spillTex.dispose();
    }
    S.door = null; S.doorSpot = null; S.doorSeen = false; S.indoorT = 0;
  }
  function doorTick(dt) {
    const spot = bk()?.spot;
    const fac = game.world.facility;
    if (spot !== S.doorSpot) {
      disposeDoor();
      if (spot && fac) {
        try { S.door = buildDoorFrame(spot.pos, spot.normal); game.scene.add(S.door.group); S.doorSpot = spot; } catch (e) { console.warn('worlds3 door', e); }
      }
    }
    if (!S.door) return;
    const st = br()?.sp || 'idle', sealed = st === 'sealed';
    const tt = game.time;
    const flick = 0.62 + 0.38 * Math.sin(tt * 23) * Math.sin(tt * 7.3) + (Math.sin(tt * 61) > 0.93 ? -0.5 : 0);
    const k = sealed ? 0.08 : Math.max(0.12, flick) * (st === 'open' ? 1.25 : 1);
    S.door.glowMat.color.setRGB(1 * k, 0.83 * k, 0.29 * k);
    S.door.spillMat.opacity = sealed ? 0 : 0.5 * Math.max(0.3, flick);
    if (S.doorSeen || sealed) return;
    const p = game.player;
    if (p.dead || !p.indoor || inPocket() || game.player.frozen) return;
    const s = S.doorSpot, d = p.pos.distanceTo(s.pos);
    S.indoorT += dt;
    let seen = d < 4.5;
    if (!seen && d < 13) {
      const fwd = game.camera.getWorldDirection(_v1), to = _v2.copy(s.pos).sub(game.camera.position).normalize();
      seen = fwd.dot(to) > 0.4;
    }
    if (seen) onSeen();
  }
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function onSeen() {
    S.doorSeen = true;
    game.ui.hud?.bigText(t('THE WRONG DOOR'), t('It was not here a second ago.'));
    sfx('light_flicker', 0.7);
    const prof = game.profile;
    const first = !prof?.w3?.seen;
    if (prof) { prof.w3 = { ...(prof.w3 || {}), seen: (prof.w3?.seen || 0) + 1 }; try { saveProfile(prof); } catch { /* ignore */ } }
    game.later?.(() => { try { game.lore?.say?.(t(first ? ALGO_LINES[0] : ALGO_LINES[Math.floor(Math.random() * ALGO_LINES.length)])); } catch { /* ignore */ } }, 1800);
  }

  // ------------------------------------------------------------------ pocket skin + extras
  const SKIN_MATS = ['wall', 'floor', 'ceil'];
  function cleanupSkin() {
    const tp = S.tp;
    for (const [m, sv] of tp.saved || []) {
      if (sv.map !== undefined) { m.map = sv.map; m.needsUpdate = true; }
      if (sv.tint) m.userData.tint?.value.copy(sv.tint);
      if (sv.desat !== undefined && m.userData.desat) m.userData.desat.value = sv.desat;
      if (sv.color !== undefined) m.color.setHex(sv.color);
      if (sv.opacity !== undefined) m.opacity = sv.opacity;
    }
    for (const [e, c] of tp.emit || []) e.color = c;
    if (tp.extra) { tp.extra.removeFromParent(); tp.extra.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } }); }
    if (tp.colliders && game.physics) for (const c of tp.colliders) { try { game.physics.removeCollider(c); } catch { /* ignore */ } }
    S.zap = []; S.deep = [];
  }
  function applySkin(pk, th) {
    cleanupSkin();
    S.tp = { pk, th, saved: new Map(), emit: new Map(), extra: null, colliders: [] };
    S.dark = 0; S.saltN = 0; S.lie = 1;
    const T = THEMES[th];
    if (!pk || !T || !T.fog) return;
    const tp = S.tp;
    const mats = {};
    pk.group.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m?.name?.startsWith('brpocket:')) mats[m.name.slice(9)] = m; });
    const tex = themeTextures(th);
    for (const n of SKIN_MATS) {
      const m = mats[n]; if (!m || !tex) continue;
      tp.saved.set(m, { map: m.map, tint: m.userData.tint?.value.clone(), desat: m.userData.desat?.value });
      m.map = tex[n]; m.userData.tint?.value.set(1, 1, 1); if (m.userData.desat) m.userData.desat.value = 0; m.needsUpdate = true;
    }
    if (mats.base) { tp.saved.set(mats.base, { tint: mats.base.userData.tint?.value.clone() }); mats.base.userData.tint?.value.set(0.5, 0.5, 0.52); }
    if (mats.panel) { tp.saved.set(mats.panel, { color: mats.panel.color.getHex() }); mats.panel.color.setHex(T.panel); }
    if (mats.puddle) { tp.saved.set(mats.puddle, { color: mats.puddle.color.getHex(), opacity: mats.puddle.opacity }); mats.puddle.color.setHex(th === 'pool' ? 0x3a90a0 : th === 'data' ? 0x14304a : th === 'fun' ? 0x5a1020 : th === 'asylum' ? 0x2a3a2a : 0x20100a); }
    if (mats.stain) { tp.saved.set(mats.stain, { opacity: mats.stain.opacity }); mats.stain.opacity = 0.25; }
    for (const e of pk.emitters || []) if (e.color === 0xfff0c8) { tp.emit.set(e, e.color); e.color = T.light; }   // the green EXIT lamp keeps its colour
    buildExtras(pk, th, T);
  }
  function buildExtras(pk, th, T) {
    const tp = S.tp, P = pk.plan, Y = P.y;
    const extra = new THREE.Group();
    extra.name = 'w3_pocket_extra';
    // props
    const plan = planPocketDressing(P, new RNG(hashString('w3dress|' + P.key + '|' + th) >>> 0), th);
    const batch = new BoxBatch(Y);
    for (const p of plan) {
      if (!addProp(batch, p, null, true)) continue;
      const kd = POCKET_KINDS[p.kind];
      if (kd.solid) {
        const rc = p.rect;
        try { tp.colliders.push(game.physics.addStaticBox((rc.x0 + rc.x1) / 2, Y + kd.h / 2, (rc.z0 + rc.z1) / 2, (rc.x1 - rc.x0) / 2, kd.h / 2, (rc.z1 - rc.z0) / 2, 0, G.STATIC, { kind: 'static', w3: true })); } catch { /* ignore */ }
        pk.nav.blockBox(rc.x0, rc.z0, rc.x1, rc.z1, 0.05);
      }
    }
    const atlas = th === 'hotel' ? numberAtlas() : null;
    const grp = batch.build('w3_props', atlas);
    extra.add(grp);
    tp.rerollPlates = grp.userData.rerollPlates || null;
    const rng = new RNG(hashString('w3zone|' + P.key + '|' + th) >>> 0);
    const spots = [];
    for (let i = 0; i < 90 && spots.length < 24; i++) { const w = pk.nav.randomWalkable(() => rng.next()); if (w && Math.hypot(w.x - pk.spawn.x, w.z - pk.spawn.z) > 9 && Math.hypot(w.x - pk.exit.interact.x, w.z - pk.exit.interact.z) > 6) spots.push(w); }
    const disc = (x, z, rx, rz, mat, y) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat); m.rotation.x = -Math.PI / 2; m.scale.set(rx, rz, 1); m.position.set(x, Y + y, z); m.renderOrder = 2; extra.add(m); return m; };
    if (th === 'pool') {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(P.W * P.C, P.H * P.C), new THREE.MeshLambertMaterial({ color: 0x5fc4d4, emissive: 0x0c2c34, transparent: true, opacity: 0.3, depthWrite: false }));
      sheet.rotation.x = -Math.PI / 2; sheet.position.set(P.ox + P.W * P.C / 2, Y + 0.045, P.oz + P.H * P.C / 2); sheet.name = 'w3_water'; sheet.renderOrder = 1;
      extra.add(sheet);
      const dm = new THREE.MeshLambertMaterial({ color: 0x1c6c84, emissive: 0x0a2a36, transparent: true, opacity: 0.6, depthWrite: false });
      for (const w of spots.slice(0, T.deep)) { disc(w.x, w.z, T.deepR, T.deepR, dm, 0.06); S.deep.push({ x: w.x, z: w.z, r: T.deepR }); }
    } else if (th === 'data') {
      const list = (P.puddles || []).slice(0, 12);
      list.forEach((q, i) => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x3ac8ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false });
        const mesh = disc(q.x, q.z, q.rx * 1.15, q.rz * 1.15, mat, 0.04);
        S.zap.push({ x: q.x, z: q.z, rx: q.rx * 1.15, rz: q.rz * 1.15, ph: (i * 1.7) % T.zapEvery, mat, mesh, fired: false });
      });
    }
    game.scene.add(extra);
    tp.extra = extra;
  }
  function skinTick(dt) {
    const pk = bk()?.pocket || null;
    const id = pk ? (themeId() || 'l0') : 'l0';
    if (pk !== S.tp.pk || id !== S.tp.th) { try { applySkin(pk, id); } catch (e) { console.warn('worlds3 skin', e); S.tp = { pk, th: id }; } }
    return pk && id !== 'l0' ? THEMES[id] : null;
  }

  // ------------------------------------------------------------------ per-frame gameplay inside a themed pocket
  const noisePing = (pos, loud) => {
    try {
      if (game.stealth?.emit) game.stealth.emit('step', pos.x, pos.y, pos.z, loud);
      else if (game.isHost) game.creatures?.noise?.(pos.clone(), loud, null);
    } catch { /* ignore */ }
  };
  function hazardTick(dt, T, th) {
    const p = game.player;
    if (p.dead || !inPocket()) return;
    const tt = game.time, pk = S.tp.pk;
    if (th === 'pool') {
      for (const d of S.deep) if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < d.r) { p.slowT = Math.max(p.slowT || 0, T.deepSlow); p.stamina = Math.max(0, p.stamina - T.deepStamina * dt); break; }
      S.stepT -= dt;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (S.stepT <= 0 && sp > 1.2 && !p.sneak && !p.crouch) { S.stepT = T.echoEvery; noisePing(p.pos, p.sprinting ? T.echoLoud : T.echoLoud * 0.55); }   // Alt / crouch stay silent
    } else if (th === 'data') {
      for (const z of S.zap) {
        z.ph += dt;
        const left = T.zapEvery - z.ph;
        const warn = left < T.zapWarn;
        z.mat.color.setHex(warn ? (Math.sin(tt * 40) > 0 ? 0xffffff : 0x3ac8ff) : 0x3ac8ff);
        z.mat.opacity = warn ? 0.85 : 0.3 + 0.08 * Math.sin(tt * 3 + z.x);
        if (z.ph >= T.zapEvery) {
          z.ph = 0;
          if (Math.hypot((p.pos.x - z.x) / z.rx, (p.pos.z - z.z) / z.rz) < 1 && p.pos.y < pk.y + 1.2) {
            game.damageLocal?.(T.zapDmg, 'electric', null);
            game.engine?.flash?.(0x8fe0ff, 0.5); game.engine?.shake?.(0.3); sfx('spark', 0.7);
          } else if (Math.hypot(p.pos.x - z.x, p.pos.z - z.z) < 12) sfx('spark', 0.25);
        }
      }
    }
  }
  function lightsTick(dt, T, th) {
    const pk = S.tp.pk;
    if (th !== 'hotel' || !pk) return;
    if (S.dark > 0) { S.dark -= dt; pk.setLight(S.dark > 0 ? 0.05 : 1); }
  }

  // exit help: hint distance (hotel lies), marker, void catch
  function exitTick(dt, th) {
    const p = game.player, pk = bk()?.pocket;
    const inside = !!pk && !p.dead && pk.contains(p.pos);
    if (inside !== S.inPk) {
      S.inPk = inside; S.inT = 0;
      if (inside) { const T = THEMES[themeId() || 'l0']; game.ui.toast(t(T.hint), 'info'); if (th === 'asylum') game.ui.hud?.bigText(t('THE DOORS LOCK BEHIND YOU'), t('Find the ward key.')); }
      else { S.marker?.dispose(); S.marker = null; }
    }
    if (inside) {
      S.inT += dt;
      if (S.inT > 150 && pk.exit?.signPos) {
        if (!S.marker) S.marker = new WorldMarker('▲', '#3dff85', 9);
        const d = Math.round(p.pos.distanceTo(pk.exit.signPos));
        if (!S.marker.update(dt, game.camera, pk.exit.signPos, `▲<br>${tf('EXIT {d} m', { d: Math.max(1, Math.round(d * (th === 'hotel' ? S.lie : 1))) })}`)) S.marker = null;
      }
      S.voidT = 0;
    } else if (bk()?.state?.m?.includes(game.selfId) && pk && !p.dead) {
      // a member who is somehow outside the pocket volume (fell through a seam): put them back on their feet
      S.voidT += dt;
      if (S.voidT > 4 && p.pos.y < pk.y - 6) { p.teleport(pk.spawn.clone(), p.yaw); S.voidT = 0; game.ui.toast(t('The level spat you back out.'), 'info'); }
    } else S.voidT = 0;
  }

  // ------------------------------------------------------------------ host: hotel blackouts (+ concierge), asylum lock
  function hostTick(dt) {
    const b = br(), pk = bk()?.pocket;
    if (!b?.k || !pk || !b.m?.length) return;
    const th = b.th || 'l0', T = THEMES[th], H = S.hostT;
    if (th === 'hotel') {
      H.dark -= dt;
      if (H.dark <= 0) {
        H.dark = T.blackoutEvery * (0.8 + Math.random() * 0.4);
        S.saltN++;
        game.net.broadcast('w3fx', { k: 'dark', d: T.blackoutLen, s: S.saltN, lie: 1 + (Math.random() < 0.5 ? -1 : 1) * T.mapLie * (0.5 + Math.random() * 0.5) });
        for (const id of [...H.mq]) { const c = game.creatures.host.get(id); if (!c || c.dead) H.mq.delete(id); }
        if (H.mq.size < 2 && CREATURES.mannequin) { const c = bk().hostSpawnHunter?.('mannequin'); if (c) H.mq.add(c.id); }
      }
    } else if (th === 'asylum' && b.lk) {
      H.lockT = (H.lockT || 0) + dt; H.keyT -= dt;
      if (H.keyT <= 0) {
        H.keyT = 0.5;
        const key = H.keyId != null ? game.items.get(H.keyId) : null;
        if (key) H.keySeen = true;
        const taken = H.keySeen ? (!key || key.state !== 'world' || !!key.holder) : H.lockT > 6;   // never appeared: release the lock
        if (taken || H.lockT > T.lockMax) { b.lk = 0; game.broadcastRun(['br']); game.net.broadcast('w3fx', { k: 'unlock', auto: !taken }); }
      }
    }
  }

  // ------------------------------------------------------------------ mod events
  on('netReady', (net) => {
    net.on_('w3fx', (d, from) => {
      if (!fromHost(from) || !d) return;
      if (d.k === 'dark') {
        S.dark = d.d || 6; S.lie = Number.isFinite(d.lie) ? d.lie : 1;
        const a = numberAtlas(); a.salt = d.s | 0; S.tp.rerollPlates?.();
        if (inPocket()) { sfx('power_down', 0.6); game.ui.toast(t('The lights go out. Something checks in.'), 'bad'); }
      } else if (d.k === 'unlock' && inPocket()) {
        sfx('door_unlock', 0.7);
        game.ui.toast(d.auto ? t('The ward doors give way. Somebody pities you.') : t('The ward doors unlock.'), 'good');
      }
    });
  });
  on('mapLoaded', () => { try { dressFacility(); } catch (e) { console.warn('worlds3 dress', e); disposeDress(); } });
  on('phase', (ph) => {
    if (ph === 'orbit' || ph === 'fired') { disposeDoor(); disposeDress(); if (S.tp.pk) { cleanupSkin(); S.tp = { pk: null, th: 'l0' }; } }
    if (ph === 'moon' && S.size && game.world.facility && !game.onboard?.fr?.calm?.('extras')) game.ui.toast(tf('Facility size: {c}', { c: t(SIZE_NAME[S.size]) }), 'info');
  });
  on('objectives', (add, g, phase) => {
    if (phase !== 'moon' || game.player.dead) return;
    const p = game.player;
    if (inPocket()) {
      const pk = bk().pocket, th = themeId() || 'l0';
      if (br()?.lk) add(t('Find the ward key - the EXIT is locked'), 'main');
      if (S.inT > 100 && pk.exit?.signPos) add(tf('Green EXIT sign: about {d} m', { d: Math.max(1, Math.round(p.pos.distanceTo(pk.exit.signPos) * (th === 'hotel' ? S.lie : 1) / 5) * 5) }), 'main');
      return;
    }
    const s = S.doorSpot;
    if (!s || !p.indoor || (br()?.sp || 'idle') === 'sealed') return;
    const guaranteed = doorChance(run().day, MOONS[run().moon]?.brGlitch) >= 1;
    if (S.doorSeen || S.indoorT > (guaranteed ? 60 : 150)) add(tf('The wrong door: about {d} m away', { d: Math.max(5, Math.round(p.pos.distanceTo(s.pos) / 5) * 5) }), 'hint');
  });
  on('update', (dt) => {
    if (!run() || !bk()) return;
    try {
      doorTick(dt);
      const T = skinTick(dt);
      const th = T ? themeId() : 'l0';
      if (T) { hazardTick(dt, T, th); lightsTick(dt, T, th); }
      exitTick(dt, th);
      if (S.tp.extra && S.tp.th === 'pool') { const sh = S.tp.extra.getObjectByName('w3_water'); if (sh) sh.material.opacity = 0.28 + 0.05 * Math.sin(game.time * 1.3); }
      if (game.isHost) hostTick(dt);
    } catch (e) { if (!S.errLogged) { S.errLogged = true; console.error('worlds3', e); } }
  });
  // themed ambience on top of the pocket hum
  patch(game, 'updateAmbience', (prev) => function () {
    prev.call(this);
    const T = theme();
    if (T?.ambience && T.fog && !game.player.dead && bk()?.pocket?.contains?.(game.camera.position)) {
      const a = game.audio;
      if (a.has(T.ambience)) a.setAmbience('base', T.ambience, T.ambVol || 0.5);
    }
  });

  function dispose() {
    for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
    for (const un of patches.splice(0).reverse()) { try { un(); } catch { /* ignore */ } }
    restoreSizes();
    cleanupSkin(); S.tp = { pk: null, th: 'l0' };
    disposeDoor(); disposeDress();
    S.marker?.dispose(); S.marker = null;
    if (game.w3 === hooks) delete game.w3;
  }
  game.w3 = hooks;
  return hooks;
}
