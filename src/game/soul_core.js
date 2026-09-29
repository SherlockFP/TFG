// SOUL core (wave 8, docs/wave8/soul.md): pure data + rules for src/game/soul.js. No three.js, no DOM: node-testable (tools/harness/soul.test.mjs).
//   1. PALETTES     one strong colour identity per moon (sky / fog / dusk / sun / ground tints / grading). Generated sectors get a seeded shift of their biome.
//   2. planBeats    a "story beat" every ~25 m along the walk from the ship to the entrance (+ a smaller one between each pair), seeded, ground-snapped.
//   3. TX           every found / sign / poster / whiteboard / voice string as [en, tr, ru]; registerSoulText() feeds i18n once.
//   4. voice gate   <= 1 Algorithm / Company line per 45 s, silent during chases; sale grade; whiteboard model.
import { RNG, hashString } from '../core/rng.js';
import { t, addTranslations } from '../core/i18n.js';

// ------------------------------------------------------------------ 1. palettes
/** Fields land on BIOMES[biome] (src/game/moons.js) at install time, so terrain vertex tints and the environment both see them.
 *  sky/fog/night/sun/dusk = colours, fogDensity = absolute, hemiG / hemiW = hemisphere ground colour / white mix (environment.js), tint* = terrain vertex tints,
 *  sat = post-process saturation (moon phase only). */
export const PALETTES = {
  // 56K-Dialup: sodium-orange dusk over rolling hills, warm amber grass, plum night
  hamsi: { biome: 'hills', sky: 0xd99a4a, fog: 0xc98a52, night: 0x1c0f18, sun: 0xffc070, dusk: 0xe0501c, fogDensity: 0.0115, hemiG: 0x40260f, hemiW: 0.22, tint: 0xf0d2a0, pathTint: 0xd8a870, rockTint: 0xc09070, sat: 1.12 },
  // 12-Forum: rotten swamp green, bile-yellow light
  lufer: { biome: 'swamp', sky: 0x7c9040, fog: 0x64803a, night: 0x07120a, sun: 0xe4ee8c, dusk: 0xa88a24, fogDensity: 0.02, hemiG: 0x1c2a0e, hemiW: 0.2, tint: 0xa6c47a, pathTint: 0x8a9a5a, rockTint: 0x7a8a6a, sat: 1.08 },
  // 33-Guestbook: cold teal snow with a blood-red dusk (the beacon colour)
  palamut: { biome: 'snow', sky: 0x62c0cc, fog: 0x90ccd6, night: 0x05192a, sun: 0xdaf6ff, dusk: 0xd8405a, fogDensity: 0.0155, hemiG: 0x123044, hemiW: 0.18, tint: 0xc4eaf4, pathTint: 0x9ac0d0, rockTint: 0x86a8c0, sat: 1.16 },
  // 88-Chatroom: blood-terracotta desert, rose dusk
  levrek: { biome: 'desert', sky: 0xc85a3c, fog: 0xb8482e, night: 0x220a0e, sun: 0xffa458, dusk: 0xff2e48, fogDensity: 0.0098, hemiG: 0x46160e, hemiW: 0.2, tint: 0xffb094, pathTint: 0xe08064, rockTint: 0xc0644c, sat: 1.2 },
  // 666-Creepypasta: bruised violet storm moor
  cipura: { biome: 'moor', sky: 0x4c3a72, fog: 0x3e3060, night: 0x0b0618, sun: 0xbaa8ff, dusk: 0x9a2a72, fogDensity: 0.017, hemiG: 0x1c1034, hemiW: 0.2, tint: 0xb4a0d8, pathTint: 0x8c78b0, rockTint: 0x7a6aa0, sat: 0.98 },
  // 404-Not Found: black forest under a dead red sun
  orkinos: { biome: 'blackforest', sky: 0x3a0e16, fog: 0x2c0c14, night: 0x020004, sun: 0xff5a44, dusk: 0xff2438, fogDensity: 0.0235, hemiG: 0x260808, hemiW: 0.18, tint: 0xc09090, pathTint: 0x9a6a6a, rockTint: 0x7a5a60, sat: 1.1 },
  // 0-Algorithm HQ: fluorescent Company teal
  hq: { biome: 'pier', sky: 0x3a6068, fog: 0x466e74, night: 0x041014, sun: 0xd2f6ee, dusk: 0x38b0a0, fogDensity: 0.0135, hemiG: 0x10282c, hemiW: 0.3, sat: 1.05 },
};
const GRADE_KEYS = ['sky', 'fog', 'night', 'sun', 'dusk', 'fogDensity', 'hemiG', 'hemiW', 'tint', 'pathTint', 'rockTint'];

const hex2 = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const toHex = (r, g, b) => (Math.round(Math.max(0, Math.min(1, r)) * 255) << 16) | (Math.round(Math.max(0, Math.min(1, g)) * 255) << 8) | Math.round(Math.max(0, Math.min(1, b)) * 255);
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (tt) => { tt = (tt % 1 + 1) % 1; return tt < 1 / 6 ? p + (q - p) * 6 * tt : tt < 0.5 ? q : tt < 2 / 3 ? p + (q - p) * (2 / 3 - tt) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/** rotate the hue of a 0xRRGGBB colour by `dh` (0..1 turn) and scale saturation */
export function shiftHex(hex, dh, sMul = 1) {
  const [h, s, l] = rgb2hsl(...hex2(hex));
  return toHex(...hsl2rgb(h + dh, Math.max(0, Math.min(1, s * sMul)), l));
}

/** palette for any moon: hand-authored for the named ones (+ HQ), a seeded shift of the biome for generated sectors / other maps.
 *  base = the biome object (BIOMES[moon.biome]); returns only the fields to overlay (null = leave it alone). */
export function paletteFor(moonId, base, seed = 0) {
  if (PALETTES[moonId]) return PALETTES[moonId];
  if (!base) return null;
  const R = new RNG(hashString(`soulpal|${moonId}|${seed | 0}`));
  const dh = R.float(-0.09, 0.09), sm = R.float(1.05, 1.3);
  const o = { sat: R.float(1.02, 1.12) };
  for (const k of ['sky', 'fog', 'night', 'sun']) if (typeof base[k] === 'number') o[k] = shiftHex(base[k], dh, sm);
  o.dusk = shiftHex(R.pick([0xd8501c, 0xc02a5a, 0xd8a020, 0x8a2ad0]), 0, 1);
  return o;
}
export { GRADE_KEYS };

// ------------------------------------------------------------------ 2. story beats
export const BEAT_KINDS = ['sponsor', 'camp', 'crate', 'bag', 'tracks', 'drone', 'tape'];
/** footprint radius (m) for spacing / placement checks */
export const BEAT_R = { sponsor: 2.2, camp: 3.4, crate: 2.3, bag: 1.5, tracks: 4.2, drone: 1.8, tape: 2.6 };
/** which kinds may sit ON the walking path (tracks / tape only: they have no collider you can bump into) */
const ON_PATH = new Set(['tracks', 'tape']);
const VARIANTS = { sponsor: 6, camp: 4, crate: 3, bag: 3, tracks: 1, drone: 2, tape: 2 };
const TAU = Math.PI * 2;
export const BEAT = { first: 20, gap: 25, jitter: 3, endMargin: 15, lateral: [5.8, 8.6], secondLateral: [9.5, 13], shipClear: 17, entranceClear: 16 };

/** arc-length table of the path polyline */
export function pathTable(P) {
  const s = [0];
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  return { P, s, len: s[s.length - 1] || 0 };
}
/** point + unit tangent at arc-length q */
export function pathAt(tb, q) {
  const { P, s } = tb;
  q = Math.max(0, Math.min(tb.len, q));
  let i = 1;
  while (i < P.length - 1 && s[i] < q) i++;
  const a = P[i - 1], b = P[i], seg = s[i] - s[i - 1] || 1, u = (q - s[i - 1]) / seg;
  const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
  return { x: a.x + tx * u, z: a.z + tz * u, tx: tx / tl, tz: tz / tl };
}

/**
 * planBeats(o) -> specs[]   (seeded: the same seed + moon gives the same beats on every peer)
 *   o = { seed, moonId, pathPts:[{x,z}], heightAt(x,z), plan:{entrance,fires,ponds,lakes}, half, floodY?, avoid?(x,z,m)->bool, extraOk?(x,z,r)->bool, others?:[{x,z,r}], sc? }
 * spec: { id, kind, v (variant), x, y, z, yaw, r, s (arc length), lat, pts? (tracks polyline) }.  y = ground height at (x,z); the builder snaps every part again.
 */
export function planBeats(o) {
  const R = new RNG(hashString(`soul|beats|${o.moonId}|${o.seed | 0}`));
  const h = o.heightAt, plan = o.plan || {}, e = plan.entrance;
  const tb = pathTable(o.pathPts || []);
  const out = [];
  if (tb.len < 40 || !e) return out;
  const lim = (o.half || 200) - 10;
  const others = o.others || [];
  const flat = (x, z, r, maxDy) => {
    const y0 = h(x, z);
    if (o.floodY != null && y0 < o.floodY + 0.5) return null;
    const rr = Math.min(r * 0.75, 3.2);
    let lo = y0, hi = y0;
    for (let k = 0; k < 6; k++) { const yy = h(x + Math.cos(k * TAU / 6) * rr, z + Math.sin(k * TAU / 6) * rr); lo = Math.min(lo, yy); hi = Math.max(hi, yy); }
    return hi - lo <= maxDy ? y0 : null;
  };
  const accept = (x, z, r, onPath) => {
    if (Math.abs(x) > lim || Math.abs(z) > lim) return null;
    if (Math.hypot(x, z) < BEAT.shipClear + r) return null;
    if (Math.hypot(x - e.x, z - e.z) < BEAT.entranceClear + r) return null;
    for (const f of plan.fires || []) if (Math.hypot(x - f.x, z - f.z) < 10 + r) return null;
    for (const p of plan.ponds || []) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.4 + 3.5 + r) return null;
    for (const l of plan.lakes || []) if (Math.hypot(x - l.x, z - l.z) < l.r + 3 + r) return null;
    for (const q of out) if (Math.hypot(x - q.x, z - q.z) < q.r + r + 1.5) return null;
    for (const q of others) if (Math.hypot(x - q.x, z - q.z) < q.r + r + 1.2) return null;
    if (!onPath && o.avoid && o.avoid(x, z, 0.5)) return null;
    if (o.extraOk && !o.extraOk(x, z, r)) return null;
    return flat(x, z, r, onPath ? 1.3 : 1.0);
  };
  // kind bag: every kind once before any repeats; the first beat is always a sponsor sign (reads from far away, teaches the tone)
  let bag = [];
  const nextKind = (allowPath) => {
    for (let tries = 0; tries < 30; tries++) {
      if (!bag.length) bag = R.shuffle(BEAT_KINDS.slice());
      const k = bag.shift();
      if (allowPath || !ON_PATH.has(k)) return k;
      bag.push(k);
    }
    return 'sponsor';
  };
  const place = (kind, q, secondary) => {
    const on = ON_PATH.has(kind), r = BEAT_R[kind];
    const lat0 = secondary ? BEAT.secondLateral : BEAT.lateral;
    const dq = [0, 3, -3, 6, -6, 9, -9];
    for (const d of dq) {
      const c = pathAt(tb, q + d);
      const nx = -c.tz, nz = c.tx;
      const sides = R.chance(0.5) ? [1, -1] : [-1, 1];
      for (const sd of on ? [0] : sides) {
        for (const lat of on ? [0] : [R.float(lat0[0], lat0[1]), lat0[0] + 0.4, lat0[1] - 0.4]) {
          const x = c.x + nx * sd * lat, z = c.z + nz * sd * lat;
          const y = accept(x, z, r, on);
          if (y == null) continue;
          // face the walker: signs / bags / camps look at the path, tracks / tape run along it
          const yaw = on ? Math.atan2(c.tx, c.tz) : Math.atan2(c.x - x, c.z - z) + R.float(-0.35, 0.35);
          const spec = { id: kind.slice(0, 3) + out.length, kind, v: R.int(0, VARIANTS[kind] - 1), x, y, z, yaw, r, s: q + d, lat: sd * lat, secondary: !!secondary };
          if (kind === 'tracks') {   // two wheel lines along the path, ~9 m long
            spec.pts = [];
            for (let k = -4.5; k <= 4.5; k += 0.75) { const p = pathAt(tb, q + d + k); spec.pts.push({ x: p.x + (R.float(-0.06, 0.06)), z: p.z + R.float(-0.06, 0.06), tx: p.tx, tz: p.tz }); }
          }
          out.push(spec);
          return spec;
        }
      }
    }
    return null;
  };
  let q = BEAT.first + R.float(0, 4), n = 0;
  const step = () => BEAT.gap + R.float(-BEAT.jitter, BEAT.jitter);
  while (q <= tb.len - BEAT.endMargin) {
    const kind = n === 0 ? 'sponsor' : nextKind(true);
    place(kind, q, false);
    const nxt = q + step();
    // a smaller off-path beat between two path beats: every ~12 m something is in view
    if (nxt <= tb.len - BEAT.endMargin) place(R.chance(0.6) ? 'bag' : (R.chance(0.5) ? 'drone' : 'crate'), (q + nxt) / 2, true);
    q = nxt; n++;
  }
  return out;
}

// ------------------------------------------------------------------ 3. text ([en, tr, ru]; en is the key)
export const TX = {
  // ---- found text on the beats (lower case allowed, one detail that does not add up)
  camp: [
    ['day 4. dan says the audience is thin tonight. we are three now. we were four.', 'dördüncü gün. dan izleyici az diyor. artık üçüz. dörttük.', 'день 4. дэн говорит, что зрителей мало. нас трое. было четверо.'],
    ['left the lantern on for whoever comes next. it is not the lantern\'s fault.', 'sonra gelen için feneri açık bıraktık. fenerin suçu yok.', 'оставили фонарь тем, кто придёт. фонарь ни в чём не виноват.'],
    ['quota was 130. we made 131. then the number changed.', 'kota 130 idi. 131 yaptık. sonra sayı değişti.', 'квота была 130. мы сделали 131. потом число изменилось.'],
    ['if you find this, check the tent. we did not bring a tent.', 'bunu bulursan çadıra bak. biz çadır getirmedik.', 'если нашли это, проверьте палатку. мы палатку не брали.'],
  ],
  sponsor: [
    ['THIS MOON IS BROUGHT TO YOU BY YOUR FEAR', 'BU AY SİZE KORKUNUZ TARAFINDAN SUNULMUŞTUR', 'ЭТА ЛУНА ПРИ ПОДДЕРЖКЕ ВАШЕГО СТРАХА'],
    ['DEAD ZONE? WE SAY LOW-ENGAGEMENT ZONE', 'ÖLÜ BÖLGE DEĞİL, DÜŞÜK ETKİLEŞİM BÖLGESİ', 'НЕ МЁРТВАЯ ЗОНА, А ЗОНА НИЗКОЙ ВОВЛЕЧЁННОСТИ'],
    ['SMILE. YOU ARE STREAMING. YOU ARE ALWAYS STREAMING.', 'GÜLÜMSE. YAYINDASIN. HEP YAYINDASIN.', 'УЛЫБНИТЕСЬ. ВЫ В ЭФИРЕ. ВЫ ВСЕГДА В ЭФИРЕ.'],
    ['NEXT EXIT: THE FACILITY. LAST EXIT: ALSO THE FACILITY.', 'SONRAKİ ÇIKIŞ: TESİS. SON ÇIKIŞ: YİNE TESİS.', 'СЛЕДУЮЩИЙ ВЫЕЗД: ОБЪЕКТ. ПОСЛЕДНИЙ ВЫЕЗД: ТОЖЕ ОБЪЕКТ.'],
    ['0 DAYS SINCE THE LAST EXCUSE', 'SON MAZERETTEN BERİ 0 GÜN', '0 ДНЕЙ БЕЗ ОТГОВОРОК'],
    ['THE ALGORITHM IS WATCHING OUT FOR YOU', 'ALGORİTMA SİZİ KOLLUYOR', 'АЛГОРИТМ ПРИСМАТРИВАЕТ ЗА ВАМИ'],
  ],
  sponsorTag: [['SPONSORED', 'SPONSORLU', 'РЕКЛАМА'], ['a message from the Company', 'Şirketten bir mesaj', 'сообщение от Компании']],
  crate: [
    ['PROPERTY OF THE COMPANY\nDEDUCTIBLE', 'ŞİRKET MALIDIR\nMAAŞTAN KESİLİR', 'СОБСТВЕННОСТЬ КОМПАНИИ\nВЫЧИТАЕТСЯ ИЗ ЗАРПЛАТЫ'],
    ['FRAGILE\n(LIKE YOU)', 'KIRILGAN\n(SENİN GİBİ)', 'ХРУПКОЕ\n(КАК И ВЫ)'],
    ['RETURN TO SENDER\nSENDER: UNKNOWN', 'GÖNDERENE İADE\nGÖNDEREN: BİLİNMİYOR', 'ВЕРНУТЬ ОТПРАВИТЕЛЮ\nОТПРАВИТЕЛЬ: НЕИЗВЕСТЕН'],
  ],
  bag: [
    ['BAG 7\n1 EMPLOYEE\nVALUE: PENDING', 'TORBA 7\n1 ÇALIŞAN\nDEĞER: BEKLİYOR', 'МЕШОК 7\n1 СОТРУДНИК\nЦЕННОСТЬ: ОЖИДАЕТСЯ'],
    ['BAG 12\nDO NOT OPEN\n(NOT EMPTY)', 'TORBA 12\nAÇMA\n(BOŞ DEĞİL)', 'МЕШОК 12\nНЕ ОТКРЫВАТЬ\n(НЕ ПУСТОЙ)'],
    ['BAG 3\nRETURNED TO SENDER\nSENDER DECLINED', 'TORBA 3\nGÖNDERENE İADE\nGÖNDEREN REDDETTİ', 'МЕШОК 3\nВОЗВРАЩЁН\nОТПРАВИТЕЛЬ ОТКАЗАЛСЯ'],
  ],
  drone: [['CAM-07\nLAST SEEN WATCHING', 'KAM-07\nSON GÖRÜLDÜĞÜNDE İZLİYORDU', 'КАМ-07\nПОСЛЕДНИЙ РАЗ ЗАМЕЧЕНА ЗА НАБЛЮДЕНИЕМ'], ['CAM-12\nNOT RESPONDING\nSTILL RECORDING', 'KAM-12\nYANIT VERMİYOR\nHÂLÂ KAYITTA', 'КАМ-12\nНЕ ОТВЕЧАЕТ\nВСЁ ЕЩЁ ПИШЕТ']],
  tape: [['QUARANTINE\nENGAGEMENT HAZARD', 'KARANTİNA\nETKİLEŞİM TEHLİKESİ', 'КАРАНТИН\nОПАСНОСТЬ ВОВЛЕЧЁННОСТИ'], ['DO NOT CROSS\n(WE WILL KNOW)', 'GEÇME\n(BİLECEĞİZ)', 'НЕ ПЕРЕХОДИТЬ\n(МЫ УЗНАЕМ)']],
  // ---- ship
  boardTitle: [['CREW BOARD', 'EKİP TAHTASI', 'ДОСКА ЭКИПАЖА']],
  boardDays: [['Days on the feed', 'Yayındaki gün', 'Дней в эфире']],
  boardDead: [['Deplatformed', 'Kovulan', 'Забанено']],
  boardBest: [['Best haul', 'En iyi kazanç', 'Лучший улов']],
  boardQuota: [['Quotas met', 'Karşılanan kota', 'Квот выполнено']],
  boardFoot: [['Morale: see quota', 'Moral: kotaya bak', 'Мораль: см. квоту']],
  poster: [
    ['SYNERGY\nIS A CHOICE', 'SİNERJİ\nBİR SEÇİMDİR', 'СИНЕРГИЯ\n- ЭТО ВЫБОР'],
    ['YOUR PANIC\nIS OUR PASSION', 'PANİĞİN\nBİZİM TUTKUMUZ', 'ВАША ПАНИКА\n- НАША СТРАСТЬ'],
    ['THERE IS NO "I"\nIN EMPLOYEE\n(THERE IS "EE")', 'ÇALIŞAN\'DA "BEN"\nYOK', 'В СЛОВЕ «СОТРУДНИК»\nНЕТ СЛОВА «Я»'],
  ],
  posterSub: [['- The Company', '- Şirket', '- Компания']],
  notes: [
    ['whoever keeps unplugging the coffee: I have clips.', 'kahveyi sürekli fişten çeken kişi: klibin var bende.', 'кто вечно выдёргивает кофеварку: у меня есть записи.'],
    ['lever is not a toy. - mgmt', 'kol oyuncak değil. - yönetim', 'рычаг - не игрушка. - руководство'],
    ['if found dead, please return badge', 'ölü bulunursa lütfen rozeti iade edin', 'при обнаружении трупа верните бейдж'],
    ['do not feed the plant. it knows.', 'bitkiyi besleme. biliyor.', 'не кормите растение. оно знает.'],
  ],
  mugs: [['WORLD\'S OKAYEST JANITOR', 'DÜNYANIN İDARE EDER TEMİZLİKÇİSİ', 'ПОСРЕДСТВЕННЕЙШИЙ УБОРЩИК МИРА'], ['#1 CONTENT', '#1 İÇERİK', 'КОНТЕНТ №1'], ['THIS IS FINE', 'İYİ İYİ', 'ВСЁ НОРМАЛЬНО']],
  // ---- landing title card (moon -> Algorithm one-liner)
  land_hamsi: [['Estimated time to panic: four minutes.', 'Tahmini panik süresi: dört dakika.', 'Ориентировочное время до паники: четыре минуты.']],
  land_lufer: [['A forum where every thread ended badly. Post carefully.', 'Her başlığın kötü bittiği bir forum. Dikkatli yazın.', 'Форум, где каждая тема кончилась плохо. Пишите осторожно.']],
  land_palamut: [['Sign the guestbook. Nobody who signed has left.', 'Ziyaretçi defterini imzala. İmzalayan kimse ayrılmadı.', 'Распишитесь в гостевой книге. Никто из расписавшихся не уходил.']],
  land_levrek: [['Chat is dead here. The room is not empty.', 'Sohbet burada öldü. Oda boş değil.', 'Чат здесь мёртв. Комната не пуста.']],
  land_cipura: [['Every homepage has a visitor counter. You are number one.', 'Her ana sayfada ziyaretçi sayacı olur. Birinci sizsiniz.', 'На каждой домашней странице есть счётчик. Вы - первый.']],
  land_orkinos: [['Page not found. You, however, were found.', 'Sayfa bulunamadı. Ama siz bulundunuz.', 'Страница не найдена. А вот вас нашли.']],
  land_hq: [['Sell. Smile. Do not ask where the scrap goes.', 'Sat. Gülümse. Hurdanın nereye gittiğini sorma.', 'Продавайте. Улыбайтесь. Не спрашивайте, куда девается хлам.']],
  land_any: [['New sector. New audience. Same you.', 'Yeni sektör. Yeni izleyici. Aynı sen.', 'Новый сектор. Новые зрители. Тот же вы.']],
  landCard: [['TOUCHDOWN', 'İNİŞ', 'ПОСАДКА']],
  // ---- Algorithm, ambient (walking outside)
  walk: [
    ['Your walk cycle is trending. Nobody knows why.', 'Yürüyüşün trend oldu. Nedenini kimse bilmiyor.', 'Ваша походка в трендах. Никто не знает почему.'],
    ['Viewers are up. You have done nothing yet. Keep it that way.', 'İzleyici arttı. Henüz hiçbir şey yapmadın. Böyle devam et.', 'Зрителей стало больше. Вы пока ничего не сделали. Так и продолжайте.'],
    ['Slow is fine. Slow builds tension. Tension builds retention.', 'Yavaş olması sorun değil. Yavaşlık gerilim, gerilim ilgi getirir.', 'Медленно - это нормально. Медленно - значит напряжение. Напряжение - значит удержание.'],
    ['I paused your episode to take a call. You did not notice. Lovely.', 'Bir arama için bölümünü durdurdum. Fark etmedin. Harika.', 'Я поставил ваш эпизод на паузу ради звонка. Вы не заметили. Прелестно.'],
    ['Your bodycam is very steady. Someone in the audience cried.', 'Gövde kameran çok sabit. İzleyicilerden biri ağladı.', 'Ваша нагрудная камера очень устойчива. Кто-то из зрителей плакал.'],
    ['Thirty seconds of walking. Engagement dipped four percent. Do something.', 'Otuz saniye yürüdün. Etkileşim yüzde dört düştü. Bir şey yap.', 'Тридцать секунд ходьбы. Вовлечённость упала на четыре процента. Сделайте что-нибудь.'],
  ],
  // ---- Algorithm, next to a beat (kind -> line)
  b_crate: [['That crate is Company property. The last crew agreed.', 'O sandık Şirket malı. Önceki ekip de kabul etmişti.', 'Этот ящик - собственность Компании. Прошлая бригада согласилась.']],
  b_camp: [['The last crew left in a hurry. I kept their footage. It performed well.', 'Son ekip aceleyle ayrıldı. Görüntülerini sakladım. İyi izlendi.', 'Прошлая бригада ушла в спешке. Их записи я сохранил. Смотрели хорошо.']],
  b_sponsor: [['Sponsors are watching too. Wave.', 'Sponsorlar da izliyor. El salla.', 'Спонсоры тоже смотрят. Помашите.']],
  b_bag: [['Please do not open that. Unwatched deaths do not count toward quota.', 'Lütfen açmayın. İzlenmeyen ölümler kotaya sayılmaz.', 'Пожалуйста, не открывайте. Ненаблюдаемые смерти в квоту не идут.']],
  b_drone: [['One of my cameras. It did not resign. It fell.', 'Kameralarımdan biri. İstifa etmedi. Düştü.', 'Одна из моих камер. Она не уволилась. Она упала.']],
  b_tracks: [['Someone drove here. Nobody drove back. Fascinating.', 'Biri buraya sürdü. Kimse geri sürmedi. İlginç.', 'Кто-то приехал сюда. Никто не уехал. Занятно.']],
  b_tape: [['That tape is decorative. So is your caution.', 'O bant süs. İhtiyatın da öyle.', 'Эта лента декоративная. Как и ваша осторожность.']],
  // ---- Company PA (ship / orbit / HQ)
  pa: [
    ['Company notice: mandatory fun begins at once. Attendance is recorded.', 'Şirket duyurusu: zorunlu eğlence hemen başlıyor. Katılım kaydedilir.', 'Уведомление Компании: обязательное веселье начинается немедленно. Явка фиксируется.'],
    ['Employees are reminded that the airlock is not an exit. It is a consequence.', 'Çalışanlara hatırlatılır: hava kilidi çıkış değildir. Sonuçtur.', 'Напоминаем сотрудникам: шлюз - не выход. Это последствие.'],
    ['Lost scrap will be found. The finder will be thanked. The loser will be restructured.', 'Kayıp hurda bulunacak. Bulan teşekkür alacak. Kaybeden yeniden yapılandırılacak.', 'Потерянный хлам будет найден. Нашедшего поблагодарят. Потерявшего реструктуризируют.'],
    ['This is a Company announcement. If you hear this, you are still employed.', 'Bu bir Şirket duyurusudur. Bunu duyuyorsanız hâlâ çalışıyorsunuz.', 'Объявление Компании. Если вы это слышите, вы всё ещё трудоустроены.'],
    ['Wellness hour is postponed until after the quota. Wellness thanks you.', 'Sağlık saati kotadan sonraya ertelendi. Sağlık teşekkür eder.', 'Час здоровья перенесён на после квоты. Здоровье благодарит вас.'],
    ['Please stop naming the scrap. It does not help the scrap.', 'Lütfen hurdalara isim vermeyi bırakın. Hurdaya faydası yok.', 'Пожалуйста, не давайте хламу имён. Хламу от этого не легче.'],
  ],
  // ---- sale reactions (shown in the sale panel; intercom only when the 45 s gate is free)
  sale_good: [
    ['That is a lot of content. I have already sold it twice.', 'Bu çok içerik. Onu şimdiden iki kez sattım.', 'Столько контента. Я его уже дважды продал.'],
    ['Beautiful haul. The audience threw money. I kept it.', 'Güzel bir yük. İzleyici para attı. Ben aldım.', 'Прекрасный улов. Зрители бросили деньги. Я оставил их себе.'],
  ],
  sale_ok: [['Acceptable. Like a sandwich.', 'İdare eder. Bir sandviç gibi.', 'Приемлемо. Как бутерброд.']],
  sale_bad: [
    ['That is all? The bots are leaving.', 'Hepsi bu mu? Botlar gidiyor.', 'И это всё? Боты уходят.'],
    ['I have seen bigger hauls from the dead.', 'Ölülerden daha büyük yükler gördüm.', 'Я видел улов и побольше - у мёртвых.'],
  ],
  quota_met: [['Company notice: the quota has increased in response to your success.', 'Şirket duyurusu: başarınız üzerine kota artırılmıştır.', 'Уведомление Компании: в ответ на ваш успех квота увеличена.']],
  // ---- UI (plain)
  pop_sold: [['Sold', 'Satıldı', 'Продано']],
  pop_best: [['New best haul', 'Yeni en iyi kazanç', 'Новый рекорд улова']],
  skip: [['[any key] skip', '[herhangi bir tuş] geç', '[любая клавиша] пропустить']],
};

let _registered = false;
export function registerSoulText() {
  if (_registered) return;
  _registered = true;
  const tr = {}, ru = {};
  for (const arr of Object.values(TX)) for (const [en, a, b] of arr) { if (a) tr[en] = a; if (b) ru[en] = b; }
  addTranslations(tr, 'tr');
  addTranslations(ru, 'ru');
}
/** translated string of TX[key][i] */
export const tx = (key, i = 0) => { const a = TX[key]; return a ? t(a[((i % a.length) + a.length) % a.length][0]) : ''; };

// ------------------------------------------------------------------ 4. voice gate, sale grade, whiteboard
export const VOICE = { gap: 45, firstAfter: 22, walkEvery: 75, beatNear: 9 };
export function makeGate(gap = VOICE.gap) {
  let last = -1e9;
  return {
    /** may a line play now? (chase = the player is being chased / downed / dead) */
    ok(now, chase, busy) { return !chase && !busy && now - last >= gap; },
    mark(now) { last = now; },
    get last() { return last; },
    reset() { last = -1e9; },
  };
}
/** 'good' | 'ok' | 'bad' from one sale total against what is still missing for the quota */
export function saleGrade(total, need, quota) {
  if (total <= 0) return 'bad';
  if (need > 0 && total >= need) return 'good';
  if (total >= Math.max(40, (quota || 130) * 0.4)) return 'good';
  if (total >= Math.max(20, (quota || 130) * 0.18)) return 'ok';
  return 'bad';
}
/** pick by a deterministic rotating index (no Math.random: same crew sees the same order) */
export const pickIdx = (n, salt) => (((salt | 0) % n) + n) % n;
/** whiteboard numbers from the run + profile (any part may be missing) */
export function boardModel(run, stats) {
  const s = stats || {};
  return { days: Math.max(0, (run?.day | 0) || 0), dead: Math.max(0, s.deaths | 0), best: Math.max(0, s.bestHaul | 0), quotas: Math.max(0, (run?.quotaIndex | 0) || 0), lifetimeQuotas: Math.max(0, s.quotasMet | 0) };
}
/** tally marks: groups of five drawn as |||| with a slash. returns [[n,...]] as counts per group (5,5,3) capped at `cap` marks */
export function tallyGroups(n, cap = 20) {
  n = Math.min(Math.max(0, n | 0), cap);
  const out = [];
  while (n > 0) { out.push(Math.min(5, n)); n -= 5; }
  return out;
}
/** plant size 0..6 from quotas met */
export const plantSize = (quotaIndex) => Math.max(0, Math.min(6, quotaIndex | 0));
