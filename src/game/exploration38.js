// Room survey uses the existing descent identity and native geometry. No client payout request.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { ITEMS } from './items.js';

export function surveyState38(st, layout, valid) {
 if (!st.survey38) st.survey38={version:38,total:0,surface:null,floor:null};
 const key=st.depth===0?'surface':'floor', old=st.survey38[key];
 if(!old||old.depth!==st.depth||old.seed!==layout.seed) {
  // Existing visited rooms are not retrospectively paid when upgrading a save.
  st.survey38[key]={depth:st.depth,seed:layout.seed,rooms:st.visited.filter(id=>valid.includes(id)).slice(0,15),complete:st.visited.length>=surveyTarget38(valid)};
 }
 return st.survey38[key];
}
export const surveyTarget38=valid=>Math.min(5,valid.length);
export function surveyRoom38(st,fac,valid,p,physics) {
 if(!p||p.dead||p.downed||p.zone!=='in'||!p.pos||!fac.contains?.(p.pos))return null;
 const L=fac.layout,x=Math.floor((p.pos.x-L.ox)/L.cell),z=Math.floor((p.pos.z-L.oz)/L.cell);
 if(x<0||z<0||x>=L.w||z>=L.h)return null;
 const cell=L.idx(x,z),id=L.roomOf[cell];
 if(!L.cells[cell]||!valid.includes(id))return null;
 const ledger=surveyState38(st,L,valid);if(ledger.rooms.includes(id)||ledger.rooms.length>=15)return null;
 // A reported indoor zone alone cannot earn money through walls or on another floor.
 const feet=new THREE.Vector3(p.pos.x,p.pos.y+.25,p.pos.z),ground=physics?.raycast(feet,new THREE.Vector3(0,-1,0),.65,G.STATIC|G.DOOR);
 if(!ground||ground.normal.y<.55||p.pos.y<ground.point.y-.1)return null;
 const eye=p.eye||new THREE.Vector3(p.pos.x,p.pos.y+1.4,p.pos.z),target=new THREE.Vector3(p.pos.x,p.pos.y+.35,p.pos.z),dir=target.clone().sub(eye),len=dir.length();
 if(len>.05&&physics.raycast(eye,dir.normalize(),Math.max(0,len-.08),G.STATIC|G.DOOR))return null;
 ledger.rooms.push(id);
 const reward=2+Math.min(3,Math.floor(Math.log2(st.depth+1)/2));
 let amount=reward;
 if(!ledger.complete&&ledger.rooms.length>=surveyTarget38(valid)){ledger.complete=true;amount+=20+Math.min(20,st.depth*2);}
 st.survey38.total+=amount;
 return id;
}
// Less loose filler, with measured count growth from tier/depth rather than a flood on floor one.
export function lootCount38(base,tier=1,depth=0){return Math.max(3,Math.min(18,Math.round(base*.55)+Math.max(0,tier-1)+Math.min(5,Math.floor(Math.log2(depth+1)))));}
export function lootTable38(table,tier=1,depth=0,distance=0){
 const rare=Math.min(.42,.055+Math.max(0,tier-1)*.045+Math.log2(depth+1)*.025+Math.max(0,distance-5)*.012);
 return table.map(([id,w])=>{const values=ITEMS[id]?.value,average=values?(values[0]+values[1])/2:0;return {id,w:w*(average>=90?rare:average>=45?.5:1.7)};});
}
