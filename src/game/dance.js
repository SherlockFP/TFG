// DANCE (wave 6, docs/wave6/dance.md): 21 new dances / emotes on the avatar2 rig. Installed with `this.useModule('dance', installDance)` -> game.dance.
//  * data + sampler: dance_data.js (pure). This file: registers the emote defs into emotes.js (wheel, 'x:<id>' net id, third-person camera, wardrobe turntable all
//    just work), poses the rig, syncs the phase of nearby crewmates doing the same dance (+ a "GROUP DANCE" pop and algo1 hype), plays the dance music of remote dancers.
//  * Net: NO new message types. Ids travel as 'x:<id>' in the player state (ps.e); an old client that does not know an id shows nothing (emoteFromNet -> null).
import { addTranslations, t } from '../core/i18n.js';
import { EMOTES, EMOTE_BY_ID, LOCKED_EMOTES } from './emotes.js';
import { C5, C5_BY_KEY, C5_BY_ID, keyOf } from './cosm5_data.js';
import * as DD from './dance_data.js';
import '../ui/emotewheel.js';   // installs the wave 6 wheel factory (WHEEL.make) used by EmoteSystem

const { tr, ru } = DD.translationMaps();
addTranslations(tr, 'tr'); addTranslations(ru, 'ru');

// ---------------------------------------------------------------------------------------------- rig posing
const SYNC = new WeakMap();   // avatar -> { cur, target, ts } phase offset in seconds (eased so joining a group does not pop)
const lerp = (a, b, k) => a + (b - a) * k;
function pitchAbout(root, th, h) {
  root.rotation.order = 'YXZ';
  root.rotation.x = th;
  const s = Math.sin(th), c = Math.cos(th), ry = root.rotation.y;
  root.position.x += Math.sin(ry) * (-h * s);
  root.position.z += Math.cos(ry) * (-h * s);
  root.position.y += h * (1 - c);
}
/** shoulder / elbow pivots of an avatar without `limbs` (classic body): walk hand -> ... -> torso */
function armsFallback(a) {
  const P = a.parts || {};
  const chain = (hand) => { const c = []; let o = hand; while (o && o !== P.torso) { c.push(o); o = o.parent; } return c; };
  const L = chain(P.handL), R = chain(P.handR);
  const sh = (c) => (c.length >= 2 ? c[c.length - 1] : null), el = (c) => (c.length >= 3 ? c[c.length - 2] : null);
  return { shL: sh(L), elL: el(L), shR: sh(R), elR: el(R) };
}
const rot3 = (o, x, y, z, w) => { if (!o) return; o.rotation.x = lerp(o.rotation.x, x, w); o.rotation.y = lerp(o.rotation.y, y, w); o.rotation.z = lerp(o.rotation.z, z, w); };
const CHd = DD.CH;

/** Pose `a` (already updated by avatar.update this frame, root positioned) for dance `def` at time t (seconds since it started). */
export function applyDance(a, root, def, t, dur) {
  let ts = t;
  if (def.loop) {
    let st = SYNC.get(a);
    if (st) {
      const now = performance.now(), dt = Math.min(0.1, (now - st.ts) / 1000); st.ts = now;
      st.cur = DD.approach(st.cur, st.target, dt);
      ts = t + st.cur;
    }
  }
  const pose = DD.samplePose(def, Math.max(0, ts));
  const w = DD.blendWeight(def, t, dur);
  const G = DD.groupsOf(def), P = a.parts || {};
  const g = (c) => pose[c] ?? CHd[c];
  // root
  const ry = root.rotation.y, px = (pose.x || 0) * w, pz = (pose.z || 0) * w;
  root.position.x += px * Math.cos(ry) + pz * Math.sin(ry);
  root.position.z += -px * Math.sin(ry) + pz * Math.cos(ry);
  root.position.y += (pose.y || 0) * w;
  root.rotation.y = ry + (pose.yaw || 0) * w;
  root.rotation.z = 0;
  if (pose.pt) pitchAbout(root, pose.pt * w, def.ph || 0.9);
  if (pose.rl) { root.rotation.order = 'YXZ'; root.rotation.z = pose.rl * w; }
  // torso / neck (additive on the idle pose)
  if (P.torso) { P.torso.rotation.x += (pose.tx || 0) * w; P.torso.rotation.y += (pose.ty || 0) * w; P.torso.rotation.z += (pose.tz || 0) * w; }
  if (P.neck) { P.neck.rotation.x += (pose.nx || 0) * w; P.neck.rotation.y += (pose.ny || 0) * w; P.neck.rotation.z += (pose.nz || 0) * w; }
  // arms + legs (absolute, blended in)
  const L = a.limbs;
  if (G.arms) {
    const A = L || armsFallback(a);
    rot3(A.shL, g('Lx'), g('Ly'), g('Lz'), w); rot3(A.shR, g('Rx'), g('Ry'), g('Rz'), w);
    if (A.elL) A.elL.rotation.x = lerp(A.elL.rotation.x, g('Le'), w);
    if (A.elR) A.elR.rotation.x = lerp(A.elR.rotation.x, g('Re'), w);
  }
  if (G.legs && L) {
    const hl = g('Hl'), hr = g('Hr'), kl = g('Kl'), kr = g('Kr');
    rot3(L.hipL, hl, 0, g('Sl'), w); rot3(L.hipR, hr, 0, g('Sr'), w);
    L.kneeL.rotation.x = lerp(L.kneeL.rotation.x, kl, w); L.kneeR.rotation.x = lerp(L.kneeR.rotation.x, kr, w);
    if (L.ankleL) L.ankleL.rotation.x = lerp(L.ankleL.rotation.x, -(hl + kl) * 0.9, w);
    if (L.ankleR) L.ankleR.rotation.x = lerp(L.ankleR.rotation.x, -(hr + kr) * 0.9, w);
  }
  if (def.glitch) a.setHitFlash?.((pose.flash || 0) * w);   // pixel flicker (cleared by resetFx when the dance ends)
}
/** undo what a dance leaves behind on the avatar (glitch flash) */
export function resetFx(a) { a?.setHitFlash?.(0); }

// ---------------------------------------------------------------------------------------------- registration (idempotent, at import)
export const DANCE_DEF_IDS = [];
for (const d of DD.DANCE_LIST) {
  DD.compile(d);
  if (EMOTE_BY_ID[d.id]) continue;
  const def = {
    id: d.id, icon: '♪', base: d.base || null, dur: d.dur ?? 45, face: d.face, cat: d.cat, loop: d.loop, dance: true, music: d.music, bpm: d.bpm, thumbT: d.thumb,
    fx(a, root, tt, dur) { applyDance(a, root, d, tt, dur); },
  };
  if (d.src !== 'free') def.lock = 'Wardrobe: ' + d.en;
  Object.defineProperty(def, 'name', { get: () => t(d.en), enumerable: true });
  Object.defineProperty(def, 'desc', { get: () => t(DD.DESC[d.id][0]), enumerable: true });
  EMOTES.push(def); EMOTE_BY_ID[d.id] = def; DANCE_DEF_IDS.push(d.id);
  if (def.lock) LOCKED_EMOTES.push(d.id);
}
// paid ones: rows in cosm5's rotation shop / daily crates (same row shape as cosm5_data.js E())
for (const row of DD.shopRows()) {
  if (C5_BY_KEY[keyOf(row)]) continue;
  C5.push(row); C5_BY_KEY[keyOf(row)] = row; C5_BY_ID[row.id] = row;
}

// ---------------------------------------------------------------------------------------------- module
const CSS = `
.dance-combo { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); z-index: 30; pointer-events: none; min-width: 240px; text-align: center; padding: 0 0 6px;
  background: rgba(10,7,4,0.88); border: 2px solid var(--t-hazard, #ffb800); font-family: var(--font2, 'VT323', monospace); color: #fff3e6; animation: dcpop 1.8s ease-out forwards; }
.dance-combo .dc-tape { display: block; height: 6px; background: repeating-linear-gradient(-45deg, #ffb800 0 5px, #17110a 5px 10px); margin-bottom: 6px; }
.dance-combo b { display: block; font-size: 26px; letter-spacing: 2px; color: var(--t-hazard, #ffb800); }
.dance-combo i { display: block; font-style: normal; font-size: 16px; opacity: 0.8; letter-spacing: 1px; }
@keyframes dcpop { 0% { transform: translateX(-50%) scale(0.6); opacity: 0; } 12% { transform: translateX(-50%) scale(1.12); opacity: 1; } 22% { transform: translateX(-50%) scale(1); } 80% { opacity: 1; } 100% { transform: translateX(-50%) translateY(-24px); opacity: 0; } }
`;

export function installDance(game) {
  const mods = game.mods;
  const offs = [];
  let disposed = false, style = null, accum = 0, clusters = new Map();
  const seen = new Map();                    // anchorId -> size already celebrated
  let lastBump = -99, lastPop = -99, lastSelfSize = 0;
  const music = new Map();                   // remote player id -> { name, h }

  function ensureStyle() {
    if (style || typeof document === 'undefined') return;
    style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  }
  function pop(size) {
    if (typeof document === 'undefined') return;
    ensureStyle();
    const host = document.getElementById('ui') || document.body;
    const el = document.createElement('div'); el.className = 'dance-combo';
    el.innerHTML = `<span class="dc-tape"></span><b>${t('GROUP DANCE')} x${size}</b><i>+${DD.comboHype(size)} HYPE</i>`;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1900);
    game.audio?.ui?.('ui_levelup', 0.3);
  }

  /** everyone dancing a looping dance right now: local player + remotes */
  function dancers() {
    const out = [], av = new Map();
    const E = game.emotes, p = game.player;
    if (E?.current?.loop && E.current.dance && p && !p.dead) {
      out.push({ id: 'self', x: p.pos.x, y: p.pos.y, z: p.pos.z, dance: E.current.id, start: E.startMs || 0 });
      if (E.avatar) av.set('self', E.avatar);
    }
    const rem = game.remotes;
    if (rem) for (const r of rem.values ? rem.values() : []) {
      const d = r.emoteDef;
      if (!d || !d.dance || !d.loop || r.dead || !r.pos) continue;
      out.push({ id: String(r.id), x: r.pos.x, y: r.pos.y, z: r.pos.z, dance: d.id, start: r.emoteStart || 0 });
      if (r.avatar) av.set(String(r.id), r.avatar);
    }
    return { out, av };
  }
  function tick() {
    const { out, av } = dancers();
    clusters = DD.clusterDancers(out);
    for (const [id, a] of av) {
      let st = SYNC.get(a);
      if (!st) { st = { cur: 0, target: 0, ts: performance.now() }; SYNC.set(a, st); }
      st.target = clusters.get(id)?.offset || 0;
    }
    // combos: pop for the local player when a group forms / grows, hype (host-only inside algo1.bump) for any group
    const self = clusters.get('self');
    if (self && (self.size > lastSelfSize) && game.time - lastPop > 4) { pop(self.size); lastPop = game.time; }
    lastSelfSize = self ? self.size : 0;
    const live = new Set();
    for (const c of clusters.values()) {
      live.add(c.anchorId);
      if (c.size > (seen.get(c.anchorId) || 1)) {
        seen.set(c.anchorId, c.size);
        if (game.time - lastBump > 12) { lastBump = game.time; try { game.algo1?.bump?.('dance', 'group_dance'); } catch { /* optional */ } }
      }
    }
    for (const k of [...seen.keys()]) if (!live.has(k)) seen.delete(k);
  }

  // music of remote dancers (the local dancer's loop is started by EmoteSystem.play from def.music); never two copies of the same loop
  function remoteMusic(r) {
    const id = String(r.id), d = r.emoteDef, want = d && d.music && !r.dead && game.audio?.play ? d.music : null;
    const cur = music.get(id);
    if (cur && cur.name !== want) { cur.h?.stop?.(0.4); music.delete(id); }
    if (!want || music.has(id)) return;
    if (game.emotes?.current?.music === want) return;
    for (const m of music.values()) if (m.name === want) return;
    if (music.size >= 2) return;
    const vol = 0.62 * (game.settings?.danceVolume ?? 0.8);
    const h = game.audio.play(want, { follow: r.root, loop: true, volume: vol, refDistance: 3, maxDistance: 30 });
    if (h) music.set(id, { name: want, h });
  }
  function sweepMusic() {
    for (const [id, m] of [...music]) if (!game.remotes?.has?.(id) && !game.remotes?.has?.(+id)) { m.h?.stop?.(0.3); music.delete(id); }
  }

  offs.push(mods.on('update', (dt, g) => {
    if (disposed || (g && g !== game)) return;
    accum += dt;
    if (accum >= 0.25) { accum = 0; tick(); sweepMusic(); }
  }));
  offs.push(mods.on('remoteAvatar', (r) => { if (!disposed) remoteMusic(r); }));

  return {
    musicActive: () => music.size > 0 || !!game.emotes?.current?.music,   // [score] duck the adaptive music under dance music
    list: DD.DANCE_LIST, defs: () => DANCE_DEF_IDS.map((id) => EMOTE_BY_ID[id]),
    clusters: () => clusters, tick, pop, applyDance, resetFx,
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* */ } }
      for (const m of music.values()) m.h?.stop?.(0.2);
      music.clear(); style?.remove(); style = null;
    },
  };
}
