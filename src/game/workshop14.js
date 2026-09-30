import * as THREE from 'three';
import { industryOf,PRODUCTS,transactIndustry } from './industry13_core.js';
import { t,addTranslations,sysMsg } from '../core/i18n.js';
const rows=[['Bay','Bölme','Место'],['Sell packed batch [E]','Paketlenmiş partiyi sat [E]','Продать упакованную партию [E]'],['Hold E: calibrate batch','E basılı tut: partiyi ayarla','Удерживай E: настроить партию'],['Collect finished parcel [E]','Hazır paketi al [E]','Забрать готовую посылку [E]'],['Bay empty: commission with broker','Bölme boş: tüccardan üretim başlat','Место пусто: закажи у брокера'],['Waiting for field shifts','Saha seferleri bekleniyor','Ожидание вылазок'],['Scout docked [E]','Keşif robotu parkta [E]','Разведчик на доке [E]'],['Scout away: completed shifts advance survey','Robot uzakta: tamamlanan seferler keşfi ilerletir','Разведчик в пути: вылазки продвигают разведку'],['Collect scout report [E]','Robot raporunu al [E]','Забрать отчёт разведчика [E]'],['Calibrating: keep E held beside the bay','Ayarlanıyor: bölmenin yanında E basılı tut','Настройка: держи E рядом с местом'],['Batch is waiting for field shifts.','Parti saha seferlerini bekliyor.','Партия ждёт вылазок.'],['Batch is already calibrated.','Parti zaten ayarlandı.','Партия уже настроена.'],['Calibration complete. Collect the finished parcel at this bay.','Ayar tamam. Hazır paketi bu bölmeden al.','Настройка завершена. Забери посылку здесь.'],['Calibrate the bay before collecting.','Almadan önce bölmeyi ayarla.','Настрой место перед получением.'],['Finished parcel collected. Sell it to the broker.','Hazır paket alındı. Tüccara sat.','Посылка получена. Продай её брокеру.'],['Return to the physical bay for calibration and parcel collection.','Ayar ve paket teslimi için fiziksel bölmeye dön.','Вернись к физическому месту для настройки и получения посылки.']];
for(const [i,lang]of[[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
export function installWorkshop14(game,context){
 const offs=[],sessions=new Map();let group=null,bays=[],scout=null,goodsDock=null,localJob=null,beat=0;
 const duration=2.4,grace=.5;
 const valid=(from,bay)=>{const p=game.aiPlayerById?.(from);return p&&!p.dead&&!p.downed&&context.near(from)&&bay&&p.pos.distanceTo(bay.pos)<2.8;};
 const reply=(from,key,kind='info')=>game.net.sendTo(from,'sys',sysMsg(key,{},kind));
 const commit=(d,from)=>{const r=transactIndustry(game.run,d);if(r.ok){game.broadcastRun(['industry13','credits']);game.hostSave?.();}reply(from,r.key,r.ok?'good':'warn');return r;};
 function clear(){sessions.clear();localJob=null;group?.removeFromParent();group?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group=null;bays=[];scout=null;goodsDock=null;}
 function bind(vendor){clear();if(!vendor)return;group=new THREE.Group();vendor.add(group);
 const box=(x,y,z,w,h,d,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color}));m.position.set(x,y,z);group.add(m);return m;};
 for(let i=0;i<3;i++){const x=(i-1)*1.12;box(x,1.34,.12,.84,.42,.66,0x293841);box(x,1.6,-.13,.82,.1,.09,0xb8a45f);const lamp=box(x,1.58,.46,.15,.08,.06,0x40484d),parcel=box(x,1.92,.13,.52,.42,.44,0xc5ab77);const band=box(x,1.94,.13,.56,.06,.46,0x394752);parcel.add(band);band.position.set(0,.02,0);const lever=box(x+.29,1.53,.49,.08,.22,.08,0xc5ab77),bar=box(x,1.36,.48,.65,.045,.04,0x73bea3);parcel.visible=false;const localPos=new THREE.Vector3(x,1.5,.67);bays.push({i,get pos(){return vendor.localToWorld(localPos.clone());},lamp,parcel,lever,bar});}
 const packed=box(-2,1.42,.16,.52,.4,.5,0xbba374);goodsDock={parcel:packed,get pos(){return vendor.localToWorld(new THREE.Vector3(-2,1.45,.6));}};
 const chassis=box(2.8,.8,-.8,.58,.4,.7,0x718c93),head=box(2.8,1.15,-.6,.35,.25,.32,0x94bebc),report=box(2.8,1.23,-.1,.5,.09,.38,0xd3c6a2),lamp=box(2.8,.8,-.3,.15,.12,.06,0x4e6466);scout={chassis,head,report,lamp,get pos(){return vendor.localToWorld(new THREE.Vector3(2.8,1,-.05));}};
 }
 function host(d,from){if(!game.isHost||!game.run||!d)return;const s=industryOf(game.run),job=s.jobs.find(j=>j.id===d.id),index=s.jobs.indexOf(job),bay=bays[index];
 if(!job?.physical||!valid(from,bay))return;
 if(d.op==='pack'){sessions.delete(from);commit({op:'pack',id:job.id},from);return;}
 if(d.op!=='hold'||job.due>s.shift||job.tuned)return;
 let session=sessions.get(from);if(!session||session.id!==job.id||game.time-session.beat>grace){session={id:job.id,start:game.time,beat:game.time};sessions.set(from,session);}session.beat=game.time;
 }
 offs.push(game.mods.on('registerHandlers',H=>H('w14act',host)));
 offs.push(game.mods.on('interactables',out=>{if(!group||!game.run)return;const s=industryOf(game.run);for(const bay of bays){const job=s.jobs[bay.i];const label=!job?'Bay empty: commission with broker':job.due>s.shift?'Waiting for field shifts':job.tuned?'Collect finished parcel [E]':'Hold E: calibrate batch';out.push({pos:bay.pos,r:.45,reach:2.6,label:t('Bay')+' '+(bay.i+1)+' · '+t(label)+(job?' · '+t(PRODUCTS[job.product]?.name||job.product):''),action:()=>{if(!job)return context.open();if(job.due>s.shift)return;game.ui.closePanel?.(true);if(job.tuned){game.net.request('w14act',{op:'pack',id:job.id});return;}localJob=job.id;beat=.2;game.ui.toast(t('Calibrating: keep E held beside the bay'));}});}
 if(goodsDock){const product=Object.keys(PRODUCTS).find(id=>(s.goods[id]||0)>0);if(product)out.push({pos:goodsDock.pos,r:.3,reach:2.6,label:t('Sell packed batch [E]')+' · '+t(PRODUCTS[product].name),action:()=>context.send('sell',{product})});}
 if(scout)out.push({pos:scout.pos,r:.4,reach:3,label:t(s.report?'Collect scout report [E]':s.robot?'Scout away: completed shifts advance survey':'Scout docked [E]'),action:()=>s.report?context.send('collect'):context.open()});}));
 offs.push(game.mods.on('update',(dt)=>{if(!group||!game.run)return;const s=industryOf(game.run);
 if(localJob!==null){const job=s.jobs.find(j=>j.id===localJob),bay=bays[s.jobs.indexOf(job)];if(!job||job.tuned||!valid(game.selfId,bay)||!game.input?.codeDown(game.input.key('interact'))||game.ui.blocksInput?.()){localJob=null;}else if((beat+=dt)>=.15){beat=0;game.net.request('w14act',{op:'hold',id:localJob});}}
 if(game.isHost)for(const [from,session]of sessions){const job=s.jobs.find(j=>j.id===session.id),bay=bays[s.jobs.indexOf(job)];if(!job||!valid(from,bay)||game.time-session.beat>grace||job.tuned){sessions.delete(from);continue;}if(game.time-session.start>=duration){sessions.delete(from);commit({op:'calibrate',id:job.id},from);}}
 for(const bay of bays){const job=s.jobs[bay.i],ready=job&&job.due<=s.shift;bay.lamp.material.color.setHex(!job?0x465158:job.tuned?0x8dda98:ready?0xe0b853:0x649cbb);bay.parcel.visible=!!job?.tuned;bay.lever.rotation.x=localJob===job?.id?Math.sin(game.time*9)*.2:0;bay.bar.scale.x=job?job.tuned?1:ready?.7:.25:.05;}
 if(goodsDock)goodsDock.parcel.visible=Object.values(s.goods).some(n=>n>0);
 if(scout){scout.chassis.visible=scout.head.visible=!s.robot;scout.report.visible=!!s.report;scout.lamp.material.color.setHex(s.report?0x80d99b:s.robot?0xe9b656:0x628ea8);}
 }));
 offs.push(game.mods.on('phase',ph=>{if(['takeoff','fired','orbit'].includes(ph)){sessions.clear();localJob=null;}}));
 return {bind,clear,get bays(){return bays;},get scout(){return scout;},get sessions(){return sessions;},dispose(){clear();offs.forEach(f=>f());}};
}
