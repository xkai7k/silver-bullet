@echo off
rem Opens this copy NEXT TO your installed Silver Bullet, to compare:
rem its own data, it does not install itself, does not touch your shortcuts.
setlocal
set "SRC=%~dp0"
set "RUN=%LOCALAPPDATA%\SilverBullet-testcopy"
where node >nul 2>nul
if errorlevel 1 ( start https://nodejs.org & echo Install Node.js LTS first. & pause & exit /b )
robocopy "%SRC%." "%RUN%" /E /XD node_modules .git /NFL /NDL /NJH /NJS /NP >nul
cd /d "%RUN%"
if not exist node_modules\electron call npm install --no-audit --no-fund
set SB_TEST=1
start "" /b cmd /c "npx electron ."
