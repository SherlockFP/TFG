// SURVIVAL translations (EN key -> Turkish / Russian). Pure data + a builder that composes the generated item names / tips (plants, seeds, dishes,
// recipes) from the same tables survival_data.js uses, so the English text can never drift from the dictionaries. Node-testable (no DOM).
import * as D from './survival_data.js';

// ---- plant names + hints
const PL = {
  wildmint: ['Yabani Nane', 'Дикая мята', 'Serin, keskin bir ot. Biraz can yeniler, uyandırır.', 'Прохладная острая трава. Немного лечит и бодрит.'],
  glowcap: ['Işık Mantarı', 'Светошляпка', 'Hafifçe camgöbeği parlayan mağara mantarı. Yenirse karanlıkta görürsün.', 'Пещерный гриб, слабо светится бирюзой. Съеденный, даёт видеть в темноте.'],
  ashroot: ['Kül Kökü', 'Пепельный корень', 'Yanmış topraktan çıkan kömürleşmiş kırmızı kök. Duman tadı. Seni ateşe dayanıklı yapar.', 'Обугленный красный корень с выжженной земли. На вкус как дым. Делает огнестойким.'],
  frostleaf: ['Buz Yaprağı', 'Морозный лист', 'Biber gibi yakan buz mavisi yapraklar. Çayı soğuğu dışarıda tutar.', 'Ледяные синие листья, жгут как перец. Чай из них не пускает холод.'],
  bloodberry: ['Kan Meyvesi', 'Кровяника', 'Sulu, koyu meyveler. Toplayabileceğin en iyi şifa otu.', 'Сочные тёмные ягоды. Лучшая целебная трава, что можно просто сорвать.'],
  staticmoss: ['Statik Yosun', 'Статичный мох', 'Çıtırdayan yosun. Sesi yutar; yedikten sonra daha sessiz basarsın.', 'Потрескивающий мох. Глушит звук: после него ступаешь тише.'],
  sunfruit: ['Çift Güneş Meyvesi', 'Плод двух солнц', 'Çöl kaktüsünün tatlı meyvesi. Şeker ve hız.', 'Сладкий плод пустынного кактуса. Сахар и скорость.'],
};
// ---- properties (buff names, short names, descriptions)
const PR = {
  regen: ['Onarıcı', 'Целебный', 'Onarıcı', 'Целебный', 'Saniyede 1.2 CAN yeniler.', 'Восстанавливает 1.2 ЗДР в секунду.'],
  stam: ['İkinci Nefes', 'Второе дыхание', 'İkinci Nefes', 'Второе дыхание', 'Dayanıklılık %45 hızlı yenilenir.', 'Выносливость восстанавливается на 45% быстрее.'],
  night: ['Gece Gözü', 'Ночные глаза', 'Gece Gözü', 'Ночные глаза', 'Karanlıkta görebilirsin.', 'Вы видите в темноте.'],
  quiet: ['Sessizlik', 'Тишина', 'Sessizlik', 'Тишина', 'Gürültün %55 azalır.', 'Ваш шум приглушён на 55%.'],
  fire: ['Ateşe Dayanıklı', 'Огнестойкость', 'Ateşe Dayanıklı', 'Огнестойкость', 'Ateş, buhar ve yanma hasarı -%60.', 'Урон от огня, пара и ожогов -60%.'],
  warm: ['Isındın', 'Согрет', 'Isıtan', 'Согревающий', 'Soğuğa bağışıksın. Saniyede 0.4 CAN yeniler.', 'Иммунитет к холоду. Восстанавливает 0.4 ЗДР в секунду.'],
  speed: ['Çevik', 'Проворство', 'Çevik', 'Проворство', '+%9 hareket hızı.', '+9% к скорости движения.'],
};
const MAIN = {
  stew: ['Doyurucu Güveç', 'Сытное рагу'], grill: ['Izgara Av', 'Жареный улов'], soup: ['Toplayıcı Çorbası', 'Суп собирателя'], tart: ['Yaban Meyveli Turta', 'Ягодный пирог'],
};
const MAIN_TIP = {
  stew: ['Bir kazanda et ve yeşillik.', 'Мясо и зелень в одном котле.'], grill: ['Ateşte balık.', 'Рыба на огне.'], soup: ['Mantar, kök ve yapraklar.', 'Грибы, корни и листья.'], tart: ['Tatlı ve hafif.', 'Сладкий и лёгкий.'],
};

/** [tr, ru] of the fixed strings (the key is the English text) */
const FIXED = {
  // hunger / warmth
  'You are getting hungry. Cook something.': ['Acıkıyorsun. Bir şeyler pişir.', 'Вы проголодались. Приготовьте что-нибудь.'],
  'Starving: stamina and speed suffer. Not deadly, just miserable.': ['Açlıktan ölüyorsun: dayanıklılık ve hız düşer. Öldürmez, sadece sefil.', 'Голод: выносливость и скорость падают. Не смертельно, просто мерзко.'],
  'You are getting cold. A campfire or a warm meal helps.': ['Üşüyorsun. Kamp ateşi ya da sıcak bir yemek iyi gelir.', 'Вам холодно. Поможет костёр или горячая еда.'],
  'Freezing: you move slower. Find a fire.': ['Donuyorsun: yavaşlarsın. Bir ateş bul.', 'Замерзаете: вы двигаетесь медленнее. Найдите огонь.'],
  HUNGER: ['AÇLIK', 'ГОЛОД'], WARMTH: ['ISI', 'ТЕПЛО'], 'by the fire': ['ateşin yanında', 'у огня'], Warm: ['Sıcak', 'Тепло'], Chilled: ['Üşüyor', 'Прохладно'], Freezing: ['Donuyor', 'Мерзнете'],
  Satisfied: ['Doygun', 'Сытость'], Fed: ['Tok', 'Сыт'], Hungry: ['Aç', 'Голод'], Starving: ['Açlıktan bitkin', 'Истощение'],
  '+6 max HP, stamina regenerates 8% faster.': ['+6 maks CAN, dayanıklılık %8 hızlı yenilenir.', '+6 макс. ЗДР, выносливость восстанавливается на 8% быстрее.'],
  'Stamina regenerates 12% slower. Eat something.': ['Dayanıklılık %12 yavaş yenilenir. Bir şeyler ye.', 'Выносливость восстанавливается на 12% медленнее. Поешьте.'],
  'Stamina regenerates 25% slower, -5% speed. It is never lethal, just miserable.': ['Dayanıklılık %25 yavaş yenilenir, -%5 hız. Asla öldürmez, sadece sefil.', 'Выносливость на 25% медленнее, -5% скорости. Не смертельно, просто мерзко.'],
  HP: ['CAN', 'ЗДР'], hunger: ['açlık', 'сытость'],
  // eating
  'It was not cooked through. Food poisoning.': ['İyi pişmemişti. Gıda zehirlenmesi.', 'Плохо прожарено. Пищевое отравление.'],
  'Burnt to a crisp. Barely edible.': ['Kömür olmuş. Zor yenir.', 'Сгорело дотла. Едва съедобно.'],
  'Raw meat. You feel sick.': ['Çiğ et. Midem bulandı.', 'Сырое мясо. Вас тошнит.'],
  'Food Poisoning': ['Gıda Zehirlenmesi', 'Пищевое отравление'],
  '-12% speed, stamina regenerates 20% slower. Cook your meat.': ['-%12 hız, dayanıklılık %20 yavaş yenilenir. Etini pişir.', '-12% скорости, выносливость на 20% медленнее. Жарьте мясо.'],
  // interactions
  'hold E': ['E basılı tut', 'удерживайте E'], Pick: ['Topla', 'Собрать'], rare: ['nadir', 'редкий'],
  'Sickle: faster, +1': ['Orak: daha hızlı, +1', 'Серп: быстрее, +1'], Open: ['Aç', 'Открыть'],
  'Cook [E]': ['Pişir [E]', 'Готовить [E]'], 'Ship stove: 1-3 ingredients, watch the needle': ['Gemi ocağı: 1-3 malzeme, ibreyi izle', 'Плита корабля: 1-3 ингредиента, следите за стрелкой'],
  'Brew [E]': ['Demle [E]', 'Варить [E]'], 'Brewing...': ['Demleniyor...', 'Варится...'], Ready: ['Hazır', 'Готово'], 'Tonics from herbs': ['Otlardan tonikler', 'Тоники из трав'],
  'Pack up': ['Topla', 'Свернуть'], 'Add wood [E]': ['Odun ekle [E]', 'Подбросить дров [E]'], 'Cook at the fire [E]': ['Ateşte pişir [E]', 'Готовить на огне [E]'],
  'Empty cell': ['Boş göz', 'Пустая ячейка'], 'Hold seeds and press E': ['Tohum tut ve E\'ye bas', 'Возьмите семена и нажмите E'], Watered: ['Sulandı', 'Полито'],
  'Thirsty: hold a watering can': ['Susamış: sulama kabı tut', 'Жажда: возьмите лейку'], 'ripe in': ['olgunlaşmasına', 'созреет через'],
  'Aim at the floor.': ['Zemine nişan al.', 'Цельтесь в пол.'], 'Perfect!': ['Mükemmel!', 'Идеально!'], Foraged: ['Toplandı', 'Собрано'], Harvest: ['Hasat', 'Урожай'], Chef: ['Aşçı', 'Повар'],
  'Aim at a planter cell and press E to plant it.': ['Bir saksı gözüne nişan al ve ekmek için E\'ye bas.', 'Наведитесь на ячейку грядки и нажмите E, чтобы посадить.'],
  'Plant {name} [E]': ['{name} ek [E]', 'Посадить: {name} [E]'], 'Harvest {name} [E]': ['{name} hasat et [E]', 'Собрать урожай: {name} [E]'], 'Water {name} [E]': ['{name} sula [E]', 'Полить: {name} [E]'],
  'Too far away.': ['Çok uzaktasın.', 'Слишком далеко.'], 'That is gone.': ['O artık yok.', 'Этого больше нет.'], 'That one is bolted down.': ['O yere çivilenmiş.', 'Это прикручено намертво.'],
  'Not ripe yet.': ['Henüz olgunlaşmadı.', 'Ещё не созрело.'], 'Get closer to the stove.': ['Ocağa yaklaş.', 'Подойдите ближе к плите.'], 'The stove is busy.': ['Ocak meşgul.', 'Плита занята.'], 'Only the ship stove cooks now.': ['Artık sadece geminin ocağı pişiriyor.', 'Теперь готовит только плита корабля.'], 'Those ingredients are gone.': ['O malzemeler artık yok.', 'Этих ингредиентов больше нет.'],
  'That is not an ingredient.': ['Bu bir malzeme değil.', 'Это не ингредиент.'], 'That does not make a tonic.': ['Bundan tonik olmaz.', 'Из этого не выйдет тоника.'], 'Something is in the way.': ['Yolda bir şey var.', 'Что-то мешает.'],
  'Light it outside.': ['Dışarıda yak.', 'Разожгите его снаружи.'], 'Only on your ship or your homeworld.': ['Sadece geminde veya ev gezegeninde.', 'Только на корабле или на родной планете.'],
  'Empty the crate first.': ['Önce sandığı boşalt.', 'Сначала опустошите ящик.'], 'Empty it first.': ['Önce boşalt.', 'Сначала опустошите.'], 'Nope.': ['Olmaz.', 'Нет.'],
  // panels
  'BREWING STAND': ['DEMLEME STANDI', 'ВАРОЧНАЯ СТОЙКА'], CAMPFIRE: ['KAMP ATEŞİ', 'КОСТЁР'], 'SHIP STOVE': ['GEMİ OCAĞI', 'ПЛИТА КОРАБЛЯ'],
  RAW: ['ÇİĞ', 'СЫРОЕ'], COOKED: ['PİŞMİŞ', 'ГОТОВО'], PERFECT: ['MÜKEMMEL', 'ИДЕАЛЬНО'], BURNT: ['YANIK', 'ПРИГАРЬ'],
  'Carried ingredients': ['Taşıdığın malzemeler', 'Ингредиенты с собой'], Flasks: ['Şişeler', 'Колбы'], Pot: ['Kazan', 'Котёл'], '2-3 herbs': ['2-3 ot', '2-3 травы'], '1-3 ingredients': ['1-3 malzeme', '1-3 ингредиента'],
  Clear: ['Temizle', 'Очистить'], 'Field guide': ['Saha rehberi', 'Полевой справочник'],
  'No herbs on you. Forage or farm some.': ['Yanında ot yok. Topla ya da yetiştir.', 'Трав нет. Соберите или вырастите.'],
  'No ingredients on you. Forage plants, hunt, fish or farm.': ['Yanında malzeme yok. Bitki topla, avlan, balık tut ya da çiftçilik yap.', 'Ингредиентов нет. Собирайте растения, охотьтесь, ловите рыбу или выращивайте.'],
  'Ready! It is on the stand.': ['Hazır! Standın üstünde.', 'Готово! Оно на стойке.'],
  'Needs 2-3 plants that share a property: Second Wind, Night Eyes, Hush or Fireproof.': ['Ortak özelliği olan 2-3 bitki gerekir: İkinci Nefes, Gece Gözü, Sessizlik veya Ateşe Dayanıklı.', 'Нужны 2-3 растения с общим свойством: Второе дыхание, Ночные глаза, Тишина или Огнестойкость.'],
  'Put herbs on the flasks.': ['Şişelere ot koy.', 'Положите травы в колбы.'], BREW: ['DEMLE', 'ВАРИТЬ'],
  'It is on the counter. Pick it up and eat it.': ['Tezgahta. Al ve ye.', 'Оно на столешнице. Возьмите и съешьте.'],
  'Raw meat: do not stop the needle too early.': ['Çiğ et: ibreyi çok erken durdurma.', 'Сырое мясо: не останавливайте стрелку слишком рано.'],
  'Pick 1-3 ingredients. Meat makes a stew, fish a grill, greens a soup, berries a tart. Herbs add an effect.': ['1-3 malzeme seç. Etten güveç, balıktan ızgara, yeşillikten çorba, meyveden turta olur. Otlar etki ekler.', 'Выберите 1-3 ингредиента. Из мяса выйдет рагу, из рыбы жаркое, из зелени суп, из ягод пирог. Травы добавляют эффект.'],
  STOP: ['DUR', 'СТОП'], COOK: ['PİŞİR', 'ГОТОВИТЬ'], 'The pot holds three ingredients.': ['Kazan üç malzeme alır.', 'В котёл влезает три ингредиента.'],
  'The flasks start bubbling.': ['Şişeler kaynamaya başladı.', 'Колбы начинают булькать.'], Sort: ['Sırala', 'Сортировать'], 'Take all': ['Hepsini al', 'Забрать всё'], Label: ['Etiket', 'Метка'],
  Hotbar: ['Hızlı erişim', 'Панель'], 'Empty. Drag items in.': ['Boş. Eşyaları sürükle.', 'Пусто. Перетащите вещи.'], Pockets: ['Cepler', 'Карманы'],
  'RMB: to pockets': ['Sağ tık: ceplere', 'ПКМ: в карманы'], 'RMB: into the crate': ['Sağ tık: sandığa', 'ПКМ: в ящик'],
  'DRAG': ['SÜRÜKLE', 'ТАЩИТЬ'], 'move between crate and pockets': ['sandık ile cepler arasında taşı', 'переносить между ящиком и карманами'], 'RMB': ['SAĞ TIK', 'ПКМ'], 'quick move': ['hızlı taşı', 'быстро переместить'],
  'Click': ['TIK', 'КЛИК'], 'add / remove': ['ekle / çıkar', 'добавить / убрать'], 'SPACE / E': ['BOŞLUK / E', 'ПРОБЕЛ / E'], 'stop the needle': ['ibreyi durdur', 'остановить стрелку'], ESC: ['ESC', 'ESC'], close: ['kapat', 'закрыть'],
  'Brewing... {s} s': ['Demleniyor... {s} sn', 'Варится... {s} с'],
  '{s} s of effect, ready in {b} s. Quality: {q}': ['{s} sn etki, {b} sn içinde hazır. Kalite: {q}', 'Эффект {s} с, готово через {b} с. Качество: {q}'],
  'Heals {h} HP, feeds {f}': ['{h} CAN iyileştirir, {f} doyurur', 'Лечит {h} ЗДР, насыщает на {f}'], '(perfect: {h})': ['(mükemmel: {h})', '(идеально: {h})'],
  // storage rules
  'Unknown item.': ['Bilinmeyen eşya.', 'Неизвестный предмет.'], 'Soulbound items cannot be stored.': ['Ruha bağlı eşyalar saklanamaz.', 'Привязанные к душе предметы хранить нельзя.'],
  'Empty the bag first.': ['Önce çantayı boşalt.', 'Сначала опустошите сумку.'], 'That does not fit in a bag.': ['Bu çantaya sığmaz.', 'Это не влезает в сумку.'], 'Does not fit there.': ['Oraya sığmıyor.', 'Сюда не помещается.'],
  'The crate is full.': ['Sandık dolu.', 'Ящик полон.'], 'Nothing there.': ['Orada bir şey yok.', 'Там ничего нет.'], 'Nowhere to put it.': ['Koyacak yer yok.', 'Некуда поставить.'],
  'No room for another one here.': ['Burada bir tane daha için yer yok.', 'Здесь нет места ещё для одного.'], 'Too close to something else.': ['Başka bir şeye çok yakın.', 'Слишком близко к другому объекту.'],
  'Put 1-3 ingredients in the pot.': ['Kazana 1-3 malzeme koy.', 'Положите в котёл 1-3 ингредиента.'],
  // quality / stations
  Burnt: ['Yanık', 'Подгоревшее'], Undercooked: ['Az pişmiş', 'Недоваренное'], Cooked: ['Pişmiş', 'Приготовленное'], Perfect: ['Mükemmel', 'Идеальное'],
  'Ship Stove': ['Gemi Ocağı', 'Плита корабля'], Campfire: ['Kamp Ateşi', 'Костёр'],
  'Wooden Crate': ['Tahta Sandık', 'Деревянный ящик'], 'Metal Crate': ['Metal Sandık', 'Металлический ящик'], 'Secure Crate': ['Güvenli Sandık', 'Защищённый ящик'],
  SHIP: ['GEMİ', 'КОРАБЛЬ'], SECURE: ['GÜVENLİ', 'СЕЙФ'],
  // items
  Sickle: ['Orak', 'Серп'], 'Watering Can': ['Sulama Kabı', 'Лейка'], 'Planter Box': ['Ekim Kasası', 'Грядка-ящик'], 'Brewing Stand': ['Demleme Standı', 'Варочная стойка'], 'Campfire Kit': ['Kamp Ateşi Seti', 'Набор для костра'], 'Raw Meat': ['Çiğ Et', 'Сырое мясо'],
  'Stamina Tonic': ['Dayanıklılık Toniği', 'Тоник выносливости'], 'Night Draught': ['Gece İksiri', 'Ночной настой'], 'Hush Tonic': ['Sessizlik Toniği', 'Тоник тишины'], 'Fireward Tonic': ['Ateş Koruma Toniği', 'Тоник огнеупора'],
  'Hold while harvesting: plants come off in half the time, +1 plant and better seed odds.': ['Hasat ederken tut: bitkiler yarı sürede toplanır, +1 bitki ve daha iyi tohum şansı.', 'Держите при сборе: растения срезаются вдвое быстрее, +1 растение и больше шанс на семена.'],
  'E on a planter cell to water the crop. One watering lasts 5 minutes.': ['Ürünü sulamak için ekim gözüne E. Bir sulama 5 dakika yeter.', 'E на ячейке грядки — полить. Одного полива хватает на 5 минут.'],
  'LMB on the floor of your ship or homeworld: place a storage crate (6x3).': ['Gemin veya ev gezegeninin zeminine sol tık: depolama sandığı koy (6x3).', 'ЛКМ по полу корабля или родной планеты: поставить ящик для хранения (6x3).'],
  'LMB on the floor of your ship or homeworld: place a storage crate (8x4).': ['Gemin veya ev gezegeninin zeminine sol tık: depolama sandığı koy (8x4).', 'ЛКМ по полу корабля или родной планеты: поставить ящик для хранения (8x4).'],
  'LMB on the floor of your ship or homeworld: place a big steel crate (10x5).': ['Gemin veya ev gezegeninin zeminine sol tık: büyük çelik sandık koy (10x5).', 'ЛКМ по полу корабля или родной планеты: поставить большой стальной ящик (10x5).'],
  'LMB on the floor of your ship or homeworld: place a planter with three cells.': ['Gemin veya ev gezegeninin zeminine sol tık: üç gözlü ekim kasası koy.', 'ЛКМ по полу корабля или родной планеты: поставить грядку с тремя ячейками.'],
  'LMB on the floor of your ship or homeworld: place an alchemy stand.': ['Gemin veya ev gezegeninin zeminine sol tık: simya standı koy.', 'ЛКМ по полу корабля или родной планеты: поставить алхимическую стойку.'],
  'LMB on the ground outside: light a campfire. It warms you, cooks food and burns for 5 minutes (feed it wood).': ['Dışarıda yere sol tık: kamp ateşi yak. Seni ısıtır, yemek pişirir, 5 dakika yanar (odun ver).', 'ЛКМ по земле снаружи: развести костёр. Греет, готовит еду, горит 5 минут (подкидывайте дрова).'],
  'LMB: eat it raw (a token amount, and it usually makes you sick). Cook it at a stove or campfire.': ['Sol tık: çiğ ye (çok az, çoğunlukla hasta eder). Ocakta veya kamp ateşinde pişir.', 'ЛКМ: съесть сырым (чуть-чуть, и обычно тошнит). Приготовьте на плите или костре.'],
  'Plant them in a planter cell (E). Water them and wait.': ['Ekim gözüne ek (E). Sula ve bekle.', 'Посадите в ячейку грядки (E). Поливайте и ждите.'],
  'LMB: drink. Refills 30 stamina and stamina regenerates 80% faster for a while.': ['Sol tık: iç. 30 dayanıklılık doldurur ve bir süre dayanıklılık %80 hızlı yenilenir.', 'ЛКМ: выпить. Возвращает 30 выносливости и на время ускоряет её восстановление на 80%.'],
  'LMB: drink. See in the dark for a while.': ['Sol tık: iç. Bir süre karanlıkta görürsün.', 'ЛКМ: выпить. На время вы видите в темноте.'],
  'LMB: drink. Your noise is dampened by 60%.': ['Sol tık: iç. Gürültün %60 azalır.', 'ЛКМ: выпить. Ваш шум приглушён на 60%.'],
  'LMB: drink. Fire, steam and burning damage -65%.': ['Sol tık: iç. Ateş, buhar ve yanma hasarı -%65.', 'ЛКМ: выпить. Урон от огня, пара и ожогов -65%.'],
  // recipes
  'Cuts herbs in half the time.': ['Otları yarı sürede keser.', 'Срезает травы вдвое быстрее.'], 'Water your planter.': ['Ekim kasanı sula.', 'Поливайте грядку.'],
  'Storage 6x3. Place it on your ship or homeworld.': ['Depolama 6x3. Gemine veya ev gezegenine koy.', 'Хранилище 6x3. Ставится на корабле или родной планете.'], 'Storage 8x4.': ['Depolama 8x4.', 'Хранилище 8x4.'],
  'Storage 10x5 in a steel shell.': ['Çelik kabukta depolama 10x5.', 'Хранилище 10x5 в стальном корпусе.'], 'Three crop cells.': ['Üç ürün gözü.', 'Три ячейки для посевов.'], 'Brew tonics from herbs.': ['Otlardan tonik demle.', 'Варите тоники из трав.'],
  'A portable fire: warmth and a cooking spot.': ['Taşınabilir ateş: sıcaklık ve pişirme yeri.', 'Переносной огонь: тепло и место для готовки.'],
  'Second Wind': ['İkinci Nefes', 'Второе дыхание'],
};

/** builds { tr, ru } dictionaries (English key -> translation) */
export function buildDictionaries() {
  const tr = {}, ru = {};
  const put = (en, a, b) => { if (en) { tr[en] = a; ru[en] = b; } };
  for (const [en, [a, b]] of Object.entries(FIXED)) put(en, a, b);
  // plants + seeds
  for (const [k, P] of Object.entries(D.PLANTS)) {
    const [tn, rn, th, rh] = PL[k];
    put(P.name, tn, rn); put(P.hint, th, rh);
    put(`${P.hint} LMB: eat it raw (a tiny bite). Cook it for the real effect.`, `${th} Sol tık: çiğ ye (minik bir ısırık). Gerçek etki için pişir.`, `${rh} ЛКМ: съесть сырым (крошечный укус). Настоящий эффект даёт готовка.`);
    put(`${P.name} Seeds`, `${tn} Tohumu`, `Семена: ${rn}`);
  }
  // properties -> buff names / short names / descriptions
  for (const [p, P] of Object.entries(D.PROPS)) {
    const [bt, br, st, sr, dt, dr] = PR[p];
    put(P.name, bt, br); put(P.short, st, sr); put(P.desc, dt, dr);
  }
  // main dishes + composed dish names / tips
  for (const [m, M] of Object.entries(D.MAINS)) { put(M.name, MAIN[m][0], MAIN[m][1]); put(M.tip, MAIN_TIP[m][0], MAIN_TIP[m][1]); }
  for (const id of D.allDishIds()) {
    const d = D.parseDish(id);
    const def = D.DISH_ITEMS[id];
    const [mt, mr] = MAIN[d.main];
    const sb = d.bonus ? PR[d.bonus] : null;
    put(def.name, `${mt}${sb ? ` (${sb[2]})` : ''}`, `${mr}${sb ? ` (${sb[3]})` : ''}`);
    put(def.tip, `Sol tık: ye. Pişmiş bir yemek: gerçek iyileşme ve tokluk. ${sb ? sb[4] + ' ' : ''}Kalitesi seviyesidir.`, `ЛКМ: съесть. Готовое блюдо: настоящее лечение и сытость. ${sb ? sb[5] + ' ' : ''}Качество — это его редкость.`);
  }
  // recipe names that equal item names are already covered; make sure every item name / tip has an entry
  return { tr, ru };
}
export const FIXED_KEYS = Object.keys(FIXED);
