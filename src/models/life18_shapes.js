import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// Low-resolution rounded industrial solids, privately owned by each assembled model.
export function rounded18(w,h,d,n=4){
 const g=new THREE.SphereGeometry(1,8,4),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const q=Math.pow(Math.abs(x)**n+Math.abs(y)**n+Math.abs(z)**n,1/n)||1;
  p.setXYZ(i,x/q*w/2,y/q*h/2,z/q*d/2);
 }
 g.computeVertexNormals();return g;
}
export function parts18(parent,materials){
 const buckets=new Map();
 const add=(key,g,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));
  // One shared vertex-color Lambert batch per articulated pivot for matte clothing/metal.
  const source=materials[key];if(materials.vertex&&key!=='vertex'&&!source.map&&source.emissive?.getHex()===0){
   g.computeBoundingBox();const low=g.boundingBox.min.y,span=g.boundingBox.max.y-low||1;
   const colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){
    // Slight directional fading on cloth shoulders/cuffs, not randomized speckles or another texture.
    const fade=source.userData.wear18 ? .9+.1*(g.attributes.position.getY(i/3)-low)/span : 1;
    colors[i]=source.color.r*fade;colors[i+1]=source.color.g*fade;colors[i+2]=source.color.b*fade;
   }
   g.setAttribute('color',new THREE.BufferAttribute(colors,3));key='vertex';
  }
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);
 };
 return {add,box(key,w,h,d,x=0,y=0,z=0,rx=0,ry=0,rz=0){add(key,rounded18(w,h,d),x,y,z,rx,ry,rz);},finish(){
  for(const [key,geometries]of buckets){const merged=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();parent.add(new THREE.Mesh(merged,materials[key]));}buckets.clear();
 }};
}
