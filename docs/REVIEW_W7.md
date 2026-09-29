# TFG — Genel Değerlendirme (Wave 7, 2026-09-29) — Game Director (Opus)

Kaynaklar: kod tabanı + ajan raporları + `docs/RESEARCH_W7.md` (Lethal Company, R.E.P.O., Content Warning, Phasmophobia, DRG, Barotrauma, Tarkov, Valheim, Peak).

## 1. Kısa hüküm
**Artık "düz Lethal Company klonu" değil, ama henüz "net özgün bir oyun" da değil.** Temel döngü (in → loot → dön → kotayı sat) hâlâ LC'nin iskeleti. Üstüne çok güçlü, özgün bir kimlik katmanı eklendi (The Algorithm'in canlı yayını, bölge ele geçirme, patron hikâyesi) — ama bu katman **oyunun tek bir ana eylemine (verb) dönüşmedi**, dağınık sistemler halinde duruyor.

Araştırmanın 1 numaralı dersi: *başarılı klonlar (R.E.P.O. = fizikle tutma, Content Warning = arkadaşını çekme) tek bir yeni ana eylem ekledi; "aynısı + küçük farklar" olanlar battı.* TFG'nin bu tek eylemi henüz yok.

## 2. İyi olanlar (koru)
| # | Güçlü yan | Neden önemli (araştırma) |
|---|---|---|
| 1 | **Tarayıcıda, linkle anında katılım** | Tür için en büyük sürtünme "arkadaşım oyunu almadı". Bu bizde yok → dev avantaj (faktör #4). |
| 2 | **Proximity voice (HRTF, telsiz, ölünce kesilme)** zaten var | Türün #2 başarı faktörü; LC'yi LC yapan şey. |
| 3 | **Algoritma kimliği** (izleyen/öğrenen/yayınlayan kötü karakter, LIVE, hype, oylama, hayalet, glitch) | Hiçbir rakipte yok; araştırmanın 10 fikrinin çoğu bu yönde. |
| 4 | **Kayıp korkusu**: ölen loot'u yerde kalıyor, geç kalan dışarıda kalıyor | Faktör #3 (Tarkov "gear fear"). |
| 5 | **Kural tabanlı yaratıklar**: sese duyarlı Listener, görünür nişan alan NPC'ler, kaçılabilir kovalamalar | Faktör #6: oyuncunun davranış değiştirmesi gerekiyor. |
| 6 | **Rol asimetrisi**: roller + rol kısıtlı günler | Faktör #7. |
| 7 | **Uzun vade**: bölgeler, hikâye, günlük/sezon, kozmetik | Türün en zayıf yanı retention (D30 ~%3) — bizde araç var. |

## 3. Kötü / riskli olanlar
| # | Sorun | Etki | Çözüm |
|---|---|---|---|
| 1 | **Tek ana eylem yok** — 60+ sistem, hiçbiri "30 saniyelik klipte anlaşılan" çekirdek değil | Tanıtımı ve akılda kalmayı öldürür | §28.1: "Kameradan kaç" ana eylemi |
| 2 | **Genişlik > derinlik** (satranç, karnaval, fabrika, pet, forge, voyage, bölgeler...) | Oyuncu boğulur, bakım zor | Kademeli açılım var; yan sistemleri "sonra" plana it, çekirdeği cilala |
| 3 | **Neredeyse hiçbir şey 2 kişiyle denenmedi**, çoğu tarayıcıda bile görülmedi | Ağ hataları komediyi öldürür (araştırma: netcode/desync) | QA turu + sahibin 2 kişilik oturumu (kontrol listesi) |
| 4 | **Oturum uzunluğu** — kota günleri uzun; tür 10-40 dk sever | Kısa oturumlu arkadaş grupları kaçar | §28.3: "Hızlı Vardiya" modu (15 dk) |
| 5 | **Fizik komedisi zayıf** (loot'lar basit taşınıyor) | Başarısızlık komik değil, cezalandırıcı | §28.4: ağırlıklı/kırılgan loot, Algoritma'nın fizik şakaları |
| 6 | **Klip üretmiyor** — yayıncı/klip döngüsü yok | Türün pazarlaması klip | §28.2: Algoritma'nın "öne çıkanlar" klibi |
| 7 | **Performans belirsiz** (draw call, sızıntı, düşük grafik yeni) | Tarayıcı oyununda zayıf PC = kayıp oyuncu | perf2 ajanı çalışıyor |
| 8 | **Görsel dil yeni yeni oturuyor** | İlk izlenim | artdir ajanı çalışıyor |

## 4. Orijinal mi, klon mu? (dürüst puan)
- Tema ve kötü karakter: **özgün (8/10)** — kurumsal korku + yayın yapan yapay zekâ.
- Çekirdek döngü: **klon (3/10)** — LC'nin in/loot/kota döngüsü neredeyse aynı.
- Meta sistemler: **özgün (7/10)** — bölgeler, patronlar, hayalet tekrarı, oylama.
- His/klip: **zayıf (4/10)** — tek ana eylem ve fizik komedisi yok.
Genel: **~6/10 özgün**. Çekirdek eylem değişmeden "LC gibi" algısı sürer.

## 5. Ne yapmalı (Wave 8 — §28)
1. **Ana eylem: "Kameradan kaç / yayını kes"** — Algoritma'nın kameraları (tavan kameraları, dronlar, direkler) görüş konileriyle dünyada görünür. Görülmek = izleyici + tehdit; kör noktalar, kamerayı karartma, yayın gecikmesi ile yem bırakma. Çıkış: loot ancak ekip "yayın dışı" N saniye kalınca bankaya geçer. Tüm mevcut sistemler (stealth, mapart direkleri, hype, aimtell) buna bağlanır. *Bu, klibi olan tek cümlelik oyun: "Yapay zekâ seni yayınlıyor; kameralardan kaçarak loot'u çıkar."*
2. **Öne çıkanlar klibi** — run sonunda Algoritma en iyi 3 anı (ölüm, son an kaçış, komik fizik) 10 sn'lik tekrar olarak "kurgular"; paylaşılabilir.
3. **Hızlı Vardiya modu** — 15 dakikalık tek gün, sabit küçük kota, lobiden direkt; linkle gelen arkadaş için ideal.
4. **Fizik komedisi** — ağır/kırılgan/iki kişilik loot, sallanan taşıma, Algoritma'nın "bağış" olayları (kaygan zemin, ışık titremesi, prop fırlatma).
5. **Operatör rolü** — gemideki bir oyuncu Algoritma'nın panosunu (kameralar, dikkat hedefi, chat) görür, sadece telsizle yönlendirir.
6. **Algoritma seni hatırlar (oturumlar arası)** — algo1 davranış profili kalıcı ve açılışta alaylı bir "geçen sefer..." ile gelir (zaten kısmen var → kalıcı yap).

Önerilen sıra: 1 → 3 → 2 → 4 → 5 → 6. Yeni yan sistem eklenmez; mevcutlar bu çekirdeğe bağlanır.
