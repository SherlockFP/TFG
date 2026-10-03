# Wave32 — asset alımı ve özel düşman planı

2026-10-03. Başlangıç yayın SHA: `b4af15223a85ed5ef2a7999517966af1524de324`.
Bu dalga kullanıcının FoxTex/itch.io üzerinden daha fazla asset indirme ve
Witch/Charger benzeri karşılaşmaları plana ekleme isteğini ele alır. Oyuncu
deneyimi puanı **1/10**; indirilen dosya sayısı eğlence kanıtı değildir.

Ham paketler `C:/Users/Sher/Desktop/TFG-asset-library/wave32/` altında tutulur.
Git'e yalnızca seçilmiş, işlenmiş, lisanslı dosyalar ve kaynak kayıtları girer.
Yeni seçki `public/assets/ext/wave32-library.json` içinde bağımsız katalogdur.
Mevcut ana manifest, boot preload, dünya yerleşimleri ve oynanış bu dalgada
değiştirilmez. Katalog hazır bir kütüphanedir; modeller henüz sahaya yerleştirilmiş
ve düşmanlar uygulanmış kabul edilmez.

## İndirilen paketler

| Paket | Kaynak / lisans kanıtı | Yerel kaynak | Durum |
| --- | --- | --- | --- |
| FoxTex Re-Named / Foxhead | [FoxTex](https://foxh3ad.itch.io/foxtexcom), CC0 | `foxtex/FOXTEX Re-Named.zip` | Tam arşiv 1.423.885.398 byte; 4.606 PNG, CRC kontrolü. Mat metal/beton/ahşap için 39 işlenmiş doku. |
| PSX Electronics / Animimo | [Paket](https://animimostudios.itch.io/psx-electronics-asset-pack-free), CC0 | `animimo-psx-electronics/` | Blender + 13 mesh içeren GLB; radyo ve kayıt ekipmanı seçkisi. |
| Office PSX Demo / ALEX | [Paket](https://apfelgarten.itch.io/office-psx-asset-pack), CC0 | `alex-office-psx-demo/` | 12 model içeren Blender kaynak + 9 doku; arşiv dolapları seçkisi. |
| LOWPO Horror Free / Standout 7 | [Paket](https://standout7.itch.io/horror-character-pack), CC0 | `standout7-lowpo-horror-free/` | Ücretsiz Zombie/Vampire/Ghost FBX referansları. Rigli, animasyonsuz; runtime'a alınmadı. |

Kullanılan ücretsiz sürümler için ödeme veya hesap gerekmedi. Ham arşivlerdeki
kod çalıştırılmadı; Blender kaynakları otomatik script çalıştırma kapalıyken
işlendi. Her yerel paket `acquisition.json` içinde kaynak URL, lisans kanıtı ve
SHA256 taşır; geçici imzalı indirme URL'leri katalogda tutulmaz.

## Hazırlama ve kullanım

FoxTex seçkisi mevcut `tools/assets/textures.py::convert` üzerinden en fazla
128 px, nearest küçültme, en fazla 256 renk ve dithering olmadan PNG'ye işlendi.
Seçilen ham üye adı ve hem kaynak hem çıktı hash'i katalogda tutulur; eski
dokuların veya save/mod ID'lerinin üzerine yazılmaz. Alpha içeren ızgaralar
korunur; bütün görsellerin tileable olduğu iddia edilmez.

Modeller mevcut `tools/assets/blender_convert.py` ile başsız Blender'da
ayrılır, boyutları ve üçgen sayıları kaydedilir. GLB gömülü dokuları gerçek
decode kontrolüyle incelenir; yalnız geometri yüklenmesi görsel kanıt sayılmaz.
Canlı oyuna alırken mevcut Lambert/nearest materyal ve map-instance sahipliği
izlenmelidir. Bütün paketi preload listesine eklemek bu dalganın parçası değildir.

Son seçki: **39 PNG + 6 GLB**, toplam **670.392 byte** (654,7 KiB); bütün
modeller toplam **470 triangle**. İki radyo ve iki VHS 128 px atlas, iki dosya
dolabı 256 px atlas kullanır; tüm model atlasları en fazla 256 renk, dithering
yok, alpha korunmuş, metalness 0 / roughness 1 ve emission yoktur. Radyo/VHS
önleri -90°, dosya çekmeceleri +90° yaw ile native +Z'ye çevrildi. VHS genişliği
oranlar korunarak 0,187 m; radyolar ve dolaplar kaynak ölçeğini korur. Açık
dolap statiktir; çekmece animasyonu veya etkileşimi bu dalgada eklenmedi.

Seçki önizlemeleri: [dokular](texture-preview.jpg), [modeller](model-preview.png).
Bunlar stüdyo/katalog görselleridir; gerçek first-person ışık ve performans
ölçümü yerine geçmez. Dünyaya yerleştirme sonrası bu kanıt ayrıca gerekir.

## Geliştirilmiş düşman planı

[Tasarım](CREATURE_SPEC.md) ve [uygulama adımları](CREATURE_PLAN.md), iki özgün
TFG arketipini mevcut host AI, fizik, ses ve keşif akışıyla birleştirir.
Rahatsız edilene kadar pasif kalan bir tehdit ile okunabilir düz-hat hücumu,
uyarı/kaçış/takım kurtarması üzerinden farklı kararlar üretmelidir. Valve
modeli, sesi, adı veya haritası asset olarak aktarılmaz. Planın sayısal
ayarları ilk prototip hipotezidir; insan oynanışıyla doğrulanmış denge değildir.

## Sahiplik ve doğrulama

- Root: FoxTex seçimi, birleşik katalog/kredi/rapor, build, son Git.
- Market ajanı: yeni radyo/arşiv GLB dosyaları ve stüdyo önizlemesi.
- Commerce ajanı: düşman tasarımı ve native uygulama/test planı.
- Controls ajanı: bağımsız lisans/dosya/kaynak sınırı ve plan incelemesi.

Uygulama kaynakları ve shared host lifecycle değişmediğinden Wave31'in 265
native testini bu asset dalgasında tekrarlamak gerekmez. Yeni dosyaların hash,
görsel decode, GLB kaynak ve katalog kontrolleri; taze production build ve
staged diff kontrolü bu dalganın kanıtıdır. Son sayılar ve inceleme sonucu
[REVIEW](REVIEW.md) ve katalogda kayıtlıdır. Son yayın SHA için Git'e bakın.

Taze build **2,09 sn / exit 0**: [çıktı](build.txt). Önceki native-config ve
ineffective dynamic-import uyarıları sürer; bu sonuç yükleme hızının arttığını
kanıtlamaz. Bağımsız inceleme 39 doku, 6 GLB ve birleşik kataloğun kaynak/çıktı
hash'lerini, decode/ölçek/renk ve dış kaynak sınırlarını ayrıca doğrular.
Planın sayısal ayarları henüz denenmemiştir. Uygulama kaynağında veya eski
ana asset manifestinde bu dalgaya ait diff yoktur.

Doğal yükleme/takılma ölçümü, gerçek Internet/voice, ilk on dakika ve insan
eğlence playtest'i hâlâ açık. Wave31'deki iki eski native hata bu dalga tarafından
düzeltilmiş kabul edilmez.
