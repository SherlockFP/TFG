// Native panel ownership: no extra input listener, movement flag or persistent overlay.
import {el} from '../core/util.js';
import {attentionHot} from './hud_attention.js';
import {draftWords,cardText,cardEffect} from '../game/deadletter24_text.js';
const STYLE_ID='deadletter24-draft-style';
const CSS=`.dl24-draft{width:min(840px,94vw);max-height:90vh;overflow:auto;padding:22px;border:2px solid #a79b83;background:#24251f;color:#e0d7c3;font-family:var(--font2,monospace);box-shadow:8px 8px 0 #10120e}.dl24-draft h2{font-size:22px;letter-spacing:.12em;margin:0 0 8px}.dl24-note{font-size:13px;line-height:1.4;opacity:.8}.dl24-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0}.dl24-draft button.dl24-card{display:flex;flex-direction:column;gap:14px;text-align:left;min-height:220px;padding:18px;background:#c6bda5;color:#25271f;border:2px solid #827760;border-top:6px solid var(--dl-tier);cursor:pointer;font:inherit;box-shadow:3px 3px 0 #11140e}.dl24-draft button.dl24-card:focus-visible{outline:3px solid #e5b74d;outline-offset:4px}.dl24-tier{font-size:11px;text-transform:uppercase;letter-spacing:.08em}.dl24-name{font-size:19px;font-weight:bold;line-height:1.2}.dl24-rank{font-size:12px}.dl24-effect{margin-top:auto;font-size:14px;line-height:1.5}.dl24-later{font:inherit;color:#d9ceb7;background:#2d3027;border:1px solid #857a62;padding:9px 18px;cursor:pointer}#ui .overlay .dl24-draft button.dl24-card{background:#c6bda5!important;color:#25271f!important;text-shadow:none}#ui .overlay .dl24-draft button.dl24-card:not(:disabled):hover,#ui .overlay .dl24-draft button.dl24-card:focus-visible{background:#ded5bf!important;color:#20231b!important}#ui .overlay .dl24-draft button.dl24-card:disabled{background:#b5ac96!important;color:#303329!important;opacity:.8;cursor:wait}@media(max-width:600px){.dl24-options{grid-template-columns:1fr;gap:10px}.dl24-draft button.dl24-card{min-height:120px;gap:8px}}`;
const COLORS={common:'#615e50',rare:'#566b7c',epic:'#79607b',legendary:'#987332'};
let styles=0,ownedStyle;
function retainStyle(){if(typeof document==='undefined')return;if(!document.getElementById(STYLE_ID)){ownedStyle=el('style',{id:STYLE_ID},CSS);document.head.appendChild(ownedStyle);}styles++;}
function releaseStyle(){styles=Math.max(0,styles-1);if(!styles&&ownedStyle){ownedStyle.remove();ownedStyle=null;}}
export function installDeadletter24Draft(game){
 let panel=null,disposed=false,openNonce=null;retainStyle();
 const ui=game.ui;
 const threatBlocks=()=>!game.deadletter24?.combatPaused?.()&&(attentionHot(game)||game.deadletter24?.active?.());
 const incapacitated=()=>game.player?.dead||game.player?.downed||game.downed?.isDowned?.(game.selfId);
 const off=game.mods?.on?.('update',(_,g)=>{if((!g||g===game)&&panel&&ui.panelOpen===panel&&(threatBlocks()||incapacitated()))close();});
 function close(){if(panel&&ui.panelOpen===panel)ui.closePanel();panel=null;openNonce=null;}
 function openDraft({offer,build={},onChoose}={}){
  if(disposed||!offer?.choices?.length||typeof onChoose!=='function'||threatBlocks()||incapacitated()||game.minigame||ui.fullscreenOpen?.()||(ui.panelOpen&&ui.panelOpen!==panel))return false;
  if(panel&&ui.panelOpen===panel&&openNonce===offer.nonce)return true;
  if(panel&&ui.panelOpen===panel)ui.closePanel(true);
  const words=draftWords();panel=el('section',{class:'dl24-draft',role:'dialog','aria-modal':'true','aria-label':words.title},el('h2',{},`${words.title} · ${words.level} ${offer.level}`),el('p',{class:'dl24-note'},words.choose));
  const options=el('div',{class:'dl24-options'});const buttons=[];
  for(const choice of offer.choices){
   const text=cardText(choice.id),tier=Object.keys(COLORS).includes(choice.tier)?choice.tier:'common',tierIndex=Object.keys(COLORS).indexOf(tier),rank=choice.rank??build[choice.id]??0,next=choice.nextRank??rank+1;
   const button=el('button',{type:'button',class:'dl24-card',style:{'--dl-tier':COLORS[tier]},'data-card':choice.id},el('span',{class:'dl24-tier'},words.tiers[tierIndex]),el('span',{class:'dl24-name'},text.name),el('span',{class:'dl24-rank'},`${words.rank} ${rank} → ${next} / 5`),el('span',{class:'dl24-effect'},`${text.description}: ${cardEffect(choice.id,rank)} → ${cardEffect(choice.id,next)}`));
   button.addEventListener('click',()=>{if(button.disabled||disposed||ui.panelOpen!==panel)return;for(const b of buttons)b.disabled=true;const selectedPanel=panel;const accepted=onChoose({id:choice.id,nonce:offer.nonce,level:offer.level,floor:offer.floor});if(accepted===false){for(const b of buttons)b.disabled=false;return;}if(panel===selectedPanel)close();});buttons.push(button);options.appendChild(button);
  }
  panel.appendChild(options);panel.appendChild(el('button',{class:'dl24-later',type:'button',onclick:close},words.later));openNonce=offer.nonce;ui.openPanel(panel);buttons[0]?.focus?.();return true;
 }
 return {openDraft,close,isOpen:()=>!!panel&&ui.panelOpen===panel,dispose(){if(disposed)return;close();disposed=true;off?.();releaseStyle();}};
}
