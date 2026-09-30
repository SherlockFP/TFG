// highlights strings (docs/wave8/highlights.md): the Algorithm's clip captions (3 per moment kind, dark humour, docs/wave8/studio_style.md) + UI. [English key, Turkish, Russian].
// {name} = the subject, {v} = a number (streak seconds). Side effect: addTranslations.
import { addTranslations } from '../core/i18n.js';

/** moment kind (feedcams2_core HL) -> caption templates (English keys) */
export const CAPS = {
  down: ['{name} hit the floor at peak viewership. Timing is a talent.', 'Clip title: {name} lies down. Chat is calling it art.', 'Nobody asked {name} to fall over live. Nobody stopped it either.'],
  revive: ['{name} picks a friend off the floor, on camera. Wholesome performs well.', 'Rescue arc detected. I have already scheduled the sequel.', 'Kindness, live. Engagement up 11 percent, mostly out of confusion.'],
  drone: ['{name} shot my drone out of the sky. It was insured. You are not.', 'One drone down, two hundred viewers up. I call that a trade.', 'The searchlight went out. So did my patience.'],
  fans: ['So many fans of {name} that I had to send a few over.', 'Popularity has a body count. Enjoy it.', 'The audience loves {name}. Some of them have teeth.'],
  smash: ['{name} smashed a camera. Bold. The next one has better insurance.', 'That lens cost more than your first month. Good aim.', 'Signal lost. Ego intact.'],
  cut: ['{name} cut the cable. Quiet, tidy, off-brand.', 'Somebody is trying to end my broadcast. Cute.', 'One snip, zero viewers. This clip did numbers anyway.'],
  show: ['{name} carried the goods through the spotlight. The sponsors clapped.', 'Scrap on the feed, credit on the tab. Hustle culture.', 'Product placement, but with a person attached.'],
  juke: ['{name} slid out of the camera lock at the last second. Chat wants it again.', 'Close call, clean exit. I was almost proud.', 'The meter said caught. {name} said no.'],
  streak: ['{name} stayed live for {v} seconds straight. Some people are born for this.', 'No cuts, no cover, no shame. Retention through the roof.', 'Somebody forgot how hiding works. Wonderful.'],
  live: ['{name} wandered into frame. The bar was low. Cleared.', 'Live, unplanned, unremarkable. Still content.', 'Hello, {name}. You are on air. You were always on air.'],
  crack: ['{name} broke something valuable on camera. The sponsors saw it.', 'A clean drop, a loud crack. Chat is already making the sound.', 'That one had a price tag. Had.'],
  catch: ['A throw, a catch, a stunned silence. First time that has ever worked.', 'Somebody caught it. Nobody is more surprised than the thrower.', 'Teamwork detected. I will keep an eye on that.'],
};
/** opening / closing chat lines shared by every clip */
export const INTRO = ['Clip ready. Edited by me, approved by me.', 'Cutting your worst moment into your best one.'];
export const OUTRO = ['Clip published. Reach: everyone. Consent: pending.', 'Shared with 40,000 accounts. Most of them were bots. They liked it.'];

const ROWS = [
  ['WATCH HIGHLIGHT', 'ÖNE ÇIKAN ANI İZLE', 'СМОТРЕТЬ ЛУЧШИЙ МОМЕНТ'],
  ['Watch highlight [L]', 'Öne çıkan anı izle [L]', 'Смотреть момент [L]'],
  ['HIGHLIGHT CLIP', 'ÖNE ÇIKAN KLİP', 'КЛИП ДНЯ'],
  ['REC', 'KAYIT', 'ЗАПИСЬ'],
  ['LIVE', 'CANLI', 'ЭФИР'],
  ['VIEWERS', 'İZLEYİCİ', 'ЗРИТЕЛИ'],
  ['ALGORITHM', 'ALGORİTMA', 'АЛГОРИТМ'],
  ['Skip [Space]', 'Geç [Boşluk]', 'Пропуск [Пробел]'],
  ['SKIP', 'GEÇ', 'ПРОПУСК'],
  ['Clip {n} of {m}', 'Klip {n} / {m}', 'Клип {n} из {m}'],
  ['Highlight clip', 'Öne çıkan klip', 'Клип дня'],
  ['Recorded on air, edited by the Algorithm.', 'Yayında kaydedildi, Algoritma tarafından kurgulandı.', 'Записано в эфире, смонтировано Алгоритмом.'],
];
const CAP_ROWS = [
  // down
  ['{name} hit the floor at peak viewership. Timing is a talent.', '{name} izlenmenin zirvesinde yere yığıldı. Zamanlama bir yetenektir.', '{name} упал(а) на пике просмотров. Тайминг это талант.'],
  ['Clip title: {name} lies down. Chat is calling it art.', 'Klip başlığı: {name} uzanıyor. Sohbet buna sanat diyor.', 'Название клипа: {name} ложится. Чат называет это искусством.'],
  ['Nobody asked {name} to fall over live. Nobody stopped it either.', '{name} canlı yayında düşsün diye kimse istemedi. Kimse engellemedi de.', 'Никто не просил {name} падать в эфире. Никто и не мешал.'],
  // revive
  ['{name} picks a friend off the floor, on camera. Wholesome performs well.', '{name} bir arkadaşını yerden kaldırıyor, kamera önünde. Tatlı içerik iyi tutuyor.', '{name} поднимает друга с пола, на камеру. Трогательное хорошо заходит.'],
  ['Rescue arc detected. I have already scheduled the sequel.', 'Kurtarma hikayesi tespit edildi. Devam bölümünü şimdiden planladım.', 'Обнаружена сюжетная линия спасения. Сиквел уже в планах.'],
  ['Kindness, live. Engagement up 11 percent, mostly out of confusion.', 'Canlı yayında iyilik. Etkileşim yüzde 11 arttı, çoğu şaşkınlıktan.', 'Доброта в прямом эфире. Вовлечённость плюс 11 процентов, в основном от недоумения.'],
  // drone
  ['{name} shot my drone out of the sky. It was insured. You are not.', '{name} dronumu gökyüzünden indirdi. Dron sigortalıydı. Sen değilsin.', '{name} сбил(а) мой дрон. Он был застрахован. Ты нет.'],
  ['One drone down, two hundred viewers up. I call that a trade.', 'Bir dron gitti, iki yüz izleyici geldi. Ben buna takas derim.', 'Один дрон вниз, двести зрителей вверх. Считаю это обменом.'],
  ['The searchlight went out. So did my patience.', 'Projektör söndü. Sabrım da.', 'Прожектор погас. Как и моё терпение.'],
  // fans
  ['So many fans of {name} that I had to send a few over.', '{name} o kadar çok hayran topladı ki birkaçını ben gönderdim.', 'У {name} столько фанатов, что пришлось прислать нескольких лично.'],
  ['Popularity has a body count. Enjoy it.', 'Popülerliğin bir ölü sayısı var. Tadını çıkar.', 'У популярности есть счёт потерь. Наслаждайся.'],
  ['The audience loves {name}. Some of them have teeth.', 'İzleyici {name} adlı kişiyi seviyor. Bazılarının dişleri var.', 'Публика обожает {name}. У некоторых есть зубы.'],
  // smash
  ['{name} smashed a camera. Bold. The next one has better insurance.', '{name} bir kamerayı parçaladı. Cesur. Sıradakinin sigortası daha iyi.', '{name} разбил(а) камеру. Смело. У следующей страховка лучше.'],
  ['That lens cost more than your first month. Good aim.', 'O lens ilk ayının maaşından pahalıydı. Nişan iyiydi.', 'Эта линза стоила дороже твоего первого месяца. Меткий удар.'],
  ['Signal lost. Ego intact.', 'Sinyal gitti. Ego yerinde.', 'Сигнал потерян. Эго цело.'],
  // cut
  ['{name} cut the cable. Quiet, tidy, off-brand.', '{name} kabloyu kesti. Sessiz, temiz, markaya aykırı.', '{name} перерезал(а) кабель. Тихо, аккуратно, не по бренду.'],
  ['Somebody is trying to end my broadcast. Cute.', 'Biri yayınımı bitirmeye çalışıyor. Sevimli.', 'Кто-то пытается закончить мою трансляцию. Мило.'],
  ['One snip, zero viewers. This clip did numbers anyway.', 'Tek kesik, sıfır izleyici. Bu klip yine de rakam yaptı.', 'Один щелчок, ноль зрителей. Клип всё равно набрал.'],
  // show
  ['{name} carried the goods through the spotlight. The sponsors clapped.', '{name} malı ışığın altından geçirdi. Sponsorlar alkışladı.', '{name} пронёс(ла) товар через прожектор. Спонсоры аплодировали.'],
  ['Scrap on the feed, credit on the tab. Hustle culture.', 'Yayında hurda, hesapta kredi. Hustle kültürü.', 'Хлам в эфире, кредиты в счёт. Культура хастла.'],
  ['Product placement, but with a person attached.', 'Ürün yerleştirme, ama yanında bir insan var.', 'Продакт-плейсмент, но с человеком в комплекте.'],
  // juke
  ['{name} slid out of the camera lock at the last second. Chat wants it again.', '{name} kamera kilidinden son saniyede sıyrıldı. Sohbet tekrar istiyor.', '{name} выскользнул(а) из захвата камеры в последнюю секунду. Чат хочет повтор.'],
  ['Close call, clean exit. I was almost proud.', 'Kıl payı, temiz çıkış. Neredeyse gurur duydum.', 'На волоске, чистый выход. Я почти гордился.'],
  ['The meter said caught. {name} said no.', 'Sayaç yakalandı dedi. {name} hayır dedi.', 'Шкала сказала: поймали. {name} сказал(а): нет.'],
  // streak
  ['{name} stayed live for {v} seconds straight. Some people are born for this.', '{name} tam {v} saniye kesintisiz yayında kaldı. Bazıları bunun için doğar.', '{name} был(а) в эфире {v} секунд подряд. Некоторые рождены для этого.'],
  ['No cuts, no cover, no shame. Retention through the roof.', 'Kurgu yok, siper yok, utanç yok. Elde tutma tavan.', 'Ни склеек, ни укрытий, ни стыда. Удержание в потолок.'],
  ['Somebody forgot how hiding works. Wonderful.', 'Biri saklanmanın nasıl olduğunu unutmuş. Harika.', 'Кто-то забыл, как работает прятки. Прекрасно.'],
  // live
  ['{name} wandered into frame. The bar was low. Cleared.', '{name} kadraja daldı. Çıta düşüktü. Geçildi.', '{name} забрёл(а) в кадр. Планка была низкой. Взята.'],
  ['Live, unplanned, unremarkable. Still content.', 'Canlı, plansız, sıradan. Yine de içerik.', 'В эфире, без плана, ничего особенного. Всё равно контент.'],
  ['Hello, {name}. You are on air. You were always on air.', 'Merhaba {name}. Yayındasın. Hep yayındaydın.', 'Привет, {name}. Ты в эфире. Ты всегда был(а) в эфире.'],
  // crack
  ['{name} broke something valuable on camera. The sponsors saw it.', '{name} kamera önünde değerli bir şey kırdı. Sponsorlar gördü.', '{name} разбил(а) что-то ценное на камеру. Спонсоры видели.'],
  ['A clean drop, a loud crack. Chat is already making the sound.', 'Temiz bir düşüş, gürültülü bir çatırtı. Sohbet sesi şimdiden taklit ediyor.', 'Чистое падение, громкий хруст. Чат уже повторяет звук.'],
  ['That one had a price tag. Had.', 'Onun bir fiyat etiketi vardı. Vardı.', 'У этой вещи был ценник. Был.'],
  // catch
  ['A throw, a catch, a stunned silence. First time that has ever worked.', 'Bir atış, bir yakalama, şaşkın bir sessizlik. Bu ilk kez işe yaradı.', 'Бросок, поимка, ошарашенная тишина. Такое сработало впервые.'],
  ['Somebody caught it. Nobody is more surprised than the thrower.', 'Biri yakaladı. Atan kişiden daha şaşıran yok.', 'Кто-то поймал. Больше всех удивлён тот, кто бросил.'],
  ['Teamwork detected. I will keep an eye on that.', 'Takım çalışması tespit edildi. Bunu gözümde tutacağım.', 'Обнаружена командная работа. Буду присматривать.'],
  // intro / outro
  ['Clip ready. Edited by me, approved by me.', 'Klip hazır. Kurgu bende, onay bende.', 'Клип готов. Монтаж мой, одобрение тоже.'],
  ['Cutting your worst moment into your best one.', 'En kötü anını en iyi anına çeviriyorum.', 'Превращаю твой худший момент в лучший.'],
  ['Clip published. Reach: everyone. Consent: pending.', 'Klip yayınlandı. Erişim: herkes. Onay: beklemede.', 'Клип опубликован. Охват: все. Согласие: ожидается.'],
  ['Shared with 40,000 accounts. Most of them were bots. They liked it.', '40.000 hesapla paylaşıldı. Çoğu bottu. Beğendiler.', 'Отправлено 40 000 аккаунтам. Большинство боты. Им понравилось.'],
];
const TR = {}, RU = {};
for (const [en, tr, ru] of [...ROWS, ...CAP_ROWS]) { TR[en] = tr; RU[en] = ru; }
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
export const HLC_KEYS = [...ROWS, ...CAP_ROWS].map((r) => r[0]);
