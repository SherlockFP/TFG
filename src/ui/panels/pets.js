// PET panel (N, or PETS in the terminal): STABLE (6 slots, stats, abilities, evolution tree, rename, set active, release) - NEST (incubator) -
// SKINS (collars, hats, colours, seasonal; some from achievements, some for Clout) - SHOP (HQ only). Dark CRT / amber look, self-contained DOM + CSS.
import { t, tf } from '../../core/i18n.js';
import * as C from '../../game/pets_core.js';

const STYLE_ID = 'tfg-pets-style';
const CSS = `
.pt{width:min(980px,95vw);max-height:88vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,9,4,.97),rgba(6,4,2,.97));border:1px solid var(--amber-dim,#a8531f);
 box-shadow:0 0 50px rgba(0,0,0,.85);padding:12px 18px;font-family:var(--font,'VT323',monospace);color:var(--text,#ffd9b8);overflow:hidden}
.pt-title{font-family:var(--font2,monospace);font-size:18px;color:var(--amber,#ff8a3d);letter-spacing:3px;margin-bottom:6px}
.pt-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(255,138,61,.3);margin-bottom:8px}
.pt-tab{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;padding:7px 12px;cursor:pointer;color:var(--amber-dim,#a8531f)}
.pt-tab.sel{color:#1a0d04;background:var(--amber,#ff8a3d)}
.pt-body{overflow:auto;flex:1;min-height:0}
.pt-slots{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:8px}
.pt-slot{border:1px solid rgba(255,138,61,.3);padding:6px;cursor:pointer;background:rgba(0,0,0,.3);font-size:18px;text-align:center;min-height:64px}
.pt-slot.sel{border-color:#ffd23f;box-shadow:inset 0 0 14px rgba(255,210,63,.15)}.pt-slot.act{background:rgba(255,138,61,.14)}
.pt-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pt-h{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;color:var(--amber,#ff8a3d);margin:8px 0 4px}
.pt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:3px 0;font-size:19px}
.pt-bar{height:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,138,61,.25);flex:1;min-width:100px;position:relative}.pt-bar>i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#ff8a3d,#ffd23f)}
.pt-btn{font-family:var(--font,monospace);font-size:19px;color:var(--amber,#ff8a3d);background:rgba(255,138,61,.08);border:1px solid var(--amber-dim,#a8531f);padding:1px 9px;cursor:pointer}
.pt-btn:hover{background:var(--amber,#ff8a3d);color:#150a02}.pt-btn.dis{opacity:.35;pointer-events:none}.pt-btn.sel{background:rgba(255,210,63,.25);border-color:#ffd23f}
.pt-ab{border-left:3px solid #ffd23f;padding:1px 8px;margin:3px 0;font-size:18px}.pt-ab.off{opacity:.45;border-color:#555}
.pt-note{opacity:.75;font-size:17px}.pt-good{color:#7dff7d}.pt-bad{color:#ff6b5a}.pt-gold{color:#ffd23f}
@media (max-width:760px){.pt-slots{grid-template-columns:repeat(3,1fr)}.pt-cols{grid-template-columns:1fr}}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
function btn(label, fn, cls = '') { const b = mk('button', 'pt-btn ' + cls, label); b.addEventListener('click', (e) => { e.stopPropagation(); fn?.(e); }); return b; }
function bar(f) { const b = mk('div', 'pt-bar'), i = mk('i'); i.style.width = Math.max(0, Math.min(100, f * 100)) + '%'; b.appendChild(i); return b; }

let lastTab = 'stable';
export function createPetsPanel({ game, api, tab } = {}) {
  ensureStyle();
  if (tab) lastTab = tab;
  const root = mk('div', 'pt');
  root.addEventListener('keydown', (e) => { const tg = e.target?.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') e.stopPropagation(); });
  let sel = null;
  const sfx = (n = 'ui_click') => { try { game?.audio?.ui?.(n, 0.5); } catch { /* ignore */ } };
  const st = () => api.state();
  const msg = (r) => { if (r && !r.ok && r.err) game?.ui?.toast?.(t(r.err), 'warn'); sfx(r?.ok === false ? 'ui_error' : 'ui_click'); render(); };

  function stableTab(body) {
    const s = st();
    if (!sel || !C.findPet(s, sel)) sel = s.active || s.stable[0]?.id || null;
    const slots = mk('div', 'pt-slots');
    for (let i = 0; i < C.MAX_STABLE; i++) {
      const p = s.stable[i];
      const el = mk('div', 'pt-slot' + (p && p.id === sel ? ' sel' : '') + (p && p.id === s.active ? ' act' : ''));
      if (p) {
        el.append(mk('div', '', `${p.nm}${p.sh ? ' ✦' : ''}`), mk('div', 'pt-note', `${t(C.SPECIES[p.sp].name)} ${t('Level')} ${C.levelOf(p)}`));
        if (C.isResting(s, p)) el.append(mk('div', 'pt-bad', 'zZz'));
        el.addEventListener('click', () => { sel = p.id; sfx(); render(); });
      } else el.append(mk('div', 'pt-note', t('Empty')));
      slots.appendChild(el);
    }
    body.appendChild(slots);
    const p = C.findPet(s, sel);
    if (!p) { body.appendChild(mk('div', 'pt-note', t('Empty') + ' - N'));  return; }
    const sp = C.SPECIES[p.sp], stt = C.petStats(p), lv = C.levelOf(p), stage = C.stageOf(p);
    const cols = mk('div', 'pt-cols'), a = mk('div'), b = mk('div');
    a.append(mk('div', 'pt-h', `${p.nm} - ${t(C.evolutionName(p.sp, stage))}${p.sh ? ' ✦ ' + t('Shiny') : ''}`));
    const next = lv >= C.MAX_LEVEL ? 1 : (p.xp - C.xpAtLevel(lv)) / C.xpToNext(lv);
    const r1 = mk('div', 'pt-row'); r1.append(mk('span', '', `${t('Level')} ${lv}`), bar(next)); a.appendChild(r1);
    const r2 = mk('div', 'pt-row'); r2.append(mk('span', '', `${t('Loyalty')} ${p.ly}`), bar(p.ly / 100)); a.appendChild(r2);
    a.append(mk('div', 'pt-row', `${t(sp.roleName)} | HP ${stt.maxHp} | ATK ${stt.atk.toFixed(1)} | SPD ${stt.spd.toFixed(1)}`));
    const tr = C.TRAITS[p.tr];
    a.append(mk('div', 'pt-row', `${t('Trait')}: ${t(tr.name)} - ${t(tr.desc)}`));
    a.append(mk('div', 'pt-note', t(sp.desc)));
    const row = mk('div', 'pt-row');
    row.append(btn(p.id === s.active ? t('Active') : t('Set active'), () => msg(api.setActive(p.id)), p.id === s.active ? 'sel' : ''),
      btn(t('Rename'), () => { const n = window.prompt(t('Rename'), p.nm); if (n) { api.rename(p.id, n); render(); } }),
      btn(t('Release'), () => { if (window.confirm(t('Release') + ' ' + p.nm + '?')) { api.release(p.id); sel = null; render(); } }));
    a.appendChild(row);
    if (api.setMode) {   // [finish] behaviour: follow / stay / fetch / guard + delivery (keys O, Shift+O; command L)
      const mr = mk('div', 'pt-row');
      for (const m of C.MODES) mr.append(btn(t(m), () => { api.setMode(m); sfx(); render(); }, api.mode() === m ? 'sel' : ''));
      const dr = mk('div', 'pt-row');
      for (const d of ['me', 'ship']) dr.append(btn(t(d), () => { api.setDest(d); sfx(); render(); }, (s.dest === 'ship' ? 'ship' : 'me') === d ? 'sel' : ''));
      a.append(mk('div', 'pt-note', t('Pet mode: {m}').replace('{m}', '') + ' [O]'), mr, mk('div', 'pt-note', t('Deliver to: {d}').replace('{d}', '') + ' [Shift+O]  |  L'), dr);
    }
    b.append(mk('div', 'pt-h', t('Abilities')));
    for (const ab of sp.abilities) b.append(mk('div', 'pt-ab' + (lv >= ab.lv ? '' : ' off'), `${t(ab.name)} (${t('Level')} ${ab.lv}) - ${t(ab.desc)}`));
    b.append(mk('div', 'pt-h', t('Evolution')));
    for (const e of C.evolutionTree(p.sp)) b.append(mk('div', 'pt-row' + (stage >= e.stage ? ' pt-gold' : ''), `${e.stage >= 1 ? '●' : ''} ${t(e.name)} - ${t('Level')} ${e.lv}`));
    cols.append(a, b); body.appendChild(cols);
  }

  function nestTab(body) {
    const s = st();
    body.append(mk('div', 'pt-h', t('Incubator')));
    for (let i = 0; i < C.INCUBATOR_SLOTS; i++) {
      const e = s.incubator[i], r = mk('div', 'pt-row');
      if (!e) r.append(mk('span', 'pt-note', `#${i + 1} ${t('Empty')}`));
      else r.append(mk('span', '', `#${i + 1} ${t(C.EGG_ITEMS[e.item]?.name || e.item)} - ${C.daysLeft(e, s.clock)} ${t('day(s) left')}`), bar(C.eggProgress(e, s.clock)));
      body.appendChild(r);
    }
    body.append(mk('div', 'pt-note', t('Use the egg inside the ship.')));
    const held = game?.player?.heldItem?.();
    if (held && C.isEggItem(held.type)) body.appendChild(btn(t('Put egg in incubator'), () => { const r = api.incubateItem(held); msg(r.ok ? { ok: true } : r); }));
    body.append(mk('div', 'pt-h', 'Dex'));
    body.append(mk('div', 'pt-row', C.SPECIES_IDS.map((id) => `${s.dex[id] ? '●' : '○'} ${t(C.SPECIES[id].name)}${s.dex[id + ':shiny'] ? ' ✦' : ''}`).join('  ')));
  }

  function skinsTab(body) {
    const s = st(), p = C.findPet(s, sel || s.active);
    if (!p) { body.append(mk('div', 'pt-note', t('Empty'))); return; }
    const ctx = api.ctx();
    body.append(mk('div', 'pt-note', `${p.nm} | ◈${Math.round(game?.profile?.coins || 0)}`));
    for (const cat of C.SKIN_CATS) {
      body.append(mk('div', 'pt-h', t(C.SKIN_CAT_NAMES[cat])));
      const row = mk('div', 'pt-row');
      for (const d of C.SKINS[cat]) {
        const acc = C.skinAccess(ctx, cat, d.id);
        const name = cat === 'v' ? t(C.colourName(p.sp, d.id)) : t(d.name);
        if (acc.ok) row.appendChild(btn(name, () => msg(api.equip(p.id, cat, d.id)), p.sk[cat] === d.id ? 'sel' : ''));
        else if (acc.why === 'buy') row.appendChild(btn(`${name} ◈${acc.cost}`, () => { const r = api.buySkin(cat, d.id); if (r.ok) api.equip(p.id, cat, d.id); msg(r); }));
        else row.appendChild(btn(`${name} (${acc.why === 'ach' ? t('Locked') : t('Seasonal')})`, null, 'dis'));
      }
      body.appendChild(row);
    }
  }

  function shopTab(body) {
    const hq = api.atHq();
    body.append(mk('div', 'pt-h', t('Pet Shop (HQ only)')), mk('div', 'pt-note', `◈${Math.round(game?.profile?.coins || 0)}`));
    for (const id of C.SHOP_SPECIES) {
      const d = C.SPECIES[id], row = mk('div', 'pt-row');
      row.append(mk('span', '', `${t(d.name)} - ${t(d.roleName)}`), mk('span', 'pt-note', t(d.desc)));
      row.appendChild(btn(`${t('Buy')} ◈${d.price}`, () => msg(api.buyPet(id)), hq ? '' : 'dis'));
      body.appendChild(row);
    }
  }

  function render() {
    root.replaceChildren();
    root.appendChild(mk('div', 'pt-title', `${t('PETS')} [N]`));
    const tabs = mk('div', 'pt-tabs');
    for (const [id, label] of [['stable', 'Stable'], ['nest', 'Nest'], ['skins', 'Skins'], ['shop', 'Shop']]) {
      const el = mk('div', 'pt-tab' + (lastTab === id ? ' sel' : ''), t(label));
      el.addEventListener('click', () => { lastTab = id; sfx(); render(); });
      tabs.appendChild(el);
    }
    root.appendChild(tabs);
    const body = mk('div', 'pt-body');
    root.appendChild(body);
    try { ({ stable: stableTab, nest: nestTab, skins: skinsTab, shop: shopTab })[lastTab](body); } catch (e) { body.append(mk('div', 'pt-bad', String(e.message))); console.warn('[pets] panel', e); }
    const foot = mk('div', 'pt-row');
    foot.appendChild(btn(t('Close'), () => game?.ui?.closePanel?.()));
    root.appendChild(foot);
  }
  render();
  void tf;
  return { el: root, dispose() { /* nothing to release */ }, render };
}
