// Silver Bullet helper: the phone as mouse & keyboard. Reads one command per line on stdin:
//   rel dx dy        move the pointer by dx, dy pixels
//   abs fx fy        put the pointer at a spot of the main screen (0..1 each way)
//   click l|r|m      a click;  dbl = double click
//   wheel n          scroll (positive = up)
//   text BASE64      type this text (UTF-8, any language)
//   key a+b+c        press keys together (ctrl+c, alt+tab, enter, win, volup...)
//   monoff / monon   turn the screen off / back on
// It also watches the real mouse: when someone moves or clicks it, it prints "P" (at most twice a second),
// so Silver Bullet gives the PC back to whoever is sitting at it.
// It quits by itself when Silver Bullet closes (its stdin closes).
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class SbInput {
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, int dx, int dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr extra);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr hwnd, uint min, uint max);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  static HookProc mouseProc; static IntPtr mouseHook; static int lastPrint;
  // MSLLHOOKSTRUCT: pt (8 bytes), mouseData (4), flags (4): bit 0 = injected (that's us, or another program)
  static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam) {
    try {
      if (code >= 0) {
        int flags = Marshal.ReadInt32(lParam, 12);
        if ((flags & 1) == 0 && Environment.TickCount - lastPrint > 500) { lastPrint = Environment.TickCount; Console.Out.WriteLine("P"); Console.Out.Flush(); }
      }
    } catch { }
    return CallNextHookEx(mouseHook, code, wParam, lParam);
  }
  static void WatchMouse() {
    mouseProc = OnMouse;
    mouseHook = SetWindowsHookEx(14, mouseProc, GetModuleHandle(null), 0); // WH_MOUSE_LL
    MSG m; while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
  }

  struct POINT { public int X; public int Y; }
  // INPUT with a KEYBDINPUT inside, laid out for 64-bit Windows (40 bytes)
  [StructLayout(LayoutKind.Explicit, Size = 40)]
  struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public ushort wVk;
    [FieldOffset(10)] public ushort wScan;
    [FieldOffset(12)] public uint dwFlags;
    [FieldOffset(16)] public uint time;
    [FieldOffset(24)] public IntPtr extra;
  }

  static readonly Dictionary<string, byte> Keys = new Dictionary<string, byte>(StringComparer.OrdinalIgnoreCase) {
    {"ctrl",0x11},{"alt",0x12},{"shift",0x10},{"win",0x5B},{"enter",0x0D},{"back",0x08},{"esc",0x1B},{"tab",0x09},
    {"space",0x20},{"up",0x26},{"down",0x28},{"left",0x25},{"right",0x27},{"del",0x2E},{"home",0x24},{"end",0x23},
    {"pgup",0x21},{"pgdn",0x22},{"f11",0x7A},{"f5",0x74},{"volup",0xAF},{"voldown",0xAE},{"mute",0xAD},{"playpause",0xB3},
    {"next",0xB0},{"prev",0xB1}
  };
  static readonly HashSet<byte> Extended = new HashSet<byte> { 0x26, 0x28, 0x25, 0x27, 0x2E, 0x24, 0x23, 0x21, 0x22, 0x5B };

  static byte Vk(string k) {
    byte v;
    if (Keys.TryGetValue(k, out v)) return v;
    if (k.Length == 1) { char c = char.ToUpperInvariant(k[0]); if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return (byte)c; }
    return 0;
  }

  static void Click(uint down, uint up) { mouse_event(down, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(15); mouse_event(up, 0, 0, 0, UIntPtr.Zero); }

  static void Type(string text) {
    var list = new List<INPUT>();
    foreach (char ch in text) {
      if (ch == '\r') continue;
      if (ch == '\n') { keybd_event(0x0D, 0, 0, UIntPtr.Zero); keybd_event(0x0D, 0, 2, UIntPtr.Zero); continue; }
      var d = new INPUT(); d.type = 1; d.wScan = ch; d.dwFlags = 4;         // KEYEVENTF_UNICODE
      var u = new INPUT(); u.type = 1; u.wScan = ch; u.dwFlags = 4 | 2;     // + KEYUP
      list.Add(d); list.Add(u);
    }
    if (list.Count > 0) SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
  }

  static void Combo(string spec) {
    var vks = new List<byte>();
    foreach (var part in spec.Split('+')) { byte v = Vk(part.Trim()); if (v != 0) vks.Add(v); }
    foreach (var v in vks) keybd_event(v, 0, Extended.Contains(v) ? 1u : 0u, UIntPtr.Zero);
    Thread.Sleep(20);
    for (int i = vks.Count - 1; i >= 0; i--) keybd_event(vks[i], 0, (Extended.Contains(vks[i]) ? 1u : 0u) | 2u, UIntPtr.Zero);
  }

  static void Main() {
    try { SetProcessDPIAware(); } catch { }
    var w = new Thread(WatchMouse); w.IsBackground = true; w.Start();
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      try {
        var p = line.Trim().Split(new[] { ' ' }, 3);
        if (p.Length == 0) continue;
        switch (p[0]) {
          case "rel": { POINT c; GetCursorPos(out c); SetCursorPos(c.X + int.Parse(p[1]), c.Y + int.Parse(p[2])); break; }
          case "abs": {
            double fx = double.Parse(p[1], System.Globalization.CultureInfo.InvariantCulture), fy = double.Parse(p[2], System.Globalization.CultureInfo.InvariantCulture);
            SetCursorPos((int)(fx * GetSystemMetrics(0)), (int)(fy * GetSystemMetrics(1))); break;
          }
          case "click":
            if (p.Length > 1 && p[1] == "r") Click(0x8, 0x10); else if (p.Length > 1 && p[1] == "m") Click(0x20, 0x40); else Click(0x2, 0x4);
            break;
          case "dbl": Click(0x2, 0x4); Thread.Sleep(60); Click(0x2, 0x4); break;
          case "wheel": mouse_event(0x0800, 0, 0, int.Parse(p[1]) * 120, UIntPtr.Zero); break;
          case "text": Type(Encoding.UTF8.GetString(Convert.FromBase64String(p.Length > 1 ? p[1] : ""))); break;
          case "key": if (p.Length > 1) Combo(p[1]); break;
          case "monoff": PostMessage((IntPtr)0xFFFF, 0x0112, (IntPtr)0xF170, (IntPtr)2); break; // WM_SYSCOMMAND, SC_MONITORPOWER, off
          case "monon":
            PostMessage((IntPtr)0xFFFF, 0x0112, (IntPtr)0xF170, (IntPtr)(-1));
            mouse_event(0x1, 0, 1, 0, UIntPtr.Zero); Thread.Sleep(30); mouse_event(0x1, 0, -1, 0, UIntPtr.Zero); // a nudge wakes it for sure
            break;
        }
      } catch { }
    }
  }
}
