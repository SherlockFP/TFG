// LABYR12 pure rules (wave 12, docs/wave12/labyr12.md): no three.js, no DOM. Shared by the world builders (world/interiors/labyr12_*.js), the runtime (game/labyr12.js) and the test.
//   darkweb  ECHOLOCATION: any loud noise (a knock on M, a sprinting step, a hard item drop, a decoy, a gunshot) sends a sonar pulse that draws the tunnel walls as a
//            glowing shell for ~1.6 s, expanding from the source. Every noise already alerts creatures (creatures.noise), so the pulse is the map AND the alarm.
//   hotel    ELEVATOR: one shaft, a real moving car. Doors close after a 3 s chime warning, the ride takes 5-8 s, whoever is left outside waits for the next trip.
import { RNG, hashString } from '../core/rng.js';

export const LAB12_IDS = ['darkweb', 'hotel'];

/** the landing-card / terminal mechanic line (English is the i18n key) */
export const LAB12_HINT = {
  darkweb: 'Pitch black. Press M to knock: a sonar pulse maps the tunnels, and everything nearby hears it. Sprinting and loud noises ping too.',
  hotel: 'One elevator serves the floors. Doors close 3 s after the chime. The panel is missing a floor: find the stairs.',
};

// ------------------------------------------------------------------------------------------------ dark web: echolocation
export const KNOCK = {
  key: 'KeyM',          // the explicit ping (G is "drop", P is the team marker)
  cd: 2.6,              // seconds between two knocks of one player (host-checked per player)
  loud: 1.4,            // creatures.noise strength of a knock
  minLoud: 0.5,         // any other noise at least this loud also draws a pulse (sprint step 0.7, a hard drop 0.5, a decoy ...); a walking step (0.3) does not
  life: 1.6,            // seconds a pulse stays on screen
  speed: 22,            // wave-front speed m/s
  maxPulses: 4,         // the shader takes 4 (oldest is dropped)
  gap: 0.22,            // host: pulses closer together than this are merged (sprint steps + a decoy at once)
};
/** how far a noise of strength `loud` lights the tunnels (m) */
export function pulseRadius(loud) { return Math.min(26, 8 + 9 * Math.min(2, Math.max(0, loud))); }
/** does a noise draw a pulse? */
export const drawsPulse = (loud) => Number(loud) >= KNOCK.minLoud;
/** state of one pulse at `age` seconds: front radius (m), overall fade 0..1 (1 at the start), done flag */
export function pulseAt(radius, age) {
  const front = Math.min(radius, age * KNOCK.speed);
  const k = Math.max(0, 1 - age / KNOCK.life);
  return { front, fade: k * k, done: age >= KNOCK.life };
}
/** how bright a wall point at distance `d` from a pulse is (0..1): the moving ring is bright, everything behind it fades with age and range. Mirrors the shader. */
export function echoLight(d, radius, age) {
  const s = pulseAt(radius, age);
  if (s.done || d > s.front + 1.5) return 0;
  const ring = Math.exp(-((d - s.front) * (d - s.front)) / (2 * 1.1 * 1.1));
  const body = d <= s.front ? 0.5 * (1 - Math.min(1, d / radius)) : 0;
  return Math.min(1, (ring * 1.2 + body) * s.fade);
}

// ------------------------------------------------------------------------------------------------ hotel: elevator
export const HZ = {
  floorH: 4.0,                                  // level pitch (m); slab 0.3 thick
  levels: 4,                                    // ground lobby + floors 2, 3 and the hidden 13
  labels: ['L', '2', '3', '13'],
  stops: 3,                                     // the elevator serves levels 0..2; level 3 ("13") is stairs only
  hidden: 3,
  warn: 3.0,                                    // door-warning chime before the car moves
  base: 4.4, perLevel: 1.3,                     // ride seconds = base + perLevel * levels travelled + jitter 0..0.6  (5.7 .. 8 s)
  noise: 1.0,                                   // creatures.noise strength of the motor (ground shaft) at departure
  ding: 0.7,                                    // the arrival bell at the destination
};
/** ride timing for trip number n (deterministic per seed): { warn, dur } seconds */
export function hzRide(seed, n, from, to) {
  const R = new RNG((hashString('hz:' + seed) ^ Math.imul(n + 1, 3266489917)) >>> 0);
  return { warn: HZ.warn, dur: +(HZ.base + HZ.perLevel * Math.abs(to - from) + R.float(0, 0.6)).toFixed(2) };
}
/** car height progress 0..1 at ride time t (ease in / out) */
export function hzProgress(dur, t) { const p = Math.min(1, Math.max(0, t / dur)); return p * p * (3 - 2 * p); }
/** y of a level (world) given the ground y */
export const hzLevelY = (Y, k) => Y + HZ.floorH * k;

// ------------------------------------------------------------------------------------------------ generated moons
const LAB_OLD = ['metro', 'greenhouse', 'prison', 'tower'];
/** which interior a generated moon swaps to (own hash stream: never shifts an older roll). null = keep. Called from moongen after labInterior(). */
export function labInterior12(runKey, index, k, biome, tier, interior) {
  if (tier < 2 || LAB_OLD.includes(interior)) return null;
  const R = new RNG(hashString(`lab12:${runKey}|${index}|${k}`));
  const a = R.next(), b = R.next();
  const pDark = 0.05 + 0.02 * tier + (biome === 'datascape' || biome === 'crystal' || biome === 'servermarsh' || biome === 'ashfield' ? 0.13 : 0);
  const pHotel = 0.05 + 0.02 * tier + (biome === 'snow' || biome === 'moor' || biome === 'blackforest' || biome === 'desert' ? 0.13 : 0);
  if (a < pDark) return 'darkweb';
  if (b < pHotel) return 'hotel';
  return null;
}
