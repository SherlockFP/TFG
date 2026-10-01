import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {buildCompany} from '../../src/world/company.js';
import {buildHub13} from '../../src/world/hub13.js';
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


for(const vessel of Object.keys(FLEET13))for(const dock of [false,true])for(const isHost of [true,false]) {
 physics=new Physics();scene=new THREE.Scene();if(dock)buildHub13({physics,lightPool,scene});else buildCompany({physics,lightPool});ship=buildShip({physics,lightPool,scene});
 const g=makeGame({isHost,profile:{shipyard:fleetLayout(vessel)}});g.run.sy=fleetLayout(vessel);const yard=installShipyard(g);g.mods.emit('hostStart',g);g.mods.emit('update',.4,g);
 function walk(open){ship.door.setOpen(open,true);physics.world.step();const actor=physics.createKinematicCapsule(new THREE.Vector3(dock?5.2:-9.5,-.33,dock?11:-12),.56,.34,G.PLAYER,G.STATIC|G.DOOR),cc=physics.createController();physics.world.step();const route=dock?[[5.2,7.5],[2.6,7.5],[2.6,2.7]]:[[-9.5,7.5],[2.6,7.5],[2.6,2.7]];let stage=0;for(let i=0;i<1300;i++){const p=actor.body.translation();let [x,z]=route[stage],dx=x-p.x,dz=z-p.z,dist=Math.hypot(dx,dz);if(dist<.07&&stage<route.length-1){stage++;[x,z]=route[stage];dx=x-p.x;dz=z-p.z;dist=Math.hypot(dx,dz);}const k=dist>.1?.1/dist:1;cc.computeColliderMovement(actor.col,{x:dx*k,y:0,z:dz*k},undefined,groups(G.PLAYER,G.STATIC|G.DOOR));const d=cc.computedMovement();const np={x:p.x+d.x,y:p.y+d.y,z:p.z+d.z};actor.body.setNextKinematicTranslation(np);actor.body.setTranslation(np,true);physics.world.propagateModifiedBodyPositionsToColliders();physics.world.step();}const p=actor.body.translation();physics.world.removeCharacterController(cc);physics.removeBody(actor.body);return p;}
 const opened=walk(true);assert.ok(insideShip(new THREE.Vector3(opened.x,opened.y-.9,opened.z)),`${vessel} native open entry blocked`);const closed=walk(false);assert.ok(closed.z>3.7,`${vessel} closed door should stop body`);yard.dispose();physics.world.free();
}

console.log("boarding19: all four hulls native street/dock capsule routes enter open ship; closed door refuses PASS");
