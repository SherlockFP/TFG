// CREATURES11 wave 11 - Turkish + Russian strings. Keys are the exact English strings used in creatures11_ai.js DEFS (name / lore / deathText), IDENT hints,
// FIELD_NOTES, the RECOMMENDED FOR YOU sign and the shadowban / captcha toasts. One table of [EN, TR, RU] rows so the languages cannot drift apart.
import { DEFS, HINTS, NOTES } from './creatures11_ai.js';
import { IDS } from './creatures11_core.js';

const A = DEFS[IDS.captcha], B = DEFS[IDS.shadowban], R = DEFS[IDS.recommender];

export const ROWS = [
  [A.name, 'Captcha', 'Капча'],
  [B.name, 'Gölge Yasak', 'Теневой бан'],
  [R.name, 'Öneri Motoru', 'Рекомендатор'],
  [A.deathText, 'Captcha\'ya insan olduğunu kanıtlayamadı.', 'не смог доказать Капче, что он человек.'],
  [B.deathText, 'gölge yasakla sessizliğe gömüldü.', 'был теневым баном отправлен в тишину.'],
  [R.deathText, 'önerilen bir reklama tıkladı.', 'кликнул на рекомендованную рекламу.'],
  [A.lore,
    'Bir kapı aralığına yerleşir ve İNSAN OLDUĞUNU KANITLA der: bölgesine gir ve 5 saniyede 3 doğru kareyi seç. Geçersen 20 sn kenara çekilir; yanlış yaparsan, reddedersen ya da süren biterse sireni tam bir saniye kurulur, sonra patlama yakındaki herkesi sersemletir ve gürültü çevredeki tüm yaratıkları çağırır. Aynı anda yalnızca biriniz cevap verebilir, diğerleri yanından sıvışabilir.',
    'Она встаёт в дверной проём и требует ДОКАЖИ, ЧТО ТЫ ЧЕЛОВЕК: войди в её зону и за 5 секунд выбери 3 нужные плитки. Пройдёшь, и она на 20 с отъедет в сторону; ошибёшься, откажешься или не успеешь, и сирена заводится целую секунду, затем взрыв оглушает всех рядом, а шум зовёт всех существ вокруг. Отвечать может только один из вас, остальные проскользнут мимо.'],
  [B.lore,
    'TEK bir mürettebat üyesini gölge yasaklar: 25 sn boyunca adı, işaretleri, sesi ve sohbeti herkesten kaybolur ve yalnızca onu avlar. Ayak sesi ve el fenerinden bulup dokun: temas yasağı kaldırır. Tokmak düşmeden önce tam bir saniye hazırlanır ve yaratık ölünce yasak da biter.',
    'Он выбирает ОДНОГО члена экипажа и банит его тенью: на 25 с его имя, метки, голос и чат исчезают для всех остальных, пока он охотится только за ним. Найди его по шагам и фонарю и коснись: контакт снимает бан. Молоток падает не раньше чем через секунду, а со смертью существа бан кончается.'],
  [R.lore,
    'Bir sonraki hangi kapıdan gireceğini öğrenir ve arkasında bekler: o kapıda 2 sn önce turkuaz bir SANA ÖZEL ÖNERİ çerçevesi parlar. Kalıbını boz: geri dön, başka kapıdan git ya da eğilip yürü (gizli mod) ve ıskalar. Penceresi vurmadan önce neredeyse bir saniye şişer.',
    'Она узнаёт, в какую дверь ты пойдёшь дальше, и ждёт за ней: за 2 с до появления на этом проходе загорается бирюзовая рамка РЕКОМЕНДУЕМ ВАМ. Сломай шаблон: вернись, выбери другую дверь или иди пригнувшись (режим инкогнито), и она промахнётся. Перед ударом окно разбухает почти секунду.'],
  [HINTS[IDS.captcha], 'Bölgesine gir, 5 sn içinde 3 doğru kareye bas. Aynı anda yalnızca biri cevaplar; geçersen kapı 20 sn açılır.', 'Войди в её зону и за 5 с нажми 3 верные плитки. Отвечает один; пройдёшь, и проход откроется на 20 с.'],
  [HINTS[IDS.shadowban], 'Bir mürettebat üyesini yasaklar (sohbet, ses ve işaretlerden silinir). Yasaklıya dokunarak kaldır; tokmağı yavaştır.', 'Банит одного члена экипажа (он пропадает из чата, голоса и меток). Коснись забаненного, чтобы снять бан; молоток медленный.'],
  [HINTS[IDS.recommender], 'Kapıda turkuaz çerçeve = 2 sn sonra orada olacak. Başka kapı seç, geri dön ya da eğil: ıskalar.', 'Бирюзовая рамка на двери = через 2 с она будет там. Выбери другую дверь, вернись или пригнись, и она промахнётся.'],
  [NOTES[IDS.captcha], 'Kapı aralığından hiç ayrılmaz. Biri cevap verirken diğerleriniz yanından geçer. Yanlış cevap bir sersemletme patlaması ve katı uyandıran bir gürültüye mal olur.', 'Она никогда не покидает проём. Пока один отвечает, остальные проходят мимо. Ошибка стоит оглушающего взрыва и шума, который будит весь этаж.'],
  [NOTES[IDS.shadowban], 'Tek başınayken yasak daha kısa sürer. Ekibine yakın dur: temas yasağı kaldırır ve Gölge Yasak birkaç saniye sönük kalır.', 'В одиночку бан короче. Держись рядом с командой: контакт снимает бан, и Теневой бан несколько секунд обмякает.'],
  [NOTES[IDS.recommender], 'Yalnızca tekrarlanan rotalardan ve alışkanlıklardan (hep düz, hep sola) öğrenir. Eğilmek ona öğrenecek hiçbir şey vermez.', 'Учится только на повторяющихся маршрутах и привычках (всегда прямо, всегда налево). Пригнувшись, ты не даёшь ей ничего для обучения.'],
  ['RECOMMENDED FOR YOU', 'SANA ÖZEL ÖNERİ', 'РЕКОМЕНДУЕМ ВАМ'],
  ['SHADOWBANNED', 'GÖLGE YASAKLI', 'ТЕНЕВОЙ БАН'],
  ['Nobody can see or hear you. Touch a teammate to lift it.', 'Kimse seni göremez ya da duyamaz. Kaldırmak için bir takım arkadaşına dokun.', 'Никто не видит и не слышит тебя. Коснись товарища, чтобы снять бан.'],
  ['You have been shadowbanned!', 'Gölge yasaklandın!', 'Тебя забанили тенью!'],
  ['A crewmate was shadowbanned: name, pings and voice are gone. Find them and touch them.', 'Bir mürettebat üyesi gölge yasaklandı: adı, işaretleri ve sesi yok. Bul ve dokun.', 'Члена экипажа забанили тенью: имя, метки и голос пропали. Найди его и коснись.'],
  ['The ban was lifted.', 'Yasak kaldırıldı.', 'Бан снят.'],
  ['The Shadowban is dead: the ban is void.', 'Gölge Yasak öldü: yasak geçersiz.', 'Теневой бан мёртв: бан недействителен.'],
  ['The ban has run out.', 'Yasağın süresi doldu.', 'Срок бана истёк.'],
  ['VERIFIED. Human enough.', 'DOĞRULANDI. Yeterince insan.', 'ПРОВЕРЕНО. Достаточно человек.'],
  ['ROBOT DETECTED. Get away from it!', 'ROBOT TESPİT EDİLDİ. Ondan uzaklaş!', 'РОБОТ ОБНАРУЖЕН. Уходи от неё!'],
];
export const TR = Object.fromEntries(ROWS.map((r) => [r[0], r[1]]));
export const RU = Object.fromEntries(ROWS.map((r) => [r[0], r[2]]));
