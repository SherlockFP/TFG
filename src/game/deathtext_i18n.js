// Death lines of Game.deathText() (TR + RU). Wave-8 causes (train, cave-in, witch, rift, masked) are translated by their own modules.
import { addTranslations } from '../core/i18n.js';

const TR = {
  'fell to their death.': 'düşüp öldü.', 'had their neck snapped.': 'boynu kırıldı.', 'was caught by the music box.': 'müzik kutusuna yakalandı.',
  'was eaten by a giant.': 'bir dev tarafından yendi.', 'was swallowed by The Worm.': 'Solucan tarafından yutuldu.', 'was shot by a turret.': 'bir taretle vuruldu.',
  'was blown up.': 'havaya uçtu.', 'was left behind.': 'geride bırakıldı.', 'fell into the void.': 'boşluğa düştü.', 'suffocated.': 'boğuldu.',
  'was mauled by a hound.': 'bir av köpeği tarafından parçalandı.', 'was killed by... themselves?': 'kendi kendini mi öldürdü?', 'opened the wrong door.': 'yanlış kapıyı açtı.',
  'was ejected.': 'dışarı atıldı.', 'blinked.': 'göz kırptı.', 'was flattened by a crawler.': 'bir sürüngen tarafından ezildi.', 'was nibbled to death.': 'kemirilerek öldü.',
  'got wrapped up for later.': 'sonrası için sarıldı.', 'was screamed to death.': 'çığlıkla öldürüldü.', 'was dissolved.': 'eridi.',
  'touched the wrong pile of junk.': 'yanlış hurda yığınına dokundu.', 'was bonked by a crewmate.': 'bir ekip arkadaşından sopa yedi.', 'was electrocuted.': 'elektrik çarpmasıyla öldü.',
  'was struck by lightning.': 'yıldırım çarptı.', 'was eaten by a land shark.': 'bir kara köpekbalığı tarafından yendi.', 'was flattened by the Foreman.': 'Ustabaşı tarafından ezildi.',
  'was boiled alive by a steam vent.': 'buhar bacasında haşlandı.', 'was run over by the Uplink Van.': 'Uplink Van altında kaldı.', 'died.': 'öldü.',
};
const RU = {
  'fell to their death.': 'разбился при падении.', 'had their neck snapped.': 'свернули шею.', 'was caught by the music box.': 'попался музыкальной шкатулке.',
  'was eaten by a giant.': 'был съеден великаном.', 'was swallowed by The Worm.': 'был проглочен Червём.', 'was shot by a turret.': 'был застрелен турелью.',
  'was blown up.': 'был взорван.', 'was left behind.': 'был оставлен позади.', 'fell into the void.': 'упал в пустоту.', 'suffocated.': 'задохнулся.',
  'was mauled by a hound.': 'был растерзан гончей.', 'was killed by... themselves?': 'убит... самим собой?', 'opened the wrong door.': 'открыл не ту дверь.',
  'was ejected.': 'был выброшен.', 'blinked.': 'моргнул.', 'was flattened by a crawler.': 'был раздавлен ползуном.', 'was nibbled to death.': 'был обглодан до смерти.',
  'got wrapped up for later.': 'был упакован на потом.', 'was screamed to death.': 'был убит криком.', 'was dissolved.': 'растворился.',
  'touched the wrong pile of junk.': 'тронул не ту кучу хлама.', 'was bonked by a crewmate.': 'получил по голове от напарника.', 'was electrocuted.': 'убит током.',
  'was struck by lightning.': 'был поражён молнией.', 'was eaten by a land shark.': 'был съеден сухопутной акулой.', 'was flattened by the Foreman.': 'был раздавлен Прорабом.',
  'was boiled alive by a steam vent.': 'был сварен заживо паровым клапаном.', 'was run over by the Uplink Van.': 'был сбит фургоном Uplink.', 'died.': 'погиб.',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');
