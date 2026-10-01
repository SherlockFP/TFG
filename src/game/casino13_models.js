import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GeoBuilder} from '../world/geobuilder.js';
import {onLangChange} from '../core/i18n.js';
import {tx} from './casino13_text.js';
import {casinoArt24 as artText} from './casino24_art_text.js';
export const STATIONS=[
 {id:'cashier',dx:5,dz:5,label:'Cashier Mica [E]',title:'RECEIPT / CHIPS'},
 {id:'slots',dx:-6,dz:3,label:'Signal reels [E]',title:'Signal reels [E]'},
 {id:'wheel',dx:-6,dz:-5,label:'Zero wheel dealer [E]',title:'Zero wheel dealer [E]'},
 {id:'packet',dx:5,dz:-5,label:'Packet broker [E]',title:'Packet broker [E]'},
 {id:'blackjack',dx:-5,dz:-1,label:'Blackjack dealer [E]',title:'BLACKJACK'},
 {id:'poker',dx:5,dz:0,label:'Five-card draw dealer [E]',title:'FIVE-CARD DRAW'},
];
export function makeClub(space,{physics=null}={}){
 const root=new THREE.Group();root.name='casino24-card-archive';const cx=space.center?.x??-29,cz=space.center?.z??-23,y=space.groundY??0;root.position.set(cx,y,cz);
 const gb=new GeoBuilder(),materials=[],colliders=[],box=(key,x,h,z,w,d,depth)=>gb.box(key,x,h,z,w,d,depth,.25),bodies=[];
 const palette={steel:0x596168,dark:0x2c3035,ivory:0xc1b7a0,cloth:0x756546,burgundy:0x774e54,felt:0x45594f,ochre:0xa68b56};
 const cards=(x,z,n)=>{for(let i=0;i<n;i++){box('ivory',x+(i-(n-1)/2)*.28,1.1,z,.21,.015,.3);box(i%2?'burgundy':'dark',x+(i-(n-1)/2)*.28,1.111,z,.05,.005,.09);}};
 const clerk=(x,z,index)=>{
  // Faceted CRT archival workers: practical jacket/pockets, cuffed hands and closed black screen.
  for(const dx of[-.15,.15]){box('dark',x+dx,.33,z,.2,.55,.25);box('steel',x+dx,.09,z+.06,.24,.15,.38);}
  box(index%2?'burgundy':'cloth',x,.99,z,.58,.68,.35);box('dark',x,.77,z,.6,.07,.37);
  for(const dx of[-.2,.2]){box('ochre',x+dx,1.13,z+.2,.12,.13,.05);box(index%2?'burgundy':'cloth',x+dx*1.7,1.01,z,.17,.5,.22);box('ivory',x+dx*1.7,.78,z+.1,.17,.16,.18);}
  bodies.push({x:cx+x,z:cz+z,y:y+.95,w:.72,h:1.9,d:.48});
  box('ivory',x,1.65,z,.55,.47,.41);box('dark',x,1.68,z+.22,.46,.3,.018);for(const dx of[-.06,.06])box('ochre',x+dx,1.69,z+.235,.035,.025,.009);
 };
 const spots=STATIONS.map((s,index)=>{
  const x=s.dx,z=s.dz,card=['blackjack','poker'].includes(s.id),w=card?3.8:3.1,d=card?1.6:1.45;
  box('dark',x,.52,z,w,.95,d);box(card?'felt':'burgundy',x,1.025,z,w+.12,.11,d+.12);box('ochre',x,1.01,z+d/2+.08,w+.14,.09,.07);
  bodies.push({x:cx+x,z:cz+z,y:y+.5,w,h:1,d});
  if(s.id==='slots'){
   box('steel',x,1.69,z-.1,1.7,1.35,.6);box('ivory',x,2.34,z-.1,1.85,.15,.65);
   for(let i=0;i<3;i++){box('dark',x+(i-1)*.46,1.73,z+.22,.39,.5,.035);box(i===1?'ochre':'ivory',x+(i-1)*.46,1.74,z+.244,.21,.12,.015);}box('burgundy',x+.92,1.7,z,.08,.65,.08);box('ivory',x+.92,2.05,z,.18,.15,.18);
  }else{clerk(x,z-.92,index);if(card){cards(x,z+.2,s.id==='poker'?5:2);cards(x,z-.35,2);box('steel',x+1.2,1.15,z-.35,.34,.26,.32);}else if(s.id==='wheel'){for(let i=0;i<12;i++){const a=i*Math.PI/6;box(i%2?'ivory':'burgundy',x+Math.cos(a)*.62,1.1,z+Math.sin(a)*.42,.19,.055,.19);}box('ochre',x,1.17,z,.1,.25,.1);}else if(s.id==='packet'){for(let i=0;i<4;i++)box('ivory',x-1+i*.4,1.13,z,.3,.17,.36);}else{box('ivory',x,1.2,z,.65,.28,.32);box('dark',x,1.32,z+.17,.4,.11,.02);}}
  // Seats stay at table ends; the standing central control and aisle remain open.
  if(card)for(const side of[-1,1]){box('burgundy',x+side*2.4,.45,z,.5,.1,.55);box('steel',x+side*2.4,.22,z,.1,.45,.1);box('burgundy',x+side*2.4,.79,z-.27,.52,.7,.08);bodies.push({x:cx+x+side*2.4,z:cz+z-.08,y:y+.55,w:.54,h:1.1,d:.65});}
  return {...s,pos:new THREE.Vector3(cx+x,y+1,cz+z+(card?1.35:1.1))};
 });
 // Intentional back-room filing wall and booth cornices; the central aisle is continuous.
 for(const x of[-7.5,0,7.5]){box('dark',x,1.6,-9.6,2.8,2.4,.3);for(let row=0;row<4;row++)box('ivory',x,1+row*.45,-9.42,2.5,.055,.06);}box('ochre',0,3.3,-9.42,18,.13,.08);
 root.add(gb.build(k=>{const m=new THREE.MeshLambertMaterial({color:palette[k],flatShading:true,vertexColors:true});materials.push(m);return m;}));
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d'),tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
 const mat=new THREE.MeshBasicMaterial({map:tex});materials.push(mat);const planes=[];
 for(let i=0;i<7;i++){const s=STATIONS[i],plane=new THREE.PlaneGeometry(s?2.6:5,s?.id==='slots'?.48:.56),uv=plane.attributes.uv;for(let j=0;j<uv.count;j++)uv.setXY(j,(uv.getX(j)+i%4)/4,(uv.getY(j)+1-Math.floor(i/4))/2);plane.translate(s?s.dx:0,s?s.id==='slots'?2.1:.64:3,s?s.dz+(s.id==='slots'?.22:['blackjack','poker'].includes(s.id)?.9:.82):-9.39);planes.push(plane);}
 const merged=mergeGeometries(planes);planes.forEach(g=>g.dispose());root.add(new THREE.Mesh(merged,mat));
 let recent=[],last='',disposed=false,redraws=0;
 function draw(force=false){const key=JSON.stringify(recent);if(!force&&key===last)return;last=key;redraws++;ctx.fillStyle='#292c30';ctx.fillRect(0,0,1024,512);ctx.textAlign='center';for(let i=0;i<7;i++){const s=STATIONS[i],x=(i%4)*256+128,z=Math.floor(i/4)*256;ctx.fillStyle='#c9bea6';ctx.font='bold 22px monospace';ctx.fillText(s?artText(tx(s.title)):artText('CARD ARCHIVE'),x,z+65,244);if(s){const row=[...recent].reverse().find(r=>r.station===s.id);ctx.font='18px monospace';ctx.fillStyle='#b49a67';ctx.fillText(row?`${row.paid??0} ${tx('chips')}`:artText('PLACE A BET'),x,z+119,244);if(row?.cardSummary)ctx.fillText(String(row.cardSummary).slice(0,25),x,z+165,244);}}tex.needsUpdate=true;}
 draw(true);const off=onLangChange(()=>draw(true));const geos=[];root.traverse(o=>{if(o.geometry){geos.push(o.geometry);o.geometry.userData.shared=true;}});materials.forEach(m=>m.userData.shared=true);tex.userData.keep=true;
 if(physics)for(const b of bodies)colliders.push(physics.addStaticBox(b.x,b.y,b.z,b.w/2,b.h/2,b.d/2));
 let triangles=0;geos.forEach(g=>triangles+=(g.index?.count||g.attributes.position.count)/3);
 return {root,spots,metrics:{batches:geos.length,triangles,emitters:0,colliders:colliders.length,get redraws(){return redraws;}},setRecent(rows){if(disposed)return;recent=Array.isArray(rows)?rows.slice(-12):[];draw();},dispose(){if(disposed)return;disposed=true;off();for(const c of colliders)physics.removeCollider(c);for(const g of geos)g.dispose();tex.dispose();for(const m of materials)m.dispose();root.removeFromParent();}};
}
