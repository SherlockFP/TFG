import assert from 'node:assert/strict';
import './ship2_env.mjs';
import * as THREE from 'three';
import {setLang} from '../../src/core/i18n.js';
import {buildDescent23Art} from '../../src/world/descent23_art.js';

let text=[];
const ctx=new Proxy({}, {
 get(target,key){
  if(key==='fillRect')return (x,y,w,h)=>{if(x===0&&y===0&&w===768&&h===192)text=[];};
  if(key==='fillText')return (value,x,y)=>text.push({value,x,y,color:target.fillStyle});
  return key in target?target[key]:()=>{};
 },
 set(target,key,value){target[key]=value;return true;},
});
const createElement=document.createElement;
document.createElement=()=>({width:0,height:0,getContext:()=>ctx});
const root=new THREE.Group(),art=buildDescent23Art({root,floor:1});
document.createElement=createElement;
const caption=i=>text.find(row=>row.x===i*256+128&&row.y===172);
const label=i=>text.find(row=>row.x===i*256+128&&row.y===139);

art.setState({available:true,discovered:false,ready:false});
assert.equal(caption(2).value,'DIRECT RETURN','an unexplored deep floor never demands discovery before escape');
assert.equal(label(2).color,'#c9c1ac');
assert.equal(label(1).color,'#877f6d','descent remains visibly unavailable until the native lift is called');
art.setState({discovered:true});assert.equal(caption(1).value,'CALL FIRST');
art.setState({ready:true});assert.equal(caption(1).value,'ACCESS VERIFIED');assert.equal(label(1).color,'#c9c1ac');
const version=art.metrics.redraws;
for(let i=0;i<100;i++)art.setState({ready:true,available:true,discovered:true});
assert.equal(art.metrics.redraws,version,'unchanged native state never uploads another atlas');
art.setState({busy:true});assert.equal(caption(2).value,'IN TRANSIT');assert.equal(label(2).color,'#877f6d');
art.setState({floor:0,busy:false,ready:false,discovered:false});
assert.equal(caption(2).value,'SURFACE LEVEL');assert.equal(label(2).color,'#877f6d');
art.setState({floor:2});
for(const [lang,word]of [['tr','DOĞRUDAN DÖN'],['ru','ПРЯМОЙ ВОЗВРАТ'],['en','DIRECT RETURN']]){
 const before=art.metrics.redraws;setLang(lang);assert.equal(art.metrics.redraws,before+1);
 assert.equal(caption(2).value,word,'localized escape caption retains the same native condition');
}

const geometry=new Set(),material=new Set(),texture=new Set();
root.traverse(o=>{assert(!o.isLight);if(o.isMesh){geometry.add(o.geometry);material.add(o.material);if(o.material.map)texture.add(o.material.map);}});
assert(art.metrics.batches<=4&&art.metrics.triangles<=300);assert.equal(art.metrics.colliders,0);
let disposed=0;for(const resource of [...geometry,...material,...texture])resource.addEventListener('dispose',()=>disposed++);
art.dispose();art.dispose();assert.equal(disposed,geometry.size+material.size+texture.size);
assert.equal(root.children.length,0);
const after=art.metrics.redraws;setLang('tr');art.setState({floor:3});assert.equal(art.metrics.redraws,after,'disposed labels unsubscribe from locale changes');setLang('en');
console.log('descent23 art: native escape/ready conditions, three locales, cached atlas and once-only owned disposal PASS');
