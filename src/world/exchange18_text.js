import { addTranslations } from '../core/i18n.js';
export const EXCHANGE18_TEXT=[
 ['SORT / PRESERVE / FORGET','AYIR / SAKLA / UNUT','СОРТИРОВАТЬ / ХРАНИТЬ / ЗАБЫТЬ'],
 ['REJECTED: NO HUMAN RESPONSE','REDDEDİLDİ: İNSAN TEPKİSİ YOK','ОТКЛОНЕНО: НЕТ РЕАКЦИИ ЛЮДЕЙ'],
 ['ARCHIVE GLASS / SEALED STORAGE','ARŞİV CAMI / MÜHÜRLÜ DEPO','АРХИВНОЕ СТЕКЛО / ЗАКРЫТОЕ ХРАНИЛИЩЕ'],
 ['A copy survives. The author does not.','Kopya yaşar. Yazarı yaşamaz.','Копия выживает. Автор — нет.'],
];
for(const [i,lang]of [[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(EXCHANGE18_TEXT.map(r=>[r[0],r[i]])),lang);
