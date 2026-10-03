// Ordinary threat admission: native host actors, one existing landing clock, no culling.
import {MOONS} from './moons.js';
import {CREATURES} from './creatures.js';
import {roaming} from './firstdepth21_core.js';
import {SIEGE_TYPES} from './crdirector_core.js';
import {descentDepth} from './descent21_core.js';
import {SQUAD_TYPES} from './creatures_wave1.js';

const SPECIAL_MOON=['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost','deadletter'];
const ENCOUNTER_TYPES=new Set(SIEGE_TYPES);
export function installDensity35(game){
 let disposed=false,suspended=false;
 const pending=new Set(),off=[];
 const clock=()=>Math.max(0,Number(game.hostData?.moonT)||0);
 function ordinary(){
  const r=game.run,m=MOONS[r?.moon];
  return !disposed&&game.isHost&&r&&['landing','moon'].includes(r.phase)&&m&&!SPECIAL_MOON.some(k=>m[k])&&!!game.world?.facility&&!game.deadletter24?.active?.()&&!game.missions14?.active?.()&&!game.escape14?.active?.()&&!game.cycle?.inst?.cur;
 }
 function owned(type,opts){
  if(ENCOUNTER_TYPES.has(type))return true;
  const squad=opts?.data?.squad;
  if(SQUAD_TYPES.has(type)&&squad&&Number.isInteger(squad.id)&&squad.id>0&&squad.members instanceof Set&&squad.faction===opts.data.faction)return true;
  if(opts?.data?.mirror===1&&game.mirror?.S?.hostM instanceof Map&&game.mirror.S.hostM.size>0)return true;
  // Horde's explicit wave members retain their authored encounter, ambient zombies do not.
  if(type==='zombot'&&opts?.data?.wave!=null)return true;
  const owner=game.creatures?.host?.get(opts?.data?.owner);
  return !!owner&&!owner.dead&&!!owner.def?.boss;
 }
 const counted=(type,def,opts)=>roaming(def)&&!owned(type,opts);
 function restored(type,opts){
  if(!opts.id||game.creatures.host.has(opts.id))return false;
  const view=game.creatures.views.get(opts.id);
  return !!view&&view.type===type&&view.state!=='dead'&&!(view.maxHp&&view.hp<=0);
 }
 function state(commit=true){
  const r=game.run,t=clock(),depth=descentDepth(r.descent21?.depth),token=`${r.moon}:${r.seed}:${r.day}`;
  let s=r.density35;
  if(!s||s.v!==35||s.token!==token)s={v:35,token,depth,arrival:t,last:null};
  else if(s.depth!==depth)s={...s,depth,arrival:t};
  // A migration without hmx can reset moonT. Keep bounded quiet time instead of
  // comparing the new clock with a timestamp hundreds of seconds in the future.
  if(s.arrival>t||s.last>t)s={...s,arrival:Math.min(t,s.arrival),last:Number.isFinite(s.last)?Math.min(t,s.last):null};
  if(commit)r.density35=s;
  return s;
 }
 function candidate(type,opts={},commit=true){
  const def=CREATURES[type];
  if(!ordinary()||!counted(type,def,opts)||restored(type,opts))return null;
  if(suspended)return false;
  const s=state(commit),t=clock(),q=game.run.quotaIndex|0,first=s.depth===0&&(game.run.day|0)<=1&&q<=0&&!game.run.quick;
  let cap=first?1:q<2?2:q<4?3:4,grace=first?120:60,elapsed=t;
  if(s.depth>0){
   const spec=game.descentThreat21?.spec?.()||game.descent21?.spec?.(game.run);
   if(Number.isFinite(spec?.threat?.maxAlive))cap=Math.min(cap,spec.threat.maxAlive);
   grace=spec?.liminal?90:60;elapsed=Math.max(0,t-(Number(s.arrival)||0));
  }
  if(elapsed<grace||pending.size||Number.isFinite(s.last)&&t-Math.min(t,s.last)<45)return false;
  let living=0;
  for(const c of game.creatures.host.values())if(!c.dead&&counted(c.type,c.def,c)&&++living>=cap)return false;
  return{state:s,time:t};
 }
 function reserve(type,pos,opts={}){
  const ticket=candidate(type,opts);if(ticket)pending.add(ticket);return ticket;
 }
 function finish(ticket,creature){
  if(!ticket||!pending.delete(ticket))return;
  // Returned native identity is proof of creation even if self-delivery removed it.
  if(!disposed&&creature&&game.run?.density35===ticket.state){ticket.state.last=ticket.time;game.broadcastRun?.(['density35']);}
 }
 const listen=(event,fn)=>{const stop=game.mods?.on?.(event,fn);if(stop)off.push(stop);};
 const arrive=(world,g)=>{if(g!==game)return;suspended=false;if(ordinary()){state();game.broadcastRun?.(['density35']);}};
 listen('facilityWillChange',(world,g)=>{if(g===game){suspended=true;pending.clear();}});
 listen('facilityChanged',arrive);listen('mapLoaded',arrive);
 listen('hostMigrated',g=>{if(g===game&&ordinary()){state();game.broadcastRun?.(['density35']);}});
 listen('phase',(phase,g)=>{if(g===game&&!['moon','landing'].includes(phase)){pending.clear();suspended=false;}});
 return{reserve,finish,controls:(type,opts={})=>ordinary()&&counted(type,CREATURES[type],opts),canRequest:(type,opts={})=>candidate(type,opts,false)!==false,dispose(){if(disposed)return;disposed=true;pending.clear();for(const stop of off)stop();}};
}
