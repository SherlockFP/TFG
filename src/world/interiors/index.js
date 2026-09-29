// Interior theme registry. facility.js generates/builds every theme listed here; everything else in the
// game (moons, terminal, footsteps, ambience, fog) looks themes up through this module.
//
//   INTERIOR_THEMES            ordered list of every interior theme id
//   INTERIORS[id]              theme definition (see below) - also exported as THEMES_BY_ID
//   INTERIOR_NAMES[id]         display name (docs/THEME.md style)
//   isInteriorTheme(id)        true for a registered id
//   getInterior(id)            definition, falls back to 'factory' for unknown ids
//   interiorFootstep(fac, p)   footstep surface ('concrete' | 'wood' | 'metal' | 'mud' | 'grass' ...) or null
//   interiorAmbience(theme)    { base, vol, buzz, buzzVol, env } indoor ambience layers (null for the 3 legacy themes)
//   interiorAtmosphere(theme)  { fog, density } indoor fog (colour + exp2 density) or null (black default)
//
// A theme definition (new themes live in ./office.js, ./backrooms.js, ./serverfarm.js, ./sewer.js,
// ./hospital.js; factory / mansion / mineshaft keep their data in facility.js / mineshaft.js):
//   { id, name, blurb,
//     style: { corridor: {floor, wall, ceil, base}, rooms: { [type]: roomStyle } },   (same shape as facility THEMES)
//     roomTypes: [[type, weight, big?]...], roomHeight(type, rng),
//     layout: { plan: 'rooms'|'wings'|'open', doorP, blastP, loops, bigChance, corridorH, hub:{type,w,h}, hubAlways,
//               lockedP, roomMul, shape(rng, big) -> [w, h] },
//     lamps: { corridor: propId, every, color, flicker }, lampColor, posters, landmarks, doorProp,
//     corridorPipes, corridorScrap, footstep: {floorTex: surface}, ambience, atmosphere, steamRooms, noFlood,
//     decorate(ctx) }
import { OFFICE } from './office.js';
import { BACKROOMS } from './backrooms.js';
import { SERVERFARM } from './serverfarm.js';
import { SEWER } from './sewer.js';
import { HOSPITAL } from './hospital.js';
import { STUDIO_THEMES } from './themes_studio.js';   // [repomaps] wave 8: influencer / academy / colddata / museum
import { METRO, GREENHOUSE } from './lab_themes.js';   // [labyrinths]
import { PRISON, TOWER } from './lab_vertical.js';   // [labyrinths]
import { themeAmbience } from '../../audio/extassets.js';
import { addTranslations } from '../../core/i18n.js';

// factory / mansion / mineshaft: room data lives in facility.js / mineshaft.js, sound + footsteps in game.js
const LEGACY = {
  factory: { id: 'factory', name: 'Data Center', blurb: 'Concrete, pipes and humming racks. The classic.', layout: { hub: { type: 'storage', w: 5, h: 5 } } },
  mansion: { id: 'mansion', name: 'Haunted Homepage', blurb: 'Wallpaper, chandeliers and guestbook entries from the dead.', layout: { hub: { type: 'hall', w: 5, h: 4 } } },
  mineshaft: { id: 'mineshaft', name: 'Deep Web Mine', blurb: 'Timbered tunnels dug straight into the deep web.', layout: { hub: { type: 'cavern', w: 5, h: 5 } } },
};

export const INTERIORS = {
  ...LEGACY,
  office: OFFICE,
  backrooms: BACKROOMS,
  serverfarm: SERVERFARM,
  sewer: SEWER,
  hospital: HOSPITAL,
  ...STUDIO_THEMES,   // [repomaps]
  metro: METRO, greenhouse: GREENHOUSE, prison: PRISON, tower: TOWER,   // [labyrinths]
};
export const THEMES_BY_ID = INTERIORS;
export const INTERIOR_THEMES = Object.freeze(Object.keys(INTERIORS));
export const NEW_INTERIOR_THEMES = Object.freeze(['office', 'backrooms', 'serverfarm', 'sewer', 'hospital']);
export const INTERIOR_NAMES = Object.freeze(Object.fromEntries(Object.values(INTERIORS).map((t) => [t.id, t.name])));

// Turkish strings for the interior names / blurbs and the hazard prompts (core/i18n.js runtime registry)
addTranslations({
  'Data Center': 'Veri Merkezi', 'Haunted Homepage': 'Perili Ana Sayfa', 'Deep Web Mine': 'Derin Web Madeni',
  'Corporate Intranet': 'Kurumsal İntranet', 'The Backrooms': 'Arka Odalar', 'Cloud Storage': 'Bulut Depolama',
  'The Comment Sewer': 'Yorum Kanalizasyonu', 'Telehealth Clinic': 'Tele-Sağlık Kliniği',
  'Concrete, pipes and humming racks. The classic.': 'Beton, borular ve uğuldayan kabinler. Klasik.',
  'Wallpaper, chandeliers and guestbook entries from the dead.': 'Duvar kağıtları, avizeler ve ölülerin ziyaretçi defteri kayıtları.',
  'Timbered tunnels dug straight into the deep web.': 'Doğrudan derin webe kazılmış ahşap destekli tüneller.',
  'Cubicle farms and dead elevators. The quarterly review never ended.': 'Bölme ofis tarlaları ve ölü asansörler. Çeyrek dönem toplantısı hiç bitmedi.',
  'You noclipped out of the internet. Mono-yellow, damp carpet, 600 million square miles.': 'İnternetin dışına noclip yaptın. Tek renk sarı, nemli halı, 600 milyon mil kare.',
  'Rack after rack of rotting data, cooled to 18 degrees. The fans never stop.': 'Sıra sıra çürüyen veri, 18 dereceye soğutulmuş. Fanlar hiç durmaz.',
  'Where every deleted comment drains to. Mind the sludge.': 'Silinen her yorumun aktığı yer. Çamura dikkat.',
  'Symptoms searched: all of them. The doctor will see you now.': 'Aranan belirtiler: hepsi. Doktor sizi şimdi görecek.',
  'The Packet Subway': 'Paket Metrosu', 'Link Rot Greenhouse': 'Bağlantı Çürümesi Serası', 'Banhammer Penitentiary': 'Ban Çekici Cezaevi', 'The Ivory Tower': 'Fildişi Kule',   // [labyrinths]
  'Ghost trains still run the old routes. When the horn sounds, get into an alcove.': 'Hayalet trenler eski hatlarda hâlâ koşuyor. Korna çalınca bir girintiye gir.',
  'Hydroponics gone feral. Cut the vines for shortcuts, hold your breath in the spores.': 'Vahşileşmiş hidroponik. Kısayol için sarmaşığı kes, sporlarda nefesini tut.',
  'Every banned account ends up here. When the alarm sounds, the cell doors slam shut.': 'Yasaklanan her hesap buraya düşer. Alarm çalınca hücre kapıları çarparak kapanır.',
  'A corporate skyscraper with a hole in the middle. Ride the elevator down: the lower the floor, the richer the loot.': 'Ortasında delik olan bir şirket gökdeleni. Asansörle in: kat ne kadar aşağıdaysa ganimet o kadar zengin.',
  'Cut the laser grid power [E]': 'Lazer ızgarasının gücünü kes [E]',
  'Laser grid (offline)': 'Lazer ızgarası (kapalı)',
  'Rebooting in': 'Yeniden başlatma:',
  'Security override - 90 seconds': 'Güvenlik atlatma - 90 saniye',
  'Reset the breaker [E]': 'Sigortayı sıfırla [E]',
  'Restores the lights in this room': 'Bu odanın ışıklarını geri getirir',
  'Crawl through the vent [E]': 'Havalandırmadan sürün [E]',
  'Shortcut to:': 'Kısayol:',
  'walked into a laser grid.': 'lazer ızgarasına yürüdü.',
  'was buried by a cave-in.': 'göçük altında kaldı.',
  'dissolved in toxic sludge.': 'zehirli çamurda eridi.',
});

export function isInteriorTheme(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(INTERIORS, id); }
export function getInterior(id) { return isInteriorTheme(id) ? INTERIORS[id] : INTERIORS.factory; }

/** Footstep surface for a facility position from the floor texture under it; null = keep the default. */
export function interiorFootstep(fac, pos) {
  const L = fac?.layout;
  if (!L || !pos) return null;
  const def = INTERIORS[L.theme];
  if (!def?.style) return null;
  const i = fac.cellAt ? fac.cellAt(pos.x, pos.z) : -1;
  if (i < 0) return null;
  const r = L.roomOf[i];
  const floor = r >= 0 ? (def.style.rooms[L.rooms[r]?.type]?.floor || def.style.corridor.floor) : def.style.corridor.floor;
  return def.footstep?.[floor] || (floor.startsWith('wood') ? 'wood' : floor.startsWith('metal') ? 'metal' : 'concrete');
}

/** Ambience layers for the new themes; null for factory / mansion / mineshaft (game.js keeps their mix). */
const _ambCache = new Map();
export function interiorAmbience(theme) {
  const d = INTERIORS[theme];
  const amb = d?.style ? d.ambience : null;   // null for factory / mansion / mineshaft (game.js keeps their mix)
  const ext = amb ? themeAmbience(theme) : null;   // 'ambience_office' / '_backrooms' / '_serverfarm' / '_sewer' / '_hospital' when shipped + loaded
  if (!ext || amb.base === ext) return amb;
  const key = theme + '|' + ext;
  if (!_ambCache.has(key)) _ambCache.set(key, { ...amb, base: ext });
  return _ambCache.get(key);
}
export function interiorAtmosphere(theme) { return getInterior(theme).atmosphere || null; }
