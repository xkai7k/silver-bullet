// Profile: tap your picture (top right). Your picture, name, a short bio, your favourite games,
// your best-rated games and play time — and a card you can save, copy (to paste in Discord) or send to your phone.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const btn = document.getElementById('avatarBtn');
  const user = () => (data.user ||= {});
  const gamesAll = () => data.pages.filter((p) => ['games', 'emu', 'owned'].includes(p.type)).flatMap((p) => p.items).filter((i) => window.isRateable ? window.isRateable(i) : !i.store);
  const hours = () => Math.round(gamesAll().reduce((a, i) => a + (typeof playMinutes === 'function' ? playMinutes(i) : 0), 0) / 60);
  const tierOf = (id) => Object.entries(data.tiers || {}).find(([, ids]) => ids.includes(id))?.[0];
  const best = () => ['S', 'A'].flatMap((t) => (data.tiers?.[t] || []).map((id) => findItem(id)?.item).filter((i) => i && (!window.isRateable || window.isRateable(i)))).slice(0, 6);
  const favs = () => (user().favs || []).map((id) => findItem(id)?.item).filter(Boolean).slice(0, 5);

  function drawBtn() {
    // always there: an empty circle until you pick a picture
    btn.hidden = false;
    const a = data.settings?.avatar;
    btn.classList.toggle('empty', !a);
    btn.innerHTML = a ? `<img alt="" src="${esc(toImageUrl(a))}">` : '<span>👤</span>';
    btn.title = 'ملفك: صورتك واسمك وألعابك المفضلة';
  }
  window.drawAvatar = drawBtn;
  btn.onclick = (e) => { e.stopPropagation(); open(); };

  function open() {
    const u = user();
    const d = document.createElement('dialog'); d.className = 'profile-dlg';
    const draw = () => {
      const a = data.settings?.avatar;
      d.innerHTML = `
        <div class="pf-head">
          <button class="pf-av" data-av title="غيّر صورتك">${a ? `<img src="${esc(toImageUrl(a))}" alt="">` : '<span>👤<small>حط صورة</small></span>'}</button>
          <div class="pf-id">
            <input class="pf-name" maxlength="30" placeholder="اسمك" value="${esc(u.name || '')}" dir="auto">
            <textarea class="pf-bio" maxlength="160" rows="2" placeholder="نبذة عنك (مثلاً: أحب ألعاب القصص والسولز…)" dir="auto">${esc(u.bio || '')}</textarea>
          </div>
        </div>
        <div class="pf-stats">
          <div><b>${gamesAll().length}</b><small>لعبة</small></div>
          <div><b>${hours()}</b><small>ساعة لعب</small></div>
          <div><b>${Object.values(data.tiers || {}).flat().length}</b><small>قيّمتها</small></div>
        </div>
        <h3>⭐ ألعابي المفضلة <small>(لين ٥)</small></h3>
        <div class="pf-row" data-favs>${favs().map((i) => `<div class="pf-g" data-rm="${i.id}" title="${esc(i.name)} — اضغط تشيلها">${coverHtml(i)}</div>`).join('')}${favs().length < 5 ? '<button class="pf-add" data-addfav>+</button>' : ''}</div>
        <h3>🏆 أعلى تقييماتي</h3>
        <div class="pf-row">${best().map((i) => `<div class="pf-g" title="${esc(i.name)}">${coverHtml(i)}<i class="pf-tier">${tierOf(i.id)}</i></div>`).join('') || '<div class="empty small">لسا ما قيّمت. من زر ⭐ فوق حط ألعابك في S و A.</div>'}</div>
        <div class="actions"><button class="btn ghost" data-x>إغلاق</button><span class="spacer"></span><button class="btn ghost" data-rate>⭐ قيّم</button><button class="btn primary" data-share>📤 شارك بطاقتي</button></div>`;
      wireImages?.(d);
      d.querySelector('[data-av]').onclick = async () => { const f = await pv.pickFile('image'); if (f) { data.settings.avatar = f; save(); drawBtn(); draw(); } };
      d.querySelector('.pf-name').onchange = (e) => { u.name = e.target.value.trim(); save(); if (!currentPageId) $('#title').textContent = greeting(); };
      d.querySelector('.pf-bio').onchange = (e) => { u.bio = e.target.value.trim(); save(); };
      d.querySelectorAll('[data-rm]').forEach((g) => g.onclick = () => { u.favs = (u.favs || []).filter((x) => x !== g.dataset.rm); save(); draw(); });
      d.querySelector('[data-addfav]')?.addEventListener('click', () => pickFav(draw));
      d.querySelector('[data-x]').onclick = () => d.close();
      d.querySelector('[data-rate]').onclick = () => { d.close(); window.SB?.openRatings('tiers'); };
      d.querySelector('[data-share]').onclick = () => shareCard();
    };
    document.body.appendChild(d); d.addEventListener('close', () => d.remove()); draw(); d.showModal();
  }
  function pickFav(done) {
    const d = document.createElement('dialog'); d.className = 'mods-pick';
    const list = gamesAll().filter((i) => !(user().favs || []).includes(i.id));
    d.innerHTML = `<h2>⭐ اختر لعبة مفضلة</h2><input id="pfQ" placeholder="دوّر…" autocomplete="off"><div class="mp-list"></div><div class="actions"><button class="btn ghost" data-x>إغلاق</button></div>`;
    document.body.appendChild(d); d.addEventListener('close', () => d.remove()); d.showModal();
    const draw = () => {
      const q = searchKey(d.querySelector('#pfQ').value);
      d.querySelector('.mp-list').innerHTML = list.filter((g) => !q || searchKey(g.name).includes(q)).slice(0, 60).map((g) => `<button class="mp-g" data-id="${g.id}">${g.image ? `<img src="${esc(toImageUrl(g.image))}" alt="" onerror="this.remove()">` : '<span>🎮</span>'}<b dir="auto">${esc(g.name)}</b></button>`).join('');
      d.querySelectorAll('.mp-g').forEach((b) => b.onclick = () => { (user().favs ||= []).push(b.dataset.id); save(); d.close(); done(); });
    };
    d.querySelector('#pfQ').oninput = draw; d.querySelector('[data-x]').onclick = () => d.close(); draw();
  }

  // ---------- the card (1080 × 1350, made for Discord / Instagram / WhatsApp) ----------
  async function shareCard() {
    toast('أرسم بطاقتك…');
    const W = 1080, H = 1350, u = user();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily;
    const css = getComputedStyle(document.body);
    const accent = css.getPropertyValue('--accent').trim() || '#7c5cff';
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#141826'); g.addColorStop(1, '#07090e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = accent; x.globalAlpha = 0.18; x.beginPath(); x.arc(W * 0.85, 120, 360, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
    const load = (src) => new Promise(async (r) => { if (!src) return r(null); const dd = await pv.imgData(toImageUrl(src)).catch(() => null); if (!dd) return r(null); const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = dd; });
    const cover = (im, cx, cy, cw, ch, rad = 14, label = '') => {
      x.save(); x.beginPath(); x.roundRect(cx, cy, cw, ch, rad); x.clip();
      if (im) { const s = Math.max(cw / im.width, ch / im.height); x.drawImage(im, cx + (cw - im.width * s) / 2, cy + (ch - im.height * s) / 2, im.width * s, im.height * s); }
      else { x.fillStyle = '#2a3040'; x.fillRect(cx, cy, cw, ch); x.fillStyle = '#fff'; x.font = `700 20px ${font}`; x.textAlign = 'center'; x.fillText(label.slice(0, 12), cx + cw / 2, cy + ch / 2); }
      x.restore();
    };
    // picture + name + bio
    const av = await load(data.settings?.avatar);
    x.save(); x.beginPath(); x.arc(W - 170, 170, 110, 0, Math.PI * 2); x.closePath(); x.fillStyle = '#222838'; x.fill(); x.clip();
    if (av) { const s = Math.max(220 / av.width, 220 / av.height); x.drawImage(av, W - 280 + (220 - av.width * s) / 2, 60 + (220 - av.height * s) / 2, av.width * s, av.height * s); } else { x.fillStyle = '#fff'; x.font = `100px ${font}`; x.textAlign = 'center'; x.fillText('👤', W - 170, 205); }
    x.restore(); x.strokeStyle = accent; x.lineWidth = 8; x.beginPath(); x.arc(W - 170, 170, 112, 0, Math.PI * 2); x.stroke();
    x.direction = 'rtl'; x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = `800 64px ${font}`; x.fillText(u.name || 'لاعب', W - 320, 150);
    x.font = `500 30px ${font}`; x.fillStyle = 'rgba(255,255,255,.7)';
    const bio = (u.bio || 'Silver Bullet').slice(0, 160); const words = bio.split(' '); let line = '', ly = 205;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 640 && line) { x.fillText(line, W - 320, ly); ly += 40; line = w; if (ly > 290) break; } else line = t; }
    if (line && ly <= 290) x.fillText(line, W - 320, ly);
    // numbers
    const stats = [[gamesAll().length, 'لعبة'], [hours(), 'ساعة لعب'], [Object.values(data.tiers || {}).flat().length, 'قيّمتها']];
    stats.forEach(([n, l], k) => { const cx = W - 80 - k * 320 - 140; x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.roundRect(cx - 140, 330, 280, 130, 20); x.fill(); x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `800 54px ${font}`; x.fillText(String(n), cx, 400); x.font = `500 26px ${font}`; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText(l, cx, 440); });
    // favourites
    const row = async (title, items, y, tierTag) => {
      x.textAlign = 'right'; x.fillStyle = '#fff'; x.font = `800 38px ${font}`; x.fillText(title, W - 60, y);
      const cw = 176, ch = 240, gap = 14;
      const ims = await Promise.all(items.slice(0, 5).map((i) => load(i.image || i.icon)));
      ims.forEach((im, k) => { const cx = W - 60 - (k + 1) * (cw + gap) + gap; cover(im, cx, y + 24, cw, ch, 16, items[k].name);
        if (tierTag) { const t = tierOf(items[k].id); if (t) { x.fillStyle = t === 'S' ? '#ff7f7f' : '#ffbf7f'; x.beginPath(); x.roundRect(cx + 8, y + 32, 48, 48, 10); x.fill(); x.fillStyle = '#111'; x.font = `800 32px ${font}`; x.textAlign = 'center'; x.fillText(t, cx + 32, y + 68); } } });
      if (!items.length) { x.fillStyle = 'rgba(255,255,255,.4)'; x.font = `500 28px ${font}`; x.textAlign = 'right'; x.fillText('—', W - 60, y + 80); }
    };
    await row('⭐ ألعابي المفضلة', favs(), 540, false);
    await row('🏆 أعلى تقييماتي', best(), 880, true);
    x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.4)'; x.font = `600 26px ${font}`; x.fillText('Silver Bullet', W / 2, H - 40);
    const url = cv.toDataURL('image/png');
    const file = await pv.saveCard(url, 'بطاقتي');
    const d = document.createElement('dialog'); d.id = 'tlShareDlg';
    d.innerHTML = `<h2>📤 بطاقتك جاهزة</h2><div class="card-prev"><img src="${url}"></div>
      <div class="actions"><button class="btn ghost" data-x>إغلاق</button><span class="spacer"></span><button class="btn ghost" data-f>💾 مكان الصورة</button><button class="btn ghost" data-c>📋 انسخها (للصق في ديسكورد)</button><button class="btn primary" data-p>📲 للجوال</button></div>`;
    document.body.appendChild(d); d.showModal(); d.addEventListener('close', () => d.remove());
    d.querySelector('[data-x]').onclick = () => d.close();
    d.querySelector('[data-f]').onclick = () => pv.showCard(file);
    d.querySelector('[data-c]').onclick = async () => { try { if (!(pv.copyImage && await pv.copyImage(file || url))) { const b = await (await fetch(url)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); } toast('✓ انسخت: الصقها في ديسكورد أو واتساب (Ctrl+V)'); } catch (e) { toast('ما قدرت أنسخها: ' + e.message); } };
    d.querySelector('[data-p]').onclick = () => { d.close(); window.Shots?.sendToPhone([{ game: 'بطاقتي', files: [{ f: file }] }], 'بطاقتي'); };
  }
  window.Profile = { open, shareCard };
  setTimeout(drawBtn, 800);
})();
