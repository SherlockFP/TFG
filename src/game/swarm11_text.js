// SWARM11 wave 11 - Turkish + Russian strings. Keys are the exact English strings of swarm11_ai.js (DEFS name / lore / deathText, HINTS, NOTES) and swarm11_fx.js (toasts, tags).
// One table of [EN, TR, RU] rows so the three languages cannot drift apart.
import { DEFS, HINTS, NOTES } from './swarm11_ai.js';
import { IDS } from './swarm11_core.js';

const S = DEFS[IDS.scraper], N = DEFS[IDS.nest], R = DEFS[IDS.streamer], M = DEFS[IDS.automod];

export const ROWS = [
  [S.name, 'Kazıyıcı', 'Скрапер'],
  [N.name, 'Kazıyıcı Yuvası', 'Гнездо скраперов'],
  [R.name, 'Yayıncı', 'Стример'],
  [M.name, 'OtoMod', 'АвтоМод'],
  [S.deathText, 'Kazıyıcı sürüsü tarafından yutuldu.', 'был растерзан стаей скраперов.'],
  [R.deathText, 'Yayıncı tarafından iptal edildi.', 'был отменён стримером.'],
  [M.deathText, 'OtoMod tarafından kalıcı olarak silindi.', 'был навсегда удалён АвтоМодом.'],
  [S.lore,
    'Küçük botlardan oluşan bir koloni ortalıkta duran hurdayı parlayan bir yuvaya taşır; yani yerde bıraktığın ganimet kaybolur: izi eve kadar sür. Bir bota vurursan yükünü düşürür. Yuvadan bir şey alırsan ya da yuvayı parçalarsan tüm koloni uyanır; onları sersemlet ya da hurdayla birlikte çık.',
    'Колония маленьких ботов таскает разбросанный хлам в светящееся гнездо, так что оставленная без присмотра добыча пропадает: иди по следу домой. Ударишь бота, и он уронит ношу. Возьмёшь что-то из гнезда или разобьёшь его, и проснётся вся колония, так что оглушай их или уходи с добычей.'],
  [N.lore,
    'Kolonisinin deposu: ne kadar parlak yanarsa o kadar çok şey tutar. Parçala, bonus kazan; ama bir saniyelik alarmdan sonra sürü uyanır.',
    'Тайник колонии: чем ярче он светится, тем больше в нём лежит. Разбей его ради бонуса, но через секунду тревоги проснётся рой.'],
  [R.lore,
    'Asla saldırmaz: YAYINDA olur ve 30 m içindeki sakin her yaratık yaptığı işi bırakıp izlemeye gelir. İzleyici olma. Halka ışığını kır (canının yarısı) ve kaçıp bir daha yayın açmaz; ya da onu kasadan uzağa çek ve o gösteri yaparken ganimet topla.',
    'Никогда не нападает: выходит В ЭФИР, и каждое спокойное существо в радиусе 30 м бросает свои дела и идёт смотреть. Не будь в зрителях. Разбей его кольцевую лампу (половина здоровья), и он убежит и больше не стримит, или уведи его подальше от хранилища и лутай, пока он выступает.'],
  [M.lore,
    'Ekibin geride bıraktıklarını siler: cesetleri, düşürülen eşyaları, tebeşir işaretlerini ve kanı; bu yüzden kurtarma ve saklama zamanlı bir iştir. Bir cesedin yanında çok kalırsan SENİ işaretler: kırmızı lamba silmeye bir saniye kaldığı demektir, uzaklaş. Ona saldırırsan seni yine işaretler.',
    'Удаляет всё, что оставила команда: тела, брошенные предметы, меловые метки и кровь, так что вынос и заначки идут по таймеру. Постоишь рядом с телом слишком долго, и он отметит ТЕБЯ: красная лампа значит, что удаление через секунду, отойди. Нападёшь на него, и он тоже отметит тебя.'],
  [HINTS[IDS.scraper], 'Kırılgan. Vurunca yükünü düşürür. Birini takip etmek yuvaya götürür; yuvadan alırsan hepsi uyanır.', 'Хрупкий. От удара роняет груз. Иди за одним, и он приведёт к гнезду; возьмёшь из гнезда, и проснутся все.'],
  [HINTS[IDS.nest], 'Ne kadar çok tutarsa o kadar parlar. Parçala, bonus al; ama bir saniye sonra sürüyü bekle.', 'Чем больше в нём лежит, тем ярче светится. Разбей ради бонуса, но через секунду жди рой.'],
  [HINTS[IDS.streamer], 'Asla saldırmaz ama yakındaki her şey yayınına gelir. Halka ışığını kır (canının yarısı) ya da onu uzağa çek.', 'Не нападает, но всё вокруг идёт на его стрим. Разбей кольцевую лампу (половина здоровья) или уведи его.'],
  [HINTS[IDS.automod], 'Cesedin yanında oyalanma. Taşıyıp götür ya da kırmızı lamba yanıp sönünce uzaklaş. Düşürülen eşyaları da siler.', 'Не задерживайся у тела. Унеси его или отойди, когда мигает красная лампа. Брошенные предметы он тоже удаляет.'],
  [NOTES[IDS.scraper], 'Sadece ortada duran hurdayı alırlar: çanta ya da gemi güvende. Sersemlemiş bot yükünü olduğu yere bırakır.', 'Берут только валяющийся хлам: сумка и корабль в безопасности. Оглушённый бот роняет груз на месте.'],
  [NOTES[IDS.nest], 'Bir eşya alırsan alarm çalar. Önce botları sersemlet ya da yuvayı parçala ve onlar seni kovalarken yığını kap.', 'Возьмёшь предмет, и прозвучит тревога. Сначала оглуши ботов или разбей гнездо и хватай кучу, пока они гонятся.'],
  [NOTES[IDS.streamer], 'Her 1,5 sn bir halka dalgası çekimin nereye kadar ulaştığını (30 m) gösterir. Sersemletici el bombası yayını yarıda keser.', 'Каждые 1,5 с кольцевая волна показывает радиус притяжения (30 м). Светошумовая граната обрывает стрим.'],
  [NOTES[IDS.automod], 'Yanında durduğun eşyayı ve taşınanları görmezden gelir. Düşürülen eşyalar 8 sn sonra hedeftir.', 'Игнорирует предмет, рядом с которым ты стоишь, и всё, что несут. Брошенные предметы становятся целью через 8 с.'],
  ['FLAGGED', 'İŞARETLENDİ', 'ОТМЕЧЕН'],
  ['LIVE!', 'CANLI!', 'ЭФИР!'],
  ['AutoMod deleted a body. It is gone for good.', 'OtoMod bir cesedi sildi. Bir daha geri gelmez.', 'АвтоМод удалил тело. Оно пропало навсегда.'],
  ['AutoMod deleted: {name}', 'OtoMod sildi: {name}', 'АвтоМод удалил: {name}'],
  ['AutoMod wiped a chalk mark.', 'OtoMod bir tebeşir işaretini sildi.', 'АвтоМод стёр меловую метку.'],
  ['The ring light shattered. It will not stream again.', 'Halka ışığı parçalandı. Bir daha yayın açmayacak.', 'Кольцевая лампа разбита. Больше он стримить не будет.'],
  ['A Streamer went LIVE. Every calm creature within 30 m is coming to watch.', 'Bir Yayıncı CANLIYA geçti. 30 m içindeki her sakin yaratık izlemeye geliyor.', 'Стример вышел в ЭФИР. Каждое спокойное существо в радиусе 30 м идёт смотреть.'],
  ['The nest is smashed: {n} bonus scrap. The swarm is awake.', 'Yuva parçalandı: {n} bonus hurda. Sürü uyandı.', 'Гнездо разбито: {n} бонусного хлама. Рой проснулся.'],
  ['The nest is smashed. The swarm is awake.', 'Yuva parçalandı. Sürü uyandı.', 'Гнездо разбито. Рой проснулся.'],
];
export const TR = Object.fromEntries(ROWS.map((r) => [r[0], r[1]]));
export const RU = Object.fromEntries(ROWS.map((r) => [r[0], r[2]]));
