// An optional, isolated co-op combat expedition. Campaign items are checkpointed,
// never sold/copied into this mode. All progression below is temporary host state.
import * as THREE from 'three';
import {generateLayout,buildFacility,FACILITY_Y} from '../world/facility.js';
import {deadletter24Cabinet,deadletter24RareCase} from './deadletter24_view.js';
import {getBasicMaterial} from '../render/textures.js';
import {MOONS} from './moons.js';
import {registerItem} from './items.js';
import {WEAPON_MODELS} from '../models/weapons_wave1.js';
import {G,RAPIER,groups} from '../physics/physics.js';
import {HOST_ONLY} from '../net/session.js';
import {RNG,hashString} from '../core/rng.js';
import {t,addTranslations,tf} from '../core/i18n.js';
import {installDeadletter24Draft} from '../ui/deadletter24.js';
import {newProgress,gainXp,nextOffer,chooseCard,effects,xpThreshold} from './deadletter24_core.js';
import {DL24_TYPES,registerDeadletter24Actors,createDeadletter24Projectiles} from './deadletter24_combat.js';
HOST_ONLY.add('dl24fx');HOST_ONLY.add('dl24end');
export const DL24_GEAR='dl24_cards';
const THEMES=['deadletter24','mutedswitch24','permissions24'];
MOONS.deadletter24={id:'deadletter24',name:'Dead Letter Run',short:'Dead Letter',biome:'pier',interior:'deadletter24',size:.8,danger:1,instance:true,deadletter:true,creatures:{},scrap:[]};
registerItem({id:DL24_GEAR,name:'Archive Card Stack',kind:'tool',hands:1,weight:0,wfire:'dl24',noAffix:true,showLabel:false,price:0,tip:'LMB: throw archive slips. R: select return / bounce / quarantine. Temporary expedition equipment.'});
const TEXT={start:'Enter Dead Letter Run [E]',sub:'Separate combat expedition. Campaign cargo and money stay safe.',exit:'Exit Dead Letter Run [E]',next:'Descend together [E]',draft:'Choose your level card [E]',loot:'Collect rare Double Stamp [E]',clear:'Floor cleared. Choose cards, then descend or exit.',intro:'DEAD LETTER RUN',returnSlip:'Returning slip',bounceSlip:'Bouncing copy',slowSlip:'Quarantine slip',level:'Level {n} · XP {xp}/{goal}',introStage:'Archive entry',waveStage:'Sorting wave',bossIntroStage:'Warden approaching',bossStage:'Return Warden',clearedStage:'Floor cleared',auto:'Choose within 45s; otherwise the first card is assigned.',ready:'LMB: throw. R: select special. Every level gives three personal upgrades.',crew:'All living crew must stand near the descent cabinet; recover downed crew first.',paused:'Upgrade break: enemies paused. Choose one of three cards.',invalid:'The archive cannot open safely here.',wipe:'Crew lost. Campaign checkpoint restored.',return:'Dead Letter Run ended. Campaign checkpoint restored.'};
addTranslations({[TEXT.start]:'Dead Letter Run’a gir [E]',[TEXT.sub]:'Ayrı savaş seferi. Ana oyun yükü ve para güvende.',[TEXT.exit]:'Dead Letter Run’dan çık [E]',[TEXT.next]:'Birlikte aşağı in [E]',[TEXT.draft]:'Seviye kartını seç [E]',[TEXT.loot]:'Nadir Çift Baskıyı al [E]',[TEXT.clear]:'Kat temizlendi. Kart seç, aşağı in veya çık.',[TEXT.intro]:'İADE POSTA SEFERİ',[TEXT.ready]:'LMB: atış. R: özel fiş seç. Her seviye üç kişisel gelişim verir.',[TEXT.crew]:'Yaşayan ekip iniş kabininin yanında olsun; önce düşeni kaldır.',[TEXT.paused]:'Gelişim arası: yaratıklar durdu. Üç karttan birini seç.',[TEXT.invalid]:'Arşiv burada güvenli açılamıyor.',[TEXT.wipe]:'Ekip kaybedildi. Ana oyun kaydı geri yüklendi.',[TEXT.return]:'Dead Letter Run bitti. Ana oyun kaydı geri yüklendi.'},'tr');
addTranslations({[TEXT.start]:'Войти в Dead Letter Run [E]',[TEXT.sub]:'Отдельный боевой поход. Груз и деньги кампании сохранены.',[TEXT.exit]:'Выйти из Dead Letter Run [E]',[TEXT.next]:'Спуститься вместе [E]',[TEXT.draft]:'Выбрать карту уровня [E]',[TEXT.loot]:'Забрать редкую двойную печать [E]',[TEXT.clear]:'Этаж очищен. Выберите карты, спуститесь или выйдите.',[TEXT.intro]:'НЕВРУЧЁННЫЕ ПИСЬМА',[TEXT.ready]:'ЛКМ: бросок. R: особая карта. Каждый уровень даёт три улучшения.',[TEXT.crew]:'Живая команда должна собраться у спуска; сначала поднимите раненых.',[TEXT.paused]:'Пауза улучшений: враги остановлены. Выберите одну карту.',[TEXT.invalid]:'Здесь нельзя безопасно открыть архив.',[TEXT.wipe]:'Команда потеряна. Состояние кампании восстановлено.',[TEXT.return]:'Поход окончен. Состояние кампании восстановлено.'},'ru');
addTranslations({'Returning slip':'İade fişi','Bouncing copy':'Seken kopya','Quarantine slip':'Karantina fişi','Level {n} · XP {xp}/{goal}':'Seviye {n} · XP {xp}/{goal}','Archive entry':'Arşiv girişi','Sorting wave':'Tasnif dalgası','Warden approaching':'Denetçi yaklaşıyor','Return Warden':'İade Denetçisi','Floor cleared':'Kat temizlendi','Choose within 45s; otherwise the first card is assigned.':'45 sn içinde seç; yoksa ilk kart atanır.'},'tr');
addTranslations({'Returning slip':'Обратный лист','Bouncing copy':'Отскакивающая копия','Quarantine slip':'Карантинный лист','Level {n} · XP {xp}/{goal}':'Уровень {n} · XP {xp}/{goal}','Archive entry':'Вход в архив','Sorting wave':'Волна сортировки','Warden approaching':'Страж приближается','Return Warden':'Страж возврата','Floor cleared':'Этаж очищен','Choose within 45s; otherwise the first card is assigned.':'Выберите за 45 с; иначе назначается первая карта.'},'ru');
const copy=v=>JSON.parse(JSON.stringify(v));
const V=(p)=>new THREE.Vector3(p.x,p.y,p.z);
export function installDeadletter24(game){
 let disposed=false,building=false,built='',fac=null,bound=null,readyFrames=0,pauseClock=0,autoShown='',statsKey='',statsCopy=null,localSeq=0,mainCheckpoint=null,localCheckpoint=null,cabinet=null,rareCase=null,checkpointToken='',restoredToken='';const offs=[],shots=new Map(),seqs=new Map();
 const actorRegistryDispose=registerDeadletter24Actors(game);
 const registry=(typeof window!=='undefined'?window.__kefalMods?.itemModels:null)||game.mods?.itemModels;const previousGear=registry?.get(DL24_GEAR),gearFactory=()=>{const m=WEAPON_MODELS.stackeddeck();const aura=m.userData.deck?.aura;if(aura){m.traverse(o=>{if(o.material===aura)o.material=getBasicMaterial(null,0xffffff,{transparent:true,opacity:0,depthWrite:false});});aura.dispose();}return m;};registry?.set(DL24_GEAR,gearFactory);
 const active=()=>!disposed&&game.run?.phase==='deadletter'&&!!game.run.deadletter24?.token;
 const state=()=>active()?game.run.deadletter24:null;
 const participants=()=>game.aiPlayers?.().filter(p=>state()?.players[p.id])||[];
 const living=()=>participants().filter(p=>!p.dead);
 const down=p=>!!p.downed||!!game.downed?.isDowned?.(p.id);
 const combatPaused=()=>active()&&!living().some(down)&&living().some(p=>state().players[p.id].pending>0);
 const ownsCreature=c=>!!c?.data?.dl24Token&&c.data.dl24Token===state()?.token;
 const publish=()=>{if(active())game.broadcastRun?.(['deadletter24']);};
 const warn=key=>game.ui?.toast?.(t(key),'info');
 const fx=d=>game.net?.broadcast?.('dl24fx',{token:state()?.token,rev:state()?.floorRev,...d});
 const projectiles=createDeadletter24Projectiles(game,{ownsCreature,send:fx,damage(c,p){const critical=new RNG(hashString(`${state()?.token}:${state()?.floorRev}:${p.id}:${c.id}`)).float()<p.crit;let dmg=Math.round(19*p.power*(critical?p.critDamage:1));game.creatures.damage(c.id,Math.min(60,dmg),p.owner,{crit:critical,stun:0});if(!c.dead&&p.kind==='slow'){c.data.slowUntil=game.time+2;c.def.run=Math.max(1,c.data.baseSpeed*.55);}}});
 function anchor(){const a=fac?.lab?.arena;return a?new THREE.Vector3(a.x,FACILITY_Y+1.1,a.z+Math.min(4,a.h/2-2)+.45):null;}
 function clearActors(){projectiles.clear();for(const c of [...(game.creatures?.host?.values?.()||[])])game.creatures.hostRemove(c.id);game.creatures?.clearAll?.();}
 function clearItems(){for(const it of [...(game.items?.all?.()||[])])game.items.onEvent({e:'rm',id:it.id});}
 function removeMap(){rareCase?.dispose();rareCase=null;cabinet?.dispose();cabinet=null;const previous=fac;fac=null;built='';readyFrames=0;projectiles.clear();if(previous){if(game.world.facility===previous)game.world.facility=null;previous.dispose(game.physics);}}
 function loadMapFor(run){if(run?.phase!=='deadletter'||!run.deadletter24)return false;
  const st=run.deadletter24,key=`${st.token}:${st.floorRev}`;if(building||key===built)return true;building=true;let failure=null;
  try{
  if(!mainCheckpoint){mainCheckpoint=st.backup;const ids=new Set(st.backup.items.map(it=>it.id));localCheckpoint={slots:(game.player?.slots||[]).map(id=>ids.has(id)?id:null),slot:game.player?.slot||0,stamina:game.player?.stamina??100};}checkpointToken=st.token;
  clearActors();clearItems();removeMap();game.unloadMap?.();
  const layout=generateLayout(hashString(`${st.seed}:${st.floor}`),THEMES[st.floor%3],.8);fac=buildFacility(layout,{physics:game.physics,lightPool:game.lights});
   if(!fac.lab?.arena||!fac.lab.spawnSpots?.length)throw Error('missing certified archive arena');
   game.world.facility=fac;game.world.moonId='deadletter24';game.world.seed=st.seed;game.scene?.add(fac.group);game.env&&(game.env.interiorFog=fac.atmosphere||null);built=key;readyFrames=0;game.mapT=1;
   const a=anchor();cabinet=deadletter24Cabinet(game,a);fac.nav.blockBox(a.x-1.34,a.z-.84,a.x+1.34,a.z-.03,.25);if(game.player&&!game.player.dead){game.player.teleport(a.clone().setY(FACILITY_Y+.02).add(new THREE.Vector3(0,0,2.4)),0);game.player.indoor=true;game.player.inShip=false;game.player.slot=0;game.player.hp=Math.min(game.stats?.maxHp||100,100+(effects(st.players?.[game.selfId]?.build).health||0));}
   st.stage=st.stage||'intro';if(game.isHost){for(const id of Object.keys(st.players))game.items?.hostSpawn?.(DL24_GEAR,a.clone(),{holder:id,soulbound:true,label:`${st.token}:${st.floorRev}`,value:0});}
  }catch(e){failure=e;try{removeMap();}catch(cleanup){console.warn('[deadletter24] floor cleanup',cleanup);}}finally{building=false;}
  if(failure){if(game.isHost)end('invalid');else warn(TEXT.invalid);console.warn('[deadletter24] floor build',failure);}
  return true;
 }
 function onState(){if(building)return;if(!active()){if(game.run?.deadletter24==null)delete game.run.deadletter24;autoShown='';statsKey='';return;}checkpointToken=state().token;loadMapFor(game.run);if(!active()||building)return;syncStats();if(state()?.pickup&&!state().pickup.claimed&&!rareCase)rareCase=deadletter24RareCase(game,new THREE.Vector3().fromArray(state().pickup.p));else if(rareCase&&(!state()?.pickup||state().pickup.claimed)){rareCase.dispose();rareCase=null;}const pr=state().players?.[game.selfId];
  if(pr?.offer&&combatPaused()&&!game.player?.dead){const key=`${state().token}:${pr.offer.nonce}:${pr.offer.floor}`;if(autoShown!==key&&draft?.openDraft({offer:pr.offer,build:pr.build,onChoose:c=>request('choose',c)}))autoShown=key;}
 }
 const draft=typeof document!=='undefined'&&game.ui?.openPanel?installDeadletter24Draft(game):null;
 function syncStats(){const key=JSON.stringify(state()?.players?.[game.selfId]?.build||{});if(key!==statsKey){statsKey=key;statsCopy=null;game.refreshStats?.();}}
 function stats(base){if(!active())return base;const e=effects(state().players?.[game.selfId]?.build);if(!statsCopy||statsCopy._source!==base)statsCopy={...base,_source:base,maxHp:100+e.health,maxStamina:100,speedMul:e.speed,armor:0};return statsCopy;}
 function playerDamage(id,dmg){return Math.max(1,Math.round(Math.min(40,Math.max(0,dmg))*(1-effects(state()?.players?.[id]?.build).reduction)));}
 function reachable(from,pos,range=2.8){const p=game.aiPlayerById?.(from);if(!p||p.dead||down(p)||!pos||p.pos.distanceTo(pos)>range)return false;return !game.physics?.raycast?.(p.eye||p.pos,pos.clone().sub(p.eye||p.pos).normalize(),Math.max(0,pos.distanceTo(p.eye||p.pos)-.15),G.STATIC|G.DOOR);}
 function entryPoint(){return game.ship?.points?.terminal?.clone().add(new THREE.Vector3(.85,0,0))||game.ship?.spawns?.[0]?.clone().add(new THREE.Vector3(.8,1.1,0))||new THREE.Vector3(1,1.1,0);}
 function snapshot(){const ps={};for(const p of game.aiPlayers?.()||[])ps[p.id]={p:p.pos.toArray(),yaw:p.id===game.selfId?game.player.yaw:game.remotes?.get(p.id)?.yaw||0,hp:p.id===game.selfId?game.player.hp:game.remotes?.get(p.id)?.hp||100,dead:p.dead};
  return {run:copy(game.run),items:copy(game.items?.serialize?.()||[]),players:ps};}
 function start(from=game.selfId){if(!game.isHost||active()||!['orbit','company','hub'].includes(game.run?.phase)||from!==game.selfId)return false;
  const items=game.items?.serialize?.()||[];if(items.length>128||game.aiPlayers?.().some(p=>p.dead||down(p)))return false;
  const backup=snapshot(),seed=hashString(`${game.run.seed}:${game.time}:${game.selfId}`),token=`dl24:${seed}:${Math.floor(game.time*1000)}`;const players={};for(const p of game.aiPlayers?.()||[])players[p.id]=newProgress({seed:hashString(token+p.id),floor:0});
  mainCheckpoint=backup;localCheckpoint={slots:[...(game.player?.slots||[])],slot:game.player?.slot||0,stamina:game.player?.stamina??100};checkpointToken=token;restoredToken='';seqs.clear();shots.clear();localSeq=0;game.hostSave?.();game.run.deadletter24={version:1,token,seed,floor:0,floorRev:1,stage:'intro',elapsed:0,wave:0,spawned:0,kills:0,rareDrops:0,players,backup};
  game.hostSetPhase('deadletter',{moon:'deadletter24',deadletter24:game.run.deadletter24});onState();warn(TEXT.ready);return true;
 }
 function restoreCheckpoint(backup){if(!backup||restoredToken===checkpointToken)return;restoredToken=checkpointToken;draft?.close();removeMap();clearItems();delete game.run.deadletter24;if(['company','hub'].includes(backup.run?.phase)&&(!game.world.company||game.world.moonId!==backup.run.moon))game.loadMapFor?.(backup.run,true);for(const row of backup?.items||[]){let restored=row;if(row.h&&row.h!==game.selfId&&!game.remotes?.has(row.h)){restored={...row,h:null,iv:undefined,p:(game.ship?.spawns?.[0]||new THREE.Vector3(0,1,0)).toArray()};}game.items.onEvent({e:'sp',...restored});}const p=backup?.players?.[game.selfId];if(p&&game.player){game.player.dead=false;game.player.downed=false;game.player.frozen=false;game.player.hp=p.hp;game.player.stamina=localCheckpoint?.stamina??100;if(localCheckpoint){game.player.slots=localCheckpoint.slots.map(id=>game.items.get(id)?id:null);game.player.slot=localCheckpoint.slot;}game.player.indoor=p.p[1]<FACILITY_Y+40;game.player.inShip=false;game.spectating=null;if(game.engine?.fx){game.engine.fx.blind=0;game.engine.fx.noise=0;}game.player.teleport(new THREE.Vector3().fromArray(p.p),p.yaw);game.player.vel?.set(0,0,0);game.ui?.hud?.setDead?.(false);game.net?.send?.('pst',{dead:false,hp:p.hp});}game.refreshStats?.();game.refreshHeldVisuals?.();mainCheckpoint=null;localCheckpoint=null;}
 function end(reason='exit'){if(!game.isHost||!active())return false;const st=state(),backup=st.backup,token=st.token;clearActors();clearItems();removeMap();draft?.close();game.net?.broadcast?.('dn',{k:'clear'});game.downed?.S?.book?.clear?.();for(const k of Object.keys(game.run))delete game.run[k];Object.assign(game.run,copy(backup.run));game.hostSetPhase(game.run.phase,{...game.run});if(game.run.phase==='company'||game.run.phase==='hub')game.loadMapFor?.(game.run,true);
  const payload={token,backup,reason};game.net?.broadcast?.('dl24end',payload);if(mainCheckpoint)restoreCheckpoint(backup);seqs.clear();shots.clear();publish();warn(reason==='wipe'?TEXT.wipe:reason==='invalid'?TEXT.invalid:TEXT.return);return true;}
 function request(op,data={}){if(op==='start'){if(game.isHost)return start();return false;}const st=state();if(!st)return false;const d={op,token:st.token,rev:st.floorRev,seq:++localSeq,...data};if(game.isHost)return hostReq(d,game.selfId);game.net?.request?.('dl24req',d);return true;}
 function hostReq(d,from){if(!game.isHost||!active()||!d||d.token!==state().token||d.rev!==state().floorRev||!state().players[from]||!Number.isSafeInteger(d.seq)||d.seq<1||d.seq<=(seqs.get(from)||0))return false;
  const p=game.aiPlayerById?.(from);if(!p||p.dead||down(p))return false;seqs.set(from,d.seq);const st=state(),pr=st.players[from];
  if(d.op==='choose'){if(!combatPaused()||!chooseCard(pr,d))return false;nextOffer(pr);pauseClock=0;syncStats();publish();onState();return true;}
  if(d.op==='draft'){if(!combatPaused()||!pr.offer||!reachable(from,anchor()))return false;return true;}
  if(d.op==='exit'){if(from!==game.selfId||!reachable(from,anchor()))return false;return end();}
  if(d.op==='next'){if(st.stage!=='cleared'||combatPaused()||!reachable(from,anchor())||living().some(q=>down(q)||q.pos.distanceTo(anchor())>5)){warn(TEXT.crew);return false;}st.floor=Math.min(Number.MAX_SAFE_INTEGER-1,st.floor+1);st.floorRev++;st.stage='intro';st.elapsed=0;st.wave=0;st.spawned=0;st.rareDrops=0;delete st.pickup;delete st.boss;for(const q of Object.values(st.players)){q.floor=st.floor;q.offer=null;nextOffer(q);}projectiles.clear();shots.clear();publish();loadMapFor(game.run);onState();return true;}
  if(d.op==='loot'){if(!st.pickup||st.pickup.claimed||!reachable(from,new THREE.Vector3().fromArray(st.pickup.p)))return false;st.pickup.claimed=from;pr.doubleStamp=true;publish();return true;}
  if(d.op==='throw')return fire(p,pr,d);return false;
 }
 function fire(p,pr,d){const st=state();if(combatPaused()||!['wave','boss'].includes(st.stage)||readyFrames<2)return false;const e=effects(pr.build),last=shots.get(p.id)||{time:-99,special:-99};if(game.time-last.time<.48*e.cooldown||projectiles.count()>93)return false;
  if(!Array.isArray(d.dir)||d.dir.length!==3||!d.dir.every(Number.isFinite))return false;const dir=new THREE.Vector3().fromArray(d.dir);if(Math.abs(dir.length()-1)>.08||dir.dot(p.look||dir)<.9)return false;dir.normalize();const kind=['std','return','bounce','slow'].includes(d.kind)?d.kind:'std';if(kind!=='std'&&game.time-last.special<4)return false;
  const origin=(p.eye||p.pos.clone().add(new THREE.Vector3(0,1.62,0))).clone();if(game.physics.raycast(origin,dir,.35,G.STATIC|G.DOOR))return false;origin.addScaledVector(dir,.25);
  const count=pr.doubleStamp?2:1;for(let n=0;n<count;n++)projectiles.fire({origin,direction:n?dir.clone().applyAxisAngle(new THREE.Vector3(0,1,0),.075):dir,owner:p.id,kind,power:e.damage,pierce:e.pierce,range:e.range,crit:e.crit,critDamage:e.critDamage,returnRank:e.return});last.time=game.time;if(kind!=='std')last.special=game.time;shots.set(p.id,last);game.swingAnim=.4;game.viewModel?.kick?.(DL24_GEAR);fx({op:'sound',p:origin.toArray(),s:'wv1_card'});return true;
 }
 let selected='std',localAttack=-99;
 function special(){if(!active()||combatPaused())return false;const kinds=['return','bounce','slow'];selected=kinds[(kinds.indexOf(selected)+1)%3];warn(selected==='return'?TEXT.returnSlip:selected==='bounce'?TEXT.bounceSlip:TEXT.slowSlip);return true;}
 function attack(){if(!active()||game.player?.dead||game.player?.downed||combatPaused())return false;if(game.time-localAttack<.48*effects(state()?.players?.[game.selfId]?.build).cooldown)return false;localAttack=game.time;const dir=new THREE.Vector3(0,0,-1).applyQuaternion(game.camera.quaternion).normalize();const result=request('throw',{dir:dir.toArray(),kind:selected});selected='std';return result;}
 function spawnOptions(type,pos,opts={}){if(!active())return opts;if(!DL24_TYPES.includes(type)||opts.data?.dl24Token!==state().token||opts.data?.floorRev!==state().floorRev)return false;
  if([...game.creatures.host.values()].filter(c=>ownsCreature(c)&&!c.dead).length>=(type==='dl24_warden'?1:living().length>1?20:12))return false;
  return {...opts,variant:null,affix:null,elite:false,tier:null,fa:null};}
 function afterSpawn(c,opts){if(!active()||opts.data?.dl24Token!==state().token)return;const depth=Math.min(1.35,1+Math.log1p(state().floor)*.08);c.def={...c.def,run:Math.min(3.6,c.def.run),walk:Math.min(2.4,c.def.walk)};c.dmg=Math.min(32,Math.round(c.def.dmg*depth));c.maxHp=c.hp=Math.round(c.def.hp*depth*(c.def.boss?Math.min(2,1+.35*(living().length-1)):1));c.xp=0;c.coin=0;c.data.baseSpeed=c.def.run;}
 function onKill(c,by){if(!game.isHost||!ownsCreature(c)||c.data.rewarded)return;c.data.rewarded=true;const st=state();st.kills++;for(const p of participants()){if(p.dead)continue;const pr=st.players[p.id];gainXp(pr,c.def.boss?64:18+(c.data.eligibleElite?10:0));nextOffer(pr);}
  if(c.data.eligibleElite&&!st.rareDrops&&!st.pickup&&new RNG(hashString(`${st.seed}:${st.floor}:${c.data.waveIndex}`)).float()<.03){st.rareDrops=1;st.pickup={p:c.pos.clone().add(new THREE.Vector3(0,.45,0)).toArray(),claimed:null};}
  if(c.def.boss){st.stage='cleared';warn(TEXT.clear);}pauseClock=0;publish();onState();}
 function nativeSpawn(type,pos,data={}){return game.creatures.hostSpawn(type,pos,{zone:'in',state:'warning',level:1,variant:null,affix:null,elite:false,data:{...data,dl24Token:state().token,floorRev:state().floorRev}});}
 function safeSpot(boss=false){const st=state(),ps=living(),spots=fac?.lab?.spawnSpots||[],rng=new RNG(hashString(`${st.seed}:${st.floor}:${st.wave}:${st.spawned}`));for(const spot of rng.shuffle(spots.slice())){const q=V(spot);if(ps.some(p=>p.pos.distanceTo(q)<(boss?8:7)))continue;if([...game.creatures.host.values()].some(c=>!c.dead&&c.pos.distanceTo(q)<1.5))continue;
   const floor=game.physics.raycast(q.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),2.4,G.STATIC|G.DOOR);if(!floor||floor.normal.y<.8)continue;
   const shape=new RAPIER.Capsule(.45,.55);if(game.physics.world.intersectionWithShape({x:q.x,y:q.y+1.02,z:q.z},{x:0,y:0,z:0,w:1},shape,undefined,groups(0xffff,G.STATIC|G.DOOR)))continue;
   if(!ps.some(p=>fac.nav.findPath(q.x,q.z,p.pos.x,p.pos.z)))continue;return q;}
  return null;}
 function hostTick(dt){if(!active())return;const st=state();readyFrames++;for(const p of game.aiPlayers?.()||[])if(!st.players[p.id]){st.players[p.id]=newProgress({seed:hashString(st.token+p.id),floor:st.floor});st.backup.players[p.id]={p:(game.ship?.spawns?.[0]||new THREE.Vector3(0,.05,0)).toArray(),yaw:Math.PI/2,hp:100,dead:false};game.items?.hostSpawn?.(DL24_GEAR,anchor(),{holder:p.id,soulbound:true,label:`${st.token}:${st.floorRev}`,value:0});publish();}const ps=participants();if(!ps.length||ps.every(p=>p.dead||down(p))){st.wipeT=(st.wipeT||0)+dt;if(st.wipeT>4)end('wipe');return;}st.wipeT=0;
  if(combatPaused()){pauseClock+=dt;for(const p of living()){const pr=st.players[p.id];nextOffer(pr);if(pauseClock>=45&&pr.offer)chooseCard(pr,{...pr.offer,id:pr.offer.choices[0].id});}if(pauseClock>=45){pauseClock=0;publish();onState();}return;}
  pauseClock=0;st.elapsed+=dt;for(const c of game.creatures.host.values())if(ownsCreature(c)&&c.data.slowUntil&&game.time>=c.data.slowUntil){c.def.run=c.data.baseSpeed;delete c.data.slowUntil;}
  if(st.stage==='intro'&&st.elapsed>=4){st.stage='wave';st.elapsed=0;publish();}
  if(st.stage==='wave'){st.spawnT=(st.spawnT||0)-dt;const count=Math.min(14,(st.floor===0?3:5)+st.wave*2+Math.floor(Math.log1p(st.floor)));if(st.spawned<count&&st.spawnT<=0){const spot=safeSpot();st.spawnT=st.floor===0&&st.wave===0?2.6:1.6;if(spot){const i=st.spawned,type=DL24_TYPES[(i+st.wave)%3];if(nativeSpawn(type,spot,{waveIndex:i,eligibleElite:i===count-1&&st.wave<2})){st.spawned++;publish();}}}
   if(st.spawned>=count&&![...game.creatures.host.values()].some(c=>ownsCreature(c)&&!c.dead)){st.wave++;st.spawned=0;st.stage=st.wave>=3?'boss-intro':'intro';st.elapsed=0;publish();}}
  if(st.stage==='boss-intro'&&st.elapsed>=3){const spot=safeSpot(true);if(spot){const c=nativeSpawn('dl24_warden',spot);if(c){st.boss=c.id;st.stage='boss';publish();}}}
 }
 function onPhase(){if(active()){loadMapFor(game.run);onState();}else if(built){removeMap();draft?.close();}}
 function placeLateJoin(){if(!active())return;loadMapFor(game.run);const st=state();if(game.isHost&&!st.players[game.selfId])st.players[game.selfId]=newProgress({seed:hashString(st.token+game.selfId),floor:st.floor});const a=anchor();if(a)game.player?.teleport?.(a.clone().setY(FACILITY_Y+.02).add(new THREE.Vector3(0,0,2.4)),0);}
 function onFx(d){if(!active()||d.token!==state().token||d.rev!==state().floorRev)return;if(d.op==='sound'){game.audio?.at?.(d.s,new THREE.Vector3().fromArray(d.p),.35);return;}projectiles.event(d);}
 function onEnd(d){if(!d||d.token!==checkpointToken||!mainCheckpoint||restoredToken===d.token)return;restoreCheckpoint(d.backup);}
 function bind(net){bound?.off?.('msg:dl24fx',onFx);bound?.off?.('msg:dl24end',onEnd);bound=net;net?.on_?.('dl24fx',onFx);net?.on_?.('dl24end',onEnd);}
 const on=(name,fn)=>offs.push(game.mods?.on?.(name,(...args)=>{const g=args.find(a=>a===game);if(g||!args.some(a=>a?.world&&a?.run))fn(...args);}));
 on('netReady',(net,g)=>{if(g===game)bind(net);});if(game.net)bind(game.net);
 on('hostMigrated',(g,info)=>{if(g===game&&info?.self&&game.isHost&&active())end('migration');});
 on('registerHandlers',(H,g)=>{if(g===game)H('dl24req',hostReq);});
 on('interactables',(out,g)=>{if(g!==game)return;if(!active()){if(['orbit','company','hub'].includes(game.run?.phase)&&game.isHost)out.push({pos:entryPoint(),r:.55,reach:2.7,label:t(TEXT.start),sub:t(TEXT.sub),action:()=>request('start')});return;}
  const a=anchor();if(!a)return;if(state().players?.[game.selfId]?.offer&&combatPaused())out.unshift({pos:a,r:.5,reach:2.8,label:t(TEXT.draft),action:()=>{const pr=state().players[game.selfId];draft?.openDraft({offer:pr.offer,build:pr.build,onChoose:c=>request('choose',c)});}});
  if(state().stage==='cleared')out.push({pos:a.clone().add(new THREE.Vector3(1,0,0)),r:.45,reach:2.8,label:t(TEXT.next),action:()=>request('next')});
  if(game.isHost)out.push({pos:a.clone().add(new THREE.Vector3(-1,0,0)),r:.45,reach:2.8,label:t(TEXT.exit),action:()=>request('exit')});
  if(state().pickup&&!state().pickup.claimed)out.push({pos:new THREE.Vector3().fromArray(state().pickup.p),r:.45,reach:2.8,label:t(TEXT.loot),action:()=>request('loot')});
 });
 on('objectives',(add,g,phase)=>{if(g!==game||phase!=='deadletter')return;const st=state(),pr=st?.players?.[game.selfId];add(`Dead Letter / ${st.floor+1} / ${t(st.stage==='intro'?TEXT.introStage:st.stage==='wave'?TEXT.waveStage:st.stage==='boss-intro'?TEXT.bossIntroStage:st.stage==='boss'?TEXT.bossStage:TEXT.clearedStage)}`,'main');add(combatPaused()?t(TEXT.paused):st.stage==='cleared'?t(TEXT.clear):t(TEXT.ready),'sub');if(combatPaused())add(t(TEXT.auto),'sub');if(pr)add(tf(TEXT.level,{n:pr.level,xp:pr.xp,goal:xpThreshold(pr.level)}),'sub');});
 on('update',(dt,g)=>{if(g!==game||!active())return;readyFrames++;if(!combatPaused())projectiles.update(dt);onState();});
 const oldSpeed=game.creatures?.speedMul;if(oldSpeed){const wrapped=function(c,speed){return ownsCreature(c)?Math.min(3.6,Math.max(0,speed)):oldSpeed.call(this,c,speed);};game.creatures.speedMul=wrapped;offs.push(()=>{if(game.creatures.speedMul===wrapped)game.creatures.speedMul=oldSpeed;});}
 const oldSpawn=game.items?.hostSpawn;if(oldSpawn){const wrapped=function(type,pos,opts){if(active()&&type!==DL24_GEAR)return null;return oldSpawn.call(this,type,pos,opts);};game.items.hostSpawn=wrapped;offs.push(()=>{if(game.items.hostSpawn===wrapped)game.items.hostSpawn=oldSpawn;});}
 return{active,state,start,entryPoint,acceptItemEvent(d){if(d?.e==='sp'){if(active())return d.ty===DL24_GEAR&&d.lb===`${state().token}:${state().floorRev}`;return d.ty!==DL24_GEAR;}if(active()&&mainCheckpoint?.items?.some(it=>it.id===d?.id))return false;return true;},requestStart:()=>request('start'),request,hostReq,loadMapFor,onState,onPhase,placeLateJoin,hostTick,combatPaused,ownsCreature,spawnOptions,afterSpawn,onKill,attack,special,stats,playerDamage,
  statsProgress:()=>{const st=state();return st?{floor:st.floor+1,stage:st.stage,kills:st.kills,players:st.players,projectiles:projectiles.count(),paused:combatPaused(),anchor:anchor()?.toArray(),start:anchor()?.clone().setY(FACILITY_Y+.02).add(new THREE.Vector3(0,0,2.4)).toArray(),spawnSpots:fac?.lab?.spawnSpots}:null;},
  dispose(){if(disposed)return;disposed=true;draft?.dispose();projectiles.clear();removeMap();for(const off of offs.splice(0))off?.();bound?.off?.('msg:dl24fx',onFx);bound?.off?.('msg:dl24end',onEnd);seqs.clear();shots.clear();if(registry?.get(DL24_GEAR)===gearFactory){if(previousGear)registry.set(DL24_GEAR,previousGear);else registry.delete(DL24_GEAR);}actorRegistryDispose?.();}};
}
