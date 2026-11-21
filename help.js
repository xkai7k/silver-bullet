// "?" button: everything you need to do once so Silver Bullet is fully set up, with live ticks.
(() => {
  const dlg = document.createElement('dialog');
  dlg.id = 'helpDlg';
  document.body.appendChild(dlg);

  async function open() {
    dlg.innerHTML = '<h2>؟ كيف تضبط Silver Bullet</h2><p class="hint">أشيّك على جهازك…</p>';
    if (!dlg.open) dlg.showModal();
    const [emus, bios] = await Promise.all([pv.emuCatalog().catch(() => []), pv.biosStatus().catch(() => ({}))]);
    const s = data.settings || {};
    const emuReady = emus.filter((e) => e.exe).length;
    const romGames = allItems().filter((i) => i.rom).length;
    const pcGames = (page('games')?.items || []).filter((i) => !i.rom).length;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean)[0] : null;
    const steps = [
      { g: 1, ok: !!s.autostart, icon: '⚡', t: 'خلّ البرنامج يفتح مع الجهاز', d: 'عشان يكون جاهز أول ما تشغّل الكمبيوتر، وتوصلك تذكيرات التقويم حتى لو نسيت تفتحه.', btn: [s.autostart ? 'مفعّل ✓' : 'فعّله الحين', async () => { data.settings.autostart = true; save(); await pv.autostart(true); toast('Silver Bullet بيشتغل مع ويندوز'); open(); }] },
      { g: 1, ok: pcGames > 0, icon: '🎮', t: `ألعاب ستيم وإبيك (${pcGames} لعبة)`, d: 'تنضاف لحالها، وأي لعبة جديدة تثبتها تطلع بعد شوي. لو تبي تحدّثها الحين اضغط الزر.', btn: ['حدّث الحين', () => { const g = page('games'); if (g) { runImport('steam', g); runImport('epic', g); } }] },
      { g: 1, ok: emuReady >= emus.length - 1 && emus.length > 0, icon: '🕹️', t: `المحاكيات (${emuReady} من ${emus.length} جاهزة)`, d: 'كلها تنزل وتتجهز لحالها. لو فيه ناقص اضغط الزر.', btn: ['حمّل الناقص', () => { dlg.close(); installEmulators(); }] },
      { g: 1, ok: !!(bios.ps1 && bios.ps2), icon: '🧩', t: `ملف البايوس (BIOS) لبلايستيشن ١ و٢ — ١: ${bios.ps1 ? '✓ موجود' : 'ناقص'} · ٢: ${bios.ps2 ? '✓ موجود' : 'ناقص'}`,
        d: 'وش هو؟ ملف صغير من داخل جهاز البلايستيشن نفسه، المحاكي يحتاجه عشان يشغّل الألعاب (زي "عقل" الجهاز). ما ينزل مع المحاكي لأنه ملك سوني، فلازم يكون من جهازك. وش تسوي؟ (١) جيب الملف: لبلايستيشن ١ اسمه غالباً يبدأ بـ scph وحجمه ٥١٢ كيلو، ولبلايستيشن ٢ حجمه ٤ ميقا. (٢) اضغط الزر تحت يفتح لك مجلد bios، وانسخ الملف فيه. (٣) خلاص، البرنامج ينقله للمحاكي لحاله، وهالسطر يصير ✓. باقي الأجهزة (نينتندو، PSP، سيغا…) ما تحتاجه أبد.', btn: ['افتح مجلد BIOS', () => pv.romsFolder('bios')] },
      { g: 1, ok: !!(bios.switchKeys && bios.switchFw), icon: '🎮', t: `نينتندو سويتش — المفاتيح: ${bios.switchKeys ? '✓' : 'ناقصة'} · الفيرموير: ${bios.switchFw ? '✓' : 'ناقص'}`,
        d: 'محاكي السويتش (Ryujinx) يحتاج شيئين تطلعهم من جهاز السويتش حقك (مثل البايوس، ما ينزلون مع المحاكي): (١) ملف prod.keys، حطه في مجلد BIOS والبرنامج يوزعه لحاله. (٢) الفيرموير: مرة وحدة من Ryujinx ← Tools ← Install Firmware. بعدها أي لعبة سويتش تحملها (حتى NSZ) تتحول وتنضاف للمكتبة، والتحديثات والـDLC تنحط في مكانها لحالها.', btn: ['افتح مجلد BIOS', () => pv.romsFolder('bios')] },
            { g: 1, ok: romGames > 0, icon: '💿', t: `ألعاب الأجهزة (${romGames} لعبة)`, d: 'نزّل اللعبة عادي (حتى لو مضغوطة zip أو rar أو 7z)، وتنضاف لحالها لصفحة الألعاب. تفتحها ويشتغل المحاكي المناسب على طول بملء الشاشة. تقدر بعد تسحبها وتفلتها على البرنامج، أو تحطها في مجلد الألعاب.', btn: ['افتح مجلد الألعاب', () => pv.romsFolder('games')] },
      { g: 1, ok: null, icon: '🎵', t: 'سجّل دخولك في سبوتيفاي (مرة وحدة)', d: 'افتح صفحة سبوتيفاي داخل البرنامج وسجّل دخولك بحسابك. بعدها يشتغل كل مرة، وتتحكم فيه من الشريط اللي فوق.', btn: ['افتح سبوتيفاي', () => { dlg.close(); openSpotify(); }] },
      { g: 1, ok: !!pad, icon: '🕹', t: pad ? 'يد التحكم متصلة' : 'يد التحكم', d: 'الأسهم أو العصا للتنقل، A للتشغيل، B للرجوع. تقدر تغيّر الأزرار من الإعدادات ← التحكم. يد بلايستيشن؟ شغّل DS4Windows من صفحة التطبيقات.', btn: ['إعدادات التحكم', () => { dlg.close(); openSettings('controls'); }] },
      { g: 1, ok: !!s.wakeOn, icon: '🎙', t: 'أكاي (المساعد الصوتي)', d: s.wakeOn ? 'قل "أكاي" وبعدها اللي تبيه (مثلاً "أكاي سبوتيفاي" أو "أكاي فورتنايت")، ويطل عليك ويسويه. وإذا مدحته يستحي، وإذا سبيته يزعل ويطنشك ٣ مرات 😄' : 'اضغط زر 🎙 تحت يسار (أو Ctrl+Alt+Space) وقل اسم اللعبة أو الصفحة. ولو فعّلت "نادِ أكاي" من الإعدادات، تقول "أكاي" بس بدون ما تضغط شي.', btn: [s.wakeOn ? 'الإعدادات' : 'فعّل نداء أكاي', () => { dlg.close(); openSettings(); }] },
      { g: 2, ok: (data.pins || []).some(Boolean), icon: '📌', t: 'الدخول السريع (المربعات فوق)', d: 'اسحب أي لعبة أو برنامج وأفلته في واحد من المربعات الثلاثة فوق، أو كليك يمين عليه ← "ثبّت فوق". تفتحه من أي مكان بضغطة.' },
      { g: 2, ok: null, icon: '✨', t: 'المودات', d: 'فوق تلقى "مودك؟" (روقان، فطور، حماس…). كل مود يحط الثيم اللي تختاره ويعرض الأشياء اللي حطيتها فيه. تعدّلها من الإعدادات ← المودات.', btn: ['اضبط المودات', () => { dlg.close(); openSettings('moods'); }] },
      { g: 2, ok: null, icon: '⭐', t: 'التقييم وقائمة المستويات', d: 'زر "⭐ التقييم" فوق: قيّم كل ألعابك (حتى اللي مو مثبتة)، ورتبها بالسحب في قائمة S A B C D F، وشاركها كصورة لجوالك.', btn: ['افتح التقييم', () => { dlg.close(); window.SB?.openRatings(); }] },
      { g: 2, ok: null, icon: '📅', t: 'التقويم', d: 'هجري وميلادي. اضغط على أي يوم وأضف موعد، واختر التذكير (قبلها بيوم أو أسبوع)، ويطلع لك عد تنازلي.', btn: ['افتح التقويم', () => { dlg.close(); goPage('calendar'); }] },
      { g: 2, ok: null, icon: '📲', t: 'الإرسال للجوال', d: 'الصور وبطاقات التقييم تنرسل للجوال بكود QR. خلّ الجوال على نفس الواي فاي، وأول مرة إذا سألك ويندوز عن الحماية اختر "السماح".' },
      { g: 2, ok: null, icon: '🎨', t: 'الشكل', d: 'زر 🎨 تحت يسار للثيمات، وكل ثيم له منظر متحرك ولحن. من الإعدادات تقدر تحط صورتك أو فيديو كخلفية وتغيّر الإضاءة. F11 لملء الشاشة.', btn: ['الثيمات', () => { dlg.close(); openThemePicker(); }] },
      { g: 2, ok: null, icon: '🧲', t: 'التورنت', d: 'اسحب ملف .torrent وأفلته على البرنامج، أو الصق رابط magnet من زر "↓ استيراد". يتحمّل داخل البرنامج، ولو قفلت البرنامج يكمّل من وين وقف لما تفتحه. إذا كانت لعبة أجهزة تنضاف للمكتبة لحالها.' },
    ];
    const done = steps.filter((x) => x.ok === true).length, total = steps.filter((x) => x.ok !== null).length;
    dlg.innerHTML = `
      <div class="help-head"><h2>؟ كيف تضبط Silver Bullet</h2><span class="help-score">${done} من ${total} جاهزة</span></div>
      <div class="help-list">
        ${steps.map((x, i) => `${i === 0 ? '<h3 class="help-sec">أول شي: اضبطها بالترتيب</h3>' : steps[i - 1].g !== x.g ? '<h3 class="help-sec">وبعدها: تعرّف على الباقي</h3>' : ''}
          <div class="help-step ${x.ok === true ? 'ok' : x.ok === false ? 'todo' : 'info'}">
            <div class="hs-ico">${x.ok === true ? '✓' : x.icon}</div><span class="hs-n">${steps.filter((y, j) => j <= i && y.g === x.g).length}</span>
            <div class="hs-body"><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>
            ${x.btn ? `<button class="btn ${x.ok === false ? 'primary' : 'ghost'} sm" data-i="${i}">${esc(x.btn[0])}</button>` : ''}
          </div>`).join('')}
      </div>
      <div class="actions"><button class="btn primary" data-close>تم</button></div>`;
    dlg.querySelector('[data-close]').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => steps[Number(b.dataset.i)].btn[1](); });
  }
  window.Help = { open };
  $('#helpBtn').onclick = (e) => { e.stopPropagation(); open(); };
})();
