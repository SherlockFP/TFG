export const DESCENT21_RULE_TEXT=Object.freeze({
 liminal:{en:'Unindexed space: listen before rushing. The same lift returns your crew and cargo to the surface.',tr:'İndeks dışı alan: koşmadan önce dinle. Aynı asansör ekibi ve yükü yüzeye geri götürür.',ru:'Неиндексированное пространство: слушайте перед рывком. Этот же лифт вернёт экипаж и груз на поверхность.'},
 receipt:{en:'Null Reception: loud sounds replay after 3s. Leave an echo behind, then walk quietly. The lift still returns to the surface.',tr:'Boş Karşılama: yüksek sesler 3 sn sonra tekrarlanır. Arkada bir yankı bırak, sonra sessiz yürü. Asansör yine yüzeye döner.',ru:'Пустая приёмная: громкие звуки повторяются через 3 с. Оставьте эхо позади и идите тихо. Лифт вернёт на поверхность.'},
 quiet:{en:'Quiet intake: explore the floor and find the downward lift.',tr:'Sessiz kabul: katı keşfet ve aşağı inen asansörü bul.',ru:'Тихий приём: исследуйте этаж и найдите лифт вниз.'},
 archive:{en:'Split archive: valuable records lie in side rooms. Keep a return route.',tr:'Dağılmış arşiv: değerli kayıtlar yan odalarda. Dönüş yolunu koru.',ru:'Разделённый архив: ценные записи лежат в боковых комнатах. Сохраняйте путь назад.'},
 listening:{en:'Listening floor: carry quietly. Noise can draw existing residents.',tr:'Dinleyen kat: yükünü sessiz taşı. Gürültü mevcut sakinleri çekebilir.',ru:'Слушающий этаж: переносите груз тихо. Шум может привлечь обитателей.'},
 inspection:{en:'Inspection floor: visible cargo can attract an archive inspector. Put it away and break sight.',tr:'Denetim katı: görünür yük arşiv denetçisini çekebilir. Çantaya koy ve görüşü kes.',ru:'Этаж проверки: видимый груз может привлечь архивного инспектора. Уберите его и скройтесь из виду.'},
 heavy:{en:'Processing floor: heavy residents may move loose props. Watch their windup and leave room to retreat.',tr:'İşleme katı: ağır sakinler yerdeki eşyaları itebilir. Hazırlıklarını izle ve geri çekilmek için yer bırak.',ru:'Этаж обработки: тяжёлые обитатели могут толкать свободные предметы. Следите за подготовкой удара и оставляйте путь для отхода.'}
});
export function descentRuleText(rule,lang='en'){const row=DESCENT21_RULE_TEXT[rule]||DESCENT21_RULE_TEXT.quiet;return row[lang]||row.en;}

const DESTINATIONS={backrooms:{en:'Backrooms — unindexed route',tr:'Backrooms — indeks dışı rota',ru:'Backrooms — неиндексированный путь'},nullreception:{en:'Null Reception — undelivered messages',tr:'Boş Karşılama — teslim edilemeyen mesajlar',ru:'Пустая приёмная — недоставленные сообщения'}};
export function descentDestinationText(spec,lang='en'){
 const name=DESTINATIONS[spec?.theme],label=name?(name[lang]||name.en):({en:'ordinary archive',tr:'normal arşiv',ru:'обычный архив'}[lang]||'ordinary archive');
 const format={en:'Next: depth {n} · {name}',tr:'Sonraki: derinlik {n} · {name}',ru:'Далее: глубина {n} · {name}'}[lang]||'Next: depth {n} · {name}';
 return format.replace('{n}',String(spec?.depth??0)).replace('{name}',label);
}
