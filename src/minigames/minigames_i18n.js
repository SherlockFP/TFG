// Minigame strings: [English key, Turkish, Russian]. wave 8 i18n8. common.js runs every drawn / status / help string through tmg(), which also matches
// "{}" keys for lines built with numbers ("HI 120" -> "HI {}"). Canvas text uses the 3x5 pixel font: it strips Turkish diacritics and now has Cyrillic,
// so TR lines below are written without them where they are canvas text (help lines and titles are DOM text and keep them).
import { fillGaps } from '../i18n/fill.js';

fillGaps([
  // ---- shared
  ['UNLOCKED', 'ACILDI', 'ОТКРЫТО'], ['TERMINAL', 'TERMINAL', 'ТЕРМИНАЛ'],
  ['HI {}', 'REKOR {}', 'РЕКОРД {}'], ['SCORE {}', 'SKOR {}', 'СЧЁТ {}'], ['SCORE', 'SKOR', 'СЧЁТ'], ['WAVE {}', 'DALGA {}', 'ВОЛНА {}'], ['TRIES {}', 'DENEME {}', 'ПОПЫТКИ {}'],
  ['BEST', 'EN IYI', 'ЛУЧШИЙ'], ['BEST {}', 'EN IYI {}', 'ЛУЧШИЙ {}'], ['HIT THE GREEN!', 'YESILE VUR!', 'ПОПАДИ В ЗЕЛЁНОЕ!'], ['SO CLOSE!', 'NEREDEYSE!', 'ПОЧТИ!'],
  ['NEW HIGH SCORE!', 'YENI REKOR!', 'НОВЫЙ РЕКОРД!'], ['INSERT COIN', 'JETON AT', 'ВСТАВЬТЕ МОНЕТУ'], ['PRESS E', "E'YE BAS", 'НАЖМИ E'], ['PRESS SPACE', "SPACE'E BAS", 'НАЖМИ ПРОБЕЛ'],
  ['[SPACE] RETRY   [ESC] QUIT', '[SPACE] TEKRAR   [ESC] CIK', '[SPACE] ЕЩЁ РАЗ   [ESC] ВЫХОД'], ['[SPACE] START', '[SPACE] BASLA', '[SPACE] СТАРТ'], ['[SPACE] continue', '[SPACE] devam', '[SPACE] дальше'],
  // ---- flappy (arcade.js) and the other arcade cabinets (arcade2.js)
  ['[SPACE] / [CLICK] swim   [ESC] quit', '[SPACE] / [TIK] yüz   [ESC] çık', '[SPACE] / [КЛИК] плыть   [ESC] выход'],
  ['SPEED UP!', 'HIZLANDI!', 'БЫСТРЕЕ!'], ['DODGE THE PIPES. AVOID NETS.', 'BORULARDAN KAC. AGLARDAN UZAK DUR.', 'ОБХОДИ ТРУБЫ. ИЗБЕГАЙ СЕТЕЙ.'],
  ['DONATION {}', 'BAGIS {}', 'ДОНАТ {}'], ['PLUGS {}', 'FISLER {}', 'ШТЕКЕРЫ {}'], ['LEN {}', 'UZUN {}', 'ДЛИНА {}'], ['LINES', 'SATIR', 'ЛИНИИ'], ['QUOTA {}', 'KOTA {}', 'КВОТА {}'], ['TODAY {}', 'BUGUN {}', 'СЕГОДНЯ {}'],
  // ---- dead feed shooter
  ['SPREAD', 'YAYILMA', 'РАЗБРОС'], ['RAPID', 'HIZLI', 'СКОРОСТРЕЛ'], ['DELETE ALL', 'HEPSINI SIL', 'УДАЛИТЬ ВСЁ'],
  ['[WASD] move   [ARROWS] / [MOUSE] shoot   [ESC] quit', '[WASD] hareket   [OKLAR] / [FARE] ateş   [ESC] çık', '[WASD] движение   [СТРЕЛКИ] / [МЫШЬ] огонь   [ESC] выход'],
  ['SCORE {}  HI {}', 'SKOR {}  REKOR {}', 'СЧЁТ {}  РЕКОРД {}'], ['SCORE {}   WAVE {}', 'SKOR {}   DALGA {}', 'СЧЁТ {}   ВОЛНА {}'], ['WAVE {} - THE INFLUENCER', 'DALGA {} - FENOMEN', 'ВОЛНА {} - ИНФЛЮЕНСЕР'],
  ['THE SPAM BOTS WANT YOUR ATTENTION', 'SPAM BOTLARI DIKKATINI ISTIYOR', 'СПАМ-БОТЫ ХОТЯТ ТВОЕГО ВНИМАНИЯ'], ['DO NOT GIVE IT TO THEM', 'ONA VERME', 'НЕ ОТДАВАЙ ИМ ЕГО'],
  ['[WASD] MOVE  [ARROWS/MOUSE] SHOOT', '[WASD] HAREKET  [OK/FARE] ATES', '[WASD] ХОД  [СТРЕЛКИ/МЫШЬ] ОГОНЬ'],
  // ---- fishing
  ['FISHING', 'OLTA', 'РЫБАЛКА'], ['[HOLD SPACE] charge   [RELEASE] cast   [ESC] quit', '[SPACE] basılı tut: güç   [BIRAK] at   [ESC] çık', '[SPACE] удерживать: сила   [ОТПУСТИТЬ] бросок   [ESC] выход'],
  ['[SPACE] hook it when the bobber dives   [ESC] quit', '[SPACE] şamandıra batınca tak   [ESC] çık', '[SPACE] подсечка, когда поплавок уйдёт под воду   [ESC] выход'],
  ['[HOLD SPACE / MOUSE] raise   [RELEASE] drop   [ESC] quit', '[SPACE / FARE] basılı tut: yukarı   [BIRAK] aşağı   [ESC] çık', '[SPACE / МЫШЬ] удерживать: вверх   [ОТПУСТИТЬ] вниз   [ESC] выход'],
  ['CAST YOUR LINE', 'OLTANI AT', 'ЗАБРОСЬ УДОЧКУ'], ['PERFECT CAST!', 'MUKEMMEL ATIS!', 'ИДЕАЛЬНЫЙ ЗАБРОС!'], ['IT GOT AWAY...', 'KACTI...', 'УШЛА...'], ['LINE SNAPPED!', 'MISINA KOPTU!', 'ЛЕСКА ПОРВАЛАСЬ!'],
  ['THE LINE SNAPPED!', 'MISINA KOPTU!', 'ЛЕСКА ПОРВАЛАСЬ!'], ['CAUGHT!', 'YAKALANDI!', 'ПОЙМАНО!'], ['HOOKED!', 'TAKILDI!', 'КЛЮЁТ!'], ['HOLD SPACE TO CAST', 'ATMAK ICIN SPACE BASILI TUT', 'ДЕРЖИ ПРОБЕЛ ДЛЯ ЗАБРОСА'],
  ['RELEASE TO CAST!', 'ATMAK ICIN BIRAK!', 'ОТПУСТИ ДЛЯ ЗАБРОСА!'], ['SPACE! NOW!', 'SPACE! SIMDI!', 'ПРОБЕЛ! СЕЙЧАС!'], ['KEEP IT IN THE ZONE!', 'BOLGEDE TUT!', 'ДЕРЖИ В ЗОНЕ!'], ['THE PHISH MOCKS YOU', 'BALIK ALAY EDIYOR', 'РЫБА НАД ТОБОЙ ИЗДЕВАЕТСЯ'],
  // ---- fuse box
  ['BLUE', 'MAVI', 'СИНИЙ'], ['YELLOW', 'SARI', 'ЖЁЛТЫЙ'], ['GREEN', 'YESIL', 'ЗЕЛЁНЫЙ'], ['WHITE', 'BEYAZ', 'БЕЛЫЙ'], ['PINK', 'PEMBE', 'РОЗОВЫЙ'], ['RED', 'KIRMIZI', 'КРАСНЫЙ'],
  ['FUSE BOX', 'SIGORTA KUTUSU', 'ЩИТОК'], ['FUSE BOX 7B', 'SIGORTA KUTUSU 7B', 'ЩИТОК 7B'], ['[DRAG] wire to same color   [1-6] then [1-6] keys   [ESC] quit', '[SÜRÜKLE] teli aynı renge   [1-6] sonra [1-6]   [ESC] çık', '[ТЯНИ] провод к тому же цвету   [1-6], затем [1-6]   [ESC] выход'],
  ['STRIPPED', 'SOYULDU', 'ЗАЧИЩЕНО'], ['SNIP', 'KES', 'ЩЁЛК'], ['TAKEN', 'DOLU', 'ЗАНЯТО'], ['CUT', 'KES', 'РЕЗ'], ['PICK {}-{}', 'SEC {}-{}', 'ВЫБОР {}-{}'], ['MATCH THE COLORS', 'RENKLERI ESLESTIR', 'СОВМЕСТИ ЦВЕТА'],
  // ---- hack / lockpick / swipe
  ['HACK', 'HACK', 'ВЗЛОМ'], ['[SPACE] / [CLICK] inject when the cursor is in the green   [ESC] quit', '[SPACE] / [TIK] imleç yeşildeyken enjekte et   [ESC] çık', '[SPACE] / [КЛИК] вводи, когда курсор в зелёной зоне   [ESC] выход'],
  ['BREACHED', 'ASILDI', 'ВЗЛОМАНО'], ['TARGET: LOCKBOX', 'HEDEF: KASA', 'ЦЕЛЬ: СЕЙФ'], ['FIREWALL {}', 'GUVENLIK DUVARI {}', 'ФАЙРВОЛ {}'],
  ['[SPACE] / [CLICK] set pin when the pick is in the green   [ESC] quit', '[SPACE] / [TIK] maymuncuk yeşildeyken pimi ayarla   [ESC] çık', '[SPACE] / [КЛИК] ставь штифт, когда отмычка в зелёной зоне   [ESC] выход'],
  ['CLICK!', 'TIK!', 'ЩЁЛК!'], ['OUT OF PICKS', 'MAYMUNCUK BITTI', 'ОТМЫЧКИ КОНЧИЛИСЬ'], ['PICKS', 'MAYMUNCUK', 'ОТМЫЧКИ'], ['PIN {}/{}', 'PIM {}/{}', 'ШТИФТ {}/{}'], ['SPD {}', 'HIZ {}', 'СКОР {}'], ['THE DOOR WINS', 'KAPI KAZANDI', 'ДВЕРЬ ПОБЕДИЛА'],
  ['SWIPE CARD', 'KART GECIR', 'ПРОВЕДИ КАРТУ'], ['[SPACE] / [CLICK] swipe when the marker is in the green   [ESC] quit', '[SPACE] / [TIK] işaret yeşildeyken kartı geçir   [ESC] çık', '[SPACE] / [КЛИК] проводи, когда маркер в зелёной зоне   [ESC] выход'],
  ['SWIPES {}/{}', 'GECIS {}/{}', 'ПРОВОДКИ {}/{}'], ['CARD REJECTED', 'KART REDDEDILDI', 'КАРТА ОТКЛОНЕНА'], ['SWIPE TO AUTHENTICATE', 'DOGRULAMAK ICIN GECIR', 'ПРОВЕДИ ДЛЯ ВХОДА'],
  // ---- vault keypad
  ['VAULT KEYPAD', 'KASA TUS TAKIMI', 'КОДОВАЯ ПАНЕЛЬ'], ['VAULT 07', 'KASA 07', 'СЕЙФ 07'], ['SECURE STORAGE', 'GUVENLI DEPO', 'НАДЁЖНОЕ ХРАНИЛИЩЕ'], ['[0-9] / [CLICK] enter code   [ESC] quit', '[0-9] / [TIK] kodu gir   [ESC] çık', '[0-9] / [КЛИК] ввод кода   [ESC] выход'],
  ['ROUND {}/{}', 'TUR {}/{}', 'РАУНД {}/{}'], ['ROUND {}', 'TUR {}', 'РАУНД {}'], ['TIME OUT - ALARM!', 'SURE DOLDU - ALARM!', 'ВРЕМЯ ВЫШЛО - ТРЕВОГА!'], ['WATCH', 'IZLE', 'СМОТРИ'], ['DENIED', 'REDDEDILDI', 'ОТКАЗАНО'], ['RND', 'TUR', 'РАУНД'], ['MEMORIZE!', 'EZBERLE!', 'ЗАПОМНИ!'],
  // ---- ship repair minigames
  ['FUEL VALVE', 'YAKIT VANASI', 'ТОПЛИВНЫЙ ВЕНТИЛЬ'], ['DRAG around the wheel clockwise  (or hold [D] / [RIGHT])   [ESC] quit', 'Tekeri saat yönünde SÜRÜKLE  (ya da [D] / [SAĞ] basılı tut)   [ESC] çık', 'ТЯНИ колесо по часовой  (или держи [D] / [RIGHT])   [ESC] выход'],
  ['TURN THE VALVE', 'VANAYI CEVIR', 'ПОВЕРНИ ВЕНТИЛЬ'], ['LEAK SEALED', 'SIZINTI KAPANDI', 'УТЕЧКА УСТРАНЕНА'], ['TOO SLOW', 'COK YAVAS', 'СЛИШКОМ МЕДЛЕННО'], ['SEAL {}%   {}s', 'MUHUR %{}   {}sn', 'ПЛОМБА {}%   {}с'],
  ['>> TURN CLOCKWISE >>', '>> SAAT YONUNDE CEVIR >>', '>> ПО ЧАСОВОЙ >>'], ['HOLD [SPACE] / mouse to cool - release to let it heat   [ESC] quit', 'Soğutmak için [SPACE] / fare basılı tut, bırakırsan ısınır   [ESC] çık', 'Держи [SPACE] / мышь, чтобы охлаждать, отпусти, чтобы грелось   [ESC] выход'],
  ['COOLANT STABLE', 'SOGUTUCU STABIL', 'ОХЛАДИТЕЛЬ СТАБИЛЕН'], ['TIME OUT', 'SURE DOLDU', 'ВРЕМЯ ВЫШЛО'], ['STABLE  {}%', 'STABIL  %{}', 'СТАБИЛЬНО  {}%'], ['TOO HOT - COOL IT', 'COK SICAK - SOGUT', 'ПЕРЕГРЕВ - ОХЛАДИ'], ['TOO COLD', 'COK SOGUK', 'СЛИШКОМ ХОЛОДНО'],
  ['NAV REBOOT', 'NAV YENIDEN BASLATMA', 'ПЕРЕЗАГРУЗКА НАВ'], ['Type the code from the NAV DISPLAY, [ENTER] to send  [BACKSPACE] delete  [ESC] quit', 'NAV EKRANINDAKİ kodu yaz, göndermek için [ENTER]  [BACKSPACE] sil  [ESC] çık', 'Введи код с НАВ-ЭКРАНА, [ENTER] - отправить  [BACKSPACE] - стереть  [ESC] выход'],
  ['MEMORISE THE CODE', 'KODU EZBERLE', 'ЗАПОМНИ КОД'], ['ASK YOUR CREW FOR THE CODE', 'KODU EKIBINDEN ISTE', 'СПРОСИ КОД У КОМАНДЫ'], ['NAV COMPUTER OFFLINE', 'NAV BILGISAYARI KAPALI', 'НАВ-КОМПЬЮТЕР ВЫКЛЮЧЕН'],
  ['CODE HIDDEN', 'KOD GIZLI', 'КОД СКРЫТ'], ['CODE: ON THE NAV DISPLAY', 'KOD: NAV EKRANINDA', 'КОД: НА НАВ-ЭКРАНЕ'], ['PRESS [ENTER]', '[ENTER] BAS', 'НАЖМИ [ENTER]'],
  // ---- restaurant pan
  ['[SPACE] / [CLICK] take it off the heat in the gold   [ESC] cancel', '[SPACE] / [TIK] altındayken ocaktan al   [ESC] iptal', '[SPACE] / [КЛИК] снимай с огня в золотой зоне   [ESC] отмена'], ['STOP IT IN THE GOLD', 'ALTINDA DURDUR', 'ОСТАНОВИ В ЗОЛОТЕ'],
  // ---- gacha machine
  ['GACHA MACHINE', 'GACHA MAKINESI', 'ГАЧА-АВТОМАТ'], ['[</>] bet   [SPACE] pull lever   [P] paytable   [ESC] cash out', '[</>] bahis   [SPACE] kolu çek   [P] ödeme tablosu   [ESC] bozdur', '[</>] ставка   [SPACE] рычаг   [P] выплаты   [ESC] забрать'],
  ['*** GACHA MACHINE *** 3x GOLDEN PHISH PAYS 100x - JACKPOT! *** 3x SEVEN 25x *** 3x BELL 10x *** 3x ANCHOR 8x *** 3x PHISH 5x *** 3x CHERRY 3x *** ANY GOLDEN PHISH 2x *** PRESS [P] OR CLICK THE SIGN FOR THE PAYTABLE *** GAMBLING IS A VALID RETIREMENT PLAN *** 3 SKULLS: THE ALGORITHM WINS ***   ',
    '*** GACHA MAKINESI *** 3x ALTIN PHISH 100x ODER - JACKPOT! *** 3x YEDI 25x *** 3x ZIL 10x *** 3x capa 8x *** 3x PHISH 5x *** 3x KIRAZ 3x *** HERHANGI ALTIN PHISH 2x *** ODEME TABLOSU ICIN [P] YA DA TABELAYA TIKLA *** KUMAR GECERLI BIR EMEKLILIK PLANIDIR *** 3 KAFATASI: ALGORITMA KAZANIR ***   ',
    '*** ГАЧА-АВТОМАТ *** 3x ЗОЛОТОЙ ФИШ ПЛАТИТ 100x - ДЖЕКПОТ! *** 3x СЕМЁРКИ 25x *** 3x КОЛОКОЛ 10x *** 3x ЯКОРЬ 8x *** 3x ФИШ 5x *** 3x ВИШНЯ 3x *** ЛЮБОЙ ЗОЛОТОЙ ФИШ 2x *** ВЫПЛАТЫ: [P] ИЛИ КЛИК ПО ВЫВЕСКЕ *** АЗАРТНЫЕ ИГРЫ - ПОЛНОЦЕННЫЙ ПЛАН НА ПЕНСИЮ *** 3 ЧЕРЕПА: АЛГОРИТМ ПОБЕЖДАЕТ ***   '],
  ['NOT ENOUGH COINS', 'YETERSIZ JETON', 'НЕ ХВАТАЕТ МОНЕТ'], ['OUT OF COINS', 'JETON BITTI', 'МОНЕТЫ КОНЧИЛИСЬ'], ['GO SCAVENGE, INTERN', 'HURDA TOPLAMAYA GIT, STAJYER', 'ИДИ ЗА ХЛАМОМ, СТАЖЁР'], ['TRANSACTION DECLINED', 'ISLEM REDDEDILDI', 'ТРАНЗАКЦИЯ ОТКЛОНЕНА'],
  ['ALL YOUR DATA ARE OURS', 'TUM VERILERIN BIZIM', 'ВСЕ ВАШИ ДАННЫЕ НАШИ'], ['BIG WIN!', 'BUYUK KAZANC!', 'КРУПНЫЙ ВЫИГРЫШ!'], ['DOUBLE GOLD!', 'CIFTE ALTIN!', 'ДВОЙНОЕ ЗОЛОТО!'], ['GOLDEN PHISH!', 'ALTIN PHISH!', 'ЗОЛОТОЙ ФИШ!'],
  ['PAIR OF 7S!', '7 CIFTI!', 'ПАРА СЕМЁРОК!'], ['BET LOWERED', 'BAHIS DUSTU', 'СТАВКА СНИЖЕНА'], ['PAYTABLE', 'ODEME TABLOSU', 'ВЫПЛАТЫ'], ['COINS', 'JETON', 'МОНЕТЫ'], ['BET', 'BAHIS', 'СТАВКА'], ['WIN', 'KAZANC', 'ВЫИГРЫШ'],
  ['THE CO.', 'SIRKET', 'КОМП.'], ['BEST RULE PAYS.', 'EN IYI KURAL ODER.', 'ЛУЧШЕЕ ПРАВИЛО ПЛАТИТ.'], ['3 SKULLS: THE', '3 KAFATASI:', '3 ЧЕРЕПА:'], ['COMPANY WINS', 'SIRKET KAZANIR', 'КОМПАНИЯ ПОБЕЖДАЕТ'],
]);
