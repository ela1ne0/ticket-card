// Interactive-page sound effects. Same synthesized sounds as the reel, but triggered by what the
// visitor does. The AudioContext is created lazily and unlocked on the first pointer-down.

import { whoosh, tone, thud, noise } from './audio.js';
import { TL } from './config.js';

// The page plays the stamp animation faster than the reel: the approach (stampIn → impact) runs 2.5x speed
export const APPROACH_SPEED = 2.5;
export const PRE = (TL.impact - TL.stampIn[0]) / APPROACH_SPEED; // seconds from click to impact (0.24)
// seconds after the click at which reel-time `v` happens
export const sinceFor = (v) => (v <= TL.impact ? (v - TL.stampIn[0]) / APPROACH_SPEED : PRE + (v - TL.impact));

let ctx = null, master = null, rumble = null, muted = false, lastFlip = -9;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  // train rumble (only audible when boarded and the interior faces you)
  const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
  rumble = ctx.createGain(); rumble.gain.value = 0;
  src.connect(lp); lp.connect(rumble); rumble.connect(master); src.start();
  return ctx;
}

export const sfx = {
  unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
  get muted() { return muted; },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  },
  beep() { const c = ensure(); if (c) tone(c, master, c.currentTime, 880, 0.1, 0.07); },
  // click on the ticket: stamp comes down, thud, then the whole boarding sequence is scheduled
  stamp() {
    const c = ensure(); if (!c) return;
    const n = c.currentTime;
    const at = (v) => n + sinceFor(v);
    whoosh(c, master, n, PRE + 0.04, { f0: 3000, f1: 700, gain: 0.1, q: 0.6, attack: 0.5 });
    thud(c, master, n + PRE);
    whoosh(c, master, at(TL.stampOut[0]), 0.4, { f0: 800, f1: 2600, gain: 0.05 });
    whoosh(c, master, at(TL.wipe[0]), 0.55, { f0: 900, f1: 5000, gain: 0.11, q: 0.5, attack: 0.4 });
    whoosh(c, master, at(TL.train[0]), 1.7, { f0: 1800, f1: 220, gain: 0.2, q: 0.7, type: 'lowpass', attack: 0.2 });
    whoosh(c, master, at(TL.train[1] - 0.5), 0.9, { f0: 6000, f1: 3500, gain: 0.05, q: 0.4, type: 'highpass', attack: 0.15 });
    tone(c, master, at(TL.train[1] + 0.15), 784, 0.7, 0.07);
    tone(c, master, at(TL.train[1] + 0.5), 587, 0.9, 0.07);
  },
  // card crossed edge-on; louder when you whip it
  flip(speed) {
    const c = ensure(); if (!c) return;
    if (c.currentTime - lastFlip < 0.4) return;
    lastFlip = c.currentTime;
    whoosh(c, master, c.currentTime, 0.45, { f0: 400, f1: 2600, gain: Math.min(0.13, 0.03 + speed * 0.012) });
  },
  ambient(level) {
    if (rumble) rumble.gain.setTargetAtTime(level * 0.07, ctx.currentTime, 0.2);
  },
};
