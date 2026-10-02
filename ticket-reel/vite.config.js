import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages share one codebase + art:  /  (interactive card)  and  /reel.html  (scripted 9:16 reel)
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), reel: resolve(__dirname, 'reel.html') },
    },
  },
});
