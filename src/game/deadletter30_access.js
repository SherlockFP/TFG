import { addTranslations } from '../core/i18n.js';

export const DEADLETTER30 = {
  title: 'Dead Letter Run',
  start: 'Start Dead Letter Run',
  description: 'Card combat: waves, bosses and three upgrade choices at every level.',
  fresh: 'Choose a ship and board. The card expedition starts automatically; saved campaigns keep their own slots.',
  dock: 'Choose a ship and board before starting.',
  phase: 'Take off first. Start from orbit or the Company.',
  host: 'Only the host can start Dead Letter Run.',
  crew: 'Recover every downed or dead crewmate before starting.',
  loading: 'Finish loading before starting.',
  cargo: 'Too many items to preserve (maximum 128). Sell cargo or start a fresh Dead Letter session.',
  active: 'Dead Letter Run is already active.',
  unavailable: 'This session is no longer available.',
  retired: 'Dead Letter Run has been retired. Continue the normal expedition.',
  return: 'Return to campaign',
};

const translations = {
  [DEADLETTER30.retired]: ['Dead Letter Run kapatıldı. Normal sefere devam et.', 'Dead Letter Run закрыт. Продолжайте обычную экспедицию.'],
  [DEADLETTER30.return]: ['Ana oyuna dön', 'Вернуться в кампанию'],
  [DEADLETTER30.start]: ['Dead Letter Run başlat', 'Начать Dead Letter Run'],
  [DEADLETTER30.description]: ['Kart savaşı: dalgalar, bosslar ve her seviyede üç geliştirme seçeneği.', 'Карточный бой: волны, боссы и три улучшения на каждом уровне.'],
  [DEADLETTER30.fresh]: ['Gemi seçip bin. Kart seferi otomatik başlar; kayıtlı oyunların kendi yuvalarında kalır.', 'Выбери корабль и поднимись на борт. Карточный поход начнётся автоматически; сохранённые кампании останутся в своих слотах.'],
  [DEADLETTER30.dock]: ['Başlatmadan önce gemi seçip bin.', 'Перед началом выбери корабль и поднимись на борт.'],
  [DEADLETTER30.phase]: ['Önce kalkış yap. Yörüngeden veya Şirketten başlat.', 'Сначала взлети. Начинай с орбиты или у Компании.'],
  [DEADLETTER30.host]: ['Dead Letter Run seferini yalnızca host başlatabilir.', 'Dead Letter Run может начать только хост.'],
  [DEADLETTER30.crew]: ['Başlatmadan önce düşen veya ölen tüm ekip arkadaşlarını kurtar.', 'Перед началом восстанови всех раненых или погибших членов экипажа.'],
  [DEADLETTER30.loading]: ['Başlatmadan önce yüklemenin bitmesini bekle.', 'Дождись окончания загрузки перед началом.'],
  [DEADLETTER30.cargo]: ['Korunacak eşya sayısı fazla (en fazla 128). Yük sat veya yeni bir Dead Letter oturumu aç.', 'Слишком много предметов для сохранения (максимум 128). Продай груз или начни новый сеанс Dead Letter.'],
  [DEADLETTER30.active]: ['Dead Letter Run zaten açık.', 'Dead Letter Run уже идёт.'],
  [DEADLETTER30.unavailable]: ['Bu oturum artık açık değil.', 'Этот сеанс больше недоступен.'],
};
for (const [index, lang] of [[0, 'tr'], [1, 'ru']]) {
  addTranslations(Object.fromEntries(Object.entries(translations).map(([key, values]) => [key, values[index]])), lang);
}

// The same admission is checked when the menu is drawn and again by the native
// host start. No cached DOM state can authorize a departed/loading context.
export function deadletter30Admission(game) {
  // Keep the legacy loader and checkpoint exit; every new start is retired.
  return { enabled: false, reason: DEADLETTER30.retired };
}
