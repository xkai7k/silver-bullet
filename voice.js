// Voice commands: records a short phrase, transcribes it on this PC with Whisper
// (downloaded once, then works offline), and hands the text to handleVoice().
(() => {
  const MODELS = { base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
  let transcriber = null, loading = null, busy = false, stopNow = null;

  const ui = $('#voiceUI'), uiText = $('#voiceText'), uiLevel = $('#voiceLevel');
  let hideTimer;
  function show(msg, state = 'listen') {
    clearTimeout(hideTimer);
    ui.hidden = false;
    ui.dataset.state = state;
    uiText.textContent = msg;
  }
  function hideLater(ms = 2200) { hideTimer = setTimeout(() => { ui.hidden = true; uiLevel.style.width = '0'; }, ms); }

  let quiet = false;
  async function load() {
    if (transcriber) return transcriber;
    if (loading) return loading;
    loading = (async () => {
      if (!quiet) show('أجهّز التعرف على الصوت…', 'load');
      const T = await import(LIB);
      T.env.allowLocalModels = false;
      const id = MODELS[(typeof data !== 'undefined' && data.settings?.voiceModel) || 'base'] || MODELS.base;
      const files = {};
      const progress_callback = (p) => {
        if (p.status === 'progress' && p.total) {
          files[p.file] = [p.loaded, p.total];
          const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          if (!quiet) show(`تنزيل نموذج الصوت (مرة وحدة)… ${Math.round((l / t) * 100)}%`, 'load');
        }
      };
      let asr = null;
      if (navigator.gpu) {
        try {
          asr = await T.pipeline('automatic-speech-recognition', id, {
            device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback,
          });
        } catch (e) { pv.log(`voice: webgpu failed, using cpu: ${e?.message || e}`); asr = null; }
      }
      if (!asr) asr = await T.pipeline('automatic-speech-recognition', id, { dtype: 'q8', progress_callback });
      transcriber = asr;
      return asr;
    })();
    try { return await loading; } finally { loading = null; }
  }

  async function record() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const chunks = [];
    let speaking = false, silent = 0, total = 0, done = false, floor = 0.01;
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
    return new Promise((resolve) => {
      const hard = setTimeout(() => { pv.log('voice: mic gave no sound, stopping'); finish(); }, 9000); // never hang if the mic is silent/blocked
      const finish = () => {
        if (done) return; done = true; clearTimeout(hard);
        try { proc.disconnect(); src.disconnect(); } catch {}
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        const len = chunks.reduce((a, c) => a + c.length, 0);
        const audio = new Float32Array(len); let o = 0;
        for (const c of chunks) { audio.set(c, o); o += c.length; }
        resolve({ audio, speaking });
      };
      stopNow = finish;
      proc.onaudioprocess = (e) => {
        const d = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(d);
        let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length);
        const dt = d.length / ctx.sampleRate;
        total += dt;
        if (total < 0.3) floor = Math.max(floor, rms * 1.5); // learn the room noise
        uiLevel.style.width = Math.min(100, rms * 900) + '%';
        if (rms > Math.max(0.013, floor)) { speaking = true; silent = 0; } else if (speaking) silent += dt;
        if ((speaking && silent > 0.9) || total > 7 || (!speaking && total > 5)) finish();
      };
      src.connect(proc); proc.connect(ctx.destination);
    });
  }

  // Akai answers: he may sulk or blush instead of doing it (see akai.js)
  function respond(text) {
    if (window.Akai && !window.Akai.filter(text)) { ui.hidden = true; return; }
    const res = window.handleVoice(text);
    show(res.ok ? `✓ ${res.msg}` : res.msg, res.ok ? 'ok' : 'error');
    if (res.ok) window.Akai?.say(`تم: ${res.msg}`, 'happy'); else window.Akai?.fail(res.msg);
  }
  // nothing may leave Akai stuck: every slow step has a limit
  function withTimeout(p, ms, what) {
    let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout ' + what)), ms); })]).finally(() => clearTimeout(t));
  }
  async function start() {
    if (busy) { stopNow?.(); return; } // second press = stop listening now
    busy = true;
    try {
      const asr = await withTimeout(load(), 120000, 'load');
      show('أسمعك… قل اسم اللي تبغاه', 'listen');
      window.Akai?.listen();
      const { audio, speaking } = await record();
      stopNow = null;
      if (!speaking) { show('ما سمعت شي', 'error'); return; }
      show('لحظة…', 'think');
      const out = await withTimeout(asr(audio, { language: 'arabic', task: 'transcribe' }), 25000, 'asr');
      const text = (Array.isArray(out) ? out[0]?.text : out?.text || '').trim();
      pv.log(`voice: command "${text}"`);
      if (!text) { show('ما فهمت، قلها مرة ثانية', 'error'); return; }
      respond(text);
    } catch (e) {
      console.error(e);
      const m = String(e?.message || e);
      pv.log(`voice: ${e?.stack || m}`);
      show(/^timeout/.test(m) ? 'علّقت شوي، جرّب مرة ثانية' : /Permission|NotAllowed|NotFound/i.test(m) ? 'ما قدرت أوصل للمايك. تأكد إنه موصول ومسموح في إعدادات ويندوز' :
        /fetch|network|Failed to load/i.test(m) ? 'أحتاج إنترنت أول مرة عشان أنزّل نموذج الصوت' : `مشكلة بالصوت: ${m}`, 'error');
    } finally {
      busy = false; stopNow = null;
      hideLater();
    }
  }

  // Download + warm up the model in the background so the first command is instant.
  async function preload() {
    if (transcriber || loading || busy) return;
    quiet = true;
    const t0 = performance.now();
    try {
      const asr = await load();
      await asr(new Float32Array(16000), { language: 'arabic', task: 'transcribe' });
      pv.log(`voice: model ready in ${Math.round((performance.now() - t0) / 1000)}s (${data.settings?.voiceModel || 'base'})`);
      return true;
    } catch (e) {
      pv.log(`voice: preload failed: ${e?.stack || e}`);
      return false;
    } finally { quiet = false; }
  }

  // ---------- Wake word: always listening for one word, then takes the command ----------
  // Cheap when quiet: only short bursts of speech get transcribed, everything stays on this PC.
  let wake = null;
  // Whisper writes "Akai" many ways (اكاي، عكاي، أكايه، كاي، a kai…): accept them all, and the name split in two
  const AKAI = ['اكاي', 'عكاي', 'اكايي', 'اكايه', 'هكاي', 'اكاى', 'اكي', 'اكاي ي', 'ياكاي', 'كاي', 'akai', 'akay', 'acai', 'aki'];
  function wakeMatch(text) {
    const words = normAr(String(text).replace(/a\s+kai/ig, 'akai')).split(' ').filter(Boolean);
    // a name you chose for him (Settings): matched by sound, at the start of the sentence
    const own = normAr(data.settings?.akaiName || '').replace(/\s/g, '');
    if (own && !/^(اكاي|akai)$/i.test(own)) {
      if (words.length >= 3 && new Set(words).size <= Math.ceil(words.length / 3)) return null;
      for (let i = 0; i < Math.min(2, words.length); i++) {
        const w = words[i].replace(/^(يا|و|ف)(?=..)/, '');
        const two = (w + (words[i + 1] || '')).replace(/\s/g, '');
        if (w === own || (own.length >= 3 && phraseScore(w, own) >= 0.82)) return words.slice(i + 1).join(' ');
        if (words[i + 1] && phraseScore(two, own) >= 0.88) return words.slice(i + 2).join(' ');
      }
      return null;
    }
    // the name has to open the sentence (first two words), so normal talking in the room doesn't wake him
    // the same word over and over ("ايه؟ ايه؟ ايه؟…") is the speech model imagining things in the noise
    if (words.length >= 3 && new Set(words).size <= Math.ceil(words.length / 3)) return null;
    for (let i = 0; i < Math.min(2, words.length); i++) {
      const w = words[i].replace(/^(يا|ي|و|ف)(?=[اعه]ك)/, '');
      if (!/[كkc]/i.test(w + (words[i + 1] || ''))) continue; // no "k" sound, not his name ("ايه" isn't "أكاي")
      const two = (w + (words[i + 1] || '')).replace(/\s/g, '');
      const fuzzy = (a) => a.length >= 4 && w.length >= 3 && /[كkc]/i.test(w) && phraseScore(w, a) >= 0.8;
      if (AKAI.some((a) => w === a || fuzzy(a))) return words.slice(i + 1).join(' ');
      if (words[i + 1] && words[i + 1].length <= 2 && AKAI.some((a) => a.length >= 4 && phraseScore(two, a) >= 0.88)) return words.slice(i + 2).join(' ');
    }
    return null;
  }
  // a soft "ding" so you know Akai heard you
  function ding() {
    try {
      const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(880, c.currentTime); o.frequency.setValueAtTime(1320, c.currentTime + 0.08);
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.12 * (data.settings?.dingVol ?? 1)), c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.32); setTimeout(() => c.close(), 500);
    } catch {}
  }
  async function wakeStart() {
    if (wake || !data.settings?.wakeOn) return;
    try {
      const asr = await load();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const src0 = ctx.createMediaStreamSource(stream);
      const boost = ctx.createGain(); boost.gain.value = 1.6; src0.connect(boost);
      const src = boost;
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      let floor = 0.008, seg = [], speaking = false, silent = 0, segLen = 0, pre = [], working = false, pending = null;
      const w = wake = { stop() { try { proc.disconnect(); src.disconnect(); } catch {} stream.getTracks().forEach((t) => t.stop()); ctx.close(); wake = null; } };
      const flush = async () => {
        const len = seg.reduce((a, c) => a + c.length, 0);
        const chunks = seg; seg = []; speaking = false; silent = 0; segLen = 0;
        if (len < 16000 * 0.22 || len > 16000 * 6 || busy) return;
        if (working) { pending = chunks; return; } // finish the last one, then hear this one
        working = true;
        try {
          const audio = new Float32Array(len); let o = 0;
          for (const c of chunks) { audio.set(c, o); o += c.length; }
          const out = await withTimeout(asr(audio, { language: 'arabic', task: 'transcribe' }), 20000, 'wake asr');
          const text = (Array.isArray(out) ? out[0]?.text : out?.text || '').trim();
          if (text && data.settings?.voiceDebug) pv.log(`voice heard: ${text}`);
          if (document.body.classList.contains('playing-video')) return;
          const rest = text && wakeMatch(text);
          if (rest === null || rest === undefined) return;
          // outside the app: only the music (skip, back, pause, volume), and nothing at all while a game is running
          if (!document.hasFocus()) {
            if (await pv.gameRunning?.().catch(() => false)) return;
            const mv = rest && window.musicVoice?.(rest);
            if (mv) { ding(); pv.log(`voice (outside): ${text} → ${mv.msg}`); window.Akai?.say(mv.msg, 'happy'); pv.notify?.(mv.msg); }
            return;
          }
          pv.log(`voice: wake word heard ("${text}")`);
          ding();
          if (rest.replace(/\s/g, '').length >= 2) { respond(rest); hideLater(); }
          else { window.Akai?.listen(); start(); } // even when he sulks he still listens, so he never just goes quiet
        } catch (e) { pv.log('voice: wake failed ' + (e?.message || e)); } finally {
          working = false;
          if (pending) { seg = pending; pending = null; flush(); }
        }
      };
      proc.onaudioprocess = (e) => {
        if (busy) { seg = []; speaking = false; return; } // a command is being taken right now
        const d = new Float32Array(e.inputBuffer.getChannelData(0));
        let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length), dt = d.length / 16000;
        if (!speaking) floor = floor * 0.995 + Math.min(rms, 0.04) * 0.005; // follows the room noise slowly
        const loud = rms > Math.max(0.011, floor * 1.8);
        if (loud) {
          if (!speaking) { speaking = true; seg = pre.slice(); segLen = 0; }
          silent = 0;
        } else if (speaking) silent += dt;
        if (speaking) { seg.push(d); segLen += dt; if (silent > 0.5 || segLen > 6) flush(); }
        pre.push(d); if (pre.length > 6) pre.shift(); // keep the start of the word (~0.75 s)
      };
      src.connect(proc); proc.connect(ctx.destination);
      try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
      // mic unplugged / Windows took it away: start listening again by itself
      stream.getTracks().forEach((t) => t.addEventListener('ended', () => { pv.log('voice: mic ended, restarting wake'); if (wake === w) w.stop(); setTimeout(wakeSync, 2000); }));
      let lastHeard = Date.now(); const watch = setInterval(() => {
        if (wake !== w) return clearInterval(watch);
        if (ctx.state !== 'running' && Date.now() - lastHeard > 5000) { pv.log('voice: wake audio stalled, restarting'); clearInterval(watch); w.stop(); setTimeout(wakeSync, 1000); }
      }, 5000);
      const op = proc.onaudioprocess; proc.onaudioprocess = (e) => { lastHeard = Date.now(); op(e); };
      pv.log('voice: listening for "Akai"');
      return w;
    } catch (e) { pv.log('voice: wake start failed ' + (e?.message || e)); wake = null; }
  }
  function wakeStop() { wake?.stop(); }
  function wakeSync() { if (data.settings?.wakeOn) { if (!wake) wakeStart(); } else wakeStop(); }

  window.Voice = { start, preload, reset() { transcriber = null; }, wakeSync, wakeStop };
  $('#micBtn').onclick = (e) => { e.stopPropagation(); start(); };
  pv.onVoiceStart?.(start);
})();
