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
    v.querySelector('.v-src').textContent = `${s.src} · ${new Date(s.t).toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' })}`;
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
    isOpen: () => !v.hidden,
    close,
    navigate(a) { if (a === 'back') close(); else if (a === 'left') { idx = (idx + 1) % list.length; show(); } else if (a === 'right') { idx = (idx - 1 + list.length) % list.length; show(); } },
    count: (id) => (shots[id] || []).length,
    // Strip of thumbnails inside a game's detail screen
    async renderInto(item, box) {
      if (!box) return;
      await scan();
      const l = shots[item.id] || [];
      if (!l.length) { box.innerHTML = `<div class="d-shots-empty">ما فيه لقطات لهذي اللعبة للحين.</div>`; return; }
      const imgs = l.filter((s) => !s.video).length, vids = l.length - imgs;
      box.innerHTML = `<div class="d-shots-head">📸 لقطاتك <small>${imgs} صورة${vids ? ` · ${vids} مقطع` : ''}</small> <button class="btn ghost sm" data-phone>📲 انقلها للجوال</button></div>
        <div class="d-shots-row">${l.slice(0, 14).map(thumb).join('')}${l.length > 14 ? `<button class="shot more" data-i="14">+${l.length - 14}</button>` : ''}</div>`;
      box.querySelectorAll('.shot').forEach((b) => b.onclick = (e) => { e.stopPropagation(); open(l, Number(b.dataset.i), item.name); });
      box.querySelector('[data-phone]').onclick = (e) => { e.stopPropagation(); sendToPhone(groupFor(item), item.name); };
    },
    // The gallery page: tabs for game captures and every photo / video on the PC, sorted by kind
    async renderGallery(viewEl) {
      const tab = window._galTab || 'games';
      const tabs = `<div class="chips"><button class="chip ${tab === 'games' ? 'on' : ''}" data-g="games">🎮 لقطات الألعاب</button><button class="chip ${tab === 'all' ? 'on' : ''}" data-g="all">🖼 كل صوري ومقاطعي</button></div>`;
      const wireTabs = () => viewEl.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { window._galTab = b.dataset.g; this.renderGallery(viewEl); });
      if (tab === 'all') {
        viewEl.innerHTML = tabs + '<div class="empty">أجمع صورك من الجهاز…</div>'; wireTabs();
        const cats = await pv.photosScan();
        if (window._galTab !== 'all') return;
        if (!cats.length) { viewEl.innerHTML = tabs + '<div class="empty">ما لقيت صور في مجلداتك المعتادة.</div>'; wireTabs(); return; }
        viewEl.innerHTML = tabs + cats.map((c, n) => `<div class="g-row" data-c="${n}"><div class="group-title">${esc(c.name)} <small>${c.total}</small><span class="spacer"></span><button class="btn ghost sm" data-ph="${n}">📲 للجوال</button></div>
          <div class="d-shots-row big">${c.files.slice(0, 14).map(thumb).join('')}${c.files.length > 14 ? `<button class="shot more" data-i="14">+${c.total - 14}</button>` : ''}</div></div>`).join('');
        wireTabs();
        viewEl.querySelectorAll('.g-row').forEach((row) => {
          const c = cats[Number(row.dataset.c)];
          row.querySelectorAll('.shot').forEach((b) => b.onclick = () => open(c.files, Number(b.dataset.i), c.name));
          row.querySelector('[data-ph]').onclick = () => sendToPhone([{ game: c.name, files: c.files.slice(0, 200) }], c.name);
        });
        return;
      }
      viewEl.innerHTML = tabs + '<div class="empty">أجمع لقطاتك…</div>'; wireTabs();
      await scan();
      const games = gameItems().filter((i) => (shots[i.id] || []).length)
        .sort((a, b) => (shots[b.id][0]?.t || 0) - (shots[a.id][0]?.t || 0));
      if (!games.length) {
        viewEl.innerHTML = tabs + `<div class="empty">ما لقيت لقطات ألعاب للحين. البرنامج يجمعها من ستيم وNVIDIA وMedal وXbox Game Bar تلقائياً حسب اللعبة.</div>`; wireTabs();
        return;
      }
      const total = games.reduce((a, g) => a + shots[g.id].length, 0);
      viewEl.innerHTML = tabs + `<div class="gallery-head"><span>${total} لقطة من ${games.length} لعبة</span><button class="btn primary" id="phoneAll">📲 انقل الكل للجوال</button></div>` + games.map((g) => {
        const l = shots[g.id];
        return `<div class="g-row"><div class="group-title">${esc(g.name)} <small>${l.length}</small></div>
          <div class="d-shots-row big">${l.slice(0, 12).map(thumb).join('')}${l.length > 12 ? `<button class="shot more" data-i="12">+${l.length - 12}</button>` : ''}</div></div>`;
      }).join('');
      wireTabs();
      viewEl.querySelector('#phoneAll').onclick = () => sendToPhone(allGroups());
      viewEl.querySelectorAll('.g-row').forEach((row, n) => {
        const g = games[n];
        row.querySelectorAll('.shot').forEach((b) => b.onclick = () => open(shots[g.id], Number(b.dataset.i), g.name));
      });
    },
    async openFolder() { const d = await pv.shotsFolder(); pv.launch(d); },
  };

})();
