// HORROR module (wave 4, `this.useModule('horror', installHorror)`): pay-to-arm TRAPS, the OUTBREAK wing, the dark oak MANSION, bigger-on-the-inside CLOSETS, CHALK + The Forger,
// and the FAKE closet ambush. Docs: docs/wave4/horror.md.
//   Pure rules ........ horror_core.js (traps, pricing, chalk, facility plan, fake closet rules)     Maps ....... horror_maps.js (pocket tile maps)
//   Builders .......... horror_pocket.js / horror_closet.js / horror_traps.js / horror_chalk.js       Host ........ horror_host.js
//   Creatures ......... horror_creatures.js (Shambler, Forger, Closet Thing, Manor Warden)              Models ...... ../models/horror_models.js
// Integration with the facility: NO generator edits. On the `mapLoaded` event every peer reads the finished layout (planFacility: deterministic from the seed), then builds
// closets / trap corridors as extra objects and the pockets far away (x >= 8000, facility floor plane). Extension point for other modules: `game.horror.plan`,
// `game.horror.pockets`, `game.mods.emit('horrorPlan', plan, game)` (fired after planning, plan is mutable) - see the docs.
//
// Net (all prefixed 'hr'): request 'hrReq' {op: arm|door|crest|fake|chalk|wipe|head|herb|rest|box|secret|sync}, host -> all 'hrs' (state), 'hrfx' (effects), 'hrch' (chalk).
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t, tf, sysMsg } from '../core/i18n.js';
import { registerItem, ITEMS } from './items.js';
import { FOODS } from './food_data.js';
import { G } from '../physics/physics.js';
import { MOONS } from './moons.js';
import { registerHorrorCreatures, HOOKS } from './horror_creatures.js';
import { HR_CREATURE_MODELS, HR_ITEM_MODELS } from '../models/horror_models.js';
import { TR, RU, TIP, DEATH_TEXT } from './horror_text.js';
import {
  TRAPS, newTrap, trapZoneOf, planFacility, closetFrame, CLOSET, CELL, CHALK, ChalkStore, decodeMark, FAKE, openerMode, ZOMBIE, HEADSHOT_MUL, SIDEARM,
} from './horror_core.js';
import { POCKET_SPECS, TILE } from './horror_maps.js';
import { buildPocket, pocketOrigin } from './horror_pocket.js';
import { buildCloset, toWorld, toLocal, worldBox, portalMap } from './horror_closet.js';
import { TrapView } from './horror_traps.js';
import { ChalkView, drawRequest } from './horror_chalk.js';
import { installHost } from './horror_host.js';

HOST_ONLY.add('hrs'); HOST_ONLY.add('hrfx'); HOST_ONLY.add('hrch');

const V3 = THREE.Vector3;
const LONG_TOOLS = new Set(['shovel', 'pipe', 'stopsign', 'sledge', 'machete', 'harpoon', 'crowbar', 'bat', 'nailbat', 'katana', 'ladder', 'rod']);
const DEATH = DEATH_TEXT;

// ------------------------------------------------------------------------------------------------ items (registered once, ids stable)
function registerHorrorItems() {
  const add = (d) => { if (!ITEMS[d.id]) registerItem(d); };
  add({ id: 'hr_chalk', name: 'Chalk', kind: 'tool', weight: 0, hands: 1, price: 6, shop: 'tools', tier: 'common',
    tip: TIP.chalk });
  add({ id: 'hr_crest', name: 'Wolf Crest', kind: 'tool', weight: 1, hands: 1, tip: TIP.crest });
  add({ id: 'hr_specimen', name: 'Sealed Sample Case', kind: 'scrap', value: [110, 170], weight: 3, hands: 1, tip: TIP.specimen });
  add({ id: 'fd_herb', name: 'Green Herb', kind: 'consumable', food: 'food', weight: 0.5, hands: 1, tier: 'uncommon', value: [3, 7], tip: TIP.herb });
  if (!FOODS.fd_herb) FOODS.fd_herb = { kind: 'food', name: 'Green Herb', tier: 'uncommon', price: 0, weight: 0.5, value: [3, 7], use: 1.3, hp: 35, buffs: [], tip: TIP.herbShort };
}

export function installHorror(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  registerHorrorCreatures();
  registerHorrorItems();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.creatureModels) for (const [id, fn] of Object.entries(HR_CREATURE_MODELS)) if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, (T, o) => fn(o || {}));
  if (mm?.itemModels) for (const [id, fn] of Object.entries(HR_ITEM_MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn());

  const S = {
    active: false, L: null, plan: null, group: null, closets: [], pockets: [], traps: [], store: new ChalkStore(), chalk: null, host: null,
    gen: 0, time: 0, portalCd: 0, herbsTaken: new Set(), boxN: new Map(), tellT: 0, lastChalk: 0, headT: 0, hintShown: false, disposed: false, portals: 0,
  };
  const X = {
    g, S,
    sys: (key, vars, kind) => sysMsg(key, vars, kind),
    name: (id) => g.playerName?.(id) || 'Employee',
  };
  const toast = (m, k = 'info') => { try { g.ui.toast(m, k); } catch { /* ui optional */ } };
  const snd = (name, pos, vol = 1, o = {}) => { try { if (g.audio?.has?.(name)) g.audio.at(name, pos, vol, { occlude: true, refDistance: 3, maxDistance: 45, ...o }); } catch { /* audio optional */ } };
  const localSnd = (name, vol = 0.5, pitch = 1) => { try { if (g.audio?.has?.(name)) g.audio.play(name, { volume: vol, bus: 'sfx', pitch }); } catch { /* audio optional */ } };
  const closetById = (id) => S.closets.find((c) => c.id === id);
  const posOfMe = () => g.player.pos;

  // ================================================================================ build / teardown (every peer, from the finished facility)
  function teardown() {
    S.gen++;
    S.host?.dispose?.(); S.host = null;
    for (const T of S.traps) T.view.dispose();
    for (const c of S.closets) c.view.dispose();
    for (const p of S.pockets) p?.dispose();
    S.chalk?.dispose(); S.chalk = null;
    S.group?.removeFromParent(); S.group = null;
    S.traps = []; S.closets = []; S.pockets = []; S.plan = null; S.L = null; S.active = false;
    S.store.clear(); S.herbsTaken.clear(); S.boxN.clear();
  }
  function blockNav(fac, frame, W = CLOSET.w) {
    const b = worldBox(frame.wallX, frame.wallZ, frame.fx, frame.fz, 0, CLOSET.d / 2, W + 0.2, CLOSET.d + 0.1);
    fac.nav.blockBox(b.x - b.sx / 2, b.z - b.sz / 2, b.x + b.sx / 2, b.z + b.sz / 2, 0.1);
  }
  function panelFor(L, pt) {
    const [cx, cz] = pt.panelCell, C = CELL;
    const dirs = pt.axis === 'x' ? [1, 3] : [0, 2];
    const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    let d = dirs.find((k) => !L.open.has(L.edgeKey(cx, cz, k)));
    if (d === undefined) d = dirs[0];
    const x = L.ox + cx * C + C / 2 + DX[d] * (C / 2 - 0.08), z = L.oz + cz * C + C / 2 + DZ[d] * (C / 2 - 0.08);
    return { x, y: L.y + 1.3, z, nx: -DX[d], nz: -DZ[d] };
  }
  function build(world) {
    teardown();
    const fac = world?.facility;
    if (!fac || !g.run || !fac.layout) return;
    const L = fac.layout;
    let plan;
    try { plan = planFacility(L, { day: g.run.day, quotaIndex: g.run.quotaIndex }); } catch (e) { console.warn('[horror] plan', e); return; }
    try { mods.emit('horrorPlan', plan, g); } catch (e) { console.warn('[horror] horrorPlan', e); }
    S.L = L; S.plan = plan; S.active = true;
    S.group = new THREE.Group(); S.group.name = 'horror'; g.scene.add(S.group);
    S.chalk = new ChalkView(g.scene);
    // [wave8 QA] the rest is split into small landQ jobs (one per closet / pocket / trap), same order as before, so no single 0.2-3.5 s slice
    const gen = S.gen;
    const job = (name, fn) => {
      const run = () => { if (gen !== S.gen || S.disposed) return; try { fn(); } catch (e) { console.warn('[horror] ' + name, e); } };
      if (g.landQ?.addNext) g.landQ.addNext('horror:' + name, run); else run();
    };
    // ---- closets + pockets
    plan.closets.forEach((pc, i) => {
      let entry = null;
      job('closet' + i, () => {
        const frame = closetFrame(L, pc.cell);
        const style = pc.kind === 'outbreak' ? 'quarantine' : pc.kind === 'mansion' ? 'mansion' : 'plain';
        const view = buildCloset(frame, { style, physics: g.physics, wide: pc.kind === 'mansion' });
        S.group.add(view.group);
        blockNav(fac, frame, view.W);
        entry = { id: i, kind: pc.kind, frame, view, pocket: null, locked: pc.kind === 'outbreak', unlocked: false, fake: false, tellT: 0 };
        S.closets.push(entry);
      });
      job('pocket' + i, () => {
        if (!entry) return;
        const { ox, oz } = pocketOrigin(i);
        const pocket = buildPocket(POCKET_SPECS[pc.kind], { physics: g.physics, lightPool: g.lights, ox, oz, y: L.y, seed: (L.seed ^ (i * 7919)) >>> 0 });
        pocket.index = i; g.scene.add(pocket.group);
        S.pockets[i] = pocket; entry.pocket = pocket;
        // pocket traps (the outbreak wing's crusher corridor)
        (pocket.spec.traps || []).forEach((tp, k) => addPocketTrap(pocket, tp, 50 + i * 10 + k));
      });
    });
    if (plan.fake) {
      job('fake', () => {
        const frame = closetFrame(L, plan.fake.cell);
        const view = buildCloset(frame, { style: 'plain', physics: g.physics, fake: true });
        S.group.add(view.group); blockNav(fac, frame, view.W);
        S.closets.push({ id: plan.fake.id, kind: 'fake', frame, view, pocket: null, locked: false, unlocked: false, fake: true, tellT: 2 });
      });
    }
    // ---- traps in the corridors
    const lasers = fac.hazards?.lasers || [];
    plan.traps.forEach((pt, ti) => job('trap' + ti, () => {
      const zone = trapZoneOf(L, pt);
      if (lasers.some((h) => Math.hypot((h.cx ?? h.x) - zone.cx, (h.cz ?? h.z) - zone.cz) < 8)) return;   // never stack on the built-in laser grids
      const ceil = L.heightOf[L.idx(pt.cells[0][0], pt.cells[0][1])] || L.corridorH || 3.3;
      const view = new TrapView(pt, zone, ceil, panelFor(L, pt), L.seed);
      S.group.add(view.group);
      S.traps.push({ uid: pt.id, desc: pt, view, zone, panel: view.panelPos || { x: zone.cx, y: zone.y + 1.3, z: zone.cz }, st: newTrap(pt.type) });
    }));
    job('host', () => {
      S.host = g.isHost ? installHost(X) : null;
      if (!g.isHost) g.net?.request?.('hrReq', { op: 'sync' });
    });
  }
  function addPocketTrap(pocket, tp, uid) {
    const [bx, bz, bw, bh] = tp.box;
    const x0 = pocket.ox + bx * TILE, x1 = pocket.ox + (bx + bw) * TILE, z0 = pocket.oz + bz * TILE, z1 = pocket.oz + (bz + bh) * TILE;
    const zone = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, axis: tp.axis, len: tp.axis === 'x' ? x1 - x0 : z1 - z0, wid: (tp.axis === 'x' ? z1 - z0 : x1 - x0) - 0.3, y: pocket.y };
    const P = tp.panel, DXs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[P.side];
    const panel = { x: pocket.ox + P.x * TILE + TILE / 2 + DXs[0] * (TILE / 2 - 0.08), y: pocket.y + 1.3, z: pocket.oz + P.z * TILE + TILE / 2 + DXs[1] * (TILE / 2 - 0.08), nx: -DXs[0], nz: -DXs[1] };
    const desc = { id: uid, type: tp.type, axis: tp.axis };
    const view = new TrapView(desc, zone, pocket.spec.H, panel, uid);
    S.group.add(view.group);
    S.traps.push({ uid, desc, view, zone, panel: view.panelPos || panel, st: newTrap(tp.type) });
  }

  // ================================================================================ portals (local player only; positions are owned by their peer)
  function crossOver(c, toPocket) {
    const p = g.player;
    const A = toPocket ? c.frame : c.pocket.entry(), B = toPocket ? c.pocket.entry() : c.frame;
    const m = portalMap(A, B, toPocket ? TILE : CLOSET.d, p.pos);
    const vel = m.vel(p.vel.x, p.vel.z);
    p.teleport(new V3(m.x, m.y, m.z), p.yaw + m.th);
    p.vel.x = vel[0]; p.vel.z = vel[1];
    g.psTimer = 0;
    S.portalCd = 0.9; S.portals++;
    if (!toPocket && !c.view.isOpen) g.net.request('hrReq', { op: 'door', i: c.id, o: 1 });
    localSnd('door_creak', 0.5, 0.7);
    try { g.engine.flash(0x000000, 0.35); } catch { /* engine optional */ }
    if (toPocket) toast(t(c.pocket.spec.title), 'info');
  }
  function checkPortals(dt) {
    S.portalCd = Math.max(0, S.portalCd - dt);
    const p = g.player;
    if (S.portalCd > 0 || p.dead || !S.active) return;
    for (const c of S.closets) {
      if (c.fake || !c.pocket) continue;
      let lc = toLocal(c.frame, p.pos.x, p.pos.z);
      if (Math.abs(p.pos.y - c.frame.y) < 2 && Math.abs(lc.lx) < c.view.W / 2 - 0.05 && lc.lz > 0.15 && lc.lz < 0.8 && c.view.state.open > 0.55) { crossOver(c, true); return; }
      if (!c.pocket.contains(p.pos)) continue;
      const B = c.pocket.entry();
      lc = toLocal(B, p.pos.x, p.pos.z);
      if (Math.abs(p.pos.y - B.y) < 2 && Math.abs(lc.lx) < 0.98 && lc.lz > 0.15 && lc.lz < 0.8) { crossOver(c, false); return; }
    }
  }

  // ================================================================================ client: net handlers
  function applyTraps(list) {
    for (const [uid, s, c, u, pr] of list || []) { const T = S.traps.find((x) => x.uid === uid); if (T) { T.st.s = s; T.st.charges = c; T.view.setState(s, c, u, pr); T.left = u; T.price = pr; } }
  }
  function onState(d) {
    if (!S.active || !d) return;
    switch (d.t) {
      case 'trs': applyTraps(d.a); break;
      case 'door': { const c = closetById(d.i); if (c) { c.view.setOpen(!!d.o); if (d.v) { try { g.engine.shake(0.35); } catch { /* ignore */ } } } break; }
      case 'lock': { const c = closetById(d.i); if (c) c.unlocked = !!d.u; break; }
      case 'herb': { S.herbsTaken.add(d.p + ':' + d.id); const sp = S.pockets[d.p]?.spots.herb.find((h) => h.id === d.id); if (sp?.leaves) sp.leaves.visible = false; break; }
      case 'sec': S.pockets[d.p]?.setSecretOpen(d.i, !!d.o); break;
      case 'box': S.boxN.set(d.p, d.n); break;
      case 'all':
        applyTraps(d.a);
        for (const [id, o, u] of d.doors || []) { const c = closetById(id); if (c) { c.unlocked = !!u; c.view.setOpen(!!o); } }
        for (const k of d.herbs || []) { const [p, id] = String(k).split(':').map(Number); S.herbsTaken.add(k); const sp = S.pockets[p]?.spots.herb.find((h) => h.id === id); if (sp?.leaves) sp.leaves.visible = false; }
        for (const k of d.sec || []) { const [p, i] = String(k).split(':').map(Number); S.pockets[p]?.setSecretOpen(i, true); }
        for (const [p, n] of d.boxes || []) S.boxN.set(p, n);
        break;
      default: break;
    }
  }
  function onFx(d) {
    if (!d || !S.active) return;
    const me = posOfMe();
    switch (d.k) {
      case 'shake': { const dd = Math.hypot(me.x - d.p[0], me.z - d.p[2]); if (dd < 30) g.engine.shake?.(Math.min(1, (d.a || 0.5) * (1 - dd / 30))); break; }
      case 'refund': try { g.ui.hud?.floatText(new V3(d.p[0], d.p[1], d.p[2]), '+▮' + d.n, '#ffd070'); } catch { /* hud optional */ } break;
      case 'deny': toast(d.why === 'credits' ? tf('Not enough credits. It costs ▮{n}.', { n: d.n }) : d.why === 'limit' ? t('This trap has been used enough for today.') : d.why === 'busy' ? t('It is already armed.') : d.why === 'nocrest' ? t('You need the Wolf Crest in your hands.') : d.why === 'box' ? t('The box will not take that.') : t('Nothing happens.'), 'bad'); break;
      case 'unlock': { const c = closetById(d.i); if (c) snd('safe_click', new V3(c.frame.wallX, c.frame.y + 1, c.frame.wallZ), 1, { refDistance: 6 }); break; }
      case 'knock': { const c = closetById(d.i); if (c) { const dp = toWorld(c.frame, 0, CLOSET.d); snd('hit_wall', new V3(dp.x, c.frame.y + 1.2, dp.z), 0.7, { pitch: 1.5 }); if (d.ans) g.later?.(() => { if (S.active) snd('spider_skitter', new V3(dp.x, c.frame.y + 1, dp.z), 0.7, { pitch: 0.6 }); }, 300); } break; }
      case 'rest': { const p = g.player; p.stamina = p.maxStamina; p.stunT = 0; p.slowT = 0; localSnd('ui_confirm', 0.5); toast(d.first ? t('You typed up the report. Progress saved. (+XP)') : t('The typewriter clacks. You catch your breath.'), 'good'); try { g.progress?.save?.(); } catch { /* ignore */ } break; }
      default: break;
    }
  }
  function onChalk(d) {
    if (!S.chalk || !d) return;
    if (d.all) S.chalk.clear();   // (the host's authoritative store is never touched by its own broadcast)
    for (const id of d.rm || []) S.chalk.remove(id);
    for (const a of d.all || d.a || []) { const m = decodeMark(a); if (m) S.chalk.add(m); }
  }
  on('netReady', (net) => {
    net.on_('hrs', (d) => { try { onState(d); } catch (e) { console.warn('[horror] hrs', e); } });
    net.on_('hrfx', (d) => { try { onFx(d); } catch (e) { console.warn('[horror] hrfx', e); } });
    net.on_('hrch', (d) => { try { onChalk(d); } catch (e) { console.warn('[horror] hrch', e); } });
  });
  on('registerHandlers', (H, gg) => { if (gg === g) H('hrReq', (d, from) => { if (S.host) S.host.onRequest(d, from); }); });
  on('playerJoin', (id) => { if (S.host && S.active) { g.later?.(() => { if (S.active) S.host?.sendAll(id); }, 1500); S.host.giveChalk?.(id); } });

  // ================================================================================ interactables
  const heldDef = () => g.player.heldItem?.()?.def;
  const hasLongTool = () => { const it = g.player.heldItem?.(); if (!it) return false; const d = it.def || {}; return LONG_TOOLS.has(it.type) || (d.kind === 'weapon' && !d.ranged && (d.reach || 0) >= 2.0); };
  function trapLabel(T) {
    const st = T.st.s, TR2 = TRAPS[T.desc.type];
    if (st === 'idle' || st === 'spent') return tf('Arm the {@name} ▮{n} [E]', { name: TR2.name, n: T.price ?? TR2.price });
    if (st === 'armed') return tf('{@name}: armed, {c} strike(s) left', { name: TR2.name, c: T.st.charges });
    return t(TR2.name);
  }
  on('interactables', (out) => {
    if (!S.active || S.disposed) return;
    const p = g.player;
    if (p.dead || !p.indoor) return;
    try {
      for (const T of S.traps) {
        if (Math.hypot(p.pos.x - T.panel.x, p.pos.z - T.panel.z) > 5) continue;
        out.push({ pos: new V3(T.panel.x, T.panel.y, T.panel.z), r: 0.6, reach: 2.6, label: () => trapLabel(T), sub: () => t(TRAPS[T.desc.type].blurb), action: () => { if (T.st.s === 'idle' || T.st.s === 'spent') g.net.request('hrReq', { op: 'arm', i: T.uid }); } });
      }
      for (const c of S.closets) {
        const dp = toWorld(c.frame, 0, CLOSET.d);
        if (Math.hypot(p.pos.x - dp.x, p.pos.z - dp.z) > 6) continue;
        const pos = new V3(dp.x, c.frame.y + 1.15, dp.z);
        if (c.fake || !c.view.isOpen) {
          const locked = c.locked && !c.unlocked;
          const label = () => {
            if (locked) return g.player.heldItem?.()?.type === 'hr_crest' ? t('Slot the Wolf Crest into the door [E]') : t('Quarantine door - locked');
            const m = openerMode({ crouch: g.player.crouch, longTool: hasLongTool() });
            return m === 'knock' ? t('Knock on the door [E]') : m === 'hook' ? t('Hook the door open [E]') : c.kind === 'mansion' ? t('Open the wardrobe [E]') : c.kind === 'outbreak' ? t('Open the quarantine door [E]') : t('Open the cabinet [E]');
          };
          out.push({
            pos, r: 0.95, reach: hasLongTool() && !locked ? FAKE.hookReach - 0.3 : 2.2, label, sub: locked && g.player.heldItem?.()?.type !== 'hr_crest' ? () => t('A crest-shaped hollow. The crest is somewhere in this building.') : '',
            action: () => {
              const m = openerMode({ crouch: g.player.crouch, longTool: hasLongTool() });
              if (locked) { if (g.player.heldItem?.()?.type === 'hr_crest') g.net.request('hrReq', { op: 'crest', i: c.id }); else { localSnd('door_locked', 0.7); toast(t('It will not budge. There is a crest-shaped hollow in it.'), 'info'); } return; }
              if (c.fake) { g.net.request('hrReq', { op: 'fake', i: c.id, mode: m }); return; }
              if (m === 'knock') { snd('hit_wall', pos, 0.6, { pitch: 1.5 }); toast(t('You knock. The sound goes on for far too long.'), 'info'); return; }
              g.net.request('hrReq', { op: 'door', i: c.id, o: 1 });
            },
          });
        }
      }
      for (const pk of S.pockets) {
        if (!pk || !pk.contains(p.pos)) continue;
        for (const h of pk.spots.herb) {
          if (S.herbsTaken.has(pk.index + ':' + h.id) || Math.hypot(p.pos.x - h.x, p.pos.z - h.z) > 4) continue;
          out.push({ pos: new V3(h.x, h.y, h.z), r: 0.6, reach: 2.6, label: t('Pick the green herb [E]'), action: () => g.net.request('hrReq', { op: 'herb', p: pk.index, id: h.id }) });
        }
        const tw = pk.spots.typewriter;
        if (tw && Math.hypot(p.pos.x - tw.x, p.pos.z - tw.z) < 4) out.push({ pos: new V3(tw.x, tw.y, tw.z), r: 0.8, reach: 2.8, label: t('Use the typewriter [E]'), sub: t('A safe room. The shamblers do not come in here.'), action: () => g.net.request('hrReq', { op: 'rest', p: pk.index }) });
        const bx = pk.spots.box;
        if (bx && Math.hypot(p.pos.x - bx.x, p.pos.z - bx.z) < 4) {
          const held = g.player.heldItem?.(), n = S.boxN.get(pk.index) || 0;
          out.push({
            pos: new V3(bx.x, bx.y, bx.z), r: 0.8, reach: 2.8,
            label: () => (g.player.crouch || !g.player.heldItem?.() ? (n > 0 ? tf('Take the last item out of the box ({n}) [E]', { n }) : t('The item box is empty')) : t('Put the held item into the box [E]')),
            sub: t('Crouch to take things out again. Kept until the ship leaves.'),
            action: () => { const h = g.player.heldItem?.(); if (g.player.crouch || !h) g.net.request('hrReq', { op: 'box', act: 'take', p: pk.index }); else g.net.request('hrReq', { op: 'box', act: 'put', p: pk.index, id: h.id }); },
          });
          void held;
        }
        for (const s of pk.spots.secret) {
          if (s.open || Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > 3.6) continue;
          out.push({ pos: new V3(s.x, s.y, s.z), r: 1.0, reach: 2.8, label: t('Push the loose bookshelf [E]'), action: () => g.net.request('hrReq', { op: 'secret', p: pk.index, i: s.i }) });
        }
      }
      // rub out a chalk mark: only while holding the chalk, so the prompts do not clutter the screen
      const held = p.heldItem?.();
      if (held?.type === CHALK.item && S.chalk) {
        for (const m of S.chalk.marks.values()) {
          if (Math.hypot(m.x - p.pos.x, m.z - p.pos.z) > 3.4) continue;
          out.push({ pos: new V3(m.x, m.y, m.z), r: 0.45, reach: 3.4, label: t('Rub out the chalk mark [E]'), action: () => g.net.request('hrReq', { op: 'wipe', id: m.id }) });
        }
      }
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[horror] interactables', e); } }
  });

  // ================================================================================ chalk drawing (LMB while holding the chalk)
  on('useItem', (it, hk, gg) => {
    if (gg !== g || !it || hk.handled || it.type !== CHALK.item || !S.active) return;
    hk.handled = true;
    const now = g.time || 0;
    if (now - S.lastChalk < 0.22) return;
    S.lastChalk = now;
    const p = g.player, eye = g.camera.position, fwd = p.forward();
    const hit = g.physics.raycast(eye, fwd, CHALK.reach, G.STATIC);
    const req = hit && drawRequest(hit, fwd, p.vel, p.crouch);
    if (!req) { toast(t('Nothing to draw on.'), 'info'); return; }
    g.net.request('hrReq', { op: 'chalk', ...req });
    localSnd('cloth_rustle', 0.35, 1.9);
    if (!S.hintShown) { S.hintShown = true; toast(t('LMB: arrow (points where you go). Crouch + LMB: X. E rubs a mark out.'), 'info'); }
  });

  // ================================================================================ patches on game instances (restored on dispose)
  const patches = [];
  const patch = (obj, key, make) => { if (!obj) return; const prev = obj[key]; const own = Object.prototype.hasOwnProperty.call(obj, key); const fn = make(prev); obj[key] = fn; patches.push(() => { if (obj[key] === fn) { if (own) obj[key] = prev; else delete obj[key]; } }); };
  const M = g.creatures;
  const pocketAt = (pos) => S.pockets.find((p) => p && p.contains(pos)) || null;
  patch(M, 'nav', (prev) => function (c) { const pk = c && S.active ? pocketAt(c.pos) : null; return pk ? pk.nav : prev.call(this, c); });
  patch(M, 'playersFor', (prev) => function (c) {
    const list = prev.call(this, c);
    if (!S.active || !c || !S.pockets.length) return list;
    const here = pocketAt(c.pos);
    return list.filter((p) => (pocketAt(p.pos) === here));
  });
  patch(g, 'deathText', (prev) => function (cause) { return DEATH[cause] ? t(DEATH[cause]) : prev.call(this, cause); });
  // zombie headshots: when the local crosshair ray hits the upper part of a Shambler, tell the host (it doubles the next hit's damage)
  patch(M, 'raycast', (prev) => function (origin, dir, maxDist, filter) {
    const r = prev.call(this, origin, dir, maxDist, filter);
    try {
      if (r && r.view.type === 'hr_zombie' && r.view.state !== 'dead' && (g.time || 0) - S.headT > 0.12) {
        const hy = origin.y + dir.y * r.t - r.view.pos.y;
        if (hy >= r.view.height * ZOMBIE.headFrac) { S.headT = g.time || 0; g.net.request('hrReq', { op: 'head', cid: r.view.id }); r.head = true; }
      }
    } catch { /* never break aiming */ }
    return r;
  });

  // ================================================================================ frame update
  on('update', (dt) => {
    if (!S.active || S.disposed) return;
    S.time += dt;
    const cam = g.camera?.position;
    try {
      for (const c of S.closets) c.view.update(dt, S.time);
      for (const pk of S.pockets) pk?.update(dt);
      for (const T of S.traps) T.view.update(dt, cam);
      if (!g.player.dead && g.player.indoor) checkPortals(dt);
      // fake closet tells: faint scratching behind the door, more often the closer you are
      for (const c of S.closets) {
        if (!c.fake || c.view.isOpen) continue;
        const dp = toWorld(c.frame, 0, CLOSET.d), d = Math.hypot(cam.x - dp.x, cam.z - dp.z);
        if (d > FAKE.tellRange || Math.abs(cam.y - c.frame.y) > 3) continue;
        c.tellT -= dt;
        if (c.tellT <= 0) { c.tellT = 3 + Math.random() * 4.5 - (1 - d / FAKE.tellRange) * 1.5; snd('spider_skitter', new V3(dp.x, c.frame.y + 0.8, dp.z), 0.16 + 0.12 * (1 - d / FAKE.tellRange), { pitch: 0.5 + Math.random() * 0.15, refDistance: 1.5, maxDistance: 12 }); }
      }
    } catch (e) { if (!S.warnedU) { S.warnedU = true; console.warn('[horror] update', e); } }
    if (S.host) { try { S.host.tick(dt); } catch (e) { if (!S.warnedH) { S.warnedH = true; console.warn('[horror] host tick', e); } } }
  });
  on('mapLoaded', (world) => { try { build(world); } catch (e) { console.warn('[horror] build', e); teardown(); } });
  on('moonPopulated', () => { try { S.host?.populate(); } catch (e) { console.warn('[horror] populate', e); } });
  on('phase', (ph) => { if (ph === 'orbit' || ph === 'fired') teardown(); });

  const api = {
    S, X,
    get plan() { return S.plan; }, get closets() { return S.closets; }, get pockets() { return S.pockets; }, get traps() { return S.traps; }, get chalk() { return S.chalk; }, get store() { return S.store; },
    /** debug / tests: teleport the local player into pocket i (or back out) through the same maths as the closet */
    enter(i = 0, out = false) { const c = closetById(i); if (!c?.pocket) return false; if (!out) c.view.setOpen(true); crossOver(c, !out); return true; },
    /** debug / tests (host): arm trap `uid` without paying */
    armFree(uid) { const T = S.traps.find((x) => x.uid === uid); if (!T || !S.host) return false; T.st.s = 'armed'; T.st.charges = TRAPS[T.desc.type].charges; T.st.until = (g.time || 0) + 60; T.st.by = g.selfId; T.st.paid = TRAPS[T.desc.type].price; T.st.refunded = 0; S.host.sendTraps(); return true; },
    stats: () => ({ active: S.active, closets: S.closets.map((c) => c.kind), pockets: S.pockets.length, traps: S.traps.map((x) => x.desc.type), marks: S.chalk?.count() || 0, portals: S.portals }),
    SIDEARM, HEADSHOT_MUL,
    dispose() {
      S.disposed = true;
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      teardown();
      for (const undo of patches.splice(0).reverse()) { try { undo(); } catch { /* ignore */ } }
    },
  };
  void HOOKS; void MOONS;
  return api;
}
