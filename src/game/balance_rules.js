// BALANCE RULES (wave 8 "balance", docs/wave8/balance.md). ONE place for the fairness rules every creature obeys, whichever module registered it.
//   Pure maths at the top (no THREE / DOM: node-testable, shared with tools/sim), the game glue (installBalanceRules) at the bottom.
//   1. HIT CAP    a single non-boss hit takes at most 45 % (quota 0-1) / 60 % (2-3) / 85 % (4+) of a 100 HP bar. Only INSTAKILL_OK
//                 (telegraphed hazards: Pop-up jingle, Worm rumble, Fake Exit, Closet Thing, Clickbait Mine) may kill in one hit, and only from quota 4 on HARD
//                 (wave 8: on Casual / Standard 0 HP = DOWNED, game/downed.js, so the allowlist is capped like everything else).
//   2. WIND-UP    every creature attack lands >= 0.4 s after its attack state began (CreatureManager.attack asks gate()); a target that
//                 steps away or a creature that gets stunned in that window dodges the hit. Repeat calls inside 0.45 s are swallowed.
//   3. GRABS      a hold (giant grab, Clickbait tongue) ends by itself after 3.2 s and then grants 4 s of grab immunity; mashing JUMP
//                 (5 presses) frees the player at once. A leech that stays latched for 6 s lets go.
//   4. SCALING    creatures get +0 % / +0 % / +10 % damage on Casual / Standard / Hard from quota 3 (difficulty.js `dmgMul`).
//   5. REGISTER   registerCreature() runs normalizeDef(): a non-allowlisted def with dmg > 90 (the old 999 "kills you" number) is clamped to 90.
import { addTranslations, t } from '../core/i18n.js';
import { eff, getMode } from './difficulty.js';

export const RULES = Object.freeze({
  baseHp: 100,
  capTable: Object.freeze([[0, 0.45], [2, 0.6], [4, 0.85]]),   // [from quota index, max fraction of a 100 HP bar in ONE hit]
  instakillFrom: 4,
  safeDmg: 90,                 // registerCreature clamp for defs that asked for a kill-you number without being on the allowlist
  windup: 0.4,                 // s between the attack state starting and the damage landing
  minGap: 0.45,                // s between two hits of one creature (repeat calls are dropped)
  holdMax: 3.2, holdFree: 4,   // s a grab may last / s of grab immunity afterwards
  mash: 5,                     // JUMP presses that break a grab
  leechMax: 6,                 // s a latched leech holds on
});
/** hazards / specials that may be a true one-hit kill (each has a loud, obvious tell), from quota RULES.instakillFrom on */
export const INSTAKILL_OK = new Set(['jester', 'sandkefal', 'mimicdoor', 'mine', 'hr_ambusher']);
export const isInstakillOk = (type, def) => INSTAKILL_OK.has(type) || !!def?.instakill;
/** wave 8 "downed": the allowlist only kills in one hit on Hard (elsewhere 0 HP = down, and these hits are capped like any other) */
export const instakillHere = (type, def, mode = getMode()) => mode === 'hard' && isInstakillOk(type, def);
/** max fraction of a 100 HP bar one hit may take at quota index q */
export function hitCapFrac(q) {
  let f = RULES.capTable[0][1];
  for (const [from, v] of RULES.capTable) if ((q || 0) >= from) f = v;
  return f;
}
/** cap one hit. ok = the source may instakill (then it is only capped before RULES.instakillFrom) */
export function capOne(dmg, q, ok = false) {
  if (ok && (q || 0) >= RULES.instakillFrom) return dmg;
  return Math.min(dmg, Math.round(RULES.baseHp * hitCapFrac(q)));
}
/** difficulty multiplier on creature damage (Casual 1 / Standard 1 / Hard 1.1, only from quota 3 on) */
export const modeDmgMul = (q, mode) => eff(q, mode).dmgMul || 1;

/** registerCreature / table normalisation: the old 999 "you die" is a 90 hit unless the type is an allowlisted telegraphed hazard or a boss */
export function normalizeDef(id, def) {
  if (!def || def.boss || isInstakillOk(id, def)) return def;
  if (def.dmg > RULES.safeDmg) { def.dmgWas = def.dmg; def.dmg = RULES.safeDmg; }
  return def;
}

// ------------------------------------------------------------------------------------------------ attack gate (wind-up + dedupe)
const NEUTRAL = new Set(['idle', 'walk', 'run', 'chase', 'hunt', 'patrol', 'wander', 'stalk', 'sneak', 'flee', 'hide', 'hidden', 'ceiling']);
/** continuous / already-telegraphed causes: never delayed */
const FREE_CAUSES = new Set(['sludge', 'leech', 'ticketswarm', 'clickbait', 'explosion']);
const GRAB_CAUSES = new Set(['giant', 'clickbait']);
/** what CreatureManager.attack should do. i = { now, state, t (s in state), cause, boss, hazard, freed, last (time of the previous hit), pending }
 *  -> { act: 'now' | 'delay' | 'skip', wait (s) } */
export function planAttack(i) {
  if (i.boss || i.hazard) return { act: 'now', wait: 0 };
  if (i.freed && GRAB_CAUSES.has(i.cause)) return { act: 'skip', wait: 0 };
  if (FREE_CAUSES.has(i.cause)) return { act: 'now', wait: 0 };
  if (i.pending) return { act: 'skip', wait: 0 };
  if (i.last != null && i.now - i.last < RULES.minGap) return { act: 'skip', wait: 0 };
  const seen = NEUTRAL.has(i.state) ? 0 : Math.max(0, i.t || 0);
  const wait = Math.max(0, RULES.windup - seen);
  return wait > 0.02 ? { act: 'delay', wait } : { act: 'now', wait: 0 };
}

// ------------------------------------------------------------------------------------------------ hold book
export class HoldBook {
  constructor() { this.rec = new Map(); this.freeUntil = new Map(); }
  isFree(id, now) { return (this.freeUntil.get(id) || 0) > now; }
  /** the host is about to hold player id; false = suppress (immune / hold ran out) */
  touch(id, now) {
    if (this.isFree(id, now)) return false;
    let r = this.rec.get(id);
    if (!r || now - r.last > 0.7) { r = { start: now, last: now }; this.rec.set(id, r); } else r.last = now;
    if (now - r.start > RULES.holdMax) { this.free(id, now); return false; }
    return true;
  }
  held(id, now) { const r = this.rec.get(id); return !!r && now - r.last < 1; }
  free(id, now) { this.freeUntil.set(id, now + RULES.holdFree); this.rec.delete(id); }
}

// ------------------------------------------------------------------------------------------------ glue
addTranslations({
  'MASH JUMP TO BREAK FREE!': 'KURTULMAK İÇİN ZIPLA TUŞUNA BAS!',
  'You broke free.': 'Kurtuldun.',
}, 'tr');
addTranslations({
  'MASH JUMP TO BREAK FREE!': 'ЖМИ ПРЫЖОК, ЧТОБЫ ВЫРВАТЬСЯ!',
  'You broke free.': 'Ты вырвался.',
}, 'ru');

export function installBalanceRules(game) {
  const offs = [];
  const restores = [];
  const book = new HoldBook();
  const now = () => (typeof game.time === 'number' ? game.time : (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000);
  let disposed = false;

  // ---- host: CreatureManager.attack(c, p, dmg, cause) asks first. true = handled here (skipped or applied after the wind-up)
  const api = {
    book,
    gate(M, c, p, dmg, cause) {
      if (disposed || !game.isHost) return false;
      const plan = planAttack({
        now: now(), state: c.state, t: c.t, cause: cause || c.type, boss: !!c.def?.boss, hazard: !!c.def?.hazard,
        freed: book.isFree(p.id, now()), last: c._balAt, pending: c._balPend,
      });
      if (plan.act === 'skip') return true;
      c._balAt = now();
      if (plan.act === 'now') return false;
      c._balPend = true;
      const d0 = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      const fire = () => {
        c._balPend = false;
        if (disposed || c.dead || !M.host?.get?.(c.id) || (c.stunT || 0) > 0 || p.dead) return;
        if (Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) > d0 + 1.3) return;   // stepped away during the tell: the swing whiffs
        c._balAt = now();
        M.attack(c, p, dmg, cause, true);
      };
      if (game.later) game.later(fire, plan.wait * 1000); else setTimeout(fire, plan.wait * 1000);
      return true;
    },
    /** host: a leech latched for too long lets go */
    tickLeech() {
      const M = game.creatures;
      if (!M?.host) return;
      for (const c of M.host.values()) {
        if (c.type !== 'leech' || c.state !== 'latched' || c.t < RULES.leechMax) continue;
        game.hostLatch?.(c, c.extra, false); c.extra = 0; c.setState('walk'); c.data.climb = 10;
      }
    },
    dispose() { disposed = true; for (const o of offs.splice(0)) { try { o?.(); } catch { /* soft */ } } for (const r of restores.splice(0)) { try { r(); } catch { /* soft */ } } },
  };

  // ---- host: holds are capped and can be broken by the victim's request
  const orig = game.hostHoldPlayer;
  if (typeof orig === 'function') {
    game.hostHoldPlayer = function (id, pos) { return book.touch(id, now()) ? orig.call(this, id, pos) : undefined; };
    restores.push(() => { game.hostHoldPlayer = orig; });
  }
  offs.push(game.mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('balfree', (d, from) => { if (book.held(from, now())) book.free(from, now()); });
  }));

  // ---- client: mash JUMP while held; host tick for leeches
  let mash = 0, wasHeld = false, leechT = 0;
  offs.push(game.mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    const held = !!game.heldBy;
    if (held && !wasHeld) { mash = 0; game.ui?.toast?.(t('MASH JUMP TO BREAK FREE!'), 'warn'); }
    wasHeld = held;
    if (held && game.input?.pressed?.('jump') && ++mash >= RULES.mash) {
      game.heldBy = null; wasHeld = false; mash = 0;
      game.net?.request?.('balfree', {});
      game.ui?.toast?.(t('You broke free.'), 'good');
    }
    if (game.isHost && (leechT += dt) > 0.5) { leechT = 0; api.tickLeech(); }
  }));
  return api;
}
