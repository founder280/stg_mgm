import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A demo build is served from a subdirectory on GitHub Pages, so the base
// path has to be baked in; a normal build stays at the site root.
const base = process.env.MGMS_BASE ?? '/console/';

export default defineConfig(({ mode }) => ({
  base: mode === 'demo' ? base : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The console talks to the API on the same origin in development, so no
      // CORS preflight and no separate base URL to configure.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    // Source maps are useful in a deployed app you operate; on a public static
    // demo they triple the download for no benefit to a visitor.
    sourcemap: mode !== 'demo',
  },
}));
