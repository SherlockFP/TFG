// A conservative capsule/box check for the optional shutter; no custody or camera state here.
export function occupiesBroadcastGate(gate, pos, radius=.5, height=1.9) {
 if(!gate?.pos||!pos) return false;
 const [w,h,depth]=gate.size, dx=pos.x-gate.pos.x,dz=pos.z-gate.pos.z;
 const angle=gate.rotY||0, c=Math.cos(angle),s=Math.sin(angle),x=c*dx-s*dz,z=s*dx+c*dz;
 const base=gate.baseY??gate.pos.y-h/2;
 return Math.abs(x)<=w/2+radius+.18&&Math.abs(z)<=depth/2+radius+.18&&pos.y<=base+h+.1&&pos.y+height>=base-.1;
}
export const broadcastToken=run=>`${run?.moon}:${run?.seed}:${run?.day}`;
