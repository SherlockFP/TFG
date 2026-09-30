// LABYR10 runtime (wave 10, docs/wave10/labyr10.md): the cosmetic life of the Dead Mall and the Mirror Funhouse. Geometry / layout / loot spots come from
// world/interiors/labyr10_*.js (fac.lab); nothing here is gameplay state, so there is NO net traffic (every peer animates its own copy from the same seed).
//   deadmall   the pink neon tubes flicker (a hashed on/off track), a PA chime + announcement every 50-110 s while a local player is inside
//   funhouse   the spinning-tunnel shell turns, the carnival bulbs chase (lab.tick), PA announcements in the same slot
// Never adds THREE lights. Host-authoritative rules are untouched (loot, creatures, doors are the ordinary facility code).
import { t } from '../core/i18n.js';
import { RNG } from '../core/rng.js';
import { PA_MALL, PA_FUN, PA_PREFIX } from './labyr10_text.js';
import { SCRAP_TABLE, BIG_TABLES } from './items.js';
import { BEDS } from './atmos_core.js';

// Themed loot from EXISTING item ids (no new items): the mall sells dead-internet retail junk, the funhouse is clown / meme prizes. Set at install (before any
// world is generated) unless another module already provided a table for the id.
export const MALL_SCRAP = [['register', 6], ['vhs', 8], ['cdspindle', 6], ['memecart', 6], ['flipphone', 6], ['pocketpet', 5], ['animefig', 5], ['perfume', 7], ['pager', 4],
  ['headset', 4], ['gamingchair', 2], ['ringlight', 3], ['liketrophy', 3], ['nftframe', 3], ['duck', 3], ['robot', 4], ['lamp', 3], ['tv', 4], ['mug', 5], ['canned', 4],
  ['trophy', 3], ['playbutton', 1], ['captcha', 3], ['key', 3], ['goldbar', 1], ['ring', 1]];
export const FUN_SCRAP = [['clownhorn', 10], ['airhorn', 6], ['duck', 6], ['figurine', 7], ['teeth', 6], ['bottles', 6], ['skull', 3], ['pocketpet', 5], ['robot', 5],
  ['ringlight', 3], ['playbutton', 1], ['liketrophy', 4], ['animefig', 4], ['vhs', 4], ['painting', 4], ['magnify', 4], ['bell', 4], ['key', 3], ['trophy', 3], ['ring', 1], ['goldbar', 2]];
export const MALL_BIG = [['statue', 4], ['vase', 6], ['aquarium', 5], ['pctower', 5], ['amphora', 3]];
export const FUN_BIG = [['statue', 6], ['vase', 5], ['amphora', 5], ['aquarium', 4], ['cryptorig', 3]];

// procedural atmosphere beds (game/atmos.js layers these on the ambience loop; an unknown theme would get the factory bed). Same layer shapes as atmos_core BEDS.
export const MALL_BED = { level: 0.38, gap: [10, 26], layers: [{ t: 'buzz', f: 100, g: 0.14 }, { t: 'hum', f: [[60, 0.25]], lp: 300, g: 0.3, wob: [0.05, 0.25] },
  { t: 'noise', n: 'brown', ft: 'bandpass', f: 350, q: 0.9, g: 0.1, lfo: [0.06, 0.3, 0.3] }], events: [['chime', 3], ['flicker', 3], ['relay', 1], ['drip', 1], ['vent', 1]] };
export const FUN_BED = { level: 0.42, gap: [8, 22], layers: [{ t: 'hum', f: [[43, 0.4], [86, 0.15]], lp: 260, g: 0.45, wob: [0.05, 0.25] },
  { t: 'noise', n: 'white', ft: 'bandpass', f: 1500, q: 0.6, g: 0.014, lfo: [0.06, 0.3, 0.3] }], events: [['creak', 3], ['groan', 2], ['relay', 2], ['ping', 1], ['flicker', 2]] };

const flick = (k) => { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

export function installLabyr10(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  if (!SCRAP_TABLE.deadmall) { SCRAP_TABLE.deadmall = MALL_SCRAP; BIG_TABLES.deadmall = MALL_BIG; }
  if (!SCRAP_TABLE.funhouse) { SCRAP_TABLE.funhouse = FUN_SCRAP; BIG_TABLES.funhouse = FUN_BIG; }
  if (!BEDS.deadmall) BEDS.deadmall = MALL_BED;
  if (!BEDS.funhouse) BEDS.funhouse = FUN_BED;
  let disposed = false, clock = 0, fac = null, paT = 0, paN = 0, rng = null;
  const toast = (m, kind = 'info') => { try { game.ui?.hud?.toast?.(m, kind); } catch { /* hud optional */ } };
  const sfx = (id, v) => { try { game.sfx?.(id, v); } catch { /* audio optional */ } };

  function announce(lab) {
    const lines = lab.pa === 'fun' ? PA_FUN : PA_MALL;
    const line = lines[(paN + ((game.run?.seed ?? 0) >>> 0)) % lines.length];
    paN++;
    if (lab.pa === 'mall') sfx('mall_chime', 0.6); else sfx('fun_honk', 0.5);
    toast(`${t(PA_PREFIX)}: ${t(line)}`, 'info');
  }

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    clock += dt;
    const F = game.world?.facility || null, lab = F?.lab || null;
    if (F !== fac) { fac = F; rng = new RNG(((game.run?.seed ?? 1) ^ 0x9a10c5) >>> 0); paT = rng.float(30, 60); paN = 0; }
    if (!lab || (lab.id !== 'deadmall' && lab.id !== 'funhouse') || game.run?.phase !== 'moon') return;
    if (lab.tick) lab.tick(dt, clock);
    if (lab.neon?.length) { const on = flick((clock * 9) | 0) > 0.22; for (const m of lab.neon) m.visible = on; }
    const p = game.player;
    if (!p || p.dead || !p.indoor) return;
    paT -= dt;
    if (paT <= 0) { paT = rng.float(50, 110); announce(lab); }
  }));

  return {
    _state: () => ({ clock, paN }),
    announceNow() { const lab = game.world?.facility?.lab; if (lab && (lab.id === 'deadmall' || lab.id === 'funhouse')) announce(lab); },
    dispose() { disposed = true; for (const off of offs) { try { off(); } catch { /* ignore */ } } },
  };
}
