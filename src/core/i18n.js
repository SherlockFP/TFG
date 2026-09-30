// i18n: English strings are keys. Languages: en (source) / tr / ru.
//   t('Text')            translate a literal English string (falls back to the English key)
//   tf('Ship: {d} m', v) translate + fill {name} placeholders; {@name} = fill AND translate the value (moon/item names)
//   L({ en, tr, ru })    local-table pattern for small inline choices
//   addTranslations(map, lang = 'tr')  register extra strings at runtime (default keeps the old TR-only call working)
// Bulk dictionaries live in src/i18n/tr*.js and src/i18n/ru*.js (pure data, keyed by the English string).
import { TR_PARTS } from '../i18n/tr.js';
import { RU_PARTS } from '../i18n/ru.js';

export const LANGS = [
  { id: 'en', label: 'English', short: 'EN', speech: 'en-US' },
  { id: 'tr', label: 'Türkçe', short: 'TR', speech: 'tr-TR' },
  { id: 'ru', label: 'Русский', short: 'RU', speech: 'ru-RU' },
];
const LANG_IDS = LANGS.map((x) => x.id);
let lang = 'en';
const langListeners = new Set();
/** Map a browser locale (navigator.language) to a supported language id. */
export function detectLang(loc) {
  const l = String(loc || '').toLowerCase();
  if (l.startsWith('tr')) return 'tr';
  if (l.startsWith('ru')) return 'ru';
  return 'en';
}
export function setLang(l) {
  const next = LANG_IDS.includes(l) ? l : 'en';
  const changed = next !== lang;
  lang = next;
  try { document.documentElement.lang = lang; } catch { /* no DOM (node audit / tests) */ }
  if (lang === 'ru') { try { document.fonts?.load('20px "TFG Cyr VT"', 'Ж'); document.fonts?.load('16px "Press Start 2P"', 'Ж'); } catch { /* no DOM */ } }
  if (changed) for (const fn of langListeners) { try { fn(lang); } catch (e) { console.error(e); } }
}
export function getLang() { return lang; }
/** Speech-recognition locale for the current language (voice spells). */
export function speechLang() { return (LANGS.find((x) => x.id === lang) || LANGS[0]).speech; }
/** Next language in the EN -> TR -> RU cycle. */
export function nextLang(cur = lang) { return LANG_IDS[(LANG_IDS.indexOf(cur) + 1) % LANG_IDS.length]; }
export function onLangChange(fn) { langListeners.add(fn); return () => langListeners.delete(fn); }

const TR = {
  'HOST GAME': 'OYUN KUR',
  'CONTINUE': 'DEVAM ET',
  'Click an option on the screen · arrows + Enter': 'Ekrandaki seçeneğe tıkla · oklar + Enter',
  'JOIN GAME': 'OYUNA KATIL',
  'CHARACTER': 'KARAKTER',
  'SETTINGS': 'AYARLAR',
  'MODS': 'MODLAR',
  'HOW TO PLAY': 'NASIL OYNANIR',
  'CREDITS': 'KREDİ',
  'BACK': 'GERİ',
  'START': 'BAŞLAT',
  'Lobby name': 'Lobi adı',
  'Public (listed in lobby browser)': 'Herkese açık (lobi listesinde görünür)',
  'Password (optional)': 'Şifre (isteğe bağlı)',
  'Max players': 'Maks. oyuncu',
  'Network': 'Ağ',
  'Save slot': 'Kayıt yuvası',
  'New run': 'Yeni oyun',
  'Continue': 'Devam et',
  'Delete': 'Sil',
  'Lobby browser': 'Lobi tarayıcısı',
  'Refresh': 'Yenile',
  'Join by code': 'Kodla katıl',
  'Join': 'Katıl',
  'No lobbies found yet. Host one, or ask a friend for their code.': 'Henüz lobi bulunamadı. Bir tane kur ya da arkadaşından kodu iste.',
  'Players': 'Oyuncular',
  'Status': 'Durum',
  'Name': 'İsim',
  'Suit': 'Tulum',
  'Hat': 'Şapka',
  'Skills': 'Yetenekler',
  'Stats': 'İstatistikler',
  'Loadout': 'Teçhizat',
  'Skill points': 'Yetenek puanı',
  'Video': 'Görüntü',
  'Audio': 'Ses',
  'Voice': 'Sesli sohbet',
  'Controls': 'Kontroller',
  'Language': 'Dil',
  'Resolution (PSX)': 'Çözünürlük (PSX)',
  'Field of view': 'Görüş açısı',
  'Vertex jitter': 'Köşe titremesi',
  'Dithering': 'Dithering',
  'Outlines': 'Kontur çizgileri',
  'Head bob': 'Kafa sallanması',
  'Reduce motion': 'Hareketi azalt',
  'Master volume': 'Ana ses',
  'Effects volume': 'Efekt sesi',
  'Music volume': 'Müzik sesi',
  'Voice volume': 'Sesli sohbet sesi',
  'Microphone': 'Mikrofon',
  'Output device': 'Çıkış cihazı',
  'Test sound': 'Sesi test et',
  'Voice mode': 'Konuşma modu',
  'Open mic': 'Açık mikrofon',
  'Push to talk': 'Bas-konuş',
  'Mic gain': 'Mikrofon kazancı',
  'Mouse sensitivity': 'Fare hassasiyeti',
  'Invert Y': 'Y eksenini ters çevir',
  'Resume': 'Devam',
  'Leave game': 'Oyundan çık',
  'Copy invite code': 'Davet kodunu kopyala',
  'LEVEL UP!': 'SEVİYE ATLADIN!',
  'skill point': 'yetenek puanı',
  'Total': 'Toplam',
  'QUOTA': 'KOTA',
  'DAYS LEFT': 'GÜN KALDI',
  'ROUTE': 'ROTA',
  'BUYING AT': 'ALIM ORANI',
  'Apply & reload': 'Uygula ve yenile',
  'Import mod (.js)': 'Mod içe aktar (.js)',
  'TFG FEATURES': 'TFG ÖZELLİKLERİ',
  'OPTIONAL MODS': 'İSTEĞE BAĞLI MODLAR',
  "Popular Lethal Company mods, rebuilt into TFG. On for everyone by default. CREW features follow the host's switches in multiplayer (host: terminal FEATURES); PERSONAL ones are just for you.": 'Popüler Lethal Company modları TFG\'ye gömülü. Varsayılan olarak herkeste açık. EKİP özelliklerinde çok oyunculu modda hostun ayarı geçerli (host: terminalde FEATURES); KİŞİSEL olanlar sadece senin için.',
  'Cheats, jokes and difficulty tweaks. Off by default. Changes apply after reload. Content mods must be enabled by everyone in the lobby.': 'Hileler, şakalar ve zorluk ayarları. Varsayılan olarak kapalı. Değişiklikler yenileyince uygulanır. İçerik modlarını lobideki herkes açmalı.',
  'PERSONAL': 'KİŞİSEL',
  'CHEAT / JOKE': 'HİLE / ŞAKA',
  'CONTENT': 'İÇERİK',
  'settings': 'ayarlar',
  'QUALITY OF LIFE': 'KOLAYLIK',
  'HORROR': 'KORKU',
  'CREW & SOCIAL': 'EKİP & SOSYAL',
  'VISOR / HUD': 'VİZÖR / HUD',
  'OTHER': 'DİĞER',
  'Changes apply after reload.': 'Değişiklikler yenilemeden sonra uygulanır.',
  'Black Market': 'Karaborsa',
  'Weapons': 'Silahlar',
  'Armor': 'Zırh',
  'Perks': 'Yetenekler',
  'Cosmetics': 'Kozmetik',
  'Buy': 'Satın al',
  'Equip': 'Kuşan',
  'Equipped': 'Kuşanıldı',
  'Owned': 'Sahipsin',
  'Bounty board': 'Ödül panosu',
  'Accept': 'Kabul et',
  'Claim': 'Ödülü al',
  'Close': 'Kapat',
  'DAY REPORT': 'GÜN RAPORU',
  'Collected': 'Toplanan',
  'On board': 'Gemide',
  'Deaths': 'Ölümler',
  'Fines': 'Cezalar',
  'Kills': 'Öldürülen',
  'YOU ARE DEPLATFORMED': 'KOVULDUN',
  'Loading...': 'Yükleniyor...',
  'Click to start': 'Başlamak için tıkla',
  'Connecting...': 'Bağlanıyor...',
  'Press ESC for menu': 'Menü için ESC',
  // item tools / special scrap (entities/items.js ItemTools)
  'Extension Ladder': 'Uzatmalı Merdiven',
  'Signal Booster': 'Sinyal Güçlendirici',
  'Hype Inhaler': 'Hype İnhaler',
  'Belt Bag': 'Bel Çantası',
  'Adblock Spray': 'Adblock Spreyi',
  'Overclocked GPU': 'Hız Aşırtmalı GPU',
  'Cursed Chain Letter': 'Lanetli Zincir Mektup',
  'Ring Light': 'Halka Işık',
  'Dial-up Modem': 'Çevirmeli Modem',
  'Pocket Pet': 'Cep Hayvanı',
  'Face a wall to set up the ladder.': 'Merdiveni kurmak için bir duvara dön.',
  'No solid floor here.': 'Burada sağlam zemin yok.',
  'No ledge to climb here (needs a wall with a top).': 'Burada tırmanılacak çıkıntı yok (üstü açık bir duvar lazım).',
  'Fold the ladder [E]': 'Merdiveni katla [E]',
  'Climb ladder [E]': 'Merdivene tırman [E]',
  'Crouch + [E] folds it': 'Eğil + [E] ile katlanır',
  'Climb down [E]': 'Merdivenden in [E]',
  'Signal Booster armed. It pings scrap and creatures nearby.': 'Sinyal Güçlendirici kuruldu. Yakındaki hurdaları ve yaratıkları gösterir.',
  'Out of reach.': 'Ulaşılamıyor.',
  'It is way too hot to stash.': 'Çantaya koymak için fazla sıcak.',
  'The letter refuses to be put away.': 'Mektup kaldırılmayı reddediyor.',
  'That does not fit in the bag.': 'Bu çantaya sığmaz.',
  'Too heavy for the belt bag.': 'Bel çantası için fazla ağır.',
  'The belt bag is full.': 'Bel çantası dolu.',
  'Aim at small scrap and press LMB to stash it.': 'Küçük bir hurdaya nişan al ve sol tıkla çantaya koy.',
  'The webcam flash is burnt out.': 'Webcam flaşı bitti.',
  'BLINDED': 'KÖR OLDU',
  'BLOCKED': 'ENGELLENDİ',
  'IMMUNE': 'ETKİSİZ',
  '*SCREEEE*': '*CIIIIIRRR*',
  'The inhaler is empty.': 'İnhaler boş.',
  'The spray can is empty.': 'Sprey kutusu boş.',
  'Battery is dead. Charge it on the ship.': 'Pil bitti. Gemide şarj et.',
  'Hype Inhaler is empty. Tossed it.': 'Hype İnhaler bitti. Attın.',
  'forward me to 10 friends...': 'beni 10 arkadaşına ilet...',
  'you have been chosen...': 'seçildin...',
  "don't break the chain...": 'zinciri kırma...',
  'they left you on read...': 'seni görüldüde bıraktılar...',
  'we have seen your search history...': 'arama geçmişini gördük...',
  'engagement is love...': 'etkileşim sevgidir...',
  'one of you is not a real crewmate...': 'içinizden biri gerçek bir mürettebat değil...',
  'like and subscribe... or else...': 'beğen ve abone ol... yoksa...',
  'It burns while you carry it (-HP over time). Worth a fortune.': 'Taşırken yakar (zamanla -HP). Ama servet değerinde.',
  'It whispers. Creatures can hear it too.': 'Fısıldıyor. Yaratıklar da duyabiliyor.',
  'LMB: blinding flash that stuns creatures in front of you.': 'Sol tık: önündeki yaratıkları sersemleten kör edici flaş.',
  'LMB toggles the ring light. Charge it on the ship.': 'Sol tık halka ışığı açıp kapatır. Gemide şarj et.',
  'Careful: it screeches when you run or jump with it in hand.': 'Dikkat: elindeyken koşar ya da zıplarsan çığlık atar.',
  'Face a wall that has a ledge on top and press LMB to set it up. [E] climbs, crouch + [E] folds it.': 'Üstünde çıkıntı olan bir duvara dön ve kurmak için sol tıkla. [E] tırmanır, eğil + [E] katlar.',
  'LMB arms and tosses it. While armed it pings nearby scrap and creatures through walls (and hums a little).': 'Sol tık kurup fırlatır. Kuruluyken duvarların ardındaki hurdaları ve yaratıkları gösterir (biraz da ses yapar).',
  'Hold LMB to inhale: faster, tireless, very wobbly. Do not overdo it.': 'Çekmek için sol tığa basılı tut: daha hızlı, yorulmazsın, ekran sallanır. Abartma.',
  'Aim at small scrap and press LMB to stash it (4 max, 60% weight). LMB at nothing dumps it out.': 'Küçük hurdaya nişan alıp sol tıkla çantaya koy (en fazla 4, ağırlığın %60ı). Boşluğa sol tık çantayı boşaltır.',
  'Hold LMB to spray. Melts spam, pop-ups, reply guys and webs. Everything else just gets annoyed.': 'Sıkmak için sol tığa basılı tut. Spam, pop-up, reply guy ve ağları eritir. Diğerleri sadece sinirlenir.',
  // Uplink Van (entities/cruiser.js)
  'Drive the Uplink Van [E]': "Uplink Van'ı sür [E]",
  'Ride shotgun [E]': 'Ön koltuğa otur [E]',
  'Sit in the back [E]': 'Arkaya otur [E]',
  'Push the van upright [E]': "Van'ı itip düzelt [E]",
  'Riding in the Uplink Van': "Uplink Van'da gidiyorsun",
  '[W/S] drive · [A/D] steer · [SPACE] brake · [H] horn · [F] lights · [E] exit': '[W/S] sür · [A/D] direksiyon · [SPACE] fren · [H] korna · [F] farlar · [E] in',
  '[E] exit · [RMB] scan': '[E] in · [SAĞ TIK] tara',
  'UPLINK VAN: W/S drive · A/D steer · SPACE brake · H horn · F lights · E exit': 'UPLINK VAN: W/S sür · A/D direksiyon · SPACE fren · H korna · F farlar · E in',
  'You hop in. [E] to get out.': 'Bindin. İnmek için [E].',
  'Load': 'Yükle:',
  'into the van bed [E]': '→ van kasasına [E]',
  'Take': 'Al:',
  'Unload': 'İndir:',
  'Inventory full.': 'Envanter dolu.',
  'Order the UPLINK VAN for': 'UPLINK VAN siparişi:',
  '4 seats, cargo bed, headlights, horn. Delivered next to the ship.': '4 koltuk, yük kasası, farlar, korna. Geminin yanına teslim edilir.',
  'Type CONFIRM or DENY.': 'CONFIRM ya da DENY yaz.',
  'Type VAN CONFIRM.': 'VAN CONFIRM yaz.',
  'You already own the Uplink Van.': "Zaten bir Uplink Van'ın var.",
  'Not owned. BUY VAN to order one.': 'Sahip değilsin. Sipariş için BUY VAN.',
  'Parked': 'Park halinde:',
  'from the ship': 'gemiden uzakta',
  'Cargo': 'Yük',
  'Stowed. It comes down with the ship on the next landing.': 'Gemide. Bir sonraki inişte gemiyle iner.',
  'Awaiting delivery on the next landing.': 'Bir sonraki inişte teslim edilecek.',
  // ---- UI / HUD polish round (CRT submenus, dialogs, loading, landing brief, compass, HUD chips)
  'SELECT': 'SEÇ',
  'TAB': 'SEKME',
  'CONFIRM': 'ONAYLA',
  'CANCEL': 'İPTAL',
  'OK': 'TAMAM',
  'Yes': 'Evet',
  'No': 'Hayır',
  'Crew settings': 'Ekip ayarları',
  'Online P2P (Nostr relays)': 'Çevrimiçi P2P (Nostr röleleri)',
  'Online P2P (MQTT brokers)': 'Çevrimiçi P2P (MQTT sunucuları)',
  'Online P2P (BitTorrent trackers)': 'Çevrimiçi P2P (BitTorrent izleyicileri)',
  'Local (same PC, multiple tabs)': 'Yerel (aynı PC, birden çok sekme)',
  'Slot': 'Yuva',
  'Day': 'Gün',
  'Quota': 'Kota',
  'Credits': 'Kredi',
  'Delete this save?': 'Bu kayıt silinsin mi?',
  'This cannot be undone.': 'Bu işlem geri alınamaz.',
  'Lobby': 'Lobi',
  'Host': 'Kurucu',
  'Phase': 'Aşama',
  'Mods': 'Modlar',
  'lobbies': 'lobi',
  'Lobby password': 'Lobi şifresi',
  'This lobby is locked. Enter the password:': 'Bu lobi kilitli. Şifreyi gir:',
  'Missing mods': 'Eksik modlar',
  'The host uses mods you do not have enabled:': 'Kurucu, sende açık olmayan modlar kullanıyor:',
  'Join anyway?': 'Yine de katılınsın mı?',
  'Enter a lobby code': 'Bir lobi kodu gir',
  'password': 'şifre',
  'Full': 'Dolu',
  'Leave the game?': 'Oyundan çıkılsın mı?',
  'Unsaved progress from today is lost.': 'Bugünün kaydedilmemiş ilerlemesi kaybolur.',
  'Import mod': 'Mod içe aktar',
  'Mods run code in your browser. Only import mods you trust.': 'Modlar tarayıcında kod çalıştırır. Yalnızca güvendiğin modları içe aktar.',
  'Import': 'İçe aktar',
  'Imported. Reload to activate.': 'İçe aktarıldı. Etkinleştirmek için yenile.',
  'Search mods...': 'Mod ara...',
  'enabled': 'açık',
  'Mods are ports of popular Lethal Company mods, rebuilt for TFG. All players should enable the same mods.': 'Modlar, TFG için yeniden yazılmış popüler Lethal Company modlarıdır. Tüm oyuncular aynı modları açmalı.',
  'port of': 'uyarlama:',
  'Show FPS': 'FPS göster',
  'Reset keys': 'Tuşları sıfırla',
  'Level': 'Seviye',
  'Weapon': 'Silah',
  'Head': 'Kafa',
  'Body': 'Gövde',
  'Perk': 'Ek yetenek',
  'none': 'yok',
  'PAUSED': 'DURAKLATILDI',
  'Lobby code': 'Lobi kodu',
  'You are the host': 'Kurucu sensin',
  'Connected': 'Bağlı',
  'Copied': 'Kopyalandı',
  'CREW': 'EKİP',
  'TIP': 'İPUCU',
  'DESCENT BRIEFING': 'İNİŞ BRİFİNGİ',
  'INTERIOR': 'İÇ MEKAN',
  'WEATHER': 'HAVA',
  'DANGER': 'TEHLİKE',
  'LOOT': 'GANİMET',
  'DAILY EVENT': 'GÜNLÜK OLAY',
  'DESCENT': 'İNİŞ',
  'TOUCHDOWN': 'YERE İNDİ',
  'SELL ZONE': 'SATIŞ BÖLGESİ',
  'Put scrap on the counter and ring the bell.': 'Hurdayı tezgaha koy ve zili çal.',
  'NONE': 'YOK',
  'LOW': 'DÜŞÜK',
  'MODERATE': 'ORTA',
  'HIGH': 'YÜKSEK',
  'SEVERE': 'CİDDİ',
  'LETHAL': 'ÖLÜMCÜL',
  'Data Center': 'Veri Merkezi',
  'Haunted Homepage': 'Perili Ana Sayfa',
  'Deep Web Mine': 'Derin Web Madeni',
  'Clear': 'Açık',
  'Rainy': 'Yağmurlu',
  'Foggy': 'Sisli',
  'Stormy': 'Fırtınalı',
  'Eclipsed': 'Tutulmuş',
  'value': 'değer',
  'danger': 'tehlike',
  'outdoor loot': 'dış ganimet',
  'blackout': 'karartma',
  'scrap moves every': 'hurda taşınıyor: her',
  'air drops every': 'hava indirmesi: her',
  'golden caches': 'altın önbellek',
  'stamina regen': 'dayanıklılık dolumu',
  'scrap count': 'hurda sayısı',
  'scan range': 'tarama menzili',
  'starts dark': 'karanlık başlar',
  'bot packs': 'bot sürüsü',
  'lands at': 'iniş',
  'max HP': 'maks. can',
  'battery': 'pil',
  'elites': 'elitler',
  'melee': 'yakın dövüş',
  'speed': 'hız',
  'clock': 'saat',
  'scrap': 'hurda',
  'jump': 'zıplama',
  '/kill': '/öldürme',
  'FAVOR': 'GÖZDE',
  'STREAK': 'SERİ',
  'SHIP': 'GEMİ',
  'ENTRANCE': 'GİRİŞ',
  'EXIT': 'ÇIKIŞ',
  'TOTAL': 'TOPLAM',
  'THE ALGORITHM IS PLEASED': 'ALGORİTMA MEMNUN',
  'more...': 'daha...',
  'PERFORMANCE REPORT': 'PERFORMANS RAPORU',
  'Scrap collected': 'Toplanan hurda',
  'Creatures killed': 'Öldürülen yaratık',
  'Casualties': 'Kayıplar',
  'QUOTA MET': 'KOTA DOLDU',
  'OVERTIME BONUS': 'MESAİ PRİMİ',
  'NEXT QUOTA': 'SONRAKİ KOTA',
  'DEADLINE': 'SON TARİH',
  'DAYS': 'GÜN',
  'The Algorithm is pleased. For now.': 'Algoritma memnun. Şimdilik.',
  'Preparing the ship...': 'Gemi hazırlanıyor...',
  'Loading physics...': 'Fizik yükleniyor...',
  'Loading assets...': 'Dosyalar yükleniyor...',
  'Loading mods...': 'Modlar yükleniyor...',
  'Scan (right click) before you grab: the value is shown on every label.': 'Almadan önce tara (sağ tık): her etikette değeri yazar.',
  'The ship leaves at midnight, with or without you.': 'Gemi gece yarısı kalkar; sen olsan da olmasan da.',
  'Carry bodies back to the ship: the fine is smaller.': 'Cesetleri gemiye taşı: ceza daha az olur.',
  'Sprinting and your voice make noise. Trolls hunt by sound.': 'Koşmak ve sesin gürültü yapar. Troller sesle avlanır.',
  'NPCs only move when nobody is looking at them.': "NPC'ler yalnızca kimse onlara bakmıyorken hareket eder.",
  'Look at the Lurker and it backs off. Turn away and it gets closer.': "Lurker'a bakarsan geri çekilir. Arkanı dönersen yaklaşır.",
  'Not every EXIT is real. Dark patterns lurk in the facility.': 'Her ÇIKIŞ gerçek değil. Tesiste karanlık tuzaklar var.',
  'Sell on the last day for the best buying rate at 0-Algorithm HQ.': "En iyi alım oranı için 0-Algorithm HQ'da son gün sat.",
  'Clickbait Mine: click. Do not step off. Ask a friend for help.': 'Tık Tuzağı Mayını: tık. Üstünden inme. Bir arkadaştan yardım iste.',
  'Deep rooms hold the best loot. The deeper you go, the more it pays.': 'En iyi ganimet derin odalarda. Ne kadar derine inersen o kadar kazanırsın.',
  'A walkie-talkie lets you talk across the whole map.': 'Telsizle haritanın her yerine konuşabilirsin.',
  'Level up to earn skill points. Press K to spend them in the passive tree.': "Seviye atlayınca yetenek puanı kazanırsın. Pasif ağaçta harcamak için K'ye bas.",
  'Daily events change the rules: check the terminal before you land.': 'Günlük olaylar kuralları değiştirir: inmeden önce terminale bak.',
  'Fragile scrap loses value when it hits the floor. Carry it gently.': 'Kırılgan hurda yere düşünce değer kaybeder. Dikkatli taşı.',
  'Firewall Turrets can be disabled from the terminal with their code.': 'Güvenlik Duvarı Taretleri terminalden kodlarıyla kapatılabilir.',
  'Soulbound gear from Phish Dayı at HQ comes back with you on every landing.': "Phish Dayı'nın HQ'daki ruha bağlı teçhizatı her inişte seninle gelir.",
  'AI Slop is calmed by music. A boombox is a lifesaver.': 'AI Slop müzikle sakinleşir. Müzik kutusu hayat kurtarır.',
  'Ping (P / middle mouse) to mark loot and danger for your crew.': 'Ganimeti ve tehlikeyi ekibe göstermek için ping at (P / orta tuş).',
  'Hold B for the emote wheel. Z / X are quick emotes.': "İfade çarkı için B'yi basılı tut. Z / X hızlı ifadeler.",
  'Push-to-talk is V. Creatures can hear you, too.': 'Bas-konuş tuşu V. Yaratıklar da seni duyabilir.',
  'Gamepad connected': 'Oyun kolu bağlandı',
  'Resume game': 'Oyuna dön',
  // --- UI pass 2 (character preview, settings tabs, key rebinding, objectives tracker, emotes)
  'Previous emote': 'Önceki ifade',
  'Next emote': 'Sonraki ifade',
  'Drag to rotate': 'Döndürmek için sürükle',
  'Idle': 'Bekleme',
  'Walk': 'Yürüyüş',
  'SERVICE RECORD [J]': 'HİZMET KAYDI [J]',
  'Codex · Mastery · Rebirth · Weekly · Crew': 'Kodeks · Ustalık · Yeniden Doğuş · Haftalık · Ekip',
  'Gameplay': 'Oynanış',
  'default': 'varsayılan',
  'Off': 'Kapalı',
  'Normal': 'Normal',
  'Strong': 'Güçlü',
  'Vertex jitter applies after reload.': 'Köşe titremesi yeniden yüklemeden sonra uygulanır.',
  'Display': 'Görüntü',
  'Retro filter': 'Retro filtre',
  'reload': 'yeniden yükle',
  'Dithering': 'Dithering (tarama deseni)',
  'Performance': 'Performans',
  'Volume': 'Ses düzeyi',
  'Menu sounds': 'Menü sesleri',
  'Output': 'Çıkış',
  'System default': 'Sistem varsayılanı',
  'Output device changed.': 'Çıkış aygıtı değişti.',
  'Could not switch output device.': 'Çıkış aygıtı değiştirilemedi.',
  'Output device selection is not supported by this browser (use Chrome/Edge, or change the default device in Windows).': 'Bu tarayıcı çıkış aygıtı seçimini desteklemiyor (Chrome/Edge kullan ya da varsayılan aygıtı Windows ayarlarından değiştir).',
  'No sound? 1) Press Test sound and watch the bar. If the bar moves but you hear nothing, the sound is going to another device: pick your headphones above or in Windows sound settings. 2) Bluetooth headsets switch to "hands-free" when a mic is in use: choose "Headset (Hands-Free)" as output, or turn voice chat to listen-only.': 'Ses yok mu? 1) Ses testine bas ve çubuğu izle. Çubuk oynuyor ama bir şey duymuyorsan ses başka bir aygıta gidiyor: kulaklığını yukarıdan ya da Windows ses ayarlarından seç. 2) Bluetooth kulaklıklar mikrofon kullanılırken "eller serbest" moduna geçer: çıkış olarak "Headset (Hands-Free)" seç ya da sesli sohbeti yalnızca dinlemeye al.',
  'Default': 'Varsayılan',
  'Microphone changes apply to the next session.': 'Mikrofon değişiklikleri bir sonraki oturumda geçerli olur.',
  'Turn microphone off': 'Mikrofonu kapat',
  'Turn microphone on': 'Mikrofonu aç',
  'Microphone off (listening only).': 'Mikrofon kapalı (yalnızca dinleme).',
  'mic active': 'mikrofon açık',
  'mic error': 'mikrofon hatası',
  'mic off': 'mikrofon kapalı',
  'you will be asked in game': 'oyunda sorulacak',
  'mic on': 'mikrofon açık',
  'listen only': 'yalnızca dinleme',
  'Device': 'Aygıt',
  'Proximity voice chat: nearby crewmates hear you in 3D. Walls muffle. Hold a walkie-talkie (turned on) to talk across the map. Creatures like the Blind Hound can HEAR you talk.': 'Yakınlık sesli sohbeti: yakındaki ekip arkadaşların seni 3B duyar. Duvarlar sesi boğar. Haritanın her yerine konuşmak için açık bir telsiz tut. Kör Tazı gibi yaratıklar konuştuğunu DUYABİLİR.',
  'Mouse': 'Fare',
  'Key bindings': 'Tuş atamaları',
  'Also used by': 'Şunda da kullanılıyor',
  'Key bindings reset.': 'Tuş atamaları sıfırlandı.',
  'Click a key, then press the new key (Esc cancels). A key that is already used swaps with the other action.': 'Bir tuşa tıkla, sonra yeni tuşa bas (Esc iptal eder). Başka bir eylemde kullanılan tuş o eylemle yer değiştirir.',
  'Also: 1-4 / wheel = slots · LMB use / grab · RMB scan · MMB ping · R reload · Esc menu · Gamepad: D-pad / A / B / LB-RB in menus': 'Ayrıca: 1-4 / tekerlek = yuvalar · Sol tık kullan / tut · Sağ tık tara · Orta tık ping · R şarjör · Esc menü · Oyun kolu: menülerde D-pad / A / B / LB-RB',
  'General': 'Genel',
  'Comfort': 'Konfor',
  'less camera shake, bob and screen warp; calmer menus': 'daha az kamera sarsıntısı, sallanma ve ekran bükülmesi; sakin menüler',
  'HUD': 'HUD',
  'Objective tracker': 'Görev listesi',
  'Crosshair': 'Nişangâh',
  'Loading screen tips': 'Yükleme ekranı ipuçları',
  'press a key...': 'bir tuşa bas...',
  'Move forward': 'İleri',
  'Move back': 'Geri',
  'Strafe left': 'Sola kay',
  'Strafe right': 'Sağa kay',
  'Jump': 'Zıpla',
  'Crouch': 'Çömel',
  'Sprint': 'Koş',
  'Interact / pick up': 'Kullan / al',
  'Drop item': 'Eşyayı bırak',
  'Flashlight': 'El feneri',
  'Chat': 'Sohbet',
  'Quick emote 1': 'Hızlı ifade 1',
  'Quick emote 2': 'Hızlı ifade 2',
  'Character sheet': 'Karakter sayfası',
  'Throw item': 'Eşyayı fırlat',
  'Ping': 'Ping',
  'Dance': 'Dans',
  'Wave': 'El salla',
  'Point': 'İşaret et',
  'Laugh': 'Gül',
  'Rage': 'Öfke',
  'Scared': 'Korkmuş',
  'Cheer': 'Sevinç',
  'Spin': 'Dön',
  'Headbang': 'Kafa salla',
  'Bow': 'Reverans',
  'Backflip': 'Ters takla',
  'Play Dead': 'Ölü taklidi',
  'Bunny Hop': 'Tavşan zıplaması',
  'Shrug': 'Omuz silk',
  'Sit': 'Otur',
  'Party': 'Parti',
  'Salute': 'Selam dur',
  'Flex': 'Kas göster',
  'Facepalm': 'Facepalm',
  'Moonwalk': 'Moonwalk',
  'Rally the Crew': 'Ekibi topla',
  'Ascend': 'Yüksel',
  'You are dead. Spectate and help your crew (ping with P).': 'Öldün. İzle ve ekibine yardım et (P ile ping).',
  'DEADLINE! Route to 0-Algorithm HQ: terminal → ROUTE HQ': "SON GÜN! Terminale ROUTE HQ yaz, 0-Algorithm HQ'ya git",
  'a moon': 'bir ay',
  'Land on {moon}: pull the LEVER': "İniş: {moon}. KOLU çek",
  'Pull the LEVER to land at the HQ and sell': "KOLU çek, HQ'ya in ve hurdayı sat",
  'Terminal: MOONS / ROUTE / STORE / BUY': 'Terminal: MOONS / ROUTE / STORE / BUY',
  'WEEKLY {key}: score ▮{score} · quotas {quotas}': 'HAFTALIK {key}: skor ▮{score} · kota {quotas}',
  'Sell your ▮{v} of scrap at the HQ': "▮{v} değerindeki hurdanı HQ'da sat",
  'Nearby lead: {name} ({d} m) - check it for supplies': 'Yakında ipucu var: {name} ({d} m). Malzeme çıkabilir',
  'THE SHIP LEAVES AT MIDNIGHT - RUN BACK NOW': 'GEMİ GECE YARISI KALKIYOR - HEMEN GERİ KOŞ',
  'It is getting late. Head back to the ship soon.': 'Geç oluyor. Gemiye dönme vakti yaklaştı.',
  'Bring scrap to the ship: ▮{a} / ▮{b} today': 'Gemiye hurda getir: bugün ▮{a} / ▮{b}',
  'Quota covered by the scrap aboard. More scrap is overtime bonus': 'Kota gemideki hurdayla tamam, fazlası mesai primi',
  'Carrying {n} items - get them to the ship': '{n} eşya taşıyorsun - gemiye götür',
  'Carrying {n} item - get it to the ship': '{n} eşya taşıyorsun - gemiye götür',
  'Find the facility entrance ({d} m)': 'Tesis girişini bul ({d} m)',
  'Ship: {d} m': 'Gemi: {d} m',
  'Scan (right click) to find scrap and creatures': 'Hurda ve yaratık bulmak için tara (sağ tık)',
  'Deep haul: high-value room nearby ({d} m)': 'Yakında değerli bir oda var ({d} m)',
  'Vault route: secured loot {d} m away': 'Kasa yolu: {d} m ileride korumalı ganimet var',
  "Recover {name}'s body (smaller fine)": '{name} cesedini geri getir (daha az ceza)',
  'a crewmate': 'bir ekip arkadaşı',
  'Taking off...': 'Kalkıyoruz...',
  'Put scrap on the COUNTER, ring the BELL (▮{v} on board)': 'Hurdayı TEZGÂHA koy, ZİLİ çal (gemide ▮{v})',
  'Quota: ▮{a} / ▮{b} · buying at {r}%': 'Kota: ▮{a} / ▮{b} · alım oranı %{r}',
  'Claim what your ◈{c} followers unlocked at Phish Dayı': "Phish Dayı'da ◈{c} takipçinin açtığı eşyalar seni bekliyor",
  'You have been deplatformed.': 'Platformdan atıldın.',
  '(claim at HQ)': "(HQ'da al)",
};

// Other modules can register extra strings at runtime (same format as TR above). Default language is TR so the
// original addTranslations({...}) calls keep working; pass 'ru' for Russian.
const RU = {};
const TABLES = { tr: TR, ru: RU };
export function addTranslations(map, l = 'tr') {
  const tbl = TABLES[l];
  if (tbl && map && typeof map === 'object') for (const [k, v] of Object.entries(map)) if (typeof v === 'string') tbl[k] = v;
}
for (const part of TR_PARTS) addTranslations(part, 'tr');
for (const part of RU_PARTS) addTranslations(part, 'ru');

const own = Object.prototype.hasOwnProperty;
/** Translate a literal English string. Missing entries fall back to the English text. */
export function t(s) {
  if (lang === 'en') return s;
  const tbl = TABLES[lang];
  return tbl && typeof s === 'string' && own.call(tbl, s) ? tbl[s] : s;
}
/** Translate for an explicit language (used to build per-recipient text on the host). */
export function tIn(l, s) {
  if (l === 'en') return s;
  const tbl = TABLES[l];
  return tbl && typeof s === 'string' && own.call(tbl, s) ? tbl[s] : s;
}
/** Does a translation for `s` exist in language `l`? (audit / debug) */
export function hasTranslation(l, s) { return l === 'en' || !!(TABLES[l] && own.call(TABLES[l], s)); }

/** Local-table pattern: L({ en: 'Hello', tr: 'Merhaba', ru: 'Привет' }); missing languages fall back to en. */
export function L(map) {
  if (!map) return '';
  const v = map[lang];
  return v !== undefined && v !== null ? v : (map.en !== undefined ? map.en : '');
}
/** Pick from an [en, tr, ru] array (missing slots fall back to the English one, or via t() for ru when only [en, tr]). */
export function LA(arr) {
  if (!Array.isArray(arr)) return arr;
  if (lang === 'en') return arr[0];
  if (lang === 'tr') return arr[1] !== undefined ? arr[1] : arr[0];
  return arr[2] !== undefined ? arr[2] : t(arr[0]);
}

const fillVars = (s, vars, l = lang) => s.replace(/\{(@?)(\w+)\}/g, (m, at, k) => {
  const v = vars[k];
  if (v === undefined || v === null) return m;
  return at ? tIn(l, String(v)) : String(v);
});
/** Translate a template key and fill {name} placeholders: tf('Ship: {d} m', { d: 12 }). {@name} also translates the value. */
export function tf(s, vars = {}) { return fillVars(t(s), vars, lang); }
/** Same as tf but for an explicit language. */
export function tfIn(l, s, vars = {}) { return fillVars(tIn(l, s), vars, l); }

/**
 * Host -> clients message payload that every peer localises on its own: net.broadcast('sys', sysMsg('{n} joined', {n}, 'info')).
 * `text` is the English rendering (old clients / logs); `k` + `v` are re-translated by the receiver via sysText().
 */
export function sysMsg(key, vars = {}, kind = 'info') {
  return { text: tfIn('en', key, vars), k: key, v: vars, kind };
}
/** Receiver side of sysMsg(): localised text for a 'sys' payload (falls back to translating the raw text). */
export function sysText(d) {
  if (!d) return '';
  if (d.k) return tf(d.k, d.v || {});
  return t(String(d.text ?? ''));
}

// ------------------------------------------------------------------ display-name path
// Game data (items, creatures, moons, upgrades ...) keeps its English text and stable ids. localizeFields() turns the
// listed string fields of a definition into getters that go through t() at read time, so every existing `def.name`
// read site shows the current language without being edited. `def.$name` (etc.) is the untranslated English text
// (terminal search, network payloads, regex lookups). Assigning to the field still works (sets the English base).
export function localizeFields(obj, fields = ['name']) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const f of fields) {
    const d = Object.getOwnPropertyDescriptor(obj, f);
    if (!d || d.get || typeof d.value !== 'string' || !d.configurable) continue;
    let base = d.value;
    try {
      Object.defineProperty(obj, f, { get() { return t(base); }, set(v) { base = v; }, enumerable: true, configurable: true });
      Object.defineProperty(obj, '$' + f, { get() { return base; }, enumerable: false, configurable: true });
    } catch { /* frozen definition: stays English */ }
  }
  return obj;
}
/** localizeFields() on every plain object nested in `root` (tables, arrays of defs), depth-limited. */
export function localizeDeep(root, fields = ['name'], depth = 4, seen = new Set()) {
  if (!root || typeof root !== 'object' || depth < 0 || seen.has(root)) return root;
  seen.add(root);
  const proto = Object.getPrototypeOf(root);
  if (!Array.isArray(root) && proto !== Object.prototype && proto !== null) return root;
  if (!Array.isArray(root)) localizeFields(root, fields);
  for (const v of Object.values(root)) if (v && typeof v === 'object') localizeDeep(v, fields, depth - 1, seen);
  return root;
}
