// RU bulk dictionaries (pure data keyed by the English string). Registered by core/i18n.js.
// Add a new area as src/i18n/ru_<area>.js (export default { 'English': 'Русский' }) and list it here.
import core from './ru_core.js';
import lore from './ru_lore.js';
import names from './ru_names.js';
import local from './ru_local.js';
import wrap1 from './ru_wrap1.js';
import manual from './ru_manual.js';
import ach from './ru_ach.js';
import local2 from './ru_local2.js';
import data2 from './ru_data2.js';
import trade from './ru_trade.js';   // [trade]
import ship2 from './ru_ship2.js';   // [ship2]

export const RU_PARTS = [core, lore, names, local, wrap1, manual, ach, local2, data2, trade, ship2];
