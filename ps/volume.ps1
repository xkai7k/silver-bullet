# Sets the volume of one app (Spotify by default) in the Windows mixer, or the whole PC.
#   volume.ps1 <0-100> [processName|master]   → prints the app it changed, or "none"
param([int]$Level = 50, [string]$Target = 'spotify')
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace SBVol {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice dev); }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int N0(); int N1(); int N2(); int N3(); int N4(); int N5(); int N6(); int N7(); int N8();
    int N9(); int N10(); [PreserveSig] int GetProcessId(out int pid);
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume { [PreserveSig] int SetMasterVolume(float l, ref Guid ctx); [PreserveSig] int GetMasterVolume(out float l); }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume { int N0(); int N1(); int N2(); int N3(); [PreserveSig] int SetMasterVolumeLevelScalar(float l, ref Guid ctx); }
  public static class Vol {
    static IMMDevice Dev() { IMMDevice d; ((IMMDeviceEnumerator)new MMDeviceEnumerator()).GetDefaultAudioEndpoint(0, 1, out d); return d; }
    public static void Master(float l) { var iid = typeof(IAudioEndpointVolume).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o); var g = Guid.Empty; ((IAudioEndpointVolume)o).SetMasterVolumeLevelScalar(l, ref g); }
    // Windows' audio sessions only answer properly on an MTA thread (PowerShell runs STA)
    public static int AppMta(string name, float l) { int r = -1; Exception err = null; var t = new System.Threading.Thread(() => { try { r = App(name, l); } catch (Exception e) { err = e; } }); t.SetApartmentState(System.Threading.ApartmentState.MTA); t.Start(); t.Join(); if (err != null) throw err; return r; }
    public static void MasterMta(float l) { Exception err = null; var t = new System.Threading.Thread(() => { try { Master(l); } catch (Exception e) { err = e; } }); t.SetApartmentState(System.Threading.ApartmentState.MTA); t.Start(); t.Join(); if (err != null) throw err; }
    public static int App(string name, float l) {
      var iid = typeof(IAudioSessionManager2).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o);
      IAudioSessionEnumerator e; ((IAudioSessionManager2)o).GetSessionEnumerator(out e);
      int n; e.GetCount(out n); int hit = 0;
      for (int i = 0; i < n; i++) {
        IAudioSessionControl2 s; e.GetSession(i, out s); int pid; s.GetProcessId(out pid);
        string pn = ""; try { pn = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch {}
        if (pn.Equals(name, StringComparison.OrdinalIgnoreCase)) { var g = Guid.Empty; ((ISimpleAudioVolume)s).SetMasterVolume(l, ref g); hit++; }
      }
      return hit;
    }
  }
}
"@
$l = [Math]::Max(0, [Math]::Min(100, $Level)) / 100.0
try {
  if ($Target -eq 'master') { [SBVol.Vol]::MasterMta($l); 'master'; exit }
  if ([SBVol.Vol]::AppMta($Target, $l) -gt 0) { $Target } else { 'none' }
} catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; ('err: ' + $e.GetType().Name + ': ' + $e.Message) -replace '\s+', ' ' }
