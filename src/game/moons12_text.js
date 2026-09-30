// MOONS12: every player-facing string of the two wave-12 moons as [en, tr, ru] (English is also the i18n key). Registered once from moons12_core.js.
// A key is either an id (c9_desc) or the English string itself (runtime lines). Voice: the crew is inside the Algorithm's live stream; corporate dark humour, short sentences.
export const TX = {
  // ---- CLOUD-9
  c9_desc: [
    'Rocky islands float above an endless white void. Ruined server kiosks, rope bridges, hover pads. The Algorithm needs three relay dishes turned to face each other. The wind has opinions.',
    'Sonsuz beyaz bir boşluğun üstünde süzülen kayalık adalar. Yıkık sunucu kioskları, ip köprüler, süzülme platformları. Algoritma üç röle çanağının birbirine dönmesini istiyor. Rüzgârın da bir fikri var.',
    'Скалистые острова парят над бескрайней белой пустотой. Разбитые серверные киоски, верёвочные мосты, гравиплощадки. Алгоритму нужно, чтобы три ретрансляционные тарелки смотрели друг на друга. У ветра своё мнение.',
  ],
  c9_hook: [
    'Islands in a white void. Turn three relay dishes to link the uplink: the reward is big, the scrap is not, the wind pushes.',
    'Beyaz boşlukta adalar. Üç röle çanağını çevirip bağlantıyı kur: ödül büyük, hurda az, rüzgâr itiyor.',
    'Острова в белой пустоте. Поверни три тарелки и свяжи аплинк: награда большая, хлама мало, ветер толкает.',
  ],
  c9_goal: ['Align 3 relay dishes', '3 röle çanağını hizala', 'Навести 3 тарелки'],
  c9_need: ['Gusts push: crouch to brace', 'Rüzgâr iter: çömel ve tutun', 'Порывы толкают: присядь'],
  c9_sub: ['Relay {n}: {d} deg to go', 'Röle {n}: {d} derece kaldı', 'Тарелка {n}: осталось {d} град.'],
  c9_scr_head: ['RELAY', 'RÖLE', 'РЕТРАНСЛЯТОР'],
  c9_scr_hold: ['HOLD E: TURN', 'E BASILI TUT: ÇEVİR', 'УДЕРЖИВАЙ E: ПОВОРОТ'],
  c9_say_first: [
    'First relay locked. Two more and the uplink is real. Please do not fall in the meantime. The paperwork is horrible.',
    'İlk röle kilitlendi. İki tane daha ve bağlantı gerçek olacak. Bu arada lütfen düşmeyin. Evrak işi berbat.',
    'Первый ретранслятор захвачен. Ещё два, и аплинк станет реальным. Пожалуйста, не падайте. Бумажной работы будет ужасно много.',
  ],
  c9_say_won: [
    'Uplink established. Viewers can finally see you from above. They liked the small dots.',
    'Bağlantı kuruldu. İzleyiciler sizi sonunda yukarıdan görebiliyor. Küçük noktaları beğendiler.',
    'Аплинк установлен. Зрители наконец видят вас сверху. Им понравились маленькие точки.',
  ],
  'You fell through the clouds. The retrieval drone brings you back.': [
    'You fell through the clouds. The retrieval drone brings you back.',
    'Bulutların arasından düştün. Kurtarma drone\'u seni geri getiriyor.',
    'Ты провалился сквозь облака. Дрон-спасатель возвращает тебя.',
  ],
  'Retrieval fee: -▮{n}': ['Retrieval fee: -▮{n}', 'Kurtarma ücreti: -▮{n}', 'Плата за эвакуацию: -▮{n}'],
  'Hold E: turn the dish': ['Hold E: turn the dish', 'E basılı tut: çanağı çevir', 'Удерживай E: повернуть тарелку'],
  'Uplink online. The Algorithm has signal. Head back to the ship.': [
    'Uplink online. The Algorithm has signal. Head back to the ship.',
    'Bağlantı açık. Algoritmanın sinyali var. Gemiye dön.',
    'Аплинк работает. У Алгоритма есть сигнал. Возвращайтесь на корабль.',
  ],
  'Re-align the relay dishes: {n} / {of}': ['Re-align the relay dishes: {n} / {of}', 'Röle çanaklarını hizala: {n} / {of}', 'Навести тарелки: {n} / {of}'],
  'Hold E at a dish console. The dish turns, and slows down when it is close.': [
    'Hold E at a dish console. The dish turns, and slows down when it is close.',
    'Bir çanak konsolunda E basılı tut. Çanak döner, hedefe yaklaşınca yavaşlar.',
    'Удерживай E у пульта тарелки. Она поворачивается и замедляется у цели.',
  ],
  'GUST INCOMING: crouch to brace': ['GUST INCOMING: crouch to brace', 'RÜZGÂR GELİYOR: tutunmak için çömel', 'ПОРЫВ ВЕТРА: присядь, чтобы устоять'],
  'CLOUD-9 UPLINK': ['CLOUD-9 UPLINK', 'CLOUD-9 BAĞLANTISI', 'АПЛИНК CLOUD-9'],
  '{n} / {of} relays aligned': ['{n} / {of} relays aligned', '{n} / {of} röle hizalandı', '{n} / {of} ретрансляторов наведено'],
  'UPLINK BONUS': ['UPLINK BONUS', 'BAĞLANTI PRİMİ', 'БОНУС ЗА АПЛИНК'],
  'UPLINK ESTABLISHED': ['UPLINK ESTABLISHED', 'BAĞLANTI KURULDU', 'АПЛИНК УСТАНОВЛЕН'],
  'The Algorithm has signal. It is smiling.': ['The Algorithm has signal. It is smiling.', 'Algoritmanın sinyali var. Gülümsüyor.', 'У Алгоритма есть сигнал. Он улыбается.'],
  'Relay {n} aligned: the beam links to the next': [
    'Relay {n} aligned: the beam links to the next', 'Röle {n} hizalandı: ışın bir sonrakine bağlanıyor', 'Ретранслятор {n} наведён: луч связывает со следующим',
  ],
  'RELAYS': ['RELAYS', 'RÖLELER', 'РЕТРАНСЛЯТОРЫ'],
  // ---- DEEP CABLE
  dc_desc: [
    'A seabed under a glass tunnel network. Dead server hulks the size of whales, kelp made of cables. The crew wades slowly and holds its breath; air domes refill you. Three data cores must reach the ship. Carried, they scream.',
    'Cam tünel ağının altında bir deniz tabanı. Balina boyunda ölü sunucu gövdeleri, kablolardan yosunlar. Ekip yavaş yürür, nefes tutar; hava kubbeleri seni doldurur. Üç veri çekirdeği gemiye ulaşmalı. Taşınırken bağırırlar.',
    'Морское дно под сетью стеклянных тоннелей. Мёртвые серверные корпуса размером с кита, водоросли из кабелей. Экипаж медленно бредёт и задерживает дыхание; воздушные купола пополняют запас. Три ядра данных должны попасть на корабль. В руках они кричат.',
  ],
  dc_hook: [
    'Carry three heavy data cores out of dead server hulks. Domes give air and hush the beacon each core pulses while carried.',
    'Ölü sunucu gövdelerinden üç ağır veri çekirdeğini taşı. Kubbeler hava verir ve taşınan her çekirdeğin attığı sinyali bastırır.',
    'Вынеси три тяжёлых ядра данных из мёртвых серверных корпусов. Купола дают воздух и глушат маяк, который ядро подаёт в руках.',
  ],
  dc_goal: ['Deliver 3 data cores', '3 veri çekirdeğini teslim et', 'Доставить 3 ядра данных'],
  dc_need: ['Air meter, slow water, beacon', 'Hava ölçer, ağır su, sinyal', 'Запас воздуха, вода, маяк'],
  dc_item: ['Cold Data Core', 'Soğuk Veri Çekirdeği', 'Холодное ядро данных'],
  dc_item_tip: [
    'Heavy. Two carriers walk it at near-normal speed. Every few seconds it pulses a beacon that calls creatures. Domes shield it.',
    'Ağır. İki kişi neredeyse normal hızda taşır. Birkaç saniyede bir yaratıkları çağıran bir sinyal atar. Kubbeler bunu bastırır.',
    'Тяжёлое. Вдвоём его несут почти с нормальной скоростью. Каждые несколько секунд подаёт маяк, зовущий существ. Купола глушат его.',
  ],
  dc_say_first: [
    'Core received. Cold, heavy, and it will not stop talking. The archive thanks you for your silence.',
    'Çekirdek teslim alındı. Soğuk, ağır ve susmuyor. Arşiv sessizliğiniz için teşekkür ediyor.',
    'Ядро получено. Холодное, тяжёлое и не замолкает. Архив благодарит вас за тишину.',
  ],
  dc_say_pulse: [
    'That core is shouting into the water. Everything hungry down there just heard it. Try a dome.',
    'O çekirdek suya bağırıyor. Aşağıdaki aç ne varsa duydu. Bir kubbeyi dene.',
    'Это ядро кричит в воду. Всё голодное внизу его услышало. Попробуйте купол.',
  ],
  'AIR': ['AIR', 'HAVA', 'ВОЗДУХ'],
  'CORES': ['CORES', 'ÇEKİRDEK', 'ЯДРА'],
  'BEACON': ['BEACON', 'SİNYAL', 'МАЯК'],
  'AIR LOW: find a dome or an intact tunnel': ['AIR LOW: find a dome or an intact tunnel', 'HAVA AZ: bir kubbe ya da sağlam bir tünel bul', 'МАЛО ВОЗДУХА: найди купол или целый тоннель'],
  'Deliver the data cores: {n} / {of}': ['Deliver the data cores: {n} / {of}', 'Veri çekirdeklerini teslim et: {n} / {of}', 'Доставить ядра данных: {n} / {of}'],
  'A carried core pulses a beacon. Domes shield it. Set it down to silence it.': [
    'A carried core pulses a beacon. Domes shield it. Set it down to silence it.',
    'Taşınan çekirdek sinyal atar. Kubbeler bastırır. Yere bırakırsan susar.',
    'Ядро в руках подаёт маяк. Купола его глушат. Поставь его на землю, и оно замолчит.',
  ],
  'Cores sit in the lit bays of the dead hulks. Two carriers walk faster.': [
    'Cores sit in the lit bays of the dead hulks. Two carriers walk faster.',
    'Çekirdekler ölü gövdelerin ışıklı bölmelerinde duruyor. İki taşıyıcı daha hızlı yürür.',
    'Ядра лежат в освещённых отсеках мёртвых корпусов. Вдвоём несут быстрее.',
  ],
  'BEACON PULSE incoming: get into a dome or set the core down': [
    'BEACON PULSE incoming: get into a dome or set the core down', 'SİNYAL GELİYOR: kubbeye gir ya da çekirdeği bırak', 'ИМПУЛЬС МАЯКА: зайди в купол или поставь ядро',
  ],
  'All cores delivered. Head back to the ship.': ['All cores delivered. Head back to the ship.', 'Tüm çekirdekler teslim edildi. Gemiye dön.', 'Все ядра доставлены. Возвращайтесь на корабль.'],
  'DEEP CABLE': ['DEEP CABLE', 'DERİN KABLO', 'ГЛУБОКИЙ КАБЕЛЬ'],
  '{n} / {of} data cores delivered': ['{n} / {of} data cores delivered', '{n} / {of} veri çekirdeği teslim edildi', '{n} / {of} ядер данных доставлено'],
  'ARCHIVE SECURED': ['ARCHIVE SECURED', 'ARŞİV GÜVENDE', 'АРХИВ ЗАЩИЩЁН'],
  'ALL CORES DELIVERED': ['ALL CORES DELIVERED', 'TÜM ÇEKİRDEKLER TESLİM EDİLDİ', 'ВСЕ ЯДРА ДОСТАВЛЕНЫ'],
  'The archive is yours. The Algorithm is pleased.': ['The archive is yours. The Algorithm is pleased.', 'Arşiv artık senin. Algoritma memnun.', 'Архив ваш. Алгоритм доволен.'],
  'Core delivered: {n} / {of}': ['Core delivered: {n} / {of}', 'Çekirdek teslim edildi: {n} / {of}', 'Ядро доставлено: {n} / {of}'],
  'The dome shields the beacon.': ['The dome shields the beacon.', 'Kubbe sinyali bastırıyor.', 'Купол глушит маяк.'],
  'CABLE': ['CABLE', 'KABLO', 'КАБЕЛЬ'],
  'Cloud-9 Sky Isles': ['Cloud-9 Sky Isles', 'Cloud-9 Gök Adaları', 'Небесные острова Cloud-9'],
  'Deep Cable Seabed': ['Deep Cable Seabed', 'Derin Kablo Deniz Tabanı', 'Дно Глубокого кабеля'],
  'Goal pay: ▮{n}': ['Goal pay: ▮{n}', 'Hedef ödemesi: ▮{n}', 'Награда за цель: ▮{n}'],
};
/** EN-keyed TR / RU maps of every TX entry except the painted screens (short words like RELAY must not translate globally) */
export function textMaps() {
  const tr = {}, ru = {};
  for (const [k, v] of Object.entries(TX)) { if (k.includes('_scr_')) continue; tr[v[0]] = v[1]; ru[v[0]] = v[2]; }
  return { tr, ru };
}
const LI = { en: 0, tr: 1, ru: 2 };
/** text for a TX key in a language (canvas text is painted at build time, not through t()) */
export const tx = (key, lang = 'en') => (TX[key] || [key])[LI[lang] ?? 0] || TX[key]?.[0] || key;
