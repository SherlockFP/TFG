import { addTranslations } from '../core/i18n.js';
const rows=[
 ['ARCHIVE INTAKE / REGISTER CONTENT','ARŞİV KABULÜ / İÇERİĞİ KAYDET','ПРИЁМ АРХИВА / РЕГИСТРАЦИЯ КОНТЕНТА'],
 ['RELAY DOCK / CREW DEPARTURES','RÖLE İSKELESİ / EKİP KALKIŞLARI','РЕЛЕЙНЫЙ ПРИЧАЛ / ОТПРАВЛЕНИЕ'],
 ['FLEET OFFICE / CHOOSE A VESSEL','FİLO OFİSİ / GEMİ SEÇ','ОФИС ФЛОТА / ВЫБОР КОРАБЛЯ'],
 ['BOARDING / SELECTED VESSEL','BİNİŞ / SEÇİLİ GEMİ','ПОСАДКА / ВЫБРАННЫЙ КОРАБЛЬ'],
 ['SUPPLIES / FIELD WORKSHOP','MALZEMELER / SAHA ATÖLYESİ','СНАБЖЕНИЕ / ПОЛЕВАЯ МАСТЕРСКАЯ'],
 ['CONTENT IN / SIGNAL OUT','İÇERİK GİRİŞİ / SİNYAL ÇIKIŞI','КОНТЕНТ ВХОДИТ / СИГНАЛ ВЫХОДИТ'],
 ['DELIVERY COUNTER / RING ONCE','TESLİM TEZGÂHI / BİR KEZ ZİL ÇAL','ПРИЛАВОК СДАЧИ / ОДИН ЗВОНОК'],
 ['THE HOUSE / CASINO & CHIPS','KUMARHANE / OYUN VE FİŞELER','КАЗИНО / ИГРЫ И ФИШКИ'],
 ['ARCHIVE / CONTENT EXCHANGE','ARŞİV / İÇERİK TAKASI','АРХИВ / БИРЖА КОНТЕНТА'],
 ['CREW CONTRACTS','EKİP SÖZLEŞMELERİ','КОНТРАКТЫ ЭКИПАЖА'],
 ['STAY INSIDE THE MARKED LANES','İŞARETLİ ŞERİTLERİN İÇİNDE KAL','ДЕРЖИТЕСЬ РАЗМЕЧЕННЫХ ПОЛОС'],
];
for(const [i,lang]of [[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
