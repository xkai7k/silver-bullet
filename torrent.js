// Torrents: drop a .torrent file (or paste a magnet link) and it downloads with aria2 (a small, open
// source downloader fetched once from its official GitHub releases). When it finishes, game files are
// handed to the console-games importer, so they land in the library ready to play.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function setupTorrents(ctx) {
  const { ipcMain, app, net, log, download, run, EMU_ROOT, getWin, importGame } = ctx;
  const TOOL = path.join(EMU_ROOT, '_tools', 'aria2');
  const OUT = path.join(app.getPath('downloads'), 'Silver Bullet Torrents');
  const PORT = process.env.SB_TEST === '1' ? 6816 : 6815, SECRET = crypto.randomBytes(8).toString('hex');
  let proc = null, starting = null, poll = 0;
  const send = (m) => { try { getWin()?.webContents.send('tor:progress', m); } catch {} };

  async function exe() {
    const found = (function find(d, depth) {
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
      for (const e of ents) if (e.isFile() && /^aria2c\.exe$/i.test(e.name)) return path.join(d, e.name);
      if (depth > 0) for (const e of ents) if (e.isDirectory()) { const f = find(path.join(d, e.name), depth - 1); if (f) return f; }
      return null;
    })(TOOL, 2);
    if (found) return found;
    send({ status: 'setup' });
    const rel = await (await net.fetch('https://api.github.com/repos/aria2/aria2/releases/latest', { headers: { 'User-Agent': 'SilverBullet' } })).json();
    const a = (rel.assets || []).find((x) => /win-64bit.*\.zip$/i.test(x.name));
    if (!a) throw new Error('aria2 build not found');
    fs.mkdirSync(TOOL, { recursive: true });
    const zip = path.join(app.getPath('temp'), 'sb-aria2.zip');
    await download(a.browser_download_url, zip, () => {});
    const r = await run('tar', ['-xf', zip, '-C', TOOL]);
    try { fs.unlinkSync(zip); } catch {}
    if (r.code !== 0) throw new Error('unzip aria2: ' + r.err);
    log('aria2 ready', a.name);
    return exe();
  }
  async function rpc(method, params = []) {
    const res = await net.fetch(`http://127.0.0.1:${PORT}/jsonrpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'sb', method, params: [`token:${SECRET}`, ...params] }) });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }
  async function ensure() {
    if (proc) return;
    if (starting) return starting;
    starting = (async () => {
      const bin = await exe();
      fs.mkdirSync(OUT, { recursive: true });
      const sess = path.join(TOOL, 'session.txt'); if (!fs.existsSync(sess)) fs.writeFileSync(sess, '');
      const trackers = ['udp://tracker.opentrackr.org:1337/announce', 'udp://open.stealth.si:80/announce', 'udp://tracker.torrent.eu.org:451/announce', 'udp://exodus.desync.com:6969/announce',
        'udp://tracker.openbittorrent.com:6969/announce', 'udp://open.demonii.com:1337/announce', 'udp://explodie.org:6969/announce', 'udp://tracker.dler.org:6969/announce',
        'udp://tracker.tiny-vps.com:6969/announce', 'udp://tracker.theoks.net:6969/announce', 'udp://tracker.qu.ax:6969/announce', 'udp://tracker.0x7c0.com:6969/announce',
        'udp://opentracker.io:6969/announce', 'udp://tracker.bittor.pw:1337/announce', 'udp://public.popcorn-tracker.org:6969/announce', 'udp://tracker.moeking.me:6969/announce',
        'udp://p4p.arenabg.com:1337/announce', 'udp://tracker.cyberia.is:6969/announce', 'https://tracker.tamersunion.org:443/announce', 'http://tracker.openbittorrent.com:80/announce'].join(',');
      proc = spawn(bin, ['--enable-rpc', `--rpc-listen-port=${PORT}`, `--rpc-secret=${SECRET}`, '--rpc-listen-all=false', `--dir=${OUT}`,
        '--seed-time=0', '--continue=true', '--max-concurrent-downloads=1', '--bt-max-peers=200', '--follow-torrent=mem', '--file-allocation=none',
        '--summary-interval=0', '--console-log-level=warn',
        '--enable-dht=true', '--enable-dht6=true', '--disk-cache=64M', '--bt-request-peer-speed-limit=50M', '--bt-tracker-connect-timeout=10', '--bt-tracker-interval=120', '--bt-max-open-files=200', '--bt-enable-lpd=true', '--enable-peer-exchange=true', '--listen-port=6881-6889', '--dht-listen-port=6881-6889',
        `--dht-file-path=${path.join(TOOL, 'dht.dat')}`, '--bt-save-metadata=true', '--check-certificate=false', `--bt-tracker=${trackers}`,
        `--input-file=${sess}`, `--save-session=${sess}`, '--save-session-interval=20', '--force-save=false', '--max-connection-per-server=8', '--split=8'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      proc.stderr.on('data', (d) => log('aria2:', String(d).slice(0, 200)));
      proc.on('exit', (c) => { log('aria2 exited', c); proc = null; clearInterval(poll); poll = 0; });
      for (let i = 0; i < 30; i++) { try { await rpc('aria2.getVersion'); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
      if (!poll) poll = setInterval(tick, 1500);
    })().finally(() => { starting = null; });
    return starting;
  }
  const finished = new Set();
  async function tick() {
    try {
      const keys = ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'numSeeders', 'connections', 'files', 'bittorrent', 'errorMessage', 'followedBy'];
      const list = [...await rpc('aria2.tellActive', [keys]), ...await rpc('aria2.tellWaiting', [0, 20, keys]), ...await rpc('aria2.tellStopped', [0, 20, keys])];
      const items = list.filter((x) => !(x.followedBy && x.followedBy.length)).map((x) => ({
        gid: x.gid, status: x.status, name: x.bittorrent?.info?.name || path.basename(x.files?.[0]?.path || '') || decodeURIComponent(String(x.files?.[0]?.uris?.[0]?.uri || '').split('/').pop().split('?')[0]) || 'تحميل',
        total: Number(x.totalLength), done: Number(x.completedLength), speed: Number(x.downloadSpeed), peers: Number(x.numSeeders || x.connections || 0), error: x.errorMessage,
      }));
      send({ status: 'list', items });
      // nobody sharing it: say so instead of sitting at 0% forever
      tick.zero ||= {};
      for (const i of items) {
        if (i.status !== 'active' || i.done > 0 || i.peers > 0) { delete tick.zero[i.gid]; continue; }
        tick.zero[i.gid] ||= Date.now();
        if (Date.now() - tick.zero[i.gid] > 2 * 60e3 && !tick.zero[i.gid + 'told']) { tick.zero[i.gid + 'told'] = 1; log('torrent has no peers', i.name); rpc('aria2.remove', [i.gid]).then(() => rpc('aria2.removeDownloadResult', [i.gid])).catch(() => {}); send({ status: 'dead', name: i.name }); }
      }
      const sig = items.map((i) => `${i.name}:${i.status}:${Math.round(i.done / 1048576)}MB/${Math.round(i.total / 1048576)}MB:${i.peers}p:${Math.round(i.speed / 1024)}KB/s${i.error ? ':' + i.error : ''}`).join(' | ');
      if (Date.now() - (tick.lastLog || 0) > 30000 || items.some((i) => i.status === 'error') && sig !== tick.sig) { tick.lastLog = Date.now(); tick.sig = sig; if (sig) log('torrents:', sig.slice(0, 600)); }
      for (const x of list) {
        // added again after it already finished: aria2 refuses; it's done, so tidy it away and use the files
        if (x.status === 'error' && /control file/i.test(x.errorMessage || '') && !finished.has(x.gid)) {
          finished.add(x.gid); rpc('aria2.removeDownloadResult', [x.gid]).catch(() => {});
          const files = (x.files || []).map((f) => f.path).filter((f) => f && fs.existsSync(f));
          log('torrent was already downloaded', files.length, 'files');
          for (const f of files) importGame(f, true);
          continue;
        }
        if (x.status !== 'complete' || finished.has(x.gid) || (x.followedBy && x.followedBy.length)) continue;
        finished.add(x.gid);
        const files = (x.files || []).map((f) => f.path).filter((f) => f && fs.existsSync(f));
        log('torrent done', x.bittorrent?.info?.name || '', files.length, 'files');
        for (const f of files) importGame(f, true);
        if (files.some((f) => /\.(nsp|nsz|xci|xcz)$/i.test(f))) send({ status: 'note', text: `${x.bittorrent?.info?.name || 'الملف'} لعبة سويتش، والبرنامج ما فيه محاكي سويتش، فما قدرت أضيفها للمكتبة. الملفات في مجلد التحميلات.` });
        try { const { Notification, shell } = require('electron'); const n = new Notification({ title: '✅ خلص التحميل', body: `${x.bittorrent?.info?.name || 'التورنت'}: اضغط تفتح المجلد` }); n.on('click', () => shell.openPath(OUT)); n.show(); } catch {}
        send({ status: 'done', name: x.bittorrent?.info?.name || '' });
      }
      if (!list.some((x) => ['active', 'waiting', 'paused'].includes(x.status)) && list.length && Date.now() - (tick.lastBusy || 0) > 120000) { /* idle: keep aria2 running quietly */ }
      if (list.some((x) => x.status === 'active')) tick.lastBusy = Date.now();
    } catch (e) { if (!tick.warned) { tick.warned = true; log('torrent poll', e.message); } }
  }
  ipcMain.handle('tor:add', async (_e, what) => {
    try {
      await ensure();
      let gid;
      if (/^magnet:/i.test(what)) gid = await rpc('aria2.addUri', [[what], { 'check-integrity': 'true' }]);
      else if (fs.existsSync(what)) {
        try { fs.mkdirSync(OUT, { recursive: true }); const keep = path.join(OUT, path.basename(what)); if (keep !== what) fs.copyFileSync(what, keep); } catch {} // a copy, for repairs later
        gid = await rpc('aria2.addTorrent', [fs.readFileSync(what).toString('base64'), [], { 'check-integrity': 'true' }]); // already downloaded? it's checked, not refused
      } else return { error: 'الرابط أو الملف مو صحيح' };
      log('torrent added', gid);
      return { ok: true, gid };
    } catch (e) { log('torrent add failed', e.message); return { error: e.message }; }
  });
  ipcMain.handle('tor:act', async (_e, gid, act) => {
    try { await ensure(); await rpc(act === 'pause' ? 'aria2.pause' : act === 'resume' ? 'aria2.unpause' : 'aria2.remove', [gid]); if (act === 'remove') await rpc('aria2.removeDownloadResult', [gid]).catch(() => {}); return true; }
    catch { try { await rpc('aria2.removeDownloadResult', [gid]); } catch {} return false; }
  });
  ipcMain.handle('tor:folder', () => { fs.mkdirSync(OUT, { recursive: true }); require('electron').shell.openPath(OUT); });
  // Normal web downloads, split into 16 connections (a lot faster on most game hosts)
  async function fastGet(url, opts) {
    await ensure();
    return rpc('aria2.addUri', [[url], { dir: opts.dir, out: opts.out, header: opts.header, split: '16', 'max-connection-per-server': '16', 'min-split-size': '4M', 'auto-file-renaming': 'true' }]);
  }
  // A downloaded game that turns out damaged: check it against its torrent and fetch only the broken pieces
  function torrentName(buf) { const s = buf.toString('latin1'); const m = /4:name(\d+):/.exec(s); return m ? Buffer.from(s.substr(m.index + m[0].length, Number(m[1])), 'latin1').toString('utf8') : ''; }
  async function repair(file) {
    const folder = path.dirname(file), want = path.basename(folder);
    const torrents = []; for (const d of [OUT, app.getPath('downloads'), app.getPath('desktop'), path.join(require('os').homedir(), 'OneDrive', 'Desktop'), app.getPath('documents')]) { try { for (const f of fs.readdirSync(d)) if (/\.torrent$/i.test(f)) torrents.push(path.join(d, f)); } catch {} }
    const t = torrents.find((f) => { try { return torrentName(fs.readFileSync(f)) === want; } catch { return false; } });
    if (!t) { log('repair: no .torrent for', want); return false; }
    await ensure();
    // remove leftovers of the same torrent, then re-check the files where they are now
    const keys = ['gid', 'bittorrent']; for (const x of [...await rpc('aria2.tellStopped', [0, 50, keys]), ...await rpc('aria2.tellActive', [keys])]) { if (x.bittorrent?.info?.name === want) { await rpc('aria2.remove', [x.gid]).catch(() => {}); await rpc('aria2.removeDownloadResult', [x.gid]).catch(() => {}); } }
    const gid = await rpc('aria2.addTorrent', [fs.readFileSync(t).toString('base64'), [], { dir: path.dirname(folder), 'check-integrity': 'true', 'allow-overwrite': 'false', 'bt-seed-unverified': 'false' }]);
    log('repair: re-checking', want, gid);
    send({ status: 'note', text: `${want}: بعض الملفات ناقصة أو خربانة، أعيد فحصها وأحمّل الناقص بس، وبعدها تتجهز لحالها` });
    return true;
  }
  app.on('will-quit', () => { try { rpc('aria2.saveSession').catch(() => {}); setTimeout(() => { try { proc?.kill(); } catch {} }, 300); } catch {} });
  // downloads from last time carry on by themselves
  if (fs.existsSync(path.join(TOOL, 'session.txt')) && fs.statSync(path.join(TOOL, 'session.txt')).size > 0) setTimeout(() => ensure().catch(() => {}), 8000);
  return { dir: OUT, fastGet, repair };
}
module.exports = { setupTorrents };
