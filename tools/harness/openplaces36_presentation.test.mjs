// Actual HUD/installed display callbacks, not a duplicate model of the strings.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import { HUD } from '../../src/ui/hud.js';
import { MOONS } from '../../src/game/moons.js';
import { admitOpenPlaces35 } from '../../src/game/openplaces35.js';
import { setLang, t } from '../../src/core/i18n.js';
import { Emitter, errLog } from '../../src/core/events.js';
import { register } from 'node:module';
import * as THREE from 'three';
setLang('en');
const classes = () => { const s = new Set(['hidden']); return { contains:k=>s.has(k), add(...a){a.forEach(k=>s.add(k));},remove(...a){a.forEach(k=>s.delete(k));},toggle(k,v){v?s.add(k):s.delete(k);} }; };
function node(){return {style:{},dataset:{},classList:classes(),children:[],innerHTML:'',textContent:'',append(...a){this.children.push(...a);},appendChild(n){this.children.push(n);},remove(){},querySelector(s){return this.children.find(n=>'.'+n.className===s)||null;}};}
function fixture(moon='lufer'){
 const run={phase:'landing',moon,seed:1235,day:1,quotaIndex:0,daysLeft:3,runId:'wave36'};
 run.openPlaces35=admitOpenPlaces35(run,MOONS[moon]);
 const game={run,world:{moonId:moon,seed:1235,facility:null},player:{dead:false,indoor:true},stateTimer:2,mods:new Emitter(),isHost:false};
 const h=Object.create(HUD.prototype);h.run=run;h.$={brief:node()};h.el=node();game.ui={hud:h};
 return {game,h,run};
}
const f=fixture();f.h.buildBrief(f.game);
assert.match(f.h.$.brief.innerHTML,/<b>Empty Concourse<\/b>/,'native landing briefing must describe the admitted concourse rather than the old greenhouse');
console.log('PASS actual pending landing HUD name');
const {openPlacePresentation36}=await import('../../src/game/openplaces36_text.js');
const {installCollection}=await import('../../src/game/collection.js');
const {installFacjobs}=await import('../../src/game/facjobs.js');
const {installLabyrinths}=await import('../../src/game/labyrinths.js');
const token=r=>`${r.moon}:${r.seed}:${r.day}`;
const built=(kind='concourse')=>({layout:{theme:kind==='reception'?'backrooms':'greenhouse',seed:3009,open35:{version:35,kind,publicRooms:[1]}}});
for(const lang of ['en','tr','ru']){
 f.game.world.facility=null;setLang(lang);f.h.buildBrief(f.game);assert.ok(f.h.$.brief.innerHTML.includes(`<b>${t('Empty Concourse')}</b>`));
 for(const kind of ['courtyard','concourse','reception']){
  f.game.world.facility=built(kind);const place=openPlacePresentation36(f.run,f.game.world,MOONS.lufer);
  for(const k of ['name','layout','hint'])assert.ok(t(place[k]) && (lang==='en'||t(place[k])!==place[k]),`${lang}/${kind}/${k} translated`);
 }
}
setLang('en');f.game.world.facility=null;
for(const patch of [{day:2},{moon:'hamsi'},{seed:1240},{phase:'orbit'}])assert.equal(openPlacePresentation36({...f.run,...patch},null,MOONS.lufer),null,'stale/unloaded admission cannot rename a map');
for(const k of ['arena','labyrinth','wings'])assert.equal(openPlacePresentation36(f.run,null,{...MOONS.lufer,layoutOpts:{[k]:true}}),null);
assert.equal(openPlacePresentation36(f.run,null,{...MOONS.lufer,company:true}),null);
f.game.world.facility={layout:{theme:'greenhouse'}};
assert.equal(openPlacePresentation36(f.run,f.game.world,MOONS.lufer),null,'actual legacy map wins over pending receipt');
f.h.buildBrief(f.game);assert.ok(f.h.$.brief.innerHTML.includes('<b>Link Rot Greenhouse</b>'));
const deep={...f.run,descent21:{token:token(f.run),depth:3,routeVersion:35,currentChoice:{theme:'backrooms'}}};
assert.equal(openPlacePresentation36(deep,null,MOONS.lufer).kind,'reception');
assert.equal(openPlacePresentation36({...deep,descent21:{...deep.descent21,routeVersion:26}},null,MOONS.lufer),null);
assert.equal(openPlacePresentation36({...deep,descent21:{...deep.descent21,currentChoice:{theme:'office'}}},null,MOONS.lufer),null);
console.log('PASS translations, actual legacy authority, stale/unsupported admission and old/deep route boundaries');

// Pending -> built replacement can alter its label during landing without replaying every frame.
f.game.world.facility=null;f.h.updateBrief(.1,f.game);
let builds=0;const build=f.h.buildBrief.bind(f.h);f.h.buildBrief=g=>{builds++;build(g);};
f.h.updateBrief(.1,f.game);assert.equal(builds,0);
f.game.world.facility={layout:{theme:'greenhouse'}};f.h.updateBrief(.1,f.game);assert.equal(builds,1);
assert.ok(f.h.$.brief.innerHTML.includes('Link Rot Greenhouse'));
f.game.director={chaseLevel:()=>.8};f.game.world.facility=built();f.h.updateBrief(.1,f.game);assert.equal(builds,1);assert.equal(f.h.briefOn,false);
f.game.director.chaseLevel=()=>0;f.h.updateBrief(.1,f.game);assert.equal(builds,2);assert.ok(f.h.$.brief.innerHTML.includes('<b>Empty Concourse</b>'));
console.log('PASS actual HUD transition cache and threatened briefing pause');

const doc=globalThis.document, grid=node();globalThis.document={...doc,createElement:()=>node(),querySelector:s=>s==='.br-card .br-grid'?grid:null};
const errBefore=errLog.total;
const oldAPI=window.KefalAPI;let jobsCommand;window.KefalAPI={registerCommand(k,fn){if(k==='jobs')jobsCommand=fn;}};
const fj=installFacjobs(f.game),lab=installLabyrinths(f.game);
f.game.mods.emit('update',0,f.game);
assert.equal(errLog.total,errBefore);
assert.ok(grid.children.some(n=>n.className==='fj-row'&&n.children[0].textContent==='LAYOUT'&&n.children[1].textContent==='Open shopping hall'));
assert.equal(grid.children.filter(n=>n.className==='lab-row').length,0,'no imaginary vine hazard in built concourse');
let jobsText='';assert.ok(jobsCommand);jobsCommand('',{print:s=>{jobsText=s;}});
assert.ok(jobsText.includes('LAYOUT: Open shopping hall'));assert.ok(jobsText.includes('MAIN:'));
console.log('PASS actual registered jobs terminal describes the built place and retains its job');
grid.children=[];f.game.world.facility={layout:{theme:'greenhouse'}};f.game.mods.emit('update',0,f.game);
assert.ok(grid.children.some(n=>n.className==='lab-row'),'legacy greenhouse still describes its native hazard');
fj.dispose();lab.dispose();globalThis.document=doc;window.KefalAPI=oldAPI;
console.log('PASS installed native job/hazard display callbacks and legacy positive control');

f.run.phase='moon';f.game.world.facility=built();f.game.profile={};f.game.progress={save(){}};
let toast='';f.game.ui.toast=s=>{toast=s;};f.game.onItemHeld=()=>{};
const col=installCollection(f.game);f.game.mods.emit('update',.1,f.game);
assert.ok(toast.includes('Empty Concourse'));assert.equal(f.game.profile.codex.interiors.greenhouse.n,1);
assert.equal(f.game.profile.codex.interiors.concourse,undefined,'native Codex save key stays greenhouse');
f.game.mods.emit('update',.1,f.game);assert.equal(f.game.profile.codex.interiors.greenhouse.n,1);
col.dispose();console.log('PASS actual Codex toast with stable once-only theme save identity');

// Actual Backrooms builder/update creates its normal caption dock and retains level identity.
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
const {initPhysics,Physics}=await import('../../src/physics/physics.js');
const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
const {LightPool}=await import('../../src/render/lightpool.js');
const {installBackroomsLevels}=await import('../../src/game/brlevels.js');
await initPhysics();const physics=new Physics(),lights=new LightPool(new THREE.Scene());
for(const open of [true,false]){
 const L=generateLayout(1235,'backrooms',1,open?{open35:'reception'}:null),fac=buildFacility(L,{physics,lightPool:lights});
 const room=L.rooms.find(r=>open?L.open35.publicRooms.includes(r.id):r.type==='yellow_room');
 const g={world:{moonId:'lufer',seed:1235,facility:fac},run:{phase:'moon',moon:'lufer',seed:1235,day:1,daysLeft:3,quotaIndex:0},player:{indoor:true,dead:false,pos:new THREE.Vector3(L.ox+(room.x+room.w/2)*L.cell,L.y+.1,L.oz+(room.z+room.h/2)*L.cell)},mods:new Emitter(),env:{},lights,engine:{fx:{}},time:0};
 const nodes=[];globalThis.document={...doc,getElementById:()=>null,createElement:tag=>{if(tag==='canvas')return doc.createElement(tag);const n=node();n.isConnected=true;n.insertBefore=x=>n.children.push(x);n.querySelector=s=>n.children.find(x=>'.'+x.className===s)||null;Object.defineProperty(n,'innerHTML',{set(v){this.html=v;if(v.includes('br-rec'))for(const k of ['br-rec','br-t','br-s']){const q=node();q.className=k;this.children.push(q);}},get(){return this.html||'';}});nodes.push(n);return n;}};
 const before=errLog.total,api=installBackroomsLevels(g);g.mods.emit('update',.1,g);g.mods.emit('update',4,g);
 assert.equal(errLog.total,before,'actual Backrooms caption callback has no swallowed errors');
 const cap=nodes.find(n=>n.dataset.dockId==='br-caption');assert.ok(cap);
 const title=cap.querySelector('.br-t').textContent;
 assert.equal(api.current,'l0');assert.equal(open,title==='Reception Atrium');
 if(open)assert.ok(cap.querySelector('.br-s').textContent.includes('lift'));
 api.dispose();fac.dispose(physics);globalThis.document=doc;
}
physics.dispose();console.log('PASS actual reception/legacy Backrooms captions with native level identity');
console.log('openplaces36_presentation: 7 PASS groups; native callbacks, no human-play or rendered claim');
