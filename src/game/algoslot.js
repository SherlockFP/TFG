// ALGOSLOT (wave 9, docs/wave9/algoslot.md). Installed with `this.useModule('algoslot', installAlgoSlot)`.
// Contextual surveillance detail after the opening:
//   LIVE strip   a slim "● LIVE 1,470" strip top-left above HP. The number is algo1's viewer count (the ONE number: stream overlay seeds it,
//                the strip / report / story peak read it). Calm modes show exposure or a short event delta; Full stays visible.
//   reactions    once in a while (>= REACT_GAP s apart) ONE surveillance line goes through the Algorithm subtitle.
//   report       the day report gets a "LIVE peak N" line.
// The Algorithm subtitle itself (algorithm.js) is react-only; QUOTA / CREDITS / ROUTE moved to the Tab card + terminal header.
import { t, tf, addTranslations } from '../core/i18n.js';
import { liveText, liveDeltaText, fmtLive, reactKey } from './onegoal_core.js';
import { hudDensityOf } from '../ui/hudcalm_ui.js';

// pool key -> [EN, TR, RU] lines (local Algorithm surveillance reactions)
export const REACT = {
  tagged: [['Recording retained. Your route is visible.', 'Kayıt saklandı. Rotan görünür durumda.', 'Запись сохранена. Ваш маршрут виден.'], ['That camera is still working.', 'O kamera hâlâ çalışıyor.', 'Эта камера ещё работает.']],
  downed: [['Crew member down. Account for everyone.', 'Ekip üyesi düştü. Herkesi kontrol edin.', 'Член экипажа упал. Проверьте всех.'], ['The recording continues.', 'Kayıt devam ediyor.', 'Запись продолжается.']],
  escape: [['Return recorded. Count the crew.', 'Dönüş kaydedildi. Ekibi sayın.', 'Возвращение записано. Пересчитайте экипаж.']],
  boss: [['Impact recorded. It is still moving.', 'Darbe kaydedildi. Hâlâ hareket ediyor.', 'Удар записан. Оно ещё движется.']],
  dodge: [['Contact avoided. Keep a return route.', 'Temas önlendi. Dönüş yolunu açık tutun.', 'Контакт предотвращён. Сохраните путь назад.']],
  closet: [['Do not open the closet.', 'Dolabı açmayın.', 'Не открывайте шкаф.'], ['Movement lost. Listening continues.', 'Hareket kayboldu. Dinleme devam ediyor.', 'Движение потеряно. Прослушивание продолжается.']],
};
const TR = {}, RU = {};
for (const pool of Object.values(REACT)) for (const [en, trs, rus] of pool) { TR[en] = trs; RU[en] = rus; }
Object.assign(TR, { 'LIVE peak {n} viewers': 'Yayın zirvesi: {n} izleyici' });
Object.assign(RU, { 'LIVE peak {n} viewers': 'ПИК В ЭФИРЕ: {n} зрителей' });
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

const CSS = `.hud-live[hidden]{display:none}
.hud-live{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;padding:2px 8px 1px;background:rgba(10,7,4,.62);border:1px solid rgba(255,74,74,.45);
 font:700 15px/1.15 var(--font2,var(--font,monospace));letter-spacing:.1em;color:#ff5a4a;text-shadow:none;white-space:nowrap}
.hud-live .algo-live{color:inherit}.hud-live .algo-live.fc-tag{color:#ff9a40}
.hud-live-d{color:#ffd9b0;opacity:0;transition:opacity .5s;font-size:14px}.hud-live-d.on{opacity:1;transition:none}`;

export function installAlgoSlot(game) {
  if (typeof document === 'undefined') return { dispose() {} };
  const offs = [];
  const st = document.createElement('style'); st.id = 'tfg-algoslot-css'; st.textContent = CSS; document.head.appendChild(st);
  const strip = document.createElement('div'); strip.className = 'hud-live'; strip.hidden = true;
  strip.innerHTML = `<span class="algo-live">\u25CF LIVE</span><span class="hud-live-d"></span>`;
  const numEl = strip.querySelector('.algo-live'), dEl = strip.querySelector('.hud-live-d');
  let peak = 0, sinceReact = 1e9, popT = 0, rn = 0, attachT = 0;
  const viewers = () => { try { return game.algo1?.viewers?.() ?? 0; } catch { return 0; } };
  const paint = (n) => { const s = liveText(n); if (numEl.textContent !== s) numEl.textContent = s; };
  function attach() {
    const tl = game.ui?.hud?.el?.querySelector?.('.hud-tl');
    if (tl && strip.parentNode !== tl) tl.prepend(strip);
  }
  function visibility() {
    const exposure = game.run?.fc?.p?.[game.selfId];
    const active = game.run?.phase === 'moon' && !game.player?.dead &&
      !!(exposure && (exposure[0] > 0 || exposure[1] || exposure[2]));
    const hidden = !(hudDensityOf(game.settings) === 'full' || active || popT > 0);
    if (strip.hidden !== hidden) strip.hidden = hidden;
  }
  function react(kind) {
    const key = reactKey(kind, sinceReact, Math.random());
    if (!key || game.run?.phase !== 'moon') return;
    const pool = REACT[key];
    const [en] = pool[(rn++ + Math.floor(Math.random() * pool.length)) % pool.length];
    sinceReact = 0;
    try { game.lore?.say?.(t(en), { cls: 'flavour', ttl: 7 }); } catch { /* lore optional */ }
  }
  offs.push(game.mods.on('tfg:viewers', (d, g) => {
    if (g && g !== game) return;
    const n = Math.round(d?.viewers || 0);
    peak = Math.max(peak, n); paint(n);
    if (d?.reason && d.delta > 0) {
      dEl.textContent = liveDeltaText(d.delta); dEl.classList.add('on'); popT = 2.5;
      react(d.reason);
    }
  }));
  offs.push(game.mods.on('phase', (ph, g) => { if (g && g !== game) return; if (ph === 'landing') peak = viewers(); }));
  offs.push(game.mods.on('daySummary', (d, extra, g) => {
    if ((g && g !== game) || !d || d.company || !Array.isArray(extra)) return;
    peak = Math.max(peak, viewers());
    if (peak > 0) extra.push(`<b>● ${tf('LIVE peak {n} viewers', { n: fmtLive(peak) })}</b>`);
  }));
  offs.push(game.mods.on('update', (dt, g) => {
    if (g && g !== game) return;
    sinceReact += dt;
    if (popT > 0 && (popT -= dt) <= 0) dEl.classList.remove('on');
    attachT -= dt;
    if (attachT <= 0) { attachT = 0.5; attach(); const n = viewers(); if (n) { peak = Math.max(peak, n); paint(n); } }
    visibility();
  }));
  return {
    strip, peak: () => peak,
    dispose() { for (const f of offs) { try { f(); } catch { /* ignore */ } } strip.remove(); st.remove(); },
  };
}
