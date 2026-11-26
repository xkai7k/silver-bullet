// Voice commands: records a short phrase, transcribes it on this PC with Whisper
// (downloaded once, then works offline), and hands the text to handleVoice().
(() => {
  const MODELS = { tiny: 'onnx-community/whisper-tiny', base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };
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
  // Two listeners, one job each:
  //  · the ear (wake word): small Whisper "base" on the processor, in a side thread. It never touches the graphics card,
  //    so it can't freeze with a game running, and it can't take frames from the game.
  //  · the brain (your command): the model you picked in Settings ("small" = on the graphics card when there is one),
  //    loaded when needed and let go after a few quiet minutes so it doesn't sit in memory.
  // Each model lives in its own side thread (a Web Worker): the screen never freezes while it thinks,
  // and a model that hangs is simply thrown away (the thread is ended) and started fresh.
  const WORKER_SRC = `
    import { pipeline, env } from '${LIB}';
    env.allowLocalModels = false;
    try { env.backends.onnx.wasm.wasmPaths = '${LIB}/dist/'; env.backends.onnx.wasm.numThreads = 1; } catch (e) {}
    let asr = null;
    self.onmessage = async (e) => {
      const { id, op } = e.data;
      try {
        if (op === 'load') {
          asr = await pipeline('automatic-speech-recognition', e.data.model, { device: e.data.device, dtype: e.data.dtype, progress_callback: (p) => { if (p.status === 'progress') self.postMessage({ id, progress: [p.file, p.loaded, p.total] }); } });
          self.postMessage({ id, ok: true });
        } else if (op === 'run') {
          const out = await asr(e.data.audio, e.data.opts);
          self.postMessage({ id, ok: true, text: ((Array.isArray(out) ? out[0]?.text : out?.text) || '').trim() });
        }
      } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
    };`;
  let workerUrl = null;
  function makeModel(name, model, device, dtype) {
    workerUrl ||= URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const w = new Worker(workerUrl, { type: 'module' });
    let seq = 0; const waits = new Map(); let broken = false, running = false;
    w.onmessage = (e) => { const r = waits.get(e.data.id); if (!r) return; if (e.data.progress) { r.progress?.(e.data.progress); return; } waits.delete(e.data.id); e.data.error ? r.rej(new Error(e.data.error)) : r.res(e.data); };
    w.onerror = (e) => { pv.log(`voice: ${name} thread error ${e.message || ''}`); broken = true; for (const r of waits.values()) r.rej(new Error('thread error')); waits.clear(); };
    const call = (msg, ms, progress, transfer) => new Promise((res, rej) => {
      const id = ++seq; waits.set(id, { res, rej, progress });
      w.postMessage({ ...msg, id }, transfer || []);
      if (ms) setTimeout(() => { if (waits.has(id)) { waits.delete(id); rej(new Error('timeout ' + name)); } }, ms);
    });
    const files = {};
    const m = {
      name,
      ready: call({ op: 'load', model, device, dtype }, 10 * 60 * 1000, ([f, l, t]) => {
        if (!t) return; files[f] = [l, t];
        const [L, Tt] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
        if (!quiet) show(`تنزيل نموذج الصوت (مرة وحدة)… ${Math.round((L / Tt) * 100)}%`, 'load');
      }),
      busy: () => running,
      get broken() { return broken; },
      async run(audio, opts, ms = 20000) {
        await m.ready;
        if (broken) throw new Error('broken ' + name);
        running = true;
        try { const r = await call({ op: 'run', audio, opts }, ms, null, [audio.buffer]); return r.text; }
        catch (e) { if (/timeout|thread/.test(e.message)) { pv.log(`voice: ${name} hung (${e.message}), starting it fresh`); broken = true; w.terminate(); } throw e; }
        finally { running = false; }
      },
      dispose() { broken = true; try { w.terminate(); } catch {} },
    };
    return m;
  }
  let ear = null;
  async function loadEar() {
    if (ear && !ear.broken) { await ear.ready; return ear; }
    // the ear only has to catch his name (and music words): the small 'base' model; on PCs with little memory the tiny one
    const ram = (typeof data !== 'undefined' && data.device?.ramGB) || 16;
    ear = makeModel('ear', ram <= 8 ? MODELS.tiny : MODELS.base, 'wasm', 'q8');
    try { await ear.ready; pv.log('voice: ear ready (processor, side thread)'); } catch (e) { pv.log('voice: ear failed ' + e.message); ear = null; throw e; }
    return ear;
  }
  let gpuBroke = false, idleTimer = null;
  async function load() {
    const want = (typeof data !== 'undefined' && data.settings?.voiceModel) || 'base';
    // "base" (or a graphics card that hung before): the ear does the commands too, one model in memory
    if (want === 'base' || !navigator.gpu || gpuBroke) return loadEar();
    clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (transcriber && !busy) { transcriber.dispose(); transcriber = null; pv.log('voice: big model let go (idle)'); } }, 4 * 60 * 1000);
    if (transcriber && !transcriber.broken) { await transcriber.ready; return transcriber; }
    if (!quiet) show('أجهّز التعرف على الصوت…', 'load');
    const m = makeModel('brain', MODELS[want] || MODELS.small, 'webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' });
    transcriber = m;
    try { await m.ready; return m; }
    catch (e) { pv.log(`voice: graphics card model failed (${e.message}), the ear takes commands`); m.dispose(); transcriber = null; gpuBroke = true; return loadEar(); }
  }
  // what the old code called "asr(audio, opts)": run on whichever model, and if the brain hangs, the ear finishes the job
  async function transcribe(model, audio, opts, ms) {
    try { return await model.run(audio, opts, ms); }
    catch (e) {
      if (model.name === 'brain' && /hung|broken|timeout/.test(e.message)) { gpuBroke = true; transcriber = null; const ea = await loadEar(); return ea.run(audio, opts, ms); }
      throw e;
    }
  }

  async function record() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src0 = ctx.createMediaStreamSource(stream);
    const src = ctx.createGain(); src.gain.value = 1.6; src0.connect(src); // same lift as the wake listener: quiet mics are heard
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const chunks = [];
    let speaking = false, silent = 0, total = 0, done = false, floor = 0.008;
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch {}
    return new Promise((resolve) => {
      const hard = setTimeout(() => { pv.log('voice: mic gave no sound, stopping'); finish(); }, 14000); // never hang if the mic is silent/blocked
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
        if (total < 0.3) floor = Math.min(0.02, Math.max(floor, rms * 1.3)); // learn the room noise (capped: if you start talking right away, your voice isn't taken for noise)
        uiLevel.style.width = Math.min(100, rms * 900) + '%';
        if (rms > Math.max(0.009, floor)) { speaking = true; silent = 0; } else if (speaking) silent += dt;
        if ((speaking && silent > 0.9) || (speaking && total > 9) || (!speaking && total > 12)) finish();
      };
      src.connect(proc); proc.connect(ctx.destination);
    });
  }

  // Akai answers: he may sulk or blush instead of doing it (see akai.js)
  function respond(text) {
    if (window.Akai && !window.Akai.filter(text)) { ui.hidden = true; return { ok: true }; }
    const res = window.handleVoice(text);
    show(res.ok ? `✓ ${res.msg}` : res.msg, res.ok ? 'ok' : 'error');
    if (res.ok) window.Akai?.say(`تم: ${res.msg}`, 'happy'); else window.Akai?.fail(res.msg);
    return res;
  }
  // nothing may leave Akai stuck: every slow step has a limit
  function withTimeout(p, ms, what) {
    let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout ' + what)), ms); })]).finally(() => clearTimeout(t));
  }
  // "خلاص" / "قفل" / "سكر" / "بس" / "انسى": stop listening
  const STOP = /^(خلاص|قفل|سكر|اسكت|بس|انسى|لا شي|لاشي|ولا شي|مافي شي|cancel|stop)\b/;
  async function start() {
    if (busy) { stopNow?.(); return; } // second press = stop listening now
    busy = true;
    const t0 = Date.now();
    try {
      const asr = await withTimeout(load(), 120000, 'load');
      // keep listening until something is understood, or you say "خلاص", or about 40 seconds of nothing
      for (let round = 0; round < 6 && Date.now() - t0 < 45000; round++) {
        show(round ? 'ما فهمت… قلها مرة ثانية (أو قل خلاص)' : 'أسمعك… قل اسم اللي تبغاه', 'listen');
        window.Akai?.listen();
        const { audio, speaking } = await record();
        stopNow = null;
        if (!speaking) { if (Date.now() - t0 < 30000) continue; show('ما سمعت شي', 'error'); return; }
        show('لحظة…', 'think');
        const text = await transcribe(asr, audio, { language: 'arabic', task: 'transcribe' }, 25000);
        pv.log(`voice: command "${text}"`);
        if (!text) continue;
        if (STOP.test(normAr(text))) { show('تمام 👍', 'ok'); window.Akai?.say('تمام', 'happy'); return; }
        const res = respond(text);
        if (res?.ok !== false) return;
      }
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
    if (busy) return;
    quiet = true;
    const t0 = performance.now();
    try {
      const e = await loadEar();
      await e.run(new Float32Array(16000), { language: 'arabic', task: 'transcribe' }, 60000);
      pv.log(`voice: ear ready in ${Math.round((performance.now() - t0) / 1000)}s (commands: ${data.settings?.voiceModel || 'base'})`);
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
  const AKAI = ['اكاي', 'عكاي', 'اكايي', 'اكايه', 'هكاي', 'اكاى', 'اكي', 'اكاي ي', 'ياكاي', 'كاي', 'اكايا', 'اكايه', 'يكاي', 'عكايه', 'اكاه', 'كاى', 'الكاي', 'اكيه', 'akai', 'akay', 'acai', 'aki', 'akkai', 'akaay'];
  function wakeMatch(text) {
    const words = normAr(String(text).replace(/a\s+kai/ig, 'akai')).split(' ').filter(Boolean);
    // a name you chose for him (Settings): matched by sound, at the start of the sentence
    const own = normAr(data.settings?.akaiName || '').replace(/\s/g, '');
    if (own && !/^(اكاي|akai)$/i.test(own)) {
      if (words.length >= 3 && new Set(words).size <= Math.ceil(words.length / 3)) return null;
      // your name for him can be one word or two ("أبو فهد", "كابتن ماجد"): try one, two and three words at the start
      for (let i = 0; i < Math.min(2, words.length); i++) {
        const first = words[i].replace(/^(يا|و|ف)(?=..)/, '');
        for (let n = 1; n <= 3 && i + n <= words.length; n++) {
          const joined = [first, ...words.slice(i + 1, i + n)].join('');
          const need = own.length <= 3 ? 1 : n === 1 ? 0.8 : 0.78;
          if (joined === own || (own.length >= 3 && phraseScore(joined, own) >= need)) return words.slice(i + n).join(' ');
        }
      }
      // "أكاي" still works too
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
      await loadEar();
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
          const audio = new Float32Array(Math.max(len, 16000)); let o = 0; // at least 1 s (the rest silence): very short sounds trip the graphics card
          for (const c of chunks) { audio.set(c, o); o += c.length; }
          if (window.SB_PAUSED?.() === 'deep') return; // the app is resting (you held Esc to wake it)
          const m = (ear && !ear.broken) ? ear : await loadEar(); // the ear: processor only, so a running game keeps its graphics card
          if (m.busy?.()) return; // still on the last sound: skip this one instead of piling up
          let text;
          try { text = await m.run(audio, { language: 'arabic', task: 'transcribe' }, 15000); }
          catch (e) { if (/WebGPU|zero-sized/i.test(String(e?.message || e))) { pv.log('voice: gpu hiccup, skipped one sound'); return; } throw e; }
          if (text && data.settings?.voiceDebug) pv.log(`voice heard: ${text}`);
          if (document.body.classList.contains('playing-video')) return;
          const rest = text && wakeMatch(text);
          if (rest === null || rest === undefined) return;
          // outside the app (a game, or anything else in front): only the music — skip, back, pause, volume
          if (!document.hasFocus()) {
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
        const loud = rms > Math.max(0.009, floor * 1.6); // a bit more sensitive: quieter voices and mics farther away
        if (loud) {
          if (!speaking) { speaking = true; seg = pre.slice(); segLen = 0; }
          silent = 0;
        } else if (speaking) silent += dt;
        if (speaking) { seg.push(d); segLen += dt; if (silent > 0.65 || segLen > 6) flush(); } // a short breath after his name doesn't cut you off
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

  // you're away from the PC: stop listening and let the ear go (its side thread, the mic and Chromium's sound
  // services behind it). Coming back starts it again in a few seconds.
  function sleep() {
    wakeStop();
    if (!busy) { try { ear?.dispose(); } catch {} ear = null; try { transcriber?.dispose?.(); } catch {} transcriber = null; }
    pv.log('voice: asleep while you are away (ear and mic let go)');
  }
  window.Voice = { sleep, start, preload, reset() { transcriber?.dispose?.(); transcriber = null; gpuBroke = false; ear?.dispose(); ear = null; }, release() { if (!busy && transcriber) { transcriber.dispose(); transcriber = null; pv.log('voice: big model let go (rest)'); } }, wakeSync, wakeStop };
  $('#micBtn').onclick = (e) => { e.stopPropagation(); start(); };
  pv.onVoiceStart?.(start);
})();
