# İki özgün ekip tehdidi — Implementation Plan

> 2026-10-03 devamı: kullanıcı artık uygulamayı istedi. Native davranışlar ve özgün modeller Wave33'te uygulandı; güncel sonuç ve açık kabul sınırları [Wave33](../wave33/README.md) tarafından tutulur. Aşağıdaki başlangıç kapsamı ve checklist tarihsel plan olarak korunur.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessiz İşçi ve Hat Kırıcı ile okunabilir tehlike, isteğe bağlı cargo riski ve gerçek ekip kurtarma anı üretmek; ilk teslimi tek rehberli karşılaşma alanında kanıtlamak.

**Architecture:** İki FSM mevcut `registerCreature`/`CreatureManager` içinde çalışır. Mevcut native indoor spawn isteği, descent/director bütçesi, Rapier collider'ları, host hasarı, cargo ve `cev`/`cs` sunumu kullanılır. Ayrı AI yöneticisi, clock, horde, grab sistemi, arena haritası veya oyuncu ölçeri kurulmaz.

**Tech Stack:** Mevcut ESM JavaScript, Three.js, Rapier, Vite, native Session/Emitter ve Node test harness. Yeni dependency yoktur. Windows'ta repo için doğrulanmış bundled Node ile, Linux'ta mevcut activate.sh Node22 yolu ile çalıştırılır.

**Spec:** [CREATURE_SPEC.md](CREATURE_SPEC.md); uygulayıcı iki belgeyi birlikte okur.

## Global Constraints

- Bu doküman uygulama emri değildir; mevcut kullanıcı isteği plan geliştirmedir. Şimdi yalnızca iki Markdown dosyası yazılmıştır.
- İki özgün tür: `c32_dormant` ve `c32_ram`; franchise model/ses/isim aktarılmaz. Mat faceted PSX işçi dili ve EN/TR/RU korunur.
- İlk prototipte doğal üretim `game.config.creatures32 !== true` iken kapalıdır. Native + donmuş birinci şahıs kabulü geçmeden normal oyunda açılmaz.
- Doğal ilk kat/depth1–2 spawn sayısı **0**; sonraki eligible katlarda aile toplamı en fazla **1**, floor başına tekrar **0**. Başarılı floor receipt en fazla **128**, dolunca yeni spawn veto edilir.
- Tek native saat; host-owned hasar; damage callback/broadcast öncesi once-only receipt; native LOS/range/capsule/floor/door sweep. Teleport, noLos ve injected outcome yoktur.
- Tam warning: dormant wake **1,5 sn**, swipe **0,8 sn**; ram windup **1,4 sn**, dash <=**8 m / 1,25 sn**, native speed <=**6,8 m/sn**. Son ölçeklerden sonra vuruş <=**35**.
- Downed/dead/ship/safe-zone hedef yok; normal weapon/stun ile ekip yardımı, grab/pin/drag/forced-drop yok. Cargo holder/inv/body kimliği korunur.
- Model <=**20 draw / 4 material / 1.400 triangle**, yeni gerçek ışık **0**, per-frame geometry/material allocation **0**; owned audio loop <=**1/view**, dispose once.
- Root birleşik Git sahibi; alt görevler stage/commit/push yapmaz. Kaynaklar browser QA öncesi donar; tek browser sahibi ve tek sim clock vardır.
- Güncel eğlence başlangıcı **1/10**; test ve asset sayısı gözlenmiş eğlence yerine kullanılmaz.

## Dosya ve görev sahipliği

| Sahip | Oluştur / değiştir | Gerçek sorumluluk |
| --- | --- | --- |
| AI/native ajanı | Yeni `src/game/creatures32.js` | `installCreatures32(game)`, iki behavior, native geometry/admission, receipt, migration/JIP iptali. |
| Aynı AI/native ajanı | Yeni `tools/harness/creatures32.test.mjs`, `tools/harness/creatures32_arena.mjs` | Tek focused test dosyası; gerçek facility/physics/Session fixture ve aynı alanın kurulumu. |
| Art/audio ajanı | Yeni `src/models/creatures32.js`, `src/game/creatures32_audio.js` | Native model/audio kayıt sözleşmesi; özgün worker template, okunabilir poz ve ses. |
| Root | `src/game/game.js`: import/useModule; `src/game/host.js`: `hostHurtPlayer` son cap | Modül boot sırası ve sadece iki türün final damage sınırı. |
| Root | `src/net/lobby.js`: `GAME_VERSION`; mevcut Session hello/reject yolu | Yeni creature ID/state/model sözleşmesi uygulandığında eski peer'i açık mismatch ile reddetme. Asset/plan dalgasında mevcut 0.12.4 değişmez. |
| Root | `src/game/threatpool.js`: HEADLINE/NEW_IDS; `src/game/descent21_core.js`: floorSpec newIds; `src/game/descent21_threats.js`: family/residents; `src/game/firstsight.js`: defOk | Mevcut pool/bütçe içinde gated promotion. firstSight bu iki türü staged stare/walk beat'ine sokmaz; gerçek encounter caption mevcut lore kapısından gelir. |
| Tek QA sahibi | Yeni `docs/wave32/CREATURE_PLAYTEST.md` | Donmuş native/browser/human kanıtı, başarısızlık ve cihaz/ağ sınırları. |

`src/entities/creatures.js` behavior/clock/attack/serializeFor/snapshot, `src/world/nav.js` findPath/canStep ve `src/core/save.js` generic saveRun/loadRun **okunur**, bu plan için genel yeniden tasarlanmaz. `cargo20_core.js` veya Buffer Brute değiştirilmez. `hostmig_core.js` genel serializer'ına `c.data` eklenmez. Mevcut `hostMigrated(game, info)` yeterlidir. Dış dosyada zorunlu değişiklik bulunursa gerçek yeniden üretim ve dar diff root'a gider; varsayımla edit kapsamı genişletilmez.

## Task 1 — Tek native alan ve Sessiz İşçi

**Files:** AI/native sahibinin `creatures32.js`, `creatures32.test.mjs`, `creatures32_arena.mjs`. Art/audio bu görevde placeholder olmadığı için ilk kayıt mevcut native worker/model template ile kurulabilir; sonraki görev modeli aynı sözleşmeyle değiştirir.

**Interfaces:**

```js
// Yeni modülün public yüzeyi; davranışlar private kalır.
export const C32_IDS = ['c32_dormant', 'c32_ram'];
export const C32 = Object.freeze({
  wake: 1.5, swipe: .8, chase: 6, restDormant: 4,
  ramWarning: 1.4, ramSpeed: 6.5, ramDistance: 8,
  ramTime: 1.25, restRam: 2.5, damageCap: 35
});
export function installCreatures32(game) { /* returns {ids, dispose} */ }
// Her behavior mevcut imzaya uyar: function(c, dt, M).
// İç sahipler: stepDormant32, stepRam32, eligiblePlayers32,
// enterRest32, moveSwept32, admit32, pickSpot32, hitOnce32.
```

Arena dosyası `makeNativeArena32()` async fixture üretir: `{game, physics, manager, items, fixture, step, dispose}`. `fixture` içinde dormant start, ram start, oyuncu/iki yan kaçış ve panel noktaları gerçek geometriden seçilir. `step(dt=1/60)` yalnızca `physics.step(dt); game.time += dt; manager.hostUpdate(dt)` çağırır. `prepareBrowserArena32(game, type)` aynı seed/geometry doğrulamasını kullanır; yalnızca başlangıç kurar ve temizleme fonksiyonu döndürür, update loop başlatmaz.

- [ ] Mevcut `creatures20.test.mjs` fixture pattern'inden minimal native setup al. `generateLayout(1235,'factory',1.3)` + gerçek `buildFacility`, Rapier query refresh ve native ItemManager kullan. 6 m düz zemin/iki yan cep/normal dönüş nav yolu olmayan adayları ele; aday yoksa açık assertion ile dur. Seed/size ilk fixture hipotezidir, üretimde uygun olmayan odanın zorla değiştirilmesi değildir.
- [ ] RED: aynı odadaki ışığı başka yöne bakan sessiz canlı oyuncu yanında 3 sn sonra sıfır hasar; araya gerçek ince panel varken sustained flash/noise provoke etmez; görünür fener 1 sn sonrası `wake` olur. Aşağıdaki assertion gerçek fixture adımlarında uygulanır:

```js
await arena.advance(1); // native physics + manager, fixture helper
assert.equal(c.state, 'wake');
assert.equal(arena.hits.length, 0);
arena.player.flash = false;
arena.walkPlayerTo(fixture.quietBypass); // native controller ile frame adımları
await arena.advance(1.6);
assert.equal(arena.hits.length, 0, 'uyarıdan geri çekilme gerçek kaçıştır');
```

`advance`, `walkPlayerTo` ve `hits` arena fixture'ının ek alanlarıdır: `advance(seconds)` tek `step` yolunu tekrarlar; `walkPlayerTo` fixture native local controller input'unu ilerletir, transform kopyalamaz; `hits` gerçek `hostHurtPlayer` callback kaydıdır. Test başlangıç yerleşimi açıkça fixture setup'tır.
- [ ] Run `node tools/harness/creatures32.test.mjs`. İlk RED beklenen neden: yeni modül/behavior eksik; sonra eksik uyarı/cancel davranışı. Syntax/import altyapı hatasını oyun davranışı RED kanıtı gibi sayma; ilk minimal import düzeldikten sonra aynı davranış assertion'ının başarısızlığını kaydet.
- [ ] `registerCreature` ile yalnızca Sessiz İşçi'yi native manager'a ekle. Native `hitBy/hitAt`, `M.canSee` + gerçek mesafe, `M.isLookedAt`, `p.flash/noise/voice` ve `M.moveToward` kullan. C20 capsule sweep pattern'ini dar private helper'da uygula; nav graph'ta olmayan panelden geçilemez.
- [ ] Hedef seçimi aynı player'ın sürekli tetik süresidir; yeni oyuncuya kalan süre aktarılmaz. `wake` tamamlanmadan chase/damage yoktur. 6 sn leash, 1 sn LOS kaybı, 10 m home radius, ayrı .8 sn swipe ve tek vuruşu uygula. Native stun sonrası eski hit marker'ını yeniden provoke etmek için kullanma; rest'e dön ve yeni tam uyarı iste.
- [ ] RED/GREEN ek native senaryolar: tetik sırasında feneri çevirmek ve uzaklaşmak, swipe sırasında downed/dead/leave/safe-zone, gerçek kapı kapatma, native `M.damage(...,{stun:1})` ile arkadaş kurtarması; sonra canlı hedef tam uyarı sonunda gerçekten hasar alır. Sadece sonsuz iptal eden davranışın geçmesini engelle.
- [ ] Aynı vuruş callback'inden `manager.hostUpdate` bir kez tekrar çağır; hâlâ bir hasar kaydı olmalı. `hitOnce32` epoch/episode consumed alanını hasardan önce işaretler ve state'i rest'e taşır; `M.attack` son native çağrıdır, direkt HP düzenleme yoktur.
- [ ] GREEN: `node tools/harness/creatures32.test.mjs`; mevcut `npm test -- -j 2 creatures20 counterplay19` ile yalnızca temas/uyarı komşu kontratları kontrol et. Fixture dispose tüm views/items/facility/physics ve mod listener'larını temizler.

## Task 2 — Sabit yönlü Hat Kırıcı

**Files:** Aynı AI/native sahibi, aynı modül ve tek focused test dosyası. **Consumes:** Task1 arena, `eligiblePlayers32`, `moveSwept32`, `hitOnce32`. **Produces:** native `c32_ram` behavior; iki tür boot edilmeden doğrudan test fixture'da çalışır.

- [ ] RED: görünür noise/cargo ile gerçek 1.4 sn warning; <1.4 sn hasar yok. Uyarının başındaki yaw kaydedilir. Native controller ile yana kaçınca charge yaw sabit kalır ve hasar gelmez. Yerdeki veya bagged cargo, LOS'suz noise hedef yaratmaz.
- [ ] Run `node tools/harness/creatures32.test.mjs`; beklenen RED: ram behavior eksik veya hedefi takip ederek yön değiştiren/erken vuran uygulama.
- [ ] `stepRam32` direction Vector3'ünü warning başında bir kez yaz; nav `follow` charge esnasında kullanılmaz. Idle hedefleri native perception; windup lane geçerliliği; charge fixed axis; ilk temas sonrası rest. Gerçek draw yaw ile fizik direction aynı olur.
- [ ] Charge her frame'de capsule sweep ile STATIC|DOOR obstruction tespit eder. Oyuncu teması native oyuncu capsule boyutları/feetY ve aynı frame swept segment üzerinden hesaplanır; göz ışınına veya frame-sonu point uzaklığına indirgenmez. İki temas varsa küçük TOI önce gelir; duvar arkasındaki oyuncu vurulmaz. Floor desteği kaybolursa charge biter. `dt=.25` fixture'ında wall/target üzerinden atlamaz; mesafe ve süre budget aşılmaz.
- [ ] RED/GREEN: nav'a işlenmemiş gerçek ince panel; native kapanan door; stun sırasında windup/charge; hedef leave/downed; iki kişi lane'de ilk kişiye bir vuruş; reentrant callback; 8 m/1.25 sn expiry; 2.5 sn recovery boyunca hasar yok, sonrasında yalnızca yeni full warning.
- [ ] Gerçek held ve bagged item'ın id/holder/inv/body referansları önce/sonra eşit; normal drop ile cargo world olur ama ram ayrı impulse/loot ödülü üretmez. Testte fake cargo listesi yerine native ItemManager kullan.
- [ ] GREEN: aynı focused test. Yeni kütle/taşıma/knockback sistemi veya crawler düzeltmesi bu göreve girmez.

## Task 3 — Native lifecycle, ağ ve kontrollü admission

**Files:** AI/native `creatures32.js`/tek test; root `game.js`, `host.js`, mevcut pool/descent/firstsight sahipleri. Ortak dosyaya iki ajan aynı anda yazmaz. **Consumes:** iki gerçek behavior. **Produces:** install/dispose, default-disabled admission, mevcut run snapshot'ı üzerinden once-per-floor receipt.

- [ ] RED: gerçek Session/Emitter fixture'ında host broadcast self-delivery ile tekrar callback, peer `cev`/`cs` warning görünürlüğü, tekrarlanan state row'unda tek cue. Peer kendi damage/AI update'i üretmez. Fixture mevcut Session transport/snapshot test pattern'ini kullanır; `{broadcast(){}}` stub bu kabul için yeterli değildir.
- [ ] RED: `creatureOptsFromView` + gerçek `hostSpawn` ile wake/charge restore; ardından `game.mods.emit('hostMigrated',game,{self:true,...})`. Native HP/id aynı kalır; ilk2.5 sn hasar0, sonraki saldırıdan önce yeni full warning. Yeni native crew üyesi windup/charge sırasında eklenirse rest; ayrılan eski hedef hasar almaz.
- [ ] Modül init ve migration listener'da sadece bu türleri rest'e al, target/charge direction/hit marker sil. Crew membership kümesini mevcut `M.playersFor`/native session kayıtlarından güncelle. Restore sırasında c.data varmış gibi davranma; genel migration serializer değiştirme.
- [ ] Root modülü `game.js` constructor'da creature manager ve registry hazırken, C20 kurulumu yanındaki native useModule düzenine ekler. State mapping `STATE_SOUNDS`, model registry, IDENT/FIELD_NOTES ve translations mevcut örnekle kaydedilir. `firstsight.defOk` bu iki tür için false; staged stare state'i FSM'ye karışmaz.
- [ ] Root `hostHurtPlayer` içinde mevcut balance/difficulty hesaplarının **sonrasında**, kaynak creature type bu iki id ise `Math.min(dmg,35)` uygular. Başka creature, environment veya suicide hasarı aynı kalır. RED/GREEN: high-level/difficulty/forge kaynakla son callback <=35; health100 başlangıcı tek vuruşta downed olmaz.
- [ ] Admission private helper native indoor spawn method'unu **yalnızca bu id'ler için** wrap eder; eski tür çağrıları `previous.call` ile aynı kalır. Konum seçimi native room/scrap candidates ve seeded RNG ile yapılır; native `hostSpawnCreatureIndoor` Math.random spot seçimini yeni id'lere taşımama. Aynı floor key aynı %25 roll verir, tekrar istekte reroll yoktur. `game.descentThreat21.allow(type)` açıkça çağrılır; `allowSpawn` custom owned bypass'ına güvenilmez. `run.quotaIndex >= 2` koşuldur; `run.quota` credit goal ile karıştırılmaz. Kabul edilen `hostSpawn` yoksa return false ve power charge0. Candidate roll/position için independent wall clock/Math.random kullanılmaz.
- [ ] Aynı modül manager instance `hostSpawn` yolunda bu iki id için additive veto uygular; `opts.data/scripted/noSpawn` doğal admission'ı atlatamaz. Native migration yalnızca mevcut aynı-type view kimliğiyle restore edildiğinde yeni spawn receipt üretmez. Araç fixture'ı başlangıç actor'ını native `CreatureManager.prototype.hostSpawn.call` ile açıkça etiketlenmiş setup olarak kurabilir; bu kapı application API'ye açılmaz ve production admission testleri instance wrapper'dan geçer. Bu yalnızca kurulumdur; physics/AI/hit/input sonucu enjekte edilmez.
- [ ] `inFlightFloors` reservation ve immutable run receipt **önce**, native `hostSpawn` **sonra** gelir: `cev sp` callback dönüşten önce self-deliver eder. Receipt run diff ile spawn callback'inden önce yayımlanır. Başarılı native actor varsa kalır; null/throw ile actor eklenmemişse yalnızca bu attempt'ın receipt'i rollback edilir ve run tekrar yayımlanır. `finally` yalnızca own in-flight reservation'ı kapatır. RED/GREEN: gerçek spawn callback aynı floor admission'ını bir kere yeniden çağırır; actor1/power1/receipt1. Capacity128 native mutation öncesi veto edilir.
- [ ] Yeni industrial 25 sn arrival veto `mapLoaded`/`facilityChanged` native `game.time` timestamp'iyle uygulanır; `facilityWillChange`/dispose temizler. Mevcut liminal-only `descentThreat21.quiet()` endüstriyel katta true varsayılmaz. Migration timestamp belirsizse yeni 25 sn güvenli bekleme olur; receipt tekrar actor doğmasını yine engeller.
- [ ] Run receipt default `[]`, immutable yeni dizi, cap128; `saveRun/loadRun`, broadcastRun diff ve migration restore native round-trip ile kanıtlanır. Aynı floor return ve reload'da yeni spawn0; kabul başarısızsa receipt/power değişmez. Host migration yeni spawn yaratmaz. Token yeni facility/depth için doğru ayrılır.
- [ ] RED/GREEN admission matrisi: config kapalı; depth0/1/2; quota0/1; depth3+quota2 factory; liminal/backrooms/company/out/deadletter/mission/escape; 25sn arrival; existing family/power/newRuleSlots dolu; invalid capsule/floor; tek dönüş kapısı; yanal kaçışı olmayan dar oda; receipt capacity128. Gerçek nav ve collider ile veto; `opts.scripted/data` veya yeni aile ifadesi descent limit bypass açmaz.
- [ ] Root HEADLINE/NEW_IDS family=`creatures32` ekler; quota>=2 ama doğal admission ayrıca depth>=3. `floorSpec` depth>=3 normal factory/office newIds listesinde **mevcut slot sınırını büyütmeden** aile adayına yer verir. `descent21_threats` aile paylaşımına bu id'leri ekler; C20 kendi family sınırı aynı kalır. Config açık olsa da uygun olmayan theme/kat yeni türe dönüşmez.
- [ ] Yeni creature runtime sözleşmesi teslim edilirken root `src/net/lobby.js` `GAME_VERSION` değerini o anki yayından sonraki incompatible sürüme yükseltir (şu an 0.12.4; başka dalga araya girmezse 0.12.5). Bu yalnızca gelecekteki gameplay değişimiyle yapılır, bugünkü asset/plan dalgasıyla yapılmaz. RED/GREEN: gerçek Session hello 0.12.4 ile yeni host'a gelen peer, cev/modelfallback'ten önce explicit Version mismatch reject alır; aynı yeni sürüm join/snapshot akışı geçer.
- [ ] GREEN: `npm test -- -j 2 creatures32 creatures20 firstdepth21 descent21_threats descent21_core hostmig threatpool`. Bu filtreler filename-substring'dir; runner çıktısından seçilen gerçek dosyaları kontrol et. Tek test dosyası içindeki native alt senaryolar yeterlidir; source-string count testi yazma.

## Task 4 — Poz, ses ve kaynak sınırı

**Files:** Art/audio yeni `src/models/creatures32.js`, `src/game/creatures32_audio.js`; AI/native registry wiring; aynı focused test. **Consumes:** `C32` süreleri, native CreatureView. **Produces:** `createCreature32(id)` -> `{root,height,radius,parts,update,setTint,setElite,setHitFlash,dispose}`; `ensureCreature32Audio(game)` -> boolean; `creature32Cue(id,sampleRate)` -> Float32Array.

- [ ] RED: native model traversal draw/material/triangle sınırlarını, iki kez dispose, geçerli finite mono samples ve silence-volume durumu test et. Eksik provider ilk RED'dir; mevcut placeholder bütçe/uyarı ihlali varsa davranış RED ayrıca kaydedilir.
- [ ] Sessiz İşçi idle/wake/windup pozlarını ve Hat Kırıcı fixed-direction shoulder/charge/rest pozlarını oluştur. Native procedural worker template önce gelir; indirilmiş asset yalnızca lisans/processing/model bütçesi doğrulanmışsa bu görünümün temeli olabilir. Gameplay collision asset mesh'e bağımlı değildir.
- [ ] Generic `creature_read` windup pose ile çift dönüş olursa yalnızca iki türü mevcut opt-out listesine eklemeyi root'a öner; modeli iki bağımsız animator ile döndürme. Yeni gerçek ışık ekleme; warning hem sessiz audio hem reducedMotion koşulunda okunur.
- [ ] Üç özgün cue: dormant wake, ram brake, ram impact. Sessiz İşçi'nin düşük loop'u mevcut view-owned loop sözleşmesiyle ölüm/remove/map unload'da kapanır; scene/AudioContext başına sınırsız loop veya perframe buffer yoktur. Orijinal C20 audio buffer cache pattern'ini kullan.
- [ ] Kısa mevcut lore caption: TR “Işığı üstünde tutma. Geri çekilip görüşünü kes.” / “Omzu kilitlenince yana çık. Duvar hücumu durdurur.” EN/RU karşılıklarını aynı native localization yolu ile yaz. Tutorial modal veya yeni metrik ekleme.
- [ ] GREEN focused model/audio/native tests; `npm run build`; ilgili diff whitespace check. Source owner root'a file/function değişimini ve ölçülen draw/triangle değerini verir; sayı hedefini ölçülmüş veri gibi raporlamaz.

## Task 5 — Donmuş birinci şahıs kabulü ve insan denemesi

**Files:** Tek QA sahibi `CREATURE_PLAYTEST.md`; root tüm kod integration/Git. **Consumes:** tüm native GREEN, build ve source freeze SHA/diff. **Produces:** açık PASS/FAIL/BLOCKED sonuç, kayıt/evidence yolu, ağ/cihaz sınırı, doğal spawn promotion kararı.

- [ ] Root uygun focused kontrollerden sonra bir final full suite çalıştırır; mevcut baseline failure varsa aynı SHA/runtime baseline karşılaştırmasıyla ayrı gösterir. QA süresince ağır suite ve source edit yoktur. `git diff --check` ve build sonucu kaydedilir.
- [ ] Mevcut owned dev server'ı kontrol et; tek browser lock/sahibi. HMR kapalı olduğundan her değişiklikten sonra fresh page. Browser kendi RAF clock'u ile çalışır; `game.update`/manager.hostUpdate manual pump ekleme. Setup başlangıç konum/seed'in native fixture olduğunu etikete yaz; sonrasında sırf proof için teleport/noLos/damage enjeksiyonu yoktur.
- [ ] Tek factory alanında temiz turA: normal girişten yürü, Sessiz İşçi'yi ses/pozla fark et, quiet bypass'tan mevcut hurdayı/çıkışı normal input ile dene. İkinci turda fenerle provoke et; wake'i göster, ışığı çevirip geri çekil ve gerçek hasarsız iptali kaydet. Swipe açıkta kabul edilirse tek hasarı; native stun kullanan arkadaşla kurtarmayı; normal dönüş kapısından cargo ile çıkışı kaydet.
- [ ] Aynı alan temiz turB: Hat Kırıcı lane'ine noise/visible cargo ile gir. Host ve peer firstperson görünümünde shoulder/yaw/brake başlangıcını göster; yana normal inputla kaç; duvar/normal kapı çarpması ve2.5sn recovery'yi kaydet. Bir açık temas tam uyarı sonrası bir kez hasar; aynı lane'deki ikinci kişi hasar0. Windup'ta arkadaş native stun ile saldırıyı keser. Native bag/drop sonrası cargo custody ve kaçış rotası korunur.
- [ ] Host leave/migrate ve join-in-progress'i warning/charge sırasında normal session ile dene; eski strike tekrarı/erken hit0; yeni full warning görünür. Yakındaki iki peer aynı warning'i görür. Bu yerel LAN/iki tarayıcı kanıtını temsilî Internet reliability veya latency garantisi diye yazma.
- [ ] Ses kapalı, reducedMotion ve dar viewport tekrarında iki türün uyarı yönü/state'i okunabilir; kaynaklar unload/reload5 turdan sonra loop/light/material sayısını biriktirmez. Devtools resource ölçümü firstperson input kanıtından ayrı etikette tutulur; geniş donanım FPS iddiası yoktur.
- [ ] En az iki kişiyle10–15dk rehbersiz normal co-op turu dene; tek QA arena turu öğretici kanıttır, discovery/fun kanıtı değildir. Kişilere karşılaşma öncesi kuralları ezberletme. Sonra “Neyi görünce kaçtın?”, “Arkadaşın nasıl kurtardı?”, “Hangi hurda/rota kararın değişti?” ve0–10 eğlence sorularını kaydet. 1/10 başlangıçla kıyaslarken örneklem ve oynanan süreyi göster.
- [ ] Promotion için teknik kabul: full warning/dodge/team rescue normal inputla çalışır; mandatory return block0; duplicate damage0; first-floor new spawn0; kaynak lifecycle sınırı; migration erken strike0. Deneyim kabulü: iki kişi kendi sözleriyle iki kuralı anlatabilir, en az bir gerçek rescue ve bir route/cargo kararı gözlenir. Eğlence gelişimi sahip geri bildirimi olmadan “tamamlandı” sayılmaz.
- [ ] Teknik veya deneyim kabulü başarısızsa gated default kapalı kalır. İlk ayar olarak warning ±0.2sn, recovery ±0.5sn veya uygun room seçimi düzenlenir; ardından yalnızca ilgili RED/GREEN ve fresh browser kabulü tekrarlanır. Üçüncü yaratık/horde/metre ekleme. Geçerse root dar prototype rollout kararını kanıtla birlikte verir; kullanıcı yeni onay döngüsü açmaya zorlanmaz. Root gelecekteki gameplay'i yalnızca actual warning/dodge ve güncel native/lifecycle/protocol kontratları geçtiğinde yayımlar; bugünkü yayın sadece doğrulanmış asset'ler ve plandır.

## Planın bugünkü doğrulama sınırı

Bu plan current native kaynakların owner/caller incelemesine dayanır; yeni creature kodu, arena, test veya browser karşılaşması çalıştırılmamıştır. Seed1235/size1.3, balans sayıları ve geometri eşikleri hipotezdir. Mevcut C20/native lifecycle test örnekleri uygulama yolu sağlar; yeni davranışın başarı kanıtı değildir. İndirilen asset'ler kendi lisans/processing/build raporuyla ayrı değerlendirilir. Şu anda sahibin eğlence puanı **1/10** olarak kalır.
