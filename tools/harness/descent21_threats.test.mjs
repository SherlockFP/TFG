import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {initPhysics,Physics} from '../../src/physics/physics.js';
import {CreatureManager} from '../../src/entities/creatures.js';
import {hostMethods} from '../../src/game/host.js';
import {CREATURES,registerCreature,canSpawnMore} from '../../src/game/creatures.js';
import {RNG} from '../../src/core/rng.js';
import {poolFor,poolMul} from '../../src/game/threatpool.js';
import {sectorScale,capHit} from '../../src/game/balance_core.js';
import {installCreatures20} from '../../src/game/creatures20.js';
import {registerStealthContent} from '../../src/game/stealth.js';
import {newDescent} from '../../src/game/descent21_state.js';
import {installDescent21Threats} from '../../src/game/descent21_threats.js';
await initPhysics();registerStealthContent();
const previous=globalThis.document,oldWindow=globalThis.window;delete globalThis.window;
const canvas=()=>({width:64,height:64,style:{},getContext:()=>new Proxy({}, {get:(o,k)=>k==='measureText'?()=>({width:10}):(k==='createImageData'||k==='getImageData')?()=>({data:new Uint8ClampedArray(1<<22),width:64,height:64}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true})});globalThis.document={createElement:()=>canvas()};
const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
try{
 const physics=new Physics(),scene=new THREE.Scene(),layout=generateLayout(1235,'factory',.8),fac=buildFacility(layout,{physics,lightPool:{add:e=>e,remove(){}}});scene.add(fac.group);for(let i=0;i<4;i++)physics.step(1/60);
 globalThis.window={__kefalMods:{itemModels:new Map(),creatureModels:new Map()},KefalAPI:{THREE}};
 const messages=[],run={phase:'moon',moon:'hamsi',quotaIndex:20,seed:1235,time:480,day:1};
 run.descent21=newDescent(run);const game={isHost:true,selfId:'crew',scene,engine:{scene},run,world:{facility:fac},physics,mods:new Emitter(),hostData:{powerUsed:0,powerBoost:0},config:{dangerMul:1},items:{all:()=>[].values()},aiPlayers:()=>[],hostSetDoor(){},mimicDisguise:hostMethods.mimicDisguise,profile:{name:'fixture',suit:'orange',level:1},remotes:new Map(),helloData:()=>({title:''}),rollLevel:()=>99,rollElite:()=>true,hostEarlySafeFilter:()=>null,indoorBudget:()=>6,hostSpawnCreatureIndoor:hostMethods.hostSpawnCreatureIndoor,hostSpawnWave:hostMethods.hostSpawnWave,net:{broadcast(k,d){messages.push({k,d:structuredClone(d)});},sendRows(){}},balance:{scale:()=>sectorScale(run.quotaIndex),speedCap:()=>0,hitDamage:(dmg,c)=>capHit(dmg*sectorScale(run.quotaIndex).dmg,run.quotaIndex,false)}};
 game.creatures=new CreatureManager(game);const c20=installCreatures20(game),api=installDescent21Threats(game);game.descentThreat21=api;
 const pos=new THREE.Vector3(layout.ox+(layout.rooms[1].cx+.5)*layout.cell,layout.y,layout.oz+(layout.rooms[1].cz+.5)*layout.cell);
 const surface=game.creatures.hostSpawn('crawler',pos,{zone:'in',level:99,elite:true,variant:null,affix:null});assert(!surface.data.descent21);assert(surface.maxHp>420,'surface native stats remain unchanged');game.creatures.hostRemove(surface.id);
 run.descent21.depth=20;
 const originalRun=CREATURES.crawler.run,c=game.creatures.hostSpawn('crawler',pos,{zone:'in',level:99,elite:true,variant:null,affix:null});assert(c.data.descent21);assert(c.maxHp<=420&&c.dmg<=40);assert.equal(CREATURES.crawler.run,originalRun,'limit clones def instead of mutating global species');
 const sp=messages.findLast(m=>m.k==='cev'&&m.d.e==='sp'&&m.d.id===c.id);assert.equal(sp.d.mh,c.maxHp,'native constructor cap precedes first replication');assert.equal(sp.d.hp,c.hp);
 assert(game.creatures.speedMul(c,100)<=6.8);assert(game.balance.hitDamage(999,c)<=40,'final cap runs after native damage scaling/gate');
 for(const type of ['turret','giant']){const creature=game.creatures.hostSpawn(type,pos,{zone:type==='giant'?'out':'in',level:99,variant:null,affix:null});assert(!creature.data.descent21,'hazard/outdoor preserved');assert.equal(api.finalSpeed(creature,100),100);game.creatures.hostRemove(creature.id);}
 registerCreature('descent21_fixture_boss',{boss:true,hp:900,dmg:80,zone:'in'});const boss=game.creatures.hostSpawn('descent21_fixture_boss',pos,{zone:'in',level:1,variant:null,affix:null});assert(!boss.data.descent21);assert.equal(api.finalDamage(boss,80),80);game.creatures.hostRemove(boss.id);
 const migration=game.creatures.hostSpawn('crawler',pos,{id:'migration',zone:'in',level:1,elite:false,variant:null,affix:null});assert.equal(migration.maxHp,Math.round(CREATURES.crawler.hp*sectorScale(run.quotaIndex).hp),'native restore skips depth multiplication');game.creatures.hostRemove(migration.id);
 game.creatures.hostRemove(c.id);run.quotaIndex=0;assert(!api.residents().includes('c20_pixel'),'depth never impersonates earned quota');run.quotaIndex=2;
 const pixel=game.creatures.hostSpawn('c20_pixel',pos,{zone:'in',level:1,variant:null,affix:null});assert(!canSpawnMore('c20_brute',game.creatures.host));assert(!api.allow('c20_brute'));game.creatures.hostRemove(pixel.id);
 // Native hostSpawnWave calls the native position selector/HostCreature constructor.
 // It charges the originally requested cost: wrapper reconciles actual mapped cost.
 run.quotaIndex=20;run.descent21.depth=1;game.hostData.powerUsed=0;const oldRandom=Math.random,waveRng=new RNG(216);try{Math.random=()=>waveRng.next();for(let i=0;i<3;i++)game.hostSpawnWave(0);}finally{Math.random=oldRandom;}
 const living=[...game.creatures.host.values()].filter(c=>!c.dead&&c.zone==='in');assert(living.length>0&&living.length<=api.spec().threat.maxAlive);assert(living.every(c=>c.type!=='scuttler'),'native spam pack cannot bypass the floor count');
 assert.equal(game.hostData.powerUsed,living.reduce((sum,c)=>sum+c.def.power,0),'native charged power equals actual mapped residents');
 while(game.creatures.host.size<api.spec().threat.maxAlive)game.creatures.hostSpawn('yoinker',pos,{zone:'in',level:1,variant:null,affix:null,id:'native-count-fixture'});
 const before=game.creatures.host.size;assert.equal(game.hostSpawnCreatureIndoor('crawler'),false,'full floor rejects an ordinary ambient request before old native spawn');assert.equal(game.creatures.host.size,before);assert.equal(game.hostSpawnCreatureIndoor('lurker'),false,'non-remapped native wave resident also respects full floor count');assert.equal(game.creatures.host.size,before);assert.equal(game.creatures.hostSpawn('scuttler',pos,{zone:'in',level:1,variant:null,affix:null}),null,'cheap direct ambient spawn is also count-gated despite available power');assert.equal(game.creatures.hostSpawn('lurker',pos,{zone:'in',level:1,variant:null,affix:null}),null,'common native direct ambient gate rejects full floor');assert(api.allowSpawn('lurker',{scripted:true}));assert(api.allowSpawn('lurker',{data:{ownedChild:true}}));assert(api.allowSpawn('lurker',{id:'restore'}));run.day++;assert.equal(api.spec(),null,'stale floor token does not change a new landing');run.day--;
 for(const id of [...game.creatures.host.keys()])game.creatures.hostRemove(id);
 for(const rule of ['listening','inspection','heavy']){let depth=1;for(;depth<300;depth++){run.descent21.depth=depth;if(api.spec().rule===rule)break;}assert(depth<300);const pool=poolFor(run,{...api.spec(),id:'hamsi'}),id=rule==='listening'?'listener':rule==='inspection'?'c20_pixel':'c20_brute',entry=api.weights().find(e=>e.id===id);assert(entry,'native quota permits the rule resident');const adjusted=entry.w/poolMul(id,pool);assert(adjusted>(id==='listener'?1:.12),'rule increases eligible resident weight without additional event spawns');}
 run.quotaIndex=0;assert(!api.weights().some(e=>e.id.startsWith('c20_')),'rule bias cannot bypass actual quota gate');
 api.dispose();c20.dispose();for(const v of game.creatures.views.values())v.dispose();fac.dispose(physics);physics.world.free();
 console.log('descent21 threats: native generated-floor host wave, prebroadcast stats, final caps, actual quota/family/count/power pass');
}finally{globalThis.document=previous;globalThis.window=oldWindow;}
