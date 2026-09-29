// nvgear_core: pure data + math for the buyable Night Vision Goggles and the spare cell (no three.js, node-testable).
// Goggles are battery items (battery = seconds of use, drained 1/s by actions.updateBatteries while `on`), sold in the Company Store.
export const NV_GOGGLES = {
  nvg1: { id: 'nvg1', name: 'Night Vision Goggles Mk I', kind: 'tool', price: 85, weight: 2, hands: 1, battery: 90, nv: { mk: 1, resist: 1, gain: 1.45 },
    tip: 'LMB: goggles on / off. Green PSX view, 90 s of battery. Bright lights and flashes blind you. Charge them at the ship charger.' },
  nvg2: { id: 'nvg2', name: 'Night Vision Goggles Mk II', kind: 'tool', price: 220, weight: 2, hands: 1, battery: 240, nv: { mk: 2, resist: 0.5, gain: 1.6 },
    tip: 'LMB: goggles on / off. Brighter picture, 240 s of battery, halves the glare of bright lights. Charge them at the ship charger.' },
};
export const NV_CELL = { id: 'nvcell', name: 'Spare Battery Cell', kind: 'consumable', price: 30, weight: 1, hands: 1,
  tip: 'LMB: refills 60% of the emptiest battery item you carry (goggles, flashlight, walkie...), then it is used up.' };
export const CELL_FRACTION = 0.6;
export const CHARGE_SECONDS = 3;
export const LOW_BATTERY = 0.15;   // fraction of capacity where the picture starts to flicker

/** seconds of white-out for a screen flash of `amount` (0..1); Mk II halves it, Mk I is fully dazzled */
export const dazzleSeconds = (amount, resist = 1) => Math.min(3.2, (0.6 + 2 * Math.max(0, amount)) * resist);
/** extra drain multiplier while the goggles run: colder / glitchier situations cost more (1 = normal) */
export const drainMul = (o = {}) => 1 + (o.cold ? 0.5 : 0) + (o.glitch ? 0.5 : 0);
/** battery after a spare cell: +CELL_FRACTION of capacity, clamped */
export const afterCell = (battery, cap) => Math.min(cap, (battery || 0) + cap * CELL_FRACTION);
/** index of the emptiest (by fraction) battery item in [{battery, cap}], or -1 when all are full / none */
export function emptiest(list) {
  let best = -1, bf = 0.999;
  list.forEach((e, i) => { if (!e || !(e.cap > 0)) return; const f = (e.battery || 0) / e.cap; if (f < bf) { bf = f; best = i; } });
  return best;
}
