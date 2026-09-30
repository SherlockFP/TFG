// ship-loot-tracker — port of ShipLoot (tinyhoot).
// A small visor panel with the live value of all scrap on board, quota progress and what the
// loot would fetch at the Company today.
KefalAPI.defineMod({
  id: 'ship-loot-tracker',
  name: 'Ship Loot Tracker',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'ShipLoot',
  builtin: true,
  scope: 'local',
  category: 'hud',
  enabledByDefault: true,
  description: 'Shows the running total value of all scrap aboard the ship, quota progress, and what it would sell for at 0-Algorithm HQ today.',
  config: {
    showMode: { type: 'select', options: ['in ship', 'ship + moon', 'always'], default: 'in ship', label: 'Show' },
    position: { type: 'select', options: ['above inventory', 'top center', 'left'], default: 'above inventory', label: 'Position' },
    showBreakdown: { type: 'boolean', default: true, label: 'Top items breakdown' },
    includeHeld: { type: 'boolean', default: true, label: 'Count scrap carried by crew aboard' },
    colorByQuota: { type: 'boolean', default: true, label: 'Color by quota progress' },
  },
  init(api, cfg) {
    // mirrors game/items.js isSellable + world/ship.js insideShip (mods cannot import engine code)
    const sellable = (d) => !!d && (['scrap', 'big', 'fish', 'drop'].includes(d.kind) || (!!d.value && d.kind !== 'tool'));
    const inShip = (p) => p.x > -7 && p.x < 7 && p.z > -3.5 && p.z < 3.5 && p.y > -0.8 && p.y < 3.9;
    const buyRate = (daysLeft, r = 0.5) => (daysLeft <= 0 ? 1 : daysLeft === 1 ? 0.77 + r * 0.1 : daysLeft === 2 ? 0.53 + r * 0.1 : 0.3 + r * 0.08);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const POS = {
      'above inventory': 'right: 30px; bottom: 108px;',
      'top center': 'left: 50%; top: 96px; transform: translateX(-50%);',
      left: 'left: 34px; top: 300px;',
    };
    const CSS = `
.kmod-sl { position: absolute; ${POS[cfg.position] || POS['above inventory']} min-width: 230px; background: rgba(0,0,0,0.42); border: 1px solid rgba(255,138,61,0.5); padding: 4px 10px 6px; font-size: 19px; line-height: 1.15; pointer-events: none; }
.kmod-sl .t { font-size: 22px; color: #ffd9b8; display: flex; justify-content: space-between; gap: 12px; }
.kmod-sl .t b { color: #fff; font-weight: normal; }
.kmod-sl .bar { position: relative; height: 7px; border: 1px solid rgba(255,138,61,0.6); margin: 4px 0 3px; }
.kmod-sl .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #ffb070; }
.kmod-sl .bar i.pr { background: rgba(125,255,125,0.45); }
.kmod-sl .dim { opacity: 0.8; font-size: 17px; }
.kmod-sl .ok { color: #7dff7d; } .kmod-sl .bad { color: #ff8a7a; }
.kmod-sl .it { display: flex; justify-content: space-between; gap: 10px; font-size: 16px; opacity: 0.85; }`;

    let box = null, acc = 0, lastHtml = '';
    const ensure = (game) => {
      if (box && box.isConnected) return true;
      const hudEl = game.ui?.hud?.el;
      if (!hudEl) return false;
      if (!document.getElementById('kmod-sl-css')) {
        const s = document.createElement('style'); s.id = 'kmod-sl-css'; s.textContent = CSS; document.head.appendChild(s);
      }
      box = document.createElement('div');
      box.className = 'kmod-sl';
      hudEl.appendChild(box);
      lastHtml = '';
      return true;
    };

    function tally(game) {
      const p = game.player;
      let total = 0, n = 0;
      const list = [];
      for (const it of game.items.all()) {
        const d = it.def;
        if (!sellable(d) || it.soulbound || it.type === 'body') continue;
        let aboard = false;
        if (it.state === 'world') aboard = inShip(it.obj.position);
        else if (cfg.includeHeld && it.holder && !String(it.holder).startsWith('c:')) {
          if (it.holder === game.selfId) aboard = p.inShip && !p.dead;
          else { const r = game.remotes.get(it.holder); aboard = !!r && !r.dead && !!(r.flags & 16); }
        }
        if (!aboard) continue;
        total += it.value || 0; n++;
        list.push(it);
      }
      list.sort((a, b) => (b.value || 0) - (a.value || 0));
      return { total, n, list };
    }

    api.on('update', (dt, game) => {
      acc -= dt;
      if (acc > 0) return;
      acc = 0.25;
      if (!ensure(game)) return;
      const run = game.run || {};
      const p = game.player;
      const ph = run.phase;
      let show = !!ph && ph !== 'fired' && !p.dead;
      if (show && cfg.showMode === 'in ship') show = p.inShip;
      else if (show && cfg.showMode === 'ship + moon') show = p.inShip || ph === 'moon' || ph === 'company';
      box.style.display = show ? '' : 'none';
      if (!show) return;
      const { total, n, list } = tally(game);
      const rate = ph === 'company' && run.buyRate ? run.buyRate : buyRate(run.daysLeft ?? 3, run.buyRnd ?? 0.5);
      const quota = run.quota || 0, sold = run.sold || 0;
      const worth = Math.round(total * rate);
      const need = Math.max(0, quota - sold);
      const soldF = quota ? Math.min(1, sold / quota) : 0;
      const projF = quota ? Math.min(1, (sold + worth) / quota) : 0;
      const fullF = quota ? Math.min(1, (sold + total) / quota) : 0;
      const cls = !cfg.colorByQuota ? '' : worth >= need ? 'ok' : total >= need ? '' : 'bad';
      // [algoctx] plain language; the quota numbers live in the top bar only (one source)
      let html = `<div class="t"><span>${esc(api.t('LOOT ABOARD'))}</span><b class="${cls}">▮${total}</b></div>`;
      html += `<div class="dim">${esc(api.tf(n === 1 ? '{n} item' : '{n} items', { n }))}</div>`;
      html += `<div class="bar"><i class="pr" style="width:${(fullF * 100).toFixed(1)}%"></i><i style="width:${(projF * 100).toFixed(1)}%;opacity:.55"></i><i style="width:${(soldF * 100).toFixed(1)}%"></i></div>`;
      html += `<div class="dim">${esc(api.tf('The Company pays {r}% today', { r: Math.round(rate * 100) }))}: <span class="${cls}">▮${worth}</span>${need > 0 ? ` · ${esc(api.tf('▮{n} to go', { n: need }))}` : ` · <span class="ok">${esc(api.t('QUOTA MET'))}</span>`}</div>`;
      if (cfg.showBreakdown && list.length) {
        for (const it of list.slice(0, 4)) html += `<div class="it"><span>${esc(it.label || it.def.name)}</span><span>▮${it.value}</span></div>`;
        if (list.length > 4) html += `<div class="it"><span>${esc(api.tf('+{n} more', { n: list.length - 4 }))}</span><span></span></div>`;
      }
      if (html !== lastHtml) { box.innerHTML = html; lastHtml = html; }
    });
  },
});
