// Settings > Audio > "Sound pack" panel (module `sfx`, docs/wave4/sfx.md). One call from ui.js: body.append(...soundPackSection(this, audio, section)).
// Pick a folder / zip / loose audio files (or paste a pack URL); the files are mapped to sound keys by filename (creature_<type>_<event>.ogg,
// voice_<n>.ogg, ui_<name>.ogg ...), stored in this browser's IndexedDB and never uploaded. Only the local player hears them.
import { el } from '../core/util.js';
import { t, tf } from '../core/i18n.js';
import { HELP } from './sfx_pack_i18n.js';

const REASONS = {
  'not-audio': 'not an audio file', 'unknown-prefix': 'name does not start with creature_ / voice_ / ui_ / sfx_ / step_ / amb_', 'unknown-event': 'unknown creature event',
  'creature-needs-type-and-event': 'needs creature_<type>_<event>', 'name-missing': 'name missing', 'amb-needs-name': 'needs amb_<name>', 'file-too-big': 'file over 8 MB',
  'pack-too-big': 'pack too big', 'download-failed': 'download failed', 'not-a-zip': 'not a zip file', 'zip64-unsupported': 'zip64 is not supported', 'deflate-unsupported': 'this browser cannot unzip',
};
const why = (r) => t(REASONS[r] || r);

export function soundPackSection(ui, audio, section) {
  const wrap = el('div', { class: 'sxpack' });
  const pk = () => audio?.pack || null;

  const render = () => {
    wrap.textContent = '';
    const p = pk();
    if (!p) { wrap.append(el('div', { class: 'dim' }, t('The sound pack loads once the audio engine has started (press any key or click, then reopen Settings).'))); return; }
    const s = p.summary();
    const line = p.count
      ? tf('{n} custom sounds loaded ({c} creature, {v} voice lines, {o} replaced game sounds, {a} ambience).', { n: s.total, c: s.creature, v: s.voice, o: s.override, a: s.amb })
      : t('No sound pack loaded. The game uses its built-in synthesized sounds.');
    const status = el('div', { class: 'form-row' }, el('label', {}, t('Status'), el('span', { class: 'row-note' }, line)),
      el('span', { class: 'dim' }, p.busy ? t('loading...') : p.count ? (p.persistent ? t('saved on this device') : t('not saved (browser storage blocked)')) : ''));
    const on = el('input', { type: 'checkbox', checked: p.enabled });
    on.addEventListener('change', () => { p.setEnabled(on.checked); });
    const fileIn = el('input', { type: 'file', multiple: '', accept: 'audio/*,.ogg,.mp3,.wav,.m4a,.flac,.opus,.zip', style: { display: 'none' } });
    const dirIn = el('input', { type: 'file', webkitdirectory: '', multiple: '', style: { display: 'none' } });
    const pick = async (inp) => {
      if (!inp.files?.length) return;
      try { const r = await p.importFiles(inp.files); ui.toast(tf('Sound pack: {n} files added, {m} ignored.', { n: r.added, m: r.ignored.length })); } catch (e) { ui.toast(t('Could not read that pack.'), 'bad'); }
      inp.value = '';
    };
    fileIn.addEventListener('change', () => pick(fileIn));
    dirIn.addEventListener('change', () => pick(dirIn));
    const url = el('input', { type: 'text', placeholder: 'https://.../mypack.zip', value: p.url || '', spellcheck: 'false', style: { width: '260px' } });
    const btns = el('div', { class: 'slider' },
      ui.button(t('Add files'), () => fileIn.click(), 'small'), ui.button(t('Add folder'), () => dirIn.click(), 'small'),
      ui.button(t('Preview'), () => preview(p), 'small'), ui.button(t('Remove pack'), async () => { await p.clear(); ui.toast(t('Sound pack removed.')); }, 'small'));
    const urlRow = el('div', { class: 'slider' }, url, ui.button(t('Load URL'), async () => {
      const u = url.value.trim(); if (!u) return;
      try { const r = await p.importUrl(u); ui.toast(tf('Sound pack: {n} files added, {m} ignored.', { n: r.added, m: r.ignored.length })); } catch (e) { ui.toast(t('Could not download that pack (it must be https and allow CORS).'), 'bad'); }
    }, 'small'));
    wrap.append(status,
      el('div', { class: 'form-row' }, el('label', {}, t('Use sound pack')), on),
      el('div', { class: 'form-row' }, el('label', {}, t('Files')), btns, fileIn, dirIn),
      el('div', { class: 'form-row' }, el('label', {}, t('From URL'), el('span', { class: 'row-note' }, t('.zip or manifest .json; the site must allow CORS. Your responsibility.'))), urlRow));
    if (p.ignored.length) {
      wrap.append(el('div', { class: 'dim note' }, tf('Ignored ({n}): ', { n: p.ignored.length }) + p.ignored.slice(0, 6).map((i) => `${i.file} (${why(i.reason)})`).join(', ') + (p.ignored.length > 6 ? ' ...' : '')));
    }
    wrap.append(el('div', { class: 'dim note' }, t(HELP)));
  };
  function preview(p) {
    const keys = [...p.pools.keys()];
    if (!keys.length) { ui.toast(t('The pack has no playable sounds yet.'), 'bad'); return; }
    const key = keys.filter((k) => !k.startsWith('amb_'))[Math.floor(Math.random() * Math.max(1, keys.filter((k) => !k.startsWith('amb_')).length))] || keys[0];
    const name = p.pick(key);
    audio.resume?.();
    if (name) audio.play(name, { volume: 0.9, bus: 'ui' });
    else ui.toast(t('The pack is switched off.'));
  }
  render();
  // re-render on pack changes until this panel leaves the page
  const off = pk()?.onChange(() => { if (!wrap.isConnected) { off?.(); return; } render(); });
  return [section(t('Sound pack')), wrap];
}
