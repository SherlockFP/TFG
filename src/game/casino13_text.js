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
 ,['Blackjack dealer [E]','Blackjack krupiyesi [E]','Крупье блэкджека [E]'],['Five-card draw dealer [E]','Beş kart poker krupiyesi [E]','Крупье покера [E]'],
 ['blackjack','Blackjack','Блэкджек'],['poker','Poker','Покер'],['packet','Paket','Пакет'],
 ['Hand dealt. Choose your next move.','El dağıtıldı. Sonraki hamleni seç.','Карты выданы. Выбери следующий ход.'],
 ['Your cards','Kartların','Ваши карты'],['Dealer','Krupiye','Крупье'],['Total','Toplam','Сумма'],['Hit','Kart çek','Ещё карту'],['Stand','Dur','Хватит'],['Deal','Dağıt','Раздать'],['Draw selected / reveal','Seçilenleri değiştir / göster','Заменить выбранные / вскрыть'],
 ['Hit or stand. Dealer stands on 17, including soft 17. Win or natural: 2x; tie refunds stake. No split, insurance or double.','Kart çek veya dur. Krupiye aslı 17 dahil 17’de durur. Kazanç veya doğal 21: 2x; beraberlikte bahis iade. Bölme, sigorta ve çift bahis yok.','Ещё карту или хватит. Крупье стоит на 17, включая мягкие 17. Победа или натуральный 21: 2x; ничья возвращает ставку. Без разделения, страховки и удвоения.'],
 ['Five-card draw: mark 0–3 cards, draw once, then compare with the dealer. Higher hand pays 2x; tie refunds stake. Dealer keeps pairs or its two highest cards.','Beş kart poker: 0–3 kart seç, bir kez değiştir, krupiyeyle karşılaştır. Güçlü el 2x; beraberlikte bahis iade. Krupiye çiftlerini veya en yüksek iki kartını tutar.','Покер: выбери 0–3 карты, замени один раз и сравни с крупье. Лучшая рука платит 2x; ничья возвращает ставку. Крупье сохраняет пары либо две старшие карты.'],
 ['Finish your active round at its original table.','Açık elini başladığın masada bitir.','Заверши текущий раунд за его столом.'],['Legacy packet: 65%, 55%, 45%. Your accepted pot and rules are preserved.','Eski paket: %65, %55, %45. Kabul edilen potun ve kuralların korundu.','Старый пакет: 65%, 55%, 45%. Принятый банк и правила сохранены.'],
 ['Safe transmission chances: 48%, 46%, 44%. Bank now or lose the whole pot. Three pushes maximum.','Güvenli aktarım şansı: %48, %46, %44. Şimdi al veya tüm potu kaybet. En çok üç deneme.','Шансы передачи: 48%, 46%, 44%. Забери сейчас или потеряй весь банк. Максимум три попытки.'],
 ['Triple: 3x; triple SIGNAL: 6x; any pair: 2x. Payout includes your stake.','Üçlü: 3x; üç SİNYAL: 6x; herhangi çift: 2x. Ödemeye bahis dahil.','Тройка: 3x; три СИГНАЛА: 6x; любая пара: 2x. Выплата включает ставку.'],
 ['Waiting for dealer confirmation...','Krupiye onayı bekleniyor...','Ожидание подтверждения крупье...'],['Transaction refused. Stay at the station; check balance and active round.','İşlem reddedildi. Masada kal; bakiyeyi ve açık elini kontrol et.','Операция отклонена. Оставайся у стола; проверь баланс и текущий раунд.'],
 ['New wagers require house reserve. Accepted wins and chip redemption remain guaranteed.','Yeni bahisler kasa rezervi gerektirir. Kabul edilen kazançlar ve fiş bozdurma garantili kalır.','Новые ставки требуют резерва казино. Принятые выигрыши и обмен фишек гарантированы.'],
 ['tie','beraberlik','ничья'],['card dealt','kart çekildi','карта выдана'],['High card','Yüksek kart','Старшая карта'],['Pair','Çift','Пара'],['Two pairs','İki çift','Две пары'],['Three of a kind','Üçlü','Тройка'],['Straight','Kent','Стрит'],['Flush','Renk','Флеш'],['Full house','Full','Фулл-хаус'],['Four of a kind','Kare','Каре'],['Straight flush','Sıralı renk','Стрит-флеш']
];
addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[1]])));
addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[2]])), 'ru');
export const tx = t;
