// Content built on the downloaded CC0 models: extra scrap / found weapons and two animated creatures.
import * as THREE from 'three';
import { registerItem, SCRAP_TABLE } from './items.js';
import { ITEMS as MS_ITEMS } from './items.js';
import { MINESHAFT_EXT_SCRAP } from '../world/mineshaft.js';
import { registerCreature } from './creatures.js';
import { MOONS } from './moons.js';
import { chaser, STATE_SOUNDS } from '../entities/creatures.js';
import { hasExt, extInstance, extAnimated } from '../world/extmodels.js';

const UPRIGHT_TO_FORWARD = new THREE.Euler(-Math.PI / 2, 0, 0);

// [id, model, name, value, weight, hands, tableWeight, extra]
const SCRAP = [
  ['x_clock', 'retro_clock', 'Wall Clock', [30, 60], 8, 1, 5],
  ['x_briefcase', 'scrap_briefcase', 'Briefcase', [60, 110], 12, 1, 4],
  ['x_floppy', 'scrap_floppy', 'Floppy Disk', [10, 22], 0.5, 1, 6],
  ['x_multimeter', 'scrap_multimeter', 'Multimeter', [30, 52], 2, 1, 5],
  ['x_keyring', 'scrap_keyring', 'Keyring', [8, 18], 0.5, 1, 5],
  ['x_padlock', 'scrap_padlock', 'Padlock', [12, 26], 2, 1, 5],
  ['x_heater', 'scrap_heater', 'Space Heater', [40, 72], 20, 1, 4],
  ['x_goldbars', 'kk_gold_bars', 'Stack of Gold Bars', [260, 380], 95, 2, 1],
  ['x_silverbar', 'kk_silver_bar', 'Silver Bar', [60, 110], 30, 1, 3],
  ['x_nuggets', 'kk_gold_nuggets', 'Gold Nuggets', [90, 150], 10, 1, 2],
  ['x_copper', 'kk_copper_nugget', 'Copper Nugget', [20, 40], 6, 1, 5],
  ['x_jerrycan', 'kk_jerrycan', 'Jerrycan', [20, 36], 25, 1, 4],
  ['x_chest', 'ks_chest', 'Old Chest', [120, 200], 50, 2, 2],
  ['x_plate', 'retro_plate', 'Fancy Plate', [20, 44], 3, 1, 4, { fragile: 0.8 }],
  ['x_bottle', 'psx_glass_bottle', 'Glass Bottle', [5, 16], 2, 1, 5, { fragile: 1 }],
  ['x_almondwater', 'tfg_almond_water', 'Almond Water', [14, 30], 1, 1, 6],
  ['x_router', 'tfg_router', 'Haunted Wi-Fi Router', [22, 44], 2, 1, 5],
  ['x_blade', 'tfg_server_blade', 'Hot-Swap Blade', [40, 72], 9, 1, 4],
  ['x_crt', 'tfg_crt_monitor', 'Beige Box Monitor', [48, 86], 22, 2, 3, { fragile: 0.6 }],
  ['x_laptop', 'kf_laptop', 'Burner Laptop', [50, 90], 4, 1, 3, { fragile: 0.5 }],
  ['x_radio', 'kf_radio', 'Pirate Radio', [26, 46], 6, 1, 4],
  ['x_ritualcandle', 'hb_skull_candle', 'Ritual Candle', [30, 58], 2, 1, 3],
  ['x_ballmouse', 'kf_computer_mouse', 'Ball Mouse', [6, 14], 0.5, 1, 5],
];
// found weapons (sellable, usable)
const WEAPONS = [
  ['x_bat', 'scrap_baseball_bat', 'Baseball Bat', [18, 30], 6, { dmg: 18, cd: 0.65, reach: 2.2, charge: true, rarity: 'uncommon' }, 3],
  ['x_wrench', 'scrap_wrench', 'Wrench', [16, 28], 5, { dmg: 13, cd: 0.5, reach: 1.9, rarity: 'common' }, 4],
  ['x_axe', 'ks_tool_axe', 'Fire Axe', [30, 50], 9, { dmg: 30, cd: 0.9, reach: 2.3, charge: true, rarity: 'rare' }, 2],
  ['x_pickaxe', 'ks_tool_pickaxe', 'Pickaxe', [26, 44], 12, { dmg: 26, cd: 1.0, reach: 2.3, charge: true, rarity: 'uncommon' }, 2],
  ['x_hammer', 'ks_tool_hammer', 'Hammer', [12, 24], 4, { dmg: 12, cd: 0.45, reach: 1.8, rarity: 'common' }, 3],
  ['x_knife', 'retro_knife', 'Kitchen Knife', [10, 20], 1, { dmg: 11, cd: 0.35, reach: 1.7, rarity: 'common' }, 3],
];

// extra interior themes each ext item also spawns in (besides factory + mansion for scrap, factory for weapons)
const EXTRA_THEMES = {
  x_clock: ['office', 'backrooms', 'hospital'], x_briefcase: ['office', 'hospital'], x_floppy: ['office', 'backrooms', 'serverfarm'],
  x_multimeter: ['serverfarm', 'hospital'], x_keyring: ['office', 'backrooms', 'serverfarm', 'sewer'], x_padlock: ['office', 'serverfarm', 'sewer'],
  x_heater: ['office', 'backrooms'], x_copper: ['sewer'], x_jerrycan: ['sewer'], x_plate: ['office', 'backrooms', 'hospital'],
  x_bottle: ['backrooms', 'sewer', 'hospital'], x_silverbar: ['serverfarm'],
  x_bat: ['office', 'backrooms'], x_wrench: ['serverfarm', 'sewer'], x_axe: ['office', 'hospital'], x_pickaxe: ['sewer'],
  x_hammer: ['serverfarm', 'sewer'], x_knife: ['hospital', 'backrooms'],
  x_almondwater: ['backrooms', 'backrooms', 'office'], x_router: ['office', 'serverfarm', 'backrooms'], x_blade: ['serverfarm', 'serverfarm'],
  x_crt: ['office', 'serverfarm', 'hospital'], x_laptop: ['office', 'hospital', 'serverfarm'], x_radio: ['sewer', 'backrooms'],
  x_ritualcandle: ['sewer', 'backrooms'], x_ballmouse: ['office', 'serverfarm'],
};
function addToThemes(id, w) {
  for (const th of EXTRA_THEMES[id] || []) (SCRAP_TABLE[th] || (SCRAP_TABLE[th] = [])).push([id, w]);
}

export function registerExtContent() {
  const mm = window.__kefalMods;
  if (!mm) return;
  for (const [id, model, name, value, weight, hands, w, extra] of SCRAP) {
    if (!hasExt(model)) continue;
    registerItem({ id, name, kind: 'scrap', value, weight, hands, ...(extra || {}) });
    SCRAP_TABLE.factory.push([id, w]);
    SCRAP_TABLE.mansion.push([id, w]);
    addToThemes(id, w);
    mm.itemModels.set(id, () => extInstance(model) || new THREE.Group());
  }
  for (const [id, model, name, value, weight, stats, w] of WEAPONS) {
    if (!hasExt(model)) continue;
    registerItem({ id, name, kind: 'weapon', value, weight, hands: 1, price: 0, ...stats });
    SCRAP_TABLE.factory.push([id, w]);
    addToThemes(id, w);
    mm.itemModels.set(id, () => {
      const o = extInstance(model);
      if (!o) return new THREE.Group();
      // stand-up tools become "forward" (-Z) with the handle at the origin
      o.userData.inner.rotation.copy(UPRIGHT_TO_FORWARD);
      return o;
    });
  }

  // mining-themed ext scrap/tools for the mineshaft interior (only items whose model actually loaded)
  if (SCRAP_TABLE.mineshaft) for (const [id, w] of Object.entries(MINESHAFT_EXT_SCRAP)) if (MS_ITEMS[id]) SCRAP_TABLE.mineshaft.push([id, w]);
  // --- creatures ---
  const chase = (opts) => {
    const base = chaser(opts);
    return (c, dt, M) => {
    // dance / calm down near music like the sludge
    if (opts.dances && M.game.hostBoomboxNear(c.pos, 12)) { c.setState('dance'); return; }
    if (c.state === 'dance') c.setState('idle');
    base(c, dt, M);
    };
  };
  if (hasExt('mon_skeleton')) {
    registerCreature('skeleton', {
      name: 'Skeleton', hp: 110, dmg: 22, walk: 2.1, run: 5.8, power: 1.5, xp: 85, coin: 14, zone: 'in', radius: 0.4, height: 1.8,
      drop: ['skull', 0.5], lore: 'Former employees. Still on the clock. They rattle before they run.',
    }, chase({ sight: 16, hearR: 18, reach: 1.4, cd: 1.1 }));
    mm.creatureModels.set('skeleton', () => extAnimated('mon_skeleton', {
      idle: ['Idle'], walk: ['Running'], run: ['Running'], attack: ['Attack'], dead: ['Death'], hurt: ['Idle'], stunned: ['Idle'],
    }, { scale: 1.0, tint: 0xb8b4a0 }));
    for (const [moon, wgt] of [['palamut', 12], ['cipura', 14], ['orkinos', 8], ['lufer', 4]]) if (MOONS[moon]) MOONS[moon].creatures.skeleton = wgt;
  }
  STATE_SOUNDS.skeleton = { run: ['voice_skeleton_anger', 1], attack: ['voice_skeleton_attack', 1], dead: ['voice_skeleton_die', 1], idle: ['voice_skeleton_grunt', 0.5] };
  STATE_SOUNDS.robot = { run: ['vo_malfunction', 1], attack: ['impact_metal_2', 1], dead: ['vo_deactivated', 1], dance: ['hitech_2', 0.8] };
  if (hasExt('mon_robot')) {
    registerCreature('robot', {
      name: 'Security Bot', hp: 260, dmg: 35, walk: 2.0, run: 6.4, power: 2.5, xp: 180, coin: 30, zone: 'in', radius: 0.6, height: 2.0,
      drop: ['cog', 0.8], lore: 'Old Company security unit. Punches first, audits later. Weak to music, strangely.',
    }, chase({ sight: 18, hearR: 14, reach: 1.7, cd: 1.4, dances: true }));
    mm.creatureModels.set('robot', () => extAnimated('mon_robot', {
      idle: ['Idle'], walk: ['Walking'], run: ['Running'], attack: ['Punch'], dead: ['Death'], hurt: ['No'], stunned: ['No'], dance: ['Dance'],
    }, { scale: 1.05, tint: 0x9a8f7a }));
    for (const [moon, wgt] of [['levrek', 10], ['orkinos', 10], ['lufer', 5], ['hamsi', 2]]) if (MOONS[moon]) MOONS[moon].creatures.robot = wgt;
  }
}

