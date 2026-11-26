// Silver Bullet "start from the phone": a tiny program that starts with Windows (only if you turned the phone link on).
// While Silver Bullet is closed it answers the phone link on the same address with one page: "the app is closed — ▶ start it".
// Pressing it starts Silver Bullet. While Silver Bullet is open it just waits (it only checks every few seconds).
// Usage: sbwake.exe <key> <port> <program> [arguments...]
using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

class SbWake {
  static string key, prog, progArgs = "";
  static int port;
  static void Main(string[] a) {
    if (a.Length < 3) return;
    key = a[0]; port = int.Parse(a[1]); prog = a[2];
    for (int i = 3; i < a.Length; i++) progArgs += (i > 3 ? " " : "") + "\"" + a[i] + "\"";
    bool created; var one = new Mutex(true, "SilverBulletWake", out created);
    if (!created) return; // already running
    while (true) {
      TcpListener l = null;
      try { l = new TcpListener(IPAddress.Any, port); l.Start(); }
      catch { l = null; } // the app has the address: it's open, nothing to do
      if (l == null) { Thread.Sleep(6000); continue; }
      bool release = false;
      while (!release) {
        TcpClient c = null;
        try {
          if (!l.Pending()) { Thread.Sleep(200); continue; }
          c = l.AcceptTcpClient(); c.ReceiveTimeout = 3000;
          var s = c.GetStream(); var buf = new byte[4096]; int n = s.Read(buf, 0, buf.Length);
          string req = Encoding.UTF8.GetString(buf, 0, Math.Max(0, n));
          string line = req.Split('\n')[0];
          bool ok = line.Contains("k=" + key);
          string path = line.Split(' ').Length > 1 ? line.Split(' ')[1] : "/";
          if (ok && path.StartsWith("/release")) { Reply(s, 200, "text/plain", "ok"); release = true; }
          else if (ok && path.StartsWith("/start")) {
            Reply(s, 200, "text/html; charset=utf-8", Page(true)); release = true;
            try { var p = new ProcessStartInfo(prog, progArgs); p.UseShellExecute = true; p.WorkingDirectory = System.IO.Path.GetDirectoryName(prog); Process.Start(p); } catch { }
          }
          else if (ok && path.StartsWith("/api/")) Reply(s, 503, "application/json", "{\"ok\":false,\"closed\":true}");
          else if (ok) Reply(s, 200, "text/html; charset=utf-8", Page(false));
          else Reply(s, 403, "text/plain; charset=utf-8", "old link");
        } catch { }
        finally { try { if (c != null) c.Close(); } catch { } }
      }
      try { l.Stop(); } catch { }
      Thread.Sleep(45000); // give the app time to start and take the address
    }
  }
  static void Reply(NetworkStream s, int code, string type, string body) {
    var b = Encoding.UTF8.GetBytes(body);
    var h = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " OK\r\nContent-Type: " + type + "\r\nContent-Length: " + b.Length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
    s.Write(h, 0, h.Length); s.Write(b, 0, b.Length); s.Flush();
  }
  static string Page(bool starting) {
    return "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Silver Bullet</title>"
      + "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f14;color:#eef1f6;font-family:-apple-system,system-ui,Tahoma,sans-serif;text-align:center}"
      + "a{display:inline-block;margin-top:18px;padding:18px 34px;border-radius:18px;background:#e8c26a;color:#1a1408;font-weight:800;font-size:20px;text-decoration:none}p{color:#a7afbd}</style></head><body><div>"
      + (starting
        ? "<h1>⏳ يشتغل…</h1><p>أعطه ثواني، والصفحة ترجع لحالها</p><p dir=\"ltr\">Starting… this page comes back by itself</p><script>setTimeout(function(){location.href='/?k=" + key + "'},15000)</script>"
        : "<h1>🎮 Silver Bullet مقفل</h1><p>البرنامج مو شغّال على الكمبيوتر</p><a href=\"/start?k=" + key + "\">▶ شغّله</a><p dir=\"ltr\">The app is closed on the PC — tap to start it</p>")
      + "</div></body></html>";
  }
}
