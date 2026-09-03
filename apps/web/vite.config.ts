import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
  build: { outDir: 'dist', sourcemap: true },
});
