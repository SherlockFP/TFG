export const DESCENT21_RULE_TEXT=Object.freeze({
 quiet:{en:'Quiet intake: explore the floor and find the downward lift.',tr:'Sessiz kabul: katı keşfet ve aşağı inen asansörü bul.',ru:'Тихий приём: исследуйте этаж и найдите лифт вниз.'},
 archive:{en:'Split archive: valuable records lie in side rooms. Keep a return route.',tr:'Dağılmış arşiv: değerli kayıtlar yan odalarda. Dönüş yolunu koru.',ru:'Разделённый архив: ценные записи лежат в боковых комнатах. Сохраняйте путь назад.'},
 listening:{en:'Listening floor: carry quietly. Noise can draw existing residents.',tr:'Dinleyen kat: yükünü sessiz taşı. Gürültü mevcut sakinleri çekebilir.',ru:'Слушающий этаж: переносите груз тихо. Шум может привлечь обитателей.'},
 inspection:{en:'Inspection floor: visible cargo can attract an archive inspector. Put it away and break sight.',tr:'Denetim katı: görünür yük arşiv denetçisini çekebilir. Çantaya koy ve görüşü kes.',ru:'Этаж проверки: видимый груз может привлечь архивного инспектора. Уберите его и скройтесь из виду.'},
 heavy:{en:'Processing floor: heavy residents may move loose props. Watch their windup and leave room to retreat.',tr:'İşleme katı: ağır sakinler yerdeki eşyaları itebilir. Hazırlıklarını izle ve geri çekilmek için yer bırak.',ru:'Этаж обработки: тяжёлые обитатели могут толкать свободные предметы. Следите за подготовкой удара и оставляйте путь для отхода.'}
});
export function descentRuleText(rule,lang='en'){const row=DESCENT21_RULE_TEXT[rule]||DESCENT21_RULE_TEXT.quiet;return row[lang]||row.en;}
