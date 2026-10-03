import { wrapMethod } from './dailyEvents.js';
import { earlyHaul34Handling } from './earlyhaul34_text.js';

const GLASS = 'indexedglass27';
const append = (sub, cue) => sub?.includes(cue) ? sub : [sub, cue].filter(Boolean).join(' · ');

/** Handling text only; native ray/range, cargo actions and scan admission stay owners. */
export function installEarlyHaul34Presentation(game) {
  let disposed = false;
  const restore = wrapMethod(game, 'findInteraction', old => function (...args) {
    const target = old.apply(this, args);
    if (disposed || game.destroyed || target?.bigItem?.type !== GLASS) return target;
    return { ...target, sub: append(target.sub, earlyHaul34Handling(game)) };
  });
  const scanOff = game.mods?.on?.('scanLabels', (labels, eye, fwd, g) => {
    if (disposed || game.destroyed || g && g !== game || !Array.isArray(labels)) return;
    const cue = earlyHaul34Handling(game);
    // Annotate only labels already admitted by actions.scan; never add an item
    // through walls or change its native position, value, rarity or name.
    for (const label of labels) if (label.type === GLASS) label.sub = append(label.sub, cue);
  });
  return { dispose() {
    if (disposed) return;
    disposed = true;
    scanOff?.();
    // wrapMethod restores only our current wrapper. If another module wraps it
    // later, its method stays intact and our captured wrapper becomes a no-op.
    restore();
  } };
}
