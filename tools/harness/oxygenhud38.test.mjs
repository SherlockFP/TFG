import './ship2_env.mjs';
import assert from 'node:assert/strict';
import {Emitter} from '../../src/core/events.js';
import {installOxygen38} from '../../src/game/oxygen38.js';
let writes=0,textWrites=0;
const original=document.createElement;
document.createElement=()=>({style:new Proxy({},{set(obj,key,value){writes++;obj[key]=value;return true;}}),set textContent(value){textWrites++;},remove(){}});
document.body.append=()=>{};
const mods=new Emitter(),game={mods,isHost:true,time:0,run:{runId:'hud',phase:'orbit'},world:{},player:{},selfId:'host',aiPlayers:()=>[],broadcastRun(){}};
const api=installOxygen38(game);mods.emit('update',1/60,game);writes=0;textWrites=0;
for(let i=0;i<120;i++){game.time+=1/60;mods.emit('update',1/60,game);}
assert.equal(writes,0,'unchanged hidden oxygen HUD must not write styles every frame');
assert.equal(textWrites,0,'unchanged oxygen percentage must not write text every frame');
api.dispose();document.createElement=original;console.log('oxygenhud38: unchanged oxygen HUD produces zero DOM writes passed');
