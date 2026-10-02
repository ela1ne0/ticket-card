// Shared 3D card: renderer, lights, glossy two-sided card with canvas-painted faces.
// Used by both the reel (reel.html) and the interactive page (index.html).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FW, FH, CARD_W, CARD_H } from './layout.js';

export const FOV = 30;
export const THICK = 0.016; // card thickness in world units (card is 1.0 wide)

export function buildScene(glCanvas, { width, height, pixelRatio = 1 }) {
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 30);
  camera.position.set(0, 0, 3.5);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9bb4ff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-1.6, 2.2, 3.2);
  scene.add(key);
  const sheen = new THREE.PointLight(0xffffff, 2.2, 8, 2);
  scene.add(sheen);

  // ── card ─────────────────────────────────────────────────────────────────
  const R = 0.03, T = THICK;
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
  // emissive = the exact painted colours; lights/env only add the glossy highlights on top
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

  // distance at which the card fills `fillW` of the frame width AND at most `fillH` of its height
  function fitDistance(aspect, fillW = 0.94, fillH = 1) {
    const th = Math.tan((FOV * Math.PI) / 360);
    const dW = CARD_W / fillW / 2 / (th * aspect);
    const dH = CARD_H / fillH / 2 / th;
    return Math.max(dW, dH);
  }
  function resize(w, h, dpr = 1) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    THREE, renderer, scene, camera, card, frontMesh, backMesh, front, back,
    shadow, sheen, T, fitDistance, resize,
  };
}
