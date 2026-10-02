// 2D painters for the card faces. Each is a pure function of time `t`.
//   drawFront -> panel 01 (ticket + stamp) wiping into panel 02 (platform + train)
//   drawBack  -> panel 03 (train interior, parallax buildings outside the windows)

import { FW, FH, ART_W, ART_H, TK, TICKET, STAMP_PT } from './layout.js';
import { TL, COLORS } from './config.js';
import {
  clamp, lerp, prog, track, rng,
  easeOutCubic, easeInCubic, easeInOutCubic, easeTrain,
} from './ease.js';

// The stamp point is mutable so the interactive page can stamp wherever you click.
const SP = { x: STAMP_PT.x, y: STAMP_PT.y };
export function setStampPoint(x, y) { SP.x = x; SP.y = y; }
export function resetStampPoint() { SP.x = STAMP_PT.x; SP.y = STAMP_PT.y; }

const BLUE = COLORS.blue;
const MONO = '"Space Mono", ui-monospace, monospace';
const HAND = '"Caveat", cursive';

// ── helpers ────────────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, font, color, { ls = 0, align = 'left' } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = ls ? `${ls}px` : '0px';
  ctx.fillText(str, x, y);
  ctx.letterSpacing = '0px';
}

// Draw a 4000x3000 "art space" layer through the panel camera
function withCam(ctx, cam, fn) {
  ctx.save();
  ctx.translate(FW / 2, FH / 2);
  const s = (cam.zoom * FW) / ART_W;
  ctx.scale(s, s);
  ctx.translate(-cam.cx, -cam.cy);
  fn();
  ctx.restore();
}

function layer(ctx, img, { dx = 0, dy = 0, rot = 0, alpha = 1, ink = true } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ART_W / 2 + dx, ART_H / 2 + dy);
  ctx.rotate(rot);
  ctx.translate(-ART_W / 2, -ART_H / 2);
  ctx.drawImage(img, 0, 0, ART_W, ART_H);
  if (ink) ctx.drawImage(img, 0, 0, ART_W, ART_H); // 2nd pass deepens thin anti-aliased ink
  ctx.restore();
}

function panelNum(ctx, label) {
  const x = 78, y = 78, r = 42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = BLUE;
  ctx.stroke();
  text(ctx, label, x, y + 15, `700 40px ${MONO}`, BLUE, { align: 'center' });
  ctx.restore();
}

// Caption box, same look as the site's .caption-box (blue fill, white 1.5px border)
function captionBox(ctx, str, shown, { right = 56, bottom = 56 } = {}) {
  if (shown <= 0) return;
  const s = str.slice(0, shown);
  const font = `400 50px ${MONO}`;
  ctx.save();
  ctx.font = font;
  const full = ctx.measureText(str).width;
  const w = Math.max(full + 128, 640);
  const h = 50 * 1.6 + 70;
  const x = FW - right - w, y = FH - bottom - h;
  rr(ctx, x, y, w, h, 4);
  ctx.fillStyle = BLUE;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  text(ctx, s, x + 64, y + h / 2 + 17, font, '#fff');
  ctx.restore();
}

const typed = (t, start, perChar, str) =>
  clamp(Math.floor((t - start) / perChar), 0, str.length);

// ── panel 01: ticket ───────────────────────────────────────────────────────
const now = new Date();
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DATE_STR = `${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]}`;
const TIME_STR = (() => {
  const h = now.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
})();

function drawTicket(ctx, t, clock, sT) {
  const { W, H, K } = TK;
  ctx.save();
  ctx.translate(TICKET.x, TICKET.y);
  ctx.scale(K, K);

  // pulse ring (stops once the scan begins, like :hover on the site)
  if (sT < TL.scan[0]) {
    const pp = 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / 2);
    const sp = 6 * pp;
    rr(ctx, -sp, -sp, W + 2 * sp, H + 2 * sp, 8 + sp);
    ctx.fillStyle = `rgba(26,82,212,${lerp(0.2, 0.12, pp)})`;
    ctx.fill();
  }

  // hand-inked double outline (the site's ::before with the roughen filter)
  ctx.strokeStyle = 'rgba(26,82,212,0.85)';
  ctx.lineWidth = 1.6;
  for (const [ox, oy] of [[0.7, -0.5], [-0.6, 0.6]]) {
    rr(ctx, -3 + ox, -3 + oy, W + 6, H + 6, 10);
    ctx.stroke();
  }

  // body
  rr(ctx, 0, 0, W, H, 8);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.save();
  ctx.clip();

  const faint = 'rgba(26,82,212,0.72)';
  const lbl = (s, x, y) => text(ctx, s, x, y, `700 6.6px ${MONO}`, faint, { ls: 0.96 });
  const big = (s, x, y, px = 18) => text(ctx, s, x, y, `700 ${px}px ${MONO}`, BLUE);
  const dash = (y) => {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(26,82,212,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.restore();
  };

  // top row
  lbl('FROM', 12, 16); big('HOME', 12, 35);
  text(ctx, '→', 63, 36, `700 12px ${MONO}`, 'rgba(26,82,212,0.75)');
  lbl('TO', 82, 16); big('PLAY', 82, 35);
  big('ROUND TRIP', 134, 33, 9);
  dash(45);

  // middle row
  const colW = (W - 24 - 68 - 12) / 3;
  const c = [12, 12 + colW + 6, 12 + (colW + 6) * 2];
  lbl('PASSENGER', c[0], 60); big('you!', c[0], 77, 12);
  lbl('TODAY', c[1], 60); big(DATE_STR, c[1], 77, 12);
  lbl('NOW', c[2], 60);
  const dotA = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / 2));
  ctx.beginPath(); ctx.arc(c[2] + 2.5, 73.5, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(26,82,212,${dotA})`; ctx.fill();
  big(TIME_STR, c[2] + 9, 77, 12);
  dash(87);

  // bottom row
  text(ctx, "elaine's 2026-7 portfolio", 12, 110, `500 15px ${HAND}`, BLUE);
  text(ctx, 'PLT-01', W - 16, 110, `700 8px ${MONO}`, 'rgba(26,82,212,0.55)', { ls: 0.48, align: 'right' });

  // perforation + notches
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(26,82,212,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W - 51.5, 0); ctx.lineTo(W - 51.5, H); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = BLUE;
  for (const cy of [0, H]) { ctx.beginPath(); ctx.arc(W - 42 - 10 + 0, cy, 10, 0, Math.PI * 2); ctx.fill(); }

  // scan line + glow
  const sp = prog(sT, TL.scan[0], TL.scan[1]);
  if (sp > 0 && sp < 1) {
    const y = easeInOutCubic(sp) * H;
    const a = sp < 0.08 ? sp / 0.08 : sp > 0.92 ? (1 - sp) / 0.08 : 1;
    const g = ctx.createLinearGradient(0, y - 32, 0, y);
    g.addColorStop(0, 'rgba(26,82,212,0.16)');
    g.addColorStop(1, 'rgba(26,82,212,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = g; ctx.fillRect(0, y - 32, W, 32);
    const lg = ctx.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(26,82,212,0)');
    lg.addColorStop(0.5, 'rgba(26,82,212,0.75)');
    lg.addColorStop(1, 'rgba(26,82,212,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, y, W, 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore(); // clip

  // border
  rr(ctx, 1, 1, W - 2, H - 2, 7);
  ctx.lineWidth = 2;
  ctx.strokeStyle = BLUE;
  ctx.stroke();
  ctx.restore();
}

const STAMP_D = 372; // diameter of the ink mark (canvas px)
function drawStampMark(ctx, t) {
  const d = t - TL.impact;
  if (d < 0) return;
  const p = clamp(d / 0.32);
  // keyframes from the site's @keyframes inkStamp (0 / 40 / 65 / 100 %)
  const sc = p < 0.4 ? lerp(1.5, 0.96, easeOutCubic(p / 0.4))
    : p < 0.65 ? lerp(0.96, 1.02, (p - 0.4) / 0.25)
    : lerp(1.02, 1, (p - 0.65) / 0.35);
  const al = p < 0.4 ? lerp(0, 0.92, p / 0.4) : lerp(0.92, 1, clamp((p - 0.4) / 0.25));
  const blur = p < 0.4 ? lerp(3, 0, p / 0.4) * 2 : 0;
  const img = ctxImg.stampArt;
  ctx.save();
  ctx.translate(SP.x, SP.y);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.scale(sc, sc);
  ctx.globalAlpha = al;
  if (blur > 0.1) ctx.filter = `blur(${blur}px)`;
  const h = STAMP_D * (img.height / img.width);
  ctx.drawImage(img, -STAMP_D / 2, -h / 2, STAMP_D, h);
  ctx.restore();
}

const splats = (() => {
  const r = rng(7);
  return Array.from({ length: 22 }, (_, i) => ({
    at: i * 0.01,
    ang: r() * Math.PI * 2,
    dist: (35 + r() * 85) * TK.K,
    size: (3 + r() * 7) * TK.K,
  }));
})();

function drawSplatter(ctx, t) {
  const d0 = t - TL.impact;
  if (d0 < 0) return;
  ctx.save();
  for (const s of splats) {
    const p = (d0 - s.at) / 0.45;
    if (p <= 0 || p >= 1) continue;
    const e = easeOutCubic(p);
    ctx.globalAlpha = 0.65 * (1 - e);
    ctx.fillStyle = COLORS.stamp;
    ctx.beginPath();
    ctx.arc(
      SP.x + Math.cos(s.ang) * s.dist * e,
      SP.y + Math.sin(s.ang) * s.dist * e,
      (s.size / 2) * e + 1, 0, Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawInstruction(ctx, t, clock) {
  const img = ctxImg.click;
  const w = 980, h = w * (img.height / img.width);
  let a = 0.65 - 0.2 * Math.cos((2 * Math.PI * clock) / 2.4);
  let dx = 0, sc = 1;
  const p = prog(t, TL.impact + 0.1, TL.impact + 0.6);
  if (p > 0) {
    // site's eraseWipe: shake left/right, then fade + shrink
    dx = track([[0, 0], [0.25, -5], [0.5, 5], [0.75, -3], [1, 0]], p, (x) => x) * 4;
    a = lerp(1, 0, p); sc = lerp(1, 0.95, p);
    if (p >= 1) return;
  }
  ctx.save();
  ctx.globalAlpha = clamp(a);
  ctx.translate(FW / 2 + dx, 250);
  ctx.scale(sc, sc);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawTicketPanel(ctx, t, clock, sT) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, FW, FH);
  drawInstruction(ctx, t, clock);
  drawTicket(ctx, t, clock, sT);
  drawStampMark(ctx, t);
  drawSplatter(ctx, t);
  drawStampSprite(ctx, t);
  panelNum(ctx, '01');
}

// ── panel 02: platform + train ─────────────────────────────────────────────
const CAP_PLATFORM = 'always drawing and building...';
const CAP_TRAIN = "let's go somewhere good.";
export const CAP_START = { platform: 4.0, train: 8.0 };

function drawPlatformPanel(ctx, t, clock) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, FW, FH);
  const z = track([[3.0, 1.04], [5.3, 1.16], [7.4, 1.26]], t);
  const cx = track([[3.0, 2000], [7.4, 2260]], t);
  const cam = { zoom: z, cx, cy: 1500 / z + 30 };
  const e = easeTrain(prog(t, TL.train[0], TL.train[1]));
  const bob = -28 * (0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / 2.6));
  withCam(ctx, cam, () => {
    // same stacking as the site: train sits behind the platform art
    layer(ctx, ctxImg.train, {
      dx: lerp(ART_W * 1.15, 0, e), dy: lerp(-ART_H * 0.06, 0, e), rot: lerp((3 * Math.PI) / 180, 0, e),
    });
    layer(ctx, ctxImg.platformBg);
    layer(ctx, ctxImg.girlShadow);
    layer(ctx, ctxImg.girl, { dy: bob });
  });
  captionBox(ctx, CAP_PLATFORM, typed(t, CAP_START.platform, 0.042, CAP_PLATFORM));
  panelNum(ctx, '02');
}

// ── front face: 01 → ink wipe → 02 ─────────────────────────────────────────
// t = stamp-timeline time; clock = free-running time for idle motion (defaults to t);
// scanT = scan-line time (defaults to t; interactive page passes -1 = idle, 99 = done)
export function drawFront(ctx, t, clock = t, scanT) {
  const sT = scanT === undefined ? t : scanT;
  const [w0, w1] = TL.wipe;
  if (t < w0) return drawTicketPanel(ctx, t, clock, sT);
  if (t >= w1) return drawPlatformPanel(ctx, t, clock);

  drawTicketPanel(ctx, t, clock, sT);
  const p = easeInOutCubic(prog(t, w0, w1));
  const S = FW * 0.38;
  const e0 = lerp(-S * 0.1, FW + S + 60, p); // edge x at the top
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(e0, 0); ctx.lineTo(e0 - S, FH); ctx.lineTo(0, FH);
  ctx.closePath();
  ctx.clip();
  drawPlatformPanel(ctx, t, clock);
  ctx.restore();
  // ink stroke riding the wipe edge
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = BLUE; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(e0, -10); ctx.lineTo(e0 - S, FH + 10); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(e0 + 26, -10); ctx.lineTo(e0 + 26 - S, FH + 10); ctx.stroke();
  ctx.strokeStyle = BLUE; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(e0 + 46, -10); ctx.lineTo(e0 + 46 - S, FH + 10); ctx.stroke();
  ctx.restore();
}

// ── back face: 03 (interior, parallax) ─────────────────────────────────────
const STRIP_SCALE = 1.12; // buildings strip is 4000x676 natively
const STRIP_Y = 1370;

export function drawBack(ctx, t, sway = 0, swayPitch = 0, boarded = true, clock = t) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, FW, FH);
  const z = track([[5.8, 1.42], [12, 1.62]], t, (x) => x);
  const cam = { zoom: z, cx: 2000 - sway * 160, cy: 1840 - swayPitch * 120 };
  const travel = Math.max(0, t - TL.scrollStart) * 620; // art-px/s the scenery moves
  const strip = ctxImg.buildings;
  const sw = strip.width * STRIP_SCALE, sh = strip.height * STRIP_SCALE;
  const pass = easeOutCubic(prog(t, TL.passenger[0], TL.passenger[1]));
  withCam(ctx, cam, () => {
    // far layer: buildings (moves with the train + opposite the card's sway)
    const far = -(travel + sway * 1400);
    const start = ((far % sw) + sw) % sw - sw; // wrap
    for (let x = start - sw; x < ART_W + sw; x += sw) {
      ctx.drawImage(strip, x, STRIP_Y, sw, sh);
    }
    // mid layer: the interior frame (windows are transparent in the art)
    layer(ctx, ctxImg.interior, { dx: sway * 120, dy: swayPitch * 60 });
    // near layer: passenger moves a bit more than the frame
    layer(ctx, ctxImg.sitting, { dx: sway * 300, dy: swayPitch * 140 + Math.sin(clock * 1.7) * 6, alpha: pass });
  });
  if (boarded) captionBox(ctx, CAP_TRAIN, typed(t, CAP_START.train, 0.048, CAP_TRAIN));
  else captionBox(ctx, 'stamp your ticket to board.', 99);
  panelNum(ctx, '03');
}

// image registry, filled by main.js before the first draw
export const ctxImg = {};
export function setImages(A) { Object.assign(ctxImg, A); }
