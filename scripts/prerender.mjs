// Post-build prerender (string-based — no headless browser required).
//
// Orbit's homepage content is baked directly into #root at build time by
// vite.config.js (buildStaticHome), so dist/index.html already ships a populated
// DOM for crawlers that don't run JS. This script generates the *additional*
// marketing routes (the decentralized-hosting pillar and the /vs/* comparisons)
// by taking that built index.html and swapping, per route:
//   - the in-#root content region (between the ROOT_START/ROOT_END sentinels),
//   - <title> + meta description + OG/Twitter title/description/url + canonical,
//   - the JSON-LD @graph (home graph -> per-page BreadcrumbList/WebPage/FAQPage).
// Each shell still boots the same SPA bundle, so JS clients get the live React
// route; non-JS crawlers get real, keyword-relevant HTML in #root.
//
// This deliberately replaces the previous puppeteer-based approach, which left
// #root EMPTY whenever Chromium wasn't installed (the common case) — the whole
// reason the site wasn't truly prerendered.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_APP_URL } from '../config/defaults.js'
import {
  MARKETING_PAGES,
  buildMarketingRoot,
  buildMarketingJsonLd,
  ROOT_START,
  ROOT_END,
} from './buildSeoContent.mjs'

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

const ROOT_REGION = new RegExp(`${ROOT_START}[\\s\\S]*?${ROOT_END}`)
const JSONLD_SCRIPT = /<script type="application\/ld\+json">[\s\S]*?<\/script>/

function buildRouteHtml(routePath, page) {
  const canonical = `${siteUrl}${routePath}`
  let html = baseHtml

  // Swap the in-#root content region for this page's content.
  html = html.replace(ROOT_REGION, buildMarketingRoot(page))

  // Per-page structured data (resolve the __SITE_URL__ token to the real origin).
  const jsonLd = buildMarketingJsonLd(routePath, page).replaceAll('__SITE_URL__', siteUrl)
  html = html.replace(JSONLD_SCRIPT, jsonLd)

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

let count = 0
for (const [routePath, page] of Object.entries(MARKETING_PAGES)) {
  const outPath = join(distDir, routePath.replace(/^\//, ''), 'index.html')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, buildRouteHtml(routePath, page), 'utf8')
  count++
  console.log(`[prerender] wrote ${routePath} -> ${outPath.replace(distDir, 'dist')}`)
}

console.log(`[prerender] done — ${count} marketing route(s) generated.`)
