// Interactive card: drag to spin it any way you like, hover the ticket to scan it, click to stamp it.
// Stamping plays the same sequence as the reel (ink wipe → train slides in); flip the card to ride.
//
//   ?record=1   hide all UI + native cursor (for screen-recording a demo)
//   ?manual=1   no animation loop; drive it with window.__play.tick(dt) (used by the tests)

import './play.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/caveat/500.css';
import * as THREE from 'three';
import { buildScene, FOV } from './scene.js';
import { loadImages } from './assets.js';
import { FW, FH, CARD_W, TICKET, STAMP_PT, toCard } from './layout.js';
import { TL, TEXT, COLORS } from './config.js';
import { drawFront, drawBack, setImages, setStampPoint, resetStampPoint, CAP_START } from './faces.js';
import { sfx, PRE } from './sfx.js';
import { clamp, lerp, prog, rng, easeOutCubic, easeOutBack, easeInOutCubic } from './ease.js';

const Q = new URLSearchParams(location.search);
const RECORD = Q.has('record');
const MANUAL = Q.has('manual');
if (RECORD) document.body.classList.add('record');

const $ = (id) => document.getElementById(id);

async function init() {
  await Promise.all([
    document.fonts.load('700 18px "Space Mono"'),
    document.fonts.load('400 18px "Space Mono"'),
    document.fonts.load('500 18px "Caveat"'),
  ]);
  setImages(await loadImages());

  const app = $('app');
  const glCanvas = $('gl'), fxCanvas = $('fx');
  const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);
  let W = app.clientWidth, H = app.clientHeight;
  const S = buildScene(glCanvas, { width: W, height: H, pixelRatio: dprOf() });
  const { renderer, scene, camera, card, frontMesh, front, back, shadow, sheen, T } = S;
  const fx = fxCanvas.getContext('2d');
  $('top-label').textContent = TEXT.topLabel;

  // ── layout / camera ──────────────────────────────────────────────────────
  let D0 = 3, cardPx = 600;
  let zoom = 1, zoomT = 1;
  function layout() {
    W = app.clientWidth; H = app.clientHeight;
    const dpr = dprOf();
    S.resize(W, H, dpr);
    fxCanvas.width = Math.round(W * dpr); fxCanvas.height = Math.round(H * dpr);
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D0 = S.fitDistance(W / H, 0.84, 0.7);
    updateCardPx();
  }
  function updateCardPx() {
    cardPx = (H / (2 * (D0 / zoom) * Math.tan((FOV * Math.PI) / 360))) * CARD_W;
  }
  layout();
  new ResizeObserver(() => { layout(); }).observe(app);

  // ── state ────────────────────────────────────────────────────────────────
  const q = new THREE.Quaternion();           // the visitor's rotation
  const angVel = new THREE.Vector3();         // rad/s (world axis * rate) for inertia
  const qd = new THREE.Quaternion();          // final displayed orientation
  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler();
  const v3 = new THREE.Vector3();
  let now = 0, idle = 0, hover = { x: 0, y: 0, ax: 0, ay: 0, amt: 0, inside: false };
  let dragging = false, anim = null;
  let stamped = false, stampAt = 0, scanState = -1, scanStart = 0, scanned = false;
  let impactSeen = false, flippedOnce = false, lastNfZ = 1, vt = 1.0;
  const pointers = new Map();
  let drag = null;

  function vtime() {
    if (!stamped) return 1.0;
    const since = now - stampAt;
    return since < PRE ? TL.stampIn[0] + since * 2.5 : TL.impact + (since - PRE);
  }

  // ── pointer → rotation ───────────────────────────────────────────────────
  const root = app;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#controls') || e.target.closest('#site-link')) return;
    sfx.unlock();
    root.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { sx: e.clientX, sy: e.clientY, t0: e.timeStamp, moved: 0, lx: e.clientX, ly: e.clientY, lt: e.timeStamp };
      dragging = true; anim = null; angVel.set(0, 0, 0);
      root.classList.add('grabbing');
    } else { drag = null; pinch0 = null; }
  });
  let pinch0 = null;
  root.addEventListener('pointermove', (e) => {
    hover.inside = true;
    hover.ax = (e.clientX / W - 0.5) * 2; hover.ay = (e.clientY / H - 0.5) * 2;
    hover.mouse = e.pointerType === 'mouse';
    cursorMove(e.clientX, e.clientY);
    if (!pointers.has(e.pointerId)) { hoverTest(e.clientX, e.clientY); return; }
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { // pinch zoom
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) zoomT = zoom = clamp(pinch0.z * (d / pinch0.d), 0.6, 2.2);
      else pinch0 = { d, z: zoom };
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 3) return;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const k = Math.PI / cardPx;
    v3.set(dy, dx, 0).normalize();
    tmpQ.setFromAxisAngle(v3, len * k);
    q.premultiply(tmpQ).normalize();
    const dt = Math.max((e.timeStamp - drag.lt) / 1000, 1 / 240);
    const w = Math.min((len * k) / dt, 14);
    // smoothed angular velocity for the throw
    angVel.multiplyScalar(0.5).addScaledVector(v3, w * 0.5);
    drag.lt = e.timeStamp;
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    pinch0 = null;
    if (pointers.size === 0 && drag) {
      const quick = e.timeStamp - drag.t0 < 500, still = drag.moved < 6;
      if (e.type === 'pointerup' && quick && still) clickAt(e.clientX, e.clientY);
      // stale velocity (held still before release) shouldn't fling
      if (e.timeStamp - drag.lt > 90) angVel.set(0, 0, 0);
      drag = null; dragging = false;
      root.classList.remove('grabbing');
    }
  };
  root.addEventListener('pointerup', endPointer);
  root.addEventListener('pointercancel', endPointer);
  root.addEventListener('pointerleave', () => { hover.inside = false; showStampCursor(false); });
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomT = clamp(zoomT * Math.exp(-e.deltaY * 0.0012), 0.6, 2.2);
  }, { passive: false });

  // ── raycast helpers ──────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function frontHit(cx, cy) {
    const r = root.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    card.updateMatrixWorld(true);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(frontMesh, false)[0];
    if (!hit || !hit.uv) return null;
    return { px: hit.uv.x * FW, py: (1 - hit.uv.y) * FH };
  }
  const PAD = 30;
  const onTicket = (h) => h && h.px > TICKET.x - PAD && h.px < TICKET.x + TICKET.w + PAD &&
    h.py > TICKET.y - PAD && h.py < TICKET.y + TICKET.h + PAD;
  const frontFacing = () => v3.set(0, 0, 1).applyQuaternion(qd).z > 0.15;

  // stamp-in-hand cursor while hovering the unstamped ticket
  const elCursor = $('stamp-cursor');
  let cursorOn = false;
  function showStampCursor(on) {
    if (on === cursorOn) return;
    cursorOn = on;
    elCursor.classList.toggle('on', on);
    root.classList.toggle('stamping', on);
  }
  function cursorMove(x, y) {
    elCursor.style.width = `${cardPx * 0.3}px`;
    elCursor.style.transform = `translate(${x}px, ${y}px) translate(-33%, -52%) rotate(-8deg)`;
  }
  function hoverTest(cx, cy) {
    if (RECORD || dragging || stamped || !frontFacing()) { showStampCursor(false); return; }
    const h = frontHit(cx, cy);
    const on = onTicket(h);
    showStampCursor(on && (hover.mouse !== false));
    if (on && !scanned && scanState < 0) { scanState = 0; scanStart = now; sfx.beep(); }
  }

  function clickAt(cx, cy) {
    if (stamped || !frontFacing()) return;
    const h = frontHit(cx, cy);
    if (!onTicket(h)) return;
    liveStamp.x = clamp(h.px, TICKET.x + 60, TICKET.x + TICKET.w - 60);
    liveStamp.y = clamp(h.py, TICKET.y + 30, TICKET.y + TICKET.h - 30);
    setStampPoint(liveStamp.x, liveStamp.y);
    stamped = true; stampAt = now; impactSeen = false;
    scanned = true; scanState = 99;
    showStampCursor(false);
    sfx.stamp();
    setHint();
  }

  // ── flip / reset / restart ───────────────────────────────────────────────
  function animateTo(target, dur = 0.85) {
    anim = { from: q.clone(), to: target.clone(), t0: now, dur };
    angVel.set(0, 0, 0);
    sfx.unlock();
  }
  function flip() {
    const nz = v3.set(0, 0, 1).applyQuaternion(qd).z;
    animateTo(nz >= 0 ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)) : new THREE.Quaternion());
    flippedOnce = true; setHint();
  }
  function reset() { animateTo(new THREE.Quaternion(), 0.7); zoomT = 1; }
  function restart() {
    stamped = false; scanned = false; scanState = -1; flippedOnce = false;
    stampAt = 0; impactSeen = false; vt = 1.0; lastDraw = -1; hintKey = '';
    resetStampPoint(); liveStamp.x = STAMP_PT.x; liveStamp.y = STAMP_PT.y;
    sfx.ambient(0);
    $('site-link').classList.remove('show');
    setHint();
    animateTo(new THREE.Quaternion(), 0.6); zoomT = 1;
  }
  $('b-flip').addEventListener('click', flip);
  $('b-reset').addEventListener('click', reset);
  $('b-again').addEventListener('click', restart);
  $('b-sound').addEventListener('click', (e) => {
    sfx.unlock(); sfx.setMuted(!sfx.muted);
    e.currentTarget.classList.toggle('off', sfx.muted);
    e.currentTarget.setAttribute('aria-pressed', String(!sfx.muted));
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); flip(); }
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === 'n' || e.key === 'N') restart();
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('record');
  });

  // ── hint text ────────────────────────────────────────────────────────────
  const elHint = $('hint');
  let hintKey = '';
  function setHint() {
    let k, txt;
    if (!stamped) { k = 'a'; txt = 'drag to spin the card · hover + click the ticket to stamp it'; }
    else if (vt < TL.train[1]) { k = 'b'; txt = 'ink drying…'; }
    else if (!flippedOnce) { k = 'c'; txt = 'now flip it over to ride →'; }
    else { k = 'd'; txt = 'space flips · r resets · n starts over'; }
    if (k === hintKey) return;
    hintKey = k; elHint.textContent = txt;
    elHint.classList.toggle('pulse', k === 'c');
    $('b-again').classList.toggle('show', stamped);
  }
  setHint();

  // ── focus lines at the stamp impact ──────────────────────────────────────
  const tmpV = new THREE.Vector3();
  function focusLines(d) {
    fx.clearRect(0, 0, W, H);
    if (d < 0 || d > 0.32) return;
    const l = toCard(liveStamp.x, liveStamp.y); // wherever the visitor clicked
    tmpV.set(l.x, l.y, T / 2); card.localToWorld(tmpV); tmpV.project(camera);
    const cx = (tmpV.x * 0.5 + 0.5) * W, cy = (-tmpV.y * 0.5 + 0.5) * H;
    const a = 1 - d / 0.32, r = rng(11);
    const unit = Math.max(W, H);
    fx.fillStyle = COLORS.blue; fx.globalAlpha = 0.34 * a;
    const N = 56;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.08;
      const r0 = unit * (0.3 + r() * 0.2) * (1 + d * 1.2);
      const r1 = unit * (1.1 + r() * 0.5);
      const half = 0.006 + r() * 0.01;
      fx.beginPath();
      fx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      fx.lineTo(cx + Math.cos(ang - half) * r0, cy + Math.sin(ang - half) * r0);
      fx.lineTo(cx + Math.cos(ang + half) * r0, cy + Math.sin(ang + half) * r0);
      fx.fill();
    }
    fx.globalAlpha = 1;
  }
  const liveStamp = { x: STAMP_PT.x, y: STAMP_PT.y };

  // ── the frame ────────────────────────────────────────────────────────────
  let lastDraw = -1, prevQ = new THREE.Quaternion();
  function update(dt, force = false, paint = true) {
    now += dt;

    // intro fly-in
    const ip = prog(now, 0, 0.85), eo = easeOutCubic(ip);
    const introY = lerp(-1.15, 0, easeOutBack(ip, 1.1));
    const introScale = lerp(0.82, 1, eo);
    tmpE.set(lerp(0.6, 0, eo), 0, lerp(-0.2, 0, eo));
    const qIntro = tmpQ2.setFromEuler(tmpE).clone();

    // throw / flip animation
    let lift = 0;
    if (anim) {
      const f = clamp((now - anim.t0) / anim.dur);
      q.copy(anim.from).slerp(anim.to, easeInOutCubic(f));
      lift = Math.sin(Math.PI * f);
      if (f >= 1) anim = null;
    } else if (!dragging) {
      const sp = angVel.length();
      if (sp > 0.02) {
        v3.copy(angVel).normalize();
        tmpQ.setFromAxisAngle(v3, sp * dt);
        q.premultiply(tmpQ).normalize();
        angVel.multiplyScalar(Math.exp(-dt * 2.8));
      } else angVel.set(0, 0, 0);
    }

    // zoom easing
    zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 10));
    updateCardPx();

    // idle sway + hover tilt (small, world-space)
    const calm = !dragging && !anim && angVel.length() < 0.15 ? 1 : 0;
    idle += (calm - idle) * Math.min(1, dt * 2);
    const sway = (0.085 * Math.sin(now * 0.85) + 0.022 * Math.sin(now * 1.9 + 1)) * idle;
    const swayP = 0.05 * Math.sin(now * 0.62 + 1.3) * idle;
    const tiltOn = hover.inside && hover.mouse !== false && !dragging ? 1 : 0;
    hover.amt += (tiltOn - hover.amt) * Math.min(1, dt * 5);
    hover.x += (hover.ax - hover.x) * Math.min(1, dt * 8);
    hover.y += (hover.ay - hover.y) * Math.min(1, dt * 8);

    // stamp impact kick
    vt = vtime();
    const dImp = stamped ? now - stampAt - PRE : -1;
    let kickZ = 0, kickX = 0, shX = 0, shY = 0, shR = 0, punch = 1;
    if (dImp > 0) {
      const env = Math.exp(-dImp * 7);
      kickZ = -0.07 * env * Math.cos(dImp * 26);
      kickX = 0.05 * env * Math.cos(dImp * 24 + 0.5);
      const e2 = Math.exp(-dImp * 11);
      shX = 0.010 * e2 * Math.sin(dImp * 70); shY = 0.013 * e2 * Math.cos(dImp * 62); shR = 0.009 * e2 * Math.sin(dImp * 55);
      punch = 1 + 0.05 * e2;
    }
    if (dImp >= 0 && !impactSeen) impactSeen = true;

    tmpE.set(swayP + kickX - hover.y * hover.amt * 0.12, sway + hover.x * hover.amt * 0.18, 0.014 * Math.sin(now * 0.5) * idle, 'XYZ');
    qd.setFromEuler(tmpE).multiply(q);
    qd.premultiply(qIntro);

    card.quaternion.copy(qd);
    card.position.set(0, introY, kickZ + 0.32 * lift);
    card.scale.setScalar(introScale);

    camera.position.set(shX, shY, D0 / (zoom * punch));
    camera.rotation.z = shR;
    sheen.position.set(Math.sin(now * 0.9) * 1.3, 0.7, 1.3);
    shadow.position.set(0.05, -0.09, -0.4 - card.position.z * 0.4);
    shadow.material.opacity = 0.5 * (1 - 0.35 * lift) * clamp(introScale * 1.2 - 0.2);
    shadow.scale.setScalar(1 + lift * 0.25);

    // which faces are showing → repaint only those
    const nf = v3.set(0, 0, 1).applyQuaternion(qd).clone();
    const draw = paint && (force || lastDraw < 0 || now - lastDraw >= 1 / 45);
    if (draw) {
      lastDraw = now;
      if (nf.z > -0.25) {
        let sT = scanState < 0 ? -1 : scanState === 99 ? 99 : TL.scan[0] + (now - scanStart);
        if (scanState === 0 && sT > TL.scan[1] + 0.05) { scanState = 99; scanned = true; sT = 99; }
        drawFront(front.ctx, vt, now, sT);
        front.tex.needsUpdate = true;
      }
      if (nf.z < 0.25) {
        const boarded = stamped && vt >= TL.train[1];
        const bt = boarded ? 5.8 + Math.max(0, vt - TL.train[1]) : 5.8;
        const nb = v3.set(0, 0, -1).applyQuaternion(qd);
        const s = clamp(Math.atan2(nb.x, nb.z), -0.6, 0.6);
        const sp = clamp(Math.asin(clamp(nb.y, -1, 1)), -0.6, 0.6);
        drawBack(back.ctx, bt, nb.z > 0 ? s : 0, nb.z > 0 ? sp : 0, boarded, now);
        back.tex.needsUpdate = true;
      }
    }

    // sounds: edge-on crossing + train rumble
    if (Math.sign(nf.z) !== Math.sign(lastNfZ) && now > 1) {
      const dq = prevQ.angleTo(qd) / Math.max(dt, 1e-3);
      sfx.flip(dq);
    }
    lastNfZ = nf.z; prevQ.copy(qd);
    const boardedNow = stamped && vt >= TL.train[1];
    sfx.ambient(boardedNow ? clamp(-nf.z * 1.4) : 0);

    if (paint) renderer.render(scene, camera);
    focusLines(dImp);
    setHint();
    const rideT = stamped && vt >= TL.train[1] ? 5.8 + Math.max(0, vt - TL.train[1]) : 5.8;
    const rideCaption = stamped && vt >= TL.train[1] && rideT >= CAP_START.train && (flippedOnce || nf.z < 0.2);
    $('site-link').classList.toggle('show', rideCaption);

    elTopFade();
  }
  const elTop = $('top-label');
  function elTopFade() { elTop.style.opacity = easeOutCubic(prog(now, 0.4, 1.1)) * 0.85; }

  // ── loop / test hooks ────────────────────────────────────────────────────
  let last = performance.now();
  function loop(tm) {
    requestAnimationFrame(loop);
    const dt = Math.min((tm - last) / 1000, 0.05); last = tm;
    update(dt);
  }
  window.__play = {
    tick: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) update(dt, true, i === n - 1); return { now, vt, stamped }; },
    state: () => ({ now, vt, stamped, scanState, zoom, nf: v3.set(0, 0, 1).applyQuaternion(qd).toArray() }),
    ticketScreen: () => {
      card.updateMatrixWorld(true);
      const c = toCard(TICKET.x + TICKET.w * 0.5, TICKET.y + TICKET.h * 0.5);
      tmpV.set(c.x, c.y, T / 2); card.localToWorld(tmpV); tmpV.project(camera);
      const r = root.getBoundingClientRect();
      return { x: r.left + (tmpV.x * 0.5 + 0.5) * r.width, y: r.top + (-tmpV.y * 0.5 + 0.5) * r.height };
    },
    flip, reset, restart,
  };
  window.__playReady = true;
  if (!MANUAL) requestAnimationFrame(loop);
  else update(0, true);
}

init();
