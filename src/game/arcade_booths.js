// ARCADE carnival booth gameplay (client side, module `arcade`). The host only sells the ticket and pays the prize (arcade_core.js createBooths());
// the round itself is played locally in the booth's own frame (carnival.root local coordinates) with tiny hand-rolled physics:
//   cans     - 3 balls thrown with LMB at a 6-can pyramid; score = cans knocked off the shelf (0-6)
//   gallery  - 25 s round, LMB fires a toy gun (hitscan), moving targets 1 / 3 points, the blue decoys cost 2; score = points
//   strength - LMB starts the power meter, LMB again stops it; 3 swings, best counts (0-100)
// createBoothPlayer({ game, THREE, carnival: () => model|null, finish(booth, sid, score), say(text, kind) }) -> { start, fire, update, cancel, active, hud }
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { GALLERY, CANS, STRENGTH, BOOTH_X } from '../models/arcade.js';

const RATE = 0.28, BALL_SPEED = 14.5, SWINGS = 3;
const v3 = () => new THREE.Vector3();

export function createBoothPlayer({ game, carnival, finish, say }) {
  let S = null;                       // the running session (null = idle)
  let clock = 0;
  const eyeL = v3(), dirL = v3(), q = new THREE.Quaternion(), tmp = v3();
  const ball = { on: false, p: v3(), v: v3(), age: 0 };

  function aimLocal(root) {
    root.updateWorldMatrix(true, false);
    const p = game.player;
    p.eyePos ? tmp.copy(p.eyePos()) : tmp.copy(p.pos);
    eyeL.copy(root.worldToLocal(tmp));
    root.getWorldQuaternion(q).invert();
    dirL.copy(p.forward()).applyQuaternion(q).normalize();
  }
  const boothCenter = (id) => BOOTH_X[id] ?? 0;

  // ---------------------------------------------------------------- cans
  function cansReset(c) {
    for (const k of c.cans) { k.mesh.position.copy(k.home); k.mesh.rotation.set(0, 0, 0); k.vel.set(0, 0, 0); k.spin.set(0, 0, 0); k.out = false; k.rest = false; }
    c.ballMesh.visible = false; ball.on = false;
    c.ballRack.forEach((b) => { b.visible = true; });
  }
  const shelfTop = () => CANS.shelf.y;
  const onShelf = (p) => Math.abs(p.x - CANS.shelf.x) < 0.66 && Math.abs(p.z - CANS.shelf.z) < 0.27;
  const knockedCount = (c) => c.cans.filter((k) => k.out && (k.mesh.position.y < shelfTop() + CANS.h * 0.5 - 0.06 || !onShelf(k.mesh.position))).length;
  function cansUpdate(dt, c, sess) {
    // ball
    if (ball.on) {
      ball.age += dt;
      ball.v.y -= 9.8 * dt; ball.p.addScaledVector(ball.v, dt);
      c.ballMesh.position.copy(ball.p);
      for (const k of c.cans) {
        if (k.mesh.position.distanceTo(ball.p) < 0.235 && ball.on) {
          if (!k.out || k.vel.lengthSq() < 4) {
            k.out = true; k.rest = false;
            k.vel.addScaledVector(ball.v, 0.55).add(tmp.set((Math.random() - 0.5) * 0.7, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4));
            k.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14);
            game.sfx?.('hit_metal', 0.55, 0.9 + Math.random() * 0.4);
          }
          ball.v.multiplyScalar(0.3); ball.v.z = Math.abs(ball.v.z) * 0.4;
        }
      }
      if (ball.p.y < 0.12 || ball.age > 3 || ball.p.z < -1.75 || (ball.p.z > -0.32 && ball.p.z < 0.32 && ball.p.y < 1.08 && Math.abs(ball.p.x - boothCenter('cans')) < 1.8)) { ball.on = false; c.ballMesh.visible = false; }
    }
    // cans: support check for resting cans, then integrate the moving ones
    for (const k of c.cans) {
      if (!k.out) {
        const row = Math.round((k.home.y - (shelfTop() + CANS.h / 2)) / CANS.h);
        if (row > 0) {
          const below = c.cans.some((o) => !o.out && Math.abs(o.home.x - k.home.x) < 0.16 && Math.round((o.home.y - (shelfTop() + CANS.h / 2)) / CANS.h) === row - 1);
          if (!below) { k.out = true; k.rest = false; }
        }
        continue;
      }
      if (k.rest) continue;
      k.vel.y -= 9.8 * dt;
      k.mesh.position.addScaledVector(k.vel, dt);
      k.mesh.rotation.x += k.spin.x * dt; k.mesh.rotation.z += k.spin.z * dt;
      const p = k.mesh.position;
      const floor = (onShelf(p) ? shelfTop() : 0) + CANS.h / 2;
      if (p.y < floor && (p.y > floor - 0.35 || !onShelf(p))) {
        if (p.y < floor) { p.y = floor; if (Math.abs(k.vel.y) > 1.2) { k.vel.y *= -0.3; k.vel.x *= 0.7; k.vel.z *= 0.7; k.spin.multiplyScalar(0.6); game.sfx?.('hit_metal', 0.22, 0.8); } else { k.vel.set(0, 0, 0); k.spin.set(0, 0, 0); k.rest = true; k.mesh.rotation.z = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); } }
      }
      if (p.z < -1.7) { p.z = -1.7; k.vel.z = 0; }
      if (p.z > 0.2 && p.y < 1.0) { p.z = 0.2; k.vel.z *= -0.2; }
      // cans pushing cans
      for (const o of c.cans) {
        if (o === k) continue;
        const d = o.mesh.position.distanceTo(p);
        if (d < 0.2 && d > 0.001 && k.vel.lengthSq() > 1.2 && (!o.out || o.vel.lengthSq() < k.vel.lengthSq())) {
          if (!o.out) { o.out = true; o.rest = false; }
          o.vel.addScaledVector(k.vel, 0.6); o.vel.y += 0.4; k.vel.multiplyScalar(0.7);
          o.spin.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
        }
      }
    }
    if (sess) {
      const moving = c.cans.some((k) => k.out && !k.rest && k.mesh.position.y > 0.12);
      if (!ball.on && sess.balls <= 0) {
        sess.settle = (sess.settle || 0) + dt;
        if (sess.settle > 2.6 || (!moving && sess.settle > 1.0)) return knockedCount(c);
      }
      sess.count = knockedCount(c);
    }
    return null;
  }

  // ---------------------------------------------------------------- gallery
  function galleryTargets(dt, c, sess) {
    for (const g of c.targets) {
      const row = GALLERY.rows[g.row];
      const w = row.speed / row.span, x = row.span * Math.sin(w * clock + g.phase);
      g.down = Math.max(0, g.down - dt);
      const flip = g.down > 0 ? Math.min(1, (GALLERY.downSec - g.down) * 6, g.down * 6) : 0;
      g.g.position.set(x, row.y - flip * 0.35, row.z);
      g.g.rotation.x = -flip * 1.35;
      g.vis = flip;
    }
    if (!sess) return null;
    sess.cd = Math.max(0, sess.cd - dt);
    const left = GALLERY.roundSec - (clock - sess.t0);
    sess.left = left;
    return left <= 0 ? Math.max(0, sess.score) : null;
  }
  function galleryShoot(c, sess, root) {
    if (sess.cd > 0) return;
    sess.cd = RATE;
    aimLocal(root);
    game.sfx?.('spark', 0.35, 1.7);
    if (Math.abs(dirL.z) < 1e-4) return;
    let best = null, bd = 1e9;
    for (const g of c.targets) {
      if (g.down > 0.2) continue;
      const tt = (g.g.position.z - eyeL.z) / dirL.z;
      if (tt <= 0) continue;
      const hx = eyeL.x + dirL.x * tt - g.g.position.x, hy = eyeL.y + dirL.y * tt - g.g.position.y;
      if (Math.hypot(hx, hy) < g.r * 1.02 && tt < bd) { bd = tt; best = g; }
    }
    if (best) {
      best.down = GALLERY.downSec;
      const row = GALLERY.rows[best.row];
      if (best.decoy) { sess.score = Math.max(0, sess.score - GALLERY.decoyPenalty); say(tf('Decoy! -{n}', { n: GALLERY.decoyPenalty }), 'bad'); game.sfx?.('ui_error', 0.4); }
      else { sess.score += row.pts; game.sfx?.('arcade_score', 0.4, 1 + row.pts * 0.06); }
    }
  }

  // ---------------------------------------------------------------- strength
  function strengthLights(c, val) {
    c.segs.forEach((s, i) => { s.mesh.material.color.copy(val >= (i + 1) / STRENGTH.segs - 0.001 ? s.on : s.off); });
  }
  function strengthUpdate(dt, c, sess) {
    const puckY = (v) => 1.2 + v * (STRENGTH.towerH - 1.2 - 0.55);
    if (!sess) { // idle: puck rests, lights off
      c.puck.position.y = 1.2; strengthLights(c, 0); c.mallet.rotation.x = 0; c.bell.scale.setScalar(1); return null;
    }
    if (sess.state === 'meter') {
      sess.phase += dt * (Math.PI * 2) / sess.period;
      sess.val = 0.5 - 0.5 * Math.cos(sess.phase);
      c.mallet.rotation.x = -0.9;
    } else if (sess.state === 'anim') {
      sess.anim += dt;
      const a = Math.min(1, sess.anim / 0.9), ease = 1 - Math.pow(1 - a, 2.2), v = sess.power * ease;
      c.puck.position.y = puckY(v); strengthLights(c, v);
      c.mallet.rotation.x = sess.anim < 0.18 ? -0.9 + (sess.anim / 0.18) * 1.6 : 0.7 - Math.min(1, (sess.anim - 0.18) * 2) * 0.7;
      if (sess.power >= 0.985 && a >= 1) c.bell.scale.setScalar(1 + Math.abs(Math.sin(sess.anim * 22)) * 0.35);
      if (sess.anim >= 1.7) {
        if (sess.swings <= 0) return Math.round(sess.best * 100);
        sess.state = 'ready'; c.puck.position.y = 1.2; strengthLights(c, 0); c.bell.scale.setScalar(1); c.mallet.rotation.x = 0;
      }
    } else { c.mallet.rotation.x = -0.9; }
    return null;
  }
  function strengthFire(c, sess) {
    if (sess.state === 'ready') { sess.state = 'meter'; sess.phase = 0; sess.period = [1.15, 0.95, 0.8][SWINGS - sess.swings] || 0.8; game.sfx?.('ui_click', 0.4); return; }
    if (sess.state === 'meter') {
      sess.power = sess.val; sess.best = Math.max(sess.best, sess.power); sess.swings--; sess.state = 'anim'; sess.anim = 0;
      game.sfx?.('swing_whoosh', 0.7);
      setTimeout(() => { game.sfx?.('thud_heavy', 0.55); }, 180);
      if (sess.power >= 0.985) setTimeout(() => game.sfx?.('slot_jackpot', 0.5), 900);
    }
  }

  // ---------------------------------------------------------------- api
  function start(booth, sid) {
    const c = carnival();
    if (!c) return false;
    cancel(true);
    S = { booth, sid, t0: clock };
    if (booth === 'cans') { cansReset(c.booths.cans); Object.assign(S, { balls: 3, count: 0, cool: 0 }); }
    if (booth === 'gallery') Object.assign(S, { score: 0, cd: 0.6, left: GALLERY.roundSec });
    if (booth === 'strength') Object.assign(S, { swings: SWINGS, best: 0, state: 'ready', val: 0, phase: 0, period: 1.1, power: 0, anim: 0 });
    return true;
  }
  function cancel(silent) {
    const c = carnival();
    if (S && c && S.booth === 'cans') { c.booths.cans.ballMesh.visible = false; ball.on = false; }
    if (S && !silent) say(t('Round cancelled.'), 'info');
    S = null;
  }
  function fire() {
    const c = carnival();
    if (!S || !c) return false;
    const root = c.root;
    if (S.booth === 'cans') {
      if (ball.on || S.balls <= 0 || S.cool > 0) return true;
      aimLocal(root);
      ball.on = true; ball.age = 0; ball.p.copy(eyeL).addScaledVector(dirL, 0.4).y -= 0.15;
      ball.v.copy(dirL).multiplyScalar(BALL_SPEED); ball.v.y += 1.3;
      S.balls--; S.cool = 0.45;
      const b = c.booths.cans;
      b.ballMesh.visible = true; b.ballMesh.position.copy(ball.p);
      if (b.ballRack[S.balls]) b.ballRack[S.balls].visible = false;
      game.sfx?.('item_throw', 0.6);
    } else if (S.booth === 'gallery') galleryShoot(c.booths.gallery, S, root);
    else if (S.booth === 'strength') strengthFire(c.booths.strength, S);
    return true;
  }
  function update(dt) {
    dt = Math.min(dt, 0.05);
    clock += dt;
    const c = carnival();
    if (!c) return;
    const B = c.booths;
    let done = null;
    galleryTargets(dt, B.gallery, S?.booth === 'gallery' ? S : null);
    if (S?.booth === 'gallery' && S.left <= 0) done = Math.max(0, S.score);
    if (S?.booth === 'cans') { S.cool = Math.max(0, S.cool - dt); const r = cansUpdate(dt, B.cans, S); if (r !== null) done = r; }
    else if (!S) cansUpdate(dt, B.cans, null);
    const sr = strengthUpdate(dt, B.strength, S?.booth === 'strength' ? S : null);
    if (sr !== null && S?.booth === 'strength') done = sr;
    if (S && done !== null) { const s = S; S = null; finish(s.booth, s.sid, done); }
  }
  function hud() {
    if (!S) return '';
    if (S.booth === 'cans') return `${t('CAN KNOCKDOWN')}  ${t('Cans')} ${S.count || 0}/6  ${t('Balls')} ${S.balls}`;
    if (S.booth === 'gallery') return `${t('SHOOTING GALLERY')}  ${t('Score')} ${S.score}  ${t('Time')} ${Math.max(0, Math.ceil(S.left))}`;
    const bar = S.state === 'meter' ? ` <span class="ar-bar"><i style="left:${Math.round(S.val * 100)}%"></i></span>` : '';
    return `${t('STRENGTH TESTER')}  ${t('Swing')} ${SWINGS - S.swings + (S.state === 'ready' ? 1 : 0)}/${SWINGS}  ${t('Best')} ${Math.round(S.best * 100)}${bar}`;
  }
  return { start, fire, update, cancel, hud, get active() { return S; }, get clock() { return clock; } };
}
