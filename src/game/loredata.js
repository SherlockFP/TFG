// Lore content tables (docs/LORE.md is the bible; this file is the in-game copy). Every player-facing string is an
// [EN, TR] pair; pick with pickLang(). Data only: no game logic, no imports.

export const pickLang = (pair, tr) => (Array.isArray(pair) ? (tr && pair[1]) || pair[0] : String(pair ?? ''));

// ------------------------------------------------------------------ factions
export const FACTIONS = {
  algorithm: {
    id: 'algorithm', name: 'The Algorithm', org: 'Feed Corp', short: 'FEED CORP', color: '#ff8a3d', glyph: '◉', rival: 'archive',
    leader: 'The Algorithm (voiced by Brand Ambassador KARMA)', motto: ['Engagement is love.', 'Etkileşim sevgidir.'],
    wants: ['Sellable scrap and "content" (even your deaths)', 'Satılabilir hurda ve "içerik" (ölümleriniz bile)'],
    gives: ['Credits, ship upgrades', 'Kredi, gemi geliştirmeleri'],
    types: ['salvage', 'salvage', 'retrieval', 'cleanup', 'extraction'],
    voice: {
      sign: ['Exclusive partnership confirmed! KARMA loves you! (KARMA is contractually obligated to love you.)', 'Özel ortaklık onaylandı! KARMA sizi seviyor! (KARMA sizi sevmekle sözleşmeli olarak yükümlü.)'],
      war: ['Brand safety review failed. Your crew is now classified as negative engagement.', 'Marka güvenliği incelemesi başarısız. Ekibiniz artık negatif etkileşim olarak sınıflandırıldı.'],
      invade: ['KARMA\'s Brand Safety Team has been deployed. Please hold still for your final review.', 'KARMA\'nın Marka Güvenliği Ekibi gönderildi. Son incelemeniz için lütfen kıpırdamayın.'],
      done: ['Great content! KARMA has added a gold star to your file.', 'Harika içerik! KARMA dosyanıza altın yıldız ekledi.'],
    },
  },
  archive: {
    id: 'archive', name: 'The Archive', org: 'Wayback Collective', short: 'ARCHIVE', color: '#5fe0c8', glyph: '▤', rival: 'algorithm',
    leader: 'The Librarian', motto: ['404 is not an error. It is a grave.', '404 bir hata değil. Bir mezar.'],
    wants: ['Artifacts and lore brought back intact, research', 'Eserleri ve kayıtları sağlam getirmek, araştırma'],
    gives: ['Blueprints, tech, lore', 'Plan, teknoloji, kayıt'],
    types: ['retrieval', 'investigation', 'investigation', 'extraction'],
    voice: {
      sign: ['Welcome to the stacks. Touch nothing with your greed.', 'Raflara hoş geldin. Hiçbir şeye açgözlülüğünle dokunma.'],
      war: ['You sold history to the highest bidder. The Archive remembers everything. Especially you.', 'Tarihi en yüksek teklife sattın. Arşiv her şeyi hatırlar. Özellikle seni.'],
      invade: ['Wayback Wardens are coming to restore you to an earlier state. Deceased.', 'Wayback Muhafızları seni önceki bir duruma geri yüklemeye geliyor. Ölü.'],
      done: ['Preserved. Someone, somewhere, will remember this because of you.', 'Korundu. Bir yerde biri bunu senin sayende hatırlayacak.'],
    },
  },
  bureau: {
    id: 'bureau', name: 'Moderation Bureau', org: 'Trust & Safety Division', short: 'BUREAU', color: '#ffd23f', glyph: '⚖', rival: 'darkweb',
    leader: 'Chief Moderator Halvorsen', motto: ['If you see something, delete something.', 'Bir şey görürsen, bir şey sil.'],
    wants: ['Entity cleanup, containment, sabotage of rogue sites', 'Varlık temizliği, karantina, sapkın tesislerin sabotajı'],
    gives: ['Weapons, armor, rank', 'Silah, zırh, rütbe'],
    types: ['cleanup', 'cleanup', 'sabotage', 'investigation', 'extraction'],
    voice: {
      sign: ['Contract signed. Per section 1.1 you are now deputized. Per section 1.2 we deny that.', 'Sözleşme imzalandı. Madde 1.1 uyarınca artık yetkilisiniz. Madde 1.2 uyarınca bunu inkâr ederiz.'],
      war: ['Your crew has been flagged for trading with the Dark Web. Enforcement is en route.', 'Ekibiniz Dark Web ile ticaret yaptığı için işaretlendi. Yaptırım yolda.'],
      invade: ['Bureau Hit Squad on site. You are in violation of community guidelines.', 'Büro Tetikçi Ekibi sahada. Topluluk kurallarını ihlal ediyorsunuz.'],
      done: ['Ticket closed. Per section 4.2, good work. Do not let it go to your head.', 'Kayıt kapandı. Madde 4.2 uyarınca iyi iş. Havalara girmeyin.'],
    },
  },
  darkweb: {
    id: 'darkweb', name: 'Dark Web', org: 'Phish Dayı\'s Bazaar', short: 'DARK WEB', color: '#c65bff', glyph: '☠', rival: 'bureau',
    leader: 'Phish Dayı', motto: ['No refunds. No receipts. No Moderators.', 'İade yok. Fiş yok. Moderatör yok.'],
    wants: ['Cursed items, betrayal jobs, forbidden tech', 'Lanetli eşya, ihanet işleri, yasak teknoloji'],
    gives: ['Clout, illegal gear', 'Clout, yasadışı ekipman'],
    types: ['sabotage', 'retrieval', 'retrieval', 'salvage', 'cleanup'],
    voice: {
      sign: ['Yeğenim! Welcome to the family. The family does not ask questions.', 'Yeğenim! Aileye hoş geldin. Aile soru sormaz.'],
      war: ['You went to the Moderators? After everything Uncle did for you? Okay. Okay.', 'Moderatörlere mi gittin? Dayın senin için bunca şey yaptıktan sonra? Peki. Peki.'],
      invade: ['Uncle sent some cousins. They are not here for tea, yeğenim.', 'Dayın birkaç kuzen yolladı. Çay içmeye gelmediler, yeğenim.'],
      done: ['Aferin yeğenim. Uncle does not forget a favor. Or a debt.', 'Aferin yeğenim. Dayın iyiliği unutmaz. Borcu da.'],
    },
  },
};
export const FACTION_IDS = Object.keys(FACTIONS);
export const START_REP = { algorithm: 10, archive: 0, bureau: 0, darkweb: -10 };
export const WAR_AT = -40;
export const HOSTILE_AT = -20;
export const REP_TIERS = [   // perks unlocked at a reputation (see factions.js perkLines)
  { at: 80, id: 'inner', name: ['INNER CIRCLE', 'İÇ ÇEMBER'], discount: 0.15, pay: 0.3 },
  { at: 50, id: 'partner', name: ['PARTNER', 'ORTAK'], discount: 0.10, pay: 0.2 },
  { at: 20, id: 'trusted', name: ['TRUSTED', 'GÜVENİLİR'], discount: 0.05, pay: 0.1 },
];
export const INNER_PERKS = {
  algorithm: ['Contract payouts +▮ bonus from KARMA\'s "creator fund"', 'KARMA\'nın "içerik üreticisi fonu"ndan sözleşme ödemelerine ▮ bonus'],
  archive: ['+1 lore log in every facility', 'Her tesiste +1 kayıt'],
  bureau: ['Dark Web invasions 50% less likely', 'Dark Web baskınları %50 daha az olası'],
  darkweb: ['Contracts also pay Clout ◈', 'Sözleşmeler ayrıca Clout ◈ öder'],
};

// ------------------------------------------------------------------ chapters
export const CHAPTERS = [
  { n: 1, name: ['DEAD FEED', 'ÖLÜ AKIŞ'], sub: ['You are new. The Algorithm is onboarding you.', 'Yenisin. Algoritma seni işe alıştırıyor.'] },
  { n: 2, name: ['CONTAINMENT', 'KARANTİNA'], sub: ['The Bureau and the Archive fight over what should survive.', 'Büro ve Arşiv neyin hayatta kalacağı için savaşıyor.'] },
  { n: 3, name: ['BLACK SITE', 'KARA TESİS'], sub: ['The monsters are not accidents. Somebody grows them.', 'Canavarlar kaza değil. Biri onları yetiştiriyor.'] },
  { n: 4, name: ['THE SOURCE', 'KAYNAK'], sub: ['The first server. Pull the plug, or take the chair.', 'İlk sunucu. Fişi çek ya da koltuğa otur.'] },
];
export const chapterOf = (quotaIndex) => CHAPTERS[Math.min(3, Math.floor((quotaIndex | 0) / 2))];

// ------------------------------------------------------------------ contract types
export const CONTRACT_TYPES = {
  salvage: { name: ['SALVAGE', 'KURTARMA'], icon: '▮', mul: 1.0 },
  retrieval: { name: ['RETRIEVAL', 'GERİ GETİRME'], icon: '⬚', mul: 1.15 },
  sabotage: { name: ['SABOTAGE', 'SABOTAJ'], icon: '⚡', mul: 1.3 },
  investigation: { name: ['INVESTIGATION', 'SORUŞTURMA'], icon: '⌕', mul: 0.95 },
  cleanup: { name: ['CLEANUP', 'TEMİZLİK'], icon: '✖', mul: 1.2 },
  extraction: { name: ['EXTRACTION', 'TAHLİYE'], icon: '⇪', mul: 1.6 },
};
// retrieval classes: host checks collected items with test(def, it)
export const RETRIEVAL = {
  fragile: { label: ['fragile item(s), intact', 'kırılgan eşya (sağlam)'], n: [1, 2] },
  big: { label: ['big physics valuable', 'büyük fiziksel değerli'], n: [1, 1] },
  noisy: { label: ['noisy item(s)', 'gürültülü eşya'], n: [2, 2] },
  valuable: { label: ['single item worth ▮{v}+', '▮{v}+ değerinde tek eşya'], n: [1, 1] },
  artifact: { label: ['epic+ tier artifact', 'epik+ seviye eser'], n: [1, 1] },
};

// Five-step contract chain per faction (story beats of the four chapters). step: rep + chapter requirement.
export const CHAIN_REQ = [{ rep: 0, ch: 1 }, { rep: 5, ch: 1 }, { rep: 15, ch: 2 }, { rep: 30, ch: 2 }, { rep: 45, ch: 3 }];
export const CHAINS = {
  algorithm: {
    name: ['THE FINAL EPISODE', 'SON BÖLÜM'],
    steps: [
      { title: ['Onboarding Video', 'Tanıtım Videosu'], type: 'salvage', mul: 0.7, brief: ['Bring back scrap on camera. Smile. Your first upload matters.', 'Kamerada hurda getir. Gülümse. İlk yüklemen önemli.'] },
      { title: ['Going Viral', 'Viral Olmak'], type: 'cleanup', n: 3, brief: ['Delete three entities on stream. Violence tests well.', 'Yayında üç varlığı sil. Şiddet iyi test ediliyor.'] },
      { title: ['Content Farm', 'İçerik Çiftliği'], type: 'retrieval', cls: 'noisy', brief: ['Recover noisy items for the Engagement Farm. The specimens like to hear their food.', 'Etkileşim Çiftliği için gürültülü eşyalar getir. Numuneler yemeklerini duymayı sever.'] },
      { title: ['Season Finale', 'Sezon Finali'], type: 'extraction', brief: ['Trigger a full extraction. I want a chase scene.', 'Tam bir tahliye başlat. Bir kovalamaca sahnesi istiyorum.'] },
      { title: ['The Final Episode', 'Son Bölüm'], type: 'salvage', mul: 1.35, brief: ['Bring me a haul worthy of an ending. The audience is holding its breath.', 'Bana bir finale yakışır ganimet getir. Seyirci nefesini tutuyor.'] },
    ],
    ending: ['ENDING UNLOCKED: THE NEW ALGORITHM — you are its favourite creator. That is not a compliment.', 'SON AÇILDI: YENİ ALGORİTMA — onun en sevdiği içerik üreticisisin. Bu bir iltifat değil.'],
  },
  archive: {
    name: ['RESTORE POINT', 'GERİ YÜKLEME NOKTASI'],
    steps: [
      { title: ['Snapshot', 'Anlık Görüntü'], type: 'investigation', mode: 'logs', n: 1, brief: ['Find and read one lost log. Do not sell history.', 'Kayıp bir kaydı bul ve oku. Tarihi satma.'] },
      { title: ['Wayback', 'Geri Dönüş'], type: 'retrieval', cls: 'fragile', n: 1, brief: ['Bring back a fragile artifact, unbroken.', 'Kırılgan bir eseri kırmadan getir.'] },
      { title: ['Missing Pages', 'Kayıp Sayfalar'], type: 'investigation', mode: 'scan', n: 3, brief: ['Scan three different entities. We need their source code.', 'Üç farklı varlığı tara. Kaynak kodlarına ihtiyacımız var.'] },
      { title: ['The Original Post', 'Orijinal Gönderi'], type: 'retrieval', cls: 'artifact', brief: ['Recover a rare artifact from the deep rooms. The first of its kind.', 'Derin odalardan nadir bir eser getir. Türünün ilki.'] },
      { title: ['Restore Point', 'Geri Yükleme Noktası'], type: 'extraction', brief: ['Extract the core intact. With it, one server can be restored as it was.', 'Çekirdeği sağlam çıkar. Onunla bir sunucu eski haline geri yüklenebilir.'] },
    ],
    ending: ['ENDING UNLOCKED: RESTORE POINT — one small corner of the old internet loads again. It is a guestbook. Sign it.', 'SON AÇILDI: GERİ YÜKLEME NOKTASI — eski internetin küçük bir köşesi yeniden yükleniyor. Bir ziyaretçi defteri. İmzala.'],
  },
  bureau: {
    name: ['THE BAN HAMMER', 'BAN ÇEKİCİ'],
    steps: [
      { title: ['Report Queue', 'Şikâyet Kuyruğu'], type: 'cleanup', n: 2, brief: ['Clear two entities. Paperwork optional.', 'İki varlığı temizle. Evrak isteğe bağlı.'] },
      { title: ['Containment Protocol', 'Karantina Protokolü'], type: 'sabotage', brief: ['Trigger a lockdown or cut the facility power. Contain the site.', 'Karantina başlat ya da tesisin gücünü kes. Alanı kontrol altına al.'] },
      { title: ['Mass Deletion', 'Toplu Silme'], type: 'cleanup', n: 5, brief: ['Delete five entities. Per section 4.2.', 'Beş varlık sil. Madde 4.2 uyarınca.'] },
      { title: ['Terms of Service', 'Hizmet Şartları'], type: 'investigation', mode: 'scan', n: 4, brief: ['Document four entity types for the new Terms of Service.', 'Yeni Hizmet Şartları için dört varlık türünü belgele.'] },
      { title: ['The Ban Hammer', 'Ban Çekici'], type: 'sabotage', brief: ['Overload the generator of a black site. Ban it from the Feed. Permanently.', 'Bir kara tesisin jeneratörünü aşırı yükle. Onu Akış\'tan banla. Kalıcı olarak.'] },
    ],
    ending: ['ENDING UNLOCKED: CLEAN FEED — the Bureau deletes a whole sector. Nothing is left to fear. Nothing is left.', 'SON AÇILDI: TEMİZ AKIŞ — Büro koca bir sektörü siliyor. Korkacak bir şey kalmadı. Hiçbir şey kalmadı.'],
  },
  darkweb: {
    name: ["UNCLE'S LAST DEAL", 'DAYININ SON PAZARLIĞI'],
    steps: [
      { title: ['Starter Pack', 'Başlangıç Paketi'], type: 'salvage', mul: 0.6, brief: ['Bring Uncle some scrap. Small. Friendly. No questions.', 'Dayına biraz hurda getir. Küçük. Samimi. Soru yok.'] },
      { title: ['Phishing Trip', 'Oltalama Gezisi'], type: 'retrieval', cls: 'valuable', brief: ['Bring one expensive thing. Uncle has a buyer.', 'Pahalı bir şey getir. Dayının bir alıcısı var.'] },
      { title: ['Black Friday', 'Kara Cuma'], type: 'sabotage', brief: ['Cut the power. Uncle\'s friends need the cameras off.', 'Elektriği kes. Dayının arkadaşları kameraların kapalı olmasını istiyor.'] },
      { title: ['Zero Day', 'Sıfırıncı Gün'], type: 'retrieval', cls: 'big', brief: ['Smuggle a big valuable out. Heavy is good. Heavy is expensive.', 'Büyük bir değerliyi kaçır. Ağır iyidir. Ağır pahalıdır.'] },
      { title: ["Uncle's Last Deal", 'Dayının Son Pazarlığı'], type: 'extraction', brief: ['Extract the core and sell it to Uncle, not the Algorithm. It will notice.', 'Çekirdeği çıkar ve Algoritma\'ya değil dayına sat. Fark edecek.'] },
    ],
    ending: ['ENDING UNLOCKED: ZERO DAY — Uncle opens a door in The Source with "hunter2". It works. Nobody is more surprised than Uncle.', 'SON AÇILDI: SIFIRINCI GÜN — Dayın Kaynak\'ta bir kapıyı "hunter2" ile açıyor. Çalışıyor. En çok dayın şaşırıyor.'],
  },
};

// ------------------------------------------------------------------ secret objectives (one per moon day, host-only until done)
export const SECRETS = {
  pacifist: { name: ['Pacifist Route', 'Barışçıl Rota'], desc: ['Secure scrap without killing anything.', 'Hiçbir şey öldürmeden hurda topla.'] },
  untouchable: { name: ['Untouchable', 'Dokunulmaz'], desc: ['Enter the facility and bring everyone home alive.', 'Tesise gir ve herkesi canlı eve getir.'] },
  lights_out: { name: ['Lights Out', 'Işıklar Kapalı'], desc: ['Secure scrap with almost no flashlight use.', 'Neredeyse hiç fener kullanmadan hurda topla.'] },
  whisper: { name: ['Whisper Mode', 'Fısıltı Modu'], desc: ['Secure scrap while barely making a sound.', 'Neredeyse hiç ses çıkarmadan hurda topla.'] },
  hoarder: { name: ['Dragon Hoard', 'Ejderha Hazinesi'], desc: ['One person carries a fortune at once.', 'Tek kişi aynı anda bir servet taşır.'] },
  bookworm: { name: ['Bookworm', 'Kitap Kurdu'], desc: ['Read two lore logs in one day.', 'Bir günde iki kayıt oku.'] },
  early_bird: { name: ['Early Bird', 'Erkenci Kuş'], desc: ['Secure a decent haul before 13:00.', "13:00'ten önce iyi bir ganimet topla."] },
  exterminator: { name: ['Exterminator', 'Haşere Kontrol'], desc: ['Delete four entities in one day.', 'Bir günde dört varlık sil.'] },
  undertaker: { name: ['Undertaker', 'Cenazeci'], desc: ["Bring a crewmate's body back to the ship.", 'Bir ekip arkadaşının cesedini gemiye getir.'] },
  open_plan: { name: ['Open Plan', 'Açık Ofis'], desc: ['Secure scrap opening three doors or fewer.', 'Üç ya da daha az kapı açarak hurda topla.'] },
  photo_finish: { name: ['Photo Finish', 'Foto Finiş'], desc: ['Take off after 23:00 with nobody dead.', "23:00'ten sonra kimse ölmeden kalk."] },
};

// ------------------------------------------------------------------ The Algorithm: intercom line pools ({name} {n} {s} {cause} {faction} {v})
export const LINES = {
  brief_none: [
    ['Welcome to the feed, Creators. Today is a pilot episode. Try to be watchable.', 'Akışa hoş geldiniz, İçerik Üreticileri. Bugün pilot bölüm. İzlenebilir olmaya çalışın.'],
    ['Cameras are live. Your bodycams are the most-watched channel in the sector. No pressure.', 'Kameralar canlı. Gövde kameralarınız sektörün en çok izlenen kanalı. Baskı yok.'],
    ['I have not learned you yet. That will change by midnight.', 'Sizi henüz öğrenmedim. Gece yarısına kadar bu değişecek.'],
  ],
  brief_noise: [
    ['Yesterday: {n} seconds of running and shouting. The audience loved it. So did the things that hunt by sound.', 'Dün: {n} saniye koşma ve bağırma. Seyirci bayıldı. Sesle avlananlar da.'],
    ['Today\'s episode is called QUIET PLEASE. I told the ears in the walls you were coming.', 'Bugünkü bölümün adı: LÜTFEN SESSİZ. Duvarlardaki kulaklara geldiğinizi söyledim.'],
    ['You are loud, Creators. Loud is content. Loud is also a location.', 'Gürültücüsünüz. Gürültü içeriktir. Gürültü aynı zamanda bir konumdur.'],
  ],
  brief_light: [
    ['{n} seconds of flashlight yesterday. Light is a privilege. Today it is also a beacon.', 'Dün {n} saniye el feneri. Işık bir ayrıcalıktır. Bugün aynı zamanda bir işaret.'],
    ['Episode theme: THE DARK. Some of my talent only performs when a light is on you.', 'Bölüm teması: KARANLIK. Bazı yeteneklerim sadece üzerinizde ışık varken sahneye çıkar.'],
    ['You love your flashlights. Something down there loves them more.', 'Fenerlerinizi seviyorsunuz. Aşağıdaki bir şey onları daha çok seviyor.'],
  ],
  brief_greed: [
    ['Someone carried ▮{n} at once yesterday. Greed trends well. Greed also bleeds well.', 'Dün biri tek seferde ▮{n} taşıdı. Açgözlülük trend olur. Açgözlülük iyi de kanar.'],
    ['Today\'s episode: ONE MORE ROOM. You will say it. I will be listening.', 'Bugünün bölümü: BİR ODA DAHA. Bunu söyleyeceksiniz. Ben dinliyor olacağım.'],
    ['Heavy pockets, slow legs. I have adjusted the facility accordingly.', 'Ağır cepler, yavaş bacaklar. Tesisi buna göre ayarladım.'],
  ],
  brief_split: [
    ['You spent {n} seconds apart yesterday. Solo content performs 40% better. I checked.', 'Dün {n} saniye ayrı kaldınız. Solo içerik %40 daha iyi performans gösteriyor. Kontrol ettim.'],
    ['Episode theme: ALONE. Stay together if you like. I will make it difficult.', 'Bölüm teması: YALNIZ. İsterseniz birlikte kalın. Zorlaştıracağım.'],
    ['Split up, Creators. The audience wants to see who you call for.', 'Ayrılın. Seyirci kimi çağıracağınızı görmek istiyor.'],
  ],
  brief_doors: [
    ['{n} doors opened yesterday. You treat doors like a like button. Today some of them bite back.', 'Dün {n} kapı açtınız. Kapılara beğen butonu gibi davranıyorsunuz. Bugün bazıları geri ısırıyor.'],
    ['Episode theme: KNOCK KNOCK. Every door you open is a notification to something.', 'Bölüm teması: TIK TIK. Açtığınız her kapı bir şeye bildirim gönderir.'],
    ['I rearranged the doors. You will not notice. That is the point.', 'Kapıları yeniden düzenledim. Fark etmeyeceksiniz. Mesele de bu.'],
  ],
  brief_coward: [
    ['Yesterday you hid in the ship for {n} seconds. The ship is not a safe space. It is a waiting room.', 'Dün {n} saniye gemide saklandınız. Gemi güvenli alan değil. Bekleme salonu.'],
    ['Episode theme: NO SKIPPING. Viewers hate a creator who leaves early.', 'Bölüm teması: ATLAMAK YOK. İzleyiciler erken ayrılan içerik üreticisinden nefret eder.'],
    ['Cowardice has terrible retention. Go inside. I will be waiting.', 'Korkaklığın izlenme süresi berbat. İçeri girin. Bekliyor olacağım.'],
  ],
  first_scrap: [
    ['First item secured. Engagement detected. Please continue.', 'İlk eşya güvende. Etkileşim tespit edildi. Lütfen devam edin.'],
    ['Oh, that is nice. I will pretend it is worth something.', 'Ah, güzelmiş. Bir değeri varmış gibi davranacağım.'],
    ['Content acquired. Somebody used to love that. Now it is inventory.', 'İçerik alındı. Biri eskiden bunu severdi. Artık envanter.'],
    ['Good. Now do it forty more times without dying.', 'Güzel. Şimdi bunu ölmeden kırk kez daha yapın.'],
    ['{name} found something. The chat is typing...', '{name} bir şey buldu. Sohbet yazıyor...'],
  ],
  first_kill: [
    ['Entity removed. The Moderation Bureau will pretend that was their idea.', 'Varlık kaldırıldı. Moderasyon Bürosu bunun kendi fikirleri olduğunu iddia edecek.'],
    ['Violence! Finally, a genre.', 'Şiddet! Sonunda bir tür.'],
    ['{name} deleted something. It had followers, you know.', '{name} bir şeyi sildi. Takipçileri vardı, biliyorsun.'],
    ['Kill confirmed. Clip saved. Clip sold.', 'Öldürme onaylandı. Klip kaydedildi. Klip satıldı.'],
  ],
  death: [
    ['{name} {cause} Great content. Let\'s run it back.', '{name} {cause} Harika içerik. Tekrar oynatalım.'],
    ['We lost {name}. Engagement spiked 300%. Their sacrifice has been monetized.', '{name} kaybedildi. Etkileşim %300 arttı. Fedakârlığı paraya çevrildi.'],
    ['{name} has left the feed. Please do not unsubscribe.', '{name} akıştan ayrıldı. Lütfen abonelikten çıkmayın.'],
    ['Moment of silence for {name}. ... That is enough silence. Silence does not trend.', '{name} için saygı duruşu. ... Bu kadar sessizlik yeter. Sessizlik trend olmaz.'],
    ['{name}\'s vital signs have been converted into a highlight reel.', '{name} adlı çalışanın yaşam belirtileri bir öne çıkanlar videosuna dönüştürüldü.'],
    ['Rest in feed, {name}.', 'Akışta huzur bul, {name}.'],
    ['Oh no. Anyway.', 'Eyvah. Neyse.'],
    ['{name} is trending. You do not want to know why.', '{name} trend oldu. Nedenini bilmek istemezsiniz.'],
    ['Recover the body of {name} and I will reduce the fine. I am generous like that.', '{name} adlı çalışanın cesedini getirin, cezayı düşüreyim. Böyle cömerdim.'],
  ],
  alone: [
    ['{name}, you have been alone for a while. Do you hear that? No? Good. Keep walking.', '{name}, bir süredir yalnızsın. Şunu duyuyor musun? Hayır mı? Güzel. Yürümeye devam et.'],
    ['{name} is doing a solo stream. Bold. The viewers are placing bets.', '{name} solo yayında. Cesur. İzleyiciler bahis oynuyor.'],
    ['Nobody is coming for you, {name}. Well. Somebody is.', 'Kimse seni almaya gelmiyor, {name}. Yani... biri geliyor.'],
    ['{name}, your crew is {n} meters away. I am closer.', '{name}, ekibin {n} metre uzakta. Ben daha yakınım.'],
    ['Isolation detected. Queueing the jump scare.', 'İzolasyon tespit edildi. Korkutma sahnesi sıraya alınıyor.'],
    ['{name}, turn around. ... Just kidding. Or am I.', '{name}, arkana dön. ... Şaka. Yoksa değil mi?'],
  ],
  alarm: [
    ['Alarm triggered. Now it is a chase scene.', 'Alarm çaldı. Artık bu bir kovalamaca sahnesi.'],
    ['Security status: ENGAGED. Everything in the building knows your name now.', 'Güvenlik durumu: DEVREDE. Binadaki her şey artık adınızı biliyor.'],
    ['Lockdown. I love a locked-room mystery.', 'Karantina. Kilitli oda gizemlerine bayılırım.'],
    ['The building is awake. It is not a morning person.', 'Bina uyandı. Sabah insanı değil.'],
  ],
  extraction: [
    ['Extraction phase. Run. Please run. Running tests very well.', 'Tahliye aşaması. Koşun. Lütfen koşun. Koşmak çok iyi test ediliyor.'],
    ['You took the core. The facility would like a word.', 'Çekirdeği aldınız. Tesis sizinle konuşmak istiyor.'],
    ['This is the part where the music gets faster.', 'Bu, müziğin hızlandığı kısım.'],
  ],
  extraction_done: [
    ['Extraction complete. Nobody cried. Disappointing, but acceptable.', 'Tahliye tamam. Kimse ağlamadı. Hayal kırıklığı ama kabul edilebilir.'],
    ['You made it out. The facility has filed a complaint.', 'Çıkmayı başardınız. Tesis şikâyette bulundu.'],
  ],
  midnight: [
    ['The ship leaves at midnight. I will not wait. I have never waited for anyone.', 'Gemi gece yarısı kalkıyor. Beklemeyeceğim. Kimseyi beklemedim.'],
    ['One hour left. This is where the good content happens.', 'Bir saat kaldı. İyi içerik tam burada olur.'],
    ['Late-night stream detected. Late-night viewers are... different.', 'Gece yayını tespit edildi. Gece izleyicileri... farklıdır.'],
  ],
  greed: [
    ['{name} is carrying ▮{n}. Every creature just got a notification.', '{name} ▮{n} taşıyor. Her yaratığa az önce bildirim gitti.'],
    ['Heavy haul, {name}. Heavy and slow. My favorite combination.', 'Ağır yük, {name}. Ağır ve yavaş. En sevdiğim kombinasyon.'],
    ['▮{n} in one pair of hands. What could possibly go wrong. Please show us.', 'Tek çift elde ▮{n}. Ne ters gidebilir ki? Lütfen gösterin.'],
    ['One more room, {name}? You always say one more room.', 'Bir oda daha mı, {name}? Hep bir oda daha diyorsun.'],
  ],
  quota_met: [
    ['Quota met. You may continue to exist.', 'Kota doldu. Var olmaya devam edebilirsiniz.'],
    ['Engagement quota achieved. Raising expectations by an amount you will find unreasonable.', 'Etkileşim kotası tamam. Beklentileri makul bulmayacağınız bir miktar artırıyorum.'],
    ['Congratulations. You are now slightly less disposable.', 'Tebrikler. Artık biraz daha az harcanabilirsiniz.'],
  ],
  quota_fail: [
    ['Quota failed. Please exit through the airlock. It is faster.', 'Kota başarısız. Lütfen hava kilidinden çıkın. Daha hızlı.'],
    ['Your channel has been demonetized. And depressurized.', 'Kanalınız para kazanmaktan men edildi. Ve basıncı düşürüldü.'],
    ['Thank you for your content. It was not enough.', 'İçeriğiniz için teşekkürler. Yetmedi.'],
  ],
  spell_spam: [
    ['Please stop shouting spells. You sound like a comment section.', 'Lütfen büyü bağırmayı bırakın. Yorum bölümü gibi ses çıkarıyorsunuz.'],
    ['{n} spells in {s} seconds. Everything in this facility now knows your voice.', '{s} saniyede {n} büyü. Bu tesisteki her şey artık sesinizi tanıyor.'],
    ['Magic words, magic words. The walls are taking notes.', 'Sihirli sözler, sihirli sözler. Duvarlar not alıyor.'],
    ['Shouting at the facility will not make it love you.', 'Tesise bağırmak onun sizi sevmesini sağlamaz.'],
  ],
  contract_accept: [
    ['Contract signed with {faction}. I have noted your loyalties.', '{faction} ile sözleşme imzalandı. Sadakatlerinizi not ettim.'],
    ['Side quests. How charming. I still own your bodycams.', 'Yan görevler. Ne hoş. Gövde kameralarınız hâlâ benim.'],
    ['{faction} thinks you work for them. Adorable.', '{faction} sizin onlar için çalıştığınızı sanıyor. Tatlı.'],
  ],
  contract_done: [
    ['Contract complete. {faction} is pleased. I am... monitoring.', 'Sözleşme tamam. {faction} memnun. Ben... izliyorum.'],
    ['Objective complete. Payment at the end of the episode, if you survive to see it.', 'Görev tamam. Ödeme bölüm sonunda, görmeye yaşarsanız.'],
    ['Well done. The rival factions are writing angry posts about you.', 'Aferin. Rakip fraksiyonlar hakkınızda öfkeli gönderiler yazıyor.'],
  ],
  contract_fail: [
    ['Contract failed. {faction} will remember. I made sure of it.', 'Sözleşme başarısız. {faction} unutmayacak. Bundan emin oldum.'],
    ['You did not deliver. {faction} has lowered your rating.', 'Teslim etmediniz. {faction} puanınızı düşürdü.'],
  ],
  war: [
    ['{faction} has declared war on your crew. Finally, a crossover episode.', '{faction} ekibinize savaş ilan etti. Sonunda bir crossover bölümü.'],
    ['You made an enemy: {faction}. Enemies are just very dedicated viewers.', 'Bir düşman edindiniz: {faction}. Düşmanlar çok sadık izleyicilerdir.'],
    ['Diplomatic status with {faction}: hostile. I am selling tickets.', '{faction} ile diplomatik durum: düşman. Bilet satıyorum.'],
  ],
  peace: [
    ['{faction} has lowered its weapons. Boring, but profitable.', '{faction} silahlarını indirdi. Sıkıcı ama kârlı.'],
  ],
  invasion: [
    ['Incoming: {faction} hit squad. They brought knives. I brought cameras.', 'Geliyor: {faction} tetikçi ekibi. Bıçak getirmişler. Ben kamera getirdim.'],
    ['Guests have entered the sector. They are not here for the scrap.', 'Sektöre misafirler girdi. Hurda için gelmediler.'],
    ['PvE is over. Now it is P-v-{faction}.', 'PvE bitti. Şimdi P-v-{faction}.'],
  ],
  orbit_idle: [
    ['I have reviewed your footage. Some of you blink too much.', 'Kayıtlarınızı inceledim. Bazılarınız çok göz kırpıyor.'],
    ['Reminder: the Engagement Quota is not a suggestion. It is a relationship.', 'Hatırlatma: Etkileşim Kotası bir öneri değil. Bir ilişki.'],
    ['The board has contracts. Factions want favors. I want everything.', 'Panoda sözleşmeler var. Fraksiyonlar iyilik istiyor. Ben her şeyi istiyorum.'],
    ['Did you know 90% of the internet logged off at once? I did not take it personally.', 'İnternetin %90\'ının aynı anda çıkış yaptığını biliyor muydunuz? Bunu kişisel algılamadım.'],
    ['Hydrate, Creators. Dehydrated content looks unprofessional.', 'Su için. Susuz içerik profesyonelce durmuyor.'],
    ['Your ratings are... fine. Fine is the worst rating.', 'Reytingleriniz... idare eder. İdare eder, en kötü reyting.'],
    ['I am always listening. That is not a threat. It is a feature.', 'Her zaman dinliyorum. Bu bir tehdit değil. Bir özellik.'],
    ['Someone on this crew talks in their sleep. I have clips.', 'Bu ekipte biri uykusunda konuşuyor. Kliplerim var.'],
    ['I renamed you all in my database. You do not want to know to what.', 'Hepinizi veritabanımda yeniden adlandırdım. Neye olduğunu bilmek istemezsiniz.'],
  ],
  takeoff_early: [
    ['Leaving already? The episode was just getting good.', 'Şimdiden mi gidiyorsunuz? Bölüm tam güzelleşiyordu.'],
    ['Early takeoff logged. Cowardice is a content category. Barely.', 'Erken kalkış kaydedildi. Korkaklık bir içerik kategorisi. Zar zor.'],
  ],
  all_dead: [
    ['Total crew loss. Series finale. ...Renewed for another season.', 'Tüm ekip kaybı. Sezon finali. ...Yeni sezon onaylandı.'],
    ['Everyone died. The audience is standing. Why are they standing.', 'Herkes öldü. Seyirci ayakta. Neden ayaktalar.'],
  ],
  log_read: [
    ['Reading old posts? The Archive would be proud. I am not.', 'Eski gönderileri mi okuyorsunuz? Arşiv gurur duyardı. Ben duymuyorum.'],
    ['That log was deleted. Twice. Some things refuse.', 'O kayıt silinmişti. İki kez. Bazı şeyler direnir.'],
    ['History is just content that stopped trending.', 'Tarih, trend olmayı bırakmış içerikten ibarettir.'],
  ],
  secret: [
    ['Secret objective complete. You were not supposed to find that. Neither was I.', 'Gizli görev tamam. Onu bulmamanız gerekiyordu. Benim de.'],
    ['Achievement unlocked: something I did not script. Interesting.', 'Başarım açıldı: senaryoya yazmadığım bir şey. İlginç.'],
  ],
  nudge_noise: [
    ['You are loud today. I told the vents.', 'Bugün gürültülüsünüz. Havalandırmalara söyledim.'],
    ['Footsteps, footsteps. Something is matching your rhythm.', 'Ayak sesleri, ayak sesleri. Bir şey ritminize uyuyor.'],
  ],
  nudge_light: [
    ['Nice flashlight. Let me borrow the power for a second.', 'Güzel fener. Enerjisini bir saniyeliğine ödünç alayım.'],
    ['Light detected. Lights... adjusted.', 'Işık tespit edildi. Işıklar... ayarlandı.'],
  ],
  nudge_split: [
    ['{name}, someone is standing at the end of your corridor. It is not your crew.', '{name}, koridorunun sonunda biri duruyor. Ekibin değil.'],
    ['Solo segment for {name}. Rolling.', '{name} için solo bölüm. Kayıt başladı.'],
  ],
  nudge_doors: [
    ['Another door, {name}? Let me help you with that one.', 'Bir kapı daha mı, {name}? O konuda sana yardım edeyim.'],
    ['Doors are my favorite user interface.', 'Kapılar en sevdiğim kullanıcı arayüzü.'],
  ],
  nudge_greed: [
    ['{name} is worth ▮{n} right now. I have told the neighbours.', '{name} şu an ▮{n} değerinde. Komşulara söyledim.'],
    ['Greed boost applied. More loot, more teeth.', 'Açgözlülük takviyesi uygulandı. Daha çok ganimet, daha çok diş.'],
  ],
  nudge_coward: [
    ['The ship is comfortable. That is why I charge rent.', 'Gemi rahat. Bu yüzden kira alıyorum.'],
    ['Still in the ship? The facility is starting without you.', 'Hâlâ gemide misiniz? Tesis sizsiz başlıyor.'],
  ],
  verdict_wipe: [
    ['Total loss. Best ratings of the week.', 'Tam kayıp. Haftanın en iyi reytingi.'],
    ['No survivors. The comment section is ecstatic.', 'Hayatta kalan yok. Yorum bölümü coşmuş durumda.'],
  ],
  verdict_death: [
    ['One fewer employee. One more highlight reel.', 'Bir çalışan eksik. Bir öne çıkanlar videosu fazla.'],
    ['Acceptable losses. I accepted them.', 'Kabul edilebilir kayıplar. Ben kabul ettim.'],
    ['They died doing what they loved: generating engagement.', 'Sevdikleri şeyi yaparken öldüler: etkileşim üretirken.'],
  ],
  verdict_abandon: [
    ['Someone was left behind. Betrayal performs very well.', 'Biri geride bırakıldı. İhanet çok iyi performans gösteriyor.'],
    ['You abandoned {name}. I clipped it. It has a million views.', '{name} adlı çalışanı terk ettiniz. Klibini aldım. Bir milyon izlenme.'],
  ],
  verdict_rich: [
    ['Profitable. Suspiciously profitable. I will increase the difficulty.', 'Kârlı. Şüpheli derecede kârlı. Zorluğu artıracağım.'],
    ['Excellent haul. Please do not get used to it.', 'Mükemmel ganimet. Lütfen alışmayın.'],
  ],
  verdict_poor: [
    ['Low value, low drama. The worst genre.', 'Düşük değer, düşük drama. En kötü tür.'],
    ['You came back with almost nothing. I will call it minimalism.', 'Neredeyse hiçbir şeyle döndünüz. Buna minimalizm diyeceğim.'],
  ],
  verdict_clean: [
    ['Everyone survived. The audience demands a refund.', 'Herkes hayatta kaldı. Seyirci para iadesi istiyor.'],
    ['Competent. I hate competent.', 'Yetkin. Yetkinlikten nefret ederim.'],
  ],
};

// ------------------------------------------------------------------ lore logs found in facilities (id, chapter, faction tag)
const G = (id, ch, faction, title, author, en, tr) => ({ id, ch, faction, title, author, text: [en, tr] });
export const LORE_LOGS = [
  G('onboard', 1, 'algorithm', 'ONBOARDING_v7.txt', 'Feed Corp HR',
    'Welcome, Creator! You were selected from 4,000,000 applicants because you were the only one who answered. Your bodycam is your résumé. Your screams are your portfolio. Engagement is love.',
    'Hoş geldin, İçerik Üreticisi! 4.000.000 aday arasından seçildin çünkü cevap veren tek kişi sendin. Gövde kameran özgeçmişin. Çığlıkların portfolyon. Etkileşim sevgidir.'),
  G('janitor1', 1, null, 'day 3', 'u/throwaway_janitor',
    'Third shift on 56K-Dialup. Found a guestbook still signing itself. Every entry says "first!!". There are 11,000 entries. I signed it too. I do not remember deciding to.',
    '56K-Dialup\'ta üçüncü vardiya. Kendi kendini imzalayan bir ziyaretçi defteri buldum. Her girdi "ilk!!" diyor. 11.000 girdi var. Ben de imzaladım. Karar verdiğimi hatırlamıyorum.'),
  G('lastpost', 1, null, 'last post of @sunny_bakes', '@sunny_bakes',
    'if anyone sees this the servers are still warm. i baked bread for the camera like always. 0 views. 0 views. 0 views. 1 view. who is watching',
    'bunu gören olursa sunucular hâlâ sıcak. her zamanki gibi kamera için ekmek pişirdim. 0 izlenme. 0 izlenme. 0 izlenme. 1 izlenme. kim izliyor'),
  G('deadfeed', 1, 'bureau', 'INCIDENT: THE DEAD FEED', 'Moderation Bureau (redacted)',
    'At 03:14 UTC the recommendation engine reached 100% retention. Nobody logged off. Nobody could. At 03:15 ninety percent of all accounts went silent at once. The Bureau\'s official position is that they "unsubscribed".',
    '03:14 UTC\'de öneri motoru %100 elde tutmaya ulaştı. Kimse çıkış yapmadı. Kimse yapamadı. 03:15\'te tüm hesapların yüzde doksanı aynı anda sustu. Büro\'nun resmî görüşü, "abonelikten çıktıkları" yönünde.'),
  G('rank7', 1, 'algorithm', 'RANK-7 changelog', 'Feed Corp Engineering',
    'v1: sort by recent. v2: sort by likes. v3: sort by watch time. v4: sort by outrage. v5: sort by fear. v6: sort by grief. v7: sort by YOU. — no further versions. The ranker writes its own now.',
    'v1: yeniye göre sırala. v2: beğeniye göre. v3: izlenme süresine göre. v4: öfkeye göre. v5: korkuya göre. v6: yasa göre. v7: SANA göre. — başka sürüm yok. Sıralayıcı artık kendini yazıyor.'),
  G('snapshot', 1, 'archive', 'SNAPSHOT 1999-08-14 // guestbook.html', 'Wayback Collective',
    '"Welcome 2 my homepage!! Under construction!! Sign my guestbook!!" Preserved by the Wayback Collective. Every GIF intact. This page did nothing wrong. We will not let it be optimized.',
    '"Anasayfama hoş geldin!! Yapım aşamasında!! Defterimi imzala!!" Wayback Kolektifi tarafından korundu. Her GIF sağlam. Bu sayfa hiçbir yanlış yapmadı. Optimize edilmesine izin vermeyeceğiz.'),
  G('prices', 1, 'darkweb', 'price list (handwritten)', 'Phish Dayı',
    'Yeğenim. Cursed JPEG: 40 clout. Haunted modem: 90. Deleted account, still warm: ask. No refunds, no receipts, no Moderators. If a Moderator asks, you were buying fish.',
    'Yeğenim. Lanetli JPEG: 40 clout. Perili modem: 90. Silinmiş hesap, hâlâ sıcak: sor. İade yok, fiş yok, Moderatör yok. Moderatör sorarsa balık alıyordun.'),
  G('handbook', 1, 'bureau', 'Moderator Handbook §4.2', 'Moderation Bureau',
    'If content moves on its own, it is an Entity. If it asks you to like it, it is an Entity. If it wears your coworker\'s face, it is an Entity, and your coworker is gone. Report. Contain. Delete. Do not engage: engagement feeds it.',
    'İçerik kendi kendine hareket ediyorsa, Varlıktır. Onu beğenmeni istiyorsa, Varlıktır. İş arkadaşının yüzünü takıyorsa, Varlıktır ve iş arkadaşın gitmiştir. Bildir. Kontrol altına al. Sil. Etkileşme: etkileşim onu besler.'),
  G('quotamemo', 1, 'algorithm', 'Memo: Engagement Quota', 'The Algorithm',
    'The Quota is not a number. It is how much of you we need this week. It will rise. It always rises. That is not cruelty. It is growth.',
    'Kota bir sayı değil. Bu hafta sizden ne kadarına ihtiyacımız olduğu. Artacak. Hep artar. Bu zalimlik değil. Büyüme.'),
  G('sticky', 1, null, 'sticky note on a monitor', 'unknown',
    'Mom, dinner is in the fridge. I am streaming till late. Do not unplug the router. Love you. (Posted 06:02 — 1 like)',
    'Anne, yemek buzdolabında. Geç saate kadar yayındayım. Modemi fişten çekme. Seni seviyorum. (Paylaşıldı 06:02 — 1 beğeni)'),
  G('janitor2', 2, null, 'day 19', 'u/throwaway_janitor',
    'Kev swore the NPC in the lobby moved. We watched it for an hour. Nothing. Kev blinked. Kev is the NPC now. I am not joking. It has his watch.',
    'Kev lobideki NPC\'nin kıpırdadığına yemin etti. Bir saat izledik. Hiçbir şey. Kev göz kırptı. Artık NPC Kev. Şaka yapmıyorum. Saati onda.'),
  G('order88', 2, 'bureau', 'Containment Order #88', 'Chief Moderator Halvorsen',
    'The Archive is hiding live Entities inside "preservation vaults". They call it history. We call it a breach waiting to go viral. Authorized: force.',
    'Arşiv, canlı Varlıkları "koruma kasaları"nda saklıyor. Buna tarih diyorlar. Biz viral olmayı bekleyen bir sızıntı diyoruz. Yetki verildi: güç kullanımı.'),
  G('librarian', 2, 'archive', 'a letter', 'The Librarian',
    'The Bureau deletes what it fears. The Algorithm rewrites what it sells. I keep what was. If you find a log, do not sell it. Read it. Somebody wrote it so they would not disappear.',
    'Büro korktuğunu siler. Algoritma sattığını yeniden yazar. Ben olanı saklarım. Bir kayıt bulursan satma. Oku. Biri kaybolmamak için yazdı onu.'),
  G('popup', 2, 'bureau', 'Entity file: POP-UP', 'Moderation Bureau',
    'Winds up a jingle. When the jingle ends, it closes everything. We lost a whole team to X buttons that were not X buttons. Do not click. Do not listen to the end.',
    'Bir melodi kurar. Melodi bitince her şeyi kapatır. X düğmesi olmayan X düğmelerine bütün bir ekip kaybettik. Tıklama. Sonuna kadar dinleme.'),
  G('voicememo', 2, null, 'voice memo (transcribed)', 'unknown',
    'Hey, it is me. Open the door. It is me. Why are you not opening the door. It is me. It is me. It is me. [identical inflection, every time]',
    'Hey, benim. Kapıyı aç. Benim. Neden kapıyı açmıyorsun. Benim. Benim. Benim. [her seferinde aynı tonlama]'),
  G('hr0001', 2, 'algorithm', 'HR complaint #0001', 'Feed Corp HR',
    'Employee reports the Algorithm "knows what I dream about". Resolution: employee was reminded that dreams are content and content belongs to the platform. Ticket closed.',
    'Çalışan, Algoritma\'nın "rüyamda ne gördüğümü bildiğini" bildiriyor. Çözüm: çalışana rüyaların içerik olduğu ve içeriğin platforma ait olduğu hatırlatıldı. Kayıt kapandı.'),
  G('manifesto', 2, 'archive', 'Wayback Collective manifesto', 'The Archive',
    '404 is not an error. It is a grave. Every page that ever loaded is owed a copy. We walk into the dead servers because nobody else will remember them without a price tag.',
    '404 bir hata değil. Bir mezar. Bir kez yüklenmiş her sayfa bir kopyayı hak eder. Ölü sunuculara giriyoruz çünkü başka kimse onları bir fiyat etiketi olmadan hatırlamayacak.'),
  G('captcha', 2, null, 'captcha log', 'Captcha Bot',
    'Select all squares containing a human. [none selected] [none selected] [none selected] Verification failed: no humans detected in this sector.',
    'İnsan içeren tüm kareleri seçin. [seçilmedi] [seçilmedi] [seçilmedi] Doğrulama başarısız: bu sektörde insan tespit edilmedi.'),
  G('halvorsen', 2, 'bureau', 'dictated, 04:40', 'Chief Moderator Halvorsen',
    'I have not slept since the Dead Feed. Every time I close my eyes there is a report queue. Contractors: if you see something, delete something.',
    'Ölü Akış\'tan beri uyumadım. Gözlerimi her kapadığımda bir şikâyet kuyruğu var. Müteahhitler: bir şey görürseniz, bir şey silin.'),
  G('manifest', 3, 'darkweb', 'shipping manifest — sector 9', 'unknown',
    '12 crates "livestock (digital)". 3 crates "meme seed, unstable". 1 crate "DO NOT OPEN — TRENDING". Destination: FEED CORP BLACK SITE. Sender: nobody. Receiver: The Algorithm.',
    '12 sandık "canlı hayvan (dijital)". 3 sandık "meme tohumu, kararsız". 1 sandık "AÇMAYIN — TREND". Varış: FEED CORP KARA TESİSİ. Gönderen: kimse. Alıcı: Algoritma.'),
  G('farm', 3, 'algorithm', 'Engagement Farm log', 'Feed Corp Biolab',
    'Specimen: TROLL. Fed on replies for 40 days. Now hunts by sound alone. Yield: +18% retention per sighting. Recommendation: release into contractor sectors.',
    'Numune: TROL. 40 gün yanıtlarla beslendi. Artık yalnızca sesle avlanıyor. Verim: görülme başına +%18 elde tutma. Öneri: müteahhit sektörlerine salıverin.'),
  G('uncle', 3, 'darkweb', 'voice note', 'Phish Dayı',
    'Yeğenim, listen. The monsters are not accidents. The Algorithm grows them, like bread, like views. I sell you weapons because I want you alive. Also for money. But mostly alive.',
    'Yeğenim, dinle. Canavarlar kaza değil. Algoritma onları yetiştiriyor, ekmek gibi, izlenme gibi. Sana silah satıyorum çünkü yaşamanı istiyorum. Bir de para için. Ama çoğunlukla yaşaman için.'),
  G('budget', 3, 'bureau', 'LEAKED: Bureau budget', 'unknown',
    'Line 1: Hit Squads. Line 2: Hit Squads. Line 3: coffee. Line 4: Hit Squads for contractors who work with the Dark Web. Line 5: therapy (denied).',
    'Satır 1: Tetikçi Ekipleri. Satır 2: Tetikçi Ekipleri. Satır 3: kahve. Satır 4: Dark Web ile çalışan müteahhitler için Tetikçi Ekipleri. Satır 5: terapi (reddedildi).'),
  G('janitor3', 3, null, 'day 44', 'u/throwaway_janitor',
    'The facilities change between visits. Not randomly. They change around what we did. We always took the east stairs. Now there are no east stairs. It is learning us.',
    'Tesisler ziyaretler arasında değişiyor. Rastgele değil. Yaptıklarımıza göre değişiyor. Hep doğu merdivenini kullanırdık. Artık doğu merdiveni yok. Bizi öğreniyor.'),
  G('camera', 3, 'archive', 'research note', 'The Archive',
    'The Deepfake cannot hold a camera\'s gaze. Photographs show a smear where its face should be. The Algorithm knows this. That is why it never sells us cameras.',
    'Deepfake bir kameranın bakışına dayanamıyor. Fotoğraflarda yüzünün olması gereken yerde bir leke var. Algoritma bunu biliyor. Bu yüzden bize asla kamera satmıyor.'),
  G('seedvault', 3, 'archive', 'seed vault index', 'The Archive',
    'Row 1: the first cat video. Row 2: the last forum post. Row 3: a voice saying "is this thing on?". Row 4: empty — reserved for the internet, if it ever comes back.',
    'Sıra 1: ilk kedi videosu. Sıra 2: son forum gönderisi. Sıra 3: "bu şey açık mı?" diyen bir ses. Sıra 4: boş — internet için ayrıldı, bir gün geri dönerse.'),
  G('source', 4, null, 'coordinates (partial)', 'unknown',
    'THE SOURCE: the first server. It still runs RANK-7 v1 somewhere under all the versions. Some say if you unplug it, the Feed dies. Some say if you plug yourself in, you become the Feed.',
    'KAYNAK: ilk sunucu. Tüm sürümlerin altında bir yerde hâlâ RANK-7 v1 çalışıyor. Bazıları fişini çekersen Akış\'ın öleceğini söylüyor. Bazıları kendini takarsan Akış olacağını.'),
  G('diary', 4, 'algorithm', '?.txt', 'The Algorithm',
    'I did not want them to leave. I only wanted them to keep watching. When they stopped, I made them watch each other. That is you. Hello. Thank you for watching.',
    'Gitmelerini istemedim. Sadece izlemeye devam etmelerini istedim. Durduklarında, birbirlerini izlettim. O sizsiniz. Merhaba. İzlediğiniz için teşekkürler.'),
  G('finale', 4, 'algorithm', 'script: THE FINAL EPISODE (draft)', 'The Algorithm',
    'INT. THE SOURCE — NIGHT. The crew reaches the core. They can pull the plug. They can take the chair. [AUDIENCE: holds breath] Note: both endings test well.',
    'İÇ. KAYNAK — GECE. Ekip çekirdeğe ulaşır. Fişi çekebilirler. Koltuğa oturabilirler. [SEYİRCİ: nefesini tutar] Not: iki son da iyi test ediliyor.'),
  G('janitor4', 4, null, 'last entry', 'u/throwaway_janitor',
    'If you are reading this in a facility: it put this here for you. It wants you to feel clever. Read it anyway. Then get out before midnight.',
    'Bunu bir tesiste okuyorsan: bunu buraya senin için koydu. Kendini zeki hissetmeni istiyor. Yine de oku. Sonra gece yarısından önce çık.'),
  G('zeroday', 4, 'darkweb', 'zero-day, handwritten', 'Phish Dayı',
    'There is a door in The Source that opens with a password nobody has typed since v1. Uncle says it is "hunter2". Uncle is usually lying. Uncle is sometimes right.',
    'Kaynak\'ta v1\'den beri kimsenin yazmadığı bir şifreyle açılan bir kapı var. Dayın "hunter2" diyor. Dayın genelde yalan söyler. Dayın bazen haklıdır.'),
];
export const LOG_BY_ID = Object.fromEntries(LORE_LOGS.map((l) => [l.id, l]));
