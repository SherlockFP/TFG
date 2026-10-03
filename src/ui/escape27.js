// One Escape gesture belongs to the foremost UI. Native minigame/popup capture
// handlers still own cancellation and pending results; pause is the final fallback.
export function hasEscapeLayer27(app) {
  const ui = app.ui, g = app.game;
  return !!(ui.dialogEl || ui.cancelRebind || ui.panelOpen || ui.chatOpen ||
    g?.minigame || g?.facjobs?.codeOpen || g?.routeboard?.visible?.() ||
    g?.terminal?.active || g?.magic?.wheelOpen ||
    g?.emotes?.wheelOpen || g?.homeworld2?.building || g?.homeworld?.building);
}

function consume(app, e) {
  e.preventDefault(); e.stopImmediatePropagation();
  app.input.down.delete('Escape'); app.input.pressedSet.delete('Escape');
}

export function installEscape27(app, target = window) {
  const capture = (e) => {
    if ((e.code !== 'Escape' && e.key !== 'Escape') || e.isComposing || e.defaultPrevented) return;
    const ui = app.ui, g = app.game;
    if (e.repeat) { if (g || hasEscapeLayer27(app)) consume(app, e); return; }
    if (ui.dialogEl) { consume(app, e); ui.dialogResolve?.(null); return; }
    if (ui.cancelRebind) { consume(app, e); ui.cancelRebind(); return; }
    if (ui.chatOpen) { consume(app, e); ui.closeChat(); return; }
    if (ui.panelOpen) {
      consume(app, e);
      ui.closePanel();
      return;
    }
    if (!g) {
      if (ui.currentScreen && ui.currentScreen !== 'title') {
        const back = ui.backOf(ui.menuEl);
        if (back) { consume(app, e); back.click(); }
      }
      return;
    }
    if (g.facjobs?.codeOpen) { consume(app, e); g.facjobs.closeCode(); return; }
    // Leave native minigame Escape to its own capture handler. In particular,
    // finished gambling results must flush normally instead of being discarded.
    if (g.minigame) return;
    if (g.terminal?.moonMenu?.visible?.()) { consume(app, e); g.terminal.moonMenu.hide(); return; }
    if (g.routeboard?.visible?.()) { consume(app, e); g.routeboard.hide(); return; }
    if (g.terminal?.active) { consume(app, e); g.terminal.close(); return; }
    if (g.magic?.wheelOpen) { consume(app, e); g.magic.closeWheel(false); return; }
    if (g.emotes?.wheelOpen) {
      consume(app, e);
      const em = g.emotes;
      em.wheelOpen = false;
      if (em.wheelUI) em.wheelUI.close(); else em.wheel?.classList.add('hidden');
      // A held B must not immediately reopen or play the cancelled selection.
      const held = app.input.key('emoteWheel');
      app.input.down.delete(held); app.input.pressedSet.delete(held);
      return;
    }
    const build = g.homeworld2?.building ? g.homeworld2 : g.homeworld?.building ? g.homeworld : null;
    if (build) { consume(app, e); build.stop(); }
  };
  const fallback = (e) => {
    if ((e.code !== 'Escape' && e.key !== 'Escape') || e.defaultPrevented || e.repeat || e.isComposing) return;
    if (!app.game || app.input.isTyping() || hasEscapeLayer27(app) || app.ui.fullscreenOpen?.()) return;
    consume(app, e); app.ui.openPause();
  };
  target.addEventListener('keydown', capture, true);
  target.addEventListener('keydown', fallback);
  return () => { target.removeEventListener('keydown', capture, true); target.removeEventListener('keydown', fallback); };
}
