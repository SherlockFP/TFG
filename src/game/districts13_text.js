import { addTranslations } from '../core/i18n.js';
export const TEXT13 = [
  ['Echo Registry', 'Yankı Sicili', 'Реестр эха'],
  ['Ember Cache', 'Köz Önbelleği', 'Угольный кэш'],
  ['An archive of erased identities. Recover packets in order; the mint trail leads back to reception.', 'Silinmiş kimliklerin arşivi. Paketleri sırayla kurtar; nane yeşili iz resepsiyona döner.', 'Архив стёртых личностей. Восстанови пакеты по порядку; мятный след ведёт к приёмной.'],
  ['A ceramic memory foundry. Calibrate three cooling loops; every wing returns to the central kiln.', 'Seramik hafıza dökümhanesi. Üç soğutma hattını ayarla; her kanat merkez fırına döner.', 'Керамический литейный цех памяти. Настрой три контура охлаждения; каждое крыло ведёт к центральной печи.'],
  ['Optional: restore the district stations {n}/3', 'İsteğe bağlı: bölge istasyonlarını onar {n}/3', 'Дополнительно: восстановить станции района {n}/3'],
  ['Recovered. Follow the mint arrows to reception, then take the exit.', 'Kurtarıldı. Nane yeşili okları resepsiyona kadar izle, sonra çıkışa git.', 'Восстановлено. Следуй мятным стрелкам к приёмной, затем к выходу.'],
  ['Recover packet {n} [E]', 'Paket {n} kurtar [E]', 'Восстановить пакет {n} [E]'],
  ['Next packet: {n}. Crew can split up; each recovery is permanent.', 'Sıradaki paket: {n}. Ekip ayrılabilir; her kurtarma kalıcıdır.', 'Следующий пакет: {n}. Можно разделиться; каждый пакет сохраняется.'],
  ['Turn cooling valve {n} [E]', 'Soğutma vanası {n} çevir [E]', 'Повернуть клапан охлаждения {n} [E]'],
  ['Valve {n}: {v}/4. Each station needs four turns; work is shared.', 'Vana {n}: {v}/4. Her istasyona dört tur gerekir; ilerleme ortaktır.', 'Клапан {n}: {v}/4. Каждой станции нужно четыре оборота; прогресс общий.'],
  ['District restoration: +{n} credits', 'Bölge onarımı: +{n} kredi', 'Восстановление района: +{n} кредитов'],
  ['Wrong packet. Find packet {n}; progress is safe.', 'Yanlış paket. Paket {n} bul; ilerleme korunur.', 'Не тот пакет. Найди пакет {n}; прогресс сохранён.'],
  ['Turn valve dial {n} [E]', 'Vana {n} kadranını çevir [E]', 'Повернуть шкалу клапана {n} [E]'],
  ['Seal calibration {n} [E]', 'Kalibrasyon {n} sabitle [E]', 'Подтвердить калибровку {n} [E]'],
  ['Target {target} | dial {dial} | step {step}/4. Turn left control, seal with right control.', 'Hedef {target} | kadran {dial} | adım {step}/4. Sol kumandayı çevir, sağ kumandayla sabitle.', 'Цель {target} | шкала {dial} | шаг {step}/4. Поверни левую ручку, подтверди правой.'],
  ['Pressure mismatch. Turn the dial to the target; progress is safe.', 'Basınç uyuşmuyor. Kadranı hedefe çevir; ilerleme korunur.', 'Давление не совпадает. Поверни шкалу к цели; прогресс сохранён.'],
  ['Station restored', 'İstasyon onarıldı', 'Станция восстановлена'],
  ['Mint arrows lead back to reception. Stations are optional; scrap still pays the quota.', 'Nane yeşili oklar resepsiyona döner. İstasyonlar isteğe bağlı; hurda kotayı öder.', 'Мятные стрелки ведут к приёмной. Станции необязательны; хлам оплачивает квоту.'],
];
for (const [i, lang] of [[1, 'tr'], [2, 'ru']]) addTranslations(Object.fromEntries(TEXT13.map(row => [row[0], row[i]])), lang);
