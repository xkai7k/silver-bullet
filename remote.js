// "التحكم من الجوال": a small page on your home Wi-Fi. Open it on the phone (QR in Settings) and you can
// start a game, pick up a series on the PC or right on the phone/iPad, start a download
// from your torrent library — while the PC does the work.
// Only reachable on your network, and only with the secret key in the link.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

module.exports = function setupRemote({ ipcMain, app, net, log, wakeHelper, getWin, mediaAsk, mediaKey, setVolume, torAdd, lanAddress, qrSvgOf, pcAction, pcInfo, steamInstall, steamDl, steamClear }) {
  const PORT = 8766;
  const cfgFile = path.join(app.getPath('userData'), 'remote.json');
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8').replace(/^\uFEFF/, '')); } catch {}
  const saveCfg = () => { try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {} };
  if (!cfg.key) { cfg.key = crypto.randomBytes(9).toString('hex'); saveCfg(); }
  let server = null, state = { games: [], lib: [], watch: [], shows: [], name: '', torrents: [], lang: 'ar' };
  let imgs = new Map(), eps = new Map(); // id -> picture source / episode file (only these can be read from the phone)
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
  function sendVideo(req, res, file, dl) {
    let st; try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end(); }
    const type = VID[path.extname(file).toLowerCase()] || IMG[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (dl) head['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`;
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

  // what the phone can ask: the state, or a command. Used by the page on your Wi-Fi and by the internet link (through the app)
  async function api(kind, c = {}) {
    if (kind === 'state') {
      return { ...state, host: host(), port: PORT, pc: pcInfo?.() || {}, steam: steamDl?.() || [], page: pageSha }; // music isn't on the phone page any more: no Spotify lookup on every refresh
    }
    c = c || {};
    if (c.type === 'webProg' && c.id && /^https?:\/\//i.test(c.url || '')) { send({ type: 'webProg', id: String(c.id), url: String(c.url).slice(0, 2000), t: Number.isFinite(c.t) && c.t >= 0 ? Math.floor(c.t) : null }); return ({ ok: true }); }
    if (c.type === 'pc' && /^(lock|sleep|shutdown|cancel|kill)$/.test(c.act || '')) { const r = (await pcAction?.(c.act)) || { ok: false }; if (r.ok) send({ type: 'toast', msg: '📱 ' + (r.msg || c.act) }); return r; }
    if (c.type === 'install' && c.id) {
      const g = (state.lib || []).find((x) => x.id === String(c.id) && x.owned);
      if (!g) return { ok: false };
      if (!g.sid) return { ok: false, msg: 'هذي مو من ستيم، ما أقدر أحمّلها من بعيد' };
      const r = (await steamInstall?.(g.sid, g.name)) || { ok: false };
      if (r.ok) send({ type: 'toast', msg: '📱 ' + r.msg });
      return r;
    }
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
    if (c.type === 'torDl' && c.id) { send({ type: 'torDl', id: String(c.id) }); return ({ ok: true }); }
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
        if (u.pathname === '/api/state') return json(res, await api('state'));
        const im = /^\/img\/([\w-]+)$/.exec(u.pathname);
        if (im) return sendImg(res, imgs.get(im[1]));
        const ev = /^\/ep\/([\w-]+)$/.exec(u.pathname);
        if (ev) { const f = eps.get(ev[1]); if (!f) { res.writeHead(404); return res.end(); } if (IMG[path.extname(f.file).toLowerCase()] && u.searchParams.get('dl') !== '1') return sendImg(res, f.file); return sendVideo(req, res, f.file, u.searchParams.get('dl') === '1'); }
        if (u.pathname === '/api/cmd' && req.method === 'POST') { const r = await api('cmd', await body(req)); return json(res, r, r.code || 200); }
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
  const info = () => ({ on: !!cfg.on, url: url(), fixed: `http://${host()}:${PORT}/?k=${cfg.key}`, qr: cfg.on ? qrSvgOf(url()) : '', net: !!cfg.net, ntfyOn: !!cfg.ntfyOn, ntfy: cfg.ntfy || '', key: cfg.key, netUrl: netUrl(), netQr: cfg.on && cfg.net ? qrSvgOf(netUrl()) : '' });

  ipcMain.handle('remote:call', (_e, kind, c) => (!(cfg.on && cfg.net) ? { ok: false, error: 'off' } : kind === 'img' ? thumb(imgs.get(String(c?.id || ''))) : api(kind === 'state' ? 'state' : 'cmd', c)));
  // a small JPEG of a picture, as text (the relay carries text only); kept so the next phone gets it at once
  const thumbs = new Map();
  async function thumb(src) {
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
      const sz = im.getSize(); if (sz.width > 240) im = im.resize({ width: 240, quality: 'good' });
      const d = 'data:image/jpeg;base64,' + im.toJPEG(72).toString('base64');
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
  ipcMain.handle('remote:newkey', () => { cfg.key = crypto.randomBytes(9).toString('hex'); saveCfg(); if (cfg.on) try { wakeHelper?.(false); setTimeout(() => wakeHelper?.(true, cfg.key, PORT), 1500); } catch {} return info(); });
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
    for (const x of s.shots || []) { const id = hid(x.file); ne.set(id, { file: x.file, shot: true }); x.id = id; x.name = path.basename(x.file); delete x.file; }
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
main{padding:12px 16px calc(40px + env(safe-area-inset-bottom))}input{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:#0f1218;color:var(--text);font:inherit;font-size:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;margin-top:12px}
.g{position:relative;border:0;padding:0;border-radius:12px;overflow:hidden;aspect-ratio:3/4;background:linear-gradient(160deg,hsl(var(--h,220) 30% 26%),#141820);color:#fff;font:inherit;text-align:center}
.g.wide{aspect-ratio:16/10}.g img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.g .ini{position:absolute;inset:0;display:grid;place-items:center;font-size:34px;font-weight:800;opacity:.5}
.g span{position:absolute;inset:auto 0 0;padding:18px 6px 6px;font-size:12px;font-weight:700;background:linear-gradient(transparent,rgba(0,0,0,.88));unicode-bidi:plaintext}
.g em{position:absolute;top:6px;inset-inline-start:6px;font-style:normal;font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.6)}
.g.go{outline:3px solid var(--acc)}.card{background:var(--card);border-radius:16px;padding:16px;margin-top:12px}
.now b{display:block;font-size:18px}.now small{color:var(--dim)}.ctrl{display:flex;justify-content:center;gap:16px;margin:14px 0}
.ctrl button{width:62px;height:62px;border-radius:50%;border:0;background:#222735;color:#fff;font-size:22px}.ctrl .pp{background:#1ed760;color:#000;width:72px;height:72px}
input[type=range]{padding:0;height:34px;accent-color:#1ed760;border:0;background:none}.row{display:flex;gap:8px;flex-wrap:wrap}.row>button:not(.opt):not(.sw):not(.gh),.btn{padding:11px 14px;border-radius:12px;border:0;background:var(--acc);color:#1a1408;font:inherit;font-weight:800;text-decoration:none;display:inline-block}
.btn.gh{background:#222735;color:var(--text)}
.t{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}.t i{font-style:normal;color:var(--acc);font-weight:800}.t span{flex:1;min-width:0}.t small{color:var(--dim);font-weight:400}.t .bar{display:block;height:5px;border-radius:3px;background:var(--line);margin-top:6px;overflow:hidden}.t .bar i{display:block;height:100%;background:var(--acc)}
.it{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.it img,.it .ph{width:54px;height:54px;border-radius:12px;object-fit:cover;background:#222735;flex:none;display:grid;place-items:center;font-size:22px}
.it div{flex:1;min-width:0}.it b{display:block;unicode-bidi:plaintext}.it small{color:var(--dim);font-size:12px;display:block;unicode-bidi:plaintext;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.it .row{flex-wrap:nowrap}.it .btn{padding:8px 10px;font-size:13px}
.ep{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}.ep b{flex:1;font-weight:600;unicode-bidi:plaintext}.ep .bar{height:3px;background:#2a2f3d;border-radius:3px;overflow:hidden;margin-top:6px}.ep .bar i{display:block;height:100%;background:var(--acc)}
.ep.done b{opacity:.55}.ep .btn{padding:7px 10px;font-size:12px}
video{width:100%;border-radius:12px;background:#000;margin-top:10px}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#222735;padding:10px 16px;border-radius:12px;opacity:0;transition:opacity .2s;pointer-events:none}.toast.show{opacity:1}
.hint{color:var(--dim);font-size:13px;line-height:1.6}.ban{background:#22314a;border-radius:12px;padding:10px 12px;margin-top:10px;font-size:13px;display:flex;gap:8px;align-items:center}.ban b{flex:1}
.off{position:fixed;inset:auto 12px calc(12px + env(safe-area-inset-bottom));background:#3a1518;color:#ffd0d0;padding:12px;border-radius:12px;font-size:14px;text-align:center}
.sg{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}.sg .g{aspect-ratio:16/10}.sv{position:fixed;inset:0;z-index:9;background:#000e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}.sv img,.sv video{max-width:100%;max-height:75vh;border-radius:10px}.sv .row{justify-content:center}
.pcb{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.pcb .btn{padding:14px 8px;font-size:15px}.pcb [data-arm="1"]{background:#b3402e!important;color:#fff!important}
.sw{width:34px;height:34px;border-radius:50%;border:2px solid transparent!important;padding:0!important}.sw.on,.opt.on{border-color:var(--acc)!important}.opt{padding:8px 12px;border-radius:12px;border:2px solid var(--line);background:none;color:var(--text);font:inherit}
</style></head><body>
<header><h1>🎮 Silver Bullet <small id="who"></small></h1>
<div class="tabs"><button data-t="games" class="on" data-i="games"></button><button data-t="watch" data-i="watch"></button><button data-t="dl" data-i="dl"></button><button data-t="shots" data-i="shots"></button><button data-t="pc" data-i="pc"></button></div></header>
<main>
<div id="fix"></div><div id="inst" class="card" hidden></div>
<section id="games"><div class="sub"><button data-g="inst" class="on" data-i="inst"></button><button data-g="lib" data-i="lib"></button></div>
<input id="q" type="search" style="margin-top:10px"><div class="grid" id="grid"></div></section>
<section id="watch" hidden><div id="wback" class="card" hidden></div><div id="ytp"></div><div id="wsh"></div><div id="wst"></div></section>
<section id="dl" hidden><div class="card"><b>🧲 <span data-i="startdl"></span></b><p class="hint" data-i="maghint"></p><div class="row"><input id="mag" placeholder="magnet:?xt=…" dir="ltr" style="flex:1"><button id="go" data-i="go"></button></div></div>
<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><b>⬇ <span data-i="dls"></span></b><button class="btn gh" id="dlc" data-i="clearall"></button></div><div id="tl"></div></div></section>
<section id="shots" hidden><p class="hint" data-i="shothint"></p><div class="grid sg" id="sg"></div><div id="sv" class="sv" hidden></div></section>
<section id="pc" hidden><div class="card"><b>💻 <span data-i="pcnow"></span></b><p class="hint" id="pcg"></p><div class="pcb"><button class="btn" data-pc="lock" data-i="lock"></button><button class="btn" data-pc="sleep" data-i="sleep"></button><button class="btn" data-pc="kill" data-i="kill" hidden></button><button class="btn" data-pc="shutdown" data-i="shut"></button><button class="btn gh" data-pc="cancel" data-i="cancel" hidden></button></div><p class="hint" data-i="pchint"></p></div></section>
</main><div class="toast" id="toast"></div><div class="off" id="off" hidden></div>
<script>
const RELAY=${relay ? 'true' : 'false'};const K=new URLSearchParams(location.search).get('k');const $=(s)=>document.querySelector(s);let S={games:[],lib:[],watch:[],shows:[]},gt='inst',openShow=null;
try{localStorage.setItem('sbk',K)}catch{}
const T={ar:{games:'🎮 ألعاب',watch:'🎬 مشاهدة',dl:'⬇ تحميل',clearall:'🧹 نظّف الكل',cleared:'✓ نظّفت القائمة',queued:'⏳ بالطابور',pc:'💻 الجهاز',pcnow:'جهازك',pcgame:'شغّال الحين:',pcidle:'ما فيه لعبة شغّالة',lock:'🔒 قفل الشاشة',sleep:'😴 سكون',kill:'✖ سكّر اللعبة',shut:'⏻ إطفاء',cancel:'↩ ألغِ الإطفاء',sure:'متأكد؟ اضغط مرة ثانية',pcok:'تم',pchint:'الإطفاء يصير بعد دقيقة، وتقدر تلغيه من هنا قبلها.',shots:'📸 لقطاتي',shothint:'اضغط أي لقطة تشوفها كبيرة، وبعدها ⬇ تنحفظ في جوالك (في الآيفون: اضغط مطولاً على الصورة ← حفظ).',inst:'مثبتة',lib:'مكتبتي',search:'دوّر على لعبة…',none:'ما فيه شي هنا',vol:'الصوت',startdl:'ابدأ تحميل',maghint:'الصق رابط magnet وأنا أبدأ التحميل في الكمبيوتر.',go:'ابدأ',dls:'التحميلات',nodl:'ما فيه تحميلات',onpc:'يشتغل في الكمبيوتر',fail:'ما قدرت',lunch:'▶ في الكمبيوتر',cont:'كمّل هنا',here:'▶ هنا',down:'⬇ نزّلها',back:'→ رجوع',sites:'📺 مواقعك',favs:'⭐ المفضلة',others:'📺 الباقي',nofav:'اضغط ☆ جنب أي موقع عشان يطلع هنا.',favt:'مفضلة',instc:'حطه على شاشة جوالك',instios:'من زر المشاركة تحت ← "إضافة إلى الشاشة الرئيسية". يصير له أيقونة ويفتح مثل التطبيق.',instand:'من ⋮ فوق ← "إضافة إلى الشاشة الرئيسية". يصير له أيقونة ويفتح مثل التطبيق.',insta:'يصير له أيقونة ويفتح مثل التطبيق.',instgo:'📲 ثبّته',savebtn:'احفظ',pastehint:'اضغط مطولاً على الخانة واختر لصق',pin:'وين وصلت',pastelink:'رابط الحلقة اللي وصلتها (من المتصفح: مشاركة ← نسخ الرابط، وبعدين 📋)',usecopied:'أحفظ الرابط اللي نسخته؟',minute:'الدقيقة (اختياري)',pinok:'✓ انحفظ، الكمبيوتر بيكمل من هنا',badlink:'هذا مو رابط',wasat:'وين وصلت في',shows:'🎞️ مسلسلاتي',ep:'حلقة',nomusic:'ما فيه شي شغّال',hi:'هلا',dlstart:'⬇ بدأ التحميل في الكمبيوتر',install:'⬇ نزّل',saved:'محفوظ',dead:'ميت',fixed:'📌 فيه رابط ثابت ما يتغير لو تغيّر عنوان الكمبيوتر',use:'استخدمه',offline:'البرنامج مو متصل… لو الكمبيوتر شغّال تقدر تشغّله من هنا',startpc:'شغّل البرنامج',nomkv:'لو ما اشتغلت هنا (mkv) نزّلها وافتحها بـ VLC',hat:'على الراس',color:'لونه',hair:'الشعر',kind:'الشكل',boy:'👦 ولد',girl:'👧 بنت',def:'افتراضي',okk:'تم ✓',wtch:'🌐 كمّل بالمتصفح',onpcw:'🖥 افتحه بالكمبيوتر'},
en:{games:'🎮 Games',watch:'🎬 Watch',dl:'⬇ Downloads',clearall:'🧹 Clear all',cleared:'✓ List cleared',queued:'⏳ Queued',pc:'💻 PC',pcnow:'Your PC',pcgame:'Running now:',pcidle:'No game running',lock:'🔒 Lock',sleep:'😴 Sleep',kill:'✖ Close game',shut:'⏻ Shut down',cancel:'↩ Cancel shutdown',sure:'Sure? Tap again',pcok:'Done',pchint:'Shutdown waits one minute, and you can cancel it from here.',shots:'📸 Captures',shothint:'Tap a capture to see it big, then ⬇ saves it to your phone (iPhone: long-press the picture → Save).',inst:'Installed',lib:'Library',search:'Search games…',none:'Nothing here',vol:'Volume',startdl:'Start a download',maghint:'Paste a magnet link and the PC starts downloading.',go:'Start',dls:'Downloads',nodl:'No downloads',onpc:'Starting on the PC',fail:'Could not do it',lunch:'▶ On PC',cont:'Continue here',here:'▶ Here',down:'⬇ Download',back:'← Back',sites:'📺 Your sites',favs:'⭐ Favourites',others:'📺 Everything else',nofav:'Tap ☆ next to a site to pin it here.',favt:'Favourite',instc:'Put it on your home screen',instios:'Share button → "Add to Home Screen". It gets an icon and opens like an app.',instand:'⋮ menu → "Add to Home screen". It gets an icon and opens like an app.',insta:'It gets an icon and opens like an app.',instgo:'📲 Install',savebtn:'Save',pastehint:'Long-press the box and choose Paste',pin:'Where I got to',pastelink:'Link of the episode you reached (browser: Share → Copy link, then 📋)',usecopied:'Save the link you copied?',minute:'Minute (optional)',pinok:'✓ Saved, the PC will continue from here',badlink:'That is not a link',wasat:'Where did you get to in',shows:'🎞️ My shows',ep:'episodes',nomusic:'Nothing playing',hi:'Hi',dlstart:'⬇ Download started on the PC',install:'⬇ Get',saved:'Saved',dead:'Dead',fixed:'📌 A fixed link exists that keeps working if the PC address changes',use:'Use it',offline:'The app is not reachable… if the PC is on you can start it from here',startpc:'Start the app',nomkv:'If it will not play here (mkv), download it and open it in VLC',hat:'Headwear',color:'Colour',hair:'Hair',kind:'Look',boy:'👦 Boy',girl:'👧 Girl',def:'Default',okk:'Done ✓',wtch:'🌐 Continue in browser',onpcw:'🖥 Open on PC'}};
let L=T.ar;const t=(k)=>L[k]||T.ar[k]||k;
function lang(l){L=T[l]||T.ar;document.documentElement.lang=l;document.documentElement.dir=l==='en'?'ltr':'rtl';document.querySelectorAll('[data-i]').forEach((e)=>e.textContent=t(e.dataset.i));$('#q').placeholder=t('search');}
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hue=(s)=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))%360,7);
const img=(p,w)=>RELAY?(w||''):(p?'/img/'+p+'?k='+K:'');
/* from anywhere, pictures kept on the PC come through the relay as small thumbnails (and stand in for web pictures that fail) */
const pimg=(p,w)=>{if(!RELAY)return p?'<img loading="lazy" src="/img/'+p+'?k='+K+'" onerror="this.remove()">':'';if(w)return '<img loading="lazy" src="'+esc(w)+'"'+(p?' data-fb="'+p+'"':'')+' onerror="rpFail(this)">';return p?'<img data-rp="'+p+'" alt="">':'';};
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
function call(kind,body){if(!RELAY)return kind==='state'?fetch('/api/state?k='+K,{cache:'no-store'}).then((r)=>r.json()):fetch('/api/cmd?k='+K,{method:'POST',body:JSON.stringify(body)}).then((r)=>r.json());
 return new Promise((res,rej)=>{const go=()=>{const id=++cid;calls.set(id,{res,rej});try{ws.send(JSON.stringify({type:'CANDIDATE',dst:'sbr-'+K,payload:{type:'data',candidate:{candidate:'',sdpMid:'0',sdpMLineIndex:0},sb:{t:'api',id,kind,body},connectionId:'sb'}}))}catch(err){}setTimeout(()=>{if(calls.has(id)){calls.delete(id);parts.delete(id);rej(new Error('timeout'))}},15000)};wsOpen?go():wq.push(go)});}
const cmd=(o)=>call('cmd',o).catch(()=>({ok:false}));
document.querySelectorAll('.tabs button').forEach((b)=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach((x)=>x.classList.toggle('on',x===b));for(const s of ['games','watch','dl','shots','pc'])$('#'+s).hidden=s!==b.dataset.t;try{localStorage.setItem('sbtab',b.dataset.t)}catch{}});
document.querySelectorAll('[data-g]').forEach((b)=>b.onclick=()=>{gt=b.dataset.g;document.querySelectorAll('[data-g]').forEach((x)=>x.classList.toggle('on',x===b));drawGames();});
const tile=(g,extra)=>'<button class="g" style="--h:'+hue(g.name)+'" data-id="'+esc(g.id)+'" data-kind="'+(g.tor?'tor':g.owned?'own':'game')+'"><span class="ini">'+esc((g.name||'?')[0])+'</span>'+pimg(g.pic,g.web)+(extra?'<em>'+extra+'</em>':'')+'<span>'+esc(g.name)+'</span></button>';
const gb=(n)=>(n/1073741824).toFixed(n>10737418240?0:1)+' GB';
const sdl=(g)=>g.sid&&(S.steam||[]).find((x)=>x.id===g.sid);
const sbadge=(g)=>{const d=sdl(g);return !d?'📚':d.st==='done'?'✓':d.total?d.pct+'%':'⏳'};
function drawGames(){const q=$('#q').value.trim().toLowerCase();const list=(gt==='inst'?S.games:S.lib).filter((g)=>!q||g.name.toLowerCase().includes(q));
$('#grid').innerHTML=list.map((g)=>tile(g,g.tor?(g.state==='downloading'?Math.round(g.pct||0)+'%':g.state==='saved'?'🧲':''):g.owned?sbadge(g):'')).join('')||'<p class="hint">'+t('none')+'</p>';
document.querySelectorAll('#grid .g').forEach((b)=>b.onclick=async()=>{b.classList.add('go');const k=b.dataset.kind;const r=await cmd(k==='tor'?{type:'torDl',id:b.dataset.id}:k==='own'?{type:'install',id:b.dataset.id}:{type:'launch',id:b.dataset.id});toast(r.msg||(r.ok?(k==='tor'?t('dlstart'):'▶ '+t('onpc')):t('fail')));if(r.ok&&(k==='own'||k==='tor'))setTimeout(()=>{document.querySelector('.tabs [data-t=dl]')?.click();poll()},1800);setTimeout(()=>b.classList.remove('go'),1500)});}
$('#q').oninput=drawGames;
function drawWatch(){
 if(openShow){const sh=S.shows.find((x)=>x.dir===openShow);if(!sh){openShow=null;return drawWatch();}
$('#wst').innerHTML='';$('#wsh').innerHTML='<div class="row" style="align-items:center"><button class="btn gh" id="wb">'+t('back')+'</button><b style="flex:1">'+esc(sh.name)+'</b></div><div id="vp"></div>'+(RELAY?'':'<p class="hint">'+t('nomkv')+'</p>')+''+sh.eps.map((e)=>{const p=e.d?Math.min(100,Math.round(e.t/e.d*100)):0;return '<div class="ep '+(p>90?'done':'')+'"><div style="flex:1;min-width:0"><b>'+esc(e.name)+'</b>'+(p?'<div class="bar"><i style="width:'+p+'%"></i></div>':'')+'</div><button class="btn" data-here="'+e.id+'">'+t('here')+'</button><button class="btn gh" data-pc="'+e.id+'">🖥</button><a class="btn gh" href="/ep/'+e.id+'?k='+K+'&dl=1" download>⬇</a></div>'}).join('');
$('#wb').onclick=()=>{openShow=null;drawWatch()};
document.querySelectorAll('[data-pc]').forEach((b)=>b.onclick=async()=>{const r=await cmd({type:'showPlay',ep:b.dataset.pc});toast(r.ok?'▶ '+t('onpc'):t('fail'))});
document.querySelectorAll('[data-here]').forEach((b)=>b.onclick=()=>playHere(sh,sh.eps.find((e)=>e.id===b.dataset.here)));return;}
 $('#wsh').innerHTML=S.shows.length?'<h3>'+t('shows')+'</h3><div class="grid">'+S.shows.map((sh)=>'<button class="g" style="--h:'+hue(sh.name)+'" data-show="'+sh.dir+'"><span class="ini">'+esc(sh.name[0])+'</span>'+pimg(sh.pic,sh.web)+'<em>'+sh.eps.filter((e)=>e.d&&e.t/e.d>.9).length+'/'+sh.eps.length+'</em><span>'+esc(sh.name)+'</span></button>').join('')+'</div>':'';
 document.querySelectorAll('[data-show]').forEach((b)=>b.onclick=()=>{openShow=b.dataset.show;drawWatch();scrollTo(0,0)});
 const wRow=(w)=>'<div class="it">'+(img(w.pic,w.web)?'<img src="'+img(w.pic,w.web)+'" onerror="this.replaceWith(Object.assign(document.createElement(\\'span\\'),{className:\\'ph\\',textContent:\\'🎬\\'}))">':'<span class="ph">🎬</span>')+'<div><b>'+esc(w.name)+'</b><small>'+esc([w.note,w.time?'⏱ '+clock(w.time):''].filter(Boolean).join(' • '))+'</small></div><div class="row"><button class="btn gh" data-fav="'+esc(w.id)+'" title="'+esc(t('favt'))+'">'+(w.fav?'⭐':'☆')+'</button>'+(ytId(w.url)?'<button class="btn gh" data-yt="'+esc(w.id)+'">'+t('here')+'</button>':'')+(w.url?'<a class="btn gh" data-site="'+esc(w.id)+'" target="_blank" rel="noopener" href="'+esc(ytAt(w.url,w.time))+'">🌐</a>':'')+(w.url&&!ytId(w.url)?'<button class="btn gh" data-pin="'+esc(w.id)+'" title="'+esc(t('pin'))+'">📍</button>':'')+'<button class="btn" data-w="'+esc(w.id)+'">🖥</button></div></div>';
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
function drawShots(){const l=S.shots||[];$('#sg').innerHTML=l.map((x,i)=>'<button class="g" data-sh="'+i+'">'+(x.video?'<span class="ini">▶</span>':'<img loading="lazy" src="/ep/'+x.id+'?k='+K+'" onerror="this.remove()">')+'<span>'+esc(x.game||x.name)+'</span></button>').join('')||'<p class="hint">'+t('none')+'</p>';
 document.querySelectorAll('[data-sh]').forEach((b)=>b.onclick=()=>{const x=l[Number(b.dataset.sh)];const sv=$('#sv');const src='/ep/'+x.id+'?k='+K;sv.innerHTML=(x.video?'<video controls playsinline autoplay src="'+src+'"></video>':'<img src="'+src+'">')+'<b>'+esc(x.game)+'</b><div class="row"><a class="btn" href="'+src+'&dl=1" download="'+esc(x.name)+'">⬇</a>'+(navigator.share?'<button class="btn gh" id="shs">📤</button>':'')+'<button class="btn gh" id="shx">✕</button></div>';sv.hidden=false;$('#shx').onclick=()=>{sv.hidden=true;sv.innerHTML=''};const sh=$('#shs');if(sh)sh.onclick=async()=>{try{const bl=await (await fetch(src+'&dl=1')).blob();await navigator.share({files:[new File([bl],x.name,{type:bl.type})]})}catch{}};});}
$('#go').onclick=async()=>{const l=$('#mag').value.trim();if(!/^magnet:/i.test(l))return toast('magnet:…');const r=await cmd({type:'magnet',link:l});toast(r.ok?t('dlstart'):t('fail'));if(r.ok)$('#mag').value='';};
// the fixed address (pc-name.local): offer it once it answers, so the saved home-screen app keeps working if the PC's address changes
let fixChecked=false;async function checkFixed(s){if(RELAY||fixChecked||!s.host||location.hostname===s.host)return;fixChecked=true;try{const r=await fetch('http://'+s.host+':'+s.port+'/api/ping?k='+K,{mode:'cors'});const j=await r.json();if(j.ok)$('#fix').innerHTML='<div class="ban"><b>'+t('fixed')+'</b><a class="btn" href="http://'+s.host+':'+s.port+'/?k='+K+'">'+t('use')+'</a></div>';}catch{}}
$('#dlc').onclick=async()=>{const r=await cmd({type:'dlClear'});toast(r.ok?t('cleared'):t('fail'));setTimeout(poll,1500);};
function drawPc(){const p=S.pc||{};$('#pcg').textContent=p.game?t('pcgame')+' '+p.game:t('pcidle');$('[data-pc=kill]').hidden=!p.game;$('[data-pc=cancel]').hidden=!p.shut;}
document.querySelectorAll('[data-pc]').forEach((b)=>b.onclick=async()=>{const a=b.dataset.pc;if(a!=='lock'&&a!=='cancel'&&b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent=t('sure');clearTimeout(b._a);b._a=setTimeout(()=>{b.dataset.arm='';b.textContent=t(b.dataset.i)},4000);return;}clearTimeout(b._a);b.dataset.arm='';b.textContent=t(b.dataset.i);const r=await cmd({type:'pc',act:a});toast(r.ok?(r.msg||t('pcok')):(r.msg||t('fail')));poll();});
let first=true,fails=0,lastKey='';async function poll(){try{const s=await call('state');if(!s||!Array.isArray(s.games))throw new Error('closed');fails=0;$('#off').hidden=true;
const key=JSON.stringify([s.lang,s.games.map((g)=>g.id+g.pic),(s.lib||[]).map((g)=>g.id+g.state+Math.round(g.pct||0)),(s.watch||[]).map((w)=>w.id+w.time+(w.fav?'*':'')),(s.shows||[]).map((x)=>x.dir+x.eps.length),(s.shots||[]).map((x)=>x.id),(s.steam||[]).map((x)=>x.id+x.st+x.pct)]);
S=s;S.shots||=[];S.lib||=[];S.watch||=[];S.shows||=[];if(first||s.lang!==document.documentElement.lang)lang(s.lang||'ar');$('#who').textContent=s.name?'· '+t('hi')+' '+s.name:'';
if(RELAY&&s.page&&/^[0-9a-f]{40}$/.test(s.page)&&location.pathname.indexOf(s.page)<0&&!sessionStorage.getItem('sbup'+s.page)){try{sessionStorage.setItem('sbup'+s.page,'1')}catch{}location.replace('https://raw.githack.com/xkai7k/silver-bullet/'+s.page+'/docs/remote.html?k='+K);return;}
drawPc();if(key!==lastKey){lastKey=key;drawGames();drawShots();if(!document.querySelector('#vp video'))drawWatch();}
if(first){first=false;try{const tb=localStorage.getItem('sbtab');if(tb)document.querySelector('.tabs [data-t="'+tb+'"]')?.click()}catch{}}
$('#tl').innerHTML=(s.steam||[]).map((x)=>'<div class="t"><span>🎮 '+esc(x.name)+(x.total?'<small> '+gb(x.done)+' / '+gb(x.total)+'</small>':'')+'<b class="bar"><i style="width:'+x.pct+'%"></i></b></span><i>'+(x.st==='done'?'✓':x.st==='queued'?t('queued'):x.st==='paused'?'⏸ '+x.pct+'%':x.pct+'%')+'</i></div>').join('')+(s.torrents||[]).map((x)=>'<div class="t"><span>'+esc(x.title)+'</span><i>'+(x.state==='done'?'✓':x.state==='dead'?t('dead'):Math.round(x.pct||0)+'%')+'</i></div>').join('')||'<p class="hint">'+t('nodl')+'</p>';checkFixed(s);}
catch{if(++fails>=2){$('#off').innerHTML=esc(t('offline'))+(RELAY?'':' <a class="btn" style="margin-top:8px" href="/start?k='+K+'">▶ '+esc(t('startpc'))+'</a>');$('#off').hidden=false;}}}
// put it on the phone's home screen, like an app (asked once; ✕ hides it for good)
(()=>{const box=$('#inst');let ev=null;const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 let off=false;try{off=!!localStorage.getItem('sbInst')}catch{}if(standalone||off)return;
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
 const draw=()=>{box.innerHTML='<div class="row" style="justify-content:space-between;align-items:center"><b>📲 '+esc(t('instc'))+'</b><button class="btn gh" id="instX">✕</button></div><p class="hint" style="margin:6px 0 0">'+esc(ev?t('insta'):ios?t('instios'):t('instand'))+'</p>'+(ev?'<button class="btn" id="instGo" style="margin-top:8px">'+esc(t('instgo'))+'</button>':'');box.hidden=false;
  $('#instX').onclick=()=>{box.hidden=true;try{localStorage.setItem('sbInst','1')}catch{}};
  const g=$('#instGo');if(g)g.onclick=async()=>{ev.prompt();try{await ev.userChoice}catch{}box.hidden=true;try{localStorage.setItem('sbInst','1')}catch{}}};
 window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();ev=e;draw()});setTimeout(draw,1500);})();
if(RELAY){const b=document.querySelector('[data-t=shots]');if(b)b.hidden=true;}lang('ar');poll();setInterval(poll,3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
</script></body></html>`;
}
module.exports.page = page;
