// Turns the JSON printed by wave6_home3.js (headless_shots.mjs stdout) into jpg files.  node tools/harness/wave6_home3_save.mjs /tmp/h3.json docs/wave6/home3
import fs from 'fs';
const [, , src, dst] = process.argv;
const txt = fs.readFileSync(src, 'utf8'), i = txt.indexOf('{'), j = txt.lastIndexOf('\nLOGS');
const o = JSON.parse(txt.slice(i, j > 0 ? j : undefined));
fs.mkdirSync(dst, { recursive: true });
for (const [k, v] of Object.entries(o.jpg || {})) { const b = Buffer.from(v.split(',')[1], 'base64'); fs.writeFileSync(`${dst}/${k}.jpg`, b); console.log(k, Math.round(b.length / 1024) + ' KB'); }
delete o.jpg; console.log(JSON.stringify(o));
