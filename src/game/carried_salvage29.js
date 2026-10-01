import { isSellable } from './items.js';

// Hotbar and pockets are views of the same native item custody, never separate loot.
export function carriedSalvage29(game) {
  if (!game?.selfId || !game.items?.get) return [];
  const out = [], seen = new Set();
  const add = id => {
    if (typeof id !== 'string' || seen.has(id)) return;
    seen.add(id);
    const it = game.items.get(id);
    if (!it || it.id !== id || it.state !== 'held' || it.holder !== game.selfId ||
        (it.inv && it.inv.k !== 'bag') || it.type === 'body' || it.soulbound || !isSellable(it.def || {})) return;
    out.push(it);
  };
  for (const id of game.player?.slots || []) add(id);
  for (const it of game.inventory?.bagItems?.() || []) add(it?.id);
  return out;
}
