// MAPS2 texts (pure data): story-room notes + English -> Turkish / Russian strings. Imported by src/game/maps2.js and the node test.
import { addTranslations } from '../core/i18n.js';

export const NOTES = {
  party: { title: 'BIRTHDAY CARD', sub: 'signed by everyone in Accounts', lines: ['HAPPY 41st, DEREK!', 'We all stopped at 03:14 for cake.', 'Nobody has managed to blow out the candles since.'] },
  laststand: { title: 'LAST STAND LOG', sub: 'Moderation Bureau, night shift', lines: ['DAY 9. The report queue is at 4,000,000.', 'It learned our door codes.', 'If you read this: do not answer the intercom. It uses Halvorsen\'s voice.'] },
  nursery: { title: 'LULLABY PLAYLIST', sub: 'baby monitor feed, looping', lines: ['The Feed served the same lullaby for 9 days.', 'The little account never logged off.', 'It is still listening.'] },
  shrine: { title: 'FINAL STREAM', sub: 'xXSn1p3rXx // 41 days live', lines: ['Viewers: 3. Two are bots. One is The Algorithm.', 'Thanks for the sub. I cannot find the exit button.'] },
  flooded: { title: 'FACILITIES MEMO #404', sub: 'RE: the break room', lines: ['The water is not a leak.', 'Please stop bailing it out. It gets angry.', 'Mop bucket policy is unchanged.'] },
};
const TR = {
  'BIRTHDAY CARD': 'DOĞUM GÜNÜ KARTI', 'signed by everyone in Accounts': 'Muhasebe\'deki herkes imzalamış', 'HAPPY 41st, DEREK!': '41. YAŞIN KUTLU OLSUN, DEREK!',
  'We all stopped at 03:14 for cake.': 'Hepimiz 03:14\'te pasta için durduk.', 'Nobody has managed to blow out the candles since.': 'O günden beri kimse mumları üfleyemedi.',
  'LAST STAND LOG': 'SON DİRENİŞ KAYDI', 'Moderation Bureau, night shift': 'Moderasyon Bürosu, gece vardiyası', 'DAY 9. The report queue is at 4,000,000.': '9. GÜN. Rapor kuyruğu 4.000.000\'da.',
  'It learned our door codes.': 'Kapı kodlarımızı öğrendi.', 'If you read this: do not answer the intercom. It uses Halvorsen\'s voice.': 'Bunu okuyorsan: interkomu açma. Halvorsen\'in sesini kullanıyor.',
  'LULLABY PLAYLIST': 'NİNNİ LİSTESİ', 'baby monitor feed, looping': 'bebek telsizi yayını, döngüde', 'The Feed served the same lullaby for 9 days.': 'Akış 9 gün boyunca aynı ninniyi verdi.',
  'The little account never logged off.': 'Küçük hesap hiç çıkış yapmadı.', 'It is still listening.': 'Hâlâ dinliyor.',
  'FINAL STREAM': 'SON YAYIN', 'xXSn1p3rXx // 41 days live': 'xXSn1p3rXx // 41 gündür canlı', 'Viewers: 3. Two are bots. One is The Algorithm.': 'İzleyici: 3. İkisi bot. Biri Algoritma.',
  'Thanks for the sub. I cannot find the exit button.': 'Abonelik için sağ ol. Çıkış düğmesini bulamıyorum.',
  'FACILITIES MEMO #404': 'TESİS NOTU #404', 'RE: the break room': 'İLGİ: dinlenme odası', 'The water is not a leak.': 'Su bir sızıntı değil.',
  'Please stop bailing it out. It gets angry.': 'Lütfen suyu boşaltmayı bırakın. Sinirleniyor.', 'Mop bucket policy is unchanged.': 'Paspas kovası kuralı değişmedi.',
  'Read the note [E]': 'Notu oku [E]', 'Switch the lights off [E]': 'Işıkları kapat [E]', 'Switch the lights on [E]': 'Işıkları aç [E]', 'Wind the music box [E]': 'Müzik kutusunu kur [E]',
  'HAPPY': 'MUTLU', 'BIRTHDAY': 'YILLAR', 'DAY 9': '9. GÜN', 'THANKS FOR': 'TEŞEKKÜRLER', '10 YEARS': '10 YIL', 'ROOM 3.5': 'ODA 3.5', 'DO NOT MEASURE': 'ÖLÇME',
};
const RU = {
  'BIRTHDAY CARD': 'ОТКРЫТКА', 'signed by everyone in Accounts': 'подписана всей бухгалтерией', 'HAPPY 41st, DEREK!': 'С 41-М, ДЕРЕК!',
  'We all stopped at 03:14 for cake.': 'В 03:14 мы все остановились за тортом.', 'Nobody has managed to blow out the candles since.': 'С тех пор никто не смог задуть свечи.',
  'LAST STAND LOG': 'ЖУРНАЛ ОБОРОНЫ', 'Moderation Bureau, night shift': 'Бюро модерации, ночная смена', 'DAY 9. The report queue is at 4,000,000.': 'ДЕНЬ 9. Очередь жалоб: 4 000 000.',
  'It learned our door codes.': 'Оно узнало коды наших дверей.', 'If you read this: do not answer the intercom. It uses Halvorsen\'s voice.': 'Если читаешь: не отвечай на домофон. Он говорит голосом Хальворсена.',
  'LULLABY PLAYLIST': 'КОЛЫБЕЛЬНАЯ', 'baby monitor feed, looping': 'радионяня, по кругу', 'The Feed served the same lullaby for 9 days.': 'Лента крутила одну колыбельную 9 дней.',
  'The little account never logged off.': 'Маленький аккаунт так и не вышел.', 'It is still listening.': 'Он всё ещё слушает.',
  'FINAL STREAM': 'ПОСЛЕДНИЙ СТРИМ', 'xXSn1p3rXx // 41 days live': 'xXSn1p3rXx // 41 день в эфире', 'Viewers: 3. Two are bots. One is The Algorithm.': 'Зрителей: 3. Двое боты. Один Алгоритм.',
  'Thanks for the sub. I cannot find the exit button.': 'Спасибо за подписку. Я не могу найти кнопку выхода.',
  'FACILITIES MEMO #404': 'ХОЗ. ЗАПИСКА #404', 'RE: the break room': 'ПО ПОВОДУ: комнаты отдыха', 'The water is not a leak.': 'Вода — это не протечка.',
  'Please stop bailing it out. It gets angry.': 'Перестаньте её вычерпывать. Она злится.', 'Mop bucket policy is unchanged.': 'Правило про ведро со шваброй не менялось.',
  'Read the note [E]': 'Прочитать записку [E]', 'Switch the lights off [E]': 'Выключить свет [E]', 'Switch the lights on [E]': 'Включить свет [E]', 'Wind the music box [E]': 'Завести шкатулку [E]',
  'HAPPY': 'С', 'BIRTHDAY': 'ПРАЗДНИКОМ', 'DAY 9': 'ДЕНЬ 9', 'THANKS FOR': 'СПАСИБО ЗА', '10 YEARS': '10 ЛЕТ', 'ROOM 3.5': 'КОМНАТА 3.5', 'DO NOT MEASURE': 'НЕ ИЗМЕРЯТЬ',
};
addTranslations(TR);
try { addTranslations(RU, 'ru'); } catch { /* ru not supported: ignore */ }

