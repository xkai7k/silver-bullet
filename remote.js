// "التحكم من الجوال": a small page on your home Wi-Fi. Open it on the phone (QR in Settings) and you can
// start a game, pick up a series on the PC or right on the phone/iPad, start a download
// from your torrent library — while the PC does the work.
// Only reachable on your network, and only with the secret key in the link.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

module.exports = function setupRemote({ ipcMain, app, net, log, wakeHelper, getWin, mediaAsk, mediaKey, setVolume, torAdd, lanAddress, qrSvgOf, pcAction, pcInfo, steamInstall, steamDl, steamClear, steamAct, shareFile, sharedList, sharedDel, phoneVersion, phoneSmall, phoneClip, clipMeta, videoFrame, steamUpdates, steamUpdateNow, pcInput, screenFrame, playInfo, setPlayLimit }) {
  const PORT = 8766;
  const cfgFile = path.join(app.getPath('userData'), 'remote.json');
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8').replace(/^\uFEFF/, '')); } catch {}
  const saveCfg = () => { try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {} };
  if (!cfg.key) { cfg.key = crypto.randomBytes(9).toString('hex'); saveCfg(); }
  let server = null, state = { games: [], lib: [], watch: [], shows: [], name: '', torrents: [], lang: 'ar' };
  let imgs = new Map(), eps = new Map(), sharedIds = new Map(), xfer = new Map(); // id -> picture source / episode file (only these can be read from the phone)
  const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp' };
  const VID = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t' };
  const hid = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
  const host = () => `${os.hostname()}.local`.toLowerCase();

  const send = (cmd) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('remote:cmd', cmd); };
  const json = (res, o, code = 200, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(o)); };
  const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

  // a picture the app shows can be a file on the PC, a file:// link, a web link or inline data: the phone gets all of them from here
  async function sendImg(res, src) {
    try {
      if (!src) { res.writeHead(404); return res.end(); }
      if (/^data:image\//i.test(src)) { const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src); if (!m) throw 0; res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'max-age=86400' }); return res.end(m[2] ? Buffer.from(m[3], 'base64') : decodeURIComponent(m[3])); }
      if (/^https?:\/\//i.test(src)) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
        const r = await (net?.fetch || fetch)(src, { signal: ctl.signal }); clearTimeout(t);
        if (!r.ok) throw new Error('http ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=86400' }); return res.end(buf);
      }
      let p = src;
      if (/^file:/i.test(p)) p = decodeURIComponent(p.replace(/^file:\/*/i, '')).replace(/\//g, '\\');
      else if (!path.isAbsolute(p)) p = path.join(__dirname, p.replace(/^\.?[\\/]/, ''));
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': IMG[path.extname(p).toLowerCase()] || 'image/jpeg', 'Cache-Control': 'max-age=86400' });
      fs.createReadStream(p).pipe(res);
    } catch { try { res.writeHead(404); res.end(); } catch {} }
  }
  // an episode, streamed with seeking (Range) so the phone/iPad player can jump around; ?dl=1 downloads it
  // fingerprint of a file, so the phone can tell whether what arrived is exactly what was sent
  const shaCache = new Map();
  function fileSha(file, st) {
    const k = file + st.mtimeMs; if (shaCache.has(k)) return shaCache.get(k);
    const p = new Promise((r) => { const h = require('crypto').createHash('sha256'); fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => r(h.digest('hex'))).on('error', () => r('')); });
    shaCache.set(k, p); if (shaCache.size > 50) shaCache.delete(shaCache.keys().next().value); return p;
  }
  function sendVideo(req, res, file, dl, shownAs) {
    let st; try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end(); }
    const type = VID[path.extname(file).toLowerCase()] || IMG[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (dl) head['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(shownAs || file).replace(/\.[^.]+$/, '') + path.extname(file))}`;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      let a = m[1] ? Number(m[1]) : st.size - Number(m[2]), b = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      a = Math.max(0, a); b = Math.min(st.size - 1, b);
      if (a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  }

  // 🔒 the PIN: seeing the screen, mouse & keyboard and shutting down need it (set on the PC, kept as a hash)
  const SENSITIVE = new Set(['pc', 'input', 'screen', 'pinCheck', 'clipGet', 'clipSet']);
  // ١٢٣٤ (Arabic keyboard) and 1234 are the same PIN
  const pinNorm = (pin) => String(pin || '').replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, (d) => d.charCodeAt(0) - 0x6F0).replace(/\s+/g, '');
  const pinHash = (pin) => crypto.createHash('sha256').update((cfg.pinSalt || '') + ':' + pinNorm(pin)).digest('hex');
  let pinFails = 0, pinLockUntil = 0;
  function pinOk(pin) {
    if (!cfg.pinHash) return { ok: false, needPin: 'unset', msg: '🔒 حط رمز للتحكم من الكمبيوتر أول (الإعدادات ← الجوال)' };
    if (Date.now() < pinLockUntil) return { ok: false, needPin: 'locked', msg: `🔒 غلطت كثير، جرّب بعد ${Math.ceil((pinLockUntil - Date.now()) / 60000)} دقيقة` };
    if (!pinNorm(pin)) return { ok: false, needPin: 'ask', msg: '🔒 اكتب رمز التحكم' }; // not a wrong try: the phone just hasn't got it yet
    if (pinHash(pin) !== cfg.pinHash) {
      if (++pinFails >= 5) { pinFails = 0; pinLockUntil = Date.now() + 3 * 60e3; log('phone PIN: locked after wrong tries'); notifyPhone('🔒 محاولات غلط', 'أحد كتب رمز التحكم غلط ٥ مرات، وقفته ٣ دقايق'); }
      else log('phone PIN: wrong (' + pinFails + '/5)');
      return { ok: false, needPin: 'wrong', msg: `🔒 الرمز غلط (باقي ${5 - pinFails} محاولات)` };
    }
    pinFails = 0; return null;
  }
  ipcMain.handle('remote:pin', (_e, pin) => {
    pin = String(pin || '').trim();
    if (!pin) { delete cfg.pinHash; saveCfg(); log('phone PIN removed'); return info(); }
    pin = pinNorm(pin);
    if (!/^\d{4,8}$/.test(pin)) return { ...info(), error: 'الرمز لازم ٤ إلى ٨ أرقام' };
    cfg.pinSalt = crypto.randomBytes(8).toString('hex'); cfg.pinHash = pinHash(pin); pinFails = 0; pinLockUntil = 0; saveCfg(); log('phone PIN set'); return info();
  });

  // 🌙 night downloads: with it on, what you start from the phone waits until the night hours (until 8 in the morning)
  const inNight = () => { const h = new Date().getHours(), f = cfg.night?.from ?? 0; return f < 8 ? h >= f && h < 8 : h >= f || h < 8; };
  const nightWait = () => !!cfg.night?.on && !inNight();
  function nightAdd(x) {
    cfg.nightQ = (cfg.nightQ || []).filter((y) => !(y.k === x.k && y.id === x.id)); cfg.nightQ.push({ ...x, at: Date.now() }); saveCfg();
    const f = cfg.night?.from ?? 0, at = f === 0 ? '12 بالليل' : f < 12 ? `${f} الفجر` : `${f - 12} بالليل`;
    log('night queue +', x.name);
    return { ok: true, msg: `🌙 ${x.name}: بيبدأ تحميلها الساعة ${at}`, night: true };
  }
  setInterval(async () => {
    if (!cfg.nightQ?.length || !inNight()) return;
    const q = cfg.nightQ; cfg.nightQ = []; saveCfg();
    for (const x of q) { try { if (x.k === 'steam') { const r = await steamInstall?.(x.id, x.name); if (!r?.ok) { cfg.nightQ.push(x); saveCfg(); continue; } } else send({ type: 'torDl', id: x.id }); } catch (e) { log('night start failed', x.name, e.message); } }
    log('night downloads started:', q.map((x) => x.name).join(', '));
    notifyPhone('🌙 بدأ تحميل الليل', q.map((x) => x.name).join('، '));
  }, 60000);

  // what the phone can ask: the state, or a command. Used by the page on your Wi-Fi and by the internet link (through the app)
  // 📱 which devices use the link: each phone page has its own id; a new one is told to you at once
  function seen(dev, via, ip) {
    if (!dev || !/^[a-z0-9]{6,24}$/.test(String(dev.id || ''))) return;
    cfg.devices ||= {};
    const d = cfg.devices[dev.id], now = Date.now(), name = String(dev.name || 'جهاز').slice(0, 40);
    if (!d) {
      cfg.devices[dev.id] = { name, first: now, last: now, via, ip: ip || '' }; saveCfg();
      log('phone remote: new device', name, via, ip || '');
      notifyPhone('📱 جهاز جديد دخل', `${name} (${via === 'net' ? 'من برا البيت' : 'من واي فاي البيت'}) الساعة ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. لو مو أنت: الإعدادات ← الجوال ← اطرد كل الأجهزة`);
      return;
    }
    if (now - d.last > 60000 || d.via !== via) { d.last = now; d.via = via; d.name = name; if (ip) d.ip = ip; saveCfg(); } else d.last = now;
  }
  const devList = () => Object.entries(cfg.devices || {}).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.last - a.last).slice(0, 30);

  async function api(kind, c = {}, via = 'net', ip = '') {
    seen(c?.dev, via, ip);
    if (kind === 'state') {
      const shared = (sharedList?.() || []).map((x) => { const id = hid(x.file); sharedIds.set(id, { file: x.file, shared: true }); return { id, name: x.name, size: x.size, video: x.video, up: x.up }; });
      return { ...state, shared, host: host(), port: PORT, pc: pcInfo?.() || {}, steam: steamDl?.() || [], updates: steamUpdates?.() || [], play: playInfo?.() || {}, devices: devList().map((d) => ({ name: d.name, last: d.last, via: d.via, me: d.id === c?.dev?.id })), night: { ...(cfg.night || { on: false, from: 0 }), q: (cfg.nightQ || []).map((x) => x.name) }, page: pageSha }; // music isn't on the phone page any more: no Spotify lookup on every refresh
    }
    c = c || {};
    if (SENSITIVE.has(c.type)) { const bad = pinOk(c.pin); if (bad) return bad; if (c.type === 'pinCheck') return { ok: true }; }
    if (c.type === 'webProg' && c.id && /^https?:\/\//i.test(c.url || '')) { send({ type: 'webProg', id: String(c.id), url: String(c.url).slice(0, 2000), t: Number.isFinite(c.t) && c.t >= 0 ? Math.floor(c.t) : null }); return ({ ok: true }); }
    if (c.type === 'pc' && /^(lock|sleep|shutdown|cancel|kill|closeall|monoff|monon)$/.test(c.act || '')) { const r = (await pcAction?.(c.act)) || { ok: false }; if (r.ok) send({ type: 'toast', msg: '📱 ' + (r.msg || c.act) }); return r; }
    if (c.type === 'install' && c.id) {
      const g = (state.lib || []).find((x) => x.id === String(c.id) && x.owned);
      if (!g) return { ok: false };
      if (!g.sid) return { ok: false, msg: '🚫 لا تستطيع تحميلها عن بعد' };
      if (nightWait()) return nightAdd({ k: 'steam', id: g.sid, name: g.name });
      const r = (await steamInstall?.(g.sid, g.name)) || { ok: false };
      if (r.ok) send({ type: 'toast', msg: '📱 ' + r.msg });
      return r;
    }
    if (c.type === 'clipGet') { const { clipboard } = require('electron'); return { ok: true, text: clipboard.readText().slice(0, 20000) }; }
    if (c.type === 'clipSet') { const { clipboard } = require('electron'); clipboard.writeText(String(c.text || '').slice(0, 20000)); send({ type: 'toast', msg: '📋 وصل من الجوال، الصقه (Ctrl+V)' }); log('phone: clipboard set', String(c.text || '').length, 'chars'); return { ok: true }; }
    if (c.type === 'input') return (await pcInput?.(c)) || { ok: false };
    if (c.type === 'screen') return (await screenFrame?.(c.w)) || { ok: false };
    if (c.type === 'steamUpdate') { const r = (await steamUpdateNow?.(c.ids)) || { ok: false }; if (r.ok) send({ type: 'toast', msg: '📱 ' + r.msg }); return r; }
    if (c.type === 'playLimit') return { ok: true, play: setPlayLimit?.(c.min) };
    if (c.type === 'nightSet') { cfg.night = { on: !!c.on, from: Math.max(0, Math.min(23, Math.round(Number(c.from) || 0))) }; saveCfg(); return { ok: true }; }
    if (c.type === 'nightDel') { cfg.nightQ = (cfg.nightQ || []).filter((_x, i) => i !== Number(c.i)); saveCfg(); return { ok: true }; }
    if (c.type === 'steamAct' && /^(pause|resume|cancel)$/.test(c.act || '')) { const r = (await steamAct?.(c.id, c.act)) || { ok: false }; if (r.ok) send({ type: 'toast', msg: '📱 ' + r.msg }); return r; }
    if (c.type === 'torAct' && c.id && /^(pause|resume|remove)$/.test(c.act || '')) { send({ type: 'torAct', id: String(c.id), act: c.act }); return { ok: true }; }
    if (c.type === 'fileInfo' && c.id) {
      const f = eps.get(String(c.id)) || sharedIds.get(String(c.id)); if (!f) return { ok: false };
      const isVid = /\.(mp4|mkv|mov|webm|avi)$/i.test(f.file);
      const file = (f.shot && isVid && phoneClip ? await phoneClip(f.file, !!c.small) : c.small && isVid ? await phoneSmall?.(f.file) : await phoneVersion?.(f.file)) || f.file; let st; try { st = fs.statSync(file); } catch { return { ok: false }; }
      if (st.size > 1024 ** 3) return { ok: false, msg: 'المقطع كبير (أكثر من ١ جيجا) يتحمّل من برا. حمّله وأنت على واي فاي البيت، أو حطه في OneDrive ☁️' };
      xfer.set(String(c.id) + (c.small ? ':s' : ''), file); log('phone: sending', path.basename(f.file), Math.round(st.size / 1048576) + 'MB');
      const ext = path.extname(file).toLowerCase();
      return { ok: true, size: st.size, sha: await fileSha(file, st), name: path.basename(f.file).replace(/\.[^.]+$/, '') + ext, mime: VID[ext] || IMG[ext] || 'application/octet-stream' };
    }
    if (c.type === 'dlCheck') { log('phone: download check', String(c.name || '').slice(0, 80), c.ok ? 'matches ✓' : 'DIFFERENT ✗', String(c.via || ''), String(c.ua || '').slice(0, 60)); return { ok: true }; }
    if (c.type === 'fileChunk' && c.id) {
      const file = xfer.get(String(c.id) + (c.small ? ':s' : '')); if (!file) return { ok: false };
      const off = Math.max(0, Number(c.off) || 0), len = Math.min(512 * 1024, Math.max(1, Number(c.len) || 0));
      const fd = await fs.promises.open(file, 'r'); try { const b = Buffer.alloc(len); const { bytesRead } = await fd.read(b, 0, len, off); return { ok: true, d: b.subarray(0, bytesRead).toString('base64') }; } finally { await fd.close(); }
    }
    if (c.type === 'toCloud' && c.ep) { const f = eps.get(String(c.ep)); if (!f) return { ok: false }; return (await shareFile?.(f.file)) || { ok: false }; }
    if (c.type === 'sharedDel' && c.id) { const f = sharedIds.get(String(c.id)); if (!f?.shared) return { ok: false }; return (await sharedDel?.(f.file)) || { ok: false }; }
    if (c.type === 'hideShow' && c.dir && (state.shows || []).some((x) => x.dir === c.dir)) { send({ type: 'hideShow', dir: String(c.dir) }); return { ok: true }; }
    if (c.type === 'dlClear') { try { steamClear?.(); } catch {} send({ type: 'dlClear' }); return { ok: true }; }
    if (c.type === 'fav' && c.id) { send({ type: 'fav', id: String(c.id), on: !!c.on }); return ({ ok: true }); }
    if (c.type === 'launch' && c.id) {
      // sites open inside the app: bring the window up so it shows, even if it was minimized or behind other windows
      const w = getWin(); if (w && !w.isDestroyed()) { try { if (w.isMinimized()) w.restore(); if (!w.isVisible()) w.show(); w.focus(); } catch {} }
      send({ type: 'launch', id: String(c.id) }); return ({ ok: true });
    }
    if (c.type === 'media' && /^(playpause|next|prev)$/.test(c.key)) { await mediaKey(c.key); return ({ ok: true }); }
    if (c.type === 'volume') { const v = Math.max(0, Math.min(100, Math.round(Number(c.level) || 0))); cfg.vol = v; saveCfg(); const r = await setVolume(v, 'spotify'); if (r === 'none') await setVolume(v, 'master'); return ({ ok: true, vol: v }); }
    if (c.type === 'magnet' && /^magnet:\?/i.test(c.link || '')) { const r = await torAdd(c.link); send({ type: 'toast', msg: '📱 بدأ تحميل من الجوال' }); return (r || { ok: false }); }
    if (c.type === 'torDl' && c.id) { if (nightWait()) { const g = (state.lib || []).find((x) => x.id === String(c.id)); return nightAdd({ k: 'tor', id: String(c.id), name: g?.name || 'تورنت' }); } send({ type: 'torDl', id: String(c.id) }); return ({ ok: true }); }
    if (c.type === 'showPlay' && c.ep) { const f = eps.get(String(c.ep)); if (!f) return ({ ok: false }); send({ type: 'showPlay', dir: f.dir, file: f.file }); return ({ ok: true }); }
    if (c.type === 'epProg' && c.ep) { const f = eps.get(String(c.ep)); if (!f) return ({ ok: false }); send({ type: 'epProg', dir: f.dir, file: f.file, t: Number(c.t) || 0, d: Number(c.d) || 0 }); return ({ ok: true }); }
    return ({ ok: false, error: 'unknown', code: 400 });
  }

  function start() {
    if (server) return true;
    server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://x');
        // "is the PC there?" (also asked across addresses, so the phone can move to the fixed name)
        if (u.pathname === '/api/ping') return json(res, { ok: u.searchParams.get('k') === cfg.key, host: host() }, 200, { 'Access-Control-Allow-Origin': '*' });
        if (u.pathname === '/manifest.json') { res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return res.end(JSON.stringify({ name: 'Silver Bullet', short_name: 'Silver Bullet', start_url: '/?k=' + cfg.key, display: 'standalone', background_color: '#0d0f14', theme_color: '#0d0f14' })); }
        if (u.searchParams.get('k') !== cfg.key) { res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#0d0f14;color:#eee;padding:24px;text-align:center" dir="rtl"><h2>🔒 الرابط قديم</h2><p>صوّر الباركود من جديد: الإعدادات ← الجوال</p><p dir="ltr">Old link: scan the QR again (Settings → Phone)</p></body>'); }
        if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(page()); }
        const ipOf = () => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        if (u.pathname === '/api/state') return json(res, await api('state', { dev: { id: u.searchParams.get('d'), name: u.searchParams.get('n') } }, 'wifi', ipOf()));
        const im = /^\/img\/([\w-]+)$/.exec(u.pathname);
        if (im) { let src = imgs.get(im[1]); if (/^vthumb:/.test(src || '')) src = await videoFrame?.(src.slice(7)); return sendImg(res, src); }
        const ev = /^\/ep\/([\w-]+)$/.exec(u.pathname);
        if (ev) { const f = eps.get(ev[1]) || sharedIds.get(ev[1]); if (!f) { res.writeHead(404); return res.end(); } if (IMG[path.extname(f.file).toLowerCase()] && u.searchParams.get('dl') !== '1') return sendImg(res, f.file); return sendVideo(req, res, (f.shot && phoneClip && /\.(mp4|mkv|mov|webm|avi)$/i.test(f.file) ? await phoneClip(f.file, false) : await phoneVersion?.(f.file)) || f.file, u.searchParams.get('dl') === '1', f.file); }
        if (u.pathname === '/api/cmd' && req.method === 'POST') { const r = await api('cmd', await body(req), 'wifi', ipOf()); return json(res, r, r.code || 200); }
        res.writeHead(404); res.end();
      } catch (e) { log('remote error', e.message); try { json(res, { ok: false }, 500); } catch {} }
    });
    server.on('error', (e) => {
      // busy: the start-from-phone helper (asked to let go) or the copy that is still closing after a restart: try a few times
      if (e.code === 'EADDRINUSE' && (start.retried || 0) < 6) { start.retried = (start.retried || 0) + 1; server = null; http.get(`http://127.0.0.1:${PORT}/release?k=${cfg.key}`, () => {}).on('error', () => {}); setTimeout(start, 1500 * start.retried); return; }
      log('remote server failed', e.message); server = null;
    });
    server.listen(PORT, '0.0.0.0', () => { start.retried = 0; log('phone remote on', lanAddress(), PORT, host()); });
    return true;
  }
  function stop() { try { server?.close(); } catch {} server = null; }
  const url = () => `http://${lanAddress() || 'localhost'}:${PORT}/?k=${cfg.key}`;
  // githack keeps an old copy of a branch link for hours, so the link names the commit that last changed the page
  let pageSha = cfg.pageSha || 'main';
  const refreshSha = () => net.fetch('https://api.github.com/repos/xkai7k/silver-bullet/commits?path=docs/remote.html&per_page=1', { headers: { 'User-Agent': 'SilverBullet' } })
    .then((r) => r.json()).then((j) => { const sha = j?.[0]?.sha; if (/^[0-9a-f]{40}$/.test(sha || '') && sha !== pageSha) { pageSha = cfg.pageSha = sha; saveCfg(); log('phone remote page', sha.slice(0, 7)); } }).catch(() => {});
  setTimeout(refreshSha, 15000); setTimeout(refreshSha, 3 * 60 * 1000); setInterval(refreshSha, 30 * 60 * 1000);
  const netUrl = () => `https://raw.githack.com/xkai7k/silver-bullet/${pageSha}/docs/remote.html?k=${cfg.key}`;
  const info = () => ({ on: !!cfg.on, url: url(), fixed: `http://${host()}:${PORT}/?k=${cfg.key}`, qr: cfg.on ? qrSvgOf(url()) : '', net: !!cfg.net, ntfyOn: !!cfg.ntfyOn, ntfy: cfg.ntfy || '', pinSet: !!cfg.pinHash, devices: devList(), key: cfg.key, netUrl: netUrl(), netQr: cfg.on && cfg.net ? qrSvgOf(netUrl()) : '' });

  ipcMain.handle('remote:call', (_e, kind, c) => (!(cfg.on && cfg.net) ? { ok: false, error: 'off' } : kind === 'img' ? thumb(imgs.get(String(c?.id || '')) || ((f) => (f && IMG[path.extname(f.file).toLowerCase()] ? f.file : null))(eps.get(String(c?.id || '')))) : api(kind === 'state' ? 'state' : 'cmd', c)));
  // a small JPEG of a picture, as text (the relay carries text only); kept so the next phone gets it at once
  const thumbs = new Map();
  async function thumb(src) {
    if (/^vthumb:/.test(src || '')) src = await videoFrame?.(src.slice(7)); // a clip: a frame from it
    if (!src) return { ok: false };
    if (thumbs.has(src)) return { ok: true, d: thumbs.get(src) };
    try {
      let buf;
      if (/^data:image\//i.test(src)) { const m = /^data:[^;,]+(;base64)?,(.*)$/s.exec(src); buf = m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2])); }
      else if (/^https?:\/\//i.test(src)) { const r = await net.fetch(src); if (!r.ok) throw new Error('http ' + r.status); buf = Buffer.from(await r.arrayBuffer()); }
      else { let p = src; if (/^file:/i.test(p)) p = decodeURIComponent(p.replace(/^file:\/*/i, '')).replace(/\//g, '\\'); else if (!path.isAbsolute(p)) p = path.join(__dirname, p.replace(/^\.?[\\/]/, '')); buf = fs.readFileSync(p); }
      const { nativeImage } = require('electron');
      let im = nativeImage.createFromBuffer(buf);
      if (im.isEmpty()) return { ok: false };
      const sz = im.getSize(); if (sz.width > 400) im = im.resize({ width: 400, quality: 'best' });
      const d = 'data:image/jpeg;base64,' + im.toJPEG(82).toString('base64'); // sharp enough for a tablet tile
      if (thumbs.size > 500) thumbs.clear();
      thumbs.set(src, d);
      return { ok: true, d };
    } catch (e) { return { ok: false }; }
  }
  ipcMain.handle('remote:net', (_e, on) => { cfg.net = !!on; saveCfg(); return info(); });
  // a note on the phone when a download finishes: the free ntfy app, following a secret topic only this PC knows
  ipcMain.handle('remote:ntfy', (_e, on) => { if (on && !cfg.ntfy) cfg.ntfy = 'sb-' + crypto.randomBytes(10).toString('hex'); cfg.ntfyOn = !!on; saveCfg(); if (on) notifyPhone('🔔 Silver Bullet', 'التنبيهات شغّالة: بيوصلك هنا لما يخلص أي تحميل'); return info(); });
  function notifyPhone(title, message) {
    if (!cfg.ntfyOn || !cfg.ntfy) return;
    net.fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: cfg.ntfy, title: String(title).slice(0, 120), message: String(message).slice(0, 500) }) })
      .then((r) => log('phone note', r.status)).catch((e) => log('phone note failed', e.message));
  }
  ipcMain.handle('remote:set', (_e, on) => { cfg.on = !!on; saveCfg(); if (on) start(); else stop(); try { wakeHelper?.(!!on, cfg.key, PORT); } catch {} return info(); });
  ipcMain.handle('remote:info', () => info());
  ipcMain.handle('remote:newkey', () => { // "🚫 اطرد كل الأجهزة": every old link (and every phone on it) stops working at once
    cfg.key = crypto.randomBytes(9).toString('hex'); cfg.devices = {}; saveCfg(); pinFails = 0; pinLockUntil = 0;
    if (cfg.on) try { wakeHelper?.(false); setTimeout(() => wakeHelper?.(true, cfg.key, PORT), 1500); } catch {}
    log('phone remote: new link, all devices out');
    if (cfg.net) notifyPhone('🔗 رابطك الجديد', netUrl()); // only you get it (your own alerts)
    return info();
  });
  ipcMain.on('remote:state', (_e, s) => {
    if (!s || !Array.isArray(s.games)) return;
    // pictures and episodes become short ids; the phone only ever sees the ids
    const ni = new Map(), ne = new Map();
    const pic = (src) => { if (!src) return ''; const id = hid(src); ni.set(id, src); return id; };
    const web = (src) => (/^https?:\/\//i.test(src || '') ? src : '');
    for (const list of [s.games, s.lib || [], s.watch || []]) for (const g of list) { g.pic = pic(g.img); g.web = web(g.img); delete g.img; }
    for (const sh of s.shows || []) {
      sh.pic = pic(sh.poster); delete sh.poster;
      for (const e of sh.eps || []) { const id = hid(e.file); ne.set(id, { file: e.file, dir: sh.dir }); e.id = id; e.ext = path.extname(e.file).slice(1).toLowerCase(); delete e.file; }
      sh.dir = hid(sh.dir);
    }
    for (const x of s.shots || []) { const id = hid(x.file); ne.set(id, { file: x.file, shot: true }); x.id = id; x.name = path.basename(x.file); x.src = /[\\/]razer[\\/]/i.test(x.file) ? 'razer' : /kairos/i.test(x.file) ? 'kairos' : ''; x.pic = pic(x.video ? 'vthumb:' + x.file : x.file); if (x.video) x.dur = clipMeta?.(x.file)?.dur || 0; delete x.file; }
    imgs = ni; eps = ne; state = s;
  });
  if (cfg.on) { start(); setTimeout(() => { try { wakeHelper?.(true, cfg.key, PORT); } catch {} }, 20000); }

  return { start, stop, notifyPhone };
};

// the page itself (also saved as docs/remote.html for the "from anywhere" link, with relay = true)
function page(relay = false) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Silver Bullet"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#0e1116"><link rel="apple-touch-icon" href="https://raw.githubusercontent.com/xkai7k/silver-bullet/main/assets/icon.png"><link rel="icon" href="https://raw.githubusercontent.com/xkai7k/silver-bullet/main/assets/icon.png">
<meta name="theme-color" content="#0d0f14"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><link rel="manifest" href="/manifest.json"><title>Silver Bullet</title><style>
:root{--bg:#0d0f14;--card:#171a22;--line:#262b37;--text:#eef1f6;--dim:#a7afbd;--acc:#e8c26a}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}[hidden]{display:none!important}html,body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,system-ui,"Segoe UI",Tahoma,sans-serif}
header{position:sticky;top:0;z-index:3;background:#0d0f14ee;backdrop-filter:blur(10px);padding:calc(12px + env(safe-area-inset-top)) 16px 8px}
h1{margin:0;font-size:20px;display:flex;align-items:center;gap:8px}h1 small{color:var(--dim);font-weight:400;font-size:13px}
.tabs{display:flex;gap:6px;margin-top:10px;overflow-x:auto;scrollbar-width:none}.tabs button{flex:1 0 auto;padding:10px 12px;border-radius:12px;border:0;background:var(--card);color:var(--text);font:inherit;font-weight:700;font-size:14px}.tabs button.on{background:var(--acc);color:#1a1408}
.sub{display:flex;gap:6px;margin:4px 0 0}.sub button{padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:none;color:var(--text);font:inherit;font-size:13px}.sub button.on{border-color:var(--acc);color:var(--acc)}
main{padding:12px 16px calc(40px + env(safe-area-inset-bottom));max-width:1100px;margin:0 auto}header>*{max-width:1100px;margin-left:auto;margin-right:auto}@media(min-width:700px){.pcb{grid-template-columns:repeat(4,1fr)}}input{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:#0f1218;color:var(--text);font:inherit;font-size:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(96px,27vw,168px),1fr));gap:clamp(8px,1.6vw,14px);margin-top:12px}
.g{position:relative;border:0;padding:0;border-radius:12px;overflow:hidden;aspect-ratio:3/4;background:linear-gradient(160deg,hsl(var(--h,220) 30% 26%),#141820);color:#fff;font:inherit;text-align:center}
.g.wide{aspect-ratio:16/10}.g img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.g.hasbg::before{content:'';position:absolute;inset:-20px;background:var(--bg) center/cover;filter:blur(18px) brightness(.55)}.g img.fit{object-fit:contain;padding:12% 10% 26%;filter:drop-shadow(0 4px 10px #0009)}.g span,.g em{z-index:2}.g .ini{z-index:0}.g.has .ini{display:none}.g .ini{position:absolute;inset:0;display:grid;place-items:center;font-size:34px;font-weight:800;opacity:.5}
.g span{position:absolute;inset:auto 0 0;padding:18px 6px 6px;font-size:clamp(11px,1.1vw + 7px,14px);font-weight:700;background:linear-gradient(transparent,rgba(0,0,0,.88));unicode-bidi:plaintext}
.g em{position:absolute;top:6px;inset-inline-start:6px;font-style:normal;font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.6)}
.g.go{outline:3px solid var(--acc)}.card{background:var(--card);border-radius:16px;padding:16px;margin-top:12px}
.now b{display:block;font-size:18px}.now small{color:var(--dim)}.ctrl{display:flex;justify-content:center;gap:16px;margin:14px 0}
.ctrl button{width:62px;height:62px;border-radius:50%;border:0;background:#222735;color:#fff;font-size:22px}.ctrl .pp{background:#1ed760;color:#000;width:72px;height:72px}
input[type=range]{padding:0;height:34px;accent-color:#1ed760;border:0;background:none}.row{display:flex;gap:8px;flex-wrap:wrap}.row>button:not(.opt):not(.sw):not(.gh),.btn{padding:11px 14px;border-radius:12px;border:0;background:var(--acc);color:#1a1408;font:inherit;font-weight:800;text-decoration:none;display:inline-block}
.btn.gh{background:#222735;color:var(--text)}
.t{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}.t i{font-style:normal;color:var(--acc);font-weight:800}.t span{flex:1;min-width:0}.t small{color:var(--dim);font-weight:400}.t .ctl{display:flex;gap:6px;flex:none}.t .ctl .btn{padding:6px 10px;font-size:14px}.t [data-arm="1"]{background:#b3402e!important;color:#fff!important}.t .bar{display:block;height:5px;border-radius:3px;background:var(--line);margin-top:6px;overflow:hidden}.t .bar i{display:block;height:100%;background:var(--acc)}
.it{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.it img,.it .ph{width:54px;height:54px;border-radius:12px;object-fit:cover;background:#222735;flex:none;display:grid;place-items:center;font-size:22px}
.it div{flex:1;min-width:0}.it b{display:block;unicode-bidi:plaintext}.it small{color:var(--dim);font-size:12px;display:block;unicode-bidi:plaintext;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.it .row{flex-wrap:nowrap}.it .btn{padding:8px 10px;font-size:13px}
.ep{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}.ep b{flex:1;font-weight:600;unicode-bidi:plaintext}.ep .bar{height:3px;background:#2a2f3d;border-radius:3px;overflow:hidden;margin-top:6px}.ep .bar i{display:block;height:100%;background:var(--acc)}
.ep.done b{opacity:.55}.ep .btn{padding:7px 10px;font-size:12px}
video{width:100%;border-radius:12px;background:#000;margin-top:10px}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#222735;padding:10px 16px;border-radius:12px;opacity:0;transition:opacity .2s;pointer-events:none}.toast.show{opacity:1}
.hint{color:var(--dim);font-size:13px;line-height:1.6}.ban{background:#22314a;border-radius:12px;padding:10px 12px;margin-top:10px;font-size:13px;display:flex;gap:8px;align-items:center}.ban b{flex:1}
.off{position:fixed;inset:auto 12px calc(12px + env(safe-area-inset-bottom));background:#3a1518;color:#ffd0d0;padding:12px;border-radius:12px;font-size:14px;text-align:center}
.g .src{position:absolute;top:5px;left:5px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.65);color:#fff;letter-spacing:.3px}.g .src.rz{background:#44d62c;color:#000}.sg{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}.sg .g{aspect-ratio:16/10}.shh{margin:18px 2px 6px;font-size:16px}.shh small{color:var(--dim);font-weight:400}.g .play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:30px;color:#fff;text-shadow:0 2px 12px #000;z-index:2;pointer-events:none}.g .dur{position:absolute;bottom:6px;left:6px;background:#000c;color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px;z-index:3;direction:ltr}#dlp{width:min(420px,90%);text-align:center}#dlp .bar{display:block;height:6px;border-radius:3px;background:#ffffff22;overflow:hidden;margin-bottom:6px}#dlp .bar i{display:block;height:100%;width:0;background:var(--acc)}
.sv{position:fixed;inset:0;z-index:9;background:#000e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}.sv img,.sv video{max-width:100%;max-height:75vh;border-radius:10px}.sv .row{justify-content:center}
.keys{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.keys .btn{padding:8px 10px;min-width:44px}#tp{height:210px;margin-top:10px;border-radius:14px;border:1px dashed var(--line);background:#ffffff08;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:13px;text-align:center;padding:10px;touch-action:none;user-select:none;-webkit-user-select:none}#scr{width:100%;border-radius:10px;margin-top:10px;display:block;touch-action:manipulation}select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px;font:inherit}
.pinsheet{position:fixed;inset:auto 10px calc(10px + env(safe-area-inset-bottom));z-index:60;box-shadow:0 10px 40px #000a;border:1px solid var(--acc)}.pinsheet .x{float:left;background:none;border:0;color:var(--dim);font-size:20px}
.pcb{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.pcb .btn{padding:14px 8px;font-size:15px}.pcb [data-arm="1"]{background:#b3402e!important;color:#fff!important}
.sw{width:34px;height:34px;border-radius:50%;border:2px solid transparent!important;padding:0!important}.sw.on,.opt.on{border-color:var(--acc)!important}.opt{padding:8px 12px;border-radius:12px;border:2px solid var(--line);background:none;color:var(--text);font:inherit}
</style></head><body>
<header><h1>🎮 Silver Bullet <small id="who"></small></h1>
<div class="tabs"><button data-t="games" class="on" data-i="games"></button><button data-t="watch" data-i="watch"></button><button data-t="dl" data-i="dl"></button><button data-t="shots" data-i="shots"></button><button data-t="files" data-i="files"></button><button data-t="pc" data-i="pc"></button></div></header>
<main>
<div id="fix"></div><div id="inst" class="card" hidden></div>
<section id="games"><div class="sub"><button data-g="inst" class="on" data-i="inst"></button><button data-g="lib" data-i="lib"></button></div>
<input id="q" type="search" style="margin-top:10px"><div class="grid" id="grid"></div></section>
<section id="watch" hidden><label class="card" style="display:flex;gap:10px;align-items:center"><input type="checkbox" style="width:22px;height:22px;flex:none" id="brv"><span><b data-i="bravet"></b><br><small class="hint" data-i="braveh"></small></span></label><div id="wback" class="card" hidden></div><div id="ytp"></div><div id="wsh"></div><div id="wst"></div></section>
<section id="dl" hidden><div class="card"><b>🧲 <span data-i="startdl"></span></b><p class="hint" data-i="maghint"></p><div class="row"><input id="mag" placeholder="magnet:?xt=…" dir="ltr" style="flex:1"><button id="go" data-i="go"></button></div></div>
<div class="card" id="updc" hidden><div class="row" style="justify-content:space-between;align-items:center"><b>🔄 <span data-i="updt"></span></b><button class="btn" id="updgo" data-i="updall"></button></div><div id="updl"></div></div>
<div class="card"><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" style="width:22px;height:22px;flex:none" id="ngt"><b data-i="nightt"></b></label><p class="hint" data-i="nighth"></p><div class="row" style="align-items:center;gap:8px"><span data-i="nightfrom"></span><select id="ngf"><option value="22">10 PM</option><option value="23">11 PM</option><option value="0">12 AM</option><option value="1">1 AM</option><option value="2">2 AM</option><option value="3">3 AM</option></select></div><div id="ngq"></div></div>
<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><b>⬇ <span data-i="dls"></span></b><button class="btn gh" id="dlc" data-i="clearall"></button></div><div id="tl"></div></div></section>
<section id="shots" hidden><p class="hint" data-i="shothint"></p><div id="sg"></div><div id="sv" class="sv" hidden></div></section>
<section id="files" hidden><div class="card"><b>📁 <span data-i="sharedt"></span></b><p class="hint" data-i="sharedh"></p><div id="fl"></div></div></section>
<section id="pc" hidden><div class="card pinsheet" id="pinbox" hidden><button class="x" id="pinx">✕</button><b>🔒 <span data-i="pint"></span></b><p class="hint" id="pinmsg"></p><div class="row" id="pinrow"><input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" style="flex:1" dir="ltr"><button class="btn" id="pingo" data-i="okk"></button></div></div><div class="card"><b>💻 <span data-i="pcnow"></span></b><p class="hint" id="pcg"></p><div class="pcb"><button class="btn" data-pca="monoff" data-i="monoff"></button><button class="btn" data-pca="monon" data-i="monon"></button><button class="btn" data-pca="lock" data-i="lock"></button><button class="btn" data-pca="sleep" data-i="sleep"></button><button class="btn" data-pca="kill" data-i="kill" hidden></button><button class="btn" data-pca="closeall" data-i="closeall"></button><button class="btn" data-pca="shutdown" data-i="shut"></button><button class="btn gh" data-pca="cancel" data-i="cancel" hidden></button></div><p class="hint" data-i="pchint"></p></div><div class="card"><div class="row" style="justify-content:space-between;align-items:center"><b>👁 <span data-i="scrt"></span></b><button class="btn" id="scrgo" data-i="scron"></button></div><div id="scrbox" hidden><img id="scr" alt=""><p class="hint" data-i="scrh"></p></div></div>
<div class="card"><b>🖱 <span data-i="mouset"></span></b><div id="tp"><span data-i="tph"></span></div><div class="pcb"><button class="btn" data-ck="l" data-i="lclick"></button><button class="btn" data-ck="r" data-i="rclick"></button></div>
<div class="row" style="margin-top:10px"><input id="kb" dir="auto" style="flex:1"><button class="btn" id="kbgo" data-i="send"></button></div>
<div class="keys"><button class="btn gh" data-k="enter">⏎</button><button class="btn gh" data-k="back">⌫</button><button class="btn gh" data-k="esc">Esc</button><button class="btn gh" data-k="tab">Tab</button><button class="btn gh" data-k="space">␣</button><button class="btn gh" data-k="up">↑</button><button class="btn gh" data-k="down">↓</button><button class="btn gh" data-k="left">←</button><button class="btn gh" data-k="right">→</button><button class="btn gh" data-k="win">⊞</button><button class="btn gh" data-k="alt+tab">Alt+Tab</button><button class="btn gh" data-k="f11">F11</button><button class="btn gh" data-k="voldown">🔉</button><button class="btn gh" data-k="volup">🔊</button><button class="btn gh" data-k="playpause">⏯</button></div></div>
<div class="card"><b>⏱ <span data-i="playt"></span></b><p class="hint" id="playn"></p><select id="playl"><option value="0" data-i="nolimit"></option><option value="60">1h</option><option value="120">2h</option><option value="180">3h</option><option value="240">4h</option><option value="300">5h</option><option value="360">6h</option></select></div>
<div class="card"><b>📋 <span data-i="clipt"></span></b><p class="hint" data-i="cliph"></p><textarea id="clip" rows="3" dir="auto" style="width:100%;margin-top:8px;background:var(--bg,#0d0f14);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:8px;font:inherit"></textarea><div class="pcb"><button class="btn" id="clipto" data-i="clipto"></button><button class="btn" id="clipfrom" data-i="clipfrom"></button></div></div>
<div class="card"><b>📱 <span data-i="devt"></span></b><div id="devl"></div><p class="hint" data-i="devh"></p></div>
</section>
</main><div class="toast" id="toast"></div><div class="off" id="off" hidden></div>
<script>
const RELAY=${relay ? 'true' : 'false'};const K=new URLSearchParams(location.search).get('k');const $=(s)=>document.querySelector(s);let S={games:[],lib:[],watch:[],shows:[]},gt='inst',openShow=null;
try{localStorage.setItem('sbk',K)}catch{}
const T={ar:{games:'🎮 ألعاب',watch:'🎬 مشاهدة',dl:'⬇ تحميل',clearall:'🧹 نظّف الكل',linking:'⚡ يحاول يتصل بالكمبيوتر مباشرة…',checking:'🔍 يتأكد إن المقطع وصل سليم…',again:'المقطع وصل ناقص، يعيد تحميله…',willgo:'يكمل من نفس المكان أول ما ترجع',fastdl:'حمّل بسرعة (720p)',origdl:'الجودة الأصلية',other:'غيرها',save:'حمّل',savenow:'احفظ (اختر وين)',preparing:'يجهّز المقطع…',secleft:'ثانية باقية',awayclip2:'وأنت برا البيت ما يشتغل هنا، بس تقدر تحمّله ⬇ وتحطه وين ما تبي.',awayclip:'وأنت برا البيت ما يشتغل المقطع هنا. اضغط ☁️ وينحط في OneDrive بصوت واحد، وشغّله من تطبيقه.',tocloud2:'للجوال (OneDrive)',clipt:'الحافظة المشتركة',cliph:'اكتب أو الصق هنا وأرسله للكمبيوتر (يصير جاهز تلصقه هناك)، أو خذ اللي منسوخ في الكمبيوتر.',clipto:'أرسل للكمبيوتر',clipfrom:'خذ من الكمبيوتر',clipempty:'الصق النص في الخانة أول',clipsent:'📋 وصل، الصقه في الكمبيوتر (Ctrl+V)',clipgot:'📋 نسخته في جوالك',clipshown:'📋 هذا اللي منسوخ في الكمبيوتر',clipnone:'الحافظة في الكمبيوتر فاضية',devt:'الأجهزة اللي تستخدم الرابط',devh:'🏠 = من واي فاي البيت، 🌍 = من برا. لو فيه جهاز مو لك: الإعدادات في الكمبيوتر ← الجوال ← اطرد كل الأجهزة.',thisdev:'هذا الجهاز',now:'الحين',minago:'دقيقة',hago:'ساعة',pint:'رمز التحكم',pinh:'اكتب الرمز اللي حطيته في إعدادات الكمبيوتر. ينحفظ في هذا الجوال.',pinok2:'🔓 تمام، الرمز انحفظ في جوالك',scrt:'شاشة الجهاز',scron:'شوف',scroff:'وقّف',scrh:'اضغط على أي مكان في الصورة ويضغط عليه في الكمبيوتر. توقف لحالها بعد ٣ دقايق بدون لمس.',mouset:'الماوس والكيبورد',tph:'حرّك إصبع = الماوس • لمسة = ضغطة • إصبعين = تمرير • لمسة بإصبعين = يمين',lclick:'ضغطة يسار',rclick:'ضغطة يمين',send:'أرسل',playt:'وقت اللعب اليوم',nolimit:'بدون حد',playmin:'لعبت اليوم',limitset:'✓ انحفظ الحد',updt:'تحديثات جاهزة',updall:'حدّث الكل',updsure:'ستيم بيعيد تشغيله، متأكد؟',nightt:'🌙 حمّل بالليل',nighth:'لما يكون شغّال، أي تحميل تبدأه من الجوال يستنى لين الليل، ويكمل لين ٨ الصبح.',nightfrom:'يبدأ من',nightq:'بالانتظار لليل:',awayeps:'وأنت برا البيت ما تقدر تشغّل الحلقة هنا مباشرة. اضغط ☁️ وتنحط في OneDrive وشغّلها من تطبيقه، أو 🖥 وتشتغل على الكمبيوتر.',bravet:'🛡️ افتح المواقع بدون إعلانات (Brave)',braveh:'المواقع تنفتح في متصفح Brave اللي يحجب الإعلانات. لازم يكون Brave مثبت في جوالك.',braveon:'🛡️ المواقع بتنفتح في Brave',braveoff:'المواقع بتنفتح في المتصفح العادي',files:'📁 مشترك',sharedt:'الملفات المشتركة',sharedh:'مجلد في OneDrive بين جهازك وجوالك. افتحه من تطبيق OneDrive في جوالك وتقدر تحمّل الحلقة وتتابعها حتى بدون نت. وأي ملف تحطه فيه من الجوال يوصل للجهاز. الحلقة تنحذف لحالها بعد ما تتابعها، أو بعد أسبوعين.',noshared:'فاضي. اضغط ☁️ جنب أي حلقة وتنحط هنا.',tocloud:'حطها في المجلد المشترك',cloudok:'☁️ انحطت في المجلد المشترك، تطلع في OneDrive بجوالك أول ما ترتفع',uploading:'يرتفع',deleted:'🗑 انحذف',hideit:'شيله من القائمة',hidden:'✓ شلته، الملف نفسه ما انحذف',cantdl:'🚫 لا تستطيع تحميلها عن بعد',sure2:'متأكد؟ ✕',pauseall:'يوقف كل ستيم؟',cleared:'✓ نظّفت القائمة',queued:'⏳ بالطابور',pc:'💻 الجهاز',pcnow:'جهازك',pcgame:'شغّال الحين:',pcidle:'ما فيه لعبة شغّالة',lock:'🔒 قفل الشاشة',sleep:'😴 سكون',kill:'✖ سكّر اللعبة',closeall:'🧹 سكّر كل النوافذ',shut:'⏻ إطفاء',cancel:'↩ ألغِ الإطفاء',sure:'متأكد؟ اضغط مرة ثانية',pcok:'تم',pchint:'الإطفاء يصير بعد ٣٠ ثانية، وتقدر تلغيه من هنا قبلها. السكون ما تقدر تلغيه من الجوال، لأن الجهاز وهو نايم ما يسمع أحد. لو تبي ترجع بسرعة، طفّ الشاشة بداله.',monoff:'🌑 طفّ الشاشة',monon:'💡 شغّل الشاشة',shots:'📸 لقطاتي',shothint:'مرتبة حسب اللعبة. اضغط أي لقطة أو مقطع، وبعدها ⬇ حمّل، وبعدها تختار وين تحطه (الصور، الملفات، أي تطبيق).',inst:'مثبتة',lib:'مكتبتي',search:'دوّر على لعبة…',none:'ما فيه شي هنا',vol:'الصوت',startdl:'ابدأ تحميل',maghint:'الصق رابط magnet وأنا أبدأ التحميل في الكمبيوتر.',go:'ابدأ',dls:'التحميلات',nodl:'ما فيه تحميلات',onpc:'يشتغل في الكمبيوتر',fail:'ما قدرت',lunch:'▶ في الكمبيوتر',cont:'كمّل هنا',here:'▶ هنا',down:'⬇ نزّلها',back:'→ رجوع',sites:'📺 مواقعك',favs:'⭐ المفضلة',others:'📺 الباقي',nofav:'اضغط ☆ جنب أي موقع عشان يطلع هنا.',favt:'مفضلة',instc:'حطه على شاشة جوالك',instios:'من زر المشاركة تحت ← "إضافة إلى الشاشة الرئيسية". يصير له أيقونة ويفتح مثل التطبيق.',instand:'من ⋮ فوق ← "إضافة إلى الشاشة الرئيسية". يصير له أيقونة ويفتح مثل التطبيق.',insta:'يصير له أيقونة ويفتح مثل التطبيق.',instgo:'📲 ثبّته',savebtn:'احفظ',pastehint:'اضغط مطولاً على الخانة واختر لصق',pin:'وين وصلت',pastelink:'رابط الحلقة اللي وصلتها (من المتصفح: مشاركة ← نسخ الرابط، وبعدين 📋)',usecopied:'أحفظ الرابط اللي نسخته؟',minute:'الدقيقة (اختياري)',pinok:'✓ انحفظ، الكمبيوتر بيكمل من هنا',badlink:'هذا مو رابط',wasat:'وين وصلت في',shows:'🎞️ حلقاتي ومقاطعي',ep:'حلقة',nomusic:'ما فيه شي شغّال',hi:'هلا',dlstart:'⬇ بدأ التحميل في الكمبيوتر',install:'⬇ نزّل',saved:'محفوظ',dead:'ميت',fixed:'📌 فيه رابط ثابت ما يتغير لو تغيّر عنوان الكمبيوتر',use:'استخدمه',offline:'البرنامج مو متصل… لو الكمبيوتر شغّال تقدر تشغّله من هنا',startpc:'شغّل البرنامج',nomkv:'لو ما اشتغلت هنا (mkv) نزّلها وافتحها بـ VLC',hat:'على الراس',color:'لونه',hair:'الشعر',kind:'الشكل',boy:'👦 ولد',girl:'👧 بنت',def:'افتراضي',okk:'تم ✓',wtch:'🌐 كمّل بالمتصفح',onpcw:'🖥 افتحه بالكمبيوتر'},
en:{games:'🎮 Games',watch:'🎬 Watch',dl:'⬇ Downloads',clearall:'🧹 Clear all',linking:'⚡ Trying a direct line to the PC…',checking:'🔍 Checking the clip arrived intact…',again:'The clip arrived damaged, fetching it again…',willgo:'carries on from here when you come back',fastdl:'Fast download (720p)',origdl:'Original quality',other:'Other',save:'Download',savenow:'Save (choose where)',preparing:'Getting the clip ready…',secleft:'s left',awayclip2:'Away from home it cannot play here, but you can download ⬇ it and put it wherever you like.',awayclip:'Away from home the clip cannot play here. Tap ☁️ to put it in OneDrive (one sound track) and play it from its app.',tocloud2:'To phone (OneDrive)',clipt:'Shared clipboard',cliph:'Type or paste here and send it to the PC (ready to paste there), or take what is copied on the PC.',clipto:'Send to PC',clipfrom:'Take from PC',clipempty:'Paste the text in the box first',clipsent:'📋 Sent, paste it on the PC (Ctrl+V)',clipgot:'📋 Copied to your phone',clipshown:'📋 This is what the PC has copied',clipnone:'The PC clipboard is empty',devt:'Devices using the link',devh:'🏠 = home Wi-Fi, 🌍 = from outside. If one is not yours: PC settings → Phone → kick all devices.',thisdev:'this device',now:'now',minago:'min ago',hago:'h ago',pint:'Control PIN',pinh:'Type the PIN you set in the PC settings. It is kept on this phone.',pinok2:'🔓 Done, the PIN is saved on this phone',scrt:'PC screen',scron:'View',scroff:'Stop',scrh:'Tap anywhere on the picture to click there on the PC. Stops by itself after 3 minutes without a touch.',mouset:'Mouse & keyboard',tph:'Move a finger = mouse • tap = click • two fingers = scroll • two-finger tap = right click',lclick:'Left click',rclick:'Right click',send:'Send',playt:'Play time today',nolimit:'No limit',playmin:'Played today',limitset:'✓ Limit saved',updt:'Updates ready',updall:'Update all',updsure:'Steam will restart, sure?',nightt:'🌙 Download at night',nighth:'When on, any download you start from the phone waits for the night and runs until 8 in the morning.',nightfrom:'Starts at',nightq:'Waiting for the night:',awayeps:'Away from home an episode cannot play here directly. Tap ☁️ to put it in OneDrive and play it from its app, or 🖥 to play it on the PC.',bravet:'🛡️ Open sites without ads (Brave)',braveh:'Sites open in the Brave browser, which blocks ads. Brave must be installed on your phone.',braveon:'🛡️ Sites will open in Brave',braveoff:'Sites will open in your usual browser',files:'📁 Shared',sharedt:'Shared files',sharedh:'A OneDrive folder between your PC and your phone. Open it in the OneDrive app to download an episode and watch it even offline. Anything you put there from the phone reaches the PC. An episode is removed by itself once you watch it, or after two weeks.',noshared:'Empty. Tap ☁️ next to any episode to put it here.',tocloud:'Put it in the shared folder',cloudok:'☁️ In the shared folder; it shows in OneDrive on your phone once uploaded',uploading:'uploading',deleted:'🗑 Deleted',hideit:'Hide it',hidden:'✓ Hidden, the file itself is kept',cantdl:'🚫 This game cannot be downloaded remotely',sure2:'Sure? ✕',pauseall:'Pause all Steam?',cleared:'✓ List cleared',queued:'⏳ Queued',pc:'💻 PC',pcnow:'Your PC',pcgame:'Running now:',pcidle:'No game running',lock:'🔒 Lock',sleep:'😴 Sleep',kill:'✖ Close game',closeall:'🧹 Close all windows',shut:'⏻ Shut down',cancel:'↩ Cancel shutdown',sure:'Sure? Tap again',pcok:'Done',pchint:'Shutdown waits 30 seconds, and you can cancel it from here. Sleep cannot be undone from the phone (a sleeping PC hears nobody); to come back quickly, turn the screen off instead.',monoff:'🌑 Screen off',monon:'💡 Screen on',shots:'📸 Captures',shothint:'Tap a capture to see it big, then ⬇ saves it to your phone (iPhone: long-press the picture → Save).',inst:'Installed',lib:'Library',search:'Search games…',none:'Nothing here',vol:'Volume',startdl:'Start a download',maghint:'Paste a magnet link and the PC starts downloading.',go:'Start',dls:'Downloads',nodl:'No downloads',onpc:'Starting on the PC',fail:'Could not do it',lunch:'▶ On PC',cont:'Continue here',here:'▶ Here',down:'⬇ Download',back:'← Back',sites:'📺 Your sites',favs:'⭐ Favourites',others:'📺 Everything else',nofav:'Tap ☆ next to a site to pin it here.',favt:'Favourite',instc:'Put it on your home screen',instios:'Share button → "Add to Home Screen". It gets an icon and opens like an app.',instand:'⋮ menu → "Add to Home screen". It gets an icon and opens like an app.',insta:'It gets an icon and opens like an app.',instgo:'📲 Install',savebtn:'Save',pastehint:'Long-press the box and choose Paste',pin:'Where I got to',pastelink:'Link of the episode you reached (browser: Share → Copy link, then 📋)',usecopied:'Save the link you copied?',minute:'Minute (optional)',pinok:'✓ Saved, the PC will continue from here',badlink:'That is not a link',wasat:'Where did you get to in',shows:'🎞️ My episodes & videos',ep:'episodes',nomusic:'Nothing playing',hi:'Hi',dlstart:'⬇ Download started on the PC',install:'⬇ Get',saved:'Saved',dead:'Dead',fixed:'📌 A fixed link exists that keeps working if the PC address changes',use:'Use it',offline:'The app is not reachable… if the PC is on you can start it from here',startpc:'Start the app',nomkv:'If it will not play here (mkv), download it and open it in VLC',hat:'Headwear',color:'Colour',hair:'Hair',kind:'Look',boy:'👦 Boy',girl:'👧 Girl',def:'Default',okk:'Done ✓',wtch:'🌐 Continue in browser',onpcw:'🖥 Open on PC'}};
let L=T.ar;const t=(k)=>L[k]||T.ar[k]||k;
function lang(l){L=T[l]||T.ar;document.documentElement.lang=l;document.documentElement.dir=l==='en'?'ltr':'rtl';document.querySelectorAll('[data-i]').forEach((e)=>e.textContent=t(e.dataset.i));$('#q').placeholder=t('search');}
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hue=(s)=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))%360,7);
const img=(p,w)=>RELAY?(w||''):(p?'/img/'+p+'?k='+K:'');
/* from anywhere, pictures kept on the PC come through the relay as small thumbnails (and stand in for web pictures that fail) */
/* sites open in Brave (ad-free) when you turn it on */
let brave=false;try{brave=localStorage.getItem('sbBrave')==='1'}catch{}
const viaBrave=(u)=>brave&&/^https?:/i.test(u)?'brave://open-url?url='+encodeURIComponent(u):u;
const pimg=(p,w)=>{if(!RELAY)return p?'<img loading="lazy" src="/img/'+p+'?k='+K+'" onerror="this.remove()" onload="fitImg(this)">':'';if(w)return '<img loading="lazy" src="'+esc(w)+'"'+(p?' data-fb="'+p+'"':'')+' onerror="rpFail(this)" onload="fitImg(this)">';return p?'<img data-rp="'+p+'" alt="" onload="fitImg(this)">':'';};
/* a picture much wider than its tile (a banner, a logo) or a small icon is shown whole on a soft backdrop instead of cropped and blown up */
function fitImg(el){const w=el.naturalWidth,h=el.naturalHeight,b=el.parentNode;if(!w||!h||!b)return;b.classList.add('has');const tr=b.clientWidth/Math.max(1,b.clientHeight),ir=w/h;if(w<180||ir>tr*1.45||ir<tr/1.9){el.classList.add('fit');b.style.setProperty('--bg','url('+JSON.stringify(el.src)+')');b.classList.add('hasbg')}}
const RC={};function rpLoad(el){const id=el.dataset.rp;if(!id)return;el.removeAttribute('data-rp');if(RC[id]){el.src=RC[id];return}call('img',{id}).then((r)=>{if(r&&r.d){RC[id]=r.d;el.src=r.d}else el.remove()}).catch(()=>el.remove())}
const rpObs=('IntersectionObserver' in window)?new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting){rpObs.unobserve(e.target);rpLoad(e.target)}}),{rootMargin:'400px'}):null;
let rpT=0;function rpScan(){clearTimeout(rpT);rpT=setTimeout(()=>document.querySelectorAll('img[data-rp]').forEach((el)=>rpObs?rpObs.observe(el):rpLoad(el)),50)}
function rpFail(el){const f=el.dataset.fb;if(f){el.removeAttribute('data-fb');el.removeAttribute('onerror');el.removeAttribute('src');el.dataset.rp=f;rpScan()}else el.remove()}
if(RELAY)new MutationObserver(rpScan).observe(document.documentElement,{childList:true,subtree:true});
const clock=(s)=>{s=Math.floor(s||0);const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s%60).padStart(2,'0')};
const toast=(m)=>{const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(e._h);e._h=setTimeout(()=>e.classList.remove('show'),2200)};
// on your Wi-Fi the page talks to the PC directly; from anywhere else it goes through a free relay (the app on the PC answers)
const SIG='wss://0.peerjs.com/peerjs?key=peerjs';let ws=null,wsOpen=false,wq=[],calls=new Map(),cid=0,parts=new Map();
function relayConn(){const r=()=>Math.random().toString(36).slice(2,12);ws=new WebSocket(SIG+'&id=sbp'+r()+'&token='+r()+'&version=1.5.4');let hb=0;
 ws.onopen=()=>{hb=setInterval(()=>{try{ws.send('{"type":"HEARTBEAT"}')}catch{}},5000)};
 ws.onmessage=(e)=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='OPEN'){wsOpen=true;wq.splice(0).forEach((f)=>f())}
  else if(m.type==='CANDIDATE'&&m.payload&&m.payload.sb&&m.payload.sb.t==='res'){const x=m.payload.sb,c=calls.get(x.id);if(!c)return;const p=parts.get(x.id)||[];p[x.i]=x.d;parts.set(x.id,p);if(p.filter((v)=>v!=null).length===x.n){parts.delete(x.id);calls.delete(x.id);try{c.res(JSON.parse(p.join('')))}catch(err){c.rej(err)}}}};
 ws.onclose=()=>{wsOpen=false;clearInterval(hb);setTimeout(relayConn,3000)};}
if(RELAY)relayConn();
let DEVID='';try{DEVID=localStorage.getItem('sbDev')||''}catch{}if(!DEVID){DEVID=Math.random().toString(36).slice(2,14);try{localStorage.setItem('sbDev',DEVID)}catch{}}
const DEVNAME=(()=>{const u=navigator.userAgent;if(/iPad/.test(u))return'iPad';if(/iPhone/.test(u))return'iPhone';const a=/Android[^;)]*;[ ]*([^;)]+?)[ ]*(Build|[)])/.exec(u);if(a)return a[1].trim().slice(0,30);if(/Android/.test(u))return'Android';if(/Windows/.test(u))return'Windows';if(/Mac/.test(u))return'Mac';return'جهاز'})();
const DEV={id:DEVID,name:DEVNAME};
function call(kind,body){body=Object.assign({},body||{},{dev:DEV});if(!RELAY)return kind==='state'?fetch('/api/state?k='+K+'&d='+DEVID+'&n='+encodeURIComponent(DEVNAME),{cache:'no-store'}).then((r)=>r.json()):fetch('/api/cmd?k='+K,{method:'POST',body:JSON.stringify(body)}).then((r)=>r.json());
 return new Promise((res,rej)=>{const go=()=>{const id=++cid;calls.set(id,{res,rej});try{ws.send(JSON.stringify({type:'CANDIDATE',dst:'sbr-'+K,payload:{type:'data',candidate:{candidate:'',sdpMid:'0',sdpMLineIndex:0},sb:{t:'api',id,kind,body},connectionId:'sb'}}))}catch(err){}setTimeout(()=>{if(calls.has(id)){calls.delete(id);parts.delete(id);rej(new Error('timeout'))}},15000)};wsOpen?go():wq.push(go)});}
const cmd=(o)=>call('cmd',o).catch(()=>({ok:false}));
document.querySelectorAll('.tabs button').forEach((b)=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach((x)=>x.classList.toggle('on',x===b));for(const s of ['games','watch','dl','shots','files','pc'])$('#'+s).hidden=s!==b.dataset.t;try{localStorage.setItem('sbtab',b.dataset.t)}catch{}});
document.querySelectorAll('[data-g]').forEach((b)=>b.onclick=()=>{gt=b.dataset.g;document.querySelectorAll('[data-g]').forEach((x)=>x.classList.toggle('on',x===b));drawGames();});
const tile=(g,extra)=>'<button class="g" style="--h:'+hue(g.name)+'" data-id="'+esc(g.id)+'" data-kind="'+(g.tor?'tor':g.owned?'own':'game')+'"><span class="ini">'+esc((g.name||'?')[0])+'</span>'+pimg(g.pic,g.web)+(extra?'<em>'+extra+'</em>':'')+'<span>'+esc(g.name)+'</span></button>';
const gb=(n)=>(n/1073741824).toFixed(n>10737418240?0:1)+' GB';
const sdl=(g)=>g.sid&&(S.steam||[]).find((x)=>x.id===g.sid);
const sbadge=(g)=>{if(!g.sid)return '🚫';const d=sdl(g);return !d?'📚':d.st==='done'?'✓':d.total?d.pct+'%':'⏳'};
function drawGames(){const q=$('#q').value.trim().toLowerCase();const list=(gt==='inst'?S.games:S.lib).filter((g)=>!q||g.name.toLowerCase().includes(q));
$('#grid').innerHTML=list.map((g)=>tile(g,g.tor?(g.state==='downloading'?Math.round(g.pct||0)+'%':g.state==='saved'?'🧲':''):g.owned?sbadge(g):'')).join('')||'<p class="hint">'+t('none')+'</p>';
document.querySelectorAll('#grid .g').forEach((b)=>b.onclick=async()=>{const k=b.dataset.kind;if(k==='own'){const g=(S.lib||[]).find((x)=>x.id===b.dataset.id);if(g&&!g.sid){toast(t('cantdl'));return;}}b.classList.add('go');const r=await cmd(k==='tor'?{type:'torDl',id:b.dataset.id}:k==='own'?{type:'install',id:b.dataset.id}:{type:'launch',id:b.dataset.id});toast(r.msg||(r.ok?(k==='tor'?t('dlstart'):'▶ '+t('onpc')):t('fail')));if(r.ok&&(k==='own'||k==='tor'))setTimeout(()=>{document.querySelector('.tabs [data-t=dl]')?.click();poll()},1800);setTimeout(()=>b.classList.remove('go'),1500)});}
$('#q').oninput=drawGames;
function drawWatch(){
 if(openShow){const sh=S.shows.find((x)=>x.dir===openShow);if(!sh){openShow=null;return drawWatch();}
$('#wst').innerHTML='';$('#wsh').innerHTML='<div class="row" style="align-items:center"><button class="btn gh" id="wb">'+t('back')+'</button><b style="flex:1">'+esc(sh.name)+'</b><button class="btn gh" id="whide">🙈 '+t('hideit')+'</button></div><div id="vp"></div>'+(RELAY?'<p class="ban"><b>'+t('awayeps')+'</b></p>':'<p class="hint">'+t('nomkv')+'</p>')+''+sh.eps.map((e)=>{const p=e.d?Math.min(100,Math.round(e.t/e.d*100)):0;return '<div class="ep '+(p>90?'done':'')+'"><div style="flex:1;min-width:0"><b>'+esc(e.name)+'</b>'+(p?'<div class="bar"><i style="width:'+p+'%"></i></div>':'')+'</div>'+(RELAY?'':'<button class="btn" data-here="'+e.id+'">'+t('here')+'</button>')+'<button class="btn gh" data-pc="'+e.id+'">🖥</button>'+(RELAY?'':'<a class="btn gh" href="/ep/'+e.id+'?k='+K+'&dl=1" download>⬇</a>')+'<button class="btn gh" data-cloud="'+e.id+'" title="'+t('tocloud')+'">☁️</button></div>'}).join('');
$('#wb').onclick=()=>{openShow=null;drawWatch()};
$('#whide').onclick=async()=>{const b=$('#whide');if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=t('sure');return;}const r=await cmd({type:'hideShow',dir:sh.dir});if(r.ok){S.shows=S.shows.filter((x)=>x.dir!==sh.dir);openShow=null;drawWatch();toast(t('hidden'))}else toast(t('fail'))};
document.querySelectorAll('[data-pc]').forEach((b)=>b.onclick=async()=>{const r=await cmd({type:'showPlay',ep:b.dataset.pc});toast(r.ok?'▶ '+t('onpc'):t('fail'))});
document.querySelectorAll('[data-here]').forEach((b)=>b.onclick=()=>playHere(sh,sh.eps.find((e)=>e.id===b.dataset.here)));
document.querySelectorAll('[data-cloud]').forEach((b)=>b.onclick=async()=>{b.disabled=true;const r=await cmd({type:'toCloud',ep:b.dataset.cloud});toast(r.ok?t('cloudok'):(r.msg||t('fail')));b.disabled=false});return;}
 $('#wsh').innerHTML=S.shows.length?'<h3>'+t('shows')+'</h3><div class="grid">'+S.shows.map((sh)=>'<button class="g" style="--h:'+hue(sh.name)+'" data-show="'+sh.dir+'"><span class="ini">'+esc(sh.name[0])+'</span>'+pimg(sh.pic,sh.web)+'<em>'+sh.eps.filter((e)=>e.d&&e.t/e.d>.9).length+'/'+sh.eps.length+'</em><span>'+esc(sh.name)+'</span></button>').join('')+'</div>':'';
 document.querySelectorAll('[data-show]').forEach((b)=>b.onclick=()=>{openShow=b.dataset.show;drawWatch();scrollTo(0,0)});
 const wRow=(w)=>'<div class="it">'+(img(w.pic,w.web)?'<img src="'+img(w.pic,w.web)+'" onerror="this.replaceWith(Object.assign(document.createElement(\\'span\\'),{className:\\'ph\\',textContent:\\'🎬\\'}))">':'<span class="ph">🎬</span>')+'<div><b>'+esc(w.name)+'</b><small>'+esc([w.note,w.time?'⏱ '+clock(w.time):''].filter(Boolean).join(' • '))+'</small></div><div class="row"><button class="btn gh" data-fav="'+esc(w.id)+'" title="'+esc(t('favt'))+'">'+(w.fav?'⭐':'☆')+'</button>'+(ytId(w.url)?'<button class="btn gh" data-yt="'+esc(w.id)+'">'+t('here')+'</button>':'')+(w.url?'<a class="btn gh" data-site="'+esc(w.id)+'" target="_blank" rel="noopener" href="'+esc(viaBrave(ytAt(w.url,w.time)))+'">🌐</a>':'')+(w.url&&!ytId(w.url)?'<button class="btn gh" data-pin="'+esc(w.id)+'" title="'+esc(t('pin'))+'">📍</button>':'')+'<button class="btn" data-w="'+esc(w.id)+'">🖥</button></div></div>';
 const favs=S.watch.filter((w)=>w.fav),rest=S.watch.filter((w)=>!w.fav);
 $('#wst').innerHTML=S.watch.length?'<h3>'+t('favs')+'</h3>'+(favs.length?favs.map(wRow).join(''):'<p class="hint">'+t('nofav')+'</p>')+(rest.length?'<h3>'+t('others')+'</h3>'+rest.map(wRow).join(''):''):'';
 document.querySelectorAll('[data-w]').forEach((b)=>b.onclick=async()=>{const r=await cmd({type:'launch',id:b.dataset.w});toast(r.ok?'▶ '+t('onpc'):t('fail'))});
 document.querySelectorAll('[data-yt]').forEach((b)=>b.onclick=()=>ytPlay(S.watch.find((x)=>x.id===b.dataset.yt)));
 document.querySelectorAll('[data-pin]').forEach((b)=>b.onclick=()=>pinWhere(S.watch.find((x)=>x.id===b.dataset.pin)));
 document.querySelectorAll('[data-site]').forEach((a)=>a.addEventListener('click',()=>{leftFor=a.dataset.site;leftAt=Date.now()}));
 document.querySelectorAll('[data-fav]').forEach((b)=>b.onclick=async()=>{const w=S.watch.find((x)=>x.id===b.dataset.fav);if(!w)return;w.fav=!w.fav;drawWatch();const r=await cmd({type:'fav',id:w.id,on:w.fav});if(!r.ok){w.fav=!w.fav;drawWatch();toast(t('fail'))}});
}
// "where did I get to", on the phone too. YouTube plays here and its minute is saved as you watch;
// other sites open in the phone's browser, where the page can't see the minute: coming back, one tap saves the episode
const ytId=(u)=>{const m=/(?:youtube\\.com\\/(?:watch\\?(?:.*&)?v=|shorts\\/|live\\/|embed\\/)|youtu\\.be\\/)([\\w-]{11})/.exec(u||'');return m?m[1]:''};
const ytAt=(u,s)=>ytId(u)&&s>5?'https://www.youtube.com/watch?v='+ytId(u)+'&t='+Math.floor(s)+'s':u;
const clk=(v)=>{v=String(v||'').trim();if(!v)return null;const p=v.split(/[:٫.]/).map((x)=>Number(x.replace(/[٠-٩]/g,(d)=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))));if(p.some(isNaN))return null;return p.length>=3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:p[0]*60};
let leftFor='',leftAt=0,ytT=0,ytApi=null;
function pinWhere(w){if(!w)return;const b=$('#wback');
 b.innerHTML='<b>📍 '+esc(t('pin'))+': '+esc(w.name)+'</b><p class="hint" style="margin:6px 0">'+esc(t('pastelink'))+'</p><div class="row"><input id="wbU" dir="ltr" inputmode="url" placeholder="https://…" style="flex:1"><button class="btn gh" id="wbP">📋</button></div><p class="hint" style="margin:8px 0 4px">'+esc(t('minute'))+'</p><input id="wbT" inputmode="numeric" placeholder="12:30" dir="ltr" style="width:110px"><div class="row" style="margin-top:10px"><button class="btn" id="wbS">'+esc(t('savebtn'))+'</button><button class="btn gh" id="wbX">✕</button></div>';
 b.hidden=false;scrollTo(0,0);
 $('#wbX').onclick=()=>{b.hidden=true};
 $('#wbP').onclick=async()=>{try{const c=await Promise.race([navigator.clipboard.readText(),new Promise((_,j)=>setTimeout(j,2500))]);if(c)$('#wbU').value=c.trim()}catch{toast(t('pastehint'))}};
 $('#wbS').onclick=async()=>{const u=$('#wbU').value.trim();if(!/^https?:\\/\\//.test(u)){toast(t('badlink'));return}const tm=clk($('#wbT').value);
  const r=await cmd({type:'webProg',id:w.id,url:u,t:tm});toast(r.ok?t('pinok'):t('fail'));if(r.ok){b.hidden=true;w.url=u;if(tm!=null)w.time=tm;drawWatch()}};}
document.addEventListener('visibilitychange',()=>{if(document.hidden||!leftFor||Date.now()-leftAt<60000)return;const w=S.watch.find((x)=>x.id===leftFor);leftFor='';if(!w)return;
 const b=$('#wback');b.innerHTML='<b>'+esc(t('wasat'))+' '+esc(w.name)+'؟</b><div class="row" style="margin-top:8px"><button class="btn" id="wbPin">📍 '+esc(t('pin'))+'</button><button class="btn gh" id="wbNo">✕</button></div>';b.hidden=false;
 $('#wbPin').onclick=()=>pinWhere(w);$('#wbNo').onclick=()=>{b.hidden=true}});
function ytPlay(w){const id=w&&ytId(w.url);if(!id)return;clearInterval(ytT);
 $('#ytp').innerHTML='<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><b>'+esc(w.name)+'</b><button class="btn gh" id="ytx">✕</button></div><div style="position:relative;padding-top:56.25%;margin-top:8px"><div id="ytf" style="position:absolute;inset:0"></div></div></div>';
 $('#ytx').onclick=()=>{save();clearInterval(ytT);$('#ytp').innerHTML=''};scrollTo(0,0);
 let pl=null;const save=()=>{try{const s=Math.floor(pl?.getCurrentTime?.()||0);const vid=pl?.getVideoData?.().video_id||id;if(s>3){w.time=s;w.url='https://www.youtube.com/watch?v='+vid;cmd({type:'webProg',id:w.id,url:w.url,t:s})}}catch{}};
 const go=()=>{pl=new YT.Player('ytf',{width:'100%',height:'100%',videoId:id,playerVars:{start:Math.floor(w.time||0),autoplay:1,playsinline:1,rel:0},events:{onStateChange:(e)=>{if(e.data===2||e.data===0)save()}}});ytT=setInterval(()=>{if(!document.getElementById('ytf'))return clearInterval(ytT);save()},10000)};
 if(window.YT?.Player)go();else{window.onYouTubeIframeAPIReady=go;if(!ytApi){ytApi=document.createElement('script');ytApi.src='https://www.youtube.com/iframe_api';document.head.appendChild(ytApi)}}}
let pt=0;function playHere(sh,e){const vp=$('#vp');vp.innerHTML='<b>'+esc(e.name)+'</b><video controls playsinline autoplay src="/ep/'+e.id+'?k='+K+'"></video>';const v=vp.querySelector('video');
 v.onloadedmetadata=()=>{if(e.t&&e.t<v.duration-20)v.currentTime=e.t};clearInterval(pt);pt=setInterval(()=>{if(!v.isConnected)return clearInterval(pt);if(v.duration&&!v.paused){e.t=v.currentTime;e.d=v.duration;cmd({type:'epProg',ep:e.id,t:Math.floor(v.currentTime),d:Math.floor(v.duration)})}},5000);
 v.onended=()=>{cmd({type:'epProg',ep:e.id,t:Math.floor(v.duration),d:Math.floor(v.duration)});const n=sh.eps[sh.eps.indexOf(e)+1];if(n)playHere(sh,n)};scrollTo(0,0);}
const mmss=(n)=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
function drawShots(){const l=S.shots||[];
 /* one shelf per game, the game with the newest capture first */
 const by=new Map();l.forEach((x,i)=>{const g=x.game||t('other');if(!by.has(g))by.set(g,[]);by.get(g).push(i)});
 const tileOf=(x,i)=>'<button class="g wide" data-sh="'+i+'"><span class="ini">'+(x.video?'▶':'🖼')+'</span>'+pimg(x.pic,'')+(x.video?'<i class="play">▶</i>'+(x.dur?'<b class="dur">'+mmss(x.dur)+'</b>':''):'')+(x.src==='razer'?'<b class="src rz">Razer</b>':x.src==='kairos'?'<b class="src">Kairos</b>':'')+'</button>';
 $('#sg').innerHTML=l.length?[...by].map(([g,ix])=>'<h3 class="shh">'+esc(g)+' <small>'+ix.length+'</small></h3><div class="grid sg">'+ix.map((i)=>tileOf(l[i],i)).join('')+'</div>').join(''):'<p class="hint">'+t('none')+'</p>';
 document.querySelectorAll('[data-sh]').forEach((b)=>b.onclick=()=>openShot(l[Number(b.dataset.sh)]));}
function openShot(x){const sv=$('#sv');const src='/ep/'+x.id+'?k='+K;
 sv.innerHTML=(RELAY?(x.video?'<img id="svi" alt=""><p class="hint">'+t('awayclip2')+'</p>':'<img id="svi">'):(x.video?'<video controls playsinline autoplay src="'+src+'"></video>':'<img src="'+src+'">'))+'<b>'+esc(x.game)+(x.dur?' • '+mmss(x.dur):'')+'</b><div id="dlp" hidden><b class="bar"><i></i></b><small></small></div><div class="row">'+(RELAY&&x.video?'<button class="btn" id="shq">⚡ '+t('fastdl')+'</button>':'')+'<button class="btn'+(RELAY&&x.video?' gh':'')+'" id="shd">⬇ '+t(RELAY&&x.video?'origdl':'save')+'</button><button class="btn gh" id="shc">☁️</button><button class="btn gh" id="shx">✕</button></div>';sv.hidden=false;
 if(RELAY)call('img',{id:x.pic}).then((r)=>{if(r&&r.d&&$('#svi'))$('#svi').src=r.d});
 $('#shx').onclick=()=>{sv.hidden=true;sv.innerHTML='';dlStop=true};
 $('#shc').onclick=async()=>{$('#shc').disabled=true;const r=await cmd({type:'toCloud',ep:x.id});toast(r.ok?t('cloudok'):(r.msg||t('fail')))};
 $('#shd').onclick=()=>getFile(x,false,$('#shd'));if($('#shq'))$('#shq').onclick=()=>getFile(x,true,$('#shq'));}
/* ⬇ the file comes to the phone in pieces (through the relay when away), then you pick where it goes: Photos, Files, any app */
let dlStop=false,dlBlob=null,dlName='';
/* the download keeps what it already got: if you leave the app and it stops, it carries on from the same spot when you're back */
let DL=null,wl=null;
const keepAwake=async(on)=>{try{if(on&&!wl&&navigator.wakeLock){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null})}else if(!on&&wl){wl.release();wl=null}}catch{}};
const dlProg=(via)=>{if(!$('#dlp'))return;const d=DL,pct=Math.round(d.got/d.size*100),sp=(d.got-d.g0)/Math.max(.5,(Date.now()-d.t0)/1000);$('#dlp i').style.width=pct+'%';$('#dlp small').textContent=via+' '+pct+'% • '+mb(d.got)+' / '+mb(d.size)+(sp>0?' • '+Math.max(1,Math.round((d.size-d.got)/sp))+' '+t('secleft'):'')};
const dlPush=(u)=>{DL.parts.push(u);DL.got+=u.byteLength};
async function getFile(x,small,b){const key=x.id+(small?':s':'');if(dlBlob&&dlName===x.name+(small?':s':'')){return saveBlob()}document.querySelectorAll('#shd,#shq').forEach((y)=>{if(y!==b)y.hidden=true});
 if(!RELAY){const a=document.createElement('a');a.href='/ep/'+x.id+'?k='+K+'&dl=1';a.download=x.name;document.body.appendChild(a);a.click();a.remove();return}
 b.disabled=true;dlStop=false;$('#dlp').hidden=false;
 if(!DL||DL.key!==key){$('#dlp small').textContent=t('preparing');
  const info=await cmd({type:'fileInfo',id:x.id,small:!!small});if(!info.ok){toast(info.msg||t('fail'));b.disabled=false;$('#dlp').hidden=true;return}
  DL={key,x,small,b,size:info.size,sha:info.sha,mime:info.mime,name:info.name,parts:[],got:0,run:false,fails:0,tries:0}}
 DL.b=b;return dlRun()}
async function dlRun(){const d=DL;if(!d||d.run||dlStop)return;d.run=true;keepAwake(true);d.t0=Date.now();d.g0=d.got;
 try{while(d.got<d.size&&!dlStop&&DL===d){
  if(!d.noDirect){$('#dlp small').textContent=t('linking');const r=await directGet(d).catch(()=>'x');if(r==='none')d.noDirect=true;if(d.got>=d.size||dlStop)break;if(r==='ok')continue;if(document.hidden)break}
  const ok=await relayGet(d);if(!ok){if(document.hidden)break;if(++d.fails>3){toast(t('fail'));break}}}
 }finally{d.run=false;keepAwake(false)}
 if(dlStop||DL!==d||!$('#dlp'))return;d.b.disabled=false;
 if(d.got>=d.size){const blob=new Blob(d.parts,{type:d.mime});
  /* make sure it arrived exactly as sent; if not, fetch it again the plain way */
  if(d.sha&&window.crypto&&crypto.subtle){$('#dlp small').textContent=t('checking');let same=true;try{const h=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());same=[...new Uint8Array(h)].map((v)=>v.toString(16).padStart(2,'0')).join('')===d.sha}catch{}
   cmd({type:'dlCheck',name:d.name,ok:same,via:d.noDirect?'relay':'direct',ua:navigator.userAgent}).catch(()=>{});
   if(!same&&d.tries<2){d.tries++;d.parts=[];d.got=0;d.noDirect=true;toast(t('again'));return dlRun()}}
  dlBlob=blob;dlName=d.x.name+(d.small?':s':'');d.x.saveAs=d.name;DL=null;d.b.hidden=false;d.b.textContent='💾 '+t('savenow');$('#dlp i').style.width='100%';$('#dlp small').textContent='✓ '+mb(dlBlob.size);if(document.hidden)try{navigator.vibrate&&navigator.vibrate(200)}catch{}}
 else $('#dlp small').textContent='⏸ '+Math.round(d.got/d.size*100)+'% • '+t('willgo')}
/* back in the app, or the net came back: carry on by itself */
['visibilitychange','pageshow','online'].forEach((e)=>(e==='visibilitychange'?document:window).addEventListener(e,()=>{if(!document.hidden&&DL&&!DL.run&&!dlStop)setTimeout(dlRun,400)}));
/* four pieces travel at once over the relay (each waits on the relay, so together they fill the line) */
async function relayGet(d){const CH=384*1024,base=d.got,n=Math.ceil((d.size-base)/CH),have=new Map();let next=0,flushed=0,bad=false;
 const flush=()=>{while(have.has(flushed)){dlPush(have.get(flushed));have.delete(flushed);flushed++}dlProg('🌍')};
 const one=async(i)=>{let r=null;for(let k=0;k<4&&!(r&&r.ok)&&!dlStop;k++)r=await cmd({type:'fileChunk',id:d.x.id,small:!!d.small,off:base+i*CH,len:CH});if(!r||!r.ok){bad=true;return}
  const bin=atob(r.d),u=new Uint8Array(bin.length);for(let q=0;q<bin.length;q++)u[q]=bin.charCodeAt(q);have.set(i,u);flush()};
 const worker=async()=>{while(!bad&&!dlStop&&next<n&&DL===d){await one(next++)}};
 await Promise.all([worker(),worker(),worker(),worker()]);return !bad&&d.got>=d.size}
/* ⚡ direct line to the PC (WebRTC): 'ok' finished, 'x' broke midway (try again), 'none' can't link on this network */
async function directGet(d){if(!window.RTCPeerConnection)return 'none';
 const pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun.cloudflare.com:3478']}]});
 const done=()=>{try{pc.close()}catch{}};
 try{const ch=pc.createDataChannel('f',{ordered:true});ch.binaryType='arraybuffer';
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((r)=>{if(pc.iceGatheringState==='complete')return r();const tm=setTimeout(r,4000);pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(tm);r()}}});
  const a=await call('rtc',{sdp:pc.localDescription.sdp});if(!a||!a.ok||!a.sdp){done();return 'none'}
  await pc.setRemoteDescription({type:'answer',sdp:a.sdp});
  const open=await new Promise((r)=>{if(ch.readyState==='open')return r(true);const tm=setTimeout(()=>r(false),9000);ch.onopen=()=>{clearTimeout(tm);r(true)}});
  if(!open){done();return 'none'}
  return await new Promise((res)=>{let last=Date.now(),fin=false;const end=(v)=>{if(fin)return;fin=true;clearInterval(watch);done();res(v)};
   const watch=setInterval(()=>{if(dlStop||DL!==d||Date.now()-last>15000)end('x')},1000);
   ch.onmessage=(m)=>{last=Date.now();if(typeof m.data==='string'){const q=JSON.parse(m.data);if(q.t==='end')end(d.got>=d.size?'ok':'x');else if(q.t==='err')end('x');return}
    dlPush(new Uint8Array(m.data));dlProg('⚡')};
   ch.onclose=()=>end(d.got>=d.size?'ok':'x');
   ch.send(JSON.stringify({t:'get',id:d.x.id,small:!!d.small,off:d.got}))});
 }catch(e){done();return 'x'}}
async function saveBlob(){const nm=dlName.replace(/:s$/,'');const f=new File([dlBlob],nm,{type:dlBlob.type});
 if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});return}catch(e){if(e&&e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(dlBlob);a.download=nm;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);}
$('#go').onclick=async()=>{const l=$('#mag').value.trim();if(!/^magnet:/i.test(l))return toast('magnet:…');const r=await cmd({type:'magnet',link:l});toast(r.ok?t('dlstart'):t('fail'));if(r.ok)$('#mag').value='';};
// the fixed address (pc-name.local): offer it once it answers, so the saved home-screen app keeps working if the PC's address changes
let fixChecked=false;async function checkFixed(s){if(RELAY||fixChecked||!s.host||location.hostname===s.host)return;fixChecked=true;try{const r=await fetch('http://'+s.host+':'+s.port+'/api/ping?k='+K,{mode:'cors'});const j=await r.json();if(j.ok)$('#fix').innerHTML='<div class="ban"><b>'+t('fixed')+'</b><a class="btn" href="http://'+s.host+':'+s.port+'/?k='+K+'">'+t('use')+'</a></div>';}catch{}}
$('#tl').onclick=async(e)=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;if((a==='cancel'||a==='remove'||(a==='pause'&&b.dataset.k==='s'))&&b.dataset.arm!=='1'){b.dataset.arm='1';b._t=b.textContent;b.textContent=t(a==='pause'?'pauseall':'sure2');setTimeout(()=>{if(b.isConnected){b.dataset.arm='';b.textContent=b._t}},4000);return;}
 b.disabled=true;const r=await cmd(b.dataset.k==='s'?{type:'steamAct',id:b.dataset.id,act:a}:{type:'torAct',id:b.dataset.id,act:a});toast(r.msg||(r.ok?t('pcok'):t('fail')));setTimeout(poll,1500);};
$('#dlc').onclick=async()=>{const r=await cmd({type:'dlClear'});toast(r.ok?t('cleared'):t('fail'));setTimeout(poll,1500);};
const mb=(n)=>n>1073741824?(n/1073741824).toFixed(1)+' GB':Math.max(1,Math.round(n/1048576))+' MB';
function drawFiles(){const l=S.shared||[];if(document.querySelector('#fl [data-arm="1"]'))return;$('#fl').innerHTML=l.length?l.map((f)=>'<div class="t"><span>'+(f.video?'🎬 ':'📄 ')+esc(f.name)+'<small> '+mb(f.size)+(f.up?' • ☁️ '+t('uploading'):'')+'</small></span><span class="ctl">'+(RELAY?'':'<a class="btn gh" href="/ep/'+f.id+'?k='+K+'&dl=1" download>⬇</a>')+'<button class="btn gh" data-fdel="'+f.id+'">🗑</button></span></div>').join(''):'<p class="hint">'+t('noshared')+'</p>';
 document.querySelectorAll('[data-fdel]').forEach((b)=>b.onclick=async()=>{if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=t('sure2');setTimeout(()=>{if(b.isConnected){b.dataset.arm='';b.textContent='🗑'}},4000);return;}const r=await cmd({type:'sharedDel',id:b.dataset.fdel});toast(r.ok?t('deleted'):t('fail'));b.dataset.arm='';setTimeout(poll,800)});}
$('#brv').checked=brave;$('#brv').onchange=()=>{brave=$('#brv').checked;try{localStorage.setItem('sbBrave',brave?'1':'0')}catch{}drawWatch();toast(brave?t('braveon'):t('braveoff'))};
/* 🔒 PIN for the PC controls: asked once, kept on this phone */
let PIN='';try{PIN=localStorage.getItem('sbPin')||''}catch{}
function askPin(r){$('#pinbox').hidden=false;$('#pinmsg').textContent=r&&r.msg?r.msg:t('pinh');$('#pinrow').hidden=!!(r&&(r.needPin==='unset'||r.needPin==='locked'));if(!$('#pinrow').hidden)setTimeout(()=>$('#pin').focus(),50);if(r&&r.needPin==='wrong'){PIN='';try{localStorage.removeItem('sbPin')}catch{}}}
let busyAt=0;const scmd=(o)=>!PIN?(askPin(),Promise.resolve({ok:false,needPin:'ask'})):cmd(Object.assign({},o,{pin:PIN})).then((r)=>{if(r&&r.needPin){askPin(r);if(scrOn)scrStop()}if(r&&r.busy&&Date.now()-busyAt>2500){busyAt=Date.now();toast(r.msg)}return r});
$('#pingo').onclick=async()=>{const v=$('#pin').value.replace(/[٠-٩]/g,(d)=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,(d)=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[ ]/g,'');if(!v)return;const r=await cmd({type:'pinCheck',pin:v});if(r.ok){PIN=v;try{localStorage.setItem('sbPin',v)}catch{}$('#pinbox').hidden=true;$('#pin').value='';toast(t('pinok2'))}else{$('#pinmsg').textContent=r.msg||t('fail')}};
$('#pinx').onclick=()=>{$('#pinbox').hidden=true};
$('#pin').onkeydown=(e)=>{if(e.key==='Enter')$('#pingo').click()};
document.querySelector('.tabs [data-t=pc]').addEventListener('click',()=>{if(!PIN)askPin()});
/* 👁 screen: frames only while you look at it */
let scrOn=false,scrTouch=0;
async function scrLoop(){while(scrOn){if(document.hidden||$('#pc').hidden||Date.now()-scrTouch>180000){scrStop();break}const r=await scmd({type:'screen',w:RELAY?720:1280});if(!scrOn)break;if(r&&r.d)$('#scr').src=r.d;await new Promise((z)=>setTimeout(z,RELAY?700:250))}}
function scrStop(){scrOn=false;$('#scrbox').hidden=true;$('#scrgo').textContent=t('scron')}
$('#scrgo').onclick=()=>{if(scrOn){scrStop();return}scrOn=true;scrTouch=Date.now();$('#scrbox').hidden=false;$('#scrgo').textContent=t('scroff');scrLoop()};
$('#scr').onclick=(e)=>{const r=$('#scr').getBoundingClientRect();scrTouch=Date.now();scmd({type:'input',a:'abs',x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}).then(()=>scmd({type:'input',a:'click',b:'l'}))};
/* 🖱 touchpad: moves are added up and sent one at a time, so nothing piles up */
const tp=$('#tp');let tl=null,tacc={x:0,y:0,w:0},tbusy=false,tmoved=false,tstart=0,tfing=0;
const tavg=(ts)=>{let x=0,y=0;for(const q of ts){x+=q.clientX;y+=q.clientY}return{x:x/ts.length,y:y/ts.length}};
async function tflush(){if(tbusy)return;const x=Math.round(tacc.x),y=Math.round(tacc.y),w=Math.trunc(tacc.w);if(!x&&!y&&!w)return;tbusy=true;tacc.x-=x;tacc.y-=y;tacc.w-=w;if(w)await scmd({type:'input',a:'wheel',n:w});if(x||y)await scmd({type:'input',a:'rel',x,y});tbusy=false;tflush()}
tp.addEventListener('touchstart',(e)=>{e.preventDefault();tfing=Math.max(tfing,e.touches.length);if(e.touches.length===e.changedTouches.length){tfing=e.touches.length;tmoved=false;tstart=Date.now()}tl=tavg(e.touches);scrTouch=Date.now()},{passive:false});
tp.addEventListener('touchmove',(e)=>{e.preventDefault();const c=tavg(e.touches);const dx=c.x-tl.x,dy=c.y-tl.y;tl=c;if(Math.abs(dx)+Math.abs(dy)>1.5)tmoved=true;if(e.touches.length>=2)tacc.w-=dy/18;else{const f=Math.min(3.2,1.6+Math.hypot(dx,dy)/12);tacc.x+=dx*f;tacc.y+=dy*f}tflush()},{passive:false});
tp.addEventListener('touchend',(e)=>{e.preventDefault();if(e.touches.length)return;if(!tmoved&&Date.now()-tstart<300)scmd({type:'input',a:'click',b:tfing>=2?'r':'l'});tfing=0},{passive:false});
document.querySelectorAll('[data-ck]').forEach((b)=>b.onclick=()=>scmd({type:'input',a:'click',b:b.dataset.ck}));
document.querySelectorAll('[data-k]').forEach((b)=>b.onclick=()=>scmd({type:'input',a:'key',k:b.dataset.k}));
$('#kbgo').onclick=async()=>{const v=$('#kb').value;if(!v)return;const r=await scmd({type:'input',a:'text',t:v});if(r.ok)$('#kb').value='';else toast(t('fail'))};
$('#kb').onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();$('#kbgo').click()}};
/* ⏱ play time */
$('#playl').onchange=async()=>{const r=await cmd({type:'playLimit',min:Number($('#playl').value)});toast(r.ok?t('limitset'):t('fail'))};
/* 🌙 night & 🔄 updates */
$('#ngt').onchange=$('#ngf').onchange=async()=>{const r=await cmd({type:'nightSet',on:$('#ngt').checked,from:Number($('#ngf').value)});if(!r.ok)toast(t('fail'))};
$('#updgo').onclick=async()=>{const b=$('#updgo');if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=t('updsure');setTimeout(()=>{b.dataset.arm='';b.textContent=t('updall')},4000);return}b.dataset.arm='';b.textContent=t('updall');const r=await cmd({type:'steamUpdate'});toast(r.msg||(r.ok?t('pcok'):t('fail')));setTimeout(poll,2000)};
$('#clipto').onclick=async()=>{let v=$('#clip').value;if(!v){try{v=await Promise.race([navigator.clipboard.readText(),new Promise((z)=>setTimeout(()=>z(''),2500))])}catch{v=''}}if(!v){toast(t('clipempty'));$('#clip').focus();return}const r=await scmd({type:'clipSet',text:v});if(r.ok){toast(t('clipsent'));$('#clip').value=''}else if(!r.needPin)toast(t('fail'))};
$('#clipfrom').onclick=async()=>{const r=await scmd({type:'clipGet'});if(!r.ok)return;$('#clip').value=r.text||'';let ok=false;try{await navigator.clipboard.writeText(r.text||'');ok=true}catch{}toast(r.text?(ok?t('clipgot'):t('clipshown')):t('clipnone'))};
function drawExtra(){const dv=S.devices||[];const ago=(x)=>{const m=Math.round((Date.now()-x)/60000);return m<2?t('now'):m<60?m+' '+t('minago'):Math.round(m/60)+' '+t('hago')};$('#devl').innerHTML=dv.map((d)=>'<div class="t"><span>'+(d.via==='wifi'?'🏠 ':'🌍 ')+esc(d.name)+(d.me?' <small>('+t('thisdev')+')</small>':'')+'</span><i style="font-weight:400;color:var(--dim)">'+ago(d.last)+'</i></div>').join('');const p=S.play||{};const hm=(m)=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');$('#playn').textContent=t('playmin')+' '+hm(p.min||0)+(p.limit?' / '+hm(p.limit):'');if(document.activeElement!==$('#playl'))$('#playl').value=String(p.limit||0);
 const n=S.night||{};if(document.activeElement!==$('#ngt'))$('#ngt').checked=!!n.on;if(document.activeElement!==$('#ngf'))$('#ngf').value=String(n.from??0);$('#ngq').innerHTML=(n.q||[]).length?'<p class="hint">'+t('nightq')+'</p>'+n.q.map((x,i)=>'<div class="t"><span>🌙 '+esc(x)+'</span><button class="btn gh" data-nq="'+i+'">✕</button></div>').join(''):'';
 document.querySelectorAll('[data-nq]').forEach((b)=>b.onclick=async()=>{await cmd({type:'nightDel',i:Number(b.dataset.nq)});poll()});
 const u=S.updates||[];$('#updc').hidden=!u.length;$('#updl').innerHTML=u.map((x)=>'<div class="t"><span>🎮 '+esc(x.name)+(x.size?'<small> '+gb(x.size)+'</small>':'')+'</span></div>').join('');}
function drawPc(){const p=S.pc||{};$('#pcg').textContent=p.game?t('pcgame')+' '+p.game:t('pcidle');$('[data-pca=kill]').hidden=!p.game;$('[data-pca=cancel]').hidden=!p.shut;}
document.querySelectorAll('[data-pca]').forEach((b)=>b.onclick=async()=>{const a=b.dataset.pca;if(a!=='lock'&&a!=='cancel'&&b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=t('sure');clearTimeout(b._a);b._a=setTimeout(()=>{b.dataset.arm='';b.textContent=t(b.dataset.i)},4000);return;}clearTimeout(b._a);b.dataset.arm='';b.textContent=t(b.dataset.i);const r=await scmd({type:'pc',act:a});toast(r.ok?(r.msg||t('pcok')):(r.msg||t('fail')));poll();});
let first=true,fails=0,lastKey='';async function poll(){try{const s=await call('state');if(!s||!Array.isArray(s.games))throw new Error('closed');fails=0;$('#off').hidden=true;
const key=JSON.stringify([s.lang,s.games.map((g)=>g.id+g.pic),(s.lib||[]).map((g)=>g.id+g.state+Math.round(g.pct||0)),(s.watch||[]).map((w)=>w.id+w.time+(w.fav?'*':'')),(s.shows||[]).map((x)=>x.dir+x.eps.length),(s.shots||[]).map((x)=>x.id),(s.steam||[]).map((x)=>x.id+x.st+x.pct)]);
S=s;S.shots||=[];S.lib||=[];S.watch||=[];S.shows||=[];if(first||s.lang!==document.documentElement.lang)lang(s.lang||'ar');$('#who').textContent=s.name?'· '+t('hi')+' '+s.name:'';
if(RELAY&&s.page&&/^[0-9a-f]{40}$/.test(s.page)&&location.pathname.indexOf(s.page)<0&&!sessionStorage.getItem('sbup'+s.page)){try{sessionStorage.setItem('sbup'+s.page,'1')}catch{}location.replace('https://raw.githack.com/xkai7k/silver-bullet/'+s.page+'/docs/remote.html?k='+K);return;}
drawPc();drawFiles();drawExtra();if(key!==lastKey){lastKey=key;drawGames();drawShots();if(!document.querySelector('#vp video'))drawWatch();}
if(first){first=false;try{const tb=localStorage.getItem('sbtab');if(tb)document.querySelector('.tabs [data-t="'+tb+'"]')?.click()}catch{}}
const ctl=(k,id,paused)=>'<span class="ctl"><button class="btn gh" data-k="'+k+'" data-id="'+esc(id)+'" data-a="'+(paused?'resume':'pause')+'">'+(paused?'▶':'⏸')+'</button><button class="btn gh" data-k="'+k+'" data-id="'+esc(id)+'" data-a="'+(k==='s'?'cancel':'remove')+'">✕</button></span>';
if(!document.querySelector('#tl [data-arm="1"]'))$('#tl').innerHTML=(s.steam||[]).map((x)=>'<div class="t"><span>🎮 '+esc(x.name)+(x.total?'<small> '+gb(x.done)+' / '+gb(x.total)+'</small>':'')+'<b class="bar"><i style="width:'+x.pct+'%"></i></b></span><i>'+(x.st==='done'?'✓':x.st==='queued'?t('queued'):x.st==='paused'?'⏸ '+x.pct+'%':x.pct+'%')+'</i>'+(x.st==='done'?'':ctl('s',x.id,x.st==='paused'))+'</div>').join('')+(s.torrents||[]).map((x)=>'<div class="t"><span>'+esc(x.title)+'<b class="bar"><i style="width:'+Math.round(x.pct||0)+'%"></i></b></span><i>'+(x.state==='done'?'✓':x.state==='dead'?t('dead'):(x.paused?'⏸ ':'')+Math.round(x.pct||0)+'%')+'</i>'+(x.state==='downloading'?ctl('t',x.id,x.paused):'')+'</div>').join('')||'<p class="hint">'+t('nodl')+'</p>';checkFixed(s);}
catch{if(++fails>=2){$('#off').innerHTML=esc(t('offline'))+(RELAY?'':' <a class="btn" style="margin-top:8px" href="/start?k='+K+'">▶ '+esc(t('startpc'))+'</a>');$('#off').hidden=false;}}}
// put it on the phone's home screen, like an app (asked once; ✕ hides it for good)
(()=>{const box=$('#inst');let ev=null;const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 let off=false;try{off=!!localStorage.getItem('sbInst')}catch{}if(standalone||off)return;
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
 const draw=()=>{box.innerHTML='<div class="row" style="justify-content:space-between;align-items:center"><b>📲 '+esc(t('instc'))+'</b><button class="btn gh" id="instX">✕</button></div><p class="hint" style="margin:6px 0 0">'+esc(ev?t('insta'):ios?t('instios'):t('instand'))+'</p>'+(ev?'<button class="btn" id="instGo" style="margin-top:8px">'+esc(t('instgo'))+'</button>':'');box.hidden=false;
  $('#instX').onclick=()=>{box.hidden=true;try{localStorage.setItem('sbInst','1')}catch{}};
  const g=$('#instGo');if(g)g.onclick=async()=>{ev.prompt();try{await ev.userChoice}catch{}box.hidden=true;try{localStorage.setItem('sbInst','1')}catch{}}};
 window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();ev=e;draw()});setTimeout(draw,1500);})();
lang('ar');poll();setInterval(poll,3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
</script></body></html>`;
}
module.exports.page = page;
