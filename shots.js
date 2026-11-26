// Screenshots & clips per game: gathered from Steam, NVIDIA, Medal, Xbox Game Bar and Preview's own captures.
(() => {
  let shots = {};          // itemId -> [{ f, src, t, video }]
  let scanning = null, lastScan = 0;
  const steamId = (i) => (/^steam:\/\/rungameid\/(\d+)/.exec(i.target || '') || [])[1];
  const gameItems = () => data.pages.filter((p) => p.type === 'games' || p.type === 'emu').flatMap((p) => p.items);
  const fileUrl = (f) => 'file:///' + encodeURI(f.replace(/\\/g, '/')).replace(/#/g, '%23');

  async function scan(force = false) {
    if (!inElectron) return shots;
    if (scanning) return scanning;
    if (!force && Date.now() - lastScan < 60000) return shots;
    scanning = (async () => {
      const games = gameItems().map((i) => ({ id: i.id, name: i.name, appid: steamId(i) }));
      try { shots = await pv.scanShots(games); } catch { shots = {}; }
      lastScan = Date.now();
      const n = Object.values(shots).reduce((a, l) => a + l.length, 0);
      pv.log(`shots: ${n} files for ${Object.keys(shots).length} games`);
      scanning = null;
      return shots;
    })();
    return scanning;
  }

  // ---------- send to phone ----------
  const shareDlg = document.createElement('dialog');
  shareDlg.id = 'shareDlg';
  document.body.appendChild(shareDlg);
  let qrLib = null;
  async function qrSvg(text) {
    if (!qrLib) qrLib = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; sc.onload = () => res(window.qrcode); sc.onerror = rej; document.head.appendChild(sc); });
    try { const q = (await qrLib)(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    catch { return ''; }
  }
  async function sendToPhone(groups, label) {
    if (!inElectron) return toast('النقل للجوال يشتغل داخل البرنامج');
    shareDlg.innerHTML = '<h2>📲 انقل للجوال</h2><p class="hint">أجهّز…</p>';
    if (!shareDlg.open) shareDlg.showModal();
    const r = await pv.shareStart(groups);
    if (r.error) { shareDlg.innerHTML = `<h2>📲 انقل للجوال</h2><p class="hint">${esc(r.error)}</p><div class="actions"><button class="btn ghost" id="shClose">تم</button></div>`; shareDlg.querySelector('#shClose').onclick = () => shareDlg.close(); return; }
    shareDlg.innerHTML = `
      <h2>📲 انقل للجوال</h2>
      <div class="share-body">
        <div class="qr">${r.qr || await qrSvg(r.url)}</div>
        <div>
          <ol class="share-steps">
            <li>خل الجوال على <b>نفس الواي فاي</b> اللي عليه الكمبيوتر.</li>
            <li>افتح كاميرا الجوال وامسح الكود.</li>
            <li>تطلع لك صفحة فيها ${r.count} ${label ? `لقطة من ${esc(label)}` : 'لقطة مرتبة حسب اللعبة'}، اضغط "حفظ" على اللي تبغاه.</li>
          </ol>
          <p class="hint">أو اكتب الرابط في متصفح الجوال:<br><b dir="ltr" class="share-url">${esc(r.url)}</b></p>
          <p class="hint">أول مرة ممكن ويندوز يسألك عن الجدار الناري: اختر <b>السماح</b> للشبكات الخاصة. المشاركة تتقفل لحالها بعد 30 دقيقة.</p>
        </div>
      </div>
      <div class="actions"><button class="btn ghost" id="shStop">إيقاف المشاركة</button><button class="btn primary" id="shClose">تم</button></div>`;
    shareDlg.querySelector('#shClose').onclick = () => shareDlg.close();
    shareDlg.querySelector('#shStop').onclick = async () => { await pv.shareStop(); shareDlg.close(); toast('وقفت المشاركة'); };
  }
  const groupFor = (item) => [{ game: item.name, files: shots[item.id] || [] }];
  const allGroups = () => gameItems().filter((i) => (shots[i.id] || []).length).map((i) => ({ game: i.name, files: shots[i.id] }));

  // ---------- viewer ----------
  const v = document.createElement('section');
  v.id = 'viewer'; v.hidden = true;
  document.body.appendChild(v);
  let list = [], idx = 0, title = '';
  function show() {
    const s = list[idx];
    if (!s) return;
    v.querySelector('.v-stage').innerHTML = s.video
      ? `<video src="${fileUrl(s.f)}" controls autoplay></video>`
      : `<img src="${fileUrl(s.f)}" alt="">`;
    v.querySelector('.v-count').textContent = `${idx + 1} / ${list.length}`;
    v.querySelector('.v-src').textContent = `${s.src} • ${new Date(s.t).toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  function open(items, start = 0, name = '') {
    list = items; idx = start; title = name;
    v.innerHTML = `
      <div class="v-top"><b>📸 ${esc(title)}</b><span class="v-count"></span><span class="v-src"></span><div class="spacer"></div>
        <button class="btn ghost" data-v="phone">📲 للجوال</button><button class="btn ghost" data-v="folder">📂 افتح المجلد</button><button class="btn ghost" data-v="close">✕</button></div>
      <button class="v-nav prev" data-v="prev">›</button><div class="v-stage"></div><button class="v-nav next" data-v="next">‹</button>`;
    v.querySelectorAll('[data-v]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const a = b.dataset.v;
      if (a === 'close') close();
      else if (a === 'next') { idx = (idx + 1) % list.length; show(); }
      else if (a === 'prev') { idx = (idx - 1 + list.length) % list.length; show(); }
      else if (a === 'folder') pv.launch(list[idx].f.replace(/[\\/][^\\/]+$/, ''));
      else if (a === 'phone') sendToPhone([{ game: title, files: list }], title);
    });
    v.hidden = false;
    show();
  }
  function close() { v.hidden = true; v.innerHTML = ''; }
  document.addEventListener('keydown', (e) => {
    if (v.hidden) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.key === 'Escape' || e.key === 'Backspace') close();
    else if (e.key === 'ArrowLeft') { idx = (idx + 1) % list.length; show(); }
    else if (e.key === 'ArrowRight') { idx = (idx - 1 + list.length) % list.length; show(); }
  }, true);

  const thumb = (s, i) => s.video
    ? `<button class="shot video" data-i="${i}"><video src="${fileUrl(s.f)}#t=1" preload="metadata" muted></video><span>▶</span></button>`
    : `<button class="shot" data-i="${i}"><img src="${fileUrl(s.f)}" loading="lazy" alt=""></button>`;

  window.Shots = {
    sendToPhone,
    scan,
    // the newest captures from every game (the phone page shows these)
    recent(n = 60) {
      const names = Object.fromEntries(gameItems().map((i) => [i.id, i.name]));
      return Object.entries(shots).flatMap(([id, l]) => l.map((x) => ({ file: x.f, t: x.t || 0, video: !!x.video, game: names[id] || '' }))).sort((a, b) => b.t - a.t).slice(0, n);
    },
    isOpen: () => !v.hidden,
    close,
    navigate(a) { if (a === 'back') close(); else if (a === 'left') { idx = (idx + 1) % list.length; show(); } else if (a === 'right') { idx = (idx - 1 + list.length) % list.length; show(); } },
    count: (id) => (shots[id] || []).length,
    total: () => Object.values(shots).reduce((a, l) => a + l.length, 0),
    // Strip of thumbnails inside a game's detail screen
    async renderInto(item, box) {
      if (!box) return;
      await scan();
      const l = shots[item.id] || [];
      if (!l.length) { box.innerHTML = `<div class="d-shots-empty">ما فيه لقطات لهذي اللعبة للحين.</div>`; return; }
      const imgs = l.filter((s) => !s.video).length, vids = l.length - imgs;
      box.innerHTML = `<div class="d-shots-head">📸 لقطاتك <small>${imgs} صورة${vids ? ` • ${vids} مقطع` : ''}</small> <button class="btn ghost sm" data-phone>📲 انقلها للجوال</button></div>
        <div class="d-shots-row">${l.slice(0, 14).map(thumb).join('')}${l.length > 14 ? `<button class="shot more" data-i="14">+${l.length - 14}</button>` : ''}</div>`;
      box.querySelectorAll('.shot').forEach((b) => b.onclick = (e) => { e.stopPropagation(); open(l, Number(b.dataset.i), item.name); });
      box.querySelector('[data-phone]').onclick = (e) => { e.stopPropagation(); sendToPhone(groupFor(item), item.name); };
    },
    // The gallery page: tabs for game captures and every photo / video on the PC, sorted by kind
    async renderGallery(viewEl) {
      const tab = window._galTab || 'games';
      const view = window._galView || 'grid', sort = window._galSort || 'new', kind = window._galKind || 'all';
      const chip = (k, v, label, cur) => `<button class="chip ${cur === v ? 'on' : ''}" data-${k}="${v}">${label}</button>`;
      const tabs = `<div class="chips">${chip('g', 'games', '🎮 لقطات الألعاب', tab)}${chip('g', 'all', '🖼 كل صوري ومقاطعي', tab)}</div>
        <div class="gal-tools"><div class="seg">${chip('v', 'grid', '▦ شبكة', view)}${chip('v', 'list', '☰ قائمة بالأحجام', view)}</div>
        <div class="seg">${chip('s', 'new', 'الأحدث', sort)}${chip('s', 'old', 'الأقدم', sort)}${chip('s', 'big', 'الأكبر حجماً', sort)}</div>
        <div class="seg">${chip('k', 'all', 'الكل', kind)}${chip('k', 'img', '📷 صور', kind)}${chip('k', 'vid', '🎬 مقاطع', kind)}</div></div>`;
      const wireTabs = () => {
        viewEl.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { window._galTab = b.dataset.g; this.renderGallery(viewEl); });
        viewEl.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { window._galView = b.dataset.v; this.renderGallery(viewEl); });
        viewEl.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { window._galSort = b.dataset.s; this.renderGallery(viewEl); });
        viewEl.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { window._galKind = b.dataset.k; this.renderGallery(viewEl); });
      };
      const pick = (l) => l.filter((x) => kind === 'all' || (kind === 'vid' ? x.video : !x.video));
      const order = (l) => pick(l).slice().sort((a, b) => sort === 'old' ? a.t - b.t : sort === 'big' ? (b.s || 0) - (a.s || 0) : b.t - a.t);
      // kept left-to-right inside Arabic text, or "20.73 GB" shows up as "GB 20.73"
      const size = (b) => !b ? '' : '\u2066' + (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB') + '\u2069';
      const when = (t) => new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
      // groups: [{ name, files }]
      let groups;
      if (tab === 'all') {
        viewEl.innerHTML = tabs + '<div class="empty">أجمع صورك من الجهاز…</div>'; wireTabs();
        const cats = await pv.photosScan();
        if (window._galTab !== 'all') return;
        groups = cats.map((c) => ({ name: c.name, files: c.files }));
      } else {
        viewEl.innerHTML = tabs + '<div class="empty">أجمع لقطاتك…</div>'; wireTabs();
        await scan();
        groups = gameItems().filter((i) => (shots[i.id] || []).length).map((i) => ({ name: i.name, files: shots[i.id] }));
      }
      groups = groups.map((g) => ({ ...g, files: order(g.files) })).filter((g) => g.files.length);
      if (!groups.length) {
        viewEl.innerHTML = tabs + `<div class="empty">${tab === 'all' ? 'ما لقيت صور في مجلداتك المعتادة.' : 'ما لقيت لقطات ألعاب للحين. البرنامج يجمعها من ستيم وNVIDIA وMedal وXbox Game Bar تلقائياً حسب اللعبة.'}</div>`; wireTabs();
        return;
      }
      const all = groups.flatMap((g) => g.files.map((f) => ({ ...f, game: g.name })));
      const totalSize = all.reduce((a, f) => a + (f.s || 0), 0);
      groups.sort((a, b) => sort === 'big' ? b.files.reduce((x, f) => x + (f.s || 0), 0) - a.files.reduce((x, f) => x + (f.s || 0), 0) : sort === 'old' ? a.files[0].t - b.files[0].t : b.files[0].t - a.files[0].t);
      const head = `<div class="gallery-head"><span>${all.length} ملف • ${size(totalSize)}</span>${tab === 'games' ? '<button class="btn primary" id="phoneAll">📲 انقل الكل للجوال</button>' : ''}</div>`;

      if (view === 'list') { // every file in one list, like the Space tab: see the biggest, delete from here
        const flat = order(all);
        const shown = flat.slice(0, 400);
        viewEl.innerHTML = tabs + head + `<div class="gl-bar"><label><input type="checkbox" id="glAll"> حدد الكل</label><span id="glSel"></span><button class="btn danger sm" id="glDel" disabled>🗑 احذف المحدد</button></div>
          <div class="gl-list">${shown.map((f, i) => `<div class="gl-row" data-i="${i}"><input type="checkbox" data-c="${i}"><button class="gl-th" data-o="${i}">${f.video ? `<video src="${fileUrl(f.f)}#t=1" preload="metadata" muted></video><span>▶</span>` : `<img src="${fileUrl(f.f)}" loading="lazy" alt="">`}</button>
            <span class="gl-name" title="${esc(f.f)}"><b dir="auto">${esc(f.f.split(/[\\/]/).pop())}</b><small>${esc(f.game)} • ${when(f.t)}</small></span><span class="gl-size">${size(f.s)}</span><button class="btn ghost sm" data-del="${i}" title="للسلة">🗑</button></div>`).join('')}</div>
          ${flat.length > shown.length ? `<p class="hint">يعرض أول ${shown.length} من ${flat.length}.</p>` : ''}`;
        wireTabs();
        viewEl.querySelector('#phoneAll')?.addEventListener('click', () => sendToPhone(allGroups()));
        const sel = new Set();
        const sync = () => { viewEl.querySelector('#glDel').disabled = !sel.size; viewEl.querySelector('#glSel').textContent = sel.size ? `${sel.size} محدد • ${size([...sel].reduce((a, i) => a + (shown[i].s || 0), 0))}` : ''; };
        viewEl.querySelectorAll('[data-c]').forEach((c) => c.onchange = () => { c.checked ? sel.add(Number(c.dataset.c)) : sel.delete(Number(c.dataset.c)); sync(); });
        viewEl.querySelector('#glAll').onchange = (e) => { viewEl.querySelectorAll('[data-c]').forEach((c) => { c.checked = e.target.checked; c.checked ? sel.add(Number(c.dataset.c)) : sel.delete(Number(c.dataset.c)); }); sync(); };
        viewEl.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => open(shown, Number(b.dataset.o), 'لقطاتك'));
        const del = async (idx) => {
          const files = idx.map((i) => shown[i].f);
          if (!confirm(`أرسل ${files.length} ملف لسلة المحذوفات؟ (تقدر ترجعها من السلة)`)) return;
          const n = await pv.trashFiles(files);
          toast(`🗑 راح ${n} ملف للسلة`); lastScan = 0; this.renderGallery(viewEl);
        };
        viewEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => del([Number(b.dataset.del)]));
        viewEl.querySelector('#glDel').onclick = () => del([...sel]);
        return;
      }
      viewEl.innerHTML = tabs + head + groups.map((g, n) => {
        const l = g.files;
        return `<div class="g-row" data-c="${n}"><div class="group-title">${esc(g.name)} <small>${l.length} • ${size(l.reduce((a, f) => a + (f.s || 0), 0))}</small><span class="spacer"></span><button class="btn ghost sm" data-ph="${n}">📲 للجوال</button></div>
          <div class="d-shots-row big">${l.slice(0, 14).map(thumb).join('')}${l.length > 14 ? `<button class="shot more" data-i="14">+${l.length - 14}</button>` : ''}</div></div>`;
      }).join('');
      wireTabs();
      viewEl.querySelector('#phoneAll')?.addEventListener('click', () => sendToPhone(allGroups()));
      viewEl.querySelectorAll('.g-row').forEach((row) => {
        const g = groups[Number(row.dataset.c)];
        row.querySelectorAll('.shot').forEach((b) => b.onclick = () => open(g.files, Number(b.dataset.i), g.name));
        row.querySelector('[data-ph]').onclick = () => sendToPhone([{ game: g.name, files: g.files.slice(0, 200) }], g.name);
      });
    },
    async openFolder() { const d = await pv.shotsFolder(); pv.launch(d); },
  };

})();
