// feedcams2 strings (+ the wave-8 pass-2 strings of feedcams.js): [English key, Turkish, Russian]. docs/wave8/feedcams2.md. Side effect: addTranslations.
import { addTranslations } from '../core/i18n.js';

/** day-summary highlight line per moment kind ({name} player, {v} number, {x} extra: item / revived player) */
export const HL_TEXT = {
  down: "The Algorithm's pick: {name} going down live. The clip is already trending.",
  revive: "The Algorithm's pick: {name} dragging {x} back up, on camera. Chat cried.",
  drone: "The Algorithm's pick: {name} shooting a patrol drone out of the night sky.",
  fans: "The Algorithm's pick: {name} got so popular I had to send fans.",
  smash: "The Algorithm's pick: {name} smashing one of my cameras. Signal lost, dignity kept.",
  cut: "The Algorithm's pick: {name} cutting a camera cable. Boring, effective, clipped anyway.",
  show: "The Algorithm's pick: {name} carrying the {x} (▮{v}) right past my lens. Sponsors noticed.",
  juke: "The Algorithm's pick: {name} slipping a camera lock at {v}%. Chat says it was edited.",
  streak: "The Algorithm's pick: {name} live for {v} seconds straight. A natural.",
  live: "The Algorithm's pick: {name} wandering into frame. Low bar, but it is what we have.",
  crack: "The Algorithm's pick: {name} breaking the {x} (▮{v} gone) on camera. Nobody was surprised.",
  catch: "The Algorithm's pick: {name} tossing the {x} across the room and somebody actually catching it. A first.",
};

const ROWS = [
  // feedcams.js (tags, junction boxes, feed splitter)
  ['ON AIR - you are TAGGED until you reach the ship. Kill that camera to clear it.', 'YAYINDASIN - gemiye dönene kadar ETİKETLİSİN. Temizlemek için o kamerayı öldür.', 'В ЭФИРЕ - вы ПОМЕЧЕНЫ до возвращения на корабль. Убейте ту камеру, чтобы снять метку.'],
  ['Tag cleared. The recording is gone.', 'Etiket silindi. Kayıt yok oldu.', 'Метка снята. Запись уничтожена.'],
  ['Cable cut. That camera is dead for today.', 'Kablo kesildi. O kamera bugünlük öldü.', 'Кабель перерезан. Эта камера мертва до конца дня.'],
  ['TAGGED', 'ETİKETLİ', 'ПОМЕЧЕН'],
  ['Camera junction box: cut the cable [E]', 'Kamera bağlantı kutusu: kabloyu kes [E]', 'Распредкоробка камеры: перерезать кабель [E]'],
  ['Kills this camera quietly for the rest of the day.', 'Bu kamerayı gün sonuna kadar sessizce öldürür.', 'Тихо отключает эту камеру до конца дня.'],
  ['That grey box on the wall feeds a camera. Cut its cable and the camera dies quietly.', 'Duvardaki o gri kutu bir kamerayı besliyor. Kablosunu kes, kamera sessizce ölür.', 'Серая коробка на стене питает камеру. Перережьте кабель, и камера тихо умрёт.'],
  ['Somebody is touching my cables. Smile for the cameras.', 'Biri kablolarıma dokunuyor. Kameralara gülümseyin.', 'Кто-то трогает мои кабели. Улыбнитесь в камеру.'],
  ['Hey. That cable was load-bearing.', 'Hey. O kablo taşıyıcıydı.', 'Эй. Это был несущий кабель.'],
  // feedcams2.js
  ['Signal Jammer', 'Sinyal Karıştırıcı', 'Глушилка сигнала'],
  ['LMB: on / off. Cameras and drones within 8 m go blind while it runs. 50 s of battery, it hums (creatures hear it). Charge it at the ship charger.', 'Sol tık: aç / kapa. Çalışırken 8 m içindeki kameralar ve dronlar kör olur. 50 sn pil, uğuldar (yaratıklar duyar). Gemideki şarj cihazında doldur.', 'ЛКМ: вкл / выкл. Камеры и дроны в радиусе 8 м слепнут, пока она работает. 50 с заряда, гудит (существа слышат). Заряжайте на корабельной зарядке.'],
  ['Big scrap. Walk it past one of my cameras and my sponsors tip you Clout. I still take my cut, of course.', 'Büyük hurda. Kameralarımdan birinin önünden geçir, sponsorlarım sana Clout bahşişi versin. Payımı yine alırım tabii.', 'Крупный хлам. Пронесите его мимо моей камеры, и спонсоры дадут вам чаевые в Клауте. Свою долю я, конечно, заберу.'],
  ['Night shift. My drones sweep the entrance with searchlights. Same rules as the cameras: stay out of the light, or shoot them down.', 'Gece vardiyası. Dronlarım girişi projektörle tarıyor. Kameralarla aynı kural: ışığın dışında kal ya da onları vur.', 'Ночная смена. Мои дроны прочёсывают вход прожекторами. Правила те же, что у камер: не попадайте в свет или сбейте их.'],
  ['{name} went down on camera. The viewers went up.', '{name} kamera önünde yere düştü. İzleyici fırladı.', '{name} упал в кадре. Зрители взлетели.'],
  ['Jammer ON', 'Karıştırıcı AÇIK', 'Глушилка ВКЛ'],
  ['Jammer OFF', 'Karıştırıcı KAPALI', 'Глушилка ВЫКЛ'],
  ['{name} showcased the {item} live: sponsors tipped {n} Clout.', '{name}, {item} eşyasını canlı yayında gösterdi: sponsorlar {n} Clout bahşiş verdi.', '{name} показал(а) {item} в эфире: спонсоры дали {n} Клаута.'],
  ['{name} showcased the {item} live. The sponsors are out of budget today.', '{name}, {item} eşyasını canlı yayında gösterdi. Sponsorların bugünlük bütçesi bitti.', '{name} показал(а) {item} в эфире. Бюджет спонсоров на сегодня исчерпан.'],
  ['Drone down. The night feed lost an eye.', 'Dron düştü. Gece yayını bir gözünü kaybetti.', 'Дрон сбит. Ночная трансляция лишилась глаза.'],
  ['Sponsor tip', 'Sponsor bahşişi', 'Чаевые спонсора'],
  ['HIGHLIGHT', 'ÖNE ÇIKAN AN', 'ЛУЧШИЙ МОМЕНТ'],
  [HL_TEXT.down, 'Algoritmanın seçimi: {name} canlı yayında yere yığılıyor. Klip şimdiden trend.', 'Выбор Алгоритма: {name} падает в прямом эфире. Клип уже в трендах.'],
  [HL_TEXT.revive, 'Algoritmanın seçimi: {name}, {x} adlı arkadaşını kamera önünde ayağa kaldırıyor. Sohbet ağladı.', 'Выбор Алгоритма: {name} поднимает {x} на ноги в кадре. Чат плакал.'],
  [HL_TEXT.drone, 'Algoritmanın seçimi: {name} bir devriye dronunu gece gökyüzünden vuruyor.', 'Выбор Алгоритма: {name} сбивает патрульный дрон с ночного неба.'],
  [HL_TEXT.fans, 'Algoritmanın seçimi: {name} o kadar popüler oldu ki hayran göndermek zorunda kaldım.', 'Выбор Алгоритма: {name} стал(а) настолько популярен, что пришлось прислать фанатов.'],
  [HL_TEXT.smash, 'Algoritmanın seçimi: {name} kameralarımdan birini parçalıyor. Sinyal gitti, onur kaldı.', 'Выбор Алгоритма: {name} разбивает одну из моих камер. Сигнал потерян, достоинство сохранено.'],
  [HL_TEXT.cut, 'Algoritmanın seçimi: {name} bir kamera kablosunu kesiyor. Sıkıcı, etkili, yine de kliplendi.', 'Выбор Алгоритма: {name} перерезает кабель камеры. Скучно, эффективно, всё равно в клипе.'],
  [HL_TEXT.show, 'Algoritmanın seçimi: {name}, {x} (▮{v}) ile tam merceğimin önünden geçiyor. Sponsorlar fark etti.', 'Выбор Алгоритма: {name} проносит {x} (▮{v}) прямо мимо моего объектива. Спонсоры заметили.'],
  [HL_TEXT.juke, 'Algoritmanın seçimi: {name} kamera kilidinden %{v} seviyesinde sıyrılıyor. Sohbet montaj diyor.', 'Выбор Алгоритма: {name} уходит от захвата камеры на {v}%. Чат говорит, что это монтаж.'],
  [HL_TEXT.streak, 'Algoritmanın seçimi: {name} tam {v} saniye kesintisiz yayında. Doğuştan yetenek.', 'Выбор Алгоритма: {name} в эфире {v} секунд подряд. Прирождённый талант.'],
  [HL_TEXT.live, 'Algoritmanın seçimi: {name} kadraja dalıyor. Çıta düşük ama elimizdeki bu.', 'Выбор Алгоритма: {name} забредает в кадр. Планка низкая, но что есть.'],
  [HL_TEXT.crack, 'Algoritmanın seçimi: {name}, {x} eşyasını (▮{v} gitti) kamera önünde kırıyor. Kimse şaşırmadı.', 'Выбор Алгоритма: {name} разбивает {x} (▮{v} потеряно) в кадре. Никто не удивился.'],
  [HL_TEXT.catch, 'Algoritmanın seçimi: {name}, {x} eşyasını odanın öbür ucuna fırlatıyor ve biri gerçekten yakalıyor. İlk kez oluyor.', 'Выбор Алгоритма: {name} бросает {x} через всю комнату, и кто-то правда ловит. Впервые.'],
];
const TR = {}, RU = {};
for (const [en, tr, ru] of ROWS) { TR[en] = tr; RU[en] = ru; }
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
export const FC2_KEYS = ROWS.map((r) => r[0]);
