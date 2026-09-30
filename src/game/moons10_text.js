// MOONS10: every player-facing string of the two wave-10 moons as [en, tr, ru] (English is also the i18n key).
// Registered once from moons10_core.js. Voice: the crew is inside the Algorithm's live stream; corporate dark humour, short sentences.
export const TX = {
  // ---- 503-SERVICE UNAVAILABLE (tundra of dead data centers)
  x503_desc: [
    "A frozen tundra of dead data centers. Cooling towers still vent steam, server racks stick out of the drifts and a fallen satellite dish shelters the last technician's hut. Something under the ice still runs the show.",
    'Ölü veri merkezlerinden oluşan donmuş bir tundra. Soğutma kuleleri hâlâ buhar püskürtüyor, sunucu rafları kar yığınlarından fırlıyor ve devrilmiş bir uydu çanağı son teknisyenin kulübesini koruyor. Buzun altında bir şey gösteriyi hâlâ sürdürüyor.',
    'Замёрзшая тундра мёртвых дата-центров. Градирни всё ещё выпускают пар, серверные стойки торчат из сугробов, а упавшая спутниковая тарелка прикрывает хижину последнего техника. Что-то подо льдом всё ещё ведёт шоу.',
  ],
  x503_hook: [
    'Cooling towers still steam over the snow. The service is unavailable. Something under the ice is not.',
    'Soğutma kuleleri karın üzerinde hâlâ buharlaşıyor. Servis kullanılamıyor. Buzun altındaki şey kullanılabilir.',
    'Градирни всё ещё парят над снегом. Сервис недоступен. То, что подо льдом, доступно.',
  ],
  x503_biome: ['Dead Data Tundra', 'Ölü Veri Tundrası', 'Тундра мёртвых данных'],
  // ---- ∞-FEED (dune desert of fallen phone screens)
  feed_desc: [
    'Endless dunes where fallen phone screens stand in the sand like monoliths, some still flickering with a frozen post. A cracked colossus of a phone waits at the horizon. The Worm scrolls underneath. There is always more down.',
    'Düşmüş telefon ekranlarının kumun içinde monolit gibi dikildiği sonsuz kum tepeleri; bazıları hâlâ donmuş bir gönderiyle titriyor. Ufukta çatlak, devasa bir telefon bekliyor. Solucan kumun altında kaydırıyor. Aşağısı hep var.',
    'Бесконечные дюны, где упавшие экраны телефонов стоят в песке, как монолиты, а некоторые ещё мерцают застывшим постом. На горизонте ждёт треснувший исполин-телефон. Под песком листает Червь. Внизу всегда есть ещё.',
  ],
  feed_hook: [
    'Phone-screen monoliths in the dunes, a cracked giant on the horizon. There is always more down.',
    'Kumullarda telefon ekranı monolitleri, ufukta çatlak bir dev. Aşağısı hep var.',
    'Экраны-монолиты в дюнах, треснувший гигант на горизонте. Внизу всегда есть ещё.',
  ],
  feed_biome: ['Infinite Feed Dunes', 'Sonsuz Akış Kumulları', 'Дюны бесконечной ленты'],
  // ---- story beats (the note is read with [E]; the same text is painted on the paper in the world)
  note_btn: ['Read the note [E]', 'Notu oku [E]', 'Прочитать записку [E]'],
  x503_note_title: ['SERVICE LOG', 'SERVİS GÜNLÜĞÜ', 'ЖУРНАЛ СЛУЖБЫ'],
  x503_note_sub: ['Tech 4, last shift', 'Teknisyen 4, son vardiya', 'Техник 4, последняя смена'],
  x503_note: [
    'DAY 41. Restarted the service. 503. Restarted it again. 503. Company support says the fault is on the user side. I am the user side. The heater still works. Do not restart anything. - Tech 4 (reassigned)',
    '41. GÜN. Servisi yeniden başlattım. 503. Tekrar başlattım. 503. Şirket desteği hatanın kullanıcı tarafında olduğunu söylüyor. Kullanıcı benim. Isıtıcı hâlâ çalışıyor. Hiçbir şeyi yeniden başlatma. - Teknisyen 4 (görev değişti)',
    'ДЕНЬ 41. Перезапустил службу. 503. Перезапустил ещё раз. 503. Поддержка Компании говорит, что неисправность на стороне пользователя. Пользователь - я. Обогреватель ещё работает. Ничего не перезапускай. - Техник 4 (переведён)',
  ],
  feed_note_title: ['NOTE, TAPED TO A CHAIR', 'SANDALYEYE YAPIŞTIRILMIŞ NOT', 'ЗАПИСКА, ПРИКЛЕЕННАЯ К СТУЛУ'],
  feed_note_sub: ['J., day 9', 'J., 9. gün', 'Дж., день 9'],
  feed_note: [
    "DAY 9. I only opened it to check the time. It is very good at this. It stopped asking if I'm still watching. Don't scroll down. There is always more down. - J. (still here)",
    "9. GÜN. Sadece saate bakmak için açtım. Bu işte çok iyi. 'Hâlâ izliyor musun?' diye sormayı bıraktı. Aşağı kaydırma. Aşağısı hep var. - J. (hâlâ burada)",
    'ДЕНЬ 9. Я открыл её только посмотреть время. Она в этом очень хороша. Она перестала спрашивать, смотрю ли я ещё. Не листай вниз. Внизу всегда есть ещё. - Дж. (всё ещё здесь)',
  ],
  // ---- painted screens (canvas text; kept short, they are read from a distance)
  scr_503: ['503', '503', '503'],
  scr_503_sub: ['SERVICE UNAVAILABLE', 'SERVİS KULLANILAMIYOR', 'СЛУЖБА НЕДОСТУПНА'],
  scr_retry: ['Retrying in 41 days', '41 gün sonra tekrar denenecek', 'Повтор через 41 день'],
  scr_caught: ["You're all caught up", 'Hepsini gördün', 'Вы всё просмотрели'],
  scr_kidding: ['(just kidding)', '(şaka yaptık)', '(шутка)'],
  scr_loading: ['Loading more...', 'Daha fazla yükleniyor...', 'Загружаем ещё...'],
  scr_rich: ['HOW TO GET RICH IN 10 SEC', '10 SN DE ZENGİN OLMAK', 'КАК РАЗБОГАТЕТЬ ЗА 10 СЕК'],
  scr_part: ['part 1 of 9,000', '9.000 bölümün 1.si', 'часть 1 из 9 000'],
  scr_know: ['Someone you may know', 'Tanıyor olabileceğin biri', 'Возможно, вы знакомы'],
  scr_you: ['YOU', 'SEN', 'ВЫ'],
  scr_morning: ['day 400 of my morning routine', 'sabah rutinimin 400. günü', '400-й день моей утренней рутины'],
  scr_novideo: ['Video unavailable', 'Video kullanılamıyor', 'Видео недоступно'],
  scr_nosignal: ['NO SIGNAL', 'SİNYAL YOK', 'НЕТ СИГНАЛА'],
};
/** EN-keyed TR / RU maps of every TX entry except the painted screens (short words like YOU must not translate globally) */
export function textMaps() {
  const tr = {}, ru = {};
  for (const [k, v] of Object.entries(TX)) { if (k.startsWith('scr_')) continue; tr[v[0]] = v[1]; ru[v[0]] = v[2]; }
  return { tr, ru };
}
const LI = { en: 0, tr: 1, ru: 2 };
/** text for a TX key in a language (canvas text is painted at build time, not through t()) */
export const tx = (key, lang = 'en') => (TX[key] || [key])[LI[lang] ?? 0] || TX[key]?.[0] || key;
