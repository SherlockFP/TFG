// ATMOS core (pure, no WebAudio): which ambience bed fits the situation, the bed definitions (layers + slow random events) and the
// scheduling rules (silence gaps, suppression under creature cues). The synthesis lives in atmos.js. Mood reference: low hum, distant
// pipes, metal creaks - and long silences that let the player hear a creature's footsteps.

/** Snapshot -> { kind, sub }. snap = { phase, inShip, indoor, company, theme, biome, weather, night, backrooms, level, pocket } */
export function contextOf(s) {
  if (!s) return { kind: 'none', sub: '' };
  if (!s.phase || s.phase === 'orbit' || s.inShip) return { kind: 'ship', sub: '' };
  if (s.backrooms) return { kind: 'backrooms', sub: s.level === 'pool' ? 'pool' : '' };
  const pk = String(s.pocket || '').toLowerCase();
  if (pk) {
    if (/backroom|level/.test(pk)) return { kind: 'backrooms', sub: '' };
    if (/maze|labyrinth|hedge|corridor|hall/.test(pk)) return { kind: 'maze', sub: pk };
  }
  if (s.indoor) {
    const th = String(s.theme || 'factory');
    if (th === 'backrooms') return { kind: 'backrooms', sub: s.level === 'pool' ? 'pool' : '' };
    if (/maze|labyrinth/.test(th)) return { kind: 'maze', sub: th };
    if (BEDS[th]) return { kind: th, sub: '' };
    return { kind: 'factory', sub: th };
  }
  if (s.company) return { kind: 'company', sub: '' };
  return { kind: 'outdoor', sub: (s.biome || 'hills') + (s.night ? ':night' : '') + ':' + (s.weather || 'clear') };
}
export const ctxKey = (c) => c.kind + '|' + c.sub;

// ---- bed definitions. layers: continuous (hum / noise / buzz / tone), events: slow random one-shots (name, weight), gap = seconds
// between events (x2.5 after a "dead silence" roll), level = bed master gain (before the Ambience slider).
const hum = (f, lp = 400, g = 1, wob = [0.05, 0.25]) => ({ t: 'hum', f, lp, g, wob });
const noise = (n, ft, f, q, g, lfo = [0.06, 0.3, 0.3]) => ({ t: 'noise', n, ft, f, q, g, lfo });
export const BEDS = {
  factory: { level: 0.5, gap: [7, 20], layers: [hum([[50, 0.5], [100, 0.22], [151, 0.06]], 420, 0.55), noise('brown', 'bandpass', 320, 0.8, 0.22, [0.07, 60, 0.35]), noise('white', 'bandpass', 1500, 0.6, 0.012)], events: [['ping', 3], ['creak', 2], ['door', 1], ['vent', 2], ['groan', 1]] },
  mansion: { level: 0.45, gap: [9, 24], layers: [hum([[46, 0.35], [92, 0.1]], 300, 0.4), noise('brown', 'bandpass', 500, 1.2, 0.2, [0.05, 120, 0.5])], events: [['creak', 3], ['door', 1], ['drip', 1], ['ping', 1], ['groan', 1]] },
  mineshaft: { level: 0.45, gap: [6, 16], layers: [noise('brown', 'lowpass', 140, 0.7, 0.55, [0.04, 30, 0.25]), noise('white', 'bandpass', 900, 3, 0.012, [0.2, 100, 0.8])], events: [['drip', 3], ['groan', 2], ['ping', 1]] },
  office: { level: 0.45, gap: [8, 20], layers: [{ t: 'buzz', f: 120, g: 0.16 }, hum([[60, 0.35], [120, 0.15]], 500, 0.4), noise('brown', 'bandpass', 400, 0.7, 0.14)], events: [['relay', 2], ['vent', 2], ['door', 1], ['ping', 1]] },
  serverfarm: { level: 0.5, gap: [10, 26], layers: [hum([[60, 0.4], [120, 0.3], [180, 0.08]], 600, 0.45), noise('brown', 'bandpass', 700, 0.7, 0.28, [0.11, 40, 0.15]), noise('white', 'bandpass', 2200, 0.8, 0.02, [0.13, 80, 0.2])], events: [['relay', 3], ['vent', 1]] },
  sewer: { level: 0.5, gap: [5, 14], layers: [noise('brown', 'lowpass', 220, 0.7, 0.5, [0.09, 40, 0.3]), noise('white', 'bandpass', 1100, 2, 0.02, [0.3, 200, 0.6]), hum([[48, 0.25]], 250, 0.3)], events: [['drip', 4], ['groan', 1], ['vent', 1], ['ping', 1]] },
  hospital: { level: 0.42, gap: [8, 22], layers: [{ t: 'buzz', f: 100, g: 0.12 }, hum([[50, 0.3], [100, 0.12]], 380, 0.35), noise('brown', 'bandpass', 350, 0.9, 0.12)], events: [['relay', 2], ['door', 1], ['creak', 1], ['drip', 1]] },
  backrooms: { level: 0.5, gap: [9, 24], layers: [{ t: 'buzz', f: 120, g: 0.24 }, hum([[60, 0.22]], 300, 0.3), noise('white', 'bandpass', 3000, 0.5, 0.012)], events: [['flicker', 3], ['relay', 1], ['vent', 1]] },
  maze: { level: 0.5, gap: [7, 18], layers: [hum([[43, 0.5], [64, 0.2]], 220, 0.55, [0.03, 0.35]), noise('brown', 'bandpass', 240, 1.5, 0.25, [0.04, 70, 0.5])], events: [['groan', 2], ['creak', 2], ['drip', 2], ['ping', 1], ['door', 1]] },
  company: { level: 0.4, gap: [10, 26], layers: [noise('brown', 'bandpass', 280, 0.6, 0.3, [0.05, 100, 0.5]), hum([[55, 0.2]], 260, 0.25)], events: [['relay', 1], ['ping', 1], ['gust', 2]] },
  ship: { level: 0.45, gap: [8, 18], layers: [noise('brown', 'lowpass', 110, 0.7, 0.6, [0.03, 10, 0.1]), hum([[55, 0.3], [110, 0.14]], 300, 0.35), { t: 'tone', f: 4100, g: 0.005 }], events: [['relay', 2], ['ping', 1], ['vent', 1], ['groan', 1]] },
  outdoor: { level: 0.45, gap: [8, 22], layers: [], events: [] },   // built by outdoorBed()
  // [sound2] wave-8 labyrinths (metro / greenhouse / prison / tower) and repomaps themes (academy / museum / influencer / colddata): sparse, low, long silences
  metro: { level: 0.5, gap: [8, 22], layers: [hum([[40, 0.5], [60, 0.2]], 200, 0.5), noise('brown', 'lowpass', 160, 0.7, 0.35, [0.05, 30, 0.3]), noise('white', 'bandpass', 900, 2, 0.015, [0.2, 100, 0.6])], events: [['rumble', 3], ['drip', 3], ['groan', 1], ['ping', 1], ['vent', 1]] },
  greenhouse: { level: 0.42, gap: [7, 20], layers: [noise('white', 'bandpass', 2200, 0.5, 0.02, [0.08, 300, 0.5]), hum([[52, 0.25]], 260, 0.3), noise('brown', 'bandpass', 300, 0.8, 0.18, [0.05, 60, 0.4])], events: [['drip', 4], ['bubble', 2], ['chirps', 2], ['creak', 1], ['vent', 1]] },
  prison: { level: 0.45, gap: [10, 26], layers: [{ t: 'buzz', f: 100, g: 0.1 }, hum([[50, 0.3], [100, 0.1]], 350, 0.35), noise('brown', 'bandpass', 300, 1, 0.15)], events: [['ping', 3], ['door', 2], ['relay', 2], ['groan', 1], ['drip', 1]] },
  tower: { level: 0.45, gap: [8, 20], layers: [hum([[55, 0.4], [110, 0.2], [165, 0.05]], 400, 0.5), noise('brown', 'lowpass', 200, 0.7, 0.35, [0.06, 40, 0.3]), noise('white', 'bandpass', 1400, 1.5, 0.012)], events: [['creak', 3], ['groan', 2], ['vent', 2], ['ping', 1]] },
  academy: { level: 0.4, gap: [10, 26], layers: [{ t: 'buzz', f: 120, g: 0.12 }, hum([[60, 0.2]], 300, 0.25), noise('brown', 'bandpass', 350, 0.9, 0.1)], events: [['chime', 2], ['door', 2], ['creak', 1], ['relay', 1], ['flicker', 1]] },
  museum: { level: 0.32, gap: [12, 30], layers: [hum([[45, 0.2]], 200, 0.25), noise('brown', 'bandpass', 400, 0.8, 0.1, [0.04, 80, 0.4])], events: [['creak', 3], ['ping', 1], ['drip', 1], ['chime', 1], ['groan', 1]] },
  influencer: { level: 0.42, gap: [9, 22], layers: [{ t: 'buzz', f: 100, g: 0.16 }, hum([[60, 0.3], [120, 0.2]], 500, 0.35), noise('white', 'bandpass', 1800, 0.5, 0.02, [0.1, 200, 0.4])], events: [['relay', 3], ['ping', 2], ['flicker', 2], ['vent', 1]] },
  colddata: { level: 0.5, gap: [8, 20], layers: [hum([[60, 0.4], [120, 0.3]], 600, 0.4), noise('brown', 'bandpass', 600, 0.7, 0.3, [0.11, 40, 0.15]), noise('white', 'bandpass', 2600, 0.7, 0.03, [0.13, 80, 0.3])], events: [['ice', 3], ['vent', 2], ['relay', 2], ['gust', 1], ['ping', 1]] },
};

/** [sound2] the three expedition moons (biome ids ex_barge / ex_dune / ex_roof): underwater hush, a dune wind bed, a dead city at night */
const EX_BEDS = {
  ex_barge: () => ({ level: 0.5, gap: [7, 18], layers: [noise('brown', 'lowpass', 180, 0.7, 0.55, [0.05, 30, 0.3]), hum([[42, 0.3]], 200, 0.3), noise('white', 'bandpass', 700, 2, 0.015, [0.3, 100, 0.6])], events: [['bubble', 4], ['groan', 2], ['ping', 1]] }),
  ex_dune: () => ({ level: 0.45, gap: [7, 18], layers: [noise('brown', 'bandpass', 420, 0.6, 0.34, [0.05, 180, 0.6]), noise('white', 'bandpass', 2600, 0.8, 0.02, [0.1, 300, 0.7])], events: [['gust', 4], ['creak', 0.5]] }),
  ex_roof: (night) => ({ level: 0.42, gap: night ? [9, 24] : [8, 20], layers: [noise('brown', 'bandpass', 260, 0.7, 0.24, [0.04, 80, 0.5]), hum([[50, 0.25]], 260, 0.3)], events: [['gust', 2], ['relay', 2], ['rumble', 1], ['ping', 1], ['vent', 1]] }),
};

/** outdoor bed for a biome / weather / time: wind first, insects by day or night where they belong, distant thunder in storms */
export function outdoorBed(sub) {
  const [biome, a, b] = String(sub || 'hills:clear').split(':');
  const night = a === 'night', weather = night ? b : a;
  if (EX_BEDS[biome]) return EX_BEDS[biome](night);
  const windy = weather === 'stormy' ? 1 : weather === 'rainy' ? 0.6 : biome === 'desert' || biome === 'snow' ? 0.8 : 0.45;
  const wf = biome === 'snow' ? 520 : biome === 'desert' ? 420 : biome === 'blackforest' ? 300 : 360;
  const layers = [noise('brown', 'bandpass', wf, 0.7, 0.28 * windy + 0.06, [0.05, wf * 0.4, 0.6])];
  const events = [['gust', 2 + windy * 2]];
  const bugs = biome === 'swamp' || biome === 'hills' || biome === 'moor' || biome === 'blackforest';
  if (bugs && weather !== 'stormy') events.push(['chirps', night ? 5 : weather === 'rainy' ? 0 : 3]);
  if (weather === 'stormy' || weather === 'rainy') events.push(['thunder', weather === 'stormy' ? 3 : 1]);
  if (biome === 'blackforest' || biome === 'moor') events.push(['creak', 1]);
  return { level: 0.45, gap: night ? [6, 16] : [8, 20], layers, events: events.filter((e) => e[1] > 0) };
}
export const bedFor = (c) => (c.kind === 'outdoor' ? outdoorBed(c.sub) : BEDS[c.kind] || null);

/** weighted pick of an event name (rand in 0..1) */
export function pickEvent(bed, rand) {
  const ev = bed?.events || [];
  let tot = 0; for (const e of ev) tot += e[1];
  if (!(tot > 0)) return null;
  let r = rand * tot;
  for (const e of ev) { r -= e[1]; if (r <= 0) return e[0]; }
  return ev[ev.length - 1][0];
}
/** seconds until the next event: uniform in bed.gap, with a 25% chance of a long dead-silence gap (x2.5) */
export function nextGap(bed, r1, r2) {
  const g = bed?.gap || [8, 20];
  const base = g[0] + (g[1] - g[0]) * r1;
  return r2 < 0.25 ? base * 2.5 : base;
}
/** what a creature cue does to the ambience: { quiet: seconds without events, duck: 0..1, hold: s } (dist in metres) */
export function cueEffect(cue) {
  if (!cue) return null;
  const d = Number.isFinite(cue.dist) ? cue.dist : 30, e = cue.event;
  if (e === 'step') return d < 22 ? { quiet: 4, duck: 0.25, hold: 0.8 } : null;
  if (e === 'attack' || e === 'alert' || e === 'chase') return d < 45 ? { quiet: 9, duck: 0.45, hold: 1.6 } : null;
  if (e === 'hurt' || e === 'death') return d < 35 ? { quiet: 5, duck: 0.3, hold: 1.0 } : null;
  return d < 18 ? { quiet: 3, duck: 0.15, hold: 0.6 } : null;   // idle calls: only when close
}
