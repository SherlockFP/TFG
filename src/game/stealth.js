// STEALTH wave 4 - module `stealth` (docs/wave4/stealth.md). Installed with `this.useModule('stealth', installStealth)` in game.js.
//   1. SNEAK: Alt held (or crouch-walk) = slow, near-silent walking (the movement numbers live in entities/localplayer.js, they read game.stealth.sneakHeld()).
//      Surfaces matter (metal / water loud, carpet quiet). HUD NOISE meter (right dock) + a subtle footstep ring on the floor.
//   2. NOISE EVENTS: item impacts (thrown bottles!), doors, the Noisemaker. Clients batch them into ONE compact, rate-limited 'stn' request
//      ([kind, x*10, y*10, z*10, loud*100] rows); the host validates them and feeds creatures.noise() (owner-less: creatures investigate the SPOT).
//      Sound does not go through walls: CreatureManager.hear() asks game.stealth.hearDist() (walls +7 m, closed doors +3.5 m each).
//   3. SOUND-HUNTERS: The Listener (new, eyeless) and the Web Crawler (existing, re-wired) use game/stealth_creatures.js: alert -> hunt the LAST noise ->
//      inspect (a decoy) / search -> forget. Silent players are ignored unless they bump into it.
//   4. TOOLS: Noisemaker (grenade kind, shop 'consumables', 22 credits): a loud 9 s decoy; guide tips (TIPS).
//   5. FACILITY VARIETY runtime (world/facility_variety.js): creaky HATCH plates (fall to a spot nearer the entrance unless you sneak), dead-end nook rewards
//      (host spawns a prize), latch-controlled SHORTCUT doors (locked from the entrance side, released with E from the deep side).
// Net: 'stn' (client -> host request: {e:[[kind,x,y,z,loud]...]}), 'stv' (host -> all, HOST_ONLY: {e:[[x,z,loud,kind]...]} rings). Everything else is local.
import * as THREE from 'three';
import { addTranslations, t, tf, sysMsg } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { RNG } from '../core/rng.js';
import { hudDock } from '../ui/dock.js';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { BEHAVIORS, STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { ITEMS, scrapTableFor } from './items.js';
import { scrapValueMul } from './progression.js';
import { MOONS } from './moons.js';
import { IDENT } from './identify.js';
import { CREATURE_FLAVOUR } from './components.js';
import { createListenerModel } from '../models/stealth_models.js';
import { TR, RU } from './stealth_text.js';
import * as S from './stealth_core.js';
import { soundHunter, LISTENER_CFG, CRAWLER_CFG, LISTENER_DEF, LISTENER_SPAWN } from './stealth_creatures.js';

HOST_ONLY.add('stv');
const FACILITY_Y = -300;
const clamp = S.clamp;
let registered = false;

export function registerStealthContent() {
  if (registered) return;
  registered = true;
  if (!CREATURES.listener) registerCreature('listener', { ...LISTENER_DEF }, soundHunter(LISTENER_CFG));
  if (!EXTRA_SPAWNS.listener) EXTRA_SPAWNS.listener = { ...LISTENER_SPAWN };
  Object.assign(STATE_SOUNDS, {
    listener: { alert: [['beep_3', 'turret_detect'], 0.55, 0.7], hunt: [['hound_growl', 'lurker_growl'], 0.95, 0.6], attack: [['lurker_snap', 'hound_bark'], 1.0, 0.7],
      inspect: [['beep_3', 'squeak'], 0.35, 0.55], stunned: ['hit_flesh', 0.7, 0.7], dead: ['creature_death', 1.0, 0.7] },
  });
  LOOPS.listener = LOOPS.listener || [];
  IDENT.listener = ['Predator', 4, 'Blind. Hears you at walk 6 m / sprint 15 m. Sneak (Alt) or throw something to lure it.'];
  CREATURE_FLAVOUR.listener = 'organic';
}

export function installStealth(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  registerStealthContent();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  // the literal t() keys of this file (also in stealth_text.js; kept inline so tools/i18n_audit.mjs sees them)
  addTranslations({ 'NOISE': 'SES', 'heard within ~{n} m': '~{n} m öteden duyulursun', 'SNEAKING': 'SESSİZ YÜRÜYÜŞ', 'The floor plates here look loose. Sneak across (hold Alt).': 'Buradaki zemin plakaları gevşek görünüyor. Sessizce geç (Alt basılı tut).',
    'The floor gives way!': 'Zemin çöktü!', 'Release the latch [E]': 'Mandalı çek [E]', 'Opens the shortcut for everyone': 'Kısayolu herkes için açar', 'The latch is on the other side': 'Mandal öbür tarafta',
    'A latch clicks open somewhere in the facility.': 'Tesisin bir yerinde bir mandal tık diye açıldı.' }, 'tr');
  addTranslations({ 'NOISE': 'ШУМ', 'heard within ~{n} m': 'слышно за ~{n} м', 'SNEAKING': 'КРАДЁМСЯ', 'The floor plates here look loose. Sneak across (hold Alt).': 'Плиты пола здесь шатаются. Пройдите тихо (удерживайте Alt).',
    'The floor gives way!': 'Пол проваливается!', 'Release the latch [E]': 'Отпереть защёлку [E]', 'Opens the shortcut for everyone': 'Откроет короткий путь для всех', 'The latch is on the other side': 'Защёлка с другой стороны',
    'A latch clicks open somewhere in the facility.': 'Где-то на объекте щёлкнула защёлка.' }, 'ru');
  const offs = [], undo = [];
  let disposed = false, boundNet = null;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.creatureModels && !mm.creatureModels.has('listener')) mm.creatureModels.set('listener', (T, o) => createListenerModel(o || {}));
  const enabled = () => g.config?.stealth !== false;
  const isMoon = () => g.run?.phase === 'moon' && !MOONS[g.run?.moon]?.company;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const V = new THREE.Vector3();

  function wrap(obj, name, make) {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w;
    undo.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  }

  // ==================================================================================== sound-hunting Web Crawler
  {
    const origCrawler = BEHAVIORS.crawler;
    const ears = soundHunter(CRAWLER_CFG);
    const wrapped = (c, dt, M) => (enabled() ? ears(c, dt, M) : origCrawler(c, dt, M));
    BEHAVIORS.crawler = wrapped;
    undo.push(() => { if (BEHAVIORS.crawler === wrapped) BEHAVIORS.crawler = origCrawler; });
  }

  // ==================================================================================== input: sneak key
  const input = g.input;
  const sneakKey = () => g.settings?.keys?.sneak || 'AltLeft';
  function sneakHeld() {
    if (!enabled() || !input || !input.enabled) return false;
    return input.down.has(sneakKey()) || input.down.has('AltRight');
  }
  const keyGuard = (e) => { if ((e.code === 'AltLeft' || e.code === 'AltRight') && input?.locked) e.preventDefault(); };   // no browser menu focus on Alt
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', keyGuard, true); window.addEventListener('keyup', keyGuard, true);
    undo.push(() => { window.removeEventListener('keydown', keyGuard, true); window.removeEventListener('keyup', keyGuard, true); });
  }

  // ==================================================================================== surfaces
  const inPool = (p) => {
    const pools = g.world?.facility?.variety?.pools;
    if (!pools?.length) return false;
    for (const q of pools) if (p.x > q.x0 && p.x < q.x1 && p.z > q.z0 && p.z < q.z1) return true;
    return false;
  };
  /** multiplier for the player's footstep noise on the floor under him */
  function surfaceMul() {
    const p = g.player;
    if (p && p.indoor && inPool(p.pos)) return S.SURFACE.water;
    return S.surfaceMul(g.lastStepSurface);
  }

  // ==================================================================================== noise events (client batch -> host)
  const batcher = new S.NoiseBatcher();
  const limiter = S.makeRateLimiter(10, 12);
  const stvLimiter = S.makeRateLimiter(12, 12);
  /** report a noise made by THIS peer (thrown item landed, door slam ...). Host applies it directly, clients batch it. */
  function emit(kind, x, y, z, loud) {
    if (disposed || !enabled() || !isMoon()) return;
    if (g.isHost) hostNoiseAt(V.set(x, y, z), loud, kind);
    else batcher.add(kind, x, y, z, loud, now());
  }
  function hostNoiseAt(pos, loud, kind = 'use') {
    if (!g.isHost || !g.creatures || !(loud > 0.02)) return;
    g.creatures.noise(pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), Math.min(loud, S.NOISE.stickEvent), null);   // owner-less: creatures go to the SPOT
    if (loud >= 0.25 && stvLimiter('host', now())) g.net?.broadcast?.('stv', { e: [[Math.round(pos.x * 10), Math.round(pos.z * 10), Math.round(loud * 100), S.EVENT_KINDS[kind] ?? 6]] });
  }
  function hostReceive(d, from) {
    if (!g.isHost || disposed || !enabled() || !limiter(from, now())) return;
    const sp = g.aiPlayerById?.(from);
    for (const e of S.sanitizeEvents(d?.e, sp ? sp.pos : null, 70)) hostNoiseAt(V.set(e.x, e.y, e.z), e.loud, e.kind);
  }
  on('registerHandlers', (H, gg) => { if (gg === g) H('stn', hostReceive); });

  // hearing distance used by CreatureManager.hear (walls / closed doors muffle sound)
  function hearDist(a, b, c, d0) {
    if (!enabled()) return d0 ?? a.distanceTo(b);
    const fac = g.world?.facility;
    if (!fac?.nav || (c && c.zone === 'out') || a.y > FACILITY_Y + 40 || b.y > FACILITY_Y + 40) return d0 ?? a.distanceTo(b);
    const doorAt = (key) => { const d = fac.doorByKey?.get(key); return !!d && d.kind === 'door' && !d.open && !d.locked; };
    return S.effectiveDistance(fac.nav, a, b, doorAt);
  }

  // doors are noisy (host sees every non-silent door change; creatures open doors silently)
  wrap(g, 'hostSetDoor', (orig) => function (id, open, silent) {
    const door = this.doorById?.(id);
    const changes = !!door && door.open !== !!open;
    const r = orig.call(this, id, open, silent);
    if (changes && !silent && enabled() && door.kind === 'door' && door.pos) hostNoiseAt(door.pos, open ? S.NOISE.door : S.NOISE.doorSlam, 'door');
    return r;
  });
  // item impacts: dropping / throwing things makes noise (the original reports only hard impacts > 7)
  wrap(g, 'onItemImpact', (orig) => function (it, dv) {
    const r = orig.call(this, it, dv);
    try {
      if (enabled() && it?.obj && dv > 3.5) {
        const fragile = !!it.def?.fragile;
        if (dv <= 7 || fragile) { const p = it.obj.position; emit('impact', p.x, p.y, p.z, S.itemImpactLoudness(dv, fragile) * (dv > 7 ? 0.6 : 1)); }
      }
    } catch { /* noise is optional */ }
    return r;
  });

  // ==================================================================================== HUD: noise meter + footstep rings
  let box = null, els = null, cssDone = false, shown = 0, hudT = 0;
  function injectCss() {
    if (cssDone || typeof document === 'undefined') return;
    cssDone = true;
    const st = document.createElement('style');
    st.id = 'tfg-stealth-css';
    st.textContent = `
.tfg-noise{--tc:#6fdc8c;width:168px;padding:4px 8px 6px;background:rgba(6,4,3,.58);border-right:3px solid var(--tc);font-family:var(--cond,'Arial Narrow',sans-serif);
  text-transform:uppercase;letter-spacing:1.5px;transition:border-color .2s,opacity .35s;pointer-events:none}
.tfg-noise.off{display:none}
.tfg-noise .nz-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;line-height:1}
.tfg-noise .nz-label{font-size:12px;color:rgba(255,217,184,.6)}
.tfg-noise .nz-name{font-size:17px;font-weight:bold;color:var(--tc);text-shadow:0 0 8px var(--tc)}
.tfg-noise .nz-bar{position:relative;height:6px;margin-top:4px;background:rgba(255,255,255,.08);overflow:hidden}
.tfg-noise .nz-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--tc);box-shadow:0 0 8px var(--tc)}
.tfg-noise .nz-tick{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.75)}
.tfg-noise .nz-foot{display:flex;justify-content:space-between;margin-top:5px;line-height:1;font-size:11px;color:rgba(255,217,184,.5);letter-spacing:1px}
.tfg-noise .nz-sneak{color:var(--tc)}
`;
    document.head.appendChild(st);
  }
  function buildBox() {
    if (box || typeof document === 'undefined') return;
    injectCss();
    box = hudDock('right', 'stealth', 12);
    const root = document.createElement('div');
    root.className = 'tfg-noise off';
    root.innerHTML = `<div class="nz-head"><span class="nz-label"></span><span class="nz-name"></span></div>
      <div class="nz-bar"><i class="nz-fill"></i><b class="nz-tick" style="left:20%"></b><b class="nz-tick" style="left:45%"></b></div>
      <div class="nz-foot"><span class="nz-r"></span><span class="nz-sneak"></span></div>`;
    box.appendChild(root);
    els = { root, label: root.querySelector('.nz-label'), name: root.querySelector('.nz-name'), fill: root.querySelector('.nz-fill'), r: root.querySelector('.nz-r'), sneak: root.querySelector('.nz-sneak') };
    els.label.textContent = t('NOISE');
  }
  const COLORS = { SILENT: '#7fb8ff', QUIET: '#6fdc8c', STEADY: '#ffd23f', LOUD: '#ff5a4a' };
  function refreshBox(dt) {
    if (!els) return;
    const p = g.player;
    const on = enabled() && isMoon() && p && !p.inShip && !p.dead && g.settings?.stealthMeter !== false;
    els.root.classList.toggle('off', !on);
    if (!on) return;
    shown += (Math.max(p.noise || 0, 0) - shown) * Math.min(1, dt * 10);
    const band = S.bandOf(shown);
    els.root.style.setProperty('--tc', COLORS[band]);
    els.name.textContent = t(band);
    els.fill.style.width = Math.round(clamp(shown, 0, 1) * 100) + '%';
    els.r.textContent = tf('heard within ~{n} m', { n: Math.max(1, Math.round(S.radiusOf(shown, 16))) });
    els.sneak.textContent = p.sneak || p.crouch ? t('SNEAKING') : '';
  }

  // footstep / event rings (pooled flat meshes: no lights)
  const rings = [];
  let ringGeo = null;
  function ringAt(x, y, z, radius, color, life = 0.7, opacity = 0.22) {
    if (typeof document === 'undefined' || !g.scene) return;
    if (!ringGeo) { ringGeo = new THREE.RingGeometry(0.93, 1, 40); ringGeo.rotateX(-Math.PI / 2); }
    let r = rings.find((q) => !q.active);
    if (!r) {
      if (rings.length >= 8) return;
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.renderOrder = 5; m.frustumCulled = false; m.visible = false;
      g.scene.add(m);
      r = { m, active: false, t: 0, life: 1, radius: 1, opacity: 0.2 };
      rings.push(r);
    }
    r.active = true; r.t = 0; r.life = life; r.radius = radius; r.opacity = opacity;
    r.m.material.color.setHex(color);
    r.m.position.set(x, y + 0.06, z); r.m.visible = true;
  }
  function updateRings(dt) {
    for (const r of rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { r.active = false; r.m.visible = false; continue; }
      r.m.scale.setScalar(Math.max(0.05, r.radius * (0.25 + 0.75 * Math.sqrt(k))));
      r.m.material.opacity = r.opacity * (1 - k) * (1 - k);
    }
  }
  let lastFoot = 0;
  function footRing() {
    const p = g.player;
    if (!p || p.footIdx === lastFoot) return;
    lastFoot = p.footIdx;
    if (!enabled() || g.settings?.stealthRings === false || !isMoon() || p.inShip || p.dead) return;
    const loud = p.noise || 0;
    if (loud < 0.05) return;
    const band = S.bandOf(loud);
    ringAt(p.pos.x, p.pos.y, p.pos.z, clamp(S.radiusOf(loud, 12), 0.8, 9), band === 'LOUD' ? 0xff6a55 : band === 'STEADY' ? 0xffd23f : 0x7fe0a0, 0.75, band === 'LOUD' ? 0.28 : 0.2);
  }
  // rings for noises other people made (host-relayed 'stv'): a faint ping where it happened, only when it is near you
  function onStv(d) {
    if (disposed || !d || !Array.isArray(d.e) || g.settings?.stealthRings === false) return;
    const p = g.player;
    for (const e of d.e.slice(0, 4)) {
      if (!Array.isArray(e)) continue;
      const x = Number(e[0]) / 10, z = Number(e[1]) / 10, loud = Number(e[2]) / 100;
      if (!Number.isFinite(x + z + loud) || !p || Math.hypot(x - p.pos.x, z - p.pos.z) > 40) continue;
      ringAt(x, p.pos.y, z, clamp(loud * 6, 1, 14), 0xffb04a, 1.0, 0.24);
    }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:stv', onStv);
    boundNet = net; net.on('msg:stv', onStv);
  }
  on('netReady', (n, gg) => { if (gg === g) bindNet(n); });
  if (g.net) bindNet(g.net);

  // ==================================================================================== facility variety: hatches / shortcut latch / nook rewards
  const H = { arm: 0, cool: 0, hinted: false, warned: new Set() };
  function hatchUpdate(dt) {
    const fac = g.world?.facility, p = g.player;
    const list = fac?.variety?.hatches;
    if (!list?.length || !p || p.dead || !p.indoor || !isMoon()) { H.arm = 0; return; }
    H.cool = Math.max(0, H.cool - dt);
    let onPlate = null, near = false;
    for (const h of list) {
      const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
      if (d < h.r + 3.5) near = true;
      if (d < h.r && Math.abs(p.pos.y - h.y) < 1.5) { onPlate = h; break; }
    }
    if (near && !H.hinted) { H.hinted = true; g.ui?.toast?.(t('The floor plates here look loose. Sneak across (hold Alt).'), 'info'); }
    if (!onPlate) { H.arm = 0; return; }
    const quiet = (p.noise || 0) <= 0.14;
    if (quiet) { H.arm = Math.max(0, H.arm - dt); return; }
    H.arm += dt;
    if (H.arm > 0.32 && H.cool <= 0) {
      H.arm = 0; H.cool = 3;
      g.sfx?.('land_hard', 0.7, 0.7); g.engine?.shake?.(0.45);
      g.ui?.toast?.(t('The floor gives way!'), 'bad');
      const to = onPlate.to;
      p.teleport(new THREE.Vector3(to.x, to.y + 0.15, to.z), p.yaw);
      p.vel?.set?.(0, 0, 0);
      p.noise = Math.max(p.noise || 0, 0.8);   // the crash is heard where you land
      emit('hatch', to.x, to.y, to.z, 1.2);
    }
  }
  /** door prompt for latch shortcuts (called from Actions.doorInteraction) */
  function shortcutPrompt(door) {
    if (!door?.info?.shortcut || !door.locked) return null;
    const p = g.player, info = door.info;
    const side = info.dir === 0 ? (p.pos.x > door.pos.x ? 'b' : 'a') : (p.pos.z > door.pos.z ? 'b' : 'a');
    if (side === info.latch) return { label: t('Release the latch [E]'), sub: t('Opens the shortcut for everyone'), action: () => { g.sfx?.('lever_pull', 0.7); g.net.request('unlock', { id: door.id }); } };
    return { label: t('Locked'), sub: t('The latch is on the other side'), action: () => g.audio?.at?.('door_locked', door.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.8) };
  }
  // host: latch opened -> tell the crew
  let lockedShortcuts = new Set();
  function hostShortcutWatch() {
    const fac = g.world?.facility;
    if (!g.isHost || !fac) return;
    for (const d of fac.doors) {
      if (!d.info?.shortcut) continue;
      if (d.locked) lockedShortcuts.add(d.id);
      else if (lockedShortcuts.delete(d.id)) g.net.broadcast('sys', sysMsg('A latch clicks open somewhere in the facility.', {}, 'info'));
    }
  }
  // host: nook rewards (deterministic table roll, extra to the normal scrap: the reward for chasing loot into a maze)
  function hostPopulate() {
    if (!g.isHost || !enabled() || !isMoon() || g.config?.stealthLoot === false) return;
    const fac = g.world?.facility, V2 = fac?.variety;
    const rewards = V2?.rewards;
    if (!rewards?.length) return;
    const r = g.run, moon = MOONS[r.moon];
    const rng = new RNG(((r.seed | 0) ^ 0x57135) >>> 0);
    const table = scrapTableFor(fac.layout.theme).map(([id, w]) => ({ id, w }));
    if (!table.length) return;
    const size = fac.layout.size || 1;
    const picks = rewards.filter((q) => q.dist >= 5).sort((a, b) => (b.hatch ? 1 : 0) - (a.hatch ? 1 : 0) || b.dist - a.dist).slice(0, size >= 1.4 ? 3 : 2);
    const valueMul = (moon?.scrapMul || 1) * scrapValueMul(r.quotaIndex) * (1.25 + 0.05 * Math.min(6, picks.length));
    let n = 0;
    for (const q of picks) {
      const id = rng.weighted(table).id;
      if (!ITEMS[id]) continue;
      g.items.hostSpawn(id, new THREE.Vector3(q.x + rng.float(-0.4, 0.4), q.y + 0.5, q.z + rng.float(-0.4, 0.4)), { valueMul });
      n++;
    }
    api.stats.rewards = n;
    lockedShortcuts = new Set();
    for (const d of fac.doors) if (d.info?.shortcut && d.locked) lockedShortcuts.add(d.id);
  }
  on('moonPopulated', (gg) => { if (gg === g) hostPopulate(); });

  // ==================================================================================== update
  let watchT = 0;
  on('update', (dt) => {
    if (disposed) return;
    if (!els) buildBox();
    refreshBox(dt);
    footRing();
    updateRings(dt);
    hatchUpdate(dt);
    if (!g.isHost && g.net) {
      const b = batcher.drain(now());
      if (b) g.net.request('stn', { e: b });
    }
    watchT -= dt;
    if (watchT <= 0) { watchT = 0.5; hostShortcutWatch(); }
  });
  on('phase', () => { H.hinted = false; H.arm = 0; });
  on('mapLoaded', () => { H.hinted = false; H.arm = 0; lockedShortcuts = new Set(); });

  const api = {
    sneakHeld, surfaceMul, hearDist, shortcutPrompt, emit, hostNoiseAt,
    tips: S.TIPS,
    onInspect(c, at) { g.net?.broadcast?.('fx', { k: 'snd', s: 'beep_3', p: [at.x, (c.pos?.y ?? 0) + 1, at.z], v: 0.6, r: 6, m: 40 }); },
    setRings(v) { g.settings.stealthRings = !!v; },
    setMeter(v) { g.settings.stealthMeter = !!v; },
    stats: { rewards: 0 },
    dispose() {
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      for (const u of undo.reverse()) { try { u(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:stv', onStv); } catch { /* ignore */ }
      for (const r of rings) { r.m.removeFromParent(); r.m.material.dispose(); }
      rings.length = 0; ringGeo?.dispose();
      box?.remove(); box = null; els = null;
    },
  };
  return api;
}
