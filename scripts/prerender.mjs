// Post-build prerender: snapshot the client-rendered marketing routes to static
// HTML so crawlers that DON'T execute JavaScript — most AI/answer engines
// (GPTBot, ClaudeBot, PerplexityBot, CCBot) and the first pass of search bots —
// receive the full page text, not an empty <div id="root"> + <noscript> stub.
//
// It serves the freshly built /dist over a local Express server, drives a
// headless Chromium with puppeteer-core (already a runtime dependency; it does
// NOT bundle a browser), waits for React to paint, and overwrites each route's
// index.html with the rendered DOM. The client still boots normally on top of it.
//
// Chromium resolution: CHROMIUM_PATH / PUPPETEER_EXECUTABLE_PATH, then common
// system locations. If none is found the script logs a warning and exits 0 —
// the build still succeeds with the plain SPA shell (the pre-prerender behaviour),
// so a developer without Chromium is never blocked. The Docker builder installs
// Chromium and sets CHROMIUM_PATH, so production images are always prerendered.

import express from 'express'
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_APP_URL,
  DEFAULT_PAYMENT_BRIDGE_URL,
  DEFAULT_GA_MEASUREMENT_ID,
  DEFAULT_FIREBASE,
} from '../config/defaults.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

// Minimal stand-in for the BFF's GET /api/config. The app aborts bootstrap with
// "Unable to start Orbit" if Firebase options are missing, so the prerender
// server must answer this with a valid (secret-free) config. Mirrors server.js;
// analytics is forced off so GA doesn't fire or mutate the DOM during capture.
const prerenderConfig = {
  appUrl: DEFAULT_APP_URL,
  paymentBridgeUrl: DEFAULT_PAYMENT_BRIDGE_URL,
  firebase: { ...DEFAULT_FIREBASE },
  analytics: { enabled: false, measurementId: DEFAULT_GA_MEASUREMENT_ID },
}

// Only public, content-bearing routes. Auth/transactional routes (/login,
// /deploy, /dashboard/*) are intentionally excluded — they are not indexable.
const ROUTES = ['/']

function resolveChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean)
  return candidates.find((c) => existsSync(c)) || null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    console.error('[prerender] dist/index.html not found — run `vite build` first.')
    process.exit(1)
  }

  const executablePath = resolveChromium()
  if (!executablePath) {
    console.warn(
      '[prerender] No Chromium found (set CHROMIUM_PATH). Skipping prerender — ' +
        'the build will ship the plain SPA shell. This is fine for local dev.',
    )
    process.exit(0)
  }

  // Serve the built bundle with an SPA fallback so client routing resolves.
  const app = express()
  // Unblock app bootstrap (Firebase needs real config).
  app.get('/api/config', (_req, res) => res.json(prerenderConfig))
  // The landing map pulls live node stats; short-circuit so the component takes
  // its built-in "unavailable" path instead of hanging on the real Flux fetch.
  // (Not indexable content — the surrounding section text is static.)
  app.get('/api/network-stats', (_req, res) => res.status(503).end())
  app.use(express.static(distDir, { index: 'index.html', extensions: ['html'] }))
  app.use((req, res) => res.sendFile(path.join(distDir, 'index.html')))
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  let failures = 0
  try {
    for (const route of ROUTES) {
      const page = await browser.newPage()
      // Desktop viewport so the desktop layout (not the mobile variant) is captured.
      await page.setViewport({ width: 1280, height: 900 })
      try {
        await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 45000 })
        // The app mounts an <h1> once React has rendered the landing page.
        await page.waitForSelector('#root h1', { timeout: 30000 })
        // Let lazy chunks, Helmet head updates and initial animations settle.
        await sleep(1500)

        // react-helmet-async injects route meta (title/description/og:*) without
        // removing the static index.html tags of the same key, so the rendered
        // head ends up with duplicate <title> and meta. Crawlers should see one
        // of each — collapse duplicates (keep first in document order) so the
        // indexable HTML is clean. Only affects this snapshot, not the live app.
        await page.evaluate(() => {
          const head = document.head
          const titles = head.querySelectorAll('title')
          for (let i = 1; i < titles.length; i++) titles[i].remove()
          const seen = new Set()
          for (const m of head.querySelectorAll('meta[name], meta[property]')) {
            const key = m.getAttribute('name') ? `n:${m.getAttribute('name')}` : `p:${m.getAttribute('property')}`
            if (seen.has(key)) m.remove()
            else seen.add(key)
          }
        })

        const html = await page.content()
        const outDir = route === '/' ? distDir : path.join(distDir, route)
        await mkdir(outDir, { recursive: true })
        await writeFile(path.join(outDir, 'index.html'), html, 'utf8')

        const rootText = await page.$eval('#root', (el) => el.innerText.length).catch(() => 0)
        console.log(`[prerender] ${route} -> ${path.relative(process.cwd(), path.join(outDir, 'index.html'))} (${rootText} chars of text)`)
        if (rootText < 500) {
          console.warn(`[prerender] WARNING: ${route} rendered only ${rootText} chars — content may be missing.`)
        }
      } catch (err) {
        failures++
        console.error(`[prerender] FAILED ${route}: ${err.message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }

  // Don't fail the build on a prerender hiccup — the SPA shell is a valid fallback.
  if (failures) console.warn(`[prerender] completed with ${failures} failed route(s).`)
  else console.log('[prerender] done.')
}

main().catch((err) => {
  console.error('[prerender] fatal:', err)
  // Soft-fail: a broken prerender must not break an otherwise-good build.
  process.exit(0)
})
