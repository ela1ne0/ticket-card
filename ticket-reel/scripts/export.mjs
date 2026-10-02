// Frame-by-frame export → 1080x1920 MP4 (with the synthesized sound baked in).
//
//   npm run export                         → ./reel.mp4  (30 fps)
//   npm run export -- --fps 60 --out big.mp4
//   npm run export -- --w 720              smaller/faster test render
//   npm run export -- --no-audio
//
// Needs: Chromium for Playwright (`npx playwright install chromium`, once) and ffmpeg on PATH.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { boot, seek } from './_browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const FPS = Number(opt('fps', 30));
const W = Number(opt('w', 1080));
const H = Math.round((W * 16) / 9);
const OUT = path.resolve(opt('out', 'reel.mp4'));
const AUDIO = !args.includes('--no-audio');
const FROM = Number(opt('from', 0));

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`) and re-run.');
  process.exit(1);
}

const { page, close } = await boot({ width: W, height: H, query: `?export=1&w=${W}` });
const total = await page.evaluate('window.__reel.total');
const TO = Number(opt('to', total));
const n = Math.round((TO - FROM) * FPS);

const tmp = fs.mkdtempSync(path.join(path.dirname(OUT), '.reel-frames-'));
console.log(`rendering ${n} frames @ ${FPS}fps, ${W}x${H} …`);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await seek(page, FROM + i / FPS);
  await page.screenshot({
    path: path.join(tmp, `${String(i).padStart(5, '0')}.jpg`),
    type: 'jpeg', quality: 95,
    clip: { x: 0, y: 0, width: W, height: H },
  });
  if (i % 30 === 0) process.stdout.write(`\r  ${i}/${n}`);
}
process.stdout.write(`\r  ${n}/${n}  (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);

let wav = null;
if (AUDIO) {
  console.log('rendering audio …');
  const b64 = await page.evaluate('window.__reel.renderWav()');
  wav = path.join(tmp, 'audio.wav');
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
}
await close();

const ff = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(tmp, '%05d.jpg'),
  ...(wav ? ['-ss', String(FROM), '-t', String(TO - FROM), '-i', wav] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  ...(wav ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
  '-movflags', '+faststart', OUT,
];
const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
if (r.status === 0) {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`done → ${OUT}`);
} else {
  console.error(`ffmpeg failed; frames kept in ${tmp}`);
  process.exit(1);
}
