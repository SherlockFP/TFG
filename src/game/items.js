// Item definitions registry. Mods can add entries with registerItem().
import { localizeFields } from '../core/i18n.js';
import { humanizeId } from '../core/util.js';
// kind: scrap | big (physics valuable) | fish | drop | tool | weapon | consumable
// value: [min, max] credits (scrap); price: store price (credits); coin: black market price (Clout)
// weight in lb (LC-style), hands: 1 | 2

export const RARITY = {
  common: { color: '#9aa39a', name: 'Common' },
  uncommon: { color: '#4ecb5a', name: 'Uncommon' },
  rare: { color: '#3d8bff', name: 'Rare' },
  epic: { color: '#b35cff', name: 'Epic' },
  legendary: { color: '#ff9a1f', name: 'Legendary' },
  mythic: { color: '#ff3b6b', name: 'Mythic' },   // tiers.js (wave 1): rolled item tiers go one step past legendary
};

export function rarityOfValue(v) {
  if (v >= 200) return 'legendary';
  if (v >= 110) return 'epic';
  if (v >= 60) return 'rare';
  if (v >= 30) return 'uncommon';
  return 'common';
}

const S = (id, name, value, weight, hands = 1, extra = {}) => ({ id, name, kind: 'scrap', value, weight, hands, ...extra });

export const ITEMS = {
  // ---- scrap ----
  bolt: S('bolt', 'Big Bolt', [20, 32], 19),
  axle: S('axle', 'Large Axle', [36, 55], 16, 2),
  bell: S('bell', 'Brass Bell', [48, 80], 24, 1, { use: 'noise', useSound: 'bell_ding' }),
  register: S('register', 'Cash Register', [80, 160], 84, 2, { use: 'noise', useSound: 'register' }),
  goldbar: S('goldbar', 'Gold Bar', [102, 210], 77),
  duck: S('duck', 'Rubber Ducky', [5, 15], 1, 1, { use: 'noise', useSound: 'squeak' }),
  robot: S('robot', 'Toy Robot', [56, 88], 21, 2),
  lamp: S('lamp', 'Fancy Lamp', [60, 128], 21, 2),
  canned: S('canned', 'Canned Kefal', [10, 30], 5),
  figurine: S('figurine', 'Kefal Figurine', [40, 70], 8),
  mug: S('mug', 'Coffee Mug', [16, 68], 5),
  teeth: S('teeth', 'Wind-up Teeth', [32, 50], 1, 1, { use: 'noise', useSound: 'teeth_chatter' }),
  airhorn: S('airhorn', 'Airhorn', [52, 72], 1, 1, { use: 'noise', useSound: 'airhorn', noise: 1.0 }),
  clownhorn: S('clownhorn', 'Clown Horn', [52, 72], 1, 1, { use: 'noise', useSound: 'clownhorn', noise: 0.8 }),
  painting: S('painting', 'Painting', [60, 124], 32, 2),
  pickles: S('pickles', 'Jar of Pickles', [32, 60], 16, 1, { fragile: 0.5 }),
  bottles: S('bottles', 'Bottles', [44, 56], 19, 2, { fragile: 0.4 }),
  trophy: S('trophy', 'Trophy', [40, 80], 14),
  perfume: S('perfume', 'Perfume', [48, 104], 1),
  flask: S('flask', 'Chemical Flask', [16, 44], 19, 1, { fragile: 0.5 }),
  cog: S('cog', 'Big Cog', [20, 36], 6),
  phone: S('phone', 'Old Phone', [48, 64], 5, 1, { use: 'noise', useSound: 'phone_ring' }),
  pot: S('pot', 'Cooking Pot', [40, 68], 25),
  steering: S('steering', 'Steering Wheel', [16, 32], 16),
  tv: S('tv', 'Old TV', [60, 100], 40, 2),
  magnify: S('magnify', 'Magnifying Glass', [44, 60], 11),
  skull: S('skull', 'Old Skull', [30, 60], 6),
  ring: S('ring', 'Diamond Ring', [120, 200], 0.5),
  reactor: S('reactor', 'Reactor Core', [180, 260], 31, 2, { special: 'apparatus' }),
  // ---- physics valuables (grab beam, fragile) ----
  vase: { id: 'vase', name: 'Porcelain Vase', kind: 'big', value: [90, 170], weight: 30, hands: 0, fragile: 1.2, mass: 8 },
  statue: { id: 'statue', name: 'Kefal Statue', kind: 'big', value: [200, 350], weight: 120, hands: 0, fragile: 0.5, mass: 40 },
  amphora: { id: 'amphora', name: 'Ancient Amphora', kind: 'big', value: [120, 220], weight: 45, hands: 0, fragile: 1.0, mass: 14 },
  server: { id: 'server', name: 'Server Rack', kind: 'big', value: [150, 250], weight: 150, hands: 0, fragile: 0.35, mass: 55 },
  aquarium: { id: 'aquarium', name: 'Aquarium', kind: 'big', value: [120, 240], weight: 90, hands: 0, fragile: 0.9, mass: 30 },
  // ---- fish ----
  fish_kefal: { id: 'fish_kefal', name: 'Kefal', kind: 'fish', value: [20, 40], weight: 4, hands: 1 },
  fish_lufer: { id: 'fish_lufer', name: 'Lüfer', kind: 'fish', value: [30, 60], weight: 5, hands: 1 },
  fish_levrek: { id: 'fish_levrek', name: 'Levrek', kind: 'fish', value: [40, 75], weight: 6, hands: 1 },
  fish_golden: { id: 'fish_golden', name: 'Shiny Kefal', kind: 'fish', value: [150, 260], weight: 5, hands: 1 },
  fish_boot: { id: 'fish_boot', name: 'Old Boot', kind: 'fish', value: [1, 6], weight: 3, hands: 1 },
  fish_eel: { id: 'fish_eel', name: 'Void Eel', kind: 'fish', value: [80, 140], weight: 9, hands: 1 },
  // ---- creature drops ----
  drop_scuttler: { id: 'drop_scuttler', name: 'Scuttler Shell', kind: 'drop', value: [15, 30], weight: 4, hands: 1 },
  drop_spider: { id: 'drop_spider', name: 'Spider Silk', kind: 'drop', value: [40, 70], weight: 3, hands: 1 },
  drop_crawler: { id: 'drop_crawler', name: 'Crawler Claw', kind: 'drop', value: [60, 100], weight: 12, hands: 1 },
  drop_hound: { id: 'drop_hound', name: 'Hound Fang', kind: 'drop', value: [80, 120], weight: 3, hands: 1 },
  drop_lurker: { id: 'drop_lurker', name: 'Lurker Mask', kind: 'drop', value: [150, 250], weight: 6, hands: 1 },
  drop_giant: { id: 'drop_giant', name: 'Giant Tooth', kind: 'drop', value: [250, 400], weight: 40, hands: 2 },
  // ---- tools ----
  flashlight: { id: 'flashlight', name: 'Flashlight', kind: 'tool', price: 15, weight: 0, hands: 1, battery: 150, light: { intensity: 38, distance: 24, angle: 0.42 } },
  proflash: { id: 'proflash', name: 'Pro Flashlight', kind: 'tool', price: 25, weight: 5, hands: 1, battery: 300, light: { intensity: 70, distance: 38, angle: 0.36 } },
  walkie: { id: 'walkie', name: 'Walkie-Talkie', kind: 'tool', price: 12, weight: 0, hands: 1, battery: 400 },
  boombox: { id: 'boombox', name: 'Boombox', kind: 'tool', price: 60, weight: 16, hands: 1, battery: 600 },
  spraypaint: { id: 'spraypaint', name: 'Spray Paint', kind: 'tool', price: 50, weight: 0, hands: 1, charges: 60 },
  glowstick: { id: 'glowstick', name: 'Glowstick', kind: 'tool', price: 5, weight: 0, hands: 1, throwable: true },
  rod: { id: 'rod', name: 'Fishing Rod', kind: 'tool', price: 40, weight: 4, hands: 1 },
  key: { id: 'key', name: 'Key', kind: 'tool', price: 0, weight: 0, hands: 1, value: [3, 3] },
  lockpick: { id: 'lockpick', name: 'Lockpicker', kind: 'tool', price: 20, weight: 3, hands: 1, charges: 3 },
  jetpack: { id: 'jetpack', name: 'Jetpack', kind: 'tool', price: 1200, weight: 52, hands: 2, battery: 60 },
  stungrenade: { id: 'stungrenade', name: 'Stun Grenade', kind: 'consumable', price: 30, weight: 5, hands: 1, throwable: true },
  medkit: { id: 'medkit', name: 'Medkit', kind: 'consumable', price: 40, weight: 3, hands: 1, heal: 60 },
  adrenaline: { id: 'adrenaline', name: 'Adrenaline', kind: 'consumable', price: 60, weight: 0, hands: 1 },
  shells: { id: 'shells', name: 'Shotgun Shells', kind: 'consumable', price: 20, weight: 1, hands: 1 },
  body: { id: 'body', name: 'Body', kind: 'body', weight: 90, hands: 2, value: [0, 0] },
  // ---- weapons ----  dmg per hit, cd seconds, reach meters
  pipe: { id: 'pipe', name: 'Lead Pipe', kind: 'weapon', price: 10, coin: 0, weight: 8, hands: 1, dmg: 14, cd: 0.6, reach: 2.2, rarity: 'common' },
  shovel: { id: 'shovel', name: 'Shovel', kind: 'weapon', price: 30, coin: 120, weight: 8, hands: 1, dmg: 20, cd: 0.8, reach: 2.4, charge: true, rarity: 'common' },
  stopsign: { id: 'stopsign', name: 'Stop Sign', kind: 'weapon', price: 0, weight: 12, hands: 1, dmg: 22, cd: 0.9, reach: 2.5, charge: true, rarity: 'uncommon', value: [20, 30] },
  machete: { id: 'machete', name: 'Machete', kind: 'weapon', price: 90, coin: 350, weight: 5, hands: 1, dmg: 26, cd: 0.5, reach: 2.1, rarity: 'rare' },
  sledge: { id: 'sledge', name: 'Sledgehammer', kind: 'weapon', price: 150, coin: 600, weight: 20, hands: 2, dmg: 48, cd: 1.3, reach: 2.6, charge: true, knock: 2, rarity: 'rare' },
  taser: { id: 'taser', name: 'Zap Gun', kind: 'weapon', price: 650, coin: 900, weight: 11, hands: 1, dmg: 4, cd: 1.5, reach: 12, stun: 3.5, battery: 60, rarity: 'epic', ranged: true },
  harpoon: { id: 'harpoon', name: 'Kefal Harpoon', kind: 'weapon', price: 600, coin: 1400, weight: 14, hands: 2, dmg: 70, cd: 1.6, reach: 30, ranged: true, rarity: 'epic' },
  shotgun: { id: 'shotgun', name: 'Double Barrel', kind: 'weapon', price: 0, coin: 2500, weight: 16, hands: 2, dmg: 90, cd: 0.7, reach: 25, ranged: true, ammo: 2, rarity: 'legendary' },

  // ---- dead-internet scrap (round 3) ----
  // special flags (handled by ItemTools in entities/items.js):
  //   shake: { loud }  noisy when the holder sprints / jumps with it in hand
  //   glow: { color, intensity, distance }  battery light toggled with LMB (the ship charger refills it)
  //   flash: true      LMB = blinding camera flash that stuns creatures in front (uses charges)
  //   cursed: true     whispers to its carrier and draws creatures now and then
  //   hot: { every, dmg, floor }  burns its carrier: -dmg HP every `every` s while carried (never below `floor`)
  floppies: S('floppies', 'Floppy Stack', [10, 26], 2),
  modem: S('modem', 'Dial-up Modem', [34, 62], 5, 1, { use: 'noise', useSound: 'walkie_static', noise: 0.9, shake: { loud: 0.85 } }),
  keyboard: S('keyboard', 'Mech Keyboard', [22, 48], 4, 1, { use: 'noise', useSound: 'lockpick_click', noise: 0.3 }),
  vhs: S('vhs', 'VHS Tape', [12, 32], 1),
  nftframe: S('nftframe', 'NFT Frame', [1, 190], 7),
  playbutton: S('playbutton', 'Golden Follow Button', [150, 240], 16),
  liketrophy: S('liketrophy', 'Like-Button Trophy', [44, 88], 9, 1, { use: 'noise', useSound: 'ui_notify', noise: 0.4 }),
  memecart: S('memecart', 'Meme Cartridge', [24, 58], 1),
  flipphone: S('flipphone', 'Flip Phone', [20, 42], 1, 1, { use: 'noise', useSound: 'phone_ring', noise: 0.7 }),
  webcam: S('webcam', 'Webcam', [26, 48], 1, 1, { charges: 3, flash: true }),
  gamingchair: S('gamingchair', 'Gaming Chair', [70, 135], 42, 2),
  ringlight: S('ringlight', 'Ring Light', [48, 96], 11, 1, { battery: 240, glow: { color: 0xfff1e0, intensity: 1.6, distance: 9 } }),
  usbidol: S('usbidol', 'USB Idol', [90, 160], 4),
  chainletter: S('chainletter', 'Cursed Chain Letter', [95, 175], 0.5, 1, { cursed: true }),
  gpu: S('gpu', 'Overclocked GPU', [160, 270], 12, 1, { hot: { every: 1.6, dmg: 1, floor: 15 } }),
  hdd: S('hdd', 'Hard Drive', [20, 46], 2, 1, { fragile: 0.6 }),
  headset: S('headset', 'Gamer Headset', [28, 54], 2),
  cdspindle: S('cdspindle', 'CD Spindle', [14, 36], 3),
  pocketpet: S('pocketpet', 'Pocket Pet', [30, 70], 0.5, 1, { use: 'noise', useSound: 'arcade_jump', noise: 0.4, shake: { loud: 0.55 } }),
  pager: S('pager', 'Pager', [16, 34], 1, 1, { use: 'noise', useSound: 'mine_beep', noise: 0.35 }),
  captcha: S('captcha', 'CAPTCHA Tablet', [45, 90], 22),
  animefig: S('animefig', 'Anime Figure', [60, 125], 3, 1, { fragile: 0.7 }),
  printer: S('printer', 'Paper-Jam Printer', [40, 82], 30, 2, { use: 'noise', useSound: 'vent_rattle', noise: 1.0 }),
  motherboard: S('motherboard', 'Motherboard', [30, 64], 3),
  cryptocoin: S('cryptocoin', 'Crypto Coin', [55, 115], 0.5),
  // physics valuables
  cryptorig: { id: 'cryptorig', name: 'Crypto Miner Rig', kind: 'big', value: [190, 330], weight: 95, hands: 0, fragile: 0.4, mass: 42 },
  pctower: { id: 'pctower', name: 'Beige PC Tower', kind: 'big', value: [110, 200], weight: 40, hands: 0, fragile: 0.8, mass: 16 },
  // ---- store tools (Lethal Company ports, re-themed; mechanics in entities/items.js ItemTools) ----
  ladder: { id: 'ladder', name: 'Extension Ladder', kind: 'tool', price: 60, weight: 16, hands: 2, tip: 'Face a wall that has a ledge on top and press LMB to set it up. [E] climbs, crouch + [E] folds it.' },
  booster: { id: 'booster', name: 'Signal Booster', kind: 'tool', price: 50, weight: 8, hands: 1, throwable: true, tip: 'LMB arms and tosses it. While armed it pings nearby scrap and creatures through walls (and hums a little).' },
  inhaler: { id: 'inhaler', name: 'Hype Inhaler', kind: 'tool', price: 120, weight: 0, hands: 1, charges: 100, tip: 'Hold LMB to inhale: faster, tireless, very wobbly. Do not overdo it.' },
  beltbag: { id: 'beltbag', name: 'Belt Bag', kind: 'bag', price: 45, value: [10, 18], weight: 1, hands: 1, tier: 'common', shopCat: 'bag', bag: { cols: 5, rows: 3, weightMul: 0.9 },
    tip: 'A bag: LMB (or drag it onto the BAG slot in the inventory [I]) to wear it. 5x3 grid, stashed loot weighs 10% less.' },
  adblock: { id: 'adblock', name: 'Adblock Spray', kind: 'tool', price: 35, weight: 4, hands: 1, charges: 100, tip: 'Hold LMB to spray. Melts spam, pop-ups, reply guys and webs. Everything else just gets annoyed.' },

  // ---- wave 1 inventory gear (src/game/inventory.js). kind 'bag' = BAG slot, 'armor' = SUIT slot, 'trinket' = 2 TRINKET slots.
  //  bag: { cols, rows, weightMul (stashed loot weight), speed (move speed delta) }  gear: bonuses x tier statMul (speed not scaled)
  //  size: [w, h] grid footprint override. Store copies are Common; loot copies roll a tier (luck: moon danger + Lucky Dongles).
  bag_fieldpack: { id: 'bag_fieldpack', name: 'Field Pack', kind: 'bag', price: 180, value: [40, 60], weight: 3, hands: 1, tier: 'uncommon', shopCat: 'bag', size: [1, 2], bag: { cols: 6, rows: 4, weightMul: 0.85 },
    tip: 'A proper backpack: 6x4 grid, stashed loot weighs 15% less. LMB to wear it.' },
  bag_hauler: { id: 'bag_hauler', name: 'Hauler Frame', kind: 'bag', price: 650, value: [90, 130], weight: 8, hands: 1, tier: 'rare', shopCat: 'bag', size: [2, 2], bag: { cols: 7, rows: 5, weightMul: 0.8, speed: -0.05 },
    tip: 'Steel-frame pack: 7x5 grid, stashed loot weighs 20% less, but you walk 5% slower. LMB to wear it.' },
  bag_void: { id: 'bag_void', name: 'Void Satchel', kind: 'bag', value: [260, 360], weight: 2, hands: 1, tier: 'mythic', shopCat: 'bag', bag: { cols: 8, rows: 6, weightMul: 0.7 },
    tip: 'Bigger on the inside. Nobody knows who uploaded it. 8x6 grid, stashed loot weighs 30% less.' },
  arm_hoodie: { id: 'arm_hoodie', name: 'Padded Hoodie', kind: 'armor', price: 60, value: [14, 24], weight: 4, hands: 1, shopCat: 'suit', gear: { armor: 0.06 },
    tip: 'Comfy, and it stops a little bit of pain. Wear it in the SUIT slot.' },
  arm_riot: { id: 'arm_riot', name: 'Riot Vest', kind: 'armor', price: 220, value: [50, 80], weight: 12, hands: 1, shopCat: 'suit', gear: { armor: 0.12, speed: -0.02 },
    tip: 'Moderation Bureau surplus. Solid protection, a little stiff.' },
  arm_kevlar: { id: 'arm_kevlar', name: 'Kevlar Suit', kind: 'armor', price: 750, value: [110, 160], weight: 18, hands: 1, shopCat: 'suit', gear: { armor: 0.18, speed: -0.04 },
    tip: 'Heavy plates. The best protection money can buy, at a walking-speed cost.' },
  trk_dongle: { id: 'trk_dongle', name: 'Lucky Dongle', kind: 'trinket', price: 150, value: [30, 55], weight: 0.5, hands: 1, shopCat: 'trinket', gear: { luck: 0.06, crit: 0.02 },
    tip: 'Plug it in for luck. The whole crew finds higher-tier loot (and you crit more).' },
  trk_charm: { id: 'trk_charm', name: 'Energy Drink Charm', kind: 'trinket', price: 90, value: [20, 40], weight: 0.5, hands: 1, shopCat: 'trinket', gear: { stamina: 15, regenPct: 0.12 },
    tip: 'A tiny can on a keyring. More stamina, faster recovery.' },
  trk_amulet: { id: 'trk_amulet', name: 'Signal Amulet', kind: 'trinket', price: 120, value: [25, 45], weight: 0.5, hands: 1, shopCat: 'trinket', gear: { scan: 8, battery: 0.1 },
    tip: 'Full bars, always. Longer scan range and longer battery life.' },
};


// TFG re-theme: display names (ids unchanged, see docs/THEME.md)
const THEME_NAMES = {"bolt": "Old Router", "axle": "Server Blade", "bell": "Notification Bell", "register": "Ad Revenue Machine", "goldbar": "Gold Subscriber Plaque", "duck": "Rubber Debug Duck", "robot": "Chatbot Toy", "lamp": "Lava Lamp", "canned": "Energy Drink", "figurine": "Shiba Figurine", "mug": "Mod's Mug", "teeth": "Chattering Teeth", "airhorn": "MLG Airhorn", "clownhorn": "Clown Horn", "painting": "Cursed Image", "pickles": "Jar of Pickles", "bottles": "Energy Drink Pack", "trophy": "Participation Trophy", "perfume": "Follower Cologne", "flask": "Suspicious Liquid", "cog": "Loading Spinner", "phone": "Brick Phone", "pot": "Cooking Pot", "steering": "Gamer Wheel", "tv": "CRT Monitor", "magnify": "Clickbait Lens", "skull": "Skull Emoji", "ring": "Verified Ring", "reactor": "Main Server Core", "vase": "Vaporwave Bust", "statue": "Shiba Statue", "amphora": "Retro Console", "server": "Server Rack", "aquarium": "Screensaver Aquarium", "fish_kefal": "Catfish", "fish_lufer": "Boosted Bass", "fish_levrek": "Clickbait Trout", "fish_golden": "Golden Phish", "fish_boot": "Old Boot", "fish_eel": "Glitch Eel", "drop_scuttler": "Spam Chip", "drop_spider": "Web Silk", "drop_crawler": "Crawler Claw", "drop_hound": "Troll Fang", "drop_lurker": "Lurker Mask", "drop_giant": "Influencer Tooth", "harpoon": "Report Harpoon", "rod": "Phishing Rod"};
for (const [id, name] of Object.entries(THEME_NAMES)) if (ITEMS[id]) ITEMS[id].name = name;

// Scrap spawn tables per interior theme (weights)
export const SCRAP_TABLE = {
  factory: [
    ['bolt', 14], ['axle', 10], ['cog', 12], ['register', 3], ['goldbar', 2], ['duck', 5], ['robot', 5], ['lamp', 3],
    ['canned', 10], ['figurine', 5], ['mug', 8], ['teeth', 5], ['airhorn', 4], ['clownhorn', 3], ['bottles', 6],
    ['flask', 7], ['phone', 5], ['pot', 6], ['steering', 8], ['tv', 4], ['magnify', 4], ['skull', 3], ['ring', 1],
    ['trophy', 4], ['pickles', 5], ['stopsign', 3], ['key', 3],
  ],
  mansion: [
    ['bell', 8], ['register', 3], ['goldbar', 3], ['duck', 6], ['robot', 5], ['lamp', 9], ['painting', 9], ['mug', 9],
    ['teeth', 6], ['perfume', 8], ['trophy', 7], ['phone', 7], ['pot', 5], ['skull', 5], ['ring', 2], ['figurine', 6],
    ['magnify', 5], ['pickles', 6], ['bottles', 5], ['canned', 4], ['key', 4],
  ],
};
// mineshaft (Levrek): ore, tools, miners' lunch & junk. Ext mining scrap (x_nuggets, x_copper,
// x_pickaxe, x_jerrycan ...) is appended by extcontent.js only when its model loaded.
SCRAP_TABLE.mineshaft = [
  ['bolt', 12], ['axle', 8], ['cog', 12], ['goldbar', 4], ['bell', 5], ['canned', 12], ['mug', 8], ['pot', 6],
  ['skull', 6], ['teeth', 3], ['airhorn', 4], ['flask', 5], ['bottles', 6], ['phone', 4], ['lamp', 4], ['magnify', 5],
  ['steering', 4], ['trophy', 2], ['ring', 2], ['pickles', 4], ['figurine', 3], ['duck', 2], ['stopsign', 2], ['key', 4],
];
// dead-internet scrap mixed into the original interiors
SCRAP_TABLE.factory.push(['floppies', 6], ['modem', 5], ['keyboard', 5], ['motherboard', 5], ['hdd', 5], ['cdspindle', 4], ['headset', 3],
  ['webcam', 3], ['gpu', 2], ['cryptocoin', 2], ['printer', 2], ['memecart', 3], ['captcha', 2], ['ringlight', 2], ['playbutton', 1]);
SCRAP_TABLE.mansion.push(['vhs', 6], ['nftframe', 5], ['animefig', 4], ['chainletter', 3], ['ringlight', 4], ['liketrophy', 4], ['flipphone', 4],
  ['pocketpet', 3], ['usbidol', 2], ['playbutton', 1], ['captcha', 2], ['gamingchair', 2]);
SCRAP_TABLE.mineshaft.push(['cryptocoin', 5], ['gpu', 3], ['hdd', 4], ['modem', 3], ['pager', 3], ['flipphone', 3], ['usbidol', 2], ['captcha', 3], ['chainletter', 2]);
// themed interiors (the world agents add the layouts; the tables live here so every theme has fitting loot)
SCRAP_TABLE.office = [
  ['keyboard', 10], ['mug', 9], ['floppies', 8], ['printer', 5], ['gamingchair', 3], ['headset', 6], ['flipphone', 6], ['pager', 5], ['phone', 5],
  ['liketrophy', 5], ['trophy', 5], ['register', 3], ['lamp', 4], ['cdspindle', 6], ['motherboard', 3], ['webcam', 5], ['nftframe', 4], ['painting', 3],
  ['duck', 4], ['canned', 6], ['bottles', 4], ['playbutton', 1], ['ringlight', 3], ['chainletter', 1], ['figurine', 3], ['cog', 3], ['key', 4],
  ['goldbar', 1], ['ring', 1], ['tv', 3], ['captcha', 2], ['stopsign', 1],
];
SCRAP_TABLE.backrooms = [
  ['vhs', 10], ['floppies', 8], ['lamp', 6], ['chainletter', 3], ['pocketpet', 5], ['memecart', 6], ['canned', 8], ['bottles', 6], ['mug', 5],
  ['teeth', 5], ['duck', 5], ['clownhorn', 3], ['skull', 3], ['painting', 5], ['phone', 4], ['tv', 4], ['flipphone', 4], ['cdspindle', 5],
  ['nftframe', 4], ['usbidol', 2], ['animefig', 2], ['bell', 3], ['perfume', 3], ['key', 3], ['ring', 1], ['goldbar', 1], ['pickles', 3], ['magnify', 3],
];
SCRAP_TABLE.serverfarm = [
  ['bolt', 12], ['axle', 10], ['hdd', 10], ['motherboard', 9], ['gpu', 3], ['cryptocoin', 4], ['floppies', 5], ['cdspindle', 5], ['keyboard', 5],
  ['modem', 7], ['cog', 8], ['webcam', 3], ['headset', 3], ['robot', 3], ['usbidol', 2], ['flask', 3], ['tv', 3], ['key', 3], ['goldbar', 1],
  ['ring', 1], ['memecart', 3], ['captcha', 2], ['stopsign', 1],
];
SCRAP_TABLE.sewer = [
  ['skull', 8], ['bottles', 7], ['canned', 8], ['flipphone', 6], ['pager', 6], ['pocketpet', 4], ['duck', 8], ['chainletter', 3], ['teeth', 4],
  ['pot', 6], ['steering', 4], ['mug', 4], ['vhs', 5], ['cdspindle', 4], ['cryptocoin', 3], ['ring', 2], ['goldbar', 1], ['flask', 5], ['pickles', 4],
  ['airhorn', 3], ['clownhorn', 3], ['magnify', 3], ['key', 3], ['nftframe', 3], ['animefig', 2], ['stopsign', 2],
];
SCRAP_TABLE.hospital = [
  ['flask', 10], ['pager', 9], ['magnify', 5], ['bottles', 6], ['perfume', 4], ['webcam', 5], ['headset', 3], ['mug', 6], ['phone', 5],
  ['flipphone', 4], ['chainletter', 2], ['teeth', 6], ['skull', 5], ['pickles', 5], ['bell', 4], ['lamp', 3], ['tv', 4], ['keyboard', 4],
  ['printer', 3], ['trophy', 3], ['duck', 3], ['liketrophy', 3], ['animefig', 2], ['ring', 1], ['goldbar', 1], ['key', 4], ['canned', 4],
];
export const BIG_TABLE = [['vase', 10], ['statue', 4], ['amphora', 7], ['server', 5], ['aquarium', 5]];
BIG_TABLE.push(['cryptorig', 3], ['pctower', 5]);
// big physics valuables per interior theme (falls back to BIG_TABLE)
export const BIG_TABLES = {
  factory: [['server', 7], ['amphora', 6], ['vase', 6], ['statue', 3], ['aquarium', 4], ['cryptorig', 4], ['pctower', 5]],
  mansion: [['vase', 12], ['statue', 5], ['amphora', 7], ['aquarium', 6], ['pctower', 2]],
  mineshaft: [['statue', 4], ['amphora', 6], ['server', 4], ['cryptorig', 5], ['vase', 4]],
  office: [['pctower', 10], ['aquarium', 6], ['statue', 3], ['vase', 5], ['cryptorig', 2]],
  backrooms: [['amphora', 6], ['vase', 8], ['aquarium', 5], ['pctower', 5], ['statue', 3]],
  serverfarm: [['server', 12], ['cryptorig', 7], ['pctower', 8], ['amphora', 3]],
  sewer: [['statue', 5], ['amphora', 6], ['vase', 5], ['cryptorig', 3]],
  hospital: [['aquarium', 6], ['vase', 6], ['pctower', 6], ['server', 4]],
};
export const SCRAP_THEMES = Object.freeze(['factory', 'mansion', 'mineshaft', 'office', 'backrooms', 'serverfarm', 'sewer', 'hospital']);

/** Weighted [id, weight] scrap table for an interior theme id (unknown themes get the factory mix). */
export function scrapTableFor(theme) {
  const t = SCRAP_TABLE[theme];
  return t && t.length ? t : SCRAP_TABLE.factory;
}
/** Weighted [id, weight] table of big physics valuables for an interior theme id. */
export function bigTableFor(theme) {
  const t = BIG_TABLES[theme];
  return t && t.length ? t : BIG_TABLE;
}

export const FISH_TABLE = [
  { id: 'fish_kefal', w: 40, difficulty: 0.25, rarity: 'common' },
  { id: 'fish_lufer', w: 22, difficulty: 0.45, rarity: 'uncommon' },
  { id: 'fish_levrek', w: 15, difficulty: 0.55, rarity: 'rare' },
  { id: 'fish_boot', w: 14, difficulty: 0.1, rarity: 'common' },
  { id: 'fish_eel', w: 6, difficulty: 0.8, rarity: 'epic' },
  { id: 'fish_golden', w: 3, difficulty: 0.95, rarity: 'legendary' },
];

// Terminal store stock (credits)
export const STORE_ITEMS = ['flashlight', 'proflash', 'walkie', 'shovel', 'pipe', 'stungrenade', 'medkit', 'adrenaline', 'boombox', 'spraypaint', 'glowstick', 'rod', 'lockpick', 'shells', 'taser', 'jetpack',
  'ladder', 'booster', 'inhaler', 'beltbag', 'adblock',
  'bag_fieldpack', 'bag_hauler', 'arm_hoodie', 'arm_riot', 'arm_kevlar', 'trk_dongle', 'trk_charm', 'trk_amulet'];
/** Wave-1 gear ids (bags / armor / trinkets) for loot tables and the store. */
export const GEAR_IDS = Object.freeze(['beltbag', 'bag_fieldpack', 'bag_hauler', 'bag_void', 'arm_hoodie', 'arm_riot', 'arm_kevlar', 'trk_dongle', 'trk_charm', 'trk_amulet']);

// Ship upgrades (credits)
export const SHIP_UPGRADES = {
  loudhorn: { name: 'Loud Horn', price: 100, desc: 'A deafening horn to call your crew back.' },
  teleporter: { name: 'Teleporter', price: 900, desc: 'Beam a crewmate (and their body) back to the ship.' },
  signal: { name: 'Signal Translator', price: 400, desc: 'Send short messages to crew visors via "transmit".' },
  lightsplus: { name: 'Brighter Floodlight', price: 300, desc: 'Ship floodlight reaches twice as far.' },
  arcade: { name: 'Arcade Cabinet', price: 0, desc: 'FLAPPY PHISH. Always installed.', owned: true },
  disco: { name: 'Disco Ball', price: 60, desc: 'Essential equipment.' },
};

export function registerItem(def) {
  if (!def?.id) throw new Error('item needs id');
  ITEMS[def.id] = localizeFields({ hands: 1, weight: 5, kind: 'scrap', ...def }, ['name', 'tip', 'desc']);
  return ITEMS[def.id];
}

export function itemDef(id) { return ITEMS[id] || { id, name: humanizeId(id), kind: 'scrap', value: [5, 10], weight: 5, hands: 1 }; }
export function isSellable(def) { return ['scrap', 'big', 'fish', 'drop'].includes(def.kind) || (def.value && def.kind !== 'tool'); }
