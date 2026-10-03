import {addTranslations,getLang,t} from '../core/i18n.js';
const rows=[
 ['ENDLESS','SONSUZ','БЕСКОНЕЧНЫЙ'],
 ['DEFAULT SHIP · SURVIVE · EXTRACT','HAZIR GEMİ · HAYATTA KAL · KURTAR','ГОТОВЫЙ КОРАБЛЬ · ВЫЖИВАЙ · ВЫВОЗИ'],
 ['Endless: start aboard the default ship. Recover cargo, survive waves and build your crew. Campaign saves stay separate.','Sonsuz: hazır gemide başla. Kargoyu kurtar, dalgalardan sağ çık ve ekibini geliştir. Sefer kayıtları ayrıdır.','Бесконечный: начните на готовом корабле. Собирайте груз, переживайте волны и развивайте экипаж. Кампания сохраняется отдельно.'],
 ['Choose an upgrade','Bir geliştirme seç','Выберите улучшение'],['Choose one. Your crew build lasts for this run.','Birini seç. Ekip gelişimi bu koşu boyunca sürer.','Выберите одно. Улучшения действуют до конца этого забега.'],
 ['Preparation','Hazırlık','Подготовка'],['Spend recovered cargo credits before the next wave.','Sonraki dalgadan önce kurtarılan kargonun kredisini harca.','Потратьте кредиты за добытый груз до следующей волны.'],
 ['Crew inventory','Ekip envanteri','Инвентарь экипажа'],['Weapons','Silahlar','Оружие'],['Modules & skills','Modüller ve beceriler','Модули и навыки'],['Items','Eşyalar','Предметы'],
 ['No equipment carried.','Taşınan ekipman yok.','Снаряжение отсутствует.'],['No upgrades chosen yet.','Henüz geliştirme seçilmedi.','Улучшения ещё не выбраны.'],
 ['Reroll','Yenile','Заменить'],['Skip','Atla','Пропустить'],['Ban','Ele','Исключить'],['Buy','Satın al','Купить'],['Close','Kapat','Закрыть'],['Current','Mevcut','Сейчас'],['After','Sonra','После'],['Waiting for crew confirmation…','Ekip onayı bekleniyor…','Ожидание подтверждения экипажа…'],
 ['Unavailable. Check the current offer or credits.','Kullanılamıyor. Güncel seçenekleri veya krediyi kontrol et.','Недоступно. Проверьте выбор и кредиты.'],
 ['Wave','Dalga','Волна'],['Level','Seviye','Уровень'],['Grace','Hazırlık süresi','Подготовка'],['Ship','Gemi','Корабль'],['Credits','Kredi','Кредиты'],['combat','savaş','бой'],['crew','ekip','экипаж'],['salvage','kurtarma','сбор'],['ship','gemi','корабль'],['weapon','silah','оружие'],['module','modül','модуль'],['robot','robot','робот'],
 ['common','sıradan','обычное'],['uncommon','sıradışı','необычное'],['rare','nadir','редкое'],['epic','destansı','эпическое'],['legendary','efsanevi','легендарное'],['Rank','Kademe','Ранг'],['Maximum','En yüksek','Максимум'],
 ['Striker','Vurucu','Штурмовик'],['Engineer','Mühendis','Инженер'],['Salvager','Kurtarıcı','Сборщик'],
 ['Overclocked barrel','Hızlandırılmış namlu','Разогнанный ствол'],['Weapon and pulse damage','Silah ve darbe hasarı','Урон оружия и импульса'],
 ['Pulse capacitor','Darbe kapasitörü','Импульсный конденсатор'],['Automatic pulse cooldown','Otomatik darbe bekleme süresi','Перезарядка автоматического импульса'],
 ['Split relay','Çift röle','Раздельное реле'],['Pulse targets per discharge','Her darbede vurulan hedef','Целей за импульс'],
 ['Long antenna','Uzun anten','Длинная антенна'],['Pulse acquisition range','Darbe hedefleme menzili','Дальность импульса'],
 ['Reinforced suit','Güçlendirilmiş tulum','Усиленный костюм'],['Maximum health','En yüksek can','Максимум здоровья'],
 ['Impact liner','Darbe astarı','Защитная подкладка'],['Incoming damage reduction','Alınan hasar azaltımı','Снижение получаемого урона'],
 ['Maintenance manual','Bakım el kitabı','Руководство по обслуживанию'],['Ship repair cost reduction','Gemi onarım maliyeti indirimi','Снижение стоимости ремонта'],
 ['Guardian firmware','Muhafız yazılımı','Прошивка защитника'],['Robot attack damage','Robot saldırı hasarı','Урон атаки робота'],
 ['Light boots','Hafif botlar','Лёгкие ботинки'],['Movement speed','Hareket hızı','Скорость движения'],
 ['Hauler firmware','Taşıyıcı yazılımı','Прошивка грузчика'],['Robot transport speed','Robot taşıma hızı','Скорость перевозки робота'],
 ['Cargo appraisal','Kargo değerleme','Оценка груза'],['Extracted cargo sale bonus','Kurtarılan kargo satış bonusu','Бонус продажи вывезенного груза'],
 ['Archive reader','Arşiv okuyucu','Архивный считыватель'],['Combat XP gain','Savaş XP kazanımı','Прирост боевого опыта'],
 ['Repair hull','Gövdeyi onar','Починить корпус'],['Restore 100 ship health','Gemiye 100 can kazandır','Восстановить 100 прочности корабля'],
 ['Reinforced hull','Güçlendirilmiş gövde','Усиленный корпус'],['Maximum hull health +100','En yüksek gövde canı +100','Максимальная прочность корпуса +100'],
 ['Fit or improve the working ship room','Gemi bölümünü kur veya geliştir','Установить или улучшить корабельный отсек'],
 ['Native ammunition for your shotgun','Av tüfeğin için mühimmat','Боеприпасы для вашего дробовика'],
 ['Shotgun shells','Av tüfeği fişekleri','Патроны для дробовика'],
 ['Sell extracted cargo','Kurtarılan kargoyu sat','Продать вывезенный груз'],['Sell physical cargo aboard the ship','Gemideki kargoyu sat','Продать груз на борту корабля'],
 ['Emergency reactor charge','Acil reaktör yüklemesi','Аварийная зарядка реактора'],['Orbit service when no recovered server core remains','Kurtarılmış sunucu çekirdeği kalmadığında yörüngede hizmet','Обслуживание на орбите, если добытых ядер сервера не осталось'],
 ['ENDLESS — run ended','SONSUZ — koşu bitti','БЕСКОНЕЧНЫЙ — забег окончен'],
 ['ENDLESS — install a recovered core in the engine room, or buy a reactor charge at the ship console','SONSUZ — motor odasında kurtarılmış çekirdeği tak veya gemi konsolundan reaktör yüklemesi al','БЕСКОНЕЧНЫЙ — установите добытое ядро в машинном отделении или купите зарядку на корабельной консоли'],
 ['ENDLESS — upgrade the ship, then land at the cockpit lever','SONSUZ — gemiyi geliştir, sonra kokpit koluyla iniş yap','БЕСКОНЕЧНЫЙ — улучшите корабль и запустите посадку рычагом в кабине'],
 ['ENDLESS — explore, survive and extract cargo. Return to the ship console to sell.','SONSUZ — keşfet, hayatta kal ve kargoyu kurtar. Satış için gemi konsoluna dön.','БЕСКОНЕЧНЫЙ — исследуйте, выживайте и вывозите груз. Продайте его на корабельной консоли.'],
 ['ENDLESS — ship, robots & cargo','SONSUZ — gemi, robotlar ve kargo','БЕСКОНЕЧНЫЙ — корабль, роботы и груз'],
 ['SHIP LOST — ENDLESS RUN ENDED','GEMİ KAYBEDİLDİ — SONSUZ KOŞU BİTTİ','КОРАБЛЬ ПОТЕРЯН — ЗАБЕГ ОКОНЧЕН'],['CREW LOST — ENDLESS RUN ENDED','EKİP KAYBEDİLDİ — SONSUZ KOŞU BİTTİ','ЭКИПАЖ ПОГИБ — ЗАБЕГ ОКОНЧЕН'],
 ['EXTRACTED CARGO +{value} CR','KURTARILAN KARGO +{value} KR','ВЫВЕЗЕННЫЙ ГРУЗ +{value} КР'],
 ['Wave {n} approaches from the {@r} in {s} s.','{n}. dalga {@r} yönünden {s} sn içinde geliyor.','Волна {n} приближается с направления {@r} через {s} с.'],
];
// Generic labels stay local, so a new mode cannot overwrite normal translations.
const local=new Map(rows.map(row=>[row[0],row]));
export const endless41Text=key=>{const row=local.get(key);return row?row[getLang()==='tr'?1:getLang()==='ru'?2:0]:t(key);};
const unique=rows.filter((r,i)=>i<3||r[0].startsWith('ENDLESS —')||r[0].includes('ENDLESS RUN ENDED')||r[0].startsWith('EXTRACTED CARGO +')||r[0]==='Wave {n} approaches from the {@r} in {s} s.');
addTranslations(Object.fromEntries(unique.map(([en,tr])=>[en,tr])),'tr');
addTranslations(Object.fromEntries(unique.map(([en,,ru])=>[en,ru])),'ru');
