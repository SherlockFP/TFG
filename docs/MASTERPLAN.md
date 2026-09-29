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
- **Test bütçesi (sahibin isteği):** ajan başına en fazla 1 smoke + 1 özellik çalıştırması ve 1-2 ekran görüntüsü;
  uzun playtest döngüsü yok. Oyun hissi = sahibin kendi playtest'i. **Hedef: oyunu daha eğlenceli yapmak.**
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

## 10. Yaratıcı içerik havuzu (Wave 2+ adayları)

Kural: her fikir **dead internet** kimliğine ve **The Algorithm** villain'ına bağlanır; "LC'de de var" dedirten şey eklenmez.

### 10.1 İmza fikirler (oyunu farklı yapacak 5 şey)
1. **Canlı Yayın / Seyirci Chat'i** — The Algorithm run'ları bot seyircilere yayınlıyor. Ekranın kenarında sahte chat
   akar ("KILL HIM", "F", "that was scripted"). Seyirci **bağış/oylama** ile olay tetikler: "$5: ışıkları kapat",
   "oylama: kapıları kilitle / loot yağmuru". Heyecanlı an = **Views** = bonus para. Ölüm, kıl payı kaçış, fizik
   kazası, ihanet → viewer patlaması. Villain + ekonomi + komedi tek sistemde.
2. **Klip & Bölüm sistemi** — oyun son 10 sn'lik pozisyon/olay kaydını tutar; gün sonunda gemide **TOP 3 CLIPS**
   tekrar oynatılır (kamera replay) ve güne otomatik başlık verilir: *"S01E04 — Ali'nin Asansörle İmtihanı"*.
   Case file ile birleşir; paylaşılabilir an üretir.
3. **Unfinished Level (Beta Build ayları)** — The Algorithm haritayı **gözünün önünde yapıyor**: duvarlar sen
   bakınca yükleniyor, texture'suz alanlar, mor-siyah "missing texture" yaratıklar, `TODO_monster`, yere düşen
   debug küpleri, "LOADING 87%" kapıları. Oyunun kendisi korku malzemesi.
4. **Ctrl+Z ekonomisi** — nadir **Undo** itemleri: son 5 sn'yi geri sar (pozisyon + can), kırılan eşyayı "restore",
   ölen arkadaşı son checkpoint'e geri al. Pahalı, gürültülü, Algorithm'ın dikkatini çeker.
5. **Captcha kapıları** — kilitli kapılar "İnsan olduğunu kanıtla" der: kameradan alınmış gerçek görüntüden
   "yaratık olan kareleri seç" bulmacası. Yanlış seçim = alarm. Mimic de captcha'yı geçemez (karşı-oyun).

### 10.2 Yaratık fikirleri (amaç tabanlı)
| Yaratık | Amaç | Karşı oyun |
|---|---|---|
| **Buffering** | Yakınındayken hareketin takılır (stutter), sesin gecikir | Uzak dur, hızlı geç |
| **Doomscroller** | Baktığı sürece koridor sonsuz döngüye girer | Göz temasını kes, arkadaş kapıyı açar |
| **Tracking Cookie** | Sana yapışır, konumunu diğer yaratıklara yayınlar | Adblock spray, suya gir |
| **Recommended For You** | En çok seni öldüren yaratığın kopyası olur | Çeşitli oyna |
| **Influencer** | Işık + müzikle çeker, etrafında "fan" sürüsü | Işığını kır, fanlar dağılır |
| **Ratio** | İki beden: birine vurmak diğerini iyileştirir | Aynı anda vur (co-op) |
| **Autoplay** | Seni bir sonraki odaya "otomatik oynatır" (çeker) | Bir şeye tutun (E) |
| **Terms of Service** | Metin duvarı; okumadan geçersen "kabul ettin" → lanet | Scroll et / atla bedeli |
| **Unsubscribe Button** | Dev kırmızı buton taklidi (interactable mimic) | Tarama, kamera |

### 10.3 Item fikirleri
Copy-Paste Gun (değersiz sahte kopya yapar — Collector'u / arkadaşı kandır), VPN Cloak (Algorithm focus'undan
kaçar), Incognito Tab (10 sn görünmez ama loot taşıyamazsın), Like-Button Grenade (sese gelen yaratıkları çeker),
Ratio Ray, Cookie Jar (tracking cookie yakalar → üste evcil hayvan), Firmware Update (tier yükseltir, %10 brick),
Ban Hammer (boss drop), Loading Bar (taşınabilir mini checkpoint).

### 10.4 Sosyal kaos
Oyuncu taşıma (omuza al), **"KILLED BY: YOUR FRIEND"** suçlama ekranı, gürültü eşiği (bağırmak = yaratık yemi),
sahte teammate (Mimic + chat taklidi), ihanet kontratları (Dark Web), "biri içeride kalmalı" extraction'ları,
alışveriş arabası / forklift / ofis sandalyesi fizik komedisi.

### 10.5 Yol (verimli üretim döngüsü)
1. **Wave 1 + Backrooms'u birleştir → tek scripted test → main'e push (Render deploy).**
2. **Sahip 15 dk oynar** → en kötü 5 şeyi yazar → önce onlar düzelir (eğlence > içerik miktarı).
3. Her tur **1 imza sistem + 1 içerik paketi** (yaratık/item/oda), 1-3 Sonnet ajanı, Opus sadece mimari.
   Önerilen sıra: (a) Canlı Yayın/Seyirci Chat, (b) Klip & Bölüm, (c) Unfinished Level ayı, (d) Captcha kapıları,
   (e) Ctrl+Z itemleri, sonra F2 tesis kimlikleri (Hotel Shift vb.).
4. İçerik paketleri **veri odaklı şablonla** (tek dosya = 1 yaratık/item + model + TR çeviri) → ucuz, çakışmasız.
5. Test: ajan başına 1 smoke + 1 özellik scripti, ≤2 ekran görüntüsü; oyun hissi testi = sahibin playtest'i.

## 11. Wave 2 backlog (sahibin 2026-09-28 gece istekleri)

| # | İstek | Tasarım notu | Sahip / model |
|---|---|---|---|
| 1 | **P2P optimizasyonu** | ✅ Paket birleştirme (`_b`), delta satırlar (`sendRows` — creature `cs`, item `is`), boştaki oyuncu 4 Hz heartbeat, NETSTATS komutu, GAME_VERSION 0.10.0. Sırada: uzak oyuncu/yaratık interpolasyonunu zaman damgalı buffer'a çevirmek (akıcılık), ilgi alanı (uzak yaratıkları seyrek gönder) | lead |
| 2 | **Host migration (CoD lobi gibi)** | Host çıkınca herkese "HOST LEFT — DEVAM ET / ÇIK". Devam edenler arasında en küçük peer id'li oyuncu yeni host olur (mesajlaşmadan herkes aynı sonuca varır). Yeni host kendi kopyasındaki run + gemideki eşyalardan runData kurar, gemiyi yörüngeye alır ("Signal lost — autopilot"), oyun kaldığı yerden devam eder. Mid-day tam devralma sonraki adım | lead / tfg-architect |
| 3 | **Karakter takılması + akıcı hareket** | localplayer sub-step / kamera interpolasyonu / collider dikiş yerlerinde takılma / GC & shader derleme spike'ları ölçülüp düzeltilecek | lead (merge sonrası) |
| 4 | **Viewmodel** | Elde tutulan eşyaların elin içine girmesi, iç içe geçme, görünmeme: eşya başına tutuş offset'i + bounding-box tabanlı otomatik yerleştirme + ayrı viewmodel katmanı (depth clear) | lead (merge sonrası) |
| 5 | **UI "AI gibi" görünüyor** | Ortak tasarım dili: tek font hiyerarşisi, daha az kutu/çerçeve, daha az emoji, tutarlı boşluklar, gerçek ikonlar; tüm panellerde aynı başlık/alt bilgi | tfg-builder |
| 6 | **Ekstra oyunlar** | Gemide/HQ'da oynanabilir: **satranç, dama**, karnaval oyunları (halka atma, balon patlatma, çekiç vurma, düşen ördek atış), kart oyunu, zar. Çok oyunculu (P2P senkron) | tfg-builder |
| 7 | **Peluş oyuncaklar, kuklalar, değişik yaratıklar/itemler** | itch.io'daki CC0 paketlerinden model + beğenilen oyunlardan (REPO vb.) ilham alan **yeniden yorumlanmış** yaratıklar (birebir kopya değil): kukla ustası, peluş sürüsü, müzik kutusu kuklası… | tfg-builder |
| 8 | **Üçgen / liminal haritalar** | İmkânsız geometri (içi dışından büyük odalar, sonsuz merdiven, üçgen/eğik koridorlar, portal kapılar), liminal alanlar (boş AVM, oyun parkı, gece otoparkı, havuz, okul koridoru) | tfg-builder |
| 9 | **Haritada daha fazla etkileşim / bağlılık** | Her odada dokunulabilir şey: çekmeceler, bilgisayarlar, radyolar, asansör düğmeleri, graffiti, kırılabilir camlar; günlük ödül/koleksiyon hedefleri; "bir şey daha" hissi | tfg-builder |
| 10 | **Oyun içinden baskın / invasion** | Gemi terminalinde **SIGNAL HIJACK**: açık lobilerin sinyalini yakala → **yaratık olarak** o lobiye sız (kısa süreli, sınırlı can, tek canavar gövdesi). Başarı = çalınan değer/Clout; savunan ekip öldürürse ödül alır. Dengeler: günde 1 baskın, yeni oyunculara (level < 5) baskın yok, host "Invasions: off" diyebilir, invader'ın gücü hedef ekibin sektörüne göre ölçeklenir | tfg-architect |
| 11 | **Tuzak kurma** | Ayı kapanı, tripwire alarm, yay tahtası, sahte loot yemi, elektrikli zemin; hem yaratıklara hem invader'lara karşı; craft ile | tfg-builder |
| 12 | **Denge** | Her yeni sistem Threat/lootLuck/sektör çarpanlarına bağlanır; invasion ve tuzaklar için ayrı denge tablosu `docs/wave1/balance.md` içinde | lead |
| 13 | **Sosyal HUB gezegeni** | Oyun menüden değil **"The Feed Plaza"** adlı ortak bir hub gezegende başlar: herkes aynı serverless Trystero odasında (düşük frekanslı pozisyon + chat, ilgi alanı yönetimi, görünen oyuncu sınırı ~20). Burada tanışır, **ekip kurar** (party → otomatik lobi kodu), arkadaş ekler (profil kartı), **davet** eder, sonra iskeledeki kendi gemisine yürüyüp kalkar. Hub'da dükkânlar, mini oyunlar (satranç/dama/karnaval), trophy duvarı, kontrat panosu, raid/M+ kayıt masası | tfg-architect |
| 14 | **İletişim** | Özel mesaj (DM, arkadaş listesi, çevrimdışı mesaj kuyruğu Nostr üstünden), **telsiz kanalları** (ekip / yakın / genel), **telefon**: gemi telefonundan başka ekibi arama (sesli), hub'da ankesörlü telefon | tfg-builder |
| 15 | **Mythic+ tarzı Keystone koşuları** | "Corrupted Keystone": süreli tesis koşusu, seviye arttıkça affix'ler (Bursting, Sanguine benzeri ama tema uygun: *Viral* — ölen yaratık yayılır, *Laggy* — kapılar gecikir, *Demonetized* — loot değeri düşer ama XP artar…). Süre içinde bitir = anahtar +1..+3, skor tablosu (haftalık) | tfg-architect |
| 16 | **Raid** | 6-8 kişilik çok bölümlü dev tesis (ör. *The Algorithm's Core*): 3-4 boss, mekanikli (bölünme, kalkan taşıma, ışık bulmacası), haftalık kilit, raid loot'u (Mythic tier), kademeli zorluk (Normal / Heroic / Mythic) | tfg-architect |
| 17 | **Delve** | 1-2 kişilik kısa zindanlar, yanında **NPC yoldaş** (level'lanan companion), tier seviyeleri, haftalık sandık; solo oyuncular için | tfg-builder |
| 18 | **Görevli yerler (quest hub'ları)** | Hub'da ve bazı aylarda NPC görev verenler (fraksiyonlar), zincir görevler, günlük/haftalık görevler, dünya olayları ("World Boss spawned on 404-Not Found") | tfg-builder |

Uygulama sırası önerisi (maliyet/etki): 1 → 3 → 4 → 2 → 5 → 9 → 6/7 → 11 → 13/14 → 15 → 17 → 8 → 10 → 16 → 18.
| 19 | **Kılıç / roket tarzı silah sistemleri** | Yakın dövüş kombo sistemi (kılıç: hafif/ağır saldırı, blok/parry, şarjlı vuruş), fırlatıcılar (roketatar: yavaş mermi, splash + knockback, **rocket jump**), el bombası atar, gravity gun benzeri fizik silahı | tfg-builder |
| 20 | **CS / GMod / Half-Life ilhamı** | CS custom map ruhu: **surf rampaları, bhop/kz parkur, aim_ arenaları, fy_ pool day, awp_ haritaları** → hub'da mini oyun haritaları; GMod ruhu: **Physgun/Toolgun benzeri inşa aleti** (gemi dekoru, prop yerleştirme, halat/kaynak), prop hunt modu (yaratık yerine eşyaya dönüş), TTT benzeri gizli hain modu; Half-Life ruhu: **gravity gun**, headcrab benzeri kafaya atlayan yaratık, HEV suit şarj istasyonları, tren/ray set-piece'leri, xen benzeri "başka boyut" ayı. Hepsi yeniden yorumlanır, isim/model kopyalanmaz | tfg-builder |
| 21 | **Tech item'lar + craft** | Kurulabilir teknoloji (deployable): Auto-Turret MK1-3 (mermi/batarya), Tesla Coil, Barikat (tahta/metal), Spike Strip, Proximity Mine, Floodlight Tower (karanlık yaratıkları iter), Repair Drone, Scout Drone (kamera görüntüsü), Shield Dome, Motion Sensor (HUD'da yaratık pingi), Portable Generator (turret'leri besler, yakıt), Battery Bank, Relay kablosu. Hepsi craft tarifleriyle (circuit/sensor/battery/cable/scrapmetal/fuel), blueprint'ler research ile açılır, tier'ı güç/dayanıklılığı belirler. Yerleştirme: elde kit → hayalet önizleme, geçerli/geçersiz renk, döndürme, host onaylı. Modeller: procedural (modelkit) + uygun CC0 GLB'ler | tfg-builder (Sonnet) |
| 22 | **SIEGE (tower defense)** | Yaratıklar tesisten **dışarı taşar ve gemiye saldırır**; ekip gemi etrafına savunma kurar. **Tetikleyiciler:** (a) extraction alarmı sonrası (tesis çekirdeği alındıysa), (b) Threat ≥ HUNTED iken gece 18:00 sonrası küçük şansla, (c) kota son günü "Breach Night" günlük olayı, (d) Moderation Bureau "Hold the Line" kontratı. **Akış:** 60 sn hazırlık sireni → 3-5 dalga (Spambot sürüsü + yavaş tank + hızlı koşucu + her 3. dalgada mini-boss), girişlerden ve harita kenarlarından gemiye yol bulur. **Gemi Hull Integrity** (0-100): düşerse yaratıklar gemideki hurdadan çalar/kırar (oyun bitmez, kayıp olur). **Ödül:** dalga başına component + kredi, tüm dalgalar = "SIEGE HELD" bonusu + XP + Clout; hiç hasar almadan = nadir blueprint. **Denge:** dalga gücü sektör × oyuncu sayısı × Threat ile ölçeklenir; gün başına en fazla 1 siege; ilk siege en erken kota 2'de; hazırlık süresi hep verilir; savunmasız ekip için gemi kapısı kapatılabilir ve kapı dayanıklılığı var | tfg-builder (Sonnet) |
| 23 | **Anomali sistemi: STATIC (radyasyon) + mutasyonlar + zar + geçici power-up'lar** | **STATIC maruziyeti** (0-100, oyuncu başına): sıcak bölgeler (sunucu çekirdeği, reaktör, containment breach, lav), "hot" itemler (GPU, CORE, Legacy Core), anomali ayları. Aşamalar: *Clean* → *Buzzing* (25, hafif ekran paraziti, +%10 hız) → *Glitching* (50, her 60 sn mutasyon zarı, max HP −15) → *Corrupted* (75, hasar üstü DoT + halüsinasyon ama +%25 hasar) → *DELETED* (100, çöküş). Temizleme: gemide **Decon duşu**, **Antivirus Shot** (craft), Almond Water, gemide bekleme; koruma: **Faraday Suit** (zırh slotu). Tespit: **Signal Counter** (Geiger gibi tıklayan alet). **Mutasyonlar** (geçici, kalkışa kadar): iyi — Overclocked Legs, Night Vision, Thick Skin, Magnet Hands, Echolocation; kötü — Lag, Mute (sesle büyü yok), Glass Bones, Beacon (parlarsın), Jitter. **Zar:** nadir **Loot Box Shrine** (Algorithm'ın kumar sunağı): kredi/hurda/can/STATIC adayıp dev bir d20 atılır → 1 lanet/mimic, 2-7 debuff, 8-14 geçici buff, 15-19 büyük buff/nadir item, 20 mythic. Fırlatılabilir fizikli **Cursed Die** itemi (düştüğü yüz etkiyi belirler). **Geçici power-up'lar** (dünyada holografik ikonlar, elite drop, zar): Double XP Weekend, Premium Trial (hız), Ad-Free (yaratıklar görmez 20 sn), Overclock (hızlı saldırı), Cloud Save (bir ölümü engeller), Viral (hasar sıçrar). Denge: süreli, sınırlı stack, her güç bir risk taşır; sol HUD dock'ta buff/debuff zamanlayıcıları | tfg-builder (Sonnet) |
| 24 | **HQ FORGE: +1…+9 güçlendirme, tier yükseltme, yaratık tier'ları** | Aşağıdaki §12'ye bak | tfg-builder (Sonnet) |

## 12. HQ Forge ve yaratık tier sistemi (detaylı tasarım)

**Yer:** Şirket haritası (0-Algorithm HQ, `src/world/company.js`). Satış tezgâhının yanında dev bir makine:
**"THE MONETIZER"**. Pack-a-Punch gibi: silahı yuvasına koyarsın, makine sallanır, ışıklar yanar,
The Algorithm yorum yapar, silah parlayarak geri çıkar. Yanında **Ascension Altar** (tier yükseltme) ve
**Shard Exchange** (malzeme takası).

### 12.1 Güçlendirme (+1 … +9)
| Seviye | Başarı | Başarısızlıkta | Maliyet (▮ + malzeme) | Bonus (silah: hasar / zırh: DR) | Görsel |
|---|---|---|---|---|---|
| +1 | %100 | — | 20 + 2 Scrap Shard | +%6 | isim "+1" |
| +2 | %100 | — | 35 + 3 Scrap Shard | +%12 | |
| +3 | %95 | seviye aynı | 55 + 2 Circuit Core | +%18 | hafif parıltı (tier rengi) |
| +4 | %85 | seviye aynı | 80 + 3 Circuit Core | +%24 | |
| +5 | %70 | seviye aynı | 120 + 2 Data Crystal | +%31 + **Overclock özelliği** açılır | tier renginde aura + kıvılcım |
| +6 | %55 | −1 seviye | 170 + 3 Data Crystal | +%38 | |
| +7 | %40 | −1 seviye | 240 + 2 Ecto Core | +%46 | animasyonlu "glitch camo" |
| +8 | %30 | −1 seviye | 330 + 2 Algorithm Fragment | +%55 | |
| +9 | %20 | −1 seviye | 450 + 1 Source Code | +%65 + **ikinci Overclock** | tam Pack-a-Punch kamuflajı, iz, ses |
- **Backup Drive** (koruma itemi): başarısızlıkta seviye düşmesini engeller (nadir drop / Dark Web).
- **Overclock özellikleri** (+5 ve +9'da biri seçilir/rastgele, katalizöre göre): *Shock* (zincir), *Burn* (DoT),
  *Freeze* (yavaşlatma), *Void* (zırh deler), *Vamp* (can çalma), *Viral* (öldürülen patlar). Katalizör itemi
  verilirse seçilir, yoksa rastgele.
- Seviye ve özellik item örneğinde tutulur (`it.plus`, `it.oc[]`), kaydedilir, ağ ile senkron, isim "+7 Katana ⚡".
- Zırh/trinket'ler de güçlendirilebilir (DR / bonus × seviye), çantalar hariç.

### 12.2 Tier yükseltme (Ascension)
Common→Uncommon→Rare→Epic→Legendary→Mythic. Maliyet: hedef tier'ın **shard'ı** + kredi + aynı türden
"kurban" item (opsiyonel, şansı artırır). Başarı: Uncommon %90, Rare %75, Epic %55, Legendary %35, Mythic %15;
başarısızlık tier düşürmez, sadece malzeme gider. Workbench'teki eski tier-up en fazla **Rare**'e kadar izinli;
Epic+ sadece HQ Altar'da.

### 12.3 Malzemeler (shard'lar)
| Shard | Tier | Nereden |
|---|---|---|
| Scrap Shard | common | her yaratık, hurda sökme |
| Circuit Core | uncommon | uncommon+ yaratık, elektronik sökme, chest |
| Data Crystal | rare | rare+ yaratık, sunucu çekirdekleri, chest |
| Ecto Core | epic | epic+ yaratık, backrooms, mimic |
| Algorithm Fragment | legendary | legendary yaratık, boss, raid/extraction |
| Source Code | mythic | mythic yaratık, world boss, SIEGE flawless |
Shard Exchange: 5 alt shard → 1 üst shard (legendary'ye kadar; Source Code takasla alınamaz).

### 12.4 Yaratık tier'ları
Her yaratık doğarken bir tier alır (sektör + Threat + ay tehlikesiyle ağırlıklı, `rollTier`):
| Tier | HP / hasar | Görünüm | Drop |
|---|---|---|---|
| Common | ×1 | normal | %40 Scrap Shard |
| Uncommon | ×1.25 | yeşil isim/iz | + %30 Circuit Core |
| Rare | ×1.6 | mavi aura | + %30 Data Crystal, item drop tier ≥ uncommon |
| Epic | ×2.1 | mor aura + 1 affix | + %25 Ecto Core, item ≥ rare |
| Legendary | ×2.8 | turuncu aura + 2 affix, can barı | + %30 Algorithm Fragment, item ≥ epic |
| Mythic | ×4 | kırmızı glitch aura + 3 affix, isim anonsu | + %25 Source Code, item ≥ legendary |
- Erken oyun güvenliği: kota 0-1'de en fazla Uncommon, kota 2-3'te en fazla Rare; Mythic sadece sektör 6+ veya Threat FUCKED.
- Mevcut elite affix sistemi tier'ın üstüne oturur (tier affix sayısını belirler); boss'lar sabit Legendary/Mythic.
- Drop'un item tier'ı: `rollTier(rng, { minTier: tier−1 })`.
- Scan'de ve isim etiketinde tier rengi; öldürme XP'si tier çarpanıyla.

## 13. SHIPYARD — küçük başlayan, büyüyen, özelleştirilen gemi (tasarım)

**Başlangıç:** "Starter Pod" — sadece çekirdek kabin: terminal, kalkış kolu, şarj istasyonu, küçük depo (6 hurda yeri).
Diğer her şey **modül** olarak sonradan eklenir; ilk günlerde gemi dar ve kalabalık hisseder (bilinçli).

**Modüller** (geminin dış hardpoint'lerine takılır; her birinin kapısı çekirdeğe açılır; Mk I → Mk III):
| Modül | Ne verir | Mk III'te |
|---|---|---|
| Cargo Bay | +12 hurda yeri, büyük eşya rampası | otomatik değer tarayıcı |
| Workshop | workbench + Forge-lite (tier ≤ Rare) buraya taşınır | craft süresi −%30 |
| Med Bay | ölü arkadaşı gemide diriltme istasyonu, Decon duşu | dirilme maliyeti −%50 |
| Turret Hardpoint | çatıya kalıcı savunma tareti (SIEGE) | çift namlu |
| Garage | Uplink Van dock + araç tamiri | ikinci araç yeri |
| Bunk Room | ölüm sonrası yeniden doğma noktası, gün sonu "dinlenme" buff'ı | +1 günlük buff |
| Lab | research/analyze hızı, blueprint şansı | strange item analizi 2× |
| Trophy Hall | yaratık kafaları, artifact'ler, CASE fotoğrafları (sadece kozmetik + küçük XP) | ziyaretçi bonusu |
| Music Room / Lounge | aletler, jukebox, jam bonusu ×1.5 | sahne ışıkları |

**Nasıl alınır:** (1) terminal **SHIPYARD** — kredi ile satın al; (2) **Gemi parçaları** dünyada nadir düşer
(Hull Plate, Bulkhead, Engine Coil, Hardpoint Bracket — chest, extraction ödülü, boss, SIEGE); gemideki
**Frame Console**'a yeterli parça koyunca modül ücretsiz kurulur; (3) fraksiyon ödülleri (Archive → Lab, Bureau → Turret).

**Özelleştirme:** gövde boyası (renk + desen), iç duvar/zemin teması, isim plakası (gemi adı), decal'lar, mobilya
yerleştirme modu (deployable ghost preview mantığıyla: hayalet önizleme, döndür, yerleştir, geri al).

**Denge:** her modül gemiyi **ağırlaştırır** → rota yakıt maliyeti +%5/modül ve iniş gürültüsü (Threat başlangıcı +2);
büyük gemi = daha çok SIEGE hedef yüzeyi. Böylece "her şeyi al" değil "ekibe uygun gemiyi kur" kararı çıkar.

**Teknik:** `ship.js` çekirdek + `shipyard.js` modül yerleşimi; tüm modüllerin eşyaları (workbench, kiosk, ayna,
lore panosu, decon, fault istasyonları) **anchor registry** (`game.ship.anchors`) üzerinden yerleşir, sabit koordinat
yok; modül kurulumu host-authoritative, run save'e yazılır, late join senkron.

**Durum (2026-09-29):** wave-3 `shipyard` modülü yapıldı (12 modül, 8 yuva, Frame Console, parça düşüşleri, boya + isim plakası, profil kalıcılığı); ayrıntı + eksikler `docs/wave3/shipyard.md`. Yapılmayanlar: -x burun yuvası, mobilya yerleştirme modu, fraksiyon ödülleri.

## 14. SECTOR CYCLE — 3 gün + BOSS (ana döngü, tasarım)

```
GÜN 1 → GÜN 2 → GÜN 3 (HQ'da sat, kotayı doldur)
   → "SECTOR GATE OPEN" → BOSS GÜNÜ: Sector Core'a iniş (zaman baskısı yok, ama Threat hızlı artar)
       → 2-3 kanat: elite yaratıklar + kilitli kapılar (anahtarlar mini-boss'lardan) + 1 kısa bulmaca
       → BOSS ARENASI (temaya uygun) → boss yenildi → BOSS SANDIĞI + extraction
   → yeni sektör: daha zor aylar, daha iyi loot, yeni kota
```
- **Kota dolmazsa:** eski sistem (fired / run reset) aynen kalır.
- **Boss kaybedilirse (herkes ölür / çekilirsiniz):** hurda kaybı yok (sattınız), bir **grace day** kazanılır (1 günlük
  ekstra toplama, kota yok), sonra tekrar boss. 2. kayıp → sektör yine ilerler ama boss sandığı yok, fraksiyon
  itibarı düşer, "SHAMEFUL EXIT" CASE kaydı. Böylece asla kilitlenme olmaz.
- **Sector Core haritası:** o sektördeki ayların baskın iç mekân temasıyla üretilir (seeded), boss arenası temaya özel:
| Tema | Boss | Mekanik fikri |
|---|---|---|
| factory | **The Foreman** (var) | slam telegraph, konveyör tuzakları |
| serverfarm | **The Load Balancer** | hasarı en düşük canlı oyuncuya "dağıtır"; sunucu raflarını kapatınca zayıflar |
| office | **Middle Manager** | "toplantı" çağırır — herkes bir noktada toplanmazsa ceza; kağıt kalkanları |
| backrooms | **The Lobby Manager** | arena seviye değiştirir (Level 0 → Poolrooms → Level !), ışıkları kapatır |
| hospital | **The Head Surgeon** | oyuncuyu "ameliyat masasına" çeker; arkadaş kurtarmalı |
| sewer | **Comment Section Hydra** | kesilen her kafa 2 "reply" doğurur; kökü yakmak gerekir |
| mansion | **The Host** | NPC gibi davranır, güven kazanınca saldırır; aynalar arası ışınlanır |
| mineshaft | **The Excavator** | doğrudan savaş yok: maden sistemini (vinç/ray/patlayıcı) kullanarak devir |
| (her 5. sektör) | **Legacy Bot** (var) | world boss |
- **Boss sandığı:** garanti Legendary+ item, shard'lar (Algorithm Fragment / Source Code), gemi parçası (§13), boss
  trophy (Trophy Hall), ilk öldürmede kozmetik. Loot kalitesi sektörle artar.
- **Ölçek:** boss HP = taban × (1 + 0.35 × sektör) × oyuncu sayısı çarpanı (1 / 1.6 / 2.1 / 2.5); mekanikler 3. sektörden
  sonra ikinci faz kazanır.
- **UI:** kota ekranı "SECTOR GATE OPEN" sinematiği, terminal `CORE` komutu (boss bilgisi, önerilen seviye), boss can
  barı + faz göstergesi, zafer sonrası "SECTOR CLEARED" + CASE kaydı.
- **Teknik:** host phase akışına `core` fazı (landing → core → takeoff), `moongen` sektör başına `coreMoon`, bosses.js
  kayıt API'siyle yeni boss'lar (her biri kendi dosyası), facility generator'a `layout.plan = 'core'` (kanatlar + arena).

### 14.1 GLITCH GATES (Solo Leveling ilhamı, TFG'ye uyarlanmış)
- Aylarda rastgele **Glitch Gate**'ler (yırtık, titreşen portal) açılır; her birinin **rütbesi** var: **E / D / C / B / A / S**
  (terminal `GATES` ve iniş brifinginde görünür; rütbe = boss gücü + loot tier tabanı; S nadir ve sektör 4+).
- Kapının içi ayrı, rütbesine göre üretilen kısa bir zindan: temalı koridorlar → mini-boss → **özel boss odası**.
- **Gate Break:** bir kapı 2 gün içinde temizlenmezse **kırılır** → yaratıklar dışarı taşar ve gemiye yürür → otomatik
  **SIEGE** (§11 #22). Temizlemeyi ertelemenin bedeli var.
- **Red Gate** (nadir): girince çıkış kapanır, boss ölene kadar dışarı çıkılamaz; ödül ×2.
- **Hidden Gate / "Double Core"** (çok nadir): normal kapının içinde gizli ikinci oda — heykel/kural bulmacası
  ("1. Algoritmaya saygı göster. 2. İzleyicilere ibadet et. 3. Canlı kal."), yanlış hamle ölümcül, ödül mythic + özel unvan.
- **Özel boss'lar:** her rütbede isimli, arenası kendine özel boss havuzu (tema × rütbe); boss girişinde isim kartı
  sinematiği (ad, unvan, rütbe) ve faz müziği.
- **ARCHIVE ("Arise" karşılığı):** yenilen boss'un "kaydını" alırsın (`EXTRACT DATA`, 3 sn kanal) → **Archived Copy**:
  sonraki run'larda çağırılabilen, sınırlı süreli, gölge-glitch görünümlü yoldaş (boss'un zayıflatılmış hali). Aynı anda 1
  kopya, her kopyanın kullanım hakkı sınırlı; Occultist/Technician kanal süresini kısaltır. The Algorithm bunu sever:
  "Harika. İçeriği yeniden kullanıyorsun."
- **Oyuncu rütbesi:** hesap başına Hunter Rank (E→S) — temizlenen kapılarla yükselir, yüksek rütbeli kapılara girme şartı
  değil ama önerilen; hub'da ve isim etiketinde görünür.

## 15. Karakter yeniden tasarımı — "TFG Employee" (tasarım)
Sahip: modeller "çok AI duruyor", hafif yuvarlak, Among Us'ımsı ama **çakma durmasın**.
- **Siluet:** yumuşak, yuvarlak "hap/fasulye" gövde (kapüşonlu iş tulumu gibi), kısa tombul bacaklar — ama Among Us'tan
  farklı olarak **küçük yuvarlak kollar ve eldivenli eller** var (eşya tutma, emote, enstrüman için şart).
- **Kafa = ekran:** vizör yerine gövdeye kaynaşık, köşeleri yumuşatılmış **retro CRT kask**; ekranda mevcut piksel yüz
  (gözler + ağız animasyonu, mood ifadeleri, konuşurken ağız) — TFG'nin imzası. Üstte küçük anten, kenarda kulaklık.
- **Sırt:** "battery pack" (kozmetik back slotu burada: plushie, oksijen tankı, anten…).
- **Oranlar:** chibi — kafa büyük, gövde kısa; kalın siyah dış çizgi (mevcut outline pass) + düz renk + hafif gölge; PSX
  vertex snap ile uyumlu düşük poligon ama yuvarlak (segment sayısı dengeli).
- **Renkler:** suit rengi gövdede, ekran çerçevesi koyu, eldiven/bot açık gri; Venom vb. suit'ler yeni gövdeye uyarlanır.
- **Animasyon:** yürürken gövde sallanması (squash & stretch), zıplamada esneme, ölünce ekran "NO SIGNAL".
- Uyumluluk: `avatar.js` API'si (setSuitColor, setHat, setLook, face canvas, first-person kollar/bacaklar) korunur.

## 16. MIRROR DIMENSION (tasarım)
- **Portal:** dış haritaların ~%25'inde (sektör 1+) büyük karanlık **ayna** (süslü siyah-gümüş çerçeve, dalgalanan
  karanlık yüzey shader'ı, hafif fısıltı). E ile gir; aynı aynadan geri dön.
- **Ayna boyutu:** aynı harita, görüntü yatay ters (ekran-uzayı flip + fare X ve A/D ters → kontrol doğal hisseder),
  karanlık palet, her yerde kalın outline, **ASCII/dither** post efekti, kırmızı-mor sis. Diğer boyuttaki arkadaşlar soluk
  silüet. Yaratıklar ve loot sadece o boyuttakilere görünür/etkiler (host boyut üyeliği tutar).
- **Vampire Survivors döngüsü:** sürekli dalgalar (hayaletler duvardan geçer, alev canavarları ateş izi bırakır, ayna
  kopyaları) → öldürdükçe **XP kristali** + **Reflection Meter**; her seviye atlamada 3 geçici güçten birini seç (hasar,
  hız, dönen bıçaklar, alev aurası, ek mermi, can çalma, mıknatıs…); meter eşiklerinde loot sandığı + power-up; güçler
  boyuttan çıkınca veya gün bitince söner. Daha zor, daha çok loot (tier şansı +).
- **Denge:** boyutta kalma süresi arttıkça dalga gücü artar; ölürsen boyutta topladıkların düşer (ayna önünde); gün sonu
  kalanlar "yansımada kaybolur" (ölüm).

## 17. HOMEWORLD TYCOON — kendi gezegenin + gemin (tasarım, §13 Shipyard ile birlikte)
- **Homeworld:** her ekibin kendine ait küçük bir **ev gezegeni** ("Personal Server"): yörüngeden `HOME` rotasıyla gidilir,
  gemi oraya iner; başta çorak bir kaya + tek bir iniş pisti.
- **İnşa (tycoon):** pist etrafında ızgaraya binalar kurulur (hayalet önizleme, döndür, yerleştir; host onaylı):
  | Bina | Üretir | Yükseltme |
  |---|---|---|
  | Content Farm | pasif ▮ (gün başına) | Lv1-5: daha çok ▮, daha çok elektrik |
  | Server Rack Array | Engagement → Clout ◈ | soğutma ister |
  | Generator / Solar | elektrik (her bina ister) | yakıt / verim |
  | Scrap Refinery | hurdayı otomatik component'e çevirir | hız |
  | Shard Distiller | yavaşça shard üretir | tier |
  | Garden / Kitchen | yemek-içecek (§ food) | çeşit |
  | Barracks | kiralık NPC işçi (bina hızı +) | kapasite |
  | Defense Tower | SIEGE'e karşı ev gezegeni savunması | menzil |
  | Trophy Hall / Museum | boss trophy + artifact sergisi → ziyaretçi = pasif ◈ | vitrin sayısı |
  | Arcade / Lounge | mini oyunlar, jam, arkadaş ziyareti | — |
- **Ekonomi döngüsü:** binalar **oyun günü geçtikçe** üretir (gerçek zamanlı değil — sadece oynadıkça; idle suistimali yok),
  üretim gemi deposuna / ev deposuna gider, tavan (storage cap) var → geri dönüp toplamak gerekir.
- **Tehdit:** bazen ev gezegenine **baskın** (SIEGE varyantı) — savunma kulesi + deployable'lar; kaybedersen bir bina hasar alır
  (yıkılmaz, tamir gerekir).
- **Sosyal:** arkadaşlar ev gezegenini ziyaret edebilir (lobi), müzeye bakar, ziyaret bonusu.
- **Kalıcılık:** ev gezegeni **profil + crew** kaydına yazılır (run sıfırlansa bile kalır — kalıcı ilerleme), gemi modülleri de öyle.
- **Denge:** pasif gelir, aktif oynanışın ~%20-30'unu geçmez; yükseltme maliyetleri üstel; elektrik/soğutma kısıtı "her şeyi
  kur" yerine seçim yaptırır.

## 18. PET SİSTEMİ (Pokémon tarzı, tasarım)
- **Edinme:** yumurta (chest / boss / anomaly "Unknown Egg" / Store) → gemide kuluçka (N oyun günü); küçük yaratıkları
  **Pet Carrier** ile yakalama (canı düşükken, şans); HQ **Pet Shop**'tan sahiplenme. Nadir **Shiny** varyantlar (%2).
- **Türler ve roller:**
  | Pet | Rol | Özel yetenek |
  |---|---|---|
  | Kedi | Scout | yakındaki yaratıkları hisseder (HUD işareti), sessiz |
  | Köpek | Fetch | küçük hurdayı sana/gemiye taşır, havlayarak uyarır |
  | Tilki | Thief | Collector yuvalarından çalar, gizli odaları koklar |
  | Ayı | Tank | saldırır, büyük eşyayı seninle birlikte taşır |
  | Arı (sürü) | Swarm | sokar (DoT), çiçek/yemek bulur, polen = küçük iyileşme |
  | Baykuş | Vision | gece görüşü paylaşır, uzak işaretleme |
  | Papağan | Decoy | sesleri taklit eder, yaratıkları kandırır |
  | Karga | Collector | parlak/nadir item bulur (tier şansı +) |
  | Tamagotchi-bot | Support | kalkan/şarj, internet temalı dijital pet |
- **İlerleme:** XP → seviye (1-30), **evrim** (ör. Yavru Köpek → Köpek → Server Hound Lv20), rastgele **karakter özelliği**
  (Brave, Lazy, Greedy, Loyal…), 3 yetenek slotu, sadakat (bakım: besleme = §food yemekleri, oynama).
- **Komutlar:** takip / bekle / getir / saldır (nişan + tuş) / gemiyi koru; pet düşerse "bayılır", gemide 1 gün dinlenir (kalıcı ölüm yok).
- **Menü:** ayrı **PET** paneli: ahır (6 slot), istatistik, yetenekler, evrim ağacı, isim verme, **skinler** (tasma, şapka,
  renk, Shiny, sezon skinleri), aktif pet seçimi (oyuncu başına 1 aktif).
- **Denge:** pet ≈ ekstra yarım oyuncu değil — yardımcı; loot getirme yavaş ve sınırlı taşıma; saldırı hasarı düşük-orta;
  sadakat düşükse emir dinlemez.
- **Sonra:** hub'da pet arenası (pet düelloları), ev gezegeninde (§17) Pet Barn binası.

## 19. Erken oyun konforu (kural — sahibin isteği: "başta çok zor olmasın, loot ve keşif hissi olsun")
- Kota 0-1 **öğrenme ve keşif** dönemidir: bol loot (+3 / +2 ekstra hurda), zayıf ve yavaş yaratıklar (balance.js),
  tek vuruşta ölüm yok, girişte 90 sn güvenli pencere, radyasyon yarı hızda, dayanıklılık aşınması ×0.5 / ×0.75,
  gemi arızası HQ'da hiç yok ve kota 0'da ~%35.
- Cezalı sistemler kademeli açılır: Spambomb / rulet / Administrator kota 1+, SIEGE kota 2+, ayna portalı sektör 1+,
  ev gezegeni baskını ≥3 bina. Yeni bir sistem eklerken **bu tabloya uy**: önce ödül, sonra risk.
- Hedef: ilk 30-45 dakikada oyuncu en az 3 "vay be" loot anı, 1 yeni sistem keşfi ve 0 haksız ölüm yaşasın.
- **Wave 3 notu (worlds2, 2026-09-29): loot azaldı, zaman baskısı + "zamanla zorlaşma" geldi — bu tabloyu bozmadan.**

| Kural | Değer | Erken oyun (§19) ile ilişki |
|---|---|---|
| İç mekân hurda sayısı | `round(rolled x 0.7 + scrapCountBonus(q))` (`BALANCE.lootCountMul`), büyük eşya x0.7, kasa 80 % -> 56 %, dış hurda 3 -> 2 (yaklaşık **-28 %**) | **+3 / +2 erken bonus kesintiden SONRA eklenir, korunur** (kota 0: 12 -> 11 item, eskiden 15) |
| Tesis çürümesi | 14:00 / 16:30 / 19:00 / 21:30'da toplanmamış loot değeri x0.92 (toplam x0.716), gemiye girmiş / secured loot etkilenmez | Gün 1-3'te de vardır ama yumuşaktır: yaratık baskısı artmaz |
| Kilitlenme | 19:00 ve 22:00'de `facilitysys.force('lockdown')` (içeride ekip varsa) | erken gün istisnası yok, sadece 30 sn |
| Gün geç saat baskısı | spawn bütçesi x(1 + 0.30 x late), spawn hızı x(1 + 0.35 x late), **2. günden itibaren** | gün 1'de yok |
| Günler içinde zorlaşma | `run.day` 4'e kadar **x1.0**; sonra gün başına spawn +3.5 % (üst sınır x1.7), hp +1.5 % (x1.4), hasar +1 % (x1.3), hız +0.4 % (x1.1) | Kota 0-1 öğrenme dönemi (gün 1-3) tamamen dokunulmaz |
| Baskın (Sovyet ayı) | ilk baskın 170 sn, sonra ~250 sn (günle kısalır, min 110 sn), 3 + gün/4 kişilik tim (max 6) | tier 3 ay, erken oyunda rota maliyeti 520 |

Ayrıntı ve ölçümler: `docs/wave3/worlds2.md` §4. Yeni bir zorluk sistemi eklerken burayı da güncelle.

### 14.2 SONSUZ MOD ("THE DEEP FEED") — 3 sektör döngüsünden sonra
- **Açılış:** 3 Sector Core boss'u yenildikten sonra The Algorithm "PATCH 1.0 — ENDLESS CONTENT" ilan eder; run sonsuz
  moda geçer (istenirse klasik döngüye devam seçeneği).
- **Ritim değişir:** sabit 3 gün + kota yerine **Derinlik (Depth)** sistemi: her gün bir derinlik katı; kota yerine sürekli
  eriyen **Engagement Meter** (satışla dolar, her gün erir; sıfırlanırsa kovulursun) → "bir gün daha" gerilimi korunur ama
  takvim baskısı olmaz.
- **Her 3 derinlikte bir PATCH NOTES:** The Algorithm oyuna yeni bir **mutator** ekler (ör. "Gravity -20%", "Creatures
  learn doors", "Loot is shy", "Double shrines") + loot çarpanı artar; mutatorlar birikir ama en eski olanlar bazen
  "rollback" olur (çeşitlilik, sıkıcılık yok).
- **Boss'lar artık takvimli değil:** Derinlikte rastgele **S-rank Glitch Gate** / Red Gate / Apex encounter olarak çıkar;
  her 10 derinlikte "SEASON FINALE" (özel boss + büyük sandık).
- **Ölçek:** güç = derinlik ile yumuşak artan (log eğrisi), loot tier şansı ve değer çarpanı da artar → oyuncu hep
  güçlendiğini hisseder; Threat/erken konfor kuralları geçerli değil ama "relief günleri" (her 5 derinlikte sakin gün) var.
- **Çıkış ve ödül:** istediğin zaman **CASH OUT** → derinliğe göre kalıcı ödül (Clout, unvan, prestij yıldızı, özel kozmetik)
  + liderlik tablosu (haftalık/crew). Ölüp kovulursan yarısı.

## 20. Wave 3 programı (2026-09-29, sahibin uzun listesi) — 7 Sonnet ajanı, tarayıcı testi yok
| Ajan | Kapsam |
|---|---|
| **ux** | UI'nin "AI gibi" görünmesi (tek tasarım dili, emoji/kutu azaltma), rol menüsü taşan yazılar, ESC sonrası mouse kilidi, ana menüde el/viewmodel görünmesi, emote'ta arkadan 3. şahıs kamera, beyzbol sopası vb. viewmodel açıları, gemi kapısı dışarıdan kapalı görünme bug'ı, daha çok suit, yetenek CD 5 dk + dirilme 10 dk, **can yenileme sadece yemekle** |
| **net** | Arkadaşların bir süre sonra düşmesi (Trystero kopma/yeniden bağlanma, heartbeat, host timeout), genel bug taraması + oyun mantığı testleri (node) |
| **cycle2** | 3 gün + boss döngüsünü bağla (Sector Core, 3 yeni boss), Mythic+ keystone ve raid'i **terminalden kolay erişilebilir** yap, dungeon (tesis içi) sistemini geliştir: kanatlar, labirent bölümleri, zone'lar |
| **finish** | Yarım kalanları bitir: pet getirme/saldırı (host sim + sync), maps2 challenge odalarını aç, ev gezegeninde gerçek baskın savaşı |
| **worlds2** | Sovyet binaları/brutalist blok biyomu + baskın olayları, Star Wars esintili gezegen (çöl ikiz güneş, kum/uzay yaratıkları, cantina karakolu) + **ışın kılıcı**, gezegen yaratıkları dışarıdan (yörüngeden/iniş) görünsün, **loot sayısını azalt + zaman baskısı + gün geçtikçe zorlaşma** |
| **shipyard** | §13 Starter Pod → modüller, gemi parçaları, özelleştirme, çok daha büyük gemi seçenekleri |
| **backrooms2** | Yarım kalan noclip cep boyutu + Backrooms yaratıkları + liminal görseller (WIP branch'ler: `worktree-wf_fa5fa8a1-dc0-2`, `-3`) |

---

## 21. OYUNUN KİMLİĞİ (2026-09-29, wave 5'ten itibaren bağlayıcı)

### 21.1 Tek cümle
**TFG, seni izleyip sana göre değişen bir yapay zekânın (The Algorithm) canlı yayınında hayatta kalmaya çalışan bir şirket ekibinin co-op korku/ganimet oyunudur.**

Oyuncuya 10 saniyede anlatılan hâli: *"Arkadaşlarınla gezegenlere inip loot topluyorsun. Ama dünyayı bir yapay zekâ yönetiyor, seni izliyor, alışkanlıklarını öğreniyor ve her gün oyunu sana karşı yeniden yazıyor."*

### 21.2 Üç sütun (her yeni özellik en az birine hizmet etmeli, yoksa eklenmez)
1. **İzlenen olmak** — Algoritma her şeyi görür, yorum yapar, oyunu değiştirir. Oyunun "kötü adamı" bir yaratık değil, oyunun kendisi.
2. **Birlikte panik** — co-op iletişim, birbirini kurtarma, birlikte gülünecek anlar (ölüm, glitch, sahte dolap). Solo da oynanır ama asıl tat ekiple.
3. **Risk → ganimet** — ne kadar derine/riskli gidersen o kadar iyi loot; eve dönüş (extraction) her zaman gerilimli.

### 21.3 Ton
Kurumsal korku + kara mizah. Şirket seni harcanabilir personel olarak görür, Algoritma seni içerik olarak görür. Korku gerçek ama oyun kendini fazla ciddiye almaz (sahte chat, "Employee of the Month", absürt görevler).

### 21.4 Görsel kimlik
PSX/düşük poligon + "şirket ekipmanı" arayüzü (docs/wave4/ui2.md): sert köşeler, uyarı şeritleri, dar kondanse font, terminal yeşili ve tehlike sarısı. Algoritma'nın kendi görsel dili: glitch, magenta/cyan, "LIVE" yayın bandı. Emoji yok, yumuşak cam kartlar yok.

### 21.5 Oyun döngüsü (katmanlar, sırayla açılır)
- **Dakika:** keşfet → loot → sesle/ışıkla hayatta kal → gemiye dön.
- **Gün:** Algoritma'nın sabah kuralları → iniş → çıkış → gün özeti (case file).
- **Hafta (kota):** sat → kotayı tut → gemiyi/ekipmanı geliştir → sektör bossu.
- **Uzun vade:** gemi/ev gezegeni, rol ağacı, kozmetik, Algoritma'nın hikâyesi (Şirket mi, Algoritma mı?).

---

## 22. DÜRÜST DURUM DEĞERLENDİRMESİ — neler kötü, neden, nasıl düzelir

| # | Sorun | Neden kötü | Çözüm |
|---|---|---|---|
| 1 | **Kimlik bulanık** (LC + Satisfactory + CoC + RE + Backrooms + Pokémon + Diablo + satranç) | Oyuncu "bu ne oyunu?" diyemez; hiçbir şey derin değil | §21 kimliği; her sistem Algoritma'ya bağlanır ya da kademeli açılan "yan oyuncak" olur |
| 2 | **Aynı işi yapan sistemler**: 3 kule savunması (siege, homeworld2 dalgaları, ship2 taretleri), 4 labirent üreticisi (maps5, stealth, horror, cycle), 2 yemek sistemi (food + survival) | Bakım zor, oyuncu kafası karışır, denge imkânsız | **Birleştirme dalgası**: tek `defense` çekirdeği, tek `mazegen` kütüphanesi, tek yemek/iyileşme kuralı |
| 3 | **Para birimi enflasyonu**: kredi, Clout, shard, bileşen, parça stash, sezon XP, ticket | Ödüller anlamsızlaşır | 2 ana birim: **Kredi** (ekip, run içi) + **Clout** (kişisel, kalıcı). Shard/bileşen = craft malzemesi (para değil) |
| 4 | **Neredeyse hiçbir şey elle oynanmadı**; 2 kişi gerçek WebRTC testi yok | Co-op oyunda en büyük risk ağ; denge sayıları tahmin | Wave 5'in ilk işi toplu tarayıcı testi (tools/harness/wave4_*.js) + 2 kişi gerçek oturum |
| 5 | **Başlangıç ağır**: tutorial + ipuçları + günlük ödül + sezon + görevler + pet + forge + 50 komut aynı anda | Yeni oyuncu boğulur, ilk 10 dakikada bırakır | **Kademeli açılım** (§23.1): ilk saat sadece iniş-loot-sat-kota; diğerleri Algoritma "yeni oyuncak" diye sunar |
| 6 | **Gemi içi karışık/buglu** (çok modül aynı gemiye eşya koydu) | Oyunun "evi" kötü görünüyor | Opus ajanı: tek otorite `shiplayout.js`, çakışma testi, ekran görüntüsüyle doğrulama (wave 5, öncelikli) |
| 7 | **UI yarım yenilendi** (sadece menü/HUD/envanter/roller) | Paneller arası tutarsızlık, bazı yazılar üst üste | Kalan panelleri ui2 temel sınıflarına geçir; 1280x720 ekran görüntüsü turu |
| 8 | **Performans**: Sector Core ~600 draw call, iniş başına GPU geometri sayısı büyüyor (sızıntı şüphesi) | Zayıf PC'de takılma, uzun oturumda çökme | dispose denetimi (her modülün mapUnloaded temizliği), statik prop birleştirme, LOD |
| 9 | **Algoritma sığ**: şu an ipucu sesi + birkaç event | En özgün fikrimiz boşa gidiyor | §23.2 fikirleri: Algoritma oyuncuyu öğrenir ve oyunu yeniden yazar |
| 10 | **Taklit hissi** (LC çakması) | Özgünlük yok | LC mekaniklerinin üstüne Algoritma katmanı + seyirci/yayın mekaniği + oyuncu oylaması; LC'de olmayan şeyleri öne çıkar |

---

## 23. ÖZGÜN FİKİRLER (öncelik sırasıyla)

### 23.1 Kademeli açılım — "Algoritma'nın oyuncakları"
Sistemler kilitli başlar; Algoritma belli anlarda "sana yeni bir oyuncak verdim" diye açar (kota 1: forge, kota 2: pet + voyage, kota 3: homeworld fabrika, ilk boss sonrası: gate'ler...). Her açılış kısa bir tanıtım + mini görev. Hem boğulma biter hem sürekli yeni şey hissi olur. *Mevcut `guide` modülü + `progression` üstüne kurulur.*

### 23.2 Algoritma seni öğrenir (adaptif direktör)
Oyuncu davranışı kaydedilir (hangi koridor, ne sıklıkla koşuyor, nerede ölüyor, hangi silah, gizli mi gürültülü mü). Algoritma buna göre bir sonraki günü ayarlar ve **bunu söyler**: *"Hep sol koridordan gidiyorsun. Oraya bir şey koydum."* Karşı-oyun: oyuncular bilerek alışkanlık değiştirip Algoritma'yı kandırabilir. *Mevcut director + stealth noise + facility variety üstüne.*

### 23.3 Canlı yayın / seyirci puanı
Ekip her iniş "canlı yayında". Sahte sohbet akar (Türkçe/İngilizce/Rusça, kara mizah). Riskli-eğlenceli hareketler (boss'a çıplak elle girmek, 1 HP ile kaçmak, sahte dolabı çalıp kaçmak) **izleyici** kazandırır → izleyici = bonus loot/Clout, ama çok izleyici = Algoritma daha çok "şov" ister (zorluk artar). *Mevcut LIVE bandı + daily + cosm5 emote'ları.*

### 23.4 Sabah oylaması
Her gün Algoritma 3 kural önerir ("ışıklar kapalı", "yerçekimi yarım", "yaratıklar sessiz ama hızlı", "tüm loot iki kat ama kapı 1 dk'da kapanır"); ekip oylar. Kaybeden kural ertesi güne "borç" olarak kalır. *Mevcut anomaly/mutator altyapısı.*

### 23.5 Ölüm bilgi olur — "hayalet tekrarı"
Ölen oyuncunun son 10 saniyesi ertesi gün aynı yerde yarı saydam tekrar oynar; o bölgede yaratıklar toplanır ama ölünün düşürdüğü loot da oradadır. Ölüm = sonraki tur için harita ipucu.

### 23.6 Glitch'ler oyuncunun silahı
Maplarda Algoritma hataları: duvardan geçme noktası, eşya kopyalama rafı, yaratığı donduran piksel. Kullanmak güçlü ama her kullanım "yama sayacını" artırır; dolunca Algoritma yamalar ve bir ceza eventi yollar. Risk/ödül + Algoritma kimliği.

### 23.7 Taraf seçimi — Şirket mi, Algoritma mı?
Görev tahtası iki taraftan iş verir. Şirket işleri güvenli/az para; Algoritma işleri garip/çok para ama sadakat ister. Taraf puanı hikâyeyi, açılan yaratıkları, kozmetikleri ve **sonu** belirler (3 son: Şirketin sadık elemanı / Algoritma'nın avatarı / ikisini de kandıran kaçak).

### 23.8 Ekip rolleri iletişimi zorlasın
Bazı günler Algoritma rollere kısıt verir: "Navigatör haritayı görür ama silah tutamaz", "Taşıyıcı karanlıkta görür ama konuşamaz (sadece ping)". Co-op iletişimi mekaniğe dönüşür.

### 23.9 Algoritma'nın kendi yaratıkları "içerik trendi"
Oyuncular en çok hangi yaratıktan kaçıyorsa Algoritma onu "trend" yapar: haftalık trend yaratık daha sık, daha güçlü ama daha değerli drop. Topluluk (hub) genelinde paylaşılabilir.

---

## 24. WAVE 5 PROGRAMI (sıra bağlayıcı; yeni büyük özellik yok, önce sağlamlık)

1. **Gemi içi (Opus, başladı)** — docs/wave5/ship_interior.md.
2. **Toplu tarayıcı testi + bug fix** — tools/harness/wave4_*.js hepsini koş, hataları düzelt; smoke_land 900 s timeout.
3. **2 kişi gerçek oturum** — WebRTC üstünden 30 dk; hostmig, social, trade, arcade RPS, survival sandık, ship2 tamir.
4. **Birleştirme** — tek defense çekirdeği, tek mazegen, tek yemek kuralı, 2 para birimi (§22 #2-3).
5. **Kademeli açılım** (§23.1) + başlangıcın sadeleşmesi.
6. **UI turu** — kalan panelleri ui2'ye geçir; checkup'ın listelediği üst üste binmeler.
7. **Performans** — sızıntı + draw call.
8. Ancak bunlardan sonra: §23.2 adaptif Algoritma → §23.3 canlı yayın → §23.4 sabah oylaması.

Model politikası aynı (§6): Sonnet varsayılan, ağ/AI/çekirdek işlerde Opus; playtest kısa ve toplu (tek tarayıcı kuyruğu, 4 çekirdek).

---

## 25. WAVE 5 — AYRINTILI PLAN (kota yenilenince buradan devam; §24'ün yerine geçer)

### 25.0 Kural
- Yeni büyük sistem YOK; önce sağlamlık, birleştirme, his. Her ajan en fazla 2 kısa tarayıcı koşusu; toplu test lead'de.
- Model: Sonnet varsayılan. Opus sadece: ağ, başlangıç akışı (oyuncu deneyimini baştan kurar), birleştirme çekirdekleri.
- Worktree'ler `origin`un GÜNCEL HEAD'inden açılmalı (wave 4'te eski tabandan açıldı → game.js çakışmaları). Ajan başlatmadan önce slot yerleri game.js'e eklenip pushlanır.
- Modül adı Game'de mevcut bir metodun adı OLAMAZ (`sfx` olayı: tüm sesleri kırdı).

### 25.1 Oyunun başlangıcı — gemiyle mi, başka türlü mü?
**Karar önerisi: "İşe alım günü" (Onboarding Shift).** Oyun gemide başlamaz; **Şirket'in ofisinde (ana menü odası Cell 07'nin devamı)** başlar:
1. **Uyanış (30 sn):** Cell 07'de uyanırsın, hoparlörden Şirket'in işe alım anonsu; Algoritma araya girip ilk kez "seni izliyorum" der (kimlik anında kurulur).
2. **Oryantasyon koridoru (2-3 dk):** kısa, lineer bir ofis koridoru — yürü/eğil/koş, el feneri dolabı (ilk el feneri burada ödünç, sonra mağazadan alınır), ilk loot (bir zımba), ilk "tehlike" (ışıklar söner, Algoritma'nın zararsız bir yaratığı koridorun sonunda görünüp kaybolur), ilk kilitli dolap (lockpick tanıtımı, §25.3).
3. **Hangar:** küçük gemin (Mini-Skeld) seni bekler; terminal, kol, kapı burada öğretilir. İlk iniş = kolay moon + tek hedef ("50 hurda getir").
4. **İlk dönüş:** gün özeti + Algoritma'nın ilk "yorum"u ("Sol koridoru sevdin. Not aldım.").
- Tekrar oynayanlar/arkadaş lobisine katılanlar oryantasyonu atlar (profilde bayrak). Co-op'ta host oryantasyondaysa diğerleri hangarda bekler (bekleme yok: hangarda mini oyunlar).
- Neden: gemide çıplak başlamak LC hissi veriyor; ofis → hangar geçişi kimliği (Şirket + Algoritma) ilk 3 dakikada anlatır ve tutorial'ı "görev" gibi hissettirir.
- Uygulama: `onboard` modülü (Opus). Mevcut: menuroom/menueggs (Cell 07), guide tutorial adımları, ship2 hangar (yeni: HQ pier yanında hangar sahnesi ya da gemi içi hangar görünümü).

### 25.2 Satranç 3D
- 2D overlay yerine **masadaki gerçek 3D taşlar**: oyuncu masaya oturur, kamera masanın üstüne yumuşakça iner (üst-açı, hafif perspektif), taşlar fareyle tutulup sürüklenir (raycast), yasal hamle kareleri zeminde ışıklı disk, son hamle vurgusu, şah uyarısı taşın altında kırmızı halka.
- Taş modelleri prosedürel (lathe geometry: piyon/kale/at/fil/vezir/şah), iki takım malzemesi, InstancedMesh (32 taş = 6-12 draw call).
- Seyirciler masayı gerçek 3D'de görür (taşlar senkron). Dama aynı masada 3D pullarla.
- 2D overlay "kolay görünüm" olarak ayarlarda kalır (erişilebilirlik).
- Kurallar değişmez (`chess_rules.js`, perft testli). Ajan: Sonnet, 1 kısa ekran görüntüsü.

### 25.3 Lockpick — daha hızlı ve kademeli
Şu an: yavaş, tek tip (secureloot). Yeni:
- **Kilit seviyeleri:** Basit (1 pim) → Standart (2) → Güvenlik (3) → Kasa (4, + zamanlayıcı) → Algoritma kilidi (değişen pim sırası, glitch).
- **Hız:** basit kilit ~1.5 sn; her pim bir "zamanlama tıkı" (doğru anda tık = pim oturur). Yanlış tık = pim düşer (sadece o pim), çok yanlış = maymuncuk kırılır (dayanıklılık).
- **Kademeli ilerleme:** kırdığın her kilit "Lockpicking" becerisine XP; seviye atladıkça pim penceresi genişler, 1 pimi otomatik oturtma, sessiz açma (stealth gürültüsü yok), sonra "tek tık kilit" perk'ü.
- **Aletler:** maymuncuk (ucuz, kırılır) → titanyum maymuncuk → elektronik kırıcı (kasa kilidini atlar ama gürültülü) → matkap (en hızlı, en gürültülü, Listener'ı çağırır).
- Co-op: iki kişi aynı kasada = biri pimleri tutar, diğeri çevirir (daha hızlı).
- Ajan: Sonnet; secureloot üstüne, stealth noise'a bağlı.

### 25.4 Zorlaştırılacak mekanikler (şu an fazla kolay/cömert)
| Mekanik | Şu an | Yeni |
|---|---|---|
| Erken ekonomi | sim: erken kazanç kota 0'ın ~30 katı | loot değeri eğrisi: ilk 2 kota cömert kalır, kota 3'ten itibaren ×0.8, taşınan ağırlık cezası artar |
| Kota | sabit artış | kota artışı ekip performansına göre (Algoritma "iyi gidiyorsunuz" deyip ×1.15 ekler) |
| Gemiye dönüş | kapı hep açık | gün sonuna 90 sn kala kapı "kilitlenme uyarısı"; geç kalan dışarıda kalır (ölmez, ertesi sabah yaralı döner) |
| Ölüm | 1 tur bekleme | ölüm = taşıdığın loot yerde kalır + ertesi gün "hayalet tekrarı" (§23.5); ekip toplayabilir |
| Yaratık AI | çoğu düz koşar | sese duyarlı olanlar yayılır; kota 3'ten sonra yaratıklar kapı kapatabilir, ışık söndürebilir |
| Yemek/iyileşme | pişmiş yemek bol | yemek bozulur (3 gün), pişirme istasyonu gemide tek, sandık kapasitesi sınırlı |
| Tuzak/taret | ucuz, güçlü | fiyat günlük kullanımla artar, taretler cephane tüketir |
| Forge | +9'a kadar düz risk | +7 üstü başarısızlıkta seviye düşer (ama kırılmaz), koruma kâğıdı nadir drop |
- Tümü `config` düğmeleriyle; "Rahat mod" (casual) seçeneği eski değerleri korur. Zorluk seçimi lobi ayarında.
- Ajan: Sonnet (denge) + tools/sim/economy.mjs güncellemesi ile ölçülür.

### 25.5 Kötü olanlar → düzeltme (wave 5 kapsamı)
1. **Test edilmemiş wave 4** → lead toplu tarayıcı turu (wave4_*.js hepsi, tek kuyruk, 900 s timeout); bulunan hatalar küçük Sonnet düzeltme ajanlarına paylaştırılır.
2. **Çift sistemler** → `defense` çekirdeği (siege + homeworld2 dalga + ship2 taret aynı AI/cephane/güç), `mazegen` kütüphanesi (maps5/stealth/horror/cycle aynı planlayıcılar), yemek tek kural (food = atıştırmalık, survival = asıl iyileşme). Ajan: Opus 1 adet (çekirdek birleştirme).
3. **Para birimleri** → Kredi + Clout; shard/bileşen/stash = malzeme. UI'da tek cüzdan satırı.
4. **Başlangıç yükü** → §25.1 onboarding + kademeli açılım (§23.1): kota 0'da sadece iniş/loot/sat/kota görünür; forge kota 1, pet+voyage kota 2, fabrika kota 3, gate'ler ilk boss sonrası.
5. **UI yarım** → kalan paneller ui2 temel sınıflarına; checkup'ın listesi (mirror sayacı, pusula, LIVE bandı, VHS, "a Enforcer", ▮ glifi).
6. **Performans** → geometri sızıntısı (her `mapUnloaded`'da dispose denetimi), Sector Core/voyage draw call, gemi prop birleştirme.
7. **2 kişi gerçek test** → sahibin yapacağı 30 dk oturum için kontrol listesi (docs/wave5/mp_checklist.md): katıl, düş-geri gel, host çık → devir, takas, RPS, sandık, gemi tamiri, satranç.

### 25.6 Özgün fikirlerden wave 5'e girecekler (küçük dilimler)
- **§23.2 Algoritma seni öğrenir — v1:** sadece 3 davranış (koridor tercihi, koşma oranı, ölüm yeri) → ertesi gün 1 değişiklik + söylediği cümle. Director üstüne. (Sonnet)
- **§23.4 Sabah oylaması — v1:** 3 kural kartı, ekip oyu, anomaly mutator altyapısı. (Sonnet)
- Diğerleri (canlı yayın, hayalet tekrarı, glitch silahı, taraf seçimi) wave 6.

### 25.7 Ajan tablosu (sıra = öncelik)
| # | Ajan | Model | Kapsam | Tarayıcı |
|---|---|---|---|---|
| 1 | lead toplu test | Opus (lead) | wave4_*.js + smoke, hata listesi | toplu, tek kuyruk |
| 2 | fixes-a / fixes-b | Sonnet | toplu testten çıkan hatalar (2 paket) | 1 kısa |
| 3 | onboard | Opus | §25.1 işe alım günü + kademeli açılım | 2 kısa |
| 4 | chess3d | Sonnet | §25.2 | 1 kısa |
| 5 | lockpick2 | Sonnet | §25.3 | 1 kısa |
| 6 | hardmode | Sonnet | §25.4 + sim | yok (sim) |
| 7 | unify | Opus | §25.5 #2-3 birleştirme | 1 kısa |
| 8 | ui3 | Sonnet | §25.5 #5 | 1 toplu ekran turu |
| 9 | perf | Sonnet | §25.5 #6 | 1 kısa (renderer.info) |
| 10 | algo1 | Sonnet | §25.6 iki v1 | 1 kısa |
- Paralel en fazla 5 ajan (4 çekirdek, tek tarayıcı kuyruğu). Sıra: 1 → (2,3,4,5,6) → (7,8,9,10).
- Her ajan bitince lead birleştirir, node testleri + build, main'e push.
