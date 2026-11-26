// Animated background scenes, one per theme. Everything is drawn here (SVG + CSS), no outside images.
(() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const R = (a, b) => a + rnd() * (b - a);
  const svg = (inner, extra = '') => `<svg class="scene-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" ${extra}>${inner}</svg>`;
  const parts = (cls, n, style) => Array.from({ length: n }, (_, i) => `<i class="${cls}" style="${style(i)}"></i>`).join('');

  function skyline(y, color, minH, maxH, windows, wColor) {
    let x = -20, out = '';
    while (x < 1620) {
      const w = R(40, 110), h = R(minH, maxH);
      out += `<rect x="${x.toFixed(0)}" y="${(y - h).toFixed(0)}" width="${w.toFixed(0)}" height="${(h + 200).toFixed(0)}" fill="${color}"/>`;
      if (rnd() < 0.3) out += `<rect x="${(x + w / 2 - 2).toFixed(0)}" y="${(y - h - R(20, 60)).toFixed(0)}" width="3" height="80" fill="${color}"/>`;
      if (windows) for (let wy = y - h + 12; wy < y - 8; wy += 14) for (let wx = x + 8; wx < x + w - 8; wx += 12) {
        if (rnd() < windows) out += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="5" height="6" fill="${wColor}" opacity="${R(0.35, 0.95).toFixed(2)}"/>`;
      }
      x += w + R(2, 14);
    }
    return out;
  }
  function hills(y, amp, color, n = 5) {
    let d = `M0 900 L0 ${y}`;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 1600, cy = y + R(-amp, amp);
      d += ` Q ${x - 1600 / n / 2} ${cy - amp} ${x} ${cy}`;
    }
    return `<path d="${d} L1600 900 Z" fill="${color}"/>`;
  }
  function palm(x, y, s, color) {
    const fronds = [-150, -115, -80, -40, -10, 20].map((a) => {
      const r = (a * Math.PI) / 180, len = 170 * s;
      const ex = x + Math.cos(r) * len, ey = y - 330 * s + Math.sin(r) * len * 0.6 + 40 * s;
      const cx = x + Math.cos(r) * len * 0.5, cy = y - 330 * s - 60 * s;
      return `<path d="M${x} ${y - 330 * s} Q ${cx} ${cy} ${ex} ${ey}" stroke="${color}" stroke-width="${16 * s}" fill="none" stroke-linecap="round"/>`;
    }).join('');
    return `<path d="M${x - 10 * s} ${y} Q ${x + 30 * s} ${y - 180 * s} ${x} ${y - 330 * s}" stroke="${color}" stroke-width="${18 * s}" fill="none" stroke-linecap="round"/>${fronds}`;
  }
  function pixelTerrain(base, block) {
    let out = '', h = 4;
    for (let x = 0; x < 1600; x += block) {
      h = Math.max(2, Math.min(9, h + Math.round(R(-1.4, 1.4))));
      const top = base - h * block;
      out += `<rect x="${x}" y="${top}" width="${block}" height="${block}" fill="#5d9b32"/><rect x="${x}" y="${top + block * 0.7}" width="${block}" height="${block * 0.3}" fill="#4f8a2a"/>`;
      for (let y = top + block; y < 900; y += block) out += `<rect x="${x}" y="${y}" width="${block}" height="${block}" fill="${y > base + block * 2 ? '#6e6e6e' : '#866043'}" opacity="${R(0.85, 1).toFixed(2)}"/>`;
      if (rnd() < 0.12) { // a little tree
        out += `<rect x="${x + block * 0.35}" y="${top - block * 3}" width="${block * 0.3}" height="${block * 3}" fill="#6b4a2b"/>`;
        out += `<rect x="${x - block}" y="${top - block * 5}" width="${block * 3}" height="${block * 2.4}" fill="#3f7d22"/>`;
      }
    }
    return out;
  }

  function najdiTown(base, color, light) {
    // Najdi mud houses: flat roofs with stepped triangle crenellations and small triangle vents
    let x = -30, out = '';
    while (x < 1640) {
      const w = R(90, 210), h = R(110, 260), top = base - h;
      out += `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${w.toFixed(0)}" height="${(h + 300).toFixed(0)}" fill="${color}"/>`;
      for (let cx = x + 4; cx < x + w - 10; cx += 18) out += `<polygon points="${cx},${top} ${cx + 7},${top - 12} ${cx + 14},${top}" fill="${color}"/>`;
      for (let r = 0; r < 2; r++) for (let vx = x + 16; vx < x + w - 20; vx += 30) {
        if (rnd() < 0.55) out += `<polygon points="${vx},${top + 30 + r * 18} ${vx + 6},${top + 20 + r * 18} ${vx + 12},${top + 30 + r * 18}" fill="${light}" opacity="${R(0.5, 0.95).toFixed(2)}"/>`;
      }
      if (rnd() < 0.5) out += `<rect x="${(x + w / 2 - 14).toFixed(0)}" y="${(base - 54).toFixed(0)}" width="28" height="54" rx="2" fill="#2a1406"/>`;
      if (rnd() < 0.18) { const tw = 46; out += `<rect x="${(x + w - tw).toFixed(0)}" y="${(top - 90).toFixed(0)}" width="${tw}" height="92" fill="${color}"/>`; for (let cx = x + w - tw + 3; cx < x + w - 8; cx += 14) out += `<polygon points="${cx},${top - 90} ${cx + 5},${top - 100} ${cx + 10},${top - 90}" fill="${color}"/>`; }
      x += w + R(-6, 24);
    }
    return out;
  }
  function ship(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})" class="ship">
      <path d="M-160 0 Q-150 46 -110 52 L120 52 Q170 40 190 -6 Z" fill="#3b2412"/>
      <path d="M-160 0 L190 -6" stroke="#5c3a1c" stroke-width="6"/>
      <rect x="-12" y="-250" width="10" height="250" fill="#4a2e16"/><rect x="-102" y="-170" width="8" height="170" fill="#4a2e16"/><rect x="88" y="-150" width="8" height="150" fill="#4a2e16"/>
      <path d="M-70 -236 Q0 -210 64 -236 L60 -110 Q0 -90 -66 -110 Z" fill="#f1e6cf"/><path d="M-140 -160 Q-98 -146 -56 -160 L-58 -70 Q-98 -60 -138 -70 Z" fill="#efe2c8"/>
      <path d="M56 -140 Q92 -128 128 -140 L126 -64 Q92 -54 58 -64 Z" fill="#efe2c8"/>
      <path d="M-4 -250 L40 -262 L-4 -274 Z" fill="#c8102e"/>
      ${Array.from({ length: 6 }, (_, i) => `<circle cx="${-110 + i * 42}" cy="24" r="6" fill="#1d1209"/>`).join('')}
    </g>`;
  }

  const SCENES = {
    glass: () => `<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>`,
    aero: () => svg(hills(760, 30, 'rgba(110,200,90,.85)', 4) + hills(820, 20, 'rgba(70,170,70,.95)', 5)) +
      parts('bubble', 16, () => `left:${R(0, 100)}%;width:${R(18, 70)}px;animation-duration:${R(14, 30)}s;animation-delay:-${R(0, 30)}s`),
    wood: () => `<div class="lamp"></div>` + parts('mote', 26, () => `left:${R(0, 100)}%;top:${R(0, 100)}%;animation-duration:${R(10, 22)}s;animation-delay:-${R(0, 20)}s`),
    jazz: () => `<div class="spot s1"></div><div class="spot s2"></div>` + svg(`<rect x="0" y="800" width="1600" height="100" fill="rgba(80,30,40,.55)"/><rect x="0" y="796" width="1600" height="4" fill="rgba(212,175,55,.5)"/>`) +
      parts('note', 14, (i) => `left:${R(4, 96)}%;animation-duration:${R(12, 22)}s;animation-delay:-${R(0, 22)}s;font-size:${R(18, 34)}px`).replace(/<\/i>/g, (m, o) => (rnd() < 0.5 ? '♪' : '♫') + m),
    neon: () => `<div class="horizon"></div><div class="grid-floor"></div>`,
    calm: () => svg(hills(640, 40, 'rgba(170,200,160,.55)', 3) + hills(720, 35, 'rgba(130,175,125,.7)', 4) + hills(800, 25, 'rgba(95,143,107,.85)', 5)) +
      parts('cloud', 4, () => `top:${R(5, 30)}%;animation-duration:${R(70, 120)}s;animation-delay:-${R(0, 100)}s;transform:scale(${R(0.6, 1.3).toFixed(2)})`),
    classic: () => parts('star', 60, () => `left:${R(0, 100)}%;top:${R(0, 100)}%;animation-duration:${R(2, 5)}s;animation-delay:-${R(0, 5)}s`),
    cyber: () => svg(
      `<defs><linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff003c" stop-opacity=".0"/><stop offset="1" stop-color="#ff003c" stop-opacity=".25"/></linearGradient></defs>` +
      skyline(860, '#0f1020', 180, 520, 0, '') + skyline(900, '#06060c', 120, 360, 0.18, '#fcee0a') +
      `<rect x="0" y="600" width="1600" height="300" fill="url(#cf)"/>` +
      `<rect x="1180" y="330" width="150" height="46" rx="4" fill="none" stroke="#00f0ff" stroke-width="3" class="flicker"/><rect x="230" y="400" width="110" height="34" rx="4" fill="none" stroke="#ff003c" stroke-width="3" class="flicker f2"/>`) +
      parts('rain', 70, () => `left:${R(0, 100)}%;animation-duration:${R(0.5, 1.1).toFixed(2)}s;animation-delay:-${R(0, 1).toFixed(2)}s;opacity:${R(0.2, 0.6).toFixed(2)}`),
    miami: () => `<div class="sun"></div>` + svg(
      `<rect x="0" y="640" width="1600" height="260" fill="rgba(40,10,70,.85)"/>` +
      palm(170, 900, 1.25, '#1a0626') + palm(330, 900, 0.9, '#1a0626') + palm(1430, 900, 1.35, '#1a0626') + palm(1270, 900, 0.85, '#1a0626')) +
      `<div class="grid-floor miami-grid"></div>`,
    farm: () => `<div class="sun farm-sun"></div>` + svg(
      hills(560, 40, '#8cc56a', 3) + hills(650, 30, '#6fb043', 4) +
      `<g fill="#9c6a3a">${Array.from({ length: 34 }, (_, i) => `<rect x="${i * 48}" y="690" width="10" height="60"/>`).join('')}<rect x="0" y="702" width="1600" height="8"/><rect x="0" y="728" width="1600" height="8"/></g>` +
      `<g>${Array.from({ length: 5 }, () => { const x = R(60, 1540), s = R(0.7, 1.2); return `<rect x="${x - 6 * s}" y="${600 - 60 * s}" width="${12 * s}" height="${60 * s}" fill="#7a4e2a"/><circle cx="${x}" cy="${600 - 80 * s}" r="${36 * s}" fill="#3f8a2e"/><circle cx="${x - 20 * s}" cy="${600 - 64 * s}" r="${24 * s}" fill="#4d9a34"/>`; }).join('')}</g>` +
      hills(780, 18, '#5a9a36', 6)) +
      parts('cloud pixel', 4, () => `top:${R(4, 26)}%;animation-duration:${R(60, 110)}s;animation-delay:-${R(0, 100)}s`) +
      parts('leaf', 10, () => `left:${R(0, 100)}%;animation-duration:${R(9, 16)}s;animation-delay:-${R(0, 16)}s`),
    blocks: () => svg(pixelTerrain(760, 40), 'shape-rendering="crispEdges"') +
      parts('cloud block', 4, () => `top:${R(4, 22)}%;animation-duration:${R(80, 140)}s;animation-delay:-${R(0, 120)}s`),
    arcade: () => parts('star', 80, () => `left:${R(0, 100)}%;top:${R(0, 70)}%;animation-duration:${R(1.5, 4)}s;animation-delay:-${R(0, 4)}s`) +
      svg(`<g fill="#2a1a66" shape-rendering="crispEdges">${Array.from({ length: 40 }, (_, i) => { const h = R(60, 220); return `<rect x="${i * 40}" y="${640 - h}" width="40" height="${h}"/>`; }).join('')}</g>`) +
      `<div class="grid-floor arcade-grid"></div>`,
    souls: () => svg(
      hills(560, 70, '#17130f', 4) +
      `<g fill="#0c0a08"><rect x="980" y="300" width="70" height="330"/><rect x="1060" y="380" width="120" height="250"/><polygon points="980,300 1015,230 1050,300"/><rect x="1190" y="260" width="55" height="370"/><polygon points="1190,260 1217,190 1245,260"/><rect x="1250" y="420" width="150" height="210"/>` +
      `<rect x="1100" y="340" width="12" height="40"/><rect x="1130" y="340" width="12" height="40"/></g>` +
      hills(700, 40, '#0e0c0a', 5) + hills(800, 25, '#080706', 6)) +
      `<div class="moon"></div><div class="fog f1"></div><div class="fog f2"></div>` +
      parts('ember', 34, () => `left:${R(0, 100)}%;animation-duration:${R(6, 14)}s;animation-delay:-${R(0, 14)}s;--dx:${R(-80, 80).toFixed(0)}px`),
  };

  // ----- new themes -----
  SCENES.pirate = () => `<div class="sun pirate-sun"></div>` + parts('cloud', 5, () => `top:${R(4, 30)}%;animation-duration:${R(80, 140)}s;animation-delay:-${R(0, 120)}s;transform:scale(${R(0.6, 1.2).toFixed(2)})`) +
    parts('gull', 5, () => `top:${R(8, 34)}%;animation-duration:${R(22, 40)}s;animation-delay:-${R(0, 40)}s`).replace(/<\/i>/g, 'ˇ</i>') +
    svg(`<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b8fb0"/><stop offset="1" stop-color="#0b3e5c"/></linearGradient></defs>
      <rect x="0" y="600" width="1600" height="300" fill="url(#sea)"/>
      <path d="M1180 600 Q1260 520 1330 560 Q1400 470 1480 540 Q1540 520 1600 560 L1600 600 Z" fill="#2c6b3f" opacity=".85"/>
      <g class="sway">${ship(820, 700, 0.6)}</g>`) +
    `<div class="wave w1"></div><div class="wave w2"></div><div class="wave w3"></div>`;
  SCENES.najdi = () => `<div class="najdi-sky"></div><div class="moon najdi-moon"></div>` +
    parts('star', 50, () => `left:${R(0, 100)}%;top:${R(0, 40)}%;animation-duration:${R(2, 6)}s;animation-delay:-${R(0, 6)}s`) +
    svg(hills(720, 22, '#7a4a26', 4) + najdiTown(760, '#a8683a', '#ffcf7a') +
      palm(120, 820, 0.9, '#2d1a0c') + palm(260, 840, 0.7, '#2d1a0c') + palm(1470, 830, 1, '#2d1a0c') + palm(1330, 850, 0.75, '#2d1a0c') +
      `<path d="M0 820 Q400 780 800 815 T1600 805 L1600 900 L0 900 Z" fill="#c8925a"/>`) +
    `<div class="sadu"></div>` + parts('sand', 30, () => `left:${R(0, 100)}%;top:${R(50, 95)}%;animation-duration:${R(8, 18)}s;animation-delay:-${R(0, 18)}s`);
  SCENES.vintage = () => `<div class="lamp vintage-lamp"></div><div class="frames"><i></i><i></i><i></i></div><div class="grain"></div><div class="vignette"></div>` +
    parts('mote', 34, () => `left:${R(0, 100)}%;top:${R(0, 100)}%;animation-duration:${R(10, 24)}s;animation-delay:-${R(0, 20)}s`);
  // ----- the night shift: a dark security office, a flickering lamp, static on the monitor, eyes in the doorway -----
  SCENES.night = () => `<div class="nt-lamp"></div><div class="nt-dark"></div>` + svg(`
      <rect x="0" y="0" width="1600" height="900" fill="#0b0a0d"/>
      <path d="M0 0 H1600 V120 H0 Z" fill="#141118"/>
      ${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 100}" y="0" width="98" height="118" fill="${i % 2 ? '#17131b' : '#1b1620'}"/>`).join('')}
      <rect x="120" y="230" width="250" height="520" fill="#050406"/><rect x="110" y="220" width="270" height="10" fill="#2a2430"/><rect x="110" y="220" width="10" height="530" fill="#2a2430"/><rect x="370" y="220" width="10" height="530" fill="#2a2430"/>
      <rect x="1230" y="230" width="250" height="520" fill="#050406"/><rect x="1220" y="220" width="270" height="10" fill="#2a2430"/><rect x="1220" y="220" width="10" height="530" fill="#2a2430"/><rect x="1480" y="220" width="10" height="530" fill="#2a2430"/>
      <g class="nt-eyes nt-e1"><circle cx="225" cy="420" r="7" fill="#fff4b0"/><circle cx="265" cy="420" r="7" fill="#fff4b0"/></g>
      <g class="nt-eyes nt-e2"><circle cx="1335" cy="460" r="6" fill="#ff5a4a"/><circle cx="1372" cy="460" r="6" fill="#ff5a4a"/></g>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 134}" y="750" width="67" height="40" fill="#e9e6df" opacity=".08"/><rect x="${i * 134 + 67}" y="790" width="67" height="40" fill="#e9e6df" opacity=".08"/>`).join('')}
      <rect x="0" y="760" width="1600" height="140" fill="#18141c" opacity=".7"/>
      <rect x="560" y="720" width="480" height="24" fill="#2b2420"/><rect x="590" y="744" width="20" height="156" fill="#221c19"/><rect x="990" y="744" width="20" height="156" fill="#221c19"/>
      <rect x="690" y="590" width="220" height="130" rx="10" fill="#1f1c22"/><rect x="704" y="602" width="192" height="104" fill="#0d1a12" class="nt-screen"/><rect x="782" y="720" width="36" height="10" fill="#1f1c22"/>
      <text x="712" y="622" fill="#4cff86" font-family="monospace" font-size="14" class="nt-rec">● REC  CAM 04</text>
      <circle cx="630" cy="706" r="12" fill="#3a3330"/><rect x="618" y="690" width="24" height="16" fill="#463c37"/>`) +
    `<div class="nt-static"></div>`;
  // ----- the magic school: a castle on a cliff under the moon, floating candles, shooting stars -----
  SCENES.wizard = () => `<div class="moon wz-moon"></div>` + parts('star', 70, () => `left:${R(0, 100)}%;top:${R(0, 55)}%;animation-duration:${R(2, 6)}s;animation-delay:-${R(0, 6)}s`) +
    `<i class="wz-shoot"></i>` + svg(`
      <path d="M0 900 L0 690 Q300 640 560 700 Q760 740 980 660 L1600 640 L1600 900 Z" fill="#1a1530"/>
      <g fill="#120f24">
        <rect x="1040" y="430" width="380" height="240"/><rect x="1080" y="330" width="60" height="340"/><polygon points="1072,330 1110,240 1148,330"/>
        <rect x="1210" y="290" width="70" height="380"/><polygon points="1200,290 1245,180 1290,290"/><rect x="1340" y="370" width="54" height="300"/><polygon points="1332,370 1367,290 1402,370"/>
        <rect x="980" y="500" width="70" height="170"/><polygon points="972,500 1015,430 1058,500"/>
      </g>
      ${[[1100, 380], [1100, 430], [1236, 330], [1236, 390], [1236, 450], [1360, 410], [1160, 520], [1300, 520], [1010, 540], [1390, 470]].map(([x, y]) => `<rect x="${x}" y="${y}" width="10" height="16" rx="5" fill="#ffcf6b" class="wz-win"/>`).join('')}
      <path d="M0 900 L0 780 Q400 740 800 790 T1600 770 L1600 900 Z" fill="#0d0b1a"/>`) +
    parts('candle', 14, () => `left:${R(4, 70)}%;top:${R(8, 50)}%;animation-duration:${R(6, 11)}s;animation-delay:-${R(0, 10)}s`);
  // ----- extra life for older themes -----
  const add = (id, extra) => { const base = SCENES[id]; SCENES[id] = () => base() + extra(); };
  add('glass', () => parts('spark', 26, () => `left:${R(0, 100)}%;top:${R(0, 100)}%;animation-duration:${R(6, 14)}s;animation-delay:-${R(0, 14)}s`));
  add('calm', () => parts('bird', 4, () => `top:${R(10, 30)}%;animation-duration:${R(30, 50)}s;animation-delay:-${R(0, 50)}s`).replace(/<\/i>/g, 'ˇ</i>'));
  add('neon', () => parts('star', 40, () => `left:${R(0, 100)}%;top:${R(0, 45)}%;animation-duration:${R(2, 5)}s;animation-delay:-${R(0, 5)}s`) + `<div class="sun neon-sun"></div>`);
  add('jazz', () => svg(skyline(800, 'rgba(25,8,14,.9)', 60, 240, 0.12, '#ffcf6b')));
  add('souls', () => parts('ash', 30, () => `left:${R(0, 100)}%;animation-duration:${R(10, 20)}s;animation-delay:-${R(0, 20)}s`));
  add('wood', () => `<div class="shelves"></div>`);

  let current = '';
  window.applyScene = function applyScene(themeId) {
    if (themeId === current) return;
    current = themeId;
    seed = 7 + themeId.length * 31;
    const host = document.getElementById('scene');
    if (!host) return;
    host.className = `scene scene-${themeId}`;
    host.innerHTML = (SCENES[themeId] || (() => ''))();
  };
})();
