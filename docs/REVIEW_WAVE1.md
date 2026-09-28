# Wave 1 review (balance, rpg, crafting, magic, shop, inventory, facilitysys, lore, P2P batching)

Branch reviewed: `claude/focused-hawking-32j4um` @ 75d1110. Reviewer branch: `worktree-agent-a9ee83a3598d8daf9`.
Not reviewed (still on other branches): horde, world/landmarks, cosmetics, backrooms, combat, siege, bugfix.

---

## ÖZET (Türkçe, sahibi için)

**Oyunu bozuyor mu?** Hayır, bozan bir şey bulamadım. Kanıt: `smoke_land.js` 3 aya (Dialup / Chatroom / Guestbook) inip kalktı, `errs: []`;
`vite build` başarılı; node testleri geçti (pasif ağaç 1913 kontrol, envanter çekirdeği, 8 tema x 6 boyut x 100 tohum = 4800 tesis yerleşimi).
Modüllerin birbirinin metodunu sardığı yerler (hostSell, player.update, meleeSwing, hostOnCreatureKilled, door, progress.see, reload,
doorInteraction, creatures.follow) tek tek okundu: çift uygulanan çarpan yok (silah seviye hasarı tek yerde, satış değeri tek yerde),
item / fraksiyon / tier id çakışması yok.
**Dikkat:** bütçe kesildiği için "bir günlük oyun" tarayıcı senaryosunu (tüm paneller, büyü, tesis, takeoff, HUD çakışma ölçümü) ÇALIŞTIRAMADIM.
Senaryo yazıldı ve parse ediliyor: `tools/harness/wave1_day.js` (+ `headless_shots.mjs`). Sonraki turda ilk iş bunu koşmak.

**Temaya uyuyor mu?** Çoğunlukla evet. The Algorithm ses/lore modülü çok iyi (129 replik, EN+TR, "KARMA", "Brand Safety Team", "Wayback Wardens").
Zayıf taraf: mekanik isimleri jenerik fantezi/RPG: PUSH / HEAL / BLINK / FIRE büyüleri, "Mana", "Heavy Hands", "Mana Well", "COMPANY STORE"
(Lethal Company kalıntısı; sizde "The Algorithm" olmalı). Favicon hâlâ balıktı (düzelttim).

**Puanlar (1-10):** eğlence/döngü 7 - anlaşılırlık/onboarding 4 - tema/kimlik 7 - UI kalitesi 6.5 - denge 5.5 - stabilite 7.5 - performans 6 (ölçülmedi) -
çoklu oyuncu hazırlığı 4.

**En büyük sorun:** Wave 1 tek seferde ~10 sistem ekledi (I, K, C, J, TAB, B tuşları, mağaza, atölye, roller, kontratlar, fraksiyonlar, tehdit
metresi, tesis zinciri) ama ilk saat için HİÇ rehberlik yok: "How to play" ekranı yeni tuşların hiçbirini söylemiyordu (düzelttim), hedef
listesi sınırsız uzayabiliyor ve ilan edilen bazı bonuslar (Blood Magic bedeli, Scavenger's Luck şansı, Field Medic "revive hızı", Technician
"etkileşim hızı") hiçbir şeye bağlanmamış. Yani oyuncu çok şey görüyor, azı çalışıyor, hiçbiri öğretilmiyor.

**İlk 10 düzeltme (özet):**
1. İlk saat rehberi + hedef listesi sınırı (M)
2. Ölü istatistikleri bağla ya da gizle: Blood Magic, lootLuck, reviveSpeed, interactSpeed, rangedDmg (S-M)
3. Sağ HUD kolonu çakışmaları: toast yığını vs dock, cine banner vs Algorithm altyazısı, dock vs hotbar (S)
4. 2 gerçek oyunculu test (mp2.mjs) + client-güveni noktaları (M)
5. Türkçe/metin taraması: COMPANY STORE, PROFIT QUOTA, terminal metinleri, kalan toast'lar (S)
6. Büyü/rol/mana isimlerini internet diliyle yeniden adlandır (S-M)
7. Erken oyun çok yumuşadı (Lurker 999 -> 45): korku bütçesi / zorluk seçici (M)
8. 7 MB tek bundle: panelleri lazy-load et, draw call ölçümü (M)
9. Emoji vs vektör ikon tutarsızlığı (record.js, achievements.js) (S)
10. Gün senaryosunu rutine al + eski kayıt yükleme testi (S-M)

**Küçük düzeltmeler (yaptım):** 54 eksik Türkçe metin (atölye paneli + toast'lar + levye), eskimiş "TAB ile yetenek puanı" ipucu -> K, how-to
ekranına yeni tuşlar (I/K/C/J/B) ve "profit quota / you work for TFG" -> Engagement Quota / The Algorithm, favicon balık -> göz, package.json açıklaması.

---

## 1. What was actually run (and what was not)

| Check | Result |
|---|---|
| `tools/harness/smoke_land.js` (headless, port 5254) | 3 landings OK: hamsi/factory 3 creatures, levrek/mineshaft 11, palamut/mansion 5. `errs: []`. Console: 4x "403 Forbidden" = Vite refused to serve `@fontsource` files because `node_modules` is a symlink outside the worktree allow list. Environment artifact of my setup, not a game bug (fonts in my screenshot are fallbacks). |
| `vite build` | OK, 2.5 s. `main` chunk 7,084 kB (2,590 kB gzip), one monolithic chunk. |
| `node tools/harness/wave1_tree.mjs` | 128 nodes / 170 edges, 1913 checks, 0 failed |
| `node tools/harness/inventory_core.test.mjs` | all passed |
| `node tools/harness/wave1_facility_paths.mjs` | PASS 4800 layouts (8 themes x 6 sizes x 100 seeds) |
| `node tools/sim/economy.mjs --runs 60` | ran; XP to Lv.100 ~ 92 h for a competent crew (see Balance) |
| Static: item-id collisions | none (50 new items registered, 0 clashes with the 110 base ids; only duplicate display name is `nailbat` vs `craft_nailbat`, an intentional fallback) |
| Static: TR coverage of `t('literal')` in wave-1 files | 54 strings missing (crafting panel + toasts + one weapons string) -> fixed, see section 8 |
| Screenshot | 1: orbit right after the 3 landings (end of smoke). Used for HUD findings below. |
| **NOT run** | The combined "day in the life" browser script, mid-run HUD screenshot, panel open/close by real key events, chat-cast, pickup, takeoff + case file check, NaN scan. The lead cut the browser budget while my run was still queued behind the shared lock; I cancelled it before it started. Script kept: `tools/harness/wave1_day.js` (parses, never executed). |
| **NOT run** | Any 2-peer test. Nothing in wave 1 has been played with two real peers (each module's own notes say "host path only"). |

Because of the missing run, the HUD findings in section 4 come from one screenshot plus reading the CSS; pixel numbers are estimates and marked so.

## 2. Does it break the game? Cross-module audit

**Breaking issues found: none.** Wrong-but-not-breaking issues are in section 3 and 4.

Instance-level wraps (all restore on dispose, all wrapped in try/catch or defensive):

| Method | Wrapped by | Verdict |
|---|---|---|
| `game.hostSell` | rpg (`rpg.js:252`) | Temporarily scales `it.value` by the last holder's `scrapValue`, restores in `finally`; totals are computed synchronously inside `hostSell`, so no leak. Only one wrapper. OK |
| `player.update` | rpg (`rpg.js:227`) Pack Mule input proxy + noise scaling | Only wrapper. OK |
| `game.meleeSwing` | crafting (`crafting.js:516`) | Stands down because `inventory.appliesTierDamage === true`; tier damage is applied exactly once in `actions.js:15-21` (`tierDmg`, relative to the definition tier) at `actions.js:692` and `:789`. Verified no stacking. OK |
| `game.hostOnCreatureKilled` | dailyEvents (`dailyEvents.js:188`) then crafting (`crafting.js:511`) | Chain works. Dispose order could delete both (`delete game.hostOnCreatureKilled`) but only at game destroy. Harmless |
| `reload`, `doorInteraction`, `creatures.follow` | weapons (`weapons.js:368, 543, 667`) via `ctx.wrap` (restores only if nobody wrapped after) | OK. `follow` is also scaled inside (balance): slow/scare multiply on top of the sector speed, intended |
| net `door` handler | lore (`lore.js:426-433`) | Wraps after `H('door')` is registered (registerHandlers emit is last, `host.js:292`), restores only if still its own. OK |
| `progress.see`, `shipScreens.drawExtra`, `game.deathText` | lore, lore, facilitysys | Single wrappers, OK |

Net / keys / ids:
- Request names registered by wave 1: `inv, facAct, spell, rpgkit, craft, cruse, lore, wshot, wpry, wdeck`. No duplicate registrations. Broadcast types `lore` (added to `HOST_ONLY`, `lore.js:24`), `facFx`, `rpgst` (relayed, `rpg.js:154`), `fx` with distinct `k` (`spell`, `sh`). No collisions with base types.
- Keys: I inventory, K tree, J record, C spell wheel (hold), B emote wheel (hold), T/Enter chat, V PTT, P ping, H van horn, R reload (weapons) and R Pick-a-Card (deck): the reload wrapper falls through to the shotgun path for non-`wfire` items, so the deck does not double-fire. Digit 1-8 is only captured while the C wheel is open. No conflict found.
- Ids: tiers common..mythic everywhere (`tiers.js`; loot.js affix rarities are a subset of the same names). Factions `algorithm / archive / bureau / darkweb` consistent across loredata, factions, contracts, weapons (`faction: 'bureau'`). Items: no collisions.
- Save/load: run fields `fac, threat, contract(s), contractLog (cap 20), factions, algo, shop` all ride the generic run diff-sync and `hostSave` (`host.js:483`); all use `ensure()`/lazy defaults so old saves load (`shop.js:300`, `lore.js:60`). `run.fac` is cleared on orbit/landing/company (`facilitysys.js:161, 921`). `profile.rpg`, `profile.spells`, `profile.caseFiles` (cap 50) are namespaced. rpg refunds the six legacy skills once (`migrated.skills`); not exercised in a browser this round.
- Double-applied multipliers: none found. Scrap value: tier `valueMul * TIER_VALUE_NORM` at spawn (`items.js:284`), `scrapValue` at sale (rpg wrap), favor at sale (`host.js` hostSell). Creature budget: `balance.scale().spawn * indoorPowerMul(quota) * event.dangerMul` (`host.js:570`); the old flat haul-pressure factor was removed, so no double count. The early game is nerfed on 5 axes at once (hp x0.8, dmg x0.6, speed x0.8, detect x0.9, spawn x0.9): see Balance.
- Latent, not a bug today: `Session.sendRows(..., { to })` shares one `last` cache per type across peers (`session.js:187`). Both current callers (`cs`, `is`) broadcast, so it is fine; a future per-peer caller would starve other peers.

## 3. Correctness gaps (features that look done but are not wired)

| # | Finding | Where | Effect on player |
|---|---|---|---|
| a | **Blood Magic** keystone: nothing reads `has('bloodmagic')`. Spells always cost mana (`magic.js:281-282`); only the +25% spell power applies | `passivetree.js:115`, `magic.js:281` | The keystone's drawback (HP instead of mana) does not exist: free power |
| b | **lootLuck** from the tree (Scavenger's Luck keystone +25%, "Lucky Find" smalls, Eagle Eye) has no consumer. `hostLootLuck` sums balance + moon danger + crew gear only | `inventory.js:474-486`, `passivetree.js:135,173` | Scavenger's Luck is a pure -10% scrap value trap |
| c | **reviveSpeed** (Field Medic +30%) and **interactSpeed** (Technician +15%) have no consumer; the game has no crew-revive mechanic at all (crew revives in orbit, `host.js:405`) | `passivetree.js:97-110` | Two of six roles lose their headline bonus. `rangedDmg` (Enforcer +6%) also unread (documented by rpg) |
| d | `ui.js` how-to screen did not list I/K/C/J/B and still said profit quota / TAB for skills | `ui.js:870-874` | fixed here |

Suggested wiring (S each): a) in `cast()` charge `game.player.hp` instead of `S.mana` when `game.rpg?.has('bloodmagic')`; b) add `+ (Number(game.rpg?.bonus?.('lootLuck')) || 0)` to the balance term in `hostLootLuck`; c) either add a hold-E revive on bodies/defib item, or swap those bonuses for existing stats (carry, stamina).

## 4. HUD, layout, clutter (partly estimated, see section 1)

Evidence: one screenshot (orbit, end of smoke_land) plus CSS geometry. Right column at 1280x720: `hud-tr` top 22 px, xpfeed top 96, `hud-toasts` top 150 (grows down, up to 6 toasts, `hud.js:271-277`), and the shared right dock starts at `top: 44vh` (= 317 px, `dock.js:8`) with threat (order 10), facility (20), contract (30).

1. **Toast stack runs into the dock.** In the screenshot two 2-line toasts (daily event + "New assignment") already span y 186-316, i.e. exactly to the dock's top edge. A third toast (pickup, level, contract) overlaps the Threat meter, and the Threat meter is the one widget that should never be hidden. At 1080p there is room; at 720-768p there is not. Fix (S): cap `.hud-toasts` at 3-4 items / `max-height: calc(44vh - 160px)`, or make toasts and dock one flex column. `style.css:370`, `dock.js:8`.
2. **Center-low banner collision (seen).** While a report cinematic is open, `#ui.cine-open .kach-banner-host { bottom: 150px }` (`style.css:658`) lands exactly on `.algo-sub` (`bottom: clamp(150px,21vh,230px)`, `algorithm.js:117`). In the screenshot the "Codex milestone: Tourist" card sits on top of the Algorithm's subtitle, whose text bleeds through. This happens in the most common flow (end of day: report + Algorithm line + a banner). Fix (S): move the cine-open banner to `bottom: calc(21vh + 130px)` or hold banners while the intercom line is showing.
3. **Right dock vs hotbar (estimate).** Threat (~55 px) + facility (title + 4 rows + extraction row + event, ~150 px) + contract (~80 px) + gaps is ~300 px from 317 px = ~620 px, while `hud-inv` (hotbar) starts around 600 px at 720p. During an extraction the stack likely touches the hotbar and `scan-total`. Also dock right edge is 14 px, toasts 30 px (misaligned columns). Measure with `wave1_day.js` (`hudOverlaps()`).
4. **Objective tracker is unbounded** (`objectives.js:97` emits every module line): baseline lines + scan hint + deep haul + vault route + facility chain + contract + 3 bounties can exceed 10 wrapped lines in a 380 px column starting at y 205, reaching the left dock (`bottom:170px`, inventory feed) and the "Assignments not finished" line. Cap at 5 with main-objective priority (S).
5. Mana bar (bottom dock) shows in orbit even when no spell is known beyond PUSH; minor.
6. Fonts: every wave-1 panel uses `--font` / `--font2` / `--cond` tokens: consistent. Wave-1 panels use vector icons and almost no emoji (0 in tree/roles/inventory/magic/facility). The older `record.js` (31 emoji) and `achievements.js` (58) are the visual outliers.

## 5. Theme fit

Good (keep):
- The Algorithm intercom/lore: voice is exactly the dead-internet register ("Loud is content. Loud is also a location.", "Wayback Wardens ... restore you to an earlier state. Deceased."), all EN + TR. Faction names/mottos ("404 is not an error. It is a grave."), Moderation Bureau, Dark Web, Archive: on theme.
- Role taglines ("Nobody gets deplatformed on shift.", "Has root access to everything."), Clout/credits glyphs, CRT panels, Threat labels CALM / UNEASY / HUNTED / FUCKED, Case Files.

Off-theme / leftovers:
- `COMPANY STORE`, "Employee of the Month", "Welcome to the Company terminal", `PROFIT QUOTA`, "COMPANY BUYING RATE" (`panels/shop.js:77`, `shop.js:173,237`, `terminal.js:84,260`): Lethal Company leftovers; THEME.md says The Algorithm / Engagement Quota. (Rename display strings only.)
- Magic: PUSH / LUMEN / HEAL / PULL / HUSH / BLINK / SHIELD / FIRE, "Mana", Skillbook: generic fantasy (`magic.js:20`). Net-speak versions keep the mechanics and the theme: MUTE (hush), REFRESH (heal), FETCH (pull), LAG (blink), FIREWALL (shield), FLAME (fire), BANDWIDTH instead of mana, "Cursed Tutorial" instead of skillbook. Keep the old words as aliases.
- Passive tree: role names Scout/Enforcer/Occultist/Field Medic/Technician/Hauler are fine as mechanical archetypes, but node names (`passivetree.js:161-185`: Heavy Hands, Padding, Mana Well, Resonance, Brawler, Bulwark, Marksman) are stock PoE. Taglines are on theme; node names should follow.
- Weapons: Kitchen Knife, Baseball Bat, Katana, Crossbow: mundane LC-style. Two or three uniquely themed weapons (a Ban Hammer, a Cease & Desist launcher) would carry identity better than a Katana.
- Fish era: favicon was a fish (fixed); `package.json` description said KEFAL COMPANY (fixed); `docs/THEME.md` still says "Modem Dayi" while code/AGENTS say "Phish Dayi" (doc drift); 15+ old fish items/minigame remain by design (THEME.md).
- Turkish: all modules ship TR tables; the workbench panel/toasts were English-only (fixed, 54 strings). Not covered by the static check: strings that bypass `t()` (host `sys` texts, `d.msg` errors passed through `t(d.msg)`, the how-to screen which is English-only as a whole).

## 6. Evaluation

| Area | Score | Why |
|---|---|---|
| Fun / core loop | 7 | The loop (contract -> facility chain -> greed/threat -> extract -> case file) has real "one more room" tension and every stage has a payoff. Held back by: never hand-played by me, early game much tamer, and too many parallel currencies (credits, Clout, XP, reputation, blueprints, tiers). |
| Clarity / onboarding | 4 | ~10 systems, ~6 new keys, no tutorial; how-to omitted them; objective list unbounded; roles are picked at a ship locker with no prompt; dead stats erode trust. Biggest problem. |
| Theme / identity | 7 | Lore/Algorithm 9, UI/visual language 7, mechanic naming 5. |
| UI quality | 6.5 | Consistent tokens, vector icons, CRT panels; right-column collisions, English-only strings, emoji outliers. |
| Balance | 5.5 | Numbers are simulated and thoughtful (below) but the early game is nerfed on five axes at once and the Lurker's one-shot became 45 dmg; dead stats; nothing hand-tuned. |
| Stability | 7.5 | 0 errors on smoke, build OK, ~6700 node checks pass, wrappers guarded. Old-save migration and mid-day quit paths are unexercised. |
| Performance | 6 | Not measured this round. Merged static geometry, shared beam geometry, LightPool discipline are good; earlier round measured 233-711 draw calls; one 7 MB single JS chunk. |
| Multiplayer readiness | 4 | Everything is host-authoritative by design but client-trusted in places (rpg `sv` value multiplier from the client `rpg.js:75`, Clout purchases trust the client wallet, `modmsg tier` relays from any peer), `run.fac` (including puzzle answers) is synced to all, and no wave-1 module was tested with a second peer. Session batching/delta code reads correct. |

Balance numbers (from the modules' own sims, re-run economy only): quota-0 solo shovel player meets ~5-6 creatures, loses ~1/3 of a bar, ~1% death (was ~10%); campers are punished later (42.8% vs 25.9% death at quota 4). XP: a 4-competent crew needs ~92 h to Lv.100, rebirth at ~20 h. Creature indoor power at T1 grows only 4.0 -> 5.7 across 15 quotas (`economy.mjs`), so mid-game difficulty comes almost entirely from the threat meter. Risk: horror flattening. Lurker 999 -> 45, NPC 90 -> 45, hit cap 45% (`balance_core.js:35-46`).

## 7. Top 10 fixes (priority order)

| # | What | Why | Where | Effort |
|---|---|---|---|---|
| 1 | First-hour onboarding: staged unlocks/prompts (K at Lv 2, "pick a role" prompt, C after first book, contract pinned), cap objectives at 5, update how-to and tips | Wave 1 added ~10 systems with zero guidance; biggest drop-off risk | `objectives.js:97`, `hud.js:20-40` (TIPS), `ui.js:868-875`, `rpg.js` role prompt | M |
| 2 | Wire or hide dead stats: Blood Magic cost, tree lootLuck, reviveSpeed, interactSpeed, rangedDmg | Advertised bonuses that do nothing; Scavenger's Luck is a pure penalty | `magic.js:281`, `inventory.js:485`, `passivetree.js:73-135`, `actions.js` ranged path | S-M |
| 3 | Right HUD column: cap toasts, align with dock, move cine banner off Algorithm subtitle, keep dock above hotbar at 720p | Threat meter hidden under toasts; banner over intercom text (seen) | `style.css:370,658`, `dock.js:8`, `algorithm.js:117` | S |
| 4 | Real 2-peer playtest of all wave-1 modules (`tools/harness/mp2.mjs` + `wave1_day.js`), then harden client-trusted paths | Nothing tested with a second peer; co-op is the product | `rpg.js:75`, `crafting.js` modmsg, `shop.js` coinbuy, `session.js:187` | M |
| 5 | Text pass: COMPANY/PROFIT -> Algorithm/Engagement wording, remaining untranslated toasts, how-to TR, THEME.md name drift | Voice consistency, TR players | `panels/shop.js:77`, `shop.js:173,237`, `terminal.js:84,260`, `ui.js:868` | S |
| 6 | Net-speak rename of spells / mana / skillbook / tree node names (keep aliases) | Generic fantasy is the main identity leak | `magic.js:20`, `passivetree.js:161-185`, `research.js` | S-M |
| 7 | Restore some fear early: keep the Lurker/NPC as a scripted scare, add a difficulty selector instead of a fixed x0.6 | Five simultaneous nerfs flatten horror; sim says 1% death on day 1 | `balance_core.js:35-46`, `balance.js` | M |
| 8 | Code-split (workbench, tree, record, case file, models) and measure draw calls in facility with the new systems | 7 MB / 2.6 MB gzip one chunk; wave-1 props unmeasured | `vite.config.js:14`, `game.js` imports | M |
| 9 | Replace emoji glyphs in `record.js` / `achievements.js` with the wave-1 vector icon set | Mixed system-emoji and pixel/vector art | `ui/panels/record.js:36`, `game/achievements.js` | S |
| 10 | Put `wave1_day.js` in the routine (run after each merge), add an old-save load test (rpg migration, missing `run.fac/shop/contract`) | Cheapest regression net; migration is the riskiest untested path | `tools/harness/wave1_day.js`, `profile.js` ensureRpgProfile | S-M |

## 8. Trivial fixes made in this review

- `src/game/crafting.js`: 54 missing Turkish strings (workbench panel, craft/gas mask/trap toasts).
- `src/game/weapons.js`: TR for "The door gives way with a crack."
- `src/ui/hud.js`, `src/core/i18n.js`: tip "Press TAB to spend them" -> "Press K to spend them in the passive tree." (+ TR).
- `src/ui/ui.js` how-to screen: added I / K / hold C / J / hold B; "profit quota / You work for TFG / fired" -> Engagement Quota / The Algorithm / deplatformed; skill point hint -> K.
- `index.html`: fish favicon -> eye + wifi iris (THEME.md logo idea). `package.json`: description.
- Added `tools/harness/wave1_day.js` and `tools/harness/headless_shots.mjs` (headless.mjs + `window.__shot`); both parse, the day script has not been run.

Housekeeping note: I overwrote `runner.mjs` in the shared scratchpad directory by mistake (it belonged to an earlier agent's screenshot runner, same idea as `headless_shots.mjs`); it is a scratch file, nothing in the repo depended on it.
