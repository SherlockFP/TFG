// The old terminal in the Content Review Cell: a full-screen retro shell (HELP / DIR / CAT / LOGIN / ARCADE / SECRETS / APPEAL),
// a tiny text adventure (LOST_ACCOUNT.EXE) and launchers for the arcade minigames (FLAPPY PHISH, DEAD FEED).
// TerminalEngine + Adventure are pure (no DOM) so they can be unit-tested in node; TerminalUI is the DOM shell.
import { getLang, addTranslations } from '../core/i18n.js';
import { L, pick, FILES, LOCKED_FILES, LOGINS, SECRET_INFO } from './menulore.js';
import { createArcade } from '../minigames/arcade.js';
import { createDeadFeed } from '../minigames/deadfeed.js';
import '../minigames/minigames.css';

const tr = () => getLang() === 'tr';
const pk = (en, trs) => (tr() ? trs : en);

addTranslations({
  'FLAPPY PHISH': 'FLAPPY PHISH',
  'DEAD FEED': 'DEAD FEED',
});

// ------------------------------------------------------------------------------------------------ adventure
const ROOMS = {
  server: {
    name: L('SERVER ROOM', 'SUNUCU ODASI'), dark: true, exits: { n: 'hall' },
    lit: L('Racks hum in long rows. Cables hang like wet hair. A dead exit sign points NORTH.', 'Raflar uzun sıralar halinde uğulduyor. Kablolar ıslak saç gibi sarkıyor. Ölü bir çıkış tabelası KUZEY\'i gösteriyor.'),
    dim: L('It is pitch black. Something here wants your attention. Your foot nudges something small and round.', 'Zifiri karanlık. Burada bir şey dikkatini istiyor. Ayağın küçük yuvarlak bir şeye çarpıyor.'),
    items: ['battery'],
  },
  hall: {
    name: L('HALLWAY', 'KORİDOR'), dark: true, exits: { s: 'server', n: 'gate', w: 'office' },
    lit: L('A long hallway of dead ceiling panels. A light leaks from a door WEST. The way NORTH ends at a big gate.', 'Ölü tavan panellerinden oluşan uzun bir koridor. BATI\'daki bir kapıdan ışık sızıyor. KUZEY\'deki yol büyük bir kapıda bitiyor.'),
    dim: L('It is dark. You hear a wet, patient breathing. A thin light leaks from somewhere WEST.', 'Karanlık. Islak, sabırlı bir nefes duyuyorsun. BATI\'da bir yerden ince bir ışık sızıyor.'),
    items: [],
  },
  office: {
    name: L("MODERATOR'S OFFICE", 'MODERATÖR OFİSİ'), dark: false, exits: { e: 'hall' },
    lit: L('Forty small CRTs show forty small crimes. A desk holds a MEMO and a KEYCARD. The hallway is EAST.', 'Kırk küçük CRT kırk küçük suç gösteriyor. Masada bir NOT ve bir ANAHTAR KART var. Koridor DOĞU\'da.'),
    dim: null,
    items: ['memo', 'keycard'],
  },
  gate: {
    name: L('THE CAPTCHA GATE', 'CAPTCHA KAPISI'), dark: true, exits: { s: 'hall', n: 'farm' }, gate: true,
    lit: L('A huge gate. A sign glows: PLEASE PROVE YOU ARE NOT A ROBOT. SELECT ALL SQUARES WITH TRAFFIC LIGHTS. There are no squares. There are no traffic lights.', 'Kocaman bir kapı. Bir tabela parlıyor: LÜTFEN ROBOT OLMADIĞINI KANITLA. TRAFİK IŞIKLARI OLAN TÜM KARELERİ SEÇ. Kare yok. Trafik ışığı yok.'),
    dim: L('Something huge and cold is in front of you. A sign glows just enough to read: SELECT ALL SQUARES.', 'Önünde kocaman ve soğuk bir şey var. Bir tabela okunacak kadar parlıyor: TÜM KARELERİ SEÇ.'),
    items: [],
  },
  farm: {
    name: L('ENGAGEMENT FARM', 'ETKİLEŞİM ÇİFTLİĞİ'), dark: true, exits: { s: 'gate', n: 'source' }, locked: 'keycard',
    lit: L('Rows of glass tanks, each with a sleeping spam bot. They twitch when you pass. A steel door NORTH has a card reader.', 'Cam tank sıraları, her birinde uyuyan bir spam bot. Geçtikçe seğiriyorlar. KUZEY\'deki çelik kapıda kart okuyucu var.'),
    dim: L('Glass tanks glint in the dark. Something inside them twitches when you pass.', 'Karanlıkta cam tanklar parlıyor. İçlerindeki bir şey sen geçince seğiriyor.'),
    items: [],
  },
  source: {
    name: L('THE SOURCE', 'KAYNAK'), dark: false, exits: { s: 'farm' }, source: true,
    lit: L('One chair. One cable, thick as an arm, labelled RANK-7 v1, running into the floor. You could PULL the PLUG. Or you could SIT.', 'Tek bir sandalye. Kolunuz kalınlığında, RANK-7 v1 etiketli, yere giren bir kablo. FİŞİ ÇEKEBİLİRSİN. Ya da OTURABİLİRSİN.'),
    dim: null,
    items: [],
  },
};
const ITEMS = {
  phone: { names: ['phone', 'flashlight', 'torch'], name: L('your phone (flashlight)', 'telefonun (fener)'), desc: L('A cracked phone. The flashlight works if it has a battery.', 'Çatlak bir telefon. Pili varsa fener çalışır.') },
  battery: { names: ['battery', 'cylinder', 'thing', 'round', 'small'], name: L('a battery', 'bir pil'), desc: L('A fresh battery. Made by Feed Corp. Contains 0 lies.', 'Yepyeni bir pil. Feed Corp yapımı. İçinde 0 yalan var.') },
  memo: { names: ['memo', 'note', 'paper'], name: L('a memo', 'bir not'), desc: L('MEMO: per section 4.2, the plug at the Source is the only ban that works. The gate wants you to select NONE. Robots always select something.', 'NOT: madde 4.2 uyarınca Kaynak\'taki fiş işe yarayan tek yasak. Kapı senden HİÇBİRİNİ seçmeni istiyor. Robotlar hep bir şey seçer.') },
  keycard: { names: ['keycard', 'card', 'badge'], name: L('a keycard', 'bir anahtar kart'), desc: L('MODERATOR, EXPIRED 2031. The farm door does not check the date.', 'MODERATÖR, SÜRESİ 2031\'DE DOLDU. Çiftlik kapısı tarihe bakmıyor.') },
};
const DIRS = { n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w' };
const DIRNAME = { n: L('north', 'kuzey'), s: L('south', 'güney'), e: L('east', 'doğu'), w: L('west', 'batı') };

export class Adventure {
  constructor(onEnd) {
    this.onEnd = onEnd || (() => {});
    this.room = 'server';
    this.inv = new Set(['phone']);
    this.items = {}; for (const [k, r] of Object.entries(ROOMS)) this.items[k] = [...r.items];
    this.light = 0; this.dark = 0; this.gateOpen = false; this.turns = 0;
    this.done = false; this.ending = null;
  }
  isDark() { const r = ROOMS[this.room]; return r.dark && this.light <= 0; }
  intro() {
    return [pk('LOST_ACCOUNT.EXE  -  a text adventure. Type HELP for verbs.', 'LOST_ACCOUNT.EXE  -  bir metin macerası. Fiiller için HELP yaz.'), ''].concat(this.look());
  }
  look() {
    const r = ROOMS[this.room];
    const out = ['== ' + pick(r.name) + ' =='];
    if (this.isDark()) out.push(pick(r.dim));
    else {
      out.push(pick(r.lit));
      const its = this.items[this.room].map((i) => pick(ITEMS[i].name));
      if (its.length) out.push(pk('You see: ', 'Görüyorsun: ') + its.join(', ') + '.');
    }
    return out;
  }
  find(word) {
    if (!word) return null;
    for (const [id, it] of Object.entries(ITEMS)) if (it.names.includes(word)) return id;
    return null;
  }
  tick(out) {
    this.turns++;
    if (this.light > 0) {
      this.light--;
      if (this.light === 3) out.push(pk('Your phone flickers: 3%.', 'Telefonun titriyor: %3.'));
      if (this.light === 0) out.push(pk('Your phone dies. The dark comes back like a cat.', 'Telefonun ölüyor. Karanlık kedi gibi geri dönüyor.'));
    }
    if (this.isDark()) {
      this.dark++;
      if (this.dark === 1) out.push(pk('(you feel watched)', '(izlendiğini hissediyorsun)'));
      if (this.dark === 2) out.push(pk('Something breathes on your neck. It is very close now.', 'Boynuna bir şey nefes veriyor. Artık çok yakın.'));
      if (this.dark >= 3) {
        out.push(pk('The Lurker likes your post. Then it likes YOU. It is a long, wet like.', 'Lurker gönderini beğeniyor. Sonra SENİ beğeniyor. Uzun, ıslak bir beğeni.'));
        out.push('', pk('*** YOU HAVE BEEN DEPLATFORMED ***  (type LOST_ACCOUNT to try again)', '*** PLATFORMDAN ATILDIN ***  (tekrar denemek için LOST_ACCOUNT yaz)'));
        this.finish('lurker');
      }
    } else this.dark = 0;
  }
  finish(ending) { this.done = true; this.ending = ending; this.onEnd(ending); }
  go(dir, out) {
    const r = ROOMS[this.room];
    const to = r.exits[dir];
    if (!to) { out.push(pk('You cannot go that way.', 'O yöne gidemezsin.')); return; }
    if (r.gate && dir === 'n' && !this.gateOpen) { out.push(pk('The gate does not move. It wants an answer. (try SELECT <squares>)', 'Kapı kıpırdamıyor. Bir cevap istiyor. (SELECT <kare> dene)')); this.tick(out); return; }
    if (this.room === 'farm' && dir === 'n' && !this.inv.has('keycard')) { out.push(pk('The steel door wants a keycard.', 'Çelik kapı bir anahtar kart istiyor.')); this.tick(out); return; }
    this.room = to;
    out.push(...this.look());
    this.tick(out);
  }
  input(line) {
    const out = [];
    const w = String(line || '').toLowerCase().replace(/[^a-z0-9_ ]/g, ' ').split(/\s+/).filter(Boolean).filter((x) => !['the', 'a', 'an', 'to', 'at', 'on'].includes(x));
    if (!w.length) return out;
    const v = w[0], a = w[1];
    if (DIRS[v] && w.length === 1) { this.go(DIRS[v], out); return out; }
    switch (v) {
      case 'go': case 'walk': case 'run': if (DIRS[a]) this.go(DIRS[a], out); else out.push(pk('Go where? (N S E W)', 'Nereye? (N S E W)')); break;
      case 'look': case 'l': out.push(...this.look()); break;
      case 'help': case '?':
        out.push(pk('Verbs: LOOK, N/S/E/W, TAKE <x>, DROP <x>, INV, USE <x>, READ <x>, EXAMINE <x>, SELECT <x>, PULL PLUG, SIT, WAIT, QUIT', 'Fiiller: LOOK, N/S/E/W, TAKE <x>, DROP <x>, INV, USE <x>, READ <x>, EXAMINE <x>, SELECT <x>, PULL PLUG, SIT, WAIT, QUIT'));
        break;
      case 'quit': case 'exit': case 'q': out.push(pk('You close the account. It stays open on their side.', 'Hesabı kapatıyorsun. Onların tarafında açık kalıyor.')); this.finish('quit'); break;
      case 'inv': case 'i': case 'inventory': out.push(pk('You carry: ', 'Taşıdıkların: ') + [...this.inv].map((i) => pick(ITEMS[i].name)).join(', ') + '.'); break;
      case 'take': case 'get': case 'grab': case 'pick': {
        const id = this.find(a === 'up' ? w[2] : a);
        const here = this.items[this.room];
        if (id && here.includes(id)) {
          this.items[this.room] = here.filter((x) => x !== id); this.inv.add(id);
          out.push(pk('Taken: ', 'Alındı: ') + pick(ITEMS[id].name) + '.');
        } else out.push(pk('You cannot take that.', 'Onu alamazsın.'));
        this.tick(out); break;
      }
      case 'drop': {
        const id = this.find(a);
        if (id && this.inv.has(id) && id !== 'phone') { this.inv.delete(id); this.items[this.room].push(id); out.push(pk('Dropped.', 'Bırakıldı.')); } else out.push(pk('You cannot drop that.', 'Onu bırakamazsın.'));
        this.tick(out); break;
      }
      case 'read': case 'examine': case 'x': case 'inspect': {
        const id = this.find(a);
        if (id && (this.inv.has(id) || (!this.isDark() && this.items[this.room].includes(id)))) out.push(pick(ITEMS[id].desc));
        else if (a === 'gate' || a === 'sign') out.push(pick(ROOMS.gate.lit));
        else out.push(pk('You see nothing special.', 'Özel bir şey görmüyorsun.'));
        break;
      }
      case 'use': case 'turn': case 'switch': {
        const id = this.find(a === 'on' ? w[2] : a) || (a === 'on' ? 'phone' : null);
        if (id === 'phone' || id === 'battery') {
          if (this.inv.has('battery')) { this.inv.delete('battery'); this.light = 18; this.dark = 0; out.push(pk('You jam the battery in. The flashlight comes on. The dark takes one step back.', 'Pili takıyorsun. Fener yanıyor. Karanlık bir adım geri çekiliyor.')); out.push(...this.look()); }
          else if (this.light > 0) out.push(pk('The flashlight is already on.', 'Fener zaten yanıyor.'));
          else out.push(pk('Click. The phone is at 0%. It needs a battery.', 'Tık. Telefon %0. Bir pile ihtiyacı var.'));
        } else if (id === 'keycard') out.push(pk('Use it on the steel door: just walk NORTH from the farm.', 'Çelik kapıda kullan: çiftlikten KUZEY\'e yürü.'));
        else out.push(pk('Nothing happens.', 'Hiçbir şey olmuyor.'));
        this.tick(out); break;
      }
      case 'select': case 'say': case 'click': case 'answer': case 'none': {
        if (this.room === 'gate' && (a === 'none' || v === 'none' || a === 'nothing' || a === 'no' || a === 'zero')) {
          this.gateOpen = true; out.push(pk('CORRECT. Robots always select something. The gate sighs open.', 'DOĞRU. Robotlar hep bir şey seçer. Kapı içini çekerek açılıyor.'));
        } else if (this.room === 'gate') out.push(pk('INCORRECT. A robot would say that. Try again.', 'YANLIŞ. Bir robot bunu söylerdi. Tekrar dene.'));
        else out.push(pk('Nobody is asking.', 'Kimse sormuyor.'));
        this.tick(out); break;
      }
      case 'pull': case 'unplug': case 'yank':
        if (this.room === 'source') {
          out.push(pk('You pull the plug. The Feed dies. Every screen goes black at once. You are alone in the dark and, for once, it is the good kind.', 'Fişi çekiyorsun. Akış ölüyor. Tüm ekranlar aynı anda kararıyor. Karanlıkta yalnızsın ve bu kez iyi türden.'));
          out.push('', pk('*** ENDING: CLEAN FEED ***', '*** SON: TEMİZ AKIŞ ***')); this.finish('plug');
        } else out.push(pk('There is nothing to pull here.', 'Burada çekilecek bir şey yok.'));
        break;
      case 'sit':
        if (this.room === 'source') {
          out.push(pk('You sit. The chair fits. It says: "Welcome back, favourite creator. Season 2 begins now."', 'Oturuyorsun. Sandalye tam oturuyor. Diyor ki: "Tekrar hoş geldin, favori içerik üretici. Sezon 2 şimdi başlıyor."'));
          out.push('', pk('*** ENDING: THE NEW ALGORITHM ***  (both endings test well)', '*** SON: YENİ ALGORİTMA ***  (iki son da iyi test ediliyor)')); this.finish('sit');
        } else out.push(pk('There is no chair here you would want to sit in.', 'Burada oturmak isteyeceğin bir sandalye yok.'));
        break;
      case 'wait': case 'z': out.push(pk('Time passes. It always does. It is billed to you.', 'Zaman geçiyor. Hep geçer. Faturası sana.')); this.tick(out); break;
      case 'xyzzy': case 'plugh': out.push(pk('Nothing happens. Then everything does. The Feed liked that.', 'Hiçbir şey olmuyor. Sonra her şey oluyor. Akış bunu beğendi.')); break;
      default: out.push(pk('I do not understand. Type HELP.', 'Anlamadım. HELP yaz.'));
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ shell
const HELP = [
  ['HELP', L('this list', 'bu liste')], ['DIR', L('list files', 'dosyaları listele')], ['CAT <file>', L('print a file', 'dosyayı yazdır')],
  ['LOGIN <user> <pass>', L('log in (try the passwords you find)', 'giriş yap (bulduğun şifreleri dene)')],
  ['ARCADE', L('FLAPPY PHISH, DEAD FEED', 'FLAPPY PHISH, DEAD FEED')], ['LOST_ACCOUNT', L('text adventure', 'metin macerası')],
  ['APPEAL <code>', L('file an appeal', 'itiraz dosyala')], ['SECRETS', L('what you have unlocked', 'açtıkların')],
  ['WHOAMI / DATE / CLEAR / EXIT', L('you know these', 'bunları biliyorsun')],
];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

export class TerminalEngine {
  // host: { secrets():obj, unlock(id):bool, name():string, launch(kind):void, close():void, score(kind):number }
  constructor(host) { this.host = host; this.adv = null; this.user = 'subject'; }
  banner() {
    return ['TFG OS v4.1  (c) FEED CORP', pk('CONTENT REVIEW CELL 07  /  terminal 2 of 2', 'İÇERİK İNCELEME HÜCRESİ 07  /  terminal 2 / 2'),
      pk('Type HELP for commands.', 'Komutlar için HELP yaz.'), ''];
  }
  prompt() { return this.adv ? '?> ' : `${this.user}@cell07> `; }
  visibleFiles() {
    const s = this.host.secrets();
    const files = Object.keys(FILES);
    for (const [name, f] of Object.entries(LOCKED_FILES)) if (s[f.secret]) files.push(name);
    return files;
  }
  unlock(id, out) {
    if (this.host.unlock(id)) out.push('', '*** ' + pk('SECRET UNLOCKED', 'SIR AÇILDI') + ': ' + pick(SECRET_INFO[id]?.name || id) + ' ***');
  }
  exec(raw) {
    const line = String(raw || '').trim();
    const out = [];
    if (this.adv) {
      const res = this.adv.input(line);
      out.push(...res);
      if (this.adv.done) {
        const e = this.adv.ending;
        this.adv = null;
        if (e === 'plug' || e === 'sit') this.unlock('lostaccount', out);
        out.push('');
      }
      return out;
    }
    if (!line) return out;
    const [cmdRaw, ...rest] = line.split(/\s+/);
    const cmd = cmdRaw.toUpperCase();
    const arg = rest.join(' ');
    switch (cmd) {
      case 'HELP': case '?': case 'H':
        out.push(pk('COMMANDS', 'KOMUTLAR'));
        for (const [c, d] of HELP) out.push('  ' + pad(c, 22) + pick(d));
        break;
      case 'DIR': case 'LS': {
        out.push(pk('DIRECTORY OF A:\\CELL07', 'A:\\HUCRE07 DİZİNİ'), '');
        for (const f of this.visibleFiles()) out.push('  ' + f);
        out.push('  LOST_ACCOUNT.EXE', '  DEADFEED.EXE', '  PHISH.EXE');
        out.push('', pk(`  ${this.visibleFiles().length + 3} file(s)`, `  ${this.visibleFiles().length + 3} dosya`));
        break;
      }
      case 'CAT': case 'TYPE': case 'READ': case 'MORE': {
        if (!arg) { out.push('!' + pk('CAT what?', 'CAT ne?')); break; }
        let name = arg.toUpperCase();
        const all = { ...FILES }; const s = this.host.secrets();
        if (!all[name] && !LOCKED_FILES[name]) {
          const guess = Object.keys(all).concat(Object.keys(LOCKED_FILES)).find((f) => f.split('.')[0] === name);
          if (guess) name = guess;
        }
        if (all[name]) out.push(...pick(all[name]).split('\n'));
        else if (LOCKED_FILES[name]) {
          if (s[LOCKED_FILES[name].secret]) out.push(...pick(LOCKED_FILES[name].body).split('\n'));
          else out.push('!' + pk('ACCESS DENIED. This attempt has been filed.', 'ERİŞİM REDDEDİLDİ. Bu deneme dosyalandı.'));
        } else if (/\.EXE$/.test(name) || ['LOST_ACCOUNT', 'DEADFEED', 'PHISH'].includes(name)) out.push('!' + pk('That is a program. RUN it (type its name).', 'Bu bir program. Adını yazarak çalıştır.'));
        else out.push('!' + pk('FILE NOT FOUND: ', 'DOSYA BULUNAMADI: ') + name);
        break;
      }
      case 'LOGIN': case 'SU': {
        const parts = rest.map((x) => x.toLowerCase());
        const key = parts.join(' ');
        const hit = LOGINS[key];
        if (!parts.length) out.push('!' + pk('usage: LOGIN <user> <password>', 'kullanım: LOGIN <kullanıcı> <şifre>'));
        else if (hit) {
          this.user = parts[0];
          out.push(...pick(hit.text).split('\n'));
          this.unlock(hit.id, out);
        } else out.push('!' + pk('LOGIN FAILED. This attempt has been filed. (there is a PASSWD.HNT file, do not read it)', 'GİRİŞ BAŞARISIZ. Bu deneme dosyalandı. (PASSWD.HNT diye bir dosya var, okuma)'));
        break;
      }
      case 'HUNTER2': out.push('*******'); break;
      case 'ARCADE': case 'GAMES': {
        const g = arg.toUpperCase().replace(/\.EXE$/, '');
        if (g === 'PHISH' || g === 'FLAPPY' || g === '1') { out.push(pk('Loading FLAPPY PHISH...', 'FLAPPY PHISH yükleniyor...')); this.host.launch('phish'); }
        else if (g === 'DEADFEED' || g === 'DEAD' || g === '2') { out.push(pk('Loading DEAD FEED...', 'DEAD FEED yükleniyor...')); this.host.launch('deadfeed'); }
        else {
          out.push(pk('ARCADE', 'ATARİ'), '  1  PHISH       FLAPPY PHISH', '  2  DEADFEED    DEAD FEED  (WASD + arrows / mouse)', '',
            pk(`  best: PHISH ${this.host.score('phish')}  DEAD FEED ${this.host.score('deadfeed')}`, `  en iyi: PHISH ${this.host.score('phish')}  DEAD FEED ${this.host.score('deadfeed')}`), pk('  type: ARCADE PHISH  or  ARCADE DEADFEED', '  yaz: ARCADE PHISH  veya  ARCADE DEADFEED'));
        }
        break;
      }
      case 'PHISH': case 'PHISH.EXE': out.push(pk('Loading FLAPPY PHISH...', 'FLAPPY PHISH yükleniyor...')); this.host.launch('phish'); break;
      case 'DEADFEED': case 'DEADFEED.EXE': out.push(pk('Loading DEAD FEED...', 'DEAD FEED yükleniyor...')); this.host.launch('deadfeed'); break;
      case 'LOST_ACCOUNT': case 'LOST_ACCOUNT.EXE': case 'ZORK': case 'RUN': case 'ADVENTURE': {
        if (cmd === 'RUN' && !/lost_account/i.test(arg)) { out.push('!' + pk('RUN what?', 'RUN ne?')); break; }
        this.adv = new Adventure();
        out.push(...this.adv.intro());
        break;
      }
      case 'APPEAL': {
        if (!arg) out.push('!' + pk('usage: APPEAL <code>   (the code is the minute the internet died)', 'kullanım: APPEAL <kod>   (kod internetin öldüğü dakika)'));
        else if (arg.replace(/[^0-9]/g, '') === '0314') {
          out.push(pk('APPEAL RECEIVED...', 'İTİRAZ ALINDI...'), pk('UNDER REVIEW...', 'İNCELENİYOR...'), pk('APPROVED. (Nobody reads these. That is the loophole.)', 'ONAYLANDI. (Kimse bunları okumaz. Açık bu.)'));
          this.unlock('approved', out);
        } else out.push('!' + pk('APPEAL DENIED: invalid code. Hint: the minute the internet died.', 'İTİRAZ REDDEDİLDİ: geçersiz kod. İpucu: internetin öldüğü dakika.'));
        break;
      }
      case 'SECRETS': {
        const s = this.host.secrets();
        const ids = Object.keys(SECRET_INFO);
        const got = ids.filter((i) => s[i]);
        out.push(pk(`SECRETS  ${got.length}/${ids.length}`, `SIRLAR  ${got.length}/${ids.length}`), '');
        for (const i of ids) out.push('  ' + (s[i] ? '[' + SECRET_INFO[i].glyph + '] ' + pick(SECRET_INFO[i].name) : '[ ] ???'));
        out.push('', pk('The cell hides more than it shows. Walk around. Read things. Touch the piano.', 'Hücre gösterdiğinden fazlasını saklıyor. Dolaş. Bir şeyler oku. Piyanoya dokun.'));
        break;
      }
      case 'WHOAMI': out.push(`${this.user}@cell07  (${this.host.name()})`, pk('status: flagged / retained / measured', 'durum: işaretli / elde tutulan / ölçülen')); break;
      case 'DATE': case 'TIME': out.push(pk('03:14 UTC. It is always 03:14 UTC.', '03:14 UTC. Saat hep 03:14 UTC.')); break;
      case 'VER': out.push('TFG OS v4.1 (build 0314)'); break;
      case 'ECHO': out.push(arg); break;
      case 'PING': out.push(pk('reply from ALGORITHM: HUNGRY', 'ALGORITHM yanıtı: AÇ')); break;
      case 'SUDO': out.push('!' + pk('permission denied. This incident will be reported. (it already has)', 'izin reddedildi. Bu olay bildirilecek. (zaten bildirildi)')); break;
      case 'REBOOT': out.push(pk('Rebooting... no.', 'Yeniden başlatılıyor... hayır.')); break;
      case 'CLEAR': case 'CLS': out.push('\f'); break;
      case 'EXIT': case 'QUIT': case 'LOGOUT': case 'BYE': out.push(pk('Goodbye. We will still be watching.', 'Hoşça kal. Yine de izliyor olacağız.'), '\x03'); break;
      default: out.push('!' + pk(`'${cmdRaw}' is not a command. Type HELP.`, `'${cmdRaw}' bir komut değil. HELP yaz.`));
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ DOM shell
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export class TerminalUI {
  // host: { audio, profile, secrets(), unlock(id), name(), setScore(kind, n), score(kind), onClose() }
  constructor(host) {
    this.host = host;
    this.active = false;
    this.mg = null;
    this.history = []; this.hi = -1;
    this.engine = new TerminalEngine({
      secrets: () => host.secrets(), unlock: (id) => host.unlock(id), name: () => host.name(),
      launch: (k) => this.launch(k), close: () => this.close(), score: (k) => host.score(k),
    });
    this.root = el('div', 'cell-term hidden');
    const screen = el('div', 'cell-term-screen');
    this.out = el('div', 'cell-term-out');
    const line = el('div', 'cell-term-line');
    this.pr = el('span', 'cell-term-pr');
    this.inp = el('input', 'cell-term-in');
    this.inp.spellcheck = false; this.inp.autocomplete = 'off'; this.inp.autocapitalize = 'off';
    line.append(this.pr, this.inp);
    screen.append(this.out, line);
    this.foot = el('div', 'cell-term-foot', '');
    this.root.append(screen, this.foot, el('div', 'cell-term-scan'));
    document.body.appendChild(this.root);
    this.layer = el('div', 'cell-mg hidden');
    document.body.appendChild(this.layer);
    this.inp.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('pointerdown', () => { if (this.active && !this.mg) setTimeout(() => this.inp.focus(), 0); });
    this.started = false;
  }
  print(lines) {
    for (const ln of lines) {
      if (ln === '\f') { this.out.textContent = ''; continue; }
      if (ln === '\x03') { setTimeout(() => this.close(), 250); continue; }
      const d = el('div', 'cell-term-ln');
      if (ln.startsWith('!')) { d.classList.add('err'); d.textContent = ln.slice(1); }
      else if (ln.startsWith('***')) { d.classList.add('hot'); d.textContent = ln; }
      else d.textContent = ln === '' ? '\u00a0' : ln;
      this.out.appendChild(d);
    }
    while (this.out.childElementCount > 300) this.out.firstChild.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }
  open() {
    if (this.active) return;
    this.active = true;
    this.root.classList.remove('hidden');
    this.foot.textContent = pk('ESC to leave  ·  HELP for commands', 'ESC ile çık  ·  komutlar için HELP');
    if (!this.started) { this.started = true; this.print(this.engine.banner()); }
    this.pr.textContent = this.engine.prompt();
    this.inp.value = '';
    setTimeout(() => this.inp.focus(), 30);
    this.host.audio?.ui?.('terminal_enter', 0.5);
  }
  close() {
    if (!this.active) return;
    this.closeMg();
    this.active = false;
    this.root.classList.add('hidden');
    this.inp.blur();
    this.host.onClose?.();
  }
  onKey(e) {
    e.stopPropagation();
    if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      const v = this.inp.value; this.inp.value = '';
      if (v.trim()) { this.history.push(v); this.hi = this.history.length; }
      this.print([this.engine.prompt() + v]);
      this.host.audio?.ui?.('ui_click', 0.3);
      let res;
      try { res = this.engine.exec(v); } catch (err) { console.error(err); res = ['!' + String(err.message || err)]; }
      this.print(res);
      this.pr.textContent = this.engine.prompt();
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      this.hi = Math.max(0, Math.min(this.history.length, this.hi + (e.code === 'ArrowUp' ? -1 : 1)));
      this.inp.value = this.history[this.hi] || '';
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      const parts = this.inp.value.split(/\s+/); const last = (parts[parts.length - 1] || '').toUpperCase();
      if (last) { const m = this.engine.visibleFiles().concat(['LOST_ACCOUNT.EXE', 'DEADFEED.EXE', 'PHISH.EXE']).find((f) => f.startsWith(last)); if (m) { parts[parts.length - 1] = m; this.inp.value = parts.join(' '); } }
      return;
    }
    this.host.audio?.ui?.('ui_hover', 0.08);
  }
  // ---- arcade launcher
  launch(kind) {
    if (this.mg) return;
    const factory = kind === 'deadfeed' ? createDeadFeed : createArcade;
    this.root.classList.add('paused');
    this.layer.classList.remove('hidden');
    this.inp.blur();
    const sfx = (n) => { if (typeof n === 'string' && !n.startsWith('stop:') && !n.endsWith('_loop')) this.host.audio?.play?.(n, { volume: 0.6, bus: 'ui' }); };
    try {
      this.mgKind = kind;
      this.mg = factory({
        container: this.layer, rng: Math.random, sfx, difficulty: 0.3, highScore: this.host.score(kind),
        onDone: (res) => this.onMgDone(kind, res),
      });
    } catch (err) {
      console.error(err);
      this.closeMg();
      this.print(['!' + String(err.message || err)]);
    }
  }
  onMgDone(kind, res) {
    const lines = [];
    const score = Math.floor(res?.score || 0);
    if (!res?.cancelled) {
      const prev = this.host.score(kind);
      if (score > prev) this.host.setScore(kind, score);
      lines.push((kind === 'deadfeed' ? 'DEAD FEED' : 'FLAPPY PHISH') + ': ' + pk(`score ${score}  (best ${Math.max(prev, score)})`, `skor ${score}  (en iyi ${Math.max(prev, score)})`));
      if (kind === 'deadfeed' && (res.wave || 0) >= 5) { const o = []; this.engine.unlock('deadfeed', o); lines.push(...o); }
    } else lines.push(pk('(cancelled)', '(iptal)'));
    const mg = this.mg; this.mg = null;
    try { mg?.destroy(); } catch (e) { console.warn(e); }
    this.layer.classList.add('hidden'); this.layer.textContent = '';
    this.root.classList.remove('paused');
    this.print(lines);
    setTimeout(() => this.inp.focus(), 30);
  }
  closeMg() {
    if (this.mg) { try { this.mg.destroy(); } catch (e) { console.warn(e); } this.mg = null; }
    this.layer.classList.add('hidden'); this.layer.textContent = '';
    this.root.classList.remove('paused');
  }
  update(dt) {
    if (this.mg) this.mg.update(dt);
  }
  dispose() {
    this.closeMg();
    this.root.remove();
    this.layer.remove();
  }
}
