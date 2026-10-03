import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const x=clamp01(v);return x*x*(3-2*x);};
const mix=(a,b,k)=>a+(b-a)*k;

/** Original archive workers. Feet origin, +Z front; native capsules own collision.
 * Geometry/materials belong to this view, including warm-cache throwaway views.
 * CreatureView supplies {state,speed,t:stateT,time,progress,aim}; root yaw and
 * position remain exclusively native. Static warning poses also read silently.
 */
export function createCreature32(id){
 if(id!=='c32_dormant'&&id!=='c32_ram')throw new RangeError(`Unknown creature32 model: ${id}`);
 const heavy=id==='c32_ram',root=new THREE.Group(),geos=[],mats=[];
 root.name=`creature_${id}`;
 const material=color=>{
  const m=new THREE.MeshLambertMaterial({color,flatShading:true});
  m.userData.instance=true;mats.push(m);return m;
 };
 const cloth=material(heavy?0x686055:0x666a68),dark=material(0x282b2c);
 // Darker dormant mask resists flashlight wash; ram safety yoke uses light,
 // dirty enamel for contrast without emissive surfaces or another material.
 const ivory=material(heavy?0xc2bca8:0x8e8878),ochre=material(0x98783d);
 const clothBase=cloth.color.clone(),tint=new THREE.Color();
 const pivot=(parent,name,x=0,y=0,z=0)=>{
  const p=new THREE.Group();p.name=name;p.position.set(x,y,z);parent.add(p);return p;
 };
 const box=(w,h,d,x=0,y=0,z=0)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
 const segment=(w,h,d,x=0,y=0,z=0)=>new THREE.CylinderGeometry(w/2,w*.46,h,6,1).scale(1,1,d/w).translate(x,y,z);
 function batch(parent,mat,bits,name){
  const geo=mergeGeometries(bits,false);bits.forEach(g=>g.dispose());
  geos.push(geo);const mesh=new THREE.Mesh(geo,mat);mesh.name=name;
  parent.add(mesh);return mesh;
 }
 const thigh=heavy?.34:.30,shin=heavy?.36:.32,boot=.10;
 const hipY=thigh+shin+boot,torsoH=heavy?.64:.57;
 const rig=pivot(root,'worker-rig'),hips=pivot(rig,'hips',0,hipY,0);
 const body=pivot(hips,'torso',0,.06,0);
 batch(body,cloth,[segment(heavy?.65:.49,torsoH,heavy?.39:.32,0,torsoH/2,0),box(heavy?.52:.43,.14,heavy?.35:.30,0,-.05,0)],'workwear');
 batch(body,dark,[box(heavy?.55:.45,.055,heavy?.36:.31,0,-.09,0),
  box(.048,torsoH,.035,-.14,torsoH/2,.17),box(.048,torsoH,.035,.14,torsoH/2,.17),
  box(.24,.035,.04,0,torsoH*.48,.19)],'belt-harness');
 // Balanced worker arms; asymmetry is practical equipment rather than anatomy.
 batch(body,ivory,heavy?[
  segment(.35,.24,.48,-.39,.54,.10),box(.10,.56,.10,.33,.31,.10),
  box(.16,.16,.18,.32,.07,.10),box(.12,.22,.15,.32,.58,.10),
  box(.52,.09,.10,0,.58,.18)
 ]:[box(.26,.35,.055,0,.26,-.19),box(.30,.07,.06,0,.09,-.20),box(.25,.045,.08,0,.42,-.20)],'shoulder-support');
 batch(body,ochre,[box(.075,.12,.025,.19,.38,.19),
  box(.14,.025,.035,-.20,heavy?.62:.53,.20)],'worn-labels');
 const head=pivot(body,'head',0,heavy?.77:.705,.015);
 batch(head,ivory,[segment(heavy?.39:.35,heavy?.34:.30,heavy?.34:.29,0,0,0),
  box(heavy?.33:.29,.15,.055,0,-.04,heavy?.18:.16),box(heavy?.41:.37,.045,heavy?.36:.31,0,.12,0)],'maintenance-mask');
 batch(head,dark,[box(heavy?.29:.26,.055,.025,0,.055,heavy?.184:.164),
  box(.075,.08,.045,-.09,-.08,heavy?.215:.195),box(.075,.08,.045,.09,-.08,heavy?.215:.195),
  box(.29,.04,.035,0,-.065,-.15)],'visor-filter');
 const legs=[];
 for(const side of [-1,1]){
  const hip=pivot(hips,`hip-${side}`,side*(heavy?.20:.15),0,0);
  batch(hip,cloth,[segment(heavy?.235:.19,thigh,heavy?.25:.21,0,-thigh/2,0)],'trouser-upper');
  const knee=pivot(hip,`knee-${side}`,0,-thigh,0);
  batch(knee,cloth,[segment(heavy?.225:.18,shin,heavy?.24:.20,0,-shin/2,0)],'trouser-lower');
  const ankle=pivot(knee,`ankle-${side}`,0,-shin,0);
  batch(ankle,dark,[box(heavy?.25:.21,.20,heavy?.38:.31,0,0,.045),
   box(heavy?.26:.22,.035,heavy?.39:.32,0,-.0825,.045)],'work-boot');
  legs.push({hip,knee,ankle,side});
 }
 const arms=[];
 for(const side of [-1,1]){
  const shoulder=pivot(body,`shoulder-${side}`,side*(heavy?.39:.29),heavy?.53:.48,0);
  const upper=heavy?.29:.25,lower=heavy?.28:.24;
  batch(shoulder,cloth,[segment(heavy?.20:.155,upper,heavy?.22:.17,0,-upper/2,0)],'work-sleeve-upper');
  const elbow=pivot(shoulder,`elbow-${side}`,0,-upper,0);
  batch(elbow,cloth,[segment(heavy?.18:.14,lower,heavy?.19:.16,0,-lower/2,0)],'work-sleeve-lower');
  batch(elbow,ivory,[box(heavy?.17:.14,.16,.13,0,-lower-.07,.02),
   box(.045,.10,.06,-side*.085,-lower-.045,.055)],'work-glove');
  arms.push({shoulder,elbow,side});
 }
 let disposed=false,gait=0;
 function update(dt,a={}){
  if(disposed)return;
  const state=a.state||'idle',t=Math.max(0,Number.isFinite(a.t)?a.t:0),time=Number.isFinite(a.time)?a.time:0;
  const speed=Math.max(0,Number.isFinite(a.speed)?a.speed:0);
  const moving=state==='chase'||state==='charge'||state==='walk';
  gait=(gait+Math.max(0,Number.isFinite(dt)?dt:0)*Math.min(speed,6.8)*5)% (Math.PI*2);
  const step=Math.sin(gait)*Math.min(1,speed/3.4)*(state==='charge'?.28:.42);
  const wake=state==='wake'?smooth(t/1.5):0;
  // Open arms early, then hold while the full native wake warning completes.
  const alert=state==='wake'?smooth(t/.45):0;
  const crouch=!heavy?(state==='idle'?1:state==='wake'?1-wake:state==='rest'?smooth(t/4):0):0;
  const windup=state==='windup',charge=state==='charge',stunned=state==='stunned',dead=state==='dead';
  const bend=crouch*.93,kneeBend=crouch*1.80;
  hips.position.set(0,boot+thigh*Math.cos(bend)+shin*Math.cos(kneeBend-bend),0);
  body.rotation.set(heavy?(charge?.68:windup?.53:state==='rest'?.24:.045):(crouch*.48+(windup?-.16:0)),0,stunned?.15:0);
  body.position.z=windup&&!heavy?-.05:0;
  head.rotation.set(heavy?((windup||charge)?.35:state==='rest'?.27:.03):crouch*.42-alert*.32,0,0);
  for(const leg of legs){
   leg.hip.rotation.x=-bend+(moving?step*leg.side:heavy&&windup?leg.side*.14:0);
   leg.knee.rotation.x=kneeBend+(moving?Math.max(0,-step*leg.side)*.55:0);
   leg.ankle.rotation.x=-leg.hip.rotation.x-leg.knee.rotation.x;
  }
  for(const arm of arms){
   const left=arm.side<0;
   arm.shoulder.rotation.set(heavy?(windup||charge?(left?-1.18:-.70):state==='rest'?-.12:0):
    windup?(left?-.55:-2.05):state==='wake'?mix(-.50,-1.30,alert):crouch?-.50:moving?-step*arm.side*.7:0,0,
    heavy?(windup||charge?arm.side*(left?.66:.48):arm.side*.08):state==='wake'?arm.side*mix(.18,.85,alert):crouch?arm.side*.18:arm.side*.08);
   arm.elbow.rotation.x=heavy?(windup||charge?(left?-.95:-.85):-.12):windup?(left?-.35:-.65):state==='wake'?mix(-.35,-.45,alert):-.35*crouch;
  }
  if(stunned){head.rotation.x=.34;body.rotation.x=.20;arms[0].shoulder.rotation.x=-.15;arms[1].shoulder.rotation.x=-.15;}
  // Native feel.deathPose owns root topple/dissolve; the rig only slackens.
  if(dead){body.rotation.x=.22;head.rotation.x=.55;arms[0].shoulder.rotation.z=-.10;arms[1].shoulder.rotation.z=.10;}
  // Restrained idle breath; warnings remain static and fully readable without it.
  body.position.y=.06+(state==='idle'?Math.sin(time*1.6)*.004:0);
 }
 update(0,{state:'idle',t:0,time:0,speed:0});
 return {root,height:heavy?1.9:1.65,radius:heavy?.5:.4,parts:{body,head,hips,arms,legs},update,
  setTint(color){if(disposed)return;tint.set(color);cloth.color.copy(clothBase).lerp(tint,.15);},
  // Prototype admission explicitly forbids elite/affix variants; keep dimensions fixed.
  setElite(){},
  setHitFlash(v){if(disposed)return;const k=clamp01(Number.isFinite(v)?v:0);for(const m of mats)m.emissive.setRGB(k*.28,k*.045,k*.018);},
  dispose(){if(disposed)return;disposed=true;for(const g of geos)g.dispose();for(const m of mats)m.dispose();}
 };
}
