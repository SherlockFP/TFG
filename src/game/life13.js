import * as THREE from 'three';
import { t, sysMsg } from '../core/i18n.js';
import { G } from '../physics/physics.js';
import { MOONS } from './moons.js';
import { isSellable } from './items.js';
import { CITY_ROUTES13, routePoint13, surveyStep13 } from './life13_core.js';
import { createCitizen13 } from '../models/life13.js';
import './life13_text.js';
import { wrapMethod } from './dailyEvents.js';
export function installLife13(game) {
 const offs=[],rate=new Map();let actors=[],beacon=null,kind=null,root=null,time=0,lastWire=-1,wireCD=0,disposed=false;
 const token=()=>`${game.run?.seed}:${game.run?.day}:${game.run?.moon}:${game.fleet13?.docked?.()?'hub':'field'}`;
 const day=()=>`${game.run?.seed}:${game.run?.day}`;
 const state=()=>game.run?.life13?.day===day()?game.run.life13:null;
 function ensure(){if(game.isHost && !state())game.run.life13={day:day(),time:0,mission:{stage:'idle',paid:0}};return state();}
 const notify=(from,key,vars={})=>game.net?.sendTo(from,'sys',sysMsg(key,vars,'info'));
 const terrain=()=>game.world?.terrain || game.world?.outdoor?.terrain;
 const yAt=(x,z)=>kind==='company'?game.world.company.groundY:(terrain()?.heightAt?.(x,z) ?? -1.25);
 const clearRay=(a,b)=>a.distanceTo(b)<.01 || !game.physics?.raycast?.(a,new THREE.Vector3().subVectors(b,a).normalize(),a.distanceTo(b),G.STATIC|G.DOOR);
 const active=()=>kind==='hub'?!!game.fleet13?.docked?.():kind==='company'?game.run?.phase==='company':kind==='moon'&&game.run?.phase==='moon';
 function clearPoint(x,z){const y=yAt(x,z);return Number.isFinite(y) && !terrain()?.blocked?.(x,z,.5) && !game.physics?.raycast?.({x,y:y+.25,z},{x:0,y:1,z:0},1.6,G.STATIC|G.DOOR);}
 function safeRoute(route){
  for(let i=0;i<route.length;i++){
   const p=route[i],q=route[(i+1)%route.length],a=new THREE.Vector3(p[0],yAt(...p)+1,p[1]),b=new THREE.Vector3(q[0],yAt(...q)+1,q[1]);
   if(!clearPoint(...p)||!clearPoint(...q)||Math.abs(a.y-b.y)>.7 || !clearRay(a,b))return false;
   // Check the body-width margins, so a centerline cannot approve a wall-clipping loop.
   const offset=new THREE.Vector3(b.z-a.z,0,a.x-b.x).normalize().multiplyScalar(.42);
   if(!clearRay(a.clone().add(offset),b.clone().add(offset)) || !clearRay(a.clone().sub(offset),b.clone().sub(offset)))return false;
   for(let j=1;j<5;j++){const k=j/5;if(!clearPoint(p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k))return false;}
  }return true;
 }
 function clear(){for(const a of actors)a.model.dispose();actors=[];if(beacon){beacon.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});beacon.group.removeFromParent();}beacon=null;root=null;kind=null;rate.clear();}
 const restoreUnload=wrapMethod(game,'unloadMap',previous=>function(...args){clear();return previous.apply(this,args);});
 function build(world){
  clear();if(disposed)return;
  if(world.company){kind='company';root=world.company.group;}
  else if(world.outdoor?.vendorSpace && game.fleet13?.docked?.()){kind='hub';root=world.outdoor.group;}
  else if(world.facility && world.outdoor?.group && terrain()?.heightAt && !MOONS[game.run?.moon]?.home && !MOONS[game.run?.moon]?.expedition){kind='moon';root=world.outdoor.group;}
  else return;
  const st=ensure();time=st?.time || 0;lastWire=st?.time ?? -1;
  for(const [i,route]of CITY_ROUTES13[kind].entries()){
   if(!safeRoute(route))continue;
   const model=createCitizen13(i);root.add(model.root);const p=routePoint13(route,time+i*7);model.root.position.set(p.x,yAt(p.x,p.z),p.z);
   actors.push({id:i,route,model,pos:new THREE.Vector3(p.x,yAt(p.x,p.z)+1.1,p.z),check:0});
  }
  if(kind==='moon' && actors.length){
   // Optional objective lives beside the flattened ship approach, away from the route/entrance.
   for(const [x,z]of [[-16,20],[-15,17],[-18,14]]){
    if(!clearPoint(x,z) || !safeRoute([actors[0].route[0],[x,z]]))continue;
    const group=new THREE.Group(),base=new THREE.Mesh(new THREE.CylinderGeometry(.3,.4,.15,6),new THREE.MeshLambertMaterial({color:0x263d42}));base.position.y=.08;group.add(base);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1.1,5),new THREE.MeshLambertMaterial({color:0x538b85}));pole.position.y=.65;group.add(pole);
    const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.22),new THREE.MeshBasicMaterial({color:0x86e0ca}));marker.position.y=1.35;group.add(marker);group.position.set(x,yAt(x,z),z);root.add(group);
    beacon={group,pos:new THREE.Vector3(x,yAt(x,z)+1,z)};break;
   }
  }
  if(game.isHost)game.broadcastRun?.(['life13']);
 }
 function interact(d,from){
  if(disposed||!game.isHost||!root||!active()||!d||d.token!==token())return;
  const p=game.aiPlayerById?.(from)||game.aiPlayers?.().find(p=>p.id===from);
  if(!p||p.dead||p.downed||p.inShip)return;
  const actor=actors.find(a=>a.id===d.id),target=d.op==='checkpoint'?beacon?.pos:actor?.pos;
  if(!target||p.pos.distanceTo(target)>4.2)return;
  if(!clearRay(p.pos.clone().add(new THREE.Vector3(0,1.4,0)),target))return;
  const now=Date.now()/1000;if(now-(rate.get(from)||0)<.65)return;rate.set(from,now);
  if(d.op==='talk'){
   notify(from,kind==='hub'?'Relay Dock is where crews meet. Choose a vessel together, then board at the departure kiosk.':kind==='company'?(d.id%2?'Our crew used to chase every noise. Now we watch the cameras and save our strength for the return trip.':'The Algorithm buys content. The House buys hope. I prefer the contract desk: at least the terms are written down.'):'We are surveyors, not soldiers. Help mark the field beacon, or sell us one carried scrap. One crew reward each day.');return;
  }
  if(kind!=='moon'||game.run?.phase!=='moon')return;
  const st=ensure();if(!st)return;
  if(d.op==='accept'&&!beacon)return;
  let scrap=null;
  if(d.op==='barter'){
   scrap=[...game.items.all()].filter(it=>it.holder===from&&it.state==='held'&&!it.inv&&['scrap','big','fish','drop'].includes(it.def?.kind)&&!it.soulbound&&!it.selling&&it.type!=='body'&&isSellable(it.def)&&Number.isFinite(it.value)&&it.value>0).sort((a,b)=>a.value-b.value)[0];
   if(!scrap){notify(from,'Bring a sellable scrap in your hands. Equipment and soulbound items are protected.');return;}
  }
  const result=surveyStep13(st.mission,d.op,now,token());st.mission=result.state;
  if(result.event==='paid'){
   const amount=d.op==='barter'?Math.min(12,Math.max(1,Math.floor(scrap.value*.3))):18;
   st.mission.paid=amount; // Reserve reward before any item/network callback: repeated requests cannot duplicate it.
   if(scrap)game.net.broadcast('it',{e:'rm',id:scrap.id});
   game.run.credits=(game.run.credits|0)+amount;game.broadcastRun?.(['life13','credits']);game.hostSave?.();notify(from,'Survey crew reward: +{n} credits.',{n:amount});
  }else{
   const keys={accepted:'Optional survey: visit the mint beacon, then return to a surveyor. Reward: 18 crew credits.',visited:'Survey marked. Return to a surveyor for payment.',closed:'This crew already received its survey reward today.',wait:'The survey needs a little more time. Keep your progress and return shortly.'};
   notify(from,keys[result.event]);game.broadcastRun?.(['life13']);
  }
 }
 offs.push(game.mods.on('mapLoaded',(world,g)=>{if(g===game)build(world);}));
 offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g===game)H('l13req',interact);}));
 offs.push(game.mods.on('update',(dt,g)=>{
  if(g!==game||disposed||!root||!active())return;
  const st=ensure();if(!st)return;
  if(!game.isHost&&lastWire!==st.time){time=st.time||0;lastWire=st.time;}
  time+=Math.max(0,Math.min(.2,dt));
  if(game.isHost){st.time=time;wireCD+=dt;if(wireCD>2){wireCD=0;game.broadcastRun?.(['life13']);}}
  for(const a of actors){
   const point=routePoint13(a.route,time+a.id*7),dest=new THREE.Vector3(point.x,yAt(point.x,point.z),point.z);
   a.check-=dt;if(a.check<=0){a.check=.5;a.canWalk=clearRay(a.model.root.position.clone().add(new THREE.Vector3(0,1,0)),dest.clone().add(new THREE.Vector3(0,1,0)));}
   if(a.canWalk!==false)a.model.root.position.copy(dest);
   a.pos.copy(a.model.root.position).y+=1.1;
   const near=game.player&&!game.player.dead&&game.player.pos.distanceTo(a.pos)<3;
   if(near)a.model.root.lookAt(game.player.pos.x,a.model.root.position.y,game.player.pos.z);else a.model.root.rotation.y=point.yaw;
   a.model.update(dt,time+a.id,point.moving&&!near,near);
  }
 }));
 offs.push(game.mods.on('interactables',(out,g)=>{
  if(g!==game||!root||!active()||game.player?.dead)return;
  const send=(op,id)=>game.net.request('l13req',{op,id,token:token()}),st=state();
  const stage=st?.mission.token&&st.mission.token!==token()?'idle':st?.mission.stage;
  for(const [i,a]of actors.entries()){
   let op='talk',label='Talk to an alien traveler [E]',sub='';
   if(kind==='moon'&&st&&!st.mission.paid){
    if(i===0&&stage==='idle'&&beacon){op='accept';label='Accept a field survey [E]';sub='Optional survey: visit the mint beacon, then return to a surveyor. Reward: 18 crew credits.';}
    if(i===1&&stage==='idle'){op='barter';label='Barter cheapest carried scrap for up to 12 credits [E]';sub='Barter replaces the survey reward. Scrap is consumed; engagement quota does not increase.';}
    if(i===0&&stage==='visited'){op='claim';label='Report survey / collect 18 credits [E]';}
   }
   out.push({pos:a.pos,r:.85,reach:3,label:t(label),sub:sub?t(sub):'',action:()=>send(op,a.id)});
  }
  if(kind==='moon'&&st&&!st.mission.paid&&stage==='accepted'&&beacon)out.push({pos:beacon.pos,r:.65,reach:3,label:t('Mark the field beacon [E]'),action:()=>send('checkpoint',actors[0].id)});
 }));
 offs.push(game.mods.on('objectives',(add,g,phase)=>{const st=state();if(g===game&&phase==='moon'&&kind==='moon'&&st?.mission.token===token()&&!st.mission.paid&&['accepted','visited'].includes(st.mission.stage))add(t('Optional: visit the field beacon and report back to the surveyors.'),'hint');}));
 return {get actors(){return actors;},get beacon(){return beacon;},dispose(){disposed=true;offs.forEach(off=>off?.());restoreUnload();clear();}};
}
