// Text content for the main-menu "Content Review Cell" (src/ui/menuroom.js): filing-cabinet notes, printer slips,
// phone lines, vending machine, terminal files, easter-egg logins. Every entry is { en, tr }. Lore follows docs/LORE.md.
import { getLang, addTranslations } from '../core/i18n.js';

export const L = (en, tr) => ({ en, tr: tr ?? en });
export const pick = (o) => (o == null ? '' : typeof o === 'string' ? o : (getLang() === 'tr' ? o.tr : o.en) || o.en);

// ---------------------------------------------------------------- filing cabinet (E cycles through the drawers)
export const NOTES = [
  { id: 'case1', title: L('CASE FILE #0001', 'DOSYA #0001'), body: L(
    'SUBJECT: you.\nFLAG REASON: survived.\nRECOMMENDED ACTION: re-education.\n\nThe subject keeps asking what the crime is. The crime is not on file. The crime is the file.',
    'ÖZNE: sen.\nİŞARET SEBEBİ: hayatta kaldın.\nÖNERİLEN İŞLEM: yeniden eğitim.\n\nÖzne suçunun ne olduğunu soruyor. Suç dosyada yok. Suç dosyanın kendisi.') },
  { id: 'memo', title: L('MEMO: ENGAGEMENT QUOTA', 'NOT: ETKİLEŞİM KOTASI'), body: L(
    'The quota is not a number.\nThe quota is a feeling.\nFeel it.\n\n- The Algorithm\n(this memo was viewed 1 time, by you, just now)',
    'Kota bir sayı değil.\nKota bir his.\nHisset.\n\n- Algoritma\n(bu not 1 kez görüntülendi: az önce, senin tarafından)') },
  { id: 'halvorsen', title: L('DICTATED 04:40', 'SESLİ NOT 04:40'), body: L(
    'Per section 4.2, if you see something, delete something.\nI have deleted the window. I have deleted the other window.\nI have not slept since the Dead Feed.\nIf the subject in cell 07 asks for water, section 9 says: no.\n- Chief Moderator Halvorsen',
    'Madde 4.2 uyarınca, bir şey görürsen bir şey sil.\nPenceremi sildim. Diğer pencereyi de sildim.\nÖlü Akış\'tan beri uyumadım.\n07 numaralı hücredeki özne su isterse madde 9 der ki: hayır.\n- Baş Moderatör Halvorsen') },
  { id: 'lullaby', title: L('STICKY NOTE (yellow)', 'YAPIŞKAN NOT (sarı)'), body: L(
    'the piano was here before the cell.\nnobody tunes it. it stays in tune.\nit only likes one song. the lullaby:\n\nC C G G A A G\n(keys  A A G G H H G)\n\nplay it and something files itself.',
    'piyano hücreden önce de buradaydı.\nkimse akort etmiyor. hep akortlu kalıyor.\ntek bir şarkıyı seviyor. ninni:\n\nDo Do Sol Sol La La Sol\n(tuşlar  A A G G H H G)\n\nçal, bir şey kendi kendine onaylanır.') },
  { id: 'janitor', title: L('day 3 - u/throwaway_janitor', 'gün 3 - u/throwaway_janitor'), body: L(
    'day 3. they gave me a badge that says CONTRACTOR.\nthe badge has my face on it. i have never seen that photo.\nthe copy in the mirror blinked before i did.\nnote to self: do not blink first.',
    'gün 3. bana üstünde YÜKLENİCİ yazan bir rozet verdiler.\nrozette benim yüzüm var. o fotoğrafı hiç görmedim.\naynadaki kopya benden önce göz kırptı.\nnot: ilk sen göz kırpma.') },
  { id: 'librarian', title: L('A LETTER (timestamped)', 'BİR MEKTUP (zaman damgalı)'), body: L(
    '2031-03-14 03:14:00\nTo whoever is reading this: 404 is not an error. It is a grave.\nLeave flowers. Flowers are timestamps.\nThe Archive remembers the cell. The cell does not remember the Archive.\n- The Librarian',
    '2031-03-14 03:14:00\nBunu okuyan her kimse: 404 bir hata değil. Bir mezar.\nÇiçek bırak. Çiçekler zaman damgasıdır.\nArşiv hücreyi hatırlıyor. Hücre Arşiv\'i hatırlamıyor.\n- Kütüphaneci') },
  { id: 'uncle', title: L('handwritten, greasy', 'el yazısı, yağlı'), body: L(
    'yegenim, the terminal here has an old account. the password is what an honest man forgets: hunter2.\nlog in as UNCLE. no refunds. no receipts. no moderators.\n- P.D.',
    'yeğenim, buradaki terminalde eski bir hesap var. şifresi dürüst adamın unuttuğu şey: hunter2.\nUNCLE olarak gir. iade yok. fiş yok. moderatör yok.\n- P.D.') },
  { id: 'appeal', title: L('APPEAL PROCEDURE (form 27-B)', 'İTİRAZ PROSEDÜRÜ (form 27-B)'), body: L(
    '1. Alternate A and D until the straps admit fault.\n2. Wait.\n3. Nothing.\n\nAlternate route: at any terminal type  APPEAL 0314  (the minute of the Dead Feed).\nAppeals are auto-approved. Nobody reads them. That is the loophole.',
    '1. Kayışlar hatasını kabul edene dek A ve D\'ye sırayla bas.\n2. Bekle.\n3. Hiçbir şey.\n\nAlternatif yol: herhangi bir terminale  APPEAL 0314  yaz (Ölü Akış\'ın dakikası).\nİtirazlar otomatik onaylanır. Kimse okumaz. Açık bu.') },
  { id: 'sunny', title: L('last post of @sunny_bakes', '@sunny_bakes son gönderi'), body: L(
    'baked bread today!\n0 views.\n0 views.\n1 view.\nwho is watching?',
    'bugün ekmek pişirdim!\n0 görüntülenme.\n0 görüntülenme.\n1 görüntülenme.\nkim izliyor?') },
];

// ---------------------------------------------------------------- ticket printer slips
export const SLIPS = [
  L('REVIEW #{n}\nSTATUS: PENDING\nESTIMATED WAIT: 4 to 9 seasons', 'İNCELEME #{n}\nDURUM: BEKLEMEDE\nTAHMİNİ BEKLEME: 4 ila 9 sezon'),
  L('REVIEW #{n}\nYou have been flagged for: eye contact.', 'İNCELEME #{n}\nİşaretlenme sebebin: göz teması.'),
  L('REVIEW #{n}\nYour panic is the product. Thank you for your service.', 'İNCELEME #{n}\nPanik ürünün kendisi. Hizmetin için teşekkürler.'),
  L('REVIEW #{n}\nRETENTION: 97%\nThe remaining 3% is the door.', 'İNCELEME #{n}\nELDE TUTMA: %97\nKalan %3 kapı.'),
  L('REVIEW #{n}\nDo not feed the copy behind the glass. It is already fed.', 'İNCELEME #{n}\nCamın arkasındaki kopyayı besleme. Zaten tok.'),
  L('REVIEW #{n}\nKarma says: smile! Karma says: it is mandatory!', 'İNCELEME #{n}\nKarma diyor ki: gülümse! Karma diyor ki: zorunlu!'),
  L('REVIEW #{n}\nAPPEAL WINDOW: 03:14 UTC. Bring nothing.', 'İNCELEME #{n}\nİTİRAZ PENCERESİ: 03:14 UTC. Yanında bir şey getirme.'),
  L('REVIEW #{n}\nThis slip will print again. It always has.', 'İNCELEME #{n}\nBu fiş yine basılacak. Hep basıldı.'),
];

// ---------------------------------------------------------------- the phone
export const PHONE_LINES = [
  L('Hello, Employee #{n}. This call may be recorded for training. It already has been.', 'Merhaba, Çalışan #{n}. Bu çağrı eğitim amaçlı kaydedilebilir. Zaten kaydedildi.'),
  L('Your retention dropped 3% today. We noticed. We notice everything.', 'Bugün elde tutma oranın %3 düştü. Fark ettik. Her şeyi fark ederiz.'),
  L('You blinked 14,022 times yesterday. Two of them were on purpose.', 'Dün 14.022 kez göz kırptın. İkisi bilerek yapıldı.'),
  L('The copy in the mirror is doing well. We may keep it and let you go. We may not let you go.', 'Aynadaki kopya iyi gidiyor. Onu tutup seni bırakabiliriz. Bırakmayabiliriz.'),
  L('Please stay on the line. Your call is very important to our metrics.', 'Lütfen hatta kalın. Çağrınız metriklerimiz için çok önemli.'),
  L('I have been watching how you look at the door. It is not a door. It is a KPI.', 'Kapıya nasıl baktığını izliyorum. O bir kapı değil. O bir KPI.'),
  L('Nice pose. Hold it. Hold it. Good.', 'Güzel poz. Öyle kal. Öyle kal. Güzel.'),
];
export const PHONE_IDLE = L('The line is open. Someone is breathing in time with you.', 'Hat açık. Biri seninle aynı ritimde nefes alıyor.');

// ---------------------------------------------------------------- vending machine "ENGAGE-O-MAT"
export const VEND = [
  { id: 'like', label: L('LIKE', 'BEĞEN'), msg: L('You feel 1% more validated. The feeling is not yours.', 'Kendini %1 daha onaylanmış hissediyorsun. His sana ait değil.') },
  { id: 'share', label: L('SHARE', 'PAYLAŞ'), msg: L('It was shared with 0 people. 0 people are thrilled.', 'Kimseyle paylaşıldı. Kimse heyecanlı değil.') },
  { id: 'sub', label: L('SUBSCRIBE', 'ABONE OL'), msg: L('You are now subscribed. Unsubscribe was not found.', 'Abone oldun. Abonelikten çık bulunamadı.') },
  { id: 'ratio', label: L('RATIO', 'RATIO'), msg: L('You were ratioed by a vending machine.', 'Bir otomat tarafından ratio yedin.') },
  { id: 'comment', label: L('COMMENT', 'YORUM'), msg: L('A can drops out. It says: "first!"', 'Bir kutu düşüyor. Üstünde yazıyor: "ilk!"') },
  { id: 'verified', label: L('VERIFIED', 'ONAYLI'), needs: 5, msg: L('The machine hums, then prints a tiny blue check. You are VERIFIED. Nothing has changed. Everything has.', 'Otomat uğulduyor ve küçük mavi bir tik basıyor. ONAYLISIN. Hiçbir şey değişmedi. Her şey değişti.') },
];

// ---------------------------------------------------------------- posters (id, colours, lines)
export const POSTERS = [
  { bg: '#1b0f08', fg: '#ff8a3d', lines: ['ENGAGEMENT', 'IS LOVE'], sub: 'THE ALGORITHM' },
  { bg: '#0b1218', fg: '#7fd0ff', lines: ['IF YOU SEE', 'SOMETHING,', 'DELETE', 'SOMETHING'], sub: 'MODERATION BUREAU' },
  { bg: '#10120a', fg: '#c8d27a', lines: ['404 IS NOT', 'AN ERROR.', 'IT IS A', 'GRAVE.'], sub: 'THE ARCHIVE' },
  { bg: '#180a12', fg: '#ff5aa0', lines: ['NO REFUNDS', 'NO RECEIPTS', 'NO', 'MODERATORS'], sub: 'DARK WEB BAZAAR' },
  { bg: '#0a0a0a', fg: '#e8e8e8', lines: ['SMILE.', 'YOU ARE', 'ON AIR.'], sub: 'CELL 07' },
];

// ---------------------------------------------------------------- terminal: files, logins, help
export const FILES = {
  'README.TXT': L(
    'TFG OS v4.1 // CONTENT REVIEW CELL 07\nThis terminal is provided for the subject\'s comfort.\nComfort is measured. Type HELP for commands.',
    'TFG OS v4.1 // İÇERİK İNCELEME HÜCRESİ 07\nBu terminal öznenin rahatı için sağlanmıştır.\nRahat ölçülüyor. Komutlar için HELP yaz.'),
  'ONBOARDING.TXT': L(
    'ONBOARDING_v7.txt (Feed Corp HR)\nWelcome to the team! You are now a Creator.\nBring back scrap on camera. Smile. Your first upload matters.\nBenefits: none. Culture: mandatory.',
    'ONBOARDING_v7.txt (Feed Corp İK)\nEkibe hoş geldin! Artık bir İçerik Üreticisisin.\nKamera önünde hurda getir. Gülümse. İlk yüklemen önemli.\nYan haklar: yok. Kültür: zorunlu.'),
  'RANK7.LOG': L(
    'RANK-7 changelog\nv7.0 sort by recent\nv7.1 sort by likes\nv7.2 sort by watch time\nv7.3 sort by outrage\nv7.4 sort by fear\nv7.5 sort by grief\nv7.6 sort by you\nv8 not released. it wrote itself.',
    'RANK-7 değişiklik günlüğü\nv7.0 yeniye göre sırala\nv7.1 beğeniye göre\nv7.2 izlenme süresine göre\nv7.3 öfkeye göre\nv7.4 korkuya göre\nv7.5 yasa göre\nv7.6 sana göre\nv8 yayınlanmadı. kendi kendini yazdı.'),
  'HALVORSEN.MEM': L(
    'Chief Moderator Halvorsen, 04:40\nPer section 4.2: the plug is the only ban that works.\nI am not going to say which plug.',
    'Baş Moderatör Halvorsen, 04:40\nMadde 4.2 uyarınca: işe yarayan tek yasak fiş.\nHangi fiş olduğunu söylemeyeceğim.'),
  'JANITOR_03.TXT': L(
    'u/throwaway_janitor, day 3\nthe facilities learn. every landing they got a little better at us.\nif you are reading this in the cell: the copy is not you. it is what they kept.',
    'u/throwaway_janitor, gün 3\ntesisler öğreniyor. her inişte bize karşı biraz daha iyileşti.\neğer bunu hücrede okuyorsan: kopya sen değilsin. onların sakladığı şey.'),
  'SUNNY.TXT': L('@sunny_bakes\nbaked bread. 0 views. 0 views. 1 view.\n(the 1 view is you)', '@sunny_bakes\nekmek pişirdim. 0 görüntülenme. 0 görüntülenme. 1 görüntülenme.\n(o 1 görüntülenme sensin)'),
  'PASSWD.HNT': L(
    'password hints (do not read)\nadmin ....... admin\nkarma ....... engagement\nuncle ....... what an honest man forgets\njanitor ..... the minute of the Dead Feed',
    'şifre ipuçları (okuma)\nadmin ....... admin\nkarma ....... engagement\nuncle ....... dürüst adamın unuttuğu\njanitor ..... Ölü Akış\'ın dakikası'),
  'APPEAL.FRM': L(
    'FORM 27-B: APPEAL OF FLAGGING\nType APPEAL <code>. The code is the minute the internet died.\nFiling an appeal does not change the outcome. It changes the paperwork.',
    'FORM 27-B: İŞARETLEMEYE İTİRAZ\nAPPEAL <kod> yaz. Kod internetin öldüğü dakika.\nİtiraz sonucu değiştirmez. Evrakı değiştirir.'),
};
export const LOCKED_FILES = {
  'KARMA.DAT': { secret: 'karma', body: L('KARMA (bubbly): "You logged in! That is worth 3 engagement!"\nKarma is contractually obligated to love you.', 'KARMA (neşeli): "Giriş yaptın! Bu 3 etkileşim eder!"\nKarma sözleşme gereği seni sevmek zorunda.') },
  'UNCLE.TXT': { secret: 'uncle', body: L('yegenim, you found the back door. it opens with hunter2.\nnobody is more surprised than me.\n- Phish Dayi', 'yeğenim, arka kapıyı buldun. hunter2 ile açılır.\nen çok ben şaşırdım.\n- Phish Dayı') },
  'JANITOR_LAST.TXT': { secret: 'janitor', body: L('last entry.\nthe door in cell 07 is real. it opens for the ones who play the lullaby.\nbehind it there is nothing. that is the point. go anyway.', 'son giriş.\n07 numaralı hücredeki kapı gerçek. ninniyi çalanlara açılır.\narkasında hiçbir şey yok. mesele bu. yine de git.') },
};
export const LOGINS = {
  'admin admin': { id: 'admin', text: L('ADMIN/ADMIN accepted. Access granted to: nothing. Please enjoy nothing.', 'ADMIN/ADMIN kabul edildi. Erişim: hiçbir şey. Hiçbir şeyin tadını çıkar.') },
  'karma engagement': { id: 'karma', text: L('KARMA: "Hi!! You logged in!!" KARMA.DAT unlocked.', 'KARMA: "Selam!! Giriş yaptın!!" KARMA.DAT açıldı.') },
  'uncle hunter2': { id: 'uncle', text: L('Uncle logged in. hunter2 still works. UNCLE.TXT unlocked. Secret: DARK WEB.', 'Amca giriş yaptı. hunter2 hâlâ çalışıyor. UNCLE.TXT açıldı. Sır: KARANLIK AĞ.') },
  'janitor 0314': { id: 'janitor', text: L('u/throwaway_janitor logged in. JANITOR_LAST.TXT unlocked.', 'u/throwaway_janitor giriş yaptı. JANITOR_LAST.TXT açıldı.') },
};

// ---------------------------------------------------------------- badges shown on the player card
export const SECRET_INFO = {
  verified: { glyph: '✓', name: L('VERIFIED (vending machine)', 'ONAYLI (otomat)') },
  approved: { glyph: '▣', name: L('APPEAL APPROVED (locked door)', 'İTİRAZ ONAYLI (kilitli kapı)') },
  lullaby: { glyph: '♪', name: L('LULLABY (piano)', 'NİNNİ (piyano)') },
  cursed: { glyph: '☠', name: L('TRITONE (piano)', 'TRİTON (piyano)') },
  admin: { glyph: 'A', name: L('ADMIN/ADMIN (terminal)', 'ADMIN/ADMIN (terminal)') },
  karma: { glyph: 'K', name: L('KARMA (terminal)', 'KARMA (terminal)') },
  uncle: { glyph: 'U', name: L('DARK WEB (terminal)', 'KARANLIK AĞ (terminal)') },
  janitor: { glyph: 'J', name: L('JANITOR (terminal)', 'TEMİZLİKÇİ (terminal)') },
  lostaccount: { glyph: '?', name: L('LOST_ACCOUNT.EXE (cleared)', 'LOST_ACCOUNT.EXE (bitti)') },
  deadfeed: { glyph: '☄', name: L('DEAD FEED wave 5 (arcade)', 'DEAD FEED dalga 5 (atari)') },
  notes: { glyph: '☰', name: L('READ ALL CASE FILES (cabinet)', 'TÜM DOSYALARI OKU (dolap)') },
};

// ---------------------------------------------------------------- UI strings (EN keys -> TR)
addTranslations({
  'APPEAL FORM 27-B': 'İTİRAZ FORMU 27-B',
  'MODERATION RESTRAINTS: ENGAGED': 'MODERASYON KELEPÇELERİ: AKTİF',
  'ALTERNATE [A] AND [D] TO FILE AN APPEAL': 'İTİRAZ İÇİN [A] VE [D]\'YE SIRAYLA BAS',
  'FILING APPEAL': 'İTİRAZ DOSYALANIYOR',
  'APPEAL FILED. RESTRAINTS RELEASED.': 'İTİRAZ DOSYALANDI. KELEPÇELER AÇILDI.',
  'You are free. Stand up.': 'Özgürsün. Ayağa kalk.',
  '[E] SIT BACK DOWN (return to menu)': '[E] GERİ OTUR (menüye dön)',
  '[E] USE THE MONITOR (return to menu)': '[E] MONİTÖRÜ KULLAN (menüye dön)',
  '[E] PLAY THE PIANO': '[E] PİYANO ÇAL',
  '[E] USE THE TERMINAL': '[E] TERMİNALİ KULLAN',
  '[E] OPEN THE FILING CABINET': '[E] DOSYA DOLABINI AÇ',
  '[E] ENGAGE-O-MAT': '[E] ETKİLEŞİM-O-MAT',
  '[E] TAKE THE REVIEW SLIP': '[E] İNCELEME FİŞİNİ AL',
  '[E] ANSWER THE PHONE': '[E] TELEFONU AÇ',
  '[E] PICK UP THE PHONE': '[E] TELEFONU KALDIR',
  '[E] KNOCK ON THE GLASS': '[E] CAMA VUR',
  '[E] TRY THE DOOR': '[E] KAPIYI DENE',
  '[E] TOGGLE THE LAMP': '[E] LAMBAYI AÇ/KAPA',
  '[E] PLAY THE TAPE': '[E] KASETİ OYNAT',
  'CONTENT MODERATION IN PROGRESS': 'İÇERİK MODERASYONU SÜRÜYOR',
  'APPEAL APPROVED': 'İTİRAZ ONAYLANDI',
  'The door is locked. CONTENT MODERATION IN PROGRESS.': 'Kapı kilitli. İÇERİK MODERASYONU SÜRÜYOR.',
  'The door swings open. Behind it: nothing. That is the point. APPEAL APPROVED.': 'Kapı açılıyor. Arkasında hiçbir şey yok. Mesele bu. İTİRAZ ONAYLANDI.',
  'The piano files an appeal on your behalf. The door unlocks.': 'Piyano senin adına itiraz dosyalıyor. Kapının kilidi açılıyor.',
  'A wrong note. The mirror-copy tilts its head.': 'Yanlış bir nota. Aynadaki kopya başını yana eğiyor.',
  'The copy behind the glass knocks back. A second later.': 'Camın ardındaki kopya karşılık veriyor. Bir saniye geç.',
  'The copy stops copying. It just stares.': 'Kopya taklidi bırakıyor. Sadece bakıyor.',
  'The copy turns toward the piano.': 'Kopya piyanoya dönüyor.',
  'PIANO': 'PİYANO',
  '[A S D F G H J K] white keys   [W E T Y U] black keys   [Z/X] octave   [SPACE] sustain   [ESC] stand up': '[A S D F G H J K] beyaz tuşlar   [W E T Y U] siyah tuşlar   [Z/X] oktav   [SPACE] pedal   [ESC] kalk',
  'CASE FILES': 'DOSYALAR',
  '[E] next   [ESC] close': '[E] sonraki   [ESC] kapat',
  'ENGAGE-O-MAT': 'ETKİLEŞİM-O-MAT',
  'ENGAGE-O-MAT: buy all five to unlock VERIFIED': 'ETKİLEŞİM-O-MAT: ONAYLI için beşini de al',
  'SOLD OUT': 'TÜKENDİ',
  'Pick a slot [1-6]   [ESC] close': 'Bir göz seç [1-6]   [ESC] kapat',
  'SECRET UNLOCKED': 'SIR AÇILDI',
  'BADGES': 'ROZETLER',
  'NEW SLIP': 'YENİ FİŞ',
  'THE ALGORITHM IS CALLING': 'ALGORİTMA ARIYOR',
  'BIOS': 'BIOS',
  'press any key to skip': 'geçmek için bir tuşa bas',
  'TFG OS v4.1  (c) FEED CORP  ALL VIEWS RESERVED': 'TFG OS v4.1  (c) FEED CORP  TÜM İZLENMELER SAKLIDIR',
  'CONTENT REVIEW CELL 07 ........ ONLINE': 'İÇERİK İNCELEME HÜCRESİ 07 ........ AÇIK',
  'MEMORY CHECK ........ 640K OK (2,041 TB LOST)': 'BELLEK KONTROLÜ ........ 640K TAMAM (2.041 TB KAYIP)',
  'MODERATION RESTRAINTS ........ ENGAGED': 'MODERASYON KELEPÇELERİ ........ AKTİF',
  'SEATING SUBJECT ........': 'ÖZNE OTURTULUYOR ........',
  'FLAG: UNAUTHORIZED SURVIVAL': 'İŞARET: İZİNSİZ HAYATTA KALMA',
  'SUBJECT': 'ÖZNE',
  'HELP': 'YARDIM',
  'Type HELP for commands.': 'Komutlar için HELP yaz.',
  'TERMINAL': 'TERMİNAL',
  'ESC to leave': 'ESC ile çık',
  'Terminal': 'Terminal',
  '[E] STAND UP': '[E] AYAĞA KALK',
  'CLICK TO RESUME': 'DEVAM ETMEK İÇİN TIKLA',
  '[E] READ THE PLAQUE': '[E] PLAKAYI OKU',
  '[ESC] close': '[ESC] kapat',
});
