import { addTranslations, t } from '../core/i18n.js';
const rows = [
 ['TABLE CLOSED: waiting for a player','MASA BOŞ: oyuncu bekleniyor','СТОЛ ПУСТ: ожидание игрока'],
 ['chips','fiş','фишек'],
 ['Last deal','Son el','Последний раунд'],
 ['Dealer: the reels are settling.','Krupiye: makaralar yavaşlıyor.','Крупье: барабаны останавливаются.'],
 ['Dealer: the wheel is turning.','Krupiye: çark dönüyor.','Крупье: колесо вращается.'],
 ['Broker: checking the packet route.','Simsar: paket rotası kontrol ediliyor.','Брокер: проверяю маршрут пакета.'],
 ['Mica: counting chips.','Mica: fişleri sayıyorum.','Мика: считаю фишки.'],
 ['Dealer: bank it while you can.','Krupiye: fırsat varken kazancını al.','Крупье: забери выигрыш, пока можешь.'],
 ['Dealer: the house keeps this one.','Krupiye: bunu kasa alıyor.','Крупье: этот раунд за казино.'],
 ['Mica: ledger balanced.','Mica: hesap tamam.','Мика: баланс сведён.'],
 ['DEAD SIGNAL CLUB','ÖLÜ SİNYAL KULÜBÜ','КЛУБ МЁРТВОГО СИГНАЛА'],
 ['Cashier Mica [E]','Veznedar Mica [E]','Кассир Мика [E]'],
 ['Signal reels [E]','Sinyal makaraları [E]','Сигнальные барабаны [E]'],
 ['Zero wheel dealer [E]','Sıfır çarkı krupiyesi [E]','Крупье нулевого колеса [E]'],
 ['Packet broker [E]','Paket simsarı [E]','Пакетный брокер [E]'],
 ['Crew Credits','Ekip Kredileri','Кредиты команды'],['Your chips','Senin fişlerin','Твои фишки'],
 ['Mica: one Credit buys one chip. Redeeming returns Credits to the crew. No loans.','Mica: bir Kredi bir fiş alır. Bozdurulan Krediler ekibe döner. Borç yok.','Мика: один кредит за одну фишку. Обмен возвращает кредиты команде. Без займов.'],
 ['Buy','Satın al','Купить'],['Redeem all','Hepsini bozdur','Обменять всё'],['Close','Kapat','Закрыть'],
 ['Bet','Bahis','Ставка'],['Red','Kırmızı','Красное'],['Black','Siyah','Чёрное'],['Spin','Çevir','Крутить'],
 ['Triple: 6x; triple SIGNAL: 12x; first pair: 2x. Payout includes your stake.','Üçlü: 6x; üç SİNYAL: 12x; ilk çift: 2x. Ödemeye bahis dahildir.','Тройка: 6x; три СИГНАЛА: 12x; первая пара: 2x. Выплата включает ставку.'],
 ['37 pockets. Red or black pays 2x; zero loses.','37 cep. Kırmızı veya siyah 2x öder; sıfır kaybettirir.','37 ячеек. Красное или чёрное платит 2x; ноль — проигрыш.'],
 ['Start packet','Paketi başlat','Начать пакет'],['Risk doubling','İkiye katlamayı dene','Рискнуть удвоением'],['Cash out','Kazancı al','Забрать выигрыш'],
 ['Safe transmission chances: 65%, 55%, 45%. Bank now or lose the whole pot. Three pushes maximum.','Güvenli aktarım şansı: %65, %55, %45. Şimdi al veya tüm potu kaybet. En çok üç deneme.','Шансы передачи: 65%, 55%, 45%. Забери сейчас или потеряй весь банк. Максимум три попытки.'],
 ['Pot','Pot','Банк'],['Paid chips','Ödenen fiş','Выплачено фишек'],['Waiting for cashier...','Veznedar bekleniyor...','Ожидание кассира...'],
 ['Transaction refused. Stay at the station; check balance and active packet.','İşlem reddedildi. Masada kal; bakiyeyi ve aktif paketi kontrol et.','Операция отклонена. Оставайся у стола; проверь баланс и активный пакет.'],
 ['bought','alındı','куплено'],['redeemed','bozduruldu','обменено'],['cashed','kazanç alındı','выигрыш забран'],['safe','aktarım başarılı','передача успешна'],['bust','paket kayıp','пакет потерян'],['started','paket açık','пакет открыт'],['win','kazandın','выигрыш'],['loss','kaybettin','проигрыш'],['red','kırmızı','красное'],['black','siyah','чёрное'],['zero','sıfır','ноль']
];
addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[1]])));
addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[2]])), 'ru');
export const tx = t;
