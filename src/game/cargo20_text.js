import { getLang } from '../core/i18n.js';
export function nudgeLabel(name,key='E') {
 const lang=getLang();
 return lang==='tr'?`${name}: Tut [LMB] · İt [${key}]`:lang==='ru'?`${name}: захват [LMB] · толкнуть [${key}]`:`${name}: Grab [LMB] · Push [${key}]`;
}
