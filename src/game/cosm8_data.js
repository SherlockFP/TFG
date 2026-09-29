// cosm8 (wave 8, "lcmods") - +31 cosmetics through the cosm5 pipeline: DATA only (Node-safe, no three.js).
// cosm5_data.js appends these rows to C5, so the shop rotation, crates, wardrobe tabs, sync codes and the tests pick them up.
//   8 suits, 8 hats, 6 back items, 4 weapon skins, 5 emotes. Appearance only, never stats.
// Secret / mod unlocks (rules in cosm5.js RULES): reaper (8 quotas), trendcrown (level 30), chosen (Algorithm Quotes You: quoted 8x),
// voidstar (Loot Appraiser: 40 appraisals), mosh (Office Party: 5 payouts). The mods call game.cosm5.bump(flag).
const row = (slot) => (id, name, tier, src, desc, extra = {}) => ({ slot, id, name, tier, src, desc, how: '', ...extra });
const S = row('suit'), H = row('hat'), B = row('back'), K = row('skin'), E = row('emote');

export const C8 = [
  // ------------------------------------------------------------ suits (8)
  S('mailroom', 'Mailroom Courier', 'common', 'shop', 'Navy uniform, hi-vis vest and a satchel of things nobody asked for. Signature required.', { price: 130, minLevel: 2 }),
  S('hrofficer', 'HR Compliance Officer', 'uncommon', 'shop', 'Grey blazer, red tie, a lanyard and a folder with your name on it. This will only take a minute.', { price: 280, minLevel: 4 }),
  S('lostfound', 'Lost & Found Box', 'uncommon', 'crate', 'A cardboard box with arms. Label reads: UNCLAIMED. Nobody is looking for you.'),
  S('streamer', 'Streamer Rig', 'rare', 'shop', 'Dark hoodie, RGB strips, a headset with a blinking LIVE light. The Algorithm loves this look.', { price: 560, minLevel: 9 }),
  S('redtape', 'Red Tape Mummy', 'rare', 'crate', 'Wrapped head to toe in bureaucracy. You will never get out of this one.'),
  S('quotasuit', 'Quota Suit', 'epic', 'shop', 'Green pinstripe with a live progress bar on the chest. It is never full enough.', { price: 1150, minLevel: 13 }),
  S('reaper', 'Deadline Reaper', 'epic', 'secret', 'Black hooded cloak, an hourglass on the belt, two red points where the eyes should be. Due yesterday.', { how: 'Meet the quota 8 times' }),
  S('chosen', "The Algorithm's Chosen", 'legendary', 'secret', 'White robes trimmed in glitch light, a halo that spins the wrong way. You were selected. Nobody asked you.', { how: 'Mod unlock: get quoted 8 times with The Algorithm Quotes You' }),
  // ------------------------------------------------------------ hats / head items (8)
  H('headset', 'Support Headset', 'common', 'shop', 'Your call is important to us. Please hold. Forever.', { price: 80 }),
  H('trafficcone', 'Traffic Cone', 'common', 'shop', 'Orange, reflective and universally ignored. Guides nobody anywhere.', { price: 60 }),
  H('antenna', 'Signal Antenna', 'uncommon', 'shop', 'One bar. It blinks when the Algorithm is thinking about you.', { price: 170 }),
  H('nightcap', 'Overtime Nightcap', 'uncommon', 'crate', 'For those who clocked out mentally around 3 PM. Zzz.'),
  H('livesign', 'LIVE Sign', 'rare', 'shop', 'A little ON AIR sign above your head. Everything you do is content.', { price: 400 }),
  H('spotlight', 'Overhead Spotlight', 'rare', 'crate', 'A follow-spot that is always on you. The stage is a lonely place.'),
  H('watcheye', 'Watching Eye', 'epic', 'crate', 'A floating eyeball that follows nothing in particular. It sees everything you do.'),
  H('trendcrown', 'Trending Crown', 'legendary', 'secret', 'Golden spikes tipped with arrows that all point up. For a limited time only.', { how: 'Reach level 30', minLevel: 30 }),
  // ------------------------------------------------------------ back items (6)
  B('lootsack', 'Loot Sack', 'uncommon', 'shop', 'Burlap, a rope and a few coins that keep peeking out. The Company takes 90%.', { price: 220 }),
  B('fieldradio', 'Field Radio', 'uncommon', 'shop', 'Olive-drab set with a swaying antenna and a light that promises signal.', { price: 260 }),
  B('camarm', 'Streaming Camera Arm', 'rare', 'crate', 'A little camera on a boom, always pointed at you. The REC light is not for decoration.'),
  B('battpack', 'Battery Backpack', 'rare', 'shop', 'Six cells, hazard stripes, a low hum. Charge level: mostly your problem.', { price: 520, minLevel: 8 }),
  B('parachute', 'Emergency Parachute', 'epic', 'shop', 'Orange pack with a red pull-ring. Company policy: it is for decoration only.', { price: 980, minLevel: 12 }),
  B('holoscreen', 'Holo Ad Panel', 'epic', 'crate', 'A floating billboard on your back. It has sold you out already.'),
  // ------------------------------------------------------------ weapon skins (4)
  K('hazard', 'Hazard Stripes', 'uncommon', 'shop', 'Yellow and black warning stripes. Everybody knows to stay away.', { price: 280 }),
  K('static', 'Dead Channel', 'rare', 'crate', 'TV static crawling over the metal. It is tuned to a station that does not exist.'),
  K('neongrid', 'Neon Grid', 'epic', 'shop', 'A magenta-and-cyan wireframe horizon wrapped around the barrel.', { price: 950, minLevel: 12 }),
  K('voidstar', 'Void Starfield', 'legendary', 'secret', 'Black as the space between moons, with a slow drift of stars. Do not stare.', { how: 'Mod unlock: appraise loot 40 times with Loot Appraiser' }),
  // ------------------------------------------------------------ emotes (5)
  E('standup', 'Daily Stand-Up', 'common', 'shop', 'Hands on hips, weight on one leg, nothing to report. Fifteen minutes, they said.', { price: 110, icon: '◧', dur: 3.6 }),
  E('shuffle', 'Spreadsheet Shuffle', 'uncommon', 'crate', 'Type on an invisible keyboard while your hips do the actual work. Pivot tables optional.', { icon: '▤', dur: 4.5 }),
  E('scroll', 'Feed Scroll', 'rare', 'shop', 'One thumb, endless flicks, a slack jaw. Dance of the chronically online.', { price: 380, icon: '⇅', dur: 5 }),
  E('shimmy', 'Pink Slip Shimmy', 'rare', 'crate', 'Wave the slip, shake the shoulders, let it drop. Nobody dances alone. Nobody stays employed.', { icon: '✂', dur: 4 }),
  E('mosh', 'Server Room Rave', 'epic', 'secret', 'Headbang, fist pump, repeat, in the cold blue light of a rack that never sleeps.', { how: 'Mod unlock: earn 5 Office Party payouts', icon: '▲', dur: 5 }),
];
