import { discoveryThreshold,floorSpec,LIMINAL26_THEMES } from './descent21_core.js';
import { hasOpenPlaces35 } from './openplaces35.js';
export function chooseSafeFloor(moon,baseSeed,depth,probe,{routeVersion=26}={}){
 const s=floorSpec(moon,baseSeed,depth,{routeVersion}),liminal=LIMINAL26_THEMES.includes(s.theme),options=s.layoutOpts?{layoutOpts:s.layoutOpts}:{},choices=depth===0?[null]:[{seed:s.seed,theme:s.theme,size:s.size,...options},{seed:(s.seed^0x713fac)>>>0,theme:liminal?s.theme:'factory',size:Math.max(1.1,s.size),...options},{seed:(s.seed^0x21ac4e)>>>0,theme:liminal?s.theme:'threadarchive',size:Math.max(1.1,s.size),...options}];
 // Announced liminal destinations keep their identity on safety retries. If no
 // native cabin fits, cancel transit rather than silently changing the route.
 for(const choice of choices){const plan=probe(depth,choice);if(plan)return {plan,choice};}return null;
}
export const descentToken=run=>`${run?.moon}:${run?.seed}:${run?.day}`;
export const newDescent=run=>({token:descentToken(run),baseSeed:run.seed,routeVersion:run.exploration38===1?38:hasOpenPlaces35(run)?35:26,rev:0,depth:0,reached:0,visited:[],surfaceVisited:[],liftStage:'idle',stageTime:0,stageElapsed:0,surface:null,nonce:0});
export function inCabin(pos,plan){const b=plan?.boundary;return !!pos&&!!b&&pos.x>b.x0&&pos.x<b.x1&&pos.z>b.z0&&pos.z<b.z1&&pos.y>=b.y0-.2&&pos.y<b.y1;}
export function discovered(st,plan){const threshold=Math.min(st.survey38?.version===38?5:15,discoveryThreshold(plan?.discoveryRooms?.length||0));return threshold>0&&st.visited.length>=threshold;}
export function stageRequest(st,op,time,ready){
 if(!st||!Number.isFinite(time))return false;
 if(op==='call'&&st.liftStage==='idle'&&ready){st.liftStage='calling';}
 else if(op==='descend'&&st.liftStage==='ready'&&ready){st.liftStage='travelling';st.target=st.reached+1;}
 else if(op==='return'&&st.depth>0&&['idle','ready'].includes(st.liftStage)){st.liftStage='travelling';st.target=0;}
 else return false;
 st.stageTime=time;st.stageElapsed=0;st.rev++;st.nonce++;return true;
}
