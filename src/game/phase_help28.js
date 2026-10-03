import { addTranslations, t } from '../core/i18n.js';

const rows = [
  ['Choose a free Courier at the fleet office [E], then board at the departure kiosk.', 'Filo ofisinden ücretsiz Courier gemisini seç [E], sonra kalkış kioskundan gemiye bin.', 'Выбери бесплатный Courier в офисе флота [E], затем садись через киоск отправления.'],
  ['Use the TERMINAL [E] to choose a moon and route.', 'Ay ve rota seçmek için TERMİNALİ kullan [E].', 'Выбери луну и маршрут на ТЕРМИНАЛЕ [E].'],
  ['Pull the LEVER to land. Buy tools from a field broker, not the ship console.', 'İnmek için KOLU çek. Ekipmanı gemi konsolundan değil, saha tüccarından al.', 'Потяни РЫЧАГ для посадки. Снаряжение продаёт полевой брокер, а не консоль корабля.'],
  ['Follow the path to the facility entrance.', 'Tesis girişine giden yolu takip et.', 'Следуй по тропе ко входу на объект.'],
  ['Scan for salvage and threats, then bring recovered items back to the ship.', 'Ganimet ve tehditleri tara, bulduğun eşyaları gemiye getir.', 'Сканируй добычу и угрозы, затем неси найденное на корабль.'],
  ['Night is dangerous. The ship waits until a crew member pulls the lever; then everyone has eight seconds to board.', 'Gece tehlikeli. Ekipten biri kolu çekene kadar gemi bekler; ardından herkesin binmek için sekiz saniyesi vardır.', 'Ночью опасно. Корабль ждёт команды рычагом; после этого у всех восемь секунд, чтобы подняться на борт.'],
  ['Put recovered items on the COUNTER, then ring the BELL to sell.', 'Bulduğun eşyaları TEZGÂHA koy, satmak için ZİLİ çal.', 'Положи добычу на ПРИЛАВОК и позвони в КОЛОКОЛ, чтобы продать её.'],
  ['Visit the field broker for TOOLS. The Black Market has personal gear.', 'EKİPMAN için saha tüccarını ziyaret et. Karaborsada kişisel teçhizat var.', 'За СНАРЯЖЕНИЕМ иди к полевому брокеру. Личное снаряжение есть на чёрном рынке.'],
  ['Board your selected ship at the departure kiosk.', 'Seçili gemine kalkış kioskundan bin.', 'Садись на выбранный корабль через киоск отправления.'],
];
for (const [index, lang] of [[1, 'tr'], [2, 'ru']]) addTranslations(Object.fromEntries(rows.map(row => [row[0], row[index]])), lang);

// Optional returning-player advice. Fresh staged runs already have one teacher.
export function showPhaseHelp28(game, phase) {
  const run = game.run;
  if (!run || run.phase !== phase || game.destroyed) return;
  const dock = phase === 'orbit' && game.fleet13?.docked?.();
  const vessel = run.fleet13?.selected;
  const key = dock ? 'dock' : phase;
  const selected = dock ? [vessel ? 8 : 0] : ({ orbit: [1, 2], moon: [3, 4, 5], company: [6, 7] })[phase];
  if (!selected) return;
  const seen = (game.profile.tutorial ||= {});
  if (seen[key]) return;
  seen[key] = true;
  if (game.onboard?.fr?.active?.()) return;
  game.progress.save();
  const net = game.net, { moon, seed, day } = run;
  const facility = game.world?.facility, worldMoon = game.world?.moonId;
  const depth = run.descent21?.depth, revision = run.descent21?.rev;
  const valid = () => {
    if (game.destroyed || game.run !== run || game.net !== net || run.phase !== phase || run.moon !== moon || run.seed !== seed || run.day !== day) return false;
    if (game.world?.facility !== facility || game.world?.moonId !== worldMoon || run.descent21?.depth !== depth || run.descent21?.rev !== revision) return false;
    if (!!game.fleet13?.docked?.() !== !!dock || (dock && run.fleet13?.selected !== vessel) || game.player?.dead || game.player?.downed || game.deadletter24?.active?.()) return false;
    return !(game.ui.blocksInput?.() || game.terminal?.active || game.minigame || game.onboard?.fr?.active?.());
  };
  const delay = phase === 'moon' ? 3000 : phase === 'company' ? 2500 : 1500;
  selected.forEach((index, order) => game.later(() => {
    // Phase, run and transport identities prevent a previous visit speaking into
    // a new one; game.later also cancels these callbacks on native destruction.
    if (!valid()) return;
    game.ui.toast('💡 ' + t(rows[index][0]), 'info', undefined, valid);
  }, delay + order * 3800));
}
