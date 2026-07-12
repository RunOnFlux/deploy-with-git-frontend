// Post-build SSR prerender (no headless browser required).
//
// For every indexable route — the homepage and each marketing page — this renders
// the REAL React tree to HTML (src/entry-server.jsx → renderToString + StaticRouter)
// and writes it into <div id="root">. The client then HYDRATES that markup instead
// of calling createRoot(), which used to wipe the DOM and re-render from scratch:
// the visible "page loads, then reloads" flash.
//
// Two things follow from rendering the actual components:
//   - non-JS crawlers (Bing, most LLM bots) see exactly what a user sees, and the
//     crawlable body can no longer drift from the app — it IS the app.
//   - the markup the browser hydrates is what React itself would have produced.
//
// The <head> is still stamped here, per route: <title>, meta description, OG/Twitter
// title/description/url, and canonical. Page JSON-LD is NOT stamped here any more:
// MarketingPage emits its BreadcrumbList/WebPage/FAQPage graph itself (via <Helmet>)
// and that now survives into the SSR body, so a head copy would be a duplicate.
// The homepage's site-wide graph (Organization/WebSite/SoftwareApplication/FAQPage)
// still lives in index.html's <head> — no component emits it — and is dropped from
// the marketing shells for the same anti-duplication reason.
//
// server.js serves dist/ statically, so dist/<route>/index.html is what a crawler
// (and a cold browser hit) gets for that route.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_APP_URL } from '../config/defaults.js'
import { MARKETING_PAGES } from '../src/content/pagesContent.js'
// The SSR bundle, built by `npm run build:ssr`. It lives OUTSIDE dist/ on purpose:
// Express serves dist/ statically, and the render bundle has no business being
// downloadable (nor shipped in the Docker image, which copies only dist/).
import { render } from '../dist-ssr/entry-server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const indexPath = join(distDir, 'index.html')

if (!existsSync(indexPath)) {
  console.error('[prerender] dist/index.html not found — run `vite build` first.')
  process.exit(1)
}

const baseHtml = await readFile(indexPath, 'utf8')

// Resolve the canonical origin exactly like vite.config.js does, so the routes
// generated here match the origin baked into the built index.html.
const siteUrl = (process.env.VITE_SITE_URL || DEFAULT_APP_URL).replace(/\/+$/, '')

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const JSONLD_SCRIPT = /<script type="application\/ld\+json">[\s\S]*?<\/script>/

/**
 * Remove <title>/<meta>/<link> from the server-rendered body.
 *
 * React 19 treats those three as "hoistable": on the client it lifts them out of the
 * component tree into <head> by itself — which is how <Helmet> still works, now that
 * react-helmet-async@3 is a thin shim over React 19's own metadata support.
 * renderToString has no document to hoist into, so it emits them inline instead,
 * leaving a <link rel="canonical"> in the <body> (where Google ignores it) and
 * duplicating the meta this script already stamps into <head>.
 *
 * Stripping them is also what keeps hydration clean: the client never puts these
 * nodes inside the container either, so removing them makes the server markup match
 * the client's first render. JSON-LD <script> tags are NOT hoistable — React renders
 * them in place on both sides — so they are deliberately left alone.
 */
const stripHoistables = (html) =>
  html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*\/?>/gi, '')
    .replace(/<link\b[^>]*\/?>/gi, '')

/**
 * Put the route's SSR markup into #root, tagged with the path it was rendered for.
 * main.jsx hydrates only when data-ssr-path matches the URL being loaded: the
 * Express SPA fallback serves this same index.html for /login, /dashboard, … where
 * the homepage markup is NOT what the client renders, and hydrating it there would
 * be a mismatch. Those keep taking the createRoot path.
 */
// index.html ships an EMPTY #root (Vite hoists the module script into <head>, so
// the root element is the last thing in <body>), which is what makes this a plain
// "first </div> closes it" replace.
const withRoot = (html, routePath, ssrHtml) =>
  html.replace(
    /<div id="root"\s*>\s*<\/div>/i,
    () => `<div id="root" data-ssr-path="${esc(routePath)}">${stripHoistables(ssrHtml)}</div>`,
  )

function buildRouteHtml(routePath, page, ssrHtml) {
  const canonical = `${siteUrl}${routePath}`
  let html = baseHtml

  html = withRoot(html, routePath, ssrHtml)

  // The site-wide graph in <head> is the homepage's. On a marketing page its FAQPage
  // would collide with the page's own FAQPage (rendered into the body by
  // MarketingPage), so drop it — the page's own graph is the one that belongs here.
  html = html.replace(JSONLD_SCRIPT, '')

  // Head meta.
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(page.title)}</title>`)
  html = html.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${esc(page.description)}" />`)
  html = html.replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(page.title)}" />`)
  html = html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(page.description)}" />`)
  html = html.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(canonical)}" />`)
  html = html.replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(page.title)}" />`)
  html = html.replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(page.description)}" />`)
  html = html.replace(/<meta name="twitter:url"[^>]*>/i, `<meta name="twitter:url" content="${esc(canonical)}" />`)
  html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(canonical)}" />`)

  return html
}

// The homepage: only #root changes. Its <head> (meta + the site-wide JSON-LD graph)
// stays exactly as authored in index.html / injected by vite.config.js.
const home = await render('/')
await writeFile(indexPath, withRoot(baseHtml, '/', home.html), 'utf8')
console.log('[prerender] wrote / -> dist/index.html')

let count = 1
for (const [routePath, page] of Object.entries(MARKETING_PAGES)) {
  const { html } = await render(routePath)
  const outPath = join(distDir, routePath.replace(/^\//, ''), 'index.html')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, buildRouteHtml(routePath, page, html), 'utf8')
  count++
  console.log(`[prerender] wrote ${routePath} -> ${outPath.replace(distDir, 'dist')}`)
}

console.log(`[prerender] done — ${count} route(s) server-rendered.`)
