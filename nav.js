// Game detail screen, arrow-key / controller navigation.
(() => {
  // ---------- Game detail ----------
  const det = document.createElement('section');
  det.id = 'detail'; det.hidden = true;
  document.body.appendChild(det);
  let detItem = null;

  window.openDetail = function openDetail(item) {
    if (detItem === item && !det.hidden) return; // clicked again while it's open: don't rebuild the whole screen
    detItem = item;
    const f = findItem(item.id);
    const a = avgRating(item), m = playMinutes(item);
    const art = item.hero || item.image;
    const meta = [item.platformLabel, m ? `⏱ ${fmtTime(m)}` : 'ما لعبتها للحين', a !== null ? `★ ${a.toFixed(1)}` : ''].filter(Boolean);
    det.innerHTML = `
      <div class="d-bg"${art ? ` style="background-image:url('${esc(toImageUrl(art))}')"` : ''}></div>
      <div class="d-shade"></div>
      <div class="d-top">
        <button class="btn ghost" data-act="back">→ رجوع</button>
        <div class="spacer"></div>
        <button class="btn ghost" data-act="rate" title="تقييم">★ تقييم</button>
        <button class="btn ghost" data-act="card" title="بطاقة تقييم تنزلها انستا أو إكس">📤 شارك التقييم</button>
        <button class="btn ghost" data-act="edit" title="إعدادات اللعبة">⚙</button>
      </div>
      <div class="d-body">
        ${coverHtml(item, 'd-cover')}
        <div class="d-info">
          <div class="d-page">${f ? pageIcon(f.page) : ''} ${esc(f?.page.name || '')}</div>
          <h1>${esc(item.name)}</h1>
          <div class="d-meta">${meta.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
          ${item.ratings && Object.keys(item.ratings).length ? `<div class="d-ratings">${Object.entries(item.ratings).map(([k, v]) => `
            <div class="d-rate"><span>${esc(k)}</span><i style="--v:${v * 10}%"></i><b>${v}</b></div>`).join('')}</div>` : ''}
          ${item.ratingNote ? `<p class="d-note">“${esc(item.ratingNote)}”</p>` : ''}
          <p class="d-about" id="dAbout"></p>
          <button class="btn primary d-play" data-act="play">${item.owned && !item.target ? '🛒 مو مثبتة: افتح صفحتها' : '▶ تشغيل'}</button>
          ${item.owned && !item.target ? '' : `<div class="d-mods" id="dMods" tabindex="0">
            <b>🧩 مودات وتعريب</b><span>اسحب هنا أي تعريب أو تكستشر باك أو مود (ملف أو مجلد أو zip)، وأحطه في مكانه الصح لحالي.</span>
            <div class="dm-acts"><button class="btn ghost sm" data-mod="file">📄 اختر ملف</button><button class="btn ghost sm" data-mod="dir">📁 اختر مجلد</button></div>
          </div>`}
          <div class="d-trophies" id="dTrophies"></div>
          <div class="d-shots" id="dShots"></div>
        </div>
      </div>`;
    wireImages(det);
    det.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'back') closeDetail();
        else if (act === 'play') { closeDetail(); launchItem(item); }
        else if (act === 'rate') openRater(item.id);
        else if (act === 'card') window.RateCard?.open(item);
        else if (act === 'edit') openEditor(item.id);
        else if (act === 'music') window.Music?.itemMenu({ preventDefault() {}, clientX: b.getBoundingClientRect().left, clientY: b.getBoundingClientRect().bottom + 6 }, item);
      };
    });
    // mods: drop or pick, then it's put where this game / emulator reads it
    const dm = det.querySelector('#dMods');
    if (dm) {
      const install = async (src) => {
        dm.classList.add('busy'); dm.querySelector('span').textContent = 'أحطه في مكانه…';
        const r = await pv.modsInstall({ rom: item.rom || '', console: item.console || item.platform || '', target: item.target || '', name: item.name }, src);
        dm.classList.remove('busy'); dm.classList.toggle('ok', !!r.ok); dm.classList.toggle('bad', !r.ok);
        dm.querySelector('span').textContent = (r.ok ? '✓ ' : '✗ ') + r.msg;
        toast((r.ok ? '🧩 ' : '') + r.msg);
      };
      dm.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); dm.classList.add('over'); };
      dm.ondragleave = () => dm.classList.remove('over');
      dm.ondrop = async (e) => { e.preventDefault(); e.stopPropagation(); dm.classList.remove('over'); for (const f of e.dataTransfer.files) { const p = pv.pathForFile(f); if (p) await install(p); } };
      dm.querySelectorAll('[data-mod]').forEach((b) => b.onclick = async (e) => { e.stopPropagation(); const p = b.dataset.mod === 'dir' ? await pv.pickDir() : await pv.pickFile(); if (p) install(p); });
    }
    det.hidden = false;
    window.Shots?.renderInto(item, det.querySelector('#dShots'));
    fillInfo(item);
    requestAnimationFrame(() => det.classList.add('show'));
    window.Music?.hoverItem(item);
    det.querySelector('.d-play').focus();
  };
  // What the game is about + your hardest trophies (kept for a day)
  async function fillInfo(item) {
    const fresh = item.info && Date.now() - (item.info.at || 0) < 86400000;
    const draw = (info) => {
      if (detItem !== item) return;
      const a = det.querySelector('#dAbout'), t = det.querySelector('#dTrophies');
      if (a) a.innerHTML = info.desc ? `${esc(info.desc)}${info.genres?.length ? `<span class="d-tags">${info.genres.map((g) => `<i>${esc(g)}</i>`).join('')}${info.dev ? `<i>${esc(info.dev)}${info.year ? ' · ' + esc(info.year) : ''}</i>` : ''}</span>` : ''}` : '';
      if (t) t.innerHTML = info.trophies?.length ? `<h3>🏆 أصعب إنجازاتك <small>${esc(info.trophyCount || '')}</small></h3><div class="tro-row">${info.trophies.map((x) => `
          <div class="tro" title="${esc(x.desc)}"><img src="${esc(x.icon)}" alt=""><b>${esc(x.name)}</b><small>${x.pct !== null ? `${x.pct.toFixed(1)}% من اللاعبين` : ''}</small></div>`).join('')}</div>`
        : info.trophyNote ? `<p class="hint">🏆 ${esc(info.trophyNote)}</p>` : '';
    };
    if (item.info) draw(item.info);
    if (fresh || !inElectron) return;
    const info = await pv.gameInfo({ target: item.target, name: item.name }).catch(() => null);
    if (!info) return;
    item.info = { ...info, at: Date.now() }; save();
    draw(item.info);
  }
  window.closeDetail = function closeDetail() {
    if (det.hidden) return;
    det.classList.remove('show');
    window.Music?.leaveItems();
    setTimeout(() => { det.hidden = true; det.innerHTML = ''; }, 220);
    const back = detItem && view.querySelector(`.tile[data-item="${detItem.id}"]`);
    detItem = null;
    back?.focus();
  };
  // Refresh the detail screen after rating / editing
  const refreshDetail = () => { if (!det.hidden && detItem) openDetail(detItem); };
  document.addEventListener('close', (e) => { if (e.target.tagName === 'DIALOG') setTimeout(refreshDetail, 50); }, true);

  // ---------- Spatial navigation ----------
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight + 400; };
  function candidates() {
    if (!det.hidden) return [...det.querySelectorAll('[data-act]')];
    if (!currentPageId) return [...view.querySelectorAll('#openFocused, .mini, .recent, .resume')].filter(visible);
    return [...view.querySelectorAll('.chip, .tile, .pod, .ranklist li, .cal-cell[data-day], .cd, [data-cal]')].filter(visible);
  }
  function move(dir) {
    const list = candidates();
    if (!list.length) return false;
    const cur = list.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { focusEl(list.find((x) => x.classList.contains('tile') || x.classList.contains('mini') || x.classList.contains('d-play')) || list[0]); return true; }
    const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      const ok = dir === 'right' ? dx > 8 : dir === 'left' ? dx < -8 : dir === 'down' ? dy > 8 : dy < -8;
      if (!ok) continue;
      const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = main + side * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { focusEl(best); return true; }
    return false;
  }
  function focusEl(el) {
    if (!el.hasAttribute('tabindex') && !/BUTTON|A|INPUT/.test(el.tagName)) el.setAttribute('tabindex', '0');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  // ---------- Actions shared by keyboard and controller ----------
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  const anyDialog = () => document.querySelector('dialog[open]');
  function act(a) {
    if (window.Series?.isOpen()) { if (a === 'back') Series.close(); return; }
    if (document.body.classList.contains('afk')) return; // first touch just wakes the screen
    if (window.Shots?.isOpen()) return Shots.navigate(a);
    if (anyDialog()) { if (a === 'back') anyDialog().close(); return; }
    if (!ctx.hidden) { if (a === 'back') hideCtx(); return; }
    if (document.body.classList.contains('drawer-open')) {
      if (a === 'back' || a === 'menu') return closeDrawer();
      const items = [...document.querySelectorAll('#drawerNav button')];
      const i = items.indexOf(document.activeElement);
      if (a === 'down' || a === 'up') return items[(i + (a === 'down' ? 1 : -1) + items.length) % items.length]?.focus();
      if (a === 'ok') return document.activeElement?.click();
      return;
    }
    if (!$('#webWrap').hidden) { if (a === 'back') closeWeb(); return; }
    const onHome = !currentPageId && det.hidden;
    const inStrip = onHome && !candidates().includes(document.activeElement);
    switch (a) {
      case 'left': case 'right':
        if (inStrip) setHomeFocus(homeFocus + (a === 'right' ? 1 : -1)); else move(a);
        break;
      case 'down':
        move('down');
        break;
      case 'up':
        if (onHome && !move('up')) { document.activeElement?.blur(); }
        else if (!onHome) move('up');
        break;
      case 'ok':
        if (inStrip) goPage(data.pages[homeFocus].id);
        else document.activeElement?.click();
        break;
      case 'back':
        if (!det.hidden) closeDetail();
        else if (currentPageId) goHome();
        break;
      case 'menu': openDrawer(); setTimeout(() => document.querySelector('#drawerNav button.on, #drawerNav button')?.focus(), 50); break;
      case 'voice': window.Voice?.start(); break;
      case 'prevTheme': case 'nextTheme': {
        const i = THEMES.findIndex((t) => t.id === data.theme);
        const t = THEMES[(i + (a === 'nextTheme' ? 1 : -1) + THEMES.length) % THEMES.length];
        setTheme(t.id); toast(`ثيم ${t.name}`); break;
      }
      case 'music': window.Music?.isPlaying() ? window.Music.pause() : window.Music?.play(); break;
      case 'home': closeDetail(); goHome(); break;
    }
  }
  window.navAct = act;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') { e.preventDefault(); pv.fullscreen(); return; }
    if (typing() && e.key !== 'Escape') return;
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Escape: 'back', Backspace: 'back', Enter: 'ok' };
    let a = map[e.key];
    if (!a && window.controls) {
      const k = controls().keys;
      a = Object.keys(k).find((x) => k[x] && k[x].toLowerCase() === e.key.toLowerCase());
      if (a && (e.ctrlKey || e.altKey || e.metaKey)) a = null;
    }
    if (!a) return;
    if (a === 'ok' && anyDialog()) return; // let forms submit normally
    if (a === 'back' && e.key === 'Backspace' && anyDialog()) return;
    e.preventDefault();
    act(a);
  });

  // ---------- Game controller (Xbox / PlayStation pads) ----------
  const DIRS = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const btnMap = () => {
    const m = { ...DIRS };
    const p = window.controls ? controls().pad : { ok: 0, back: 1, music: 2, voice: 3, prevTheme: 4, nextTheme: 5, menu: 9 };
    for (const [a, i] of Object.entries(p)) if (i !== null && i !== undefined && i !== '') m[i] = a;
    return m;
  };
  const held = {};
  let padSeen = false;
  function poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (pads.length && document.hasFocus()) {
      if (!padSeen) { padSeen = true; toast('🎮 اليد متصلة: الأسهم للتنقل، A تشغيل، B رجوع'); pv.log('gamepad: ' + pads[0].id); }
      const now = performance.now();
      const pressed = {};
      const BTN = btnMap();
      for (const pad of pads) {
        pad.buttons.forEach((b, i) => { if (b.pressed && BTN[i]) pressed[BTN[i]] = true; });
        const [lx, ly] = pad.axes;
        if (lx < -0.6) pressed.left = true; if (lx > 0.6) pressed.right = true;
        if (ly < -0.6) pressed.up = true; if (ly > 0.6) pressed.down = true;
      }
      for (const a of new Set([...Object.keys(pressed), ...Object.keys(held)])) {
        if (pressed[a]) {
          const h = held[a];
          const repeatable = ['left', 'right', 'up', 'down'].includes(a);
          if (!h) { held[a] = { t: now, last: now }; act(a); }
          else if (repeatable && now - h.t > 420 && now - h.last > 130) { h.last = now; act(a); }
        } else delete held[a];
      }
    }
    requestAnimationFrame(poll);
  }
  window.addEventListener('gamepadconnected', () => { padSeen = false; });
  // Mouse side buttons
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 3 && e.button !== 4) return;
    const m = window.controls ? controls().mouse : { side1: 'back', side2: 'ok' };
    const a = e.button === 3 ? m.side1 : m.side2;
    if (a) { e.preventDefault(); act(a); }
  });
  requestAnimationFrame(poll);
})();
