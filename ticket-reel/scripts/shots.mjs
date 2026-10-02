// Quick QA: render still frames of the reel.   node scripts/shots.mjs 0.9 2.3 4.5 ...
//   output → ./shots/t-<time>.png   (1080x1920 by default)
import fs from 'node:fs';
import { boot, seek } from './_browser.mjs';

const times = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
if (!times.length) times.push(0.9, 2.0, 2.3, 3.5, 4.6, 6.6, 9.0, 11.5);
const outDir = process.env.OUT || 'shots';
fs.mkdirSync(outDir, { recursive: true });

const { page, close } = await boot({});
for (const t of times) {
  await seek(page, t);
  const file = `${outDir}/t-${t.toFixed(2).padStart(5, '0')}.png`;
  await page.locator('#stage').screenshot({ path: file });
  console.log('wrote', file);
}
await close();
