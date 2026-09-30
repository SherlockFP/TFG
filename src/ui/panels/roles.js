// ROLES panel: six big cards (icon, description, bonuses, starting kit). Opened from the passive tree (ROLE button),
// the ship's crew-roster locker [E] and the terminal (ROLE). Works with a game (in-game rules: orbit only) or a bare
// profile (main menu). Self-contained DOM + injected CSS in the amber CRT look.
import { ROLES, bonusLines } from '../../game/passivetree.js';
import { itemDef } from '../../game/items.js';
import { iconCanvas } from './treeicons.js';
import { getLang, addTranslations, t } from '../../core/i18n.js';

const TR = {
  'CHOOSE YOUR ROLE': 'ROLÜNÜ SEÇ', 'CURRENT ROLE': 'MEVCUT ROL', SELECT: 'SEÇ', Close: 'Kapat', 'STARTING KIT': 'BAŞLANGIÇ EKİPMANI',
  'Roles are not classes: a small passive bonus, a daily kit and the start of your passive tree.': 'Roller sınıf değildir: küçük bir pasif bonus, günlük bir ekipman ve pasif ağacının başlangıç noktası.',
  'once per day, in your hands on landing': 'günde bir kez, inince elinde',
  Scout: 'Gözcü', Enforcer: 'İnfazcı', Occultist: 'Büyücü', 'Field Medic': 'Saha Sağlıkçısı', Technician: 'Teknisyen', Hauler: 'Yükçü',
};
addTranslations(TR);
const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const L = (s) => (tr() ? TR[s] : null) || t(s);

const STYLE_ID = 'tfg-roles-style';
const CSS = `
.rl{width:min(1180px,96vw);max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,9,4,.98),rgba(6,4,2,.98));
 border:1px solid var(--amber-dim,#a8531f);box-shadow:0 0 60px rgba(0,0,0,.9),inset 0 0 80px rgba(255,120,40,.06);padding:14px 20px 12px;position:relative;overflow:hidden;font-family:var(--font,'VT323',monospace);color:var(--text,#ffd9b8)}
.rl::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}
.rl-head{display:flex;align-items:baseline;gap:4px 16px;flex-wrap:wrap;line-height:1.25}
.rl-title{font-family:var(--font2,monospace);font-size:20px;color:var(--amber,#ff8a3d);letter-spacing:3px;text-shadow:0 0 12px rgba(255,138,61,.45)}
.rl-sub{opacity:.75;font-size:19px}
.rl-warn{margin:8px 0 0;padding:4px 10px;border-left:3px solid #ff6b5a;background:rgba(255,80,60,.08);color:#ffb0a4;font-size:19px}
.rl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));grid-auto-rows:min-content;align-items:start;gap:12px;margin:12px 0;overflow:auto;min-height:0;padding:2px}/* [ux] responsive, no squashed rows */
.rl-card{position:relative;display:flex;flex-direction:column;gap:6px;padding:12px 14px 12px;border:1px solid rgba(255,138,61,.25);background:linear-gradient(160deg,rgba(0,0,0,.35),rgba(0,0,0,.6));cursor:pointer;transition:transform .12s,box-shadow .15s,border-color .15s;overflow:visible;min-width:0;height:auto}
.rl-card>*{position:relative;z-index:1;flex:0 0 auto;min-width:0;overflow-wrap:anywhere}
.rl-card::after{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 0% 0%,var(--rc) 0%,transparent 55%);opacity:.13}
.rl-card:hover{transform:translateY(-2px);border-color:var(--rc);box-shadow:0 0 22px color-mix(in srgb,var(--rc) 40%,transparent)}
.rl-card.cur{border-color:var(--rc);box-shadow:0 0 26px color-mix(in srgb,var(--rc) 55%,transparent),inset 0 0 30px color-mix(in srgb,var(--rc) 12%,transparent)}
.rl-card.cur::after{opacity:.24}
.rl-top{display:flex;align-items:center;gap:12px}
.rl-top canvas{flex:0 0 auto}
.rl-name{font-family:var(--font2,monospace);font-size:15px;line-height:1.3;letter-spacing:2px;color:var(--rc);text-shadow:0 0 10px color-mix(in srgb,var(--rc) 60%,transparent)}
.rl-tag{font-size:19px;line-height:1.2;opacity:.85;color:#fff0dc}
.rl-desc{font-size:18px;opacity:.78;line-height:1.25}
.rl-stats{font-size:19px;line-height:1.2}
.rl-good{color:#8dff8d}.rl-bad{color:#ff6b5a}
.rl-apt{font-size:18px;line-height:1.25;color:#ffe08a;opacity:.95}
.rl-kit{font-size:17px;line-height:1.25;opacity:.85;border-top:1px dashed rgba(255,138,61,.25);padding-top:5px;margin-top:2px}
.rl-kit b{color:#ffe08a;font-weight:normal}
.rl-btn{font-family:var(--font,monospace);font-size:21px;color:var(--rc);background:rgba(0,0,0,.35);border:1px solid var(--rc);padding:2px 12px;cursor:pointer;align-self:flex-start;margin-top:2px}
.rl-btn:hover{background:var(--rc);color:#120904}
.rl-btn.dis{opacity:.4;pointer-events:none}
.rl-btn.cur{background:var(--rc);color:#120904;pointer-events:none}
.rl-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.rl-msg{font-size:19px;min-height:22px}
.rl-close{font-family:var(--font,monospace);font-size:21px;color:var(--amber,#ff8a3d);background:rgba(255,138,61,.08);border:1px solid var(--amber-dim,#a8531f);padding:2px 16px;cursor:pointer}
.rl-close:hover{background:var(--amber,#ff8a3d);color:#150a02}
@media (max-width:640px){.rl{padding:10px 12px}}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }

/** opts: { game, ctl, profile, onClose, onPicked } -> { el, refresh } */
export function createRolesPanel({ game = null, ctl, profile = game?.profile, onClose, onPicked } = {}) {
  ensureStyle();
  const root = mk('div', 'rl');
  root.tabIndex = -1;
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose?.(); } });
  const sfx = (n = 'ui_click', v = 0.5) => { try { (game?.audio || window.kefal?.audio)?.ui?.(n, v); } catch { /* ignore */ } };
  let msg = ''; let msgKind = '';

  function pick(id) {
    const r = ctl.trySetRole ? ctl.trySetRole(id) : ctl.setRole(id);
    msg = r.msg || ''; msgKind = r.ok ? 'rl-good' : 'rl-bad';
    if (r.ok && !r.same) { sfx('ui_confirm', 0.6); onPicked?.(id); }
    render();
  }

  function render() {
    root.replaceChildren();
    const cur = ctl.role();
    const gate = ctl.canChangeRole ? ctl.canChangeRole() : { ok: true };
    const head = mk('div', 'rl-head');
    head.append(mk('div', 'rl-title', L('CHOOSE YOUR ROLE')), mk('div', 'rl-sub', L('Roles are not classes: a small passive bonus, a daily kit and the start of your passive tree.')));
    root.appendChild(head);
    if (!gate.ok) root.appendChild(mk('div', 'rl-warn', gate.msg));
    const grid = mk('div', 'rl-grid');
    for (const id of Object.keys(ROLES)) {
      const r = ROLES[id];
      const card = mk('div', 'rl-card' + (cur === id ? ' cur' : ''));
      card.style.setProperty('--rc', r.color);
      card.tabIndex = 0;
      const top = mk('div', 'rl-top');
      top.appendChild(iconCanvas(r.icon, 64, r.color, true));
      const t = mk('div');
      t.append(mk('div', 'rl-name', L(r.name).toLocaleUpperCase(getLang())), mk('div', 'rl-tag', r.tag));
      top.appendChild(t);
      card.appendChild(top);
      card.appendChild(mk('div', 'rl-desc', r.desc));
      const stats = mk('div', 'rl-stats');
      for (const l of bonusLines(r.bonus)) stats.appendChild(mk('div', l.good ? 'rl-good' : 'rl-bad', l.text));
      card.appendChild(stats);
      const apt = tr() && r.aptitudeTr ? r.aptitudeTr : r.aptitude;   // wave-2 aptitude line ("what you are good at")
      if (apt) card.appendChild(mk('div', 'rl-apt', L('GOOD AT') + ': ' + apt));
      const kit = mk('div', 'rl-kit');
      kit.append(document.createTextNode(L('STARTING KIT') + ': '), Object.assign(mk('b'), { textContent: itemDef(r.kit).name }), document.createTextNode(' (' + L('once per day, in your hands on landing') + ')'));
      card.appendChild(kit);
      const pv = cur === id ? null : ctl.previewRole(id);
      let label = cur === id ? L('CURRENT ROLE') : L('SELECT');
      if (pv && pv.orphans.length) label += `  (${pv.orphans.length} node${pv.orphans.length > 1 ? 's' : ''} refunded, ◈${pv.clout})`;
      const b = mk('button', 'rl-btn' + (cur === id ? ' cur' : gate.ok ? '' : ' dis'), label);
      b.addEventListener('click', (e) => { e.stopPropagation(); if (cur !== id) pick(id); });
      card.appendChild(b);
      card.addEventListener('click', () => { if (cur !== id) pick(id); });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (cur !== id) pick(id); } });
      grid.appendChild(card);
    }
    root.appendChild(grid);
    const foot = mk('div', 'rl-foot');
    foot.appendChild(mk('div', 'rl-msg ' + msgKind, msg));
    const close = mk('button', 'rl-close', L('Close'));
    close.addEventListener('click', () => onClose?.());
    foot.appendChild(close);
    root.appendChild(foot);
  }
  render();
  return { el: root, refresh: render };
}
