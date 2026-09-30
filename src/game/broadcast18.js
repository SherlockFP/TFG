// One physical choice on 56K-Dialup: native camera privacy trades the optional powered service route.
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { G } from '../physics/physics.js';
import { HOST_ONLY } from '../net/session.js';
import { B18 } from './broadcast18_text.js';
import { broadcastToken, occupiesBroadcastGate } from './broadcast18_core.js';
HOST_ONLY.add('b18say');
export function installBroadcast18(game) {
 const offs=[];let disposed=false,world=null,key='',managedFc=null,bound=null;
 const token=()=>broadcastToken(game.run);
 const active=()=>!disposed&&!game.destroyed&&game.run?.phase==='moon'&&game.run.moon==='hamsi'&&game.world?.moonId==='hamsi'&&!!game.world?.outdoor?.broadcast18;
 const state=()=>game.run?.broadcast18?.token===token()?game.run.broadcast18:null;
 const announce=(to,text)=>game.net?.sendTo?.(to,'b18say',{token:token(),text});
 const publish=()=>game.broadcastRun?.(['broadcast18']);
 const bodies=()=>[...(game.items?.all?.()||[])].filter(it=>it.type==='body'&&it.state==='world'&&it.obj?.position).map(it=>({pos:it.obj.position,radius:.7,height:1}));
 const occupants=()=>[...(game.aiPlayers?.()||[]).filter(p=>!p.dead&&p.zone==='out'),...bodies()];
 function occupied() {
  const gate=world?.plan?.shortcutDoor;
  return occupants().some(p=>occupiesBroadcastGate(gate,p.pos,p.radius||.5,p.height||1.9));
 }
 function apply() {
  if(!world)return;
  // Never close on a crew member or world body, including during an unrelated native outage.
  const powered=!game.feedcams?.netOff?.();
  const desired=powered||occupied();
  if(world.powered!==desired)world.setPowered(desired);
 }
 function cleanup() {
  if(game.isHost&&managedFc&&game.run?.fc===managedFc&&game.run?.broadcast18?.token===key)game.feedcams?.restoreNetwork?.(game.run.broadcast18.receipt);
  world?.setPowered?.(true);world=null;managedFc=null;key='';
 }
 function prepare() {
  if(!active()){if(world)cleanup();return false;}
  const next=game.world.outdoor.broadcast18;
  if(world!==next||key!==token()) {cleanup();world=next;key=token();managedFc=game.run.fc;
   if(game.isHost&&(!state())){game.run.broadcast18={token:key,rev:0,receipt:null};publish();}
  }
  if(!managedFc)managedFc=game.run.fc;
  apply();return true;
 }
 function reachable(player) {
  const pos=world?.plan?.console;
  if(!player||player.dead||game.downed?.isDowned?.(player.id)||player.zone!=='out'||player.inShip||!player.pos||!pos)return false;
  if(Math.hypot(player.pos.x-pos.x,player.pos.z-pos.z)>2.6||Math.abs(player.pos.y+1.3-pos.y)>2.1)return false;
  if(!game.physics?.raycast)return false;
  const from=new THREE.Vector3(player.pos.x,player.eye?.y??player.pos.y+1.4,player.pos.z),dir=pos.clone().sub(from),length=dir.length();
  try {return length<.1||!game.physics.raycast(from,dir.normalize(),Math.max(0,length-.18),G.STATIC|G.DOOR);} catch {return false;}
 }
 function hostReq(d,from) {
  if(!game.isHost||!active()||!d||d.token!==token()||!prepare())return false;
  const st=state(),p=game.aiPlayerById?.(from);
  if(!st||!Number.isInteger(d.rev)||d.rev!==st.rev||!reachable(p)||!['cut','restore'].includes(d.op))return false;
  if(d.op==='cut') {
   if(game.feedcams?.netOff?.()||!game.run.fc)return false;
   if(occupied()){announce(from,B18.blocked);return false;}
   const receipt=game.feedcams?.cutNetwork?.(150);if(!receipt?.owned)return false;
   st.receipt=receipt;st.rev++;publish();apply();announce(from,B18.dark);return true;
  }
  if(!st.receipt||!game.feedcams?.restoreNetwork?.(st.receipt))return false;
  st.receipt=null;st.rev++;publish();apply();announce(from,B18.back);return true;
 }
 const on=(name,fn)=>{const off=game.mods?.on?.(name,fn);if(off)offs.push(off);};
 on('registerHandlers',(H,g)=>{if(g===game)H('b18req',hostReq);});
 on('mapLoaded',(_,g)=>{if(!g||g===game)prepare();});
 on('phase',(_,g)=>{if(!g||g===game)prepare();});
 on('update',(_,g)=>{if(g&&g!==game)return;if(!prepare())return;const st=state();
  if(game.isHost&&st?.receipt&&(!game.feedcams.netOff()||game.time>=st.receipt.until)){st.receipt=null;st.rev++;publish();}
 });
 on('feedcams',(event,g)=>{if(g===game&&game.isHost&&event?.k==='clock'&&state()?.receipt){state().receipt.until-=event.d;if(state().receipt.previous>0)state().receipt.previous-=event.d;publish();}});
 on('interactables',(out,g)=>{
  if(g!==game||!prepare()||game.player?.dead||game.player?.indoor)return;
  const st=state();if(!st||!game.run.fc)return;
  const off=game.feedcams.netOff(),canRestore=!!st.receipt?.owned&&game.run.fc.off===st.receipt.until;
  out.push({pos:world.plan.console,r:.35,reach:2.4,label:()=>t(off?(canRestore?B18.restore:B18.externalLabel):B18.cut),sub:()=>t(off?(canRestore?B18.recover:B18.external):B18.choice),action:()=>{if(off&&!canRestore)return;game.net?.request?.('b18req',{token:token(),rev:state()?.rev,op:off?'restore':'cut'});}});
 });
 const onSay=d=>{if(d?.token===token()&&Object.values(B18).includes(d.text))game.ui?.toast?.(t(d.text),'info');};
 function bind(net){bound?.off?.('msg:b18say',onSay);bound=net;bound?.on_?.('b18say',onSay);}
 on('netReady',(net,g)=>{if(g===game)bind(net);});if(game.net)bind(game.net);prepare();
 return {plan:()=>world?.plan||null,state,hostReq,powered:()=>!game.feedcams?.netOff?.(),dispose(){if(disposed)return;cleanup();disposed=true;for(const off of offs)off();bound?.off?.('msg:b18say',onSay);}};
}
