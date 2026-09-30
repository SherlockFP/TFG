// World / base / moon data strings: [English key, Turkish, Russian]. wave 8 i18n8. Gap-fill only.
import { fillGaps } from '../i18n/fill.js';

fillGaps([
  // ---- home base buildings (homeworld_core)
  ['Posts content all day. Passive credits per day.', 'Gün boyu içerik paylaşır. Günlük pasif kredi.', 'Целый день постит контент. Пассивные кредиты каждый день.'],
  ['Turns Engagement into Clout. Runs hot: needs cooling.', "Etkileşimi Clout'a çevirir. Isınır: soğutma ister.", 'Превращает вовлечённость в клаут. Греется: нужно охлаждение.'],
  ['Burns anything. Lots of power, some heat.', 'Her şeyi yakar. Bol güç, biraz ısı.', 'Жжёт всё подряд. Много энергии, немного тепла.'],
  ['Clean power. No heat, fragile, costs more per watt.', 'Temiz güç. Isı yok, kırılgan, watt başına daha pahalı.', 'Чистая энергия. Без тепла, хрупкая, дороже за ватт.'],
  ['Removes heat so hot buildings can be built.', 'Isıyı alır, böylece sıcak yapılar kurulabilir.', 'Отводит тепло, чтобы можно было строить горячие здания.'],
  ['Melts scrap into components. Components pay for every build.', 'Hurdayı bileşene eritir. Her inşaat bileşenle ödenir.', 'Переплавляет хлам в компоненты. Компонентами оплачивается любая стройка.'],
  ['Slowly distils forge shards. Higher tiers, better shards.', 'Dökümhane parçalarını yavaşça damıtır. Üst seviye, daha iyi parça.', 'Медленно перегоняет осколки кузни. Ранг выше - осколки лучше.'],
  ['Meals for the crew (collected as medkits).', 'Ekibe yemek (ilk yardım çantası olarak toplanır).', 'Еда для команды (собирается в виде аптечек).'],
  ['Hired hands. Every producer works faster.', 'Tutulmuş işçiler. Her üretici daha hızlı çalışır.', 'Наёмные руки. Каждое производство работает быстрее.'],
  ['Bestiary trophies draw visitors: passive Clout.', 'Bestiary kupaları ziyaretçi çeker: pasif Clout.', 'Трофеи бестиария привлекают посетителей: пассивный клаут.'],
  ['Games, jam, friends. +Clout from every source.', 'Oyunlar, jam, dostlar. Her kaynaktan +Clout.', 'Игры, джемы, друзья. +клаут из любого источника.'],
  ['Raises every storage cap.', 'Her depolama sınırını yükseltir.', 'Поднимает все лимиты хранения.'],
  ['Reliable single-target fire.', 'Güvenilir tek hedef atışı.', 'Надёжный огонь по одной цели.'],
  ['Arcs chain between raiders. Great vs swarms.', 'Yıldırım baskıncılar arasında zincirlenir. Sürülere karşı harika.', 'Дуги перескакивают между налётчиками. Отлично против роёв.'],
  ['Short range, huge damage. Burns everything close.', 'Kısa menzil, devasa hasar. Yakındaki her şeyi yakar.', 'Малая дальность, огромный урон. Сжигает всё вблизи.'],
  ['Slows raiders so every other tower gets more shots.', 'Baskıncıları yavaşlatır, diğer kuleler daha çok atış yapar.', 'Замедляет налётчиков, и остальные башни успевают выстрелить больше.'],
  ['Huge range, slow heavy shots.', 'Devasa menzil, yavaş ağır atışlar.', 'Огромная дальность, медленные тяжёлые выстрелы.'],
  ['Raiders path around walls, or chew through.', 'Baskıncılar duvarın etrafından dolaşır ya da kemirir.', 'Налётчики обходят стены или прогрызают их.'],
  ['Crew walks through, raiders do not.', 'Ekip geçer, baskıncılar geçemez.', 'Команда проходит, налётчики нет.'],
  ['Hurts everything that walks over it.', 'Üstünden geçen her şeyi yaralar.', 'Ранит всё, что по нему пройдёт.'],
  ['Rearmed free after every raid.', 'Her baskından sonra bedava yeniden kurulur.', 'Заряжаются бесплатно после каждого налёта.'],
  // ---- moons and moon modifiers
  ['Thermal Throttle Basin', 'Termal Kısıtlama Havzası', 'Бассейн термального троттлинга'], ['Permafrost Cold Storage', 'Kalıcı Don Soğuk Deposu', 'Вечная мерзлота: холодное хранилище'],
  ['Link-Rot Jungle', 'Bağlantı Çürümesi Ormanı', 'Джунгли гнилых ссылок'],
  ['Your own rock. Build, upgrade and defend a base: it produces while the days pass.', 'Kendi kayan. Bir üs kur, geliştir ve savun: günler geçerken üretir.', 'Ваш собственный камень. Стройте, улучшайте и защищайте базу: она приносит доход, пока идут дни.'],
  ['The lava rivers run wide. Scrap +25%, creature power +10%.', 'Lav nehirleri genişledi. Hurda +%25, yaratık gücü +%10.', 'Лавовые реки разлились. Хлам +25%, сила существ +10%.'],
  ['WHITEOUT', 'BEYAZ KÖRLÜK', 'БЕЛАЯ ПЕЛЕНА'], ['Permanent blizzard. Outdoor threats +25%, scrap +20%.', 'Kalıcı tipi. Dış tehditler +%25, hurda +%20.', 'Вечная метель. Угрозы снаружи +25%, хлам +20%.'],
  ['LINK BLOOM', 'BAĞLANTI ÇİÇEĞİ', 'ЦВЕТЕНИЕ ССЫЛОК'], ['Rampant overgrowth. Bots and leechers love it. Scrap +15%.', 'Başıboş bir yeşillik. Botlar ve sömürücüler bayılır. Hurda +%15.', 'Буйные заросли. Боты и пиявки в восторге. Хлам +15%.'],
  ['EXPEDITION SITE', 'KEŞİF SAHASI', 'МЕСТО ЭКСПЕДИЦИИ'], ['More towers, ruins and parkour routes outside (and more chests).', 'Dışarıda daha çok kule, harabe ve parkur rotası (ve daha çok sandık).', 'Снаружи больше башен, руин и паркур-маршрутов (и больше сундуков).'],
  // ---- outposts
  ['Abandoned Camp', 'Terk Edilmiş Kamp', 'Заброшенный лагерь'], ['Cargo Drop', 'Kargo Bırakma', 'Сброшенный груз'], ['Old Bunker', 'Eski Sığınak', 'Старый бункер'],
  ['Radio Station', 'Radyo İstasyonu', 'Радиостанция'], ['Wrecked Lander', 'Parçalanmış İniş Aracı', 'Разбитый спускаемый аппарат'], ['Crashed Uplink', 'Düşmüş Uplink', 'Разбитая станция связи'],
  ['Stream Van', 'Yayın Minibüsü', 'Стрим-фургон'], ['Server Cage', 'Sunucu Kafesi', 'Серверная клетка'], ['Main Entrance', 'Ana Giriş', 'Главный вход'],
  ['Locked supply crate', 'Kilitli malzeme sandığı', 'Запертый ящик с припасами'], ['Needs a key, a lockpicker or a melee weapon', 'Anahtar, maymuncuk ya da yakın dövüş silahı gerekir', 'Нужен ключ, отмычка или оружие ближнего боя'],
  ['Loud!', 'Gürültülü!', 'Громко!'],
  // ---- fauna
  ['Pixelope', 'Pikselgeyik', 'Пикселопа'], ['Kitebird', 'Uçurtma Kuşu', 'Птица-змей'], ['Bogback', 'Bataklık Sırtı', 'Болотный горбач'], ['Marsh Wisp', 'Bataklık Ateşi', 'Болотный огонёк'],
  ['Frostwoolly', 'Don Yünlü', 'Морозошерст'], ['Snowcrow', 'Kar Kargası', 'Снежная ворона'], ['Dune Strider', 'Kum Yürüyücüsü', 'Пустынный шагоход'], ['Skyray', 'Gök Vatozu', 'Небесный скат'],
  ['Heathcow', 'Fundalık İneği', 'Вересковая корова'], ['Bat-Kite', 'Yarasa Uçurtma', 'Нетопырь-змей'], ['Vine Tapir', 'Sarmaşık Tapiri', 'Лиановый тапир'], ['Glowmoth', 'Işık Güvesi', 'Светомотылёк'],
  ['Glitch Stag', 'Glitch Geyik', 'Глитч-олень'], ['Packet Moth', 'Paket Güvesi', 'Пакетная моль'], ['Cinder Hog', 'Kül Domuzu', 'Пепельный кабан'], ['Ember Moth', 'Kor Güvesi', 'Тлеющая моль'],
  ['Prism Deer', 'Prizma Geyiği', 'Призматический олень'], ['Shard Sprite', 'Kıymık Perisi', 'Осколочный дух'],
  // ---- ship / van / misc
  ['TAIL N', 'KUYRUK K', 'ХВОСТ С'], ['TAIL S', 'KUYRUK G', 'ХВОСТ Ю'], ['TAIL C', 'KUYRUK O', 'ХВОСТ Ц'], ['MID N', 'ORTA K', 'СЕРЕДИНА С'], ['MID S', 'ORTA G', 'СЕРЕДИНА Ю'],
  ['Bed seat L', 'Yatak koltuğu (sol)', 'Спальное место (левое)'], ['Bed seat R', 'Yatak koltuğu (sağ)', 'Спальное место (правое)'],
  ['Calibrate Sensor', 'Sensörü Kalibre Et', 'Откалибровать датчик'], ['MODERATION BUREAU', 'MODERASYON BÜROSU', 'БЮРО МОДЕРАЦИИ'],
  ['Ode to Joy', 'Neşeye Övgü', 'Ода радости'], ['Twinkle, Twinkle, Little Star', 'Parla Küçük Yıldız', 'Мерцай, мерцай, звёздочка'], ['Für Elise (theme)', 'Für Elise (tema)', 'К Элизе (тема)'], ['Frère Jacques', 'Frère Jacques', 'Брат Жак'],
]);
