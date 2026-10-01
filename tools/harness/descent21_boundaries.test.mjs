import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {buildShip,insideShip} from '../../src/world/ship.js';
import {installShipyard} from '../../src/game/shipyard.js';
import {installFood} from '../../src/game/food.js';
import {installIncubator} from '../../src/game/pets_incubator.js';
import {SPOTS} from '../../src/world/shiplayout.js';
import {ITEMS} from '../../src/game/items.js';
import {FLEET13,fleetLayout,sanitizeFleet13} from '../../src/game/fleet13_core.js';
import {Physics,initPhysics,G,groups} from '../../src/physics/physics.js';
await initPhysics();
let physics,ship,scene;const lightPool={add:x=>x,remove(){}};
function makeGame({ isHost = true, profile = null } = {}) {
  const handlers = new Map(), listeners = new Map(), sent = [], bcasts = [];
  const mods = {
    _on: new Map(), commands: new Map(), itemModels: new Map(), api: { registerCommand(n, fn, h) { mods.commands.set(n, { fn, help: h }); } },
    on(ev, fn) { (this._on.get(ev) || this._on.set(ev, []).get(ev)).push(fn); return () => { const a = this._on.get(ev); a.splice(a.indexOf(fn), 1); }; },
    emit(ev, ...args) { for (const fn of [...(this._on.get(ev) || [])]) fn(...args); },
  };
  const net = {
    hostId: 'H', bcasts, sent, handlers: listeners,
    request(op, d) { const h = handlers.get(op); if (h) h(d, game.selfId); },
    broadcast(type, d) { bcasts.push([type, d]); for (const fn of listeners.get('msg:' + type) || []) fn(d, 'H'); },
    sendTo(id, type, d) { sent.push([id, type, d]); if (id === game.selfId) for (const fn of listeners.get('msg:' + type) || []) fn(d, 'H'); },
    send() {}, on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const a = listeners.get(ev); if (a) a.splice(a.indexOf(fn), 1); },
  };
  const items = new Map(); let iid = 0;
  const player = { pos: new THREE.Vector3(0, 0.05, 0), dead: false, hp: 50, maxHp: 100, stamina: 10, maxStamina: 100, teleport(p) { this.pos.copy(p); }, heldItem: () => null };
  const spawned = [];
  const game = {
    isHost, selfId: 'H', destroyed: false, time: 0, mods, net, ship, physics, lights: lightPool, scene, remotes: new Map(),
    profile: profile || { name: 'Host', bestiary: { lurker: { seen: 1, kills: 4 } }, blueprints: {} }, progress: { saves: 0, save() { this.saves++; } },
    run: { phase: 'orbit', credits: 5000, day: 3, moon: 'hamsi', quota: 300, sold: 0 }, hostData: { dayStats: { deaths: [] } },
    ui: { toasts: [], toast(s) { this.toasts.push(s); }, panelOpen: null, openPanel() {}, hud: {} }, audio: { play() {} }, engine: {}, player, anomaly: null, balance: { model: { spikes: [], addSpike(v) { this.spikes.push(v); } } },
    items: {
      all: () => items.values(), get: (id) => items.get(id), inShipItems: () => [...items.values()].filter((it) => it.state === 'world' && insideShip(it.obj.position)),
      hostSpawn(type, pos, o = {}) { const id = 'i' + ++iid; const it = { id, type, def: ITEMS[type] || { kind: 'scrap' }, holder: o.holder || null, state: 'world', obj: { position: pos.clone() }, value: 10, label: o.label }; items.set(id, it); spawned.push(type); return id; },
    },
    aiPlayers: () => [{ id: 'H', pos: player.pos, dead: player.dead }, ...[...game.remotes.values()].map((r) => ({ id: r.id, pos: r.pos, dead: r.dead }))],
    playerName: (id) => (id === 'H' ? 'Host' : game.remotes.get(id)?.name || id),
    later(fn) { fn(); return 0; }, broadcastRun(keys) { net.bcasts.push(['gs', keys]); }, respawn() { player.dead = false; }, hostSell(from) { game._soldRate = game.run.favor || 1; },
    creatures: { host: new Map(), damage(id, dmg) { const c = game.creatures.host.get(id); if (c) c.hp -= dmg; } },
    hostOnCreatureKilled() {}, crafting: {},
    _items: items, _spawned: spawned, _handlers: handlers,
  };
  const oldOn = mods.on.bind(mods);
  mods.on = (ev, fn) => (ev === 'registerHandlers' ? (fn((op, h) => handlers.set(op, h), game), () => {}) : oldOn(ev, fn));
  return game;
}


const {generateLayout,buildFacility}=await import('../../src/world/facility.js');
const {createWorld}=await import('../../src/game/maps2_world.js');const {installChests}=await import('../../src/game/chests.js');
physics=new Physics();scene=new THREE.Scene();ship=buildShip({physics,lightPool,scene});const g=makeGame();g.run.phase='moon';g.run.seed=18;g.run.descent21={depth:0};g.player.indoor=true;g.aiPlayerById=()=>({pos:g.player.pos,dead:false});g.lights=lightPool;
const base=buildFacility(generateLayout(18,'factory',.8),{physics,lightPool});g.world={moonId:'hamsi',seed:18,facility:base,outdoor:{group:new THREE.Group(),colliders:[],landmarks:{chests:[{id:'landmark',x:60,y:0,z:60,tier:'wood'}]},terrain:{scale:1,distToPath:()=>0},avoid:()=>true}};
g.run.m2s={sealed:[],used:['fixture:used'],done:['fixture:done']};const {register}=await import('node:module');register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(%22.css%22))return{format:%22module%22,source:%22export default {}%22,shortCircuit:true};return n(u,c);}');const {installFacilitySystems}=await import('../../src/game/facilitysys.js');g.deathText=x=>x;g.env={};g.updateAmbience=()=>{};const living=installFacilitySystems(g);g.mods.emit('moonPopulated',g);const originalFacState=g.run.fac;assert.ok(living.host);const W=createWorld(g,{});assert.equal(W.F,base);assert.ok(W.hs.done['fixture:done']);let prompts=0,ticks=0,requests=0;W.interFns.push(()=>prompts++);W.tickFns.push(()=>ticks++);W.handle('fixture',()=>requests++);
const chests=installChests(g,{});chests.onMapLoaded(g.world);const outdoor=chests.get('landmark');assert.ok(outdoor);outdoor.opened=outdoor.claimed=true;assert.ok(chests.list().some(c=>c.where==='facility'));const oldcols=physics.info.size;
g.mods.emit('facilityWillChange',g.world,g,1);assert.equal(W.F,null);assert.equal(chests.list().filter(c=>c.where==='facility').length,0);assert.ok(physics.info.size<oldcols);assert.equal(chests.get('landmark'),outdoor);assert.ok(outdoor.claimed);
const deep=buildFacility(generateLayout(19,'factory',.8),{physics,lightPool});g.world.facility=deep;g.run.descent21.depth=1;g.mods.emit('facilityChanged',g.world,g);g.mods.emit('update',.1,g);g.mods.emit('interactables',[],g);g._handlers.get('m2')({op:'fixture'},g.selfId);assert.deepEqual([prompts,ticks,requests],[0,0,0]);assert.equal(g.run.m2s.done[0],'fixture:done');assert.equal(g.run.fac,originalFacState);assert.notEqual(living.host.fac,deep);assert.equal(W.F,null);
g.mods.emit('facilityWillChange',g.world,g,0);const restored=buildFacility(generateLayout(18,'factory',.8),{physics,lightPool});g.world.facility=restored;g.run.descent21.depth=0;g.mods.emit('facilityChanged',g.world,g);assert.equal(W.F,restored);assert.equal(living.host.fac,restored);assert.equal(g.run.fac,originalFacState);assert.ok(W.hs.done['fixture:done']);assert.ok(W.hs.used['fixture:used']);g.mods.emit('update',.1,g);g.mods.emit('interactables',[],g);g._handlers.get('m2')({op:'fixture'},g.selfId);assert.deepEqual([prompts,ticks,requests],[1,1,1]);assert.equal(chests.get('landmark'),outdoor);assert.ok(outdoor.claimed);assert.equal(chests.list().filter(c=>c.where==='facility').length,0,'no rerolled facility reward on return');
const {installGear11}=await import('../../src/game/gear11.js');g.net.on_=(type,fn)=>g.net.on('msg:'+type,fn);g.net.handle=(type,fn)=>g._handlers.set(type,fn);g.doorById=id=>g.world.facility.doors.find(d=>d.id===id);g.player.forward=()=>new THREE.Vector3(0,0,-1);const gear=installGear11(g);const jamId=gear.debug.jamNearest();assert.ok(jamId,'native installed gear jams actual ordinary door');const jammed=g.doorById(jamId);assert.ok(jammed.locked);assert.equal(gear.state.jams,1,'actual separate jammer visual exists');g.mods.emit('facilityWillChange',g.world,g,1);assert.equal(gear.state.jams,0);assert.equal(jammed.locked,false);assert.equal(jammed.jam,0);gear.dispose();chests.dispose();W.dispose();living.dispose();const {installMapmods}=await import('../../src/game/mapmods.js');const delayed=[];g.later=(fn)=>delayed.push(fn);let blasts=0;g.creatures.blast=()=>blasts++;g.items.onEvent=()=>{};g.run.quotaIndex=5;g.run.mm={cur:{a:['volatile']},n:0};const affixes=installMapmods(g);let selected=null;
for(let i=0;i<100&&delayed.length===0;i++){const id=g.items.hostSpawn('copper',new THREE.Vector3(20,restored.layout.y,20));selected=g.items.get(id);g.items.onEvent({e:'drop',id});}
assert.ok(delayed.length,'actual volatile callback armed deterministically');g._items.delete(selected.id);for(const fn of delayed.splice(0))fn();assert.equal(blasts,0,'removed native item cannot phantom blast');
for(let i=0;i<100&&delayed.length===0;i++){const id=g.items.hostSpawn('copper',new THREE.Vector3(20,restored.layout.y,20));g.items.onEvent({e:'drop',id});}assert.ok(delayed.length);g.world.facility=deep;g.run.descent21.depth=1;for(const fn of delayed.splice(0))fn();assert.equal(blasts,0,'old indoor floor callback cannot blast new floor');affixes.dispose();const resumed=makeGame();resumed.run={phase:'moon',seed:18,fac:originalFacState,descent21:{depth:2}};resumed.world={facility:deep};resumed.deathText=x=>x;resumed.env={};resumed.updateAmbience=()=>{};const resumedLiving=installFacilitySystems(resumed);resumed.mods.emit('moonPopulated',resumed);assert.equal(resumedLiving.host,null);resumed.run.descent21.depth=0;resumed.world.facility=restored;resumed.mods.emit('facilityChanged',resumed.world,resumed);assert.equal(resumedLiving.host.fac,restored);assert.equal(resumed.run.fac,originalFacState);assert.equal(resumed._spawned.length,0,'resumed surface cannot respawn native components or core');resumedLiving.dispose();const peer=makeGame({isHost:false});peer.run={phase:'moon',moon:'hamsi',seed:18,descent21:{depth:2}};peer.world={...g.world};peer.lights=lightPool;const peerW=createWorld(peer,{});assert.equal(peerW.F,null,'late peer deep has no old surface spots');const peerChests=installChests(peer,{});peerChests.onMapLoaded(peer.world);assert.equal(peerChests.list().filter(c=>c.where==='facility').length,0);assert.ok(peerChests.get('landmark'),'late peer keeps outdoor chest');peerChests.onState({s:18,list:['landmark']});assert.ok(peerChests.get('landmark').claimed,'late peer native state preserves outdoor claim');peerW.dispose();peerChests.dispose();physics.world.free();console.log('descent21 boundaries: actual maps2 and chests deep suppression, collider cleanup, surface rebind and finite outdoor ledger PASS');
