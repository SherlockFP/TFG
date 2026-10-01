// One atomic casino ledger. No gifts, client cards, local wins or fractional chips.
import {shuffledDeck,blackjackValue,pokerRank,comparePoker,dealerDiscards,validDiscards} from './casino24_cards.js';
export const HOUSE_RESERVE=250;
export const MAX_CHIPS=100000,BETS=[5,10,25],PACKET_CHANCES=[.48,.46,.44];
export const slotMultiplier=reels=>reels.every(x=>x===reels[0])?(reels[0]===5?6:3):new Set(reels).size===2?2:0;
export function walletFor(run,peer){const ledger=run.casino13 ||= {wallets:{}};const key=Object.hasOwn(ledger.peerKeys||{},peer)?ledger.peerKeys[peer]:peer;const w=Object.hasOwn(ledger.wallets,key)?ledger.wallets[key]:(ledger.wallets[key]={chips:0,round:null,seq:0});if(w.round&&!w.round.kind){w.round.kind='packet';w.round.version=1;}ledger.version=2;return w;}
// Native-profile identity binding. Never merge two balances or guess an orphan owner.
export function bindCasinoWallet(run,peer,pid){
 if(typeof peer!=='string'||!peer||typeof pid!=='string'||!pid||pid.length>128||['__proto__','constructor','prototype'].includes(peer))return null;
 const ledger=run.casino13 ||= {wallets:{}};const keys=ledger.peerKeys ||= {};const key=`pid:${pid}`;
 const assigned=Object.hasOwn(keys,peer)?ledger.wallets[keys[peer]]:null;
 if(assigned?.ownerPid&&assigned.ownerPid!==pid)return null;
 const old=Object.hasOwn(ledger.wallets,peer)?ledger.wallets[peer]:null;
 if(old?.ownerPid&&old.ownerPid!==pid)return null;
 if(!Object.hasOwn(ledger.wallets,key)){
  ledger.wallets[key]=old||{chips:0,round:null,seq:0};
  if(old)delete ledger.wallets[peer];
 }
 const w=ledger.wallets[key];if(w.ownerPid&&w.ownerPid!==pid)return null;
 w.ownerPid=pid;keys[peer]=key;return walletFor(run,peer);
}
export function walletView(w){const r=w.round;return {chips:w.chips,seq:w.seq,...(w.ownerPid?{ownerPid:w.ownerPid}:{}),round:!r?null:(!r.kind||r.kind==='packet')?{kind:'packet',version:r.version||1,step:r.step,pot:r.pot,...(r.bet!==undefined?{bet:r.bet,reserve:r.reserve}:{})}: {kind:r.kind,version:r.version,bet:r.bet,reserve:r.reserve,player:r.player.slice(),dealer:r.kind==='blackjack'?[r.dealer[0]]:[],step:0}};}
export function houseFor(run){const ledger=run.casino13 ||= {wallets:{}};const epoch=Number.isSafeInteger(run.industry13?.shift)?run.industry13.shift:0;const house=ledger.house24 ||= {epoch,free:HOUSE_RESERVE};if(epoch>house.epoch){const locked=Object.values(ledger.wallets).reduce((n,w)=>n+(w.round?.reserve||0),0);house.epoch=epoch;house.free=Math.max(0,HOUSE_RESERVE-locked);}return house;}
function reserveFor(run,amount,game){const risk=amount*({slots:5,wheel:1,packet:7,blackjack:1,poker:1}[game]);const house=houseFor(run);if(house.free<risk)return null;house.free-=risk;return risk;}
function settle(run,w,r,kind,paid,extra={}){if(r.reserve!==undefined)houseFor(run).free+=r.reserve+r.bet-paid;w.chips+=paid;w.round=null;return {kind,paid,...extra};}
function finishBlackjack(run,w,r){while(blackjackValue(r.dealer)<17)r.dealer.push(r.deck.pop());const p=blackjackValue(r.player),d=blackjackValue(r.dealer),kind=p>21?'loss':d>21||p>d?'win':p===d?'tie':'loss';return settle(run,w,r,kind,kind==='win'?r.bet*2:kind==='tie'?r.bet:0,{player:r.player.slice(),dealer:r.dealer.slice(),playerTotal:p,dealerTotal:d});}
export function transact(run,peer,d,rand=Math.random){
 if(!run||typeof peer!=='string'||!peer||['__proto__','constructor','prototype'].includes(peer)||!d||typeof d!=='object'||!Number.isSafeInteger(run.credits)||run.credits<0)return null;
 const w=walletFor(run,peer);if(!Number.isSafeInteger(w.chips)||w.chips<0||!Number.isSafeInteger(d.seq)||d.seq!==w.seq)return null;const amount=d.amount;let result;
 if(d.action==='buy'){if(![10,25,50].includes(amount)||run.credits<amount||w.chips+amount>MAX_CHIPS)return null;run.credits-=amount;w.chips+=amount;result={kind:'bought',paid:amount};}
 else if(d.action==='redeem'){if(w.round||!Number.isSafeInteger(amount)||amount<=0||amount>w.chips||!Number.isSafeInteger(run.credits+amount))return null;w.chips-=amount;run.credits+=amount;result={kind:'redeemed',paid:amount};}
 else if(d.action==='cash'){if(w.round?.kind!=='packet')return null;const paid=w.round.pot;result=settle(run,w,w.round,'cashed',paid);}
 else if(d.action==='push'){if(w.round?.kind!=='packet'||w.round.step>=3)return null;const r=w.round,success=rand()<(r.version===1?[.65,.55,.45]:PACKET_CHANCES)[r.step];if(success){r.step++;r.pot*=2;result={kind:'safe',paid:r.pot};}else result=settle(run,w,r,'bust',0);}
 else if(d.action==='hit'||d.action==='stand'){const r=w.round;if(r?.kind!=='blackjack')return null;if(d.action==='hit'){r.player.push(r.deck.pop());const v=blackjackValue(r.player);result=v>21?settle(run,w,r,'loss',0,{player:r.player.slice(),dealer:r.dealer.slice(),playerTotal:v,dealerTotal:blackjackValue(r.dealer)}):v===21?finishBlackjack(run,w,r):{kind:'card dealt',paid:0};}else result=finishBlackjack(run,w,r);}
 else if(d.action==='draw'){const r=w.round;if(r?.kind!=='poker'||!validDiscards(d.discards))return null;for(const i of d.discards)r.player[i]=r.deck.pop();const discarded=dealerDiscards(r.dealer);for(const i of discarded)r.dealer[i]=r.deck.pop();const cmp=comparePoker(r.player,r.dealer),kind=cmp>0?'win':cmp===0?'tie':'loss';result=settle(run,w,r,kind,cmp>0?r.bet*2:cmp===0?r.bet:0,{player:r.player.slice(),dealer:r.dealer.slice(),playerRank:pokerRank(r.player)[0],dealerRank:pokerRank(r.dealer)[0],dealerDraw:discarded.length});}
 else if(d.action==='play'){
  if(w.round||!BETS.includes(amount)||w.chips<amount||!['slots','wheel','packet','blackjack','poker'].includes(d.game)||w.chips+amount*({slots:5,wheel:1,packet:7,blackjack:1,poker:1}[d.game])>MAX_CHIPS)return null;
  if(d.game==='wheel'&&!['red','black'].includes(d.choice))return null;const reserve=reserveFor(run,amount,d.game);if(reserve===null)return null;w.chips-=amount;
  if(d.game==='packet'){w.round={kind:'packet',version:2,reserve,bet:amount,step:0,pot:amount};result={kind:'started',paid:0};}
  else if(d.game==='blackjack'||d.game==='poker'){const deck=shuffledDeck(rand),n=d.game==='poker'?5:2,r={kind:d.game,version:2,reserve,bet:amount,deck,player:[],dealer:[]};for(let i=0;i<n;i++){r.player.push(deck.pop());r.dealer.push(deck.pop());}w.round=r;result={kind:'started',paid:0};if(d.game==='blackjack'){const p=blackjackValue(r.player),v=blackjackValue(r.dealer);if(p===21||v===21)result=settle(run,w,r,p===v?'tie':p===21?'win':'loss',p===v?amount:p===21?amount*2:0,{player:r.player.slice(),dealer:r.dealer.slice(),playerTotal:p,dealerTotal:v});}}
  else if(d.game==='wheel'){const n=Math.floor(rand()*37),color=n===0?'zero':n%2?'red':'black',paid=color===d.choice?amount*2:0;result=settle(run,w,{reserve,bet:amount},color,paid,{n});}
  else{const reels=Array.from({length:3},()=>Math.floor(rand()*6)),paid=amount*slotMultiplier(reels);result=settle(run,w,{reserve,bet:amount},paid?'win':'loss',paid,{reels});}
 }else return null;
 w.seq++;return {...result,wallet:walletView(w),credits:run.credits};
}
// Network view: expose balances, visible hands and reservation metadata, never hidden cards/decks.
export function casinoPublicLedger(ledger){if(!ledger)return ledger;return {...ledger,wallets:Object.fromEntries(Object.entries(ledger.wallets||{}).map(([id,w])=>[id,walletView(w)]))};}
// A migrated peer has only the public view. Refund an unfinished private card round;
// a genuine host save has its deck and resumes unchanged. Packet pots always survive.
export function recoverCasinoRounds(run){if(!run?.casino13)return false;let changed=false;for(const w of Object.values(run.casino13.wallets||{})){const r=w.round;if(r&&['blackjack','poker'].includes(r.kind)&&!Array.isArray(r.deck)){if(Number.isSafeInteger(r.bet)&&r.bet>0){w.chips+=r.bet;if(Number.isSafeInteger(r.reserve))houseFor(run).free+=r.reserve;}w.round=null;changed=true;}}return changed;}

const RUN_MESSAGES=new Set(['gs','phase','welcome','hmx','dl24end']);
export function casinoOutboundView(type,data){
 if(!RUN_MESSAGES.has(type)){
  if(type==='relay'&&RUN_MESSAGES.has(data?.m?.t)){
   const visible=casinoOutboundView(data.m.t,data.m.d);
   return visible===data.m.d?data:{...data,m:{...data.m,d:visible}};
  }
  return data;
 }
 function redact(value,depth=0){if(!value||typeof value!=='object'||depth>24)return value;let out=value;for(const[key,entry]of Object.entries(value)){const next=key==='casino13'?casinoPublicLedger(entry):redact(entry,depth+1);if(next!==entry){if(out===value)out=Array.isArray(value)?value.slice():{...value};out[key]=next;}}return out;}
 return redact(data);
}
