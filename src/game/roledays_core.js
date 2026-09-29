// ROLEDAYS pure rules (docs/wave6/roledays.md, MASTERPLAN 23.8). No three.js / DOM: everything here is unit-tested in node.
// A "role day": from quota 2, ~25% of days, never two in a row, never on Casual, the Algorithm hands ONE constraint card to the crew.
// Team cards give one player a gift and a limit and make the OTHERS depend on them; solo cards (1-2 players) apply to everybody.

export const T = { fromQuota: 2, chance: 0.25, cooldown: 1, casual: 'casual', fast: 1.25, tailFast: 1.12 };

/** id -> { team, pref (roles that get the card first), holder (flags of the holder / of everyone on solo cards), rest (flags of the others), coins } */
export const CARDS = {
  navigator: { team: true, pref: ['occultist', 'scout'], coins: 60, holder: { noWeapon: true }, rest: { noCompass: true },
    name: 'Navigator Protocol', line: 'Navigator: the only one with the compass, but cannot hold weapons.', short: 'Only the Navigator sees the compass. The Navigator cannot hold weapons.' },
  carrier: { team: true, pref: ['hauler', 'enforcer'], coins: 70, holder: { mute: true, nightVision: true }, rest: {},
    name: 'Silent Carrier', line: 'Carrier: sees in the dark, cannot speak: pings and emotes only.', short: 'The Carrier sees in the dark but cannot speak (voice and chat muted). Ping and emote.' },
  scout: { team: true, pref: ['scout'], coins: 50, holder: { fast: true, noScrap: true }, rest: {},
    name: 'Swift Scout', line: 'Scout: fast on their feet, cannot pick up scrap.', short: 'The Scout moves 25% faster but cannot pick up scrap. Others carry.' },
  mechanic: { team: true, pref: ['technician'], coins: 60, holder: { doors: true }, rest: { noDoors: true },
    name: 'Mechanic Only', line: 'Mechanic: the only one who can open doors and locks.', short: 'Only the Mechanic can open doors, locks and keypads. Stay close to them.' },
  medic: { team: true, pref: ['medic'], coins: 60, holder: { halfBlind: true }, rest: {},
    name: 'Blind Medic', line: 'Medic: heals the crew, but is half-blind.', short: 'The Medic is half-blind (dark vignette). Guide them.' },
  pacifist: { team: false, pref: [], coins: 40, holder: { noWeapon: true, fast: true, tail: true }, rest: {},
    name: 'Pacifist Feed', line: 'Nobody holds weapons today. Everyone is a little faster.', short: 'Nobody can hold weapons. Everyone moves 12% faster.' },
  foggy: { team: false, pref: [], coins: 40, holder: { halfBlind: true, fast: true, tail: true }, rest: {},
    name: 'Fog Walker', line: 'Everyone is half-blind today, but a little faster.', short: 'Everyone is half-blind (dark vignette) but moves 12% faster.' },
  lightfoot: { team: false, pref: [], coins: 40, holder: { fast: true, noBig: true }, rest: {},
    name: 'Light Fingers', line: 'Everyone is fast, nobody lifts heavy scrap.', short: 'Everyone moves 25% faster but cannot pick up two-handed scrap.' },
};
export const IDS = Object.keys(CARDS);
export const SOLO_MAX = 2;

/** is there a card day today? ctx { quotaIndex, difficulty, company, lastDay, day, roll (0..1) } */
export function dayEligible(ctx) {
  if (!ctx || ctx.company) return false;
  if (String(ctx.difficulty || '').toLowerCase() === T.casual) return false;
  if ((ctx.quotaIndex | 0) < T.fromQuota) return false;
  if (ctx.lastDay != null && (ctx.day | 0) - (ctx.lastDay | 0) <= T.cooldown) return false;   // never two in a row
  return ctx.roll < T.chance;
}
/** cards usable with `n` players: team cards need 2+, solo cards only 1..SOLO_MAX */
export function cardsFor(n) {
  n |= 0;
  return IDS.filter((id) => (CARDS[id].team ? n >= 2 : n >= 1 && n <= SOLO_MAX));
}
export function pickCard(n, rnd, avoid) {
  let pool = cardsFor(n).filter((id) => id !== avoid);
  if (!pool.length) pool = cardsFor(n);
  return pool.length ? pool[Math.floor(rnd() * pool.length) % pool.length] : null;
}
/** players [{id, role}] -> { card, holder: id|null, all: bool }; the role wins if someone chose it, else round-robin by day over the sorted ids */
export function assign(card, players, day) {
  const c = CARDS[card]; if (!c) return null;
  const ids = [...players].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!ids.length) return null;
  if (!c.team) return { card, holder: null, all: true };
  let h = null;
  for (const r of c.pref) { h = ids.find((p) => p.role === r); if (h) break; }
  if (!h) h = ids[(((day | 0) % ids.length) + ids.length) % ids.length];
  return { card, holder: h.id, all: false };
}
/** the flags in force for player `id` under assignment `a` ({card, holder, all}) */
export function flagsOf(a, id) {
  if (!a || !CARDS[a.card]) return {};
  const c = CARDS[a.card];
  return a.all || a.holder === id ? c.holder : c.rest;
}
// --- enforcement predicates (pure; used by the client hooks AND the host validators)
export const canHoldWeapon = (a, id) => !flagsOf(a, id).noWeapon;
/** def = item def { kind, hands } */
export const canPickup = (a, id, def) => {
  const f = flagsOf(a, id); if (!def) return true;
  const scrap = def.kind === 'scrap' || def.kind === 'big';
  if (f.noWeapon && def.kind === 'weapon') return false;
  if (f.noScrap && scrap) return false;
  if (f.noBig && scrap && (def.hands | 0) >= 2) return false;
  return true;
};
export const canOpenDoor = (a, id) => !flagsOf(a, id).noDoors;
export const canSpeak = (a, id) => !flagsOf(a, id).mute;
export const showCompass = (a, id) => !flagsOf(a, id).noCompass;
export const speedMulFor = (a, id) => { const f = flagsOf(a, id); return f.fast ? (f.tail ? T.tailFast : T.fast) : 1; };
export const visionFor = (a, id) => { const f = flagsOf(a, id); return f.halfBlind ? 'blind' : f.nightVision ? 'night' : null; };
/** coins per surviving player: holder (or everyone on solo cards) full, the rest half */
export const payFor = (a, id) => { const c = CARDS[a?.card]; if (!c) return 0; return a.all || a.holder === id ? c.coins : Math.round(c.coins / 2); };
