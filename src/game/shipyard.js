// SHIPYARD (wave 3, module 'shipyard'; docs/wave3/shipyard.md, design docs/MASTERPLAN.md section 13).
// The Starter Pod core grows modules: rooms bolted onto hardpoints (world/hardpoints.js) - Cargo Bay, Garage, Engine Room, Hangar, Workshop,
// Med Bay, Lab, Bunk Room, Trophy Hall, Lounge (each Mk I-III) plus the roof Observation Deck (service lift) and Turret Hardpoint. Doorways open in the
// core walls when a module is installed. Bought with credits (terminal SHIPYARD / Frame Console) or built free from SHIP PARTS (Hull Plate, Bulkhead,
// Engine Coil, Hardpoint Bracket: chests, bosses, siege, extraction) fed into the Frame Console. Customisation: hull colours + pattern, interior theme, name plate.
// Every module weighs the hull down: route cost +5 % each (Engine Room cuts it), heavy hulls are loud on touchdown (Threat) and a bigger siege target.
// State: host profile (profile.shipyard, survives fired runs) mirrored into run.sy (generic run sync, so late joiners get it in `welcome`); rules in
// shipyard_core.js (node-tested). Net: request  syact {op,...}  ->  host messages  symsg {k,...}.
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { registerItem, ITEMS, isSellable } from './items.js';
import { CREATURES } from './creatures.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { SHIP_EXTRA, insideShip } from '../world/ship.js';
import { SOCKETS, SOCKET_IDS, CORE_GAPS } from '../world/hardpoints.js';
import { HULL as SIEGE_HULL } from './siege_core.js';
import { CRUISER } from '../entities/cruiser.js';
import { analyzeInfo, unlockBlueprint } from './research.js';
import { BLUEPRINTS } from './recipes.js';
import { applyBuffStats } from './food_data.js';
import * as Y from './shipyard_core.js';
import * as MD from '../models/shipyard.js';
import { createShipyardPanel } from '../ui/panels/shipyard.js';

HOST_ONLY.add('symsg');

// ---------------------------------------------------------------------------------------------- items (registered at import, ids stable)
for (const k of Y.PART_KEYS) {
  const p = Y.PARTS[k];
  if (!ITEMS[p.id]) registerItem({ id: p.id, name: p.name, kind: 'component', component: true, value: p.value, weight: 2, hands: 1, tier: k === 'brk' ? 'epic' : k === 'coil' ? 'rare' : 'uncommon', shipPart: true, tip: p.tip });
}

// ---------------------------------------------------------------------------------------------- text (EN key -> TR / RU)
addTranslations({
  'Cargo Bay': 'Kargo Bölümü',
  'Garage': 'Garaj',
  'Engine Room': 'Makine Dairesi',
  'Hangar': 'Hangar',
  'Workshop': 'Atölye',
  'Med Bay': 'Revir',
  'Lab': 'Laboratuvar',
  'Bunk Room': 'Yatakhane',
  'Trophy Hall': 'Ganimet Salonu',
  'Lounge': 'Dinlenme Salonu',
  'Observation Deck': 'Gözlem Güvertesi',
  'Turret Hardpoint': 'Taret Yuvası',
  'Hull Plate': 'Gövde Plakası',
  'Bulkhead': 'Perde Duvar',
  'Engine Coil': 'Motor Bobini',
  'Hardpoint Bracket': 'Yuva Braketi',
  'Ship part. Feed it to the Frame Console (Shipyard) with other parts to build or upgrade a ship module for free.': 'Gemi parçası. Diğer parçalarla Çerçeve Konsolu\'na (Tersane) ver: gemi modülünü bedavaya kur veya yükselt.',
  'Ship part. Every module needs one (two for Mk III). Feed it to the Frame Console (Shipyard).': 'Gemi parçası. Her modül bir tane ister (Mk III iki). Çerçeve Konsolu\'na (Tersane) ver.',
  'Freight racks and a loading ramp. A broker bonus on everything you sell; Mk III adds the auto value scanner.': 'Yük rafları ve rampa. Sattığın her şeye komisyoncu bonusu; Mk III otomatik değer tarayıcı ekler.',
  'Uplink Van dock and mechanics. The van is winched aboard from farther away and drives faster; Mk III has a tune-up rack.': 'Uplink Van yuvası ve tamirciler. Van daha uzaktan gemiye çekilir ve daha hızlı gider; Mk III ayar rafına sahip.',
  'Big-ship drives. Cancels part of the weight penalty and the landing noise of a heavy hull.': 'Büyük gemi motorları. Ağır gövdenin ağırlık cezasını ve iniş gürültüsünü kısmen siler.',
  'Supply bay behind the rear module. A field locker restocks the crew every landing.': 'Arka modülün ardında ikmal bölümü. Saha dolabı her inişte ekibi yeniden donatır.',
  'Tool wall and a second bench in reach of the workbench. Crafting is faster and luckier.': 'Alet duvarı ve tezgâhın yanında ikinci bir masa. Üretim daha hızlı ve şanslı.',
  'Treatment bed and the Revival Pad: bring a body aboard and pay to bring your crewmate back mid-day.': 'Tedavi yatağı ve Diriltme Pedi: bir cesedi gemiye getir, öderek arkadaşını gün ortasında geri getir.',
  'Sample analyzer. Strange items and creature samples give more parts and a better blueprint chance.': 'Numune analizörü. Garip eşyalar ve yaratık örnekleri daha çok parça ve daha iyi şema şansı verir.',
  'Respawn point for the dead and a Rested buff on every landing.': 'Ölenler için doğma noktası ve her inişte Dinlenmiş etkisi.',
  'Mounted creature heads from your bestiary. Sign the guestbook once a day for a little XP.': 'Yaratık ansiklopedinden duvara asılı kafalar. Günde bir defter imzala, biraz XP kazan.',
  'Couches, a jukebox and a stage. Crew hanging out together relaxes the room; jam sessions here pay more.': 'Koltuklar, müzik kutusu ve sahne. Birlikte takılan ekip ortamı yumuşatır; buradaki jam seansları daha çok öder.',
  'Roof deck with a glass canopy, reached by the service lift. Standing up there sharpens your scan.': 'Cam kubbeli çatı güvertesi, servis asansörüyle çıkılır. Orada durmak taramanı keskinleştirir.',
  'Roof gun that shoots whatever gets near the hull. Mk III has twin barrels.': 'Gövdeye yaklaşan her şeyi vuran çatı silahı. Mk III çift namlulu.',
  'CARGO': 'KARGO',
  'GARAGE': 'GARAJ',
  'ENGINE': 'MOTOR',
  'HANGAR': 'HANGAR',
  'WORKSHOP': 'ATÖLYE',
  'MED BAY': 'REVİR',
  'LAB': 'LAB',
  'BUNKS': 'YATAKLAR',
  'TROPHIES': 'GANİMET',
  'LOUNGE': 'SALON',
  'DECK': 'GÜVERTE',
  'TURRET': 'TARET',
  'SHIPYARD': 'TERSANE',
  'MODULES': 'MODÜLLER',
  'FRAME': 'ÇERÇEVE',
  'HULL': 'GÖVDE',
  'STATUS': 'DURUM',
  'Frame Console [E]': 'Çerçeve Konsolu [E]',
  'Frame Console': 'Çerçeve Konsolu',
  'BUY': 'SATIN AL',
  'BUILD': 'İNŞA ET',
  'UPGRADE': 'YÜKSELT',
  'SELL': 'SAT',
  'MOVE': 'TAŞI',
  'APPLY': 'UYGULA',
  'DEPOSIT HELD PARTS': 'ELDEKİ PARÇALARI VER',
  'Not installed': 'Kurulu değil',
  'Installed': 'Kurulu',
  'Hardpoint': 'Yuva',
  'FREE': 'BOŞ',
  'Mk III (max)': 'Mk III (en üst)',
  'REAR 1': 'ARKA 1',
  'REAR 2': 'ARKA 2',
  'NORTH 1': 'KUZEY 1',
  'NORTH 2': 'KUZEY 2',
  'NORTH 3': 'KUZEY 3',
  'NORTH 4': 'KUZEY 4',
  'ROOF': 'ÇATI',
  'Credits': 'Kredi',
  'Ship parts': 'Gemi parçaları',
  'Cost': 'Maliyet',
  'or free with parts': 'ya da parçalarla bedava',
  'Weight: routes cost {p} more, heavy hull = louder touchdown, bigger siege target.': 'Ağırlık: rotalar {p} pahalı, ağır gövde = gürültülü iniş, daha büyük kuşatma hedefi.',
  'Route cost': 'Rota maliyeti',
  'Touchdown Threat': 'İniş Tehdidi',
  'Modules': 'Modüller',
  'Siege surface': 'Kuşatma yüzeyi',
  'You need to be aboard the ship.': 'Gemide olmalısın.',
  'Stand at the Frame Console to use ship parts.': 'Gemi parçaları için Çerçeve Konsolu\'nun başında dur.',
  'Shipyard work needs the ship in orbit or docked at HQ.': 'Tersane işi için gemi yörüngede veya HQ\'da olmalı.',
  'Not enough credits.': 'Yeterli kredi yok.',
  'Missing ship parts.': 'Gemi parçası eksik.',
  'Unknown module.': 'Bilinmeyen modül.',
  'Already installed.': 'Zaten kurulu.',
  'That module does not fit there.': 'Bu modül oraya uymaz.',
  'That hardpoint is taken.': 'Bu yuva dolu.',
  'Build the module in front of it first.': 'Önce önündeki modülü kur.',
  'Not installed.': 'Kurulu değil.',
  'Already Mk III.': 'Zaten Mk III.',
  'Remove the module behind it first.': 'Önce arkasındaki modülü kaldır.',
  'It is already there.': 'Zaten orada.',
  'Nothing to deposit.': 'Verilecek bir şey yok.',
  'Nothing changed.': 'Hiçbir şey değişmedi.',
  'Slow down.': 'Yavaş ol.',
  'Stand at the treatment bed.': 'Tedavi yatağının başında dur.',
  'Stand on the Revival Pad.': 'Diriltme Pedi\'nin üstünde dur.',
  'Stand at the analyzer.': 'Analizörün başında dur.',
  'Stand at the guestbook.': 'Defterin başında dur.',
  'The bed is still cleaning itself. Wait {s} s.': 'Yatak hâlâ kendini temizliyor. {s} sn bekle.',
  'You feel better. (+{n} HP)': 'Daha iyi hissediyorsun. (+{n} HP)',
  'Place a body on the pad first.': 'Önce pedin üstüne bir ceset koy.',
  'That crewmate is not dead.': 'Bu arkadaş ölü değil.',
  '{name} was revived for ▮{n}.': '{name} ▮{n} karşılığında diriltildi.',
  'You were brought back. The Med Bay sends the bill.': 'Geri getirildin. Revir faturayı gönderiyor.',
  'Hold a strange item or creature sample.': 'Garip bir eşya veya yaratık örneği tut.',
  'Nothing to learn from that.': 'Ondan öğrenecek bir şey yok.',
  'Lab analysis: {n} components recovered.': 'Lab analizi: {n} parça kurtarıldı.',
  'BLUEPRINT!': 'ŞEMA!',
  'Guestbook signed. +{n} XP': 'Defter imzalandı. +{n} XP',
  'You already signed today.': 'Bugün zaten imzaladın.',
  'Cargo scan: {n} items, ▮{v}': 'Kargo taraması: {n} eşya, ▮{v}',
  'Cargo scan: {n} items': 'Kargo taraması: {n} eşya',
  'Cargo scan: ~▮{v} in {n} items': 'Kargo taraması: {n} eşyada ~▮{v}',
  'Good company. The crew relaxes. (Threat -{n})': 'İyi arkadaşlık. Ekip rahatlıyor. (Tehdit -{n})',
  'Rested': 'Dinlenmiş',
  'Overwatch': 'Gözcü',
  '+{hp} max HP, +{sp}% speed, faster stamina. The bunks helped.': '+{hp} maks. CAN, +%{sp} hız, daha hızlı dayanıklılık. Yataklar iyi geldi.',
  'Scan range x{n} while you stand on the deck (and a minute after).': 'Güvertede dururken (ve bir dakika sonrasına kadar) tarama menzili x{n}.',
  'Field locker restocked.': 'Saha dolabı yenilendi.',
  'Ship part recovered': 'Gemi parçası bulundu',
  'Ship part': 'Gemi parçası',
  'Lift up [E]': 'Yukarı çık [E]',
  'Lift down [E]': 'Aşağı in [E]',
  'Service lift': 'Servis asansörü',
  'Treatment bed [E]': 'Tedavi yatağı [E]',
  'Revival Pad [E]': 'Diriltme Pedi [E]',
  'Sample analyzer [E]': 'Numune analizörü [E]',
  'Guestbook [E]': 'Ziyaretçi defteri [E]',
  'Workshop bench [E]': 'Atölye tezgâhı [E]',
  'Battery rack [E]': 'Pil rafı [E]',
  'Cargo manifest [E]': 'Kargo listesi [E]',
  'Drive console [E]': 'Motor konsolu [E]',
  'Charge {name} [E]': '{name} şarj et [E]',
  'Hull weight +{p}, route cost x{m}': 'Gövde ağırlığı +{p}, rota maliyeti x{m}',
  'HULL WEIGHT': 'GÖVDE AĞIRLIĞI',
  'STAR SCANNER': 'YILDIZ TARAYICI',
  'CARGO SCAN': 'KARGO TARAMASI',
  'SAMPLE ANALYZER': 'NUMUNE ANALİZÖRÜ',
  'insert sample': 'numune koy',
  'Broker: +{n}% on everything you sell': 'Komisyoncu: sattığın her şeyde +%{n}',
  '{n} crate slots on the racks': 'Raflarda {n} sandık yeri',
  'Scanner: item count': 'Tarayıcı: eşya sayısı',
  'Scanner: value estimate (+/-10%)': 'Tarayıcı: değer tahmini (+/-%10)',
  'Scanner: exact value + quota progress': 'Tarayıcı: kesin değer + kota ilerlemesi',
  'Van winched aboard from {n} m farther away': 'Van {n} m daha uzaktan gemiye çekilir',
  'Van tune-up: +{n}% engine power': 'Van ayarı: +%{n} motor gücü',
  'Battery rack: recharge held batteries': 'Pil rafı: eldeki pilleri şarj et',
  'Cancels {n}% of the weight penalty and the landing noise': 'Ağırlık cezasının ve iniş gürültüsünün %{n}\'ini siler',
  'Field locker restocks the crew on every landing': 'Saha dolabı her inişte ekibi yeniden donatır',
  'Restock: {list}': 'İkmal: {list}',
  'Crafting time -{n}%': 'Üretim süresi -%{n}',
  'Craft luck +{n}%': 'Üretim şansı +%{n}',
  'Bench in reach of the workbench': 'Tezgâhın yanında ikinci masa',
  'Revival Pad: bring a body aboard, pay ▮{n}': 'Diriltme Pedi: cesedi getir, ▮{n} öde',
  'Treatment bed heals {n}% every {s} s': 'Tedavi yatağı her {s} sn\'de %{n} iyileştirir',
  'Sample analyzer: x{n} components': 'Numune analizörü: x{n} parça',
  '+{n}% chance of a bonus blueprint': '+%{n} bonus şema şansı',
  'Dead crewmates respawn in the bunks': 'Ölen arkadaşlar yataklarda doğar',
  'Rested on every landing: +{hp} max HP, +{sp}% speed ({s} s)': 'Her inişte Dinlenmiş: +{hp} maks. CAN, +%{sp} hız ({s} sn)',
  'Guestbook: +{n} XP per day (cap {c})': 'Defter: günde +{n} XP (tavan {c})',
  'Visitor bonus: more XP when the crew signs together': 'Ziyaretçi bonusu: ekip birlikte imzalarsa daha çok XP',
  '2+ crew in the lounge: Threat -{n} every 20 s': 'Salonda 2+ kişi: her 20 sn\'de Tehdit -{n}',
  'Jam sessions in here pay x{n}': 'Buradaki jam seansları x{n} öder',
  'Stage lights': 'Sahne ışıkları',
  'Scan range x{n} on the deck': 'Güvertede tarama menzili x{n}',
  'Reach it with the service lift on the +z side': 'Ulaşmak için +z tarafındaki servis asansörünü kullan',
  '{d} dmg x {b} barrel(s), {r} shots/s, range {m} m': '{d} hasar x {b} namlu, {r} atış/sn, menzil {m} m',
  'HULL PAINT': 'GÖVDE BOYASI',
  'Primary': 'Ana renk',
  'Secondary': 'İkinci renk',
  'Pattern': 'Desen',
  'Interior theme': 'İç tema',
  'Name plate': 'İsim plakası',
  'Paint job ▮{a}, name plate ▮{b}': 'Boya ▮{a}, isim plakası ▮{b}',
  'Safety Orange': 'Emniyet Turuncusu',
  'Alarm Red': 'Alarm Kırmızısı',
  'Deep Sea': 'Derin Deniz',
  'Sky': 'Gökyüzü',
  'Forest': 'Orman',
  'Lime': 'Misket',
  'Sun': 'Güneş',
  'Violet': 'Mor',
  'Hot Pink': 'Sıcak Pembe',
  'Bone': 'Kemik',
  'Slate': 'Arduvaz',
  'Void': 'Boşluk',
  'Solid': 'Düz',
  'Stripes': 'Çizgili',
  'Hazard': 'Tehlike',
  'Checker': 'Dama',
  'Chevron': 'Ok',
  'Dots': 'Benekli',
  'Steel': 'Çelik',
  'Rust': 'Pas',
  'Clean Room': 'Temiz Oda',
  'Warm': 'Sıcak',
  'Installed: {n}': 'Kurulu: {n}',
  'Ship parts in stock': 'Depodaki gemi parçaları',
  'Carried': 'Taşınan',
  'Feed carried ship parts to the console. Parts are kept for good: fired runs do not take them, nor the modules.': 'Taşıdığın gemi parçalarını konsola ver. Parçalar kalıcıdır: kovulunca ne parçalar ne modüller gider.',
  'Pick a module.': 'Bir modül seç.',
  'Choose a hardpoint': 'Bir yuva seç',
  'Sell (50% back)': 'Sat (%50 geri)',
  'Move (▮{n})': 'Taşı (▮{n})',
  'Tell the crew: the ship is yours. Modules, parts and paint stay with the crew across fired runs.': 'Ekibe söyle: gemi senin. Modüller, parçalar ve boya kovulmalarda da kalır.',
  'SHIPYARD: BUY <module> [hardpoint], UPGRADE <module>, SELL <module>, NAME <text>, LIST': 'SHIPYARD: BUY <modül> [yuva], UPGRADE <modül>, SELL <modül>, NAME <yazı>, LIST',
  'SHIPYARD: build and upgrade ship modules (parts at the Frame Console are free)': 'SHIPYARD: gemi modülleri kur ve yükselt (Çerçeve Konsolu\'ndaki parçalar bedava)',
  'Unknown module. Type SHIPYARD LIST.': 'Bilinmeyen modül. SHIPYARD LIST yaz.',
  'No free hardpoint for that module.': 'Bu modül için boş yuva yok.',
  'Sent to the shipyard.': 'Tersaneye iletildi.',
  'SHIPYARD  ({n} modules, hull weight {w})': 'TERSANE  ({n} modül, gövde ağırlığı {w})',
  'Installed  {name} {mk}  [{sock}]': 'Kurulu  {name} {mk}  [{sock}]',
  'Available  {name}  ▮{cr}  ({socks})': 'Mevcut  {name}  ▮{cr}  ({socks})',
  'Opening the shipyard console...': 'Tersane konsolu açılıyor...',
  '{name} installed: {mk}': '{name} kuruldu: {mk}',
  '{name} upgraded to {mk}': '{name} {mk} seviyesine yükseltildi',
  '{name} removed (+▮{n})': '{name} kaldırıldı (+▮{n})',
  '{name} moved': '{name} taşındı',
  'Ship parts stored: {n}': 'Gemi parçaları depolandı: {n}',
  'The hull is repainted.': 'Gövde yeniden boyandı.',
  'Hold ship parts to deposit them.': 'Vermek için gemi parçası tut.',
  'Mk': 'Mk',
  'Lab analysis': 'Lab analizi',
}, 'tr');
addTranslations({
  'Cargo Bay': 'Грузовой отсек',
  'Garage': 'Гараж',
  'Engine Room': 'Машинное отделение',
  'Hangar': 'Ангар',
  'Workshop': 'Мастерская',
  'Med Bay': 'Медотсек',
  'Lab': 'Лаборатория',
  'Bunk Room': 'Спальный отсек',
  'Trophy Hall': 'Зал трофеев',
  'Lounge': 'Гостиная',
  'Observation Deck': 'Обзорная палуба',
  'Turret Hardpoint': 'Турельная точка',
  'Hull Plate': 'Обшивочная плита',
  'Bulkhead': 'Переборка',
  'Engine Coil': 'Катушка двигателя',
  'Hardpoint Bracket': 'Кронштейн точки',
  'Ship part. Feed it to the Frame Console (Shipyard) with other parts to build or upgrade a ship module for free.': 'Деталь корабля. Отдайте её Консоли каркаса (Верфь) вместе с другими, чтобы бесплатно построить или улучшить модуль.',
  'Ship part. Every module needs one (two for Mk III). Feed it to the Frame Console (Shipyard).': 'Деталь корабля. Нужна каждому модулю (два для Mk III). Отдайте Консоли каркаса (Верфь).',
  'Freight racks and a loading ramp. A broker bonus on everything you sell; Mk III adds the auto value scanner.': 'Грузовые стеллажи и рампа. Бонус брокера на всё, что вы продаёте; Mk III добавляет сканер стоимости.',
  'Uplink Van dock and mechanics. The van is winched aboard from farther away and drives faster; Mk III has a tune-up rack.': 'Док для фургона и механики. Фургон поднимается на борт с большего расстояния и едет быстрее; у Mk III есть стойка тюнинга.',
  'Big-ship drives. Cancels part of the weight penalty and the landing noise of a heavy hull.': 'Двигатели большого корабля. Снимают часть штрафа за вес и шума посадки тяжёлого корпуса.',
  'Supply bay behind the rear module. A field locker restocks the crew every landing.': 'Склад за задним модулем. Полевой шкафчик пополняет запасы экипажа при каждой посадке.',
  'Tool wall and a second bench in reach of the workbench. Crafting is faster and luckier.': 'Стена с инструментами и второй верстак рядом. Крафт быстрее и удачливее.',
  'Treatment bed and the Revival Pad: bring a body aboard and pay to bring your crewmate back mid-day.': 'Кушетка и платформа воскрешения: принесите тело на борт и заплатите, чтобы вернуть напарника посреди дня.',
  'Sample analyzer. Strange items and creature samples give more parts and a better blueprint chance.': 'Анализатор образцов. Странные предметы и образцы дают больше деталей и шанс на чертёж.',
  'Respawn point for the dead and a Rested buff on every landing.': 'Точка возрождения для погибших и бафф «Отдохнувший» при каждой посадке.',
  'Mounted creature heads from your bestiary. Sign the guestbook once a day for a little XP.': 'Головы существ из вашего бестиария. Раз в день распишитесь в книге и получите немного XP.',
  'Couches, a jukebox and a stage. Crew hanging out together relaxes the room; jam sessions here pay more.': 'Диваны, музыкальный автомат и сцена. Совместный отдых снижает напряжение; джемы здесь платят больше.',
  'Roof deck with a glass canopy, reached by the service lift. Standing up there sharpens your scan.': 'Крыша со стеклянным куполом, подъём на служебном лифте. Стоя там, вы сканируете дальше.',
  'Roof gun that shoots whatever gets near the hull. Mk III has twin barrels.': 'Крышевое орудие стреляет по всему, что приблизилось к корпусу. У Mk III двойной ствол.',
  'CARGO': 'ГРУЗ',
  'GARAGE': 'ГАРАЖ',
  'ENGINE': 'ДВИГАТЕЛЬ',
  'HANGAR': 'АНГАР',
  'WORKSHOP': 'МАСТЕРСКАЯ',
  'MED BAY': 'МЕДОТСЕК',
  'LAB': 'ЛАБ',
  'BUNKS': 'КОЙКИ',
  'TROPHIES': 'ТРОФЕИ',
  'LOUNGE': 'ГОСТИНАЯ',
  'DECK': 'ПАЛУБА',
  'TURRET': 'ТУРЕЛЬ',
  'SHIPYARD': 'ВЕРФЬ',
  'MODULES': 'МОДУЛИ',
  'FRAME': 'КАРКАС',
  'HULL': 'КОРПУС',
  'STATUS': 'СТАТУС',
  'Frame Console [E]': 'Консоль каркаса [E]',
  'Frame Console': 'Консоль каркаса',
  'BUY': 'КУПИТЬ',
  'BUILD': 'ПОСТРОИТЬ',
  'UPGRADE': 'УЛУЧШИТЬ',
  'SELL': 'ПРОДАТЬ',
  'MOVE': 'ПЕРЕНЕСТИ',
  'APPLY': 'ПРИМЕНИТЬ',
  'DEPOSIT HELD PARTS': 'СДАТЬ ДЕТАЛИ',
  'Not installed': 'Не установлен',
  'Installed': 'Установлен',
  'Hardpoint': 'Точка',
  'FREE': 'СВОБОДНО',
  'Mk III (max)': 'Mk III (макс)',
  'REAR 1': 'ЗАД 1',
  'REAR 2': 'ЗАД 2',
  'NORTH 1': 'СЕВЕР 1',
  'NORTH 2': 'СЕВЕР 2',
  'NORTH 3': 'СЕВЕР 3',
  'NORTH 4': 'СЕВЕР 4',
  'ROOF': 'КРЫША',
  'Credits': 'Кредиты',
  'Ship parts': 'Детали корабля',
  'Cost': 'Стоимость',
  'or free with parts': 'или бесплатно за детали',
  'Weight: routes cost {p} more, heavy hull = louder touchdown, bigger siege target.': 'Вес: маршруты дороже на {p}, тяжёлый корпус шумнее и легче осаждается.',
  'Route cost': 'Цена маршрута',
  'Touchdown Threat': 'Угроза при посадке',
  'Modules': 'Модули',
  'Siege surface': 'Площадь осады',
  'You need to be aboard the ship.': 'Вы должны быть на борту.',
  'Stand at the Frame Console to use ship parts.': 'Для деталей подойдите к Консоли каркаса.',
  'Shipyard work needs the ship in orbit or docked at HQ.': 'Работы на верфи возможны только на орбите или в штабе.',
  'Not enough credits.': 'Не хватает кредитов.',
  'Missing ship parts.': 'Не хватает деталей.',
  'Unknown module.': 'Неизвестный модуль.',
  'Already installed.': 'Уже установлено.',
  'That module does not fit there.': 'Этот модуль сюда не подходит.',
  'That hardpoint is taken.': 'Точка занята.',
  'Build the module in front of it first.': 'Сначала постройте модуль перед ним.',
  'Not installed.': 'Не установлено.',
  'Already Mk III.': 'Уже Mk III.',
  'Remove the module behind it first.': 'Сначала уберите модуль за ним.',
  'It is already there.': 'Он уже там.',
  'Nothing to deposit.': 'Нечего сдавать.',
  'Nothing changed.': 'Ничего не изменилось.',
  'Slow down.': 'Не так быстро.',
  'Stand at the treatment bed.': 'Подойдите к кушетке.',
  'Stand on the Revival Pad.': 'Встаньте у платформы воскрешения.',
  'Stand at the analyzer.': 'Подойдите к анализатору.',
  'Stand at the guestbook.': 'Подойдите к книге.',
  'The bed is still cleaning itself. Wait {s} s.': 'Кушетка ещё стерилизуется. Подождите {s} с.',
  'You feel better. (+{n} HP)': 'Вам лучше. (+{n} HP)',
  'Place a body on the pad first.': 'Сначала положите тело на платформу.',
  'That crewmate is not dead.': 'Этот напарник не мёртв.',
  '{name} was revived for ▮{n}.': '{name} воскрешён за ▮{n}.',
  'You were brought back. The Med Bay sends the bill.': 'Вас вернули. Медотсек пришлёт счёт.',
  'Hold a strange item or creature sample.': 'Держите странный предмет или образец.',
  'Nothing to learn from that.': 'Из этого ничего не извлечь.',
  'Lab analysis: {n} components recovered.': 'Анализ: получено деталей — {n}.',
  'BLUEPRINT!': 'ЧЕРТЁЖ!',
  'Guestbook signed. +{n} XP': 'Книга подписана. +{n} XP',
  'You already signed today.': 'Сегодня вы уже расписались.',
  'Cargo scan: {n} items, ▮{v}': 'Скан груза: {n} предм., ▮{v}',
  'Cargo scan: {n} items': 'Скан груза: {n} предм.',
  'Cargo scan: ~▮{v} in {n} items': 'Скан груза: ~▮{v} в {n} предм.',
  'Good company. The crew relaxes. (Threat -{n})': 'Хорошая компания. Экипаж расслабляется. (Угроза -{n})',
  'Rested': 'Отдохнувший',
  'Overwatch': 'Дозор',
  '+{hp} max HP, +{sp}% speed, faster stamina. The bunks helped.': '+{hp} макс. HP, +{sp}% скорости, быстрее выносливость. Койки помогли.',
  'Scan range x{n} while you stand on the deck (and a minute after).': 'Дальность скана x{n}, пока вы на палубе (и минуту после).',
  'Field locker restocked.': 'Полевой шкафчик пополнен.',
  'Ship part recovered': 'Найдена деталь корабля',
  'Ship part': 'Деталь корабля',
  'Lift up [E]': 'Подняться [E]',
  'Lift down [E]': 'Спуститься [E]',
  'Service lift': 'Служебный лифт',
  'Treatment bed [E]': 'Кушетка [E]',
  'Revival Pad [E]': 'Платформа воскрешения [E]',
  'Sample analyzer [E]': 'Анализатор образцов [E]',
  'Guestbook [E]': 'Книга гостей [E]',
  'Workshop bench [E]': 'Верстак мастерской [E]',
  'Battery rack [E]': 'Стойка батарей [E]',
  'Cargo manifest [E]': 'Манифест груза [E]',
  'Drive console [E]': 'Консоль двигателей [E]',
  'Charge {name} [E]': 'Зарядить {name} [E]',
  'Hull weight +{p}, route cost x{m}': 'Вес корпуса +{p}, маршрут x{m}',
  'HULL WEIGHT': 'ВЕС КОРПУСА',
  'STAR SCANNER': 'ЗВЁЗДНЫЙ СКАНЕР',
  'CARGO SCAN': 'СКАН ГРУЗА',
  'SAMPLE ANALYZER': 'АНАЛИЗАТОР',
  'insert sample': 'вставьте образец',
  'Broker: +{n}% on everything you sell': 'Брокер: +{n}% ко всему, что вы продаёте',
  '{n} crate slots on the racks': '{n} мест для ящиков на стеллажах',
  'Scanner: item count': 'Сканер: число предметов',
  'Scanner: value estimate (+/-10%)': 'Сканер: оценка стоимости (+/-10%)',
  'Scanner: exact value + quota progress': 'Сканер: точная стоимость и прогресс квоты',
  'Van winched aboard from {n} m farther away': 'Фургон поднимается с расстояния на {n} м дальше',
  'Van tune-up: +{n}% engine power': 'Тюнинг фургона: +{n}% мощности',
  'Battery rack: recharge held batteries': 'Стойка: зарядка батарей в руках',
  'Cancels {n}% of the weight penalty and the landing noise': 'Снимает {n}% штрафа за вес и шума посадки',
  'Field locker restocks the crew on every landing': 'Полевой шкафчик пополняет запасы при каждой посадке',
  'Restock: {list}': 'Пополнение: {list}',
  'Crafting time -{n}%': 'Время крафта -{n}%',
  'Craft luck +{n}%': 'Удача крафта +{n}%',
  'Bench in reach of the workbench': 'Верстак рядом с основным',
  'Revival Pad: bring a body aboard, pay ▮{n}': 'Платформа воскрешения: принесите тело, заплатите ▮{n}',
  'Treatment bed heals {n}% every {s} s': 'Кушетка лечит {n}% раз в {s} с',
  'Sample analyzer: x{n} components': 'Анализатор образцов: x{n} деталей',
  '+{n}% chance of a bonus blueprint': '+{n}% шанс бонусного чертежа',
  'Dead crewmates respawn in the bunks': 'Погибшие возрождаются в койках',
  'Rested on every landing: +{hp} max HP, +{sp}% speed ({s} s)': 'Отдых при посадке: +{hp} макс. HP, +{sp}% скорости ({s} с)',
  'Guestbook: +{n} XP per day (cap {c})': 'Книга: +{n} XP в день (лимит {c})',
  'Visitor bonus: more XP when the crew signs together': 'Бонус гостей: больше XP, если экипаж расписывается вместе',
  '2+ crew in the lounge: Threat -{n} every 20 s': '2+ человека в гостиной: Угроза -{n} каждые 20 с',
  'Jam sessions in here pay x{n}': 'Джемы здесь платят x{n}',
  'Stage lights': 'Сценический свет',
  'Scan range x{n} on the deck': 'Дальность скана x{n} на палубе',
  'Reach it with the service lift on the +z side': 'Подъём на служебном лифте с борта +z',
  '{d} dmg x {b} barrel(s), {r} shots/s, range {m} m': '{d} урона x {b} ств., {r} выстр./с, дальность {m} м',
  'HULL PAINT': 'ПОКРАСКА',
  'Primary': 'Основной цвет',
  'Secondary': 'Второй цвет',
  'Pattern': 'Узор',
  'Interior theme': 'Тема интерьера',
  'Name plate': 'Табличка с названием',
  'Paint job ▮{a}, name plate ▮{b}': 'Покраска ▮{a}, табличка ▮{b}',
  'Safety Orange': 'Оранжевый',
  'Alarm Red': 'Красный',
  'Deep Sea': 'Морской',
  'Sky': 'Небесный',
  'Forest': 'Лесной',
  'Lime': 'Лаймовый',
  'Sun': 'Солнечный',
  'Violet': 'Фиолетовый',
  'Hot Pink': 'Розовый',
  'Bone': 'Костяной',
  'Slate': 'Сланец',
  'Void': 'Бездна',
  'Solid': 'Однотонный',
  'Stripes': 'Полосы',
  'Hazard': 'Опасность',
  'Checker': 'Шашки',
  'Chevron': 'Шеврон',
  'Dots': 'Точки',
  'Steel': 'Сталь',
  'Rust': 'Ржавчина',
  'Clean Room': 'Чистая комната',
  'Warm': 'Тёплый',
  'Installed: {n}': 'Установлено: {n}',
  'Ship parts in stock': 'Деталей на складе',
  'Carried': 'В руках',
  'Feed carried ship parts to the console. Parts are kept for good: fired runs do not take them, nor the modules.': 'Отдайте детали консоли. Они и модули остаются навсегда, даже если вас уволят.',
  'Pick a module.': 'Выберите модуль.',
  'Choose a hardpoint': 'Выберите точку',
  'Sell (50% back)': 'Продать (50% назад)',
  'Move (▮{n})': 'Перенести (▮{n})',
  'Tell the crew: the ship is yours. Modules, parts and paint stay with the crew across fired runs.': 'Корабль ваш. Модули, детали и краска сохраняются даже после увольнения.',
  'SHIPYARD: BUY <module> [hardpoint], UPGRADE <module>, SELL <module>, NAME <text>, LIST': 'SHIPYARD: BUY <модуль> [точка], UPGRADE, SELL, NAME <текст>, LIST',
  'SHIPYARD: build and upgrade ship modules (parts at the Frame Console are free)': 'SHIPYARD: постройка и улучшение модулей (детали у консоли — бесплатно)',
  'Unknown module. Type SHIPYARD LIST.': 'Неизвестный модуль. Введите SHIPYARD LIST.',
  'No free hardpoint for that module.': 'Нет свободной точки для этого модуля.',
  'Sent to the shipyard.': 'Отправлено на верфь.',
  'SHIPYARD  ({n} modules, hull weight {w})': 'ВЕРФЬ  ({n} модулей, вес корпуса {w})',
  'Installed  {name} {mk}  [{sock}]': 'Установлен  {name} {mk}  [{sock}]',
  'Available  {name}  ▮{cr}  ({socks})': 'Доступен  {name}  ▮{cr}  ({socks})',
  'Opening the shipyard console...': 'Открываю консоль верфи...',
  '{name} installed: {mk}': '{name} установлен: {mk}',
  '{name} upgraded to {mk}': '{name} улучшен до {mk}',
  '{name} removed (+▮{n})': '{name} убран (+▮{n})',
  '{name} moved': '{name} перенесён',
  'Ship parts stored: {n}': 'Деталей сдано: {n}',
  'The hull is repainted.': 'Корпус перекрашен.',
  'Hold ship parts to deposit them.': 'Возьмите детали, чтобы сдать.',
  'Mk': 'Mk',
  'Lab analysis': 'Анализ образца',
}, 'ru');

const MK = (n) => 'Mk ' + Y.ROMAN[n];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const BLANK = Y.blankState();
const RESTED_ID = (n) => 'sy_rested' + n, OVER_ID = (n) => 'sy_over' + n;

// ---------------------------------------------------------------------------------------------- install
export function installShipyard(game) {
  const mods = game.mods;
  const offs = [];
  let disposed = false, boundNet = null;
  const host = () => !!game.isHost;
  const now = () => performance.now() / 1000;

  let cur = BLANK;                        // sanitized state every peer renders
  let sig = '', syncT = 0, scrT = 0, trophySig = '';
  const built = new Map();                // socket -> { b, key, cols, lights, group }
  let extraPieces = [];                   // lift, paint overlay: { b, cols, lights }
  let consolePiece = null;
  const lastReq = new Map();
  const healAt = new Map();
  const baseHull = { ...SIEGE_HULL };
  const baseVan = { dockRadius: CRUISER.dockRadius, maxSpeed: CRUISER.maxSpeed, engineForce: CRUISER.engineForce };
  const rest = { t: 0, toast: false };
  const lounge = { t: 0 };
  let turretT = 0, turretCd = 0, turretTarget = null;
  const eff = () => Y.effects(cur);
  if (game.crafting) game.crafting.timeMul = () => eff().craftTimeMul;   // ui/panels/crafting.js scales the CRAFT progress bar with it

  // item models for the ship parts (world drops + inventory icons read the mod registry)
  if (mods?.itemModels) for (const k of Y.PART_KEYS) { const id = Y.PARTS[k].id; if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => MD.createPartModel(k)); }

  // buff defs (the anomaly registry is the one buff system): Rested (Bunk Room) and Overwatch (Observation Deck)
  const DEFS = game.anomaly?.DEFS;
  const injected = [];
  if (DEFS) {
    for (let n = 1; n <= 3; n++) {
      const r = Y.RESTED[n];
      DEFS[RESTED_ID(n)] = { good: true, glyph: 'RST', color: '#8aa8ff', name: 'Rested', desc: tf('+{hp} max HP, +{sp}% speed, faster stamina. The bunks helped.', { hp: r.maxHp, sp: Math.round(r.speed * 100) }), maxHp: r.maxHp, speed: r.speed, stamRegen: r.stamRegen, food: true, dur: 0, stats: (s) => applyBuffStats(r, s) };
      const m = Y.effects({ m: { DECK: { id: 'obs', t: n } } }).scanMul;
      DEFS[OVER_ID(n)] = { good: true, glyph: 'OVR', color: '#7ad8ff', name: 'Overwatch', desc: tf('Scan range x{n} while you stand on the deck (and a minute after).', { n: m }), scan: m, food: true, dur: 0, stats: (s) => applyBuffStats({ scan: m }, s) };
      injected.push(RESTED_ID(n), OVER_ID(n));
    }
  }

  // ------------------------------------------------------------------------------------------ helpers
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos) || null;
  const socketBuilt = (id) => { for (const [sock, e] of built) if (e.b.id === id || (sock === 'DECK' && id === 'obs') || (sock === 'TURRET' && id === 'turret')) return e; return null; };
  const point = (id, name) => socketBuilt(id)?.b.points?.[name] || null;
  const inRoom = (p, sock, m = 0) => { const r = SOCKETS[sock]?.room; return !!p && !!r && p.x > r.x0 - m && p.x < r.x1 + m && p.z > r.z0 - m && p.z < r.z1 + m && p.y > -0.8 && p.y < 4.2; };
  const near = (p, q, r) => !!p && !!q && Math.hypot(p.x - q.x, p.z - q.z) < r && Math.abs(p.y - q.y) < 3.2;
  const name = (id) => t(Y.MODULES[id]?.name || id);
  const sockName = (k) => t(SOCKETS[k]?.label || k);
  const credits = () => game.run?.credits || 0;
  const held = () => { const out = {}; for (const k of Y.PART_KEYS) out[k] = 0; for (const it of game.items.all()) if (it.holder === game.selfId && Y.ITEM_PART[it.type]) out[Y.ITEM_PART[it.type]]++; return out; };
  const trophies = () => {
    const out = [];
    try { for (const [id, e] of Object.entries(game.profile?.bestiary || {})) if ((e?.kills | 0) > 0) out.push({ id, name: t(CREATURES[id]?.name || id), kills: e.kills | 0, hue: (hashStr(id) % 360) / 360 }); } catch { /* profile optional */ }
    return out.sort((a, b) => b.kills - a.kills || (a.id < b.id ? -1 : 1)).slice(0, 12);
  };
  const trophyKey = () => trophies().map((e) => e.id + e.kills).join(',');
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const termPrint = (s, cls) => { try { if (game.terminal?.active) game.terminal.print(s, cls); } catch { /* terminal optional */ } };

  /** effect lines for the UI (one entry per fact) */
  function lines(id, tier) {
    const e = Y.effects({ m: { [Y.MODULES[id].sockets[0]]: { id, t: tier } } });
    switch (id) {
      case 'cargo': return [tf('Broker: +{n}% on everything you sell', { n: Math.round(e.sellBonus * 100) }), tf('{n} crate slots on the racks', { n: e.cargoSlots }), t(['', 'Scanner: item count', 'Scanner: value estimate (+/-10%)', 'Scanner: exact value + quota progress'][tier])];
      case 'garage': return [tf('Van winched aboard from {n} m farther away', { n: e.dockBonus }), tf('Van tune-up: +{n}% engine power', { n: Math.round((e.vanSpeed - 1) * 100) }), t('Battery rack: recharge held batteries')];
      case 'engine': return [tf('Cancels {n}% of the weight penalty and the landing noise', { n: Math.round(e.weightCut * 100) })];
      case 'hangar': return [t('Field locker restocks the crew on every landing'), tf('Restock: {list}', { list: Y.hangarKit(tier).map(([i, n]) => `${n}x ${t(ITEMS[i]?.name || i)}`).join(', ') })];
      case 'workshop': return [tf('Crafting time -{n}%', { n: Math.round((1 - e.craftTimeMul) * 100) }), t('Bench in reach of the workbench')];
      case 'medbay': return [tf('Revival Pad: bring a body aboard, pay ▮{n}', { n: e.reviveCost }), tf('Treatment bed heals {n}% every {s} s', { n: Math.round(e.healFrac * 100), s: e.healCd })];
      case 'lab': return [tf('Sample analyzer: x{n} components', { n: e.labYield }), tf('+{n}% chance of a bonus blueprint', { n: Math.round(e.labBp * 100) })];
      case 'bunk': { const r = Y.RESTED[tier]; return [t('Dead crewmates respawn in the bunks'), tf('Rested on every landing: +{hp} max HP, +{sp}% speed ({s} s)', { hp: r.maxHp, sp: Math.round(r.speed * 100), s: e.restSec })]; }
      case 'trophy': return [tf('Guestbook: +{n} XP per day (cap {c})', { n: e.trophyXp, c: e.trophyCap }), ...(tier >= 3 ? [t('Visitor bonus: more XP when the crew signs together')] : [])];
      case 'lounge': return [tf('2+ crew in the lounge: Threat -{n} every 20 s', { n: e.loungeRelief }), tf('Jam sessions in here pay x{n}', { n: e.jamMul }), ...(tier >= 3 ? [t('Stage lights')] : [])];
      case 'obs': return [tf('Scan range x{n} on the deck', { n: e.scanMul }), t('Reach it with the service lift on the +z side')];
      case 'turret': return [tf('{d} dmg x {b} barrel(s), {r} shots/s, range {m} m', { d: e.turretDmg, b: e.turretBarrels, r: e.turretRate, m: e.turretRange })];
      default: return [];
    }
  }

  // ------------------------------------------------------------------------------------------ world build (every peer)
  const groupOf = () => game.ship?.group || null;
  function addPiece(b, list) {
    const grp = groupOf();
    if (!grp) return null;
    grp.add(b.group);
    const cols = [], lights = [];
    for (const [cx, cy, cz, hx, hy, hz] of b.boxes || []) { try { cols.push(game.physics.addStaticBox(cx, cy, cz, hx, hy, hz, 0, G.STATIC, { kind: 'static' })); } catch { /* physics optional */ } }
    for (const e of b.emitters || []) { try { lights.push(game.lights.add({ pos: e.pos.clone(), color: e.color, intensity: e.intensity, distance: e.distance, group: 'ship' })); } catch { /* lights optional */ } }
    const piece = { b, cols, lights, group: b.group };
    list?.push(piece);
    return piece;
  }
  function removePiece(p) {
    if (!p) return;
    try { p.group.removeFromParent(); } catch { /* */ }
    for (const c of p.cols) { try { game.physics.removeCollider(c); } catch { /* */ } }
    for (const l of p.lights) { try { game.lights.remove(l); } catch { /* */ } }
    try { p.b.dispose?.(); } catch { /* */ }
  }
  const ctxFor = (sock) => ({ paint: cur.paint, theme: cur.theme, name: cur.name, hasChild: SOCKET_IDS.some((k) => SOCKETS[k].parent === sock && cur.m[k]), trophies: trophies() });
  const keyFor = (sock) => { const e = cur.m[sock]; return e ? [e.id, e.t, cur.paint.c1, cur.paint.c2, cur.paint.pat, cur.theme, SOCKET_IDS.some((k) => SOCKETS[k].parent === sock && cur.m[k]) ? 1 : 0, e.id === 'trophy' ? trophyKey() : ''].join('|') : ''; };
  const paintKey = () => [cur.paint.c1, cur.paint.c2, cur.paint.pat, cur.name].join('|');
  const defaultPaint = () => cur.paint.c1 === 'orange' && cur.paint.c2 === 'slate' && cur.paint.pat === 'stripes' && cur.name === Y.DEFAULT_NAME;
  let paintApplied = '';

  function syncWorld() {
    const grp = groupOf();
    if (!grp || disposed) return;
    // frame console (always present)
    if (!consolePiece) { try { const b = MD.buildFrameConsole(); grp.add(b.group); const cols = b.boxes.map((x) => game.physics.addStaticBox(x[0], x[1], x[2], x[3], x[4], x[5], 0, G.STATIC, { kind: 'static' })); consolePiece = { b, cols, lights: [], group: b.group }; } catch (e) { console.warn('[shipyard] console', e); consolePiece = { b: { dispose() {}, point: null }, cols: [], lights: [], group: new THREE.Group() }; } }
    const hp = game.ship?.hardpoints || {};
    let changed = false;
    // paint / theme / name-plate changed: every module exterior is tinted, so rebuild all
    for (const sock of SOCKET_IDS) {
      const want = keyFor(sock), have = built.get(sock)?.key || '';
      if (want === have) continue;
      changed = true;
      const old = built.get(sock); if (old) { removePiece(old); built.delete(sock); }
      const e = cur.m[sock];
      if (!e) continue;
      try {
        const c = ctxFor(sock);
        const b = sock === 'DECK' ? MD.buildDeck(e.t, c) : sock === 'TURRET' ? MD.buildTurret(e.t, c) : MD.buildRoomModule(sock, e.id, e.t, c);
        b.id = e.id;
        const piece = addPiece(b, null);
        if (piece) built.set(sock, { ...piece, key: want });
      } catch (err) { console.warn('[shipyard] build', sock, err); }
    }
    // doorways in the core walls
    for (const [sock, S] of Object.entries(SOCKETS)) if (S.kind === 'core') hp[S.gap]?.setOpen(!!built.get(sock));
    // lift (needs the Observation Deck) + hull paint overlay
    const wantLift = !!built.get('DECK');
    const haveLift = extraPieces.find((p) => p.kind === 'lift');
    if (wantLift && !haveLift) { try { const p = addPiece(MD.buildLift({}), null); if (p) { p.kind = 'lift'; extraPieces.push(p); } } catch (err) { console.warn('[shipyard] lift', err); } }
    if (!wantLift && haveLift) { removePiece(haveLift); extraPieces = extraPieces.filter((p) => p !== haveLift); }
    const wantPaint = defaultPaint() ? '' : paintKey();
    if (wantPaint !== paintApplied) {
      const oldp = extraPieces.find((p) => p.kind === 'paint'); if (oldp) { removePiece(oldp); extraPieces = extraPieces.filter((p) => p !== oldp); }
      if (wantPaint) { try { const pb = MD.buildPaint(cur.paint, cur.name); grp.add(pb.group); extraPieces.push({ kind: 'paint', b: pb, cols: [], lights: [], group: pb.group }); } catch (err) { console.warn('[shipyard] paint', err); } }
      paintApplied = wantPaint;
    }
    if (changed || !SHIP_EXTRA.length !== !Y.aboardVolumes(cur).length) applyGlobals();
    trophySig = trophyKey();
  }
  function applyGlobals() {
    SHIP_EXTRA.length = 0; for (const v of Y.aboardVolumes(cur)) SHIP_EXTRA.push(v);
    Object.assign(SIEGE_HULL, Y.hullBox(cur, baseHull));
    const e = eff();
    CRUISER.dockRadius = baseVan.dockRadius + e.dockBonus; CRUISER.maxSpeed = baseVan.maxSpeed * e.vanSpeed; CRUISER.engineForce = baseVan.engineForce * e.vanSpeed;
  }

  // ------------------------------------------------------------------------------------------ state sync (every peer polls run.sy; host owns it)
  function attach() {
    const p = game.profile;
    p.shipyard = Y.sanitize(p.shipyard);
    game.run.sy = p.shipyard;
    try { game.broadcastRun?.(['sy']); } catch { /* not networked yet */ }
  }
  function commit(extra = []) {
    if (!host()) return;
    game.run.sy = game.profile.shipyard;
    try { game.broadcastRun(['sy', ...extra]); game.progress?.save?.(); } catch (e) { console.warn('[shipyard] commit', e); }
  }
  function pull() {
    const raw = game.run?.sy;
    if (!raw || typeof raw !== 'object') return;             // fired-run reset clears run.sy for a moment: keep what we have
    const s = JSON.stringify(raw);
    if (s === sig) return;
    sig = s;
    cur = Y.sanitize(raw);
    syncWorld();
  }

  // ------------------------------------------------------------------------------------------ requests / host actions
  const req = (op, d = {}) => game.net?.request?.('syact', { op, ...d });
  const reply = (to, o) => { if (to === game.selfId) onMsg(o, game.selfId); else game.net.sendTo(to, 'symsg', o); };
  const err = (to, why) => reply(to, { k: 'err', why });
  const aboard = (id) => { const p = posOf(id); return !!p && insideShip(p); };
  const atConsole = (id) => { const p = posOf(id), c = consolePiece?.b?.point; return !!p && !!c && near(p, c, 4.2); };
  const shipBusy = () => { const ph = game.run?.phase; return !(ph === 'orbit' || ph === 'company'); };
  const xpTo = (to, xp, why) => game.net.broadcast('xp', { to, xp: Math.round(xp), coin: 0, reason: why });
  function spawnParts(list, at) {
    for (const k of list) {
      const id = Y.PARTS[k].id;
      if (!ITEMS[id]) continue;
      game.items.hostSpawn(id, new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.8, at.y, at.z + (Math.random() - 0.5) * 0.8), { linvel: [Math.random() - 0.5, 3.4, Math.random() - 0.5] });
    }
    if (list.length) game.net.broadcast('sys', { text: `${t('Ship part recovered')}: ${list.map((k) => t(Y.PARTS[k].name)).join(', ')}`, kind: 'good' });
  }
  const rollParts = (n, bias) => { const out = []; for (let i = 0; i < n; i++) out.push(Y.rollPart(Math.random, bias)); return out; };

  function hostAct(d, from) {
    if (!host() || disposed || !d || typeof d.op !== 'string') return;
    const tt = now();
    if (tt - (lastReq.get(from) || -9) < 0.2) return err(from, 'Slow down.');
    lastReq.set(from, tt);
    const s = game.profile.shipyard, wallet = { cr: game.run.credits };
    const op = d.op;
    const structural = op === 'install' || op === 'upgrade' || op === 'sell' || op === 'move' || op === 'deckup' || op === 'deckroom';   // [shipdeck]
    if (structural || op === 'paint' || op === 'name') {
      if (!aboard(from)) return err(from, 'You need to be aboard the ship.');
      if (shipBusy()) return err(from, 'Shipyard work needs the ship in orbit or docked at HQ.');
    }
    let r = null, msg = null;
    switch (op) {
      case 'install': {
        const via = d.via === 'parts' ? 'parts' : 'credits';
        if (via === 'parts' && !atConsole(from)) return err(from, 'Stand at the Frame Console to use ship parts.');
        r = Y.tryInstall(s, wallet, String(d.id), String(d.sock), via);
        if (r.ok) msg = { k: 'ok', what: 'install', id: r.id, t: r.t, sock: r.socket, by: from };
        break;
      }
      case 'upgrade': {
        const via = d.via === 'parts' ? 'parts' : 'credits';
        if (via === 'parts' && !atConsole(from)) return err(from, 'Stand at the Frame Console to use ship parts.');
        r = Y.tryUpgrade(s, wallet, String(d.id), via);
        if (r.ok) msg = { k: 'ok', what: 'upgrade', id: r.id, t: r.t, by: from };
        break;
      }
      case 'deckup': {   // [shipdeck] Upper Deck Mk I-III (credits, or ship parts at the Frame Console)
        const via = d.via === 'parts' ? 'parts' : 'credits';
        if (via === 'parts' && !atConsole(from)) return err(from, 'Stand at the Frame Console to use ship parts.');
        r = Y.tryDeckUp(s, wallet, via);
        if (r.ok) msg = { k: 'ok', what: 'deckup', t: r.t, by: from };
        break;
      }
      case 'deckroom': r = Y.tryDeckRoom(s, wallet, d.slot, typeof d.room === 'string' ? d.room : null); if (r.ok) msg = { k: 'ok', what: 'deckroom', room: r.room, by: from }; break;
      case 'sell': r = Y.trySell(s, wallet, String(d.id)); if (r.ok) msg = { k: 'ok', what: 'sell', id: r.id, n: r.refund, by: from }; break;
      case 'move': r = Y.tryMove(s, wallet, String(d.id), String(d.to)); if (r.ok) msg = { k: 'ok', what: 'move', id: r.id, by: from }; break;
      case 'deposit': {
        if (!atConsole(from)) return err(from, 'Stand at the Frame Console to use ship parts.');
        const counts = { plate: 0, bulk: 0, coil: 0, brk: 0 }, used = [];
        for (const it of [...game.items.all()]) if (it.holder === from && Y.ITEM_PART[it.type] && !it._syUsed && used.length < 40) { counts[Y.ITEM_PART[it.type]]++; used.push(it); }
        if (!used.length) return err(from, 'Hold ship parts to deposit them.');
        r = Y.tryDeposit(s, counts);
        if (r.ok) { for (const it of used) { it._syUsed = true; game.net.broadcast('it', { e: 'rm', id: it.id }); } msg = { k: 'ok', what: 'deposit', n: r.n, by: from }; }
        break;
      }
      case 'paint': r = Y.tryPaint(s, wallet, { c1: d.c1, c2: d.c2, pat: d.pat, theme: d.theme, ...(typeof d.name === 'string' ? { name: d.name } : {}) }); if (r.ok) msg = { k: 'ok', what: 'paint', by: from }; break;
      case 'heal': return hostHeal(from);
      case 'revive': return hostRevive(from);
      case 'analyze': return hostAnalyze(d, from);
      case 'guest': return hostGuest(from);
      default: return;
    }
    if (!r || !r.ok) return err(from, r?.why || 'Nothing changed.');
    game.run.credits = wallet.cr;
    commit(['credits']);
    game.net.broadcast('symsg', msg);
    game.net.broadcast('fx', { k: 'snd', s: op === 'sell' ? 'ui_click' : 'ship_land', p: [0, 1.5, 0], v: 0.5 });
  }

  function hostHeal(from) {
    const e = eff(), p = posOf(from), bed = point('medbay', 'bed');
    if (!e.healFrac || !p || !bed || !near(p, bed, 3.2)) return err(from, 'Stand at the treatment bed.');
    const wait = (healAt.get(from) || 0) - now();
    if (wait > 0) return err(from, tf('The bed is still cleaning itself. Wait {s} s.', { s: Math.ceil(wait) }));
    healAt.set(from, now() + e.healCd);
    reply(from, { k: 'heal', frac: e.healFrac });
  }
  function hostRevive(from) {
    const e = eff(), p = posOf(from), pad = point('medbay', 'pad');
    if (!e.reviveCost || !pad || !p || !near(p, pad, 4)) return err(from, 'Stand on the Revival Pad.');
    let body = null;
    for (const it of game.items.all()) {
      if (it.type !== 'body' || it.holder || it.state !== 'world' || it._syUsed) continue;
      if (Math.hypot(it.obj.position.x - pad.x, it.obj.position.z - pad.z) < 1.6 && Math.abs(it.obj.position.y - pad.y) < 2.5) { body = it; break; }
    }
    if (!body) return err(from, 'Place a body on the pad first.');
    const dead = game.aiPlayers().find((q) => q.dead && game.playerName(q.id) === body.label);
    if (!dead) return err(from, 'That crewmate is not dead.');
    if (credits() < e.reviveCost) return err(from, 'Not enough credits.');
    game.run.credits -= e.reviveCost; body._syUsed = true;
    game.net.broadcast('it', { e: 'rm', id: body.id });
    const ds = game.hostData?.dayStats?.deaths;
    if (ds) { const i = ds.findIndex((x) => x.id === dead.id); if (i >= 0) ds.splice(i, 1); }   // no death fine for a revived crewmate
    commit(['credits']);
    reply(dead.id, { k: 'revive' });
    game.net.broadcast('symsg', { k: 'revived', name: body.label, n: e.reviveCost });
    game.net.broadcast('fx', { k: 'snd', s: 'heal', p: [pad.x, pad.y + 1, pad.z], v: 0.8 });
  }
  function hostAnalyze(d, from) {
    const e = eff(), p = posOf(from), an = point('lab', 'analyzer');
    if (!e.labYield || !an || !p || !near(p, an, 3.4)) return err(from, 'Stand at the analyzer.');
    const it = game.items.get(String(d.id));
    if (!it || it.holder !== from || it.soulbound || it._syUsed) return err(from, 'Hold a strange item or creature sample.');
    const info = analyzeInfo(it.type);
    if (!info) return err(from, 'Nothing to learn from that.');
    it._syUsed = true; game.net.broadcast('it', { e: 'rm', id: it.id });
    const known = new Set(Array.isArray(d.bps) ? d.bps : []);
    const base = info.comps?.length ? info.comps : [['comp_crystal', 1]];
    const comps = Y.labYield(base, e);
    comps.push(...Y.labYield([['comp_circuit', 1]], e));
    let bp = info.bp && !known.has(info.bp) ? info.bp : null, bp2 = null;
    if (Math.random() < e.labBp) { const pool = Object.keys(BLUEPRINTS).filter((b) => b !== bp && !known.has(b)); if (pool.length) bp2 = pool[Math.floor(Math.random() * pool.length)]; }
    let k = 0, total = 0;
    for (const [cid, n] of comps) for (let i = 0; i < n; i++) { if (!ITEMS[cid]) continue; game.items.hostSpawn(cid, new THREE.Vector3(an.x + (k % 3) * 0.25 - 0.25, an.y + 0.5 + Math.floor(k / 3) * 0.2, an.z + 0.5), {}); k++; total++; }
    xpTo(from, Math.round((info.xp || 100) * 0.6), 'Lab analysis');
    reply(from, { k: 'lab', n: total, bp, bp2, lore: info.lore });
  }
  function hostGuest(from) {
    const e = eff(), p = posOf(from), bk = point('trophy', 'book');
    if (!e.trophyXp || !bk || !p || !near(p, bk, 3.4)) return err(from, 'Stand at the guestbook.');
    const s = game.profile.shipyard, day = game.run?.day | 0;
    if (s.day[from] === day) return err(from, 'You already signed today.');
    s.day[from] = day;
    let visitors = 1; for (const q of game.aiPlayers()) if (q.id !== from && !q.dead && inRoom(q.pos, socketBuilt('trophy')?.b.sock || 'N1', 1)) visitors++;
    const kinds = Object.values(game.profile.bestiary || {}).filter((x) => (x?.kills | 0) > 0).length;   // (the host's bestiary: shared bragging rights)
    const xp = Y.trophyReward(e, kinds, visitors);
    xpTo(from, xp, 'Trophy Hall');
    commit();
    reply(from, { k: 'guest', xp });
  }

  // ------------------------------------------------------------------------------------------ client messages
  function onMsg(m, from) {
    if (disposed || !m || (from !== game.net?.hostId && !host() && from !== game.selfId)) return;
    switch (m.k) {
      case 'err': toast(t(m.why), 'bad'); termPrint(t(m.why), 'err'); game.audio?.play?.('ui_error', { volume: 0.5, bus: 'ui' }); break;
      case 'ok': {
        if (m.what === 'deckup' || m.what === 'deckroom') {   // [shipdeck]
          const txt = m.what === 'deckup' ? tf('Upper Deck upgraded to {mk}', { mk: MK(m.t) }) : m.room ? tf('Deck room set: {name}', { name: t(Y.DECK_INFO[m.room]?.name || m.room) }) : t('Deck room cleared');
          toast(txt, 'good'); if (m.by === game.selfId) { termPrint(txt); game.audio?.play?.('ui_confirm', { volume: 0.6, bus: 'ui' }); }
          break;
        }
        if (m.by !== game.selfId) { if (m.what === 'install' || m.what === 'upgrade') toast(tf(m.what === 'install' ? '{name} installed: {mk}' : '{name} upgraded to {mk}', { name: name(m.id), mk: MK(m.t) }), 'good'); break; }
        const txt = m.what === 'install' ? tf('{name} installed: {mk}', { name: name(m.id), mk: MK(m.t) }) : m.what === 'upgrade' ? tf('{name} upgraded to {mk}', { name: name(m.id), mk: MK(m.t) })
          : m.what === 'sell' ? tf('{name} removed (+▮{n})', { name: name(m.id), n: m.n }) : m.what === 'move' ? tf('{name} moved', { name: name(m.id) }) : m.what === 'deposit' ? tf('Ship parts stored: {n}', { n: m.n }) : t('The hull is repainted.');
        toast(txt, 'good'); termPrint(txt); game.audio?.play?.('ui_confirm', { volume: 0.6, bus: 'ui' });
        break;
      }
      case 'heal': { const p = game.player; if (p && !p.dead) { const add = Math.round(p.maxHp * m.frac); p.hp = Math.min(p.maxHp, p.hp + add); p.stamina = p.maxStamina; try { game.net.send('pst', { hp: Math.round(p.hp) }); } catch { /* */ } game.engine?.flash?.(0x66ffcc, 0.16); game.audio?.play?.('heal', { volume: 0.6 }); toast(tf('You feel better. (+{n} HP)', { n: add }), 'good'); } break; }
      case 'revive': if (game.player?.dead) { game.respawn(); const pad = point('medbay', 'pad'); if (pad) game.player.teleport(pad.clone().add(new THREE.Vector3(0, 0.1, 0)), Math.PI); toast(t('You were brought back. The Med Bay sends the bill.'), 'good'); } break;
      case 'revived': toast(tf('{name} was revived for ▮{n}.', { name: m.name, n: m.n }), 'good'); break;
      case 'lab': {
        toast(tf('Lab analysis: {n} components recovered.', { n: m.n }), 'good');
        for (const b of [m.bp, m.bp2]) if (b) { try { if (unlockBlueprint(game.profile, b)) { game.progress?.save?.(); game.ui?.hud?.bigText?.(t('BLUEPRINT!'), t(BLUEPRINTS[b]?.name || b)); } } catch { /* profile optional */ } }
        break;
      }
      case 'guest': toast(tf('Guestbook signed. +{n} XP', { n: m.xp }), 'good'); break;
      case 'tur': { const e = socketBuilt('turret'); if (e?.b.state) { const st = e.b.state, mz = e.b.points.muzzle, dx = m.x - mz.x, dz = m.z - mz.z; st.yaw = Math.atan2(dx, dz); st.pitch = Math.atan2(m.y - mz.y, Math.hypot(dx, dz)); st.flash = 1; try { game.audio?.play?.('turret_fire', { pos: mz, volume: 0.35, pitch: 1.3, refDistance: 6, maxDistance: 60 }); } catch { /* audio optional */ } } break; }
      case 'kit': toast(t('Field locker restocked.'), 'good'); break;
      case 'chill': toast(tf('Good company. The crew relaxes. (Threat -{n})', { n: m.n }), 'good'); break;
      default: break;
    }
  }
  // Lounge: jam sessions inside the lounge pay more (the host's 'xp' broadcast for a jam is scaled)
  let patchedNet = null, origBroadcast = null;
  function patchNet(n) {
    if (!n || patchedNet === n || typeof n.broadcast !== 'function') return;
    patchedNet = n; origBroadcast = n.broadcast;
    const mine = function (type, d, ...rest) {
      try {
        if (!disposed && type === 'xp' && d && d.reason === t('Jam session') && d.to) {
          const e = eff(), lg = socketBuilt('lounge');
          if (lg && e.jamMul > 1 && inRoom(posOf(d.to), lg.b.sock, 0.2)) d = { ...d, xp: Math.round((d.xp || 0) * e.jamMul) };
        }
      } catch { /* never break the network path */ }
      return origBroadcast.call(this, type, d, ...rest);
    };
    n.broadcast = mine; patchedNet._syMine = mine;
  }
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:symsg', onMsg); boundNet = net; net.on('msg:symsg', onMsg); patchNet(net); }

  // ------------------------------------------------------------------------------------------ interactables
  function panel(tab) {
    if (!game.ui?.openPanel || typeof document === 'undefined' || disposed) return null;
    if (game.ui.panelOpen && game.ui.panelOpen !== api._panel?.el) return null;
    if (api._panel && game.ui.panelOpen === api._panel.el) { api._panel.setTab?.(tab); return api._panel; }
    const ctl = createShipyardPanel(game.ui, game, api, { tab });
    game.ui.openPanel(ctl.el);
    game.ui.onPanelClose = () => { ctl.dispose(); if (api._panel === ctl) api._panel = null; return false; };
    api._panel = ctl;
    return ctl;
  }
  function manifest() {
    let n = 0, v = 0;
    for (const it of game.items.inShipItems()) { if (!isSellable(it.def) || it.soulbound || it.type === 'body') continue; n++; v += it.value || 0; }
    return { n, v };
  }
  function tp(pos, yaw = 0) { try { game.player.teleport(pos.clone(), yaw); game.psTimer = 0; game.audio?.play?.('ui_confirm', { volume: 0.5, bus: 'ui' }); } catch { /* player optional */ } }
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !game.run) return;
    const p = game.player.pos;
    if (!insideShip(p) && p.distanceTo(new THREE.Vector3(0, 0, 0)) > 22) return;
    const add = (pos, label, action, o = {}) => { if (pos) list.push({ pos: pos.clone(), r: o.r ?? 1.1, reach: o.reach ?? 3.2, label, sub: o.sub, action }); };
    if (consolePiece?.b?.point) add(consolePiece.b.point, t('Frame Console [E]'), () => panel('frame'), { r: 1.2, reach: 3.4, sub: `${Y.PART_KEYS.map((k) => cur.parts[k]).join(' / ')} ${t('Ship parts')}` });
    const e = eff();
    const cg = point('cargo', 'scan'); if (cg) add(cg, t('Cargo manifest [E]'), () => { const m = manifest(); toast(e.scanner >= 3 ? tf('Cargo scan: {n} items, ▮{v}', { n: m.n, v: m.v }) : e.scanner === 2 ? tf('Cargo scan: ~▮{v} in {n} items', { v: Math.round(m.v / 10) * 10, n: m.n }) : tf('Cargo scan: {n} items', { n: m.n }), 'info'); });
    const gr = point('garage', 'rack'); if (gr) { const h = game.player.heldItem?.(); if (h?.battery !== undefined && h?.battery !== null && h.def?.battery) add(gr, tf('Charge {name} [E]', { name: t(h.def.name) }), () => game.net.request('charge', { id: h.id, mul: game.stats?.batteryMul || 1 })); else add(gr, t('Battery rack [E]'), () => toast(t('Battery rack: recharge held batteries'), 'info')); }
    const en = point('engine', 'console'); if (en) add(en, t('Drive console [E]'), () => toast(tf('Hull weight +{p}, route cost x{m}', { p: Y.weightText(cur), m: Y.routeMul(cur).toFixed(2) }), 'info'));
    const wb = point('workshop', 'bench'); if (wb) add(wb, t('Workshop bench [E]'), () => { try { game.crafting?.open?.(); } catch { /* crafting optional */ } });
    const bd = point('medbay', 'bed'); if (bd) add(bd, t('Treatment bed [E]'), () => req('heal'), { sub: e.healCd ? `${Math.max(0, Math.ceil((healAt.get(game.selfId) || 0) - now())) || ''}` : '' });
    const pd = point('medbay', 'pad'); if (pd) add(pd, t('Revival Pad [E]'), () => req('revive'), { r: 1.4, reach: 3.8, sub: `▮${e.reviveCost}` });
    const lb = point('lab', 'analyzer'); if (lb) add(lb, t('Sample analyzer [E]'), () => { const h = game.player.heldItem?.(); if (!h) { toast(t('Hold a strange item or creature sample.'), 'bad'); return; } req('analyze', { id: h.id, bps: Object.keys(game.profile?.blueprints || {}) }); });
    const bk = point('trophy', 'book'); if (bk) add(bk, t('Guestbook [E]'), () => req('guest'));
    const lf = extraPieces.find((q) => q.kind === 'lift')?.b;
    if (lf) {
      add(lf.points.landDown, t('Lift up [E]'), () => tp(lf.points.landTop, Math.PI), { r: 1.4, reach: 3.2, sub: t('Service lift') });
      add(lf.points.up, t('Lift down [E]'), () => tp(lf.points.landDown, Math.PI), { r: 1.4, reach: 3.2, sub: t('Service lift') });
    }
  }));

  // ------------------------------------------------------------------------------------------ per-frame: animation, screens, buffs, host sims
  function screens() {
    const e = eff();
    const cg = built.get(socketOf('cargo'))?.b.screens?.scan;
    if (cg) {
      const m = manifest(), q = game.run?.quota || 0, sold = game.run?.sold || 0;
      cg.redraw((c, w, h) => { c.fillStyle = '#04120a'; c.fillRect(0, 0, w, h); c.fillStyle = '#6dff9a'; c.font = '20px monospace'; c.fillText(t('CARGO SCAN'), 8, 24); c.font = '26px monospace'; c.fillText(`${m.n} ITEMS`, 8, 56); c.fillStyle = '#c8ffd8'; c.font = '22px monospace'; c.fillText(e.scanner >= 3 ? `▮${m.v}` : e.scanner === 2 ? `~▮${Math.round(m.v / 10) * 10}` : '▮ ???', 8, 82); if (e.scanner >= 3 && q) { c.fillStyle = '#ffd23f'; c.font = '16px monospace'; c.fillText(`QUOTA ${Math.min(100, Math.round(((sold + m.v) / q) * 100))}%`, 100, 82); } });
    }
    const en = built.get(socketOf('engine'))?.b.screens?.weight;
    if (en) en.redraw((c, w, h) => { c.fillStyle = '#1a0a02'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff9a3a'; c.font = '18px monospace'; c.fillText(t('HULL WEIGHT'), 8, 22); c.font = '28px monospace'; c.fillText(Y.weightText(cur), 8, 54); c.font = '16px monospace'; c.fillStyle = '#ffd9b8'; c.fillText(`ROUTE x${Y.routeMul(cur).toFixed(2)}  ${Y.count(cur)} MOD`, 8, 74); });
    const dk = built.get('DECK')?.b.screens?.scan;
    if (dk) {
      const run = game.run || {}, thr = game.balance?.level?.().name || '-';
      dk.redraw((c, w, h) => { c.fillStyle = '#02101c'; c.fillRect(0, 0, w, h); c.fillStyle = '#7ad8ff'; c.font = '18px monospace'; c.fillText(t('STAR SCANNER'), 8, 22); c.font = '15px monospace'; c.fillStyle = '#bfe8ff'; c.fillText(`DAY ${run.day || 1}  ${run.daysLeft ?? '-'}d LEFT`, 8, 46); c.fillText(`THREAT ${thr}`, 8, 64); c.fillText(`WX ${(run.weather || 'clear').toUpperCase()}`, 8, 80); });
    }
  }
  const socketOf = (id) => Y.socketOf(cur, id);
  function localBuffs() {
    const b = game.anomaly?.buffs, p = game.player;
    if (!b || !p || p.dead || !cur.m.DECK) return;
    const q = p.pos;
    const onDeck = q.y > 3.5 && ((q.x > -7.3 && q.x < 7.3 && q.z > -3.8 && q.z < 3.8) || (Math.abs(q.x + 2.5) < 1.5 && q.z > 3.6 && q.z < 5.6));
    if (!onDeck) return;
    const id = OVER_ID(cur.m.DECK.t || 1), r = b.get?.(id);
    if (!r || r.until - game.time < 20) b.add(id, 75);
  }
  function hostTick(dt) {
    const run = game.run;
    if (!run) return;
    // loungers: 2+ crew relaxing together for 20 s -> Threat relief
    const lg = socketBuilt('lounge'), e = eff();
    if (lg && e.loungeRelief) {
      const sock = lg.b.sock, ps = game.aiPlayers().filter((q) => !q.dead && inRoom(q.pos, sock, 0.2));
      if (ps.length >= 2) {
        lounge.t += dt;
        if (lounge.t >= 20) {
          lounge.t = 0;
          try { game.balance?.onRelief?.(e.loungeRelief); } catch { /* balance optional */ }
          try { game.anomaly?.addExposure?.(-e.loungeRelief); } catch { /* anomaly optional */ }
          for (const q of ps) reply(q.id, { k: 'chill', n: e.loungeRelief });
        }
      } else lounge.t = Math.max(0, lounge.t - dt * 0.5);
    }
    // roof turret
    const tr = socketBuilt('turret');
    if (tr && e.turret && run.phase === 'moon' && game.creatures?.host) {
      turretT -= dt; turretCd -= dt;
      const mz = tr.b.points.muzzle;
      if (turretT <= 0) {
        turretT = 0.2; turretTarget = null;
        let best = null, bd = e.turretRange;
        for (const c of game.creatures.host.values()) {
          if (c.dead || !c.def || c.def.hazard || c.maxHp === null || c.state === 'hidden' || c.def.noHunt && c.def.siege !== true) continue;
          const dx = c.pos.x - mz.x, dz = c.pos.z - mz.z, dy = c.pos.y - mz.y, d = Math.hypot(dx, dz);
          if (d > bd || Math.abs(dy) > 14) continue;
          bd = d; best = c;
        }
        turretTarget = best ? best.id : null;
      }
      if (turretTarget && turretCd <= 0) {
        const c = game.creatures.host.get(turretTarget);
        if (!c || c.dead) turretTarget = null;
        else {
          turretCd = 1 / e.turretRate;
          const y = c.pos.y + Math.min(c.def?.height || 1, 2) * 0.55;
          game.creatures.damage(c.id, e.turretDmg * e.turretBarrels * (0.9 + Math.random() * 0.2), 'sytur', {});
          game.net.broadcast('symsg', { k: 'tur', x: c.pos.x, y, z: c.pos.z });
        }
      }
    }
  }
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      syncT -= dt;
      if (syncT <= 0) { syncT = 0.35; if (!consolePiece) syncWorld(); pull(); }
      const tt = game.time || 0;
      for (const e of built.values()) for (const fn of e.b.anim || []) fn(dt, tt);
      for (const p of extraPieces) for (const fn of p.b.anim || []) fn(dt, tt);
      scrT -= dt;
      if (scrT <= 0) {
        scrT = 1; screens();
        if (trophyKey() !== trophySig && socketOf('trophy')) syncWorld();   // a new kill mounts a new head
      }
      localBuffs();
      if (host()) hostTick(dt);
    } catch (e) { console.warn('[shipyard] update', e); }
  }));

  // ------------------------------------------------------------------------------------------ phases / hooks (weight, kit, rest, respawn, parts)
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('syact', (d, from) => { try { hostAct(d, from); } catch (e) { console.error('syact', e); err(from, 'Error.'); } }); }));
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('hostStart', (g) => { if (!g || g === game) attach(); }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (host() && ph === 'orbit' && game.run && !game.run.sy) attach();   // after a fired run reset: the profile still owns the ship
    if (ph !== 'moon') return;
    const e = eff();
    // heavy hulls are loud on touchdown (host); the field locker restocks (host); Rested buff (each peer for itself)
    if (host()) {
      const th = Y.landingThreat(cur);
      if (th > 0) try { game.balance?.model?.addSpike?.(th); } catch { /* balance optional */ }
      const sup = point('hangar', 'supply');
      if (sup && e.hangarKit) game.later?.(() => {
        for (const [id, n] of Y.hangarKit(e.hangarKit)) if (ITEMS[id]) for (let i = 0; i < n; i++) game.items.hostSpawn(id, new THREE.Vector3(sup.x + (i % 3) * 0.22 - 0.2, sup.y + 0.3 + Math.floor(i / 3) * 0.15, sup.z + (Math.random() - 0.5) * 0.2), {});
        game.net.broadcast('symsg', { k: 'kit' });
      }, 2500);
    }
    if (e.restSec && game.anomaly?.buffs) setTimeout(() => { if (!disposed && game.run?.phase === 'moon' && !game.player.dead) { game.anomaly.buffs.add(RESTED_ID(Y.tierOf(cur, 'bunk')), e.restSec); const n = Y.tierOf(cur, 'bunk'); toast(`${t('Rested')}! ${DEFS?.[RESTED_ID(n)]?.desc || ''}`, 'good'); } }, 900);
  }));
  // Bunk Room: the dead respawn there
  const origRespawn = game.respawn;
  if (typeof origRespawn === 'function') {
    game.respawn = function (...a) {
      const r = origRespawn.apply(this, a);
      try {
        const b = built.get(socketOf('bunk')), n = b ? 3 : 0;
        if (b && n) { let h = 0; for (const ch of String(this.selfId || 'x')) h = (h * 31 + ch.charCodeAt(0)) | 0; const pt = b.b.points['spawn' + (Math.abs(h) % 3)]; if (pt) this.player.teleport(pt.clone(), Math.PI); }
      } catch { /* bunk optional */ }
      return r;
    };
  }
  // Cargo Bay: sell bonus at the bell (same favor path the role aptitudes use)
  const origSell = game.hostSell;
  if (typeof origSell === 'function') {
    game.hostSell = function (from) {
      const b = disposed ? 0 : eff().sellBonus;
      const run = this.run, had = run && Object.prototype.hasOwnProperty.call(run, 'favor'), f = run?.favor;
      if (b > 0 && run && run.phase === 'company') run.favor = (f || 1) * (1 + b);
      try { return origSell.call(this, from); } finally { if (b > 0 && run && run.phase === 'company') { if (had) run.favor = f; else delete run.favor; } }
    };
  }
  // ship parts: chests, bosses, siege, extraction (host)
  const dropAtShip = (dy = 1.2) => new THREE.Vector3(0.5, dy, 0);
  offs.push(mods.on('tfg:chestOpened', (d) => { if (!host() || disposed || !d?.pos) return; if (Math.random() < Y.chestChance(d.tier)) spawnParts(rollParts(1), new THREE.Vector3(d.pos[0], d.pos[1] + 1.3, d.pos[2])); }));
  const origKilled = game.hostOnCreatureKilled;
  if (typeof origKilled === 'function') {
    game.hostOnCreatureKilled = function (c, by) {
      const r = origKilled.call(this, c, by);
      try { if (!disposed && host() && c?.def?.boss && !c.syDropped) { c.syDropped = true; spawnParts(['coil', ...rollParts(Y.REWARD_PARTS.boss - 1, { coil: 1.6, brk: 2 })], c.pos.clone().add(new THREE.Vector3(0, 0.9, 0))); } } catch { /* drop optional */ }
      return r;
    };
  }
  offs.push(mods.on('tfg:siegeState', (d) => { if (!host() || disposed || d?.phase !== 'done' || d.result !== 'held') return; const fl = !!game.run?.siege?.flawless; spawnParts(rollParts(fl ? Y.REWARD_PARTS.siegeFlawless : Y.REWARD_PARTS.siege, { brk: 1.5 }), new THREE.Vector3(2.6, 1.4, 5.6)); }));
  offs.push(mods.on('tfg:extraction', (d) => { if (!host() || disposed || d?.phase !== 'end' || !d.success) return; spawnParts(rollParts(Y.REWARD_PARTS.extraction), dropAtShip(1.4)); }));

  // ------------------------------------------------------------------------------------------ terminal
  const findMod = (q) => {
    q = String(q || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!q) return null;
    const keys = Y.MODULE_IDS.map((id) => [id, (id + Y.MODULES[id].name).toLowerCase().replace(/[^a-z0-9]/g, '')]);
    return (keys.find(([id, k]) => id === q) || keys.find(([, k]) => k.includes(q)) || [null])[0];
  };
  const findSock = (q) => { q = String(q || '').toUpperCase().replace(/\s/g, ''); return SOCKET_IDS.find((k) => k === q) || null; };
  function status() {
    const out = [tf('SHIPYARD  ({n} modules, hull weight {w})', { n: Y.count(cur), w: Y.weightText(cur) }), ''];
    for (const e of Y.installed(cur)) out.push(tf('Installed  {name} {mk}  [{sock}]', { name: name(e.id), mk: MK(e.t), sock: sockName(e.socket) }));
    for (const id of Y.MODULE_IDS) if (!Y.tierOf(cur, id)) { const f = Y.freeSockets(cur, id); if (f.length) out.push(tf('Available  {name}  ▮{cr}  ({socks})', { name: name(id), cr: Y.creditCost(id, 1), socks: f.map((k) => k).join(' ') })); }
    out.push('', `${t('Ship parts in stock')}: ${Y.PART_KEYS.map((k) => `${cur.parts[k]} ${t(Y.PARTS[k].name)}`).join(', ')}`, t('SHIPYARD: BUY <module> [hardpoint], UPGRADE <module>, SELL <module>, NAME <text>, LIST'));
    return out.join('\n');
  }
  if (mods.api?.registerCommand) {
    mods.api.registerCommand('shipyard', (rest, term) => {
      const w = String(rest[0] || '').toLowerCase();
      if (!w) { term.print(status()); term.print(t('Opening the shipyard console...')); try { term.close(); panel('modules'); } catch { /* panel optional */ } return; }
      if (w === 'list' || w === 'status') { term.print(status()); return; }
      if (w === 'name') { req('paint', { name: rest.slice(1).join(' ') }); term.print(t('Sent to the shipyard.')); return; }
      const id = findMod(rest[1]);
      if (!id) { term.print(t('Unknown module. Type SHIPYARD LIST.'), 'err'); return; }
      if (w === 'buy' || w === 'install') {
        const sock = findSock(rest[2]) || Y.freeSockets(cur, id)[0];
        if (!sock) { term.print(t('No free hardpoint for that module.'), 'err'); return; }
        req('install', { id, sock, via: 'credits' });
      } else if (w === 'upgrade' || w === 'up') req('upgrade', { id, via: 'credits' });
      else if (w === 'sell') req('sell', { id });
      else { term.print(t('SHIPYARD: BUY <module> [hardpoint], UPGRADE <module>, SELL <module>, NAME <text>, LIST'), 'err'); return; }
      term.print(t('Sent to the shipyard.'));
    }, t('SHIPYARD: build and upgrade ship modules (parts at the Frame Console are free)'));
  }

  // ------------------------------------------------------------------------------------------ api
  const api = {
    _panel: null,
    state: () => cur, effects: eff, lines, credits, held, atConsole: () => atConsole(game.selfId), req, open: panel, name, sockName,
    routeFee(moon, freeTravel) {
      if (!moon || moon.company || moon.home || !Y.count(cur)) return freeTravel ? 0 : moon?.cost || 0;
      const mul = Y.routeMul(cur);
      return freeTravel ? Math.round((moon.cost > 0 ? moon.cost : 30) * (mul - 1)) : Math.round((moon.cost || 0) * mul);
    },
    routeMul: () => Y.routeMul(cur),
    weightText: () => Y.weightText(cur),
    core: Y, socketBuilt, built, trophies,
    dispose() {
      if (disposed) return; disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* */ } }
      boundNet?.off?.('msg:symsg', onMsg);
      try { if (patchedNet && patchedNet.broadcast === patchedNet._syMine) patchedNet.broadcast = origBroadcast; } catch { /* someone wrapped us: we are a pass-through now */ }
      for (const e of built.values()) removePiece(e);
      built.clear();
      for (const p of extraPieces) removePiece(p);
      extraPieces = [];
      removePiece(consolePiece); consolePiece = null;
      for (const hp of Object.values(game.ship?.hardpoints || {})) { try { hp.setOpen(false); } catch { /* */ } }
      SHIP_EXTRA.length = 0;
      Object.assign(SIEGE_HULL, baseHull);
      Object.assign(CRUISER, baseVan);
      try { for (const id of injected) delete DEFS[id]; } catch { /* */ }
      try { api._panel?.dispose?.(); } catch { /* */ }
    },
  };
  // first render (a late joiner's run already carries run.sy; the host attaches in hostStart)
  game.later?.(() => pull(), 50);
  return api;
}
