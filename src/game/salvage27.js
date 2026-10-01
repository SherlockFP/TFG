import * as THREE from 'three';
import {registerItem,SCRAP_TABLE,BIG_TABLES} from './items.js';
import {MOONS} from './moons.js';
import {descentToken} from './descent21_state.js';
import {CUSTODY} from './cargo13_core.js';
import {t} from '../core/i18n.js';
import {acquireSalvage27Models,createSalvage27Item} from '../models/salvage27.js';
import {SALVAGE27_ITEMS,SALVAGE27_SCRAP,SALVAGE27_BIG,SALVAGE27_SOUND as C} from './salvage27_core.js';
import './salvage27_text.js';

export function installSalvage27(game){
 const offs=[],tracked=new Map(),hinted=new Set(),factories=new Map();
 let disposed=false,suspended=false,facility=game.world?.facility,role=!!game.isHost,epoch=game.net?.hostEpoch,key='',lastTime=Number(game.time)||0,acc=0,lastGlobal=-Infinity;
 const registry=(typeof window!=='undefined'?window.__kefalMods?.itemModels:null)||game.mods?.itemModels;
 const releaseModels=acquireSalvage27Models();
 for(const d of SALVAGE27_ITEMS){registerItem({...d});if(registry){
  const factory=()=>createSalvage27Item(d.id),previous=registry.get(d.id);
  factory.salvage27={live:true,previous};factories.set(d.id,{factory,previous});registry.set(d.id,factory);
 }}
 for(const [tables,extras]of [[SCRAP_TABLE,SALVAGE27_SCRAP],[BIG_TABLES,SALVAGE27_BIG]])for(const [theme,rows]of Object.entries(extras)){
  const table=tables[theme];if(!table)continue;for(const [id,w]of rows)if(!table.some(e=>e[0]===id))table.push([id,w]);
 }
 const on=(ev,fn)=>{const off=game.mods?.on?.(ev,fn);if(off)offs.push(off);};
 const now=()=>Number(game.time)||0;
 function clear(){tracked.clear();acc=0;lastGlobal=-Infinity;}
 function active(){
  const r=game.run,m=MOONS[r?.moon],d=r?.descent21;
  return !disposed&&!suspended&&game.isHost&&r?.phase==='moon'&&!!m&&!m.company&&!m.home&&!m.deadletter&&!game.deadletter24?.active?.()&&!(d?.depth>0&&d.token!==descentToken(r));
 }
 function sync(){
  const r=game.run,next=`${r?.moon}:${r?.seed}:${r?.day}:${r?.descent21?.depth||0}:${r?.descent21?.token||''}`;
  if(role!==!!game.isHost||epoch!==game.net?.hostEpoch||facility!==game.world?.facility||next!==key||now()<lastTime){clear();role=!!game.isHost;epoch=game.net?.hostEpoch;facility=game.world?.facility;key=next;}
  lastTime=now();if(!active()){clear();return false;}return true;
 }
 function carrier(it){
  if(!it.holder||it.holder===CUSTODY||String(it.holder).startsWith('c:')||it.inv||it.state!=='held'||it.obj.visible===false)return null;
  const p=game.aiPlayerById?.(it.holder);
  if(!p||p.dead||p.inShip||game.downed?.isDowned?.(p.id))return null;
  if(p.id===game.selfId)return game.player?.heldItem?.()===it?p:null;
  const remote=game.remotes?.get(p.id);if(!remote||remote.dead||remote.heldType!==it.type)return null;
  // Native remote state advertises active TYPE, not ID. Fail quiet on an
  // ambiguous duplicate rather than generating sound from an inactive slot.
  let count=0;for(const other of game.items.all())if(other.holder===it.holder&&other.type===it.type&&!other.inv&&other.state==='held')count++;
  return count===1?p:null;
 }
 function emit(it,pos,owner){
  const st=tracked.get(it.id);if(!st||now()-st.last<C.itemGap||now()-lastGlobal<C.globalGap)return;
  st.last=now();lastGlobal=now();
  game.creatures?.noise?.(pos,C.loud,owner);
  game.net?.broadcast?.('fx',{k:'snd',s:'vent_rattle',p:[pos.x,pos.y+.2,pos.z],v:.48,r:3,m:28,pt:.82});
 }
 function sample(){
  const seen=new Set();
  for(const it of game.items?.all?.()||[]){
   if(it.type!=='replydrum27'||it.holder===CUSTODY)continue;
   if(seen.size>=C.maxTracked)break;seen.add(it.id);
   let st=tracked.get(it.id);if(!st){st={pos:null,at:now(),holder:null,last:-Infinity};tracked.set(it.id,st);}
   const p=carrier(it);
   if(p){
    const elapsed=now()-st.at,dist=st.pos&&st.holder===p.id?Math.hypot(p.pos.x-st.pos.x,p.pos.z-st.pos.z):0;
    const speed=elapsed>0?dist/elapsed:0;
    const sprint=p.id===game.selfId?!!game.player?.sprinting:!!game.remotes?.get(p.id)?.sprint;
    const fast=dist<C.maxPoseStep&&(speed>=C.fast||(sprint&&speed>=C.sprintMoving));
    st.pos??=new THREE.Vector3();st.pos.copy(p.pos);st.at=now();st.holder=p.id;
    if(fast&&!game.carry2?.helperFor?.(it.id))emit(it,p.pos,p.id);
   }else{
    st.pos=null;st.at=now();st.holder=null;
    if(it.holder||it.state!=='world'||!it.body||!it.obj.visible)continue;
    const v=it.body.linvel(),w=it.body.angvel();
    if(Math.hypot(v.x,v.y,v.z)>=C.looseSpeed||Math.hypot(w.x,w.y,w.z)>=C.looseSpin)emit(it,it.obj.position,it.owner||it.lastHolder||null);
   }
  }
  for(const id of tracked.keys())if(!seen.has(id))tracked.delete(id);
 }
 on('facilityWillChange',()=>{suspended=true;clear();});
 on('facilityChanged',()=>{suspended=false;clear();sync();});
 on('mapLoaded',()=>{suspended=false;clear();sync();});
 on('phase',()=>{suspended=false;clear();});
 on('hostMigrated',()=>{clear();role=!!game.isHost;epoch=game.net?.hostEpoch;});
 on('update',(dt,g)=>{
  if(g&&g!==game||disposed)return;
  // One short hint per signature, shown through the existing toast rather than
  // another permanent panel. ItemTools does not display generic scrap tips.
  const held=game.player?.heldItem?.();if(held&&SALVAGE27_ITEMS.some(d=>d.id===held.type)&&!hinted.has(held.type)&&!game.player?.dead){hinted.add(held.type);game.ui?.toast?.(`${t(held.def.name)}: ${t(held.def.tip)}`,'info');}
  if(!sync()||!Number.isFinite(dt)||dt<=0)return;
  acc+=Math.min(dt,.25);if(acc<C.sample)return;acc=0;sample();
 });
 sync();
 return{active,items:SALVAGE27_ITEMS.map(d=>d.id),stats:()=>({tracked:tracked.size}),dispose(){
  if(disposed)return;disposed=true;clear();for(const off of offs)off();
  // Two overlapping session teardown orders must not resurrect a factory
  // whose model lease already ended, or erase an unrelated mod override.
  for(const {factory}of factories.values())factory.salvage27.live=false;
  for(const [id,{factory,previous}]of factories)if(registry?.get(id)===factory){
   let restore=previous;while(restore?.salvage27&&!restore.salvage27.live)restore=restore.salvage27.previous;
   if(restore)registry.set(id,restore);else registry.delete(id);
  }
  factories.clear();releaseModels();
 }};
}
