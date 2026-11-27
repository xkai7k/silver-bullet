// My series & movies: folders of videos on this PC, shown as posters under the Watch page,
// with an in-app player that remembers the minute you stopped at and moves to the next episode.
(() => {
  const S = (window.Series = {});
  const prog = () => (data.seriesProgress ||= {});      // file -> { t, d, at }
  const showState = () => (data.seriesLast ||= {});     // show dir -> last file
  let shows = [];
  const fmt = (t) => fmtClock(t);
  const cleanEp = (n) => n.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/\s*(1080p|720p|2160p|480p|x26[45]|hevc|web-?dl|bluray|webrip|hdtv|aac|ddp?5\.1|-\w+$).*$/i, '').trim();
  const epCode = (n) => { const m = /s(\d{1,2})\s*e(\d{1,3})/i.exec(n) || /(\d{1,2})x(\d{2,3})/.exec(n); return m ? `م${+m[1]} ح${+m[2]}` : ''; };
  const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

  S.addFolder = async (p) => {
    const dir = await pv.pickDir(); if (!dir) return;
    p.folders ||= [];
    if (!p.folders.includes(dir)) p.folders.push(dir);
    save(); renderPage(); toast('انضاف المجلد');
  };
  S.render = async (box, p) => {
    const folders = p.folders || [];
    if (!folders.length) { box.innerHTML = '<div class="empty small">اضغط "＋ مجلد" واختر المجلد اللي فيه مسلسلاتك أو أفلامك. كل مجلد داخله يصير مسلسل لحاله، ويحفظ لك وين وقفت.</div>'; return; }
    shows = await pv.seriesScan(folders);
    if (!box.isConnected) return;
    if (!shows.length) { box.innerHTML = '<div class="empty small">ما لقيت فيديوهات في المجلدات اللي اخترتها.</div>'; return; }
    box.innerHTML = `<div class="series-row">${shows.map((sh, n) => {
      const last = showState()[sh.dir], lp = last && prog()[last];
      const done = sh.episodes.filter((e) => (prog()[e.file]?.t || 0) > (prog()[e.file]?.d || 1) * 0.9).length;
      const pct = lp && lp.d ? Math.round((lp.t / lp.d) * 100) : 0;
      return `<div class="show" tabindex="0" data-show="${n}" title="${esc(sh.name)}">
        <div class="show-poster" style="--h:${hue(sh.name)}">${sh.poster ? `<img src="${esc(toImageUrl(sh.poster))}" alt="">` : `<span>${esc(sh.name)}</span>`}
          ${last ? `<i class="show-bar" style="--p:${pct}%"></i>` : ''}<b class="show-count">${sh.movie ? 'فيلم' : `${done}/${sh.episodes.length}`}</b></div>
        <div class="label">${esc(sh.name)}</div>
        <div class="sub">${last ? `كمّل: ${esc(epCode(last.split(/[\\/]/).pop()) || cleanEp(last.split(/[\\/]/).pop()))}` : sh.movie ? '' : `${sh.episodes.length} حلقة`}</div>
      </div>`;
    }).join('')}</div>
    <div class="series-dirs">${folders.map((f, i) => `<span class="sdir" dir="ltr">${esc(f)}<button data-rm="${i}" title="شيل المجلد">✕</button></span>`).join('')}</div>`;
    box.querySelectorAll('[data-show]').forEach((el) => { el.onclick = () => openShow(shows[Number(el.dataset.show)]); });
    box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { p.folders.splice(Number(b.dataset.rm), 1); save(); renderPage(); });
  };


  // ---------- take episodes to the phone / iPad (download over Wi-Fi, watch later without the PC) ----------
  function toPhone(sh) {
    const last = showState()[sh.dir];
    let from = Math.max(0, sh.episodes.findIndex((e) => e.file === last));
    while (from < sh.episodes.length - 1 && (prog()[sh.episodes[from].file]?.d && prog()[sh.episodes[from].file].t / prog()[sh.episodes[from].file].d > 0.9)) from++;
    const pick = new Set(sh.episodes.slice(from, from + 3).map((e) => e.file));
    const draw = () => {
      dlg.innerHTML = `
        <div class="sd-head"><h2>📱 ${esc(sh.name)} للجوال</h2><span class="spacer"></span>
          <button class="btn primary" data-go ${pick.size ? '' : 'disabled'}>جهّز الباركود (${pick.size})</button><button class="btn ghost" data-back>رجوع</button></div>
        <p class="hint" style="margin:4px 0 10px">اختر الحلقات، امسح الباركود بالجوال أو الآيباد ونزّلها. بعدها تتابعها في أي مكان بدون الكمبيوتر.</p>
        <div class="ep-list">${sh.episodes.map((e, i) => `<button class="ep ${pick.has(e.file) ? 'cur' : ''}" data-pk="${i}"><span class="ep-n">${pick.has(e.file) ? '✓' : i + 1}</span><span class="ep-t">${esc(epCode(e.name) ? epCode(e.name) + ' • ' : '')}${esc(cleanEp(e.name))}</span></button>`).join('')}</div>`;
      dlg.querySelector('[data-back]').onclick = () => openShow(sh);
      dlg.querySelectorAll('[data-pk]').forEach((b) => b.onclick = () => { const f = sh.episodes[Number(b.dataset.pk)].file; pick.has(f) ? pick.delete(f) : pick.add(f); draw(); });
      dlg.querySelector('[data-go]').onclick = go;
    };
    const go = async () => {
      dlg.innerHTML = '<h2>📱 أجهّز…</h2>';
      const r = await pv.shareStart([{ game: sh.name, files: sh.episodes.filter((e) => pick.has(e.file)).map((e) => ({ f: e.file, video: true })) }], { kind: 'episodes' });
      if (!r || r.error) { dlg.innerHTML = `<h2>📱 للجوال</h2><p class="hint">${esc(r?.error || 'يشتغل داخل البرنامج')}</p><div class="actions"><button class="btn ghost" data-back>رجوع</button></div>`; dlg.querySelector('[data-back]').onclick = () => openShow(sh); return; }
      dlg.innerHTML = `
        <h2>📱 ${esc(sh.name)} — ${r.count} حلقة</h2>
        <div class="share-body">
          <div class="qr">${r.qr || ''}</div>
          <div><ol class="share-steps">
            <li>خل الجوال أو الآيباد على <b>نفس الواي فاي</b>.</li>
            <li>صوّر الباركود بالكاميرا.</li>
            <li>اضغط <b>"⬇ نزّل الكل"</b> وانتظر لين يخلص.</li>
            <li>خلاص: تتابعها بعدين بدون الكمبيوتر وبدون نت.</li>
          </ol>
          <p class="hint">أو اكتب الرابط:<br><b dir="ltr" class="share-url">${esc(r.url)}</b></p>
          <p class="hint">تقدر أكثر من جهاز ياخذها بنفس الباركود. الرابط يتقفل بعد 3 ساعات.</p></div>
        </div>
        <div class="actions"><button class="btn ghost" data-stop>إيقاف</button><button class="btn primary" data-x>تم</button></div>`;
      dlg.querySelector('[data-x]').onclick = () => dlg.close();
      dlg.querySelector('[data-stop]').onclick = async () => { await pv.shareStop(); dlg.close(); toast('وقفت المشاركة'); };
    };
    draw();
  }
  // ---------- a show: episodes list ----------
  const dlg = document.createElement('dialog'); dlg.id = 'showDlg'; document.body.appendChild(dlg);
  function openShow(sh) {
    if (sh.movie) return play(sh, sh.episodes[0]);
    const last = showState()[sh.dir];
    dlg.innerHTML = `
      <div class="sd-head"><h2>${esc(sh.name)}</h2><span class="spacer"></span>
        ${last ? `<button class="btn primary" data-cont>▶ كمّل ${esc(epCode(last.split(/[\\/]/).pop()))}</button>` : `<button class="btn primary" data-first>▶ ابدأ</button>`}
        <button class="btn ghost" data-phone title="نزّل حلقات على الجوال أو الآيباد وتابعها بدون الكمبيوتر">📱 للجوال</button>
        <button class="btn ghost" data-x>إغلاق</button></div>
      <div class="ep-list">${sh.episodes.map((e, i) => {
        const pr = prog()[e.file]; const pct = pr && pr.d ? Math.min(100, Math.round((pr.t / pr.d) * 100)) : 0;
        return `<button class="ep ${pct > 90 ? 'seen' : ''} ${e.file === last ? 'cur' : ''}" data-ep="${i}"><span class="ep-n">${i + 1}</span><span class="ep-t">${esc(epCode(e.name) ? epCode(e.name) + ' • ' : '')}${esc(cleanEp(e.name))}</span>
          <span class="ep-p">${pct > 90 ? '✓' : pr?.t ? fmt(pr.t) : ''}</span><i style="--p:${pct}%"></i></button>`;
      }).join('')}</div>`;
    dlg.querySelector('[data-x]').onclick = () => dlg.close();
    dlg.querySelector('[data-phone]').onclick = () => toPhone(sh);
    dlg.querySelector('[data-cont]')?.addEventListener('click', () => { dlg.close(); play(sh, sh.episodes.find((e) => e.file === last) || sh.episodes[0]); });
    dlg.querySelector('[data-first]')?.addEventListener('click', () => { dlg.close(); play(sh, sh.episodes[0]); });
    dlg.querySelectorAll('[data-ep]').forEach((b) => b.onclick = () => { dlg.close(); play(sh, sh.episodes[Number(b.dataset.ep)]); });
    // right-click an episode: send it to the folder shared with the phone (OneDrive)
    dlg.querySelectorAll('[data-ep]').forEach((b) => b.oncontextmenu = (e) => window.showCtx?.(e, [
      { label: '☁️ حطها في المجلد المشترك (تطلع في جوالك)', run: async () => { const r = await pv.sharedAdd(sh.episodes[Number(b.dataset.ep)].file); toast(r?.ok ? (r.already ? 'موجودة هناك من قبل' : '☁️ تنسخ الحين، وتطلع في OneDrive بجوالك أول ما ترتفع') : (r?.msg || 'ما قدرت')); } },
      { label: '📁 افتح المجلد المشترك', run: () => pv.sharedOpen() },
    ]));
    dlg.showModal();
    dlg.querySelector('.ep.cur')?.scrollIntoView({ block: 'center' });
  }

  // ---------- player ----------
  const pl = document.createElement('section'); pl.id = 'player'; pl.hidden = true;
  pl.innerHTML = `<video playsinline></video>
    <div class="pl-top"><button class="btn ghost" data-close>→ رجوع</button><b class="pl-title"></b><span class="spacer"></span><button class="btn ghost" data-ext title="إذا ما اشتغل هنا">🎬 افتح بمشغّل الجهاز</button></div>
    <div class="pl-next" hidden><span></span><button class="btn primary" data-next>الحلقة الجاية ▶</button></div>`;
  document.body.appendChild(pl);
  const video = pl.querySelector('video');
  video.controls = true;
  let cur = null, curShow = null, saveT = 0;
  function play(sh, ep) {
    curShow = sh; cur = ep;
    window.Music?.pauseForApp();
    pl.hidden = false; document.body.classList.add('playing-video');
    pl.querySelector('.pl-title').textContent = `${sh.movie ? '' : sh.name + ' • '}${cleanEp(ep.name)}`;
    pl.querySelector('.pl-next').hidden = true;
    video.src = toImageUrl(ep.file);
    const pr = prog()[ep.file];
    video.onloadedmetadata = () => { if (pr?.t && pr.t < video.duration - 20) { video.currentTime = pr.t; toast(`رجعتك للدقيقة ${fmt(pr.t)}`); } };
    video.play().catch(() => {});
    showState()[sh.dir] = ep.file; save();
    clearInterval(saveT); saveT = setInterval(remember, 3000);
    pl.querySelector('[data-close]').focus();
  }
  function remember() {
    if (!cur || !video.duration) return;
    prog()[cur.file] = { t: Math.floor(video.currentTime), d: Math.floor(video.duration), at: Date.now() };
    save();
  }
  function nextEp() { if (!curShow) return null; const i = curShow.episodes.indexOf(cur); return curShow.episodes[i + 1] || null; }
  video.ontimeupdate = () => {
    const n = nextEp();
    const near = video.duration && video.duration - video.currentTime < 40;
    const box = pl.querySelector('.pl-next');
    if (n && near && box.hidden) { box.hidden = false; box.querySelector('span').textContent = cleanEp(n.name); }
  };
  video.onended = () => { remember(); const n = nextEp(); if (n) play(curShow, n); };
  video.onerror = () => { toast('هالملف ما يشتغل داخل البرنامج، بفتحه لك بمشغّل الجهاز'); external(); };
  function external() { if (cur) { remember(); pv.launch(cur.file); close(); } }
  function close() {
    remember(); clearInterval(saveT);
    video.pause(); video.removeAttribute('src'); video.load();
    pl.hidden = true; document.body.classList.remove('playing-video');
    window.Music?.resumeIfPaused();
    if (currentPageId) renderPage(); else render();
  }
  pl.querySelector('[data-close]').onclick = close;
  pl.querySelector('[data-ext]').onclick = external;
  pl.querySelector('[data-next]').onclick = () => { const n = nextEp(); if (n) { remember(); play(curShow, n); } };
  window.addEventListener('keydown', (e) => {
    if (pl.hidden) return;
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); video.paused ? video.play() : video.pause(); }
    else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); video.currentTime = Math.max(0, video.currentTime - 10); }
    else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); video.currentTime += 10; }
  }, true);
  S.isOpen = () => !pl.hidden;
  S.close = close;
  // for the home screen's "continue watching" row
  S.resumeList = () => Object.entries(showState()).map(([dir, file]) => ({ dir, file, p: prog()[file] })).filter((x) => x.p && x.p.t > 30 && x.p.t < x.p.d * 0.95).sort((a, b) => (b.p.at || 0) - (a.p.at || 0)).slice(0, 4);
  S.resume = async (dir) => {
    const w = data.pages.find((p) => p.id === 'watch'); if (!w) return;
    shows = await pv.seriesScan(w.folders || []);
    const sh = shows.find((x) => x.dir === dir); if (!sh) return toast('ما لقيت المجلد');
    play(sh, sh.episodes.find((e) => e.file === showState()[dir]) || sh.episodes[0]);
  };
  // the phone: a fresh list of shows (with where you are in each), play one on the PC, and keep its progress
  S.scanAll = async () => { const w = data.pages.find((p) => p.id === 'watch'); if (!w?.folders?.length) return []; return (shows = await pv.seriesScan(w.folders)); };
  S.playFile = async (dir, file) => {
    if (!shows.some((x) => x.dir === dir)) await S.scanAll();
    const sh = shows.find((x) => x.dir === dir); if (!sh) return toast('ما لقيت المجلد');
    play(sh, sh.episodes.find((e) => e.file === file) || sh.episodes[0]);
  };
  S.progress = (dir, file, t, d) => {
    if (!file || !d) return;
    const was = prog()[file]; if (was && was.at > Date.now() - 4000 && cur?.file === file) return; // the PC player is on it right now
    prog()[file] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
    if (dir) showState()[dir] = file;
    save();
  };
  S.progOf = (file) => prog()[file];
  S.lastOf = (dir) => showState()[dir];
})();
