// MMO-style achievements, titles and a daily login streak (personal progression, local only).
//
// installAchievements(game) observes the game WITHOUT editing other systems:
//   * mod events: 'phase' (landing/moon/company/fired) and 'update' (hp sampling + 2 s check tick)
//   * wrapped Progress methods: kill, fish, arcade, addCoins, bountyEvent, onDeath
//   * wrapped Game methods: onReward (quota met), openMinigame (slot machine spins / jackpot),
//     onItemHeld + setPower (the local player pulling a reactor core out of its socket)
// Profile fields it owns: profile.achievements = { [id]: { at } }, profile.titles = [..], profile.title,
// profile.login = { day, streak, best, total }, profile.achievementsSeeded, plus extra counters in profile.stats
// (it is also the only writer of the pre-existing stats.quotasMet / stats.sold / stats.scrapCollected).
// Nothing here is shared state: every peer evaluates its own achievements (no net traffic besides the
// title in 'pinfo', no RNG).
import { CREATURES } from './creatures.js';
import { MOONS } from './moons.js';
import { MARKET, MAX_LEVEL, REBIRTH_LEVEL, prestigeStars, MASTERY, masteryRank } from './progression.js';
import { SUIT_COLORS, HATS } from '../models/avatar.js';
import { saveProfile } from '../core/save.js';
import { getLang, t } from '../core/i18n.js';
import { glyphFromEmoji } from '../ui/glyphs.js';   // wave 8: pictograms instead of colour emoji

const DAY_MS = 86400000;
const CHECK_INTERVAL = 2;      // seconds between achievement evaluations
const START_DELAY = 3;         // seconds of a running session before the first evaluation / daily login
const BANNER_MS = 4000;
const MAX_QUEUE = 8;
const REACTOR_WINDOW_MS = 3000; // pick of the reactor -> facility power-off must land within this window

/** UTC day number (same convention as the bounty board). */
export const utcDay = (ms = Date.now()) => Math.floor(ms / DAY_MS);

export const TIERS = {
  bronze: { name: 'Bronze', tr: 'Bronz', color: '#d08a4a', xp: 100, coin: 25 },
  silver: { name: 'Silver', tr: 'Gümüş', color: '#cfd6de', xp: 300, coin: 80 },
  gold: { name: 'Gold', tr: 'Altın', color: '#ffd23f', xp: 800, coin: 250 },
  kefal: { name: 'Viral', tr: 'Viral', color: '#7ff0ff', xp: 2000, coin: 750 },
};

// Fixed id lists (not live registries) so bosses / mod creatures / mod moons never make these unreachable.
const KILLABLE = ['scuttler', 'yoinker', 'crawler', 'lurker', 'spider', 'leech', 'screamer', 'mimic', 'hound', 'giant'].filter((id) => CREATURES[id]);
const BESTIARY = ['scuttler', 'yoinker', 'crawler', 'lurker', 'mannequin', 'sludge', 'jester', 'spider', 'leech', 'screamer', 'mimic', 'hound', 'giant', 'sandkefal', 'turret', 'mine'].filter((id) => CREATURES[id]);
const BASE_MOONS = ['hq', 'hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'].filter((id) => MOONS[id]);
const MARKET_WEAPONS = MARKET.weapons.map((w) => w.id);
// every 7th login day hands out one of these (buyable) cosmetics until all are owned, then big coins
const DAILY_COSMETICS = ['hat:cone', 'suit:purple', 'hat:bunny', 'suit:yellow', 'hat:headphones', 'suit:camo', 'hat:tophat', 'suit:black', 'hat:propeller', 'suit:white', 'hat:chef', 'suit:pink'];
// numeric counters kept in profile.stats (the first block already exists in save.js defaults)
const NUM_STATS = ['kills', 'deaths', 'quotasMet', 'scrapCollected', 'sold', 'fish', 'days', 'bestArcade',
  'creatureKills', 'scrapSecured', 'vaults', 'fuses', 'jackpots', 'bigWins', 'slotSpins', 'shinyFish', 'flawlessDays',
  'closeShaves', 'fired', 'reactors', 'daysSurvived', 'coinsEarned', 'maxCrew', 'arcadePlays'];
// event types recorded automatically by the wrappers above; the public onEvent() refuses them (no double counting)
const AUTO_EVENTS = new Set(['kill', 'levelUp', 'arcade', 'fish', 'coins', 'scrap', 'sell', 'vault', 'fuse', 'quotaMet',
  'fired', 'jackpot', 'slotSpin', 'reactor', 'death', 'surviveDay', 'moon', 'crew']);

const TR_UI = {
  'ACHIEVEMENTS': 'BAŞARIMLAR', 'ACHIEVEMENT UNLOCKED': 'BAŞARIM AÇILDI', 'ACHIEVEMENTS UNLOCKED': 'BAŞARIMLAR AÇILDI',
  'DAILY LOGIN BONUS': 'GÜNLÜK GİRİŞ ÖDÜLÜ', 'Title (shown on your name tag)': 'Unvan (isim etiketinde görünür)', 'None': 'Yok',
  'Login streak': 'Giriş serisi', 'best': 'en iyi', 'All': 'Tümü', 'Unlocked': 'Açık', 'Locked': 'Kilitli', 'Unlocked on': 'Açıldı',
  'Day': 'Gün', 'streak!': 'seri!', 'Come back tomorrow to keep the streak going.': 'Seriyi sürdürmek için yarın yine gel.',
  'Weekly bonus!': 'Haftalık ödül!', 'Next weekly bonus in': 'Haftalık ödüle kalan', 'days': 'gün', 'Title': 'Unvan',
  'Unlock achievements to earn titles.': 'Unvan kazanmak için başarımları aç.', 'Unlocked from your service record': 'Hizmet kaydından açıldı',
  'achievement': 'başarım', 'achievements': 'başarım',
};
const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const L = (s) => (tr() && TR_UI[s]) || (tr() ? s : t(s));   // TR: local table; RU: dictionary (src/i18n/ru_ach.js)

// ------------------------------------------------------------------ definitions
const st = (p) => p.stats || {};
const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const counter = (get, target) => ({ check: (p) => get(p) >= target, progress: (p) => [Math.min(get(p), target), target] });
/** A kill that counts for the kill achievements: a real creature, not a hazard (webs, fake doors, turrets, mines). */
const isCreatureKill = (type) => !!CREATURES[type] && !CREATURES[type].hazard;
const creatureKills = (p) => n(st(p).creatureKills);
const killedTypes = (p) => KILLABLE.filter((t) => n(p.bestiary?.[t]?.kills) > 0).length;
const seenTypes = (p) => BESTIARY.filter((t) => p.bestiary?.[t]?.seen).length;
const nemesisMax = (p) => {
  let m = 0;
  for (const [cause, c] of Object.entries(st(p).deathsBy || {})) if (CREATURES[cause] || cause === 'scream') m = Math.max(m, n(c));
  return m;
};
const moonsVisited = (p) => BASE_MOONS.filter((id) => (st(p).moonsVisited || []).includes(id)).length;
const weaponsOwned = (p) => MARKET_WEAPONS.filter((id) => (p.owned || []).includes(id)).length;

function A(id, icon, tier, name, desc, trText, logic, reward = {}) {
  const t = TIERS[tier];
  return { id, icon, tier, name, desc, tr: trText, reward: { xp: t.xp, coin: t.coin, ...reward }, check: logic.check, progress: logic.progress || null };
}

export const ACHIEVEMENTS = [
  // --- combat (kill counters ignore hazards: breaking webs or fake doors is not a kill)
  A('first_blood', '🗡️', 'bronze', 'First Blood', 'Kill your first creature.', ['İlk Kan', 'İlk yaratığını öldür.'], counter(creatureKills, 1)),
  A('exterminator', '🪳', 'bronze', 'Exterminator', 'Kill 10 creatures.', ['Böcek İlacı', '10 yaratık öldür.'], counter(creatureKills, 10)),
  A('pest_control', '💀', 'silver', 'Pest Control', 'Kill 100 creatures.', ['İlaçlama Ekibi', '100 yaratık öldür.'], counter(creatureKills, 100), { title: 'Pest Control' }),
  A('kefal_reaper', '☠️', 'gold', 'Ban Wave', 'Kill 500 creatures.', ['Ban Dalgası', '500 yaratık öldür.'], counter(creatureKills, 500), { title: 'The Reaper', cosmetic: 'hat:horns' }),
  A('monster_hunter', '🎯', 'gold', 'Monster Hunter', 'Kill every killable creature type at least once.', ['Canavar Avcısı', 'Öldürülebilen her yaratık türünden en az birini öldür.'], counter(killedTypes, KILLABLE.length), { title: 'Monster Hunter' }),
  A('giant_slayer', '🦶', 'gold', 'Giant Slayer', 'Bring down a Giant.', ['Dev Avcısı', 'Bir Dev\'i yere ser.'], counter((p) => n(p.bestiary?.giant?.kills), 1), { title: 'Giant Slayer' }),
  A('zoologist', '📖', 'silver', 'Zoologist', 'Fill in every bestiary entry.', ['Zoolog', 'Canavar ansiklopedisindeki her kaydı doldur.'], counter(seenTypes, BESTIARY.length), { title: 'Zoologist' }),
  // --- scrap & economy
  A('first_scrap', '🔩', 'bronze', 'Company Property', 'Secure your first piece of scrap on the ship.', ['Şirket Malı', 'İlk hurdanı gemiye güvenle getir.'], counter((p) => n(st(p).scrapSecured), 1)),
  A('packrat', '📦', 'silver', 'Packrat', 'Secure ▮5,000 worth of scrap on the ship.', ['İstifçi', 'Gemiye ▮5.000 değerinde hurda getir.'], counter((p) => n(st(p).scrapCollected), 5000), { title: 'Packrat' }),
  A('sell_1k', '💰', 'bronze', 'Small Business', 'Sell ▮1,000 of scrap with your crew.', ['Küçük İşletme', 'Ekibinle ▮1.000 değerinde hurda sat.'], counter((p) => n(st(p).sold), 1000)),
  A('sell_10k', '💵', 'silver', 'Middle Management', 'Sell ▮10,000 of scrap.', ['Orta Kademe Yönetici', '▮10.000 değerinde hurda sat.'], counter((p) => n(st(p).sold), 10000)),
  A('sell_100k', '🏦', 'gold', 'Shareholder Value', 'Sell ▮100,000 of scrap.', ['Hissedar Değeri', '▮100.000 değerinde hurda sat.'], counter((p) => n(st(p).sold), 100000), { title: 'Tycoon', cosmetic: 'suit:red' }),
  A('quota_1', '📈', 'bronze', 'Quota Is Love', 'Meet your first quota.', ['Kota Aşktır', 'İlk kotanı doldur.'], counter((p) => n(st(p).quotasMet), 1)),
  A('quota_5', '📊', 'silver', 'Team Player', 'Meet 5 quotas.', ['Takım Oyuncusu', '5 kota doldur.'], counter((p) => n(st(p).quotasMet), 5), { title: 'Team Player' }),
  A('quota_10', '🏅', 'gold', 'Employee of the Month', 'Meet 10 quotas.', ['Ayın Çalışanı', '10 kota doldur.'], counter((p) => n(st(p).quotasMet), 10), { title: 'Employee of the Month' }),
  A('tycoon', '🪙', 'gold', 'Clout Chaser', 'Earn ◈10,000 Clout in total.', ['Clout Avcısı', 'Toplam ◈10.000 Clout kazan.'], counter((p) => n(st(p).coinsEarned), 10000), { title: 'Clout Chaser' }),
  A('arsenal', '🔫', 'silver', 'Arsenal', 'Own 3 Black Market weapons.', ['Cephanelik', 'Karaborsadan 3 silah sahibi ol.'], counter(weaponsOwned, 3)),
  // --- survival & death
  A('untouchable', '😇', 'silver', 'Untouchable', 'Go inside a facility and survive the whole day without taking any damage.', ['Dokunulmaz', 'Tesise gir ve bütün günü hiç hasar almadan atlat.'], counter((p) => n(st(p).flawlessDays), 1), { title: 'Untouchable', cosmetic: 'hat:halo' }),
  A('close_shave', '🩹', 'silver', 'Close Shave', 'Survive a day after dropping below 10 HP.', ['Kıl Payı', '10 HP\'nin altına düştüğün bir günden sağ çık.'], counter((p) => n(st(p).closeShaves), 1), { title: 'Lucky Fish' }),
  A('veteran', '📅', 'silver', 'Seasoned Worker', 'Survive 25 days on the moons.', ['Pişkin İşçi', 'Aylarda 25 gün hayatta kal.'], counter((p) => n(st(p).daysSurvived), 25), { title: 'Veteran' }),
  A('first_death', '⚰️', 'bronze', 'Company Asset', 'Die for the first time. It happens.', ['Şirket Varlığı', 'İlk kez öl. Olur böyle şeyler.'], counter((p) => n(st(p).deaths), 1)),
  A('frequent_flyer', '👻', 'silver', 'Frequent Flyer', 'Die 50 times.', ['Müdavim Hayalet', '50 kez öl.'], counter((p) => n(st(p).deaths), 50), { title: 'Revenant' }),
  A('nemesis', '🍖', 'silver', 'Favourite Snack', 'Die 10 times to the same creature.', ['Favori Atıştırmalık', 'Aynı yaratığa 10 kez öl.'], counter(nemesisMax, 10), { title: 'Snack' }),
  A('left_behind', '🚀', 'bronze', 'Left Behind', 'Miss the ship at midnight.', ['Geride Kalan', 'Gece yarısı gemiyi kaçır.'], counter((p) => n(st(p).deathsBy?.left), 1), { title: 'Forgotten' }),
  A('pink_slip', '📄', 'bronze', 'Pink Slip', 'Get deplatformed by The Algorithm.', ['Kovuldun', 'Şirket tarafından kovul.'], counter((p) => n(st(p).fired), 1), { title: 'Unemployed' }),
  // --- minigames & activities
  A('angler', '🎣', 'bronze', 'Gone Fishing', 'Catch 10 fish.', ['Balığa Çıktım', '10 balık tut.'], counter((p) => n(st(p).fish), 10)),
  A('master_angler', '🐟', 'silver', 'Master Angler', 'Catch 50 fish.', ['Usta Balıkçı', '50 balık tut.'], counter((p) => n(st(p).fish), 50), { title: 'Angler' }),
  A('shiny_kefal', '✨', 'gold', 'Shiny!', 'Catch a Golden Phish.', ['Parlak!', 'Bir Altın Phish yakala.'], counter((p) => n(st(p).shinyFish), 1), { title: 'Shiny Hunter', cosmetic: 'suit:teal' }),
  A('jackpot', '🎰', 'gold', 'Jackpot!', 'Hit the slot machine jackpot at the HQ casino.', ['Büyük İkramiye!', 'Merkez kumarhanesinde slot jackpot\'unu vur.'], counter((p) => n(st(p).jackpots), 1), { title: 'High Roller', cosmetic: 'hat:party' }),
  A('safecracker', '🔐', 'silver', 'Safecracker', 'Crack 5 vaults.', ['Kasa Hırsızı', '5 kasa kır.'], counter((p) => n(st(p).vaults), 5), { title: 'Safecracker', cosmetic: 'suit:brown' }),
  A('electrician', '⚡', 'silver', 'Electrician', 'Repair 5 fuse boxes.', ['Elektrikçi', '5 sigorta kutusu tamir et.'], counter((p) => n(st(p).fuses), 5), { title: 'Electrician', cosmetic: 'hat:antenna' }),
  A('arcade_50', '🕹️', 'silver', 'Arcade Legend', 'Score 50 in FLAPPY PHISH.', ['Atari Efsanesi', 'FLAPPY PHISH\'ta 50 puan yap.'], counter((p) => n(st(p).bestArcade), 50), { title: 'Gamer' }),
  A('apparatus', '☢️', 'silver', 'Unplugged', 'Pull a facility\'s reactor core out of its socket.', ['Fişi Çekildi', 'Bir tesisin reaktör çekirdeğini yuvasından sök.'], counter((p) => n(st(p).reactors), 1)),
  // --- progression & social
  A('lv10', '🔟', 'bronze', 'Employee', 'Reach level 10.', ['Çalışan', '10. seviyeye ulaş.'], counter((p) => n(p.level), 10)),
  A('lv25', '🎖️', 'silver', 'Senior Staff', 'Reach level 25.', ['Kıdemli Kadro', '25. seviyeye ulaş.'], counter((p) => n(p.level), 25), { title: 'Senior Staff' }),
  // (was "reach the max level" while the cap was 50; the cap is now MAX_LEVEL, a Rebirth needs REBIRTH_LEVEL)
  A('lv50', '👑', 'kefal', 'Main Character', `Reach level ${REBIRTH_LEVEL} (or be reborn).`, ['Ana Karakter', `${REBIRTH_LEVEL}. seviyeye ulaş (ya da yeniden doğ).`], counter((p) => (prestigeStars(p) > 0 ? REBIRTH_LEVEL : n(p.level)), REBIRTH_LEVEL), { title: 'Living Legend' }),
  A('full_crew', '👥', 'bronze', 'Full Crew', 'Play in a crew of 4.', ['Tam Kadro', '4 kişilik bir ekiple oyna.'], counter((p) => n(st(p).maxCrew), 4)),
  A('explorer', '🪐', 'gold', 'Sector Explorer', 'Land on every moon in the sector.', ['Sektör Kaşifi', 'Sektördeki her aya iniş yap.'], counter(moonsVisited, BASE_MOONS.length), { title: 'Explorer' }),
  A('loyal', '🗓️', 'gold', 'Loyal Employee', 'Log in 7 days in a row.', ['Sadık Çalışan', '7 gün üst üste giriş yap.'], counter((p) => n(p.login?.best), 7), { title: 'Loyal' }),
];
// base set (snapshot before the meta achievement / registerAchievement additions)
const BASE_IDS = ACHIEVEMENTS.map((a) => a.id);
// Achievement-only gold suit (SUIT_COLORS entry added by the avatar.js hook). If that entry is missing the
// reward pays fallbackCoin instead, so this never grants an invisible cosmetic.
ACHIEVEMENTS.push(A('kefal_master', '🐠', 'kefal', 'TFG Legend', 'Unlock every other achievement.', ['TFG Efsanesi', 'Diğer tüm başarımları aç.'],
  counter((p) => BASE_IDS.filter((id) => p.achievements?.[id]).length, BASE_IDS.length), { xp: 5000, coin: 2000, title: 'Internet Legend', cosmetic: 'suit:gold', fallbackCoin: 3000 }));

// Meta-layer achievements (rebirth / codex / weekly / crew / mastery). Added after the BASE_IDS snapshot, so
// TFG Legend does not start requiring the long-tail goals; spliced before it so the meta achievement stays last.
const codexPct = (p) => n(p.codex?.pct);
const weeklyBest = (p) => { let m = 0; for (const v of Object.values(p.weekly?.best || {})) m = Math.max(m, n(v)); return m; };
const masteryMaxed = (p) => Object.keys(MASTERY).filter((id) => masteryRank(p, id) >= MASTERY[id].max).length;
ACHIEVEMENTS.splice(ACHIEVEMENTS.length - 1, 0,
  A('reborn_1', '🌟', 'gold', 'Reborn', 'Rebirth for the first time.', ['Yeniden Doğan', 'İlk kez yeniden doğ.'], counter(prestigeStars, 1)),
  A('reborn_5', '💫', 'kefal', 'Five-Star Poster', 'Earn 5 Rebirth stars.', ['Beş Yıldızlı', '5 Yeniden Doğuş yıldızı kazan.'], counter(prestigeStars, 5), { title: 'Five-Star Poster' }),
  A('lv75', '🛰️', 'gold', 'Terminally Online', 'Reach level 75.', ['Terminal Bağımlısı', '75. seviyeye ulaş.'], counter((p) => n(p.level), 75), { title: 'Terminally Online' }),
  A('lv100', '🧿', 'kefal', 'The Final Post', `Reach the level cap (${MAX_LEVEL}).`, ['Son Gönderi', `Seviye sınırına (${MAX_LEVEL}) ulaş.`], counter((p) => n(p.level), MAX_LEVEL), { title: 'The Final Post' }),
  A('codex_25', '📚', 'bronze', 'Wiki Editor', 'Fill 25% of the Codex (J).', ['Viki Editörü', "Kodeksin %25'ini doldur (J)."], counter(codexPct, 25)),
  A('codex_75', '📜', 'gold', 'Lore Master', 'Fill 75% of the Codex.', ['Hikaye Ustası', "Kodeksin %75'ini doldur."], counter(codexPct, 75), { title: 'Lore Master' }),
  A('weekly_1', '🗓️', 'bronze', 'Challenger', 'Meet a quota in a Weekly Challenge run.', ['Meydan Okuyan', 'Haftalık Meydan Okuma koşusunda bir kota doldur.'], counter((p) => n(p.weekly?.quotas), 1)),
  A('weekly_5k', '🏁', 'silver', 'Leaderboard Material', 'Score ▮5,000 in a single Weekly Challenge run.', ['Liderlik Tablosu', 'Tek bir Haftalık koşuda ▮5.000 puan yap.'], counter(weeklyBest, 5000), { title: 'Speedrunner' }),
  A('mastery_1', '🧠', 'silver', 'Specialist', 'Max out any Mastery node.', ['Uzman', 'Herhangi bir Ustalık düğümünü tamamla.'], counter(masteryMaxed, 1)),
  A('mastery_all', '🪬', 'kefal', 'Galaxy Brain', 'Max out every Mastery node.', ['Galaksi Beyin', 'Tüm Ustalık düğümlerini tamamla.'], counter(masteryMaxed, Object.keys(MASTERY).length), { title: 'Galaxy Brain' }),
  A('crew_10', '🏴', 'gold', 'Crew Legend', 'Play in a crew of level 10 or higher.', ['Ekip Efsanesi', '10. seviye veya üstü bir ekipte oyna.'], counter((p) => n(p.stats?.bestCrewLevel), 10), { title: 'Crew Legend' }),
);

/** Add an achievement at runtime (other systems / mods). Same shape as ACHIEVEMENTS entries. */
export function registerAchievement(def) {
  if (!def?.id || typeof def.check !== 'function' || ACHIEVEMENTS.some((a) => a.id === def.id)) return null;
  const t = TIERS[def.tier] || TIERS.bronze;
  const a = { icon: '🏆', desc: '', progress: null, ...def, tier: TIERS[def.tier] ? def.tier : 'bronze', name: def.name || def.id, reward: { xp: t.xp, coin: t.coin, ...(def.reward || {}) } };
  ACHIEVEMENTS.splice(ACHIEVEMENTS.length - 1, 0, a); // keep the meta achievement last
  return a;
}

// ------------------------------------------------------------------ profile helpers
/** Creature kills already on record in the bestiary (hazards excluded): seeds stats.creatureKills once. */
function bestiaryCreatureKills(p) {
  let sum = 0;
  for (const [type, e] of Object.entries(p.bestiary || {})) if (isCreatureKill(type)) sum += n(e?.kills);
  return sum;
}

/** Normalise the profile fields this module uses (idempotent, never saves). */
export function ensureAchievementProfile(p) {
  if (!p) return p;
  if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
  if (!Array.isArray(p.titles)) p.titles = [];
  if (!p.login || typeof p.login !== 'object') p.login = { day: -1, streak: 0, best: 0, total: 0 };
  if (!p.stats || typeof p.stats !== 'object') p.stats = {};
  const s = p.stats;
  if (typeof s.creatureKills !== 'number' || !isFinite(s.creatureKills)) s.creatureKills = bestiaryCreatureKills(p);
  for (const k of NUM_STATS) if (typeof s[k] !== 'number' || !isFinite(s[k])) s[k] = 0;
  if (!s.deathsBy || typeof s.deathsBy !== 'object') s.deathsBy = {};
  if (!Array.isArray(s.moonsVisited)) s.moonsVisited = [];
  if (!s.custom || typeof s.custom !== 'object') s.custom = {};
  if (!p.cosmetics) p.cosmetics = { suits: ['orange'], hats: ['none'] };
  if (!Array.isArray(p.cosmetics.suits)) p.cosmetics.suits = ['orange'];
  if (!Array.isArray(p.cosmetics.hats)) p.cosmetics.hats = ['none'];
  return p;
}

/** The chosen (owned) title only, without decorations ('' when none / not owned). */
export function baseTitleOf(p) {
  const t = p?.title;
  return t && Array.isArray(p.titles) && p.titles.includes(t) ? String(t) : '';
}

// Name-tag decorations set by the meta layer (crew tag of the current lobby). Stars come from the profile.
const decor = { crewTag: '' };
export const TITLE_MAX = 24;            // remote.js keeps at most 24 characters of the title
/** Set the lobby crew tag shown in front of titles ('' clears). Returns true when it changed. */
export function setTitleDecor({ crewTag = '' } = {}) {
  const t = String(crewTag || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (t === decor.crewTag) return false;
  decor.crewTag = t;
  return true;
}
/** The title line for the name tag: "[TAG] ★N Title", trimmed to TITLE_MAX ('' when there is nothing to show). */
export function titleOf(p) {
  const base = baseTitleOf(p);
  const stars = prestigeStars(p);
  const pre = (decor.crewTag ? `[${decor.crewTag}] ` : '') + (stars ? `★${stars} ` : '');
  if (!base) return pre.trim();
  const room = TITLE_MAX - pre.length;
  return pre + (base.length > room ? base.slice(0, Math.max(1, room - 1)) + '…' : base);
}

/**
 * Crew name tag canvas: name / « title » / Lv.N. Without a title it is pixel-identical to the classic
 * remote-player / mimic tag (256x64), so both can keep their own drawing for untitled tags.
 * Returns { canvas, scaleY } (sprite scale x stays 1.1).
 */
export function drawNameTag(name, level, title) {
  const tt = title ? String(title).slice(0, 34) : '';
  const c = document.createElement('canvas');
  c.width = 256; c.height = tt ? 88 : 64;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.font = '28px VT323, monospace'; ctx.fillStyle = '#b8ffcc';
  ctx.fillText(String(name || '').slice(0, 18), 128, 30);
  if (tt) {
    let fs = 19;
    ctx.font = fs + 'px VT323, monospace';
    while (fs > 13 && ctx.measureText('« ' + tt + ' »').width > 248) { fs -= 1; ctx.font = fs + 'px VT323, monospace'; }
    ctx.fillStyle = '#ffe066'; ctx.fillText('« ' + tt + ' »', 128, 53);
  }
  ctx.font = '20px VT323, monospace'; ctx.fillStyle = '#ffd27a';
  ctx.fillText('Lv.' + (level || 1), 128, tt ? 79 : 54);
  return { canvas: c, scaleY: tt ? 0.385 : 0.28 };
}

/**
 * Give an existing name-tag sprite (CanvasTexture map) the « title » line: swaps the texture's canvas and
 * makes the sprite taller. No-op without a title. Used by remote players and mimic disguises alike, so a
 * titled crewmate and the mimic wearing their face get the same tag.
 */
export function applyNameTagTitle(sprite, name, level, title) {
  const map = sprite?.material?.map;
  if (!map || !title) return sprite;
  const { canvas, scaleY } = drawNameTag(name, level, title);
  map.image = canvas;
  map.needsUpdate = true;
  sprite.scale.y = scaleY;
  return sprite;
}

function splitCosmetic(id) {
  const [kind, cid] = String(id).split(':');
  return { kind, cid };
}
function cosmeticMeta(id) {
  const { kind, cid } = splitCosmetic(id);
  if (!cid) return null;
  const list = kind === 'suit' ? SUIT_COLORS : kind === 'hat' ? HATS : null;
  return list?.find((x) => x.id === cid) || null;
}
/** The cosmetic exists in the avatar registry (otherwise granting it would add an invisible entry). */
const cosmeticExists = (id) => !!cosmeticMeta(id);
function ownsCosmetic(p, id) {
  const { kind, cid } = splitCosmetic(id);
  const list = kind === 'suit' ? p.cosmetics?.suits : kind === 'hat' ? p.cosmetics?.hats : null;
  return !!list?.includes(cid);
}
function giveCosmetic(p, id) {
  const { kind, cid } = splitCosmetic(id);
  if (!cid || (kind !== 'suit' && kind !== 'hat')) return false;
  ensureAchievementProfile(p);
  const list = kind === 'suit' ? p.cosmetics.suits : p.cosmetics.hats;
  if (list.includes(cid)) return false;
  list.push(cid);
  return true;
}

function saveFor(p, game) {
  if (game?.progress?.save) game.progress.save();
  else saveProfile(p);
}

/** Select a title ('' clears). Broadcasts the new name-tag info when in a session. */
export function setTitle(p, title, game) {
  ensureAchievementProfile(p);
  const t = title && p.titles.includes(title) ? title : '';
  p.title = t;
  saveFor(p, game);
  try {
    if (game?.net && typeof game.helloData === 'function') {
      const hd = game.helloData();
      game.net.helloData = hd;          // keeps future 'hello' packets to late joiners current
      game.net.send?.('pinfo', hd);
    }
  } catch (e) { console.warn('[achievements] title sync', e); }
  return t;
}

/** Daily login reward for a given streak length (pure; cosmetic picked from what the profile lacks). */
export function dailyReward(streak, p) {
  const s = Math.max(1, Math.floor(streak) || 1);
  const out = { xp: 20 * Math.min(s, 10), coin: 15 + 5 * Math.min(s, 20), weekly: s % 7 === 0 };
  if (out.weekly) {
    const pool = DAILY_COSMETICS.filter(cosmeticExists);
    const c = p ? pool.find((id) => !ownsCosmetic(p, id)) : pool[0];
    if (c) { out.cosmetic = c; out.coin += 100; } else out.coin += 400 + 100 * Math.min(Math.floor(s / 7), 6);
  }
  return out;
}

function fmt(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function cosmeticName(id) {
  const meta = cosmeticMeta(id);
  const { kind, cid } = splitCosmetic(id);
  const base = meta?.name || (cid || String(id)).replace(/^\w/, (c) => c.toUpperCase());
  return kind === 'suit' ? base + ' Suit' : base;
}
function rewardText(r) {
  const cosmetic = r.cosmetic && cosmeticExists(r.cosmetic) ? r.cosmetic : null;
  const coin = n(r.coin) + (r.cosmetic && !cosmetic ? n(r.fallbackCoin) : 0);
  const parts = [];
  if (r.xp) parts.push(`+${fmt(r.xp)} XP`);
  if (coin) parts.push(`◈${fmt(coin)}`);
  if (r.title) parts.push(`${L('Title')} "${r.title}"`);
  if (cosmetic) parts.push(cosmeticName(cosmetic));
  return parts.join(' · ');
}
const nameOf = (a) => (tr() ? a.tr?.[0] : null) || t(a.name);
const descOf = (a) => (tr() ? a.tr?.[1] : null) || t(a.desc);
const tierName = (tier) => (tr() ? TIERS[tier]?.tr : t(TIERS[tier]?.name)) || tier;

// ------------------------------------------------------------------ DOM (own elements + injected CSS)
const STYLE_ID = 'kefal-achievements-style';
const CSS = `
.kach-banner-host{position:absolute;left:0;right:0;top:104px;display:flex;justify-content:center;z-index:30}
.kach-banner{--kt:#ffd23f;position:relative;overflow:hidden;display:flex;align-items:center;gap:14px;min-width:340px;max-width:min(560px,92vw);padding:10px 20px 10px 12px;
 background:linear-gradient(180deg,rgba(62,43,6,.95),rgba(22,14,2,.95));border:2px solid var(--kt);box-shadow:0 0 26px rgba(255,200,60,.45),inset 0 0 18px rgba(255,210,80,.14);
 color:#ffe9a8;font-family:var(--font,'VT323',monospace);text-shadow:0 0 6px rgba(0,0,0,.9);animation:kach-in .45s cubic-bezier(.2,1.4,.4,1) both}
.kach-banner::after{content:'';position:absolute;top:0;bottom:0;width:60px;left:-80px;background:linear-gradient(90deg,transparent,rgba(255,240,180,.35),transparent);transform:skewX(-20deg);animation:kach-shine 1.6s .35s ease-out both}
.kach-banner.kach-out{animation:kach-out .4s ease-in both}
.kach-bi{font-size:44px;line-height:1;min-width:52px;text-align:center;color:var(--kt);filter:drop-shadow(0 0 8px rgba(255,210,80,.85))}
.kach-k{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;color:var(--kt)}
.kach-bn{font-size:31px;line-height:1.05;color:#fff3c4;text-shadow:0 0 10px rgba(255,200,60,.7),2px 2px 0 #000}
.kach-bd{font-size:19px;opacity:.85}
.kach-br{font-size:19px;color:#9dff9d}
@keyframes kach-in{from{opacity:0;transform:translateY(-26px) scale(.88)}to{opacity:1;transform:none}}
@keyframes kach-out{to{opacity:0;transform:translateY(-18px) scale(.96)}}
@keyframes kach-shine{to{left:110%}}
.kach-panel{margin-top:14px;border-top:1px solid var(--amber-dim,#a8531f);padding-top:8px}
.kach-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 18px}
.kach-htitle{font-family:var(--font2,monospace);font-size:15px;letter-spacing:2px;color:#ffd23f}
.kach-count{color:#ffe9a8}
.kach-streak{opacity:.8;font-size:.9em}
.kach-lbl{margin:8px 0 4px;color:var(--amber,#ff8a3d)}
.kach-row{display:flex;flex-wrap:wrap;gap:6px}
.kach-chip{border:1px solid #8a6a1a;padding:0 8px;cursor:pointer;font-size:19px;color:#ffe9a8;user-select:none}
.kach-chip:hover{border-color:#ffd23f}
.kach-chip.sel{background:#ffd23f;color:#000;border-color:#ffd23f}
.kach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:6px;margin-top:8px;max-height:44vh;overflow:auto;padding-right:4px}
.kach-card{--kt:#ffd23f;display:flex;gap:10px;padding:6px 8px;border:1px solid rgba(255,138,61,.22);background:rgba(0,0,0,.28)}
.kach-card.unlocked{border-color:var(--kt);box-shadow:inset 0 0 14px rgba(255,210,80,.08)}
.kach-card.locked{opacity:.55}
.kach-card.locked .kach-ic{filter:grayscale(1) brightness(.7)}
.kach-ic{font-size:30px;line-height:1.1;min-width:38px;text-align:center;color:var(--kt)}
.kach-body{flex:1;min-width:0}
.kach-n{color:#fff3c4;font-size:21px;line-height:1.1}
.kach-t{font-size:15px;margin-left:6px;color:var(--kt);letter-spacing:1px}
.kach-d{font-size:17px;opacity:.8;line-height:1.1}
.kach-rw{font-size:16px;color:#9dff9d;opacity:.85}
.kach-at{font-size:15px;opacity:.6}
.kach-bar{height:5px;background:rgba(255,255,255,.1);margin:3px 0 1px}
.kach-bar>span{display:block;height:100%;background:var(--kt)}
.kach-pr{font-size:15px;opacity:.7}
.kach-empty{opacity:.6;font-size:.9em}
`;
function hasDom() { return typeof document !== 'undefined' && !!document.createElement; }
/** The #loading overlay (z-index 100, above the UI root) is up: joining / preparing the ship. */
function isLoading() {
  if (!hasDom() || typeof document.getElementById !== 'function') return false;
  const l = document.getElementById('loading');
  return !!l && !!l.classList && !l.classList.contains('hidden');
}
function ensureStyle() {
  if (!hasDom() || document.getElementById?.(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  (document.head || document.body)?.appendChild(s);
}
function removeStyle() { if (hasDom()) document.getElementById?.(STYLE_ID)?.remove(); }
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

class BannerQueue {
  constructor(game) { this.game = game; this.q = []; this.host = null; this.showing = false; this.timers = new Set(); this.disposed = false; }
  push(item) {
    if (this.disposed || !hasDom()) return;
    if (this.q.length >= MAX_QUEUE) this.q.shift();
    this.q.push(item);
    if (!this.showing) this.next();
  }
  later(fn, ms) { const id = setTimeout(() => { this.timers.delete(id); if (!this.disposed) fn(); }, ms); this.timers.add(id); }
  // never pop a banner over the loading screen (it would be hidden) or over an open minigame (slot reels, safe dial...)
  blocked() { return isLoading() || !!this.game?.minigame || !!this.game?.ui?.fullscreenOpen?.(); }
  next() {
    if (!this.q.length) { this.showing = false; return; }
    this.showing = true;
    if (this.blocked()) { this.later(() => this.next(), 500); return; }
    const item = this.q.shift();
    ensureStyle();
    if (!this.host) {
      this.host = mk('div', 'kach-banner-host');
      this.host.style.pointerEvents = 'none';
      (this.game.ui?.root || document.body).appendChild(this.host);
    }
    const node = mk('div', 'kach-banner');
    node.style.setProperty?.('--kt', TIERS[item.tier]?.color || TIERS.gold.color);
    const text = mk('div', 'kach-bt');
    text.append(mk('div', 'kach-k', item.kicker), mk('div', 'kach-bn', item.name));
    if (item.desc) text.appendChild(mk('div', 'kach-bd', item.desc));
    if (item.reward) text.appendChild(mk('div', 'kach-br', item.reward));
    const bi = mk('div', 'kach-bi'); bi.innerHTML = glyphFromEmoji(item.icon || '🏆'); node.append(bi, text);
    this.host.appendChild(node);
    try { this.game.audio?.ui?.('ui_levelup', 0.75); } catch { /* audio optional */ }
    this.later(() => node.classList.add('kach-out'), BANNER_MS - 400);
    this.later(() => { node.remove(); this.next(); }, BANNER_MS);
  }
  dispose() {
    this.disposed = true;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.q.length = 0;
    this.showing = false;
    this.host?.remove();
    this.host = null;
  }
}

// ------------------------------------------------------------------ install
function patchAfter(obj, name, after, state) {
  return patchWith(obj, name, (orig) => function (...args) {
    const r = orig.apply(this, args);
    if (!state.disposed) { try { after(args, r); } catch (e) { console.warn('[achievements]', name, e); } }
    return r;
  });
}
function patchWith(obj, name, make) {
  if (!obj || typeof obj[name] !== 'function') return () => {};
  const hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
  const orig = obj[name];
  const wrapped = make(orig);
  obj[name] = wrapped;
  return () => {
    if (obj[name] !== wrapped) return; // someone wrapped on top of us: our layer stays inert (state.disposed)
    if (hadOwn) obj[name] = orig; else delete obj[name];
  };
}

const freshDay = (tracked) => ({ tracked, damaged: false, lowHp: false, inside: false, died: false, consumed: false });

/**
 * Install on a Game instance. Returns { onEvent(type, data), evaluate(), setTitle(t), update(dt), dispose() }.
 * Everything the achievements need is observed automatically. onEvent() is only for NEW event types from
 * other systems (e.g. 'bossKill'): it adds data.n || 1 to profile.stats.custom[type]. Types that are already
 * observed (AUTO_EVENTS: kill, fish, vault, fuse, sell, ...) are refused with a one-time warning.
 */
export function installAchievements(game) {
  const profile = game.profile;
  const retro = !profile.achievementsSeeded;
  ensureAchievementProfile(profile);
  const state = { disposed: false, started: false, t: 0, evalT: 0, day: freshDay(false), lastHp: null, reactorPick: null, granting: false, retro };
  const banner = new BannerQueue(game);
  const offs = [];
  const warned = new Set();
  const save = () => saveFor(profile, game);

  // ---- rewards (coins paid here never count towards coinsEarned)
  const grant = (r) => {
    const prog = game.progress;
    state.granting = true;
    try {
      if (r.xp) prog?.addXp(r.xp, 'Achievement');
      if (r.coin) prog?.addCoins(r.coin, 'Achievement');
      if (r.cosmetic) {
        const got = cosmeticExists(r.cosmetic) && giveCosmetic(profile, r.cosmetic);
        if (!got && r.fallbackCoin) prog?.addCoins(r.fallbackCoin, 'Achievement');
      }
    } finally { state.granting = false; }
    if (r.title && !profile.titles.includes(r.title)) {
      profile.titles.push(r.title);
      if (profile.title === undefined) setTitle(profile, r.title, game);  // the first title auto-equips
    }
  };

  // ---- internal recorder (wrappers / sampling only)
  function record(type, data = {}) {
    if (state.disposed) return;
    const S = ensureAchievementProfile(profile).stats;   // re-read: never hold a stale stats object
    const d = data || {};
    switch (type) {
      case 'kill':                                                     // Progress counted kills / bestiary
        if (!isCreatureKill(d.type)) return;
        S.creatureKills += 1;
        break;
      case 'arcade': S.arcadePlays += 1; break;                         // best score kept by Progress.arcade
      case 'fish':
        if (d.id !== 'fish_golden') return;
        S.shinyFish += 1;
        break;
      case 'coins':
        if (state.granting || n(d.n) <= 0) return;
        S.coinsEarned += Math.round(d.n);
        break;
      case 'scrap': S.scrapSecured += 1; S.scrapCollected += Math.max(0, Math.round(n(d.value))); break;
      case 'sell': S.sold += Math.max(0, Math.round(n(d.value))); break;
      case 'vault': S.vaults += 1; break;
      case 'fuse': S.fuses += 1; break;
      case 'quotaMet': S.quotasMet += 1; break;
      case 'fired': S.fired += 1; break;
      case 'jackpot': S.jackpots += 1; break;
      case 'slotSpin': S.slotSpins += 1; if (n(d.bet) > 0 && n(d.win) >= n(d.bet) * 10) S.bigWins += 1; break;
      case 'reactor': S.reactors += 1; break;
      case 'death': {
        const c = String(d.cause || 'unknown');
        S.deathsBy[c] = n(S.deathsBy[c]) + 1;
        state.day.died = true;
        break;
      }
      case 'surviveDay': {
        S.daysSurvived += 1;
        const day = state.day;
        if (day.tracked && !day.consumed && !day.died) {
          if (!day.damaged && day.inside) S.flawlessDays += 1;
          if (day.lowHp) S.closeShaves += 1;
        }
        day.consumed = true;
        break;
      }
      case 'moon':
        if (!d.id || S.moonsVisited.includes(d.id)) return;
        S.moonsVisited.push(d.id);
        break;
      case 'crew':
        if (n(d.n) <= S.maxCrew) return;
        S.maxCrew = n(d.n);
        break;
      default: return;
    }
    save();
  }

  // ---- public: new event types from other systems only
  function onEvent(type, data = {}) {
    if (state.disposed || typeof type !== 'string' || !type) return;
    if (AUTO_EVENTS.has(type)) {
      if (!warned.has(type)) { warned.add(type); console.warn(`[achievements] '${type}' is observed automatically; onEvent('${type}') ignored`); }
      return;
    }
    const S = ensureAchievementProfile(profile).stats;
    const key = type.slice(0, 40);
    S.custom[key] = n(S.custom[key]) + (n(data?.n) || 1);
    save();
  }

  // ---- observe Progress / Game (instance-level wrappers, originals kept and called first)
  const prog = game.progress;
  const restores = [
    patchAfter(prog, 'kill', ([type]) => record('kill', { type }), state),
    patchAfter(prog, 'fish', ([id]) => record('fish', { id }), state),
    patchAfter(prog, 'arcade', ([score]) => record('arcade', { score }), state),
    patchAfter(prog, 'addCoins', ([c]) => record('coins', { n: c }), state),
    patchAfter(prog, 'onDeath', ([cause]) => record('death', { cause }), state),
    patchAfter(prog, 'bountyEvent', ([type, target, cnt]) => {
      if (type === 'collect') record('scrap', { value: cnt });
      else if (type === 'sell') record('sell', { value: cnt });
      else if (type === 'minigame' && target === 'safe') record('vault');
      else if (type === 'minigame' && target === 'fuse') record('fuse');
      else if (type === 'survive') record('surviveDay');
    }, state),
    // quota met arrives as an 'xp' reward flagged { quota: true } (no bounty attached)
    patchAfter(game, 'onReward', ([d]) => {
      if (d?.quota && (!d.to || d.to === game.selfId || d.to === profile.id)) record('quotaMet', d);
    }, state),
    // slot machine: observe every spin through the minigame's onSpin callback. Stats are recorded at once;
    // unlock banners wait until the minigame closes (see update / BannerQueue.blocked), so a jackpot banner
    // never spoils reels that are still spinning.
    patchWith(game, 'openMinigame', (orig) => function (kind, opts, onDone) {
      if (!state.disposed && kind === 'slots' && opts && typeof opts.onSpin === 'function' && !opts.__kach) {
        const spin = opts.onSpin;
        opts = {
          ...opts, __kach: true,
          onSpin: (bet, win) => {
            const r = spin(bet, win);
            if (!state.disposed) {
              try {
                record('slotSpin', { bet, win });
                if (n(bet) > 0 && n(win) >= n(bet) * 100) record('jackpot', { bet, win });
              } catch (e) { console.warn('[achievements] slots', e); }
            }
            return r;
          },
        };
      }
      return orig.call(this, kind, opts, onDone);
    }),
    // reactor pull: the host's 'pick' handler broadcasts 'it' held (-> onItemHeld) and then 'power' off
    // (-> setPower(false, true)) only for a reactor still in its socket. A reactor a crewmate already pulled,
    // one kept on the ship from an earlier day, or a director blackout does not match this sequence.
    patchAfter(game, 'onItemHeld', ([it, holder]) => {
      if (holder && holder === game.selfId && it?.def?.special === 'apparatus' && game.run?.phase === 'moon' && !game.player?.inShip) {
        state.reactorPick = { id: it.id, at: Date.now() };
      }
    }, state),
    patchAfter(game, 'setPower', ([on, announce]) => {
      const pk = state.reactorPick;
      if (on || !announce || !pk) return;
      state.reactorPick = null;
      if (Date.now() - pk.at <= REACTOR_WINDOW_MS && game.player?.slots?.includes?.(pk.id)) record('reactor');
    }, state),
  ];

  // ---- periodic sampling (cheap, every CHECK_INTERVAL)
  function sample() {
    record('crew', { n: 1 + (game.remotes?.size || 0) });
    const run = game.run;
    if (run && (run.phase === 'moon' || run.phase === 'company') && run.moon) record('moon', { id: run.moon });
    if (profile.login.day !== utcDay()) dailyLogin(); // session crossed UTC midnight
  }

  // ---- evaluation
  function evaluate() {
    if (state.disposed) return [];
    ensureAchievementProfile(profile);
    const ctx = { game, crew: 1 + (game.remotes?.size || 0) };
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id]) continue;
      let ok = false;
      try { ok = !!a.check(profile, ctx); } catch (e) { console.warn('[achievements] check', a.id, e); }
      if (!ok) continue;
      profile.achievements[a.id] = { at: Date.now() };
      fresh.push(a);
      grant(a.reward || {});
    }
    const wasRetro = state.retro;
    state.retro = false;
    if (!profile.achievementsSeeded) profile.achievementsSeeded = true;
    if (fresh.length) {
      save();
      if (wasRetro || fresh.length > 3) {
        const shown = wasRetro ? [] : fresh.slice(0, 2);
        for (const a of shown) queueAchievement(a);
        const rest = fresh.slice(shown.length);
        const tot = rest.reduce((o, a) => ({ xp: o.xp + n(a.reward?.xp), coin: o.coin + n(a.reward?.coin) }), { xp: 0, coin: 0 });
        const names = rest.slice(0, 4).map(nameOf).join(', ') + (rest.length > 4 ? ', ...' : '');
        banner.push({
          tier: 'gold', icon: '🏆', kicker: L('ACHIEVEMENTS UNLOCKED'),
          name: `+${rest.length} ${L(rest.length === 1 ? 'achievement' : 'achievements')}`,
          desc: wasRetro ? `${L('Unlocked from your service record')}: ${names}` : names,
          reward: rewardText(tot),
        });
      } else for (const a of fresh) queueAchievement(a);
    } else if (wasRetro) save();
    return fresh;
  }
  function queueAchievement(a) {
    banner.push({ tier: a.tier, icon: a.icon, kicker: `${L('ACHIEVEMENT UNLOCKED')} · ${tierName(a.tier).toUpperCase()}`, name: nameOf(a), desc: descOf(a), reward: rewardText(a.reward || {}) });
  }

  // ---- daily login streak
  function dailyLogin() {
    if (game.daily) return;   // wave 4: the DAILY module (7-day calendar, claimed by hand) replaces this automatic bonus
    const today = utcDay();
    const lg = profile.login;
    if (lg.day === today) return;
    const streak = lg.day === today - 1 ? n(lg.streak) + 1 : 1;
    lg.day = today; lg.streak = streak; lg.best = Math.max(n(lg.best), streak); lg.total = n(lg.total) + 1;
    const r = dailyReward(streak, profile);
    grant({ xp: r.xp, coin: r.coin, cosmetic: r.cosmetic });
    save();
    banner.push({
      tier: r.weekly ? 'kefal' : 'gold', icon: r.weekly ? '🎁' : '📅', kicker: L('DAILY LOGIN BONUS'),
      name: `${L('Day')} ${streak}${streak > 1 ? ' ' + L('streak!') : ''}`,
      desc: r.weekly ? L('Weekly bonus!') : L('Come back tomorrow to keep the streak going.'),
      reward: rewardText({ xp: r.xp, coin: r.coin, cosmetic: r.cosmetic }),
    });
  }

  // ---- mod hooks
  const mods = game.mods;
  if (mods?.on) {
    offs.push(mods.on('phase', (ph, g) => {
      if (g && g !== game) return;
      if (ph === 'landing') state.day = freshDay(true);
      else if (ph === 'moon' || ph === 'company') record('moon', { id: game.run?.moon });
      else if (ph === 'fired') record('fired');
    }));
    offs.push(mods.on('update', (dt, g) => {
      if (g && g !== game) return;
      update(dt);
    }));
  }

  // The session is up: the host ran hostInit / the client got its welcome (game.run) and the loading
  // overlay is gone. Game.update already runs while startSession is still awaiting the transport.
  const sessionReady = () => !!game.run && !isLoading();

  function update(dt) {
    if (state.disposed) return;
    // per-frame hp sampling: catches every damage source (creatures, falls, fuse shocks, other systems)
    const p = game.player;
    if (p) {
      const hp = n(p.hp);
      if (!p.dead && state.day.tracked && !state.day.consumed) {
        if (state.lastHp !== null && hp < state.lastHp - 1e-3) state.day.damaged = true;
        if (hp > 0 && hp < 10) state.day.lowHp = true;
        if (p.indoor) state.day.inside = true;
      }
      state.lastHp = p.dead ? 0 : hp;
    }
    if (!state.started) {
      if (!sessionReady()) return;
      state.t += dt;
      if (state.t < START_DELAY || game.minigame) return;
      state.started = true;
      dailyLogin();
      sample();
      evaluate();
      state.evalT = 0;
      return;
    }
    state.t += dt;
    state.evalT += dt;
    // unlocks wait while a minigame is open (e.g. slot reels still spinning) and run right after it closes
    if (state.evalT < CHECK_INTERVAL || game.minigame) return;
    state.evalT = 0;
    sample();
    evaluate();
  }

  function dispose() {
    if (state.disposed) return;
    state.disposed = true;
    for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
    offs.length = 0;
    for (const r of restores) { try { r(); } catch { /* ignore */ } }
    banner.dispose();
    removeStyle();
    if (game.achievements === api) game.achievements = null;
  }

  const api = {
    onEvent, evaluate, dispose,
    /** Show a gold banner (other meta systems: codex milestones, rebirth, weekly). item: { tier, icon, kicker, name, desc, reward } */
    banner: (item) => { if (!state.disposed && item) banner.push({ tier: 'gold', icon: '🏆', kicker: '', name: '', ...item }); },
    /** Grant a reward through the achievement pipeline (xp, coin, title, cosmetic 'suit:x' / 'hat:x', fallbackCoin). */
    grant: (r) => { if (!state.disposed && r) { grant(r); save(); } },
    rewardText,
    setTitle: (t) => setTitle(profile, t, game),
    update,                       // exposed for tests / manual ticking when mods are absent
    get state() { return state; },
  };
  return api;
}

// ------------------------------------------------------------------ panel (character sheet / TAB)
let panelFilter = 'all';

/**
 * Fill `container` with the achievements list, login streak and the title selector.
 * Works in-game (game given) and from the main menu (game null, pass the profile).
 */
export function renderAchievementsPanel(container, game, profile = game?.profile) {
  if (!container || !profile || !hasDom()) return;
  ensureAchievementProfile(profile);
  ensureStyle();
  const render = () => {
    if (container.replaceChildren) container.replaceChildren(); else container.innerHTML = '';
    const root = mk('div', 'kach-panel');
    const done = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;
    const lg = profile.login;
    const head = mk('div', 'kach-head');
    const toWeekly = 7 - (n(lg.streak) % 7);
    head.append(
      mk('span', 'kach-htitle', L('ACHIEVEMENTS')),
      mk('span', 'kach-count', `${done} / ${ACHIEVEMENTS.length}`),
      mk('span', 'kach-streak', `📅 ${L('Login streak')}: ${n(lg.streak)} (${L('best')} ${n(lg.best)}) · ${L('Next weekly bonus in')} ${toWeekly} ${L('days')}`),
    );
    root.appendChild(head);

    // title selector
    root.appendChild(mk('div', 'kach-lbl', L('Title (shown on your name tag)')));
    const titles = mk('div', 'kach-row');
    if (!profile.titles.length) titles.appendChild(mk('span', 'kach-empty', L('Unlock achievements to earn titles.')));
    else {
      const cur = baseTitleOf(profile);
      for (const t of ['', ...profile.titles]) {
        const c = mk('span', 'kach-chip' + (cur === t ? ' sel' : ''), t || L('None'));
        c.addEventListener('click', (e) => {
          e?.stopPropagation?.();
          setTitle(profile, t, game);
          try { game?.audio?.ui?.('ui_click', 0.5); } catch { /* ignore */ }
          render();
        });
        titles.appendChild(c);
      }
    }
    root.appendChild(titles);

    // filter tabs
    const tabs = mk('div', 'kach-row');
    tabs.style.marginTop = '8px';
    for (const [id, label] of [['all', 'All'], ['unlocked', 'Unlocked'], ['locked', 'Locked']]) {
      const c = mk('span', 'kach-chip' + (panelFilter === id ? ' sel' : ''), L(label));
      c.addEventListener('click', (e) => { e?.stopPropagation?.(); panelFilter = id; render(); });
      tabs.appendChild(c);
    }
    root.appendChild(tabs);

    // list
    const grid = mk('div', 'kach-grid');
    for (const a of ACHIEVEMENTS) {
      const un = profile.achievements[a.id];
      if ((panelFilter === 'unlocked' && !un) || (panelFilter === 'locked' && un)) continue;
      const card = mk('div', 'kach-card ' + (un ? 'unlocked' : 'locked'));
      card.style.setProperty?.('--kt', TIERS[a.tier]?.color || '#ffd23f');
      const body = mk('div', 'kach-body');
      const nm = mk('div', 'kach-n', nameOf(a));
      nm.appendChild(mk('span', 'kach-t', tierName(a.tier).toUpperCase()));
      body.append(nm, mk('div', 'kach-d', descOf(a)));
      if (!un && a.progress) {
        let pr = null;
        try { pr = a.progress(profile); } catch { pr = null; }
        if (pr && pr[1] > 1) {
          const bar = mk('div', 'kach-bar');
          const fill = mk('span');
          fill.style.width = Math.max(0, Math.min(100, (pr[0] / pr[1]) * 100)) + '%';
          bar.appendChild(fill);
          body.append(bar, mk('div', 'kach-pr', `${fmt(pr[0])} / ${fmt(pr[1])}`));
        }
      }
      body.appendChild(mk('div', 'kach-rw', rewardText(a.reward || {})));
      if (n(un?.at) > 0) body.appendChild(mk('div', 'kach-at', `${L('Unlocked on')} ${new Date(un.at).toISOString().slice(0, 10)}`));
      const ic = mk('div', 'kach-ic'); ic.innerHTML = glyphFromEmoji(a.icon); card.append(ic, body);
      grid.appendChild(card);
    }
    root.appendChild(grid);
    container.appendChild(root);
  };
  render();
  return { refresh: render };
}
