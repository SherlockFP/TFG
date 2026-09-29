// [ux] node check: every wave-3 outfit builds on the avatar rig without throwing and adds meshes; unlock rules / prices exist.
//   node tools/harness/ux_suits.test.mjs
const { OUTFITS } = await import('../../src/models/cosmetics.js');
const { createAvatar } = await import('../../src/models/avatar.js');
const cos = await import('../../src/game/cosmetics.js');
const ids = ['modarmor', 'datamonk', 'astro_lunar', 'astro_mars', 'astro_deep', 'soviet', 'tracksuit', 'samurai', 'knight', 'cyberninja', 'viking', 'agent'];
let bad = 0;
const warn = console.warn; let warned = 0; console.warn = (...a) => { warned++; warn(...a); };
const av = createAvatar({});
for (const id of ids) {
  const def = OUTFITS.find((o) => o.id === id);
  if (!def) { console.log('MISSING outfit', id); bad++; continue; }
  let n0 = 0, n1 = 0;
  av.setLook?.({ suit: 'orange' });
  av.root.traverse(() => n0++);
  av.setLook?.({ suit: id });
  av.update?.(0.016, { speed: 0, time: 1 });
  av.root.traverse(() => n1++);
  const key = 'suit:' + id;
  const how = cos.PRICES[key] ? 'price ' + cos.PRICES[key] : (cos.ruleMet({ level: 1 }, key) === false ? 'rule' : 'rule?');
  const ok = n1 > n0 && (cos.PRICES[key] || cos.progressOf({ level: 1, stats: {}, codex: {}, fun: {} }, key));
  console.log(ok ? 'ok ' : 'BAD', id, 'nodes', n0, '->', n1, how);
  if (!ok) bad++;
}
if (warned) bad++;
console.log(bad ? 'FAILED' : 'all suits ok');
process.exit(bad ? 1 : 0);
