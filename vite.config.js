import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from 'vite-plugin-sitemap'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import { DEFAULT_APP_URL } from './config/defaults.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Canonical public origin for every static SEO asset (sitemap <loc>, og:image,
  // og:url, canonical link, JSON-LD @id/url). It must point at the production
  // domain regardless of where the build runs — NOT at VITE_APP_URL, which is the
  // dev proxy target (= localhost in .env) and is undefined in the Docker build,
  // so it would otherwise bake `http://localhost:4000` into every meta tag.
  // Defaults to DEFAULT_APP_URL; override per-deployment with VITE_SITE_URL.
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_APP_URL).replace(/\/+$/, '')

  // Replace the __SITE_URL__ token in index.html with the canonical origin. We use
  // a custom token rather than Vite's %VITE_APP_URL% syntax precisely so it is
  // immune to VITE_APP_URL: Vite never touches __SITE_URL__, so this is the single
  // source of truth for the page's SEO origin.
  const htmlSeoOrigin = {
    name: 'html-seo-origin',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
  }

  return {
    plugins: [
      react(),
      htmlSeoOrigin,
      sitemap({
        hostname: siteUrl,
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
      https: {
        key: './certs/key.pem',
        cert: './certs/cert.pem',
      },
      proxy: {
        '/api': {
          target: `http://localhost:${env.SERVER_PORT || 4000}`,
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
