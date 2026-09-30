// SHIFT11 (wave 11, docs/wave11/shift11.md): RECYCLE BIN - a labyrinth whose LAYOUT CHANGES while you are inside.
// Facility interiors on the moons listed in SHIFT_MOONS get a director that every ~60-90 s (host clock, only while somebody is indoors) announces "EMPTYING RECYCLE BIN IN 10",
// telegraphs the change for 10 s (PA + chime, floor cells / perimeter of the marked sector flash red, shutters that will move blink) and then applies ONE deterministic step:
//   * one SECTOR (a room) is permanently deleted: doorways seal, floor voids, everyone still inside is ejected (30 dmg, never lethal), scrap inside is shredded (host),
//     the sector comes back two shifts later with fresh loot ("restored from the bin", ~60 % of what was lost)
//   * 1-2 JUNK TOWERS drop from the ceiling and close a corridor, 1-2 others retract and open a new one
// Reuses the maps5 stack-shift approach (planner = pure function of the layout seed, host sends only the cycle step n, walls are collider.setEnabled toggles + instanced meshes,
// a shutter never closes on the LOCAL player) and the facility nav (nav.blockedEdges for corridor rails, nav.walk for a deleted sector). Every state keeps every reachable cell
// reachable (shift11_core.js proves it), so the exit is never cut off.
// Net (HOST_ONLY): `s11` host -> everyone { k: 'warn' | 'go' | 'set', n: completed step count, w?: seconds of warning left (set) };  request `s11sync` (late joiner asks for the step).
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { RNG, hashString } from '../core/rng.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { levelMaterial } from '../world/geobuilder.js';
import { hudDock } from '../ui/dock.js';
import { ITEMS, scrapTableFor } from './items.js';
import { scrapValueMul } from './progression.js';
import { installShift11Textures } from '../render/shift11_textures.js';
import { planShift, busyRooms, cellOfPos } from './shift11_core.js';
import { PA_LINES, RESTORE_LINES, TR, RU } from './shift11_text.js';

export const MSG = 's11', REQ_SYNC = 's11sync';
/** moons that run the recycle bin director (moon def flag `shift11: true` works too); tuning per moon */
export const SHIFT_MOONS = { orkinos: { dmg: 30, first: 50, gap: [60, 90] }, levrek: { dmg: 22, first: 60, gap: [70, 95] } };
export const WARN = 10;
const THICK = 0.42, CLOSE_T = 1.3, OPEN_T = 1.0;
const LOSE_KINDS = new Set(['scrap', 'big', 'trinket']);
const IDLE = [0.35, 0.22, 0.06], WARN_A = [1, 0.62, 0.1], WARN_B = [1, 0.12, 0.06], OPEN_A = [0.2, 1, 0.8], OPEN_B = [0.1, 0.5, 1];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _z = new THREE.Matrix4().makeScale(0, 0, 0);
const CSS = '.s11{font:600 12px/1.3 ui-monospace,Consolas,monospace;letter-spacing:.06em;color:#f3e9e6;background:rgba(14,8,9,.84);border:1px solid #b3261e;padding:6px 12px;min-width:230px;text-align:center;text-transform:uppercase}'
  + '.s11 b{display:block;font-size:12px;color:#ff5a4d}.s11 .n{display:block;font-size:24px;line-height:1.1;color:#fff}.s11.blink b{animation:s11b .5s steps(2) infinite}.s11 i{display:block;font-style:normal;color:#e9b7b0;font-size:11px}'
  + '.s11.hold{border-color:#7a2a26;opacity:.85}.s11.ok b{color:#5ad8a6}@keyframes s11b{50%{opacity:.25}}';

export function installShift11(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  installShift11Textures();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  HOST_ONLY.add(MSG);
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const S = { fac: null, plan: null, rt: null, cur: 0, warn: null, host: null, bound: null, force: false, clock: 0, hudT: 0, dirty: true, stats: { warns: 0, shifts: 0, ejected: 0, shredded: 0, restored: 0 }, box: null, styled: false, cfg: null, lastMsg: 0 };
  const run = () => g.run;
  const moonOf = () => MOONS[g.run?.moon];
  const say = (a, b, v) => { try { g.ui?.hud?.bigText?.(tf(a, v || {}), b ? tf(b, v || {}) : ''); } catch { /* hud optional */ } };
  const toast = (m, kind = 'info') => { try { g.ui?.toast?.(m, kind); } catch { /* ui optional */ } };
  const sfx = (id, v = 0.6) => { try { g.sfx?.(id, v); } catch { /* audio optional */ } };
  const at = (id, pos, v = 0.9, o = {}) => { try { g.audio?.at?.(id, pos, v, { refDistance: 5, maxDistance: 70, ...o }); } catch { /* audio optional */ } };
  const cfgFor = () => { const m = moonOf(); return (m && SHIFT_MOONS[m.id]) || (m?.shift11 ? { dmg: 25, first: 55, gap: [60, 90] } : (S.force ? { dmg: 25, first: 30, gap: [60, 90] } : null)); };
  const isMoonPhase = () => run()?.phase === 'moon' && !moonOf()?.company && !moonOf()?.home;

  // ==================================================================================== build (every peer, from the layout seed)
  function teardown() {
    const rt = S.rt;
    if (rt) {
      for (const w of rt.gates) { try { if (w.col) g.physics?.removeCollider?.(w.col); } catch { /* already gone */ } }
      try { rt.group.removeFromParent(); } catch { /* ignore */ }
      try { rt.dispose(); } catch { /* ignore */ }
    }
    S.rt = null; S.plan = null; S.fac = null; S.cur = 0; S.warn = null; S.host = null;
    if (S.box) S.box.style.display = 'none';
  }

  function build(fac) {
    teardown();
    const L = fac?.layout;
    if (!L || !fac.nav || !fac.group) return null;
    const cfg = cfgFor();
    if (!cfg) return null;
    const plan = planShift(L, { exclude: busyRooms(fac) });
    if (!plan.ok) return null;
    S.cfg = cfg;
    const C = L.cell, Y = L.y, nav = fac.nav;
    const group = new THREE.Group();
    group.name = 'shift11';
    fac.group.add(group);
    const hOf = (i) => (L.heightOf[i] || 3);
    // ---- gates: geometry + one static collider each (setEnabled toggled, never created / destroyed at runtime)
    const gates = plan.gates.map((gt) => {
      const wx0 = L.ox + gt.cx * C + (gt.off ? gt.off[0] : 0), wz0 = L.oz + gt.cz * C + (gt.off ? gt.off[1] : 0);
      const H = (gt.kind === 'seal' ? hOf(gt.outer) : Math.min(hOf(gt.a), hOf(gt.b))) - 0.02;
      const sx = gt.dir === 0 ? THICK : C - 0.12, sz = gt.dir === 0 ? C - 0.12 : THICK;
      let col = null;
      try { col = g.physics.addStaticBox(wx0, Y + H / 2, wz0, sx / 2, H / 2, sz / 2, 0, G.STATIC, { kind: 'static' }); if (col) col.setEnabled?.(false); } catch { col = null; }
      return { ...gt, wx: wx0, wz: wz0, H, sx, sz, col, ext: 0, tgt: 0, enabled: false, warn: 0, hold: false, im: -1 };
    });
    const rails = gates.filter((w) => w.kind === 'rail'), seals = gates.filter((w) => w.kind === 'seal');
    rails.forEach((w, i) => { w.im = i; }); seals.forEach((w, i) => { w.im = i; });
    const mk = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.frustumCulled = false; for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _z); group.add(im); return im; };
    const box = new THREE.BoxGeometry(1, 1, 1);
    const lam = (tex) => { const m = levelMaterial(tex, {}).clone(); m.color.setRGB(1, 1, 1); return m; };
    const railMesh = mk(box, lam('s11_junk'), rails.length);
    const sealMesh = mk(box, lam('s11_bin'), seals.length);
    const stripMesh = mk(box, new THREE.MeshBasicMaterial({ color: 0xffffff }), gates.length);
    const markMesh = mk(box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }), gates.length);
    // ---- sectors: flash cells, void cells, perimeter strips (2 per perimeter edge: ceiling line + floor line)
    const secCells = [], perims = [];
    for (const sc of plan.sectors) { sc.mode = 0; sc.deleted = false; sc.saved = null; sc.flash = 0; sc.c0 = secCells.length; for (const i of sc.cells) secCells.push({ i, x: L.ox + ((i % L.w) + 0.5) * C, z: L.oz + (((i / L.w) | 0) + 0.5) * C }); sc.p0 = perims.length; for (const p of sc.perim) perims.push({ sc, ...p }); }
    const flashMesh = mk(box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), secCells.length);
    const voidMesh = mk(box, (() => { const m = levelMaterial('s11_void', {}).clone(); m.color.setRGB(1, 1, 1); return m; })(), secCells.length);
    const perimMesh = mk(box, new THREE.MeshBasicMaterial({ color: 0xffffff }), perims.length * 2);
    const rt = {
      plan, group, gates, rails, seals, secCells, perims, C, Y, nav, L,
      meshes: { rails: railMesh, seals: sealMesh, strips: stripMesh, marks: markMesh, flash: flashMesh, voids: voidMesh, perim: perimMesh },
      dispose() { box.dispose(); },
    };
    S.fac = fac; S.plan = plan; S.rt = rt; S.cur = 0; S.warn = null; S.dirty = true;
    applyState(0, true);
    return rt;
  }

  // ==================================================================================== state -> nav / colliders / targets
  const subIdx = (i) => { const L = S.rt.L, nav = S.rt.nav, s = nav.sub, x = i % L.w, z = (i / L.w) | 0, out = []; for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) out.push((z * s + dz) * nav.w + x * s + dx); return out; };
  function setSectorNav(sc, deleted) {
    const nav = S.rt.nav;
    if (deleted) { sc.saved = []; for (const i of sc.cells) for (const k of subIdx(i)) if (nav.walk[k] === 1) { nav.walk[k] = 0; sc.saved.push(k); } }
    else if (sc.saved) { for (const k of sc.saved) nav.walk[k] = 1; sc.saved = null; }
    sc.deleted = deleted;
  }
  function applyState(n, instant) {
    const rt = S.rt, plan = S.plan;
    if (!rt) return;
    const st = plan.stateAt(n), flags = plan.gateFlags(st);
    for (const w of rt.gates) { w.tgt = flags[w.id]; w.warn = 0; if (instant) { w.ext = w.tgt; w.hold = false; } }
    for (let r = 0; r < plan.nRails; r++) { const key = rt.gates[r].key; if (st.closed[r]) rt.nav.blockedEdges.add(key); else rt.nav.blockedEdges.delete(key); }
    for (const sc of plan.sectors) { const d = !!st.del[sc.id]; if (d !== sc.deleted) setSectorNav(sc, d); sc.mode = d ? 3 : 0; }
    S.cur = n; S.warn = null; S.dirty = true;
    if (instant) applyColliders(true);
  }
  function applyColliders(force) {
    for (const w of S.rt.gates) {
      const on = w.ext > 0.55 && !w.hold;
      if (force || on !== w.enabled) { w.enabled = on; try { w.col?.setEnabled?.(on); } catch { /* collider already gone */ } }
    }
  }

  // ==================================================================================== telegraph (warn) + go
  function warnStep(n, left = WARN, silent = false) {
    const rt = S.rt, plan = S.plan;
    if (!rt || n <= S.cur) return;
    const step = plan.stepAt(n - 1);
    for (const w of rt.gates) w.warn = 0;
    for (const r of step.close) rt.gates[r].warn = 1;
    for (const r of step.open) rt.gates[r].warn = 2;
    for (const sc of plan.sectors) if (sc.mode === 1 || sc.mode === 2) sc.mode = sc.deleted ? 3 : 0;
    if (step.purge >= 0) { const sc = plan.sectors[step.purge]; sc.mode = 1; for (const gid of sc.gates) rt.gates[gid].warn = 1; }
    if (step.restore >= 0) { const sc = plan.sectors[step.restore]; sc.mode = 2; for (const gid of sc.gates) rt.gates[gid].warn = 2; }
    S.warn = { n, step, left, tick: Math.ceil(left) + 1, said: silent };
    S.stats.warns++; S.dirty = true;
    if (!silent && localIndoor()) {
      const sc = step.purge >= 0 ? plan.sectors[step.purge] : (step.restore >= 0 ? plan.sectors[step.restore] : null);
      sfx('s11_pa', 0.7);
      say('EMPTYING RECYCLE BIN IN {n}', null, { n: Math.ceil(left) });
      const line = sc ? PA_LINES[(hashString(`${plan.seed}:${n}`)) % PA_LINES.length] : PA_LINES[1];
      toast(`${t('Recycle Bin PA')}: ${tf(line, { s: sc ? sc.label : '' })}`, 'bad');
      speak(sc ? tf(line, { s: sc.label }) : t(line));
    }
  }
  function speak(text) {
    try {
      if (!g.settings?.algoVoice || typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
      const u = new SpeechSynthesisUtterance(text); u.pitch = 0.7; u.rate = 0.95; u.volume = 0.7;
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch { /* optional */ }
  }
  const lp = () => g.player;
  const localIndoor = () => { const p = lp(); return !!p && !p.dead && !p.inShip && (p.indoor || S.fac?.contains?.(p.pos)); };

  /** the exit gate of a sector nearest to (x, z): { gate, tx, tz } (target = centre of the outside cell) */
  function exitFor(sc, x, z) {
    const rt = S.rt, L = rt.L, C = rt.C;
    let best = null;
    for (const gid of sc.gates) {
      const w = rt.gates[gid], ox = L.ox + ((w.outer % L.w) + 0.5) * C, oz = L.oz + (((w.outer / L.w) | 0) + 0.5) * C, d = Math.hypot(ox - x, oz - z);
      if (!best || d < best.d) best = { w, tx: ox, tz: oz, d };
    }
    return best;
  }
  function ejectLocal(sc) {
    const p = lp(), rt = S.rt;
    if (!p || p.dead || p.inShip || !rt) return false;
    if (Math.abs(p.pos.y - rt.Y) > 4.5) return false;
    const ci = cellOfPos(rt.L, p.pos.x, p.pos.z);
    if (ci < 0 || !sc.set.has(ci)) return false;
    const ex = exitFor(sc, p.pos.x, p.pos.z);
    if (!ex) return false;
    const dx = ex.tx - p.pos.x, dz = ex.tz - p.pos.z, d = Math.hypot(dx, dz) || 1;
    try { p.teleport(new THREE.Vector3(ex.tx, rt.Y, ex.tz), Math.atan2(-dx / d, -dz / d)); } catch { return false; }
    const dmg = Math.min(S.cfg?.dmg ?? 25, Math.max(0, (p.hp ?? 100) - 1));
    if (dmg > 0) g.damageLocal?.(dmg, 'recycle', new THREE.Vector3(rt.secCells[sc.c0].x, rt.Y + 1, rt.secCells[sc.c0].z));
    try { g.engine?.flash?.(0xff2410, 0.5); g.engine?.shake?.(0.7); } catch { /* optional */ }
    toast(t('You were caught in a deleted sector and got ejected.'), 'bad');
    S.stats.ejected++;
    return true;
  }
  function hostPurge(sc) {
    const rt = S.rt, H = S.host;
    let lost = 0;
    for (const it of [...(g.items?.all?.() || [])]) {
      if (it.state !== 'world' || it.holder || !it.def || !LOSE_KINDS.has(it.def.kind) || !it.obj?.position) continue;
      const q = it.obj.position;
      if (Math.abs(q.y - rt.Y) > 4.5) continue;
      const ci = cellOfPos(rt.L, q.x, q.z);
      if (ci < 0 || !sc.set.has(ci)) continue;
      try { g.net.broadcast('it', { e: 'rm', id: it.id }); lost++; } catch { /* net gone */ }
    }
    if (H) H.lost[sc.id] = (H.lost[sc.id] || 0) + lost;
    S.stats.shredded += lost;
    for (const c of g.creatures?.host?.values?.() || []) {   // whatever lives in there is shoved out (nothing is ever trapped)
      if (c.dead || c.zone !== 'in' || !c.pos || c.def?.hazard) continue;
      const ci = cellOfPos(rt.L, c.pos.x, c.pos.z);
      if (ci < 0 || !sc.set.has(ci)) continue;
      const ex = exitFor(sc, c.pos.x, c.pos.z);
      if (ex) try { g.creatures.placeAt(c, ex.tx, ex.tz); } catch { /* ignore */ }
    }
    return lost;
  }
  function hostRestore(sc, n) {
    const rt = S.rt, H = S.host, fac = S.fac;
    if (!H) return;
    const rng = new RNG(hashString(`s11loot:${S.plan.seed}:${n}`));
    const lost = H.lost[sc.id] || 0; H.lost[sc.id] = 0;
    const count = Math.min(4, Math.max(lost ? Math.ceil(lost * 0.6) : 0, rng.chance(0.5) ? 1 : 0));
    const theme = fac?.layout?.theme || moonOf()?.interior;
    const table = scrapTableFor(theme).map(([id, w]) => ({ id, w }));
    const mul = (moonOf()?.scrapMul || 1) * scrapValueMul(run()?.quotaIndex || 0) * 1.05;
    for (let k = 0; k < count; k++) {
      const c = rt.secCells[sc.c0 + rng.int(0, sc.cells.length - 1)], id = rng.weighted(table).id;
      if (!ITEMS[id]) continue;
      g.items.hostSpawn(id, new THREE.Vector3(c.x + rng.float(-1.2, 1.2), rt.Y + 0.4, c.z + rng.float(-1.2, 1.2)), { valueMul: mul });
    }
  }
  function goStep(n) {
    const rt = S.rt, plan = S.plan;
    if (!rt) return;
    if (n <= S.cur) return;
    if (n > S.cur + 1) { applyState(n, true); return; }
    const step = plan.stepAt(S.cur), p = lp();
    const before = rt.gates.map((w) => w.tgt);
    applyState(n, false);
    S.stats.shifts++;
    const moved = rt.gates.filter((w, i) => w.tgt !== before[i]).sort((a, b) => (p ? Math.hypot(a.wx - p.pos.x, a.wz - p.pos.z) - Math.hypot(b.wx - p.pos.x, b.wz - p.pos.z) : 0));
    for (const w of moved.slice(0, 3)) at('s11_rail', new THREE.Vector3(w.wx, rt.Y + 1.4, w.wz), 0.85);
    if (step.purge >= 0) {
      const sc = plan.sectors[step.purge], c = rt.secCells[sc.c0 + (sc.cells.length >> 1)];
      at('s11_purge', new THREE.Vector3(c.x, rt.Y + 1.5, c.z), 1, { refDistance: 9, maxDistance: 110 });
      if (localIndoor()) { say('SECTOR {s} DELETED', 'Everything inside is gone.', { s: sc.label }); if (p && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 30) try { g.engine?.shake?.(0.35); } catch { /* optional */ } }
      ejectLocal(sc);
      if (g.isHost) hostPurge(sc);
      for (const cc of rt.secCells.slice(sc.c0, sc.c0 + sc.cells.length)) if (p && Math.hypot(p.pos.x - cc.x, p.pos.z - cc.z) < 24) try { g.particles?.burst?.(new THREE.Vector3(cc.x, rt.Y + 0.4, cc.z), 'dust'); } catch { /* optional */ }
    }
    if (step.restore >= 0) {
      const sc = plan.sectors[step.restore]; sc.flash = 2.4;
      if (localIndoor()) { toast(tf('SECTOR {s} RESTORED', { s: sc.label }) + ' - ' + t('Fresh items appeared.'), 'good'); toast(`${t('Recycle Bin PA')}: ${tf(RESTORE_LINES[(hashString(`${plan.seed}:r${n}`)) % RESTORE_LINES.length], { s: sc.label })}`, 'info'); }
      if (g.isHost) { hostRestore(sc, n); S.stats.restored++; }
    }
  }

  // ==================================================================================== net
  function bindNet(net) {
    if (!net || S.bound === net) return;
    S.bound = net;
    net.on_(MSG, (d) => onMsg(d));
    net.handle(REQ_SYNC, (d, from) => {
      if (!g.isHost) return;
      net.sendTo(from, MSG, { k: 'set', n: S.host?.step | 0, w: S.warn ? Math.max(0, +S.warn.left.toFixed(1)) : 0, wn: S.warn ? S.warn.n : 0 });
    });
  }
  function onMsg(d) {
    if (!S.rt || !d || typeof d.k !== 'string') return;
    const n = clamp(d.n | 0, 0, 1e6);
    if (d.k === 'set') { applyState(n, true); if (d.w > 0.5 && d.wn === n + 1) warnStep(n + 1, d.w, true); }
    else if (d.k === 'warn') warnStep(n, WARN);
    else if (d.k === 'go') goStep(n);
  }
  function interval(n) { const gap = S.cfg?.gap || [60, 90]; return gap[0] + (hashString(`s11gap:${S.plan.seed}:${n}`) % Math.max(1, gap[1] - gap[0] + 1)); }
  function hostTick(dt) {
    const H = S.host;
    if (!H || !S.rt) return;
    const near = (g.aiPlayers?.() || []).some((p) => !p.dead && p.zone === 'in') || localIndoor();
    if (!near) return;   // the bin only fills while somebody is inside: the state is otherwise frozen and identical everywhere
    for (let k = 0; k < 8 && S.plan.stepAt(H.step).empty; k++) { H.step++; g.net.broadcast(MSG, { k: 'go', n: H.step }); }   // a step that would change nothing is skipped silently
    H.t += dt;
    const need = H.step === 0 ? (S.cfg?.first ?? 50) : interval(H.step);
    if (!H.warned && H.t >= need - WARN) { H.warned = true; g.net.broadcast(MSG, { k: 'warn', n: H.step + 1 }); }
    if (H.t >= need) { H.step++; H.t = 0; H.warned = false; g.net.broadcast(MSG, { k: 'go', n: H.step }); }
  }

  // ==================================================================================== client per-frame: animation, paint, hud
  const nearGate = (w, pos) => Math.abs(pos.x - w.wx) < w.sx / 2 + 0.75 && Math.abs(pos.z - w.wz) < w.sz / 2 + 0.75 && pos.y > S.rt.Y - 1 && pos.y < S.rt.Y + w.H;
  function stepGates(dt) {
    const rt = S.rt, p = lp(), pos = p && !p.dead ? p.pos : null;
    let moving = false;
    for (const w of rt.gates) {
      if (w.tgt > w.ext) {
        moving = true;
        if (pos && w.ext >= 0.4 && nearGate(w, pos)) { if (!w.hold) S.dirty = true; w.hold = true; w.ext = Math.min(w.ext, 0.5); continue; }   // a shutter never closes on the local player
        if (w.hold) S.dirty = true;
        w.hold = false; w.ext = Math.min(w.tgt, w.ext + dt / CLOSE_T);
      } else if (w.tgt < w.ext) { moving = true; w.hold = false; w.ext = Math.max(w.tgt, w.ext - dt / OPEN_T); }
    }
    applyColliders(false);
    return moving;
  }
  function paint(clock, warnLeft) {
    const rt = S.rt, C = rt.C, Y = rt.Y, M = rt.meshes;
    const blink = Math.sin(clock * (warnLeft != null && warnLeft < 4 ? 30 : 16)) > 0;
    for (const w of rt.gates) {
      const ext = w.ext, bottom = Y + (1 - ext) * (w.H + 0.06), yc = bottom + w.H / 2, mesh = w.kind === 'rail' ? M.rails : M.seals;
      _q.identity();
      mesh.setMatrixAt(w.im, ext <= 0.001 ? _z : _m.compose(_p.set(w.wx, yc, w.wz), _q, _s.set(w.sx, w.H, w.sz)));
      const col = w.warn === 2 ? (blink ? OPEN_A : OPEN_B) : w.warn === 1 ? (blink ? WARN_A : WARN_B) : w.hold ? WARN_B : IDLE;
      M.strips.setMatrixAt(w.id, ext <= 0.001 ? _z : _m.compose(_p.set(w.wx, bottom + 0.1, w.wz), _q, _s.set(w.dir === 0 ? THICK + 0.05 : w.sx + 0.05, 0.16, w.dir === 0 ? w.sz + 0.05 : THICK + 0.05)));
      M.strips.setColorAt(w.id, _c.setRGB(col[0], col[1], col[2]));
      const showMark = w.warn || w.hold || (w.ext > 0.001 && w.ext < 0.999);
      M.marks.setMatrixAt(w.id, showMark ? _m.compose(_p.set(w.wx, Y + 0.035, w.wz), _q, _s.set(w.dir === 0 ? 1.6 : w.sx, 0.02, w.dir === 0 ? w.sz : 1.6)) : _z);
      const mc = w.warn === 2 ? (blink ? OPEN_A : OPEN_B) : (blink ? WARN_A : WARN_B);
      M.marks.setColorAt(w.id, _c.setRGB(mc[0], mc[1], mc[2]));
    }
    for (const sc of rt.plan.sectors) {
      const red = sc.mode === 1, grn = sc.mode === 2 || sc.flash > 0;
      for (let k = 0; k < sc.cells.length; k++) {
        const cell = rt.secCells[sc.c0 + k], idx = sc.c0 + k;
        const showFlash = red || grn;
        M.flash.setMatrixAt(idx, showFlash ? _m.compose(_p.set(cell.x, Y + 0.045, cell.z), _q, _s.set(C - 0.1, 0.02, C - 0.1)) : _z);
        const f = red ? (blink ? WARN_B : [0.45, 0.02, 0.02]) : (Math.sin(clock * 6) > -0.2 ? OPEN_A : OPEN_B);
        M.flash.setColorAt(idx, _c.setRGB(f[0], f[1], f[2]));
        M.voids.setMatrixAt(idx, sc.deleted ? _m.compose(_p.set(cell.x, Y + 0.03, cell.z), _q, _s.set(C - 0.06, 0.02, C - 0.06)) : _z);
      }
      for (let k = 0; k < sc.perim.length; k++) {
        const pe = rt.perims[sc.p0 + k], cx = (pe.cell % rt.L.w), cz = (pe.cell / rt.L.w) | 0, hh = (rt.L.heightOf[pe.cell] || 3);
        const on = sc.mode !== 0 || sc.flash > 0;
        const x0 = rt.L.ox + cx * C, z0 = rt.L.oz + cz * C, ins = 0.17;
        let px, pz, lx, lz;
        if (pe.d === 0) { px = x0 + C - ins; pz = z0 + C / 2; lx = 0.06; lz = C; } else if (pe.d === 2) { px = x0 + ins; pz = z0 + C / 2; lx = 0.06; lz = C; }
        else if (pe.d === 1) { px = x0 + C / 2; pz = z0 + C - ins; lx = C; lz = 0.06; } else { px = x0 + C / 2; pz = z0 + ins; lx = C; lz = 0.06; }
        const c2 = sc.mode === 1 ? (blink ? WARN_A : WARN_B) : sc.mode === 3 ? [0.55, 0.05, 0.05] : (Math.sin(clock * 6) > -0.2 ? OPEN_A : OPEN_B);
        const i0 = (sc.p0 + k) * 2;
        M.perim.setMatrixAt(i0, on ? _m.compose(_p.set(px, Y + hh - 0.32, pz), _q, _s.set(lx, 0.12, lz)) : _z);
        M.perim.setMatrixAt(i0 + 1, on ? _m.compose(_p.set(px, Y + 0.16, pz), _q, _s.set(lx, 0.1, lz)) : _z);
        M.perim.setColorAt(i0, _c.setRGB(c2[0], c2[1], c2[2])); M.perim.setColorAt(i0 + 1, _c.setRGB(c2[0], c2[1], c2[2]));
      }
    }
    for (const im of Object.values(M)) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  const dirWord = (sc) => {
    const p = lp(), rt = S.rt;
    if (!p || !rt) return '';
    const c = rt.secCells[sc.c0 + (sc.cells.length >> 1)], dx = c.x - p.pos.x, dz = c.z - p.pos.z, d = Math.hypot(dx, dz);
    const fwd = -Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz, right = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz;
    const a = ARROWS[(((Math.round(Math.atan2(right, fwd) / (Math.PI / 4)) % 8) + 8) % 8)];
    return `${a} ${tf('SECTOR {s} - {d} m', { s: sc.label, d: Math.round(d) })}`;
  };
  function ensureHud() {
    if (S.box || typeof document === 'undefined') return;
    try {
      if (!S.styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); S.styled = st; }
      S.box = hudDock('bottom', 'shift11', 44);
      S.box.style.display = 'none';
    } catch { S.box = null; }
  }
  function paintHud() {
    ensureHud();
    const box = S.box, rt = S.rt;
    if (!box || !rt) return;
    const W = S.warn;
    let html = '', cls = 's11';
    if (W && localIndoor()) {
      const sc = W.step.purge >= 0 ? rt.plan.sectors[W.step.purge] : W.step.restore >= 0 ? rt.plan.sectors[W.step.restore] : null;
      const nRail = W.step.close.length + W.step.open.length;
      const sec = Math.max(0, Math.ceil(W.left));
      html = `<b>${t('RECYCLE BIN')}${sc ? ' - ' + t(W.step.purge >= 0 ? 'MARKED FOR DELETION' : 'RESTORING') : ''}</b><span class="n">${sec < 10 ? '0' : ''}${sec}</span>`
        + (sc ? `<i>${dirWord(sc)}</i>` : '') + (nRail ? `<i>${tf('{n} passage(s) rerouting', { n: nRail })}</i>` : '')
        + (W.step.purge >= 0 ? `<i>${t('Leave the sector or grab what you can. Doors will seal.')}</i>` : '');
      cls += W.left < 5 ? ' blink' : '';
    } else if (localIndoor()) {
      const dead = rt.plan.sectors.filter((sc) => sc.deleted);
      if (dead.length) { html = `<b>${dead.map((sc) => tf('DELETED: SECTOR {s}', { s: sc.label })).join(' / ')}</b>`; cls += ' hold'; }
    }
    if (!html) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.className = 'hud-dock-item ' + cls;
    box.innerHTML = html;
  }

  // ==================================================================================== events
  on('netReady', (net) => bindNet(net));
  if (g.net) bindNet(g.net);
  on('mapLoaded', (world) => {
    teardown();
    const fac = world?.facility;
    if (!fac || !cfgFor()) return;
    try {
      if (!build(fac)) return;
      if (g.isHost) S.host = { step: 0, t: 0, warned: false, lost: {} };
      else if (g.net) { try { g.net.request(REQ_SYNC, {}); } catch { /* host answers later */ } }
    } catch (e) { console.warn('[shift11] build', e); teardown(); }
  });
  on('update', (dt, gg) => {
    if (gg && gg !== g) return;
    try {
      const rt = S.rt;
      if (!rt) return;
      if (g.world?.facility !== S.fac) { teardown(); return; }
      S.clock += dt;
      let animating = stepGates(dt);
      for (const sc of rt.plan.sectors) if (sc.flash > 0) { sc.flash = Math.max(0, sc.flash - dt); animating = true; S.dirty = true; }
      if (S.warn) {
        const W = S.warn;
        W.left -= dt; animating = true;
        const sec = Math.ceil(W.left);
        if (sec < W.tick && sec >= 1 && sec <= 5 && localIndoor()) sfx('s11_tick', 0.45 + (5 - sec) * 0.1);
        W.tick = Math.min(W.tick, sec);
        if (W.left < -12) { S.warn = null; for (const w of rt.gates) w.warn = 0; for (const sc of rt.plan.sectors) if (sc.mode === 1 || sc.mode === 2) sc.mode = sc.deleted ? 3 : 0; S.dirty = true; }
      }
      if (animating || S.dirty) { paint(S.clock, S.warn ? S.warn.left : null); S.dirty = false; }
      S.hudT -= dt;
      if (S.hudT <= 0) { S.hudT = 0.25; paintHud(); }
      if (g.isHost && S.host && isMoonPhase()) hostTick(dt);
    } catch (e) { if (!S.warnedU) { S.warnedU = true; console.warn('[shift11] update', e); } }
  });

  // ==================================================================================== debug + api
  const secOf = (id) => S.plan?.sectors[id ?? 0];
  const api = {
    state: S,
    active: () => !!S.rt,
    plan: () => S.plan,
    debug: {
      /** enable the bin on the current facility (any moon) */
      force(v = true) { S.force = !!v; const fac = g.world?.facility; if (fac && v && !S.rt) { build(fac); if (g.isHost && S.rt) S.host = { step: 0, t: 0, warned: false, lost: {} }; } if (!v) teardown(); return !!S.rt; },
      status() { const p = S.plan; return { active: !!S.rt, cur: S.cur, warn: S.warn ? { n: S.warn.n, left: +S.warn.left.toFixed(1), purge: S.warn.step.purge, restore: S.warn.step.restore } : null, host: S.host && { step: S.host.step, t: +S.host.t.toFixed(1) }, gates: p?.gates.length, rails: p?.nRails, sectors: p?.sectors.length, deleted: p?.sectors.filter((s) => s.deleted).map((s) => s.label), stats: S.stats }; },
      /** host: broadcast the warning now; the shift follows after 10 s */
      warnNow() { if (!g.isHost || !S.host) return false; S.host.warned = true; S.host.t = (S.host.step === 0 ? (S.cfg?.first ?? 50) : interval(S.host.step)) - WARN; g.net.broadcast(MSG, { k: 'warn', n: S.host.step + 1 }); return true; },
      /** host: warn + go in one call */
      shiftNow() { if (!g.isHost || !S.host) return false; S.host.step++; S.host.t = 0; S.host.warned = false; g.net.broadcast(MSG, { k: 'warn', n: S.host.step }); g.net.broadcast(MSG, { k: 'go', n: S.host.step }); return S.host.step; },
      /** stand next to the door of the next sector to be purged (or sector `id`) */
      tpToSector(id) { const rt = S.rt; if (!rt) return false; const sc = secOf(id ?? S.plan.stepAt(S.cur).purge); if (!sc) return false; const ex = exitFor(sc, rt.secCells[sc.c0].x, rt.secCells[sc.c0].z); if (!ex) return false; lp()?.teleport(new THREE.Vector3(ex.tx, rt.Y, ex.tz), 0); return sc.label; },
      /** stand in the middle of a sector (to test the ejection) */
      tpInto(id) { const rt = S.rt; if (!rt) return false; const sc = secOf(id ?? S.plan.stepAt(S.cur).purge); if (!sc) return false; const c = rt.secCells[sc.c0 + (sc.cells.length >> 1)]; lp()?.teleport(new THREE.Vector3(c.x, rt.Y, c.z), 0); return sc.label; },
      /** stand next to rail `id` (0..n) */
      tpToRail(id = 0) { const rt = S.rt; const w = rt?.rails[id]; if (!w) return false; lp()?.teleport(new THREE.Vector3(w.wx + (w.dir === 0 ? -2.2 : 0), rt.Y, w.wz + (w.dir === 1 ? -2.2 : 0)), 0); return w.id; },
    },
    dispose() { for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } } teardown(); try { S.box?.remove(); S.styled?.remove?.(); } catch { /* ignore */ } },
  };
  return api;
}
