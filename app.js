// ---------- Storage (Electron API, or localStorage when opened in a plain browser) ----------
const pv = {
  load: async () => { try { return JSON.parse(localStorage.getItem('preview-data')); } catch { return null; } },
  save: async (d) => { try { localStorage.setItem('preview-data', JSON.stringify(d)); } catch {} },
  launch: async (t) => { window.open(t, '_blank'); return ''; },
  pickFile: async () => null,
  pickDir: async () => null,
  fileIcon: async () => null,
  fileInfo: async () => ({ exists: false }),
  pathForFile: () => '',
  paths: async () => ({ mods: '' }),
  importSteam: async () => ({ error: 'الاستيراد يشتغل داخل البرنامج' }),
  importEpic: async () => ({ error: 'الاستيراد يشتغل داخل البرنامج' }),
  detectEmulators: async () => [],
  scanRoms: async () => [],
  findCover: async () => null,
  webMeta: async () => null,
  steamApp: async () => null,
  checkImage: async () => true,
  consoleArt: async () => null,
  videoState: async () => null,
  videoSeek: async () => null,
  mediaKey: async () => false,
  onPlaytime: () => {},
  onVoiceStart: () => {},
  log: () => {},
  onDebugGoto: () => {},
  btBattery: async () => [],
  scanShots: async () => ({}),
  shotsFolder: async () => '',
  spotifyNow: async () => ({ running: false }),
  mediaNow: async () => ({ ok: false }),
  mediaSeek: async () => ({ ok: false }),
  spDockShow: async () => ({ ok: false }),
  spDockMove: async () => ({ ok: false }),
  spDockHide: async () => ({ ok: false }),
  shareStart: async () => ({ error: 'يشتغل داخل البرنامج' }),
  shareStop: async () => true,
  emuCatalog: async () => [],
  romLaunch: async () => 'يشتغل داخل البرنامج',
  romsList: async () => ({ list: [] }),
  romImport: async () => null,
  romsFolder: async () => {},
  emuPrepare: async () => [],
  biosStatus: async () => ({}),
  importMore: async () => ({ games: [] }),
  onRomAdded: () => {},
  onRomStatus: () => {},
  imgData: async (s) => s,
  saveCard: async () => '',
  showCard: async () => {},
  emuInstall: async () => [],
  onEmuProgress: () => {},
  discoverEmus: async () => ({ folders: [], emus: [] }),
  fullscreen: async () => false,
  autostart: async () => false,
  ds4Path: async () => null,
  onDownload: () => {},
  gameInfo: async () => null,
  seriesScan: async () => [],
  photosScan: async () => [],
  torAdd: async () => ({ error: 'يشتغل داخل البرنامج' }),
  torAct: async () => false,
  torFolder: async () => {},
  onTorrent: () => {},
  padStandard: async () => ({}),
  storageScan: async (items) => items.map((i, n) => ({ id: i.id, size: (n + 1) * 3.1e9, where: '', can: !!i.rom })),
  storageDelete: async () => ({ ok: true }),
  savesBackup: async () => '',
  savesOpen: async () => {},
  modsInstall: async () => ({ ok: false, msg: 'يشتغل داخل البرنامج' }),
  logsGet: async () => ({ events: [], history: [] }),
  logsOpen: async () => {},
  storesScan: async () => [],
  torlibSave: async () => null,
  ...(window.api || {}), // real functions from the app; the stubs above only fill gaps
};
const inElectron = !!window.api;

const uid = () => Math.random().toString(36).slice(2, 10);
const isWeb = (t) => /^https?:\/\//i.test(t || '');
const isDrivePath = (t) => /^[a-zA-Z]:[\\/]/.test(t || '') || (t || '').startsWith('\\\\');
const toImageUrl = (p) => !p ? '' : isDrivePath(p) ? 'file:///' + encodeURI(p.replace(/\\/g, '/')) : p;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtClock = (sec) => { sec = Math.floor(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`; };

// ---------- Emulator platforms ----------
const PLATFORMS = {
  ps1: { label: 'بلايستيشن 1', exts: 'cue,chd,pbp,m3u,iso', args: '{rom}', thumbs: 'Sony - PlayStation' },
  ps2: { label: 'بلايستيشن 2', exts: 'iso,chd,cso,gz', args: '-fullscreen {rom}', thumbs: 'Sony - PlayStation 2' },
  ps3: { label: 'بلايستيشن 3', exts: 'eboot.bin', args: '--no-gui {rom}', thumbs: 'Sony - PlayStation 3' },
  psp: { label: 'PSP', exts: 'iso,cso,pbp,chd', args: '{rom}', thumbs: 'Sony - PlayStation Portable' },
  gc: { label: 'جيم كيوب / وي', exts: 'iso,rvz,gcm,wbfs,ciso,gcz', args: '-b -e {rom}', thumbs: 'Nintendo - GameCube' },
  switch: { label: 'سويتش', exts: 'nsp,xci', args: '{rom}', thumbs: '' },
  n64: { label: 'نينتندو 64', exts: 'z64,n64,v64', args: '{rom}', thumbs: 'Nintendo - Nintendo 64' },
  snes: { label: 'سوبر نينتندو', exts: 'sfc,smc', args: '{rom}', thumbs: 'Nintendo - Super Nintendo Entertainment System' },
  gba: { label: 'جيم بوي أدفانس', exts: 'gba', args: '{rom}', thumbs: 'Nintendo - Game Boy Advance' },
  nds: { label: 'نينتندو DS', exts: 'nds', args: '{rom}', thumbs: 'Nintendo - Nintendo DS' },
  other: { label: 'أخرى', exts: 'iso', args: '{rom}', thumbs: '' },
};
const splitArgs = (s) => (s.match(/"[^"]*"|\S+/g) || []).map((x) => x.replace(/^"|"$/g, ''));
const cleanRomName = (raw) => (raw.replace(/\s*[([].*?[)\]]/g, '').replace(/_/g, ' ').trim() || raw).replace(/^(.+?), (The|A|An)\b/, '$2 $1'); // "Legend of Zelda, The - X" -> "The Legend of Zelda - X"
const libretroCover = (sys, raw) => !sys ? '' :
  `https://raw.githubusercontent.com/libretro-thumbnails/${sys.replace(/ /g, '_')}/master/Named_Boxarts/${encodeURIComponent(raw.replace(/[&*/:`<>?\\|"]/g, '_'))}.png`;

// Steam artwork lives at a few addresses; newer games and demos only have some of them.
function nextSteamArt(url) {
  // Console box art (libretro): file names often lack the region tag the archive uses
  const lr = /^(https:\/\/raw\.githubusercontent\.com\/libretro-thumbnails\/[^/]+\/master\/Named_Boxarts\/)(.+)\.png$/.exec(url);
  if (lr) {
    const name = decodeURIComponent(lr[2]);
    const base = name.replace(/\s*\((USA|Europe|USA, Europe|Japan)\)$/, '');
    const order = ['', ' (USA)', ' (Europe)', ' (USA, Europe)', ' (Japan)'];
    const cur = order.findIndex((suf) => base + suf === name);
    const next = order[cur + 1];
    return next === undefined ? null : lr[1] + encodeURIComponent(base + next) + '.png';
  }
  let m = /cdn\.cloudflare\.steamstatic\.com\/steam\/apps\/(\d+)\/(library_600x900|library_hero)\.jpg/.exec(url);
  if (m) return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${m[1]}/${m[2]}.jpg`;
  m = /store_item_assets\/steam\/apps\/(\d+)\/library_600x900\.jpg/.exec(url);
  if (m) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${m[1]}/header.jpg`;
  m = /store_item_assets\/steam\/apps\/(\d+)\/library_hero\.jpg/.exec(url);
  if (m) return `https://cdn.cloudflare.steamstatic.com/steam/apps/${m[1]}/page_bg_generated_v6b.jpg`;
  return null;
}
function wireImages(root) {
  root.querySelectorAll('img.app-icon').forEach((img) => { img.onerror = () => { const c = img.parentElement; img.remove(); if (c && !c.querySelector('.initial')) c.insertAdjacentHTML('beforeend', `<span class="initial">${esc((c.closest('[data-item]') && findItem(c.closest('[data-item]').dataset.item)?.item.name || '?')[0])}</span>`); }; });
  root.querySelectorAll('img.cov, .collage img').forEach((img) => {
    // Some art addresses never answer instead of failing; treat a slow image as missing.
    const watch = () => { clearTimeout(img._t); img._t = setTimeout(() => { if (img.isConnected && !img.naturalWidth && img.complete) img.onerror(); }, 25000); };
    img.onload = () => {
      clearTimeout(img._t);
      // a wide picture in a tall tile: show it whole over a blurred copy instead of a zoomed-in crop
      const c = img.closest('.cover');
      if (c && img.naturalWidth > img.naturalHeight * 1.15 && c.clientHeight > c.clientWidth * 1.1) { c.classList.add('wide'); c.style.setProperty('--wbg', `url("${img.src.replace(/"/g, '%22')}")`); }
      else c?.classList.remove('wide');
      c?.classList.toggle('logo', /logo/i.test(img.src)); // just a logo (no box art anywhere): put it on a light card so it reads
    };
    if (img.complete && img.naturalWidth) img.onload();
    watch();
    img.onerror = () => {
      clearTimeout(img._t);
      if (img._failed?.has(img.src)) return;
      (img._failed ||= new Set()).add(img.src);
      const n = nextSteamArt(img.src);
      if (n) { img.src = n; watch(); return; }
      const id = img.closest('[data-item]')?.dataset.item; // read before the picture leaves the page
      img.remove();
      const it = id && findItem(id)?.item;
      const m = it && /^steam:\/\/(?:rungameid|install)\/(\d+)/.exec(it.target || '');
      if (it && !it.artTried) pv.log(`art: ${it.name} images failed (${it.target})`);
      if (!it || it.rom) return;
      const use = (a) => { if (!a?.image || a.image === it.image) return false; it.image = a.image; if (a.hero) it.hero = a.hero; save(); if (currentPageId) renderPage(); else renderHome(); return true; };
      if (m && !it.artTried) {
        it.artTried = true; save();
        pv.steamApp(m[1]).then(async (a) => { if (!use(a) && !use(await pv.findCover(it.name))) { it.artTried2 = true; use(await pv.findCover(it.name, true)); } });
      } else if (!it.artTried2) {
        // even the store pictures failed: look past Steam (Wikipedia, then a web picture search)
        it.artTried2 = true; save();
        pv.findCover(it.name, /steamstatic|steampowered/.test(it.image || '')).then((a) => { pv.log(`art: ${it.name} -> ${a?.image || 'none'}`); use(a); });
      }
    };
  });
}
const APP_LIKE = /wallpaper engine|soundpad|steamvr|obs studio|aseprite|blender|rpg maker|fps monitor|lossless scaling|spacewar/i;

const DEFAULT_DATA = () => ({
  version: 2,
  theme: 'glass',
  settings: { voiceModel: 'small' },
  ratingCriteria: ['الجرافيكس', 'الجيم بلاي', 'القصة', 'الساوند تراك'],
  pages: [
    { id: 'games', type: 'games', name: 'ألعاب', icon: '🎮', items: [] },
    { id: 'emu', type: 'emu', name: 'محاكيات', icon: '🕹️', items: [], platforms: [] },
    { id: 'watch', name: 'مشاهدة', icon: '🎬', items: [
      { id: uid(), name: 'YouTube', target: 'https://www.youtube.com', image: '', categories: [], voice: 'يوتيوب' },
      { id: uid(), name: 'Netflix', target: 'https://www.netflix.com', image: '', categories: [], voice: 'نتفلكس' },
      { id: uid(), name: 'Disney+', target: 'https://www.disneyplus.com', image: '', categories: [], voice: 'ديزني' },
      { id: uid(), name: 'Shahid', target: 'https://shahid.mbc.net', image: '', categories: [], voice: 'شاهد' },
      { id: uid(), name: 'Prime Video', target: 'https://www.primevideo.com', image: '', categories: [], voice: 'برايم' },
      { id: uid(), name: 'OSN+', target: 'https://osnplus.com', image: '', categories: [], voice: 'او اس ان' },
      { id: uid(), name: 'Crunchyroll', target: 'https://www.crunchyroll.com', image: '', categories: [], voice: 'كرنشي رول' },
      { id: uid(), name: 'Twitch', target: 'https://www.twitch.tv', image: '', categories: [], voice: 'تويتش' },
    ] },
    { id: 'music', name: 'سبوتيفاي', icon: '🎵', items: [
      { id: uid(), name: 'Spotify', target: 'spotify:', image: '', categories: [], voice: 'سبوتيفاي' },
    ] },
    { id: 'apps', type: 'apps', name: 'تطبيقات', icon: '🧰', items: [] },
    { id: 'mods', type: 'mods', name: 'مودات وتعريبات', icon: '🧩', items: [] },
    { id: 'gallery', type: 'gallery', name: 'الصور', icon: '📸', items: [] },
  ],
});

function migrate(d) {
  if (!d || !Array.isArray(d.pages)) return DEFAULT_DATA();
  const def = DEFAULT_DATA();
  d.settings = { ...def.settings, ...(d.settings || {}) };
  if (!d.settings.voiceChosen) d.settings.voiceModel = 'small'; // better Arabic; user can switch in settings
  if (!d.ratingCriteria) d.ratingCriteria = def.ratingCriteria;
  const games = d.pages.find((p) => p.id === 'games'); if (games && !games.type) games.type = 'games';
  for (const id of ['emu', 'apps', 'mods', 'gallery']) {
    if (d.pages.some((p) => p.id === id) || (d.removedPages || []).includes(id)) continue;
    const tpl = def.pages.find((p) => p.id === id);
    const at = id === 'emu' ? Math.min(1, d.pages.length) : d.pages.length;
    d.pages.splice(at, 0, tpl);
  }
  d.version = 2;
  return d;
}

const avgRating = (i) => {
  const v = Object.values(i.ratings || {}).filter((n) => typeof n === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const playMinutes = (i) => Math.round((i.playtime || 0) / 60) + (i.steamMinutes || 0);
const fmtTime = (m) => m >= 60 ? `${Math.floor(m / 60)} س${m % 60 ? ` ${m % 60} د` : ''}` : `${m} د`;
const coverHtml = (i, cls = '') => {
  if (i.noArt) return `<div class="cover ${cls}"><span class="initial nm"><b>${esc(i.name || '?')}</b></span></div>`; // you took the picture off: just the name
  if (!i.image && i.icon) return `<div class="cover icon-cover ${cls}"><div class="icon-glow" style="background-image:url('${esc(i.icon)}')"></div><img class="app-icon" src="${esc(i.icon)}" alt=""></div>`;
  return `<div class="cover ${cls}">${i.image ? `<img class="cov" src="${esc(toImageUrl(i.image))}" alt="" loading="lazy">` : ''}<span class="initial nm"><b>${esc(i.name || '?')}</b></span></div>`;
};

const THEMES = [
  { id: 'glass', name: 'زجاجي' },
  { id: 'aero', name: 'Frutiger Aero' },
  { id: 'wood', name: 'كلاسيك خشبي' },
  { id: 'jazz', name: 'جاز' },
  { id: 'neon', name: 'نيون' },
  { id: 'calm', name: 'هادئ' },
  { id: 'classic', name: 'ويندوز قديم' },
  { id: 'cyber', name: 'سايبربانك' },
  { id: 'miami', name: 'غروب ميامي (ستايل GTA 6)' },
  { id: 'farm', name: 'مزرعة (ستايل ستاردو)' },
  { id: 'blocks', name: 'مكعبات (ستايل ماينكرافت)' },
  { id: 'arcade', name: 'أركيد قديم' },
  { id: 'souls', name: 'ظلام ونار (ستايل سولز)' },
  { id: 'pirate', name: 'بحر القراصنة (ستايل ون بيس)' },
  { id: 'najdi', name: 'نجدي' },
  { id: 'vintage', name: 'كلاسيك غامق (فينتج)' },
];

let data;
let currentPageId = null;
let currentFilter = 'all'; // 'all' | category | '__top'
let openItem = null;
const selection = new Set(); // items picked with Shift / Ctrl + click
let lastPicked = null;
let saveTimer;
let paths = { mods: '' };

const $ = (s) => document.querySelector(s);
const view = $('#view');

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => pv.save(data), 250);
}
function page(id = currentPageId) { return data.pages.find((p) => p.id === id); }
function findItem(itemId) {
  for (const p of data.pages) { const it = p.items.find((i) => i.id === itemId); if (it) return { page: p, item: it }; }
  return null;
}
const allItems = () => data.pages.flatMap((p) => p.items);
// Anything you delete is remembered, so imports and folder scans never bring it back
const itemKey = (i) => i.emuId ? 'emu:' + i.emuId : i.rom ? 'rom:' + i.rom.toLowerCase() : 't:' + String(i.target || '').toLowerCase() + (i.args ? '|' + JSON.stringify(i.args) : '');
const isRemoved = (i) => !!(data.removed && data.removed[itemKey(i)]);
function forgetItem(i) { (data.removed ||= {})[itemKey(i)] = Date.now(); }
function deleteItems(list) {
  const set = new Set(list);
  for (const i of list) forgetItem(i);
  for (const p of data.pages) p.items = p.items.filter((i) => !set.has(i));
  save();
}
// Ratings, trophies and play time belong to games (not programs or websites)
const isGameItem = (i, p = findItem(i.id)?.page) => !!p && !i.store && (p.type === 'games' || (p.type === 'emu' && !i.emuId) || p.type === 'owned');

// ---------- Background (game artwork crossfade) ----------
const layers = [...document.querySelectorAll('.bg-layer')];
let activeLayer = 0, currentBg = '';
function setBackground(url) {
  if (url === currentBg) return;
  currentBg = url;
  const bg = $('#bg');
  if (!url) { layers.forEach((l) => l.classList.remove('on')); bg.classList.remove('has-image'); return; }
  const next = layers[1 - activeLayer];
  const img = new Image();
  img.onerror = () => { const n = nextSteamArt(img.src); if (n && currentBg === url) img.src = n; };
  img.onload = () => {
    if (currentBg !== url) return;
    next.style.backgroundImage = `url("${img.src}")`;
    next.classList.add('on');
    layers[activeLayer].classList.remove('on');
    activeLayer = 1 - activeLayer;
    bg.classList.add('has-image');
  };
  img.src = url;
}

// ---------- Navigation ----------
function clearSpecialViews() { if (window.SB) { SB.moodView = null; SB.ratingsView = null; } }
function goHome() { currentPageId = null; clearSpecialViews(); closeWebIfOpen(); window.closeDetail?.(); render(); }
function goPage(id, filter = 'all') { if (!page(id)) return; clearSpecialViews(); currentPageId = id; currentFilter = filter; closeWebIfOpen(); render(); }

// ---------- Rendering ----------
function render() {
  document.body.dataset.theme = data.theme;
  window.applyScene?.(data.theme);
  document.body.classList.toggle('art-strong', !!data.settings?.artStrong);
  const p = currentPageId ? page() : null;
  document.body.classList.toggle('home', !p);
  $('#backBtn').hidden = !p;
  $('#importBtn').hidden = !(p && (p.type === 'games' || p.type === 'apps'));
  $('#emuBtn').hidden = !(p && p.type === 'emu');
  $('#addBtn').hidden = true; // adding happens from the + tile / card
  if (p) $('#title').innerHTML = `${pageIcon(p, 'title-ico')}<span>${esc(p.name)}</span>`; else $('#title').textContent = greeting();
  $('#subtitle').textContent = p ? (p.type === 'gallery' ? 'لقطاتك من كل الألعاب' : `${p.items.length} عنصر`) : [new Date().toLocaleDateString('ar-SA-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' }), new Date().toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long' }), window.nextEventLine?.() || ''].filter(Boolean).join(' · ');
  setBackground('');
  renderDrawer();
  window.SB?.drawTop();
  document.body.classList.toggle('special-view', !!(window.SB && (SB.moodView || SB.ratingsView)));
  if (!p && window.SB?.ratingsView && SB.renderRatings()) return;
  if (!p && window.SB?.moodView && SB.renderMood()) return;
  p ? renderPage() : renderHome();
}

function greeting() {
  const h = new Date().getHours(), n = data?.user?.name ? ` يا ${data.user.name}` : '';
  return h < 5 ? `سهران${n}؟ 🌙` : h < 12 ? `صباح الخير${n} ☀️` : h < 18 ? `هلا${n} 👋` : `مساء الخير${n} 🌆`;
}

let homeFocus = 0;
const pageArt = (p) => p.items.find((i) => i.hero || i.image);

function renderHome() {
  const items = allItems();
  const resumable = items.filter((i) => isWeb(i.target) && i.lastUrl && (i.lastUrl !== i.target || i.lastTime))
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0)).slice(0, 8);
  const recent = items.filter((i) => !isWeb(i.target) && i.lastOpened && findItem(i.id)?.page.type !== 'mods')
    .sort((a, b) => b.lastOpened - a.lastOpened).slice(0, 3);
  const sres = window.Series?.resumeList() || [];
  homeFocus = Math.max(0, Math.min(data.homeFocus ?? 0, data.pages.length - 1));

  const artFor = (p) => {
    const a = pageArt(p);
    return a ? `<img class="cov" src="${esc(toImageUrl(a.image || a.hero))}" alt="">` : '';
  };

  view.innerHTML = `
    <div class="shelf" id="shelf"><div class="shelf-track" id="shelfTrack" dir="ltr">
      ${data.pages.map((p, n) => `
        <div class="shelf-card" data-idx="${n}" data-page="${p.id}" dir="rtl" tabindex="-1">
          <div class="art">${pageCardBg(p)}</div>
          <div class="shade"></div>
          <div class="icon">${pageIcon(p)}</div>
          <div class="meta"><div class="name">${esc(p.name)}</div><div class="count">${p.type === 'calendar' ? (data.events || []).length + ' موعد' : p.items.length + ' عنصر'}</div></div>
        </div>`).join('')}
      <div class="shelf-card add" id="addPageCard" title="صفحة جديدة"><span>+</span></div>
    </div></div>
    <div class="shelf-info" id="shelfInfo"></div>
    ${recent.length ? `
      <div class="section-title">آخر ما فتحت</div>
      <div class="recent-row">
        ${recent.map((i) => `
          <div class="recent" tabindex="0" data-item="${i.id}" title="${esc(i.name)}">
            ${coverHtml(i)}
            <div class="label">${esc(i.name)}</div>
          </div>`).join('')}
      </div>` : ''}
    ${(resumable.length || sres.length) ? `
      <div class="section-title">كمّل من وين وقفت</div>
      <div class="resume-row">
        ${sres.map((r) => `
          <div class="resume" tabindex="0" data-sres="${esc(r.dir)}">
            <div class="thumb">🎞️</div>
            <div><b>${esc(r.dir.split(/[\\/]/).pop())}</b><small>${esc(r.file.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''))} · ⏱ ${fmtClock(r.p.t)}</small></div>
          </div>`).join('')}
        ${resumable.map((i) => `
          <div class="resume" tabindex="0" data-item="${i.id}">
            <div class="thumb" style="${i.image ? `background-image:url('${esc(toImageUrl(i.image))}')` : ''}">${i.image ? '' : esc(i.name[0])}</div>
            <div><b>${esc(i.name)}</b><small>${esc([i.lastNote, i.lastTime ? `⏱ ${fmtClock(i.lastTime)}` : ''].filter(Boolean).join(' · ') || 'آخر مكان فتحته')}</small></div>
          </div>`).join('')}
      </div>` : ''}`;

  wireImages(view);
  view.querySelectorAll('.shelf-card[data-idx]').forEach((el) => {
    const n = Number(el.dataset.idx);
    el.onclick = (e) => { if (el._dragged) { el._dragged = false; e.preventDefault(); return; } (n === homeFocus ? goPage(el.dataset.page) : setHomeFocus(n)); };
    el.ondblclick = () => goPage(el.dataset.page);
    // press and hold a page, then slide it left / right to move it (mouse or finger)
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      const x0 = e.clientX, y0 = e.clientY; let lifted = false, target = null, chip = null;
      const hold = setTimeout(() => {
        lifted = true; el._dragged = true; el.classList.add('lifting'); document.body.classList.add('reordering');
        try { el.setPointerCapture(e.pointerId); } catch {}
        chip = document.createElement('div'); chip.className = 'reorder-chip'; chip.textContent = `↔ ${data.pages[n].name}`; document.body.appendChild(chip);
        chip.style.left = x0 + 'px'; chip.style.top = y0 + 'px';
        navigator.vibrate?.(20);
      }, 420);
      const move = (ev) => {
        if (!lifted) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) cleanup(); return; }
        chip.style.left = ev.clientX + 'px'; chip.style.top = ev.clientY + 'px';
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList?.contains('shelf-card') && x.dataset.idx && x !== el);
        view.querySelectorAll('.shelf-card.drop-here').forEach((x) => x !== under && x.classList.remove('drop-here'));
        target = under || null; target?.classList.add('drop-here');
      };
      const up = () => {
        if (lifted && target) {
          const to = Number(target.dataset.idx);
          const [pg] = data.pages.splice(n, 1); data.pages.splice(to, 0, pg); save();
          homeFocus = to; renderHome(); setHomeFocus(to, true); toast(`انتقلت ${pg.name}`);
        }
        cleanup();
      };
      const cleanup = () => {
        clearTimeout(hold); el.classList.remove('lifting'); document.body.classList.remove('reordering'); chip?.remove();
        view.querySelectorAll('.drop-here').forEach((x) => x.classList.remove('drop-here'));
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cleanup);
        if (!lifted) el._dragged = false;
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cleanup);
    };
    el.oncontextmenu = (e) => el._dragged || document.body.classList.contains('reordering') ? e.preventDefault() : showCtx(e, [
      { label: 'فتح', run: () => goPage(el.dataset.page) },
      { label: 'تعديل الصفحة (الاسم والصورة)', run: () => openPageEditor(el.dataset.page) },
      { label: 'تحريك لليسار', run: () => { movePage(el.dataset.page, -1); setHomeFocus(Math.max(0, n - 1)); } },
      { label: 'تحريك لليمين', run: () => { movePage(el.dataset.page, 1); setHomeFocus(Math.min(data.pages.length - 1, n + 1)); } },
      '-',
      { label: 'حذف الصفحة', danger: true, run: () => deletePage(el.dataset.page) },
    ]);
  });
  $('#addPageCard').onclick = () => openPageEditor(null);
  view.querySelectorAll('[data-sres]').forEach((el) => { el.onclick = () => window.Series?.resume(el.dataset.sres); });
  view.querySelectorAll('.resume[data-item], .recent').forEach((el) => {
    const f = findItem(el.dataset.item);
    el.onclick = () => { if (f) launchItem(f.item); };
  });
  // Mouse wheel over the strip moves between pages
  let wheelLock = 0;
  $('#shelf').addEventListener('wheel', (e) => {
    if (window.controls && !controls().mouse.wheelStrip) return;
    e.preventDefault();
    const now = Date.now(); if (now - wheelLock < 180) return; wheelLock = now;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    setHomeFocus(homeFocus + (d > 0 ? 1 : -1));
  }, { passive: false });
  setHomeFocus(homeFocus, true);
}

function setHomeFocus(n, instant = false) {
  if (currentPageId || !data.pages.length) return;
  n = Math.max(0, Math.min(n, data.pages.length - 1));
  homeFocus = n;
  if (data.homeFocus !== n) { data.homeFocus = n; save(); }
  const cards = [...view.querySelectorAll('.shelf-card[data-idx]')];
  cards.forEach((c, i) => c.classList.toggle('focus', i === n));
  // Every card is placed by its own transform; position and size animate with the same timing
  // curve, so neighbours stay glued together for the whole slide and nothing jumps or wobbles.
  const track = $('#shelfTrack');
  if (track && cards[0]) {
    const gap = 18, small = 150, big = 360;
    const lead = Math.min(110, $('#shelf').clientWidth * 0.07);
    const all = [...track.children];
    if (instant) all.forEach((c) => { c.style.transition = 'none'; });
    let x = lead - n * (small + gap);
    all.forEach((c, i) => { c.style.transform = `translate3d(${x}px,0,0)`; x += (i === n ? big : small) + gap; });
    if (instant) { void track.offsetWidth; all.forEach((c) => { c.style.transition = ''; }); }
  }
  const p = data.pages[n];
  const a = p.noAutoArt ? null : pageArt(p);
  setBackground(p.cover ? toImageUrl(p.cover) : a ? toImageUrl(a.hero || a.image) : '');
  const preview = (['games', 'apps', 'emu', 'mods'].includes(p.type) ? [...p.items].filter((i) => !i.owned && !i.store).sort((x, y) => String(x.name).localeCompare(String(y.name), 'ar', { numeric: true, sensitivity: 'base' })) : p.items).slice(0, 10);
  const info = $('#shelfInfo');
  info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap');
  info.innerHTML = `
    <div class="info-head">
      <h2>${pageIcon(p, 'h-ico')} ${esc(p.name)}</h2>
    </div>
    ${preview.length ? `<div class="mini-row">${preview.map((i) => `
      <div class="mini ${['games', 'emu', 'owned'].includes(p.type) && !i.emuId ? '' : 'app'}" tabindex="0" data-item="${i.id}" title="${esc(i.name)}">${coverHtml(i)}</div>`).join('')}
      ${p.items.length > preview.length ? `<div class="mini more" id="seeAll">+${p.items.filter((i) => !i.owned).length - preview.length > 0 ? p.items.filter((i) => !i.owned).length - preview.length : p.items.length - preview.length}</div>` : ''}</div>`
      : `<div class="empty small">${p.type === 'calendar' ? esc(window.nextEventLine?.() || 'ادخل وأضف مواعيدك، ويطلع لك عد تنازلي لكل واحد') : p.type === 'gallery' ? 'لقطاتك من كل الألعاب' : 'الصفحة فاضية، ادخلها وأضف أشياء.'}</div>`}`;
  wireImages($('#shelfInfo'));
  $('#openFocused')?.addEventListener('click', () => goPage(p.id));
  const seeAll = $('#seeAll'); if (seeAll) seeAll.onclick = () => goPage(p.id);
  $('#shelfInfo').querySelectorAll('.mini[data-item]').forEach((m) => {
    const f = findItem(m.dataset.item);
    m.onclick = () => f && launchItem(f.item);
    m.onmouseenter = () => f && (f.item.hero || f.item.image) && setBackground(toImageUrl(f.item.hero || f.item.image));
  });
}

// ---------- "جديد": anything added after today wears a gold frame until you hover it ----------
function isNewItem(i) { return !!data.seenInit && !(data.seen || {})[i.id]; }
function markSeen(ids) { data.seen ||= {}; let n = 0; for (const id of ids) if (!data.seen[id]) { data.seen[id] = 1; n++; } if (n) save(); return n; }
function newCount() { return allItems().filter(isNewItem).length; }
function tileHtml(i, p = page()) {
  const game = isGameItem(i, p);
  const a = game ? avgRating(i) : null, m = playMinutes(i);
  return `
    <div class="tile ${selection.has(i.id) ? 'picked' : ''} ${isNewItem(i) ? 'is-new' : ''}" tabindex="0" data-item="${i.id}" draggable="true">
      ${coverHtml(i)}${isNewItem(i) ? '<span class="new-badge">جديد</span>' : ''}
      ${a !== null ? `<div class="badge">★ ${a.toFixed(1)}</div>` : ''}
      ${game ? `<button class="rate-btn" data-rate="${i.id}" title="تقييم">★</button>` : ''}
      <div class="label">${esc(i.name)}</div>
      ${i.desc ? `<div class="sub desc">${esc(i.desc)}</div>` : `<div class="sub">${esc([...(i.categories || []).filter((c) => c !== i.platformLabel), m ? fmtTime(m) : ''].filter(Boolean).join(' · '))}</div>`}
    </div>`;
}

function renderPage() {
  const p = page();
  if (p.type === 'gallery') { window.Shots ? Shots.renderGallery(view) : (view.innerHTML = ''); return; }
  if (p.type === 'calendar') { $('#subtitle').textContent = 'هجري وميلادي، مع تذكير وعد تنازلي'; window.Calendar ? Calendar.render() : (view.innerHTML = ''); return; }
  if (p.id === 'music') {
    view.innerHTML = `<div id="spDockArea"><div class="spd-msg"><svg viewBox="0 0 24 24" width="64" height="64"><circle cx="12" cy="12" r="11" fill="#1ed760"/><path d="M6.5 9.3c3.6-1.1 7.6-.8 10.8 1M7.2 12.3c3-.8 6.2-.5 8.8.9M7.8 15.1c2.4-.6 4.8-.4 6.9.7" stroke="#000" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><b>جاري فتح سبوتيفاي…</b><small>لو ما طلع خلال ثواني، تأكد إن برنامج سبوتيفاي مثبت</small></div></div>`;
    $('#subtitle').textContent = 'سبوتيفاي داخل البرنامج';
    spDockSync(true);
    return;
  }
  const cats = [...new Set(p.items.flatMap((i) => i.categories || []))];
  if (currentFilter !== 'all' && currentFilter !== '__top' && !cats.includes(currentFilter)) currentFilter = 'all';
  const showTop = p.items.length && p.type !== 'apps' && p.type !== 'mods';

  const chips = (cats.length || showTop) ? `<div class="chips">
      <button class="chip ${currentFilter === 'all' ? 'on' : ''}" data-cat="all">الكل</button>
      ${showTop ? `<button class="chip ${currentFilter === '__top' ? 'on' : ''}" data-cat="__top">🏆 الأفضل</button>` : ''}
      ${cats.map((c) => `<button class="chip ${currentFilter === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>` : '<div style="height:10px"></div>';

  const addTile = `<div class="tile add" id="addTile"><div class="cover"><span class="initial">+</span></div><div class="label">إضافة</div></div>`;
  const emptyMsg = {
    games: 'الصفحة فاضية. اضغط "⤓ استيراد" لجلب ألعابك من ستيم وإبيك، أو + لإضافة لعبة.',
    emu: 'اضغط "⚙ المحاكيات" فوق، واختر المحاكي ومجلد الألعاب لكل منصة، وتنضاف الألعاب لحالها.',
    apps: 'اسحب أي برنامج أو اختصار من سطح المكتب وأفلته هنا، أو اضغط +.',
    mods: 'حط مودات وتعريبات ألعابك في مجلد المودات، أو أضف هنا أي ملف أو مجلد.',
  }[p.type] || 'الصفحة فاضية. اضغط + وأضف أول شي.';

  if (currentFilter === '__top') {
    view.innerHTML = chips + leaderboardHtml(p);
  } else {
    let items = currentFilter === 'all' ? p.items : p.items.filter((i) => (i.categories || []).includes(currentFilter));
    if (['games', 'apps', 'emu', 'mods'].includes(p.type)) items = [...items].sort((a, b) => (b.emuId ? 1 : 0) - (a.emuId ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'ar', { numeric: true, sensitivity: 'base' }));
    let body;
    if (p.type === 'emu' && currentFilter === 'all' && items.length) {
      const groups = new Map();
      for (const i of items) { const g = i.platformLabel || 'أخرى'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); }
      body = [...groups].map(([g, list]) => `
        <div class="group-title">${esc(g)} <small>${list.length}</small></div>
        <div class="tiles ${g === 'المحاكيات' || list.every((i) => i.emuId) ? 'square' : 'portrait'}">${list.map((i) => tileHtml(i, p)).join('')}</div>`).join('') + `<div class="tiles portrait" style="margin-top:22px">${addTile}</div>`;
    } else if (p.type === 'games' && currentFilter === 'all') {
      const stores = items.filter((i) => i.store);
      const inst = items.filter((i) => !i.owned && !i.store), instNames = new Set(inst.map((i) => gameKey(i.name)));
      const owned = items.filter((i) => i.owned && !instNames.has(gameKey(i.name)));
      body = (stores.length ? `<div class="group-title">🛒 المتاجر <small>${stores.length}</small></div>
        <div class="tiles square stores-row">${stores.map((i) => tileHtml(i, p)).join('')}</div>` : '') + `<div class="group-title">🎮 مثبتة على جهازك <small>${inst.length}</small></div>
        <div class="tiles portrait">${inst.map((i) => tileHtml(i, p)).join('')}${addTile}</div>
        <div class="group-title">📚 مكتبتي <small>ألعاب عندي بس مو مثبتة · ${owned.length}</small><button class="btn ghost sm" id="ownedSync" title="يقرأ مكتبة ستيم وإيبك من جهازك">⟳ جيب ألعابي من ستيم وإيبك</button></div>
        <div class="tiles portrait">${owned.map((i) => tileHtml(i, p)).join('')}<div class="tile add" id="addOwned"><div class="cover"><span class="initial">+</span></div><div class="label">لعبة عندي</div></div></div>`;
    } else if (p.id === 'watch' || p.type === 'watch') {
      body = `<div class="group-title">📺 التطبيقات والمواقع <small>${items.length}</small></div>
        <div class="tiles square">${items.map((i) => tileHtml(i, p)).join('')}${addTile}</div>
        <div class="group-title">🎞️ مسلسلاتي وأفلامي <small>من مجلدات جهازك</small><span class="spacer"></span><button class="btn ghost sm" id="addSeriesDir">＋ مجلد</button></div>
        <div id="seriesBox"><p class="hint">أدوّر في مجلداتك…</p></div>`;
    } else {
      body = `<div class="tiles ${['games', 'emu', 'owned'].includes(p.type) ? 'portrait' : 'square'}">${items.map((i) => tileHtml(i, p)).join('')}${addTile}</div>`;
    }
    const nNew = newCount();
    const tools = p.items.length > 8 || nNew ? `<div class="pg-tools">
        ${p.items.length > 8 ? `<label class="pg-search"><span>🔍</span><input id="pgSearch" type="search" autocomplete="off" placeholder="${p.type === 'games' ? 'دوّر على لعبة…' : 'دوّر…'}  (Ctrl+F)" value="${esc(pageQuery.id === p.id ? pageQuery.q : '')}"><b id="pgCount"></b></label>` : ''}
        ${nNew ? `<button class="btn ghost sm new-clear" id="clearNew">✓ شيل علامة "جديد" عن الكل (${nNew})</button>` : ''}
      </div>` : '';
    const seg = p.type === 'games' ? `<div class="seg pg-seg"><button data-gt="games" class="${gamesTab === 'games' ? 'on' : ''}">🎮 الألعاب</button><button data-gt="tor" class="${gamesTab === 'tor' ? 'on' : ''}">🧲 التورنت <small>${(data.torLib || []).filter((t) => t.state !== 'done').length || ''}</small></button><button data-gt="space" class="${gamesTab === 'space' ? 'on' : ''}">💾 المساحة</button></div>` : '';
    view.innerHTML = seg + chips + tools + body + (p.items.length ? '' : `<div class="empty">${emptyMsg}</div>`) + '<div class="empty small" id="noHits" hidden>ما لقيت شي بهالاسم</div>';
    view.querySelectorAll('[data-gt]').forEach((b) => b.onclick = () => { gamesTab = b.dataset.gt; renderPage(); });
    if (p.type === 'games' && gamesTab === 'tor') { renderTorLib(seg); return; }
    if (p.type === 'games' && gamesTab === 'space') { renderSpace(seg, p); return; }
  }

  wireImages(view);
  view.querySelectorAll('.chip').forEach((el) => {
    el.onclick = () => { currentFilter = el.dataset.cat; setBackground(''); renderPage(); };
  });
  view.querySelectorAll('[data-rate]').forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); openRater(el.dataset.rate); };
  });
  view.querySelectorAll('[data-item]').forEach((el) => {
    const item = p.items.find((i) => i.id === el.dataset.item);
    if (!item) return;
    const hover = () => { if (el.classList.contains('is-new')) { markSeen([item.id]); el.classList.add('seen-now'); setTimeout(() => { el.classList.remove('is-new', 'seen-now'); el.querySelector('.new-badge')?.remove(); const c = $('#clearNew'); const n = newCount(); if (c) { if (n) c.textContent = `✓ شيل علامة "جديد" عن الكل (${n})`; else c.remove(); } }, 600); } setBackground(item.hero || item.image ? toImageUrl(item.hero || item.image) : ''); window.Music?.hoverItem(item); };
    el.onmouseenter = hover; el.onfocus = hover;
    el.onmouseleave = () => window.Music?.leaveItems();
    // Games open their detail screen first (play, rating, settings); apps and sites open straight away
    el.onclick = (ev) => {
      if (ev.shiftKey || ev.ctrlKey) { // pick several, then move or delete them together
        ev.preventDefault();
        const order = [...view.querySelectorAll('.tile[data-item]')].map((t) => t.dataset.item);
        if (ev.shiftKey && lastPicked && order.includes(lastPicked)) {
          const [a, b] = [order.indexOf(lastPicked), order.indexOf(item.id)].sort((x, y) => x - y);
          order.slice(a, b + 1).forEach((id) => selection.add(id));
        } else selection.has(item.id) ? selection.delete(item.id) : selection.add(item.id);
        lastPicked = item.id;
        drawSelection();
        return;
      }
      if (selection.size) { selection.clear(); drawSelection(); }
      (isGameItem(item, p) && !item.store && window.openDetail && !window.controls?.().mouse.clickPlays ? openDetail(item) : launchItem(item));
    };
    el.ondblclick = () => { window.closeDetail?.(); launchItem(item); };
    el.oncontextmenu = (e) => showCtx(e, [
      { label: 'فتح', run: () => launchItem(item) },
      ...(isGameItem(item, p) ? [{ label: '★ تقييم', run: () => openRater(item.id) }] : []),
      { label: 'تعديل', run: () => openEditor(item.id) },
      { label: '📌 ثبّت فوق (دخول سريع)', run: () => window.SB?.pin(item.id) },
      ...((data.moods || []).length ? [{ label: '✨ أضفه لمود…', run: () => setTimeout(() => showCtx(e, data.moods.map((m) => ({ label: `${m.emoji || ''} ${m.name}${m.items.includes(item.id) ? ' ✓' : ''}`, run: () => { m.items = m.items.includes(item.id) ? m.items.filter((x) => x !== item.id) : [...m.items, item.id]; save(); toast(m.items.includes(item.id) ? `انضاف لمود ${m.name}` : `انشال من مود ${m.name}`); } }))), 0) }] : []),
      ...(!isWeb(item.target) && (!item.image || item.noArt) ? [{ label: '🔍 جيب صورة تلقائياً', run: () => { delete item.noArt; autoCoverFor(item, true); } }] : []),
      ...(item.rom && /\.(nsp|xci)$/i.test(item.rom) ? [{ label: item.emuPref === 'lichii' ? '🔁 شغّلها بـ Ryujinx (الافتراضي)' : '🔁 شغّلها بمحاكي Lichii (لو علّقت أو طاحت)', run: () => { item.emuPref = item.emuPref === 'lichii' ? '' : 'lichii'; save(); toast(item.emuPref ? 'هاللعبة تشتغل الحين بـ Lichii' : 'رجعت تشتغل بـ Ryujinx'); } }] : []),
      ...((item.image || item.icon) && !item.noArt ? [{ label: '🖼 شيل الصورة (يكتب الاسم بس)', run: () => { item.noArt = true; save(); renderPage(); } }] : []),
      ...(isWeb(item.target) ? [{ label: item.external ? '🗔 افتحه داخل البرنامج' : '🌐 افتحه في المتصفح', run: () => { item.external = !item.external; save(); toast(item.external ? 'بيفتح في المتصفح' : 'بيفتح داخل البرنامج'); } }] : []),
      ...(item.lastUrl ? [{ label: 'ابدأ من البداية', run: () => { delete item.lastUrl; delete item.lastNote; delete item.lastTime; save(); launchItem(item); } }] : []),
      { label: selection.size > 1 && selection.has(item.id) ? `نقل المحدد (${selection.size}) لصفحة ثانية` : 'نقل لصفحة ثانية', run: () => moveItemMenu(e, item) },
      '-',
      { label: selection.size > 1 && selection.has(item.id) ? `حذف المحدد (${selection.size})` : p.type === 'games' && !item.owned && !item.store ? 'حذف (تنزل لـ "مكتبتي")' : 'حذف', danger: true, run: () => {
        const list = selection.size > 1 && selection.has(item.id) ? p.items.filter((i) => selection.has(i.id)) : [item];
        // a game you delete isn't forgotten: it moves down to "مكتبتي" (yours, not installed). Deleting it there removes it for good.
        const keep = p.type === 'games' ? list.filter((i) => !i.owned && !i.store) : [];
        const gone = list.filter((i) => !keep.includes(i));
        if (!confirm(keep.length && !gone.length ? `"${list.length > 1 ? list.length + ' ألعاب' : item.name}" تنشال من المثبتة وتنزل لـ "مكتبتي"؟` : list.length > 1 ? `حذف ${list.length} عناصر؟` : `حذف "${item.name}" نهائياً؟`)) return;
        for (const i of keep) {
          if (i.rom) { data.removed ||= {}; data.removed['rom:' + i.rom.toLowerCase()] = Date.now(); i.romWas = i.rom; delete i.rom; }
          const sid = /^steam:\/\/rungameid\/(\d+)/.exec(i.target || '')?.[1];
          i.target = sid ? `steam://install/${sid}` : ''; i.owned = true; delete i.icon;
        }
        if (gone.length) deleteItems(gone); else save();
        selection.clear(); renderPage();
        toast(keep.length ? `نزلت لـ "مكتبتي"${gone.length ? ` وانحذف ${gone.length}` : ''}` : list.length > 1 ? `انحذف ${list.length}` : 'انحذف');
      } },
    ]);
  });
  const at = $('#addTile');
  if (at) at.onclick = () => openEditor(null);
  $('#clearNew')?.addEventListener('click', () => { markSeen(allItems().map((i) => i.id)); renderPage(); toast('تم'); });
  const sb = $('#pgSearch');
  if (sb) { sb.oninput = () => { pageQuery = { id: p.id, q: sb.value }; applySearch(p); }; sb.onkeydown = (e) => { if (e.key === 'Escape') { sb.value = ''; sb.oninput(); sb.blur(); } else if (e.key === 'Enter') { view.querySelector('.tile[data-item]:not([hidden])')?.click(); } e.stopPropagation(); }; if (pageQuery.id === p.id && pageQuery.q) applySearch(p); }
  $('#addOwned')?.addEventListener('click', addOwnedGame);
  $('#ownedSync')?.addEventListener('click', () => importOwned(true));
  if ($('#seriesBox')) window.Series?.render($('#seriesBox'), p);
  $('#addSeriesDir')?.addEventListener('click', () => window.Series?.addFolder(p));
}
// ---------- Torrent library (Games ← 🧲): game torrents kept for later; one press downloads, unpacks and adds the game ----------
let gamesTab = 'games';
const torClean = (n) => String(n || '').replace(/\.torrent$/i, '').replace(/[\[(][^\])]*[\])]/g, ' ').replace(/[._]+/g, ' ').replace(/\b(fitgirl|dodi|repack|elamigos|gog|codex|plaza|empress|rune|tenoke|multi\d*|v?\d+(\.\d+){1,3}|build \d+|nsz|nsp|xci|iso|pc|ps\d|switch)\b/gi, ' ').replace(/[-+]+\s*$/, '').replace(/\s+/g, ' ').trim();
const torHuman = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : '';
async function addToTorLib(file, downloadingNow) {
  const r = await pv.torlibSave(file); if (!r) return downloadingNow ? null : toast('ما قدرت أقرأ ملف التورنت');
  data.torLib ||= [];
  const had = data.torLib.find((t) => t.name === r.name);
  if (had) { if (downloadingNow) { had.state = 'downloading'; had.pct = 0; save(); } else toast('موجود من قبل في التورنت'); return; }
  const t = { id: uid(), name: r.name, title: torClean(r.name) || r.name, file: r.file, size: r.size, image: '', state: downloadingNow ? 'downloading' : 'saved', pct: 0, added: Date.now() };
  data.torLib.unshift(t); save();
  if (!downloadingNow) toast(`🧲 انحفظ "${t.title}": اضغط تنزيل متى ما بغيت`);
  if (currentPageId === 'games' && gamesTab === 'tor') renderPage();
  pv.findCover(t.title).then((a) => { if (a?.image) { t.image = a.image; save(); if (currentPageId === 'games' && gamesTab === 'tor') renderPage(); } });
}
function renderTorLib(seg) {
  const lib = data.torLib || [];
  view.innerHTML = seg + `<p class="hint tl-hint">احفظ هنا ملفات التورنت حق الألعاب بدون ما تحملها. لما تضغط ⬇ تنزيل يحملها ويفكها ويجهزها، وتنضاف للألعاب لحالها.</p>
    <div class="tiles portrait">${lib.map((t) => `
      <div class="tile tor-tile ${t.state}" data-tor="${t.id}" title="${esc(t.name)}">
        ${coverHtml({ name: t.title, image: t.image })}
        <div class="label">${esc(t.title)}</div>
        <div class="sub">${t.state === 'done' ? '✓ نزلت وانضافت' : t.state === 'downloading' ? `<i class="tor-bar" style="--p:${t.pct || 0}%"></i>${t.pct || 0}%` : torHuman(t.size)}</div>
        <div class="tor-acts">${t.state === 'saved' ? '<button class="btn primary sm" data-dl>⬇ تنزيل</button>' : ''}<button class="btn ghost sm" data-rm title="شيله من القائمة">🗑</button></div>
      </div>`).join('')}
      <div class="tile add" id="torAddFile"><div class="cover"><span class="initial">+</span></div><div class="label">أضف ملف تورنت</div></div>
    </div>`;
  wireImages(view);
  view.querySelectorAll('[data-gt]').forEach((b) => b.onclick = () => { gamesTab = b.dataset.gt; renderPage(); }); // the Games / Torrent switch works from here too
  $('#torAddFile').onclick = async () => { const f = await pv.pickFile('torrent'); if (f) addToTorLib(f); };
  view.querySelectorAll('[data-tor]').forEach((el) => {
    const t = lib.find((x) => x.id === el.dataset.tor);
    el.querySelector('[data-dl]')?.addEventListener('click', async (e) => { e.stopPropagation(); const r = await pv.torAdd(t.file); if (r.ok) { t.state = 'downloading'; t.pct = 0; save(); renderPage(); toast(`⬇ بدأ تحميل ${t.title}`); } else toast('ما قدرت: ' + r.error); });
    el.querySelector('[data-rm]').onclick = (e) => { e.stopPropagation(); if (!confirm(`شيل "${t.title}" من قائمة التورنت؟ (ما ينحذف شي من اللعبة لو نزلت)`)) return; data.torLib = lib.filter((x) => x !== t); save(); renderPage(); };
  });
}
// ---------- Space (Games ← 💾): what each installed game takes on the disk; delete the files, keep the progress ----------
let spaceCache = null;
async function renderSpace(seg, p) {
  const games = p.items.filter((i) => !i.owned && !i.store && (i.rom || /^steam:|^[a-z]:\\/i.test(i.target || '')));
  view.innerHTML = seg + `<div class="sp-head"><div><b id="spTotal">أحسب المساحة…</b><small>حذف اللعبة هنا يمسح ملفاتها من الجهاز بس. تقدّمك (الحفظ) يبقى، وينحفظ نسخة منه في OneDrive، وترجع لـ "مكتبتي" تقدر تنزلها بعدين.</small></div>
      <span class="spacer"></span><button class="btn ghost sm" id="spSaves">☁️ مجلد الحفظ</button></div>
    <div class="sp-list" id="spList">${games.map(() => '<div class="sp-row sk"></div>').join('')}</div>`;
  $('#spSaves').onclick = () => pv.savesOpen();
  view.querySelectorAll('[data-gt]').forEach((b) => b.onclick = () => { gamesTab = b.dataset.gt; renderPage(); });
  const res = await pv.storageScan(games.map((i) => ({ id: i.id, rom: i.rom || '', target: i.target || '' })));
  if (gamesTab !== 'space' || currentPageId !== p.id) return;
  const by = new Map(res.map((r) => [r.id, r]));
  const rows = games.map((i) => ({ i, r: by.get(i.id) || { size: 0 } })).filter((x) => x.r.size > 0).sort((a, b) => b.r.size - a.r.size);
  const total = rows.reduce((t, x) => t + x.r.size, 0), max = rows[0]?.r.size || 1;
  $('#spTotal').innerHTML = `ألعابك المثبتة تاخذ <bdi dir="ltr">${torHuman(total) || '0'}</bdi> (${rows.length} لعبة)`;
  $('#spList').innerHTML = rows.map(({ i, r }) => `
    <div class="sp-row" data-sp="${i.id}">
      ${coverHtml(i, 'sp-cov')}
      <div class="sp-info"><b>${esc(i.name)}</b><small>${esc(i.platformLabel || (i.rom ? '' : 'كمبيوتر'))}</small><i class="sp-bar" style="--p:${Math.max(3, Math.round((r.size / max) * 100))}%"></i></div>
      <span class="sp-size" dir="ltr">${torHuman(r.size) || '<1 MB'}</span>
      ${r.can ? `<button class="btn ghost sm danger" data-del>🗑 احذفها من الجهاز</button>` : '<span class="sp-na" title="تنحذف من برنامجها">—</span>'}
    </div>`).join('') || '<div class="empty small">ما لقيت ألعاب أقدر أحسب مساحتها</div>';
  wireImages(view);
  view.querySelectorAll('[data-sp]').forEach((row) => {
    const i = games.find((g) => g.id === row.dataset.sp);
    row.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!confirm(`تحذف ملفات "${i.name}" من الجهاز؟\n\nتقدّمك ما ينحذف، والحفظ ينسخ في OneDrive. اللعبة تنزل لـ "مكتبتي" وتقدر تنزلها بعدين.`)) return;
      row.classList.add('busy');
      const r = await pv.storageDelete({ rom: i.rom || '', target: i.target || '', name: i.name });
      if (!r.ok) { row.classList.remove('busy'); return toast(r.msg || 'ما قدرت أحذفها'); }
      if (r.steam) { toast('فتحت لك ستيم عشان يحذفها'); row.classList.remove('busy'); return; }
      if (i.rom) { data.removed ||= {}; data.removed['rom:' + i.rom.toLowerCase()] = Date.now(); i.romWas = i.rom; delete i.rom; }
      i.target = ''; i.owned = true; save();
      toast(`🗑 انحذفت ${i.name} من الجهاز ونزلت لـ "مكتبتي"`);
      renderPage();
    });
  });
}
// keep the library's progress in step with the downloader
function torLibProgress(items) {
  if (!data) return; // a message that came in before the library loaded
  let changed = false;
  for (const t of data.torLib || []) {
    if (t.state !== 'downloading') continue;
    const x = items.find((i) => i.name === t.name); if (!x) continue;
    const pct = x.total ? Math.floor((x.done / x.total) * 100) : 0;
    if (x.status === 'complete') { t.state = 'done'; t.pct = 100; changed = true; }
    else if (pct !== t.pct) { t.pct = pct; changed = true; }
  }
  if (changed) { save(); if (currentPageId === 'games' && gamesTab === 'tor') renderPage(); }
}
// ---------- search inside a page ----------
let pageQuery = { id: '', q: '' };
const searchKey = (x) => String(x || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^a-z0-9\u0600-\u06ff]/g, '');
function applySearch(p) {
  const q = searchKey(pageQuery.id === p.id ? pageQuery.q : '');
  let hits = 0;
  view.querySelectorAll('.tile[data-item]').forEach((t) => {
    const it = p.items.find((i) => i.id === t.dataset.item);
    const ok = !q || (it && (searchKey(it.name).includes(q) || searchKey(it.voice).includes(q)));
    t.hidden = !ok; if (ok) hits++;
  });
  view.querySelectorAll('.tile.add, #seriesBox, .series-dirs').forEach((t) => { t.hidden = !!q; });
  // hide group titles whose row is now empty
  view.querySelectorAll('.group-title').forEach((g) => { const row = g.nextElementSibling; if (row?.classList.contains('tiles')) { const any = row.querySelector('.tile[data-item]:not([hidden])'); g.hidden = !!q && !any; row.hidden = !!q && !any; } });
  const c = $('#pgCount'); if (c) c.textContent = q ? `${hits}` : '';
  const nh = $('#noHits'); if (nh) nh.hidden = !q || hits > 0;
}
// Ctrl+F, or just start typing on a page, to search it
document.addEventListener('keydown', (e) => {
  const sb = $('#pgSearch'); if (!sb || !currentPageId) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && /[\p{L}\p{N}]/u.test(e.key))) {
    e.preventDefault(); sb.focus();
    if (!e.ctrlKey) { sb.value += e.key; sb.dispatchEvent(new Event('input')); }
  }
}, true);
// A game you own but haven't installed: just its name and cover, kept in your library
const gameKey = (n) => String(n || '').toLowerCase().replace(/[™®©*:'’.,!-]/g, '').replace(/\s+/g, ' ').trim();
async function importOwned(announce) {
  const g = page('games'); if (!g || !inElectron) return;
  if (announce) toast('أقرأ مكتبة ستيم وإيبك…');
  const r = await pv.importOwned().catch(() => null);
  const have = new Set(g.items.map((i) => gameKey(i.name)));
  let n = 0;
  for (const x of r?.games || []) {
    const it = { id: uid(), name: x.name, target: x.target, owned: true, image: x.image, hero: x.hero || '', categories: [], voice: '', source: x.source };
    if (have.has(gameKey(x.name)) || isRemoved(it)) continue;
    have.add(gameKey(x.name)); g.items.push(it); n++;
  }
  save(); if (currentPageId === 'games') renderPage();
  pv.log(`owned import: ${r?.games?.length || 0} found, ${n} new`);
  if (announce || n) toast(n ? `📚 انضاف ${n} لعبة لمكتبتك (عندك بس مو مثبتة)` : 'ما لقيت ألعاب جديدة. روكستار ما يحفظ قائمة على الجهاز، فألعابه تضيفها بزر "لعبة عندي".');
}
async function addOwnedGame() {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="owned-form"><h2>📚 لعبة عندي</h2><p class="hint">اكتب اسم اللعبة (بالإنجليزي أفضل) وأجيب صورتها. تنحفظ في مكتبتك حتى لو مو مثبتة.</p>
    <input name="n" required placeholder="مثلاً: Red Dead Redemption 2" autocomplete="off"><div class="owned-prev"></div>
    <div class="actions"><button type="button" class="btn ghost" data-x>إلغاء</button><button class="btn primary">إضافة</button></div></form>`;
  document.body.appendChild(d); d.showModal();
  const f = d.querySelector('form'); let found = null, t = 0;
  f.n.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const q = f.n.value.trim(); if (q.length < 3) return; found = await pv.findCover(q); d.querySelector('.owned-prev').innerHTML = found ? `<img src="${esc(found.image)}" alt=""><small>${esc(found.matched)}</small>` : '<small>ما لقيت صورة، بس تقدر تضيفها</small>'; }, 500); };
  d.querySelector('[data-x]').onclick = () => d.close();
  f.onsubmit = (e) => {
    e.preventDefault();
    const name = found?.matched || f.n.value.trim(); if (!name) return;
    const g = page('games'); if (!g) return;
    g.items.push({ id: uid(), name, target: '', owned: true, image: found?.image || '', hero: found?.hero || '', categories: [], voice: '' });
    save(); d.close(); renderPage(); toast(`انضافت ${name} لمكتبتك`);
  };
  d.addEventListener('close', () => d.remove());
}

function leaderboardHtml(p) {
  const board = (title, list, value) => {
    if (!list.length) return `<div class="board"><h3>${title}</h3><div class="empty">ما فيه بيانات للحين.</div></div>`;
    const [top, rest] = [list.slice(0, 3), list.slice(3, 10)];
    return `<div class="board"><h3>${title}</h3>
      <div class="podium">
        ${top.map((i, n) => `
          <div class="pod rank${n + 1}" data-item="${i.id}">
            <div class="rank">${n + 1}</div>
            ${coverHtml(i)}
            <div class="label">${esc(i.name)}</div>
            <div class="val">${value(i)}</div>
          </div>`).join('')}
      </div>
      ${rest.length ? `<ol class="ranklist" start="4">${rest.map((i) => `
        <li data-item="${i.id}"><span>${esc(i.name)}</span><b>${value(i)}</b></li>`).join('')}</ol>` : ''}
    </div>`;
  };
  const played = p.items.filter((i) => playMinutes(i) > 0).sort((a, b) => playMinutes(b) - playMinutes(a));
  const rated = p.items.filter((i) => avgRating(i) !== null).sort((a, b) => avgRating(b) - avgRating(a));
  return `<div class="boards">
    ${board('⏱ الأكثر لعباً', played, (i) => fmtTime(playMinutes(i)))}
    ${board('★ الأعلى تقييماً', rated, (i) => `★ ${avgRating(i).toFixed(1)}`)}
  </div>`;
}

// ---------- Drawer (☰) ----------
function renderDrawer() {
  const nav = $('#drawerNav');
  const quick = [
    ['home', '🏠', 'الرئيسية'], ['ratings', '⭐', 'التقييم'], ['theme', '🎨', 'الثيمات'], ['settings', '⚙️', 'الإعدادات'],
    ['pad', '🎮', 'اليد والأجهزة'], ['emu', '🕹️', 'المحاكيات'], ['voice', '🎙', 'كلّم أكاي'], ['help', '؟', 'التعليمات'],
    ['downloads', '⬇', 'التحميلات'], ['logs', '📜', 'السجلات'], ['stores', '🛒', 'المتاجر'],
  ];
  nav.innerHTML = `
    <div class="dr-quick">${quick.map(([k, i, t]) => `<button data-nav="${k}" class="dq ${k === 'home' && !currentPageId ? 'on' : ''}"><span>${i}</span>${t}</button>`).join('')}</div>
    <div class="nav-sep">الصفحات</div>
    ${data.pages.map((p) => `<button data-nav="page:${p.id}" class="${currentPageId === p.id ? 'on' : ''}"><span>${pageIcon(p)}</span>${esc(p.name)}<small>${p.type === 'calendar' ? (data.events || []).length : p.items.length}</small></button>`).join('')}
    <button data-nav="newpage"><span>＋</span>صفحة جديدة</button>
    ${paths.mods ? '<div class="nav-sep">مجلدات</div><button data-nav="mods"><span>📂</span>مجلد المودات</button>' : ''}`;
  nav.querySelectorAll('[data-nav]').forEach((b) => {
    b.onclick = () => {
      const v = b.dataset.nav;
      closeDrawer();
      if (v === 'home') goHome();
      else if (v.startsWith('page:')) goPage(v.slice(5));
      else if (v === 'newpage') openPageEditor(null);
      else if (v === 'emu') { goPage('emu'); openEmuDialog(); }
      else if (v === 'mods') pv.launch(paths.mods);
      else if (v === 'theme') openThemePicker();
      else if (v === 'voice') window.Voice?.start();
      else if (v === 'settings') openSettings();
      else if (v === 'pad') window.openPadCenter?.();
      else if (v === 'ratings') window.SB?.openRatings('tiers');
      else if (v === 'help') window.Help?.open();
      else if (v === 'logs') openLogs();
      else if (v === 'downloads') { const b = $('#torBox'); if (b && b.innerHTML && b._doneAt !== 1) { b.hidden = false; b.classList.add('tb-open'); } else openLogs('dl'); }
      else if (v === 'stores') addStores(true);
    };
  });
}
// ---------- Logs: what you downloaded, and everything that happened (errors in red) ----------
const logsDlg = document.createElement('dialog'); logsDlg.id = 'logsDlg'; document.body.appendChild(logsDlg);
async function openLogs(tab = 'dl') {
  const r = await pv.logsGet();
  const when = (t) => new Date(t).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const isErr = (l) => /fail|error|exception|crash|ما قدرت|corrupt|invalid|refused|denied|not found/i.test(l);
  let onlyErr = false;
  const draw = () => {
    const ev = r.events.filter((l) => !onlyErr || isErr(l));
    logsDlg.innerHTML = `
      <div class="lg-head"><h2>📜 السجلات</h2><span class="spacer"></span>
        <div class="seg"><button class="${tab === 'dl' ? 'on' : ''}" data-tab="dl">⬇ اللي حمّلته</button><button class="${tab === 'ev' ? 'on' : ''}" data-tab="ev">⚡ اللي صار</button></div>
        <button class="btn ghost sm" data-x>✕</button></div>
      ${tab === 'dl' ? (r.history.length ? `<div class="lg-list">${r.history.map((h) => `<div class="lg-row"><time>${when(h.t)}</time><b>${esc(h.kind)}</b><span dir="auto">${esc(h.what)}</span></div>`).join('')}</div>` : '<div class="empty small">لسا ما حمّلت شي من هنا</div>')
        : `<div class="lg-tools"><label><input type="checkbox" id="lgErr" ${onlyErr ? 'checked' : ''}> الأخطاء بس</label><span class="spacer"></span><button class="btn ghost sm" id="lgOpen">📂 افتح ملف السجل</button></div>
        <div class="lg-list lg-ev">${ev.map((l) => { const m = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(l); return `<div class="lg-row ${isErr(l) ? 'bad' : ''}"><time>${m ? when(m[1]) : ''}</time><span dir="ltr">${esc((m ? m[2] : l).slice(0, 600))}</span></div>`; }).join('') || '<div class="empty small">ما فيه أخطاء 👌</div>'}</div>`}`;
    logsDlg.querySelector('[data-x]').onclick = () => logsDlg.close();
    logsDlg.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
    const c = logsDlg.querySelector('#lgErr'); if (c) c.onchange = () => { onlyErr = c.checked; draw(); };
    logsDlg.querySelector('#lgOpen')?.addEventListener('click', () => pv.logsOpen());
  };
  draw();
  if (!logsDlg.open) logsDlg.showModal();
}
// ---------- Game stores (Steam, Epic, EA, Ubisoft, ...) as tiles on the Apps page ----------
async function addStores(announce) {
  const list = await pv.storesScan();
  const ap = page('games') || data.pages.find((p) => p.type === 'games'); if (!ap) return; // stores sit at the top of the Games page
  let n = 0;
  for (const s of list) {
    if (allItems().some((i) => String(i.target).toLowerCase() === s.exe.toLowerCase()) || data.removed?.['t:' + s.exe.toLowerCase()]) continue;
    const it = { id: uid(), name: s.name, target: s.exe, image: '', categories: ['المتاجر'], voice: s.name, store: true };
    if (!s.exe.startsWith('shell:')) { try { it.icon = await pv.fileIcon(s.exe); } catch {} }
    ap.items.push(it); n++;
  }
  save();
  if (announce) { toast(n ? `🛒 انضاف ${n} متجر لصفحة ${ap.name}` : list.length ? 'المتاجر اللي عندك موجودة من قبل' : 'ما لقيت متاجر ألعاب مثبتة'); goPage(ap.id); }
  else if (n) pv.log(`stores added: ${n}`);
}
function openDrawer() { renderDrawer(); document.body.classList.add('drawer-open'); }
function closeDrawer() { document.body.classList.remove('drawer-open'); }
$('#menuBtn').onclick = (e) => { e.stopPropagation(); document.body.classList.contains('drawer-open') ? closeDrawer() : openDrawer(); };
$('#drawerClose').onclick = closeDrawer;
$('#drawerShade').onclick = closeDrawer;

// ---------- Rating ----------
const rater = $('#rater');
let ratingItem = null, draft = {};
function openRater(itemId) {
  ratingItem = findItem(itemId).item;
  draft = { ...(ratingItem.ratings || {}) };
  $('#raterTitle').textContent = `تقييم: ${ratingItem.name}`;
  $('#raterNote').value = ratingItem.ratingNote || '';
  drawRaterRows();
  rater.showModal();
}
function drawRaterRows() {
  const crits = [...new Set([...(data.ratingCriteria || []), ...Object.keys(draft)])];
  $('#raterRows').innerHTML = crits.map((c) => `
    <div class="crit">
      <span class="cname">${esc(c)}</span>
      <input type="range" min="0" max="10" step="0.5" value="${draft[c] ?? 5}" data-crit="${esc(c)}" class="${draft[c] === undefined ? 'unset' : ''}">
      <b class="cval">${draft[c] ?? '–'}</b>
    </div>`).join('');
  $('#raterRows').querySelectorAll('input').forEach((r) => {
    r.oninput = () => {
      draft[r.dataset.crit] = Number(r.value);
      r.classList.remove('unset');
      r.nextElementSibling.textContent = r.value;
      updateRaterAvg();
    };
  });
  updateRaterAvg();
}
function updateRaterAvg() {
  const a = avgRating({ ratings: draft });
  $('#raterAvg').textContent = a === null ? '–' : a.toFixed(1);
}
$('#addCrit').onclick = () => {
  const name = $('#newCrit').value.trim();
  if (!name) return;
  if (!data.ratingCriteria.includes(name)) data.ratingCriteria.push(name);
  $('#newCrit').value = '';
  save(); drawRaterRows();
};
$('#raterCancel').onclick = () => rater.close();
$('#raterClear').onclick = () => {
  delete ratingItem.ratings; delete ratingItem.ratingNote;
  save(); rater.close(); render();
};
$('#raterForm').onsubmit = (e) => {
  e.preventDefault();
  ratingItem.ratings = draft;
  ratingItem.ratingNote = $('#raterNote').value.trim();
  save(); rater.close(); renderPage();
  toast(`تم حفظ تقييم ${ratingItem.name}`);
};

// ---------- Auto cover art ----------
// Websites: use the page's share picture, else its icon
async function webArt(item) {
  if (!inElectron || item.image || item.icon) return;
  const fav = () => { try { return `https://www.google.com/s2/favicons?domain=${new URL(item.target).hostname}&sz=128`; } catch { return null; } };
  const m = /youtube\.com|youtu\.be/i.test(item.target) ? null : await pv.webMeta(item.target);
  if (m?.image) item.image = m.image; else item.icon = fav() || m?.icon;
  if (!item.image && !item.icon) return;
  save(); render();
}

// Make sure every Steam game points at artwork that actually exists (new games use other addresses).
async function fixSteamArt(force = false) {
  const list = allItems().filter((i) => /^steam:\/\/rungameid\/\d+/.test(i.target || '') && (force || !i.artOk));
  let fixed = 0;
  await Promise.all(list.map(async (it) => {
    const id = /rungameid\/(\d+)/.exec(it.target)[1];
    if (it.image && await pv.checkImage(it.image)) { it.artOk = true; return; }
    let a = await pv.steamApp(id);
    if (!a?.image) a = await pv.findCover(it.name);
    if (a?.image) { it.image = a.image; if (a.hero) it.hero = a.hero; it.artOk = true; fixed++; }
  }));
  if (list.length) { save(); render(); pv.log(`art check: ${list.length} games, fixed ${fixed}`); }
}

async function autoCoverFor(item, announce) {
  if (item.noArt && !announce) return;
  // programs and stores keep their own icon; pictures are for games (unless you ask for one)
  if (!announce && (item.store || ['apps', 'watch'].includes(findItem(item.id)?.page?.type) || findItem(item.id)?.page?.id === 'apps')) return false;
  const r = await pv.findCover(item.name);
  if (!r) { if (announce) toast(`ما لقيت صورة لـ ${item.name}`); return false; }
  item.image = r.image; item.hero = r.hero;
  save();
  if (currentPageId) renderPage();
  if (announce) toast(`لقيت صورة ${r.matched}`);
  return true;
}

// ---------- Import (Steam / Epic) ----------
async function runImport(kind, target = null, quiet = false) {
  if (!quiet) toast('جاري البحث عن الألعاب…');
  const res = kind === 'steam' ? await pv.importSteam() : kind === 'epic' ? await pv.importEpic() : await pv.importMore(kind);
  if (res.error) { if (!quiet) toast(res.error); return 0; }
  const p = target || page();
  let added = 0, updated = 0;
  const needCovers = [];
  for (const g of res.games) {
    const existing = allItems().find((i) => i.target === g.target && JSON.stringify(i.args || null) === JSON.stringify(g.args || null));
    if (existing) {
      if (g.steamMinutes !== undefined) existing.steamMinutes = g.steamMinutes;
      if (!existing.image && g.image) existing.image = g.image;
      if (!existing.hero && g.hero) existing.hero = g.hero;
      updated++;
    } else {
      // the same game from two stores (e.g. EA app + Steam) shows once
      const key = (x) => String(x).toLowerCase().replace(/[™®©*]/g, '').replace(/^ea sports\s*/, '').replace(/[^a-z0-9\u0600-\u06ff]/g, '');
      const k = key(g.name);
      if (k.length > 2 && allItems().some((i) => { const k2 = key(i.name); return k2 && (k2 === k || (k2.length > 3 && k.length > 3 && (k2.endsWith(k) || k.endsWith(k2)))); })) continue;
      const it = { id: uid(), categories: [], voice: '', ...g };
      if (isRemoved(it)) continue;
      const apps = page('apps');
      if (apps && kind !== 'apps' && APP_LIKE.test(it.name)) { apps.items.push(it); added++; continue; }
      if (kind === 'apps' || /\.lnk$/i.test(it.target) || /^shell:/i.test(it.target)) { if (pv.fileIcon && isDrivePath(it.target)) it.icon = await pv.fileIcon(it.target); }
      p.items.push(it);
      if (!it.image) needCovers.push(it);
      added++;
    }
  }
  save(); render();
  if (!quiet) toast(added ? `انضافت ${added} لعبة${updated ? `، وتحدثت ${updated}` : ''}` : `ما فيه ألعاب جديدة${updated ? ` (تحدث وقت اللعب لـ ${updated})` : ''}`);
  for (const it of needCovers) await autoCoverFor(it, false); // Epic games: look their art up
  if (kind === 'steam' && inElectron) fixSteamArt();
  return added;
}

// First launch: bring in installed games and known programs automatically.
async function firstRunSetup() {
  if (!inElectron || data.firstRunDone) return;
  data.firstRunDone = true; save();
  const games = page('games');
  let steam = 0, epic = 0;
  // every store on this PC: Steam, Epic, Rockstar, Ubisoft, EA, Battle.net, GOG, Riot, Xbox
  if (games) {
    steam = await runImport('steam', games, true);
    epic = await runImport('epic', games, true);
    for (const k of ['rockstar', 'ubisoft', 'ea', 'battlenet', 'gog', 'riot', 'xbox']) epic += await runImport(k, games, true);
  }
  const apps = page('apps');
  const known = [];
  let appsAdded = 0;
  if (apps) for (const [p, name] of known) {
    const info = await pv.fileInfo(p);
    if (!info.exists || apps.items.some((i) => i.target.toLowerCase() === p.toLowerCase())) continue;
    apps.items.push({ id: uid(), name, target: p, image: '', categories: [], voice: '', icon: await pv.fileIcon(p) });
    appsAdded++;
  }
  save(); render();
  pv.log(`first run: steam ${steam}, epic ${epic}, apps ${appsAdded}`);
  if (steam + epic) toast(`جبت ${steam + epic} لعبة من جهازك تلقائياً 🎮`);
}
$('#importBtn').onclick = (e) => {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  showCtx({ preventDefault() {}, clientX: r.left, clientY: r.bottom + 6 }, [
    { label: '⭐ كل الألعاب المثبتة (كل المتاجر)', run: () => importAllGames() },
    '-',
    { label: 'من Steam', run: () => runImport('steam') },
    { label: 'من Epic Games', run: () => runImport('epic') },
    { label: 'من Rockstar Games', run: () => runImport('rockstar') },
    { label: 'من Ubisoft Connect', run: () => runImport('ubisoft') },
    { label: 'من EA app', run: () => runImport('ea') },
    { label: 'من Battle.net', run: () => runImport('battlenet') },
    { label: 'من GOG Galaxy', run: () => runImport('gog') },
    { label: 'من Riot (فالورانت، ليغ)', run: () => runImport('riot') },
    { label: 'من Xbox / Game Pass', run: () => runImport('xbox') },
    '-',
    { label: '🧰 البرامج المشهورة اللي عندك', run: () => importApps() },
    { label: '🧲 لعبة من تورنت أو رابط ماغنت…', run: () => openTorrentAdd() },
    { label: '📁 أخرى: اختر ملف من جهازك', run: () => openEditor(null) },
  ]);
};

async function importAllGames() {
  const g = page('games') || data.pages.find((p) => p.type === 'games');
  if (!g) return;
  toast('أدور على ألعابك بكل المتاجر…');
  let n = 0;
  for (const k of ['steam', 'epic', 'rockstar', 'ubisoft', 'ea', 'battlenet', 'gog', 'riot', 'xbox']) n += await runImport(k, g, true);
  toast(n ? `✓ انضافت ${n} لعبة جديدة` : 'كل ألعابك موجودة من قبل');
}
async function importApps() {
  let apps = page('apps');
  if (!apps) { // the user removed it before; asking for programs brings it back
    apps = { id: 'apps', type: 'apps', name: 'تطبيقات', icon: '🧰', items: [] };
    data.pages.push(apps);
    data.removedPages = (data.removedPages || []).filter((x) => x !== 'apps');
  }
  toast('أدور على البرامج المشهورة…');
  const n = await runImport('apps', apps, true);
  goPage(apps.id);
  toast(n ? `✓ انضاف ${n} برنامج` : 'ما لقيت برامج جديدة');
}

// ---------- Emulators ----------
const emuDialog = $('#emuDialog');
const emuForm = $('#emuForm');
let editingPlatformId = null;
$('#emuPlatform').innerHTML = Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('#emuPlatform').onchange = () => {
  const pr = PLATFORMS[emuForm.platform.value];
  emuForm.exts.value = pr.exts; emuForm.args.value = pr.args;
};
// ---------- Console games: files found in Downloads / Emulators\Games, played without opening an emulator ----------
function addRomGame(r, quiet) {
  const g = page('games') || data.pages.find((p) => p.type === 'games');
  if (!g || !r?.file) return false;
  const all = allItems();
  if (all.some((i) => i.rom && i.rom.toLowerCase() === r.file.toLowerCase())) return false;
  if (data.removed?.['rom:' + r.file.toLowerCase()]) return false;
  const name = cleanRomName(r.raw);
  g.items.push({ id: uid(), name, target: r.file, rom: r.file, console: r.console, platform: r.console, platformLabel: r.label,
    image: r.thumbs ? libretroCover(r.thumbs, r.raw) : '', categories: [r.label], voice: '' });
  save();
  if (!r.thumbs) { const it = g.items[g.items.length - 1]; pv.findCover(name).then((a) => { if (a?.image) { it.image = a.image; save(); if (currentPageId === g.id) renderPage(); } }); }
  if (!quiet) toast(`🎮 انضافت ${name} (${r.label}) — جاهزة، افتحها من الألعاب`);
  if (currentPageId === g.id || !currentPageId) render();
  return true;
}
pv.onRomAdded((r) => addRomGame(r));
pv.onRomStatus((m) => {
  if (m.step === 'extract') toast(`📦 أفك ضغط ${m.name}…`);
  else if (m.step === 'convert') toast(`🔄 أجهّز ${m.name} للسويتش (يحوّل الصيغة، ياخذ كم دقيقة)…`);
  else if (m.step === 'keys') toast(`🔑 ${m.name} لعبة سويتش: حط ملف prod.keys من جهازك في مجلد BIOS، وأكمل الباقي لحالي`);
  else if (m.step === 'compat') toast('🎮 المحاكي طاح بهاللعبة، صلحتها: المرة الجاية تشتغل بطريقة رسم ثانية (OpenGL). شغّلها مرة ثانية');
  else if (m.step === 'firmware') toast('✅ ركّبت فيرموير السويتش لكل محاكيات السويتش');
  else if (m.step === 'fail') toast(`ما قدرت أجهّز ${m.name}`);
});
async function syncRomGames() {
  const r = await pv.romsList();
  let added = 0;
  for (const x of r.list || []) if (addRomGame(x, true)) added++;
  // games whose file was deleted from the Games folder leave the library too
  if (r.games) {
    // a removed duplicate ("Game (2).nsp"): the tile moves to the copy that stayed, keeping its playtime and rating
    const have = new Set((r.list || []).map((x) => x.file.toLowerCase()));
    for (const i of allItems()) {
      if (!i.rom || have.has(i.rom.toLowerCase())) continue;
      const alt = i.rom.replace(/( \(\d+\))+(\.[^.]+)$/, '$2');
      if (alt !== i.rom && have.has(alt.toLowerCase())) {
        const twin = allItems().find((x) => x !== i && x.rom && x.rom.toLowerCase() === alt.toLowerCase());
        if (twin) { twin.playtime = (twin.playtime || 0) + (i.playtime || 0); if (!twin.ratings && i.ratings) twin.ratings = i.ratings; }
        else { i.rom = alt; i.target = alt; }
        save();
      }
    }
    const gone = (i) => i.rom && i.rom.toLowerCase().startsWith(r.games.toLowerCase()) && !(r.list || []).some((x) => x.file.toLowerCase() === i.rom.toLowerCase());
    for (const p of data.pages) { const before = p.items.length; p.items = p.items.filter((i) => !gone(i)); if (p.items.length !== before) save(); }
  }
  if (added) { save(); render(); pv.log(`console games synced: +${added}`); }
}

// ---------- Emulator programs: download + keep them on the emulators page ----------
async function addEmulatorTiles(list) {
  const ep = emuPage(); if (!ep) return 0;
  let added = 0;
  for (const r of list) {
    if (!r.exe) continue;
    let it = ep.items.find((i) => i.emuId === r.id || i.target === r.exe);
    if (!it && data.removed?.['emu:' + r.id]) continue;
    if (!it) {
      it = { id: uid(), name: r.name, target: r.exe, image: '', categories: ['المحاكيات'], voice: r.name, emuId: r.id };
      ep.items.push(it); added++;
    }
    it.emuId = r.id; it.desc = r.desc; it.target = r.exe;
    if (!it.icon) { try { it.icon = await pv.fileIcon(r.exe); } catch {} }
  }
  // Emulators first, then games
  ep.items.sort((a, b) => (b.emuId ? 1 : 0) - (a.emuId ? 1 : 0));
  save();
  return added;
}
const emuProg = document.createElement('div');
emuProg.id = 'emuProg'; emuProg.hidden = true;
document.body.appendChild(emuProg);
const emuRows = {};
pv.onEmuProgress((m) => {
  emuProg.hidden = false;
  emuRows[m.id] = m;
  const label = (r) => r.step === 'download' ? `⬇ ${r.pct || 0}%` : r.step === 'extract' ? '📦 فك الضغط' : r.step === 'done' ? '✓ جاهز' : '✗ ما نزل';
  emuProg.innerHTML = `<b>تحميل المحاكيات</b>` + Object.values(emuRows).map((r) =>
    `<div class="ep-row ${r.step}"><span>${esc(r.name)}</span><small>${label(r)}</small>${r.step === 'download' ? `<i style="--p:${r.pct || 0}%"></i>` : ''}</div>`).join('');
  emuProg.scrollTop = emuProg.scrollHeight;
});
async function installEmulators(ids) {
  toast('🕹️ أحمّل المحاكيات المعروفة… تقدر تكمل شغلك عادي');
  await addEmulatorTiles((await pv.emuCatalog()).filter((x) => x.exe)); // ones already on the PC show up right away
  if (currentPageId === emuPage()?.id) render();
  const res = await pv.emuInstall(ids);
  await addEmulatorTiles(res.filter((r) => r.ok));
  const ok = res.filter((r) => r.ok).length, bad = res.filter((r) => !r.ok);
  pv.log(`emulators: ${ok} ready, failed: ${bad.map((b) => b.name + ' (' + b.error + ')').join(', ') || 'none'}`);
  if (!ids) { data.emusV1 = true; save(); }
  pv.emuPrepare().then((c) => { pv.log('emulators prepared, cores: ' + c.join(',')); data.emuPrepV1 = true; save(); });
  render();
  toast(bad.length ? `✓ ${ok} محاكي جاهز، وما نزل: ${bad.map((b) => b.name).join('، ')}` : `✓ كل المحاكيات جاهزة (${ok})`);
  setTimeout(() => { emuProg.hidden = true; }, 6000);
}
window.installEmulators = installEmulators;

function emuPage() { return page('emu') || data.pages.find((p) => p.type === 'emu'); }
async function openEmuDialog(platformId = null) {
  const ep = emuPage();
  if (!ep) return;
  ep.platforms ||= [];
  editingPlatformId = platformId;
  const pl = ep.platforms.find((x) => x.id === platformId);
  emuForm.reset();
  emuForm.platform.value = pl?.platform || 'ps2';
  $('#emuPlatform').onchange();
  if (pl) { emuForm.exe.value = pl.exe; emuForm.romDir.value = pl.romDir; emuForm.exts.value = pl.exts; emuForm.args.value = pl.args; }
  else {
    const found = (await pv.detectEmulators()).find((d) => !ep.platforms.some((x) => x.exe === d.exe));
    if (found) { emuForm.platform.value = found.platform; $('#emuPlatform').onchange(); emuForm.exe.value = found.exe; }
  }
  $('#emuFormTitle').textContent = pl ? `تعديل ${PLATFORMS[pl.platform]?.label || ''}` : 'إضافة منصة';
  drawEmuList();
  if (!emuDialog.open) emuDialog.showModal();
}
async function discoverEmus(auto = false) {
  const ep = emuPage();
  const box = $('#emuFound');
  if (box && !auto) box.innerHTML = '<p class="hint">أدوّر في جهازك…</p>';
  const r = await pv.discoverEmus();
  const emuFor = (pl) => r.emus.find((e) => e.platform === pl);
  const pairs = [], lonely = [];
  for (const f of r.folders) {
    if (f.platform === '?' || ep.platforms.some((x) => x.romDir === f.dir)) continue;
    const e = emuFor(f.platform);
    (e ? pairs : lonely).push({ ...f, exe: e?.exe });
  }
  if (auto) {
    for (const p of pairs) { const pl = { id: uid(), platform: p.platform, exe: p.exe, romDir: p.dir, exts: PLATFORMS[p.platform].exts, args: PLATFORMS[p.platform].args }; ep.platforms.push(pl); await scanPlatform(pl); }
    pv.log(`emu auto: added ${pairs.length}, ${lonely.length} folders without emulator, ${r.emus.length} emulators`);
    save(); return;
  }
  if (!box) return;
  if (!pairs.length && !lonely.length) {
    box.innerHTML = `<p class="hint">ما لقيت مجلدات ألعاب محاكيات واضحة.${r.emus.length ? ` لقيت محاكيات: ${[...new Set(r.emus.map((e) => PLATFORMS[e.platform]?.label || 'RetroArch'))].join('، ')}، حدّد مجلد ألعابها تحت.` : ''}</p>`;
    return;
  }
  box.innerHTML = `<h3>لقيت في جهازك</h3>` + [...pairs, ...lonely].map((f, n) => `
    <div class="emu-row"><div><b>${esc(PLATFORMS[f.platform]?.label || f.platform)}</b> <small dir="ltr">${esc(f.dir)}</small><small>${f.count} لعبة${f.exe ? '' : ' · محتاج تختار المحاكي'}</small></div>
      <div class="emu-actions"><button type="button" class="btn ${f.exe ? 'primary' : 'ghost'}" data-found="${n}">${f.exe ? 'إضافة' : 'اختيار المحاكي…'}</button></div></div>`).join('');
  const all = [...pairs, ...lonely];
  box.querySelectorAll('[data-found]').forEach((b) => b.onclick = async () => {
    const f = all[Number(b.dataset.found)];
    if (!f.exe) { emuForm.platform.value = f.platform; $('#emuPlatform').onchange(); emuForm.romDir.value = f.dir; editingPlatformId = null; toast('اختر برنامج المحاكي واضغط حفظ'); return; }
    const pl = { id: uid(), platform: f.platform, exe: f.exe, romDir: f.dir, exts: PLATFORMS[f.platform].exts, args: PLATFORMS[f.platform].args };
    ep.platforms.push(pl); save(); b.disabled = true; b.textContent = '✓';
    await scanPlatform(pl);
  });
}

function drawEmuList() {
  const ep = emuPage();
  $('#emuList').innerHTML = ep.platforms.length ? ep.platforms.map((pl) => `
    <div class="emu-row">
      <div><b>${esc(PLATFORMS[pl.platform]?.label || pl.platform)}</b>
        <small dir="ltr">${esc(pl.romDir)}</small>
        <small>${ep.items.filter((i) => i.platformId === pl.id).length} لعبة</small></div>
      <div class="emu-actions">
        <button type="button" class="btn ghost" data-rescan="${pl.id}">⟳ تحديث</button>
        <button type="button" class="btn ghost" data-edit="${pl.id}">تعديل</button>
        <button type="button" class="btn ghost danger-text" data-del="${pl.id}">حذف</button>
      </div>
    </div>`).join('') : '<p class="hint">ما فيه منصات للحين.</p>';
  $('#emuList').querySelectorAll('[data-rescan]').forEach((b) => b.onclick = () => scanPlatform(ep.platforms.find((x) => x.id === b.dataset.rescan)));
  $('#emuList').querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEmuDialog(b.dataset.edit));
  $('#emuList').querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    const pl = ep.platforms.find((x) => x.id === b.dataset.del);
    if (!confirm(`حذف ${PLATFORMS[pl.platform]?.label} وألعابها من القائمة؟ (ملفات الألعاب ما تنحذف)`)) return;
    ep.platforms = ep.platforms.filter((x) => x !== pl);
    ep.items = ep.items.filter((i) => i.platformId !== pl.id);
    save(); drawEmuList(); if (currentPageId === ep.id) renderPage();
  });
}
$('#emuPickExe').onclick = async () => { const f = await pv.pickFile('file'); if (f) emuForm.exe.value = f; };
$('#emuPickDir').onclick = async () => { const d = await pv.pickDir(); if (d) emuForm.romDir.value = d; };
$('#emuClose').onclick = () => emuDialog.close();
emuForm.onsubmit = async (e) => {
  e.preventDefault();
  const ep = emuPage();
  const fields = {
    platform: emuForm.platform.value,
    exe: emuForm.exe.value.trim().replace(/^"(.*)"$/, '$1'),
    romDir: emuForm.romDir.value.trim().replace(/^"(.*)"$/, '$1'),
    exts: emuForm.exts.value.trim() || PLATFORMS[emuForm.platform.value].exts,
    args: emuForm.args.value.trim() || '{rom}',
  };
  let pl = ep.platforms.find((x) => x.id === editingPlatformId);
  if (pl) Object.assign(pl, fields); else { pl = { id: uid(), ...fields }; ep.platforms.push(pl); }
  editingPlatformId = pl.id;
  save();
  await scanPlatform(pl);
};
// Find real box art for emulator games (matched against the archive's file list)
async function fixConsoleArt(force = false) {
  const ep = emuPage(); if (!ep) return;
  let fixed = 0, tried = 0;
  for (const it of ep.items) {
    if (it.artOk && !force) continue;
    const sys = PLATFORMS[it.platform]?.thumbs; if (!sys) continue;
    const raw = it.romFile ? it.romFile.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : it.name;
    tried++;
    const url = (await pv.consoleArt(sys, raw)) || (raw !== it.name ? await pv.consoleArt(sys, it.name) : null);
    if (url) { it.image = url; fixed++; } else if (!it.image) it.image = libretroCover(sys, raw); // let the region-name guesses try
    it.artOk = true;
  }
  if (tried) { save(); if (currentPageId === ep.id) render(); pv.log(`console art: ${tried} games, found ${fixed}`); }
}

async function scanPlatform(pl) {
  const ep = emuPage();
  const pr = PLATFORMS[pl.platform] || PLATFORMS.other;
  toast(`أدور على ألعاب ${pr.label}…`);
  const found = await pv.scanRoms(pl.romDir, pl.exts.split(/[,\s]+/).filter(Boolean));
  const argT = splitArgs(pl.args);
  let added = 0;
  const seen = new Set();
  for (const f of found) {
    seen.add(f.file);
    const args = argT.map((a) => a === '{rom}' ? f.file : a.replace('{rom}', f.file));
    const existing = ep.items.find((i) => i.romFile === f.file);
    if (existing) { Object.assign(existing, { target: pl.exe, args, platformLabel: pr.label }); continue; }
    ep.items.push({
      id: uid(), name: cleanRomName(f.raw), target: pl.exe, args, romFile: f.file,
      platformId: pl.id, platform: pl.platform, platformLabel: pr.label,
      image: libretroCover(pr.thumbs, f.raw), categories: [pr.label], voice: '',
    });
    added++;
  }
  // Remove games whose files are gone
  const before = ep.items.length;
  ep.items = ep.items.filter((i) => i.platformId !== pl.id || seen.has(i.romFile));
  const removed = before - ep.items.length;
  save();
  if (emuDialog.open) drawEmuList();
  if (currentPageId === ep.id) render();
  fixConsoleArt();
  toast(found.length ? `${pr.label}: ${found.length} لعبة${added ? ` (جديدة ${added})` : ''}${removed ? `، انشال ${removed}` : ''}` : `ما لقيت ألعاب ${pr.label} في المجلد`);
}
$('#emuBtn').onclick = () => openEmuDialog();
$('#emuDiscover').onclick = () => discoverEmus();
$('#emuGet').onclick = () => { $('#emuDialog').close(); installEmulators(); };
$('#emuGames').onclick = () => pv.romsFolder('games');
$('#emuTorrent').onclick = () => { $('#emuDialog').close(); openTorrentAdd(); };
$('#emuBios').onclick = () => pv.romsFolder('bios');

// ---------- Launching ----------
async function launchItem(item) {
  item.lastOpened = Date.now();
  save();
  window.Music?.pauseForApp();
  // Paid streaming sites protect their videos, so they play in the normal browser
  if (isWeb(item.target) && item.external) { await pv.launch(item.target, item.id); return toast(`جاري فتح ${item.name} في المتصفح…`); }
  if (isWeb(item.target)) return openWeb(item);
  if (item.owned && !item.target) { // got its torrent saved? download it again from there
    const t = (data.torLib || []).find((x) => gameKey(x.title) && (gameKey(item.name).includes(gameKey(x.title)) || gameKey(x.title).includes(gameKey(item.name))));
    if (t && confirm(`${item.name} مو محمّلة. أنزّلها من التورنت المحفوظ؟`)) { const r = await pv.torAdd(t.file); if (r.ok) { t.state = 'downloading'; t.pct = 0; save(); toast('🔎 جاري البحث عن مصادر…'); } else toast('ما قدرت: ' + r.error); return; }
  }
  if (item.owned && !item.target) { toast(`${item.name} مو مثبتة، أفتح لك صفحتها في ستيم`); return pv.launch(`https://store.steampowered.com/search/?term=${encodeURIComponent(item.name)}`); }
  if (item.rom) { // console game: straight into the right emulator
    toast(`🎮 جاري تشغيل ${item.name}…`);
    const e2 = await pv.romLaunch(item.id, item.rom, item.console, item.emuPref || '');
    if (e2) toast(e2);
    return;
  }
  const err = await pv.launch(item.target, item.id, item.args);
  toast(err ? `ما قدرت أفتح: ${err}` : `جاري فتح ${item.name}…`);
}

let videoPoll = null;
function openWeb(item) {
  openItem = item;
  const host = $('#wvHost');
  host.innerHTML = '';
  const url = item.lastUrl || item.target;
  const resumeAt = item.lastTime && item.lastUrl === url ? item.lastTime : 0;
  $('#wvTitle').textContent = item.name;
  const note = $('#wvNote');
  note.hidden = !resumeAt;
  note.textContent = resumeAt ? `وقفت عند ${fmtClock(resumeAt)}` : '';
  $('#webWrap').hidden = false;
  closeDrawer();

  if (!inElectron) { // plain browser fallback (for testing the layout)
    const f = document.createElement('iframe');
    f.src = url; f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff';
    host.appendChild(f);
    return;
  }
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:preview'); // keeps your logins (YouTube, etc.)
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('src', url);
  host.appendChild(wv);

  let wcId = null, seeked = !resumeAt, waited = 0;
  wv.addEventListener('dom-ready', () => { try { wcId = wv.getWebContentsId(); } catch {} });

  // Sites change the address while a video plays (time stamps, tracking bits): only a different
  // page/episode starts the minute counter over
  const samePage = (a, b) => { try { const x = new URL(a), y = new URL(b); const keep = (u) => [...u.searchParams].filter(([k]) => !/^(t|time|start|s|ts|pos|position|utm_.*|ref|si|feature|pp|list|index|autoplay)$/i.test(k)).sort().join('&'); return x.host === y.host && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') && keep(x) === keep(y); } catch { return a === b; } };
  const remember = (e) => {
    if (!e.url || e.url.startsWith('about:')) return;
    if (!item.lastUrl || !samePage(e.url, item.lastUrl)) { item.lastTime = 0; item.lastDuration = 0; }
    item.lastUrl = e.url;
    item.lastOpened = Date.now();
    save();
  };
  wv.addEventListener('did-navigate', remember);
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) remember(e); });
  wv.addEventListener('page-title-updated', (e) => {
    $('#wvTitle').textContent = `${item.name} — ${e.title}`;
    item.lastNote = e.title;
    save();
  });

  clearInterval(videoPoll);
  videoPoll = setInterval(async () => {
    if (!wcId || openItem !== item) return;
    waited += 2;
    const st = await pv.videoState(wcId).catch(() => null);
    if (!seeked) {
      if (st && st.d > resumeAt) {
        seeked = true;
        if (st.t < resumeAt - 5) {
          const ok = await pv.videoSeek(wcId, resumeAt).catch(() => null);
          toast(ok ? `رجعتك للدقيقة ${fmtClock(resumeAt)}` : `وقفت عند الدقيقة ${fmtClock(resumeAt)}`);
        }
        return;
      }
      if (waited >= 30) { seeked = true; toast(`وقفت عند الدقيقة ${fmtClock(resumeAt)}`); }
      return;
    }
    if (st && st.t > 5) {
      item.lastTime = st.t; item.lastDuration = st.d;
      note.hidden = false; note.textContent = `⏱ ${fmtClock(st.t)} / ${fmtClock(st.d)}`;
      save();
    }
  }, 2000);

  $('#wvBack').onclick = () => wv.canGoBack() && wv.goBack();
  $('#wvFwd').onclick = () => wv.canGoForward() && wv.goForward();
  $('#wvReload').onclick = () => wv.reload();
  $('#wvHome').onclick = () => wv.loadURL(item.target);
}

async function lastVideoState() { // one last look at the player before the tab closes
  try {
    const wv = $('#wvHost webview'); const item = openItem;
    if (!wv || !item) return;
    const st = await pv.videoState(wv.getWebContentsId());
    if (st && st.t > 5) { item.lastTime = st.t; item.lastDuration = st.d; save(); }
  } catch {}
}
async function closeWeb() {
  await lastVideoState();
  clearInterval(videoPoll);
  window.Music?.resumeIfPaused();
  $('#webWrap').hidden = true;
  $('#wvHost').innerHTML = '';
  openItem = null;
  render();
}
function closeWebIfOpen() { if (!$('#webWrap').hidden) { lastVideoState(); clearInterval(videoPoll); $('#webWrap').hidden = true; $('#wvHost').innerHTML = ''; openItem = null; } }
$('#wvClose').onclick = closeWeb;

// ---------- Category picker (tap to choose; no typing needed) ----------
const CAT_PRESETS = {
  games: ['أكشن', 'مغامرة', 'عالم مفتوح', 'قتال', 'سباق', 'رياضة', 'رعب', 'تعاون', 'أونلاين', 'استراتيجية', 'ألغاز', 'RPG', 'ريلاكس', 'مع الشباب', 'قصة'],
  emu: ['أكشن', 'مغامرة', 'قتال', 'سباق', 'رياضة', 'RPG', 'ألغاز', 'كلاسيك'],
  watch: ['مسلسلات', 'أفلام', 'أنمي', 'بث', 'بودكاست', 'يوتيوب', 'وثائقي', 'رياضة'],
  apps: ['أدوات', 'تواصل', 'متصفحات', 'تصميم', 'صوت وفيديو', 'عمل', 'ألعاب'],
  mods: ['تعريب', 'مود', 'أداة'],
};
function drawCatChips() {
  const p = editingId ? findItem(editingId)?.page : page();
  const chosen = form.categories.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
  const pool = [...new Set([...(CAT_PRESETS[p?.type] || CAT_PRESETS[p?.id] || CAT_PRESETS.games), ...(p?.items || []).flatMap((i) => i.categories || []), ...chosen])];
  $('#catChips').innerHTML = pool.map((c) => `<button type="button" class="chip ${chosen.includes(c) ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')
    + `<button type="button" class="chip add" data-new>＋ جديد</button>`;
  $('#catChips').querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => {
    const c = b.dataset.c, now = new Set(chosen);
    now.has(c) ? now.delete(c) : now.add(c);
    form.categories.value = [...now].join('، '); drawCatChips();
  }; });
  $('#catChips').querySelector('[data-new]').onclick = (ev) => {
    const b = ev.currentTarget;
    b.outerHTML = '<input class="chip-input" placeholder="اسم التصنيف ↵" maxlength="24">';
    const inp = $('#catChips .chip-input'); inp.focus();
    const done = () => { const v = inp.value.trim(); if (v) form.categories.value = [...chosen, v].join('، '); drawCatChips(); };
    inp.onkeydown = (k) => { if (k.key === 'Enter') { k.preventDefault(); done(); } if (k.key === 'Escape') drawCatChips(); };
    inp.onblur = done;
  };
}

// ---------- Downloads from the in-app browser ----------
const mb = (b) => (b / 1048576).toFixed(b > 1073741824 ? 0 : 1) + ' MB';
pv.onDownload((m) => {
  if (m.state === 'fast') { toast(`⚡ ${m.name}: يتحمّل بالتحميل السريع (تحت يسار)`); $('#dlBox') && ($('#dlBox').hidden = true); return; }
  let box = $('#dlBox');
  if (!box) { box = document.createElement('div'); box.id = 'dlBox'; document.body.appendChild(box); }
  box.hidden = false;
  const pct = m.total ? Math.round((m.got || 0) / m.total * 100) : 0;
  box.innerHTML = `<b>⬇ ${esc(m.name)}</b><small>${m.state === 'done' ? '✓ نزل في التنزيلات' : m.state === 'fail' ? '✗ ما كمل التحميل' : m.total ? `${pct}% · ${mb(m.got || 0)} من ${mb(m.total)}` : 'بدأ التحميل…'}</small><i style="--p:${m.state === 'done' ? 100 : pct}%"></i>`;
  if (m.state === 'done' && /\.torrent$/i.test(m.name) && m.file) pv.torAdd(m.file).then((r) => r.ok && toast('🧲 بدأ تحميل التورنت'));
  if (m.state === 'done' || m.state === 'fail') { toast(m.state === 'done' ? `✓ نزل ${m.name}` : `ما كمل تحميل ${m.name}`); clearTimeout(box._t); box._t = setTimeout(() => { box.hidden = true; }, 5000); }
});

// ---------- Torrents ----------
function openTorrentAdd() {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="owned-form"><h2>🧲 تحميل تورنت</h2>
    <p class="hint">الصق رابط ماغنت، أو اختر ملف .torrent (وتقدر بعد تسحب الملف وتفلته على البرنامج). أول ما يخلص التحميل، اللعبة تنضاف لمكتبتك جاهزة.</p>
    <input name="m" placeholder="magnet:?xt=…" dir="ltr" autocomplete="off">
    <div class="actions"><button type="button" class="btn ghost" data-f>📁 اختر ملف تورنت</button><button type="button" class="btn ghost" data-dir>📂 مجلد التحميلات</button><button type="button" class="btn ghost" data-x>إلغاء</button><button class="btn primary">ابدأ</button></div></form>`;
  document.body.appendChild(d); d.showModal();
  const f = d.querySelector('form');
  d.querySelector('[data-x]').onclick = () => d.close();
  d.querySelector('[data-dir]').onclick = () => pv.torFolder();
  d.querySelector('[data-f]').onclick = async () => { const p = await pv.pickFile('torrent'); if (!p) return; const r = await pv.torAdd(p); toast(r.ok ? '🧲 بدأ التحميل' : `ما قدرت: ${r.error}`); if (r.ok) d.close(); };
  f.onsubmit = async (e) => { e.preventDefault(); const m = f.m.value.trim(); if (!/^magnet:/i.test(m)) return toast('الصق رابط يبدأ بـ magnet:'); const r = await pv.torAdd(m); toast(r.ok ? '🧲 بدأ التحميل' : `ما قدرت: ${r.error}`); if (r.ok) d.close(); };
  d.addEventListener('close', () => d.remove());
}
const human = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + ' MB';
const fmtLeft = (sec) => sec < 60 ? 'أقل من دقيقة' : sec < 3600 ? `${Math.ceil(sec / 60)} د` : `${Math.floor(sec / 3600)} س ${Math.round((sec % 3600) / 60)} د`;
pv.onTorrent((m) => {
  if (m.status === 'done') { toast(`✅ خلص تحميل ${m.name}`); return; }
  if (m.status === 'note') { toast(m.text, 12000); return; }
  if (m.status === 'dead') { toast(`❌ التورنت ميت: ${m.name}\nما فيه أحد ينشره، فشلته. جرّب تورنت ثاني لنفس اللعبة.`); return; }
  if (m.status === 'list') torLibProgress(m.items || []);
  let box = $('#torBox');
  if (!box) { box = document.createElement('div'); box.id = 'torBox'; document.body.appendChild(box); box.addEventListener('click', (e) => { if (!e.target.closest('button')) box.classList.toggle('tb-open'); }); } // a tap opens / tucks it (for touch)
  if (m.status === 'setup') { box.hidden = false; box.innerHTML = '<b>🧲 أجهّز برنامج التورنت (مرة وحدة)…</b>'; return; }
  const items = (m.items || []).filter((x) => x.status !== 'removed');
  const live = items.filter((x) => ['active', 'waiting', 'paused'].includes(x.status));
  if (!items.length || (!live.length && Date.now() - (box._doneAt || 0) > 15000 && box._doneAt)) { box.hidden = true; return; }
  if (!live.length && !box._doneAt) box._doneAt = Date.now();
  if (live.length) box._doneAt = 0;
  box.hidden = false;
  const cur = items.find((x) => x.status === 'active');
  box.dataset.peek = cur && cur.total ? `⬇ ${Math.floor((cur.done / cur.total) * 100)}%` : live.length ? '⬇' : '✓';
  box.innerHTML = `<div class="tb-head"><b>⬇ التحميلات</b><button class="btn ghost sm" data-dir>📂</button><button class="btn ghost sm" data-hide>✕</button></div>` + items.slice(0, 6).map((x) => {
    const pct = x.total ? Math.floor((x.done / x.total) * 100) : 0;
    const st = x.status === 'active' && !x.done && !x.peers ? '🔎 يدوّر على مصادر<span class="dots"><i>.</i><i>.</i><i>.</i></span>' : x.status === 'waiting' ? `⏳ بالانتظار، يبدأ بعد اللي قبله` : x.status === 'complete' ? '✓ خلص التحميل (📂 يفتح المجلد)' : x.status === 'error' ? `✗ ${x.error || 'وقف'}` : x.status === 'paused' ? '⏸ موقف' : !x.total ? 'يدوّر على الملف…' : `${pct}% · ${human(x.done)} من ${human(x.total)} · ${human(x.speed)}/ث${x.speed > 0 ? ` · باقي ${fmtLeft((x.total - x.done) / x.speed)}` : ''} · ${x.peers} مصدر`;
    return `<div class="tb-row ${x.status}"><span class="tb-name" dir="auto">${esc(x.name)}</span><small>${st}</small>
      ${['active', 'waiting', 'paused'].includes(x.status) ? `<span class="tb-acts"><button data-g="${x.gid}" data-a="${x.status === 'paused' ? 'resume' : 'pause'}">${x.status === 'paused' ? '▶' : '⏸'}</button><button data-g="${x.gid}" data-a="remove">✕</button></span>` : ''}
      <i style="--p:${x.status === 'complete' ? 100 : pct}%"></i></div>`;
  }).join('');
  box.querySelector('[data-dir]').onclick = () => pv.torFolder();
  box.querySelector('[data-hide]').onclick = () => { box.hidden = true; box._doneAt = 1; box.classList.remove('tb-open'); };
  box.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => pv.torAct(b.dataset.g, b.dataset.a));
});
document.addEventListener('paste', async (e) => {
  const t = (e.clipboardData?.getData('text') || '').trim();
  if (!/^magnet:\?/i.test(t) || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  if (confirm('لصقت رابط ماغنت. أبدأ تحميله؟')) { const r = await pv.torAdd(t); toast(r.ok ? '🧲 بدأ التحميل' : `ما قدرت: ${r.error}`); }
});

// ---------- Item editor ----------
const editor = $('#editor');
const form = $('#editorForm');
let editingId = null;

function openEditor(itemId) {
  editingId = itemId;
  const item = itemId ? findItem(itemId).item : null;
  $('#editorTitle').textContent = item ? `تعديل: ${item.name}` : `إضافة إلى ${page().name}`;
  form.name.value = item?.name || '';
  form.target.value = item?.target || '';
  form.image.value = item?.image || '';
  form.categories.value = (item?.categories || []).join('، ');
  drawCatChips();
  form.voice.value = item?.voice || '';
  editor.showModal();
  form.name.focus();
}
form.querySelectorAll('[data-pick]').forEach((b) => {
  b.onclick = async () => {
    if (!inElectron) return toast('اختيار الملفات يشتغل داخل البرنامج');
    const kind = b.dataset.pick;
    const path = await pv.pickFile(kind);
    if (!path) return;
    if (kind === 'image') form.image.value = path;
    else {
      form.target.value = path;
      if (!form.name.value) form.name.value = path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    }
  };
});
$('#autoCover').onclick = async () => {
  const name = form.name.value.trim();
  if (!name) return toast('اكتب اسم اللعبة أول');
  toast('أدور على صورة…');
  const r = await pv.findCover(name);
  if (!r) return toast('ما لقيت صورة، جرّب تكتب الاسم بالإنجليزي كامل');
  form.image.value = r.image;
  form.dataset.hero = r.hero;
  toast(`لقيت: ${r.matched}`);
};
$('#editorCancel').onclick = () => editor.close();
form.onsubmit = async (e) => {
  e.preventDefault();
  const fields = {
    name: form.name.value.trim(),
    target: form.target.value.trim().replace(/^"(.*)"$/, '$1'),
    image: form.image.value.trim().replace(/^"(.*)"$/, '$1'),
    categories: form.categories.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    voice: form.voice.value.trim(),
  };
  if (!fields.name || !fields.target) return;
  const hero = form.dataset.hero; delete form.dataset.hero;
  let item;
  if (editingId) {
    item = findItem(editingId).item;
    if (item.target !== fields.target) { delete item.lastUrl; delete item.lastNote; delete item.lastTime; delete item.args; }
    if (item.image !== fields.image) delete item.hero;
    Object.assign(item, fields);
  } else {
    item = { id: uid(), ...fields };
    (page() || page('apps') || data.pages[0]).items.push(item);
    if (data.removed) delete data.removed[itemKey(item)];
    pv.log(`added by hand: ${fields.name} -> ${fields.target}`);
  }
  if (hero && fields.image) item.hero = hero;
  save();
  editor.close();
  render();
  // Fill in artwork automatically when none was given
  if (!item.image && isWeb(item.target)) webArt(item);
  if (!item.image && !isWeb(item.target)) {
    if (page()?.type === 'games' || page()?.type === 'emu') await autoCoverFor(item, false);
    if (!item.image && !item.icon && isDrivePath(item.target)) { item.icon = await pv.fileIcon(item.target); save(); render(); }
  }
};

// ---------- Drag & drop programs / shortcuts / files ----------
let dragDepth = 0;
// Only real files from Windows count: dragging covers inside the app (tier list, pins) is not "adding"
let innerDrag = false;
document.addEventListener('dragstart', () => { innerDrag = true; }, true);
document.addEventListener('dragend', () => { innerDrag = false; }, true);
const hasFiles = (e) => { const t = [...(e.dataTransfer?.types || [])]; return !innerDrag && t.includes('Files') && !t.includes('text/sb-item') && !t.includes('text/sb-tier'); };
// Where a dropped file goes: the page you're on; from the home screen, a best guess (game / emulator / program)
function dropTarget(path) {
  const cur = currentPageId ? page() : null;
  if (cur && cur.items) return cur;
  const p = String(path || '').toLowerCase();
  const emuNames = /(retroarch|duckstation|pcsx2|rpcs3|shadps4|ppsspp|vita3k|dolphin|cemu|gopher64|snes9x|mesen|mgba|melonds|azahar|citra|lime3ds|flycast|xemu|xenia|ryujinx|yuzu|eden|citron|sudachi|suyu|torzu)/;
  if (emuNames.test(p) && emuPage()) return emuPage();
  if (/steamapps|epic games|riot games|ubisoft|ea games|rockstar games|gog galaxy|\\games\\|xboxgames|battle\.net|launcher/.test(p) && page('games')) return page('games');
  return page('apps') || data.pages.find((x) => x.items) || data.pages[0];
}
// The "drop here" curtain: shown while a file hovers over the window, gone the moment the drag ends or leaves (even when cancelled)
let lastOver = 0;
const dz = () => $('#dropZone');
function showDrop() {
  if ($('#detail') && !$('#detail').hidden) return; // on a game's page, files go to its mods box instead
  const t = currentPageId ? page() : null;
  dz().querySelector('div').textContent = t?.items ? `أفلته هنا وينضاف إلى ${t.name}` : 'أفلته هنا: الألعاب تروح للألعاب، والمحاكيات للمحاكيات، والباقي للتطبيقات';
  dz().hidden = false;
}
function hideDrop() { dragDepth = 0; if (dz()) dz().hidden = true; }
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; lastOver = Date.now(); showDrop(); });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); lastOver = Date.now(); } });
window.addEventListener('dragleave', (e) => { if (--dragDepth <= 0 || !e.relatedTarget) hideDrop(); });
setInterval(() => { if (dz() && !dz().hidden && Date.now() - lastOver > 400) hideDrop(); }, 250); // a cancelled drag sends no "leave": this catches it
['mousemove', 'keydown', 'blur', 'mouseup'].forEach((ev) => window.addEventListener(ev, () => { if (dz() && !dz().hidden && Date.now() - lastOver > 150) hideDrop(); }, true));
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) { innerDrag = false; hideDrop(); return; }
  if ($('#detail') && !$('#detail').hidden) { e.preventDefault(); hideDrop(); return; } // the game page handles its own drops (mods)
  e.preventDefault();
  hideDrop();
  if (!inElectron) return toast('السحب والإفلات يشتغل داخل البرنامج');
  let target = null;
  let n = 0, busyN = 0, dupN = 0; // added now / downloading or being prepared / already there
  for (const f of e.dataTransfer.files) {
    const p = pv.pathForFile(f);
    if (!p) continue;
    const info = await pv.fileInfo(p);
    if (!info.exists) continue;
    if (/\.torrent$/i.test(p) && currentPageId === 'games' && gamesTab === 'tor') { await addToTorLib(p); continue; }
    if (/\.torrent$/i.test(p)) { addToTorLib(p, true);
      const r = await pv.torAdd(p); toast(r.ok ? '🔎 جاري البحث عن مصادر… تشوف التقدم تحت يسار' : `ما قدرت: ${r.error}`); busyN++; continue; }
    const rom = await pv.romImport(p);
    if (rom?.pending) { toast(`⏳ جاري تجهيز ${rom.name}… تنضاف للألعاب لحالها لما تخلص`); busyN++; continue; }
    if (rom) { if (addRomGame(rom, true)) n++; else { dupN++; toast(`${cleanRomName(rom.raw || '')} موجودة من قبل في مكتبتك`); } continue; }
    const dup = data.pages.find((pg) => pg.items.some((i) => String(i.target).toLowerCase() === p.toLowerCase()));
    pv.log(`drop: ${p} -> ${target.id}${dup ? ' (already in ' + dup.id + ')' : ''}`);
    if (dup) { toast(`${info.name} موجود من قبل في ${dup.name}`); dupN++; continue; }
    if (data.removed) delete data.removed['t:' + p.toLowerCase()];
    target = dropTarget(p);
    const item = { id: uid(), name: info.name, target: p, image: '', categories: [], voice: '' };
    item.icon = await pv.fileIcon(p);
    target.items.push(item);
    n++;
    if (target.type === 'games' || target.type === 'emu') autoCoverFor(item, false);
  }
  save();
  if (!currentPageId && target) goPage(target.id); else render();
  if (n) toast(target ? `انضاف ${n} إلى ${target.name}` : `انضاف ${n}`);
  else if (!busyN && !dupN) toast('ما قدرت أضيف هذا الملف');
});

// ---------- Page editor ----------
const pageEditor = $('#pageEditor');
const pageForm = $('#pageForm');
let editingPageId = null;
function openPageEditor(pageId) {
  editingPageId = pageId;
  const p = pageId ? page(pageId) : null;
  $('#pageEditorTitle').textContent = p ? 'تعديل الصفحة' : 'صفحة جديدة';
  pageForm.name.value = p?.name || '';
  pageForm.icon.value = p?.iconStyle === 'emoji' ? p.icon || '' : '';
  peDraft = { iconKind: p ? (p.iconImg || p.iconStyle === 'emoji' ? null : (p.iconKind || null)) : 'folder', iconImg: p?.iconImg || '', cover: p?.cover || '', noAutoArt: !!p?.noAutoArt, type: p?.type, id: p?.id || 'new', items: p?.items || [] };
  drawPageEditorArt();
  pageEditor.showModal();
  pageForm.name.focus();
}
$('#pageCancel').onclick = () => pageEditor.close();
let peDraft = {};
function drawPageEditorArt() {
  const cur = peDraft.iconImg ? 'img' : pageForm.icon.value.trim() ? 'emoji' : (peDraft.iconKind || (PAGE_ICON_KINDS.includes(peDraft.type) ? peDraft.type : PAGE_ICON_KINDS.includes(peDraft.id) ? peDraft.id : 'folder'));
  $('#peIcons').innerHTML = PAGE_ICON_KINDS.map((k) => `<button type="button" class="pe-ico ${cur === k ? 'on' : ''}" data-k="${k}">${pageIconSvg(k)}</button>`).join('')
    + (peDraft.iconImg ? `<button type="button" class="pe-ico on"><img src="${esc(toImageUrl(peDraft.iconImg))}" alt=""></button>` : '');
  $('#peIcons').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { peDraft.iconKind = b.dataset.k; peDraft.iconImg = ''; pageForm.icon.value = ''; drawPageEditorArt(); }; });
  $('#peCover').innerHTML = `<div class="shelf-card pe-prev"><div class="art">${pageCardBg({ ...peDraft, iconKind: cur !== 'img' && cur !== 'emoji' ? cur : peDraft.iconKind })}</div><div class="shade"></div></div>`;
}
$('#peIconImg').onclick = async () => { const f = await pv.pickFile('image'); if (f) { peDraft.iconImg = f; pageForm.icon.value = ''; drawPageEditorArt(); } };
pageForm.icon.oninput = () => { if (pageForm.icon.value.trim()) { peDraft.iconImg = ''; } drawPageEditorArt(); };
$('#peCoverPick').onclick = async () => { const f = await pv.pickFile('image'); if (f) { peDraft.cover = f; peDraft.noAutoArt = false; drawPageEditorArt(); } };
$('#peCoverAuto').onclick = () => { peDraft.cover = ''; peDraft.noAutoArt = false; drawPageEditorArt(); };
$('#peCoverPlain').onclick = () => { peDraft.cover = ''; peDraft.noAutoArt = true; drawPageEditorArt(); };
pageForm.onsubmit = (e) => {
  e.preventDefault();
  const name = pageForm.name.value.trim();
  if (!name) return;
  const emoji = pageForm.icon.value.trim();
  const look = { name, icon: emoji || page(editingPageId)?.icon || '📁', iconStyle: emoji ? 'emoji' : 'art', iconImg: emoji ? '' : peDraft.iconImg || '',
    iconKind: peDraft.iconKind || undefined, cover: peDraft.cover || '', noAutoArt: !!peDraft.noAutoArt };
  if (editingPageId) Object.assign(page(editingPageId), look);
  else { data.pages.push({ id: uid(), ...look, items: [] }); data.homeFocus = data.pages.length - 1; }
  save();
  pageEditor.close();
  render();
};
function deletePage(id) {
  const p = page(id);
  if (!confirm(`حذف صفحة "${p.name}" وكل اللي فيها (${p.items.length})؟`)) return;
  data.pages = data.pages.filter((x) => x.id !== id);
  data.removedPages = [...new Set([...(data.removedPages || []), id])]; // built-in pages don't come back by themselves
  if (currentPageId === id) currentPageId = null;
  if (data.homeFocus >= data.pages.length) data.homeFocus = Math.max(0, data.pages.length - 1);
  save(); render();
}
function movePage(id, dir) {
  const i = data.pages.findIndex((p) => p.id === id);
  const j = i + dir;
  if (j < 0 || j >= data.pages.length) return;
  [data.pages[i], data.pages[j]] = [data.pages[j], data.pages[i]];
  save(); render();
}
function moveItemMenu(e, item) {
  const from = page();
  const list = selection.size > 1 && selection.has(item.id) ? from.items.filter((i) => selection.has(i.id)) : [item];
  setTimeout(() => showCtx(e, data.pages.filter((p) => p !== from && !['calendar', 'gallery'].includes(p.type)).map((p) => ({
    label: p.name,
    run: () => {
      from.items = from.items.filter((i) => !list.includes(i)); p.items.push(...list);
      for (const i of list) { if (p.categories && i.categories) i.categories = i.categories.filter((c) => p.items.some((o) => o !== i && (o.categories || []).includes(c))); }
      selection.clear(); save(); renderPage(); toast(list.length > 1 ? `انتقلت ${list.length} إلى ${p.name}` : `انتقل إلى ${p.name}`);
    },
  }))), 0);
}
function drawSelection() {
  view.querySelectorAll('.tile[data-item]').forEach((t) => t.classList.toggle('picked', selection.has(t.dataset.item)));
  let bar = $('#selBar');
  if (!selection.size) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'selBar'; document.body.appendChild(bar); }
  bar.innerHTML = `<b>${selection.size} محدد</b><button class="btn ghost sm" data-s="move">نقل إلى…</button><button class="btn ghost sm" data-s="del">حذف</button><button class="btn ghost sm" data-s="clear">إلغاء</button><small>Shift للمدى · Ctrl للواحد</small>`;
  bar.querySelector('[data-s=move]').onclick = (e) => { const first = page()?.items.find((i) => selection.has(i.id)); if (first) moveItemMenu(e, first); };
  bar.querySelector('[data-s=del]').onclick = () => { const list = page().items.filter((i) => selection.has(i.id)); if (confirm(`حذف ${list.length} عناصر؟`)) { deleteItems(list); selection.clear(); renderPage(); drawSelection(); } };
  bar.querySelector('[data-s=clear]').onclick = () => { selection.clear(); drawSelection(); };
}

// ---------- Context menu ----------
const ctx = $('#ctx');
function showCtx(e, entries) {
  e.preventDefault();
  ctx.innerHTML = '';
  for (const en of entries) {
    if (en === '-') { ctx.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.textContent = en.label;
    if (en.danger) b.className = 'danger';
    b.onclick = (ev) => { ev.stopPropagation(); if (!en.keepOpen) hideCtx(); en.run(); };
    ctx.appendChild(b);
  }
  ctx.hidden = false;
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.max(8, Math.min(e.clientX, innerWidth - r.width - 8)) + 'px';
  ctx.style.top = Math.max(8, Math.min(e.clientY, innerHeight - r.height - 8)) + 'px';
}
function hideCtx() { ctx.hidden = true; }
document.addEventListener('click', (e) => { if (!ctx.contains(e.target)) hideCtx(); });

// ---------- Themes ----------
function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  data.theme = id;
  document.body.dataset.theme = id;
  window.applyScene?.(id);
  save();
  window.Music?.themeChanged();
  window.Pad?.syncLight();
}
function openThemePicker() {
  $('#themeGrid').innerHTML = THEMES.map((t) => `
    <button type="button" class="theme-card ${data.theme === t.id ? 'on' : ''}" data-theme-pick="${t.id}">
      <div class="sw" data-theme="${t.id}"><b>Aa</b><i></i><i></i><i class="acc"></i></div>
      <div class="tn">${t.name}</div>
    </button>`).join('');
  $('#themeGrid').querySelectorAll('[data-theme-pick]').forEach((el) => {
    el.onclick = () => {
      setTheme(el.dataset.themePick);
      $('#themeGrid').querySelectorAll('.theme-card').forEach((c) => c.classList.toggle('on', c === el));
    };
  });
  $('#themePicker').showModal();
}
$('#themeBtn').onclick = (e) => { e.stopPropagation(); openThemePicker(); };
$('#themeClose').onclick = () => $('#themePicker').close();
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// ---------- Music (Spotify) ----------
async function media(k, label) {
  if (k === 'playpause' || k === 'next' || k === 'prev') window.Music?.pauseForApp(); // Spotify takes over
  const ok = await pv.mediaKey(k);
  if (label) toast(ok ? label : 'التحكم بالموسيقى يشتغل داخل البرنامج');
}
function openSpotify() {
  if (page('music')) { goPage('music'); return; }
  const sp = allItems().find((i) => /^spotify:/i.test(i.target));
  pv.launch(sp ? sp.target : 'spotify:', sp?.id);
}
// ---------- Spotify bar (always at the top) ----------
let spState = { running: false };
function drawSpotify() {
  const t = $('#spText');
  const bar = $('#spotifyBar');
  bar.classList.toggle('playing', !!spState.playing);
  bar.classList.toggle('off', !spState.running);
  t.innerHTML = !spState.running ? '<span>افتح سبوتيفاي</span>'
    : spState.playing ? `<span class="sp-track">${esc(spState.track)}</span><small>${esc(spState.artist || '')}</small>`
    : '<span>متوقف مؤقتاً</span>';
  t.title = spState.playing ? `${spState.track} — ${spState.artist}` : '';
}
async function pollSpotify() {
  if (!inElectron || document.hidden) return;
  const was = spState.playing;
  try { spState = await pv.spotifyNow(); } catch { spState = { running: false }; }
  if (!!spState.playing !== !!was) window.Music?.spotifyChanged(!!spState.playing); // Spotify takes the stage; the tunes wait
  if (spState.running && inElectron) { // keep the cover in the bar current even when the card is closed
    const r = await pv.mediaNow(false).catch(() => null);
    if (r?.ok && !r.none) { const key = `${r.title}|${r.artist}`; if (key !== spMediaKey) { spMediaKey = key; spArtTries = 0; $('#spotifyBar').classList.remove('has-art'); spPop.classList.remove('has-art'); } if (!$('#spotifyBar').classList.contains('has-art') && !spArtBusy && spArtTries < 4) loadSpArt(); }
  } else $('#spotifyBar').classList.remove('has-art');
  drawSpotify();
}
async function spKey(k) {
  if (!spState.running) { openSpotify(); return; }
  await media(k);
  setTimeout(pollSpotify, 700);
}
$('#spOpen').onclick = (e) => { e.stopPropagation(); openSpotify(); };
$('#spText').onclick = (e) => { e.stopPropagation(); openSpotify(); };
$('#spPrev').onclick = (e) => { e.stopPropagation(); spKey('prev'); };
$('#spPlay').onclick = (e) => { e.stopPropagation(); spKey('playpause'); };
$('#spNext').onclick = (e) => { e.stopPropagation(); spKey('next'); };
$('#spotifyBar').oncontextmenu = (e) => showCtx(e, [
  { label: '🔊  علّ الصوت', run: () => media('volup'), keepOpen: true },
  { label: '🔉  وطّ الصوت', run: () => media('voldown'), keepOpen: true },
  { label: '🎵  افتح سبوتيفاي', run: openSpotify },
]);
// ---------- Spotify docked inside the Spotify page ----------
// The real Spotify window sits exactly over #spDockArea. It hides whenever something of ours
// (menu, dialog, detail screen, web tab...) needs to be on top, and when you leave the page.
let spDock = { on: false, rect: '' };
function spDockBlocked() {
  return !!(document.querySelector('dialog[open]') || document.body.classList.contains('drawer-open')
    || !$('#ctx')?.hidden || !$('#webWrap').hidden || ($('#detail') && !$('#detail').hidden)
    || document.querySelector('#viewer:not([hidden])') || document.hidden);
}
async function spDockSync(force) {
  const area = currentPageId === 'music' && document.getElementById('spDockArea');
  const want = !!area && !spDockBlocked();
  if (!want) { if (spDock.on) { spDock.on = false; spDock.rect = ''; pv.spDockHide(); } return; }
  const r = area.getBoundingClientRect();
  const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
  const key = [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(',');
  if (spDock.on && key === spDock.rect && !force) return;
  const first = !spDock.on;
  spDock.on = true; spDock.rect = key;
  const res = await (first ? pv.spDockShow(rect) : pv.spDockMove(rect));
  if (first && res && !res.ok && res.none && document.getElementById('spDockArea')) {
    spDock.on = false;
    area.querySelector('.spd-msg b').textContent = res.notInstalled ? 'برنامج سبوتيفاي مو مثبت على الجهاز' : 'ما قدرت أفتح سبوتيفاي';
    area.querySelector('.spd-msg small').textContent = res.notInstalled ? 'ثبّته من متجر مايكروسوفت، وبعدها يفتح هنا داخل البرنامج' : 'ارجع لهالصفحة وجرب مرة ثانية';
  }
}
setInterval(() => spDockSync(false), 250);

// ---------- Hover card: album art + seek bar ----------
const spPop = document.createElement('div');
spPop.id = 'spPop'; spPop.hidden = true;
spPop.innerHTML = `
  <div class="spp-art"><img alt=""><span>♪</span></div>
  <div class="spp-info"><b class="spp-title">—</b><small class="spp-artist"></small><small class="spp-album"></small></div>
  <input type="range" class="spp-seek" min="0" max="100" step="0.5" value="0">
  <div class="spp-times"><span class="spp-cur">0:00</span><span class="spp-dur">0:00</span></div>
  <div class="spp-ctrl"><button data-k="prev">⏮</button><button data-k="playpause" class="spp-pp">⏯</button><button data-k="next">⏭</button></div>`;
$('#spotifyBar').appendChild(spPop);
let spMedia = null, spMediaKey = '', spPopTimer = 0, spPopPoll = 0, spDragging = false, spArtBusy = false, spArtTries = 0;
// The song's cover, shown in the card and as the little picture in the bar
async function loadSpArt() {
  spArtBusy = true; spArtTries++;
  try {
    const t = await pv.mediaNow(true);
    let art = t?.thumb || '';
    if (!art && t?.title && pv.mediaArt) art = await pv.mediaArt(t.title, t.artist); // Windows didn't give it: find it online
    if (art && `${t.title}|${t.artist}` === spMediaKey) {
      spPop.querySelector('.spp-art img').src = art; spPop.classList.add('has-art');
      $('#spotifyBar').style.setProperty('--sp-art', `url("${art}")`); $('#spotifyBar').classList.add('has-art');
    } else if (t?.thumbError && spArtTries === 1) pv.log('spotify cover: ' + t.thumbError);
  } catch {} finally { spArtBusy = false; }
}
const spClock = (t) => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function spPos() {
  if (!spMedia) return 0;
  let p = spMedia.pos || 0;
  if (spMedia.playing && spMedia.updated) p += (Date.now() - spMedia.updated) / 1000;
  return Math.min(p, spMedia.dur || p);
}
function drawPopTime() {
  if (spPop.hidden || !spMedia) return;
  const seek = spPop.querySelector('.spp-seek');
  const dur = spMedia.dur || 0, pos = spPos();
  seek.max = Math.max(1, dur);
  if (!spDragging) seek.value = pos;
  seek.style.setProperty('--p', (dur ? (Number(seek.value) / dur) * 100 : 0) + '%');
  spPop.querySelector('.spp-cur').textContent = spClock(spDragging ? seek.value : pos);
  spPop.querySelector('.spp-dur').textContent = spClock(dur);
}
async function refreshPop() {
  let r;
  try { r = await pv.mediaNow(false); } catch { r = null; }
  if (!r || !r.ok || r.none) {
    spMedia = null;
    spPop.classList.add('empty');
    spPop.querySelector('.spp-title').textContent = spState.running ? 'ما فيه شي شغّال' : 'سبوتيفاي مقفل';
    spPop.querySelector('.spp-artist').textContent = spState.running ? 'شغّل أغنية من سبوتيفاي' : 'اضغط الشعار عشان تفتحه';
    spPop.querySelector('.spp-album').textContent = '';
    return;
  }
  spPop.classList.remove('empty');
  const key = `${r.title}|${r.artist}`;
  if (key !== spMediaKey) {
    spMediaKey = key;
    spPop.querySelector('.spp-title').textContent = r.title || '';
    spPop.querySelector('.spp-artist').textContent = r.artist || '';
    spPop.querySelector('.spp-album').textContent = r.album && r.album !== r.title ? r.album : '';
    spPop.querySelector('.spp-art img').removeAttribute('src'); spPop.classList.remove('has-art');
    spArtTries = 0;
  }
  if (!spPop.classList.contains('has-art') && !spArtBusy && spArtTries < 4) loadSpArt();
  spMedia = r;
  spPop.classList.toggle('playing', !!r.playing);
  drawPopTime();
}
function openPop() {
  clearTimeout(spPopTimer);
  if (currentPageId === 'music') return; // Spotify itself is on screen
  if (!spPop.hidden) return;
  spPop.hidden = false;
  requestAnimationFrame(() => spPop.classList.add('show'));
  refreshPop();
  clearInterval(spPopPoll);
  spPopPoll = setInterval(() => { refreshPop(); }, 2000);
  spPop._tick = setInterval(drawPopTime, 250);
}
function closePop(now) {
  clearTimeout(spPopTimer);
  spPopTimer = setTimeout(() => {
    spPop.classList.remove('show');
    clearInterval(spPopPoll); clearInterval(spPop._tick);
    setTimeout(() => { if (!spPop.classList.contains('show')) spPop.hidden = true; }, 180);
  }, now ? 0 : 350);
}
window.spPopOpen = openPop;
$('#spotifyBar').addEventListener('mouseenter', openPop);
$('#spotifyBar').addEventListener('mouseleave', () => { if (!spDragging) closePop(); });
spPop.addEventListener('click', (e) => e.stopPropagation());
{
  const seek = spPop.querySelector('.spp-seek');
  seek.addEventListener('pointerdown', () => { spDragging = true; });
  seek.addEventListener('input', drawPopTime);
  seek.addEventListener('change', async () => {
    const sec = Number(seek.value);
    spDragging = false;
    if (spMedia) { spMedia.pos = sec; spMedia.updated = Date.now(); }
    drawPopTime();
    await pv.mediaSeek(sec);
    setTimeout(refreshPop, 500);
  });
  window.addEventListener('pointerup', () => { if (spDragging) setTimeout(() => { spDragging = false; if (!$('#spotifyBar').matches(':hover')) closePop(); }, 50); });
}
spPop.querySelectorAll('.spp-ctrl button').forEach((b) => {
  b.onclick = async (e) => { e.stopPropagation(); await spKey(b.dataset.k); spMediaKey = ''; setTimeout(refreshPop, 600); setTimeout(refreshPop, 1500); };
});

drawSpotify();
setInterval(pollSpotify, 5000);
window.addEventListener('focus', pollSpotify);
setTimeout(pollSpotify, 1500);

// ---------- Settings ----------
function openSettings(tab = 'general') {
  $('#setAutostart').checked = !!data.settings.autostart;
  document.querySelectorAll('#settings .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  $('#setGeneral').hidden = tab !== 'general';
  $('#setControls').hidden = tab !== 'controls';
  $('#setMoods').hidden = tab !== 'moods';
  if (tab === 'moods') window.renderMoodSettings?.($('#setMoods'));
  if (tab === 'controls') window.renderControlSettings?.($('#setControls'));
  $('#setVoiceModel').value = data.settings.voiceModel || 'base';
  $('#setArtStrong').checked = !!data.settings.artStrong;
  $('#setWakeOn').checked = !!data.settings.wakeOn;
  $('#setName').value = data.user?.name || '';
  $('#setBright').value = Math.round((data.settings.brightness ?? 1) * 100);
  $('#setAfk').checked = data.settings.afk !== false;
  $('#settings').showModal();
}
$('#setVoiceModel').onchange = () => { data.settings.voiceModel = $('#setVoiceModel').value; data.settings.voiceChosen = true; save(); window.Voice?.reset(); window.Voice?.preload(); };
$('#settingsClose').onclick = () => $('#settings').close();
$('#setAutostart').onchange = async () => { data.settings.autostart = $('#setAutostart').checked; save(); const on = await pv.autostart(data.settings.autostart); toast(on ? 'Silver Bullet بيشتغل مع ويندوز' : 'ما راح يشتغل مع ويندوز'); };
document.querySelectorAll('#settings .tab').forEach((t) => t.onclick = () => { const open = $('#settings').open; if (open) $('#settings').close(); openSettings(t.dataset.tab); });
$('#setArtStrong').onchange = () => { data.settings.artStrong = $('#setArtStrong').checked; save(); document.body.classList.toggle('art-strong', data.settings.artStrong); };
$('#voiceTest').onclick = () => { $('#settings').close(); window.Voice?.start(); };
// The assistant is called Akai, always: the wake word is his name
const saveWake = () => {
  data.settings.wakeWord = 'أكاي';
  data.settings.wakeOn = $('#setWakeOn').checked;
  save(); window.Voice?.wakeStop(); setTimeout(() => window.Voice?.wakeSync(), 300);
  if (data.settings.wakeOn) toast('🎙 قل "أكاي" وبعدها طلبك');
};
$('#setWakeOn').onchange = saveWake;
$('#setName').onchange = () => { data.user = { ...(data.user || {}), name: $('#setName').value.trim() }; save(); if (!currentPageId) $('#title').textContent = greeting(); };
$('#setBright').oninput = () => { data.settings.brightness = Number($('#setBright').value) / 100; save(); window.SB?.applyLook(); };
$('#setAfk').onchange = () => { data.settings.afk = $('#setAfk').checked; save(); };
$('#setBgPick').onclick = async () => { const f = await pv.pickFile('media'); if (f) { data.settings.customBg = f; save(); window.SB?.applyLook(); toast('صارت خلفيتك'); } };
$('#setBgClear').onclick = () => { delete data.settings.customBg; save(); window.SB?.applyLook(); toast('رجعت خلفية الثيم'); };

// ---------- Voice commands ----------
const AR_FILLER = /^(?:(?:يا|طيب|لو سمحت|ممكن)\s+)*(?:(?:شغل|شغلي|شغللي|شغل لي|افتح|افتحي|افتح لي|افتحلي|ابي|ابغي|ابغا|ابا|ودني|ودني على|وديني|روح|رح|خذني|ادخل|دخلني|حط|حط لي|حطلي|خل|خلي|خله|ابدا|عطني|play|open|start)\s+)+/;
function normAr(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ْـٰ]/g, '')
    .replace(/[إأآٱا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/گ/g, 'ك').replace(/[ڤ]/g, 'ف')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const LATIN = [['sh', 'ش'], ['ch', 'تش'], ['th', 'ث'], ['ph', 'ف'], ['kh', 'خ'], ['gh', 'غ'], ['oo', 'و'], ['ee', 'ي'], ['ck', 'ك'], ['qu', 'كو']];
const LETTER = { a: 'ا', b: 'ب', c: 'ك', d: 'د', e: 'ي', f: 'ف', g: 'ج', h: 'ه', i: 'ي', j: 'ج', k: 'ك', l: 'ل', m: 'م', n: 'ن', o: 'و', p: 'ب', q: 'ك', r: 'ر', s: 'س', t: 'ت', u: 'و', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز' };
function latinToAr(s) {
  let t = String(s).toLowerCase();
  for (const [a, b] of LATIN) t = t.split(a).join(b);
  return t.replace(/[a-z]/g, (c) => LETTER[c] || '');
}
const skeleton = (s) => s.replace(/[اويهع\s]/g, '').replace(/[جغق]/g, 'ج').replace(/[سصث]/g, 'س').replace(/[تط]/g, 'ت').replace(/[دض]/g, 'د').replace(/[زذظ]/g, 'ز');
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function sim(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.includes(s) && s.length / l.length >= 0.45) return 0.75 + 0.25 * (s.length / l.length);
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}
function phraseScore(spoken, phrase) {
  const p = normAr(/[a-z]/i.test(phrase) ? latinToAr(phrase) : phrase);
  const p2 = normAr(phrase);
  return Math.max(sim(spoken, p), sim(spoken, p2), 0.95 * sim(skeleton(spoken), skeleton(p)));
}

function voiceCandidates() {
  const c = [];
  const add = (phrases, label, run) => { for (const ph of phrases) if (ph && String(ph).trim()) c.push({ ph: String(ph).trim(), label, run }); };
  add(['رجوع', 'ارجع', 'back'], 'رجوع', () => { if (!$('#webWrap').hidden) closeWeb(); else if (currentPageId) goHome(); });
  add(['الرئيسيه', 'الصفحه الرئيسيه', 'هوم', 'home'], 'الرئيسية', goHome);
  add(['الافضل', 'الليدر بورد', 'المتصدرين'], '🏆 الأفضل', () => goPage(currentPageId && page().type !== 'apps' ? currentPageId : 'games', '__top'));
  add(['وقف الموسيقى', 'وقف الاغنيه', 'اسكت', 'بوز', 'شغل الموسيقى', 'شغل الاغاني', 'موسيقى', 'pause'], '⏯ الموسيقى', () => media('playpause', '⏯'));
  add(['الاغنيه الي بعدها', 'الاغنيه التاليه', 'التالي', 'next'], '⏭ التالية', () => media('next', '⏭ التالية'));
  add(['الاغنيه الي قبلها', 'الاغنيه السابقه', 'السابق'], '⏮ السابقة', () => media('prev', '⏮ السابقة'));
  add(['الثيمات', 'غير الثيم'], 'الثيمات', openThemePicker);
  add(['شغل الالحان', 'شغل اللحن', 'الالحان', 'القرص'], '🎵 الألحان', () => window.Music?.play());
  add(['وقف الالحان', 'وقف اللحن', 'سكت اللحن'], '⏸ الألحان', () => window.Music?.pause());
  add(['القائمه', 'المنيو'], 'القائمة', openDrawer);
  const THEME_WORDS = { wood: ['خشبي', 'كلاسيك'], cyber: ['سايبر', 'سايبر بانك'], miami: ['ميامي', 'جي تي اي', 'جراند', 'قراند'], farm: ['ستاردو', 'ستاردو فالي', 'مزرعه'], blocks: ['ماينكرافت', 'مكعبات'], arcade: ['اركيد', 'ريترو'], souls: ['سولز', 'دارك سولز', 'الدن رينق'], pirate: ['ون بيس', 'قراصنه', 'البحر'], najdi: ['نجدي', 'نجد', 'الطين'], vintage: ['فينتج', 'كلاسيك غامق', 'قديم'] };
  for (const t of THEMES) {
    const short = t.name.replace(/\s*\(.*\)/, '');
    add([`ثيم ${t.name}`, `ثيم ${short}`, short, ...(THEME_WORDS[t.id] || []).flatMap((w) => [w, `ثيم ${w}`])], `ثيم ${short}`, () => { setTheme(t.id); toast(`ثيم ${short}`); });
  }
  for (const p of data.pages) {
    add([p.name, `صفحه ${p.name}`, p.id === 'emu' ? 'المحاكي' : '', p.id === 'games' ? 'الالعاب' : '', p.id === 'watch' ? 'الافلام' : '', p.id === 'mods' ? 'المودات' : ''], `${p.icon} ${p.name}`, () => goPage(p.id));
    for (const cat of new Set(p.items.flatMap((i) => i.categories || []))) add([cat, `مود ${cat}`, `العاب ${cat}`], `${p.name}: ${cat}`, () => goPage(p.id, cat));
    for (const i of p.items) add([...String(i.voice || '').split(/[,،]/), i.name], i.name, () => launchItem(i));
  }
  return c;
}

window.handleVoice = function handleVoice(text) {
  const raw = normAr(text);
  const spoken = raw.replace(AR_FILLER, '').trim() || raw;
  if (!spoken) return { ok: false, msg: 'ما سمعت شي، جرّب مرة ثانية' };
  let best = null;
  for (const c of voiceCandidates()) {
    const s = Math.max(phraseScore(spoken, c.ph), 0.97 * phraseScore(raw, c.ph));
    if (!best || s > best.s) best = { ...c, s };
  }
  if (!best || best.s < 0.66) return { ok: false, msg: `سمعت "${text.trim()}" وما عرفت وش أفتح` };
  best.run();
  return { ok: true, msg: `${best.label}` };
};

// ---------- Keyboard ----------
$('#addBtn').onclick = () => (currentPageId ? openEditor(null) : openPageEditor(null));
$('#backBtn').onclick = () => { if (!$('#detail')?.hidden) return window.closeDetail?.(); goHome(); };

// Keyboard and controller navigation live in nav.js

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Show unexpected errors on screen so they can be reported.
window.addEventListener('error', (e) => { toast(`خطأ: ${e.message}`); pv.log(`error: ${e.message} @${e.filename}:${e.lineno}`); });
window.addEventListener('unhandledrejection', (e) => { toast(`خطأ: ${e.reason?.message || e.reason}`); pv.log(`rejection: ${e.reason?.stack || e.reason}`); });

// ---------- Start ----------
(async () => {
  if (inElectron) {
    // An app process started before an update can't serve the new features: close it so the next launch is fresh.
    let v = 0; try { v = await window.api.version(); } catch {}
    if (v < 15) { pv.log('app process is outdated, closing so it restarts fresh'); window.close(); return; }
  }
  data = migrate(await pv.load());
  if (!THEMES.some((t) => t.id === data.theme)) data.theme = 'glass';
  try { paths = await pv.paths(); } catch {}
  const mods = page('mods');
  if (mods && paths.mods && !mods.items.some((i) => i.target === paths.mods) && !data.removed?.['t:' + paths.mods.toLowerCase()]) {
    mods.items.unshift({ id: uid(), name: 'مجلد المودات', target: paths.mods, image: '', categories: [], voice: 'مجلد المودات', icon: await pv.fileIcon(paths.mods) });
  }
  pv.onPlaytime((itemId, secs) => {
    const f = findItem(itemId);
    if (!f) return;
    f.item.playtime = (f.item.playtime || 0) + secs;
    save();
    if (currentPageId === f.page.id) renderPage();
    if (secs >= 60) toast(`لعبت ${f.item.name} ${fmtTime(Math.round(secs / 60))}`);
  });
  save();
  render();
  pv.log(`ui ready: ${data.pages.length} pages, ${allItems().length} items, theme ${data.theme}`);
  try {
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').length;
    pv.log(`env: webgpu ${!!navigator.gpu}, mics ${mics}`);
  } catch {}
  pv.onDebugGoto((cmd) => {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    closeDrawer();
    for (const part of cmd.split(/\s+/)) {
      const [k, v] = part.split(':');
      if (k === 'home') goHome();
      else if (k === 'page') goPage(v);
      else if (k === 'filter') { currentFilter = v; renderPage(); }
      else if (k === 'theme') setTheme(v);
      else if (k === 'hover') document.querySelectorAll('.tile[data-item]')[Number(v) || 0]?.dispatchEvent(new Event('mouseenter'));
      else if (k === 'drawer') openDrawer();
      else if (k === 'emuget') installEmulators();
      else if (k === 'importall') importAllGames();
      else if (k === 'pedit') openPageEditor(v || 'games');
      else if (k === 'romsync') syncRomGames();
      else if (k === 'card') { const g = allItems().find((i) => i.ratings && Object.keys(i.ratings).length) || { ...(page('games')?.items[0] || {}), ratings: { 'الجرافيكس': 9, 'الجيم بلاي': 8, 'القصة': 7, 'الساوند تراك': 9 }, ratingNote: 'لعبة ممتعة مع الشباب' }; window.RateCard?.draw(g).then((u) => { const d = document.createElement('dialog'); d.innerHTML = `<img src="${u}" style="max-height:80vh;display:block">`; document.body.appendChild(d); d.showModal(); }); }
      else if (k === 'sppop') window.spPopOpen?.();
      else if (k === 'themes') openThemePicker();
      else if (k === 'emu') openEmuDialog();
      else if (k === 'detail') { const t = document.querySelectorAll('.tile[data-item]')[Number(v) || 0]; if (t) openDetail(findItem(t.dataset.item).item); }
      else if (k === 'artdiag') (async () => {
        for (const it of (page('emu')?.items || []).slice(0, 4)) {
          let u = it.image; const res = [];
          while (u) { res.push(`${decodeURIComponent(u.split('/').pop())}=${await pv.checkImage(u)}`); u = nextSteamArt(u); }
          pv.log(`artdiag ${it.name}: ${res.join(' | ')}`);
        }
      })();
      else if (k === 'battery') pv.btBattery().then((r) => pv.log('battery dbg ' + JSON.stringify(r)));
      else if (k === 'pad') window.openPadCenter?.();
      else if (k === 'click') setTimeout(() => document.querySelector(part.slice(6))?.click(), 1200);
      else if (k === 'key') document.dispatchEvent(new KeyboardEvent('keydown', { key: v, bubbles: true }));
      else if (k === 'emuinstall') pv.emuInstall(v.split(',')).then((r) => pv.log('emuinstall ' + JSON.stringify(r)));
      else if (k === 'dumpimgs') document.querySelectorAll('.tile[data-item]').forEach((t) => {
        const it = findItem(t.dataset.item)?.item; const img = t.querySelector('img');
        if (!t.querySelector('img.cov') || !img || img.naturalWidth < 50) pv.log(`img: ${it?.name} | ${it?.image} | ${img ? img.naturalWidth + 'x' + img.naturalHeight + ' ' + img.src : 'no img'} | done=${img?.complete}`);
      });
    }
  });
  if (!data.toolsMoved) {
    const g = page('games'), apps = page('apps');
    if (g && apps) { const tools = g.items.filter((i) => APP_LIKE.test(i.name)); g.items = g.items.filter((i) => !tools.includes(i)); apps.items.push(...tools); }
    data.toolsMoved = true; save(); render();
  }
  if (inElectron && !data.iconsV2) { // earlier icons came out generic; fetch the real ones once
    data.iconsV2 = true;
    for (const i of allItems()) if (i.icon && isDrivePath(i.target)) { const ic = await pv.fileIcon(i.target); if (ic) i.icon = ic; }
    save(); render();
  }
  if (!data.artV4) { allItems().forEach((i) => delete i.artTried); data.artV4 = true; save(); }
  if (inElectron) {
    fixSteamArt();
    const again = !data.consoleArtV4; // box art moved to a new address: look everything up again once
    if (again) (emuPage()?.items || []).forEach((i) => { if (/thumbnails\.libretro\.com/.test(i.image || '')) i.image = ''; });
    setTimeout(async () => { await fixConsoleArt(again); if (again) { data.consoleArtV4 = true; save(); } }, 6000);
  }
  window.Music?.init();
  window.Pad?.init();
  setTimeout(() => window.Shots?.scan(true), 3000);
  pv.ds4Path().then(async (exe) => {
    const apps = page('apps');
    if (!exe || !apps || apps.items.some((i) => /DS4Windows\.exe$/i.test(i.target)) || data.removed?.['t:' + exe.toLowerCase()]) return;
    apps.items.push({ id: uid(), name: 'DS4Windows', target: exe, image: '', categories: ['يد التحكم'], voice: 'دي اس فور', icon: await pv.fileIcon(exe) });
    save(); render(); pv.log('ds4windows added to apps');
  });
  window.addEventListener('focus', () => { if ($('#webWrap').hidden) window.Music?.resumeIfPaused(); });
  if (inElectron && data.firstRunDone) setTimeout(() => { const g = page('games'); if (g) runImport('steam', g, true); }, 12000); // new installs & play time
  // First automatic search picked up shader caches as games: clean those out, then search again.
  if (!data.emuCleanV2 && emuPage()) {
    const ep = emuPage(), bad = /reshade|shader|cache|[\\/]temp|firmware|[\\/]dlc/i;
    const badIds = new Set((ep.platforms || []).filter((x) => bad.test(x.romDir)).map((x) => x.id));
    ep.platforms = (ep.platforms || []).filter((x) => !badIds.has(x.id));
    ep.items = ep.items.filter((i) => !badIds.has(i.platformId));
    data.emuCleanV2 = true; data.emuAutoDone = false; save();
    pv.log(`emu cleanup: removed ${badIds.size} wrong folders`);
  }
  // The user doesn't want retro / emulator games added automatically: clear what the auto search added, and never search on its own.
  if (!data.retroRemoved && emuPage()) {
    const ep = emuPage(); const n = ep.items.length;
    ep.items = []; ep.platforms = [];
    data.retroRemoved = true; data.emuAutoDone = true; save();
    pv.log(`retro games removed: ${n}`);
  }
  if (inElectron) { setTimeout(syncRomGames, 2500); setTimeout(syncRomGames, 12000); } // again after the startup tidy-up
  if (inElectron && data.emusV1 && !data.emuPrepV1) setTimeout(async () => { const c = await pv.emuPrepare(); pv.log('emulators prepared, cores: ' + c.join(',')); data.emuPrepV1 = true; save(); }, 9000);
  // The emulators themselves (programs, no games): download the well-known ones once, each with a line saying what it's for
  if (!data.emusV1 && emuPage()) setTimeout(() => installEmulators(), 4000);
  // emulators you installed yourself (Lichii, your own Ryujinx...) get a tile too, once the PC has been looked through
  if (inElectron) setTimeout(async () => { const n = await addEmulatorTiles((await pv.emuCatalog()).filter((x) => x.exe)); if (n) { pv.log(`emulators found on PC: +${n}`); if (currentPageId === emuPage()?.id) renderPage(); } }, 30000);
  if (!data.streamingAdded && page('watch')) {
    const fav = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`;
    const list = [
      ['Netflix', 'https://www.netflix.com', 'netflix.com', 'نتفلكس'], ['شاهد', 'https://shahid.mbc.net', 'shahid.mbc.net', 'شاهد'],
      ['OSN+', 'https://www.osnplus.com', 'osnplus.com', 'او اس ان'], ['Prime Video', 'https://www.primevideo.com', 'primevideo.com', 'برايم'],
      ['Disney+', 'https://www.disneyplus.com', 'disneyplus.com', 'ديزني'], ['Apple TV+', 'https://tv.apple.com', 'tv.apple.com', 'ابل تي في'],
      ['Crunchyroll', 'https://www.crunchyroll.com', 'crunchyroll.com', 'كرنشي رول'], ['TOD', 'https://www.tod.tv', 'tod.tv', 'تود'],
      ['STC tv', 'https://www.stctv.com', 'stctv.com', 'اس تي سي'],
    ];
    const w = page('watch');
    for (const [name, url, dom, voice] of list) if (!w.items.some((i) => i.target.includes(dom))) w.items.push({ id: uid(), name, target: url, image: '', icon: fav(dom), categories: ['بث'], voice, external: true });
    data.streamingAdded = true; save();
  }
  if (!data.calendarAdded) {
    if (!data.pages.some((p) => p.type === 'calendar') && !(data.removedPages || []).includes('calendar')) {
      const at = Math.max(0, data.pages.findIndex((p) => p.id === 'music') + 1) || data.pages.length;
      data.pages.splice(at, 0, { id: 'calendar', type: 'calendar', name: 'التقويم', icon: '📅', items: [], voice: 'التقويم' });
    }
    data.calendarAdded = true; save();
  }
  if (!data.dupStoresV1) {
    const g = page('games');
    if (g) {
      const key = (x) => String(x).toLowerCase().replace(/[™®©*]/g, '').replace(/^ea sports\s*/, '').replace(/[^a-z0-9]/g, '');
      g.items = g.items.filter((i) => !(i.source === 'ea' && g.items.some((o) => o !== i && o.source !== 'ea' && key(o.name).endsWith(key(i.name)))));
    }
    data.dupStoresV1 = true; save();
  }
  if (!data.artV9) { const g = page('games'); if (g) g.items = g.items.filter((i) => !(i.owned && /\b(playtest|demo|beta)\b/i.test(i.name))); allItems().forEach((i) => { delete i.artTried; delete i.artTried2; }); data.artV9 = true; save(); }
  if (!data.artV10) { allItems().forEach((i) => { delete i.artTried; delete i.artTried2; if (/linecad\.com|Shrimp_Jesus/i.test(i.image || '') || (/^(steam|com\.epicgames)/.test(i.target || '') && /^https?:/.test(i.image || '') && !/steamstatic|steampowered|akamaihd|wikimedia|epicgames|unrealengine/.test(i.image))) i.image = ''; }); data.artV10 = true; save(); }
  // every start: games still without a picture get one more search (one at a time, in the background)
  if (inElectron) setTimeout(async () => {
    for (const i of (page('games')?.items || []).filter((x) => !x.image && !x.rom && !x.artTried2 && !x.noArt && !x.store)) {
      i.artTried2 = true;
      const m = /^steam:\/\/(?:rungameid|install)\/(\d+)/.exec(i.target || '');
      let a = m ? await pv.steamApp(m[1]).catch(() => null) : null;
      if (!a?.image) a = await pv.findCover(i.name).catch(() => null);
      pv.log(`art pass: ${i.name} -> ${a?.image || 'none'}`);
      if (a?.image) { i.image = a.image; if (a.hero) i.hero = a.hero; if (currentPageId === 'games') renderPage(); }
      save();
    }
  }, 30000);
  if (!data.artV12) { (page('games')?.items || []).forEach((i) => { if (!i.rom && /^https?:/.test(i.image || '') && !/steamstatic|steampowered|akamaihd|wikimedia|wikipedia|epicgames|unrealengine|libretro|githubusercontent/.test(i.image)) { i.image = ''; delete i.artTried2; } }); data.artV12 = true; save(); }
  if (!data.appsV3) { const ap = page('apps'); if (ap) { ap.items = ap.items.filter((i) => !/reset|skinned|updater|safe mode|for business/i.test(i.name)); ap.items.forEach((i) => { if (i.image && !i.noArt) i.image = ''; if (/\.lnk$/i.test(i.target || '')) delete i.icon; }); } data.appsV3 = true; save(); setTimeout(async () => { for (const i of page('apps')?.items || []) if (!i.icon && !/^shell:/i.test(i.target)) { try { i.icon = await pv.fileIcon(i.target); } catch {} } save(); if (currentPageId === 'apps') renderPage(); }, 5000); }
  if (!data.appsArtV1) { (page('apps')?.items || []).forEach((i) => { if (/wikimedia|wikipedia/.test(i.image || '')) i.image = ''; }); allItems().forEach((i) => { if (i.store) i.image = ''; }); data.appsArtV1 = true; save(); }
  if (!data.storesArtV1) { allItems().forEach((i) => { if (i.store) { i.image = ''; i.artTried2 = true; } }); data.storesArtV1 = true; save(); } // stores show their own icon, not a picture from the web
  // programs (Discord, Overwolf, OBS, ...) from the Start menu on their own page, once
  if (inElectron && !data.appsV2) setTimeout(async () => {
    data.appsV2 = true;
    let apps = page('apps');
    if (!apps) { apps = { id: 'apps', type: 'apps', name: 'تطبيقات', icon: '🧰', items: [] }; const gi = data.pages.findIndex((p) => p.id === 'games'); data.pages.splice(gi + 1, 0, apps); data.removedPages = (data.removedPages || []).filter((x) => x !== 'apps'); }
    const n = await runImport('apps', apps, true);
    apps.items = apps.items.filter((i) => !/^(steam|epic games( launcher)?|ubisoft connect|rockstar games launcher|battle\.net|ea|ea app|gog galaxy|xbox|microsoft store)$/i.test(i.name));
    save(); pv.log(`apps page: +${n}`); if (!currentPageId) render();
  }, 26000);
  if (inElectron && !data.storesV2) setTimeout(() => { data.storesV2 = true; save(); addStores(false); }, 20000);
  if (!data.namesV2) { allItems().forEach((i) => { if (i.rom) i.name = i.name.replace(/^(.+?), (The|A|An)\b/, '$2 $1'); }); data.namesV2 = true; save(); }
  if (!data.seenInit) { data.seen = {}; allItems().forEach((i) => { data.seen[i.id] = 1; }); data.seenInit = true; save(); }
  if (!data.artV18) { allItems().forEach((i) => { if (!i.image) delete i.artTried2; }); data.artV18 = true; save(); }
  if (!data.artV17) { allItems().forEach((i) => { if (!i.image) delete i.artTried2; }); data.artV17 = true; save(); }
  if (!data.artV16) { allItems().forEach((i) => { if (!i.image) delete i.artTried2; }); data.artV16 = true; save(); }
  if (!data.artV15) { allItems().forEach((i) => { if (!i.image) delete i.artTried2; }); data.artV15 = true; save(); }
  if (!data.artV14) { allItems().forEach((i) => { if (/Holocaust_Museum|Minecraft_Legends|Delaware_Street/.test(i.image || '')) { i.image = ''; delete i.artTried; delete i.artTried2; } }); data.artV14 = true; save(); }
  if (!data.artV13) { allItems().forEach((i) => { if (!i.image) { delete i.artTried; delete i.artTried2; } }); data.artV13 = true; save(); }
  if (!data.artV11) { allItems().forEach((i) => { delete i.artTried2; }); data.artV11 = true; save(); }
  if (inElectron && !data.ownedV1) setTimeout(() => { data.ownedV1 = true; save(); importOwned(false); }, 25000);
  if (inElectron && !data.coversV8) setTimeout(async () => {
    // games with no picture, or whose picture no longer loads: search Steam, Wikipedia, then the web
    for (const i of (page('games')?.items || []).filter((x) => !x.rom)) {
      delete i.artTried;
      if (i.image && await pv.checkImage(toImageUrl(i.image)).catch(() => true)) continue;
      if (i.image && /^[a-z]:\\|^file:/i.test(i.image)) continue;
      await autoCoverFor(i, false);
    }
    data.coversV8 = true; save();
  }, 12000);
  if (!data.thmanyahAdded && page('watch')) {
    const w = page('watch');
    if (!w.items.some((i) => /thmanyah/.test(i.target))) w.items.push({ id: uid(), name: 'ثمانية', target: 'https://thmanyah.com', image: '', icon: 'https://www.google.com/s2/favicons?domain=thmanyah.com&sz=128', categories: ['بودكاست'], voice: 'ثمانيه' });
    data.thmanyahAdded = true; save();
  }
  if (!data.stcIcon) { allItems().forEach((i) => { if (/stctv\.com/.test(i.target)) i.icon = 'https://www.google.com/s2/favicons?domain=stc.com.sa&sz=128'; }); data.stcIcon = true; save(); }
  if (!data.webIconsV2) { allItems().forEach((i) => { if (/youtube\.com\/s\/desktop/.test(i.icon || '')) delete i.icon; }); data.webIconsV2 = true; save(); }
  if (inElectron) allItems().filter((i) => isWeb(i.target) && !i.image && !i.icon).forEach((i) => webArt(i));
  firstRunSetup();
  if (inElectron) setTimeout(async () => { await window.Voice?.preload(); window.Voice?.wakeSync(); }, 4000);
  setInterval(() => { if (!currentPageId) $('#title').textContent = greeting(); }, 60000);
})();

// While dragging something, holding it near the top or bottom edge scrolls the page (so a game can go all the way up the tier list)
(() => {
  let vy = 0, el = null, raf = 0;
  const scroller = (n) => { for (; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n; } return document.scrollingElement; };
  const step = () => { if (!vy || !el) { raf = 0; return; } el.scrollTop += vy; raf = requestAnimationFrame(step); };
  document.addEventListener('dragover', (e) => {
    const h = window.innerHeight, edge = Math.min(140, h * 0.18);
    vy = e.clientY < edge ? -Math.ceil((edge - e.clientY) / 6) : e.clientY > h - edge ? Math.ceil((e.clientY - (h - edge)) / 6) : 0;
    if (vy) { el = scroller(e.target); if (!raf) raf = requestAnimationFrame(step); }
  }, true);
  const stop = () => { vy = 0; };
  document.addEventListener('dragend', stop, true); document.addEventListener('drop', stop, true);
})();
