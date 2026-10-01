// Mode-only destinations: ordinary expedition economy/directors do not populate them.
import {registerMoon,MOONS} from './moons.js';
import {addTranslations} from '../core/i18n.js';
const rows=[
 ['letter24','31-Dead Letter','Dead Letter','deadletter24','moor','The return bays shelter a longer route around an exposed sorting spine.','İade bölmeleri açık tasnif hattının çevresinde uzun bir siperli yol oluşturur.','Возвратные отсеки укрывают длинный обход открытой сортировочной линии.'],
 ['switch24','42-Muted Exchange','Muted Exchange','mutedswitch24','swamp','Disconnected booths surround the switchboard court. Choose a direct approach or the outer ring.','Bağlantısı kesik bölmeler santral avlusunu çevreler. Doğrudan yolu veya dış halkayı seç.','Отключённые кабины окружают коммутатор. Выберите прямой путь или внешнее кольцо.'],
 ['permit24','64-Expired Permission','Expired Permission','permissions24','desert','Two access galleries meet the archive court. Service cover offers a longer return.','İki erişim galerisi arşiv avlusunda birleşir. Servis siperi daha uzun bir dönüş sunar.','Две галереи сходятся в архивном дворе. Служебные укрытия дают длинный путь назад.'],
];
for(const [index,lang]of [[6,'tr'],[7,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[5],r[index]])),lang);
addTranslations({'31-Dead Letter':'31-İade Posta','42-Muted Exchange':'42-Sessiz Santral','64-Expired Permission':'64-Süresi Dolmuş İzin','Dead Letter':'İade Posta','Expired Permission':'Süresi Dolmuş İzin'},'tr');
addTranslations({'31-Dead Letter':'31-Невручённые письма','42-Muted Exchange':'42-Безмолвный коммутатор','64-Expired Permission':'64-Истёкшее разрешение','Dead Letter':'Невручённые письма','Expired Permission':'Истёкшее разрешение'},'ru');
export const LAB24_MOON_DEFS=Object.freeze(rows.map(([id,name,short,interior,biome,desc])=>Object.freeze({id,name,short,interior,biome,desc,tier:1,cost:0,size:1.1,instance:true,deadletter24:true,weather:['clear'],scrapCount:[0,0],scrapMul:1,power:0,outdoorPower:0,creatures:{},outdoor:{}})));
export const LAB24_FIELD_MOON_DEFS=Object.freeze(LAB24_MOON_DEFS.map((def,i)=>{
 const {instance,deadletter24,...field}=def;
 return Object.freeze({...field,id:['letterfield24','switchfield24','permitfield24'][i],tier:i===2?2:1,cost:[0,40,95][i],power:i===2?5:4,outdoorPower:i===2?3:2,scrapCount:i===2?[14,18]:[12,16],scrapMul:i===2?1.15:1.05,
  creatures:{scuttler:22,yoinker:18,crawler:12,spider:10,leech:8,lurker:6,...(i===1?{hound:8}:{}),...(i===2?{mannequin:6}: {})},outdoor:{hound:4,...(i===2?{sandkefal:2}: {})}});
}));
export function registerLab24Moons(){
 // Mode admission references native definitions directly. Normal terminal charts
 // and text route resolution iterate MOON_ORDER and must not offer empty trials.
 for(const def of LAB24_MOON_DEFS)MOONS[def.id]={...def};
 return [...LAB24_MOON_DEFS,...LAB24_FIELD_MOON_DEFS.map(def=>registerMoon(def))];
}
