import { addTranslations } from '../core/i18n.js';
export const B18 = {
 cut:'Splice console: cut camera feed [E]',
 restore:'Splice console: restore connection [E]',
 choice:'Cuts all feed cameras for up to 150 seconds and closes this service shortcut. The main return route stays open.',
 recover:'Restores your splice. Other outages can keep cameras dark and this shortcut closed.',
 external:'Another outage controls this line. The shortcut follows the actual camera network.',
 blocked:'Clear the service shutter first. Crew and bodies must not be under it.',
 dark:'Camera feed interrupted. Service shortcut closed; use the main street.',
 back:'Splice restored. The shortcut follows the camera network.',
 externalLabel:'Splice console: another outage controls the line',
};
const tr=['Splice konsolu: kamera yayınını kes [E]','Splice konsolu: bağlantıyı geri getir [E]','Tüm yayın kameralarını en fazla 150 saniye kapatır ve bu servis kestirmesini kapatır. Ana dönüş yolu açık kalır.','Senin müdahaleni geri alır. Diğer kesintiler kameraları ve bu kestirmeyi kapalı tutabilir.','Bu hattı başka bir kesinti yönetiyor. Kestirme gerçek kamera ağını izler.','Önce servis kepenginin altını boşalt. Ekip ve cesetler altında olmamalı.','Kamera yayını kesildi. Servis kestirmesi kapalı; ana caddeyi kullan.','Bağlantı geri getirildi. Kestirme kamera ağını izler.','Splice konsolu: hattı başka bir kesinti yönetiyor'];
const ru=['Консоль: отключить камеры [E]','Консоль: восстановить соединение [E]','Отключает все камеры максимум на 150 секунд и закрывает служебный проход. Основной путь назад открыт.','Отменяет ваше отключение. Другие сбои могут оставить камеры и проход отключёнными.','Другой сбой управляет линией. Проход зависит от реальной сети камер.','Освободите место под заслонкой. Там не должно быть экипажа или тел.','Камеры отключены. Служебный проход закрыт; возвращайтесь по главной улице.','Соединение восстановлено. Проход зависит от сети камер.','Консоль: линией управляет другой сбой'];
addTranslations(Object.fromEntries(Object.values(B18).map((key,i)=>[key,tr[i]])),'tr');
addTranslations(Object.fromEntries(Object.values(B18).map((key,i)=>[key,ru[i]])),'ru');
