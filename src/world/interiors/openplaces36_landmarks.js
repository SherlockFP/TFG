// Finite map-owned architecture labels. Native floor, cargo, exits and lift keep ownership.
import * as THREE from 'three';
import {getLang,onLangChange} from '../../core/i18n.js';

const WORDS={
 entrance:{en:'MAIN ENTRANCE',tr:'ANA GİRİŞ',ru:'ГЛАВНЫЙ ВХОД'},
 ship:{en:'SHIP ACCESS',tr:'GEMİYE GEÇİŞ',ru:'ПРОХОД К КОРАБЛЮ'},
 entry:{en:'ENTRY 00',tr:'GİRİŞ 00',ru:'ВХОД 00'},
 courtyard:[
  {en:'FUSE WORKSHOP',tr:'SİGORTA ATÖLYESİ',ru:'МАСТЕРСКАЯ ПРЕДОХРАНИТЕЛЕЙ'},
  {en:'PUMP SERVICE',tr:'POMPA SERVİSİ',ru:'ОБСЛУЖИВАНИЕ НАСОСОВ'},
  {en:'STORES & RETURNS',tr:'DEPO VE İADELER',ru:'СКЛАД И ВОЗВРАТЫ'},
  {en:'NIGHT MAINTENANCE',tr:'GECE BAKIMI',ru:'НОЧНОЕ ОБСЛУЖИВАНИЕ'},
 ],
 concourse:[
  {en:'CLOSED ELECTRONICS',tr:'KAPALI ELEKTRONİKÇİ',ru:'ЭЛЕКТРОНИКА ЗАКРЫТА'},
  {en:'EMPTY ARCADE',tr:'BOŞ OYUN SALONU',ru:'ПУСТОЙ ИГРОВОЙ ЗАЛ'},
  {en:'VACANT DISPLAYS',tr:'BOŞ VİTRİNLER',ru:'ПУСТЫЕ ВИТРИНЫ'},
  {en:'RETURNS DESK',tr:'İADE MASASI',ru:'СТОЙКА ВОЗВРАТА'},
 ],
 reception:[
  {en:'UNDELIVERED',tr:'TESLİM EDİLEMEDİ',ru:'НЕ ДОСТАВЛЕНО'},
  {en:'LOST REQUESTS',tr:'KAYIP TALEPLER',ru:'ПОТЕРЯННЫЕ ЗАПРОСЫ'},
  {en:'NO REPLY',tr:'YANIT YOK',ru:'БЕЗ ОТВЕТА'},
  {en:'RETURN TO SENDER',tr:'GÖNDERENE İADE',ru:'ВОЗВРАТ ОТПРАВИТЕЛЮ'},
 ],
};
const CATEGORIES={
 courtyard:{en:'SERVICE BAY',tr:'SERVİS BÖLÜMÜ',ru:'СЕРВИСНЫЙ ОТСЕК'},
 concourse:{en:'SHOPFRONT',tr:'MAĞAZA CEPHESİ',ru:'ВИТРИНА МАГАЗИНА'},
 reception:{en:'COUNTER',tr:'BANKO',ru:'СТОЙКА'},
};
const DX=[1,0,-1,0],DZ=[0,1,0,-1],NAME='openplaces36-landmarks';

function labels(L,doors){
 const O=L?.open35,kind=O?.kind;
 if(O?.version!==35||!WORDS[kind]||!Array.isArray(O.bayRooms)||O.bayRooms.length!==4||!Array.isArray(O.publicRooms))return null;
 const entrance=doors?.find(d=>d.kind==='entrance'&&d.info?.key===L.entrance?.key&&d.spawn);
 if(!entrance)return null;
 const ex=entrance.spawn.x-entrance.pos.x,ez=entrance.spawn.z-entrance.pos.z,len=Math.hypot(ex,ez);if(len<.1)return null;
 const signs=[{id:'entry',role:'entrance',room:L.entrance.room.id,doorId:entrance.id,title:WORDS.entrance,caption:kind==='reception'?WORDS.entry:WORDS.ship,
  x:entrance.pos.x+ex/len*.06,y:L.y+4.08,z:entrance.pos.z+ez/len*.06,nx:ex/len,nz:ez/len,width:5.6,height:.52}];
 for(const [n,id]of O.bayRooms.entries()){
  const r=L.rooms?.[id];if(!r||r.type!=='open35_bay')return null;
  const fronts=[];
  for(let z=r.z;z<r.z+r.h;z++)for(let x=r.x;x<r.x+r.w;x++)for(let d=0;d<4;d++){
   const nx=x+DX[d],nz=z+DZ[d];if(nx<0||nz<0||nx>=L.w||nz>=L.h)continue;
   const other=L.roomOf[L.idx(nx,nz)];if(other===id||!O.publicRooms.includes(other)||!L.open.has(L.edgeKey(x,z,d)))continue;
   fronts.push({x:x+.5+DX[d]*.5,z:z+.5+DZ[d]*.5,d,height:L.heightOf[L.idx(nx,nz)]});
  }
  // Real shared frontage, never a guessed exit direction or a new doorway.
  if(!fronts.length||fronts.some(f=>f.d!==fronts[0].d))return null;
  const d=fronts[0].d,x=fronts.reduce((sum,f)=>sum+f.x,0)/fronts.length,z=fronts.reduce((sum,f)=>sum+f.z,0)/fronts.length;
  const caption=Object.fromEntries(['en','tr','ru'].map(lang=>[lang,`${CATEGORIES[kind][lang]} ${String(n+1).padStart(2,'0')}`]));
  signs.push({id:`bay-${id}`,role:'bay',room:id,title:WORDS[kind][n],caption,x:L.ox+x*L.cell+DX[d]*.06,y:L.y+Math.min(...fronts.map(f=>f.height))-.9,z:L.oz+z*L.cell+DZ[d]*.06,nx:DX[d],nz:DZ[d],width:9.8,height:.92});
 }
 return signs;
}

/** One atlas and one merged mesh, all released by the facility's existing freeTree. */
export function buildOpenPlaces36Landmarks({layout:L,group,doors}={}){
 if(!group)return null;
 const existing=group.getObjectByName(NAME);if(existing)return existing;
 const signs=labels(L,doors);if(!signs)return null;
 const root=new THREE.Group();root.name=NAME;root.userData={version:36,kind:L.open35.kind,signs};
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
 const atlas=new THREE.CanvasTexture(canvas);atlas.name='openplaces36-sign-atlas';atlas.colorSpace=THREE.SRGBColorSpace;
 atlas.magFilter=atlas.minFilter=THREE.NearestFilter;atlas.generateMipmaps=false;
 let disposed=false;
 const draw=()=>{
  if(disposed||!ctx)return;const lang=getLang();ctx.fillStyle='#292e31';ctx.fillRect(0,0,512,256);
  for(const [n,s]of signs.entries()){
   const y=n*48;ctx.fillStyle='#aaa188';ctx.fillRect(0,y,512,2);ctx.fillStyle='#9c8354';ctx.fillRect(8,y+8,5,32);
   const text=s.title[lang]||s.title.en;ctx.fillStyle='#d0cab7';ctx.textAlign='center';ctx.textBaseline='alphabetic';
   let font=24;ctx.font=`bold ${font}px monospace`;while(font>17&&ctx.measureText(text).width>474)ctx.font=`bold ${--font}px monospace`;
   ctx.fillText(text,266,y+27,474);ctx.font='11px monospace';ctx.fillStyle='#a9a18e';ctx.fillText(s.caption[lang]||s.caption.en,266,y+42,474);
  }
  atlas.needsUpdate=true;
 };
 const off=onLangChange(draw);atlas.addEventListener('dispose',()=>{disposed=true;off();});draw();
 const position=[],normal=[],uv=[],indices=[];
 for(const [n,s]of signs.entries()){
  const base=position.length/3,right={x:s.nz,z:-s.nx},v0=1-(n*48+48)/256,v1=1-n*48/256;
  for(const [rx,ry,u,v]of [[-.5,-.5,0,v0],[.5,-.5,1,v0],[.5,.5,1,v1],[-.5,.5,0,v1]]){
   position.push(s.x+right.x*s.width*rx,s.y+s.height*ry,s.z+right.z*s.width*rx);normal.push(s.nx,0,s.nz);uv.push(u,v);
  }
  indices.push(base,base+1,base+2,base,base+2,base+3);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeBoundingBox();geo.computeBoundingSphere();
 const mat=new THREE.MeshLambertMaterial({map:atlas,side:THREE.DoubleSide,flatShading:true});
 // The Backrooms bake respects brBake as an opt-out. Keep this map-owned Lambert
 // under native lights; cloning it into the global bake cache would retain its atlas.
 mat.userData.brBake=true;
 const mesh=new THREE.Mesh(geo,mat);mesh.name='openplaces36-signs';mesh.userData.noMerge=true;root.add(mesh);group.add(root);return root;
}
