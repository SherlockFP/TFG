import * as THREE from 'three';
import {getLang} from '../core/i18n.js';
import {GeoBuilder} from '../world/geobuilder.js';
// A single matte sorting cabinet, three printed panels, no lights or async assets.
export function deadletter24Cabinet(game,point){const g=new GeoBuilder(),y=point.y-1.1,z=point.z-.42,palette={steel:0x586064,ivory:0xbcb29a,ochre:0xa78448,dark:0x242b30};
 g.box('steel',point.x,y+.72,z,2.65,1.44,.72,.2);g.box('ivory',point.x,y+1.48,z,2.72,.12,.78,.2);
 for(const dx of [-1,0,1]){g.box('dark',point.x+dx,y+1.07,z+.37,.48,.4,.045,.2);g.box('ochre',point.x+dx,y+.67,z+.39,.16,.13,.05,.2);}
 const mats=new Map(),root=g.build(key=>{if(!mats.has(key))mats.set(key,new THREE.MeshLambertMaterial({color:palette[key]}));return mats.get(key);});root.name='deadletter24-sorting-cabinet';game.scene?.add(root);
 const collider=game.physics.addStaticBox(point.x,y+.74,z,1.34,.74,.39);let gone=false;return{root,dispose(){if(gone)return;gone=true;game.physics.removeCollider(collider);root.traverse(o=>o.geometry?.dispose());for(const m of mats.values())m.dispose();root.removeFromParent();}};
}
export function deadletter24RareCase(game,point){const gb=new GeoBuilder();gb.box('ivory',point.x,point.y,point.z,.38,.22,.3,.2);gb.box('ochre',point.x,point.y+.12,point.z,.16,.035,.32,.2);const mats=[],root=gb.build(key=>{const m=new THREE.MeshLambertMaterial({color:key==='ivory'?0xbcb29a:0xa78448});mats.push(m);return m;});root.name='deadletter24-double-stamp';game.scene.add(root);let gone=false;return{dispose(){if(gone)return;gone=true;root.traverse(o=>o.geometry?.dispose());for(const m of mats)m.dispose();root.removeFromParent();}};}

// Terminal-mounted dispatch plate: visible from the cockpit aisle, no new blocker/light.
export function deadletter25Entry(game,point){
 const root=new THREE.Group();root.name='deadletter25-entry';root.position.copy(point);
 const backing=new THREE.BoxGeometry(.045,.44,.76),material=new THREE.MeshLambertMaterial({color:0x62685e});root.add(new THREE.Mesh(backing,material));
 const canvas=document.createElement('canvas');canvas.width=304;canvas.height=176;const ctx=canvas.getContext('2d');
 const lang=getLang();const lines=lang==='tr'?['İADE POSTA','İSTEĞE BAĞLI SEFER','[E] GİRİŞ']:lang==='ru'?['НЕВРУЧЁННАЯ ПОЧТА','ОТДЕЛЬНЫЙ ПОХОД','[E] ВХОД']:['DEAD LETTER','OPTIONAL EXPEDITION','[E] ENTER'];
 ctx.fillStyle='#c6bda5';ctx.fillRect(0,0,304,176);ctx.strokeStyle='#4e5448';ctx.lineWidth=5;ctx.strokeRect(8,8,288,160);ctx.fillStyle='#252b24';ctx.textAlign='center';ctx.font='bold 27px monospace';ctx.fillText(lines[0],152,48);ctx.font='17px monospace';ctx.fillText(lines[1],152,88);ctx.font='bold 23px monospace';ctx.fillText(lines[2],152,135);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearFilter;
 const paperGeometry=new THREE.PlaneGeometry(.72,.41),paperMaterial=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,toneMapped:false});const paper=new THREE.Mesh(paperGeometry,paperMaterial);paper.rotation.y=Math.PI/2;paper.position.x=.025;root.add(paper);game.scene?.add(root);
 let disposed=false;return{root,dispose(){if(disposed)return;disposed=true;root.removeFromParent();backing.dispose();material.dispose();paperGeometry.dispose();paperMaterial.dispose();texture.dispose();}};
}
