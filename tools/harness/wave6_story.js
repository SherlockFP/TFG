// Body for headless.mjs (wave 6 story): orbit state, patron tags, allegiance dock, shop gate, terminal text, finale overlay (screenshot).
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {};
const S = g.story, C = S.core;
kefal.tick(4, 1 / 30, false); await new Promise((r) => setTimeout(r, 50));
g.mods.emit('phase', 'orbit', g);
kefal.tick(4, 1 / 30, false);
out.state = { act: g.run.st?.act, a: g.run.st?.a, offers: g.run.st?.offers?.length, trend: g.run.st?.trend?.type, beats: Object.keys(g.run.st?.beats || {}) };
out.tags = (g.run.contracts?.offers || []).map((o) => o.faction + ':' + o.patron);
// push the crew to +60 Algorithm: unlocks, shop gate, creature rule
const m = C.moveState(g.run.st, 60); g.broadcastRun(['st']);
out.a = g.run.st.a; out.opened = m.opened.map((u) => u.id);
out.rep = g.lore?.factionRep?.('Algorithm favour');
out.rule = ['scuttler', 'moderator', 'hound'].map((t) => t + ':' + C.creatureRule(S.effA(), t, 1));
kefal.tick(4, 1 / 30, false);
await new Promise((r) => setTimeout(r, 700)); kefal.tick(4, 1 / 30, false);
out.dock = document.querySelector('.st-dock')?.innerText?.replace(/\n+/g, ' | ') || null;
const cmd = (n) => { const o = []; g.mods.commands.get(n)?.([], { print: (x) => o.push(String(x)), close() {} }); return o.join('\n'); };
out.patron = cmd('patron').split('\n').slice(0, 8).join(' / ');
out.jobs = cmd('jobs').split('\n').slice(0, 5).join(' / ');
out.trend = cmd('trend').split('\n')[0];
// finale overlay (client side only)
for (let i = -1; i < 3; i++) { g.net.broadcast('stx', { k: 'fin', id: 'algorithm', i }); kefal.tick(1, 1 / 30, false); }
out.overlay = document.querySelector('.st-fin')?.innerText?.replace(/\n+/g, ' | ') || null;
out.errs = errs;
return out;
