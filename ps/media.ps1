# Reads what Spotify (or any player) is playing from Windows' media controls.
# Commands on stdin, one JSON answer per line on stdout:  get [thumb] | seek <seconds>
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Session {
  $all = $mgr.GetSessions()
  $sp = $all | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
  if ($sp) { return $sp }
  return $null
}
function Out($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 3)); [Console]::Out.Flush() }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  # every request starts with an id, and the answer carries it back (answers can't get mixed up)
  $id = ''; if ($line -match '^(\d+) (.*)$') { $id = $Matches[1]; $line = $Matches[2] }
  try {
    $s = Session
    if (-not $s) { Out @{ id = $id; ok = $true; none = $true }; continue }
    $parts = $line.Split(' ')
    if ($parts[0] -eq 'seek') {
      $ticks = [long]([double]$parts[1] * 10000000)
      $r = Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])
      Out @{ id = $id; ok = $r }; continue
    }
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $tl = $s.GetTimelineProperties()
    $pb = $s.GetPlaybackInfo()
    $o = @{
      id = $id; ok = $true; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle
      pos = $tl.Position.TotalSeconds; dur = $tl.EndTime.TotalSeconds
      updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      playing = ($pb.PlaybackStatus.ToString() -eq 'Playing')
    }
    if ($parts.Count -gt 1 -and $parts[1] -eq 'thumb') {
      if (-not $p.Thumbnail) { $o.thumbError = 'no thumbnail' }
      else {
        try {
          $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          $size = [uint32]$st.Size
          $reader = [Windows.Storage.Streams.DataReader]::new($st.GetInputStreamAt(0))
          [void](Await ($reader.LoadAsync($size)) ([uint32]))
          $bytes = New-Object byte[] $size
          $reader.ReadBytes($bytes)
          $type = if ($st.ContentType) { $st.ContentType } else { 'image/jpeg' }
          $o.thumb = 'data:' + $type + ';base64,' + [Convert]::ToBase64String($bytes)
          $reader.Dispose(); $st.Dispose()
        } catch { $o.thumbError = $_.Exception.Message }
      }
    }
    Out $o
  } catch { Out @{ id = $id; ok = $false; error = $_.Exception.Message } }
}
