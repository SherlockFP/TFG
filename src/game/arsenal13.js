import {ITEMS,registerItem} from './items.js';
import {CLASSES} from './combat.js';
import {WEAPON_RECOIL} from '../models/avatar.js';
import {wrapMethod} from './dailyEvents.js';
import {synth,sin,ex,nz} from './combat_kit.js';
import {ARSENAL13_DEFS,BATON_CLASS,arsenalLock} from './arsenal13_core.js';
import {ARSENAL13_MODELS} from './arsenal13_models.js';
import {tx} from './arsenal13_text.js';
export function installArsenal13(game){
 for(const def of ARSENAL13_DEFS)if(!ITEMS[def.id])registerItem(def);
 CLASSES.a13_baton ||= BATON_CLASS;
 WEAPON_RECOIL.a13_rivet={dur:.55,jitter:.003,K:{x:.38,e:.15,pz:.17,py:.035,wr:-.12}};
 const K=game.combat?.kit;
 const sounds={a13_rivet_fire:sr=>synth(sr,.45,tt=>sin(95+210*ex(tt,30),tt)*ex(tt,13)*.8+nz()*ex(tt,55)*.9+sin(1800,tt)*ex(tt,45)*.1),a13_baton_air:sr=>synth(sr,.25,tt=>nz()*ex(tt,24)*.35+sin(240+600*ex(tt,22),tt)*ex(tt,19)*.35)};
 K?.models(ARSENAL13_MODELS);K?.sounds(sounds);
 // The existing shop runs this lock on both display and host transaction validation.
 const undo=wrapMethod(game.hubgate,'shopLock',old=>function(entry){if(arsenalLock(entry.id,game.run?.quotaIndex||0))return tx('Field armory unlocks at quota 2.');return old.call(this,entry);});
 let lastAttack=null;const off=game.mods.on('update',()=>{const attack=game.combat?.melee?.state?.atk;if(attack&&attack!==lastAttack&&game.player.heldItem()?.type==='a13_baton')K?.bsnd('a13_baton_air',game.player.pos,.45);lastAttack=attack;});
 return {defs:ARSENAL13_DEFS,dispose(){off();undo();}};
}
