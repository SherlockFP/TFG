import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ARSENAL13_DEFS,BATON_CLASS,arsenalLock} from '../../src/game/arsenal13_core.js';
import {ARSENAL13_MODELS} from '../../src/game/arsenal13_models.js';
const rivet=ARSENAL13_DEFS.find(d=>d.id==='a13_rivet'),baton=ARSENAL13_DEFS.find(d=>d.id==='a13_baton');
const sustain=w=>w.ammo*w.dmg/(w.ammo*w.cd+w.reload);
assert.ok(sustain(rivet)<sustain({ammo:8,dmg:34,cd:.6,reload:2}), 'short riveter must not outclass existing rifle sustain');
assert.ok(rivet.reach<25&&rivet.weight>=10&&rivet.reload>=2,'industrial gun tradeoffs remain meaningful');
assert.ok(baton.dmg/baton.cd<14/.6,'rescue baton below starter pipe damage output');
assert.ok(BATON_CLASS.H.t*baton.cd>baton.heavyStun,'heavy stagger cannot last through whole recovery');
for(const d of ARSENAL13_DEFS){assert.equal(arsenalLock(d.id,1),true);assert.equal(arsenalLock(d.id,2),false);assert.ok(d.price>=300);const model=ARSENAL13_MODELS[d.id]();const bounds=new THREE.Box3().setFromObject(model);assert.equal(bounds.isEmpty(),false);assert.ok(bounds.getSize(new THREE.Vector3()).length()<2,'models fit first-person presentation');}
console.log('arsenal13 tradeoff, unlock, stagger recovery and model checks passed');
