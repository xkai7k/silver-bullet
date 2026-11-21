// Background music: an original, endlessly varying instrumental generated live for each mood
// (no songs, no vocals), or a music file the user picks. Shown as a spinning disc on the right.
(() => {
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10],
  };
  // Each mood: tempo, key, scale, chord degrees, and which instruments play what.
  const MOODS = {
    glass: { name: 'أجواء زجاجية', bpm: 70, root: 50, scale: 'major', prog: [0, 5, 3, 4], bars: 2, rev: 0.55,
      pad: { wave: 'sawtooth', gain: 0.05, cutoff: 900, attack: 2.5, voices: 3 }, bell: { prob: 0.12, gain: 0.05, oct: 2 }, bass: { wave: 'sine', gain: 0.09, pat: 'R...............' } },
    aero: { name: 'فقاعات صباحية', bpm: 96, root: 55, scale: 'major', prog: [0, 3, 4, 0], bars: 1, rev: 0.45,
      pad: { wave: 'triangle', gain: 0.05, cutoff: 2400, attack: 0.6 }, arp: { wave: 'sine', gain: 0.06, pat: [0, 2, 1, 3, 2, 1, 3, 2], rate: 8, oct: 1, decay: 0.5 },
      bell: { prob: 0.1, gain: 0.04, oct: 2 }, bass: { wave: 'sine', gain: 0.09, pat: 'R.......5.......' } },
    wood: { name: 'خشب وقهوة', bpm: 84, root: 50, scale: 'major', prog: [0, 4, 5, 3], bars: 1, rev: 0.35, swing: 0.12,
      arp: { wave: 'triangle', gain: 0.075, pat: [0, 1, 2, 1, 3, 1, 2, 1], rate: 8, oct: 0, decay: 0.7, cutoff: 1800 },
      bass: { wave: 'triangle', gain: 0.11, pat: 'R.......5.......' }, pad: { wave: 'sine', gain: 0.03, cutoff: 800, attack: 1 } },
    jazz: { name: 'سهرة جاز', bpm: 112, root: 50, scale: 'dorian', prog: [1, 4, 0, 5], bars: 1, rev: 0.4, swing: 0.28, sevenths: true,
      bass: { wave: 'triangle', gain: 0.13, pat: 'R...3...5...6...', cutoff: 900 }, comp: { wave: 'sine', gain: 0.045, pat: '..x.....x..x....', decay: 0.35, trem: true },
      mel: { wave: 'sine', gain: 0.05, prob: 0.22, oct: 1, decay: 0.4 }, drums: { hat: 'x..xx..xx..xx..x', hatGain: 0.025, brush: true } },
    neon: { name: 'نيون الليل', bpm: 104, root: 45, scale: 'minor', prog: [0, 5, 2, 6], bars: 1, rev: 0.35, delay: 0.3,
      pad: { wave: 'sawtooth', gain: 0.035, cutoff: 1200, attack: 0.8, voices: 2 }, arp: { wave: 'square', gain: 0.03, pat: [0, 1, 2, 3, 2, 1], rate: 16, oct: 1, decay: 0.18, cutoff: 2200 },
      bass: { wave: 'sawtooth', gain: 0.07, pat: 'R.R.R.R.R.R.R.R.', cutoff: 500 }, drums: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', kickGain: 0.25, hatGain: 0.02 } },
    calm: { name: 'هدوء', bpm: 64, root: 53, scale: 'major', prog: [0, 3, 5, 4], bars: 2, rev: 0.6,
      pad: { wave: 'sine', gain: 0.06, cutoff: 1400, attack: 3 }, bell: { prob: 0.08, gain: 0.05, oct: 2 }, mel: { wave: 'sine', gain: 0.035, prob: 0.06, oct: 1, decay: 1.6 } },
    classic: { name: 'شاشة قديمة', bpm: 90, root: 48, scale: 'major', prog: [0, 5, 3, 4], bars: 1, rev: 0.2,
      arp: { wave: 'square', gain: 0.025, pat: [0, 1, 2, 1], rate: 8, oct: 1, decay: 0.2, cutoff: 1600 }, bass: { wave: 'triangle', gain: 0.09, pat: 'R...R...5...5...' } },
    cyber: { name: 'شوارع سايبر', bpm: 100, root: 45, scale: 'phrygian', prog: [0, 0, 6, 5], bars: 1, rev: 0.3, delay: 0.35,
      bass: { wave: 'sawtooth', gain: 0.08, pat: 'RRRRRRRRRRRRRRRR', cutoff: 420, decay: 0.12 }, arp: { wave: 'sawtooth', gain: 0.028, pat: [0, 2, 1, 3, 0, 2, 3, 1], rate: 16, oct: 1, decay: 0.12, cutoff: 1600 },
      pad: { wave: 'sawtooth', gain: 0.03, cutoff: 700, attack: 1.5, voices: 2 }, drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', kickGain: 0.3, snareGain: 0.06, hatGain: 0.015 } },
    miami: { name: 'غروب ميامي', bpm: 92, root: 54, scale: 'minor', prog: [5, 3, 0, 4], bars: 1, rev: 0.55, delay: 0.25,
      pad: { wave: 'sawtooth', gain: 0.04, cutoff: 1600, attack: 0.4, voices: 3, gate: true }, bass: { wave: 'sawtooth', gain: 0.07, pat: 'R.R.R.R.R.R.R.R.', cutoff: 600, oct: -1 },
      mel: { wave: 'square', gain: 0.03, prob: 0.18, oct: 1, decay: 0.5, cutoff: 2000 }, drums: { kick: 'x...x...x...x...', snare: '....x.......x...', kickGain: 0.28, snareGain: 0.09 } },
    farm: { name: 'صباح المزرعة', bpm: 118, root: 55, scale: 'major', prog: [0, 3, 0, 4], bars: 1, rev: 0.25, swing: 0.1,
      arp: { wave: 'triangle', gain: 0.07, pat: [0, 2, 1, 2], rate: 8, oct: 1, decay: 0.3 }, mel: { wave: 'square', gain: 0.025, prob: 0.3, oct: 1, decay: 0.25, cutoff: 2500, penta: true },
      bass: { wave: 'triangle', gain: 0.1, pat: 'R...5...R...5...' }, drums: { hat: '..x...x...x...x.', hatGain: 0.012 } },
    blocks: { name: 'مكعبات هادئة', bpm: 60, root: 52, scale: 'major', prog: [0, 3, 5, 4], bars: 2, rev: 0.7, sevenths: true,
      piano: { gain: 0.07, prob: 0.16, oct: 1 }, pad: { wave: 'sine', gain: 0.025, cutoff: 900, attack: 3 } },
    arcade: { name: 'أركيد', bpm: 140, root: 48, scale: 'minor', prog: [0, 5, 6, 4], bars: 1, rev: 0.12,
      arp: { wave: 'square', gain: 0.03, pat: [0, 1, 2, 3, 2, 1, 0, 1], rate: 16, oct: 1, decay: 0.08 }, bass: { wave: 'triangle', gain: 0.1, pat: 'R.R.5.5.R.R.6.5.' },
      mel: { wave: 'square', gain: 0.025, prob: 0.35, oct: 2, decay: 0.12 }, drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', kickGain: 0.22, snareGain: 0.05, hatGain: 0.015, chip: true } },
    souls: { name: 'رماد ونار', bpm: 50, root: 38, scale: 'minor', prog: [0, 5, 3, 4], bars: 2, rev: 0.8,
      pad: { wave: 'sawtooth', gain: 0.045, cutoff: 600, attack: 4, voices: 4, choir: true }, bass: { wave: 'sine', gain: 0.12, pat: 'R...............', oct: -1 },
      bell: { prob: 0.05, gain: 0.06, oct: 0 } },
    pirate: { name: 'بحر وأشرعة', bpm: 116, root: 50, scale: 'dorian', prog: [0, 6, 5, 4], bars: 1, rev: 0.4, swing: 0.15,
      arp: { wave: 'triangle', gain: 0.07, pat: [0, 2, 1, 2, 0, 2, 3, 2], rate: 8, oct: 0, decay: 0.35, cutoff: 2200 },
      mel: { wave: 'square', gain: 0.022, prob: 0.3, oct: 1, decay: 0.3, cutoff: 1800 }, bass: { wave: 'triangle', gain: 0.11, pat: 'R...5...R...5...' },
      drums: { kick: 'x.....x.x.......', hat: '..x...x...x...x.', kickGain: 0.18, hatGain: 0.015 } },
    najdi: { name: 'سمرة نجدية', bpm: 88, root: 50, scale: 'phrygian', prog: [0, 1, 0, 6], bars: 2, rev: 0.45,
      arp: { wave: 'triangle', gain: 0.07, pat: [0, 1, 2, 1, 0, 1, 3, 1], rate: 8, oct: 0, decay: 0.45, cutoff: 1600 },
      mel: { wave: 'sine', gain: 0.05, prob: 0.25, oct: 1, decay: 0.6 }, bass: { wave: 'sine', gain: 0.1, pat: 'R..R..R.R..R..R.' },
      drums: { kick: 'x..x..x.x..x....', hat: '...x.....x...x..', kickGain: 0.22, hatGain: 0.02, brush: true } },
    vintage: { name: 'غرفة قديمة', bpm: 72, root: 48, scale: 'minor', prog: [0, 5, 3, 4], bars: 2, rev: 0.5, swing: 0.2, sevenths: true,
      piano: { gain: 0.07, prob: 0.2, oct: 0 }, bass: { wave: 'triangle', gain: 0.1, pat: 'R.......5.......', cutoff: 700 },
      drums: { hat: 'x..x..x.x..x..x.', hatGain: 0.012, brush: true } },
  };

  // Loudness trims measured so every mood plays at about the same level.
  const TRIM = { pirate: 1.3, najdi: 1.4, vintage: 1.5, glass: 1.5, aero: 1.02, wood: 1.33, jazz: 1.84, neon: 1.15, calm: 0.69, classic: 3.6, cyber: 1.15, miami: 1.32, farm: 2.5, blocks: 1.6, arcade: 1.07, souls: 1.66 };
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let ctx = null, master = null, reverb = null, delay = null, delayFb = null, noiseBuf = null;
  let session = null;       // what's playing now
  let wanted = null;        // { kind: 'mood'|'file', id, label }
  let playing = false;

  function ensureCtx() {
    if (ctx) return ctx;
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = volume();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    // Reverb from generated noise
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    reverb.buffer = ir;
    reverb.connect(master);
    delay = ctx.createDelay(1.5); delayFb = ctx.createGain(); delayFb.gain.value = 0.35;
    delay.connect(delayFb).connect(delay); delay.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const volume = () => (typeof data !== 'undefined' && data.music?.volume) ?? 0.4;

  // ---------- instruments ----------
  function voice(out, t, freq, dur, o) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.cutoff || 3000; f.Q.value = o.q || 0.7;
    const n = o.voices || 1, oscs = [];
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.wave || 'sine';
      osc.frequency.value = freq;
      osc.detune.value = n > 1 ? (i - (n - 1) / 2) * (o.choir ? 14 : 9) : 0;
      osc.connect(f); oscs.push(osc);
    }
    f.connect(g); g.connect(out);
    const a = o.attack ?? 0.01, peak = (o.gain || 0.05) / Math.sqrt(n), rel = o.release ?? Math.min(1.5, dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (o.decay) g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.decay);
    else { g.gain.setValueAtTime(peak, t + Math.max(a, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel); }
    if (o.trem) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5; lg.gain.value = peak * 0.4; l.connect(lg).connect(g.gain); l.start(t); l.stop(t + dur + rel + 0.1); }
    const end = t + (o.decay ? a + o.decay : Math.max(a, dur) + rel) + 0.05;
    oscs.forEach((osc) => { osc.start(t); osc.stop(end); });
  }
  function noise(out, t, dur, gain, type, freq) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(out, t, gain, chip) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = chip ? 'square' : 'sine';
    o.frequency.setValueAtTime(chip ? 120 : 140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
  }
  function bell(out, t, freq, gain) {
    [1, 2.76, 5.4].forEach((m, i) => voice(out, t, freq * m, 0.1, { wave: 'sine', gain: gain / (i + 1.5), attack: 0.005, decay: 2.2 / (i + 1) }));
  }
  function piano(out, t, freq, gain) {
    voice(out, t, freq, 0.1, { wave: 'triangle', gain, attack: 0.005, decay: 2.4, cutoff: 2200 });
    voice(out, t, freq * 2, 0.1, { wave: 'sine', gain: gain * 0.3, attack: 0.005, decay: 1.2 });
  }

  // ---------- generative session ----------
  function startMood(id) {
    const m = MOODS[id] || MOODS.glass;
    const out = ctx.createGain(); out.gain.value = 0.0001;
    const dry = ctx.createGain(), wet = ctx.createGain(), echo = ctx.createGain();
    dry.gain.value = 1 - (m.rev || 0.3) * 0.4; wet.gain.value = m.rev || 0.3; echo.gain.value = m.delay || 0;
    out.connect(dry).connect(master); out.connect(wet).connect(reverb); if (m.delay) { delay.delayTime.value = (60 / m.bpm) * 0.75; out.connect(echo).connect(delay); }
    const scale = SCALES[m.scale] || SCALES.major;
    const deg = (d, oct = 0) => { const n = scale.length; const o = Math.floor(d / n); return m.root + 12 * (o + oct) + scale[((d % n) + n) % n]; };
    const chordTones = (root) => [0, 2, 4, ...(m.sevenths ? [6] : [])].map((x) => root + x);
    const stepDur = 60 / m.bpm / 4;
    let step = 0, next = ctx.currentTime + 0.1, melDeg = 7, stopped = false;
    const rand = Math.random;

    function tick() {
      if (stopped) return;
      while (next < ctx.currentTime + 0.2) {
        const s16 = step % 16, bar = Math.floor(step / 16);
        const chordRoot = m.prog[Math.floor(bar / (m.bars || 1)) % m.prog.length];
        const tones = chordTones(chordRoot);
        const swing = (s16 % 2 === 1) ? (m.swing || 0) * stepDur : 0;
        const t = next + swing;
        const chordLen = stepDur * 16 * (m.bars || 1);
        // pad: once per chord (or gated eighths)
        if (m.pad && (step % (16 * (m.bars || 1)) === 0) && !m.pad.gate)
          tones.slice(0, 3).forEach((d) => voice(out, t, midiHz(deg(d, 0)), chordLen * 0.95, { ...m.pad, release: m.pad.attack || 1 }));
        if (m.pad?.gate && s16 % 2 === 0)
          tones.slice(0, 3).forEach((d) => voice(out, t, midiHz(deg(d, 0)), stepDur * 1.6, { ...m.pad, attack: 0.01, decay: stepDur * 1.8 }));
        // bass pattern: R root, 3/5/6 chord-relative, '.' rest
        if (m.bass) {
          const c = m.bass.pat[s16];
          if (c && c !== '.') {
            const off = { R: 0, 3: 2, 5: 4, 6: 5 }[c] ?? 0;
            voice(out, t, midiHz(deg(chordRoot + off, (m.bass.oct ?? 0) - 1)), stepDur * 1.8, { ...m.bass, attack: 0.01, decay: m.bass.decay || stepDur * 3, cutoff: m.bass.cutoff || 800 });
          }
        }
        // arpeggio
        if (m.arp && (m.arp.rate === 16 || s16 % 2 === 0)) {
          const i = (m.arp.rate === 16 ? step : step / 2) % m.arp.pat.length;
          const d = tones[m.arp.pat[i] % tones.length] + (m.arp.pat[i] >= tones.length ? 7 : 0);
          voice(out, t, midiHz(deg(d, m.arp.oct || 0)), stepDur, { ...m.arp, attack: 0.005 });
        }
        // comping chords (jazz)
        if (m.comp && m.comp.pat[s16] === 'x') tones.forEach((d) => voice(out, t, midiHz(deg(d, 0)), stepDur, { ...m.comp, attack: 0.01 }));
        // melody: wandering line that leans on chord tones
        if (m.mel && s16 % 2 === 0 && rand() < m.mel.prob) {
          melDeg += [-2, -1, -1, 0, 1, 1, 2][Math.floor(rand() * 7)];
          melDeg = Math.max(2, Math.min(13, melDeg));
          let d = melDeg;
          if (m.mel.penta && [3, 6].includes(((d % 7) + 7) % 7)) d += 1;
          if (s16 === 0) d = tones[Math.floor(rand() * tones.length)] + 7;
          voice(out, t, midiHz(deg(d, m.mel.oct || 0)), stepDur * 2, { ...m.mel, attack: 0.01 });
        }
        if (m.bell && s16 % 4 === 0 && rand() < m.bell.prob) bell(out, t, midiHz(deg(tones[Math.floor(rand() * tones.length)], (m.bell.oct || 1))), m.bell.gain);
        if (m.piano && s16 % 2 === 0 && rand() < m.piano.prob) piano(out, t, midiHz(deg(tones[Math.floor(rand() * tones.length)] + (rand() < 0.4 ? 7 : 0), m.piano.oct || 0)), m.piano.gain);
        // drums
        const dr = m.drums;
        if (dr) {
          if (dr.kick?.[s16] === 'x') kick(out, t, dr.kickGain || 0.2, dr.chip);
          if (dr.snare?.[s16] === 'x') { noise(out, t, 0.16, dr.snareGain || 0.06, 'highpass', 1400); }
          if (dr.hat?.[s16] === 'x') noise(out, t, dr.brush ? 0.12 : 0.04, dr.hatGain || 0.02, dr.brush ? 'bandpass' : 'highpass', dr.brush ? 5000 : 7500);
        }
        next += stepDur; step++;
      }
    }
    const timer = setInterval(tick, 40);
    tick();
    return {
      out, label: m.name,
      stop() { stopped = true; clearInterval(timer); },
    };
  }

  function startFile(path) {
    const a = new Audio(isDrivePath(path) ? toImageUrl(path) : path);
    a.loop = true; a.crossOrigin = 'anonymous';
    const out = ctx.createGain(); out.gain.value = 0.0001;
    const src = ctx.createMediaElementSource(a);
    src.connect(out).connect(master);
    a.play().catch((e) => pv.log(`music file failed: ${e.message}`));
    return { out, label: path.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), stop() { a.pause(); a.src = ''; } };
  }

  function switchTo(w) {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (session && session.key === `${w.kind}:${w.id}`) return;
    const old = session;
    if (old) {
      old.out.gain.cancelScheduledValues(ctx.currentTime);
      old.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
      setTimeout(() => { old.stop(); try { old.out.disconnect(); } catch {} }, 3000);
    }
    session = w.kind === 'file' ? startFile(w.id) : startMood(w.id);
    session.key = `${w.kind}:${w.id}`;
    session.out.gain.setTargetAtTime(w.kind === 'mood' ? (TRIM[w.id] || 1) : 1, ctx.currentTime + 0.05, 0.8);
    updateDisc();
  }

  // What should play right now: a game's own tune, else the theme's file, else the theme's mood.
  let override = null;
  function desired() {
    if (override) return override;
    const theme = typeof data !== 'undefined' ? data.theme : 'glass';
    const f = data.music?.themeFiles?.[theme];
    if (f) return { kind: 'file', id: f };
    return { kind: 'mood', id: data.music?.themeMoods?.[theme] || (MOODS[theme] ? theme : 'glass') };
  }
  const fromItemSetting = (v) => !v ? null : v.startsWith('file:') ? { kind: 'file', id: v.slice(5) } : { kind: 'mood', id: v };

  function refresh() {
    wanted = desired();
    if (playing) switchTo(wanted); else updateDisc();
  }
  function play() {
    if (typeof data !== 'undefined' && data.settings?.plugins?.tunes === false) return; // switched off in Settings → الإضافات
    playing = true;
    ensureCtx(); if (ctx.state === 'suspended') ctx.resume();
    master.gain.setTargetAtTime(volume(), ctx.currentTime, 0.3);
    switchTo(desired());
  }
  function pause(remember = true) {
    if (!ctx) { playing = false; updateDisc(); return; }
    playing = false;
    master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    const s = session; session = null;
    setTimeout(() => { if (!playing && s) { s.stop(); try { s.out.disconnect(); } catch {} } }, 1800);
    if (remember) { (data.music ||= {}).on = false; save(); }
    updateDisc();
  }

  // ---------- disc widget ----------
  const disc = document.getElementById('disc');
  function updateDisc() {
    if (!disc) return;
    disc.classList.toggle('playing', playing);
    const w = desired();
    const label = w.kind === 'file' ? w.id.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : (MOODS[w.id]?.name || '');
    disc.querySelector('.disc-title').textContent = playing ? label : (spotifyOn() ? 'سبوتيفاي شغّال' : 'اضغط القرص للتشغيل');
    disc.title = playing ? `يشتغل: ${label}` : 'ألحان الخلفية';
    const vr = disc.querySelector('.disc-vol-range'); if (vr && document.activeElement !== vr) { vr.value = Math.round(volume() * 100); vr.style.setProperty('--p', vr.value + '%'); }
  }
  function moodMenu(e, onPick, extra = []) {
    showCtx(e, [
      ...extra,
      ...Object.entries(MOODS).map(([id, m]) => ({ label: `🎵 ${m.name}`, run: () => onPick({ kind: 'mood', id }) })),
    ]);
  }
  // Hover the player: a volume slider slides out (drag left / right)
  const volRange = disc?.querySelector('.disc-vol-range');
  volRange?.addEventListener('input', () => {
    data.music.volume = Math.max(0, Math.min(1, Number(volRange.value) / 100));
    volRange.style.setProperty('--p', volRange.value + '%');
    if (ctx && playing) master.gain.setTargetAtTime(Math.max(0.0001, data.music.volume), ctx.currentTime, 0.08);
    save();
  });
  volRange?.addEventListener('wheel', (e) => { e.preventDefault(); volRange.value = Number(volRange.value) + (e.deltaY < 0 ? 5 : -5); volRange.dispatchEvent(new Event('input')); }, { passive: false });
  const spotifyOn = () => typeof spState !== 'undefined' && !!spState.playing;
  disc?.querySelector('.disc-deck').addEventListener('click', (e) => {
    e.stopPropagation();
    if (playing) pause(); else { (data.music ||= {}).on = true; save(); play(); }
  });
  const openMenu = (e) => {
    e.preventDefault(); e.stopPropagation();
    const theme = data.theme;
    const r = disc.getBoundingClientRect();
    const ev = { preventDefault() {}, clientX: r.left - 220, clientY: r.top - 380 };
    showCtx(ev, [
      { label: playing ? '⏸  إيقاف الألحان' : '▶  تشغيل الألحان', run: () => (playing ? pause() : ((data.music ||= {}).on = true, save(), play())) },
      { label: '🔊  أعلى', run: () => setVolume(volume() + 0.1), keepOpen: true },
      { label: '🔉  أخفض', run: () => setVolume(volume() - 0.1), keepOpen: true },
      '-',
      { label: '🎼  غيّر لحن هذا الثيم…', run: () => setTimeout(() => moodMenu(ev, (w) => {
        data.music.themeMoods ||= {}; data.music.themeMoods[theme] = w.id;
        if (data.music.themeFiles) delete data.music.themeFiles[theme];
        save(); refresh();
      }), 0) },
      { label: '📁  حط ملف موسيقى لهذا الثيم…', run: async () => {
        const f = await pv.pickFile('audio'); if (!f) return;
        data.music.themeFiles ||= {}; data.music.themeFiles[theme] = f; save(); refresh();
        if (!playing) { (data.music ||= {}).on = true; play(); }
      } },
      ...(data.music.themeFiles?.[theme] || data.music.themeMoods?.[theme] ? [{ label: '↺  رجّع اللحن الأصلي للثيم', run: () => {
        delete data.music.themeFiles?.[theme]; delete data.music.themeMoods?.[theme]; save(); refresh();
      } }] : []),
    ]);
  };
  disc?.addEventListener('contextmenu', openMenu);
  disc?.querySelector('.disc-more')?.addEventListener('click', openMenu);
  function setVolume(v) {
    data.music.volume = Math.max(0.05, Math.min(1, Math.round(v * 20) / 20)); save();
    if (ctx && playing) master.gain.setTargetAtTime(data.music.volume, ctx.currentTime, 0.2);
    toast(`صوت الألحان ${Math.round(data.music.volume * 100)}%`);
  }

  // Game tunes: hovering a game for a moment switches to its tune; leaving brings the theme back.
  let hoverTimer = null;
  window.Music = {
    MOODS,
    init() {
      data.music = { on: true, volume: 0.4, themeFiles: {}, themeMoods: {}, ...(data.music || {}) };
      updateDisc();
      if (data.music.on && !window.SB_WELCOME_PENDING) play(); // with the welcome screen, music starts when you enter
    },
    themeChanged() { override = null; refresh(); },
    hoverItem(item) {
      clearTimeout(hoverTimer);
      const w = fromItemSetting(item?.music);
      if (!w) return;
      hoverTimer = setTimeout(() => { override = w; refresh(); }, 1200);
    },
    leaveItems() { clearTimeout(hoverTimer); if (override) { override = null; refresh(); } },
    itemMenu(e, item) {
      moodMenu(e, (w) => { item.music = w.id; save(); toast(`لحن ${item.name}: ${MOODS[w.id].name}`); }, [
        { label: '📁  ملف موسيقى…', run: async () => { const f = await pv.pickFile('audio'); if (f) { item.music = 'file:' + f; save(); toast('تم'); } } },
        ...(item.music ? [{ label: '✕  بدون (لحن الثيم)', run: () => { delete item.music; save(); } }] : []),
        '-',
      ]);
    },
    pauseForApp() { if (playing) { pause(false); this._resume = true; } },
    // never talk over Spotify: the tunes come back only when it's quiet
    resumeIfPaused() { if (this._resume && data.music.on !== false && !spotifyOn()) { this._resume = false; play(); } },
    setVol(v) { data.music.volume = Math.max(0, Math.min(1, v)); save(); if (ctx && playing) master.gain.setTargetAtTime(Math.max(0.0001, data.music.volume), ctx.currentTime, 0.2); updateDisc(); },
    spotifyChanged(on) { if (on && data.settings?.duck === false) return; if (on) { if (playing) { pause(false); this._resume = true; } } else this.resumeIfPaused(); updateDisc(); },
    play() { (data.music ||= {}).on = true; save(); play(); },
    pause() { pause(); },
    isPlaying: () => playing,
    _debug: () => ({ ctx, master, switchTo }),
  };
})();
