// Separate, host-owned survival run. Native world/items/phase/credits remain owners.
import * as THREE from 'three';
import {t,sysMsg} from '../core/i18n.js';
import {hashString,RNG} from '../core/rng.js';
import {G} from '../physics/physics.js';
import {insideShip} from '../world/ship.js';
import {ITEMS,isSellable} from './items.js';
import {sanitize,effects} from './shipyard_core.js';
import {newEndless41,admitPlayer41,gainXp41,resolveOffer41,xpNeed41,starterShip41} from './endless41_core.js';
import {installEndless41Waves} from './endless41_waves.js';
import {installEndless41Robots} from './endless41_robots.js';
import {createEndless41UI} from '../ui/endless41.js';

export function installEndless41(game,{presentation=true}={}){
 let disposed=false,ui=null,lastOffer='',selling=false,pulse=new Map();const off=[],restores=[];
 const active=()=>!disposed&&game.config?.mode==='endless'&&game.run?.mode==='endless'&&game.run?.endless41?.v===41;
 const state=()=>game.run?.endless41;
 const connected=id=>id===game.selfId||game.net?.players?.has(id)&&!game.net?.lost?.has(id);
 const player=id=>connected(id)?game.aiPlayerById?.(id):null;
 const eyeOf=p=>p.eye?.isVector3?p.eye:new THREE.Vector3(p.pos.x,p.pos.y+(Number.isFinite(p.eye)?p.eye:1.62),p.pos.z);
 const point=()=>game.ship?.points?.terminal;
 const build=(id=game.selfId)=>{const p=state()?.players?.[id];return p?structuredClone(p):null;};
 function canPrepare(id){
  const p=player(id),q=point();if(!active()||!game.isHost||!p||p.dead||p.downed||game.downed?.isDowned?.(id)||state().stage==='over'||!q||!insideShip(p.pos)||!['orbit','moon','company'].includes(game.run.phase))return false;
  const eye=eyeOf(p),delta=q.clone().sub(eye),distance=delta.length();if(!Number.isFinite(distance)||distance>3.5)return false;
  const floor=game.physics.raycast(new THREE.Vector3(p.pos.x,p.pos.y+.2,p.pos.z),new THREE.Vector3(0,-1,0),.6,G.STATIC|G.DOOR);
  if(!floor||floor.normal?.y<.65)return false;
  const hit=distance>.05?game.physics.raycast(eye,delta.divideScalar(distance),distance,G.STATIC|G.DOOR):null;return !hit||hit.distance>=distance-.2;
 }
 const changed=()=>{game.refreshStats?.();game.broadcastRun?.(['endless41','credits','sy']);};
 const wrap=(name,make)=>{const original=game[name];if(typeof original!=='function')return;game[name]=make(original);restores.push(()=>game[name]=original);};
 const listen=(event,fn)=>{const stop=game.mods?.on?.(event,fn);if(stop)off.push(stop);};
 function grantStarter(id){
  if(!active()||!game.isHost||!connected(id))return false;
  const p=player(id);if(!p||p.dead||!p.pos||![p.pos.x,p.pos.y,p.pos.z].every(Number.isFinite)||id!==game.selfId&&!(game.remotes?.get(id)?.lastUpdate>0))return false;const e=admitPlayer41(state(),id,id===game.selfId?game.profile.id:game.net.players.get(id)?.pid||id);
  if(e.starter)return false;e.starter=true;state().revision++;
  for(const type of ['shotgun','pipe','flashlight','walkie'])if(ITEMS[type]&&![...game.items.all()].some(it=>it.holder===id&&it.type===type))game.items.hostSpawn(type,p.pos.clone().add(new THREE.Vector3(0,1,0)),{holder:id,soulbound:`e41:${state().token}:${id}`});
  changed();return true;
 }
 function awardXp(id,amount){if(!active()||!game.isHost||!player(id))return false;if(gainXp41(state(),id,amount)){changed();return true;}return false;}
 function catalog(id=game.selfId){
  const s=state(),u=s?.upgrades||{},p=build(id),repair=Math.max(1,Math.round(45*(1-.08*(p?.perks.repair||0))));
  return [...robots.catalog(id),{id:'repair',name:'Repair hull',description:'Restore 100 ship health',price:repair,level:s?.shipHp||0,max:s?.shipMaxHp||300,kind:'ship'},
   {id:'refuel',name:'Emergency reactor charge',description:'Orbit service when no recovered server core remains',price:45,level:game.run?.reactor38?.ready?1:0,max:1,available:game.run?.phase==='orbit',kind:'service'},
   ...[['hull','Reinforced hull',120,3],['turret','Turret Hardpoint',180,3],['bunk','Bunk Room',140,3],['lab','Lab',160,3],['medbay','Med Bay',140,3],['engine','Engine Room',160,3],['cargo','Cargo Bay',120,3]].map(([id,name,price,max])=>({id,name,description:id==='hull'?'Maximum hull health +100':'Fit or improve the working ship room',price:price*(1+(u[id]||0)),level:u[id]||0,max,kind:'ship'})),{id:'ammo',name:'Shotgun shells',description:'Native ammunition for your shotgun',price:15,level:0,max:999,kind:'supply'}, {id:'cashout',name:'Sell extracted cargo',description:'Sell physical cargo aboard the ship',price:0,level:0,max:999,kind:'service'}];
 }
 function cashout(from){
  if(selling)return false;
  const list=[...game.items.all()].filter(it=>isSellable(it.def)&&!it.soulbound&&it.type!=='body'&&(it.holder?it.holder===from&&insideShip(player(from).pos):insideShip(it.obj.position)));
  if(!list.length)return false;const mul=1+.05*(state().players[from]?.perks.salvage||0)+effects(sanitize(game.run.sy)).sellBonus;const value=list.reduce((n,it)=>n+Math.max(0,Math.round(it.value*mul)),0);if(!Number.isFinite(value))return false;
  // Commit the receipt before synchronous removal/state callbacks; replay finds no stock.
  selling=true;try{game.run.credits+=value;state().revision++;for(const it of list)game.net.broadcast('it',{e:'rm',id:it.id});changed();game.net.broadcast('sys',sysMsg('EXTRACTED CARGO +{value} CR',{value},'good'));return true;}finally{selling=false;}
 }
 function buy(id,from){
  if(!canPrepare(from))return false;if(id==='cashout')return cashout(from);
  if(robots.catalog(from).some(c=>c.id===id))return robots.buy(id,from);
  const c=catalog(from).find(c=>c.id===id);if(!c||c.level>=c.max||!Number.isFinite(game.run.credits)||game.run.credits<c.price)return false;
  if(id==='repair'&&state().shipHp>=state().shipMaxHp)return false;
  if(id==='refuel'&&(game.run.phase!=='orbit'||!game.run.reactor38||game.run.reactor38.ready))return false;
  const s=state();game.run.credits-=c.price;s.revision++;
  if(id==='repair')s.shipHp=Math.min(s.shipMaxHp,s.shipHp+100);
  else if(id==='refuel'){game.run.reactor38.installed={id:`e41fuel:${s.token}:${s.revision}`,value:0,baseValue:0};game.run.reactor38.ready=true;game.broadcastRun?.(['reactor38']);}
  else if(id==='ammo')game.items.hostSpawn('shells',player(from).pos.clone().add(new THREE.Vector3(0,.8,0)),{});
  else{
   s.upgrades[id]=(s.upgrades[id]||0)+1;
   if(id==='hull'){s.shipMaxHp+=100;s.shipHp+=100;}
   else{const sockets={cargo:'R1',engine:'R2',medbay:'N1',bunk:'N3',lab:'N4',turret:'TURRET'},layout=sanitize(game.run.sy),sock=sockets[id];layout.m[sock]={id,t:Math.min(3,(layout.m[sock]?.t||0)+1)};game.run.sy=sanitize(layout);game.profile.shipyard=game.run.sy;game.run.fleet13.owned.courier=game.run.sy;if(id==='turret')s.turretOwner=from;}
  }
  changed();return true;
 }
 const request=(op,id)=>{if(!active())return;const o=state().players[game.selfId]?.offer;game.net.request('e41req',{op,id,token:state().token,revision:op==='buy'?state().revision:o?.revision,nonce:o?.nonce});};
 function stats(base){const p=state()?.players?.[game.selfId]?.perks||{},s={...base};s.maxHp=base.maxHp+15*(p.health||0);s.meleeMul=base.meleeMul*(1+.12*(p.damage||0));s.rangedMul=base.rangedMul*(1+.12*(p.damage||0));s.speedMul=base.speedMul*(1+.05*(p.speed||0));s.armor=Math.min(.6,(base.armor||0)+.05*(p.armor||0));return s;}
 function tickPulse(dt){
  if(game.run.phase!=='moon'||state().stage==='over')return;
  for(const p of game.aiPlayers()){if(!connected(p.id)||p.dead||p.downed||game.downed?.isDowned?.(p.id))continue;const perks=state().players[p.id]?.perks||{},timer=(pulse.get(p.id)||0)-dt;if(timer>0){pulse.set(p.id,timer);continue;}pulse.set(p.id,Math.max(.9,2.4-.16*(perks.cadence||0)));
   const eye=eyeOf(p),range=7+(perks.range||0),targets=[...game.creatures.host.values()].filter(c=>waves.owns(c)&&!c.dead&&c.pos.distanceTo(p.pos)<=range).sort((a,b)=>a.pos.distanceToSquared(p.pos)-b.pos.distanceToSquared(p.pos));let n=0;
   for(const c of targets){const target=c.pos.clone().add(new THREE.Vector3(0,.6,0));if(!game.physics.lineOfSight(eye,target))continue;game.creatures.damage(c.id,18*(1+.12*(perks.damage||0)),p.id);game.net.broadcast('fx',{k:'snd',s:'scan_beep',p:target.toArray(),v:.2,r:3,m:18});if(++n>=1+(perks.cleave||0))break;}
  }
 }
 wrap('hostInit',orig=>function(data,slot){if(this.config?.mode!=='endless')return orig.call(this,data,slot);const layout=starterShip41(),ledger=newEndless41(this.net.code,hashString(this.net.code));const out=orig.call(this,{mode:'endless',endless41:ledger,credits:120,daysLeft:999,day:1,moon:'hamsi',sy:layout,fleet13:{v:1,docked:false,selected:'courier',owned:{courier:layout}}},0);this.run.mode='endless';this.config.mode='endless';grantStarter(this.selfId);return out;});
 wrap('hostSave',orig=>function(...args){if(active()||this.opts?.mode==='endless')return;return orig.apply(this,args);});
 wrap('requestLoadout',orig=>function(...args){if(active()){if(this.isHost)grantStarter(this.selfId);else this.net.request('e41kit',{});return;}return orig.apply(this,args);});
 wrap('hostOnPlayerJoin',orig=>function(id,...args){const result=orig.call(this,id,...args);if(active())grantStarter(id);return result;});
 wrap('hostFinishTakeoff',orig=>function(...args){
  const finishing=active()&&this.isHost&&this.run.phase==='takeoff';if(!finishing)return orig.apply(this,args);
  this.run.daysLeft=999;const ledger=state(),net=this.net,previous=net.msgHandlers.get('summary');
  // Native Session self-delivers to its single registered callback. Observe
  // the authoritative outcome before orbit revives crew, preserving that UI.
  const summary=(d,from)=>{if(from===this.selfId&&d?.allDead===true&&active()&&state()===ledger&&ledger.stage!=='over'){ledger.stage='over';ledger.revision++;changed();}if(previous)previous(d,from);else net.emit('msg:summary',d,from);};
  net.on_('summary',summary);let result;
  try{result=orig.apply(this,args);}finally{if(net.msgHandlers.get('summary')===summary){if(previous)net.on_('summary',previous);else net.msgHandlers.delete('summary');}}
  if(active()&&this.run.phase==='orbit'){this.run.daysLeft=999;if(ledger.stage!=='over'){ledger.stage='preparation';const routes=['hamsi','lufer',...(ledger.totalWaves>=4?['palamut']:[]),...(ledger.totalWaves>=8?['levrek','cipura']:[])].filter(id=>id!==this.run.moon);this.run.moon=new RNG(`${ledger.token}:${ledger.trip}:route`).pick(routes);this.env?.setSpace?.(this.planetColorFor?.(this.run.moon));this.broadcastRun?.(['moon']);}changed();}return result;
 });
 wrap('hostUpdate',orig=>function(dt){
  if(!active())return orig.call(this,dt);if(!this.isHost||!Number.isFinite(dt)||dt<=0||dt>.25)return;
  if(this.run.phase==='moon'&&state().stage!=='over'){this.hostData.moonT=(this.hostData.moonT||0)+dt;waves.tick(dt);tickPulse(dt);this.creatures.hostUpdate(dt);const ps=this.aiPlayers().filter(p=>connected(p.id));if(state().shipHp<=0||ps.length&&ps.every(p=>p.dead)){const shipLost=state().shipHp<=0;state().stage='over';state().revision++;changed();this.net.broadcast('sys',sysMsg(shipLost?'SHIP LOST — ENDLESS RUN ENDED':'CREW LOST — ENDLESS RUN ENDED',{},'bad'));}}
  this.hostThrowables?.(dt);this.hostData.e41sync=(this.hostData.e41sync||0)-dt;if(this.hostData.e41sync<=0){this.hostData.e41sync=.5;this.broadcastRun();}
 });
 wrap('tutorialHint',orig=>function(...a){if(active())return;return orig.apply(this,a);});
 if(game.progress)for(const name of ['addXp','addCoins']){const old=game.progress[name];if(typeof old!=='function')continue;game.progress[name]=(...a)=>active()?undefined:old.apply(game.progress,a);restores.push(()=>game.progress[name]=old);}
 if(game.inventory){const oldOpen=game.inventory.open;game.inventory.open=(...a)=>active()?api.openInventory():oldOpen?.apply(game.inventory,a);restores.push(()=>game.inventory.open=oldOpen);}
 if(game.objectives){const compute=game.objectives.compute;game.objectives.compute=function(...a){if(!active())return compute.apply(this,a);return[{kind:'main',first:true,done:false,text:t(state().stage==='over'?'ENDLESS — run ended':game.run.phase==='orbit'?(game.run.reactor38&&!game.run.reactor38.ready?'ENDLESS — install a recovered core in the engine room, or buy a reactor charge at the ship console':'ENDLESS — upgrade the ship, then land at the cockpit lever'):'ENDLESS — explore, survive and extract cargo. Return to the ship console to sell.')}];};restores.push(()=>game.objectives.compute=compute);}
 listen('registerHandlers',(H,g)=>{if(g!==game)return;
  H('e41kit',(_,from)=>grantStarter(from));
  H('e41req',(d,from)=>{if(!active()||!game.isHost||!player(from)||player(from).dead||player(from).downed||game.downed?.isDowned?.(from)||!d||d.token!==state().token)return;
   if(d.op==='buy'){if(d.revision!==state().revision)return;buy(d.id,from);}
   else if(resolveOffer41(state(),from,d,d.op))changed();
  });
  for(const command of ['loadout','syact','f13act']){const old=game.net.handlers.get(command);if(old)H(command,(d,from)=>{if(active()){if(command==='loadout')grantStarter(from);return;}old(d,from);});}
 });
 listen('phase',(ph,g)=>{if(g!==game||!active())return;if(ph==='moon'&&game.isHost){const s=state();s.elapsed=0;s.wave=0;s.waveWarning=null;s.trip++;s.stage='field';pulse.clear();changed();}if(ph==='orbit'&&state().stage!=='over')state().stage='preparation';});
 listen('interactables',(list,g)=>{if(g!==game||!active())return;const q=point();if(!q)return;const terminal=list.find(i=>i.pos===q||i.pos?.distanceTo?.(q)<.1);if(terminal){terminal.label=t('ENDLESS — ship, robots & cargo');terminal.action=()=>api.openPreparation();}else list.push({pos:q,r:.7,reach:2.7,label:t('ENDLESS — ship, robots & cargo'),action:()=>api.openPreparation()});});
 listen('update',(dt,g)=>{if(g!==game||!active())return;if(game.isHost)for(const p of game.aiPlayers())if(connected(p.id)&&!p.dead)grantStarter(p.id);robots.tick(dt);if(presentation&&!ui&&typeof document!=='undefined')ui=createEndless41UI(game);ui?.update?.();const o=state().players[game.selfId]?.offer;if(o&&o.nonce!==lastOffer&&!game.ui.panelOpen&&(insideShip(game.player.pos)||state().elapsed<state().grace)){if(ui?.openDraft?.())lastOffer=o.nonce;}if(!o)lastOffer='';});
 const waves=installEndless41Waves(game),robots=installEndless41Robots(game);
 const api={active,status(){const s=state(),p=s?.players[game.selfId];return s?{...structuredClone(s),grace:Math.max(0,s.grace-s.elapsed),canShop:insideShip(game.player.pos)&&s.stage!=='over'&&['orbit','moon','company'].includes(game.run.phase),credits:game.run.credits,level:p?.level||1,xp:p?.xp||0,nextXp:xpNeed41(p?.level||1)}:null;},build,offer:()=>structuredClone(state()?.players[game.selfId]?.offer||null),catalog,choose:id=>request('choose',id),reroll:()=>request('reroll'),skip:()=>request('skip'),ban:id=>request('ban',id),buy:id=>request('buy',id),awardXp,grantStarter,canPrepare,stationPoint:point,stats,ownsCreature:c=>waves.owns(c),owns:c=>waves.owns(c),spawnOptions:(...a)=>waves.spawnOptions(...a),afterSpawn:(...a)=>waves.afterSpawn(...a),onKill:(...a)=>waves.onKill(...a),creatureTick:(...a)=>waves.creatureTick(...a),canMove:(...a)=>waves.canMove(...a),onState(){if(active())game.refreshStats?.();},openDraft(){return ui?.openDraft?.();},openPreparation(){return ui?.openPreparation?.();},openInventory(){return ui?.openInventory?.();},dispose(){if(disposed)return;disposed=true;for(const stop of off)stop();for(const restore of restores.reverse())restore();robots.dispose();waves.dispose();ui?.dispose?.();pulse.clear();}};
 return api;
}
