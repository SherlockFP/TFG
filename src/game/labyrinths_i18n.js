// [labyrinths] Turkish + Russian strings (English is the key). Registered from labyrinths.js and imported by core/terminal so the moon list has them at boot.
import { addTranslations } from '../core/i18n.js';

export const TR = {
  'Hazard': 'Tehlike', 'HAZARD': 'TEHLİKE',
  'A ghost train runs the tunnel. Horn + red lights = get into an alcove.': 'Tünelde bir hayalet tren koşuyor. Korna + kırmızı ışık = bir girintiye gir.',
  'Vine walls can be cut with a melee weapon. Spore puffs blur your vision.': 'Sarmaşık duvarlar yakın dövüş silahıyla kesilir. Spor bulutları görüşünü bulanıklaştırır.',
  'GHOST TRAIN INBOUND - get into an alcove!': 'HAYALET TREN GELİYOR - bir girintiye gir!',
  'Vine wall cut. A shortcut opens.': 'Sarmaşık duvar kesildi. Bir kısayol açıldı.',
  'Spores! Your vision blurs.': 'Sporlar! Görüşün bulanıyor.',
  'was flattened by the ghost train.': 'hayalet trenin altında kaldı.',
  'A swampy old message board. Frequent rain. Ponds full of phish. An overgrown hydroponics greenhouse hides the good scrap: cut the vines.': 'Bataklık bir eski mesaj panosu. Sık yağmur. Göletler phish dolu. Sarmaşıkla kaplı bir hidroponik sera iyi hurdayı saklıyor: sarmaşıkları kes.',
  'Red desert of dead chatrooms. An abandoned subway runs under the mesa, and the ghost trains still keep their schedule. Something digs under the sand.': 'Ölü sohbet odalarının kızıl çölü. Platonun altında terk edilmiş bir metro uzanıyor, hayalet trenler hâlâ tarifelerine uyuyor. Kumun altında bir şey kazıyor.',
  'Inside: a dead subway. Ghost trains still run the tunnel.': 'İçerisi: ölü bir metro. Hayalet trenler tünelde hâlâ koşuyor.',
  'Inside: a feral hydroponics greenhouse. Vines and spores.': 'İçerisi: vahşileşmiş bir hidroponik sera. Sarmaşık ve spor.',
};
export const RU = {
  'The Packet Subway': 'Пакетное метро', 'Link Rot Greenhouse': 'Оранжерея гнилых ссылок',
  'Ghost trains still run the old routes. When the horn sounds, get into an alcove.': 'Поезда-призраки всё ещё ходят по старым линиям. Услышал гудок — прячься в нишу.',
  'Hydroponics gone feral. Cut the vines for shortcuts, hold your breath in the spores.': 'Одичавшая гидропоника. Руби лианы ради коротких путей, задерживай дыхание в спорах.',
  'Hazard': 'Опасность', 'HAZARD': 'ОПАСНОСТЬ',
  'A ghost train runs the tunnel. Horn + red lights = get into an alcove.': 'По тоннелю несётся поезд-призрак. Гудок + красные огни = в нишу.',
  'Vine walls can be cut with a melee weapon. Spore puffs blur your vision.': 'Стены из лиан рубятся оружием ближнего боя. Облака спор размывают зрение.',
  'GHOST TRAIN INBOUND - get into an alcove!': 'ПОЕЗД-ПРИЗРАК ИДЁТ - в нишу!',
  'Vine wall cut. A shortcut opens.': 'Стена из лиан прорублена. Открылся короткий путь.',
  'Spores! Your vision blurs.': 'Споры! Зрение размывается.',
  'was flattened by the ghost train.': 'был раздавлен поездом-призраком.',
  'A swampy old message board. Frequent rain. Ponds full of phish. An overgrown hydroponics greenhouse hides the good scrap: cut the vines.': 'Болотистый старый форум. Частые дожди. Пруды полны фишинга. В заросшей гидропонной оранжерее спрятан лучший хлам: руби лианы.',
  'Red desert of dead chatrooms. An abandoned subway runs under the mesa, and the ghost trains still keep their schedule. Something digs under the sand.': 'Красная пустыня мёртвых чатов. Под плато тянется заброшенное метро, поезда-призраки всё ещё ходят по расписанию. Что-то роет под песком.',
  'Inside: a dead subway. Ghost trains still run the tunnel.': 'Внутри: мёртвое метро. По тоннелю всё ещё ходят поезда-призраки.',
  'Inside: a feral hydroponics greenhouse. Vines and spores.': 'Внутри: одичавшая гидропонная оранжерея. Лианы и споры.',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
