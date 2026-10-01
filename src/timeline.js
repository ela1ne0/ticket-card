// Card pose, camera and shake — all pure functions of t.

import { TL } from './config.js';
import { STAMP_PT, toCard } from './layout.js';
import { track, prog, lerp, easeOutBack, easeOutCubic, easeInOutCubic } from './ease.js';

const SP = toCard(STAMP_PT.x, STAMP_PT.y); // stamp point in card coords (for the close-up)

export function cardPose(t) {
  const pi = prog(t, TL.intro[0], TL.intro[1]);
  const eo = easeOutCubic(pi);
  let y = lerp(-1.15, 0, easeOutBack(pi, 1.1));
  let x = 0;
  let z = 0;
  let rotX = lerp(0.6, 0, eo);
  let rotZ = lerp(-0.2, 0, eo);
  const scale = lerp(0.82, 1, eo);

  // idle sway — damped around the flip so the edge-on moment is clean
  const f = prog(t, TL.flip[0], TL.flip[1]);
  const calm = 1 - 0.85 * Math.sin(Math.PI * f);
  const settle = easeOutCubic(prog(t, 0.5, 1.4));
  const sway = (0.085 * Math.sin(t * 0.85) + 0.022 * Math.sin(t * 1.9 + 1)) * calm * settle;
  const swayPitch = 0.05 * Math.sin(t * 0.62 + 1.3) * calm * settle;
  rotZ += 0.014 * Math.sin(t * 0.5) * settle;

  // stamp impact: card gets pushed back, then rings out
  const d = t - TL.impact;
  if (d > 0) {
    const env = Math.exp(-d * 7);
    z -= 0.07 * env * Math.cos(d * 26);
    rotX += 0.05 * env * Math.cos(d * 24 + 0.5);
  }

  // flip: 180° around Y with a lift toward the camera
  const ang = Math.PI * easeInOutCubic(f);
  const lift = Math.sin(Math.PI * f);
  z += 0.32 * lift;
  rotZ += -0.1 * lift;
  rotX += -0.08 * lift;
  y += 0.02 * lift;

  return { x, y, z, rotX: rotX + swayPitch, rotY: ang + sway, rotZ, scale, sway, swayPitch, lift };
}

export function camAt(t) {
  const zoom = track([
    [0, 0.96], [0.85, 1.0], [1.65, 1.0], [2.25, 1.62], [2.95, 1.62],
    [3.55, 1.0], [3.7, 1.0], [5.9, 1.08], [6.6, 0.95], [7.5, 1.0], [12, 1.05],
  ], t);
  const px = track([
    [0, 0], [1.65, 0], [2.25, SP.x], [2.95, SP.x], [3.55, 0], [3.7, 0], [5.9, 0.03], [7.3, 0], [12, 0],
  ], t);
  const py = track([
    [0, 0], [1.65, 0], [2.25, SP.y], [2.95, SP.y], [3.55, 0], [3.7, 0], [5.9, 0.04], [7.3, 0], [12, 0],
  ], t);
  // screen shake on impact
  const d = t - TL.impact;
  let sx = 0, sy = 0, sr = 0;
  if (d > 0) {
    const env = Math.exp(-d * 11);
    sx = 0.010 * env * Math.sin(d * 70);
    sy = 0.013 * env * Math.cos(d * 62);
    sr = 0.009 * env * Math.sin(d * 55);
  }
  return { zoom, px: px + sx, py: py + sy, roll: sr };
}
