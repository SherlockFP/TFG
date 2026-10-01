// Actual Collection -> Achievements -> Progress callbacks: temporary discovery isolation.
import assert from 'node:assert/strict';
import './ship2_env.mjs';
import {readFile} from 'node:fs/promises';
import {installCollection} from '../../src/game/collection.js';
import {installAchievements} from '../../src/game/achievements.js';
import {ITEMS} from '../../src/game/items.js';
import {Progress} from '../../src/game/profile.js';
const url=new URL('../../src/game/collection.js',import.meta.url);
const source=(await readFile(url,'utf8')).replace(/from '([^']+)'/g,(_,p)=>`from '${new URL(p,url).href}'`);
// Same installed module, removing only the boundary to demonstrate the reported old failure.
const old=(await import('data:text/javascript;base64,'+Buffer.from(source.replace(/const temporary = \(\) =>[\s\S]*?;\n/,'const temporary = () => false;\n')).toString('base64'))).installCollection;
function fixture(install){
 const handlers=new Map(),profile={id:'me',coins:50,xp:0,level:1,bestiary:{},achievementsSeeded:true};
 const game={profile,selfId:'me',run:{phase:'deadletter',moon:'deadletter24'},world:{seed:1,facility:{dl24Token:'fixture-expedition',layout:{theme:'deadletter24'}}},player:{indoor:true,dead:false},ui:{toast(){},hud:new Proxy({},{get:()=>()=>{}})},mods:{on(k,f){const a=handlers.get(k)||[];a.push(f);handlers.set(k,a);return()=>{const i=a.indexOf(f);if(i>=0)a.splice(i,1);}}},onItemHeld(){}};
 game.progress=new Progress(game,profile);game.progress.save=()=>{};
 game.achievements=installAchievements(game);const priorUpdates=new Set(handlers.get('update')||[]);const col=install(game);
 const tick=dt=>{for(const f of handlers.get('update')||[])if(!priorUpdates.has(f))f(dt,game);};
 return{game,profile,col,tick,dispose(){col.dispose();game.achievements.dispose();clearTimeout(game.progress.saveT);}};
}
const before=fixture(old);before.tick(.1);before.game.world.facility.layout.theme='mutedswitch24';before.tick(.1);before.col.evaluate();assert.equal(before.profile.coins,200);assert.equal(before.profile.xp,0);assert.ok(before.profile.codex.claimed.int_2);before.dispose();
const f=fixture(installCollection),baseline=JSON.stringify(f.profile.codex);
f.game.onItemHeld({id:'temporary-scrap',type:'copper',def:ITEMS.copper,value:30},'me');
f.tick(.1);f.game.world.facility.layout.theme='mutedswitch24';f.tick(100);f.col.evaluate();assert.equal(JSON.stringify(f.profile.codex),baseline);assert.equal(f.profile.coins,50);
// Restore phase first while the old mode facility still exists: no delayed recording.
f.game.run.phase='company';f.tick(100);f.col.evaluate();assert.equal(JSON.stringify(f.profile.codex),baseline);
f.game.world.facility=null;f.game.onItemHeld({id:'temporary-gear',type:'dl24_cards',def:{kind:'scrap'},value:0},'me');assert.equal(JSON.stringify(f.profile.codex),baseline);f.game.world.facility={layout:{}};
// Normal campaign discovery resumes, with the original evaluation timer preserved.
f.game.run={phase:'moon',moon:'letterfield24'};f.game.world.facility.layout.theme='deadletter24';f.tick(.1);assert.ok(f.profile.codex.interiors.deadletter24);f.game.run.moon='switchfield24';f.game.world.facility.layout.theme='mutedswitch24';f.tick(.1);assert.equal(f.profile.coins,50);f.col.evaluate();assert.equal(f.profile.coins,200);assert.ok(f.profile.codex.claimed.int_2);assert.equal(f.profile.xp,0);f.dispose();
console.log('Collection native temporary discovery old +150 / guarded unchanged / campaign positive control PASS');
