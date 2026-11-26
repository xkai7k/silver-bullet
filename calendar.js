// Calendar page: Gregorian + Hijri (Umm al-Qura), events with reminders and live countdowns.
(() => {
  const HIJ = 'en-u-ca-islamic-umalqura-nu-latn';
  const hFmt = new Intl.DateTimeFormat(HIJ, { day: 'numeric', month: 'numeric', year: 'numeric' });
  const hMonthAr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long' });
  const hFullAr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  const gMonthAr = new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'long' });
  const gFullAr = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const COLORS = ['#4f8cff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'];
  const REMIND = { none: 'بدون تذكير', day: 'قبلها بيوم', week: 'قبلها بأسبوع', both: 'قبلها بأسبوع وبيوم' };
  const REPEAT = { none: 'مرة وحدة', g: 'كل سنة (ميلادي)', h: 'كل سنة (هجري)' };

  // Hijri dates are slow to work out, and the page asks for the same days again and again: remember them
  const hCache = new Map();
  const hParts = (d) => {
    const k = d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
    let v = hCache.get(k);
    if (!v) { const p = Object.fromEntries(hFmt.formatToParts(d).map((x) => [x.type, x.value])); v = { y: +p.year, m: +p.month, d: +p.day }; if (hCache.size > 5000) hCache.clear(); hCache.set(k, v); }
    return v;
  };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => ymd(a) === ymd(b);
  const cfg = () => (data.calendar ||= { mode: 'g', weekStart: 6 });
  const events = () => (data.events ||= []);

  // When an event next happens (repeating ones roll forward to the coming year)
  const occCache = new Map();
  function nextOccur(ev, from = new Date()) {
    if (ev.repeat === 'h') { const k = ev.id + '|' + ev.date + '|' + ev.time + '|' + from.toDateString(); if (occCache.has(k)) return new Date(occCache.get(k)); const r = nextOccurRaw(ev, from); occCache.set(k, +r); return r; }
    return nextOccurRaw(ev, from);
  }
  function nextOccurRaw(ev, from = new Date()) {
    const base = parse(ev.date);
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    let day = base;
    if (ev.repeat === 'g') {
      day = new Date(today.getFullYear(), base.getMonth(), base.getDate());
      if (day < today) day = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate());
    } else if (ev.repeat === 'h') {
      const t = hParts(base);
      day = null;
      for (let i = 0; i < 400; i++) { const c = addDays(today, i); const h = hParts(c); if (h.m === t.m && h.d === t.d) { day = c; break; } }
      day ||= base;
    }
    const [hh, mm] = (ev.time || '00:00').split(':').map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh || 0, mm || 0);
  }
  const occursOn = (ev, d) => {
    const b = parse(ev.date);
    if (ev.repeat === 'g') return b.getMonth() === d.getMonth() && b.getDate() === d.getDate() && d >= new Date(b.getFullYear(), 0, 1);
    if (ev.repeat === 'h') { const x = hParts(b), y = hParts(d); return x.m === y.m && x.d === y.d && d >= b; }
    return sameDay(b, d);
  };

  // ---------- Page ----------
  let anchor = new Date(); // any day inside the month on screen
  let tick = 0;
  function monthDays() {
    if (cfg().mode === 'h') {
      // Hijri month: walk back to its 1st day, then forward until the month changes
      let s = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      while (hParts(s).d !== 1) s = addDays(s, -1);
      const m = hParts(s).m, out = [];
      for (let d = s; hParts(d).m === m; d = addDays(d, 1)) out.push(d);
      return out;
    }
    const y = anchor.getFullYear(), m = anchor.getMonth(), out = [];
    for (let d = new Date(y, m, 1); d.getMonth() === m; d = addDays(d, 1)) out.push(d);
    return out;
  }
  function shiftMonth(dir) {
    const days = monthDays();
    anchor = dir > 0 ? addDays(days[days.length - 1], 1) : addDays(days[0], -1);
    draw();
  }
  function fmtLeft(ms) {
    if (ms <= 0) return { big: 'الحين', parts: [] };
    const s = Math.floor(ms / 1000);
    return { parts: [[Math.floor(s / 86400), 'يوم'], [Math.floor(s / 3600) % 24, 'ساعة'], [Math.floor(s / 60) % 60, 'دقيقة'], [s % 60, 'ثانية']] };
  }

  function draw() {
    const v = $('#view');
    if (!v || page()?.type !== 'calendar') return;
    const c = cfg(), days = monthDays(), today = new Date();
    const first = days[0], last = days[days.length - 1];
    const title = c.mode === 'h'
      ? `${hMonthAr.format(first)} ${hParts(first).y}`
      : `${gMonthAr.format(first)} ${first.getFullYear()}`;
    const sub = c.mode === 'h'
      ? `${gMonthAr.format(first)} – ${gMonthAr.format(last)} ${last.getFullYear()}`
      : `${hMonthAr.format(first)} – ${hMonthAr.format(last)} ${hParts(last).y} هـ`;
    const lead = (first.getDay() - c.weekStart + 7) % 7;
    const order = [...Array(7)].map((_, i) => (c.weekStart + i) % 7);
    const cells = [...Array(lead).fill(null), ...days];
    const upcoming = events().map((e) => ({ e, at: nextOccur(e) })).filter((x) => x.at > Date.now() - 86400000)
      .sort((a, b) => a.at - b.at);

    v.innerHTML = `
      <div class="cal">
        <section class="cal-main">
          <div class="cal-head">
            <button class="btn ghost icon" data-cal="prev" title="الشهر اللي قبل">›</button>
            <div class="cal-title"><h2>${esc(title)}</h2><small>${esc(sub)}</small></div>
            <button class="btn ghost icon" data-cal="next" title="الشهر اللي بعد">‹</button>
            <div class="spacer"></div>
            <button class="btn ghost" data-cal="today">اليوم</button>
            <div class="seg">
              <button class="${c.mode === 'g' ? 'on' : ''}" data-cal="mode-g">ميلادي</button>
              <button class="${c.mode === 'h' ? 'on' : ''}" data-cal="mode-h">هجري</button>
            </div>
            <button class="btn ghost icon" data-cal="settings" title="تخصيص التقويم">⚙</button>
            <button class="btn primary" data-cal="add">+ موعد</button>
          </div>
          <div class="cal-grid">
            ${order.map((d) => `<div class="cal-dow">${DAYS[d]}</div>`).join('')}
            ${cells.map((d) => {
              if (!d) return '<div class="cal-cell empty"></div>';
              const evs = events().filter((e) => occursOn(e, d));
              const h = hParts(d);
              const main = c.mode === 'h' ? h.d : d.getDate(), alt = c.mode === 'h' ? d.getDate() : h.d;
              return `<button class="cal-cell ${sameDay(d, today) ? 'today' : ''} ${d.getDay() === 5 ? 'fri' : ''}" data-day="${ymd(d)}">
                <span class="cal-n">${main}</span><span class="cal-alt">${alt}</span>
                <span class="cal-evs">${evs.slice(0, 3).map((e) => `<i style="--c:${e.color || COLORS[0]}">${esc(e.title)}</i>`).join('')}${evs.length > 3 ? `<i class="more">+${evs.length - 3}</i>` : ''}</span>
              </button>`;
            }).join('')}
          </div>
        </section>
        <aside class="cal-side">
          <div class="cal-today">
            <b>${esc(gFullAr.format(today))}</b>
            <small>${esc(hFullAr.format(today))}</small>
          </div>
          <h3>العد التنازلي</h3>
          <div class="cd-list">
            ${upcoming.length ? upcoming.map(({ e, at }) => `
              <div class="cd" data-ev="${e.id}" style="--c:${e.color || COLORS[0]}">
                <div class="cd-top"><b>${esc(e.title)}</b><small>${esc(gFullAr.format(at))}${e.time ? ' · ' + esc(e.time) : ''}</small></div>
                <div class="cd-time" data-at="${+at}"></div>
                <small class="cd-meta">${esc(hFullAr.format(at))}${e.remind && e.remind !== 'none' ? ' · 🔔 ' + REMIND[e.remind] : ''}${e.repeat && e.repeat !== 'none' ? ' · 🔁' : ''}</small>
              </div>`).join('') : '<div class="empty small">ما فيه مواعيد. اضغط على أي يوم أو "+ موعد" وأضف شي تنتظره.</div>'}
          </div>
        </aside>
      </div>`;

    v.querySelectorAll('[data-cal]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.cal;
        if (a === 'prev') shiftMonth(-1);
        else if (a === 'next') shiftMonth(1);
        else if (a === 'today') { anchor = new Date(); draw(); }
        else if (a === 'mode-g' || a === 'mode-h') { c.mode = a.slice(-1); save(); draw(); }
        else if (a === 'add') openEvent(null, ymd(new Date()));
        else if (a === 'settings') openSettings();
      };
    });
    v.querySelectorAll('.cal-cell[data-day]').forEach((b) => {
      b.onclick = () => {
        const evs = events().filter((e) => occursOn(e, parse(b.dataset.day)));
        if (evs.length === 1) openEvent(evs[0]);
        else if (evs.length > 1) showCtx({ preventDefault() {}, clientX: b.getBoundingClientRect().left + 20, clientY: b.getBoundingClientRect().top + 30 },
          [...evs.map((e) => ({ label: '✎ ' + e.title, run: () => openEvent(e) })), '-', { label: '+ موعد جديد بهاليوم', run: () => openEvent(null, b.dataset.day) }]);
        else openEvent(null, b.dataset.day);
      };
    });
    v.querySelectorAll('.cd[data-ev]').forEach((el) => { el.onclick = () => openEvent(events().find((e) => e.id === el.dataset.ev)); });
    v.onwheel = (e) => { if (!e.target.closest('.cal-grid')) return; e.preventDefault(); const now = Date.now(); if (now - (v._wheelAt || 0) < 350) return; v._wheelAt = now; shiftMonth(e.deltaY > 0 ? 1 : -1); };
    updateCountdowns();
    clearInterval(tick); tick = setInterval(updateCountdowns, 1000);
  }
  function updateCountdowns() {
    const els = document.querySelectorAll('.cd-time[data-at]');
    if (!els.length || page()?.type !== 'calendar') { clearInterval(tick); return; }
    els.forEach((el) => {
      const r = fmtLeft(Number(el.dataset.at) - Date.now());
      el.innerHTML = r.parts.length ? r.parts.map(([n, l]) => `<span><b>${String(n).padStart(2, '0')}</b><small>${l}</small></span>`).join('') : `<span class="now">${r.big}</span>`;
    });
  }

  // ---------- Add / edit dialog ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'evDialog';
  document.body.appendChild(dlg);
  function openEvent(ev, day) {
    const e = ev || { id: '', title: '', date: day || ymd(new Date()), time: '', remind: 'day', repeat: 'none', color: COLORS[0], note: '' };
    dlg.innerHTML = `
      <form method="dialog" class="ev-form">
        <h3>${ev ? 'تعديل الموعد' : 'موعد جديد'}</h3>
        <label>وش الموعد؟<input name="title" required maxlength="80" placeholder="مثلاً: اختبار، سفر، عيد ميلاد…" value="${esc(e.title)}"></label>
        <div class="ev-row">
          <label>اليوم<input type="date" name="date" required value="${e.date}"></label>
          <label>الساعة (اختياري)<input type="time" name="time" value="${e.time || ''}"></label>
        </div>
        <small class="ev-hijri"></small>
        <div class="ev-row">
          <label>التذكير<select name="remind">${Object.entries(REMIND).map(([k, l]) => `<option value="${k}" ${e.remind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>التكرار<select name="repeat">${Object.entries(REPEAT).map(([k, l]) => `<option value="${k}" ${e.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label>ملاحظة<textarea name="note" rows="2" maxlength="400">${esc(e.note || '')}</textarea></label>
        <div class="ev-colors">${COLORS.map((col) => `<label><input type="radio" name="color" value="${col}" ${e.color === col ? 'checked' : ''}><i style="background:${col}"></i></label>`).join('')}</div>
        <div class="ev-actions">
          ${ev ? '<button type="button" class="btn ghost danger" data-del>حذف</button>' : ''}
          <div class="spacer"></div>
          <button type="button" class="btn ghost" data-cancel>إلغاء</button>
          <button class="btn primary">حفظ</button>
        </div>
      </form>`;
    const f = dlg.querySelector('form');
    const showHijri = () => { try { dlg.querySelector('.ev-hijri').textContent = f.date.value ? '📅 ' + hFullAr.format(parse(f.date.value)) + ' هـ' : ''; } catch {} };
    f.date.oninput = showHijri; showHijri();
    dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
    const del = dlg.querySelector('[data-del]');
    if (del) del.onclick = () => { data.events = events().filter((x) => x.id !== e.id); save(); dlg.close(); draw(); toast('انحذف الموعد'); };
    f.onsubmit = () => {
      const val = { title: f.title.value.trim(), date: f.date.value, time: f.time.value, remind: f.remind.value, repeat: f.repeat.value, note: f.note.value.trim(), color: f.color.value || COLORS[0] };
      if (!val.title || !val.date) return;
      if (ev) { Object.assign(ev, val); ev.notified = {}; } else events().push({ id: uid(), ...val, notified: {} });
      save(); draw(); checkReminders();
      toast(ev ? 'انحفظ التعديل' : '✓ انضاف الموعد');
    };
    dlg.showModal();
    f.title.focus();
  }

  function openSettings() {
    const c = cfg();
    dlg.innerHTML = `
      <form method="dialog" class="ev-form">
        <h3>تخصيص التقويم</h3>
        <label>التقويم الأساسي<select name="mode"><option value="g" ${c.mode === 'g' ? 'selected' : ''}>ميلادي (والهجري صغير جنبه)</option><option value="h" ${c.mode === 'h' ? 'selected' : ''}>هجري (أم القرى، والميلادي صغير جنبه)</option></select></label>
        <label>أول يوم بالأسبوع<select name="ws">${[6, 0, 1].map((d) => `<option value="${d}" ${c.weekStart === d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" name="home" ${c.home !== false ? 'checked' : ''}> اعرض أقرب موعد تحت التاريخ في الرئيسية</label>
        <div class="ev-actions"><div class="spacer"></div><button type="button" class="btn ghost" data-cancel>إلغاء</button><button class="btn primary">حفظ</button></div>
      </form>`;
    const f = dlg.querySelector('form');
    dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
    f.onsubmit = () => { c.mode = f.mode.value; c.weekStart = Number(f.ws.value); c.home = f.home.checked; save(); draw(); window.render?.(); };
    dlg.showModal();
  }

  // ---------- Reminders (checked every minute; Preview starts with Windows if you turn that on) ----------
  function notify(title, body) {
    toast(`🔔 ${title} — ${body}`);
    try { new Notification(title, { body, silent: false }); } catch {}
    pv.log(`reminder: ${title} — ${body}`);
  }
  function checkReminders() {
    const now = Date.now();
    let changed = false;
    for (const e of events()) {
      if (!e.remind || e.remind === 'none') continue;
      const at = nextOccur(e, new Date(now - 86400000)); // still "today" until the day ends
      const key = ymd(at);
      e.notified ||= {};
      const marks = [];
      if (e.remind === 'week' || e.remind === 'both') marks.push(['w', 7, 'باقي أسبوع']);
      if (e.remind === 'day' || e.remind === 'both') marks.push(['d', 1, 'بكرة']);
      marks.push(['0', 0, 'اليوم']);
      for (const [k, days, label] of marks) {
        const when = new Date(at.getFullYear(), at.getMonth(), at.getDate() - days, days ? 9 : 0, 0).getTime();
        const id = key + k;
        if (now >= when && now < at.getTime() + 86400000 && !e.notified[id]) {
          // only the most recent stage: don't fire "a week left" when it's already tomorrow
          const later = marks.filter(([, dd]) => dd < days).some(([, dd]) => now >= new Date(at.getFullYear(), at.getMonth(), at.getDate() - dd, dd ? 9 : 0).getTime());
          e.notified[id] = true; changed = true;
          if (!later) notify(e.title, `${label}${e.time ? ' الساعة ' + e.time : ''} (${gFullAr.format(at)})`);
        }
      }
    }
    if (changed) save();
  }

  // Closest event, for the home screen subtitle
  window.nextEventLine = () => {
    if (cfg().home === false) return '';
    const up = events().map((e) => ({ e, at: nextOccur(e) })).filter((x) => x.at > Date.now()).sort((a, b) => a.at - b.at)[0];
    if (!up) return '';
    const days = Math.ceil((new Date(up.at.getFullYear(), up.at.getMonth(), up.at.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    return `📅 ${up.e.title} ${days <= 0 ? 'اليوم' : days === 1 ? 'بكرة' : `بعد ${days} يوم`}`;
  };
  window.Calendar = { render: draw, add: (day) => openEvent(null, day),
    // the next few events with their time left (for the little countdown under the calendar card on the home screen)
    upcoming: (n = 3) => events().map((e) => ({ e, at: nextOccur(e) })).filter((x) => x.at && x.at > Date.now()).sort((a, b) => a.at - b.at).slice(0, n)
      .map(({ e, at }) => ({ title: e.title, color: e.color, at, left: ((f) => f.big || f.parts.filter(([n], i) => n || i >= 2).map(([n, w]) => `${n} ${w}`).join(' · '))(fmtLeft(at - Date.now())) })) };
  setTimeout(checkReminders, 8000);
  setInterval(checkReminders, 60000);
})();
