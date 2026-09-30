// Uses the existing avatar attachment frames, merged geometry and look-controller disposal.
import { G, xf, lam } from './modelkit.js';
import { C13 } from '../game/wardrobe13_data.js';
export const C13_SUITS = {};
const box = (w,h,d,x,y,z,r = [0,0,0]) => xf(G.box(w,h,d),[x,y,z],r);
for (const [i,e] of C13.filter(e=>e.slot==='suit').entries()) {
 C13_SUITS[e.id] = { tint:e.color, glove:'#303537', boot:'#24292b', belt:'#303030', hide:[], build(c) {
  const r=c.rig, key=e.id, cloth=lam(e.color), trim=lam(i>4?'#beb8a7':'#a3967e'), dark=lam('#262c2f');
  // All pieces follow the articulated rig; inspection plates are purely decorative.
  c.mesh(r.spine,key+'_straps',dark,()=>[box(.045,.36,.026,-.13,.28,.169),box(.045,.36,.026,.13,.28,.169)]);
  c.mesh(r.spine,key+'_tag',trim,()=>[box(.075,.05,.018,.085,.34,.195)]);
  if(i===0) c.mesh(r.spine,key+'_apron',cloth,()=>[box(.34,.51,.035,0,.05,.18)]);
  if(i===1) { c.mesh(r.spine,key+'_drum',trim,()=>[xf(G.cyl(.09,.09,.12,8),[-.2,.16,.21],[Math.PI/2,0,0])]); }
  if(i===2) c.mesh(r.spine,key+'_satchel',cloth,()=>[box(.2,.22,.11,-.19,.1,.2),box(.038,.5,.022,0,.28,.19,[0,0,-.55])]);
  if(i===3) c.mesh(r.spine,key+'_filter',trim,()=>[box(.2,.17,.075,0,.28,.19),box(.27,.08,.08,0,.51,.08)]);
  if(i===4) c.mesh(r.spine,key+'_tails',cloth,()=>[box(.18,.44,.06,-.13,-.07,-.14),box(.18,.44,.06,.13,-.07,-.14)]);
  if(i===5) { for(const arm of [r.armL,r.armR]) c.mesh(arm.sh,key+'_shoulder',trim,()=>[box(.21,.12,.23,0,-.04,0)]); c.mesh(r.spine,key+'_collar',trim,()=>[box(.32,.065,.25,0,.53,0)]); }
  if(i===6) c.mesh(r.spine,key+'_lapels',trim,()=>[box(.065,.27,.025,-.085,.35,.18,[0,0,-.25]),box(.065,.27,.025,.085,.35,.18,[0,0,.25])]);
  if(i===7) { c.mesh(r.armL.sh,key+'_mantle',cloth,()=>[box(.26,.35,.29,0,-.12,0)]); c.mesh(r.spine,key+'_plates',trim,()=>[box(.27,.1,.035,0,.3,.185),box(.22,.07,.035,0,.19,.18),box(.16,.05,.035,0,.1,.175)]); }
  for(const leg of [r.legL,r.legR]) c.mesh(leg.knee,key+'_kneepad',dark,()=>[box(i===3?.15:.12,.13,.055,0,0,.075)]);
 }};
}
export const C13_BACKS = {};
for(const [i,e] of C13.filter(e=>e.slot==='back').entries()) C13_BACKS[e.id]=(c,r)=>{
 const shell=lam(e.color), dark=lam('#262d31'), trim=lam('#b5ac96'), key=e.id;
 c.mesh(r.backpack,key+'_mount',dark,()=>[box(.28,.35,.055,0,0,-.07)]);
 if(i===0) { c.mesh(r.backpack,key+'_reel',shell,()=>[xf(G.cyl(.2,.2,.045,10),[0,0,-.16],[Math.PI/2,0,0]),xf(G.cyl(.2,.2,.045,10),[0,0,-.27],[Math.PI/2,0,0])]); c.mesh(r.backpack,key+'_cable',dark,()=>[xf(G.cyl(.15,.15,.1,10),[0,0,-.21],[Math.PI/2,0,0])]); }
 if(i===1) { c.mesh(r.backpack,key+'_case',shell,()=>[box(.37,.36,.14,0,0,-.17)]); c.mesh(r.backpack,key+'_seal',trim,()=>[box(.05,.31,.02,.08,0,-.25),box(.11,.065,.025,0,.04,-.265)]); }
 if(i===2) { c.mesh(r.backpack,key+'_receiver',shell,()=>[box(.29,.26,.17,0,0,-.18),box(.035,.45,.06,-.17,.14,-.17,[0,0,-.2]),box(.035,.45,.06,.17,.14,-.17,[0,0,.2])]); c.mesh(r.backpack,key+'_grille',dark,()=>[0,1,2,3].map(n=>box(.22,.02,.02,0,-.07+n*.045,-.275))); }
 if(i===3) { c.mesh(r.backpack,key+'_rack',trim,()=>[box(.025,.48,.04,-.2,0,-.2),box(.025,.48,.04,.2,0,-.2),box(.42,.025,.04,0,.24,-.2),box(.42,.025,.04,0,-.24,-.2)]); c.mesh(r.backpack,key+'_cans',shell,()=>[-.13,0,.13].map(x=>xf(G.cyl(.048,.048,.33,6),[x,0,-.18]))); }
};
