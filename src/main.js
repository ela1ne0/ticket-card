import './style.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/caveat/500.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { FW, FH, CARD_W, CARD_H, STAMP_PT, toCard } from './layout.js';
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

// ── assets ─────────────────────────────────────────────────────────────────
const FILES = {
  platformBg: 'platform-bg.png', train: 'train-layer.png', girlShadow: 'girl-shadow.png',
  girl: 'girl-figure.png', interior: 'train-interior-bg.png', sitting: 'girl-sitting.png',
  buildings: 'buildings-strip.png', stampArt: 'stamp-art.png', stampHand: 'stamp-hand.png',
  hand: 'hand.png', click: 'click-to-stamp.png',
};
async function loadImages() {
  const out = {};
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}assets/${f}`;
    await img.decode();
    out[k] = img;
  }));
  return out;
}

async function init() {
  await Promise.all([
    document.fonts.load('700 18px "Space Mono"'),
    document.fonts.load('400 18px "Space Mono"'),
    document.fonts.load('500 18px "Caveat"'),
  ]);
  setImages(await loadImages());

  // ── renderer / scene ─────────────────────────────────────────────────────
  const glCanvas = document.getElementById('gl');
  const fxCanvas = document.getElementById('fx');
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(OUT_W, OUT_H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  fxCanvas.width = OUT_W; fxCanvas.height = OUT_H;
  const fx = fxCanvas.getContext('2d');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const FOV = 30;
  const camera = new THREE.PerspectiveCamera(FOV, OUT_W / OUT_H, 0.1, 30);
  // card = 94% of frame width at rest
  const D0 = (CARD_W / 0.94 / 2) / (Math.tan((FOV * Math.PI) / 360) * (OUT_W / OUT_H));
  camera.position.set(0, 0, D0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9bb4ff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-1.6, 2.2, 3.2);
  scene.add(key);
  const sheen = new THREE.PointLight(0xffffff, 2.2, 8, 2);
  scene.add(sheen);

  // ── card ─────────────────────────────────────────────────────────────────
  const R = 0.03, T = 0.016;
  const shape = new THREE.Shape();
  {
    const x = -CARD_W / 2, y = -CARD_H / 2, w = CARD_W, h = CARD_H;
    shape.moveTo(x + R, y);
    shape.lineTo(x + w - R, y); shape.absarc(x + w - R, y + R, R, -Math.PI / 2, 0, false);
    shape.lineTo(x + w, y + h - R); shape.absarc(x + w - R, y + h - R, R, 0, Math.PI / 2, false);
    shape.lineTo(x + R, y + h); shape.absarc(x + R, y + h - R, R, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + R); shape.absarc(x + R, y + R, R, Math.PI, Math.PI * 1.5, false);
  }
  const faceGeo = new THREE.ShapeGeometry(shape, 14);
  {
    const p = faceGeo.attributes.position, uv = faceGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / CARD_W + 0.5, p.getY(i) / CARD_H + 0.5);
  }
  const edgeGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 14 });
  edgeGeo.translate(0, 0, -T / 2);

  const mkTex = () => {
    const c = document.createElement('canvas');
    c.width = FW; c.height = FH;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return { c, ctx: c.getContext('2d'), tex };
  };
  const front = mkTex(), back = mkTex();
  const faceMat = (tex) => new THREE.MeshPhysicalMaterial({
    map: tex, color: 0x1e1e1e, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.0,
    roughness: 0.5, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.7,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const card = new THREE.Group();
  const frontMesh = new THREE.Mesh(faceGeo, faceMat(front.tex));
  frontMesh.position.z = T / 2 + 0.0004;
  const backMesh = new THREE.Mesh(faceGeo, faceMat(back.tex));
  backMesh.rotation.y = Math.PI;
  backMesh.position.z = -T / 2 - 0.0004;
  const edgeMesh = new THREE.Mesh(edgeGeo, new THREE.MeshStandardMaterial({ color: 0xdfe7ff, roughness: 0.6 }));
  card.add(edgeMesh, frontMesh, backMesh);
  card.rotation.order = 'YXZ';
  scene.add(card);

  // soft fake shadow behind the card
  const shC = document.createElement('canvas'); shC.width = 256; shC.height = 256;
  {
    const c = shC.getContext('2d');
    c.filter = 'blur(16px)';
    c.fillStyle = 'rgba(5,16,70,1)';
    c.beginPath(); c.roundRect(48, 60, 160, 136, 14); c.fill();
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shC), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  shadow.position.set(0.05, -0.09, -0.4);
  scene.add(shadow);

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
