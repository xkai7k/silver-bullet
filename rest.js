// Rest ("سكون"): while you play a game (or watch something full screen in here) the app goes quiet:
// animations stop, the background stops drawing, memory is handed back. Spotify keeps working.
// It wakes by itself when the game closes; or hold Esc for 3 seconds to wake it by hand.
(() => {
  let mode = ''; let freeT = null;
  window.SB_PAUSED = () => mode;
  function apply(next, why) {
    if (next === mode) return;
    const was = mode; mode = next;
    document.body.classList.toggle('sb-rest', !!next);
    document.body.classList.toggle('sb-rest-watch', next === 'watch');
    clearTimeout(freeT);
    if (next) {
      pv.log?.(`rest ${next}${why ? ' (' + why + ')' : ''}`);
      // after a moment (the game is loading), give memory back: picture caches
      freeT = setTimeout(() => { if (!mode) return; pv.freeMemory?.(); }, 4000);
    } else if (was) {
      // waking up: draw the page again calmly (one frame at a time, not everything at once)
      const redraw = () => { try { if (typeof renderPage === 'function' && currentPageId) renderPage(); } catch {} };
      (window.requestIdleCallback || setTimeout)(redraw, { timeout: 800 });
    }
  }
  pv.onRest?.((m, why) => { if (m) apply(m, why); else if (mode === 'game' || mode === 'deep') apply('', why); });
  window.Rest = { set: apply, get: () => mode };
  // watching full screen inside the app: the rest of the app rests
  new MutationObserver(() => {
    const full = document.body.classList.contains('wv-full');
    if (full && !mode) apply('watch', 'full-screen video');
    else if (!full && mode === 'watch') apply('', 'video done');
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // hold Esc 3 seconds: wake up now (if a game was closed and the app didn't notice)
  let escT = null;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat || escT) return;
    escT = setTimeout(() => { escT = null; if (mode) { apply('', 'esc'); pv.restWake?.(); toast?.('⚡ رجع البرنامج'); } }, 3000);
  }, true);
  window.addEventListener('keyup', (e) => { if (e.key === 'Escape') { clearTimeout(escT); escT = null; } }, true);
})();
