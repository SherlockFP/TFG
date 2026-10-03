// Abandoned work scenes sit inside existing solid wall thickness, never in cargo lanes.
import * as THREE from 'three';
import {GeoBuilder} from '../geobuilder.js';
import {hashString} from '../../core/rng.js';

const DX=[1,0,-1,0],DZ=[0,1,0,-1],NAME='openplaces40-dressing';
const PALETTE={steel:0x555b5b,dark:0x24292b,ivory:0xb2ab98,ochre:0x907746,rust:0x6c5043};

/** Finite map-owned reliefs: same native floor/walls/doors/lights and spawn entropy. */
export function buildOpenPlaces40Dressing({layout:L,group}={}){
 const O=L?.open35,landmarks=group?.getObjectByName('openplaces36-landmarks');
 if(O?.version!==35||!['courtyard','concourse','reception'].includes(O.kind)||!landmarks||!Array.isArray(O.bayRooms))return null;
 const old=group.getObjectByName(NAME);if(old)return old;
 const gb=new GeoBuilder(),panels=[];
 for(const id of O.bayRooms){
  const room=L.rooms[id],sign=landmarks.userData.signs.find(s=>s.room===id);if(!room||!sign)continue;
  const walls=[];
  for(let z=room.z;z<room.z+room.h;z++)for(let x=room.x;x<room.x+room.w;x++)for(let d=0;d<4;d++){
   const nx=x+DX[d],nz=z+DZ[d],key=L.edgeKey(x,z,d);
   if(nx>=room.x&&nx<room.x+room.w&&nz>=room.z&&nz<room.z+room.h||L.open.has(key)||L.edgeInfo.has(key))continue;
   walls.push({room:id,key,x:L.ox+(x+.5+DX[d]*.5)*L.cell,z:L.oz+(z+.5+DZ[d]*.5)*L.cell,nx:-DX[d],nz:-DZ[d],back:DX[d]===-sign.nx&&DZ[d]===-sign.nz});
  }
  walls.sort((a,b)=>Number(b.back)-Number(a.back)||hashString(`${L.seed}:work40:${a.key}`)-hashString(`${L.seed}:work40:${b.key}`));
  for(const [index,wall] of walls.slice(0,2).entries()){
   const p={...wall,scene:O.kind,index};panels.push(p);
   // Closed native wall colliders are .30m thick. All visible vertices stay
   // within its inner .14m, so even these detailed frames are already solid.
   const box=(u,y,w,h,color,depth=.035,forward=.06)=>{
    const right={x:p.nz,z:-p.nx},x=p.x+right.x*u+p.nx*forward,z=p.z+right.z*u+p.nz*forward;
    const c=new THREE.Color(PALETTE[color]);
    gb.box('work',x,L.y+y,z,p.nx?depth:w,h,p.nz?depth:w,.5,[c.r,c.g,c.b]);
   };
   box(0,1.95,2.9,2.9,'steel',.04,.025);
   box(0,1.95,2.72,2.72,'dark');
   box(-1.22,1.95,.08,2.6,'ochre',.02,.09);
   if(O.kind==='courtyard'){
    // Failed service console, drained gauge bank, spare relays and severed runs.
    box(-.36,2.15,1.42,1.05,'ivory',.06,.08);box(-.36,2.2,1.18,.74,'dark',.025,.12);
    box(-.36,2.35,.88,.035,'steel',.015,.133);box(-.75,1.77,.12,.055,'ochre',.01,.134);
    for(let n=0;n<3;n++){box(.82,2.66-n*.45,.55,.30,'steel',.04,.09);box(.82,2.66-n*.45,.30,.055,'ivory',.015,.12);}
    for(let n=0;n<5;n++)box(-.8+n*.38,1.0,.16,.43,n===index?'rust':'steel',.04,.09);
    box(0,3.21,2.5,.10,'rust',.04,.08);box(.95,1.15,.055,1.7,'rust',.03,.09);
   }else if(O.kind==='concourse'){
    // Shuttered retail fronts alternate a missing display with an empty cabinet.
    for(let n=0;n<11;n++)box(0,.73+n*.23,2.58,.13,n%3?'steel':'rust',.025,.075);
    box(-.28,2.08,1.42,1.30,'ivory',.035,.10);box(-.28,2.08,1.18,1.06,'dark',.018,.125);
    if(index===0){box(-.28,2.2,.85,.065,'steel',.01,.136);box(.78,1.0,.62,.26,'ochre',.018,.11);}
    else{box(-.28,1.72,1.18,.045,'steel',.01,.136);box(-.28,2.39,1.18,.045,'steel',.01,.136);}
   }else{
    // Undelivered packets: emptied sorting slots, cancelled tickets and sealed returns.
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
     const u=-.9+col*.6,y=1.1+row*.52;
     box(u,y,.52,.43,'steel',.04,.08);box(u,y+.03,.43,.30,'dark',.022,.113);
     if((col+row+index)%3===0)box(u-.05,y,.3,.19,'ivory',.012,.132);
    }
    box(0,3.13,2.6,.16,'ochre',.03,.10);
   }
   // A scuffed lower frame and broken inventory labels explain abandonment.
   box(0,.51,2.72,.075,'rust',.025,.10);box(.87,3.0,.38,.12,'ivory',.016,.11);
  }
 }
 if(!panels.length)return null;
 const root=gb.build(()=>{const mat=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});mat.userData.brBake=true;return mat;});
 root.name=NAME;root.userData={version:40,kind:O.kind,panels};
 root.traverse(o=>{if(o.isMesh){o.name='openplaces40-work-scenes';o.userData.noMerge=true;}});
 group.add(root);return root;
}
