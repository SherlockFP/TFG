import { addTranslations } from '../core/i18n.js';
const lines=[
 ['Helper repair {n}% — free to explore','Yardımcı tamiri %{n} — keşfedebilirsin','Ремонт помощником {n}% — можно исследовать'],
 ['Survey replacement fuse','Araştırma yedek sigortası','Запасной предохранитель разведчика'],
 ['Accept survey recovery [E]','Araştırma drone kurtarmasını kabul et [E]','Принять ремонт разведчика [E]'],
 ['Accept quiet uplink [E]','Sessiz bağlantıyı kabul et [E]','Принять тихий канал связи [E]'],
 ['Carry the marked fuse here, install it, then stay nearby to repair. No deadline.','Yoldaki sarı ışıklı tepsiden sigortayı buraya taşı ve tak. Tamir için yakında kal. Süre sınırı yok.','Принеси предохранитель с жёлтого лотка на тропе, установи и оставайся рядом для ремонта. Без срока.'],
 ['Stay within four metres and keep nearby footsteps and voices quiet. Progress pauses safely.','Dört metre içinde kal; yakındaki adımları ve sesleri sessiz tut. İlerleme güvenle duraklar.','Оставайся в четырёх метрах; шаги и голоса рядом должны быть тихими. Прогресс сохраняется.'],
 ['Install carried survey fuse [E]','Taşınan araştırma sigortasını tak [E]','Установить принесённый предохранитель [E]'],
 ['Collect field salvage [E]','Saha hurdasını al [E]','Забрать полевой лом [E]'],
 ['Assistant repairs in 32 seconds while you explore. Manual repair takes 24 seconds nearby.','Yardımcı sen keşfederken 32 saniyede tamir eder. Kendin yakında 24 saniyede tamir edebilirsin.','Помощник чинит за 32 секунды, пока ты исследуешь. Самостоятельный ремонт рядом занимает 24 секунды.'],
 ['Field work {n}% — stay nearby','Saha işi %{n} — yakında kal','Полевая работа {n}% — оставайся рядом'],
 ['Field work complete. Collect the salvage at the console.','Saha işi tamamlandı. Konsoldan hurdayı al.','Полевая работа завершена. Забери лом у консоли.'],
];
for(const [lang,i]of [['tr',1],['ru',2]])addTranslations(Object.fromEntries(lines.map(a=>[a[0],a[i]])),lang);
