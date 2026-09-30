import { addTranslations } from '../core/i18n.js';
export const COMPANY13_TEXT = [
 ['Your crew contract: {n}/{goal}. Review CONTRACTS aboard ship before your next moon.','Ekip sözleşmen: {n}/{goal}. Sonraki aya gitmeden gemide CONTRACTS komutuyla gözden geçir.','Контракт экипажа: {n}/{goal}. Перед следующей луной просмотрите CONTRACTS на корабле.'],
 ['Your crew completed its contract. The next moon is a chance to build a new faction relationship.','Ekibin sözleşmesini tamamladı. Sonraki ay, yeni bir grupla ilişki kurma fırsatı.','Экипаж выполнил контракт. Следующая луна — шанс наладить отношения с новой фракцией.'],
 ['CONTENT CLEARING EXCHANGE','İÇERİK TAKAS MERKEZİ','БИРЖА КОНТЕНТА'],
 ['THE HOUSE / CHIP EXCHANGE','KUMARHANE / FİŞE TAKASI','КАЗИНО / ОБМЕН ФИШЕК'],
 ['CONTRACTS / CREW SERVICES','SÖZLEŞMELER / EKİP HİZMETLERİ','КОНТРАКТЫ / УСЛУГИ ЭКИПАЖУ'],
 ['FREIGHT TO COUNTER','KARGO TESLİM NOKTASI','ГРУЗ К ПРИЛАВКУ'],
 ['The Algorithm is irritated. Bring content; stop ringing an empty counter.','Algoritma sinirlendi. İçerik getir; boş tezgâhın zilini çalma.','Алгоритм раздражён. Принесите контент; не звоните у пустого прилавка.'],
 ['Your bell access is paused for {n}s. No credits or scrap were taken.','Zil erişimin {n} saniyeliğine durduruldu. Kredi veya hurda alınmadı.','Ваш доступ к звонку приостановлен на {n} с. Кредиты и лом не изъяты.'],
 ['Talk to the exchange clerk [E]','Takas görevlisiyle konuş [E]','Поговорить с биржевым служащим [E]'],
 ['Content goes on the rear counter. Ring once. The House trades chips; contracts are posted here.','İçeriği arkadaki tezgâha koy. Bir kez zil çal. Kumarhanede fişeler takas edilir; sözleşmeler burada asılı.','Положите контент на задний прилавок. Позвоните один раз. В казино обменивают фишки; контракты вывешены здесь.'],
 ['Ask the compliance auditor [E]','Denetçiye danış [E]','Спросить инспектора [E]'],
 ['Repeated empty bells irritate the Algorithm. Your access may pause briefly; a real delivery calms it.','Boş tezgâhın zilini tekrar tekrar çalmak Algoritmayı kızdırır. Erişimin kısa süre durabilir; gerçek teslimat onu sakinleştirir.','Повторные звонки без груза раздражают Алгоритм. Доступ могут ненадолго приостановить; настоящая поставка его успокоит.'],
];
for (const [i, lang] of [[1,'tr'],[2,'ru']]) addTranslations(Object.fromEntries(COMPANY13_TEXT.map(row=>[row[0],row[i]])),lang);
