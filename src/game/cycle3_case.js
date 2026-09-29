// CASE FILE dossiers of the cycle (module 'cycle3', part 'caseFiles'). The lore module's case files (game/casefile.js) are per-day reports; this part adds one
// permanent dossier per boss / raid / keystone / hidden gate / red gate / the Deep Feed / shameful exit, filed the first time it happens. They live in the same archive
// (profile.caseFiles, terminal CASES / CASE <n>, the ship board tab) as records with kind:'cycle' and stable numbers 9xxxx; ui/panels/casefile.js renders them through
// caseRenderers.cycle. Every peer files its own copy from the host's 'c3s' {k:'case'} message; the Deep Feed dossier is filed locally from run.cycle.
import { t, tf, getLang } from '../core/i18n.js';
import { ensureCaseProfile } from './casefile.js';
import { caseRenderers, caseTexts, ensureCaseStyle } from '../ui/panels/casefile.js';
import { escapeHtml } from '../core/util.js';
import { DOSSIERS, DOSSIER_KEYS, dossierCaseNumber } from './cycle3_lore.js';
import { hashString } from '../core/rng.js';

const CSS = `
.lcase .c3-title{font-size:26px;font-weight:bold;letter-spacing:2px;margin:2px 0 0}
.lcase .c3-dos{margin:12px 0 4px;padding:8px 12px;background:rgba(43,32,20,.08);border-left:4px solid #9a1010;font-size:17px;line-height:1.3}
.lcase .c3-dos i{display:block;font-style:normal;margin-top:6px;font-weight:bold}
.lcase.c3open .lc-stamp{border-color:#8a6a10;color:#8a6a10}
`;
let cssDone = false;
function css() {
  ensureCaseStyle();
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'tfg-c3-case-css'; s.textContent = CSS; document.head.appendChild(s);
}
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmtDate = (ms) => { try { return new Date(ms).toLocaleDateString(); } catch { return '-'; } };

/** localised dossier lines of a key */
export const dossierLines = (key) => (DOSSIERS[key]?.lines || []).map((l) => t(l[0]));
const titleOf = (c) => t(DOSSIERS[c.cycle?.key]?.title || c.moon || '');

export function renderCycleCase(c, opts = {}) {
  css();
  const y = c.cycle || {};
  const card = mk('div', 'lcase c3case' + (y.closed === false ? ' c3open' : '') + (opts.cinematic ? '' : ' mini'));
  card.appendChild(mk('div', 'lc-top',
    `<div><div class="lc-no">CASE #${escapeHtml(c.n)}</div><div class="lc-org">${escapeHtml(t('THE ALGORITHM · CONTENT REVIEW DIVISION · CLASSIFIED'))}</div>`
    + `<div class="c3-title">${escapeHtml(titleOf(c))}</div><div class="lc-meta">${escapeHtml(t('DOSSIER'))} · ${escapeHtml(fmtDate(c.at))}</div></div>`));
  const rows = [];
  const row = (label, value, extra = '') => rows.push(`<div class="lc-row ${extra}" style="--i:${rows.length}"><b>${escapeHtml(label)}</b><span></span><em>${escapeHtml(value)}</em></div>`);
  row(t('Filed'), fmtDate(y.first?.at || c.at));
  row(t('Crew'), (c.crew || []).join(', ') || '-', 'wide');
  if (y.sector !== undefined) row(t('Sector'), String((y.sector | 0) + 1));
  if (y.kills) row(t('Kills'), String(y.kills));
  if (y.time) row(t('Time'), `${Math.floor(y.time / 60)}:${String(Math.round(y.time % 60)).padStart(2, '0')}`);
  if (y.depth !== undefined) row(t('Depth'), String(y.depth | 0));
  if (y.fired) row(t('Outcome'), t('DEPLATFORMED'), 'bad');
  card.appendChild(mk('div', 'lc-rows', rows.join('')));
  const lines = dossierLines(y.key);
  if (lines.length) card.appendChild(mk('div', 'c3-dos', `${escapeHtml(lines[0])}<i>${escapeHtml(lines[1] || '')}</i>`));
  card.appendChild(mk('div', 'lc-stamp', `${escapeHtml(y.closed === false ? t('OPEN FILE') : t('CLOSED'))}<small>${escapeHtml(y.closed === false ? t('still running') : t('content archived'))}</small>`));
  if (opts.cinematic) card.appendChild(mk('div', 'lc-hint', t('click to file the case')));
  return card;
}
export function textCycleCase(c) {
  const y = c.cycle || {};
  const out = [`CASE #${c.n} - ${titleOf(c)}`, ''];
  out.push(`${t('Filed')}: ${fmtDate(y.first?.at || c.at)}   ${t('Crew')}: ${(c.crew || []).join(', ') || '-'}`);
  const bits = [];
  if (y.sector !== undefined) bits.push(`${t('Sector')} ${(y.sector | 0) + 1}`);
  if (y.kills) bits.push(`${t('Kills')} ${y.kills}`);
  if (y.depth !== undefined) bits.push(`${t('Depth')} ${y.depth | 0}`);
  if (bits.length) out.push(bits.join('   '));
  out.push('', ...dossierLines(y.key));
  return out.join('\n');
}

export function installCase(C3) {
  const { game, mods } = C3;
  let disposed = false, boundNet = null, lastMode = '', lastDepth = 0;
  caseRenderers.cycle = renderCycleCase;
  caseTexts.cycle = textCycleCase;

  const list = () => ensureCaseProfile(game.profile);
  const find = (key) => list().find((x) => x.kind === 'cycle' && x.cycle?.key === key) || null;
  const save = () => { try { game.progress?.save?.(); } catch { /* ignore */ } };

  /** every peer: file (or update) the dossier `key`. info: { at, crew, sector, kills, time, depth, closed, fired, quiet } */
  function file(key, info = {}) {
    if (!DOSSIERS[key]) return null;
    const L = list();
    const old = find(key);
    const now = info.at || Date.now();
    if (old) {
      const y = old.cycle;
      if (info.kills !== undefined) y.kills = Math.max(y.kills | 0, info.kills | 0);
      if (info.depth !== undefined) y.depth = Math.max(y.depth | 0, info.depth | 0);
      if (info.closed !== undefined) y.closed = info.closed;
      if (info.fired !== undefined) y.fired = info.fired;
      save();
      return old;
    }
    const rec = {
      n: dossierCaseNumber(key), runId: 'cycle', day: info.day | 0, at: now, kind: 'cycle',
      moon: DOSSIERS[key].title, interior: '', crew: (info.crew || [game.profile?.name || '']).slice(0, 8), entered: (info.crew || [1]).length, returned: (info.crew || [1]).length,
      value: 0, onBoard: 0, kills: info.kills | 0, allDead: false, deaths: [], abandoned: [], artifacts: [], events: [], mvp: null, top: null, lastWords: null, contract: null, secret: null,
      focus: null, mood: 'amused', verdict: null, invasions: 0,
      cycle: { key, first: { at: now }, sector: info.sector, kills: info.kills | 0, time: info.time | 0, depth: info.depth, closed: info.closed, fired: info.fired },
    };
    if (info.quiet || !game.lore?.core?.cases?.receive) {
      L.unshift(rec);
      if (L.length > 50) L.length = 50;
      save();
    } else game.lore.core.cases.receive(rec);   // stores + plays the card after the day report
    return rec;
  }
  C3.on('case', (m) => { if (m.key) file(m.key, m.info || {}); });
  /** host: tell everybody to file a dossier */
  const open = (key, info = {}) => { if (C3.host() && DOSSIERS[key]) C3.send({ k: 'case', key, info: { ...info, crew: info.crew || C3.crewNames(), at: Date.now() } }); };

  // ---- a trophy mounted for the first time -> its dossier (same key as the trophy id)
  C3.on('trophy', (m) => {
    if (!m.first || !m.rec || !DOSSIERS[m.id]) return;
    file(m.id, { at: m.rec.first?.at, crew: m.rec.first?.crew, sector: m.rec.first?.sector, kills: m.rec.kills, time: m.rec.first?.t, day: m.rec.first?.day, closed: true });
  });
  // ---- shameful exit (host event) -> everybody files it
  offsHost();
  function offsHost() {
    const off = mods.on('tfg:shamefulExit', (d, g) => { if (g === game && C3.host()) open('shame', { sector: d?.sector, closed: true }); });
    C3.disposers.push(() => { try { off?.(); } catch { /* ignore */ } });
  }
  // ---- the Deep Feed: filed from run.cycle on every peer (open at PATCH 1.0, closed at cash out)
  C3.ticks.push(() => {
    const c = game.run?.cycle;
    if (!c) return;
    const mode = c.mode || '';
    if (mode === 'endless') {
      lastDepth = c.endless?.depth | 0;
      if (lastMode !== 'endless') file('endless', { depth: lastDepth, closed: false, sector: c.sector, quiet: false });
      else if (!find('endless')) file('endless', { depth: lastDepth, closed: false, quiet: true });
    } else if (lastMode === 'endless') { const e = find('endless'); if (e) { e.cycle.depth = Math.max(e.cycle.depth | 0, lastDepth); e.cycle.closed = true; save(); } }
    lastMode = mode;
  });
  function onCyx(m) {
    if (disposed || !m || m.k !== 'cashout') return;
    const e = find('endless');
    if (e) { e.cycle.depth = Math.max(e.cycle.depth | 0, m.entry?.depth | 0); e.cycle.closed = true; e.cycle.fired = !!m.fired; save(); }
  }
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:cyx', onCyx); boundNet = net; net.on('msg:cyx', onCyx); }
  const offNet = mods.on('netReady', (n, g) => { if (g === game) bindNet(n); });
  if (game.net) bindNet(game.net);

  // ---- terminal: DOSSIER [name]
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  try {
    window.KefalAPI?.registerCommand?.('dossier', (rest, term) => {
      const q = norm(rest.join(' '));
      const have = list().filter((x) => x.kind === 'cycle');
      if (!q) {
        term.print(have.length ? [`${t('DOSSIERS')}: ${have.length}/${DOSSIER_KEYS.length}`, ...have.map((x) => `  #${x.n}  ${titleOf(x)}`), '', t('Type DOSSIER <name> to read one (or CASE <n>).')].join('\n') : t('No dossiers yet. Defeat a boss, clear a gate, or reach the Deep Feed.'));
        return;
      }
      const hit = have.find((x) => norm(x.cycle.key) === q || norm(DOSSIERS[x.cycle.key]?.title).includes(q) || norm(t(DOSSIERS[x.cycle.key]?.title)).includes(q));
      term.print(hit ? textCycleCase(hit) : t('No such dossier (yet).'), hit ? '' : 'err');
    }, 'boss / gate / endless dossiers (case files of the sector cycle)');
    C3.disposers.push(() => { try { window.__kefalMods?.commands?.delete?.('dossier'); } catch { /* ignore */ } });
  } catch { /* no terminal in tests */ }

  return {
    file, open, find, list: () => list().filter((x) => x.kind === 'cycle'),
    dispose() { disposed = true; try { offNet?.(); } catch { /* ignore */ } try { boundNet?.off?.('msg:cyx', onCyx); } catch { /* ignore */ } if (caseRenderers.cycle === renderCycleCase) { delete caseRenderers.cycle; delete caseTexts.cycle; } },
  };
}
void tf; void getLang; void hashString;
