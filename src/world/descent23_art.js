// Small, owned PSX wayfinding layer. It never participates in physics or nav.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GeoBuilder} from './geobuilder.js';
import {getLang,onLangChange} from '../core/i18n.js';

const WORDS={
 en:{labels:['CALL','DOWN','SURFACE'],busy:'IN TRANSIT',explore:'EXPLORE FIRST',ready:'ACCESS VERIFIED',call:'READY TO CALL',callFirst:'CALL FIRST',direct:'DIRECT RETURN',surface:'SURFACE LEVEL'},
 tr:{labels:['ÇAĞIR','AŞAĞI','YÜZEY'],busy:'AKTARILIYOR',explore:'ÖNCE KEŞFET',ready:'ERİŞİM ONAYLI',call:'ÇAĞRIYA HAZIR',callFirst:'ÖNCE ÇAĞIR',direct:'DOĞRUDAN DÖN',surface:'YÜZEY KATI'},
 ru:{labels:['ВЫЗОВ','ВНИЗ','ПОВЕРХНОСТЬ'],busy:'В ПУТИ',explore:'СНАЧАЛА ИССЛЕДУЙ',ready:'ДОСТУП ПОДТВЕРЖДЁН',call:'ВЫЗОВ ДОСТУПЕН',callFirst:'СНАЧАЛА ВЫЗОВ',direct:'ПРЯМОЙ ВОЗВРАТ',surface:'ПОВЕРХНОСТЬ'},
};
export function buildDescent23Art({root,plan,anchors,floor=0}){
 const group=new THREE.Group();group.name='descent23-wayfinding';root.add(group);
 const gb=new GeoBuilder(),materials=[],geometries=[],box=(key,x,y,z,w,h,d)=>gb.box(key,x,y,z,w,h,d,.08);
 // Thin facing paint over the existing doorway posts: an open silhouette,
 // not another wall, luminous portal or obstruction to the certified cabin.
 for(const x of [-1.45,1.45]){
  box('ivory',x,1.34,1.781,.115,2.5,.018);
  for(const y of [.34,.47])box('ochre',x,y,1.798,.12,.045,.01);
 }
 box('ivory',0,2.59,1.791,2.96,.065,.016);
 // Short inward/outward threshold bars stay inside the original cabin footprint.
 for(const x of [-1.05,1.05])for(const z of [1.22,1.41,1.60])box('ochre',x,.018,z,.25,.015,.055);
 // Two small floor arrowheads point out through the real mouth (+local Z).
 for(const x of [-.45,.45])gb.quad('ochre',new THREE.Vector3(x-.12,.029,1.36),new THREE.Vector3(x,.029,1.57),new THREE.Vector3(x+.12,.029,1.36),new THREE.Vector3(x+.12,.029,1.36),[[0,0],[.5,1],[1,0],[1,0]]);
 // Repeated mouth ticks tie the threshold to the upright doorway silhouette.
 for(const x of [-1.45,1.45]){
  box('ochre',x,1.48,1.801,.09,.12,.012);
  box('ochre',x,1.65,1.801,.09,.07,.012);
 }
 // Archive inventory numbers and unequal panel surrounds keep controls distinct
 // even before localized text resolves. No new screen glow or dynamic light.
 for(const [i,x]of [-1.05,0,1.05].entries()){
  box(i===1?'ochre':'ivory',x,1.50,-1.266,.64,.57,.018);
  box('dark',x,1.50,-1.251,.59,.52,.012);
 }
 const palette={ivory:0xbcb5a0,ochre:0x9e8051,dark:0x242b2d};
 group.add(gb.build(key=>{const m=new THREE.MeshBasicMaterial({color:palette[key],vertexColors:true});materials.push(m);return m;}));
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
 const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
 const panelMaterial=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});materials.push(panelMaterial);
 const parts=[];
 for(let i=0;i<3;i++){
  const geo=new THREE.PlaneGeometry(.57,.48),uv=geo.attributes.uv;
  for(let j=0;j<uv.count;j++)uv.setX(j,(uv.getX(j)+i)/3);
  geo.translate((i-1)*1.05,1.50,-1.239);parts.push(geo);
 }
 const panelGeometry=mergeGeometries(parts);for(const part of parts)part.dispose();group.add(new THREE.Mesh(panelGeometry,panelMaterial));
 let state={floor,available:false,discovered:false,ready:false,busy:false},disposed=false,draws=0,lastKey='';
 function draw(){
  if(disposed||!ctx)return;
  const lang=getLang(),key=JSON.stringify([lang,state.floor,state.available,state.discovered,state.ready,state.busy]);if(key===lastKey)return;lastKey=key;draws++;
  const words=WORDS[lang]||WORDS.en;ctx.fillStyle='#242b2d';ctx.fillRect(0,0,768,192);ctx.textAlign='center';
  for(let i=0;i<3;i++){
   const x=i*256+128,usable=state.available&&!state.busy&&(i===0?state.discovered:i===1?state.ready:state.floor>0);
   ctx.fillStyle=usable?'#c9c1ac':'#877f6d';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=7;
   ctx.font='bold 17px sans-serif';
   // Bell, descending arrow and surface arrow are visually unrelated to gameplay
   // world markers; their positions match the three existing physical consoles.
   if(i===0){ctx.beginPath();ctx.moveTo(x-26,88);ctx.lineTo(x-23,60);ctx.lineTo(x-12,45);ctx.lineTo(x+12,45);ctx.lineTo(x+23,60);ctx.lineTo(x+26,88);ctx.closePath();ctx.stroke();ctx.fillRect(x-9,94,18,6);}
   else{const down=i===1,tip=down?97:43,tail=down?43:97,wing=down?76:64;ctx.fillRect(x-4,Math.min(tip,tail),8,Math.abs(tip-tail));ctx.beginPath();ctx.moveTo(x-24,wing);ctx.lineTo(x,tip);ctx.lineTo(x+24,wing);ctx.stroke();if(i===2)ctx.fillRect(x-30,32,60,6);}
   ctx.font='bold 27px sans-serif';
   ctx.font='bold 14px sans-serif';ctx.fillStyle='#ab915e';const caption=state.busy?words.busy:i===2?(state.floor>0?words.direct:words.surface):i===0?(state.discovered?words.call:words.explore):state.ready?words.ready:state.discovered?words.callFirst:words.explore;

  }
  texture.needsUpdate=true;
 }
 draw();const off=onLangChange(draw);
 let batches=0,triangles=0;group.traverse(o=>{if(o.geometry){geometries.push(o.geometry);o.geometry.userData.shared=true;o.geometry.userData.descent23Owned=true;batches++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
 for(const material of materials){material.userData.shared=true;material.userData.descent23Owned=true;}texture.userData.keep=true;
 const metrics={batches,triangles,emitters:0,colliders:0,atlasPixels:canvas.width*canvas.height,get redraws(){return draws;}};
 return {metrics,setState(next){if(disposed)return;const changed=['floor','available','discovered','ready','busy'].some(key=>key in next&&next[key]!==state[key]);if(changed){state={...state,...next};draw();}},dispose(){if(disposed)return;disposed=true;off();group.removeFromParent();for(const geometry of geometries)geometry.dispose();texture.dispose();for(const material of materials)material.dispose();}};
}
