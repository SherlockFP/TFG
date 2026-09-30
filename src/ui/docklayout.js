// LAYOUT MANAGER (wave 8, declutter; docs/wave8/declutter.md). One 4 Hz pass keeps the three HUD docks (dock.js) and the fixed
// banners of the modules from sitting on top of each other, at any viewport size:
//   right dock   starts under the level/coins block + toast stack, ends above the hotbar
//   left dock    ends above the objective tracker, starts above the chat log lines that are currently visible
//   bottom dock  centred above the hotbar row; the bottom-centre banners (zone bar, hints, intercom) stack ABOVE it
//   top banners  (vote, PA, siege banner, horde banner, id card, big text) stack under the clock / compass / quota block
// When a dock has less room than its items need, the items with the HIGHEST `order` (least important) get `.hud-clip`.
// window.__hcLayout = false switches the pass off (before/after screenshots).
const BOTTOM_BANNERS = ['.zn-bar', '#p4-hint', '.ob-skip', '.cd-cap'];   // [qa1] .cd-cap (director caption) sat 10 px into the downed bar
const TOP_BANNERS = [['.a1-vote', 0], ['.algo-sub', 0], ['.ob-pa', 0], ['.sg-banner', 0], ['.hban', 0.5], ['.g2-card', 0], ['.hud-big', 0]];
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
// [perf3] clip planning is read-only: the natural (unclipped) height of every item is remembered (k._hh) while it is visible, so the
// priority cut never has to strip the classes and re-measure (that was a forced layout per item, every tick).
function clipPlan(d) {
  const kids = d.children, n = kids.length, hs = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = kids[i];
    if (k.classList.contains('hud-clip')) hs[i] = k.classList.contains('hc-off') ? 0 : (k._hh || 0);
    else hs[i] = k._hh = k.offsetHeight;
  }
  const cs = getComputedStyle(d);
  return { hs, gap: parseFloat(cs.rowGap) || 0, pad: (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) };
}
function applyClip(d, plan, avail) {
  const { hs, gap, pad } = plan, kids = d.children;
  let total = pad, cnt = 0;
  for (let i = 0; i < hs.length; i++) if (hs[i] > 0) total += hs[i] + (cnt++ ? gap : 0);
  const cut = new Array(hs.length).fill(false);
  for (let i = hs.length - 1; i >= 0 && total > avail + 1; i--) if (hs[i] > 0) { total -= hs[i] + (cnt > 1 ? gap : 0); cnt--; cut[i] = true; }
  for (let j = 0; j < kids.length; j++) if (cut[j] !== kids[j].classList.contains('hud-clip')) kids[j].classList.toggle('hud-clip', cut[j]);
}

export function layoutDocks(docks) {
  if (typeof document === 'undefined' || window.__hcLayout === false) return;
  const hud = document.querySelector('.hud');
  if (!hud || hud.classList.contains('hidden')) return;
  const H = innerHeight;
  // [perf3] ONE read phase (every rect/scrollHeight the pass needs), then ONE write phase. The old pass wrote a style and re-read a rect
  // per banner/dock (~20 forced synchronous layouts per 250 ms tick on the busy HUD DOM = a periodic hitch).
  const inv = q1('.hud-inv'), tr = q1('.hud-tr'), toasts = q1('.hud-toasts'), xpf = q1('.hud-xpfeed');
  const clock = q1('.hud-clock'), comp = q1('.hud-compass'), quotaEl = document.querySelector('.hud-quota'), quota = quotaEl && shown(quotaEl);
  const topEls = TOP_BANNERS.map(([sel, mid]) => { const e = document.querySelector(sel); return e ? [sel, mid, e, shown(e)] : null; });
  const botEls = BOTTOM_BANNERS.map((sel) => { const e = document.querySelector(sel); return e ? [e, shown(e)] : null; });
  const R = docks.right, L = docks.left, B = docks.bottom;
  const asgB = Math.max(0, ...[...document.querySelectorAll('.tfg-asg, [data-hud-right]')].map((e) => shown(e)?.bottom + 8 || 0));   // [qa1] mod widgets (assignment card) sit at the top right: the right dock started under them
  // [qa2] toasts (right column) must not slide under the Algorithm ticker (centre top, up to 560 px wide): push them below it when they overlap horizontally
  const toastEl = document.querySelector('.hud-toasts'), algoR = shown(document.querySelector('.algo-sub'));
  let toastMt = null;
  if (toastEl) {
    const mt = parseFloat(toastEl.style.marginTop) || 0, baseTop = toastEl.getBoundingClientRect().top - mt, tLeft = innerWidth - 30 - Math.min(520, innerWidth * 0.36);
    toastMt = algoR && algoR.right > tLeft - 8 ? Math.max(0, Math.round(algoR.bottom + 8 - baseTop)) : 0;
  }
  const chatEl = document.querySelector('.chat');
  let chatTop = null;
  if (chatEl) {
    const lines = chatEl.querySelectorAll('.chat-line:not(.old)');
    chatTop = chatEl.classList.contains('open') ? shown(chatEl) : (lines.length ? shown(lines[0]) : null);
  }
  const obj = L ? q1('.objectives') : null, tl = L ? q1('.hud-tl') : null;
  const bH = B && shown(B) ? B.offsetHeight : 0;
  const clipR = R && clipPlan(R), clipL = L && clipPlan(L), clipB = B && clipPlan(B);
  // ---- compute
  const invTop = inv ? inv.top : H - 120;
  let topY = Math.max(clock ? clock.bottom : 0, comp ? comp.bottom : 0);
  let quotaTop = null;
  if (quota) { if (comp) { quotaTop = comp.bottom + 4; topY = Math.max(topY, quotaTop + quota.height); } else topY = Math.max(topY, quota.bottom); }
  let y = topY + 10;
  const topPins = [];
  for (const it of topEls) {
    if (!it) continue;
    const [sel, mid, e, r] = it;
    if (!r) { topPins.push([e, null]); continue; }
    if (sel === '.hud-big') { const top = Math.max(y, H * 0.22); topPins.push([e, top]); y = Math.max(y, top + r.height + 8); continue; }
    topPins.push([e, y + r.height * mid]);
    y += r.height + 8;
  }
  const rTop = R ? Math.min(Math.max(tr ? tr.bottom + 10 : 96, xpf ? xpf.bottom + 6 : 0, toasts ? toasts.bottom + 8 : 0, asgB), H * 0.5) : 0;
  const rAvail = Math.max(0, invTop - 12 - rTop);
  let lBottom = 100;
  if (chatTop) lBottom = Math.max(lBottom, H - chatTop.top + 10);
  const lAvail = Math.max(0, H - lBottom - Math.max(obj ? obj.bottom + 8 : 0, (tl?.bottom || 0) + 8));
  const bb = Math.max(92, inv ? H - inv.top + 8 : 92), bAvail = Math.max(0, H * 0.34);
  let by = bb + (bH ? Math.min(bH, bAvail) + 8 : 0);
  if (!B) by = 92;
  const botPins = [];
  for (const it of botEls) {
    if (!it) continue;
    const [e, r] = it;
    if (!r) { botPins.push([e, null]); continue; }
    botPins.push([e, by]);
    by += r.height + 8;
  }
  // ---- write
  if (toastEl && toastMt !== null) toastEl.style.marginTop = toastMt ? toastMt + 'px' : '';
  if (quotaEl) { if (quotaTop !== null) pinTo(quotaEl, 'top', quotaTop); else if (!quota || !comp) unpin(quotaEl, 'top'); }
  for (const [e, v] of topPins) { if (v === null) unpin(e, 'top'); else pinTo(e, 'top', v); }
  if (R) { R.style.top = Math.round(rTop) + 'px'; R.style.maxHeight = Math.round(rAvail) + 'px'; R.style.overflow = 'hidden'; applyClip(R, clipR, rAvail); }
  if (L) { L.style.bottom = Math.round(lBottom) + 'px'; L.style.maxHeight = Math.round(lAvail) + 'px'; L.style.overflow = 'hidden'; applyClip(L, clipL, lAvail); }
  if (B) { B.style.bottom = Math.round(bb) + 'px'; B.style.maxHeight = Math.round(bAvail) + 'px'; B.style.overflow = 'hidden'; applyClip(B, clipB, bAvail); }
  for (const [e, v] of botPins) { if (v === null) unpin(e, 'bottom'); else pinTo(e, 'bottom', v); }
}

/** Called from hudDock(): starts the 4 Hz layout pass (+ the tiny style for clipped items). */
export function startLayout(docks) {
  if (timer || typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = '.hud-dock-item{flex:none}.hud-dock-item.hud-clip{display:none !important}body:has(.report) .hud-quota{visibility:hidden}';   // [feelfix2] the day report carries its own quota footer: the top banner must not show through / under it   // flex:none: items must overflow (and get clipped by priority), never shrink onto each other
  document.head.appendChild(st);
  timer = setInterval(() => { if (!document.hidden) { try { layoutDocks(docks); } catch { /* never break the HUD */ } } }, 250);
  timer?.unref?.();   // node harness tests: the HUD poll must not keep the process alive
}

/**
 * [n3fix] De-overlap HUD edge markers (tasks.js). items: [{ x, y, d, first? }] in px (d = distance, first = keep in place). A marker over the hotbar row is
 * lifted above it, then any marker within (gx, gy) of an already placed one is stacked upward in gy steps; after 3 tries the (far) marker is hidden
 * (item.hide = true), so two distance labels never print over each other. `hb` = the hotbar rect ({ left, right, top }) or null. Returns the same array.
 */
export function spreadMarkers(items, hb, gx = 74, gy = 40) {
  const order = items.slice().sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || a.d - b.d);
  const placed = [];
  for (const it of order) {
    if (hb && it.x > hb.left - 26 && it.x < hb.right + 26 && it.y > hb.top - 44) it.y = hb.top - 44;
    let tries = 0;
    while (tries < 3 && placed.some((o) => Math.abs(o.x - it.x) < gx && Math.abs(o.y - it.y) < gy)) { it.y -= gy; tries++; }
    it.hide = tries >= 3 || it.y < 30;
    if (!it.hide) placed.push(it);
  }
  return items;
}
/** the hotbar rect (visible `.hud-inv`), or null */
export function hotbarRect() { const r = typeof document !== 'undefined' ? shown(document.querySelector('.hud-inv')) : null; return r ? { left: r.left, right: r.right, top: r.top } : null; }
