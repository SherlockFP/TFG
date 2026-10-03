import * as THREE from 'three';
import { t, sysMsg, onLangChange } from '../core/i18n.js';
import { el } from '../core/util.js';
import { HOST_ONLY } from '../net/session.js';
import { createAvatar } from '../models/avatar.js';
import { MOONS } from './moons.js';
import { PRODUCTS, ROBOT, industryOf, transactIndustry, completeIndustryShift } from './industry13_core.js';
import './industry13_text.js';
import { createTrading15 } from './trading15.js';
import { installWorkshop14 } from './workshop14.js';
HOST_ONLY.add('i13reply');
const ORDER_HISTORY_LIMIT = 4096;
const validOrderId = id => typeof id === 'string' && /^[A-Za-z0-9:_-]{1,64}$/.test(id);
export function installIndustry13(game) {
  const offs = [], undo = [];
  const inFlightOrders = new Set();
  let vendor = null, avatar = null, anchor = null, panel = null, live = true, pending = false, wait = null;
  let lastMessage = '', lastPanelKey = '', ticks = 0, pendingOrder = null;
  const near = id => {
    const p = game.aiPlayerById?.(id);
    return !!anchor && !!p && !p.dead && !p.downed && !p.inShip && p.pos.distanceTo(anchor) <= 4.5 && (game.run?.phase === 'company' || game.run?.phase === 'moon' || game.fleet13?.docked?.());
  };
  const trading=createTrading15(game,near);let buyPending=false,buyTimer=null;let orderSerial=0;const orderEpoch=Math.random().toString(36).slice(2,10);
  const workshop=installWorkshop14(game,{near,open,send});
  const notify = (from, key, kind='info') => game.net?.sendTo(from, 'sys', sysMsg(key, {}, kind));
  function wrap(obj, name, fn) {
    const previous = obj?.[name]; if (typeof previous !== 'function') return;
    const had = Object.hasOwn(obj, name), next = fn(previous); obj[name] = next;
    undo.push(() => { if (obj[name] === next) { if (had) obj[name] = previous; else delete obj[name]; } });
  }
  function removeVendor() {
    workshop.clear();trading.clear();
    vendor?.removeFromParent();
    avatar?.dispose?.(); avatar = null;
    vendor?.traverse(o => { if(o.isMesh && o.userData.i13owned) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
    vendor = null; anchor = null;
  }
  function buildVendor(world) {
    removeVendor(); if (!world.mapGroup && !world.company?.group && !world.outdoor?.group) return;
    const group = world.company?.group || world.outdoor?.group;
    if (!group) return;
    let xyz = world.outdoor?.vendorSpace?.pos;
    if (world.company) xyz = [20, world.company.groundY ?? -1.25, 12];
    if (!xyz) {
      if (!world.terrain?.heightAt || MOONS[game.run?.moon]?.home || MOONS[game.run?.moon]?.expedition) return;
      // Ship apron is flattened and traversable; the broker stands clear of the ramp.
      xyz = [11, world.terrain.heightAt(11, 9), 9];
    }
    vendor = new THREE.Group(); vendor.name = 'field-broker13'; vendor.position.fromArray(xyz); group.add(vendor);
    const box = (x,y,z,w,h,d,color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color})); m.position.set(x,y,z);m.userData.i13owned=true;vendor.add(m);return m; };
    box(0,-.08,0,5,.16,3.8,0x22343a);box(0,2.7,-.8,5,.2,2.7,0x48646a);
    for(const x of [-2.2,2.2])box(x,1.3,-.8,.14,2.7,.14,0x33454b);
    box(0,.55,0,3.4,1.1,.8,0x41515a);box(0,1.13,0,3.7,.08,1,0xc3aa68);
    for(const [i,c] of [[-1,0x78cab4],[0,0x929ec8],[1,0xc792c0]]){box(i,.5,-1.4,.6,.9,.6,0x26363d);box(i,.8,-1.06,.4,.15,.025,c);}
    // The workshop14 scout sits in this stationary cradle while docked.
    box(2.8,.45,-.8,.8,.1,1,0x556b72);
    for(const dx of [-.4,.4])box(2.8+dx,.3,-.8,.14,.6,.12,0x293d46);
    avatar = createAvatar({suitColor:'#759f96'});avatar.root.position.set(0,0,-1.2);vendor.add(avatar.root);
    anchor = new THREE.Vector3(xyz[0],xyz[1]+1.1,xyz[2]+.6);
    workshop.bind(vendor);trading.bind(vendor);
    if (typeof document !== 'undefined') {
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.9,.8),new THREE.MeshBasicMaterial({map:tex}));sign.position.set(0,2.42,.58);sign.userData.i13owned=true;vendor.add(sign);
      const draw=()=>{const c=canvas.getContext('2d');c.fillStyle='#132028';c.fillRect(0,0,768,128);c.fillStyle='#b0ddce';c.font='bold 34px sans-serif';c.textAlign='center';c.fillText(t('FIELD BROKER / WORKSHOP'),384,77,740);tex.needsUpdate=true;};draw();
      const off=onLangChange(draw);
      // Language observers are removed on the next map, not accumulated per landing.
      vendor.userData.i13OffLang=off;
    }
  }
  const clearVendor=()=>{vendor?.userData.i13OffLang?.();removeVendor();};
  function send(op, extra={}) {
    if(pending)return;pending=true;clearTimeout(wait);
    pendingOrder=`${orderEpoch}:${++orderSerial}`;
    wait=setTimeout(()=>{pending=false;pendingOrder=null;if(panel && game.ui.panelOpen===panel) render();},3000);
    game.net.request('i13req',{op,...extra,orderId:pendingOrder});
    render();
  }
  function render() {
    if(!panel || game.ui.panelOpen!==panel)return;
    panel.replaceChildren();const r=game.run,s=industryOf(r),body=el('div',{class:'cp-body'});
    body.append(el('p',{class:'muted'},`${t('Completed field shifts')}: ${s.shift} / ${t('Workshop bays')}: ${s.jobs.length}/3 / ${t('Customs heat')}: ${s.heat.toFixed(1)} / ▮ ${r.credits}`));
    const button=(text,fn,disabled=false)=>{const b=game.ui.button(text,fn);b.disabled=pending||disabled;return b;};
    const tools=el('div',{class:'menu-row'});tools.append(button(t('TOOLS'),()=>{game.ui.closePanel(true);game.shop.open('tools');}));body.append(tools,el('p',{class:'muted'},t('Basic tools are available now. Production uses the same crew Credits; save enough for equipment.')));
    body.append(el('h3',{},t('PRODUCTION')),el('p',{class:'muted'},t('Manufacturing advances after field missions. No offline income.')),el('p',{class:'muted'},t('Return to the physical bay for calibration and parcel collection.')));
    for(const [id,p] of Object.entries(PRODUCTS)) {
      const row=el('div',{class:'i13-row'}),info=el('div');
      info.append(el('strong',{},t(p.name)),el('p',{class:'muted'},`▮${p.cost} → ▮${p.sell} / ${p.shifts} ${t('Completed field shifts')} / ${t('Ready batches')}: ${s.goods[id]||0}`));
      row.append(info,button(t('Commission'),()=>send('produce',{product:id}),r.credits<p.cost||s.jobs.length>=3),button(t('Sell batch'),()=>send('sell',{product:id}),!s.goods[id]));body.append(row);
    }
    body.append(el('p',{class:'muted'},t('Dreamdust is fictional contraband. Higher margins, customs may seize a batch.')));
    if(s.jobs.length)body.append(el('p',{class:'muted'},s.jobs.map(j=>`${t(PRODUCTS[j.product]?.name||j.product)}: ${t('Shifts remaining')} ${Math.max(0,j.due-s.shift)}`).join(' / ')));
    body.append(el('h3',{},t('ROBOT SCOUT')));
    const targets=el('select',{class:'input'});
    for(const moon of Object.values(MOONS).filter(m=>!m.company&&!m.home&&!m.stale && (m.tier||1)<=Math.max(1,(r.quotaIndex||0)+1)))targets.append(el('option',{value:moon.id},t(moon.name)));
    const robots=el('div',{class:'i13-row'});robots.append(targets,button(`${t('Dispatch scout')} ▮${ROBOT.cost}`,()=>send('robot',{target:targets.value}),!!s.robot||!!s.report||r.credits<ROBOT.cost),button(t('Collect report'),()=>send('collect'),!s.report));body.append(robots);
    if(s.robot)body.append(el('p',{class:'muted'},`${t('Shifts remaining')}: ${Math.max(0,s.robot.due-s.shift)}`));
    if(s.report)body.append(el('p',{},`${t('Scout report')}: ${t(MOONS[s.report.target]?.name||s.report.target)} / ${t(s.report.weather)} / ▮${s.report.salvage}`));
    body.append(el('p',{class:'muted'},lastMessage),button(t('Close'),()=>game.ui.closePanel()));
    panel.append(game.ui.panelHead(t('FIELD BROKER / WORKSHOP'),`▮ ${r.credits}`),body,game.ui.panelFoot());
    lastPanelKey=JSON.stringify([r.credits,s]);
  }
  function open() {
    if(!near(game.selfId)){game.ui.toast(t('Approach the broker before ordering.'),'info');return;}
    panel=game.ui.panel('wide');panel.classList.add('i13-panel');game.ui.openPanel(panel);lastMessage='';render();
  }
  function hostRequest(d,from) {
    if(!game.isHost || !near(from)||!['produce','sell','robot','collect'].includes(d?.op))return;
    if(d?.op==='robot') {
      const m=MOONS[d.target];
      if(!m || m.company || m.home || m.stale || (m.tier||1)>Math.max(1,(game.run.quotaIndex||0)+1))return;
    }
    if(!validOrderId(d.orderId)){game.net.sendTo(from,'i13reply',{ok:false,key:'Invalid order ID. Reopen the broker and try again.'});return;}
    const ledger=industryOf(game.run),key=`${from}:i13|${d.orderId}`;
    if((ledger.orders15||[]).includes(key)){game.net.sendTo(from,'i13reply',{ok:false,key:'That order was already processed.',orderId:d.orderId});return;}
    if((ledger.orders15||[]).length+inFlightOrders.size>=ORDER_HISTORY_LIMIT){game.net.sendTo(from,'i13reply',{ok:false,key:'Order history is full. Start a new run before ordering more.',orderId:d.orderId});return;}
    const result=transactIndustry(game.run,d.op==='produce'?{...d,physical:true}:d);
    if(result.ok)ledger.orders15=[...(ledger.orders15||[]),key];
    game.broadcastRun(['credits','industry13']);game.hostSave?.();
    game.net.sendTo(from,'i13reply',{...result,orderId:d.orderId});
  }
  offs.push(game.mods.on('mapLoaded',world=>{clearVendor();buildVendor(world);}));
  offs.push(game.mods.on('interactables',(out,g)=>{if(g===game && anchor)out.push({pos:anchor,r:.55,reach:3.8,label:t('Talk to the field broker [E]'),action:open});}));
  offs.push(game.mods.on('registerHandlers',(H,g)=>{if(g===game)H('i13req',hostRequest);}));
  const netReady=net=>net.on_('i13reply',d=>{if(!pendingOrder||d?.orderId!==pendingOrder)return;clearTimeout(wait);pending=false;pendingOrder=null;lastMessage=t(d.key||'');render();});
  offs.push(game.mods.on('netReady',netReady));if(game.net)netReady(game.net);
  wrap(game,'unloadMap',previous=>function(...args){clearVendor();return previous.apply(this,args);});
  // Block all terminal/cart purchases away from a living physical trader, including direct requests.
  wrap(game.shop,'buy',previous=>function(lines){if(buyPending)return;buyPending=true;clearTimeout(buyTimer);buyTimer=setTimeout(()=>{buyPending=false;},5000);game.net.request('term',{cmd:{op:'cart',lines,orderId:`${orderEpoch}:${++orderSerial}`}});});
  wrap(game.shop,'hostCart',previous=>function(cmd,from,reply){
    const fail=message=>{reply(t(message),true);notify(from,message);game.net.sendTo(from,'fx',{k:'sh',t:'shopres',ok:false,msg:t(message)});};
    if(!near(from))return fail('Approach the broker before ordering.');
    if(!validOrderId(cmd?.orderId))return fail('Invalid order ID. Reopen the broker and try again.');
    const key=from+':'+cmd.orderId,ledger=industryOf(game.run);
    if(inFlightOrders.has(key)||(ledger.orders15||[]).includes(key))return fail('That order was already processed.');
    if((ledger.orders15||[]).length+inFlightOrders.size>=ORDER_HISTORY_LIMIT)return fail('Order history is full. Start a new run before ordering more.');
    inFlightOrders.add(key);
    const finish=(msg,err)=>{
      if(!err&&!(ledger.orders15||[]).includes(key)){
        ledger.orders15=[...(ledger.orders15||[]),key];inFlightOrders.delete(key);game.broadcastRun(['industry13']);game.hostSave?.();
      }
      reply(msg,err);
    };
    try{return previous.call(this,cmd,from,finish);}finally{inFlightOrders.delete(key);}
  });
  wrap(game.shop,'open',previous=>function(...args){if(!near(game.selfId)){game.ui.toast(t('Meet a field broker to buy supplies. The ship terminal is now a route console.'),'info');return;}return previous.apply(this,args);});
  wrap(game.terminal,'hostExecute',previous=>function(cmd,from){if(['buy','cart','upgrade','van'].includes(cmd?.op)&&!near(from)){notify(from,'Approach the broker before ordering.');return;}return previous.call(this,cmd,from);});
  offs.push(game.mods.on('fx',d=>{if(d?.k==='sh'&&d.t==='shopres'){buyPending=false;clearTimeout(buyTimer);}}));
  // Fault repairs can call a captured original takeoff and bypass outer wrappers.
  // Record the actual phase transition in shared/saveable state, including migration.
  offs.push(game.mods.on('phase',(phase,g)=>{
    if(g!==game || !game.isHost || !game.run)return;
    const r=game.run,s=industryOf(r),m=MOONS[r.moon];
    if(phase==='takeoff') {
      s.departure=m&&!m.company&&!m.home?{runId:r.runId,moon:m.id,day:r.day}:null;
      game.broadcastRun(['industry13']);game.hostSave?.();return;
    }
    if(phase!=='orbit') {if(phase==='moon'||phase==='company'||phase==='fired')delete s.departure;return;}
    const d=s.departure;delete s.departure;if(!d)return;
    if(r.runId!==d.runId || r.day<=d.day)return;
    completeIndustryShift(game.run,d.moon,d.day);game.broadcastRun(['industry13']);game.hostSave?.();
  }));
  offs.push(game.mods.on('update',(dt,g)=>{if(g!==game||!live)return;trading.sync();ticks+=dt;avatar?.update?.(dt,{speed:0});if(ticks<.25)return;ticks=0;if(panel&&game.ui.panelOpen===panel){if(!near(game.selfId)){game.ui.closePanel();panel=null;}else if(lastPanelKey!==JSON.stringify([game.run?.credits,game.run?.industry13]))render();}}));
  if(typeof document!=='undefined') {
    const style=el('style',{},'.i13-panel{max-height:88vh}.i13-panel .cp-body{font-size:18px}.i13-panel h3{margin:14px 0 5px}.i13-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #38464a}.i13-row>div{flex:1}.i13-row p{margin:3px 0}.i13-row button{font-size:15px;padding:7px 10px}.i13-row select{min-width:120px;max-width:240px}');document.head.append(style);undo.push(()=>style.remove());
  }
  return {open,near,workshop,trading,deliveryPlanFor(from,types){return trading.plan(from,types);},deliveryFor(from,index=0){if(!near(from))return null;return anchor.clone().add(new THREE.Vector3((index%3-1)*.45,-.5,.9+Math.floor(index/3)*.4));},get anchor(){return anchor;},get state(){return game.run?industryOf(game.run):null;},dispose(){live=false;workshop.dispose();trading.dispose();clearTimeout(wait);clearTimeout(buyTimer);clearVendor();offs.forEach(f=>f?.());undo.reverse().forEach(f=>f());}};
}
