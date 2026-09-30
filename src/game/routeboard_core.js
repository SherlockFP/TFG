// ROUTE BOARD core (wave 8, docs/wave8/routeboard.md): PURE rules, no DOM / THREE / game imports (node-tested by tools/harness/routeboard.test.mjs).
//   ladder   a fresh campaign starts with 3 HERO moons; more routes open as quotas are met (+2 per quota, the hubgate ladder's rhythm).
//            Veterans ('all' ladder), Settings > Unlock everything and Quick Shift see every route. Instance / voyage / homeworld / HQ moons are
//            ruled by their own systems (cycle, voyage, onboard) and never by this ladder.
//   cards    the 3 route cards of the day: current route first, then the routes that just opened, then a seeded daily order.
//   numbers  scrap-on-site payout range, danger pips; hooks (one line per moon, EN / TR / RU) and the interior silhouettes for the card art.
import { RNG, hashString } from '../core/rng.js';
import { camCount } from './feedcams_core.js';

/** the campaign's first three routes (docs/wave8/routeboard.md "why these three"):
 *  hamsi  56K-Dialup     tier 1 hills + Data Center factory: outdoor + indoor basics, free, the Hiring Day moon
 *  levrek 88-Chatroom    desert + ghost-train METRO: the most distinct interior (a train owns the main tunnel)
 *  m5est  E9-Estate      the influencer MANSION: the game's own theme (content, trending loot that grows while carried) */
export const HERO = Object.freeze(['hamsi', 'levrek', 'm5est']);
/** q = quotas met before the route opens */
export const LADDER = Object.freeze([
  { q: 0, ids: HERO },
  { q: 1, ids: ['lufer', 'palamut'] },
  { q: 2, ids: ['w2sun', 'cipura'] },
  { q: 3, ids: ['w2sov', 'm5cold'] },
  { q: 4, ids: ['orkinos', 'br_level0'] },
]);
/** generated sector servers (the UNCHARTED list / SECTOR map) open with the quota-3 rewards */
export const SECTOR_Q = 3;
/** anything else (mod moons, late content) waits for the Deep Feed */
export const LATE_Q = 5;
export const CARDS = 3;

const LADDER_Q = {};
for (const step of LADDER) for (const id of step.ids) LADDER_Q[id] = step.q;

/** moons this ladder never touches (their own module decides) */
export const exempt = (m) => !m || !!(m.company || m.home || m.instance || m.voyage || m.core || m.gate || m.raid);
/** quotas needed before `m` can be routed to (0 = open from the start) */
export function routeQ(m) {
  if (exempt(m)) return 0;
  if (LADDER_Q[m.id] !== undefined) return LADDER_Q[m.id];
  if (m.generated) return SECTOR_Q;
  return LATE_Q;
}
/** hub = { all: bool, q: quotas met } (null = everything open) */
export function routeOpen(m, hub) {
  if (!m) return false;
  if (!hub || hub.all) return true;
  return (hub.q | 0) >= routeQ(m);
}
/** a card-worthy route: a real, reachable, handcrafted / registered moon (no HQ, no generated server, no instance) */
export const cardable = (m) => !!m && !exempt(m) && !m.generated && !m.stale;

/** the cards of the day: [moon, ...] (max CARDS). moons = every moon in MOON_ORDER order; run = { moon, seed, day } */
export function pickCards(moons, hub, run = {}) {
  const open = moons.filter((m) => cardable(m) && routeOpen(m, hub));
  const out = [];
  const cur = open.find((m) => m.id === run.moon);
  if (cur) out.push(cur);
  const q = hub && !hub.all ? hub.q | 0 : -1;
  if (q > 0) for (const m of open) if (!out.includes(m) && routeQ(m) === q) out.push(m);   // just opened
  if (q === 0 || q < 0) for (const id of HERO) { const m = open.find((x) => x.id === id); if (m && !out.includes(m)) out.push(m); }   // start: the heroes, in their order
  const rest = open.filter((m) => !out.includes(m));
  const rng = new RNG(hashString('routes:' + (run.seed ?? 0) + ':' + (run.day | 0)));
  out.push(...rng.shuffle(rest));
  return out.slice(0, CARDS);
}
/** ids that open exactly at quota q (the "NEW ROUTE" toast) */
export function openedAt(moons, q) { return moons.filter((m) => cardable(m) && routeQ(m) === q && q > 0).map((m) => m.id); }
/** the ladder step after q: { q, ids } or null */
export const nextStep = (q) => LADDER.find((s) => s.q > (q | 0)) || null;

/** scrap-on-site payout range [lo, hi] (rounded to 10). countFor(base, q) / valueMul(q) come from progression.js; avg = [lo, hi] mean item value */
export function payout(m, q, avg, countFor = (b) => b, valueMul = () => 1) {
  const sc = Array.isArray(m?.scrapCount) ? m.scrapCount : [10, 14];
  const mul = (m?.scrapMul || 1) * valueMul(q | 0);
  const r10 = (v) => Math.max(0, Math.round(v / 10) * 10);
  return [r10(countFor(sc[0], q) * avg[0] * mul), r10(countFor(sc[1], q) * avg[1] * mul)];
}
/** weighted mean [lo, hi] item value of a scrap table [[id, w], ...]; valueOf(id) -> [lo, hi] */
export function tableAvg(table, valueOf) {
  let w = 0, lo = 0, hi = 0;
  for (const [id, wt] of table || []) { const v = valueOf(id); if (!Array.isArray(v)) continue; w += wt; lo += v[0] * wt; hi += v[1] * wt; }
  return w ? [lo / w, hi / w] : [20, 40];
}
/** [camloot] how many Algorithm cameras the route's facility will carry on this day / quota (the card's CAMS row); most of them watch the loot rooms */
export const camsOf = (m, day, q) => (!m || exempt(m) ? 0 : camCount(m.size, day, q));
export const pips = (n, max = 5) => Array.from({ length: max }, (_, i) => i < (n | 0));

/** the moon's hook: one line, what makes this route different (EN, TR, RU). Unknown moons fall back to the first sentence of their desc. */
export const HOOKS = {
  hamsi: ['A dead web host in the hills. Short walks, loud machines, easy scrap.', 'Tepelerde ölü bir web sunucusu. Kısa yürüyüş, gürültülü makineler, kolay hurda.', 'Мёртвый веб-хостинг в холмах. Короткие переходы, шумные машины, лёгкий хлам.'],
  levrek: ['A ghost train owns the main tunnel. It keeps its schedule. Keep yours.', 'Ana tünel bir hayalet trenin. O tarifesine uyar. Sen de kendininkine uy.', 'Главный тоннель принадлежит поезду-призраку. Он держит расписание. Держи и ты своё.'],
  m5est: ['The influencer uploaded himself. The ring lights are still on, and the loot trends while you carry it.', 'Fenomen kendini sunucuya yükledi. Halka ışıklar hâlâ açık ve ganimet taşıdıkça trend oluyor.', 'Инфлюенсер загрузил себя в сеть. Кольцевые лампы всё ещё горят, а добыча набирает тренд, пока ты её несёшь.'],
  lufer: ['Vines choke the greenhouse. Cut them: the good scrap is behind.', 'Sarmaşıklar serayı boğuyor. Kes onları: iyi hurda arkada.', 'Лозы душат оранжерею. Режь их: хороший хлам за ними.'],
  palamut: ['A frozen academy. The library rearranges itself and detention is real.', 'Donmuş bir akademi. Kütüphane kendini yeniden diziyor, ceza odası gerçek.', 'Замёрзшая академия. Библиотека сама себя переставляет, а карцер настоящий.'],
  w2sun: ['Two suns, one mineshaft, no shade.', 'İki güneş, bir maden, hiç gölge yok.', 'Два солнца, одна шахта, никакой тени.'],
  cipura: ['A prison of banned accounts. When the alarm sounds, the cell doors slam.', 'Banlı hesapların hapishanesi. Alarm çalınca hücre kapıları çarpar.', 'Тюрьма забаненных аккаунтов. По тревоге двери камер захлопываются.'],
  w2sov: ['Panel blocks in the snow. Every floor is the same floor. Almost.', 'Karda panel bloklar. Her kat aynı kat. Neredeyse.', 'Панельки в снегу. Каждый этаж тот же самый. Почти.'],
  m5cold: ['Frozen drives thaw in your hands. Keep moving.', 'Donmuş diskler elinde çözülür. Durma.', 'Замороженные диски тают в руках. Не останавливайся.'],
  orkinos: ['The museum frames what the internet deleted. Do not bump the art.', 'Müze internetin sildiklerini çerçeveliyor. Sanata çarpma.', 'Музей вставляет в рамы всё, что удалил интернет. Не задень экспонаты.'],
  br_level0: ['The yellow rooms go on. So does the hum.', 'Sarı odalar bitmiyor. Uğultu da.', 'Жёлтые комнаты не кончаются. Гул тоже.'],
};
export function hookOf(m) {
  if (HOOKS[m?.id]) return HOOKS[m.id][0];
  const d = String(m?.desc || '');
  const s = d.split(/(?<=\.)\s/)[0] || d;
  return s.length > 110 ? s.slice(0, 107).trimEnd() + '...' : s;
}

/** card art: interior silhouette (viewBox 0 0 120 40, fill-rule evenodd) drawn over the biome palette bands */
export const SILHOUETTE = {
  factory: 'M0 40V26h10V12h5v14h6V8h5v18h8l9-6v6l9-6v6l9-6v6l9-6v6h9V18h5v8h11v14z',
  metro: 'M0 40V21A60 21 0 0 1 120 21V40H106V27A46 17 0 0 0 14 27V40z M42 40V23q18-5 36 0v17z M47 27h10v6H47z M63 27h10v6H63z',
  influencer: 'M6 40V23L38 9l32 14v17z M30 40V30h16v10z M16 27h8v5h-8z M52 27h8v5h-8z M88 6a9 9 0 1 0 .01 0z M88 10a5 5 0 1 0 .01 0z M87 24h2v16h-2z M80 40l7-4h2l7 4z',
  academy: 'M6 40V24h40v16z M46 40V11l12-9 12 9v29z M70 40V24h44v16z M54 16h8v8h-8z M12 29h6v5h-6z M24 29h6v5h-6z M78 29h6v5h-6z M92 29h6v5h-6z',
  museum: 'M8 18L60 4l52 14z M12 20h96v4H12z M16 24h7v13h-7z M33 24h7v13h-7z M50 24h7v13h-7z M67 24h7v13h-7z M84 24h7v13h-7z M98 24h7v13h-7z M6 37h108v3H6z',
  greenhouse: 'M8 40V27A52 20 0 0 1 112 27V40z M26 40V24h4v16z M58 40V17h4v23z M90 40V24h4v16z',
  prison: 'M0 40V24h86V40z M90 40V10h14v30z M86 10h22V6H86z M8 28h3v12H8z M16 28h3v12h-3z M24 28h3v12h-3z M32 28h3v12h-3z M40 28h3v12h-3z',
  tower: 'M4 40V14h34v26z M44 40V6h32v34z M82 40V18h34v22z M9 19h6v4H9z M22 19h6v4h-6z M50 11h6v4h-6z M63 11h6v4h-6z M50 22h6v4h-6z M63 22h6v4h-6z M88 23h6v4h-6z M102 23h6v4h-6z',
  mineshaft: 'M20 40L40 4h6l20 36h-7L43 10 27 40z M43 12a8 8 0 1 0 .01 0z M70 40V28h40v12z',
  backrooms: 'M0 40V14h120v26z M14 40V22h14v18z M52 40V22h16v18z M92 40V22h14v18z',
  colddata: 'M8 40V12h16v28z M30 40V12h16v28z M52 40V12h16v28z M11 16h10v2H11z M33 16h10v2H33z M55 16h10v2H55z M92 10v24 M82 16l20 12 M82 28l20-12 M90 8h4v28h-4z',
  mansion: 'M10 40V22L40 8l30 14v18z M76 40V16l10-6 10 6v24z M104 40V26h10v14z',
  office: 'M10 40V6h40v34z M56 40V16h30v24z M92 40V24h22v16z',
  sewer: 'M0 40V22h120v18z M40 40V30a20 10 0 0 1 40 0v10z',
  hospital: 'M10 40V14h70v26z M86 40V24h24v16z M40 18h10v4h4v8h-4v4H40v-4h-4v-8h4z',
  serverfarm: 'M10 40V10h20v30z M36 40V10h20v30z M62 40V10h20v30z M88 40V10h20v30z',
  generic: 'M0 40V28h20V18h14v10h16V12h18v16h14V22h18v6h20v12z',
};
export const silhouetteOf = (interior) => SILHOUETTE[interior] || SILHOUETTE.generic;
/** '#rrggbb' from a 0xRRGGBB int (or a fallback) */
export const hex = (n, fb = '#3a3a3a') => (Number.isFinite(n) ? '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6) : fb);
/** darken a 0xRRGGBB int by k (0..1) */
export function shade(n, k) {
  if (!Number.isFinite(n)) return n;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 - k))));
  return (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
}
/** palette bands of a biome: [sky, fog, ground] css colours */
export function bands(b) {
  if (!b) return ['#2a2f36', '#3a4048', '#16181b'];
  const ground = Number.isFinite(b.tint) ? shade(b.tint, 0.55) : shade(b.fog, 0.62);
  return [hex(b.sky), hex(b.fog), hex(ground)];
}
