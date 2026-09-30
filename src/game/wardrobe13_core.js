// A new player sees owned pieces and four attainable next goals, not the entire catalogue.
import { unlockAt } from './wallet.js';
export function curateWardrobe(items, profile, owned, price = e => e.price || 0, mode = 'ready') {
 if(mode==='all') return items;
 if(mode==='owned') return items.filter(owned);
 const keep=items.filter(owned);
 const locked=items.filter(e=>!owned(e)).sort((a,b)=> {
  const gate=e=>Math.max(0,(e.minLevel||1)-(profile.level||1))*100000+Math.max(0,unlockAt(price(e))-(profile.coins||0));
  return gate(a)-gate(b);
 });
 return [...keep,...locked.slice(0,4)];
}
