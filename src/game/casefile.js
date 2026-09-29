// Case files: after every moon day the host writes a "CASE #<n>" report (entered / returned, value extracted, deaths
// with causes, artifacts, facility events, abandoned teammates, MVP, most valuable item, LAST WORDS = the dead
// player's last chat line, contract + secret result, The Algorithm's verdict) and broadcasts it. Every peer stores it
// in its own profile.caseFiles (cap 50, newest first) and plays it as a full-screen card after the day report
// (ui.playCinematic queue). Terminal: CASES / CASE <n>; the ship board has a CASE FILES tab.
import { LINES, FACTIONS, pickLang } from './loredata.js';
import { MOONS } from './moons.js';
import { interiorName } from './collection.js';
import { hashString } from '../core/rng.js';
import { getLang, t } from '../core/i18n.js';
import { renderCaseCard, caseTexts } from '../ui/panels/casefile.js';

export const CASE_CAP = 50;
const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };

export function ensureCaseProfile(p) {
  if (!p) return [];
  if (!Array.isArray(p.caseFiles)) p.caseFiles = [];
  return p.caseFiles;
}

export function verdictText(c, T = tr()) {
  const pair = LINES[c?.verdict?.key]?.[c.verdict.i];
  return pair ? pickLang(pair, T).replace(/\{name\}/g, c.verdict.v?.name || '???') : '';
}

export function installCaseFiles(core) {
  const { game } = core;
  const st = { pendingSummary: null, lastShown: null };

  /** host: build the case record for the day that just ended */
  function build(summary, algoRes, settle) {
    const run = game.run, day = core.day;
    if (!run || !day) return null;
    if (typeof run.caseN !== 'number') run.caseN = 1000 + (hashString(String(run.runId || 'run')) % 8000);
    run.caseN += 1;
    const deaths = (summary.deaths || []).map((dd) => {
      const rec = day.deaths.find((x) => x.id === dd.id) || {};
      const w = core.lastWords(dd.id);
      return { name: dd.name, cause: dd.cause, causeText: game.deathText?.(dd.cause) || 'died.', alone: !!rec.alone || dd.cause === 'left', words: w };
    });
    const players = summary.players || [];
    const mvp = players.reduce((m, p) => ((p.loot || 0) > (m?.loot || 0) ? p : m), null);
    const firstWords = deaths.find((x) => x.words) || null;
    const abandoned = [...new Set([...(day.abandoned || []), ...deaths.filter((x) => x.cause === 'left').map((x) => x.name)])];
    const c = {
      n: run.caseN, runId: run.runId, day: summary.day, at: Date.now(),
      moon: summary.moon, moonId: run.moon, interior: interiorName(day.theme || MOONS[run.moon]?.interior || ''),
      crew: players.map((p) => p.name), entered: players.length, returned: Math.max(0, players.length - deaths.length),
      value: summary.collected || 0, onBoard: summary.shipValue || 0, kills: summary.kills || 0, allDead: !!summary.allDead,
      deaths, abandoned,
      artifacts: day.collected.filter((x) => x.artifact).map((x) => ({ name: x.name, value: x.value })).slice(0, 6),
      events: [...new Set(day.events)].slice(0, 8),
      mvp: mvp && (mvp.loot || 0) > 0 ? { name: mvp.name, loot: mvp.loot } : null,
      top: day.collected.reduce((m, x) => (x.value > (m?.value || 0) ? { name: x.name, value: x.value } : m), null),
      lastWords: firstWords ? { name: firstWords.name, text: firstWords.words } : (deaths[0] ? { name: deaths[0].name, text: null } : null),
      contract: settle?.contract ? { ...settle.contract, title: settle.contract.title } : null,
      secret: settle?.secret || null,
      focus: algoRes?.focus || run.algo?.focus || null, mood: algoRes?.mood || run.algo?.mood || 'amused',
      verdict: algoRes?.verdict || null,
      invasions: day.invasions || 0,
    };
    return c;
  }
  function hostPublish(c) {
    if (!c) return;
    core.broadcast('case', { c });
  }

  /** every peer: store + queue the card */
  function receive(c) {
    if (!c || typeof c !== 'object' || typeof c.n !== 'number') return;
    const list = ensureCaseProfile(game.profile);
    if (!list.some((x) => x.n === c.n && x.runId === c.runId)) {
      list.unshift(c);
      if (list.length > CASE_CAP) list.length = CASE_CAP;
      try { game.progress?.save?.(); } catch { /* ignore */ }
    }
    st.lastShown = c;
    game.ui?.playCinematic?.('casefile', (done) => showCard(c, done));
  }
  function showCard(c, done) {
    if (typeof document === 'undefined') { done(); return; }
    document.querySelectorAll('.lcase-cine').forEach((x) => x.remove());
    const root = document.getElementById('ui') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'lcase-cine';
    const card = renderCaseCard(c, { game, cinematic: true });
    wrap.appendChild(card);
    root.appendChild(wrap);
    game.sfx?.('terminal_enter', 0.4);
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      wrap.classList.add('out');
      setTimeout(() => { wrap.remove(); done(); }, 600);
    };
    const stampAt = 700 + (card.querySelectorAll('.lc-row').length) * 260;
    setTimeout(() => { if (!closed) { wrap.classList.add('stamped'); game.sfx?.('stun_bang', 0.45); game.engine?.shake?.(0.25); } }, stampAt);
    const t0 = Date.now();
    wrap.addEventListener('click', () => { if (Date.now() - t0 > 1500) finish(); });
    setTimeout(() => { if (game.ui?.cineQ?.length) finish(); }, stampAt + 3000);
    setTimeout(finish, stampAt + 6500);
  }

  // ---------------------------------------------------------------- terminal text
  function listText() {
    const T = tr();
    const list = ensureCaseProfile(game.profile);
    if (!list.length) return t('No case files yet. Survive a day (or do not).');
    const out = [t('CASE ARCHIVE (latest 10) - open with CASE <n>'), ''];
    for (const c of list.slice(0, 10)) {
      out.push(`#${c.n}  ${t('DAY')} ${c.day}  ${String(c.moon || '').slice(0, 18).padEnd(18)} ▮${String(c.value).padEnd(5)} ${c.returned}/${c.entered} ${t('returned')}${c.deaths.length ? `  ✖${c.deaths.length}` : ''}${c.allDead ? '  [WIPE]' : ''}`);
    }
    return out.join('\n');
  }
  function caseText(n) {
    const T = tr();
    const list = ensureCaseProfile(game.profile);
    const c = n ? list.find((x) => String(x.n) === String(n).replace('#', '')) : list[0];
    if (!c) return t('Case not found. Type CASES.');
    if (c.kind && caseTexts[c.kind]) return caseTexts[c.kind](c);   // [cycle3] dossiers
    const L = (en, trs) => (T ? trs : t(en));
    const out = [`CASE #${c.n} - ${c.moon} - ${L('DAY', 'GÜN')} ${c.day}${c.interior ? ' - ' + c.interior : ''}`, ''];
    out.push(`${L('Entered', 'Giren')} ${c.entered}, ${L('Returned', 'Dönen')} ${c.returned}, ${L('Value extracted', 'Çıkarılan değer')} ▮${c.value}, ${L('Kills', 'Öldürme')} ${c.kills}`);
    if (c.artifacts?.length) out.push(`${L('Artifacts', 'Eserler')}: ${c.artifacts.map((a) => `${a.name} (▮${a.value})`).join(', ')}`);
    if (c.events?.length) out.push(`${L('Facility events', 'Tesis olayları')}: ${c.events.join(', ')}`);
    for (const d of c.deaths) out.push(`✖ ${d.name} ${d.causeText}${d.alone ? L(' (alone)', ' (yalnız)') : ''}`);
    if (c.abandoned?.length) out.push(`${L('Abandoned', 'Terk edilen')}: ${c.abandoned.join(', ')}`);
    if (c.mvp) out.push(`MVP: ${c.mvp.name} (▮${c.mvp.loot})`);
    if (c.top) out.push(`${L('Most valuable', 'En değerli')}: ${c.top.name} (▮${c.top.value})`);
    if (c.lastWords) out.push(`${L('LAST WORDS', 'SON SÖZLER')} (${c.lastWords.name}): "${c.lastWords.text || L('[no transmission]', '[yayın yok]')}"`);
    if (c.contract) out.push(`${L('Contract', 'Sözleşme')}: ${pickLang(c.contract.title, T)} [${FACTIONS[c.contract.f]?.short || ''}] - ${String(c.contract.result).toUpperCase()}`);
    if (c.secret) out.push(`${L('Secret objective', 'Gizli görev')}: ${pickLang(c.secret.name, T)} ✔`);
    const v = verdictText(c, T);
    if (v) out.push('', `THE ALGORITHM: "${v}"`);
    return out.join('\n');
  }

  return { build, hostPublish, receive, listText, caseText, get lastShown() { return st.lastShown; }, list: () => ensureCaseProfile(game.profile) };
}
