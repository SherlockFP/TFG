import {G} from '../physics/physics.js';
import {insideShip} from '../world/ship.js';
export function standingConsole38(game,p){
 if(!p?.pos||!insideShip(p.pos))return false;
 const hit=game.physics.raycast({x:p.pos.x,y:p.pos.y+.3,z:p.pos.z},{x:0,y:-1,z:0},.8,G.STATIC,p.col);
 return !!hit&&hit.normal?.y>.65&&Math.abs(p.pos.y-hit.point.y)<.45;
}
