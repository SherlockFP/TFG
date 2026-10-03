import {RNG} from '../core/rng.js';
import {ensureMetaProfile} from './profile.js';
import {defaultProfile} from '../core/save.js';
import {sanitize} from './shipyard_core.js';

export const PERKS41={
 damage:{name:'Overclocked barrel',description:'Weapon and pulse damage',branch:'Striker',unit:'%',step:12,max:8},
 cadence:{name:'Pulse capacitor',description:'Automatic pulse cooldown',branch:'Striker',unit:'s',step:-.16,max:8,base:2.4},
 cleave:{name:'Split relay',description:'Pulse targets per discharge',branch:'Striker',unit:'',step:1,max:4,base:1},
 range:{name:'Long antenna',description:'Pulse acquisition range',branch:'Striker',unit:'m',step:1,max:5,base:7},
 health:{name:'Reinforced suit',description:'Maximum health',branch:'Engineer',unit:' HP',step:15,max:6,base:100},
 armor:{name:'Impact liner',description:'Incoming damage reduction',branch:'Engineer',unit:'%',step:5,max:6},
 repair:{name:'Maintenance manual',description:'Ship repair cost reduction',branch:'Engineer',unit:'%',step:8,max:5},
 guardian:{name:'Guardian firmware',description:'Robot attack damage',branch:'Engineer',unit:'%',step:15,max:6},
 speed:{name:'Light boots',description:'Movement speed',branch:'Salvager',unit:'%',step:5,max:6},
 haul:{name:'Hauler firmware',description:'Robot transport speed',branch:'Salvager',unit:'%',step:12,max:6},
 salvage:{name:'Cargo appraisal',description:'Extracted cargo sale bonus',branch:'Salvager',unit:'%',step:5,max:6},
 learning:{name:'Archive reader',description:'Combat XP gain',branch:'Salvager',unit:'%',step:8,max:5},
};
export const xpNeed41=level=>30+Math.max(0,level-1)*15;
export function starterShip41(){return sanitize({name:'RELAY-07',theme:'steel',paint:{c1:'bone',c2:'slate',pat:'hazard'},m:{R1:{id:'cargo',t:1},R2:{id:'engine',t:1},N1:{id:'medbay',t:1},N2:{id:'workshop',t:1}}});}
export function newEndless41(token,seed){return{v:41,token:String(token),seed,revision:0,stage:'preparation',elapsed:0,grace:90,wave:0,kills:0,shipHp:300,shipMaxHp:300,players:{},robots:[],upgrades:{cargo:1,engine:1,medbay:1},nextRobot:1,trip:0};}
export function resetEndlessProfile41(p,{preserveExtensions=false}={}){const identity=Object.fromEntries(['id','name','suit','hat','avatar','cosmetics'].filter(k=>p[k]!==undefined).map(k=>[k,structuredClone(p[k])]));if(!preserveExtensions)for(const k of Object.keys(p))delete p[k];else for(const k of ['rpg','prestige','mastery'])delete p[k];Object.assign(p,defaultProfile(),identity,{_noSave:true,coins:0,onboard:{v:1,s:'skip',why:'endless',f:{}},shipyard:starterShip41()});ensureMetaProfile(p);return p;}
export function sessionProfile41(p,opts){if(opts.host&&opts.mode!=='endless')return p;const copy=structuredClone(p);copy._noSave=true;return opts.mode==='endless'?resetEndlessProfile41(copy):copy;}
export function admitPlayer41(s,id,profileId){return s.players[id]||(s.players[id]={profileId:String(profileId||id),level:1,xp:0,perks:{},rerolls:2,bans:1,banned:[],pending:0,serial:0,offer:null,starter:false});}
function offer(s,p){
 if(p.offer||p.pending<=0)return;
 const rng=new RNG(`${s.seed}:${p.profileId}:${p.serial++}:${p.level}`),pool=Object.entries(PERKS41).filter(([id,d])=>!p.banned.includes(id)&&(p.perks[id]||0)<d.max);
 const choices=rng.shuffle(pool).slice(0,3).map(([id,d])=>{const rank=p.perks[id]||0;return{id,...d,rarity:rank>=4?'epic':rank>=2?'rare':'common',before:`${Math.round(((d.base||0)+rank*d.step)*100)/100}${d.unit}`,after:`${Math.round(((d.base||0)+(rank+1)*d.step)*100)/100}${d.unit}`};});
 if(!choices.length){p.pending=0;return;}
 p.offer={token:s.token,revision:s.revision,nonce:`${p.profileId}:${p.serial}`,level:p.level,choices};
}
export function gainXp41(s,id,amount){const p=s.players[id];if(!p||!Number.isFinite(amount)||amount<=0||s.stage==='over')return false;p.xp+=Math.min(500,Math.round(amount*(1+.08*(p.perks.learning||0))));while(p.level<60&&p.xp>=xpNeed41(p.level)){p.xp-=xpNeed41(p.level);p.level++;p.pending++;}s.revision++;offer(s,p);return true;}
export function resolveOffer41(s,id,d,op){
 const p=s.players[id],o=p?.offer;if(!o||!d||d.token!==s.token||d.nonce!==o.nonce||d.revision!==o.revision||s.stage==='over')return false;
 if(op==='reroll'){if(p.rerolls<=0)return false;p.rerolls--;p.offer=null;}
 else if(op==='choose'||op==='ban'){if(!o.choices.some(c=>c.id===d.id))return false;if(op==='ban'){if(p.bans<=0)return false;p.bans--;p.banned.push(d.id);}else p.perks[d.id]=(p.perks[d.id]||0)+1;p.offer=null;p.pending--;}
 else if(op==='skip'){p.offer=null;p.pending--;}else return false;
 s.revision++;offer(s,p);return true;
}
