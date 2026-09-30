// FACILITY CRISES (wave 11, module 'events11') - all player-facing text, EN / TR / RU. One table: id -> [en, tr, ru], registered with addTranslations at import;
// read with x(id) / xf(id, vars). Voice: the Algorithm is polite about disasters, the objective lines are plain.
import { t, tf, addTranslations } from '../core/i18n.js';

export const TEXT = {
  // ------------------------------------------------------------------ lockdown
  'ld.title': ['SECURITY BREACH', 'GÜVENLİK İHLALİ', 'НАРУШЕНИЕ БЕЗОПАСНОСТИ'],
  'ld.sub': ['Every door is sealed. Hack 3 security terminals.', 'Tüm kapılar mühürlendi. 3 güvenlik terminalini hackle.', 'Все двери запечатаны. Взломайте 3 терминала охраны.'],
  'ld.obj': ['SECURITY BREACH: hack the terminals ({n}/3)', 'GÜVENLİK İHLALİ: terminalleri hackle ({n}/3)', 'НАРУШЕНИЕ: взломайте терминалы ({n}/3)'],
  'ld.hint': ['Doors are sealed. Creatures run faster until the lockdown lifts.', 'Kapılar mühürlü. Kilit kalkana kadar yaratıklar daha hızlı.', 'Двери запечатаны. Пока блокировка не снята, существа быстрее.'],
  'ld.term': ['Hold [E] to hack the terminal', 'Terminali hacklemek için [E] basılı tut', 'Удерживайте [E], чтобы взломать терминал'],
  'ld.term.sub': ['Hacking is loud. Creatures listen.', 'Hackleme gürültülü. Yaratıklar dinliyor.', 'Взлом шумный. Существа слушают.'],
  'ld.term.done': ['Terminal hacked', 'Terminal hacklendi', 'Терминал взломан'],
  'ld.hacking': ['HACKING TERMINAL', 'TERMİNAL HACKLENİYOR', 'ВЗЛОМ ТЕРМИНАЛА'],
  'ld.door': ['SEALED', 'MÜHÜRLÜ', 'ЗАПЕЧАТАНО'],
  'ld.door.sub': ['Security lockdown: hack the terminals', 'Güvenlik kilidi: terminalleri hackle', 'Блокировка: взломайте терминалы'],
  'ld.freed': ['Shutters around that terminal release.', 'O terminalin çevresindeki kepenkler açıldı.', 'Заслонки вокруг терминала поднялись.'],
  'ld.rescue': ['Maintenance cycles the shutters around you.', 'Bakım sistemi etrafındaki kepenkleri açtı.', 'Техобслуживание поднимает заслонки вокруг вас.'],
  'ld.lifted': ['LOCKDOWN LIFTED', 'KİLİT KALKTI', 'БЛОКИРОВКА СНЯТА'],
  'ld.lifted.sub': ['Security has been notified that security has been restored.', 'Güvenliğe, güvenliğin sağlandığı bildirildi.', 'Охране сообщили, что охрана восстановлена.'],
  'ld.fail': ['The backup override lifts the lockdown. No bonus.', 'Yedek geçersiz kılma kilidi kaldırdı. Bonus yok.', 'Резервный сброс снял блокировку. Без бонуса.'],
  'ld.pay': ['Lockdown lifted: +▮{c}', 'Kilit kalktı: +▮{c}', 'Блокировка снята: +▮{c}'],
  'ld.algo': ['Breach detected. Please remain calm. Calm is a premium feature.', 'İhlal tespit edildi. Lütfen sakin kalın. Sakinlik premium bir özelliktir.', 'Обнаружено нарушение. Сохраняйте спокойствие. Спокойствие - премиум-функция.'],
  'ld.reason': ['Lockdown lifted', 'Kilit kaldırıldı', 'Блокировка снята'],

  // ------------------------------------------------------------------ flood
  'fl.title': ['RISING WATER', 'YÜKSELEN SU', 'ПОДЪЁМ ВОДЫ'],
  'fl.sub': ['The low sectors are flooding. Find high ground.', 'Alçak bölgeler su altında kalıyor. Yüksek bir yer bul.', 'Нижние сектора затопляет. Ищите возвышенность.'],
  'fl.obj.warn': ['FLOOD IN {s}s: get to high ground', 'SU BASKINI {s} sn: yüksek bir yere çık', 'ПОТОП ЧЕРЕЗ {s} с: наверх'],
  'fl.obj.rise': ['Water rising ({lvl}): stay above it', 'Su yükseliyor ({lvl}): üstünde kal', 'Вода поднимается ({lvl}): держитесь выше'],
  'fl.obj.hold': ['The water holds ({lvl}): {s}s', 'Su sabit ({lvl}): {s} sn', 'Вода держится ({lvl}): {s} с'],
  'fl.obj.drain': ['The water is draining: {s}s', 'Su çekiliyor: {s} sn', 'Вода уходит: {s} с'],
  'fl.lvl0': ['dry', 'kuru', 'сухо'], 'fl.lvl1': ['ankle', 'ayak bileği', 'по щиколотку'], 'fl.lvl2': ['knee', 'diz', 'по колено'],
  'fl.lvl3': ['waist', 'bel', 'по пояс'], 'fl.lvl4': ['chest', 'göğüs', 'по грудь'], 'fl.lvl5': ['over your head', 'kafanın üstünde', 'с головой'],
  'fl.hint': ['Catwalks, stairs and crates are dry. Loot floats up: grab it early.', 'Yürüme yolları, merdivenler ve kasalar kuru. Ganimet yüzer: erken kap.', 'Мостки, лестницы и ящики сухие. Добыча всплывает: хватайте раньше.'],
  'fl.air': ['AIR {s}s', 'HAVA {s} sn', 'ВОЗДУХ {s} с'],
  'fl.air0': ['DROWNING: get your head above water', 'BOĞULUYORSUN: kafanı sudan çıkar', 'ТОНЕТЕ: поднимите голову над водой'],
  'fl.over': ['The water is gone. The carpet is not.', 'Su gitti. Halı gitmedi.', 'Воды нет. Ковёр остался.'],
  'fl.algo': ['A pipe has been monetised. Enjoy the water feature.', 'Bir boru gelir modeline dahil edildi. Su özelliğinin keyfini çıkarın.', 'Труба монетизирована. Наслаждайтесь водной функцией.'],
  'fl.reason': ['Flood survived', 'Sel atlatıldı', 'Потоп пережит'],
  'fl.debris': ['Debris floats in the flooded sectors.', 'Su altındaki bölgelerde enkaz yüzüyor.', 'В затопленных секторах плавает мусор.'],

  // ------------------------------------------------------------------ power reroute
  'pw.title': ['POWER REROUTE', 'GÜÇ YÖNLENDİRME', 'ПЕРЕНАПРАВЛЕНИЕ ПИТАНИЯ'],
  'pw.sub.low': ['Brown-out. Flip the 3 breakers from the LOWEST load to the HIGHEST.', 'Voltaj düştü. 3 şalteri en DÜŞÜK yükten en YÜKSEĞE doğru çevir.', 'Просадка сети. Включите 3 автомата от НАИМЕНЬШЕЙ нагрузки к НАИБОЛЬШЕЙ.'],
  'pw.sub.high': ['Brown-out. Flip the 3 breakers from the HIGHEST load to the LOWEST.', 'Voltaj düştü. 3 şalteri en YÜKSEK yükten en DÜŞÜĞE doğru çevir.', 'Просадка сети. Включите 3 автомата от НАИБОЛЬШЕЙ нагрузки к НАИМЕНЬШЕЙ.'],
  'pw.obj.low': ['REROUTE POWER: breakers LOWEST to HIGHEST load ({n}/3)', 'GÜCÜ YÖNLENDİR: şalterler en DÜŞÜKTEN en YÜKSEK yüke ({n}/3)', 'ПИТАНИЕ: автоматы от НАИМЕНЬШЕЙ к НАИБОЛЬШЕЙ нагрузке ({n}/3)'],
  'pw.obj.high': ['REROUTE POWER: breakers HIGHEST to LOWEST load ({n}/3)', 'GÜCÜ YÖNLENDİR: şalterler en YÜKSEKTEN en DÜŞÜK yüke ({n}/3)', 'ПИТАНИЕ: автоматы от НАИБОЛЬШЕЙ к НАИМЕНЬШЕЙ нагрузке ({n}/3)'],
  'pw.hint': ['A wrong flip surges and resets. Live panels buzz: creatures hear it.', 'Yanlış şalter atlama sıfırlar. Açık paneller uğuldar: yaratıklar duyar.', 'Неверный порядок сбрасывает всё. Живые щиты гудят: существа слышат.'],
  'pw.panel': ['Flip the breaker [E]', 'Şalteri çevir [E]', 'Включить автомат [E]'],
  'pw.panel.sub': ['LOAD {n} of 3', 'YÜK {n} / 3', 'НАГРУЗКА {n} из 3'],
  'pw.panel.up': ['Breaker up', 'Şalter açık', 'Автомат включён'],
  'pw.ok': ['Breaker holds ({n}/3). The lights steady.', 'Şalter tuttu ({n}/3). Işıklar sabitleniyor.', 'Автомат держит ({n}/3). Свет выравнивается.'],
  'pw.surge': ['SURGE! Wrong order: the breakers reset.', 'ARTIŞ! Yanlış sıra: şalterler sıfırlandı.', 'СКАЧОК! Неверный порядок: автоматы сброшены.'],
  'pw.solved': ['POWER REROUTED', 'GÜÇ YÖNLENDİRİLDİ', 'ПИТАНИЕ ПЕРЕНАПРАВЛЕНО'],
  'pw.solved.vault': ['The lights are back. The vault is open.', 'Işıklar geri geldi. Kasa açıldı.', 'Свет вернулся. Хранилище открыто.'],
  'pw.solved.treasure': ['The lights are back. A sealed room clicks open.', 'Işıklar geri geldi. Mühürlü bir oda açıldı.', 'Свет вернулся. Запечатанная комната открылась.'],
  'pw.solved.crate': ['The lights are back. A supply crate drops at the panel.', 'Işıklar geri geldi. Panelin yanına bir kasa düştü.', 'Свет вернулся. У щита упал ящик с припасами.'],
  'pw.fail': ['The brown-out ends by itself. Nothing opens.', 'Voltaj düşüklüğü kendiliğinden bitti. Hiçbir şey açılmadı.', 'Просадка закончилась сама. Ничего не открылось.'],
  'pw.algo': ['Power is now a shared resource. You are sharing it with something.', 'Güç artık ortak bir kaynak. Onu bir şeyle paylaşıyorsun.', 'Питание теперь общий ресурс. Вы делите его кое с кем.'],
  'pw.reason': ['Power rerouted', 'Güç yönlendirildi', 'Питание перенаправлено'],
  'pw.pay': ['Power rerouted: +▮{c}', 'Güç yönlendirildi: +▮{c}', 'Питание перенаправлено: +▮{c}'],

  // ------------------------------------------------------------------ viral moment
  'vr.title': ['VIRAL MOMENT', 'VİRAL AN', 'ВИРУСНЫЙ МОМЕНТ'],
  'vr.pick': ['THE ALGORITHM IS CHOOSING...', 'ALGORİTMA SEÇİYOR...', 'АЛГОРИТМ ВЫБИРАЕТ...'],
  'vr.you': ['YOU ARE TRENDING', 'SEN TRENDSİN', 'ВЫ В ТРЕНДАХ'],
  'vr.you.sub': ['Every creature is coming for you. Whatever you secure is worth x3.', 'Tüm yaratıklar sana geliyor. Güvene aldığın her şey x3 değerinde.', 'Все существа идут за вами. Всё, что вы сохраните, стоит x3.'],
  'vr.other': ['{name} IS TRENDING', '{name} TREND OLDU', '{name} В ТРЕНДАХ'],
  'vr.other.sub': ['Creatures hunt them. Their secured loot is worth x3: cover them.', 'Yaratıklar onu avlıyor. Güvene aldığı ganimet x3: onu koru.', 'Существа охотятся на него. Его добыча стоит x3: прикройте.'],
  'vr.obj.self': ['TRENDING: secure loot for x3 ({s}s)', 'TREND: x3 için ganimeti güvene al ({s} sn)', 'В ТРЕНДАХ: спрячьте добычу за x3 ({s} с)'],
  'vr.obj.other': ['{name} is trending: help them secure loot ({s}s)', '{name} trend: ganimeti güvene almasına yardım et ({s} sn)', '{name} в трендах: помогите спрятать добычу ({s} с)'],
  'vr.tag': ['TRENDING', 'TREND', 'ТРЕНД'],
  'vr.x3': ['Trending bonus: +▮{v}', 'Trend bonusu: +▮{v}', 'Бонус тренда: +▮{v}'],
  'vr.end': ['The trend is over. The Algorithm has moved on.', 'Trend bitti. Algoritma başka bir şeye geçti.', 'Тренд закончился. Алгоритм переключился.'],
  'vr.end.dead': ['The trend ended early. Nobody is surprised.', 'Trend erken bitti. Kimse şaşırmadı.', 'Тренд закончился раньше. Никто не удивлён.'],
  'vr.algo': ['{name} is trending. Viewers are excited. Viewers are also hungry.', '{name} trend oldu. İzleyiciler heyecanlı. İzleyiciler aynı zamanda aç.', '{name} в трендах. Зрители в восторге. Зрители ещё и голодны.'],
  'vr.reason': ['Trend survived', 'Trend atlatıldı', 'Тренд пережит'],

  // ------------------------------------------------------------------ shared
  'ev.clear': ['Crisis over.', 'Kriz bitti.', 'Кризис окончен.'],
};

const trMap = {}, ruMap = {};
for (const v of Object.values(TEXT)) { trMap[v[0]] = v[1]; ruMap[v[0]] = v[2]; }
addTranslations(trMap);
addTranslations(ruMap, 'ru');

export const x = (id) => { const v = TEXT[id]; return v ? t(v[0]) : id; };
export const xf = (id, vars) => { const v = TEXT[id]; return v ? tf(v[0], vars) : id; };
