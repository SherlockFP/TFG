# Company casino ve Dead Letter Run uygulama planı

Tarih: 2026-10-01. İncelenen main: 7ceffb6. Durum: tasarım ve kaynak denetimi; aşağıdaki yeni içerik henüz uygulanmış özellik değildir. Casino, harita ve savaş ajanları ayrı okuma denetimleri yaptı. Bu plan için üretim kodu veya yeni oyun testleri değiştirilmedi.

## 1. Yön ve mevcut zayıflıklar

TFG'nin kimliği ölü internet, arşiv işçileri, Algorithm ve fiziksel ekip çalışması. CloverPit'ten makinenin kurallarını değiştiren küçük kombinasyonları; Vampire Survivors/Megabonk'tan sık güçlenme kararlarını ve kalabalık karşısında konum almayı; Torghast'tan seferlik güç seçimleri, kat kuralları ve riskli yan odaları alıyoruz. Kart saldırısını mevcut kart silahından geliştiriyoruz. Karakter, model, isim ve haritalar TFG'ye özgü olacak. Bu referanslar tasarım yorumudur; bu tur yeni bir internet araştırması yapılmadı.

| Alan | Kaynakta mevcut | Zayıf taraf / gereken değişim |
| --- | --- | --- |
| Casino | Company'de kapalı Dead Signal Club; Mica, Signal Reels, Zero Wheel, Packet Broker; host doğrulaması ve chip bozdurma | Dengesiz getiriler, slotta karar eksikliği, dört basit tezgâh, kısa ortak sonuç geçmişi |
| Kartlar | Stacked Deck; aktif nişan, üç kart, R ile özel kart seçimi, host atış biletleri | Sürekli dalgalara göre tasarlanmamış; yeni mod için güç kombinasyonları ve daha güçlü isabet doğrulaması gerekiyor |
| Affix | Silah prefix/suffixleri ve altı yaratık affixi mevcut | Oyuncunun kurduğu seferlik build, kişisel üçlü güç seçimi ve kat kuralları aynı şey değil; bunlar eklenecek |
| Moonlar | Cloud-9 röle/rüzgâr/köprü, Deep Cable ağır çekirdek/hava sığınağı, Dark Web sesli navigasyon | 503 ve ∞-Feed'de yeni görünümün yanında yeni kararlar daha zayıf; derin katlarda mobilya ve oda tekrarları var |
| Derinlik | Fiziksel asansör, tek yüklenen tesis, sonlu tema havuzu, kontrollü zorluk | Sonsuz dalgalar, her kat bossu ve kişisel draft modu henüz yok; mevcut quota temelli endless bu yeni modun yerine geçmez |

Son bağımsız not 7.9/10. Plan hazırlamak bu notu artırmaz. Önceki turda tam doğal asansör yürüyüşü ve yeni varış görünümü tamamlanmadı; yeni içerikten önce bu kısa yaşayan-oyuncu kontrolü tamamlanmalı.

## 2. Company: kumar atölyesi

Mekân mevcut 22×22 kapalı casino alanından gelişecek. Güneydeki 6 m giriş, satış hattı ve tüm makinelerin ayakta etkileşim noktaları açık kalacak. Girişte kasiyer/kurallar, yanlarda normal masalar, arka tarafta iki yeni kabin, küçük oturma ve seyir alanı. Büyük salonu aynı cihazın kopyalarıyla doldurmak yerine her cihaz başka bir karar verecek.

Sanat: yıpranmış krem kâğıt, koyu çelik, az hardal sarısı ve bordo; basılı ikonlar, dişli ve röle gibi belirgin siluetler. Yüzen tabelalar yerine cihaz üstü panolar. Çalışan NPC'ler mevcut PSX işçi model ailesine uyacak. Geniş neon yeşil yüzeylerden kaçınılacak. Model çarpışmaları, atlaslar, durma animasyonları ve kaynak temizliği birlikte ele alınacak.

### Önce ekonomi düzeltmesi

Gerçek casino13_core fonksiyonu tüm 216 slot sonucu ve 37 wheel sonucu üzerinde çalıştırıldı. Packet oranları mevcut ardışık olasılıklardan hesaplandı; aşağıdaki değerler bir simülasyon tahmini değil, mevcut kuralların beklenen brüt dönüşüdür.

| Oyun / strateji | Bahsin beklenen dönüşü |
| --- | --- |
| Signal Reels | %47.22 |
| Zero Wheel | %97.30 |
| Packet: bir push, sonra cash | %130 |
| Packet: iki push, sonra cash | %143 |
| Packet: üç push, sonra cash | %128.70 |

Slotun kaybı çok sert; Packet tekrar oynama ve 1:1 bozdurma üzerinden beklenen Credit üretimine açık. Öncelik Packet'in her durdurma stratejisini hesaplamak ve sıradan oyunların ortalama dönüşünü başlangıçta yaklaşık %90–97 aralığına getirmek. Bu bir ayar hedefidir, henüz uygulanmış yeni oran değildir.

Yeni kart kombinasyonlarının bütün olası sonuçları da hesaplanacak. Sabit ücretli kısa seansın kartlar dahil toplam değeri incelenecek; tek bir yüksek ödeme örneğiyle denge kararı verilmeyecek. House ödeme rezervi kullanılırsa, yalnızca gerçek sefer ilerlemesinde yenilenecek; kapıdan çıkıp girme/save yükleme rezervi sıfırlamayacak. Kabul edilen bahis ve bekleyen turun maksimum ödemesi önceden karşılanacak. Kazanılmış ödül veya oyuncunun yatırdığı chip aniden bozdurulamaz hâle gelmeyecek.

Rezerv yalnız aktif turu değil bütün cüzdanlardaki bozdurulabilir kazanç borcunu kapsar. Packet cash ödülünü chipe çevirince borç silinmez; daha sonra redeem yapılana kadar taşınır. Kart seçimlerinden erişilebilecek en yüksek seans ödemesi de bahis kabulünde hesaba katılır. Yeni round/session kuralları versiyonlanır. Eski kayıttaki versiyonsuz Packet potu korunur; kalan legacy push hakları o turun eski kurallarıyla biter, sonraki yeni tur dengeli sürüme geçer. Migration tekrar yüklemede aynı sonucu vermeli, yeni bakiye üretmemeli.

### Yeni oynanabilir makineler

1. **Induction Cabinet — İndüksiyon Kabini.** Sabit ücretli altı çevrim. 1., 2. ve 4. çevrimden sonra iki seçenekten bir makine kartı seçilir; seçilen etki sonraki çevrimlerde çalışır. İki kart yuvası var; üçüncü güç için birini değiştirmek gerekiyor. Örnek: Tutucu Bobin bir makarayı saklar ama üçlü ödemeyi azaltır; Ayna Rölesi komşu sembolü kopyalar ama ikili ödemeyi kaldırır; İzolasyon bir kaybı hafifletir ama sonraki kazancın tavanını düşürür. Etki onaydan önce kısa ve açık yazılır.
2. **Checksum Press — Doğrulama Presi.** Üç numaralı kanal kartından birini koru; host yeni kartı çeksin. Eşleşme ödülü büyütür, aşırı yük riski artar. Bir kanalı sansürlemek riski ve ödül tavanını azaltır. Bozdur veya en fazla üç aşama devam et.

Normal slot, wheel ve Packet kalır; yeni makineler kendi kısa seans mantıklarıyla oynanır. İleride büyütülebilecek bir VIP odası ilk sürüm için gerekli değil.

NPC görevleri: Mica chip alım/bozdurma; bir mekanikçi iki kart yuvasını anlatır; mevcut dealer sonuçlara tepki verir. Yakındaki ekip cihazın mevcut turunu ve son sonucunu görür. Geçmiş makine başına saklanır; başka masadaki üç oyun bu masanın sonucunu silmez. Seans kapatılırsa aynı host turuna dönülür, yeniden ücretsiz çekiliş yapılmaz.

Casino kartları yalnız o seansın cihazını değiştirir. Savaş güçlerini chip ile satın almak veya casino ödülünü quota başarısı saymak planın parçası değildir.

## 3. Ayrı isteğe bağlı mod: Dead Letter Run

Tek başına veya ekipçe oynanır. Hub'da arşiv giriş terminali bulunur; host mod seçer, ekip yeni seansa katılır. İlk sürümde yalnız güvenli hub/orbitten giriş ve native kaydın korunması desteklenir. Aktif moon seferinin ortasında geçiş, inventory/clock sınırları doğrulanmadan açılmaz.

Oyuncu teslim edilemeyen kayıtları temizleyen bir arşiv işçisi. Yön:

**Giriş → dalgalar ve kısa keşif → güvenli güç seçimi → son dalga → kat bossu → ödül/güç seçimi → daha derine in veya çık.**

Dalga sırasında yaratıklar sürekli ama bütçeyle gelir. Boss çağrılınca normal dalga durur; boss yardımcıları ayrıca sınırlı olur. Kat bossu bitmeden sonraki asansör açılmaz. Her katta boss var; prototip aynı bossun farklı arena ve atak varyantlarıyla başlar. Yüzlerce benzersiz boss vaat edilmiyor.

İlk hedef kat başına 3–5 dakika; üç katlık sefer yaklaşık 12–18 dakika. Bunlar solo/iki oyunculu gözlemle ayarlanacak hedefler. İlk kat sade ve okunur olacak. Daha derinde önce yeni düşman kombinasyonları, arena düzenleri ve bir kat kuralı gelir; hız/hasar sonsuza kadar yükselmez.

### Kart saldırısı ve build

Mevcut kart atış altyapısı kullanılacak. LMB ile nişanlı temel arşiv fişi atılır; mevcut R seçim akışı anlaşılır kısa göstergeyle geliştirilir. E etkileşim, C çömelme olarak kalır; yeni browser Ctrl kısayolu kullanılmaz.

Yeni modun üç özel fişi:

- **Geri Al:** fiş geri döner; iyi konum alıp yakalayınca özel saldırı beklemesi kısalır.
- **Çoğalt:** daha zayıf fiş belirli sayıda duvar sekmesi yapar; her hedefe sınırlı isabet.
- **Karantina:** dar bir alanı kısa süre yavaşlatır; bossu sürekli sersemletmez.

Yeni adlar/görseller mod içindir; eski item kimlikleri, saved affixler ve dış mod API'leri topluca yeniden adlandırılmaz.

Prototipte bir aktif silah ve sekiz seferlik güç yeterli. Örnek güçler: delici zımba, çift baskı, son isabette işaret, dönüş fişi, daha geniş karantina ama uzun bekleme, kısa menzilde kritik, uyarılı darbe kalkanı, ağır fakat güçlü atış. Tam içerik aşamasında iki aktif silah, en fazla dört otomatik yardımcı ve altı pasif güç yuvası hedeflenir. Güçlerin birbirini tetiklemesi sınırlı; sonsuz proc zinciri veya boss stunlock yok.

Örnek build: Delici Zımba + Geri Al ile aynı çizgi üzerinde ileri/geri hasar; Çoğalt + İşaret ile köşelerden zayıflatma; Karantina + yakın mesafe kritik ile kontrollü risk. Rastgele sadece +%5 hasar seçeneklerinden daha belirgin oynanış değişimleri aranır.

### Affixler, nadir loot ve garanti ilerleme

Üç düzey ayrı gösterilecek: oyuncunun fiş/silah affixi, seçtiği seferlik güç, kat/düşman kuralı. Aynı kart terimiyle üç ayrı ekonomi kurulmayacak.

İlk kat affixsiz; sonraki katta en fazla bir okunur affix. Örnekler: Zırhlı Denetim önden korunur, yandan açık; Yankılı fiş gürültüsü bir dinleyiciyi çekebilir; Eksik Yedek tehlikeli yan oda karşılığında ekstra draft seçeneği verir. İki zor kuralın birlikte kaçışı veya boss hasar penceresini yok etmesi engellenir.

Silah/skill dünyadan nadir düşer, fakat ilk silah başlangıçta kullanılabilir. Her uygun düşmana %1–2 vermek kalabalıkta çok fazla drop demektir; toplam sefer düşman sayısıyla beraber hesaplanacak. İlk aday: sadece belirlenmiş elitlerde %3 alternatif silah/skill şansı, kat başına en fazla bir nadir drop. 10 uygun elit varsa en az bir drop ihtimali yaklaşık %26.3; 30 varsa %59.9. Elite sayısı ve fırsat bütçesi bu yüzden sabitlenecek. Sayılar test öncesi adaydır.

İlerlemenin temeli nadir droplar değil: güvenli dalga arasındaki bir ve kat bossu sonrasındaki bir kişisel üçlü güç seçimi garantidir. Zaten maksimuma çıkan güç seçeneklere konmaz; en az bir seçenek mevcut silahla işe yarar. Seçilmemiş güç güvenli sonraki araya taşınabilir. Kötü şans oyuncuyu ilk silahsız veya gelişimsiz bırakmaz.

Nadir silahlar alternatif oynanış açar; çıkışta taşınacak kalıcı blueprint/kozmetik ödülleri ancak ayrı tamamlanma kuralları ve tek seferlik ödül kimlikleriyle uygulanır. Seferdeki silah, güç, XP ve affixler seferliktir; ana oyuna sınırsız Credit, chip, quota, bounty veya XP üretmez.

## 4. Üç özgün kat ve mevcut moon iyileştirmeleri

| Yer | Mekân / karar | Kat bossu fikri |
| --- | --- | --- |
| Ölü Posta Tasnifhanesi | Numaralı yan kollar ve merkez dağıtım hattı; kısa açık yol veya uzun korunaklı hat | İade Memuru: uyarılı süpürme ve toplama atakları; geri çekilme hattını koru |
| Sessize Alınmış Santral | Kopuk santral halkası, kabinler ve servis koridoru; ses yemini kullanıp kalabalığı yanlış kanala yönlendir | Bekletme Operatörü: atak öncesi ayırt edilir ton, görünür vericiyi keserek açık yarat |
| Süresi Dolmuş İzin Ofisi | İki erişim galerisi ve mahremiyet panjurları; gözetlenen kestirme veya uzun örtülü yol | Rıza Motoru: gözetim/soğuma evreleri; panjurlarla güvenli açı kur |

İlk uygulamada yalnız Tasnifhane gerekir. Diğer ikisi başarılı prototipten sonra gelir. Sonlu oda parçaları farklı seed ve kurallarla birleşir; her yeni katın yepyeni asset seti olacağı söylenmez.

Ana oyunda öneriler: ∞-Feed'de bildirim direğini kesmek güzergâhı sessizleştirir ama uzak yol işaretini kaybettirir; 503'te yedek enerji modülünü loot olarak taşımak veya bir servis yolunu açmak için harcamak arasında seçim; Thread Archive'da numaralı ana hat ve daha okunur yan oda eşikleri. Bu işler normal salvage/kaçış döngüsüne isteğe bağlı karar ekler.

Hotel'in üst katlarında sıradan yaratık navigasyonu eksik; burası hazır wave arenası sayılmayacak. Kat geometrisi, boss boyutu, kapılar, panjurlar, downed beden ve geri dönüş yolu gerçek fiziksel doğrulama ister.

## 5. Teknik sınırlar ve paylaşılacak altyapı

| Var olan dosya / sistem | Kullanım | Eksik sözleşme |
| --- | --- | --- |
| src/game/casino13_core.js ve casino13.js | Tek native casino chip ledger, host istasyon/seq doğrulaması | Dengeli seanslar, kartlar, rezerv ve per-table sonuçlar |
| src/world/company.js ve casino13_models.js | Kapalı alan ve fiziksel istasyon anchorları | Yeni PSX model/çarpışmalar, seyir, ayakta erişim testi |
| src/game/deck.js ve weapons.js | Kart görseli, atış biletleri, host hasarı | Nişan/yol/duvar doğrulaması, sınırlı ricochet ve yeni mod fişleri |
| src/game/loot.js ve creatures.js | Normalleştirilmiş silah affixleri, host yaratıklar | Mode-only loot/proc sınırları ve build uyumu |
| src/game/cycle_bosses.js | Boss fazları, telegraph, crew scaling | Mode-only completion; normal para/ödül hooklarından ayrılma |
| src/game/descent21.js ve world/descent23_routes.js | Tek aktif tesis, certified streaming ve ayakta erişim yaklaşımı | Kart moduna ait arena, spawn ve ekip geçiş koşulları |
| src/game/algo1.js | Üç seçenek sunma görsel deseni | Crew oylaması yerine kişisel, nonce ile doğrulanan draft |

Yeni modun host durumu run.deadLetter altında versiyon, token, seed, floorRevision, phase, crew builds, draftNonce ve tamamlanan encounter ID'leri taşıyacak. Normal campaign kendi native kaydında korunur; casino chipleri veya cycle.endless sayacı bu modun güç parası olmaz.

İlk prototype dosya sınırları: deadletter_core (pure pacing/draft/bütçe), deadletter (install/lifecycle/net), deadletter_cards (mevcut deck uyarlaması), deadletter_floors (arena/generator doğrulaması), deadletter_text ve tek küçük draft görünümü. Bütün projeyi başka bir motorla tekrar yazmak gerekmiyor.

Ana reward hookları girişten önce denetlenecek: creature/boss death, XP/bounty, satış, midnight ve quota. Mode-owned aktör/item kimliği, sessiz cleanup ve terminal tek-sefer ödülü olmadan sonsuz dalga açılmaz. Mode itemlerinin normal satış değeri sıfır; çıkışta main inventory ve save olduğu gibi geri gelir.

Host atış, isabet, boss ölümü, drop ve kişisel draftı doğrular. İstemci yalnız görseli tahmin eder. Atış bileti tek başına duvar arkasındaki hedefi vurmanın geçerli olduğunu kanıtlamaz. Net istekleri mode token + floor revision + nonce + peer + yaşayan oyuncu + mesafe/trajectory + tekrar kullanım kontrolü ister. Late join yüklenen katı ve buildi alır, geçmiş boss ödülünü tekrar üretemez.

Ekip kaybı: mevcut downed/3 saniyelik E-revive ve bleed-out kuralları kullanılacak. Solo için uygun mode-owned kit ile native bir self-revive hakkı var. Boss sonrası güvenli arada ölen ekip üyesi sefer buildiyle döner; önceden tamamlanan boss ödülü yeniden verilmez. Tüm ekip ölmüş ve geçerli toparlanma hakkı kalmamışsa sefer tek terminal olayla biter; tamamlanan kat skoru korunur, mevcut katın kazanılmamış ödülü verilmez. Bütün ayakta ekip asansörde olmalı ve downed üyeler önce toparlanmalı. Yalnız kalan bağlantısız üye kalıcı kapı kilidi yaratmaz: kısa, açık yeniden bağlanma süresi sonrası aktif roster'dan çıkarılır; build/nonce kaydı aynı doğrulanan session kimliği için korunur. Yeni kimlikle katılmak geçmiş draftı yeniden çektirmez, sonraki güvenli arada başlar.

Boss kabulü ayrıca gerekir: native spawnBoss, CreatureManager spawn gate ve global stat çarpanlarını kullanır. Adapter mode bosslarını quota/sector başarısını taklit ederek açmaz. Mode scaling bir kere uygulanır; campaign elite/sector ve mode çarpanları istemeden üst üste binmez. Geçerli boss odası bulunamazsa encounter başlamadan güvenli alternatif arena seçilir.

Host migration mevcut altyapının gerçekten desteklediği ölçüde test edilecek; ilk sürümde desteklenmiyorsa host kaybı açık bir güvenli çıkış/kayıt davranışıyla biter, sonsuz bekleme veya sahte migration başarısı ilan edilmez.

Başlangıç performans bütçesi: solo 12, 2–4 oyuncuda 20 canlı sıradan düşman; boss evresinde bir boss ve en fazla dört yardımcı; 96 aktif kart mermisi ve 24 geçici pickup. Bunlar ölçümle düşürülebilecek üst sınırlardır. Tek tesis yüklü; yaratık/mermi/görsel havuzları, birleştirilmiş statik modeller, önerilen mesafe temelli AI scheduler. Mevcut native AI bunun hazır garantisini vermez; uzak yaratığın atak/telegraph/timer doğruluğu ayrıca korunur. Kart başına ışık/Rapier rigidbody veya her ölümde yeni material yok. Takılmada yeni spawn ötelenir; zaten çalışan encounter'da bütün düşmanlar bir anda yaratılmaz.

Mermi kapasitesi host tarafından atış kabul edilmeden ayrılır; doluysa kısa açık geri bildirimle atış kabul edilmez, cooldown/özel kart harcanmaz. Kabul edilmiş saldırı sessizce kaybolmaz. Ömür, sekme sayısı ve hedef başına isabet geçmişi sınırlıdır; önceki floor revision'dan geç gelen hit yeni katı vuramaz. Yoğun dalgada net gecikmesi ve local prediction reddi de test edilir.

Sonsuzluk: floor sayısı, seed, kombinasyon, score ve encounter dizisi devam eder; eş zamanlı varlık ve log uzunluğu artmaz. Hasar/hız/HP çarpanları limitlenir, derinlik tek başına oyuncuyu kaçınılmaz tek vuruş ölümüne götürmez.

## 6. Uygulama sırası ve bitirme kriterleri

| Aşama | Teslim edilecek somut parça | Bitti sayılması için |
| --- | --- | --- |
| 0 — kısa kalite kapısı | Yaşayan oyuncuyla mevcut asansör yürüyüşü, panel ve varış gözlemi | Fixture konumları ayrı; gerçek tuş/E yürüyüşü ve iki peer durum uyumu; ölüm/blocked route gizlenmez |
| 1 — casino temeli | Packet/slot dengesi, per-table sonuçlar, reserve/seq/save kuralları | Bütün strateji/kart getirileri hesaplanır; replay, double-cashout, eş zamanlı seans ve kapatma/açma ödül üretmez |
| 2 — casino mekânı | İki cihaz, mekanikçi, altı çevrimlik kart seansı, doğrulama kart oyunu | Company satış/kapı yolu açık; her cihaz ayakta E; peer gerçek turu görür; kaynaklar bir defa temizlenir |
| 3 — savaş prototipi | Tasnifhane, üç kat, bir kart silahı, üç killable düşman rolü, bir boss ailesi, sekiz draft gücü | Solo ve iki peer giriş→dalga→draft→boss→asansör→çıkış oynar; normal para/loot/quota/save korunur |
| 4 — çeşit ve ilerleme | Üç kat kimliği, üç boss ailesi, alternatif silah/skill, affix kombinasyonları | Okunur counterplay, nadir drop bütçesi ve softlock olmayan boss arenası; buildler farklı oynanır |
| 5 — normal moonlar ve polish | ∞-Feed/503 kararları, archive yol işaretleri, iki aktif silah/dört yardımcıya doğru genişleme | Yeni kararlar optional; yeni prompt karmaşası yok; insan seferi ve temsilî cihazlarda frame-time gözlemi |

Her kaynak aşamasının kendi anlamlı native testleri, production build'i ve tek serialize browser kontrolü olacak. Doküman değişikliği için yedi dakikalık tüm oyun testini tekrar çalıştırmak gerekmiyor. Kaynak değişimlerinde casino, combat/deck/loot, boss, depth/lifecycle ve custody/save sınırları test edilir; tamamlanmış release bütün gerekli regression kontrollerinden geçer.

Kritik bug testleri: draft nonce tekrarı, yanlış floor/session, başka oyuncunun seçimi, sahte hasar/duvar arkası isabet, aynı boss ödülünün iki kere verilmesi, late join, disconnect, pending casino seansı, delayed item paketi, main profile'ın istemsiz büyümesi. Son ana kapı gerçek tuşlarla uçtan uca seferdir; yardımcı betik ölümü hemen fark eder.

İnsan testinde sorulacaklar: ilk build kararı anlaşılır mı, seçimler atış/konum almayı gerçekten değiştiriyor mu, boss hatası anlaşılabiliyor mu, oyuncu çıkma/inme kararını neden veriyor, casino kaybı ve kazancı anlaşılır mı, aynı tema üçüncü kez geldiğinde sıkıyor mu? Not hedefi 8–8.5; sayıya içerik adediyle değil bu gözlemlerle yaklaşılacak.
