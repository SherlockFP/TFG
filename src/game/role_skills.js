// TFG wave 2 - ROLE ACTIVE SKILLS (docs/wave2/combat.md). Two abilities per role (roles: rpg.js) on keys Y and U, with a cooldown HUD
// (hudDock 'bottom'). Cooldowns scale with rpg bonus('cooldown'); damage with the player's melee / ranged multipliers.
//   scout       Y Dash            U Sonar Pulse (see creatures through walls 6 s)
//   hauler      Y Ground Slam     U Adrenaline Lift (carry weight ignored + faster, 8 s)
//   technician  Y Mini-Turret     U Overclock (lockpick / fuse / safe minigames succeed instantly, 8 s)
//   medic       Y Heal Beam       U Revive Pulse (heals the area, revives one dead crewmate near their body)
//   occultist   Y Mana Surge      U Soul Link (damage is shared with linked crewmates, 10 s)
//   enforcer    Y Charge          U War Cry (staggers everything within 8 m, loud)
// Net: request 'cbskill' { op, ... } (host validates range / rate / caps), results ride fx { k: 'cb', t: ... }.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { addTranslations, t, getLang } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { createMiniTurretMesh } from '../models/combat_wave2.js';
import { clamp, fin3, arr3, synth, sin, ex, nz, hex } from './combat_kit.js';

// [ux] wave 3: every active skill 300 s (5 min); Revive Pulse 600 s (10 min).
export const ROLE_SKILLS = {
  scout: [{ id: 'dash', name: 'Dash', cd: 300, desc: 'A quick burst of speed in the direction you move.' }, { id: 'sonar', name: 'Sonar Pulse', cd: 300, desc: 'Marks every creature within 35 m through walls for 6 s.' }],
  hauler: [{ id: 'slam', name: 'Ground Slam', cd: 300, desc: 'Shockwave: 5 m, damages and staggers what is around you.' }, { id: 'lift', name: 'Adrenaline Lift', cd: 300, desc: 'For 8 s heavy loads do not slow you and you run 12% faster.' }],
  technician: [{ id: 'turret', name: 'Mini-Turret', cd: 300, desc: 'Deploys a turret for 25 s that shoots the nearest creature (noisy).' }, { id: 'overclock', name: 'Overclock', cd: 300, desc: 'For 8 s lockpick, fuse and safe panels open instantly.' }],
  medic: [{ id: 'beam', name: 'Heal Beam', cd: 300, desc: 'Heals the crewmate you look at (or yourself) by ~35 HP.' }, { id: 'revive', name: 'Revive Pulse', cd: 600, desc: 'Heals crew within 10 m and revives one dead crewmate lying near you.' }],
  occultist: [{ id: 'surge', name: 'Mana Surge', cd: 300, desc: 'Restores 60 mana (Blood Magic: heals 40 HP instead).' }, { id: 'link', name: 'Soul Link', cd: 300, desc: 'For 10 s damage taken by you or linked crewmates within 14 m is shared.' }],
  enforcer: [{ id: 'charge', name: 'Charge', cd: 300, desc: 'Rush forward, staggering and hitting everything in your path.' }, { id: 'cry', name: 'War Cry', cd: 300, desc: 'Staggers every creature within 8 m. Very loud.' }],
};
const COLORS = { scout: 0x4fd8ff, hauler: 0xff6bb0, technician: 0x5b8cff, medic: 0x55f08a, occultist: 0xb06bff, enforcer: 0xff4d3d };

addTranslations({
  Dash: 'Atılma', 'Sonar Pulse': 'Sonar Darbesi', 'Ground Slam': 'Yer Ezmesi', 'Adrenaline Lift': 'Adrenalin Kaldırışı', 'Mini-Turret': 'Mini Taret', Overclock: 'Hız Aşırtma',
  'Heal Beam': 'Şifa Işını', 'Revive Pulse': 'Diriltme Darbesi', 'Mana Surge': 'Mana Dalgası', 'Soul Link': 'Ruh Bağı', Charge: 'Hücum', 'War Cry': 'Savaş Çığlığı',
  'A quick burst of speed in the direction you move.': 'Gittiğin yönde ani hız patlaması.', 'Marks every creature within 35 m through walls for 6 s.': '35 m içindeki her yaratığı duvarların ardından 6 sn işaretler.',
  'Shockwave: 5 m, damages and staggers what is around you.': 'Şok dalgası: 5 m, çevrendekilere hasar verir ve sendeletir.', 'For 8 s heavy loads do not slow you and you run 12% faster.': '8 sn ağır yükler yavaşlatmaz ve %12 daha hızlı koşarsın.',
  'Deploys a turret for 25 s that shoots the nearest creature (noisy).': '25 sn boyunca en yakın yaratığı vuran bir taret kurar (gürültülü).', 'For 8 s lockpick, fuse and safe panels open instantly.': '8 sn boyunca maymuncuk, sigorta ve kasa panelleri anında açılır.',
  'Heals the crewmate you look at (or yourself) by ~35 HP.': 'Baktığın ekip arkadaşını (ya da kendini) ~35 CP iyileştirir.', 'Heals crew within 10 m and revives one dead crewmate lying near you.': '10 m içindeki ekibi iyileştirir ve yakınında yatan bir ölü arkadaşı diriltir.',
  'Restores 60 mana (Blood Magic: heals 40 HP instead).': '60 mana yeniler (Kan Büyüsü: bunun yerine 40 CP iyileştirir).', 'For 10 s damage taken by you or linked crewmates within 14 m is shared.': '10 sn boyunca sen ve 14 m içindeki bağlı ekip arkadaşlarının aldığı hasar paylaşılır.',
  'Rush forward, staggering and hitting everything in your path.': 'İleri atıl, yolundaki her şeyi sendeletip vur.', 'Staggers every creature within 8 m. Very loud.': '8 m içindeki her yaratığı sendeletir. Çok gürültülü.',
  'Not ready': 'Hazır değil', 'No role': 'Rol yok', 'Overclocked!': 'Hız aşırtıldı!', 'Revived by': 'Diriltildi:', 'Soul Link active': 'Ruh Bağı aktif', 'No one to link.': 'Bağlanacak kimse yok.',
});

const tone = (f0, f1, dur, noise = 0.2) => (sr) => synth(sr, dur, (tt) => { const u = tt / dur; return (sin(f0 + (f1 - f0) * u, tt) * (1 - u) + nz() * noise * (1 - u)) * Math.min(1, tt * 60); });
const SOUNDS = {
  rs_dash: tone(700, 200, 0.28, 0.5), rs_slam: (sr) => synth(sr, 0.6, (tt) => sin(55 - 20 * tt, tt) * ex(tt, 6) * 1.2 + nz() * ex(tt, 14) * 0.8),
  rs_sonar: tone(1200, 400, 0.7, 0.05), rs_turret: tone(300, 500, 0.3, 0.1), rs_shot: (sr) => synth(sr, 0.1, (tt) => (nz() * 0.6 + sin(700, tt)) * ex(tt, 50)),
  rs_over: tone(300, 1500, 0.5, 0.05), rs_heal: (sr) => synth(sr, 0.7, (tt) => (sin(660, tt) + sin(880, tt) * 0.5) * Math.sin(Math.PI * Math.min(1, tt / 0.7)) * 0.6),
  rs_revive: (sr) => synth(sr, 1.2, (tt) => { let v = 0; [523, 659, 784, 1046].forEach((f, k) => { const u = tt - k * 0.12; if (u > 0) v += ex(u, 3) * sin(f, u); }); return v; }),
  rs_surge: tone(200, 900, 0.5, 0.05), rs_link: tone(440, 660, 0.5, 0.02), rs_charge: tone(300, 120, 0.4, 0.7),
  rs_cry: (sr) => synth(sr, 0.9, (tt) => (sin(110 + 40 * Math.sin(tt * 30), tt) * 0.8 + sin(220, tt) * 0.4 + nz() * 0.4) * Math.sin(Math.PI * Math.min(1, tt / 0.9)) * 1.1),
};

const CSS = `.rs{display:flex;gap:8px;font-family:var(--font,monospace);pointer-events:none}
.rs-c{position:relative;width:92px;height:40px;padding:0 4px 0 12px;box-sizing:border-box;border:1px solid var(--rc);background:rgba(6,10,22,.78);color:var(--rc);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 8px rgba(0,0,0,.6)}
.rs-c b{font-size:11px;letter-spacing:.5px;color:#fff;text-shadow:0 0 4px #000;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}/* [checkup] long names used to wrap under the key letter */.rs-c span{font-size:14px;line-height:1}
.rs-c i{position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,.72) var(--cd,0%),transparent 0)}
.rs-c u{position:absolute;left:2px;top:-1px;font-size:14px;text-decoration:none;color:#fff}
.rs-c.rdy{animation:rsr .5s ease-out}@keyframes rsr{0%{box-shadow:0 0 16px var(--rc)}100%{box-shadow:inset 0 0 8px rgba(0,0,0,.6)}}`;

export function installRoleSkills(g, K) {
  K.sounds(SOUNDS);
  if (typeof document !== 'undefined' && !document.getElementById('tfg-roleskills-css')) { const s = document.createElement('style'); s.id = 'tfg-roleskills-css'; s.textContent = CSS; document.head.appendChild(s); }
  const bonus = (k) => { try { const v = Number(g.rpg?.bonus?.(k)); return Number.isFinite(v) ? v : 0; } catch { return 0; } };
  const api = { debugRole: null, cds: new Map() };
  const roleId = () => api.debugRole || g.rpg?.role?.() || null;
  const skillsOf = () => ROLE_SKILLS[roleId()] || null;
  // owner rule: abilities 5 min, revive 10 min; no role / tree bonus may bring them below 3 min / 7 min
  const CD_FLOOR = { revive: 420 }, CD_FLOOR_DEFAULT = 180;
  const cdOf = (sk) => Math.max(Math.min(sk.cd, CD_FLOOR[sk.id] || CD_FLOOR_DEFAULT), sk.cd * (1 - clamp(bonus('cooldown'), 0, 0.5)));
  const mmss = (sec) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const S = { dashT: 0, dashDir: new THREE.Vector3(), dashSp: 26, dashHits: null, liftT: 0, ocT: 0, sonarT: 0, link: null };
  const flat = () => { const f = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)); return f; };
  const meleeMul = () => clamp(g.stats.meleeMul || 1, 0.5, 2.5), rangedMul = () => clamp(g.stats.rangedMul || 1, 0.5, 2.5);
  const heal = (n, from) => { const p = g.player; if (p.dead || n <= 0) return; p.hp = Math.min(p.maxHp, p.hp + n); g.net.send('pst', { hp: Math.round(p.hp) }); g.engine.flash?.(0x55f08a, 0.2); if (from) g.ui?.toast?.(`+${Math.round(n)} HP`, 'good'); };

  // ---------------------------------------------------------------- HUD
  const box = hudDock('bottom', 'roleskills', 22);
  box.innerHTML = '<div class="rs"></div>';
  const row = box.firstChild;
  let cells = [], builtFor = null;
  const build = () => {
    const sk = skillsOf();
    builtFor = roleId();
    row.innerHTML = '';
    cells = [];
    if (!sk) { box.style.display = 'none'; return; }
    box.style.display = '';
    sk.forEach((s, i) => {
      const e = document.createElement('div');
      e.className = 'rs-c'; e.style.setProperty('--rc', hex(COLORS[builtFor] || 0x9fd4ff));
      e.innerHTML = `<u>${i ? 'U' : 'Y'}</u><b>${t(s.name).toLocaleUpperCase(getLang()).slice(0, 10)}</b><span></span><i></i>`;
      e.title = t(s.name) + ' - ' + t(s.desc);
      row.appendChild(e);
      cells.push({ e, cd: e.querySelector('i'), sp: e.querySelector('span'), ready: true });
    });
  };
  let hudT = 0;

  // ---------------------------------------------------------------- casting
  function use(slot) {
    const sk = skillsOf()?.[slot];
    const p = g.player;
    if (!sk || p.dead || !g.run) return false;
    const left = (api.cds.get(sk.id) || 0) - g.time;
    if (left > 0) { g.ui?.toast?.(`${t(sk.name)}: ${mmss(left)}`, 'info'); return false; }
    const ok = SKILL_FN[sk.id]?.();
    if (ok === false) return false;
    api.cds.set(sk.id, g.time + cdOf(sk));
    return true;
  }
  K.update((dt) => {
    if (builtFor !== roleId()) build();
    const input = g.input;
    if (input.enabled && !g.player.dead && !g.minigame && !g.terminal?.active && !g.rpsPromptOpen?.()) {
      if (input.pressed('roleSkill1')) use(0);
      if (input.pressed('roleSkill2')) use(1);
    }
    hudT -= dt;
    if (hudT <= 0 && cells.length) {
      hudT = 1 / 15;
      const sk = skillsOf();
      cells.forEach((c, i) => {
        const s = sk?.[i]; if (!s) return;
        const left = Math.max(0, (api.cds.get(s.id) || 0) - g.time), f = left > 0 ? clamp(left / cdOf(s), 0, 1) : 0;
        c.cd.style.setProperty('--cd', (f * 100).toFixed(1) + '%');
        c.sp.textContent = left > 0 ? mmss(left) : '';
        const rdy = left <= 0;
        if (rdy && !c.ready) { c.e.classList.remove('rdy'); void c.e.offsetWidth; c.e.classList.add('rdy'); }
        c.ready = rdy;
      });
    }
    if (S.sonarT > 0) sonarTick(dt);
  });

  // ---------------------------------------------------------------- movement effects (Dash / Charge / Adrenaline Lift)
  K.moveMod(() => {
    let speed = 1, carry = 0, vel = null;
    if (S.dashT > g.time) vel = { x: S.dashDir.x * S.dashSp, z: S.dashDir.z * S.dashSp };
    if (S.liftT > g.time) { speed *= 1.12; carry += 9999; }
    return vel || speed !== 1 || carry ? { vel, speed, carry } : null;
  });
  K.update(() => {
    // Charge: collect what we run through, report once at the end
    if (S.dashHits) {
      const p = g.player;
      for (const v of g.creatures.views.values()) {
        if (v.state === 'dead' || v.hidden || S.dashHits.has(v.id)) continue;
        if (Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < (v.radius || 0.5) + 0.9 && Math.abs(v.pos.y - p.pos.y) < 2.2) { S.dashHits.add(v.id); g.hitstopT = Math.max(g.hitstopT || 0, 0.06); g.engine.shake(0.3); K.snd('hit_flesh', null, 0.8); }
      }
      if (g.time >= S.dashT) { const ids = [...S.dashHits]; S.dashHits = null; if (ids.length) g.net.request('cbskill', { op: 'charge', ids: ids.slice(0, 8), mul: +meleeMul().toFixed(2), d: arr3(S.dashDir) }); }
    }
    if (S.liftT > g.time && Math.random() < 0.3) K.burst(g.player.pos.clone().setY(g.player.pos.y + 0.1), { count: 1, color: [0xff6bb0, 0xffffff], speed: 0.4, up: 0.8, life: 0.5, size: 0.05, gravity: -1, drag: 2 }, null, 1);
  });
  // Overclock: minigames succeed at once
  K.wrap(g, 'openMinigame', (orig) => function (name, opts, onDone) {
    if (S.ocT > g.time && ['lockpick', 'fuse', 'safe'].includes(name)) { K.snd('rs_over', null, 0.6); g.ui?.toast?.(t('Overclocked!'), 'good'); try { onDone?.({ success: true }); } catch (e) { console.warn(e); } return undefined; }
    return orig(name, opts, onDone);
  });

  // ---------------------------------------------------------------- the abilities
  const dashDirection = () => {
    const p = g.player, inp = g.input, f = flat(), r = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), d = new THREE.Vector3();
    if (inp.isDown('forward')) d.add(f); if (inp.isDown('back')) d.sub(f); if (inp.isDown('right')) d.add(r); if (inp.isDown('left')) d.sub(r);
    return d.lengthSq() < 0.01 ? f : d.normalize();
  };
  const ring = (pos, color, r0, r1, dur) => K.ring(pos.clone().setY(pos.y + 0.08), color, r0, r1, dur);
  const SKILL_FN = {
    dash() {
      S.dashDir.copy(dashDirection()); S.dashSp = 26; S.dashT = g.time + 0.22;
      K.snd('rs_dash', null, 0.8); g.engine.punch?.(0.03, 0, 0); g.engine.flash?.(0x4fd8ff, 0.12);
      K.burst(g.player.pos.clone().setY(g.player.pos.y + 0.3), { count: 14, color: [0x4fd8ff, 0xffffff], speed: 2.5, up: 0.6, life: 0.4, size: 0.06, gravity: 0, drag: 3 }, S.dashDir.clone().negate(), 1);
    },
    sonar() {
      S.sonarT = 6; K.snd('rs_sonar', null, 0.8);
      K.fx('sonar', { p: arr3(g.player.pos) });
    },
    slam() {
      const p = g.player;
      K.fx('slam2', { p: arr3(p.pos), by: g.selfId });
      g.net.request('cbskill', { op: 'slam', p: arr3(p.pos), mul: +meleeMul().toFixed(2) });
    },
    lift() { S.liftT = g.time + 8; K.snd('rs_surge', null, 0.7); g.engine.flash?.(0xff6bb0, 0.2); g.ui?.toast?.(t('Adrenaline Lift'), 'good'); },
    turret() {
      const p = g.player, f = flat();
      let dist = 1.6;
      const w = g.physics.raycast({ x: p.pos.x, y: p.pos.y + 0.8, z: p.pos.z }, f, dist + 0.4, G.STATIC | G.DOOR);
      if (w) dist = Math.max(0.6, w.distance - 0.4);
      const x = p.pos.x + f.x * dist, z = p.pos.z + f.z * dist;
      const down = g.physics.raycast({ x, y: p.pos.y + 1, z }, { x: 0, y: -1, z: 0 }, 4, G.STATIC | G.DOOR);
      g.net.request('cbskill', { op: 'turret', p: [+x.toFixed(2), +(down ? down.point.y : p.pos.y).toFixed(2), +z.toFixed(2)], yaw: +p.yaw.toFixed(2), mul: +rangedMul().toFixed(2) });
      K.snd('rs_turret', null, 0.7);
    },
    overclock() { S.ocT = g.time + 8; K.snd('rs_over', null, 0.8); g.engine.flash?.(0x5b8cff, 0.25); g.ui?.toast?.(t('Overclocked!'), 'good'); },
    beam() {
      const { eye, dir } = K.eye();
      let to = g.selfId, best = 0.96;
      for (const r of g.remotes.values()) {
        if (r.dead) continue;
        const c = r.pos.clone().setY(r.pos.y + 1.1), tv = c.sub(eye), d = tv.length();
        if (d > 16 || d < 0.3) continue;
        const dot = tv.divideScalar(d).dot(dir);
        if (dot > best && g.physics.lineOfSight(eye, r.pos.clone().setY(r.pos.y + 1.1), G.STATIC | G.DOOR)) { best = dot; to = r.id; }
      }
      const amt = Math.round(35 * (1 + Math.max(0, bonus('reviveSpeed'))) * (to === g.selfId ? 0.6 : 1));
      g.net.request('cbskill', { op: 'heal', to, amt });
    },
    revive() { g.net.request('cbskill', { op: 'revive', p: arr3(g.player.pos), amt: Math.round(35 * (1 + Math.max(0, bonus('reviveSpeed')))) }); K.snd('rs_revive', null, 0.8); },
    surge() {
      if (g.magic?.bloodMagic) heal(40, true); else g.magic?.addMana?.(60);
      K.snd('rs_surge', null, 0.9); g.engine.flash?.(0xb06bff, 0.3); ring(g.player.pos, 0xb06bff, 0.3, 3, 0.6);
      K.burst(g.player.eyePos(), { count: 24, color: [0xb06bff, 0xffffff], speed: 2.5, up: 2, life: 0.8, size: 0.06, gravity: -1, drag: 2 }, null, 1);
    },
    link() {
      const me = g.player, ids = [];
      for (const r of g.remotes.values()) if (!r.dead && r.pos.distanceTo(me.pos) < 14 && ids.length < 3) ids.push(r.id);
      if (!ids.length) { g.ui?.toast?.(t('No one to link.'), 'bad'); return false; }
      g.net.request('cbskill', { op: 'link', ids });
      return undefined;
    },
    charge() {
      S.dashDir.copy(flat()); S.dashSp = 22; S.dashT = g.time + 0.4; S.dashHits = new Set();
      K.snd('rs_charge', null, 0.9); g.engine.punch?.(0.04, 0, 0); g.engine.shake(0.2);
    },
    cry() {
      K.fx('cry', { p: arr3(g.player.pos) });
      g.net.request('cbskill', { op: 'cry', p: arr3(g.player.pos) });
    },
  };

  // ---------------------------------------------------------------- Sonar markers (scout only, client)
  const marks = new Map();
  let markTex = null;
  const markSprite = () => {
    if (!markTex) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d'); x.strokeStyle = '#ff6a5a'; x.lineWidth = 4; x.beginPath(); x.moveTo(16, 3); x.lineTo(29, 16); x.lineTo(16, 29); x.lineTo(3, 16); x.closePath(); x.stroke();
      markTex = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    s.scale.setScalar(0.5); s.renderOrder = 999;
    g.scene.add(s);
    return s;
  };
  function sonarTick(dt) {
    S.sonarT -= dt;
    const me = g.player.pos, live = new Set();
    if (S.sonarT > 0) {
      for (const v of g.creatures.views.values()) {
        if (v.state === 'dead' || v.hidden || v.def?.hazard === true && v.type === 'web' || v.pos.distanceTo(me) > 35) continue;
        live.add(v.id);
        let s = marks.get(v.id);
        if (!s) { s = markSprite(); marks.set(v.id, s); }
        s.position.set(v.pos.x, v.pos.y + (v.height || 1.2) + 0.5, v.pos.z);
        s.scale.setScalar(0.35 + 0.1 * Math.sin(g.time * 8));
        s.material.opacity = clamp(S.sonarT / 1.5, 0, 1);
      }
    }
    for (const [id, s] of marks) if (!live.has(id)) { s.removeFromParent(); s.material.dispose(); marks.delete(id); }
  }
  K.onFx('sonar', (d) => { const p = fin3(d.p); if (p) { ring(p, 0x4fd8ff, 0.5, 35, 0.9); K.snd('rs_sonar', p, 0.6, 1, { max: 40 }); } });
  K.onFx('slam2', (d) => { const p = fin3(d.p); if (!p) return; ring(p, 0xff6bb0, 0.4, 5.2, 0.5); K.burst(p.clone().setY(p.y + 0.2), 'dust', null, 2.2); K.snd('rs_slam', p, 1, 1, { ref: 6 }); K.shake(p, 0.6, 16); });
  K.onFx('cry', (d) => { const p = fin3(d.p); if (!p) return; ring(p, 0xff4d3d, 0.5, 8, 0.6); K.snd('rs_cry', p, 1, 1, { ref: 8 }); K.shake(p, 0.4, 16); g.engine.flash?.(0xff4d3d, 0.12); });

  // ---------------------------------------------------------------- Heal Beam / Revive Pulse / Soul Link (every peer)
  K.onFx('heal', (d) => {
    const a = K.headOf(d.by), b = K.headOf(d.to);
    if (a && b) { K.beam(a, b, 0x55f08a, 0.5, 0.05); K.burst(b, { count: 14, color: [0x55f08a, 0xd8ffe0], speed: 1.3, up: 2, life: 0.9, size: 0.06, gravity: -2, drag: 2 }, null, 1); K.snd('rs_heal', b, 0.8); }
    if (d.to === g.selfId) heal(clamp(Number(d.amt) || 0, 0, 80), d.by !== g.selfId ? d.by : null);
  });
  K.onFx('pulse', (d) => {
    const p = fin3(d.p);
    if (!p) return;
    ring(p, 0x55f08a, 0.5, 10, 0.8); K.burst(p.clone().setY(p.y + 0.6), { count: 30, color: [0x55f08a, 0xffffff], speed: 3, up: 2.5, life: 1, size: 0.07, gravity: -1.5, drag: 2 }, null, 1); K.snd('rs_revive', p, 0.7, 1, { ref: 8 });
    const me = g.player;
    if (!me.dead && me.pos.distanceTo(p) < 10.5) { heal(clamp(Number(d.amt) || 0, 0, 80), d.by !== g.selfId ? d.by : null); me.stunT = 0; me.slowT = 0; }
  });
  K.onFx('revive', (d) => {
    if (d.to !== g.selfId || !g.player.dead) return;
    const p = g.player, at = fin3(d.p);
    g.respawn();
    if (at) p.teleport(at.clone().setY(at.y + 0.2));
    p.hp = Math.max(1, p.maxHp * clamp(Number(d.hp) || 0.3, 0.1, 1));
    g.net.send('pst', { dead: false, hp: Math.round(p.hp) });
    g.engine.flash?.(0xffffff, 0.6);
    g.ui?.toast?.(`${t('Revived by')} ${g.playerName(d.by)}`, 'good');
  });
  K.onFx('link', (d) => {
    const members = [d.by, ...(Array.isArray(d.ids) ? d.ids : [])];
    for (let i = 1; i < members.length; i++) { const a = K.headOf(members[0]), b = K.headOf(members[i]); if (a && b) K.beam(a, b, 0xb06bff, 0.8, 0.04); }
    if (members.includes(g.selfId)) { S.link = { members, until: g.time + (Number(d.dur) || 10) }; g.ui?.toast?.(t('Soul Link active'), 'good'); K.snd('rs_link', null, 0.7); }
  });
  K.onFx('linkhit', (d) => { if (d.to === g.selfId && !g.player.dead) { g.damageLocal(clamp(Number(d.dmg) || 0, 0, 80), 'soullink', null); K.burst(g.player.eyePos(), { count: 8, color: [0xb06bff], speed: 1.5, up: 1, life: 0.5, size: 0.05, gravity: 0, drag: 2 }, null, 1); } });
  K.on('localHurt', (d, gg) => {
    const L = S.link;
    if (gg !== g || !L || g.time > L.until || !d || !(d.dmg > 0) || d.dmg >= 999) return;
    const others = L.members.filter((id) => id !== g.selfId && g.remotes.get(id) && !g.remotes.get(id).dead && g.remotes.get(id).pos.distanceTo(g.player.pos) < 25);
    if (!others.length) return;
    const share = d.dmg / (others.length + 1);
    d.dmg = share;
    for (const id of others) g.net.request('cbskill', { op: 'linkdmg', to: id, dmg: +share.toFixed(1) });
  });

  // ---------------------------------------------------------------- Mini-turret visuals (every peer)
  const turretVis = new Map();
  K.onFx('turret', (d) => {
    const p = fin3(d.p);
    if (!p || typeof d.id !== 'string') return;
    turretVis.get(d.id)?.mesh?.removeFromParent();
    const mesh = createMiniTurretMesh();
    mesh.position.copy(p); mesh.rotation.y = Number(d.yaw) || 0;
    g.scene.add(mesh);
    turretVis.set(d.id, { mesh, until: g.time + (Number(d.life) || 25) });
    ring(p, 0x5b8cff, 0.2, 1.5, 0.4);
  });
  K.onFx('turretoff', (d) => { const v = turretVis.get(d.id); if (v) { K.burst(v.mesh.position.clone().setY(v.mesh.position.y + 0.4), 'sparks', null, 1.5); v.mesh.removeFromParent(); v.mesh.userData.dispose(); turretVis.delete(d.id); } });
  K.onFx('tshot', (d) => {
    const v = turretVis.get(d.id), to = fin3(d.to);
    if (!v || !to) return;
    const head = v.mesh.userData.head, from = v.mesh.position.clone().setY(v.mesh.position.y + 0.5);
    v.mesh.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI; head.rotation.x = 0;
    K.beam(from, to, 0x9fd4ff, 0.06, 0.02); K.burst(to, 'sparks', null, 0.4); K.snd('rs_shot', from, 0.5, 1 + Math.random() * 0.2, { ref: 3 });
  });
  K.update(() => { for (const [id, v] of turretVis) if (g.time > v.until + 1) { v.mesh.removeFromParent(); v.mesh.userData.dispose(); turretVis.delete(id); } });

  // ---------------------------------------------------------------- host: cbskill
  const hostCd = new Map();          // `${peer}|${op}` -> last time
  const hostTurrets = new Map();     // id -> { pos, owner, until, next, mul }
  const hostLinks = new Map();       // owner -> { members:Set, until }
  let turretN = 1;
  const rateOk = (from, op, min) => { const k = from + '|' + op, now = g.time; if (now - (hostCd.get(k) ?? -99) < min) return false; hostCd.set(k, now); return true; };
  K.hostOn('cbskill', (d, from) => {
    const sp = K.posOf(from);
    const near = (p, r) => !sp || !p || Math.hypot(sp.x - p.x, sp.z - p.z) < r;
    switch (d?.op) {
      case 'slam': {
        const p = fin3(d.p);
        if (!p || !near(p, 5) || !rateOk(from, 'slam', 100)) return;
        const m = clamp(Number(d.mul) || 1, 0.5, 2.5);
        for (const { c } of K.creaturesIn(p, 5, { los: true })) {
          K.hurt(c, 24 * m, from, { stun: 1.2 });
          const dx = c.pos.x - p.x, dz = c.pos.z - p.z, L = Math.hypot(dx, dz) || 1;
          K.fling(c, (dx / L) * 9, (dz / L) * 9, from, { slam: 10 });
        }
        g.creatures.noise(p, 2.5);
        K.fx('slam2', { p: arr3(p), by: from });
        return;
      }
      case 'charge': {
        if (!rateOk(from, 'charge', 100)) return;
        const dir = fin3(d.d), m = clamp(Number(d.mul) || 1, 0.5, 2.5);
        for (const id of (Array.isArray(d.ids) ? d.ids : []).slice(0, 8)) {
          const c = g.creatures.host.get(id);
          if (!c || c.dead || (sp && Math.hypot(sp.x - c.pos.x, sp.z - c.pos.z) > 6)) continue;
          K.hurt(c, 20 * m, from, { stun: 1.2 });
          if (dir) K.fling(c, dir.x * 9, dir.z * 9, from, { slam: 12 });
        }
        return;
      }
      case 'cry': {
        const p = fin3(d.p);
        if (!p || !near(p, 5) || !rateOk(from, 'cry', 100)) return;
        for (const { c } of K.creaturesIn(p, 8, { los: false })) K.stun(c, c.def?.boss ? 1.0 : 1.5, from);
        g.creatures.noise(p, 3.5);
        return;
      }
      case 'turret': {
        const p = fin3(d.p);
        if (!p || !near(p, 6) || !rateOk(from, 'turret', 100)) return;
        const mine = [...hostTurrets.entries()].filter(([, v]) => v.owner === from);
        if (mine.length >= 2) { const [oid] = mine[0]; hostTurrets.delete(oid); K.fx('turretoff', { id: oid }); }
        const id = 'mt' + (turretN++);
        hostTurrets.set(id, { pos: p, owner: from, until: g.time + 25, next: g.time + 0.8, mul: clamp(Number(d.mul) || 1, 0.5, 2.5) });
        K.fx('turret', { id, p: arr3(p), yaw: Number(d.yaw) || 0, life: 25 });
        return;
      }
      case 'heal': {
        const to = d.to, tp = K.posOf(to);
        if (!rateOk(from, 'heal', 2.5) || (sp && tp && sp.distanceTo(tp) > 20)) return;
        K.fx('heal', { by: from, to, amt: clamp(Number(d.amt) || 0, 0, 60) });
        return;
      }
      case 'revive': {
        const p = fin3(d.p), amt = clamp(Number(d.amt) || 35, 0, 60);
        if (!p || !near(p, 5) || !rateOk(from, 'revive', 290)) return;
        K.fx('pulse', { p: arr3(p), by: from, amt });
        // one dead crewmate whose body lies within 12 m
        let best = null, bd = 12;
        for (const it of g.items.all()) {
          if (it.type !== 'body') continue;
          const bp = it.obj.position, dd = Math.hypot(bp.x - p.x, bp.z - p.z);
          if (dd >= bd) continue;
          const deadId = [g.selfId, ...g.remotes.keys()].find((id) => (id === g.selfId ? g.player.dead : g.remotes.get(id)?.dead) && g.playerName(id) === it.label);
          if (deadId) { bd = dd; best = { it, id: deadId, pos: bp.clone() }; }
        }
        if (best) {
          g.net.broadcast('it', { e: 'rm', id: best.it.id });
          const deaths = g.hostData?.dayStats?.deaths;
          if (Array.isArray(deaths)) { const i = deaths.map((x) => x.id).lastIndexOf(best.id); if (i >= 0) deaths.splice(i, 1); }
          K.fx('revive', { to: best.id, by: from, p: arr3(best.pos), hp: 0.3 });
        }
        return;
      }
      case 'link': {
        if (!rateOk(from, 'link', 100)) return;
        const ids = (Array.isArray(d.ids) ? d.ids : []).filter((id) => typeof id === 'string' && g.remotes.has(id)).slice(0, 3);
        if (!ids.length) return;
        hostLinks.set(from, { members: new Set([from, ...ids]), until: g.time + 10 });
        K.fx('link', { by: from, ids, dur: 10 });
        return;
      }
      case 'linkdmg': {
        const dmg = clamp(Number(d.dmg) || 0, 0, 80);
        for (const L of hostLinks.values()) if (g.time < L.until && L.members.has(from) && L.members.has(d.to)) { if (dmg > 0) K.fx('linkhit', { to: d.to, dmg }); return; }
        return;
      }
      default: return;
    }
  });
  K.update((dt) => {
    if (!g.isHost) return;
    for (const [id, tu] of hostTurrets) {
      if (g.time > tu.until) { hostTurrets.delete(id); K.fx('turretoff', { id }); continue; }
      if (g.time < tu.next) continue;
      tu.next = g.time + 0.5;
      const head = tu.pos.clone().setY(tu.pos.y + 0.7);
      let best = null, bd = 14;
      for (const c of g.creatures.host.values()) {
        if (c.dead || c.def?.hazard || c.maxHp === null) continue;
        const ctr = K.ctrOf(c), d = ctr.distanceTo(head);
        if (d < bd && g.physics.lineOfSight(head, ctr, G.STATIC | G.DOOR)) { bd = d; best = { c, ctr }; }
      }
      if (!best) continue;
      K.hurt(best.c, 4 * tu.mul, tu.owner, {});
      K.fx('tshot', { id, to: arr3(best.ctr) });
      if (Math.random() < 0.4) g.creatures.noise(tu.pos, 1.0);
    }
    void dt;
  });
  K.on('phase', () => { hostTurrets.clear(); hostLinks.clear(); S.link = null; S.sonarT = 0; S.dashHits = null; S.dashT = 0; S.liftT = 0; S.ocT = 0; for (const [id, v] of turretVis) { v.mesh.removeFromParent(); v.mesh.userData.dispose(); turretVis.delete(id); } });
  K.on('localDeath', () => { S.link = null; S.dashT = 0; S.liftT = 0; S.dashHits = null; });

  build();
  Object.assign(api, {
    use, state: S, ROLE_SKILLS, skills: skillsOf,
    resetCooldowns() { api.cds.clear(); },
    dispose() {
      box.remove();
      for (const s of marks.values()) { s.removeFromParent(); s.material.dispose(); }
      marks.clear();
      for (const v of turretVis.values()) { v.mesh.removeFromParent(); v.mesh.userData.dispose(); }
      turretVis.clear();
    },
  });
  return api;
}
