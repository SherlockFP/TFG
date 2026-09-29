// CREATURE DIRECTOR strings. One first-encounter line per creature: "NAME - rule" (English keys, TR + RU below). Unknown / modded creatures
// fall back to '{name} - {rule}' built from the first sentence of their lore.
import { addTranslations } from '../core/i18n.js';

/** [English line, TR, RU] per creature id */
export const RULE_LINES = {
  scuttler: ['SPAM BOTS — they swarm and run you down. Fight in a doorway.', 'SPAM BOTLARI — sürü halinde koşup seni yakalar. Kapı aralığında savaş.', 'СПАМ-БОТЫ — налетают стаей. Дерись в дверном проёме.'],
  yoinker: ['DATA HOARDER — harmless until you touch its nest. Leave its stash alone.', 'VERİ TOPLAYICI — yuvasına dokunmadıkça zararsız. Yığınına dokunma.', 'СБОРЩИК ДАННЫХ — безобиден, пока не тронешь его гнездо.'],
  crawler: ['WEB CRAWLER — fast, but only in straight lines. Sidestep at the last second.', 'WEB TARAYICI — hızlı ama yalnızca düz çizgide. Son anda yana kay.', 'ВЕБ-КРАУЛЕР — быстрый, но только по прямой. Уклонись в последний миг.'],
  lurker: ['LURKER — it stalks from behind. Keep it in sight, but do not stare.', 'LURKER — arkandan sinsice yaklaşır. Gözünü ayırma ama dik dik bakma.', 'ЛУРКЕР — крадётся сзади. Держи в поле зрения, но не пялься.'],
  mannequin: ['NPC — it only moves when nobody looks. Keep your eyes on it.', 'NPC — kimse bakmazken hareket eder. Gözünü üzerinden ayırma.', 'NPC — двигается, только когда никто не смотрит. Не отводи глаз.'],
  sludge: ['AI SLOP — slow and unkillable. Just walk away.', 'YZ ÇÖPÜ — yavaş ve öldürülemez. Sadece uzaklaş.', 'ИИ-ПОМОИ — медленные и бессмертные. Просто уходи.'],
  jester: ['POP-UP — when the jingle starts, leave the building.', 'POP-UP — melodi başlayınca binayı terk et.', 'ПОП-АП — когда заиграет мелодия, беги из здания.'],
  spider: ['WEB SPIDER — it waits behind its webs. A torn web wakes it.', 'ÖRÜMCEK — ağlarının ardında bekler. Yırtılan ağ onu uyandırır.', 'ПАУК — ждёт за паутиной. Порванная паутина будит его.'],
  leech: ['LEECHER — it drops from the ceiling. Look up, shake it off.', 'SÜLÜK — tavandan düşer. Yukarıyı kolla, üzerinden at.', 'ПИЯВКА — падает с потолка. Смотри вверх, сбрось её.'],
  screamer: ['SCREAMER — nearly invisible in the dark. Light it up; its scream stuns.', 'ÇIĞLIK — karanlıkta neredeyse görünmez. Işık tut; çığlığı sersemletir.', 'КРИКУН — почти невидим в темноте. Посвети; его крик оглушает.'],
  mimic: ['DEEPFAKE — it wears a crewmate\'s face. If they do not answer, run.', 'DEEPFAKE — mürettebat üyesinin yüzünü takar. Cevap vermiyorsa kaç.', 'ДИПФЕЙК — носит лицо напарника. Если «он» молчит — беги.'],
  hound: ['TROLL — blind, hunts by sound. Crouch and stay quiet.', 'TROL — kör, sesle avlanır. Çömel ve sessiz kal.', 'ТРОЛЛЬ — слеп, охотится на звук. Пригнись и молчи.'],
  giant: ['INFLUENCER — it hunts by sight. Break line of sight.', 'FENOMEN — görerek avlanır. Görüş hattını kes.', 'ИНФЛЮЕНСЕР — охотится на зрение. Разорви линию видимости.'],
  sandkefal: ['THE WORM — when the ground rumbles, move.', 'SOLUCAN — zemin gümbürdediğinde kaç.', 'ЧЕРВЬ — когда дрожит земля, беги.'],
  moderator: ['THE MODERATOR — freeze while its eye glows green.', 'MODERATÖR — gözü yeşil yanarken donup kal.', 'МОДЕРАТОР — замри, пока его глаз горит зелёным.'],
  support: ['CUSTOMER SUPPORT — it only hurts people who are alone. Stay in a group.', 'MÜŞTERİ HİZMETLERİ — yalnızca yalnız olanlara zarar verir. Grup halinde kal.', 'ПОДДЕРЖКА — вредит только одиночкам. Держись группой.'],
  editor: ['THE EDITOR — it only moves on the beat. Keep your distance.', 'EDİTÖR — yalnızca ritimle hareket eder. Mesafeni koru.', 'РЕДАКТОР — двигается только в такт. Держи дистанцию.'],
  tamagotchi: ['TAMAGOTCHI — crouch beside it to rock it. Neglect makes it grow.', 'TAMAGOTCHI — yanına çömelip salla. İhmal edersen büyür.', 'ТАМАГОЧИ — присядь рядом и укачай. Забросишь — вырастет.'],
  stalker: ['PARASOCIAL — only you can see it. Break line of sight.', 'PARASOSYAL — yalnızca sen görürsün. Görüş hattını kes.', 'ПАРАСОЦИАЛ — видишь его только ты. Разорви линию видимости.'],
  clickbait: ['CLICKBAIT — it picks off stragglers. Travel in pairs.', 'TIKLAMA TUZAĞI — geride kalanları kapar. İkili gezin.', 'КЛИКБЕЙТ — выхватывает отставших. Ходите парами.'],
  replyguy: ['REPLY GUY — brave in a flock, a coward alone. Stand your ground.', 'CEVAPÇI — sürüde cesur, yalnızken korkak. Yılma, vur.', 'РЕПЛАЙ-ГАЙ — смел в стае, трус в одиночку. Не отступай.'],
  listener: ['THE LISTENER — it hunts sound. Stand still.', 'DİNLEYİCİ — sesle avlanır. Kıpırdama.', 'СЛУШАТЕЛЬ — охотится на звук. Замри.'],
  cd_dimmer: ['THE DIMMER — it eats light. Throw a glowstick away, kill your torch.', 'SÖNDÜRÜCÜ — ışığı yer. Bir ışık çubuğunu uzağa at, fenerini kapat.', 'ГАСИТЕЛЬ — пожирает свет. Брось световую палочку подальше, выключи фонарь.'],
  cd_follower: ['THE FOLLOWER — it moves only while you look at it. Look away.', 'TAKİPÇİ — yalnızca sen bakarken hareket eder. Başka yöne bak.', 'ПОДПИСЧИК — двигается, только пока на него смотрят. Отвернись.'],
  cd_auditor: ['THE AUDITOR — it hunts whoever carries the most scrap. Drop it or reach the ship.', 'DENETÇİ — en çok hurda taşıyanı avlar. Bırak ya da gemiye ulaş.', 'АУДИТОР — идёт за тем, кто несёт больше всего хлама. Брось его или добеги до корабля.'],
};

const tr = {
  '{name} — {rule}': '{name} — {rule}',
  'TRAFFIC SPIKE — something is coming.': 'TRAFİK ARTIŞI — bir şey geliyor.',
  'PEAK TRAFFIC — hold your ground.': 'YOĞUN TRAFİK — yerini koru.',
  'The static settles. Breathe.': 'Parazit yatışıyor. Nefes al.',
  'It ate the light. Wait...': 'Işığı yedi. Bekle...',
  'AUDITED — you dropped your best item.': 'DENETLENDİN — en değerli eşyanı düşürdün.',
  // creature names / lore of the three new creatures (registerCreature localises name + lore)
  'The Dimmer': 'Söndürücü', 'The Follower': 'Takipçi', 'The Auditor': 'Denetçi',
  'It eats light. It hunts flashlights and glowsticks, and prefers the glowstick. Throw one far away, kill your torch and walk off. In the dark it ignores you.':
    'Işığı yer. El fenerlerini ve ışık çubuklarını avlar, çubuğu tercih eder. Birini uzağa fırlat, fenerini söndür ve uzaklaş. Karanlıkta seni umursamaz.',
  'It only moves while somebody is looking at it. Look away and it freezes. A camera flash freezes it too. Do not stare, and do not stay within arm\'s reach.':
    'Yalnızca biri ona bakarken hareket eder. Başka yöne bak, donar. Kamera flaşı da onu dondurur. Dik dik bakma ve kol boyu mesafede durma.',
  'It smells value and follows whoever carries the most scrap at a steady walk. Its hit makes you drop your best item. Drop the loot, hand it off, or get to the ship.':
    'Değeri koklar ve en çok hurda taşıyanı sabit bir yürüyüşle takip eder. Vuruşu en değerli eşyanı düşürtür. Ganimeti bırak, birine devret ya da gemiye ulaş.',
  'was left in the dark by The Dimmer.': 'Söndürücü yüzünden karanlıkta kaldı.',
  'stared at The Follower for too long.': 'Takipçi\'ye çok uzun baktı.',
  'failed an audit by The Auditor.': 'Denetçi\'nin denetiminden geçemedi.',
};
const ru = {
  '{name} — {rule}': '{name} — {rule}',
  'TRAFFIC SPIKE — something is coming.': 'ВСПЛЕСК ТРАФИКА — что-то приближается.',
  'PEAK TRAFFIC — hold your ground.': 'ПИК ТРАФИКА — держитесь.',
  'The static settles. Breathe.': 'Помехи стихают. Выдохни.',
  'It ate the light. Wait...': 'Он съел свет. Подожди...',
  'AUDITED — you dropped your best item.': 'АУДИТ — ты уронил лучшую вещь.',
  'The Dimmer': 'Гаситель', 'The Follower': 'Подписчик', 'The Auditor': 'Аудитор',
  'It eats light. It hunts flashlights and glowsticks, and prefers the glowstick. Throw one far away, kill your torch and walk off. In the dark it ignores you.':
    'Пожирает свет. Охотится на фонари и световые палочки, палочку предпочитает. Брось одну подальше, выключи фонарь и уходи. В темноте он тебя не замечает.',
  'It only moves while somebody is looking at it. Look away and it freezes. A camera flash freezes it too. Do not stare, and do not stay within arm\'s reach.':
    'Двигается, только пока на него смотрят. Отвернись — замрёт. Вспышка камеры тоже его замораживает. Не пялься и не стой на расстоянии вытянутой руки.',
  'It smells value and follows whoever carries the most scrap at a steady walk. Its hit makes you drop your best item. Drop the loot, hand it off, or get to the ship.':
    'Чует ценности и ровным шагом идёт за тем, кто несёт больше всего хлама. Его удар заставляет выронить лучшую вещь. Брось добычу, передай напарнику или добеги до корабля.',
  'was left in the dark by The Dimmer.': 'остался в темноте из-за Гасителя.',
  'stared at The Follower for too long.': 'слишком долго смотрел на Подписчика.',
  'failed an audit by The Auditor.': 'не прошёл проверку Аудитора.',
};
for (const [en, a, b] of Object.values(RULE_LINES)) { tr[en] = a; ru[en] = b; }
addTranslations(tr, 'tr');
addTranslations(ru, 'ru');
