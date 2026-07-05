/**
 * Build-time SEO content generators. Emit the JSON-LD structured data and the
 * <noscript> crawler fallback from the SAME sources the live components use
 * (src/content/landingContent.js + src/config/plans.js), so the two can never
 * drift again. Consumed by vite.config.js, which injects the output into
 * index.html (replacing the <!--SEO:JSONLD--> / <!--SEO:ROOT--> markers) and
 * then resolves the __SITE_URL__ origin token.
 *
 * Output keeps the __SITE_URL__ token literal — vite.config replaces it after
 * injection, so this module stays origin-agnostic.
 */

import { SITE_FACTS, FAQS, FEATURES, FLUX_HOSTING_LINKS } from '../src/content/landingContent.js'
import { ORBIT_PLANS } from '../src/config/plans.js'
import { MARKETING_PAGES } from '../src/content/pagesContent.js'
import { REVIEWS, RATING_BEST } from '../src/config/reviews.js'

const ORIGIN = '__SITE_URL__'

// Sentinel comments wrap the in-#root static content so the post-build prerender
// (scripts/prerender.mjs) can swap the home content for a subpage's content by a
// simple, robust string replace. They survive into dist/index.html.
export const ROOT_START = '<!--ORBIT_ROOT_START-->'
export const ROOT_END = '<!--ORBIT_ROOT_END-->'

/** "0.5 vCPU, 1 GB RAM, 5 GB storage, 1 instance" — or the custom ranges. */
function specList(plan) {
  if (plan.cpu != null) {
    return [
      `${plan.cpu} vCPU`,
      `${plan.ram} GB RAM`,
      `${plan.hdd} GB SSD/NVMe storage`,
      `${plan.instances} instance${plan.instances > 1 ? 's' : ''}`,
    ]
  }
  return [plan.cpuRange, `${plan.ramRange} RAM`, `${plan.hddRange} storage`, `${plan.instancesRange} instances`]
}

function priceText(plan) {
  if (plan.id === 'custom') return 'from $0.99/mo'
  return plan.price === 0 ? '$0/mo' : `$${plan.price}/mo`
}

function offerPrice(plan) {
  // schema.org Offer needs a numeric price; custom advertises its $0.99 floor.
  return plan.id === 'custom' ? '0.99' : String(plan.price)
}

/**
 * schema.org AggregateRating + Review fragment for the SoftwareApplication node.
 * Returns an EMPTY object when there are no real reviews, so no rating markup is
 * emitted at all — never fabricate ratings (see src/config/reviews.js). When
 * genuine reviews exist, computes the average + count and lists each Review.
 */
function ratingFragment() {
  if (!Array.isArray(REVIEWS) || REVIEWS.length === 0) return {}
  const count = REVIEWS.length
  const avg = REVIEWS.reduce((sum, r) => sum + Number(r.rating), 0) / count
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Number(avg.toFixed(2)),
      reviewCount: count,
      bestRating: RATING_BEST,
      worstRating: 1,
    },
    review: REVIEWS.map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: Number(r.rating),
        bestRating: RATING_BEST,
        worstRating: 1,
      },
      reviewBody: r.body,
      ...(r.datePublished ? { datePublished: r.datePublished } : {}),
    })),
  }
}

/** schema.org @graph as a <script type="application/ld+json"> string. */
export function buildJsonLd() {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Flux Labs',
      url: 'https://runonflux.com',
      logo: `${ORIGIN}/orbit-logo.svg`,
      // Canonical Flux entity profiles — keep identical across the whole site
      // family so search engines/LLMs consolidate the entity.
      sameAs: [
        'https://twitter.com/RunOnFlux',
        'https://github.com/RunOnFlux',
        'https://runonflux.com',
        'https://discord.com/invite/runonflux',
      ],
      parentOrganization: {
        '@type': 'Organization',
        name: 'InFlux Technologies',
        url: 'https://runonflux.com',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: 'Orbit by Flux',
      url: `${ORIGIN}/`,
      description:
        'Deploy any Git repo to the Flux decentralized cloud. Orbit auto-detects your framework and ships to global nodes — free tier, paid plans from $0.99/mo.',
      publisher: { '@id': `${ORIGIN}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${ORIGIN}/#app`,
      name: 'Orbit',
      url: `${ORIGIN}/`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      description: `Git-native deployment platform for the Flux decentralized network. Deploy any stack — Next.js, Vue, Rust, Go, Rails and more — across ${SITE_FACTS.nodeCount} of global nodes. Free tier, zero configuration, built-in CI/CD.`,
      offers: ORBIT_PLANS.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        description: `${plan.description}. ${specList(plan).join(', ')}.`,
        price: offerPrice(plan),
        priceCurrency: 'USD',
        ...(plan.price === 0 ? {} : { billingPeriod: 'P1M' }),
      })),
      featureList: FEATURES.map((f) => f.title).join(', '),
      // AggregateRating/Review — emitted ONLY when real reviews exist (empty
      // otherwise; see src/config/reviews.js). Never fabricate ratings.
      ...ratingFragment(),
    },
    {
      '@type': 'FAQPage',
      '@id': `${ORIGIN}/#faq`,
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ]

  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
  return `<script type="application/ld+json">${json}</script>`
}

// Minimal inline styling so the pre-hydration content is legible for the rare
// JS-disabled human. Crawlers ignore it; React wipes #root on boot so JS users
// never see it. Kept tiny and self-contained.
const STATIC_STYLE =
  '<style>#orbit-seo{max-width:880px;margin:0 auto;padding:40px 20px;font-family:Inter,system-ui,-apple-system,sans-serif;color:#c7d2e0;line-height:1.65}#orbit-seo h1{font-size:2.2rem;line-height:1.15;color:#e8eefc;margin:0 0 .6rem}#orbit-seo h2{font-size:1.4rem;color:#e8eefc;margin:2rem 0 .6rem}#orbit-seo h3{font-size:1.05rem;color:#e8eefc;margin:1.2rem 0 .3rem}#orbit-seo a{color:#7cc7ff}#orbit-seo table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.92rem}#orbit-seo th,#orbit-seo td{border:1px solid #26324a;padding:8px 10px;text-align:left}</style>'

/**
 * Keyword-rich cross-links to sibling Flux hosting sites + the cloud, emitted
 * into the static (crawlable) footer. Real, followed links (target=_blank,
 * rel="noopener noreferrer") — deliberately excludes Orbit. Mirrors the live
 * React footer so the prerendered HTML carries the same link equity.
 */
function crossLinksFooter() {
  const links = FLUX_HOSTING_LINKS.map(
    (l) => `<a href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`,
  ).join(' · ')
  return `<nav aria-label="Explore other Flux hosting"><h2>Explore other Flux hosting</h2>${links}</nav>`
}

/** Render structured content blocks (from pagesContent.js) to semantic HTML. */
function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.type === 'p') return `<p>${b.html}</p>`
      if (b.type === 'h3') return `<h3>${b.text}</h3>`
      if (b.type === 'ul') return `<ul>${b.items.map((i) => `<li>${i}</li>`).join('')}</ul>`
      if (b.type === 'table') {
        const head = `<tr>${b.headers.map((h) => `<th>${h}</th>`).join('')}</tr>`
        const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
        return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`
      }
      return ''
    })
    .join('')
}

/**
 * The homepage's real, crawlable content — rendered INSIDE #root at build time so
 * dist/index.html ships a populated DOM (not an empty SPA shell). React replaces
 * #root entirely once it boots, so JS-enabled browsers never see this. Generated
 * from the same content sources the live components use, so the two can't drift.
 * Wrapped in ROOT_START/ROOT_END sentinels so the prerender can swap it per route.
 */
export function buildStaticHome() {
  const features = FEATURES.map((f) => `<li><strong>${f.title}</strong> — ${f.description}</li>`).join('')

  const pricing = ORBIT_PLANS.map((plan) => {
    const specs = specList(plan).map((s) => `<li>${s}</li>`).join('')
    return `<li><h3>${plan.name} — ${priceText(plan)}</h3><p>${plan.description}.</p><ul>${specs}</ul></li>`
  }).join('')

  const faq = FAQS.map((f) => `<dt>${f.q}</dt><dd>${f.a}</dd>`).join('')

  const body = `${STATIC_STYLE}
    <div id="orbit-seo">
      <header>
        <a href="/">Orbit by Flux</a>
      </header>
      <main>
        <section id="hero">
          <h1>Deploy to Flux with Git — the decentralized Vercel alternative</h1>
          <p>Orbit is a Git-native deployment platform for the <a href="/decentralized-hosting">Flux decentralized cloud</a>. Push any repository and Orbit automatically detects your framework, builds a container, and deploys it across ${SITE_FACTS.nodeCount} of independent nodes worldwide — with a free-forever tier, zero configuration, and built-in CI/CD. It is a censorship-resistant alternative to centralized hosts like Vercel and Netlify, with no single company controlling your infrastructure and no vendor lock-in.</p>
          <p><a href="/login">Start deploying free</a> · <a href="#features">See all features</a></p>
        </section>

        <section id="why-decentralized">
          <h2>Why deploy on a decentralized cloud?</h2>
          <p>Most modern hosting concentrates your app inside one company's data centers — one provider's pricing, policies, and single point of failure. Orbit takes a different path. Your app runs on the <a href="/decentralized-hosting">Flux network</a>: ${SITE_FACTS.nodeCount} of independently operated nodes across dozens of countries, run by thousands of separate operators. Because no single party owns the infrastructure, there is no gatekeeper who can deplatform you, no vendor able to lock in your data, and no lone data center whose outage takes you offline. Your container runs on real, dedicated hardware — not a metered slice of a shared server — and it runs on several nodes at once, so the network absorbs failures that would cause downtime on a single-server setup. For dApp front-ends, indie projects, and teams who want genuine redundancy and censorship resistance, decentralized hosting delivers the reliability of a top-tier cloud without handing control to one corporation.</p>
        </section>

        <section id="how-it-works">
          <h2>How Orbit works</h2>
          <p>Deploying is a single Git push. First, connect a GitHub, GitLab, or Bitbucket repository. Orbit then inspects your project and automatically detects the framework, install step, build command, and start command using Nixpacks — no Dockerfile or YAML required. It packages your app into a container, builds it, and distributes it across ${SITE_FACTS.nodeCount} of Flux nodes in the regions you choose or spread automatically worldwide. From then on, every push to your chosen branch triggers a fresh build and redeploy through a webhook (or polling mode if you prefer). If a build fails, Orbit keeps the last known-good version live and rolls back automatically, so a bad commit can never take your site down. Branches and pull requests can generate preview deployments, and build logs stream in real time.</p>
        </section>

        <section id="features">
          <h2>Everything you need to ship</h2>
          <ul>${features}</ul>
        </section>

        <section id="frameworks">
          <h2>100+ frameworks, auto-detected</h2>
          <p>Orbit is not limited to static sites or a single ecosystem. Framework detection is automatic via Nixpacks, which reads your project files and infers exactly how to build and run your app. That means Node.js, Python, Go, Rust, Java, .NET, PHP, and Ruby all work out of the box. Front-end frameworks like Next.js, Remix, Nuxt, SvelteKit, Astro, Create React App, and Vite build and deploy in the same zero-config flow. Just as importantly, because Orbit runs your app as a full long-running container rather than serverless functions, backend frameworks that other platforms handle poorly — Django, Flask, FastAPI, Rails, Express, and Go or Rust services, including background workers and persistent processes — run natively. If it builds into a container, Orbit can deploy it.</p>
        </section>

        <section id="comparison">
          <h2>Orbit vs. Vercel, Netlify and Render</h2>
          <p>Centralized platforms like Vercel and Netlify are polished, but they run your app on shared, metered infrastructure inside one company's cloud, with paid tiers starting around $19–$20/month and real limits on backends and long-running servers. Orbit gives you dedicated CPU and RAM on the decentralized Flux network for $0.99–$3.99/month, native support for full-stack backends, and a genuinely free-forever tier with no non-commercial restriction. Read the full <a href="/vs/vercel">Orbit vs. Vercel comparison</a> for a side-by-side breakdown, or <a href="/vercel-netlify-alternative">see the full comparison</a> against Vercel, Netlify and Cloudflare Pages together.</p>
        </section>

        <section id="pricing">
          <h2>Simple, transparent pricing</h2>
          <p>Start free. Scale as you grow. All plans include unlimited builds and the full Orbit feature set, with the first month free on paid plans.</p>
          <ul>${pricing}</ul>
          <p><a href="/vercel-netlify-alternative">See how Orbit compares to Vercel &amp; Netlify →</a></p>
        </section>

        <section id="faq">
          <h2>Frequently asked questions</h2>
          <dl>${faq}</dl>
        </section>

        <section id="learn-more">
          <h2>Learn more</h2>
          <ul>
            <li><a href="/decentralized-hosting">What is decentralized (web3) hosting?</a> — the pillar guide to censorship-resistant, vendor-lock-in-free hosting.</li>
            <li><a href="/vs/vercel">Orbit vs. Vercel</a> — how the decentralized alternative compares on price, resources, and backends.</li>
            <li><a href="/vercel-netlify-alternative">Vercel, Netlify &amp; Cloudflare Pages alternative</a> — a decentralized web3 deploy platform compared with all three incumbents.</li>
            <li><a href="https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/" rel="noopener noreferrer">Deploy with Git documentation</a></li>
            <li><a href="https://github.com/RunOnFlux/deploy-with-git" rel="noopener noreferrer">Deployment guides and samples</a></li>
          </ul>
        </section>
      </main>

      <footer>
        <p>© 2026 InFlux Technologies — Orbit</p>
        <nav>
          <a href="https://runonflux.io" rel="noopener noreferrer">Flux Network</a>
          <a href="https://home.runonflux.io" rel="noopener noreferrer">FluxOS</a>
          <a href="https://github.com/runonflux" rel="noopener noreferrer">GitHub</a>
          <a href="https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/" rel="noopener noreferrer">Docs</a>
        </nav>
        ${crossLinksFooter()}
      </footer>
    </div>`

  return `${ROOT_START}${body}${ROOT_END}`
}

/** Static in-#root content for a marketing page (pillar / vs comparison). */
export function buildMarketingRoot(page) {
  const sections = page.sections
    .map((s) => `<section><h2>${s.heading}</h2>${renderBlocks(s.blocks)}</section>`)
    .join('')
  const faq = page.faqs.map((f) => `<dt>${f.q}</dt><dd>${f.a}</dd>`).join('')

  const body = `${STATIC_STYLE}
    <div id="orbit-seo">
      <nav aria-label="Breadcrumb"><a href="/">Orbit by Flux</a> › <span>${page.breadcrumb}</span></nav>
      <main>
        <article>
          <h1>${page.h1}</h1>
          <p>${page.intro}</p>
          ${sections}
          <section id="faq"><h2>Frequently asked questions</h2><dl>${faq}</dl></section>
        </article>
      </main>
      <footer>
        <p><a href="/">← Back to Orbit</a> · © 2026 InFlux Technologies — Orbit</p>
        ${crossLinksFooter()}
      </footer>
    </div>`

  return `${ROOT_START}${body}${ROOT_END}`
}

/** Per-page @graph JSON-LD (BreadcrumbList + WebPage + FAQPage) for a subpage. */
export function buildMarketingJsonLd(routePath, page) {
  const url = `${ORIGIN}${routePath}`
  const graph = [
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: url },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { '@id': `${ORIGIN}/#website` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: page.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ]
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
  return `<script type="application/ld+json">${json}</script>`
}

export { MARKETING_PAGES }
