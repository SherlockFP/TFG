// WAVE 3 worlds2 - translations (EN keys -> TR / RU). Registered by game/worlds2.js with addTranslations(map, 'tr' | 'ru').
// Data only; English is the key everywhere (creature / item / moon display names go through the display.js getters).
import { NPC_LINES } from './worlds2_creatures.js';

export const TR = {
  // creatures
  'Dune Maw': 'Kum Ağzı', 'Tusked Beast': 'Dişli Canavar', 'Scavenger Raider': 'Çöl Yağmacısı', 'Cantina Alien': 'Kantin Uzaylısı', 'Dusk Prowler': 'Alacakaranlık Sinsisi',
  'was swallowed by a Dune Maw.': 'bir Kum Ağzı tarafından yutuldu.', 'was trampled by a Tusked Beast.': 'bir Dişli Canavar tarafından çiğnendi.', 'was shot by a hooded scavenger.': 'kapüşonlu bir yağmacı tarafından vuruldu.',
  'was thrown out of the cantina.': 'kantinden kovuldu.', 'was run down by Dusk Prowlers.': 'Alacakaranlık Sinsileri tarafından yakalandı.',
  'A burrower that hunts by vibration. When the sand starts to rumble under your boots, stop running in a straight line: it erupts 0.85 s after it reaches you. Crouch and walk to stay quiet. After the bite it lies exposed for a few seconds: that is your window.':
    'Titreşimle avlanan bir yeraltı yaratığı. Kum botlarının altında gürlemeye başlarsa düz koşmayı bırak: sana ulaştıktan 0.85 sn sonra patlayarak çıkar. Sessiz kalmak için eğil ve yürü. Isırdıktan sonra birkaç saniye açıkta kalır: fırsat o an.',
  'Peaceful herd animals... by day, and if you keep your distance. Approach too long, hurt one, or stay out after dark and it paws the ground (a 0.8 s warning) and charges in a straight line. Sidestep. The charge shoves you.':
    'Gündüz ve mesafeni korursan huzurlu sürü hayvanları... Fazla yaklaşırsan, birini yaralarsan ya da akşam dışarıda kalırsan yeri eşer (0.8 sn uyarı) ve düz bir çizgide hücum eder. Yana kay. Hücum seni iter.',
  'Hooded desert raiders with blaster carbines. They raise the gun for a moment before every shot, keep their distance and call the whole camp when they see you. Break line of sight, then close in. They drop blaster cells and, rarely, a Plasma Blade.':
    'Blaster karabinalı kapüşonlu çöl yağmacıları. Her atıştan önce silahı bir an kaldırırlar, mesafelerini korurlar ve seni görünce bütün kampı çağırırlar. Görüşü kes, sonra yaklaş. Blaster hücresi ve nadiren Plazma Kılıcı düşürürler.',
  'Patrons and bartender of the outpost. They mind their own business. Leave them alone: hit one and the whole bar remembers.':
    'Karakolun müşterileri ve barmeni. Kendi işlerine bakarlar. Onlara dokunma: birine vurursan bütün bar hatırlar.',
  'Lean pack hunters that come out with the dusk. Herd animals by day, killers after dark: watch the ridge line for pale eyes and keep your back to a wall.':
    'Alacakaranlıkla çıkan cılız sürü avcıları. Gündüz sürü hayvanı, karanlıktan sonra katil: tepe çizgisinde soluk gözlere dikkat et ve sırtını bir duvara yasla.',
  'Hunts by footsteps: crouch and walk. When it erupts you have 3.5 s to hit it.': 'Ayak seslerinden avlanır: eğil ve yürü. Patlayarak çıktığında ona vurmak için 3.5 sn\'n var.',
  'Peaceful until provoked or after dark. Sidestep the straight-line charge.': 'Kışkırtılana ya da akşama kadar huzurlu. Düz çizgideki hücumdan yana kay.',
  'Raises its gun for a moment before every shot. Break line of sight, then close in.': 'Her atıştan önce silahı bir an kaldırır. Görüşü kes, sonra yaklaş.',
  'Neutral. Leave the patrons alone or the whole bar fights back.': 'Tarafsız. Müşterilere dokunma, yoksa bütün bar karşılık verir.',
  'Pack hunters after dusk. Keep your back to a wall.': 'Akşamdan sonra sürü avcıları. Sırtını bir duvara yasla.',
  // items
  'Maw Pearl': 'Ağız İncisi', 'Beast Tusk': 'Canavar Dişi', 'Plasma Blade': 'Plazma Kılıcı', 'Blaster Pistol': 'Blaster Tabanca', 'Blaster Cell': 'Blaster Hücresi',
  'A glassy pearl from a Dune Maw. Worth a fortune to the right buyer.': 'Bir Kum Ağzından çıkan camsı inci. Doğru alıcı için servet eder.',
  'A curved tusk. Heavy, but it sells.': 'Kavisli bir diş. Ağır ama satılır.',
  'A humming energy blade whose colour follows its tier. Hold RMB to block: blaster bolts are deflected back at the shooter. Fast 3-hit combo, wide parry window.':
    'Rengi kademesine göre değişen vınlayan bir enerji kılıcı. Sağ tık basılı tut: blaster atışları atan kişiye geri yansır. Hızlı 3 vuruşluk kombo, geniş karşılama penceresi.',
  'Sidearm of the desert scavengers. Red bolts, 10 shots per cell. R reloads from a Blaster Cell in your slots.': 'Çöl yağmacılarının yan silahı. Kırmızı atışlar, hücre başına 10 mermi. R ile envanterindeki Blaster Hücresinden doldurursun.',
  '30 shots for the Blaster Pistol.': 'Blaster Tabanca için 30 atış.',
  // moons / biomes
  '1991-Runet Panelka': '1991-Runet Panelka', 'Panelka': 'Panelka', 'A2-Binary Dunes': 'A2-İkili Kumullar', 'Binary': 'İkili',
  'Panelka District': 'Panelka Mahallesi', 'Twin-Sun Dust Sea': 'İkiz Güneş Toz Denizi',
  'A grey district of brutalist panel blocks, rusted playgrounds and propaganda billboards, buried in snow and fog. Enter the stairwells for loot. Armed squads RAID your position every few minutes.':
    'Kar ve sis altında gri bir brütalist panel blok mahallesi: paslı oyun parkları ve propaganda panoları. Ganimet için merdiven boşluklarına gir. Silahlı ekipler birkaç dakikada bir konumuna BASKIN yapar.',
  'A desert under two suns, moisture-harvester towers on the ridges and a cantina outpost full of neutral aliens. Dune Maws burrow under the sand, Tusked Beasts graze in herds and hooded scavenger raiders roam. Bring a Plasma Blade.':
    'İki güneşli bir çöl; tepelerde nem toplayıcı kuleler ve tarafsız uzaylılarla dolu bir kantin karakolu. Kum Ağızları kumun altında kazar, Dişli Canavarlar sürü halinde otlar, kapüşonlu yağmacılar dolaşır. Yanına bir Plazma Kılıcı al.',
  'A grey district of brutalist panel blocks in the snow. Enter the stairwells; squads raid you.': 'Karda gri bir brütalist panel blok mahallesi. Merdiven boşluklarına gir; ekipler sana baskın yapar.',
  'Khrushchyovka ruins, rusted playgrounds, propaganda billboards. The fog never lifts.': 'Hruşçovka harabeleri, paslı oyun parkları, propaganda panoları. Sis hiç dağılmaz.',
  'A desert under two suns: moisture towers, a cantina outpost, things that burrow.': 'İki güneşli bir çöl: nem kuleleri, bir kantin karakolu, kazan yaratıklar.',
  'Binary dunes. Heat shimmer, twin shadows, hooded scavengers.': 'İkili kumullar. Sıcak titreşimi, çift gölge, kapüşonlu yağmacılar.',
  // hud / messages
  'RAID INBOUND': 'BASKIN GELİYOR', 'Armed squad approaching your position!': 'Silahlı ekip konumuna yaklaşıyor!', 'RAID!': 'BASKIN!', '{n} hostiles on your position': 'konumunda {n} düşman',
  'FACILITY DECAY': 'TESİS ÇÜRÜYOR', 'Uncollected loot lost {p}% of its value ({left}% left). Get it to the ship.': 'Toplanmamış ganimet değerinin %{p} kadarını kaybetti (%{left} kaldı). Gemiye taşı.',
  'FACILITY LOCKDOWN': 'TESİS KARANTİNADA', 'Blast doors are sealing. Get out or hold on.': 'Blast kapıları kapanıyor. Çık ya da dayan.',
  'Something howls in the dusk.': 'Alacakaranlıkta bir şey uluyor.',
  'Day {d}: the sector is getting harder (+{p}% creatures).': '{d}. gün: sektör zorlaşıyor (%{p} daha fazla yaratık).',
  'LOOT VALUE': 'GANİMET DEĞERİ', 'next drop': 'sonraki düşüş', 'decay starts': 'çürüme başlıyor', 'lockdown': 'karantina', 'DEFLECTED': 'YANSITILDI',
  'Buy me a drink, smuggler.': 'Bana bir içki ısmarla, kaçakçı.', 'No blasters at the bar!': 'Barda blaster yok!', 'Two suns, one thirst.': 'İki güneş, tek susuzluk.', 'Heard the dunes are moving again.': 'Kumulların yine kıpırdadığını duydum.',
  'Nothing personal, just business.': 'Kişisel değil, sadece iş.', 'Sand gets everywhere.': 'Kum her yere giriyor.', 'Bzzzt - the quota is a state secret.': 'Bzzzt - kota bir devlet sırrı.', 'You look like a Lurker. Sit down.': 'Bir Sinsi gibisin. Otur.',
  'The Maw does not like loud boots.': 'Ağız gürültülü botlardan hoşlanmaz.', 'Careful, friend. Careful.': 'Dikkat et dostum. Dikkat.',
};

export const RU = {
  'Dune Maw': 'Пасть Дюн', 'Tusked Beast': 'Клыкастый зверь', 'Scavenger Raider': 'Рейдер-мародёр', 'Cantina Alien': 'Пришелец из кантины', 'Dusk Prowler': 'Сумеречный охотник',
  'was swallowed by a Dune Maw.': 'был проглочен Пастью Дюн.', 'was trampled by a Tusked Beast.': 'был растоптан клыкастым зверем.', 'was shot by a hooded scavenger.': 'был застрелен мародёром в капюшоне.',
  'was thrown out of the cantina.': 'был выброшен из кантины.', 'was run down by Dusk Prowlers.': 'был загнан сумеречными охотниками.',
  'A burrower that hunts by vibration. When the sand starts to rumble under your boots, stop running in a straight line: it erupts 0.85 s after it reaches you. Crouch and walk to stay quiet. After the bite it lies exposed for a few seconds: that is your window.':
    'Роющее существо, охотится по вибрации. Когда песок начинает гудеть под ногами, не беги по прямой: оно вырывается через 0,85 с после того, как доберётся до тебя. Присядь и иди тихо. После укуса оно несколько секунд открыто: бей.',
  'Peaceful herd animals... by day, and if you keep your distance. Approach too long, hurt one, or stay out after dark and it paws the ground (a 0.8 s warning) and charges in a straight line. Sidestep. The charge shoves you.':
    'Мирные стадные животные... днём и пока держишь дистанцию. Подойдёшь слишком близко, ранишь одного или останешься снаружи после заката — он роет землю (предупреждение 0,8 с) и мчится по прямой. Уйди в сторону. Удар отбрасывает.',
  'Hooded desert raiders with blaster carbines. They raise the gun for a moment before every shot, keep their distance and call the whole camp when they see you. Break line of sight, then close in. They drop blaster cells and, rarely, a Plasma Blade.':
    'Пустынные рейдеры в капюшонах с бластерными карабинами. Перед каждым выстрелом на миг поднимают оружие, держат дистанцию и зовут весь лагерь. Разорви линию огня, потом сближайся. Роняют бластерные ячейки и, редко, Плазменный клинок.',
  'Patrons and bartender of the outpost. They mind their own business. Leave them alone: hit one and the whole bar remembers.':
    'Посетители и бармен форпоста. Занимаются своими делами. Не трогай их: ударишь одного — запомнит весь бар.',
  'Lean pack hunters that come out with the dusk. Herd animals by day, killers after dark: watch the ridge line for pale eyes and keep your back to a wall.':
    'Поджарые стайные охотники, выходят с сумерками. Днём — стадные, после заката — убийцы: следи за гребнем — там бледные глаза, и держись спиной к стене.',
  'Hunts by footsteps: crouch and walk. When it erupts you have 3.5 s to hit it.': 'Охотится по шагам: присядь и иди тихо. Когда оно вырывается, у тебя 3,5 с, чтобы ударить.',
  'Peaceful until provoked or after dark. Sidestep the straight-line charge.': 'Мирный, пока не тронешь, и до заката. Уйди в сторону от рывка по прямой.',
  'Raises its gun for a moment before every shot. Break line of sight, then close in.': 'Перед каждым выстрелом на миг поднимает оружие. Разорви линию огня, потом сближайся.',
  'Neutral. Leave the patrons alone or the whole bar fights back.': 'Нейтрален. Не трогай посетителей, иначе весь бар ответит.',
  'Pack hunters after dusk. Keep your back to a wall.': 'Стайные охотники после заката. Держись спиной к стене.',
  'Maw Pearl': 'Жемчужина Пасти', 'Beast Tusk': 'Клык зверя', 'Plasma Blade': 'Плазменный клинок', 'Blaster Pistol': 'Бластерный пистолет', 'Blaster Cell': 'Бластерная ячейка',
  'A glassy pearl from a Dune Maw. Worth a fortune to the right buyer.': 'Стеклянная жемчужина из Пасти Дюн. Правильному покупателю — целое состояние.',
  'A curved tusk. Heavy, but it sells.': 'Изогнутый клык. Тяжёлый, но продаётся.',
  'A humming energy blade whose colour follows its tier. Hold RMB to block: blaster bolts are deflected back at the shooter. Fast 3-hit combo, wide parry window.':
    'Гудящий энергетический клинок, цвет зависит от редкости. Зажми ПКМ — блок: бластерные выстрелы отражаются в стрелка. Быстрая комбинация из 3 ударов, широкое окно парирования.',
  'Sidearm of the desert scavengers. Red bolts, 10 shots per cell. R reloads from a Blaster Cell in your slots.': 'Личное оружие пустынных мародёров. Красные заряды, 10 выстрелов на ячейку. R — перезарядка из Бластерной ячейки в слотах.',
  '30 shots for the Blaster Pistol.': '30 выстрелов для бластерного пистолета.',
  '1991-Runet Panelka': '1991-Рунет Панелька', 'Panelka': 'Панелька', 'A2-Binary Dunes': 'A2-Двойные Дюны', 'Binary': 'Двойные',
  'Panelka District': 'Район Панелек', 'Twin-Sun Dust Sea': 'Пыльное море двух солнц',
  'A grey district of brutalist panel blocks, rusted playgrounds and propaganda billboards, buried in snow and fog. Enter the stairwells for loot. Armed squads RAID your position every few minutes.':
    'Серый район брутальных панельных домов, ржавых площадок и пропагандистских плакатов под снегом и туманом. Заходи в подъезды за добычей. Вооружённые отряды устраивают РЕЙД на твою позицию каждые несколько минут.',
  'A desert under two suns, moisture-harvester towers on the ridges and a cantina outpost full of neutral aliens. Dune Maws burrow under the sand, Tusked Beasts graze in herds and hooded scavenger raiders roam. Bring a Plasma Blade.':
    'Пустыня под двумя солнцами, башни-влагосборники на гребнях и форпост-кантина с нейтральными пришельцами. Пасти Дюн роют под песком, клыкастые звери пасутся стадами, бродят мародёры в капюшонах. Возьми Плазменный клинок.',
  'A grey district of brutalist panel blocks in the snow. Enter the stairwells; squads raid you.': 'Серый район брутальных панелек в снегу. Заходи в подъезды; отряды устраивают рейды.',
  'Khrushchyovka ruins, rusted playgrounds, propaganda billboards. The fog never lifts.': 'Руины хрущёвок, ржавые площадки, пропагандистские плакаты. Туман не рассеивается.',
  'A desert under two suns: moisture towers, a cantina outpost, things that burrow.': 'Пустыня под двумя солнцами: башни влаги, кантина, роющие твари.',
  'Binary dunes. Heat shimmer, twin shadows, hooded scavengers.': 'Двойные дюны. Марево, две тени, мародёры в капюшонах.',
  'RAID INBOUND': 'РЕЙД БЛИЗКО', 'Armed squad approaching your position!': 'Вооружённый отряд приближается к вашей позиции!', 'RAID!': 'РЕЙД!', '{n} hostiles on your position': '{n} врагов на вашей позиции',
  'FACILITY DECAY': 'ОБЪЕКТ РАЗРУШАЕТСЯ', 'Uncollected loot lost {p}% of its value ({left}% left). Get it to the ship.': 'Непогруженная добыча потеряла {p}% стоимости (осталось {left}%). Тащи на корабль.',
  'FACILITY LOCKDOWN': 'ЛОКДАУН ОБЪЕКТА', 'Blast doors are sealing. Get out or hold on.': 'Гермозатворы закрываются. Выбирайся или держись.',
  'Something howls in the dusk.': 'Что-то воет в сумерках.',
  'Day {d}: the sector is getting harder (+{p}% creatures).': 'День {d}: сектор становится опаснее (+{p}% существ).',
  'LOOT VALUE': 'ЦЕНА ДОБЫЧИ', 'next drop': 'след. падение', 'decay starts': 'распад с', 'lockdown': 'локдаун', 'DEFLECTED': 'ОТРАЖЕНО',
  'Buy me a drink, smuggler.': 'Угости выпивкой, контрабандист.', 'No blasters at the bar!': 'У стойки без бластеров!', 'Two suns, one thirst.': 'Два солнца, одна жажда.', 'Heard the dunes are moving again.': 'Говорят, дюны снова движутся.',
  'Nothing personal, just business.': 'Ничего личного, просто бизнес.', 'Sand gets everywhere.': 'Песок лезет повсюду.', 'Bzzzt - the quota is a state secret.': 'Бззт — квота это государственная тайна.', 'You look like a Lurker. Sit down.': 'Ты похож на Лурка. Садись.',
  'The Maw does not like loud boots.': 'Пасть не любит громких сапог.', 'Careful, friend. Careful.': 'Осторожно, друг. Осторожно.',
};
void NPC_LINES;
