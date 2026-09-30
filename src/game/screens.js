// Live canvas textures for the ship: terminal mirror, radar monitor, quota screens, arcade attract.
import * as THREE from 'three';
import { t as tt, tf } from '../core/i18n.js';   // [i18n8] ship monitors follow the language
import { MOONS } from './moons.js';
import { FACILITY_Y } from '../world/facility.js';
import { insideShip } from '../world/ship.js';
import { isSellable } from './items.js';
import { todaysEvent, eventMood } from '../ui/hud.js';

// "TFG Credit" (style.css) is a one-glyph font for the ▮ credit sign; ask the browser to load it for the canvases
try { document.fonts?.load?.('12px "TFG Credit"', '▮'); } catch { /* optional */ }

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx: c.getContext('2d'), t };
}

function screenMesh(anchor) {
  if (!anchor) return null;
  if (anchor.isMesh) return anchor;
  let m = null;
  anchor.traverse?.((o) => { if (!m && o.isMesh) m = o; });
  return m;
}

export class ShipScreens {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.termDirty = true;
    const A = game.ship.anchors;
    const aOf = (obj, name) => obj?.userData?.anchors?.[name];
    this.term = this.attach(aOf(A.terminal, 'screen'), 160, 120);
    const screens = aOf(A.monitors, 'screens') || [];
    const list = Array.isArray(screens) ? screens : [screens];
    this.radar = this.attach(list[0], 160, 120);
    this.status = this.attach(list[1], 160, 120);
    this.extra = this.attach(list[2], 160, 120);
    this.quota = this.attach(aOf(A.quota, 'screen'), 192, 96);
    this.arcade = this.attach(aOf(A.arcade, 'screen'), 128, 96);
    this.drawArcade = null;
    import('../minigames/arcade.js').then((m) => { this.drawArcade = m.drawArcadeAttract || null; }).catch(() => {});
  }
  attach(anchor, w, h) {
    const mesh = screenMesh(anchor);
    if (!mesh) return null;
    const s = canvasTex(w, h);
    const mat = new THREE.MeshBasicMaterial({ map: s.t, fog: false, toneMapped: false });
    mesh.material = mat;
    return s;
  }
  markTerminalDirty() { this.termDirty = true; }

  update(dt) {
    this.t += dt;
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    const g = this.game;
    const near = g.camera.position.length() < 20;
    if (!near) return;
    this.drawRadar();
    this.drawStatus();
    this.drawQuota();
    if (this.termDirty) { this.termDirty = false; this.drawTerminal(); }
    if (this.arcade && this.drawArcade) { try { this.drawArcade(this.arcade.ctx, 128, 96, this.t); this.arcade.t.needsUpdate = true; } catch { /* ignore */ } }
    if (this.extra) this.drawExtra();
  }

  crt(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
  }

  drawTerminal() {
    const s = this.term; if (!s) return;
    const { ctx, c } = s;
    ctx.fillStyle = '#031b0b'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#39ff6a'; ctx.font = '10px "TFG Credit", monospace';
    const lines = this.game.terminal.lines.slice(-10);
    lines.forEach((l, i) => ctx.fillText(l.text.slice(0, 30), 3, 12 + i * 11));
    if (!lines.length) { ctx.fillText('TFG OS v4.1', 30, 50); ctx.fillText('> _', 30, 66); }
    this.crt(ctx, c.width, c.height);
    s.t.needsUpdate = true;
  }

  drawRadar() {
    const s = this.radar; if (!s) return;
    const g = this.game;
    const { ctx, c } = s;
    const W = c.width, H = c.height;
    ctx.fillStyle = '#021006'; ctx.fillRect(0, 0, W, H);
    const tid = g.terminal.radarTarget || g.selfId;
    let tpos = null, tname = '';
    if (tid === g.selfId) { tpos = g.player.pos; tname = g.profile.name; }
    else { const r = g.remotes.get(tid); if (r) { tpos = r.pos; tname = r.name; } }
    if (!tpos) { tpos = g.player.pos; tname = g.profile.name; }
    const scale = 2.2; // px per meter
    const toS = (x, z) => [W / 2 + (x - tpos.x) * scale, H / 2 + (z - tpos.z) * scale];
    const fac = g.world.facility;
    if (fac && tpos.y < FACILITY_Y + 40) {
      const L = fac.layout;
      ctx.fillStyle = '#0d4a1d';
      for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
        if (!L.cells[L.idx(x, z)]) continue;
        const [sx, sy] = toS(L.ox + x * L.cell, L.oz + z * L.cell);
        if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
        ctx.fillRect(sx, sy, L.cell * scale + 0.5, L.cell * scale + 0.5);
      }
      ctx.fillStyle = '#ffcf40';
      for (const d of fac.doors) if (d.code && !d.open) { const [sx, sy] = toS(d.pos.x, d.pos.z); ctx.fillRect(sx - 2, sy - 2, 4, 4); }
    } else if (g.world.outdoor) {
      ctx.strokeStyle = '#0d4a1d'; ctx.lineWidth = 1;
      const e = g.world.outdoor.mainExit.pos;
      const [ex, ey] = toS(e.x, e.z); ctx.strokeRect(ex - 4, ey - 4, 8, 8);
      const [sx, sy] = toS(0, 0); ctx.fillStyle = '#1b6b8a'; ctx.fillRect(sx - 7, sy - 4, 14, 8);
    }
    // creatures
    ctx.fillStyle = '#ff3030';
    for (const v of g.creatures.views.values()) {
      if (v.state === 'dead' || v.type === 'web' || v.type === 'mimicdoor' || v.def?.noScan) continue;
      if (Math.abs(v.pos.y - tpos.y) > 30) continue;
      if ((v.type === 'sandkefal' || v.type === 'dunemaw') && v.state === 'hidden') continue;
      const [sx, sy] = toS(v.pos.x, v.pos.z);
      ctx.beginPath(); ctx.arc(sx, sy, v.type === 'giant' ? 4 : 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // scrap
    ctx.fillStyle = '#3aa0ff';
    for (const it of g.items.all()) {
      if (it.state !== 'world' || !isSellable(it.def)) continue;
      if (Math.abs(it.obj.position.y - tpos.y) > 30) continue;
      const [sx, sy] = toS(it.obj.position.x, it.obj.position.z);
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
    // players
    const drawP = (pos, yaw, col, dead) => {
      if (Math.abs(pos.y - tpos.y) > 30) return;
      const [sx, sy] = toS(pos.x, pos.z);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-yaw + Math.PI);
      ctx.fillStyle = dead ? '#666' : col;
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(3.5, -3); ctx.lineTo(-3.5, -3); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    for (const r of g.remotes.values()) drawP(r.pos, r.yaw, '#b8ffcc', r.dead);
    drawP(g.player.pos, g.player.yaw, '#ffffff', g.player.dead);
    ctx.fillStyle = '#39ff6a'; ctx.font = '9px "TFG Credit", monospace';
    ctx.fillText(tt('RADAR') + ': ' + tname.slice(0, 14), 3, 10);
    this.crt(ctx, W, H);
    s.t.needsUpdate = true;
  }

  drawStatus() {
    const s = this.status; if (!s) return;
    const g = this.game; const run = g.run || {};
    const { ctx, c } = s;
    ctx.fillStyle = '#060a14'; ctx.fillRect(0, 0, c.width, c.height);
    let shipVal = 0;
    for (const it of g.items.inShipItems()) if (isSellable(it.def) && !it.soulbound) shipVal += it.value;
    ctx.fillStyle = '#7fd1ff'; ctx.font = '11px "TFG Credit", monospace';
    ctx.fillText(tt('SHIP STATUS'), 8, 14);
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`${tt('MOON')}: ${MOONS[run.moon]?.short || '-'}`, 8, 32);
    ctx.fillText(`${tt('PHASE')}: ${tt(String(run.phase || '').toUpperCase())}`, 8, 46);
    ctx.fillText(`${tt('LOOT ONBOARD')}: ▮${shipVal}`, 8, 64);
    ctx.fillText(`${tt('CREDITS')}: ▮${run.credits ?? 0}`, 8, 80);
    ctx.fillText(`${tt('CREW')}: ${1 + g.remotes.size}`, 8, 96);
    if (run.phase === 'moon') {
      const t = run.time || 480;
      ctx.fillText(`${tt('TIME')}: ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 8, 112);
    }
    this.crt(ctx, c.width, c.height);
    s.t.needsUpdate = true;
  }
  drawExtra() {
    const s = this.extra; const g = this.game;
    const { ctx, c } = s;
    ctx.fillStyle = '#100606'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ff7a5a'; ctx.font = '11px "TFG Credit", monospace';
    ctx.fillText(tt('CREW VITALS'), 8, 14);
    let y = 32;
    const row = (name, hp, dead) => { ctx.fillStyle = dead ? '#777' : hp < 35 ? '#ff4040' : '#9dff9d'; ctx.fillText(`${name.slice(0, 12).padEnd(12)} ${dead ? tt('DEAD') : Math.round(hp)}`, 8, y); y += 14; };
    row(g.profile.name, g.player.hp, g.player.dead);
    for (const r of g.remotes.values()) row(r.name, r.hp ?? 100, r.dead);
    const ev = todaysEvent(g.run);
    if (ev) {
      const mood = eventMood(ev);
      ctx.fillStyle = mood === 'bad' ? '#ff5a5a' : mood === 'good' ? '#7dff9a' : '#ffd23f';
      ctx.fillText(`! ${String(ev.name || '').slice(0, 22)}`, 8, c.height - 8);
    }
    this.crt(ctx, c.width, c.height);
    s.t.needsUpdate = true;
  }
  drawQuota() {
    const s = this.quota; if (!s) return;
    const run = this.game.run || {};
    const { ctx, c } = s;
    ctx.fillStyle = '#140a02'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffb347'; ctx.font = 'bold 13px "TFG Credit", monospace';
    ctx.fillText(tt('ENGAGEMENT QUOTA'), 10, 18);
    ctx.font = 'bold 18px "TFG Credit", monospace';
    ctx.fillStyle = run.sold >= run.quota ? '#7dff7d' : '#ffd9a0';
    ctx.fillText(`▮${run.sold ?? 0} / ▮${run.quota ?? 0}`, 10, 44);
    ctx.font = '12px "TFG Credit", monospace'; ctx.fillStyle = '#ffb347';
    ctx.fillText(tf('DEADLINE: {n} DAYS', { n: run.daysLeft ?? 3 }), 10, 66);
    ctx.fillText(tf('DAY {n}', { n: run.day ?? 1 }), 10, 84);
    this.crt(ctx, c.width, c.height);
    s.t.needsUpdate = true;
  }
}
