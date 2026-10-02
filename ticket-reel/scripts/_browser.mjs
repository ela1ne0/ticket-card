// Boots a local Vite server + headless Chromium. Shared by shots.mjs and export.mjs.
//   CHROME_PATH=/path/to/chrome   use a specific Chromium (optional)
//   SOFTWARE_GL=1                 force CPU rendering (only for machines with no GPU; slow)
import { createServer } from 'vite';
import { chromium } from 'playwright';

export async function boot({ width = 1080, height = 1920, query = '?export=1' } = {}) {
  const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const port = server.httpServer.address().port;

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
      ...(process.env.SOFTWARE_GL ? ['--use-angle=swiftshader'] : []),
    ],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/reel.html${query}`);
  await page.waitForFunction('window.__reelReady === true', null, { timeout: 60000 });

  const close = async () => { await browser.close(); await server.close(); };
  return { page, close };
}

// seek to t, wait for two animation frames so the canvas + DOM overlays are painted
export async function seek(page, t) {
  await page.evaluate(async (tt) => {
    window.__reel.seek(tt);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
}
