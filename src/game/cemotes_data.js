// Creature emotes - pure data + math (no three.js / DOM, so `node tools/harness/cemotes.test.mjs` can import it).
// See docs/wave2/cemotes.md. cemotes.js is the runtime (host decisions, net, body-language layer, bubbles).

// ------------------------------------------------------------------ player emote -> kind
// What a creature "sees" when a player emote starts. Unknown / mod emotes count as 'meh'.
export const EMOTE_KIND = {
  dance: 'dance', party: 'dance', spin: 'dance', moonwalk: 'dance', ascend: 'dance', cheer: 'dance', hop: 'dance',
  wave: 'greet', bow: 'greet', salute: 'greet',
  point: 'taunt', laugh: 'taunt', rage: 'taunt', headbang: 'taunt', flex: 'taunt', rally: 'taunt',
  flip: 'show', scared: 'fear', playdead: 'dead', sit: 'chill', shrug: 'meh', facepalm: 'meh',
};
export const KINDS = ['dance', 'greet', 'taunt', 'show', 'fear', 'dead', 'chill', 'meh'];
export const emoteKind = (id) => EMOTE_KIND[id] || 'meh';

// player emote -> body language a copying creature (mimic) performs
export const COPY_MAP = {
  dance: 'dance', party: 'dance', moonwalk: 'dance', cheer: 'hop', hop: 'hop', spin: 'spin', ascend: 'spin', flip: 'spin',
  wave: 'point', bow: 'bow', salute: 'bow', point: 'point', laugh: 'laugh', headbang: 'laugh', rage: 'flex', flex: 'flex', rally: 'flex',
  scared: 'slump', playdead: 'slump', sit: 'slump', shrug: 'tilt', facepalm: 'tilt',
};

// ------------------------------------------------------------------ bubbles (TFG-original internet-style icons)
// text bubbles are drawn with the pixel font, 'SKULL' / 'DANCE' are 8x8 pixel bitmaps (see cemotes.js)
export const BUBBLES = {
  LMAO: { text: 'LMAO', color: '#ffe15a' }, GG: { text: 'GG', color: '#6dff8a' }, L: { text: 'L', color: '#ff5a5a' },
  RATIO: { text: 'RATIO', color: '#ff9a3a' }, O7: { text: 'o7', color: '#7fe8ff' }, SMILE: { text: '=)', color: '#ffe15a' },
  Q: { text: '?', color: '#ffffff' }, EXCL: { text: '!!!', color: '#ff4a4a' },
  SKULL: { icon: 'skull', color: '#f2f2f2' }, DANCE: { icon: 'dance', color: '#ff7ae6' },
};
export const SKULL_BITMAP = ['.######.', '########', '#..##..#', '#..##..#', '########', '.##..##.', '..####..', '..#.#.#.'];
export const DANCE_BITMAPS = [
  ['#..##..#', '.#.##.#.', '..####..', '...##...', '...##...', '..#..#..', '.#....#.', '#......#'],
  ['...##...', '...##...', '.######.', '#..##..#', '...##...', '..#..#..', '..#...#.', '.#.....#'],
];

// ------------------------------------------------------------------ body language (client-side transform layer on the creature root)
// Every fx writes offsets into `o` (pure, allocation-free): y (up), x (sideways), z (forward), ry / rx / rz (radians), sx / sy (scale factors).
// h = creature height in metres. All of them return to neutral at t = dur.
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const EMOTE_DUR = { spin: 1.5, hop: 2.6, bow: 2.2, tilt: 2.0, dance: 4.0, laugh: 2.4, flex: 2.4, slump: 2.4, point: 2.0, griddy: 3.2 };
export const BODY = {
  spin(o, t, d, a) { const u = clamp01(t / d), e = u * u * (3 - 2 * u); o.ry = e * Math.PI * 2; o.y = Math.sin(u * Math.PI) * a; },
  hop(o, t, d, a) { const k = clamp01(t * 5) * clamp01((d - t) * 5), ph = Math.abs(Math.sin(t * 9)); o.y = ph * a * 0.9 * k; o.sy = 1 - (1 - ph) * 0.1 * k; o.rx = 0.16 * ph * k; },
  bow(o, t, d) { o.rx = 0.9 * clamp01(t * 2.5) * clamp01((d - t) * 2.5); },
  tilt(o, t, d) { const k = clamp01(t * 3) * clamp01((d - t) * 3); o.rz = 0.38 * k; o.ry = 0.12 * Math.sin(t * 2) * k; },
  dance(o, t, d, a) { const k = clamp01(t * 4) * clamp01((d - t) * 4); o.y = Math.abs(Math.sin(t * 6)) * a * 0.6 * k; o.rz = Math.sin(t * 3) * 0.18 * k; o.ry = Math.sin(t * 3) * 0.35 * k; o.rx = Math.sin(t * 6) * 0.06 * k; },
  laugh(o, t, d, a) { const k = clamp01(t * 6) * clamp01((d - t) * 6); o.rx = (-0.22 + Math.sin(t * 22) * 0.08) * k; o.y = Math.abs(Math.sin(t * 22)) * a * 0.15 * k; o.rz = Math.sin(t * 11) * 0.03 * k; },
  flex(o, t, d) { const k = clamp01(t * 3) * clamp01((d - t) * 3); const s = 1 + (0.22 + Math.sin(t * 10) * 0.03) * k; o.sx = s; o.sy = s; o.rx = -0.12 * k; },
  slump(o, t, d) { const k = clamp01(t * 2.5) * clamp01((d - t) * 3); o.sy = 1 - 0.28 * k; o.rx = 0.32 * k; },
  point(o, t, d) { const k = clamp01(t * 4) * clamp01((d - t) * 4); o.rx = Math.max(0, Math.sin(t * 7)) * 0.3 * k; o.z = Math.max(0, Math.sin(t * 7)) * 0.1 * k; },
  griddy(o, t, d, a) { const k = clamp01(t * 4) * clamp01((d - t) * 4), s = Math.sin(t * 8); o.x = s * a * 0.7 * k; o.rz = s * 0.32 * k; o.y = Math.abs(s) * a * 0.35 * k; o.ry = Math.sin(t * 4) * 0.3 * k; },
};
export function newOffsets() { return { y: 0, x: 0, z: 0, ry: 0, rx: 0, rz: 0, sx: 1, sy: 1 }; }
export function resetOffsets(o) { o.y = 0; o.x = 0; o.z = 0; o.ry = 0; o.rx = 0; o.rz = 0; o.sx = 1; o.sy = 1; return o; }
/** offset amplitude (metres) for a creature of height h */
export const ampFor = (h) => Math.min(0.55, Math.max(0.07, 0.16 * h));

// ------------------------------------------------------------------ personalities
// react[kind] -> what the creature does when a player emote of that kind starts within ~8 m in its sight:
//   ignore  nothing                                   curious  head-tilt + "?" (harmless)          laugh  laughs at you (harmless)
//   copy    mirrors your emote (creepy, no effect)    wave     bows back "o7" (harmless)           sulk   slumps "L" (harmless)
//   join    DANCES ALONG and is not hostile for joinT s (dance-off = safe passage)
//   shy     waves back and RUNS AWAY for a few seconds
//   enrage  takes the taunt personally: aggro on YOU (rage: 'chase' = target you, 'noise' = your noise draws it, 'anger' = Lurker anger)
// idle: [bodyEmote, [bubbles], weight] rolled now and then while wandering (never while hunting); win: same, after killing a player.
const R = (o) => ({ ignore: 'ignore', ...o });
export const ARCH = {
  predator: {
    react: R({ dance: 'curious', greet: 'curious', taunt: 'enrage', show: 'curious', fear: 'laugh', dead: 'curious' }), rage: 'noise',
    idle: [['flex', ['GG', 'RATIO'], 3], ['laugh', ['LMAO'], 2], ['tilt', ['Q'], 2], ['point', ['L'], 1]],
    win: [['griddy', ['GG', 'LMAO'], 3], ['hop', ['L', 'SKULL'], 3], ['laugh', ['LMAO', 'RATIO'], 2], ['flex', ['GG', 'RATIO'], 2], ['dance', ['SMILE', 'DANCE'], 2]],
  },
  mimic: {
    react: R({ dance: 'copy', greet: 'copy', taunt: 'copy', show: 'copy', fear: 'copy', dead: 'copy', chill: 'copy', meh: 'copy' }), copyBubble: 'SMILE',
    idle: [['tilt', ['Q'], 3], ['bow', ['SMILE'], 1]],
    win: [['tilt', ['SMILE'], 3], ['bow', ['O7'], 2], ['dance', ['SMILE'], 1]],
  },
  partygoer: {
    react: R({ dance: 'join', greet: 'wave', taunt: 'sulk', show: 'join', fear: 'laugh', dead: 'curious' }), joinT: 6,
    idle: [['dance', ['SMILE', 'DANCE'], 3], ['spin', ['SMILE'], 2], ['hop', ['DANCE'], 2]],
    win: [['dance', ['DANCE', 'GG'], 3], ['spin', ['SMILE', 'LMAO'], 2], ['hop', ['LMAO'], 1]],
  },
  swarm: {
    react: R({ dance: 'join', greet: 'wave', taunt: 'laugh', show: 'join', fear: 'laugh', dead: 'curious' }), joinT: 4.5,
    idle: [['dance', ['DANCE'], 2], ['hop', ['EXCL', 'LMAO'], 3], ['tilt', ['Q'], 1]],
    win: [['hop', ['EXCL', 'RATIO'], 3], ['dance', ['DANCE', 'LMAO'], 2], ['laugh', ['LMAO'], 2]],
  },
  shy: {
    react: R({ dance: 'shy', greet: 'shy', taunt: 'shy', show: 'shy', dead: 'curious' }), fleeT: 2.8,
    idle: [['bow', ['O7'], 2], ['tilt', ['Q'], 3], ['slump', ['L'], 1]],
    win: [['bow', ['O7', 'SMILE'], 3], ['hop', ['SMILE'], 2], ['tilt', ['Q'], 1]],
  },
  polite: {
    react: R({ dance: 'wave', greet: 'wave', taunt: 'curious', show: 'wave', dead: 'curious' }),
    idle: [['bow', ['O7', 'SMILE'], 3], ['tilt', ['Q'], 1]],
    win: [['bow', ['O7'], 3], ['point', ['L'], 1], ['dance', ['SMILE'], 1]],
  },
  boss: {
    react: R({ dance: 'laugh', greet: 'laugh', taunt: 'laugh', show: 'laugh', fear: 'laugh', dead: 'laugh' }), noFreeze: true, rate: 0.6,
    idle: [['flex', ['GG'], 3], ['laugh', ['LMAO'], 2], ['point', ['RATIO'], 1]],
    win: [['flex', ['GG', 'RATIO'], 3], ['laugh', ['LMAO'], 3], ['griddy', ['GG'], 1]],
  },
  stoic: { react: R({}), mute: true, idle: [], win: [] },   // hazards / unkillable scare creatures: they never break character
};
// explicit id -> archetype [+ overrides]. Anything missing falls back to guessArch() (or def.cemote = 'archetype' set by content).
const P = (arch, extra) => [arch, extra || {}];
export const CREATURE_ARCH = {
  crawler: P('predator', { rage: 'chase' }), spider: P('predator', { rage: 'chase' }), hound: P('predator'), lurker: P('predator', { rage: 'anger' }),
  giant: P('predator'), screamer: P('predator'), clickbait: P('predator'), moderator: P('predator'),
  skeleton: P('predator', { rage: 'chase' }), hs_enforcer: P('predator'), hs_gunner: P('predator'), hs_leader: P('predator'),
  mimic: P('mimic'), doppel: P('mimic'),
  tamagotchi: P('partygoer'), sludge: P('partygoer', { joinT: 8 }), editor: P('partygoer'), robot: P('partygoer'),
  scuttler: P('swarm', { rage: 'chase' }), ticketswarm: P('swarm'), replyguy: P('swarm'), zombot: P('swarm'),
  yoinker: P('shy'), collector: P('shy'),
  support: P('polite'), janitor: P('polite'),
  foreman: P('boss'), legacybot: P('boss'),
  mannequin: P('stoic'), jester: P('stoic'), sandkefal: P('stoic'), stalker: P('stoic'), leech: P('stoic'),
  turret: P('stoic'), mine: P('stoic'), mimicdoor: P('stoic'), web: P('stoic'), hoardnest: P('stoic'), janitorbin: P('stoic'),
};
/** Fallback for creatures nobody wrote a personality for (future content, mods): decided from the def's stats. */
export function guessArch(def = {}) {
  if (def.cemote && ARCH[def.cemote]) return [def.cemote, {}];
  if (def.hazard) return ['stoic', {}];
  if (def.boss) return ['boss', {}];
  if (def.hp == null) return ['stoic', {}];               // unkillable scare creatures stay in character
  if (def.pack || def.hp <= 50) return ['swarm', {}];      // cheap fodder: conga line
  return ['predator', {}];
}
const CACHE = new Map();
/** Personality for a creature id + def. ALWAYS returns a complete object: { id, arch, react{8 kinds}, idle, win, rage, rate, mute, ... } */
export function resolvePersonality(id, def = {}) {
  const key = id + '|' + (def.cemote || '') + (def.boss ? 'B' : '') + (def.hazard ? 'H' : '');
  let p = CACHE.get(key);
  if (p) return p;
  const [arch, extra] = (def.cemote && ARCH[def.cemote] ? [def.cemote, {}] : CREATURE_ARCH[id]) || guessArch(def);
  const A = ARCH[arch] || ARCH.predator;
  p = { rage: 'noise', rate: 1, joinT: 6, fleeT: 2.8, mute: false, noFreeze: false, copyBubble: 'SMILE', ...A, ...extra, id, arch };
  p.react = { ...ARCH.stoic.react, ...A.react };
  for (const k of KINDS) if (!p.react[k]) p.react[k] = 'ignore';
  if (def.hazard) p.mute = true;
  CACHE.set(key, p);
  return p;
}
/** weighted pick from an idle / win pool: -> [bodyEmote, bubble] or null (rand = () => [0,1)) */
export function pickEmote(pool, rand = Math.random) {
  if (!pool || !pool.length) return null;
  let sum = 0; for (const e of pool) sum += e[2] || 1;
  let r = rand() * sum, ent = pool[pool.length - 1];
  for (const e of pool) { r -= e[2] || 1; if (r < 0) { ent = e; break; } }
  return [ent[0], ent[1][Math.floor(rand() * ent[1].length) % ent[1].length]];
}

// ------------------------------------------------------------------ cooldowns (anti-abuse)
// creature: min gap between two reactions of the same creature. pc: same player + same creature. join*: a dance-off pacifies a
// creature ONCE per window (immune joinImmune s after it ends, and that player needs joinPc s before the same creature joins again).
// burst: a player can trigger at most burstN emote reactions per burstWin seconds. enrage: taunt aggro is rate limited on its own.
export const CD = { creature: 14, pc: 25, joinImmune: 25, joinPc: 40, burstN: 4, burstWin: 20, enrageCreature: 10, enragePlayer: 8, victory: 6, idleMin: 45, idleMax: 120, react: 8.5, reactEnrage: 11 };
export class CooldownBook {
  constructor() { this.m = new Map(); this.hist = new Map(); }
  ready(key, now) { return now >= (this.m.get(key) ?? -Infinity); }
  set(key, now, cd) { this.m.set(key, now + cd); }
  /** may this player's emote start trigger any more reactions right now? */
  burstOk(pid, now) { const h = this.hist.get(pid); if (!h) return true; while (h.length && now - h[0] > CD.burstWin) h.shift(); return h.length < CD.burstN; }
  burstMark(pid, now) { let h = this.hist.get(pid); if (!h) this.hist.set(pid, h = []); h.push(now); }
  prune(now) { for (const [k, v] of this.m) if (v < now - 5) this.m.delete(k); }
}
/** may `creature` react with `act` to `player` now? */
export function canReact(book, cid, pid, act, now) {
  if (!book.ready('c:' + cid, now) || !book.ready('pc:' + pid + '|' + cid, now)) return false;
  if (act === 'join' && (!book.ready('cj:' + cid, now) || !book.ready('pcj:' + pid + '|' + cid, now))) return false;
  if (act === 'enrage' && (!book.ready('ce:' + cid, now) || !book.ready('pe:' + pid, now))) return false;
  return true;
}
export function markReact(book, cid, pid, act, now, dur = 0) {
  book.set('c:' + cid, now, act === 'enrage' ? CD.enrageCreature : CD.creature);
  book.set('pc:' + pid + '|' + cid, now, CD.pc);
  if (act === 'join') { book.set('cj:' + cid, now, dur + CD.joinImmune); book.set('pcj:' + pid + '|' + cid, now, CD.joinPc); }
  if (act === 'enrage') { book.set('ce:' + cid, now, CD.enrageCreature); book.set('pe:' + pid, now, CD.enragePlayer); }
}
/** next idle-emote time for a creature */
export function nextIdleDelay(pers, rand = Math.random) { return (CD.idleMin + rand() * (CD.idleMax - CD.idleMin)) / Math.max(0.1, pers.rate || 1); }

// ------------------------------------------------------------------ victory chat lines (EN + TR). Placeholders: {c} creature, {p} victim.
export const WIN_LINES = {
  griddy: [
    { en: "{c} hit the griddy on {p}'s corpse.", tr: '{c}, {p} için cesedin üstünde griddy yaptı.' },
    { en: '{c} did the griddy over {p}. Cold.', tr: '{c}, {p} cesedinin başında griddy çekti. Soğukkanlı.' },
  ],
  hop: [
    { en: '{c} teabagged {p}. Rude.', tr: '{c}, {p} cesedine çömelip kalktı. Ayıp.' },
    { en: '{c} squatted on {p} a few times. Disrespectful.', tr: '{c}, {p} cesedinin üstünde çömelip kalktı. Saygısızlık.' },
  ],
  laugh: [
    { en: '{c} laughed at {p}. LMAO.', tr: '{c}, {p} ile dalga geçti. LMAO.' },
    { en: '{c} is typing "LMAO" over {p}.', tr: '{c}, {p} için "LMAO" yazıyor.' },
  ],
  flex: [
    { en: '{c} flexed on {p}. Ratio.', tr: '{c}, {p} karşısında kas yaptı. Ratio.' },
    { en: '{c} posted a GG for {p}. Nobody asked.', tr: '{c}, {p} için GG yazdı. Kimse sormadı.' },
  ],
  dance: [
    { en: '{c} did a little dance on {p}.', tr: '{c}, {p} için küçük bir dans etti.' },
    { en: '{c} celebrated {p} getting deleted.', tr: '{c}, {p} silindi diye kutlama yaptı.' },
  ],
  spin: [{ en: '{c} spun around in victory over {p}.', tr: '{c}, {p} üzerine zaferle döndü.' }],
  bow: [
    { en: '{c} bowed politely over {p}. o7', tr: '{c}, {p} cesedinin başında nazikçe eğildi. o7' },
    { en: '{c} paid its respects to {p}. Sarcastically.', tr: '{c}, {p} için saygılarını sundu. Alaycı şekilde.' },
  ],
  tilt: [
    { en: '{c} tilted its head at {p}. Curious.', tr: '{c}, {p} cesedine kafasını yana yatırıp baktı. Meraklı.' },
    { en: '{c} is studying {p}. Unsettling.', tr: '{c}, {p} cesedini inceliyor. Tekinsiz.' },
  ],
  point: [{ en: '{c} pointed at {p} and typed "L".', tr: '{c}, {p} cesedini gösterip "L" yazdı.' }],
  slump: [{ en: '{c} feels a bit bad about {p}. A bit.', tr: '{c}, {p} için biraz üzüldü. Biraz.' }],
};
/** All translatable strings of the module as an addTranslations() map */
export function translationMap() {
  const m = {};
  for (const arr of Object.values(WIN_LINES)) for (const l of arr) m[l.en] = l.tr;
  Object.assign(m, NOTES_TR);
  return m;
}
export const NOTES = {
  join: '{c} joins your dance. It will not attack for a few seconds.',
  copy: '{c} is copying you...',
  shy: '{c} waves back and runs away.',
  enrage: '{c} took that taunt personally!',
};
const NOTES_TR = {
  [NOTES.join]: '{c} dansına katıldı. Birkaç saniye saldırmayacak.',
  [NOTES.copy]: '{c} seni taklit ediyor...',
  [NOTES.shy]: '{c} el sallayıp kaçtı.',
  [NOTES.enrage]: '{c} bu iğnelemeyi kişisel aldı!',
};
export const NOTE_KIND = { join: 'good', copy: 'info', shy: 'info', enrage: 'bad' };
