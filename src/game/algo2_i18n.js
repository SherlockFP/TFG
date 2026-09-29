// algo2 strings: English keys + TR + RU tables (docs/wave6/algo2.md) and the fake stream-chat pools (EN / TR / RU, short, dark humour).
import { addTranslations } from '../core/i18n.js';

const TR = {
  'LIVE CHAT': 'CANLI SOHBET',
  'HYPE': 'HYPE',
  'BRONZE': 'BRONZ',
  'SILVER': 'GÜMÜŞ',
  'GOLD': 'ALTIN',
  'Live stream chat feed': 'Canlı yayın sohbet akışı',
  'fake viewers react to your stunts (cosmetic)': 'sahte izleyiciler hareketlerine tepki verir (sadece görsel)',
  'Live stream bonus: {n} Clout': 'Canlı yayın bonusu: {n} Clout',
  'Sponsor drop: a crate is waiting in DAILY [B].': 'Sponsor paketi: bir sandık DAILY [B] içinde seni bekliyor.',
  'The audience loved that. {t} tier: {n} Clout each.': 'İzleyici bayıldı. {t} kademe: kişi başı {n} Clout.',
  'Sponsor drop for the whole crew.': 'Tüm ekip için sponsor paketi.',
  'Ratings are up. Tomorrow needs more show.': 'İzlenme arttı. Yarın daha fazla şov lazım.',
  'That was a spectacular waste of caution. Tomorrow I add something.': 'Muhteşem bir ihtiyatsızlıktı. Yarın bir şey ekleyeceğim.',
  'Step through the glitch [E]': 'Glitch\'in içinden geç [E]',
  'The wall is not there. Every use raises the PATCH meter.': 'Duvar orada değil. Her kullanım YAMA sayacını artırır.',
  'Duplicate {item} [E]': '{item} kopyala [E]',
  'Hold a scrap item to duplicate it (once).': 'Kopyalamak için elinde hurda tut (bir kez).',
  'Duplication shelf': 'Kopyalama rafı',
  'Touch the frozen pixel [E]': 'Donmuş piksele dokun [E]',
  'Freezes creatures nearby for 5 s. Once.': 'Yakındaki yaratıkları 5 sn dondurur. Bir kez.',
  'PATCH {n}%': 'YAMA %{n}',
  'Hold up. A scrap item in hand first.': 'Dur. Önce elinde bir hurda olsun.',
  'Nothing to copy.': 'Kopyalanacak bir şey yok.',
  'The shelf coughs up a copy.': 'Raf bir kopya öksürüyor.',
  'The pixel is dead now.': 'Piksel artık ölü.',
  'PATCH INSTALLED. All glitches removed. Enjoy the consequences.': 'YAMA YÜKLENDİ. Tüm glitch\'ler silindi. Sonuçların tadını çıkarın.',
  'Rebooting the lights. Please hold.': 'Işıklar yeniden başlatılıyor. Lütfen bekleyin.',
  'Compliance swarm dispatched.': 'Uyum ekibi gönderildi.',
  'I saw that. I am patching the building. Do not move.': 'Gördüm. Binayı yamalıyorum. Kıpırdamayın.',
  'GHOST: {name}': 'HAYALET: {name}',
  'Day {n} replay. Something lingers here.': '{n}. gün tekrarı. Burada bir şey kalmış.',
  'A ghost of {name} walks here again. The creatures remember.': '{name} adlı hayalet burada tekrar yürüyor. Yaratıklar hatırlıyor.',
  'dropped loot': 'düşen ganimet',
};
const RU = {
  'LIVE CHAT': 'ЧАТ ЭФИРА',
  'HYPE': 'ХАЙП',
  'BRONZE': 'БРОНЗА',
  'SILVER': 'СЕРЕБРО',
  'GOLD': 'ЗОЛОТО',
  'Live stream chat feed': 'Чат прямого эфира',
  'fake viewers react to your stunts (cosmetic)': 'фейковые зрители реагируют на ваши трюки (косметика)',
  'Live stream bonus: {n} Clout': 'Бонус за эфир: {n} Клаута',
  'Sponsor drop: a crate is waiting in DAILY [B].': 'Дроп от спонсора: ящик ждёт в DAILY [B].',
  'The audience loved that. {t} tier: {n} Clout each.': 'Зрителям понравилось. Уровень {t}: по {n} Клаута каждому.',
  'Sponsor drop for the whole crew.': 'Дроп от спонсора для всей команды.',
  'Ratings are up. Tomorrow needs more show.': 'Рейтинги растут. Завтра нужно больше шоу.',
  'That was a spectacular waste of caution. Tomorrow I add something.': 'Великолепная трата осторожности. Завтра я кое-что добавлю.',
  'Step through the glitch [E]': 'Пройти сквозь глитч [E]',
  'The wall is not there. Every use raises the PATCH meter.': 'Стены здесь нет. Каждое использование поднимает шкалу ПАТЧА.',
  'Duplicate {item} [E]': 'Дублировать {item} [E]',
  'Hold a scrap item to duplicate it (once).': 'Возьмите в руки хлам, чтобы дублировать (один раз).',
  'Duplication shelf': 'Полка дублирования',
  'Touch the frozen pixel [E]': 'Коснуться замороженного пикселя [E]',
  'Freezes creatures nearby for 5 s. Once.': 'Замораживает существ рядом на 5 с. Один раз.',
  'PATCH {n}%': 'ПАТЧ {n}%',
  'Hold up. A scrap item in hand first.': 'Стоп. Сначала возьмите хлам в руки.',
  'Nothing to copy.': 'Нечего копировать.',
  'The shelf coughs up a copy.': 'Полка выплёвывает копию.',
  'The pixel is dead now.': 'Пиксель теперь мёртв.',
  'PATCH INSTALLED. All glitches removed. Enjoy the consequences.': 'ПАТЧ УСТАНОВЛЕН. Все глитчи удалены. Наслаждайтесь последствиями.',
  'Rebooting the lights. Please hold.': 'Перезагрузка света. Пожалуйста, ждите.',
  'Compliance swarm dispatched.': 'Отряд соответствия отправлен.',
  'I saw that. I am patching the building. Do not move.': 'Я это видел. Патчу здание. Не двигайтесь.',
  'GHOST: {name}': 'ПРИЗРАК: {name}',
  'Day {n} replay. Something lingers here.': 'Повтор дня {n}. Здесь что-то задержалось.',
  'A ghost of {name} walks here again. The creatures remember.': 'Призрак {name} снова бродит здесь. Существа помнят.',
  'dropped loot': 'выпавшая добыча',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

/** fake chat handles (never real players) */
export const HANDLES = ['xX_Ghoul_Xx', 'quota_enjoyer', 'mom_is_watching', 'HRbot_3', 'notaMimic', 'ligma_intern', 'kefalfan_99', 'sponsor_bot', 'deadchannel', 'cursed_coupon', 'ratio_king', 'gigaboss', 'mod_of_doom', 'Viewer4471', 'clip_that', 'afk_forever'];

/** chat lines per event kind and language; short on purpose (the panel is a small corner strip) */
export const CHAT = {
  escape: {
    en: ['1 HP GANG RISE UP', 'he should be dead. nobody tell him', 'clip it CLIP IT', 'my heart. my actual heart'],
    tr: ['1 CAN ÇETESİ AYAKTA', 'ölmesi lazımdı, kimse söylemesin', 'klip al KLİP AL', 'kalbim. gerçek kalbim'],
    ru: ['БАНДА 1 ХП НА МЕСТЕ', 'он должен был умереть, не говорите ему', 'КЛИПАЙ КЛИПАЙ', 'моё сердце. настоящее'],
  },
  dodge: {
    en: ['he read the laser LMAO', 'DODGED. the gunner is crying', 'sidestep of the century', 'aimbot? no. skill issue (theirs)'],
    tr: ['lazeri okudu LMAO', 'KAÇTI. silahşör ağlıyor', 'yılın yan adımı', 'aimbot mu? hayır. onların skill sorunu'],
    ru: ['он прочитал лазер ЛМАО', 'УВЕРНУЛСЯ. стрелок плачет', 'шаг в сторону века', 'аимбот? нет. скилл ишью (их)'],
  },
  door_shut: {
    en: ['DOOR SLAM. peak cinema', 'the door is the real MVP', 'shut it shut it SHUT IT', 'it hit the door face first lol'],
    tr: ['KAPI ÇARPTI. zirve sinema', 'gerçek MVP kapı', 'kapat kapat KAPAT', 'kapıya suratıyla çarptı lol'],
    ru: ['ХЛОП ДВЕРЬЮ. пик кино', 'дверь тут MVP', 'закрывай закрывай ЗАКРЫВАЙ', 'он мордой в дверь, лол'],
  },
  boss_hit: {
    en: ['he hit the boss?? with THAT??', 'boss health bar: concerned', 'brave or stupid. subscribe either way', 'unpaid bravery detected'],
    tr: ['bosa vurdu?? ONUNLA??', 'boss can barı: endişeli', 'cesur ya da aptal. abone ol yine de', 'ücretsiz cesaret tespit edildi'],
    ru: ['он ударил босса?? ЭТИМ??', 'полоска босса: обеспокоена', 'смелый или тупой. подпишись в любом случае', 'обнаружена бесплатная храбрость'],
  },
  closet: {
    en: ['NOT THE CLOSET', 'who knocks on a fake closet. who', 'the closet knocked back', 'this is why we watch'],
    tr: ['DOLABA DEĞİL', 'sahte dolaba kim vurur. kim', 'dolap geri vurdu', 'bu yüzden izliyoruz'],
    ru: ['ТОЛЬКО НЕ ШКАФ', 'кто стучит в фальшивый шкаф. кто', 'шкаф постучал в ответ', 'вот поэтому мы смотрим'],
  },
  late_extract: {
    en: ['9 SECONDS LEFT WHAT', 'the ship door closes on my hopes', 'cardiac arrest speedrun', 'extraction any% (clutch)'],
    tr: ['9 SANİYE KALDI NE', 'gemi kapısı umutlarımı kapattı', 'kalp krizi speedrun\'ı', 'tahliye any% (clutch)'],
    ru: ['ОСТАЛОСЬ 9 СЕКУНД ЧТО', 'дверь корабля закрывается на моих надеждах', 'спидран инфаркта', 'эвакуация any% (клатч)'],
  },
  sprint_away: {
    en: ['RUN FOREST RUN', 'cardio is content', 'nice pace. for a snack', 'the creature has stamina too, just saying'],
    tr: ['KOŞ FOREST KOŞ', 'kardiyo içeriktir', 'güzel tempo. atıştırmalık için', 'yaratığın da dayanıklılığı var, sadece diyorum'],
    ru: ['БЕГИ ФОРРЕСТ БЕГИ', 'кардио это контент', 'хороший темп. для закуски', 'у существа тоже есть выносливость'],
  },
  glitch: {
    en: ['is that ALLOWED', 'bug abuse arc. devs in shambles', 'the wall just... let him in', 'exploit gang'],
    tr: ['bu YASAL mı', 'bug istismarı bölümü. geliştiriciler perişan', 'duvar onu öylece... içeri aldı', 'exploit çetesi'],
    ru: ['это вообще РАЗРЕШЕНО', 'арка эксплойтов. разрабы в шоке', 'стена его просто... пропустила', 'банда эксплойта'],
  },
  death: {
    en: ['F', 'F in chat for the intern', 'he was so close to the exit. as usual', 'ratings +25, dignity -100'],
    tr: ['F', 'stajyer için chat\'e F', 'çıkışa çok yakındı. her zamanki gibi', 'izlenme +25, onur -100'],
    ru: ['F', 'F в чат за стажёра', 'он был так близко к выходу. как всегда', 'рейтинг +25, достоинство -100'],
  },
  tier: {
    en: ['CHAT IS GOING WILD', 'the sponsors are typing', 'raid incoming from the void', 'chat, are we entertained'],
    tr: ['SOHBET DELİRDİ', 'sponsorlar yazıyor', 'boşluktan baskın geliyor', 'chat, eğleniyor muyuz'],
    ru: ['ЧАТ СХОДИТ С УМА', 'спонсоры печатают', 'рейд из пустоты', 'чат, нас развлекли'],
  },
  patch: {
    en: ['PATCH NOTES: fun removed', 'called it. they always patch', 'RIP the fun glitch', 'the building fights back'],
    tr: ['YAMA NOTLARI: eğlence kaldırıldı', 'demiştim. hep yamalarlar', 'eğlenceli glitch\'e elveda', 'bina karşılık veriyor'],
    ru: ['ЗАМЕТКИ К ПАТЧУ: веселье удалено', 'я же говорил. они всегда патчат', 'покойся с миром, весёлый глитч', 'здание дало отпор'],
  },
  ghost: {
    en: ['is that... a replay?', 'spooky rerun. thanks I hate it', 'he is walking his last ten seconds again', 'the dead intern is back on air'],
    tr: ['bu... tekrar mı?', 'ürpertici tekrar. sağ ol, nefret ettim', 'son on saniyesini yine yürüyor', 'ölen stajyer yayına döndü'],
    ru: ['это... повтор?', 'жуткий ре-ран. спасибо, ненавижу', 'он снова идёт свои последние десять секунд', 'мёртвый стажёр снова в эфире'],
  },
  ambient: {
    en: ['first', 'is this scripted', 'where is the loot', 'chat can you hear me', 'the ship looks cozy ngl', 'sub for free scrap (no)', 'who is the sweaty one', 'i came for the screaming'],
    tr: ['ilk', 'bu senaryolu mu', 'loot nerede', 'chat beni duyuyor musun', 'gemi rahat görünüyor açıkçası', 'bedava hurda için abone ol (yok)', 'terleyen kim', 'çığlıklar için geldim'],
    ru: ['первый', 'это по сценарию', 'где лут', 'чат, вы меня слышите', 'корабль выглядит уютно, если честно', 'подпишись за бесплатный хлам (нет)', 'кто тут потный', 'я пришёл за криками'],
  },
};
export const CHAT_KINDS = Object.keys(CHAT);
/** one line for `kind` in `lang` (falls back to English), r = random 0..1 */
export function chatLine(kind, lang, r) {
  const pool = CHAT[kind]?.[lang] || CHAT[kind]?.en || CHAT.ambient.en;
  return pool[Math.floor(r * pool.length) % pool.length];
}
export const I18N = { TR, RU };
