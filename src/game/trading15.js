import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {t,addTranslations} from '../core/i18n.js';
const rows=[['Your order is on the blue pickup tray beside the broker. Aim at a tool and press E.','Siparişin tüccarın yanındaki mavi teslim tepsisinde. Eşyaya bak ve E bas.','Заказ на синем поддоне рядом с брокером. Наведи на инструмент и нажми E.'],['Collect items from the pickup tray before ordering more.','Yeni siparişten önce teslim tepsisindeki eşyaları al.','Забери вещи с поддона перед новым заказом.'],['That order was already processed.','Bu sipariş zaten işlendi.','Этот заказ уже обработан.'],['Basic tools are available now. Production uses the same crew Credits; save enough for equipment.','Temel ekipman şimdi alınabilir. Üretim aynı ekip Kredilerini kullanır; ekipmana yetecek kadar ayır.','Базовые инструменты уже доступны. Производство расходует общие кредиты; оставь средства на снаряжение.'],['PICKUP / E','TESLİM / E','ПОЛУЧЕНИЕ / E']];for(const[i,lang]of[[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
export function createTrading15(game,near){
 let vendor=null,root=null,col=null;
 const center=()=>vendor?.localToWorld(new THREE.Vector3(0,.18,2.4));
 function sync(){const p=center();if(p&&col)col.setTranslation({x:p.x,y:p.y,z:p.z});}
 function clear(){if(col){game.physics?.removeCollider(col);col=null;}root?.removeFromParent();root?.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});root=null;vendor=null;}
 function bind(base){clear();vendor=base;root=new THREE.Group();base.add(root);const m=new THREE.Mesh(new THREE.BoxGeometry(2.4,.36,1.6),new THREE.MeshLambertMaterial({color:0x3d7889}));m.position.set(0,.18,2.4);root.add(m);
 const p=center();if(game.physics?.addStaticBox)col=game.physics.addStaticBox(p.x,p.y,p.z,1.2,.18,.8,0,G.STATIC,{kind:'trading15'});
 if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#19313b';x.fillRect(0,0,256,64);x.fillStyle='#c6e7da';x.font='bold 28px sans-serif';x.textAlign='center';x.fillText(t('PICKUP / E'),128,42,246);const tex=new THREE.CanvasTexture(c);const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.425),new THREE.MeshBasicMaterial({map:tex}));sign.position.set(0,.48,3.22);root.add(sign);}}
 function plan(from,types){if(!vendor||!near(from)||!Array.isArray(types)||types.length>12)return null;sync();
 const occupied=[...game.items.all()].filter(it=>it.state==='world'&&it.obj.getWorldPosition(new THREE.Vector3()).distanceTo(center())<2.5);
 const slots=[];for(let i=0;i<12;i++){const p=vendor.localToWorld(new THREE.Vector3((i%4-1.5)*.55,1.5,1.9+Math.floor(i/4)*.5));if(occupied.some(it=>{const q=it.obj.getWorldPosition(new THREE.Vector3());return Math.hypot(q.x-p.x,q.z-p.z)<.35;}))continue;const hit=game.physics.raycast(p,new THREE.Vector3(0,-1,0),3,G.STATIC|G.DOOR);if(!hit||hit.normal.y<.65)continue;p.y=hit.point.y+1.15;slots.push(p);if(slots.length>=types.length)break;}
 return slots.length>=types.length?slots.slice(0,types.length):null;
 }
 return {bind,clear,plan,sync,get center(){return center();},dispose:clear};
}
