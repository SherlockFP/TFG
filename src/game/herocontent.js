// HERO CONTENT module (wave 8, docs/wave8/herocontent.md): themed scrap for the metro / greenhouse / prison / tower interiors.
// The tables and items are registered by herocontent_core.js at import; the module re-registers them (so names and tips follow the language
// chosen at game start) and hooks the twelve art-pass models into the mod item-model registry (inventory icons render from these). No net messages.
import { registerHeroContent, MODEL_IDS } from './herocontent_core.js';
import { createArtModel } from '../models/artpass.js';

export function installHerocontent(game) {
  registerHeroContent(true);
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || game.mods;
  if (mm?.itemModels) for (const id of MODEL_IDS) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => createArtModel(id));
  return { dispose() {} };
}
