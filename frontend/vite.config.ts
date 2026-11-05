import adapter from '@sveltejs/adapter-static';
import { withPwa } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  // withPwa wraps the SvelteKit plugin and adds the service worker + web app manifest.
  plugins: withPwa(
    {
      // Static build: host the PWA anywhere (or let FastAPI serve it).
      adapter: adapter({ fallback: 'index.html' })
    },
    {
      registerType: 'autoUpdate',
      // SPA (no prerendered pages): precache the client bundle and fall back to the app shell offline.
      workbox: {
        globPatterns: ['client/**/*.{js,css,svg,png,webmanifest}'],
        navigateFallback: '/',
        globStrict: false
      },
      manifest: {
        name: 'To-do',
        short_name: 'To-do',
        description: 'Personal to-do list with inbox and tags',
        theme_color: '#F0A81C',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      }
    }
  )
});
