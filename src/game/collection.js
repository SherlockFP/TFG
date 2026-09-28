// Collection log / CODEX: bestiary (seen / killed + lore), scrap codex (found, best value), moons visited
// (incl. generated ones), interiors explored, daily events experienced. Completion milestones pay Clout, titles,
// reward suits and unlockable emotes. Personal (every peer tracks its own), persisted in profile.codex.
//
// Observes the game without editing other systems: mod events 'phase' / 'update', and an instance wrap of
// Game.onItemHeld (the local player picking scrap up). Creature entries come from profile.bestiary (Progress).
import { CREATURES } from './creatures.js';
import { ITEMS, isSellable } from './items.js';
import { MOONS, MOON_ORDER } from './moons.js';
import { DAILY_EVENTS, wrapMethod } from './dailyEvents.js';
import { unlockEmote, EMOTES } from './emotes.js';
import { SUIT_COLORS } from '../models/avatar.js';
import { INTERIOR_NAMES as REG_INTERIOR_NAMES, INTERIOR_THEMES } from '../world/interiors/index.js';
import { tf } from '../core/i18n.js';

// ------------------------------------------------------------------ reward suits (colour-only cosmetics)
// Registered at import so every peer can render them (remote suit colours are looked up in SUIT_COLORS).
export const REWARD_SUITS = [
  { id: 'void', name: 'Void', color: '#1a1d33' },
  { id: 'glitch', name: 'Glitch', color: '#b53cff' },
  { id: 'ice', name: 'Frostbyte', color: '#9fd8ff' },
  { id: 'rust', name: 'Rust', color: '#a14a1c' },
  { id: 'neon', name: 'Neon', color: '#39ff88' },
  { id: 'diamond', name: 'Diamond', color: '#d8f6ff' },
  { id: 'reborn', name: 'Reborn Crimson', color: '#8a1030' },
  { id: 'aurora', name: 'Aurora', color: '#5fe0c8' },
  { id: 'obsidian', name: 'Obsidian', color: '#0d0b10' },
  { id: 'leader', name: 'Leaderboard Violet', color: '#6a3cff' },
];
for (const s of REWARD_SUITS) if (!SUIT_COLORS.some((x) => x.id === s.id)) SUIT_COLORS.push({ ...s, reward: true });

// Extra field notes for the bestiary (the first lore line lives in CREATURES[id].lore).
export const FIELD_NOTES = {
  scuttler: 'Drops "crunchy bits" that sell. Swarms are worse on BOT SWARM days.',
  yoinker: 'Follow it home: the nest is a free pile of scrap if you can outrun the tantrum.',
  crawler: 'Loses track of you after a hard turn. Doorways are your friend.',
  lurker: 'Never turn your back in long corridors. Two people watching = zero problems.',
  mannequin: 'Flashbangs and stun grenades buy you seconds. Walk backwards, never blink.',
  sludge: 'Music calms it. A boombox in the hallway is a legit strategy.',
  jester: 'When the jingle ends, nobody inside is safe. The ship door is the only exit that counts.',
  spider: 'Burn the web, not your time. It only chases in its own territory.',
  leech: 'If a crewmate is suffocating, hit THEIR head. Yes, really.',
  screamer: 'Invisible in the dark, obvious in a flashlight. Point, shoot, relax.',
  mimic: 'Ask a question only a friend could answer. Deepfakes do not do small talk.',
  hound: 'Crouch-walk. Throw a noise maker the other way. Never ring the horn at night.',
  giant: 'Line of sight is everything. Trees, rocks and the ship are cover.',
  sandkefal: 'The rumble comes first. Run perpendicular, not away.',
  turret: 'Every turret has a terminal code (CODES). Disable, then loot.',
  mine: 'Mines show up on scans. Crouch-step around them, or code them off.',
  mimicdoor: 'Real exits are cold and quiet. This one is warm.',
  web: 'Hit it twice to tear it. Or take the scenic route.',
  foreman: 'Watch the slam telegraph. Stun breaks its guard; flank while it recovers.',
};

const INTERIOR_NAMES = { ...REG_INTERIOR_NAMES };   // every registered interior theme (factory, mansion, mineshaft + the 5 round-3 themes)
export const interiorName = (id) => INTERIOR_NAMES[id] || String(id || '?').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ------------------------------------------------------------------ profile data
/** Normalise profile.codex (idempotent). */
export function ensureCodex(p) {
  if (!p) return p;
  const c = p.codex && typeof p.codex === 'object' ? p.codex : (p.codex = {});
  for (const k of ['scrap', 'moons', 'interiors', 'events', 'claimed']) if (!c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) c[k] = {};
  if (typeof c.pct !== 'number' || !isFinite(c.pct)) c.pct = 0;
  if (!p.bestiary || typeof p.bestiary !== 'object') p.bestiary = {};
  // seed from the achievements service record (moons already visited before the codex existed)
  for (const id of p.stats?.moonsVisited || []) if (!c.moons[id]) c.moons[id] = { n: 1, name: MOONS[id]?.name || id, at: 0 };
  return p;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
/** Creatures that belong in the bestiary (real creatures + hazards), live registry (mods add more). */
export function bestiaryIds() { return Object.keys(CREATURES).filter((id) => id !== 'kefaldayi' && id !== 'company'); }
/** The scrap universe: every sellable item (bodies excluded). Grows with mods / generated content. */
export function scrapIds() { return Object.keys(ITEMS).filter((id) => { const d = ITEMS[id]; return d && id !== 'body' && d.kind !== 'body' && isSellable(d); }); }
const baseMoonIds = () => MOON_ORDER.filter((id) => MOONS[id]);

/** Counters used by the milestones and the panel. */
export function codexCounts(p) {
  ensureCodex(p);
  const c = p.codex, b = p.bestiary;
  const bIds = bestiaryIds();
  const creatures = bIds.filter((id) => !CREATURES[id]?.hazard);
  const seen = bIds.filter((id) => b[id]?.seen).length;
  const killedTypes = creatures.filter((id) => num(b[id]?.kills) > 0).length;
  const scrapU = scrapIds();
  const scrapFound = scrapU.filter((id) => num(c.scrap[id]?.n) > 0).length;
  const moons = Object.keys(c.moons).length;
  const baseMoons = baseMoonIds();
  const baseVisited = baseMoons.filter((id) => c.moons[id]).length;
  const interiors = Object.keys(c.interiors).length;
  const interiorTotal = Math.max(INTERIOR_THEMES.length, new Set([...Object.keys(INTERIOR_NAMES), ...Object.keys(c.interiors)]).size);
  const events = DAILY_EVENTS.filter((e) => num(c.events[e.id]) > 0).length;
  let best = 0; for (const e of Object.values(c.scrap)) best = Math.max(best, num(e?.best));
  const parts = [[seen, bIds.length], [scrapFound, scrapU.length], [baseVisited, baseMoons.length], [interiors, interiorTotal], [events, DAILY_EVENTS.length]];
  let have = 0, need = 0;
  for (const [h, t] of parts) { have += Math.min(h, t); need += t; }
  const pct = need ? Math.floor((have / need) * 100) : 0;
  return { seen, seenTotal: bIds.length, killedTypes, creatureTotal: creatures.length, scrapFound, scrapTotal: scrapU.length, moons, baseVisited, baseMoonTotal: baseMoons.length, interiors, interiorTotal, events, eventTotal: DAILY_EVENTS.length, best, pct };
}

// ------------------------------------------------------------------ milestones
// get(counts) -> current value. reward: { coin, xp, title, cosmetic: 'suit:x', emote }
const M = (id, cat, name, target, get, reward) => ({ id, cat, name, target, get, reward });
export const MILESTONES = [
  M('bst_5', 'bestiary', 'Field Researcher', 5, (k) => k.seen, { coin: 150, xp: 150 }),
  M('bst_10', 'bestiary', 'Cryptozoologist', 10, (k) => k.seen, { coin: 300, xp: 300, emote: 'salute' }),
  M('bst_all', 'bestiary', 'Complete Bestiary', 0, (k) => k.seen, { coin: 1200, title: 'Cryptid Hunter', cosmetic: 'suit:void' }),
  M('kill_8', 'bestiary', 'Diverse Portfolio', 8, (k) => k.killedTypes, { coin: 400, emote: 'flex' }),
  M('scr_10', 'scrap', 'Dumpster Diver', 10, (k) => k.scrapFound, { coin: 150, xp: 150 }),
  M('scr_25', 'scrap', 'Curator', 25, (k) => k.scrapFound, { coin: 400, xp: 400 }),
  M('scr_40', 'scrap', 'Archivist', 40, (k) => k.scrapFound, { coin: 900, title: 'Archivist', cosmetic: 'suit:glitch' }),
  M('scr_300', 'scrap', 'Jackpot Janitor', 300, (k) => k.best, { coin: 250, title: 'Jackpot Janitor' }),
  M('moon_3', 'moons', 'Tourist', 3, (k) => k.moons, { coin: 150 }),
  M('moon_7', 'moons', 'Frequent Flyer', 7, (k) => k.moons, { coin: 300, cosmetic: 'suit:ice' }),
  M('moon_15', 'moons', 'Cartographer', 15, (k) => k.moons, { coin: 600, title: 'Cartographer', emote: 'moonwalk' }),
  M('moon_30', 'moons', 'Deep Crawler', 30, (k) => k.moons, { coin: 1000, xp: 1000 }),
  M('moon_60', 'moons', 'Voyager', 60, (k) => k.moons, { coin: 2000, title: 'Void Voyager' }),
  M('moon_120', 'moons', 'Dead Internet Tourist', 120, (k) => k.moons, { coin: 4000, title: 'Dead Internet Tourist' }),
  M('int_2', 'interiors', 'Explorer', 2, (k) => k.interiors, { coin: 150 }),
  M('int_4', 'interiors', 'Spelunker', 4, (k) => k.interiors, { coin: 500, cosmetic: 'suit:rust' }),
  M('int_6', 'interiors', 'Dungeon Crawler', 6, (k) => k.interiors, { coin: 900, title: 'Dungeon Crawler' }),
  M('evt_5', 'events', 'Patch Tester', 5, (k) => k.events, { coin: 200 }),
  M('evt_10', 'events', 'Changelog Enjoyer', 10, (k) => k.events, { coin: 400, emote: 'facepalm' }),
  M('evt_all', 'events', 'Patch Notes Reader', 0, (k) => k.events, { coin: 1000, title: 'Patch Notes Reader', cosmetic: 'suit:neon' }),
  M('cdx_50', 'codex', 'Half the Wiki', 50, (k) => k.pct, { coin: 800, xp: 800 }),
  M('cdx_100', 'codex', 'Codex Complete', 100, (k) => k.pct, { coin: 3000, title: 'Codex Complete', cosmetic: 'suit:diamond' }),
];
/** Target of a milestone (0 = "all of the live total"). */
export function milestoneTarget(m, k) {
  if (m.target) return m.target;
  if (m.cat === 'bestiary') return k.seenTotal;
  if (m.cat === 'events') return k.eventTotal;
  return 1;
}

export function rewardLine(r) {
  const out = [];
  if (r.xp) out.push(`+${r.xp} XP`);
  if (r.coin) out.push(`◈${r.coin}`);
  if (r.title) out.push(`title "${r.title}"`);
  if (r.cosmetic) { const id = r.cosmetic.split(':')[1]; out.push((SUIT_COLORS.find((s) => s.id === id)?.name || id) + ' suit'); }
  if (r.emote) out.push(`emote ${EMOTES.find((e) => e.id === r.emote)?.name || r.emote}`);
  return out.join(' · ');
}

// ------------------------------------------------------------------ runtime
export function installCollection(game) {
  const p = ensureCodex(game.profile);
  const st = { disposed: false, evalT: 2, landingKey: '', interiorKey: '', seenItems: new Set() };
  const offs = [];
  const save = () => game.progress?.save?.();

  const payout = (m) => {
    const r = m.reward || {};
    const ach = game.achievements;
    if (ach?.grant) ach.grant({ xp: r.xp || 0, coin: r.coin || 0, title: r.title, cosmetic: r.cosmetic, fallbackCoin: 200 });
    else { if (r.xp) game.progress?.addXp(r.xp, 'Codex'); if (r.coin) game.progress?.addCoins(r.coin, 'Codex'); }
    if (r.emote && unlockEmote(p, r.emote)) save();
    const item = { tier: 'gold', icon: '📖', kicker: 'CODEX MILESTONE', name: m.name, desc: `${m.cat.toUpperCase()} · press J to open the Codex`, reward: rewardLine(r) };
    if (ach?.banner) ach.banner(item); else game.ui?.toast?.(tf('CODEX: {name} — {reward}', { name: m.name, reward: item.reward }), 'good');
  };

  function evaluate() {
    const k = codexCounts(p);
    p.codex.pct = k.pct;
    let changed = false;
    for (const m of MILESTONES) {
      if (p.codex.claimed[m.id]) continue;
      if (m.get(k) < milestoneTarget(m, k) || milestoneTarget(m, k) <= 0) continue;
      p.codex.claimed[m.id] = Date.now();
      changed = true;
      payout(m);
    }
    if (changed) save();
    return k;
  }

  // ---- recorders
  const recordMoon = () => {
    const run = game.run;
    if (!run?.moon) return;
    const key = run.moon + ':' + run.seed + ':' + run.day;
    if (st.landingKey === key) return;
    st.landingKey = key;
    const m = MOONS[run.moon];
    const e = p.codex.moons[run.moon] || (p.codex.moons[run.moon] = { n: 0, at: Date.now() });
    e.n = num(e.n) + 1;
    e.name = String(m?.name || run.moonName || run.moon).slice(0, 40);
    if (m?.biome) e.biome = m.biome;
    if (m?.tier !== undefined) e.tier = m.tier;
    if (!m?.company && run.dailyEvent?.id) p.codex.events[run.dailyEvent.id] = num(p.codex.events[run.dailyEvent.id]) + 1;
    save();
  };
  const recordInterior = () => {
    const fac = game.world?.facility;
    const theme = fac?.layout?.theme;
    if (!theme || !game.player?.indoor || game.player.dead) return;
    const key = theme + ':' + (game.world.seed || 0);
    if (st.interiorKey === key) return;
    st.interiorKey = key;
    const known = !!p.codex.interiors[theme];
    const e = p.codex.interiors[theme] || (p.codex.interiors[theme] = { n: 0, at: Date.now() });
    e.n = num(e.n) + 1;
    if (!known) game.ui?.toast?.(tf('New Codex entry: interior "{name}"', { name: interiorName(theme) }), 'info');
    save();
  };
  const recordScrap = (it) => {
    if (!it?.def || !it.type || it.type === 'body' || it.soulbound || !isSellable(it.def)) return;
    if (st.seenItems.has(it.id)) return;
    st.seenItems.add(it.id);
    const known = !!p.codex.scrap[it.type];
    const e = p.codex.scrap[it.type] || (p.codex.scrap[it.type] = { n: 0, best: 0, at: Date.now() });
    e.n = num(e.n) + 1;
    e.best = Math.max(num(e.best), num(it.value));
    if (!known) game.ui?.toast?.(tf('New Codex entry: {name}', { name: it.def.name }), 'info');
    save();
  };

  // instance wrap of onItemHeld (prototype method from actions.js)
  const restoreHeld = wrapMethod(game, 'onItemHeld', (orig) => function (it, holder, ...rest) {
    const r = orig.call(this, it, holder, ...rest);
    if (!st.disposed && holder && holder === game.selfId) { try { recordScrap(it); } catch (e) { console.warn('[codex]', e); } }
    return r;
  });

  const mods = game.mods;
  if (mods?.on) {
    offs.push(mods.on('phase', (ph, g) => {
      if (g && g !== game) return;
      if (ph === 'moon' || ph === 'company') recordMoon();
    }));
    offs.push(mods.on('update', (dt, g) => {
      if ((g && g !== game) || st.disposed) return;
      recordInterior();
      st.evalT -= dt;
      if (st.evalT <= 0 && !game.minigame) { st.evalT = 3; evaluate(); }
    }));
  }

  return {
    evaluate,
    counts: () => codexCounts(p),
    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      restoreHeld();
    },
  };
}
