import { addTranslations, tf } from '../core/i18n.js';

const HANDLING = "Fragile · beam [LMB] · cart through entrance · release for friend's brake [{key}]";
addTranslations({
  [HANDLING]: 'Kırılgan · ışın [LMB] · girişten arabayla geç · arkadaşın frenlesin diye bırak [{key}]',
}, 'tr');
addTranslations({
  [HANDLING]: 'Хрупкое · луч [LMB] · через вход на тележке · отпусти для торможения товарищем [{key}]',
}, 'ru');

export function earlyHaul34Handling(game) {
  const bound = game.input?.key?.('interact');
  const code = bound && bound !== 'interact' ? bound : game.settings?.keys?.interact || 'KeyE';
  const key = String(code).replace(/^Key/, '').replace(/^Digit/, '');
  return tf(HANDLING, { key });
}
