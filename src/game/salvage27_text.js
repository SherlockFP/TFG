import {addTranslations} from '../core/i18n.js';
import {SALVAGE27_ITEMS} from './salvage27_core.js';
const [drum,glass,sorter]=SALVAGE27_ITEMS;
addTranslations({
  [drum.name]:'Yanıt Tamburu',[glass.name]:'İndeks Camı',[sorter.name]:'Arşiv Ayırıcı',
  [drum.tip]:'Gevşek makaralar acele edince veya sarsılınca takırdar. Sessiz yürü, arkadaşın taşımanı desteklesin ya da el arabasına yükle.',
  [glass.tip]:'Çelik çerçevede asılı bir arşiv levhası. Tutma ışınıyla taşı; dar dönüşlerden önce frenle.',
  [sorter.tip]:'Ulaşmamış iletiler için sağlam ayırıcı. Rahat taşınır; ek gürültüsü veya bakımı yok.',
},'tr');
addTranslations({
  [drum.name]:'Барабан ответов',[glass.name]:'Индексное стекло',[sorter.name]:'Архивный сортировщик',
  [drum.tip]:'Свободные катушки гремят, если спешить или трясти их. Идите тихо, попросите товарища помочь нести или загрузите тележку.',
  [glass.tip]:'Архивная панель подвешена в стальной раме. Несите лучом захвата; тормозите перед узкими поворотами.',
  [sorter.tip]:'Прочный сортировщик недоставленных сообщений. Легко нести; без лишнего шума и обслуживания.',
},'ru');
