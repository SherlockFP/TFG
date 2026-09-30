// TFG threat-pacing simulator (wave 12, docs/wave12/balance12.md):  node tools/sim/pacing12.mjs [--runs N] [--seed S]
// Uses the REAL data: threatpool.poolFor (which headline creatures a moon holds this quota), creatures.spawnTable (weights after the pool cut),
// the wave 10 / 11 registration (EXTRA_SPAWNS, min-quota gates), crdirector_core.capOf (threat budget) and events11_core.rollCrisis.
// "new" = the 11 wave 10 / 11 threats (creatures10 x3, creatures11 x3, swarm11 x3 + the Scraper colony). Prints, per quota index:
//   pool: mean number of new creatures in a moon's 3-creature pool, P(>=1), P(>=2), P(3)
//   table: share of the indoor spawn-table weight that belongs to a new creature the spawner may roll at that quota (min-quota gate applied)
//   power: mean threat points of the pool's new creatures (each maxAlive 1) against the director's peak cap for the moon
//   crisis: chance that a landing rolls a facility crisis (events11)
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RUNS = +argv('--runs', 400), SEED = argv('--seed', 'p12');

const { MOONS } = await import('../../src/game/moons.js');
await import('../../src/game/moons10_core.js');
const { CREATURES, spawnTable } = await import('../../src/game/creatures.js');
const TP = await import('../../src/game/threatpool.js');
const C10 = await import('../../src/game/creatures10_core.js'), C11 = await import('../../src/game/creatures11_core.js'), S11 = await import('../../src/game/swarm11_core.js');
(await import('../../src/game/creatures10_ai.js')).registerC10Content();
(await import('../../src/game/creatures11_ai.js')).registerC11Content();
(await import('../../src/game/swarm11_ai.js')).registerSw11Content();
const { capOf } = await import('../../src/game/crdirector_core.js');
const E11 = await import('../../src/game/events11_core.js');

const NEW = new Set(['c10_buffering', 'c10_doomscroller', 'c10_ratio', 'c11_captcha', 'c11_shadowban', 'c11_recommender', 'sw_scraper', 'sw_streamer', 'sw_automod']);
const allowed = (id, q) => (id.startsWith('c10_') ? C10.quotaAllows(id, q) : id.startsWith('c11_') ? C11.quotaAllows(id, q) : id.startsWith('sw_') ? S11.quotaAllows(id, q) : true);
const MOON_IDS = ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos', 'x8feed', 'x503'];
const QS = [0, 1, 2, 3, 4, 5, 6, 8];
const f = (v, n = 2) => v.toFixed(n), pad = (s, n) => String(s).padStart(n);

console.log(`TFG threat pacing (real pools + spawn tables), runs/moon/quota = ${RUNS}`);
console.log('\nq | new in pool (mean) | P>=1  P>=2  P=3 | table share new % | pool new power / cap | crisis/landing');
const perMoon = {};
for (const q of QS) {
  let sumN = 0, p1 = 0, p2 = 0, p3 = 0, share = 0, pow = 0, over = 0, k = 0;
  for (const id of MOON_IDS) {
    const m = MOONS[id]; if (!m) continue;
    let mn = 0, mshare = 0;
    for (let i = 0; i < RUNS; i++) {
      const run = { runId: SEED + i, quotaIndex: q };
      const pool = TP.poolFor(run, m);
      const nn = pool.ids.filter((x) => NEW.has(x)).length;
      const tb = spawnTable(m, 'in', run);
      let tot = 0, nw = 0;
      for (const [cid, w] of Object.entries(tb)) { if (!CREATURES[cid]) continue; if (!allowed(cid, q)) continue; tot += w; if (NEW.has(cid)) nw += w; }
      sumN += nn; mn += nn; mshare += tot ? nw / tot : 0; share += tot ? nw / tot : 0;
      if (nn >= 1) p1++; if (nn >= 2) p2++; if (nn >= 3) p3++;
      let pw = 0; for (const x of pool.ids) if (NEW.has(x)) pw += CREATURES[x]?.power || (x === 'sw_scraper' ? 1.2 : 0);
      pow += pw / capOf({ q, tier: m.tier }); if (pw > capOf({ q, tier: m.tier })) over++;
      k++;
    }
    (perMoon[id] ||= {})[q] = { n: mn / RUNS, share: mshare / RUNS };
  }
  let cr = 0, cn = 0;
  for (let i = 0; i < 1200; i++) { for (const day of [1, 2, 3]) { if (E11.rollCrisis({ runId: SEED + i, day, moon: 'hamsi', quotaIndex: q, facility: true })) cr++; cn++; } }
  console.log(`${q} | ${pad(f(sumN / k), 18)} | ${f(p1 / k)}  ${f(p2 / k)}  ${f(p3 / k)} | ${pad(f(100 * share / k, 1), 17)} | ${pad(f(pow / k), 12)} (P over cap ${f(over / k)}) | ${f(cr / cn)}`);
}
console.log('\nper moon, mean new creatures in the pool / table share % at q0 q1 q2 q3 q4');
for (const id of MOON_IDS) console.log(id.padEnd(8), [0, 1, 2, 3, 4].map((q) => `${f(perMoon[id][q].n, 2)} / ${f(100 * perMoon[id][q].share, 1)}%`).join('   '));
