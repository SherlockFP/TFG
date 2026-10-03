const DURATIONS=Object.freeze({c32_dormant_wake:1.5,c32_ram_brake:1.4,c32_ram_impact:.75});
const TAU=Math.PI*2;
const BRAKE_ONSETS=Object.freeze([.08,.48,.88]);

/** Original mono paper/mask breath, three brake ticks, and damped metal impact.
 * No recordings, voices or franchise cue material. Only registration allocates
 * buffers; native CreatureView state sounds / confirmed impact events play them.
 */
export function creature32Cue(id,sampleRate){
 const dur=DURATIONS[id];
 if(!dur)throw new RangeError(`Unknown creature32 cue: ${id}`);
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Invalid creature32 sample rate');
 const a=new Float32Array(Math.floor(sampleRate*dur));
 let seed=id==='c32_dormant_wake'?0x324451:id==='c32_ram_brake'?0x324252:0x32494d,lp=0;
 for(let i=0;i<a.length;i++){
  const t=i/sampleRate;
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  const noise=(seed>>>0)/4294967296*2-1;
  lp+=(noise-lp)*.13;
  const edge=Math.max(0,Math.min(1,t/.018,(dur-t)/.035));
  let v;
  if(id==='c32_dormant_wake'){
   const paper=Math.exp(-t*7)*(noise-lp)*.095;
   const breath=Math.sin(Math.PI*t/dur)**2;
   const rasp=(Math.sin(TAU*119*t)+.35*Math.sin(TAU*237*t))* .055;
   const latch=t>.14?Math.exp(-(t-.14)*26)*Math.sin(TAU*730*t)*.075:0;
   v=paper+breath*(lp*.24+rasp)+latch;
  }else if(id==='c32_ram_brake'){
   // Literal three mechanical events across the full native 1.4 second tell.
   let click=0;
   for(const onset of BRAKE_ONSETS)if(t>=onset){const age=t-onset;click+=Math.exp(-age*30)*(Math.sin(TAU*510*age)*.12+(noise-lp)*.06);}
   const pressure=Math.sin(Math.PI*t/dur)**2;
   v=click+pressure*(lp*.10+Math.sin(TAU*72*t)*.035);
  }else{
   const thud=Math.sin(TAU*(61*t-16*t*t))*Math.exp(-t*11)*.15;
   const plate=(Math.sin(TAU*431*t)+Math.sin(TAU*697*t)*.45)*Math.exp(-t*14)*.07;
   v=thud+plate+(noise-lp)*Math.exp(-t*35)*.065;
  }
  a[i]=edge*v;
 }
 return a;
}

/** C20 cache contract: lazy after ctx init, idempotent per AudioManager.
 * Starts no sources/loops, so registration is safe with volume zero. Buffers
 * belong to the existing manager cache; no second session/disposal owner.
 */
export function ensureCreature32Audio(game){
 const audio=game?.audio;
 if(!audio?.ctx||!audio.buffers)return false;
 for(const id of Object.keys(DURATIONS))if(!audio.buffers.has(id)){
  const samples=creature32Cue(id,audio.ctx.sampleRate);
  const b=audio.ctx.createBuffer(1,samples.length,audio.ctx.sampleRate);
  b.copyToChannel(samples,0);audio.buffers.set(id,b);
 }
 return true;
}
