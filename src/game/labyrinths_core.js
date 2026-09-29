// [labyrinths] pure rules for the labyrinth interiors (no THREE, no DOM): docs/wave8/labyrinths.md
import { RNG, hashString } from '../core/rng.js';
import './labyrinths_i18n.js';   // TR + RU strings are registered with the core so the terminal / moon list has them at boot

export const LAB_IDS = ['metro', 'greenhouse'];
/** the mechanic line shown on the landing card + terminal moon info */
export const LAB_HINT = {
  metro: 'A ghost train runs the tunnel. Horn + red lights = get into an alcove.',
  greenhouse: 'Vine walls can be cut with a melee weapon. Spore puffs blur your vision.',
};

export const TRAIN = { speed: 30, len: 24, hw: 1.45, warn: 7, dmg: 60, knock: 9, gapMin: 55, gapMax: 85, firstMin: 40, firstMax: 60 };
export const SPORE = { period: 16, life: 6.5, radius: 3.4, blur: 4.5 };
export const VINE = { reach: 3.2, hits: 1 };

/** seconds until the next train; deterministic per (seed, n) so the host never needs a shared RNG stream */
export function trainGap(seed, n) {
  const R = new RNG((hashString('train:' + seed) ^ Math.imul(n + 1, 2654435761)) >>> 0);
  return n === 0 ? R.float(TRAIN.firstMin, TRAIN.firstMax) : R.float(TRAIN.gapMin, TRAIN.gapMax);
}

/**
 * Train state for one pass. st = { dir: 1 (towards +z, terminus -> entrance) | -1, t: seconds since the horn }, spec = { zA, zB, len, speed, warn }.
 * Returns { phase: 'warn' | 'run' | 'done', visible, z (centre), done }. The train enters fully outside the tunnel span and leaves the same way.
 */
export function trainState(st, spec) {
  const { zA, zB, len, speed, warn } = spec;
  if (st.t < warn) return { phase: 'warn', visible: false, z: NaN, done: false, warnLeft: warn - st.t };
  const run = st.t - warn, span = zB - zA + len * 2;
  const s = speed * run;
  if (s > span) return { phase: 'done', visible: false, z: NaN, done: true };
  const z = st.dir > 0 ? zA - len + s : zB + len - s;
  return { phase: 'run', visible: true, z, done: false };
}

/** does the train (centre z, lane centre xC, half-width hw, length len) hit a body at (x, z)? Hugging the tunnel wall (|dx| >= hw) is safe. */
export function trainHits(trainZ, p, spec, r = 0.15) {
  return Math.abs(p.x - spec.xC) < spec.hw + r && Math.abs(p.z - trainZ) < spec.len / 2 + r;
}

/** which interior a generated moon (runKey, sector index, slot) swaps to: null = keep. Own hash stream, never shifts the older rolls. */
export function labInterior(runKey, index, k, biome, tier, interior) {
  if (tier < 1) return null;
  const R = new RNG(hashString(`lab:${runKey}|${index}|${k}`));
  const pMetro = 0.1 + 0.02 * tier + (biome === 'datascape' || biome === 'soviet' || biome === 'ashfield' ? 0.1 : 0);
  const pGreen = 0.08 + 0.01 * tier + (biome === 'jungle' || biome === 'swamp' || biome === 'servermarsh' ? 0.22 : biome === 'hills' ? 0.08 : 0);
  const a = R.next(), b = R.next();
  if (a < pMetro) return 'metro';
  if (b < pGreen) return 'greenhouse';
  return null;
}
