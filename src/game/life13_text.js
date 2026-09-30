import { addTranslations } from '../core/i18n.js';
export const LIFE13_TEXT=[
 ['Talk to an alien traveler [E]','Uzaylı yolcuyla konuş [E]','Поговорить с инопланетным путешественником [E]'],
 ['Relay Dock is where crews meet. Choose a vessel together, then board at the departure kiosk.','Röle İskelesi ekiplerin buluşma yeri. Birlikte gemi seçin, sonra kalkış noktasından binin.','На Релейном причале встречаются экипажи. Выберите корабль вместе и садитесь у терминала отправления.'],
 ['The Algorithm buys content. The House buys hope. I prefer the contract desk: at least the terms are written down.','Algoritma içerik satın alır. Kumarhane umut satın alır. Ben sözleşme masasını tercih ederim: en azından şartlar yazılı.','Алгоритм покупает контент. Казино покупает надежду. Я предпочитаю стол контрактов: условия хотя бы записаны.'],
 ['Our crew used to chase every noise. Now we watch the cameras and save our strength for the return trip.','Ekibimiz eskiden her sesin peşinden giderdi. Şimdi kameraları izleyip dönüş yoluna güç saklıyoruz.','Раньше мы бежали на каждый звук. Теперь следим за камерами и бережём силы для обратного пути.'],
 ['We are surveyors, not soldiers. Help mark the field beacon, or sell us one carried scrap. One crew reward each day.','Biz araştırmacıyız, asker değil. Saha işaretini kontrol et veya taşıdığın bir hurdayı bize sat. Her gün ekip başına tek ödül.','Мы исследователи, а не солдаты. Проверьте полевой маяк или продайте один предмет лома. Одна награда экипажу в день.'],
 ['Accept a field survey [E]','Saha araştırmasını kabul et [E]','Принять полевое исследование [E]'],
 ['Optional survey: visit the mint beacon, then return to a surveyor. Reward: 18 crew credits.','İsteğe bağlı araştırma: yeşil işareti ziyaret et, sonra araştırmacıya dön. Ödül: ekibe 18 kredi.','Необязательное исследование: посетите мятный маяк и вернитесь к исследователю. Награда: 18 кредитов экипажу.'],
 ['Mark the field beacon [E]','Saha işaretini kaydet [E]','Отметить полевой маяк [E]'],
 ['Survey marked. Return to a surveyor for payment.','Araştırma kaydedildi. Ödeme için araştırmacıya dön.','Исследование отмечено. Вернитесь к исследователю за оплатой.'],
 ['Report survey / collect 18 credits [E]','Araştırmayı bildir / 18 kredi al [E]','Доложить / получить 18 кредитов [E]'],
 ['Barter cheapest carried scrap for up to 12 credits [E]','Taşıdığın en ucuz hurdayı en fazla 12 krediye takas et [E]','Обменять самый дешёвый переносимый лом на сумму до 12 кредитов [E]'],
 ['Barter replaces the survey reward. Scrap is consumed; engagement quota does not increase.','Takas araştırma ödülünün yerine geçer. Hurda tüketilir; etkileşim kotası artmaz.','Обмен заменяет награду исследования. Лом расходуется; квота вовлечённости не растёт.'],
 ['Survey crew reward: +{n} credits.','Araştırma ekip ödülü: +{n} kredi.','Награда экипажу: +{n} кредитов.'],
 ['Bring a sellable scrap in your hands. Equipment and soulbound items are protected.','Elinde satılabilir hurda getir. Ekipman ve sana bağlı eşyalar korunur.','Принесите в руках продаваемый лом. Снаряжение и привязанные предметы защищены.'],
 ['This crew already received its survey reward today.','Bu ekip bugün araştırma ödülünü zaten aldı.','Экипаж уже получил сегодняшнюю награду за исследование.'],
 ['The survey needs a little more time. Keep your progress and return shortly.','Araştırma için biraz daha zaman gerek. İlerlemen korunuyor; az sonra geri dön.','Исследованию нужно ещё немного времени. Прогресс сохранён; скоро возвращайтесь.'],
 ['Optional: visit the field beacon and report back to the surveyors.','İsteğe bağlı: saha işaretini ziyaret et ve araştırmacılara geri bildir.','Необязательно: посетите полевой маяк и доложите исследователям.'],
];
for(const [i,lang]of [[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(LIFE13_TEXT.map(r=>[r[0],r[i]])),lang);
