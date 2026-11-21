// Silver Bullet starter (lives inside the installed app). It refreshes the app's files from the
// project folder, then starts it — so updates show up just by opening the app again.
const path = require('path');
const fs = require('fs');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'boot.json'), 'utf8')); } catch {}
const live = path.join(__dirname, 'live');
const SKIP = /^(node_modules|Tools|Mods|bios|BIOS|\.git|_.*)$|(-log\.txt|\.old|preview-snap\.png|snap-request\.txt|install-log\.txt)$/i;
function sync(from, to, depth = 0) {
  let ents = [];
  try { ents = fs.readdirSync(from, { withFileTypes: true }); } catch { return; }
  fs.mkdirSync(to, { recursive: true });
  for (const e of ents) {
    if (SKIP.test(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { if (depth < 2) sync(a, b, depth + 1); continue; }
    if (!/\.(js|css|html|json|ps1|png|ico|svg|txt|vbs|bat)$/i.test(e.name) || /^package(-lock)?\.json$/i.test(e.name)) continue;
    try {
      const sa = fs.statSync(a); let sb = null; try { sb = fs.statSync(b); } catch {}
      if (!sb || sb.size !== sa.size || Math.abs(sb.mtimeMs - sa.mtimeMs) > 1000) { fs.copyFileSync(a, b); fs.utimesSync(b, sa.atime, sa.mtime); }
    } catch {}
  }
}
if (cfg.src && fs.existsSync(cfg.src)) sync(cfg.src, live);
process.env.PREVIEW_SRC = cfg.src ? cfg.src.replace(/[\\/]?$/, path.sep) : '';
process.env.SB_INSTALLED = '1';
require(path.join(live, 'main.js'));
