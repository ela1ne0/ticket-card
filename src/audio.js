// Synthesized sound design (no audio files). Same code feeds the live
// AudioContext and the OfflineAudioContext used for the exported video.

import { TL } from './config.js';

let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 1;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = (seed / 2147483648) - 1;
  }
  noiseBuf = b;
  return b;
}

// filtered-noise burst: freq sweeps f0 -> f1, gain envelope a/d/r
function whoosh(ctx, out, when, dur, { f0 = 400, f1 = 1800, q = 0.9, gain = 0.15, type = 'bandpass', attack = 0.3 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, when);
  flt.frequency.exponentialRampToValueAtTime(f1, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gain, when + dur * attack);
  g.gain.linearRampToValueAtTime(0.0001, when + dur);
  src.connect(flt); flt.connect(g); g.connect(out);
  src.start(when, 0); src.stop(when + dur + 0.05);
}

function tone(ctx, out, when, freq, dur, gain = 0.1, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(out); o.start(when); o.stop(when + dur + 0.05);
}

// the portfolio's thud: low-passed noise burst + tiny click, plus a sub punch
function thud(ctx, out, when) {
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
  const g = ctx.createGain(); g.gain.value = 0.9;
  src.connect(f); f.connect(g); g.connect(out); src.start(when);
  tone(ctx, out, when, 2400, 0.025, 0.04);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(110, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.25);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.6, when); og.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
  o.connect(og); og.connect(out); o.start(when); o.stop(when + 0.35);
}

export function scheduleSounds(ctx, out, start = 0) {
  const at = (s) => start + s;
  // card flies in
  whoosh(ctx, out, at(0.02), 0.6, { f0: 500, f1: 2400, gain: 0.12 });
  // scan beep (site: playBeep(880, .05, .1))
  tone(ctx, out, at(TL.scan[0]), 880, 0.1, 0.07);
  // stamp comes down
  whoosh(ctx, out, at(TL.stampIn[0]), TL.stampIn[1] - TL.stampIn[0] + 0.05, { f0: 3000, f1: 700, gain: 0.1, q: 0.6, attack: 0.5 });
  thud(ctx, out, at(TL.impact));
  // stamp lifts
  whoosh(ctx, out, at(TL.stampOut[0]), 0.4, { f0: 800, f1: 2600, gain: 0.05 });
  // ink wipe
  whoosh(ctx, out, at(TL.wipe[0]), 0.55, { f0: 900, f1: 5000, gain: 0.11, q: 0.5, attack: 0.4 });
  // train arrives: long whoosh that decelerates + brake hiss + chime
  whoosh(ctx, out, at(TL.train[0]), 1.7, { f0: 1800, f1: 220, gain: 0.2, q: 0.7, type: 'lowpass', attack: 0.2 });
  whoosh(ctx, out, at(TL.train[1] - 0.5), 0.9, { f0: 6000, f1: 3500, gain: 0.05, q: 0.4, type: 'highpass', attack: 0.15 });
  tone(ctx, out, at(TL.train[1] + 0.15), 784, 0.7, 0.07);
  tone(ctx, out, at(TL.train[1] + 0.5), 587, 0.9, 0.07);
  // card flip
  whoosh(ctx, out, at(TL.flip[0] + 0.05), TL.flip[1] - TL.flip[0], { f0: 400, f1: 2800, gain: 0.14, attack: 0.45 });
  // interior ambience: low rumble + rhythmic rail clacks
  whoosh(ctx, out, at(TL.flip[1] - 0.2), 4.6, { f0: 110, f1: 90, gain: 0.07, q: 0.3, type: 'lowpass', attack: 0.15 });
  for (let tt = TL.flip[1] + 0.1, i = 0; tt < 11.2; tt += 0.56, i++) {
    whoosh(ctx, out, at(tt), 0.07, { f0: 1500, f1: 700, gain: i % 2 ? 0.05 : 0.08, q: 1.2, attack: 0.1 });
  }
  // outro chime
  tone(ctx, out, at(10.4), 659, 0.9, 0.06);
  tone(ctx, out, at(10.55), 988, 1.1, 0.05);
}

// ── live playback ──────────────────────────────────────────────────────────
let live = null;
export function startAudio() {
  stopAudio();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  scheduleSounds(ctx, master, ctx.currentTime + 0.05);
  live = ctx;
}
export function stopAudio() {
  if (live) { try { live.close(); } catch (e) { /* noop */ } live = null; }
}

// ── offline render (used by the exporter) → 16-bit stereo WAV as base64 ───
export async function renderWavBase64(total = TL.total, sr = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  scheduleSounds(ctx, master, 0);
  const buf = await ctx.startRendering();
  const n = buf.length, ch = 2;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const dv = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const s of [L[i], R[i]]) {
      dv.setInt16(o, Math.max(-1, Math.min(1, s)) * 0x7fff, true); o += 2;
    }
  }
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
