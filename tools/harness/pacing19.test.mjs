import assert from 'node:assert/strict';
import { LocalPlayer } from '../../src/entities/localplayer.js';
// Execute native movement until its downstream velocity integration. Only controller/render work is intercepted.
const stop=Symbol('movement after stamina');
function tick({city='field',sprint=true,delay=0,load=0,body=false,indoor=false,inShip=false,day=1}={}){
 const game={run:{phase:city==='company'?'company':'moon',quotaIndex:0,day},stats:{maxHp:100,maxStamina:100,staminaRegen:16,speedMul:1},
  world:city==='company'?{company:{}}:city==='hub'?{outdoor:{vendorSpace:{}}}:{outdoor:{}},fleet13:{docked:()=>city==='hub'},engine:{}};
 const p=Object.create(LocalPlayer.prototype);Object.assign(p,{game,stamina:50,staminaDelay:delay,stunT:0,slowT:0,speedBoost:0,yaw:0,pitch:0,crouch:false,downed:false,indoor,inShip,carryWeight:()=>load,carriesBody:()=>body,grounded:true});
 p.vel={get x(){return 0;},set x(v){throw stop;}};
 const input={consumeMouse:()=>({dx:0,dy:0}),isDown:k=>k==='forward'||k==='sprint'&&sprint};
 assert.throws(()=>p.update(.05,input),e=>e===stop);return p;
}
const field=tick(),hub=tick({city:'hub'}),company=tick({city:'company'});
assert.ok(Math.abs(field.stamina-49.1)<1e-9,'native unloaded field stamina unchanged');assert.equal(field.staminaDelay,1.1);
assert.ok(hub.stamina>field.stamina&&company.stamina>field.stamina,'actual safe city transit costs less stamina');
assert.equal(tick({city:'hub',indoor:true}).stamina,field.stamina,'indoor does not get city transit');
assert.equal(tick({city:'company',inShip:true}).stamina,field.stamina,'ship field-style stamina remains');
const weighted=tick({load:40}),cityWeighted=tick({city:'hub',load:40});assert.equal(weighted.weightMul,cityWeighted.weightMul,'carry slowdown remains');assert.ok(weighted.stamina<field.stamina,'field load drain remains');
assert.equal(tick({city:'company',body:true,sprint:false,delay:1}).stamina,tick({body:true,sprint:false,delay:1}).stamina,'body recovery is unchanged');
assert.equal(tick({sprint:false,delay:1}).stamina,50,'field recovery delay remains');
assert.ok(tick({city:'hub',sprint:false,delay:1}).stamina>50,'safe transit immediately recovers without forcing a stationary pause');
assert.equal(tick({city:'hub',inShip:true,sprint:false,delay:1}).stamina,50);
// Map discovery must be native and explicit, never an empty orbit or generic outdoor environment.
const noDock=tick({city:'empty',sprint:true});assert.equal(noDock.stamina,field.stamina);
console.log('pacing19: actual LocalPlayer update safe-city stamina / field, ship, indoor, heavy carry and delay protections pass');
