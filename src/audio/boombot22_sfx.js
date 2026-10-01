// Native soundGens contract: (sampleRate) => Float32Array. No context or loop ownership here.
function cue(kind,sr){const duration=kind==='drive'?.32:kind==='ping'?.42:.16,n=Math.max(1,Math.floor(sr*duration)),a=new Float32Array(n);for(let i=0;i<n;i++){const t=i/sr,u=t/duration,fade=Math.min(1,t/.012,(duration-t)/.025);let v;
 if(kind==='drive'){const tick=Math.exp(-(t%.04)*90);v=Math.sin(t*2*Math.PI*92)*.12+Math.sin(t*2*Math.PI*520)*tick*.1;}
 else if(kind==='ping'){const envelope=Math.max(0,Math.sin(t*Math.PI*5))**2;v=Math.sin(t*2*Math.PI*(t<.21?430:610))*envelope*.24;}
 else{const tick=Math.exp(-(t%.18)*25);v=(Math.sin(t*2*Math.PI*(240+u*90))*.2+Math.sin(t*2*Math.PI*660)*.07)*tick;}
 a[i]=v*fade;}return a;}
export const BOOMBOT22_SOUNDS=Object.freeze({bb22_drive:sr=>cue('drive',sr),bb22_ping:sr=>cue('ping',sr),bb22_warn:sr=>cue('warn',sr)});
