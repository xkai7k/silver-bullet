const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, webContents, session, screen, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const dataFile = () => path.join(app.getPath('userData'), 'preview-data.json');
const isDrivePath = (t) => /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\');

// Background tunes should start without waiting for a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWin = null;
const SRC_DIR = process.env.PREVIEW_SRC || __dirname; // editable folder on the desktop

// Small log file next to the project, so problems can be diagnosed later.
const LOG_FILE = path.join(SRC_DIR, 'preview-log.txt');
// "What I downloaded" list for the Logs window: picked out of the normal log as things happen
const HIST_RULES = [
  [/^torrent done$/, 'تورنت خلص', 1], [/^download$/, 'تحميل', 2], [/^fast download$/, 'تحميل سريع بدأ', 1], [/^emu installed$/, 'محاكي انضاف', 1],
  [/^game added$/, 'لعبة انضافت', 2], [/^nsz converted$/, 'تحوّل للسويتش', 1], [/^switch extra$/, 'تحديث / DLC', 2], [/^switch firmware installed$/, 'فيرموير السويتش', 3], [/^mod installed$/, 'مود انضاف', 1],
];
function hist(parts) {
  try {
    const head = String(parts[0]); const r = HIST_RULES.find(([re]) => re.test(head)); if (!r) return;
    const f = path.join(app.getPath('userData'), 'history.json');
    let list = []; try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    const what = parts.slice(1).map(String).filter((x) => x && !/^\d+(\.\d+)?(MB|s)?$/.test(x)).map((x) => /[\\/]/.test(x) ? x.split(/[\\/]/).pop() : x).join(' · ');
    list.unshift({ t: Date.now(), kind: r[1], what: what.slice(0, 220) });
    fs.writeFileSync(f, JSON.stringify(list.slice(0, 500)));
  } catch {}
}
function log(...parts) {
  hist(parts);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 200000) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${parts.map(String).join(' ')}\n`);
  } catch {}
}
process.on('uncaughtException', (err) => log('main error:', err.stack || err));
ipcMain.on('log', (_e, msg) => log('ui:', msg));
ipcMain.handle('app:version', () => 15);

// SB_TEST=1: a side-by-side test copy — its own data, and it never installs itself or touches shortcuts
const TEST_COPY = process.env.SB_TEST === '1';
if (TEST_COPY) app.setPath('userData', path.join(app.getPath('appData'), 'Silver Bullet (test copy)'));
else app.setPath('userData', path.join(app.getPath('appData'), 'preview')); // one data folder whichever way it starts (Start.bat, ready-made download, shortcut)
if (process.platform === 'win32') app.setAppUserModelId('SilverBullet'); // reminders and battery alerts show as Windows notifications

function createWindow() {
  const win = mainWin = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#07090e',
    autoHideMenuBar: true,
    title: 'Silver Bullet',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) log('console:', message, `(${String(sourceId).split('/').pop()}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone:', d.reason));
  win.webContents.on('did-fail-load', (_e, code, desc) => log('load failed:', code, desc));
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  // The whole interface scales with the window, so it looks right windowed, borderless or full screen
  // Ctrl + mouse wheel makes everything a little bigger or smaller (a few steps, remembered)
  const ZF = path.join(app.getPath('userData'), 'zoom.json');
  let userZoom = 1; try { userZoom = JSON.parse(fs.readFileSync(ZF, 'utf8')).z || 1; } catch {}
  win.webContents.on('zoom-changed', (_e, dir) => {
    userZoom = Math.max(0.8, Math.min(1.25, Math.round((userZoom + (dir === 'in' ? 0.05 : -0.05)) * 100) / 100));
    try { fs.writeFileSync(ZF, JSON.stringify({ z: userZoom })); } catch {}
    fit();
  });
  const fit = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const [w, h] = win.getContentSize();
    const z = Math.max(0.5, Math.min(1.8, Math.round(Math.min(w / 1600, h / 900) * userZoom * 40) / 40));
    if (Math.abs(win.webContents.getZoomFactor() - z) > 0.01) win.webContents.setZoomFactor(z);
  };
  win.on('resize', fit); win.on('enter-full-screen', () => setTimeout(fit, 50)); win.on('leave-full-screen', () => setTimeout(fit, 50));
  win.webContents.on('did-finish-load', fit);
  hookDock(win);
  log('started, electron', process.versions.electron, 'src', SRC_DIR);
}

// ---------- Silver Bullet as a real app ----------
// The first time it runs from the project, it sets itself up in %LOCALAPPDATA%\SilverBullet with its own
// "Silver Bullet.exe", icon, desktop and Start-menu shortcuts. The installed app refreshes its files from
// the project folder every time it opens (see boot.js).
const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'SilverBullet');
const INSTALLED_EXE = path.join(INSTALL_DIR, 'Silver Bullet.exe');
function writeShortcuts() {
  const icon = path.join(INSTALL_DIR, 'resources', 'app', 'icon.ico');
  const opts = { target: INSTALLED_EXE, cwd: INSTALL_DIR, description: 'Silver Bullet — games, watch, music', icon, iconIndex: 0, appUserModelId: 'SilverBullet' };
  for (const lnk of [path.join(app.getPath('desktop'), 'Silver Bullet.lnk'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Silver Bullet.lnk')]) {
    try { shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', opts); } catch (e) { log('shortcut failed', lnk, e.message); }
  }
  // the old "Preview" shortcut pointed at the script launcher; the app replaces it
  try { const old = path.join(app.getPath('desktop'), 'Preview.lnk'); if (fs.existsSync(old)) fs.unlinkSync(old); } catch {}
}
async function installApp() {
  if (TEST_COPY) return;
  if (process.platform !== 'win32') return;
  try {
    const appDir = path.join(INSTALL_DIR, 'resources', 'app');
    const want = process.versions.electron;
    let have = ''; try { have = fs.readFileSync(path.join(INSTALL_DIR, 'electron-version.txt'), 'utf8').trim(); } catch {}
    if (!process.env.SB_INSTALLED && (have !== want || !fs.existsSync(INSTALLED_EXE))) {
      log('installing Silver Bullet app…');
      // Electron's own fs treats .asar files as folders; the plain one copies them as files
      await require('original-fs').promises.cp(path.dirname(process.execPath), INSTALL_DIR, { recursive: true, force: true });
      const ex = path.join(INSTALL_DIR, path.basename(process.execPath));
      if (fs.existsSync(ex) && ex !== INSTALLED_EXE) { try { fs.rmSync(INSTALLED_EXE, { force: true }); } catch {} fs.renameSync(ex, INSTALLED_EXE); }
      fs.writeFileSync(path.join(INSTALL_DIR, 'electron-version.txt'), want);
      log('installed', INSTALLED_EXE);
    }
    if (!fs.existsSync(INSTALLED_EXE)) return;
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'preview', productName: 'preview', version: '1.0.0', main: 'boot.js' }, null, 1));
    for (const f of ['boot.js']) fs.copyFileSync(path.join(__dirname, f), path.join(appDir, f));
    fs.copyFileSync(path.join(__dirname, 'assets', 'icon.ico'), path.join(appDir, 'icon.ico'));
    let src = SRC_DIR.replace(/[\\/]+$/, '');
    if (app.isPackaged && !process.env.SB_INSTALLED) { // the ready-made download: keep its code with the app, so the downloaded folder can be deleted
      src = path.join(INSTALL_DIR, 'src');
      require('original-fs').cpSync(__dirname, src, { recursive: true, force: true });
    }
    let cur = {}; try { cur = JSON.parse(fs.readFileSync(path.join(appDir, 'boot.json'), 'utf8')); } catch {}
    if (cur.src !== src) fs.writeFileSync(path.join(appDir, 'boot.json'), JSON.stringify({ src }, null, 1));
    writeShortcuts();
  } catch (e) { log('install failed', e.message); }
}

// ---------- Data ----------
ipcMain.handle('data:load', () => {
  try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch { return null; }
});
ipcMain.handle('data:save', (_e, data) => {
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf8');
  return true;
});

// ---------- Launching (with play-time tracking for .exe files) ----------
function trackSpawn(e, exe, args, itemId) {
  const started = Date.now();
  // Programs start with a clean environment (nothing of Electron's leaks into browsers or games)
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELECTRON_|PREVIEW_|CHROME_)/i.test(k)));
  log('run', path.basename(exe), JSON.stringify(args).slice(0, 300));
  if (/\.(nsp|xci)$/i.test(args[args.length - 1] || '')) lastSwitchRom = args[args.length - 1];
  // Some emulators (Ryujinx) crash when started without normal console handles: those go through "start", like a double-click
  const viaStart = /^(ryujinx|lichii|eden|citron|sudachi|suyu|torzu|yuzu)\.exe$/i.test(path.basename(exe));
  const q = (a) => (/[\s"&()^]/.test(a) ? `"${String(a).replace(/"/g, '')}"` : a);
  const child = viaStart
    ? spawn('cmd.exe', ['/d', '/s', '/c', `"start "" /wait /d ${q(path.dirname(exe))} ${q(exe)} ${args.map(q).join(' ')}"`], { windowsHide: true, windowsVerbatimArguments: true, detached: true, stdio: 'ignore', env })
    : spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore', env });
  child.on('error', (err) => log('run failed', exe, err.message));
  child.on('exit', (code) => {
    const secs = Math.round((Date.now() - started) / 1000);
    log('closed', path.basename(exe), 'after', secs + 's', 'code', code);
    if (secs > 20) setTimeout(() => backupSaves().catch(() => {}), 3000); // your progress goes to OneDrive right after you play
    if (secs < 90 || /ryujinx|lichii|eden|citron/i.test(path.basename(exe))) emuLogTail(exe); // keep what the emulator itself said (why a game closed)
    if (secs < 30 && code !== 0) { // crashed at once: Windows keeps the reason in its event log
      const ps = "Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddMinutes(-3)} -MaxEvents 6 -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -match '.NET Runtime|Application Error' } | Select-Object -First 2 | ForEach-Object { $_.Message }";
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000 }, (_err, out) => log('crash reason:', String(out || 'none').replace(/\s+\n/g, '\n').slice(0, 2500)));
    }
    if (!e.sender?.isDestroyed?.()) e.sender.send('playtime', itemId, secs);
  });
  child.unref();
}
// The last lines an emulator wrote in its own log (Ryujinx / yuzu family), copied into ours to see why a game didn't start
// Opens every emulator for a few seconds and closes it again: anything that crashes on start, or is missing, shows up in the log
async function emuSelfTest() {
  const have = installedEmus();
  const list = EMU_CATALOG.map((e) => ({ e, exe: (have.find((x) => x.id === e.id && fs.existsSync(x.exe)) || {}).exe || (e.existing || []).find((p) => fs.existsSync(p)) || foundExe(e.exe) })).filter((x) => x.exe);
  log('emulator check: testing', list.length);
  const res = [];
  for (const { e, exe } of list) {
    const r = await new Promise((resolve) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELECTRON_|PREVIEW_|CHROME_)/i.test(k)));
      const viaStart = /^(ryujinx|lichii|eden|citron|sudachi|suyu|torzu|yuzu)\.exe$/i.test(path.basename(exe));
      const child = viaStart ? spawn('cmd.exe', ['/d', '/s', '/c', `"start "" /wait /d "${path.dirname(exe)}" "${exe}""`], { windowsHide: true, windowsVerbatimArguments: true, env }) : spawn(exe, [], { cwd: path.dirname(exe), env, stdio: 'ignore' });
      let done = false;
      child.on('error', (err) => { if (!done) { done = true; resolve(`✗ ما اشتغل: ${err.message}`); } });
      child.on('exit', (code) => { if (!done) { done = true; resolve(code === 0 ? '✓ (قفل لحاله)' : `✗ طاح أول ما فتح (code ${code})`); } });
      setTimeout(() => { if (done) return; done = true; try { execFile('taskkill', ['/IM', path.basename(exe), '/T', '/F'], { windowsHide: true }, () => {}); child.kill(); } catch {} resolve('✓ يفتح'); }, 7000);
    });
    res.push(`${e.name}: ${r}`);
    log('emulator check:', e.name, r, exe);
    await new Promise((x) => setTimeout(x, 800));
  }
  log('emulator check done:\n   ' + res.join('\n   '));
  return res;
}
let lastSwitchRom = '';
function emuLogTail(exe) {
  try {
    const name = path.basename(exe).replace(/\.exe$/i, '');
    const dirs = [path.join(process.env.APPDATA || '', name, 'Logs'), path.join(process.env.APPDATA || '', name, 'log'), path.join(path.dirname(exe), 'Logs'), path.join(path.dirname(exe), 'portable', 'Logs'), path.join(path.dirname(exe), 'user', 'log')];
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      const f = fs.readdirSync(d).map((x) => path.join(d, x)).filter((x) => fs.statSync(x).isFile()).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      if (!f) continue;
      const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      const bad = lines.filter((l) => /error|exception|fail|missing|unable|invalid|crash/i.test(l)).slice(-12);
      log(`${name} log (${path.basename(f)}):\n` + (bad.length ? bad : lines.slice(-12)).map((l) => '   ' + l.slice(0, 260)).join('\n'));
      // Ryujinx lost the graphics card (Vulkan) on this game: next time it starts in OpenGL, with a fresh shader cache
      if (/ryujinx/i.test(name) && lines.some((l) => /ErrorDeviceLost/.test(l)) && lastSwitchRom) {
        const tid = (/\[(0100[0-9a-f]{12})\]/i.exec(path.basename(lastSwitchRom)) || [])[1];
        if (tid) {
          const cf = path.join(app.getPath('userData'), 'switch-compat.json');
          let c = {}; try { c = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch {}
          if (c[tid.toLowerCase()] !== 'opengl') {
            c[tid.toLowerCase()] = 'opengl'; fs.writeFileSync(cf, JSON.stringify(c));
            try { fs.rmSync(path.join(process.env.APPDATA || '', 'Ryujinx', 'games', tid.toLowerCase(), 'cache'), { recursive: true, force: true }); } catch {}
            log('switch: this game crashed the graphics card in Vulkan; next start uses OpenGL', tid);
            mainWin?.webContents.send('rom:status', { step: 'compat', name: path.basename(lastSwitchRom) });
          }
        }
      }
      return;
    }
  } catch (err) { log('emu log read', err.message); }
}
// Read a shortcut with PowerShell (Electron's own reader crashes on some shortcuts)
function readLnk(p) {
  return new Promise((resolve) => {
    const ps = '$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:PV_LNK); Write-Output $s.TargetPath; Write-Output $s.Arguments';
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000, env: { ...process.env, PV_LNK: p } },
      (err, out) => { if (err) return resolve(null); const [t, a] = String(out).split(/\r?\n/); resolve({ target: (t || '').trim(), args: (a || '').trim() }); });
  });
}
ipcMain.handle('launch', async (e, target, itemId, args) => {
  try {
    if (/^shell:AppsFolder\\/i.test(target)) { spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref(); return ''; } // Store / Xbox apps
    if (!isDrivePath(target) && /^[a-z][a-z0-9+.-]*:/i.test(target)) {
      await shell.openExternal(target); // spotify:, steam://, com.epicgames.launcher://, ...
      return '';
    }
    if (!fs.existsSync(target)) return 'الملف غير موجود: ' + target;
    if (/\.exe$/i.test(target)) { trackSpawn(e, target, Array.isArray(args) ? args : [], itemId); return ''; }
    if (/\.lnk$/i.test(target)) {
      try {
        const l = await readLnk(target);
        if (l && /\.exe$/i.test(l.target) && fs.existsSync(l.target)) {
          const a = (l.args || '').match(/"[^"]*"|\S+/g)?.map((x) => x.replace(/^"|"$/g, '')) || [];
          trackSpawn(e, l.target, a, itemId); return '';
        }
      } catch {}
    }
    return await shell.openPath(target); // '' on success, error text otherwise
  } catch (err) { return String(err.message || err); }
});

// Real icon of a program / shortcut / file, as a data URL
function psIcon(file) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const ps = "Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Icon]::ExtractAssociatedIcon($env:PV_ICON); $b=$i.ToBitmap(); $m=New-Object IO.MemoryStream; $b.Save($m,[System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray())";
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, env: { ...process.env, PV_ICON: file }, maxBuffer: 4e6 },
      (err, out) => resolve(!err && out && out.trim().length > 100 ? 'data:image/png;base64,' + out.trim() : null));
  });
}
ipcMain.handle('file:icon', async (_e, p) => {
  // Shortcuts (.lnk) are read by PowerShell, never by Electron's own shortcut/icon calls:
  // some shortcuts (Kairos, for one) crash those calls and take the whole app down.
  try {
    if (/\.lnk$/i.test(p)) { const l = await readLnk(p); if (l?.target && /\.exe$/i.test(l.target) && fs.existsSync(l.target)) { const r = await psIcon(l.target); if (r) return r; } } // the program's own icon, without the shortcut arrow
    if (/\.(exe|ico|dll|lnk)$/i.test(p) && fs.existsSync(p)) { const r = await psIcon(p); if (r) return r; }
    if (/\.lnk$/i.test(p)) return null;
    const img = await app.getFileIcon(p, { size: 'large' });
    return img.isEmpty() ? null : img.toDataURL();
  } catch { return null; }
});
ipcMain.handle('file:info', (_e, p) => {
  try {
    const st = fs.statSync(p);
    let name = path.basename(p).replace(/\.(lnk|exe|url|bat)$/i, '');
    return { exists: true, dir: st.isDirectory(), name };
  } catch { return { exists: false }; }
});

ipcMain.handle('pick:dir', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('paths', () => {
  const mods = path.join(SRC_DIR, 'Mods');
  try { fs.mkdirSync(mods, { recursive: true }); } catch {}
  return { mods, src: SRC_DIR };
});

// ---------- Emulators ----------
const COMMON_EMUS = [
  ['ps2', 'C:\\Program Files\\PCSX2\\pcsx2-qt.exe'],
  ['ps1', 'C:\\Program Files\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe'],
  ['psp', 'C:\\Program Files\\PPSSPP\\PPSSPPWindows64.exe'],
  ['gc', 'C:\\Program Files\\Dolphin\\Dolphin.exe'],
  ['gc', 'C:\\Program Files\\Dolphin-x64\\Dolphin.exe'],
  ['ps3', 'C:\\RPCS3\\rpcs3.exe'],
];
ipcMain.handle('emu:detect', () => [...COMMON_EMUS, ...installedEmus().filter((e) => e.platform).map((e) => [e.platform, e.exe])]
  .filter(([, p]) => fs.existsSync(p)).map(([platform, exe]) => ({ platform, exe })));

// ---------- Emulator installer: official builds, straight from each project's own releases ----------
// Each one lands in %USERPROFILE%\Emulators\<name> as a portable copy (no installers, no admin).
const EMU_ROOT = path.join(require('os').homedir(), 'Emulators');
const EMU_CATALOG = [
  { id: 'retroarch', name: 'RetroArch', desc: 'محاكي شامل لأجهزة كثيرة (أتاري، سيغا، نينتندو القديمة...)', exe: /^retroarch\.exe$/i,
    url: async () => 'https://buildbot.libretro.com/nightly/windows/x86_64/RetroArch.7z', file: 'RetroArch.7z' },
  { id: 'duckstation', name: 'DuckStation', desc: 'محاكي بلايستيشن 1 — سوني', platform: 'ps1', exe: /^duckstation-qt.*\.exe$/i, gh: 'stenzek/duckstation', asset: /^duckstation-windows-x64-release\.zip$/i },
  { id: 'pcsx2', name: 'PCSX2', desc: 'محاكي بلايستيشن 2 — سوني', platform: 'ps2', exe: /^pcsx2-qt\.exe$/i, gh: 'PCSX2/pcsx2', asset: /windows-x64-Qt\.7z$/i,
    existing: ['C:\\Program Files\\PCSX2\\pcsx2-qt.exe'] },
  { id: 'rpcs3', name: 'RPCS3', desc: 'محاكي بلايستيشن 3 — سوني', platform: 'ps3', exe: /^rpcs3\.exe$/i, gh: 'RPCS3/rpcs3-binaries-win', asset: /_win64.*\.7z$/i, existing: ['C:\\RPCS3\\rpcs3.exe'] },
  { id: 'shadps4', name: 'shadPS4', desc: 'محاكي بلايستيشن 4 — سوني (تجريبي)', exe: /^shadps4.*\.exe$/i, gh: 'shadps4-emu/shadPS4', asset: /win(64|dows).*\.zip$/i, prefer: /qt/i },
  { id: 'ppsspp', name: 'PPSSPP', desc: 'محاكي PSP — سوني (الجهاز المحمول)', platform: 'psp', exe: /^ppssppwindows64\.exe$/i,
    url: async () => { const h = await (await net.fetch('https://www.ppsspp.org/download/')).text(); const m = /\/files\/[\d_]+\/ppsspp_win\.zip/i.exec(h); return m && 'https://www.ppsspp.org' + m[0]; },
    file: 'ppsspp_win.zip', existing: ['C:\\Program Files\\PPSSPP\\PPSSPPWindows64.exe'] },
  { id: 'vita3k', name: 'Vita3K', desc: 'محاكي بلايستيشن فيتا — سوني (تجريبي)', exe: /^vita3k\.exe$/i, gh: 'Vita3K/Vita3K', asset: /^windows-latest\.zip$/i, tag: 'continuous' },
  { id: 'dolphin', name: 'Dolphin', desc: 'محاكي جيم كيوب و Wii — نينتندو', platform: 'gc', exe: /^dolphin\.exe$/i,
    url: async () => { let h = ''; try { const r = await net.fetch('https://dolphin-emu.org/download/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' } }); h = await r.text(); } catch {} const m = /(?:https:)?\/\/dl\.dolphin-emu\.org\/(?:releases|builds)\/[\w./-]+?-x64\.7z/i.exec(h); return m ? (m[0].startsWith('//') ? 'https:' + m[0] : m[0]) : 'https://dl.dolphin-emu.org/releases/2609b/dolphin-2609b-x64.7z'; },
    file: 'dolphin.7z', existing: ['C:\\Program Files\\Dolphin\\Dolphin.exe', 'C:\\Program Files\\Dolphin-x64\\Dolphin.exe'] },
  { id: 'cemu', name: 'Cemu', desc: 'محاكي Wii U — نينتندو', exe: /^cemu\.exe$/i, gh: 'cemu-project/Cemu', asset: /windows-x64\.zip$/i },
  { id: 'gopher64', name: 'gopher64', desc: 'محاكي نينتندو 64', platform: 'n64', exe: /^gopher64.*\.exe$/i, gh: 'gopher64/gopher64', asset: /windows.*(x86_64|x64).*\.(exe|zip)$/i },
  { id: 'snes9x', name: 'Snes9x', desc: 'محاكي سوبر نينتندو (SNES)', platform: 'snes', exe: /^snes9x-x64\.exe$/i, gh: 'snes9xgit/snes9x', asset: /win32-x64\.zip$/i },
  { id: 'mesen', name: 'Mesen', desc: 'محاكي نينتندو (NES) وسوبر نينتندو وجيم بوي', exe: /^mesen\.exe$/i, gh: 'SourMesen/Mesen2', asset: /windows.*\.zip$/i },
  { id: 'mgba', name: 'mGBA', desc: 'محاكي جيم بوي أدفانس وجيم بوي — نينتندو', platform: 'gba', exe: /^mgba\.exe$/i, gh: 'mgba-emu/mgba', asset: /win64\.7z$/i },
  { id: 'melonds', name: 'melonDS', desc: 'محاكي نينتندو DS', platform: 'nds', exe: /^melonds\.exe$/i, gh: 'melonDS-emu/melonDS', asset: /windows.*x86_64.*\.zip$|win.*x64.*\.zip$/i },
  { id: 'azahar', name: 'Azahar', desc: 'محاكي نينتندو 3DS', exe: /^azahar\.exe$/i, gh: 'azahar-emu/azahar', asset: /^azahar-windows-msvc-[\d.]+\.zip$/i },
  { id: 'flycast', name: 'Flycast', desc: 'محاكي سيغا دريم كاست', exe: /^flycast\.exe$/i, gh: 'flyinghead/flycast', asset: /win64.*\.zip$/i },
  { id: 'xemu', name: 'xemu', desc: 'محاكي إكس بوكس الأول — مايكروسوفت', exe: /^xemu\.exe$/i, gh: 'xemu-project/xemu', asset: /^xemu-win-x86_64-release\.zip$/i },
  { id: 'ryujinx', name: 'Ryujinx', desc: 'محاكي نينتندو سويتش (يحتاج مفاتيح من جهازك)', platform: 'switch', exe: /^ryujinx\.exe$/i, file: 'ryujinx.zip',
    url: async () => { // Ryubing: the maintained Ryujinx; its own site first, GitHub copies after
      const pick = (assets) => (assets || []).find((a) => /win_x64\.zip$/i.test(a.name) && !/arm|sdl2-headless|headless/i.test(a.name));
      try { const j = await (await net.fetch('https://git.ryujinx.app/api/v1/repos/ryubing/ryujinx/releases?limit=5', { headers: { 'User-Agent': 'SilverBullet/1.0', Accept: 'application/json' } })).json();
        for (const r of Array.isArray(j) ? j : []) { if (r.prerelease) continue; const a = pick(r.assets); if (a) return a.browser_download_url; } } catch (e) { log('ryujinx site', e.message); }
      for (const repo of ['Ryubing/Stable-Releases', 'Ryubing/Ryujinx']) {
        try { const r = await (await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'User-Agent': 'SilverBullet', Accept: 'application/vnd.github+json' } })).json(); const a = pick(r.assets); if (a) return a.browser_download_url; else log('ryujinx assets', repo, (r.assets || []).map((x) => x.name).join(' | ') || r.message); } catch (e) { log('ryujinx gh', repo, e.message); }
      }
      return null;
    } },
  // Switch emulators people install themselves: never downloaded by us, but used when they're on the PC
  ...['Lichii', 'Eden', 'Citron', 'Sudachi', 'Suyu', 'Torzu', 'Yuzu'].map((n) => ({ id: n.toLowerCase(), name: n, desc: 'محاكي نينتندو سويتش (لقيته على جهازك)', platform: 'switch', exe: new RegExp(`^${n}\\.exe$`, 'i'), localOnly: true })),
  { id: 'xenia', name: 'Xenia Canary', desc: 'محاكي إكس بوكس 360 — مايكروسوفت', exe: /^xenia_canary\.exe$/i, gh: 'xenia-canary/xenia-canary-releases', asset: /^xenia_canary(?!.*linux).*\.zip$/i },
];
const emuIndexFile = () => path.join(app.getPath('userData'), 'emulators.json');
// ---------- Emulators you installed yourself, anywhere usual on the PC ----------
const foundEmusFile = () => path.join(app.getPath('userData'), 'found-emus.json');
let foundEmus = []; try { foundEmus = JSON.parse(fs.readFileSync(path.join(require('electron').app.getPath('userData'), 'found-emus.json'), 'utf8')); } catch {}
function foundExe(re) { return foundEmus.find((f) => re.test(path.basename(f)) && fs.existsSync(f)) || null; }
async function scanForEmus() {
  const home = require('os').homedir();
  const roots = [path.join(home, 'Desktop'), path.join(home, 'OneDrive', 'Desktop'), path.join(home, 'Downloads'), path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'),
    process.env.LOCALAPPDATA, path.join(process.env.LOCALAPPDATA || '', 'Programs'), process.env.APPDATA, 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\Emulators', 'C:\\Games', 'D:\\', 'D:\\Emulators', 'D:\\Games', EMU_ROOT].filter(Boolean);
  const res = EMU_CATALOG.map((e) => e.exe);
  const skip = /^(windows|node_modules|\$recycle\.bin|system volume information|microsoft|nvidia.*|steamapps|common|packages|temp|cache|.*cache.*)$/i;
  const out = new Set();
  const walk = async (d, depth) => {
    let ents = []; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const x of ents) {
      const f = path.join(d, x.name);
      if (x.isFile() && /\.exe$/i.test(x.name) && res.some((r) => r.test(x.name))) out.add(f);
      else if (x.isDirectory() && depth > 0 && !skip.test(x.name)) await walk(f, depth - 1);
    }
  };
  for (const r of roots) await walk(r, 3);
  foundEmus = [...out];
  try { fs.writeFileSync(foundEmusFile(), JSON.stringify(foundEmus, null, 1)); } catch {}
  log('emulators found on this PC:', foundEmus.map((f) => path.basename(f)).join(', ') || 'none');
  return foundEmus;
}
function installedEmus() { try { return JSON.parse(fs.readFileSync(emuIndexFile(), 'utf8')); } catch { return []; } }
function findExe(dir, re, depth = 3) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const d of ents) if (d.isFile() && re.test(d.name)) return path.join(dir, d.name);
  if (depth > 0) for (const d of ents) if (d.isDirectory()) { const f = findExe(path.join(dir, d.name), re, depth - 1); if (f) return f; }
  return null;
}
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let err = '', out = '';
    p.stderr?.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-8000); });
    p.stdout?.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-8000); });
    p.on('error', (e) => resolve({ code: -1, err: e.message }));
    // the end of an error message is the useful part (Python puts the actual error last)
    p.on('exit', (code) => resolve({ code, err: err.length > 700 ? err.slice(0, 150) + ' … ' + err.slice(-550) : err, out: out.slice(-600) }));
  });
}
async function download(url, file, onPct) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Preview-Launcher' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader();
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (total && Date.now() - last > 400) { last = Date.now(); onPct(Math.round((got / total) * 100)); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  return got;
}
async function sevenZip() {
  const exe = path.join(EMU_ROOT, '_tools', '7zr.exe');
  if (fs.existsSync(exe)) return exe;
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  await download('https://www.7-zip.org/a/7zr.exe', exe, () => {});
  return exe;
}
async function extract(file, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (/\.exe$/i.test(file)) { fs.copyFileSync(file, path.join(dir, path.basename(file))); return; }
  if (/\.zip$/i.test(file)) {
    let r = await run('tar', ['-xf', file, '-C', dir]);
    if (r.code !== 0) r = await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${file}' -DestinationPath '${dir}' -Force`]);
    if (r.code !== 0) throw new Error('unzip ' + r.err);
  } else {
    const r = await run(await sevenZip(), ['x', file, '-o' + dir, '-y']);
    if (r.code !== 0) throw new Error('7z ' + r.err);
  }
}
async function resolveUrl(e) {
  if (e.url) return { url: await e.url(), file: e.file };
  const api = `https://api.github.com/repos/${e.gh}/releases/${e.tag ? 'tags/' + e.tag : 'latest'}`;
  const rel = await (await net.fetch(api, { headers: { 'User-Agent': 'Preview-Launcher', Accept: 'application/vnd.github+json' } })).json();
  const list = (rel.assets || []).filter((x) => e.asset.test(x.name) && !/symbols|pdb|debug|arm64/i.test(x.name));
  const a = (e.prefer && list.find((x) => e.prefer.test(x.name))) || list[0];
  if (!a) { log('emu assets', e.name, (rel.assets || []).map((x) => x.name).join(' | ')); throw new Error('no windows build in ' + (rel.tag_name || rel.message || 'release')); }
  return { url: a.browser_download_url, file: a.name };
}
let emuInstalling = null;

// ---------- Storage: how much space each installed game takes, and freeing it (saves are kept, and copied to OneDrive) ----------
const sizeCache = new Map();
async function dirSize(d, depth = 0) {
  let total = 0, ents = [];
  try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return 0; }
  for (const x of ents) {
    const f = path.join(d, x.name);
    if (x.isDirectory()) { if (depth < 12) total += await dirSize(f, depth + 1); }
    else { try { total += (await fs.promises.stat(f)).size; } catch {} }
  }
  return total;
}
function romFootprint(rom) { // the game file, plus its own folder when the game lives in one (cue/bin, extracted games)
  const gamesRoot = path.join(EMU_ROOT, 'Games');
  const dir = path.dirname(rom), parent = path.dirname(dir);
  const ownFolder = path.dirname(parent) === gamesRoot && dir.toLowerCase() !== parent.toLowerCase(); // Games\<console>\<game>\file
  return ownFolder ? { kind: 'dir', path: dir } : { kind: 'file', path: rom };
}
ipcMain.handle('storage:scan', async (_e, items) => {
  const out = [];
  for (const it of items) {
    try {
      let size = 0, where = '', can = false;
      if (it.rom && fs.existsSync(it.rom)) { const f = romFootprint(it.rom); size = f.kind === 'dir' ? await dirSize(f.path) : fs.statSync(f.path).size; where = f.path; can = true; }
      else {
        const sid = /^steam:\/\/rungameid\/(\d+)/.exec(it.target || '')?.[1];
        const dir = sid ? await steamGameDir(sid) : (/^[a-z]:\\/i.test(it.target || '') && fs.existsSync(it.target) ? path.dirname(it.target) : null);
        if (dir && fs.existsSync(dir) && !/^[a-z]:\\(program files( \(x86\))?|windows)\\?$/i.test(dir)) {
          if (!sizeCache.has(dir)) sizeCache.set(dir, await dirSize(dir));
          size = sizeCache.get(dir); where = dir; can = !!sid;
        }
      }
      out.push({ id: it.id, size, where, can });
    } catch { out.push({ id: it.id, size: 0, where: '', can: false }); }
  }
  return out;
});
ipcMain.handle('storage:delete', async (_e, it) => {
  try {
    await backupSaves(); // progress first, always
    if (it.rom && fs.existsSync(it.rom)) {
      const f = romFootprint(it.rom);
      if (f.kind === 'dir') fs.rmSync(f.path, { recursive: true, force: true });
      else {
        // .cue/.gdi bring their track files along
        if (/\.(cue|gdi)$/i.test(it.rom)) { const txt = readText(it.rom) || ''; for (const m of txt.matchAll(/FILE\s+"([^"]+)"/gi)) { try { fs.unlinkSync(path.join(path.dirname(it.rom), m[1])); } catch {} } }
        fs.unlinkSync(it.rom);
      }
      log('game files deleted', it.name, f.path);
      return { ok: true };
    }
    const sid = /^steam:\/\/rungameid\/(\d+)/.exec(it.target || '')?.[1];
    if (sid) { await shell.openExternal(`steam://uninstall/${sid}`); log('steam uninstall asked', it.name); return { ok: true, steam: true }; }
    return { ok: false, msg: 'هذي اللعبة تنحذف من برنامجها نفسه (المتجر أو مثبّتها)' };
  } catch (e) { log('game delete failed', e.message); return { ok: false, msg: e.message }; }
});
// Saves of every emulator, copied to OneDrive (so they're in the cloud too) — at start and whenever a game closes
const SAVE_SPOTS = () => {
  const ad = process.env.APPDATA || '', home = require('os').homedir(), E = EMU_ROOT;
  return [
    ['Switch (Ryujinx)', path.join(ad, 'Ryujinx', 'bis', 'user', 'save')],
    ['Switch (Lichii)', path.join(ad, 'lichii', 'nand', 'user', 'save')],
    ['PS1 (DuckStation)', path.join(E, 'DuckStation', 'memcards')],
    ['PS2 (PCSX2)', path.join(home, 'Documents', 'PCSX2', 'memcards')],
    ['PSP (PPSSPP)', path.join(E, 'PPSSPP', 'memstick', 'PSP', 'SAVEDATA')],
    ['PSP (PPSSPP docs)', path.join(home, 'Documents', 'PPSSPP', 'PSP', 'SAVEDATA')],
    ['GameCube (Dolphin)', path.join(E, 'Dolphin', 'Dolphin-x64', 'User', 'GC')],
    ['Wii (Dolphin)', path.join(E, 'Dolphin', 'Dolphin-x64', 'User', 'Wii', 'title')],
    ['3DS (Azahar)', path.join(ad, 'Azahar', 'sdmc')],
    ['Wii U (Cemu)', path.join(E, 'Cemu', 'Cemu_2.6', 'portable', 'mlc01', 'usr', 'save')],
    ['PS3 (RPCS3)', path.join(E, 'RPCS3', 'dev_hdd0', 'home', '00000001', 'savedata')],
    ['RetroArch', path.join(E, 'RetroArch', 'RetroArch-Win64', 'saves')],
  ].filter(([, p]) => fs.existsSync(p));
};
function savesHome() { const od = process.env.OneDrive || path.join(require('os').homedir(), 'OneDrive'); return path.join(fs.existsSync(od) ? od : app.getPath('documents'), 'Silver Bullet Saves'); }
let backingUp = null;
function backupSaves() {
  if (backingUp) return backingUp;
  backingUp = (async () => {
    const dest = savesHome(); let n = 0;
    for (const [name, src] of SAVE_SPOTS()) {
      const copy = async (a, b) => { await fs.promises.mkdir(b, { recursive: true }); for (const x of await fs.promises.readdir(a, { withFileTypes: true })) { const fa = path.join(a, x.name), fb = path.join(b, x.name); if (x.isDirectory()) await copy(fa, fb); else { const sa = await fs.promises.stat(fa); let sb = null; try { sb = await fs.promises.stat(fb); } catch {} if (!sb || sb.mtimeMs < sa.mtimeMs || sb.size !== sa.size) { await fs.promises.copyFile(fa, fb); n++; } } } };
      try { await copy(src, path.join(dest, name.replace(/[<>:"/\\|?*]/g, ''))); } catch (e) { log('save backup', name, e.message); }
    }
    if (n) log('saves backed up', n, 'files ->', dest);
    return dest;
  })().finally(() => { backingUp = null; });
  return backingUp;
}
ipcMain.handle('saves:backup', () => backupSaves());
ipcMain.handle('saves:open', () => { fs.mkdirSync(savesHome(), { recursive: true }); return shell.openPath(savesHome()); });
// ---------- Logs window ----------
ipcMain.handle('logs:get', () => {
  let lines = []; try { lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\n(?=\[)/); } catch {}
  let history = []; try { history = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'history.json'), 'utf8')); } catch {}
  return { events: lines.filter((l) => !/onnx|content-length|ScriptProcessor|^\s*$/.test(l)).slice(-400).reverse(), history, file: LOG_FILE };
});
ipcMain.handle('logs:open', () => shell.openPath(path.dirname(LOG_FILE)));
// ---------- PC game stores, so they sit in the app like everything else ----------
ipcMain.handle('stores:scan', () => {
  const pf = 'C:\\Program Files', pf86 = 'C:\\Program Files (x86)', la = process.env.LOCALAPPDATA || '', home = require('os').homedir();
  const known = [
    ['Steam', [path.join(pf86, 'Steam', 'steam.exe'), path.join(pf, 'Steam', 'steam.exe')]],
    ['Epic Games', [path.join(pf86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'), path.join(pf, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'), path.join(pf86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win32', 'EpicGamesLauncher.exe')]],
    ['EA app', [path.join(pf, 'Electronic Arts', 'EA Desktop', 'EA Desktop', 'EADesktop.exe')]],
    ['Ubisoft Connect', [path.join(pf86, 'Ubisoft', 'Ubisoft Game Launcher', 'UbisoftConnect.exe'), path.join(pf86, 'Ubisoft', 'Ubisoft Game Launcher', 'upc.exe')]],
    ['Rockstar Games', [path.join(pf, 'Rockstar Games', 'Launcher', 'Launcher.exe')]],
    ['GOG Galaxy', [path.join(pf86, 'GOG Galaxy', 'GalaxyClient.exe'), path.join(pf, 'GOG Galaxy', 'GalaxyClient.exe')]],
    ['Battle.net', [path.join(pf86, 'Battle.net', 'Battle.net Launcher.exe'), path.join(pf, 'Battle.net', 'Battle.net Launcher.exe')]],
    ['Riot Client', ['C:\\Riot Games\\Riot Client\\RiotClientServices.exe']],
    ['Amazon Games', [path.join(la, 'Amazon Games', 'App', 'Amazon Games.exe')]],
    ['itch', [path.join(la, 'itch', 'itch.exe')]],
    ['Xbox', ['shell:AppsFolder\\Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App']],
    ['Microsoft Store', ['shell:AppsFolder\\Microsoft.WindowsStore_8wekyb3d8bbwe!App']],
  ];
  const out = [];
  for (const [name, list] of known) { const hit = list.find((p) => p.startsWith('shell:') || fs.existsSync(p)); if (hit) out.push({ name, exe: hit }); }
  // Steam / Epic installed on another drive: the registry knows
  return out;
});
// ---------- Torrent library: game torrents kept for later, downloaded with one press ----------
const TOR_LIB = () => path.join(app.getPath('userData'), 'torrent-library');
ipcMain.handle('torlib:save', (_e, file) => {
  try {
    fs.mkdirSync(TOR_LIB(), { recursive: true });
    const buf = fs.readFileSync(file); const sdata = buf.toString('latin1'); const m = /4:name(\d+):/.exec(sdata);
    const name = m ? Buffer.from(sdata.substr(m.index + m[0].length, Number(m[1])), 'latin1').toString('utf8') : path.basename(file, '.torrent');
    let size = 0; for (const x of sdata.matchAll(/6:lengthi(\d+)e/g)) size += Number(x[1]);
    const to = path.join(TOR_LIB(), path.basename(file)); if (to !== file) fs.copyFileSync(file, to);
    return { name, file: to, size };
  } catch (e) { log('torlib save', e.message); return null; }
});
ipcMain.handle('emu:catalog', () => {
  const have = installedEmus();
  return EMU_CATALOG.map((e) => {
    const h = have.find((x) => x.id === e.id && fs.existsSync(x.exe));
    const ex = !h && ((e.existing || []).find((p) => fs.existsSync(p)) || foundExe(e.exe));
    return { id: e.id, name: e.name, desc: e.desc, platform: e.platform || '', exe: h?.exe || ex || '', localOnly: !!e.localOnly };
  }).filter((e) => !e.localOnly || e.exe);
});
ipcMain.handle('emu:install', (ev, ids) => {
  if (emuInstalling) return emuInstalling;
  const send = (m) => { try { ev.sender.send('emu:progress', m); } catch {} };
  emuInstalling = (async () => {
    const results = [];
    for (const e of EMU_CATALOG.filter((x) => !ids || ids.includes(x.id))) {
      let exe = (installedEmus().find((x) => x.id === e.id) || {}).exe;
      if (!exe || !fs.existsSync(exe)) exe = (e.existing || []).find((p) => fs.existsSync(p)) || foundExe(e.exe);
      if (e.localOnly && !exe) continue;
      if (exe && fs.existsSync(exe)) { results.push({ id: e.id, name: e.name, desc: e.desc, platform: e.platform || '', exe, ok: true, already: true }); continue; }
      const dir = path.join(EMU_ROOT, e.name.replace(/[^\w.-]+/g, ''));
      try {
        send({ id: e.id, name: e.name, step: 'download', pct: 0 });
        const { url, file } = await resolveUrl(e);
        if (!url) throw new Error('download link not found');
        const tmp = path.join(app.getPath('temp'), 'preview-' + file);
        const bytes = await download(url, tmp, (pct) => send({ id: e.id, name: e.name, step: 'download', pct }));
        send({ id: e.id, name: e.name, step: 'extract' });
        await extract(tmp, dir);
        try { fs.unlinkSync(tmp); } catch {}
        exe = findExe(dir, e.exe) || findExe(dir, /^(?!.*(unins|update|crash|vc_?redist)).*\.exe$/i);
        if (!exe) throw new Error('exe not found after extract');
        const list = installedEmus().filter((x) => x.id !== e.id);
        list.push({ id: e.id, name: e.name, exe, platform: e.platform || '' });
        fs.writeFileSync(emuIndexFile(), JSON.stringify(list, null, 1));
        log('emu installed', e.name, (bytes / 1048576).toFixed(1) + 'MB', exe);
        results.push({ id: e.id, name: e.name, desc: e.desc, platform: e.platform || '', exe, ok: true });
        send({ id: e.id, name: e.name, step: 'done' });
      } catch (err) {
        log('emu install failed', e.name, err.message);
        results.push({ id: e.id, name: e.name, desc: e.desc, ok: false, error: err.message });
        send({ id: e.id, name: e.name, step: 'fail', error: err.message });
      }
    }
    return results;
  })().finally(() => { emuInstalling = null; });
  return emuInstalling;
});

function walk(dir, depth, out, exts, limit = 5000) {
  if (depth < 0 || out.length > limit) return;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full, depth - 1, out, exts, limit);
    else {
      const ext = path.extname(d.name).slice(1).toLowerCase();
      if (exts.includes(ext) || exts.includes(d.name.toLowerCase())) out.push(full);
    }
  }
}
// PS3 games: read the real title from PARAM.SFO
function sfoTitle(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.readUInt32LE(0) !== 0x46535000) return null;
    const keys = b.readUInt32LE(8), vals = b.readUInt32LE(12), n = b.readUInt32LE(16);
    for (let i = 0; i < n; i++) {
      const e = 20 + i * 16;
      const kOff = b.readUInt16LE(e), len = b.readUInt32LE(e + 4), vOff = b.readUInt32LE(e + 12);
      const kEnd = b.indexOf(0, keys + kOff);
      if (b.toString('utf8', keys + kOff, kEnd) === 'TITLE') return b.toString('utf8', vals + vOff, vals + vOff + len).replace(/\0[\s\S]*$/, '').trim();
    }
  } catch {}
  return null;
}
ipcMain.handle('emu:scan', (_e, romDir, exts) => {
  const found = [];
  walk(romDir, 4, found, exts.map((x) => x.toLowerCase()));
  // A .bin next to a .cue of the same game is part of it, not a game on its own.
  const cues = new Set(found.filter((f) => /\.cue$/i.test(f)).map((f) => f.replace(/\.cue$/i, '').toLowerCase()));
  return found
    .filter((f) => !(/\.bin$/i.test(f) && cues.has(f.replace(/( \(Track \d+\))?\.bin$/i, '').toLowerCase())))
    .map((f) => {
      const isEboot = /eboot\.bin$/i.test(f);
      const raw = isEboot ? (sfoTitle(path.resolve(f, '..', '..', 'PARAM.SFO')) || path.basename(path.resolve(f, '..', '..', '..')))
        : path.basename(f).replace(/\.[^.]+$/, '');
      return { file: f, raw };
    });
});

// Steam's store answers "Access Denied" when asked too much at once: one request at a time, a short gap between
let steamChain = Promise.resolve();
function steamJson(url) {
  const job = steamChain.then(async () => {
    for (let i = 0; i < 3; i++) {
      const t = await (await net.fetch(url)).text();
      await new Promise((r) => setTimeout(r, 350));
      if (t.trim().startsWith('{') || t.trim().startsWith('[')) return JSON.parse(t);
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
    }
    throw new Error('steam busy');
  });
  steamChain = job.catch(() => {});
  return job;
}
const coverMemo = new Map();
// ---------- Auto cover art: Steam store -> Wikipedia -> web image search ----------
const coverClean = (name) => String(name).replace(/[™®©*]/g, '').replace(/\s*[([].*?[)\]]/g, '').replace(/\b(launcher|demo|playtest|beta|early access)\b/gi, '').replace(/\s+/g, ' ').trim();
async function steamCover(name) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const term of [...new Set([coverClean(name), name.replace(/[™®©]/g, '').trim()])]) {
    if (!term) continue;
    const j = await steamJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`);
    const items = j.items || [], n = norm(term);
    // only the same game: same name, or the store name is the game name plus a subtitle ("Overwatch" -> "Overwatch 2")
    const hit = items.find((i) => norm(i.name) === n) || items.find((i) => { const m = norm(i.name); return m && n.length >= 4 && (m.startsWith(n) && n.length >= m.length * 0.6 || n.startsWith(m) && m.length >= n.length * 0.7); });
    if (hit) { const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${hit.id}`; return { image: `${cdn}/library_600x900.jpg`, hero: `${cdn}/library_hero.jpg`, matched: hit.name }; }
  }
  return null;
}
ipcMain.handle('cover:find', async (_e, name, noSteam) => {
  const key = `${noSteam ? 1 : 0}|${name}`;
  if (!coverMemo.has(key)) coverMemo.set(key, (async () => {
    // no general picture search: a wrong picture is worse than just the name
    for (const f of [steamCover, wikiCover]) { try { const r = await f(name); if (r?.image) return r; } catch (e) { log('cover', f.name, name, e.message); } }
    return null;
  })());
  return coverMemo.get(key);
});
// Games that aren't on Steam (Fortnite, Roblox, Xbox titles...): the picture from the game's Wikipedia article
async function wikiCover(name) {
  const clean = coverClean(name);
  const H = { headers: { 'User-Agent': 'SilverBullet/1.0' } };
  const sr = await (await net.fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(clean + ' video game')}`, H)).json();
  const norm = (x) => x.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  const want = norm(clean);
  // the article must be the game itself: same title (a "(video game)" ending is fine), not "X Legends" or "X Corporation"
  const hits = [{ title: `${clean} (video game)` }, { title: clean }, ...(sr.query?.search || []).filter((h) => want && norm(h.title) === want)];
  for (const h of hits) { // only an article about a game counts (not a word that happens to match)
    const sum = await (await net.fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, '_'))}?redirect=true`, H)).json().catch(() => ({}));
    if (!sum.title || sum.type === 'disambiguation' || norm(sum.title) !== want) continue;
    if (!/video game|videogame|game platform|online game|\bgame\b/i.test(sum.description || '') && !/is a .{0,60}(video game|game)/i.test(String(sum.extract || '').slice(0, 200))) continue;
    // the article's main picture (usually the box art); an .svg logo comes as a .png thumbnail
    let img = (sum.originalimage?.source && !/\.svg/i.test(sum.originalimage.source)) ? sum.originalimage.source : sum.thumbnail?.source;
    if (!img) { // box art is usually a "non-free" file, which the summary leaves out: ask for the article's infobox picture directly
      const wt = await (await net.fetch(`https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&section=0&redirects=1&page=${encodeURIComponent(sum.title)}`, H)).json().catch(() => ({}));
      const text = wt.parse?.wikitext?.['*'] || '';
      const m = /\|\s*(?:image|cover)\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n]+?\.(?:jpe?g|png|webp|svg))/i.exec(text);
      const file = m && m[1].trim();
      if (file) {
        const ii = await (await net.fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=600&titles=${encodeURIComponent('File:' + file)}`, H)).json().catch(() => ({}));
        const info = Object.values(ii.query?.pages || {})[0]?.imageinfo?.[0];
        img = info ? (/\.svg/i.test(info.url) ? info.thumburl : info.url) : null;
      }
    }
    log('wiki', sum.title, img ? 'found' : 'no picture');
    if (img) return { image: img, hero: '', matched: sum.title };
  }
  return null;

}
// Last resort: a picture search (Bing images), preferring tall box-art shaped pictures
async function webCover(name) {
  const q = `${coverClean(name)} video game cover art`;
  const html = await (await net.fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' } })).text();
  const res = [];
  for (const m of html.matchAll(/class="iusc"[^>]*\sm="([^"]+)"/g)) {
    try { const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); if (j.murl && /^https:/.test(j.murl) && !/\.svg|\.gif/i.test(j.murl)) res.push(j); } catch {}
    if (res.length >= 12) break;
  }
  // Bing's metadata doesn't always carry sizes, so prefer the box-art words in the address/title
  const flat = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = coverClean(name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^(the|and|for|with|game|edition)$/.test(w));
  const about = (r) => { const h = flat(decodeURIComponent(r.murl) + ' ' + (r.t || '') + ' ' + (r.purl || '')); return words.length && words.filter((w) => h.includes(w)).length >= Math.ceil(words.length * 0.6); };
  const good = res.filter(about);
  const pick = good.find((r) => /cover|box|poster|capsule|600x900|key.?art|steam/i.test(r.murl + ' ' + (r.t || ''))) || good[0];
  return pick ? { image: pick.murl, hero: '', matched: pick.t || name } : null;
}

ipcMain.handle('cover:check', async (_e, url) => {
  try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) }); return r.ok; } catch { return false; }
});
// Console box art: read the archive's file list once per system, then match names loosely
const lrIndex = {};
const looseName = (s) => String(s).toLowerCase().replace(/\.png$/, '').replace(/\s*[([].*?[)\]]/g, '').replace(/^the\s+|,\s*the\b/g, '').replace(/[^a-z0-9]/g, '');
const lrPending = {};
function libretroList(system) {
  if (lrIndex[system]) return Promise.resolve(lrIndex[system]);
  return (lrPending[system] ||= libretroFetch(system).finally(() => { delete lrPending[system]; }));
}
async function libretroFetch(system) {
  const cacheFile = path.join(app.getPath('userData'), `art-index-${system.replace(/[^a-z0-9]/gi, '_')}.json`);
  try { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (Date.now() - c.t < 14 * 864e5) return (lrIndex[system] = c.names); } catch {}
  try {
    // The box art archive lives in one GitHub repository per system
    const repo = system.replace(/ /g, '_');
    const gh = (u) => fetch(u, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Preview', Accept: 'application/vnd.github+json' } });
    const top = await gh(`https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master`);
    const topText = await top.text();
    if (!top.ok) { log('art index', system, 'top', top.status, topText.slice(0, 120)); lrIndex[system] = []; return []; }
    const sha = (JSON.parse(topText).tree || []).find((t) => t.path === 'Named_Boxarts')?.sha;
    if (!sha) { lrIndex[system] = []; return []; }
    const r = await gh(`https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/${sha}`);
    const txt = await r.text();
    if (!r.ok) { log('art index', system, r.status, txt.slice(0, 120)); lrIndex[system] = []; return []; }
    const names = (JSON.parse(txt).tree || []).map((t) => t.path).filter((p) => p.endsWith('.png'));
    log('art index', system, r.status, names.length);
    if (names.length) { fs.writeFileSync(cacheFile, JSON.stringify({ t: Date.now(), names })); lrIndex[system] = names; }
    return names;
  } catch (e) { log('art index failed', system, e.message); lrIndex[system] = []; return []; }
}
ipcMain.handle('art:console', async (_e, system, name) => {
  const names = await libretroList(system);
  if (!names.length) return null;
  const want = looseName(name);
  if (want.length < 2) return null;
  const pick = (list) => list.find((n) => /\(USA/.test(n)) || list.find((n) => /\(Europe/.test(n)) || list[0];
  let hits = names.filter((n) => looseName(n) === want);
  if (!hits.length) hits = names.filter((n) => { const l = looseName(n); return l.length > 4 && (l.startsWith(want) || want.startsWith(l)); });
  const best = hits.length ? pick(hits) : null;
  return best ? `https://raw.githubusercontent.com/libretro-thumbnails/${system.replace(/ /g, '_')}/master/Named_Boxarts/${encodeURIComponent(best)}` : null;
});

// Newer Steam games keep their art at hashed addresses; the store API knows them.
ipcMain.handle('cover:steamApp', async (_e, appid) => {
  try {
    const d = (await steamJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`))?.[appid]?.data;
    if (!d) return null;
    return { image: d.header_image || null, hero: d.background_raw || d.background || null };
  } catch { return null; }
});

// ---------- Bundled tools (DS4Windows): unpack once from the downloaded release zip ----------
function unpackTools() {
  const dir = path.join(SRC_DIR, 'Tools');
  try {
    const zip = fs.readdirSync(dir).find((f) => /^DS4Windows_.*\.zip$/i.test(f));
    if (!zip || fs.existsSync(path.join(dir, 'DS4Windows', 'DS4Windows.exe'))) return;
    execFile('tar', ['-xf', path.join(dir, zip), '-C', dir], { windowsHide: true }, (err) => log('ds4windows unpack', err ? 'failed: ' + err.message : 'ok'));
  } catch {}
}
ipcMain.handle('tools:ds4', () => {
  const exe = path.join(SRC_DIR, 'Tools', 'DS4Windows', 'DS4Windows.exe');
  return fs.existsSync(exe) ? exe : null;
});

// ---------- Bluetooth battery levels (headsets, controllers, mice that report it to Windows) ----------
let batteryPending = null;
ipcMain.handle('bt:battery', () => {
  if (batteryPending) return batteryPending; // one query at a time
  let timer;
  batteryPending = Promise.race([
    readBattery(),
    new Promise((r) => { timer = setTimeout(() => { log('battery timeout'); r([]); }, 30000); }),
  ]).finally(() => { clearTimeout(timer); batteryPending = null; });
  return batteryPending;
});
const readBattery = () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve([]);
  const t0 = Date.now();
  const child = execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'battery.ps1')], { windowsHide: true, timeout: 45000, killSignal: 'SIGKILL' }, (err, out, errOut) => {
    log(`battery query ${Date.now() - t0}ms`, err ? 'error ' + err.message : 'ok', String(out || '').slice(0, 300), String(errOut || '').slice(0, 200));
    if (err) return resolve([]);
    try {
      const list = JSON.parse(out.trim() || '[]');
      const seen = new Map();
      for (const d of list) if (d.name && !seen.has(d.name)) seen.set(d.name, d);
      // an Xbox pad on Bluetooth shows twice (Bluetooth + XInput): keep the exact one
      const all = [...seen.values()];
      const btXbox = all.some((d) => !d.approx && /xbox/i.test(d.name));
      resolve(all.filter((d) => !(d.approx && btXbox)));
    } catch { resolve([]); }
  });
});

// ---------- My series & movies: video folders on this PC ----------
const VIDEO_EXT = /\.(mp4|mkv|webm|m4v|mov|avi|wmv|ts)$/i;
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
function videosIn(dir, depth = 0, out = []) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory() && depth < 2 && !/^(sample|extras?|subs?|featurettes?)$/i.test(e.name)) videosIn(f, depth + 1, out);
    else if (e.isFile() && VIDEO_EXT.test(e.name) && !/sample/i.test(e.name)) { try { out.push({ file: f, name: e.name, size: fs.statSync(f).size }); } catch {} }
  }
  return out;
}
function posterIn(dir) {
  try { const p = fs.readdirSync(dir).find((x) => /^(poster|cover|folder|fanart)\.(jpe?g|png|webp)$/i.test(x)); return p ? path.join(dir, p) : ''; } catch { return ''; }
}
ipcMain.handle('series:scan', (_e, folders) => {
  const shows = [];
  for (const root of folders || []) {
    let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    const direct = ents.filter((e) => e.isFile() && VIDEO_EXT.test(e.name));
    // a folder of episodes is one show; a folder of folders is a shelf of shows
    if (direct.length && !ents.some((e) => e.isDirectory() && videosIn(path.join(root, e.name)).length)) {
      shows.push({ name: path.basename(root), dir: root, poster: posterIn(root), episodes: videosIn(root).sort((a, b) => natural(a.file, b.file)) });
      continue;
    }
    for (const e of ents) {
      const d = path.join(root, e.name);
      if (e.isDirectory()) { const eps = videosIn(d).sort((a, b) => natural(a.file, b.file)); if (eps.length) shows.push({ name: e.name, dir: d, poster: posterIn(d), episodes: eps }); }
      else if (e.isFile() && VIDEO_EXT.test(e.name)) shows.push({ name: e.name.replace(VIDEO_EXT, ''), dir: d, poster: '', episodes: [{ file: d, name: e.name, size: fs.statSync(d).size }], movie: true });
    }
  }
  return shows.sort((a, b) => natural(a.name, b.name));
});

// ---------- Screenshots & clips per game ----------
const IMG_RE = /\.(png|jpe?g|webp|bmp)$/i, VID_RE = /\.(mp4|mkv|webm|mov)$/i;
const normName = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9؀-ۿ]/g, '');
function listMedia(dir, depth, out, limit = 4000) {
  if (depth < 0 || out.length > limit) return;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) listMedia(f, depth - 1, out, limit);
    else if (IMG_RE.test(d.name) || VID_RE.test(d.name)) out.push(f);
  }
}
const shotsRoot = () => path.join(app.getPath('pictures'), 'Preview Shots');
ipcMain.handle('shots:scan', async (_e, games) => {
  // games: [{ id, name, appid }]
  const result = {}; const add = (id, f, src) => { (result[id] ||= []).push({ f, src }); };
  const byNorm = games.map((g) => ({ ...g, n: normName(g.name) })).filter((g) => g.n.length >= 3);
  const matchFolder = (folder) => {
    const n = normName(folder);
    if (n.length < 3) return null;
    return byNorm.find((g) => g.n === n) || byNorm.find((g) => n.includes(g.n) || g.n.includes(n));
  };
  const videos = app.getPath('videos'), pictures = app.getPath('pictures');
  // 1) Steam screenshots by app id
  try {
    const root = await steamRoot();
    if (root) for (const u of fs.readdirSync(path.join(root, 'userdata'))) {
      const base = path.join(root, 'userdata', u, '760', 'remote');
      let apps = []; try { apps = fs.readdirSync(base); } catch { continue; }
      for (const appid of apps) {
        const g = games.find((x) => String(x.appid) === appid); if (!g) continue;
        const files = []; listMedia(path.join(base, appid, 'screenshots'), 0, files);
        files.forEach((f) => add(g.id, f, 'Steam'));
      }
    }
  } catch {}
  // 2) Folders named after the game: NVIDIA, Medal, Preview's own shots, Videos/Pictures
  const folderRoots = [
    [videos, 'NVIDIA'], [path.join(videos, 'NVIDIA'), 'NVIDIA'], [path.join(videos, 'Medal'), 'Medal'], [path.join(videos, 'Medal', 'Clips'), 'Medal'],
    [path.join(pictures, 'Medal'), 'Medal'], [shotsRoot(), 'Preview'], [path.join(pictures, 'Screenshots'), 'Windows'],
  ];
  for (const [root, src] of folderRoots) {
    let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const d of ents) {
      if (!d.isDirectory()) continue;
      const g = matchFolder(d.name); if (!g) continue;
      const files = []; listMedia(path.join(root, d.name), 2, files);
      files.forEach((f) => add(g.id, f, src));
    }
  }
  // 3) Xbox Game Bar: Videos/Captures/"<Game> <date>.png"
  try {
    for (const f of fs.readdirSync(path.join(videos, 'Captures'))) {
      if (!IMG_RE.test(f) && !VID_RE.test(f)) continue;
      const title = f.replace(/\s+\d{4}[-_.]\d{2}[-_.]\d{2}.*$/, '').replace(/\.[^.]+$/, '');
      const g = matchFolder(title); if (g) add(g.id, path.join(videos, 'Captures', f), 'Xbox');
    }
  } catch {}
  // newest first, de-duplicated, with type and time
  for (const id of Object.keys(result)) {
    const seen = new Set();
    result[id] = result[id].filter((x) => !seen.has(x.f) && seen.add(x.f)).map((x) => {
      let t = 0; try { t = fs.statSync(x.f).mtimeMs; } catch {}
      return { ...x, t, video: VID_RE.test(x.f) };
    }).sort((a, b) => b.t - a.t).slice(0, 300);
  }
  return result;
});
// ---------- Every photo & video on the PC, sorted into kinds ----------
ipcMain.handle('photos:scan', async () => {
  const home = os.homedir(), pics = app.getPath('pictures'), vids = app.getPath('videos'), dl = app.getPath('downloads'), desk = app.getPath('desktop');
  const od = [process.env.OneDrive, process.env.OneDriveConsumer].filter(Boolean);
  const cats = {
    screens: { name: 'لقطات الشاشة', dirs: [path.join(pics, 'Screenshots'), ...od.map((o) => path.join(o, 'Pictures', 'Screenshots')), ...od.map((o) => path.join(o, 'Screenshots'))] },
    camera: { name: 'الكاميرا والجوال', dirs: [path.join(pics, 'Camera Roll'), path.join(pics, 'Saved Pictures'), ...od.map((o) => path.join(o, 'Pictures', 'Camera Roll')), ...od.map((o) => path.join(o, 'Pictures', 'Samsung Gallery')), path.join(pics, 'iCloud Photos'), path.join(home, 'iCloudDrive'), path.join(pics, 'WhatsApp Images')] },
    games: { name: 'مقاطع وصور الألعاب', dirs: [path.join(vids, 'Captures'), path.join(vids, 'NVIDIA'), path.join(vids, 'Medal'), path.join(pics, 'Medal'), path.join(vids, 'Radeon ReLive'), path.join(vids, 'Overwolf'), path.join(pics, 'Preview Shots')] },
    walls: { name: 'خلفيات', dirs: [path.join(pics, 'Wallpapers'), path.join(pics, 'Wallpaper'), ...od.map((o) => path.join(o, 'Pictures', 'Wallpapers'))] },
    videos: { name: 'فيديوهات', dirs: [vids, ...od.map((o) => path.join(o, 'Videos'))], onlyVideo: true },
    pictures: { name: 'صوري', dirs: [pics, ...od.map((o) => path.join(o, 'Pictures'))] },
    downloads: { name: 'من التنزيلات', dirs: [dl], depth: 0 },
    desktop: { name: 'سطح المكتب', dirs: [desk, ...od.map((o) => path.join(o, 'Desktop'))], depth: 0 },
  };
  const taken = new Set(), out = [];
  for (const [id, c] of Object.entries(cats)) {
    const files = [];
    for (const d of c.dirs) { const f = []; listMedia(d, c.depth ?? 3, f, 3000); files.push(...f); }
    const list = [];
    for (const f of files) {
      const k = f.toLowerCase();
      if (taken.has(k) || /[\\/](node_modules|appdata|\.git|thumbs)[\\/]/i.test(f) || /preview-snap|icon|logo|thumb/i.test(path.basename(f))) continue;
      if (c.onlyVideo && !VID_RE.test(f)) continue;
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (!VID_RE.test(f) && st.size < 25000) continue; // tiny pictures are icons, not photos
      taken.add(k);
      list.push({ f, t: st.mtimeMs, video: VID_RE.test(f), src: c.name });
    }
    list.sort((a, b) => b.t - a.t);
    if (list.length) out.push({ id, name: c.name, total: list.length, files: list.slice(0, 600) });
  }
  return out;
});
ipcMain.handle('shots:folder', () => { const d = shotsRoot(); try { fs.mkdirSync(d, { recursive: true }); } catch {} return d; });

// ---------- Send screenshots & clips to the phone over home Wi-Fi ----------
// A small private web page on this PC (only reachable on the same network, with a secret key in
// the address). The phone scans a QR code, sees the games, and saves what it wants.
const http = require('http');
const os = require('os');
const crypto = require('crypto');
let share = null; // { server, token, files: [{ f, video, game }], url, timer }
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime' };
function lanAddress() {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
  return (all.find((i) => /^192\.168\./.test(i.address)) || all.find((i) => /^10\./.test(i.address)) || all.find((i) => /^172\.(1[6-9]|2\d|3[01])\./.test(i.address)) || all[0])?.address;
}
function sharePage(token) {
  const games = {};
  share.files.forEach((x, i) => { (games[x.game] ||= []).push({ ...x, i }); });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const name = (f) => esc(path.basename(f));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Silver Bullet — لقطاتك</title><style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;background:#0d1020;color:#f2f4fa}
header{position:sticky;top:0;background:#0d1020ee;backdrop-filter:blur(8px);padding:14px 16px;border-bottom:1px solid #ffffff22;z-index:2}
h1{margin:0;font-size:20px} header p{margin:4px 0 0;opacity:.7;font-size:13px}
h2{font-size:17px;margin:20px 16px 10px} h2 small{opacity:.6;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:0 16px}
.it{position:relative;border-radius:10px;overflow:hidden;background:#ffffff14;aspect-ratio:16/9}
.it img,.it video{width:100%;height:100%;object-fit:cover;display:block}
.it a.dl{position:absolute;bottom:6px;left:6px;background:#1ed760;color:#000;font-weight:700;font-size:13px;padding:5px 10px;border-radius:999px;text-decoration:none}
.it .tag{position:absolute;top:6px;right:6px;background:#000a;font-size:12px;padding:2px 8px;border-radius:999px}
.it a.open{position:absolute;bottom:6px;right:6px;background:#fff;color:#000;font-weight:700;font-size:13px;padding:5px 10px;border-radius:999px;text-decoration:none}
.tip{margin:10px 16px;padding:10px 12px;border-radius:12px;background:#ffffff12;font-size:13px;line-height:1.6}
footer{padding:24px 16px;opacity:.6;font-size:12px;text-align:center}
</style></head><body><header><h1>📸 من Silver Bullet</h1><p>اضغط "حفظ" على أي صورة أو مقطع.</p></header>
<div class="tip"><b>الصور:</b> افتحها واضغط عليها مطوّل ← "حفظ في الصور".<br><b>المقاطع في الآيفون:</b> اضغط "▶ افتحه" ← زر المشاركة ⬆ تحت ← "حفظ الفيديو". أو "⬇ حفظ" وتلقاه في تطبيق الملفات ← التنزيلات.<br><b>في الأندرويد:</b> "⬇ حفظ" ويروح للتنزيلات والمعرض.</div>
${Object.entries(games).map(([g, l]) => `<h2>${esc(g)} <small>${l.length}</small></h2><div class="grid">${l.map((x) => {
    const src = `/f/${x.i}?t=${token}`;
    return `<div class="it">${x.video ? `<video src="${src}#t=0.5" preload="metadata" controls playsinline></video><span class="tag">🎬 مقطع</span><a class="open" href="${src}" target="_blank">▶ افتحه</a>` : `<a href="${src}" target="_blank"><img src="${src}" loading="lazy" alt="${name(x.f)}"></a>`}<a class="dl" href="${src}&dl=1" download="${name(x.f)}">⬇ حفظ</a></div>`;
  }).join('')}</div>`).join('')}
<footer>هذي الصفحة من جهازك مباشرة وتتقفل لحالها بعد 30 دقيقة.</footer></body></html>`;
}
function stopShare() {
  if (!share) return;
  try { share.server.close(); } catch {}
  clearTimeout(share.timer);
  log('share stopped');
  share = null;
}
// ---------- Rating cards: picture bytes for the canvas, and saving the finished card ----------
ipcMain.handle('img:data', async (_e, src) => {
  try {
    if (!src) return null;
    if (/^https?:/i.test(src)) {
      const r = await net.fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
    }
    const f = src.replace(/^file:\/\/\/?/i, '');
    const file = decodeURI(f).replace(/\//g, path.sep);
    const buf = fs.readFileSync(file);
    return `data:${MIME[path.extname(file).toLowerCase()] || 'image/png'};base64,${buf.toString('base64')}`;
  } catch { return null; }
});
ipcMain.handle('card:save', (_e, dataUrl, name) => {
  const dir = path.join(app.getPath('pictures'), 'Silver Bullet Cards');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(name || 'card').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)} - تقييم.png`);
  fs.writeFileSync(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  return file;
});
ipcMain.handle('card:show', (_e, file) => { shell.showItemInFolder(file); });

ipcMain.handle('share:start', async (_e, groups) => {
  stopShare();
  const files = [];
  for (const g of groups || []) for (const x of g.files || []) if (x && x.f && fs.existsSync(x.f)) files.push({ f: x.f, video: !!x.video, game: g.game });
  if (!files.length) return { error: 'ما فيه لقطات تنرسل' };
  const ip = lanAddress();
  if (!ip) return { error: 'الجهاز مو متصل بشبكة' };
  const token = crypto.randomBytes(9).toString('hex');
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('t') !== token) { res.writeHead(403); return res.end('Preview: الرابط انتهى. امسح الكود من جديد.'); }
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(sharePage(token)); }
    const m = /^\/f\/(\d+)$/.exec(u.pathname);
    const item = m && share?.files[Number(m[1])];
    if (!item) { res.writeHead(404); return res.end(); }
    let st; try { st = fs.statSync(item.f); } catch { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(item.f).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
    if (u.searchParams.get('dl')) { const ascii = path.basename(item.f).replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, ''); headers['Content-Disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(path.basename(item.f))}`; }
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(item.f, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      fs.createReadStream(item.f).pipe(res);
    }
  });
  const port = await new Promise((resolve) => {
    server.once('error', () => server.listen(0, '0.0.0.0', () => resolve(server.address().port)));
    server.listen(8765, '0.0.0.0', () => resolve(server.address().port));
  });
  share = { server, token, files, url: `http://${ip}:${port}/?t=${token}` };
  let qrSvg = '';
  try {
    const QRCode = require('./qr/index.js'), L = require('./qr/QRErrorCorrectLevel.js');
    const q = new QRCode(-1, L.M); q.addData(share.url); q.make();
    const n = q.getModuleCount(), m = 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch (e) { log('qr failed', e.message); }
  share.timer = setTimeout(stopShare, 30 * 60 * 1000);
  log('share started', files.length, 'files on', ip, port);
  return { url: share.url, count: files.length, qr: qrSvg };
});
ipcMain.handle('share:stop', () => { stopShare(); return true; });

// ---------- Find emulators and game folders already on this PC ----------
const EMU_EXES = [
  [/^pcsx2.*\.exe$/i, 'ps2'], [/^duckstation.*\.exe$/i, 'ps1'], [/^ppsspp.*\.exe$/i, 'psp'], [/^dolphin\.exe$/i, 'gc'],
  [/^rpcs3\.exe$/i, 'ps3'], [/^(ryujinx|citron|suyu|sudachi|eden)\.exe$/i, 'switch'], [/^project64\.exe$/i, 'n64'], [/^simple64.*\.exe$/i, 'n64'],
  [/^snes9x.*\.exe$/i, 'snes'], [/^mgba\.exe$/i, 'gba'], [/^melonds\.exe$/i, 'nds'], [/^retroarch\.exe$/i, 'retroarch'],
];
const ROM_EXT = { cue: 'ps1', pbp: 'ps1', cso: 'psp', nsp: 'switch', xci: 'switch', z64: 'n64', n64: 'n64', v64: 'n64', sfc: 'snes', smc: 'snes', gba: 'gba', nds: 'nds', rvz: 'gc', wbfs: 'gc', gcm: 'gc', iso: '?', chd: '?' };
const NAME_HINT = [[/ps ?2|playstation ?2|pcsx2/i, 'ps2'], [/ps ?3|playstation ?3|rpcs3/i, 'ps3'], [/psp|portable/i, 'psp'], [/ps ?1|psx|playstation ?1|duckstation|playstation(?! ?[2-5])/i, 'ps1'], [/psp/i, 'psp'], [/ps ?3|rpcs3/i, 'ps3'], [/gamecube|wii|dolphin|\bgc\b/i, 'gc'], [/switch|nsp/i, 'switch'], [/n64|nintendo ?64/i, 'n64'], [/snes|super nintendo/i, 'snes'], [/gba|game ?boy/i, 'gba'], [/nds|\bds\b/i, 'nds']];
const SKIP_DIR = /^(windows|program files|programdata|\$recycle\.bin|system volume information|node_modules|appdata|\.git|steamapps|epic games|onedrive)$/i;
// Folders that hold emulator files, caches or shaders rather than games
const NOT_GAMES = /[\\/](emulators|software|tools)[\\/]|cache|shader|[\\/]temp|firmware|[\\/]dlc|[\\/]updates?[\\/]?|[\\/]saves?[\\/]?|[\\/]bios|texture|[\\/]logs?[\\/]?$/i;
ipcMain.handle('emu:discover', () => {
  const home = app.getPath('home');
  const roots = [path.join(home, 'Games'), path.join(home, 'Documents'), path.join(home, 'Downloads'), app.getPath('desktop'), 'D:\\', 'E:\\', 'F:\\', 'C:\\Games', 'C:\\Emulators']
    .filter((r, i, a) => a.indexOf(r) === i && fs.existsSync(r));
  const folders = new Map(), emus = [];
  let visited = 0;
  const walkD = (dir, depth) => {
    if (depth < 0 || visited > 20000) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    visited++;
    for (const d of ents) {
      const f = path.join(dir, d.name);
      if (d.isDirectory()) { if (!SKIP_DIR.test(d.name)) walkD(f, depth - 1); continue; }
      const e = EMU_EXES.find(([re]) => re.test(d.name));
      if (e) emus.push({ platform: e[1], exe: f });
      const ext = path.extname(d.name).slice(1).toLowerCase();
      if (ROM_EXT[ext] && !NOT_GAMES.test(dir + path.sep)) {
        let p = ROM_EXT[ext];
        const hint = (NAME_HINT.find(([re]) => re.test(dir)) || [])[1];
        if (p === '?' || ext === 'cso' || ext === 'pbp') p = hint || (ext === 'cso' ? null : '?');
        if (!p) continue;
        const k = dir + '|' + p;
        folders.set(k, { dir, platform: p, count: (folders.get(k)?.count || 0) + 1 });
      }
    }
  };
  for (const r of roots) walkD(r, 4);
  for (const pf of ['C:\\Program Files', 'C:\\Program Files (x86)']) {
    let ents = []; try { ents = fs.readdirSync(pf, { withFileTypes: true }); } catch {}
    for (const d of ents) if (d.isDirectory() && /pcsx2|duckstation|ppsspp|dolphin|rpcs3|ryujinx|retroarch|project64|snes9x|mgba|melonds/i.test(d.name)) walkD(path.join(pf, d.name), 1);
  }
  const res = { folders: [...folders.values()].filter((f) => f.count >= 1).sort((a, b) => b.count - a.count).slice(0, 30), emus: emus.slice(0, 30), visited };
  log('emu discover', JSON.stringify(res).slice(0, 1500));
  return res;
});

// ---------- Window: full screen, start with Windows ----------
ipcMain.handle('win:fullscreen', (_e, on) => { if (mainWin) mainWin.setFullScreen(on === undefined ? !mainWin.isFullScreen() : !!on); return mainWin?.isFullScreen(); });
ipcMain.handle('app:autostart', (_e, on) => {
  const vbs = path.join(SRC_DIR, 'launch.vbs');
  const opts = fs.existsSync(INSTALLED_EXE) ? { openAtLogin: !!on, path: INSTALLED_EXE, args: [] } : fs.existsSync(vbs)
    ? { openAtLogin: !!on, path: path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe'), args: [`"${vbs}"`] }
    : { openAtLogin: !!on };
  try { app.setLoginItemSettings(opts); } catch (e) { log('autostart failed', e.message); }
  return app.getLoginItemSettings(opts).openAtLogin;
});

// ---------- Pictures for websites (watch page tiles): the page's own share image or icon ----------
ipcMain.handle('web:meta', async (_e, url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' } });
    const html = (await r.text()).slice(0, 400000);
    const pick = (re) => { const m = re.exec(html); return m ? new URL(m[1].replace(/&amp;/g, '&'), r.url).href : null; };
    const image = pick(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]+content=["']([^"']+)/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)/i);
    const icon = pick(/<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]+href=["']([^"']+)/i) || new URL('/favicon.ico', r.url).href;
    const title = (/<title[^>]*>([^<]{1,120})/i.exec(html) || [])[1]?.trim() || null;
    return { image, icon, title };
  } catch (e) { return null; }
});

// ---------- Now playing via Windows media controls (album art, position, seeking) ----------
let mediaProc = null, mediaJobs = new Map(), mediaBuf = '', mediaSeq = 0;
function mediaHelper() {
  if (mediaProc || process.platform !== 'win32') return mediaProc;
  const script = path.join(__dirname, 'ps', 'media.ps1');
  if (!fs.existsSync(script)) return null;
  mediaProc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  mediaProc.stdout.setEncoding('utf8');
  mediaProc.stdout.on('data', (d) => {
    mediaBuf += d;
    let i;
    while ((i = mediaBuf.indexOf('\n')) >= 0) {
      const line = mediaBuf.slice(0, i).trim(); mediaBuf = mediaBuf.slice(i + 1);
      let o; try { o = JSON.parse(line); } catch { continue; }
      const job = mediaJobs.get(String(o.id));
      if (job) { mediaJobs.delete(String(o.id)); clearTimeout(job.t); job.resolve(o); }
      if (o.error && !mediaHelper.warned) { mediaHelper.warned = true; log('media helper error:', o.error); }
    }
  });
  mediaProc.stderr.on('data', (d) => log('media helper:', String(d).slice(0, 300)));
  mediaProc.on('exit', () => { mediaProc = null; for (const j of mediaJobs.values()) j.resolve({ ok: false }); mediaJobs.clear(); });
  return mediaProc;
}
function mediaAsk(cmd, wait = 8000) {
  return new Promise((resolve) => {
    const p = mediaHelper();
    if (!p) return resolve({ ok: false });
    const id = String(++mediaSeq);
    mediaJobs.set(id, { resolve, t: setTimeout(() => { mediaJobs.delete(id); resolve({ ok: false, timeout: true }); }, wait) });
    p.stdin.write(`${id} ${cmd}\n`);
  });
}
ipcMain.handle('media:now', (_e, withThumb) => mediaAsk(withThumb ? 'get thumb' : 'get', withThumb ? 15000 : 8000));
// Song cover when Windows doesn't hand it over: look the song up in the public iTunes catalogue
const artCache = new Map();
ipcMain.handle('media:art', async (_e, title, artist) => {
  const key = `${title}|${artist}`;
  if (artCache.has(key)) return artCache.get(key);
  let url = '';
  try {
    const q = encodeURIComponent(`${artist || ''} ${title || ''}`.replace(/\(.*?\)|\[.*?\]|feat\..*$/gi, '').trim());
    const j = await (await net.fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=3`)).json();
    const hit = (j.results || [])[0];
    if (hit?.artworkUrl100) url = hit.artworkUrl100.replace('100x100bb', '600x600bb');
  } catch (e) { log('art lookup failed', e.message); }
  artCache.set(key, url);
  return url;
});
ipcMain.handle('media:seek', (_e, sec) => mediaAsk(`seek ${Number(sec) || 0}`));
app.on('will-quit', () => { try { mediaProc?.kill(); } catch {} });

// ---------- Spotify inside Preview: the real Spotify window docked over the Spotify page ----------
let dockProc = null, dockQueue = [], dockBuf = '', dockRect = null, dockShown = false;
function dockHelper() {
  if (dockProc || process.platform !== 'win32') return dockProc;
  const script = path.join(__dirname, 'ps', 'dock.ps1');
  if (!fs.existsSync(script)) return null;
  dockProc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  dockProc.stdout.setEncoding('utf8');
  dockProc.stdout.on('data', (d) => {
    dockBuf += d;
    let i;
    while ((i = dockBuf.indexOf('\n')) >= 0) {
      const line = dockBuf.slice(0, i).trim(); dockBuf = dockBuf.slice(i + 1);
      const job = dockQueue.shift();
      if (job) { clearTimeout(job.t); try { job.resolve(JSON.parse(line)); } catch { job.resolve({ ok: false }); } }
    }
  });
  dockProc.stderr.on('data', (d) => log('dock helper:', String(d).slice(0, 300)));
  dockProc.on('exit', () => { dockProc = null; dockQueue.splice(0).forEach((j) => j.resolve({ ok: false })); });
  return dockProc;
}
function dockAsk(cmd) {
  return new Promise((resolve) => {
    const p = dockHelper();
    if (!p) return resolve({ ok: false });
    const job = { resolve, t: setTimeout(() => { const k = dockQueue.indexOf(job); if (k >= 0) dockQueue.splice(k, 1); resolve({ ok: false, timeout: true }); }, 15000) };
    dockQueue.push(job);
    p.stdin.write(cmd + '\n');
  });
}
function dockPlace() {
  if (!mainWin || !dockRect || !dockShown) return Promise.resolve({ ok: false });
  if (mainWin.isMinimized()) return dockAsk('hide');
  const cb = mainWin.getContentBounds();
  const z = mainWin.webContents.getZoomFactor() || 1;
  const dip = { x: Math.round(cb.x + dockRect.x * z), y: Math.round(cb.y + dockRect.y * z), width: Math.round(dockRect.width * z), height: Math.round(dockRect.height * z) };
  const r = screen.dipToScreenRect(mainWin, dip);
  const hwnd = mainWin.getNativeWindowHandle().readBigUInt64LE(0);
  return dockAsk(`show ${hwnd} ${r.x} ${r.y} ${r.width} ${r.height}`);
}
ipcMain.handle('spdock:show', async (_e, rect) => {
  dockRect = rect; dockShown = true;
  let f = await dockAsk('find');
  if (!f.ok) {
    const l = await dockAsk('launch');
    log('spotify launch', JSON.stringify(l), 'find', JSON.stringify(f));
    if (l.how === 'none') return { ok: false, none: true, notInstalled: true };
    for (let i = 0; i < 90 && dockShown && !(f = await dockAsk('find')).ok; i++) await new Promise((r) => setTimeout(r, 500));
    if (!f.ok) { log('spotify dock: window not found', JSON.stringify(f)); return { ok: false, none: true }; }
    await new Promise((r) => setTimeout(r, 1500)); // let Spotify finish drawing its window
  }
  if (!dockShown) return { ok: true };
  const r = await dockPlace();
  log('spotify dock', JSON.stringify(r));
  return r;
});
ipcMain.handle('spdock:move', (_e, rect) => { dockRect = rect; return dockPlace(); });
ipcMain.handle('spdock:hide', () => { dockShown = false; return dockProc ? dockAsk('hide') : { ok: true }; });
let dockMoveT = 0;
const dockFollow = () => { if (dockShown) { clearTimeout(dockMoveT); dockMoveT = setTimeout(dockPlace, 30); } };
function hookDock(w) {
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore']) w.on(ev, dockFollow);
  w.on('minimize', () => { if (dockShown) dockAsk('hide'); });
  w.on('close', () => { if (dockProc) { try { dockProc.stdin.write('release\n'); } catch {} } });
}
app.on('will-quit', () => { try { dockProc?.stdin.end(); } catch {} });

// ---------- Spotify: what's playing (read from the Spotify window title) ----------
ipcMain.handle('spotify:now', () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve({ running: false });
  const ps = "$p = Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1; if ($p) { $p.MainWindowTitle } else { if (Get-Process Spotify -ErrorAction SilentlyContinue) { '__RUNNING__' } }";
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
    const t = String(out || '').trim();
    if (err || !t) return resolve({ running: false });
    if (t === '__RUNNING__' || /^spotify( premium| free)?$/i.test(t)) return resolve({ running: true, playing: false });
    const i = t.indexOf(' - ');
    resolve({ running: true, playing: true, artist: i > 0 ? t.slice(0, i) : '', track: i > 0 ? t.slice(i + 3) : t });
  });
}));

// ---------- Video position inside web tabs (works in embedded players too) ----------
const VIDEO_JS = `(() => {
  const vids = [...document.querySelectorAll('video')].filter(v => v.duration && isFinite(v.duration) && v.duration > 30);
  if (!vids.length) return null;
  const v = vids.sort((a, b) => b.duration - a.duration)[0];
  return { t: v.currentTime, d: v.duration, playing: !v.paused };
})()`;
async function eachFrame(wcId, fn) {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed()) return null;
  for (const f of wc.mainFrame.framesInSubtree) {
    try { const r = await fn(f); if (r) return r; } catch {}
  }
  return null;
}
ipcMain.handle('video:state', (_e, wcId) => eachFrame(wcId, (f) => f.executeJavaScript(VIDEO_JS)));
ipcMain.handle('video:seek', (_e, wcId, t) => eachFrame(wcId, (f) => f.executeJavaScript(`(() => {
  const vids = [...document.querySelectorAll('video')].filter(v => v.duration && isFinite(v.duration) && v.duration > 30);
  if (!vids.length) return null;
  const v = vids.sort((a, b) => b.duration - a.duration)[0];
  v.currentTime = ${Number(t) || 0};
  return true;
})()`)));

// ---------- Music (media keys control Spotify or whatever player is active) ----------
const MEDIA_VK = { playpause: 0xB3, next: 0xB0, prev: 0xB1, volup: 0xAF, voldown: 0xAE };
ipcMain.handle('media:key', (_e, key) => new Promise((resolve) => {
  const vk = MEDIA_VK[key];
  if (!vk || process.platform !== 'win32') return resolve(false);
  const ps = `Add-Type -Name K -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);'; [W.K]::keybd_event(${vk},0,1,[UIntPtr]::Zero); [W.K]::keybd_event(${vk},0,3,[UIntPtr]::Zero)`;
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { windowsHide: true }, (err) => resolve(!err));
}));

ipcMain.handle('pick:file', async (_e, kind) => {
  const filters = kind === 'image' ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    : kind === 'media' ? [{ name: 'Image or video', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'] }]
    : kind === 'torrent' ? [{ name: 'Torrent', extensions: ['torrent'] }]
    : kind === 'audio' ? [{ name: 'Music', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus'] }]
    : [{ name: 'All files', extensions: ['*'] }];
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- Steam import ----------
function parseVdf(text) {
  const root = {}; const stack = [root]; let key = null;
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g; let m;
  while ((m = re.exec(text))) {
    const cur = stack[stack.length - 1];
    if (m[2] === '{') { const o = {}; cur[key] = o; stack.push(o); key = null; }
    else if (m[2] === '}') { stack.pop(); key = null; }
    else if (key === null) key = m[1].replace(/\\\\/g, '\\');
    else { cur[key] = m[1].replace(/\\\\/g, '\\'); key = null; }
  }
  return root;
}
const getCI = (o, k) => o && Object.entries(o).find(([kk]) => kk.toLowerCase() === k.toLowerCase())?.[1];
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

function steamRoot() {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], (err, out) => {
      const m = !err && /SteamPath\s+REG_SZ\s+(.+)/i.exec(out || '');
      const guess = m ? m[1].trim() : 'C:\\Program Files (x86)\\Steam';
      resolve(fs.existsSync(guess) ? guess : null);
    });
  });
}

// where a Steam game is installed (for mods / translations)
async function steamGameDir(appid) {
  const root = await steamRoot(); if (!root) return null;
  const libs = new Set([root]);
  const lf = readText(path.join(root, 'steamapps', 'libraryfolders.vdf'));
  if (lf) for (const v of Object.values(getCI(parseVdf(lf), 'libraryfolders') || {})) { const p = typeof v === 'object' ? getCI(v, 'path') : null; if (p) libs.add(p); }
  for (const l of libs) {
    const acf = readText(path.join(l, 'steamapps', `appmanifest_${appid}.acf`));
    if (acf) { const dir = getCI(getCI(parseVdf(acf), 'AppState') || {}, 'installdir'); if (dir) return path.join(l, 'steamapps', 'common', dir); }
  }
  return null;
}
const SKIP = /redistributable|steamworks|proton|steam linux runtime|soundtrack|dedicated server|sdk/i;

// ---------- Game page extras: what the game is about + your 5 hardest achievements (Steam) ----------
const stripHtml = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
async function steamUserId() {
  const root = await steamRoot(); if (!root) return null;
  const users = getCI(parseVdf(readText(path.join(root, 'config', 'loginusers.vdf')) || ''), 'users') || {};
  const list = Object.entries(users);
  const recent = list.find(([, u]) => getCI(u, 'MostRecent') === '1') || list[0];
  return recent ? recent[0] : null;
}
async function wikiAbout(name) {
  for (const lang of ['ar', 'en']) {
    try {
      const q = name.replace(/[™®©*]/g, '').trim() + (lang === 'en' ? ' video game' : ' لعبة');
      const sr = await (await net.fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'SilverBullet/1.0' } })).json();
      const hit = sr.query?.search?.[0]; if (!hit) continue;
      const sum = await (await net.fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`, { headers: { 'User-Agent': 'SilverBullet/1.0' } })).json();
      if (sum.extract && sum.extract.length > 60) return sum.extract.split(/(?<=[.!؟])\s/).slice(0, 3).join(' ');
    } catch {}
  }
  return '';
}
ipcMain.handle('game:info', async (_e, item) => {
  const out = { desc: '', trophies: [], trophyNote: '' };
  const m = /^steam:\/\/rungameid\/(\d+)/.exec(item?.target || '');
  try {
    if (m) {
      const id = m[1];
      for (const l of ['arabic', 'english']) {
        const j = await (await net.fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=${l}`)).json();
        const d = j?.[id]?.data;
        if (d?.short_description) { out.desc = stripHtml(d.short_description); out.genres = (d.genres || []).map((g) => g.description).slice(0, 4); out.dev = (d.developers || [])[0] || ''; out.year = (d.release_date?.date || '').slice(-4); break; }
      }
      const sid = await steamUserId();
      if (sid) {
        const xml = await (await net.fetch(`https://steamcommunity.com/profiles/${sid}/stats/${id}/achievements/?xml=1&l=arabic`)).text();
        if (/<achievements>/i.test(xml)) {
          const got = [...xml.matchAll(/<achievement closed="1">([\s\S]*?)<\/achievement>/g)].map(([, b]) => {
            const tag = (t) => (new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`).exec(b) || [])[1] || '';
            return { api: tag('apiname'), name: tag('name'), desc: tag('description'), icon: tag('iconClosed') };
          });
          const total = (xml.match(/<achievement /g) || []).length;
          let pct = {};
          try { const g = await (await net.fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${id}&format=json`)).json(); for (const a of g.achievementpercentages?.achievements || []) pct[a.name.toLowerCase()] = Number(a.percent); } catch {}
          out.trophies = got.map((a) => ({ ...a, pct: pct[a.api.toLowerCase()] ?? null })).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)).slice(0, 5);
          out.trophyCount = `${got.length} من ${total}`;
          if (!got.length) out.trophyNote = total ? 'ما فتحت إنجازات فيها للحين' : '';
        } else out.trophyNote = /private|خاص/i.test(xml) ? 'ملفك في ستيم خاص، خلّ "تفاصيل الألعاب" عامة عشان تطلع إنجازاتك' : '';
      }
    }
    if (!out.desc && item?.name) out.desc = await wikiAbout(item.name);
  } catch (e) { log('game info failed', e.message); }
  return out;
});

ipcMain.handle('import:steam', async () => {
  const root = await steamRoot();
  if (!root) return { error: 'ما لقيت ستيم على الجهاز' };

  const libs = new Set([root]);
  const lf = readText(path.join(root, 'steamapps', 'libraryfolders.vdf'));
  if (lf) for (const v of Object.values(getCI(parseVdf(lf), 'libraryfolders') || {})) {
    const p = typeof v === 'object' ? getCI(v, 'path') : null;
    if (p) libs.add(p);
  }

  // Play time (minutes) from every local Steam user
  const minutes = {};
  try {
    for (const u of fs.readdirSync(path.join(root, 'userdata'))) {
      const t = readText(path.join(root, 'userdata', u, 'config', 'localconfig.vdf'));
      if (!t) continue;
      const v = parseVdf(t);
      const apps = getCI(getCI(getCI(getCI(getCI(v, 'UserLocalConfigStore'), 'Software'), 'Valve'), 'Steam'), 'apps') || {};
      for (const [id, a] of Object.entries(apps)) {
        const pt = Number(getCI(a, 'Playtime') || 0);
        if (pt) minutes[id] = Math.max(minutes[id] || 0, pt);
      }
    }
  } catch {}

  const games = [];
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      const st = getCI(parseVdf(readText(path.join(dir, f)) || ''), 'AppState');
      const id = getCI(st, 'appid'); const name = getCI(st, 'name');
      if (!id || !name || SKIP.test(name) || id === '228980') continue;
      const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}`;
      games.push({
        name,
        target: `steam://rungameid/${id}`,
        image: `${cdn}/library_600x900.jpg`,
        hero: `${cdn}/library_hero.jpg`,
        steamMinutes: minutes[id] || 0,
        source: 'steam',
      });
    }
  }
  return { games };
});

// ---------- Epic import ----------
// Other launchers (Rockstar, Ubisoft, GOG, EA, Battle.net, Riot, Xbox) and well-known programs
ipcMain.handle('import:more', (_e, kind) => new Promise((resolve) => {
  const script = path.join(__dirname, 'ps', 'launchers.ps1');
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Kind', kind || 'all'],
    { windowsHide: true, timeout: 90000, maxBuffer: 8 << 20 }, (err, stdout) => {
      let list = [];
      try { const j = JSON.parse(String(stdout || '').trim() || '[]'); list = Array.isArray(j) ? j : [j]; } catch (e) { log('import more parse', kind, e.message, String(stdout).slice(0, 200)); }
      if (err && !list.length) log('import more', kind, err.message);
      log('import more', kind, list.length);
      resolve({ games: list.filter((x) => x && x.name && x.target).map((x) => ({ name: x.name, target: x.target, args: x.args || undefined, image: '', source: x.source })) });
    });
}));

ipcMain.handle('import:epic', async () => {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.item')); } catch { return { error: 'ما لقيت Epic Games على الجهاز' }; }
  const games = [];
  for (const f of files) {
    try {
      const m = JSON.parse(readText(path.join(dir, f)));
      if (!m.DisplayName || !m.AppName) continue;
      if (Array.isArray(m.AppCategories) && !m.AppCategories.includes('games')) continue;
      const id = [m.CatalogNamespace, m.CatalogItemId, m.AppName].map(encodeURIComponent).join('%3A');
      games.push({
        name: m.DisplayName,
        target: `com.epicgames.launcher://apps/${id}?action=launch&silent=true`,
        image: '',
        source: 'epic',
      });
    } catch {}
  }
  return { games };
});

// ---------- Games you own but haven't installed (Steam + Epic, read from their own files on this PC) ----------
ipcMain.handle('import:owned', async () => {
  const out = [];
  const cacheF = path.join(app.getPath('userData'), 'owned-names.json');
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheF, 'utf8')); } catch {}
  // Steam: every game in your library leaves a folder of artwork in appcache\librarycache
  try {
    const root = await steamRoot();
    if (root) {
      const installed = new Set();
      const libs = new Set([root]);
      const lf = readText(path.join(root, 'steamapps', 'libraryfolders.vdf'));
      if (lf) for (const v of Object.values(getCI(parseVdf(lf), 'libraryfolders') || {})) { const p = typeof v === 'object' ? getCI(v, 'path') : null; if (p) libs.add(p); }
      for (const l of libs) { try { for (const f of fs.readdirSync(path.join(l, 'steamapps'))) { const m = /^appmanifest_(\d+)\.acf$/.exec(f); if (m) installed.add(m[1]); } } catch {} }
      const ids = new Set();
      try { for (const f of fs.readdirSync(path.join(root, 'appcache', 'librarycache'))) { const m = /^(\d+)/.exec(f); if (m) ids.add(m[1]); } } catch {}
      const todo = [...ids].filter((id) => !installed.has(id) && Number(id) > 10);
      for (let i = 0; i < todo.length; i += 6) {
        await Promise.all(todo.slice(i, i + 6).map(async (id) => {
          if (!cache[id]) {
            try {
              const j = await steamJson(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&l=english`);
              const d = j?.[id]?.data; cache[id] = d ? { name: d.name, type: d.type } : { type: 'none' };
            } catch { return; }
          }
          const c = cache[id];
          if (c.type !== 'game' || !c.name || SKIP.test(c.name) || /\b(playtest|demo|beta|test server)\b/i.test(c.name)) return;
          const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}`;
          out.push({ name: c.name, target: `steam://install/${id}`, image: `${cdn}/library_600x900.jpg`, hero: `${cdn}/library_hero.jpg`, source: 'steam' });
        }));
      }
    }
  } catch (e) { log('owned steam', e.message); }
  try { fs.writeFileSync(cacheF, JSON.stringify(cache)); } catch {}
  // Epic: the launcher keeps your owned games' catalog in catcache.bin (base64 JSON)
  try {
    const bin = path.join(process.env.LOCALAPPDATA || '', 'EpicGamesLauncher', 'Saved', 'Data', 'Catalog', 'catcache.bin');
    if (fs.existsSync(bin)) {
      const list = JSON.parse(Buffer.from(fs.readFileSync(bin, 'utf8'), 'base64').toString('utf8'));
      const instApps = new Set();
      try { for (const f of fs.readdirSync('C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests')) { try { instApps.add(JSON.parse(readText(path.join('C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests', f))).AppName); } catch {} } } catch {}
      const seen = new Set();
      for (const it of Array.isArray(list) ? list : []) {
        const cats = (it.categories || []).map((c) => c.path);
        if (!cats.includes('games') || it.mainGameItem || cats.includes('addons') || !it.title) continue;
        const appId = it.releaseInfo?.[0]?.appId;
        if (!appId || instApps.has(appId) || seen.has(it.title.toLowerCase()) || SKIP.test(it.title)) continue;
        seen.add(it.title.toLowerCase());
        const img = (it.keyImages || []).find((k) => k.type === 'DieselGameBoxTall') || (it.keyImages || []).find((k) => k.type === 'DieselGameBox');
        const id = [it.namespace, it.id, appId].map(encodeURIComponent).join('%3A');
        out.push({ name: it.title, target: `com.epicgames.launcher://apps/${id}?action=install`, image: img?.url || '', hero: '', source: 'epic' });
      }
    }
  } catch (e) { log('owned epic', e.message); }
  log('owned games found', out.length);
  return { games: out };
});

// Tabs inside the app: open same-site popups in place, block the rest (mostly ads).
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const cur = new URL(contents.getURL()).hostname.replace(/^www\./, '');
      const next = new URL(url).hostname.replace(/^www\./, '');
      if (cur && (next === cur || next.endsWith('.' + cur))) contents.loadURL(url);
    } catch {}
    return { action: 'deny' };
  });
});

// Only one Preview window: opening it again just brings the existing one to the front.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
const MAIN_FILES = ['main.js', 'preload.js', 'roms.js', 'boot.js'];
const codeStamp = () => MAIN_FILES.map((f) => { try { return fs.statSync(path.join(SRC_DIR, f)).size + ':' + Math.round(fs.statSync(path.join(SRC_DIR, f)).mtimeMs / 1000); } catch { return 0; } }).join();
function copyPageFiles() { // html / css / js / ps from the project folder into the running app
  if (path.resolve(SRC_DIR) === path.resolve(__dirname)) return;
  for (const [from, to] of [[SRC_DIR, __dirname], [path.join(SRC_DIR, 'ps'), path.join(__dirname, 'ps')], [path.join(SRC_DIR, 'assets'), path.join(__dirname, 'assets')]]) {
    let list = []; try { list = fs.readdirSync(from); } catch { continue; }
    try { fs.mkdirSync(to, { recursive: true }); } catch {}
    for (const f of list.filter((x) => /\.(html|css|js|ps1|png|ico|svg)$/i.test(x) && !/^(main|preload|roms|boot)\.js$/i.test(x))) { try { fs.copyFileSync(path.join(from, f), path.join(to, f)); } catch {} }
  }
}
const STARTED_STAMP = codeStamp();
app.on('second-instance', () => {
  if (!mainWin) return;
  if (codeStamp() !== STARTED_STAMP) {
    log('code updated, restarting');
    app.relaunch(fs.existsSync(INSTALLED_EXE) ? { execPath: INSTALLED_EXE, args: [] } : undefined); app.exit(0); return;
  }
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
  copyPageFiles();
  mainWin.webContents.reload(); // pick up any updated files
});

// Diagnostics: dropping a "snap-request.txt" next to the project makes Preview save a
// screenshot of itself (preview-snap.png). The file may name a view, e.g. "page:games".
let roms = null;
function watchSnapRequests() {
  const req = path.join(SRC_DIR, 'snap-request.txt');
  setInterval(async () => {
    if (!mainWin || !fs.existsSync(req)) return;
    let cmd = '';
    try { cmd = fs.readFileSync(req, 'utf8').trim(); fs.unlinkSync(req); } catch { return; }
    try {
      if (/^restart\b/.test(cmd)) {
        log('restart requested');
        if (!process.env.SB_INSTALLED && path.resolve(SRC_DIR) !== path.resolve(__dirname)) { // running from the copy: bring every file over first
          copyPageFiles();
          for (const f of MAIN_FILES) { try { fs.copyFileSync(path.join(SRC_DIR, f), path.join(__dirname, f)); } catch {} }
        }
        app.relaunch(fs.existsSync(INSTALLED_EXE) ? { execPath: INSTALLED_EXE, args: [] } : undefined); app.exit(0); return; }
      if (/^emutest\b/.test(cmd)) { emuSelfTest(); cmd = ''; }
      if (/^emulog:/.test(cmd)) { emuLogTail(cmd.slice(7).trim()); cmd = ''; }
      if (/^playrom:/.test(cmd)) { const f = cmd.slice(8).trim(); roms?.launchFile?.(f).then((r) => log('playrom result:', r || 'started')); cmd = ''; }
      if (/^importdir:/.test(cmd)) { const d = cmd.slice(10).trim(); const n = roms?.importDir?.(d); log('import dir', d, n); cmd = ''; }
      if (/^emuinstall:/.test(cmd)) { const ids = cmd.slice(11).trim().split(','); mainWin.webContents.send('debug:goto', 'emuinstall:' + ids.join(',')); cmd = ''; }
      if (/^reload\b/.test(cmd)) { // copy updated page files from the desktop folder and reload
        copyPageFiles();
        mainWin.webContents.reload();
        await new Promise((r) => setTimeout(r, 4000));
        cmd = cmd.replace(/^reload\s*/, '');
      }
      if (cmd) { mainWin.webContents.send('debug:goto', cmd); await new Promise((r) => setTimeout(r, 2500)); }
      const img = await mainWin.webContents.capturePage();
      fs.writeFileSync(path.join(SRC_DIR, 'preview-snap.png'), img.toPNG());
      log('snap saved', cmd);
    } catch (e) { log('snap failed', e.message); }
  }, 2000);
}

app.whenReady().then(() => {
  if (!gotLock) return;
  createWindow();
  watchSnapRequests();
  roms = null;
  let tor = null;
  try {
    roms = require('./roms').setupRoms({ ipcMain, app, net, log, EMU_ROOT, installedEmus, foundExe, run, sevenZip, download, trackSpawn, getWin: () => mainWin, repairTorrent: (f) => tor?.repair?.(f), steamGameDir, readLnk, extraBios: [path.join(SRC_DIR, 'bios'), path.join(SRC_DIR, 'BIOS')] });
  } catch (e) { log('roms setup failed', e.message); }
  setTimeout(() => scanForEmus().catch((e) => log('emu scan', e.message)), 15000);
  setTimeout(() => backupSaves().catch((e) => log('saves', e.message)), 45000);
  try {
    tor = require('./torrent').setupTorrents({ ipcMain, app, net, log, download, run, EMU_ROOT, getWin: () => mainWin, importGame: (f, mv) => roms?.importFile(f, mv) });
  } catch (e) { log('torrent setup failed', e.message); }
  unpackTools();
  // Block common ad / pop-up networks inside the in-app web tabs (movie sites are full of them)
  const AD_RE = /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.[a-z.]+|popads\.net|popcash\.net|propellerads\.com|exoclick\.com|exosrv\.com|juicyads\.com|adsterra\.com|a-ads\.com|hilltopads\.net|adcash\.com|onclickads\.net|clickadu\.com|trafficjunky\.net|mgid\.com|revcontent\.com|taboola\.com|outbrain\.com|adnxs\.com|rubiconproject\.com|pubmatic\.com|criteo\.com|zedo\.com|yllix\.com|monetag\.com|highperformanceformat\.com|bidgear\.com)$/i;
  try {
    session.fromPartition('persist:preview').webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
      let host = ''; try { host = new URL(d.url).hostname; } catch {}
      cb({ cancel: AD_RE.test(host) });
    });
  } catch (e) { log('adblock failed', e.message); }
  installApp();
  // Downloads from sites opened inside the app go straight to the Downloads folder (with progress),
  // where game files are picked up automatically
  const passThrough = new Set();
  const onDownload = async (_e, item, wc) => {
    // Big files (games) go to the fast downloader: many connections at once instead of one
    const url = item.getURL();
    if (tor?.fastGet && /^https?:/i.test(url) && item.getTotalBytes() > 30e6 && !passThrough.has(url)) {
      const name = item.getFilename() || 'download';
      item.cancel();
      try {
        const ses = wc?.session || session.defaultSession;
        const cookies = (await ses.cookies.get({ url })).map((c) => `${c.name}=${c.value}`).join('; ');
        const header = [`User-Agent: ${ses.getUserAgent()}`, ...(cookies ? [`Cookie: ${cookies}`] : []), ...(wc?.getURL?.() ? [`Referer: ${wc.getURL()}`] : [])];
        await tor.fastGet(url, { dir: app.getPath('downloads'), out: name, header });
        log('fast download', name);
        mainWin?.webContents.send('dl:progress', { name, state: 'fast' });
        return;
      } catch (err) {
        log('fast download failed, normal one instead', err.message);
        passThrough.add(url); (wc || mainWin.webContents).downloadURL(url); return;
      }
    }
    passThrough.delete(url);
    try {
      const dir = app.getPath('downloads');
      let file = path.join(dir, item.getFilename() || 'download');
      for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, item.getFilename().replace(/(\.[^.]+)?$/, ` (${i})$1`));
      item.setSavePath(file);
      const name = path.basename(file);
      log('download start', name, item.getTotalBytes());
      mainWin?.webContents.send('dl:progress', { name, state: 'start', total: item.getTotalBytes() });
      let last = 0;
      item.on('updated', (_ev, state) => {
        if (Date.now() - last < 700) return; last = Date.now();
        mainWin?.webContents.send('dl:progress', { name, state, got: item.getReceivedBytes(), total: item.getTotalBytes() });
      });
      item.once('done', (_ev, state) => { log('download', state, name); mainWin?.webContents.send('dl:progress', { name, state: state === 'completed' ? 'done' : 'fail', file }); });
    } catch (err) { log('download failed', err.message); }
  };
  try { session.fromPartition('persist:preview').on('will-download', onDownload); session.defaultSession.on('will-download', onDownload); } catch (e) { log('download hook failed', e.message); }
  // Ctrl+Alt+Space from anywhere: bring Preview to front and listen for a voice command
  // Controllers: let the page talk to PlayStation pads directly (battery, light bar, rumble)
  session.defaultSession.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const sony = details.deviceList.find((d) => d.vendorId === 0x054c);
    callback(sony ? sony.deviceId : '');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'hid' || permission === 'media' || permission === 'notifications' || true);
  session.defaultSession.setDevicePermissionHandler((d) => d.deviceType === 'hid' && d.device.vendorId === 0x054c);
  try {
    globalShortcut.register('Control+Alt+Space', () => {
      if (!mainWin) return;
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show(); mainWin.focus();
      mainWin.webContents.send('voice:start');
    });
  } catch {}
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
