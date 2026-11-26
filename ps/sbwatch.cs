// Silver Bullet helper: a few KB of memory, prints one line every 2 seconds:
//   {"fs":3,"fg":"game.exe","idle":12}
// fs = Windows' own "what is the user doing" (3 = a full-screen game, 2 = something full screen / presenting)
// fg = the program in front, idle = minutes since the last key/mouse touch
// It quits by itself when Silver Bullet closes (its stdin closes).
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

class SbWatch {
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
  static void Main() {
    var t = new Thread(() => { try { while (Console.In.ReadLine() != null) { } } catch { } Environment.Exit(0); });
    t.IsBackground = true; t.Start();
    string last = "";
    int same = 0;
    while (true) {
      int st = 0; try { SHQueryUserNotificationState(out st); } catch { }
      string fg = "";
      try { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); using (var p = Process.GetProcessById((int)pid)) fg = p.ProcessName + ".exe"; } catch { }
      var li = new LII(); li.cbSize = 8; long idle = 0;
      try { if (GetLastInputInfo(ref li)) idle = ((long)(uint)Environment.TickCount - li.dwTime) / 60000; } catch { }
      string line = "{\"fs\":" + st + ",\"fg\":\"" + fg.Replace("\\", "").Replace("\"", "") + "\",\"idle\":" + (idle < 0 ? 0 : idle) + "}";
      // only what changed (and a heartbeat every ~30 s), so it costs nothing
      if (line != last || ++same >= 15) { Console.Out.WriteLine(line); Console.Out.Flush(); last = line; same = 0; }
      Thread.Sleep(2000);
    }
  }
}
