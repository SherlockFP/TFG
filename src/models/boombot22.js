import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {getMaterial,getBasicMaterial} from '../render/textures.js';
// +Y up, +Z speaker/front. Origin is the projectile collision center; wheels rest at Y=-.22.
// Held items use native cached materials; projectiles own all of their resources.
export function createBoomBot22({sharedMaterials=false}={}){
 const root=new THREE.Group(),geos=[],mats=[],parts=new Map();root.name='echo-runner22';root.userData.kind='consumable';
 function mat(key,color,basic=false){const options={flatShading:true};const m=sharedMaterials?(basic?getBasicMaterial(null,color,{fog:false}):getMaterial(null,color,options)):(basic?new THREE.MeshBasicMaterial({color,fog:false}):new THREE.MeshLambertMaterial({color,flatShading:true}));mats.push(m);parts.set(key,{mat:m,bits:[]});}
 mat('shell',0xb7b0a0);mat('steel',0x72777a);mat('rubber',0x282b2c);mat('trim',0x9e8257);mat('lamp',0xd1a46b,true);
 const add=(key,g,p,r)=>{if(r)g.rotateX(r[0]).rotateY(r[1]).rotateZ(r[2]);g.translate(p[0],p[1]-.05,p[2]);parts.get(key).bits.push(g);};
 const box=(key,w,h,d,x,y,z)=>add(key,new THREE.BoxGeometry(w,h,d),[x,y,z]);
 box('shell',.29,.22,.275,0,.015,0);box('steel',.32,.035,.29,0,-.112,0);
 box('shell',.23,.145,.04,0,.015,.147);box('rubber',.205,.12,.012,0,.015,.171);
 for(let i=0;i<6;i++)box('steel',.186,.006,.012,0,-.037+i*.021,.181);
 box('trim',.055,.025,.012,-.1,.093,.143);box('trim',.032,.072,.012,.11,-.026,.143);
 box('steel',.18,.125,.08,0,.015,-.145);box('rubber',.16,.012,.008,0,.035,-.189);
 for(const x of [-.16,.16]){
  add('rubber',new THREE.CylinderGeometry(.095,.095,.07,12),[x,-.075,0],[0,0,Math.PI/2]);
  add('steel',new THREE.CylinderGeometry(.041,.041,.074,8),[x,-.075,0],[0,0,Math.PI/2]);
  for(const z of [-.055,0,.055])box('trim',.008,.015,.013,x+(x<0?-.039:.039),-.075,z);
 }
 for(const x of [-.065,.065])box('steel',.018,.04,.018,x,.142,-.015);
 box('rubber',.15,.018,.018,0,.166,-.015);
 box('steel',.045,.013,.045,.092,.135,.065);box('lamp',.035,.03,.035,.092,.156,.065);
 for(const [key,{mat,bits}]of parts){const geo=mergeGeometries(bits);bits.forEach(g=>g.dispose());geos.push(geo);const mesh=new THREE.Mesh(geo,mat);mesh.name=`echo-runner22-${key}`;root.add(mesh);if(key==='lamp')root.userData.led=mesh;}
 let disposed=false;root.userData.dispose=()=>{if(disposed)return;disposed=true;for(const g of geos)g.dispose();if(!sharedMaterials)for(const m of mats)m.dispose();};
 return root;
}
