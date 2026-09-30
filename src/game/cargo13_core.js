export const CAPACITY=8, MAX_WEIGHT=120, CUSTODY='c:cargo13';
export const slotCost=item=>item?.def?.kind==='big'?4:1;
export function portalAllowed(driver,peer,player,cart,source){return driver===peer&&!!source&&player.distanceTo(source)<4&&cart.distanceTo(source)<4.5&&player.distanceTo(cart)<3.7;}
export function loadable(item,peer,ids,all){
 if(!item||ids.includes(item.id)||ids.reduce((n,id)=>n+slotCost(all(id)),0)+slotCost(item)>CAPACITY||item.soulbound||item.type==='body'||item.carrier||item.selling||item.ladder||item.inv||item.def?.special==='apparatus')return false;
 if(item.holder?item.holder!==peer:item.state!=='world'||item.owner)return false;
 const weight=Number(item.def?.weight)||0;
 return weight>=0&&weight+ids.reduce((n,id)=>n+(Number(all(id)?.def?.weight)||0),0)<=MAX_WEIGHT;
}
export function takeCargo(state,id){const i=state.ids.indexOf(id);if(i<0)return false;state.ids.splice(i,1);return true;}
