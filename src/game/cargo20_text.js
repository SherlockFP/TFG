import { getLang } from '../core/i18n.js';
export function nudgeLabel(name,key='E',brake=false) {
 const lang=getLang();
 if(brake)return lang==='tr'?`${name}: Tut [LMB] · Frenle [${key}]`:lang==='ru'?`${name}: захват [LMB] · затормозить [${key}]`:`${name}: Grab [LMB] · Brace [${key}]`;
 return lang==='tr'?`${name}: Tut [LMB] · İt [${key}]`:lang==='ru'?`${name}: захват [LMB] · толкнуть [${key}]`:`${name}: Grab [LMB] · Push [${key}]`;
}
