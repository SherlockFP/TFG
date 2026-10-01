import assert from 'node:assert/strict';
import './ship2_env.mjs';
import {generateLayout,buildFacility} from '../../src/world/facility.js';
import {NavGrid} from '../../src/world/nav.js';
import {navClear} from '../../src/world/interiors/common.js';
import {initPhysics,Physics} from '../../src/physics/physics.js';
import {planDescent21,descentFingerprint21} from '../../src/world/descent21_plan.js';
const excluded=r=>r.maze||r.arena||r.treasure||r.m2ch||r.type.startsWith('m2_')||['vault','core','generator','nest','arena'].includes(r.type);
// Frozen pre-Wave29 algorithms. These executable oracles preserve native A*,
// its fixed heap, maxIter cutoff and legacy discovery-plan behavior.
function legacyFindPath(sx, sz, tx, tz, maxIter = 12000) {
    let s = this.nearestWalkable(...this.toGrid(sx, sz));
    let t = this.nearestWalkable(...this.toGrid(tx, tz));
    if (!s || !t) return null;
    const W = this.w;
    const start = s[1] * W + s[0], goal = t[1] * W + t[0];
    if (start === goal) return [{ x: tx, z: tz }];
    this.curStamp++;
    if (this.curStamp > 4e9) { this.stamp.fill(0); this.closedStamp.fill(0); this.curStamp = 1; }
    const st = this.curStamp;
    const g = this.g, f = this.f, parent = this.parent, heap = this.heap;
    let hs = 0;
    const h = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    const push = (i) => {
      let k = hs++; heap[k] = i;
      while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; }
    };
    const pop = () => {
      const top = heap[0]; heap[0] = heap[--hs];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < hs && f[heap[l]] < f[heap[m]]) m = l;
        if (r < hs && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m;
      }
      return top;
    };
    g[start] = 0; f[start] = h(start); parent[start] = -1; this.stamp[start] = st; push(start);
    let iter = 0, found = false;
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (hs > 0 && iter++ < maxIter) {
      const cur = pop();
      if (cur === goal) { found = true; break; }
      if (this.closedStamp[cur] === st) continue;
      this.closedStamp[cur] = st;
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, cost] of NB) {
        const nx = cx + dx, nz = cz + dz;
        if (dx !== 0 && dz !== 0) {
          if (!this.canStep(cx, cz, cx + dx, cz) || !this.canStep(cx, cz, cx, cz + dz)) continue;
          if (!this.canStep(cx + dx, cz, nx, nz) || !this.canStep(cx, cz + dz, nx, nz)) continue;
        } else if (!this.canStep(cx, cz, nx, nz)) continue;
        const ni = nz * W + nx;
        if (this.closedStamp[ni] === st) continue;
        const ng = g[cur] + cost;
        if (this.stamp[ni] !== st || ng < g[ni]) {
          this.stamp[ni] = st; g[ni] = ng; f[ni] = ng + h(ni); parent[ni] = cur; push(ni);
        }
      }
    }
    if (!found) return null;
    const cellsPath = [];
    for (let i = goal; i !== -1; i = parent[i]) cellsPath.push(i);
    cellsPath.reverse();
    // string-pull smoothing with grid line-of-sight
    const pts = [];
    let anchor = 0;
    for (let i = 2; i < cellsPath.length; i++) {
      if (!this.gridLOS(cellsPath[anchor], cellsPath[i])) {
        pts.push(cellsPath[i - 1]);
        anchor = i - 1;
      }
    }
    pts.push(goal);
    const out = pts.map((i) => this.toWorld(i % W, (i / W) | 0));
    out[out.length - 1] = { x: tx, z: tz };
    if (!this.walkableAt(tx, tz)) out[out.length - 1] = this.toWorld(t[0], t[1]);
    return out;
  }

function legacyPlan(fac,{clear=()=>true,reachable=()=>true}={}){
 const L=fac.layout,nav=fac.nav,C=L.cell,entry=fac.mainDoor?.info?.a??L.entrySources[0],start={x:L.ox+(entry%L.w+.5)*C,z:L.oz+(Math.floor(entry/L.w)+.5)*C};
 const rooms=L.rooms.filter(r=>!excluded(r)&&r.type!=='entrance').sort((a,b)=>(L.distOf[L.idx(b.cx,b.cz)]||0)-(L.distOf[L.idx(a.cx,a.cz)]||0));
 const discoveryNav=new NavGrid(L,nav.res);discoveryNav.walk.set(nav.walk);discoveryNav.blockedEdges=new Set(nav.blockedEdges);
 // Only discovery eligibility relaxes a normal key-unlockable door. Physical placement remains on the original nav.
 for(const door of fac.doors){const info=door.info;if(door.kind!=='door'||info?.type!=='door'||info.treasure||info.arena||info.shortcut||info.required||info.permanent||info.code)continue;const a=L.rooms[L.roomOf[info.a]],b=L.rooms[L.roomOf[info.b]];if(a&&excluded(a)||b&&excluded(b))continue;discoveryNav.blockedEdges.delete(info.key);}
 const discoveryRooms=rooms.filter(r=>discoveryNav.findPath(start.x,start.z,L.ox+(r.cx+.5)*C,L.oz+(r.cz+.5)*C,90000)).map(r=>r.id);
 for(const r of [...rooms,...L.rooms.filter(r=>r.type==='entrance')]){
  if((L.heightOf[L.idx(r.cx,r.cz)]||0)<3.2)continue;
  const x0=L.ox+r.x*C,z0=L.oz+r.z*C,x1=x0+r.w*C,z1=z0+r.h*C;
  for(const [x,z,yaw] of [[x0+2.6,z0+2.6,0],[x1-2.6,z0+2.6,0],[x0+2.6,z1-2.6,Math.PI],[x1-2.6,z1-2.6,Math.PI],[(x0+x1)/2,z0+2.6,0],[(x0+x1)/2,z1-2.6,Math.PI],[(x0+x1)/2,(z0+z1)/2,0],[(x0+x1)/2,(z0+z1)/2,Math.PI]]){
   if(!navClear(nav,x-2.1,z-2.1,x+2.1,z+2.1,0)||!clear(x,z,L.y))continue;
   const direction=yaw===0?1:-1,approach={x,y:L.y,z:z+direction*2.3};
   if(!nav.findPath(start.x,start.z,approach.x,approach.z,90000)||!reachable(approach.x,approach.z))continue;
   return Object.freeze({roomId:r.id,discoveryRooms:Object.freeze(discoveryRooms),requiredRooms:15,x,z,y:L.y,yaw,approach:Object.freeze(approach),spawn:Object.freeze({x,y:L.y+.03,z}),returnSpawn:Object.freeze(approach),boundary:Object.freeze({x0:x-1.45,x1:x+1.45,z0:z-1.4,z1:z+1.4,y0:L.y,y1:L.y+2.8})});
  }
 }
 return null; // Never install an unsafe console or silently bypass a required gate.
}


function fixture(theme,seed,size,opts){
 const layout=generateLayout(seed,theme,size,opts),nav=new NavGrid(layout),doors=[...layout.edgeInfo.values()].filter(info=>['door','blast','vault','contain','entrance','fireexit'].includes(info.type)).map(info=>({kind:info.type==='contain'?'vault':info.type,info:{...info},locked:!!info.locked||info.type==='vault'}));
 for(const d of doors)if(['door','blast','vault','contain'].includes(d.info.type)&&!(d.kind==='blast'&&d.info.code))nav.blockedEdges.add(d.info.key);
 return {layout,nav,doors,mainDoor:doors.find(d=>d.kind==='entrance')};
}
function capture(fn,fac,callbacks){
 const oldStep=NavGrid.prototype.canStep,oldPath=NavGrid.prototype.findPath,oldLOS=NavGrid.prototype.gridLOS,oldWorld=NavGrid.prototype.toWorld;
 const metrics={discoverySearches:0,physicalSearches:0,discoverySearchSteps:0,discoverySmoothSteps:0,discoveryLOS:0,physicalLOS:0,discoveryPoints:0},trace=[];let smoothing=false;
 NavGrid.prototype.canStep=function(...args){if(this!==fac.nav)metrics[smoothing?'discoverySmoothSteps':'discoverySearchSteps']++;return oldStep.apply(this,args);};
 NavGrid.prototype.findPath=function(...args){metrics[this===fac.nav?'physicalSearches':'discoverySearches']++;return (fn===legacyPlan?legacyFindPath:oldPath).apply(this,args);};
 NavGrid.prototype.gridLOS=function(...args){metrics[this===fac.nav?'physicalLOS':'discoveryLOS']++;const before=smoothing;smoothing=true;try{return oldLOS.apply(this,args);}finally{smoothing=before;}};
 NavGrid.prototype.toWorld=function(...args){if(this!==fac.nav)metrics.discoveryPoints++;return oldWorld.apply(this,args);};
 const options=callbacks?callbacks(trace):undefined;
 try{return {plan:fn(fac,options),metrics,trace};}finally{NavGrid.prototype.canStep=oldStep;NavGrid.prototype.findPath=oldPath;NavGrid.prototype.gridLOS=oldLOS;NavGrid.prototype.toWorld=oldWorld;}
}
function compare(fac,label,{callbacks,report=false}={}){
 const walk=fac.nav.walk.slice(),locks=[...fac.nav.blockedEdges],doorRefs=fac.doors.slice(),doorState=fac.doors.map(d=>[d.kind,{...d.info},d.locked,d.open,d.collider?.handle]),fingerprint=descentFingerprint21(fac),old=capture(legacyPlan,fac,callbacks),next=capture(planDescent21,fac,callbacks);
 assert.deepEqual(next.plan,old.plan,label+': complete plan');assert.deepEqual(next.trace,old.trace,label+': unchanged physical placement callbacks');
 assert.deepEqual(fac.nav.walk,walk,label+': furniture mask unchanged');assert.deepEqual([...fac.nav.blockedEdges],locks,label+': native locks unchanged');assert.deepEqual(descentFingerprint21(fac),fingerprint,label+': certificate input unchanged');
 assert.deepEqual(fac.doors.map(d=>[d.kind,{...d.info},d.locked,d.open,d.collider?.handle]),doorState,label+': native doors unchanged');for(let i=0;i<doorRefs.length;i++)assert.equal(fac.doors[i],doorRefs[i]);
 assert.equal(next.metrics.physicalSearches,old.metrics.physicalSearches,label+': real placement searches preserved');assert.equal(next.metrics.physicalLOS,old.metrics.physicalLOS,label+': placement smoothing preserved');
 assert.equal(next.metrics.discoverySearches,old.metrics.discoverySearches,label+': exact A* searches preserved');assert.equal(next.metrics.discoverySearchSteps,old.metrics.discoverySearchSteps,label+': exact A* work preserved');
 assert.equal(next.metrics.discoveryLOS,0,label+': discovery discarded smoothing removed');assert.equal(next.metrics.discoverySmoothSteps,0,label+': discovery discarded smoothing steps removed');assert.equal(next.metrics.discoveryPoints,0,label+': discarded waypoint construction removed');
 if(report)console.log(label,JSON.stringify({rooms:next.plan?.discoveryRooms.length,old:old.metrics,next:next.metrics}));return {old,next};
}
const cases=[['factory',295221521,.68,{arch:'atrium',roomMul:1.05}],['factory',17,.68,{arch:'ring',roomMul:1.05}],['threadarchive',17,1.35],['bufferfoundry',42,1.35],['backrooms',17,1.35],['nullreception',42,1.35]];
let checked=0;
for(const [theme,seed,size,opts] of cases){
 const fac=fixture(theme,seed,size,opts),label=theme+'/'+seed;const initial=compare(fac,label+'/closed',{report:true});assert.ok(initial.next.plan,label+': real native plan exists');
 const r=fac.layout.rooms.find(r=>!excluded(r)&&r.type!=='entrance');if(r){const x=fac.layout.ox+(r.cx+.5)*fac.layout.cell,z=fac.layout.oz+(r.cz+.5)*fac.layout.cell;fac.nav.blockBox(x-2.5,z-2.5,x+2.5,z+2.5,0);compare(fac,label+'/centerblocked');}
 for(const d of fac.doors)if(d.kind==='door')d.info.required=true;compare(fac,label+'/allrequired');
 fac.nav.walk.fill(0);const empty=compare(fac,label+'/nowalk');assert.equal(empty.next.plan,null);checked+=4;
}
// Local lifecycle: changing required flags or furniture must affect the next plan.
{
 const fac=fixture('factory',17,.68,{arch:'ring',roomMul:1.05}),first=compare(fac,'mutation-before').next.plan;
 assert.ok(first.discoveryRooms.length>0);
 for(const d of fac.doors)if(d.kind==='door')d.info.required=true;
 const changed=compare(fac,'mutation-required').next.plan;assert.equal(changed.discoveryRooms.length,0,'required entry gate is never relaxed');
 for(const d of fac.doors)if(d.kind==='door')delete d.info.required;
 assert.deepEqual(compare(fac,'mutation-restored').next.plan,first,'new plan follows restored lock metadata without cached state');
 const callbacks=trace=>{let denied=2;return {clear:(...args)=>{trace.push(['clear',...args]);return denied--<=0;},reachable:(...args)=>{trace.push(['reachable',...args]);return true;}};};
 compare(fac,'placement-callbacks',{callbacks});checked+=4;
}
// Large native grids keep the exact same search, fixed heap and caller budget.
compare(fixture('factory',17,2.6),'large-native-grid',{report:true});checked++;
assert.equal(typeof NavGrid.prototype.hasPath,'function','native hasPath API');
function direct(nav,args,label){
 const expected=legacyFindPath.call(nav,...args),actual=nav.hasPath(...args);assert.equal(actual,!!expected,label+': existence agrees with frozen native search');assert.equal(typeof actual,'boolean');assert.deepEqual(nav.findPath(...args),expected,label+': default full path is unchanged');
}
{
 const fac=fixture('factory',17,.68,{arch:'atrium'}),nav=fac.nav,L=fac.layout,entry=fac.mainDoor?.info.a??L.entrySources[0],sx=L.ox+(entry%L.w+.5)*L.cell,sz=L.oz+(Math.floor(entry/L.w)+.5)*L.cell;
 for(const r of L.rooms){const tx=L.ox+(r.cx+.5)*L.cell,tz=L.oz+(r.cz+.5)*L.cell;for(const limit of [0,1,3,90000])direct(nav,[sx,sz,tx,tz,limit],'maxIter/'+r.id+'/'+limit);}
 nav.blockedEdges.clear();
 for(const r of L.rooms){const tx=L.ox+(r.cx+.5)*L.cell,tz=L.oz+(r.cz+.5)*L.cell;direct(nav,[sx,sz,tx,tz,90000],'open-route/'+r.id);}
 direct(nav,[sx,sz,sx,sz,0],'same-cell succeeds despite zero budget');assert.deepEqual(nav.findPath(sx,sz,sx,sz,0),[{x:sx,z:sz}],'same-cell default array retained');
 const r=L.rooms.find(r=>r.type!=='entrance'&&!excluded(r)),tx=L.ox+(r.cx+.5)*L.cell,tz=L.oz+(r.cz+.5)*L.cell,[gx,gz]=nav.toGrid(tx,tz);
 for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)if(nav.inside(gx+dx,gz+dz))nav.walk[(gz+dz)*nav.w+gx+dx]=0;
 assert.equal(nav.nearestWalkable(gx,gz,2),null);assert.ok(nav.nearestWalkable(gx,gz,4),'native radius-4 fallback exists');direct(nav,[sx,sz,tx,tz,90000],'blocked target with radius-4 fallback');
 // A deliberately constrained native heap stresses duplicate pushes/capacity.
 // We preserve legacy outcomes rather than fixing or bypassing its heap here.
 const nativeHeap=nav.heap;for(const capacity of [1,2,8,nativeHeap.length]){nav.heap=new Int32Array(capacity);direct(nav,[sx,sz,tx,tz,128],'heap-capacity/'+capacity);}nav.heap=nativeHeap;
 nav.curStamp=4e9;direct(nav,[sx,sz,tx,tz,90000],'native stamp rollover');
 nav.walk.fill(0);assert.equal(nav.hasPath(sx,sz,tx,tz),false);assert.equal(nav.findPath(sx,sz,tx,tz),null,'missing entry and target preserve null');checked++;
}
// One real furnished facility proves final native furniture/locks, not just a layout snapshot.
await initPhysics();
{
 const ph=new Physics(),fac=buildFacility(generateLayout(17,'factory',.68,{arch:'ring',roomMul:1.05}),{physics:ph,lightPool:{add:e=>e,remove(){}}});
 try{ph.world.step();const colliderRefs=fac.colliders.slice(),bodyCount=ph.info.size;compare(fac,'actual-furnished-factory-ring',{report:true});assert.deepEqual(fac.colliders,colliderRefs,'no native collider removal');assert.equal(ph.info.size,bodyCount,'no native body changes');}
 finally{fac.dispose(ph);assert.equal(ph.info.size,0);ph.world.free();}checked++;
}
console.log('descent29 exact native reachability planning PASS',checked,'scenario groups');
