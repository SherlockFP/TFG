// PASSIVE TREE panel (K): a Path-of-Exile-style constellation on a canvas. Drag to pan, wheel to zoom, click a node to allocate
// the whole path to it (amber lit), right-click an allocated node to refund (Clout), search box highlights matches.
// Works in game (ctl = game.rpg) and from the main menu (ctl = a bare profile controller). Self-contained DOM + injected CSS.
import {
  NODES, NODE, EDGES, ADJ, ROLES, ROLE_ORDER, KEYSTONES, TREE_RADIUS, bonusLines, treeBonus, treeSpent, refundCost, searchNodes, START_ID,
} from '../../game/passivetree.js';
import { createRpgController } from '../../game/rpgctl.js';
import { ensureRpgProfile } from '../../game/profile.js';
import { drawIcon, iconCanvas } from './treeicons.js';
import { createRolesPanel } from './roles.js';
import { getLang, addTranslations, t, tf } from '../../core/i18n.js';

const TR = {
  'PASSIVE TREE': 'PASİF AĞAÇ', POINTS: 'PUAN', ROLE: 'ROL', RESPEC: 'SIFIRLA', FIT: 'SIĞDIR', Close: 'Kapat', STATS: 'DURUM',
  'Search nodes...': 'Düğüm ara...', 'YOUR BONUSES': 'BONUSLARIN', KEYSTONES: 'ANAHTAR TAŞLARI', 'No role yet': 'Henüz rol yok', 'Pick a role': 'Bir rol seç',
  'DRAG pan · WHEEL zoom · CLICK allocate · RIGHT-CLICK refund': 'SÜRÜKLE kaydır · TEKER yakınlaş · TIK ata (tüm yol) · SAĞ TIK iade',
  ALLOCATED: 'ALINDI', KEYSTONE: 'ANAHTAR TAŞI', NOTABLE: 'ÖNEMLİ', PASSIVE: 'PASİF', 'ROLE POST': 'ROL NOKTASI', 'ROLE BONUS': 'ROL BONUSU',
};
addTranslations({ 'PASSIVE TREE [K]': 'PASİF AĞAÇ [K]' });
const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const L = (s) => (tr() ? TR[s] : null) || t(s);

// ------------------------------------------------------------------ css
const STYLE_ID = 'tfg-tree-style';
const CSS = `
.pt{width:min(1560px,98vw);height:min(94vh,940px);display:flex;flex-direction:column;background:#070508;border:1px solid var(--amber-dim,#a8531f);
 box-shadow:0 0 70px rgba(0,0,0,.92),inset 0 0 90px rgba(255,120,40,.07);position:relative;overflow:hidden;font-family:var(--font,'VT323',monospace);color:var(--text,#ffd9b8)}
.pt-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid rgba(255,138,61,.3);background:linear-gradient(180deg,rgba(28,15,6,.95),rgba(12,7,3,.95));position:relative;z-index:3}
.pt-title{font-family:var(--font2,monospace);font-size:18px;color:var(--amber,#ff8a3d);letter-spacing:3px;text-shadow:0 0 12px rgba(255,138,61,.5);white-space:nowrap}
.pt-pts{font-size:26px;color:#fff1c9;white-space:nowrap}
.pt-pts b{color:#ffb347;text-shadow:0 0 12px rgba(255,170,60,.7);font-weight:normal;font-size:32px}
.pt-pts.pulse b{animation:ptPulse 1.3s ease-in-out infinite}
@keyframes ptPulse{50%{text-shadow:0 0 22px rgba(255,210,120,1);color:#fff}}
.pt-clout{font-size:23px;color:#ffd166;white-space:nowrap}
.pt-role{display:flex;align-items:center;gap:8px;font-family:var(--font2,monospace);font-size:12px;letter-spacing:2px;color:var(--rc,#ffb347);background:rgba(0,0,0,.4);border:1px solid var(--rc,#a8531f);padding:3px 12px 3px 6px;cursor:pointer}
.pt-role:hover{background:var(--rc,#ffb347);color:#110803}
.pt-role canvas{display:block}
.pt-search{font-family:var(--font,monospace);font-size:21px;background:rgba(0,0,0,.5);color:#ffe9d0;border:1px solid var(--amber-dim,#a8531f);padding:2px 10px;width:200px;outline:none}
.pt-search:focus{border-color:var(--amber,#ff8a3d);box-shadow:0 0 12px rgba(255,138,61,.35)}
.pt-count{font-size:19px;opacity:.75;min-width:70px}
.pt-sp{flex:1}
.pt-btn{font-family:var(--font,monospace);font-size:20px;color:var(--amber,#ff8a3d);background:rgba(255,138,61,.08);border:1px solid var(--amber-dim,#a8531f);padding:1px 12px;cursor:pointer;white-space:nowrap}
.pt-btn:hover{background:var(--amber,#ff8a3d);color:#150a02}
.pt-btn.warn{color:#ffd166;border-color:#ffd166;background:rgba(255,209,102,.12)}
.pt-body{position:relative;flex:1;min-height:0}
.pt-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
.pt-canvas.drag{cursor:grabbing}
.pt-canvas.hot{cursor:pointer}
.pt-crt{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.13) 0 1px,transparent 1px 3px),radial-gradient(120% 100% at 50% 50%,transparent 55%,rgba(0,0,0,.55) 100%);mix-blend-mode:multiply}
.pt-tip{position:absolute;z-index:5;pointer-events:none;max-width:330px;min-width:200px;padding:8px 12px 9px;background:rgba(9,5,3,.96);border:1px solid var(--tc,#a8531f);box-shadow:0 0 22px rgba(0,0,0,.85),0 0 16px color-mix(in srgb,var(--tc,#a8531f) 45%,transparent);display:none}
.pt-tip .tn{font-family:var(--font2,monospace);font-size:14px;letter-spacing:1.5px;color:var(--tc,#ffe6c4);line-height:1.4;margin-bottom:3px;text-shadow:0 0 10px color-mix(in srgb,var(--tc,#ffe6c4) 50%,transparent)}
.pt-tip .tt{font-size:16px;letter-spacing:2px;opacity:.7;margin-bottom:3px}
.pt-tip .tg{color:#8dff8d;font-size:21px;line-height:1.05}
.pt-tip .tb{color:#ff6b5a;font-size:21px;line-height:1.05}
.pt-tip .tx{color:#ffb070;font-size:19px;line-height:1.05;margin-top:2px}
.pt-tip .tf{color:#b9a58f;font-size:18px;font-style:italic;margin-top:5px;line-height:1.05}
.pt-tip .ts{margin-top:6px;padding-top:5px;border-top:1px dashed rgba(255,138,61,.3);font-size:19px;line-height:1.05}
.pt-msg{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:4;font-size:23px;padding:3px 16px;background:rgba(8,4,2,.92);border:1px solid var(--amber-dim,#a8531f);opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.pt-msg.on{opacity:1}.pt-msg.good{color:#8dff8d;border-color:#3a9a3a}.pt-msg.bad{color:#ff8d7d;border-color:#9a3a3a}.pt-msg.warn{color:#ffd166;border-color:#9a7a2a}
.pt-hint{position:absolute;left:12px;bottom:8px;font-size:16px;opacity:.7;z-index:2;pointer-events:none;padding:1px 8px;background:rgba(6,3,2,.75);white-space:nowrap}
.pt-side{position:absolute;right:10px;top:10px;bottom:10px;width:270px;z-index:3;overflow:auto;padding:10px 12px;background:rgba(8,4,2,.82);border:1px solid rgba(255,138,61,.3);backdrop-filter:blur(2px)}
.pt-side h4{margin:10px 0 4px;font-family:var(--font2,monospace);font-size:10px;letter-spacing:2px;color:var(--amber,#ff8a3d);font-weight:normal}
.pt-side h4:first-child{margin-top:0}
.pt-side .g{color:#8dff8d;font-size:18px;line-height:1.05}.pt-side .b{color:#ff6b5a;font-size:18px;line-height:1.05}
.pt-side .k{color:#ffb347;font-size:19px;line-height:1.1}.pt-side .d{opacity:.6;font-size:17px;line-height:1.05}
.pt-ov{position:absolute;inset:0;z-index:8;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center}
@media (max-width:900px){.pt-side{display:none}.pt-search{width:130px}.pt-title{font-size:14px}}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }

// ------------------------------------------------------------------ drawing helpers
const NODE_R = { small: 11, notable: 18, keystone: 27, start: 24 };
const AMBER = '#ffb347', HOT = '#fff1c9', DEEP = '#c8641a', GOLD = '#e9c46a';
const LABEL_R = 598;
const FIT_R = 650;
const rad = (d) => (d * Math.PI) / 180;
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function poly(ctx, x, y, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) { const a = rot + (i / sides) * Math.PI * 2; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.closePath();
}
const roleColor = (n) => (n.role ? ROLES[n.role].color : '#b9a58f');
const NODES_SORTED = [...NODES].sort((a, b) => NODE_R[a.type] - NODE_R[b.type]);
// edge descriptors: same-radius edges (the inner ring) are drawn as arcs around the centre, the rest as straight lines
const EDGE_DESC = EDGES.map(([a, b]) => {
  const A = NODE[a], B = NODE[b];
  const arc = A.r > 1 && Math.abs(A.r - B.r) < 0.5;
  let a0 = 0, da = 0;
  if (arc) { a0 = Math.atan2(A.y, A.x); const a1 = Math.atan2(B.y, B.x); da = ((a1 - a0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
  return { a, b, A, B, arc, a0, da };
});
function tracePath(ctx, e) {
  if (e.arc) { ctx.moveTo(Math.cos(e.a0) * e.A.r, Math.sin(e.a0) * e.A.r); ctx.arc(0, 0, e.A.r, e.a0, e.a0 + e.da, e.da < 0); }
  else { ctx.moveTo(e.A.x, e.A.y); ctx.lineTo(e.B.x, e.B.y); }
}

let backdrop = null;
function makeBackdrop() {
  if (backdrop) return backdrop;
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  let seed = 90210; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  x.fillStyle = '#07050a'; x.fillRect(0, 0, 1024, 1024);
  ROLE_ORDER.forEach((id, i) => {
    const a = rad(-90 + 60 * i), bx = 512 + Math.cos(a) * 300, by = 512 + Math.sin(a) * 300;
    const g = x.createRadialGradient(bx, by, 0, bx, by, 330);
    g.addColorStop(0, rgba(ROLES[id].color, 0.17)); g.addColorStop(1, rgba(ROLES[id].color, 0));
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
  });
  const g = x.createRadialGradient(512, 512, 0, 512, 512, 300);
  g.addColorStop(0, 'rgba(255,140,50,.16)'); g.addColorStop(1, 'rgba(255,140,50,0)');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 520; i++) {
    const r = rnd() * 1.25 + 0.2, a = 0.12 + rnd() * 0.7, warm = rnd() > 0.55;
    x.fillStyle = warm ? `rgba(255,222,186,${a})` : `rgba(196,214,255,${a})`;
    x.beginPath(); x.arc(rnd() * 1024, rnd() * 1024, r, 0, Math.PI * 2); x.fill();
  }
  return (backdrop = c);
}

// ------------------------------------------------------------------ the panel
let lastView = null;

/** opts: { game, ctl, profile, onClose } -> { el, refresh, destroy } */
export function createTreePanel({ game = null, ctl = null, profile = game?.profile, onClose } = {}) {
  ensureStyle();
  ensureRpgProfile(profile);
  if (!ctl) ctl = createRpgController(profile);
  const sfx = (n = 'ui_click', v = 0.4) => { try { (game?.audio || window.kefal?.audio)?.ui?.(n, v); } catch { /* ignore */ } };

  const root = mk('div', 'pt');
  root.tabIndex = -1;
  // ---- header
  const head = mk('div', 'pt-head');
  const title = mk('div', 'pt-title', L('PASSIVE TREE'));
  const roleBtn = mk('button', 'pt-role');
  const pts = mk('div', 'pt-pts');
  const clout = mk('div', 'pt-clout');
  const search = mk('input', 'pt-search'); search.type = 'search'; search.placeholder = L('Search nodes...'); search.autocomplete = 'off'; search.spellcheck = false;
  const count = mk('div', 'pt-count');
  const respecBtn = mk('button', 'pt-btn', L('RESPEC'));
  const statsBtn = mk('button', 'pt-btn', L('STATS'));
  const fitBtn = mk('button', 'pt-btn', L('FIT'));
  const closeBtn = mk('button', 'pt-btn', '✕');
  closeBtn.title = L('Close');
  head.append(title, roleBtn, pts, clout, search, count, mk('div', 'pt-sp'), respecBtn, statsBtn, fitBtn, closeBtn);
  // ---- body
  const body = mk('div', 'pt-body');
  const canvas = mk('canvas', 'pt-canvas');
  const crt = mk('div', 'pt-crt');
  const tip = mk('div', 'pt-tip');
  const msgEl = mk('div', 'pt-msg');
  const side = mk('div', 'pt-side');
  body.append(canvas, crt, side, tip, msgEl);
  root.append(head, body);
  const ctx = canvas.getContext('2d');

  // ---- state
  let W = 800, H = 600, dpr = 1;
  const view = lastView ? { ...lastView } : { x: 0, y: 0, z: 0.6 };
  let hover = null, prevPlan = null, prevSet = null, matches = new Set(), pendingRefund = null, msgT = 0, respecArm = 0;
  let alive = true, sideOn = true, overlay = null, lastDraw = 0, frames = 0;
  let alloc = ctl.allocated();

  const sideW = () => (sideOn && W > 900 ? 292 : 0);
  const fitZ = () => Math.max(0.2, Math.min(1.2, (Math.min(W - sideW(), H) / (2 * FIT_R)) * 1.02));
  function fit() { view.z = fitZ(); view.x = -sideW() / 2; view.y = 0; }
  // first open: zoom into your role's region (like PoE opens on your class start); no role yet -> whole tree
  function home() {
    const st = ctl.role() ? NODE[START_ID(ctl.role())] : null;
    if (!st) { fit(); return; }
    view.z = Math.min(1, fitZ() * 1.6);
    view.x = -st.x * 1.5 * view.z - sideW() / 2; view.y = -st.y * 1.5 * view.z;
  }
  const toWorld = (sx, sy) => ({ x: (sx - W / 2 - view.x) / view.z, y: (sy - H / 2 - view.y) / view.z });
  function centerOn(n) {
    view.z = Math.max(view.z, 0.85);
    view.x = -n.x * view.z - sideW() / 2; view.y = -n.y * view.z;
  }
  let sized = false;
  function resize() {
    const r = body.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    W = Math.round(r.width); H = Math.round(r.height);
    dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!sized) { sized = true; if (!lastView) { home(); lastView = { ...view }; } }
  }

  function flash(text, kind = '') {
    msgEl.textContent = text; msgEl.className = 'pt-msg on ' + kind;
    clearTimeout(msgT); msgT = setTimeout(() => { msgEl.classList.remove('on'); }, 2800);
  }

  // ---- header + side refresh
  function refresh() {
    alloc = ctl.allocated();
    const role = ctl.roleDef();
    roleBtn.replaceChildren();
    roleBtn.style.setProperty('--rc', role ? role.color : '#ffb347');
    if (role) roleBtn.append(iconCanvas(role.icon, 26, role.color, false), document.createTextNode(role.name.toUpperCase()));
    else roleBtn.append(document.createTextNode(L('ROLE') + ': ' + L('Pick a role') + ' ▾'));
    const p = ctl.points();
    pts.replaceChildren(document.createTextNode(L('POINTS') + ' '), Object.assign(mk('b'), { textContent: String(p) }));
    pts.classList.toggle('pulse', p > 0);
    clout.textContent = '◈ ' + ctl.coins();
    const cost = ctl.respecCost();
    respecBtn.textContent = respecArm > Date.now() ? tf('CONFIRM ◈{cost}?', { cost }) : L('RESPEC') + (cost ? ` ◈${cost}` : '');
    respecBtn.classList.toggle('warn', respecArm > Date.now());
    respecBtn.style.opacity = ctl.state().nodes.length ? '1' : '.4';
    count.textContent = matches.size ? `${matches.size} match${matches.size > 1 ? 'es' : ''}` : (search.value ? '0 matches' : '');
    // side panel
    side.replaceChildren();
    side.style.display = sideOn ? '' : 'none';
    const h = (t) => side.appendChild(mk('h4', '', t));
    h(L('ROLE'));
    if (role) {
      const rb = mk('div', 'k', role.name.toUpperCase()); rb.style.color = role.color; side.appendChild(rb);
      side.appendChild(mk('div', 'd', role.tag));
    } else side.appendChild(mk('div', 'd', L('No role yet')));
    const tb = treeBonus(ctl.state());
    h(L('YOUR BONUSES'));
    const lines = bonusLines(tb);
    if (!lines.length) side.appendChild(mk('div', 'd', '-'));
    for (const l of lines) side.appendChild(mk('div', l.good ? 'g' : 'b', l.text));
    const ks = Object.keys(KEYSTONES).filter((k) => alloc.has(k));
    h(L('KEYSTONES'));
    if (!ks.length) side.appendChild(mk('div', 'd', '-'));
    for (const k of ks) {
      side.appendChild(mk('div', 'k', '◆ ' + KEYSTONES[k].name));
      for (const x of KEYSTONES[k].text || []) side.appendChild(mk('div', 'd', t(x)));
    }
    h('INFO');
    side.appendChild(mk('div', 'd', L('DRAG pan · WHEEL zoom · CLICK allocate · RIGHT-CLICK refund')));
    side.appendChild(mk('div', 'd', `${ctl.state().nodes.length} nodes · ${treeSpent(ctl.state())} points spent · ${NODES.length} nodes total`));
    if (ctl.state().migrated?.skills) side.appendChild(mk('div', 'd', `${ctl.state().migrated.skills} old skill points were refunded into the tree.`));
    prevPlan = null; prevSet = null;
    if (hover) updateHover(hover);
  }

  // ---- hover / tooltip
  function updateHover(id) {
    hover = id;
    canvas.classList.toggle('hot', !!id);
    if (!id) { tip.style.display = 'none'; prevPlan = null; prevSet = null; return; }
    const n = NODE[id];
    const on = alloc.has(id);
    prevPlan = on ? null : ctl.plan(id);
    prevSet = prevPlan?.ok ? new Set(prevPlan.path) : null;
    // tooltip
    const col = n.type === 'keystone' ? '#ff9a3d' : n.type === 'notable' ? GOLD : n.role ? ROLES[n.role].color : '#ffe6c4';
    tip.style.setProperty('--tc', col);
    tip.replaceChildren();
    const typeName = n.type === 'keystone' ? 'KEYSTONE' : n.type === 'notable' ? 'NOTABLE' : n.type === 'start' ? 'ROLE POST' : 'PASSIVE';
    tip.appendChild(mk('div', 'tt', L(typeName) + (n.rare ? ' · BAG' : '') + (n.role && n.type !== 'start' ? ' · ' + ROLES[n.role].name.toUpperCase() : '')));
    tip.appendChild(mk('div', 'tn', n.name));
    const isMyPost = n.type === 'start' && ctl.role() === n.role;
    const b = isMyPost ? ROLES[n.role].bonus : n.b;
    if (isMyPost) tip.appendChild(mk('div', 'tt', L('ROLE BONUS')));
    for (const l of bonusLines(b)) tip.appendChild(mk('div', l.good ? 'tg' : 'tb', l.text));
    for (const x of n.text) tip.appendChild(mk('div', 'tx', '◆ ' + t(x)));
    if (n.tip) tip.appendChild(mk('div', 'tf', '"' + n.tip + '"'));
    const st = mk('div', 'ts');
    if (isMyPost) { st.style.color = '#8dff8d'; st.textContent = t('YOUR ROLE POST - everything connects from here.'); }
    else if (on) {
      const info = ctl.refundInfo(id);
      st.style.color = '#ffd98a';
      st.textContent = L('ALLOCATED') + (info.ok ? tf(' · right-click to refund ({n})', { n: info.free ? 'free undo' : '◈' + info.cost }) : ` · ${info.reason}`);
    } else if (!ctl.role()) { st.style.color = '#ff8d7d'; st.textContent = t('Pick a role first (ROLE button).'); }
    else if (prevPlan?.ok) {
      const c = prevPlan.cost, k = prevPlan.path.length;
      st.style.color = prevPlan.affordable ? '#8dff8d' : '#ff8d7d';
      st.textContent = prevPlan.affordable ? tf('Click: allocate {n}{c} point{n2}', { n: k > 1 ? k + ' nodes, ' : '', c, n2: c > 1 ? 's' : '' }) : prevPlan.reason;
    } else { st.style.color = '#ff8d7d'; st.textContent = prevPlan?.reason || ''; }
    tip.appendChild(st);
    tip.style.display = 'block';
  }
  function placeTip(mx, my) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = mx + 18, y = my + 16;
    if (x + w > W - 8) x = mx - w - 14;
    if (y + h > H - 8) y = H - h - 8;
    tip.style.left = Math.max(6, x) + 'px'; tip.style.top = Math.max(6, y) + 'px';
  }
  function hit(mx, my) {
    const w = toWorld(mx, my);
    let best = null, bd = 1e9;
    for (const n of NODES) {
      const r = NODE_R[n.type] + 7 / view.z;
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      if (d <= r && d < bd) { best = n.id; bd = d; }
    }
    return best;
  }

  // ---- interaction
  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); } catch { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, button: e.button };
    else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; drag = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const nz = Math.max(0.25, Math.min(2.4, pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pinch.d))));
      view.z = nz; return;
    }
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; canvas.classList.add('drag'); }
      if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; tip.style.display = 'none'; hover = null; return; }
    }
    const id = hit(mx, my);
    if (id !== hover) updateHover(id);
    if (id) placeTip(mx, my);
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    canvas.classList.remove('drag');
    if (drag && !drag.moved && drag.button === 0 && pointers.size === 0) {
      const rect = canvas.getBoundingClientRect();
      const id = hit(e.clientX - rect.left, e.clientY - rect.top);
      if (id) onClickNode(NODE[id]);
    }
    if (pointers.size === 0) { drag = null; lastView = { ...view }; }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (!drag) updateHover(null); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = toWorld(mx, my);
    const nz = Math.max(0.25, Math.min(2.4, view.z * Math.exp(-e.deltaY * 0.0012)));
    view.z = nz;
    view.x = mx - W / 2 - w.x * nz; view.y = my - H / 2 - w.y * nz;
    lastView = { ...view };
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const id = hit(e.clientX - rect.left, e.clientY - rect.top);
    if (id) onRefundNode(NODE[id]);
  });

  function onClickNode(n) {
    if (alloc.has(n.id)) {
      flash(n.type === 'start' && ctl.role() === n.role ? t('This is your role post.') : t('Right-click to refund this node.'), 'warn');
      return;
    }
    if (!ctl.role()) { flash(t('Pick a role first.'), 'bad'); openRoles(); return; }
    const r = ctl.allocate(n.id);
    flash(r.msg, r.ok ? 'good' : 'bad');
    sfx(r.ok ? 'ui_confirm' : 'ui_click', r.ok ? 0.55 : 0.3);
    refresh();
  }
  function onRefundNode(n) {
    if (!alloc.has(n.id)) return;
    const info = ctl.refundInfo(n.id);
    if (!info.ok) { flash(info.reason, 'bad'); return; }
    const now = Date.now();
    if (info.cost > 0 && !(pendingRefund && pendingRefund.id === n.id && now - pendingRefund.t < 3000)) {
      pendingRefund = { id: n.id, t: now };
      flash(tf('Right-click again to refund {name} for ◈{cost}', { name: n.name, cost: info.cost }), 'warn');
      return;
    }
    pendingRefund = null;
    const r = ctl.refund(n.id);
    flash(r.msg, r.ok ? 'good' : 'bad');
    sfx('ui_click', 0.5);
    refresh();
  }

  search.addEventListener('input', () => {
    matches = searchNodes(search.value);
    count.textContent = matches.size ? `${matches.size} match${matches.size > 1 ? 'es' : ''}` : (search.value ? '0 matches' : '');
  });
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const first = [...matches].map((id) => NODE[id]).sort((a, b) => Number(alloc.has(a.id)) - Number(alloc.has(b.id)))[0];
      if (first) centerOn(first);
    } else if (e.key === 'Escape') { e.preventDefault(); if (search.value) { search.value = ''; matches = new Set(); count.textContent = ''; } else search.blur(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target === search) return;
    const step = 60;
    if (e.key === 'Escape') { if (!game) { e.preventDefault(); onClose?.(); } return; }
    if (e.key === '+' || e.key === '=') { view.z = Math.min(2.4, view.z * 1.15); e.preventDefault(); }
    else if (e.key === '-') { view.z = Math.max(0.25, view.z / 1.15); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { view.x += step; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { view.x -= step; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { view.y += step; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { view.y -= step; e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') { fit(); e.preventDefault(); }
    else if (e.key === '/') { search.focus(); e.preventDefault(); }
  });

  function openRoles() {
    closeOverlay();
    overlay = mk('div', 'pt-ov');
    const rp = createRolesPanel({ game, ctl, profile, onClose: closeOverlay, onPicked: () => { refresh(); } });
    overlay.appendChild(rp.el);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeOverlay(); });
    root.appendChild(overlay);
  }
  function closeOverlay() { overlay?.remove(); overlay = null; refresh(); }
  roleBtn.addEventListener('click', () => { sfx(); openRoles(); });
  respecBtn.addEventListener('click', () => {
    if (!ctl.state().nodes.length) { flash(t('Nothing to refund.'), 'warn'); return; }
    if (respecArm < Date.now()) { respecArm = Date.now() + 3200; refresh(); setTimeout(refresh, 3300); return; }
    respecArm = 0;
    const r = ctl.respecAll();
    flash(r.msg, r.ok ? 'good' : 'bad'); sfx('ui_click', 0.5); refresh();
  });
  statsBtn.addEventListener('click', () => { sideOn = !sideOn; refresh(); sfx(); });
  fitBtn.addEventListener('click', () => { fit(); lastView = { ...view }; sfx(); });
  closeBtn.addEventListener('click', () => onClose?.());

  // ---- rendering
  function drawWedges() {
    ROLE_ORDER.forEach((id, i) => {
      const cA = -90 + 60 * i;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 610, rad(cA - 30), rad(cA + 30)); ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, 60, 0, 0, 610);
      g.addColorStop(0, rgba(ROLES[id].color, 0.13)); g.addColorStop(1, rgba(ROLES[id].color, 0.0));
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.moveTo(Math.cos(rad(cA + 30)) * 90, Math.sin(rad(cA + 30)) * 90); ctx.lineTo(Math.cos(rad(cA + 30)) * 610, Math.sin(rad(cA + 30)) * 610);
      ctx.strokeStyle = 'rgba(255,200,140,.07)'; ctx.lineWidth = 1.5 / view.z; ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(255,190,120,.06)'; ctx.lineWidth = 1.2 / view.z; ctx.setLineDash([4 / view.z, 9 / view.z]);
    for (const r of [112, 165, 252, 318, 505, 566]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  function drawCenter(now) {
    ctx.save();
    ctx.rotate(now * 0.04);
    for (const [r, a] of [[42, 0.28], [58, 0.18], [76, 0.12]]) { poly(ctx, 0, 0, r, 6, 0); ctx.strokeStyle = `rgba(255,170,70,${a})`; ctx.lineWidth = 1.6 / view.z; ctx.stroke(); }
    ctx.restore();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
    g.addColorStop(0, 'rgba(255,170,60,.28)'); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
    drawIcon(ctx, 'eye', 0, 0, 24, 'rgba(255,190,90,.75)', 2 / view.z);
  }
  function drawEdges(now) {
    const lit = [], open = [], base = [], prev = [];
    for (const e of EDGE_DESC) {
      const A = alloc.has(e.a), B = alloc.has(e.b);
      if (A && B) lit.push(e); else if (A || B) open.push(e); else base.push(e);
      if (prevSet && (prevSet.has(e.a) || prevSet.has(e.b)) && (prevSet.has(e.a) || A) && (prevSet.has(e.b) || B)) prev.push(e);
    }
    const stroke = (list, style, lw) => {
      if (!list.length) return;
      ctx.beginPath(); for (const e of list) tracePath(ctx, e);
      ctx.strokeStyle = style; ctx.lineWidth = lw / view.z; ctx.stroke();
    };
    ctx.lineCap = 'round';
    stroke(base, 'rgba(176,140,112,.26)', 2.2);
    stroke(open, 'rgba(255,165,70,.38)', 2.6);
    stroke(lit, 'rgba(255,140,40,.17)', 13);
    stroke(lit, 'rgba(255,168,58,.9)', 4.6);
    stroke(lit, 'rgba(255,238,190,.95)', 1.7);
    if (prev.length) {
      ctx.setLineDash([9 / view.z, 6 / view.z]); ctx.lineDashOffset = (-now * 34) / view.z;
      stroke(prev, 'rgba(255,240,190,.95)', 3.2);
      ctx.setLineDash([]);
    }
  }
  function drawNode(n, now) {
    const R = NODE_R[n.type];
    const on = alloc.has(n.id);
    const free = ctl.points() > 0;
    const open = !on && free && ctl.role() && ADJ[n.id].some((nb) => alloc.has(nb));
    const inPrev = !!prevSet?.has(n.id);
    const dim = matches.size && !matches.has(n.id) ? 0.3 : 1;
    const ring = n.type === 'keystone' ? GOLD : roleColor(n);
    const { x, y } = n;
    ctx.globalAlpha = dim;
    // idle glow: keystones and notables read from far away
    if (!on && !inPrev && n.type !== 'small' && n.type !== 'start') {
      const gr = R * (n.type === 'keystone' ? 3.4 : 2.4);
      const g = ctx.createRadialGradient(x, y, R * 0.5, x, y, gr);
      g.addColorStop(0, n.type === 'keystone' ? 'rgba(233,196,106,.28)' : 'rgba(233,196,106,.13)'); g.addColorStop(1, 'rgba(233,196,106,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
    }
    // glow
    if (on || inPrev) {
      const gr = R * (n.type === 'keystone' ? 4.2 : n.type === 'notable' ? 3.4 : 3);
      const g = ctx.createRadialGradient(x, y, R * 0.4, x, y, gr);
      g.addColorStop(0, on ? 'rgba(255,170,60,.62)' : 'rgba(255,230,160,.35)'); g.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
    }
    const fill = (rr) => {
      if (on) { const g = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.35, 0, x, y, rr); g.addColorStop(0, HOT); g.addColorStop(0.45, AMBER); g.addColorStop(1, DEEP); return g; }
      return n.type === 'start' ? '#0e0a0c' : '#150c09';
    };
    const lw = (px) => px / view.z;
    if (n.type === 'small') {
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fillStyle = fill(R); ctx.fill();
      ctx.lineWidth = lw(2.2); ctx.strokeStyle = on ? '#ffe5a8' : rgba(ring, 0.75); ctx.stroke();
      if (!on) { ctx.beginPath(); ctx.arc(x, y, R * 0.32, 0, Math.PI * 2); ctx.fillStyle = rgba(ring, 0.4); ctx.fill(); }
      if (n.rare) {
        ctx.beginPath(); ctx.arc(x, y, R + 4.5, 0, Math.PI * 2); ctx.lineWidth = lw(1.6); ctx.strokeStyle = 'rgba(95,240,208,.85)'; ctx.stroke();
        drawIcon(ctx, 'crate', x, y, R * 0.5, on ? '#3a1a00' : '#5ff0d0', lw(1.6));
      }
    } else if (n.type === 'notable') {
      poly(ctx, x, y, R, 8, rad(22.5)); ctx.fillStyle = fill(R); ctx.fill();
      ctx.lineWidth = lw(2.8); ctx.strokeStyle = on ? '#ffe5a8' : rgba(GOLD, 0.85); ctx.stroke();
      poly(ctx, x, y, R * 0.6, 8, rad(22.5)); ctx.lineWidth = lw(1.4); ctx.strokeStyle = on ? 'rgba(90,40,0,.6)' : rgba(ring, 0.6); ctx.stroke();
    } else if (n.type === 'keystone') {
      poly(ctx, x, y, R + 8, 6, rad(30)); ctx.lineWidth = lw(1.3); ctx.strokeStyle = on ? 'rgba(255,225,150,.8)' : rgba(GOLD, 0.45); ctx.stroke();
      poly(ctx, x, y, R, 6, rad(30)); ctx.fillStyle = fill(R); ctx.fill();
      ctx.lineWidth = lw(3.4); ctx.strokeStyle = on ? '#fff0c0' : rgba(GOLD, 0.95); ctx.stroke();
      drawIcon(ctx, n.icon || KEYSTONES[n.id]?.icon || 'dot', x, y, R * 0.56, on ? '#2a1200' : GOLD, lw(2.2));
    } else { // start (role post)
      const own = ctl.role() === n.role;
      ctx.beginPath(); ctx.arc(x, y, R + 5, 0, Math.PI * 2); ctx.lineWidth = lw(1.4); ctx.strokeStyle = rgba(ring, own ? 0.9 : 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = own ? rgba(ring, 0.28) : fill(R); ctx.fill();
      ctx.lineWidth = lw(3); ctx.strokeStyle = on && !own ? '#ffe5a8' : ring; ctx.stroke();
      drawIcon(ctx, ROLES[n.role].icon, x, y, R * 0.62, own ? '#fff' : ring, lw(2));
      if (own) { const g = ctx.createRadialGradient(x, y, R, x, y, R * 3.2); g.addColorStop(0, rgba(ring, 0.5)); g.addColorStop(1, rgba(ring, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
    // allocatable pulse
    if (open) {
      const a = 0.35 + 0.35 * Math.sin(now * 4 + n.x * 0.05);
      ctx.beginPath(); ctx.arc(x, y, R + 5 + a * 2, 0, Math.PI * 2); ctx.lineWidth = lw(2); ctx.strokeStyle = `rgba(255,222,150,${a + 0.2})`; ctx.stroke();
    }
    if (inPrev) { ctx.beginPath(); ctx.arc(x, y, R + 5, 0, Math.PI * 2); ctx.lineWidth = lw(2); ctx.setLineDash([4 / view.z, 3 / view.z]); ctx.strokeStyle = '#fff2c0'; ctx.stroke(); ctx.setLineDash([]); }
    if (matches.has(n.id)) { const p = 0.5 + 0.5 * Math.sin(now * 6); ctx.beginPath(); ctx.arc(x, y, R + 9 + p * 3, 0, Math.PI * 2); ctx.lineWidth = lw(2.6); ctx.strokeStyle = `rgba(120,255,255,${0.6 + p * 0.4})`; ctx.stroke(); }
    if (hover === n.id) { ctx.beginPath(); ctx.arc(x, y, R + 6, 0, Math.PI * 2); ctx.lineWidth = lw(2.2); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawLabels() {
    const fs = 15 / view.z;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of NODES) {
      if (n.type === 'small') continue;
      if (n.type === 'notable' && view.z < 0.5) continue;
      const R = NODE_R[n.type];
      const on = alloc.has(n.id);
      ctx.globalAlpha = matches.size && !matches.has(n.id) ? 0.3 : 1;
      ctx.font = `${fs}px VT323, monospace`;
      const txt = (n.type === 'start' ? ROLES[n.role].name : n.name).toUpperCase();
      const yy = n.y + R + (n.type === 'keystone' ? 24 : 16) / view.z;
      ctx.lineWidth = 4 / view.z; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeText(txt, n.x, yy);
      ctx.fillStyle = n.type === 'keystone' ? (on ? '#fff0c0' : '#ffb56a') : n.type === 'notable' ? (on ? '#ffe9b0' : '#e7d9b4') : rgba(ROLES[n.role].color, 0.95);
      ctx.fillText(txt, n.x, yy);
    }
    ctx.globalAlpha = 1;
  }
  function drawRoleLabels() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ROLE_ORDER.forEach((id, i) => {
      const a = rad(-90 + 60 * i);
      ctx.font = '46px VT323, monospace';
      const mine = ctl.role() === id;
      ctx.fillStyle = rgba(ROLES[id].color, mine ? 0.9 : 0.4);
      ctx.fillText(ROLES[id].name.toUpperCase(), Math.cos(a) * LABEL_R, Math.sin(a) * LABEL_R);
      if (mine) { ctx.font = '22px VT323, monospace'; ctx.fillText('- YOUR ROLE -', Math.cos(a) * LABEL_R, Math.sin(a) * LABEL_R + 30); }
    });
  }
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#060406'; ctx.fillRect(0, 0, W, H);
    const bd = makeBackdrop();
    const S = Math.max(W, H) * 1.6 / 1024;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(bd, W / 2 - 512 * S + view.x * 0.18, H / 2 - 512 * S + view.y * 0.18, 1024 * S, 1024 * S);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * (W / 2 + view.x), dpr * (H / 2 + view.y));
    drawWedges(); drawCenter(now); drawEdges(now);
    for (const n of NODES_SORTED) drawNode(n, now);
    drawLabels(); drawRoleLabels();
  }
  function loop(t) {
    if (!alive) return;
    frames++;
    if (!root.isConnected && frames > 90) { alive = false; offRpg?.(); ro?.disconnect(); return; }   // panel closed (not yet attached during the first frames)
    requestAnimationFrame(loop);
    if (!root.isConnected) return;
    if (t - lastDraw < 30) return;
    lastDraw = t;
    if (!sized) resize();
    if (!sized) return;
    try { draw(t / 1000); } catch (e) { console.warn('[tree] draw', e); alive = false; }
  }
  let ro = null;
  const offRpg = game?.mods?.on?.('tfg:rpg', () => { if (alive) refresh(); });   // console / terminal / other modules changing the tree while the panel is open
  try { ro = new ResizeObserver(() => resize()); ro.observe(body); } catch { /* old browser */ }
  refresh();
  requestAnimationFrame(loop);
  return {
    el: root, refresh,
    /** Show the tooltip / hover state of a node (tests, screenshots). */
    hoverNode(id) {
      const n = NODE[id]; if (!n) return;
      updateHover(id);
      placeTip(W / 2 + view.x + n.x * view.z, H / 2 + view.y + n.y * view.z);
    },
    /** Pan / zoom so `id` is centred (search Enter uses the same). */
    focusNode(id) { if (NODE[id]) centerOn(NODE[id]); },
    destroy() { alive = false; ro?.disconnect(); offRpg?.(); },
  };
}

// ------------------------------------------------------------------ character sheet hook (ui.js): replaces the legacy skill rows
/** Fills the (emptied) `.skills` block of the TAB / character sheet: role, points and the open-tree buttons. */
export function decorateSkills(skillsEl, profile, ui) {
  try {
    ensureRpgProfile(profile);
    const game = ui?.app?.game || null;
    const r = profile.rpg;
    const role = ROLES[r.role] || null;
    skillsEl.replaceChildren();
    const el = (tag, cls, text) => mk(tag, cls, text);
    skillsEl.appendChild(el('div', 'label', `${L('PASSIVE TREE')} · ${L('POINTS')}: ${profile.skillPoints}`));
    const info = el('div', 'dim', role ? tf('{n} · {length} nodes · {tag}', { n: role.name.toUpperCase(), length: r.nodes.length, tag: role.tag }) : L('No role yet'));
    if (role) info.style.color = role.color;
    skillsEl.appendChild(info);
    const open = () => {
      if (game?.rpg) { game.rpg.open(); return; }
      const t = createTreePanel({ game: null, profile, onClose: () => ui.closePanel() });
      ui.openPanel(t.el);
    };
    const openRolesPanel = () => {
      const ctl = game?.rpg || createRpgController(profile);
      const rp = createRolesPanel({ game, ctl, profile, onClose: () => ui.closePanel() });
      ui.openPanel(rp.el);
    };
    const b1 = ui.button(L('PASSIVE TREE') + ' [K]', open, 'primary'); b1.dataset.nav = 'rpg:tree';
    const b2 = ui.button(L('ROLE') + (role ? ': ' + role.name : ''), openRolesPanel); b2.dataset.nav = 'rpg:role';
    const row = el('div', 'menu-row'); row.append(b1, b2);
    skillsEl.appendChild(row);
  } catch (e) { console.warn('[rpg] decorateSkills', e); }
}
