import assert from 'node:assert/strict';

// DOM/RTC recording fixtures, including real browser textarea semantics: a
// `value` attribute does not set a textarea's current value. This is native
// component integration, not a browser render or Internet connectivity test.
const observers=new Set();
class Node27{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.nodeType=tag?1:3;this.children=[];this.attributes=new Map();this.style={};this.listeners=new Map();this._text=text;this.disabled=false;}
 setAttribute(k,v){this.attributes.set(k,String(v));}
 appendChild(n){n.parentNode=this;this.children.push(n);return n;}
 addEventListener(k,f){this.listeners.set(k,f);}
 get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;for(const o of observers)if(o.active)o.fn([]);}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 set textContent(v){this._text=String(v);this.children=[];}
 get value(){if(this._value!==undefined)return this._value;if(this.tagName==='TEXTAREA')return this.textContent;if(this.tagName==='SELECT')return(this.children.find(n=>n.attributes.has('selected'))||this.children[0])?.value||'';return this.attributes.get('value')||'';}
 set value(v){this._value=String(v);}
 click(){return this.disabled?undefined:this.listeners.get('click')?.({stopPropagation(){}});}
}
const previous={document:globalThis.document,localStorage:globalThis.localStorage,MutationObserver:globalThis.MutationObserver,RTCPeerConnection:globalThis.RTCPeerConnection,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
const store=new Map(),timers=new Map(),pcs=[];let timerId=0,rtcMode='normal',storageDenied=false;
globalThis.document={createElement:tag=>new Node27(tag),createTextNode:s=>new Node27('',s),body:new Node27('body')};
globalThis.localStorage={getItem:key=>store.get(key)||null,setItem(key,v){if(storageDenied)throw Error('fixture denied');store.set(key,v);},removeItem(key){if(storageDenied)throw Error('fixture denied');store.delete(key);}};
globalThis.MutationObserver=class{constructor(fn){this.fn=fn;this.active=false;observers.add(this);}observe(){this.active=true;}disconnect(){this.active=false;observers.delete(this);}};
globalThis.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};globalThis.clearTimeout=id=>timers.delete(id);
globalThis.RTCPeerConnection=class{constructor(cfg){this.cfg=cfg;this.closed=false;pcs.push(this);}createDataChannel(name){this.channel=name;}createOffer(){if(rtcMode==='error')return Promise.reject(Error('fixture RTC error'));if(rtcMode==='stalled')return new Promise(()=>{});return Promise.resolve({type:'offer',sdp:'fixture'});}setLocalDescription(d){this.description=d;return Promise.resolve();}close(){this.closed=true;}};
const {networkSettings27}=await import('../../src/ui/network27.js');
const {el}=await import('../../src/core/util.js');
const {Session,NET}=await import('../../src/net/session.js');
const {setLang}=await import('../../src/core/i18n.js');setLang('en');
const walk=root=>[root,...root.children.flatMap(walk)];
const field=(root,id)=>walk(root).find(n=>n.attributes.get('data-nav')===id);
const button=(root,name)=>walk(root).find(n=>n.tagName==='BUTTON'&&n.textContent===name);
const statuses=root=>walk(root).filter(n=>n.attributes.get('role')==='status');
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function panel(net){const app={settings:{netStrategy:'nostr'},game:net?{net}:null};const ui={app,button(label,fn){return el('button',{onclick:fn},label);}};const root=networkSettings27(ui);document.body.appendChild(root);return{app,root};}
const relay={urls:['turn:saved.test:3478','turns:saved.test:443?transport=tcp'],username:'fixture-user',credential:'fixture-secret'};
try{
 assert.equal(el('textarea',{value:'attribute-only fixture'}).value,'','negative control: textarea attributes cannot substitute for the current-value property');
 store.set('tfg.turn',JSON.stringify(relay));const p=panel();
 assert.equal(field(p.root,'set:turnurl').value,relay.urls.join(', '),'saved textarea displays its actual current value');
 assert.equal(field(p.root,'set:turnuser').value,relay.username);assert.ok(field(p.root,'set:turnpass').value===relay.credential);assert.equal(field(p.root,'set:turnpass').attributes.get('type'),'password');
 const urls=field(p.root,'set:turnurl');urls.value='turn:edited.test:3478\nturns:edited.test:443?transport=tcp';button(p.root,'Save relay').click();assert.deepEqual(JSON.parse(store.get('tfg.turn')).urls,['turn:edited.test:3478','turns:edited.test:443?transport=tcp']);
 const saved=store.get('tfg.turn');urls.value='turn:valid.test:3478, https://bad.test';button(p.root,'Save relay').click();assert.equal(store.get('tfg.turn'),saved,'one invalid URL cannot replace working settings');assert.match(statuses(p.root)[1].textContent,/valid turn:/);
 urls.value=Array.from({length:9},(_,i)=>`turn:r${i}.test:3478`).join(',');button(p.root,'Save relay').click();assert.equal(store.get('tfg.turn'),saved,'UI refuses silently truncated ninth URL');
 urls.value='turn:edited.test:3478';storageDenied=true;button(p.root,'Save relay').click();assert.match(statuses(p.root)[1].textContent,/storage is unavailable/);storageDenied=false;
 const mode=field(p.root,'set:network');mode.value='mqtt';mode.listeners.get('change')();assert.equal(p.app.settings.netStrategy,'mqtt');assert.equal(JSON.parse(store.get('kefal.settings.v1')).netStrategy,'mqtt');
 const test=button(p.root,'Test relay');let pending=test.click();await flush();const first=pcs.at(-1);assert.equal(first.cfg.iceTransportPolicy,'relay');assert.equal(first.channel,'relay-check');assert.equal(test.disabled,true);assert.ok([...timers.values()].some(t=>t.ms===6500));
 first.onicecandidate({candidate:{type:'relay',candidate:'fixture relay'}});await pending;assert.equal(first.closed,true);assert.equal(test.disabled,false);assert.equal(timers.size,0);assert.equal(observers.size,0);assert.match(statuses(p.root)[1].textContent,/gameplay still needs both players/);
 rtcMode='error';await test.click();assert.equal(pcs.at(-1).closed,true);assert.equal(timers.size,0);assert.equal(observers.size,0);assert.match(statuses(p.root)[1].textContent,/No relay candidate/);rtcMode='normal';
 pending=test.click();await flush();const closing=pcs.at(-1);p.root.remove();await pending;assert.equal(closing.closed,true);assert.equal(timers.size,0);assert.equal(observers.size,0);
 // A stalled native setup promise must also respect the named 6.5-second budget.
 const timeoutPanel=panel();field(timeoutPanel.root,'set:turnurl').value='turn:timeout.test:3478';rtcMode='stalled';let finished=false;pending=button(timeoutPanel.root,'Test relay').click();pending.then(()=>{finished=true;});await flush();const timed=pcs.at(-1);for(const timer of [...timers.values()])timer.fn();await flush();assert.equal(finished,true,'RTC setup cannot escape relay-test timeout');assert.equal(timed.closed,true);assert.equal(timers.size,0);assert.equal(observers.size,0);timeoutPanel.root.remove();rtcMode='normal';
 // Real Session retry method, controlled setup timestamps, recording transport.
 const session=new Session({strategy:'nostr',isHost:true,code:'NETWORK27',profile:{id:'fixture-profile'}});let retries=0,rejoined=0;
 session.transport={strategy:'nostr',peers:new Set(),hasTurn:true,relayStatus:()=>({open:2,total:3}),linkInfo:async()=>({fixture:{ice:'connected',path:'host->relay',rtt:21}}),rejoin:async()=>{retries++;return true;}};
 session._startedAt=performance.now()-NET.FIRST_JOIN_REJOIN_MS-1;session.on('rejoined',()=>rejoined++);session.players.set('fixture',{id:'fixture',name:'Crew'});const crewBefore=JSON.stringify([...session.players]);
 const connection=panel(session);await button(connection.root,'Check connection').click();assert.match(statuses(connection.root)[0].textContent,/2\/3 reachable/);assert.match(statuses(connection.root)[0].textContent,/host->relay/);assert.ok(!statuses(connection.root)[0].textContent.includes(relay.credential),'diagnostics contain no relay credential');
 session.transport.peers.add('crew-link');await button(connection.root,'Retry connection').click();assert.equal(retries,0);assert.match(statuses(connection.root)[0].textContent,/link is active/);session.transport.peers.clear();
 session._startedAt=performance.now();await button(connection.root,'Retry connection').click();assert.equal(retries,0);assert.match(statuses(connection.root)[0].textContent,/still starting/);session._startedAt=performance.now()-NET.FIRST_JOIN_REJOIN_MS-1;
 session.transport._rejoining=true;await button(connection.root,'Retry connection').click();assert.equal(retries,0);assert.match(statuses(connection.root)[0].textContent,/already running/);session.transport._rejoining=false;
 await button(connection.root,'Retry connection').click();assert.equal(retries,1);assert.equal(rejoined,1);assert.match(statuses(connection.root)[0].textContent,/does not confirm a connection yet/);assert.equal(JSON.stringify([...session.players]),crewBefore);
 await button(connection.root,'Retry connection').click();assert.equal(retries,1,'native 30-second retry cooldown prevents repeated room restart');
 session.leaving=true;await button(connection.root,'Retry connection').click();assert.match(statuses(connection.root)[0].textContent,/Connection stopped/);connection.root.remove();
 const local=panel({transport:{strategy:'local',peers:new Set()},retryConnection:Session.prototype.retryConnection});await button(local.root,'Retry connection').click();assert.match(statuses(local.root)[0].textContent,/Local mode/);local.root.remove();
 const forget=panel();button(forget.root,'Forget relay').click();assert.equal(store.has('tfg.turn'),false);assert.equal(field(forget.root,'set:turnurl').value,'');assert.equal(field(forget.root,'set:turnpass').value,'');forget.root.remove();
 assert.equal(observers.size,0);assert.equal(timers.size,0);
}finally{for(const pc of pcs)pc.close();for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
console.log('network27 UI: actual component saved/edit validation, bounded relay success/error/close, credential-safe diagnostic and guarded native Session retry pass (DOM/RTC fixtures)');
