# Finds installed games from the other launchers, and well-known programs from the Start menu.
# Prints one JSON array: [{ name, target, args?, source, dir? }]
param([string]$Kind = 'all')
$ErrorActionPreference = 'SilentlyContinue'
$out = New-Object System.Collections.ArrayList
$skipExe = 'unins|uninstall|crash|report|redist|vcredist|dxsetup|setup|install|update|launcherpatcher|helper|easyanticheat|eac|battleye|be_service|cefprocess|webhelper|unitycrashhandler|ue4prereq|dotnet|touchup|cleanup'

function Add-Item($name, $target, $source, $argsList = $null, $dir = $null) {
  if (-not $name -or -not $target) { return }
  if ($out | Where-Object { $_.target -eq $target -and "$($_.args)" -eq "$argsList" }) { return }
  [void]$out.Add([ordered]@{ name = $name.Trim(); target = $target; args = $argsList; source = $source; dir = $dir })
}
function Main-Exe($dir, [string[]]$prefer = @()) {
  if (-not $dir -or -not (Test-Path $dir)) { return $null }
  foreach ($p in $prefer) { $f = Join-Path $dir $p; if (Test-Path $f) { return $f } }
  $exes = Get-ChildItem -Path $dir -Filter *.exe -File -Recurse -Depth 2 | Where-Object { $_.Name -notmatch $skipExe }
  if (-not $exes) { return $null }
  # biggest program near the top of the folder is usually the game
  return ($exes | Sort-Object @{ e = { ($_.FullName.Split('\').Count) } }, @{ e = { -$_.Length } } | Select-Object -First 1).FullName
}
function Uninstall-Entries {
  $keys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  Get-ItemProperty $keys | Where-Object { $_.DisplayName }
}
$want = { param($k) $Kind -eq 'all' -or $Kind -eq $k }

# ---- Rockstar Games Launcher ----
if (& $want 'rockstar') {
  Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games' | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    $n = $_.PSChildName
    if ($n -match 'Launcher|Social Club|Rockstar Games$' -or -not $p.InstallFolder) { return }
    $exe = Main-Exe $p.InstallFolder @('PlayGTAV.exe', 'GTA5_Enhanced.exe', 'RDR2.exe', 'PlayRDR.exe', 'GTAIV.exe', 'LaunchGTAIV.exe', 'LANoire.exe', 'Bully.exe', 'MaxPayne3.exe', 'gta_sa.exe', 'gta-vc.exe')
    if ($exe) { Add-Item $n $exe 'rockstar' $null $p.InstallFolder }
  }
  Uninstall-Entries | Where-Object { $_.Publisher -match 'Rockstar' -and $_.DisplayName -notmatch 'Launcher|Social Club' -and $_.InstallLocation } | ForEach-Object {
    $exe = Main-Exe $_.InstallLocation @('PlayGTAV.exe', 'RDR2.exe', 'PlayRDR.exe')
    if ($exe) { Add-Item $_.DisplayName $exe 'rockstar' $null $_.InstallLocation }
  }
}
# ---- Ubisoft Connect ----
if (& $want 'ubisoft') {
  Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs' | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    if (-not $p.InstallDir -or -not (Test-Path $p.InstallDir)) { return }
    $name = Split-Path ($p.InstallDir.TrimEnd('/', '\')) -Leaf
    Add-Item $name "uplay://launch/$($_.PSChildName)/0" 'ubisoft' $null $p.InstallDir
  }
}
# ---- GOG Galaxy ----
if (& $want 'gog') {
  Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games' | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    $exe = if ($p.exe -and (Test-Path $p.exe)) { $p.exe } else { Main-Exe $p.path }
    if ($p.gameName -and $exe) { Add-Item $p.gameName $exe 'gog' $null $p.path }
  }
}
# ---- EA app ----
if (& $want 'ea') {
  Uninstall-Entries | Where-Object { $_.Publisher -match 'Electronic Arts' -and $_.DisplayName -notmatch '^EA( app|Desktop)?$|EA app|Origin$' -and $_.InstallLocation } | ForEach-Object {
    $exe = Main-Exe $_.InstallLocation
    if ($exe) { Add-Item $_.DisplayName $exe 'ea' $null $_.InstallLocation }
  }
}
# ---- Battle.net ----
if (& $want 'battlenet') {
  Uninstall-Entries | Where-Object { $_.Publisher -match 'Blizzard' -and $_.DisplayName -notmatch 'Battle\.net' -and $_.InstallLocation } | ForEach-Object {
    $exe = Main-Exe $_.InstallLocation @('_retail_\Wow.exe', 'Overwatch.exe', 'Diablo IV.exe', 'Hearthstone.exe', 'Diablo III64.exe', 'StarCraft II.exe', 'Diablo II Resurrected.exe')
    if ($exe) { Add-Item $_.DisplayName $exe 'battlenet' $null $_.InstallLocation }
  }
}
# ---- Riot (Valorant, League of Legends) ----
if (& $want 'riot') {
  Uninstall-Entries | Where-Object { $_.Publisher -match 'Riot Games' -and $_.UninstallString -match 'RiotClientServices\.exe' } | ForEach-Object {
    $m = [regex]::Match($_.UninstallString, '"?([^"]*RiotClientServices\.exe)"?.*--uninstall-product=(\S+).*--uninstall-patchline=(\S+)')
    if ($m.Success) { Add-Item $_.DisplayName $m.Groups[1].Value 'riot' @("--launch-product=$($m.Groups[2].Value)", "--launch-patchline=$($m.Groups[3].Value)") }
  }
}
# ---- Xbox / Game Pass (PC) ----
if (& $want 'xbox') {
  $start = @{}; Get-StartApps | ForEach-Object { $start[$_.AppID] = $_.Name }
  Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.InstallLocation -and (Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } | ForEach-Object {
    $pkg = $_
    $ids = (Get-AppxPackageManifest $pkg).Package.Applications.Application | ForEach-Object { $_.Id }
    foreach ($id in @($ids)) {
      $aumid = "$($pkg.PackageFamilyName)!$id"
      $name = $start[$aumid]
      if ($name) { Add-Item $name "shell:AppsFolder\$aumid" 'xbox' $null $pkg.InstallLocation; break }
    }
  }
}
# ---- Well-known programs (from the Start menu) ----
if ($Kind -eq 'apps') {
  $known = 'Discord|Google Chrome|Brave|Firefox|Microsoft Edge|Opera( GX)?|OBS Studio|Telegram|WhatsApp|VLC media player|Steam$|Epic Games Launcher|Battle\.net|^EA$|EA app|Ubisoft Connect|Rockstar Games Launcher|GOG GALAXY|^Xbox$|Spotify|Visual Studio Code|Notepad\+\+|7-Zip File Manager|WinRAR$|Adobe Photoshop|Adobe Premiere Pro|Adobe After Effects|Adobe Illustrator|Blender|Audacity|^Zoom|Microsoft Teams|^Word$|^Excel$|^PowerPoint$|^Outlook|Medal|Overwolf|NVIDIA (App|Control Panel)|GeForce Experience|AMD Software|MSI Afterburner|Logitech G HUB|Razer Synapse|SteelSeries GG|Corsair iCUE|Wallpaper Engine|Parsec|AnyDesk|TeamViewer|CapCut|DaVinci Resolve|Figma|Notion|Slack|Signal|Playnite|DS4Windows|CPU-Z|HWMonitor|Snipping Tool|Calculator|Paint$|Microsoft Store|Netflix|Prime Video|Disney\+|Riot Client|Minecraft Launcher|Roblox Player|Unigram|Instagram|TikTok|Messenger|Skype|Thunderbird|qBittorrent|uTorrent|Bitwarden|1Password|NordVPN|ProtonVPN'
  $dirs = @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs", "$env:APPDATA\Microsoft\Windows\Start Menu\Programs")
  Get-ChildItem $dirs -Filter *.lnk -Recurse | ForEach-Object {
    $n = $_.BaseName
    if ($n -match '(?i)uninstall|readme|help|website|manual|documentation|release notes|reset|skinned|updater|safe mode|debug|for business') { return }
    if ($n -match "(?i)$known") { Add-Item $n $_.FullName 'app' }
  }
  foreach ($sa in (Get-StartApps | Where-Object { $_.AppID -match '!' -and $_.Name -match "(?i)$known" })) {
    if ($out | Where-Object { $_.name -eq $sa.Name }) { continue }
    Add-Item $sa.Name "shell:AppsFolder\$($sa.AppID)" 'app'
  }
}
$out | ConvertTo-Json -Depth 4 -Compress
