# What this PC is: processor, memory, graphics, screen, Wi-Fi / Bluetooth, laptop battery,
# and the wireless things around it (headsets, controllers, mice, keyboards) even when they don't report a battery.
# Prints one JSON object.
$ErrorActionPreference = 'SilentlyContinue'
$r = [ordered]@{}
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$r.cpu = "$($cpu.Name)".Trim()
$r.cores = [int]$cpu.NumberOfLogicalProcessors
$r.ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$r.gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch '(?i)basic display|remote|virtual|parsec|meta' } | ForEach-Object {
  [pscustomobject]@{ name = "$($_.Name)".Trim(); vramGB = [math]::Round([double]$_.AdapterRAM / 1GB, 1) }
})
$r.laptop = [bool](Get-CimInstance Win32_Battery)
$r.wifi = [bool](Get-NetAdapter -Physical | Where-Object { $_.InterfaceDescription -match '(?i)wi-?fi|wireless|802\.11|wlan' -or $_.Name -match '(?i)wi-?fi|wlan' })
$r.bluetooth = [bool](Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object { $_.InstanceId -match '^USB|^PCI' -or $_.FriendlyName -match '(?i)adapter|radio|wireless bluetooth|intel|realtek|mediatek|qualcomm|broadcom' })
$r.os = "$((Get-CimInstance Win32_OperatingSystem).Caption)".Trim()

# Wireless things: Bluetooth devices that are connected now, plus named receivers (2.4 GHz dongles) for mice / headsets / pads
$skip = '(?i)wireless lan|802\.11|\bnic\b|network|wi-?fi|xinput compatible|^bluetooth hid device$|hid-compliant|generic|attribute|service|enumerator|transport|avrcp|hands-?free ag audio|rfcomm|protocol|microsoft bluetooth|bluetooth device \(|le enumerator|radio|adapter|personal area|identification|device information|battery service|hid service|scan parameters|^bluetooth$'
$seen = @{}
$devs = New-Object System.Collections.ArrayList
Get-PnpDevice -PresentOnly | Where-Object {
  $_.Status -eq 'OK' -and $_.FriendlyName -and $_.FriendlyName -notmatch $skip -and (
    ($_.InstanceId -match '^(BTHENUM|BTHLE|BTHLEDEVICE|BTHHFENUM)' -and $_.Class -match '(?i)^(Bluetooth|AudioEndpoint|HIDClass|Media|XboxComposite|XnaComposite|Mouse|Keyboard)$') -or
    ($_.InstanceId -match '^(HID|USB)' -and $_.FriendlyName -match '(?i)wireless|receiver|lightspeed|dongle|xbox wireless|dualsense|dualshock|8bitdo|nimbus|razer.*(hyper|wireless)|steelseries.*(arctis|wireless)|hyperx.*(cloud|wireless)|corsair.*wireless|logitech.*(g\d{3}|mx|unifying|wireless)')
  )
} | ForEach-Object {
  $n = ($_.FriendlyName -replace '(?i)\s*(hands-?free|stereo|avrcp transport|- find my|LE)\s*$', '').Trim()
  $k = $n.ToLower()
  if (-not $seen[$k]) {
    $seen[$k] = 1
    $kind = if ($n -match '(?i)head|bud|pods|arctis|cloud|wh-|wf-|jbl|beats|sound|audio|speaker|سماع') { 'audio' }
      elseif ($n -match '(?i)controller|gamepad|xbox|dualsense|dualshock|8bitdo|nimbus|pro controller|joy-?con') { 'pad' }
      elseif ($n -match '(?i)mouse|mx master|g\d{3}|viper|deathadder') { 'mouse' }
      elseif ($n -match '(?i)keyboard|keys') { 'keyboard' }
      elseif ($n -match '(?i)receiver|dongle|unifying|lightspeed') { 'receiver' }
      elseif ($n -match '(?i)phone|iphone|galaxy|pixel') { 'phone' } else { 'other' }
    [void]$devs.Add([pscustomobject]@{ name = $n; kind = $kind; bt = [bool]($_.InstanceId -match '^BTH') })
  }
}
# Xbox pads on the wireless adapter or a cable (XInput)
try {
  Add-Type -Namespace SBD -Name XI -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct BAT { public byte Type; public byte Level; }
[DllImport("xinput1_4.dll")] public static extern int XInputGetBatteryInformation(int user, byte devType, ref BAT info);
'@
  for ($i = 0; $i -lt 4; $i++) {
    $b = New-Object SBD.XI+BAT
    if ([SBD.XI]::XInputGetBatteryInformation($i, 0, [ref]$b) -eq 0 -and $b.Type -ne 0) {
      [void]$devs.Add([pscustomobject]@{ name = "Xbox Controller $($i + 1)"; kind = 'pad'; bt = $false; wired = ($b.Type -eq 1) })
    }
  }
} catch {}
$r.wireless = @($devs)
ConvertTo-Json -Compress -Depth 4 -InputObject $r
