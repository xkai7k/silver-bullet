// "تابع معي" (watch with me): friends open a link / scan a code and watch along from anywhere.
// They either see this window live (screen + sound), or play the same thing on their own account in sync (YouTube plays right in their page).
// They can ask you to pause/play or go back a bit; you decide. No chat.
// Connection: WebRTC straight between the two devices; the free PeerJS server only introduces them.
(() => {
  const GUEST_PAGE = 'https://raw.githack.com/xkai7k/silver-bullet/main/docs/watch.html';
  const SIG = 'wss://0.peerjs.com/peerjs?key=peerjs';
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = window.api || {};

  let party = null; // { id, ws, hb, guests: Map, stream, sharing, poll, link, qr }

  const ytId = (u) => { try { const x = new URL(u); if (/youtu\.be$/.test(x.hostname)) return x.pathname.slice(1, 12); if (/youtube\.com$/.test(x.hostname)) return x.searchParams.get('v') || (x.pathname.match(/\/(shorts|live|embed)\/([\w-]{11})/) || [])[2] || null; } catch {} return null; };
  const wv = () => $('#wvHost webview');
  const wcId = () => { try { return wv()?.getWebContentsId(); } catch { return null; } };

  function send(type, dst, payload) { try { party?.ws?.readyState === 1 && party.ws.send(JSON.stringify({ type, dst, payload })); } catch {} }

  function connectSig() {
    const ws = new WebSocket(`${SIG}&id=${party.id}&token=${Math.random().toString(36).slice(2, 12)}&version=1.5.4`);
    party.ws = ws;
    ws.onopen = () => { clearInterval(party.hb); party.hb = setInterval(() => { try { ws.send('{"type":"HEARTBEAT"}'); } catch {} }, 5000); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'OPEN') { party.online = true; api.log?.('party online ' + party.id); drawViewers(); }
      else if (m.type === 'ID-TAKEN') { party.id = newId(); ws.close(); }
      else if (m.type === 'OFFER') onOffer(m.src, m.payload);
      else if (m.type === 'CANDIDATE') { const g = party.guests.get(m.src); if (g && m.payload?.c) { if (g.pc.remoteDescription) g.pc.addIceCandidate(m.payload.c).catch(() => {}); else g.early.push(m.payload.c); } }
      else if (m.type === 'LEAVE' || m.type === 'EXPIRE') dropGuest(m.src);
    };
    ws.onerror = () => api.log?.('party signal error');
    ws.onclose = () => { clearInterval(party?.hb); if (!party) return; party.online = false; drawPanel(); setTimeout(() => party && connectSig(), 3000); };
  }
  const newId = () => 'sb' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

  async function onOffer(src, p) {
    if (!p?.sdp) return;
    dropGuest(src, true);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const g = { id: src, name: String(p.name || 'ضيف').slice(0, 24), pc, dc: null, early: [] };
    party.guests.set(src, g);
    pc.onicecandidate = (e) => e.candidate && send('CANDIDATE', src, { c: e.candidate, connectionId: 'sb' });
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) dropGuest(src); };
    pc.ondatachannel = (e) => {
      g.dc = e.channel;
      g.dc.onopen = () => { toastP(`👀 ${g.name} دخل يتابع معك`); drawViewers(); pushState(); };
      g.dc.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.t === 'req') ask(g, m.what); };
      g.dc.onclose = () => dropGuest(src);
    };
    await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
    for (const c of g.early.splice(0)) pc.addIceCandidate(c).catch(() => {});
    // the friend's page made room for one picture and one sound: fill them with this window (or leave empty until you share)
    for (const t of pc.getTransceivers()) {
      t.direction = 'sendonly';
      const kind = t.receiver.track?.kind;
      const tr = party.stream?.getTracks().find((x) => x.kind === kind);
      if (tr) await t.sender.replaceTrack(tr).catch(() => {});
    }
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    send('ANSWER', src, { sdp: ans.sdp, connectionId: 'sb' });
  }
  function dropGuest(id, quiet) {
    const g = party?.guests.get(id); if (!g) return;
    party.guests.delete(id);
    try { g.pc.close(); } catch {}
    if (!quiet && g.dc) toastP(`${g.name} طلع`);
    drawViewers();
  }

  async function shareScreen(on) {
    if (!party) return;
    if (on && !party.stream) {
      try { party.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }); }
      catch (e) { toastP('ما قدرت أشارك الشاشة: ' + e.message); party.sharing = false; drawPanel(); return; }
      party.stream.getVideoTracks()[0]?.addEventListener('ended', () => shareScreen(false));
    }
    if (!on && party.stream) { party.stream.getTracks().forEach((t) => t.stop()); party.stream = null; }
    party.sharing = !!on;
    for (const g of party.guests.values()) for (const t of g.pc.getTransceivers()) {
      const kind = t.receiver.track?.kind;
      t.sender.replaceTrack(party.stream?.getTracks().find((x) => x.kind === kind) || null).catch(() => {});
    }
    drawPanel(); pushState();
  }

  async function pushState() {
    if (!party) return;
    const id = wcId();
    const st = id ? await api.videoState?.(id).catch(() => null) : null;
    const url = (() => { try { return wv()?.getURL(); } catch { return ''; } })() || '';
    const title = ($('#webWrap')?.hidden ? '' : $('#wvTitle')?.textContent) || '';
    const msg = JSON.stringify({ t: 'state', title, url, yt: ytId(url), time: st?.t || 0, dur: st?.d || 0, playing: !!st?.playing, at: Date.now(), sharing: !!party.sharing, viewers: [...party.guests.values()].filter((g) => g.dc?.readyState === 'open').map((g) => g.name) });
    for (const g of party.guests.values()) if (g.dc?.readyState === 'open') { try { g.dc.send(msg); } catch {} }
  }

  // ---- requests: they ask, you decide ----
  const WHAT = { toggle: '⏯ يطلب إيقاف / تشغيل', back: '⏪ يطلب ترجّع شوي' };
  function ask(g, what) {
    if (!WHAT[what]) return;
    const box = $('#partyReqs');
    const card = document.createElement('div');
    card.className = 'party-req';
    card.innerHTML = `<b>${esc(g.name)}</b><span>${WHAT[what]}</span><button class="btn small ok">سوّها</button><button class="btn ghost small no">تجاهل</button>`;
    const bye = () => { card.classList.add('out'); setTimeout(() => card.remove(), 250); };
    card.querySelector('.ok').onclick = async () => { bye(); const id = wcId(); if (id) await api.videoCtl?.(id, what, 10); setTimeout(pushState, 300); };
    card.querySelector('.no').onclick = bye;
    box.appendChild(card);
    setTimeout(bye, 20000);
  }

  // ---- your side: the panel and the "watching with you" strip ----
  function toastP(m) { try { window.toast ? window.toast(m) : null; } catch {} const t = $('#toast'); if (t && !window.toast) { t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); } }
  function drawViewers() {
    const bar = $('#partyBar'); if (!bar) return;
    const names = party ? [...party.guests.values()].filter((g) => g.dc?.readyState === 'open').map((g) => g.name) : [];
    bar.hidden = !party;
    bar.innerHTML = party ? `<span class="pb-dot ${party.online ? 'on' : ''}"></span>${names.length ? `👀 يتابع معك: <b>${names.map(esc).join('، ')}</b>` : 'تابع معي شغّال… محد دخل للحين'}${party.sharing ? '<span class="pb-live">🔴 شاشتك ظاهرة لهم</span>' : ''}` : '';
    bar.onclick = () => openPanel();
    drawPanel();
  }
  function drawPanel() {
    const p = $('#partyPanel'); if (!p || !party) return;
    const names = [...party.guests.values()].filter((g) => g.dc?.readyState === 'open').map((g) => g.name);
    p.innerHTML = `
      <div class="pp-head"><b>👥 تابع معي</b><button class="btn ghost icon pp-x" title="سكّر">✕</button></div>
      <div class="pp-qr">${party.qr || ''}</div>
      <div class="pp-link"><input readonly value="${esc(party.link)}"><button class="btn small pp-copy">نسخ</button></div>
      <p class="pp-sub">${party.online ? 'جاهز: أرسل الرابط أو خلهم يصوّرون الباركود. يشتغل من أي مكان.' : 'يتصل… <span class="dots"></span>'}</p>
      <label class="pp-row"><input type="checkbox" class="pp-share" ${party.sharing ? 'checked' : ''}> 📺 شارك شاشتي (الصورة والصوت)</label>
      <p class="pp-hint">${party.sharing ? 'يشوفون شاشة البرنامج نفسها مع الصوت.' : 'بدون مشاركة: يشوفون وش تتابع ووين وصلت، ويشغلونه على حسابهم متزامن معك (يوتيوب يشتغل عندهم مباشرة).'}</p>
      <div class="pp-who">${names.length ? names.map((n) => `<span>👤 ${esc(n)}</span>`).join('') : '<i>محد دخل للحين</i>'}</div>
      <button class="btn ghost pp-stop">⏹ إنهاء المتابعة</button>`;
    p.querySelector('.pp-x').onclick = () => p.remove();
    p.querySelector('.pp-copy').onclick = () => { navigator.clipboard.writeText(party.link).then(() => toastP('نسخت الرابط')); };
    p.querySelector('.pp-share').onchange = (e) => shareScreen(e.target.checked);
    p.querySelector('.pp-stop').onclick = () => { stop(); p.remove(); };
  }
  function openPanel() {
    let p = $('#partyPanel');
    if (p) { p.remove(); return; }
    p = document.createElement('div'); p.id = 'partyPanel';
    $('#webWrap').appendChild(p);
    drawPanel();
  }

  async function start() {
    if (party) return openPanel();
    party = { id: newId(), guests: new Map(), sharing: false, online: false };
    party.link = `${GUEST_PAGE}?r=${party.id}`;
    party.qr = await api.qrSvg?.(party.link).catch(() => '') || '';
    connectSig();
    party.poll = setInterval(pushState, 1500);
    drawViewers(); openPanel();
  }
  function stop() {
    if (!party) return;
    const p = party; party = null;
    clearInterval(p.poll); clearInterval(p.hb);
    for (const g of p.guests.values()) { try { g.dc?.send(JSON.stringify({ t: 'end' })); } catch {} try { g.pc.close(); } catch {} }
    p.stream?.getTracks().forEach((t) => t.stop());
    try { p.ws.onclose = null; p.ws.close(); } catch {}
    drawViewers(); $('#partyPanel')?.remove(); $('#partyReqs').innerHTML = '';
  }

  const btn = $('#wvParty'); if (btn) btn.onclick = start;
  // leaving the watch screen ends it
  $('#wvClose')?.addEventListener('click', () => stop());
  window.Party = { start, stop, get on() { return !!party; } };
})();
