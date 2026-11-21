// Console games without opening an emulator: a game file lands in Downloads (or the Games folder),
// Preview works out which console it's for, files it, and starts the right emulator straight into it.
const fs = require('fs');
const path = require('path');

const ROM_EXT = /\.(nes|fds|unf|sfc|smc|gb|gbc|gba|n64|z64|v64|nds|3ds|cci|cxi|md|gen|smd|sms|gg|32x|pce|a26|cso|pbp|rvz|wbfs|gcz|wia|gcm|ciso|wua|wud|wux|gdi|cdi|xex|iso|cue|chd|m3u|nsp|xci|nsz|xcz)$/i;
const ARCHIVE = /\.(zip|7z|rar)$/i;
const BUSY = /\.(crdownload|part|tmp|download|opdownload)$/i;

const CONSOLES = {
  nes: { label: 'نينتندو NES', dir: 'NES', thumbs: 'Nintendo - Nintendo Entertainment System', core: 'fceumm' },
  snes: { label: 'سوبر نينتندو', dir: 'SNES', thumbs: 'Nintendo - Super Nintendo Entertainment System', core: 'snes9x' },
  gb: { label: 'جيم بوي', dir: 'Game Boy', thumbs: 'Nintendo - Game Boy', core: 'gambatte' },
  gbc: { label: 'جيم بوي كلر', dir: 'Game Boy Color', thumbs: 'Nintendo - Game Boy Color', core: 'gambatte' },
  gba: { label: 'جيم بوي أدفانس', dir: 'GBA', thumbs: 'Nintendo - Game Boy Advance', core: 'mgba' },
  n64: { label: 'نينتندو 64', dir: 'N64', thumbs: 'Nintendo - Nintendo 64', core: 'mupen64plus_next' },
  nds: { label: 'نينتندو DS', dir: 'NDS', thumbs: 'Nintendo - Nintendo DS', core: 'melondsds', coreAlt: 'melonds' },
  '3ds': { label: 'نينتندو 3DS', dir: '3DS', thumbs: 'Nintendo - Nintendo 3DS', emu: 'azahar', args: ['-f', '{rom}'] },
  genesis: { label: 'سيغا ميغا درايف', dir: 'Genesis', thumbs: 'Sega - Mega Drive - Genesis', core: 'genesis_plus_gx' },
  sms: { label: 'سيغا ماستر سيستم', dir: 'Master System', thumbs: 'Sega - Master System - Mark III', core: 'genesis_plus_gx' },
  gg: { label: 'سيغا جيم جير', dir: 'Game Gear', thumbs: 'Sega - Game Gear', core: 'genesis_plus_gx' },
  '32x': { label: 'سيغا 32X', dir: '32X', thumbs: 'Sega - 32X', core: 'picodrive' },
  pce: { label: 'PC Engine', dir: 'PC Engine', thumbs: 'NEC - PC Engine - TurboGrafx 16', core: 'mednafen_pce_fast' },
  a2600: { label: 'أتاري 2600', dir: 'Atari 2600', thumbs: 'Atari - 2600', core: 'stella2014' },
  ps1: { label: 'بلايستيشن 1', dir: 'PS1', thumbs: 'Sony - PlayStation', emu: 'duckstation', args: ['-batch', '-fullscreen', '--', '{rom}'], bios: 'ps1' },
  ps2: { label: 'بلايستيشن 2', dir: 'PS2', thumbs: 'Sony - PlayStation 2', emu: 'pcsx2', args: ['-batch', '-nogui', '-fullscreen', '--', '{rom}'], bios: 'ps2' },
  psp: { label: 'PSP', dir: 'PSP', thumbs: 'Sony - PlayStation Portable', emu: 'ppsspp', args: ['--fullscreen', '{rom}'] },
  gc: { label: 'جيم كيوب', dir: 'GameCube', thumbs: 'Nintendo - GameCube', emu: 'dolphin', args: ['-b', '-C', 'Dolphin.Display.Fullscreen=True', '-e', '{rom}'] },
  wii: { label: 'Wii', dir: 'Wii', thumbs: 'Nintendo - Wii', emu: 'dolphin', args: ['-b', '-C', 'Dolphin.Display.Fullscreen=True', '-e', '{rom}'] },
  wiiu: { label: 'Wii U', dir: 'Wii U', thumbs: 'Nintendo - Wii U', emu: 'cemu', args: ['-f', '-g', '{rom}'] },
  dc: { label: 'دريم كاست', dir: 'Dreamcast', thumbs: 'Sega - Dreamcast', emu: 'flycast', args: ['{rom}'] },
  xbox: { label: 'إكس بوكس', dir: 'Xbox', thumbs: 'Microsoft - Xbox', emu: 'xemu', args: ['-full-screen', '-dvd_path', '{rom}'] },
  switch: { label: 'نينتندو سويتش', dir: 'Switch', thumbs: '', emu: 'ryujinx', args: ['--fullscreen', '{rom}'], keys: true },
  x360: { label: 'إكس بوكس 360', dir: 'Xbox 360', thumbs: 'Microsoft - Xbox 360', emu: 'xenia', args: ['{rom}', '--fullscreen=true'] },
};
const BY_EXT = {
  nes: 'nes', fds: 'nes', unf: 'nes', sfc: 'snes', smc: 'snes', gb: 'gb', gbc: 'gbc', gba: 'gba', n64: 'n64', z64: 'n64', v64: 'n64',
  nds: 'nds', '3ds': '3ds', cci: '3ds', cxi: '3ds', md: 'genesis', gen: 'genesis', smd: 'genesis', sms: 'sms', gg: 'gg', '32x': '32x',
  pce: 'pce', a26: 'a2600', cso: 'psp', rvz: 'gc', wbfs: 'wii', gcz: 'gc', wia: 'gc', gcm: 'gc', ciso: 'gc',
  wua: 'wiiu', wud: 'wiiu', wux: 'wiiu', gdi: 'dc', cdi: 'dc', xex: 'x360', nsp: 'switch', xci: 'switch', nsz: 'switch', xcz: 'switch',
};

// ---------- What console is this file for? ----------
function readAt(fd, pos, len) { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return b.subarray(0, n); }
function sniffDisc(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const head = readAt(fd, 0, 0x40);
    if (head.length >= 0x20 && head.readUInt32BE(0x1C) === 0xC2339F3D) return 'gc';
    if (head.length >= 0x20 && head.readUInt32BE(0x18) === 0x5D1C9EA3) return 'wii';
    if (head.toString('latin1', 0, 15) === 'SEGA SEGAKATANA') return 'dc';
    // Xbox discs (XDVDFS): find the volume, then look at the names in its root folder
    for (const base of [0, 0xFD90000, 0x2080000, 0x18300000]) {
      if (base + 0x10020 > size) continue;
      const h = readAt(fd, base + 0x10000, 0x20);
      if (h.toString('latin1', 0, 20) !== 'MICROSOFT*XBOX*MEDIA') continue;
      const root = readAt(fd, base + h.readUInt32LE(20) * 2048, Math.min(h.readUInt32LE(24), 1 << 20)).toString('latin1').toLowerCase();
      return root.includes('default.xex') ? 'x360' : 'xbox';
    }
    // CD/DVD images: look through the start of the disc for the console's own marks
    const chunk = readAt(fd, 0, Math.min(size, 12 << 20)).toString('latin1');
    if (chunk.includes('SEGA SEGAKATANA')) return 'dc';
    if (chunk.includes('PSP GAME') || chunk.includes('PSP_GAME')) return 'psp';
    if (/BOOT2\s*=\s*cdrom0:/i.test(chunk)) return 'ps2';
    if (/BOOT\s*=\s*cdrom:/i.test(chunk) || chunk.includes('Sony Computer Entertainment')) return 'ps1';
    if (chunk.includes('PLAYSTATION')) return size > 900 << 20 ? 'ps2' : 'ps1';
    return null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}
function sniffChd(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = readAt(fd, 0, 124);
    if (h.toString('latin1', 0, 8) !== 'MComprHD') return null;
    let meta = Number(h.readBigUInt64BE(0x30));
    for (let i = 0; i < 300 && meta; i++) {
      const e = readAt(fd, meta, 16);
      const tag = e.toString('latin1', 0, 4);
      if (tag === 'CHGD') return 'dc';
      if (tag === 'DVD ') return 'ps2';
      if (tag === 'CHT2' || tag === 'CHTR' || tag === 'CHCD') return 'ps1';
      meta = Number(e.readBigUInt64BE(8));
    }
    return 'ps1';
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}
// ".md" is both a Mega Drive game and a text note (README.md that comes inside downloads)
function notMegaDrive(file) {
  if (/^(readme|changelog|license|contributing|notes?|install|history)\b/i.test(path.basename(file))) return true;
  try {
    const st = fs.statSync(file); if (st.size < 32 * 1024) return true;
    const fd = fs.openSync(file, 'r'); const b = readAt(fd, 0, 512); fs.closeSync(fd);
    return !b.includes(0) && /^[\s\S]*$/.test(b.toString('utf8')) && b.toString('latin1', 0x100, 0x104) !== 'SEGA';
  } catch { return false; }
}
function classify(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (ext === 'md' && notMegaDrive(file)) return null; // README.md / notes, not a Mega Drive game
  if (BY_EXT[ext]) return BY_EXT[ext];
  if (ext === 'pbp') { const b = (() => { try { const fd = fs.openSync(file, 'r'); const x = readAt(fd, 0, 1 << 20).toString('latin1'); fs.closeSync(fd); return x; } catch { return ''; } })(); return b.includes('PSISOIMG') || b.includes('PSTITLEIMG') ? 'ps1' : 'psp'; }
  if (ext === 'chd') return sniffChd(file);
  if (ext === 'cue') {
    try {
      const m = /FILE\s+"([^"]+)"/i.exec(fs.readFileSync(file, 'utf8'));
      const bin = m && path.join(path.dirname(file), m[1]);
      return (bin && fs.existsSync(bin) && sniffDisc(bin)) || 'ps1';
    } catch { return 'ps1'; }
  }
  if (ext === 'm3u') {
    try { const first = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')); return first ? classify(path.join(path.dirname(file), first.trim())) : null; } catch { return null; }
  }
  if (ext === 'iso' || ext === 'bin' || ext === 'img') return sniffDisc(file);
  return null;
}
// Which file in a folder is "the game" (a .cue rather than its .bin tracks, the first disc of an .m3u...)
function mainFiles(list) {
  const lower = new Set(list.map((f) => f.toLowerCase()));
  return list.filter((f) => {
    if (!ROM_EXT.test(f) && !/\.(bin|img)$/i.test(f)) return false;
    if (/\.(bin|img)$/i.test(f)) {
      const stem = f.replace(/( \(Track \d+\))?\.(bin|img)$/i, '').toLowerCase();
      if (lower.has(stem + '.cue') || lower.has(stem + '.gdi')) return false;
      if (/\(Track \d+\)/i.test(f)) return false;
    }
    if (/\.cue$/i.test(f)) {
      const stem = f.replace(/ \(Disc \d+\)\.cue$/i, '').toLowerCase();
      if (lower.has(stem + '.m3u') && / \(Disc \d+\)\.cue$/i.test(f)) return false;
    }
    return true;
  });
}

function setupRoms(ctx) {
  const { ipcMain, app, net, log, EMU_ROOT, installedEmus, run, sevenZip, download, trackSpawn, getWin } = ctx;
  const GAMES = path.join(EMU_ROOT, 'Games');
  const BIOS = path.join(EMU_ROOT, 'BIOS');
  for (const d of [GAMES, BIOS]) try { fs.mkdirSync(d, { recursive: true }); } catch {}
  try {
    const readme = path.join(BIOS, 'اقرأني.txt');
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, 'حط هنا ملفات BIOS من أجهزتك (بلايستيشن 1 و 2)، وPreview يوزعها على المحاكيات لحاله.\r\nPut your console BIOS files here (PS1: scph*.bin, PS2: the .bin dump). Preview copies them to the right emulator.\r\n');
  } catch {}
  const send = (ch, m) => { try { getWin()?.webContents.send(ch, m); } catch {} };

  const emuExe = (id) => {
    const e = installedEmus().find((x) => x.id === id && fs.existsSync(x.exe));
    if (e) return e.exe;
    const fixed = { pcsx2: 'C:\\Program Files\\PCSX2\\pcsx2-qt.exe', ppsspp: 'C:\\Program Files\\PPSSPP\\PPSSPPWindows64.exe' }[id];
    if (fixed && fs.existsSync(fixed)) return fixed;
    return ctx.foundExe ? ctx.foundExe(new RegExp(`^${id}\\.exe$`, 'i')) : null;
  };

  // ---------- One-time setup of each emulator: portable, fullscreen, controller ready, no first-run questions ----------
  const writeOnce = (file, text) => { try { if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); } } catch {} };
  function prepare(id) {
    const exe = emuExe(id); if (!exe) return;
    const dir = path.dirname(exe);
    if (id === 'duckstation') {
      writeOnce(path.join(dir, 'portable.txt'), '');
      const pad = { Up: 'DPadUp', Right: 'DPadRight', Down: 'DPadDown', Left: 'DPadLeft', Triangle: 'Y', Circle: 'B', Cross: 'A', Square: 'X', Select: 'Back', Start: 'Start',
        L1: 'LeftShoulder', R1: 'RightShoulder', L2: '+LeftTrigger', R2: '+RightTrigger', L3: 'LeftStick', R3: 'RightStick',
        LLeft: '-LeftX', LRight: '+LeftX', LUp: '-LeftY', LDown: '+LeftY', RLeft: '-RightX', RRight: '+RightX', RUp: '-RightY', RDown: '+RightY' };
      writeOnce(path.join(dir, 'settings.ini'), [
        '[Main]', 'SetupWizardIncomplete = false', 'StartFullscreen = true', 'ConfirmPowerOff = false', 'PauseOnFocusLoss = false', '',
        '[BIOS]', 'SearchDirectory = bios', '',
        '[InputSources]', 'SDL = true', 'XInput = false', '',
        '[Pad1]', 'Type = AnalogController', ...Object.entries(pad).map(([k, v]) => `${k} = SDL-0/${v}`), '',
        '[Hotkeys]', 'OpenPauseMenu = Keyboard/Escape', 'ToggleFullscreen = Keyboard/F11', '',
      ].join('\r\n'));
      fs.mkdirSync(path.join(dir, 'bios'), { recursive: true });
    } else if (id === 'dolphin') {
      writeOnce(path.join(dir, 'portable.txt'), '');
      writeOnce(path.join(dir, 'User', 'Config', 'Dolphin.ini'), '[Interface]\r\nConfirmStop = False\r\n[Display]\r\nFullscreen = True\r\n[Analytics]\r\nPermissionAsked = True\r\nEnabled = False\r\n[Core]\r\nAutoDiscChange = True\r\n');
      const m = { 'Buttons/A': '`Button A`', 'Buttons/B': '`Button B`', 'Buttons/X': '`Button X`', 'Buttons/Y': '`Button Y`', 'Buttons/Z': '`Shoulder R`', 'Buttons/Start': 'Start',
        'Main Stick/Up': '`Left Y+`', 'Main Stick/Down': '`Left Y-`', 'Main Stick/Left': '`Left X-`', 'Main Stick/Right': '`Left X+`',
        'C-Stick/Up': '`Right Y+`', 'C-Stick/Down': '`Right Y-`', 'C-Stick/Left': '`Right X-`', 'C-Stick/Right': '`Right X+`',
        'Triggers/L': '`Trigger L`', 'Triggers/R': '`Trigger R`', 'Triggers/L-Analog': '`Trigger L`', 'Triggers/R-Analog': '`Trigger R`',
        'D-Pad/Up': '`Pad N`', 'D-Pad/Down': '`Pad S`', 'D-Pad/Left': '`Pad W`', 'D-Pad/Right': '`Pad E`' };
      writeOnce(path.join(dir, 'User', 'Config', 'GCPadNew.ini'), ['[GCPad1]', 'Device = XInput/0/Gamepad', ...Object.entries(m).map(([k, v]) => `${k} = ${v}`), ''].join('\r\n'));
    } else if (id === 'cemu') {
      try { fs.mkdirSync(path.join(dir, 'portable'), { recursive: true }); } catch {}
    } else if (id === 'flycast') {
      writeOnce(path.join(dir, 'emu.cfg'), '[window]\r\nfullscreen = yes\r\n');
    } else if (id === 'ppsspp') {
      // PPSSPP picks up Xbox / PlayStation pads by itself
    }
  }

  // ---------- BIOS files: dropped in Emulators\BIOS, copied where each emulator looks ----------
  // BIOS can sit in Emulators\BIOS or in a "bios" folder next to Preview itself (sub-folders are fine)
  const biosDirs = () => [BIOS, ...(ctx.extraBios || [])];
  function biosFiles() {
    const out = [];
    const walk = (d, depth) => {
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const x of ents) { const f = path.join(d, x.name); if (x.isDirectory()) { if (depth < 2) walk(f, depth + 1); } else if (/\.(bin|rom|rom0|mec|nvm)$/i.test(x.name)) out.push(f); }
    };
    for (const d of biosDirs()) walk(d, 0);
    return out;
  }
  const isPs2Bios = (f) => { try { const s = fs.statSync(f).size; return s >= 4 << 20 && s <= 8 << 20; } catch { return false; } };
  const isPs1Bios = (f) => { try { return fs.statSync(f).size === 512 * 1024; } catch { return false; } };
  function placeBios(kind) {
    const list = biosFiles().filter(kind === 'ps2' ? isPs2Bios : isPs1Bios);
    let dirs = [];
    if (kind === 'ps1') { const d = emuExe('duckstation'); if (d) dirs.push(path.join(path.dirname(d), 'bios')); const ra = emuExe('retroarch'); if (ra) dirs.push(path.join(path.dirname(ra), 'system')); }
    if (kind === 'ps2') {
      const docs = app.getPath('documents');
      dirs = [path.join(docs, 'PCSX2', 'bios')];
      const p = emuExe('pcsx2'); if (p) dirs.push(path.join(path.dirname(p), 'bios'));
    }
    let have = false;
    for (const d of dirs) {
      try { fs.mkdirSync(d, { recursive: true }); } catch { continue; }
      for (const f of list) { const to = path.join(d, path.basename(f)); try { if (!fs.existsSync(to)) fs.copyFileSync(f, to); } catch {} }
      try { if (fs.readdirSync(d).some((x) => kind === 'ps2' ? isPs2Bios(path.join(d, x)) : isPs1Bios(path.join(d, x)))) have = true; } catch {}
    }
    return have;
  }

  // ---------- Nintendo Switch: keys from your own console, NSZ -> NSP, updates and DLC ----------
  const RYU = path.join(process.env.APPDATA || '', 'Ryujinx');
  const HOME = require('os').homedir();
  const SW_EXTRA = path.join(GAMES, 'Switch', '_تحديثات و DLC');
  function switchKeyFiles() {
    const out = {};
    const walk = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const x of ents) { const f = path.join(d, x.name); if (x.isDirectory()) { if (depth < 3) walk(f, depth + 1); } else if (/^(prod|title)\.keys$/i.test(x.name)) out[x.name.toLowerCase()] ||= f;
        else if (/^(prod\.keys\.txt|keys\.txt|prod\.txt|keys)$/i.test(x.name) && fs.statSync(f).size < 200e3 && /header_key|master_key/i.test(fs.readFileSync(f, 'utf8'))) out['prod.keys'] ||= f; } };
    for (const d of switchSearchDirs()) walk(d, 0);
    return out;
  }
  // copy prod.keys / title.keys where Ryujinx and the NSZ tool look for them
  const YUZU_FAMILY = ['lichii', 'eden', 'citron', 'sudachi', 'suyu', 'torzu', 'yuzu'];
  // each yuzu-style emulator keeps keys in %APPDATA%\<name>\keys and firmware in ...\nand\system\Contents\registered
  const yuzuHomes = () => {
    const out = [];
    for (const id of YUZU_FAMILY) {
      const exe = emuExe(id);
      if (exe && fs.existsSync(path.join(path.dirname(exe), 'user'))) out.push(path.join(path.dirname(exe), 'user')); // portable copy keeps its data next to the exe
      if (exe || fs.existsSync(path.join(process.env.APPDATA || '', id))) out.push(path.join(process.env.APPDATA || '', id));
    }
    return out;
  };
  // where people usually leave keys / firmware they copied from their Switch (besides the BIOS folder)
  const switchSearchDirs = () => [...biosDirs(), ...['Desktop', 'OneDrive\\Desktop', 'Downloads', 'Documents', 'OneDrive\\Documents'].map((d) => path.join(HOME, d))];
  function placeSwitchKeys() {
    const k = switchKeyFiles();
    for (const [name, f] of Object.entries(k)) for (const d of [path.join(RYU, 'system'), path.join(require('os').homedir(), '.switch'), ...yuzuHomes().map((h) => path.join(h, 'keys'))]) {
      try { fs.mkdirSync(d, { recursive: true }); const to = path.join(d, name); if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(f).size) fs.copyFileSync(f, to); } catch {}
    }
    // whichever copy exists (one you put in Ryujinx yourself counts too) goes everywhere the tools look
    const have = [path.join(RYU, 'system', 'prod.keys'), path.join(HOME, '.switch', 'prod.keys'), ...yuzuHomes().map((h) => path.join(h, 'keys', 'prod.keys'))].find((f) => fs.existsSync(f));
    if (have) for (const d of [path.join(RYU, 'system'), path.join(HOME, '.switch'), ...yuzuHomes().map((h) => path.join(h, 'keys'))]) { try { fs.mkdirSync(d, { recursive: true }); if (!fs.existsSync(path.join(d, 'prod.keys'))) fs.copyFileSync(have, path.join(d, 'prod.keys')); } catch {} }
    if (!placeSwitchKeys.logged) { placeSwitchKeys.logged = true; log('switch keys:', Object.values(k).join(', ') || 'none found', have ? '(ready)' : ''); }
    return !!have;
  }
  const RYU_FW = path.join(RYU, 'bis', 'system', 'Contents', 'registered');
  const switchFirmware = () => { installSwitchFirmware(); try { return fs.readdirSync(RYU_FW).length > 10; } catch { return false; } };
  // Firmware from your Switch (a .zip, or a folder full of .nca files) in the BIOS folder: installed for every Switch emulator, once
  let fwBusy = false;
  function findFirmware() {
    let zip = null, dir = null;
    const walk = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      const ncas = ents.filter((x) => x.isFile() && /\.nca$/i.test(x.name)).length;
      if (ncas >= 20 && !dir) dir = d;
      for (const x of ents) { const f = path.join(d, x.name);
        if (x.isFile() && /\.zip$/i.test(x.name) && /firm/i.test(x.name) && !zip) zip = f;
        else if (x.isDirectory() && depth < 3) walk(f, depth + 1); } };
    for (const d of switchSearchDirs()) walk(d, 0);
    return dir || zip;
  }
  function installSwitchFirmware() {
    if (fwBusy) return;
    const src = findFirmware(); if (!src) return;
    const stampF = path.join(RYU, 'sb-firmware.txt');
    const stamp = `${src}|${fs.statSync(src).mtimeMs}|${yuzuHomes().join(',')}`;
    try { if (fs.readFileSync(stampF, 'utf8') === stamp) return; } catch {}
    fwBusy = true;
    return (async () => {
      let dir = src, tmp = null;
      if (/\.zip$/i.test(src)) { tmp = path.join(app.getPath('temp'), 'sb-fw'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true }); const r = await run('tar', ['-xf', src, '-C', tmp]); if (r.code !== 0) throw new Error('unzip firmware ' + r.err); dir = tmp; }
      const ncas = []; (function w(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, x.name); if (x.isDirectory()) w(f); else if (/\.nca$/i.test(x.name)) ncas.push(f); } })(dir);
      if (ncas.length < 20) throw new Error('firmware has only ' + ncas.length + ' files');
      // Ryujinx: registered\<id>.nca\00 (".cnmt" dropped from the name, the way Ryujinx's own installer does it)
      fs.rmSync(RYU_FW, { recursive: true, force: true }); fs.mkdirSync(RYU_FW, { recursive: true });
      for (const f of ncas) { const d = path.join(RYU_FW, path.basename(f).replace('.cnmt', '')); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(f, path.join(d, '00')); }
      // yuzu family: the .nca files as they are
      for (const h of yuzuHomes()) { const reg = path.join(h, 'nand', 'system', 'Contents', 'registered'); fs.mkdirSync(reg, { recursive: true }); for (const f of ncas) fs.copyFileSync(f, path.join(reg, path.basename(f))); }
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(RYU, { recursive: true }); fs.writeFileSync(stampF, stamp);
      log('switch firmware installed', ncas.length, 'files from', src);
      send('rom:status', { step: 'firmware', name: path.basename(src) });
    })().catch((e) => log('firmware install failed', e.message)).finally(() => { fwBusy = false; });
  }
  setTimeout(() => { placeSwitchKeys(); installSwitchFirmware(); }, 8000);
  setInterval(() => { if (!fs.existsSync(path.join(RYU, 'system', 'prod.keys')) || !fs.existsSync(path.join(RYU, 'sb-firmware.txt'))) { placeSwitchKeys(); installSwitchFirmware(); } }, 120000); // only looks around again while something is still missing
  // the NSZ tool (open source, github.com/nicoboss/nsz), fetched once
  async function nszTool() {
    const dir = path.join(EMU_ROOT, '_tools', 'nsz');
    const find = () => { let hit = null; (function w(d, depth) { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of ents) { const f = path.join(d, x.name); if (x.isFile() && /^nsz.*\.exe$/i.test(x.name)) hit ||= f; else if (x.isDirectory() && depth < 3) w(f, depth + 1); } })(dir, 0); return hit; };
    if (find()) return find();
    const rel = await (await net.fetch('https://api.github.com/repos/nicoboss/nsz/releases/latest', { headers: { 'User-Agent': 'SilverBullet', Accept: 'application/vnd.github+json' } })).json();
    const assets = rel.assets || [];
    const a = assets.find((x) => /win.*\.zip$/i.test(x.name)) || assets.find((x) => /\.exe$/i.test(x.name)) || assets.find((x) => /windows/i.test(x.name));
    if (!a) { log('nsz assets', assets.map((x) => x.name).join(' | ')); throw new Error('nsz windows build not found'); }
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(app.getPath('temp'), 'sb-' + a.name);
    await download(a.browser_download_url, tmp, () => {});
    if (/\.exe$/i.test(a.name)) fs.copyFileSync(tmp, path.join(dir, 'nsz.exe'));
    else { const r = await run('tar', ['-xf', tmp, '-C', dir]); if (r.code !== 0) throw new Error('unzip nsz ' + r.err); }
    try { fs.unlinkSync(tmp); } catch {}
    log('nsz tool ready', a.name);
    if (!find()) throw new Error('nsz.exe missing after unzip');
    return find();
  }
  // title id in the file name: base games end in 000, updates in 800, the rest are DLC
  const switchKind = (f) => {
    const n = path.basename(f);
    const id = /\[(0100[0-9a-f]{12})\]/i.exec(n)?.[1];
    if (id) return /800$/i.test(id) ? 'update' : /000$/i.test(id) ? 'base' : 'dlc';
    return /\b(update|upd|dlc|v\d{5,})\b/i.test(n) ? 'update' : 'base';
  };
  function addAutoloadDir() {
    try {
      const cfgF = path.join(RYU, 'Config.json'); if (!fs.existsSync(cfgF)) return;
      const cfg = JSON.parse(fs.readFileSync(cfgF, 'utf8'));
      let changed = false;
      for (const key of ['autoload_dirs', 'game_dirs']) {
        const want = key === 'autoload_dirs' ? SW_EXTRA : path.join(GAMES, 'Switch');
        if (!Array.isArray(cfg[key])) cfg[key] = [];
        if (!cfg[key].includes(want)) { cfg[key].push(want); changed = true; }
      }
      if (changed) { fs.writeFileSync(cfgF, JSON.stringify(cfg, null, 2)); log('ryujinx folders set'); }
    } catch (e) { log('ryujinx config', e.message); }
  }
  const repairAsked = new Set();
  // tidy up copies made when the same Switch game was downloaded twice ("Game (2).nsp" next to "Game.nsp", same size)
  setTimeout(() => {
    for (const d of [path.join(GAMES, 'Switch'), SW_EXTRA]) {
      let names = []; try { names = fs.readdirSync(d); } catch { continue; }
      for (const n of names) {
        const orig = n.replace(/( \(\d+\))+(\.[^.]+)$/, '$2'); if (orig === n) continue;
        const a = path.join(d, n), b = path.join(d, orig);
        try { if (fs.existsSync(b) && fs.statSync(a).size === fs.statSync(b).size) { fs.unlinkSync(a); log('removed duplicate', n); } else if (!fs.existsSync(b)) fs.renameSync(a, b); } catch {}
      }
    }
  }, 6000);
  let swQueue = Promise.resolve();
  function switchPrepare(file) { const job = swQueue.then(() => switchPrepareNow(file)); swQueue = job.catch(() => {}); return job; } // one big conversion at a time
  async function switchPrepareNow(file) {
    let f = file;
    if (/\.(nsz|xcz)$/i.test(f)) {
      if (!placeSwitchKeys()) { log('switch: no keys yet, waiting', f); pendingSwitch.add(f); send('rom:status', { step: 'keys', name: path.basename(f) }); return null; }
      send('rom:status', { step: 'convert', name: path.basename(f) });
      const tool = await nszTool();
      const out = path.join(path.dirname(f), '_nsp');
      fs.mkdirSync(out, { recursive: true });
      const r = await run(tool, ['-D', '-w', '-o', out, f]);
      const made = fs.readdirSync(out).map((x) => path.join(out, x)).find((x) => /\.(nsp|xci)$/i.test(x) && path.basename(x).replace(/\.[^.]+$/, '') === path.basename(f).replace(/\.[^.]+$/, ''))
        || fs.readdirSync(out).map((x) => path.join(out, x)).find((x) => /\.(nsp|xci)$/i.test(x) && fs.statSync(x).mtimeMs > Date.now() - 3600e3);
      if (r.code !== 0 || !made) {
        log('nsz convert failed', f, r.code, r.err, '| out:', r.out);
        // damaged / unfinished download: have the torrent check it and fetch the missing pieces (it comes back here when done)
        if (/corrupt|Not a valid PFS0|decompress error/i.test(r.err + r.out) && ctx.repairTorrent && !repairAsked.has(path.dirname(f))) { repairAsked.add(path.dirname(f)); ctx.repairTorrent(f); }
        else send('rom:status', { step: 'fail', name: path.basename(f) });
        return null;
      }
      log('nsz converted', path.basename(f));
      try { fs.unlinkSync(f); } catch {}
      f = made;
    }
    if (f.toLowerCase().startsWith(SW_EXTRA.toLowerCase())) return null; // already where it belongs
    const kind = switchKind(f);
    if (kind !== 'base') { // updates and DLC load by themselves from this folder
      fs.mkdirSync(SW_EXTRA, { recursive: true });
      const same = path.join(SW_EXTRA, path.basename(f));
      if (fs.existsSync(same) && fs.statSync(same).size === fs.statSync(f).size) { try { fs.unlinkSync(f); } catch {} return null; } // already there
      const to = uniq(same);
      try { fs.renameSync(f, to); } catch { fs.copyFileSync(f, to); fs.unlinkSync(f); }
      addAutoloadDir();
      log('switch extra', kind, path.basename(to));
      return null;
    }
    return f;
  }
  // Switch games waiting for keys are remembered between launches; they get ready the moment prod.keys shows up
  const PEND_F = path.join(app.getPath('userData'), 'switch-pending.json');
  try { for (const n of fs.readdirSync(SW_EXTRA)) { const clean = n.replace(/( \(2\))+(\.[^.]+)$/, '$2'); if (clean !== n) { const to = path.join(SW_EXTRA, clean); if (!fs.existsSync(to)) fs.renameSync(path.join(SW_EXTRA, n), to); else fs.unlinkSync(path.join(SW_EXTRA, n)); } } } catch {}
  const pendingSwitch = new Set((() => { try { return JSON.parse(fs.readFileSync(PEND_F, 'utf8')); } catch { return []; } })().filter((f) => fs.existsSync(f)));
  const _add = pendingSwitch.add.bind(pendingSwitch);
  pendingSwitch.add = (f) => { _add(f); try { fs.writeFileSync(PEND_F, JSON.stringify([...pendingSwitch])); } catch {} return pendingSwitch; };
  setInterval(() => {
    if (!pendingSwitch.size || !placeSwitchKeys()) return;
    const l = [...pendingSwitch]; pendingSwitch.clear(); try { fs.writeFileSync(PEND_F, '[]'); } catch {}
    for (const f of l) { handled.clear(); importFile(f, true); }
  }, 20000);



  // ---------- Best settings for this PC: sharper picture, smooth frame rate, no stutter (shaders built in the background) ----------
  let gpuTier = null;
  async function gpu() {
    if (gpuTier) return gpuTier;
    const r = await new Promise((res) => require('child_process').execFile('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ";"'], { windowsHide: true, timeout: 15000 }, (_e, out) => res(String(out || ''))));
    gpuTier = /RTX\s*(40|50)\d\d|RX\s*(79|9\d)\d\d/i.test(r) ? 'top' : /RTX\s*(20|30)\d\d|RX\s*(6[789]|7[0-8])\d\d|Arc\s*B/i.test(r) ? 'high' : /GTX\s*1[06]\d\d|RX\s*(5[5-9]|6[0-6])\d\d|Arc/i.test(r) ? 'mid' : 'low';
    log('graphics card:', r.trim(), '->', gpuTier);
    return gpuTier;
  }
  function setIni(file, changes) { // changes: { 'Section': { Key: value } }; only touches those keys
    if (!fs.existsSync(file)) return false;
    if (!fs.existsSync(file + '.sb-backup')) fs.copyFileSync(file, file + '.sb-backup');
    let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const eq = lines.some((l) => / = /.test(l)) ? ' = ' : '=';
    for (const [sec, kv] of Object.entries(changes)) {
      let start = lines.findIndex((l) => l.trim().toLowerCase() === `[${sec.toLowerCase()}]`);
      if (start < 0) { lines.push('', `[${sec}]`); start = lines.length - 1; }
      let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l)); if (end < 0) end = lines.length;
      for (const [k, v] of Object.entries(kv)) {
        const i = lines.findIndex((l, j) => j > start && j < end && new RegExp(`^\\s*${k.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\\s*=`, 'i').test(l));
        if (i >= 0) lines[i] = `${k}${eq}${v}`; else { lines.splice(end, 0, `${k}${eq}${v}`); end++; }
      }
    }
    fs.writeFileSync(file, lines.join('\r\n'));
    return true;
  }
  const TUNED_F = path.join(app.getPath('userData'), 'tuned.json');
  async function tune(id) {
    let done = {}; try { done = JSON.parse(fs.readFileSync(TUNED_F, 'utf8')); } catch {}
    if (done[id] === (id === 'ryujinx' ? 3 : 2)) return;
    const exe = emuExe(id); if (!exe) return;
    const dir = path.dirname(exe), t = await gpu();
    const scale = { top: 4, high: 3, mid: 2, low: 1 }[t];
    let ok = false;
    try {
      if (id === 'duckstation') ok = setIni(path.join(dir, 'settings.ini'), { GPU: { Renderer: 'Vulkan', ResolutionScale: String({ top: 6, high: 5, mid: 3, low: 2 }[t]), PGXPEnable: 'true', TrueColor: 'true' } });
      else if (id === 'dolphin') {
        ok = setIni(path.join(dir, 'User', 'Config', 'GFX.ini'), { Settings: { InternalResolution: String(scale), ShaderCompilationMode: '2', WaitForShadersBeforeStarting: 'True' } }) || ok;
        setIni(path.join(dir, 'User', 'Config', 'Dolphin.ini'), { Core: { GFXBackend: 'Vulkan' } });
      } else if (id === 'pcsx2') {
        const f = [path.join(dir, 'inis', 'PCSX2.ini'), path.join(HOME, 'Documents', 'PCSX2', 'inis', 'PCSX2.ini')].find((x) => fs.existsSync(x));
        if (f) ok = setIni(f, { 'EmuCore/GS': { Renderer: '14', upscale_multiplier: String(Math.max(1, scale)) } });
      } else if (id === 'ppsspp') {
        const f = [path.join(dir, 'memstick', 'PSP', 'SYSTEM', 'ppsspp.ini'), path.join(HOME, 'Documents', 'PPSSPP', 'PSP', 'SYSTEM', 'ppsspp.ini')].find((x) => fs.existsSync(x));
        if (f) ok = setIni(f, { Graphics: { GraphicsBackend: '3 (VULKAN)', InternalResolution: String({ top: 6, high: 5, mid: 3, low: 2 }[t]) } });
      } else if (id === 'azahar') {
        const f = path.join(process.env.APPDATA || '', 'Azahar', 'config', 'qt-config.ini');
        ok = setIni(f, { Renderer: { 'resolution_factor\\default': 'false', resolution_factor: String(scale), 'async_shader_compilation\\default': 'false', async_shader_compilation: 'true' } });
      } else if (id === 'ryujinx') {
        const f = path.join(RYU, 'Config.json');
        if (fs.existsSync(f)) {
          if (!fs.existsSync(f + '.sb-backup')) fs.copyFileSync(f, f + '.sb-backup');
          const c = JSON.parse(fs.readFileSync(f, 'utf8'));
          Object.assign(c, { graphics_backend: 'Vulkan', res_scale: t === 'top' ? 2 : 1, docked_mode: true, enable_shader_cache: true, enable_texture_recompression: false, backend_threading: 'Auto', enable_vsync: true }); // native resolution: a 2x picture made Super Mario Party crash the graphics driver on an RTX 3060
          fs.writeFileSync(f, JSON.stringify(c, null, 2)); ok = true;
        }
      } else if (id === 'cemu') {
        const f = [path.join(dir, 'portable', 'settings.xml'), path.join(dir, 'settings.xml')].find((x) => fs.existsSync(x));
        if (f) { let x = fs.readFileSync(f, 'utf8'); if (!fs.existsSync(f + '.sb-backup')) fs.writeFileSync(f + '.sb-backup', x); x = x.replace(/<api>\d<\/api>/, '<api>1</api>').replace(/<AsyncCompile>\w+<\/AsyncCompile>/, '<AsyncCompile>true</AsyncCompile>'); fs.writeFileSync(f, x); ok = true; }
      }
    } catch (e) { log('tune', id, e.message); }
    if (ok) { done[id] = id === 'ryujinx' ? 3 : 2; fs.writeFileSync(TUNED_F, JSON.stringify(done)); log('emulator tuned', id, t); }
  }
  ipcMain.handle('emu:tune', async () => { for (const id of ['duckstation', 'dolphin', 'pcsx2', 'ppsspp', 'azahar', 'ryujinx', 'cemu']) await tune(id); return gpuTier; });
  setTimeout(() => ipcMain.emit && ['duckstation', 'dolphin', 'pcsx2', 'ppsspp', 'azahar', 'ryujinx', 'cemu'].reduce((p, id) => p.then(() => tune(id)), Promise.resolve()), 40000);
  // ---------- Mods, translations and texture packs: drop it on the game, it goes where that game/emulator reads it ----------
  const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const x of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, x.name), b = path.join(to, x.name); if (x.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };
  const findDirs = (root, test, depth = 5) => { const out = []; (function w(d, n) { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of ents) if (x.isDirectory()) { const f = path.join(d, x.name); if (test(x.name, f)) out.push(f); else if (n > 0) w(f, n - 1); } })(root, depth); return out; };
  const listFiles = (root) => { const out = []; (function w(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, x.name); if (x.isDirectory()) w(f); else out.push(f); } })(root); return out; };
  function dolphinUserDir(exe) { const d = path.dirname(exe); return fs.existsSync(path.join(d, 'portable.txt')) ? path.join(d, 'User') : path.join(HOME, 'Documents', 'Dolphin Emulator'); }
  function discId(rom) { try { const fd = fs.openSync(rom, 'r'); const b = Buffer.alloc(6); const off = /\.wbfs$/i.test(rom) ? 0x200 : 0; fs.readSync(fd, b, 0, 6, off); fs.closeSync(fd); const id = b.toString('latin1'); return /^[A-Z0-9]{6}$/.test(id) ? id : null; } catch { return null; } }
  async function unpackMod(src) {
    if (fs.statSync(src).isDirectory()) return { dir: src, tmp: null };
    if (!/\.(zip|7z|rar)$/i.test(src)) return { dir: null, file: src, tmp: null };
    const tmp = path.join(app.getPath('temp'), 'sb-mod-' + Date.now());
    fs.mkdirSync(tmp, { recursive: true });
    const r = /\.7z$/i.test(src) ? await run(await sevenZip(), ['x', src, '-o' + tmp, '-y']) : await run('tar', ['-xf', src, '-C', tmp]);
    if (r.code !== 0) throw new Error('ما قدرت أفك الملف: ' + r.err);
    return { dir: tmp, tmp };
  }
  ipcMain.handle('mods:install', async (_e, info, src) => {
    let tmp = null;
    try {
      const modName = path.basename(src).replace(/\.(zip|7z|rar)$/i, '').replace(/[<>:"/\\|?*]/g, '').trim() || 'mod';
      const con = info.rom ? (info.console || classify(info.rom)) : null;
      // a Switch update / DLC dropped on the game
      if (con === 'switch' && /\.(nsp|nsz|xci|xcz)$/i.test(src)) { await importFile(src, false); return { ok: true, msg: 'انحط كتحديث / DLC للعبة، ويشتغل لحاله' }; }
      const u = await unpackMod(src); tmp = u.tmp;
      if (!u.dir) { // one loose file
        if (/\.pnach$/i.test(src) && con && /^ps2$/.test(con)) { const d = path.join(HOME, 'Documents', 'PCSX2', 'patches'); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(src, path.join(d, path.basename(src))); log('mod installed', 'pnach', path.basename(src)); return { ok: true, msg: 'انحط في باتشات PCSX2. فعّله من خصائص اللعبة ← Patches.' }; }
        if (!info.rom && /\.exe$/i.test(src)) { require('electron').shell.openPath(src); log('mod installed', 'installer', path.basename(src)); return { ok: true, msg: 'هذا مثبّت: فتحته لك، كمّل خطواته واختر مجلد اللعبة.' }; }
      }
      const dir = u.dir || path.dirname(src);
      if (con === 'switch') {
        const tid = (/\[(0100[0-9a-f]{12})\]/i.exec(path.basename(info.rom)) || [])[1];
        if (!tid) return { ok: false, msg: 'ما عرفت رقم اللعبة من اسم ملفها' };
        const parts = findDirs(dir, (n) => /^(romfs|exefs)$/i.test(n));
        if (!parts.length) return { ok: false, msg: 'ما لقيت داخل المود مجلد romfs أو exefs (هذا شكل مودات السويتش)' };
        const targets = [path.join(RYU, 'mods', 'contents', tid.toLowerCase(), modName), ...yuzuHomes().map((h) => path.join(h, 'load', tid.toUpperCase(), modName))];
        for (const t of targets) for (const p of parts) copyDir(p, path.join(t, path.basename(p).toLowerCase()));
        log('mod installed', 'switch', modName, tid);
        return { ok: true, msg: `انحط المود "${modName}" للعبة، ويشتغل تلقائي أول ما تفتحها` };
      }
      if (con === 'wiiu') {
        const packs = findDirs(dir, (_n, f) => fs.existsSync(path.join(f, 'rules.txt')));
        const cemu = emuExe('cemu'); if (!cemu) return { ok: false, msg: 'Cemu مو مثبت' };
        if (!packs.length) return { ok: false, msg: 'هذا مو graphic pack (ما فيه rules.txt)' };
        for (const p of packs) copyDir(p, path.join(path.dirname(cemu), 'graphicPacks', 'SilverBullet', path.basename(p)));
        log('mod installed', 'wiiu', modName);
        return { ok: true, msg: 'انحط في graphic packs. فعّله مرة من Cemu ← Options ← Graphic packs.' };
      }
      if (con === 'gc' || con === 'wii') {
        const dol = emuExe('dolphin'); if (!dol) return { ok: false, msg: 'Dolphin مو مثبت' };
        const id = discId(info.rom);
        const named = findDirs(dir, (n) => /^[A-Z0-9]{6}$/.test(n) || (id && n.toUpperCase().startsWith(id.slice(0, 3))));
        const dest = path.join(dolphinUserDir(dol), 'Load', 'Textures');
        if (named.length) for (const n of named) copyDir(n, path.join(dest, path.basename(n)));
        else if (id) copyDir(dir, path.join(dest, id));
        else return { ok: false, msg: 'ما عرفت رقم اللعبة عشان أحط التكستشرات' };
        log('mod installed', 'dolphin textures', modName);
        return { ok: true, msg: 'انحطت التكستشرات. تأكد إن "Load Custom Textures" مفعّل في Dolphin ← Graphics ← Advanced.' };
      }
      if (con === 'ps2' || con === 'psp') {
        const re = /^(SLUS|SLES|SCUS|SCES|SLPS|SLPM|SCPS|SLKA|ULUS|ULES|UCUS|UCES|ULJM|ULJS|NPUH|NPEH)[-_]?\d{5}$/i;
        const named = findDirs(dir, (n) => re.test(n));
        if (!named.length) return { ok: false, msg: 'ما لقيت مجلد باسم رقم اللعبة (مثل SLUS-21050) داخل الملف' };
        const dest = con === 'ps2' ? path.join(HOME, 'Documents', 'PCSX2', 'textures') : path.join(HOME, 'Documents', 'PPSSPP', 'PSP', 'TEXTURES');
        for (const n of named) copyDir(n, path.join(dest, path.basename(n)));
        log('mod installed', con + ' textures', modName);
        return { ok: true, msg: 'انحطت التكستشرات في مكانها.' };
      }
      if (info.rom) return { ok: false, msg: 'ما أعرف وين تنحط مودات هالجهاز للحين' };
      // PC game: into its own folder (what gets overwritten is backed up first)
      let gameDir = null;
      const m = /^steam:\/\/rungameid\/(\d+)/.exec(info.target || '');
      if (m) gameDir = await ctx.steamGameDir(m[1]);
      else if (/\.lnk$/i.test(info.target || '')) { const l = await ctx.readLnk(info.target); if (l?.target) gameDir = path.dirname(l.target); }
      else if (/^[a-z]:\\/i.test(info.target || '')) gameDir = fs.statSync(info.target).isDirectory() ? info.target : path.dirname(info.target);
      if (!gameDir || !fs.existsSync(gameDir)) return { ok: false, msg: 'ما لقيت مجلد اللعبة' };
      if (!u.dir) { // a single file (a .pak, a .dll...) goes into the game folder
        const to = path.join(gameDir, path.basename(src));
        const bak = path.join(gameDir, '_sb_backup', String(Date.now())); if (fs.existsSync(to)) { fs.mkdirSync(bak, { recursive: true }); fs.copyFileSync(to, path.join(bak, path.basename(src))); }
        fs.copyFileSync(src, to); log('mod installed', 'pc file', path.basename(src)); return { ok: true, msg: 'انحط الملف في مجلد اللعبة' };
      }
      const installer = listFiles(dir).find((f) => /(setup|install).*\.exe$/i.test(path.basename(f)));
      if (installer) { require('electron').shell.openPath(installer); log('mod installed', 'installer', path.basename(installer)); return { ok: true, msg: 'فيه مثبّت داخل الملف، فتحته لك: كمّل خطواته.' }; }
      // archives often wrap everything in one extra folder: use what's inside it
      let root = dir; for (let i = 0; i < 3; i++) { const ents = fs.readdirSync(root, { withFileTypes: true }); if (ents.length === 1 && ents[0].isDirectory() && !fs.existsSync(path.join(gameDir, ents[0].name))) root = path.join(root, ents[0].name); else break; }
      const bak = path.join(gameDir, '_sb_backup', String(Date.now()));
      let n = 0;
      for (const f of listFiles(root)) { const rel = path.relative(root, f), to = path.join(gameDir, rel); if (fs.existsSync(to)) { fs.mkdirSync(path.dirname(path.join(bak, rel)), { recursive: true }); fs.copyFileSync(to, path.join(bak, rel)); } fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f, to); n++; }
      log('mod installed', 'pc', modName, n, 'files');
      return { ok: true, msg: `انحط (${n} ملف) في مجلد اللعبة. الملفات القديمة اللي تغيّرت محفوظة في _sb_backup لو بغيت ترجعها.` };
    } catch (err) { log('mod install failed', err.message); return { ok: false, msg: String(err.message || err) }; }
    finally { if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  });
  // ---------- RetroArch cores (small, fetched the first time a console needs one) ----------
  async function core(name) {
    const ra = emuExe('retroarch'); if (!ra) return null;
    const dll = path.join(path.dirname(ra), 'cores', `${name}_libretro.dll`);
    if (fs.existsSync(dll)) return dll;
    const zip = path.join(app.getPath('temp'), `preview-${name}.zip`);
    await download(`https://buildbot.libretro.com/nightly/windows/x86_64/latest/${name}_libretro.dll.zip`, zip, () => {});
    fs.mkdirSync(path.dirname(dll), { recursive: true });
    const r = await run('tar', ['-xf', zip, '-C', path.dirname(dll)]);
    try { fs.unlinkSync(zip); } catch {}
    if (r.code !== 0 || !fs.existsSync(dll)) throw new Error('core ' + name);
    log('retroarch core ready', name);
    return dll;
  }

  // ---------- Launch ----------
  async function launchRom(e, itemId, rom, con, emuPref) {
    try {
      if (!fs.existsSync(rom)) { const alt = rom.replace(/( \(\d+\))+(\.[^.]+)$/, '$2'); if (alt !== rom && fs.existsSync(alt)) { log('launch: using', path.basename(alt), 'instead of the removed copy'); rom = alt; } } // the extra copy was tidied away: play the one that stayed
      if (!fs.existsSync(rom)) return 'ملف اللعبة مو موجود: ' + rom;
      con = con || classify(rom);
      const c = CONSOLES[con];
      if (!c) return 'ما عرفت هذي اللعبة لأي جهاز';
      if (c.core) {
        const ra = emuExe('retroarch');
        if (!ra) return 'RetroArch مو مثبت. حمّله من إعدادات المحاكيات.';
        let dll;
        try { dll = await core(c.core); } catch { if (c.coreAlt) dll = await core(c.coreAlt); else throw new Error('ما قدرت أحمّل نواة ' + c.core); }
        trackSpawn(e, ra, ['-L', dll, '-f', rom], itemId);
        return '';
      }
      let exe = emuExe(c.emu), args = c.args;
      if (con === 'switch' && emuPref && YUZU_FAMILY.includes(emuPref) && emuExe(emuPref)) { exe = emuExe(emuPref); args = ['-f', '-g', '{rom}']; } // you picked another Switch emulator for this game
      if (con === 'switch' && exe && /ryujinx/i.test(path.basename(exe))) { // games that crashed the graphics card in Vulkan start in OpenGL
        const tid = ((/\[(0100[0-9a-f]{12})\]/i.exec(path.basename(rom)) || [])[1] || '').toLowerCase();
        let cmp = {}; try { cmp = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'switch-compat.json'), 'utf8')); } catch {}
        if (tid && cmp[tid] === 'opengl') args = ['--graphics-backend', 'OpenGl', ...args];
      }
      if (con === 'switch' && !exe) {
        for (const id of YUZU_FAMILY) { const x = emuExe(id); if (x) { exe = x; args = ['-f', '-g', '{rom}']; break; } }
      }
      if (!exe) return `محاكي ${c.label} مو مثبت. حمّله من إعدادات المحاكيات.`;
      prepare(c.emu);
      await tune(c.emu);
      if (c.keys) {
        addAutoloadDir();
        // newest update for this game picked in Ryujinx's own list (in case its auto-load folder isn't read yet)
        try {
          const tid = (/\[(0100[0-9a-f]{12})\]/i.exec(path.basename(rom)) || [])[1];
          if (tid && /ryujinx/i.test(path.basename(exe || ''))) {
            const upd = (fs.existsSync(SW_EXTRA) ? fs.readdirSync(SW_EXTRA) : []).filter((n) => new RegExp(`\\[${tid.slice(0, 13)}800\\]`, 'i').test(n)).map((n) => ({ f: path.join(SW_EXTRA, n), v: Number((/\[v(\d+)\]/i.exec(n) || [])[1] || 0) })).sort((a, b) => b.v - a.v);
            if (upd.length) { const d = path.join(RYU, 'games', tid.toLowerCase()); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'updates.json'), JSON.stringify({ selected: upd[0].f, paths: upd.map((x) => x.f) }, null, 2)); }
          }
        } catch (err) { log('switch update list', err.message); }
        if (!placeSwitchKeys()) { shell().openPath((ctx.extraBios || []).find((d) => fs.existsSync(d)) || BIOS); return 'السويتش يحتاج ملف prod.keys من جهازك. فتحت لك مجلد BIOS: حطه فيه وشغّل اللعبة مرة ثانية.'; }
        if (!/ryujinx/i.test(path.basename(exe))) await installSwitchFirmware(); // a yuzu-style emulator found later gets the firmware too
        const yuzuOk = !/ryujinx/i.test(path.basename(exe)) && yuzuHomes().some((h) => { try { return fs.readdirSync(path.join(h, 'nand', 'system', 'Contents', 'registered')).length > 10; } catch { return false; } });
        if (!switchFirmware() && !yuzuOk) { trackSpawn(e, exe, [], itemId); return 'باقي خطوة وحدة: فتحت لك Ryujinx، اختر من فوق Tools ← Install Firmware ← Install a firmware from XCI or ZIP، واختر ملف الفيرموير حقك. بعدها شغّل اللعبة.'; }
      }
      if (c.bios && !placeBios(c.bios)) {
        shell().openPath((ctx.extraBios || []).find((d) => fs.existsSync(d)) || BIOS);
        return `${c.label} يحتاج ملف BIOS من جهازك. فتحت لك مجلد BIOS: حط الملف فيه وشغّل اللعبة مرة ثانية.`;
      }
      trackSpawn(e, exe, args.map((a) => (a === '{rom}' ? rom : a)), itemId);
      return '';
    } catch (err) { log('rom launch failed', err.message); return String(err.message || err); }
  }
  ipcMain.handle('rom:launch', async (e, itemId, rom, con, emuPref) => { const r = await launchRom(e, itemId, rom, con, emuPref); log('launch', path.basename(rom), '->', r || 'started'); return r; });
  const shell = () => require('electron').shell;

  // ---------- Importing: Downloads + the Games folder ----------
  const seen = new Map(); // file -> last size (to wait until a download finishes)
  const busy = new Set();
  function report(file) {
    const con = classify(file);
    if (!con || !CONSOLES[con]) return null;
    const c = CONSOLES[con];
    return { file, console: con, label: c.label, thumbs: c.thumbs, raw: path.basename(file).replace(/\.[^.]+$/, '') };
  }
  function uniq(p) { let q = p, i = 2; while (fs.existsSync(q)) { q = p.replace(/(\.[^.\\/]+)?$/, ` (${i++})$1`); } return q; }
  async function listArchive(file) {
    const r = /\.7z$/i.test(file)
      ? await runOut(await sevenZip(), ['l', '-ba', '-slt', file])
      : await runOut('tar', ['-tf', file]);
    if (/\.7z$/i.test(file)) return [...r.matchAll(/^Path = (.+)$/gm)].map((m) => m[1].trim());
    return r.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  }
  function runOut(cmd, args) {
    return new Promise((resolve) => {
      const p = require('child_process').spawn(cmd, args, { windowsHide: true });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('error', () => resolve(''));
      p.on('exit', () => resolve(out));
    });
  }
  const handled = new Set(); // file|size|time: the same download is only taken once
  async function importFile(file, fromDownloads) {
    if (busy.has(file)) return;
    let key = file;
    try { const st = fs.statSync(file); key = `${file.toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`; } catch { return; }
    if (handled.has(key)) return;
    handled.add(key);
    busy.add(file);
    try {
      if (ARCHIVE.test(file)) {
        const names = await listArchive(file);
        const romish = (n) => (ROM_EXT.test(n) || /\.(bin|img)$/i.test(n)) && !/(^|[\\/])(readme|changelog|license|contributing|notes?)[^\\/]*\.md$/i.test(n);
        if (!names.some(romish)) return;
        if (names.some((n) => /(^|[\\/])(package\.json|index\.html|main\.js)$/i.test(n))) return; // source code / a website, not a game
        if (names.some((n) => /\.(exe|dll|msi)$/i.test(n))) return; // a program, not a game
        send('rom:status', { step: 'extract', name: path.basename(file) });
        const base = path.basename(file).replace(ARCHIVE, '');
        const tmp = path.join(GAMES, '_incoming', base);
        fs.mkdirSync(tmp, { recursive: true });
        const r = /\.7z$/i.test(file) ? await run(await sevenZip(), ['x', file, '-o' + tmp, '-y']) : await run('tar', ['-xf', file, '-C', tmp]);
        if (r.code !== 0) { log('rom extract failed', file, r.err); send('rom:status', { step: 'fail', name: base }); return; }
        const all = [];
        (function walk(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f); else all.push(f); } })(tmp);
        const mains = mainFiles(all);
        const first = mains.map(report).find(Boolean);
        if (!first) { log('archive had no game we know', file); return; }
        const dest = uniq(path.join(GAMES, CONSOLES[first.console].dir, base));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(tmp, dest);
        for (const m of mains) { const rep = report(path.join(dest, path.relative(tmp, m))); if (rep) { send('rom:added', rep); log('game added', rep.console, rep.file); } }
        return;
      }
      if (!ROM_EXT.test(file) && !/\.(bin|img)$/i.test(file)) return;
      if (/\.(nsp|xci|nsz|xcz)$/i.test(file)) { const f2 = await switchPrepare(file); if (!f2) return; file = f2; }
      const rep = report(file);
      if (!rep) return;
      let final = file;
      if (fromDownloads) {
        // Keep the Downloads folder tidy: the game moves into Emulators\Games\<console>
        // (with its .bin tracks when it's a .cue / .gdi)
        const destDir = path.join(GAMES, CONSOLES[rep.console].dir);
        fs.mkdirSync(destDir, { recursive: true });
        const extra = [];
        if (/\.(cue|gdi)$/i.test(file)) {
          const txt = fs.readFileSync(file, 'utf8');
          for (const m of txt.matchAll(/FILE\s+"([^"]+)"|^\s*\d+\s+\d+\s+\d+\s+\d+\s+"?([^"\r\n]+?)"?\s+\d+\s*$/gim)) extra.push(m[1] || m[2]);
        }
        const same = path.join(destDir, path.basename(file));
        if (fs.existsSync(same) && fs.statSync(same).size === fs.statSync(file).size) { // the same game downloaded twice: keep one copy
          try { fs.unlinkSync(file); } catch {}
          log('already in the library', path.basename(file)); return;
        }
        final = uniq(same);
        try { fs.renameSync(file, final); } catch { fs.copyFileSync(file, final); fs.unlinkSync(file); }
        for (const x of extra) { const s = path.join(path.dirname(file), x); if (fs.existsSync(s)) try { fs.renameSync(s, path.join(destDir, x)); } catch {} }
      } else if (/\.(bin|img)$/i.test(file) && mainFiles(fs.readdirSync(path.dirname(file)).map((x) => path.join(path.dirname(file), x))).indexOf(file) < 0) return;
      const out = report(final);
      if (out) { send('rom:added', out); log('game added', out.console, out.file); }
    } catch (err) { log('import failed', file, err.message); } finally { busy.delete(file); }
  }
  // A download is finished when its size stops changing
  function settle(file, fromDownloads) {
    if (BUSY.test(file)) return;
    const check = () => {
      let st; try { st = fs.statSync(file); } catch { seen.delete(file); return; }
      if (!st.isFile()) return;
      const prev = seen.get(file);
      seen.set(file, st.size);
      if (prev === st.size && st.size > 0) { seen.delete(file); importFile(file, fromDownloads); } else setTimeout(check, 2500);
    };
    setTimeout(check, 1500);
  }
  const DOWNLOADS = app.getPath('downloads');
  try {
    fs.watch(DOWNLOADS, (_ev, name) => {
      if (!name) return;
      const f = path.join(DOWNLOADS, name);
      if (ROM_EXT.test(name) || ARCHIVE.test(name) || /\.(bin|img)$/i.test(name)) settle(f, true);
    });
  } catch (e) { log('downloads watch failed', e.message); }
  try {
    fs.watch(GAMES, { recursive: true }, (_ev, name) => {
      if (!name || /^_incoming/i.test(name) || /^Switch[\\/]_/i.test(name)) return; // our own work folders
      const f = path.join(GAMES, name);
      if (ROM_EXT.test(name) || ARCHIVE.test(name)) settle(f, false);
    });
  } catch (e) { log('games watch failed', e.message); }

  // An earlier version could unpack the same download twice ("Game (2)"): drop exact copies
  function removeDuplicateCopies() {
    const sig = (d) => { const out = []; (function w(x, rel) { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const f = path.join(x, e.name); if (e.isDirectory()) w(f, rel + e.name + '/'); else out.push(rel + e.name + ':' + fs.statSync(f).size); } })(d, ''); return out.sort().join('|'); };
    for (const c of Object.values(CONSOLES)) {
      const dir = path.join(GAMES, c.dir);
      let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const m = /^(.*) \((\d+)\)$/.exec(e.name);
        if (!e.isDirectory() || !m) continue;
        const orig = path.join(dir, m[1]), dup = path.join(dir, e.name);
        try { if (fs.existsSync(orig) && sig(orig) === sig(dup)) { fs.rmSync(dup, { recursive: true, force: true }); log('removed duplicate copy', dup); } } catch (err) { log('dup check failed', err.message); }
      }
    }
  }
  try { removeDuplicateCopies(); } catch {}
  // Everything already in the Games folder (startup sync)
  ipcMain.handle('roms:list', () => {
    const all = [];
    (function walk(d, depth) {
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const x of ents) { const f = path.join(d, x.name); if (x.isDirectory()) { if (depth < 4 && !x.name.startsWith('_')) walk(f, depth + 1); } else all.push(f); }
    })(GAMES, 0);
    return { games: GAMES, bios: BIOS, list: mainFiles(all).map(report).filter(Boolean) };
  });
  // "Standard buttons": Wii U games on Cemu use Nintendo's layout (A on the right). Swap A/B and X/Y in its
  // controller profile once, so the bottom button (A / ✕) confirms and the right one (B / ○) goes back.
  ipcMain.handle('pad:standard', () => {
    const exe = emuExe('cemu'); if (!exe) return { cemu: false };
    const dir = path.dirname(exe);
    let done = false;
    for (const f of [path.join(dir, 'portable', 'controllerProfiles', 'controller0.xml'), path.join(dir, 'controllerProfiles', 'controller0.xml')]) {
      try {
        if (!fs.existsSync(f)) continue;
        let x = fs.readFileSync(f, 'utf8');
        if (x.includes('sb-standard')) { done = true; continue; }
        const val = (id) => { const m = new RegExp(`<entry>\\s*<mapping>${id}</mapping>\\s*<button>(\\d+)</button>`).exec(x); return m && m[1]; };
        const set = (id, v) => { x = x.replace(new RegExp(`(<entry>\\s*<mapping>${id}</mapping>\\s*<button>)\\d+(</button>)`), `$1${v}$2`); };
        const [a, b, xx, y] = [val(1), val(2), val(3), val(4)];
        if (a && b) { set(1, b); set(2, a); }
        if (xx && y) { set(3, y); set(4, xx); }
        x = x.replace(/(<\?xml[^>]*>)/, '$1\n<!-- sb-standard: A/B and X/Y swapped by Silver Bullet -->');
        fs.copyFileSync(f, f + '.bak');
        fs.writeFileSync(f, x);
        log('cemu buttons set to standard', f);
        done = true;
      } catch (e) { log('cemu pad fix failed', e.message); }
    }
    return { cemu: done };
  });
  ipcMain.handle('bios:status', () => ({ ps1: placeBios('ps1'), ps2: placeBios('ps2'), switchKeys: placeSwitchKeys(), switchFw: switchFirmware(), dir: BIOS, games: GAMES }));
  ipcMain.handle('rom:import', (_e, file) => {
    // archives and compressed Switch games need unpacking / converting first: that runs in the background and the game shows up when it's ready
    if (ARCHIVE.test(file) || /\.(nsz|xcz)$/i.test(file)) { importFile(file, false); return { pending: true, name: path.basename(file) }; }
    return report(file);
  });
  ipcMain.handle('roms:folder', (_e, which) => shell().openPath(which === 'bios' ? ((ctx.extraBios || []).find((d) => fs.existsSync(d)) || BIOS) : GAMES));
  // Get everything ready ahead of time: configs + the RetroArch cores
  ipcMain.handle('emu:prepare', async () => {
    for (const id of ['duckstation', 'dolphin', 'cemu', 'flycast']) prepare(id);
    const done = [];
    for (const c of [...new Set(Object.values(CONSOLES).filter((x) => x.core).map((x) => x.core))]) {
      try { await core(c); done.push(c); } catch (e) { log('core failed', c, e.message); }
    }
    placeBios('ps1'); placeBios('ps2');
    return done;
  });
  return { classify, CONSOLES, importFile, launchFile: (f) => launchRom({ sender: { send: () => {}, isDestroyed: () => false } }, '', f),  importDir: (d) => { const all = []; (function w(x, depth) { let ents = []; try { ents = fs.readdirSync(x, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(x, e.name); if (e.isDirectory()) { if (depth < 3 && e.name !== '_nsp') w(f, depth + 1); } else all.push(f); } })(d, 0); for (const f of mainFiles(all)) importFile(f, true); return all.length; } };
}
module.exports = { setupRoms, classify, mainFiles };
