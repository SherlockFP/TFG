import { t } from '../core/i18n.js';
import { buildDarkCollapse20 } from '../world/darkcollapse20.js';
import { DC20,collapseToken,newDarkRoom,stepDarkRoom,roomBounds,insideRoom,doorFootprintBusy,alternateReturn } from './darkcollapse20_core.js';
import { D20 } from './darkcollapse20_text.js';

export function installDarkCollapse20(game) {
  let disposed=false,fac=null,key='',candidates=[],lastSync=-Infinity;const offs=[],shown=new Set();
  const token=()=>collapseToken(game.run),state=()=>game.run?.darkcollapse20?.token===token()?game.run.darkcollapse20:null;
  const publish=()=>game.broadcastRun?.(['darkcollapse20']);
  const active=()=>!disposed&&!game.destroyed&&game.run?.phase==='moon'&&game.world?.facility?.lab?.optionalRooms?.length;
  function cleanup(){for(const c of candidates)c.visual.dispose();candidates=[];fac=null;key='';lastSync=-Infinity;shown.clear();}
  function prepare(){
    if(!active()){if(fac)cleanup();return false;}
    const next=game.world.facility;if(fac===next&&key===token())return true;
    cleanup();fac=next;key=token();const L=fac.layout,optional=new Set(fac.lab.optionalRooms),ledger=state();
    for(const door of fac.doors){
      if(candidates.length>=DC20.maxRooms)break;
      const owned=ledger?.rooms.find(s=>s.id===door.id);
      if(ledger&&!owned)continue;
      if(door.kind!=='door'||(door.locked&&owned?.stage!=='collapsed')||!door.colArgs||door.info?.arena||door.info?.treasure)continue;
      const ids=[L.roomOf[door.info.a],L.roomOf[door.info.b]],id=ids.find(id=>optional.has(id));
      const r=L.rooms[id];if(!r||r.maze||['entrance','core','vault','generator','arena'].includes(r.type)||candidates.some(c=>c.room.id===id))continue;
      if(!alternateReturn(fac.nav,door,fac.mainDoor))continue;
      candidates.push({door,room:r,bounds:roomBounds(L,r),visual:buildDarkCollapse20(fac.group,door)});
    }
    if(game.isHost&&!state()){game.run.darkcollapse20={token:key,rev:0,rooms:candidates.map(c=>newDarkRoom(c.door.id))};publish();}
    return true;
  }
  function apply(){const st=state();if(!st)return;for(const c of candidates){const s=st.rooms.find(s=>s.id===c.door.id);if(!s)continue;c.visual.setStage(s.stage);
    if(s.stage==='collapsed'&&(c.door.open||!c.door.locked))game.onDoor?.({id:c.door.id,open:false,locked:true,silent:true});
    if(s.stage==='warning'||s.stage==='collapsed'){
      const cue=`${s.id}:${s.rev}:${s.stage}`;
      if(!shown.has(cue)){shown.add(cue);game.audio?.play?.(s.stage==='warning'?'door_creak':'door_close',{pos:c.door.pos,volume:.55,refDistance:3,maxDistance:18,loop:false});
        if(game.player?.indoor&&insideRoom(game.player.pos,c.bounds))game.ui?.toast?.(t(s.stage==='warning'?D20.warning:D20.collapsed),'warn');}
    }
  }}
  function lit(c,crew){
    if(crew.some(p=>p.flash))return true;
    return game.run.powerOn!==false&&fac.emitters.some(e=>e.intensity>.05&&e.group==='facility'&&insideRoom(e.pos,c.bounds)&&crew.some(p=>e.pos.distanceTo(p.pos)<(e.distance||0)*.7));
  }
  function occupants(){return [...(game.aiPlayers?.()||[]).filter(p=>!p.dead&&p.zone==='in'),...(game.items?.all?.()||[]).filter(it=>it.state==='world'&&it.obj?.position).map(it=>({pos:it.obj.position,radius:it.type==='body'?.75:.8,height:it.type==='body'?1:1.5}))];}
  const on=(ev,fn)=>{const off=game.mods?.on?.(ev,fn);if(off)offs.push(off);};
  on('update',(dt,g)=>{if(g&&g!==game)return;if(!prepare())return;const st=state();if(!st)return;
    if(game.isHost){let changed=false;const alive=(game.aiPlayers?.()||[]).filter(p=>!p.dead&&p.zone==='in'&&!game.downed?.isDowned?.(p.id));
      for(const c of candidates){const s=st.rooms.find(s=>s.id===c.door.id);if(!s)continue;const crew=alive.filter(p=>insideRoom(p.pos,c.bounds));changed=stepDarkRoom(s,dt,crew.length>0,lit(c,crew))||changed;
        if(s.stage==='warning'&&s.warning>=DC20.warningSeconds&&!doorFootprintBusy(c.door,occupants())&&alternateReturn(fac.nav,c.door,fac.mainDoor)){
          s.stage='collapsed';s.rev++;changed=true;game.onDoor?.({id:c.door.id,open:false,locked:true,silent:true});
        }
      }
      if(changed||game.time-lastSync>=1){st.rev++;lastSync=game.time;publish();}
    }apply();
  });
  on('registerHandlers',(H,g)=>{if(g!==game)return;for(const action of ['door','unlock','vault']){const previous=game.net?.handlers?.get?.(action);H(action,(d,from)=>{if(state()?.rooms.some(s=>s.id===d?.id&&s.stage==='collapsed'))return;previous?.(d,from);});}});
  const previous=game.doorInteraction;
  if(previous){const replacement=function(door){if(state()?.rooms.some(s=>s.id===door?.id&&s.stage==='collapsed'))return {pos:door.pos,r:.5,reach:2.5,label:()=>t(D20.door),action(){}};return previous.call(this,door);};game.doorInteraction=replacement;offs.push(()=>{if(game.doorInteraction===replacement)game.doorInteraction=previous;});}
  return {state,candidates:()=>candidates,prepare,dispose(){if(disposed)return;disposed=true;cleanup();for(const off of offs)off();}};
}
