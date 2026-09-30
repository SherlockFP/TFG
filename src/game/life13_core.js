export const CITY_ROUTES13 = {
 company: [ [[-12,14],[-4,14],[-4,22],[-12,22]], [[4,18],[12,18],[12,24],[4,24]], [[14,24],[18,24],[18,30],[14,30]], [[-32,2],[-29,2],[-29,10],[-32,10]], [[-16,30],[-12,30],[-12,34],[-16,34]] ],
 hub: [ [[-15,17],[-5,17],[-5,23],[-15,23]], [[5,18],[16,18],[16,23],[5,23]], [[-8,40],[-4,40],[-4,46],[-8,46]], [[18,32],[22,32],[22,40],[18,40]], [[-22,40],[-18,40],[-18,46],[-22,46]] ],
 moon: [ [[-12,8],[-9,8],[-9,12],[-12,12]], [[-10,15],[-7,15],[-7,18],[-10,18]] ],
};
export function routePoint13(route, seconds, speed=.65) {
 let total=0;const legs=route.map((p,i)=>{const q=route[(i+1)%route.length],len=Math.hypot(q[0]-p[0],q[1]-p[1]),duration=len/speed+2;total+=duration;return {p,q,len,duration};});
 let t=((seconds%total)+total)%total;
 for(const leg of legs){if(t<leg.duration){const k=Math.max(0,Math.min(1,(t-2)*speed/leg.len));return {x:leg.p[0]+(leg.q[0]-leg.p[0])*k,z:leg.p[1]+(leg.q[1]-leg.p[1])*k,yaw:Math.atan2(leg.q[0]-leg.p[0],leg.q[1]-leg.p[1]),moving:t>2};}t-=leg.duration;}
 return {x:route[0][0],z:route[0][1],yaw:0,moving:false};
}
export function surveyStep13(old, op, now, token) {
 let s={stage:'idle',paid:0,...old};
 if(!s.paid && s.token && s.token!==token && ['accept','barter'].includes(op))s={stage:'idle',paid:0};
 if(s.paid || (s.token && s.token!==token && op!=='accept'))return {state:s,event:'closed'};
 if(op==='accept' && (s.stage==='idle'||s.token!==token)) return {state:{stage:'accepted',paid:0,at:now,token},event:'accepted'};
 if(op==='checkpoint' && s.stage==='accepted' && now-s.at>=8)return {state:{...s,stage:'visited'},event:'visited'};
 if(op==='claim' && s.stage==='visited' && now-s.at>=15)return {state:{...s,stage:'done',paid:18},event:'paid',reward:18};
 if(op==='barter' && s.stage==='idle')return {state:{stage:'done',paid:12,token},event:'paid',reward:12};
 return {state:s,event:'wait'};
}
