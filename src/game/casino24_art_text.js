import {addTranslations,t} from '../core/i18n.js';
const rows=[['CARD ARCHIVE','KART ARŞİVİ','КАРТОЧНЫЙ АРХИВ'],['BLACKJACK','BLACKJACK','БЛЭКДЖЕК'],['FIVE-CARD DRAW','BEŞ KART POKER','ПОКЕР С ОБМЕНОМ'],['PLACE A BET','BAHİS YAP','СДЕЛАЙТЕ СТАВКУ'],['RECEIPT / CHIPS','FİŞ / ÇİPLER','КВИТАНЦИЯ / ФИШКИ']];
for(const [i,lang]of[[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
export const casinoArt24=t;
