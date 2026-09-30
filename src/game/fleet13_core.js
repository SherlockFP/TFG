import { sanitize, blankState, effects, routeMul, MODULES, ROMAN } from './shipyard_core.js';

// These are complete, walkable shipyard configurations, not paint skins.
export const FLEET13 = {
  courier: { name: 'Packet Courier', price: 0, paint: 'orange', modules: {}, tip: 'Compact hull. No extra route weight; build your own rooms.' },
  hauler: { name: 'Cache Hauler', price: 520, paint: 'sun', modules: { R1: { id: 'cargo', t: 2 }, R2: { id: 'engine', t: 1 } }, tip: 'Long freight hull. Cargo sale bonus and engine room; heavier routes.' },
  rescue: { name: 'Recovery Vessel', price: 680, paint: 'sea', modules: { N1: { id: 'medbay', t: 1 }, N2: { id: 'bunk', t: 1 } }, tip: 'Twin side rooms. Mid-shift body revival and rested crew buff.' },
  survey: { name: 'Signal Surveyor', price: 880, paint: 'violet', modules: { N1: { id: 'lab', t: 1 }, N2: { id: 'workshop', t: 1 }, DECK: { id: 'obs', t: 1 } }, tip: 'Research wing and roof observatory. Better samples, crafting and scan.' },
};
export function fleetLayout(id) {
  const def = Object.hasOwn(FLEET13, id) ? FLEET13[id] : FLEET13.courier;
  return sanitize({ ...blankState(), m: def.modules, name: def.name.slice(0, 16), paint: { c1: def.paint, c2: 'slate', pat: 'hazard' } });
}
export function sanitizeFleet13(raw) {
  const owned = {};
  for (const id of Object.keys(FLEET13)) if (raw?.owned && Object.hasOwn(raw.owned, id) && raw.owned[id]) owned[id] = sanitize(raw.owned[id]);
  const selected = Object.hasOwn(owned, raw?.selected) ? raw.selected : null;
  return { v: 1, docked: raw?.docked !== false, selected, owned };
}
export function purchaseFleet13(state, wallet, id) {
  if (!Object.hasOwn(FLEET13, id) || !state.docked) return { ok: false };
  if (!state.owned[id]) {
    const price = FLEET13[id].price;
    if (!Number.isFinite(wallet.credits) || wallet.credits < price) return { ok: false };
    wallet.credits -= price;
    state.owned[id] = fleetLayout(id);
  }
  state.selected = id;
  return { ok: true, layout: state.owned[id] };
}

/** Actual fitted rooms and their current effects; owned upgrades take priority over brochure presets. */
export function fleetQuote13(state, id, credits = 0) {
  if (!Object.hasOwn(FLEET13, id)) return null;
  const layout = sanitize(state?.owned?.[id] || fleetLayout(id));
  const owned = Object.hasOwn(state?.owned || {}, id);
  const price = owned ? 0 : FLEET13[id].price;
  return {
    owned, price, shortfall: Math.max(0, price - (Number.isFinite(credits) ? credits : 0)), layout,
    rooms: Object.values(layout.m).map(({ id, t }) => ({ id, name: MODULES[id].name, tier: ROMAN[t] })),
    routePct: Math.round((routeMul(layout) - 1) * 1000) / 10, effects: effects(layout),
  };
}

/** Same placement rule as Game.spawnInShip, shared by dispatch and late arrivals. */
export function fleetSpawnIndex13(id, count) {
  let h = 0;
  for (const ch of String(id || 'x')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return count > 0 ? Math.abs(h) % count : 0;
}
