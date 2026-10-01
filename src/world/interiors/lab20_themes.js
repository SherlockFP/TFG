import * as THREE from 'three';
import {GeoBuilder} from '../geobuilder.js';
import {layoutKit,navClear} from './common.js';
import {t,onLangChange} from '../../core/i18n.js';
import './lab20_text.js';
const room=(floor,wall)=>({floor,wall,ceil:'metal_dark',lamp:'wall_lamp',center:null,wall_:[],clutter:[]});
function definition(id,name,foundry){
 const wall=foundry?'concrete_dark':'wall_office',floor=foundry?'metal_plate':'wood_floor';
 return {id,name,blurb:foundry?'Twin processing lanes surround a sorting hall. The outer service loop trades distance for a clear return.':'Reply chambers reconnect to a central reading trunk. Side loops hold salvage; every reply has a way back.',
  style:{corridor:{floor:foundry?'metal_plate':'carpet_office',wall,ceil:'metal_dark',base:'metal_dark'},rooms:{
   entrance:room('concrete',wall),reply_hub:room('wood_floor','wall_office'),reply_branch:room('carpet_office','wall_office'),thread_stack:room('wood_floor','concrete'),sorting_hall:room('metal_plate','concrete'),process_hall:room('metal_plate','metal_dark'),service_store:room('concrete','brick'),storage:room(floor,wall),generator:room('metal_plate','concrete_dark'),vault:room('metal_plate','metal_plate'),nest:room(floor,wall),
  }},
  roomTypes:foundry?[['process_hall',3,true],['service_store',4],['storage',2]]:[['reply_branch',4],['thread_stack',3,true],['storage',2]],
  roomHeight:type=>['reply_hub','sorting_hall'].includes(type)?5.8:foundry?4.6:3.9,
  layout:{plan:'wings',arch:foundry?'buffer20':'thread20',loops:foundry?.18:.12,hub:null,doorP:.72,blastP:0,lockedP:0,corridorH:3.6,bigChance:.2,roomMul:foundry?.55:.7},
  lamps:{corridor:'wall_lamp',every:5,color:0xe0caa6,flicker:.05},lampColor:0xe0caa6,
  doorProp:'door_single',landmarks:['shelf_metal'],posters:['poster_delete','poster_safety'],corridorScrap:.08,
  footstep:{metal_plate:'metal',wood_floor:'wood',carpet_office:'carpet',concrete:'concrete'},
  ambience:{base:'ambience_facility',vol:.35,buzz:'lights_buzz',buzzVol:.04,env:'facility'},
  atmosphere:{fog:foundry?0x191713:0x111418,density:.024},noFlood:['reply_hub','reply_branch','thread_stack','sorting_hall','process_hall','service_store'],
  decorate:ctx=>decorate(ctx,id,foundry),
 };
}
export const LAB20_THEMES={threadarchive:definition('threadarchive','Thread Archive',false),bufferfoundry:definition('bufferfoundry','Buffer Foundry',true)};
export const LAB20_IDS=Object.freeze(Object.keys(LAB20_THEMES));
function decorate(ctx,id,foundry){
 const {layout:L,Y,group,nav,scrapSpots}=ctx,K=layoutKit(L),gb=new GeoBuilder(),root=new THREE.Group();root.name=`lab20-${id}`;group.add(root);
 const palette={steel:0x69706f,dark:0x343b40,ivory:0xb8b09a,ochre:0x9e845e,rust:0x785b4c};
 const mats=[],box=(key,x,y,z,w,h,d)=>gb.box(key,x,y,z,w,h,d,.25);
 const authored=L.rooms.filter(r=>r.lab20Role),optional=authored.filter(r=>r.loopChoice&&['reply_branch','thread_stack','service_store'].includes(r.type)),landmarks=[];
 for(const r of authored){
  const R=K.roomRect(r),x=(R.x0+R.x1)/2,z=(R.z0+R.z1)/2,ceiling=L.heightOf[L.idx(r.cx,r.cz)]||4.6;
  if(!foundry){
   // Offset nested reading frames evoke branching replies; they remain above capsule headroom.
   for(let i=0;i<3;i++)box(i===1?'ochre':'steel',x+(i-1)*.7,Y+Math.min(ceiling-.35,3.15+i*.18),z,Math.min(7,r.w*K.C-.8),.17,.3);
   for(const e of K.solidWalls(r).filter((_,i)=>i%2===0).slice(0,4)){
    const [wx,wz]=K.wallPoint(e.x,e.z,e.d,0,.045),along=e.d===1||e.d===3;
    box('dark',wx,Y+1.9,wz,along?2.1:.04,1.9,along?.04:2.1);
    for(let n=0;n<3;n++)box('ivory',wx,Y+1.25+n*.6,wz,along?1.8:.07,.045,along?.07:1.8);
   }
  }else{
   // Suspended packet tracks, rollers and offset service ducts; walking floor remains continuous.
   const len=Math.min(9,r.h*K.C-.9);
   for(const dx of [-1,1])box('steel',x+dx*.85,Y+2.85,z,.12,.22,len);
   for(let i=0;i<5;i++){
    box('dark',x,Y+2.77,z+(i-2)*len/5,1.7,.1,.23);
    if(i%2===0){box('ivory',x,Y+3.1,z+(i-2)*len/5,.8,.52,.62);box('ochre',x,Y+3.13,z+(i-2)*len/5+.32,.1,.48,.02);}
   }
   box('rust',R.x1-.3,Y+Math.min(ceiling-.3,3.8),z,.4,.4,len);
  }
  if(r.hub)landmarks.push({room:r.id,x,y:Y+2.5,z});
 }
 // A controlled detour changes where existing native salvage lies, never how much is spawned or worth.
 const detours=[];let cursor=0;
 for(const r of optional){
  const R=K.roomRect(r),x=(R.x0+R.x1)/2,z=(R.z0+R.z1)/2;
  if(!navClear(nav,x-.6,z-.6,x+.6,z+.6,0))continue;
  const spot=scrapSpots.slice(cursor).find(s=>!s.sealed&&s.room>=0);if(!spot)break;
  cursor=scrapSpots.indexOf(spot)+1;Object.assign(spot,{x,y:Y,z,room:r.id,type:r.type,dist:L.distOf[L.idx(r.cx,r.cz)]||0});detours.push({room:r.id,x,y:Y,z});
 }
 root.add(gb.build(key=>{const mat=new THREE.MeshLambertMaterial({color:palette[key],vertexColors:true,flatShading:true});mats.push(mat);return mat;}));
 let off=()=>{};
 if(landmarks.length&&typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const c=canvas.getContext('2d');
  if(c){const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshBasicMaterial({map:tex});mats.push(mat);const l=landmarks[0],sign=new THREE.Mesh(new THREE.PlaneGeometry(4,.5),mat);sign.position.set(l.x,l.y,l.z);root.add(sign);
   const draw=()=>{c.fillStyle='#30383b';c.fillRect(0,0,512,64);c.fillStyle='#c2b79b';c.font='bold 25px sans-serif';c.textAlign='center';c.fillText(t(foundry?'SORTING / SERVICE BYPASS':'Replies retained. Authors missing.'),256,42,480);tex.needsUpdate=true;};draw();off=onLangChange(draw);}
 }
 // Native facility freeTree runs before lab.dispose: retain only these owned resources for our once-only cleanup.
 for(const mat of mats){mat.userData.shared=true;if(mat.map)mat.map.userData.keep=true;}
 root.traverse(o=>{if(o.geometry)o.geometry.userData.shared=true;});
 let batches=0,triangles=0;root.traverse(o=>{if(o.isMesh){batches++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 const lab={id,optionalRooms:Object.freeze(optional.map(r=>r.id)),detours:Object.freeze(detours),landmarks:Object.freeze(landmarks),metrics:{batches,triangles,emitters:0},dispose(){off();root.traverse(o=>o.geometry?.dispose());for(const mat of mats){if(mat.map?.isCanvasTexture)mat.map.dispose();mat.dispose();}root.removeFromParent();}};
 return {lab};
}
