import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { insideShip } from '../world/ship.js';
import { wrapMethod } from './dailyEvents.js';
import { CUSTODY,CAPACITY,MAX_WEIGHT,loadable,takeCargo,portalAllowed,slotCost } from './cargo13_core.js';
import { makeTrolley } from './cargo13_models.js';
import { tx } from './cargo13_text.js';
HOST_ONLY.add('cg13state');HOST_ONLY.add('cg13deny');
export function installCargo13(game){
 const offs=[],restores=[];let model=null,col=null,sendT=0,mapKey='',active=false;const lastReq=new Map(),transfers=new Map();
 const enabled=()=>['landing','moon','company'].includes(game.run?.phase)||(game.run?.phase==='orbit'&&game.run?.fleet13?.docked);
 const state=()=>game.run?.cargo13;
 const pos=()=>new THREE.Vector3(...(state()?.p||[8,0,7]));
 const point=(x,y,z)=>new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),state()?.yaw||0).add(pos());
 const publish=(full=false)=>{if(!game.isHost||!state())return;game.net.broadcast('cg13state',{...state(),p:[...state().p],ids:[...state().ids]});if(full)game.broadcastRun(['cargo13']);};
 function unload(id){const s=state(),it=game.items.get(id);if(!s||!takeCargo(s,id))return;if(!it||it.holder!==CUSTODY)return;
 const n=s.ids.length,p=point(1.4+(n%2)*.5,.65,-.6+Math.floor(n/2)*.4);if(insideShip(pos())&&!insideShip(p)){p.copy(pos());p.y+=.8;}game.net.broadcast('it',{e:'drop',id,p:p.toArray(),q:[0,0,0,1],lv:[0,0,0]});}
 function release(all=false){const s=state();if(!s)return;s.driver=null;if(all)for(const id of [...s.ids])unload(id);publish(true);}
 function cleanup(){if(model){for(const it of game.items.all())if(it.holder===CUSTODY&&it.obj.parent===model.root){game.scene.add(it.obj);it.obj.visible=false;}model.dispose();model=null;}if(col){game.physics.removeCollider(col);col=null;}active=false;}
 function build(world){cleanup();if(!enabled())return;mapKey=`${world.moonId}:${world.seed}:${game.run.day}:${game.run.fleet13?.docked?'dock':''}`;
 if(game.isHost&&state()?.map!==mapKey){release(true);const p=[7.7,world.company?.groundY??world.terrain?.heightAt?.(7.7,7)??0,7];game.run.cargo13={map:mapKey,p,yaw:0,driver:null,ids:[]};publish(true);}
 model=makeTrolley();game.scene.add(model.root);active=true;const p=pos();col=game.physics.addStaticBox(p.x,p.y+.8,p.z,.62,.35,.88,0,G.BIG,{kind:'cargo13'});}
 function gate(d,from){if(!game.isHost||!active||game.run?.phase!=='moon'||!Number.isInteger(d?.index)||d.index<0||typeof d.toInside!=='boolean')return;
 const s=state(),pl=game.aiPlayerById(from);if(!s||!pl||pl.dead)return;
 const inside=d.index===0?game.world.facility?.mainDoor:game.world.facility?.fireDoors?.[d.index-1];
 const outside=d.index===0?game.world.outdoor?.mainExit:game.world.outdoor?.fireExits?.[d.index-1];
 const src=d.toInside?outside:inside,dst=d.toInside?inside:outside;
 if(!src||!dst||!portalAllowed(s.driver,from,pl.pos,pos(),src.pos))return;
 const yaw=d.toInside?dst.faceYaw:dst.yaw,forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
 const dest=dst.spawn.clone().addScaledVector(forward,1.4);const floor=game.physics.raycast(dest.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),2,G.STATIC|G.DOOR);
 if(!floor||floor.normal.y<.6)return;dest.y=floor.point.y;
 // Reject a basket intersecting an entrance wall; coordinates are derived only from real map portals.
 const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));for(const side of [-.6,.6]){const a=dest.clone().addScaledVector(right,side);a.y+=.65;const b=a.clone().addScaledVector(forward,.8);if(!game.physics.lineOfSight(a,b,G.STATIC|G.DOOR))return;}
 s.p=dest.toArray();s.yaw=yaw;transfers.set(from,performance.now()+1500);publish(true);game.net.sendTo(from,'tp',{p:dst.spawn.toArray(),yaw});
 }
 function request(d,from){if(!game.isHost||!active||!enabled()||game.run?.phase==='landing'||!d)return;const s=state(),pl=game.aiPlayerById(from);if(!s||!pl||pl.dead||pl.pos.distanceTo(pos())>3.7)return;
 const now=performance.now();if(now-(lastReq.get(from)||0)<160)return;lastReq.set(from,now);
 const deny=()=>game.net.sendTo(from,'cg13deny',{});
 if(d.op==='drive'){if(s.driver===from)s.driver=null;else if(!s.driver&&pl.pos.distanceTo(point(0,0,1.4))<2.5){s.driver=from;game.net.sendTo(from,'sys',{text:tx('Steer with movement and view; use handles [E] to release.'),kind:'info'});}else return deny();publish(true);return;}
 if(s.driver)return deny();
 if(d.op==='load'){const it=game.items.get(d.id);if(!loadable(it,from,s.ids,id=>game.items.get(id)))return deny();if(!it.holder&&it.obj.getWorldPosition(new THREE.Vector3()).distanceTo(pos())>2.6)return deny();s.ids.push(it.id);it.lastHolder=from;game.net.broadcast('it',{e:'held',id:it.id,h:CUSTODY,sl:0});publish(true);}
 else if(d.op==='unload'){if(!s.ids.includes(d.id))return deny();unload(d.id);publish(true);}
 else if(d.op==='all'){release(true);}
 }
 const send=(op,id)=>game.net.request('cg13act',{op,id});
 const ready=net=>{net.on_('cg13state',d=>{if(!game.run||!d||!Array.isArray(d.p)||d.p.length!==3||!d.p.every(Number.isFinite)||!Array.isArray(d.ids))return;game.run.cargo13={...d,ids:d.ids.slice(0,CAPACITY)};});net.on_('cg13deny',()=>game.ui.toast(tx('Trolley request refused: stop nearby and check capacity.'),'warn'));};
 offs.push(game.mods.on('netReady',ready));if(game.net)ready(game.net);offs.push(game.mods.on('registerHandlers',H=>{H('cg13act',request);H('cg13gate',gate);}));
 offs.push(game.mods.on('mapLoaded',build));
 restores.push(wrapMethod(game,'useExit',old=>function(index,toInside){if(state()?.driver===game.selfId){game.net.request('cg13gate',{index,toInside});return;}return old.call(this,index,toInside);}));
 restores.push(wrapMethod(game,'hostBeginTakeoff',old=>function(...args){if(args[0]==='lever'&&this.run?.departure38)return old.apply(this,args);if(this.isHost)release(true);return old.apply(this,args);}));
 restores.push(wrapMethod(game,'hostOnPlayerLeave',old=>function(id,...args){if(state()?.driver===id)release();return old.call(this,id,...args);}));
 restores.push(wrapMethod(game,'unloadMap',old=>function(...args){if(this.isHost)release(true);cleanup();return old.apply(this,args);}));
 offs.push(game.mods.on('phase',()=>{const s=state();if(!enabled()&&s&&(s.driver||s.ids.length)&&game.isHost)release(true);}));
 offs.push(game.mods.on('interactables',out=>{if(!active||!enabled()||game.run?.phase==='landing'||!state())return;const s=state();if(s.driver===game.selfId){for(const entry of out){const text=typeof entry.label==='string'?entry.label:'';if([tx('Enter facility [E]'),tx('Exit facility [E]'),tx('Enter fire exit [E]'),tx('Use fire exit [E]')].includes(text))entry.label=tx('Take trolley through doorway [E]');}}out.push({pos:point(0,1.4,1.25),r:.4,label:tx(s.driver===game.selfId?'Cargo trolley: release handles [E]':s.driver?'Trolley occupied':'Cargo trolley: push [E]'),action:()=>send('drive')});if(s.driver)return;
 const used=s.ids.reduce((n,id)=>n+slotCost(game.items.get(id)),0),weight=s.ids.reduce((n,id)=>n+(game.items.get(id)?.def?.weight||0),0);const held=game.player.heldItem();let candidate=held;
 if(!candidate)candidate=[...game.items.all()].filter(it=>loadable(it,game.selfId,s.ids,id=>game.items.get(id))&&it.obj.getWorldPosition(new THREE.Vector3()).distanceTo(pos())<2.5).sort((a,b)=>a.obj.position.distanceToSquared(pos())-b.obj.position.distanceToSquared(pos()))[0];
 if(candidate)out.push({pos:point(0,1.15,-.5),r:.45,label:tx(held?'Load held item [E]':'Load nearby item [E]')+` (${used}/${CAPACITY} | ${weight}/${MAX_WEIGHT})`,action:()=>send('load',candidate.id)});
 if(s.ids.length){out.push({pos:point(.65,1.1,0),r:.35,label:tx('Unload one [E]'),action:()=>send('unload',s.ids.at(-1))});out.push({pos:point(-.65,1.1,0),r:.35,label:tx('Unload all [E]'),action:()=>send('all')});}
 }));
 let colliderPose=null;
 const perfScratch={from:new THREE.Vector3(),look:new THREE.Vector3(),target:new THREE.Vector3(),dest:new THREE.Vector3(),right:new THREE.Vector3(),a:new THREE.Vector3(),b:new THREE.Vector3(),floorOrigin:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0),p:new THREE.Vector3()};
 offs.push(game.mods.on('update',dt=>{if(!active||!model||!state())return;const s=state();if(game.isHost&&s.driver){const pl=game.aiPlayerById(s.driver);if(pl&&performance.now()<(transfers.get(s.driver)||0)&&pl.pos.distanceTo(pos())>5){}else if(!pl||pl.dead||!enabled()||pl.pos.distanceTo(pos())>5||Math.abs(pl.pos.y-s.p[1])>2.5){release();}else{
 const from=perfScratch.from.fromArray(s.p),look=perfScratch.look.copy(pl.look);look.y=0;look.normalize();const target=perfScratch.target.copy(pl.pos).addScaledVector(look,1.55);target.y=from.y;const delta=target.sub(from);const speed=3.8/(1+s.ids.reduce((n,id)=>n+(game.items.get(id)?.def?.weight||0),0)/MAX_WEIGHT);if(delta.length()>speed*dt)delta.setLength(speed*dt);
 const dest=perfScratch.dest.copy(from).add(delta),yaw=Math.atan2(-look.x,-look.z);let clear=true;const right=perfScratch.right.set(Math.cos(yaw),0,-Math.sin(yaw));
 for(const side of [-.65,0,.65])for(const h of [.35,1.1]){const a=perfScratch.a.copy(from).addScaledVector(right,side);a.y+=h;const b=perfScratch.b.copy(dest).addScaledVector(right,side).addScaledVector(look,.9);b.y+=h;if(!game.physics.lineOfSight(a,b,G.STATIC|G.DOOR))clear=false;}
 const floor=game.physics.raycast(perfScratch.floorOrigin.set(dest.x,from.y+1.2,dest.z),perfScratch.down,2.3,G.STATIC|G.DOOR);if(!floor||floor.normal.y<.6||Math.abs(floor.point.y-from.y)>.65)clear=false;
 if(clear){s.p=[dest.x,floor.point.y,dest.z];s.yaw=yaw;}
 sendT+=dt;if(sendT>=.1){sendT=0;publish();}
 }}
 const p=perfScratch.p.fromArray(s.p);model.root.position.copy(p);model.root.rotation.y=s.yaw||0;if(col&&(!colliderPose||colliderPose.col!==col||colliderPose.x!==p.x||colliderPose.y!==p.y||colliderPose.z!==p.z||colliderPose.yaw!==s.yaw)){col.setTranslation({x:p.x,y:p.y+.8,z:p.z});col.setRotation({x:0,y:Math.sin((s.yaw||0)/2),z:0,w:Math.cos((s.yaw||0)/2)});colliderPose={col,x:p.x,y:p.y,z:p.z,yaw:s.yaw};}
 for(let n=0;n<s.ids.length;n++){const it=game.items.get(s.ids[n]);if(it?.holder!==CUSTODY)continue;if(it.obj.parent!==model.root)model.root.add(it.obj);it.obj.visible=true;it.obj.position.set((n%2-.5)*.5,.85+Math.floor(n/4)*.25,(Math.floor(n/2)%2-.5)*.65);it.obj.rotation.set(0,n*.6,0);const size=it.obj.userData.size;const scale=size?Math.min(1,(it.def?.kind==='big'?.95:.5)/Math.max(size.x,size.y,size.z)):.5;it.obj.scale.setScalar(scale);}
 }));
 return {get state(){return state();},release,dispose(){if(game.isHost)release(true);offs.forEach(f=>f());restores.reverse().forEach(f=>f());cleanup();}};
}
