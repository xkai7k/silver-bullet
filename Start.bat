@echo off
rem Silver Bullet - first start. Installs what it needs, then the app installs itself
rem (Desktop + Start menu shortcut) and from then on you just open "Silver Bullet".
setlocal
title Silver Bullet - first start
set "SRC=%~dp0"
set "RUN=%LOCALAPPDATA%\SilverBullet-src"

rem Opened straight from inside the zip: Windows only unpacked this one file
if not exist "%SRC%main.js" goto notExtracted

where node >nul 2>nul
if errorlevel 1 goto noNode

echo.
echo  [1/3] Copying Silver Bullet...
rem run from a local folder - OneDrive / Desktop folders break Electron's files
robocopy "%SRC%." "%RUN%" /E /XD node_modules .git /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto copyFailed
cd /d "%RUN%"

if exist "node_modules\electron\dist\electron.exe" goto start
echo  [2/3] Downloading Electron - first time only, needs internet, about 100 MB...
call npm install --no-audit --no-fund
if not exist "node_modules\electron\dist\electron.exe" goto installFailed

:start
echo  [3/3] Starting Silver Bullet...
echo.
echo  The app is opening. You can close this window once it shows up.
"node_modules\electron\dist\electron.exe" . > "%RUN%\start-log.txt" 2>&1
if errorlevel 1 goto crashed
exit /b 0

:notExtracted
echo.
echo  [!] The files are still inside the zip.
echo.
echo  1. Close this window.
echo  2. Right-click silver-bullet-main.zip, choose "Extract All", then "Extract".
echo  3. Open the new folder silver-bullet-main and double-click Start.bat there.
echo.
pause
exit /b 1

:noNode
echo.
echo  [!] Node.js is needed - install it once.
echo  Opening nodejs.org: download the LTS version, install it with Next...Next,
echo  then double-click Start.bat again.
start "" https://nodejs.org
echo.
pause
exit /b 1

:copyFailed
echo.
echo  [!] Could not copy the files to %RUN%
echo  Move the silver-bullet-main folder to Documents or Desktop and try again.
echo.
pause
exit /b 1

:installFailed
echo.
echo  [!] Electron did not download.
echo  Check the internet connection, turn off VPN if any, then run Start.bat again.
echo.
pause
exit /b 1

:crashed
echo.
echo  [!] Silver Bullet closed with an error. What it said:
echo  ------------------------------------------------------
type "%RUN%\start-log.txt"
echo  ------------------------------------------------------
echo  This is also saved in: %RUN%\start-log.txt
echo.
pause
exit /b 1
