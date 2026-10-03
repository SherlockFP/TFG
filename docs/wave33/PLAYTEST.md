# Wave33 — native karşılaşma ve ekran kaydı

2026-10-03, başlangıç `bf4f577`, protokol 0.12.5, Windows / bundled Node24.19.0 / mevcut root Vite5174. Tek browser sahibi root; ağır testlerle tarayıcı aynı anda çalıştırılmadı. Kullanıcının eğlence değerlendirmesi **1/10** olarak kalır.

## Kurulum ve kanıt sınırı

Dev-only `test/creatures32.html` ve `test/creatures32_game.html`, gerçek App/Game/CreatureManager/LocalPlayer/ItemManager/Session/Rapier/render kullanır. Harita seed1235, factory, size1.3; quota2, depth0. Başlangıç aktörleri ve ekipman, native kurulum API'leriyle oluşturulur. Bu depth0 karşılaşması doğal admission'ın kanıtı değildir: helper yalnız fixture actor admission'ını geçer; davranış, LOS, kapsül, hasar ve custody native kalır. Seedli kabul edilen alanda 7m boş hat, iki 1.8m yan cep ve gerçek girişe nav dönüş yolu vardır. İlk pozisyon teleport'u yalnız kurulumdur.

Mevcut App RAF tek simülasyon üreticisidir. Fixture'ın RAF beklemesi yalnız gözlem yapar; `tick`, ikinci physics/Game update veya hızlandırılmış clock yoktur. Synthetic repeat-key olayları native Input dinleyicilerine gönderilir; yerel kontrolcü gerçek çarpışma sorgularıyla yürür. Repeat, iframe'deki otomatik pointer-capture girişimini tetiklememek içindir. Bu **NATIVE_INTEGRATION + VISUAL_REPLAY** kanıtıdır; gerçek fare/pointer lock, kör keşif, insan reaksiyon süresi veya GUIDED_INPUT etiketi kazanılmaz.

Her yeni Place işleminde önceki aktör/gözlemci kaldırılır, pozisyon kurulur ve trace sıfırlanır. Sonra sonuçlar yazılmaz: HP, hedef, AI state, temas, clock veya kazanan sonucu enjekte edilmez. Cargo doğrudan native holder'a eklenen trigger fixture'ıdır; pickup/drop/bag testi sayılmaz. Wait ölüm/downed/aktör kaybında durur, `finally` bütün tuşları bırakır. OnCreatureState/onHurt/Engine.render wrapper'ları native fonksiyonu çağırır ve tam olarak geri yüklenir. Warning görüntüsü mevcut render'ın hemen ardından alınır; ek render veya model pozu yazılmaz. Küçük sağ-alt görüntü açıkça warning-frame replay'dir.

## Başarısız denemeler ve düzeltmeler

1. İlk parent-realm helper, iframe'de initialize olmuş Rapier/CreatureManager yerine parent module singleton'ını kullanıyordu. `rawshape_capsule` hatası aktör kurulmadan çıktı. Bağımsız review aynı registry ve WASM sınırını buldu. Helper ve main şimdi aynı iframe realm'inde yüklenir; aktör publication ayrıca doğrulanır.
2. HMR-off sayfa yenilemesi canlı session'da sonuç vermedi; eski sekmeler yalnız kendi handle'larıyla kapatılıp yeni oda kodlu sayfa açıldı. Eski sonucu taze test olarak sunmadık.
3. İlk `virtualKey` held S girdisi otomatik pointer-lock/fullscreen girişimi ve odak kaybıyla temizleniyordu. F wake → rest çalışırken retreat yalnız yaklaşık0.02m idi; kabul başarısız sayıldı. Repeat-key driver ile native held-input/velocity/controller örnekleri kaydedildi. Testin pointer-lock sınırı yukarıda belirtilmiştir.
4. İlk parent-RAF canvas capture boştu. Mevcut Engine.render delegasyonu sonrasında bir kez alınan gerçek frame ile düzeltildi; yeniden çizim yoktur.
5. İlk repaired driver denemesinde light withdrawal **2.997m / sıfır hurt**; ram dodge **2.480m / sıfır hurt**, aktör sabit yaw ile **7.992m** yürüdü. İlk kaynak freeze'inde lane positive control başarısızdı: native oyuncu kapsülünde durdu, fakat HP100 kaldı. [Başarısız raw sonuç](ram-hit-failed.json) korunur.
6. Gerçek Game'deki `grenades.attack` wrapper'ı beşinci `_late` argümanını düşürüyordu. C32'nin tamamlanmış warning sonrası vuruşu generic balance gate'e yeniden giriyor; onun delayed replay'i de aynı flag'i kaybediyordu. Native integration regression ve düzeltme sonrası yeni kaynak freeze ve fresh browser tekrar gereklidir.
7. Test child sayfasının `/test/` URL'si iki relative manifest fetch'ini HTML fallback'e yöneltiyordu. [İlk console](browser-initial-console.json) bu iki bootstrap warning'i tutar. Child'ın base URL'si `/` olarak düzeltildi; son tekrar root-relative manifestleri kullanır.

## Son kaynak kabulü

Son kaynak üzerinde üç taze senaryo geçti:

| Senaryo | Gözlenen native sonuç | Kayıt |
| --- | --- | --- |
| Sessiz İşçi, 3 m / flashlight on; wake +0.5 s sonra ışığı kapatma ve S | Gerçek retreat **2.9888267744 m**, wake→rest, **0 hurt / HP100**. | [JSON](dormant-guided-final.json), [tam bağlam](dormant-warning-final.png) |
| Hat Kırıcı, 6 m / flashlight off; native holder cargo; windup +0.5 s sonra D | Oyuncu **2.4799 m** yana yürüdü; aktör ilk yaw0 hattında **7.992 m** yürüyüp rest'e geçti, **0 hurt / HP100**. | [JSON](ram-dodge-final.json), [tam bağlam](ram-warning-final.png) |
| Hat Kırıcı, hatta kalma / flashlight on | c4 windup165.3627→charge166.8250→temas167.5618; **tam bir native hurt18, HP100→82**, rest. Cargo hâlâ tutuluyor; hiçbir zorunlu drop yok. | [JSON](ram-hit-final.json), [tam bağlam](ram-hit-final.png), [uyarı render frame](ram-warning-lit-frame-final.png) |

Üç tamamlanmış kayıtta native map queue boş, error recorder **0**, oyuncu canlı ve tuşlar bırakılmıştır. [Son console](browser-final-console.json) warn/error **0**. “guided” fixture event/dosya adıdır; yukarıdaki kanıt etiketini GUIDED_INPUT'a yükseltmez. Son anda alınan trace temasın tek hasarını gösterir; gecikmiş tekrarın yokluğu ayrıca gerçek grenade/balance/host/Session native regression'ında doğrulanır.

Son modelin aynı kamera/ışıkta idle→warning karşılaştırmaları: [dormant idle](dormant-idle-frame-final.png) / [wake](dormant-warning-frame-final.png), [ram idle](ram-idle-frame-final.png) / [windup](ram-warning-frame-final.png). Art ajanı bu gerçek çiftlerde kol/silhouette ayrımını bağımsız gözledi; maskenin flashlight wash'ı ve ram torso'nun loşluğu sürüyor. İnsan fark etme veya kaçış süresi bu görüntülerden çıkarılmadı.

Taze `/` menü sayfasında Host Game → Advanced açıldı: Archive threats (experimental) **unchecked**, uygun kota/depth açıklaması görünür; [ekran](host-advanced-final.png), [AX](host-advanced-final.txt), [console](host-final-console.json). Public/online session başlatılmadı. Önceki autohost yalnız local fixture odasıdır.

Birleşik doğrulama frozen product source üzerinde: [focused](focused-final.txt) **6/6 / 11 s**, [full](full-suite-final.txt) **265/267 / 129 s**, [build](build-final.txt) **pass / 2.19 s**. Full suite'nin carry2 Windows libuv abort ve outdoor30 historical frozen-HEAD oracle hataları önceki baseline ile aynıdır; tam suite geçmedi. Native ajanı ve reviewer ayrı tekrarlarında **62** named native scenario geçirdi.

Son source SHA256:

```text
src/game/creatures32.js C50D6AD1E5A3569D4000D2029AD52C0315DE96E6C215CC2231C37AA69C8820FB
src/models/creatures32.js EC26258811AE91EB95A9F911B9D37042CD53FB36874CF470006A6EB0BAE08026
src/game/grenades.js 337B42BF6214F7B6E6625BD661D2B46B8AE3969FBF0555B933B1527D763DAA85
```

İnsan ekip oturumu, doğal quota/depth progression, gerçek Internet peer ve donanım profili bu turda yapılmadı. Stun/kapı/JIP/migration/custody ve once-disposal ayrı [native](NATIVE.md) / [art](ART.md) / [review](REVIEW.md) kanıtıdır. Bu kabul yalnız unchecked deneysel opt-in içindir; varsayılan doğal spawn kapalı ve kullanıcı eğlence değerlendirmesi **1/10** kalır.
