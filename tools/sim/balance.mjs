// TFG creature-scaling / threat-meter simulator:  node tools/sim/balance.mjs [--runs N] [--seed S] [--section a,b,c,d]
//
// Uses the REAL formulas (src/game/balance_core.js) and the REAL data tables (creatures, moons, progression) and
// models only the player. Sections:
//   a  multiplier table per quota index (sector x threat)
//   b  per-creature stats OLD (unscaled) vs NEW at quota 0/1/2/4: hits to kill a 100 HP player, shovel time-to-kill,
//      speed vs the player's sprint (8.2 m/s), one-shot flags
//   c  threat meter traces for a simulated 5 minute stay (quiet / greedy / noisy / crew + alarm)
//   d  day-1 Monte Carlo: a solo player with a shovel explores the facility for a whole day; the host spawn loop
//      is replayed (budget, time-of-day curve, wave timer, packs, 90 s entrance safe window) and every creature
//      the player meets is fought 1 v 1 -> P(death), expected HP lost. OLD vs NEW.
// The player model is an assumption set (documented at the top of section d): use it to COMPARE tunings.
import { CREATURES, spawnTable, canSpawnMore, creatureLevelStats } from '../../src/game/creatures.js';
import { MOONS } from '../../src/game/moons.js';
import { indoorPowerMul, creatureBaseLevel } from '../../src/game/progression.js';
import { isInstakillOk, hitCapFrac } from '../../src/game/balance_rules.js';
import { scaleFor, sectorScale, threatScale, capHit, earlyRules, ThreatModel, lootLuckFor, levelIndex, LEVELS, RAMP_Q } from '../../src/game/balance_core.js';

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RUNS = +argv('--runs', 3000);
const SEED = +argv('--seed', 424242);
const SECTIONS = new Set((argv('--section', 'a,b,c,d')).split(','));
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry(SEED);
const f2 = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : String(v));
const pad = (v, n) => String(v).padEnd(n);
const rpad = (v, n) => String(v).padStart(n);

const SPRINT = 8.2, WALK = 5.0;
// ---- section a ---------------------------------------------------------------------------------------------------
if (SECTIONS.has('a')) {
  console.log('\n== a. multipliers per quota index (threat 0 / 40 / 80) ==');
  console.log(pad('quota', 6), pad('hp', 6), pad('dmg', 6), pad('speed', 6), pad('spawn', 6), pad('detect', 7), '| dmg@T40 dmg@T80 speed@T80 spawn@T40 spawn@T80 pace@T80 | hitCap  speedCap | luck@T0 luck@T80');
  for (let q = 0; q <= 16; q += q < 6 ? 1 : 2) {
    const s0 = scaleFor(q, 0), s40 = scaleFor(q, 40), s80 = scaleFor(q, 80), e = earlyRules(q);
    console.log(pad(q, 6), pad(f2(s0.hp), 6), pad(f2(s0.dmg), 6), pad(f2(s0.speed), 6), pad(f2(s0.spawn), 6), pad(f2(s0.detect), 7), '|',
      rpad(f2(s40.dmg), 7), rpad(f2(s80.dmg), 7), rpad(f2(s80.speed), 9), rpad(f2(s40.spawn), 9), rpad(f2(s80.spawn), 9), rpad(f2(s80.pace), 8), '|',
      pad(Math.round(hitCapFrac(q) * 100) + '%', 6), pad(e.speedCap ? e.speedCap + ' m/s' : '-', 9), '|', rpad(f2(lootLuckFor(q, 0)), 6), rpad(f2(lootLuckFor(q, 80)), 8));
  }
}

// ---- section b ---------------------------------------------------------------------------------------------------
const CD = { scuttler: 1.0, yoinker: 0.9, crawler: 1.4, lurker: 8, mannequin: 0.6, sludge: 0.5, spider: 1.3, leech: 1.0, screamer: 8, mimic: 1.1, hound: 1.5, moderator: 2.5, support: 2.0, editor: 1.5, tamagotchi: 1.5, clickbait: 1.0, replyguy: 1.3, giant: 3, jester: 3 };
const SHOVEL = { dmg: 20, cd: 0.8, hit: 0.75 };
const shovelDps = SHOVEL.dmg * SHOVEL.hit / SHOVEL.cd;
function cstats(id, q, scaled) {
  const d = CREATURES[id];
  const lv = Math.max(1, creatureBaseLevel(1, q));
  const st = creatureLevelStats(d, lv, false);
  const s = scaled ? scaleFor(q, 0, d.hazard ? 'hazard' : 'creature') : { hp: 1, dmg: 1, speed: 1 };
  const hp = st.maxHp == null ? null : Math.round(st.maxHp * s.hp);
  const raw = st.dmg >= 999 ? 999 : Math.round(st.dmg * s.dmg);
  const dmg = scaled ? capHit(raw, q, isInstakillOk(id, d)) : raw;
  let run = d.run * s.speed;
  if (scaled) { const cap = earlyRules(q).speedCap; if (cap) run = Math.min(run, cap); }
  return { hp, dmg, raw, run, ttk: hp == null ? null : hp / shovelDps };
}
if (SECTIONS.has('b')) {
  console.log('\n== b. creature stats, OLD (x1.0) vs NEW (moon tier 1, level rolled from the quota) ==');
  console.log('hits = hits to kill a 100 HP player;  ttk = seconds to kill it with a shovel (20 dmg / 0.8 s, 75 % hit);  run = chase speed (player sprint 8.2, walk 5.0)');
  const ids = ['scuttler', 'yoinker', 'crawler', 'lurker', 'mannequin', 'spider', 'leech', 'screamer', 'mimic', 'hound', 'moderator', 'support'];
  for (const q of [0, 1, 2, 4]) {
    console.log(`\n-- quota ${q} --`);
    console.log(pad('creature', 11), '|', pad('OLD hp', 7), pad('dmg', 5), pad('hits', 5), pad('ttk', 6), pad('run', 5), '|', pad('NEW hp', 7), pad('dmg', 5), pad('hits', 5), pad('ttk', 6), pad('run', 5), '| sprint escapes?');
    for (const id of ids) {
      const o = cstats(id, q, false), n = cstats(id, q, true);
      const hits = (x) => (x.dmg >= 100 ? '1!' : String(Math.ceil(100 / Math.max(1, x.dmg))));
      console.log(pad(id, 11), '|', pad(o.hp ?? '-', 7), pad(o.dmg, 5), pad(hits(o), 5), pad(o.ttk == null ? '-' : f2(o.ttk, 1), 6), pad(f2(o.run, 1), 5), '|',
        pad(n.hp ?? '-', 7), pad(n.dmg, 5), pad(hits(n), 5), pad(n.ttk == null ? '-' : f2(n.ttk, 1), 6), pad(f2(n.run, 1), 5), '|', n.run < SPRINT ? 'yes' : 'NO (' + f2(n.run - SPRINT, 1) + ' m/s faster)');
    }
  }
}

// ---- section c ---------------------------------------------------------------------------------------------------
if (SECTIONS.has('c')) {
  console.log('\n== c. threat meter over a simulated 5 minute stay in the facility (sample every 30 s) ==');
  const scen = {
    'quiet solo (walks, 0 loot)': () => ({ inside: 1 }),
    'solo, 3 pickups (45 each at 60/120/180 s), quota 130': (t) => ({ inside: 1, carried: 45 * (t >= 180 ? 3 : t >= 120 ? 2 : t >= 60 ? 1 : 0) }),
    'solo sprinting 30 % of the time + a shout every 20 s': (t) => ({ inside: 1, sprint: (t % 10) < 3 ? 0.7 - 0.55 + 0.25 : 0, voice: (t % 20) < 1 ? 0.5 : 0 }),
    'crew of 3 inside, 2 pickups, alarm at 200 s': (t) => ({ inside: 3, carried: 45 * (t >= 150 ? 2 : t >= 75 ? 1 : 0), alarm: t >= 200 }),
    'greedy + noisy solo (carrying 200, sprinting)': (t) => ({ inside: 1, carried: 200, sprint: (t % 10) < 5 ? 0.4 : 0 }),
  };
  console.log(pad('scenario', 56), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300].map((t) => rpad(t + 's', 5)).join(''), ' | 10 min');
  for (const [name, fn] of Object.entries(scen)) {
    const m = new ThreatModel(); const row = []; let lastLv = -1; const cross = [];
    let at600 = 0;
    for (let t = 0; t <= 600; t += 0.5) {
      const c = fn(t);
      m.setEvents({ alarm: !!c.alarm });
      m.step(0.5, { inside: c.inside || 0, crew: c.inside || 1, aboardAll: false, carried: c.carried || 0, secured: 0, quota: 130, sprint: c.sprint || 0, voice: c.voice || 0 });
      const lv = levelIndex(m.T, lastLv); if (lv !== lastLv) { if (t <= 300) cross.push(`${LEVELS[lv].name}@${t}s`); lastLv = lv; }
      if (t % 30 === 0 && t <= 300) row.push(rpad(Math.round(m.T), 5));
      if (t === 600) at600 = m.T;
    }
    console.log(pad(name, 56), row.join(''), ' |', rpad(Math.round(at600), 4), '  ', cross.join(' '));
  }
  // relief: leave for the ship after 300 s
  const m = new ThreatModel();
  for (let t = 0; t < 300; t += 0.5) m.step(0.5, { inside: 1, crew: 1, carried: 90, quota: 130 });
  const t0 = m.T; let tCalm = 0;
  for (let t = 0; t < 300; t += 0.5) { m.step(0.5, { inside: 0, crew: 1, aboardAll: true, quota: 130 }); if (m.T < 25 && !tCalm) tCalm = t; }
  console.log(`relief: threat ${Math.round(t0)} after 300 s carrying 90 -> back in the ship: below 25 (CALM) after ${tCalm} s, ${Math.round(m.T)} after 300 s`);
}

// ---- section d ---------------------------------------------------------------------------------------------------
// Player model (assumptions): solo, 100 HP, shovel (20 dmg, 0.8 s, 75 % hit), explores the facility for the whole day
// (720 s real time = 16 game hours; the host spawn wave timer runs on real seconds). Every creature the host spawns
// finds the player with probability P_ENC (facility is big, a lot of it is never visited). Encounter = fight to the end
// unless the creature is unkillable / one-shot flagged (then it is 1 hit with prob P_HIT_UNKILL). While fighting, the
// creature is in reach only MELEE_F of the time (knockback, hit stun, side steps). Packs (scuttlers) fight one by
// one. The player never heals and never leaves early: the result is the WORST case for a careless solo player.
const P_ENC = 0.55, MELEE_F = 0.55, P_HIT_UNKILL = 0.6;
function fightDamage(id, q, scaled, rng) {
  const d = CREATURES[id];
  if (!d || d.hazard) return 0;
  const n = cstats(id, q, scaled);
  const cd = CD[id] || 1.2;
  const ambush = 0.75 + rng() * 0.5;   // the first hit lands early or late
  if (n.hp == null) return rng() < P_HIT_UNKILL ? n.dmg * ambush : 0;                     // unkillable: run past it, maybe one hit
  if (d.dmg >= 900 && id === 'lurker') return n.dmg * (rng() < 0.5 ? 1 : 0);              // lurker: one sneak hit, then it flees
  const ttk = n.ttk * (0.8 + rng() * 0.6);
  const speedRatio = n.run / SPRINT;
  const flee = speedRatio < 0.95 && rng() < 0.35;            // slower than the player's sprint: 35 % of the time the player just runs
  if (flee) return n.dmg * (rng() < 0.4 ? 1 : 0);
  const hits = Math.max(1, Math.floor(ttk * MELEE_F / cd) + (rng() < 0.5 ? 1 : 0));
  return hits * n.dmg * (0.9 + 0.2 * ambush);
}
function replaySpawns(moonId, q, scaled, rng, style = 'camper') {
  const moon = MOONS[moonId];
  const table = Object.entries(spawnTable(moon, 'in', { quotaIndex: q })).filter(([id]) => CREATURES[id] && !CREATURES[id].hazard && !CREATURES[id].boss && CREATURES[id].zone !== 'out');
  const tot = table.reduce((s, [, w]) => s + w, 0);
  const pick = () => { let r = rng() * tot; for (const [id, w] of table) { r -= w; if (r <= 0) return id; } return table[0][0]; };
  const model = new ThreatModel();
  const host = new Map();
  let used = 0, t = 0, nextWave = 20;
  const list = [];
  const wave = (fraction) => {
    const T = scaled ? model.T : 0;
    const sc = scaled ? scaleFor(q, T) : { spawn: 1 };
    const budget = moon.power * indoorPowerMul(q) * sc.spawn;
    const gm = 480 + t * (960 / 720);
    const tt = (gm - 480) / 360;
    const allowed = budget * Math.min(1, Math.max(0, Math.max(fraction, 0.35 + 0.65 * tt)));
    let guard = 0;
    while (used < allowed && guard++ < 20) {
      const id = pick(); const def = CREATURES[id];
      if (used + def.power > allowed + 0.5) break;
      const cap = id === 'jester' ? 1 : def.maxAlive;
      if (cap && list.filter((x) => x.id === id).length >= cap) continue;
      const n = id === 'scuttler' ? 2 + Math.floor(rng() * 3) : 1;
      // 90 s entrance window: those spawns are placed away from the door, the player's own walking still meets them later
      for (let k = 0; k < n; k++) list.push({ id, t });
      used += def.power;
    }
  };
  wave(0.35);
  for (t = 0; t < 720; t += 1) {
    if (scaled) {
      // camper: never leaves, keeps every item (up to 160 value). cycler: 150 s inside, 25 s in the ship depositing (carried = 0)
      const away = style === 'cycler' && (t % 175) >= 150;
      const carried = style === 'cycler' ? Math.min(90, (t % 175) * 0.6) : Math.min(160, t * 0.35);
      if (away) model.step(1, { inside: 0, crew: 1, aboardAll: true, quota: 130 + q * 40 });
      else model.step(1, { inside: 1, crew: 1, carried, quota: 130 + q * 40 });
    }
    if (t >= nextWave) { wave(0); const sc = scaled ? scaleFor(q, model.T) : { pace: 1 }; nextWave = t + (45 + rand() * 35) / sc.pace; }
  }
  return { list, used, T: model.T };
}
if (SECTIONS.has('d')) {
  console.log(`\n== d. solo player with a shovel, whole day inside (Monte Carlo, ${RUNS} days per row) ==`);
  console.log('creatures = expected number spawned indoors over the day;  met = creatures that found the player;  HP lost = expected damage taken (100 HP bar, no healing);');
  console.log('P(die) = chance the day kills the solo player;  P(hit>=45) = chance at least one single hit lands for 45+ ;  oneShot = at least one 100+ hit');
  console.log(pad('moon', 10), pad('q', 3), pad('mode', 12), rpad('creatures', 10), rpad('met', 6), rpad('HP lost', 8), rpad('P(die)', 8), rpad('P(hit>=45)', 11), rpad('oneShot', 8), rpad('T end', 6));
  for (const moonId of ['hamsi', 'lufer', 'palamut']) {
    for (const q of [0, 1, 2, 4, 8]) {
      for (const mode of ['OLD', 'NEW camper', 'NEW cycler']) {
        const scaled = mode !== 'OLD', style = mode === 'NEW cycler' ? 'cycler' : 'camper';
        if (style === 'cycler' && moonId !== 'hamsi') continue;
        let cr = 0, met = 0, lost = 0, die = 0, big = 0, one = 0, Tend = 0;
        for (let r = 0; r < RUNS; r++) {
          const rr = mulberry((SEED + r * 977 + q * 31 + moonId.length) >>> 0);
          const sp = replaySpawns(moonId, q, scaled, rr, style);
          cr += sp.list.length; Tend += sp.T;
          let dmg = 0, mx = 0, hp = 100, dead = false, os = false;
          for (const c of sp.list) {
            if (rr() > P_ENC) continue;
            met++;
            const n = cstats(c.id, q, scaled);
            const dd = fightDamage(c.id, q, scaled, rr);
            dmg += dd; mx = Math.max(mx, n.dmg >= 900 || dd >= 45 ? Math.max(n.dmg, 1) : 0);
            if (n.dmg >= 100 && dd > 0) os = true;
            hp -= dd; if (hp <= 0) dead = true;
          }
          lost += Math.min(dmg, 100); die += dead ? 1 : 0; big += mx >= 45 ? 1 : 0; one += os ? 1 : 0;
        }
        console.log(pad(moonId, 10), pad(q, 3), pad(mode, 12), rpad(f2(cr / RUNS, 1), 10), rpad(f2(met / RUNS, 1), 6), rpad(f2(lost / RUNS, 1), 8), rpad(f2(100 * die / RUNS, 1) + '%', 8), rpad(f2(100 * big / RUNS, 1) + '%', 11), rpad(f2(100 * one / RUNS, 1) + '%', 8), rpad(scaled ? f2(Tend / RUNS, 0) : '-', 6));
      }
    }
  }
}
