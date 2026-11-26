import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    port: 5173,
    // shared/physics.js lives outside client/, so allow serving the repo root.
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    // In dev, /api goes to `wrangler dev`, so the client needs no CORS or env.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    outDir: 'dist',
    minify: true,      // production build is minified
    sourcemap: false,  // don't ship readable source maps
    chunkSizeWarningLimit: 900, // three.js is big
  },
});
