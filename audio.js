// All sound is synthesised with Web Audio; nothing is downloaded or recorded. Starts on the first tap.
// What is heard (and from where) comes from `world/soundscape.js`; this file only renders it. Sources sit in space
// through equal-power panners (cheap enough for phones); distance is already in each level, so panners only turn.
export function createAudio() {
  let ctx = null, master, mix, sfx, amb, mus, bus, noiseBuf, beds = null, duck = 1, meter = null, listened = null, muted = false, spoken = 0;
  const clips = new Map(); // url -> Promise<AudioBuffer | null>, so each clip is fetched and decoded once
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
  function env(node, t, peak, attack, release) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    node.connect(g).connect(bus ?? sfx);
  }
  function tone(type, f0, f1, dur, peak, delay = 0, attack = 0.05, cut = 1800) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = cut;
    o.connect(lp);
    env(lp, t, peak, attack, dur);
    o.start(t); o.stop(t + dur + attack + 0.1);
    return o;
  }
  function burst(freq, q, dur, peak, delay = 0, type = "bandpass") {
    const t = ctx.currentTime + delay, s = noise(), f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f);
    env(f, t, peak, 0.01, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.2);
  }
  /**
   * A horn: a bright saw and an octave square through two resonances, entering a little flat and settling on the
   * pitch, with the brightness opening after the attack, as a player's breath does. `rough` adds a ragged edge (a
   * ram's horn) and `breath` a rush of air at the start.
   */
  function horn(f0, f1, dur, peak, delay = 0, { attack = 0.06, rough = 0, breath = 0 } = {}) {
    const t = ctx.currentTime + delay, g = ctx.createGain(), lp = ctx.createBiquadFilter(), oscs = [];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    lp.type = "lowpass"; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(2600, t + attack + 0.1);
    for (const [type, mult, v] of [["sawtooth", 1, 1], ["square", 2, 0.3]]) {
      const o = ctx.createOscillator(), l = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0 * mult * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(f1 * mult, t + attack + 0.05);
      if (rough) { const j = ctx.createOscillator(), jd = ctx.createGain(); j.frequency.value = 23; jd.gain.value = f1 * mult * rough; j.connect(jd).connect(o.frequency); j.start(t); j.stop(t + dur + 0.3); }
      l.gain.value = v; o.connect(l).connect(lp); oscs.push(o);
    }
    const bell = ctx.createBiquadFilter();
    bell.type = "peaking"; bell.frequency.value = 1500; bell.Q.value = 1.2; bell.gain.value = 6;
    lp.connect(bell).connect(g).connect(bus ?? sfx);
    for (const o of oscs) { o.start(t); o.stop(t + dur + 0.3); }
    if (breath) burst(3500, 0.8, 0.25, breath, delay, "bandpass");
  }
  /** A wavering voice: a tone with vibrato, through one formant. */
  function bleat(f0, f1, dur, peak, delay = 0, formant = 1100, rate = 7) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    lfo.frequency.value = rate; depth.gain.value = f0 * 0.06;
    lfo.connect(depth).connect(o.frequency);
    f.type = "bandpass"; f.frequency.value = formant; f.Q.value = 2.5;
    o.connect(f);
    env(f, t, peak, 0.06, dur);
    for (const n of [o, lfo]) { n.start(t); n.stop(t + dur + 0.2); }
  }
  const voices = {
    wheel: () => { for (let i = 0; i < 7; i += 1) { tone("sawtooth", 150 + (i % 3) * 30, 260 + (i % 2) * 60, 0.22, 0.09, i * 0.3); burst(900, 6, 0.12, 0.05, i * 0.3 + 0.1); } },
    embers: () => burst(3000, 0.8, 1.6, 0.06, 0, "highpass"),
    pop: () => burst(1800 + Math.random() * 2500, 4, 0.03, 0.14),
    crackle: () => { for (let i = 0; i < 8; i += 1) burst(2400, 3, 0.05, 0.12, i * 0.12 + Math.random() * 0.08); },
    call: () => { tone("triangle", 330, 440, 0.35, 0.16); tone("triangle", 440, 392, 0.6, 0.16, 0.4); },
    answer: () => { tone("triangle", 294, 330, 0.3, 0.13); tone("triangle", 392, 440, 0.5, 0.13, 0.35); },
    bolt: () => { burst(300, 2, 0.5, 0.3); tone("sine", 110, 70, 0.3, 0.3, 0.45, 0.01); },
    latch: () => { burst(1800, 5, 0.06, 0.25); burst(1500, 5, 0.06, 0.25, 0.5); },
    gate: () => { tone("sine", 62, 38, 4.5, 0.6, 0, 0.3); tone("sawtooth", 80, 120, 2.6, 0.08, 0.2, 0.4); burst(160, 0.7, 4, 0.3, 0.3, "lowpass"); },
    magrefa: () => { for (const f of [196, 247, 294, 370]) tone("square", f, f, 1.4, 0.04, 0, 0.1); },
    herald: () => { [294, 370, 440].forEach((f, i) => tone("triangle", f, f * 1.02, 0.42, 0.14, i * 0.45)); },
    flute: () => { [587, 659, 784, 659].forEach((f, i) => tone("sine", f, f, 0.3, 0.12, i * 0.3)); },
    cymbal: () => { burst(7000, 0.6, 1.2, 0.16, 0, "highpass"); burst(7000, 0.6, 0.8, 0.12, 0.45, "highpass"); },
    song: () => { for (const f of [220, 277, 330, 440]) tone("sine", f, f, 2.2, 0.07, 0, 0.5); },
    trumpet: () => { for (const [f0, d, w] of [[466, 0, 1.1], [466, 1.2, 0.18], [523, 1.4, 0.18], [466, 1.6, 0.18], [523, 1.8, 0.18], [466, 2.1, 1.1]]) horn(f0, f0, w, 0.09, d, { attack: w > 0.5 ? 0.07 : 0.025 }); },
    // One long blast of the silver trumpet, at a pause in the song (Tamid 7:3).
    blast: () => horn(466, 466, 1.3, 0.09, 0, { attack: 0.07 }),
    shofar: () => { horn(233, 349, 0.5, 0.13, 0, { attack: 0.14, rough: 0.012, breath: 0.05 }); horn(349, 356, 1.4, 0.14, 0.5, { attack: 0.05, rough: 0.008 }); },
    sneeze: () => { tone("sine", 500, 900, 0.18, 0.1); burst(2600, 1.2, 0.22, 0.3, 0.2); tone("square", 700, 300, 0.12, 0.04, 0.2, 0.01); },
    // The Mount's own calls (world/soundscape.js).
    bleat: () => { const f = 330 + Math.random() * 120; bleat(f, f * 0.85, 0.7, 0.16, 0, 1200, 9); if (Math.random() < 0.4) bleat(f * 1.05, f * 0.9, 0.5, 0.12, 0.9, 1200, 9); },
    low: () => { bleat(105, 88, 1.8, 0.3, 0, 420, 3); },
    coo: () => { [[360, 330, 0.28], [400, 340, 0.5], [340, 320, 0.3]].forEach(([a, b, d], i) => tone("sine", a, b, d, 0.12, i * 0.42, 0.06, 900)); },
    swift: () => { for (let i = 0; i < 4; i += 1) tone("sine", 5200 + Math.random() * 900, 4100, 0.12, 0.05, i * 0.16 + Math.random() * 0.05, 0.01, 9000); },
    jackal: () => { for (let k = 0; k < 3; k += 1) { const f = 560 + k * 90; bleat(f, f * 1.4, 1.6, 0.06, k * 0.5, 900 + k * 200, 5); } },
    hammer: () => { burst(2200, 9, 0.04, 0.3); tone("sine", 260, 200, 0.05, 0.1, 0, 0.005); },
    step: () => { burst(1400, 1.2, 0.05, 0.16); burst(220, 1, 0.07, 0.2, 0, "lowpass"); },
    bare: () => { burst(320, 0.9, 0.08, 0.22, 0, "lowpass"); },
  };

  /** One note of the Levites' song (world/soundscape.js), `delay` seconds from now, from `pos`. */
  function note(ev, delay = 0) {
    const t = ctx.currentTime + Math.max(0, delay), out = ctx.createGain(), p = panner(ev.pos);
    out.gain.value = ev.level;
    out.connect(p).connect(mus);
    const stop = (nodes, at) => { for (const n of nodes) { n.start(t); n.stop(at); } };
    if (ev.voice === "choir") {
      // Men's voices on an open "ah": three slightly detuned saws through two vowel formants, with a slow vibrato.
      const g = ctx.createGain(), vib = ctx.createOscillator(), vd = ctx.createGain(), oscs = [];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.14);
      g.gain.setValueAtTime(0.22, t + Math.max(0.15, ev.dur - 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur + 0.35);
      vib.frequency.value = 5.2; vd.gain.value = ev.freq * 0.012; vib.connect(vd);
      for (const cents of [-9, 0, 8]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = ev.freq; o.detune.value = cents; vd.connect(o.frequency); o.connect(g); oscs.push(o); }
      for (const [f, q, v] of [[700, 5, 1], [1150, 7, 0.6]]) { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = f; b.Q.value = q; const l = ctx.createGain(); l.gain.value = v; g.connect(b).connect(l).connect(out); }
      stop([vib, ...oscs], t + ev.dur + 0.5);
    } else {
      // A plucked string: a bright start that dies away, longer for the low harp.
      const low = ev.voice === "nevel", ring = low ? 2.4 : 1.3, g = ctx.createGain(), lp = ctx.createBiquadFilter(), oscs = [];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(low ? 0.4 : 0.3, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
      lp.type = "lowpass"; lp.frequency.setValueAtTime(low ? 1400 : 3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + ring);
      for (const [type, m, v] of [["triangle", 1, 1], ["sine", 2, 0.4], ["sine", 3, 0.15]]) { const o = ctx.createOscillator(), l = ctx.createGain(); o.type = type; o.frequency.value = ev.freq * m; l.gain.value = v; o.connect(l).connect(g); oscs.push(o); }
      g.connect(lp).connect(out);
      stop(oscs, t + ring + 0.1);
    }
  }

  function panner(pos) {
    const p = ctx.createPanner();
    p.panningModel = "equalpower"; p.distanceModel = "linear"; p.rolloffFactor = 0;
    if (pos) place(p, pos);
    return p;
  }
  function place(p, [x, y, z], smooth = 0) {
    if (p.positionX) {
      const now = ctx.currentTime;
      if (smooth) { p.positionX.setTargetAtTime(x, now, smooth); p.positionY.setTargetAtTime(y, now, smooth); p.positionZ.setTargetAtTime(z, now, smooth); }
      else { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    } else p.setPosition(x, y, z);
  }
  /** A looping noise bed: noise → filter(s) → gain → (panner) → ambience bus. */
  function bed(filters, pos = null) {
    const s = noise(), g = ctx.createGain();
    g.gain.value = 0;
    let n = s;
    const fs = filters.map(([type, freq, q]) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; n.connect(f); n = f; return f; });
    const p = pos === false ? null : panner(pos ?? [0, 0, 0]);
    n.connect(g);
    (p ? g.connect(p) : g).connect(amb);
    s.start(0, Math.random() * 1.5);
    return { s, f: fs, g, p };
  }
  /** Speech-like babble: two formant bands, their loudness wandering at syllable rate. */
  function babble() {
    const b = bed([["bandpass", 520, 2.2]]), b2 = ctx.createBiquadFilter();
    b2.type = "bandpass"; b2.frequency.value = 1650; b2.Q.value = 3;
    b.s.connect(b2).connect(b.g);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    for (const r of [3.1, 4.7, 6.3]) { const o = ctx.createOscillator(), d = ctx.createGain(); o.frequency.value = r * (0.9 + Math.random() * 0.2); d.gain.value = 0.16; o.connect(d).connect(am.gain); o.start(); }
    b.g.disconnect(); b.g.connect(am).connect(b.p);
    return b;
  }
  function makeBeds() {
    const w = [-0.7, 0.7].map((pan) => { const b = bed([["lowpass", 380, 0.6]], false), sp = ctx.createStereoPanner(); b.g.disconnect(); b.g.connect(sp).connect(amb); sp.pan.value = pan; return b; });
    const crickets = bed([["bandpass", 4600, 9]], false);
    const chirp = ctx.createOscillator(), chirpDepth = ctx.createGain(), chirpGain = ctx.createGain();
    chirp.frequency.value = 17; chirpDepth.gain.value = 1; chirpGain.gain.value = 0;
    crickets.g.disconnect(); crickets.g.connect(chirpGain).connect(amb);
    chirp.connect(chirpDepth).connect(chirpGain.gain); chirp.start();
    return {
      wind: w,
      throng: bed([["lowpass", 700, 0.7], ["highpass", 180, 0.7]], false),
      city: bed([["lowpass", 420, 0.8]]),
      crickets,
      fire: [0, 1, 2].map(() => bed([["bandpass", 1100, 0.5]])),
      crowd: [0, 1, 2].map(babble),
      steps: [0, 1, 2].map(() => ({ p: panner([0, 0, 0]), g: ctx.createGain(), phase: Math.random(), level: 0, bare: false })),
      own: { phase: 0 },
    };
  }
  const set = (param, v, tau = 0.4) => param.setTargetAtTime(v, ctx.currentTime, tau);
  /** Play a voice into `out` (a node), then return to the plain bus. */
  function into(out, id) { bus = out; voices[id](); bus = null; }

  // The tab out of sight: the Mount goes quiet rather than holding its last note.
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return {
    get state() { return ctx ? ctx.state : "off"; },
    /** Quiet mode: the Mount stays as it is, without sound. */
    get muted() { return muted; },
    mute(v) { muted = v; if (ctx) master.gain.setTargetAtTime(v ? 0 : 0.8, ctx.currentTime, 0.08); },
    /** How loud the Mount is right now (RMS of the mix), for tests. */
    get level() {
      if (!meter) return 0;
      const a = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(a);
      return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    },
    start() {
      if (ctx) return ctx.state === "suspended" && !document.hidden ? ctx.resume() : null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // If the audio device fails (unplugged, busy), the Mount simply goes quiet.
      ctx.onerror = (e) => { e.preventDefault?.(); console.warn("audio device unavailable; continuing without sound"); };
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      meter = ctx.createAnalyser();
      meter.fftSize = 2048;
      master.connect(meter);
      // Everything meets in `mix`, dry to the master and through a short stone-court reverb beside it.
      mix = ctx.createGain(); mix.connect(master);
      const rate = ctx.sampleRate, ir = ctx.createBuffer(2, Math.floor(rate * 1.1), rate), wet = ctx.createGain(), room = ctx.createConvolver();
      for (let c = 0; c < 2; c += 1) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3.5; }
      room.buffer = ir; wet.gain.value = 0.2;
      mix.connect(room).connect(wet).connect(master);
      sfx = ctx.createGain(); sfx.connect(mix);
      amb = ctx.createGain(); amb.gain.value = AMB; amb.connect(mix);
      mus = ctx.createGain(); mus.connect(mix);
      beds = makeBeds();
      for (const s of beds.steps) { s.g.connect(s.p).connect(amb); }
      return ctx.resume();
    },
    /** Where the visitor stands and faces (`yaw` as in the walker: 0 faces −z). */
    listen(me) {
      if (!ctx) return;
      const k = me.x * 7 + me.z * 13 + me.y * 3 + me.yaw * 11;
      if (listened !== null && Math.abs(k - listened) < 0.002) return; // not moved, not turned: nothing to set
      listened = k;
      const l = ctx.listener, fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      if (l.positionX) {
        l.positionX.value = me.x; l.positionY.value = me.y; l.positionZ.value = me.z;
        l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
        l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
      } else { l.setPosition(me.x, me.y, me.z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
    },
    /** Take in a soundscape (a few times a second). */
    hear(sc, time) {
      if (!ctx || !beds) return;
      const gust = 0.75 + 0.25 * Math.sin(time * 0.31) * Math.sin(time * 0.17 + 1);
      beds.wind.forEach((w, i) => {
        set(w.g.gain, sc.wind.level * 0.5 * gust * (i ? 1 - 0.2 * Math.sin(time * 0.4) : 1), 0.6);
        set(w.f[0].frequency, (260 + 260 * sc.wind.bright) * (0.8 + 0.3 * gust), 0.8);
      });
      set(beds.throng.g.gain, sc.throng.level * 0.35, 1);
      set(beds.city.g.gain, sc.city.level * 0.25, 1.5);
      place(beds.city.p, sc.city.pos);
      set(beds.crickets.g.gain, sc.crickets.level * 0.18, 2);
      beds.fire.forEach((b, i) => {
        const f = sc.fire[i];
        set(b.g.gain, f ? f.level * 0.09 : 0, 0.3);
        if (f) place(b.p, f.pos, 0.2);
      });
      beds.crowd.forEach((b, i) => {
        const c = sc.crowd[i];
        set(b.g.gain, c ? c.level * 0.5 : 0, 0.8);
        if (c) place(b.p, c.pos, 0.6);
      });
      beds.steps.forEach((s, i) => {
        const w = sc.steps[i];
        s.level = w ? w.level : 0; s.bare = w?.bare;
        if (w) place(s.p, [w.pos[0], w.pos[1], w.pos[2]], 0.1);
      });
      beds.fires = sc.fire;
    },
    /** Every frame: footfalls (others' and the visitor's own) and the fire's crackle. */
    tick(dt, speed) {
      if (!ctx || !beds || ctx.state !== "running") return;
      for (const s of beds.steps) {
        if (s.level < 0.02) continue;
        s.phase += dt * 1.7;
        if (s.phase >= 1) { s.phase -= 1; s.g.gain.value = s.level * (0.8 + Math.random() * 0.4); into(s.g, s.bare ? "bare" : "step"); }
      }
      const own = beds.own;
      if (speed > 0.3) {
        own.phase += dt * (1.2 + speed * 0.45);
        if (own.phase >= 1) { own.phase -= 1; const g = ctx.createGain(); g.gain.value = 0.18 * duck; g.connect(sfx); into(g, "bare"); }
      } else own.phase = 0.6;
      for (const f of beds.fires ?? []) {
        if (f.level > 0.08 && Math.random() < dt * 5 * f.level) {
          const p = panner(f.pos), g = ctx.createGain();
          g.gain.value = f.level * 0.5; g.connect(p).connect(amb);
          into(g, "pop");
        }
      }
    },
    /** How many spoken clips have started (for tests). */
    get spoken() { return spoken; },
    /** Say a recorded line (made at authoring time, see scripts/voices.js) from where the speaker stands. */
    async speak(url, { pos, level = 1, rate = 1 } = {}) {
      if (!ctx || ctx.state !== "running") return;
      if (!clips.has(url)) clips.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null)).catch(() => null));
      const buffer = await clips.get(url);
      if (!buffer || ctx.state !== "running") return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer; src.playbackRate.value = rate; g.gain.value = 0.9 * level;
      src.connect(g);
      (pos ? g.connect(panner(pos)) : g).connect(mix);
      src.start();
      spoken += 1;
    },
    /** Sound the notes of the song that fall due (`delay` seconds ahead of now). */
    note(ev, delay = 0) { if (ctx && ctx.state === "running") note(ev, delay); },
    /** Hold the Mount down to a whisper (during the flight to Jericho), or bring it back. */
    duck(v) { if (!ctx || v === duck) return; duck = v; set(amb.gain, AMB * v, 0.5); set(mus.gain, v, 0.5); },
    /** Play a sound: quieter with distance (`gain` 0…1) and, given a position, from where it is. */
    play(id, gain = 1, pos = null) {
      if (!ctx || ctx.state !== "running" || !voices[id]) return;
      const g = ctx.createGain();
      g.gain.value = gain;
      if (pos) g.connect(panner(pos)).connect(id in CALL_IDS ? amb : sfx); else g.connect(sfx);
      into(g, id);
    },
  };
}
const AMB = 1.5; // the beds and calls against the routines' own sounds
const CALL_IDS = { bleat: 1, low: 1, coo: 1, swift: 1, jackal: 1, hammer: 1 };
