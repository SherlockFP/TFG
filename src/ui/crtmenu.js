// Main menu as a 3D room of CRT monitors (Call of Duty: Black Ops style). The menu lives on the big
// CRT on the left; the other screens show live feeds, static, radar, logs, the player card...
// Mouse hover/click is raycast onto the screen UVs; arrow keys + Enter also work.
import * as THREE from 'three';
import { levelMaterial } from '../world/geobuilder.js';
import { createAnyProp } from '../world/propfactory.js';
import { t } from '../core/i18n.js';
import { rankOf, xpForLevel } from '../game/progression.js';
import { listRuns } from '../core/save.js';

const CRT_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRT_FS = `
uniform sampler2D map;
uniform float time;
uniform float power;     // 0..1 brightness / on
uniform vec3 tint;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv * 2.0 - 1.0;
  uv *= 1.0 + 0.07 * dot(uv.yx, uv.yx);            // barrel curvature
  vec2 tuv = uv * 0.5 + 0.5;
  if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) { gl_FragColor = vec4(0.01, 0.01, 0.012, 1.0); return; }
  float jitter = (hash(vec2(floor(time * 24.0), floor(tuv.y * 120.0))) - 0.5) * 0.002;
  vec3 c = texture2D(map, tuv + vec2(jitter, 0.0)).rgb;
  // slight RGB bleed
  c.r = mix(c.r, texture2D(map, tuv + vec2(0.0025, 0.0)).r, 0.5);
  c.b = mix(c.b, texture2D(map, tuv - vec2(0.0025, 0.0)).b, 0.5);
  float scan = 0.78 + 0.22 * sin(tuv.y * 420.0);
  float roll = 0.93 + 0.07 * sin(tuv.y * 6.0 - time * 1.7);
  float vig = smoothstep(1.45, 0.35, length(uv));
  float flick = 0.96 + 0.04 * sin(time * 53.0);
  float n = hash(tuv * 400.0 + time) * 0.012;
  c = (c * scan * roll * flick + n) * vig * power * tint;
  c += vec3(0.003, 0.004, 0.005) * vig;         // phosphor glow floor
  gl_FragColor = vec4(c, 1.0);
}`;

function makeCRT({ w = 0.8, h = 0.6, depth = 0.6, canvasW = 256, canvasH = 192, body = 0x2a2724, tint = [1, 1, 1] }) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: body });
  const bw = w + 0.16, bh = h + 0.16;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), bodyMat);
  shell.position.z = -depth / 2;
  g.add(shell);
  const back = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, bh * 0.7, depth * 0.6), bodyMat);
  back.position.z = -depth - depth * 0.25;
  g.add(back);
  // bezel ring
  const bezelMat = new THREE.MeshLambertMaterial({ color: 0x141312 });
  for (const [x, y, sx, sy] of [[0, h / 2 + 0.035, bw, 0.07], [0, -h / 2 - 0.035, bw, 0.07], [-w / 2 - 0.035, 0, 0.07, h], [w / 2 + 0.035, 0, 0.07, h]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.03), bezelMat);
    b.position.set(x, y, 0.012); g.add(b);
  }
  // knobs
  for (let i = 0; i < 2; i++) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), bezelMat);
    k.rotation.x = Math.PI / 2; k.position.set(w / 2 + 0.05, -h / 2 + 0.05 + i * 0.08, 0.02); g.add(k);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvasW; canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.ShaderMaterial({
    vertexShader: CRT_VS, fragmentShader: CRT_FS,
    uniforms: { map: { value: tex }, time: { value: 0 }, power: { value: 1 }, tint: { value: new THREE.Vector3(...tint) } },
  });
  mat.defines = { PSX_NOSNAP: '' };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  screen.position.z = 0.005;
  g.add(screen);
  return { group: g, canvas, ctx, tex, mat, screen, w, h };
}

const FONT = (px) => `${px}px "TFG Credit", VT323, monospace`;   // "TFG Credit": narrow ▮ credit glyph (style.css)
const MENU_FONT = (px) => `bold ${px}px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`;

export class CRTMenu {
  constructor(engine, app) {
    this.engine = engine;
    this.app = app;
    this.scene = new THREE.Scene();
    engine.scene = this.scene;
    this.scene.add(engine.camera);
    engine.camera.far = 60; engine.camera.fov = 58; engine.camera.updateProjectionMatrix();
    this.scene.background = new THREE.Color(0x020202);
    this.scene.fog = new THREE.FogExp2(0x050303, 0.09);
    this.t = 0;
    this.items = [];
    this.hover = -1;
    this.sel = 0;
    this.mode = 'title';
    this.focus = 0;           // 0 = wide shot, 1 = zoomed to the main CRT
    this._camA = new THREE.Vector3(); this._camB = new THREE.Vector3(); this._camC = new THREE.Vector3(); this._camD = new THREE.Vector3();
    this.screens = [];
    this.buildRoom();
    this.buildScreens();
    this.setItems();
    this.bindInput();
    engine.setRenderHeightOverride?.(540);
  }

  // ------------------------------------------------------------------ room
  buildRoom() {
    const s = this.scene;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), levelMaterial('concrete_dark'));
    floor.material = floor.material.clone(); floor.material.map = floor.material.map?.clone() || null;
    if (floor.material.map) { floor.material.map.repeat.set(5, 5); floor.material.map.needsUpdate = true; }
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const wallMat = levelMaterial('concrete_stained');
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), wallMat); back.position.set(0, 2.5, -3.2); s.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wallMat); left.position.set(-4.5, 2.5, 0); left.rotation.y = Math.PI / 2; s.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wallMat); right.position.set(4.5, 2.5, 0); right.rotation.y = -Math.PI / 2; s.add(right);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), levelMaterial('metal_dark')); ceil.position.set(0, 4, 0); ceil.rotation.x = Math.PI / 2; s.add(ceil);
    // metal shelving rack behind the monitors
    const rackMat = new THREE.MeshLambertMaterial({ color: 0x2c2f31 });
    const bar = (x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), rackMat); m.position.set(x, y, z); s.add(m); };
    for (const x of [-2.9, -0.4, 2.2, 3.6]) bar(x, 1.6, -1.2, 0.07, 3.2, 0.07);
    for (const y of [0.55, 1.5, 2.45]) { bar(0.35, y, -1.2, 6.6, 0.05, 0.9); }
    // table in front with junk
    bar(0.9, 0.78, 0.2, 2.6, 0.06, 1.1);
    for (const [x, z] of [[-0.3, -0.25], [2.1, -0.25], [-0.3, 0.65], [2.1, 0.65]]) bar(x, 0.39, z, 0.06, 0.78, 0.06);
    // props for silhouettes
    const put = (id, x, y, z, r = 0) => { try { const o = createAnyProp(id, { seed: 7 }); o.position.set(x, y, z); o.rotation.y = r; s.add(o); return o; } catch { return null; } };
    put('server_rack_prop', 3.9, 0, -2.3, -0.3);
    put('filing_cabinet', -3.8, 0, -2.2, 0.4);
    put('office_chair', 1.3, 0, 1.4, 2.6);
    put('barrel', -3.6, 0, 1.2, 0);
    put('cardboard_boxes', 3.4, 0, 1.0, 0.8);
    // hanging cables
    const cableMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0c });
    for (let i = 0; i < 9; i++) {
      const x0 = -3 + i * 0.8, x1 = x0 + (Math.random() - 0.5) * 1.5;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, 4, -1.6 + Math.random()), new THREE.Vector3((x0 + x1) / 2, 2.4 + Math.random() * 0.8, -1.3 + Math.random() * 0.6), new THREE.Vector3(x1, 3.1, -1.4)]);
      s.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.018, 4), cableMat));
    }
    // red hanging bulb
    this.bulb = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.3, 4), cableMat); wire.position.y = 0.65; this.bulb.add(wire);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 })); this.bulb.add(glass);
    this.bulb.position.set(0.4, 2.75, 0.2);
    s.add(this.bulb);
    this.redLight = new THREE.PointLight(0xff2a14, 9, 9, 1.6);
    this.redLight.position.copy(this.bulb.position);
    s.add(this.redLight);
    this.screenLight = new THREE.PointLight(0x9fc4ff, 3, 6, 1.6);
    this.screenLight.position.set(-0.7, 1.45, 1.2);
    s.add(this.screenLight);
    this.fill = new THREE.AmbientLight(0x404050, 0.12);
    s.add(this.fill);
    // dust motes
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 7; pos[i * 3 + 1] = Math.random() * 3.6; pos[i * 3 + 2] = (Math.random() - 0.5) * 5; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffd0c0, size: 0.012, transparent: true, opacity: 0.5, depthWrite: false }));
    s.add(this.dust);
  }

  // ------------------------------------------------------------------ monitors
  buildScreens() {
    const add = (opts, x, y, z, ry = 0, draw) => {
      const c = makeCRT(opts);
      c.group.position.set(x, y, z); c.group.rotation.y = ry;
      this.scene.add(c.group);
      c.draw = draw; c.phase = Math.random() * 10;
      this.screens.push(c);
      return c;
    };
    // main menu CRT (left, big)
    this.main = add({ w: 1.5, h: 1.12, depth: 0.9, canvasW: 640, canvasH: 480, tint: [1.15, 1.15, 1.2] }, -1.05, 1.42, 0.55, 0.42, (c, t) => this.drawMenu(c, t));
    this.feed = add({ w: 0.72, h: 0.54, depth: 0.6, tint: [0.85, 1, 0.9] }, 0.45, 1.98, -1.0, 0.0, (c, t) => this.drawFeed(c, t));
    add({ w: 0.62, h: 0.47, depth: 0.55 }, 1.35, 1.95, -1.05, -0.12, (c, t) => this.drawStatic(c, t));
    add({ w: 0.62, h: 0.47, depth: 0.55, tint: [0.7, 1, 0.75] }, 0.4, 1.02, -1.0, 0.05, (c, t) => this.drawRadar(c, t));
    this.card = add({ w: 0.7, h: 0.52, depth: 0.6, tint: [1, 0.92, 0.8] }, 1.35, 1.0, -1.02, -0.1, (c, t) => this.drawCard(c, t));
    add({ w: 0.55, h: 0.42, depth: 0.5, tint: [0.7, 1, 0.75] }, 2.3, 1.92, -1.05, -0.28, (c, t) => this.drawLog(c, t));
    add({ w: 0.5, h: 0.38, depth: 0.5 }, 2.3, 1.0, -1.05, -0.3, (c, t) => this.drawHeart(c, t));
    add({ w: 0.9, h: 0.68, depth: 0.7 }, -0.55, 2.78, -1.3, 0.12, (c, t) => this.drawLogo(c, t));
    add({ w: 0.5, h: 0.38, depth: 0.45 }, -2.9, 2.45, -1.1, 0.4, (c, t) => this.drawStatic(c, t, true));
    add({ w: 0.46, h: 0.35, depth: 0.45 }, 0.9, 0.99, 0.35, -0.2, (c, t) => this.drawClock(c, t));
  }

  setItems() {
    const runs = listRuns().filter((r) => r.data);
    const items = [];
    if (runs.length) items.push({ id: 'continue', label: t('CONTINUE') });
    items.push({ id: 'host', label: t('HOST GAME') }, { id: 'browser', label: t('JOIN GAME') }, { id: 'character', label: t('CHARACTER') },
      { id: 'mods', label: t('MODS') }, { id: 'settings', label: t('SETTINGS') }, { id: 'howto', label: t('HOW TO PLAY') });
    this.items = items;
    this.sel = Math.min(this.sel, items.length - 1);
  }

  // ------------------------------------------------------------------ drawing
  drawMenu(c, time) {
    const { ctx, canvas } = c;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#060606'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    if (this.mode !== 'title') {
      ctx.fillStyle = '#d8d8d8'; ctx.font = MENU_FONT(64); ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(220,230,255,0.8)'; ctx.shadowBlur = 16;
      ctx.fillText(this.modeLabel || '', W / 2, H / 2 - 20);
      ctx.font = FONT(32); ctx.fillStyle = '#888'; ctx.fillText((this.app.ui?.padActive ? '[B] ' : '[ESC] ') + t('BACK'), W / 2, H / 2 + 40);
      // a slow "signal" bar under the label so the idle screen still feels alive
      const k = (time * 0.35) % 1;
      ctx.fillStyle = 'rgba(200,215,255,0.18)'; ctx.fillRect(W * 0.2, H / 2 + 78, W * 0.6, 3);
      ctx.fillStyle = 'rgba(220,235,255,0.75)'; ctx.fillRect(W * 0.2 + W * 0.6 * k, H / 2 + 78, W * 0.08 * (1 - k), 3);
      ctx.shadowBlur = 0;
      return;
    }
    const n = this.items.length;
    const lh = Math.min(60, (H - 70) / n);
    const y0 = H / 2 - (n - 1) * lh / 2;
    ctx.textAlign = 'left';
    this.itemRects = [];
    for (let i = 0; i < n; i++) {
      const y = y0 + i * lh;
      const on = i === this.sel;
      ctx.font = MENU_FONT(on ? 58 : 52);
      ctx.fillStyle = on ? '#ffffff' : '#b8b8b8';
      ctx.shadowColor = on ? 'rgba(210,225,255,0.95)' : 'rgba(160,170,190,0.5)';
      ctx.shadowBlur = on ? 22 : 8;
      const x = 90 + (on ? 14 : 0);
      ctx.fillText(this.items[i].label, x, y);
      if (on) { ctx.fillText('▶', 46, y); }
      this.itemRects.push({ y0: (y - lh / 2) / H, y1: (y + lh / 2) / H });
    }
    ctx.shadowBlur = 0;
  }
  drawFeed(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0b0f0c'; ctx.fillRect(0, 0, W, H);
    // corridor perspective
    ctx.strokeStyle = '#2a3a30'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.4, H * 0.35); ctx.lineTo(W * 0.6, H * 0.35); ctx.lineTo(W, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W * 0.4, H * 0.7); ctx.lineTo(W * 0.6, H * 0.7); ctx.lineTo(W, H); ctx.stroke();
    ctx.fillStyle = '#121c16'; ctx.fillRect(W * 0.4, H * 0.35, W * 0.2, H * 0.35);
    // figure that appears sometimes
    const cyc = (time + c.phase) % 14;
    if (cyc > 6 && cyc < 11) {
      const k = Math.min(1, (cyc - 6) / 0.4) * Math.min(1, (11 - cyc) / 0.4);
      const x = W * 0.5 + Math.sin(cyc * 0.8) * 6, h = H * 0.3 * (0.6 + (cyc - 6) * 0.1);
      ctx.fillStyle = `rgba(0,0,0,${0.9 * k})`;
      ctx.fillRect(x - h * 0.12, H * 0.7 - h, h * 0.24, h);
      ctx.beginPath(); ctx.arc(x, H * 0.7 - h - h * 0.08, h * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,40,30,${k})`; ctx.fillRect(x - 5, H * 0.7 - h - h * 0.1, 3, 2); ctx.fillRect(x + 2, H * 0.7 - h - h * 0.1, 3, 2);
    }
    this.noise(ctx, W, H, 0.12);
    ctx.fillStyle = '#e8e8e8'; ctx.font = FONT(18); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('CAM 04 - SUBLEVEL B', 8, 6);
    const d = new Date(); ctx.fillText(`${d.toLocaleDateString()} ${d.toLocaleTimeString()}`, 8, H - 24);
    if (Math.floor(time * 2) % 2) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(W - 40, 16, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillText('REC', W - 32, 6); }
  }
  drawStatic(c, time, dim) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    this.noise(ctx, W, H, 1, dim ? 0.5 : 0.9);
    if (Math.floor(time * 1.5 + c.phase) % 3 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, H * 0.42, W, H * 0.16); ctx.fillStyle = '#ddd'; ctx.font = FONT(26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('NO SIGNAL', W / 2, H / 2); }
  }
  drawRadar(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,16,6,0.35)'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = H * 0.44;
    ctx.strokeStyle = '#1f7a3a'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, r * i / 3, 0, Math.PI * 2); ctx.stroke(); }
    const a = time * 1.6;
    ctx.strokeStyle = '#49ff7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const ba = i * 1.7 + c.phase, br = r * (0.3 + (i % 3) * 0.22);
      const diff = ((a - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const k = Math.max(0, 1 - diff / 2.5);
      ctx.fillStyle = i === 0 ? `rgba(255,60,60,${k})` : `rgba(90,255,130,${k})`;
      ctx.fillRect(cx + Math.cos(ba) * br - 3, cy + Math.sin(ba) * br - 3, 6, 6);
    }
    ctx.fillStyle = '#49ff7a'; ctx.font = FONT(18); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('MOTION TRACKER', 6, 4);
  }
  drawCard(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    const p = this.app.profile;
    ctx.fillStyle = '#100a05'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ff9a4a'; ctx.font = FONT(30); ctx.fillText(p.name.slice(0, 16), 12, 10);
    ctx.fillStyle = '#ffd9b8'; ctx.font = FONT(22); ctx.fillText(`Lv.${p.level}  ${rankOf(p.level)}${p.title ? ' · ' + p.title : ''}`, 12, 46);
    ctx.fillStyle = '#3a2412'; ctx.fillRect(12, 78, W - 24, 10);
    ctx.fillStyle = '#ff9a4a'; ctx.fillRect(12, 78, (W - 24) * Math.min(1, p.xp / xpForLevel(p.level)), 10);
    ctx.fillStyle = '#ffd23f'; ctx.font = FONT(24); ctx.fillText(`◈ ${p.coins} clout`, 12, 100);
    ctx.fillStyle = '#c9a98a'; ctx.font = FONT(19);
    ctx.fillText(`kills ${p.stats.kills} · quotas ${p.stats.quotasMet} · deaths ${p.stats.deaths}`, 12, 134);
    ctx.fillText(`[CHARACTER] to customize`, 12, 158);
  }
  drawLog(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#020a04'; ctx.fillRect(0, 0, W, H);
    const lines = ['TFG OS v4.1', '> mount /dev/moon', 'ENGAGEMENT QUOTA: ACTIVE', '> ping algorithm', 'reply: HUNGRY', 'crew status: EXPENDABLE', 'scanning sublevel B...', 'entity count: ???', '> sudo leave', 'permission denied', 'THE ALGORITHM IS WATCHING', 'lost content: 2,041 TB', 'do not feed the trolls'];
    const off = Math.floor(time * 2 + c.phase * 3);
    ctx.fillStyle = '#49ff7a'; ctx.font = FONT(20); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let i = 0; i < 8; i++) ctx.fillText(lines[(off + i) % lines.length], 8, 6 + i * 22);
    if (Math.floor(time * 3) % 2) ctx.fillRect(8, 6 + 8 * 22, 10, 16);
  }
  drawHeart(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,6,2,0.25)'; ctx.fillRect(0, 0, W, H);
    const x = (time * 90) % W;
    const ph = (time * 1.3) % 1;
    const y = H * 0.55 - (ph < 0.08 ? Math.sin(ph / 0.08 * Math.PI) * H * 0.35 : ph < 0.14 ? -Math.sin((ph - 0.08) / 0.06 * Math.PI) * H * 0.15 : 0);
    ctx.fillStyle = '#5aff8a'; ctx.fillRect(x, y, 3, 3);
    ctx.fillStyle = '#020'; ctx.fillRect((x + 6) % W, 0, 14, H);
    ctx.fillStyle = '#5aff8a'; ctx.font = FONT(18); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('BPM ' + (74 + Math.floor(Math.sin(time) * 6)), 6, 4);
  }
  drawLogo(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#080404'; ctx.fillRect(0, 0, W, H);
    const glitch = Math.random() < 0.06;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(110);
    if (glitch) { ctx.fillStyle = '#ff2a6a'; ctx.fillText('TFG', W / 2 + 6, H * 0.42); ctx.fillStyle = '#2affff'; ctx.fillText('TFG', W / 2 - 6, H * 0.42); }
    ctx.fillStyle = '#ff8a3d'; ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = 18; ctx.fillText('TFG', W / 2, H * 0.42); ctx.shadowBlur = 0;
    ctx.font = FONT(24); ctx.fillStyle = '#ff3d7f'; ctx.fillText('TOTALLY FUCKED GAME', W / 2, H * 0.78);
    if (glitch) { const y = Math.random() * H; const d = ctx.getImageData(0, y, W, 12); ctx.putImageData(d, (Math.random() - 0.5) * 30, y); }
  }
  drawClock(c, time) {
    const { ctx, canvas } = c; const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff3a2a'; ctx.font = FONT(64); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const d = new Date(); ctx.fillText(`${String(d.getHours()).padStart(2, '0')}${Math.floor(time * 2) % 2 ? ':' : ' '}${String(d.getMinutes()).padStart(2, '0')}`, W / 2, H / 2);
  }
  noise(ctx, W, H, alpha = 1, bright = 0.9) {
    const img = this.noiseImg && this.noiseImg.width === W ? this.noiseImg : (this.noiseImg = ctx.createImageData(W, H));
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 * bright; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = alpha * 255; }
    if (alpha >= 1) ctx.putImageData(img, 0, 0);
    else { const tmp = this.noiseCanvas || (this.noiseCanvas = document.createElement('canvas')); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(img, 0, 0); ctx.drawImage(tmp, 0, 0); }
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const canvas = this.engine.canvas;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.onMove = (e) => {
      if (this.mode !== 'title') return;
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const i = this.pick();
      if (i !== this.hover) { this.hover = i; if (i >= 0 && i !== this.sel) { this.sel = i; this.app.audio?.ui('ui_hover', 0.3); } }
      canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
    };
    this.onClick = (e) => { if (this.mode !== 'title') return; this.onMove(e); if (this.hover >= 0) this.activate(this.hover); };
    this.onKey = (e) => {
      if (this.app.game || this.mode !== 'title' || document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.sel = (this.sel - 1 + this.items.length) % this.items.length; this.app.audio?.ui('ui_hover', 0.3); e.preventDefault(); }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.sel = (this.sel + 1) % this.items.length; this.app.audio?.ui('ui_hover', 0.3); e.preventDefault(); }
      if (e.code === 'Enter' || e.code === 'Space') { this.activate(this.sel); e.preventDefault(); }
    };
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('click', this.onClick);
    window.addEventListener('keydown', this.onKey);
  }
  pick() {
    this.ray.setFromCamera(this.ndc, this.engine.camera);
    const hit = this.ray.intersectObject(this.main.screen, false)[0];
    if (!hit || !hit.uv || !this.itemRects) return -1;
    const v = 1 - hit.uv.y;
    // account for the barrel curvature roughly (center-weighted), good enough for picking
    return this.itemRects.findIndex((r) => v >= r.y0 && v <= r.y1);
  }
  // gamepad (polled by ui.js): D-pad / stick moves, A / Start confirms
  padInput(act) {
    if (this.mode !== 'title' || !this.items.length) return;
    if (act === 'up' || act === 'down') {
      this.sel = (this.sel + (act === 'up' ? -1 : 1) + this.items.length) % this.items.length;
      this.app.audio?.ui('ui_hover', 0.3);
    } else if (act === 'a' || act === 'start') this.activate(this.sel);
  }
  activate(i) {
    const it = this.items[i];
    if (!it) return;
    this.app.audio?.ui('ui_confirm', 0.6);
    if (it.id === 'continue') {
      const run = listRuns().filter((r) => r.data).sort((a, b) => (b.data.savedAt || 0) - (a.data.savedAt || 0))[0];
      this.app.ui.showMenu('host', { slot: run?.slot });
      return;
    }
    this.app.ui.showMenu(it.id);
  }
  setMode(mode, label) {
    this.mode = mode;
    this.modeLabel = label || '';
    if (mode === 'title') this.setItems();
    this.engine.canvas.style.cursor = 'default';
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    const t = this.t;
    // camera: wide shot of the rack, drifting; dolly in when a submenu is open
    const target = this.mode === 'title' ? 0 : 1;
    this.focus += (target - this.focus) * Math.min(1, dt * 3);
    const cam = this.engine.camera;
    // submenu pose frames the main CRT in the left ~40% of the screen; the DOM panel sits on the right
    const wide = this._camA.set(0.75 + Math.sin(t * 0.13) * 0.08, 1.6 + Math.sin(t * 0.21) * 0.03, 2.75);
    const close = this._camB.set(0.3 + Math.sin(t * 0.11) * 0.03, 1.52 + Math.sin(t * 0.19) * 0.015, 2.5);
    const ef = this.focus * this.focus * (3 - 2 * this.focus);
    cam.position.lerpVectors(wide, close, ef);
    const look = this._camC.set(-0.15 + Math.sin(t * 0.17) * 0.04, 1.5, -0.9).lerp(this._camD.set(-0.25, 1.45, 0.1), ef);
    cam.lookAt(look);
    // bulb swings, red light flickers
    this.bulb.rotation.z = Math.sin(t * 0.9) * 0.12;
    this.bulb.position.x = 0.4 + Math.sin(t * 0.9) * 0.12;
    this.redLight.position.copy(this.bulb.position);
    this.redLight.intensity = (Math.random() < 0.02 ? 2 : 9) * (0.9 + Math.sin(t * 13) * 0.05);
    this.screenLight.intensity = 2.6 + Math.sin(t * 40) * 0.2;
    // screens: redraw at ~15 fps each, staggered
    this.drawAcc = (this.drawAcc || 0) + dt;
    if (this.drawAcc > 1 / 15) {
      this.drawAcc = 0;
      for (const s of this.screens) { s.draw(s, t); s.tex.needsUpdate = true; }
    }
    for (const s of this.screens) s.mat.uniforms.time.value = t + s.phase;
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) + dt * 0.02; if (y > 3.6) y = 0; pos.setY(i, y); }
    pos.needsUpdate = true;
  }

  dispose() {
    const canvas = this.engine.canvas;
    canvas.removeEventListener('pointermove', this.onMove);
    canvas.removeEventListener('click', this.onClick);
    window.removeEventListener('keydown', this.onKey);
    canvas.style.cursor = '';
    this.engine.setRenderHeightOverride?.(null);
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map?.isCanvasTexture) o.material.map.dispose(); });
  }
}
