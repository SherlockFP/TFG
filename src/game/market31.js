// Phish Dayi purchases: one host decision, native wallet/profile and held items.
// Personal reward earning remains peer-owned. The host trusts one initial saved
// profile, then retains its purchase ledger; repeated snapshots cannot refill it.
import * as THREE from 'three';
import { MARKET } from './progression.js';
import { ITEMS } from './items.js';
import { saveProfile } from '../core/save.js';
import { t, addTranslations } from '../core/i18n.js';
import { cloutOpenOf } from './wallet.js';

const REASONS = {
  disconnected: 'Market unavailable: connection to the host lost.',
  funds: 'Not enough money.', full: 'Inventory full. [I] to make room.',
  level: 'Your level is too low.', owned: 'Already owned.',
  unavailable: 'Black Market is unavailable here.', blocked: 'Cannot reach Phish Dayı.',
  profile: 'Market profile is not ready.', invalid: 'Invalid market order.',
  delivery: 'Delivery failed. You were not charged.',
  stopped: 'Session ended before the market receipt arrived.',
};
addTranslations({
  'Not enough money.':'Yeterli paran yok.', 'Your level is too low.':'Seviyen yeterli değil.',
  'Already owned.':'Zaten sahipsin.', 'Black Market is unavailable here.':'Karaborsa burada kullanılamıyor.',
  'Cannot reach Phish Dayı.':'Phish Dayı’ya erişilemiyor.', 'Market profile is not ready.':'Karaborsa profili hazır değil.',
  'Invalid market order.':'Geçersiz karaborsa siparişi.', 'Delivery failed. You were not charged.':'Teslimat başarısız. Para kesilmedi.',
  'Market unavailable: connection to the host lost.':'Karaborsa kullanılamıyor: sunucuyla bağlantı kesildi.',
  'Session ended before the market receipt arrived.':'Karaborsa makbuzu gelmeden oturum sona erdi.',
  'Waiting for host approval…':'Sunucu onayı bekleniyor…', 'Bought and delivered.':'Satın alındı ve teslim edildi.',
  'Owned and equipped.':'Sahip olundu ve kuşanıldı.', 'Bought. Select it in Character to wear it.':'Satın alındı. Giymek için Karakter menüsünden seç.',
  'Money: ◈ {coins}':'Para: ◈ {coins}', 'Buy · ◈ {price}':'Satın al · ◈ {price}',
}, 'tr');
addTranslations({
  'Not enough money.':'Недостаточно денег.', 'Your level is too low.':'Недостаточный уровень.',
  'Already owned.':'Уже приобретено.', 'Black Market is unavailable here.':'Чёрный рынок здесь недоступен.',
  'Cannot reach Phish Dayı.':'Нет доступа к Фиш Дайы.', 'Market profile is not ready.':'Профиль рынка ещё не готов.',
  'Invalid market order.':'Недействительный заказ.', 'Delivery failed. You were not charged.':'Доставка не удалась. Деньги не списаны.',
  'Market unavailable: connection to the host lost.':'Рынок недоступен: соединение с хостом потеряно.',
  'Session ended before the market receipt arrived.':'Сессия завершилась до получения квитанции.',
  'Waiting for host approval…':'Ожидание одобрения хоста…', 'Bought and delivered.':'Куплено и доставлено.',
  'Owned and equipped.':'Куплено и экипировано.', 'Bought. Select it in Character to wear it.':'Куплено. Выберите в меню персонажа.',
  'Money: ◈ {coins}':'Деньги: ◈ {coins}', 'Buy · ◈ {price}':'Купить · ◈ {price}',
}, 'ru');
export const marketFailure31 = reason => t(REASONS[reason] || REASONS.invalid);
const entryFor = id => {
  for (const [kind, entries] of Object.entries(MARKET)) {
    const entry = entries.find(e => e.id === id);
    if (entry) return { ...entry, kind };
  }
  return null;
};
const snapshot = p => ({ id:p.id, coins:p.coins, level:p.level,
  owned:[...(p.owned || [])], loadout:{...p.loadout},
  cosmetics:{suits:[...(p.cosmetics?.suits || [])], hats:[...(p.cosmetics?.hats || [])]} });
const owns = (p,e) => e.kind === 'cosmetics'
  ? p.cosmetics[e.id.split(':')[0] === 'suit' ? 'suits':'hats'].includes(e.id.split(':')[1])
  : p.owned.includes(e.id);
function grant(p,e) {
  if (e.kind === 'cosmetics') {
    const [kind,id]=e.id.split(':');p.cosmetics[kind === 'suit' ? 'suits':'hats'].push(id);
  } else {
    p.owned.push(e.id);p.loadout[e.kind === 'weapons' ? 'weapon':e.slot]=e.id;
  }
}

export function installMarket31(game, net = game.net) {
  if (!net) return null;
  game.market31?.dispose?.();
  const ledgers=new Map(), pending=new Map(), applied=new Set(), activeProfiles=new Set(), offs=[];
  const epoch=crypto.randomUUID();
  let sequence=0, paid=0, paidRun=null, ledgerRun=null, disposed=false;
  const runKey=()=>String(game.run?.runId || net.code);
  const preparePaid=()=> {
    if(paidRun === runKey())return;
    for(const order of pending.values()){clearTimeout(order.timer);game._timers?.delete(order.timer);order.resolve({ok:false,reason:'stopped'});}pending.clear();
    paidRun=runKey();paid=game.profile.market31Receipt?.runId === paidRun ? game.profile.market31Receipt.paid || 0:0;
  };
  const savePaid=()=>{game.profile.market31Receipt={runId:paidRun,paid};saveProfile(game.profile);};
  const persist=()=> {
    const entries=new Map((game.run.market31?.entries || []).map(e=>[e.pid,e]));
    for(const [pid,l]of ledgers)entries.set(pid,{pid,p:l.p,initial:l.initial,earned:l.earned,spent:l.spent,receipts:[...l.receipts]});
    game.run.market31={v:1,entries:[...entries.values()].slice(-64)};
    game.hostSave?.();
    // Approval state must reach migration candidates before the buyer sees its
    // receipt; the generic run sync's later tick is too late for that boundary.
    game.broadcastRun?.(['market31']);net.flush?.();
  };
  const connected=()=>!disposed && !game.destroyed && net.connected && !net.leaving && (net.isHost || !net.lost?.has(net.hostId));
  const profileOf=(d,from)=> {
    if(ledgerRun !== runKey()){ledgers.clear();ledgerRun=runKey();}
    const p=from === game.selfId ? snapshot(game.profile):d.profile;
    const pid=from === game.selfId ? game.profile.id:net.players.get(from)?.pid;
    if (!p || typeof pid !== 'string' || p.id !== pid || !Number.isFinite(p.coins) || p.coins < 0) return null;
    if (!ledgers.has(pid)) {
      const saved=game.run?.market31?.entries?.find(e=>e.pid === pid);
      // As with the initial saved profile, an absent run ledger trusts only the
      // peer's acknowledged spend baseline. It creates no money or approvals:
      // current coins/ownership remain exactly those in that native profile.
      const acknowledged=Number.isSafeInteger(d.paid) && d.paid >= 0 && Number.isSafeInteger(p.coins+d.paid) ? d.paid:0;
      ledgers.set(pid,saved ? {...saved,p:snapshot(saved.p),receipts:new Map(saved.receipts)}:{p:snapshot(p),initial:p.coins+acknowledged,earned:0,spent:acknowledged,receipts:new Map()});
    }
    const ledger=ledgers.get(pid);
    // Native local rewards have not been moved to the host in this wave.
    if (from === game.selfId) ledger.p.coins=game.profile.coins;
    ledger.p.level=from === game.selfId ? game.profile.level:(game.remotes.get(from)?.level || net.players.get(from)?.level || 1);
    return ledger;
  };
  const hostBuy=(d,from)=> {
    if (!net.isHost || disposed || !net.players.has(from) || typeof d?.rid !== 'string' || d.rid.length > 120) return;
    const reply=result=>net.sendTo(from,'market31receipt',{rid:d.rid,id:d.id,runId:d.runId,...result});
    if(d.runId !== runKey()){reply({ok:false,reason:'invalid'});return;}
    const ledger=profileOf(d,from);
    if (!ledger) {reply({ok:false,reason:'profile'});return;}
    if (ledger.receipts.has(d.rid)) {reply(ledger.receipts.get(d.rid));return;}
    // ItemManager broadcasts synchronously to native callbacks. A nested replay
    // must wait for this transaction's committed receipt, rather than observe
    // its partially delivered item and race an "owned" failure to the buyer.
    const transactionKey=ledger.p.id;
    if(activeProfiles.has(transactionKey))return;
    activeProfiles.add(transactionKey);
    try {
    const remember=result=> {
      ledger.receipts.set(d.rid,result);
      if(ledger.receipts.size>128)for(const [rid,r]of ledger.receipts){if(!r.ok){ledger.receipts.delete(rid);break;}}
      persist();
    };
    const fail=reason=>{const r={ok:false,reason};remember(r);reply(r);};
    if (d.paid < ledger.spent) {
      net.sendTo(from,'market31state',{runId:runKey(),spent:ledger.spent,p:ledger.p,receipts:[...ledger.receipts].filter(([,r])=>r.ok)});return;
    }
    if (d.paid !== ledger.spent) {fail('profile');return;}
    if (from !== game.selfId) {
      // Rewards are already peer-owned in the native Progress API. Reconcile
      // growth only against a snapshot acknowledging every host-approved debit;
      // an older pre-debit balance cannot masquerade as newly earned money.
      ledger.earned=Math.max(ledger.earned,d.profile.coins+d.paid-ledger.initial);
      ledger.p.coins=ledger.initial+ledger.earned-ledger.spent;
    }
    const e=entryFor(d.id), p=ledger.p;
    if (!e) {fail('invalid');return;}
    const player=from === game.selfId ? game.player:game.remotes.get(from);
    const pos=from === game.selfId ? player?.pos:(player?.lastState?.p ? new THREE.Vector3().fromArray(player.lastState.p):player?.target || player?.pos);
    const counter=game.world?.company?.interactables?.find(i=>i.type === 'market');
    if (net.lost?.has(from) || game.run?.phase !== 'company' || !counter || player?.dead || player?.downed || !cloutOpenOf(game) || game.deadletter24?.active?.()) {fail('unavailable');return;}
    const eye=pos?.clone().add(new THREE.Vector3(0,1.4,0));
    if (!eye || eye.distanceTo(counter.pos)>4.2 || !game.physics?.lineOfSight(eye,counter.pos)) {fail('blocked');return;}
    if (owns(p,e)) {fail('owned');return;}
    if (p.level < (e.minLevel || 1)) {fail('level');return;}
    if (p.coins < e.coin) {fail('funds');return;}
    let itemId=null;
    if (e.kind === 'weapons') {
      if([...game.items.all()].some(it=>it.soulbound === p.id && it.type === e.id)) {fail('owned');return;}
      const held=[...game.items.all()].filter(it=>it.holder === from && !it.inv);
      const max=Math.min(6,(game.config?.inventorySlots || 4)+(p.loadout.perk === 'packmule' ? 1:0));
      const inv=held.length >= max ? game.inventory?.hostPlaceFor?.(from,ITEMS[e.id],'bag'):null;
      if (held.length >= max && !inv) {fail('full');return;}
      try {
        itemId=game.items.hostSpawn(e.id,pos.clone().add(new THREE.Vector3(0,1,0)),{holder:from,soulbound:p.id,inv:inv || undefined,value:0});
        const item=game.items.get(itemId);
        if (!item || item.holder !== from || item.soulbound !== p.id || (inv && !item.inv)) throw new Error('undelivered');
      } catch {
        if (itemId) net.broadcast('it',{e:'rm',id:itemId});
        fail('delivery');return;
      }
    }
    p.coins-=e.coin;ledger.spent+=e.coin;grant(p,e);
    const result={ok:true,id:e.id,cost:e.coin,itemId,kind:e.kind};
    remember(result);reply(result);
    } finally {activeProfiles.delete(transactionKey);}
  };
  const receive=(d,from)=> {
    if (disposed || from !== net.hostId || d?.runId !== runKey() || typeof d?.rid !== 'string') return;
    const order=pending.get(d.rid);
    if (!order || order.id !== d.id) return;
    if (d.ok) {
      const e=entryFor(d.id);
      if (!e || d.cost !== e.coin || (e.kind === 'weapons' && !d.itemId)) return;
      if (!applied.has(d.rid)) {
        preparePaid();
        game.profile.coins=Math.max(0,game.profile.coins-e.coin);
        paid+=e.coin;
        if (!owns(game.profile,e)) grant(game.profile,e);
        applied.add(d.rid);savePaid();game.refreshStats?.();
        game.ui?.hud?.setCoins?.(game.profile.coins,-e.coin);
      }
    }
    clearTimeout(order.timer);game._timers?.delete(order.timer);pending.delete(d.rid);order.resolve(d);
  };
  const reconcile=(d,from)=> {
    if(disposed || from !== net.hostId || d?.runId !== runKey() || d?.p?.id !== game.profile.id || !Number.isFinite(d.spent) || d.spent < 0)return;
    preparePaid();if(d.spent < paid)return;
    game.profile.coins=Math.max(0,game.profile.coins-(d.spent-paid));paid=d.spent;
    for(const id of [...d.p.owned,...d.p.cosmetics.suits.map(id=>'suit:'+id),...d.p.cosmetics.hats.map(id=>'hat:'+id)]) {
      const e=entryFor(id);if(e && !owns(game.profile,e))grant(game.profile,e);
    }
    savePaid();game.refreshStats?.();game.ui?.hud?.setCoins?.(game.profile.coins,0);
    for(const [rid,order]of pending) {
      const receipt=d.receipts?.find(([,r])=>r.id === order.id);
      if(receipt) {clearTimeout(order.timer);game._timers?.delete(order.timer);pending.delete(rid);order.resolve({...receipt[1],ok:true});}
      else {order.paid=paid;order.profile=snapshot(game.profile);}
    }
    resend();
  };
  net.handle('market31buy',hostBuy);net.on_('market31receipt',receive);net.on_('market31state',reconcile);
  const resend=()=>{preparePaid();if (connected()) for(const [rid,order] of pending) net.request('market31buy',{rid,id:order.id,runId:order.runId,profile:order.profile,paid:order.paid});};
  offs.push(net.on('ready',resend),net.on('peerResume',resend));
  offs.push(net.on('peerLost',id=>{if(id === net.hostId && pending.size)game.ui?.toast?.(marketFailure31('disconnected')+' '+t('Waiting for host approval…'),'bad');}));
  const api={
    pending:id=>[...pending.values()].some(p=>p.id === id),
    buy(id) {
      preparePaid();
      const existing=[...pending.values()].find(p=>p.id === id);if(existing)return existing.promise;
      // A single in-flight purchase keeps its acknowledged debit sequence clear.
      if (!connected()) return Promise.resolve({ok:false,reason:'disconnected'});
      if(pending.size)return Promise.resolve({ok:false,reason:'profile'});
      const rid=`${epoch}:${++sequence}`;
      let resolve;const promise=new Promise(r=>resolve=r);
      const order={id,runId:runKey(),profile:snapshot(game.profile),paid,resolve,promise};pending.set(rid,order);
      net.request('market31buy',{rid,id,runId:order.runId,profile:order.profile,paid});
      if(pending.has(rid))order.timer=game.later?.(()=> {
        if(!pending.has(rid) || disposed)return;
        game.ui?.toast?.(t('Waiting for host approval…'),'info');resend();
      },10000);
      return promise;
    },
    dispose() {
      if(disposed)return;disposed=true;for(const off of offs)off?.();
      if(net.handlers.get('market31buy')===hostBuy)net.handlers.delete('market31buy');
      if(net.msgHandlers.get('market31receipt')===receive)net.msgHandlers.delete('market31receipt');
      if(net.msgHandlers.get('market31state')===reconcile)net.msgHandlers.delete('market31state');
      for(const order of pending.values()){clearTimeout(order.timer);game._timers?.delete(order.timer);order.resolve({ok:false,reason:'stopped'});}pending.clear();
      if(game.market31 === api)game.market31=null;
    },
  };
  game.market31=api;return api;
}
