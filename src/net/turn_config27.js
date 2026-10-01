// Shared optional TURN configuration. Malformed local entries must not break a join.
const MAX_SERVERS=8,MAX_URLS=8,MAX_INPUT=16384,MAX_URL=512,MAX_AUTH=2048;
function turnUrl(value){
 if(typeof value!=='string')return null;
 const s=value.trim();if(!s||s.length>MAX_URL)return null;
 const m=/^(turns?):(\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i.exec(s);
 if(!m||m[3]&&(Number(m[3])<1||Number(m[3])>65535))return null;
 try{const host=new URL(`http://${m[2]}`).hostname.toLowerCase();return `${m[1].toLowerCase()}:${host}${m[3]?':'+Number(m[3]):''}${m[4]?'?transport='+m[4].toLowerCase():''}`;}catch{return null;}
}
/** Legacy object/array, JSON string, or raw comma/newline-separated TURN URLs. */
export function normalizeTurnServers(value){
 if(typeof value==='string'){
  if(value.length>MAX_INPUT)return [];
  const s=value.trim();if(!s)return [];
  if(/^[\[{\"]/.test(s)){try{value=JSON.parse(s);}catch{return [];}}
  else value={urls:s};
 }
 const entries=Array.isArray(value)?value.slice(0,MAX_SERVERS*4):[value],out=[],seen=new Set();
 for(let entry of entries){
  try{
   if(typeof entry==='string')entry={urls:entry};
   if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
   if(entry.username!=null&&typeof entry.username!=='string'||entry.credential!=null&&typeof entry.credential!=='string')continue;
   const username=entry.username??'',credential=entry.credential??'';
   if(username.length>MAX_AUTH||credential.length>MAX_AUTH)continue;
   const values=typeof entry.urls==='string'&&entry.urls.length<=MAX_INPUT?entry.urls.split(/[,\r\n]/,MAX_URLS*4):Array.isArray(entry.urls)?entry.urls.slice(0,MAX_URLS*4):[];
   const urls=[];
   for(const value of values){
    const url=turnUrl(value);if(!url)continue;
    const key=JSON.stringify([url,username,credential]);if(seen.has(key))continue;
    seen.add(key);urls.push(url);if(urls.length===MAX_URLS)break;
   }
   if(urls.length)out.push({urls,username,credential});if(out.length===MAX_SERVERS)break;
  }catch{/* Bad legacy entry; continue with its valid siblings. */}
 }
 return out;
}
/** Merge build-time and browser-local relays without exposing credentials in diagnostics. */
export function readTurnServers27(env=import.meta.env||{},storage){
 const entries=[];
 try{if(env?.VITE_TURN_URL)entries.push(...normalizeTurnServers({urls:env.VITE_TURN_URL,username:env.VITE_TURN_USER,credential:env.VITE_TURN_CRED}));}catch{/* Invalid environment entry. */}
 try{
  const local=storage===undefined?(typeof localStorage==='undefined'?null:localStorage):storage;
  const saved=local?.getItem?.('tfg.turn');if(saved)entries.push(...normalizeTurnServers(saved));
 }catch{/* Storage denied or malformed; direct ICE defaults still apply. */}
 return normalizeTurnServers(entries);
}
