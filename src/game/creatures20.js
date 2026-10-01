import * as THREE from 'three';
import {RAPIER,G,groups} from '../physics/physics.js';
import {looseCargo,impulseCargo} from './cargo20_core.js';
import {registerCreature,CREATURES,EXTRA_SPAWNS} from './creatures.js';
import {isSellable} from './items.js';
import {STATE_SOUNDS} from '../entities/creatures.js';
import {IDENT} from './identify.js';
import {FIELD_NOTES} from './collection.js';
import {addTranslations} from '../core/i18n.js';
import {ensureCreature20Audio} from './creatures20_audio.js';
import {createCreature20} from '../models/creatures20.js';
export const C20_IDS=['c20_pixel','c20_brute'];
export const C20_HINTS={c20_pixel:'Its shutter follows visible carried salvage. Put it away or drop it, then break sight. A raised wrist warns before a swipe.',c20_brute:'Loud noise draws the mover. Its raised shoulder winds up for 1.6 seconds. Retreat or use a wall; loose props can be shoved.'};
let active=null,registered=false;
const alive=(c,M)=>M.playersFor(c).filter(p=>!p.dead&&!p.downed&&!M.game.downed?.isDowned?.(p.id)&&!p.inShip&&!M.nearSafeZone(p));
function cargo(M,id){for(const it of M.game.items?.all?.()||[])if(it.state==='held'&&it.holder===id&&!it.inv&&isSellable(it.def))return true;return false;}
function suppressed(M){return !!M.game.escape14?.active?.()||!!M.game.missions14?.active?.();}
function shove(c,M){let n=0;for(const it of M.game.items?.all?.()||[]){if(n>=3)break;
 if(!looseCargo(it))continue;const p=it.body.translation(),v=new THREE.Vector3(p.x,p.y,p.z),d=v.distanceTo(c.pos);
 if(d>2.3||d<.05||!M.game.physics.lineOfSight(M.eye(c).clone(),v))continue;
 if(impulseCargo(it,{x:p.x-c.pos.x,z:p.z-c.pos.z},{deltaSpeed:.8,maxSpeed:2.5,maxImpulse:10}))n++;
 }}
function move(c,goal,dt,speed,M){const d=c.data;d.old ||=new THREE.Vector3();d.old.copy(c.pos);M.moveToward(c,goal,Math.min(.1,dt),speed);
 const x=c.pos.x-d.old.x,z=c.pos.z-d.old.z;if(Math.hypot(x,z)<.00001)return;
 d.capsule ||=new RAPIER.Capsule(Math.max(.05,c.def.height/2-c.def.radius),c.def.radius);
 const hit=M.game.physics.world.castShape({x:d.old.x,y:d.old.y+c.def.height/2+.02,z:d.old.z},{x:0,y:0,z:0,w:1},{x,y:0,z},d.capsule,.01,1,true,undefined,groups(0xffff,G.STATIC|G.DOOR));
 if(hit){c.pos.copy(d.old);c.path=null;c.repath=Math.max(c.repath||0,.8);}
}
function behavior(pixel){return(c,dt,M)=>{
 const d=c.data;if(!d.init){d.init=true;d.last=c.pos.clone();d.lost=0;c.setState('idle');}
 if(suppressed(M)){c.target=null;c.extra=0;c.setState('rest');return;}
 if(c.state==='rest'){if(c.t>=4)c.setState('idle');return;}
 const ps=alive(c,M),p=ps.find(p=>p.id===c.target),visible=p&&M.canSee(c,p,16,360),relevant=p&&(!pixel||cargo(M,p.id));
 if(c.state==='windup'){
  c.extra=Math.min(1,c.t/(pixel?1.2:1.6));
  if(!p||!visible||!relevant){c.extra=0;c.target=null;c.setState('rest');return;}
  if(c.t>=(pixel?1.2:1.6)){
   if(p.pos.distanceTo(c.pos)<(pixel?1.65:2.1)){M.attack(c,p,c.dmg,c.type,true);if(!pixel)shove(c,M);}
   c.extra=0;c.target=null;c.setState('rest');
  }return;
 }
 if(c.state==='chase'){
  if(visible&&relevant){d.last.copy(p.pos);d.lost=0;}else d.lost+=dt;
  if(d.lost>2.5||c.t>12){c.target=null;c.setState('rest');return;}
  if(visible&&relevant&&p.pos.distanceTo(c.pos)<(pixel?1.65:2.1)&&c.age>3){c.yaw=Math.atan2(p.pos.x-c.pos.x,p.pos.z-c.pos.z);c.setState('windup');return;}
  move(c,d.last,dt,pixel?3.2:2.8,M);return;
 }
 const candidates=pixel?ps.filter(p=>cargo(M,p.id)&&M.canSee(c,p,14,120)):ps.filter(p=>(p.noise||0)>.3||(p.voice||0)>.3);
 const nearest=M.nearest(c,candidates,pixel?14:12);
 if(nearest&&M.canSee(c,nearest.p,pixel?14:12,360)){c.target=nearest.p.id;d.last.copy(nearest.p.pos);d.lost=0;c.setState('chase');return;}
 // Brute investigates acoustic cues; a noise behind a wall never grants target sight.
 if(!pixel){const noise=M.hear(c,12);if(noise&&(!noise.zone||noise.zone===c.zone))move(c,noise.pos,dt,1.5,M);}
 };}
export function installCreatures20(game){active=game;
 if(!registered){registered=true;
  for(const [id,name,hp,dmg,radius,height,power]of [['c20_pixel','Tracking Pixel',65,14,.35,1.3,1.5],['c20_brute','Buffer Brute',180,28,.55,2.15,3]]){
   registerCreature(id,{name,hp,dmg,radius,height,power,walk:1.5,run:id==='c20_pixel'?3.2:2.8,zone:'in',maxAlive:1,xp:0,coin:0,lore:C20_HINTS[id]},behavior(id==='c20_pixel'));
   Object.defineProperty(CREATURES[id],'noSpawn',{enumerable:true,configurable:true,get:()=>!active||(active.run?.quotaIndex|0)<2||suppressed({game:active})||[...active.creatures?.host?.values?.()||[]].some(c=>!c.dead&&C20_IDS.includes(c.type))});
   EXTRA_SPAWNS[id]={zone:'in',w:[0,0,.6,.8],interior:{factory:1.2,office:1.1}};IDENT[id]=['Anomaly',3,C20_HINTS[id]];FIELD_NOTES[id]=C20_HINTS[id];
   STATE_SOUNDS[id]={windup:[id==='c20_pixel'?'c20_pixel_tell':'c20_brute_tell',.7,.8],rest:['hit_metal',.25,.7]};
  }
 }
 addTranslations({'Tracking Pixel':'Takip Pikseli','Buffer Brute':'Tampon İrisi',[C20_HINTS.c20_pixel]:'Deklanşörü görünür taşınan hurdayı izler. Eşyayı çantaya koy veya bırak, sonra görüşünü kes. Kalkmış bilek, vuruş öncesi uyarıdır.',[C20_HINTS.c20_brute]:'Yüksek ses taşıyıcıyı çeker. Kalkmış omzu 1,6 saniyelik hazırlığı gösterir. Geri çekil veya duvara sığın; yerdeki eşyaları itebilir.'},'tr');addTranslations({'Tracking Pixel':'Следящий пиксель','Buffer Brute':'Буферный громила',[C20_HINTS.c20_pixel]:'Затвор следит за видимым переносимым хламом. Уберите его или бросьте и скройтесь из виду. Поднятая кисть предупреждает об ударе.',[C20_HINTS.c20_brute]:'Громкий шум привлекает грузчика. Поднятое плечо предупреждает за 1,6 секунды. Отступите или спрячьтесь за стеной; он толкает свободные предметы.'},'ru');
 const registry=(typeof window!=='undefined'?window.__kefalMods?.creatureModels:null)||game.mods?.creatureModels;
 for(const id of C20_IDS)registry?.set(id,()=>createCreature20(id));
 let audioReady=false;const audioOff=game.mods?.on?.('update',()=>{if(audioReady)return;try{audioReady=ensureCreature20Audio(game);}catch{audioReady=true;}});
 const off=game.mods?.on?.('warm',reg=>{if((game.run?.quotaIndex|0)>=2&&game.world?.facility)for(const id of C20_IDS)reg(createCreature20(id).root);});
 return{ids:C20_IDS,dispose(){off?.();audioOff?.();if(active===game)active=null;}};
}
