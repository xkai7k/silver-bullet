# Docks the real Spotify window inside Preview: borderless, owned by Preview, placed over the Spotify page.
# Commands on stdin (one JSON answer per line):
#   find | show <owner> <x> <y> <w> <h> | hide | release
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class Dock {
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetLong(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetLong(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);

  public static IntPtr Find() {
    var pids = new System.Collections.Generic.HashSet<uint>();
    foreach (var p in Process.GetProcessesByName("Spotify")) {
      pids.Add((uint)p.Id);
      if (p.MainWindowHandle != IntPtr.Zero && GetWindowTextLength(p.MainWindowHandle) > 0) return p.MainWindowHandle;
    }
    IntPtr best = IntPtr.Zero;
    if (pids.Count == 0) return best;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains(pid)) return true;
      var sb = new System.Text.StringBuilder(64); GetClassName(h, sb, 64);
      if (!sb.ToString().StartsWith("Chrome_WidgetWin")) return true;
      if (GetWindowTextLength(h) == 0 || !IsWindowVisible(h)) return true;
      best = h; return false;
    }, IntPtr.Zero);
    return best;
  }
}
'@
[void][Dock]::SetProcessDpiAwarenessContext([IntPtr](-4))
$GWL_STYLE = -16; $GWL_EXSTYLE = -20; $GWLP_OWNER = -8
$WS_CAPTION = 0x00C00000; $WS_THICKFRAME = 0x00040000; $WS_SYSMENU = 0x00080000; $WS_MINMAX = 0x00030000
$WS_EX_APPWINDOW = 0x00040000; $WS_EX_TOOLWINDOW = 0x00000080
$h = [IntPtr]::Zero; $origStyle = $null; $origEx = $null; $docked = $false

function Out($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function Ensure {
  if ($script:h -ne [IntPtr]::Zero -and [Dock]::IsWindow($script:h)) { return $true }
  $script:h = [Dock]::Find(); $script:docked = $false; $script:origStyle = $null
  return ($script:h -ne [IntPtr]::Zero)
}
function Restore {
  if (-not $script:docked -or -not [Dock]::IsWindow($script:h)) { $script:docked = $false; return }
  [void][Dock]::SetLong($script:h, $GWLP_OWNER, [IntPtr]::Zero)
  [void][Dock]::SetLong($script:h, $GWL_STYLE, [IntPtr]$script:origStyle)
  [void][Dock]::SetLong($script:h, $GWL_EXSTYLE, [IntPtr]$script:origEx)
  [void][Dock]::SetWindowPos($script:h, [IntPtr]::Zero, 120, 80, 1200, 760, 0x0024) # NOZORDER|FRAMECHANGED
  [void][Dock]::ShowWindow($script:h, 6) # minimize: keeps playing, reachable from the taskbar
  $script:docked = $false
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { Restore; break }
  try {
    $a = $line.Split(' ')
    switch ($a[0]) {
      'find' { Out @{ ok = (Ensure); procs = @(Get-Process Spotify -ErrorAction SilentlyContinue).Count } }
      'launch' {
        $how = ''
        $exe = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
        if (Test-Path $exe) { Start-Process $exe; $how = 'exe' }
        else {
          $sa = Get-StartApps | Where-Object { $_.Name -like 'Spotify*' } | Select-Object -First 1
          if ($sa -and $sa.AppID -like '*Spotify*!*') { Start-Process ('shell:AppsFolder\' + $sa.AppID); $how = 'store ' + $sa.AppID }
          else { $how = 'none' }
        }
        Out @{ ok = $true; how = $how }
      }
      'show' {
        if (-not (Ensure)) { Out @{ ok = $false; none = $true }; break }
        if (-not $docked) {
          if ([Dock]::IsIconic($h) -or [Dock]::IsZoomed($h)) { [void][Dock]::ShowWindow($h, 9) }
          $origStyle = [Dock]::GetLong($h, $GWL_STYLE).ToInt64()
          $origEx = [Dock]::GetLong($h, $GWL_EXSTYLE).ToInt64()
          $st = $origStyle -band (-bnot ($WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU -bor $WS_MINMAX))
          $ex = ($origEx -band (-bnot $WS_EX_APPWINDOW)) -bor $WS_EX_TOOLWINDOW
          [void][Dock]::SetLong($h, $GWL_STYLE, [IntPtr]$st)
          [void][Dock]::SetLong($h, $GWL_EXSTYLE, [IntPtr]$ex)
          $docked = $true
        }
        [void][Dock]::SetLong($h, $GWLP_OWNER, [IntPtr][long]$a[1])
        [void][Dock]::SetWindowPos($h, [IntPtr]::Zero, [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], 0x0060) # SHOWWINDOW|FRAMECHANGED
        Out @{ ok = $true }
      }
      'hide' { if ($docked -and [Dock]::IsWindow($h)) { [void][Dock]::ShowWindow($h, 0) }; Out @{ ok = $true } }
      'release' { Restore; Out @{ ok = $true } }
      default { Out @{ ok = $false } }
    }
  } catch { Out @{ ok = $false; error = $_.Exception.Message } }
}
