import * as THREE from 'three';
import {GeoBuilder} from '../world/geobuilder.js';
import {t,onLangChange} from '../core/i18n.js';
import {RECOVERY27_TEXT as T} from '../game/recovery27_text.js';

// Shallow wall-mounted archive cabinet. No new collision or light owns a route.
export function makeRecovery27(plan){
 const root=new THREE.Group();root.name='recovery27-cabinet';root.position.fromArray(plan.p);root.rotation.y=plan.yaw;
 const gb=new GeoBuilder(),materials=[],geometry=[];
 const box=(k,x,y,z,w,h,d)=>gb.box(k,x,y,z,w,h,d,.12);
 box('steel',0,1.02,0,1.04,1.10,.22);
 box('dark',0,1.05,.13,.91,.84,.045);
 box('ivory',0,1.05,.16,.82,.75,.03);
 for(const x of [-.48,.48])box('steel',x,1.05,.16,.045,.94,.04);
 box('ochre',.29,1.05,.19,.055,.65,.03);
 box('dark',-.28,.92,.20,.10,.30,.045);
 box('steel',-.32,.92,.245,.18,.045,.055);
 box('ochre',.31,.92,.245,.20,.12,.055);
 box('dark',0,.49,.16,.90,.08,.04);
 const palette={steel:0x677074,dark:0x30383d,ivory:0xbdb59e,ochre:0xa98c58};
 root.add(gb.build(k=>{const m=new THREE.MeshLambertMaterial({color:palette[k],vertexColors:true,flatShading:true});materials.push(m);return m;}));
 const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;
 if(canvas){canvas.width=512;canvas.height=256;}
 const ctx=canvas?.getContext('2d'),texture=canvas?new THREE.CanvasTexture(canvas):null;
 if(texture){texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;}
 const signMat=new THREE.MeshBasicMaterial(texture?{map:texture}:{color:0x30383d});materials.push(signMat);
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(.86,.43),signMat);sign.position.set(0,1.32,.183);root.add(sign);
 let released=false,disposed=false;
 const draw=()=>{if(!ctx)return;ctx.fillStyle='#30383d';ctx.fillRect(0,0,512,256);ctx.textAlign='center';ctx.fillStyle='#cec5ad';ctx.font='bold 28px sans-serif';ctx.fillText(t(released?T.empty:T.title),256,52,488);ctx.font='23px sans-serif';ctx.fillText(t(T.lore),256,100,488);ctx.fillStyle='#b9975b';ctx.font='bold 27px sans-serif';ctx.fillText(t(T.crank),132,188,220);ctx.fillText(t(T.break),382,188,226);texture.needsUpdate=true;};
 draw();const off=onLangChange(draw);
 root.traverse(o=>{if(o.geometry){geometry.push(o.geometry);o.geometry.userData.shared=true;}});
 for(const m of materials)m.userData.shared=true;if(texture)texture.userData.keep=true;
 const triangles=geometry.reduce((n,g)=>n+(g.index?.count||g.attributes.position.count)/3,0);
 return{root,metrics:{batches:geometry.length,triangles,lights:0,colliders:0},setState(state){if(released===!!state.released)return;released=!!state.released;sign.position.z=released?.185:.183;draw();},dispose(){if(disposed)return;disposed=true;off();root.removeFromParent();for(const g of geometry)g.dispose();for(const m of materials)m.dispose();texture?.dispose();}};
}
