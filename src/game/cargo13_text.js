import { addTranslations, t } from '../core/i18n.js';
const rows=[
 ['Take trolley through doorway [E]','Yük arabasıyla kapıdan geç [E]','Пройти с тележкой через дверь [E]'],
 ['Cargo trolley: push [E]','Yük arabası: sür [E]','Тележка: толкать [E]'],
 ['Cargo trolley: release handles [E]','Yük arabası: tutacağı bırak [E]','Тележка: отпустить ручки [E]'],
 ['Load held item [E]','Eldeki eşyayı yükle [E]','Положить предмет из рук [E]'],
 ['Load nearby item [E]','Yakındaki eşyayı yükle [E]','Погрузить ближайший предмет [E]'],
 ['Unload one [E]','Bir eşyayı indir [E]','Выгрузить один предмет [E]'],
 ['Unload all [E]','Tüm yükü indir [E]','Выгрузить всё [E]'],
 ['Trolley occupied','Yük arabası kullanımda','Тележка занята'],
 ['Trolley: 8 items, 120 weight. Stop to load or unload.','Yük arabası: 8 eşya, 120 ağırlık. Yüklemek veya indirmek için dur.','Тележка: 8 предметов, вес 120. Остановись для погрузки.'],
 ['Trolley request refused: stop nearby and check capacity.','Araba işlemi reddedildi: yanında dur ve kapasiteyi kontrol et.','Запрос отклонён: остановись рядом и проверь вместимость.'],
 ['Steer with movement and view; use handles [E] to release.','Hareket ve bakışla yönlendir; bırakmak için tutacakta [E].','Управляй движением и взглядом; отпусти ручки [E].']
];addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[1]])));addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[2]])),'ru');export const tx=t;
