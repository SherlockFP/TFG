// CREATURES12 wave 12 - Turkish + Russian strings. Keys are the exact English strings used in creatures12_ai.js DEFS (name / lore / deathText), IDENT hints,
// FIELD_NOTES and the client texts of creatures12_fx.js. One table of [EN, TR, RU] rows so the languages cannot drift apart.
import { DEFS, HINTS, NOTES } from './creatures12_ai.js';
import { IDS } from './creatures12_core.js';

const N = DEFS[IDS.nf], K = DEFS[IDS.cookie], E = DEFS[IDS.echo], L = DEFS[IDS.lag];

export const ROWS = [
  [N.name, '404', '404'],
  [K.name, 'Çerez', 'Куки'],
  [E.name, 'Yankı Odası', 'Эхо-камера'],
  [L.name, 'Gecikme Sıçraması', 'Лаг-скачок'],
  [N.deathText, '404: BULUNAMADI olarak bitti.', 'закончил как 404: НЕ НАЙДЕНО.'],
  [K.deathText, 'tüm çerezleri kabul etti.', 'принял все куки.'],
  [E.deathText, 'hiç var olmayan bir sesin peşinden gitti.', 'пошёл на звук, которого не было.'],
  [L.deathText, 'gecikmeye kurban gitti.', 'пропал из-за лага.'],
  [N.lore,
    'Onu göremezsin. Göstermek için tara ya da gemi radarına ve drone görüntüsüne bak; el feneri ışını onu yalnızca bir an parazitlendirir. '
    + 'Yavaştır ama asla durmaz ve ekran parazitle dolduğunda, darbe seni yere sermeden önce menzilinden çıkmak için tam bir saniyen var.',
    'Ты его не видишь. Просканируй, чтобы он проявился, или смотри на радар корабля и камеру дрона; луч фонаря лишь на миг заставляет его глючить. '
    + 'Он медленный, но не останавливается, и когда экран заполняет шум, у тебя есть ровно секунда, чтобы выйти из зоны удара, пока он не сбил тебя с ног.'],
  [K.lore,
    'Sırtına sessizce tırmanan bir kırıntı. Orada durduğu sürece tesisteki her yaratık nerede olduğunu bilir ve altı saniye sonra bir İZLEME AÇIK şeridi seni ele verir. '
    + 'Ona kendin ulaşamazsın: bir takım arkadaşı onu çekip almalı (E basılı tut) ya da gemideki terminalde çerezleri temizlersin.',
    'Крошка, которая беззвучно взбирается тебе на спину. Пока она там, каждое существо в комплексе знает, где ты, а через шесть секунд лента ОТСЛЕЖИВАНИЕ ВКЛЮЧЕНО выдаёт тебя. '
    + 'Сам ты её не достанешь: товарищ должен снять её (удерживай E) или ты чистишь куки на терминале корабля.'],
  [E.lore,
    'En büyük odadaki hareketsiz bir organ. Ekibin yüksek sesle yaptıklarını (koşu, düşen hurda, silah sesi, sesler) kaydeder ve uzak bir odada tekrar çalar; yaratıklar ve ekip arkadaşları gidip bakar. '
    + 'Tekrar çalarken zayıf noktası parlar: o zaman vur, fazladan hasar verir. Sessiz yürürsen çalacak bir şeyi olmaz.',
    'Неподвижный орган в самой большой комнате. Он записывает всё громкое, что делает экипаж (бег, падение хлама, выстрелы, голоса), и проигрывает это в дальней комнате, чтобы существа и товарищи шли проверять. '
    + 'Пока он проигрывает, светится его уязвимое место: бей тогда, урон выше. Иди тихо, и ему нечего проигрывать.'],
  [L.lore,
    'Yüzen bozuk bir küp. Bölgesi titreyip kare atlamaya başladığında 6 m\'lik halkadan çık: içeride konumun bir buçuk saniyede bir geri sarar ve adımların gecikmeli gelir. '
    + 'Yaratıklar yavaşlamaz. Vur ya da bekle (12 sn).',
    'Плавающий повреждённый куб. Когда его зона мерцает и кадры прыгают, выйди из кольца в 6 м: внутри твоя позиция откатывается каждые полторы секунды, а шаги приходят с запозданием. '
    + 'Существа не замедляются. Расстреляй его или переждай (12 с).'],
  [HINTS[IDS.nf], 'Görünmez: tarama (orta fare tuşu), drone ya da gemi radarı onu gösterir. Ekranda parazit = yakın; 1 sn\'lik patlamada menzilinden çık.', 'Невидим: его показывают скан (средняя кнопка), дрон и радар корабля. Шум на экране = он рядом; выйди из зоны за 1 с перед ударом.'],
  [HINTS[IDS.cookie], 'Sessizdir. Bir takım arkadaşı sırtından çekip alır (E basılı tut) ya da gemi terminalinde çerezleri temizle. O zamana kadar her yaratık seni duyar.', 'Беззвучна. Товарищ снимает её со спины (удерживай E) или чисти куки на терминале корабля. Пока она там, тебя слышат все существа.'],
  [HINTS[IDS.echo], 'Yakınında sessiz yürü. Zayıf noktası parlıyorsa gürültünü başka yerde çalıyor demektir: o zaman vur ve sese gitme.', 'Рядом ходи тихо. Если светится уязвимое место, он проигрывает твой шум в другом месте: бей его и не иди на звук.'],
  [HINTS[IDS.lag], 'Titreme + kare atlama = 6 m\'lik halkadan çık. İçeride geri sararsın ve girdilerin gecikir. Küpü vur ya da 12 sn bekle.', 'Мерцание и рывки кадров = выйди из кольца в 6 м. Внутри тебя откатывает, а ввод запаздывает. Стреляй в куб или жди 12 с.'],
  [NOTES[IDS.nf], 'El feneri süpürmesi onu yalnızca 0,3 sn parazitlendirir. Tarama darbesi onu 2,5 sn gösterir: çevresinden dolanmak için kullan. Yürüyen bir ekip arkadaşından yavaştır.', 'Взмах фонаря заставляет его глючить лишь 0,3 с. Импульс скана показывает его на 2,5 с: используй это, чтобы обойти. Он медленнее идущего товарища.'],
  [NOTES[IDS.cookie], 'Birbirinize bakın: bir arkadaşın sırtındaki küçük kehribar kırıntı bir çereztir. Kimseye hasar vermez; her şeyi kurbanın üstüne çeker.', 'Проверяйте друг друга: маленькая янтарная крошка на спине товарища это куки. Она никого не ранит, зато притягивает к жертве всё остальное.'],
  [NOTES[IDS.echo], 'Kaseti altı yüksek ses ister. Eğilerek ya da sessiz adımla geçersen boş kalır. Tekrarlar ondan en az 18 m uzakta olur.', 'Для записи нужно шесть громких звуков. Пригнись или иди тихим шагом, и лента пуста. Проигрыш всегда не ближе 18 м от неё.'],
  [NOTES[IDS.lag], 'Yerdeki halka güvenli sınırdır. Bölgenin içinde yaratıklarla dövüşme: geri sarma seni menzillerine geri çeker.', 'Кольцо на полу это граница безопасности. Не дерись с существами внутри зоны: откат затягивает тебя обратно в их досягаемость.'],
  ['404', '404', '404'],
  ['NOT FOUND', 'BULUNAMADI', 'НЕ НАЙДЕНО'],
  ['TRACKING ENABLED', 'İZLEME AÇIK', 'ОТСЛЕЖИВАНИЕ ВКЛЮЧЕНО'],
  ['A cookie is on your back. A teammate can pull it off, or CLEAR COOKIES at the ship terminal.', 'Sırtında bir çerez var. Bir takım arkadaşı çekip alabilir ya da gemi terminalinde ÇEREZLERİ TEMİZLE.', 'У тебя на спине куки. Товарищ может её снять, или ОЧИСТИ КУКИ на терминале корабля.'],
  ['Hold [E]: pull the cookie off {name}', 'Basılı tut [E]: {name} üzerindeki çerezi çek', 'Удерживай [E]: снять куки с {name}'],
  ['a crewmate', 'bir ekip arkadaşı', 'товарища'],
  ['Clearing cookies...', 'Çerezler temizleniyor...', 'Очистка куки...'],
  ['Cookies detected on your back. Type COOKIES CLEAR aboard the ship to remove them.', 'Sırtında çerez tespit edildi. Kaldırmak için gemide COOKIES CLEAR yaz.', 'На спине обнаружены куки. Чтобы убрать, введи COOKIES CLEAR на корабле.'],
  ['No cookies detected. Type COOKIES CLEAR to clear them when you are aboard the ship.', 'Çerez tespit edilmedi. Gemideyken temizlemek için COOKIES CLEAR yaz.', 'Куки не обнаружены. Когда ты на корабле, введи COOKIES CLEAR для очистки.'],
  ['cookies on your back: COOKIES CLEAR removes them (aboard only)', 'sırtındaki çerezler: COOKIES CLEAR kaldırır (yalnızca gemide)', 'куки на спине: COOKIES CLEAR убирает их (только на корабле)'],
  ['LAG {ms} ms', 'GECİKME {ms} ms', 'ЛАГ {ms} мс'],
  ['LAG INCOMING', 'GECİKME GELİYOR', 'ЛАГ ПРИБЛИЖАЕТСЯ'],
  ['PACKET LOSS - leave the ring', 'PAKET KAYBI - halkadan çık', 'ПОТЕРЯ ПАКЕТОВ - выйди из кольца'],
  ['Leave the ring', 'Halkadan çık', 'Выйди из кольца'],
  ['A teammate pulled the cookie off your back.', 'Bir takım arkadaşı çerezi sırtından çekti.', 'Товарищ снял куки с твоей спины.'],
  ['Cookie removed.', 'Çerez çıkarıldı.', 'Куки снята.'],
  ['Cookies cleared: {n}.', 'Temizlenen çerez: {n}.', 'Куки очищено: {n}.'],
  ['You can only clear cookies aboard the ship.', 'Çerezleri yalnızca gemide temizleyebilirsin.', 'Очистить куки можно только на корабле.'],
  ['No cookies on you.', 'Üzerinde çerez yok.', 'На тебе нет куки.'],
];
export const TR = Object.fromEntries(ROWS.map((r) => [r[0], r[1]]));
export const RU = Object.fromEntries(ROWS.map((r) => [r[0], r[2]]));
