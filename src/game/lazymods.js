// Lazy module chunks (wave 7 perf2). The heavy, session-only feature modules are NOT part of the first-load bundle: they are dynamic-imported
// (own Vite chunks) and installed exactly like before through game.useModule(name, installX). main.js awaits preloadLazyModules() before
// `new Game(...)` (and prefetches in idle time after boot), so the synchronous install order and every mods.on hook are unchanged.
// Contract: LAZY table key -> loader returning the module namespace; installer wrappers throw (caught by useModule) if the chunk is missing.

export const LAZY = {
  arcade: () => import('./arcade.js'),
  boardgame: () => import('./boardgame.js'),
  voyage: () => import('./voyage.js'),
  homeworld: () => import('./homeworld.js'),
  homeworld2: () => import('./homeworld2.js'),
  story: () => import('./story.js'),
  dance: () => import('./dance.js'),
  cemotes: () => import('./cemotes.js'),
  backrooms: () => import('./backrooms.js'),
  bosses: () => import('./bosses.js'),
  mirror: () => import('./mirror.js'),
  siege: () => import('./siege.js'),
  anomaly: () => import('./anomaly.js'),
  horror: () => import('./horror.js'),
  pets: () => import('./pets.js'),
  survival: () => import('./survival.js'),
  shipyard: () => import('./shipyard.js'),
  worlds2: () => import('./worlds2.js'),
  maps5: () => import('./maps5.js'),
};

const loaded = Object.create(null);
let pending = null;

/** Load every lazy chunk (idempotent, concurrent-safe). Resolves with the list of keys that failed (empty = all good); never rejects; a failed load is retried on the next call. */
export function preloadLazyModules(table = LAZY) {
  if (pending) return pending;
  const keys = Object.keys(table).filter((k) => !loaded[k]);
  if (!keys.length) return Promise.resolve([]);
  pending = Promise.all(keys.map((k) => Promise.resolve().then(() => table[k]()).then((m) => { loaded[k] = m; return null; }, (e) => { console.warn('[lazy] ' + k, e); return k; })))
    .then((r) => { pending = null; return r.filter(Boolean); });
  return pending;
}

export const isLazyLoaded = (k) => !!loaded[k];
/** test hook */
export function _setLazyLoaded(k, mod) { if (mod) loaded[k] = mod; else delete loaded[k]; }

/** (game) => module API, delegating to the preloaded chunk's `exportName`. */
export function lazyInstall(key, exportName) {
  return (game) => {
    const m = loaded[key];
    if (!m || typeof m[exportName] !== 'function') throw new Error('lazy module not loaded: ' + key);
    return m[exportName](game);
  };
}

export const installArcade = lazyInstall('arcade', 'installArcade');
export const installBoardGame = lazyInstall('boardgame', 'installBoardGame');
export const installVoyage = lazyInstall('voyage', 'installVoyage');
export const installHomeworld = lazyInstall('homeworld', 'installHomeworld');
export const installHomeworld2 = lazyInstall('homeworld2', 'installHomeworld2');
export const installStory = lazyInstall('story', 'installStory');
export const installDance = lazyInstall('dance', 'installDance');
export const installCreatureEmotes = lazyInstall('cemotes', 'installCreatureEmotes');
export const installBackrooms = lazyInstall('backrooms', 'installBackrooms');
export const installBosses = lazyInstall('bosses', 'installBosses');
export const installMirror = lazyInstall('mirror', 'installMirror');
export const installSiege = lazyInstall('siege', 'installSiege');
export const installAnomaly = lazyInstall('anomaly', 'installAnomaly');
export const installHorror = lazyInstall('horror', 'installHorror');
export const installPets = lazyInstall('pets', 'installPets');
export const installSurvival = lazyInstall('survival', 'installSurvival');
export const installShipyard = lazyInstall('shipyard', 'installShipyard');
export const installWorlds2 = lazyInstall('worlds2', 'installWorlds2');
export const installMaps5 = lazyInstall('maps5', 'installMaps5');
