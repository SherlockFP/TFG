// BOSS DRESS core (wave 8 night, docs/wave8/bossdress.md) - pure data, no THREE / DOM. The eight themes that borrow another theme's boss
// (BOSS_TABLE aliases in cycle_core.js) each get a themed NAME + title + one-line intro, one accent colour (emissive lair dressing + the
// boss glow tint) and a lair prop recipe (built by game/bossdress.js). No new boss models, no new AI: id / hp / dmg / trophy stay the base boss's.
export const DRESS = {
  metro:      { name: 'The Last Conductor',        title: 'Final Call',                intro: 'All aboard. This train has no last stop.',              accent: 0xffb640, tint: 0x6a4a10, props: 'platform' },
  influencer: { name: 'The Concierge',             title: 'Your Stay Is Sponsored',    intro: 'Please enjoy your stay. Please do not leave a review.', accent: 0xff5ac8, tint: 0x66204a, props: 'lounge' },
  museum:     { name: 'The Curator',               title: 'Do Not Touch the Exhibits', intro: 'Every exhibit was once a visitor.',                     accent: 0xf0e6a0, tint: 0x5a5030, props: 'gallery' },
  greenhouse: { name: 'The Pruner',                title: 'Elective Trimming',         intro: 'Everything grows back. Eventually. Mostly you.',        accent: 0x6cff8a, tint: 0x1c5a2a, props: 'potting' },
  prison:     { name: 'The Warden',                title: 'Lockdown Protocol',         intro: 'Count off. The count is always one short.',             accent: 0xff5030, tint: 0x5a1a10, props: 'cells' },
  tower:      { name: 'The Chief Synergy Officer', title: 'Mandatory All-Hands',       intro: 'Circling back on your performance. Live.',              accent: 0x5ad0ff, tint: 0x1c4a6a, props: 'boardroom' },
  academy:    { name: 'The Principal',             title: 'Detention Is Permanent',    intro: 'Report to the office. There is no office.',             accent: 0xffd23a, tint: 0x5a4a10, props: 'classroom' },
  colddata:   { name: 'The Cold Balancer',         title: 'Cold Storage Routing',      intro: 'Your request is queued. Estimated wait: forever.',      accent: 0x8ae8ff, tint: 0x1a4a5a, props: 'coldrack' },
};
export const DRESS_THEMES = Object.freeze(Object.keys(DRESS));

/** themed copy of a base BOSS_TABLE entry (same id / hp / dmg / rank, new name + title + intro + accent) */
export function themedEntry(base, theme) {
  const d = DRESS[theme];
  return d ? { ...base, name: d.name, title: d.title, intro: d.intro, accent: d.accent, tint: d.tint, themed: true } : base;
}
/** the dress of a theme when its boss really is `type` (null otherwise: legacy bot, key holders, unknown themes) */
export function dressOf(theme, type, table) {
  const d = DRESS[theme], e = table?.[theme];
  return d && e && e.id === type ? { ...d, id: type } : null;
}
