import {descentToken} from './descent21_state.js';
import {savedFloorSpec,LIMINAL26_THEMES} from './descent21_core.js';
import {MOONS} from './moons.js';
import {CREATURES,canSpawnMore} from './creatures.js';
import {NEW_IDS,poolFor,poolMul} from './threatpool.js';
import {RNG,hashString} from '../core/rng.js';
const AMBIENT=new Set(['scuttler','yoinker','crawler','spider','listener']);
const FAMILY=new Set(['c20_pixel','c20_brute']);
const C32_FAMILY=new Set(['c32_dormant','c32_ram']);
const BR=new Set(['br_smiler','br_hound','br_partygoer','br_moth']);
const ARRIVAL_QUIET=25;
export function installDescent21Threats(game){
 let serial=0,lastKey='',disposed=false,waveCeiling=null,arrivalFac=null,arrivalAt=0;const nativeBudget=game.indoorBudget?.bind(game);const restores=[];
 const spec=()=>{const d=game.run?.descent21,F=game.world?.facility;if(disposed||game.run?.phase!=='moon'||!F||!d||d.token!==descentToken(game.run)||!(d.depth>0))return null;
  const planned=game.descent21?.spec?.(game.run)||savedFloorSpec(MOONS[d.moon||game.run.moon]||{},d.baseSeed??d.seed??game.run.seed,d,{creatures32:game.config?.creatures32===true});
  const theme=F.layout?.theme||d.currentChoice?.theme||planned.theme,liminal=LIMINAL26_THEMES.includes(theme);
  return {...planned,theme,seed:F.layout?.seed??d.currentChoice?.seed??planned.seed,liminal};
 };
 const quiet=s=>{if(!s?.liminal)return false;const F=game.world?.facility;if(arrivalFac!==F){arrivalFac=F;arrivalAt=Number(game.time)||0;}return (Number(game.time)||0)-arrivalAt<ARRIVAL_QUIET;};
 const live=()=>[...game.creatures?.host?.values?.()||[]].filter(c=>!c.dead&&c.zone==='in'&&!c.def?.boss&&!c.def?.hazard);
 function allow(type,s=spec()){
  if(!s)return true;const def=CREATURES[type];if(!def||def.boss||def.hazard||def.zone==='out')return true;
  if(s.liminal&&(quiet(s)||!residents(s).includes(type)))return false;
  const living=live();if(living.length>=s.threat.maxAlive||!canSpawnMore(type,game.creatures?.host))return false;
  if(s.theme==='backrooms'&&s.depth<11&&BR.has(type)&&living.some(c=>BR.has(c.type)))return false;
  if(FAMILY.has(type)&&living.some(c=>FAMILY.has(c.type)))return false;
  if(C32_FAMILY.has(type)&&living.some(c=>C32_FAMILY.has(c.type)))return false;
  if(NEW_IDS.has(type)&&living.filter(c=>NEW_IDS.has(c.type)).length>=s.threat.newRuleSlots)return false;
  const budget=Math.max(0,Number(nativeBudget?.()??MOONS[game.run.moon]?.power??4))*s.threat.powerMul;
  return living.reduce((sum,c)=>sum+(c.def?.power||0),0)+(def.power||0)<=budget+.001;
 }
 const owned=(type,opts={})=>!!opts.scripted||!!opts.data||Object.getOwnPropertyDescriptor(CREATURES[type]||{},'noSpawn')?.value===true;
 function allowSpawn(type,opts={}){if(!spec()||opts.id||owned(type,opts)||CREATURES[type]?.boss||CREATURES[type]?.hazard||opts.zone==='out'||CREATURES[type]?.zone==='out')return true;return allow(type);}
 function limit(c,opts={}){const s=spec();if(!s||c.zone!=='in'||c.def.boss||c.def.hazard||(!opts.id&&(opts.scripted||(opts.data&&c.def.custom)||Object.getOwnPropertyDescriptor(CREATURES[c.type]||{},'noSpawn')?.value===true)))return c;
  const restored=!!opts.id;
  c.def={...c.def,walk:Math.min(s.threat.speedCap,Math.max(0,c.def.walk||0)*(restored?1:s.threat.speedMul)),run:Math.min(s.threat.speedCap,Math.max(0,c.def.run||0)*(restored?1:s.threat.speedMul))};
  if(c.maxHp){c.maxHp=Math.min(420,Math.max(1,Math.round(c.maxHp*(restored?1:s.threat.hpMul))));c.hp=Math.min(c.maxHp,Math.max(0,Math.round(c.hp*(restored?1:s.threat.hpMul))));}
  c.dmg=Math.min(s.threat.damageCap,Math.max(0,Math.round(c.dmg*(restored?1:s.threat.damageMul))));c.data.descent21={depth:s.depth,seed:s.seed};return c;
 }
 const limited=c=>!disposed&&!!c?.data?.descent21&&c.zone==='in'&&!c.def.boss&&!c.def.hazard;
 function residents(s=spec()){if(!s)return[];
  const ids=s.theme==='backrooms'?['yoinker','br_smiler','br_hound',...(s.depth>=11?['br_partygoer','br_moth']:[])]:s.theme==='nullreception'?['yoinker','crawler','listener']:[...AMBIENT].filter(id=>id!=='scuttler').concat(s.threat.newIds);
  return ids.map(id=>C32_FAMILY.has(id)?game.creatures32?.choice?.():id).filter(id=>id&&CREATURES[id]&&!CREATURES[id].noSpawn);
 }
 function weights(s=spec()){if(!s)return[];const pool=poolFor(game.run,MOONS[game.run.moon],{creatures32:game.config?.creatures32===true});return residents(s).map(id=>{let base=NEW_IDS.has(id)?.12:1;if(s.rule==='listening'&&id==='listener')base*=3;if(s.rule==='inspection'&&id==='c20_pixel')base*=3;if(s.rule==='heavy'&&id==='c20_brute')base*=3;return{id,w:base*poolMul(id,pool)};});}
 function wrap(obj,key,make){if(typeof obj?.[key]!=='function')return;const previous=obj[key],next=make(previous);obj[key]=next;restores.push(()=>{if(obj[key]===next)obj[key]=previous;});}
 wrap(game,'indoorBudget',old=>function(){const base=old.call(this),s=spec();return s?base*s.threat.powerMul:base;});
 wrap(game.creatures,'speedMul',old=>function(c,speed){const value=old.call(this,c,speed);return limited(c)?Math.min(6.8,value):value;});
 wrap(game.balance,'hitDamage',old=>function(dmg,c){const value=old.call(this,dmg,c);return limited(c)?Math.min(40,value):value;});
 wrap(game,'hostSpawnCreatureIndoor',old=>function(type){const s=spec(),original=CREATURES[type];if(!s||original?.boss||original?.hazard||original?.zone==='out')return old.call(this,type);
  const spawn=chosen=>{const before=new Set(game.creatures.host.keys()),result=old.call(this,chosen);if(!result)return false;let cost=0,added=0;for(const c of game.creatures.host.values())if(!before.has(c.id)&&c.zone==='in'){cost+=c.def.power||0;added++;}if(!added)return false;if(game.hostData)game.hostData.powerUsed+=cost-(original?.power||0);return result;};
  // The surface moon table cannot inject its jester/mimic/headline pool into a
  // quiet liminal destination. Every ordinary request maps to its resident pool.
  if(!s.liminal&&!AMBIENT.has(type)){if(!allow(type,s))return false;return spawn(type);}
  const key=`${s.seed}:${s.depth}`;if(key!==lastKey){lastKey=key;serial=0;}
  const rng=new RNG(hashString(`${key}:${serial++}`)),candidates=weights(s).filter(e=>allow(e.id,s)&&(waveCeiling===null||(game.hostData?.powerUsed||0)+(CREATURES[e.id].power||0)<=waveCeiling+.5));
  if(!candidates.length)return false;
  const choices=candidates;let total=choices.reduce((n,e)=>n+e.w,0),pick=rng.next()*total,chosen=choices[0].id;
  for(const e of choices){pick-=e.w;if(pick<=0){chosen=e.id;break;}}
  return spawn(chosen);
 });
 wrap(game,'hostSpawnWave',old=>function(fraction){if(!spec())return old.call(this,fraction);const previous=waveCeiling,effective=1;waveCeiling=game.indoorBudget?.()||0;try{return old.call(this,effective);}finally{waveCeiling=previous;}});
 const on=(name,fn)=>{const off=game.mods?.on?.(name,fn);if(off)restores.push(off);};
 const resetArrival=()=>{arrivalFac=null;arrivalAt=0;};
 on('facilityWillChange',resetArrival);
 on('facilityChanged',()=>{const s=spec();if(s?.liminal)quiet(s);else resetArrival();});
 on('mapLoaded',()=>{const s=spec();if(s?.liminal)quiet(s);});
 on('hostMigrated',resetArrival);on('phase',ph=>{if(ph!=='moon')resetArrival();});
 return{spec,allow,allowSpawn,limit,residents,weights,quiet:()=>quiet(spec()),finalSpeed:(c,v)=>limited(c)?Math.min(6.8,v):v,finalDamage:(c,v)=>limited(c)?Math.min(40,v):v,dispose(){disposed=true;for(const restore of restores.reverse())restore();}};
}
