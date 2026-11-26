# Battery of every wireless device Windows knows about (Bluetooth, wireless mice / keyboards / headsets),
# plus Xbox controllers on the wireless adapter (XInput). Prints a JSON array of { name, battery, cls }.
$ErrorActionPreference = 'SilentlyContinue'
$out = New-Object System.Collections.ArrayList
$xiSeen = $false
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
    $rc = [SB.XI]::XInputGetBatteryInformation($i, 0, [ref]$b)
    if ($rc -eq 0) { $xiSeen = $true }
    if ($rc -eq 0 -and $b.Type -eq 1) { [void]$out.Add([pscustomobject]@{ name = "Xbox Controller $($i + 1)"; battery = $null; cls = 'XInput'; wired = $true }); continue }  # on a cable: charging, no level to tell
    if ($rc -eq 0 -and $b.Type -ge 2 -and $b.Type -ne 255) {
      $pct = @(10, 40, 75, 100)[[Math]::Min(3, $b.Level)]  # XInput only knows empty / low / medium / full: shown as about 10 / 40 / 75 / 100 %
      [void]$out.Add([pscustomobject]@{ name = "Xbox Controller $($i + 1)"; battery = $pct; cls = 'XInput'; approx = $true })
    }
  }
} catch {}
# Bluetooth LE devices that are connected right now: read their real battery from the device (GATT Battery Service),
# not Windows' copy from when they paired. Best effort, a few seconds at most.
$live = @{}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); if (-not $task.Wait(2500)) { return $null }; $task.Result }
  $null = [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $sel = [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromConnectionStatus([Windows.Devices.Bluetooth.BluetoothConnectionStatus]::Connected)
  $infos = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($sel)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  foreach ($inf in @($infos)) {
    $dev = Await ([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromIdAsync($inf.Id)) ([Windows.Devices.Bluetooth.BluetoothLEDevice])
    if (-not $dev) { continue }
    $live[$dev.Name.ToLower()] = -1   # connected, level unknown yet
    $svcs = Await ($dev.GetGattServicesForUuidAsync([guid]'0000180f-0000-1000-8000-00805f9b34fb', [Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattDeviceServicesResult])
    foreach ($svc in @($svcs.Services)) {
      $chs = Await ($svc.GetCharacteristicsForUuidAsync([guid]'00002a19-0000-1000-8000-00805f9b34fb', [Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicsResult])
      foreach ($ch in @($chs.Characteristics)) {
        $rv = Await ($ch.ReadValueAsync([Windows.Devices.Bluetooth.BluetoothCacheMode]::Uncached)) ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattReadResult])
        if ($rv -and $rv.Status -eq 0) { $rd = [Windows.Storage.Streams.DataReader]::FromBuffer($rv.Value); $live[$dev.Name.ToLower()] = [int]$rd.ReadByte() }
      }
    }
  }
} catch {}
foreach ($o in $out) {
  $k = ($o.name -replace '(?i)\s*hands-?free.*$', '').Trim().ToLower()
  foreach ($n in @($live.Keys)) { if ($live[$n] -ge 0 -and ($k -like "*$n*" -or $n -like "*$k*")) { $o.battery = $live[$n]; $o | Add-Member -NotePropertyName live -NotePropertyValue $true -Force } }
}
# an LE pad Windows lists but that is switched off: not shown
if ($live.Count -or $infos) { $out = [System.Collections.ArrayList]@($out | Where-Object { $_.cls -eq 'XInput' -or $_.live -or $_.name -notmatch '(?i)xbox|controller|gamepad' -or ($live.Keys | Where-Object { $_ -and $_.Length -gt 3 -and $_ -like '*controller*' }) }) }
# no Xbox pad answers XInput: it is switched off, so Windows' old Bluetooth number for it is not shown
if (-not $xiSeen) { $out = [System.Collections.ArrayList]@($out | Where-Object { $_.name -notmatch '(?i)xbox' }) }
# Windows keeps an Xbox pad's Bluetooth battery from when it paired (it shows 75% for ever), and lists the pad twice:
# when XInput can read the pad itself, that is the true level, so the Bluetooth copies go
if (@($out | Where-Object { $_.cls -eq 'XInput' }).Count) { $out = [System.Collections.ArrayList]@($out | Where-Object { $_.cls -eq 'XInput' -or $_.name -notmatch '(?i)xbox|controller|gamepad' }) }
$seen = @{}; $out = @($out | Where-Object { $k = $_.name.ToLower(); if ($seen[$k]) { $false } else { $seen[$k] = 1; $true } })
ConvertTo-Json -Compress -InputObject @($out)
