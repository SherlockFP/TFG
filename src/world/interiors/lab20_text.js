import {addTranslations} from '../../core/i18n.js';
const rows=[
 ['Thread Archive','Yorum Arşivi','Архив веток'],
 ['Buffer Foundry','Tampon Dökümhanesi','Буферная литейная'],
 ['Reply chambers reconnect to a central reading trunk. Side loops hold salvage; every reply has a way back.','Yanıt odaları merkez okuma hattına bağlanır. Yan döngülerde hurda vardır; her yanıtın dönüş yolu bulunur.','Комнаты ответов соединяются с центральной читальной линией. В боковых петлях есть лом; у каждого ответа есть путь назад.'],
 ['Twin processing lanes surround a sorting hall. The outer service loop trades distance for a clear return.','İki işlem hattı ayırma salonunu çevreler. Dış servis döngüsü daha uzun ama açık bir dönüş sunar.','Две линии обработки окружают сортировочный зал. Внешняя сервисная петля длиннее, но даёт свободный путь назад.'],
 ['Replies retained. Authors missing.','Yanıtlar saklandı. Yazarlar kayıp.','Ответы сохранены. Авторы пропали.'],
 ['SORTING / SERVICE BYPASS','AYIRMA / SERVİS GEÇİDİ','СОРТИРОВКА / СЕРВИСНЫЙ ОБХОД'],
];
for(const [i,lang]of [[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
