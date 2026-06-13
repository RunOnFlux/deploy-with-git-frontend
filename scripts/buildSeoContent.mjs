/**
 * Build-time SEO content generators. Emit the JSON-LD structured data and the
 * <noscript> crawler fallback from the SAME sources the live components use
 * (src/content/landingContent.js + src/config/plans.js), so the two can never
 * drift again. Consumed by vite.config.js, which injects the output into
 * index.html (replacing the <!--SEO:JSONLD--> / <!--SEO:NOSCRIPT--> markers) and
 * then resolves the __SITE_URL__ origin token.
 *
 * Output keeps the __SITE_URL__ token literal — vite.config replaces it after
 * injection, so this module stays origin-agnostic.
 */

import { SITE_FACTS, FAQS, FEATURES } from '../src/content/landingContent.js'
import { ORBIT_PLANS } from '../src/config/plans.js'

const ORIGIN = '__SITE_URL__'

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

/** schema.org @graph as a <script type="application/ld+json"> string. */
export function buildJsonLd() {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Flux Labs',
      url: 'https://runonflux.io',
      logo: `${ORIGIN}/orbit-logo.svg`,
      sameAs: ['https://github.com/runonflux', 'https://x.com/RunOnFlux'],
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: 'Orbit by Flux',
      url: `${ORIGIN}/`,
      description:
        'Deploy any git repository to the Flux decentralized cloud. Auto-detect frameworks, global nodes, free tier available.',
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

/**
 * Static crawler/AI fallback shown when JS is disabled. React replaces #root once
 * it boots, so JS-enabled visitors never see this. Mirrors the live page sections.
 */
export function buildNoscript() {
  const features = FEATURES.map((f) => `<li><strong>${f.title}</strong> — ${f.description}</li>`).join('')

  const pricing = ORBIT_PLANS.map((plan) => {
    const specs = specList(plan).map((s) => `<li>${s}</li>`).join('')
    return `<li><h3>${plan.name} — ${priceText(plan)}</h3><p>${plan.description}.</p><ul>${specs}</ul></li>`
  }).join('')

  const faq = FAQS.map((f) => `<dt>${f.q}</dt><dd>${f.a}</dd>`).join('')

  return `<noscript>
      <!--
        Static fallback content for crawlers and AI engines that do not execute JavaScript.
        Generated at build time from src/content/landingContent.js + src/config/plans.js.
        React replaces #root entirely once the app boots; JS-enabled browsers never see this.
      -->
      <header>
        <nav>
          <a href="/">Orbit by Flux</a>
          <ul>
            <li><a href="#features">Features</a></li>
            <li><a href="#pricing">Pricing</a></li>
            <li><a href="#faq">FAQ</a></li>
            <li><a href="https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/" rel="noopener noreferrer">Docs</a></li>
            <li><a href="https://github.com/RunOnFlux/deploy-with-git" rel="noopener noreferrer">Guides</a></li>
          </ul>
        </nav>
      </header>

      <main>
        <section id="hero">
          <h1>Deploy to Flux with Git</h1>
          <p>Git-native deployment for the Flux decentralized network. Push any repo and Orbit automatically detects your framework, builds a container, and deploys across ${SITE_FACTS.nodeCount} of global nodes. Free tier, zero config, built-in CI/CD.</p>
          <a href="/login">Start Deploying Free</a>
          <a href="#features">See all features</a>
        </section>

        <section id="features">
          <h2>Everything you need to ship</h2>
          <ul>${features}</ul>
        </section>

        <section id="pricing">
          <h2>Simple, transparent pricing</h2>
          <p>Start free. Scale as you grow. All plans include unlimited builds and the full Orbit feature set.</p>
          <ul>${pricing}</ul>
        </section>

        <section id="faq">
          <h2>Common questions</h2>
          <dl>${faq}</dl>
        </section>
      </main>

      <footer>
        <p>© 2026 Flux Labs — Orbit</p>
        <nav>
          <a href="https://runonflux.io" rel="noopener noreferrer">Flux Network</a>
          <a href="https://home.runonflux.io" rel="noopener noreferrer">FluxOS</a>
          <a href="https://github.com/runonflux" rel="noopener noreferrer">GitHub</a>
          <a href="https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/" rel="noopener noreferrer">Docs</a>
          <a href="https://github.com/RunOnFlux/deploy-with-git" rel="noopener noreferrer">Guides</a>
        </nav>
      </footer>
    </noscript>`
}
