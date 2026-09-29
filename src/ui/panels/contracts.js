// THE ALGORITHM LINK — the ship's contract board panel: CONTRACTS (3 daily offers + active contract), FACTIONS
// (reputation, rivals, perks, chains, SIGN / TRIBUTE), CASE FILES (archive) and LOGS (recovered lore logs).
// Opened from the board screen in the ship ([E]) or terminal BOARD. Actions are host requests (core.request).
import { FACTIONS, FACTION_IDS, CHAINS, RETRIEVAL, WAR_AT, chapterOf, pickLang, LORE_LOGS } from '../../game/loredata.js';
import { contractText, RIVAL_REP } from '../../game/contracts.js';
import { standing, tributeCost } from '../../game/factions.js';
import { FOCUS_NAME, drawAlgoFace } from '../../game/algorithm.js';
import { renderCaseCard, renderCaseList, renderLogList, ensureCaseStyle } from './casefile.js';
import { getLang, t } from '../../core/i18n.js';
import { escapeHtml } from '../../core/util.js';

const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const L = (en, trs) => (tr() ? trs : t(en));   // RU: dictionary keyed by the English text
const STYLE_ID = 'tfg-lore-board-style';
const CSS = `
.lb{width:min(1100px,95vw);max-height:90vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(16,6,12,.97),rgba(6,3,6,.97));
 border:1px solid rgba(255,61,127,.55);box-shadow:0 0 50px rgba(0,0,0,.85),0 0 30px rgba(255,61,127,.12),inset 0 0 70px rgba(255,61,127,.05);padding:14px 20px;position:relative;overflow:hidden;
 font-family:var(--font,'VT323',monospace);color:var(--text,#ffd9b8)}
.lb::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.2) 0 1px,transparent 1px 3px)}
.lb-head{display:flex;gap:16px;align-items:center;margin-bottom:8px}
.lb-head canvas{width:96px;height:72px;image-rendering:pixelated;border:1px solid rgba(255,61,127,.4);flex:none}
.lb-title{font-family:var(--font2,monospace);font-size:18px;letter-spacing:3px;color:#ff3d7f;text-shadow:0 0 12px rgba(255,61,127,.5)}
.lb-sub{font-size:19px;opacity:.8}
.lb-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(255,61,127,.3);margin-bottom:10px;flex-wrap:wrap}
.lb-tab{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;padding:8px 12px;cursor:pointer;color:#b0406a;border:1px solid transparent;border-bottom:none;user-select:none}
.lb-tab:hover,.lb-tab:focus{color:#ff3d7f;outline:none}
.lb-tab.sel{color:#1a0610;background:#ff3d7f;box-shadow:0 0 14px rgba(255,61,127,.5)}
.lb-body{overflow:auto;flex:1;min-height:0;padding-right:6px}
.lb-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:18px;opacity:.85}
.lb-offers{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
.lb-card{position:relative;border:1px solid color-mix(in srgb,var(--fc) 55%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--fc) 10%,transparent),rgba(0,0,0,.35));padding:10px 12px 10px 16px;display:flex;flex-direction:column;gap:4px;min-height:190px}
.lb-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--fc);box-shadow:0 0 12px var(--fc)}
.lb-card.taken{opacity:.45}
.lb-card.chain{box-shadow:inset 0 0 0 1px rgba(255,210,63,.5),0 0 18px rgba(255,210,63,.15)}
.lb-k{font-family:var(--font2,monospace);font-size:10px;letter-spacing:2px;color:var(--fc)}
.lb-n{font-size:28px;color:#fff0f4;line-height:1}
.lb-b{font-size:19px;opacity:.9;line-height:1.1;flex:1}
.lb-r{font-size:18px;color:#ffd23f}
.lb-r .neg{color:#ff6b5a}
.lb-chain{font-size:16px;color:#ffd23f}
.lb-btn{font-family:var(--font,monospace);font-size:21px;align-self:flex-start;background:transparent;color:var(--fc);border:1px solid var(--fc);padding:1px 14px;cursor:pointer}
.lb-btn:hover,.lb-btn:focus{background:var(--fc);color:#12060c;outline:none}
.lb-btn[disabled]{opacity:.35;cursor:default;background:transparent;color:var(--fc)}
.lb-active{border:1px solid var(--fc);padding:10px 14px;margin-bottom:10px;background:rgba(0,0,0,.35);display:flex;gap:16px;align-items:center}
.lb-bar{height:9px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);position:relative;min-width:160px;flex:1}
.lb-bar>span{position:absolute;left:0;top:0;bottom:0;background:var(--fc);box-shadow:0 0 8px var(--fc)}
.lb-secret{margin-top:10px;padding:8px 12px;border:1px dashed rgba(255,255,255,.25);font-size:19px;opacity:.75}
.lb-facs{display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:10px}
.lb-fac{border:1px solid color-mix(in srgb,var(--fc) 50%,transparent);padding:10px 12px;background:rgba(0,0,0,.35);display:flex;flex-direction:column;gap:5px}
.lb-fac.war{border-color:#ff2a2a;box-shadow:inset 0 0 30px rgba(255,42,42,.15)}
.lb-fh{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.lb-fn{font-size:28px;color:var(--fc);line-height:1}
.lb-st{font-family:var(--font2,monospace);font-size:10px;letter-spacing:2px;padding:3px 6px;border:1px solid currentColor}
.lb-rep{position:relative;height:12px;background:linear-gradient(90deg,rgba(255,42,42,.35) 0 30%,rgba(255,255,255,.07) 30% 100%);border:1px solid rgba(255,255,255,.2)}
.lb-rep i{position:absolute;top:-3px;bottom:-3px;width:3px;background:#fff;box-shadow:0 0 8px #fff}
.lb-rep b{position:absolute;top:-2px;bottom:-2px;left:50%;width:1px;background:rgba(255,255,255,.4)}
.lb-perk{font-size:17px;opacity:.45}.lb-perk.on{opacity:1;color:#9dff9d}
.lb-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.lb-pips{letter-spacing:3px;color:#ffd23f}
.lb-quote{font-size:18px;font-style:italic;opacity:.75}
.lb-detail{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
`;
function ensureStyle() {
  ensureCaseStyle();
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
let lastTab = 'contracts';

/** Build the board. opts: { game, lore: core, tab, onClose }. Returns the root element (ui.openPanel(el)). */
export function createLoreBoard({ game, lore, tab, onClose } = {}) {
  ensureStyle();
  if (tab) lastTab = tab;
  const root = mk('div', 'lb');
  root.addEventListener('keydown', (e) => { const tg = e.target?.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') e.stopPropagation(); });
  const sfx = (n = 'ui_click', v = 0.5) => { try { game?.audio?.ui?.(n, v); } catch { /* ignore */ } };
  let detail = null, faceT = 0, lastSig = '';
  const sig = () => { const r = game.run || {}; try { return JSON.stringify([r.contract, r.contracts, r.st?.offers, r.st?.job, r.factions, r.signed, r.chains, r.phase, (game.profile.caseFiles || []).length]); } catch { return ''; } };

  const render = () => {
    root.replaceChildren();
    const run = game.run || {};
    const T = tr();
    const head = mk('div', 'lb-head');
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    const ch = chapterOf(run.quotaIndex);
    const focus = run.algo?.focus;
    head.append(cv, mk('div', '', `<div class="lb-title">${L('THE ALGORITHM LINK', 'ALGORİTMA BAĞLANTISI')}</div>`
      + `<div class="lb-sub">${L('CHAPTER', 'BÖLÜM')} ${ch.n}: ${escapeHtml(pickLang(ch.name, T))} — ${escapeHtml(pickLang(ch.sub, T))}</div>`
      + `<div class="lb-sub">${L("Today's focus", 'Bugünün odağı')}: <b style="color:#ff3d7f">${focus ? escapeHtml(pickLang(FOCUS_NAME[focus], T)) : '???'}</b> · ${L('mood', 'ruh hali')}: ${escapeHtml(run.algo?.mood || 'curious')} · ▮${run.credits ?? 0}</div>`));
    root.appendChild(head);
    const ctx = cv.getContext('2d');
    drawAlgoFace(ctx, 64, 48, faceT, { mood: run.algo?.mood, glitch: 0.3, talk: 0.1 });
    root._face = () => { faceT += 0.1; drawAlgoFace(ctx, 64, 48, faceT, { mood: game.run?.algo?.mood, glitch: 0.3, talk: lore?.algo?.speaking ? 0.9 : 0.1 }); };
    const tabs = mk('div', 'lb-tabs');
    for (const [id, en, trs] of [['contracts', 'CONTRACTS', 'SÖZLEŞMELER'], ['factions', 'FACTIONS', 'FRAKSİYONLAR'], ['cases', 'CASE FILES', 'DAVA DOSYALARI'], ['logs', 'LOGS', 'KAYITLAR']]) {
      const t = mk('div', 'lb-tab' + (lastTab === id ? ' sel' : ''), T ? trs : en);
      t.tabIndex = 0;
      t.addEventListener('click', (e) => { e.stopPropagation(); lastTab = id; detail = null; sfx(); render(); });
      tabs.appendChild(t);
    }
    root.appendChild(tabs);
    const body = mk('div', 'lb-body');
    root.appendChild(body);
    try {
      if (lastTab === 'contracts') renderContracts(body, run);
      else if (lastTab === 'factions') renderFactions(body, run);
      else if (lastTab === 'cases') renderCases(body);
      else renderLogs(body);
    } catch (e) { console.warn('[lore board]', e); body.appendChild(mk('div', 'lb-d', 'Error: ' + escapeHtml(e.message))); }
    const foot = mk('div', 'lb-foot', `<span>${L('Actions are sent to the host · terminal: CONTRACTS · FACTIONS · CASES', 'Eylemler hosta gider · terminal: CONTRACTS · FACTIONS · CASES')}</span>`);
    const close = mk('button', 'btn', L('Close [ESC]', 'Kapat [ESC]'));
    close.addEventListener('click', (e) => { e.stopPropagation(); sfx(); onClose?.(); });
    foot.appendChild(close);
    root.appendChild(foot);
    lastSig = sig();
  };

  function renderContracts(body, run) {
    const T = tr();
    const c = run.contract;
    if (c) {
      const f = FACTIONS[c.faction], tx = contractText(c, T);
      const pct = c.n ? Math.round(Math.min(1, (c.progress || 0) / c.n) * 100) : 0;
      const box = mk('div', 'lb-active', `<div><div class="lb-k">${L('ACTIVE CONTRACT', 'AKTİF SÖZLEŞME')} · ${escapeHtml(f.short)}</div><div class="lb-n">${escapeHtml(tx.title)}</div><div class="lb-b">${escapeHtml(tx.goal)}</div></div>`);
      box.style.setProperty('--fc', f.color);
      const barW = mk('div', 'lb-bar', `<span style="width:${pct}%"></span>`);
      box.appendChild(barW);
      box.appendChild(mk('div', 'lb-r', `${c.progress || 0}/${c.n}`));
      if (c.state === 'active') {
        const ab = mk('button', 'lb-btn', L('ABANDON (-5 rep)', 'BIRAK (-5 itibar)'));
        ab.addEventListener('click', (e) => { e.stopPropagation(); sfx(); lore.request('abandon', {}); });
        box.appendChild(ab);
      }
      body.appendChild(box);
    }
    const offers = run.contracts?.offers || [];
    if (!offers.length) body.appendChild(mk('div', 'lb-d', L('No offers right now. New contracts arrive every day in orbit.', 'Şu an teklif yok. Her gün yörüngede yeni sözleşmeler gelir.')));
    const grid = mk('div', 'lb-offers');
    offers.forEach((o, i) => {
      const f = FACTIONS[o.faction], tx = contractText(o, T);
      const chain = o.chain !== null && o.chain !== undefined;
      const card = mk('div', 'lb-card' + (o.taken ? ' taken' : '') + (chain ? ' chain' : ''));
      card.style.setProperty('--fc', f.color);
      card.innerHTML = `<div class="lb-k">${f.glyph} ${escapeHtml(f.name.toUpperCase())} · ${escapeHtml(tx.icon)} ${escapeHtml(tx.type)}${o.patron ? ' · ' + (o.patron === 'company' ? L('THE COMPANY', 'ŞİRKET') : L('THE ALGORITHM', 'ALGORİTMA')) : ''}</div>`
        + `<div class="lb-n">${escapeHtml(tx.title)}</div>`
        + (chain ? `<div class="lb-chain">★ ${escapeHtml(pickLang(CHAINS[o.faction].name, T))} — ${L('step', 'adım')} ${o.chain + 1}/5</div>` : '')
        + `<div class="lb-b">${escapeHtml(tx.brief)}${tx.goal !== tx.brief ? `<br><span style="opacity:.7">${escapeHtml(tx.goal)}</span>` : ''}</div>`
        + `<div class="lb-r">▮${o.reward.credits} · +${o.reward.rep} ${escapeHtml(f.short)} <span class="neg">${RIVAL_REP} ${escapeHtml(FACTIONS[o.rival].short)}</span> · ${o.reward.xp} XP</div>`;
      const b = mk('button', 'lb-btn', o.taken ? L('TAKEN', 'ALINDI') : L('ACCEPT', 'KABUL ET'));
      const blocked = o.taken || run.phase !== 'orbit' || (c && ['active', 'running'].includes(c.state)) || lore.factions.war(o.faction);
      if (blocked) b.disabled = true;
      b.title = run.phase !== 'orbit' ? L('Only in orbit', 'Sadece yörüngede') : '';
      b.addEventListener('click', (e) => { e.stopPropagation(); if (b.disabled) return; sfx('ui_confirm', 0.6); lore.request('accept', { i }); });
      card.appendChild(b);
      grid.appendChild(card);
    });
    body.appendChild(grid);
    renderPatronJobs(body, run);
    body.appendChild(mk('div', 'lb-secret', `??? ${L('SECRET OBJECTIVE — every day hides one. The Algorithm will tell you when you stumble into it.', 'GİZLİ GÖREV — her gün bir tane saklı. Üstüne düştüğünüzde Algoritma söyleyecek.')}`));
  }

  /** [links] today's story patron jobs (module story) with take buttons; same rules as the terminal JOB <n> */
  function renderPatronJobs(body, run) {
    let J = null;
    try { J = game.story?.jobRows?.(); } catch { J = null; }
    if (!J || (!J.rows.length && !J.active)) return;
    body.appendChild(mk('div', 'lb-k', L('PATRON JOBS', 'PATRON İŞLERİ')));
    const grid = mk('div', 'lb-offers');
    if (J.active) body.appendChild(mk('div', 'lb-d', `${L('Active job', 'Aktif iş')}: ${escapeHtml(J.active.title)}`));
    for (const j of J.rows) {
      const card = mk('div', 'lb-card' + (j.taken ? ' taken' : ''));
      card.innerHTML = `<div class="lb-k">${j.patron === 'company' ? L('THE COMPANY', 'ŞİRKET') : L('THE ALGORITHM', 'ALGORİTMA')}</div>`
        + `<div class="lb-n">${escapeHtml(j.title)}</div><div class="lb-b">${escapeHtml(j.brief)}</div>`
        + `<div class="lb-r">▮${j.credits} · ${j.xp} XP · ${L('loyalty', 'sadakat')} ${j.patron === 'company' ? '-' : '+'}${j.shift}</div>`;
      const b = mk('button', 'lb-btn', j.taken ? L('TAKEN', 'ALINDI') : L('TAKE JOB', 'İŞİ AL'));
      if (j.taken || J.active || run.phase !== 'orbit') b.disabled = true;
      b.title = run.phase !== 'orbit' ? L('Only in orbit', 'Sadece yörüngede') : '';
      b.addEventListener('click', (e) => { e.stopPropagation(); if (b.disabled) return; sfx('ui_confirm', 0.6); game.story?.takeJob?.(j.i); });
      card.appendChild(b);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function renderFactions(body, run) {
    const T = tr();
    const grid = mk('div', 'lb-facs');
    for (const id of FACTION_IDS) {
      const f = FACTIONS[id];
      const rep = lore.factions.rep(id), s = standing(rep);
      const box = mk('div', 'lb-fac' + (rep < WAR_AT ? ' war' : ''));
      box.style.setProperty('--fc', f.color);
      const ci = lore.factions.chainInfo(id);
      box.innerHTML = `<div class="lb-fh"><span class="lb-fn">${f.glyph} ${escapeHtml(f.name)}</span><span class="lb-st" style="color:${s.color}">${escapeHtml(pickLang(s.name, T))} ${rep}${run.signed?.f === id ? ' · ' + L('SIGNED', 'İMZALI') : ''}</span></div>`
        + `<div class="lb-d">${escapeHtml(f.org)} · ${L('leader', 'lider')}: ${escapeHtml(f.leader)} · ${L('rival', 'rakip')}: <span style="color:${FACTIONS[f.rival].color}">${escapeHtml(FACTIONS[f.rival].name)}</span></div>`
        + `<div class="lb-quote">“${escapeHtml(pickLang(f.motto, T))}”</div>`
        + `<div class="lb-rep"><b></b><i style="left:calc(${(rep + 100) / 2}% - 1px)"></i></div>`
        + `<div class="lb-d">${L('Wants', 'İster')}: ${escapeHtml(pickLang(f.wants, T))} · ${L('Gives', 'Verir')}: ${escapeHtml(pickLang(f.gives, T))}</div>`
        + lore.factions.perkLines(id).map((p) => `<div class="lb-perk${p.on ? ' on' : ''}">${p.on ? '✔' : '·'} ${escapeHtml(p.text)}</div>`).join('')
        + `<div class="lb-row"><span>${L('Chain', 'Zincir')} "${escapeHtml(pickLang(ci.name, T))}"</span><span class="lb-pips">${'★'.repeat(ci.step)}${'☆'.repeat(ci.total - ci.step)}</span>${ci.next ? `<span class="lb-d">${L('next', 'sıradaki')}: ${escapeHtml(pickLang(ci.next.title, T))} (rep ${ci.req.rep}+, ${L('ch.', 'bl.')} ${ci.req.ch})</span>` : ''}</div>`;
      const row = mk('div', 'lb-row');
      const sign = mk('button', 'lb-btn', L('SIGN EXCLUSIVE', 'ÖZEL İMZALA'));
      sign.title = L(`+20 ${f.short}, -30 ${FACTIONS[f.rival].short}`, `+20 ${f.short}, -30 ${FACTIONS[f.rival].short}`);
      if (!['orbit', 'company'].includes(run.phase) || rep < WAR_AT || run.signed?.day === run.day) sign.disabled = true;
      sign.addEventListener('click', (e) => { e.stopPropagation(); if (sign.disabled) return; sfx('ui_confirm', 0.6); lore.request('sign', { f: id }); });
      const trib = mk('button', 'lb-btn', `${L('TRIBUTE', 'HARAÇ')} ▮${tributeCost(run)}`);
      if (!['orbit', 'company'].includes(run.phase) || (run.credits || 0) < tributeCost(run)) trib.disabled = true;
      trib.addEventListener('click', (e) => { e.stopPropagation(); if (trib.disabled) return; sfx(); lore.request('tribute', { f: id }); });
      row.append(sign, trib, mk('span', 'lb-d', `${L('Sign', 'İmza')}: +20 / ${escapeHtml(FACTIONS[f.rival].short)} -30`));
      box.appendChild(row);
      grid.appendChild(box);
    }
    body.appendChild(grid);
    body.appendChild(mk('div', 'lb-d', L('Below -40 a faction declares WAR and may send a Hit Squad into your landings. Working for one angers its rival.', "-40'ın altında bir fraksiyon SAVAŞ ilan eder ve inişlerinize Tetikçi Ekibi gönderebilir. Birine çalışmak rakibini kızdırır.")));
    void RETRIEVAL;
  }

  function renderCases(body) {
    const list = game.profile.caseFiles || [];
    if (detail) {
      const d = mk('div', 'lb-detail');
      const back = mk('button', 'btn', L('< back to the archive', '< arşive dön'));
      back.addEventListener('click', (e) => { e.stopPropagation(); detail = null; sfx(); render(); });
      d.append(back, renderCaseCard(detail, { game }));
      body.appendChild(d);
      return;
    }
    renderCaseList(body, list, (c) => { detail = c; sfx(); render(); });
  }
  function renderLogs(body) {
    renderLogList(body, game.profile.loreLogs || {}, (l) => { onClose?.(); lore.logs?.read(l, false); });
    void LORE_LOGS;
  }

  render();
  // live refresh while open (host replies change the run) + animated face
  const iv = setInterval(() => {
    if (!root.isConnected) { clearInterval(iv); return; }
    root._face?.();
    const s = sig();
    if (s !== lastSig && !detail) render();
  }, 250);
  return root;
}
