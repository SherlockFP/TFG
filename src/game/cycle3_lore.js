// CASE FILE dossiers of the sector cycle (data only). One entry per boss, the raid, the keystone, the hidden gate, red gates, the Deep Feed (endless) and the
// shameful exit. Each has a two-line dossier (what it is / a field note) in EN + TR + RU. The English lines are the i18n keys (addTranslations at import), the
// case card (cycle3_case.js), the Trophy Wall panel (cycle3_trophy.js) and the terminal DOSSIER command read them through t().
import { addTranslations } from '../core/i18n.js';

/** key -> { title (English, translated by name tables), lines: [[en, tr, ru], [en, tr, ru]] } */
export const DOSSIERS = {
  foreman: { title: 'The Foreman', lines: [
    ['Site Supervisor of the Data Center. Nobody told him the shift ended. Below half health the furnace roars and he calls in bots.', 'Veri Merkezi\'nin Saha Şefi. Vardiyanın bittiğini ona kimse söylemedi. Canı yarının altına düşünce fırın kükrer ve robot çağırır.', 'Начальник смены Дата-центра. Ему никто не сказал, что смена закончилась. Ниже половины здоровья печь ревёт, и он зовёт ботов.'],
    ['FIELD NOTE: stay off the conveyors when the slam telegraph shows.', 'SAHA NOTU: ezme işareti çıkınca konveyörlerden uzak dur.', 'ПОЛЕВАЯ ЗАМЕТКА: уходи с конвейеров, когда появляется метка удара.'],
  ] },
  loadbalancer: { title: 'The Load Balancer', lines: [
    ['Traffic Director. Routes every attack to the weakest connection. Its armour is only as strong as the server nodes still online.', 'Trafik Yöneticisi. Her saldırıyı en zayıf bağlantıya yönlendirir. Zırhı, hâlâ açık olan sunucu düğümleri kadar sağlamdır.', 'Диспетчер трафика. Направляет каждую атаку на самое слабое соединение. Его броня крепка ровно настолько, насколько живы серверные узлы.'],
    ['FIELD NOTE: cut the nodes first; the marked spot is a lie you can dodge.', 'SAHA NOTU: önce düğümleri kes; işaretli nokta kaçabileceğin bir yalandır.', 'ПОЛЕВАЯ ЗАМЕТКА: сначала убей узлы; отмеченное место - ложь, от которой можно уйти.'],
  ] },
  middlemanager: { title: 'Middle Manager', lines: [
    ['Synergy Enforcer. Guarded by orbiting paperwork and dangerous in meetings. Attendance is mandatory.', 'Sinerji Uygulayıcısı. Etrafında dönen evraklarla korunur, toplantılarda tehlikelidir. Katılım zorunludur.', 'Специалист по синергии. Его защищают кружащие бумаги, а на совещаниях он опасен. Присутствие обязательно.'],
    ['FIELD NOTE: shred the paper, stand in the circle, never let him finish the slide.', 'SAHA NOTU: kağıtları parçala, çemberde dur, slaytı bitirmesine izin verme.', 'ПОЛЕВАЯ ЗАМЕТКА: изорви бумагу, стой в круге, не дай ему закончить слайд.'],
  ] },
  hydra: { title: 'Comment Section Hydra', lines: [
    ['A thread that never ended. Every head you cut spawns two replies. The root is the only original poster.', 'Hiç bitmeyen bir başlık. Kestiğin her baş iki yanıt doğurur. Kök, tek orijinal paylaşımcıdır.', 'Ветка, которая так и не закончилась. Каждая отрубленная голова рождает два ответа. Корень - единственный оригинальный автор.'],
    ['FIELD NOTE: kill every head, then hit the root before they grow back.', 'SAHA NOTU: her başı öldür, sonra geri büyümeden köke vur.', 'ПОЛЕВАЯ ЗАМЕТКА: убей все головы, затем бей корень, пока они не отросли.'],
  ] },
  surgeon: { title: 'The Head Surgeon', lines: [
    ['Elective Procedure. Consent was implied by entering the building. He drags the weakest patient to the table.', 'İsteğe Bağlı Ameliyat. Binaya girmek onay sayıldı. En zayıf hastayı ameliyat masasına sürükler.', 'Плановая операция. Согласие подразумевалось при входе в здание. Он тащит самого слабого пациента на стол.'],
    ['FIELD NOTE: hit him hard enough and the patient is discharged early.', 'SAHA NOTU: yeterince sert vurursan hasta erken taburcu olur.', 'ПОЛЕВАЯ ЗАМЕТКА: ударь достаточно сильно, и пациента выпишут раньше.'],
  ] },
  host: { title: 'The Host', lines: [
    ['Welcome, Guest. Blinks in behind you and never leaves the room. Hospitality is a threat.', 'Hoş geldin, Misafir. Arkanda belirir ve odadan hiç çıkmaz. Konukseverlik bir tehdittir.', 'Добро пожаловать, гость. Появляется за спиной и никогда не покидает комнату. Гостеприимство - это угроза.'],
    ['FIELD NOTE: turn around when the marker turns purple.', 'SAHA NOTU: işaret mora dönünce arkanı dön.', 'ПОЛЕВАЯ ЗАМЕТКА: оборачивайся, когда метка становится фиолетовой.'],
  ] },
  excavator: { title: 'The Excavator', lines: [
    ['Proof of Work. Digs for something that was never buried. Its quake leaves a safe middle and a deadly ring.', 'Emek Kanıtı. Hiç gömülmemiş bir şey için kazar. Depremi güvenli bir orta ve ölümcül bir halka bırakır.', 'Доказательство работы. Копает то, что никто не закапывал. Его землетрясение оставляет безопасный центр и смертельное кольцо.'],
    ['FIELD NOTE: stay close and low; the ring is where the rock falls.', 'SAHA NOTU: yakın ve alçak kal; kayaların düştüğü yer halkadır.', 'ПОЛЕВАЯ ЗАМЕТКА: держись близко и пригнувшись; камни падают в кольце.'],
  ] },
  lobbymanager: { title: 'The Lobby Manager', lines: [
    ['Level Designer. Turns the lights off, then charges in straight lines. The lobby has no exit, only queues.', 'Seviye Tasarımcısı. Işıkları söndürür, sonra düz çizgide saldırır. Lobinin çıkışı yok, sadece sıra var.', 'Левел-дизайнер. Выключает свет, затем атакует по прямой. У лобби нет выхода, только очереди.'],
    ['FIELD NOTE: he is fast in the dark; count the seconds and sidestep.', 'SAHA NOTU: karanlıkta hızlıdır; saniyeleri say ve yana çekil.', 'ПОЛЕВАЯ ЗАМЕТКА: в темноте он быстр; считай секунды и уходи в сторону.'],
  ] },
  legacybot: { title: 'Legacy Bot', lines: [
    ['World boss of the old net, still running an unsupported build. Rockets and stomps, outdoors.', 'Eski ağın dünya patronu, hâlâ desteklenmeyen bir sürümde çalışıyor. Roketler ve tepinme, açık havada.', 'Мировой босс старой сети, всё ещё на неподдерживаемой сборке. Ракеты и топот, на открытом воздухе.'],
    ['FIELD NOTE: use cover; every fifth sector it wakes up angry.', 'SAHA NOTU: siper kullan; her beşinci sektörde huysuz uyanır.', 'ПОЛЕВАЯ ЗАМЕТКА: используй укрытия; каждый пятый сектор он просыпается злым.'],
  ] },
  raid: { title: "The Algorithm's Core", lines: [
    ['Three bosses behind three wings, and a final that answers to no schedule. One chest per week.', 'Üç kanadın ardında üç patron ve hiçbir takvime uymayan bir final. Haftada bir sandık.', 'Три босса за тремя крыльями и финал, не подчиняющийся расписанию. Один сундук в неделю.'],
    ['FIELD NOTE: bring more friends than you think you need.', 'SAHA NOTU: ihtiyacın olduğunu sandığından fazla arkadaş getir.', 'ПОЛЕВАЯ ЗАМЕТКА: бери больше друзей, чем кажется нужным.'],
  ] },
  keystone: { title: 'Corrupted Keystone', lines: [
    ['A corrupted key: the facility rebuilt itself with a timer and a grudge. Affixes stack with the level.', 'Bozulmuş bir anahtar: tesis kendini bir zamanlayıcı ve kinle yeniden kurdu. Ekler seviyeyle birikir.', 'Испорченный ключ: объект перестроился с таймером и обидой. Аффиксы копятся с уровнем.'],
    ['FIELD NOTE: enemy forces first; the Guardian appears at one hundred percent.', 'SAHA NOTU: önce düşman güçleri; Muhafız yüzde yüzde belirir.', 'ПОЛЕВАЯ ЗАМЕТКА: сначала силы врага; Страж появляется на ста процентах.'],
  ] },
  hidden: { title: 'The Hidden Gate', lines: [
    ['Not on any map. It answers the pings of those who look, and asks for three rules: respect the Algorithm, worship the viewers, stay alive.', 'Hiçbir haritada yok. Arayanların sinyaline yanıt verir ve üç kural ister: Algoritma\'ya saygı göster, izleyicilere ibadet et, canlı kal.', 'Его нет ни на одной карте. Он отвечает на пинги ищущих и требует три правила: уважай Алгоритм, поклоняйся зрителям, оставайся живым.'],
    ['FIELD NOTE: press the statues in rule order. The floor punishes improvisation.', 'SAHA NOTU: heykellere kural sırasıyla bas. Zemin doğaçlamayı cezalandırır.', 'ПОЛЕВАЯ ЗАМЕТКА: жми на статуи в порядке правил. Пол наказывает импровизацию.'],
  ] },
  redgate: { title: 'Red Gate', lines: [
    ['A Red Gate seals behind you. There is no exit until the boss falls, which is why the loot is twice as good.', 'Kırmızı Kapı arkandan kapanır. Patron düşene kadar çıkış yok, ganimetin iki kat iyi olmasının sebebi de bu.', 'Красные врата запечатываются за спиной. Выхода нет, пока не падёт босс, поэтому добыча вдвое лучше.'],
    ['FIELD NOTE: pack healing. Nobody is coming.', 'SAHA NOTU: iyileştirici getir. Kimse gelmeyecek.', 'ПОЛЕВАЯ ЗАМЕТКА: бери лечение. Никто не придёт.'],
  ] },
  endless: { title: 'PATCH 1.0: The Deep Feed', lines: [
    ['ENDLESS CONTENT. No quota, only an engagement meter that melts every day. Mutators accumulate. The Algorithm calls this sustainable.', 'SONSUZ İÇERİK. Kota yok, sadece her gün eriyen bir etkileşim ölçeri. Mutatörler birikir. Algoritma buna sürdürülebilir diyor.', 'БЕСКОНЕЧНЫЙ КОНТЕНТ. Нет квоты, только шкала вовлечённости, тающая каждый день. Мутаторы копятся. Алгоритм называет это устойчивым.'],
    ['FIELD NOTE: sell to refill the meter, and cash out before it hits zero.', 'SAHA NOTU: ölçeri doldurmak için sat ve sıfıra düşmeden önce paranı çek.', 'ПОЛЕВАЯ ЗАМЕТКА: продавай, чтобы пополнять шкалу, и выходи с добычей до нуля.'],
  ] },
  shame: { title: 'Shameful Exit', lines: [
    ['The core held, the crew left, the sector moved on. Reputation lost. The Algorithm filed it under engagement.', 'Çekirdek direndi, ekip ayrıldı, sektör devam etti. İtibar kaybı. Algoritma bunu etkileşim olarak dosyaladı.', 'Ядро устояло, экипаж ушёл, сектор двинулся дальше. Репутация потеряна. Алгоритм записал это как вовлечённость.'],
    ['FIELD NOTE: the grace day is a gift. Use it.', 'SAHA NOTU: lütuf günü bir hediyedir. Kullan.', 'ПОЛЕВАЯ ЗАМЕТКА: день милости - подарок. Используй его.'],
  ] },
};

/** case keys: boss ids map 1:1, plus these. Stable numbers (9xxxx) so a dossier is never duplicated in the archive. */
export const DOSSIER_KEYS = Object.keys(DOSSIERS);
export const dossierCaseNumber = (key) => 90000 + Math.max(0, DOSSIER_KEYS.indexOf(key));

const TR = {}, RU = {};
for (const d of Object.values(DOSSIERS)) for (const [en, tr, ru] of d.lines) { TR[en] = tr; RU[en] = ru; }
Object.assign(TR, { "The Algorithm's Core": 'Algoritmanın Çekirdeği', 'Corrupted Keystone': 'Bozulmuş Anahtar Taşı', 'The Hidden Gate': 'Gizli Kapı', 'Red Gate': 'Kırmızı Kapı', 'PATCH 1.0: The Deep Feed': 'YAMA 1.0: Derin Akış', 'Shameful Exit': 'Şerefsiz Çıkış' });
Object.assign(RU, { "The Algorithm's Core": 'Ядро Алгоритма', 'Corrupted Keystone': 'Испорченный ключ-камень', 'The Hidden Gate': 'Скрытые врата', 'Red Gate': 'Красные врата', 'PATCH 1.0: The Deep Feed': 'ПАТЧ 1.0: Глубокая лента', 'Shameful Exit': 'Позорный выход' });
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
export const LORE_TR = TR, LORE_RU = RU;
