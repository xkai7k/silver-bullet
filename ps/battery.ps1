# Battery of every wireless device Windows knows about (Bluetooth, wireless mice / keyboards / headsets),
# plus Xbox controllers on the wireless adapter (XInput). Prints a JSON array of { name, battery, cls }.
$ErrorActionPreference = 'SilentlyContinue'
$out = New-Object System.Collections.ArrayList
$key = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
# Only devices that can be wireless: Bluetooth ones, and named mice / keyboards / headsets / controllers on receivers
$devs = Get-PnpDevice -PresentOnly | Where-Object {
  $_.InstanceId -match '^(BTHENUM|BTHLE|BTHLEDEVICE|BTHHFENUM)' -or
  ($_.FriendlyName -match '(?i)mouse|keyboard|headset|headphone|controller|gamepad|wireless|lightspeed|g\d{3}|mx |razer|steelseries|hyperx|corsair' -and $_.InstanceId -match '^(HID|USB|SWD)')
}
$byId = @{}; foreach ($d in $devs) { $byId[$d.InstanceId] = $d }
$props = if ($devs) { Get-PnpDeviceProperty -InstanceId @($devs.InstanceId) -KeyName $key } else { @() }
$props | Where-Object { $_.Data -ne $null } | ForEach-Object {
  $d = $byId[$_.InstanceId]
  if ($d -and $d.FriendlyName) { [void]$out.Add([pscustomobject]@{ name = $d.FriendlyName; battery = [int]$_.Data; cls = $d.Class }) }
}
try {
  Add-Type -Namespace SB -Name XI -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct BAT { public byte Type; public byte Level; }
[DllImport("xinput1_4.dll")] public static extern int XInputGetBatteryInformation(int user, byte devType, ref BAT info);
'@
  for ($i = 0; $i -lt 4; $i++) {
    $b = New-Object SB.XI+BAT
    if ([SB.XI]::XInputGetBatteryInformation($i, 0, [ref]$b) -eq 0 -and $b.Type -ge 2 -and $b.Type -ne 255) {
      $pct = @(5, 30, 65, 100)[[Math]::Min(3, $b.Level)]
      [void]$out.Add([pscustomobject]@{ name = "Xbox Controller $($i + 1)"; battery = $pct; cls = 'XInput'; approx = $true })
    }
  }
} catch {}
ConvertTo-Json -Compress -InputObject @($out)
