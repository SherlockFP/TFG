// Original matte PSX salvage. One merged vertex-colour draw batch per object,
// no textures, emissions or lights. Templates are lease-owned; native WorldItem
// owns each cloned geometry, while the shared material lives until final release.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const IVORY=0xbcb5a3,DARK=0x2d3032,STEEL=0x707779,OCHRE=0x9b793a,PAPER=0xd0c8b4,GLASS=0x6c777a;
const B=(c,d,p,r)=>['b',c,d,p,r];
const C=(c,d,p,r)=>['c',c,d,p,r];
const PARTS={
 replydrum27:[
  B(DARK,[.76,.10,.45],[0,.05,0]),B(IVORY,[.68,.35,.38],[0,.275,0]),
  B(STEEL,[.06,.42,.44],[-.34,.29,0]),B(STEEL,[.06,.42,.44],[.34,.29,0]),
  B(DARK,[.57,.04,.29],[0,.47,-.045]),B(IVORY,[.33,.20,.28],[.13,.56,-.05]),
  B(DARK,[.25,.10,.012],[.13,.565,.097]),B(GLASS,[.21,.066,.015],[.13,.57,.105]),
  C(STEEL,[.126,.126,.025],[-.18,.30,.202],[Math.PI/2,0,0]),
  C(STEEL,[.101,.101,.025],[.15,.25,.202],[Math.PI/2,0,0]),
  C(DARK,[.057,.057,.036],[-.18,.30,.218],[Math.PI/2,0,0]),
  C(DARK,[.042,.042,.036],[.15,.25,.218],[Math.PI/2,0,0]),
  B(OCHRE,[.31,.017,.02],[-.045,.235,.227],[0,0,-.15]),
  B(PAPER,[.18,.05,.015],[-.20,.44,.201]),B(DARK,[.12,.012,.015],[-.20,.44,.210]),
  B(STEEL,[.06,.065,.12],[-.39,.23,0]),B(STEEL,[.06,.065,.12],[.39,.23,0]),
 ],
 indexedglass27:[
  B(DARK,[.76,.08,.36],[0,.04,0]),B(STEEL,[.07,1.10,.21],[-.315,.61,0]),
  B(STEEL,[.07,1.10,.21],[.315,.61,0]),B(IVORY,[.70,.095,.24],[0,1.165,0]),
  B(DARK,[.60,.06,.20],[0,.17,0]),B(OCHRE,[.08,.065,.05],[-.20,1.06,.05],[0,0,-.15]),
  B(OCHRE,[.08,.065,.05],[.20,1.06,.05],[0,0,.15]),
  B(STEEL,[.027,.15,.024],[-.20,.99,.02]),B(STEEL,[.027,.15,.024],[.20,.99,.02]),
  B(GLASS,[.46,.70,.045],[0,.59,.025]),B(IVORY,[.46,.035,.053],[0,.922,.025]),
  B(PAPER,[.22,.06,.012],[-.085,.77,.055]),B(DARK,[.15,.012,.012],[-.095,.77,.064]),
  B(STEEL,[.34,.018,.012],[0,.42,.055]),B(STEEL,[.018,.45,.012],[.12,.59,.055]),
  B(OCHRE,[.16,.02,.015],[.19,.17,.108]),
 ],
 archivesorter27:[
  B(DARK,[.58,.06,.43],[0,.03,0]),B(IVORY,[.52,.22,.37],[0,.17,0]),
  B(STEEL,[.045,.21,.36],[-.267,.18,0]),B(STEEL,[.045,.21,.36],[.267,.18,0]),
  B(DARK,[.38,.047,.026],[0,.20,.197]),B(PAPER,[.28,.018,.16],[-.025,.18,.21]),
  B(PAPER,[.28,.025,.18],[.03,.302,-.075]),B(DARK,[.11,.018,.19],[-.12,.321,-.065]),
  B(STEEL,[.52,.035,.05],[0,.275,-.19]),B(STEEL,[.38,.018,.02],[0,.23,-.197]),
  B(OCHRE,[.05,.05,.02],[.19,.19,.198]),B(DARK,[.035,.012,.026],[-.20,.11,.20]),
 ],
};
let leases=0,material=null;const templates=new Map();
function template(id){
 if(templates.has(id))return templates.get(id);
 if(!PARTS[id])throw Error('Unknown salvage model: '+id);
 const geometries=[];
 for(const [shape,color,dims,pos,rot]of PARTS[id]){
  const indexed=shape==='c'?new THREE.CylinderGeometry(...dims,8):new THREE.BoxGeometry(...dims);
  const g=indexed.toNonIndexed();indexed.dispose();g.deleteAttribute('uv');
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot||[0,0,0])));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(1,1,1)));
  const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(g);
 }
 const merged=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();
 merged.computeBoundingBox();merged.computeBoundingSphere();templates.set(id,merged);return merged;
}
export function acquireSalvage27Models(){
 leases++;let released=false;
 return()=>{if(released)return;released=true;if(--leases>0)return;
  for(const g of templates.values())g.dispose();templates.clear();material?.dispose();material=null;
 };
}
export function createSalvage27Item(id){
 const g=new THREE.Group();g.name='item_'+id;
 material??=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true});
 const mesh=new THREE.Mesh(template(id).clone(),material);mesh.name='salvage27_merged';g.add(mesh);
 return g;
}
export function salvage27ModelStats(){return{leases,templates:templates.size,materials:material?1:0};}
