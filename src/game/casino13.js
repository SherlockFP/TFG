import {el} from '../core/util.js';
import {HOST_ONLY} from '../net/session.js';
import {transact,BETS,walletFor,bindCasinoWallet,walletView,houseFor,casinoOutboundView,recoverCasinoRounds} from './casino13_core.js';
import {cardLabel,blackjackValue,POKER_RANKS} from './casino24_cards.js';
import {makeClub} from './casino13_models.js';
import {tx} from './casino13_text.js';
HOST_ONLY.add('c13state');HOST_ONLY.add('c14deal');
export function installCasino13(game){
 let club=null,station=null,panel=null,state={wallet:{chips:0,seq:0,round:null}},pending=false,lastResult='',timer=null,animTimer=null,visual=null,frame=0;
 const hooked=new Set();
 const offs=[],cooldown=new Map(),discards=new Set();
 const stopAnim=()=>{clearInterval(animTimer);animTimer=null;};
 const send=(action,extra={})=>{if(pending)return;pending=true;game.net.request('c13',{station,action,seq:state.wallet.seq,...extra});render();stopAnim();if(!game.settings?.reduceMotion&&action==='play'&&station==='slots'){frame=0;animTimer=setInterval(()=>{if(!pending||++frame>28)return stopAnim();if(visual)visual.textContent=[0,1,2].map(i=>['A','B','C','D','E','SIGNAL'][(frame+i*2)%6]).join(' | ');},70);}clearTimeout(timer);timer=setTimeout(()=>{stopAnim();pending=false;lastResult=tx('Transaction refused. Stay at the station; check balance and active round.');render();},2500);};
 function render(){if(!panel||game.ui.panelOpen!==panel)return;panel.replaceChildren();const body=el('div',{class:'cp-body'}),foot=el('div',{class:'cp-foot'});panel.append(el('div',{class:'cp-head'},tx('DEAD SIGNAL CLUB')),body,foot);body.append(el('p',{},`${tx('Crew Credits')}: ${state.credits??game.run?.credits??0} | ${tx('Your chips')}: ${state.wallet.chips}`));
 body.append(el('p',{class:'muted'},tx('New wagers require house reserve. Accepted wins and chip redemption remain guaranteed.')));
 const cardTable=['blackjack','poker'].includes(station);
 if(cardTable)body.append(el('p',{class:'casino-result24'},pending?tx('Waiting for dealer confirmation...'):lastResult));
 const r=state.wallet.round,rows=el('div',{class:'menu-row'}),button=(text,action)=>{const b=game.ui.button(text,action);b.disabled=pending;rows.append(b);},line=text=>body.append(el('p',{},tx(text)));
 if(station==='cashier'){line('Mica: one Credit buys one chip. Redeeming returns Credits to the crew. No loans.');for(const amount of[10,25,50])button(`${tx('Buy')} ${amount}`,()=>send('buy',{amount}));button(tx('Redeem all'),()=>send('redeem',{amount:state.wallet.chips}));}
 else if(r&&r.kind!==station){line('Finish your active round at its original table.');line(r.kind);}
 else if(station==='packet'){line(r?.version===1?'Legacy packet: 65%, 55%, 45%. Your accepted pot and rules are preserved.':'Safe transmission chances: 48%, 46%, 44%. Bank now or lose the whole pot. Three pushes maximum.');if(r){line(`${tx('Pot')}: ${r.pot} | ${r.step}/3`);if(r.step<3)button(tx('Risk doubling'),()=>send('push'));button(tx('Cash out'),()=>send('cash'));}else for(const amount of BETS)button(`${tx('Start packet')} ${amount}`,()=>send('play',{game:station,amount}));}
 else if(station==='blackjack'||station==='poker'){

  if(r){line(`${tx('Your cards')}: ${r.player.map(cardLabel).join(' · ')}`);if(station==='blackjack'){line(`${tx('Total')}: ${blackjackValue(r.player)} | ${tx('Dealer')}: ${r.dealer.map(cardLabel).join(' · ')} + ?`);button(tx('Hit'),()=>send('hit'));button(tx('Stand'),()=>send('stand'));}else{r.player.forEach((c,i)=>button((discards.has(i)?'✓ ':'')+cardLabel(c),()=>{if(discards.has(i))discards.delete(i);else if(discards.size<3)discards.add(i);render();}));button(tx('Draw selected / reveal'),()=>send('draw',{discards:[...discards]}));}}
  else for(const amount of BETS)button(`${tx('Deal')} ${amount}`,()=>send('play',{game:station,amount}));
  if(state.player&&state.dealer){line(`${tx('Your cards')}: ${state.player.map(cardLabel).join(' · ')}`);line(`${tx('Dealer')}: ${state.dealer.map(cardLabel).join(' · ')}`);line(state.playerRank!==undefined?`${tx(POKER_RANKS[state.playerRank])} / ${tx(POKER_RANKS[state.dealerRank])}`:`${state.playerTotal} / ${state.dealerTotal}`);}
  body.append(rows);
  line(station==='blackjack'?'Hit or stand. Dealer stands on 17, including soft 17. Win or natural: 2x; tie refunds stake. No split, insurance or double.':'Five-card draw: mark 0–3 cards, draw once, then compare with the dealer. Higher hand pays 2x; tie refunds stake. Dealer keeps pairs or its two highest cards.');
 }
 else{line(station==='slots'?'Triple: 3x; triple SIGNAL: 6x; any pair: 2x. Payout includes your stake.':'37 pockets. Red or black pays 2x; zero loses.');for(const amount of BETS){if(station==='slots')button(`${tx('Spin')} ${amount}`,()=>send('play',{game:station,amount}));else for(const choice of['red','black'])button(`${tx(choice==='red'?'Red':'Black')} ${amount}`,()=>send('play',{game:station,amount,choice}));}}
 if(!rows.parentElement)body.append(rows);if(!cardTable){visual=el('div',{style:'padding:16px;margin:12px 0;background:#10151c;border:1px solid #c5a754;text-align:center;font:bold 24px monospace;min-height:34px'},pending?'· · ·':state.reels?state.reels.map(n=>['A','B','C','D','E','SIGNAL'][n]).join(' | '):state.n!==undefined?`#${state.n}`:r?.kind==='packet'?`${tx('Pot')}: ${r.pot}`:'—');body.append(visual);line(pending?'Waiting for dealer confirmation...':lastResult);}else visual=null;foot.append(game.ui.button(tx('Close'),()=>game.ui.closePanel()));
 }
 function open(id){station=id;discards.clear();state={wallet:state.wallet,credits:state.credits};panel=game.ui.panel('wide');game.ui.openPanel(panel);lastResult='';send('status');}
 function host(d,from){if(typeof from!=='string'||['__proto__','constructor','prototype'].includes(from))return;const pl=game.aiPlayerById(from),spot=club?.spots.find(s=>s.id===d?.station);if(!game.isHost||!pl||pl.dead||pl.downed||!spot||pl.pos.distanceTo(spot.pos)>4||game.run?.phase!=='company')return;
 const pid=from===game.selfId?game.profile?.id:game.net.players?.get(from)?.pid;
 if(!pid||(from!==game.selfId&&game.profile?.id===pid)||[...(game.net.players?.entries?.()||[])].some(([id,p])=>id!==from&&p.pid===pid))return;
 const oldKey=game.run.casino13?.peerKeys?.[from];
 const wallet=bindCasinoWallet(game.run,from,pid);if(!wallet)return;const ledger=game.run.casino13;houseFor(game.run);if(oldKey!==ledger.peerKeys[from]){game.broadcastRun(['casino13']);game.hostSave?.();}const refuse=()=>game.net.sendTo(from,'c13state',{wallet:walletView(wallet),credits:game.run.credits,refused:true});
 if(d.action==='status'){game.net.sendTo(from,'c13state',{wallet:walletView(wallet),credits:game.run.credits});return;}
 const now=performance.now();if(now-(cooldown.get(from)||0)<100){refuse();return;}cooldown.set(from,now);
 const exchange=['buy','redeem'].includes(d.action);
 if((exchange&&d.station!=='cashier')||(!exchange&&d.station==='cashier')||(['push','cash'].includes(d.action)&&d.station!=='packet')||(['hit','stand'].includes(d.action)&&d.station!=='blackjack')||(d.action==='draw'&&d.station!=='poker')||(d.action==='play'&&d.game!==d.station)){refuse();return;}
 const result=transact(game.run,from,d);if(!result){refuse();return;}
 if(['play','push','cash','hit','stand','draw'].includes(d.action)){ledger.recentSeq=(ledger.recentSeq||0)+1;const row={seq:ledger.recentSeq,station:d.station,name:String(game.playerName?.(from)||'Crew').slice(0,24),kind:result.kind,paid:result.paid,...(result.reels?{reels:result.reels}:{}),...(result.n!==undefined?{n:result.n}:{}),...(result.player?{cardSummary:result.player.map(cardLabel).join(' ')}:result.wallet.round?.player?{cardSummary:result.wallet.round.player.map(cardLabel).join(' ')}:{})};ledger.tables ||= {};for(const old of ledger.recent||[])if(!ledger.tables[old.station])ledger.tables[old.station]=old;ledger.tables[d.station]=row;ledger.recent=Object.values(ledger.tables);game.net.broadcast('c14deal',ledger.recent);club?.setRecent(ledger.recent);}
 game.broadcastRun(['credits','casino13']);game.hostSave?.();game.net.sendTo(from,'c13state',result);
 }
 offs.push(game.mods.on('registerHandlers',H=>H('c13',host)));
 const ready=net=>{if(hooked.has(net))return;hooked.add(net);const previous=net.outboundView,view=(type,data)=>casinoOutboundView(type,previous?previous(type,data):data);net.outboundView=view;offs.push(()=>{if(net.outboundView===view)net.outboundView=previous;hooked.delete(net);});net.on_('c14deal',rows=>{if(Array.isArray(rows))club?.setRecent(rows.slice(-6));});net.on_('c13state',d=>{clearTimeout(timer);stopAnim();state=d;pending=false;if(!d.wallet?.round)discards.clear();lastResult=d.refused?tx('Transaction refused. Stay at the station; check balance and active round.'):d.kind?(d.wallet?.round&&['blackjack','poker'].includes(d.wallet.round.kind)?tx('Hand dealt. Choose your next move.'):`${tx(d.kind)} · ${tx('Paid chips')}: ${d.paid}`):'';render();if(d.kind)game.audio?.ui?.(d.paid>0||d.wallet?.round?'ui_confirm':'ui_error',.35);});};
 offs.push(game.mods.on('hostMigrated',g=>{if(g===game&&game.isHost&&recoverCasinoRounds(game.run)){game.broadcastRun(['casino13']);game.hostSave?.();}}));
 offs.push(game.mods.on('phase',()=>{if(game.isHost&&recoverCasinoRounds(game.run)){game.broadcastRun(['casino13']);game.hostSave?.();}}));
 offs.push(game.mods.on('netReady',ready));if(game.net)ready(game.net);
 offs.push(game.mods.on('mapLoaded',world=>{club?.dispose();club=null;if(world.company?.casinoSpace){club=makeClub(world.company.casinoSpace,{physics:game.physics});world.company.group.add(club.root);club.setRecent(game.run?.casino13?.recent||[]);}}));
 offs.push(game.mods.on('interactables',out=>{if(game.run?.phase==='company')for(const s of club?.spots||[])out.push({pos:s.pos,r:.8,label:tx(s.label),action:()=>open(s.id)});}));
 return{open,get spots(){return club?.spots||[];},dispose(){clearTimeout(timer);stopAnim();offs.forEach(f=>f());club?.dispose();}};
}
