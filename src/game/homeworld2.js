// HOMEWORLD 2 (wave 4, module 'homeworld2'; docs/wave4/homeworld2.md, rules + numbers: homeworld2_core.js, tested by tools/harness/homeworld2.test.mjs).
// On top of the classic homeworld (homeworld.js): a Satisfactory-lite factory (nodes, miners, belts, smelters, assemblers, poles + generators, export docks),
// snap-to-grid rooms and a garden (trees), Clash-of-Clans-lite waves (telegraphed timer, base value scaling, first wave gated, shield after a loss) that reuse
// the classic on-site raid, and ghost raids on other bases (homeworld2_ghost.js). The factory runs on the HOST whenever a run is live (any phase); offline
// progress is credited from the same simulation (8 h max, 10 % rate). Everything is host-authoritative.
// Net (all prefixed 'h2'): request h2act {op,...} (client -> host); h2msg (host -> all / one): ops (layout diff), full (layout chunks), s (belt items + lamps
// at 4 Hz while somebody is home), tg (tree growth), ok / err / code / banner / wdone / gtr / gcr / gwin.  run.h2 = small meta (wave clock, power, income).
// State: host profile.homeworld2 (the layout; belt items are transient), clients mirror the layout from ops.
import * as THREE from 'three';
import { t, tf, addTranslations, sysMsg } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { ITEMS, registerItem } from './items.js';
import { FOODS } from './food_data.js';
import { WEAPON_ARCS } from '../models/avatar.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { hudDock } from '../ui/dock.js';
import * as H from './homeworld_core.js';
import * as X from './homeworld2_core.js';
import { HOME_Y, CONSOLE_POS } from '../world/homeworld_map.js';
import { createFactoryView, createPieceGhost, createKitGhost, createGridPatch, appleModel } from '../models/homeworld2.js';
import { createHomeworld2Panel } from '../ui/panels/homeworld2.js';
import { installGhostRaid, GMOON } from './homeworld2_ghost.js';
import { H2_TR, H2_RU } from './homeworld2_i18n.js';

HOST_ONLY.add('h2msg');
// the garden's fruit is a real food item (healing is food-only in TFG). Registered here instead of in food_data.js so the food module's own tests / tables stay untouched.
if (!FOODS.fd_apple) {
  FOODS.fd_apple = { kind: 'food', name: 'Homegrown Apple', tier: 'common', price: 0, weight: 0.5, value: [4, 8], use: 1.4, hp: 22, buffs: [], loot: {},
    tip: 'LMB: eat. Heals 22 HP. Grown on the homeworld, no chemistry involved.' };
  registerItem({ id: 'fd_apple', name: FOODS.fd_apple.name, kind: 'consumable', food: 'food', weight: 0.5, hands: 1, tier: 'common', value: [4, 8], tip: FOODS.fd_apple.tip });
  if (WEAPON_ARCS.fd_pizza && !WEAPON_ARCS.fd_apple) WEAPON_ARCS.fd_apple = WEAPON_ARCS.fd_pizza;
}
addTranslations(H2_TR, 'tr'); addTranslations(H2_RU, 'ru');

const CSS = `#h2-hint{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:30;font:22px var(--font,'VT323',monospace);color:#d8f4ff;background:rgba(6,14,22,.86);border:1px solid #3fa8d8;padding:4px 14px;pointer-events:none;text-shadow:0 0 8px rgba(63,168,216,.5);max-width:90vw;text-align:center}
#h2-hint.bad{color:#ff8a7a;border-color:#a83a2a}
#h2-hud{font:19px var(--font,'VT323',monospace);color:#d8f4ff;background:rgba(6,14,22,.82);border:1px solid #2f7fa8;padding:4px 9px;min-width:210px}
#h2-hud b{color:#7fe8ff}#h2-hud .bad{color:#ff6b5a}#h2-hud .warn{color:#ffd23f}#h2-hud .ok{color:#7dff7d}#h2-hud small{opacity:.75}`;

const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const FC = X.FC;
const why = (w) => { const m = /^Limit reached \((\d+)\)/.exec(String(w)); return m ? tf('Limit reached ({n})', { n: m[1] }) : t(String(w)); };
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function installHomeworld2(game) {
  const mods = game.mods, offs = [];
  let disposed = false, panel = null, boundNet = null, view = null, viewKey = '', viewGroup = null, hintEl = null, hudEl = null, hudT = 0, hostT1 = 0, snapT = 0, saveT = 0, commitT = 0, metaT = 0, syncReq = 0;
  let sim = null, acc = 0, fx = { storage: 0, speed: 0, cloutPerMin: 0, greenhouse: new Set(), rooms: 0 }, incEma = 0, waveActive = null, offRep = null, cloutAcc = 0, treeAcc = 0, ver = 1, lastMeta = '';
  const cl = { seed: 1, ver: 0, p: [], n: 1, st: { exported: 0 }, pvp: 0, g: { raided: {}, imported: [] }, wv: { left: 0, n: 0, armed: 0, shield: 0 }, full: new Map() };   // client mirror of the layout
  let snapMsg = { at: 0, items: [], states: '' }, facList = [], machineIds = [], cellIdx = new Map(), occ = new Map(), nodesCache = { seed: -1, list: [] };
  const colMap = new Map();   // piece id -> { key, cols[] }
  const pm = { on: false, mode: 'piece', type: null, kit: null, r: 0, ghost: null, grid: null, x: 0, z: 0, ok: false, why: '', key: '', drag: null, lastReq: 0, sel: null };
  const host = () => !!game.isHost;
  const st = () => game.profile.homeworld2;
  const layout = () => {
    if (host()) return st();
    const m = meta(); cl.pvp = m.pvp || 0; cl.st = m.st || cl.st; cl.g.raided = m.raided || {}; cl.g.imported = m.imp || []; if (m.seed) cl.seed = m.seed; cl.wv = m.w || cl.wv;
    return cl;
  };
  const hwState = () => (host() ? game.profile.homeworld : game.run?.hw) || H.blankState();
  const meta = () => game.run?.h2 || {};
  const onHome = () => !!(MOONS[game.run?.moon]?.home && !MOONS[game.run?.moon]?.ghost && game.run?.phase === 'moon' && game.world?.outdoor?.home);
  const homePhase = () => !!(MOONS[game.run?.moon]?.home && !MOONS[game.run?.moon]?.ghost && game.run?.phase === 'moon');
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos) || null;
  const nodes = () => { const s = layout(); if (nodesCache.seed !== s.seed) nodesCache = { seed: s.seed, list: X.genNodes(s.seed) }; return nodesCache.list; };
  if (!document.getElementById('tfg-h2-hud-css')) { const s = document.createElement('style'); s.id = 'tfg-h2-hud-css'; s.textContent = CSS; document.head.appendChild(s); }

  const ctx = { layout, hw: hwState, st, host, meta, commit: (extra) => commitHw(extra) };
  const ghost = installGhostRaid(game, ctx);
  if (mods.itemModels && !mods.itemModels.has('fd_apple')) mods.itemModels.set('fd_apple', () => appleModel());

  // =========================================================================================== HOST: state
  const newSeed = () => (hash(String(Math.random()) + Date.now()) % 0x7fffffff) + 1;
  function attach() {
    const p = game.profile, hadSeed = !!p.homeworld2?.seed;
    p.homeworld2 = X.sanitize(p.homeworld2, p.homeworld);
    if (!hadSeed) p.homeworld2.seed = newSeed();
    const s = p.homeworld2, hw = p.homeworld;
    ver = 1; waveActive = null;
    recomputeFx();
    // ---- offline catch-up: the same belt simulation, 10 % of the rate, 8 h max, bounded by the storage caps
    const now = Date.now();
    if (s.ms > 0 && now > s.ms) {
      const el = (now - s.ms) / 1000;
      if (el > 60) {
        let gain = { cr: 0, parts: 0, s2: 0, sec: 0 }, waste = { cr: 0, parts: 0, s2: 0 };
        if (s.p.some((q) => X.isMachine(q.t))) {
          try { const rates = X.measureRates(s, { shore: X.shoreSurplus(hw), speedBonus: fx.speed }); gain = X.offlineGain(rates, el); waste = X.applyGain(hw, gain); } catch (e) { console.warn('[h2] offline', e); }
        }
        const grown = Math.min(el, X.OFFLINE.maxSec);
        X.growTrees(s, grown, fx.greenhouse, X.OFFLINE.treeEff);
        offRep = { sec: Math.round(Math.min(el, X.OFFLINE.maxSec)), cr: Math.round(gain.cr), parts: Math.round(gain.parts * 10) / 10, s2: Math.round(gain.s2 * 10) / 10, full: waste.cr > 1 || waste.parts > 0.5 ? 1 : 0 };
      }
    }
    s.ms = now;
    rebuildSim();
    game.run.hw = hw; game.run.h2 = null; sendMeta(true);
    game.progress?.save?.();
  }
  function recomputeFx() {
    const s = st(), hw = game.profile.homeworld;
    fx = X.roomEffects(s);
    hw.xcap = fx.storage;
  }
  function rebuildSim() {
    const s = st(), hw = game.profile.homeworld, old = sim;
    sim = new X.FactorySim(s, { shore: X.shoreSurplus(hw), room: X.roomOf(hw), speedBonus: fx.speed, nodes: nodes() });
    if (!old) return;
    const om = new Map(old.st.map((q) => [q.p.i, q]));
    for (const q of sim.st) {
      const o = om.get(q.p.i);
      if (!o || o.p.x !== q.p.x || o.p.z !== q.p.z || o.p.r !== q.p.r || o.p.t !== q.p.t) continue;
      q.item = o.item; q.prog = o.prog; q.rr = o.rr; q.out = o.out.slice(); q.busy = o.busy; q.tok = o.tok; q.vt = o.vt; q.fuel = o.fuel; q.fuelBuf = o.fuelBuf; q.mp = o.mp;
      if (o.buf && q.buf) q.buf = o.buf.slice();
    }
    sim.sold = old.sold; sim.made = old.made; sim.circuits = old.circuits; sim.gain = old.gain; sim.time = old.time;
  }
  function commitHw(extra = []) {
    if (!host()) return;
    game.run.hw = game.profile.homeworld;
    try { game.broadcastRun(['hw', ...extra]); game.progress?.save?.(); } catch (e) { console.warn('[h2] commit', e); }
    sendMeta(true);
  }
  const snapMap = () => new Map(st().p.map((p) => [p.i, JSON.stringify(X.pack(p))]));
  function broadcastDiff(before) {
    const s = st(), a = [], d = [];
    const cur = new Set();
    for (const p of s.p) { cur.add(p.i); const j = JSON.stringify(X.pack(p)); if (before.get(p.i) !== j) a.push(X.pack(p)); }
    for (const id of before.keys()) if (!cur.has(id)) d.push(id);
    if (!a.length && !d.length) return;
    ver += 1;
    game.net.broadcast('h2msg', { k: 'ops', v: ver, a, d, n: s.n });
  }
  function sendFull(to) {
    const s = st(), all = s.p.map(X.pack), per = 90, chunks = Math.max(1, Math.ceil(all.length / per));
    for (let i = 0; i < chunks; i++) game.net.sendTo(to, 'h2msg', { k: 'full', v: ver, seed: s.seed, n: s.n, i, of: chunks, p: all.slice(i * per, (i + 1) * per) });
  }
  const err = (to, why) => game.net.sendTo(to, 'h2msg', { k: 'err', why });

  // =========================================================================================== HOST: actions
  function hostAct(d, from) {
    if (!host() || !d || typeof d.op !== 'string') return;
    if (d.op === 'sync') { sendFull(from); return; }
    if (d.op.startsWith('g') || d.op === 'pvp') { ghost.hostAct(d, from); return; }
    if (!homePhase()) return err(from, 'You must be on the homeworld.');
    const s = st(), hw = game.profile.homeworld, i = (v) => Math.floor(Number(v) || 0);
    if (d.op === 'call') {
      if (waveActive || game.homeworld?.raid) return err(from, 'A wave is already under way.');
      if (s.wv.shield > Date.now()) return err(from, 'Shield is up: no waves right now.');
      if (!X.callWave(s.wv)) return err(from, 'The next wave is too close to call early.');
      commitHw(); return;
    }
    if (d.op === 'harvest') return hostHarvest(d, from);
    const before = snapMap();
    const wallet = { cr: game.run.credits };
    let r, batch = 0;
    switch (d.op) {
      case 'build': r = X.tryBuild(s, hw, wallet, String(d.t), i(d.x), i(d.z), i(d.r)); break;
      case 'belts': {   // drag-laying: [[x, z, r], ...] - existing belts are only re-rotated (free), new ones cost
        r = { ok: false, why: 'Blocked by another piece.' };
        for (const e of (Array.isArray(d.l) ? d.l : []).slice(0, 48)) {
          const x = i(e?.[0]), z = i(e?.[1]), rr = i(e?.[2]) & 3, ex = s.p.find((p) => p.t === 'belt' && p.x === x && p.z === z);
          if (ex) { if (ex.r !== rr) { ex.r = rr; r = { ok: true }; batch++; } continue; }
          const q = X.tryBuild(s, hw, wallet, 'belt', x, z, rr);
          if (q.ok) { r = q; batch++; } else if (!batch) r = q;
        }
        if (batch) r = { ok: true };
        break;
      }
      case 'kit': r = X.tryBuildKit(s, hw, wallet, String(d.k), i(d.x), i(d.z)); break;
      case 'up': r = X.tryUpgrade(s, hw, wallet, i(d.id)); break;
      case 'sell': {
        const p = X.pieceById(s, i(d.id));
        if (p?.t === 'tree') { const at = posOf(from), w = X.treeWood(p); if (at && ITEMS.comp_wood) for (let k = 0; k < w; k++) game.items.hostSpawn('comp_wood', new THREE.Vector3(at.x + (Math.random() - 0.5), at.y + 0.8, at.z + (Math.random() - 0.5)), {}); }
        r = X.trySell(s, hw, wallet, i(d.id)); break;
      }
      case 'rot': r = X.tryRotate(s, hw, i(d.id)); break;
      case 'repair': r = X.tryRepair(s, hw, wallet, d.id === 'all' ? 'all' : i(d.id)); break;
      default: return;
    }
    if (!r.ok) return err(from, r.why);
    game.run.credits = wallet.cr;
    recomputeFx(); rebuildSim(); broadcastDiff(before);
    commitHw(['credits']);
    game.net.broadcast('h2msg', { k: 'ok', by: from, op: d.op, t: d.t });
  }
  function hostHarvest(d, from) {
    const s = st(), p = X.pieceById(s, Math.floor(Number(d.id) || 0)), at = posOf(from);
    if (!p || p.t !== 'tree' || !at) return;
    const c = X.centerOf(p);
    if (Math.hypot(c.x - at.x, c.z - at.z) > 7) return err(from, 'Too far from the tree.');
    if (X.treeStage(p.a || 0) < 2 || !(p.f > 0)) return err(from, 'Nothing to pick yet.');
    const n = X.harvestTree(p);
    if (ITEMS.fd_apple) for (let k = 0; k < n; k++) game.items.hostSpawn('fd_apple', new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.8, at.y + 0.9, at.z + (Math.random() - 0.5) * 0.8), {});
    s.st.harvested += n;
    game.net.broadcast('h2msg', { k: 'tg', t: [[p.i, Math.round(p.a), p.f]] });
    game.net.broadcast('h2msg', { k: 'ok', by: from, op: 'harvest', n });
    game.progress?.save?.();
  }

  // =========================================================================================== HOST: tick (factory, trees, rooms, waves)
  const anyoneHome = () => homePhase() && game.aiPlayers().length > 0;
  function hostTick(dt) {
    const s = st(); if (!s || !sim) return;
    acc += dt;
    for (let n = 0; acc >= X.STEP && n < 6; n++) { acc -= X.STEP; sim.step(X.STEP); }
    if (acc > 1) acc = 0;
    hostT1 += dt;
    if (hostT1 >= 1) { const el = hostT1; hostT1 = 0; secondTick(el); }
    snapT -= dt;
    if (snapT <= 0 && anyoneHome()) { snapT = 0.25; game.net.broadcast('h2msg', { k: 's', v: ver, it: X.encodeItems(sim), st: X.encodeStates(sim) }); }
    if (host()) ghost.hostTick(dt);
  }
  function secondTick(el) {
    const s = st(), hw = game.profile.homeworld;
    // ---- credits: the export docks paid into the sim's gain buffer
    const g = sim.takeGain(), val = X.valueOfGain(g);
    if (val > 0) { const w = X.applyGain(hw, g); s.st.exported += val; void w; }
    incEma += (val / el * 60 - incEma) * Math.min(1, el / 45);
    sim.shore = X.shoreSurplus(hw); sim.room = X.roomOf(hw); sim.speedBonus = fx.speed;
    // ---- bedroom Clout
    if (fx.cloutPerMin > 0) { cloutAcc += fx.cloutPerMin / 60 * el; if (cloutAcc >= 1) { const n = Math.floor(cloutAcc); cloutAcc -= n; hw.s.clout = Math.min(H.capOf(hw, 'clout'), hw.s.clout + n); } }
    // ---- trees (real time, greenhouse x2)
    treeAcc += el;
    if (treeAcc >= 5) {
      const changed = X.growTrees(s, treeAcc, fx.greenhouse, 1); treeAcc = 0;
      if (changed) game.net.broadcast('h2msg', { k: 'tg', t: s.p.filter((p) => p.t === 'tree').map((p) => [p.i, Math.round(p.a), p.f]) });
    }
    // ---- waves
    const gate = X.waveGate(hw, s), value = X.baseValue(hw, s), now = Date.now();
    const busy = !!(waveActive || game.homeworld?.raid || game.run?.hwr && !game.run.hwr.done || ghost.onGhost());
    const before = s.wv.left, tw = X.tickWave(s.wv, el, { gate, value, active: anyoneHome(), busy, nowMs: now });
    if (tw.fire) fireWave(value);
    else if (anyoneHome() && s.wv.armed && !busy) {
      for (const mark of [60, 30, 10]) if (before > mark && s.wv.left <= mark) game.net.broadcast('h2msg', { k: 'warn', s: mark });
    }
    // ---- housekeeping
    commitT += el; if (commitT >= 5) { commitT = 0; commitHw(); }
    saveT += el; if (saveT >= 20) { saveT = 0; s.ms = Date.now(); game.progress?.save?.(); }
    sendMeta(false);
  }
  function fireWave(value) {
    const s = st(), power = X.wavePower(value, s.wv.n, game.run.quotaIndex || 0), called = s.wv.called;
    let ok = false;
    try { ok = !!game.homeworld?.forceRaid?.({ power }); } catch (e) { console.warn('[h2] wave', e); }
    if (!ok) { s.wv.left = 20; return; }   // a raid is running or the classic module is off: try again shortly
    waveActive = { called: !!called, power, value };
    game.net.broadcast('h2msg', { k: 'banner', main: t('WAVE INCOMING'), sub: t('Creatures are coming for your base. Defend it!') });
  }
  /** called by homeworld.js when a raid finished. Only the waves this module fired count as waves. */
  function onRaidDone(res) {
    if (!host() || !waveActive) return;
    const wa = waveActive; waveActive = null;
    const s = st(), hw = game.profile.homeworld, kind = res.kind, now = Date.now();
    X.endWave(s.wv, kind, X.baseValue(hw, s), now);
    s.st.waves += 1; s.st[kind === 'breached' ? 'lost' : 'repelled'] += 1;
    const loot = X.waveLoot(wa.power, kind, wa.called);
    hw.s.parts = Math.min(H.capOf(hw, 'parts'), hw.s.parts + loot.parts); hw.s.s2 = Math.min(H.capOf(hw, 's2'), hw.s.s2 + loot.s2); game.run.credits += loot.cr;
    // a lost wave breaks machines (never deletes them): they need a repair
    const machines = s.p.filter((p) => X.isMachine(p.t) && !p.br);
    let broke = 0;
    const n = kind === 'breached' ? Math.min(2, machines.length) : kind === 'held' && Math.random() < 0.3 ? Math.min(1, machines.length) : 0;
    for (let k = 0; k < n; k++) { const i = Math.floor(Math.random() * machines.length); machines[i].br = 1; machines.splice(i, 1); broke++; }
    const before = broke ? null : undefined;
    void before;
    if (broke) { game.net.broadcast('h2msg', { k: 'ops', v: ++ver, a: s.p.filter((p) => p.br).map(X.pack), d: [], n: s.n }); rebuildSim(); }
    commitHw(['credits']);
    game.net.broadcast('h2msg', { k: 'wdone', kind, cr: loot.cr, parts: loot.parts, s2: loot.s2, broke, shield: s.wv.shield, left: s.wv.left });
  }
  function sendMeta(force) {
    if (!host() || !game.run) return;
    const s = st(), hw = game.profile.homeworld;
    if (!s) return;
    const P = sim?.powerInfo() || { supply: 0, demand: 0 };
    const gate = X.waveGate(hw, s);
    const m = {
      v: ver, w: { left: Math.round(s.wv.left), armed: s.wv.armed, shield: s.wv.shield, n: s.wv.n }, gate: { n: gate.n, v: gate.v, ok: gate.ok ? 1 : 0 }, pw: { sup: Math.round(P.supply * 10) / 10, dem: Math.round(P.demand * 10) / 10, un: P.unpowered || 0 },
      inc: Math.round(incEma * 10) / 10, gt: s.g.target || null, pvp: s.pvp, exported: Math.round(s.st.exported), st: s.st, raided: s.g.raided,
      mine: s.g.mine ? { id: 'mine', name: s.g.mine.name, tier: s.g.mine.tier, value: s.g.mine.value, stash: s.g.mine.stash, n: s.g.mine.b.length } : null,
      imp: s.g.imported.map((g) => ({ id: g.id, name: g.name, tier: g.tier, value: g.value, stash: g.stash, n: g.b.length })),
      rooms: fx.rooms, storage: Math.round(fx.storage * 100) / 100, speed: Math.round(fx.speed * 100) / 100, clout: Math.round(fx.cloutPerMin * 100) / 100, off: offRep, seed: s.seed,
    };
    const j = JSON.stringify(m);
    if (!force && j === lastMeta) return;
    lastMeta = j; game.run.h2 = m;
    try { game.broadcastRun(['h2']); } catch { /* run not ready */ }
  }

  // =========================================================================================== CLIENT: layout mirror
  function applyOps(m) {
    if (host()) return;
    if (cl.ver === 0) { requestSync(); return; }
    if (m.v !== cl.ver + 1) { if (m.v > cl.ver) requestSync(); return; }
    const byId = new Map(cl.p.map((p) => [p.i, p]));
    for (const d of m.d || []) byId.delete(d);
    for (const a of m.a || []) { const p = X.unpack(a); if (!p) continue; const old = byId.get(p.i); if (old && p.t === 'tree') { p.ft = old.ft || 0; } byId.set(p.i, p); }
    cl.p = [...byId.values()]; cl.ver = m.v; cl.n = m.n || cl.n; viewKey = '';
  }
  function applyFull(m) {
    if (host()) return;
    cl.full.set(m.i, m.p);
    cl.seed = m.seed; cl.n = m.n;
    if (cl.full.size < m.of) return;
    const all = []; for (let i = 0; i < m.of; i++) all.push(...(cl.full.get(i) || []));
    cl.full.clear(); cl.p = all.map(X.unpack).filter(Boolean); cl.ver = m.v; viewKey = '';
  }
  function requestSync() { const n = performance.now(); if (n - syncReq < 2000) return; syncReq = n; game.net.request('h2act', { op: 'sync' }); }
  function applyTrees(list) {
    const S = layout();
    for (const [id, a, f] of list || []) { const p = S.p.find((q) => q.i === id); if (p) { p.a = a; p.f = f; } }
    viewKey = viewKey + '.';   // repaint (host and client)
  }

  // =========================================================================================== VIEW (instanced) + colliders
  function wallMaskOf(p, byCell) {
    let ax = 0, az = 0;
    for (const [dx, dz] of X.DIR) { const o = byCell.get(X.CELL_KEY(p.x + dx, p.z + dz) * 4); if (o && (o.t === 'wall' || o.t === 'window' || o.t === 'door')) { if (dx) ax = 1; else az = 1; } }
    return [ax, az];
  }
  function syncColliders(S) {
    const out = game.world?.outdoor; if (!out) return;
    const byCell = new Map(); for (const p of S.p) if (X.PT[p.t].layer === 'g') for (const [x, z] of X.cellsOf(p.t, p.x, p.z, p.r)) byCell.set(X.CELL_KEY(x, z) * 4, p);
    const seen = new Set();
    for (const p of S.p) {
      const d = X.PT[p.t];
      if (!d.solid || d.layer !== 'g') continue;
      seen.add(p.i);
      const [w, h] = X.dims(p.t, p.r), cx = (p.x + w / 2) * FC, cz = (p.z + h / 2) * FC;
      let boxes;   // [x, y(center), z, hx, hy, hz]
      if (p.t === 'wall' || p.t === 'window') { const [ax, az] = wallMaskOf(p, byCell); boxes = [[cx, HOME_Y + 1.3, cz, ax && !az ? FC / 2 : az && !ax ? 0.18 : FC / 2 - 0.05, 1.3, az && !ax ? FC / 2 : ax && !az ? 0.18 : FC / 2 - 0.05]]; }
      else if (p.t === 'tree') boxes = [[cx, HOME_Y + 1.1, cz, 0.35, 1.1, 0.35]];
      else if (p.t === 'crate') boxes = [[cx, HOME_Y + 0.48, cz, 0.55, 0.48, 0.55]];
      else if (p.t === 'bench' || p.t === 'bed' || p.t === 'planter') boxes = [[cx, HOME_Y + 0.5, cz, (p.r & 1 ? 0.6 : w * FC / 2 - 0.1), 0.5, (p.r & 1 ? h * FC / 2 - 0.1 : 0.6)]];
      else boxes = [[cx, HOME_Y + 1.2, cz, 1.35, 1.2, 1.35]];
      const key = `${p.t}|${p.x}|${p.z}|${p.r}|${boxes[0][3].toFixed(2)}|${boxes[0][5].toFixed(2)}`;
      const old = colMap.get(p.i);
      if (old && old.key === key) continue;
      if (old) for (const c of old.cols) { game.physics.removeCollider(c); const k = out.colliders.indexOf(c); if (k >= 0) out.colliders.splice(k, 1); }
      const cols = boxes.map((b) => { const c = game.physics.addStaticBox(b[0], b[1], b[2], b[3], b[4], b[5], 0, G.STATIC, { kind: 'h2', id: p.i }); out.colliders.push(c); return c; });
      colMap.set(p.i, { key, cols });
    }
    for (const [id, e] of [...colMap]) if (!seen.has(id)) { for (const c of e.cols) { game.physics.removeCollider(c); const k = out.colliders.indexOf(c); if (k >= 0) out.colliders.splice(k, 1); } colMap.delete(id); }
  }
  function clearColliders() {
    const out = game.world?.outdoor;
    for (const e of colMap.values()) for (const c of e.cols) { try { game.physics.removeCollider(c); } catch { /* gone with the map */ } if (out) { const k = out.colliders.indexOf(c); if (k >= 0) out.colliders.splice(k, 1); } }
    colMap.clear();
  }
  function disposeView() { if (view) { view.dispose(); view = null; viewGroup = null; } clearColliders(); viewKey = ''; }
  function ensureView() {
    const out = game.world?.outdoor;
    if (!onHome() || !out?.home) { if (view) disposeView(); return; }
    if (!view || viewGroup !== out.group) { disposeView(); view = createFactoryView(out.group, nodes()); viewGroup = out.group; }
    const S = layout(), key = `${host() ? ver : cl.ver}|${S.p.length}|${S.seed}`;
    if (key === viewKey) return;
    viewKey = key;
    view.sync(S);
    syncColliders(S);
    facList = S.p.filter((p) => X.isFac(p.t)).sort((a, b) => a.i - b.i);
    machineIds = facList.filter((p) => X.isMachine(p.t)).map((p) => p.i);
    occ = X.occupancy(S);
  }
  function frameView(dt) {
    if (!view) return;
    void dt;
    const list = [], states = new Map();
    if (host() && sim) {
      for (const q of sim.st) if (q.item && (q.p.t === 'belt' || q.p.t === 'splitter')) list.push({ x: q.p.x, z: q.p.z, item: q.item, prog: Math.min(1, q.prog), r: q.p.r });
      for (const k of sim.machines) states.set(sim.st[k].p.i, sim.st[k].state);
    } else {
      const age = Math.min(0.7, (performance.now() - snapMsg.at) / 1000);
      for (const d of snapMsg.items) { const q = facList[d.k]; if (q) list.push({ x: q.x, z: q.z, item: d.item, prog: Math.min(1, d.prog + age * X.BELT_SPEED), r: q.r }); }
      for (let i = 0; i < machineIds.length; i++) states.set(machineIds[i], +(snapMsg.states[i] || 0));
    }
    view.setItems(list); view.setLamps(states);
  }

  // =========================================================================================== CLIENT: panel + placement
  const req = (op, d = {}) => game.net.request('h2act', { op, ...d });
  const api = {
    layout, hw: hwState, req, meta, income: () => (host() ? incEma : meta().inc || 0), ghosts: () => ghost.headers(),
    startPlace, startKit, startSelect, open: openPanel, close: closePanel, stop: stopBuild, core: X, ghost,
    get building() { return pm.on; }, get sim() { return sim; }, get ver() { return host() ? ver : cl.ver; }, nodes,
    growTick: (sec, mult = 1) => (host() && st() ? X.growTrees(st(), sec, fx.greenhouse, mult) : false),   // hook for the survival module: advance the homeworld trees
    onRaidDone, forceWave: () => { if (host()) { const s = st(); s.wv.left = 0.5; s.wv.armed = 1; } },
    stats: () => ({ pieces: layout().p.length, drawCalls: view?.drawCalls?.() || 0, income: api.income(), items: snapMsg.items.length, ver: api.ver }),
  };
  function openPanel(tab = 'build') {
    if (!onHome() || disposed) return;
    stopBuild(); game.homeworld?.stop?.();
    const ctl = createHomeworld2Panel(game.ui, game, api, { tab });
    game.ui.openPanel(ctl.el); panel = ctl;
    game.ui.onPanelClose = () => { ctl.dispose(); if (panel === ctl) panel = null; return false; };
  }
  function closePanel() { if (panel) game.ui.closePanel(); }
  function setHint(text, bad) {
    if (!text) { hintEl?.remove(); hintEl = null; return; }
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.id = 'h2-hint'; document.body.appendChild(hintEl); }
    hintEl.textContent = text; hintEl.classList.toggle('bad', !!bad);
  }
  function dropGhost() { if (pm.ghost) { pm.ghost.root.removeFromParent(); pm.ghost.dispose?.(); pm.ghost = null; } }
  function beginMode() {
    closePanel(); game.homeworld?.stop?.();
    if (!pm.grid) { pm.grid = createGridPatch(7); }
    if (!pm.grid.line.parent) game.scene.add(pm.grid.line);
    pm.on = true; pm.key = ''; pm.drag = null;
  }
  function startPlace(type) {
    if (!X.PT[type]) return;
    beginMode(); dropGhost();
    pm.mode = 'piece'; pm.type = type; pm.kit = null; if (X.dims(type, 0)[0] === 1 && X.PT[type].cat === 'fac') pm.r = pm.r & 3;
    pm.ghost = createPieceGhost(type); game.scene.add(pm.ghost.root);
  }
  function startKit(kind) {
    if (!X.KITS[kind]) return;
    beginMode(); dropGhost();
    pm.mode = 'kit'; pm.kit = kind; pm.type = null;
    pm.ghost = createKitGhost(kind); game.scene.add(pm.ghost.root);
  }
  function startSelect() { beginMode(); dropGhost(); pm.mode = 'select'; pm.type = null; pm.kit = null; }
  function stopBuild() {
    dropGhost(); pm.grid?.line.removeFromParent();
    pm.on = false; pm.type = null; pm.kit = null; pm.drag = null; setHint(null);
  }
  function aim() {
    const eye = game.camera.position, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    if (fwd.y > -0.02) return null;
    const k = (HOME_Y - eye.y) / fwd.y;
    return k > 0 && k < 70 ? { x: eye.x + fwd.x * k, z: eye.z + fwd.z * k } : null;
  }
  const pieceAt = (cx, cz) => {
    const S = layout(), byId = (id) => S.p.find((p) => p.i === id);
    for (const L of [0, 1, 2]) { const id = occ.get(X.CELL_KEY(cx, cz) * 4 + L); if (id) return byId(id); }
    return null;
  };
  const nodeAtCell = (cx, cz) => nodes().find((n) => cx >= n.x && cx < n.x + 2 && cz >= n.z && cz < n.z + 2) || null;
  const dirBetween = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1]; return Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : (dz >= 0 ? 1 : 3); };
  function localCheck(type, x, z, r) {
    const S = layout(), hw = hwState();
    const pc = X.placementCheck(S, hw, type, x, z, r, { nodes: nodes() });
    if (!pc.ok) return pc;
    const c = X.levelCost(type, 1);
    if ((game.run?.credits || 0) < c.cr) return { ok: false, why: 'Not enough credits.' };
    if ((hw.s?.parts || 0) < c.parts) return { ok: false, why: 'Not enough components.' };
    return { ok: true };
  }
  function buildUpdate() {
    const inp = game.input;
    if (!onHome() || game.ui?.panelOpen || game.player?.dead) { if (pm.on) stopBuild(); return; }
    if (game.homeworld?.building && pm.on) { stopBuild(); return; }   // the classic build mode took over
    if (!pm.on) { if (inp?.codePressed('KeyT') && !game.terminal?.active && !game.homeworld?.building) openPanel(); return; }
    if (inp.codePressed('KeyT')) { openPanel(); return; }
    if (inp.mouseClicked(2)) { if (pm.mode !== 'select' && pm.type === null && pm.kit === null) stopBuild(); else if (pm.mode === 'select') stopBuild(); else startSelect(); return; }
    if (inp.codePressed('KeyQ')) { startSelect(); return; }
    const a = aim(), S = layout();
    if (!a) { if (pm.ghost) pm.ghost.root.visible = false; setHint(t('Aim at the ground'), true); return; }
    const type = pm.type || (pm.kit ? 'kit' : null);
    let cx, cz;
    if (pm.mode === 'kit') { const K = X.KITS[pm.kit]; cx = Math.round(a.x / FC - K.w / 2); cz = Math.round(a.z / FC - K.h / 2); }
    else if (type) { const c = X.snapFine(type, pm.r, a.x, a.z); cx = c.x; cz = c.z; }
    else { cx = Math.floor(a.x / FC); cz = Math.floor(a.z / FC); }
    pm.grid?.at(Math.floor(a.x / FC), Math.floor(a.z / FC));
    if (inp.codePressed('KeyR') && pm.mode === 'piece') { pm.r = (pm.r + 1) & 3; pm.key = ''; }
    // ---- info + keys for the piece / node under the crosshair (U upgrade, X / Delete remove, R rotate in select mode, G repair)
    const under = pieceAt(Math.floor(a.x / FC), Math.floor(a.z / FC)), nd = nodeAtCell(Math.floor(a.x / FC), Math.floor(a.z / FC));
    if (pm.mode === 'select' || (under && pm.mode !== 'kit' && !pm.ok)) {
      if (under) {
        const d = X.PT[under.t], up = d.mk && under.l < X.MAX_LV ? X.upgradeCost(under.t, under.l) : null;
        setHint(`${t(d.name)}${d.mk ? ' Mk' + under.l : ''}${under.br ? ' [' + t('BROKEN') + ']' : ''} · [X] ${t('remove')}${d.mk ? ` · [U] ${t('upgrade')}${up ? ' ▮' + up.cr : ''}` : ''}${under.br ? ' · [G] ' + t('repair') : ''}${pm.mode === 'select' || X.dims(under.t, 0)[0] >= 1 ? ' · [R] ' + t('rotate') : ''}`, false);
        if (inp.codePressed('KeyU') && d.mk) req('up', { id: under.i });
        else if (inp.codePressed('KeyX') || inp.codePressed('Delete')) req('sell', { id: under.i });
        else if (inp.codePressed('KeyG') && under.br) req('repair', { id: under.i });
        else if (inp.codePressed('KeyR') && pm.mode === 'select') req('rot', { id: under.i });
      } else if (nd) setHint(`${t({ scrap: 'Scrap node', ore: 'Iron ore node', crystal: 'Data crystal node' }[nd.res])} · ${t(['impure', 'normal', 'pure'][nd.pur])} x${X.PURITY[nd.pur]}`, false);
      else if (pm.mode === 'select') setHint(t('Select mode: aim at a piece. [Q] select · [T] menu · [RMB] leave'), false);
    }
    if (pm.mode === 'select' || !pm.ghost) return;
    // ---- ghost
    const g = pm.ghost.root, d = pm.mode === 'kit' ? null : X.PT[pm.type];
    g.visible = true;
    if (pm.mode === 'kit') { g.position.set(cx * FC, HOME_Y, cz * FC); }
    else { const [w, h] = X.dims(pm.type, pm.r); g.position.set((cx + w / 2) * FC, HOME_Y, (cz + h / 2) * FC); g.rotation.y = -pm.r * Math.PI / 2; }
    const key = `${pm.mode}|${pm.type || pm.kit}|${cx}|${cz}|${pm.r}|${game.run.credits}|${S.p.length}|${host() ? ver : cl.ver}`;
    if (key !== pm.key) {
      pm.key = key; pm.x = cx; pm.z = cz;
      if (pm.mode === 'kit') {
        const cl2 = JSON.parse(JSON.stringify({ p: S.p, n: S.n, seed: S.seed, st: { built: 0 } })), hw2 = { ...hwState(), s: { ...hwState().s } };
        const r = X.tryBuildKit(cl2, hw2, { cr: game.run.credits }, pm.kit, cx, cz);
        pm.ok = !!r.ok; pm.why = r.why || ''; pm.ghost.set(pm.ok);
        setHint(pm.ok ? `${t(KIT_TITLE[pm.kit])} ▮${X.kitCost(pm.kit).cr} ⚙${X.kitCost(pm.kit).parts} · [LMB] ${t('build')} · [RMB] ${t('leave')}` : why(pm.why || 'Blocked'), !pm.ok);
      } else {
        const r = localCheck(pm.type, cx, cz, pm.r);
        pm.ok = !!r.ok; pm.why = r.why || ''; pm.ghost.set(pm.ok);
        setHint(pm.ok ? `${t(d.name)} · [LMB] ${t('place')}${d.size[0] * d.size[1] > 1 ? ' · [R] ' + t('rotate') : pm.type === 'belt' ? ' · [R] ' + t('rotate') : ''}${pm.type === 'belt' || d.cat === 'str' ? ' · ' + t('hold to drag') : ''} · [Q] ${t('select')} · [RMB] ${t('leave')}` : why(pm.why || 'Blocked'), !pm.ok);
      }
    }
    // ---- placing (drag for belts / room pieces)
    const now = performance.now(), dragable = pm.mode === 'piece' && (pm.type === 'belt' || (d.cat === 'str' && d.size[0] * d.size[1] === 1) || pm.type === 'pole');
    if (inp.mouseClicked(0) && pm.ok) {
      if (pm.mode === 'kit') { req('kit', { k: pm.kit, x: cx, z: cz }); stopBuild(); return; }
      if (pm.type === 'belt') { req('belts', { l: [[cx, cz, pm.r]] }); pm.drag = { last: [cx, cz], path: [[cx, cz]] }; }
      else { req('build', { t: pm.type, x: cx, z: cz, r: pm.r }); pm.drag = { last: [cx, cz] }; }
      pm.lastReq = now;
    } else if (inp.mouseDown(0) && pm.drag && dragable && (cx !== pm.drag.last[0] || cz !== pm.drag.last[1]) && now - pm.lastReq > 60) {
      if (pm.type === 'belt') {
        const from = pm.drag.last, dr = dirBetween(from, [cx, cz]);
        const step = [from[0] + X.DIR[dr][0], from[1] + X.DIR[dr][1]];   // one cell at a time keeps the path axis aligned even when the mouse jumps
        pm.r = dr;
        if (localCheck('belt', step[0], step[1], dr).ok || pieceAt(step[0], step[1])?.t === 'belt') { req('belts', { l: [[from[0], from[1], dr], [step[0], step[1], dr]] }); pm.drag.last = step; }
      } else if (pm.ok) { req('build', { t: pm.type, x: cx, z: cz, r: pm.r }); pm.drag.last = [cx, cz]; }
      pm.lastReq = now;
    } else if (!inp.mouseDown(0)) pm.drag = null;
  }
  const KIT_TITLE = { storage: 'Storage Room', workshop: 'Workshop', bedroom: 'Bedroom', greenhouse: 'Greenhouse' };

  // =========================================================================================== HUD + messages
  function hud() {
    if (!onHome()) { hudEl?.remove(); hudEl = null; return; }
    if (!hudEl) hudEl = hudDock('right', 'h2', 40);
    const m = meta(), S = layout(), hw = hwState(), P = m.pw || { sup: 0, dem: 0 }, w = m.w || { left: 0, armed: 0, shield: 0, n: 0 };
    const shield = Math.max(0, Math.round((w.shield - Date.now()) / 1000));
    const full = ['cr', 'parts'].some((k) => hw.s[k] >= H.capOf(hw, k) - 1e-9);
    let wave;
    if (shield > 0) wave = `<span class="ok">${t('SHIELD')} ${mmss(shield)}</span>`;
    else if (w.armed) wave = `<span class="${w.left < 60 ? 'bad' : ''}">${t('NEXT WAVE')} <b>${mmss(w.left)}</b></span>`;
    else wave = `<small>${t('Waves start once you have built a few things.')} ${m.gate ? `${m.gate.n}/${X.WAVE.minPieces} · ▮${m.gate.v}/${X.WAVE.minValue}` : ''}</small>`;
    hudEl.innerHTML = `<div id="h2-hud"><b>${t('FACTORY')}</b> ${S.p.length ? `▮${(host() ? incEma : m.inc || 0).toFixed(1)}/${t('min')} · <span class="${P.dem > P.sup ? 'bad' : ''}">⚡${P.dem}/${P.sup}</span>${P.un ? ` <span class="warn">(${P.un} ${t('unpowered')})</span>` : ''}` : `<small>[T] ${t('build')}</small>`}${full ? `<br><span class="warn">${t('STORAGE FULL')}</span>` : ''}<br>${wave}</div>`;
  }
  const onMsg = (m, from) => {
    if (disposed || !m || (from !== game.net?.hostId && !host())) return;
    switch (m.k) {
      case 'ops': applyOps(m); break;
      case 'full': applyFull(m); break;
      case 's': if (!host()) snapMsg = { at: performance.now(), items: X.decodeItems(m.it || ''), states: m.st || '' }; break;
      case 'tg': applyTrees(m.t); break;
      case 'err': game.ui?.toast(why(m.why), 'bad'); break;
      case 'ok': if (m.by === game.selfId) game.audio?.play?.(m.op === 'sell' ? 'ui_click' : 'ui_buy', { volume: 0.5, bus: 'ui' }); if (m.msg) game.ui?.toast(t(m.msg), 'good'); if (m.op === 'harvest' && m.by === game.selfId) game.ui?.toast(`+${m.n} ${t('Homegrown Apple')}`, 'good'); break;
      case 'code': panel?.setCode?.(m.code); break;
      case 'banner': game.ui?.hud?.bigText?.(m.main, m.sub || ''); break;
      case 'warn': { const txt = tf('Creatures are gathering: wave in {s} s', { s: m.s }); if (onHome()) game.ui?.toast(txt, 'bad'); if (m.s <= 30) { try { game.audio?.play?.('ship_alarm', { volume: 0.4 }); } catch { /* audio optional */ } } break; }
      case 'wdone': game.ui?.toast(m.kind === 'breached' ? `${t('WAVE LOST')}: ${m.broke} ${t('machines broke')} · ${t('SHIELD')} ${mmss(Math.max(0, (m.shield - Date.now()) / 1000))}` : `${t('WAVE REPELLED')} +▮${m.cr} ⚙${m.parts}${m.s2 ? ' +' + m.s2 + ' ' + t('Circuit Core') : ''}`, m.kind === 'breached' ? 'bad' : 'good'); break;
      default: ghost.onMsg(m);
    }
  };
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:h2msg', onMsg); boundNet = net; net.on('msg:h2msg', onMsg); }

  // =========================================================================================== wiring
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (Hh, g) => { if (g === game) Hh('h2act', (d, from) => { try { hostAct(d, from); } catch (e) { console.error('h2act', e); err(from, 'Error.'); } }); }));
  offs.push(mods.on('hostStart', (g) => { if (!g || g === game) attach(); }));
  offs.push(mods.on('playerJoin', (id, info, g) => { if (g === game && host()) { try { sendFull(id); } catch (e) { console.warn('[h2] join', e); } } }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph !== 'moon' && ph !== 'landing') { stopBuild(); closePanel(); disposeView(); }
    if (ph === 'orbit' && host()) { waveActive = null; }
  }));
  offs.push(mods.on('mapLoaded', (w, g) => {
    if (g !== game) return;
    disposeView(); viewKey = '';
    if (!host() && MOONS[game.run?.moon]?.home) requestSync();
    if (onHome() && offRepShown !== offRep && meta().off) { offRepShown = offRep; const o = meta().off; game.ui?.toast(`${t('WHILE YOU WERE AWAY')}: ▮${o.cr} ⚙${o.parts}${o.s2 ? ' +' + o.s2 + ' ' + t('Circuit Core') : ''} (${Math.round(o.sec / 60)} min)${o.full ? ' - ' + t('STORAGE FULL') : ''}`, 'good'); }
  }));
  let offRepShown = null;
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !onHome()) return;
    list.push({ pos: CONSOLE_POS.clone().add(new THREE.Vector3(-2.4, 1.3, 0)), r: 1.4, reach: 3.6, label: t('FACTORY [T]'), sub: `${layout().p.length} ${t('pieces')}`, action: () => openPanel() });
    const me = game.player.pos;
    for (const p of layout().p) {
      if (p.t !== 'tree' || X.treeStage(p.a || 0) < 2 || !(p.f > 0)) continue;
      const c = X.centerOf(p);
      if (Math.hypot(c.x - me.x, c.z - me.z) > 8) continue;
      list.push({ pos: new THREE.Vector3(c.x, HOME_Y + 1.6, c.z), r: 1.6, reach: 3.6, label: t('Pick fruit [E]'), sub: `${p.f} ${t('fruit')}`, action: () => req('harvest', { id: p.i }) });
    }
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      if (host() && game.run && st()) hostTick(dt);
      ghost.update(dt);
      if (onHome()) { ensureView(); frameView(dt); buildUpdate(); panel?.refresh(); } else if (view) disposeView();
      hudT -= dt; if (hudT <= 0) { hudT = 0.4; hud(); }
    } catch (e) { console.warn('[h2] update', e); }
  }));
  function escKey(e) { if (e.code === 'Escape' && pm.on) stopBuild(); }
  document.addEventListener('keydown', escKey);
  if (mods.api?.registerCommand) {
    mods.api.registerCommand('factory', (rest, term) => {
      const S = layout(), m = meta(), P = m.pw || { sup: 0, dem: 0 }, w = m.w || {};
      term.print(`${t('FACTORY')}: ${S.p.length} ${t('pieces')} · ▮${(api.income()).toFixed(1)}/${t('min')} · ⚡ ${P.dem}/${P.sup} · ${t('waves survived')} ${w.n || 0}${w.armed ? ` · ${t('NEXT WAVE')} ${mmss(w.left)}` : ''}\n${t('Build at the homeworld: press T. Miners go on resource nodes, belts carry to smelters, assemblers and an Export Dock.')}`);
    }, 'HOMEWORLD FACTORY status (route HOME, press T there)');
  }
  api.dispose = () => {
    if (disposed) return; disposed = true;
    for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
    document.removeEventListener('keydown', escKey);
    boundNet?.off?.('msg:h2msg', onMsg);
    try { ghost.dispose(); } catch { /* ignore */ }
    stopBuild(); disposeView(); pm.grid?.dispose?.(); hintEl?.remove(); hudEl?.remove();
  };
  void GMOON;
  return api;
}
