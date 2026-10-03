import * as THREE from 'three';
import {G} from '../physics/physics.js';
import {physicalReach21} from '../world/descent21.js';
import {addTranslations} from '../core/i18n.js';
addTranslations({
  'Restore the facility power at a fuse box. Ship and exit lights remain on.':'Tesisin elektriğini sigorta kutusundan aç. Gemi ve çıkış ışıkları açık kalır.',
  'Night has fallen. Return when ready; the ship waits for your command.':'Gece oldu. Hazır olduğunda dön; gemi kalkış emrini bekliyor.'
},'tr');
addTranslations({
  'Restore the facility power at a fuse box. Ship and exit lights remain on.':'Включите питание объекта в щитке. Свет на корабле и у выходов остаётся включённым.',
  'Night has fallen. Return when ready; the ship waits for your command.':'Настала ночь. Возвращайтесь, когда будете готовы; корабль ждёт вашей команды.'
},'ru');

export function fuseReceipt38(game, panel) {
  return {fuse:panel.id,moon:game.run?.moon,seed:game.run?.seed,depth:game.world?.descent21Depth||0};
}
export function validFuse38(game,d,from) {
  if(!game.isHost||game.run?.phase!=='moon'||d?.moon!==game.run.moon||d.seed!==game.run.seed||d.depth!==(game.world?.descent21Depth||0))return false;
  const p=from===game.selfId?game.player:game.remotes.get(from);
  const panel=game.world.facility?.interactables?.find(ip=>ip.type==='fuse'&&ip.id===d.fuse);
  if(!p?.pos||p.dead||p.downed||game.downed?.isDowned?.(from)||!panel)return false;
  const eye=p.pos.clone().add(new THREE.Vector3(0,Number.isFinite(p.eye)?p.eye:1.62,0)),dir=panel.pos.clone().sub(eye),dist=dir.length();
  return dist<3 && (dist<.15||!game.physics.raycast(eye,dir.normalize(),dist-.15,G.STATIC|G.DOOR));
}
export function shipDoorReach38(game,from) {
  const p=from===game.selfId?game.player:game.remotes.get(from);
  if(!p?.pos||p.dead||p.downed||game.downed?.isDowned?.(from))return false;
  const eye=p.pos.clone().add(new THREE.Vector3(0,Number.isFinite(p.eye)?p.eye:1.62,0));
  const outside=game.ship?.doorOutside?.clone().add(new THREE.Vector3(0,1.3,0));
  for(const target of [game.ship?.points?.doorOpen,outside])if(target){
    const dir=target.clone().sub(eye),dist=dir.length();
    if(dist<3.5&&(dist<.15||!game.physics.raycast(eye,dir.normalize(),dist-.15,G.STATIC|G.DOOR)))return true;
  }
  return false;
}
// Reuse the actual native standing-capsule flood used by lift certification.
// Never darken a map whose restoration panel requires a key/locked gate or a wall bypass.
export function certifiedFuse38(game) {
  const fac=game.world?.facility;if(!fac||!game.physics?.world)return null;
  const reach=physicalReach21(fac,game.physics),y=fac.layout.y;
  for(const panel of fac.interactables||[])if(panel.type==='fuse') {
    for(const radius of [1,1.5,2])for(let n=0;n<8;n++) {
      const angle=n*Math.PI/4,x=panel.pos.x+Math.cos(angle)*radius,z=panel.pos.z+Math.sin(angle)*radius;
      if(!reach(x,z))continue;
      const eye=new THREE.Vector3(x,y+1.62,z),dir=panel.pos.clone().sub(eye),dist=dir.length();
      if(dist<3&&!game.physics.raycast(eye,dir.normalize(),Math.max(0,dist-.15),G.STATIC|G.DOOR))return panel;
    }
  }
  return null;
}
