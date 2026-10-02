import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Link-preview images need an absolute URL. On Vercel the production domain is exposed at build time;
// elsewhere set SITE_URL (e.g. SITE_URL=https://yourname.com npm run build). Falls back to a relative path.
const siteUrl = () => {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return '';
};

// Two pages share one codebase + art:  /  (interactive card)  and  /reel.html  (scripted 9:16 reel)
export default defineConfig({
  base: './',
  plugins: [
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl()) },
  ],
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), reel: resolve(__dirname, 'reel.html') },
    },
  },
});
