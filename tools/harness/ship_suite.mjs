// wave 5 ship_interior: runs every node suite that touches the ship and prints the last line + failures of each.
//   node tools/harness/ship_suite.mjs [suite ...]
import { fileURLToPath } from 'node:url';   // .pathname gives /D:/... on Windows
import { spawnSync } from 'node:child_process';
const list = process.argv.slice(2).length ? process.argv.slice(2) : ['ship2_overlap', 'ship2_hull', 'ship2_install', 'shipyard', 'shipyard_install', 'shipyard_models', 'survival', 'survival_install', 'polish4', 'polish4_install', 'cycle3', 'cycle3_flow', 'arcade', 'food', 'food_install', 'pets', 'pets_sim', 'gameplay2'];
for (const t of list) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(`./${t}.test.mjs`, import.meta.url))], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout + r.stderr).trim().split('\n');
  const fails = out.filter((l) => /FAIL|✗|not ok|Error/.test(l)).slice(0, 6);
  console.log(`${t}: exit ${r.status} | ${out.slice(-1)[0]?.slice(0, 160)}`);
  for (const f of fails) console.log('    ' + f.slice(0, 220));
}
