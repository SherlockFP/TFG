// iconatlas.js - GENERATED fallback icons + the icon audit (wave 2, player trading).
// icons.js renders the real 3D model of an item into a 64x64 thumbnail. When there is NO model (an item registered without one),
// when the render fails / comes out empty (a GLB that has not loaded yet), or when WebGL is unavailable, icons.js asks this file
// for a glyph icon instead, so no item is ever blank:  a tier-coloured pictogram chosen by kind / flags (blade, pistol, vial,
// chip, gear, vest, gem, bag, book, note, bomb, kit, shard, fish, claw, vase, key, skull, ammo, crate, coin, lamp), an accent colour
// hashed from the item id and a two-letter tag from its name, so two items of one kind still look different.
//   glyphSpec(def, tier)        pure description (node-testable): { shape, color, accent, tag }
//   fallbackIconURL(type, ...)  data URL of the glyph icon (cached), '' without a DOM
//   auditItems(items, probe)    pure report over the item table: which items have no model / a blank or glyph-only icon
import { TIERS, tierOfItem } from '../game/tiers.js';

export const GLYPH_SHAPES = Object.freeze(['blade', 'gun', 'wrench', 'vial', 'chip', 'gear', 'vest', 'gem', 'bag', 'book', 'note', 'bomb', 'kit', 'shard',
  'fish', 'claw', 'vase', 'key', 'skull', 'ammo', 'crate', 'coin', 'lamp']);
const SCRAP_SHAPES = ['gear', 'crate', 'coin', 'lamp', 'gem'];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const RX = {
  bomb: /grenade|bomb|nade|mine|dynamite|molotov|spambomb/i,
  book: /^skillbook|book|manual|tome|grimoire|codex/i,
  note: /guitar|keytar|drum|piano|synth|ocarina|violin|banjo|flute|harmonica|kazoo|instrument/i,
  ammo: /ammo|shell|bullet|round|cartridge|^mag|_mag$|clip/i,
  kit: /^kit_|_kit$|turret|tesla|barricade|sensor|drone|dome|relay|generator|battery bank|floodlight/i,
  shard: /^shard_|shard|crystal|ecto|fragment/i,
  chip: /chip|circuit|core|cpu|gpu|board|module|wire|cable|sensor|component|drive|disk|ram/i,
  key: /key|lockpick|pick$|keycard/i,
};

/** Pure pictogram choice for an item definition. */
export function glyphSpec(def, tier) {
  const id = String(def?.id || 'unknown'), kind = def?.kind || 'scrap';
  const h = hash(id);
  let shape;
  if (kind === 'body' || id === 'body') shape = 'skull';
  else if (def?.grenade || def?.throwable || RX.bomb.test(id)) shape = 'bomb';
  else if (kind === 'skillbook' || def?.spell || RX.book.test(id)) shape = 'book';
  else if (def?.instrument || RX.note.test(id)) shape = 'note';
  else if (kind === 'weapon') shape = def?.ranged ? 'gun' : 'blade';
  else if (kind === 'armor') shape = 'vest';
  else if (kind === 'trinket') shape = 'gem';
  else if (kind === 'bag') shape = 'bag';
  else if (kind === 'fish') shape = 'fish';
  else if (kind === 'drop') shape = 'claw';
  else if (kind === 'big') shape = 'vase';
  else if (RX.ammo.test(id)) shape = 'ammo';
  else if (def?.deploy || RX.kit.test(id)) shape = 'kit';
  else if (RX.key.test(id)) shape = 'key';
  else if (kind === 'component' || def?.component || def?.forge) shape = RX.shard.test(id) && !/core|chip|circuit/.test(id) ? 'shard' : 'chip';
  else if (kind === 'consumable') shape = 'vial';
  else if (kind === 'tool') shape = 'wrench';
  else if (def?.cursed) shape = 'skull';
  else shape = SCRAP_SHAPES[h % SCRAP_SHAPES.length];
  const t = TIERS[tier] ? tier : tierOfItem(null, def || {});
  const words = String(def?.$name || def?.name || id).replace(/[^A-Za-z0-9 _-]/g, '').split(/[ _-]+/).filter(Boolean);
  const tag = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || id).slice(0, 2)).toUpperCase();
  return { shape, tier: t, color: TIERS[t].color, accent: `hsl(${h % 360} 58% 64%)`, dark: `hsl(${h % 360} 40% 22%)`, tag };
}

// ------------------------------------------------------------------ drawing (64x64 canvas, 2px outline like the model icons)
const OUT = 'rgba(10,5,2,0.95)';
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
/** fill + outline + a lighter top edge */
function shape(c, path, fill, hi) {
  path(); c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = OUT; c.stroke();
  c.fillStyle = fill; c.fill();
  if (hi) { c.save(); path(); c.clip(); c.fillStyle = hi; c.globalAlpha = 0.28; c.fillRect(0, 0, 64, 30); c.restore(); }
}

const DRAW = {
  blade: (c, s) => {
    shape(c, () => poly(c, [[44, 8], [52, 10], [54, 18], [22, 44], [16, 38]]), '#d6dbe0', '#fff');
    shape(c, () => poly(c, [[14, 36], [26, 48], [22, 52], [10, 40]]), s.color);
    shape(c, () => poly(c, [[16, 46], [22, 52], [12, 60], [6, 54]]), s.accent);
  },
  gun: (c, s) => {
    shape(c, () => rrect(c, 8, 18, 46, 13, 3), '#8b939c', '#fff');
    shape(c, () => poly(c, [[14, 30], [30, 30], [26, 52], [14, 52]]), s.accent);
    shape(c, () => rrect(c, 44, 20, 14, 8, 2), s.color);
    shape(c, () => rrect(c, 30, 30, 8, 8, 2), '#3a3f45');
  },
  wrench: (c, s) => {
    shape(c, () => poly(c, [[16, 52], [22, 58], [46, 30], [40, 24]]), '#b8c0c8', '#fff');
    shape(c, () => circ(c, 44, 20, 13), s.color);
    c.fillStyle = 'rgba(10,5,2,0.9)'; poly(c, [[44, 20], [58, 10], [58, 22]]); c.fill();
    shape(c, () => circ(c, 22, 52, 5), s.accent);
  },
  vial: (c, s) => {
    shape(c, () => poly(c, [[26, 8], [38, 8], [38, 22], [50, 46], [50, 54], [14, 54], [14, 46], [26, 22]]), '#cfe8f0', '#fff');
    c.save(); poly(c, [[26, 8], [38, 8], [38, 22], [50, 46], [50, 54], [14, 54], [14, 46], [26, 22]]); c.clip(); c.fillStyle = s.accent; c.fillRect(0, 38, 64, 30); c.restore();
    shape(c, () => rrect(c, 24, 4, 16, 7, 2), s.color);
  },
  chip: (c, s) => {
    c.fillStyle = OUT; for (let i = 0; i < 4; i++) { c.fillRect(14 + i * 9, 6, 5, 9); c.fillRect(14 + i * 9, 49, 5, 9); c.fillRect(6, 14 + i * 9, 9, 5); c.fillRect(49, 14 + i * 9, 9, 5); }
    c.fillStyle = '#c9b45a'; for (let i = 0; i < 4; i++) { c.fillRect(15 + i * 9, 7, 3, 8); c.fillRect(15 + i * 9, 50, 3, 8); c.fillRect(7, 15 + i * 9, 8, 3); c.fillRect(50, 15 + i * 9, 8, 3); }
    shape(c, () => rrect(c, 14, 14, 36, 36, 4), s.dark, s.color);
    shape(c, () => rrect(c, 22, 22, 20, 20, 2), s.color);
  },
  gear: (c, s) => {
    shape(c, () => { c.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 20 : 27; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } c.closePath(); }, s.accent, '#fff');
    shape(c, () => circ(c, 32, 32, 10), s.dark);
    shape(c, () => circ(c, 32, 32, 4), s.color);
  },
  vest: (c, s) => {
    shape(c, () => poly(c, [[20, 8], [28, 12], [36, 12], [44, 8], [58, 16], [52, 28], [46, 26], [46, 56], [18, 56], [18, 26], [12, 28], [6, 16]]), s.accent, '#fff');
    shape(c, () => rrect(c, 22, 30, 20, 8, 2), s.color); shape(c, () => rrect(c, 22, 42, 20, 8, 2), s.color);
  },
  gem: (c, s) => {
    shape(c, () => poly(c, [[18, 10], [46, 10], [58, 26], [32, 58], [6, 26]]), s.color, '#fff');
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, 26); c.lineTo(58, 26); c.moveTo(18, 10); c.lineTo(26, 26); c.lineTo(32, 58); c.moveTo(46, 10); c.lineTo(38, 26); c.lineTo(32, 58); c.stroke();
  },
  bag: (c, s) => {
    shape(c, () => rrect(c, 12, 20, 40, 38, 8), s.accent, '#fff');
    shape(c, () => poly(c, [[12, 28], [52, 28], [52, 36], [32, 44], [12, 36]]), s.color);
    shape(c, () => rrect(c, 24, 6, 16, 16, 7), 'rgba(0,0,0,0)');
    shape(c, () => rrect(c, 27, 34, 10, 10, 2), '#d6c27a');
  },
  book: (c, s) => {
    shape(c, () => rrect(c, 12, 8, 40, 48, 3), s.color, '#fff');
    shape(c, () => rrect(c, 12, 8, 8, 48, 2), s.dark);
    c.fillStyle = s.accent; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 4 : 9; c.lineTo(37 + Math.cos(a) * r, 30 + Math.sin(a) * r); } c.closePath(); c.fill();
  },
  note: (c, s) => {
    shape(c, () => circ(c, 22, 46, 9), s.accent);
    shape(c, () => rrect(c, 28, 8, 6, 40, 2), '#ddd');
    shape(c, () => poly(c, [[32, 8], [50, 16], [50, 26], [32, 20]]), s.color);
  },
  bomb: (c, s) => {
    shape(c, () => circ(c, 30, 38, 19), '#4a4f57', '#fff');
    shape(c, () => rrect(c, 24, 12, 14, 10, 2), s.color);
    c.strokeStyle = OUT; c.lineWidth = 5; c.beginPath(); c.moveTo(38, 14); c.quadraticCurveTo(46, 8, 52, 12); c.stroke();
    c.strokeStyle = '#d6b36a'; c.lineWidth = 2; c.stroke();
    c.fillStyle = s.accent; c.beginPath(); c.arc(53, 11, 4, 0, 7); c.fill();
  },
  kit: (c, s) => {
    shape(c, () => rrect(c, 8, 40, 48, 16, 3), '#59616b', '#fff');
    shape(c, () => rrect(c, 22, 22, 20, 20, 3), s.color);
    shape(c, () => rrect(c, 40, 24, 20, 6, 2), s.accent);
    shape(c, () => rrect(c, 30, 8, 4, 16, 1), '#b8c0c8'); shape(c, () => circ(c, 32, 8, 4), s.accent);
  },
  shard: (c, s) => {
    shape(c, () => poly(c, [[32, 4], [46, 20], [40, 56], [32, 60], [24, 56], [18, 20]]), s.color, '#fff');
    c.fillStyle = 'rgba(255,255,255,0.45)'; poly(c, [[32, 8], [38, 22], [32, 56], [28, 22]]); c.fill();
  },
  fish: (c, s) => {
    shape(c, () => poly(c, [[44, 32], [60, 16], [60, 48]]), s.accent);
    shape(c, () => { c.beginPath(); c.ellipse(28, 32, 24, 14, 0, 0, Math.PI * 2); }, s.color, '#fff');
    c.fillStyle = '#fff'; c.beginPath(); c.arc(16, 28, 3.5, 0, 7); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(15, 28, 1.6, 0, 7); c.fill();
  },
  claw: (c, s) => {
    for (let i = 0; i < 3; i++) shape(c, () => poly(c, [[14 + i * 15, 8], [26 + i * 15, 8], [30 + i * 12, 54], [18 + i * 10, 58]]), i === 1 ? s.color : s.accent, '#fff');
  },
  vase: (c, s) => {
    shape(c, () => poly(c, [[24, 6], [40, 6], [38, 16], [50, 30], [44, 52], [38, 58], [26, 58], [20, 52], [14, 30], [26, 16]]), s.accent, '#fff');
    shape(c, () => rrect(c, 20, 30, 24, 8, 2), s.color);
  },
  key: (c, s) => {
    shape(c, () => circ(c, 20, 22, 13), s.color, '#fff');
    shape(c, () => circ(c, 20, 22, 5), 'rgba(0,0,0,0.8)');
    shape(c, () => poly(c, [[28, 30], [34, 24], [58, 48], [52, 54]]), s.accent);
    shape(c, () => rrect(c, 44, 46, 8, 12, 1), s.accent);
  },
  skull: (c, s) => {
    shape(c, () => rrect(c, 10, 8, 44, 34, 16), '#e6e2d6', '#fff');
    shape(c, () => rrect(c, 20, 38, 24, 16, 3), '#d6d2c4');
    c.fillStyle = '#120806'; circ(c, 23, 26, 7); c.fill(); circ(c, 41, 26, 7); c.fill(); poly(c, [[32, 32], [36, 40], [28, 40]]); c.fill();
    c.fillStyle = s.color; c.fillRect(24, 46, 3, 8); c.fillRect(30, 46, 3, 8); c.fillRect(37, 46, 3, 8);
  },
  ammo: (c, s) => {
    for (let i = 0; i < 3; i++) { shape(c, () => rrect(c, 9 + i * 17, 14, 13, 40, 3), s.color, '#fff'); shape(c, () => rrect(c, 9 + i * 17, 42, 13, 12, 2), '#c9a35a'); }
  },
  crate: (c, s) => {
    shape(c, () => rrect(c, 8, 12, 48, 42, 3), s.accent, '#fff');
    c.strokeStyle = OUT; c.lineWidth = 3; c.beginPath(); c.moveTo(8, 12); c.lineTo(56, 54); c.moveTo(56, 12); c.lineTo(8, 54); c.moveTo(32, 12); c.lineTo(32, 54); c.stroke();
    shape(c, () => rrect(c, 8, 12, 48, 8, 2), s.color);
  },
  coin: (c, s) => {
    shape(c, () => circ(c, 32, 32, 24), s.color, '#fff');
    shape(c, () => circ(c, 32, 32, 15), s.accent);
    c.fillStyle = OUT; c.fillRect(30, 22, 4, 20);
  },
  lamp: (c, s) => {
    shape(c, () => poly(c, [[18, 8], [46, 8], [56, 34], [8, 34]]), s.accent, '#fff');
    shape(c, () => rrect(c, 29, 34, 6, 16, 1), '#8b939c');
    shape(c, () => rrect(c, 16, 50, 32, 8, 3), s.color);
  },
};

const cache = new Map();
/** Data URL of the glyph icon for an item type ('' without a DOM). def/tier are looked up by the caller (icons.js). */
export function fallbackIconURL(type, def, tier) {
  const key = `${type}|${tier || ''}`;
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    if (typeof document === 'undefined') return '';
    const spec = glyphSpec(def || { id: type, kind: 'scrap' }, tier);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    (DRAW[spec.shape] || DRAW.crate)(c, spec);
    // two-letter tag badge (bottom-right) so items of one kind stay distinguishable
    c.font = 'bold 13px monospace'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.lineWidth = 4; c.strokeStyle = OUT; c.strokeText(spec.tag, 61, 61);
    c.fillStyle = '#fff3e6'; c.fillText(spec.tag, 61, 61);
    url = cv.toDataURL('image/png');
  } catch { url = ''; }
  cache.set(key, url);
  return url;
}

// ------------------------------------------------------------------ audit (pure)
/**
 * items: the ITEMS table. probe: { model(id) -> 'mod'|'builtin'|null, icon(id) -> 'model'|'glyph'|'blank'|'pending' }.
 * -> { total, noModel:[{id,name,kind}], blank:[...], glyph:[...], model:n, byKind:{ kind: {total, noModel} } }
 */
export function auditItems(items, probe) {
  const rep = { total: 0, model: 0, noModel: [], blank: [], glyph: [], pending: [], byKind: {} };
  for (const [id, d] of Object.entries(items || {})) {
    if (!d) continue;
    rep.total++;
    const kind = d.kind || 'scrap', row = { id, name: d.$name || d.name || id, kind };
    const k = (rep.byKind[kind] ||= { total: 0, noModel: 0 });
    k.total++;
    const m = probe.model(id), ic = probe.icon(id);
    if (!m) { rep.noModel.push(row); k.noModel++; }
    if (ic === 'blank') rep.blank.push(row);
    else if (ic === 'glyph') rep.glyph.push(row);
    else if (ic === 'pending') rep.pending.push(row);
    else rep.model++;
  }
  return rep;
}
