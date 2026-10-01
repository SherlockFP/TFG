import { addTranslations } from '../core/i18n.js';
export const R19 = Object.freeze({
  ready: 'Dead-Air Replay [E]',
  choice: '8s warning / 12s broadcast here / one crew use. May attract listeners; cutting power cancels.',
  warning: 'Replay warming up: move away before the broadcast.',
  live: 'Dead-Air Replay broadcasting here. Nearby listeners may investigate.',
  spent: 'Dead-Air Replay used this landing.',
  off: 'Replay needs the broadcast network. Restore the Ward feed first.',
});
addTranslations({
  [R19.ready]: 'Ölü Frekans Kaydı [E]',
  [R19.choice]: '8 sn uyarı / burada 12 sn yayın / ekip için tek kullanım. Dinleyicileri çekebilir; elektriği kesmek iptal eder.',
  [R19.warning]: 'Kayıt hazırlanıyor: yayın başlamadan uzaklaş.',
  [R19.live]: 'Ölü Frekans Kaydı burada yayında. Yakındaki dinleyiciler araştırabilir.',
  [R19.spent]: 'Ölü Frekans Kaydı bu inişte kullanıldı.',
  [R19.off]: 'Kayıt yayın ağı gerektirir. Önce mahallenin yayınını aç.',
}, 'tr');
addTranslations({
  [R19.ready]: 'Повтор мёртвого эфира [E]',
  [R19.choice]: '8 с предупреждения / 12 с эфира здесь / один раз на экипаж. Может привлечь слушателей; отключение питания отменяет эфир.',
  [R19.warning]: 'Запись запускается: отойдите до начала эфира.',
  [R19.live]: 'Здесь идёт повтор мёртвого эфира. Слушатели поблизости могут прийти.',
  [R19.spent]: 'Запись уже использована в этой высадке.',
  [R19.off]: 'Для записи нужна сеть вещания. Сначала восстановите эфир квартала.',
}, 'ru');
