import * as THREE from 'three';
import { ID } from './escape14_core.js';
export function wardenModel() {
 const root=new THREE.Group(), geos=[], mats=[];
 const metal=new THREE.MeshLambertMaterial({color:0x242c31,flatShading:true}), ivory=new THREE.MeshLambertMaterial({color:0xb3aa88,flatShading:true}),glow=new THREE.MeshBasicMaterial({color:0xffbb66});mats.push(metal,ivory,glow);
 const box=(x,y,z,sx,sy,sz,m)=>{const g=new THREE.BoxGeometry(sx,sy,sz);geos.push(g);const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 box(0,1.35,0,.45,.65,.4,metal);const head=box(0,2.02,.08,.9,.48,.23,ivory);box(0,2.04,.21,.5,.05,.03,glow);
 const legs=[box(-.3,.65,0,.13,1.3,.14,metal),box(.3,.65,0,.13,1.3,.14,metal),box(0,.55,-.34,.12,1.1,.12,metal)];
 box(-.65,1.45,.05,.12,1.35,.12,metal);box(.52,1.65,0,.1,.65,.1,metal);box(-.65,.82,.08,.36,.16,.35,ivory);
 return {root,parts:{head},height:2.35,radius:.55,update(dt,a){const run=a.state==='chase';legs.forEach((l,i)=>l.rotation.x=run?Math.sin((a.time||0)*12+i*2)*.3:0);head.rotation.y=Math.sin((a.time||0)*(a.state==='search'?3:.7))*.18;glow.color.set(a.state==='windup'?0xff4535:0xffbb66);},setElite(){},setTint(){},setHitFlash(v){metal.emissive.setRGB(v*.5,0,0);},dispose(){geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}};
}
export function addWardenModel(registry){registry?.set(ID,wardenModel);}
export function soundSamples(name,sr){
 const d=name==='e14_warn'?2.2:name==='e14_search'?1.2:name==='e14_prime'?1.1:.5,out=new Float32Array(Math.floor(sr*d));
 for(let i=0;i<out.length;i++){const t=i/sr;let v;
 if(name==='e14_warn'){const tick=x=>x>0?Math.sin(x*2*Math.PI*430)*Math.exp(-x*30):0;v=tick(t-.1)*.5+tick(t-.8)*.5+Math.sin(t*Math.PI*110)*Math.max(0,t-1.4)*.18;}
 else if(name==='e14_prime')v=Math.sin(2*Math.PI*(150*t+180*t*t))*Math.min(1,t*2)*.22;
 else if(name==='e14_search')v=Math.sin(t*2*Math.PI*180)*Math.sin(t*Math.PI*6)*Math.exp(-t*2)*.2;
 else v=(Math.sin(t*Math.PI*120)+.3*Math.sin(t*Math.PI*1580))*Math.exp(-t*12)*.4;
 out[i]=v*Math.min(1,t/.01,(d-t)/.02);
 }return out;
}
export function ensureWardenAudio(game){const a=game.audio;if(!a?.ctx||!a.buffers)return false;for(const name of ['e14_warn','e14_prime','e14_search','e14_hit'])if(!a.buffers.has(name)){const d=soundSamples(name,a.ctx.sampleRate),b=a.ctx.createBuffer(1,d.length,a.ctx.sampleRate);b.copyToChannel(d,0);a.buffers.set(name,b);}return true;}
