// Controllers & devices: battery chips (Bluetooth + PlayStation pads), the controller center,
// PlayStation light bar / rumble, and the custom control settings (controller, keyboard, mouse).
(() => {
  // ---------- default controls ----------
  const PAD_NAMES = { 0: 'A / ✕', 1: 'B / ○', 2: 'X / □', 3: 'Y / △', 4: 'LB / L1', 5: 'RB / R1', 6: 'LT / L2', 7: 'RT / R2', 8: 'Back / Share', 9: 'Start / Options', 10: 'L3', 11: 'R3', 16: 'Home / PS' };
  const ACTIONS = {
    ok: 'تشغيل / اختيار', back: 'رجوع', menu: 'القائمة ☰', voice: 'أمر صوتي', music: 'الألحان (تشغيل/إيقاف)',
    prevTheme: 'الثيم السابق', nextTheme: 'الثيم التالي', home: 'الرئيسية',
  };
  const DEFAULTS = {
    pad: { ok: 0, back: 1, music: 2, voice: 3, prevTheme: 4, nextTheme: 5, menu: 9, home: 16 },
    keys: { ok: 'Enter', back: 'Escape', menu: 'm', voice: 'v', music: 'p', prevTheme: '[', nextTheme: ']', home: 'h' },
    mouse: { side1: 'back', side2: 'ok', wheelStrip: true, clickPlays: false },
  };
  window.controls = () => {
    data.controls ||= {};
    for (const k of Object.keys(DEFAULTS)) data.controls[k] = { ...DEFAULTS[k], ...(data.controls[k] || {}) };
    return data.controls;
  };

  // ---------- battery chips ----------
  const chips = document.createElement('div');
  chips.id = 'battery';
  document.querySelector('.topbar .spacer')?.after(chips);
  let btList = [], padBattery = null, wireless = [];
  const iconFor = (n) => /head|bud|air|pods|sound|audio|سماع|wh-|wf-|jbl|beats/i.test(n) ? '🎧'
    : /controller|gamepad|xbox|dualsense|dualshock|wireless controller|ds4/i.test(n) ? '🎮'
    : /mouse|ماوس|mx /i.test(n) ? '🖱' : /keyboard|كيبورد/i.test(n) ? '⌨' : '🔋';
  function drawChips() {
    const all = [...btList.map((d) => ({ name: d.name, pct: d.battery, approx: d.approx, wired: d.wired })), ...(padBattery ? [padBattery] : [])];
    // wireless things that don't tell their battery still show up (just the icon; hover for the name)
    const flat = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean).map((g) => ({ name: g.id.replace(/\s*\(.*$/, ''), kind: 'pad' }));
    for (const w of [...wireless, ...pads]) {
      if (w.kind === 'receiver' || w.kind === 'phone' || w.wired) continue;
      if (all.some((a) => flat(a.name).includes(flat(w.name).slice(0, 8)) || flat(w.name).includes(flat(a.name).slice(0, 8)) || (w.kind === 'pad' && /controller|xbox|dualsense|wireless controller/i.test(a.name)))) continue;
      all.push({ name: w.name, pct: null });
    }
    if (all.length > 6) all.length = 6;
    chips.innerHTML = all.map((d) => `<span class="bchip ${d.pct != null && d.pct <= 20 ? 'low' : ''}" title="${esc(d.name)}${d.charging ? ' (يشحن)' : ''}">
      ${iconFor(d.name)}${d.wired ? ' 🔌' : d.pct == null ? '' : d.approx ? ` ~${d.pct}%` : ` ${d.pct}%`}${d.charging ? '⚡' : ''}</span>`).join('');
  }
  // ---------- low battery: one alert at 30% (again at 15%), bottom-left, even while you're in a game ----------
  // remembered between launches, so opening the app again doesn't repeat the same alert
  const warned = (() => { try { return JSON.parse(localStorage.getItem('sb-lowbat') || '{}'); } catch { return {}; } })();
  const keepWarned = () => { try { localStorage.setItem('sb-lowbat', JSON.stringify(warned)); } catch {} };
  function lowBatteryCheck(list) {
    for (const d of list) {
      const k = d.name, w = warned[k] || 0;
      if (d.pct == null || d.wired) continue; // no level known (a cable, or a device that doesn't tell): never a false alarm
      if (d.charging || d.pct > 35) { if (warned[k]) { delete warned[k]; keepWarned(); } continue; }
      const level = d.pct <= 15 ? 2 : d.pct <= 30 ? 1 : 0;
      if (level > w) {
        warned[k] = level; keepWarned();
        const msg = `${d.name}: باقي ${d.pct}% — اشحنه ${level === 2 ? 'الحين' : 'قريب'}`;
        // over a game: a small note in the bottom-left that shows on top of it; in the app: the usual card
        if (!document.hasFocus() && pv.overlayNote) pv.overlayNote(iconFor(d.name), 'الشحن قرب يخلص', `${d.name} · ${d.pct}%`); else try { new Notification('🔋 الشحن قرب يخلص', { body: msg, silent: false }); } catch {}
        let box = document.getElementById('lowBat');
        if (!box) { box = document.createElement('div'); box.id = 'lowBat'; document.body.appendChild(box); }
        box.innerHTML = `<span class="lb-ico">${iconFor(d.name)}</span><div><b>الشحن قرب يخلص</b><small>${esc(d.name)} · ${d.pct}%</small></div><i style="--p:${d.pct}%"></i>`;
        box.classList.add('show');
        clearTimeout(box._t); box._t = setTimeout(() => box.classList.remove('show'), 12000);
        box.onclick = () => box.classList.remove('show');
        pv.log('low battery ' + msg);
      }
    }
  }
  async function refreshBattery() {
    if (!inElectron) return;
    if (!refreshBattery.asked) { refreshBattery.asked = true; pv.log('battery: asking'); }
    try { btList = await pv.btBattery(); if (!Array.isArray(btList)) btList = []; } catch (e) { btList = []; pv.log('battery error ' + e.message); }
    drawChips();
    lowBatteryCheck([...btList.map((d) => ({ name: d.name, pct: d.battery })), ...(padBattery ? [padBattery] : [])]);
    if (!refreshBattery.logged) { refreshBattery.logged = true; pv.log(`battery: ${JSON.stringify(btList)}`); }
  }

  // ---------- PlayStation pads over WebHID ----------
  let hid = null, hidInfo = null; // { type: 'ds4'|'ds5', bt: bool }
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const hexToRgb = (h) => { const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h || ''); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [80, 120, 255]; };
  const accentHex = () => {
    const c = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    if (c.startsWith('#')) return c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c;
    const m = c.match(/\d+/g); return m ? '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('') : '#5078ff';
  };

  async function attach(dev) {
    try {
      if (!dev.opened) await dev.open();
      hid = dev;
      hidInfo = { type: [0x0ce6, 0x0df2].includes(dev.productId) ? 'ds5' : 'ds4', bt: null };
      try { await dev.receiveFeatureReport(hidInfo.type === 'ds4' ? 0x05 : 0x05); } catch {} // asks a Bluetooth pad for full reports
      dev.addEventListener('inputreport', onReport);
      pv.log(`pad: ${dev.productName} (${hidInfo.type})`);
      setTimeout(() => syncLight(), 600);
      drawCenter();
    } catch (e) { pv.log(`pad attach failed: ${e.message}`); }
  }
  let lastBatteryDraw = 0;
  function onReport(e) {
    const d = e.data, id = e.reportId;
    if (hidInfo.bt === null) hidInfo.bt = id === 0x11 || id === 0x31;
    let level = null, charging = false;
    if (hidInfo.type === 'ds4') {
      const b = id === 0x11 ? d.getUint8(31) : id === 0x01 && d.byteLength > 30 ? d.getUint8(29) : null;
      if (b !== null) { charging = !!(b & 0x10); level = Math.min(100, Math.round((b & 0x0f) * (charging ? 100 / 11 : 100 / 8))); }
    } else {
      const off = id === 0x31 ? 53 : id === 0x01 && d.byteLength > 53 ? 52 : null;
      if (off !== null) { const b = d.getUint8(off); level = Math.min(100, (b & 0x0f) * 10 + 5); charging = ((b & 0xf0) >> 4) === 1; }
    }
    if (level !== null && Date.now() - lastBatteryDraw > 5000) {
      lastBatteryDraw = Date.now();
      padBattery = { name: hid.productName || 'PlayStation Controller', pct: level, charging };
      drawChips();
      lowBatteryCheck([padBattery]);
      const el = document.getElementById('pcBattery'); if (el) el.textContent = `${level}%${charging ? ' ⚡ يشحن' : ''}`;
    }
  }
  async function output({ rgb = null, rumble = [0, 0] } = {}) {
    if (!hid) return false;
    const [r, g, b] = rgb || hexToRgb(data.pad?.color || accentHex());
    try {
      if (hidInfo.type === 'ds4' && !hidInfo.bt) {
        const p = new Uint8Array(31); p[0] = 0x07; p[3] = rumble[1]; p[4] = rumble[0]; p[5] = r; p[6] = g; p[7] = b;
        await hid.sendReport(0x05, p);
      } else if (hidInfo.type === 'ds4' && hidInfo.bt) {
        const p = new Uint8Array(77); p[0] = 0xa2; p[1] = 0x11; p[2] = 0xc0; p[3] = 0x20; p[4] = 0x07; p[7] = rumble[1]; p[8] = rumble[0]; p[9] = r; p[10] = g; p[11] = b;
        const c = crc32(p.subarray(0, 73)); p[73] = c & 0xff; p[74] = (c >>> 8) & 0xff; p[75] = (c >>> 16) & 0xff; p[76] = (c >>> 24) & 0xff;
        await hid.sendReport(0x11, p.subarray(2));
      } else if (hidInfo.type === 'ds5' && !hidInfo.bt) {
        const p = new Uint8Array(47); p[0] = 0x03; p[1] = 0x04; p[2] = rumble[1]; p[3] = rumble[0]; p[43] = 0x02; p[44] = r; p[45] = g; p[46] = b;
        await hid.sendReport(0x02, p);
      } else {
        const p = new Uint8Array(79); p[0] = 0xa2; p[1] = 0x31; p[2] = 0x10; p[3] = 0x03; p[4] = 0x04; p[5] = rumble[1]; p[6] = rumble[0]; p[46] = 0x02; p[47] = r; p[48] = g; p[49] = b;
        const c = crc32(p.subarray(0, 75)); p[75] = c & 0xff; p[76] = (c >>> 8) & 0xff; p[77] = (c >>> 16) & 0xff; p[78] = (c >>> 24) & 0xff;
        await hid.sendReport(0x31, p.subarray(2));
      }
      return true;
    } catch (e) { pv.log(`pad output failed: ${e.message}`); return false; }
  }
  function syncLight() { if (hid && (data.pad?.autoColor ?? true)) output({ rgb: hexToRgb(accentHex()) }); else if (hid) output(); }
  async function connectPad() {
    if (!navigator.hid) return toast('هذي الميزة تشتغل داخل البرنامج');
    try {
      const [dev] = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x054c }] });
      if (dev) await attach(dev); else toast('ما لقيت يد بلايستيشن متصلة');
    } catch (e) { toast('ما قدرت أوصل لليد'); pv.log(`pad request failed: ${e.message}`); }
  }

  // ---------- controller center ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'padCenter';
  document.body.appendChild(dlg);
  let liveTimer = null;
  async function drawCenter() {
    if (!dlg.open) return;
    const ds4 = inElectron ? await pv.ds4Path() : null;
    data.pad ||= { autoColor: true, color: '#5078ff' };
    dlg.innerHTML = `
      <h2>🎮 مركز اليد والأجهزة</h2>
      <div class="pc-sec">
        <h3>جرّب يدك</h3>
        <div id="pcPads"><p class="hint">حرّك اليد أو اضغط أي زر عشان تظهر هنا.</p></div>
        <div class="pc-row"><button class="btn primary" id="pcStandard">✓ اضبطها على الإعدادات العادية</button>
          <span class="hint">A / ✕ للاختيار والدخول، B / ○ للرجوع، والباقي على المعتاد.</span></div>
      </div>
      <div class="pc-sec">
        <h3>يد بلايستيشن (DualShock 4 / DualSense)</h3>
        ${hid ? `<div class="pc-row"><b>${esc(hid.productName || 'PlayStation Controller')}</b> <span class="pc-tag">${hidInfo.bt ? 'بلوتوث' : 'سلك'}</span>
            <span>الشحن: <b id="pcBattery">${padBattery ? `${padBattery.pct}%` : '…'}</b></span></div>
          <div class="pc-row"><label class="check"><input type="checkbox" id="pcAuto" ${data.pad.autoColor ? 'checked' : ''}> لون الضوء يمشي مع الثيم</label>
            <input type="color" id="pcColor" value="${data.pad.color}" ${data.pad.autoColor ? 'disabled' : ''}>
            <button class="btn ghost" id="pcRumble">📳 جرّب الاهتزاز</button></div>`
          : `<p class="hint">اربط يد البلايستيشن عشان تشوف شحنها وتغيّر لون ضوئها.</p><button class="btn primary" id="pcConnect">ربط يد بلايستيشن</button>`}
      </div>
      <div class="pc-sec">
        <h3>شحن أجهزة البلوتوث</h3>
        <div>${btList.length ? btList.map((d) => `<div class="pc-row">${iconFor(d.name)} ${esc(d.name)} <b>${d.wired ? '🔌 على السلك' : d.battery == null ? '—' : d.approx ? `~${d.battery}%` : `${d.battery}%`}</b></div>`).join('') : '<p class="hint">ما فيه أجهزة بلوتوث تعطي ويندوز نسبة شحنها حالياً (السماعات غالباً تظهر، وبعض الأيادي والماوسات ما تظهر).</p>'}</div>
      </div>
      <div class="pc-sec">
        <h3>DS4Windows</h3>
        <p class="hint">يخلي يد البلايستيشن تشتغل في كل الألعاب كأنها يد إكس بوكس. أول تشغيل يطلب منك يثبّت تعريف ViGEmBus و.NET، وهذي تحتاج موافقتك.</p>
        ${ds4 ? `<button class="btn primary" id="pcDs4">تشغيل DS4Windows</button>` : '<p class="hint">يتجهز… افتح البرنامج من جديد بعد شوي.</p>'}
      </div>
      <div class="actions"><button class="btn ghost" id="pcClose">تم</button><button class="btn ghost" id="pcSettings">⚙ تخصيص الأزرار</button></div>`;
    dlg.querySelector('#pcClose').onclick = () => dlg.close();
    dlg.querySelector('#pcStandard').onclick = async () => {
      data.controls = { ...(data.controls || {}), pad: { ...DEFAULTS.pad } }; controls(); save();
      const r = await (pv.padStandard?.() || Promise.resolve({}));
      toast(r?.cemu ? '✓ رجعت الأزرار العادية، وعدّلت محاكي Wii U عشان A يختار وB يرجع' : '✓ رجعت الأزرار للعادي: A يختار وB يرجع');
    };
    dlg.querySelector('#pcSettings').onclick = () => { dlg.close(); openSettings('controls'); };
    dlg.querySelector('#pcConnect')?.addEventListener('click', connectPad);
    dlg.querySelector('#pcDs4')?.addEventListener('click', () => pv.launch(ds4));
    dlg.querySelector('#pcRumble')?.addEventListener('click', async () => { await output({ rumble: [200, 120] }); setTimeout(() => output(), 500); });
    dlg.querySelector('#pcAuto')?.addEventListener('change', (e) => { data.pad.autoColor = e.target.checked; save(); dlg.querySelector('#pcColor').disabled = e.target.checked; syncLight(); });
    dlg.querySelector('#pcColor')?.addEventListener('input', (e) => { data.pad.color = e.target.value; save(); output(); });
  }
  // A drawn controller that lights up as you press: buttons glow, sticks move, triggers fill
  const PAD_SVG = `
    <svg class="pad-svg" viewBox="0 0 520 330">
      <path class="pad-body" d="M150 70 Q120 70 98 92 Q40 150 28 250 Q22 312 70 318 Q110 322 140 270 L170 226 Q190 206 220 206 L300 206 Q330 206 350 226 L380 270 Q410 322 450 318 Q498 312 492 250 Q480 150 422 92 Q400 70 370 70 Z"/>
      <rect id="pb6" class="pad-trig" x="96" y="22" width="80" height="26" rx="10"/><rect id="pb6f" class="pad-trig-fill" x="96" y="22" width="0" height="26" rx="10"/>
      <rect id="pb7" class="pad-trig" x="344" y="22" width="80" height="26" rx="10"/><rect id="pb7f" class="pad-trig-fill" x="344" y="22" width="0" height="26" rx="10"/>
      <rect id="pb4" class="pad-btn" x="104" y="54" width="86" height="18" rx="9"/><rect id="pb5" class="pad-btn" x="330" y="54" width="86" height="18" rx="9"/>
      <g class="pad-stick-ring"><circle cx="150" cy="140" r="34"/><circle cx="318" cy="214" r="34"/></g>
      <circle id="ps0" class="pad-stick" cx="150" cy="140" r="22"/><circle id="ps1" class="pad-stick" cx="318" cy="214" r="22"/>
      <g id="pdpad"><rect id="pb12" class="pad-btn" x="190" y="172" width="22" height="26" rx="4"/><rect id="pb13" class="pad-btn" x="190" y="222" width="22" height="26" rx="4"/>
        <rect id="pb14" class="pad-btn" x="162" y="198" width="28" height="24" rx="4"/><rect id="pb15" class="pad-btn" x="212" y="198" width="28" height="24" rx="4"/></g>
      <circle id="pb3" class="pad-btn face" cx="400" cy="108" r="17"/><text x="400" y="114" class="pad-lbl">Y</text>
      <circle id="pb2" class="pad-btn face" cx="368" cy="140" r="17"/><text x="368" y="146" class="pad-lbl">X</text>
      <circle id="pb1" class="pad-btn face" cx="432" cy="140" r="17"/><text x="432" y="146" class="pad-lbl">B</text>
      <circle id="pb0" class="pad-btn face" cx="400" cy="172" r="17"/><text x="400" y="178" class="pad-lbl">A</text>
      <rect id="pb8" class="pad-btn" x="222" y="124" width="26" height="14" rx="7"/><rect id="pb9" class="pad-btn" x="272" y="124" width="26" height="14" rx="7"/>
      <circle id="pb16" class="pad-btn" cx="260" cy="92" r="14"/>
    </svg>
    <div class="pad-name"></div><div class="pad-last">اضغط أي زر…</div>`;
  let lastPressed = '';
  function livePads() {
    const box = document.getElementById('pcPads');
    if (!box || !dlg.open) return;
    const p = [...(navigator.getGamepads?.() || [])].filter(Boolean)[0];
    if (!p) { if (!box.querySelector('.hint')) box.innerHTML = '<p class="hint">حرّك اليد أو اضغط أي زر عشان تظهر هنا.</p>'; return; }
    if (!box.querySelector('.pad-svg')) box.innerHTML = PAD_SVG;
    const ps = /054c|playstation|dualsense|dualshock|wireless controller/i.test(p.id);
    box.classList.toggle('ps', ps);
    const lbl = box.querySelectorAll('.pad-lbl');
    if (lbl.length === 4) { const L = ps ? ['△', '□', '○', '✕'] : ['Y', 'X', 'B', 'A']; lbl.forEach((t, i) => { t.textContent = L[i]; }); }
    box.querySelector('.pad-name').textContent = p.id.replace(/\(.*?\)/g, '').trim() || 'يد تحكم';
    p.buttons.forEach((b, i) => {
      const el = box.querySelector('#pb' + i); if (el) el.classList.toggle('on', b.pressed || b.value > 0.5);
      if (b.pressed && lastPressed !== i) { lastPressed = i; box.querySelector('.pad-last').textContent = `ضغطت: ${PAD_NAMES[i] || 'زر ' + i}${controls().pad ? (Object.entries(controls().pad).find(([, v]) => v === i) ? ` ← ${ACTIONS[Object.entries(controls().pad).find(([, v]) => v === i)[0]]}` : '') : ''}`; }
    });
    [6, 7].forEach((i) => { const f = box.querySelector(`#pb${i}f`); if (f) f.setAttribute('width', String(80 * (p.buttons[i]?.value || 0))); });
    [[0, 150, 140], [1, 318, 214]].forEach(([n, cx, cy]) => {
      const s2 = box.querySelector('#ps' + n); if (!s2) return;
      s2.setAttribute('cx', String(cx + (p.axes[n * 2] || 0) * 14)); s2.setAttribute('cy', String(cy + (p.axes[n * 2 + 1] || 0) * 14));
      s2.classList.toggle('on', !!p.buttons[10 + n]?.pressed || Math.hypot(p.axes[n * 2] || 0, p.axes[n * 2 + 1] || 0) > 0.3);
    });
  }
  window.openPadCenter = () => { dlg.showModal(); drawCenter(); clearInterval(liveTimer); liveTimer = setInterval(livePads, 50); refreshBattery().then(drawCenter); };
  dlg.addEventListener('close', () => clearInterval(liveTimer));

  // ---------- custom controls (settings tab) ----------
  window.renderControlSettings = (box) => {
    const c = controls();
    const padSel = (act) => `<select data-pad="${act}"><option value="">—</option>${Object.entries(PAD_NAMES).map(([i, n]) => `<option value="${i}" ${String(c.pad[act]) === i ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    const mouseSel = (k) => `<select data-mouse="${k}"><option value="">لا شي</option>${Object.entries(ACTIONS).map(([a, n]) => `<option value="${a}" ${c.mouse[k] === a ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    box.innerHTML = `
      <h3>🎮 اليد</h3>
      <div class="ctl-grid">${Object.entries(ACTIONS).map(([a, n]) => `<span>${n}</span>${padSel(a)}`).join('')}</div>
      <p class="hint">الأسهم وعصا التحكم اليسار للتنقل دايماً.</p>
      <h3>⌨ الكيبورد</h3>
      <div class="ctl-grid">${Object.entries(ACTIONS).map(([a, n]) => `<span>${n}</span><button type="button" class="btn ghost keycap" data-key="${a}">${esc(c.keys[a] || '—')}</button>`).join('')}</div>
      <p class="hint">اضغط على الزر ثم اضغط المفتاح اللي تبغاه. (Delete يمسحه)</p>
      <h3>🖱 الماوس</h3>
      <div class="ctl-grid">
        <span>زر الماوس الجانبي الخلفي</span>${mouseSel('side1')}
        <span>زر الماوس الجانبي الأمامي</span>${mouseSel('side2')}
      </div>
      <label class="check"><input type="checkbox" data-opt="wheelStrip" ${c.mouse.wheelStrip ? 'checked' : ''}> عجلة الماوس تتنقل بين الصفحات في الرئيسية</label>
      <label class="check"><input type="checkbox" data-opt="clickPlays" ${c.mouse.clickPlays ? 'checked' : ''}> الضغط على اللعبة يشغّلها على طول (بدل صفحة اللعبة)</label>
      <div class="actions"><button type="button" class="btn ghost" id="ctlReset">↺ رجّع الافتراضي</button></div>`;
    box.querySelectorAll('[data-pad]').forEach((s) => s.onchange = () => { c.pad[s.dataset.pad] = s.value === '' ? null : Number(s.value); save(); });
    box.querySelectorAll('[data-mouse]').forEach((s) => s.onchange = () => { c.mouse[s.dataset.mouse] = s.value; save(); });
    box.querySelectorAll('[data-opt]').forEach((s) => s.onchange = () => { c.mouse[s.dataset.opt] = s.checked; save(); });
    box.querySelectorAll('.keycap').forEach((b) => b.onclick = () => {
      b.textContent = 'اضغط مفتاح…'; b.classList.add('wait');
      const h = (e) => {
        e.preventDefault(); e.stopImmediatePropagation();
        window.removeEventListener('keydown', h, true);
        c.keys[b.dataset.key] = e.key === 'Delete' ? '' : e.key; save();
        b.textContent = c.keys[b.dataset.key] || '—'; b.classList.remove('wait');
      };
      window.addEventListener('keydown', h, true);
    });
    box.querySelector('#ctlReset').onclick = () => { data.controls = {}; controls(); save(); window.renderControlSettings(box); toast('رجعت الأزرار للافتراضي'); };
  };

  window.Pad = {
    init() {
      controls();
      data.pad ||= { autoColor: true, color: '#5078ff' };
      refreshBattery();
      setInterval(refreshBattery, 90000);
      window.addEventListener('gamepadconnected', () => drawChips());
      window.addEventListener('gamepaddisconnected', () => drawChips());
      navigator.hid?.getDevices().then((ds) => { const d = ds.find((x) => x.vendorId === 0x054c); if (d) attach(d); }).catch(() => {});
      navigator.hid?.addEventListener('connect', (e) => { if (e.device.vendorId === 0x054c) attach(e.device); });
      navigator.hid?.addEventListener('disconnect', (e) => { if (e.device === hid) { hid = null; padBattery = null; drawChips(); } });
    },
    syncLight,
    setWireless(list) { wireless = list || []; drawChips(); },
    PAD_NAMES, ACTIONS,
  };
})();
