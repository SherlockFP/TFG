import assert from 'node:assert/strict';
import {normalizeTurnServers,readTurnServers27} from '../../src/net/turn_config27.js';
import {APP_ID,TrysteroTransport} from '../../src/net/transport.js';

const valid={urls:[' turn:RELAY.example:03478 ', 'turn:relay.example:3478','turns:relay.example:443?transport=tcp'],username:'fixture-user',credential:'fixture-only'};
const normalized=normalizeTurnServers([null,42,{urls:'https://invalid.example'},{urls:'turn:bad.example',username:{}},valid,{urls:'turn:relay.example:3478',username:valid.username,credential:valid.credential}]);
assert.equal(normalized.length,1);assert.deepEqual(normalized[0].urls,['turn:relay.example:3478','turns:relay.example:443?transport=tcp']);
assert.ok(normalized[0].username===valid.username&&normalized[0].credential===valid.credential,'string credentials preserved without conversion');
assert.deepEqual(normalizeTurnServers(' turn:one.example:3478, \n turns:two.example:443?transport=TCP \n'),[{urls:['turn:one.example:3478','turns:two.example:443?transport=tcp'],username:'',credential:''}]);
assert.equal(normalizeTurnServers(JSON.stringify(valid)).length,1);
for(const bad of [undefined,null,{},false,34,'{bad json','http://example.test','stun:example.test','turn://example.test','turn:host.test:0','turn:host.test:65536','turn:host.test?transport=bad','turn:[::::]:3478','turn:user:pass@host.test:3478'])assert.equal(normalizeTurnServers(bad).length,0,'invalid optional entry skipped');
assert.deepEqual(normalizeTurnServers({urls:['turn:[::1]:3478','turns:[2001:db8::1]:443?transport=tcp']} )[0].urls,['turn:[::1]:3478','turns:[2001:db8::1]:443?transport=tcp']);
assert.equal(normalizeTurnServers({urls:'turn:host.test',credential:17}).length,0);
assert.equal(normalizeTurnServers({urls:'turn:host.test',credential:'x'.repeat(2049)}).length,0);
const bounded=normalizeTurnServers(Array.from({length:100},(_,i)=>({urls:Array.from({length:100},(_,n)=>`turn:r${i}-${n}.test:3478`)})));
assert.ok(bounded.length<=8&&bounded.every(row=>row.urls.length<=8));
assert.equal(normalizeTurnServers('x'.repeat(16385)).length,0);
const mixed=readTurnServers27({VITE_TURN_URL:' turn:env.test:3478, \n turns:env.test:443?transport=tcp ',VITE_TURN_USER:'build-user',VITE_TURN_CRED:'build-fixture'}, {getItem(key){assert.equal(key,'tfg.turn');return JSON.stringify([{urls:'turn:local.test:3478'}, {urls:'http://bad.test'}, {urls:'turn:bad-auth.test',credential:{}}]);}});
assert.equal(mixed.length,2);assert.deepEqual(mixed[0].urls,['turn:env.test:3478','turns:env.test:443?transport=tcp']);assert.deepEqual(mixed[1].urls,['turn:local.test:3478']);
assert.equal(readTurnServers27({}, {getItem(){throw Error('fixture storage denied');}}).length,0);
assert.equal(readTurnServers27({VITE_TURN_URL:'turn:env.test:3478'}, {getItem(){return '{broken';}}).length,1,'bad saved JSON leaves environment relay intact');

// NATIVE_INTEGRATION: real TrysteroTransport.join cfg assembly and room setup,
// with a recording strategy-module boundary. No relay/WebRTC reachability claim.
const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
let stored=null;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored}});
const configs=[],rooms=[];
function moduleFixture(){return {selfId:'fixture-self',joinRoom(cfg,id,options){configs.push({cfg,id,options});const room={actions:[],makeAction(name){this.actions.push(name);return{send:()=>Promise.resolve()};},leave(){this.left=true;}};rooms.push(room);return room;}};}
try{
 stored=JSON.stringify([{urls:'https://bad.test'},{urls:'turn:bad-auth.test',credential:9},valid]);
 const relay=new TrysteroTransport('nostr');relay.mod=moduleFixture();await relay.join('NETWORK27','fixture-password');
 const actual=configs.at(-1).cfg;assert.equal(actual.appId,APP_ID);assert.equal(actual.password,'fixture-password');assert.equal(actual.relayConfig.redundancy,10);assert.equal(actual.relayConfig.warnOnRelayFailure,false);
 assert.equal(actual.turnConfig.length,1);assert.deepEqual(actual.turnConfig[0].urls,normalized[0].urls);assert.equal(relay.hasTurn,true);assert.deepEqual(rooms.at(-1).actions,['m','b']);
 assert.ok(!Object.hasOwn(actual,'rtcConfig')&&!Object.hasOwn(actual,'stunConfig'),'direct WebRTC/STUN defaults are not replaced');
 relay.leave();assert.equal(rooms.at(-1).left,true);
 for(const bad of ['{bad json',JSON.stringify([{urls:'stun:bad.test'},{urls:'turn:bad.test',username:{}}])]){
  stored=bad;const direct=new TrysteroTransport('mqtt');direct.mod=moduleFixture();await direct.join('DIRECT27');const cfg=configs.at(-1).cfg;
  assert.equal(Object.hasOwn(cfg,'turnConfig'),false);assert.equal(direct.hasTurn,false);assert.equal(cfg.appId,APP_ID);assert.equal(Object.hasOwn(cfg,'password'),false);assert.equal(Object.hasOwn(cfg.relayConfig,'redundancy'),false);direct.leave();
 }
 // Config work leaves the real existing leave-during-load generation guard intact.
 let release;const delayed=new TrysteroTransport('nostr');delayed.load=()=>new Promise(resolve=>{release=resolve;});const pending=delayed.join('LEFT27');const before=configs.length;delayed.leave();release(moduleFixture());await pending;assert.equal(configs.length,before);assert.equal(delayed.room,null);
}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
console.log('network27: bounded sanitized TURN inputs, environment/storage recovery and actual transport join configuration pass (recording strategy boundary; no Internet/WebRTC proof)');
