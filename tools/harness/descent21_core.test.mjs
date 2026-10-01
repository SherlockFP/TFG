import assert from 'node:assert/strict';
import {floorSpec,savedFloorSpec,descentDepth,discoveryThreshold,DESCENT21_LIMITS as L,DESCENT21_THEMES,LIMINAL26_THEMES} from '../../src/game/descent21_core.js';
import {descentRuleText,descentDestinationText} from '../../src/game/descent21_text.js';
import {chooseSafeFloor} from '../../src/game/descent21_state.js';
import {capHit,sectorScale} from '../../src/game/balance_core.js';
import {MOONS} from '../../src/game/moons.js';
import {LAB20_MOONS} from '../../src/game/lab20_moons.js';
const moons=[MOONS.hamsi,...LAB20_MOONS],seenThemes=new Set(),seenRules=new Set();
for(const moon of moons){let previous=null;const seeds=new Set();for(const depth of [...Array.from({length:650},(_,i)=>i),10000,1e9,1e12,Number.MAX_SAFE_INTEGER]){
 const s=floorSpec(moon,1235,depth);seenThemes.add(s.theme);seenRules.add(s.rule);assert.deepEqual(s,floorSpec(moon,1235,depth));assert(DESCENT21_THEMES.includes(s.theme));assert(!seeds.has(s.seed));seeds.add(s.seed);
 assert(s.size<=L.maxSize&&s.tier<=6);assert(s.loot.countMin<=s.loot.countMax&&s.loot.countMax<=24&&s.loot.valueMul<=1.8);
 assert(s.threat.maxAlive<=6&&s.threat.damageMul<=1.3&&s.threat.speedMul<=1.1&&s.threat.hpMul<=1.6&&s.threat.powerMul<=1.8);
 assert(s.threat.newIds.length<=s.threat.newRuleSlots);assert(!(s.threat.newIds.includes('c20_pixel')&&s.threat.newIds.includes('c20_brute')),'shared family stays mutually exclusive');
 for(const q of [0,2,4,20]){const native=sectorScale(q);const damage=Math.min(s.threat.damageCap,28*native.dmg*s.threat.damageMul);assert(capHit(damage,q)<=40,'depth does not bypass native hit caps');assert(Math.min(s.threat.speedCap,5.6*native.speed*s.threat.speedMul)<8.2,'bounded pursuit remains slower than normal sprint');}
 for(const lang of ['en','tr','ru'])assert(descentRuleText(s.rule,lang).length>20);
 const walk=v=>{if(typeof v==='number')assert(Number.isFinite(v));else if(v&&typeof v==='object')for(const x of Object.values(v))walk(x);};walk(s);
 if(previous){assert(s.loot.valueMul>=previous.loot.valueMul);assert(s.threat.damageMul>=previous.threat.damageMul);assert(s.threat.hpMul>=previous.threat.hpMul);}previous=s;
 }
 const first=floorSpec(moon,1235,0);assert.equal(first.theme,moon.interior);assert.equal(first.rule,'quiet');assert.equal(first.threat.maxAlive,2);assert.equal(first.threat.newRuleSlots,0);
}
for(const theme of DESCENT21_THEMES)assert(seenThemes.has(theme),'native theme is actually drawn in tested floor range');for(const rule of ['quiet','archive','listening','inspection','heavy'])assert(seenRules.has(rule));
for(const n of [0,1,7,15,100])assert.equal(discoveryThreshold(n),Math.min(n,15));
assert.equal(discoveryThreshold(-8),0);assert.equal(discoveryThreshold(Infinity),0);
assert.equal(descentDepth(-5),0);assert.equal(descentDepth(NaN),0);assert.equal(descentDepth(Infinity),0);assert.equal(descentDepth(1e30),L.maxDepth);
assert.notEqual(floorSpec(moons[0],1,3).seed,floorSpec(moons[0],2,3).seed);
// Beginner ordinary landings cannot roll consecutive or unannounced liminal
// floors. Dedicated liminal moons intentionally keep their first deep theme.
for(const seed of [1,17,42,77])for(let depth=1;depth<80;depth++){
 const s=floorSpec(MOONS.hamsi,seed,depth);
 assert.equal(s.liminal,depth>=3&&depth%4===3);
 if(s.liminal){assert.equal(s.theme,depth%8===3?'backrooms':'nullreception');assert.equal(s.threat.newIds.length,0);assert(s.threat.maxAlive<=4);assert(!floorSpec(MOONS.hamsi,seed,depth+1).liminal);}
 for(const lang of ['en','tr','ru']){assert(descentDestinationText(s,lang).includes(String(depth)));if(s.liminal)assert(descentRuleText(s.rule,lang).length>40);}
}
assert.equal(floorSpec({id:'br_level0',interior:'backrooms'},17,1).theme,'backrooms');
for(const depth of [3,7]){
 const old=floorSpec(MOONS.hamsi,17,depth,{legacy:true}),choice={seed:old.seed,theme:'factory',size:old.size};
 const kept=savedFloorSpec(MOONS.hamsi,17,{depth,currentChoice:choice});assert.equal(kept.theme,'factory');assert.equal(kept.seed,choice.seed);assert.equal(kept.liminal,false);assert(!['liminal','receipt'].includes(kept.rule));
 assert.deepEqual(savedFloorSpec(MOONS.hamsi,17,{depth}),old,'legacy run without stored choice reconstructs its previous map');
 assert.equal(savedFloorSpec(MOONS.hamsi,17,{depth,routeVersion:26}).liminal,true);
}
for(const depth of [3,7]){
 const attempts=[];const selected=chooseSafeFloor(MOONS.hamsi,17,depth,(_,choice)=>{attempts.push(choice);return attempts.length===2?{safe:true}:null;});
 assert(selected);assert(attempts.every(c=>c.theme===selected.choice.theme&&LIMINAL26_THEMES.includes(c.theme)),'native retry retains announced liminal destination');
 assert.notEqual(attempts[0].seed,attempts[1].seed);
 let probes=0;assert.equal(chooseSafeFloor(MOONS.hamsi,17,depth,()=>{probes++;return null;}),null);assert.equal(probes,3,'unsafe liminal transit cancels after bounded retries');
}
console.log('descent21 core: deterministic650+deep floors, native damage/sprint caps, themes, discovery and translations pass');
