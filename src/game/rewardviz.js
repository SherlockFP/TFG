// REWARDVIZ (wave 8, docs/wave8/rewardviz.md): invisible reward numbers become readable moments. Installed with `this.useModule('rewardviz', installRewardviz)`.
//   1. a per-day ledger (job pay, crate, pocket loot, diner, ore, Clout, fees, viewer tax) fed by the modules' existing net messages (additive net.on, no edits there)
//      -> one marked block in the day summary, split by source, with count-up amounts
//   2. before-it-hurts: lever warning "Job not started: -fee" (press E again to confirm), diner till announced on the homeworld
//   3. scan chips: "+N % VALUE" from the sector map (cursed scrap gets its own chip in lcmonsters)
//   4. reward pop: payouts >= POP_MIN (100) get a coin sound + a fly-up number, smaller ones stay quiet
// Net (prefix 'rv'): 'rvpk' host -> everyone {id} (a pocket loot item id, HOST_ONLY).
import { t, tf, addTranslations } from '../core/i18n.js';
import { fmtMoney, escapeHtml } from '../core/util.js';
import { HOST_ONLY } from '../net/session.js';
import { MOONS } from './moons.js';
import { insideShip } from '../world/ship.js';
import { rewardOf } from './mapmods_core.js';
import { FAIL_FEE } from './facjobs_core.js';
import * as C from './rewardviz_core.js';

HOST_ONLY.add('rvpk');

const LABEL = { scrap: 'Scrap', job: 'Job pay', crate: 'Job crate', pocket: 'Pocket loot', map: 'MAP BONUS', till: 'Diner', ore: 'Ore mined', clout: 'Clout', fine: 'Casualty fine', fee: 'Job fee', tax: 'Viewer tax' };
const TR = {
  'INCOME BY SOURCE': 'KAYNAĞA GÖRE GELİR', Scrap: 'Hurda', 'Job pay': 'Görev ödemesi', 'Job crate': 'Görev sandığı', 'Pocket loot': 'Cep ganimeti', 'MAP BONUS': 'HARİTA BONUSU',
  Diner: 'Lokanta', 'Ore mined': 'Çıkarılan cevher', Clout: 'Clout', 'Casualty fine': 'Kayıp cezası', 'Job fee': 'Görev harcı', 'Viewer tax': 'İzleyici vergisi',
  'Job not started: -▮{n} fee': 'Görev başlamadı: -▮{n} ücret', 'Job not started: -▮{n} fee. Press E again to leave anyway': 'Görev başlamadı: -▮{n} ücret. Yine de kalkmak için tekrar E',
  'ORE {a}/{b} today': 'CEVHER {a}/{b} bugün', 'The diner made ▮{n} while you were away': 'Lokanta sen yokken ▮{n} kazandı',
  '+{n} % VALUE': '+%{n} DEĞER', 'CURSED ×{n}': 'LANETLİ ×{n}',
};
const RU = {
  'INCOME BY SOURCE': 'ДОХОД ПО ИСТОЧНИКАМ', Scrap: 'Хлам', 'Job pay': 'Оплата задания', 'Job crate': 'Ящик задания', 'Pocket loot': 'Добыча из кармана', 'MAP BONUS': 'БОНУС КАРТЫ',
  Diner: 'Закусочная', 'Ore mined': 'Добыто руды', Clout: 'Клаут', 'Casualty fine': 'Штраф за потери', 'Job fee': 'Штраф за задание', 'Viewer tax': 'Налог зрителей',
  'Job not started: -▮{n} fee': 'Задание не начато: -▮{n} штраф', 'Job not started: -▮{n} fee. Press E again to leave anyway': 'Задание не начато: -▮{n} штраф. Нажми E ещё раз, чтобы всё равно взлететь',
  'ORE {a}/{b} today': 'РУДА {a}/{b} сегодня', 'The diner made ▮{n} while you were away': 'Закусочная заработала ▮{n}, пока вас не было',
  '+{n} % VALUE': '+{n} % СТОИМОСТИ', 'CURSED ×{n}': 'ПРОКЛЯТО ×{n}',
};
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

const CSS = `.rv-pop{position:fixed;left:50%;top:56%;transform:translateX(-50%);pointer-events:none;z-index:45;font-family:var(--cond,'Barlow Condensed','Arial Narrow',sans-serif);font-size:30px;color:#f2c230;text-shadow:0 2px 8px #000;opacity:0}
.rv-sum{margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,.18);font-size:13px}
.rv-sum .rv-h{opacity:.7;letter-spacing:.08em;font-size:11px;margin-bottom:2px}
.rv-row{display:flex;gap:8px;align-items:baseline;line-height:1.35}.rv-row i{width:1.2em;text-align:center;font-style:normal;color:#f2c230}
.rv-row span{flex:1}.rv-row b{font-variant-numeric:tabular-nums}.rv-row.cost i,.rv-row.cost b{color:#ff6a5a}`;

export function installRewardviz(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], timers = [];
  let disposed = false, style = null, boundNet = null, armed = 0;
  const L = C.freshLedger();
  const pocket = new Set();
  const run = () => game.run;
  const me = () => game.selfId;
  const toast = (m, k) => { try { game.ui?.toast?.(m, k); } catch { /* ui optional */ } };
  if (typeof document !== 'undefined') { style = document.createElement('style'); style.textContent = CSS; document.head?.appendChild(style); }
  const mapVal = () => rewardOf(run()?.mm?.cur?.a).val || 0;

  // ---------------------------------------------------------------- 4. reward pop
  function pop(n) {
    n = Math.round(+n);
    if (disposed || !C.shouldPop(n)) return false;
    try { game.audio?.play?.('coins', { volume: 0.5, pitch: 0.9 + Math.min(0.5, n / 800) }); } catch { /* audio optional */ }
    if (typeof document === 'undefined') return true;
    const el = document.createElement('div'); el.className = 'rv-pop'; el.textContent = '+' + fmtMoney(n);
    (document.getElementById('ui') || document.body).appendChild(el);
    try { el.animate([{ opacity: 0, transform: 'translate(-50%,14px) scale(.8)' }, { opacity: 1, transform: 'translate(-50%,-6px) scale(1.15)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-56px) scale(1)' }], { duration: 1100, easing: 'ease-out' }); } catch { /* no WAAPI */ }
    timers.push(setTimeout(() => el.remove(), 1150));
    return true;
  }
  /** any module: game.rewardviz.reward('job', 140) - books it and pops when big */
  function reward(src, n) { if (C.note(L, src, n) && src !== 'fee' && src !== 'tax' && src !== 'ore' && src !== 'clout' && src !== 'pocket' && src !== 'crate') pop(n); }

  // ---------------------------------------------------------------- 1. ledger feeds (additive net listeners on other modules' messages)
  const onFj = (d) => { if (d?.k !== 'pay') return; reward('job', d.cr); C.note(L, 'clout', d.cl); if (d.full && (d.cr || d.cl)) C.note(L, 'crate', 1); C.note(L, 'fee', d.fee); };
  const onRs = (m) => { if (m?.k === 'till') reward('till', m.n); else if (m?.k === 'pay') C.note(L, 'till', m.amt); };
  const onAc = (m) => { if (m?.k === 'r' && (m.to === me() || !game.net)) C.note(L, 'clout', m.coins); };
  const onFc = (d) => { if (d?.k === 'sale') C.note(L, 'tax', d.cut); };
  const onPk = (d) => { if (d && d.id != null) pocket.add(d.id); };
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet = net;
    net.on('msg:fjfx', onFj); net.on('msg:rsmsg', onRs); net.on('msg:ac2s', onAc); net.on('msg:fcfx', onFc); net.on('msg:rvpk', onPk);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  /** host: the backrooms pocket registers each loot item it spawns (so the day summary can value what reached the ship) */
  function pocketItem(id) { if (id == null) return; pocket.add(id); try { if (game.isHost) game.net?.broadcast('rvpk', { id }); } catch { /* net closing */ } }
  function pocketValue() {
    let v = 0;
    for (const id of pocket) { const it = game.items?.get?.(id); if (it && (it.holder || (it.obj && insideShip(it.obj.position)))) v += it.value || 0; }
    return Math.round(v);
  }

  // day summary: one clearly marked block (kept apart from feedcams' Highlights line)
  offs.push(mods.on('daySummary', (d, extra, g) => {
    if (g !== game || !d) return;
    try {
      L.pocket = Math.max(L.pocket, pocketValue());
      const rows = C.rowsOf(L, d, mapVal());
      if (rows.length > 1) {
        extra.push(`<div class="rv-sum"><div class="rv-h">${escapeHtml(t('INCOME BY SOURCE'))}</div>${rows.map(([k, gl, n, sg], i) => `<div class="rv-row${sg === '-' ? ' cost' : ''}" data-i="${i}"><i>${gl}</i><span>${escapeHtml(t(LABEL[k]))}${k === 'crate' ? ' ×' + n : ''}</span>${k === 'crate' ? '' : `<b class="rv-n" data-v="${n}" data-pre="${sg}${k === 'clout' ? '◈' : '▮'}">${sg}${k === 'clout' ? '◈' : '▮'}0</b>`}</div>`).join('')}</div>`);
        timers.push(setTimeout(countUp, 120));
      }
    } catch (e) { console.warn('[rewardviz] summary', e); }
    for (const k of Object.keys(L)) L[k] = 0;
    pocket.clear();
  }));
  function countUp() {
    if (disposed || typeof document === 'undefined') return;
    document.querySelectorAll('.rv-sum .rv-n').forEach((b, i) => {
      const v = +b.dataset.v || 0, pre = b.dataset.pre || '';
      timers.push(setTimeout(() => {
        const t0 = performance.now(), dur = 600;
        const step = (now) => { const k = Math.min(1, (now - t0) / dur); b.textContent = pre + Math.round(v * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US'); if (k < 1 && b.isConnected) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }, 900 + i * 260));
    });
  }

  // ---------------------------------------------------------------- 2. warnings before it hurts
  const feeNow = () => { const r = run(); return r && r.phase === 'moon' && !MOONS[r.moon]?.company ? C.leverFee(r.fj?.j, r.credits, FAIL_FEE) : 0; };
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed) return;
    const lever = game.ship?.points?.lever;
    const o = lever && list.find((q) => q.pos === lever);
    if (!o || typeof o.action !== 'function') return;
    const orig = o.action;
    o.sub = () => { const f = feeNow(); if (!f) return ''; return performance.now() < armed ? tf('Job not started: -▮{n} fee. Press E again to leave anyway', { n: f }) : tf('Job not started: -▮{n} fee', { n: f }); };
    o.action = () => {
      const f = feeNow(), now = performance.now();
      if (f && now >= armed) { armed = now + C.WARN_SECS * 1000; toast(tf('Job not started: -▮{n} fee', { n: f }), 'warn'); try { game.audio?.play?.('ui_error', { volume: 0.4, bus: 'ui' }); } catch { /* audio optional */ } return; }
      armed = 0; orig();
    };
  }));
  // the diner till, announced on arrival at the homeworld
  offs.push(mods.on('mapLoaded', (world, g) => {
    if (g !== game) return;
    const r = run(), till = Math.floor(r?.rs?.till || 0);
    if (!MOONS[r?.moon]?.home || MOONS[r?.moon]?.ghost || till < 1) return;
    timers.push(setTimeout(() => { if (!disposed) toast(tf('The diner made ▮{n} while you were away', { n: till }), 'good'); }, 2500));
  }));
  offs.push(mods.on('phase', (ph, g) => { if (g && g !== game) return; if (ph === 'moon') { armed = 0; pocket.clear(); } }));

  // ---------------------------------------------------------------- 3. scan chip: sector-map value
  offs.push(mods.on('scanLabels', (labels, eye, fwd, g) => {
    if (g !== game || disposed) return;
    const v = mapVal(); if (v <= 0) return;
    const chip = tf('+{n} % VALUE', { n: Math.round(v) });
    for (const l of labels) if (l.type && l.type !== 'body' && l.sub && l.sub.includes('▮')) l.sub = `${l.sub} · ${chip}`;
  }));

  return {
    pop, reward, pocketItem, pocketValue, ledger: () => ({ ...L }),
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const id of timers) clearTimeout(id);
      try { boundNet?.off?.('msg:fjfx', onFj); boundNet?.off?.('msg:rsmsg', onRs); boundNet?.off?.('msg:ac2s', onAc); boundNet?.off?.('msg:fcfx', onFc); boundNet?.off?.('msg:rvpk', onPk); } catch { /* ignore */ }
      style?.remove();
    },
  };
}
