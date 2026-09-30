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

for(const vessel of Object.keys(FLEET13))for(const host of [true,false]){
 physics=new Physics();scene=new THREE.Scene();ship=buildShip({physics,lightPool,scene});
 const profile={level:1,blueprints:{},shipyard:fleetLayout(vessel)};const g=makeGame({isHost:host,profile});g.run.day=1;g.run.quotaIndex=0;g.run.credits=60;g.run.sy=fleetLayout(vessel);g.player.inShip=true;
 g.world={};g.settings={};g.refreshStats=()=>{};g.mods.soundGens=new Map();
 const before=JSON.stringify({profile:g.profile,sy:g.run.sy,credits:g.run.credits});const yard=installShipyard(g);if(host)g.mods.emit('hostStart',g);g.mods.emit('update',.4,g);
 const food=installFood(g);g.mods.emit('hostStart',g);physics.world.step();assert.ok(food.state().table,`${vessel}/${host} actual native mess table`);
 let opened=0,inserted=0;const incubator=installIncubator(g,{open(tab){assert.equal(tab,'nest');opened++},incubateItem(){inserted++;return{ok:true}}});physics.world.step();
 assert.ok(ship.group.getObjectByName('petIncubator'),vessel+' actual incubator installed');assert.ok(ship.points.arcade,vessel+' native arcade point');const arcadeOrigin=ship.points.arcade.clone().add(new THREE.Vector3(0,.05,1.4)),arcadeDir=ship.points.arcade.clone().sub(arcadeOrigin);assert.equal(physics.raycast(arcadeOrigin,arcadeDir.clone().normalize(),arcadeDir.length()-.15,G.STATIC|G.DOOR),null,'native arcade prompt is not occluded by its cabinet');
 for(const phase of ['orbit','moon']){
  g.run.phase=phase;g.mods.emit('phase',phase,g);g.mods.emit('update',.4,g);
  const out=[];g.mods.emit('interactables',out,g);assert.ok(out.some(i=>i.label==='Ship table [E]'),`${vessel}/${host}/${phase} actual native mess-table E`);const point=out.find(i=>typeof i.label==='function'&&/Incubator/.test(i.label()));assert.ok(point,`${vessel}/${host}/${phase} physical incubator E`);point.action();
  const origin=new THREE.Vector3(SPOTS.incubator.x,1.4,1.8),direction=point.pos.clone().sub(origin);assert.equal(physics.raycast(origin,direction.clone().normalize(),direction.length()-.15,G.STATIC|G.DOOR),null,'actual incubator prompt not inside stand collider');
 }
 assert.equal(opened,2);assert.equal(inserted,0,'empty incubator access does not create pet/egg');assert.equal(g.run.credits,60,'system access does not spend or grant credits');assert.deepEqual(g.run.sy.m,fleetLayout(vessel).m,'default system access does not install/max paid rooms');
 // Actual native body reaches the incubator service approach inside every unchanged hull.
 const actor=physics.createKinematicCapsule(new THREE.Vector3(0,.92,0),.5,.34,G.PLAYER,G.STATIC|G.DOOR),cc=physics.createController();physics.world.step();
 for(let i=0;i<150;i++){const p=actor.body.translation(),dx=SPOTS.incubator.x-p.x,dz=1.8-p.z,dist=Math.hypot(dx,dz);if(dist<.06)break;const k=Math.min(.05,dist)/dist;cc.computeColliderMovement(actor.col,{x:dx*k,y:-.006,z:dz*k},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const d=cc.computedMovement();actor.body.setNextKinematicTranslation({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z});physics.world.step();}
 const p=actor.body.translation();assert.ok(Math.hypot(p.x-SPOTS.incubator.x,p.z-1.8)<.1,`${vessel} incubator approach body blocked`);physics.world.removeCharacterController(cc);physics.removeBody(actor.body);
 incubator.dispose();food.dispose();yard.dispose();ship.dispose?.();physics.world.free();
}
const bought=fleetLayout('rescue');bought.m.N1.t=3;bought.parts.plate=7;bought.deck={t:3,rooms:['bunk','store',null,null]};const old=sanitizeFleet13({selected:'rescue',owned:{rescue:bought},docked:false});assert.equal(old.owned.rescue.m.N1.t,3);assert.equal(old.owned.rescue.parts.plate,7);assert.equal(old.owned.rescue.deck.t,3);
console.log('starter stations: native shipyard + incubator E/body/LOS on all four hulls, host and peer, dock and field, paid upgrades preserved PASS');
