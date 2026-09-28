// MIRROR DIMENSION - the local Vampire-Survivors kit: auto-bolt, orbiting shards, fire aura, dash, XP crystals, dimension level and
// the 3-card upgrade choice. Runs on the client of every player inside (upgrades are local); damage goes to the host as batched
// `mr` `hit` requests that the host validates. Pure numbers live in mirror_upgrades.js.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { t, tf } from '../core/i18n.js';
import { UPGRADES, UPGRADE_IDS, newProgress, xpToNext, addXp, rollChoices, applyChoice, derive, describe, MAX_LEVEL } from './mirror_upgrades.js';

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
const DASH_T = 0.18, PICK_S = 7;

export function createCombat(ctx) {
  const { game, vis, ui } = ctx;
  const C = {
    prog: newProgress(), stats: derive({}), crystals: [], bolts: [], shardAng: 0, shards: [], hitCd: new Map(),
    boltT: 0.6, auraT: 0, dashT: 0, dashCd: 0, dashDir: new THREE.Vector3(), iframes: 0, queue: new Map(), flushT: 0,
    pending: 0, choices: null, pickT: 0, heal: 0, healT: 0, keyOff: null, dmgDealt: 0,
  };
  const p = () => game.player;

  function recompute() { C.stats = derive(C.prog.owned); game.refreshStats?.(); }
  function reset() {
    C.prog = newProgress(); C.stats = derive({}); C.crystals.length = 0; C.bolts.length = 0; C.hitCd.clear(); C.queue.clear();
    C.pending = 0; C.choices = null; C.iframes = 0; C.dashT = 0; C.dashCd = 0; C.boltT = 0.6; C.heal = 0; C.dmgDealt = 0;
    ui.hideCards(); vis.clear(); game.refreshStats?.();
  }

  // ---------------------------------------------------------------- targets = live dimension creatures (client views)
  function* mobs() {
    for (const v of game.creatures.views.values()) if (ctx.isMob(v.id) && v.state !== 'dead' && v.root.parent) yield v;
  }
  function hit(v, dmg) {
    dmg = Math.max(1, Math.round(dmg * C.stats.dmgMul));
    C.queue.set(v.id, (C.queue.get(v.id) || 0) + dmg);
    C.dmgDealt += dmg;
    if (C.stats.lifesteal > 0) C.heal += dmg * C.stats.lifesteal;
  }
  function flush(dt) {
    C.flushT -= dt;
    if (C.flushT > 0 || !C.queue.size) return;
    C.flushT = 0.12;
    const h = [];
    for (const [id, d] of C.queue) { h.push([id, Math.min(60, d)]); if (h.length >= 14) break; }
    C.queue.clear();
    ctx.netReq('hit', { h });
  }

  // ---------------------------------------------------------------- weapons
  function updateBolts(dt, eye) {
    C.boltT -= dt;
    if (C.boltT <= 0) {
      const st = C.stats;
      const cand = [];
      for (const v of mobs()) {
        const d = v.pos.distanceTo(eye);
        if (d > st.boltRange) continue;
        V.set(v.pos.x, v.pos.y + v.height * 0.55, v.pos.z);
        if (v.type !== 'mr_ghost' && !game.physics.lineOfSight(eye, V, G.STATIC | G.DOOR)) continue;
        cand.push({ v, d });
      }
      if (cand.length) {
        cand.sort((a, b) => a.d - b.d);
        C.boltT = st.boltCd;
        for (let i = 0; i < st.bolts && C.bolts.length < 36; i++) {
          const tg = cand[i % cand.length].v;
          V.set(tg.pos.x, tg.pos.y + tg.height * 0.55, tg.pos.z).sub(eye);
          const len = V.length() || 1;
          V.multiplyScalar(1 / len);
          // extra bolts fan out a little so a volley is visible
          const spread = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.09;
          C.bolts.push({ x: eye.x, y: eye.y - 0.25, z: eye.z, dx: V.x + spread * V.z, dy: V.y, dz: V.z - spread * V.x, life: 1.1 });
        }
        ctx.snd(['spark', 'swing_whoosh'], 0.25, null, 1.5 + Math.random() * 0.3);
      } else C.boltT = 0.25;
    }
    const alive = [];
    const list = [...mobs()];
    for (const b of C.bolts) {
      b.life -= dt;
      const step = 26 * dt;
      V2.set(b.dx, b.dy, b.dz).normalize();
      V3.set(b.x, b.y, b.z);
      const wall = game.physics.raycast(V3, V2, step + 0.2, G.STATIC | G.DOOR);
      b.x += V2.x * step; b.y += V2.y * step; b.z += V2.z * step;
      let used = !!wall || b.life <= 0;
      if (!used) {
        for (const v of list) {
          const dx = v.pos.x - b.x, dz = v.pos.z - b.z;
          const r = v.radius + 0.35;
          if (dx * dx + dz * dz < r * r && b.y > v.pos.y - 0.3 && b.y < v.pos.y + v.height + 0.3) { hit(v, C.stats.boltDmg); game.particles?.burst?.(V.set(b.x, b.y, b.z), 'sparks', null, 0.5); used = true; break; }
        }
      }
      if (!used) alive.push(b);
    }
    C.bolts = alive;
    vis.drawBolts(C.bolts);
  }

  function updateShards(dt, pos, now) {
    const st = C.stats;
    C.shards.length = 0;
    if (!st.shards) return;
    C.shardAng += st.shardSpin * dt;
    const list = [...mobs()];
    for (let i = 0; i < st.shards; i++) {
      const a = C.shardAng + (i / st.shards) * Math.PI * 2;
      const s = { x: pos.x + Math.cos(a) * st.shardR, y: pos.y + 1.0 + Math.sin(a * 2 + i) * 0.15, z: pos.z + Math.sin(a) * st.shardR, a };
      C.shards.push(s);
      for (const v of list) {
        const dx = v.pos.x - s.x, dz = v.pos.z - s.z, r = v.radius + 0.5;
        if (dx * dx + dz * dz > r * r || s.y < v.pos.y - 0.4 || s.y > v.pos.y + v.height + 0.4) continue;
        const key = i + ':' + v.id;
        if ((C.hitCd.get(key) || 0) > now) continue;
        C.hitCd.set(key, now + 0.55);
        hit(v, st.shardDmg);
      }
    }
    if (C.hitCd.size > 300) for (const [k, t0] of C.hitCd) if (t0 < now) C.hitCd.delete(k);
    vis.drawShards(C.shards);
  }

  function updateAura(dt, pos) {
    const a = C.stats.aura;
    vis.setAura(pos.x, pos.y, pos.z, a ? a.r * (0.97 + 0.03 * Math.sin(game.time * 9)) : 0);
    if (!a) return;
    C.auraT -= dt;
    if (C.auraT > 0) return;
    C.auraT = a.tick;
    for (const v of mobs()) {
      const dx = v.pos.x - pos.x, dz = v.pos.z - pos.z, r = a.r + v.radius;
      if (dx * dx + dz * dz < r * r && Math.abs(v.pos.y - pos.y) < 2.6) hit(v, a.dmg);
    }
  }

  // ---------------------------------------------------------------- dash
  function updateDash(dt, input) {
    const pl = p(), d = C.stats.dash;
    C.iframes = Math.max(0, C.iframes - dt);
    C.dashCd = Math.max(0, C.dashCd - dt);
    if (!d) { ui.setDash(null); return; }
    ui.setDash(1 - C.dashCd / d.cd);
    if (C.dashT > 0) {
      C.dashT -= dt;
      const sp = d.dist / DASH_T;
      pl.vel.x = C.dashDir.x * sp; pl.vel.z = C.dashDir.z * sp;
      return;
    }
    if (C.dashCd <= 0 && input.enabled && (input.codePressed('KeyN'))) {
      let mx = 0, mz = 0;
      if (input.isDown('forward')) mz -= 1;
      if (input.isDown('back')) mz += 1;
      if (input.isDown('left')) mx -= 1;
      if (input.isDown('right')) mx += 1;
      const yaw = pl.yaw, sin = Math.sin(yaw), cos = Math.cos(yaw);
      if (!mx && !mz) mz = -1;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      // wish direction exactly like LocalPlayer (input.isDown is already mirrored while inside)
      C.dashDir.set(mx * cos + mz * sin, 0, -mx * sin + mz * cos).normalize();
      C.dashT = DASH_T; C.dashCd = d.cd; C.iframes = d.iframes;
      game.engine.punch?.(-0.02, 0, 0);
      ctx.snd(['swing_whoosh', 'jump'], 0.5, null, 1.4);
    }
  }

  // ---------------------------------------------------------------- crystals + XP + levels
  function addCrystal(pos, xp, gold) { C.crystals.push({ x: pos.x, y: pos.y, z: pos.z, xp, gold: !!gold, t: Math.random() * 6, v: 0, age: 0 }); if (C.crystals.length > 160) C.crystals.shift(); }
  function updateCrystals(dt, pos) {
    const R = C.stats.magnet;
    for (let i = C.crystals.length - 1; i >= 0; i--) {
      const c = C.crystals[i];
      c.age += dt;
      const dx = pos.x - c.x, dy = pos.y + 0.9 - c.y, dz = pos.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d < R || c.pulled) {
        c.pulled = true;
        c.v = Math.min(22, c.v + 46 * dt);
        const k = Math.min(1, (c.v * dt) / Math.max(d, 0.01));
        c.x += dx * k; c.y += dy * k; c.z += dz * k;
      }
      if (d < 0.75 || c.age > 120) { if (d < 0.75) collect(c); C.crystals.splice(i, 1); }
    }
    vis.drawCrystals(C.crystals, game.time);
  }
  function collect(c) {
    ctx.snd(['ui_notify', 'ui_confirm'], 0.18, null, 1.6 + Math.random() * 0.4);
    const gained = addXp(C.prog, c.xp);
    if (gained > 0) {
      C.pending += gained;
      ctx.snd(['ui_levelup'], 0.7);
      game.engine.flash?.(0x8affd8, 0.25);
      ctx.toast(tf('DIMENSION LEVEL {n}', { n: C.prog.level }), 'good');
    }
  }
  function openCards() {
    C.choices = rollChoices(Math.random, C.prog.owned, 3);
    if (!C.choices.length) { C.pending = 0; C.choices = null; return; }
    C.pickT = PICK_S;
    ui.showCards(C.choices.map((id) => {
      const u = UPGRADES[id], l = C.prog.owned[id] || 0;
      return { id, name: u.name, glyph: u.glyph, color: u.color, lvl: l, desc: tf(u.tpl, u.args(l + 1)) };
    }), pick, 'LEVEL UP');
  }
  function pick(i) {
    if (!C.choices) return;
    const id = C.choices[Math.max(0, Math.min(C.choices.length - 1, i))];
    C.prog.owned = applyChoice(C.prog.owned, id);
    C.choices = null; C.pending = Math.max(0, C.pending - 1);
    ui.hideCards();
    recompute();
    ctx.snd(['ui_confirm', 'heal'], 0.6);
    ctx.toast(`${t(UPGRADES[id].name)}  ${C.prog.owned[id]}`, 'good');
  }

  const onKey = (e) => {
    if (!C.choices || !ui.cardsOpen) return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { e.preventDefault(); e.stopPropagation(); pick(Number(e.code.slice(5)) - 1); }
  };
  window.addEventListener('keydown', onKey, true);

  // ---------------------------------------------------------------- per frame
  function update(dt, input) {
    const pl = p();
    if (!pl || pl.dead) { vis.setAura(0, 0, 0, 0); return; }
    const now = game.time;
    if (C.choices) {   // choosing: the world runs, but the player is protected (localHurt scales the damage) and the timer auto-picks
      C.pickT -= dt;
      if (C.pickT <= 0) pick(Math.floor(Math.random() * C.choices.length));
    } else if (C.pending > 0) openCards();
    updateDash(dt, input);
    const eye = pl.eyePos();
    updateBolts(dt, eye);
    updateShards(dt, pl.pos, now);
    updateAura(dt, pl.pos);
    updateCrystals(dt, pl.pos);
    flush(dt);
    // lifesteal (batched)
    C.healT -= dt;
    if (C.heal >= 1 && C.healT <= 0) {
      C.healT = 0.4;
      const h = Math.min(12, Math.floor(C.heal)); C.heal = 0;
      pl.hp = Math.min(game.stats.maxHp, pl.hp + h);
      game.net.send('pst', { hp: Math.round(pl.hp) });
    }
    ui.setChips(UPGRADE_IDS.filter((id) => C.prog.owned[id]).map((id) => ({ glyph: UPGRADES[id].glyph, color: UPGRADES[id].color, lvl: C.prog.owned[id], name: UPGRADES[id].name })));
  }

  /** localHurt hook: dash i-frames + protection while the cards are open */
  function hurt(d) {
    if (C.iframes > 0) d.dmg = 0;
    else if (C.choices) d.dmg *= 0.15;
  }
  /** 'stats' hook: dimension upgrades on top of the profile stats */
  function stats(s) {
    s.speedMul *= C.stats.speedMul;
    s.meleeMul *= C.stats.dmgMul;
    if (s.rangedMul) s.rangedMul *= C.stats.dmgMul;
  }

  return {
    C, update, reset, hurt, stats, addCrystal, pick,
    get level() { return C.prog.level; }, get xp() { return C.prog.xp; }, get owned() { return C.prog.owned; },
    xpNeed: () => xpToNext(C.prog.level), get choosing() { return !!C.choices; },
    /** debug / tests */
    grantXp(n) { collect({ xp: n }); },
    give(id) { C.prog.owned = applyChoice(C.prog.owned, id); recompute(); },
    describe, MAX_LEVEL,
    dispose() { window.removeEventListener('keydown', onKey, true); vis.clear(); },
  };
}
