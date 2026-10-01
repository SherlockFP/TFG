// Reproducible contact sheet from the production fleet illustration helper.
import fs from 'node:fs/promises';
import { fleetPreview13 } from '../../src/game/fleet13_preview.js';
import { FLEET13, fleetLayout } from '../../src/game/fleet13_core.js';
const folder=new URL('../../docs/wave30/artifacts/',import.meta.url);
let cards='';
Object.entries(FLEET13).forEach(([id,def],i)=>{
 const x=18+(i%2)*378,y=18+Math.floor(i/2)*236;
 const svg=fleetPreview13(fleetLayout(id),def.name).replace(/style="[^"]*"/,'width="360" height="190"');
 cards+=`<g transform="translate(${x},${y})"><text x="0" y="17" fill="#d9d2bd" font-family="monospace" font-size="16">${def.name} · ${def.price||'FREE'}</text><g transform="translate(0,28)">${svg}</g></g>`;
});
await fs.mkdir(folder,{recursive:true});
await fs.writeFile(new URL('fleet-previews.svg',folder),`<svg xmlns="http://www.w3.org/2000/svg" width="774" height="490" viewBox="0 0 774 490"><rect width="774" height="490" fill="#11181b"/>${cards}</svg>`);
console.log('docs/wave30/artifacts/fleet-previews.svg');
