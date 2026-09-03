import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// A demo build is served from a subdirectory on GitHub Pages, so the base
// path has to be baked in; a normal build stays at the site root.
const base = process.env.MGMS_BASE ?? '/camp/';

export default defineConfig(({ mode }) => ({
  base: mode === 'demo' ? base : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      // The published demo lives under a subdirectory, so the manifest's
      // scope and start URL must follow the same base.
      manifest: {
        id: base,
        scope: base,
        start_url: base,
        name: 'MGMS Camp — Onsite Medical Camp Data Collection',
        short_name: 'MGMS Camp',
        description:
          'Offline-first walk-in registration for temporary medical camps at mass gatherings.',
        theme_color: '#0b5cad',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The app shell must load with no network at all. API traffic is never
        // cached here — the outbox and the offline bundle in IndexedDB are the
        // only source of truth for data, and a stale cached API response would
        // quietly contradict them.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  // The preview server proxies too, so the production build — service worker
  // and all — can be exercised against a real API before it is deployed.
  preview: {
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    // Source maps are useful in a deployed app you operate; on a public static
    // demo they triple the download for no benefit to a visitor.
    sourcemap: mode !== 'demo',
  },
}));
