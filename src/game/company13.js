import { t, sysMsg,addTranslations } from '../core/i18n.js';
import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {createCompanyClaw38} from '../models/companyclaw38.js';
import { ringDiscipline } from './company13_core.js';
import './company13_text.js';
export function installCompany13(game) {
  const offs=[]; let actorTime=0,disposed=false,claw=null,clawCompany=null;
  const now=()=>game.time||0;
  const warning='The intake claw is waking. Step away from the bell!';
  addTranslations({[warning]:'Kabul pençesi uyanıyor. Zilden uzaklaş!'},'tr');addTranslations({[warning]:'Приёмный коготь просыпается. Отойдите от звонка!'},'ru');
  const previous=game.hostSell;
  const state=()=>{const s=game.run.company13 || (game.run.company13={ringers:{}});if(s.clock38!==true){s.clock38=true;s.ringers={};delete s.claw38;}return s;};
  const notify=(from,key,vars={})=>game.net.sendTo(from,'sys',sysMsg(key,vars,'info'));
  function physical(from){
    const c=game.world?.company,bell=c?.interactables.find(i=>i.type==='bell'),p=game.aiPlayers().find(p=>p.id===from);
    if(!bell||!p||p.dead||p.downed||game.downed?.isDowned?.(from)||game.net?.lost?.has(from))return false;
    const eye=p.eye?.isVector3?p.eye:p.pos.clone().add(new THREE.Vector3(0,1.62,0)),dir=bell.pos.clone().sub(eye),dist=dir.length();
    if(dist>3.5||dist>.15&&game.physics.raycast(eye,dir.normalize(),dist-.15,G.STATIC|G.DOOR))return false;
    const ground=game.physics.raycast({x:p.pos.x,y:p.pos.y+.3,z:p.pos.z},{x:0,y:-1,z:0},.75,G.STATIC);
    return !!ground&&Math.abs(ground.point.y-(c.groundY??-1.25))<.25;
  }
  function strike(from){
    const c=game.world.company,s=state();s.claw38={stage:'windup',from,at:now()};notify(from,warning);game.broadcastRun(['company13']);
    game.later(()=>{if(disposed||game.world?.company!==c||game.run?.phase!=='company'||s!==game.run.company13)return;s.claw38.stage='strike';game.broadcastRun(['company13']);if(physical(from))game.hostHurtPlayer(from,38,'companyclaw');
      game.later(()=>{if(disposed||game.world?.company!==c||s!==game.run?.company13)return;s.claw38.stage='idle';game.broadcastRun(['company13']);},650);
    },1100);
  }
  function wrapped(from) {
    if (!this.isHost || this.run?.phase!=='company') return previous.call(this,from);
    const c=this.world?.company, bell=c?.interactables.find(i=>i.type==='bell');
    const player=this.aiPlayers().find(p=>p.id===from);
    if (!bell || !player || !physical(from)) return;
    const s=state(), old=s.ringers[from];
    if (old?.until>now()) { notify(from,'Your bell access is paused for {n}s. No credits or scrap were taken.',{n:Math.ceil(old.until-now())}); return; }
    if (this.hostData?.selling) return;
    const result=previous.call(this,from);
    const next=ringDiscipline(old,now(),!!this.hostData?.selling);s.ringers[from]=next;
    if(next.event==='warn') notify(from,'The Algorithm is irritated. Bring content; stop ringing an empty counter.');
    if(next.event==='paused'){notify(from,'Your bell access is paused for {n}s. No credits or scrap were taken.',{n:8});strike(from);}
    this.broadcastRun(['company13']); return result;
  }
  if(typeof previous==='function') game.hostSell=wrapped;
  const clearClaw=()=>{claw?.dispose();claw=null;clawCompany=null;};
  const oldUnload=game.unloadMap;if(typeof oldUnload==='function'){
    const next=function(...args){clearClaw();return oldUnload.apply(this,args);};game.unloadMap=next;
    offs.push(()=>{if(game.unloadMap===next)game.unloadMap=oldUnload;});
  }
  offs.push(game.mods.on('update',(dt,g)=> {
    if(g!==game)return;
    const company=game.world?.company;
    if(company!==clawCompany){claw?.dispose();claw=null;clawCompany=company;if(company?.group)claw=createCompanyClaw38(company);}
    claw?.update(now(),game.run?.company13?.claw38?.stage);
    actorTime+=Math.max(0,dt);
    for(const [i,npc] of (game.world?.company?.serviceNPCs || []).entries()) {
      const player=game.player,near=!!player && !player.dead && player.pos.distanceTo(npc.pos)<5;
      const irritated=npc.id==='auditor' && Object.values(game.run?.company13?.ringers || {}).some(s=>s.count>=4 || s.until>now());
      npc.avatar.setExpression?.(irritated?'angry':near?'happy':'normal');
      npc.avatar.update(Math.min(.1,dt),{speed:0,grounded:true,time:actorTime+i*2,emote:near && (actorTime+i*3)%12<1.4?'wave':null});
      if(near) npc.avatar.root.lookAt(player.pos.x,npc.avatar.root.position.y,player.pos.z);
      else npc.avatar.root.rotation.y=Math.sin(actorTime*.4+i)*.12;
    }
    if(game.isHost && game.run?.phase!=='company' && game.run?.company13) delete game.run.company13;
  }));
  offs.push(game.mods.on('interactables',(out,g)=> {
    if(g!==game || game.run?.phase!=='company') return;
    for(const npc of game.world?.company?.serviceNPCs || []) out.push({pos:npc.pos,r:2,label:t(npc.id==='clerk'?'Talk to the exchange clerk [E]':'Ask the compliance auditor [E]'),action:()=>game.net.request('c13talk',{id:npc.id})});
  }));
  offs.push(game.mods.on('registerHandlers',(H,g)=> {
    if(g!==game)return;
    H('c13talk',(data,from)=> {
      if(!game.isHost || game.run?.phase!=='company')return;
      const npc=game.world?.company?.serviceNPCs?.find(n=>n.id===data?.id),p=game.aiPlayers().find(p=>p.id===from);
      if(!npc||!p||p.dead||p.pos.distanceTo(npc.pos)>4)return;
      if(npc.id==='clerk' && game.run.contract) {
        const contract=game.run.contract;
        notify(from,contract.state==='complete'?'Your crew completed its contract. The next moon is a chance to build a new faction relationship.':'Your crew contract: {n}/{goal}. Review CONTRACTS aboard ship before your next moon.',{n:Math.max(0,contract.progress|0),goal:Math.max(1,contract.n|0)});
        return;
      }
      notify(from,npc.id==='clerk'?'Content goes on the rear counter. Ring once. The House trades chips; contracts are posted here.':'Repeated empty bells irritate the Algorithm. Your access may pause briefly; a real delivery calms it.');
    });
  }));
  return { dispose(){if(disposed)return;disposed=true;claw?.dispose();claw=null;offs.forEach(off=>off?.());if(game.hostSell===wrapped)game.hostSell=previous;} };
}
