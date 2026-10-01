import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { t } from '../core/i18n.js';
import { REPLAY19, replayToken, newReplay, startReplay, advanceReplay } from './replay19_core.js';
import { R19 } from './replay19_text.js';

export function installReplay19(game) {
  const offs = []; let disposed = false, world = null, heardKey = '';
  const token = () => replayToken(game.run);
  const active = () => !disposed && !game.destroyed && game.run?.phase === 'moon' && game.run.moon === 'hamsi' && game.world?.moonId === 'hamsi' && !!game.world?.outdoor?.broadcast18?.plan?.replayControl;
  const state = () => game.run?.replay19?.token === token() ? game.run.replay19 : null;
  const publish = () => game.broadcastRun?.(['replay19']);
  const powered = () => !!game.run?.fc && !game.feedcams?.netOff?.();
  function sync() {
    if (!active()) { world?.setReplay?.('idle'); world = null; heardKey = ''; return false; }
    world = game.world.outdoor.broadcast18;
    if (game.isHost && !state()) { game.run.replay19 = newReplay(token()); publish(); }
    const s = state(); world.setReplay?.(s?.stage || 'idle');
    // Replica audio derives from replicated pulse index; never issues AI noise.
    const soundKey = s?.stage === 'live' ? `${s.token}:${s.pulse}` : '';
    if (soundKey && s.pulse >= 0 && soundKey !== heardKey) {
      heardKey = soundKey;
      game.audio?.play?.('walkie_static', { pos: world.plan.replayControl, volume: .45, refDistance: 4, maxDistance: 45, bus: 'sfx', loop: false });
    }
    return true;
  }
  function reachable(p) {
    const c = world?.plan?.replayControl;
    if (!p || p.dead || game.downed?.isDowned?.(p.id) || p.zone !== 'out' || p.inShip || !p.pos || !c) return false;
    if (Math.hypot(p.pos.x-c.x,p.pos.z-c.z)>2.6 || Math.abs(p.pos.y+1.3-c.y)>2.1) return false;
    const eye = new THREE.Vector3(p.pos.x,p.eye?.y??p.pos.y+1.4,p.pos.z), dir = c.clone().sub(eye), len = dir.length();
    if (!game.physics?.raycast) return false;
    return len<.1 || !game.physics.raycast(eye,dir.normalize(),Math.max(0,len-.18),G.STATIC|G.DOOR);
  }
  function hostReq(d, from) {
    if (!game.isHost || !active() || !d || d.token !== token() || d.op !== 'play' || !sync() || !reachable(game.aiPlayerById?.(from))) return false;
    if (!startReplay(state(),d.rev,game.time,powered())) return false;
    publish(); sync(); return true;
  }
  const on = (name, fn) => { const off=game.mods?.on?.(name,fn); if(off)offs.push(off); };
  on('registerHandlers',(H,g)=>{if(g===game)H('r19req',hostReq);});
  on('mapLoaded',(_,g)=>{if(!g||g===game)sync();});
  on('feedcams',(event,g)=>{if(g===game&&game.isHost&&event?.k==='clock'&&state()?.used){state().start-=event.d;publish();}});
  on('update',(_,g)=>{
    if(g&&g!==game)return;if(!sync()||!game.isHost)return;
    const result=advanceReplay(state(),game.time,powered());
    if(result.pulse) {
      const c=world.plan.replayControl;
      game.creatures?.noise?.(new THREE.Vector3(c.x,c.y-.9,c.z),REPLAY19.loud);
    }
    if(result.changed){publish();sync();}
  });
  on('interactables',(out,g)=>{
    if(g!==game||!sync()||game.player?.dead||game.player?.indoor)return;
    const s=state();if(!s)return;
    const label=s.stage==='warning'?R19.warning:s.stage==='live'?R19.live:s.used?R19.spent:!powered()?R19.off:R19.ready;
    out.push({pos:world.plan.replayControl,r:.3,reach:2.4,label:()=>t(label),sub:()=>t(R19.choice),action:()=>{
      if(!s.used&&powered())game.net?.request?.('r19req',{op:'play',token:token(),rev:state()?.rev});
    }});
  });
  sync();
  return {state,plan:()=>world?.plan||null,hostReq,dispose(){if(disposed)return;world?.setReplay?.('idle');disposed=true;for(const off of offs)off();world=null;}};
}
