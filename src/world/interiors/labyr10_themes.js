// LABYR10 (wave 10): the two new labyrinth interiors, registered in interiors/index.js with one line. Ids are fixed: moons use interior: 'deadmall' / 'funhouse'.
import { DEADMALL } from './labyr10_mall.js';
import { FUNHOUSE } from './labyr10_fun.js';
import { addTranslations } from '../../core/i18n.js';
import { TR, RU } from '../../game/labyr10_text.js';

addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

export const LABYR10_THEMES = { deadmall: DEADMALL, funhouse: FUNHOUSE };
export const LABYR10_IDS = Object.freeze(Object.keys(LABYR10_THEMES));
