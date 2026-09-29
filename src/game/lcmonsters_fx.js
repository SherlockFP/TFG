// LCMONSTERS wave 8 - CLIENT side: blood circles, the Other Side rift + "RUN" sign, light flicker telegraph, local curse effects
// (bleed, mark, cursed-scrap whispers / inverted controls / heavy), HUD chips and first-encounter captions.
// Meshes are basic / additive materials only (no THREE lights); the flicker touches the `flicker` field of EXISTING light-pool emitters.
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import * as C from './lcmonsters_core.js';

const T = C.TUNE;
const UPV = new THREE.Vector3(0, 1, 0);
const CAPTIONS = {
  lm_witch: ['Blood Witch', 'Stay out of her circle while she can see you. Break line of sight.'],
  lm_keeper: ['Lantern Keeper', 'Its light marks you for everything nearby. Get behind it and snatch the lantern.'],
  lm_treater: ['Trick-or-Treater', 'Take the treat (E) and it is a gamble. Walking away is free.'],
  lm_hunter: ['Rift Stalker', 'It came through the wall. The lights flicker when it is close.'],
  lm_lootmimic: ['Loot Mimic', 'That scrap was breathing. Hit things before you grab them.'],
  lm_masked: ['Masked', 'Slow, arms out. Mash JUMP to break the hug. Do not let it finish you.'],
};
const CURSE_TEXT = {
  heavy: ['HEAVY CURSE', 'You move slower.'], whisper: ['WHISPERING CURSE', 'It whispers behind you.'], lure: ['HUNGRY CURSE', 'Creatures are drawn to you.'], invert: ['TWISTED CURSE', 'Controls flip for a moment.'],
};

export function installLcFx(game, { cursed }) {
  const scene = game.engine?.scene;
  const disposers = [];
  const E = { bleed: 0, bleedAcc: 0, mark: 0, invT: 0, invWarn: 0, invNext: 30, whisperT: 12, curseKind: null, maskT: 0 };
  const seen = new Set();
  try { for (const k of JSON.parse(localStorage.getItem('tfg.lm.seen') || '[]')) seen.add(k); } catch { /* private window */ }
  game.lmMove = game.lmMove || { speedMul: 1, invert: false };
  const snd = (names, pos, v = 0.8, pt = 1, max = 45) => {
    try { const a = game.audio; const n = [].concat(names).find((x) => a.has?.(x)) || names[0]; a.play(n, { pos, volume: v, pitch: pt, refDistance: 3, maxDistance: max, occlude: true }); } catch { /* audio not ready */ }
  };
  const sfx2d = (names, v = 0.6, pt = 1) => { try { const n = [].concat(names).find((x) => game.audio.has?.(x)) || names[0]; game.sfx(n, v, pt); } catch { /* soft */ } };
  const toast = (s, k = 'warn') => game.ui?.toast?.(s, k);

  // ------------------------------------------------------------------ blood circles
  const circles = new Map();
  const ringGeo = new THREE.RingGeometry(0.93, 1, 40), fillGeo = new THREE.CircleGeometry(1, 28), sigilGeo = new THREE.RingGeometry(0.5, 0.53, 5);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc00a1c, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x5a0410, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  function addCircle(d) {
    clearCircle(d.id);
    const g = new THREE.Group(); g.position.set(d.x, d.y + 0.12, d.z); g.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()), fill = new THREE.Mesh(fillGeo, fillMat.clone()), sigil = new THREE.Mesh(sigilGeo, ringMat.clone());
    for (const m of [ring, fill, sigil]) { m.renderOrder = 3; g.add(m); }
    g.scale.set(d.r, d.r, 1); scene.add(g);
    circles.set(d.id, { g, ring, fill, sigil, t: 0, castS: d.castS, life: d.life, x: d.x, z: d.z, r: d.r });
    snd(['whisper', 'mimic_voice_1'], new THREE.Vector3(d.x, d.y + 1.5, d.z), 0.9, 0.55, 70);
  }
  function clearCircle(id) { const c = circles.get(id); if (!c) return; scene.remove(c.g); c.ring.material.dispose(); c.fill.material.dispose(); c.sigil.material.dispose(); circles.delete(id); }
  const inAnyCircle = () => { const p = game.player.pos; for (const c of circles.values()) if (c.t >= c.castS && C.inCircle(p.x, p.z, c.x, c.z, c.r)) return true; return false; };

  // ------------------------------------------------------------------ the Other Side: rift + sign + flicker
  const OS = { on: false, ph: 'closed', t: 0, p: new THREE.Vector3(), yaw: 0, g: null, sign: null, letters: 0, cv: null, tex: null, flickT: 0 };
  const flick = new Map();                                            // emitter -> original flicker value
  function flickerAround(points, radius, amount) {
    const em = game.lights?.emitters; if (!em) return;
    const seenNow = new Set();
    for (const e of em) {
      if (e.group !== 'facility' || !e.pos) continue;
      let near = false;
      for (const p of points) if (e.pos.distanceToSquared(p) < radius * radius) { near = true; break; }
      if (near) { if (!flick.has(e)) flick.set(e, e.flicker || 0); e.flicker = amount; seenNow.add(e); }
    }
    for (const [e, orig] of flick) if (!seenNow.has(e)) { e.flicker = orig; flick.delete(e); }
  }
  const flickerOff = () => { for (const [e, orig] of flick) e.flicker = orig; flick.clear(); };
  function buildRift() {
    const g = new THREE.Group();
    const sh = new THREE.Shape(); sh.moveTo(0, -1.35); sh.quadraticCurveTo(0.62, 0, 0, 1.35); sh.quadraticCurveTo(-0.62, 0, 0, -1.35);
    const geo = new THREE.ShapeGeometry(sh, 6);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x090003, side: THREE.DoubleSide, fog: true }));
    const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
    glow.scale.set(1.35, 1.08, 1); glow.position.z = -0.02; core.position.z = 0.01;
    g.add(glow, core);
    const spores = [];
    for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: 0xff8aa0 })); s.userData.ph = i * 0.8; g.add(s); spores.push(s); }
    g.userData = { geo, core, glow, spores };
    return g;
  }
  function buildSign() {
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 64;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true }));
    OS.cv = cv; OS.tex = tex; OS.letters = -1;
    return m;
  }
  function drawSign(n) {
    if (n === OS.letters) return; OS.letters = n;
    const x = OS.cv.getContext('2d'); x.clearRect(0, 0, 192, 64); x.fillStyle = 'rgba(8,4,6,0.8)'; x.fillRect(0, 0, 192, 64);
    x.font = 'bold 44px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    ['R', 'U', 'N'].forEach((ch, i) => {
      const lit = i < n, cx = 32 + i * 64;
      x.fillStyle = lit ? '#ff3a3a' : '#2a1216'; x.fillText(ch, cx, 34);
      for (let b = 0; b < 6; b++) { x.fillStyle = lit ? '#ffd0a0' : '#3a2226'; x.fillRect(cx - 24 + b * 9, 6, 4, 4); x.fillRect(cx - 24 + b * 9, 54, 4, 4); }
    });
    OS.tex.needsUpdate = true;
  }
  function osSet(d) {
    if (d.ph === 'closed') { osEnd(); return; }
    if (!OS.on) {
      OS.on = true; OS.t = 0; OS.p.fromArray(d.p); OS.yaw = d.yaw || 0;
      OS.g = buildRift(); OS.g.position.copy(OS.p).addScaledVector(new THREE.Vector3(Math.sin(OS.yaw), 0, Math.cos(OS.yaw)), 0.06); OS.g.position.y += 1.35; OS.g.rotation.y = OS.yaw; OS.g.scale.set(0.01, 0.01, 1); scene.add(OS.g);
      OS.sign = buildSign(); OS.sign.position.copy(OS.p).addScaledVector(new THREE.Vector3(Math.sin(OS.yaw), 0, Math.cos(OS.yaw)), 0.07).add(new THREE.Vector3(Math.cos(OS.yaw) * 1.2, 2.8, -Math.sin(OS.yaw) * 1.2)); OS.sign.rotation.y = OS.yaw; scene.add(OS.sign);
      snd(['light_flicker', 'lights_buzz'], OS.p.clone().add(new THREE.Vector3(0, 2, 0)), 0.9, 0.8, 80);
    }
    if (d.ph !== OS.ph && d.ph === 'rift') snd(['rumble', 'sandkefal_rumble'], OS.p.clone().add(new THREE.Vector3(0, 1, 0)), 1, 0.7, 90);
    OS.ph = d.ph;
  }
  function osEnd() {
    if (OS.g) { scene.remove(OS.g); OS.g.userData.geo.dispose(); OS.g.userData.core.material.dispose(); OS.g.userData.glow.material.dispose(); for (const s of OS.g.userData.spores) { s.geometry.dispose(); s.material.dispose(); } OS.g = null; }
    if (OS.sign) { scene.remove(OS.sign); OS.sign.geometry.dispose(); OS.sign.material.dispose(); OS.tex.dispose(); OS.sign = null; }
    OS.on = false; OS.ph = 'closed'; flickerOff();
  }

  // ------------------------------------------------------------------ HUD chips
  let box = null, boxHtml = '';
  const chip = (txt, col) => `<div style="padding:3px 9px;border:1px solid ${col};background:rgba(10,4,8,.74);color:${col};font:13px/1.2 VT323,monospace;letter-spacing:.07em;white-space:nowrap">${txt}</div>`;
  function refreshHud() {
    if (typeof document === 'undefined') return;
    if (!box) box = hudDock('right', 'lm_status', 44);
    const rows = [];
    if (E.bleed > 0) rows.push(chip(`${t('CURSED: BLEEDING')} ${Math.ceil(E.bleed)}s`, '#ff5a6a'));
    if (E.mark > 0) rows.push(chip(`${t('MARKED')} ${Math.ceil(E.mark)}s - ${t('creatures can find you')}`, '#ffc060'));
    if (E.curseKind) rows.push(chip(`${t(CURSE_TEXT[E.curseKind][0])} - ${t(CURSE_TEXT[E.curseKind][1])}`, '#b58cff'));
    if (E.maskT > 0) rows.push(chip(`${t('THE MASK IS WARM')} ${Math.ceil(E.maskT)}s`, '#e6e0d0'));
    const html = rows.join('');
    if (html !== boxHtml) { boxHtml = html; box.innerHTML = html; }
  }

  // ------------------------------------------------------------------ net messages (host -> everyone, 'lm')
  function handle(d) {
    if (!d) return;
    const me = game.selfId;
    switch (d.k) {
      case 'ci': addCircle(d); break;
      case 'cx': clearCircle(d.id); break;
      case 'bl': if (d.to === me) { E.bleed = Math.max(E.bleed, d.t); toast(t('The Blood Witch cursed you: you are bleeding. Break her line of sight!'), 'bad'); sfx2d(['heartbeat', 'heart_monitor_beep'], 0.8, 0.9); } break;
      case 'mk': if (d.to === me) { if (E.mark <= 0) toast(t('The lantern MARKED you. Everything nearby can find you.'), 'bad'); E.mark = Math.max(E.mark, d.t); sfx2d(['bell_ding', 'glass'], 0.5, 0.7); } break;
      case 'os': osSet(d); break;
      case 'tt': if (d.to === me) ttResult(d); break;
      case 'sn': if (d.by === me) toast(t('You snatched the Keeper\'s lantern!'), 'good'); break;
      case 'mw': if (d.to === me) { E.maskT = Math.max(0, T.maskLatchS - T.maskWarnS); toast(t('The mask is warm. It is watching you. Sell it or drop it.'), 'warn'); sfx2d(['mimic_voice_1', 'whisper'], 0.7, 0.75); } break;
      case 'ml': if (d.to === me) { E.maskT = 0; toast(t('The mask called a friend.'), 'bad'); sfx2d(['sting_violin', 'jumpscare_2'], 0.6, 0.8); } break;
      case 'cu': cursed.set(d.id, d.c); break;
      case 'cc': cursed.delete(d.id); break;
      case 'cm': cursed.clear(); for (const [id, k] of Object.entries(d.m || {})) cursed.set(id, k); break;
      case 'drop': if (d.to === me) { const it = game.player.heldItem?.(); if (it) { game.dropItem(it, true); } } break;
      case 'cl': if (d.to === me) toast(tf('The curse is lifted (-{n} credits).', { n: d.n }), 'good'); break;
      default: break;
    }
  }
  function ttResult(d) {
    if (d.r === 'treat') { toast(d.what === 'credits' ? tf('TREAT: +{n} credits!', { n: d.n }) : t('TREAT: a piece of loot!'), 'good'); sfx2d(['bell_ding', 'coin'], 0.7, 1.2); }
    else { toast({ teleport: t('TRICK: you were sent somewhere else!'), scuttlers: t('TRICK: bugs!'), drop: t('TRICK: your hands went numb!'), static: t('TRICK: static!') }[d.what] || t('TRICK!'), 'bad'); sfx2d(['sting_violin_glitch', 'mimic_voice_2'], 0.7, 1); }
  }

  // ------------------------------------------------------------------ per-frame
  const tmp = new THREE.Vector3();
  let hunterT = 0, viewT = 0;
  function update(dt) {
    const p = game.player;
    // circles
    for (const [id, c] of circles) {
      c.t += dt;
      if (c.t > c.life + 1.5) { clearCircle(id); continue; }
      const live = c.t >= c.castS, fade = live ? Math.min(1, (c.life - c.t) / 4 + 0.05) : 0.25 + 0.5 * (c.t / c.castS);
      const pulse = 0.85 + 0.15 * Math.sin(c.t * (live ? 3 : 9));
      c.ring.material.opacity = 0.7 * Math.max(0, Math.min(1, fade)) * pulse; c.fill.material.opacity = (live ? 0.2 : 0.06) * Math.max(0, Math.min(1, fade));
      c.sigil.material.opacity = 0.55 * Math.max(0, Math.min(1, fade)); c.sigil.rotation.z = c.t * 0.6;
    }
    // rift + sign
    if (OS.on) {
      OS.t += dt;
      const ph = C.osPhase(OS.t), warn = ph === 'warn';
      if (ph === 'closed' && OS.ph !== 'closed') osEnd();
      else {
        if (OS.sign) { drawSign(warn || ph === 'rift' ? C.warnLetters(OS.t) : 3); OS.sign.visible = OS.t < C.OS_TIMELINE.hunter + 6; }
        if (OS.g) {
          const open = ph === 'warn' ? 0.02 : ph === 'rift' ? Math.min(1, (OS.t - C.OS_TIMELINE.rift) / T.osRiftS) : Math.max(0, Math.min(1, (C.OS_TIMELINE.close - OS.t) / 2));
          OS.g.scale.set(0.05 + open * 0.95, 0.05 + open * 0.95, 1);
          OS.g.userData.glow.material.opacity = 0.3 + 0.2 * Math.sin(OS.t * 6) + open * 0.2;
          OS.g.userData.spores.forEach((s, i) => { const a = OS.t * 1.4 + s.userData.ph; s.position.set(Math.sin(a) * 0.5 * open, ((a * 0.3 + i * 0.37) % 2.6) - 1.3, 0.1 + Math.cos(a) * 0.15); s.visible = open > 0.3; });
        }
        OS.flickT -= dt;
        if (OS.flickT <= 0) { OS.flickT = 0.35; flickerAround([OS.p], warn ? 24 : 16, warn ? 0.9 : 0.6); if (Math.random() < 0.35 && warn) snd(['light_flicker', 'sfx_fluoro_flicker'], OS.p.clone().add(new THREE.Vector3(0, 2, 0)), 0.5, 0.9 + Math.random() * 0.3, 40); }
      }
    }
    // the hunter's presence flickers the lights around it (telegraph)
    hunterT -= dt;
    if (hunterT <= 0) {
      hunterT = 0.3;
      const pts = [];
      for (const v of game.creatures?.views?.values?.() || []) if (v.type === 'lm_hunter' && v.state !== 'dead' && v.pos.distanceToSquared(p.pos) < 40 * 40) pts.push(v.pos);
      if (pts.length) flickerAround(pts, 11, 0.85); else if (!OS.on && flick.size) flickerOff();
    }
    // first-encounter captions + masked name tags
    viewT -= dt;
    if (viewT <= 0) {
      viewT = 0.5;
      for (const v of game.creatures?.views?.values?.() || []) {
        if (!CAPTIONS[v.type]) continue;
        if (v.type === 'lm_masked' && v.name && !v._lmTag) tagMasked(v);
        if (!seen.has(v.type) && v.state !== 'dead' && v.pos.distanceToSquared(p.pos) < 30 * 30 && !v.hidden) {
          seen.add(v.type);
          try { localStorage.setItem('tfg.lm.seen', JSON.stringify([...seen])); } catch { /* soft */ }
          toast(`${t(CAPTIONS[v.type][0])}: ${t(CAPTIONS[v.type][1])}`, 'warn');
        }
      }
    }
    // curse from what is in your hands
    const held = p.heldItem?.();
    const k = held ? cursed.get(held.id) || null : null;
    if (k !== E.curseKind) { E.curseKind = k; E.invNext = 20 + Math.random() * 20; E.whisperT = 8 + Math.random() * 8; if (k) sfx2d(['whisper', 'mimic_voice_1'], 0.5, 0.7); }
    const mv = game.lmMove;
    mv.speedMul = k === 'heavy' ? C.heavyMul() : 1;
    if (k === 'whisper') {
      E.whisperT -= dt;
      if (E.whisperT <= 0) { E.whisperT = T.whisperEvery[0] + Math.random() * (T.whisperEvery[1] - T.whisperEvery[0]); const f = p.forward(); tmp.copy(p.pos).addScaledVector(f, -1.6).add(UPV); tmp.x += (Math.random() - 0.5); snd(['whisper', 'mimic_voice_1', 'mimic_voice_2'], tmp, 0.6, 0.85 + Math.random() * 0.2, 16); }
    }
    if (k === 'invert') {
      if (E.invT > 0) { E.invT -= dt; if (E.invT <= 0) { mv.invert = false; } }
      else if (E.invWarn > 0) { E.invWarn -= dt; if (E.invWarn <= 0) { mv.invert = true; E.invT = T.invertT; toast(t('Everything is backwards!'), 'warn'); } }
      else { E.invNext -= dt; if (E.invNext <= 0) { E.invNext = T.invertEvery[0] + Math.random() * (T.invertEvery[1] - T.invertEvery[0]); E.invWarn = T.invertWarn; sfx2d(['whisper', 'sting_violin_glitch'], 0.7, 0.8); game.engine?.flash?.(0x6a4aff, 0.35); } }
    } else if (mv.invert) { mv.invert = false; E.invT = 0; E.invWarn = 0; }
    // held Fan Mask: faint laughing / crying and the countdown chip
    if (held?.def?.mask) { E.maskLocalT = (E.maskLocalT || 6) - dt; if (E.maskLocalT <= 0) { E.maskLocalT = 9 + Math.random() * 8; sfx2d([held.type === 'lm_mask_smile' ? 'mimic_voice_2' : 'mimic_voice_1'], 0.22, held.type === 'lm_mask_smile' ? 1.3 : 0.7); } }
    if (E.maskT > 0) E.maskT -= dt;
    // bleed (local: HP never drops below the floor, so the curse cannot finish you)
    if (E.bleed > 0) {
      E.bleed -= dt; E.bleedAcc += dt;
      if (p.inShip || p.dead) E.bleed = 0;
      else if (E.bleedAcc >= 0.75) { const dmg = C.bleedTick(p.hp, E.bleedAcc); E.bleedAcc = 0; if (dmg > 0.05) game.damageLocal(dmg, 'lm_witch', null); }
    }
    refreshHud();
  }
  function tagMasked(v) {
    v._lmTag = true;
    try {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.font = '28px VT323, monospace'; x.textAlign = 'center';
      x.fillStyle = '#b8ffcc'; x.fillText(v.name, 128, 30); x.font = '20px VT323, monospace'; x.fillStyle = '#ffd27a'; x.fillText('Lv.' + (v.spawnData?.fakeLv || 3), 128, 54);
      const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false })); s.scale.set(1.1, 0.28, 1); s.position.y = 2.15; v.root.add(s);
    } catch { /* soft */ }
  }
  function reset() { for (const id of [...circles.keys()]) clearCircle(id); osEnd(); flickerOff(); E.bleed = 0; E.mark = 0; E.maskT = 0; E.invT = 0; E.invWarn = 0; game.lmMove.invert = false; }
  const state = () => ({ E, circles: circles.size, os: OS.ph, flicker: flick.size, inCircle: inAnyCircle() });
  function dispose() {
    for (const id of [...circles.keys()]) clearCircle(id);
    osEnd(); flickerOff(); ringGeo.dispose(); fillGeo.dispose(); sigilGeo.dispose(); ringMat.dispose(); fillMat.dispose();
    game.lmMove.invert = false; game.lmMove.speedMul = 1; try { box?.remove(); } catch { /* soft */ } for (const d of disposers) try { d(); } catch { /* soft */ }
  }
  return { handle, update, dispose, reset, state, E };
}
