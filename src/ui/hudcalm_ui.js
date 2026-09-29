// HUD density (wave 8 declutter): the Settings > HUD select + the strings of the calm HUD (EN keys, TR + RU tables).
import { t, addTranslations } from '../core/i18n.js';

export const HUD_DENSITIES = ['minimal', 'standard', 'full'];
export const hudDensityOf = (s) => (HUD_DENSITIES.includes(s?.hudDensity) ? s.hudDensity : 'standard');

const TR = {
  'HUD density': 'Ekran yoğunluğu', 'Minimal (fewest)': 'Sade (en az)', 'Standard (recommended)': 'Standart (önerilen)', 'Full (everything)': 'Tam (her şey)',
  'Standard: only health, hotbar, compass, objective and threat stay on screen; everything else shows when it changes. Hold Tab for the full status. Full: everything, always.':
    'Standart: ekranda sadece can, çanta, pusula, hedef ve tehdit kalır; gerisi değişince kısa süre görünür. Tam durum için Tab tuşunu basılı tut. Tam: her şey, hep açık.',
  'Full status (hold)': 'Tam durum (basılı tut)', 'FULL STATUS': 'TAM DURUM', OBJECTIVES: 'HEDEFLER', RUN: 'GÖREV', STATUS: 'DURUM',
  'hold {key} for the full status': 'tam durum için {key} basılı tut', 'Nothing else to report.': 'Bildirilecek başka bir şey yok.',
  'Day {n}': 'Gün {n}', 'Days left': 'Kalan gün', 'dead': 'ölü', Clock: 'Saat', Weight: 'Ağırlık',
};
const RU = {
  'HUD density': 'Плотность HUD', 'Minimal (fewest)': 'Минимум', 'Standard (recommended)': 'Стандарт (рекомендуется)', 'Full (everything)': 'Полный (всё)',
  'Standard: only health, hotbar, compass, objective and threat stay on screen; everything else shows when it changes. Hold Tab for the full status. Full: everything, always.':
    'Стандарт: на экране только здоровье, слоты, компас, цель и угроза; остальное появляется при изменении. Удерживайте Tab для полного статуса. Полный: всё и всегда.',
  'Full status (hold)': 'Полный статус (удерживать)', 'FULL STATUS': 'ПОЛНЫЙ СТАТУС', OBJECTIVES: 'ЦЕЛИ', RUN: 'ЗАБЕГ', STATUS: 'СТАТУС',
  'hold {key} for the full status': 'удерживайте {key} для полного статуса', 'Nothing else to report.': 'Больше нечего сообщить.',
  'Day {n}': 'День {n}', 'Days left': 'Дней осталось', 'dead': 'мёртв', Clock: 'Часы',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

/** <select> for Settings > HUD; `s` = the settings object, `apply` = save + re-apply. */
export function hudDensitySelect(s, apply) {
  const sel = document.createElement('select');
  sel.dataset.nav = 'set:hudDensity';
  const names = { minimal: 'Minimal (fewest)', standard: 'Standard (recommended)', full: 'Full (everything)' };
  for (const v of HUD_DENSITIES) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t(names[v]); o.selected = hudDensityOf(s) === v;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { s.hudDensity = sel.value; apply(); });
  return sel;
}
