# Wave32 — iki özgün ekip tehdidi

Durum: **tasarım önerisi; oynanış henüz uygulanmadı veya denenmedi.** 2026-10-03 tarihli sahip geri bildirimi eğlence için **1/10** başlangıç noktasıdır. Aşağıdaki süreler ve hasarlar ilk deneme hipotezidir; test sayısı bu puanı yükseltmez. Bu dalga iki yaratık ve tek kontrollü karşılaşma alanıyla sınırlıdır.

## Oyuncuya vaat

Koridorda bozulmuş bir arşiv işçisi görürsün. Feneri üstünde tutmadan sessizce geçmek mümkündür; arkadaşın yanlışlıkla uyandırırsa birlikte görüşünü kesip geri çekilebilirsiniz. Başka bir odada ağır bakım işçisi ayağını sabitler, omzunu indirir ve metal fren sesi çıkarır. Hücum edeceği çizgi bellidir: yana kaç, duvarı kullan veya arkadaşının sersemletmesiyle saldırıyı kes. Bir oyuncunun uyarıyı fark edip diğerini kurtarması, hurdadan vazgeçme veya başka yol seçme kararı yaratmalıdır.

Valve'ın [2009 kooperatif oyun tasarımı sunumu](https://cdn.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf), özel düşmanları belirli oyuncu davranışlarını değiştiren ve yakındaki arkadaşlara kurtarma fırsatı veren araçlar olarak anlatır; Witch örneği ışık ve silah kullanımına dikkat ettirir (s.16–20, 23). Buradan alınan ilke okunabilir tehdit ve ekip yardımıdır. Bu belgedeki karakterler, sayılar ve karşılaşma kuralları TFG için öneridir; sunum bunların eğlenceli olacağını kanıtlamaz. Valve karakteri, modeli, animasyonu veya sesi aktarılmaz.

## Mevcut oyunda zaten olanlar

| Mevcut davranış / gerçek sahibi | Yeni tasarımın ayrımı |
| --- | --- |
| `src/entities/creatures.js`: crawler, hızlanan ve yüksek hızda kötü dönen takipçi | Hat Kırıcı hedefi takip ederek dönmez; uyarının başında belirlenen tek çizgiye hücum eder. |
| `src/game/creatures20.js`: Buffer Brute, gürültüyle takip, 1,6 sn yakın saldırı hazırlığı, yerdeki hurdaları itme | Hat Kırıcı'nın asıl karşılığı yanal kaçış ve duvara çarptıktan sonra açıkta kalmadır. Hurda itme tekrarlanmaz. |
| `src/entities/creatures.js`: tamagotchi, ilgi/bakım ve dönüşüm; stalker, özel kurban takibi | Sessiz İşçi herkesçe görülebilir; bakım çubuğu, besleme, dönüşüm veya özel görünmez kurban yoktur. |
| `src/game/creatures10_ai.js`: Buffering, dur-kalk ve saldırı uyarısı | Sessiz İşçi'nin duruşu takip ritmi değildir; oyuncunun uyandırmadan geçebileceği bir karşılaşmadır. |
| `firstsight.js`, `crdirector.js`, `threatpool.js`, `firstdepth21.js`, `descent21_threats.js` | Mevcut bütçe ve başlangıç güvenliği korunur. Yeni yönetmen, sürü veya tehdit göstergesi eklenmez. |

## Sessiz İşçi — `c32_dormant`

Görünüş: çömelmiş, eski arşiv çalışma giysili, başı eğik bir işçi; yüzünü kirli bir bakım maskesi kapatır. Kâğıt sürtünmesi ve boğuk nefes konumunu bildirir. Yan arşiv odasında mevcut bir native hurda noktasının yakınında durur: ekip odayı atlayabilir, sessizce toplayabilir veya değerli yük için riski alabilir. Yeni ödül/loot sistemi eklenmez. Feneri kapatan ya da başka yöne çeviren ekip normal yürüyüş veya çömelme ile yanından geçebilir. En az 2 m genişliğinde gerçek bir geçiş koridoru kalır.

Durumlar: `idle → wake → chase → windup → rest → idle`; ölüm ve native `stunned` mevcut yaşam döngüsündedir. `idle` hasarsızdır. Aynı görünür oyuncunun 8 m içinde feneri gövdeye tutması 1,0 sn kesintisiz sürerse veya 6 m içinde görünür yüksek sesli oyuncu hareketi (`noise`/`voice > 0.6`) 1,0 sn sürerse `wake` başlar. Oyuncu 1,4 m içine girerse ya da native doğrulanmış vuruş yaparsa doğrudan **uyarı** başlar; doğrudan hasar başlamaz. Görüş duvarla kesilirse tetik birikimi sıfırlanır; oyuncuların kısa bakışları toplanmaz. Gürültü paketi tek başına duvar arkasındaki kişiyi hedef yapmaz.

`wake` 1,5 sn sürer: baş kalkar, eller açılır, açık bir ses duyulur. Tetik nedeni ortadan kalkar ve hedef 2,5 m dışına çıkarsa saldırı iptal olur, 4 sn `rest` sonrası sakinleşir. Ateş etmiş olmak sonsuz takip cezası değildir; aynı geri çekilme fırsatı vardır. Uyarı bittiğinde tetik sürüyorsa native yol bulma ile en fazla 6 sn takip eder. Görüş 1 sn kaybolursa, doğduğu konumdan 10 m uzaklaşırsa veya hedef ölü/downed/ship/safe-zone olursa takip biter. Menzil 1,6 m olduğunda ayrıca 0,8 sn `windup` verir; tamamlanınca gerçek LOS ve mesafe hâlâ geçerliyse **tek** tokat atar ve 4 sn dinlenir. Aynı takip döneminde ikinci tokat yoktur.

Ekip yardımı: mevcut sersemletici silah/grenade saldırıyı keser; mevcut silahla öldürmek mümkündür. Arkadaş “ışığı çevir, geri gel” diyerek birlikte siperin arkasına çekilebilir. Normal hasar, native stun üretmediyse bedava stun sayılmaz. Kurtarma için yeni tuş, tutma/çözme, zorunlu silah veya eşya tüketimi sistemi gerekmez. Tek başına oyuncu da uyarıdan kaçabilir.

## Hat Kırıcı — `c32_ram`

Görünüş: ağır arşiv taşıma işçisi; kalın sol omuz koruması, sağ tarafta eski hidrolik destek, mat iş giysisi. TFG işçi model ailesinden türetilir. Tek aşırı büyümüş kol veya franchise silueti kopyalanmaz.

Durumlar: `idle → windup → charge → rest → idle`; native `stunned` ve ölüm ayrı sonlandırıcılardır. Görünür canlı oyuncu 4–10 m içindeyken, zemini ve yan kaçışları doğrulanmış açık bir koridorda mevcut gürültü (`noise`/`voice > 0.3`) veya görünür taşınan sellable cargo dikkatini çeker. Bagged veya yerdeki cargo tek başına hedef üretmez. Gürültü görüşü atlamaz. 1,4 sn `windup` başlar. **Hücum yönü uyarının başında kilitlenir**, yaw tüm ekibe native snapshot ile gider. Baş eğilir, omuz sabitlenir, üç fren tıkı duyulur. Hedef sonradan yana hareket etse bile yön değişmez. Uyarı sırasında stun, hedefin ölmesi/downed/ayrılması, görüşün kaybı veya lane'in kapanması `rest` ile iptal eder. Cargo'yu koymak yeni hedef edinmeyi önler; başladıktan sonra hücumdan kaçmak yine mümkündür.

Hücum 6,5 m/sn başlangıç hızı, en fazla 8 m ve en fazla 1,25 sn ile sınırlıdır. Descent'in mevcut 6,8 m/sn üst sınırı aşılmaz. Duvar/kapı capsule sweep'i her adımda ve oyuncu temasından **önce** yapılır. Kapı açılmaz, kırılmaz veya içinden geçilmez. Çarpma daha erken olan fiziksel engelde durur; ardından 2,5 sn açıkta `rest` kalır. Büyük kare süresinde ara temas atlanmaz: ilk engel ve oyuncu swept temaslarının sırası karşılaştırılır. Bir hücum ilk geçerli oyuncuya **bir kez** hasar verir ve hemen biter; yan yana ekibi biçmez.

Tutma, sürükleme, uzun bayıltma, zorunlu hurda düşürme ve uçuruma fırlatma yoktur. Held/bagged cargo kimliği değişmez; loose cargo'ya ayrı darbe uygulanmaz. Ağır yükü bırakıp yana kaçmak mevcut taşıma sisteminin oyuncu kararıdır. Takım arkadaşı hazırlık sırasında native stun ile kurtarabilir; sonrası için duvara çarptırıp normal silahla cezalandırabilir. Yeni saldırı ancak dinlenme bitince, yeni tam uyarıyla başlar.

## İlk ayar hipotezleri

| Değer | Sessiz İşçi | Hat Kırıcı |
| --- | --- | --- |
| Başlangıç HP | 90 | 160 |
| Başlangıç hasar | 18 | 22 |
| Dış ölçekler sonrası vuruş üst sınırı | 35 | 35 |
| Gövde radius / height | 0,40 / 1,65 m | 0,50 / 1,90 m |
| Yürüme / hareket | 0 / takip 3,4 m/sn | 1,3 / hücum 6,5 m/sn |
| Native power / maxAlive | 2 / 1 | 2 / 1 |
| Coin / XP | 0 / 0 | 0 / 0 |

Seviye, difficulty ve forge ölçekleri tam uyarıyı kısaltamaz ve son hasarı 35 üstüne çıkaramaz. İlk teslimde iki tür de explicit `elite:false`, `variant:null`, `affix:null`, `tier:null` ile doğar; gizli, patlayan veya hızlanan sürpriz affix yoktur. 35 sınırı sağlıklı oyuncuyu tek vuruşla öldürmeyi engeller; zaten az canı olan oyuncu normal şekilde downed olabilir. Hiçbir tasarım 999 hasar veya dokunulmaz düşman gerektirmez.

## Yerleştirme ve ilk kat

İlk prototipte doğal üretim kapalıdır (`game.config.creatures32 !== true`). Native ve donmuş kaynakla birinci şahıs uyarı/kaçış kanıtı tamamlanmadan dağıtımda açılmaz. Sonraki kontrollü açılımda ilk normal kat (`descent21.depth === 0`) ve derinlik 1–2 bu iki yeni türü doğal olarak üretmez. Bu, tüm eski yaratıkları kaldıran bir kural değildir. Yalnızca normal endüstriyel derinlik **>=3**, run.quotaIndex **>=2** için mevcut yeni-kural slotu içinde açılır; Backrooms/liminal, açık alan, company/home, Dead Letter, escape14 ve aktif mission14 hariçtir. İlkdepth güvenlik modülüne istisna açılmaz.

Bir native floor token'ı için RNG'nin sabit anahtarı `creatures32:<descentToken>:<depth>:<facilitySeed>` olur. Bir kez %25 uygunluk kararı, aile içinden bir tür ve gerçek scrap/room adaylarından sıralı konum seçilir. Sonraki native istekte aynı anahtar aynı karar verir; başarısız roll yeni istekle reroll edilmez. Aynı anda iki tür toplam **en fazla bir**; aynı katta öldükten, host değiştikten veya kata dönüldükten sonra tekrar doğmaz. Admission, mevcut `canSpawnMore`, `game.crdirector.canSpawn` ve **`game.descentThreat21.allow(type)`** / power / newRuleSlots kurallarına ek bir veto olur. `allowSpawn(type,opts)` owned custom data/scripted çağrılarını bilerek atlayabildiğinden tek başına bütçe kanıtı değildir. İki id `NEW_IDS` içine girer; slot hesabında sayılır. Kabul edilmeden power düşülmez. Modül ek bir saat veya spawn dalgası çalıştırmaz; native indoor spawn isteği geldiğinde bu karar tüketilir.

Floor anahtarı native run içinde `creatures32SeenFloors` adlı en fazla 128 girdilik diziye yeni dizi olarak yazılır. Native `hostSpawn` dönüşten önce `cev sp` self-delivery yaptığı için floor önce in-flight olarak rezerve edilir ve receipt spawn callback'inden önce run'da yayımlanır. Gerçek creature doğmuşsa receipt kalır; native spawn reddedilip hiçbir actor eklenmediyse yalnızca bu giriş geri alınır ve run tekrar yayımlanır. Callback aynı isteği tekrar ederse ikinci actor/power charge yoktur. Eski kayıt için eksik alan boş dizi demektir. Kapasite dolarsa yeni spawn reddedilir; eski anahtar silinip replay açılmaz. Bu alan oyuncu ölçeri değildir, yalnızca tekrar doğmayı önleyen yaşam döngüsü kaydıdır. Mevcut generic saveRun/loadRun ve run diff sync yoluyla taşınır; ayrıca profil/save sürümü yaratılmaz.

Konum görünmezce oyuncunun dibine üretilmez: mevcut >14 m indoor spawn uzaklığı ve kapı/safe-zone koruması korunur. Mevcut descent 25 sn arrival quiet yalnızca liminal içindir; **bu iki endüstriyel tür için 25 sn arrival veto yeni dar bir kuraldır**. Modül `mapLoaded`/`facilityChanged` anında native `game.time` ile arrival kaydeder, unload'da temizler; ikinci timer yaratmaz. Doğal aday için floor/capsule boşluğu, gerçek nav erişimi ve canlı native door/collider durumu doğrulanır. Ana dönüş kapısı, merdiven yaklaşımı veya tek çıkışın üzerine yerleşmez. Sessiz İşçi etrafında 2 m geçiş; Hat Kırıcı lane'inde her iki yana en az 1,2 m erişilebilir boşluk ve en az 6 m düz zemin gerekir. Gerçek uygun geometri yoksa **spawn yok**; yer düzeltme teleportu veya LOS istisnası yoktur. Aynı odada başka aktif kovalamaca varsa yeni karşılaşma başlamaz. Durum sonradan sıkışırsa yeni saldırı iptal edilir; mevcut creature doğma konumuna teleport edilmez.

## Ağ, saat, kaynaklar

Host FSM, hedef, fizik teması ve hasarın sahibidir. `CreatureManager.hostUpdate(dt)` ve native `game.time` tek ilerleme yoludur; ikinci update listener veya bağımsız timeout yoktur. Hasar native `M.attack` / `game.hostHurtPlayer` yolundan gider. Açık uyarıyı tamamlamış vuruşta mevcut `_late` örneği kullanılacaksa tüm hedef/LOS/range/stun/age kontrolleri o anda tekrar yapılır; saldırı kaydı callback'ten **önce** kapatılır. `broadcast` eşzamanlı self-delivery yaptığı için `cev` veya hasar callback'inin aynı kareyi tekrar çağırması ikinci hasar yaratamaz.

Peer'ler ayrı AI çalıştırmaz: mevcut `cev` spawn/hp/snd ve 12 Hz `cs` state/yaw satırlarıyla aynı uyarıyı görür. Tek uyarı sesi bir state geçişinden üretilir; snapshot tekrarı ses spam'i yaratmaz. Join-in-progress mevcut state/yaw görür; warning kalan süresini alamadığı için görmediği bir uyarıya güvenen anlık hasar fırsatı açılmaz: FSM'deki mevcut crew kimlik kümesine yeni native oyuncu eklendiğinde bu iki türün açık saldırısı iptal edilir ve 2,5 sn rest başlar. Sonra tam yeni uyarı gerekir. Küme yalnızca canlı session üyelerinden oluşur, leave'de küçülür; ayrı join saati veya ağ mesajı eklenmez.

Migration mevcut native view'dan kimlik/HP/konum/yaw restore eder, fakat `c.data`/hedef/atak süresini taşımaz. Bu iki tür `hostMigrated(game, info)` ve `info.self` üzerinden **2,5 sn rest** durumuna alınır; eski wake/charge devam ettirilmez. İlk davranış init'i de restore edilmiş saldırı state'ini zararsız rest'e çevirir. Yeni bir saldırı için tam yeni uyarı gerekir. Run'daki floor kaydı başka bir spawn'ı önler. Böylece kaybolan hit serial'ını varsayıp ikinci vuruş üretmek gerekmez.

Model başına en fazla 20 mesh/draw, 4 mat flat Lambert malzeme, 1.400 triangle hedefi; yeni gerçek ışık yoktur. Kaynaklar her frame yaratılmaz. İki model native model registry / warm / view dispose sözleşmesine uyar; dispose iki kez çağrılsa da kaynak bir kez kapanır. Ses başına en fazla 2 sn mono buffer; ilk teslimde üç özgün one-shot cue ve Sessiz İşçi için en fazla bir view-owned düşük sesli loop. Loop map unload, remove, ölüm ve session dispose'da kapanır. Ses kapalıyken veya reduced-motion açıkken pozu okumak yine mümkündür. EN/TR/RU kısa kural caption'ı mevcut lore/director kapısından gider; yeni modal veya HUD çubuğu yoktur.

## Tek karşılaşma alanı ve kanıt

QA aynı sabit seed ile mevcut factory facility üretir. Native test fixture gerçek odada 6 m lane, iki yan kaçış cebi, fizik paneli ve erişilebilir normal giriş/dönüş rotası doğrular. Aynı alanı iki ayrı temiz turda kullanır: birinde Sessiz İşçi, diğerinde Hat Kırıcı. Üretim haritasına arena sistemi eklenmez. Browser kurulumunda mevcut debug game erişimi (`window.kefal.game`) yalnızca başlangıç seed/yerleştirme için kullanılabilir; sonrasında normal birinci şahıs giriş, yürüyüş, fener, native hit/grenade, cargo bırakma ve çıkış uygulanır. Kurulum native entegrasyon kanıtıdır; insanın rehbersiz keşfi sayılmaz.

Tam kabul listesi ve dosya sahipleri [uygulama planında](CREATURE_PLAN.md). Native RED/GREEN, görsel/ağlı rehberli karşılaşma ve insan playtest ayrı raporlanır. Uyarı anlaşılmıyorsa veya çıkış kaçınılmaz biçimde tıkanıyorsa spawn açılmaz. İlk playtest hedefi: oyuncular tehdidin kuralını anlatabilsin, en az bir gerçek ekip kurtarma anı yaşansın, en az bir rota/cargo kararı değişsin. Eğlence puanı yeniden kullanıcıdan alınır; başarısız olursa yeni yaratık eklemek yerine bu iki karşılaşmanın süre/ses/yerleşimi ayarlanır.
