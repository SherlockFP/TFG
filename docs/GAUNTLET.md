# TFG Gauntlet — güncel geliştirme ve doğrulama döngüsü

Sürüm 2026-10-01. Bu belge mevcut `/workspace/TFG` bulut çalışmasının yöntemidir. `tools/lead` içindeki eski Claude/worktree/otomatik merge-push akışının ve tarihsel handoff test talimatlarının yerini alır. Geçmiş dalga raporları geçmiş kanıt olarak kalır. Genel tasarım gerekçesi: [Wave25 araştırması](wave25/RESEARCH.md).

## Döngünün amacı

Bir tur, oyuncunun yaşadığı belirli bir sorunu çözmelidir. “Daha fazla sistem” veya “puanı 8.5 yap” tek başına kabul koşulu değildir. Tasarım varsayımı, teknik doğruluk ve oyuncunun deneyimi ayrı değerlendirilir.

**Gözlem → hipotez → küçük değişiklik → ilgili yerel test → donmuş kaynakla oynanış → bulgu/düzeltme → bağımsız değerlendirme → yayın.** Bir hata düzeltmesi gerekli olduğunda ilgili adım tekrarlanır; değişmeyen, geçmişte geçen kontroller sırf raporu büyütmek için tekrarlanmaz.

## 1. Tur kartı: uygulamadan önce yaz

Her tur için bir README içinde şu bilgileri tut:

| Alan | Örnek / kural |
| --- | --- |
| Başlangıç | Gerçek Git SHA, temiz/kirli durum, protokol, Node ve dev portu. |
| Yeniden üretim | Actual mode/layout seed, boyut/theme, host/peer rolü, taze profil/checkpoint. Kişisel kart seed'i harita seed'i değildir. |
| Oyuncu sorunu | “Özel kart atışını kabul etmediğimiz hâlde oyuncunun seçimini siliyoruz.” |
| Hipotez | “Seçim kabul yanıtıyla tüketilirse oyuncu planladığı hamleyi güvenle tekrar deneyebilir.” |
| Değişiklik | Mevcut atış ve bekleme sistemi; yeni bir para veya zorunlu panel ekleme. |
| Kabul | Gerçek host reddi seçimi korur; kabul bir kez tüketir; gecikmiş/eski yanıt yeni seçimi değiştirmez. |
| Entegrasyon sınırları | Gerçek Session kendi mesaj teslimi, mod kancaları, envanter, Rapier, host/peer. |
| Maliyet | Aktör/proje/çarpışma/çizim sayısı, kaynak sahibi ve temizleme yolu. |
| Oynanış sorusu | Oyuncu ne olduğunu anlayıp ikinci denemeyi yapabiliyor mu? |
| Bütçe | Adı konmuş kısa tarayıcı senaryosu, süre sınırı ve durma koşulu. |

En fazla birkaç bağlı kalite hedefi seç. Bir ajanın “eklenebilir” önerisi, o turun kapsamına otomatik olarak girmez. Araştırma, mevcut oyun gözlemi ve uygulanabilir kabul koşulu birlikte seçim yaptırır.

## 2. Ajanlar ve dosya sahipliği

- Kullanıcının mevcut çok ajanlı çalışma yetkisi kapsamında bağımsız inceleme ve uygulama görevlerini böl. Aynı checkout paylaşılır; eski izole worktree talimatlarını uygulama.
- Her ajana dosya veya adlandırılmış fonksiyon kapsamı ver. Aynı dosyaya iki ajan dokunacaksa kapsamları önceden yaz; komşu API değişikliğini sahibine ilet.
- Her ajan kendi ilgili kontrollerini ve sınırlı modül raporunu tamamlar. Bir tarayıcı sahibi vardır. Root birleşik inceleme, son build ve Git yayınından sorumludur.
- `git add -A`, bağımsız commit veya push ajan görevinin parçası değildir. Eski Markdown union ve `game.js` placeholder birleştirme araçları güncel entegrasyon yolu değildir.
- Başka bir kullanıcı değişikliğini silme. Başlangıç diff'iyle kendi kapsamını karşılaştır; gerçek kod çatışmasını elle incele.

## 3. Teknik doğrulama: davranışı ve sınırı test et

Node 22: `source /workspace/.tfg-tools/activate.sh`. Değişen modülleri ve doğrudan komşularını çalıştır:

```bash
npm test -- -j 4 deadletter lab24
npm run build
git diff --check
```

Filtreler test dosya adının alt dizgesidir. Göreve göre değiştir; tüm suite'i her küçük düzenlemeden sonra çalıştırma. Game/host/Session, harita yaşam döngüsü veya ortak kayıt/economy sözleşmesi değiştiyse root son kaynak için tam regresyon çalıştırır. Tarayıcı ölçümü sırasında CPU'yu geniş suite ile paylaşma.

Geçmişte güvenilir davranışı koruyan regression ile henüz güvenilir olmayan yeni capability senaryosunu ayrı tut. Bir başarılı yeniden deneme ilk başarısızlığı silmez. Grader'ı da doğrula: bilinen iyi fixture/render ile doğru DOM/callback'i sorguladığını göster; pozitif kontrolün yanında engel, eski revizyon ve tekrar mesaj gibi negatif kontrol kullan. Native sonuç, eylem trace'i ve yorum aynı kanıt değildir. Bu ayrımların güncel 2025–2026 birincil gerekçeleri araştırma belgesindedir.

Gerçek sistem sınırlarını kullan: `broadcast` gönderen host'a eşzamanlı teslim edilir; `send` aynı sözleşmeye sahip değildir. Map unload/rebuild, Cargo13/Fleet13, phase/state callback'leri ve Rapier sorgu yenilenmesi inert spy'larla ikame edilemez. Seedli dünya üretimi, tek native custody/wallet/quota ve eski kayıt kimlikleri korunur.

Bir doğrulama hatayı önce yeniden üretip düzeltmeyle geçtiğinde bunu kaydet. Yalnız uygulanmış sabiti tekrar eden veya geri alınabilir görsel değişiklik için gereksiz test yazma. Mevcut testleri genişlet; ayrı bir görevde en fazla bir yeni odaklı dosya varsayılanıdır. Gerçek entegrasyon açığı varsa gerekli sınırı doğrulamayı sırf bu sayıya uymak için bırakma.

## 4. Kanıt etiketleri

| Etiket | Neyi kanıtlar? | Kanıtlamadığı şey |
| --- | --- | --- |
| `NATIVE_INTEGRATION` | Gerçek modüller, host kuralları, fizik ve yaşam döngüsü. Hızlandırılmış kill/kurulum fixture'ı ayrıca yazılır. | İnsan aim'i, tüm bölümün normal oynanışı veya eğlence. |
| `GUIDED_INPUT` | Gerçek tarayıcı, klavye/fare/E, geçerli aim ve native sonuç. Kaynak yardımlı rota, ilk pozisyon ve hızlandırılmış saat açıkça belirtilir. | Kör oyuncu keşfi, doğal zorluk dağılımı veya Internet gecikmesi. |
| `VISUAL_REPLAY` | Gerçek UI/hesaplanan CSS/çerçevenin okunması. Örneğin daha önce kazanılmış kart teklifinin görsel tekrarı. | Teklifin o seansta kazanılması veya gerçek ödül. |
| `BLIND_HUMAN` | Yardımsız gerçek oyuncunun keşfi, kararları, kafa karışıklığı ve sözlü geri bildirimi. | Küçük örnekle uzun vadeli retention veya tüm oyuncuların görüşü. |
| `HARDWARE_PROFILE` | Adı belirtilmiş donanım/browser/ayarlarla gerçek zamanlı kare süreleri ve sebep atfı. | SwiftShader, elle `tick` veya Node stub süresi bu etiketi karşılamaz. |

Bir etiketi diğerine yükseltme. “Node testleri geçti” ile “oyunun boss'u oynandı” aynı iddia değildir. Bir test birden fazla etikete sahipse her sonucun hangi adımla elde edildiğini ayır.

## 5. Kısa tarayıcı Gauntlet'i

Önce kaynakları dondur, Vite/HMR-off için yeni sayfa aç ve senaryo yardımcısını hazırla. Normal hedef 1–2 kısa seans; tam ilk kat gibi daha uzun bir hedef için önceden yazılmış süre sınırı kullan. Bug çıktıysa donmuş düzeltilmiş kaynakla ilgili kısa tekrar gerekçelidir. Eski çelişkili “hiç tarayıcı yok / tam bir tarayıcı var” kuralları gerçek hatanın doğrulamasını engellemez.

1. `/tmp/tfg-browser.lock` altında tek sahibi çalıştır. Dev portunu, yeni oda kodunu, throwaway profil veya kalıcı kayıt fixture'ını açıkça belirt. Sadece kendi açtığın PID/context'i kapat; pattern ile `pkill` kullanma.
2. Host ve peer için phase/world/facility/map queue hazır olmasını bekle. Sadece phase metnine bakmak harita hazır demek değildir. Gerçek zemin sorgusu ve tek facility sahibi kontrol edilir.
3. Her yürüyüş/aim öncesi yaşayan, downed olmayan, doğru konumdaki oyuncuyu ve input/panel durumunu doğrula. Her hareket sonunda tuşları bırak. `finally` bütün input/context/lock temizliğini yapar. App RAF, gizli-sekme fallback'i ve elle tick aynı anda simülasyonu ilerletiyorsa birden fazla saat üreticisi vardır: ya gerçek zamanlı tek üreticiyi kullan ya da açıkça etiketli test fixture'ında native Game.update/Input.endFrame yalnız aynı manual tick içinde çalışsın. Bütün fizik/AI/host/mod saatleri o değişmeyen pipeline'dan ilerlemeli; sonda exact wrapper'lar geri yüklenir. Kontrol edilen saat insan zorluğu ve performans kanıtı değildir.
4. E öncesi gerçekten seçilen etiketi kaydet. Normal range/LOS/kapsül yolunu kullan; `hostReq`, teleport veya `noLos` ile bozuk etkileşimi passed gösterme. İlk kurulum pozisyonu gerekiyorsa fixture olarak yaz.
5. Gerçek saldırıda hedef/aim/LOS/cadence geçerli olsun. HP, XP, AI, stage, deck, ödül veya kazanan sonucu yazmak o oynanış hedefini geçersiz kılar. Native scheduler fixture'ları ayrı ve değerlidir.
6. Gerçek render ve küçük çözünürlükte hesaplanan CSS/yerleşim kontrol edilir. `tick(..., false)` sonrası eski kare, pause kaplaması veya sadece DOM varlığı görsel kanıt değildir.
7. Yalnız `pageerror` değil `console.error`, yakalanmış uygulama/event/mod hataları ve WebGL feedback de kaydedilir. Beklenen bootstrap/negatif-kontrol uyarıları ayrı açıklanır; runtime hatasını sessize alma.
8. Ölüm, fiziksel engel, geçersiz operatör durumu, süre sınırı veya gerçek hata olduğunda dur. Tam geçiş yerine tamamlanan kısmı bildir. Salt okunur pose/selector/host-pipeline bilgisiyle sebebi sahibine aktar; outcome enjeksiyonu yapma.

## 6. Dead Letter Run: tam ilk katın kesin kabulü

Wave24 yalnız kazanılmış kart ve güvenli Company dönüşünü tarayıcıda kanıtladı. Bu hedefin yeni bir turda geçmiş sayılması için hepsi gerekir:

- İki oyuncunun Company checkpoint'i: tüm item ID/type/holder/bag/value, wallet/progression ve native Company zemini kaydedilir.
- Normal E girişinde iki peer aynı tek facility'ye gelir; giriş tabelası ve bir kısa bağlamsal açıklama okunur.
- Üç dalga gerçekten spawn olur ve geçerli LMB projeleriyle öldürülür. Host outcome yazılmaz. Peer'in katılımı veya yalnız gözlemci olması belirtilir.
- Kazanılmış her kişisel seviye üç uygun kartı açar; gerçek seçim rank/nonce/pending'i tam bir kez değiştirir. Escape/kabinden açma ayrıca sınanacaksa aynı kazanılmış teklif kullanılır.
- Boss üç dalgadan sonra doğar, native aim/hasarla yenilir ve kat temizlenir. Perde/duvar üzerinden hasar veya kalıcı stuck varsa passed değildir.
- Yaşayan ekip gerçek yürüyüşle kabinde toplanır; E descent floor/revision'u bir artırır, yeni tema gelir, eski aktör/projeler kalmaz.
- Gerçek E exit iki oyuncuyu Company'ye döndürür. Native teslim tamamlandıktan sonra bütün checkpoint setleri eşittir; kampanya ödülü sızmamıştır ve mod gear'ı yoktur.

Bir madde eksikse `PARTIAL_EARNED_DRAFT_AND_EXIT` veya gerçekten tamamlanan alt hedefi yaz. Tam ilk kat iddiası, title/assertion adıyla değil sonuçlarla kurulmalıdır.

## 7. Eğlence, denge ve performans kararı

Oynanış hipotezleri için birkaç kör insan crew oturumu ayrı gerekir. İlk kontrolü bulma, ilk anlamlı karar, açıklanabilen ölüm, yeniden deneme isteği, sessizlik/baskı süreleri ve gerçek ekip konuşmalarını kaydet. Oyuncuyu test ederken yönetme; yönlendirme gerektiği an kör kanıt sona erer. Oturum sonunda “nerede ne yapacağını bilemedin?” ve “hangi ölümü önleyebilirdin?” gibi somut sorular sor. Hedef puanı soruya yerleştirme.

Performansta ortalama FPS tek başına yeterli değildir. Aynı rota/seed/ayar/donanımda warm-up ardından p50/p95/p99 kare süresi, >50ms kare sayısı, transition tepe süreleri, CPU/render/physics/mod/DOM atfı ve önce/sonra kaynak sayıları kullan. Sekme gizli, elle saat ilerletilmiş veya SwiftShader ise bunu teknik teşhis olarak etiketle. Uygulanmış sorun için karşılaştırma yap; yeni kanıt olmadan geniş optimizasyon veya değişmez test tekrarı yapma.

## 8. Kapanış ve main yayını

README kapsamı, modül sözleşmesi, araştırma bağlantısı, PLAYTEST ham sonuçları ve bağımsız REVIEW güncellenir. Başlangıç puanı ve sonuç puanı öznel/kanıt sınırlı değerlendirme olarak yazılır; feature/test sayısı puan üretmez. `AGENTS.md`, `CLAUDE.md`, HANDOFF/CONTINUE ve CRITIQUE'ın güncel girişini kısa tut; tarihsel sonuçları yeniden bugünkü sonuç gibi sunma.

Root son diff'i ve ilgili test/build sonuçlarını inceler. Kullanıcının mevcut main commit/push yetkisi kapsamında birleşik commit yapılır, push edilir ve local SHA ile remote main eşitliği doğrulanır. Yeni izin sorusu açılmaz. Gerçek dış blok varsa eylem ve sebep açıkça bildirilir. Son cevap yapılmış değişiklikleri, test kapsamını, SHA ve önemli kanıt sınırlarını birlikte taşır.
