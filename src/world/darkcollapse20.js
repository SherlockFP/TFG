import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// Two bounded meshes per optional doorway; native door owns the physical blocker.
export function buildDarkCollapse20(parent,door) {
  const a=door.colArgs,group=new THREE.Group();group.name=`darkcollapse20-${door.id}`;parent.add(group);
  const alongX=a[3]>a[5],width=Math.max(a[3],a[5]),height=a[4];
  const material=new THREE.MeshLambertMaterial({color:0x665e54});
  const chunks=[];
  for(let i=0;i<3;i++){
    const geo=new THREE.BoxGeometry(alongX?width*.4:.42,height*(.85-i*.13),alongX?.42:width*.4);
    const offset=(i-1)*width*.28;
    geo.rotateZ(alongX?(i-1)*.13:0);geo.rotateX(alongX?0:(i-1)*.13);
    geo.translate(a[0]+(alongX?offset:0),a[1]-.1,a[2]+(alongX?0:offset));chunks.push(geo);
  }
  const rubble=new THREE.Mesh(mergeGeometries(chunks),material);for(const geo of chunks)geo.dispose();group.add(rubble);rubble.visible=false;
  const brace=new THREE.Mesh(new THREE.BoxGeometry(alongX?width:.18,.18,alongX?.18:width),new THREE.MeshLambertMaterial({color:0x786c58}));brace.position.set(a[0],a[1]+height/2-.08,a[2]);group.add(brace);
  function setStage(stage){rubble.visible=stage==='collapsed';brace.rotation[alongX?'z':'x']=stage==='warning'?.08:0;brace.material.color.setHex(stage==='warning'?0xb68b48:0x786c58);}
  return {group,setStage,dispose(){group.removeFromParent();rubble.geometry.dispose();brace.geometry.dispose();material.dispose();brace.material.dispose();}};
}
