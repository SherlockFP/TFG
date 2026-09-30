// Host-owned attempt rules. Client sends actions, never a claimed win or clock.
import { hashString, RNG } from '../core/rng.js';
export const PRESSURE_PERIOD = 2.8, PRESSURE_LOW = .42, PRESSURE_HIGH = .78;
export const pressurePhase = elapsed => ((elapsed % PRESSURE_PERIOD) + PRESSURE_PERIOD) % PRESSURE_PERIOD / PRESSURE_PERIOD;
export function createCalibration17(job,token,now,runId) {
 const rng=new RNG(hashString(`${runId}:${job.id}:${token}`));
 return {id:job.id,token,mode:job.product==='cells'?'pressure':'signal',sequence:rng.shuffle([1,2,3]),step:0,lastCycle:-1,start:now,last:now,beat:now};
}
export function advanceCalibration17(s,d,now) {
 if(!s||d.token!==s.token||d.id!==s.id||d.step!==s.step||now-s.start>35)return {ok:false,reason:'invalid'};
 if(now-s.last<.25)return {ok:false,reason:'early'};
 if(s.mode==='pressure') {const phase=pressurePhase(now-s.start);if(phase<PRESSURE_LOW||phase>PRESSURE_HIGH||Math.floor((now-s.start)/PRESSURE_PERIOD)<=s.lastCycle||now-s.last<1)return {ok:false,reason:'miss'};}
 else if(d.terminal!==s.sequence[s.step])return {ok:false,reason:'miss'};
 if(s.mode==='pressure')s.lastCycle=Math.floor((now-s.start)/PRESSURE_PERIOD);
 s.step++;s.last=now;return {ok:true,done:s.step===3};
}
export function calibrationState17(s,now) {return {id:s.id,token:s.token,mode:s.mode,sequence:s.sequence,step:s.step,hostNow:now,elapsed:now-s.start};}
