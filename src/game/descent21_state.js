import { discoveryThreshold,floorSpec } from './descent21_core.js';
export function chooseSafeFloor(moon,baseSeed,depth,probe){
 const s=floorSpec(moon,baseSeed,depth),choices=depth===0?[null]:[{seed:s.seed,theme:s.theme,size:s.size},{seed:(s.seed^0x713fac)>>>0,theme:'factory',size:Math.max(1.1,s.size)},{seed:(s.seed^0x21ac4e)>>>0,theme:'threadarchive',size:Math.max(1.1,s.size)}];
 for(const choice of choices){const plan=probe(depth,choice);if(plan)return {plan,choice};}return null;
}
export const descentToken=run=>`${run?.moon}:${run?.seed}:${run?.day}`;
export const newDescent=run=>({token:descentToken(run),baseSeed:run.seed,rev:0,depth:0,reached:0,visited:[],surfaceVisited:[],liftStage:'idle',stageTime:0,stageElapsed:0,surface:null,nonce:0});
export function inCabin(pos,plan){const b=plan?.boundary;return !!pos&&!!b&&pos.x>b.x0&&pos.x<b.x1&&pos.z>b.z0&&pos.z<b.z1&&pos.y>=b.y0-.2&&pos.y<b.y1;}
export function discovered(st,plan){const threshold=discoveryThreshold(plan?.discoveryRooms?.length||0);return threshold>0&&st.visited.length>=threshold;}
export function stageRequest(st,op,time,ready){
 if(!st||!Number.isFinite(time))return false;
 if(op==='call'&&st.liftStage==='idle'&&ready){st.liftStage='calling';}
 else if(op==='descend'&&st.liftStage==='ready'&&ready){st.liftStage='travelling';st.target=st.reached+1;}
 else if(op==='return'&&st.depth>0&&['idle','ready'].includes(st.liftStage)){st.liftStage='travelling';st.target=0;}
 else return false;
 st.stageTime=time;st.stageElapsed=0;st.rev++;st.nonce++;return true;
}
