import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwaApp } from '@huishouden/pwa-kit/vite';

const googleFontsCache = (urlPattern: RegExp, cacheName: string) => ({
  urlPattern,
  handler: 'CacheFirst' as const,
  options: {
    cacheName,
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaApp({
      // Bills' path on the suite's one site (pwa-kit docs/one-site.md).
      base: '/bills/',
      name: 'Huishouden Bills',
      shortName: 'Bills',
      description: "What's due, and when",
      themeColor: '#1b4332',
      backgroundColor: '#faf9f5',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // Bill reminders as notifications from the shared sender (huishouden/notify).
      push: true,
      overrides: {
        manifest: { categories: ['finance', 'lifestyle', 'productivity'] },
        workbox: {
          runtimeCaching: [
            googleFontsCache(/^https:\/\/fonts\.googleapis\.com\/.*/i, 'google-fonts-cache'),
            googleFontsCache(/^https:\/\/fonts\.gstatic\.com\/.*/i, 'gstatic-fonts-cache'),
          ],
        },
      },
    }),
  ],
});
