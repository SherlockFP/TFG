import {addTranslations} from '../core/i18n.js';

export const RECOVERY27_TEXT=Object.freeze({
 title:'DEAD LINK / RECOVERY',
 lore:'Marked delivered. Never received.',
 quiet:'Dead Link: quiet release [E]',
 noisy:'Dead Link: break seal [E]',
 help:'Quiet: face the crank for 4 seconds; stepping away pauses. Break seal: instant, but loud. Same salvage.',
 working:'Quiet release {n}% [E]',
 paused:'Quiet release paused at {n}% [E]',
 resumed:'Recovery resumed. Keep facing the crank, or step away to pause.',
 open:'Seal released. Carry the recovered salvage home.',
 empty:'RECOVERED',
 crank:'CRANK',
 break:'BREAK SEAL',
 blocked:'Recovery paused. The drop space must stay clear.',
});
const T=RECOVERY27_TEXT;
addTranslations({
 [T.title]:'ÖLÜ BAĞLANTI / KURTARMA',
 [T.lore]:'Teslim edildi yazıyor. Alan yok.',
 [T.quiet]:'Ölü Bağlantı: sessizce aç [E]',
 [T.noisy]:'Ölü Bağlantı: mührü kır [E]',
 [T.help]:'Sessiz: 4 saniye kola bak; uzaklaşınca ilerleme durur. Mühür: hemen açılır, gürültülüdür. Ganimet aynı.',
 [T.working]:'Sessiz açma %{n} [E]',
 [T.paused]:'Sessiz açma %{n} durdu [E]',
 [T.resumed]:'Kurtarma sürüyor. Kola bakmaya devam et; uzaklaşınca durur.',
 [T.open]:'Mühür açıldı. Kurtarılan ganimeti gemiye taşı.',
 [T.empty]:'KURTARILDI',
 [T.crank]:'KOL',
 [T.break]:'MÜHRÜ KIR',
 [T.blocked]:'Kurtarma durdu. Eşyaların çıkacağı alan açık kalmalı.',
},'tr');
addTranslations({
 [T.title]:'МЁРТВАЯ ССЫЛКА / ВОЗВРАТ',
 [T.lore]:'Отмечено доставленным. Никем не получено.',
 [T.quiet]:'Мёртвая ссылка: открыть тихо [E]',
 [T.noisy]:'Мёртвая ссылка: сломать пломбу [E]',
 [T.help]:'Тихо: смотрите на рукоять 4 секунды; отход приостанавливает работу. Пломба: мгновенно, но громко. Груз тот же.',
 [T.working]:'Тихое открытие {n}% [E]',
 [T.paused]:'Тихое открытие приостановлено: {n}% [E]',
 [T.resumed]:'Возврат продолжен. Смотрите на рукоять; отойдите, чтобы приостановить.',
 [T.open]:'Пломба снята. Унесите возвращённый груз на корабль.',
 [T.empty]:'ВОЗВРАЩЕНО',
 [T.crank]:'РУКОЯТЬ',
 [T.break]:'СЛОМАТЬ ПЛОМБУ',
 [T.blocked]:'Возврат приостановлен. Освободите место для груза.',
},'ru');
