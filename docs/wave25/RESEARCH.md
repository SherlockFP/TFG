# Bu oyunu nasıl daha iyi geliştirmeliyiz?

Araştırma tarihi: **2026-10-01**. Başlangıç oyunu main `0b169d8`, bağımsız teknik/görsel değerlendirme **8.0/10**. Kullanıcının hedefi daha özgün, okunabilir, korkutucu fakat yormayan ve tekrar açmak istenen bir oyun; ayrı Dead Letter savaş modu da tatmin edici kart gelişimi sunmalı.

Birincil kaynaklar bu turda HTTPS ile gerçekten indirildi ve metinleri incelendi. Oyunların resmi mağaza metinleri onların geliştiricilerinin tasarım vaatleridir; bu oyunları oynadığımızı veya retention verilerini ölçtüğümüzü göstermez. Valve/Frictional yazıları geliştirici deneyimleri ve yöntemleridir; her sonucu TFG'ye doğrudan taşımak doğru değildir. MDN kaynakları teknik sözleşmeleri destekler. Bu tur yeni geniş oyuncu-review örneklemi veya Internet/hardware benchmark yapmadı; Wave19'un küçük yorum örneklemi geçmişteki ayrı nitel kanıttır.

## Önce teşhis: şu an ne zayıf?

| Gözlenmiş durum | Oyuncuya etkisi | Öncelik |
| --- | --- | --- |
| Wave24 gerçek map unload sırasında yerel state teslimi tekrar map build başlatmıştı; düzeltildi. | İlk moda girişte oyun kırılması bütün içeriğin değerini siler. Gerçek modüllerle sınır testi zorunludur. | Korunacak regresyon |
| Mod girişi tabela olmadan terminalin yanındaki bir noktadır; bazı yaklaşımlarda Empty mount seçilir. | Oyuncu yeni içeriği bulamıyor; E çalışmadı sanıyor. | Bu tur |
| Kampanya rehberi, mode control text'i ve Codex bildirimi aynı anda yarışır. | Yeni dövüş mekaniğini öğrenirken zihinsel yük ve ekran kalabalığı. | Bu tur |
| Özel kart host cooldown/engel nedeniyle reddedilince yerel seçim yine sıfırlanır. | Planlanan taktik kaybolur, kontrol güvenilmez hissedilir. | Bu tur |
| Üç layout farklıdır ama karar noktaları aynı tür köşe kutuları ve üst süslerle okunur. | Yeni tema yeni karar gibi görünmeyebilir; karanlıkta yön belleği zayıf kalır. | Bu tur |
| Boss herhangi bir servis odasından doğabiliyor; eski hızlı kill fixture'ı uzun takibi sınamadı. | Amaçlanan arena dövüşü yerine dar odada sıkışma/okunmaz çatışma riski. | Bu tur gerçek sınır testi |
| İlk katın doğal boss/iniş döngüsü ve uzun süreli farklı build'ler bağımsız insanlarla henüz oynanmadı. | Eğlence ve denge için 8.5 iddiasına yeten veri yok. | Ayrı kanıt gerektirir |
| Yazılım WebGL küçük CPU örnekleri var; temsilî oyuncu donanımı p95/p99 yok. | “Takılma tamamen çözüldü” denemez. | Ölçüm planı, tahmini düzeltme yok |

Bu liste katalogdaki eksik silah/NPC sayısından daha değerlidir: mevcut içerik görülebilir, güvenilir ve ayırt edilir hâle gelmeden yeni katalog ilk dakikayı iyileştirmez.

## 1. Korku ve savaş moduna ayrı deneyim hedefleri ver

[Frictional'ın 9 Years, 9 Lessons on Horror yazısı](https://frictionalgames.com/2019-10-9-years-9-lessons-on-horror/) (2019) korkunun yalnız canavar ve jumpscare sayısıyla kurulmadığını anlatıyor. Sessizlik, arka plan hikâyesi, belirsizlik, tutarlı dünya ve oyuncunun kendi kararıyla tehlikeye girmesi önemli. Dövüş/loot optimizasyonu oyuncunun dikkatini kapladığında korku güç fantezisine dönüşebilir. Bu, Amnesia ekibinin deneyimidir; otomatik olarak bütün co-op oyunlarında silahların kaldırılması gerektiği anlamına gelmez.

TFG için iki açık sözleşme:

- **Normal sefer:** keşif → buluntu/tehdit işaretlerini yorumlama → riskli haul veya güvenli dönüş → ekip hikâyesi. İlk bölgede gizem; düşman görülmeden ses/çevresel iz. Karanlık niyeti saklayabilir ama kapı, kullanılabilir kontrol ve saldırıdan kaçış anlaşılabilir olmalı.
- **Dead Letter Run:** kısa başlangıç → okunabilir atış/kaçış → kazanılmış kart → farklı taktik → boss → bir kat daha veya çıkış. Burada anlaşılır sayı, güçlü build ve kesintisiz çalışan özel kart arzu edilir. Normal korku seferinin hasar/ekonomi/director kurallarını bu modla ezmeyiz.

Nadir jumpscare kullanılabilir; oyuncunun eylemiyle ilişkisi ve sonrasında karşı oyun olmalı. Sürekli jumpscare, rastgele kapı kilidi ve açıklanamayan ani ölüm yerine ilk kez öğrenilebilen düşman davranışları tercih edilir. Mevcut normal sefer ile ayrı mod arasındaki checkpoint/ödül izolasyonu bu tasarım ayrımını korur.

## 2. Baskıyı sürekli artırmak yerine ritim kur

[Mike Booth, The AI Systems of Left 4 Dead](https://cdn.akamai.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) (2009, Valve'ın [yayın dizininde](https://www.valvesoftware.com/en/publications) doğrulandı) sabit çatışmanın yorucu, uzun boşluğun sıkıcı olduğunu anlatıyor. Director yoğunluk zirveleri ve aralar kuruyor; yaklaşan baskının sıklığını değiştiriyor. Sunum özellikle pacing ile difficulty'yi ayırıyor: her an düşmanın hasarını gizlice oynatmak aynı şey değildir.

TFG'de uygulanacak ilke: düşük baskı → bir belirti → karşılık verilebilir tehdit → kısa toparlanma → yeni karar. Normal seferde bir oyuncu downed olduğunda yeni baskı yığmak yerine kurtarmayı anlamlı kılmak gerekir; mevcut düşmanların varlığını gizlice silmek güveni bozar. Yeni başlayanların bütün hub sistemlerine erişmesi, ilk görevde bütün tehditlerin açık olması demek değildir.

Dead Letter'ın mevcut 3/5/7 ilk dalgası, kısa intro ve kazanılmış kart araları bu ritmin ilk sürümüdür. Bunları yalnız dosyadaki sayı üzerinden dengeli sayamayız. Tam ilk kat boyunca oyuncunun kaçış alanı, hasar, sessiz/baskılı süre, kart arası sayısı ve boss'a ulaşırken kalan seçenekler kaydedilmeli. Bu tur doğrulanmış kontrol/arena sorunlarını düzeltir; otomatik duygusal-intensity sistemi veya bedava heal eklemez.

## 3. Özgünlük, ismin değil oyuncunun kararının değişmesidir

Resmi açıklamalarda [Lethal Company](https://store.steampowered.com/app/1966720/Lethal_Company/) terminal/radar desteği ve gece dönüş riskini; [R.E.P.O.](https://store.steampowered.com/app/3241660/REPO/) ağır/kırılgan eşyanın fiziksel taşınmasını; [Content Warning](https://store.steampowered.com/app/2881650/Content_Warning/) tehlikeyi filme alıp ekipçe izlemeyi; [Deep Rock Galactic](https://store.steampowered.com/app/548430/Deep_Rock_Galactic/) birbirini tamamlayan sınıf/gezinti araçlarını öne çıkarıyor. Bunlar aynı co-op omurgadan farklı oyuncu kararları çıkarıyor.

TFG'nin en iyi özgün ekseni **ölü internetten içerik kurtaran, Algorithm'ın gözetlediği bakım ekibi**. Mevcut kamera güç hattı, kayıt/ses yönlendirme, archive intake ve fiziksel cargo bunu destekliyor. Sonraki tasarımlarda tek bir özgün fiili derinleştirmek daha değerlidir: ekip kamerayı kesip görünürlüğü mü feda edecek, kaydı yem olarak mı kullanacak, kolay açık rotadan mı yoksa yavaş korunaklı servis yolundan mı dönecek? Yeni mekaniğin görevdeki bir kararını açıklayamıyorsak önce mevcut sisteme uyarlayıp sadeleştiririz.

REPO veya Lethal modundan “hangi problemi çözüyor?” fikri alınabilir. Karakter, ticari model, isim, belirli oda/yaratık tasarımı kopyalanmaz. TFG'nin PSX işçi/CRT/posta/arşiv dili, yerel fizik ve native ledger'i kullanılır.

## 4. Tekrar oynanabilirlik: yapılandırılmış değişkenlik

Booth'un sunumu az sayıda haritanın da farklı ekip etkileşimleriyle tekrar oynanabildiğini; sabit encounter ezberinin keşfi yarıştırmaya çevirebildiğini anlatıyor. [Replayable Cooperative Game Design: Left 4 Dead](https://cdn.akamai.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf) bu ekip ve tekrar oynanabilirlik yaklaşımının ikinci birincil kaynağıdır.

TFG'de “sonsuz derinlik”, sonsuz farklı üretilmiş canavar anlamına gelmez. Sonlu iyi theme/creature/rule havuzu, farklı route/loot/baskı birleşimleri ve capped tehdit sayısı vardır. Oyuncu ortak görsel grameri öğrenirken farklı kombinasyonlara yanıt verir. Her yeni katta tamamen farklı kontrol/puzzle getirmek tekrar oynanabilirlikten çok tutorial yükü yaratır.

İyi bir floor modifier, tek kısa kuralla mevcut fiilin değerini değiştirir ve karşılık içerir. Tasarım örneği: bazı kameraların altında taşınan içerik daha çok dikkat çeker ama servis yolu güvenlidir. Bu **gelecek tasarım örneğidir**, bu tur yeni affix olarak teslim edilmez. Rastgele ceza, aynı ödülün daha yüksek sayısı veya değişmeyen koridorun yeni adı yeni karar üretmez.

## 5. Kart gelişimi: seçimler aynı sonuca çıkmamalı

[Vampire Survivors](https://store.steampowered.com/app/1794680/Vampire_Survivors/) minimal kontrol ve aşamalı offensive upgrade; [Megabonk](https://store.steampowered.com/app/3405340/Megabonk/) değişen rarity teklifleri, silah/karakter upgrade ve item sinerjilerini anlatıyor. Bir oyunun mağaza açıklaması sinerjilerin TFG'de kendiliğinden iyi dengeleneceğini kanıtlamaz.

Mevcut on kartın değeri farklı fiziksel durumlarda değişmeli: pierce kalabalık çizgileri, bounce köşe açısını, returning slip geri güzergâhı, quarantine kaçış penceresini destekler. Oyuncu yalnız hep +damage seçiyorsa daha çok kart adı eklemek çözüm değildir. Kontrol güvenilirliği, gerçek obstacle/LOS ve farklı yaklaşım alanları önce gelir.

Her level'daki üç **kullanılabilir** kişisel teklif, nadir loot RNG'sinden ayrılmalı; mevcut core bu ayrımı yapıyor. Kalıcı ödül farm'ı veya günlük zorunluluk eklemek kısa yeniden deneme isteğinin yerini almamalı. Sonraki insan testinde alınan kartlar, rank tercihleri, gerçek kullanım ve “hangi kombinasyonu tekrar denemek istedin?” yanıtları incelenir. Farklı build'ler aynı input/damage akışına çıkıyorsa bir davranış kombinasyonu iyileştirilir.

## 6. Casino'yu ekonomiyle karıştırmadan amaçlandır

[CloverPit'in resmi açıklaması](https://store.steampowered.com/app/3314790/CloverPit/) charm/combo, seeded run, round hedefi ve tek mekânda ilerleyen bir escape-room fikrini anlatıyor. Dolayısıyla yalnız slot makinesi sayısını artırmak bu deneyimi taşımaz. TFG Card Archive'ın NPC/blackjack/poker temeli mevcut; ayrı challenge/modifier kabinleri henüz tasarım aşamasında.

İlhamın TFG uyarlaması, ileride kısa, açık başlangıç/bitişi olan kendi oturumunda kombinasyon deneme olabilir. Modifier gerçek kampanya chip payout'unu kontrolsüz büyütmemeli. Mevcut versioned Packet, house liability, stable-PID wallet ve private dealer deck korunur. Oyuncu close/reopen veya reload ile stake/hand kaybetmemeli; migration/private-save sözleşmeleri farklıdır ve ayrı test edilir. Casino'ya sürekli uğramak ana seferin zorunlu bakımına dönüşmemeli.

## 7. Sanat, karanlık ve onboarding aynı okunabilirlik problemidir

[Jason Mitchell, Connecting Visuals to Gameplay at Valve](https://cdn.akamai.steamstatic.com/apps/valve/2008/MIGS08_ConnectingVisualsToGameplay.pdf) (2008) ilk okumada silhouette, kontrast hiyerarşisi ve karanlıkta yönlendirmeyi ele alıyor. Daha çok parlak alanın her zaman daha okunur olmadığını gösteriyor. TFG için bu, yeni light eklemek veya her şeyi yeşil emissive yapmak anlamına gelmez: mevcut sabit LightPool, kirli ivory/charcoal/steel/ochre değer ayrımı ve küçük işaretler kullanılır.

Mevcut art bible'ın işçi oranları ve faceted CRT yüzleri doğru temel. İşe yarayan okunabilirlik kontrolleri: normal göz yüksekliğinde girişin yeri, yaklaşılabilir kontrol, low-cover ile standing-cover ayrımı, her lab'ın karar noktasında tanınabilir tek silhouette ve saldırıdan önce görülen tell. Bir model Blender'da ayrıntılı diye iyi değildir; oyundaki gerçek ışık/ölçek/PSX çözünürlüğünde okunması gerekir.

Kampanya tutorial'ını ayrı savaş modunda zorlamamak, kaydettiği ilerlemeyi silmek değildir. Mevcut rehber kısa süre bekler, moda ait kısa kontrol cue'su görünür ve çıkışta kaldığı yerden döner. Acil hasar, downed rescue ve saldırı uyarısı öğretimden önceliklidir. Menü, Codex ve rutin bildirimin aynı anda konuşmasını azaltmak oyuncunun öğrenmesini kolaylaştırır; yeni zorunlu ekran eklemek gerekmez.

## 8. Optimizasyon: önce tekrarlanabilir takılmayı ölç

[MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) gerçek WebGL hatalarının giderilmesi, draw batching, kaynakları açıkça bırakma, texture upload ve senkron API stall'larını ele alıyor. [PerformanceObserver.observe](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/observe) desteklenen entry türlerini kontrol etmeyi; [Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing) uzun frame'in script/render/style work'ünün görünmesini destekliyor. Desteklenmeyen entry türünde alternatif ölçüm gerekir.

TFG'nin geçmişteki gerçek helmet-camera kendi render-target'ını örnekleme hatası ve boş Voyage marker layout work'ü zaten düzeltilmişti. Bunları yeniden “yeni optimizasyon” diye sunmayız. Sonlu projectile/aktör sayısı, merged map geometry, cached atlas ve once-owned disposal teknik bütçedir; gerçek kullanıcı FPS sonucu değildir.

Sonraki takılma incelemesi aynı seed/rota/ayar/donanımla yapılmalı: boot/warm-up ayrı, gerçek zamanlı p50/p95/p99 frame ve >50ms sayısı ayrı; giriş/teleport/rebuild tepeleri de ayrı. CPU update/mod/physics/DOM ile GPU render maliyetini ayır. Uzun oturumda tekrar travel sonrası heap/geometry/texture sayıları plato yapıyor mu bak. Shader/light-count veya live pipeline davranışı kanıt olmadan değiştirilmez. SwiftShader + elle tick ile yalnız boundary/teşhis kanıtı vardır.

## Güncellenmiş engineering loop neden farklı?

Bu konu için güncel ajan mühendisliği kaynakları da doğrudan okundu:

- [OpenAI, Harness engineering](https://openai.com/index/harness-engineering/) (**2026-02-11**): uygulama UI/log/metric'lerini ajanın okuyabildiği hâle getirme, sınırları mekanik doğrulama, kısa AGENTS ile derin repo belgelerine yönlendirme ve küçük sürekli bakım. Yazı bir iç beta deneyimini anlatır; hız tahmini veya minimal merge-gate tercihleri TFG için performans garantisi değildir. Bu repoda 954 satırlık tarihsel AGENTS kısa güncel haritaya dönüştürüldü, tam metin arşivlendi; eski no-test/Windows/auto-merge talimatları güncel girişten çıkarıldı. Mevcut ortak checkout'un sahipliği korunur; yazıdaki worktree altyapısı hazırmış gibi davranılmaz.
- [Anthropic, Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (**2025-11-26**): yalnız compaction ve “her şeyi yap” istemi yeterli değildir; küçük tamamlanabilir işler, gerçek end-to-end doğrulama, Git/progress üzerinden okunabilir devir ve çalışır durumda bırakma gerekir. Buradaki Wave README/PLAYTEST/REVIEW ve current CONTINUE bunun karşılığıdır. Makale web uygulaması deneyimidir; çok ajanın her durumda üstünlüğünü kanıtlamaz ve buradaki root Git sahipliğini değiştirmez.
- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (**2026-01-09**): capability ile regression ayrı; bir trace'te yapılan eylem, ortamda gerçekleşmiş outcome ile aynı şey değil. Temiz bağımsız kurulum, güvenilir grader/başarılı referans ve pozitif-negatif kontroller gerekir. En iyi bir tekrar (`pass@k`) ile bütün tekrarların güvenilirliği (`pass^k`) farklı sorulardır. TFG'de native ledger/controller regresyonları ile henüz tamamlanamayan doğal boss/iniş senaryosu ayrı raporlanır; başarılı son deneme önceki başarısızlığı silmez.

Somut bu tur örnekleri: üretilmiş kontrol satırı gerçek HUD'da görünmüyordu; OneGoal entegrasyonuyla düzeltildi. Son tarayıcı kontrolü bir yanlış DOM alt ağacını sorgulayınca görünür satırı yok sandı; gerçek kare ve doğru subtree, grader hatasını ortaya çıkardı. Oyuncu başına seed kaydı tam harita seed'i değildir; yeniden üretim kaydı mode/layout seed'ini de içermelidir. Aynı denemede otomatik yardımcı kapı köşesine takılırken native Auditor ayrıca bir bölmede kendi yolunu tekrar ederek kaldı. Biri operatör, diğeri kaynak hatasıdır; ikisini aynı “map kapalı” sonucu saymak yanlış düzeltme yaptırır.

[Mike Ambinder, Valve's Approach to Playtesting](https://cdn.akamai.steamstatic.com/apps/valve/2009/GDC2009_ValvesApproachToPlaytesting.pdf) tasarımları hipotez, playtest'i deney olarak ele alır. Teknik/statistik ölçüm ile insan davranış gözleminin farklı sorulara yanıt verdiğini açıklar; yönlendiren gözlemci ve sorular bias yaratabilir. [Steam Playtest dokümanı](https://partner.steamgames.com/doc/features/playtest) de gerçek oyuncudan geri bildirim almak için ayrı test erişimi sağlar; bunu TFG'nin browser platformu için bir Steam entegrasyon önerisi saymıyoruz.

Eski loop'un sorunu yalnız tarih değil: branch/main'e otomatik yayın yapan eski script, aynı klasördeki ajan sahipliğiyle uyuşmuyor; test kuralları “hiç / bir / birkaç tarayıcı” diye çelişiyor; programatik trigger ile gerçek oyuncu eylemi kolayca aynı rapora girebiliyor. Yeni [Gauntlet yöntemi](../GAUNTLET.md) somut hedef, entegrasyon sınırı, kanıt etiketi, sınırlı seans ve bug'a bağlı ilgili tekrar tanımlar. Sonuç puanı bağımsız gözlemden gelir; test sayısı ve eklenen sistem sayısı puan üretmez.

## Bu tur ve sonrasında doğru sıra

1. **Wave25 uygulaması:** görünür/ulaşılabilir mod girişi; tutorial/Codex yarışını azaltma; kabul edilmeyen özel kartın korunması; üç lab'ın gerçek karar noktalarında landmark; boss arena admission ve sustained native chase. Gerçek raporlar attention/combat/labyrinths dosyalarındadır.
2. **Doğrulama:** ilgili gerçek modül/fizik testleri, ardından donmuş kaynakta bir bounded host+peer full-first-floor denemesi. Tam boss/iniş gerçekleşmezse rapor kısmi kalır; sonuç zorlanmaz. Son hedef normal kampanya custody/economy'ye güvenli dönüştür.
3. **Sonraki insan turu:** yardım almayan küçük crew'lerle iki deneyim hedefini ayrı izle. İlk girişin keşfi, açık/servis yol tercihi, ölümün anlaşılması, kişisel build ve yeniden oynama isteği sorulur. Bu tur böyle bir insan örneklemi yapıldığı iddiası yoktur.
4. **Sonraki içerik:** gözlemde aynı karar tekrar ediyorsa bir yeni counterplay/build/room rule seç. Yeni boss veya casino challenge ancak gerçek mevcut döngü güvenilirken ve tek bir davranış hipotezini güçlendirirken gelir.
5. **8–8.5 yolu:** önce first-minute keşif ve kontrol güveni; sonra bir tam kat/co-op return; ardından birkaç normal tam seferin insan geri bildirimi ve temsilî donanım stutter atfı. Yapılmış fixture'lardan objektif enjoyment/retention veya garanti puan çıkarılmaz.

Başarısız kaynak denemeleri kanıt olarak kullanılmadı: tahmini GDC URL'si farklı bir eğitim oturumuna çıktı; ilk Frictional ayı yanlış URL 404 döndürdü, doğru yazı resmi WordPress API'si ve doğrudan sayfa ile bulundu; web.dev tahmini path'i ve accessibility deep-link'i 404 verdi. Bu dürüst kaynak ayrımı, eski bir tasarım dersinin hâlâ yararlı olmasını veya güncel bir mağaza metninin bağımsız başarı kanıtı olmamasını değiştirmez.
