/**
 * TFG — minigame registry.
 *
 * Every factory: create(opts) -> { el, update(dt), destroy() }
 *   opts: { container, difficulty 0..1, rng, sfx(name), onDone(result), ...specific }
 *   result always includes { success, cancelled }.
 *
 * Importing this module pulls in minigames.css (Vite). If you import a single
 * minigame module directly, import './minigames.css' yourself.
 */
import './minigames.css';
import { createArcade, drawArcadeAttract } from './arcade.js';
import { createFishing } from './fishing.js';
import { createSafe } from './safe.js';
import { createFuse } from './fuse.js';
import { createLockpick } from './lockpick.js';
import { createSlots, evaluateSpin, PAYTABLE, SYMBOLS } from './slots.js';

export const MINIGAMES = {
  arcade: createArcade,
  fishing: createFishing,
  safe: createSafe,
  fuse: createFuse,
  lockpick: createLockpick,
  slots: createSlots,
};

export {
  createArcade,
  drawArcadeAttract,
  createFishing,
  createSafe,
  createFuse,
  createLockpick,
  createSlots,
  evaluateSpin,
  PAYTABLE,
  SYMBOLS,
};

export default MINIGAMES;
