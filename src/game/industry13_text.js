import { addTranslations } from '../core/i18n.js';
const rows = [
['Collect your order beside the field broker.','Siparişini saha tüccarının yanından al.','Забери заказ рядом с полевым брокером.'],
['FIELD BROKER / WORKSHOP','SAHA TÜCCARI / ATÖLYE','ПОЛЕВОЙ БРОКЕР / МАСТЕРСКАЯ'],
['Talk to the field broker [E]','Saha tüccarıyla konuş [E]','Поговорить с брокером [E]'],
['TOOLS','EKİPMAN','СНАРЯЖЕНИЕ'],['PRODUCTION','ÜRETİM','ПРОИЗВОДСТВО'],['ROBOT SCOUT','ROBOT KEŞİF','РОБОТ-РАЗВЕДЧИК'],
['Rebuilt power cells','Yenilenmiş güç hücreleri','Восстановленные энергоячейки'],['Medic culture','Tıbbi kültür','Медицинская культура'],['Dreamdust contraband','Kaçak Rüyatozu','Контрабандная пыль снов'],
['Commission','Üretimi başlat','Заказать'],['Sell batch','Partiyi sat','Продать партию'],['Dispatch scout','Keşif robotu gönder','Отправить разведчика'],['Collect report','Raporu ve hurdayı al','Забрать отчёт'],
['Completed field shifts','Tamamlanan saha seferleri','Завершённые вылазки'],['Ready batches','Hazır partiler','Готовые партии'],['Customs heat','Gümrük şüphesi','Внимание таможни'],['Workshop bays','Atölye bölmeleri','Места в мастерской'],
['Manufacturing advances after field missions. No offline income.','Üretim saha seferleri sonrası ilerler. Çevrimdışı gelir yok.','Производство продвигается после вылазок. Офлайн-дохода нет.'],
['Dreamdust is fictional contraband. Higher margins, customs may seize a batch.','Rüyatozu kurgu bir kaçak üründür. Kârı yüksek; gümrük partiye el koyabilir.','Пыль снов — вымышленная контрабанда. Доход выше, но таможня может изъять партию.'],
['Meet a field broker to buy supplies. The ship terminal is now a route console.','Malzeme almak için saha tüccarını bul. Gemi terminali artık rota konsolu.','Припасы продаёт полевой брокер. Терминал корабля теперь управляет маршрутом.'],
['Approach the broker before ordering.','Sipariş vermeden önce tüccara yaklaş.','Подойдите к брокеру перед заказом.'],
['Invalid ledger.','Geçersiz hesap.','Неверный счёт.'],['Not enough credits or production bays are full.','Kredi yetersiz veya üretim bölmeleri dolu.','Недостаточно кредитов или мастерская занята.'],
['Batch commissioned. Complete field shifts, then collect at a broker.','Üretim başladı. Saha seferlerini tamamla, sonra tüccara dön.','Партия заказана. Завершите вылазки и вернитесь к брокеру.'],
['No finished batch to sell.','Satılacak hazır parti yok.','Нет готовой партии.'],['Broker budget spent. Return after another field shift.','Tüccarın bütçesi bitti. Yeni seferden sonra dön.','Бюджет брокера исчерпан. Вернитесь после вылазки.'],
['Customs seized the contraband batch. No payout.','Gümrük kaçak partiye el koydu. Ödeme yok.','Таможня изъяла партию. Выплаты нет.'],
['Batch sold. Side income does not count toward the content quota.','Parti satıldı. Ek gelir içerik kotasına sayılmaz.','Партия продана. Побочный доход не учитывается в квоте.'],
['Scout is busy, report is unclaimed, or credits are short.','Robot meşgul, rapor alınmamış veya kredi yetersiz.','Разведчик занят, отчёт не забран или мало кредитов.'],
['Scout dispatched. Return after two field shifts for salvage and a route report.','Robot gönderildi. Hurda ve rota raporu için iki saha seferinden sonra dön.','Разведчик отправлен. Заберите добычу и отчёт после двух вылазок.'],
['No scout report yet.','Henüz keşif raporu yok.','Отчёт ещё не готов.'],['Scout salvage collected. The surveyed route has a forecast.','Robotun hurdası alındı. İncelenen rotanın hava tahmini hazır.','Добыча разведчика получена. Прогноз маршрута готов.'],
['Unknown workshop order.','Bilinmeyen atölye siparişi.','Неизвестный заказ.'],['Scout report','Keşif raporu','Отчёт разведчика'],['Shifts remaining','Kalan sefer','Осталось вылазок'],
];
for (const [i, lang] of [[1,'tr'],[2,'ru']]) addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
