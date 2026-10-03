// Generation admission travels with the native run before phase builds a map.
// Markerless in-flight saves keep their original geometry and option identity.
const token35=run=>`${run?.moon}:${run?.seed}:${run?.day}`;
const kinds={hamsi:'courtyard',lufer:'concourse'};
function ordinary(moon){return !!moon&&!['company','home','customMap','expedition','goal','instance','core','raid','voyage','ghost'].some(k=>!!moon[k]);}
export function admitOpenPlaces35(run,moon){
 const kind=kinds[run?.moon];return ordinary(moon)&&kind?{version:35,token:token35(run),kind}:null;
}
export function hasOpenPlaces35(run){const r=run?.openPlaces35;return r?.version===35&&r.token===token35(run)&&r.kind===kinds[run?.moon]&&!!r.kind;}
export function surfaceOptions35(run,moon,opts){
 return ordinary(moon)&&hasOpenPlaces35(run)?{...opts,open35:{version:35,kind:run.openPlaces35.kind}}:opts;
}
export function floorOptions35(theme,depth,routeVersion,opts){
 return routeVersion===35&&depth>=3&&theme==='backrooms'?{...opts,open35:{version:35,kind:'reception'}}:opts;
}
export function interiorViewFar35(fac,player,indoor,outdoorFar){
 if(!indoor)return outdoorFar;
 return fac?.layout?.open35?.version===35&&fac.contains?.(player?.pos)&&Number.isFinite(fac.viewFar)?Math.max(46,Math.min(96,fac.viewFar)):46;
}
