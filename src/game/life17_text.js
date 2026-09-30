import { addTranslations } from '../core/i18n.js';
export const LIFE17_TEXT=[
 ['Sealed city parcel','Mühürlü şehir paketi','Запечатанная городская посылка'],
 ['Deliver to the amber-marked city recipient. Not for sale.','Sarı işaretli şehir alıcısına teslim et. Satılamaz.','Доставьте городскому получателю с янтарной меткой. Не продаётся.'],
 ['Dispatch clerk / optional parcel [E]','Sevkiyat görevlisi / isteğe bağlı paket [E]','Диспетчер / необязательная посылка [E]'],
 ['Carry a sealed parcel to the amber recipient for 12 crew credits. Replaces today’s survey reward.','Mühürlü paketi sarı işaretli alıcıya götür: ekibe 12 kredi. Bugünkü araştırma ödülünün yerine geçer.','Отнесите посылку получателю с янтарной меткой за 12 кредитов экипажу. Заменяет сегодняшнюю награду исследования.'],
 ['Parcel recipient / talk [E]','Paket alıcısı / konuş [E]','Получатель посылки / поговорить [E]'],
 ['Deliver sealed parcel [E]','Mühürlü paketi teslim et [E]','Доставить запечатанную посылку [E]'],
 ['Carry the parcel in hand or bag. Any crew member may deliver it.','Paketi elinde veya çantanda taşı. Her ekip üyesi teslim edebilir.','Несите посылку в руках или сумке. Доставить может любой член экипажа.'],
 ['Parcel ready. Carry it to the amber-marked recipient across the plaza. Your crew may pass it between players.','Paket hazır. Meydanın karşısındaki sarı işaretli alıcıya götür. Ekip üyeleri paketi birbirine verebilir.','Посылка готова. Отнесите её получателю с янтарной меткой через площадь. Её можно передавать между игроками.'],
 ['Carry the sealed parcel to deliver it.','Teslim etmek için mühürlü paketi taşı.','Для доставки несите запечатанную посылку.'],
 ['City delivery complete: +12 crew credits. This replaces today’s survey or barter reward.','Şehir teslimatı tamamlandı: ekibe +12 kredi. Bugünkü araştırma veya takas ödülünün yerine geçer.','Городская доставка завершена: +12 кредитов экипажу. Заменяет сегодняшнюю награду исследования или обмена.'],
 ['Amber seal, mint dispatch. Our parcels have routes; our travelers have stories.','Sarı mühür, yeşil sevkiyat. Paketlerin rotaları, yolcuların hikâyeleri var.','Янтарная печать, мятная отправка. У посылок есть маршруты, у путешественников — истории.'],
 ['I collect sealed manifests, not loose scrap. A quiet walk can still help the crew.','Mühürlü belgeleri toplarım, hurda değil. Sakin bir yürüyüş de ekibe yardım edebilir.','Я собираю запечатанные документы, а не лом. Спокойная прогулка тоже помогает экипажу.'],
 ['City delivery closed on departure. The temporary parcel was returned; today’s reward is still available.','Şehir teslimatı kalkışta kapandı. Geçici paket geri verildi; bugünkü ödül hâlâ alınabilir.','Городская доставка закрыта при отбытии. Временная посылка возвращена; сегодняшняя награда ещё доступна.'],
];
for(const [i,lang]of [[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(LIFE17_TEXT.map(r=>[r[0],r[i]])),lang);
