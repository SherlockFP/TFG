// SKELETONS: pure data + rules (no three.js, no DOM: node-tested by tools/harness/skeletons.test.mjs).
// "DELETED USERS": the skeletons of banned accounts, glitchy username tags floating over their skulls.
// Numbers are BASE values: HP / damage / speed are scaled by game.balance.scale('creature') in the generic paths
// (HostCreature ctor, hostHurtPlayer -> balance.hitDamage, CreatureManager.speedMul), creature tiers multiply on top (forge).

export const SKEL_TYPES = ['skel_walker', 'skel_archer', 'skel_knight', 'skel_swarm'];
export const isSkel = (type) => SKEL_TYPES.includes(type);

export const DEFS = {
  skel_walker: {
    name: 'Bone Walker', hp: 40, dmg: 9, walk: 1.5, run: 3.3, power: 0.9, xp: 24, coin: 4, zone: 'in', radius: 0.36, height: 1.75, maxAlive: 6,
    drop: ['skull', 0.16], compDrop: { kind: 'arcane', chance: 0.3, n: 1 },
    deathText: 'was clocked out by a Bone Walker.',
    lore: 'The skeleton of a banned account, still logged in. It rattles when it walks. Knock it down and it puts itself back together after 4 seconds... '
      + 'unless you smash the skull while it lies there: hit it again.',
  },
  skel_archer: {
    name: 'Bone Archer', hp: 30, dmg: 9, walk: 1.6, run: 3.6, power: 1.1, xp: 34, coin: 6, zone: 'in', radius: 0.34, height: 1.7, maxAlive: 4,
    compDrop: { kind: 'arcane', chance: 0.3, n: 1 },
    deathText: 'was hit by a flying CD.',
    lore: 'Keeps its distance and throws bone shards and old CDs. The arm goes back and the projectile glows: that is the wind-up. '
      + 'Sidestep after it lets go, then close the gap. It backs away when you get close.',
  },
  skel_knight: {
    name: 'Bone Knight', hp: 95, dmg: 15, walk: 1.3, run: 2.9, power: 1.8, xp: 70, coin: 14, zone: 'in', radius: 0.42, height: 1.95, maxAlive: 2,
    drop: ['skull', 0.3], compDrop: { kind: 'metal', chance: 0.5, n: 1 },
    deathText: 'was cut down by a Bone Knight.',
    lore: 'Heavy, slow and hard to hurt from the front: its shield blocks almost everything. It turns slowly: flank it. '
      + 'A heavy or charged hit knocks the shield aside and staggers it.',
  },
  skel_swarm: {
    name: 'Bone Swarm', hp: 7, dmg: 3, walk: 2.6, run: 4.4, power: 0.35, xp: 5, coin: 1, zone: 'in', radius: 0.2, height: 0.32, maxAlive: 14,
    deathText: 'was nibbled by skull hands.',
    lore: 'Tiny skull-headed hands that scuttle across the floor on their fingertips. Weak on their own, they come in groups. Fight in a corridor.',
  },
};

/** spawn tables (merged into every moon's table by spawnTable(); w = weight per moon tier 1..4, interior = theme multiplier).
 *  Mostly mansion / hospital / backrooms / mineshaft; office / server farm / sewer / factory stay low. */
const THEMES = (m, h, b, s, o, sf, sw, f) => ({ mansion: m, hospital: h, backrooms: b, mineshaft: s, office: o, serverfarm: sf, sewer: sw, factory: f });
export const SPAWNS = {
  skel_walker: { zone: 'in', w: [3, 5, 6, 6], interior: THEMES(1.7, 1.5, 1.5, 1.7, 0.6, 0.3, 0.7, 0.6) },
  skel_archer: { zone: 'in', w: [0, 3, 5, 6], interior: THEMES(1.4, 1.2, 1.3, 1.6, 0.4, 0.2, 0.5, 0.4) },
  skel_knight: { zone: 'in', w: [0, 2, 4, 5], interior: THEMES(1.8, 1.0, 1.0, 1.4, 0.3, 0.2, 0.4, 0.4) },
  skel_swarm: { zone: 'in', w: [3, 4, 5, 5], interior: THEMES(1.2, 1.4, 1.3, 1.3, 0.5, 0.3, 0.8, 0.5) },
};

/** night outdoors (host director): from 18:30 (minute 1110) to 23:30, only while someone is outside */
export const NIGHT = { from: 18 * 60 + 30, to: 23 * 60 + 30, gapMin: 55, gapMax: 90, farMin: 38, farMax: 58, capBase: 4 };

export const TUNING = {
  smashWindow: 4.0,        // s a collapsed Bone Walker lies there: any hit within it smashes the skull (real death)
  riseTime: 1.3,           // s of the reassembly animation
  riseHp: 0.45,           // fraction of max HP it comes back with
  shieldArc: 62,           // degrees either side of the Knight's facing that the shield covers
  shieldChip: 0.15,        // fraction of a blocked hit that still goes through
  heavyDamage: 28,         // a single hit this big (or a crit / stun hit) knocks the shield aside
  staggerT: 1.6,           // s the Knight is staggered (shield down, takes full damage)
  knightTurn: 2.1,         // rad/s: slow turning is what makes flanking work
  archerMin: 5.5, archerMax: 15, archerSpeed: 12.5, archerGravity: 5.5, archerLife: 2.4,
};

// ------------------------------------------------------------------------------------------------ rules (pure)
/** Bone Archer wind-up in seconds: long early (readable), a little shorter later in the run, tiers make it snappier. */
export function archerWindup(sector = 0, tierIdx = 0) {
  return Math.max(0.6, 1.15 - 0.07 * Math.min(8, sector) - 0.03 * tierIdx);
}
/** how much the archer leads a moving target (0..1): weak early */
export function archerLead(sector = 0) { return Math.min(0.85, 0.3 + 0.08 * sector); }
/** cooldown between two throws */
export function archerCooldown(sector = 0, rnd = 0.5) { return Math.max(1.3, 2.6 - 0.12 * Math.min(8, sector)) + rnd * 0.8; }

const RAD = Math.PI / 180;
/** is `attacker` (x,z) inside the Knight's shield arc? yaw = knight facing (sin yaw, cos yaw) */
export function inShieldArc(yaw, kx, kz, ax, az, arcDeg = TUNING.shieldArc) {
  const dx = ax - kx, dz = az - kz, L = Math.hypot(dx, dz);
  if (L < 1e-6) return true;
  const c = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / L;
  return c >= Math.cos(arcDeg * RAD);
}
/** heavy hit = crit, stun weapon, or a big number */
export function isHeavy(amount, opts = {}) {
  return !!opts.crit || (opts.stun || 0) >= 0.4 || amount >= TUNING.heavyDamage;
}
/** Knight damage resolution: { amount, blocked, stagger } (guardDown = staggered / attacking-with-shield-down) */
export function knightHit(amount, { front = false, guardDown = false, heavy = false, pierce = false } = {}) {
  if (guardDown || !front || pierce || amount <= 0) return { amount, blocked: false, stagger: false };
  if (heavy) return { amount: amount * 0.5, blocked: true, stagger: true };
  return { amount: amount * TUNING.shieldChip, blocked: true, stagger: false };
}
/**
 * Bone Walker damage resolution. `hp` = current HP, `eff` = the damage that would actually land (after armour).
 *  - lethal first time (not rebuilt, not collapsed): { act:'collapse', cap } (leave it 1 HP, it lies down)
 *  - collapsed: any damage smashes the skull: { act:'smash' }
 */
export function walkerHit({ hp, eff, rebuilt = false, collapsed = false }) {
  if (collapsed) return eff > 0 ? { act: 'smash' } : { act: 'none' };
  if (!rebuilt && eff >= hp) return { act: 'collapse', cap: Math.max(0, hp - 1) };
  return { act: 'none' };
}
/** one explicit-Euler projectile step (host and every client run the same one) */
export function stepProjectile(p, dt, g = TUNING.archerGravity) {
  p.vy -= g * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  p.t += dt;
  return p;
}
/** launch velocity from `from` towards `to` at `speed`, compensating gravity over the flight time */
export function aimVelocity(from, to, speed = TUNING.archerSpeed, g = TUNING.archerGravity) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const dh = Math.hypot(dx, dz) || 1e-3;
  const t = Math.max(0.12, dh / speed);
  return { vx: (dx / dh) * (dh / t), vz: (dz / dh) * (dh / t), vy: (dy + 0.5 * g * t * t) / t, t };
}

// ------------------------------------------------------------------------------------------------ deleted-user name tags
export const TAG_NAMES = [
  'xX_Kefal_Xx', 'user_38291', 'NightOwl_2009', 'GamerGirl_99', 'anon_4chan', 'TrollFace420', 'dark_lord_1337', 'guest_00417',
  'ItsMeMario', 'ex_admin', 'SlenderFan', 'definitely_real', 'PhishDayi_Fan', 'mod_of_nothing', 'first_comment', 'ratio_king',
];
export const TAG_SUFFIX = ['[BANNED]', '[DELETED]', '[TOS VIOLATION]', '[404]', '[SUSPENDED]', '[REPORTED]'];
/** deterministic name + suffix from the creature seed (the seed is synced, so every peer shows the same tag) */
export function tagFor(seed) {
  const s = (Number(seed) || 1) >>> 0;
  return { name: TAG_NAMES[s % TAG_NAMES.length], suffix: TAG_SUFFIX[(s >>> 5) % TAG_SUFFIX.length], num: 100 + ((s >>> 3) % 900) };
}

// ------------------------------------------------------------------------------------------------ bespoke tier gear (documentation + test)
/** what each skeleton wears per tier (built by src/models/skeletons.js `tierRig` on top of render/tierlooks.js) */
export const SKEL_GEAR = {
  common: 'bare bones',
  uncommon: 'rusty helmet + scrap plates, greenish bones',
  rare: 'iron breastplate / pauldrons + helmet + buckler (Knight: steel shield), bluish bones',
  epic: 'purple rune bones (glowing cracks), heavier armour, glowing eye sockets',
  legendary: 'gold armour with gold trim, tattered cape, embers',
  mythic: 'red / black glitch armour (scanline shader), crown + halo, distortion',
};

/** English -> Turkish (addTranslations) */
export const TR = {
  'Bone Walker': 'Kemik Yürüyücü', 'Bone Archer': 'Kemik Okçu', 'Bone Knight': 'Kemik Şövalye', 'Bone Swarm': 'Kemik Sürüsü',
  'was clocked out by a Bone Walker.': 'bir Kemik Yürüyücü tarafından mesaiden çıkarıldı.',
  'was hit by a flying CD.': 'uçan bir CD ile vuruldu.',
  'was cut down by a Bone Knight.': 'bir Kemik Şövalye tarafından doğrandı.',
  'was nibbled by skull hands.': 'kafatası ellerince kemirildi.',
  [DEFS.skel_walker.lore]: 'Banlanmış bir hesabın iskeleti, hâlâ giriş yapmış durumda. Yürürken şıkırdar. Onu yere yıkarsan 4 saniye sonra kendini toplar... '
    + 'ama yerdeyken kafatasını ezersen (tekrar vur) bir daha kalkmaz.',
  [DEFS.skel_archer.lore]: 'Mesafesini korur, kemik kıymıkları ve eski CD\'ler fırlatır. Kol geriye gider ve mermi parlar: atış hazırlığı budur. '
    + 'Fırlattıktan sonra yana kaç, sonra mesafeyi kapat. Yaklaşırsan geri çekilir.',
  [DEFS.skel_knight.lore]: 'Ağır, yavaş ve önden vurması zor: kalkanı neredeyse her şeyi engeller. Yavaş döner: yandan dolan. '
    + 'Ağır ya da şarjlı bir vuruş kalkanı kenara iter ve onu sendeletir.',
  [DEFS.skel_swarm.lore]: 'Parmak uçlarında yerde koşuşan minik kafatası başlı eller. Tek başına zayıf, ama gruplar halinde gelir. Koridorda dövüş.',
  'DELETED USER': 'SİLİNMİŞ KULLANICI',
  'Smash the skull!': 'Kafatasını ez!',
  '[BANNED]': '[BANLI]', '[DELETED]': '[SİLİNDİ]', '[TOS VIOLATION]': '[KURAL İHLALİ]', '[404]': '[404]', '[SUSPENDED]': '[ASKIDA]', '[REPORTED]': '[ŞİKAYET]',
};

/** identify.js rows (soft): id -> [class, threat stars 1..5, ONE weakness hint] */
export const IDENT_ROWS = {
  skel_walker: ['Predator', 2, 'Gets back up 4 s after falling: hit the collapsed skull again to smash it for good.'],
  skel_archer: ['Predator', 2, 'Watch the wind-up (arm back, projectile glows), sidestep after the throw, then close in.'],
  skel_knight: ['Territorial', 3, 'The shield blocks everything from the front. Flank it, or stagger it with a heavy hit.'],
  skel_swarm: ['Swarm', 1, 'Weak but numerous. Fight in a corridor so they come one at a time.'],
};
