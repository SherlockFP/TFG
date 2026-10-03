import {el,humanizeId} from '../core/util.js';
import {getLang} from '../core/i18n.js';
import {glyph} from './glyphs.js';
import {ENDLESS41_CSS} from './endless41_style.js';
import {endless41Text as t} from './endless41_text.js';
import {PERKS41} from '../game/endless41_core.js';

const RARITY={common:'#c0c2ac',uncommon:'#9db891',rare:'#a9bccb',epic:'#c0acc9',legendary:'#d0bd82'};
const key=o=>o?`${o.token}:${o.revision}:${o.nonce}`:'';
const text=v=>Array.isArray(v)?v.join(' · '):v&&typeof v==='object'?Object.entries(v).map(([k,n])=>`${t(k)} ${n}`).join(' · '):String(v??'—');
const icon=kind=>{
 const asset={Striker:'weapon',Engineer:'armor',Salvager:'health'}[kind];
 return asset?el('span',{class:'e41-icon'},el('img',{src:`/assets/ui/endless41/${asset}.png`,alt:'',width:36,height:36})):el('span',{class:'e41-icon',html:glyph(kind==='weapon'||kind==='combat'?'bolt':kind==='salvage'?'box':'gear')});
};

/** Local presentation only. Root's native mode owns all validation, clocks and purchases. */
export function createEndless41UI(game){
 const ui=game.ui,style=el('style',{},ENDLESS41_CSS);document.head.appendChild(style);
 const statusEl=el('div',{class:'e41-status'}),statusMain=el('span'),statusSub=el('small');statusEl.hidden=true;
 statusEl.append(statusMain,statusSub);(ui.hud?.el||ui.root||document.body).appendChild(statusEl);
 let panel=null,view='',signature='',pending=false,disposed=false,statusSignature='',notice=null;
 const api=()=>game.endless41,active=()=>!disposed&&!!api()?.active?.();
 const incapacitated=()=>game.player?.dead||game.player?.downed||game.downed?.isDowned?.(game.selfId);
 const prepare=()=>{const s=api()?.status?.();return !!s&&(s.canShop===true||s.grace>0||['prep','preparation','break','cleared'].includes(s.stage));};
 function close(){if(panel&&ui.panelOpen===panel)ui.closePanel();panel=null;view='';signature='';pending=false;notice=null;}
 function allowed(){return active()&&!incapacitated()&&!game.minigame&&!ui.fullscreenOpen?.()&&(!ui.panelOpen||ui.panelOpen===panel);}
 function mount(title,note,kind,sig){
  if(panel&&ui.panelOpen===panel)ui.closePanel(true);
  panel=el('section',{class:'e41-panel',role:'dialog','aria-modal':'true','aria-label':t(title)},el('h2',{},t(title)),note?el('p',{},t(note)):null);view=kind;signature=sig;pending=false;notice=el('span',{class:'e41-notice','aria-live':'polite'});return panel;
 }
 function button(label,action,attrs={}){const b=el('button',{type:'button',class:'e41-control',...attrs},label);b.addEventListener('click',()=>{if(b.disabled||!active()||incapacitated()||ui.panelOpen!==panel)return;action();});return b;}
 function footer(...buttons){panel.appendChild(el('div',{class:'e41-footer'},...buttons,notice,button(t('Close'),close)));}
 function display(){ui.openPanel(panel);panel.querySelector('button')?.focus?.();return true;}
 function submit(method,id,offerKey){
  if(pending||!active()||key(api()?.offer?.())!==offerKey)return;
  const submittedPanel=panel,controls=[...panel.querySelectorAll('button')].map(b=>[b,b.disabled]);
  // Host requests can replace this panel synchronously. Lock only the submitted offer.
  pending=true;notice.textContent=t('Waiting for crew confirmation…');for(const [b]of controls)b.disabled=true;
  const result=api()?.[method]?.(id);
  if(result===false&&panel===submittedPanel){pending=false;for(const [b,disabled]of controls)b.disabled=disabled;notice.textContent=t('Unavailable. Check the current offer or credits.');}
 }
 function openDraft(){
  const offer=api()?.offer?.();if(!allowed()||!offer||!offer.choices?.length||offer.choices.length>3)return false;
  const sig=key(offer)+':'+getLang();if(panel&&ui.panelOpen===panel&&view==='draft'&&signature===sig)return true;
  mount('Choose an upgrade','Choose one. Your crew build lasts for this run.','draft',sig);const cards=el('div',{class:'e41-cards'}),build=api()?.build?.()||{},offerKey=key(offer);
  for(const c of offer.choices){
   const card=el('article',{class:'e41-card','data-branch':c.branch||'crew',style:{'--e41-tier':RARITY[c.rarity]||RARITY.common}},el('div',{class:'e41-cardhead'},icon(c.branch),el('span',{class:'e41-badge'},t(c.rarity||'common'))),el('small',{},t(c.branch||'crew')),el('h3',{},t(c.name||c.id)),el('p',{},t(c.description||'')),el('div',{class:'e41-diff'},el('span',{},el('small',{},t('Current')),el('b',{},text(c.before))),el('span',{},'→'),el('span',{},el('small',{},t('After')),el('b',{},text(c.after)))),button(t(c.name||c.id),()=>submit('choose',c.id,offerKey),{'data-choice':c.id}),button(t('Ban'),()=>submit('ban',c.id,offerKey),{class:'e41-ban',disabled:!(build.bans>0),'data-ban':c.id}));cards.appendChild(card);
  }
  panel.appendChild(cards);footer(button(`${t('Reroll')} · ${build.rerolls||0}`,()=>submit('reroll',undefined,offerKey),{disabled:!(build.rerolls>0),'data-reroll':true}),button(t('Skip'),()=>submit('skip',undefined,offerKey),{'data-skip':true}));return display();
 }
 function openPreparation(){
  if(!allowed()||!prepare())return false;const s=api().status(),catalog=api()?.catalog?.()||[];
  mount('Preparation','Spend recovered cargo credits before the next wave.','shop',`${s.token}:${s.revision}:${s.credits}:${getLang()}`);
  const grid=el('div',{class:'e41-shop'});for(const c of catalog){const maximum=c.level>=c.max,can=c.available!==false&&s.credits>=c.price&&!maximum;
   grid.appendChild(el('article',{class:'e41-shoprow'},el('h3',{},t(c.name||c.id)),el('small',{},`${t(c.kind||'module')} · ${t('Rank')} ${c.level||0}/${c.max}`),el('p',{},t(c.description||'')),button(maximum?t('Maximum'):`${t('Buy')} · ▮${c.price}`,()=>{if(!prepare())return;const result=api()?.buy?.(c.id);if(result===false)notice.textContent=t('Unavailable. Check the current offer or credits.');},{disabled:!can,'data-buy':c.id})));
  }panel.appendChild(grid);footer();return display();
 }
 function openInventory(){
  if(!allowed())return false;mount('Crew inventory',null,'inventory',getLang());const columns=el('div',{class:'e41-inventory'}),entries=game.inventory?.entries?.()||[],build=api()?.build?.()||{};
  for(const [title,kind]of [['Weapons','weapon'],['Modules & skills','module'],['Items','item']]){
   const column=el('section',{},el('h3',{},t(title)));let count=0;
   if(kind==='module')for(const [id,rank]of Object.entries(build.perks||{})){column.appendChild(el('div',{class:'e41-item'},icon('module'),`${t(PERKS41[id]?.name||humanizeId(id))} · ${t('Rank')} ${rank}`));count++;}
   else for(const entry of entries){const def=entry.def||entry.it?.def||{},weapon=def.kind==='weapon';if((kind==='weapon')!==weapon)continue;column.appendChild(el('div',{class:'e41-item','data-item':entry.id},icon(weapon?'weapon':'item'),t(def.name||entry.it?.type||entry.id)));count++;}
   if(!count)column.appendChild(el('p',{},t(kind==='module'?'No upgrades chosen yet.':'No equipment carried.')));columns.appendChild(column);
  }panel.appendChild(columns);footer();return display();
 }
 function update(){
  if(disposed)return;document.body.classList.toggle('e41-mode',active());statusEl.hidden=!active();if(!active()){close();return;}const s=api()?.status?.()||{},sig=JSON.stringify([s.stage,s.wave,s.level,s.xp,s.nextXp,Math.ceil(s.grace||0),Math.round(s.shipHp||0),s.shipMaxHp,s.credits,getLang()]);
  if(sig!==statusSignature){statusSignature=sig;statusMain.textContent=`${t('Wave')} ${s.wave||0} · ${t('Level')} ${s.level||1} · XP ${s.xp||0}/${s.nextXp||0}`;statusSub.textContent=`${s.grace>0?`${t('Grace')} ${Math.ceil(s.grace)}s · `:''}${t('Ship')} ${Math.max(0,Math.round(s.shipHp||0))}/${s.shipMaxHp||0} · ▮${s.credits||0}`;}
  if(inventoryLaunch.textContent!==t('Crew inventory'))inventoryLaunch.textContent=t('Crew inventory');if(draftLaunch.textContent!==t('Choose an upgrade'))draftLaunch.textContent=t('Choose an upgrade');draftLaunch.hidden=!api()?.offer?.();
  if(panel&&ui.panelOpen!==panel){panel=null;view='';signature='';pending=false;}
  if(incapacitated()){close();return;}
  if(view==='draft'){if(!api()?.offer?.())close();else if(signature!==key(api().offer())+':'+getLang())openDraft();}
  if(view==='shop'){if(!prepare())close();else if(signature!==`${s.token}:${s.revision}:${s.credits}:${getLang()}`)openPreparation();}
 }
 const inventoryLaunch=el('button',{type:'button',class:'e41-launch',onclick:openInventory},t('Crew inventory'));
 const draftLaunch=el('button',{type:'button',class:'e41-launch',onclick:openDraft},t('Choose an upgrade'));draftLaunch.hidden=true;statusEl.append(inventoryLaunch,draftLaunch);
 return {openDraft,openPreparation,openInventory,update,dispose(){if(disposed)return;close();disposed=true;document.body.classList.remove('e41-mode');statusEl.remove();style.remove();}};
}
