import * as THREE from 'three';
import { tx } from './casino13_text.js';
export const STATIONS = [
 { id:'cashier', dx:5, dz:5, label:'Cashier Mica [E]', color:0xe2b451 },
 { id:'slots', dx:-6, dz:3, label:'Signal reels [E]', color:0x77bcbd },
 { id:'wheel', dx:-6, dz:-5, label:'Zero wheel dealer [E]', color:0xab5276 },
 { id:'packet', dx:5, dz:-5, label:'Packet broker [E]', color:0x73b46a }
];
export function makeClub(space) {
 const root=new THREE.Group(), spots=[], boards=new Map();
 const cx=space.center?.x ?? -29, cz=space.center?.z ?? -23, y=space.groundY ?? 0;
 root.position.set(cx,y,cz);
 function box(x,h,z,sx,sy,sz,color){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshStandardMaterial({color,roughness:.9}));m.position.set(x,h,z);root.add(m);return m;}
 function sign(text,x,h,z,w,color){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#10121a';ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font='bold 38px monospace';ctx.textAlign='center';ctx.fillText(text,256,78,490);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));m.position.set(x,h,z);root.add(m);return {canvas,tex};}
 sign(tx('DEAD SIGNAL CLUB'),0,3.3,-9.5,9,'#e2b451');
 for(const s of STATIONS){const {dx:x,dz:z,color}=s;box(x,.5,z,3,1,1.4,0x222832);box(x,1.03,z,3.2,.12,1.6,color);
 if(s.id==='slots'){box(x,1.9,z,1.4,1.6,.65,0x212d36);sign('SIGNAL',x,2.2,z+.34,1.25,'#88ddde');box(x,1.7,z+.4,1.1,.3,.05,0xe7d9a4);}
 else {box(x,1.8,z-.6,.65,1.2,.5,0x363847);box(x,2.55,z-.6,.45,.45,.45,0xc9aaa0);box(x,2.56,z-.35,.3,.11,.05,color);}
 for(let n=0;n<5;n++)box(x-1+n*.3,1.15,z+.2,.17,.08,.17,n%2?0xe2b451:0xb75075);
 if(s.id!=='cashier')boards.set(s.id,sign(tx('TABLE CLOSED: waiting for a player'),x,3.1,z+.45,3.4,'#d4c48f'));
 spots.push({...s,pos:new THREE.Vector3(cx+x,y+1,cz+z+1.1)});
 }
 // Low partitions define booth bays without obstructing the southern entrance.
 box(0,.55,-3,.3,1.1,9,0x332333);box(-7,1,-8.5,4,2,.35,0x332333);
 return {root,spots,setRecent(recent){for(const [id,board]of boards){const row=[...(recent||[])].reverse().find(r=>r.station===id);const ctx=board.canvas.getContext('2d');ctx.fillStyle='#10121a';ctx.fillRect(0,0,512,128);ctx.fillStyle='#d4c48f';ctx.font='bold 27px monospace';ctx.textAlign='center';if(row){ctx.fillText(`${tx('Last deal')}: ${row.name}`,256,37,490);const outcome=row.reels?row.reels.map(n=>['A','B','C','D','E','SIGNAL'][n]).join(' | '):row.n!==undefined?'#'+row.n:tx(row.kind);ctx.fillText(`${outcome} | ${row.paid} ${tx('chips')}`,256,91,490);}else ctx.fillText(tx('TABLE CLOSED: waiting for a player'),256,77,490);board.tex.needsUpdate=true;}},dispose(){root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});}};
}
