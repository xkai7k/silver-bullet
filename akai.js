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
        <pattern id="akShm" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f7f3ec"/><path d="M0 0h3v3H0z" fill="#c8232c" opacity=".85"/><path d="M3 3h3v3H3z" fill="#c8232c" opacity=".35"/></pattern>
        <radialGradient id="akIris" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e2a85a"/><stop offset=".6" stop-color="#9a5f24"/><stop offset="1" stop-color="#4a2a10"/></radialGradient>
      </defs>
      <g class="ak-acc ak-acc-back"></g>
      <path class="ak-hair-back" d="M30 74 Q26 30 66 20 Q104 12 128 40 Q140 62 132 96 L124 70 L36 70 Z" fill="url(#akHair)"/>
      <path class="ak-girl-hair" d="M32 72 Q18 118 30 168 Q40 176 52 166 Q40 128 42 92 Z M128 72 Q142 118 130 168 Q120 176 108 166 Q120 128 118 92 Z" fill="url(#akHair)"/>
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
      <g class="ak-lash"><path d="M49 82 l-5 -3 M51 79 l-4 -4 M111 82 l5 -3 M109 79 l4 -4" stroke="#1a120d" stroke-width="2" stroke-linecap="round"/></g>
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
    // a real Najdi shmagh: red-and-white weave over the head and down the shoulders, face open, black double igal on top
    najdi: '<path d="M16 188 Q10 118 28 70 Q46 20 80 16 Q114 20 132 70 Q150 118 144 188 Z" fill="url(#akShm)"/><path d="M16 188 Q10 118 28 70 Q46 20 80 16 Q114 20 132 70 Q150 118 144 188" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="2"/>',
    najdiFront: '<path fill-rule="evenodd" fill="url(#akShm)" d="M30 168 Q16 96 36 54 Q54 16 80 16 Q106 16 124 54 Q144 96 130 168 L116 176 Q120 140 120 100 Q121 72 108 62 Q94 54 80 54 Q66 54 52 62 Q39 72 40 100 Q40 140 44 176 Z"/>'
      + '<path d="M40 100 Q39 72 52 62 Q66 54 80 54 Q94 54 108 62 Q121 72 120 100" fill="none" stroke="#f7f3ea" stroke-width="4.5" stroke-linecap="round"/>'
      + '<path d="M34 130 Q28 92 42 66 M126 130 Q132 92 118 66" stroke="rgba(0,0,0,.13)" stroke-width="3" fill="none"/>'
      + '<ellipse cx="80" cy="36" rx="38" ry="8" fill="none" stroke="#161616" stroke-width="5"/><ellipse cx="80" cy="43" rx="40" ry="8.5" fill="none" stroke="#0b0b0b" stroke-width="5"/>'
      + '<path d="M46 40 Q80 53 114 40" stroke="rgba(255,255,255,.2)" stroke-width="1.4" fill="none"/>'
      + '<path d="M80 144 L80 172 M74 148 Q80 152 86 148" stroke="rgba(0,0,0,.18)" stroke-width="2" fill="none"/>',
    // a captain's tricorne: dark felt, gold trim, a small white skull
    pirate: '<path d="M22 50 Q40 30 80 34 Q120 30 138 50 Q120 44 80 54 Q40 44 22 50 Z" fill="#1d1712"/><path d="M40 46 Q44 10 80 8 Q116 10 120 46 Q80 36 40 46 Z" fill="#2a2119"/><path d="M22 50 Q40 30 80 34 Q120 30 138 50" stroke="#d9a441" stroke-width="3" fill="none"/><path d="M40 46 Q80 36 120 46" stroke="#d9a441" stroke-width="2.4" fill="none"/><circle cx="80" cy="26" r="6" fill="#f4efe2"/><circle cx="77.6" cy="25" r="1.4" fill="#1d1712"/><circle cx="82.4" cy="25" r="1.4" fill="#1d1712"/><path d="M72 34 L88 40 M88 34 L72 40" stroke="#f4efe2" stroke-width="2" stroke-linecap="round"/>',
    cyber: '<rect x="44" y="76" width="72" height="14" rx="7" fill="rgba(0,240,255,.35)" stroke="#fcee0a" stroke-width="2"/>',
    arcade: '<path d="M44 38 L52 18 L64 30 L80 12 L96 30 L108 18 L116 38 Z" fill="#ffd400"/>',
    // the night shift: a cartoon bear mask (round ears, muzzle, a stitched seam) with a little guard's flashlight glow
    night: '<circle cx="42" cy="34" r="16" fill="#7a5233"/><circle cx="118" cy="34" r="16" fill="#7a5233"/><circle cx="42" cy="34" r="8" fill="#5a3a22"/><circle cx="118" cy="34" r="8" fill="#5a3a22"/>'
      + '<path fill-rule="evenodd" fill="#8a5d3b" d="M34 104 Q30 40 80 36 Q130 40 126 104 Q124 128 80 134 Q36 128 34 104 Z M48 86 Q60 74 72 86 Q60 96 48 86 Z M88 86 Q100 74 112 86 Q100 96 88 86 Z"/>'
      + '<ellipse cx="80" cy="112" rx="22" ry="15" fill="#c79a6e"/><ellipse cx="80" cy="104" rx="8" ry="5.5" fill="#2a1a10"/><path d="M80 110 L80 118 M72 120 Q80 124 88 120" stroke="#2a1a10" stroke-width="2" fill="none"/>'
      + '<path d="M52 60 L56 66 M60 58 L62 65 M100 58 L98 65 M108 60 L104 66" stroke="#3a2515" stroke-width="2"/><path d="M36 100 Q80 92 124 100" stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-dasharray="4 4" fill="none"/>',
    // the magic school: a tall pointed hat with stars and a little moon
    wizard: '<path d="M24 58 Q80 40 136 58 Q80 70 24 58 Z" fill="#2b2160"/><path d="M42 54 Q60 30 76 -10 Q84 -22 96 -14 Q88 -6 92 6 Q104 34 118 54 Q80 46 42 54 Z" fill="#3a2d80"/>'
      + '<path d="M44 52 Q80 44 116 52" stroke="#d9a83e" stroke-width="4" fill="none"/><path d="M70 30 l3 6 6 1 -5 4 2 6 -6 -3 -6 3 2 -6 -5 -4 6 -1 z" fill="#ffd76a"/><path d="M94 18 a7 7 0 1 0 6 10 a5 5 0 1 1 -6 -10 z" fill="#f6efd9"/><circle cx="60" cy="44" r="2" fill="#ffd76a"/><circle cx="102" cy="40" r="1.6" fill="#ffd76a"/>',
    // the rest of the themes get their own look too
    glass: '<path d="M34 60 Q34 18 80 16 Q126 18 126 60 Q80 48 34 60 Z" fill="#5a7bd8"/><path d="M34 60 Q80 48 126 60 L126 66 Q80 54 34 66 Z" fill="#3c58a8"/><circle cx="80" cy="14" r="7" fill="#9db4ff"/>',
    aero: '<path d="M46 84 Q46 74 60 74 Q72 74 72 84 Q72 94 60 94 Q46 94 46 84 Z M88 84 Q88 74 100 74 Q114 74 114 84 Q114 94 100 94 Q88 94 88 84 Z" fill="rgba(80,220,255,.55)" stroke="#e8fbff" stroke-width="2.4"/><path d="M72 82 Q80 78 88 82" stroke="#e8fbff" stroke-width="2.4" fill="none"/>',
    calm: '<path d="M34 62 Q32 18 80 16 Q128 18 126 62 Q80 50 34 62 Z" fill="#7fa88a"/><path d="M34 62 Q80 50 126 62 L126 70 Q80 58 34 70 Z" fill="#5e8a6b"/><path d="M44 40 L116 40 M40 50 L120 50" stroke="rgba(255,255,255,.18)" stroke-width="3"/>',
    classic: '<path d="M36 56 Q36 22 80 20 Q124 22 124 56 Z" fill="#6b6f7a"/><path d="M36 56 L20 62 Q60 50 124 56 Z" fill="#4c4f57"/><rect x="74" y="20" width="12" height="4" fill="#c0c0c0"/>',
    miami: '<path d="M44 80 L74 78 L72 92 Q60 98 48 92 Z M86 78 L116 80 L112 92 Q100 98 88 92 Z" fill="#2b1035"/><path d="M44 80 L116 80" stroke="#ff4fa3" stroke-width="2.6"/><path d="M48 84 L70 84" stroke="#ffb86b" stroke-width="2"/>',
    blocks: '<rect x="32" y="14" width="96" height="44" fill="#6a8f3a"/><rect x="32" y="14" width="96" height="12" fill="#7fb04a"/><rect x="44" y="26" width="10" height="10" fill="#557a2c"/><rect x="96" y="32" width="12" height="10" fill="#557a2c"/><rect x="70" y="40" width="10" height="10" fill="#8a6b45"/>',
  };
  // your own look for him (Settings, or from the phone): a hat, his colour, boy or girl
  const HATS = {
    none: '',
    cap: '<path d="M36 58 Q36 22 80 20 Q124 22 124 58 Z" fill="var(--ak-col,#c8102e)"/><path d="M36 58 Q80 48 150 60 Q150 66 124 64 Q80 56 36 64 Z" fill="rgba(0,0,0,.35)"/><circle cx="80" cy="20" r="4" fill="rgba(0,0,0,.3)"/>',
    beanie: '<path d="M32 64 Q30 16 80 14 Q130 16 128 64 Z" fill="var(--ak-col,#c8102e)"/><rect x="30" y="56" width="100" height="12" rx="6" fill="rgba(0,0,0,.25)"/><circle cx="80" cy="12" r="9" fill="#f2f2f2"/>',
    crown: '<path d="M44 40 L52 14 L66 30 L80 8 L94 30 L108 14 L116 40 Z" fill="#ffd34d" stroke="#b8860b" stroke-width="2"/><circle cx="80" cy="26" r="4" fill="var(--ak-col,#c8102e)"/>',
    fedora: fedora('#2a2420', 'var(--ak-col,#c8102e)'),
    phones: phones('#1c1c1c', 'var(--ak-col,#c8102e)'),
    cat: '<path d="M38 50 L46 14 L66 38 Z M122 50 L114 14 L94 38 Z" fill="url(#akHair)"/><path d="M46 44 L50 24 L60 38 Z M114 44 L110 24 L100 38 Z" fill="#f4a6b8"/>',
    bow: '<path d="M96 30 L120 18 L118 44 Z M96 30 L74 18 L76 44 Z" fill="var(--ak-col,#ff5fa2)"/><circle cx="96" cy="31" r="5" fill="rgba(0,0,0,.25)"/>',
  };
  const look = () => (typeof data !== 'undefined' && data.settings?.akaiLook) || {};
  function dressForTheme() {
    const t = (typeof data !== 'undefined' && data.theme) || 'glass';
    const L = look(), own = L.hat && L.hat !== 'theme' && L.hat in HATS;
    const back = !own && t === 'najdi';
    for (const root of [el, mini]) {
      if (!root) continue;
      root.querySelector('.ak-acc-front').innerHTML = own ? HATS[L.hat] : back ? (ACC[t + 'Front'] || '') : (ACC[t] || '');
      root.querySelector('.ak-acc-back').innerHTML = back ? ACC[t] : '';
      root.classList.toggle('dress-najdi', back); // thobe instead of the coat and scarf
      root.classList.toggle('ak-girl', !!L.girl);
      if (L.color) root.style.setProperty('--ak-col', L.color); else root.style.removeProperty('--ak-col');
      if (L.hair) root.style.setProperty('--ak-hair', L.hair); else root.style.removeProperty('--ak-hair');
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

  window.Akai = { dress: dressForTheme,
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
    sync: seatSync, HATS: Object.keys(HATS),
    get name() { return nameOf(); },
  };
  // ---------- Settings → 🎨 شكل أكاي ----------
  const HAT_NAMES = { theme: '🎭 حسب الثيم', none: '🚫 بدون', cap: '🧢 كاب', beanie: '🧶 طاقية', crown: '👑 تاج', fedora: '🎩 برنيطة', phones: '🎧 سماعة', cat: '🐱 أذان قطة', bow: '🎀 فيونكة' };
  const COLORS = ['#c8102e', '#2f6fde', '#1f9d55', '#7b3fe4', '#ff5fa2', '#f2a900', '#111111', '#f2f2f2'];
  const HAIRS = ['', '#6b4a2b', '#c9a15a', '#b03a2e', '#1c2a5a', '#e8e8e8'];
  window.Akai.setLook = (patch) => { data.settings.akaiLook = { ...look(), ...patch }; save(); dressForTheme(); };
  window.Akai.lookDialog = () => {
    const d = document.createElement('dialog'); d.className = 'ak-look'; d.dir = 'rtl';
    const draw = () => {
      const L = look();
      d.innerHTML = `<h2 style="margin:0 0 6px">🎨 شكل ${nameOf()}</h2><div class="akl-prev"></div>
        <div class="akl-row"><b>الشكل</b><button data-g="0" class="${!L.girl ? 'on' : ''}">👦 ولد</button><button data-g="1" class="${L.girl ? 'on' : ''}">👧 بنت</button></div>
        <div class="akl-row"><b>اللبس على الراس</b>${Object.entries(HAT_NAMES).map(([k, v]) => `<button data-h="${k}" class="${(L.hat || 'theme') === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="akl-row"><b>لونه (الشال والكاب)</b>${COLORS.map((c) => `<button class="akl-sw ${L.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<button data-c="">افتراضي</button></div>
        <div class="akl-row"><b>لون الشعر</b>${HAIRS.map((c) => c ? `<button class="akl-sw ${L.hair === c ? 'on' : ''}" data-hr="${c}" style="background:${c}"></button>` : `<button data-hr="" class="${!L.hair ? 'on' : ''}">افتراضي</button>`).join('')}</div>
        <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x>تم</button></div>`;
      const pv2 = el.querySelector('.ak-face').cloneNode(true); pv2.classList.remove('ak-face'); pv2.classList.add('boo-svg', 'akl-svg'); pv2.classList.toggle('ak-girl', !!L.girl); pv2.style.cssText = el.style.cssText;
      d.querySelector('.akl-prev').appendChild(pv2);
      d.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { window.Akai.setLook({ girl: b.dataset.g === '1' }); draw(); });
      d.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { window.Akai.setLook({ hat: b.dataset.h }); draw(); });
      d.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { window.Akai.setLook({ color: b.dataset.c || undefined }); draw(); });
      d.querySelectorAll('[data-hr]').forEach((b) => b.onclick = () => { window.Akai.setLook({ hair: b.dataset.hr || undefined }); draw(); });
      d.querySelector('[data-x]').onclick = () => d.close();
    };
    d.onclose = () => d.remove();
    document.body.appendChild(d); draw(); d.showModal();
    peek('happy', 'وش رايك فيني؟ 😎', 2500);
  };
  window.Akai.look = () => ({ ...look(), hats: HAT_NAMES, colors: COLORS, hairs: HAIRS.filter(Boolean) });
  // Blink now and then
  setInterval(() => { if (el.classList.contains('in') && el.dataset.face !== 'sulk') { el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 140); } }, 2600);
  el.onclick = () => (sulk > 0 ? peek('sulk', 'لا تكلمني 😤', 2500) : peek('happy', `وش تبي؟ قل "${nameOf()}" وبعدها طلبك 😄`, 3200));
})();
