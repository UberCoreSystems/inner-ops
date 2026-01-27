import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        unused: true,
        dead_code: true,
        passes: 2
      },
      mangle: {
        properties: {
          regex: /^_/
        }
      }
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Firebase core and essential modules
          if (id.includes('node_modules/firebase/app')) return 'firebase-core';
          if (id.includes('node_modules/firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/firebase/firestore')) return 'firebase-firestore';
          
          // React ecosystem
          if (id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-react';
          if (id.includes('node_modules/react-dom')) return 'vendor-react';
          
          // UI libraries
          if (id.includes('node_modules/react-hot-toast')) return 'ui-toast';
          if (id.includes('node_modules/framer-motion')) return 'ui-motion';
          
          // AI/OpenAI
          if (id.includes('node_modules/openai')) return 'ai-openai';
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
    global: 'globalThis'
  }
})
