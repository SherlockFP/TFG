import * as THREE from 'three';
import {onLangChange,t} from '../core/i18n.js';
import {ADVENTURE_TEXT40,lead40} from '../game/adventure40_text.js';

// Thin wall-mounted recorder owns a real matching collider; signs stay overhead.
export function buildAdventure40(plan){
 const root=new THREE.Group();root.name='adventure40-last-broadcast';
 const geo=new THREE.BoxGeometry(.9,.64,.2),mat=new THREE.MeshLambertMaterial({color:0x77766c,flatShading:true});
 const caseMesh=new THREE.Mesh(geo,mat);caseMesh.position.fromArray(plan.mount);caseMesh.rotation.y=plan.yaw;root.add(caseMesh);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
 const atlas=new THREE.CanvasTexture(canvas);atlas.magFilter=atlas.minFilter=THREE.NearestFilter;atlas.generateMipmaps=false;atlas.colorSpace=THREE.SRGBColorSpace;
 const signMat=new THREE.MeshLambertMaterial({map:atlas,side:THREE.DoubleSide});signMat.userData.brBake=true;
 const screenGeo=new THREE.PlaneGeometry(.72,.45),screen=new THREE.Mesh(screenGeo,signMat);
 screen.position.fromArray(plan.recording);screen.rotation.y=plan.yaw;root.add(screen);
 const uv=screenGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*.45);
 const noticeGeo=new THREE.PlaneGeometry(4.8,.72),notice=new THREE.Mesh(noticeGeo,signMat);notice.position.fromArray(plan.notice);notice.rotation.y=plan.noticeYaw;root.add(notice);
 const nuv=noticeGeo.attributes.uv;for(let i=0;i<nuv.count;i++)nuv.setY(i,nuv.getY(i)*.5+.5);
 // Flat maintenance arrows make the authored route visible without occupying
 // the native aisle. Eight instances share one geometry/material/draw call.
 const arrowShape=new THREE.Shape();arrowShape.moveTo(0,.35);arrowShape.lineTo(-.22,.03);arrowShape.lineTo(-.08,.03);arrowShape.lineTo(-.08,-.3);arrowShape.lineTo(.08,-.3);arrowShape.lineTo(.08,.03);arrowShape.lineTo(.22,.03);arrowShape.closePath();
 const arrowGeo=new THREE.ShapeGeometry(arrowShape),arrowMat=new THREE.MeshLambertMaterial({color:0xa08c5b,side:THREE.DoubleSide});
 const selected=[];let travelled=0;
 for(let i=1;i<plan.path.length&&selected.length<8;i++){const a=plan.path[i-1],b=plan.path[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(length<.01)continue;
  for(let offset=4-travelled;offset<length&&selected.length<8;offset+=10){if(offset<0)continue;selected.push({x:a[0]+dx*offset/length,z:a[2]+dz*offset/length,yaw:Math.atan2(-dx,-dz)});}travelled=(travelled+length)%10;
 }
 const arrows=new THREE.InstancedMesh(arrowGeo,arrowMat,selected.length),pose=new THREE.Object3D();for(let i=0;i<selected.length;i++){const p=selected[i];pose.position.set(p.x,plan.approach[1]+.008,p.z);pose.rotation.set(-Math.PI/2,p.yaw,0,'YXZ');pose.updateMatrix();arrows.setMatrixAt(i,pose.matrix);}arrows.instanceMatrix.needsUpdate=true;root.add(arrows);
 let disposed=false;
 const draw=()=>{if(disposed||!ctx)return;ctx.fillStyle='#272b2c';ctx.fillRect(0,0,512,256);ctx.fillStyle='#c7bc9e';ctx.textAlign='center';ctx.font='bold 17px monospace';ctx.fillText(lead40(plan.title),256,44,492);ctx.font='13px monospace';ctx.fillText(t(ADVENTURE_TEXT40.notice),256,76,492);ctx.fillStyle='#9b8251';ctx.font='bold 37px monospace';ctx.fillText('CREW 06',256,187);ctx.font='20px monospace';ctx.fillText('REC / 00:18',256,223);atlas.needsUpdate=true;};
 const off=onLangChange(draw);draw();
 return{group:root,dispose(){if(disposed)return;disposed=true;off();root.removeFromParent();geo.dispose();screenGeo.dispose();noticeGeo.dispose();arrowGeo.dispose();mat.dispose();signMat.dispose();arrowMat.dispose();atlas.dispose();}};
}
