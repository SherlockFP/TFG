// LABYR12 (wave 12): the two new labyrinth interiors, registered in interiors/index.js with one line. Ids are fixed: moons use interior: 'darkweb' / 'hotel'.
import { DARKWEB } from './labyr12_darkweb.js';
import { HOTEL } from './labyr12_hotel.js';
import { addTranslations } from '../../core/i18n.js';
import { TR, RU } from '../../game/labyr12_text.js';

addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

export const LABYR12_THEMES = { darkweb: DARKWEB, hotel: HOTEL };
export const LABYR12_IDS = Object.freeze(Object.keys(LABYR12_THEMES));
