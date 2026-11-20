import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Chunks built purely from Capacitor packages: the plugins' JS, reached only
// through a dynamic import that runs inside the iOS shell.
const isCapacitorOnly = (chunk) =>
  chunk.moduleIds.length > 0 &&
  chunk.moduleIds.every((id) => id.includes('node_modules/@capacitor/'))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Inner Ops',
        short_name: 'Inner Ops',
        description: 'Inner Ops — a system for turning self-awareness into self-command.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#000000',
        background_color: '#111827',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Capacitor chunks are requested only inside the iOS shell, where no
        // service worker runs. Web clients never fetch them.
        globIgnores: ['**/og-image.png', '**/capacitor-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-shell-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        // Surgical instead of drop_console:true so console.error survives in
        // production — logger.error() must actually emit so handled errors
        // reach the browser console and Sentry's console-breadcrumb capture.
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        drop_debugger: true,
        unused: true,
        dead_code: true,
        passes: 2
      },
      mangle: {}
    },
    rollupOptions: {
      output: {
        // Naming only. A manualChunks rule for Capacitor would pull Vite's
        // shared preload helper into that chunk and make every page load it.
        chunkFileNames: (chunk) =>
          isCapacitorOnly(chunk) ? 'assets/capacitor-[name]-[hash].js' : 'assets/[name]-[hash].js',
        manualChunks: (id) => {
          // Firebase core and essential modules
          if (id.includes('node_modules/firebase/app')) return 'firebase-core';
          if (id.includes('node_modules/firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/firebase/firestore')) return 'firebase-firestore';
          
          // UI libraries. Tested before the generic `node_modules/react`
          // matcher below, which would otherwise swallow react-hot-toast
          // (prefix match) and make this rule unreachable.
          if (id.includes('node_modules/react-hot-toast')) return 'ui-toast';

          // React ecosystem
          if (id.includes('node_modules/react')) return 'vendor-react';
        }
      }
    },
    chunkSizeWarningLimit: 100,
    sourcemap: false,
    reportCompressedSize: true,
    ssr: false
  },
  // Exclude Firebase from pre-bundling to allow better tree-shaking
  optimizeDeps: {
    exclude: ['firebase', 'firebase/app', 'firebase/auth', 'firebase/firestore']
  },
  define: {
    global: 'globalThis',
    // Finding 26 remediation: expose an explicit compile-time flag so the
    // logger can short-circuit its dev-only branches at build time. Terser's
    // dead_code pass then removes the branch bodies entirely.
    __INNER_OPS_IS_DEV__: JSON.stringify(process.env.NODE_ENV !== 'production')
  }
})
