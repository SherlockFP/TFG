// Deterministic bounded floor planning only. Native lifecycle/custody/damage owns execution.
import {hashString,RNG} from '../core/rng.js';
export const DESCENT21_LIMITS=Object.freeze({rooms:15,maxDepth:Number.MAX_SAFE_INTEGER-1,maxSize:1.35,maxTier:6,maxLoot:24,maxValueMul:1.8,maxAlive:6,maxPowerMul:1.8,maxHpMul:1.6,maxDamageMul:1.3,maxSpeedMul:1.1,speedCap:6.8,damageCap:40});
export const DESCENT21_THEMES=Object.freeze(['factory','mansion','mineshaft','serverfarm','hospital','hotel','darkweb','threadarchive','bufferfoundry','echoregistry','embercache']);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function descentDepth(value){const n=Number(value);return Number.isFinite(n)?clamp(Math.floor(n),0,DESCENT21_LIMITS.maxDepth):0;}
// A small generated map must never require nonexistent rooms. Empty facilities cannot discover a lift.
export function discoveryThreshold(availableOrdinaryRooms){const n=Number(availableOrdinaryRooms);return Number.isFinite(n)?clamp(Math.floor(n),0,15):0;}
export function floorSpec(moon={},baseSeed=1,depth=0){
 const d=descentDepth(depth),progress=Math.log2(d+1),seed=hashString(`descent21:${String(moon.id||'facility')}:${String(baseSeed)}:${d}`),rng=new RNG(seed);
 const baseTheme=DESCENT21_THEMES.includes(moon.interior)?moon.interior:'factory';
 const available=DESCENT21_THEMES.slice(0,Math.min(DESCENT21_THEMES.length,3+Math.floor(d/2)));
 if(!available.includes(baseTheme))available.push(baseTheme);
 const theme=d<2?baseTheme:available[rng.int(0,available.length-1)];
 const tier=clamp(Math.floor(Number(moon.tier)||1)+Math.floor(progress/2),1,6);
 const rules=d===0?['quiet']:d<3?['archive','quiet']:d<6?['archive','listening','quiet']:['archive','listening','inspection','heavy'];
 const rule=rules[rng.int(0,rules.length-1)];
 const low=clamp(Math.floor(Number(moon.scrapCount?.[0])||10),6,18),high=clamp(Math.floor(Number(moon.scrapCount?.[1])||14),low,20),bonus=Math.floor(progress*1.5);
 const newIds=d<3?[]:d<6?['c20_pixel']:rule==='heavy'?['c20_brute']:rule==='inspection'?['c13_checksum','c20_pixel']:['c20_pixel','c13_printer'];
 return {depth:d,floorNumber:d+1,seed,theme,tier,rule,
  size:+clamp((Number(moon.size)||1)+progress*.045,.75,1.35).toFixed(3),discoveryRooms:15,
  loot:{countMin:Math.min(24,low+bonus),countMax:Math.min(24,high+bonus),valueMul:+Math.min(1.8,1+progress*.08).toFixed(3)},
  threat:{powerMul:+Math.min(1.8,.6+progress*.22).toFixed(3),hpMul:+Math.min(1.6,.9+progress*.06).toFixed(3),damageMul:+Math.min(1.3,.85+progress*.045).toFixed(3),speedMul:+Math.min(1.1,.9+progress*.025).toFixed(3),maxAlive:Math.min(6,2+Math.floor(d/3)),speedCap:6.8,damageCap:40,newRuleSlots:d<3?0:d<6?1:2,newIds,minQuota:0},
  // Geometry/content hints, not additional mandatory objectives or a reward ledger.
  pattern:{lootSpread:rule==='archive'?'side-rooms':'ordinary-rooms',noiseLesson:rule==='listening',heavyProps:rule==='heavy',inspection:rule==='inspection'}
 };
}
