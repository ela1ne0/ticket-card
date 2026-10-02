import './style.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/caveat/500.css';
import * as THREE from 'three';
import { buildScene } from './scene.js';
import { loadImages } from './assets.js';

import { STAMP_PT, toCard } from './layout.js';
import { TL, TEXT, COLORS } from './config.js';
import { drawFront, drawBack, setImages } from './faces.js';
import { cardPose, camAt } from './timeline.js';
import { startAudio, stopAudio, renderWavBase64 } from './audio.js';
import { clamp, prog, rng, easeOutCubic } from './ease.js';

// ── query params ───────────────────────────────────────────────────────────
//  ?record=1   hide UI + tilt, wait for Space/click   ?autoplay=1  start immediately
//  ?w=1080     pixel width (height = w*16/9)           ?speed=1     playback rate
//  ?sound=0    mute                                    ?t=3.2       freeze at a time
const Q = new URLSearchParams(location.search);
const RECORD = Q.has('record') || Q.has('export');
const OUT_W = Number(Q.get('w')) || 1080;
const OUT_H = Math.round((OUT_W * 16) / 9);
const SPEED = Number(Q.get('speed')) || 1;
const MUTE = Q.get('sound') === '0';
const T_PARAM = Q.has('t') ? Number(Q.get('t')) : null;
if (RECORD) document.body.classList.add('record');

async function init() {
  await Promise.all([
    document.fonts.load('700 18px "Space Mono"'),
    document.fonts.load('400 18px "Space Mono"'),
    document.fonts.load('500 18px "Caveat"'),
  ]);
  setImages(await loadImages());

  // ── renderer / scene (shared with the interactive page) ──────────────────
  const glCanvas = document.getElementById('gl');
  const fxCanvas = document.getElementById('fx');
  const S = buildScene(glCanvas, { width: OUT_W, height: OUT_H, pixelRatio: 1 });
  const { renderer, scene, camera, card, front, back, shadow, sheen, T } = S;
  fxCanvas.width = OUT_W; fxCanvas.height = OUT_H;
  const fx = fxCanvas.getContext('2d');
  // card = 94% of frame width at rest
  const D0 = S.fitDistance(OUT_W / OUT_H, 0.94, 1);
  camera.position.set(0, 0, D0);

  // ── DOM overlays ─────────────────────────────────────────────────────────
  const elTop = document.getElementById('top-label');
  const elCap = document.getElementById('caption');
  const elOutro = document.getElementById('outro');
  elTop.textContent = TEXT.topLabel;
  elOutro.textContent = TEXT.site;
  let lastCap = '';
  function overlays(t) {
    elTop.style.opacity = easeOutCubic(prog(t, 0.4, 1.1)) * 0.85;
    const c = TEXT.captions.find(([a, b]) => t >= a && t <= b);
    let txt = '', al = 0;
    if (c) {
      txt = c[2].slice(0, Math.floor((t - c[0]) / 0.045));
      al = Math.min(prog(t, c[0], c[0] + 0.2), 1 - prog(t, c[1] - 0.3, c[1]));
    }
    if (txt !== lastCap) { elCap.textContent = txt; lastCap = txt; }
    elCap.style.opacity = al;
    const o = prog(t, TEXT.outroStart, TEXT.outroStart + 0.5);
    elOutro.style.opacity = o;
    elOutro.style.transform = `translateY(${(1 - easeOutCubic(o)) * 1.2}cqw)`;
  }

  // manga focus lines bursting from the stamp point at impact (blue ink)
  const spLocal = toCard(STAMP_PT.x, STAMP_PT.y);
  const tmp = new THREE.Vector3();
  function focusLines(t) {
    fx.clearRect(0, 0, OUT_W, OUT_H);
    const d = t - TL.impact;
    if (d < 0 || d > 0.32) return;
    tmp.set(spLocal.x, spLocal.y, T / 2);
    card.localToWorld(tmp); tmp.project(camera);
    const cx = (tmp.x * 0.5 + 0.5) * OUT_W, cy = (-tmp.y * 0.5 + 0.5) * OUT_H;
    const a = 1 - d / 0.32;
    const r = rng(11);
    fx.fillStyle = COLORS.blue;
    fx.globalAlpha = 0.34 * a;
    const N = 56;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.08;
      const r0 = OUT_W * (0.36 + r() * 0.22) * (1 + d * 1.2);
      const r1 = OUT_W * (1.1 + r() * 0.5);
      const half = 0.006 + r() * 0.01;
      fx.beginPath();
      fx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      fx.lineTo(cx + Math.cos(ang - half) * r0, cy + Math.sin(ang - half) * r0);
      fx.lineTo(cx + Math.cos(ang + half) * r0, cy + Math.sin(ang + half) * r0);
      fx.fill();
    }
    fx.globalAlpha = 1;
  }

  // ── render at time t ─────────────────────────────────────────────────────
  const FRONT_UNTIL = 6.9, BACK_FROM = 5.8;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  function renderAt(t) {
    const p = cardPose(t);
    card.position.set(p.x, p.y, p.z);
    card.rotation.set(p.rotX - tilt.y * 0.08, p.rotY + tilt.x * 0.12, p.rotZ);
    card.scale.setScalar(p.scale);

    const c = camAt(t);
    camera.position.set(c.px, c.py, D0 / c.zoom);
    camera.rotation.z = c.roll;

    if (t < FRONT_UNTIL) { drawFront(front.ctx, t); front.tex.needsUpdate = true; }
    if (t >= BACK_FROM) { drawBack(back.ctx, t, p.sway, p.swayPitch); back.tex.needsUpdate = true; }

    // moving highlight that rakes across the glossy clearcoat
    sheen.position.set(Math.sin(t * 0.9) * 1.3 + p.x, 0.7 + p.y, 1.3);
    shadow.position.set(0.05 + p.x * 0.6, -0.09 + p.y * 0.6, -0.4 - p.z * 0.4);
    shadow.material.opacity = 0.5 * (1 - 0.35 * p.lift) * clamp(p.scale);
    shadow.scale.setScalar(1 + p.lift * 0.25);

    renderer.render(scene, camera);
    focusLines(t);
    overlays(t);
  }

  // ── playback ─────────────────────────────────────────────────────────────
  const hud = document.getElementById('hud');
  let tNow = T_PARAM ?? (RECORD ? 0 : 1.2);
  let playing = false, wall0 = 0;
  function play() {
    tNow = 0; wall0 = performance.now(); playing = true;
    hud.classList.add('hide');
    stopAudio();
    if (!MUTE) { try { startAudio(); } catch (e) { /* needs a user gesture */ } }
  }
  function loop() {
    requestAnimationFrame(loop);
    if (playing) {
      tNow = ((performance.now() - wall0) / 1000) * SPEED;
      if (tNow >= TL.total) { tNow = TL.total; playing = false; hud.classList.remove('hide'); }
    }
    if (!RECORD) { // eased pointer tilt (interactive only; never in record/export)
      tilt.x += (tilt.tx - tilt.x) * 0.08; tilt.y += (tilt.ty - tilt.y) * 0.08;
    }
    renderAt(tNow);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); play(); }
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('record');
  });
  document.getElementById('stage').addEventListener('click', () => { if (T_PARAM === null) play(); });
  if (!RECORD) {
    window.addEventListener('pointermove', (e) => {
      tilt.tx = (e.clientX / innerWidth - 0.5) * 2;
      tilt.ty = (e.clientY / innerHeight - 0.5) * 2;
    });
  }

  // handle for the exporter / console
  window.__reel = {
    total: TL.total,
    seek: (t) => { playing = false; tNow = t; renderAt(t); return true; },
    play,
    renderWav: () => renderWavBase64(TL.total),
  };
  window.__reelReady = true;

  if (Q.has('autoplay')) play();
  loop();
}

init();
