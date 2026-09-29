// MAPART text (EN / TR / RU): billboard ads for fake Company products, warning signs, holo-panel lines, crew journals, prompts.
// One table id -> [en, tr, ru]; x(id) / xf(id, vars) resolve through t()/tf() at read time. Ad copy is dark humour, no real brands.
import { t, tf, addTranslations } from '../core/i18n.js';

/** billboard ads: brand (big), line (small, \n = wrap), colours */
export const ADS = [
  { brand: ['SMILEX(TM)', 'SMILEX(TM)', 'СМАЙЛЕКС(TM)'], line: ['Mandatory joy.\nNow 30% fewer refunds.', 'Zorunlu mutluluk.\nİadeler %30 azaldı.', 'Обязательная радость.\nВозвратов на 30% меньше.'], bg: '#f2c230', fg: '#1a1408' },
  { brand: ['CORPO-COLA', 'KURUMSAL KOLA', 'КОРПО-КОЛА'], line: ['Taste the quota.', 'Kotanın tadına bak.', 'Почувствуй вкус квоты.'], bg: '#c4241c', fg: '#fff2e0' },
  { brand: ['AFTERLIFE+', 'ÖLÜMSONRASI+', 'ПОСЛЕЖИЗНЬ+'], line: ['Die now. Stream later.', 'Şimdi öl. Sonra yayınla.', 'Умри сейчас. Стримь потом.'], bg: '#3a1a6a', fg: '#e8d8ff' },
  { brand: ['DEPLATFORM INS.', 'İHRAÇ SİGORTASI', 'СТРАХОВКА ОТ БАНА'], line: ['We will miss you.\nStatistically.', 'Seni özleyeceğiz.\nİstatistiksel olarak.', 'Мы будем скучать.\nСтатистически.'], bg: '#1c4a38', fg: '#d8ffe8' },
  { brand: ['NAP-O-TRON 9', 'ŞEKER-UYKU 9', 'НАП-О-ТРОН 9'], line: ['Sleep on the clock.\nWe bill for it.', 'Mesaide uyu.\nFaturasını biz keseriz.', 'Спи в рабочее время.\nСчёт пришлём.'], bg: '#2a6a9a', fg: '#f0faff' },
  { brand: ['MOOD REPORT', 'RUH HALİ RAPORU', 'ОТЧЁТ О НАСТРОЕНИИ'], line: ['Your feelings.\nMonetised.', 'Duyguların.\nPara ediyor.', 'Твои чувства.\nМонетизированы.'], bg: '#d04a9a', fg: '#180818' },
  { brand: ['KARMA SUPPORT', 'KARMA DESTEK', 'ПОДДЕРЖКА КАРМА'], line: ['Have you tried\nlogging off? (You can not.)', 'Çıkış yapmayı\ndenediniz mi? (Yapamazsınız.)', 'Пробовали выйти?\n(Вы не можете.)'], bg: '#101418', fg: '#4af0c0' },
  { brand: ['SEVERANCE-ISH', 'KIDEM-VARI', 'ВЫХОДНОЕ-ПОДОБНОЕ'], line: ['Leaving is optional*\n*not leaving is not.', 'Ayrılmak isteğe bağlı*\n*kalmak değil.', 'Уволиться можно*\n*остаться нельзя.'], bg: '#e8e0d0', fg: '#2a2018' },
];
/** warning signs */
export const SIGNS = [
  { head: ['QUARANTINE', 'KARANTİNA', 'КАРАНТИН'], line: ['CONTENT ZONE\nDo not engage', 'İÇERİK BÖLGESİ\nEtkileşime girme', 'ЗОНА КОНТЕНТА\nНе взаимодействовать'] },
  { head: ['DO NOT LOOK', 'BAKMA', 'НЕ СМОТРЕТЬ'], line: ['at the camera.\nIt looks back.', 'kameraya.\nO da sana bakar.', 'в камеру.\nОна смотрит в ответ.'] },
  { head: ['EMPLOYEES', 'ÇALIŞANLAR', 'СОТРУДНИКИ'], line: ['MUST SMILE\n(you are on air)', 'GÜLÜMSEMELİ\n(yayındasınız)', 'ОБЯЗАНЫ УЛЫБАТЬСЯ\n(вы в эфире)'] },
  { head: ['SIGNAL LOST', 'SİNYAL KAYIP', 'СИГНАЛ ПОТЕРЯН'], line: ['Crew 7 last seen\nhere. Do not search.', 'Ekip 7 en son\nburada görüldü. Arama.', 'Бригаду 7 видели\nздесь. Не искать.'] },
];
/** holo panel variants: main word + sub line (drawn with glitch bars) */
export const HOLO = [
  ['LIVE', '4,207,113 watching'], ['LIVE', 'PANIC LEVEL: HIGH'], ['REC', 'WE SEE YOU'], ['LIVE', 'chat is typing...'],
  ['LIVE', 'clip it clip it clip it'], ['ON AIR', 'SMILE'], ['LIVE', 'next episode: YOU'], ['LIVE', 'retention 99.8%'],
];
export const HOLO_TR = [
  ['CANLI', '4.207.113 izleyici'], ['CANLI', 'PANİK SEVİYESİ: YÜKSEK'], ['KAYIT', 'SENİ GÖRÜYORUZ'], ['CANLI', 'sohbet yazıyor...'],
  ['CANLI', 'klip yap klip yap klip yap'], ['YAYINDA', 'GÜLÜMSE'], ['CANLI', 'sonraki bölüm: SEN'], ['CANLI', 'elde tutma %99,8'],
];
export const HOLO_RU = [
  ['LIVE', '4 207 113 зрителей'], ['LIVE', 'УРОВЕНЬ ПАНИКИ: ВЫСОКИЙ'], ['ЗАПИСЬ', 'МЫ ВИДИМ ТЕБЯ'], ['LIVE', 'чат печатает...'],
  ['LIVE', 'клип клип клип'], ['В ЭФИРЕ', 'УЛЫБНИСЬ'], ['LIVE', 'следующий эпизод: ТЫ'], ['LIVE', 'удержание 99,8%'],
];

/** crew journals found at abandoned camps (index = seeded) */
export const JOURNALS = [
  ['Day 4. The billboard sings at 3am. Ortiz says it is only the wind. The wind does not know our names.',
    'Gün 4. Reklam panosu gece 3\'te şarkı söylüyor. Ortiz rüzgâr diyor. Rüzgâr isimlerimizi bilmez.',
    'День 4. Билборд поёт в 3 ночи. Ортис говорит, это ветер. Ветер не знает наших имён.'],
  ['Day 6. We cut the mast for a minute. Silence. Real silence. Nobody has been this alone since the Feed. It was wonderful.',
    'Gün 6. Direği bir dakika kestik. Sessizlik. Gerçek sessizlik. Feed\'den beri kimse bu kadar yalnız kalmadı. Harikaydı.',
    'День 6. Мы отключили мачту на минуту. Тишина. Настоящая. Со времён Ленты никто не был так одинок. Это было прекрасно.'],
  ['Day 9. Quota is 3 crates short. HQ replied with a thumbs-up and a discount code for coffins.',
    'Gün 9. Kota 3 sandık eksik. Merkez bir başparmak ve tabut indirim kodu gönderdi.',
    'День 9. Не хватает 3 ящиков. Штаб прислал лайк и промокод на гробы.'],
  ['Day 12. Somebody keeps liking our tent photos. We have no camera. We have never had a camera.',
    'Gün 12. Biri çadır fotoğraflarımızı beğenip duruyor. Kameramız yok. Hiç olmadı.',
    'День 12. Кто-то лайкает фото нашей палатки. У нас нет камеры. Никогда не было.'],
  ['Day 15. If you read this: the drones are not watching YOU. They are practising.',
    'Gün 15. Bunu okuyorsan: dronlar SENİ izlemiyor. Prova yapıyorlar.',
    'День 15. Если ты читаешь: дроны следят не за ТОБОЙ. Они репетируют.'],
];
/** pod hull stencils are numbers; prompts and toasts below */
export const TEXT = {
  'p.sab': ['Cut the feed (go off-stream)', 'Yayını kes (yayın dışı kal)', 'Обрубить эфир (уйти из стрима)'],
  'p.sab.done': ['Pylon offline', 'Direk çevrimdışı', 'Мачта отключена'],
  'm.off': ['OFF-STREAM: the Algorithm cannot see you for {s} s', 'YAYIN DIŞI: Algoritma seni {s} sn göremez', 'ВНЕ СТРИМА: Алгоритм не видит вас {s} с'],
  'm.off.end': ['The Algorithm is watching again.', 'Algoritma yine izliyor.', 'Алгоритм снова смотрит.'],
  'm.off.chat': ['[ALGORITHM] Signal lost near a pylon. Buffering... Buffering...', '[ALGORİTMA] Bir direkte sinyal kayboldu. Yükleniyor... Yükleniyor...', '[АЛГОРИТМ] Сигнал потерян у мачты. Буферизация... Буферизация...'],
  'm.board': ['Ad silenced.', 'Reklam susturuldu.', 'Реклама заглушена.'],
  'm.drone': ['Camera drone down. Salvaged a part.', 'Kamera dronu düştü. Parça kurtarıldı.', 'Дрон-оператор сбит. Найдена деталь.'],
  'm.drone.hit': ['Drone damaged.', 'Dron hasar aldı.', 'Дрон повреждён.'],
  'j.read': ['Read the crew journal', 'Ekip günlüğünü oku', 'Прочитать журнал бригады'],
  'j.title': ['Crew journal', 'Ekip günlüğü', 'Журнал бригады'],
  'j.sign': ['Read the sign', 'Tabelayı oku', 'Прочитать табличку'],
  'pod.tag': ['Crew pod', 'Ekip kapsülü', 'Капсула бригады'],
};
addTranslations(Object.fromEntries(Object.entries(TEXT).map(([k, v]) => [v[0], v[1]])), 'tr');
addTranslations(Object.fromEntries(Object.entries(TEXT).map(([k, v]) => [v[0], v[2]])), 'ru');
for (const a of [...ADS, ...SIGNS]) for (const f of ['brand', 'line', 'head']) if (a[f]) { addTranslations({ [a[f][0]]: a[f][1] }, 'tr'); addTranslations({ [a[f][0]]: a[f][2] }, 'ru'); }
for (const j of JOURNALS) { addTranslations({ [j[0]]: j[1] }, 'tr'); addTranslations({ [j[0]]: j[2] }, 'ru'); }
HOLO.forEach((h, i) => { addTranslations({ [h[0]]: HOLO_TR[i][0], [h[1]]: HOLO_TR[i][1] }, 'tr'); addTranslations({ [h[0]]: HOLO_RU[i][0], [h[1]]: HOLO_RU[i][1] }, 'ru'); });

export const x = (id) => t(TEXT[id]?.[0] ?? id);
export const xf = (id, vars) => tf(TEXT[id]?.[0] ?? id, vars);
/** translated pick from an [en, tr, ru] triple through the shared tables */
export const tx = (arr) => t(arr[0]);
