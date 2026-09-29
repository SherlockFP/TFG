// SECURED LOOT + BREACHING TOOLS (module `secureloot`, docs/wave2/secureloot.md). Installed with `this.useModule('secureloot', installSecureLoot)`.
//
// The host places 0-5 SECURED CONTAINERS per facility (seeded: the same on every peer; more, and nastier ones, in deeper sectors and vault /
// treasure rooms) holding better-than-average loot: glass display cases, wall / floor safes, locked cages + chained lockers, electronic
// lockboxes, vault crates. Each needs a TOOL (Glass Cutter, Breaching Drill, Bolt Cutters, Hack Tool, Plasma Torch, + the existing Lockpick /
// Crowbar / EMP charge / a Code Slip) - or a loud, slow, damaging CRUDE fallback with any melee weapon, so nothing is ever impossible.
// Rules, numbers and the tool -> container matrix live in secureloot_core.js (pure, node-tested).
//
// Host authoritative: container state, work timers, drill progress + jams, noise (game.balance.noise -> Threat, creatures hear it), alarms
// (facilitysys 'alarm' when present), loot spawns, tool wear. Clients only start / cancel work and play the minigames; the host checks the
// tool, the distance and that enough time really passed. Net (one handler each): request 'slAct' {op: sync|begin|end|open|fail|drill|fix|pack},
// host -> all 'slSt' (HOST_ONLY) container deltas / the late-join list. Never changes the light count (glow is emissive only).
import { cageDifficulty } from './lockpick2_core.js';   // [lockpick2] cage lock tier by quota
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t, tf, sysMsg } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { ITEMS } from './items.js';
import { MOONS } from './moons.js';
import { TIERS, tierIndex, rollTier } from './tiers.js';
import { G } from '../physics/physics.js';
import { hudDock } from '../ui/dock.js';
import { MINIGAMES } from '../minigames/index.js';
import { createHack } from '../minigames/hack.js';
import * as C from './secureloot_core.js';
import { createContainerModel, createDrillRig, BREACH_ITEM_MODELS } from '../models/secureloot.js';
import { createItemModel } from '../models/items.js';
import { TR_SECURELOOT, RU_SECURELOOT } from './secureloot_i18n.js';

HOST_ONLY.add('slSt');
C.registerSecureItems();
C.registerSecureRecipes();
addTranslations(TR_SECURELOOT, 'tr');
addTranslations(RU_SECURELOOT, 'ru');

const TAU = Math.PI * 2;
const NEAR = 5.2;                 // m: host accepts actions from this far (lag tolerance; the prompt reach is ~3 m)
const TOOL_ICON = { case: C.T.CUTTER, safe: C.T.DRILL, cage: C.T.BOLT, lockbox: C.T.HACK, vault: C.T.TORCH };
const KIND_COLOR = { case: '#9fdcff', safe: '#c8ccd4', cage: '#e0b020', lockbox: '#40ff80', vault: '#ff9a1f' };
const VERB = {
  cutter: 'Cut {name} open with the Glass Cutter', smash: 'Smash {name} open', fists: 'Punch {name} open', bolt: 'Cut the chain of {name}', pry: 'Pry {name} open',
  bash: 'Force {name} open', emp: 'Short out {name} with the EMP charge', torch: 'Cut {name} open with the Plasma Torch', code: 'Enter the code on {name}',
  pick: 'Pick the lock of {name}', hack: 'Hack {name}', drill: 'Set the Breaching Drill on {name}',
};
const HOLD_SND = { cutter: 'sl_cutter', smash: 'sl_glass', fists: 'hit_metal', bolt: 'sl_cutter', pry: 'wv1_pry', bash: 'hit_metal', torch: 'sl_torch', emp: 'spark' };

// ------------------------------------------------------------------------------------------------ procedural sounds
const nz = () => Math.random() * 2 - 1;
function synth(sr, dur, fn) {
  const n = Math.max(1, Math.floor(sr * dur)), b = new Float32Array(n);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, i); b[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const k = 0.9 / peak, fade = Math.min(n, Math.floor(sr * 0.008));
  for (let i = 0; i < n; i++) { b[i] *= k; if (i > n - fade) b[i] *= (n - i) / fade; }
  return b;
}
const SOUNDS = {
  // glass smash: bright noise burst + tinkling partials
  sl_glass: (sr) => synth(sr, 0.9, (t) => nz() * Math.exp(-t * 14) * 0.9 + (Math.sin(TAU * 3100 * t) + Math.sin(TAU * 4700 * t) * 0.6 + Math.sin(TAU * 6200 * t) * 0.4) * Math.exp(-t * 7) * 0.35 * (Math.sin(t * 90) > -0.3 ? 1 : 0.3)),
  // scoring glass / snapping chain: scratchy saw
  sl_cutter: (sr) => synth(sr, 0.5, (t) => { const f = 900 + 500 * Math.sin(t * 30); return (((t * f) % 1) * 2 - 1) * 0.3 * Math.sin((t / 0.5) * Math.PI) + nz() * 0.25 * Math.exp(-t * 4); }),
  sl_torch: (sr) => { let lp = 0; return synth(sr, 0.7, (t) => { lp += (nz() - lp) * 0.45; return (nz() - lp) * 0.7 * (0.6 + 0.4 * Math.sin(t * 60)) * Math.sin((t / 0.7) * Math.PI) + Math.sin(TAU * 120 * t) * 0.25; }); },
  // drill grind: loopable low motor + rasping bit (exact number of cycles so the loop is seamless)
  sl_drill: (sr) => synth(sr, 1.2, (t) => { const m = Math.sin(TAU * 60 * t) * 0.6 + Math.sin(TAU * 120 * t) * 0.35 + Math.sin(TAU * 30 * t) * 0.4; const g = (((t * 900) % 1) * 2 - 1) * 0.35 * (0.6 + 0.4 * Math.sin(TAU * 10 * t)); return m + g + nz() * 0.2; }),
  sl_jam: (sr) => synth(sr, 0.6, (t) => (Math.sin(TAU * (140 - 90 * t) * t) * 0.8 + nz() * 0.5) * Math.exp(-t * 6)),
  sl_beep: (sr) => synth(sr, 0.16, (t) => Math.sin(TAU * 1500 * t) * Math.exp(-t * 18)),
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tierOfIt = (it) => (it?.tier && TIERS[it.tier] ? it.tier : 'common');

export function installSecureLoot(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const cs = new Map();            // id -> container
  let map = null;                  // { seed, fac, quota }
  let hold = null;                 // { c, kind: 'work'|'fix'|'pack', sel, t, dur, key, tick, begun }
  let syncAsked = false, time = 0;
  const cols = [];
  let dbgN = 0;
  const _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const isHost = () => !!game.isHost;
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos);
  const snd = (name, p, vol = 0.8, extra = {}) => { try { game.audio?.at?.(name, p, vol, { refDistance: 3, maxDistance: 60, occlude: true, ...extra }); } catch { /* audio optional */ } };
  const toast = (text, kind) => { try { game.ui?.toast?.(text, kind); } catch { /* ui optional */ } };

  // ---- content hooks: item models, sounds, minigame ------------------------------------------------------------------
  if (mods.itemModels) for (const [id, fn] of Object.entries(BREACH_ITEM_MODELS)) if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => fn());
  if (mods.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mods.soundGens.has(n)) mods.soundGens.set(n, fn);
  const hadHack = !!MINIGAMES.hack;
  if (!hadHack) MINIGAMES.hack = createHack;

  // ---- progress bar dock (hold-E) -------------------------------------------------------------------------------------
  const box = hudDock('bottom', 'secureloot', 13);
  box.style.cssText = 'display:none;min-width:280px;font-family:var(--font);font-size:22px;color:#ffe9b8;text-align:center;text-shadow:0 0 8px rgba(255,190,80,.5)';
  function setBar(text, u) {
    if (text == null) { if (box.style.display !== 'none') box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = `${text}<div style="height:8px;margin-top:4px;background:rgba(255,255,255,.12);border:1px solid rgba(255,190,70,.5)"><div style="height:100%;width:${Math.round(clamp(u, 0, 1) * 100)}%;background:linear-gradient(90deg,#ff8a3d,#ffd23f)"></div></div>`;
  }

  // ================================================================================================ placement (all peers)
  function clear() {
    stopHold(true);
    for (const c of cs.values()) unmountDrill(c), c.model?.dispose();
    cs.clear();
    for (const col of cols.splice(0)) { try { game.physics.removeCollider(col); } catch { /* already gone */ } }
    map = null; syncAsked = false;
    setBar(null);
  }
  const nameOf = (c) => `${t(C.nameOf(c.kind, c.variant))}${c.num ? ' #' + c.num : ''}`;

  function gatherSpots(fac) {
    const nav = fac.nav, walk = (x, z) => Number.isFinite(x) && Number.isFinite(z) && (!nav || nav.walkableAt(x, z));
    const wall = (fac.wallSpots || []).filter((s) => (s.dist || 0) >= 2 && walk(s.x, s.z));
    const floor = (fac.scrapSpots || []).filter((s) => s.room >= 0 && !s.sealed && walk(s.x, s.z));
    const seen = new Set(), vault = [];
    for (const s of fac.vaultSpots || []) { if (!seen.has(s.room)) { seen.add(s.room); continue; } if (walk(s.x, s.z)) vault.push(s); }   // the first spot of every vault room belongs to the chests module
    const treasure = (fac.chestSpots || []).filter((s) => s.kind === 'treasure' || s.kind === 'vault');
    const avoid = (fac.chestSpots || []).map((s) => [s.x, s.z]);
    return { wall, floor, vault, treasure, avoid, hasVaultRoom: (fac.vaultSpots || []).length > 0 };
  }
  function roomYaw(fac, s, R) {
    const L = fac.layout, r = L?.rooms?.[s.room];
    if (r && L.cell) { const cx = L.ox + (r.cx + 0.5) * L.cell, cz = L.oz + (r.cz + 0.5) * L.cell; const dx = cx - s.x, dz = cz - s.z; if (Math.hypot(dx, dz) > 0.6) return Math.atan2(dx, dz); }
    return R.int(0, 3) * (Math.PI / 2);
  }

  function onMapLoaded(world) {
    clear();
    const fac = world?.facility;
    if (!fac?.group || !world.moonId || world.company || !game.run) return;
    const moon = MOONS[world.moonId] || {};
    const quota = game.run.quotaIndex | 0;
    map = { seed: world.seed | 0, fac, quota };
    try {
      const R = new RNG(((world.seed | 0) ^ 0x5ec1007) >>> 0);
      const S = gatherSpots(fac);
      const plan = C.planContainers(R, { quota, size: moon.size || 1, hasVault: S.hasVaultRoom, hasWalls: S.wall.length > 0 });
      const used = [];
      const free = (s, d = 5) => !used.some((u) => Math.hypot(u[0] - s.x, u[1] - s.z) < d) && !S.avoid.some((a) => Math.hypot(a[0] - s.x, a[1] - s.z) < 2.4);
      const take = (list, d) => { const ok = R.shuffle(list.filter((s) => free(s, d))); return ok[0] || null; };
      let safeN = 0;
      plan.forEach((p, i) => {
        let spot = null, yaw = 0, variant = p.variant, kind = p.kind, wallMount = false;
        if (kind === 'safe' && variant === 'wall') { spot = take(S.wall, 3); if (spot) { wallMount = true; yaw = spot.rotY || 0; } else variant = 'floor'; }
        if (!spot && kind === 'vault') {
          spot = take(S.vault, 2.5);
          if (!spot) { const tr = take(S.treasure, 2); if (tr) spot = { ...tr, x: tr.x + 1.9, z: tr.z }; }
        }
        if (!spot) { const deep = S.floor.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0)); spot = take(deep.slice(0, Math.max(6, Math.ceil(deep.length * 0.6))), 5) || take(deep, 3); }
        if (!spot) return;
        if (!wallMount) yaw = roomYaw(fac, spot, R);
        if (kind === 'vault' && !S.vault.includes(spot) && !fac.nav?.walkableAt?.(spot.x, spot.z)) return;
        used.push([spot.x, spot.z]);
        const id = 's' + i;
        const num = kind === 'safe' ? ++safeN : 0;
        addContainer({ id, kind, variant, x: spot.x, y: spot.y, z: spot.z, yaw, room: spot.room ?? -1, num, wall: wallMount });
      });
    } catch (e) { console.warn('[secureloot] placement', e); }
  }

  function addContainer(s) {
    const contents = C.rollContents(s.kind, new RNG(C.lootSeed(map.seed, s.id)), { quota: map.quota });
    const c = {
      ...s, contents, code: s.kind === 'safe' ? C.safeCode(map.seed, s.id) : null, opened: false, claimed: false,
      work: null, drill: null, hw: null, hd: null, model: null, dm: null, dsnd: null, fxT: 0, pos: new THREE.Vector3(),   // work / drill = what every peer SHOWS; hw / hd = the host's authoritative state
    };
    let content = null;
    if (s.kind === 'case' && contents[0]) { try { const f = mods.itemModels?.get(contents[0].type); content = f ? f() : createItemModel(contents[0].type); } catch { content = null; } }
    c.model = createContainerModel(s.kind, s.variant, { content });
    const m = c.model, root = m.root;
    const back = s.wall ? 0.07 : 0;   // wall safes sit flush against the wall (their origin is the wall face)
    root.position.set(s.x - Math.sin(s.yaw) * back, s.y, s.z - Math.cos(s.yaw) * back); root.rotation.y = s.yaw;
    map.fac.group.add(root);
    _f.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    c.fwd = _f.clone();
    c.front = m.rig.front ?? 0.5;
    c.pos.copy(m.anchor).applyAxisAngle(_v.set(0, 1, 0), s.yaw).add(root.position);
    // solid body: players (and the loot popping out) collide with it
    const col = m.rig.col || { cy: m.size[1] / 2, cz: 0, hx: m.size[0] / 2, hy: m.size[1] / 2, hz: m.size[2] / 2 };
    const cx = s.x + _f.x * col.cz, cz = s.z + _f.z * col.cz;
    try { cols.push(game.physics.addStaticBox(cx, s.y + col.cy, cz, col.hx, col.hy, col.hz, s.yaw, G.STATIC, { kind: 'secureloot', id: s.id })); } catch { /* physics optional */ }
    cs.set(c.id, c);
    return c;
  }

  // ================================================================================================ shared helpers
  function myEntries(c) {
    const p = game.player, held = p.heldItem?.() || null;
    const ent = (it) => ({ id: it.id, def: it.def || ITEMS[it.type], tier: tierOfIt(it), it });
    const owned = [];
    for (const it of game.items.all()) {
      if (it.holder !== game.selfId || it === held) continue;
      if (it.type === C.T.NOTE) { if (c.code && typeof it.label === 'string' && it.label.startsWith('sl:' + c.id + ':')) owned.push(ent(it)); continue; }
      owned.push(ent(it));
    }
    let h = held ? ent(held) : null;
    if (h && h.def?.id === C.T.NOTE && !(c.code && typeof held.label === 'string' && held.label.startsWith('sl:' + c.id + ':'))) h = null;
    return { held: h, owned };
  }
  const noiseWord = (m) => { const n = C.noiseOf(m), l = Math.max(n.burst, n.loud); return l <= 0 ? 'Silent' : l < 0.5 ? 'Quiet' : l < 1.0 ? 'Medium noise' : l < 1.6 ? 'Loud' : 'VERY LOUD'; };
  function subFor(c, sel) {
    const m = sel.method, parts = [];
    if (m.minigame) parts.push(t('Minigame')); else if (m.drill) parts.push(`${C.drillDuration(tierOfIt(sel.entry?.it))} s`); else { const s = C.methodTime(m, { tier: sel.entry?.tier, def: sel.entry?.def }); parts.push(s < 1 ? t('Instant') : `${Math.round(s * 10) / 10} s`); }
    parts.push(t(noiseWord(m)));
    if (m.crude) parts.push(t('damages the loot'));
    if (m.alarmP || m.failAlarm) parts.push(t('may trigger the alarm'));
    return parts.join(' · ');
  }
  function needsText(c, sel) {
    if (sel?.missing?.length) { const n = sel.missing[0].need; return tf('The Plasma Torch needs a {item}', { item: t(ITEMS[n]?.name || n) }); }
    const tools = [];
    for (const m of C.METHODS[c.kind]) if (!m.crude) for (const id of m.tools || []) { if (id === C.T.NOTE && !c.code) continue; if (id === C.T.EMP) continue; tools.push(t(ITEMS[id]?.name || id)); }
    const crude = c.kind === 'case' ? t('or smash it with a melee weapon (LOUD)') : t('or force it with any melee weapon (LOUD, slow)');
    return `${tf('Needs: {tools}', { tools: tools.join(' / ') })} - ${crude}`;
  }

  // ================================================================================================ client: prompts + hold
  function addInteractables(out) {
    const p = game.player;
    if (!p || p.dead || !map || !p.indoor || game.minigame) return;
    for (const c of cs.values()) {
      if (c.opened) continue;
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z;
      if (dx * dx + dz * dz > 14 || Math.abs(p.pos.y - c.y) > 3.5) continue;
      out.push(promptFor(c));
    }
  }
  function promptFor(c) {
    const name = nameOf(c);
    const base = { pos: c.pos, r: 0.95, reach: 2.8 };
    const d = c.drill;
    if (d) {
      if (d.j) return { ...base, label: () => (hold?.c === c && hold.kind === 'fix' ? `${t('Clearing the jam...')} ${Math.round(hold.t / C.FIX_TIME * 100)}%` : t('DRILL JAMMED - hold [E] to fix it')), sub: t('It is not drilling while it is jammed'), action: holdAction(c, 'fix', C.FIX_TIME) };
      return { ...base, label: () => `${t('Drilling')}... ${Math.round(clamp(d.p, 0, 1) * 100)}%`, sub: t('Loud! Defend it. Hold [E] to pack it up (progress is lost)'), action: holdAction(c, 'pack', 1.6) };
    }
    if (c.work && c.work.by !== game.selfId) return { ...base, label: `${name} - ${t('someone is working on it')}`, action: () => {} };
    const { held, owned } = myEntries(c);
    const sel = C.chooseMethod(c.kind, held, owned);
    if (!sel.method) return { ...base, label: `${name} [${t('locked')}]`, sub: needsText(c, sel), action: () => { snd('door_locked', c.pos, 0.7); } };
    const m = sel.method;
    const label = () => { const v = tf(VERB[m.id] || 'Open {name}', { name }); return hold?.c === c && hold.kind === 'work' && hold.sel.method === m ? `${v} ${Math.round(hold.t / Math.max(0.01, hold.dur) * 100)}%` : `${v}${m.minigame || m.drill ? ' [E]' : ' [' + t('hold E') + ']'}`; };
    let action;
    if (m.drill) action = () => { req('drill', { id: c.id, tool: sel.entry.id }); };
    else if (m.minigame) action = () => startMinigame(c, sel);
    else action = holdAction(c, 'work', C.methodTime(m, { tier: sel.entry?.tier, def: sel.entry?.def }), sel);
    return { ...base, label, sub: subFor(c, sel), action };
  }
  function holdAction(c, kind, dur, sel = null) {
    const key = `${c.id}:${kind}:${sel?.method?.id || ''}`;
    return Object.assign(() => {
      if (hold) return;
      hold = { c, kind, sel, t: 0, dur: Math.max(0.05, dur), key, tick: 0, begun: false, fxT: 0 };
      if (kind === 'work') { hold.begun = true; req('begin', { id: c.id, m: sel.method.id, tool: sel.entry?.id, aux: sel.aux?.id }); }
    }, { __sl: key });
  }
  function stopHold(silent = false) {
    if (hold?.begun && !silent && map) req('end', { id: hold.c.id });
    hold = null;
    setBar(null);
  }
  function finishHold() {
    const H = hold; hold = null; setBar(null);
    if (!H || H.c.opened) return;
    if (H.kind === 'fix') req('fix', { id: H.c.id });
    else if (H.kind === 'pack') req('pack', { id: H.c.id });
    else req('open', { id: H.c.id, m: H.sel.method.id, tool: H.sel.entry?.id, aux: H.sel.aux?.id });
  }
  function startMinigame(c, sel) {
    const m = sel.method, q = map.quota;
    req('begin', { id: c.id, m: m.id, tool: sel.entry?.id, aux: sel.aux?.id });
    const ti = tierIndex(sel.entry?.tier || 'common');
    const opts = m.minigame === 'hack' ? { difficulty: clamp(0.3 + q * 0.04, 0, 0.9), tries: 2 + (ti >= 2 ? 1 : 0) }
      : m.minigame === 'safe' ? { difficulty: clamp(0.22 + q * 0.03, 0, 0.8) } : { difficulty: cageDifficulty(q), noXp: false };
    game.openMinigame(m.minigame, opts, (res) => {
      if (!map || c.opened) return;
      if (res.cancelled) { req('end', { id: c.id }); return; }
      if (res.success) req('open', { id: c.id, m: m.id, tool: sel.entry?.id, aux: sel.aux?.id });
      else { req('fail', { id: c.id, m: m.id, tool: sel.entry?.id }); toast(m.failAlarm ? t('ALARM TRIGGERED!') : t('The lock held.'), 'bad'); }
    });
  }
  const req = (op, extra = {}) => { if (map) game.net?.request?.('slAct', { op, s: map.seed, ...extra }); };

  // ================================================================================================ host: actions
  const heldBy = (from, id, ok) => { const it = id && game.items.get(id); return it && it.holder === from && ok(it.def || ITEMS[it.type]) ? it : null; };
  const near = (c, from) => { const p = posOf(from); return !!p && Math.hypot(p.x - c.x, p.z - c.z) < NEAR && Math.abs(p.y - c.y) < 4; };
  const push = (c, extra) => game.net.broadcast('slSt', { s: map.seed, id: c.id, ...extra });
  const rm = (it) => game.net.broadcast('it', { e: 'rm', id: it.id });
  function noiseAt(c, loud) {
    if (!(loud > 0)) return;
    const p = new THREE.Vector3(c.x, c.y + 0.8, c.z);
    try { if (game.balance?.noise) game.balance.noise(p, loud); else game.creatures?.noise?.(p, loud); } catch (e) { console.warn('[secureloot] noise', e); }
  }
  function wear(it, n = 1) {
    if (!it || !(n > 0) || !ITEMS[it.type]) return;
    const left = Math.max(0, (it.charges ?? ITEMS[it.type].charges ?? 1) - n);
    it.charges = left;
    if (left <= 0) { rm(it); game.net.sendTo(it.holder, 'sys', sysMsg('Your {@tool} wore out.', { tool: ITEMS[it.type].$name || ITEMS[it.type].name }, 'warn')); }
    else game.net.broadcast('itst', { id: it.id, c: left });
  }
  function triggerAlarm(c) {
    let ok = false;
    try { ok = !!game.facilitysys?.force?.('alarm'); } catch { ok = false; }
    noiseAt(c, 2.6);
    if (!ok) game.net.broadcast('fx', { k: 'snd', s: 'alarm_loop', p: [c.x, c.y + 1, c.z], v: 1, r: 8, m: 90 });
    game.net.broadcast('sys', sysMsg('ALARM! The container was rigged.', {}, 'bad'));
    mods.emit('tfg:secureAlarm', { id: c.id, kind: c.kind, pos: [c.x, c.y, c.z] });
  }
  function endWork(c) { if (c.hw) { c.hw = null; push(c, { w: 0 }); } }

  function onAct(d, from) {
    if (!isHost() || !map || d.s !== map.seed || game.run?.phase !== 'moon') return;
    if (d.op === 'sync') {
      const list = [...cs.values()].filter((c) => c.opened || c.hd || c.hw).map((c) => ({ id: c.id, ...(c.opened ? { o: 1, q: 1 } : {}), ...(c.hd ? { d: drillMsg(c) } : {}), ...(c.hw ? { w: c.hw.m, by: c.hw.by } : {}) }));
      if (list.length) game.net.sendTo(from, 'slSt', { s: map.seed, list });
      return;
    }
    const c = cs.get(d.id);
    if (!c || c.opened || c.claimed || !near(c, from)) return;
    if (d.op === 'begin') {
      if (c.hw || c.hd) return;
      const m = C.methodOf(c.kind, d.m);
      if (!m || m.drill) return;
      let tool = null, aux = null;
      if (!m.fists) {
        tool = heldBy(from, d.tool, (df) => C.itemMatches(m, df) && !(m.tools?.includes(C.T.NOTE) && !(c.code)));
        if (!tool) return;
        if (tool.type === C.T.NOTE && !(typeof tool.label === 'string' && tool.label.startsWith('sl:' + c.id + ':'))) return;
      }
      if (m.needs) { aux = heldBy(from, d.aux, (df) => df.id === m.needs); if (!aux) return; }
      const dur = C.methodTime(m, { tier: tierOfIt(tool), def: tool?.def });
      const nz = C.noiseOf(m);
      c.hw = { by: from, m: m.id, t: 0, dur, tool: tool?.id || null, aux: aux?.id || null, next: nz.every || 9, wt: 0 };
      push(c, { w: m.id, by: from });
      if (nz.burst > 0) noiseAt(c, nz.burst);
    } else if (d.op === 'end') { if (c.hw?.by === from) endWork(c); }
    else if (d.op === 'open') {
      const w = c.hw;
      if (!w || w.by !== from || w.m !== d.m) return;
      const m = C.methodOf(c.kind, w.m);
      const minT = m.minigame ? 1.0 : Math.max(0, w.dur * 0.8 - 0.35);
      if (w.t < minT) { game.net.sendTo(from, 'sys', sysMsg('Too fast - the lock did not give.', {}, 'warn')); endWork(c); return; }
      hostOpen(c, from, m, game.items.get(w.tool), game.items.get(w.aux));
    } else if (d.op === 'fail') {
      const w = c.hw;
      if (!w || w.by !== from || w.m !== d.m) return;
      const m = C.methodOf(c.kind, w.m);
      if (m.wear) wear(game.items.get(w.tool), m.wear);
      noiseAt(c, 0.5);
      if (m.failAlarm) triggerAlarm(c);
      endWork(c);
    } else if (d.op === 'drill') hostDrillStart(c, from, d);
    else if (d.op === 'fix') { const dr = c.hd; if (dr?.jammed) { dr.jammed = false; dr.pulse = 0.3; push(c, { d: drillMsg(c) }); } }
    else if (d.op === 'pack') hostDrillPack(c, from);
  }

  // ---- drill (Payday style) -------------------------------------------------------------------------------------------
  const drillMsg = (c) => ({ p: +clamp(c.hd.t / c.hd.dur, 0, 1).toFixed(3), j: c.hd.jammed ? 1 : 0, tr: c.hd.tier, dur: c.hd.dur });
  function hostDrillStart(c, from, d) {
    if (c.hd || c.hw || c.kind !== 'safe') return;
    const it = heldBy(from, d.tool, (df) => df.id === C.T.DRILL);
    if (!it) return;
    const tier = tierOfIt(it);
    c.hd = { by: from, t: 0, dur: C.drillDuration(tier), tier, jams: C.rollJams(new RNG((Math.random() * 4294967296) >>> 0), tier), ji: 0, jammed: false, pulse: 0.5, chew: 2, sendT: 0, tool: { type: it.type, charges: it.charges ?? ITEMS[it.type].charges, tier: it.tier || null } };
    rm(it);
    push(c, { d: drillMsg(c) });
    noiseAt(c, C.methodOf('safe', 'drill').noise.burst);
  }
  function hostDrillPack(c, from) {
    const dr = c.hd;
    if (!dr) return;
    const p = drillSpot(c);
    game.items.hostSpawn(dr.tool.type, p, { charges: dr.tool.charges, tier: dr.tool.tier || undefined, linvel: [0, 1.5, 0] });
    c.hd = null;
    push(c, { d: 0 });
  }
  function drillSpot(c) { return new THREE.Vector3(c.x + c.fwd.x * (c.front + 0.7), c.y + 0.5, c.z + c.fwd.z * (c.front + 0.7)); }
  function hostDrillTick(c, dt) {
    const dr = c.hd;
    if (!dr) return;
    if (!dr.jammed) {
      dr.t += dt;
      dr.pulse -= dt;
      if (dr.pulse <= 0) { dr.pulse = C.methodOf('safe', 'drill').noise.every; noiseAt(c, C.methodOf('safe', 'drill').noise.loud); }
      const p = dr.t / dr.dur;
      if (dr.ji < dr.jams.length && p >= dr.jams[dr.ji]) { dr.ji++; dr.jammed = true; push(c, { d: drillMsg(c), jam: 1 }); return; }
      dr.chew -= dt;
      if (dr.chew <= 0) {
        dr.chew = 2;
        for (const cr of game.creatures?.host?.values?.() || []) {
          if (cr.dead || cr.def?.hazard || cr.zone === 'out') continue;
          if (Math.hypot(cr.pos.x - c.x - c.fwd.x * (c.front + 0.6), cr.pos.z - c.z - c.fwd.z * (c.front + 0.6)) < C.CHEW_RANGE && Math.random() < C.CHEW_CHANCE) { dr.jammed = true; push(c, { d: drillMsg(c), jam: 2 }); return; }
        }
      }
      if (p >= 1) { hostDrillDone(c); return; }
    }
    dr.sendT -= dt;
    if (dr.sendT <= 0) { dr.sendT = 0.5; push(c, { d: drillMsg(c) }); }
  }
  function hostDrillDone(c) {
    const dr = c.hd;
    const left = Math.max(0, (dr.tool.charges ?? 1) - 1);
    c.hd = null;
    if (left > 0) game.items.hostSpawn(dr.tool.type, drillSpot(c), { charges: left, tier: dr.tool.tier || undefined, linvel: [0, 1.5, 0] });
    else game.net.broadcast('sys', sysMsg('The drill burnt out.', {}, 'warn'));
    push(c, { d: 0 });
    hostOpen(c, dr.by, C.methodOf('safe', 'drill'), null, null);
  }

  // ---- opening + loot -------------------------------------------------------------------------------------------------
  function hostOpen(c, by, m, tool, aux) {
    if (c.claimed) return;
    c.claimed = true;
    c.hw = null;
    if (tool && m.wear && !m.drill) wear(tool, m.wear);
    if (tool && m.consume) rm(tool);
    if (aux) rm(aux);
    const run = game.run, moon = MOONS[run.moon] || {};
    const valueMul = (moon.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * 0.95;
    let damaged = 0;
    const top = c.model.size[1];
    c.contents.forEach((e, i) => {
      const a = (i / Math.max(1, c.contents.length)) * TAU + Math.random();
      const pos = new THREE.Vector3(c.x + c.fwd.x * (c.front * 0.6) + Math.cos(a) * 0.15, c.y + Math.min(1.7, top) + 0.3 + i * 0.12, c.z + c.fwd.z * (c.front * 0.6) + Math.sin(a) * 0.15);
      let vm = valueMul;
      if (m.loss && Math.random() < m.loss.p) { vm *= m.loss.mul; damaged++; }
      const def = ITEMS[e.type], opts = { valueMul: vm, linvel: [c.fwd.x * 1.4 + Math.cos(a) * 0.9, 3.4 + Math.random() * 1.2, c.fwd.z * 1.4 + Math.sin(a) * 0.9] };
      if (e.tier) opts.tier = e.tier;
      if (def && C.TOOL_IDS.includes(e.type)) opts.charges = C.chargesFor(def, e.tier || 'common');
      game.items.hostSpawn(e.type, pos, opts);
    });
    if (damaged) game.net.broadcast('sys', sysMsg('Forced open: {n} item(s) were damaged.', { n: damaged }, 'warn'));
    if (Math.random() < C.alarmChance(m)) triggerAlarm(c);
    push(c, { o: 1, m: m.id });
    if (by) game.net.broadcast('xp', { to: by, xp: C.KINDS[c.kind].xp + (run.quotaIndex || 0) * 4, coin: Math.round(C.KINDS[c.kind].xp / 8), reason: C.nameOf(c.kind, c.variant) + ' opened' });
    setOpened(c, true, m.id);
    mods.emit('tfg:secureOpened', { id: c.id, kind: c.kind, method: m.id, by, pos: [c.x, c.y, c.z], loot: c.contents.map((e) => e.type) });
  }

  // ---- host tick ------------------------------------------------------------------------------------------------------
  function hostUpdate(dt) {
    if (game.run?.phase !== 'moon') return;
    for (const c of cs.values()) {
      if (c.opened) continue;
      const w = c.hw;
      if (w) {
        w.t += dt;
        const m = C.methodOf(c.kind, w.m), nz = C.noiseOf(m);
        if (nz.loud > 0 && nz.every > 0) { w.next -= dt; if (w.next <= 0) { w.next = nz.every; noiseAt(c, nz.loud); } }
        const p = posOf(w.by);
        if (!p || Math.hypot(p.x - c.x, p.z - c.z) > NEAR + 2 || w.t > (m.minigame ? 240 : w.dur * 3 + 30)) endWork(c);
      }
      if (c.hd) hostDrillTick(c, dt);
    }
  }

  // ================================================================================================ all peers: state + fx
  function setOpened(c, animate, method) {
    if (c.opened) return;
    c.opened = true; c.claimed = true;
    if (c.work) c.work = null;
    unmountDrill(c);
    c.model.setWork(0);
    c.model.setOpen(1, !animate);
    if (animate) {
      const p = c.pos;
      if (c.kind === 'case') { snd('sl_glass', p, 1); game.particles?.burst?.(new THREE.Vector3(c.x, c.y + 1.2, c.z), { count: 18, color: [0xd8f0ff, 0xffffff, 0x9fc4dc], speed: 3.4, up: 2, life: 0.8, size: 0.05, gravity: 10, drag: 1.2 }); }
      else snd(c.kind === 'vault' ? 'vault_open' : 'door_creak', p, 0.9);
      snd('ui_notify', p, 0.5);
    }
    void method;
  }
  function mountDrill(c) {
    if (c.dm || !map) return;
    c.dm = createDrillRig({ height: c.model.rig.doorY ?? 0.5 });
    const d = c.front + 0.62;
    c.dm.root.position.set(c.x + c.fwd.x * d, c.y, c.z + c.fwd.z * d);
    c.dm.root.rotation.y = c.yaw;
    map.fac.group.add(c.dm.root);
  }
  function unmountDrill(c) {
    if (c.dsnd) { try { c.dsnd.stop(0.15); } catch { /* ignore */ } c.dsnd = null; }
    if (c.dm) { c.dm.dispose(); c.dm = null; }
    c.drill = null;
  }
  function applyState(e) {
    const c = cs.get(e.id);
    if (!c) return;
    if (e.o) setOpened(c, !e.q, e.m);
    if (e.w !== undefined) { c.work = e.w ? { m: e.w, by: e.by } : null; c.model.setWork(e.w ? 1 : 0); }
    if (e.d !== undefined && !c.opened) {
      if (!e.d) unmountDrill(c);
      else {
        const wasJam = !!c.drill?.j;
        c.drill = { p: e.d.p, j: !!e.d.j, tr: e.d.tr, dur: e.d.dur };
        mountDrill(c);
        if (c.drill.j && !wasJam) { snd('sl_jam', c.pos, 1); game.particles?.burst?.(c.dm.root.position.clone().add(_v.set(0, 1, 0)), { count: 10, color: [0x555555, 0x888888, 0x333333], speed: 1, up: 1.4, life: 1.2, size: 0.12, gravity: -1.2, drag: 3 }); if (!e.jam || e.jam === 1) toast(t('The drill jammed!'), 'warn'); else toast(t('Something is chewing the drill!'), 'bad'); }
      }
    }
  }
  function onState(d) {
    if (!map || !d || d.s !== map.seed) return;
    if (Array.isArray(d.list)) { for (const e of d.list) applyState(e); return; }
    applyState(d);
  }
  function bindNet(net) {
    net.on_('slSt', (d) => onState(d));
    net.handle('slAct', (d, from) => { try { onAct(d, from); } catch (e) { console.warn('[secureloot] act', e); } });
  }

  // ---- per frame: models, hold-E, drill loop, sparks -------------------------------------------------------------------
  const FX = {
    torch: { count: 5, color: [0xfff2c0, 0xffb040, 0x60c8ff], speed: 4.2, up: 1.6, life: 0.4, size: 0.05, gravity: 6, drag: 2 },
    spark: { count: 4, color: [0xffd27a, 0xffa030, 0xfff2c0], speed: 3.4, up: 1.0, life: 0.3, size: 0.04, gravity: 8, drag: 2 },
    dust: { count: 3, color: [0x8a7a66, 0xa89880], speed: 1, up: 0.6, life: 0.7, size: 0.1, gravity: -0.4, drag: 3 },
  };
  function update(dt) {
    time += dt;
    if (!map) return;
    if (game.world?.facility !== map.fac || !game.world?.moonId) { clear(); return; }
    if (!syncAsked && !isHost() && game.net?.connected && game.run?.phase === 'moon') { syncAsked = true; req('sync'); }
    if (isHost()) hostUpdate(dt);
    // hold-E progress (client)
    if (hold) {
      const tgt = game.interactTarget;
      const ok = game.input?.isDown('interact') && tgt?.action?.__sl === hold.key && !game.player.dead && !hold.c.opened && !game.minigame;
      if (!ok) stopHold();
      else {
        hold.t += dt;
        const k = Math.floor(hold.t / 0.35);
        if (k !== hold.tick) { hold.tick = k; game.sfx?.('lockpick_click', 0.22, 0.9 + 0.1 * (k % 3)); }
        const lbl = hold.kind === 'fix' ? t('Clearing the jam...') : hold.kind === 'pack' ? t('Packing up...') : tf(VERB[hold.sel.method.id] || 'Open {name}', { name: nameOf(hold.c) });
        setBar(lbl, hold.t / hold.dur);
        if (hold.t >= hold.dur) finishHold();
      }
    }
    const cam = game.camera;
    for (const c of cs.values()) {
      c.model.update(dt, time);
      // work fx: sparks + sound while somebody works on it
      if (c.work && !c.opened) {
        c.fxT -= dt;
        if (c.fxT <= 0) {
          c.fxT = c.work.m === 'torch' ? 0.1 : 0.55;
          const at = _v.set(c.x + c.fwd.x * (c.front * 0.7), c.y + Math.min(1.2, c.model.size[1] * 0.6), c.z + c.fwd.z * (c.front * 0.7));
          const f = c.work.m === 'torch' ? FX.torch : c.work.m === 'cutter' || c.work.m === 'bolt' || c.work.m === 'emp' ? FX.spark : c.work.m === 'hack' ? null : FX.dust;
          if (f) game.particles?.burst?.(at, f);
          if (c.work.m !== 'torch' || Math.random() < 0.12) { const s = HOLD_SND[c.work.m]; if (s) snd(s, c.pos, c.work.m === 'torch' ? 0.5 : 0.7); }
        }
      }
      if (c.dm) {
        c.dm.setState({ run: true, jam: !!c.drill?.j, p: c.drill?.p || 0 });
        c.dm.update(dt, cam);
        const want = c.drill && !c.drill.j;
        if (want && !c.dsnd && game.camera.position.distanceToSquared(c.pos) < 6400) c.dsnd = game.audio?.play?.('sl_drill', { pos: c.dm.root.position.clone().add(_v.set(0, 1, 0)), volume: 0.95, loop: true, refDistance: 4, maxDistance: 75, occlude: true }) || null;
        else if (!want && c.dsnd) { try { c.dsnd.stop(0.15); } catch { /* ignore */ } c.dsnd = null; }
        if (want && Math.random() < dt * 6) game.particles?.burst?.(c.dm.root.position.clone().add(_v.set(-c.fwd.x * 0.6, 1.0, -c.fwd.z * 0.6)), FX.spark, null, 0.6);
      }
    }
  }

  // ---- scan: an icon (the needed tool) + name over every closed container -------------------------------------------------
  function addScanLabels(labels) {
    const p = game.player;
    if (!map || !p?.indoor) return;
    const eye = game.camera.position, fwd = _f.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const range = game.stats?.scanRange || 30;
    for (const c of cs.values()) {
      if (c.opened) continue;
      const to = new THREE.Vector3(c.x, c.y + Math.min(1.7, c.model.size[1]) + 0.25, c.z).sub(eye), dist = to.length();
      if (dist > range || to.normalize().dot(fwd) < 0.4) continue;
      const need = c.kind === 'safe' ? tf('Needs: {tools}', { tools: t('Drill') + ' / ' + t('code') }) : c.kind === 'case' ? t('Glass Cutter (or smash)') : tf('Needs: {tools}', { tools: t(ITEMS[TOOL_ICON[c.kind]].name) });
      labels.push({ pos: new THREE.Vector3(c.x, c.y + Math.min(1.7, c.model.size[1]) + 0.25, c.z), name: nameOf(c), sub: c.drill ? `${t('Drilling')} ${Math.round((c.drill.p || 0) * 100)}%` : need, color: KIND_COLOR[c.kind], type: TOOL_ICON[c.kind] });
    }
  }
  const scanFx = game.scanFx, origReveal = scanFx?.reveal;
  const wrappedReveal = origReveal ? function (labels, ...rest) { try { addScanLabels(labels); } catch (e) { console.warn('[secureloot] scan', e); } return origReveal.call(this, labels, ...rest); } : null;
  if (wrappedReveal) scanFx.reveal = wrappedReveal;

  // ---- host: code slips + rare loose tools + chest bonus ----------------------------------------------------------------------
  function onPopulated() {
    if (!isHost() || !map) return;
    const fac = map.fac, R = new RNG(((map.seed | 0) ^ 0x51195) >>> 0);
    const spots = (fac.scrapSpots || []).filter((s) => s.room >= 0 && Number.isFinite(s.x) && (!fac.nav || fac.nav.walkableAt(s.x, s.z)));
    if (!spots.length) return;
    for (const c of cs.values()) {
      if (c.kind !== 'safe' || !C.hasCodeSlip(map.seed, c.id)) continue;
      const far = spots.filter((s) => s.room !== c.room && Math.hypot(s.x - c.x, s.z - c.z) > 10);
      const s = R.pick(far.length ? far : spots);
      game.items.hostSpawn(C.T.NOTE, new THREE.Vector3(s.x, s.y + 0.35, s.z), { label: `sl:${c.id}:${c.code}` });
    }
    // rare: a breaching tool lying around (10 %; deeper = a better tier)
    if (R.chance(0.1)) {
      const s = R.pick(spots), id = R.weighted([{ id: C.T.CUTTER, w: 30 }, { id: C.T.BOLT, w: 28 }, { id: C.T.HACK, w: 20 }, { id: C.T.TORCH, w: 12 }, { id: C.T.DRILL, w: 10 }]).id;
      const tier = rollTier(R, { luck: 0.05 + map.quota * 0.03, maxTier: 'epic' });
      game.items.hostSpawn(id, new THREE.Vector3(s.x, s.y + 0.4, s.z), { tier, charges: C.chargesFor(ITEMS[id], tier) });
    }
  }
  function onChestOpened(d) {
    if (!isHost() || !d?.pos) return;
    const p = { wood: 0.03, iron: 0.08, gold: 0.16, void: 0.3 }[d.tier] ?? 0.05;
    if (Math.random() >= p) return;
    const id = [C.T.CUTTER, C.T.BOLT, C.T.HACK, C.T.TORCH, C.T.DRILL][Math.floor(Math.random() * 5)];
    const tier = rollTier(new RNG((Math.random() * 4294967296) >>> 0), { luck: 0.1, maxTier: 'epic' });
    game.items.hostSpawn(id, new THREE.Vector3(d.pos[0] + 0.3, d.pos[1] + 1.4, d.pos[2]), { tier, charges: C.chargesFor(ITEMS[id], tier), linvel: [0.8, 3.5, 0.4] });
  }

  // ---- Code Slip: LMB reads it ------------------------------------------------------------------------------------------------
  on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled || it.type !== C.T.NOTE) return;
    hk.handled = true;
    const m = /^sl:(\w+):(\d{4})$/.exec(it.label || '');
    const c = m && cs.get(m[1]);
    toast(c ? tf('Code {code} - {name}. Find it and press [E].', { code: m[2].split('').join(' '), name: nameOf(c) }) : t('A scribbled code. This safe is not on this moon.'), 'info');
  });

  on('netReady', (net) => bindNet(net));
  on('mapLoaded', (world) => { try { onMapLoaded(world); } catch (e) { console.warn('[secureloot] map', e); } });
  on('moonPopulated', () => { try { onPopulated(); } catch (e) { console.warn('[secureloot] populate', e); } });
  on('interactables', (out) => { try { addInteractables(out); } catch (e) { console.warn('[secureloot] prompts', e); } });
  on('tfg:chestOpened', (d) => { try { onChestOpened(d); } catch (e) { console.warn('[secureloot] chest bonus', e); } });
  on('update', (dt) => { try { update(dt); } catch (e) { console.warn('[secureloot] update', e); } });
  if (game.net) { try { bindNet(game.net); } catch { /* bound on netReady */ } }

  return {
    /** [{ id, kind, variant, x, y, z, opened, drilling, contents }] (debug / tests) */
    list: () => [...cs.values()].map((c) => ({ id: c.id, kind: c.kind, variant: c.variant, x: c.x, y: c.y, z: c.z, room: c.room, opened: c.opened, drilling: !!c.drill, jammed: !!(c.drill?.jammed || c.drill?.j), contents: c.contents, code: c.code })),
    get: (id) => cs.get(id) || null,
    /** debug / tests: put one container of a kind at pos (local + host only; ids 'dN') */
    debugSpawn(kind, variant, pos, yaw = 0) { if (!map || !C.KINDS[kind]) return null; return addContainer({ id: 'd' + (dbgN++), kind, variant, x: pos.x, y: pos.y, z: pos.z, yaw, room: -1, num: 0, wall: false }); },
    /** host: run the whole open flow with a method id (debug / tests): open('s0', 'smash') */
    open(id, method, by) {
      const c = cs.get(id), m = c && C.methodOf(c.kind, method);
      if (!isHost() || !c || !m || c.opened) return false;
      hostOpen(c, by || game.selfId, m, null, null);
      return true;
    },
    drillStart(id, itemId) { const c = cs.get(id); if (!isHost() || !c) return false; hostDrillStart(c, game.selfId, { tool: itemId }); return !!c.drill; },
    /** host: force the next jam / clear it (tests) */
    forceJam(id) { const c = cs.get(id); if (isHost() && c?.hd && !c.hd.jammed) { c.hd.jammed = true; push(c, { d: drillMsg(c), jam: 1 }); return true; } return false; },
    dispose() {
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      clear();
      if (scanFx && wrappedReveal && scanFx.reveal === wrappedReveal && Object.prototype.hasOwnProperty.call(scanFx, 'reveal')) delete scanFx.reveal;
      if (!hadHack && MINIGAMES.hack === createHack) delete MINIGAMES.hack;
      box.remove();
    },
  };
}
