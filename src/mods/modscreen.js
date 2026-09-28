// Main-menu MODS screen: "TFG FEATURES" (built-in Lethal Company mod ports, on by default, one switch
// each) and "OPTIONAL MODS" (cheats / jokes / difficulty, off by default) plus user-imported mods.
import { el } from '../core/util.js';
import { t } from '../core/i18n.js';

const CSS = `
.tfgm-tabs { display: flex; gap: 8px; margin: 8px 0 2px; flex-wrap: wrap; }
.tfgm-tabs .btn.sel { background: rgba(255,138,61,0.22); border-color: var(--amber, #ff8a3d); }
.tfgm-note { font-size: 18px; opacity: 0.8; margin-top: 4px; }
.tfgm-cat { margin: 10px 0 2px; font-size: 20px; letter-spacing: 2px; color: #ffd9b8; opacity: 0.9; border-bottom: 1px dashed rgba(255,138,61,0.35); }
.tfgm-badge { font-size: 14px; padding: 0 6px; border: 1px solid rgba(255,255,255,0.3); margin-left: 6px; opacity: 0.8; white-space: nowrap; }
.tfgm-badge.host { border-color: rgba(125,200,255,0.6); color: #bfe6ff; }
.tfgm-badge.local { border-color: rgba(160,255,160,0.5); color: #c8ffc8; }
.tfgm-badge.cheat { border-color: rgba(255,120,120,0.6); color: #ffb0b0; }
.tfgm-count { float: right; font-size: 18px; opacity: 0.75; }
.mod-row .mod-cfg.collapsed { display: none; }
.tfgm-more { font-size: 15px; opacity: 0.7; cursor: pointer; margin-left: auto; }
`;

function css() {
  if (document.getElementById('tfgm-css')) return;
  const s = document.createElement('style'); s.id = 'tfgm-css'; s.textContent = CSS; document.head.appendChild(s);
}

const CAT_LABEL = { qol: 'QUALITY OF LIFE', content: 'CONTENT', horror: 'HORROR', social: 'CREW & SOCIAL', hud: 'VISOR / HUD', other: 'OTHER' };
const CAT_ORDER = ['content', 'horror', 'social', 'qol', 'hud', 'other'];

let tab = 'features';

export function buildModsScreen(mm, ui) {
  css();
  const wrap = el('div', { class: 'menu-frame wide' });
  const render = () => {
    wrap.innerHTML = '';
    const feats = mm.features();
    const opts = mm.optional();
    const onCount = feats.filter((d) => mm.isEnabled(d.id)).length;
    wrap.appendChild(el('div', { class: 'menu-title' }, t('MODS')));
    const tabs = el('div', { class: 'tfgm-tabs' },
      ui.button(`${t('TFG FEATURES')} (${onCount}/${feats.length})`, () => { tab = 'features'; render(); }, tab === 'features' ? 'sel' : ''),
      ui.button(`${t('OPTIONAL MODS')} (${opts.filter((d) => mm.isEnabled(d.id)).length}/${opts.length})`, () => { tab = 'optional'; render(); }, tab === 'optional' ? 'sel' : ''));
    wrap.appendChild(tabs);
    if (tab === 'features') {
      wrap.appendChild(el('div', { class: 'tfgm-note' }, t('Popular Lethal Company mods, rebuilt into TFG. On for everyone by default. CREW features follow the host\'s switches in multiplayer (host: terminal FEATURES); PERSONAL ones are just for you.')));
    } else {
      wrap.appendChild(el('div', { class: 'tfgm-note' }, t('Cheats, jokes and difficulty tweaks. Off by default. Changes apply after reload. Content mods must be enabled by everyone in the lobby.')));
    }
    const list = el('div', { class: 'mod-list' });
    const row = (def) => {
      const on = mm.isEnabled(def.id);
      const tog = el('input', { type: 'checkbox', checked: on });
      tog.addEventListener('change', () => { mm.setEnabled(def.id, tog.checked); ui.sfx(); render(); });
      const cfg = el('div', { class: 'mod-cfg collapsed' });
      const cur = mm.configFor(def.id);
      const entries = Object.entries(def.config || {});
      for (const [k, spec] of entries) {
        let input;
        if (spec.type === 'boolean') { input = el('input', { type: 'checkbox', checked: !!cur[k] }); input.addEventListener('change', () => mm.setConfig(def.id, k, input.checked)); }
        else if (spec.type === 'select') { input = el('select', {}, ...spec.options.map((o) => el('option', { value: o, selected: cur[k] === o }, o))); input.addEventListener('change', () => mm.setConfig(def.id, k, input.value)); }
        else { input = el('input', { type: 'number', value: cur[k], min: spec.min, max: spec.max, step: spec.step || 1, style: { width: '70px' } }); input.addEventListener('change', () => mm.setConfig(def.id, k, +input.value)); }
        input.addEventListener('keydown', (e) => e.stopPropagation());
        cfg.appendChild(el('label', { class: 'cfg' }, (spec.label || k) + ' ', input));
      }
      const badges = [];
      if (def.builtin) badges.push(el('span', { class: 'tfgm-badge ' + (def.scope === 'local' ? 'local' : 'host') }, def.scope === 'local' ? t('PERSONAL') : t('CREW')));
      if (!def.builtin && def.cheat) badges.push(el('span', { class: 'tfgm-badge cheat' }, t('CHEAT / JOKE')));
      if (def.registersContent && !def.builtin) badges.push(el('span', { class: 'tfgm-badge' }, t('CONTENT')));
      const more = entries.length ? el('span', { class: 'tfgm-more' }, `⚙ ${t('settings')}`) : null;
      if (more) more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cfg.classList.toggle('collapsed'); });
      return el('div', { class: 'mod-row' + (on ? ' on' : '') },
        el('label', { class: 'mod-head' }, tog, el('span', { class: 'mod-name' }, def.name), ...badges,
          el('span', { class: 'dim' }, ` v${def.version || '1.0'}${def.inspiredBy ? ' · ' + t('port of') + ' ' + def.inspiredBy : ''}${def.source === 'imported' ? ' · imported' : ''}`), more),
        el('div', { class: 'mod-desc' }, def.description || ''),
        cfg);
    };
    if (tab === 'features') {
      const byCat = new Map();
      for (const d of feats) { const c = CAT_LABEL[d.category] ? d.category : 'other'; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(d); }
      for (const c of CAT_ORDER) {
        const ds = byCat.get(c);
        if (!ds?.length) continue;
        list.appendChild(el('div', { class: 'tfgm-cat' }, t(CAT_LABEL[c])));
        for (const d of ds.sort((a, b) => a.name.localeCompare(b.name))) list.appendChild(row(d));
      }
    } else {
      for (const d of opts.sort((a, b) => a.name.localeCompare(b.name))) list.appendChild(row(d));
    }
    wrap.appendChild(list);
    if (mm.errors.length) wrap.appendChild(el('div', { class: 'err' }, 'Errors: ' + mm.errors.join(' | ')));
    const file = el('input', { type: 'file', accept: '.js,text/javascript', style: { display: 'none' } });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      const code = await f.text();
      if (!confirm(`Import "${f.name}"? Mods run code in your browser. Only import mods you trust.`)) return;
      mm.importMod(f.name, code);
      ui.toast('Imported. Reload to activate.');
    });
    wrap.appendChild(file);
    wrap.appendChild(el('div', { class: 'menu-row' },
      ui.button(t('BACK'), () => ui.showMenu('title')),
      ui.button(t('Import mod (.js)'), () => file.click()),
      ui.button(t('Apply & reload'), () => location.reload(), 'primary')));
  };
  render();
  return wrap;
}
