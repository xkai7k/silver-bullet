// Akai: the assistant's little face. He peeks in from the edge of the screen when he hears you,
// answers in a speech bubble, blushes when you're nice, and sulks (ignores you 3 times) if you're rude.
// The character is an original design (a calm young detective type with a red scarf).
(() => {
  const el = document.createElement('div');
  el.id = 'akai';
  // An original character: a calm young detective type — messy dark hair, amber eyes, long coat, red scarf.
  el.innerHTML = `
    <div class="ak-bubble"></div>
    <svg class="ak-face" viewBox="0 0 160 190" aria-hidden="true">
      <defs>
        <linearGradient id="akSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d3b3"/><stop offset="1" stop-color="#e4b48e"/></linearGradient>
        <linearGradient id="akHair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2a22"/><stop offset="1" stop-color="#16100c"/></linearGradient>
        <linearGradient id="akCoat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4150"/><stop offset="1" stop-color="#1c2028"/></linearGradient>
        <radialGradient id="akIris" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e2a85a"/><stop offset=".6" stop-color="#9a5f24"/><stop offset="1" stop-color="#4a2a10"/></radialGradient>
      </defs>
      <g class="ak-acc ak-acc-back"></g>
      <path class="ak-hair-back" d="M30 74 Q26 30 66 20 Q104 12 128 40 Q140 62 132 96 L124 70 L36 70 Z" fill="url(#akHair)"/>
      <path class="ak-coat" d="M8 190 Q14 150 50 142 L80 158 L110 142 Q146 150 152 190 Z" fill="url(#akCoat)"/>
      <path class="ak-lapel" d="M50 142 L70 190 L62 190 L42 150 Z M110 142 L90 190 L98 190 L118 150 Z" fill="#2a303b"/>
      <rect x="68" y="118" width="24" height="26" fill="#e4b48e"/>
      <path class="ak-scarf" d="M50 140 Q80 156 110 140 L114 152 Q80 170 46 152 Z"/>
      <path class="ak-scarf-tail" d="M96 152 L112 186 L100 188 L88 158 Z"/>
      <ellipse cx="34" cy="86" rx="7" ry="11" fill="#e8b994"/><ellipse cx="126" cy="86" rx="7" ry="11" fill="#e8b994"/>
      <path class="ak-head" d="M36 70 Q36 36 80 34 Q124 36 124 70 L122 98 Q118 124 80 134 Q42 124 38 98 Z" fill="url(#akSkin)"/>
      <path d="M44 108 Q60 126 80 130 Q100 126 116 108" stroke="rgba(160,100,70,.25)" stroke-width="3" fill="none"/>
      <g class="ak-eyes">
        <g class="ak-e ak-open">
          <path d="M50 84 Q60 76 70 84 Q60 90 50 84 Z" fill="#fff"/><path d="M90 84 Q100 76 110 84 Q100 90 90 84 Z" fill="#fff"/>
          <circle class="ak-iris" cx="60" cy="84" r="5" fill="url(#akIris)"/><circle class="ak-iris" cx="100" cy="84" r="5" fill="url(#akIris)"/>
          <circle cx="60" cy="84" r="2.2" fill="#1a0f08"/><circle cx="100" cy="84" r="2.2" fill="#1a0f08"/>
          <circle cx="58.5" cy="82.5" r="1.3" fill="#fff"/><circle cx="98.5" cy="82.5" r="1.3" fill="#fff"/>
          <path d="M49 83 Q60 74 71 83" stroke="#1a120d" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M89 83 Q100 74 111 83" stroke="#1a120d" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        </g>
        <g class="ak-e ak-happy"><path d="M50 86 Q60 76 70 86" /><path d="M90 86 Q100 76 110 86" /></g>
        <g class="ak-e ak-shy">
          <path d="M50 86 Q60 80 70 86 Q60 89 50 86 Z" fill="#fff"/><path d="M90 86 Q100 80 110 86 Q100 89 90 86 Z" fill="#fff"/>
          <circle cx="56" cy="86" r="3" fill="url(#akIris)"/><circle cx="96" cy="86" r="3" fill="url(#akIris)"/>
          <path d="M49 85 Q60 79 71 85" stroke="#1a120d" stroke-width="2.6" fill="none"/><path d="M89 85 Q100 79 111 85" stroke="#1a120d" stroke-width="2.6" fill="none"/>
        </g>
        <g class="ak-e ak-mad"><path d="M50 86 L70 84" /><path d="M90 84 L110 86" /></g>
      </g>
      <g class="ak-brows"><path class="ak-brow-l" d="M48 72 Q58 66 70 71"/><path class="ak-brow-r" d="M90 71 Q102 66 112 72"/></g>
      <path d="M80 90 Q77 102 82 104" stroke="rgba(150,95,60,.6)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse class="ak-blush" cx="52" cy="100" rx="9" ry="4.5"/><ellipse class="ak-blush" cx="108" cy="100" rx="9" ry="4.5"/>
      <g class="ak-mouths">
        <path class="m-idle" d="M73 114.5 Q80 118.5 87 114.5"/>
        <g class="m-happy"><path class="mo" d="M70 112 Q80 113.5 90 112 Q88.5 122.5 80 123 Q71.5 122.5 70 112 Z"/><path class="th" d="M71.2 112.6 Q80 114 88.8 112.6 L88.3 114.6 Q80 115.8 71.7 114.6 Z"/><path class="tg" d="M74.5 120.6 Q80 117 85.5 120.6 Q80 123.2 74.5 120.6 Z"/></g>
        <path class="m-shy" d="M75 115.5 Q80 113.5 85 115.5"/>
        <path class="m-sulk" d="M73 118 Q80 113.5 87 118"/>
        <g class="m-talk"><path class="mo" d="M75 113 Q80 112.4 85 113 Q84.4 120 80 120.4 Q75.6 120 75 113 Z"/><path class="tg" d="M76.6 118.6 Q80 116.4 83.4 118.6 Q80 120.4 76.6 118.6 Z"/></g>
      </g>
      <path class="ak-hair" d="M34 74 Q30 40 62 28 Q92 18 118 34 Q132 46 128 74 Q120 58 108 52 Q112 62 104 68 Q100 54 88 48 Q90 60 80 64 Q76 50 64 48 Q64 60 54 64 Q52 54 46 52 Q40 60 34 74 Z" fill="url(#akHair)"/>
      <path d="M62 34 Q80 26 102 34" stroke="rgba(255,255,255,.12)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <g class="ak-sweat"><path d="M120 58 Q126 70 120 74 Q114 70 120 58 Z" fill="#8fd3ff"/></g>
      <g class="ak-anger"><path d="M122 46 l8 -8 M126 50 l10 -4 M118 42 l4 -10" stroke="#e23b3b" stroke-width="3" stroke-linecap="round"/></g>
      <g class="ak-waves"><path d="M14 74 Q6 86 14 98"/><path d="M6 68 Q-4 86 6 104"/></g>
      <g class="ak-acc ak-acc-front"></g>
    </svg>`;
  document.body.appendChild(el);
  const bubble = el.querySelector('.ak-bubble');

  // A small accessory that changes with the theme
  const fedora = (c, band) => `<ellipse cx="80" cy="40" rx="62" ry="10" fill="${c}"/><path d="M48 40 Q48 8 80 8 Q112 8 112 40 Z" fill="${c}"/><rect x="48" y="30" width="64" height="7" fill="${band}"/>`;
  const phones = (band, cup) => `<path d="M30 84 Q28 22 80 20 Q132 22 130 84" stroke="${band}" stroke-width="7" fill="none"/><rect x="18" y="72" width="18" height="30" rx="7" fill="${cup}"/><rect x="124" y="72" width="18" height="30" rx="7" fill="${cup}"/>`;
  const ACC = {
    wood: fedora('#4a2f1c', '#a33'), vintage: fedora('#21160f', '#b8913d'),
    jazz: phones('#222', '#c9a227'), neon: phones('#ff2bd6', '#00e5ff'),
    farm: '<ellipse cx="80" cy="42" rx="70" ry="12" fill="#e6c36a"/><path d="M50 42 Q52 10 80 10 Q108 10 110 42 Z" fill="#d9b04f"/><rect x="50" y="32" width="60" height="7" fill="#b0462f"/>',
    souls: '<path d="M46 150 Q80 168 114 150 L120 168 Q80 186 40 168 Z" fill="#77716a" stroke="#34302c" stroke-width="2"/><path d="M52 160 Q80 174 108 160" stroke="#a9a29a" stroke-width="1.6" fill="none"/>',
    najdi: '<path d="M16 156 Q4 50 80 22 Q156 50 144 156 L130 150 Q136 70 80 44 Q24 70 30 150 Z" fill="#fff"/><path d="M16 156 Q4 50 80 22 Q156 50 144 156" fill="none" stroke="#c0392b" stroke-width="4" stroke-dasharray="7 7"/>',
    najdiFront: '<ellipse cx="80" cy="34" rx="44" ry="9" fill="none" stroke="#111" stroke-width="7"/>',
    pirate: '<path d="M32 58 Q34 22 80 20 Q126 22 128 58 Q80 44 32 58 Z" fill="#b3261e"/><circle cx="62" cy="38" r="3" fill="#fff"/><circle cx="96" cy="34" r="3" fill="#fff"/><path d="M124 50 L146 62 L132 68 Z" fill="#b3261e"/>',
    cyber: '<rect x="44" y="76" width="72" height="14" rx="7" fill="rgba(0,240,255,.35)" stroke="#fcee0a" stroke-width="2"/>',
    arcade: '<path d="M44 38 L52 18 L64 30 L80 12 L96 30 L108 18 L116 38 Z" fill="#ffd400"/>',
    // the rest of the themes get their own look too
    glass: '<path d="M34 60 Q34 18 80 16 Q126 18 126 60 Q80 48 34 60 Z" fill="#5a7bd8"/><path d="M34 60 Q80 48 126 60 L126 66 Q80 54 34 66 Z" fill="#3c58a8"/><circle cx="80" cy="14" r="7" fill="#9db4ff"/>',
    aero: '<path d="M46 84 Q46 74 60 74 Q72 74 72 84 Q72 94 60 94 Q46 94 46 84 Z M88 84 Q88 74 100 74 Q114 74 114 84 Q114 94 100 94 Q88 94 88 84 Z" fill="rgba(80,220,255,.55)" stroke="#e8fbff" stroke-width="2.4"/><path d="M72 82 Q80 78 88 82" stroke="#e8fbff" stroke-width="2.4" fill="none"/>',
    calm: '<path d="M34 62 Q32 18 80 16 Q128 18 126 62 Q80 50 34 62 Z" fill="#7fa88a"/><path d="M34 62 Q80 50 126 62 L126 70 Q80 58 34 70 Z" fill="#5e8a6b"/><path d="M44 40 L116 40 M40 50 L120 50" stroke="rgba(255,255,255,.18)" stroke-width="3"/>',
    classic: '<path d="M36 56 Q36 22 80 20 Q124 22 124 56 Z" fill="#6b6f7a"/><path d="M36 56 L20 62 Q60 50 124 56 Z" fill="#4c4f57"/><rect x="74" y="20" width="12" height="4" fill="#c0c0c0"/>',
    miami: '<path d="M44 80 L74 78 L72 92 Q60 98 48 92 Z M86 78 L116 80 L112 92 Q100 98 88 92 Z" fill="#2b1035"/><path d="M44 80 L116 80" stroke="#ff4fa3" stroke-width="2.6"/><path d="M48 84 L70 84" stroke="#ffb86b" stroke-width="2"/>',
    blocks: '<rect x="32" y="14" width="96" height="44" fill="#6a8f3a"/><rect x="32" y="14" width="96" height="12" fill="#7fb04a"/><rect x="44" y="26" width="10" height="10" fill="#557a2c"/><rect x="96" y="32" width="12" height="10" fill="#557a2c"/><rect x="70" y="40" width="10" height="10" fill="#8a6b45"/>',
  };
  function dressForTheme() {
    const t = (typeof data !== 'undefined' && data.theme) || 'glass';
    const back = t === 'najdi';
    for (const root of [el, mini]) {
      if (!root) continue;
      root.querySelector('.ak-acc-front').innerHTML = back ? (ACC[t + 'Front'] || '') : (ACC[t] || '');
      root.querySelector('.ak-acc-back').innerHTML = back ? ACC[t] : '';
    }
    el.dataset.theme = t;
  }
  // ---------- his seat: bottom-left, where the mic button was. Click him to talk ----------
  const seat = document.getElementById('micBtn');
  const mini = el.querySelector('.ak-face').cloneNode(true);
  mini.classList.remove('ak-face'); mini.classList.add('ak-mini');
  if (seat) { seat.classList.add('akai-seat'); seat.innerHTML = ''; seat.appendChild(mini); const lb = document.createElement('small'); lb.className = 'ak-name'; seat.appendChild(lb); }
  const nameOf = () => (typeof data !== 'undefined' && data.settings?.akaiName) || 'أكاي';
  function seatSync() { const lb = seat?.querySelector('.ak-name'); if (lb) lb.textContent = nameOf(); if (seat) seat.title = `كلّم ${nameOf()} (Ctrl+Alt+Space)`; dressForTheme(); }
  setTimeout(seatSync, 1500);
  // ---------- showing up ----------
  const SPOTS = ['bl']; // he lives bottom-left, right above his seat
  let hideT = 0, sulk = 0;
  function peek(face = 'idle', text = '', ms = 3800) {
    dressForTheme();
    clearTimeout(hideT);
    el.dataset.spot = SPOTS[0];
    el.dataset.face = face;
    bubble.textContent = text;
    bubble.hidden = !text;
    el.classList.add('in');
    if (text && face !== 'sulk') { el.classList.add('talk'); setTimeout(() => el.classList.remove('talk'), Math.min(1800, 120 * text.length)); }
    seat?.classList.add('away');
    if (ms) hideT = setTimeout(() => { el.classList.remove('in'); seat?.classList.remove('away'); }, ms);
  }
  const hide = () => { clearTimeout(hideT); el.classList.remove('in'); seat?.classList.remove('away'); };

  // ---------- mood words (kept simple on purpose) ----------
  const norm = (s) => (typeof normAr === 'function' ? normAr(s) : String(s).toLowerCase());
  const RUDE = /(غبي|حمار|تافه|كلب|زق|خرا|يلعن|انقلع|اقلب وجهك|وصخ|حيوان|ثور|بقره|غثيث|سخيف|فاشل|اكرهك|fuck|stupid|idiot|shit|dumb)/;
  const NICE = /(شكرا|مشكور|يعطيك العافيه|الله يعطيك|احبك|حبيبي|كفو|ذيب|بطل|ذكي|شاطر|مبدع|رهيب|عظيم|اسطوره|حلو|جميل|thanks|thank you|love you|good job|nice)/;
  const SULK_LINES = ['هممف…', '…', 'ما أسمعك 😤', 'زعلان…'];
  const SHY_LINES = ['لا عاد… تستحيني 😳', 'يا شيخ… 🙈', 'هههه تسلم 😊', 'أدري، بس قولها مرة ثانية 😌'];

  // Called with every phrase heard. Returns false when Akai won't act on it.
  function filter(text) {
    const t = norm(text);
    if (RUDE.test(t)) { sulk = 3; peek('sulk', 'خلاص… زعلت 😤', 4200); pv.log('akai: sulking'); return false; }
    if (sulk > 0) {
      sulk--;
      if (NICE.test(t) || /(اسف|سامحني|متاسف|sorry)/.test(t)) { sulk = 0; peek('shy', 'طيب… سامحتك 😳', 3800); return false; }
      peek('sulk', sulk === 0 ? 'خلاص… آخر مرة 😒' : SULK_LINES[Math.floor(Math.random() * SULK_LINES.length)], 3000);
      return false;
    }
    if (NICE.test(t) && t.split(' ').length <= 5) { peek('shy', SHY_LINES[Math.floor(Math.random() * SHY_LINES.length)], 3800); return false; }
    return true;
  }

  window.Akai = {
    listen() { if (sulk > 0) return peek('sulk', '…', 2500); peek('listen', 'أسمعك…', 0); },
    say(msg, face = 'happy') { if (sulk > 0) return; peek(face, msg, 3600); },
    fail(msg) { peek('idle', msg, 3600); },
    filter,
    hide,
    greet() {
      const n = data?.user?.name; const h = new Date().getHours();
      peek('happy', h < 5 ? `سهران${n ? ' يا ' + n : ''}؟ 🌙` : h < 12 ? `صباح الخير${n ? ' ' + n : ''} ☀️` : `هلا${n ? ' ' + n : ''} 👋`, 3400);
    },
    isSulking: () => sulk > 0,
    sync: seatSync,
    get name() { return nameOf(); },
  };
  // Blink now and then
  setInterval(() => { if (el.classList.contains('in') && el.dataset.face !== 'sulk') { el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 140); } }, 2600);
  el.onclick = () => (sulk > 0 ? peek('sulk', 'لا تكلمني 😤', 2500) : peek('happy', `وش تبي؟ قل "${nameOf()}" وبعدها طلبك 😄`, 3200));
})();
