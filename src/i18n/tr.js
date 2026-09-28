// TR bulk dictionaries (pure data keyed by the English string). Registered by core/i18n.js.
// Add a new area as src/i18n/tr_<area>.js (export default { 'English': 'Türkçe' }) and list it here.
import core from './tr_core.js';
import names from './tr_names.js';
import local from './tr_local.js';
import wrap1 from './tr_wrap1.js';
import manual from './tr_manual.js';
import data2 from './tr_data2.js';

export const TR_PARTS = [core, names, local, wrap1, manual, data2];
