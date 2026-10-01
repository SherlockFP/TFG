import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CreatureManager} from '../../src/entities/creatures.js';
import {hostMethods} from '../../src/game/host.js';
import {CREATURES} from '../../src/game/creatures.js';
import {roaming} from '../../src/game/firstdepth21_core.js';
import {installFirstDepth21} from '../../src/game/firstdepth21.js';
const events=[],Y=-240,near=new THREE.Vector3(5,Y,0),far=new THREE.Vector3(50,Y,0);
const game={isHost:true,run:{phase:'moon',day:1,quotaIndex:0,moon:'hamsi',descent21:{depth:0}},profile:{unlocks:{mode:'all'}},engine:{scene:new THREE.Scene()},ship:{group:new THREE.Group()},world:{facility:{mainDoor:{spawn:new THREE.Vector3(0,Y,0)},fireDoors:[{spawn:new THREE.Vector3(80,Y,0)}],ventSpots:[{x:50,y:Y,z:0}],scrapSpots:[]}},hostData:{moonT:0,powerUsed:0,outPowerUsed:0},config:{dangerMul:1},net:{broadcast:(t,d)=>events.push([t,d])},aiPlayers:()=>[],rollLevel:()=>1,rollElite:()=>false,hostEarlySafeFilter:()=>null};
game.creatures=new CreatureManager(game);game.hostSpawnCreatureIndoor=hostMethods.hostSpawnCreatureIndoor;
game.hostSpawnOutdoor=hostMethods.hostSpawnOutdoor;
function outdoor(){const random=Math.random;Math.random=()=>.01;try{game.hostSpawnOutdoor();}finally{Math.random=random;}}
const oldSpawn=game.creatures.hostSpawn,oldIndoor=game.hostSpawnCreatureIndoor,oldOutdoor=game.hostSpawnOutdoor,api=installFirstDepth21(game);
const spawn=(type,pos=far,opts={})=>game.creatures.hostSpawn(type,pos,{variant:null,affix:null,...opts});
assert.equal(api.active(),true,'immediate all access does not cancel first surface pacing');
assert.equal(game.hostSpawnCreatureIndoor('scuttler'),false);assert.equal(game.creatures.host.size,0);assert.equal(events.length,0,'grace does not emit fake creature events');outdoor();assert.equal(game.hostData.outPowerUsed,0);
assert.equal(spawn('turret',near),null,'entry hazard cannot crowd first landing');assert.equal(spawn('mine',new THREE.Vector3(2,0,0)),null,'ship landing pocket is also clear');assert.ok(spawn('turret',far),'distant static hazard remains discoverable during grace');

assert.ok(spawn('mine',new THREE.Vector3(55,Y,0)));assert.equal(spawn('turret',new THREE.Vector3(60,Y,0)),null,'shared damaging hazard cap');
assert.ok(spawn('web',near,{data:{owner:'native-spider'}}),'harmless owned-child actor remains native');
CREATURES.f21_fixture_npc={...CREATURES.yoinker,noSpawn:true,noHunt:true,power:0,xp:0,coin:0};assert.ok(spawn('f21_fixture_npc',near),'neutral authored patrons retain their native scene contract');delete CREATURES.f21_fixture_npc;
assert.equal(spawn('mimicdoor',far),null,'instant lethal false exit waits through settling');
game.hostData.moonT=45;assert.equal(game.hostSpawnCreatureIndoor('scuttler'),true);assert.equal([...game.creatures.host.values()].filter(c=>roaming(c.def)).length,1,'native clustered helper is capped to one roaming encounter');
assert.equal(spawn('crawler'),null,'direct scripted spawn shares cap');assert.equal(spawn('hound',new THREE.Vector3(50,0,0)),null,'fast lethal pressure waits');outdoor();assert.equal(game.hostData.outPowerUsed,0,'rejected outdoor attempt refunds its native budget');
const first=[...game.creatures.host.values()].find(c=>roaming(c.def));first.dead=true;assert.equal(spawn('crawler',near),null,'first entry pocket stays clear');assert.equal(spawn('crawler',new THREE.Vector3(75,Y,0)),null,'fire exit pocket stays clear');assert.ok(spawn('yoinker'));
game.hostData.moonT=120;assert.ok(spawn('hound',new THREE.Vector3(50,0,0)));assert.equal(spawn('scuttler'),null,'settled first surface has two roaming encounters');
assert.ok(spawn('scuttler',near,{id:'restored-id',level:5,elite:true}),'host migration retains a real prior identity');assert.equal(game.creatures.host.get('restored-id').level,5);
// Boss contract can return a real object without being mistaken for ambient population.
CREATURES.f21_fixture_boss={...CREATURES.crawler,boss:true};assert.ok(spawn('f21_fixture_boss',far,{data:{lair:{}}}));delete CREATURES.f21_fixture_boss;
function unrestricted(change,restore){change();assert.equal(api.active(),false);assert.ok(spawn('scuttler',near),'later/opt-in native spawn admitted unchanged');restore();}
unrestricted(()=>game.run.descent21.depth=1,()=>game.run.descent21.depth=0);
unrestricted(()=>game.run.day=2,()=>game.run.day=1);
unrestricted(()=>game.run.quotaIndex=1,()=>game.run.quotaIndex=0);
unrestricted(()=>game.run.quick={v:1},()=>delete game.run.quick);
unrestricted(()=>game.run.moon='hq',()=>game.run.moon='hamsi');
game.creatures.host.clear();game.hostData.moonT=0;game.run.phase='landing';assert.equal(spawn('crawler'),null,'initial landing population uses the same grace');
api.dispose();assert.equal(game.creatures.hostSpawn,oldSpawn);assert.equal(game.hostSpawnCreatureIndoor,oldIndoor);assert.equal(game.hostSpawnOutdoor,oldOutdoor);assert.ok(spawn('crawler',near),'dispose restores native behavior');
console.log('firstdepth21: actual native manager/indoor clusters and direct spawns share grace/caps; budget, migration, depth and later difficulty preserved');
