import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from 'vite-plugin-sitemap'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import { DEFAULT_APP_URL } from './config/defaults.js'
import { buildJsonLd, buildStaticHome } from './scripts/buildSeoContent.mjs'
import { MARKETING_ROUTES } from './src/content/pagesContent.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Canonical public origin for every static SEO asset (sitemap <loc>, og:image,
  // og:url, canonical link, JSON-LD @id/url). It must point at the production
  // domain regardless of where the build runs — NOT at VITE_APP_URL, which is the
  // dev proxy target (= localhost in .env) and is undefined in the Docker build,
  // so it would otherwise bake `http://localhost:4000` into every meta tag.
  // Defaults to DEFAULT_APP_URL; override per-deployment with VITE_SITE_URL.
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_APP_URL).replace(/\/+$/, '')

  // Inject the generated SEO blocks into index.html, then resolve the origin
  // token. Order matters: the generated JSON-LD itself contains __SITE_URL__
  // tokens, so injection must happen before the replacement — doing both in one
  // pass guarantees that. The JSON-LD/noscript are built from the same data the
  // live components use (scripts/buildSeoContent.mjs), so they can't drift.
  // We use a custom __SITE_URL__ token rather than Vite's %VITE_APP_URL% syntax
  // so the SEO origin is immune to VITE_APP_URL and has a single source of truth.
  const htmlSeo = {
    name: 'html-seo',
    transformIndexHtml: (html) =>
      html
        .replace('<!--SEO:JSONLD-->', buildJsonLd())
        .replace('<!--SEO:ROOT-->', buildStaticHome())
        .replaceAll('__SITE_URL__', siteUrl),
  }

  // AI / answer-engine crawlers. We welcome them explicitly (no crawl-delay) so
  // they can fully ingest the marketing pages and cite Orbit in generated
  // answers (ChatGPT, Perplexity, Gemini/AI Overviews, Claude, etc.). Note: a
  // bot that matches its own User-agent group ignores the `*` group entirely, so
  // each must re-state the /dashboard/ disallow.
  const aiCrawlers = [
    'GPTBot', // OpenAI — model training
    'OAI-SearchBot', // OpenAI — ChatGPT Search index
    'ChatGPT-User', // OpenAI — user-triggered browsing
    'ClaudeBot', // Anthropic — crawling
    'Claude-User', // Anthropic — user-triggered browsing
    'anthropic-ai', // Anthropic — legacy UA
    'PerplexityBot', // Perplexity — index
    'Perplexity-User', // Perplexity — user-triggered fetch
    'Google-Extended', // Google — Gemini training & AI Overviews grounding
    'Applebot-Extended', // Apple Intelligence
    'CCBot', // Common Crawl — feeds many open LLMs
  ]

  return {
    plugins: [
      react(),
      htmlSeo,
      sitemap({
        hostname: siteUrl,
        // Marketing/content routes that must appear in sitemap.xml. Auth and
        // transactional routes are intentionally omitted (see exclude below).
        dynamicRoutes: MARKETING_ROUTES,
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
          // Generic crawlers: index everything except the app, gentle pacing.
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/dashboard/'],
            crawlDelay: 1,
          },
          // AI engines: same access, but no crawl-delay throttle.
          ...aiCrawlers.map((userAgent) => ({
            userAgent,
            allow: '/',
            disallow: ['/dashboard/'],
          })),
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
