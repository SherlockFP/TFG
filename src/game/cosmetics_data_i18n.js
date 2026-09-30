// Suit / back / face cosmetic names and descriptions: [English key, Turkish, Russian]. wave 8 i18n8. Gap-fill only; the wardrobe panel already calls t().
import { fillGaps } from '../i18n/fill.js';

fillGaps([
  // ---- suits (game/cosmetics.js)
  ['Construction', 'İnşaat İşçisi', 'Строитель'], ['Hi-vis vest, hard hat, tool belt. Union approved.', 'Reflektörlü yelek, baret, alet kemeri. Sendika onaylı.', 'Светоотражающий жилет, каска, пояс с инструментами. Одобрено профсоюзом.'],
  ['Scientist', 'Bilim İnsanı', 'Учёный'], ['Lab coat, blue gloves, goggles. For Science.', 'Laboratuvar önlüğü, mavi eldiven, gözlük. Bilim için.', 'Халат, синие перчатки, очки. Ради науки.'],
  ['Badge, duty belt and a cap. "Ma\'am, this is a Wendy\'s."', 'Rozet, silah kemeri ve şapka. "Hanımefendi, burası bir fast food."', 'Значок, пояс и фуражка. «Мэм, это же закусочная».'],
  ['Sealed yellow suit with respirator canisters.', 'Solunum kartuşlu, kapalı sarı tulum.', 'Герметичный жёлтый костюм с фильтрами респиратора.'],
  ['Firefighter', 'İtfaiyeci', 'Пожарный'], ['Reflective turnout coat and a red helmet.', 'Yansıtıcı itfaiye montu ve kırmızı kask.', 'Светоотражающая роба и красная каска.'],
  ['Chicken', 'Tavuk', 'Курица'], ['Cluck. It is not a costume, it is a lifestyle.', 'Gıt gıt. Kostüm değil, yaşam tarzı.', 'Ко-ко. Это не костюм, это образ жизни.'],
  ['Wetsuit, flippers and a snorkel. Perfect for the flooded rooms.', 'Dalgıç kıyafeti, palet ve şnorkel. Su basmış odalar için birebir.', 'Гидрокостюм, ласты и трубка. Идеально для затопленных комнат.'],
  ['Honk. Big shoes, bigger ego.', 'Bip bip. Büyük ayakkabı, daha büyük ego.', 'Пип-пип. Большие ботинки, ещё больше эго.'],
  ['Fish Head', 'Balık Kafası', 'Рыбья голова'], ['The fish head. It talks when you talk.', 'Balık kafası. Sen konuşunca o da konuşur.', 'Рыбья голова. Говорит, когда говорите вы.'],
  ['A small step for a content janitor.', 'Bir içerik hademesi için küçük bir adım.', 'Маленький шаг для контент-уборщика.'],
  ['Gold Employee', 'Altın Çalışan', 'Золотой сотрудник'], ['Employee of the Month, forever.', 'Ayın Çalışanı, sonsuza dek.', 'Сотрудник месяца навсегда.'],
  ['Venom Symbiote', 'Venom Simbiyotu', 'Симбиот Веном'], ['We are Venom. Glossy black, a white spider on the chest and a few restless tendrils.', "Biz Venom'uz. Parlak siyah, göğsünde beyaz örümcek ve huzursuz birkaç dokunaç.", 'Мы - Веном. Глянцево-чёрный, белый паук на груди и несколько беспокойных щупалец.'],
  // ---- back / face / head (models/cosmetics.js, models/avatar.js)
  ['Radio Antenna', 'Telsiz Anteni', 'Радиоантенна'], ['Sways when you run. Receives nothing.', 'Koşarken sallanır. Hiçbir şey almaz.', 'Качается при беге. Ничего не принимает.'],
  ['Twin O2 Tanks', 'İkiz O2 Tüpü', 'Два баллона O2'], ['Two blue tanks. Twice the air, same problems.', 'İki mavi tüp. İki kat hava, aynı dertler.', 'Два синих баллона. Воздуха вдвое больше, проблемы те же.'],
  ['Plush Bear', 'Pelüş Ayı', 'Плюшевый мишка'], ['Emotional support bear.', 'Duygusal destek ayısı.', 'Медведь эмоциональной поддержки.'],
  ['Tiny Monster', 'Minik Canavar', 'Крошечный монстр'], ['A small green friend that bobs along.', 'Seninle sallanan küçük yeşil bir dost.', 'Маленький зелёный друг, что подпрыгивает рядом.'],
  ['Fake Moustache', 'Sahte Bıyık', 'Накладные усы'], ['Distinguished. Very fake.', 'Ağırbaşlı. Çok sahte.', 'Солидные. Очень ненастоящие.'],
  ['Two filters. Does nothing against the smell of the internet.', 'İki filtre. İnternetin kokusuna karşı işe yaramaz.', 'Два фильтра. От запаха интернета не спасают.'],
  ['Shades', 'Güneş Gözlüğü', 'Тёмные очки'], ['Deal with it.', 'Alışırsın.', 'Смиритесь.'],
  ['Cyber Visor', 'Siber Vizör', 'Кибервизор'], ['A glowing scan band across your eyes.', 'Gözlerinin önünde parlayan bir tarama bandı.', 'Светящаяся полоса сканера поперёк глаз.'],
  ['LED Face', 'LED Yüz', 'LED-лицо'], ['Your visor becomes a pixel display.', 'Vizörün piksel ekrana dönüşür.', 'Ваш визор превращается в пиксельный экран.'],
  ['Warm. Also a pom-pom.', 'Sıcak. Üstelik ponponlu.', 'Тёплая. И с помпоном.'], ['Peak 2019 fashion.', '2019 modasının zirvesi.', 'Пик моды 2019 года.'],
  ['Looks bright. Is not a light.', 'Parlak görünür. Işık değil.', 'Выглядит ярко. Светом не является.'], ['You shall not pass the quota.', 'Kotayı geçemezsin.', 'Вы не пройдёте квоту.'],
  ['Bucket Hat', 'Kova Şapka', 'Панама'], ['Headlamp', 'Kafa Lambası', 'Налобный фонарь'], ['Wizard Hat', 'Büyücü Şapkası', 'Шляпа волшебника'],
]);
