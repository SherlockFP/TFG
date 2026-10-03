# Wave33 — iki özgün kooperatif tehdit

2026-10-03; başlangıç main `bf4f577ab2fde624b0cfd02bf5c5cd098353b5df`.
Yayın SHA'sı için Git'e bakın. Protokol **0.12.5**; ekipte herkes sayfayı yenilemelidir.
Kullanıcının eğlence değerlendirmesi **1/10** olarak kalır.

Sessiz İşçi, sürekli görünür ışık/gürültü veya çok yakın temasta uyanır. Işığı kapatıp mesafe açmak veya görüşü kesmek uyarısını iptal eder; kovalamaca ve ayrı pençe uyarısı sınırlıdır. Hat Kırıcı, görünür yük/gürültü sonrası 1.4 saniye hazırlanır, ilk yönüne kilitlenerek hücum eder ve gerçek duvar/kapı veya ilk oyuncu kapsülünde durur. Her saldırı tek hasar verir; ekip arkadaşı native stun ile durdurabilir. Zorunlu eşya düşürme veya yeni ekonomi yoktur.

İki özgün mat PSX işçi modeli, ayrı uyarı pozları ve sesleri eklendi. Son browser temas kontrolü ayrıca ortak grenade saldırı wrapper'ında kaybolan `_late` argümanını buldu; gerçek native hasar yolu ve blackout'un iki kez ölçeklenmesi düzeltildi.

## Açma ve doğal karşılaşma

**Host Game → Advanced → Archive threats (experimental)**; TR karşılığı **Arşiv tehditleri (deneysel)**. Seçenek yeni host'ta kapalıdır. Açıkken iki kotadan sonra, depth ≥3 factory/office katlarında mevcut tehdit bütçesinden en fazla bir aile üyesi ayrılır. İlk native endüstriyel varışın 25 saniyelik koruması, fiziksel erişim/LOS/çıkış ve boş alan koşulları korunur. Uygun kat için seedli %25 aile seçimi vardır; kayıtlı kat kararı geri dönme, ölüm veya host değişiminde yeniden atılmaz.

Bu bir deneysel opt-in kabulüdür. Varsayılan açılma, kör insan keşfi ve normal quota/depth akışının browser kabulü kazanılmadı. Wave32'nin [işlenmiş CC0 varlıkları](../wave32/README.md) önceki yayında indirildi; bu tur onların dünya yerleşimini veya yeni asset indirmesini içermez.

## Son dondurulmuş kaynak kanıtı

| Kontrol | Sonuç |
| --- | --- |
| [Native modül](NATIVE.md), gerçek Rapier/Manager/Player/ItemManager/Session | 62 senaryo geçti; reviewer bağımsız tekrarında da geçti. |
| [Model/ses/once-disposal](ART.md) | 18 draw / 4 material; 528 ve 564 triangle. İki gerçek idle→warning frame çiftinde poz ayrımı görüldü. |
| [Odaklı birleşik test](focused-final.txt) | 6/6 geçti, 11 s. |
| [Tam regresyon](full-suite-final.txt) | 265/267 geçti, 129 s; eski carry2 Windows libuv abort ve outdoor30 frozen-oracle hatası sürüyor. Tam suite yeşil değil. |
| [Build](build-final.txt) | Geçti, 2.19 s. |
| [Taze gerçek Game browser fixture](PLAYTEST.md) | Işık sonrası geri çekilme 2.989 m / 0 hurt; yana kaçış 2.480 m / 0 hurt; hatta kalma 1 hurt, HP100→82. |
| [Host menüsü](host-advanced-final.png) | Seçenek görünür ve unchecked; session başlatılmadı. |
| [Browser console](browser-final-console.json), [menü console](host-final-console.json) | İkisinde de warn/error yok. |

Browser etiketi **NATIVE_INTEGRATION + VISUAL_REPLAY**: tek App clock ve gerçek controller kullanıldı, tuşlar synthetic repeat olaylarıdır. GUIDED_INPUT, insan tepkisi/eğlencesi, WebRTC/TURN/NAT veya donanım FPS kanıtı değildir. Loş ram gövdesi ve flashlight altında yıkanan dormant maskesi art sınırları olarak korunur.

[Bağımsız review](REVIEW.md) kalan kabul sınırlarını kaydeder. Sahiplik: native ajanı FSM/fixture ve dar grenade düzeltmesi; art ajanı model/audio; root mevcut boot/host/pool/protocol/UI entegrasyonu, tek browser ve birleşik Git; reviewer yalnız rapor.
