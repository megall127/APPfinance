import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Lefinance',
        short_name: 'Lefinance',
        description: 'Controle de contas mensais e finanças pessoais',
        theme_color: '#4CAF82',
        background_color: '#FBFDFB',
        display: 'standalone',
        start_url: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the Vite build assets (JS, CSS, HTML).
        // Do NOT aggressively cache API calls — the API lives on a separate origin.
        // Goal for v1: installable, not full offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Don't precache large favicon/logo images — the browser fetches the
        // favicon directly; precaching big images would bloat the SW and can
        // exceed the precache size limit. Raise the limit modestly as a safety net.
        globIgnores: ['**/favicon.png', '**/ChatGPT*.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Exclude any /api routes from precaching (separate origin anyway)
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      // @/ alias for imports like: import x from '@/lib/x'
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split recharts (and its transitive deps) into a dedicated chunk
        // so the main app bundle stays lean.
        manualChunks(id: string) {
          if (id.includes('/recharts/') || id.includes('/victory-vendor/')) {
            return 'recharts'
          }
        },
      },
    },
  },
})
