// Balance module (wave 1): creature scaling by sector + the Threat / Greed meter.
//
//   game.balance = {
//     threat()            0..100, the meter (run.threat, synced to every peer)
//     lootLuck()          0..1, for tier rolls: grows with threat and sector (greed pays)
//     scale(kind)         { hp, dmg, speed, spawn, detect, pace, hunt } multipliers for the current sector + threat.
//                         kind: 'creature' (default) | 'boss' | 'hazard'.  Applied by the GENERIC creature paths, so creatures
//                         registered by other modules are scaled too (see docs/wave1/balance.md, "where it is applied").
//     noise(pos, amount)  a noise event (creatures hear it AND it feeds threat). amount uses the creatures.noise units:
//                         0.3 footstep, 0.6 tool, 1 loud item, 3 shotgun / alarm, 4 explosion. Clients forward it to the host.
//     level()             { index 0..3, id, name } CALM / UNEASY / HUNTED / FUCKED
//   }
//
// The numbers live in balance_core.js (pure, shared with tools/sim/balance.mjs). This file is the game glue: the host-side
// meter, the client HUD (hudDock right, order 10), threshold announcements, and the hooks other systems call.
import * as THREE from 'three';
import { hudDock } from '../ui/dock.js';
import { addTranslations, t } from '../core/i18n.js';
import { isSellable } from './items.js';
import { scaleFor, lootLuckFor, earlyRules, capHit, ThreatModel, THREAT, LEVELS, levelIndex } from './balance_core.js';

const TICK = 0.25;            // s between host meter steps
const SYNC_EVERY = 0.5;       // s between run.threat writes (the generic run sync diffs it once a second)
const NEUTRAL = Object.freeze({ hp: 1, dmg: 1, speed: 1, spawn: 1, detect: 1, pace: 1, hunt: 0 });
const INACTIVE_EXTRACTION = new Set(['', 'idle', 'none', 'off', 'ready', 'inactive', 'done', 'complete', 'completed', 'success', 'succeeded', 'failed', 'fail', 'aborted', 'ended', 'end', 'cancelled', 'canceled']);
const DONE_EXTRACTION = new Set(['done', 'complete', 'completed', 'success', 'succeeded', 'ended', 'end']);

addTranslations({
  THREAT: 'TEHDİT', CALM: 'SAKİN', UNEASY: 'GERGİN', HUNTED: 'AVLANIYORSUN', FUCKED: 'BATTIN',
  'Nothing has noticed you. Yet.': 'Henüz kimse seni fark etmedi.',
  'Something in the walls is paying attention.': 'Duvarlardaki bir şey seni izliyor.',
  'The facility is sending things after you.': 'Tesis peşine bir şeyler gönderiyor.',
  'EVERYTHING KNOWS WHERE YOU ARE.': 'HER ŞEY NEREDE OLDUĞUNU BİLİYOR.',
  'The building loses interest.': 'Bina ilgisini kaybediyor.',
  'Ship door (sealed in flight)': 'Gemi kapısı (uçuşta mühürlü)',
  'Ship door (something is in the way)': 'Gemi kapısı (önünde bir şey var)',
});

let cssDone = false;
function injectCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'tfg-balance-css';
  st.textContent = `
.tfg-threat{--tc:#6fdc8c;width:168px;padding:4px 8px 6px;background:rgba(6,4,3,.58);border-right:3px solid var(--tc);font-family:var(--cond,'Arial Narrow',sans-serif);
  text-transform:uppercase;letter-spacing:1.5px;transition:border-color .25s,opacity .4s;pointer-events:none}
.tfg-threat.off{display:none}
.tfg-threat .tt-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;line-height:1}
.tfg-threat .tt-label{font-size:12px;color:rgba(255,217,184,.6)}
.tfg-threat .tt-name{font-size:19px;font-weight:bold;color:var(--tc);text-shadow:0 0 8px var(--tc)}
.tfg-threat .tt-bar{position:relative;height:7px;margin-top:4px;background:rgba(255,255,255,.08);overflow:hidden}
.tfg-threat .tt-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--tc);box-shadow:0 0 8px var(--tc);transition:background .25s}
.tfg-threat .tt-tick{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.75)}
.tfg-threat .tt-foot{display:flex;justify-content:space-between;margin-top:5px;line-height:1;font-size:11px;color:rgba(255,217,184,.5);letter-spacing:1px}
.tfg-threat .tt-trend{color:var(--tc)}
.tfg-threat.pulse{animation:tt-pulse .9s ease-out}
.tfg-threat.hot .tt-fill{animation:tt-throb 1.1s ease-in-out infinite}
.tfg-threat.max{animation:tt-shake .18s steps(2) infinite}
@keyframes tt-pulse{0%{transform:scale(1.28);filter:brightness(2.4);box-shadow:0 0 22px var(--tc)}40%{transform:scale(1.08);filter:brightness(1.6)}100%{transform:scale(1);filter:none;box-shadow:none}}
@keyframes tt-throb{0%,100%{filter:brightness(1)}50%{filter:brightness(1.9)}}
@keyframes tt-shake{0%{transform:translate(0,0)}50%{transform:translate(1px,-1px)}100%{transform:translate(-1px,1px)}}
@media (prefers-reduced-motion:reduce){.tfg-threat.pulse,.tfg-threat.hot .tt-fill,.tfg-threat.max{animation:none}}
`;
  document.head.appendChild(st);
}

export function installBalance(game) {
  let disposed = false;
  const offs = [];
  const model = new ThreatModel();
  const S = {
    acc: 0, syncT: 0, frame: 0,
    shown: 0, lvShown: 0, lvHost: 0, lastAnnounceT: -99, prevShown: 0,
    cacheKey: -1, cache: null,
    ext: { alarm: false, lockdown: false, overload: false, extraction: false },
    lastCtx: null, lastPhase: null, boxUpdateT: 0,
  };
  let box = null, els = null;

  // ------------------------------------------------------------------ helpers
  const run = () => game.run;
  const isMoon = () => run()?.phase === 'moon';
  const quota = () => Math.max(0, run()?.quotaIndex || 0);

  /** The meter: exact on the host, the synced value elsewhere. 0 outside a landing. */
  function threat() {
    if (!isMoon()) return 0;
    const v = game.isHost ? model.T : Number(run()?.threat);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  }
  function scale(kind = 'creature') {
    const q = quota(), T = threat();
    const key = q * 10000 + Math.round(T * 2);
    if (key !== S.cacheKey) {
      S.cacheKey = key;
      S.cache = { creature: Object.freeze(scaleFor(q, T, 'creature')), boss: Object.freeze(scaleFor(q, T, 'boss')), hazard: Object.freeze(scaleFor(q, T, 'hazard')) };
    }
    return S.cache[kind] || S.cache.creature;
  }
  const lootLuck = () => lootLuckFor(quota(), threat());
  const level = () => { const i = levelIndex(threat(), S.lvShown); return { index: i, id: LEVELS[i].id, name: LEVELS[i].name }; };
  const speedCap = () => earlyRules(quota()).speedCap || 0;

  /** Damage a creature / trap deals to a player, after the sector scale and the early-game hit cap. c = HostCreature. */
  function hitDamage(dmg, c) {
    if (!(dmg > 0)) return dmg;
    const kind = c?.def?.boss ? 'boss' : c?.def?.hazard ? 'hazard' : 'creature';
    const q = quota();
    if (dmg < 999) dmg = Math.max(1, Math.round(dmg * scale(kind).dmg));
    return capHit(dmg, q);
  }

  // ------------------------------------------------------------------ noise
  function noise(pos, amount = 1) {
    if (disposed || !(amount > 0)) return;
    const a = !pos ? null : Array.isArray(pos) ? pos : pos.toArray ? pos.toArray() : [pos.x, pos.y, pos.z];
    if (!a) return;
    if (game.isHost) {
      if (game.creatures?.noise) game.creatures.noise(new THREE.Vector3(a[0], a[1], a[2]), amount);   // -> onNoise below
      else onNoise(amount);
    } else game.net?.request?.('noise', { p: a, loud: amount });
  }
  /** creatures.noise() hook (host): every noise event any system makes also nudges the meter. */
  function onNoise(loud) { if (!disposed && game.isHost && isMoon()) model.noiseEvent(Number(loud) || 0); }
  function onDeath() { if (!disposed && game.isHost && isMoon()) { model.death(); syncRun(true); } }
  function onRelief(v) { if (!disposed && game.isHost && isMoon()) model.relief(v); }
  /** host.js haul pressure stage went up (secured value crossed 35 / 70 / 100 % of the quota) */
  function onPressure(stage) { if (!disposed && game.isHost && isMoon()) model.addSpike([0, 6, 9, 12][Math.max(0, Math.min(3, stage | 0))]); }
  function reset() { model.reset(); S.acc = 0; S.lvHost = 0; if (game.isHost && run()) run().threat = 0; S.cacheKey = -1; }

  // ------------------------------------------------------------------ host meter
  function carriedBy(insideIds) {
    let v = 0;
    if (!insideIds.size || !game.items?.all) return 0;
    for (const it of game.items.all()) {
      if (!it.holder || !insideIds.has(it.holder) || it.soulbound || it.type === 'body' || !it.def || !isSellable(it.def)) continue;
      v += it.value || 0;
    }
    return v;
  }
  function buildCtx() {
    const players = game.aiPlayers?.() || [];
    let crew = 0, inside = 0, aboard = 0, sprint = 0, voice = 0;
    const insideIds = new Set();
    for (const p of players) {
      if (p.dead) continue;
      crew++;
      if (p.inShip) { aboard++; continue; }
      if (p.zone !== 'in') continue;
      inside++; insideIds.add(p.id);
      const n = p.noise || 0;
      if (n >= THREAT.sprint.minLoud) sprint += n - THREAT.sprint.minLoud + 0.25;
      const v = p.voice || 0;
      if (v >= THREAT.voice.min) voice += v;
    }
    return {
      inside, crew, aboardAll: crew > 0 && aboard === crew, sprint, voice,
      carried: carriedBy(insideIds), secured: game.hostData?.dayStats?.collected || 0, quota: run()?.quota || 0,
    };
  }
  function hostStep(dt) {
    const r = run();
    if (!r) return;
    if (!isMoon()) {
      if (S.lastPhase === 'moon' || model.T > 0 || model.base > 0) { model.reset(); S.lvHost = 0; }
      if (r.threat) r.threat = 0;
      return;
    }
    if (!game.world?.facility) return;
    S.acc += dt;
    if (S.acc < TICK) return;
    const ctx = buildCtx();
    model.step(S.acc, ctx);
    S.acc = 0; S.lastCtx = ctx;
    // host side effect of a threshold crossing: the facility answers with an extra wave (budget permitting)
    const lv = levelIndex(model.T, S.lvHost);
    if (lv > S.lvHost && lv >= 2 && game.hostSpawnWave) {
      game.later?.(() => { if (isMoon()) { game.hostSpawnWave(1); if (lv >= 3 && game.hostSpawnOutdoor && (r.weather === 'eclipsed' || r.time > 17 * 60)) game.hostSpawnOutdoor(); } }, 1400);
    }
    S.lvHost = lv;
    S.syncT -= TICK;
    if (S.syncT <= 0) syncRun();
  }
  function syncRun(force) {
    const r = run();
    if (!r) return;
    S.syncT = SYNC_EVERY;
    const v = Math.round(model.T * 10) / 10;
    if (r.threat !== v || force) r.threat = v;
  }

  // ------------------------------------------------------------------ facility / extraction events (from the facility system)
  function applyExt() { if (game.isHost) model.setEvents(S.ext); }
  offs.push(game.mods?.on?.('tfg:facility', (st) => {
    const s = st?.state || st?.fac || st || {};
    const sec = String(s.security ?? '').toLowerCase(), pw = String(s.power ?? '').toLowerCase();
    S.ext.alarm = sec === 'alarm' || sec === 'lockdown';
    S.ext.lockdown = sec === 'lockdown';
    S.ext.overload = pw === 'overload';
    applyExt();
  }));
  offs.push(game.mods?.on?.('tfg:extraction', (d) => {
    const ph = String(d?.phase ?? '').toLowerCase();
    const active = !INACTIVE_EXTRACTION.has(ph);
    S.ext.extraction = active;
    if (game.isHost && DONE_EXTRACTION.has(ph) && isMoon()) model.relief(20);   // made it out: the building lets go a little
    applyExt();
  }));
  offs.push(game.mods?.on?.('director', (d) => { if (d?.kind === 'relief') onRelief(THREAT.directorRelief); }));
  offs.push(game.mods?.on?.('phase', (ph) => {
    // a new landing starts calm; leaving the moon clears everything (facility flags included)
    if (ph === 'landing' || ph === 'takeoff' || ph === 'orbit' || ph === 'company') {
      reset();
      if (ph !== 'landing') { S.ext.alarm = S.ext.lockdown = S.ext.overload = S.ext.extraction = false; model.setEvents(S.ext); }
    }
    S.lastPhase = ph;
    S.shown = 0; S.prevShown = 0; S.lvShown = 0;
    refreshBox(true);
  }));
  offs.push(game.mods?.on?.('update', (dt) => update(dt)));

  // ------------------------------------------------------------------ HUD
  function buildBox() {
    if (box || typeof document === 'undefined') return;
    injectCss();
    box = hudDock('right', 'threat', 10);
    const root = document.createElement('div');
    root.className = 'tfg-threat off';
    root.innerHTML = `<div class="tt-head"><span class="tt-label"></span><span class="tt-name"></span></div>
      <div class="tt-bar"><i class="tt-fill"></i><b class="tt-tick" style="left:25%"></b><b class="tt-tick" style="left:50%"></b><b class="tt-tick" style="left:75%"></b></div>
      <div class="tt-foot"><span class="tt-val"></span><span class="tt-trend"></span></div>`;
    box.appendChild(root);
    els = { root, label: root.querySelector('.tt-label'), name: root.querySelector('.tt-name'), fill: root.querySelector('.tt-fill'), val: root.querySelector('.tt-val'), trend: root.querySelector('.tt-trend') };
    els.label.textContent = t('THREAT');
  }
  function refreshBox(force) {
    if (!els) return;
    const on = isMoon() && !game.world?.company;
    els.root.classList.toggle('off', !on);
    if (!on) return;
    const lv = LEVELS[S.lvShown];
    els.root.style.setProperty('--tc', lv.color);
    els.name.textContent = t(lv.name);
    els.fill.style.width = S.shown.toFixed(1) + '%';
    els.val.textContent = Math.round(S.shown);
    const d = S.shown - S.prevShown;
    els.trend.textContent = d > 0.25 ? '▲' : d < -0.25 ? '▼' : '';
    els.root.classList.toggle('hot', S.lvShown >= 2);
    els.root.classList.toggle('max', S.lvShown >= 3);
    void force;
  }
  function pulse() {
    if (!els) return;
    els.root.classList.remove('pulse'); void els.root.offsetWidth; els.root.classList.add('pulse');
  }

  // ------------------------------------------------------------------ announcements (every peer, from the displayed value)
  const SND = {
    up: [['sting_drum'], ['sting_violin_glitch', 'jumpscare_3'], ['scifi_alarm_soft', 'ship_alarm', 'sting_synth_glitch']],
    down: ['ui_notify'],
  };
  function playFirst(names, volume) {
    const a = game.audio;
    if (!a?.play) return;
    for (const n of names) { try { if (a.has?.(n)) { a.play(n, { volume, bus: 'sfx' }); return; } } catch { /* sound is optional */ } }
  }
  function announce(newIdx, oldIdx) {
    const now = game.time || 0;
    if (now - S.lastAnnounceT < 2.5 && newIdx < oldIdx) return;
    S.lastAnnounceT = now;
    pulse();
    const lv = LEVELS[newIdx];
    if (newIdx > oldIdx) {
      game.ui?.toast?.(`${t('THREAT')}: ${t(lv.name)} - ${t(lv.line)}`, newIdx >= 2 ? 'bad' : 'info');
      playFirst(SND.up[Math.min(2, newIdx - 1)], 0.45 + 0.15 * newIdx);
      if (newIdx >= 3) game.engine?.shake?.(0.35);
    } else {
      game.ui?.toast?.(`${t('THREAT')}: ${t(lv.name)}`, newIdx === 0 ? 'good' : 'info');
      if (newIdx === 0) playFirst(SND.down, 0.35);
    }
  }

  // ------------------------------------------------------------------ frame update (mods 'update')
  function update(dt) {
    if (disposed) return;
    S.frame++;
    if (game.isHost) hostStep(dt);
    if (!els) buildBox();
    // displayed value: eased towards the target (the synced value only changes about once a second on clients)
    const target = threat();
    S.prevShown = S.shown;
    S.shown += (target - S.shown) * Math.min(1, dt * 4);
    if (Math.abs(target - S.shown) < 0.05) S.shown = target;
    const prev = S.lvShown;
    S.lvShown = levelIndex(S.shown, S.lvShown);
    if (S.lvShown !== prev && isMoon()) announce(S.lvShown, prev);
    S.boxUpdateT -= dt;
    if (S.boxUpdateT <= 0 || S.lvShown !== prev) { S.boxUpdateT = 0.1; refreshBox(); }
  }

  const api = {
    threat, lootLuck, scale, noise, level, speedCap, hitDamage,
    onNoise, onDeath, onRelief, onPressure, reset,
    LEVELS, model,
    /** debug / tests: force the meter (host only). */
    set(v) { if (!game.isHost) return false; model.base = Math.max(0, Math.min(THREAT.BASE_CAP, v)); model.spike = Math.max(0, v - THREAT.BASE_CAP); model.floor = 0; model._update(); syncRun(true); return model.T; },
    debug() { return { T: model.T, base: model.base, spike: model.spike, floor: model.floor, insideT: model.insideT, ev: { ...model.ev }, parts: { ...model.parts }, ctx: S.lastCtx, shown: S.shown, level: LEVELS[S.lvShown].id, scale: scale(), luck: lootLuck() }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      box?.remove(); box = null; els = null;
    },
  };
  return api;
}
