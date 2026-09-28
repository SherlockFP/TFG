// CREATURE EMOTES (module `cemotes`, docs/wave2/cemotes.md). Installed with `this.useModule('cemotes', installCreatureEmotes)`.
//  1. every creature (present and future) has a client-side body-language layer (spin / hop / bow / tilt / dance / laugh / flex / slump /
//     point / griddy: procedural offsets on the CreatureView root) plus a floating internet-style bubble (LMAO, GG, L, RATIO, skull, o7, =), ?, !!!, dancer);
//  2. the HOST decides when: rare idle emotes while wandering (never while hunting), a VICTORY emote (+ chat line + the victim's spectator
//     camera) right after a creature kills a player;
//  3. the HOST also reacts to PLAYER emotes within ~8 m in the creature's sight, by personality (cemotes_data.js): copy, dance along and stop being
//     hostile for a few seconds, wave back and flee, get enraged by taunts, laugh, ignore. Cooldowns per creature / player / burst stop abuse.
// Net: one host -> all message type 'ce' (HOST_ONLY): {k:'e'|'win'|'note', ...}. No CreatureView / creatures.js edits: the layer runs in the
// mods 'update' event (after CreatureManager.update) and wraps game.hostHurtPlayer / hostOnPlayerDied on the instance (restored on dispose).
import * as THREE from 'three';
import { addTranslations, t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { CREATURES } from './creatures.js';
import { emoteFromNet } from './emotes.js';
import {
  BODY, BUBBLES, SKULL_BITMAP, DANCE_BITMAPS, EMOTE_DUR, COPY_MAP, NOTES, NOTE_KIND, WIN_LINES, CD, CooldownBook,
  emoteKind, resolvePersonality, pickEmote, canReact, markReact, nextIdleDelay, translationMap, ampFor, newOffsets, resetOffsets,
} from './cemotes_data.js';

HOST_ONLY.add('ce');
addTranslations(translationMap());

const POOL = 10;                       // bubble sprites (recycled)
const LOCO = new Set(['run', 'walk', 'attack', 'flee', 'hunt', 'patrol', 'stalk', 'sneak', 'lunge', 'windup', 'sniff', 'angry', 'stab', 'kick']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const S = { o: newOffsets(), head: new THREE.Vector3(), want: new THREE.Vector3() };   // scratch (no per-frame allocation)

export function installCreatureEmotes(game) {
  const mods = game.mods;
  const offs = [];
  const restores = [];
  const later = (fn, ms) => (game.later ? game.later(fn, ms) : setTimeout(fn, ms));
  const M = () => game.creatures;
  const book = new CooldownBook();
  const persOf = (c) => resolvePersonality(c.type, c.def || CREATURES[c.type] || {});
  let disposed = false;

  // ------------------------------------------------------------------ client: bubbles
  const texCache = new Map();
  function bubbleTex(id, frame = 0) {
    const key = id + ':' + frame;
    let tex = texCache.get(key);
    if (tex || typeof document === 'undefined') return tex || null;
    const B = BUBBLES[id];
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 72;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(12,8,18,0.9)'; ctx.strokeStyle = B.color; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, 4); ctx.lineTo(114, 4); ctx.quadraticCurveTo(122, 4, 122, 12); ctx.lineTo(122, 44); ctx.quadraticCurveTo(122, 52, 114, 52);
    ctx.lineTo(76, 52); ctx.lineTo(64, 68); ctx.lineTo(54, 52); ctx.lineTo(14, 52); ctx.quadraticCurveTo(6, 52, 6, 44); ctx.lineTo(6, 12); ctx.quadraticCurveTo(6, 4, 14, 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = B.color;
    if (B.text) {
      ctx.font = `${B.text.length <= 2 ? 46 : B.text.length <= 4 ? 40 : 32}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(B.text, 64, 30);
    } else {
      const bmp = B.icon === 'skull' ? SKULL_BITMAP : DANCE_BITMAPS[frame % DANCE_BITMAPS.length];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (bmp[y][x] === '#') ctx.fillRect(64 - 20 + x * 5, 8 + y * 5, 5, 5);
    }
    tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    texCache.set(key, tex);
    return tex;
  }
  const pool = [];
  const bubbles = new Map();             // creature id -> { spr, id, t, dur, frame }
  function ensurePool() {
    if (pool.length || !game.scene) return;
    for (let i = 0; i < POOL; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, fog: false, depthWrite: false, toneMapped: false }));
      spr.material.map = bubbleTex('Q', 0);   // a map from the start: swapping textures later never recompiles the sprite shader
      spr.visible = false; spr.renderOrder = 6; spr.scale.set(0.9, 0.51, 1);
      game.scene.add(spr);
      pool.push(spr);
    }
  }
  function startBubble(cid, id, dur) {
    if (!BUBBLES[id]) return;
    ensurePool();
    if (!pool.length) return;
    let b = bubbles.get(cid);
    if (!b) {
      const used = new Set(); for (const x of bubbles.values()) used.add(x.spr);
      let spr = pool.find((s) => !used.has(s));
      if (!spr) {                                                      // pool full: steal the oldest bubble
        let old = null, oldK = null;
        for (const [k, x] of bubbles) if (!old || x.t > old.t) { old = x; oldK = k; }
        bubbles.delete(oldK); spr = old.spr;
      }
      b = { spr, id, t: 0, dur, frame: 0 };
      bubbles.set(cid, b);
    }
    b.id = id; b.t = 0; b.dur = dur; b.frame = 0;
    const tex = bubbleTex(id, 0);
    if (tex) b.spr.material.map = tex;
  }
  function releaseBubble(cid) { const b = bubbles.get(cid); if (b) { b.spr.visible = false; bubbles.delete(cid); } }

  // ------------------------------------------------------------------ client: body language
  const bodies = new Map();              // creature id -> { v, id, t, dur, base... }
  function startBody(v, id, dur) {
    if (!BODY[id] || !v?.root) return;
    if (v.type === 'leech' && v.state === 'ceiling') return;
    let st = bodies.get(v.id);
    if (!st || st.v !== v) {
      const r = v.root;
      st = { v, id, t: 0, dur, bsx: r.scale.x, bsy: r.scale.y, bsz: r.scale.z, order: r.rotation.order, bx: r.rotation.x, bz: r.rotation.z };
      bodies.set(v.id, st);
    }
    st.id = id; st.t = 0; st.dur = dur;
  }
  function endBody(cid, st) {
    bodies.delete(cid);
    const r = st.v?.root;
    if (!r) return;
    r.rotation.order = st.order; r.rotation.x = st.bx; r.rotation.z = st.bz;
    r.scale.set(st.bsx, st.bsy, st.bsz);
  }
  // hoisted forEach callbacks + an early-out on empty maps: nothing is allocated per frame
  let stepDt = 0;
  const bodyStep = (st, cid) => {
    const v = st.v, views = M()?.views;
    if (!views || views.get(cid) !== v || v.state === 'dead' || v.hidden) { endBody(cid, st); return; }
    st.t += stepDt;
    if (st.t >= st.dur) { endBody(cid, st); return; }
    const o = resetOffsets(S.o), r = v.root;
    BODY[st.id](o, st.t, st.dur, ampFor(v.height || 1));
    r.rotation.order = 'YXZ';
    const yaw = r.rotation.y, cs = Math.cos(yaw), sn = Math.sin(yaw);
    r.position.y += o.y;
    r.position.x += cs * o.x + sn * o.z;
    r.position.z += -sn * o.x + cs * o.z;
    r.rotation.y = yaw + o.ry; r.rotation.x = st.bx + o.rx; r.rotation.z = st.bz + o.rz;
    r.scale.set(st.bsx * o.sx, st.bsy * o.sy, st.bsz * o.sx);
  };
  function tickBodies(dt) { if (!bodies.size) return; stepDt = dt; bodies.forEach(bodyStep); }
  const bubbleStep = (b, cid) => {
    const v = M()?.views.get(cid), cam = game.camera;
    b.t += stepDt;
    if (!v || v.state === 'dead' || v.hidden || b.t >= b.dur) { releaseBubble(cid); return; }
    if (b.id === 'DANCE') {
      const f = Math.floor(b.t / 0.3) % 2;
      if (f !== b.frame) { b.frame = f; const tex = bubbleTex('DANCE', f); if (tex) b.spr.material.map = tex; }
    }
    const s = b.spr;
    s.position.set(v.pos.x, v.pos.y + (v.height || 1.5) + 0.55 + Math.sin(b.t * 5) * 0.04, v.pos.z);
    const dist = cam ? cam.position.distanceTo(s.position) : 10;
    s.visible = dist < 48;
    const pop = clamp(b.t / 0.18, 0, 1), fade = clamp((b.dur - b.t) / 0.35, 0, 1);
    const k = (1 + 0.25 * Math.sin(pop * Math.PI)) * pop * (dist > 9 ? Math.min(3.2, dist / 9) : 1);
    s.scale.set(0.9 * k, 0.51 * k, 1);
    s.material.opacity = fade;
  };
  function tickBubbles(dt) { if (!bubbles.size) return; stepDt = dt; bubbles.forEach(bubbleStep); }

  // ------------------------------------------------------------------ client: net + chat + victim camera
  let focus = null;                       // { id, t, blend } spectator camera on the killer for ~2 s
  function applyEmote(d) {
    const v = M()?.views.get(d.id);
    if (!v || v.state === 'dead' || v.hidden) return false;
    const dur = clamp(Number(d.d) || EMOTE_DUR[d.e] || 2.4, 0.6, 12);
    startBody(v, d.e, dur);
    if (d.b) startBubble(d.id, d.b, clamp(dur, 1.8, 3.4));
    return true;
  }
  function creatureName(d) { const v = M()?.views.get(d.id); return t(v?.def?.name || CREATURES[d.ty]?.name || d.ty || 'Creature'); }
  function onCe(d) {
    if (disposed || !d || typeof d !== 'object') return;
    if (d.k === 'note') {
      if (typeof NOTES[d.n] !== 'string') return;
      game.ui?.toast?.(tf(NOTES[d.n], { c: t(CREATURES[d.ty]?.name || String(d.ty || 'It')) }), NOTE_KIND[d.n] || 'info');
      return;
    }
    if ((d.k !== 'e' && d.k !== 'win') || typeof d.id !== 'string' || !BODY[d.e] || (d.b && !BUBBLES[d.b])) return;
    applyEmote(d);
    if (d.k !== 'win') return;
    const lines = WIN_LINES[d.e] || WIN_LINES.dance;
    const line = lines[(d.li | 0) % lines.length];
    try { game.ui?.chatMessage?.(null, tf(line.en, { c: creatureName(d), p: String(d.vn || 'Employee').slice(0, 24) }), false, 'info'); } catch { /* chat is optional */ }
    if (d.v && d.v === game.selfId) focus = { id: d.id, t: 2.0, blend: 0 };
  }
  function tickFocus(dt) {
    if (!focus) return;
    const p = game.player, v = M()?.views.get(focus.id);
    focus.t -= dt;
    if (focus.t <= 0 || !v || !p?.dead) { focus = null; return; }
    focus.blend = clamp(focus.blend + dt * (focus.t > 0.4 ? 3 : -3), 0, 1);
    const cam = game.camera, hd = S.head, w = S.want;
    hd.set(v.pos.x, v.pos.y + (v.height || 1.5) * 0.6, v.pos.z);
    let dx = cam.position.x - hd.x, dz = cam.position.z - hd.z;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const dist = clamp(2.6 + (v.height || 1.5) * 1.4, 3.2, 9.5);
    w.set(hd.x + dx * dist, hd.y + 0.5 + (v.height || 1.5) * 0.25, hd.z + dz * dist);
    const e = focus.blend * focus.blend * (3 - 2 * focus.blend);
    cam.position.lerp(w, e);
    cam.lookAt(hd);
  }

  // ------------------------------------------------------------------ host: helpers
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const orig = obj[name], hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
    const w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (hadOwn) obj[name] = orig; else delete obj[name]; } });
  };
  const emit = (c, body, bubble, dur) => game.net.broadcast('ce', { k: 'e', id: c.id, e: body, b: bubble || undefined, d: +(dur || EMOTE_DUR[body] || 2.4).toFixed(2) });
  const note = (pid, n, c) => game.net.sendTo(pid, 'ce', { k: 'note', n, ty: c.type });
  /** Non-hostile for `secs`: the host AI is skipped while stunT > 0 (CreatureManager.hostUpdate), no state juggling needed. */
  function freeze(c, secs) {
    c.stunT = Math.max(c.stunT || 0, secs);
    if (LOCO.has(c.state)) c.setState('idle');
    c.path = null; c.dest = null; c.target = null;
    c.cooldown = Math.max(c.cooldown || 0, 1.2);
    fleeing.delete(c.id);
  }
  const usable = (c) => c && !c.dead && !(c.stunT > 0) && !c.data?.evade && !c.def?.hazard;

  // shy creatures: waving, then running away while frozen out of their normal AI
  const fleeing = new Map();              // creature id -> { until }
  function startFlee(c, p, secs) {
    const m = M(), now = game.time;
    freeze(c, secs + 0.1);
    let dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nav = m.nav(c), dist = 9;
    let ok = false;
    if (nav) {
      for (let i = 0; i < 6 && !ok; i++) {
        const a = (Math.random() - 0.5) * 1.6, cs = Math.cos(a), sn = Math.sin(a);
        const w = nav.randomWalkable(Math.random, c.pos.x + (dx * cs - dz * sn) * dist, c.pos.z + (dx * sn + dz * cs) * dist, 3);
        if (w) { m.goTo(c, w.x, w.z); ok = !!c.path; }
      }
    } else {
      const lim = game.world?.terrain?.playHalf ?? 130;
      m.goTo(c, clamp(c.pos.x + dx * dist, -lim, lim), clamp(c.pos.z + dz * dist, -lim, lim)); ok = !!c.path;
    }
    if (ok) { c.setState('walk'); fleeing.set(c.id, { until: now + secs }); }
  }
  function fleeTick(dt, now) {
    if (!fleeing.size) return;
    const m = M();
    for (const [id, f] of fleeing) {
      const c = m.host.get(id);
      if (!c || c.dead || now > f.until) { fleeing.delete(id); if (c && !c.dead) { c.setState('idle'); c.path = null; c.dest = null; } continue; }
      if (c.path) m.follow(c, dt, (c.def.run || c.def.walk || 3) * 0.85);
    }
  }

  // ------------------------------------------------------------------ host: reactions to player emotes
  function enrage(c, p, pers, now) {
    const m = M();
    if (pers.rage === 'anger') { c.data.anger = (c.data.anger || 0) + 5; c.target = p.id; }
    else if (pers.rage === 'chase' && (c.state === 'idle' || c.state === 'walk' || c.state === 'run')) {
      c.target = p.id; c.lostT = 0; c.data.hitBy = p.id; c.data.hitAt = now; c.setState('run');
    }
    m.noise(p.pos, 1.6, p.id);            // a taunt is loud: everything that listens comes to the taunter (and not just this one)
  }
  function perform(c, p, act, defId, pers) {
    if (disposed || !c || c.dead) return;
    if ((act === 'join' || act === 'shy' || act === 'enrage') && !usable(c)) return;   // (stunned meanwhile: the AI-changing reactions are off)
    const now = game.time;
    switch (act) {
      case 'copy': emit(c, COPY_MAP[defId] || 'tilt', pers.copyBubble, 3); note(p.id, 'copy', c); break;
      case 'join': {
        const T = pers.joinT || 6;
        freeze(c, T);
        emit(c, 'dance', Math.random() < 0.5 ? 'SMILE' : 'DANCE', T);
        note(p.id, 'join', c);
        break;
      }
      case 'wave': emit(c, 'bow', Math.random() < 0.5 ? 'O7' : 'SMILE', 2.2); break;
      case 'shy': emit(c, 'bow', 'SMILE', 1.6); note(p.id, 'shy', c); startFlee(c, p, pers.fleeT || 2.8); break;
      case 'enrage': emit(c, 'flex', 'EXCL', 1.8); enrage(c, p, pers, now); note(p.id, 'enrage', c); break;
      case 'curious': emit(c, 'tilt', 'Q', 2); break;
      case 'laugh': emit(c, 'laugh', ['LMAO', 'RATIO', 'GG'][Math.floor(Math.random() * 3)], 2.4); break;
      case 'sulk': emit(c, 'slump', 'L', 2.4); break;
      default: break;
    }
  }
  // 'can see': a clear line between its eyes and yours. (Not CreatureManager.canSee: that one also applies stealth / balance detection
  // multipliers, which would shrink the 8 m reaction radius to nothing in the early sectors. An emoting player is not sneaking.)
  const sees = (c, p) => { try { return !!game.physics.lineOfSight(M().eye(c), p.eye); } catch { return true; } };
  /** A player's emote just started: every creature within ~8 m (11 m for taunts) that can SEE them may react. */
  function onPlayerEmote(p, def, now, force = false) {
    const m = M();
    if (!m?.host?.size || p.dead || p.inShip) return 0;
    if (!force && !book.burstOk(p.id, now)) return 0;
    const kind = emoteKind(def.id);
    let n = 0;
    for (const c of m.host.values()) {
      if (n >= 6) break;
      if (c.dead || c.stunT > 0 || c.def?.hazard || c.data?.evade || (c.zone !== p.zone && c.zone !== 'any')) continue;
      const pers = persOf(c);
      const act = pers.mute ? 'ignore' : pers.react[kind];
      if (!act || act === 'ignore') continue;
      const range = act === 'enrage' ? CD.reactEnrage : CD.react;
      if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > range || Math.abs(c.pos.y - p.pos.y) > 4) continue;
      if (!force && (!canReact(book, c.id, p.id, act, now) || !sees(c, p))) continue;
      markReact(book, c.id, p.id, act, now, act === 'join' ? pers.joinT : 0);
      n++;
      later(() => perform(c, p, act, def.id, pers), 300 + Math.random() * 600);
    }
    if (n) book.burstMark(p.id, now);
    return n;
  }
  const prevEmote = new Map();
  function scanPlayers(now) {
    for (const p of game.aiPlayers()) {
      const net = p.dead ? null : (p.id === game.selfId ? game.emote : game.remotes.get(p.id)?.emoteNet) || null;
      const prev = prevEmote.get(p.id) || null;
      if (net === prev) continue;
      prevEmote.set(p.id, net);
      const def = net && emoteFromNet(net);
      if (def) onPlayerEmote(p, def, now);
    }
  }

  // ------------------------------------------------------------------ host: idle + victory emotes
  const nextIdle = new Map();
  function idleEmotes(now) {
    const m = M(), players = game.aiPlayers();
    for (const c of m.host.values()) {
      if (c.dead || c.stunT > 0 || c.def?.hazard || c.data?.evade) continue;
      const pers = persOf(c);
      if (pers.mute || !pers.idle.length) continue;
      const due = nextIdle.get(c.id);
      if (due === undefined) { nextIdle.set(c.id, now + nextIdleDelay(pers) * Math.random()); continue; }
      if (now < due) continue;
      if ((c.state !== 'idle' && c.state !== 'walk') || c.age < 4 || bodies.has(c.id)) { nextIdle.set(c.id, now + 6); continue; }   // never while hunting
      let seen = false;
      for (const p of players) if (!p.dead && !p.inShip && (p.zone === c.zone || c.zone === 'any') && p.pos.distanceTo(c.pos) < 40) { seen = true; break; }
      if (!seen) { nextIdle.set(c.id, now + 10); continue; }
      const pick = pickEmote(pers.idle);
      nextIdle.set(c.id, now + nextIdleDelay(pers));
      if (pick) emit(c, pick[0], pick[1]);
    }
    if (nextIdle.size > m.host.size + 20) for (const k of nextIdle.keys()) if (!m.host.has(k)) nextIdle.delete(k);
  }
  function victory(c, victimId, force = false) {
    const now = game.time;
    if (!c || c.dead || (!force && !book.ready('v:' + c.id, now))) return false;
    const pers = persOf(c);
    if (pers.mute && !force) return false;
    const pick = pickEmote(pers.win.length ? pers.win : ARCH_FALLBACK_WIN);
    if (!pick) return false;
    book.set('v:' + c.id, now, CD.victory);
    const [body, bubble] = pick, dur = Math.max(2.6, EMOTE_DUR[body] || 3);
    const li = Math.floor(Math.random() * 8);
    later(() => {
      if (disposed || c.dead || M()?.host.get(c.id) !== c) return;
      if (!pers.noFreeze && !c.def?.boss) freeze(c, dur + 0.2);
      game.net.broadcast('ce', { k: 'win', id: c.id, e: body, b: bubble, d: dur, v: victimId, ty: c.type, vn: game.playerName(victimId), li });
    }, 350);
    return true;
  }
  const ARCH_FALLBACK_WIN = [['hop', ['GG'], 1]];
  const lastHit = new Map();              // victim id -> { cid, t }
  function onPlayerDied(id, d) {
    const m = M();
    if (!m?.host) return;
    const now = game.time, lh = lastHit.get(id);
    lastHit.delete(id);
    const cause = d?.cause;
    let c = lh && now - lh.t < 6 ? m.host.get(lh.cid) : null;
    if (c && (c.dead || !(cause === c.type || now - lh.t < 2.5))) c = null;
    if (!c && cause && CREATURES[cause]) {                       // fall back: nearest living creature of the killer's type near the body
      const at = d.pos ? new THREE.Vector3().fromArray(d.pos) : game.aiPlayerById(id)?.pos;
      let best = 12;
      if (at) for (const o of m.host.values()) if (o.type === cause && !o.dead) { const dd = o.pos.distanceTo(at); if (dd < best) { best = dd; c = o; } }
    }
    if (c) victory(c, id);
  }

  // ------------------------------------------------------------------ wiring
  wrap(game, 'hostHurtPlayer', (orig) => function (id, dmg, cause, fromId, fromPos) {
    if (fromId && dmg > 0) lastHit.set(id, { cid: fromId, t: game.time });
    return orig.call(this, id, dmg, cause, fromId, fromPos);
  });
  wrap(game, 'hostOnPlayerDied', (orig) => function (id, d) {
    const r = orig.call(this, id, d);
    try { onPlayerDied(id, d); } catch (e) { console.warn('[cemotes] victory', e); }
    return r;
  });
  let scanT = 0, idleT = 1;
  function hostTick(dt) {
    const m = M();
    if (!m?.host?.size) return;
    const now = game.time;
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.15; scanPlayers(now); }
    idleT -= dt;
    if (idleT <= 0) { idleT = 1; idleEmotes(now); book.prune(now); }
    fleeTick(dt, now);
  }
  offs.push(mods.on('netReady', (net, g) => { if (g === game) net.on_('ce', (d) => onCe(d)); }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      if (game.isHost) hostTick(dt);
      tickBodies(dt); tickBubbles(dt); tickFocus(dt);
    } catch (e) { if (!api._warned) { api._warned = true; console.warn('[cemotes]', e); } }
  }));

  const api = {
    personality: (type) => resolvePersonality(type, CREATURES[type] || {}),
    /** host: play a body emote + bubble on a creature (debug / scripts) */
    play(cid, body, bubble, dur) { const c = M()?.host.get(cid); if (!c || !BODY[body]) return false; emit(c, body, bubble, dur); return true; },
    /** host: force the victory emote of a creature (skips the mute / cooldown checks) */
    victory(cid, victimId, force = true) { return victory(M()?.host.get(cid), victimId || game.selfId, force); },
    /** host: pretend player `pid` started player-emote `emoteId` (skips cooldown / sight checks with force) */
    playerEmote(pid, emoteId, force = false) { const p = game.aiPlayerById(pid), def = emoteFromNet(emoteId); return p && def ? onPlayerEmote(p, def, game.time, force) : 0; },
    stats: () => ({ bodies: bodies.size, bubbles: bubbles.size, fleeing: fleeing.size, focus: !!focus, cooldowns: book.m.size }),
    book, nextIdle,
    dispose() {
      disposed = true;
      for (const [cid, st] of [...bodies]) endBody(cid, st);
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      for (const s of pool) { s.removeFromParent(); s.material.dispose(); }
      pool.length = 0; bubbles.clear();
      for (const tex of texCache.values()) tex.dispose();
      texCache.clear();
      focus = null;
    },
  };
  return api;
}
