// node tools/harness/hud_overlap.test.mjs - wave 9 "three message lanes". No browser: lays out every always-on / lane HUD element at 1280x720
// from the real CSS rules (src/ui/style.css, src/game/algorithm.js) + the real dock math (planDocks / toastPush in src/ui/docklayout.js)
// and fails when two of them overlap. SCOPE: the always-on frame only; stacked banners (TOP_BANNERS/BOTTOM_BANNERS), hud-chips and .tfg-asg are not modelled. Heights of content-sized boxes are documented worst-case estimates (what the lanes allow).
import fs from 'fs';
import { planDocks, toastPush, promptBottom } from '../../src/ui/docklayout.js';
import { HUD, TOAST_MAX, TOAST_MS, TOAST_LONG_MS } from '../../src/ui/hud.js';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const CSS = rd('src/ui/style.css') + '\n' + rd('src/game/algorithm.js');
/** last declaration of `prop` (px) in a rule whose selector list has a selector ending in exactly `sel` */
function px(sel, prop) {
  let v = null;
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').some((s) => s.trim() === sel || s.trim().endsWith('\n' + sel))) continue;
    const d = m[2].match(new RegExp('(?:^|[;\\s])' + prop + '\\s*:\\s*(-?[\\d.]+)px'));
    if (d) v = parseFloat(d[1]);
  }
  if (v === null) throw new Error(`no ${prop} for ${sel}`);
  return v;
}
const W = 1280, H = 720;
const R = (x, y, w, h) => ({ x, y, w, h, r: x + w, b: y + h });
const els = {};

// ---- pinned elements (positions come from the CSS)
const tlH = 26 + 22 + 8 + 88 + 14 + 22;                       // LIVE strip + body figure + stamina + weight row
els.tl = R(px('.hud-tl', 'left'), px('.hud-tl', 'top'), 150, tlH);
const clockH = 30 * 1.15 + 2;
els.clock = R(W / 2 - 70, px('.hud-clock', 'top'), 140, clockH);
const cvW = px('.hud-compass canvas', 'width'), cvH = px('.hud-compass canvas', 'height');
els.compass = R((W - cvW) / 2, px('.hud-compass', 'top'), cvW, cvH);
// the Algorithm slot (lane 1): docklayout pins it 10 px under the clock / compass; 2 lines max
const algoTop = Math.max(els.clock.b, els.compass.b) + 10;
els.algo = R((W - Math.min(560, W * 0.7)) / 2, algoTop, Math.min(560, W * 0.7), 2 * 22 + 8);
// right column: level / coins, xp feed (2 lines when active), toasts (lane 2)
els.tr = R(W - px('.hud-tr', 'right') - 260, px('.hud-tr', 'top'), 260, 62);
els.xpf = R(W - px('.hud-xpfeed', 'right') - 220, els.tr.b + 8, 220, 2 * 22);
const toastW = Math.min(520, W * 0.36), toastH = TOAST_MAX * 32 + (TOAST_MAX - 1) * 4;
let toastTop = Math.max(els.xpf.b + 6, 96);
toastTop += toastPush({ right: els.algo.r, bottom: els.algo.b }, toastTop, W);
els.toasts = R(W - px('.hud-toasts', 'right') - toastW, toastTop, toastW, toastH);
// hotbar: 6 slots (MAX_HOTBAR) 96 x 70, 6 px gaps
const invW = 6 * 96 + 5 * 6, invH = 70;
els.inv = R(W - px('.hud-inv', 'right') - invW, H - px('.hud-inv', 'bottom') - invH, invW, invH);
// left: objectives (2 goals) + chat (4 visible lines)
els.obj = R(px('.objectives', 'left'), Math.max(px('.objectives', 'top'), els.tl.b + 14), Math.max(250, W / 2 - 330), 2 * 28 + 14);
const chatH = 4 * 24 + 30;
els.chat = R(px('.chat', 'left'), H - px('.chat', 'bottom') - chatH, px('.chat', 'width'), chatH);
// centre: interact prompt (lane 3)
els.prompt = R(W / 2 - 220, H / 2 + 46, 440, 64);

// ---- docks: the budget rectangles the layout pass hands them (300 px wide at most)
const plan = planDocks(H, { inv: els.inv.y, tr: els.tr.b, xpf: els.xpf.b, toasts: els.toasts.b, asgB: 0, obj: els.obj.b, tl: els.tl.b, chatTop: els.chat.y });
els.dockR = R(W - 14 - 300, plan.rTop, 300, plan.rAvail);
els.dockL = R(14, H - plan.lBottom - plan.lAvail, 300, plan.lAvail);
els.dockB = R(W / 2 - 150, H - plan.bb - plan.bAvail, 300, plan.bAvail);

chk(TOAST_MAX === 2 && TOAST_MS === 4000, 'lane 2 = 2 toasts, 4 s');
chk(promptBottom(H) >= els.prompt.b, 'prompt reserve covers the prompt');
chk(els.algo.y >= els.compass.b, 'algo slot sits under the compass');
const names = Object.keys(els);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = els[names[i]], b = els[names[j]];
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;   // an empty dock budget cannot overlap
  if (a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b) chk(false, `${names[i]} [${[a.x, a.y, a.r, a.b].map(Math.round)}] overlaps ${names[j]} [${[b.x, b.y, b.r, b.b].map(Math.round)}]`);
}
for (const [k, v] of Object.entries(els)) chk(v.x >= 0 && v.y >= 0 && v.r <= W && v.b <= H, `${k} leaves the 1280x720 frame`);

// ---- sources: the three lanes, the 5-line Tab card, no terminal dump (static checks)
const hud = rd('src/ui/hud.js'), calm = rd('src/game/hudcalm.js'), term = rd('src/game/terminal.js'), mm = rd('src/game/mapmods.js');
chk(/_tx === label/.test(hud) && /TOAST_MAX/.test(hud), 'toasts are deduped and capped');
chk(/hc-compact/.test(calm) && /isVeteran\(game\.profile\)/.test(calm) && /o\.pin \|\| o\.kind === 'hint'/.test(calm), 'Tab card: compact + veteran cut');
const at = calm.indexOf('const lines = [');
const compact = calm.slice(at, calm.indexOf('];', at));
chk((compact.match(/^\s{8}(?:goal|line)/gm) || []).length === 5, 'compact Tab card has exactly 5 lines');
chk(!/gen\.forEach/.test(term) && /HELP ALL/.test(term), 'terminal: no server dump under MOONS, HELP is short');
chk(!/this\.print\('\\n' \+ readout\(\)\)/.test(mm), 'MOONS does not append the SECTOR MAP readout');

// ---- behaviour (fake DOM + fake timers): toasts queue instead of evicting; 9 s opt-in survives; HELP stays short with mods loaded
{
  const timers = []; let now = 0;
  globalThis.setTimeout = (fn, d) => { timers.push({ fn, at: now + d, id: timers.length + 1 }); return timers.length; };
  globalThis.clearTimeout = (id) => { const t = timers[id - 1]; if (t) t.dead = true; };
  const advance = (ms) => { now += ms; for (const tm of timers.filter((x) => !x.dead && x.at <= now)) { tm.dead = true; tm.fn(); } };
  const mkEl = () => { const cl = new Set(), kids = [], e = { children: kids, textContent: '',
    classList: { add: (c) => cl.add(c), remove: (c) => cl.delete(c), contains: (c) => cl.has(c) },
    set className(v) { cl.clear(); v.split(/\s+/).forEach((c) => c && cl.add(c)); },
    setAttribute() {}, addEventListener() {}, appendChild(k) { kids.push(k); k.parent = e; return k; }, append(...ks) { ks.forEach((k) => e.appendChild(k)); },
    remove() { const i = e.parent?.children.indexOf(e); if (i >= 0) e.parent.children.splice(i, 1); }, style: {} }; return e; };
  globalThis.document = { createElement: mkEl, createTextNode: (x) => ({ nodeType: 3, x }) };
  const box = mkEl(), fake = { $: { toasts: box }, toastQ: null, gate: null, pendingToasts: [], pendingBig: null, nextFlush: 0 };
  Object.setPrototypeOf(fake, HUD.prototype);
  const text = () => box.children.map((k) => k._tx);
  fake.showToast('a', 'info'); fake.showToast('b', 'info'); fake.showToast('c', 'info'); fake.showToast('d', 'info');
  chk(text().join() === 'a,b' && fake.toastQ.length === 2, 'three+ toasts in one tick: first two stay, the rest queue (nothing evicted unread)');
  advance(TOAST_MS + 1);
  chk(text().join() === 'c,d' && !fake.toastQ.length, 'queued toasts appear when the slots free, in order');
  advance(TOAST_MS + 1);
  fake.showToast('lobby', 'info', 9000); fake.showToast('x', 'info', 6000);
  advance(TOAST_MS + 1);
  chk(text().join() === 'lobby', 'a 9000 ms request is honoured (lobby code toast lasts 9 s) while ms > 4000 without opt-in is capped to 4 s');
  advance(TOAST_LONG_MS - TOAST_MS);
  chk(text().length === 0, 'the 9 s toast is gone after 9 s');
  // flushPending must not push gated toasts out unread
  fake.showToast('p', 'info'); fake.showToast('q', 'info'); fake.pendingToasts.push(['r', 'info']); fake.nextFlush = 0;
  fake.flushPending();
  chk(text().join() === 'p,q' && fake.pendingToasts.length === 1, 'flushPending waits while both slots are busy');
  advance(TOAST_MS + 1); fake.flushPending();
  chk(text().join() === 'r', 'flushPending releases once a slot is free');

  const { ModManager } = await import('../../src/mods/modapi.js');
  const cmds = new Map(); for (let i = 0; i < 30; i++) cmds.set('cmd' + i, { fn() {}, help: 'x', owner: null });
  const out = [], term = { print: (m) => out.push(m) }, mm = { commands: cmds, featureOn: () => true };
  ModManager.prototype.terminalCommand.call(mm, 'help', [], term); advance(1);
  chk(out.length === 1 && out[0].split('\n').length === 1 && !/CMD0/.test(out[0]), 'HELP with 30 module commands adds one hint line, not a dump');
  out.length = 0; ModManager.prototype.terminalCommand.call(mm, 'help', ['all'], term); advance(1);
  chk(out.length === 1 && out[0].split('\n').length >= 30, 'HELP ALL lists the module commands');
}
console.log(bad ? `hud_overlap FAIL (${bad})` : `hud_overlap OK (${names.length} elements)`);
process.exit(bad ? 1 : 0);
