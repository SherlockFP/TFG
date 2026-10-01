import './ship2_env.mjs';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent("export async function load(u,c,n){if(u.endsWith('.css'))return{format:'module',source:'export default {};',shortCircuit:true};return n(u,c)}"));
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Session} from '../../src/net/session.js';
import {casinoOutboundView,transact} from '../../src/game/casino13_core.js';
import {registerLab24Moons,LAB24_MOON_DEFS} from '../../src/game/lab24_moons.js';
const {actionMethods}=await import('../../src/game/actions.js');
const {hostMethods}=await import('../../src/game/host.js');
const {Terminal}=await import('../../src/game/terminal.js');

// Actual Session batching must sanitize remote snapshots without replacing the
// private host ledger in the synchronous local phase/gs callback.
const net=new Session({strategy:'local',isHost:true,code:'BOUND24',profile:{}});
net.selfId='host';const wire=[];
net.transport={peers:new Set(['peer']),send:m=>wire.push(m)};
net.outboundView=casinoOutboundView;
const run={credits:100,casino13:{wallets:{host:{chips:50,round:null,seq:0}}}};
transact(run,'host',{action:'play',game:'poker',amount:5,seq:0},()=>.4);
assert.equal(run.casino13.wallets.host.round.deck.length,42);
let local;net.on('msg:phase',d=>{local=d;});
const phase={phase:'deadletter',deadletter24:{backup:{run}}};
net.broadcast('phase',phase);net.flush();
assert.equal(local,phase);assert.equal(local.deadletter24.backup.run.casino13.wallets.host.round.deck.length,42);
assert.equal(wire[0].d.deadletter24.backup.run.casino13.wallets.host.round.deck,undefined);
assert.deepEqual(wire[0].d.deadletter24.backup.run.casino13.wallets.host.round.dealer,[]);
const rows=new Proxy([], {ownKeys(){throw Error('high-frequency rows must not be traversed by the casino privacy filter');}});
for(const type of ['cs','is','ps','dl24fx'])assert.equal(casinoOutboundView(type,rows),rows);
const relayed=casinoOutboundView('relay',{from:'host',m:{t:'phase',d:phase}});
assert.equal(relayed.m.d.deadletter24.backup.run.casino13.wallets.host.round.deck,undefined);
wire.length=0;net.sendTo('host','phase',phase);net.flush();assert.equal(wire.length,0);

// The real terminal host path denies forged hidden trial destinations, while
// ordinary balanced expeditions still use native routing.
registerLab24Moons();const replies=[];
const routeGame={run:{phase:'orbit',credits:100,daysLeft:3,moon:'hamsi'},config:{freeTravel:true},net:{sendTo:(p,t,d)=>replies.push(d),broadcast(){}},env:{setSpace(){}},planetColorFor:()=>0,broadcastRun(){}};
const terminal=new Terminal(routeGame);
for(const moon of LAB24_MOON_DEFS){terminal.hostExecute({op:'route',moon:moon.id},'peer');assert.equal(replies.at(-1).err,true);assert.equal(routeGame.run.moon,'hamsi');}
terminal.hostExecute({op:'route',moon:'letterfield24'},'peer');assert.equal(routeGame.run.moon,'letterfield24');assert.equal(replies.at(-1).err,false);

// Native campaign hit packets must never substitute arbitrary client damage
// for host-simulated expedition card trajectories.
let mode=true,hits=0;const handlers=new Map();
const hitGame={net:{handle:(id,fn)=>handlers.set(id,fn)},deadletter24:{active:()=>mode},creatures:{host:new Map([['c',{type:'dl24_clerk',def:{boss:true}}]]),damage:()=>hits++},player:{pos:null},remotes:new Map()};
hostMethods.registerHandlers.call(hitGame);
handlers.get('hit')({cid:'c',dmg:400},'host');assert.equal(hits,0);
mode=false;handlers.get('hit')({cid:'c',dmg:20},'host');assert.equal(hits,1,'normal native combat retains its existing path');

// Ordinary fuse/teleport prompts cannot pull a player out of the custom floor.
const point=new THREE.Vector3(0,-299,0),door={kind:'entrance',teleport:true,pos:point.clone(),spawn:point.clone().add(new THREE.Vector3(0,0,2)),exitIndex:0};
const promptGame={run:{phase:'deadletter'},deadletter24:{active:()=>true},ship:{points:{}},player:{inShip:false,indoor:true,pos:point.clone(),heldItem:()=>null},world:{facility:{interactables:[{type:'fuse',pos:point}],doors:[door]}},creatures:{views:new Map()}};
assert.equal(actionMethods.interactablesNow.call(promptGame).length,0);
promptGame.deadletter24.active=()=>false;
assert.equal(actionMethods.interactablesNow.call(promptGame).length,2,'normal expeditions retain both native prompts');
let teleports=0;promptGame.deadletter24.active=()=>true;promptGame.player.teleport=()=>teleports++;
actionMethods.useExit.call(promptGame,0,false);assert.equal(teleports,0);

// Campaign perks and death records cannot contaminate the temporary mode,
// including a synchronous host callback changing phase before die finishes.
let perk=0,deaths=0;
const hurtGame={player:{hp:5,dead:false,onHurt(){}},deadletter24:{active:()=>true},hasPerk:()=>{perk++;return true;},engine:{hurt(){}},audio:{variant:()=>''},sfx(){},net:{send(){}},ui:{},die(){deaths++;}};
actionMethods.damageLocal.call(hurtGame,6,'dl24_clerk');assert.equal(perk,0);assert.equal(deaths,1);
actionMethods.noticeCreatures.call({deadletter24:{active:()=>true}});
mode=true;let profileDeaths=0;
const deathGame={player:{dead:false,slots:[],pos:new THREE.Vector3()},selfId:'host',isHost:true,deadletter24:{active:()=>mode},closeMinigame(){},terminal:{close(){}},items:{all:()=>[]},refreshHeldVisuals(){},sfx(){},engine:{fx:{},flash(){}},net:{send(){}},hostOnPlayerDied(){mode=false;},progress:{onDeath:()=>profileDeaths++},ui:{hud:{setDead(){}},systemMessage(){}},deathText:()=> 'died'};
actionMethods.die.call(deathGame,'dl24_clerk');assert.equal(profileDeaths,0);
console.log('deadletter24 actual Session/terminal/native hit, portal, perk and synchronous death boundaries PASS');
