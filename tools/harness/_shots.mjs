// extract the jpeg data URLs from a headless.mjs JSON dump:  node tools/harness/_shots.mjs <headless-output.txt> <out-dir>
// prints the JSON without the image payloads
import fs from 'fs';
const [file, dir] = process.argv.slice(2);
const txt = fs.readFileSync(file, 'utf8');
const a = txt.indexOf('{'), b = txt.lastIndexOf('\nLOGS');
const json = JSON.parse(txt.slice(a, b > 0 ? b : undefined));
fs.mkdirSync(dir, { recursive: true });
for (const [k, v] of Object.entries(json.shots || {})) fs.writeFileSync(`${dir}/${k}.jpg`, Buffer.from(String(v).split(',')[1], 'base64'));
delete json.shots;
console.log(JSON.stringify(json, null, 1));
console.log(txt.slice(txt.lastIndexOf('LOGS')));
