// Temporary expedition progression. No profile, wallet or main-game XP writes.
import {RNG,hashString} from '../core/rng.js';
export const MAX_RANK=5,MAX_LEVEL=41;
export const TIERS=['common','rare','epic','legendary'];
export const CARDS=Object.freeze([
 {id:'impact',key:'damage',step:.12},{id:'stride',key:'speed',step:.04},
 {id:'critical',key:'crit',step:.035},{id:'pierce',key:'pierce',step:1},
 {id:'return',key:'return',step:1},{id:'tempo',key:'cooldown',step:.045},
 {id:'reach',key:'range',step:.08},{id:'guard',key:'reduction',step:.04},
 {id:'vital',key:'health',step:8},{id:'focus',key:'critDamage',step:.1},
].map(c=>Object.freeze({...c,tier:({critical:'rare',guard:'rare',reach:'rare',pierce:'epic',focus:'epic',return:'legendary'})[c.id]||'common'})));
const integer=(v,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,Math.floor(v))):min;
export const rankOf=(build,id)=>integer(build?.[id],0,MAX_RANK);
export const xpThreshold=level=>24+integer(level,1,MAX_LEVEL)*12;
export function effects(build={}){
 const r=id=>rankOf(build,id);
 return {damage:1+r('impact')*.12,speed:1+r('stride')*.04,crit:r('critical')*.035,
  pierce:r('pierce'),return:r('return'),cooldown:1-r('tempo')*.045,range:1+r('reach')*.08,
  reduction:r('guard')*.04,health:r('vital')*8,critDamage:1.5+r('focus')*.1};
}
export function newProgress({seed=1,floor=0}={}){return {seed:typeof seed==='string'?hashString(seed):seed>>>0,floor:integer(floor,0,Number.MAX_SAFE_INTEGER-1),level:1,xp:0,pending:0,build:{},offer:null,nonce:0};}
export function gainXp(state,amount){
 if(!state||!Number.isFinite(amount)||amount<=0)return 0;
 const old=state.level;state.xp=Math.min(1e7,Math.max(0,state.xp||0)+Math.min(amount,1e7));
 while(state.level<MAX_LEVEL&&state.xp>=xpThreshold(state.level)){state.xp-=xpThreshold(state.level);state.level++;state.pending=Math.min(MAX_LEVEL-1,(state.pending||0)+1);}
 if(state.level===MAX_LEVEL)state.xp=0;return state.level-old;
}
const unlockLevel={common:1,rare:4,epic:9,legendary:16};
export function makeOffer({seed=1,level=2,build={},nonce=1,floor=0}={}){
 const usable=CARDS.filter(c=>rankOf(build,c.id)<MAX_RANK&&level>=unlockLevel[c.tier]),rng=new RNG(hashString(`${seed}:${level}:${nonce}:${floor}`));
 const weights={common:45,rare:33,epic:17,legendary:5},choices=[];
 while(choices.length<3&&usable.length){const total=usable.reduce((n,c)=>n+weights[c.tier],0);let n=rng.float()*total,index=usable.length-1;
  for(let i=0;i<usable.length;i++){n-=weights[usable[i].tier];if(n<0){index=i;break;}}
  const [c]=usable.splice(index,1);choices.push({id:c.id,tier:c.tier,rank:rankOf(build,c.id),nextRank:rankOf(build,c.id)+1});
 }
 return {nonce,level,floor,choices};
}
export function nextOffer(state){
 if(!state||state.pending<=0)return null;if(state.offer)return state.offer;
 const level=state.level-state.pending+1;state.nonce=integer(state.nonce,0,Number.MAX_SAFE_INTEGER-1)+1;
 const offer=makeOffer({seed:state.seed,level,build:state.build,nonce:state.nonce,floor:state.floor});
 if(!offer.choices.length){state.pending=0;return null;}state.offer=offer;return offer;
}
export function chooseCard(state,choice){
 const offer=state?.offer;if(!offer||state.pending<=0||!choice||choice.nonce!==offer.nonce||choice.level!==offer.level||choice.floor!==state.floor||offer.floor!==state.floor)return false;
 const card=offer.choices.find(c=>c.id===choice.id);if(!card||rankOf(state.build,card.id)>=MAX_RANK||card.rank!==rankOf(state.build,card.id))return false;
 state.build[card.id]=rankOf(state.build,card.id)+1;state.pending--;state.offer=null;return true;
}
