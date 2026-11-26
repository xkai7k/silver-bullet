// Silver Bullet extras: welcome screen, pinned shortcuts, moods, ratings & tier list,
// idle screensaver, brightness and your own background.
(() => {
  window.SB_WELCOME_PENDING = true; // background tunes wait for the welcome screen
  const SB = (window.SB = {});

  // ---------- Welcome ----------
  const wel = document.createElement('div');
  wel.id = 'welcome';
  wel.innerHTML = `
    <div class="wl-bg"><i class="wl-glow"></i><i class="wl-dust"></i></div>
    <div class="wl-inner">
      <svg class="wl-mark" viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="wlSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c9d0db"/><stop offset="1" stop-color="#6f7888"/></linearGradient></defs>
        <circle class="wl-ring" cx="60" cy="60" r="54"/>
        <circle class="wl-ring2" cx="60" cy="60" r="46"/>
        <g class="wl-shell"><path d="M60 22 C70 32 72 44 72 54 L72 86 L48 86 L48 54 C48 44 50 32 60 22 Z" fill="url(#wlSilver)"/><rect x="46" y="86" width="28" height="10" rx="2" fill="#9aa3b2"/><path d="M48 58 H72" stroke="rgba(0,0,0,.25)" stroke-width="2"/></g>
      </svg>
      <div class="wl-name"><span>SILVER BULLET</span></div>
      <div class="wl-line"></div>
      <div class="wl-hello">&nbsp;</div>
      <div class="wl-ask" hidden>
        <p>وش تحب أناديك؟</p>
        <form class="wl-form"><input maxlength="24" placeholder="اكتب اسمك" autocomplete="off"><button class="btn primary">يلا ←</button></form>
      </div>
    </div>`;
  document.body.appendChild(wel);
  const shownAt = performance.now();
  let entered = false;
  function enter() {
    if (entered) return; entered = true;
    wel.classList.add('out');
    window.SB_WELCOME_PENDING = false;
    setTimeout(() => wel.remove(), 900);
    if (data.music?.on !== false && !(typeof spState !== 'undefined' && spState.playing)) window.Music?.play();
    document.removeEventListener('keydown', anyKey, true);
    window.removeEventListener('gamepadconnected', anyKey);
    clearInterval(padWatch);
  }
  const anyKey = (e) => { if (!wel.querySelector('.wl-ask:not([hidden])')) { e?.preventDefault?.(); e?.stopPropagation?.(); enter(); } };
  let padWatch = 0;
  function readyToEnter() {
    const name = data?.user?.name;
    if (!name) {
      wel.querySelector('.wl-ask').hidden = false;
      const inp = wel.querySelector('.wl-form input'); setTimeout(() => inp.focus(), 50);
      wel.querySelector('.wl-form').onsubmit = (e) => {
        e.preventDefault();
        const v = inp.value.trim(); if (!v) { inp.focus(); return; }
        data.user = { ...(data.user || {}), name: v }; save();
        wel.querySelector('.wl-ask').hidden = true;
        const h = wel.querySelector('.wl-hello'); h.textContent = (data.settings?.lang === 'en' ? 'Hi ' : 'أهلاً ') + v + ' 👋'; h.classList.add('in');
        if (!currentPageId) $('#title').textContent = greeting();
        setTimeout(enter, 1300);
      };
    } else {
      const h = wel.querySelector('.wl-hello');
      h.textContent = (data.settings?.lang === 'en' ? 'Hi ' : 'أهلاً ') + name; h.classList.add('in');
      setTimeout(enter, Math.max(1500, 3000 - (performance.now() - shownAt))); // the whole intro plays, then straight in
    }
  }
  // Wait until the library is loaded and the home screen drew behind the curtain
  const waitData = setInterval(() => { if (typeof data !== 'undefined' && data && document.querySelector('#view > *')) { clearInterval(waitData); setTimeout(readyToEnter, 300); } }, 100);
  if (!window.api) setTimeout(enter, 300);

  // ---------- Pinned: three quick slots at the top ----------
  const pinsEl = document.getElementById('pins');
  SB.drawPins = () => {
    data.pins ||= [null, null, null];
    pinsEl.innerHTML = data.pins.map((id, n) => {
      const it = id && findItem(id)?.item;
      return it ? `<button class="pin" data-n="${n}" title="${esc(it.name)}">${it.image ? `<img src="${esc(toImageUrl(it.image))}" alt="">` : it.icon ? `<img class="ico" src="${esc(it.icon)}" alt="">` : `<span>${esc(it.name[0])}</span>`}</button>`
        : `<button class="pin empty" data-n="${n}" title="اسحب لعبة أو برنامج هنا">＋</button>`;
    }).join('');
    pinsEl.querySelectorAll('.pin').forEach((b) => {
      const n = Number(b.dataset.n), it = data.pins[n] && findItem(data.pins[n])?.item;
      b.onclick = () => (it ? launchItem(it) : toast('اسحب أي لعبة أو برنامج وأفلته هنا، أو كليك يمين عليه ← ثبّت فوق'));
      b.oncontextmenu = (e) => it && showCtx(e, [{ label: 'فتح', run: () => launchItem(it) }, { label: 'شيله من المثبتة', run: () => { data.pins[n] = null; save(); SB.drawPins(); } }]);
      b.ondragover = (e) => { if ([...e.dataTransfer.types].includes('text/sb-item')) { e.preventDefault(); b.classList.add('over'); } };
      b.ondragleave = () => b.classList.remove('over');
      b.ondrop = (e) => { e.preventDefault(); b.classList.remove('over'); const id = e.dataTransfer.getData('text/sb-item'); if (id) SB.pin(id, n); };
    });
  };
  SB.pin = (id, slot) => {
    data.pins ||= [null, null, null];
    const at = data.pins.indexOf(id); if (at >= 0) data.pins[at] = null;
    if (slot === undefined) { slot = data.pins.indexOf(null); if (slot < 0) slot = 0; }
    data.pins[slot] = id; save(); SB.drawPins();
    toast(`📌 ثبّتّه فوق`);
  };
  document.addEventListener('dragstart', (e) => {
    const t = e.target.closest?.('[data-item]'); if (!t) return;
    e.dataTransfer.setData('text/sb-item', t.dataset.item);
    e.dataTransfer.effectAllowed = 'copyMove';
    document.body.classList.add('dragging-item');
  });
  document.addEventListener('dragend', () => document.body.classList.remove('dragging-item'));

  // ---------- Moods ----------
  const DEFAULT_MOODS = () => []; // you make your own moods with the + button
  SB.moodView = null;
  SB.drawMoods = () => {
    data.moods ||= DEFAULT_MOODS();
    if (!data.moodsV2) { // the three starter moods go, unless you already put things in them
      data.moods = data.moods.filter((m) => !['chill', 'breakfast', 'hype'].includes(m.id) || (m.items || []).length);
      if (!data.moods.some((m) => m.id === data.activeMood)) data.activeMood = null;
      data.moodsV2 = true; save();
    }
    const bar = document.getElementById('moodBar');
    bar.innerHTML = (data.moods.length ? `<span class="mood-lbl">مودك؟</span>` : '') + data.moods.map((m) => `<button class="mood ${data.activeMood === m.id ? 'on' : ''}" data-m="${m.id}" title="${esc(m.name)}">${esc(m.emoji || '✨')} <span>${esc(m.name)}</span></button>`).join('')
      + `<button class="mood mood-add" id="moodPlus" title="أضف مود">＋${data.moods.length ? '' : ' <span>أضف مود</span>'}</button>`;
    bar.querySelector('#moodPlus').onclick = () => { data.moods.push({ id: uid(), name: 'مود جديد', emoji: '✨', theme: data.theme, items: [] }); save(); SB.drawMoods(); openSettings('moods'); };
    bar.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => SB.openMood(b.dataset.m);
      b.oncontextmenu = (e) => showCtx(e, [{ label: 'تعديل المودات…', run: () => openSettings('moods') }, ...(data.activeMood === b.dataset.m ? [{ label: 'اطلع من المود', run: () => { data.activeMood = null; save(); SB.moodView = null; goHome(); } }] : [])]);
    });
  };
  SB.openMood = (id) => {
    const m = data.moods.find((x) => x.id === id); if (!m) return;
    data.activeMood = id; save();
    if (m.theme && m.theme !== data.theme) setTheme(m.theme);
    if (m.music) { data.music.themeMoods ||= {}; }
    closeWebIfOpen(); window.closeDetail?.();
    currentPageId = null; SB.moodView = id;
    render();
  };
  SB.renderMood = () => {
    const m = data.moods.find((x) => x.id === SB.moodView);
    if (!m) { SB.moodView = null; return false; }
    const items = m.items.map((id) => findItem(id)?.item).filter(Boolean);
    $('#backBtn').hidden = false;
    $('#title').innerHTML = `<span>${esc(m.emoji || '✨')} مود ${esc(m.name)}</span>`;
    $('#subtitle').textContent = items.length ? `${items.length} اخترتها لهالمود` : 'ما اخترت أشياء لهالمود للحين';
    view.innerHTML = `
      <div class="mood-head"><button class="btn ghost" id="moodEdit">✎ اختر أشياء المود</button><button class="btn ghost" id="moodExit">اطلع من المود</button></div>
      ${items.length ? `<div class="tiles square">${items.map((i) => tileHtml(i)).join('')}</div>` : '<div class="empty">اضغط "اختر أشياء المود" وحط الألعاب والبرامج اللي تناسب هالمزاج.</div>'}`;
    wireImages(view);
    view.querySelectorAll('[data-item]').forEach((el) => {
      const it = findItem(el.dataset.item)?.item; if (!it) return;
      el.onclick = () => (isGameItem(it) && window.openDetail ? openDetail(it) : launchItem(it));
      el.onmouseenter = () => setBackground(it.hero || it.image ? toImageUrl(it.hero || it.image) : '');
    });
    $('#moodEdit').onclick = () => openSettings('moods');
    $('#moodExit').onclick = () => { data.activeMood = null; save(); SB.moodView = null; goHome(); };
    return true;
  };
  window.renderMoodSettings = (box) => {
    data.moods ||= DEFAULT_MOODS();
    const all = allItems().filter((i) => !i.emuId);
    box.innerHTML = `
      <p class="hint">كل مود له اسم وثيم وأشياء تختارها. تضغطه من فوق ويحط لك الثيم ويعرض اللي اخترته.</p>
      ${data.moods.map((m, n) => `
        <div class="mood-edit" data-n="${n}">
          <div class="me-row"><input class="me-emoji" value="${esc(m.emoji || '')}" maxlength="3"><input class="me-name" value="${esc(m.name)}" maxlength="20">
            <select class="me-theme">${THEMES.map((t) => `<option value="${t.id}" ${m.theme === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
            <button class="btn ghost sm danger-text me-del" type="button">حذف</button></div>
          <details><summary>الأشياء في هالمود (${m.items.length})</summary>
            <input class="me-search" placeholder="دوّر…">
            <div class="me-items">${all.map((i) => `<label class="me-item ${m.items.includes(i.id) ? 'on' : ''}" data-id="${i.id}" title="${esc(i.name)}">${coverHtml(i)}<span>${esc(i.name)}</span></label>`).join('')}</div>
          </details>
        </div>`).join('')}
      <button class="btn ghost" type="button" id="moodAdd">＋ مود جديد</button>`;
    wireImages(box);
    box.querySelectorAll('.mood-edit').forEach((row) => {
      const m = data.moods[Number(row.dataset.n)];
      row.querySelector('.me-emoji').onchange = (e) => { m.emoji = e.target.value.trim(); save(); SB.drawMoods(); };
      row.querySelector('.me-name').onchange = (e) => { m.name = e.target.value.trim() || m.name; save(); SB.drawMoods(); };
      row.querySelector('.me-theme').onchange = (e) => { m.theme = e.target.value; save(); };
      row.querySelector('.me-del').onclick = () => { if (confirm(`حذف مود ${m.name}؟`)) { data.moods = data.moods.filter((x) => x !== m); save(); SB.drawMoods(); window.renderMoodSettings(box); } };
      row.querySelectorAll('.me-item').forEach((it) => it.onclick = (e) => {
        e.preventDefault();
        const id = it.dataset.id;
        m.items = m.items.includes(id) ? m.items.filter((x) => x !== id) : [...m.items, id];
        it.classList.toggle('on'); row.querySelector('summary').textContent = `الأشياء في هالمود (${m.items.length})`; save();
      });
      row.querySelector('.me-search').oninput = (e) => { const q = e.target.value.trim().toLowerCase(); row.querySelectorAll('.me-item').forEach((it) => { it.hidden = q && !it.textContent.toLowerCase().includes(q); }); };
    });
    box.querySelector('#moodAdd').onclick = () => { data.moods.push({ id: uid(), name: 'مود جديد', emoji: '✨', theme: data.theme, items: [] }); save(); SB.drawMoods(); window.renderMoodSettings(box); };
  };

  // ---------- Ratings: rate everything, and a tier list you can share ----------
  const TIERS = [['S', '#ff7f7f'], ['A', '#ffbf7f'], ['B', '#ffdf7f'], ['C', '#bfff7f'], ['D', '#7fbfff'], ['F', '#bf7fff']];
  // only games: no stores, launchers, emulators, programs or companies
  const NOT_GAME = /(^|\b)(steam|epic games( launcher)?|ea( app| desktop)?|origin|battle\.?net|ubisoft( connect)?|uplay|rockstar( games)?( launcher)?|gog( galaxy)?|xbox( app)?|microsoft store|riot client|launcher|playnite|retroarch|nvidia|geforce|discord|amazon games|itch\.io|heroic|lutris|parsec|moonlight|steamvr)(\b|$)/i;
  window.isRateable = (i) => !i.emuId && !i.store && !i.tool && !NOT_GAME.test(i.name || '') && !/(launcher|setup|install|uninst)/i.test(String(i.target || '').split(/[\\/]/).pop()) && !/^(steam|com\.epicgames\.launcher|origin2?|uplay|battlenet|goggalaxy):\/\/(open|nav|store)/i.test(i.target || '');
  const games = () => data.pages.filter((p) => ['games', 'emu', 'owned'].includes(p.type)).flatMap((p) => p.items.filter((i) => window.isRateable(i) && !(data.tierHidden || []).includes(i.id)));
  SB.ratingsView = null;
  SB.openRatings = (tab = 'tiers') => { closeWebIfOpen(); window.closeDetail?.(); currentPageId = null; SB.moodView = null; SB.ratingsView = tab; render(); };
  SB.renderRatings = () => {
    const tab = SB.ratingsView === 'rate' ? 'rate' : 'tiers';
    data.tiers ||= {};
    const list = games();
    $('#backBtn').hidden = false;
    $('#title').innerHTML = '<span>⭐ التقييم</span>';
    $('#subtitle').textContent = `${list.length} لعبة في مكتبتك (المثبتة واللي عندك)`;
    for (const t of Object.keys(data.tiers)) data.tiers[t] = data.tiers[t].filter((id) => { const it = findItem(id)?.item; return it && window.isRateable(it) && !(data.tierHidden || []).includes(id); });
    const placed = new Set(Object.values(data.tiers).flat());
    const cov = (i) => `<div class="tl-item" draggable="true" data-tl="${i.id}" title="${esc(i.name)}">${coverHtml(i)}</div>`;
    view.innerHTML = `
      <div class="chips"><button class="chip ${tab === 'tiers' ? 'on' : ''}" data-t="tiers">🏆 قائمة المستويات</button><button class="chip ${tab === 'rate' ? 'on' : ''}" data-t="rate">★ قيّم ألعابك</button>
        ${tab === 'tiers' ? `<span class="spacer"></span>${(data.tierHidden || []).length ? `<button class="btn ghost sm" id="tlUnhide">↩ رجّع اللي شلتها (${data.tierHidden.length})</button>` : ''}<button class="btn ghost sm" id="tlShare">📤 شارك / احفظ الصورة</button><button class="btn ghost sm" id="tlReset">↺ فضّها</button>` : ''}</div>
      ${tab === 'tiers' ? `
        <div class="tierlist" id="tierlist">
          ${TIERS.map(([t, c]) => `<div class="tl-row"><div class="tl-tag" style="background:${c}">${t}</div><div class="tl-drop" data-tier="${t}">${(data.tiers[t] || []).map((id) => findItem(id)?.item).filter(Boolean).map(cov).join('')}</div></div>`).join('')}
        </div>
        <div class="group-title">اسحب الألعاب للصفوف فوق <small>${list.filter((i) => !placed.has(i.id)).length}</small></div>
        <div class="tl-drop tl-pool" data-tier="">${list.filter((i) => !placed.has(i.id)).map(cov).join('')}</div>`
      : `<div class="tiles portrait">${list.sort((a, b) => (avgRating(b) ?? -1) - (avgRating(a) ?? -1)).map((i) => tileHtml(i, findItem(i.id)?.page)).join('')}</div>`}`;
    wireImages(view);
    view.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { SB.ratingsView = b.dataset.t; render(); });
    if (tab === 'rate') {
      view.querySelectorAll('[data-item]').forEach((el) => { el.onclick = () => openRater(el.dataset.item); });
      view.querySelectorAll('[data-rate]').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); openRater(el.dataset.rate); }; });
      return true;
    }
    // drag & drop between tiers (or click: pick a tier from a menu, handy with the controller)
    view.querySelectorAll('.tl-item').forEach((el) => {
      el.ondragstart = (e) => { e.dataTransfer.setData('text/sb-tier', el.dataset.tl); el.classList.add('lift'); };
      el.ondragend = () => el.classList.remove('lift');
      const menu = (e) => showCtx(e, [...TIERS.map(([t]) => ({ label: `حطها في ${t}`, run: () => place(el.dataset.tl, t) })), { label: 'رجّعها تحت (بدون تقييم)', run: () => place(el.dataset.tl, '') }, { label: '🚫 شيلها من التقييم كلياً', danger: true, run: () => { (data.tierHidden ||= []).push(el.dataset.tl); place(el.dataset.tl, ''); } }]);
      el.onclick = menu;
      el.oncontextmenu = (e) => { e.preventDefault(); menu(e); }; // right-click: move it, or take it out of the ratings
    });
    view.querySelectorAll('.tl-drop').forEach((d) => {
      d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
      d.ondragleave = () => d.classList.remove('over');
      d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); const id = e.dataTransfer.getData('text/sb-tier'); if (id) place(id, d.dataset.tier); };
    });
    $('#tlReset').onclick = () => { if (confirm('ترجع كل الألعاب لتحت؟')) { data.tiers = {}; save(); render(); } };
    $('#tlShare').onclick = shareTiers;
    const uh = $('#tlUnhide'); if (uh) uh.onclick = () => { data.tierHidden = []; save(); render(); };
    return true;
  };
  function place(id, tier) {
    for (const t of Object.keys(data.tiers)) data.tiers[t] = data.tiers[t].filter((x) => x !== id);
    if (tier) (data.tiers[tier] ||= []).push(id);
    save(); render();
  }
  async function shareTiers() {
    toast('أرسم قائمتك…');
    const W = 1080, rowH = 170, pad = 40, head = 150;
    const rows = TIERS.map(([t, c]) => ({ t, c, items: (data.tiers[t] || []).map((id) => findItem(id)?.item).filter(Boolean) }));
    const H = head + rows.length * (rowH + 12) + 90;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily;
    x.fillStyle = '#0d1018'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#fff'; x.font = `800 58px ${font}`; x.textAlign = 'center'; x.fillText('قائمة ألعابي', W / 2, 92);
    x.font = `500 26px ${font}`; x.fillStyle = 'rgba(255,255,255,.55)'; x.fillText(data.user?.name ? `من ${data.user.name}` : 'Silver Bullet', W / 2, 130);
    const load = (src) => new Promise(async (r) => { if (!src) return r(null); const d = await pv.imgData(toImageUrl(src)); if (!d) return r(null); const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = d; });
    let y = head;
    for (const row of rows) {
      x.fillStyle = row.c; x.beginPath(); x.roundRect(pad, y, 120, rowH, 14); x.fill();
      x.fillStyle = '#111'; x.font = `800 72px ${font}`; x.textAlign = 'center'; x.fillText(row.t, pad + 60, y + rowH / 2 + 26);
      x.fillStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.roundRect(pad + 130, y, W - pad * 2 - 130, rowH, 14); x.fill();
      const cw = 112, ch = 150, per = Math.floor((W - pad * 2 - 150) / (cw + 8));
      const imgs = await Promise.all(row.items.slice(0, per).map((i) => load(i.image || i.icon)));
      imgs.forEach((im, k) => {
        const cx = W - pad - 10 - (k + 1) * (cw + 8) + 8, cy = y + 10;
        x.save(); x.beginPath(); x.roundRect(cx, cy, cw, ch, 10); x.clip();
        if (im) { const s = Math.max(cw / im.width, ch / im.height); x.drawImage(im, cx + (cw - im.width * s) / 2, cy + (ch - im.height * s) / 2, im.width * s, im.height * s); }
        else { x.fillStyle = '#2a3040'; x.fillRect(cx, cy, cw, ch); x.fillStyle = '#fff'; x.font = `700 20px ${font}`; x.fillText(row.items[k].name.slice(0, 10), cx + cw / 2, cy + ch / 2); }
        x.restore();
      });
      y += rowH + 12;
    }
    x.fillStyle = 'rgba(255,255,255,.45)'; x.font = `500 24px ${font}`; x.textAlign = 'center'; x.fillText('Silver Bullet', W / 2, H - 36);
    const file = await pv.saveCard(cv.toDataURL('image/png'), 'قائمة المستويات');
    const d = document.createElement('dialog'); d.id = 'tlShareDlg';
    d.innerHTML = `<h2>📤 قائمتك جاهزة</h2><div class="card-prev"><img src="${cv.toDataURL('image/png')}"></div><div class="actions"><button class="btn ghost" data-x>إغلاق</button><span class="spacer"></span><button class="btn ghost" data-f>💾 مكان الصورة</button><button class="btn ghost" data-c>📋 انسخها (للصق في ديسكورد)</button><button class="btn primary" data-p>📲 أرسلها لجوالي</button></div>`;
    document.body.appendChild(d); d.showModal();
    d.querySelector('[data-c]').onclick = async () => { try { if (!(pv.copyImage && await pv.copyImage(cv.toDataURL('image/png')))) { const b = await (await fetch(cv.toDataURL('image/png'))).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); } toast('✓ انسخت: الصقها في ديسكورد أو واتساب (Ctrl+V)'); } catch (e) { toast('ما قدرت أنسخها: ' + e.message); } };
    d.querySelector('[data-x]').onclick = () => d.close();
    d.querySelector('[data-f]').onclick = () => pv.showCard(file);
    d.querySelector('[data-p]').onclick = () => { d.close(); window.Shots?.sendToPhone([{ game: 'قائمة المستويات', files: [{ f: file }] }], 'قائمة المستويات'); };
    d.addEventListener('close', () => d.remove());
  }
  document.getElementById('rateBtn').onclick = () => SB.openRatings('tiers');

  // ---------- Look: brightness, your own background ----------
  const dim = document.createElement('div'); dim.id = 'dimmer'; document.body.appendChild(dim);
  const own = document.createElement('div'); own.id = 'ownBg'; document.getElementById('scene').after(own);
  SB.applyLook = () => {
    const b = data.settings?.brightness ?? 1;
    dim.style.background = b < 1 ? `rgba(0,0,0,${(1 - b).toFixed(2)})` : `rgba(255,255,255,${((b - 1) * 0.5).toFixed(2)})`;
    dim.style.mixBlendMode = b < 1 ? 'normal' : 'soft-light';
    const f = data.settings?.customBg;
    document.body.classList.toggle('own-bg', !!f);
    if (!f) { own.innerHTML = ''; own.dataset.src = ''; return; }
    if (own.dataset.src === f) return;
    own.dataset.src = f;
    own.innerHTML = /\.(mp4|webm|mov|mkv)$/i.test(f) ? `<video src="${esc(toImageUrl(f))}" autoplay muted loop playsinline></video>` : `<div class="own-img" style="background-image:url('${esc(toImageUrl(f))}')"></div>`;
  };

  // ---------- Idle: after 15 minutes the menus fade and only the moving background stays ----------
  let lastInput = Date.now(), padSig = '';
  const wake = () => { lastInput = Date.now(); if (document.body.classList.contains('afk')) document.body.classList.remove('afk'); };
  ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { passive: true, capture: true }));
  setInterval(() => {
    const p = [...(navigator.getGamepads?.() || [])].filter(Boolean)[0];
    if (p) { const sig = p.buttons.map((b) => (b.pressed ? 1 : 0)).join('') + p.axes.map((a) => Math.round(a * 4)).join(','); if (sig !== padSig) { padSig = sig; wake(); } }
    const idle = Date.now() - lastInput > 15 * 60 * 1000;
    if (idle && data?.settings?.afk !== false && !document.querySelector('dialog[open]') && $('#webWrap').hidden && !document.body.classList.contains('afk')) document.body.classList.add('afk');
  }, 1000);

  // Hooks used by app.js
  SB.drawTop = () => { SB.drawPins(); SB.drawMoods(); SB.applyLook(); };
})();
