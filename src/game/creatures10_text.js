// CREATURES10 wave 10 - Turkish + Russian strings. Keys are the exact English strings used in creatures10_ai.js DEFS (name / lore / deathText),
// IDENT hints and FIELD_NOTES. One table of [EN, TR, RU] rows so the three languages cannot drift apart.
import { DEFS, HINTS, NOTES } from './creatures10_ai.js';
import { IDS } from './creatures10_core.js';

const B = DEFS[IDS.buffering], D = DEFS[IDS.doom], R = DEFS[IDS.ratio];


export const ROWS = [
  [B.name, 'Yükleniyor', 'Буферизация'],
  [D.name, 'Sonsuz Kaydırıcı', 'Думскроллер'],
  [R.name, 'Ratio', 'Ратио'],
  [B.deathText, "Yükleniyor tarafından %99'da takılı bırakıldı.", 'застрял на 99% из-за Буферизации.'],
  [D.deathText, "Sonsuz Kaydırıcı'nın altında bir video fazla izledi.", 'посмотрел ещё одно видео под Думскроллером.'],
  [R.deathText, 'ikizler tarafından ratio yedi.', 'получил рейтио от близнецов.'],
  [B.lore,
    'Yalnızca yükleme halkası dönerken hareket eder ve birkaç saniyede bir donup tamponlanır: o an yanından geç. Halka kehribar olur, vızıltı düşer, uyanmasına 0,8 sn kala vızıltı geri yükselir. Dokunuşu büyük bir ısırık alır ve önce tam bir saniye hazırlanır.',
    'Двигается, только пока крутится кольцо загрузки, и раз в несколько секунд замирает на буферизацию: проходи мимо именно тогда. Кольцо становится янтарным, гул стихает, а за 0,8 с до пробуждения гул нарастает снова. Его касание бьёт больно, но перед этим он целую секунду замахивается.'],
  [D.lore,
    'Parlayan telefonlardan bir zincir tavanda sürünür ve altında hareketsiz duran herkesin üstüne düşer: hareket etmeye devam et. Kıpırdamadığın her saniye kaydırma tıkırtısı hızlanır; bildirim sesi düşüşe bir saniye kaldığı demektir, gölgeden çık. Yere indikten sonra sersemleyip yatar: ezip geç.',
    'Цепочка светящихся телефонов ползёт по потолку и падает на любого, кто стоит под ней неподвижно: не стой на месте. С каждой секундой простоя щелчки прокрутки учащаются; звук уведомления значит, что падение через секунду, так что выйди из-под неё. После приземления она лежит оглушённая на полу: бей.'],
  [R.lore,
    'İki aynalı manken: bir ikiz yalnızca kimse ona bakmıyorken hareket eder, sen diğerine bakarken ise KOŞAR; ikisini birden izle. Kırmızı göğüs ışığı geliyor demek, soğuk beyaz olan donmuş demek. Her ikiz vurmadan önce bir saniye hazırlanır.',
    'Два зеркальных манекена: близнец двигается, только пока на него никто не смотрит, и БРОСАЕТСЯ, пока ты глядишь на другого, так что следи за обоими сразу. Красный свет на груди значит, что он идёт, холодный белый значит, что он замер. Каждый близнец замахивается секунду, прежде чем ударить.'],
  [HINTS[IDS.buffering], 'Tamponlanırken donar (halka kehribar, vızıltı düşer). O an geç; vızıltı yükselince kaç.', 'Замирает на буферизации (кольцо янтарное, гул стихает). Проходи тогда; беги, когда гул нарастает.'],
  [HINTS[IDS.doom], 'Tıkırdayan bir tavanın altında asla hareketsiz durma. Bildirim sesinde hareket et; yerde yatarken ez.', 'Никогда не стой под тикающим потолком. Двигайся, когда пришёл сигнал; бей, пока лежит на полу.'],
  [HINTS[IDS.ratio], 'İKİ ikize de bak: yalnızca birine bakmak diğerini üstüne salar. Kırmızı göğüs = geliyor, beyaz = donmuş.', 'Смотри на ОБОИХ близнецов: взгляд на одного посылает другого на тебя. Красная грудь = идёт, белая = замер.'],
  [NOTES[IDS.buffering], 'Sadece tam bir saniyelik hazırlıktan sonra ısırır. Tamponlama anında ondan kaçma, YANINDAN geç.', 'Кусает только после целой секунды замаха. В окне буферизации беги МИМО него, а не от него.'],
  [NOTES[IDS.doom], 'En sevdiği yer ganimet odaları. Not okumak için durursan tıkırtı başlar; yürümeye devam edersen asla düşmez.', 'Больше всего любит комнаты с лутом. Встал читать записку, и тиканье пошло; иди дальше, и она не упадёт.'],
  [NOTES[IDS.ratio], 'İki kişiyseniz: her biri bir ikize baksın. Yalnızsan ikisi de ekrana sığana kadar geri çekil.', 'Вдвоём: каждый смотрит на своего близнеца. В одиночку: отступай, пока оба не поместятся на экране.'],
];
export const TR = Object.fromEntries(ROWS.map((r) => [r[0], r[1]]));
export const RU = Object.fromEntries(ROWS.map((r) => [r[0], r[2]]));
