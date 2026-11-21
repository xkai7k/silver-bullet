@echo off
rem Silver Bullet - first start. Installs what it needs, then the app installs itself
rem (Desktop + Start menu shortcut) and from then on you just open "Silver Bullet".
setlocal
set "SRC=%~dp0"
set "RUN=%LOCALAPPDATA%\SilverBullet-src"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed once. Opening nodejs.org - install the LTS version, then run Start.bat again.
  start https://nodejs.org
  pause
  exit /b
)
rem run from a local folder (OneDrive / Desktop folders break Electron's files)
robocopy "%SRC%." "%RUN%" /E /XD node_modules .git /NFL /NDL /NJH /NJS /NP >nul
cd /d "%RUN%"
if not exist node_modules\electron call npm install --no-audit --no-fund
start "" /b cmd /c "npx electron ."
