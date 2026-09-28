// Display-name path: makes the English names / descriptions in the game data tables resolve through t() at read time
// (see localizeFields in core/i18n.js). Internal ids never change. Imported once from main.js.
import { localizeDeep } from '../core/i18n.js';
import { ITEMS, RARITY, SHIP_UPGRADES } from '../game/items.js';
import { CREATURES, VARIANTS, AFFIXES } from '../game/creatures.js';
import { MOONS, WEATHER, BIOMES } from '../game/moons.js';
import { MARKET, MASTERY, SKILLS, MASTERY_TIERS } from '../game/progression.js';
import { WEEKLY_MODS } from '../game/weekly.js';
import { MODIFIERS } from '../game/moongen.js';
import { SUIT_COLORS, HATS } from '../models/avatar.js';
import { RECIPES, BLUEPRINTS } from '../game/recipes.js';
import { MILESTONES } from '../game/collection.js';
import { STRANGE } from '../game/research.js';
import { EMOTES } from '../game/emotes.js';

const NAME = ['name'];
const NAME_TIP = ['name', 'tip', 'desc'];
const NAME_LORE = ['name', 'lore', 'note', 'desc'];
const NAME_DESC = ['name', 'short', 'desc'];

localizeDeep(ITEMS, NAME_TIP, 1);
localizeDeep(RARITY, NAME, 1);
localizeDeep(SHIP_UPGRADES, NAME_DESC, 1);
localizeDeep(CREATURES, NAME_LORE, 2);
localizeDeep(VARIANTS, NAME_LORE, 3);
localizeDeep(AFFIXES, NAME_LORE, 1);
localizeDeep(MOONS, NAME_DESC, 1);
localizeDeep(WEATHER, NAME, 1);
localizeDeep(BIOMES, NAME, 1);
localizeDeep(MARKET, NAME_DESC, 3);
localizeDeep(SKILLS, NAME_DESC, 1);
localizeDeep(MASTERY_TIERS, NAME, 1);
localizeDeep(WEEKLY_MODS, NAME_DESC, 1);
localizeDeep(MODIFIERS, NAME_DESC, 1);
localizeDeep(SUIT_COLORS, NAME, 1);
localizeDeep(HATS, NAME, 1);
// MASTERY keeps its own tr/trDesc (used by the TR panels); RU falls back to the dictionary through name/desc
localizeDeep(MASTERY, NAME_DESC, 1);
localizeDeep(RECIPES, ['name', 'desc'], 1);
localizeDeep(BLUEPRINTS, ['name', 'desc'], 1);
localizeDeep(MILESTONES, NAME, 2);
localizeDeep(STRANGE, ['tip', 'lore'], 2);
localizeDeep(EMOTES, NAME, 1);
