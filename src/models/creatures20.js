import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export function createCreature20(id){
 const heavy=id==='c20_brute',root=new THREE.Group(),geos=[],mats=[],groups=[];
 const material=color=>{const m=new THREE.MeshLambertMaterial({color,flatShading:true});m.userData.instance=true;mats.push(m);return m;};
 const cloth=material(heavy?0x625950:0x6c6960),metal=material(0x777a7b),dark=material(0x242629),trim=material(0xb1a58a);
 const pivot=(x,y,z)=>{const p=new THREE.Group();p.position.set(x,y,z);root.add(p);groups.push(p);return p;};
 function batch(parent,mat,specs){const bits=specs.map(([w,h,d,x,y,z])=>(mat===cloth&&h>.3?new THREE.SphereGeometry(1,8,6).scale(w/2,h/2,d/2):new THREE.BoxGeometry(w,h,d)).translate(x,y,z)),geo=mergeGeometries(bits);bits.forEach(g=>g.dispose());geos.push(geo);const m=new THREE.Mesh(geo,mat);parent.add(m);return m;}
 const scale=heavy?1: .65,body=pivot(0,heavy?1.04:.67,0);
 batch(body,cloth,[[.8*scale,.85*scale,.46*scale,0,.22*scale,0],[.66*scale,.18*scale,.5*scale,0,-.23*scale,0],[.2*scale,.22*scale,.04,-.22*scale,.2*scale,.25*scale]]);
 batch(body,dark,[[.05,.66*scale,.05,-.22*scale,.24*scale,.25*scale],[.05,.66*scale,.05,.22*scale,.24*scale,.25*scale]]);
 const legs=[pivot(-.23*scale,heavy?.73:.47,0),pivot(.23*scale,heavy?.73:.47,0)];
 for(const leg of legs){batch(leg,cloth,[[.25*scale,.57*scale,.27*scale,0,-.29*scale,0]]);batch(leg,dark,[[.29*scale,.16*scale,.41*scale,0,-.64*scale,.06]]);}
 const arms=[pivot(-.54*scale,heavy?1.55:1.01,0),pivot(.54*scale,heavy?1.55:1.01,0)];
 for(const arm of arms){batch(arm,cloth,[[.23*scale,.67*scale,.27*scale,0,-.3*scale,0]]);batch(arm,metal,[[.26*scale,.2*scale,.3*scale,0,-.65*scale,.05]]);}
 const head=pivot(0,heavy?1.87:1.18,.02);batch(head,metal,[[.48*scale,.46*scale,.4*scale,0,0,0]]);batch(head,dark,[[.37*scale,.23*scale,.025,0,.01,.21*scale]]);
 batch(head,trim,heavy?[[.24,.025,.025,0,.01,.215]]:[[.13,.13,.04,.09,0,.15]]);
 if(heavy)batch(body,metal,[[.13,.73,.19,-.29,.12,-.3],[.13,.73,.19,.29,.12,-.3],[.6,.1,.18,0,.52,-.3]]);
 let disposed=false;
 return{root,parts:{body,head,arms},height:heavy?2.15:1.3,radius:heavy?.55:.35,
  update(dt,a){const warning=a.state==='windup',walk=Math.min(1,(a.speed||0)/3),s=Math.sin((a.time||0)*(heavy?4:7))*walk*.25;legs[0].rotation.x=s;legs[1].rotation.x=-s;arms[0].rotation.x=-s;arms[1].rotation.x=warning?-.9:s;head.rotation.y=warning?0:Math.sin((a.time||0)*1.2)*.12;body.rotation.z=warning?Math.sin((a.time||0)*8)*.025:0;},setTint(){},setElite(){},setHitFlash(v){for(const m of mats)m.emissive.setRGB(v*.6,v*.08,v*.04);},dispose(){if(disposed)return;disposed=true;geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
}
