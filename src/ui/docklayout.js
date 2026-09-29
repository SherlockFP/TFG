// LAYOUT MANAGER (wave 8, declutter; docs/wave8/declutter.md). One 4 Hz pass keeps the three HUD docks (dock.js) and the fixed
// banners of the modules from sitting on top of each other, at any viewport size:
//   right dock   starts under the level/coins block + toast stack, ends above the hotbar
//   left dock    ends above the objective tracker, starts above the chat log lines that are currently visible
//   bottom dock  centred above the hotbar row; the bottom-centre banners (zone bar, hints, intercom) stack ABOVE it
//   top banners  (vote, PA, siege banner, horde banner, id card, big text) stack under the clock / compass / quota block
// When a dock has less room than its items need, the items with the HIGHEST `order` (least important) get `.hud-clip`.
// window.__hcLayout = false switches the pass off (before/after screenshots).
const BOTTOM_BANNERS = ['.zn-bar', '#p4-hint', '.ob-skip', '.algo-sub'];
const TOP_BANNERS = [['.a1-vote', 0], ['.ob-pa', 0], ['.sg-banner', 0], ['.hban', 0.5], ['.g2-card', 0], ['.hud-big', 0]];
let timer = 0;

function shown(e) {
  if (!e || !e.isConnected || !e.getClientRects().length) return null;
  const r = e.getBoundingClientRect();
  if (r.height < 1) return null;
  const cs = getComputedStyle(e);
  if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
  return r;
}
const q1 = (s) => shown(document.querySelector(s));
function pinTo(e, prop, px) {
  const v = Math.round(px) + 'px';
  if (e.style.getPropertyValue(prop) !== v || e.style.getPropertyPriority(prop) !== 'important') e.style.setProperty(prop, v, 'important');
}
function unpin(e, prop) { if (e.style.getPropertyValue(prop)) e.style.removeProperty(prop); }
function clipToFit(d, avail) {
  const kids = [...d.children];
  for (const k of kids) k.classList.remove('hud-clip');
  let i = kids.length - 1;
  while (i >= 0 && d.scrollHeight > avail + 1) {
    if (kids[i].offsetHeight > 0) kids[i].classList.add('hud-clip');
    i--;
  }
}

export function layoutDocks(docks) {
  if (typeof document === 'undefined' || window.__hcLayout === false) return;
  const hud = document.querySelector('.hud');
  if (!hud || hud.classList.contains('hidden')) return;
  const H = innerHeight;
  const inv = q1('.hud-inv'), tr = q1('.hud-tr'), toasts = q1('.hud-toasts'), xpf = q1('.hud-xpfeed');
  const invTop = inv ? inv.top : H - 120;
  // ---- top-centre block: clock / compass / quota (the quota used to sit on the compass tape)
  const clock = q1('.hud-clock'), comp = q1('.hud-compass'), quota = document.querySelector('.hud-quota');
  let topY = Math.max(clock ? clock.bottom : 0, comp ? comp.bottom : 0);
  if (quota && shown(quota)) {
    if (comp) pinTo(quota, 'top', comp.bottom + 4); else unpin(quota, 'top');
    topY = Math.max(topY, quota.getBoundingClientRect().bottom);
  }
  // ---- top banners stack under it
  let y = topY + 10;
  for (const [sel, mid] of TOP_BANNERS) {
    const e = document.querySelector(sel), r = shown(e);
    if (!e) continue;
    if (!r) { unpin(e, 'top'); continue; }
    if (sel === '.hud-big') { pinTo(e, 'top', Math.max(y, H * 0.22)); y = Math.max(y, e.getBoundingClientRect().bottom + 8); continue; }
    pinTo(e, 'top', y + r.height * mid);
    y += r.height + 8;
  }
  // ---- right dock
  const R = docks.right;
  if (R) {
    let top = Math.max(tr ? tr.bottom + 10 : 96, xpf ? xpf.bottom + 6 : 0, toasts ? toasts.bottom + 8 : 0);
    top = Math.min(top, H * 0.5);
    const avail = Math.max(0, invTop - 12 - top);
    R.style.top = Math.round(top) + 'px'; R.style.maxHeight = Math.round(avail) + 'px'; R.style.overflow = 'hidden';
    clipToFit(R, avail);
  }
  // ---- left dock: above the objective tracker (grows up from the bottom), lifted over the chat lines that are on screen
  const L = docks.left;
  const chatEl = document.querySelector('.chat');
  let bottom = 100;
  if (chatEl) {
    const lines = [...chatEl.querySelectorAll('.chat-line:not(.old)')];
    const cr = chatEl.classList.contains('open') ? shown(chatEl) : (lines.length ? shown(lines[0]) : null);
    if (cr) bottom = Math.max(bottom, H - cr.top + 10);
  }
  if (L) {
    const obj = q1('.objectives');
    const floor = Math.max(obj ? obj.bottom + 8 : 0, (q1('.hud-tl')?.bottom || 0) + 8);
    const avail = Math.max(0, H - bottom - floor);
    L.style.bottom = Math.round(bottom) + 'px'; L.style.maxHeight = Math.round(avail) + 'px'; L.style.overflow = 'hidden';
    clipToFit(L, avail);
  }
  // ---- bottom dock + bottom-centre banners
  const B = docks.bottom;
  let by = 92;
  if (B) {
    const bb = Math.max(92, inv ? H - inv.top + 8 : 92);   // above the hotbar row when the hotbar is up
    B.style.bottom = Math.round(bb) + 'px';
    const avail = Math.max(0, H * 0.34);
    B.style.maxHeight = Math.round(avail) + 'px'; B.style.overflow = 'hidden';
    clipToFit(B, avail);
    by = bb + (shown(B) ? B.getBoundingClientRect().height + 8 : 0);
  }
  for (const sel of BOTTOM_BANNERS) {
    const e = document.querySelector(sel), r = shown(e);
    if (!e) continue;
    if (!r) { unpin(e, 'bottom'); continue; }
    pinTo(e, 'bottom', by);
    by += r.height + 8;
  }
}

/** Called from hudDock(): starts the 4 Hz layout pass (+ the tiny style for clipped items). */
export function startLayout(docks) {
  if (timer || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = '.hud-dock-item{flex:none}.hud-dock-item.hud-clip{display:none !important}';   // flex:none: items must overflow (and get clipped by priority), never shrink onto each other
  document.head.appendChild(st);
  timer = setInterval(() => { if (!document.hidden) { try { layoutDocks(docks); } catch { /* never break the HUD */ } } }, 250);
}
