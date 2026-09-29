// [finish] MAPS2 CHALLENGE ROOMS (wave 3): the runtime of the five challenge rooms built by world/rooms2.js.
//   PHYSICS  heavy scrap waits on the yellow pad; carry / push enough weight onto the plate (host sums item weights) -> reward drops
//   GAMBLE   fate lever: pay credits, weighted outcome (jackpot / win / loot / nothing / curse spawn / small blast)
//   ARENA    console seals every opening with shutters, two creature waves, reward + shutters rise (timeout / wipe abort)
//   PUZZLE   two levers pulled within 1 s (co-op; a solo player gets 6 s) light the colour code, press the 4 buttons in order
//   TREASURE the idol on the pedestal: lifting it starts a collapse (warning, rock fall telegraphs, one safe passage seals)
// Host-authoritative (state machines in maps2_rules.js, numbers tested in node); clients only animate anchors (arm / ring / lamps) and
// show banners. All state events go through W.send ('m2s'), requests through the 'm2' handler (maps2_world.js).
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import * as R from './maps2_rules.js';
import './maps2_text2.js';

const COLS = [0xe02030, 0x30c050, 0x3060ff, 0xffd020];
const dim = (hex, k) => ((((hex >> 16) & 255) * k) << 16) | ((((hex >> 8) & 255) * k) << 8) | ((hex & 255) * k);

export function installChallenge(game, W) {
  const H = { plate: new Map(), arena: null, puzzle: new Map(), gamble: new Map(), idol: new Map(), rocks: [], timers: 0 };
  const vis = { rings: new Map(), arms: new Map(), armT: new Map(), leverT: new Map(), panels: new Map(), rockMarks: [] };
  const later = (fn, ms) => (game.later ? game.later(fn, ms) : setTimeout(fn, ms));
  const host = () => W.host();
  const ch = () => W.challenge();
  const spotOf = (k, room, i) => W.spots.find((s) => s.k === k && s.room === room && (i === undefined || s.i === i));
  const sRoom = (room) => W.roomOf(room);
  const now = () => game.time || 0;

  // ------------------------------------------------------------------------------------------------ populate (host, once per day)
  W.popFns.push(() => {
    const c = ch();
    if (!c) return;
    const room = c.room;
    if (c.id === 'physics') {
      const pad = spotOf('pad', room), plate = spotOf('plate', room);
      if (!pad || !plate) return;
      R.PLATE.weights.forEach((id, i) => {
        const a = i * 1.7;
        try { game.items.hostSpawn(id, new THREE.Vector3(pad.x + Math.cos(a) * 0.45, pad.y + 0.35 + i * 0.2, pad.z + Math.sin(a) * 0.45), {}); } catch (e) { console.warn('[maps2] weight', id, e); }
      });
      H.plate.set(room, { f: 0, t: 0, done: false, sent: -1 });
    } else if (c.id === 'treasure') {
      const chest = spotOf('chest', room);
      if (!chest) return;
      try { const id = game.items.hostSpawn('usbidol', new THREE.Vector3(chest.x, chest.y + 0.25, chest.z), { tier: 'epic' }); H.idol.set(room, { id, started: false }); } catch (e) { console.warn('[maps2] idol', e); }
    } else if (c.id === 'puzzle') H.puzzle.set(room, R.newPuzzle());
    else if (c.id === 'gamble') H.gamble.set(room, { pulls: 0, cd: 0 });
  });
  W.mapFns.push(() => { H.plate.clear(); H.puzzle.clear(); H.gamble.clear(); H.idol.clear(); H.arena = null; H.rocks.length = 0; vis.rings.clear(); vis.arms.clear(); vis.armT.clear(); vis.leverT.clear(); vis.panels.clear(); for (const m of vis.rockMarks) m.mesh.removeFromParent(); vis.rockMarks.length = 0; applySolvedVisuals(); });

  function applySolvedVisuals() {
    const c = ch();
    if (!c) return;
    if (W.isDone(c.room)) markSolved(c.id, c.room);
    // puzzle lamps / lever rest pose
    const panel = spotOf('panel', c.room);
    if (panel?.obj) for (let i = 0; i < 4; i++) { W.anchorColor(panel.obj, 'l' + i, 0x202020); W.anchorColor(panel.obj, 'b' + i, dim(COLS[i], 0.35)); }
    for (const lv of W.spotList('lever', c.room)) { const arm = lv.obj?.userData?.anchors?.arm; if (arm) arm.rotation.x = c.id === 'puzzle' ? -0.7 : 0; }
  }
  function markSolved(id, room) {
    if (id === 'physics') { const p = spotOf('plate', room); if (p?.obj) { W.anchorColor(p.obj, 'ring', 0x30ff60); p.obj.position.y = p.y - 0.1 - 0.03; } }
    else if (id === 'arena') { const s = spotOf('console', room); if (s?.obj) W.anchorColor(s.obj, 'btn', 0x30ff60); }
    else if (id === 'puzzle') { const p = spotOf('panel', room); if (p?.obj) for (let i = 0; i < 4; i++) { W.anchorColor(p.obj, 'l' + i, 0x30ff60); } }
  }

  // ------------------------------------------------------------------------------------------------ client visuals (state events)
  W.on('plate', (d) => {
    const p = spotOf('plate', d.room);
    if (!p?.obj) return;
    const f = Math.max(0, Math.min(1, d.f));
    const col = new THREE.Color(0xff3020).lerp(new THREE.Color(0x30ff60), f);
    const a = p.obj.userData?.anchors?.ring?.children?.[0]?.material;
    if (a?.color) a.color.copy(col);
    p.obj.position.y = (p.y - 0.1) - 0.03 * f;
    if (d.done) { game.audio?.at?.('ui_confirm', new THREE.Vector3(p.x, p.y + 0.5, p.z), 0.8, { refDistance: 6 }); }
  });
  W.on('done', (d) => { W.hs.done[d.room] = 1; markSolved(d.id, d.room); });
  W.on('lever', (d) => {
    const lv = d.i === undefined ? spotOf('lever', d.room) : spotOf('lever', d.room, d.i);
    const arm = lv?.obj?.userData?.anchors?.arm;
    if (!arm) return;
    vis.arms.set(arm, { to: d.on ? 0.9 : (d.rest ?? -0.7), from: arm.rotation.x, t: 0 });
    try { game.audio?.at?.('lever_pull', new THREE.Vector3(lv.x, lv.y, lv.z), 0.7, { refDistance: 5 }); } catch { /* audio optional */ }
  });
  W.on('panel', (d) => {
    const p = spotOf('panel', d.room);
    if (!p?.obj) return;
    const seq = ch()?.seq || [0, 1, 2, 3];
    for (let i = 0; i < 4; i++) {
      if (d.mode === 'reveal') W.anchorColor(p.obj, 'l' + i, COLS[seq[i]]);
      else if (d.mode === 'off') W.anchorColor(p.obj, 'l' + i, 0x202020);
      else if (d.mode === 'fail') W.anchorColor(p.obj, 'l' + i, 0xff2020);
      else if (d.mode === 'ok') W.anchorColor(p.obj, 'l' + i, i < d.pos ? 0x30ff60 : COLS[seq[i]]);
      else if (d.mode === 'solved') W.anchorColor(p.obj, 'l' + i, 0x30ff60);
    }
    if (d.btn !== undefined) { W.anchorColor(p.obj, 'b' + d.btn, COLS[d.btn]); later(() => W.anchorColor(p.obj, 'b' + d.btn, dim(COLS[d.btn], 0.35)), 220); }
    try { game.audio?.at?.(d.mode === 'fail' ? 'ui_error' : 'ui_click', new THREE.Vector3(p.x, p.y, p.z), 0.6, { refDistance: 5 }); } catch { /* audio optional */ }
  });
  W.on('pull', (d) => {
    const lv = spotOf('lever', d.room);
    const arm = lv?.obj?.userData?.anchors?.arm;
    if (arm) { vis.arms.set(arm, { to: 1.1, from: arm.rotation.x, t: 0, back: 0.45 }); }
    try { game.audio?.at?.('lever_pull', new THREE.Vector3(lv.x, lv.y, lv.z), 0.9, { refDistance: 6 }); } catch { /* audio optional */ }
  });
  W.on('arena', (d) => {
    const s = spotOf('console', d.room);
    if (s?.obj) W.anchorColor(s.obj, 'btn', d.phase === 'run' ? 0xffb020 : d.phase === 'done' ? 0x30ff60 : d.phase === 'fail' ? 0x804040 : 0xff2020);
  });
  W.on('rock', (d) => {
    // telegraph: a dark disc on the floor; dust + sound when it lands
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1.3, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(d.x, d.y + 0.03, d.z);
    (W.F?.group || game.engine?.scene)?.add(mesh);
    vis.rockMarks.push({ mesh, t: R.TREASURE.telegraph, x: d.x, y: d.y, z: d.z });
  });
  W.tickFns.push((dt) => {
    for (const [arm, a] of vis.arms) {
      a.t += dt * 4;
      const k = Math.min(1, a.t);
      arm.rotation.x = a.from + (a.to - a.from) * k;
      if (k >= 1) { if (a.back !== undefined) { vis.arms.set(arm, { to: 0, from: arm.rotation.x, t: 0 }); } else vis.arms.delete(arm); }
    }
    for (let i = vis.rockMarks.length - 1; i >= 0; i--) {
      const m = vis.rockMarks[i];
      m.t -= dt;
      m.mesh.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin(m.t * 9));
      if (m.t <= 0) {
        W.dust(new THREE.Vector3(m.x, m.y + 0.4, m.z), 1.2);
        try { game.audio?.at?.('hit_metal', new THREE.Vector3(m.x, m.y + 0.5, m.z), 0.9, { refDistance: 6 }); if (game.player && Math.hypot(game.player.pos.x - m.x, game.player.pos.z - m.z) < 25) game.engine?.shake?.(0.35); } catch { /* audio optional */ }
        m.mesh.removeFromParent(); m.mesh.geometry.dispose(); m.mesh.material.dispose();
        vis.rockMarks.splice(i, 1);
      }
    }
  });

  // ------------------------------------------------------------------------------------------------ host: PHYSICS
  W.tickFns.push((dt) => {
    if (!host() || !H.plate.size) return;
    H.timers += dt;
    if (H.timers < 0.25) return;
    const step = H.timers; H.timers = 0;
    for (const [room, st] of H.plate) {
      if (st.done) continue;
      const p = spotOf('plate', room);
      if (!p) continue;
      const items = [];
      for (const it of game.items.all()) {
        if (it.state !== 'world' || it.holder || it.type === 'body') continue;
        const q = it.obj.position;
        if (Math.hypot(q.x - p.x, q.z - p.z) > 3) continue;
        items.push({ x: q.x, y: q.y, z: q.z, weight: it.def.weight || 0 });
      }
      const w = R.plateWeight(items, p.x, p.y, p.z, p.r || R.PLATE.r);
      R.plateStep(st, w, step);
      const q = Math.round(st.f * 8) / 8;
      if (q !== st.sent || st.done) { st.sent = q; W.send({ k: 'plate', room, f: st.f, done: st.done }); }
      if (st.done) {
        W.hs.done[room] = 1; W.persist();
        W.send({ k: 'done', id: 'physics', room });
        W.banner(t('PLATE ACTIVATED'), '', 'good');
        W.loot({ x: p.x, y: p.y + 0.4, z: p.z }, R.PLATE.reward, 'rare');
        W.snd('ui_confirm', { x: p.x, y: p.y + 1, z: p.z }, 0.9);
      }
    }
  });

  // ------------------------------------------------------------------------------------------------ host: request ops
  W.handle('pull', (d, from, pl) => {   // gamble
    const c = ch();
    if (!c || c.id !== 'gamble') return;
    const lv = spotOf('lever', c.room), g = H.gamble.get(c.room);
    if (!lv || !g || !W.nearSpot(pl, lv, 4)) return;
    if (g.pulls >= R.GAMBLE.maxPulls) { game.net.sendTo(from, 'sys', { text: t('Nothing left to gamble.'), kind: 'warn' }); return; }
    if (now() < g.cd) { game.net.sendTo(from, 'sys', { text: t('The lever is jammed for now.'), kind: 'warn' }); return; }
    if ((game.run?.credits || 0) < R.GAMBLE.cost) { game.net.sendTo(from, 'sys', { text: t('Not enough credits.'), kind: 'warn' }); return; }
    g.pulls++; g.cd = now() + R.GAMBLE.cooldown;
    W.credits(-R.GAMBLE.cost);
    W.send({ k: 'pull', room: c.room });
    const o = R.gambleOutcome(Math.random, game.run?.quotaIndex || 0);
    const at = { x: lv.x, y: lv.y - 0.6, z: lv.z + 0.8 };
    later(() => {
      const label = { jackpot: 'JACKPOT', win: 'YOU WIN', loot: 'LOOT', nothing: 'THE HOUSE WINS', curse: 'CURSED', blast: 'BLAST' }[o.kind];
      W.banner(t(label), o.credits ? `+${o.credits}` : '', o.kind === 'curse' || o.kind === 'blast' || o.kind === 'nothing' ? 'bad' : 'good');
      if (o.credits) W.credits(o.credits);
      if (o.items) W.loot(at, o.items, o.kind === 'jackpot' ? 'epic' : 'uncommon');
      if (o.spawn) {
        const sp = W.spotList('lever', c.room)[0], rr = sRoom(c.room);
        for (let i = 0; i < o.spawn; i++) W.spawn(i ? 'yoinker' : 'scuttler', (rr ? rr.cx : sp.x) + (i - 0.5) * 2, rr ? rr.y : sp.y - 1.3, (rr ? rr.cz : sp.z) + 1);
        W.say(t('Something crawled out of the machines.'), 'bad');
      }
      if (o.dmg) { for (const q of W.alive()) if (W.nearSpot(q, lv, 3.5)) W.hurt(q.id, o.dmg, 'explosion'); game.net.broadcast('fx', { k: 'explode', p: [lv.x, lv.y, lv.z] }); }
    }, 700);
  });

  W.handle('arena', (d, from, pl) => {
    const c = ch();
    if (!c || c.id !== 'arena' || W.isDone(c.room) || H.arena) return;
    const con = spotOf('console', c.room);
    if (!con || !W.nearSpot(pl, con, 4)) return;
    startArena(c.room);
  });
  W.handle('lever', (d, from, pl) => {   // puzzle
    const c = ch();
    if (!c || c.id !== 'puzzle') return;
    const st = H.puzzle.get(c.room), lv = spotOf('lever', c.room, d.i | 0);
    if (!st || !lv || st.done || !W.nearSpot(pl, lv, 3.5)) return;
    const i = d.i | 0;
    const r = R.puzzleLever(st, i, now(), W.crew());
    W.send({ k: 'lever', room: c.room, i, on: true });
    later(() => W.send({ k: 'lever', room: c.room, i, on: false, rest: -0.7 }), R.PUZZLE.leverReturn * 1000);
    if (r === 'reveal') {
      W.send({ k: 'panel', room: c.room, mode: 'reveal' });
      W.banner(t('CODE REVEALED'), t('Watch the lamps, then press the colours in order.'), 'good');
      later(() => { if (!st.done && now() >= st.revealT - 0.2) W.send({ k: 'panel', room: c.room, mode: 'off' }); }, R.PUZZLE.reveal * 1000 + 300);
    }
  });
  W.handle('btn', (d, from, pl) => {
    const c = ch();
    if (!c || c.id !== 'puzzle') return;
    const st = H.puzzle.get(c.room), pn = spotOf('panel', c.room);
    if (!st || !pn || !W.nearSpot(pl, pn, 3.5)) return;
    const i = d.i | 0;
    if (i < 0 || i > 3) return;
    const r = R.puzzleButton(st, i, c.seq, now());
    if (r === 'locked') { game.net.sendTo(from, 'sys', { text: t('The panel is dark. Sync the levers first.'), kind: 'warn' }); return; }
    if (r === 'done') return;
    W.send({ k: 'panel', room: c.room, mode: r === 'ok' ? 'ok' : r === 'solved' ? 'solved' : 'fail', pos: st.pos, btn: i });
    if (r === 'fail') { W.banner(t('WRONG CODE'), '', 'bad'); later(() => W.send({ k: 'panel', room: c.room, mode: 'off' }), 900); }
    if (r === 'solved') {
      W.hs.done[c.room] = 1; W.persist();
      W.send({ k: 'done', id: 'puzzle', room: c.room });
      W.banner(t('CODE ACCEPTED'), '', 'good');
      const rw = spotOf('reward', c.room);
      W.loot({ x: rw?.x ?? pn.x, y: (rw?.y ?? pn.y) + 0.6, z: rw?.z ?? pn.z }, 4, 'rare');
      W.credits(60 + 12 * (game.run?.quotaIndex || 0));
    }
  });
  W.handle('rp', (d, from, pl) => {
    const c = ch();
    const st = c && c.id === 'puzzle' ? H.puzzle.get(c.room) : null, pn = c ? spotOf('panel', c.room) : null;
    if (!st || !pn || st.done || !W.nearSpot(pl, pn, 3.5)) return;
    st.pos = 0; st.revealT = 0;
    W.send({ k: 'panel', room: c.room, mode: 'off' });
  });

  // ------------------------------------------------------------------------------------------------ host: ARENA
  function startArena(room) {
    const rr = sRoom(room);
    const ops = W.spotList('opening', room);
    if (!rr) return;
    H.arena = { room, wave: 0, ids: new Set(), t: 0, wipeT: 0, phase: 'run', gap: 0 };
    ops.forEach((o, i) => {
      const e = { key: o.key, x: o.x, z: o.z, dir: o.dir, w: Math.max(1.6, o.w), h: Math.max(2.6, o.hh), y: rr.y, shutter: true, seed: 100 + i };
      W.hostSeal('arena:' + room + ':' + i, e, true);
    });
    W.send({ k: 'arena', room, phase: 'run' });
    W.banner(t('ARENA: WAVE {n}').replace('{n}', '1'), t('The shutters slam shut.'), 'wave');
    W.send({ k: 'shake', n: 0.5, p: [rr.cx, rr.y, rr.cz], r: 30 });
    later(() => beginWave(1), 1600);
  }
  function beginWave(n) {
    const A = H.arena;
    if (!A || A.phase !== 'run') return;
    A.wave = n; A.gap = 0;
    const spawns = W.spotList('spawn', A.room);
    const rr = sRoom(A.room);
    const list = R.arenaWave(n, W.crew(), game.run?.quotaIndex || 0);
    let k = 0;
    for (const e of list) for (let i = 0; i < e.n; i++) {
      const s = spawns.length ? spawns[k++ % spawns.length] : { x: rr.cx, y: rr.y, z: rr.cz };
      const c = W.spawn(e.type, s.x + (Math.random() - 0.5), s.y ?? rr.y, s.z + (Math.random() - 0.5), { state: 'run' });
      if (c) A.ids.add(c.id);
    }
    W.send({ k: 'arena', room: A.room, phase: 'run', wave: n });
    if (n > 1) W.banner(t('ARENA: WAVE {n}').replace('{n}', String(n)), '', 'wave');
    W.noise(rr.cx, rr.y + 1, rr.cz, 4);
  }
  function endArena(ok) {
    const A = H.arena;
    if (!A) return;
    H.arena = null;
    const rr = sRoom(A.room);
    for (const id of A.ids) { const c = game.creatures.host.get(id); if (c && !c.dead && !ok) game.creatures.kill(c, null, { silent: true }); }
    W.banner(t(ok ? 'ARENA CLEARED' : 'ARENA FAILED'), t(ok ? 'The shutters rise.' : 'Nobody is left standing.'), ok ? 'good' : 'bad');
    W.send({ k: 'arena', room: A.room, phase: ok ? 'done' : 'fail' });
    W.spotList('opening', A.room).forEach((o, i) => W.hostUnseal('arena:' + A.room + ':' + i));
    W.hs.done[A.room] = 1; W.persist();
    if (ok) {
      const rw = R.arenaReward(W.crew(), game.run?.quotaIndex || 0);
      W.credits(rw.credits);
      const at = spotOf('reward', A.room) || { x: rr.cx, y: rr.y, z: rr.cz };
      W.loot({ x: at.x, y: at.y + 0.5, z: at.z }, rw.items, 'rare');
      W.send({ k: 'done', id: 'arena', room: A.room });
    }
  }
  W.tickFns.push((dt) => {
    const A = H.arena;
    if (!A || !host()) return;
    A.t += dt;
    if (A.phase !== 'run' || A.wave < 1) { if (A.t > R.ARENA.timeout) endArena(false); return; }
    // wave progress
    for (const id of [...A.ids]) { const c = game.creatures.host.get(id); if (!c || c.dead) A.ids.delete(id); }
    A.gap += dt;
    if (!A.ids.size && A.gap > 1.5) { if (A.wave >= R.ARENA.waves) { endArena(true); return; } A.gap = -99; later(() => beginWave(A.wave + 1), 2500); return; }
    // wipe / timeout
    const rr = sRoom(A.room);
    const inside = W.alive().filter((p) => W.inRoom(p, rr, 1));
    A.wipeT = inside.length ? 0 : A.wipeT + dt;
    if (A.wipeT > R.ARENA.wipe || A.t > R.ARENA.timeout) endArena(false);
    // keep the swarm interested every few seconds
    if ((A.beat = (A.beat || 0) + dt) > 3) { A.beat = 0; const p = inside[0]; if (p) W.noise(p.pos.x, p.pos.y, p.pos.z, 3.2); }
  });

  // ------------------------------------------------------------------------------------------------ host: TREASURE (idol -> collapse)
  W.tickFns.push((dt) => {
    if (!host() || !H.idol.size) return;
    H.idolT = (H.idolT || 0) + dt;
    if (H.idolT < 0.3) return;
    H.idolT = 0;
    for (const [room, s] of H.idol) {
      if (s.started) continue;
      const it = game.items.get(s.id);
      if (it && !it.holder && it.state === 'world') continue;
      if (it && it.holder) { s.started = true; startCollapse(room); }
    }
  });
  function startCollapse(room) {
    const c = ch(), rr = sRoom(room);
    if (!c || !rr) return;
    W.hs.done[room] = 1; W.persist();
    W.banner(t('THE ROOM GROANS'), t('Take the idol and run.'), 'bad');
    W.send({ k: 'shake', n: 0.7, p: [rr.cx, rr.y, rr.cz], r: 40 });
    W.send({ k: 'done', id: 'treasure', room });
    const seal = Object.keys(W.hs.sealed).some((k) => k.startsWith('collapse:')) ? null : W.spotList('seal', room)[0];   // one permanent seal per day (see maps2_events.js)
    later(() => {
      if (seal) { W.hostSeal('treasure:' + room, { key: seal.key, x: seal.x, z: seal.z, dir: seal.dir, w: seal.w, h: seal.h, y: seal.y, seed: 555 }); W.say(t('A passage behind you is sealed!'), 'bad'); W.send({ k: 'shake', n: 0.8, p: [seal.x, seal.y, seal.z], r: 40 }); }
    }, R.TREASURE.seal * 1000);
    const pts = R.rockPoints({ x0: rr.x0, z0: rr.z0, x1: rr.x1, z1: rr.z1 }, R.TREASURE.rocks);
    pts.forEach(([x, z], i) => {
      later(() => {
        if (!W.F) return;
        W.send({ k: 'rock', x, y: rr.y, z });
        later(() => { for (const p of W.alive()) if (Math.hypot(p.pos.x - x, p.pos.z - z) < R.TREASURE.hitR && Math.abs(p.pos.y - rr.y) < 3) W.hurt(p.id, R.TREASURE.dmg, 'rockfall'); }, R.TREASURE.telegraph * 1000);
      }, (R.TREASURE.warn + i * R.TREASURE.rockEvery) * 1000);
    });
  }

  // ------------------------------------------------------------------------------------------------ interactables (client)
  W.interFns.push((list, p) => {
    const c = ch();
    if (!c || !W.F) return;
    const V = THREE.Vector3;
    const near = (s, r) => (p.pos.x - s.x) ** 2 + (p.pos.z - s.z) ** 2 < r * r;
    if (c.id === 'gamble') {
      const lv = spotOf('lever', c.room);
      if (lv && near(lv, 4)) list.push({ pos: new V(lv.x, lv.y, lv.z), r: 0.6, reach: 2.6, label: () => t('Pull the fate lever [E]') + ' - ' + tf('Fate lever: {c} credits', { c: R.GAMBLE.cost }), action: () => W.request('pull') });
    } else if (c.id === 'arena') {
      const con = spotOf('console', c.room);
      if (con && near(con, 4) && !W.isDone(c.room)) list.push({ pos: new V(con.x, con.y, con.z), r: 0.7, reach: 2.6, label: t('Start the arena [E]'), action: () => W.request('arena') });
    } else if (c.id === 'puzzle') {
      for (const lv of W.spotList('lever', c.room)) if (near(lv, 4)) list.push({ pos: new V(lv.x, lv.y, lv.z), r: 0.5, reach: 2.6, label: t('Pull the sync lever [E]'), action: () => W.request('lever', { i: lv.i }) });
      for (const b of W.spotList('btn', c.room)) if (near(b, 3.5)) list.push({ pos: new V(b.x, b.y, b.z), r: 0.18, reach: 2.4, label: t('Press the button [E]'), action: () => W.request('btn', { i: b.i }) });
      const rp = spotOf('rp', c.room);
      if (rp && near(rp, 3.5)) list.push({ pos: new V(rp.x, rp.y, rp.z), r: 0.2, reach: 2.4, label: t('Reset [E]'), action: () => W.request('rp') });
    }
  });

  return {
    state: () => ({ plate: [...H.plate.entries()], arena: H.arena && { room: H.arena.room, wave: H.arena.wave }, puzzle: [...H.puzzle.keys()], idol: [...H.idol.keys()] }),
    dispose() { for (const m of vis.rockMarks) { try { m.mesh.removeFromParent(); m.mesh.geometry.dispose(); m.mesh.material.dispose(); } catch { /* ignore */ } } vis.rockMarks.length = 0; },
  };
}
