import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Emitter} from '../../src/core/events.js';
import {Session} from '../../src/net/session.js';
import {installPerk38,mysteryWeapon38} from '../../src/game/perk38.js';
import {ITEMS} from '../../src/game/items.js';
const run={runId:'r',phase:'orbit',moon:'hamsi',seed:4,day:1,credits:300};
assert.equal(mysteryWeapon38(run,1),mysteryWeapon38({...run},1),'crate roll is deterministic');
const counts={};for(let n=0;n<400;n++){const id=mysteryWeapon38(run,n);assert.equal(ITEMS[id].kind,'weapon');counts[id]=(counts[id]||0)+1;}assert.ok(Object.keys(counts).length>2,'rare rewards and cheap finds both exist');
const net=new Session({strategy:'local',isHost:true,code:'perk38'});net.selfId=net.hostId='H';
const spawned=[],g={selfId:'H',isHost:true,time:0,run,world:{descent21Depth:0},mods:new Emitter(),net,ship:{points:{coffee:new THREE.Vector3(0,1,0),cupboard:new THREE.Vector3(0,1,0)}},player:{pos:new THREE.Vector3(0,0,1),eye:1.62,hp:40,maxHp:100,stamina:10,maxStamina:100},remotes:new Map(),physics:{raycast:(_,dir)=>dir.y===-1?{normal:{y:1},point:{y:0}}:null},items:{hostSpawn:(...a)=>spawned.push(a)},broadcastRun(){},hostSave(){}};
const api=installPerk38(g);g.mods.emit('registerHandlers',(k,fn)=>net.handle(k,fn),g);
const receipt={op:'rush',moon:'hamsi',seed:4,depth:0,nonce:'a'};
try{
 net.request('pk38req',receipt);assert.equal(g.player.speedBoost,25);assert.equal(run.credits,265);
 net.request('pk38req',receipt);assert.equal(run.credits,265,'same request cannot charge twice');
 net.request('pk38req',{...receipt,op:'repair',nonce:'b'});assert.equal(g.player.hp,70);assert.equal(run.credits,220,'local native health changes after real self reply');
 api.receive({ok:true,op:'repair',nonce:'H:b',text:'Supply delivered.'});assert.equal(g.player.hp,70,'reply replay never heals twice');
 g.physics.raycast=()=>({});net.request('pk38req',{...receipt,op:'crate',nonce:'blocked'});assert.equal(spawned.length,0);
 g.physics.raycast=(_,dir)=>dir.y===-1?{normal:{y:1},point:{y:0}}:null;net.request('pk38req',{...receipt,op:'crate',nonce:'c'});assert.equal(spawned.length,1);assert.equal(run.credits,100);assert.equal(ITEMS[spawned[0][0]].kind,'weapon');
 net.request('pk38req',{...receipt,op:'crate',nonce:'poor'});assert.equal(spawned.length,1,'poor request never spawns');
 g.player.pos.set(50,0,50);net.request('pk38req',{...receipt,nonce:'far'});assert.equal(run.credits,100);
 const peerNet=new Session({strategy:'local',isHost:false,code:'perk38'});peerNet.selfId='P';peerNet.hostId='H';peerNet.transport.peers.add('H');net.players.set('P',{id:'P'});net.transport.peers.add('P');
 const peerPlayer={pos:new THREE.Vector3(0,0,1),eye:1.62,hp:10,maxHp:100,stamina:0,maxStamina:100};g.remotes.set('P',peerPlayer);g.run.credits=100;
 const peerGame={...g,isHost:false,selfId:'P',net:peerNet,mods:new Emitter(),player:peerPlayer,run:{...g.run}};
 const peerApi=installPerk38(peerGame);net.transport.send=(message,to)=>{if(!to||to==='P')peerNet.receive(message,'H');};peerNet.transport.send=message=>net.receive(message,'P');
 try{peerNet.request('pk38req',{...receipt,nonce:'peer',op:'repair'});peerNet.flush();net.flush();assert.equal(peerPlayer.hp,40,'actual host-authorized peer reply applies native health to peer');assert.equal(g.run.credits,55,'host shared wallet pays peer drink once');}
 finally{peerApi.dispose();peerNet.transport.leave();peerNet.clear();}
 api.dispose();assert.equal(api.request({...receipt,nonce:'after'},'H'),false);
}finally{net.transport.leave();net.clear();}
console.log('perk38 actual Session paid native drinks and seeded weapon cabinet PASS',counts);
