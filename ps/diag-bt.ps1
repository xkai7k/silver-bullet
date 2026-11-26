$ErrorActionPreference = 'SilentlyContinue'
Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE|BTHLEDEVICE|HID|USB)' -and $_.FriendlyName -match '(?i)xbox|controller|g435|head|wireless|gamepad|dualsense' } | ForEach-Object {
  $id = $_.InstanceId
  $props = Get-PnpDeviceProperty -InstanceId $id | Where-Object { $_.KeyName -match 'Connected|Battery|LastArrival|LastRemoval|Bluetooth|IsPresent|{83DA6326|{104EA319' } | ForEach-Object { "$($_.KeyName)=$($_.Data)" }
  "## $($_.FriendlyName) [$($_.Class)] $($_.Status) $id`n   " + ($props -join "`n   ")
}
Add-Type -Namespace D -Name XI -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct BAT { public byte Type; public byte Level; }
[DllImport("xinput1_4.dll")] public static extern int XInputGetBatteryInformation(int user, byte devType, ref BAT info);
'@
for ($i = 0; $i -lt 4; $i++) { $b = New-Object D.XI+BAT; $rc = [D.XI]::XInputGetBatteryInformation($i, 0, [ref]$b); "xinput $i rc=$rc type=$($b.Type) level=$($b.Level)" }
