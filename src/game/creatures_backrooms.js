// BACKROOMS ENTITIES (wave-1 module 'brcreatures', installBackroomsCreatures). docs/wave1/brcreatures.md
//
//   br_smiler     SMILER      lives in the dark (unlit corridors, dark zones, breaker rooms, blackouts, flickering lamps).
//                             A grin and two eyes floating in the dark; the body only shows under a flashlight. A flashlight
//                             on it freezes it and makes it back off; unlit and close, it lunges (moderate bite) and melts away.
//   br_hound      PALE HOUND  pale, gaunt, crawls on all fours, blind. Hunts by SOUND: sprinting / loud items / voices make it
//                             charge the noise; walking only makes it sniff slowly towards you; crouching = silent. Lunge bite.
//   br_partygoer  PARTYGOER   tall yellow figure, crude "=)" face, balloon. Waves, honks a party horn, whispers "YOU'RE
//                             INVITED =)" in chat, then shuffles after you. If it reaches you it HUGS: you are held and
//                             squeezed (damage over time) until you mash [E] or a teammate hits it off. Lives in Level Fun.
//   br_moth       MOTH SWARM  orbits the lamps; swarms anyone whose flashlight is on (small nibbles). Lights off = they leave.
//
// Everything runs through the generic creature paths (registerCreature + CreatureManager.hostUpdate), so stun, damage,
// XP, snapshots, balance.scale (HP at spawn, speed via follow(), damage via hostHurtPlayer, detection via canSee/hear) and
// the early-game hit / speed caps apply exactly like for built-in creatures. Nothing is scaled twice here.
//
// Spawning (host): only inside a 'backrooms' facility.
//   - EXTRA_SPAWNS weights whose interior multiplier is 0 for every theme but 'backrooms' (a moon table that lists br_* ids,
//     e.g. the backrooms module's '∅-Level 0', wins as usual), and CREATURES[id].noSpawn is a getter that is true outside a
//     backrooms facility, so the generic gate (canSpawnMore in host.js / director.js) never spawns them anywhere else.
//   - game.hostSpawnCreatureIndoor is wrapped (instance property, removed on dispose) for br_* types only: Smilers spawn in
//     dark cells / by flickering lamps, Partygoers in Level Fun rooms (game.brlevels.levelAt(pos) === 'fun'; elsewhere only
//     rarely), Moths at lamps. Same fairness rules as host.js: > 14 m from players, early-game safe zone around the doors.
//   - 'moonPopulated': seeds the level with its locals (a moth swarm at a flickering lamp, a Smiler in a dark area, 45 % a
//     Partygoer waiting in the Level Fun room) and charges them to the indoor power budget (hostData.powerUsed).
//   - the backrooms pocket module spawns them directly (game.creatures.hostSpawn) - behaviours read its darkness softly.
// Net: request 'brstruggle' {c: creatureId} (the hugged player mashing E; host rate-limits 60 ms). Everything else rides on
//   the normal creature snapshot: a Partygoer in state 'hug' carries the victim's peer id in `extra` (moth 'swarm' too).
// Soft interfaces: game.brcreatures = { TYPES, spawn(type, pos, opts) (host), darkAt(pos) (host), hugged(), stats, dispose }
//   uses game.brlevels?.levelAt?.(pos) / .plan?.cellLight, game.backrooms?.pocket?.isDark / .contains / .emitters.
import * as THREE from 'three';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS, LOOPS } from '../entities/creatures.js';
import { ITEMS, registerItem } from './items.js';
import { FIELD_NOTES } from './collection.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { installBrRussian } from './br_i18n_ru.js';
import { angleDiff, clamp, dampAngle } from '../core/util.js';
import { planDarkCorridors } from '../world/setpieces.js';
import { hudDock } from '../ui/dock.js';
import { registerBackroomsModels, BR_ENV } from '../models/creatures_backrooms.js';
import { BR_SOUNDS, ensureBrSounds } from './creatures_backrooms_sfx.js';

export const BR_TYPES = ['br_smiler', 'br_hound', 'br_partygoer', 'br_moth'];
const BR_SET = new Set(BR_TYPES);
const V = new THREE.Vector3(), V2 = new THREE.Vector3();

// =====================================================================================================
// definitions (weak and slow at level 1 on purpose: the generic level / sector scaling makes them grow)
// =====================================================================================================
export const DEFS = {
  br_smiler: {
    name: 'Smiler', hp: 70, dmg: 14, walk: 1.4, run: 3.1, power: 1.5, xp: 75, coin: 13, zone: 'in', radius: 0.4, height: 1.95, maxAlive: 3,
    drop: ['br_tooth', 0.45], deathText: 'smiled back at a Smiler.',
    lore: 'A grin in the dark, far too wide, and two eyes that never blink. It is only brave where the lights are dead. '
      + 'Point a flashlight at it and it freezes, squints and backs away. Turn the light off next to one and it bites.',
  },
  br_hound: {
    name: 'Pale Hound', hp: 60, dmg: 12, walk: 1.6, run: 5.3, power: 1.5, xp: 65, coin: 11, zone: 'in', radius: 0.55, height: 0.95, maxAlive: 3,
    drop: ['br_finger', 0.35], deathText: 'was dragged off by a Pale Hound.',
    lore: 'Something that used to be a user, crawling on all fours with its hair over its face. It is blind. It hunts by SOUND: '
      + 'sprinting, loud tools, voices. Walk and it only sniffs after you; crouch and you do not exist.',
  },
  br_partygoer: {
    name: 'Partygoer', hp: 150, dmg: 5, walk: 1.2, run: 2.5, power: 2, xp: 130, coin: 26, zone: 'in', radius: 0.45, height: 2.6, maxAlive: 2,
    drop: ['br_partyhat', 0.6], deathText: 'was hugged to death at the party. =)',
    lore: 'A tall yellow guest with a face drawn on in marker. It waves. It honks a party horn. It wants you to stay. '
      + 'If it reaches you it hugs and does not let go: mash [E] to break free, or have a friend hit it off you.',
  },
  br_moth: {
    name: 'Moth Swarm', hp: 24, dmg: 3, walk: 1.8, run: 3.4, power: 0.5, xp: 20, coin: 3, zone: 'in', radius: 0.8, height: 2.7, maxAlive: 4,
    drop: ['br_mothdust', 0.5], deathText: 'was eaten alive by moths.',
    lore: 'Pale moths that orbit the fluorescent panels. They love light, and your flashlight is the brightest thing here. '
      + 'Switch it off and they drift back to the ceiling. One good swing scatters the swarm.',
  },
};
const ITEM_DEFS = {
  br_tooth: { id: 'br_tooth', name: 'Smiler Tooth', kind: 'drop', value: [28, 46], weight: 1, hands: 1 },
  br_finger: { id: 'br_finger', name: 'Pale Finger', kind: 'drop', value: [24, 40], weight: 1, hands: 1 },
  br_partyhat: { id: 'br_partyhat', name: 'Party Hat =)', kind: 'drop', value: [40, 70], weight: 2, hands: 1 },
  br_mothdust: { id: 'br_mothdust', name: 'Jar of Moth Dust', kind: 'drop', value: [14, 26], weight: 2, hands: 1 },
};
const NOTES = {
  br_smiler: 'Keep one light on it and walk backwards. Two lights = it just leaves. Blackouts are its favourite time.',
  br_hound: 'It follows the NOISE, not you. Sprint away, then crouch: it runs to where you were and loses the trail.',
  br_partygoer: 'Slow, but it never stops smiling. If it hugs a friend, hit it: one hit knocks it off. Mash E if it is you.',
  br_moth: 'Harmless alone, awful in a Smiler corridor: lights on for the Smiler, lights off for the moths. Choose.',
};
// only the 'backrooms' interior gets these weights (any other theme reads 0; a moon's own table still wins)
const onlyBackrooms = (mul = 1) => new Proxy({}, { get: (_, k) => (k === 'backrooms' ? mul : 0) });
const SPAWNS = {
  br_smiler: { zone: 'in', w: [22, 24, 26, 28], interior: onlyBackrooms() },
  br_hound: { zone: 'in', w: [12, 16, 19, 22], interior: onlyBackrooms() },
  br_partygoer: { zone: 'in', w: [5, 7, 8, 9], interior: onlyBackrooms() },
  br_moth: { zone: 'in', w: [14, 14, 13, 12], interior: onlyBackrooms() },
};
// tuning (host)
export const TUNE = {
  smiler: { sight: 17, litRange: 18, litCone: 0.93, litRecede: 0.8, lungeR: 2.3, lungeSpeed: 6.2, lungeT: 0.4, biteR: 1.5, cd: 2.8, giggleEvery: [7, 13] },
  hound: { hear: 22, loud: 0.45, lungeR: 2.1, lungeSpeed: 7.5, lungeT: 0.35, biteR: 1.5, cd: 1.8, lostT: 3.2 },
  party: { sight: 22, hugR: 1.25, tick: 1.0, leash: 34, rushR: 6 },
  moth: { lure: 11, swarmR: 1.4, nibble: 1.2 },
};
/** presses needed to break a hug (the client shows the same number) */
export const struggleNeed = (level) => clamp(Math.round(7 + (level - 1) * 0.6), 7, 14);

const TR = {
  Smiler: 'Sırıtkan', 'Pale Hound': 'Soluk Tazı', Partygoer: 'Parti Konuğu', 'Moth Swarm': 'Güve Sürüsü',
  'Smiler Tooth': 'Sırıtkan Dişi', 'Pale Finger': 'Soluk Parmak', 'Party Hat =)': 'Parti Şapkası =)', 'Jar of Moth Dust': 'Kavanozda Güve Tozu',
  [DEFS.br_smiler.lore]: 'Karanlıkta fazlasıyla geniş bir sırıtış ve hiç kırpışmayan iki göz. Sadece ışıkların öldüğü yerde cesur. '
    + 'Üstüne fener tut: donar, gözlerini kısar ve geri çekilir. Yanındayken feneri kapatırsan ısırır.',
  [DEFS.br_hound.lore]: 'Eskiden bir kullanıcı olan bir şey; saçları yüzünde, dört ayak üstünde sürünüyor. Kör. SESLE avlanır: '
    + 'koşmak, gürültülü aletler, konuşmak. Yürürsen sadece koklayarak peşinden gelir; çömelirsen yoksun.',
  [DEFS.br_partygoer.lore]: 'Yüzü keçeli kalemle çizilmiş uzun, sarı bir misafir. El sallar. Parti düdüğü öttürür. Kalmanı ister. '
    + 'Sana ulaşırsa sarılır ve bırakmaz: kurtulmak için [E]\'ye art arda bas ya da bir arkadaşın ona vurup seni kurtarsın.',
  [DEFS.br_moth.lore]: 'Floresan panellerin etrafında dönen solgun güveler. Işığı severler ve buradaki en parlak şey senin fenerin. '
    + 'Kapat, tavana geri dönsünler. İyi bir savuruş sürüyü dağıtır.',
  [DEFS.br_smiler.deathText]: 'bir Sırıtkan\'a gülümsedi.',
  [DEFS.br_hound.deathText]: 'bir Soluk Tazı tarafından sürüklendi.',
  [DEFS.br_partygoer.deathText]: 'partide sarılarak öldürüldü. =)',
  [DEFS.br_moth.deathText]: 'güveler tarafından diri diri yendi.',
  [NOTES.br_smiler]: 'Feneri üstünde tut ve geri geri yürü. İki fener = direkt gider. Karartmalar en sevdiği an.',
  [NOTES.br_hound]: 'Seni değil, SESİ takip eder. Koşarak uzaklaş, sonra çömel: bulunduğun yere koşar ve izini kaybeder.',
  [NOTES.br_partygoer]: 'Yavaş ama gülümsemesi hiç bitmez. Bir arkadaşına sarılırsa vur: tek vuruş onu düşürür. Sana sarıldıysa E\'ye bas.',
  [NOTES.br_moth]: 'Tek başına zararsız, Sırıtkan koridorunda berbat: Sırıtkan için fener açık, güveler için kapalı. Seç.',
  "YOU'RE INVITED =)": 'DAVETLİSİN =)',
  'THE PARTY IS THIS WAY =)': 'PARTİ BU TARAFTA =)',
  "DON'T YOU WANT TO STAY? =)": 'KALMAK İSTEMEZ MİSİN? =)',
  'WE MADE YOU A CAKE =)': 'SANA PASTA YAPTIK =)',
  'EVERYONE IS HERE =)': 'HERKES BURADA =)',
  'YOU CAN NEVER LEAVE THE PARTY =)': 'PARTİDEN ASLA AYRILAMAZSIN =)',
  'MASH [{k}] TO BREAK FREE': 'KURTULMAK İÇİN [{k}] TUŞUNA ART ARDA BAS',
  'HIT THE PARTYGOER TO FREE {name}': '{name} KURTULSUN DİYE PARTİ KONUĞUNA VUR',
  'You broke free!': 'Kurtuldun!',
  'ENTITY SIGHTED': 'VARLIK GÖRÜLDÜ',
  'Keep a light on it. It hates being seen.': 'Işığı üstünde tut. Görülmekten nefret eder.',
  'Blind. It hunts by sound. Crouch.': 'Kör. Sesle avlanır. Çömel.',
  'It wants a hug. Do not let it reach you.': 'Sarılmak istiyor. Sana ulaşmasına izin verme.',
  'They want your light.': 'Işığını istiyorlar.',
};
// Russian: names, prompts and HUD lines live in br_i18n_ru.js; the long texts keyed by the definitions are here
const RU_LONG = {
  [DEFS.br_smiler.lore]: 'Слишком широкая ухмылка в темноте и два немигающих глаза. Смел только там, где мёртв свет. '
    + 'Посвети на него фонарём: замрёт, прищурится и отступит. Выключишь фонарь рядом с ним, и он укусит.',
  [DEFS.br_hound.lore]: 'Нечто, что раньше было пользователем: ползёт на четвереньках, волосы закрывают лицо. Слепая. Охотится на ЗВУК: '
    + 'бег, шумные инструменты, голоса. Пойдёшь шагом, она лишь принюхивается; присядешь, и тебя для неё нет.',
  [DEFS.br_partygoer.lore]: 'Высокий жёлтый гость с лицом, нарисованным маркером. Машет рукой. Гудит в праздничную дудку. Хочет, чтобы ты остался. '
    + 'Дотянется, обнимет и не отпустит: жми [E], чтобы вырваться, или пусть друг собьёт его ударом.',
  [DEFS.br_moth.lore]: 'Бледные мотыльки кружат у люминесцентных панелей. Любят свет, а твой фонарь здесь ярче всего. '
    + 'Выключи его, и они вернутся к потолку. Хороший взмах разгоняет рой.',
  [DEFS.br_smiler.deathText]: 'улыбнулся Улыбаке в ответ.',
  [DEFS.br_hound.deathText]: 'был утащен Бледной гончей.',
  [DEFS.br_partygoer.deathText]: 'был обнят до смерти на вечеринке. =)',
  [DEFS.br_moth.deathText]: 'был съеден заживо мотыльками.',
  [NOTES.br_smiler]: 'Держи на нём свет и пяться назад. Два фонаря, и он просто уйдёт. Любит отключения света.',
  [NOTES.br_hound]: 'Идёт на ШУМ, а не на тебя. Убеги бегом, потом присядь: она прибежит туда, где ты был, и потеряет след.',
  [NOTES.br_partygoer]: 'Медленный, но улыбка не сходит. Если обнимает друга, бей: один удар сбивает его. Если тебя, жми E.',
  [NOTES.br_moth]: 'Поодиночке безвредны, в коридоре Улыбаки ужасны: свет включён для Улыбаки, выключен для мотыльков. Выбирай.',
};

// =====================================================================================================
// registration (idempotent; creature defs + models + items + sounds + spawn weights + codex notes)
// =====================================================================================================
let gateGame = null;   // the running game: the noSpawn getters read its facility theme
const inBackrooms = () => gateGame?.world?.facility?.layout?.theme === 'backrooms';
let registered = false;
export function registerBackroomsCreatures() {
  if (registered) return;
  registered = true;
  const BEH = { br_smiler: smilerBehavior, br_hound: houndBehavior, br_partygoer: partygoerBehavior, br_moth: mothBehavior };
  for (const id of BR_TYPES) {
    if (!CREATURES[id]) registerCreature(id, { ...DEFS[id] }, BEH[id]);
    // generic spawn gate (host.js hostSpawnWave / director pressure -> canSpawnMore -> def.noSpawn): backrooms only
    try { Object.defineProperty(CREATURES[id], 'noSpawn', { enumerable: true, configurable: true, get: () => !inBackrooms() }); } catch { /* frozen */ }
  }
  for (const [id, e] of Object.entries(SPAWNS)) if (!EXTRA_SPAWNS[id]) EXTRA_SPAWNS[id] = e;
  for (const def of Object.values(ITEM_DEFS)) if (!ITEMS[def.id]) registerItem({ ...def });
  for (const [id, n] of Object.entries(NOTES)) if (!FIELD_NOTES[id]) FIELD_NOTES[id] = n;
  Object.assign(STATE_SOUNDS, {
    br_smiler: { lit: ['br_smiler_hiss', 0.75], lunge: ['br_smiler_shriek', 1.0], retreat: [['whisper_2', 'whisper_1'], 0.55, 0.7], dead: ['br_smiler_hiss', 1.0, 0.55] },
    br_hound: { hunt: ['br_hound_shriek', 0.95], lunge: [['lurker_snap', 'hound_bark'], 1.0, 1.25], lost: ['br_sniff', 0.7], dead: [['creature_death'], 0.9, 1.35], stunned: [['creature_hurt'], 0.8, 1.3] },
    br_partygoer: { wave: ['br_partyhorn', 0.85], hug: ['br_partyhorn_long', 1.0], stagger: ['br_balloon_squeak', 0.9], dead: ['br_pop', 1.0] },
    br_moth: { scatter: [['cloth_rustle'], 0.9, 1.7], dead: [['cloth_rustle'], 0.6, 2.1] },
  });
  Object.assign(LOOPS, {
    br_smiler: [],
    br_hound: [['walk', 'br_skitter', 0.45], ['sniff', 'br_skitter', 0.35], ['hunt', 'br_skitter_fast', 0.9], ['lunge', 'br_skitter_fast', 0.9]],
    br_partygoer: [['hug', 'jester_music', 0.32, 0.72]],
    br_moth: [['*', 'br_moths', 0.5]],
  });
  addTranslations(TR);
  addTranslations(RU_LONG, 'ru');
  installBrRussian();
}

// =====================================================================================================
// host helpers
// =====================================================================================================
const livePlayers = (M, c) => M.playersFor(c).filter((p) => !p.dead && !p.inShip);
function faceTo(c, x, z, dt, rate) {
  const want = Math.atan2(x - c.pos.x, z - c.pos.z);
  c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt);
}
/** straight dash (lunges): capped by the balance speed rules, stops at walls (nav) */
function dash(c, M, dir, speed, dt) {
  const sp = M.speedMul(c, speed) * dt;
  const nx = c.pos.x + dir.x * sp, nz = c.pos.z + dir.z * sp;
  const nav = M.nav(c);
  if (nav) {
    const [gx, gz] = nav.toGrid(nx, nz);
    if (!nav.isWalkable(gx, gz)) return false;
  }
  M.placeAt(c, nx, nz);
  return true;
}
function awayFrom(c, M, x, z, dist = 8) {
  const nav = M.nav(c);
  const ax = c.pos.x + (c.pos.x - x), az = c.pos.z + (c.pos.z - z);
  const p = nav?.randomWalkable(Math.random, ax, az, Math.max(2, dist / (nav.res || 1) * 0.5));
  if (p) M.goTo(c, p.x, p.z);
  else M.goTo(c, c.pos.x + Math.sign(c.pos.x - x) * dist, c.pos.z + Math.sign(c.pos.z - z) * dist);
}

// darkness: 0 lit, 1 dim (flickering lamp, pipe tunnels), 2 dark. Host AI + spawns; cached per facility.
const DARK = { fac: null, m: null, flick: [], lamps: [], darkCells: [] };
function darkMap(game) {
  const fac = game.world?.facility;
  if (!fac) return null;
  if (DARK.fac === fac) return DARK;
  const L = fac.layout, N = L.w * L.h, m = new Uint8Array(N);
  const plan = L.brPlan || game.brlevels?.plan || null;
  if (plan?.cellLight && plan.cellLight.length === N) {
    for (let i = 0; i < N; i++) if (L.cells[i]) { const v = plan.cellLight[i]; m[i] = v < 0.22 ? 2 : v < 0.6 ? 1 : 0; }
  } else {
    let dc = null;
    try { dc = planDarkCorridors(L); } catch { dc = null; }
    for (let i = 0; i < N; i++) {
      if (!L.cells[i]) continue;
      const r = L.roomOf[i] >= 0 ? L.rooms[L.roomOf[i]] : null;
      if (r && (r.type === 'dark_zone' || r.type === 'nest')) m[i] = 2;
      else if (!r && dc?.has(i)) m[i] = 2;
    }
  }
  const flick = [], lamps = [];
  for (const e of fac.emitters || []) {
    if (e.group !== 'facility' || !e.pos) continue;
    lamps.push(e);
    if (e.flicker > 0) { flick.push(e); const i = fac.cellAt(e.pos.x, e.pos.z); if (i >= 0 && m[i] === 0) m[i] = 1; }
  }
  const darkCells = [];
  for (let i = 0; i < N; i++) if (m[i] === 2) darkCells.push(i);
  Object.assign(DARK, { fac, m, flick, lamps, darkCells });
  return DARK;
}
function pocketOf(game, pos) {
  const pk = game.backrooms?.pocket;
  try { return pk && pk.contains?.(pos) ? pk : null; } catch { return null; }
}
/** 0 lit / 1 dim / 2 dark at a world position (host) */
function darkAt(game, pos) {
  const pk = pocketOf(game, pos);
  if (pk) { try { return pk.isDark?.(pos.x, pos.z) ? 2 : 0; } catch { return 0; } }
  const fac = game.world?.facility;
  if (!fac || !fac.contains?.(pos)) return 0;
  if (game.run && game.run.powerOn === false) return 2;
  const D = darkMap(game);
  const i = fac.cellAt(pos.x, pos.z);
  if (i < 0) return 0;
  const L = fac.layout, ro = L.roomOf[i];
  if (ro >= 0) {
    const brk = fac.hazards?.breakers || fac.setPieces?.hazards?.breakers;
    if (brk?.length) for (const b of brk) if (b.room === ro && b.on === false) return 2;
  }
  return D ? D.m[i] : 0;
}
function lampsNear(game, c) {
  const pk = pocketOf(game, c.pos);
  if (pk) return (pk.emitters || []).filter((e) => e.group === 'br_pocket' && e.pos);
  const D = darkMap(game);
  return D ? D.lamps : [];
}

/** player whose flashlight cone is on this creature (host: aiPlayers carry flash + look), else null */
function litBy(c, M, players, range, cone) {
  const head = V.set(c.pos.x, c.pos.y + 1.6, c.pos.z);
  for (const p of players) {
    if (!p.flash) continue;
    const d = head.distanceTo(p.eye);
    if (d > range) continue;
    V2.copy(head).sub(p.eye).normalize();
    if (V2.dot(p.look) < (d < 3 ? cone - 0.12 : cone)) continue;
    if (!M.game.physics.lineOfSight(p.eye, head)) continue;
    return p;
  }
  return null;
}

// =====================================================================================================
// behaviours (host)
// =====================================================================================================
function smilerBehavior(c, dt, M) {
  const g = M.game, d = c.data, T = TUNE.smiler;
  if (c.state === 'idle') c.setState('lurk');
  const players = livePlayers(M, c);
  // the bite: a short straight dash, one bite check, then it melts back into the dark
  if (c.state === 'lunge') {
    if (c.t < T.lungeT && d.dir) dash(c, M, d.dir, T.lungeSpeed, dt);
    if (!d.bit && c.t > 0.18) {
      d.bit = true;
      const p = g.aiPlayerById(c.target);
      if (p && !p.dead && p.pos.distanceTo(c.pos) < T.biteR + 0.4) M.attack(c, p, c.dmg, 'br_smiler');
    }
    if (c.t > 0.7) { const p = g.aiPlayerById(c.target); c.setState('retreat'); if (p) awayFrom(c, M, p.pos.x, p.pos.z, 9); }
    return;
  }
  // a flashlight on it: freeze, then back away from the light; a long stare sends it elsewhere
  const lp = litBy(c, M, players, T.litRange, T.litCone);
  if (lp) {
    if (c.state !== 'lit') { c.setState('lit'); d.litT = 0; }
    d.litT = (d.litT || 0) + dt;
    faceTo(c, lp.pos.x, lp.pos.z, dt, 6);
    if (d.litT > 0.7) {
      const dx = c.pos.x - lp.pos.x, dz = c.pos.z - lp.pos.z, l = Math.hypot(dx, dz) || 1;
      dash(c, M, V2.set(dx / l, 0, dz / l), T.litRecede * (d.litT > 3 ? 1.6 : 1), dt);
    }
    if (d.litT > 5) { c.setState('retreat'); d.litT = 0; awayFrom(c, M, lp.pos.x, lp.pos.z, 12); }
    return;
  }
  if (c.state === 'lit') { c.setState('lurk'); c.cooldown = Math.max(c.cooldown, 0.8); }
  if (c.state === 'retreat') {
    if (M.follow(c, dt, c.def.run) || c.t > 6) c.setState('lurk');
    return;
  }
  // hunting: stalk the nearest player it can see, but never step out of the darkness while someone is near
  let tgt = players.find((p) => p.id === c.target && p.pos.distanceTo(c.pos) < T.sight * 1.4) || null;
  if (!tgt) for (const p of players) if (M.canSee(c, p, T.sight, 220)) { tgt = p; c.target = p.id; break; }
  if (!tgt) c.target = null;
  const here = darkAt(g, c.pos);
  if (tgt) {
    const dist = tgt.pos.distanceTo(c.pos);
    if (dist < T.lungeR && c.cooldown <= 0 && Math.abs(tgt.pos.y - c.pos.y) < 2 && g.physics.lineOfSight(M.eye(c).clone(), tgt.eye)) {
      c.setState('lunge'); c.cooldown = T.cd; d.bit = false;
      const dx = tgt.pos.x - c.pos.x, dz = tgt.pos.z - c.pos.z, l = Math.hypot(dx, dz) || 1;
      d.dir = new THREE.Vector3(dx / l, 0, dz / l);
      c.yaw = Math.atan2(dx, dz);
      return;
    }
    // giggles while it watches you
    d.gigT = (d.gigT ?? 3) - dt;
    if (d.gigT <= 0 && dist < 16) { d.gigT = T.giggleEvery[0] + Math.random() * (T.giggleEvery[1] - T.giggleEvery[0]); M.sound(c, 'br_giggle', 0.75, 3, 0.9 + Math.random() * 0.2); }
    const px = c.pos.x, pz = c.pos.z;
    const creep = dist < 7;
    c.setState(creep ? 'stalk' : 'run');
    M.moveToward(c, tgt.pos, dt, creep ? c.def.walk : c.def.run);
    if (here > 0 && darkAt(g, c.pos) === 0) {   // the next step is lit: wait at the edge of the dark and stare
      c.pos.x = px; c.pos.z = pz;
      c.setState('lurk');
      faceTo(c, tgt.pos.x, tgt.pos.z, dt, 4);
    } else if (here === 0 && dist < 10) {        // caught in the light with someone close: go back to the dark
      c.setState('retreat'); awayFrom(c, M, tgt.pos.x, tgt.pos.z, 10);
    }
    return;
  }
  // nobody around: drift between dark spots, drawn to flickering lamps
  if (c.state === 'lurk' && c.t > (d.idleT ??= 4 + Math.random() * 6)) {
    d.idleT = 4 + Math.random() * 6;
    const D = darkMap(g);
    const inPocket = !!pocketOf(g, c.pos);
    const flick = !inPocket && D ? D.flick.filter((e) => e.pos.distanceTo(c.pos) < 28 && !e.disabled) : [];
    if (flick.length && Math.random() < 0.55) { const e = flick[Math.floor(Math.random() * flick.length)]; M.goTo(c, e.pos.x, e.pos.z); }
    else {
      const nav = M.nav(c);
      let spot = null;
      for (let k = 0; k < 8 && nav; k++) {
        const p = nav.randomWalkable(Math.random, c.pos.x, c.pos.z, 10);
        if (p && darkAt(g, V.set(p.x, c.pos.y, p.z)) > 0) { spot = p; break; }
        if (!spot) spot = p;
      }
      if (spot) M.goTo(c, spot.x, spot.z);
    }
    c.setState('walk');
    return;
  }
  if (c.state === 'walk' || c.state === 'run' || c.state === 'stalk') { if (M.follow(c, dt, c.def.walk)) c.setState('lurk'); }
}

function houndBehavior(c, dt, M) {
  const g = M.game, d = c.data, T = TUNE.hound;
  const players = livePlayers(M, c);
  if (c.state === 'lunge') {
    if (c.t < T.lungeT && d.dir) dash(c, M, d.dir, T.lungeSpeed, dt);
    if (!d.bit && c.t > 0.16) {
      d.bit = true;
      const p = g.aiPlayerById(c.target);
      if (p && !p.dead && p.pos.distanceTo(c.pos) < T.biteR + 0.3) M.attack(c, p, c.dmg, 'br_hound');
    }
    if (c.t > 0.75) c.setState(d.last ? 'sniff' : 'idle');
    return;
  }
  // somebody noisy (or anyone while it is charging) right next to it: lunge
  for (const p of players) {
    const dist = p.pos.distanceTo(c.pos);
    if (dist < T.lungeR && Math.abs(p.pos.y - c.pos.y) < 2 && c.cooldown <= 0 && (p.noise > 0.1 || p.voice > 0.06 || (c.state === 'hunt' && dist < 1.6))) {
      c.setState('lunge'); c.cooldown = T.cd; c.target = p.id; d.bit = false;
      const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, l = Math.hypot(dx, dz) || 1;
      d.dir = new THREE.Vector3(dx / l, 0, dz / l);
      c.yaw = Math.atan2(dx, dz);
      return;
    }
  }
  const n = M.hear(c, T.hear);
  if (n && (!d.lastT || g.time - d.lastT > 0.25)) {
    d.lastT = g.time;
    d.last = n.pos.clone();
    if (n.loud >= T.loud) {
      if (c.state !== 'hunt') { c.setState('hunt'); }
      M.goToLazy(c, n.pos.x, n.pos.z, 1.5);
    } else if (c.state !== 'hunt') {
      c.setState('sniff');
      M.goToLazy(c, n.pos.x, n.pos.z, 2.5);
    }
  }
  if (c.state === 'hunt') { if (M.follow(c, dt, c.def.run, 6)) { c.setState('lost'); d.last = null; } return; }
  if (c.state === 'sniff') { if (M.follow(c, dt, c.def.walk * 1.15)) c.setState('lost'); return; }
  if (c.state === 'lost') {           // at the spot: head up, listening, turning. Nothing? Back to wandering.
    c.yaw += Math.sin(c.t * 2.2) * dt * 1.4;
    if (c.t > T.lostT) c.setState('idle');
    return;
  }
  if (c.state === 'idle' && c.t > (d.idleT ??= 2 + Math.random() * 4)) { d.idleT = 2 + Math.random() * 4; M.wander(c, 14); c.setState('walk'); }
  if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
  if (c.state !== 'idle' && c.state !== 'walk' && c.state !== 'stunned') c.setState('idle');
}

function partygoerBehavior(c, dt, M) {
  const g = M.game, d = c.data, T = TUNE.party;
  if (!d.home) { d.home = c.pos.clone(); d.fun = g.brlevels?.levelAt?.(c.pos) === 'fun'; }
  if (c.state !== 'hug' && c.extra) c.extra = 0;   // (a stun mid-hug drops the victim)
  if (c.state === 'hug') { hugTick(c, dt, M); return; }
  if (c.state === 'stagger') { if (c.t > 2.4) c.setState('idle'); return; }
  const players = livePlayers(M, c);
  if (d.ignoreT > 0) d.ignoreT -= dt;
  let tgt = players.find((p) => p.id === c.target) || null;
  if (!tgt && !(d.ignoreT > 0)) for (const p of players) if (M.canSee(c, p, T.sight, 170)) { tgt = p; c.target = p.id; d.lostT = 0; break; }
  if (tgt) {
    // one of the crew is being hugged by another Partygoer: it waits its turn, waving
    if (tgt.latched || hugVictims(M).has(tgt.id)) { c.target = null; if (c.state !== 'wave') c.setState('wave'); faceTo(c, tgt.pos.x, tgt.pos.z, dt, 3); return; }
    const dist = tgt.pos.distanceTo(c.pos);
    d.lostT = M.canSee(c, tgt, T.sight * 1.4, 360) ? 0 : (d.lostT || 0) + dt;
    if (d.lostT > 8 || (d.fun && c.pos.distanceTo(d.home) > T.leash)) { c.target = null; d.greeted = false; d.ignoreT = 8; c.setState('wave'); M.goTo(c, d.home.x, d.home.z); d.homing = true; return; }
    if (!d.greeted) { d.greeted = true; c.setState('wave'); return; }
    if (c.state === 'wave' && c.t < 2.3) { faceTo(c, tgt.pos.x, tgt.pos.z, dt, 3); return; }
    if (dist < T.hugR && c.cooldown <= 0 && Math.abs(tgt.pos.y - c.pos.y) < 1.8) { startHug(c, tgt, M); return; }
    c.setState(dist < T.rushR ? 'rush' : 'walk');
    M.moveToward(c, tgt.pos, dt, dist < T.rushR ? c.def.run : c.def.walk, 4);
    d.hornT = (d.hornT ?? 6) - dt;
    if (d.hornT <= 0) { d.hornT = 7 + Math.random() * 8; M.sound(c, Math.random() < 0.6 ? 'br_partyhorn' : 'br_balloon_squeak', 0.7, 3, 0.85 + Math.random() * 0.3); }
    return;
  }
  // nobody: back home, then mill about the room; now and then it waves at nothing
  d.greeted = false;
  if (c.state === 'wave' && c.t < 2.3) return;
  if (d.homing) { if (M.follow(c, dt, c.def.walk)) d.homing = false; c.setState('walk'); return; }
  if ((c.state === 'idle' || c.state === 'wave') && c.t > (d.idleT ??= 3 + Math.random() * 5)) {
    d.idleT = 3 + Math.random() * 5;
    if (Math.random() < 0.3) { c.setState('wave'); return; }
    const nav = M.nav(c);
    const p = nav?.randomWalkable(Math.random, d.home.x, d.home.z, d.fun ? 5 : 12);
    if (p) M.goTo(c, p.x, p.z);
    c.setState('walk');
    return;
  }
  if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
  if (c.state === 'rush') c.setState('idle');
}
function hugVictims(M) {
  const s = new Set();
  for (const o of M.host.values()) if (o.type === 'br_partygoer' && !o.dead && o.state === 'hug' && o.extra) s.add(o.extra);
  return s;
}
function startHug(c, p, M) {
  const d = c.data;
  c.setState('hug');
  c.extra = p.id; c.target = p.id;
  d.hugT0 = M.game.time; d.struggle = 0; d.need = struggleNeed(c.level); d.tick = 0.55; d.hitAt = 0; d.hitBy = null;
  c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
  M.noise(c.pos, 0.8, c.id);   // the horn and the struggling carry: other things come to the party
}
function hugTick(c, dt, M) {
  const d = c.data, g = M.game;
  const p = g.aiPlayerById(c.extra);
  if (!p || p.dead || p.inShip || p.pos.distanceTo(c.pos) > 4) { releaseHug(c, M, false); return; }
  // a hit from a teammate knocks it off at once; the victim's own swings count as struggling
  if (d.hitAt && d.hitAt >= d.hugT0) {
    const by = d.hitBy; d.hitAt = 0; d.hitBy = null;
    if (by && by !== c.extra) { releaseHug(c, M, true, by); return; }
    d.struggle += 2;
  }
  if (d.struggle >= d.need) { releaseHug(c, M, true, c.extra); return; }
  faceTo(c, p.pos.x, p.pos.z, dt, 5);
  d.tick -= dt;
  if (d.tick <= 0) {
    d.tick = TUNE.party.tick;
    const held = g.time - d.hugT0;
    M.attack(c, p, Math.max(1, Math.round(c.dmg * (held > 10 ? 1.6 : 1))), 'br_partygoer');   // it squeezes harder the longer it lasts
  }
}
function releaseHug(c, M, knocked, by) {
  const victim = c.extra;
  c.extra = 0;
  if (knocked) {
    c.setState('stagger'); c.cooldown = 5; c.target = null; c.data.greeted = true;
    const p = M.game.aiPlayerById(victim) || (by ? M.game.aiPlayerById(by) : null);
    if (p) { const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1; for (let k = 0; k < 8; k++) dash(c, M, V2.set(dx / l, 0, dz / l), 12, 1 / 30); }
  } else { c.setState('idle'); c.cooldown = 2; }
}

function mothBehavior(c, dt, M) {
  const g = M.game, d = c.data, T = TUNE.moth;
  if (c.state === 'idle') c.setState('orbit');
  if (d.hitAt) { d.hitAt = 0; c.setState('scatter'); c.extra = 0; awayFrom(c, M, c.pos.x + Math.random() - 0.5, c.pos.z + Math.random() - 0.5, 5); }
  if (c.state === 'scatter') { M.follow(c, dt, c.def.run); if (c.t > 1.6) c.setState('orbit'); return; }
  // lured by flashlights (line of sight), otherwise back to the lamps
  const players = livePlayers(M, c);
  let tgt = null, best = T.lure;
  const eye = V.set(c.pos.x, c.pos.y + 2.0, c.pos.z);
  for (const p of players) {
    if (!p.flash) continue;
    const dist = p.pos.distanceTo(c.pos);
    if (dist < best && g.physics.lineOfSight(eye, p.eye)) { best = dist; tgt = p; }
  }
  if (tgt) {
    c.target = tgt.id;
    if (best < T.swarmR) {
      c.setState('swarm'); c.extra = tgt.id;
      M.moveToward(c, tgt.pos, dt, c.def.run * 1.4, 10);
      d.nib = (d.nib ?? 0.6) - dt;
      if (d.nib <= 0) { d.nib = T.nibble; M.attack(c, tgt, c.dmg, 'br_moth'); }
    } else {
      c.setState('run'); c.extra = 0;
      M.moveToward(c, tgt.pos, dt, c.def.run, 10);
    }
    return;
  }
  c.target = null; c.extra = 0;
  if (!d.lamp || (d.lampT = (d.lampT || 0) + dt) > 25) {
    d.lampT = 0;
    const lamps = lampsNear(g, c).filter((e) => e.pos.distanceTo(c.pos) < 30 && !e.disabled);
    if (lamps.length) {
      const fl = lamps.filter((e) => e.flicker > 0);
      const pool = fl.length && Math.random() < 0.6 ? fl : lamps;
      d.lamp = pool[Math.floor(Math.random() * pool.length)].pos;
      M.goTo(c, d.lamp.x, d.lamp.z);
    } else { d.lamp = null; M.wander(c, 8); }
  }
  const home = d.lamp;
  if (home && Math.hypot(home.x - c.pos.x, home.z - c.pos.z) > 0.9) { c.setState('walk'); if (M.follow(c, dt, c.def.walk)) c.setState('orbit'); }
  else { c.setState('orbit'); if (!home && c.t > 6) { M.wander(c, 8); c.setState('walk'); } }
}

// =====================================================================================================
// install
// =====================================================================================================
export function installBackroomsCreatures(game) {
  registerBackroomsCreatures();
  gateGame = game;
  const offs = [];
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (typeof off === 'function') offs.push(off); };
  const S = {
    disposed: false, spawned: { br_smiler: 0, br_hound: 0, br_partygoer: 0, br_moth: 0 }, placed: 0, fallback: 0, seeded: null,
    sndIdx: 0, sndT: 0, lastStruggle: 0, presses: 0, hugId: null, hugT: 0, prevStates: new Map(), whisperT: 12, sighted: new Set(), dayKey: '',
    capEl: null, capT: 0, promptEl: null, cssDone: false, struggles: 0,
  };
  const isHost = () => !!game.isHost;
  registerBackroomsModels();
  BR_ENV.lit = (pos) => { try { return game.isLitByFlashlight?.(pos, 16) || false; } catch { return false; } };

  // ---------------------------------------------------------------- sounds: render lazily, one per idle slice
  function queueSounds() {
    const names = Object.keys(BR_SOUNDS);
    const step = () => {
      if (S.disposed) return;
      if (!game.audio?.ctx) { setTimeout(step, 1500); return; }
      if (S.sndIdx >= names.length) return;
      const n = names[S.sndIdx++];
      if (!game.audio.buffers?.has(n)) {
        try {
          const data = BR_SOUNDS[n](game.audio.ctx.sampleRate);
          const buf = game.audio.ctx.createBuffer(1, data.length, game.audio.ctx.sampleRate);
          buf.copyToChannel(data, 0);
          game.audio.buffers.set(n, buf);
        } catch (e) { console.warn('br sound', n, e); }
      }
      if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 400 }); else setTimeout(step, 60);
    };
    try { ensureBrSounds({ mods: game.mods, audio: null }); } catch { /* registry only */ }
    setTimeout(step, 800);
  }
  queueSounds();

  // ---------------------------------------------------------------- host: placement
  /** spot for a br_* creature, or null = let host.js place it (vent / scrap spot) */
  function pickSpot(type) {
    const fac = game.world?.facility;
    const nav = fac?.nav;
    if (!fac || !nav) return null;
    const players = game.aiPlayers().filter((p) => p.zone === 'in' && !p.dead);
    const early = game.hostEarlySafeFilter?.() || null;
    const ok = (s) => players.every((p) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > 14 || Math.abs(p.pos.y - s.y) > 6) && (!early || early(s));
    const Y = fac.layout.y;
    const D = darkMap(game);
    const cand = [];
    const want = (s) => {
      if (type === 'br_smiler') return darkAt(game, V.set(s.x, Y, s.z)) > 0;
      if (type === 'br_partygoer') return game.brlevels?.levelAt?.(V.set(s.x, Y + 0.5, s.z)) === 'fun';
      return true;
    };
    if (type === 'br_moth' && D?.lamps.length) {
      const pool = D.flick.length ? D.flick.concat(D.flick, D.lamps) : D.lamps;
      for (let k = 0; k < 24; k++) {
        const e = pool[Math.floor(Math.random() * pool.length)];
        const g2 = nav.nearestWalkable(...nav.toGrid(e.pos.x, e.pos.z), 3);
        if (!g2) continue;
        const w = nav.toWorld(g2[0], g2[1]);
        const s = { x: w.x, y: Y, z: w.z };
        if (ok(s)) return s;
      }
      return null;
    }
    if (type === 'br_smiler' && D?.darkCells.length) {
      const L = fac.layout;
      for (let k = 0; k < 40 && cand.length < 6; k++) {
        const i = D.darkCells[Math.floor(Math.random() * D.darkCells.length)];
        const x = L.ox + ((i % L.w) + 0.5) * L.cell, z = L.oz + (Math.floor(i / L.w) + 0.5) * L.cell;
        const g2 = nav.nearestWalkable(...nav.toGrid(x, z), 3);
        if (!g2) continue;
        const w = nav.toWorld(g2[0], g2[1]);
        const s = { x: w.x, y: Y, z: w.z };
        if (ok(s)) cand.push(s);
      }
    }
    for (let k = 0; k < 90 && cand.length < 4; k++) {
      const w = nav.randomWalkable(Math.random);
      if (!w) continue;
      const s = { x: w.x, y: Y, z: w.z };
      if (want(s) && ok(s)) cand.push(s);
    }
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  }
  function spawnAt(type, s, opts = {}) {
    if (game.crdirector?.canSpawn?.(type, null, 'backrooms') === false) return null;   // [threatmerge] director budget
    const c = game.creatures.hostSpawn(type, new THREE.Vector3(s.x, s.y, s.z), { level: game.rollLevel?.() || 1, elite: game.rollElite?.() || false, zone: 'in', ...opts });
    if (c) S.spawned[type] = (S.spawned[type] || 0) + 1;
    return c;
  }
  // host.js hostSpawnCreatureIndoor(type) wrapper: br_* types get their own spots in a backrooms facility
  const protoIndoor = game.hostSpawnCreatureIndoor;
  const wrappedIndoor = function (type) {
    if (!S.disposed && BR_SET.has(type) && inBackrooms()) {
      const s = pickSpot(type);
      if (s) { S.placed++; return !!spawnAt(type, s); }
      if (type === 'br_partygoer' && Math.random() < 0.7) return false;   // no Level Fun here (or no fair spot): rarely elsewhere
      if (type === 'br_smiler' && Math.random() < 0.5) return false;
      S.fallback++;
    }
    return protoIndoor.call(this, type);
  };
  if (typeof protoIndoor === 'function') game.hostSpawnCreatureIndoor = wrappedIndoor;

  // moonPopulated: the Backrooms get their locals on landing (charged to the indoor power budget)
  function seedLocals() {
    if (!isHost() || !inBackrooms()) return;
    const fac = game.world.facility;
    const key = `${fac.layout.seed}|${game.run?.daysLeft}|${game.run?.quotaIndex}`;
    if (S.seeded === key) return;
    S.seeded = key;
    const hd = game.hostData || {};
    const charge = (type) => { hd.powerUsed = (hd.powerUsed || 0) + (CREATURES[type]?.power || 0); };
    const D = darkMap(game);
    const count = (type) => { let n = 0; for (const c of game.creatures.host.values()) if (c.type === type && !c.dead) n++; return n; };
    if (D?.lamps.length && !count('br_moth')) { const s = pickSpot('br_moth'); if (s && spawnAt('br_moth', s)) charge('br_moth'); }
    if (D?.darkCells.length && !count('br_smiler')) { const s = pickSpot('br_smiler'); if (s && darkAt(game, V.set(s.x, s.y, s.z)) > 0 && spawnAt('br_smiler', s)) charge('br_smiler'); }
    if (game.brlevels?.levelAt && !count('br_partygoer') && Math.random() < 0.45) { const s = pickSpot('br_partygoer'); if (s && spawnAt('br_partygoer', s)) charge('br_partygoer'); }
  }
  on('moonPopulated', () => { try { seedLocals(); } catch (e) { console.warn('brcreatures seed', e); } });

  // ---------------------------------------------------------------- net
  on('registerHandlers', (H) => {
    H('brstruggle', (d, from) => {
      const c = game.creatures.host.get(d?.c);
      if (!c || c.dead || c.type !== 'br_partygoer' || c.state !== 'hug' || c.extra !== from) return;
      const now = performance.now();
      if (now - (c.data.lastStr || 0) < 60) return;
      c.data.lastStr = now;
      c.data.struggle = (c.data.struggle || 0) + 1;
      S.struggles++;
    });
  });

  // ---------------------------------------------------------------- client: hug, whispers, sightings
  const keyName = () => String(game.settings?.keys?.interact || 'KeyE').replace(/^Key|^Digit/, '');
  function css() {
    if (S.cssDone || typeof document === 'undefined') return;
    S.cssDone = true;
    const st = document.createElement('style');
    st.id = 'tfg-brcreatures-css';
    st.textContent = `
.br-hug{font-family:VT323,monospace;text-align:center;color:#ffe25a;text-shadow:0 0 6px #000,0 0 14px rgba(255,210,40,.55);letter-spacing:2px;font-size:26px;
  padding:4px 14px 8px;background:rgba(20,14,0,.55);border:1px solid rgba(255,220,80,.5);animation:br-hug-shake .12s steps(2) infinite}
.br-hug.ally{font-size:21px;color:#ffd0f0;border-color:rgba(255,120,200,.5);animation:none}
.br-hug .bar{height:8px;margin-top:5px;background:rgba(255,255,255,.12);overflow:hidden}
.br-hug .fill{height:100%;width:0;background:linear-gradient(90deg,#ff4fa8,#ffe23a);transition:width .08s}
@keyframes br-hug-shake{0%{transform:translate(0,0)}50%{transform:translate(1px,-1px)}100%{transform:translate(-1px,1px)}}
.br-cap{font-family:VT323,monospace;color:#f4f0dc;text-shadow:0 0 4px #000,1px 0 rgba(255,0,60,.6),-1px 0 rgba(0,200,255,.6);letter-spacing:2px;
  padding:4px 10px;background:linear-gradient(90deg,rgba(0,0,0,.66),rgba(0,0,0,0));border-left:3px solid #ff3b3b;opacity:0;transition:opacity .4s}
.br-cap.on{opacity:1}
.br-cap .k{font-size:15px;color:#ff5a5a}.br-cap .n{font-size:28px;line-height:1}.br-cap .h{font-size:17px;color:#d8d0b0}
.chat-line.br-whisper{color:#ffe46a;font-style:italic;text-shadow:0 0 6px rgba(255,220,60,.5)}
`;
    document.head.appendChild(st);
  }
  function hugPrompt(text, ally, frac) {
    css();
    if (!S.promptEl || !S.promptEl.isConnected) S.promptEl = hudDock('bottom', 'br-hug', 4);
    const el = S.promptEl;
    const cls = 'br-hug' + (ally ? ' ally' : '');
    if (el.firstChild?.className !== cls || el.dataset.txt !== text) {
      el.dataset.txt = text;
      el.innerHTML = `<div class="${cls}"><span></span>${ally ? '' : '<div class="bar"><div class="fill"></div></div>'}</div>`;
      el.querySelector('span').textContent = text;
    }
    const f = el.querySelector('.fill');
    if (f) f.style.width = Math.round(clamp(frac, 0, 1) * 100) + '%';
    el.style.display = '';
  }
  function hidePrompt() { if (S.promptEl) S.promptEl.style.display = 'none'; }
  const CAP_HINT = {
    br_smiler: 'Keep a light on it. It hates being seen.', br_hound: 'Blind. It hunts by sound. Crouch.',
    br_partygoer: 'It wants a hug. Do not let it reach you.', br_moth: 'They want your light.',
  };
  function caption(type) {
    css();
    if (!S.capEl || !S.capEl.isConnected) S.capEl = hudDock('left', 'br-entity', 6);
    const def = CREATURES[type];
    S.capEl.innerHTML = '<div class="br-cap"><div class="k"></div><div class="n"></div><div class="h"></div></div>';
    const box = S.capEl.firstChild;
    box.querySelector('.k').textContent = '● REC  ' + t('ENTITY SIGHTED');
    box.querySelector('.n').textContent = String(def?.name || type).toUpperCase();
    box.querySelector('.h').textContent = t(CAP_HINT[type] || '');
    requestAnimationFrame?.(() => box.classList.add('on'));
    S.capT = 5.5;
  }
  const WHISPERS = ["YOU'RE INVITED =)", 'THE PARTY IS THIS WAY =)', "DON'T YOU WANT TO STAY? =)", 'WE MADE YOU A CAKE =)', 'EVERYONE IS HERE =)', 'YOU CAN NEVER LEAVE THE PARTY =)'];

  function clientUpdate(dt) {
    const me = game.player;
    if (!me || !game.creatures) return;
    const cam = game.camera.position;
    let hugView = null, allyHug = null;
    let nearParty = null, nearPartyD = 1e9;
    const day = `${game.world?.facility?.layout?.seed ?? ''}|${game.run?.daysLeft ?? ''}|${game.run?.quotaIndex ?? ''}`;
    if (day !== S.dayKey) { S.dayKey = day; S.sighted.clear(); }
    for (const v of game.creatures.views.values()) {
      if (!BR_SET.has(v.type)) continue;
      const prev = S.prevStates.get(v.id);
      if (prev !== v.state) {
        S.prevStates.set(v.id, v.state);
        onViewState(v, prev);
      }
      if (v.state === 'dead') continue;
      const dist = v.pos.distanceTo(me.pos);
      if (v.type === 'br_partygoer') {
        if (v.state === 'hug' && v.extra === game.selfId && !me.dead) hugView = v;
        else if (v.state === 'hug' && typeof v.extra === 'string' && dist < 26) allyHug = v;
        if (dist < nearPartyD && v.state !== 'hug') { nearParty = v; nearPartyD = dist; }
      }
      // first sighting of each entity per day: a found-footage caption with the survival hint
      if (!S.sighted.has(v.type) && dist < 22 && !me.dead && me.indoor) {
        V.set(v.pos.x, v.pos.y + Math.min(1.6, (v.height || 1.5) * 0.7), v.pos.z);
        const fwd = V2.copy(V).sub(cam);
        const dd = fwd.length();
        fwd.divideScalar(dd || 1);
        const look = game.player.forward?.() || null;
        if (look && fwd.dot(look) > 0.55 && game.physics.lineOfSight(cam, V)) { S.sighted.add(v.type); caption(v.type); }
      }
    }
    // hugged: pinned in front of it, the camera is pulled up to the drawn face, mash E
    if (hugView) {
      if (S.hugId !== hugView.id) { S.hugId = hugView.id; S.presses = 0; S.hugT = 0; game.engine.flash?.(0xffd83a, 0.45); }
      S.hugT += dt;
      const yaw = hugView.yaw;
      const anchor = V.set(hugView.pos.x + Math.sin(yaw) * 0.62, me.pos.y, hugView.pos.z + Math.cos(yaw) * 0.62);
      game.heldBy = { pos: anchor.clone(), t: 0.25 };
      const want = Math.atan2(-(hugView.pos.x - me.pos.x), -(hugView.pos.z - me.pos.z));
      me.yaw = dampAngle(me.yaw, want, 2.5, dt);
      me.pitch = me.pitch + (0.55 - me.pitch) * Math.min(1, dt * 1.6);
      game.engine.shake?.(0.08);
      const need = struggleNeed(hugView.level || 1);
      if (game.input?.pressed?.('interact')) {
        S.presses++;
        game.net?.request?.('brstruggle', { c: hugView.id });
        game.engine.shake?.(0.22);
        game.audio?.play?.('cloth_rustle', { volume: 0.5, bus: 'sfx', pitch: 0.9 + Math.random() * 0.3 });
      }
      hugPrompt(tf('MASH [{k}] TO BREAK FREE', { k: keyName() }), false, S.presses / need);
    } else {
      if (S.hugId) {
        if (!me.dead) game.ui?.toast?.(t('You broke free!'), 'good');
        S.hugId = null; S.presses = 0;
      }
      if (allyHug) hugPrompt(tf('HIT THE PARTYGOER TO FREE {name}', { name: String(game.playerName?.(allyHug.extra) || '').toUpperCase() }), true, 0);
      else hidePrompt();
    }
    // Partygoer whispers in chat
    S.whisperT -= dt;
    if (nearParty && nearPartyD < 24 && S.whisperT <= 0 && !me.dead && (nearParty.state === 'wave' || nearParty.state === 'walk' || nearParty.state === 'rush' || nearPartyD < 12)) {
      S.whisperT = 14 + Math.random() * 10;
      const txt = t(WHISPERS[Math.floor(Math.random() * WHISPERS.length)]);
      try { game.ui?.chatMessage?.('=)', txt, false, 'br-whisper'); } catch { /* ignore */ }
      game.audio?.play?.(['whisper_1', 'whisper_2', 'whisper_3'][Math.floor(Math.random() * 3)], { volume: 0.55, bus: 'sfx', pitch: 1.25 });
    }
    if (S.capT > 0) { S.capT -= dt; if (S.capT <= 0 && S.capEl?.firstChild) S.capEl.firstChild.classList.remove('on'); }
    // forget views that are gone
    if (S.prevStates.size > 64) for (const id of [...S.prevStates.keys()]) if (!game.creatures.views.has(id)) S.prevStates.delete(id);
  }
  function onViewState(v, prev) {
    const me = game.player;
    const near = v.pos.distanceTo(me.pos);
    if (v.type === 'br_smiler' && v.state === 'lunge' && near < 5) { game.engine.flash?.(0xfff8e0, 0.25); game.engine.shake?.(0.25); }
    if (v.type === 'br_hound' && v.state === 'hunt' && near < 18) game.engine.shake?.(0.08);
    if (v.type === 'br_partygoer' && v.state === 'dead' && near < 20) game.particles?.burst?.(v.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), 'sparks', null, 0.8);
    void prev;
  }

  on('update', (dt) => {
    if (S.disposed) return;
    try { clientUpdate(dt); } catch (e) { if (!S.warned) { S.warned = true; console.warn('brcreatures', e); } }
  });
  on('phase', (ph) => { if (ph !== 'moon') { hidePrompt(); S.hugId = null; } });
  on('mapLoaded', () => { DARK.fac = null; });

  // ---------------------------------------------------------------- API
  const api = {
    TYPES: BR_TYPES,
    TUNE,
    /** host: spawn a Backrooms entity at pos (or at a fitting spot when pos is omitted) */
    spawn(type, pos, opts = {}) {
      if (!isHost() || !BR_SET.has(type)) return null;
      const p = pos || pickSpot(type);
      if (!p) return null;
      return spawnAt(type, { x: p.x, y: p.y ?? game.world?.facility?.layout?.y ?? 0, z: p.z }, opts);
    },
    darkAt: (pos) => darkAt(game, pos),
    pickSpot,
    hugged: () => !!S.hugId,
    get stats() { return { spawned: { ...S.spawned }, placed: S.placed, fallback: S.fallback, struggles: S.struggles, dark: DARK.darkCells.length, flick: DARK.flick.length, seeded: S.seeded }; },
    dispose() {
      if (S.disposed) return;
      S.disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      offs.length = 0;
      if (game.hostSpawnCreatureIndoor === wrappedIndoor) delete game.hostSpawnCreatureIndoor;
      try { S.promptEl?.remove(); S.capEl?.remove(); } catch { /* ignore */ }
      if (BR_ENV.lit) BR_ENV.lit = null;
      if (gateGame === game) gateGame = null;
      DARK.fac = null;
    },
  };
  return api;
}
