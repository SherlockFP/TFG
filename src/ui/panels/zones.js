// ZONES sector-map panel (module `zones`): moons -> zones list (owner / income / threat / defence), a top-down minimap per moon, and the zone detail with the
// build menu. Base classes from docs/wave4/ui2.md (menu-frame / cp-sec / btn / tfg-tag / tfg-plate); panel is dumb: every action goes through the module api (host requests).
import { el } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';

const CSS = `.overlay .menu-frame.zn{width:min(1040px,97vw);max-height:92vh}
.zn .cp-body{display:flex;flex-direction:column;gap:8px;padding:10px 16px;overflow:auto}
.zn .zn-top{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:19px}
.zn .zn-top b{color:var(--ph-hi,#ffd27a);font-weight:normal}
.zn .zn-sw{display:inline-block;width:14px;height:14px;border:1px solid #000;vertical-align:-2px;margin-right:4px}
.zn .zn-cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;align-items:start}
.zn .zn-list{display:flex;flex-direction:column;gap:6px;max-height:56vh;overflow:auto;scrollbar-width:thin;padding-right:4px}
.zn .zn-moon{border:1px solid var(--ph-line,#5a4a2a);background:rgba(0,0,0,.3)}
.zn .zn-mh{display:flex;justify-content:space-between;gap:8px;padding:2px 8px;background:rgba(255,190,90,.1);font-size:18px;text-transform:uppercase;letter-spacing:1px}
.zn .zn-mh.here{border-left:4px solid #f0b040}
.zn .zn-z{display:grid;grid-template-columns:22px minmax(0,1.3fr) auto auto auto;gap:8px;align-items:center;padding:2px 8px;cursor:pointer;font-size:17px;border-top:1px dashed rgba(255,190,90,.15)}
.zn .zn-z:hover{background:rgba(255,160,50,.12)}
.zn .zn-z.sel{background:rgba(255,160,50,.2);outline:1px solid var(--ph-hi,#ffd27a)}
.zn .zn-z .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zn .zn-z .dim{color:var(--ph-dim,#a58a55)}
.zn .zn-dot{width:14px;height:14px;border:2px solid #7a7f88;background:transparent}
.zn .zn-dot.own{border-color:#000}.zn .zn-dot.inf{background:#ff3a4a;border-color:#000}.zn .zn-dot.locked{opacity:.35}
.zn .zn-side{display:flex;flex-direction:column;gap:8px;min-width:0}
.zn canvas{width:100%;max-width:250px;aspect-ratio:1;border:1px solid var(--ph-line,#5a4a2a);background:#05070a;align-self:center;cursor:pointer;image-rendering:pixelated}
.zn .zn-box{border:1px solid var(--ph-line,#5a4a2a);background:rgba(0,0,0,.34);padding:6px 10px;font-size:18px;line-height:1.2}
.zn .zn-box .big{font-size:22px;color:var(--ph-hi,#ffd27a)}
.zn .zn-box .dim{color:var(--ph-dim,#a58a55);font-size:16px}
.zn .zn-box .bad{color:#ff8a6a}.zn .zn-box .good{color:#7dff7d}
.zn .zn-def{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;padding:1px 0;font-size:17px}
.zn .zn-def .btn{padding:1px 8px;font-size:15px}
.zn .zn-def.off{opacity:.45}`;
let cssDone = false;

/**
 * The sector map of one moon (top-down, ship in the middle, zone dots). Shared by the panel canvas (250 px) and the ship CRT (zones2: ~100 px), hence `size` scales everything.
 * mo = snapshot moon row, S = snapshot, selZ = highlighted zone id, opts = { hits: [] (filled with dot positions), me: {x, z} (live player dot) }
 */
export function drawSectorMap(g, size, mo, S, selZ, opts = {}) {
  const k = size / 250, W = size, H = size, R = 118 * k, sc = R / 125, px1 = (v) => Math.max(1, Math.round(v * k));
  g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,190,90,.16)'; g.lineWidth = 1;
  for (const r of [40, 80, 120]) { g.beginPath(); g.arc(W / 2, H / 2, r * sc, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(W / 2, 4 * k); g.lineTo(W / 2, H - 4 * k); g.moveTo(4 * k, H / 2); g.lineTo(W - 4 * k, H / 2); g.stroke();
  g.fillStyle = '#f0b040'; g.fillRect(W / 2 - 5 * k, H / 2 - 3 * k, 10 * k, 6 * k);   // the ship
  let wi = 0;
  for (const q of mo.zones) {
    let x, y;
    if (q.core) { x = q.core.x; y = q.core.z; }
    else if (q.kind === 'field') { x = Math.cos(q.ang) * q.dist; y = Math.sin(q.ang) * q.dist; }
    else { const a = 0.9 + wi++ * 1.7 + (q.wing === 'entrance' ? 0 : 0.5); x = Math.cos(a) * 92; y = Math.sin(a) * 92; }
    if (q.core?.in) { const a = 0.9 + wi++ * 1.7 + (q.wing === 'entrance' ? 0 : 0.5); x = Math.cos(a) * 92; y = Math.sin(a) * 92; }   // interior cores live under the map: drawn on the wing ring
    const px = W / 2 + x * sc, py = H / 2 + y * sc, rr = 9 * k;
    g.beginPath(); g.arc(px, py, rr, 0, 7);
    if (q.s === 'own') { g.fillStyle = S.col; g.fill(); } else if (q.s === 'inf') { g.fillStyle = '#ff3a4a'; g.fill(); } else { g.strokeStyle = q.s === 'locked' ? '#4a4f58' : '#9aa4b0'; g.lineWidth = px1(2); g.stroke(); }
    if (q.kind === 'wing') { g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(px - 4 * k, py - 4 * k, 8 * k, 8 * k); }
    if (q.pending) { g.strokeStyle = '#ff5a3a'; g.lineWidth = px1(2); g.beginPath(); g.arc(px, py, rr + 4 * k, 0, 7); g.stroke(); }
    if (selZ === q.id) { g.strokeStyle = '#fff'; g.lineWidth = px1(2); g.beginPath(); g.arc(px, py, 13 * k, 0, 7); g.stroke(); }
    g.fillStyle = '#000'; g.font = `bold ${Math.max(7, Math.round(12 * k))}px sans-serif`; g.textAlign = 'center'; g.fillText(q.id, px, py + 4 * k);
    opts.hits?.push({ x: px, y: py, z: q.id });
  }
  if (opts.me) { g.fillStyle = '#7dff7d'; g.fillRect(W / 2 + opts.me.x * sc - 2 * k, H / 2 + opts.me.z * sc - 2 * k, Math.max(2, 4 * k), Math.max(2, 4 * k)); }
  if (size >= 200) { g.fillStyle = 'rgba(255,190,90,.6)'; g.font = '11px monospace'; g.textAlign = 'left'; g.fillText(mo.away ? t('ARCHIVED') : mo.here && mo.zones.some((q) => q.core) ? t('LIVE') : t('SCHEMATIC'), 5, 12); }
}

export function createZonesPanel(game, api) {
  if (!cssDone && typeof document !== 'undefined') { cssDone = true; const s = document.createElement('style'); s.id = 'tfg-zones-panel'; s.textContent = CSS; document.head.appendChild(s); }
  const ui = game.ui;
  const body = el('div', { class: 'cp-body' });
  const root = el('div', { class: 'menu-frame crt-panel zn' }, ui.panelHead(t('SECTOR MAP'), t('reclaimed zones')), body, ui.panelFoot([]));
  let sel = null, lastSig = '', timer = 0, canvasHits = [];

  const money = (n) => '▮' + (n | 0);
  const stateTag = (q) => q.s === 'own' ? t('OWNED') : q.s === 'inf' ? t('INFECTED') : q.s === 'locked' ? t('LOCKED') : t('FREE');
  function pickDefault(S) {
    if (sel && S.moons.find((m) => m.id === sel.m)?.zones.find((q) => q.id === sel.z)) return;
    if (S.inZone) { sel = { m: S.inZone.m, z: S.inZone.z }; return; }
    const here = S.moons.find((m) => m.here) || S.moons.find((m) => m.owned) || S.moons[0];
    sel = here ? { m: here.id, z: here.zones[0].id } : null;
  }
  function drawMap(cv, S) {
    const mo = S.moons.find((m) => m.id === sel?.m); if (!mo) return;
    cv.width = 250; cv.height = 250;
    canvasHits = [];
    drawSectorMap(cv.getContext('2d'), 250, mo, S, sel.z, { hits: canvasHits, me: mo.here ? game.player?.pos : null });
  }
  function detail(S) {
    const mo = S.moons.find((m) => m.id === sel?.m), q = mo?.zones.find((z) => z.id === sel?.z);
    const box = el('div', { class: 'zn-box' });
    if (!q) return box;
    box.append(el('div', { class: 'big' }, `${t(q.name)}  `, el('span', { class: 'tfg-tag' }, stateTag(q))), el('div', { class: 'dim' }, `${mo.name}${mo.away ? ' (' + t('out of range: archived') + ')' : ''} - ${q.kind === 'wing' ? t('facility wing') : t('open sector')} - ${t('threat')} ${q.threat}`));
    const inHere = S.inZone && S.inZone.m === mo.id && S.inZone.z === q.id;
    if (q.s === 'free' || q.s === 'inf') box.append(el('div', {}, tf('Beacon: {c}. Land, clear the area around the relay, stand at the core and press E.', { c: money(q.cost) }), q.s === 'inf' ? ' ' + t('(recapture: half price)') : ''));
    if (q.s === 'locked') box.append(el('div', { class: 'bad' }, t('Opens in a later quota.')));
    if (q.s === 'own') {
      const st = q.st || {};
      box.append(el('div', {}, `${t('Income')} ${money(q.income)}/${t('day')} + ${t('material')} - ${t('upkeep')} ${money(q.upkeep)}${st.dry ? ' - ' + t('UNPAID: defences at 40%') : ''}`));
      box.append(el('div', {}, `${t('Defence power')} ${q.def}  -  ${t('odds vs the next wave')} ${q.odds}%`, q.pending ? el('span', { class: 'bad' }, '  ' + t('TARGETED by the Algorithm')) : null));
      const upCost = api.ZN.upCost[st.up | 0];
      const upRow = el('div', { class: 'zn-def' }, el('span', {}, `${t('Zone level')} ${st.up | 0}/${api.ZN.maxUp}  (${q.used}/${q.slots} ${t('slots')})`), el('span'), el('span'), (st.up | 0) < api.ZN.maxUp ? el('button', { class: 'btn small', onclick: () => api.up(mo.id, q.id) }, `${t('UPGRADE')} ${money(upCost)}`) : el('span', { class: 'dim' }, t('MAX')));
      box.append(el('div', { class: 'cp-sec' }, t('FORTIFY')), upRow);
      if (!inHere) box.append(el('div', { class: 'dim' }, t('Stand inside this zone to build or sell defences.')));
      if (q.interior) box.append(el('div', { class: 'dim' }, t('Facility wing: traps on the corridors, always armed, they only hurt creatures.')));
      for (const id of api.defsFor(q.interior)) {
        const d = api.DEFS[id], n = (st.d || {})[id] | 0, okQ = api.unlocked(id);
        const can = inHere && okQ && q.used < q.slots && S.credits >= d.cost;
        const row = el('div', { class: 'zn-def' + (okQ ? '' : ' off') },
          el('span', {}, `${t(d.name)}${n ? '  x' + n : ''}`, el('span', { class: 'dim' }, `  ${t('power')} ${d.power}  ${t('upkeep')} ${d.upkeep}`)),
          el('span', { class: 'dim' }, okQ ? '' : t('LATER')), el('button', { class: 'btn small', disabled: can ? null : true, onclick: () => api.build(q.id, id) }, `${t('BUILD')} ${money(d.cost)}`),
          n ? el('button', { class: 'btn small', disabled: inHere ? null : true, onclick: () => api.sell(q.id, id) }, t('SELL')) : el('span'));
        box.append(row);
      }
      if (!q.interior && q.walls) {   // zones2: walls / gates on the snap grid, placed where you look
        const W = api.WALL, w = q.walls, can = inHere && mo.here;
        box.append(el('div', { class: 'cp-sec' }, `${t('WALLS')}  ${w.n}/${w.cap}  (${w.gates} ${t('gates')})`));
        if (can) box.append(el('div', { class: 'dim' }, t('Look at the ground you want to wall off, then press the button. Raiders walk round walls and funnel through gates.')));
        const btn = (label, cost, fn) => el('button', { class: 'btn small', disabled: can && S.credits >= cost ? null : true, onclick: fn }, `${label} ${money(cost)}`);
        box.append(el('div', { class: 'zn-def' }, el('span', {}, t(W.names[0])), el('span'), btn(t('PLACE'), W.cost[0], () => api.wall(q.id, 1, false)), btn('x4', W.cost[0] * 4, () => api.wall(q.id, 4, false))));
        box.append(el('div', { class: 'zn-def' }, el('span', {}, t(W.names[1])), el('span'), btn(t('PLACE'), W.cost[1], () => api.wall(q.id, 1, true)), btn(t('LINE'), W.cost[0] * 3 + W.cost[1], () => api.wall(q.id, 4, true))));
        box.append(el('div', { class: 'zn-def' }, el('span', { class: 'dim' }, t('Remove the nearest piece (50% back)')), el('span'), el('span'), el('button', { class: 'btn small', disabled: can && w.n ? null : true, onclick: () => api.wallSell(q.id) }, t('SELL'))));
      }
      {   // zones2: the extractor (homeworld2 miner rules)
        const M = api.MINER, mn = q.mn, b = q.mnBonus;
        box.append(el('div', { class: 'cp-sec' }, t('EXTRACTOR')));
        const purity = mn ? [t('impure node'), t('normal node'), t('pure node')][mn.p | 0] : '';
        box.append(el('div', {}, mn ? `Mk${mn.l}  -  ${purity}  -  +${money(b.credits)}/${t('day')} + ${b.mat} ${t('material')}  -  ${t('upkeep')} ${money(3 + 2 * mn.l)}` : t('None. Digs a node inside the zone: more income (inside the daily cap) and a biome material.')));
        const can = inHere && q.mnOk && q.mnCost > 0 && S.credits >= q.mnCost;
        box.append(el('div', { class: 'zn-def' + (q.mnOk ? '' : ' off') }, el('span', {}, mn ? (mn.l < M.maxLv ? t('Upgrade the extractor') : t('Maximum Mk')) : t('Build an extractor')), el('span', { class: 'dim' }, q.mnOk ? '' : t('LATER')),
          mn && mn.l >= M.maxLv ? el('span', { class: 'dim' }, t('MAX')) : el('button', { class: 'btn small', disabled: can ? null : true, onclick: () => api.mine(q.id) }, `${mn ? t('UPGRADE') : t('BUILD')} ${money(q.mnCost)}`),
          mn ? el('button', { class: 'btn small', disabled: inHere ? null : true, onclick: () => api.mineSell(q.id) }, t('SELL')) : el('span')));
      }
    }
    return box;
  }
  function render(force) {
    const S = api.snapshot();
    pickDefault(S);
    const sig = JSON.stringify([S.moons.map((m) => m.zones.map((q) => [q.s, q.income, q.def, q.used, q.slots, q.pending, q.core?.x, q.st?.up, q.st?.dry, q.mn?.l, q.walls?.n])), sel, S.credits, S.inZone, S.income.credits, S.owned, S.pend.length]);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    body.innerHTML = '';
    const top = el('div', { class: 'zn-top' },
      el('span', {}, el('span', { class: 'zn-sw', style: { background: S.col } }), `${t('HELD')} `, el('b', {}, `${S.owned}/${S.maxOwned}`)),
      el('span', {}, `${t('INCOME')} `, el('b', {}, `${money(S.income.credits)}/${t('day')}`), el('span', { class: 'dim' }, ` (${t('cap')} ${money(S.income.cap)}${S.income.capped ? ', ' + t('CAPPED') : ''})`)),
      el('span', {}, `${t('UPKEEP')} `, el('b', {}, `${money(S.upkeep)}/${t('day')}`)),
      el('span', {}, `${t('CREDITS')} `, el('b', {}, money(S.credits))));
    const list = el('div', { class: 'zn-list' });
    for (const mo of S.moons) {
      const inc = mo.zones.reduce((a, q) => a + q.income, 0);
      const m = el('div', { class: 'zn-moon' }, el('div', { class: 'zn-mh' + (mo.here ? ' here' : '') }, el('span', {}, `${mo.name}  T${mo.tier}`), el('span', {}, `${mo.owned}/${mo.zones.length}${inc ? '  ' + money(inc) + '/' + t('day') : ''}`)));
      for (const q of mo.zones) {
        m.append(el('div', { class: 'zn-z' + (sel?.m === mo.id && sel?.z === q.id ? ' sel' : ''), onclick: () => { sel = { m: mo.id, z: q.id }; render(true); } },
          el('span', { class: 'zn-dot ' + q.s, style: q.s === 'own' ? { background: S.col } : {} }),
          el('span', { class: 'n' }, `${q.id} ${t(q.name)}${q.pending ? '  !' : ''}`),
          el('span', { class: 'dim' }, `${t('T')}${q.threat}`),
          el('span', {}, q.s === 'own' ? `${money(q.income)}` : q.s === 'inf' ? t('INFECTED') : ''),
          el('span', { class: 'dim' }, q.s === 'own' ? `${t('DEF')} ${q.def}` : '')));
      }
      list.append(m);
    }
    const cv = el('canvas', { width: 250, height: 250, onclick: (e) => {
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (250 / r.width), y = (e.clientY - r.top) * (250 / r.height);
      let best = null, bd = 22; for (const h of canvasHits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
      if (best) { sel = { m: sel.m, z: best.z }; render(true); }
    } });
    const side = el('div', { class: 'zn-side' }, cv, detail(S));
    body.append(top, el('div', { class: 'zn-cols' }, list, side));
    if (S.pend.length) body.append(el('div', { class: 'zn-box bad' }, S.pend.map((p) => tf('THREAT: {z} on {m}', { z: t(S.moons.find((m) => m.id === p.m)?.zones.find((q) => q.id === p.z)?.name || p.z), m: S.moons.find((m) => m.id === p.m)?.name || p.m })).join('  |  ')));
    if (S.rep) body.append(el('div', { class: 'zn-box dim' }, tf('Last day {d}: +{i} income (gross {g}), -{u} upkeep on {n} zones.', { d: S.rep.day, i: money(S.rep.income), g: money(S.rep.gross), u: money(S.rep.upkeep), n: S.rep.n })));
    drawMap(cv, S);
  }
  render(true);
  timer = setInterval(() => { try { render(false); } catch (e) { console.warn('[zones] panel', e); } }, 500);
  return { el: root, refresh: () => render(true), dispose() { clearInterval(timer); root.remove(); } };
}
