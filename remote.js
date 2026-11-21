// "التحكم من الجوال": a small page on your home Wi-Fi. Open it on the phone (QR in Settings) and you can
// start a game, control the music and its volume, and start a download — while the PC does the work.
// Only reachable on the same network, and only with the secret key in the link.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function setupRemote({ ipcMain, app, log, getWin, mediaAsk, mediaKey, setVolume, torAdd, lanAddress, qrSvgOf }) {
  const PORT = 8766;
  const cfgFile = path.join(app.getPath('userData'), 'remote.json');
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch {}
  if (!cfg.key) { cfg.key = crypto.randomBytes(9).toString('hex'); try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {} }
  let server = null, state = { games: [], name: '', torrents: [] };
  const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

  const send = (cmd) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('remote:cmd', cmd); };
  const json = (res, o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

  function start() {
    if (server) return true;
    server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://x');
        if (u.searchParams.get('k') !== cfg.key) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('الرابط غلط أو قديم: صوّر الباركود من جديد (الإعدادات ← الجوال).'); }
        if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(page()); }
        if (u.pathname === '/api/state') {
          const m = await mediaAsk('get', 4000).catch(() => null);
          return json(res, { ...state, music: m && m.ok && !m.none ? { title: m.title, artist: m.artist, playing: !!m.playing } : null, vol: cfg.vol ?? 50 });
        }
        const im = /^\/img\/([\w-]+)$/.exec(u.pathname);
        if (im) {
          const g = state.games.find((x) => x.id === im[1]);
          const p = g?.imgPath;
          if (!p || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
          res.writeHead(200, { 'Content-Type': IMG[path.extname(p).toLowerCase()] || 'image/jpeg', 'Cache-Control': 'max-age=3600' });
          return fs.createReadStream(p).pipe(res);
        }
        if (u.pathname === '/api/cmd' && req.method === 'POST') {
          const c = await body(req);
          if (c.type === 'launch' && c.id) { send({ type: 'launch', id: String(c.id) }); return json(res, { ok: true }); }
          if (c.type === 'media' && /^(playpause|next|prev)$/.test(c.key)) { await mediaKey(c.key); return json(res, { ok: true }); }
          if (c.type === 'volume') { const v = Math.max(0, Math.min(100, Math.round(Number(c.level) || 0))); cfg.vol = v; try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {} const r = await setVolume(v, 'spotify'); if (r === 'none') await setVolume(v, 'master'); return json(res, { ok: true, vol: v }); }
          if (c.type === 'magnet' && /^magnet:\?/i.test(c.link || '')) { const r = await torAdd(c.link); send({ type: 'toast', msg: '📱 بدأ تحميل من الجوال' }); return json(res, r || { ok: false }); }
          if (c.type === 'say' && c.text) { send({ type: 'say', text: String(c.text).slice(0, 120) }); return json(res, { ok: true }); }
          return json(res, { ok: false, error: 'unknown' }, 400);
        }
        res.writeHead(404); res.end();
      } catch (e) { log('remote error', e.message); try { json(res, { ok: false }, 500); } catch {} }
    });
    server.on('error', (e) => { log('remote server failed', e.message); server = null; });
    server.listen(PORT, '0.0.0.0', () => log('phone remote on', lanAddress(), PORT));
    return true;
  }
  function stop() { try { server?.close(); } catch {} server = null; }
  const url = () => `http://${lanAddress() || 'localhost'}:${PORT}/?k=${cfg.key}`;

  ipcMain.handle('remote:set', (_e, on) => { cfg.on = !!on; try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {} if (on) start(); else stop(); return { on: !!on, url: url(), qr: on ? qrSvgOf(url()) : '' }; });
  ipcMain.handle('remote:info', () => ({ on: !!cfg.on, url: url(), qr: cfg.on ? qrSvgOf(url()) : '' }));
  ipcMain.handle('remote:newkey', () => { cfg.key = crypto.randomBytes(9).toString('hex'); try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {} return { on: !!cfg.on, url: url(), qr: cfg.on ? qrSvgOf(url()) : '' }; });
  ipcMain.on('remote:state', (_e, s) => { if (s && Array.isArray(s.games)) state = s; });
  if (cfg.on) start();

  function page() {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d0f14"><meta name="apple-mobile-web-app-capable" content="yes"><title>Silver Bullet</title><style>
:root{--bg:#0d0f14;--card:#171a22;--line:#262b37;--text:#eef1f6;--dim:#9aa3b2;--acc:#e8c26a}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif}
header{position:sticky;top:0;z-index:3;background:#0d0f14ee;backdrop-filter:blur(10px);padding:14px 16px 8px}
h1{margin:0;font-size:20px}h1 small{color:var(--dim);font-weight:400;font-size:13px}
.tabs{display:flex;gap:6px;margin-top:10px}.tabs button{flex:1;padding:10px;border-radius:12px;border:0;background:var(--card);color:var(--text);font:inherit;font-weight:700}.tabs button.on{background:var(--acc);color:#1a1408}
main{padding:12px 16px 40px}input{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:#0f1218;color:var(--text);font:inherit;font-size:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;margin-top:12px}
.g{position:relative;border:0;padding:0;border-radius:12px;overflow:hidden;aspect-ratio:3/4;background:linear-gradient(160deg,#2a3142,#141820);color:#fff;font:inherit;text-align:center}
.g img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.g span{position:absolute;inset:auto 0 0;padding:18px 6px 6px;font-size:12px;font-weight:700;background:linear-gradient(transparent,rgba(0,0,0,.85))}
.g.go{outline:3px solid var(--acc)}.card{background:var(--card);border-radius:16px;padding:16px;margin-top:12px}
.now b{display:block;font-size:18px}.now small{color:var(--dim)}.ctrl{display:flex;justify-content:center;gap:16px;margin:14px 0}
.ctrl button{width:62px;height:62px;border-radius:50%;border:0;background:#222735;color:#fff;font-size:22px}.ctrl .pp{background:#1ed760;color:#000;width:72px;height:72px}
input[type=range]{padding:0;height:34px;accent-color:#1ed760;border:0;background:none}.row{display:flex;gap:8px}.row button{padding:12px 16px;border-radius:12px;border:0;background:var(--acc);font-weight:800}
.t{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}.t i{font-style:normal;color:var(--acc);font-weight:800}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#222735;padding:10px 16px;border-radius:12px;opacity:0;transition:opacity .2s}.toast.show{opacity:1}
.hint{color:var(--dim);font-size:13px;line-height:1.6}
</style></head><body>
<header><h1>🎮 Silver Bullet <small id="who"></small></h1><div class="tabs"><button data-t="games" class="on">ألعاب</button><button data-t="music">موسيقى</button><button data-t="dl">تحميل</button></div></header>
<main>
<section id="games"><input id="q" type="search" placeholder="دوّر على لعبة…"><div class="grid" id="grid"></div></section>
<section id="music" hidden><div class="card now"><b id="mt">—</b><small id="ma"></small></div>
<div class="ctrl"><button data-k="prev">⏮</button><button data-k="playpause" class="pp">⏯</button><button data-k="next">⏭</button></div>
<div class="card"><b>🔊 الصوت <span id="vv"></span></b><input type="range" id="vol" min="0" max="100" step="1"></div></section>
<section id="dl" hidden><div class="card"><b>🧲 ابدأ تحميل</b><p class="hint">الصق رابط magnet وأنا أبدأ التحميل في الكمبيوتر.</p><div class="row"><input id="mag" placeholder="magnet:?xt=…" dir="ltr"><button id="go">ابدأ</button></div></div>
<div class="card"><b>⬇ التحميلات</b><div id="tl"></div></div></section>
</main><div class="toast" id="toast"></div>
<script>
const K=new URLSearchParams(location.search).get('k');const $=(s)=>document.querySelector(s);let S={games:[]};
const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast=(m)=>{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)};
const cmd=(o)=>fetch('/api/cmd?k='+K,{method:'POST',body:JSON.stringify(o)}).then((r)=>r.json()).catch(()=>({ok:false}));
document.querySelectorAll('.tabs button').forEach((b)=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach((x)=>x.classList.toggle('on',x===b));for(const s of ['games','music','dl'])$('#'+s).hidden=s!==b.dataset.t;});
function drawGames(){const q=$('#q').value.trim().toLowerCase();$('#grid').innerHTML=S.games.filter((g)=>!q||g.name.toLowerCase().includes(q)).map((g)=>'<button class="g" data-id="'+g.id+'">'+(g.img?'<img loading="lazy" src="'+(g.imgPath?'/img/'+g.id+'?k='+K:esc(g.img))+'" onerror="this.remove()">':'')+'<span>'+esc(g.name)+'</span></button>').join('')||'<p class="hint">ما فيه ألعاب</p>';
document.querySelectorAll('.g').forEach((b)=>b.onclick=async()=>{b.classList.add('go');const r=await cmd({type:'launch',id:b.dataset.id});toast(r.ok?'▶ تشتغل في الكمبيوتر':'ما قدرت');setTimeout(()=>b.classList.remove('go'),1500)});}
$('#q').oninput=drawGames;
document.querySelectorAll('[data-k]').forEach((b)=>b.onclick=()=>{cmd({type:'media',key:b.dataset.k});setTimeout(poll,800)});
let vt;$('#vol').oninput=(e)=>{$('#vv').textContent=e.target.value;clearTimeout(vt);vt=setTimeout(()=>cmd({type:'volume',level:Number(e.target.value)}),250)};
$('#go').onclick=async()=>{const l=$('#mag').value.trim();if(!/^magnet:/i.test(l))return toast('الصق رابط يبدأ بـ magnet:');const r=await cmd({type:'magnet',link:l});toast(r.ok?'🧲 بدأ التحميل':'ما قدرت');if(r.ok)$('#mag').value='';};
let first=true;async function poll(){try{const s=await (await fetch('/api/state?k='+K)).json();const changed=JSON.stringify(s.games.map((g)=>g.id))!==JSON.stringify(S.games.map((g)=>g.id));S=s;$('#who').textContent=s.name?'· هلا '+s.name:'';if(changed)drawGames();
$('#mt').textContent=s.music?.title||'ما فيه شي شغّال';$('#ma').textContent=s.music?.artist||'';if(first){$('#vol').value=s.vol;$('#vv').textContent=s.vol;first=false;}
$('#tl').innerHTML=(s.torrents||[]).map((t)=>'<div class="t"><span>'+esc(t.title)+'</span><i>'+(t.state==='done'?'✓':t.state==='dead'?'ميت':Math.round(t.pct||0)+'%')+'</i></div>').join('')||'<p class="hint">ما فيه تحميلات</p>';}catch{}}
poll();setInterval(poll,3000);
</script></body></html>`;
  }
  return { start, stop };
};
