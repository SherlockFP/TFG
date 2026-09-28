// Node test for SECURED LOOT rules (no browser):  node tools/harness/secureloot.test.mjs
// tool -> container matrix, timings by tier, drill jam odds, fallback paths, spawn counts by sector, loot floors, seeded determinism,
// plus the balance table (expected value of a container vs the tool price) that docs/wave2/secureloot.md quotes.
import * as C from '../../src/game/secureloot_core.js';
import { ITEMS, registerItem } from '../../src/game/items.js';
import { RECIPES } from '../../src/game/recipes.js';
import { TIER_ORDER, TIERS } from '../../src/game/tiers.js';
import { RNG } from '../../src/core/rng.js';

C.registerSecureItems();
C.registerSecureRecipes();
// forge shards live in forge.js (browser): register the same definitions so the loot catalog sees them
const { SHARD_DEFS } = await import('../../src/game/enhance.js');
for (const s of SHARD_DEFS) if (!ITEMS[s.id]) registerItem({ id: s.id, name: s.name, kind: 'component', component: true, value: s.value, weight: 0.3, hands: 1, tier: s.tier, forge: true });
// the crowbar lives in weapons.js (needs the browser); mirror its relevant fields
if (!ITEMS.crowbar) registerItem({ id: 'crowbar', name: 'Crowbar', kind: 'weapon', weight: 6, hands: 1, dmg: 18, cd: 0.55, reach: 2.1, pry: 5, rarity: 'uncommon' });

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const E = (id, tier = 'common') => ({ id, def: ITEMS[id], tier });
const pick = (kind, held, owned = []) => C.chooseMethod(kind, held ? E(held) : null, owned.map((o) => E(o)));
const mid = (kind, held, owned) => pick(kind, held, owned).method?.id || null;

// ---------------------------------------------------------------- registration
ok(C.TOOL_IDS.every((id) => ITEMS[id] && ITEMS[id].kind === 'tool' && ITEMS[id].shop === 'tools' && ITEMS[id].price > 0), '5 tools registered, all sold in the Company Store tools category');
ok(ITEMS.sl_drill.hands === 2 && ITEMS.sl_drill.weight >= 20, 'the drill is heavy and two-handed');
ok(ITEMS.sl_note && !ITEMS.sl_note.price, 'Code Slip exists (not for sale)');
ok(C.TOOL_RECIPES.every((r) => RECIPES.some((x) => x.id === r.id) && r.in.every(([id]) => ITEMS[id]) && ITEMS[r.out]), 'every tool is craftable from existing components');
ok(RECIPES.filter((r) => r.id.startsWith('sl_')).length === 5, 'no duplicate recipes after a second registerSecureRecipes()');
C.registerSecureRecipes();
ok(RECIPES.filter((r) => r.id.startsWith('sl_')).length === 5, 'registerSecureRecipes is idempotent');

// ---------------------------------------------------------------- tool -> container matrix
console.log('--- matrix');
ok(mid('case', C.T.CUTTER) === 'cutter', 'glass case + Glass Cutter held -> cutter (quiet)');
ok(mid('case', 'shovel') === 'smash', 'glass case + melee weapon held -> smash (instant, loud)');
ok(mid('case', null, [C.T.CUTTER]) === 'cutter', 'glass case + cutter in the pack -> cutter');
ok(mid('case', 'shovel', [C.T.CUTTER]) === 'smash', 'what you HOLD wins: shovel in hand + cutter in the pack -> smash');
ok(mid('case', null, []) === 'fists', 'glass case with empty hands -> fists (slow, loud): never impossible');
ok(mid('safe', C.T.DRILL) === 'drill', 'safe + Drill -> drill');
ok(mid('safe', 'shovel') === 'bash', 'safe + melee -> bash (32 s, very loud)');
ok(mid('safe', 'shovel', [C.T.NOTE]) === 'code', 'safe + matching Code Slip in the pack beats a melee weapon in hand');
ok(mid('safe', null, []) === null, 'safe with empty hands: no method (needs a tool or ANY melee weapon)');
ok(mid('cage', C.T.BOLT) === 'bolt' && mid('cage', C.T.PICK) === 'pick', 'cage + Bolt Cutters -> bolt, + Lockpick -> pick (minigame)');
ok(mid('cage', 'crowbar') === 'pry' && mid('cage', 'pipe') === 'bash', 'cage + crowbar -> pry (6 s), + pipe -> bash (14 s)');
ok(mid('lockbox', C.T.HACK) === 'hack' && mid('lockbox', null, [C.T.EMP]) === 'emp', 'lockbox + Hack Tool -> hack, EMP charge in the pack -> emp');
ok(mid('lockbox', 'sledge') === 'bash', 'lockbox + sledge -> bash');
const torchNoFuel = pick('vault', C.T.TORCH);
ok(torchNoFuel.method === null && torchNoFuel.missing.some((m) => m.need === C.T.FUEL), 'vault + Torch WITHOUT fuel: nothing works, prompt asks for a Fuel Canister');
ok(mid('vault', C.T.TORCH, [C.T.FUEL]) === 'torch', 'vault + Torch + Fuel Canister -> torch');
ok(mid('vault', 'crowbar') === 'pry' && mid('vault', 'shovel') === 'bash', 'vault + crowbar -> pry (25 s), + shovel -> bash (60 s)');
ok(mid('vault', C.T.CUTTER) === null && mid('safe', C.T.CUTTER) === null && mid('cage', C.T.HACK) === null, 'wrong tools do nothing (cutter on a vault, hack tool on a cage)');
ok(mid('vault', 'shotgun') === null, 'ranged weapons cannot force a container');
// every container has a crude fallback with a plain melee weapon; only the glass case also has fists
for (const k of C.KIND_IDS) ok(!!mid(k, 'shovel'), `${k}: a melee weapon always opens it (crude fallback)`);
ok(C.KIND_IDS.filter((k) => pick(k, null, []).method).join() === 'case', 'only the glass case opens with bare hands');

// ---------------------------------------------------------------- timings by tier
console.log('--- timings');
const T4 = TIER_ORDER.map((t) => C.methodTime(C.methodOf('case', 'cutter'), { tier: t }));
ok(T4[0] === 4 && T4.every((v, i) => i === 0 || v < T4[i - 1]), `glass cutter 4 s Common, faster each tier (${T4.join(' / ')})`);
ok(TIER_ORDER.map((t) => C.methodTime(C.methodOf('cage', 'bolt'), { tier: t }))[0] === 3, 'bolt cutters 3 s at Common');
ok(C.methodTime(C.methodOf('vault', 'torch'), { tier: 'common' }) === 8, 'plasma torch 8 s at Common');
ok(C.methodTime(C.methodOf('vault', 'torch'), { tier: 'mythic' }) < 5.2, 'plasma torch at Mythic is under 5.2 s');
const D = TIER_ORDER.map((t) => C.drillDuration(t));
ok(D.join() === '70,64,58,52,46,40', `drill runs 70 s Common ... 40 s Mythic (${D.join(' / ')})`);
ok(C.methodTime(C.methodOf('case', 'smash'), {}) === 0.4, 'smash is instant (0.4 s hold)');
ok(C.methodTime(C.methodOf('safe', 'bash'), { def: ITEMS.sledge }) < C.methodTime(C.methodOf('safe', 'bash'), { def: ITEMS.shovel }), 'a sledgehammer bashes a safe faster than a shovel');
ok(C.methodTime(C.methodOf('vault', 'bash'), { def: ITEMS.shovel }) === 60 && C.methodTime(C.methodOf('vault', 'pry'), { def: ITEMS.crowbar }) === 25, 'vault crude: 60 s bash, 25 s crowbar');
ok(C.methodTime(C.methodOf('lockbox', 'hack'), {}) === 0 && C.methodTime(C.methodOf('safe', 'drill'), {}) === 0, 'minigame / drill methods have no hold time');
ok(near(C.timeMul('common'), 1) && C.timeMul('mythic') < 0.65, 'timeMul Common 1.0, Mythic ~0.63');
ok(C.chargesFor(ITEMS.sl_glasscutter, 'common') === 6 && C.chargesFor(ITEMS.sl_glasscutter, 'legendary') === 10, 'charges scale with tier (6 -> 10 at Legendary)');

// ---------------------------------------------------------------- drill jam odds
console.log('--- drill jams');
const jamStats = (tier, n = 40000) => {
  const rng = new RNG(0xd21); let any = 0, two = 0, minF = 1, maxF = 0;
  for (let i = 0; i < n; i++) { const j = C.rollJams(rng, tier); if (j.length) any++; if (j.length > 1) two++; for (const f of j) { minF = Math.min(minF, f); maxF = Math.max(maxF, f); } }
  return { any: any / n, two: two / n, minF, maxF };
};
const J0 = jamStats('common'), J5 = jamStats('mythic');
ok(Math.abs(J0.any - 0.25) < 0.012, `Common drill jams in ~25 % of runs (${(J0.any * 100).toFixed(1)} %)`);
ok(Math.abs(J5.any - 0.15) < 0.012, `Mythic drill jams in ~15 % of runs (${(J5.any * 100).toFixed(1)} %)`);
ok(J0.two > 0.02 && J0.two < 0.07 && J0.two < J0.any / 3, `a second jam is rare (${(J0.two * 100).toFixed(1)} % of runs)`);
ok(J0.minF >= 0.2 && J0.maxF <= 0.92, 'jams happen between 20 % and 92 % progress (never at the very start / end)');
ok(C.FIX_TIME > 0 && C.FIX_TIME <= 2, 'clearing a jam takes 1.4 s of holding E');

// ---------------------------------------------------------------- noise + threat numbers
console.log('--- noise');
const ne = (kind, id, sec) => C.noiseEvents(C.methodOf(kind, id), sec);
const drillN = ne('safe', 'drill', 70), torchN = ne('vault', 'torch', 8), cutN = ne('case', 'cutter', 4), boltN = ne('cage', 'bolt', 3);
const thr = (n, m) => { const per = C.noiseOf(m); return (per.burst ? C.threatOfNoise(per.burst) : 0) + Math.floor(n.events - (per.burst ? 1 : 0)) * C.threatOfNoise(per.loud); };
const tDrill = thr(drillN, C.methodOf('safe', 'drill')), tTorch = thr(torchN, C.methodOf('vault', 'torch'));
ok(C.threatOfNoise(C.methodOf('case', 'cutter').noise.loud) === 0, 'the glass cutter is quiet: no Threat at all (below the 0.45 noise floor)');
ok(tDrill > 30 && tDrill < 60, `a full 70 s drill run raises ~${tDrill.toFixed(0)} raw Threat spikes (decays: the Threat meter climbs by about +21 while it runs)`);
ok(tTorch > 5 && tTorch < 12, `an 8 s torch cut raises ~${tTorch.toFixed(1)} raw Threat spikes`);
ok(C.noiseOf(C.methodOf('case', 'smash')).burst > C.noiseOf(C.methodOf('cage', 'bolt')).loud, 'smashing glass is louder than snapping a chain');
ok(cutN.events === 2 && boltN.events === 2, 'cutter / bolt cutters: 2 noise events in a normal cut');

// ---------------------------------------------------------------- spawn counts by sector
console.log('--- spawn plans');
const cat = C.buildCatalog();
const plan = (q, n = 4000, ctx = {}) => {
  const rng = new RNG(0xbeef + q); const kinds = {}; let total = 0, min = 99, max = 0, vaultFac = 0;
  for (let i = 0; i < n; i++) {
    const p = C.planContainers(rng, { quota: q, size: 1, hasVault: false, hasWalls: true, ...ctx });
    total += p.length; min = Math.min(min, p.length); max = Math.max(max, p.length);
    if (p.some((c) => c.kind === 'vault')) vaultFac++;
    for (const c of p) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  }
  return { avg: total / n, min, max, kinds, vaultFac: vaultFac / n, share: (k) => (kinds[k] || 0) / Math.max(1, total) };
};
const P = [0, 1, 2, 3, 4, 6, 9].map((q) => [q, plan(q)]);
for (const [q, p] of P) console.log(`  quota ${q}: avg ${p.avg.toFixed(2)} (min ${p.min}, max ${p.max})  case ${(p.share('case') * 100).toFixed(0)}%  cage ${(p.share('cage') * 100).toFixed(0)}%  lockbox ${(p.share('lockbox') * 100).toFixed(0)}%  safe ${(p.share('safe') * 100).toFixed(0)}%  vault ${(p.share('vault') * 100).toFixed(0)}%  (facilities with a vault crate: ${(p.vaultFac * 100).toFixed(0)}%)`);
const [p0, p1, p2, p3, p4, p6, p9] = P.map((x) => x[1]);
ok(p0.max <= 1 && p0.avg > 0.85, 'quota 0: at most ONE container per facility (usually one)');
ok(p0.share('case') > 0.6 && !p0.kinds.safe && !p0.kinds.lockbox && !p0.kinds.vault, 'quota 0: mostly glass cases, no safes / lockboxes / vault crates');
ok(p1.min >= 1 && p1.max <= 2, 'quota 1: 1-2 containers');
ok(p2.min >= 2 && p2.max <= 3, 'quota 2: 2-3 containers');
ok(p3.min >= 2 && p3.max <= 4 && p4.min >= 3 && p4.max <= 5, 'quota 3: 2-4, quota 4: 3-5 containers');
ok(p6.max <= C.MAX_PER_FACILITY && p9.max <= C.MAX_PER_FACILITY, 'never more than 5 per facility, even in the deepest sectors');
ok(!p2.kinds.vault && p3.kinds.vault > 0 && p4.share('vault') < p6.share('vault'), 'vault crates only from quota 3, more common deeper');
ok(p9.share('safe') > p1.share('safe') && p9.share('case') < p0.share('case') / 2, 'deeper sectors: more safes, far fewer glass cases');
ok(plan(2, 2000, { size: 1.8 }).avg > p2.avg + 0.9 && plan(4, 2000, { size: 1.8 }).max === 5, 'big facilities (size >= 1.6) get +1 container (capped at 5)');
ok(plan(0, 500, { size: 2 }).max <= 1, 'quota 0 stays at <= 1 container even in a big facility');
ok(plan(3, 3000, { hasVault: true }).share('vault') > p3.share('vault') * 1.8, 'a facility with a vault room makes vault crates more likely');
const a = C.planContainers(new RNG(77), { quota: 4, size: 1.3, hasWalls: true }), b = C.planContainers(new RNG(77), { quota: 4, size: 1.3, hasWalls: true });
ok(JSON.stringify(a) === JSON.stringify(b), 'planContainers is deterministic for a seed');
ok(C.planContainers(new RNG(5), { quota: 4, hasWalls: false }).every((c) => c.kind !== 'safe' || c.variant === 'floor'), 'no wall spots -> only floor safes');

// ---------------------------------------------------------------- loot: floors, determinism, shards / tools sometimes
console.log('--- loot');
const contents = (kind, q, n = 3000) => { const out = []; for (let i = 0; i < n; i++) out.push(...C.rollContents(kind, new RNG(C.lootSeed(1234 + i, 'a' + (i % 5))), { quota: q, catalog: cat })); return out; };
const floorOK = (kind, q) => { const f = TIER_ORDER.indexOf(C.floorTier(kind, q)); return contents(kind, q, 400).every((e) => !e.tier || TIER_ORDER.indexOf(e.tier) >= f); };
ok(['case', 'cage', 'safe', 'lockbox', 'vault'].every((k) => floorOK(k, 0) && floorOK(k, 4)), 'every rolled item respects the container tier floor (components carry no tier)');
ok(C.floorTier('case', 0) === 'uncommon' && C.floorTier('safe', 0) === 'rare' && C.floorTier('vault', 4) === 'epic' && C.floorTier('case', 3) === 'rare', 'floors: case Uncommon, safe Rare, vault Epic; cases step up to Rare from quota 3');
ok(C.floorTier('vault', 9) === 'epic' && C.floorTier('safe', 6) === 'epic', 'floors never exceed Epic');
const x1 = JSON.stringify(C.rollContents('safe', new RNG(C.lootSeed(9, 's1')), { quota: 2, catalog: cat })), x2 = JSON.stringify(C.rollContents('safe', new RNG(C.lootSeed(9, 's1')), { quota: 2, catalog: cat }));
ok(x1 === x2, 'contents are deterministic per (world seed, container id): every peer sees the same item in the display case');
ok(C.rollContents('case', new RNG(3), { quota: 0, catalog: cat }).length === 1, 'a glass case holds exactly one showpiece');
const vaults = Array.from({ length: 200 }, (_, i) => C.rollContents('vault', new RNG(i + 1), { quota: 4, catalog: cat }));
ok(vaults.every((v) => v.length >= 3 && v.length <= 5) && vaults.every((v) => v.some((e) => ITEMS[e.type]?.kind === 'weapon' || /^(skillbook|bag_|spellbook|blueprint)/.test(e.type))), 'a vault crate holds 3-5 items incl. a gear piece (weapon / bag / skillbook)');
const allSafe = contents('safe', 3, 3000), allBox = contents('lockbox', 3, 3000);
const share = (list, re) => list.filter((e) => re.test(e.type)).length / list.length;
ok(share(allSafe, /^shard_/) > 0.05 && share(allBox, /^shard_/) > 0.1, `shards drop from safes (${(share(allSafe, /^shard_/) * 100).toFixed(0)} %) and lockboxes (${(share(allBox, /^shard_/) * 100).toFixed(0)} %)`);
ok(contents('vault', 4, 1000).some((e) => C.TOOL_IDS.includes(e.type)) || contents('lockbox', 4, 3000).some((e) => C.TOOL_IDS.includes(e.type)), 'breaching tools are found in containers (rare)');
const toolShare = share(contents('cage', 2, 6000), /^sl_/);
ok(toolShare > 0 && toolShare < 0.06, `found breaching tools stay rare (${(toolShare * 100).toFixed(1)} % of cage items)`);
ok(C.safeCode(7, 's1') === C.safeCode(7, 's1') && /^\d{4}$/.test(C.safeCode(7, 's1')) && C.safeCode(7, 's1') !== C.safeCode(7, 's2'), 'safe codes are 4 digits and deterministic');
const slips = Array.from({ length: 2000 }, (_, i) => C.hasCodeSlip(i, 's1')).filter(Boolean).length / 2000;
ok(Math.abs(slips - 0.65) < 0.05, `~65 % of safes have a Code Slip lying in the facility (${(slips * 100).toFixed(0)} %)`);

// ---------------------------------------------------------------- balance table: value gained per use vs tool price
console.log('--- balance table (quota 2 loot, moon valueMul 1.12; sell = scrap that counts for the quota, util = tools / gear / components at 50 % price)');
const evOf = (kind, q, n = 6000) => {
  let sell = 0, util = 0, cnt = 0;
  const vm = 1 + q * 0.06;
  for (let i = 0; i < n; i++) { const c = C.rollContents(kind, new RNG(1000 + i * 7 + q), { quota: q, catalog: cat }); const v = C.valueOfContents(c, vm); sell += v.sell; util += v.util; cnt += c.length; }
  return { sell: sell / n, util: util / n, items: cnt / n };
};
// average plain facility scrap for comparison
const scrapAvg = (() => { let s = 0, n = 0; for (const [id, d] of Object.entries(ITEMS)) if (d.kind === 'scrap' && d.value && id !== 'key' && d.hands === 1) { s += (d.value[0] + d.value[1]) / 2; n++; } return s / n; })();
console.log(`  average plain scrap item ~ ${scrapAvg.toFixed(0)} credits`);
const rows = [
  ['case', 'cutter', C.T.CUTTER, 4], ['cage', 'bolt', C.T.BOLT, 3], ['lockbox', 'hack', C.T.HACK, 0], ['safe', 'drill', C.T.DRILL, 70], ['vault', 'torch', C.T.TORCH, 8],
];
const tbl = [];
for (const [kind, mid_, tool, sec] of rows) {
  const ev = evOf(kind, 2), def = ITEMS[tool], perUse = def.price / def.charges + (mid_ === 'torch' ? (ITEMS.comp_fuel.value[0] + ITEMS.comp_fuel.value[1]) / 2 : 0);
  const m = C.methodOf(kind, mid_), ne_ = sec ? C.noiseEvents(m, sec) : { events: 0, loudSum: 0 };
  const crude = C.METHODS[kind].find((x) => x.crude && !x.fists);
  tbl.push({ kind, tool: def.name, price: def.price, uses: def.charges, perUse: +perUse.toFixed(1), evSell: Math.round(ev.sell), evUtil: Math.round(ev.util), items: +ev.items.toFixed(1), noise: ne_.events, crude: `${crude.id} ${crude.base}s` });
  console.log(`  ${kind.padEnd(8)} ${def.name.padEnd(16)} price ${String(def.price).padStart(3)} / ${def.charges} uses = ${perUse.toFixed(0).padStart(3)} per use | loot EV sell ${String(Math.round(ev.sell)).padStart(4)} + util ${String(Math.round(ev.util)).padStart(4)} (${ev.items.toFixed(1)} items) | noise events ${ne_.events} | crude: ${crude.id} ${crude.base} s`);
  ok(ev.sell + ev.util > perUse * 2.5, `${def.name}: a use costs ${perUse.toFixed(0)}, the container is worth ${Math.round(ev.sell + ev.util)} (pays for itself several times)`);
}
const evCase = evOf('case', 0), evCage0 = evOf('cage', 0);
ok(evCase.sell > scrapAvg * 1.3, `quota 0 glass case beats an average scrap item (${Math.round(evCase.sell)} vs ${scrapAvg.toFixed(0)})`);
ok(evOf('vault', 4).sell > evOf('safe', 4).sell * 1.4 && evOf('safe', 4).sell > evOf('cage', 4).sell * 0.9, 'value ladder: vault crate > safe >= cage');
ok(tbl.every((r) => r.price / r.uses < (r.evSell + r.evUtil) * 0.35), 'no tool costs more than 35 % of one container per use');
ok(ITEMS.sl_drill.price / ITEMS.sl_drill.charges > ITEMS.sl_glasscutter.price / ITEMS.sl_glasscutter.charges * 5, 'the drill costs far more per use than the glass cutter (it is the strong tool)');
console.log('  (evCase quota0 ' + Math.round(evCase.sell) + ', evCage quota0 ' + Math.round(evCage0.sell) + ')');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
