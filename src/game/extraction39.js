import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {insideShip,inDoorway} from '../world/ship.js';
import {standingConsole38} from './console38.js';

// Captured by the physical interaction; a delayed start/cancel cannot toggle a
// later countdown, another map or an elected host's departure state.
export function leverReceipt39(game){
 const r=game.run||{},revision=r.departure39Revision;
 return {token:JSON.stringify([r.runId||'',r.moon||'',r.seed||0,r.day||0,r.phase||'',game.net?.hostEpoch||0,r.fleet13?.docked?1:0]),revision:Number.isSafeInteger(revision)&&revision>=0?revision:0};
}
export function leverReach39(game,from){
 if(!game.isHost||!['orbit','moon','company'].includes(game.run?.phase))return false;
 const p=from===game.selfId?game.player:game.remotes?.get(from),target=game.ship?.points?.lever;
 if(!p?.pos||p.dead||p.downed||game.downed?.isDowned?.(from)||!target||typeof game.physics?.raycast!=='function')return false;
 if(from!==game.selfId&&(!game.net?.players?.has(from)||game.net?.lost?.has(from)))return false;
 if(![p.pos.x,p.pos.y,p.pos.z].every(Number.isFinite)||!standingConsole38(game,p))return false;
 const eye=from===game.selfId&&p.eyePos?p.eyePos():p.pos.clone().add(new THREE.Vector3(0,p.crouch?1:1.62,0));
 const delta=target.clone().sub(eye),distance=delta.length();
 // Native point selector: reach2.7 + radius.6, with its perpendicular radius.
 if(!Number.isFinite(distance)||distance<.01||distance>3.36)return false;
 const hit=game.physics.raycast(eye,delta.divideScalar(distance),distance,G.STATIC|G.DOOR,p.col);
 return !hit||hit.distance>distance-.15;
}
export function departureCrew39(game){
 const players=game.aiPlayers?.()||[{id:game.selfId,...game.player,inShip:!!game.player?.pos&&insideShip(game.player.pos)},...[...(game.remotes?.entries()||[])].map(([id,p])=>({id,...p,inShip:!!p.pos&&insideShip(p.pos)}))];
 let living=0,aboard=0;
 for(const p of players){if(p.dead||!p.pos)continue;living++;if(p.inShip||inDoorway(p.pos))aboard++;}
 return {aboard,total:living,away:living-aboard};
}
