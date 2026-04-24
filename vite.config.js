import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from 'vite-plugin-sitemap'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      sitemap({
        hostname: env.VITE_APP_URL || 'http://localhost:4000',
        exclude: [
          '/dashboard',
          '/dashboard/deployments',
          '/dashboard/billing',
          '/dashboard/support',
        ],
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: new Date(),
        robots: [
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/dashboard/'],
            crawlDelay: 1,
          },
        ],
      }),
      ViteImageOptimizer({
        png: { quality: 80 },
        jpeg: { quality: 80 },
        jpg: { quality: 80 },
        webp: { quality: 80 },
      }),
    ],
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'query-vendor': ['@tanstack/react-query'],
            'ui-vendor': ['framer-motion', 'lucide-react'],
            'firebase-vendor': ['firebase/app', 'firebase/auth'],
            'terminal-vendor': [
              '@xterm/xterm',
              '@xterm/addon-fit',
              '@xterm/addon-serialize',
              '@xterm/addon-unicode11',
              '@xterm/addon-web-links',
              'socket.io-client',
            ],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
  }
})
