# TFG — MASTER PLAN & PROGRAM (v1, 2026-09-28)

> Sahibin (owner) dev fikir dökümünün sistemleştirilmiş hali. Her geliştirme turu bu dosyadaki fazlardan birini
> ilerletir ve sonunda §9 "Durum" tablosunu günceller. Kod tarafı kuralları: AGENTS.md §7.
> Dil: bu dosya Türkçe (sahibi Türkçe yazıyor), teknik terimler İngilizce.

---

## 0. Tek cümle

**"İçeride ne olduğunu bilmiyoruz. Ama biraz kurcalayınca bina da bizim ne yaptığımızı öğreniyor."**

TFG artık "Lethal Company çakması" değil: **yaşayan tesisleri söküp kurcalayan, RPG ilerlemeli, büyülü, fraksiyonlu,
co-op bir extraction oyunu.** Korku + fizik komedisi + keşif + ilerleme. Lethal/REPO'dan kalan tek şey çekirdek
döngünün iskeleti (gemi → in → topla → çık → sat).

## 1. Neden şu an "ruhsuz" hissettiriyor (teşhis)

| Sorun | Kök neden | Çözüm (faz) |
|---|---|---|
| Merak uyandırmıyor | Her oda aynı: loot > çıkış. Bilinmeyen/gizli/strange şey yok | Strange item + secret route + lore kırıntıları + kontratlar (F1, F3) |
| Item çıkmıyor | Scrap az, tier/rarity hissi yok, chest yok, craft yok | Tier sistemi, chestler, component drop, craft (F1) |
| Silah/shop zayıf | Terminal STORE listesi, silah çeşidi az | Company Store paneli, silah tierleri, kart atma silahı (F1) |
| Kilitli kapıda sıkışma | Kilitli kapı tek yolun üstünde olabiliyor | "Kilit asla tek yolu kesmez" + alternatif girişler (F1) |
| Yaratıklar çok güçlü | Başlangıç güç bütçesi yüksek, hız sabit | Erken oyun ×0.6 hasar / ×0.8 hız, zamanla artan Threat (F1) |
| Gemi kapısı bugu | Kapı collider'ı oyuncunun içine spawn oluyor / durum senkronu | Fix (F1) |
| Kopya hissi | Kimlik/lore/kötü karakter yok | The Algorithm villain + fraksiyonlar + Case raporları (F1-F3) |

## 2. Lore (kanon)

**Yıl 20XX. İnternet öldü.** "Dead Feed" olayında insanların %90'ı çevrimdışı kaldı; geriye botların, yarım kalan
içeriklerin ve fiziksel veri tesislerinin olduğu **sunucu ayları** kaldı. Bu aylarda eski internetin bedenleri
duruyor: oteller, hastaneler, madenler, lunaparklar — hepsi bir zamanlar bir platformun "fiziksel sunucusu"ydu.

**THE ALGORITHM (ana kötü, "Game Creator").** Siz onun için çalışan müteahhitlersiniz. Kotayı o koyar, hurdayı o
alır. Ama asıl işi para değil: **sizi izler ve sizden içerik üretir.** Ölümleriniz, panikleriniz, ihanetleriniz
bot seyircilere "Engagement" olarak satılır. Oyuncuların davranışını öğrenir (gürültü, kapı kullanımı, ışık,
ayrılma, açgözlülük) ve bir sonraki "bölümü" buna göre yazar — **oyunun görünmez Director'ı hikâyede de vardır.**
- Görünüşü: gemi CRT'lerinde, interkomda, tesis hoparlörlerinde konuşan, yüzü sürekli yeniden render olan bir sunucu.
- Kişiliği: kibar kurumsal ton + sadist yayıncı. "Harika içerik, Çalışan #4. Tekrar yapalım mı?"
- Adapte olur: sprint spam → koridora pusu; hep aynı rota → o rotada engel; takım hep beraber → onları ayıran olay.
- Final (Chapter 4 "The Source"): Algoritmanın çekirdeğine inip fişini çekmek **ya da** yeni Algoritma olmak.

**Fraksiyonlar (kontrat verenler) — biriyle çalışmak diğerini kızdırır:**

| Fraksiyon | İstediği | Verdiği | Rakibi |
|---|---|---|---|
| **The Algorithm** (Feed Corp) | Satılabilir hurda, "içerik" (ölümler bile) | Kredi ▮, gemi upgrade | The Archive |
| **The Archive** (Wayback Kolektifi) | Strange/artifact/lore'u **kırmadan** getirmek, araştırma | Blueprint, tech, lore | The Algorithm |
| **Moderation Bureau** | Entity temizliği, containment, sabotaj | Silah, zırh, rütbe | Dark Web |
| **Dark Web** (Phish Dayı'nın karaborsası) | Cursed item, ihanet kontratları, yasak tech | Clout ◈, illegal gear | Moderation Bureau |

- Reputation −100..+100. Bir fraksiyonla **exclusive** anlaşma imzalamak rakibin itibarını düşürür.
- İtibar −40 altına inen fraksiyon **savaş açar**: run'lara **Hit Squad** (silahlı/bıçaklı NPC asker ekibi)
  gönderir → Dark Souls tarzı **invasion** ("⚠ MODERATION BUREAU SQUAD HAS INVADED THIS SECTOR").
- Fraksiyon kontrat zincirleri (5 adımlık hikâyeler) → chapter'ları taşır.

**Chapter yapısı:** 1 *Dead Feed* (başlangıç), 2 *Containment* (Bureau/Archive çatışması), 3 *Black Site*
(Dark Web, cursed tech), 4 *The Source* (Algoritmanın çekirdeği). Her chapter: 1 yeni tesis, 2-4 yaratık,
20-30 item, kontrat zinciri, sırlar.

## 3. Beş imza mekanik (her şey bunların etrafında döner)

1. **Living Facility** — Binanın state'i var: Elektrik (kapalı/düşük/normal/overload), Güvenlik
   (pasif/aktif/alarm/lockdown), İzolasyon (normal/breach/failure), Havalandırma (temiz/gaz/yangın/toksik).
   Birbirini etkiler: overload → karartma → kapılar kilitlenir → karanlık yaratıklar aktif → acil ışıklar
   → bir yol açılır başka yol kapanır. "AMK ELEKTRİĞİ KİM AÇTI?"
2. **Physical Salvage** — Eşyalar ağırlık, kırılganlık, ses, tehlike taşır. 500$ ama gürültülü / 900$ ama
   kırılırsa zehir / canlı eşya. Loot'u **bırakmak için sebep** yaratır.
3. **Adaptive Monsters** — Her yaratığın **amacı** farklı (Predator, Scavenger, Mimic, Territorial, Parasite,
   Stalker, Janitor, Collector). Director oyuncu davranışına göre ağırlık değiştirir.
4. **Death Gameplay (Echo Mode)** — Ölen oyuncu ışık titretir, kapı açar, ses çıkarır, yaratık görüşünü görür.
5. **Extraction Phase** — Çekirdeği/objektifi alınca bina alarm verir, kapılar kapanır, spawn kuralları değişir:
   keşif → kaçış iki ayrı faz.

Üstüne üç katman: **Chaos** (fizik, tesis, event), **Social** (taşıma, troll, telsiz, ihanet), **Discovery**
(sırlar, artifact, lore, harita değişimi).

## 4. Döngüler

```
PREPARE → KONTRAT SEÇ (3 seçenek) → TESİSE GİR → KEŞFET → TESİSİ MANİPÜLE ET → TOPLA/ARAŞTIR
   → RİSK ARTAR (Threat) → "BİR ODA DAHA" mı "ÇIKALIM" mı → EXTRACTION EVENT → DÖN
   → CASE RAPORU → SAT / ANALİZ ET / SAKLA → CRAFT & UPGRADE → DAHA ZOR KONTRAT → YENİ SEKTÖR
```
Meta döngü: Level → skill puanı → **pasif ağaç** (PoE tarzı) + **rol** + **büyü kitapları** → daha derin sektör.
Sosyal döngü: "Geçen gece Ali öldü, cesedini taşıyıp 8.000$'lık şeyi çıkardık ama elektriği biz kestik."

## 5. Sistem kataloğu (fikir → sistem → mevcut kod bağlantısı)

### 5.1 Envanter, item tier, loot (Diablo hissi)
- **I** tuşu: Diablo tarzı ızgara envanter (hotbar 4 slot + sırt çantası ızgarası + ekipman slotları:
  silah, zırh/suit, trinket, çanta). Sürükle-bırak, tooltip, kıyaslama.
- **Tierler**: Common / Uncommon / Rare / Epic / Legendary / **Mythic** (+ Cursed, Living, Strange flag'leri).
  Mevcut affix sistemi (`loot.js`) silahlarda devam; tier renkleri her yerde (dünya parıltısı, ikon çerçevesi).
- **Çantalar**: Belt Bag → Field Pack → Hauler Frame → Void Satchel (ızgara 2×3 → 6×5). Shop + chest + craft.
- Item sınıfları: Junk, Valuable, Rare, Artifact, Tool, Key Item, Lore, Cursed, Living, **Component**
  (battery, fuse, cable, fuel, coolant, sensor, circuit, scrap metal, wood, crystal, ectoplasm…).
- **Strange item**: ilk başta ne yaptığı bilinmez (Black Box, Red Phone, Unknown Egg, Broken AI Core, The Watch).
  SAT (para) / ANALİZ ET (blueprint, bilgi) / SAKLA (gelecek event).

### 5.2 Shop / Market (Company mantığı)
- **Company Store** paneli (gemi terminali + HQ tezgahı): kategoriler Silah / Alet / Çanta / Sarf / Suit /
  Gemi. Fraksiyon dükkânları: Bureau silah-zırh, Archive tech-blueprint, Dark Web cursed/illegal (◈ Clout).
- Silah tierleri: bıçak, beyzbol sopası, pompalı, tabanca, nail gun, çapraz yay… **Stacked Deck** (TF tarzı
  kart atma: altın=stun, kırmızı=AoE, mavi=mana/geri ödeme; 3 kart yelpazesi).

### 5.3 Büyü & Skillbook (konuşarak büyü)
- Büyüler **kelime söyleyerek** (Web Speech API, mikrofon) **veya chat'e yazarak** (`/cast` gerekmez; tek kelime)
  **veya hotkey** ile atılır. Örn. *"İT!" / "PUSH!"* → önündeki yaratıkları/objeleri iter (ittirme gücü),
  *"IŞIK" / "LUMEN"* → uçan ışık küresi, *"ŞİFA" / "HEAL"*, *"KALKAN"*, *"SIÇRA" / "BLINK"*, *"SUS"* (sessizlik
  alanı), *"ÇEK" / "PULL"* (uzaktan loot çekme).
- Büyüler **Skillbook** item'larıyla öğrenilir (chest/boss/Archive/Dark Web). Mana barı; rol/ağaç mana verir.
- Yüksek sesle bağırmak gürültü yapar → yaratık çeker (risk!). Fısıldayarak (yazarak) sessiz ama yavaş.

### 5.4 Roller & Pasif ağaç (RPG)
- **Roller** (run başında seç, sabit class değil; loadout + küçük pasif): Scout, Hauler, Technician, Field Medic,
  Occultist (büyü), Enforcer (dövüş). Takım kompozisyonu yaratır ama aşırı güçlü değil.
- **Pasif ağaç** (PoE tarzı, **K** tuşu): merkezde 6 rol başlangıcı, ~120 node: küçük stat node'ları +
  **keystone**'lar ("Blood Magic: mana yerine can", "Pack Mule: ağırlık cezası yok ama sprint yok",
  "Glass Cannon"…). Mevcut `progression.js` skill puanları ağaca bağlanır; respec Clout ile.
- Title / badge / banner / player card / prestige zaten kısmen var (`achievements.js`, `prestige.js`).

### 5.5 Living Facility, puzzle, extraction
- Tesis state makinesi (host-authoritative, `run` üstünden senkron) + HUD "FACILITY STATUS" paneli.
- Objektif zincirleri: *Jeneratörü bul → sigorta tak → elektriği aç → asansörü/kasa kapısını çalıştır →
  karantina katını aç → Çekirdeği çıkar → ALARM → EXTRACTION.*
- Bulmacalar: 3 paneli doğru voltaja bağla, sigorta sırası, güvenlik kodu parçaları (lore notlarında), basınç
  plakaları, Overload kumarı (%60 kapı açılır / %25 ışık gider / %10 alarm / %5 özel event).
- **Kilitli kapılar asla tek yolu kesmez**; her tesisin ≥2 girişi (ana + yangın çıkışı/havalandırma/servis).
- Challenge odaları: Physics / Gambling / Arena / Puzzle / Treasure room.
- Set-piece olaylar: Elevator stop, Blackout 60 sn, Lockdown, Collapse, Migration, "FACILITY STATUS: UNKNOWN".

### 5.6 Threat / Greed & denge
- **Threat meter** (0-100): içeride geçen süre, taşınan değer, gürültü, alarm ile artar; ölüm/çıkış/relief
  ile düşer. Yüksek threat = daha çok ve daha agresif spawn **ama** daha iyi loot (Greed).
- Zorluk eğrisi: `güç = taban × (0.55 + 0.12·quotaIndex)`, erken hız ×0.8, hasar ×0.6; ilk 90 sn giriş
  güvenli. Relief pencereleri (director) korunur. "Difficulty +20%" yok — dünya tepki verir.

### 5.7 Yaratıklar & NPC'ler
- Amaç tabanlı yeni türler: **The Mimic** (takım arkadaşının görünüşünü/sesini kopyalar; fotoğrafta düzgün
  görünmez → **Kamera** itemi karşı), **Collector** (değerli loot'u yuvasına taşır), **Janitor** (açtığın kapıları
  kapatır, ortamı düzenler), **Bot Swarm** (zombi benzeri, yavaş, zayıf, kalabalık — dış alanda gece hafif
  Vampire Survivors dalgaları; XP ve component düşürür), **Hit Squad askerleri** (bıçaklı/silahlı NPC; fraksiyon
  invasion'ı ve bazı PvP zone haritaları).
- Yaratık ilişkileri: A B'den korkar, B loot çalar, C karanlıkta güçlenir… Kandırma: decoy, ses, ışık, alarm.
- Apex encounter'lar (boss değil fenomen): The Caretaker (otel), The Excavator (maden), The Host (hastane),
  The Corridor (seni takip eden koridor).

### 5.8 Açık dünya, sonsuz haritalar
- `moongen.js` zaten sonsuz sektör üretiyor → her sektörde daha büyük/tehlikeli aylar. Yeni gezegen tipleri:
  **Lav**, **Buz**, **Orman/Jungle**, Toksik, Kristal… Dış alanda **kuleler, harabe binalar, parkur rotaları**
  (tepede chest), ağaç kesme (odun), maden damarı, chestler. Harita "biome gibi" planlanır.
- Tesis konseptleri (her biri yeni oynanış problemi): Abandoned Hotel (dikey, Hotel Shift), Research Facility
  (power→cooling→doors→containment), Deep Mine (araç, raylı vagon), Theme Park (kaos, park çalışır),
  Offshore Platform (fırtına, düşme), Quarantine Hospital (NPC, containment). İlk sürümler mevcut interior
  temalarının üstüne "macro layout + micro randomness" olarak gelir.

### 5.9 Eğlence, sosyal, kozmetik
- Kozmetik suitler (**Venom suit**, hazmat, clown, astronaut, diver, tavuk, balık kafası…), şapka/sırt/yüz
  aksesuarları, rarity; açılış yolu achievement/secret/mastery (sadece shop değil). Güç vermez.
- **Futbol topu** (gemi/HQ, fizik), basket potası; **Among Us tarzı görevler** (tesiste küçük görev
  istasyonları: kablo bağla, veri yükle, filtre temizle → takım bonusu; biri "sabotajcı" gizli görev alabilir).
- Oyuncu taşıma (yerdeki arkadaşı omuza al), fizik troll'leri (kazara komik), alışveriş arabası, forklift.
- **Echo Mode**: ölü oyuncu sınırlı etkileşim.
- Case raporu: *CASE #1842 — Entered 4, Returned 3, Artifact 2, Generator destroyed 1, Cause of death "Unknown",
  Last words "GET THE FUCK OUT"* + run history.

### 5.10 Üs, gemi inşası, PvP
- Gemiyi dizme/geliştirme: mobilya/trophy yerleştirme ızgarası, duvara fotoğraf/artifact asma ("hikâye müzesi").
- **PvP**: PvP zone aylar, **gemi-gemi baskın** (başka ekiplerin lobisine invasion), Arena. P2P mimaride
  host-authoritative kalarak "invader" oyuncuyu geçici misafir peer olarak alma. (F6 — ağ işi büyük.)

### 5.11 AI Content Director (üretim hattı)
```
FİKİR → LLM (kısıtlar + mevcut içerik listesi) → SPEC JSON (map/creature/item/event/cosmetic/contract)
  → VALIDATOR (tools/content: şema, tekrar, performans bütçesi, kazanılabilirlik) → PROCEDURAL GENERATOR
  → OTOMATİK TEST RUN (headless harness) → İNSAN ONAYI → OYUN
```
- Kısıtlar: mevcut mekaniği kopyalama, imkânsız oda yok, performans bütçesi, haksız düşman yok, kozmetik güç vermez;
  her içerik 1 yeni fikir + mevcut sistemleri yeniden kullanır + extraction rotası + risk/ödül.
- Telemetri → "lobby sıkıcı, bodrumdan kaçınılıyor" → yeni varyant önerisi. Otomatik prod'a gönderim yok.
- Oyun içi karşılığı: **The Algorithm** = runtime Director; offline karşılığı = içerik üretim hattı.

## 6. Model kullanım politikası (geliştirme)
- **Varsayılan: Sonnet 5.5** (sahibin isteği: "sonnetler daha fazla olsun"). İçerik, özellik, panel, denge,
  bug fix, QA/playtest, doğrulama ve fix turları Sonnet ile yapılır (`.claude/agents/tfg-builder.md`, `tfg-qa.md`).
- **Opus 5.5** sadece gerçekten zor işler için (`.claude/agents/tfg-architect.md`): ağ-hassas host mimarisi,
  büyük state makineleri, birden fazla sistemi kesen tasarım kararları. Hedef oran: ajanların ≥%70'i Sonnet.
- Paralel ajanlar ayrı git worktree'lerinde çalışır; `game.js` içindeki `// [slot:x]` / `// [import:x]` satırları
  sayesinde merge çakışması olmaz. Headless test: `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs`.

## 7. Fazlı program

| Faz | Tema | İçerik | Durum |
|---|---|---|---|
| **F1 — Wave 1 (bu tur)** | Temel + kimlik | Envanter (I) + tier + çanta · Company Store + silahlar + Stacked Deck · Craft + component + chest + ağaç · Living Facility state + objektif zinciri + extraction + kilit fix · Threat/denge + erken oyun zayıf yaratıklar + gemi kapısı fix · Büyü/skillbook + sesle büyü · Roller + PoE pasif ağaç (K) · Lore: The Algorithm director + fraksiyonlar + kontratlar + Case raporu · Bot Swarm + Hit Squad + Mimic/kamera + Collector + Janitor · Kuleler/parkur/lav-buz gezegen · Venom suit + kozmetik + futbol + görevler + Echo Mode | 🚧 |
| F2 | Tesis kimlikleri | Hotel (Hotel Shift, çok kat), Research Lab zinciri, Theme Park, Offshore, Quarantine Hospital; local event havuzu (15-30/map), secret route'lar, apex encounter'lar | ⏳ |
| F3 | Derin ilerleme | Kontrat zincirleri (5 adım), araştırma (Sell/Analyze/Keep), curse sistemi, strange item olayları, NPC'ler (yardımcı/yalancı), faction savaşları derin | ⏳ |
| F4 | Sosyal kaos | Oyuncu taşıma, forklift/alışveriş arabası, sahte teammate, telsiz bozulması, fotoğraf kamerası anomali, ihanet görevleri, mutator'lar, Golden/Anomaly run | ⏳ |
| F5 | Üs | Gemi/üs dekor ızgarası, trophy duvarı, evcil tehlikeli yaratık (Blob), mini oyunlar hub'ı | ⏳ |
| F6 | PvP | PvP zone ay, gemi baskını/invasion (gerçek oyuncu), arena | ⏳ |
| F7 | İçerik motoru | AI Content Director spec şemaları + validator + telemetri | ⏳ |
| F8 | Canlı servis | Chapter/sezon, haftalık kontratlar, event setleri, prestige kozmetikleri | ⏳ |

Hedef ölçek (uzun vade): 12 tesis/harita ailesi, 30-40 yaratık/anomali, 150-250 loot/interactable,
200+ kozmetik, 100 achievement, 4-6 ilerleme sistemi. Metrik: **her 15-20 dakikada en az 1 "WHAT THE FUCK" anı.**

## 8. Denge ilkeleri
- Başlangıç: yaratıklar yavaş ve zayıf; ölüm oyuncu hatasından gelmeli. İlk kota ≈ öğrenme.
- Zorluk üç eksende artar: **sektör** (quotaIndex), **içerideki süre/Threat**, **açgözlülük** (taşınan değer).
- Her güç artışının karşılığı var (daha iyi loot, daha çok XP). Relief pencereleri korunur.
- Yeni sistem = yeni karar, stat şişirme değil (+%10 stamina yerine yeni oynanış şekli).

## 9. Durum (her tur güncellenir)
- 2026-09-28: Plan yazıldı; Wave 1 başlatıldı (11 modül, paralel ajanlar). Sonuçlar AGENTS.md §5.11'de.
