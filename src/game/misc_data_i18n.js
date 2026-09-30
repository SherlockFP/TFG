// Remaining data-table strings without a TR entry (achievement titles, echo abilities, tasks, tags, signs, levels ...): [English key, Turkish, Russian].
// wave 8 i18n8. Gap-fill only.
import { fillGaps } from '../i18n/fill.js';

fillGaps([
  // ---- achievement / milestone titles (shown on the name tag)
  ['Pest Control', 'İlaçlama Ekibi', 'Дезинсектор'], ['The Reaper', 'Azrail', 'Жнец'], ['Monster Hunter', 'Canavar Avcısı', 'Охотник на монстров'], ['Giant Slayer', 'Dev Avcısı', 'Убийца великанов'],
  ['Zoologist', 'Zoolog', 'Зоолог'], ['Packrat', 'İstifçi', 'Барахольщик'], ['Tycoon', 'Patron', 'Магнат'], ['Team Player', 'Takım Oyuncusu', 'Командный игрок'],
  ['Employee of the Month', 'Ayın Çalışanı', 'Сотрудник месяца'], ['Follower Chaser', 'Takipçi Avcısı', 'Охотник за подписчики'], ['Untouchable', 'Dokunulmaz', 'Неприкасаемый'],
  ['Lucky Fish', 'Şanslı Balık', 'Везучая рыба'], ['Veteran', 'Kıdemli', 'Ветеран'], ['Revenant', 'Hortlak', 'Ревенант'], ['Snack', 'Atıştırmalık', 'Закуска'],
  ['Forgotten', 'Unutulan', 'Забытый'], ['Unemployed', 'İşsiz', 'Безработный'], ['Angler', 'Olta Ustası', 'Рыболов'], ['Shiny Hunter', 'Parlak Avcısı', 'Охотник за блестяшками'],
  ['High Roller', 'Büyük Oyuncu', 'Крупный игрок'], ['Safecracker', 'Kasa Kırıcı', 'Медвежатник'], ['Electrician', 'Elektrikçi', 'Электрик'], ['Gamer', 'Oyuncu', 'Геймер'],
  ['Senior Staff', 'Kıdemli Personel', 'Старший персонал'], ['Living Legend', 'Yaşayan Efsane', 'Живая легенда'], ['Five-Star Poster', 'Beş Yıldızlı Paylaşımcı', 'Пятизвёздочный постер'],
  ['Lore Master', 'Lore Ustası', 'Знаток лора'], ['Speedrunner', 'Hız Koşucusu', 'Спидраннер'], ['Galaxy Brain', 'Galaksi Beyni', 'Мозг галактики'], ['Crew Legend', 'Ekip Efsanesi', 'Легенда команды'],
  ['Explorer', 'Kaşif', 'Исследователь'], ['Frequent Flyer', 'Müdavim Hayalet', 'Частый пассажир'],
  // ---- avatar / hats / pets / skins
  ['Diver', 'Dalgıç', 'Водолаз'], ['Clown', 'Palyaço', 'Клоун'], ['Astronaut', 'Astronot', 'Астронавт'], ['Beanie', 'Bere', 'Шапка-бини'],
  ['No hat', 'Şapka yok', 'Без шапки'], ['Natural', 'Doğal', 'Естественный'], ['Halloween', 'Cadılar Bayramı', 'Хэллоуин'], ['Spring', 'İlkbahar', 'Весна'],
  ['Shadow', 'Gölge', 'Тень'], ['Snow', 'Kar', 'Снег'], ['Polar', 'Kutup', 'Полярный'], ['Guardian', 'Koruyucu', 'Страж'], ['Mint', 'Nane', 'Мятный'], ['Barn', 'Peçeli', 'Сипуха'],
  ['Chatter', 'Gevezelik', 'Болтовня'], ['Magpie', 'Saksağan', 'Сорока'], ['Ash', 'Kül', 'Пепельный'], ['Recharge', 'Şarj', 'Подзарядка'],
  // ---- abilities, tasks, tags
  ['OVERCLOCK', 'HIZ AŞIRTMA', 'РАЗГОН'], ['MELTDOWN', 'ERİME', 'РАСПЛАВ'],
  ['Flicker Lights', 'Işıkları Titret', 'Мерцание света'], ['Knock', 'Kapıyı Tıklat', 'Стук'], ['Whisper', 'Fısılda', 'Шёпот'], ['Reveal', 'Göster', 'Раскрыть'], ['Toggle Door', 'Kapıyı Aç/Kapat', 'Дверь: открыть/закрыть'],
  ['Fix Wiring', 'Kabloları Onar', 'Починить проводку'], ['Upload Data', 'Veri Yükle', 'Загрузить данные'], ['Clean Vent', 'Havalandırmayı Temizle', 'Почистить вентиляцию'], ['Swipe Card', 'Kartı Geçir', 'Провести карту'],
  ['Safe', 'Kasa', 'Сейф'], ['THE ALGORITHM WINS', 'ALGORİTMA KAZANIR', 'АЛГОРИТМ ПОБЕЖДАЕТ'], ['MONEY BACK', 'PARA İADESİ', 'ВОЗВРАТ СТАВКИ'],
  ['Driver', 'Sürücü', 'Водитель'], ['Passenger', 'Yolcu', 'Пассажир'],
  // ---- factions and lore
  ['ARCHIVE', 'ARŞİV', 'АРХИВ'], ['BUREAU', 'BÜRO', 'БЮРО'], ['DARK WEB', 'KARANLIK AĞ', 'ТЁМНАЯ СЕТЬ'], ['Archive', 'Arşiv', 'Архив'], ['Bureau', 'Büro', 'Бюро'],
  ['The Archive', 'Arşiv', 'Архив'], ['Moderation Bureau', 'Moderasyon Bürosu', 'Бюро модерации'], ['Dark Web', 'Karanlık Ağ', 'Тёмная сеть'],
  ['THE ARCHIVE', 'ARŞİV', 'АРХИВ'], ['DARK WEB BAZAAR', 'KARANLIK AĞ PAZARI', 'БАЗАР ТЁМНОЙ СЕТИ'],
  ['day 3', 'gün 3', 'день 3'], ['last post of @sunny_bakes', "@sunny_bakes'in son paylaşımı", 'последний пост @sunny_bakes'], ['RANK-7 changelog', 'RANK-7 değişiklik günlüğü', 'RANK-7: список изменений'], ['last entry', 'son kayıt', 'последняя запись'],
  // ---- terminal / menu strings the static audit found without a twin
  ['>MOONS        route board (MOONS ALL: the full list)', '>MOONS        rota panosu (MOONS ALL: tam liste)', '>MOONS        доска маршрутов (MOONS ALL: полный список)'],
  ['QUICK SHIFT', 'HIZLI VARDİYA', 'БЫСТРАЯ СМЕНА'], ['Items: {n}', 'Eşya: {n}', 'Предметов: {n}'],
  // ---- places
  ['HOME', 'EV', 'ДОМ'], ['∅-Level 0', '∅-Seviye 0', '∅-Уровень 0'], ['Level 0', 'Seviye 0', 'Уровень 0'], ['Level 1', 'Seviye 1', 'Уровень 1'], ['Level 2', 'Seviye 2', 'Уровень 2'],
  ['Level 37', 'Seviye 37', 'Уровень 37'], ['Level Fun', 'Eğlence Seviyesi', 'Уровень «Веселье»'], ['Level !', 'Seviye !', 'Уровень !'], ['Manila Room', 'Manila Odası', 'Манильская комната'],
  ['COCKPIT', 'KOKPİT', 'КАБИНА'], ['GALLEY', 'MUTFAK', 'КАМБУЗ'], ['MED', 'REVİR', 'МЕДБЛОК'], ['LOOT BAY', 'GANİMET BÖLMESİ', 'ТРЮМ С ДОБЫЧЕЙ'],
]);
