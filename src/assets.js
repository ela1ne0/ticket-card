// Loads the painted layers from public/assets (shared by reel.html and index.html).
const FILES = {
  platformBg: 'platform-bg.png', train: 'train-layer.png', girlShadow: 'girl-shadow.png',
  girl: 'girl-figure.png', interior: 'train-interior-bg.png', sitting: 'girl-sitting.png',
  buildings: 'buildings-strip.png', stampArt: 'stamp-art.png', stampHand: 'stamp-hand.png',
  click: 'click-to-stamp.png',
};

export async function loadImages() {
  const out = {};
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}assets/${f}`;
    await img.decode();
    out[k] = img;
  }));
  return out;
}
