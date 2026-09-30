export const FIELD17_SECONDS={repair:24,uplink:18};
export const FIELD17_REWARD={repair:85,uplink:75};
export const isField17=kind=>kind==='repair'||kind==='uplink';
export function tickField17(s,dt,present,quiet){
 if(!s?.accepted||s.done||!isField17(s.kind)||(!present&&!(s.kind==='repair'&&s.drone))||!(dt>0)||!Number.isFinite(dt))return false;
 if(s.kind==='repair'&&!s.installed || s.kind==='uplink'&&!quiet)return false;
 s.progress=Math.min(FIELD17_SECONDS[s.kind],(s.progress||0)+Math.min(dt,.25)*(s.kind==='repair' && s.drone ? 0.75 : 1));
 s.done=s.progress>=FIELD17_SECONDS[s.kind];return s.done;
}
