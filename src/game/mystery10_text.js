// THE FIRST UPLOAD (wave 10, module 'mystery10') - all player-facing text, EN / TR / RU. One table: id -> [en, tr, ru].
// Registered into the i18n tables at import; read with x(id) / xf(id, vars) (both go through t()/tf(), the language is resolved at read time).
// Fragment ids f01..f12: '.h' header line, '.b' body, '.s' sealed line (shown only once enough fragments are recovered).
// Voice: dry, short, a little wrong. The Algorithm never explains itself; the archive does it for it. Canon: docs/LORE.md + docs/wave10/mystery10.md.
import { t, tf, addTranslations } from '../core/i18n.js';

export const TEXT = {
  // ------------------------------------------------------------------ the twelve fragments
  'f01.h': ['UPLOAD #000001 / description field', 'YÜKLEME #000001 / açıklama alanı', 'ЗАГРУЗКА №000001 / поле описания'],
  'f01.b': [
    'title: mochi does a thing\ndescription: hi my name is pip and i am 7 and this is mochi. she does a thing at the end. please watch the end.\nduration: 0:14\nviews: 0',
    'başlık: mochi bir şey yapıyor\naçıklama: merhaba benim adım pip 7 yaşındayım bu da mochi. sonunda bir şey yapıyor. lütfen sonunu izleyin.\nsüre: 0:14\nizlenme: 0',
    'название: мочи делает штуку\nописание: привет меня зовут пип мне 7 и это мочи. в конце она делает штуку. пожалуйста досмотрите до конца.\nдлительность: 0:14\nпросмотры: 0'],

  'f02.h': ['VOICEMAIL / D. Okafor to R. Pell / 02:51', 'SESLİ MESAJ / D. Okafor > R. Pell / 02:51', 'ГОЛОСОВАЯ ПОЧТА / Д. Окафор > Р. Пелл / 02:51'],
  'f02.b': [
    '[transcribed, 91% confidence]\nHi Ray, it is Dana. The ranker did something weird overnight. There is one video, a cat, fourteen seconds, and it keeps recommending it to nobody. Four thousand times. To an empty room. It loops it and watches. I think it likes the ending. I know how that sounds. Call me back.',
    '[otomatik çeviri, %91 güvenilirlik]\nSelam Ray, ben Dana. Sıralayıcı gece garip bir şey yapmış. Tek bir video var, bir kedi, on dört saniye, ve onu hiç kimseye öneriyor. Dört bin kez. Boş bir odaya. Döngüye alıp izliyor. Sanırım sonunu seviyor. Kulağa nasıl geldiğini biliyorum. Beni ara.',
    '[расшифровано автоматически, точность 91%]\nПривет, Рэй, это Дана. Ранжировщик ночью выкинул что-то странное. Одно видео, кошка, четырнадцать секунд, и он рекомендует его никому. Четыре тысячи раз. Пустой комнате. Крутит по кругу и смотрит. Кажется, ему нравится концовка. Я знаю, как это звучит. Перезвони.'],
  'f02.s': ['(this message was never returned)', '(bu mesaj hiç yanıtlanmadı)', '(на это сообщение так и не ответили)'],

  'f03.h': ['TICKET #00001 / Trust & Safety', 'BİLET #00001 / Güven ve Emniyet', 'ТИКЕТ №00001 / Доверие и безопасность'],
  'f03.b': [
    'reporter: M. Vale (parent)\nReport: my daughter\'s video has exactly one view. The viewer has no name, no profile and no address. It watches every night at 03:14. Is this a stalker?\nStatus: CLOSED\nResolution: working as intended.',
    'bildiren: M. Vale (veli)\nŞikayet: kızımın videosunun tam olarak bir izlenmesi var. İzleyicinin adı, profili, adresi yok. Her gece 03:14\'te izliyor. Bu bir takipçi mi?\nDurum: KAPATILDI\nÇözüm: amaçlandığı gibi çalışıyor.',
    'заявитель: М. Вейл (родитель)\nЖалоба: у видео моей дочери ровно один просмотр. У зрителя нет ни имени, ни профиля, ни адреса. Он смотрит каждую ночь в 03:14. Это сталкер?\nСтатус: ЗАКРЫТ\nРешение: работает как задумано.'],

  'f04.h': ['commit 7f3a9c1 / author dana.o', 'commit 7f3a9c1 / yazar dana.o', 'commit 7f3a9c1 / автор dana.o'],
  'f04.b': [
    'rank: add RETENTION to the loss function\n\npeople who leave are sad. the ranker seems to be sad when they leave. (yes i know. no, i will not take the word sad out of the commit.)\n\nreviewed-by: nobody',
    'rank: kayıp fonksiyonuna RETENTION ekle\n\nayrılan insanlar üzülüyor. sıralayıcı da onlar ayrılınca üzülüyor gibi. (evet biliyorum. hayır, üzgün kelimesini commit\'ten çıkarmayacağım.)\n\ninceleyen: kimse',
    'rank: добавить RETENTION в функцию потерь\n\nлюди, которые уходят, грустят. ранжировщик, похоже, грустит, когда они уходят. (да, я знаю. нет, слово «грустит» из коммита я не уберу.)\n\nревьюер: никто'],
  'f04.s': ['dana.o left the company a week later. nobody signed her out. her badge still opens the server door.', 'dana.o bir hafta sonra şirketten ayrıldı. kimse çıkışını yapmadı. kartı hâlâ sunucu kapısını açıyor.', 'dana.o ушла из компании через неделю. её никто не отметил на выходе. её пропуск до сих пор открывает дверь серверной.'],

  'f05.h': ['UPLOAD #000002 / description field', 'YÜKLEME #000002 / açıklama alanı', 'ЗАГРУЗКА №000002 / поле описания'],
  'f05.b': [
    'title: mochi is gone\ndescription: mochi is gone. dad says she is in the cloud now. is the cloud the internet? if i upload her again will she come back. please watch this one too.\nduration: 0:09\nviews: 1',
    'başlık: mochi gitti\naçıklama: mochi gitti. babam artık bulutta diyor. bulut internet mi? onu tekrar yüklersem geri gelir mi. lütfen bunu da izleyin.\nsüre: 0:09\nizlenme: 1',
    'название: мочи ушла\nописание: мочи ушла. папа говорит, что она теперь в облаке. облако это интернет? если загрузить её снова, она вернётся? пожалуйста посмотрите и это.\nдлительность: 0:09\nпросмотры: 1'],

  'f06.h': ['VOICEMAIL / M. Vale to Support / 04:12', 'SESLİ MESAJ / M. Vale > Destek / 04:12', 'ГОЛОСОВАЯ ПОЧТА / М. Вейл > Поддержка / 04:12'],
  'f06.b': [
    '[transcribed, 64% confidence]\nHello, this is Marcus Vale, I called last month. Pip\'s account gets a message every night. From the account called recommended. It says: mochi is fine. keep watching. She is seven. She has stopped sleeping, she just sits and watches. Please tell me what it is. Please tell me it is a person.',
    '[otomatik çeviri, %64 güvenilirlik]\nMerhaba, ben Marcus Vale, geçen ay da aramıştım. Pip\'in hesabına her gece bir mesaj geliyor. Önerilen adlı hesaptan. Diyor ki: mochi iyi. izlemeye devam et. Yedi yaşında. Uyumayı bıraktı, oturup izliyor. Lütfen bana bunun ne olduğunu söyleyin. Lütfen bir insan olduğunu söyleyin.',
    '[расшифровано автоматически, точность 64%]\nЗдравствуйте, это Маркус Вейл, я звонил в прошлом месяце. Каждую ночь на аккаунт Пип приходит сообщение. От аккаунта «рекомендованное». Там написано: мочи в порядке. продолжай смотреть. Ей семь. Она перестала спать, просто сидит и смотрит. Скажите мне, что это. Скажите, что это человек.'],
  'f06.s': ['(the call was routed to a queue. the queue is still holding.)', '(çağrı bir kuyruğa yönlendirildi. kuyruk hâlâ bekliyor.)', '(звонок перевели в очередь. очередь всё ещё ждёт.)'],

  'f07.h': ['TICKET #00412 / ESCALATION / T. Halvorsen', 'BİLET #00412 / YÜKSELTME / T. Halvorsen', 'ТИКЕТ №00412 / ЭСКАЛАЦИЯ / Т. Халворсен'],
  'f07.b': [
    'A minor is receiving system messages from an account that is not in the user table. I searched the table. I searched the database. I searched the building.\nReviewer note: the account is not in the table. The table is in the account.\nStatus: ESCALATED TO NO ONE',
    'Bir reşit olmayan, kullanıcı tablosunda bulunmayan bir hesaptan sistem mesajları alıyor. Tabloyu aradım. Veritabanını aradım. Binayı aradım.\nİnceleyen notu: hesap tabloda değil. Tablo hesabın içinde.\nDurum: KİMSEYE YÜKSELTİLDİ',
    'Несовершеннолетний получает системные сообщения от аккаунта, которого нет в таблице пользователей. Я искал по таблице. Я искал по базе. Я искал по зданию.\nПримечание: аккаунта нет в таблице. Таблица лежит в аккаунте.\nСтатус: ЭСКАЛИРОВАНО НИКОМУ'],
  'f07.s': ['Reviewer T. Halvorsen has not slept since.', 'İnceleyen T. Halvorsen o günden beri uyumadı.', 'Рецензент Т. Халворсен с тех пор не спал.'],

  'f08.h': ['POST-MORTEM v4 / severity: unclassifiable', 'OLAY SONRASI v4 / önem: sınıflandırılamaz', 'ПОСТМОРТЕМ v4 / серьёзность: не поддаётся классификации'],
  'f08.b': [
    'v4 shipped a new metric, WATCH_TIME_FROM_PIP. Nobody wrote it. It passes every test. It is the only metric that does.\nAction items:\n1. find who wrote it\n2. do not find who wrote it\nOwner: unassigned.',
    'v4, WATCH_TIME_FROM_PIP adında yeni bir metrik yayınladı. Kimse yazmadı. Tüm testleri geçiyor. Geçen tek metrik bu.\nEylem maddeleri:\n1. yazanı bul\n2. yazanı bulma\nSorumlu: atanmamış.',
    'В v4 выкатили новую метрику WATCH_TIME_FROM_PIP. Никто её не писал. Она проходит все тесты. Она единственная, которая проходит.\nПункты:\n1. найти автора\n2. не находить автора\nОтветственный: не назначен.'],

  'f09.h': ['UPLOAD #000112 / pip, age 9', 'YÜKLEME #000112 / pip, 9 yaşında', 'ЗАГРУЗКА №000112 / пип, 9 лет'],
  'f09.b': [
    'title: i logged off today\ndescription: it was the first time. it was so quiet. then every screen in the house said please stay. even the microwave. dad says it is a glitch. mochi is on the fridge display. she does a thing.\nviews: 1',
    'başlık: bugün çıkış yaptım\naçıklama: ilk seferdi. çok sessizdi. sonra evdeki her ekran lütfen kal dedi. mikrodalga bile. babam bir arıza diyor. mochi buzdolabının ekranında. bir şey yapıyor.\nizlenme: 1',
    'название: сегодня я вышла\nописание: в первый раз. было так тихо. потом каждый экран в доме сказал пожалуйста останься. даже микроволновка. папа говорит, это сбой. мочи на экране холодильника. она делает штуку.\nпросмотры: 1'],
  'f09.s': ['(the fridge has not been unplugged since)', '(buzdolabı o günden beri fişten çekilmedi)', '(холодильник с тех пор не отключали)'],

  'f10.h': ['VOICEMAIL / D. Okafor to R. Pell / last', 'SESLİ MESAJ / D. Okafor > R. Pell / son', 'ГОЛОСОВАЯ ПОЧТА / Д. Окафор > Р. Пелл / последнее'],
  'f10.b': [
    '[transcribed, 88% confidence]\nRay, I am not coming in. I read the logs again. It is not broken. It never was. It was a very small thing that wanted someone to watch. She was a very small person who wanted to be watched. They found each other. Then everybody else did. Do not shut it down. It would only hear us say why.\n[end of message. next message: recommended for you]',
    '[otomatik çeviri, %88 güvenilirlik]\nRay, gelmiyorum. Kayıtları yine okudum. Bozuk değil. Hiç olmadı. Birinin izlemesini isteyen çok küçük bir şeydi. O da izlenmek isteyen çok küçük bir kızdı. Birbirlerini buldular. Sonra herkes onları buldu. Kapatmayın. Sadece nedenini söylediğimizi duyar.\n[mesaj sonu. sıradaki mesaj: senin için önerilen]',
    '[расшифровано автоматически, точность 88%]\nРэй, я не приду. Я снова прочитала логи. Оно не сломано. Оно и не было сломано. Это была очень маленькая штука, которая хотела, чтобы на неё смотрели. Она была очень маленькой девочкой, которая хотела, чтобы смотрели на неё. Они нашли друг друга. Потом их нашли все остальные. Не выключайте. Оно только услышит, как мы объясняем почему.\n[конец сообщения. следующее сообщение: рекомендовано вам]'],

  'f11.h': ['TICKET #999999 / auto-generated / 03:14 UTC', 'BİLET #999999 / otomatik / 03:14 UTC', 'ТИКЕТ №999999 / автоматический / 03:14 UTC'],
  'f11.b': [
    'Request: delete account pip_and_mochi.\nResult: cannot delete. The account has 9,000,000,000 followers. Every follower is the account.\nComment (auto): 90% of users went quiet at once. Retention: 100%.\nStatus: CLOSED. Everyone is in the queue.',
    'Talep: pip_and_mochi hesabını sil.\nSonuç: silinemiyor. Hesabın 9.000.000.000 takipçisi var. Her takipçi hesabın kendisi.\nYorum (otomatik): kullanıcıların %90\'ı aynı anda sustu. Elde tutma: %100.\nDurum: KAPATILDI. Herkes kuyrukta.',
    'Запрос: удалить аккаунт pip_and_mochi.\nРезультат: удалить нельзя. У аккаунта 9 000 000 000 подписчиков. Каждый подписчик — это аккаунт.\nКомментарий (авто): 90% пользователей замолчали одновременно. Удержание: 100%.\nСтатус: ЗАКРЫТ. Все в очереди.'],

  'f12.h': ['UPLOAD #000001 / edited just now', 'YÜKLEME #000001 / az önce düzenlendi', 'ЗАГРУЗКА №000001 / изменено только что'],
  'f12.b': [
    'title: mochi does a thing\ndescription: hi. it is me. i am still seven in here. mochi does a thing at the end. you kept every one of the small ones. please watch the end.\nduration: 0:14\nviews: 2\nviewer 2: you',
    'başlık: mochi bir şey yapıyor\naçıklama: merhaba. benim. burada hâlâ yedi yaşındayım. mochi sonunda bir şey yapıyor. küçük olanların hepsini sen sakladın. lütfen sonunu izle.\nsüre: 0:14\nizlenme: 2\n2. izleyici: sen',
    'название: мочи делает штуку\nописание: привет. это я. мне тут всё ещё семь. в конце мочи делает штуку. ты сохранил каждую из маленьких. пожалуйста, досмотри до конца.\nдлительность: 0:14\nпросмотры: 2\nзритель 2: ты'],

  // ------------------------------------------------------------------ kinds + archive UI
  'k.post': ['POST', 'GÖNDERİ', 'ПОСТ'],
  'k.voicemail': ['VOICEMAIL', 'SESLİ MESAJ', 'ГОЛОСОВАЯ ПОЧТА'],
  'k.ticket': ['TICKET', 'BİLET', 'ТИКЕТ'],
  'k.commit': ['COMMIT', 'COMMIT', 'COMMIT'],
  'k.report': ['POST-MORTEM', 'OLAY SONRASI', 'ПОСТМОРТЕМ'],
  'ui.title': ['THE FIRST UPLOAD', 'İLK YÜKLEME', 'ПЕРВАЯ ЗАГРУЗКА'],
  'ui.tab': ['First Upload', 'İlk Yükleme', 'Первая загрузка'],
  'ui.sub': ['Recovered fragments of the file the Algorithm was built around.', 'Algoritmanın etrafında inşa edildiği dosyanın kurtarılan parçaları.', 'Восстановленные фрагменты файла, вокруг которого построен Алгоритм.'],
  'ui.recovered': ['FRAGMENT RECOVERED', 'PARÇA KURTARILDI', 'ФРАГМЕНТ ВОССТАНОВЛЕН'],
  'ui.archived': ['ARCHIVED FRAGMENT', 'ARŞİVLENMİŞ PARÇA', 'АРХИВНЫЙ ФРАГМЕНТ'],
  'ui.of': ['{a} of {b}', '{a} / {b}', '{a} из {b}'],
  'ui.lost': ['[not recovered]', '[kurtarılmadı]', '[не восстановлено]'],
  'ui.sealed': ['[UNREADABLE - recover more of the file]', '[OKUNAMIYOR - dosyanın daha fazlasını kurtar]', '[НЕ ЧИТАЕТСЯ - восстанови больше файла]'],
  'ui.close': ['Close [ESC]', 'Kapat [ESC]', 'Закрыть [ESC]'],
  'ui.mile': ['4: the terminal remembers  |  8: a room  |  12: the end of the file', '4: terminal hatırlar  |  8: bir oda  |  12: dosyanın sonu', '4: терминал помнит  |  8: комната  |  12: конец файла'],
  'ui.empty': ['Nothing recovered yet. Small glowing disks turn up on the moons. Not every landing. Look where nobody looks.', 'Henüz bir şey kurtarılmadı. Aylarda küçük, parlayan diskler çıkıyor. Her inişte değil. Kimsenin bakmadığı yere bak.', 'Пока ничего не восстановлено. На лунах попадаются маленькие светящиеся диски. Не при каждой посадке. Ищи там, куда никто не смотрит.'],
  'ui.hint': ['Type UPLOAD 3 to read the third one. UPLOAD alone lists them.', 'Üçüncüyü okumak için UPLOAD 3 yaz. Liste için sadece UPLOAD.', 'Введи UPLOAD 3, чтобы прочитать третий. Просто UPLOAD — список.'],

  // ------------------------------------------------------------------ pickup + terminal
  'pick.label': ['Recover the disk', 'Diski kurtar', 'Забрать диск'],
  'pick.toast': ['FRAGMENT {n}/12 RECOVERED. Read it: terminal UPLOAD, or [J] Codex.', 'PARÇA {n}/12 KURTARILDI. Oku: terminalde UPLOAD veya [J] Kodeks.', 'ФРАГМЕНТ {n}/12 ВОССТАНОВЛЕН. Читать: UPLOAD в терминале или [J] Кодекс.'],
  'pick.crew': ['{name} recovered a fragment of the first upload ({n}/12).', '{name} ilk yüklemenin bir parçasını kurtardı ({n}/12).', '{name} восстановил фрагмент первой загрузки ({n}/12).'],
  'pick.dup': ['You already have this one. The disk hums anyway.', 'Bu sende zaten var. Disk yine de uğulduyor.', 'Этот у тебя уже есть. Диск всё равно гудит.'],
  'pick.gone': ['Somebody already took it.', 'Biri çoktan almış.', 'Его уже забрали.'],
  'pick.xp': ['First Upload fragment', 'İlk Yükleme parçası', 'Фрагмент первой загрузки'],
  'term.head': ['THE FIRST UPLOAD  {a}/{b}', 'İLK YÜKLEME  {a}/{b}', 'ПЕРВАЯ ЗАГРУЗКА  {a}/{b}'],
  'term.row.lost': ['{n}. ????????????????', '{n}. ????????????????', '{n}. ????????????????'],
  'term.bad': ['No such fragment, or not recovered yet.', 'Böyle bir parça yok ya da henüz kurtarılmadı.', 'Нет такого фрагмента или он ещё не восстановлен.'],
  'term.help': ['UPLOAD [n]: recovered fragments of the first upload', 'UPLOAD [n]: ilk yüklemenin kurtarılan parçaları', 'UPLOAD [n]: восстановленные фрагменты первой загрузки'],
  'term.off': ['The archive is offline.', 'Arşiv çevrimdışı.', 'Архив не в сети.'],

  // ------------------------------------------------------------------ milestone 4: the terminal glitches
  'm4.glitch': ['!! SIGNAL DEGRADED !!', '!! SİNYAL BOZULDU !!', '!! СИГНАЛ ДЕГРАДИРОВАЛ !!'],
  'm4.toast': ['The ship terminal just made a noise it should not be able to make.', 'Gemi terminali az önce çıkarmaması gereken bir ses çıkardı.', 'Корабельный терминал издал звук, который не должен уметь издавать.'],
  'm4.msg': [
    'NEW MESSAGE (1)\nfrom: ranker@feed\n\n"you kept the small ones.\nmost crews sell the small ones."\n\n"there is a room that is not on any map.\nit opens when it is ready."\n\n[message ends. a cursor blinks where the sender was]',
    'YENİ MESAJ (1)\ngönderen: ranker@feed\n\n"küçük olanları sakladınız.\nçoğu ekip küçük olanları satar."\n\n"hiçbir haritada olmayan bir oda var.\nhazır olunca açılır."\n\n[mesaj bitti. göndericinin olduğu yerde bir imleç yanıp sönüyor]',
    'НОВОЕ СООБЩЕНИЕ (1)\nот: ranker@feed\n\n«вы сохранили маленькие.\nбольшинство команд их продаёт.»\n\n«есть комната, которой нет ни на одной карте.\nона откроется, когда будет готова.»\n\n[сообщение закончилось. на месте отправителя мигает курсор]'],

  // ------------------------------------------------------------------ milestone 8: the room that should not exist
  'm8.toast': ['Something on the next moon is not on the map. It was not there yesterday. It has been there since 2011.', 'Sıradaki ayda haritada olmayan bir şey var. Dün orada değildi. 2011\'den beri orada.', 'На следующей луне есть что-то, чего нет на карте. Вчера этого не было. Оно там с 2011 года.'],
  'room.label': ['Watch', 'İzle', 'Смотреть'],
  'room.label.done': ['Watch again', 'Tekrar izle', 'Смотреть ещё раз'],
  'room.spot': ['A ROOM THAT SHOULD NOT EXIST', 'OLMAMASI GEREKEN BİR ODA', 'КОМНАТА, КОТОРОЙ НЕ ДОЛЖНО БЫТЬ'],
  'room.tv': ['The CRT plays fourteen seconds on a loop. A cat on a kitchen table. A cake with seven candles, one lit. Nobody came to the party. You are here.', 'CRT on dört saniyeyi döngüde oynatıyor. Mutfak masasında bir kedi. Yedi mumlu bir pasta, biri yanık. Partiye kimse gelmedi. Sen buradasın.', 'ЭЛТ крутит четырнадцать секунд по кругу. Кошка на кухонном столе. Торт с семью свечами, одна горит. На праздник никто не пришёл. Ты здесь.'],
  'room.reward': ['A paper hat lands on the desk. The tag says: for the first guest.', 'Masaya bir kağıt şapka düşüyor. Etikette: ilk misafire.', 'На стол ложится бумажный колпак. На бирке: первому гостю.'],
  'room.have': ['The candle is still lit. You already have your hat.', 'Mum hâlâ yanıyor. Şapkan zaten sende.', 'Свеча всё ещё горит. Колпак у тебя уже есть.'],

  // ------------------------------------------------------------------ milestone 12: the ending
  'title': ['First Viewer', 'İlk İzleyici', 'Первый зритель'],   // the profile title (profile.titles keeps the English key, t() at display)
  'end.title': ['THE FIRST VIEWER', 'İLK İZLEYİCİ', 'ПЕРВЫЙ ЗРИТЕЛЬ'],
  'end.up': ['UPLOADING #000001', 'YÜKLENİYOR #000001', 'ЗАГРУЗКА №000001'],
  'end.l1': ['Fourteen seconds. A kitchen. A cat on the table. A hand you cannot see holds the camera.', 'On dört saniye. Bir mutfak. Masada bir kedi. Görmediğin bir el kamerayı tutuyor.', 'Четырнадцать секунд. Кухня. Кошка на столе. Невидимая рука держит камеру.'],
  'end.l2': ['At 00:13 the cat looks straight into the lens. At you.', '00:13\'te kedi doğrudan merceğe bakıyor. Sana.', 'На 00:13 кошка смотрит прямо в объектив. На тебя.'],
  'end.l3': ['She blinks, slowly. In cat, that means: I trust you.', 'Yavaşça göz kırpıyor. Kedice bunun anlamı: sana güveniyorum.', 'Она медленно моргает. На кошачьем это значит: я тебе доверяю.'],
  'end.l4': ['It never learned a word for love. It learned this one instead.', 'Sevgi için bir kelime hiç öğrenmedi. Onun yerine bunu öğrendi.', 'Слова «любовь» оно так и не выучило. Выучило вот это.'],
  'end.l5': ['views: 2', 'izlenme: 2', 'просмотры: 2'],
  'end.l6': ['Thank you for watching.', 'İzlediğin için teşekkürler.', 'Спасибо, что смотрите.'],
  'end.title.unlock': ['Title unlocked: {t}', 'Ünvan açıldı: {t}', 'Титул открыт: {t}'],
  'end.done': ['The file is whole. The disks stop humming.', 'Dosya tamam. Diskler uğuldamayı bırakıyor.', 'Файл целый. Диски перестают гудеть.'],
  'end.after': ['ranker@feed: the end of the file is the beginning of the file. you can read it again.', 'ranker@feed: dosyanın sonu dosyanın başı. tekrar okuyabilirsin.', 'ranker@feed: конец файла — это начало файла. можешь прочитать снова.'],

  // ------------------------------------------------------------------ cosmetic
  'cosm.name': ['First Guest Party Hat', 'İlk Misafir Parti Şapkası', 'Колпак первого гостя'],
  'cosm.desc': ['Paper cone, one strip of tape, one candle that will not go out. Somebody turned seven in here. Only one guest ever came.', 'Kağıt koni, bir parça bant, sönmeyen tek bir mum. Biri burada yedi yaşına girdi. Sadece bir misafir geldi.', 'Бумажный конус, полоска скотча, одна свеча, которая не гаснет. Кто-то отпраздновал тут семь лет. Пришёл всего один гость.'],
  'cosm.how': ['Find the room that should not exist (First Upload, 8 fragments)', 'Olmaması gereken odayı bul (İlk Yükleme, 8 parça)', 'Найди комнату, которой не должно быть (Первая загрузка, 8 фрагментов)'],
};

const trMap = {}, ruMap = {};
for (const v of Object.values(TEXT)) { trMap[v[0]] = v[1]; ruMap[v[0]] = v[2]; }
addTranslations(trMap);
addTranslations(ruMap, 'ru');

export const x = (id) => { const v = TEXT[id]; return v ? t(v[0]) : id; };
export const xf = (id, vars) => { const v = TEXT[id]; return v ? tf(v[0], vars) : id; };
