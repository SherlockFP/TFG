// NATIVE_INTEGRATION: real modules, facility builders/Rapier and hearing rows.
// Player/noise/time fixtures are controlled; this is not browser or human play.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {Emitter,errLog} from '../../src/core/events.js';
import {Physics,initPhysics} from '../../src/physics/physics.js';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {CREATURES} from '../../src/game/creatures.js';
import {hostMethods} from '../../src/game/host.js';
import {RNG} from '../../src/core/rng.js';
import {MOONS} from '../../src/game/moons.js';
import {newDescent} from '../../src/game/descent21_state.js';
import {floorSpec,savedFloorSpec} from '../../src/game/descent21_core.js';
import {installDescent21Threats} from '../../src/game/descent21_threats.js';
import {installBackroomsLevels} from '../../src/game/brlevels.js';
import {installBackroomsCreatures} from '../../src/game/creatures_backrooms.js';
import {installBackrooms} from '../../src/game/backrooms.js';
import {installLiminal26,LIMINAL26} from '../../src/game/liminal26.js';
import {registerStealthContent} from '../../src/game/stealth.js';
await initPhysics();registerStealthContent();
const oldCreate=document.createElement;
document.createElement=(...args)=>{const el=oldCreate(...args),parts=new Map();el.querySelector=k=>{if(!parts.has(k))parts.set(k,{textContent:'',style:{},classList:{add(){},remove(){}}});return parts.get(k);};return el;};
window.__kefalMods={itemModels:new Map(),creatureModels:new Map()};window.KefalAPI={THREE};
const physics=new Physics(),scene=new THREE.Scene(),ambient=new THREE.AmbientLight(0xffffff,.12);
const messages=[],handlers=new Map(),audioCalls=[],spawned=[];
const lights={ambient,globalDim:1,add:e=>e,remove(){}};
let fac=buildFacility(generateLayout(17,'factory',.8),{physics,lightPool:lights});scene.add(fac.group);
const run={phase:'moon',moon:'hamsi',seed:17,day:1,quotaIndex:0,daysLeft:3,time:480};run.descent21=newDescent(run);
const player={id:'crew',pos:new THREE.Vector3(0,fac.layout.y+.1,0),dead:false,zone:'in',indoor:true,inShip:false,noise:0,voice:0};
const peers=[player];let pressure=0;
const game={isHost:true,selfId:'crew',time:0,run,world:{facility:fac,outdoor:{}},physics,scene,engine:{scene,fx:{noise:0}},camera:{position:player.pos},player,remotes:new Map(),mods:new Emitter(),config:{},profile:{bestiary:{}},env:{},lights,
 audio:{ctx:null,buffers:new Map(),play(){},setAmbience(...a){audioCalls.push(a);}},ui:{hud:{},toast(){}},balance:{onNoise(){pressure++;},scale:()=>({hp:1,dmg:1,speed:1,detect:1})},hostData:{powerUsed:0},rollLevel:()=>1,rollElite:()=>false,aiPlayers:()=>peers,aiPlayerById:id=>peers.find(p=>p.id===id),hostEarlySafeFilter:()=>null,indoorBudget:()=>6,hostSpawnCreatureIndoor:hostMethods.hostSpawnCreatureIndoor,hostSpawnWave:hostMethods.hostSpawnWave,updateAmbience(){},later:()=>0,broadcastRun(){},
 items:{all:()=>[].values(),hostSpawn(...a){spawned.push(a);return `fixture${spawned.length}`;}},
 net:{hostId:'crew',hostEpoch:0,broadcast(type,d){messages.push({type,d:structuredClone(d)});},sendTo(to,type,d){messages.push({to,type,d:structuredClone(d)});},request(type,d){handlers.get(type)?.(d,'crew');},on_(type,fn){this.listeners??=new Map();this.listeners.set(type,fn);}},
};
game.creatures=new CreatureManager(game);
game.descent21={spec:r=>savedFloorSpec(MOONS[r.moon],r.seed,r.descent21)};
const levels=installBackroomsLevels(game);game.brlevels=levels;
const backrooms=installBackrooms(game);game.backrooms=backrooms;
const br=installBackroomsCreatures(game);game.brcreatures=br;
const threats=installDescent21Threats(game);game.descentThreat21=threats;
const receipts=installLiminal26(game);
game.mods.emit('registerHandlers',(type,fn)=>handlers.set(type,fn),game);
game.mods.emit('netReady',game.net,game);
const errorsBefore=errLog.total;
function frame(dt){game.time+=dt;game.mods.emit('update',dt,game);}
function change(depth,theme,seed){
 game.mods.emit('facilityWillChange',game.world,game,depth);
 fac.dispose(physics);
 run.descent21.depth=depth;run.descent21.currentChoice={seed,theme,size:.85};
 fac=buildFacility(generateLayout(seed,theme,.85),{physics,lightPool:lights});game.world.facility=fac;scene.add(fac.group);
 physics.step(1/60);
 const room=fac.layout.rooms.find(r=>r.type==='entry')||fac.layout.rooms[0];
 player.pos.set(fac.layout.ox+(room.cx+.5)*fac.layout.cell,fac.layout.y+.1,fac.layout.oz+(room.cz+.5)*fac.layout.cell);
 game.mods.emit('facilityChanged',game.world,game,depth);
}
try{
 game.mods.emit('mapLoaded',game.world,game);
 const brspec=floorSpec(MOONS.hamsi,17,3);change(3,'backrooms',brspec.seed);
 assert(levels.plan&&levels.plan===fac.layout.brPlan,'lift callback binds actual Backrooms sublevel plan');
 assert(levels.stats.bake.meshes>0&&levels.stats.bake.verts>0,'actual geometry received baked light');
 assert.equal(game.env.interiorFog,levels.stats.fog);
 assert.equal(threats.spec().theme,'backrooms');assert(threats.quiet());
 for(const type of ['br_smiler','br_hound','yoinker'])assert.equal(game.creatures.hostSpawn(type,player.pos,{zone:'in',level:1,variant:null,affix:null}),null,'quiet arrival rejects ordinary native spawn');
 assert.equal(backrooms.spot,null);assert.equal(backrooms.enter('debug'),false,'deep liminal floor cannot recursively noclip');
 handlers.get('brEnter')({r:'debug',p:player.pos.toArray()},'crew');assert(messages.some(m=>m.type==='brgo'&&m.d.ok===false));
 game.net.listeners.get('brst')({k:123},'crew');assert.equal(backrooms.pocket,null,'old pocket build packet rejected during deep arrival');
 game.mods.emit('moonPopulated',game);assert.equal(spawned.length,0,'deep resume does not inject landing locals or secret bonus loot');
 frame(24.9);assert(threats.quiet());frame(.1);assert(!threats.quiet());
 assert(!threats.residents().includes('br_moth')&&!threats.residents().includes('br_partygoer'),'first liminal floor avoids conflicting light/hug rules');
 // The existing surface moon's actual host wave selects requests; native
 // wrapping maps them to fair Backrooms spots and charges actual species cost.
 const oldRandom=Math.random,rng=new RNG(26);let backroomsBodies=0;
 try{Math.random=()=>rng.next();for(let attempt=0;attempt<8;attempt++){
  game.hostData.powerUsed=0;game.hostSpawnWave(0);
  const alive=[...game.creatures.host.values()].filter(c=>!c.dead&&c.zone==='in');
  assert(alive.length<=threats.spec().threat.maxAlive);assert(alive.every(c=>threats.residents().includes(c.type)));
  assert.equal(game.hostData.powerUsed,alive.reduce((n,c)=>n+(c.def.power||0),0),'native remapped wave charges actual power');
  backroomsBodies+=alive.filter(c=>c.type.startsWith('br_')).length;
  for(const c of alive)game.creatures.hostRemove(c.id);
 }}finally{Math.random=oldRandom;}
 assert(backroomsBodies>0,'ordinary host wave actually creates Backrooms species');
 const smiler=game.creatures.hostSpawn('br_smiler',player.pos,{zone:'in',level:1,variant:null,affix:null});assert(smiler?.data.descent21);
 assert.equal(game.creatures.hostSpawn('br_hound',player.pos,{zone:'in',level:1,variant:null,affix:null}),null,'one new Backrooms rule at a time on first visit');
 const yoinker=game.creatures.hostSpawn('yoinker',player.pos,{zone:'in',level:1,variant:null,affix:null});assert(yoinker);
 assert.equal(game.creatures.hostSpawn('yoinker',player.pos,{zone:'in',level:1,variant:null,affix:null}),null,'core two-body cap enforced in native constructor');
 assert.equal(game.creatures.hostSpawn('jester',player.pos,{zone:'in',level:1,variant:null,affix:null}),null,'surface moon table cannot add an unrelated headline');
 for(const c of [...game.creatures.host.values()])game.creatures.hostRemove(c.id);
 levels.caption('l0');frame(.01);assert(game.engine.fx.noise>0,'positive control: native level caption owns tape-noise burst');
 const nullspec=floorSpec(MOONS.hamsi,17,7);change(7,'nullreception',nullspec.seed);
 assert.equal(game.engine.fx.noise,0,'owned caption grain cannot linger on the next floor');
 assert.equal(levels.plan,null,'sublevels release old facility reference');assert(audioCalls.some(([slot,snd])=>slot==='brlhum'&&snd===null),'old fluorescent/party loops stopped');
 assert.equal(threats.spec().theme,'nullreception');assert.equal(threats.spec().rule,'receipt');
 assert.deepEqual(threats.residents().sort(),['crawler','listener','yoinker']);
 // Loud footsteps are native replicated player state; receipts keep the OLD spot.
 const origin=player.pos.clone();player.noise=.7;frame(.1);assert.equal(receipts.stats().pending,1);
 player.noise=0;player.pos.x+=4;frame(2.89);assert(!game.creatures.noises.some(n=>n.liminal26));frame(.11);
 const echo=game.creatures.noises.find(n=>n.liminal26);assert(echo&&echo.pos.distanceTo(origin)<.001);assert.equal(echo.owner,null);assert.equal(echo.loud,LIMINAL26.replayLoud);
 assert.equal(pressure,0,'reflected footsteps do not apply a second native noise pressure charge');
 const ear={pos:origin.clone().add(new THREE.Vector3(0,0,2)),def:{},zone:'in'};assert.equal(game.creatures.hear(ear,16),echo,'actual CreatureManager.hear sees stale receipt position');
 assert(messages.some(m=>m.type==='fx'&&m.d.s==='walkie_static'&&m.d.p[0]===origin.x),'native spatial sound emitted with the old receipt');
 player.noise=.7;frame(.1);assert.equal(receipts.stats().pending,0,'sustained sprint coalesces during cooldown');player.noise=0;
 frame(5);game.creatures.noise(player.pos,1);assert.equal(receipts.stats().pending,1,'native loud tool call captured');const charged=pressure;frame(3);assert.equal(pressure,charged,'tool replay never recursively charges pressure');assert.equal(receipts.stats().pending,0);
 frame(8);game.creatures.noise(player.pos.clone().add(new THREE.Vector3(80,0,0)),2);assert.equal(receipts.stats().pending,0,'distant ownerless creature/forged noise not stored');
 const second={...player,id:'peer',pos:player.pos.clone(),noise:.7};peers.push(second);frame(.1);assert.equal(receipts.stats().pending,1);game.mods.emit('hostMigrated',game,{self:true});assert.equal(receipts.stats().pending,0,'migration drops old host-clock receipts');second.noise=0;
 game.isHost=false;player.noise=.7;frame(5);assert.equal(receipts.stats().pending,0,'replica never creates acoustic pursuit rows');game.isHost=true;player.noise=0;
 // Bounded simultaneous lobby: at most eight receipts, even with many loud peers.
 game.mods.emit('hostMigrated',game,{self:true});for(let i=0;i<12;i++)peers.push({...player,id:`extra${i}`,pos:player.pos.clone(),noise:.7});frame(.1);assert.equal(receipts.stats().pending,8);for(const p of peers)p.noise=0;
 const soundsBefore=messages.filter(m=>m.type==='fx'&&m.d.s==='walkie_static').length;
 game.mods.emit('facilityWillChange',game.world,game,0);assert.equal(receipts.stats().pending,0);assert.equal(levels.plan,null);frame(5);assert.equal(messages.filter(m=>m.type==='fx'&&m.d.s==='walkie_static').length,soundsBefore,'old map receipts cannot fire during rebuild');
 // Returning to the same surface never reruns the moon population prize callback.
 change(0,'backrooms',brspec.seed);assert(levels.plan);assert.equal(spawned.length,0);
 // New landing reaches mapLoaded before descent.ensure replaces yesterday's
 // token. The old depth must not permanently suppress its native wrong door.
 run.seed=18;change(0,'backrooms',18);run.descent21.depth=7;game.w3={spotChance:()=>1};
 game.mods.emit('mapLoaded',game.world,game);assert(backrooms.spot,'stale prior-landing depth does not suppress guaranteed native surface door');
 run.descent21=newDescent(run);run.descent21.depth=3;
 game.mods.emit('mapLoaded',game.world,game);assert.equal(backrooms.spot,null,'current valid deep token suppresses nested wrong door');
 game.engine.fx.noise=.8;game.mods.emit('facilityWillChange',game.world,game,0);assert.equal(game.engine.fx.noise,.8,'cleanup preserves stronger noise owned by another effect');
 assert.equal(errLog.total,errorsBefore,'actual callbacks have no caught runtime errors');
 assert.equal(CREATURES.br_smiler.noSpawn,false,'legacy Backrooms moon gate remains functional');
 console.log('liminal26: actual Backrooms lifecycle/bake, quiet/count/rule admission, stale positional native hearing, once-charged bounded receipts and rebuild/migration/replica cleanup PASS');
}finally{
 receipts.dispose();threats.dispose();br.dispose();backrooms.dispose();levels.dispose();game.creatures.clearAll();fac.dispose(physics);physics.world.free();document.createElement=oldCreate;
}
