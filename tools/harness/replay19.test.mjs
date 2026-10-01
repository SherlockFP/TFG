import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installReplay19 } from '../../src/game/replay19.js';
import { newReplay, startReplay, advanceReplay, replayToken } from '../../src/game/replay19_core.js';
import { CreatureManager, BEHAVIORS } from '../../src/entities/creatures.js';
import { AudioManager } from '../../src/audio/audio.js';

function fixture(host=true) {
  const events=new Map(),sounds=[],visuals=[],claims=[];
  let off=false,wall=false;
  const pos=new THREE.Vector3(10,1.25,0),p={id:'a',zone:'out',pos:new THREE.Vector3(10,0,1.8),dead:false,inShip:false};
  const game={isHost:host,time:100,run:{phase:'moon',moon:'hamsi',seed:17,day:0,fc:{}},engine:{scene:new THREE.Scene()},player:{indoor:false,dead:false},
    world:{moonId:'hamsi',outdoor:{broadcast18:{plan:{replayControl:pos},setReplay:s=>visuals.push(s)}}},
    mods:{on:(k,fn)=>{events.set(k,fn);return()=>events.delete(k);}},physics:{raycast:()=>wall?{}:null},
    feedcams:{netOff:()=>off},aiPlayerById:id=>id==='a'?p:null,aiPlayers:()=>[],audio:{play:(...a)=>sounds.push(a)},
    net:{request:(...a)=>claims.push(a)},broadcastRun(){},
  };
  game.creatures=new CreatureManager(game);
  const api=installReplay19(game);
  const tick=t=>{game.time=t;events.get('update')(0,game);};
  return {game,api,p,events,sounds,visuals,claims,tick,cut:()=>off=true,wall:v=>wall=v};
}
const W=fixture(),P=fixture(false);
W.game.broadcastRun=()=>{P.game.run.replay19=structuredClone(W.game.run.replay19);P.tick(W.game.time);};
const req=()=>({token:replayToken(W.game.run),rev:W.api.state().rev,op:'play'});
const initial=req();
W.p.pos.x+=20;assert.equal(W.api.hostReq(initial,'a'),false,'remote request rejected');W.p.pos.x-=20;
W.wall(true);assert.equal(W.api.hostReq(initial,'a'),false,'wall blocks physical use');W.wall(false);
assert.equal(W.api.hostReq({...initial,token:'stale'},'a'),false,'stale landing rejected');
W.p.dead=true;assert.equal(W.api.hostReq(initial,'a'),false,'dead player rejected');W.p.dead=false;
assert.equal(W.api.hostReq(initial,'a'),true,'near living crew starts one recording');
assert.equal(W.api.hostReq(initial,'a'),false,'duplicate packet cannot restart');
W.tick(107.99);assert.equal(W.game.creatures.noises.length,0,'eight-second warning is silent');
W.tick(108);assert.equal(W.game.creatures.noises.length,1,'live stage emits real native noise');
assert.deepEqual(P.api.state(),W.api.state(),'replica charge and live stage match host');
assert.equal(P.game.creatures.noises.length,0,'replica never emits authoritative AI noise');
// The actual native Hound behavior reads the actual native manager queue.
let destination=null;
const hound={id:'hound',type:'hound',zone:'out',pos:new THREE.Vector3(20,.35,0),data:{howlT:100},state:'idle',t:0,cooldown:0,def:{run:5,walk:2},setState(s){this.state=s;}};
W.game.creatures.goToLazy=(_,x,z)=>destination={x,z};W.game.creatures.follow=()=>false;
BEHAVIORS.hound(hound,.1,W.game.creatures);
assert.equal(hound.state,'run','actual Hound investigates recording');
assert.deepEqual(destination,{x:10,z:0},'Hound targets ground-level transmitter, not crew');
W.game.stealth={hearDist:()=>10000};hound.state='idle';destination=null;
BEHAVIORS.hound(hound,.1,W.game.creatures);assert.equal(destination,null,'native acoustic obstruction still prevents hearing');delete W.game.stealth;
W.tick(112);W.tick(116);W.tick(119.9);W.tick(120);
assert.equal(W.game.creatures.noises.length,3,'exactly three bounded pulses');
assert.equal(W.sounds.length,3);assert.equal(P.sounds.length,3,'peer audio matches pulses without repeat spam');
assert.equal(W.sounds[0][1].refDistance,4);assert.equal(W.sounds[0][1].maxDistance,45,'native audio API receives intended distance options');
// Exercise the actual audio graph boundary: a capture-only sound spy misses unknown bus names.
class AudioNodeFixture {
  constructor(){const param=()=>({value:0,setTargetAtTime(){}});for(const key of ['gain','frequency','playbackRate','positionX','positionY','positionZ'])this[key]=param();}
  connect(destination){assert.ok(destination instanceof AudioNodeFixture,'positional playback must connect to an actual native bus');return destination;}
  start(){} stop(){}
}
const audio=new AudioManager({});
audio.ctx={currentTime:10,createBufferSource:()=>new AudioNodeFixture(),createGain:()=>new AudioNodeFixture(),createBiquadFilter:()=>new AudioNodeFixture(),createPanner:()=>new AudioNodeFixture()};
audio.buses={sfx:new AudioNodeFixture()};audio.reverb=new AudioNodeFixture();audio.getBuffer=()=>({});audio.meta=()=>({vol:1});
assert.doesNotThrow(()=>audio.play(...W.sounds[0]),'actual AudioManager routes the recording pulse without AudioNode.connect failure');
assert.equal(audio.handles.size,1,'native graph creates one positional playback handle');
assert.equal(W.api.state().stage,'spent');assert.equal(W.api.hostReq(req(),'a'),false,'finite charge never refills');
// Migration preserves the existing ledger, and network cuts consume rather than refund it.
const C=fixture();assert(C.api.hostReq({token:replayToken(C.game.run),rev:0,op:'play'},'a'));C.tick(108);C.cut();C.tick(109);
assert.equal(C.api.state().stage,'spent');assert.equal(C.game.creatures.noises.length,1,'cut cancels remaining pulses');
const M=fixture(false);M.game.run.replay19=structuredClone(C.api.state());M.game.isHost=true;M.tick(200);assert.equal(M.api.state().used,true,'new host preserves spent charge');
assert.equal(M.api.hostReq({token:replayToken(M.game.run),rev:M.api.state().rev,op:'play'},'a'),false);
M.game.run.day++;M.tick(201);assert.equal(M.api.state().used,false,'new landing gets exactly one new recording');
assert.equal(W.claims.length,0,'no reward/score request is generated');
const s=newReplay('x');assert(startReplay(s,0,0,true));assert.equal(advanceReplay(s,18,true).pulse,true);assert.equal(advanceReplay(s,18.1,true).pulse,false,'stalled timer never bursts missed pulses');
for(const x of [W,P,C,M])x.api.dispose();
console.log('replay19: PASS (native installer/peer/migration/finite charge and actual Hound perception)');
