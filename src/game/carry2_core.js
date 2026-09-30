// CARRY 2 core (wave 8, docs/wave8/carry2.md): pure rules for carry comedy. No THREE / DOM, unit-tested by tools/harness/carry2.test.mjs.
//   sway + slow turn for heavy 2-hand loot, bump losses on fragile carried items, two-person carry (helper grip), throw & catch.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/** the three bulky valuables (2 hands, fragile, worth carrying with a friend); facjobs' server core joins the bulky family too */
export const BULKY_IDS = Object.freeze(['fj_core']);
export const ITEM_DEFS = Object.freeze([
  { id: 'cy_vending', name: 'Vending Machine', kind: 'scrap', value: [230, 340], weight: 62, hands: 2, fragile: 0.6, bulky: true, tier: 'rare',
    tip: 'Heavy and fragile. One player crawls with it; two players (one holds E next to the carrier) walk it home.' },
  { id: 'cy_rack', name: 'Blade Rack', kind: 'scrap', value: [200, 300], weight: 66, hands: 2, fragile: 0.45, bulky: true, tier: 'rare',
    tip: 'A server rack that still hums. Two people carry it at near-normal speed.' },
  { id: 'cy_statue', name: 'Company Statue', kind: 'scrap', value: [280, 420], weight: 70, hands: 2, fragile: 0.35, bulky: true, tier: 'epic',
    tip: 'A bronze-look statue of the Company founder. Do not bump it into the founder.' },
]);
/** [id, weight] additions per interior theme */
export const LOOT = Object.freeze({
  factory: [['cy_rack', 2], ['cy_vending', 2]], office: [['cy_vending', 4]], serverfarm: [['cy_rack', 4]], mansion: [['cy_statue', 4]],
  hospital: [['cy_vending', 3]], mineshaft: [['cy_statue', 2]], sewer: [['cy_statue', 2]], backrooms: [['cy_vending', 2]],
});

export const isBulky = (def) => !!def && (def.bulky === true || BULKY_IDS.includes(def.id));
/** heavy = a 2-hand item of 25+ lb (sways); light stuff never does */
export const isHeavy = (def) => !!def && (def.hands | 0) === 2 && num(def.weight) >= 25 && def.kind !== 'body';

// ------------------------------------------------------------------------------------------------ carry feel
export const FEEL = {
  swayMin: 25, swayFull: 90,   // lb: no sway below, full sway above
  soloSpeed: 0.55,             // bulky item, one carrier
  coopSpeed: 0.92,             // bulky item, two carriers (target speed of the pair; the module cancels the plain weight penalty)
  soloTurn: 0.6, coopTurn: 0.9, heavyTurn: 0.75,
};
/** { sway 0..1, turn 0..1, speed 0..1 } for a carrier. mode: 'none' | 'solo' | 'co' (the holder while helped) | 'helper' */
export function carryFeel(def, mode = 'solo') {
  const one = { sway: 0, turn: 1, speed: 1 };
  if (mode === 'helper') return { sway: 0.3, turn: FEEL.coopTurn, speed: FEEL.coopSpeed };
  if (!def || mode === 'none') return one;
  const heavy = isHeavy(def), bulky = isBulky(def);
  if (!heavy && !bulky) return one;
  const w = clamp((num(def.weight) - FEEL.swayMin) / (FEEL.swayFull - FEEL.swayMin), 0.15, 1);
  if (bulky && mode === 'co') return { sway: 0.3, turn: FEEL.coopTurn, speed: FEEL.coopSpeed };
  if (bulky) return { sway: Math.max(0.7, w), turn: FEEL.soloTurn, speed: FEEL.soloSpeed };
  return { sway: w * 0.8, turn: FEEL.heavyTurn + (1 - w) * 0.2, speed: 1 };
}
/** the holder's carryMul while helped: exactly coopSpeed (never > 1; was weight-compensated up to 1.2). The plain weight penalty is cancelled separately (P.carryCancel, localplayer) so the pair still walks at ~coopSpeed */
export const coopHolderMul = () => FEEL.coopSpeed;

// ------------------------------------------------------------------------------------------------ bumps
export const BUMP = {
  minSpeed: 3, hardSpeed: 6.5,   // m/s lost in one frame against a wall / prop
  minPct: 0.05, maxPct: 0.25,    // fragile: 5..25 % of the base value per hard bump
  floor: 0.35,                   // bumps never take an item below 35 % of its base value (carrying must stay fun)
  cooldown: 1.1,                 // s between two bumps of the same item
  big: 25,                       // value lost at once that gets the fly-up pop
  hard: 0.15,                    // a share of the base value that counts as "breakage" for the Algorithm line / highlight
};
export function bumpPct(speed, fragile) {
  speed = num(speed); fragile = num(fragile);
  if (speed < BUMP.minSpeed || fragile <= 0) return 0;
  const k = clamp((speed - BUMP.minSpeed) / (BUMP.hardSpeed - BUMP.minSpeed), 0, 1);
  return clamp((BUMP.minPct + (BUMP.maxPct - BUMP.minPct) * k) * clamp(fragile, 0.6, 1.3), BUMP.minPct, BUMP.maxPct);
}
/** value lost: pct of the base value, never below floor * base, whole numbers, never negative */
export function lossOf(base, cur, pct) {
  base = Math.max(0, num(base)); cur = Math.max(0, num(cur, base));
  const want = Math.max(1, Math.round(base * clamp(num(pct), 0, 1)));
  return Math.max(0, Math.min(want, cur - Math.ceil(base * BUMP.floor)));
}
/** did the carrier just hit something? prev / now = horizontal speed of two consecutive frames */
export const isBump = (prev, now) => num(prev) >= BUMP.minSpeed && num(now) < num(prev) * 0.3;

// ------------------------------------------------------------------------------------------------ two-person carry
export const CO = {
  reach: 3.4,      // m: the helper can start gripping when this close to the carrier
  leash: 5.2,      // m: the grip lapses when they drift further apart
  ttl: 0.9,        // s: host drops a grip whose keepalive stopped
  ping: 0.3,       // s between keepalives from the helper
};
/** host: may `helper` grip the item carried by `holder`? positions {x, y, z} */
export function canGrip(def, holderId, helperId, holderPos, helperPos, limit = CO.leash) {
  if (!isBulky(def) || !holderId || !helperId || holderId === helperId || !holderPos || !helperPos) return false;
  return Math.hypot(holderPos.x - helperPos.x, holderPos.z - helperPos.z) <= limit && Math.abs(holderPos.y - helperPos.y) < 3.5;
}

// ------------------------------------------------------------------------------------------------ throw & catch
export const THROW = {
  ttl: 5,          // s: a throw is tracked at most this long
  settle: 0.35,    // s of flight before "landed" can be decided
  rest: 1.2,       // m/s: slower than this = it landed
  minPct: 0.12, maxPct: 0.25,   // an uncaught fragile throw cracks by this much
  reach: 3.6,      // m: a crewmate can still grab it out of the air within this range
  minFly: 1.5,     // m/s: the catch prompt only shows while it really flies
};
export const crackPct = (fragile) => clamp(THROW.minPct + num(fragile) * 0.12, THROW.minPct, THROW.maxPct);
/** thrown things worth tracking: fragile hand items (bodies and physics valuables never go through dropItem) */
export const throwable = (def) => !!def && num(def.fragile) > 0 && def.kind !== 'body' && def.kind !== 'big';

/** Algorithm reaction lines: one line per breakage, at most every LINE_GAP s (the firstrun gate on top decides again per player) */
export const LINE_GAP = 40;
export const LINES = [
  '{name} just turned ▮{n} of company property into confetti. Chat is delighted.',
  'Careful, {name}. No, please, keep going. The clip is doing numbers.',
  'Fragile means fragile, {name}. I would say it twice, but the cameras got it the first time.',
];
export const lineFor = (seed) => LINES[Math.abs(Math.floor(num(seed))) % LINES.length];
export const isBreak = (base, lost) => lost >= 10 && num(base) > 0 && lost >= num(base) * BUMP.hard;
