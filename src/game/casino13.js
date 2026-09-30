import { el } from '../core/util.js';
import { HOST_ONLY } from '../net/session.js';
import { transact, BETS } from './casino13_core.js';
import { makeClub } from './casino13_models.js';
import { tx } from './casino13_text.js';
HOST_ONLY.add('c13state');HOST_ONLY.add('c14deal');
export function installCasino13(game) {
 let club=null, station=null, panel=null, state={wallet:{chips:0,seq:0,round:null}}, pending=false, lastResult='', timer=null, visualEl=null, animTimer=null, settleTimer=null, visualMode='', frame=0;
 const offs=[]; const cooldown=new Map();
 const stopAnim=()=>{clearInterval(animTimer);animTimer=null;};
 const animate=()=>{stopAnim();frame=0;if(!visualMode||game.settings?.reduceMotion)return;animTimer=setInterval(()=>{if(++frame>28||!pending){stopAnim();return;}if(visualEl&&game.ui.panelOpen===panel){if(visualMode==='slots')visualEl.textContent=Array.from({length:3},(_,i)=>['A','B','C','D','E','SIGNAL'][(frame*3+i*2)%6]).join(' | ');else if(visualMode==='wheel')visualEl.textContent=`#${(frame*11)%37}`;else visualEl.textContent='[ '+'.'.repeat(frame%4+1)+' ]';}},70);};
 const send=(action,extra={})=>{if(pending)return;pending=true;visualMode=action==='status'?'':extra.game||(['push','cash'].includes(action)?'packet':'cashier');game.net.request('c13',{station,action,seq:state.wallet.seq,...extra});render();animate();clearTimeout(timer);timer=setTimeout(()=>{stopAnim();pending=false;lastResult=tx('Transaction refused. Stay at the station; check balance and active packet.');render();},2500);};
 function render(){if(!panel||game.ui.panelOpen!==panel)return;panel.replaceChildren();const body=el('div',{class:'cp-body'}),foot=el('div',{class:'cp-foot'});panel.append(el('div',{class:'cp-head'},tx('DEAD SIGNAL CLUB')),body,foot);body.append(el('p',{},`${tx('Crew Credits')}: ${state.credits??game.run?.credits??0} | ${tx('Your chips')}: ${state.wallet.chips}`));
 const rows=el('div',{class:'menu-row'});const button=(text,action)=>{const b=game.ui.button(text,action);b.disabled=pending;rows.append(b);};
 if(station==='cashier'){body.append(el('p',{},tx('Mica: one Credit buys one chip. Redeeming returns Credits to the crew. No loans.')));for(const amount of [10,25,50])button(`${tx('Buy')} ${amount}`,()=>send('buy',{amount}));button(tx('Redeem all'),()=>send('redeem',{amount:state.wallet.chips}));}
 else if(station==='packet'){body.append(el('p',{},tx('Safe transmission chances: 65%, 55%, 45%. Bank now or lose the whole pot. Three pushes maximum.')));const r=state.wallet.round;if(r){body.append(el('p',{},`${tx('Pot')}: ${r.pot} | ${r.step}/3`));if(r.step<3)button(tx('Risk doubling'),()=>send('push'));button(tx('Cash out'),()=>send('cash'));}else for(const amount of BETS)button(`${tx('Start packet')} ${amount}`,()=>send('play',{game:'packet',amount}));}
 else{body.append(el('p',{},tx(station==='slots'?'Triple: 6x; triple SIGNAL: 12x; first pair: 2x. Payout includes your stake.':'37 pockets. Red or black pays 2x; zero loses.')));for(const amount of BETS){if(station==='slots')button(`${tx('Spin')} ${amount}`,()=>send('play',{game:'slots',amount}));else for(const choice of ['red','black'])button(`${tx(choice==='red'?'Red':'Black')} ${amount}`,()=>send('play',{game:'wheel',amount,choice}));}}
 body.append(rows);visualEl=el('div',{style:'padding:18px;margin:12px 0;background:#10151c;border:1px solid #c5a754;text-align:center;font:bold 26px monospace;min-height:34px'},pending?'· · ·':state.reels?state.reels.map(n=>['A','B','C','D','E','SIGNAL'][n]).join(' | '):state.n!==undefined?`#${state.n}`:state.wallet.round?`${tx('Pot')}: ${state.wallet.round.pot}`:'—');body.append(visualEl);
 const waitLine=visualMode==='slots'?'Dealer: the reels are settling.':visualMode==='wheel'?'Dealer: the wheel is turning.':visualMode==='packet'?'Broker: checking the packet route.':'Mica: counting chips.';
 body.append(el('p',{class:'muted'},pending?tx(waitLine):lastResult));foot.append(game.ui.button(tx('Close'),()=>game.ui.closePanel()));
 }
 function open(id){station=id;panel=game.ui.panel('wide');game.ui.openPanel(panel);lastResult='';send('status');}
 function host(d,from){if(typeof from!=='string'||['__proto__','constructor','prototype'].includes(from))return;const pl=game.aiPlayerById(from), spot=club?.spots.find(s=>s.id===d?.station);if(!game.isHost||!pl||pl.dead||!spot||pl.pos.distanceTo(spot.pos)>4||game.run?.phase!=='company')return;
 const now=performance.now();
 const ledger=game.run.casino13 ||= {wallets:{}};const wallet=Object.hasOwn(ledger.wallets,from)?ledger.wallets[from]:(ledger.wallets[from]={chips:0,seq:0,round:null});
 if(d.action==='status'){game.net.sendTo(from,'c13state',{wallet,credits:game.run.credits});return;}
 if(now-(cooldown.get(from)||0)<100){game.net.sendTo(from,'c13state',{wallet,credits:game.run.credits,refused:true});return;}cooldown.set(from,now);
 const exchange=['buy','redeem'].includes(d.action);if((exchange&&d.station!=='cashier')||(!exchange&&d.station==='cashier')||(['push','cash'].includes(d.action)&&d.station!=='packet')||(d.action==='play'&&d.game!==d.station))return;
 const result=transact(game.run,from,d);if(result){if(['play','push','cash'].includes(d.action)){ledger.recentSeq=(ledger.recentSeq||0)+1;const row={seq:ledger.recentSeq,station:d.station,name:String(game.playerName?.(from)||'Crew').slice(0,24),kind:result.kind,paid:result.paid,...(result.reels?{reels:result.reels}:{}),...(result.n!==undefined?{n:result.n}:{})};ledger.recent=[...(ledger.recent||[]),row].slice(-3);game.net.broadcast('c14deal',ledger.recent);club?.setRecent(ledger.recent);}game.broadcastRun(['credits','casino13']);game.net.sendTo(from,'c13state',result);}else game.net.sendTo(from,'c13state',{wallet,credits:game.run.credits,refused:true});
 }
 offs.push(game.mods.on('registerHandlers',H=>H('c13',host)));
 const ready=net=>{net.on_('c14deal',rows=>{if(Array.isArray(rows))club?.setRecent(rows.slice(-3));});net.on_('c13state',d=>{clearTimeout(timer);clearTimeout(settleTimer);state=d;lastResult=d.refused?tx('Transaction refused. Stay at the station; check balance and active packet.'):d.kind?`${tx(d.kind)} · ${tx('Paid chips')}: ${d.paid} · ${tx(['bust','loss','zero'].includes(d.kind)?'Dealer: the house keeps this one.':['bought','redeemed','cashed'].includes(d.kind)?'Mica: ledger balanced.':'Dealer: bank it while you can.')}`:'';const finish=()=>{stopAnim();pending=false;render();if(d.kind)game.audio?.ui?.(d.paid>0?'ui_confirm':'ui_error',.35);};if(d.kind&&!d.refused&&!game.settings?.reduceMotion){settleTimer=setTimeout(finish,450);}else finish();});};
 offs.push(game.mods.on('netReady',ready));if(game.net)ready(game.net);
 offs.push(game.mods.on('mapLoaded',world=>{club?.dispose();club=null;if(world.company?.casinoSpace){club=makeClub(world.company.casinoSpace);world.company.group.add(club.root);club.setRecent(game.run?.casino13?.recent||[]);}}));
 offs.push(game.mods.on('interactables',out=>{if(game.run?.phase==='company')for(const s of club?.spots||[])out.push({pos:s.pos,r:.8,label:tx(s.label),action:()=>open(s.id)});}));
 return {open, get spots(){return club?.spots||[];},dispose(){clearTimeout(timer);clearTimeout(settleTimer);stopAnim();offs.forEach(f=>f());club?.dispose();}};
}
