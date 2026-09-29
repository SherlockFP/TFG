// DAILY panel (wave 4): login calendar, daily + weekly challenges, season track, crates. CRT panel style, opened from the main menu (DAILY)
// and in-game (key B / terminal DAILY). All data comes from game/daily_svc.js, so it works without a running game.
import { el } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import { TIERS } from '../../game/tiers.js';
import * as C from '../../game/daily_core.js';
import { playCrateReveal } from '../daily_fx.js';

const STYLE_ID = 'tfg-daily-style';
const CSS = `
.dy{width:min(1100px,96vw);max-height:92vh}
.dy .cp-body{padding:10px 20px 12px}
.dy-sum{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:baseline;margin-bottom:8px;font-size:21px}
.dy-sum b{color:var(--ph-hi);font-family:var(--cond);letter-spacing:1px;font-size:22px}
.dy-sum .fw{margin-left:auto}
.dy-sum .fw.ready{color:#ffd23f;text-shadow:0 0 8px rgba(255,210,63,.5)}
.dy .tabs .btn .dy-new,.dy-newtag{font-family:var(--font2,monospace);font-size:9px;letter-spacing:1px;padding:2px 4px;margin-left:8px;background:#ffd23f;color:#120800;text-shadow:none;vertical-align:middle;animation:dyBlink2 1.1s steps(2) infinite}
@keyframes dyBlink2{50%{opacity:.4}}
.dy-note{font-size:18px;opacity:.75;margin:6px 0}
.dy-note.good{color:#8dff9a;opacity:1}
.dy-note.warn{color:#ffb060;opacity:1}
.dy-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin:6px 0 10px}
.dy-day{position:relative;border:1px solid var(--ph-line);padding:8px 8px 6px;min-height:158px;display:flex;flex-direction:column;gap:3px;background:rgba(0,0,0,.32)}
.dy-day .dn{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;color:var(--ph-dim)}
.dy-day .cn{font-size:26px;color:#ffd23f;line-height:1;margin-top:2px}
.dy-day .xp{font-size:17px;color:#8fd6ff}
.dy-day .it{font-size:16px;line-height:1.08;opacity:.88}
.dy-day .cr{font-size:17px;line-height:1.05;color:#ff9a1f;text-shadow:0 0 8px rgba(255,154,31,.5);margin-top:auto}
.dy-day .st{position:absolute;right:6px;top:5px;font-family:var(--font2,monospace);font-size:10px;letter-spacing:1px}
.dy-day.claimed{opacity:.5}.dy-day.claimed .st{color:#8dff9a}
.dy-day.ready{border-color:var(--ph-hi);box-shadow:0 0 18px var(--ph-glow),inset 0 0 22px var(--ph-sel);animation:dyPulse 1.7s ease-in-out infinite}
.dy-day.ready .st{color:#ffd23f}
.dy-day.locked .st{color:var(--ph-dim)}
.dy-day.d7{border-color:rgba(255,154,31,.65)}
@keyframes dyPulse{50%{box-shadow:0 0 30px var(--ph-glow),inset 0 0 30px var(--ph-sel)}}
.dy-row{display:grid;grid-template-columns:1fr 210px auto;gap:14px;align-items:center;padding:8px 10px;margin-bottom:6px;border:1px solid var(--ph-line);background:rgba(0,0,0,.3)}
.dy-row.done{border-color:#4ecb5a}
.dy-row.claimed{opacity:.5}
.dy-row .qt{font-size:23px;line-height:1.05;color:var(--ph-hi)}
.dy-row .qr{font-size:17px;opacity:.85;margin-top:2px}
.dy-row .qd{font-family:var(--font2,monospace);font-size:10px;letter-spacing:2px;margin-right:8px;color:var(--ph-dim)}
.dy-bar{height:12px;background:rgba(255,255,255,.1);border:1px solid var(--ph-line)}
.dy-bar>i{display:block;height:100%;background:var(--ph-hi);box-shadow:0 0 10px var(--ph-glow)}
.dy-row.done .dy-bar>i{background:#4ecb5a}
.dy-pr{font-size:17px;opacity:.8;text-align:right;margin-top:2px}
.dy-acts{display:flex;gap:6px}
.dy-h{font-family:var(--cond);font-weight:bold;letter-spacing:2px;text-transform:uppercase;font-size:19px;color:var(--ph-hi);margin:12px 0 6px;display:flex;gap:14px;align-items:baseline}
.dy-h span{font-size:16px;opacity:.65;font-weight:normal;letter-spacing:1px;text-transform:none}
.dy-seas{display:grid;grid-template-columns:repeat(10,1fr);gap:6px;margin-top:8px}
.dy-t{position:relative;border:1px solid var(--ph-line);padding:5px 6px 4px;min-height:96px;background:rgba(0,0,0,.3);font-size:15px;line-height:1.05;display:flex;flex-direction:column;gap:2px;cursor:default;text-align:left;color:var(--ph);font-family:inherit}
.dy-t .tn{font-family:var(--font2,monospace);font-size:11px;color:var(--ph-dim)}
.dy-t .tc{color:#ffd23f;font-size:17px}
.dy-t .tx{opacity:.85}
.dy-t .tk{margin-top:auto;font-size:14px;color:var(--c,#ff9a1f);text-shadow:0 0 6px var(--c,#ff9a1f)}
.dy-t .tt{font-size:14px;color:#8fd6ff}
.dy-t.claimed{opacity:.42}
.dy-t.claimed::after{content:'\\2713';position:absolute;right:5px;top:3px;color:#8dff9a}
.dy-t.can{border-color:var(--ph-hi);cursor:pointer;box-shadow:0 0 14px var(--ph-glow);animation:dyPulse 1.5s ease-in-out infinite}
.dy-t.can:hover,.dy-t.can:focus-visible{background:var(--ph-sel)}
.dy-t.cur{border-color:#ffd23f}
.dy-crs{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin-top:8px}
.dy-cr{--c:#ffb04a;position:relative;border:2px solid var(--c);padding:10px 12px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(0,0,0,.4));box-shadow:inset 0 -30px 30px -24px var(--c),0 0 14px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:3px}
.dy-cr .cn{font-size:26px;color:#fff2de;text-shadow:0 0 10px var(--c)}
.dy-cr .cs{font-size:17px;opacity:.75}
.dy-cr .btn{margin-top:8px;align-self:flex-start}
.dy-empty{padding:26px 10px;text-align:center;opacity:.65;font-size:21px}
.dy-stash{font-size:17px;margin-top:8px;opacity:.85}
@media (max-width:900px){.dy-cal{grid-template-columns:repeat(4,1fr)}.dy-seas{grid-template-columns:repeat(5,1fr)}.dy-row{grid-template-columns:1fr}}
`;
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
const TAB_IDS = ['login', 'quests', 'season', 'crates'];
const KIND_COLOR = { supply: '#ffb04a', cosmetic: '#b35cff', weekly: '#3d8bff', season: '#ff9a1f', quota: '#ffd23f' };
const DIFF_NAME = { easy: 'EASY', mid: 'MEDIUM', hard: 'HARD', week: 'WEEKLY' };

/** Short one-line summary of a reward object. */
export function rewardBits(svc, r) {
  const out = [];
  if (r.coin) out.push({ k: 'cn', text: `◈ ${r.coin}` });
  if (r.xp) out.push({ k: 'xp', text: `+${r.xp} XP` });
  for (const [id, n] of r.items || []) out.push({ k: 'it', text: `${t(svc.itemName(id))} x${n}` });
  if (r.crate) out.push({ k: 'cr', text: r.crate.tier ? tf('{tier} cosmetic crate', { tier: t(TIERS[r.crate.tier].name) }) : t(C.crateDef(r.crate.kind).name), color: KIND_COLOR[r.crate.kind] });
  if (r.title) out.push({ k: 'tt', text: `${t('Title')}: ${t(r.title)}` });
  return out;
}

/**
 * opts: { ui, svc, closeButton (node), tab }. Returns { el, dispose, setTab }.
 */
export function createDailyPanel({ ui, svc, closeButton, tab = null }) {
  ensureStyle();
  const wrap = ui.panel('wide dy');
  let cur = TAB_IDS.includes(tab) ? tab : null;
  let disposed = false;
  svc.settleSeason();
  const att0 = svc.attention();
  if (!cur) cur = att0.login ? 'login' : att0.quests + att0.weekly > 0 ? 'quests' : att0.season > 0 ? 'season' : att0.crates > 0 ? 'crates' : 'login';
  const offChange = svc.onChange(() => { if (!disposed && wrap.isConnected) render(); });
  const msg = { text: '', kind: '' };

  const nav = (node, key) => { node.dataset.nav = key; return node; };
  const btn = (label, fn, cls, key) => nav(ui.button(label, fn, cls), key || ('b:' + label));

  function summary() {
    const l = svc.login(), s = svc.season(), a = svc.attention();
    const fw = C.firstWinAvailable(svc.profile);
    return el('div', { class: 'dy-sum' },
      el('span', {}, t('Streak'), ' ', el('b', {}, String(l.streak)), ` (${t('best')} ${l.best})`),
      el('span', {}, t('Season tier'), ' ', el('b', {}, `${s.tier}/${C.SEASON_TIERS}`)),
      el('span', {}, t('Crates'), ' ', el('b', {}, String(a.crates))),
      el('span', { class: 'fw' + (fw ? ' ready' : '') }, fw ? t('First win of the day: x2 XP ready') : t('First win bonus used today')));
  }
  function tabs() {
    const a = svc.attention();
    const flag = { login: a.login, quests: a.quests + a.weekly > 0, season: a.season > 0, crates: a.crates > 0 };
    const label = { login: 'Login rewards', quests: 'Challenges', season: 'Season', crates: 'Crates' };
    return el('div', { class: 'tabs' }, ...TAB_IDS.map((id) => {
      const b = ui.button(t(label[id]), () => { if (cur === id) return; cur = id; msg.text = ''; render(); ui.flick?.(wrap); }, cur === id ? 'tab sel' : 'tab');
      b.dataset.nav = 'tab:' + id;
      if (flag[id]) b.appendChild(el('span', { class: 'dy-new' }, t('NEW!')));
      return b;
    }));
  }

  // ---------------------------------------------------------------- login tab
  function loginTab() {
    const l = svc.login();
    const box = el('div', {});
    if (l.tampered) box.appendChild(el('div', { class: 'dy-note warn' }, t('Your clock looks off. Rewards follow the latest date this account has seen.')));
    const cal = el('div', { class: 'dy-cal' });
    for (const c of l.calendar) {
      const bits = rewardBits(svc, c.reward);
      const day = el('div', { class: `dy-day ${c.state}${c.day === 7 ? ' d7' : ''}` },
        el('div', { class: 'dn' }, `${t('DAY')} ${c.day}`),
        el('div', { class: 'st' }, c.state === 'claimed' ? t('CLAIMED') : c.state === 'ready' ? t('TODAY') : ''),
        ...bits.map((b) => { const n = el('div', { class: b.k }, b.text); if (b.color) n.style.color = b.color; return n; }));
      cal.appendChild(day);
    }
    box.appendChild(cal);
    if (l.canClaim) {
      const cb = btn(tf('CLAIM DAY {n}', { n: l.day }), () => {
        const r = svc.claimLogin();
        if (r.ok) {
          msg.kind = 'good';
          msg.text = r.lapse === 'grace' ? t('Grace day used: your streak is safe.') : r.lapse === 'reset' ? (r.comeback ? t('Welcome back. A new week starts with a comeback bonus on day 1.') : t('A fresh week starts.')) : tf('Day {n} claimed. See you tomorrow.', { n: r.day });
          if (r.reward.crate) msg.text += ' ' + t('A cosmetic crate is waiting in CRATES.');
        }
        render('b:crate');
      }, 'primary big', 'b:claim');
      box.appendChild(el('div', { class: 'menu-row' }, cb));
      if (l.lapse === 'grace') box.appendChild(el('div', { class: 'dy-note warn' }, t('You missed a day. Your grace day keeps the streak alive if you claim now.')));
      else if (l.lapse === 'reset') box.appendChild(el('div', { class: 'dy-note warn' }, l.comeback ? t('The streak ended, so the week starts over. No hard feelings: day 1 pays a comeback bonus.') : t('The week starts over from day 1.')));
    } else {
      const h = l.hoursToNext, hh = Math.floor(h), mm = Math.max(0, Math.round((h - hh) * 60));
      box.appendChild(el('div', { class: 'dy-note good' }, tf('Today is claimed. Next reward in {h}h {m}m.', { h: hh, m: mm })));
    }
    if (msg.text) box.appendChild(el('div', { class: 'dy-note ' + msg.kind }, msg.text));
    box.appendChild(el('div', { class: 'dy-note' }, `${t('Total logins')}: ${l.total} · ${t('Best streak')}: ${l.best} · ${l.grace ? t('Grace day ready: missing one day will not break the streak.') : t('Grace day recharges after 3 days in a row.')}`));
    const st = svc.stash();
    if (st.length) box.appendChild(el('div', { class: 'dy-stash' }, `${t('Waiting for the ship (delivered when you are in orbit)')}: ${svc.itemsText(st)}`));
    return box;
  }

  // ---------------------------------------------------------------- challenges tab
  function questRow(q, scope, index, rerolled) {
    const tpl = C.questTemplate(q.id);
    const target = svc.questTarget(q), prog = Math.min(target, q.prog);
    const done = prog >= target;
    const rw = svc.questReward(q);
    const bits = rw ? rewardBits(svc, { ...rw }).map((b) => b.text).join(' · ') : '';
    const row = el('div', { class: 'dy-row' + (q.claimed ? ' claimed' : done ? ' done' : '') },
      el('div', {}, el('div', { class: 'qt' }, el('span', { class: 'qd' }, t(DIFF_NAME[tpl?.diff] || '')), svc.questText(q)), el('div', { class: 'qr' }, `${t('Reward')}: ${bits} · ${rw?.sxp || 0} ${t('season XP')}`)),
      el('div', {}, el('div', { class: 'dy-bar' }, el('i', { style: { width: (prog / target * 100) + '%' } })), el('div', { class: 'dy-pr' }, `${Math.floor(prog)} / ${target}`)));
    const acts = el('div', { class: 'dy-acts' });
    if (q.claimed) acts.appendChild(el('span', { class: 'dy-note' }, t('CLAIMED')));
    else if (done) acts.appendChild(btn(t('CLAIM'), () => { const r = svc.claimQuest(scope, index); if (r.ok && r.out?.crate) { msg.text = t('Bonus crate earned. Open it in CRATES.'); msg.kind = 'good'; } render(`b:q${scope}${index}`); }, 'primary small', `b:q${scope}${index}`));
    else if (scope === 'day') {
      const b = btn(t('REROLL'), () => { const r = svc.reroll(index); msg.text = r.ok ? t('Challenge replaced.') : ''; render(); }, 'small' + (rerolled ? ' disabled' : ''), `b:rr${index}`);
      b.title = rerolled ? t('One reroll per day, already used') : t('Swap this challenge for another of the same difficulty (once per day)');
      acts.appendChild(b);
    }
    row.appendChild(acts);
    return row;
  }
  function questsTab() {
    const Q = svc.quests();
    const box = el('div', {});
    box.appendChild(el('div', { class: 'dy-h' }, t('Daily challenges'), el('span', {}, t('same three for every player today · resets at midnight'))));
    Q.daily.forEach((q, i) => box.appendChild(questRow(q, 'day', i, Q.rerolled)));
    box.appendChild(el('div', { class: 'dy-note' }, t('Finish and claim all three for a Supply Crate.')));
    box.appendChild(el('div', { class: 'dy-h' }, t('Weekly challenges'), el('span', {}, tf('resets in {n} days', { n: Q.weekDays }))));
    Q.weekly.forEach((q, i) => box.appendChild(questRow(q, 'week', i, true)));
    box.appendChild(el('div', { class: 'dy-note' }, t('Claim all three weekly challenges for a Weekly Crate (a rare-or-better cosmetic).')));
    if (msg.text) box.appendChild(el('div', { class: 'dy-note ' + msg.kind }, msg.text));
    return box;
  }

  // ---------------------------------------------------------------- season tab
  function seasonTab() {
    const s = svc.season();
    const box = el('div', {});
    const pct = s.maxed ? 100 : (s.into / s.need * 100);
    box.appendChild(el('div', { class: 'dy-h' }, `${t('Season')} ${s.key}`, el('span', {}, tf('{n} days left · free track, earned by playing', { n: s.daysLeft }))));
    box.appendChild(el('div', {}, el('div', { class: 'dy-bar' }, el('i', { style: { width: pct + '%' } })),
      el('div', { class: 'dy-pr' }, s.maxed ? t('All tiers reached') : tf('Tier {tier} · {into} / {need} season XP to the next', { tier: s.tier, into: s.into, need: s.need }))));
    const acts = el('div', { class: 'menu-row' });
    if (s.claimable.length) acts.appendChild(btn(tf('CLAIM ALL ({n})', { n: s.claimable.length }), () => { const outs = svc.claimAllSeason(); if (outs.some((o) => o.out?.crate)) { msg.text = t('Season crates are waiting in CRATES.'); msg.kind = 'good'; } render('b:sall'); }, 'primary', 'b:sall'));
    box.appendChild(acts);
    const grid = el('div', { class: 'dy-seas' });
    for (let n = 1; n <= C.SEASON_TIERS; n++) {
      const rw = C.seasonReward(n);
      const claimed = s.claimed.includes(n), can = !claimed && n <= s.tier;
      const cell = el(can ? 'button' : 'div', { class: `dy-t${claimed ? ' claimed' : ''}${can ? ' can' : ''}${n === s.tier + 1 ? ' cur' : ''}`, type: can ? 'button' : undefined },
        el('div', { class: 'tn' }, String(n).padStart(2, '0')),
        el('div', { class: 'tc' }, `◈ ${rw.coin}`),
        ...rw.items.map(([id, c]) => el('div', { class: 'tx' }, `${t(svc.itemName(id))} x${c}`)));
      if (rw.crate) { const k = el('div', { class: 'tk' }, rw.crate.tier ? tf('{tier} cosmetic', { tier: t(TIERS[rw.crate.tier].name) }) : t('Supply Crate')); k.style.setProperty('--c', rw.crate.tier ? TIERS[rw.crate.tier].color : KIND_COLOR.supply); cell.appendChild(k); }
      if (rw.title) cell.appendChild(el('div', { class: 'tt' }, `${t('Title')}: ${t(rw.title)}`));
      if (can) { cell.dataset.nav = 'tier:' + n; cell.tabIndex = 0; cell.addEventListener('click', () => { ui.sfx?.('ui_click', 0.5); const r = svc.claimSeason(n); if (r.ok && r.out?.crate) { msg.text = t('Season crate earned. Open it in CRATES.'); msg.kind = 'good'; } render('tier:' + n); }); }
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    if (msg.text) box.appendChild(el('div', { class: 'dy-note ' + msg.kind }, msg.text));
    box.appendChild(el('div', { class: 'dy-note' }, t('Season XP comes from challenges, surviving days, quotas, kills and selling scrap. The track restarts every month; anything you earned but did not claim is collected for you.')));
    return box;
  }

  // ---------------------------------------------------------------- crates tab
  function cratesTab() {
    const list = svc.crates();
    const box = el('div', {});
    box.appendChild(el('div', { class: 'dy-h' }, t('Crates'), el('span', {}, t('earned by playing, never bought'))));
    if (!list.length) {
      box.appendChild(el('div', { class: 'dy-empty' }, t('No crates yet. Day 7 of the login calendar, finishing all daily or weekly challenges, meeting a quota (once a day), season milestones and level milestones all award one.')));
    } else {
      const grid = el('div', { class: 'dy-crs' });
      for (const c of list) {
        const col = c.tier ? TIERS[c.tier]?.color : KIND_COLOR[c.kind] || '#ffb04a';
        const card = el('div', { class: 'dy-cr' }, el('div', { class: 'cn' }, svc.crateName(c.kind)), el('div', { class: 'cs' }, svc.crateTag(c.kind)), el('div', { class: 'cs' }, `${t('Can contain')}: ${svc.crateRange(c)}`));
        card.style.setProperty('--c', col);
        card.appendChild(btn(t('OPEN'), () => openCrate(c), 'primary', 'b:open:' + c.id));
        grid.appendChild(card);
      }
      box.appendChild(grid);
    }
    const st = svc.stash();
    if (st.length) box.appendChild(el('div', { class: 'dy-stash' }, `${t('Waiting for the ship (delivered when you are in orbit)')}: ${svc.itemsText(st)}`));
    return box;
  }
  function openCrate(c) {
    const r = svc.openCrate(c.id);
    if (!r.ok) { render(); return; }
    const kindName = svc.crateName(c.kind);
    // svc.changed() re-rendered the list behind the overlay; the reveal is theatre over an already applied reward
    playCrateReveal({
      root: ui.root || document.body, crate: c, name: kindName, color: c.tier ? TIERS[c.tier]?.color : undefined,
      cards: svc.reelCards(c, 40), view: r.view, sfx: (n, v, p) => svc.sfx(n, v, p), reduce: svc.reduceMotion(),
      onDone: () => { if (!disposed) render('b:claim'); },
    });
  }

  // ---------------------------------------------------------------- frame
  function render(focusKey) {
    if (disposed) return;
    const prev = focusKey || document.activeElement?.dataset?.nav;
    C.clearNew(svc.profile, { login: 'login', quests: 'quests', season: 'season', crates: 'crates' }[cur]);
    if (cur === 'quests') C.clearNew(svc.profile, 'weekly');
    if (cur === 'crates') C.clearNew(svc.profile, 'stash');
    const body = el('div', { class: 'cp-body' }, summary(), tabs(), cur === 'login' ? loginTab() : cur === 'quests' ? questsTab() : cur === 'season' ? seasonTab() : cratesTab(),
      el('div', { class: 'menu-row' }, closeButton));
    wrap.replaceChildren(ui.panelHead(t('DAILY'), t('rewards · challenges · season')), body, ui.panelFoot());
    if (prev) { const n = wrap.querySelector(`[data-nav="${CSS.escape(prev)}"]`); n?.focus?.({ preventScroll: true }); }
  }
  render();
  return {
    el: wrap,
    setTab(id) { if (TAB_IDS.includes(id)) { cur = id; render(); } },
    dispose() { disposed = true; offChange(); },
  };
}
