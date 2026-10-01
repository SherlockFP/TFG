import * as THREE from 'three';
import { t,tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { MOONS } from './moons.js';
import { createFieldJob,tuneFieldJob,hireFieldDrone,tickFieldDrone,bandTarget,DRONE_TIME,SIGNAL_PARCEL_VALUE } from './expedition13_core.js';
import { planRelayVault,planSignalRun,buildFieldJob } from '../world/expedition13.js';
import './expedition13_text.js';
import './expedition17_text.js';
import { G } from '../physics/physics.js';
import { registerItem } from './items.js';
import { createItemModel } from '../models/items.js';
import { isField17,tickField17,FIELD17_SECONDS,FIELD17_REWARD } from './expedition17_core.js';
import { planField17 } from '../world/expedition13.js';
registerItem({id:'e17_fuse',name:'Survey replacement fuse',kind:'tool',weight:3,hands:1});
HOST_ONLY.add('e13fx');
export function installExpedition13(game) {
  if(!game.mods)return null;
  const offs=[],undo=[];let plan=null,mesh=null,bound=null,scareTimer=null,progressSync=0,noiseUntil=0;const cooldown=new Map();
  const oldModel=game.mods.itemModels?.get('e17_fuse'),fuseModel=()=>createItemModel('reactor');game.mods.itemModels?.set('e17_fuse',fuseModel);
  undo.push(()=>{if(game.mods.itemModels?.get('e17_fuse')===fuseModel){if(oldModel)game.mods.itemModels.set('e17_fuse',oldModel);else game.mods.itemModels.delete('e17_fuse');}});
  const token=()=>`${game.run?.moon}:${game.run?.seed}:${game.run?.day}`;
  const state=()=>game.run?.expedition13?.token===token()?game.run.expedition13:null;
  const active=()=>!!plan && game.run?.phase==='moon' && !(game.run?.descent21?.depth>0 && plan.kind==='vault');
  const sync=()=>game.broadcastRun?.(['expedition13','credits']);
  const player=id=>game.aiPlayerById?.(id)||game.aiPlayers?.().find(p=>p.id===id);
  const near=(p,node)=>p && !p.dead && !p.downed && Math.hypot(p.pos.x-node.x,p.pos.z-node.z)<=4 && Math.abs(p.pos.y-node.y)<3;
  const visible=(p,n)=>{if(!near(p,n)||p.zone!=='out')return false;const a=new THREE.Vector3(p.pos.x,p.eye?.y??(p.pos.y+1.4),p.pos.z),b=new THREE.Vector3(n.x,n.y,n.z),v=b.clone().sub(a),len=v.length();return len<.05||!game.physics?.raycast?.(a,v.normalize(),Math.max(0,len-.18),G.STATIC|G.DOOR);};
  const oldNoise=game.creatures?.noise;if(oldNoise){const noise=function(pos,loud,...args){if(game.isHost&&active()&&plan.kind==='uplink'&&loud>.14&&pos&&Math.hypot(pos.x-plan.anchor.x,pos.z-plan.anchor.z)<10&&Math.abs(pos.y-plan.anchor.y)<4)noiseUntil=(game.time||0)+1.5;return oldNoise.call(this,pos,loud,...args);};game.creatures.noise=noise;undo.push(()=>{if(game.creatures.noise===noise)game.creatures.noise=oldNoise;});}
  const fx=d=>game.net?.broadcast('e13fx',{token:token(),...d});
  function restorePlan() {
    if(plan?.door && plan.keypad) { plan.door.keypadPos=plan.keypad;delete plan.door.e13gate; }
    mesh?.removeFromParent();mesh?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.name==='field17-status')o.material.dispose();});mesh=null;plan=null;scareTimer=null;cooldown.clear();progressSync=0;noiseUntil=0;
  }
  function applyGate() {
    if(plan?.kind!=='vault')return;
    const st=state();if(!st)return;
    const door=plan.door;
    if(st.done && (!door.open||door.locked))game.onDoor?.({id:door.id,open:true,locked:false,silent:false});
  }
  function onFx(d) {
    if(d?.token!==token() || (d.to && d.to!==game.selfId))return;
    if(d.k==='fielddone'){game.ui?.toast?.(t('Field work complete. Collect the salvage at the console.'),'info');game.sfx?.('bios_beep',.3);game.mods.emit?.('tfg:fieldJob',{kind:state()?.kind,stage:'complete',token:token()},game);}
    if(d.k==='mismatch')game.ui?.toast?.(t('Band mismatch. Match the shown target; completed beacons stay tuned.'),'warn');
    if(d.k==='robotno')game.ui?.toast?.(t('The scout is busy or credits are short.'),'warn');
    if(d.k==='warning') { game.ui?.toast?.(t('The relay whispers back. Something is about to flicker. You can step away.'),'info');game.sfx?.('bios_beep',.2); }
    if(d.k==='help')game.ui?.toast?.(t('When a real stalker follows: crouch into hiding, break sight, close or jam a door.'),'info');
  }
  function bind(net) {if(bound===net)return;bound?.off?.('msg:e13fx',onFx);bound=net;net?.on?.('msg:e13fx',onFx);}
  function queueRareScare(from) {
    const st=state(),r=game.run,p=player(from);
    if(st.scare || (r.quotaIndex|0)<2 || ((r.seed>>>0)%8)!==3 || !p || p.dead || p.downed || p.zone!=='in' || (p.hp??100)<60)return;
    if(game.creatures?.host && [...game.creatures.host.values()].some(c=>c.pos && Math.hypot(c.pos.x-p.pos.x,c.pos.z-p.pos.z)<18))return;
    st.scare=true;scareTimer={elapsed:0,to:from,origin:p.pos.clone?.()||new THREE.Vector3(p.pos.x,p.pos.y,p.pos.z)};
    fx({k:'warning',to:from});sync();
  }
  function request(d,from) {
    if(!game.isHost || !active() || !d || d.token!==token())return;
    const st=state(),p=player(from);if(!st || !p || p.dead || p.downed)return;
    if(d.op==='accept') {
      if(!(isField17(plan.kind)?visible(p,plan.anchor):near(p,plan.anchor))||st.accepted)return;
      if(plan.kind==='repair'){const id=game.items?.hostSpawn?.('e17_fuse',plan.fusePos.clone(),{value:0});if(!id)return;st.fuseId=id;}st.accepted=true;fx({k:'help',to:from});sync();return;
    }
    if(!st.accepted)return;
    if(isField17(plan.kind)) {
      if(!visible(p,plan.anchor))return;
      if(d.op==='install'&&plan.kind==='repair'&&!st.installed){const it=game.items?.get?.(st.fuseId);if(!it||it.type!=='e17_fuse'||it.holder!==from||it.state!=='held')return;st.installed=true;game.net.broadcast('it',{e:'rm',id:st.fuseId});sync();return;}
      if(d.op==='robot'&&plan.kind==='repair'&&st.installed&&!st.done&&!st.drone){const industry=game.run.industry13;if(industry?.robot||industry?.report||(game.run.credits|0)<35){fx({k:'robotno',to:from});return;}game.run.credits-=35;st.drone={elapsed:0};sync();return;}
      if(d.op==='parcel'&&st.done&&!st.parcel){const id=game.items?.hostSpawn?.('robot',new THREE.Vector3(plan.anchor.x,plan.anchor.y-.8,plan.anchor.z+.8),{value:FIELD17_REWARD[plan.kind],tier:'uncommon'});if(!id)return;st.parcel=true;st.rewardId=id;sync();}return;
    }
    if(d.op==='robot') {
      if(plan.kind!=='vault'||!near(p,plan.anchor))return;
      if(!hireFieldDrone(st,game.run)){fx({k:'robotno',to:from});return;}
      sync();return;
    }
    if(d.op==='parcel') {
      if(plan.kind!=='signal'||!st.done||st.parcel||!near(p,plan.anchor))return;
      // Finite physical salvage: it must be carried home and sold through the ordinary quota loop.
      const parcel=game.items?.hostSpawn?.('robot',new THREE.Vector3(plan.anchor.x,plan.anchor.y-.7,plan.anchor.z+1),{value:SIGNAL_PARCEL_VALUE,tier:'uncommon'});
      if(!parcel)return;st.parcel=true;sync();return;
    }
    if(!Number.isInteger(d.i)||d.i<0||d.i>2)return;
    const node=plan.nodes[d.i];if(!near(p,node)||p.zone!==(plan.kind==='vault'?'in':'out'))return;
    const key=`${from}:${d.i}`,now=game.time;if(now-(cooldown.get(key)??-99)<.25)return;cooldown.set(key,now);
    const result=tuneFieldJob(st,d.i,d.op,game.run.seed);
    if(result.mismatch)fx({k:'mismatch',to:from});
    if(!result.ok)return;
    if(result.completed)game.creatures?.noise?.(new THREE.Vector3(node.x,node.y,node.z),.7,from);
    if(result.completed && st.values.filter(Boolean).length===2)queueRareScare(from);
    if(st.done&&plan.kind==='vault'){plan.door.locked=false;game.hostSetDoor?.(plan.door.id,true);applyGate();}
    sync();
  }
  offs.push(game.mods.on('registerHandlers',(H,g)=>{
    if(g!==game)return;H('e13req',request);
    // Existing bonus vault geometry and loot stay owned by the facility; ordinary keypad/key requests cannot bypass three relays.
    for(const action of ['vault','unlock','door']) {
      const previous=game.net.handlers.get(action);
      H(action,(d,from)=>{if(active()&&plan.kind==='vault'&&d?.id===plan.door.id)return;previous?.(d,from);});
    }
    const previous=game.net.handlers.get('i13req');
    if(previous)H('i13req',(d,from)=>{
      if(d?.op==='robot'&&active()&&state()?.drone&&!state()?.done){game.net.sendTo(from,'i13reply',{ok:false,key:'Helper drone is working. Scout cannot do two jobs at once.'});return;}
      previous(d,from);
    });
  }));
  const previous=game.doorInteraction;
  if(typeof previous==='function') {
    const replacement=function(door){
      const st=state();
      if(plan?.door===door&&st&&!st.done) {
        if(!st.accepted)return {label:t('Accept the relay vault job [E]'),sub:t('Three numbered relays open this bonus vault. No timer; crew can split up.'),action:()=>game.net.request('e13req',{token:token(),op:'accept'})};
        if(!st.drone)return {label:t('Hire a helper drone: 35 credits [E]'),sub:t('Three numbered relays open this bonus vault. No timer; crew can split up.'),action:()=>game.net.request('e13req',{token:token(),op:'robot'})};
        return {label:tf('Drone finishes in {n}s',{n:Math.ceil(DRONE_TIME-st.drone.elapsed)}),sub:t('The vault needs three relays; its keypad is disconnected.'),action:()=>{}};
      }
      return previous.call(this,door);
    };
    game.doorInteraction=replacement;undo.push(()=>{if(game.doorInteraction===replacement)game.doorInteraction=previous;});
  }
  offs.push(game.mods.on('warm',(reg,g)=>{if(g===game&&plan?.kind==='repair')reg(fuseModel(),'e17:fuse');}));
  offs.push(game.mods.on('netReady',(net,g)=>{if(g===game)bind(net);}));if(game.net)bind(game.net);
  const bindMap=(world,g)=>{
    if(g!==game||game.run?.descent21?.depth>0)return;restorePlan();if(game.missions14?.reserved(world))return;const r=game.run,m=MOONS[r?.moon];
    if(!m || Math.max(r.quotaIndex|0,r.hub?.q|0)<1 || m.company||m.home||m.expedition||m.goal||m.instance||m.voyage||m.core||m.raid||['echoregistry','embercache'].includes(m.interior))return;
    const old=state();
    if(isField17(old?.kind)||(!old&&(r.seed>>>0)%4>=2))plan=planField17(world,old?.kind||((r.seed>>>0)%4===2?'repair':'uplink'));
    plan ||= (old?.kind==='vault'||(!old && (r.seed&1)))?planRelayVault(world.facility,old?.gateId):null;
    plan ||= planSignalRun(world);if(!plan)return;
    if(plan.kind==='vault'){plan.keypad=plan.door.keypadPos;plan.door.keypadPos=null;plan.door.e13gate=true;}
    mesh=buildFieldJob(plan);
    if(isField17(plan.kind)){const lamp=new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.04),new THREE.MeshBasicMaterial({color:0xd7ac65}));lamp.name='field17-status';lamp.position.set(plan.anchor.x,plan.anchor.y+.1,plan.anchor.z+.16);mesh.add(lamp);}
    if(game.isHost){if(!old || old.kind!==plan.kind)r.expedition13=createFieldJob(token(),plan.kind);if(plan.kind==='vault')r.expedition13.gateId=plan.door.id;sync();}applyGate();
  };
  offs.push(game.mods.on('mapLoaded',bindMap));
  offs.push(game.mods.on('facilityWillChange',(world,g)=>{if(g===game&&plan?.kind==='vault')restorePlan();}));
  offs.push(game.mods.on('facilityChanged',(world,g,depth)=>{if(g===game&&depth===0)bindMap(world,g);}));
  offs.push(game.mods.on('interactables',(out,g)=>{
    if(g!==game||!active()||game.player?.dead)return;const st=state();if(!st)return;
    const indoor=!!game.player?.indoor;
    if(indoor!==(plan.kind==='vault'))return;
    const add=(pos,label,sub,action,r=.35)=>out.push({pos,r,reach:2.8,label,sub,action});
    const send=(op,i)=>game.net.request('e13req',{token:token(),op,i});
    if(isField17(plan.kind)){
      const sub=()=>t(plan.kind==='repair'&&st.drone?'Assistant repairs in 32 seconds while you explore. Manual repair takes 24 seconds nearby.':plan.kind==='repair'?'Carry the marked fuse here, install it, then stay nearby to repair. No deadline.':'Stay within four metres and keep nearby footsteps and voices quiet. Progress pauses safely.');
      if(!st.accepted)add(plan.anchor,()=>t(plan.kind==='repair'?'Accept survey recovery [E]':'Accept quiet uplink [E]'),sub,()=>send('accept'),.6);
      else if(st.done&&!st.parcel)add(plan.anchor,()=>t('Collect field salvage [E]'),sub,()=>send('parcel'),.6);
      else if(plan.kind==='repair'&&!st.installed)add(plan.anchor,()=>t('Install carried survey fuse [E]'),sub,()=>send('install'),.6);
      else if(plan.kind==='repair'&&!st.done&&!st.drone)add(plan.anchor,()=>t('Hire a helper drone: 35 credits [E]'),()=>t('Assistant repairs in 32 seconds while you explore. Manual repair takes 24 seconds nearby.'),()=>send('robot'),.6);
      else if(!st.done&&!st.parcel)add(plan.anchor,()=>tf(plan.kind==='repair'&&st.drone?'Helper repair {n}% — free to explore':'Field work {n}% — stay nearby',{n:Math.floor((st.progress||0)/FIELD17_SECONDS[plan.kind]*100)}),sub,()=>{},.6);
      return;
    }
    if(!st.accepted){add(plan.anchor,()=>t(plan.kind==='vault'?'Accept the relay vault job [E]':'Accept the signal run [E]'),()=>t(plan.kind==='vault'?'Three numbered relays open this bonus vault. No timer; crew can split up.':'Optional job: tune three path beacons, then return here for one salvage parcel.'),()=>send('accept'),.6);return;}
    if(plan.kind==='vault'&&!st.done&&!st.drone)add(plan.anchor,()=>t('Hire a helper drone: 35 credits [E]'),()=>t('Drone needs 45 seconds in this landing. Explore while it checks the relays.'),()=>send('robot'),.6);
    if(plan.kind==='signal'&&st.done&&!st.parcel)add(plan.anchor,()=>t('Collect the signal parcel [E]'),()=>t('All beacons tuned. Return to the first beacon for the parcel.'),()=>send('parcel'),.6);
    for(const node of plan.nodes){if(st.values[node.i])continue;
      if(plan.kind==='vault')add(new THREE.Vector3(node.x,node.y,node.z),()=>tf('Activate relay {n} [E]',{n:node.i+1}),()=>t('Three numbered relays open this bonus vault. No timer; crew can split up.'),()=>send('relay',node.i),.6);
      else for(const op of ['dial','seal'])add(new THREE.Vector3(node.x+(op==='dial'?-.4:.4),node.y,node.z),()=>tf(op==='dial'?'Tune beacon {n} [E]':'Seal beacon {n} [E]',{n:node.i+1}),()=>tf('Target band {target} | dial {dial}. Turn [E]; seal on the right control.',{target:bandTarget(game.run.seed,node.i),dial:st.dials[node.i]}),()=>send(op,node.i),.2);
    }
  }));
  offs.push(game.mods.on('objectives',(add,g,phase)=>{
    if(g!==game||phase!=='moon'||!active()||game.player?.dead)return;const st=state();if(!st?.accepted||st.parcel)return;
    if(isField17(plan.kind)){add(st.done?t('Collect field salvage [E]'):plan.kind==='repair'&&!st.installed?t('Carry the marked fuse here, install it, then stay nearby to repair. No deadline.'):tf(plan.kind==='repair'&&st.drone?'Helper repair {n}% — free to explore':'Field work {n}% — stay nearby',{n:Math.floor((st.progress||0)/FIELD17_SECONDS[plan.kind]*100)}),'sub',false,(st.progress||0)/FIELD17_SECONDS[plan.kind]);return;}
    if(st.done)add(t(plan.kind==='vault'?'All relays online. Bonus vault stays open. Carry the salvage home.':'All beacons tuned. Return to the first beacon for the parcel.'),'hint',true,1);
    else add(tf(plan.kind==='vault'?'Relay vault {n}/3 — optional':'Signal run {n}/3 — optional',{n:st.values.filter(Boolean).length}),'sub',false,st.values.filter(Boolean).length/3);
  }));
  offs.push(game.mods.on('update',(dt,g)=>{
    if(g!==game||!active())return;applyGate();const st=state();if(!st)return;
    const lamp=mesh?.getObjectByName('field17-status');if(lamp)lamp.material.color.setHex(st.done?0x84efad:st.accepted?0x68a8c0:0xd7ac65);
    if(!game.isHost)return;
    if(isField17(plan.kind)){
      const peers=(game.aiPlayers?.()||[]).filter(p=>!p.dead&&!p.downed&&p.zone==='out');
      const threat=[...(game.creatures?.host?.values?.()||[])].some(c=>!c.dead&&c.pos&&Math.hypot(c.pos.x-plan.anchor.x,c.pos.z-plan.anchor.z)<8&&Math.abs(c.pos.y-plan.anchor.y)<4);
      const present=!threat&&peers.some(p=>visible(p,plan.anchor));
      const quiet=(game.time||0)>=noiseUntil&&peers.filter(p=>Math.hypot(p.pos.x-plan.anchor.x,p.pos.z-plan.anchor.z)<10).every(p=>(p.noise||0)<=.14&&(p.voice||0)<=.12);
      const before=st.progress||0,wasDone=st.done;if(!threat)tickField17(st,dt,present,quiet);
      if(st.done&&!wasDone)fx({k:'fielddone'});
      if((st.progress||0)!==before){progressSync+=Math.min(dt,.25);if(st.done||progressSync>=1){progressSync=0;sync();}}return;
    }
    if(st.drone&&!st.done){
      if(tickFieldDrone(st,dt)){plan.door.locked=false;game.hostSetDoor?.(plan.door.id,true);applyGate();sync();}
      else {progressSync+=dt;if(progressSync>=1){progressSync=0;sync();}}
    }
    if(scareTimer){scareTimer.elapsed+=Math.min(Math.max(0,dt),.25);if(scareTimer.elapsed>=3){
      const p=player(scareTimer.to);if(p&&!p.dead&&!p.downed&&p.zone==='in'&&p.pos.distanceTo?.(scareTimer.origin)<5)game.net.sendTo(p.id,'dir',{k:'fig'});
      scareTimer=null;
    }}
  }));
  offs.push(game.mods.on('phase',(phase,g)=>{if(g===game&&phase==='orbit'){restorePlan();if(game.isHost&&game.run?.expedition13){game.run.expedition13=null;sync();}}}));
  return {state,plan:()=>plan,progress:()=>({kind:state()?.kind,seconds:state()?.progress||0,total:FIELD17_SECONDS[state()?.kind]||0,done:!!state()?.done}),requestRobot:()=>game.net?.request('e13req',{token:token(),op:'robot'}),dispose(){restorePlan();for(const off of offs)off?.();for(const fn of undo)fn();bound?.off?.('msg:e13fx',onFx);}};
}
