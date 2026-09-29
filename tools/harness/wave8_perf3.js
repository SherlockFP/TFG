// wave8 perf3: per-'update'-handler cost table, out-of-range oscillator stacks, objective flag at 0 scrap, layoutDocks cost,
// day-summary report z-order vs the Morning-Rules vote. Body of an async fn for headless.mjs.
const g = kefal.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { oscStacks: [] }; const tm = [];
try {
  const AC = window.AudioContext || window.webkitAudioContext, orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () {
    const o = orig.call(this), p = o.frequency, d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(p), 'value');
    Object.defineProperty(p, 'value', { get() { return d.get.call(this); }, set(v) { if (v > 11025 && out.oscStacks.length < 3) out.oscStacks.push(v + ' ' + String(new Error().stack).split('\n').slice(2, 6).map((x) => x.trim().replace(/http:\/\/[^/]+/, '')).join(' < ')); d.set.call(this, v); } });
    return o;
  };
} catch (e) { out.oscHookErr = String(e); }
const H = {}; const set = g.mods._h.get('update'); const wrapped = new Set(); let idx = 0;
for (const fn of set) {
  const name = '#' + (idx++) + ' ' + (fn.name || '') + ' ' + fn.toString().replace(/\s+/g, ' ').slice(0, 90);
  H[name] = { n: 0, tot: 0, max: 0 };
  wrapped.add(function (...a) { const t0 = performance.now(); try { return fn.apply(this, a); } finally { const d = performance.now() - t0, h = H[name]; h.n++; h.tot += d; if (d > h.max) h.max = d; } });
}
g.mods._h.set('update', wrapped); g.mods._a?.delete('update');
const ticks = async (n) => { for (let i = 0; i < n; i++) { const a = performance.now(); kefal.tick(1, 1 / 30, false); tm.push(performance.now() - a); if (i % 5 === 4) await sleep(2); } };
out.credits0 = g.run.credits;
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true;
let t0 = performance.now(); g.hostLever(g.selfId); g.hostFinishLanding?.(); out.landMs = +(performance.now() - t0).toFixed(1);
await ticks(30);
for (const h of Object.values(H)) { h.n = 0; h.tot = 0; h.max = 0; }
tm.length = 0; await ticks(40);
out.objs = g.objectives.compute().slice(0, 3).map((o) => o.text + (o.done ? ' [DONE]' : ''));
out.collected = g.hostData?.dayStats?.collected;
try {
  const dk = await import('/src/ui/dock.js'), dl = await import('/src/ui/docklayout.js');
  const docks = { left: dk.hudDock('left'), right: dk.hudDock('right'), bottom: dk.hudDock('bottom') };
  const ls = []; for (let i = 0; i < 12; i++) { const a = performance.now(); dl.layoutDocks(docks); ls.push(performance.now() - a); await sleep(20); }
  ls.sort((a, b) => a - b); out.layoutDocks = { med: +ls[6].toFixed(2), max: +ls[11].toFixed(2) };
} catch (e) { out.layoutErr = String(e).slice(0, 150); }
{
  const fake = document.createElement('div'); fake.className = 'a1-vote'; fake.style.cssText = 'height:200px'; document.getElementById('ui').appendChild(fake);
  g.ui.showDaySummary({ moon: 'Hamsi', company: false, collected: 51, shipValue: 0, deaths: [], fines: 9, allDead: false, kills: 0, day: 1, quota: 130, sold: 0, daysLeft: 2, leftValue: 10, credits: 51, players: [] }, g);
  await sleep(1200);
  const r = document.querySelector('.report');
  if (r) { const b = r.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + 60); out.reportTop = !!e && (r === e || r.contains(e)); }
  out.reportExists = !!r; out.voteZ = getComputedStyle(fake).zIndex; out.reportZ = r ? getComputedStyle(r).zIndex : null;
}
tm.sort((a, b) => b - a); out.tickWorst = tm.slice(0, 6).map((x) => +x.toFixed(1)); out.tickMedian = +tm[tm.length >> 1].toFixed(2);
const rows = Object.entries(H).filter(([, h]) => h.n).map(([k, h]) => ({ k, avg: +(h.tot / h.n).toFixed(2), max: +h.max.toFixed(1) })).sort((a, b) => b.avg - a.avg);
out.sumUpdateAvg = +rows.reduce((s, r) => s + r.avg, 0).toFixed(2); out.top = rows.slice(0, 12);
return out;
