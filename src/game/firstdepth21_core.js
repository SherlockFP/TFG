export const FIRST21={grace:45,settle:120,entryRadius:16,hazards:2};
export function firstSurface(run,moon,facility) {
 return !!run&&!!facility&&['landing','moon'].includes(run.phase)&&!run.quick&&(run.day|0)<=1&&(run.quotaIndex|0)<=0&&(run.descent21?.depth|0)===0&&!moon?.company&&!moon?.home&&!moon?.ghost;
}
const neutral=def=>!!def?.noSpawn&&!!def?.noHunt&&!(def.power>0)&&!(def.xp>0)&&!(def.coin>0);
export function roaming(def){return !!def&&!def.boss&&!def.cyAux&&!neutral(def)&&!def.hazard&&((def.power||0)>0||(def.dmg||0)>0);}
export function admitFirst({def,pos,opts={},time=0,alive=[],entries=[]}) {
 if(!def||opts.id||def.boss||def.cyAux||neutral(def))return true; // Restored identities and scripted boss contracts retain native behavior.
 if(def.hazard&&!(def.dmg>0))return true; // Owned webs/nests and harmless native scene actors are not a new attack population.
 if(!roaming(def)&&!def.hazard)return true;
 if(time<FIRST21.settle&&entries.some(p=>Math.abs(p.y-pos.y)<6&&Math.hypot(p.x-pos.x,p.z-pos.z)<FIRST21.entryRadius))return false;
 if(def.hazard){
  if((def.dmg>=999)&&time<FIRST21.settle)return false;
  return alive.filter(c=>!c.dead&&c.def?.hazard&&c.def?.dmg>0).length<FIRST21.hazards;
 }
 if(time<FIRST21.grace)return false;
 if(time<FIRST21.settle&&((def.dmg||0)>=60||(def.run||0)>=9))return false;
 const limit=time<FIRST21.settle?1:2;
 return alive.filter(c=>!c.dead&&roaming(c.def)).length<limit;
}
