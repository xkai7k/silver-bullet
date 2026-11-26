// Rating card: a 1080x1350 picture of your rating, ready for Instagram / X, sent to the phone.
(() => {
  const W = 1080, H = 1350;
  const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function pic(src) { return src ? loadImg(await pv.imgData(toImageUrl(src))) : null; }
  function cover(ctx, img, x, y, w, h) {
    const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function fitText(ctx, text, max, size, weight, font) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${font}`; s -= 2; } while (ctx.measureText(text).width > max && s > 28);
  }
  function wrap(ctx, text, max) {
    const words = text.split(/\s+/), lines = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }

  async function draw(item) {
    const font = getComputedStyle(document.body).fontFamily || 'Tahoma';
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4f8cff';
    const hero = await pic(item.hero || item.image);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.direction = 'rtl';

    // Background: the game's art, blurred, under a dark wash
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, W, H);
    if (hero) { ctx.save(); ctx.filter = 'blur(40px) saturate(1.3)'; cover(ctx, hero, -80, -80, W + 160, H + 160); ctx.restore(); }
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(5,8,14,.35)'); g.addColorStop(.45, 'rgba(5,8,14,.72)'); g.addColorStop(1, 'rgba(5,8,14,.94)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Banner
    const bx = 60, by = 60, bw = W - 120, bh = 520;
    ctx.save(); rounded(ctx, bx, by, bw, bh, 36); ctx.clip();
    if (hero) cover(ctx, hero, bx, by, bw, bh); else { ctx.fillStyle = '#1b2333'; ctx.fillRect(bx, by, bw, bh); }
    g = ctx.createLinearGradient(0, by + bh * .45, 0, by + bh);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
    ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; rounded(ctx, bx, by, bw, bh, 36); ctx.stroke();

    // Score
    const avg = avgRating(item);
    const sx = W - 90;
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    fitText(ctx, item.name, W - 420, 64, 800, font);
    ctx.fillText(item.name, sx, by + bh + 100);
    const mins = playMinutes(item);
    ctx.font = `500 30px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText([item.platformLabel, mins ? `لعبت ${fmtTime(mins)}` : ''].filter(Boolean).join('  •  ') || 'تقييمي', sx, by + bh + 148);

    // Big number in a ring
    const rx = 190, ry = by + bh + 110, rr = 92;
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
    if (avg !== null) {
      ctx.strokeStyle = accent; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (avg / 10)); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 70px ${font}`;
    ctx.fillText(avg !== null ? avg.toFixed(1) : '—', rx, ry + 22);
    ctx.font = `500 24px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText('من 10', rx, ry + 58);

    // Criteria bars
    let y = by + bh + 250;
    const entries = Object.entries(item.ratings || {}).filter(([, v]) => typeof v === 'number').slice(0, 6);
    const barL = 90, barR = W - 300;
    for (const [k, v] of entries) {
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = `700 32px ${font}`;
      ctx.fillText(k, W - 90, y + 12);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; rounded(ctx, barL, y - 6, barR - barL, 22, 11); ctx.fill();
      ctx.fillStyle = accent; rounded(ctx, barR - (barR - barL) * (v / 10), y - 6, Math.max(22, (barR - barL) * (v / 10)), 22, 11); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `700 28px ${font}`;
      ctx.fillText(String(v), barL - 50 < 20 ? 20 : barL - 56, y + 12);
      y += 64;
    }

    // The note
    if (item.ratingNote) {
      y += 10;
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `500 34px ${font}`;
      const lines = wrap(ctx, `«${item.ratingNote}»`, W - 180).slice(0, Math.max(1, Math.floor((H - 130 - y) / 48)));
      for (const l of lines) { ctx.fillText(l, W - 90, y + 20); y += 48; }
    }

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(90, H - 110, W - 180, 2);
    ctx.textAlign = 'right'; ctx.font = `700 28px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText('تقييمي على Silver Bullet', W - 90, H - 58);
    ctx.textAlign = 'left'; ctx.font = `500 26px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillText(new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }), 90, H - 58);
    return c.toDataURL('image/png');
  }

  const dlg = document.createElement('dialog');
  dlg.id = 'cardDlg';
  document.body.appendChild(dlg);
  async function open(item) {
    if (avgRating(item) === null) { toast('قيّم اللعبة أول، وبعدين تطلع لك البطاقة'); openRater(item.id); return; }
    dlg.innerHTML = '<h2>📤 بطاقة التقييم</h2><p class="hint">أرسمها…</p>';
    if (!dlg.open) dlg.showModal();
    let url, file;
    try { url = await draw(item); file = await pv.saveCard(url, item.name); }
    catch (e) { pv.log('card failed: ' + e.message); dlg.innerHTML = '<h2>📤 بطاقة التقييم</h2><p class="hint">ما قدرت أسوي البطاقة.</p><div class="actions"><button class="btn primary" data-x>تم</button></div>'; dlg.querySelector('[data-x]').onclick = () => dlg.close(); return; }
    dlg.innerHTML = `
      <h2>📤 بطاقة التقييم</h2>
      <div class="card-prev"><img src="${url}" alt=""></div>
      <p class="hint">مقاسها يناسب انستقرام وإكس. انحفظت بمجلد الصور ← Silver Bullet Cards.</p>
      <div class="actions">
        <button class="btn ghost" data-folder>📁 افتح المجلد</button>
        <button class="btn ghost" data-x>إغلاق</button>
        <button class="btn primary" data-phone>📲 أرسلها لجوالي</button>
      </div>`;
    dlg.querySelector('[data-x]').onclick = () => dlg.close();
    dlg.querySelector('[data-folder]').onclick = () => pv.showCard(file);
    dlg.querySelector('[data-phone]').onclick = () => { dlg.close(); window.Shots?.sendToPhone([{ game: item.name, files: [{ f: file }] }], item.name); };
  }
  window.RateCard = { open, draw };
})();
