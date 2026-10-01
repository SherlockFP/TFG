import assert from 'node:assert/strict';
import {CARDS,MAX_LEVEL,MAX_RANK,newProgress,gainXp,nextOffer,chooseCard,makeOffer,effects,xpThreshold} from '../../src/game/deadletter24_core.js';
assert.equal(CARDS.length,10);assert.equal(MAX_RANK,5);assert(xpThreshold(4)>xpThreshold(3));
const args={seed:1234,level:20,nonce:5,floor:2,build:{impact:5}};
assert.deepEqual(makeOffer(args),makeOffer(args));assert(!makeOffer(args).choices.some(c=>c.id==='impact'));
assert.notDeepEqual(makeOffer(args),makeOffer({...args,nonce:6}));
for(const invalid of [-1,NaN,Infinity]){const s=newProgress();assert.equal(gainXp(s,invalid),0);assert.equal(s.level,1);}
for(let seed=0;seed<100;seed++){
 const s=newProgress({seed,floor:2});assert.equal(gainXp(s,1e12),MAX_LEVEL-1);assert.equal(s.pending,40);assert.equal(s.xp,0);
 for(let k=0;k<40;k++){
  const o=nextOffer(s);assert.equal(o.choices.length,3,`seed${seed} level${o.level}: guaranteed usable3`);assert.equal(new Set(o.choices.map(c=>c.id)).size,3);
  assert(o.choices.every(c=>c.rank<5));if(o.level<4)assert(o.choices.every(c=>c.tier==='common'));
  const pick={id:o.choices[k%3].id,nonce:o.nonce,level:o.level,floor:2};
  assert.equal(chooseCard(s,{...pick,floor:1}),false);assert.equal(chooseCard(s,{...pick,id:'foreign'}),false);assert.equal(chooseCard(s,{...pick,nonce:0}),false);
  assert.equal(chooseCard(s,pick),true);assert.equal(chooseCard(s,pick),false,'one nonce cannot spend twice');
 }
 assert.equal(s.pending,0);assert.equal(nextOffer(s),null);assert.equal(gainXp(s,999999),0);assert(Object.values(s.build).every(r=>r<=5));
}
const max=Object.fromEntries(CARDS.map(c=>[c.id,99]));assert.deepEqual(effects(max),{damage:1.6,speed:1.2,crit:.17500000000000002,pierce:5,return:5,cooldown:.775,range:1.4,reduction:.2,health:40,critDamage:2});
const boundary=newProgress();gainXp(boundary,xpThreshold(1)-1);assert.equal(boundary.level,1);gainXp(boundary,1);assert.equal(boundary.level,2);
const old=nextOffer(boundary);boundary.floor=1;assert.equal(chooseCard(boundary,{id:old.choices[0].id,nonce:old.nonce,level:old.level,floor:0}),false);
console.log('deadletter24 core:100 seeded40-draft campaigns, usable3, rank/tier limits, XP overflow and replay/floor guards PASS');

const deep=newProgress({floor:9000000});assert.equal(deep.floor,9000000);gainXp(deep,36);const deepOffer=nextOffer(deep);assert.equal(deepOffer.floor,9000000);assert.equal(chooseCard(deep,{id:deepOffer.choices[0].id,nonce:deepOffer.nonce,level:deepOffer.level,floor:8999999}),false);
