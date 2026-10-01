import assert from 'node:assert/strict';
import {floorSpec,descentDepth,discoveryThreshold,DESCENT21_LIMITS as L,DESCENT21_THEMES} from '../../src/game/descent21_core.js';
import {descentRuleText} from '../../src/game/descent21_text.js';
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
console.log('descent21 core: deterministic650+deep floors, native damage/sprint caps, themes, discovery and translations pass');
