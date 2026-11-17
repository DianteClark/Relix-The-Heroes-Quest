// Relix audio: synthesized SFX + CC0 music files + procedural music, all on Web Audio.
//
//   import { audio } from './audio.js';
//   audio.unlock();                      // first user gesture (also auto-attached)
//   audio.sfx('dice_hit', { intensity: 0.8, pitch: 1.1, pan: -0.3 });
//   audio.music('floor3');               // 1.2 s crossfade, seamless loop
//   audio.stopMusic(); audio.setVolume({ music: 0.5 }); audio.volumes;
//
// Also listens to window 'relix:sfx' CustomEvents: { detail: { name, intensity, pitch, pan } }.
// Music sources + licenses: assets/audio/CREDITS.md.

const STORE_KEY = 'relix.audio.v1';
const BASE = new URL('../assets/audio/', import.meta.url).href;
const XFADE = 1.2;
const MAX_VOICES = 28;
const MAX_DECODED = 3;

export const SFX_NAMES = ['tap', 'back', 'open', 'card_flip', 'card_draw', 'coin', 'dice_throw', 'dice_hit',
  'dice_settle', 'step', 'hit', 'crit', 'miss', 'ko', 'whoosh', 'vs', 'heal', 'hurt', 'trap', 'boss_roar',
  'boss_skill', 'relic', 'victory', 'defeat', 'pvp', 'guild', 'scroll', 'error', 'turn'];

// File tracks (CC0, see CREDITS.md). loopStart/loopEnd are seconds inside the file; the files carry
// 0.35 s of real pre/post-roll so the loop seam lands on continuous audio regardless of decoder padding.
// `proc` is the procedural theme used when no file exists or the file fails to load.
export const TRACKS = {
  title: { file: 'music/title.mp3', loopStart: 0.35, loopEnd: 96.3691, gain: 1, proc: 'heroic' },
  menu: { file: 'music/menu.mp3', loopStart: 0.35, loopEnd: 55.5492, gain: 0.95, proc: 'tavern' },
  floor1: { file: 'music/floor1.mp3', loopStart: 0.35, loopEnd: 120.35, gain: 1, proc: 'crypt' },
  floor2: { proc: 'sand' },
  floor3: { proc: 'forge' },
  floor4: { file: 'music/floor4.mp3', loopStart: 0.35, loopEnd: 85.344, gain: 1, proc: 'mire' },
  floor5: { proc: 'sanctum' },
  boss: { file: 'music/boss.mp3', loopStart: 0.35, loopEnd: 57.9541, gain: 0.95, proc: 'boss' },
  victory: { file: 'music/victory.mp3', loop: false, gain: 1, proc: 'victory' },
  defeat: { file: 'music/defeat.mp3', loop: false, gain: 1, proc: 'defeat' },
};

// Per-SFX output trim, measured with OfflineAudioContext (dev/audio.html "Measure") so peaks land on
// category targets (UI ≈ -12 dBFS, foley ≈ -8, impacts ≈ -4, big moments ≈ -3).
const LEVEL = {
  tap: 0.389, back: 0.475, open: 1.332, card_flip: 0.729, card_draw: 0.612, coin: 0.681, dice_throw: 2.148,
  dice_hit: 0.518, dice_settle: 0.685, step: 0.836, hit: 0.412, crit: 0.366, miss: 1.694, ko: 0.511,
  whoosh: 1.708, vs: 0.36, heal: 1.184, hurt: 0.515, trap: 0.323, boss_roar: 0.512, boss_skill: 0.468,
  relic: 1.054, victory: 0.639, defeat: 0.744, pvp: 0.376, guild: 0.851, scroll: 2.267, error: 0.78,
  turn: 1.005,
};
const DUCK = { relic: [0.3, 1.6], boss_roar: [0.3, 1.8], victory: [0.25, 2.2], defeat: [0.3, 2.2], vs: [0.55, 0.8], crit: [0.6, 0.5], boss_skill: [0.45, 1.2] };
// Max simultaneous voices per name (physics can spam dice_hit).
const PER_NAME = { dice_hit: 6, step: 3, coin: 4, tap: 3 };

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let rnd = Math.random;
const R = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Per-context caches (works for live AudioContext and OfflineAudioContext alike).
const ctxCache = new WeakMap();
function cache(ctx) {
  let c = ctxCache.get(ctx);
  if (!c) { c = { curves: {}, ks: new Map(), irs: {} }; ctxCache.set(ctx, c); }
  return c;
}
function noiseBuf(ctx) {
  const c = cache(ctx);
  if (!c.noise) {
    const n = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    c.noise = b;
  }
  return c.noise;
}
function distCurve(ctx, k) {
  const c = cache(ctx);
  if (!c.curves[k]) {
    const n = 2048, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * k) / Math.tanh(k); }
    c.curves[k] = cv;
  }
  return c.curves[k];
}
// Generated stereo impulse: exponential decay, frequency-dependent damping, short pre-delay, early reflections.
function impulse(ctx, secs, damp = 0.6, pre = 0.012) {
  const key = secs + '|' + damp;
  const c = cache(ctx);
  if (c.irs[key]) return c.irs[key];
  const sr = ctx.sampleRate, n = Math.floor(sr * secs);
  const b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    const p0 = Math.floor(pre * sr);
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr, k = t / secs;
      const a = clamp(0.15 + damp * k, 0, 0.97); // more damping as the tail goes on
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] = lp * Math.pow(1 - k, 2.2) * Math.exp(-3 * k) * (1.6 + damp);
    }
    for (let e = 0; e < 7; e++) { // early reflections
      const at = p0 + Math.floor((0.008 + Math.random() * 0.05) * sr);
      if (at < n) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.35 - e * 0.04);
    }
  }
  c.irs[key] = b;
  return b;
}
// Karplus-Strong plucked string rendered to a buffer (oud / harp / lute).
function ksBuffer(ctx, f, t60 = 1.6, bright = 0.5) {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / f));
  const key = N + '|' + t60 + '|' + bright;
  const c = cache(ctx);
  if (c.ks.has(key)) return c.ks.get(key);
  const len = Math.floor(sr * Math.min(t60 * 1.1, 3));
  const b = ctx.createBuffer(1, len, sr);
  const out = b.getChannelData(0);
  const d = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp = lp * (1 - bright) + (Math.random() * 2 - 1) * bright; d[i] = lp; }
  let mean = 0; for (let i = 0; i < N; i++) mean += d[i]; mean /= N;
  let mx = 0; for (let i = 0; i < N; i++) { d[i] -= mean; mx = Math.max(mx, Math.abs(d[i])); }
  for (let i = 0; i < N; i++) d[i] /= mx || 1;
  const rho = Math.pow(0.001, 1 / ((sr / N) * t60));
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = d[idx], nx = d[(idx + 1) % N];
    out[i] = cur;
    d[idx] = rho * (cur * 0.5 + nx * 0.5);
    idx = (idx + 1) % N;
  }
  const res = { buf: b, rate: (f * N) / sr };
  c.ks.set(key, res);
  return res;
}

// ---------------------------------------------------------------- synthesis primitives
// V = { ctx, t, out, wet } : out = dry destination, wet = reverb send.
function gainNode(ctx, g, dest) { const n = ctx.createGain(); n.gain.value = g; if (dest) n.connect(dest); return n; }
function env(p, t, a, peak, d, hold = 0) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold) p.setValueAtTime(peak, t + a + hold);
  p.setTargetAtTime(0, t + a + hold, d / 4.5);
}
function sendTo(V, node, dry = 1, wet = 0) {
  if (dry) { const g = gainNode(V.ctx, dry, V.out); node.connect(g); }
  if (wet && V.wet) { const g = gainNode(V.ctx, wet, V.wet); node.connect(g); }
}
// Oscillator voice with optional pitch sweep.
function tone(V, o) {
  const { ctx } = V;
  const t = V.t + (o.t || 0), a = o.a ?? 0.002, d = o.d ?? 0.2, hold = o.hold || 0;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1) {
    const ft = o.fT ?? (a + d * 0.6);
    if (o.lin) osc.frequency.linearRampToValueAtTime(o.f1, t + ft);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + ft);
  }
  if (o.det) osc.detune.value = o.det;
  const g = ctx.createGain();
  env(g.gain, t, a, o.g ?? 0.5, d, hold);
  osc.connect(g);
  let last = g;
  if (o.filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = o.filter; fl.frequency.setValueAtTime(o.ff || 1000, t); fl.Q.value = o.q ?? 0.7;
    if (o.ff1) fl.frequency.exponentialRampToValueAtTime(o.ff1, t + (o.ffT ?? d));
    g.connect(fl); last = fl;
  }
  if (o.dist) { const ws = ctx.createWaveShaper(); ws.curve = distCurve(ctx, o.dist); last.connect(ws); last = ws; }
  if (o.dest) last.connect(o.dest); else sendTo(V, last, o.dry ?? 1, o.wet || 0);
  osc.start(t); osc.stop(t + a + hold + d * 1.25 + 0.02);
  return osc;
}
// Filtered noise burst with optional filter sweep.
function noise(V, o) {
  const { ctx } = V;
  const t = V.t + (o.t || 0), a = o.a ?? 0.002, d = o.d ?? 0.1, hold = o.hold || 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx);
  src.playbackRate.value = o.rate || 1;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type || 'bandpass';
  fl.frequency.setValueAtTime(o.f || 1000, t);
  fl.Q.value = o.q ?? 1;
  if (o.f1) {
    fl.frequency.exponentialRampToValueAtTime(o.f1, t + (o.fT ?? (a + d * 0.6)));
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fT2 ?? (a + d)));
  }
  const g = ctx.createGain();
  env(g.gain, t, a, o.g ?? 0.5, d, hold);
  src.connect(fl); fl.connect(g);
  let last = g;
  if (o.dist) { const ws = ctx.createWaveShaper(); ws.curve = distCurve(ctx, o.dist); g.connect(ws); last = ws; }
  if (o.dest) last.connect(o.dest); else sendTo(V, last, o.dry ?? 1, o.wet || 0);
  const dur = a + hold + d * 1.25 + 0.02;
  src.loop = true;
  src.start(t, Math.random() * 1.9); src.stop(t + dur);
  return src;
}
// Inharmonic struck metal / wood (sum of decaying partials).
function partials(V, o) {
  const f = o.f, ratios = o.ratios, decs = o.decays, gains = o.gains;
  for (let i = 0; i < ratios.length; i++) {
    tone(V, { t: o.t, f: f * ratios[i] * (1 + (o.spread ? R(-o.spread, o.spread) : 0)), a: o.a ?? 0.001, d: decs[i], g: (o.g ?? 0.3) * gains[i], type: 'sine', wet: o.wet, dry: o.dry, dest: o.dest });
  }
}
// FM bell.
function bell(V, o) {
  const { ctx } = V;
  const t = V.t + (o.t || 0), d = o.d ?? 1.2;
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = o.f; mod.frequency.value = o.f * (o.ratio ?? 3.5);
  mg.gain.setValueAtTime(o.f * (o.index ?? 2.5), t);
  mg.gain.setTargetAtTime(o.f * 0.2, t, d / 5);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g);
  env(g.gain, t, o.a ?? 0.002, o.g ?? 0.3, d);
  if (o.dest) g.connect(o.dest); else sendTo(V, g, o.dry ?? 1, o.wet || 0);
  car.start(t); mod.start(t); car.stop(t + d * 1.3 + 0.05); mod.stop(t + d * 1.3 + 0.05);
}
// Brass-ish: detuned saws through an opening low-pass.
function brass(V, o) {
  const { ctx } = V;
  const t = V.t + (o.t || 0), a = o.a ?? 0.04, hold = o.hold ?? 0.1, d = o.d ?? 0.4;
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass'; fl.Q.value = 1.2;
  const lo = o.lo ?? 350, hi = o.hi ?? 2600;
  fl.frequency.setValueAtTime(lo, t);
  fl.frequency.linearRampToValueAtTime(hi, t + a + 0.03);
  fl.frequency.setTargetAtTime(hi * 0.45, t + a + 0.05, hold + d * 0.3);
  const g = ctx.createGain();
  env(g.gain, t, a, o.g ?? 0.2, d, hold);
  fl.connect(g);
  if (o.dest) g.connect(o.dest); else sendTo(V, g, o.dry ?? 1, o.wet || 0);
  const end = t + a + hold + d * 1.25 + 0.03;
  for (const det of o.dets || [-7, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = o.f; osc.detune.value = det;
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.f * 0.008, t + 0.35); l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(end); }
    osc.connect(fl); osc.start(t); osc.stop(end);
  }
}
function pluck(V, o) {
  const { ctx } = V;
  const t = V.t + (o.t || 0);
  const ks = ksBuffer(ctx, o.f, o.t60 ?? 1.6, o.bright ?? 0.55);
  const src = ctx.createBufferSource();
  src.buffer = ks.buf; src.playbackRate.value = ks.rate;
  const g = gainNode(ctx, o.g ?? 0.3);
  let last = src;
  if (o.ff) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.ff; src.connect(fl); last = fl; }
  last.connect(g);
  if (o.dest) g.connect(o.dest); else sendTo(V, g, o.dry ?? 1, o.wet || 0);
  src.start(t);
  if (o.len) { g.gain.setValueAtTime(o.g ?? 0.3, t + o.len); g.gain.setTargetAtTime(0, t + o.len, 0.08); src.stop(t + o.len + 0.5); }
}
function panSweep(V, from, to, dur) {
  if (!V.ctx.createStereoPanner) return V;
  const p = V.ctx.createStereoPanner();
  p.pan.setValueAtTime(from, V.t); p.pan.linearRampToValueAtTime(to, V.t + dur);
  p.connect(V.out);
  return { ...V, out: p };
}

// ---------------------------------------------------------------- SFX recipes
// Each gets (V, i = intensity 0..1.5, p = pitch multiplier) and returns its duration in seconds.
const CHIME = [1, 1.125, 1.25, 1.5, 1.6875, 2, 2.25, 2.5, 3];
const SFX = {
  tap(V, i, p) {
    const f = R(1500, 1750) * p;
    tone(V, { f, f1: f * 0.55, fT: 0.025, d: 0.045, g: 0.45 });
    noise(V, { type: 'highpass', f: 4500, d: 0.012, g: 0.18 });
    return 0.08;
  },
  back(V, i, p) {
    const f = R(720, 800) * p;
    tone(V, { type: 'triangle', f, f1: f * 0.6, fT: 0.05, d: 0.06, g: 0.5 });
    tone(V, { type: 'triangle', t: 0.045, f: f * 0.74, f1: f * 0.5, fT: 0.05, d: 0.06, g: 0.32 });
    noise(V, { type: 'lowpass', f: 2200, d: 0.015, g: 0.2 });
    return 0.14;
  },
  open(V, i, p) {
    noise(V, { f: 500, f1: 3800, fT: 0.22, q: 1.4, a: 0.09, d: 0.22, g: 0.32, wet: 0.2 });
    tone(V, { t: 0.08, f: 880 * p, d: 0.5, g: 0.11, wet: 0.35 });
    tone(V, { t: 0.13, f: 1318.5 * p, d: 0.6, g: 0.09, wet: 0.35 });
    tone(V, { t: 0.08, f: 1760 * p, d: 0.25, g: 0.03, wet: 0.3 });
    return 0.8;
  },
  card_flip(V, i, p) {
    const f = R(2400, 3200) * p;
    noise(V, { f, f1: f * 2.2, fT: 0.05, q: 1.8, a: 0.004, d: 0.055, g: 0.55 });
    noise(V, { t: 0.045, f: f * 0.6, f1: f * 1.6, fT: 0.07, q: 1.4, a: 0.01, d: 0.08, g: 0.38 });
    tone(V, { t: 0.05, f: 190 * p, f1: 90, fT: 0.05, d: 0.05, g: 0.22 });
    noise(V, { t: 0.05, type: 'highpass', f: 5000, d: 0.01, g: 0.2 });
    return 0.2;
  },
  card_draw(V, i, p) {
    noise(V, { f: 800 * p, f1: 2800 * p, fT: 0.22, q: 1.1, a: 0.1, d: 0.16, g: 0.32 });
    noise(V, { type: 'lowpass', f: 900, a: 0.06, d: 0.18, g: 0.18 });
    noise(V, { t: 0.2, type: 'highpass', f: 3200, d: 0.028, g: 0.42 });
    tone(V, { t: 0.2, f: 1250 * p, d: 0.03, g: 0.08 });
    return 0.32;
  },
  coin(V, i, p) {
    const f0 = R(1560, 1640) * p;
    const notes = [f0, f0 * 1.3348];
    notes.forEach((f, k) => {
      partials(V, { t: k * 0.075, f, ratios: [1, 2.76, 5.4, 8.93], decays: [0.7 - k * 0.1, 0.35, 0.16, 0.08], gains: [0.45, 0.16, 0.07, 0.03], g: 0.6, wet: 0.22 });
    });
    noise(V, { type: 'highpass', f: 6500, d: 0.012, g: 0.25 });
    tone(V, { t: 0.075, f: f0 * 2.67, d: 0.4, g: 0.04, wet: 0.4 });
    return 0.9;
  },
  dice_throw(V, i, p) {
    noise(V, { f: 500, f1: 1600, fT: 0.25, q: 1.5, a: 0.06, d: 0.28, g: 0.28 * (0.5 + i * 0.5) });
    const n = 6 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const t = R(0.02, 0.36), f = R(1500, 3200) * p;
      noise(V, { t, f, q: 5, d: 0.016, g: R(0.12, 0.32) * (0.5 + i * 0.5) });
      tone(V, { t, f: f * 0.32, d: 0.025, g: R(0.04, 0.09) });
    }
    return 0.5;
  },
  dice_hit(V, i, p) {
    const f = R(640, 1120) * p, k = 0.35 + 0.65 * clamp(i, 0, 1.4);
    const bright = 1 + 0.5 * clamp(i - 0.5, 0, 1);
    tone(V, { f, d: 0.07, g: 0.42 * k });
    tone(V, { f: f * R(2.25, 2.4), d: 0.045, g: 0.24 * k });
    tone(V, { f: f * R(3.7, 4.0) * bright, d: 0.03, g: 0.14 * k });
    noise(V, { f: f * 3.2 * bright, q: 2.5, d: 0.012, g: 0.55 * k });
    tone(V, { f: f * 0.26, f1: f * 0.18, fT: 0.04, d: 0.04, g: 0.22 * k });
    return 0.12;
  },
  dice_settle(V, i, p) {
    const f = R(700, 950) * p;
    for (let k = 0; k < 3; k++) {
      const t = [0, 0.07, 0.115][k], kk = [0.5, 0.28, 0.15][k];
      tone(V, { t, f: f * R(0.97, 1.03), d: 0.06, g: 0.4 * kk });
      tone(V, { t, f: f * 2.3, d: 0.035, g: 0.2 * kk });
      noise(V, { t, f: f * 3, q: 2.5, d: 0.01, g: 0.45 * kk });
    }
    tone(V, { f: 130, f1: 80, fT: 0.08, d: 0.09, g: 0.3 });
    tone(V, { t: 0.14, f: 1568 * p, d: 0.3, g: 0.035, wet: 0.3 });
    return 0.45;
  },
  step(V, i, p) {
    noise(V, { type: 'lowpass', f: R(260, 420) * p, q: 1, a: 0.006, d: 0.08, g: 0.65 });
    noise(V, { f: R(1300, 1900), q: 1.2, a: 0.004, d: 0.03, g: 0.1 });
    tone(V, { f: R(85, 100) * p, f1: 55, fT: 0.06, d: 0.06, g: 0.3 });
    return 0.14;
  },
  hit(V, i, p) {
    const k = 0.6 + 0.4 * clamp(i, 0, 1.3);
    tone(V, { f: 170 * p, f1: 46, fT: 0.12, a: 0.001, d: 0.22, g: 0.85 * k, dist: 2 });
    noise(V, { f: 1500 * p, f1: 380, fT: 0.12, q: 0.8, d: 0.13, g: 0.6 * k, wet: 0.12 });
    noise(V, { type: 'highpass', f: 3200, d: 0.035, g: 0.32 * k });
    tone(V, { f: R(380, 430) * p, d: 0.08, g: 0.08 * k, type: 'triangle' });
    return 0.35;
  },
  crit(V, i, p) {
    tone(V, { f: 120 * p, f1: 30, fT: 0.32, a: 0.001, d: 0.55, g: 0.95, dist: 3 });
    noise(V, { type: 'lowpass', f: 1600, f1: 300, fT: 0.25, d: 0.32, g: 0.7, dist: 1.5, wet: 0.2 });
    noise(V, { type: 'highpass', f: 2800, d: 0.05, g: 0.45 });
    partials(V, { f: R(400, 440) * p, ratios: [1, 2.76, 5.4, 8.93], decays: [1.1, 0.7, 0.45, 0.25], gains: [0.3, 0.2, 0.12, 0.06], g: 0.5, wet: 0.35 });
    const base = 1568 * p;
    [0, 2, 4, 5, 7, 8].forEach((s, k) => tone(V, { t: 0.06 + k * 0.035, f: base * CHIME[s], d: 0.45, g: 0.055, wet: 0.7 }));
    noise(V, { t: 0.05, type: 'highpass', f: 7000, a: 0.05, d: 0.5, g: 0.06, wet: 0.5 });
    return 1.4;
  },
  miss(V, i, p) {
    const W = panSweep(V, R(-0.6, -0.3), R(0.3, 0.6), 0.3);
    noise(W, { f: 2400 * p, f1: 420, fT: 0.28, q: 2.2, a: 0.05, d: 0.25, g: 0.6, wet: 0.15 });
    noise(W, { f: 900 * p, f1: 300, fT: 0.25, q: 1, a: 0.04, d: 0.2, g: 0.2 });
    return 0.45;
  },
  ko(V, i, p) {
    tone(V, { f: 85 * p, f1: 28, fT: 0.6, a: 0.002, d: 0.9, g: 0.95, dist: 2.5, wet: 0.2 });
    noise(V, { type: 'lowpass', f: 600, f1: 150, fT: 0.4, d: 0.5, g: 0.55, wet: 0.25 });
    tone(V, { type: 'sawtooth', f: 320 * p, f1: 55, fT: 0.85, a: 0.01, d: 0.85, g: 0.16, filter: 'lowpass', ff: 1200, ff1: 200, wet: 0.35 });
    tone(V, { t: 0.2, f: 75 * p, f1: 35, fT: 0.15, d: 0.2, g: 0.45 });
    noise(V, { t: 0.2, type: 'lowpass', f: 500, d: 0.12, g: 0.3 });
    return 1.3;
  },
  whoosh(V, i, p) {
    const dir = rnd() < 0.5 ? 1 : -1;
    const W = panSweep(V, -0.7 * dir, 0.7 * dir, 0.35);
    noise(W, { f: 380 * p, f1: 2600 * p, fT: 0.15, f2: 600 * p, fT2: 0.36, q: 2.8, a: 0.12, d: 0.24, g: 0.7 * (0.6 + 0.4 * i), wet: 0.15 });
    noise(W, { type: 'lowpass', f: 700, a: 0.1, d: 0.2, g: 0.15 });
    return 0.5;
  },
  vs(V, i, p) {
    tone(V, { f: 105 * p, f1: 34, fT: 0.4, d: 0.75, g: 0.9, dist: 2, wet: 0.25 });
    const f = R(480, 530) * p;
    partials(V, { f, ratios: [1, 2.76, 5.4, 8.93, 13.34], decays: [1.6, 1.1, 0.7, 0.4, 0.25], gains: [0.35, 0.25, 0.16, 0.09, 0.05], g: 0.55, wet: 0.45 });
    partials(V, { t: 0.04, f: f * 1.059, ratios: [1, 2.76, 5.4], decays: [1.2, 0.8, 0.5], gains: [0.2, 0.14, 0.08], g: 0.5, wet: 0.5 });
    noise(V, { type: 'highpass', f: 2600, d: 0.09, g: 0.55 });
    noise(V, { f: 4000, f1: 9000, fT: 0.4, q: 3, a: 0.02, d: 0.5, g: 0.06, wet: 0.5 });
    return 1.8;
  },
  heal(V, i, p) {
    const base = 523.25 * p;
    [1, 1.25, 1.5, 2, 2.5, 3].forEach((r, k) => {
      tone(V, { t: k * 0.07, f: base * r, a: 0.01, d: 0.75, g: 0.14, type: 'triangle', wet: 0.6 });
      tone(V, { t: k * 0.07, f: base * r * 2, a: 0.005, d: 0.35, g: 0.04, wet: 0.6 });
    });
    noise(V, { type: 'highpass', f: 6000, a: 0.35, d: 0.6, g: 0.05, wet: 0.6 });
    tone(V, { f: base / 2, a: 0.15, d: 0.9, g: 0.1, wet: 0.4 });
    return 1.5;
  },
  hurt(V, i, p) {
    tone(V, { f: 150 * p, f1: 58, fT: 0.12, d: 0.16, g: 0.75, dist: 1.5 });
    noise(V, { type: 'lowpass', f: 900, d: 0.1, g: 0.4 });
    tone(V, { type: 'sawtooth', f: R(210, 240) * p, f1: 130, fT: 0.16, a: 0.01, d: 0.15, g: 0.3, filter: 'bandpass', ff: 750, ff1: 420, q: 3.5 });
    return 0.32;
  },
  trap(V, i, p) {
    noise(V, { type: 'highpass', f: 4200, d: 0.01, g: 0.45 });
    noise(V, { t: 0.06, type: 'highpass', f: 3800, d: 0.012, g: 0.5 });
    partials(V, { t: 0.12, f: 690 * p, ratios: [1, 2.76, 5.4, 7.1], decays: [0.35, 0.25, 0.15, 0.1], gains: [0.3, 0.22, 0.12, 0.06], g: 0.65, wet: 0.25 });
    noise(V, { t: 0.12, type: 'highpass', f: 2500, d: 0.05, g: 0.5 });
    tone(V, { t: 0.12, f: 210 * p, f1: 48, fT: 0.4, d: 0.45, g: 0.65, dist: 2 });
    for (let k = 0; k < 7; k++) noise(V, { t: 0.18 + k * R(0.03, 0.05), f: R(3000, 5000), q: 6, d: 0.02, g: 0.2 * (1 - k / 8) });
    return 0.8;
  },
  boss_roar(V, i, p) {
    const { ctx } = V;
    const t = V.t, f0 = R(52, 62) * p, dur = 2.1;
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass'; f1.Q.value = 3; f2.Q.value = 4;
    f1.frequency.setValueAtTime(320, t); f1.frequency.linearRampToValueAtTime(760, t + 0.45); f1.frequency.linearRampToValueAtTime(330, t + dur);
    f2.frequency.setValueAtTime(1050, t); f2.frequency.linearRampToValueAtTime(1300, t + 0.45); f2.frequency.linearRampToValueAtTime(800, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 2800;
    const ws = ctx.createWaveShaper(); ws.curve = distCurve(ctx, 6);
    const pre = gainNode(ctx, 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.22); g.gain.setValueAtTime(1, t + 1.2); g.gain.linearRampToValueAtTime(0, t + dur);
    pre.connect(ws); ws.connect(f1); ws.connect(f2); f1.connect(lp); f2.connect(gainNode(ctx, 0.6, lp)); lp.connect(g);
    sendTo(V, g, 0.6, 0.35);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = R(6, 8); lg.gain.value = f0 * 0.06; lfo.connect(lg);
    for (const det of [-14, 0, 11]) {
      const o = ctx.createOscillator();
      o.type = det ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(f0 * 0.85, t); o.frequency.linearRampToValueAtTime(f0 * 1.3, t + 0.4); o.frequency.linearRampToValueAtTime(f0 * 0.75, t + dur);
      o.detune.value = det; lg.connect(o.frequency);
      o.connect(gainNode(ctx, 0.35, pre)); o.start(t); o.stop(t + dur + 0.05);
    }
    lfo.start(t); lfo.stop(t + dur + 0.05);
    noise(V, { f: 900, q: 0.7, a: 0.2, hold: 0.9, d: 0.9, g: 0.35, dist: 3, wet: 0.3 });
    tone(V, { f: f0 / 2, a: 0.15, hold: 1.0, d: 0.8, g: 0.5 });
    tone(V, { f: 70, f1: 30, fT: 0.6, d: 0.7, g: 0.6, dist: 2 });
    return dur + 0.4;
  },
  boss_skill(V, i, p) {
    [65.4, 69.3, 98, 103.8].forEach((f) => tone(V, { type: 'sawtooth', f: f * p, a: 0.7, d: 0.25, g: 0.1, filter: 'lowpass', ff: 250, ff1: 1800, ffT: 0.7, wet: 0.3 }));
    noise(V, { f: 200, f1: 2600, fT: 0.75, q: 2, a: 0.72, d: 0.06, g: 0.3, wet: 0.3 });
    tone(V, { t: 0.75, f: 95 * p, f1: 30, fT: 0.4, d: 0.65, g: 0.9, dist: 2.5, wet: 0.35 });
    noise(V, { t: 0.75, type: 'lowpass', f: 1200, f1: 200, fT: 0.4, d: 0.4, g: 0.5, wet: 0.3 });
    partials(V, { t: 0.75, f: 233 * p, ratios: [1, 1.06, 2.76, 2.9], decays: [1.2, 1.1, 0.6, 0.5], gains: [0.3, 0.3, 0.15, 0.12], g: 0.45, wet: 0.6 });
    return 2;
  },
  relic(V, i, p) {
    const n = [261.63, 392, 523.25, 659.26, 783.99].map((f) => f * p);
    tone(V, { f: 95, f1: 55, fT: 0.4, d: 0.5, g: 0.6, wet: 0.2 });
    n.forEach((f, k) => {
      const last = k === n.length - 1;
      brass(V, { t: k * 0.11, f, a: 0.03, hold: last ? 0.8 : 0.06, d: last ? 0.9 : 0.25, g: last ? 0.16 : 0.12, hi: 3200, vib: last, wet: 0.4 });
      bell(V, { t: k * 0.11, f: f * 2, d: 1.2, g: 0.06, index: 1.5, ratio: 3.5, wet: 0.5 });
    });
    brass(V, { t: 0.44, f: n[2], a: 0.05, hold: 0.8, d: 0.9, g: 0.1, wet: 0.4 });
    brass(V, { t: 0.44, f: n[3], a: 0.05, hold: 0.8, d: 0.9, g: 0.08, wet: 0.4 });
    for (let k = 0; k < 12; k++) tone(V, { t: 0.4 + k * 0.09 + R(0, 0.04), f: 2093 * p * pick(CHIME), d: 0.4, g: 0.035, wet: 0.7 });
    noise(V, { t: 0.4, type: 'highpass', f: 7000, a: 0.3, d: 1.2, g: 0.05, wet: 0.6 });
    return 2.6;
  },
  victory(V, i, p) {
    const C = 261.63 * p;
    // triplet pickup into a held major chord, timpani roll underneath
    [0, 0.12, 0.24].forEach((t) => brass(V, { t, f: C * 1.5, a: 0.02, hold: 0.04, d: 0.12, g: 0.13, wet: 0.3 }));
    [[1, 0.16], [1.25, 0.12], [1.5, 0.12], [2, 0.13]].forEach(([r, g]) => brass(V, { t: 0.36, f: C * r, a: 0.04, hold: 1.0, d: 1.0, g, vib: true, hi: 3400, wet: 0.45 }));
    brass(V, { t: 0.36, f: C / 2, a: 0.05, hold: 1.0, d: 1.0, g: 0.12, hi: 1200, wet: 0.3 });
    for (let k = 0; k < 9; k++) tone(V, { t: k * 0.04, f: 98, f1: 70, fT: 0.1, d: 0.25, g: 0.15 + k * 0.03 });
    tone(V, { t: 0.36, f: 90, f1: 45, fT: 0.3, d: 0.8, g: 0.7, wet: 0.3 });
    partials(V, { t: 0.36, f: 1046 * p, ratios: [1, 2.76, 5.4], decays: [1.6, 1, 0.5], gains: [0.2, 0.1, 0.05], g: 0.4, wet: 0.5 });
    return 2.8;
  },
  defeat(V, i, p) {
    const G = 196 * p;
    [[1, 0], [0.794, 0.38], [0.667, 0.76]].forEach(([r, t]) => brass(V, { t, f: G * r * 2, a: 0.06, hold: 0.22, d: 0.3, g: 0.12, hi: 1800, wet: 0.4 }));
    [0.5, 0.594, 0.749].forEach((r) => brass(V, { t: 1.14, f: G * r * 2, a: 0.1, hold: 0.6, d: 1.2, g: 0.1, lo: 300, hi: 1200, wet: 0.5 }));
    tone(V, { t: 1.14, f: 65.4 * p, a: 0.08, hold: 0.5, d: 1.2, g: 0.4, wet: 0.3 });
    tone(V, { t: 1.14, f: 80, f1: 40, fT: 0.4, d: 0.8, g: 0.6, wet: 0.3 });
    return 3;
  },
  pvp(V, i, p) {
    const f = R(500, 560) * p;
    noise(V, { f: 600, f1: 3000, fT: 0.1, q: 2, a: 0.08, d: 0.05, g: 0.3 });
    [0.1, 0.24].forEach((t, k) => {
      partials(V, { t, f: f * (k ? 1.12 : 1), ratios: [1, 2.76, 5.4, 8.93], decays: [1, 0.7, 0.45, 0.25], gains: [0.3, 0.22, 0.13, 0.07], g: 0.55, wet: 0.4 });
      noise(V, { t, type: 'highpass', f: 2800, d: 0.06, g: 0.5 });
    });
    tone(V, { t: 0.1, f: 110, f1: 40, fT: 0.3, d: 0.5, g: 0.8, dist: 2, wet: 0.2 });
    return 1.4;
  },
  guild(V, i, p) {
    const D = 146.83 * p;
    brass(V, { f: D, a: 0.08, hold: 0.25, d: 0.25, g: 0.16, hi: 1800, wet: 0.45 });
    brass(V, { t: 0.42, f: D * 1.5, a: 0.06, hold: 0.55, d: 0.7, g: 0.16, hi: 2200, vib: true, wet: 0.5 });
    brass(V, { t: 0.42, f: D, a: 0.06, hold: 0.55, d: 0.7, g: 0.09, hi: 1400, wet: 0.5 });
    tone(V, { f: 80, f1: 45, fT: 0.3, d: 0.5, g: 0.6, wet: 0.25 });
    tone(V, { t: 0.42, f: 80, f1: 45, fT: 0.3, d: 0.6, g: 0.7, wet: 0.25 });
    for (let k = 0; k < 10; k++) noise(V, { t: 0.1 + k * 0.07, type: 'lowpass', f: 700, d: 0.05, g: 0.1 * (1 - k / 11) });
    return 1.9;
  },
  scroll(V, i, p) {
    noise(V, { type: 'lowpass', f: 900, a: 0.15, d: 0.4, g: 0.25 });
    for (let k = 0; k < 26; k++) noise(V, { t: k * 0.022 + R(0, 0.015), f: R(1800, 4200) * p, q: R(1.5, 4), d: R(0.008, 0.02), g: R(0.08, 0.3) * (k < 20 ? 1 : (26 - k) / 6) });
    noise(V, { t: 0.55, type: 'lowpass', f: 400, d: 0.08, g: 0.4 });
    return 0.75;
  },
  error(V, i, p) {
    [0, 0.13].forEach((t) => {
      tone(V, { t, type: 'square', f: 175 * p, a: 0.005, hold: 0.05, d: 0.05, g: 0.18, filter: 'lowpass', ff: 1100 });
      tone(V, { t, type: 'square', f: 185 * p, a: 0.005, hold: 0.05, d: 0.05, g: 0.12, filter: 'lowpass', ff: 1100 });
    });
    return 0.32;
  },
  turn(V, i, p) {
    const f = R(386, 398) * p;
    partials(V, { f, ratios: [1, 2, 2.76, 4.07], decays: [1.4, 0.9, 0.6, 0.35], gains: [0.3, 0.12, 0.08, 0.04], g: 0.6, a: 0.004, wet: 0.45 });
    partials(V, { t: 0.13, f: f * 1.5, ratios: [1, 2, 2.76], decays: [1.6, 1, 0.6], gains: [0.3, 0.1, 0.06], g: 0.6, a: 0.004, wet: 0.45 });
    tone(V, { f: f / 2, a: 0.04, d: 1, g: 0.1, wet: 0.3 });
    return 1.8;
  },
};

// ---------------------------------------------------------------- procedural music
const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], ionian: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
// Layer names used in `form` (each entry = active layers for a 4-bar block).
export const THEMES = {
  heroic: { bpm: 100, root: 38, mode: 'mixolydian', prog: [0, 0, 6, 3, 0, 5, 3, 4], gain: 1.0,
    pad: { g: 0.05, ff: 1400 }, bass: { pat: 'X.......x.x.....', g: 0.24 },
    drums: { taiko: 'X.......x...X...', snare: '....x.......x..o', hat: 'x.x.x.x.x.x.x.x.' },
    lead: { inst: 'brass', oct: 2, g: 0.13, range: [0, 9], restP: 0.1 }, counter: { inst: 'bell', oct: 3, g: 0.05 },
    form: [['pad', 'bass', 'drums'], ['pad', 'bass', 'drums', 'lead'], ['pad', 'bass', 'drums', 'lead', 'counter'], ['pad', 'drums', 'lead2'], ['pad', 'bass', 'drums', 'lead']] },
  tavern: { bpm: 112, root: 43, mode: 'ionian', prog: [0, 3, 4, 0, 5, 3, 4, 4], gain: 1.5, swing: 0.12,
    pad: { g: 0.03, ff: 900 }, bass: { pat: 'X...x...X...x...', g: 0.2, inst: 'pluck' },
    arp: { pat: 'x.x.x.x.x.x.x.x.', g: 0.11, oct: 2, inst: 'pluck' },
    drums: { dum: 'X.....x.X.......', tek: '....x.......x...', shaker: 'x.o.x.o.x.o.x.o.' },
    lead: { inst: 'flute', oct: 2, g: 0.09, range: [2, 11], restP: 0.15 },
    form: [['pad', 'bass', 'arp'], ['pad', 'bass', 'arp', 'drums', 'lead'], ['bass', 'arp', 'drums', 'lead2'], ['pad', 'bass', 'arp', 'drums', 'lead']] },
  crypt: { bpm: 76, root: 45, mode: 'aeolian', prog: [0, 5, 3, 4], gain: 1.45,
    choir: { g: 0.035 }, drone: { g: 0.09 }, bass: { pat: 'X...............', g: 0.2 },
    drums: { boom: 'X...............', tek: '........x.......' },
    lead: { inst: 'bell', oct: 3, g: 0.07, range: [0, 8], restP: 0.35 }, counter: { inst: 'pluck', oct: 2, g: 0.14 },
    form: [['choir', 'drone'], ['choir', 'drone', 'drums', 'lead'], ['choir', 'bass', 'drums', 'lead', 'counter'], ['choir', 'drone', 'lead2']] },
  sand: { bpm: 96, root: 38, mode: 'hijaz', prog: [0, 0, 1, 0, 6, 1, 0, 0], gain: 1.15, swing: 0.06,
    drone: { g: 0.09 }, pad: { g: 0.035, ff: 900 }, hive: { g: 0.025 }, wind: { g: 0.05 },
    bass: { pat: 'X.....x...X.....', g: 0.2 },
    drums: { dum: 'X.....x...X.....', tek: '...x..x.x..x..xx', shaker: 'x.o.x.o.x.o.x.oo' },
    lead: { inst: 'pluck', oct: 2, g: 0.2, range: [0, 10], restP: 0.12, orn: 0.35 }, counter: { inst: 'bell', oct: 3, g: 0.04 },
    form: [['drone', 'pad', 'wind', 'hive'], ['drone', 'pad', 'drums', 'wind'], ['drone', 'pad', 'drums', 'bass', 'lead'], ['pad', 'drums', 'bass', 'lead', 'counter', 'hive'], ['drone', 'pad', 'drums', 'bass', 'lead2'], ['drone', 'pad', 'wind', 'lead']] },
  forge: { bpm: 84, root: 40, mode: 'phrygian', prog: [0, 0, 1, 0, 5, 6, 1, 0], gain: 0.78,
    choir: { g: 0.035 }, drone: { g: 0.065 }, embers: { g: 0.05 }, stab: { pat: 'X...............', g: 0.09 },
    bass: { pat: 'X..x..x.X.......', g: 0.24 },
    drums: { taiko: 'X..x..x.X...x...', anvil: '....X.......X..o', boom: 'X...............' },
    lead: { inst: 'brass', oct: 1, g: 0.12, range: [0, 7], restP: 0.25 },
    form: [['drone', 'embers', 'drums'], ['drone', 'choir', 'drums', 'bass', 'embers'], ['choir', 'drums', 'bass', 'stab', 'lead'], ['choir', 'drums', 'bass', 'stab', 'lead2', 'embers'], ['drone', 'choir', 'drums', 'embers']] },
  mire: { bpm: 70, root: 43, mode: 'dorian', prog: [0, 0, 3, 6, 0, 4, 3, 0], gain: 1.45,
    drone: { g: 0.08 }, pad: { g: 0.035, ff: 700 }, wind: { g: 0.04 }, bass: { pat: 'X.......x.......', g: 0.18, inst: 'pluck' },
    drums: { dum: 'X.........x.....', shaker: '..o...o...o...o.' },
    lead: { inst: 'flute', oct: 2, g: 0.08, range: [0, 8], restP: 0.3 }, counter: { inst: 'pluck', oct: 2, g: 0.13 },
    form: [['drone', 'pad', 'wind'], ['drone', 'pad', 'bass', 'drums', 'counter'], ['pad', 'bass', 'drums', 'lead'], ['drone', 'pad', 'bass', 'drums', 'lead2', 'counter']] },
  sanctum: { bpm: 68, root: 35, mode: 'harmonic', prog: [0, 5, 3, 4], gain: 1.5,
    choir: { g: 0.045 }, drone: { g: 0.07 }, swell: { g: 0.06 }, bass: { pat: 'X...............', g: 0.22 },
    drums: { boom: 'X.......x.......', hat: '..o...o...o...o.', tek: '............x...' },
    lead: { inst: 'bell', oct: 3, g: 0.075, range: [0, 9], restP: 0.3 }, counter: { inst: 'choirlead', oct: 2, g: 0.05 },
    form: [['choir', 'drone', 'swell'], ['choir', 'drone', 'drums', 'lead'], ['choir', 'bass', 'drums', 'lead', 'swell'], ['choir', 'drone', 'bass', 'drums', 'lead2', 'counter'], ['choir', 'drone', 'swell']] },
  boss: { bpm: 138, root: 40, mode: 'phrygian', prog: [0, 0, 1, 0, 5, 6, 1, 4], gain: 0.62,
    choir: { g: 0.035 }, stab: { pat: 'X.....X.....X...', g: 0.09 }, bass: { pat: 'x.x.x.x.x.x.x.x.', g: 0.2 },
    drums: { kick: 'X..x..x.X.x...x.', snare: '....X.......X...', taiko: 'X.......X.....x.', hat: 'x.xxx.xxx.xxx.xx', anvil: '..............X.' },
    lead: { inst: 'brass', oct: 2, g: 0.11, range: [0, 8], restP: 0.08 },
    form: [['choir', 'bass', 'drums'], ['choir', 'bass', 'drums', 'stab', 'lead'], ['choir', 'bass', 'drums', 'stab', 'lead2'], ['bass', 'drums', 'stab', 'lead']] },
};

const RHYTHMS = [[4, 4, 4, 4], [6, 2, 4, 4], [8, 4, 4], [4, 2, 2, 8], [2, 2, 4, 8], [12, 4], [8, 8], [4, 4, 8], [3, 3, 2, 8], [6, 2, 8]];

class ProcTrack {
  constructor(ctx, dest, verb, themeId, seed) {
    this.ctx = ctx;
    this.th = THEMES[themeId] || THEMES.crypt;
    this.rng = mulberry(seed ?? (Math.random() * 1e9) | 0);
    this.out = gainNode(ctx, 0, dest); // dry fade
    this.wout = gainNode(ctx, 0, verb); // reverb-send fade (so crossfades also silence the send)
    this.mix = gainNode(ctx, 0.72 * (this.th.gain || 1), this.out);
    this.V = { ctx, out: this.mix, wet: gainNode(ctx, 0.6 * (this.th.gain || 1), this.wout), t: 0 };
    this.stepDur = 60 / this.th.bpm / 4;
    this.n = 0; this.next = 0; this.timer = null; this.phrases = {}; this.mel = null; this.ctr = null;
  }
  r(a, b) { return a + (b - a) * this.rng(); }
  freq(deg, oct) {
    const m = MODES[this.th.mode];
    const o = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7;
    return midi(this.th.root + 12 * (oct + o) + m[i]);
  }
  chordDeg(bar) { const p = this.th.prog; return p[Math.floor(bar / 2) % p.length]; }
  phrase(chordAt) {
    const th = this.th, L = th.lead, [lo, hi] = L.range;
    const ev = [];
    let deg = chordAt(0) + pick3(this.rng, [0, 2, 4]);
    deg = clamp(deg, lo, hi);
    for (let bar = 0; bar < 4; bar++) {
      const rh = RHYTHMS[Math.floor(this.rng() * RHYTHMS.length)];
      let s = 0;
      rh.forEach((len, k) => {
        const strong = s % 8 === 0;
        const ch = chordAt(bar);
        if (k > 0 || bar > 0) {
          const steps = [-2, -1, -1, 1, 1, 2, -3, 3, 0];
          deg = clamp(deg + steps[Math.floor(this.rng() * steps.length)], lo, hi);
        }
        if (strong) { // snap to nearest chord tone on strong beats
          let best = deg, bd = 99;
          for (let c = lo; c <= hi; c++) { if ([0, 2, 4].includes(((c - ch) % 7 + 7) % 7) && Math.abs(c - deg) < bd) { bd = Math.abs(c - deg); best = c; } }
          deg = best;
        }
        const rest = !strong && this.rng() < L.restP;
        if (!rest) ev.push({ step: bar * 16 + s, len, deg });
        s += len;
      });
    }
    const last = ev[ev.length - 1];
    if (last) { last.deg = chordAt(3) + (this.rng() < 0.5 ? 0 : 4); last.len = Math.max(last.len, 8); }
    return ev;
  }
  playNote(inst, t, f, dur, g, orn) {
    const V = { ...this.V, t };
    switch (inst) {
      case 'pluck':
        if (orn && this.rng() < orn) pluck(V, { t: -0.06, f: f * 1.122, g: g * 0.5, t60: 0.5, len: 0.06 });
        pluck(V, { f, g, t60: 1.4, bright: 0.6, len: dur + 0.25, wet: 0.5 }); break;
      case 'bell': bell(V, { f, g, d: Math.max(1.2, dur * 1.5), index: 1.8, ratio: 3.5, wet: 0.9, dry: 0.7 }); break;
      case 'brass': brass(V, { f, a: 0.05, hold: Math.max(0.02, dur - 0.1), d: 0.35, g, vib: dur > 0.4, hi: 2400, wet: 0.6 }); break;
      case 'flute': flute(V, f, dur, g); break;
      case 'choirlead': choir(V, [f], dur, g); break;
      default: tone(V, { f, d: dur, g });
    }
  }
  step(n, t) {
    const th = this.th, ctx = this.ctx, sd = this.stepDur;
    const bar = Math.floor(n / 16), s = n % 16, block = Math.floor(bar / 4);
    const act = new Set(th.form[block % th.form.length]);
    if (s % 2 === 1 && th.swing) t += th.swing * sd;
    const V = { ...this.V, t };
    const cd = this.chordDeg(bar);
    const chord = [cd, cd + 2, cd + 4];
    const chordLen = sd * 32;
    const vel = (pat) => { const c = pat[s % pat.length]; return c === 'X' ? 1 : c === 'x' ? 0.72 : c === 'o' ? 0.42 : 0; };
    const hum = () => this.r(-0.006, 0.006);
    // --- sustained layers on chord changes
    if (s === 0 && bar % 2 === 0) {
      if (act.has('pad') && th.pad) padChord(V, chord.map((d) => this.freq(d, 2)), chordLen, th.pad.g, th.pad.ff);
      if (act.has('choir') && th.choir) choir(V, chord.map((d) => this.freq(d, 2)), chordLen, th.choir.g);
      if (act.has('drone') && th.drone) drone(V, this.freq(0, 0), chordLen, th.drone.g);
      if (act.has('hive') && th.hive) hive(V, this.freq(0, 1), chordLen, th.hive.g);
      if (act.has('wind') && th.wind) noise(V, { type: 'bandpass', f: this.r(300, 600), f1: this.r(900, 1600), fT: chordLen * 0.5, f2: 400, fT2: chordLen, q: 2.5, a: chordLen * 0.4, d: chordLen * 0.6, g: th.wind.g, wet: 0.5 });
      if (act.has('swell') && th.swell) noise(V, { type: 'bandpass', f: 200, f1: 3000, fT: chordLen * 0.48, q: 3, a: chordLen * 0.45, d: 0.4, g: th.swell.g, wet: 0.8, t: chordLen * 0.45 });
    }
    if (act.has('embers') && th.embers && this.rng() < 0.25) noise(V, { t: hum(), type: 'highpass', f: this.r(2500, 6000), d: 0.01, g: th.embers.g * this.r(0.3, 1), wet: 0.4 });
    // --- bass
    if ((act.has('bass')) && th.bass) {
      const v = vel(th.bass.pat);
      if (v) {
        const f = this.freq(cd, 1);
        if (th.bass.inst === 'pluck') pluck(V, { f, g: th.bass.g * v * 1.3, t60: 1.2, bright: 0.35, ff: 900, len: sd * 4 });
        else bassNote(V, f, sd * 3, th.bass.g * v);
      }
    }
    if (act.has('stab') && th.stab) {
      const v = vel(th.stab.pat);
      if (v) chord.forEach((d) => brass(V, { f: this.freq(d, 2), a: 0.015, hold: 0.06, d: 0.3, g: th.stab.g * v, hi: 2000, wet: 0.5 }));
    }
    if (act.has('arp') && th.arp) {
      const v = vel(th.arp.pat);
      if (v) { const k = (s / 2) | 0; const d = chord[[0, 1, 2, 1][k % 4]] + (k % 8 >= 4 ? 7 : 0); this.playNote(th.arp.inst, t + hum(), this.freq(d, th.arp.oct), sd * 2, th.arp.g * v); }
    }
    // --- drums
    if (act.has('drums') && th.drums) {
      for (const [name, pat] of Object.entries(th.drums)) {
        const v = vel(pat);
        if (v) DRUMS[name]({ ...V, t: t + hum() }, v * this.r(0.88, 1.05), this);
      }
    }
    // --- melody
    if (s === 0 && bar % 4 === 0) {
      const chordAt = (b) => this.chordDeg(bar + b);
      const useB = act.has('lead2');
      const key = useB ? 'B' : 'A';
      if (!this.phrases[key] || this.rng() < 0.25) this.phrases[key] = this.phrase(chordAt);
      this.mel = (act.has('lead') || act.has('lead2')) ? new Map(this.phrases[key].map((e) => [e.step, e])) : null;
      if (this.mel && this.rng() < 0.4) { // vary the tail of the phrase
        const tail = this.phrase(chordAt).filter((e) => e.step >= 48);
        for (const k of [...this.mel.keys()]) if (k >= 48) this.mel.delete(k);
        tail.forEach((e) => this.mel.set(e.step, e));
      }
      this.ctr = act.has('counter') && th.counter ? new Map(this.phrase(chordAt).filter((_, k) => k % 2 === 0).map((e) => [e.step, e])) : null;
    }
    const ib = (bar % 4) * 16 + s;
    const e = this.mel && this.mel.get(ib);
    if (e) this.playNote(th.lead.inst, t + hum(), this.freq(e.deg, th.lead.oct), e.len * sd, th.lead.g, th.lead.orn);
    const c = this.ctr && this.ctr.get(ib);
    if (c) this.playNote(th.counter.inst, t + hum(), this.freq(c.deg + 2, th.counter.oct), c.len * sd, th.counter.g);
  }
  pump(until) {
    while (this.next < until) { this.step(this.n, this.next); this.n++; this.next += this.stepDur; }
  }
  start(t, fade = XFADE, live = true) {
    this.next = t + 0.05;
    for (const g of [this.out, this.wout]) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade); }
    if (live) {
      const tick = () => {
        const now = this.ctx.currentTime;
        if (this.next < now - 0.15) { const skip = Math.ceil((now - this.next) / this.stepDur); this.n += skip; this.next += skip * this.stepDur; }
        this.pump(now + 0.3);
      };
      tick();
      this.timer = setInterval(tick, 60);
    }
  }
  stop(fade = XFADE) {
    const t = this.ctx.currentTime;
    this.stopped = true;
    for (const g of [this.out, this.wout]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
    }
    setTimeout(() => { clearInterval(this.timer); this.out.disconnect(); this.wout.disconnect(); }, (fade + 0.3) * 1000);
  }
}
function pick3(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function padChord(V, freqs, dur, g, ff = 1000) {
  const { ctx, t } = V;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.5;
  fl.frequency.setValueAtTime(ff * 0.5, t); fl.frequency.linearRampToValueAtTime(ff, t + dur * 0.4); fl.frequency.linearRampToValueAtTime(ff * 0.6, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + Math.min(1.5, dur * 0.3)); gn.gain.setValueAtTime(g, t + dur - 0.2); gn.gain.linearRampToValueAtTime(0, t + dur + 1.2);
  fl.connect(gn); sendTo(V, gn, 1, 0.8);
  freqs.forEach((f) => [-9, 8].forEach((det) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det + (Math.random() - 0.5) * 4; o.connect(fl); o.start(t); o.stop(t + dur + 1.3); }));
}
const VOWELS = [[800, 1150, 2900], [400, 1600, 2700], [600, 1000, 2600]];
function choir(V, freqs, dur, g) {
  const { ctx, t } = V;
  const vw = VOWELS[Math.floor(Math.random() * VOWELS.length)];
  const sum = ctx.createGain();
  sum.gain.setValueAtTime(0, t); sum.gain.linearRampToValueAtTime(g, t + Math.min(1.2, dur * 0.3)); sum.gain.setValueAtTime(g, t + dur - 0.2); sum.gain.linearRampToValueAtTime(0, t + dur + 1.2);
  const src = ctx.createGain();
  vw.forEach((fq, k) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fq; b.Q.value = 6 + k * 3; src.connect(b); b.connect(gainNode(ctx, [1.6, 0.9, 0.45][k], sum)); });
  sendTo(V, sum, 0.8, 1);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 4.8; lfo.start(t); lfo.stop(t + dur + 1.3);
  freqs.forEach((f) => [-6, 7].forEach((det) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const lg = gainNode(ctx, f * 0.005); lfo.connect(lg); lg.connect(o.frequency);
    o.connect(src); o.start(t); o.stop(t + dur + 1.3);
  }));
}
function drone(V, f, dur, g) {
  const { ctx, t } = V;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + 1.5); gn.gain.setValueAtTime(g, t + dur - 0.2); gn.gain.linearRampToValueAtTime(0, t + dur + 1.5);
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500; fl.connect(gn);
  sendTo(V, gn, 1, 0.4);
  [[f, 'sine', 0], [f * 1.5, 'triangle', 0.35], [f * 2, 'triangle', 0.25], [f * 1.003, 'sawtooth', 0.12]].forEach(([fr, ty, lv]) => {
    const o = ctx.createOscillator(); o.type = ty; o.frequency.value = fr;
    o.connect(gainNode(ctx, lv || 1, fl)); o.start(t); o.stop(t + dur + 1.6);
  });
}
function hive(V, f, dur, g) {
  const { ctx, t } = V;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
  const am = ctx.createOscillator(); am.frequency.value = 23; const amg = gainNode(ctx, 0.5);
  const gn = ctx.createGain(); gn.gain.value = 0;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 4;
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0, t); env2.gain.linearRampToValueAtTime(g, t + dur * 0.5); env2.gain.linearRampToValueAtTime(0, t + dur);
  am.connect(amg); amg.connect(gn.gain); gn.gain.value = 0.5;
  o.connect(gn); gn.connect(bp); bp.connect(env2); sendTo(V, env2, 0.7, 0.6);
  o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1);
}
function bassNote(V, f, dur, g) {
  tone(V, { f, a: 0.008, d: dur, g, type: 'triangle', filter: 'lowpass', ff: 600 });
  tone(V, { f: f / 2, a: 0.008, d: dur, g: g * 0.6 });
}
function flute(V, f, dur, g) {
  const { ctx, t } = V;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5;
  const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.01, t + Math.min(0.5, dur));
  lfo.connect(lg); lg.connect(o.frequency);
  const gn = ctx.createGain();
  const end = t + Math.max(0.12, dur);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + 0.07); gn.gain.setValueAtTime(g * 0.85, end - 0.05); gn.gain.linearRampToValueAtTime(0, end + 0.15);
  o.connect(gn); o2.connect(gainNode(ctx, 0.08, gn));
  sendTo(V, gn, 1, 0.7);
  noise(V, { f: f * 2, q: 2, a: 0.04, d: 0.12, g: g * 0.25, wet: 0.5 });
  [o, o2, lfo].forEach((n) => { n.start(t); n.stop(end + 0.2); });
}
const DRUMS = {
  kick(V, v) { tone(V, { f: 140, f1: 42, fT: 0.09, d: 0.28, g: 0.6 * v, dist: 1.4 }); noise(V, { type: 'lowpass', f: 3000, d: 0.01, g: 0.15 * v }); },
  taiko(V, v) { tone(V, { f: 95, f1: 52, fT: 0.18, d: 0.6, g: 0.55 * v, wet: 0.3 }); noise(V, { type: 'lowpass', f: 450, d: 0.16, g: 0.35 * v, wet: 0.3 }); noise(V, { type: 'bandpass', f: 1600, q: 1, d: 0.02, g: 0.1 * v }); },
  boom(V, v) { tone(V, { f: 62, f1: 34, fT: 0.6, d: 1.4, g: 0.5 * v, wet: 0.5 }); noise(V, { type: 'lowpass', f: 250, d: 0.5, g: 0.25 * v, wet: 0.6 }); },
  snare(V, v) { noise(V, { type: 'bandpass', f: 1900, q: 0.8, d: 0.16, g: 0.32 * v, wet: 0.35 }); tone(V, { f: 200, f1: 160, fT: 0.05, d: 0.08, g: 0.2 * v }); },
  hat(V, v) { noise(V, { type: 'highpass', f: 7500, d: 0.035, g: 0.09 * v }); },
  shaker(V, v) { noise(V, { type: 'highpass', f: 5500, a: 0.012, d: 0.04, g: 0.07 * v }); },
  dum(V, v) { tone(V, { f: 120, f1: 72, fT: 0.12, d: 0.32, g: 0.45 * v, wet: 0.25 }); noise(V, { type: 'lowpass', f: 700, d: 0.06, g: 0.18 * v }); },
  tek(V, v) { noise(V, { type: 'bandpass', f: 3000, q: 1.5, d: 0.04, g: 0.25 * v, wet: 0.25 }); tone(V, { f: 620, d: 0.035, g: 0.08 * v }); },
  anvil(V, v, tr) { const f = tr && tr.rng() < 0.5 ? 1180 : 1320; partials(V, { f, ratios: [1, 2.76, 5.4, 8.93], decays: [0.9, 0.55, 0.35, 0.2], gains: [0.25, 0.18, 0.1, 0.05], g: 0.28 * v, wet: 0.45 }); noise(V, { type: 'highpass', f: 3500, d: 0.02, g: 0.2 * v }); },
};

// ---------------------------------------------------------------- engine
let ctx = null, master, limiter, musicBus, duckBus, sfxBus, sfxVerb, musicVerb;
let unlocked = false;
const vol = loadVol();
const voices = [];
const nameCount = {};
let cur = null; // { id, kind:'file'|'proc'|'oneshot', node, src, track, gain }
let want = null; // desired track id
let token = 0;
const raw = new Map(); // id -> Promise<ArrayBuffer>
const decoded = new Map(); // id -> AudioBuffer (LRU)

function loadVol() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const num = (x, d) => (typeof x === 'number' && isFinite(x) ? clamp(x, 0, 1) : d);
    return { music: num(v.music, 0.7), sfx: num(v.sfx, 0.85) };
  } catch { return { music: 0.7, sfx: 0.85 }; }
}
const curve = (v) => v * v; // perceptual slider

function buildBuses(c, live) {
  const b = {};
  b.master = gainNode(c, 1);
  if (live) {
    b.limiter = c.createDynamicsCompressor();
    b.limiter.threshold.value = -4; b.limiter.knee.value = 4; b.limiter.ratio.value = 14;
    b.limiter.attack.value = 0.002; b.limiter.release.value = 0.12;
    b.master.connect(b.limiter); b.limiter.connect(c.destination);
  } else b.master.connect(c.destination);
  b.sfxBus = gainNode(c, live ? curve(vol.sfx) : 1, b.master);
  b.sfxVerb = c.createConvolver(); b.sfxVerb.buffer = impulse(c, 1.8, 0.65); b.sfxVerb.connect(gainNode(c, 0.55, b.sfxBus));
  b.duckBus = gainNode(c, 1, b.master);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.6; hp.connect(b.duckBus);
  b.musicBus = gainNode(c, live ? curve(vol.music) : 1, hp);
  b.musicVerb = c.createConvolver(); b.musicVerb.buffer = impulse(c, 3.2, 0.7, 0.02); b.musicVerb.connect(gainNode(c, 0.45, b.musicBus));
  return b;
}
function ensureCtx() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* Safari only */ }
  ctx = new AC({ latencyHint: 'interactive' });
  ({ master, limiter, musicBus, duckBus, sfxBus, sfxVerb, musicVerb } = buildBuses(ctx, true));
  ctx.onstatechange = () => { if (ctx.state === 'running') onRunning(); };
  return ctx;
}
function onRunning() {
  if (!unlocked) { unlocked = true; detachUnlock(); }
  if (want && (!cur || cur.id !== want)) startTrack(want);
}

function unlock() {
  const c = ensureCtx();
  if (!c) return Promise.resolve(false);
  // iOS: play a silent buffer inside the gesture
  try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); } catch { /* ignore */ }
  if (document.visibilityState === 'hidden') return Promise.resolve(false);
  return c.resume().then(() => { if (c.state === 'running') onRunning(); return c.state === 'running'; }).catch(() => false);
}
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
const unlockHandler = () => { unlock(); };
function detachUnlock() { UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlockHandler, true)); }
if (typeof window !== 'undefined') {
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlockHandler, { capture: true, passive: true }));
  window.addEventListener('relix:sfx', (e) => { const d = e.detail || {}; if (d.name) sfx(d.name, d); });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
    else if (unlocked) ctx.resume().catch(() => {});
  });
  window.addEventListener('pageshow', () => { if (ctx && unlocked && document.visibilityState === 'visible') ctx.resume().catch(() => {}); });
}

function reap(now) {
  for (let k = voices.length - 1; k >= 0; k--) {
    if (voices[k].end < now) { const v = voices[k]; voices.splice(k, 1); nameCount[v.name]--; setTimeout(() => { v.g.disconnect(); v.w.disconnect(); }, 2500); }
  }
}
function kill(v, now) {
  const k = voices.indexOf(v);
  if (k >= 0) { voices.splice(k, 1); nameCount[v.name]--; }
  for (const g of [v.g, v.w]) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.03);
  }
  setTimeout(() => { v.g.disconnect(); v.w.disconnect(); }, 120);
}

// Render one SFX into (ctx, dest, verb) at time t. Shared by live playback and offline measuring.
function renderInto(c, dest, verb, name, opts, t) {
  const rec = SFX[name];
  const i = clamp(opts.intensity ?? 1, 0, 1.5);
  const p = clamp(opts.pitch ?? 1, 0.25, 4);
  const lvl = LEVEL[name] ?? 1;
  const lv = lvl * (0.55 + 0.45 * Math.min(i, 1.2));
  const g = gainNode(c, lv);
  if (opts.pan != null && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = clamp(+opts.pan || 0, -1, 1); g.connect(pn); pn.connect(dest); } else g.connect(dest);
  const wetG = gainNode(c, lv, verb);
  const V = { ctx: c, t, out: g, wet: wetG };
  const dur = rec(V, i, p);
  return { g, wetG, dur };
}

function sfx(name, opts = {}) {
  if (!SFX[name]) { if (!sfx.warned?.[name]) { (sfx.warned ||= {})[name] = 1; console.warn('[audio] unknown sfx', name); } return; }
  const c = ensureCtx();
  if (!c || c.state !== 'running' || vol.sfx <= 0) return;
  const now = c.currentTime;
  reap(now);
  if ((nameCount[name] || 0) >= (PER_NAME[name] || 4)) {
    const oldest = voices.find((v) => v.name === name);
    if (oldest) kill(oldest, now);
  }
  while (voices.length >= MAX_VOICES) kill(voices[0], now);
  const r = renderInto(c, sfxBus, sfxVerb, name, opts, now + 0.005);
  voices.push({ name, g: r.g, w: r.wetG, end: now + r.dur + 0.1 });
  nameCount[name] = (nameCount[name] || 0) + 1;
  if (DUCK[name]) duck(...DUCK[name]);
}

function duck(level = 0.35, hold = 1.2) {
  if (!ctx) return;
  const t = ctx.currentTime, g = duckBus.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.setTargetAtTime(level, t, 0.04);
  g.setTargetAtTime(1, t + hold, 0.35);
}

// ---- music
function fetchRaw(id) {
  const tr = TRACKS[id];
  if (!tr || !tr.file) return null;
  if (!raw.has(id)) {
    raw.set(id, fetch(BASE + tr.file).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }));
    raw.get(id).catch(() => raw.delete(id));
  }
  return raw.get(id);
}
async function getBuffer(id) {
  if (decoded.has(id)) { const b = decoded.get(id); decoded.delete(id); decoded.set(id, b); return b; }
  const ab = await fetchRaw(id);
  const buf = await new Promise((res, rej) => {
    const p = ctx.decodeAudioData(ab.slice(0), res, rej);
    if (p && p.then) p.then(res, rej);
  });
  decoded.set(id, buf);
  while (decoded.size > MAX_DECODED) {
    const k = decoded.keys().next().value;
    if (cur && cur.id === k) { const b = decoded.get(k); decoded.delete(k); decoded.set(k, b); continue; }
    decoded.delete(k);
  }
  return buf;
}
function fadeOutCurrent(fade = XFADE) {
  if (!cur) return;
  const old = cur; cur = null;
  if (old.kind === 'proc') { old.track.stop(fade); return; }
  const t = ctx.currentTime;
  old.gain.gain.cancelScheduledValues(t);
  old.gain.gain.setValueAtTime(old.gain.gain.value, t);
  old.gain.gain.linearRampToValueAtTime(0, t + fade);
  try { old.src.stop(t + fade + 0.05); } catch { /* */ }
  setTimeout(() => old.gain.disconnect(), (fade + 0.3) * 1000);
}
async function startTrack(id) {
  const tr = TRACKS[id];
  const my = ++token;
  if (tr.file) {
    try {
      const buf = await getBuffer(id);
      if (my !== token || want !== id) return;
      fadeOutCurrent();
      const t = ctx.currentTime + 0.02;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const loop = tr.loop !== false;
      if (loop) { src.loop = true; src.loopStart = tr.loopStart; src.loopEnd = Math.min(tr.loopEnd, buf.duration); }
      const g = gainNode(ctx, 0, musicBus);
      const target = tr.gain ?? 1;
      if (loop) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(target, t + XFADE); } else g.gain.setValueAtTime(target, t);
      src.connect(g);
      src.start(t, loop ? 0 : 0);
      cur = { id, kind: 'file', src, gain: g };
      if (!loop) {
        src.onended = () => { if (cur && cur.src === src) { cur = null; if (want === id) want = null; } };
      }
      return;
    } catch (err) {
      console.warn('[audio] music file failed, using procedural', id, err && err.message);
      if (my !== token) return;
    }
  }
  if (my !== token || want !== id) return;
  fadeOutCurrent();
  const theme = tr.proc;
  if (theme === 'victory' || theme === 'defeat') {
    const r = renderInto(ctx, musicBus, musicVerb, theme, {}, ctx.currentTime + 0.02);
    cur = { id, kind: 'file', src: { stop() {} }, gain: r.g };
    return;
  }
  const track = new ProcTrack(ctx, musicBus, musicVerb, theme);
  track.start(ctx.currentTime + 0.02);
  cur = { id, kind: 'proc', track };
}
function music(id) {
  if (!TRACKS[id]) { console.warn('[audio] unknown track', id); return; }
  if (want === id && cur && cur.id === id) return;
  want = id;
  const c = ensureCtx();
  if (!c) return;
  fetchRaw(id); // start network early even while locked
  if (c.state === 'running') startTrack(id);
}
function stopMusic(fade = XFADE) {
  want = null; token++;
  if (ctx) fadeOutCurrent(fade);
}
function setVolume(v = {}) {
  if (v.music != null) vol.music = clamp(+v.music, 0, 1);
  if (v.sfx != null) vol.sfx = clamp(+v.sfx, 0, 1);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(vol)); } catch { /* private mode */ }
  if (ctx) {
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(curve(vol.music), t, 0.05);
    sfxBus.gain.setTargetAtTime(curve(vol.sfx), t, 0.05);
  }
}
function preload(ids = Object.keys(TRACKS)) { ids.forEach((id) => { const p = fetchRaw(id); if (p) p.catch(() => {}); }); }

// ---- offline rendering (dev/tests): returns an AudioBuffer
async function renderSfxOffline(name, opts = {}, secs = 4.5, sr = 44100) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const c = new OAC(2, Math.floor(sr * secs), sr);
  const b = buildBuses(c, false);
  renderInto(c, b.sfxBus, b.sfxVerb, name, opts, 0.01);
  return c.startRendering();
}
async function renderMusicOffline(theme, secs = 20, sr = 44100, seed = 7) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const c = new OAC(2, Math.floor(sr * secs), sr);
  const b = buildBuses(c, false);
  if (theme === 'victory' || theme === 'defeat') renderInto(c, b.musicBus, b.musicVerb, theme, {}, 0.02);
  else { const tr = new ProcTrack(c, b.musicBus, b.musicVerb, theme, seed); tr.start(0, 0.01, false); tr.pump(secs); }
  return c.startRendering();
}

export const audio = {
  unlock,
  sfx,
  music,
  stopMusic,
  setVolume,
  get volumes() { return { ...vol }; },
  get current() { return cur ? cur.id : null; },
  get state() { return ctx ? ctx.state : 'none'; },
  duck,
  preload,
  SFX_NAMES,
  TRACKS,
  renderSfxOffline,
  renderMusicOffline,
  _seed(fn) { rnd = fn || Math.random; },
  _setLevel(name, v) { LEVEL[name] = v; },
};
export default audio;
