// HORROR module - English source strings shared by the items + Turkish / Russian dictionaries (keys = the exact English strings used through t() / tf()).
import { TRAPS, HR_DEFS, FAKE_TELL } from './horror_core.js';

export const TIP = {
  chalk: 'LMB: draw an arrow (it points where you are heading). Crouch + LMB: an X. E on a mark rubs it out. Every crewmate keeps at most 24 marks. ' + FAKE_TELL,
  crest: 'A heavy brass emblem. Somewhere in this building a quarantine door has a hollow shaped exactly like it. Stand at the door with it in your hands and press E.',
  specimen: 'A locked case from the quarantine wing. Whatever is inside is still moving. Sells very well.',
  herb: 'LMB: chew. Heals 35 HP. Grows in the planters of the quarantine safe room. Food is the only healing there is.',
  herbShort: 'LMB: chew. Heals 35 HP.',
};
export const POCKET_TITLES = ['Quarantine Wing', 'Dark Oak Manor', 'The Cupboard', 'The Back Room'];
export const DEATH_TEXT = {
  hr_laser: 'was cut into cubes by a laser grid.', hr_crusher: 'was flattened by a ceiling crusher.', hr_spikes: 'was skewered by a spike floor.',
  hr_electric: 'was fried by a live floor.', hr_flame: 'was roasted by a flame vent.',
};
const D = HR_DEFS, T = TRAPS;

export const TR = {
  // ---- traps
  [T.laser.name]: 'Lazer Izgarası', [T.crusher.name]: 'Tavan Ezici', [T.spikes.name]: 'Şişli Zemin', [T.electric.name]: 'Elektrikli Zemin', [T.flame.name]: 'Alev Bacası',
  [T.laser.blurb]: 'Bir ışın duvarı koridoru süpürür ve içindeki her şeyi doğrar.',
  [T.crusher.blurb]: 'Altında duran her şeyin üstüne bir levha düşer. Önce gölge, sonra gümbürtü.',
  [T.spikes.blurb]: 'Paslı şişler zeminden fırlar. Ucuz, hızlı, beş vuruş.',
  [T.electric.blurb]: 'Zemin plakaları dört saniyeliğine akımlanır. Üstündekini yakar ve sersemletir.',
  [T.flame.blurb]: 'Duvar boyunca dizili bacalar bir alev şeridine dönüşür. Ateşe ver gitsin.',
  OFFLINE: 'KAPALI', ARMED: 'KURULU', WARNING: 'UYARI', ACTIVE: 'AKTİF', RECHARGE: 'ŞARJ', DEPLETED: 'BİTTİ', PRICE: 'FİYAT', CHARGES: 'HAK', 'PRESS TO ARM': 'KURMAK İÇİN BAS',
  'LURE THEM IN': 'ONLARI İÇERİ ÇEK', 'CLEAR THE LANE': 'ŞERİDİ BOŞALT',
  'Arm the {@name} ▮{n} [E]': '{@name} kur ▮{n} [E]', '{@name}: armed, {c} strike(s) left': '{@name}: kurulu, {c} vuruş kaldı',
  'Not enough credits. It costs ▮{n}.': 'Yeterli kredi yok. Bedeli ▮{n}.', 'This trap has been used enough for today.': 'Bu tuzak bugünlük yeterince kullanıldı.', 'It is already armed.': 'Zaten kurulu.',
  'You need the Wolf Crest in your hands.': 'Kurt Armasını elinde tutman gerek.', 'The box will not take that.': 'Kutu bunu kabul etmiyor.', 'Nothing happens.': 'Hiçbir şey olmuyor.',
  'The {@trap} powered down. Nobody walked in.': '{@trap} kapandı. İçeri kimse girmedi.', '{name} armed the {@trap} for {n}.': '{name}, {@trap} için {n} ödeyip kurdu.',
  // ---- closets / pockets
  'Slot the Wolf Crest into the door [E]': 'Kurt Armasını kapıya tak [E]', 'Quarantine door - locked': 'Karantina kapısı - kilitli', 'Knock on the door [E]': 'Kapıya vur [E]', 'Hook the door open [E]': 'Kapıyı kancayla aç [E]',
  'Open the wardrobe [E]': 'Gardırobu aç [E]', 'Open the quarantine door [E]': 'Karantina kapısını aç [E]', 'Open the cabinet [E]': 'Dolabı aç [E]',
  'A crest-shaped hollow. The crest is somewhere in this building.': 'Arma biçiminde bir oyuk. Arma bu binanın bir yerinde.', 'It will not budge. There is a crest-shaped hollow in it.': 'Kıpırdamıyor. Üstünde arma biçiminde bir oyuk var.',
  'You knock. The sound goes on for far too long.': 'Vuruyorsun. Ses çok fazla uzuyor.', '{name} slotted the crest. The quarantine door unlocked.': '{name} armayı taktı. Karantina kapısı açıldı.',
  'Quarantine Wing': 'Karantina Kanadı', 'Dark Oak Manor': 'Kara Meşe Konağı', 'The Cupboard': 'Dolap', 'The Back Room': 'Arka Oda',
  'Pick the green herb [E]': 'Yeşil otu topla [E]', 'Use the typewriter [E]': 'Daktiloyu kullan [E]', 'A safe room. The shamblers do not come in here.': 'Güvenli oda. Yürüyen ölüler buraya girmez.',
  'Take the last item out of the box ({n}) [E]': 'Kutudan son eşyayı çıkar ({n}) [E]', 'The item box is empty': 'Eşya kutusu boş', 'Put the held item into the box [E]': 'Elindeki eşyayı kutuya koy [E]',
  'Crouch to take things out again. Kept until the ship leaves.': 'Geri almak için çömel. Gemi kalkana kadar saklanır.', 'Push the loose bookshelf [E]': 'Gevşek kitaplığı it [E]',
  'You typed up the report. Progress saved. (+XP)': 'Raporu daktiloyla yazdın. İlerleme kaydedildi. (+XP)', 'The typewriter clacks. You catch your breath.': 'Daktilo tıkırdıyor. Nefes alıyorsun.', 'Typed up the report': 'Rapor yazıldı',
  // ---- chalk
  'Rub out the chalk mark [E]': 'Tebeşir işaretini sil [E]', 'Nothing to draw on.': 'Çizecek yüzey yok.', 'LMB: arrow (points where you go). Crouch + LMB: X. E rubs a mark out.': 'Sol tık: ok (gittiğin yönü gösterir). Çömel + sol tık: X. E işareti siler.',
  // ---- items
  Chalk: 'Tebeşir', 'Wolf Crest': 'Kurt Arması', 'Sealed Sample Case': 'Mühürlü Numune Çantası', 'Green Herb': 'Yeşil Ot',
  [TIP.chalk]: 'Sol tık: ok çiz (gittiğin yönü gösterir). Çömel + sol tık: X. E ile işareti sil. Herkes en fazla 24 işaret tutar. Sahte oklar düz ve temizdir, okun başında üçüncü bir çentik olur.',
  [TIP.crest]: 'Ağır pirinç bir amblem. Bu binanın bir yerinde tam bu şekilde bir oyuğu olan karantina kapısı var. Elinde tutarak kapıya git ve E\'ye bas.',
  [TIP.specimen]: 'Karantina kanadından kilitli bir çanta. İçindeki her ne ise hâlâ kıpırdıyor. Çok iyi para eder.',
  [TIP.herb]: 'Sol tık: çiğne. 35 HP iyileştirir. Karantina güvenli odasındaki saksılarda yetişir. Tek iyileşme yolu yemektir.', [TIP.herbShort]: 'Sol tık: çiğne. 35 HP iyileştirir.',
  // ---- death texts
  [DEATH_TEXT.hr_laser]: 'lazer izgarasıyla küp küp doğrandı.', [DEATH_TEXT.hr_crusher]: 'tavan ezicinin altında yassılandı.', [DEATH_TEXT.hr_spikes]: 'şişli zemine saplandı.',
  [DEATH_TEXT.hr_electric]: 'elektrikli zeminde kavruldu.', [DEATH_TEXT.hr_flame]: 'alev bacasında kızarıp kül oldu.',
  // ---- creatures
  [D.hr_zombie.name]: 'Yürüyen Ölü', [D.hr_forger.name]: 'Sahteci', [D.hr_ambusher.name]: 'Depo Dolabı?', [D.hr_warden.name]: 'Konak Bekçisi',
  [D.hr_zombie.deathText]: 'Yürüyen Ölülerce yere çekildi.', [D.hr_forger.deathText]: 'Sahtecinin tebeşiriyle silindi.', [D.hr_ambusher.deathText]: 'yanlış dolabı açtı.', [D.hr_warden.deathText]: 'bir Konak Bekçisince ikiye bölündü.',
  [D.hr_zombie.lore]: 'Yavaş, çürük ve hep sürü halinde. Yürüyen Ölü yakalar ve kemirir: herhangi bir vuruşla üstünden it. Kafaya atış iki katından fazla hasar verir. Hepsine yetecek kurşunun olmayacak: yoluna çıkanları öldür, sonra kaç.',
  [D.hr_forger.lore]: 'İnce, tebeşir beyazı parmaklı bir şey. Oklarını silip kendi oklarını çizer. Önce kazıma sesini duyarsın. Okları fazla temizdir ve başında fazladan bir çentik olur. Işıktan ve adil dövüşten kaçar.',
  [D.hr_ambusher.lore]: 'Fazla davetkâr görünen dolaplarda yaşar. Kapı nefes alır, altından soğuk hava sızar ve içeride bir şey kazır. Önce kapıya vur: çömelip vur ya da uzun bir şeyle uzaktan kancala. Asla tam önünde dururken açma.',
  [D.hr_warden.lore]: 'Kara meşe evin hizmetkârları. Baltaları hazır, sabırlılar; vurulmaktan çok kaçırılmaktan nefret ederler. İyi odaları korurlar.',
  Undead: 'Ölü', Prankster: 'Şakacı', Ambusher: 'Pusucu', Guard: 'Bekçi',
  'Slow and brittle, always in a pack. A hit shoves it off when it grabs. Aim high: headshots do more than double.': 'Yavaş ve çürük, hep sürüyle. Yakalayınca bir vuruş onu iter. Yukarı nişan al: kafa atışı iki katından fazla vurur.',
  'Scratches out and redraws chalk arrows. Its arrows have a third tick on the head. Bright light makes it run.': 'Tebeşir oklarını silip yeniden çizer. Oklarının başında üçüncü bir çentik olur. Parlak ışık onu kaçırır.',
  'Not a cabinet. Knock first (crouch + E) or hook the door open from a distance. Never open it from right in front.': 'Dolap değil. Önce vur (çömel + E) ya da kapıyı uzaktan kancala. Asla tam önünden açma.',
  'Axe servant of the dark oak house. Patient. Outrun it or trade shots from behind cover.': 'Kara meşe evin baltalı hizmetkârı. Sabırlı. Ondan kaç ya da siperden ateş et.',
};

export const RU = {
  [T.laser.name]: 'Лазерная решётка', [T.crusher.name]: 'Потолочный пресс', [T.spikes.name]: 'Шипастый пол', [T.electric.name]: 'Пол под током', [T.flame.name]: 'Огненная форсунка',
  [T.laser.blurb]: 'Стена лучей проходит по коридору и режет всё, что в нём.',
  [T.crusher.blurb]: 'Плита падает на всё, что стоит под ней. Сначала тень, потом удар.',
  [T.spikes.blurb]: 'Ржавые шипы вылезают из пола. Дёшево, быстро, пять ударов.',
  [T.electric.blurb]: 'Плиты пола под напряжением четыре секунды. Жжёт и оглушает.',
  [T.flame.blurb]: 'Форсунки вдоль стен превращаются в огненную полосу. Поджарь их.',
  OFFLINE: 'ВЫКЛ', ARMED: 'ВЗВЕДЕНО', WARNING: 'ВНИМАНИЕ', ACTIVE: 'РАБОТАЕТ', RECHARGE: 'ЗАРЯДКА', DEPLETED: 'ПУСТО', PRICE: 'ЦЕНА', CHARGES: 'ЗАРЯДЫ', 'PRESS TO ARM': 'НАЖМИ, ЧТОБЫ ВЗВЕСТИ',
  'LURE THEM IN': 'ЗАМАНИ ИХ', 'CLEAR THE LANE': 'ОСВОБОДИ ПРОХОД',
  'Arm the {@name} ▮{n} [E]': 'Взвести {@name} ▮{n} [E]', '{@name}: armed, {c} strike(s) left': '{@name}: взведено, осталось ударов: {c}',
  'Not enough credits. It costs ▮{n}.': 'Не хватает кредитов. Цена ▮{n}.', 'This trap has been used enough for today.': 'Эту ловушку на сегодня хватит.', 'It is already armed.': 'Уже взведено.',
  'You need the Wolf Crest in your hands.': 'Волчий герб должен быть у тебя в руках.', 'The box will not take that.': 'Ящик это не принимает.', 'Nothing happens.': 'Ничего не происходит.',
  'The {@trap} powered down. Nobody walked in.': '{@trap} отключилась. Никто не зашёл.', '{name} armed the {@trap} for {n}.': '{name} взвёл {@trap} за {n}.',
  'Slot the Wolf Crest into the door [E]': 'Вставить Волчий герб в дверь [E]', 'Quarantine door - locked': 'Карантинная дверь - заперта', 'Knock on the door [E]': 'Постучать в дверь [E]', 'Hook the door open [E]': 'Открыть дверь крюком [E]',
  'Open the wardrobe [E]': 'Открыть шкаф [E]', 'Open the quarantine door [E]': 'Открыть карантинную дверь [E]', 'Open the cabinet [E]': 'Открыть шкафчик [E]',
  'A crest-shaped hollow. The crest is somewhere in this building.': 'Углубление в форме герба. Герб где-то в этом здании.', 'It will not budge. There is a crest-shaped hollow in it.': 'Не поддаётся. В ней углубление в форме герба.',
  'You knock. The sound goes on for far too long.': 'Ты стучишь. Звук тянется слишком долго.', '{name} slotted the crest. The quarantine door unlocked.': '{name} вставил герб. Карантинная дверь открылась.',
  'Quarantine Wing': 'Карантинное крыло', 'Dark Oak Manor': 'Особняк из тёмного дуба', 'The Cupboard': 'Шкаф', 'The Back Room': 'Задняя комната',
  'Pick the green herb [E]': 'Сорвать зелёную траву [E]', 'Use the typewriter [E]': 'Печатная машинка [E]', 'A safe room. The shamblers do not come in here.': 'Безопасная комната. Ходячие сюда не заходят.',
  'Take the last item out of the box ({n}) [E]': 'Достать последний предмет из ящика ({n}) [E]', 'The item box is empty': 'Ящик для вещей пуст', 'Put the held item into the box [E]': 'Положить предмет из рук в ящик [E]',
  'Crouch to take things out again. Kept until the ship leaves.': 'Присядь, чтобы достать вещи. Хранится до вылета корабля.', 'Push the loose bookshelf [E]': 'Толкнуть шаткий книжный шкаф [E]',
  'You typed up the report. Progress saved. (+XP)': 'Ты напечатал отчёт. Прогресс сохранён. (+XP)', 'The typewriter clacks. You catch your breath.': 'Машинка стучит. Ты переводишь дух.', 'Typed up the report': 'Отчёт напечатан',
  'Rub out the chalk mark [E]': 'Стереть меловую метку [E]', 'Nothing to draw on.': 'Не на чем рисовать.', 'LMB: arrow (points where you go). Crouch + LMB: X. E rubs a mark out.': 'ЛКМ: стрелка (указывает, куда ты идёшь). Присесть + ЛКМ: X. E стирает метку.',
  Chalk: 'Мел', 'Wolf Crest': 'Волчий герб', 'Sealed Sample Case': 'Запечатанный кейс с образцом', 'Green Herb': 'Зелёная трава',
  [TIP.chalk]: 'ЛКМ: нарисовать стрелку (она указывает, куда ты идёшь). Присесть + ЛКМ: X. E стирает метку. У каждого не больше 24 меток. Поддельные стрелки ровные и чистые, на острие у них третья чёрточка.',
  [TIP.crest]: 'Тяжёлая латунная эмблема. Где-то в этом здании у карантинной двери есть углубление точно такой формы. Встань у двери с гербом в руках и нажми E.',
  [TIP.specimen]: 'Запертый кейс из карантинного крыла. То, что внутри, всё ещё шевелится. Отлично продаётся.',
  [TIP.herb]: 'ЛКМ: съесть. Лечит 35 HP. Растёт в горшках безопасной комнаты карантина. Лечит только еда.', [TIP.herbShort]: 'ЛКМ: съесть. Лечит 35 HP.',
  [DEATH_TEXT.hr_laser]: 'был нарезан кубиками лазерной решёткой.', [DEATH_TEXT.hr_crusher]: 'был раздавлен потолочным прессом.', [DEATH_TEXT.hr_spikes]: 'был нанизан на шипы в полу.',
  [DEATH_TEXT.hr_electric]: 'был поджарен полом под током.', [DEATH_TEXT.hr_flame]: 'был зажарен огненной форсункой.',
  [D.hr_zombie.name]: 'Ходячий', [D.hr_forger.name]: 'Фальсификатор', [D.hr_ambusher.name]: 'Шкафчик?', [D.hr_warden.name]: 'Страж особняка',
  [D.hr_zombie.deathText]: 'был утащен Ходячими.', [D.hr_forger.deathText]: 'был стёрт мелом Фальсификатора.', [D.hr_ambusher.deathText]: 'открыл не тот шкаф.', [D.hr_warden.deathText]: 'был разрублен Стражем особняка.',
  [D.hr_zombie.lore]: 'Медленный, хрупкий и всегда в стае. Ходячий хватает и грызёт: сбрось его любым ударом. Выстрел в голову наносит больше двойного урона. Патронов на всех не хватит: убей тех, кто на пути, и беги.',
  [D.hr_forger.lore]: 'Тонкое существо с белыми от мела пальцами. Стирает твои стрелки и рисует свои. Сначала слышно царапанье. Его стрелки слишком аккуратные и с лишней чёрточкой на острие. Бежит от света и честного боя.',
  [D.hr_ambusher.lore]: 'Живёт в шкафах, которые выглядят слишком заманчиво. Дверь дышит, из-под неё сочится холод, внутри кто-то скребётся. Сначала постучи: присядь и стучи или открой дверь крюком издалека. Никогда не открывай, стоя прямо перед ней.',
  [D.hr_warden.lore]: 'Слуги дома из тёмного дуба. Топоры наготове, терпеливы; выстрелы им ненавистны больше, чем погоня. Охраняют лучшие комнаты.',
  Undead: 'Нежить', Prankster: 'Шутник', Ambusher: 'Засадник', Guard: 'Страж',
  'Slow and brittle, always in a pack. A hit shoves it off when it grabs. Aim high: headshots do more than double.': 'Медленный и хрупкий, всегда в стае. Удар сбрасывает его, когда он схватил. Целься выше: выстрел в голову даёт больше двойного урона.',
  'Scratches out and redraws chalk arrows. Its arrows have a third tick on the head. Bright light makes it run.': 'Стирает и перерисовывает меловые стрелки. У его стрелок третья чёрточка на острие. Яркий свет заставляет его бежать.',
  'Not a cabinet. Knock first (crouch + E) or hook the door open from a distance. Never open it from right in front.': 'Это не шкафчик. Сначала постучи (присесть + E) или открой дверь крюком издалека. Никогда не открывай, стоя прямо перед ней.',
  'Axe servant of the dark oak house. Patient. Outrun it or trade shots from behind cover.': 'Слуга дома из тёмного дуба с топором. Терпелив. Убеги от него или стреляй из-за укрытия.',
};
