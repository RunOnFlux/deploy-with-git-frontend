/**
 * Build-time SEO structured data. Emits the site-wide JSON-LD @graph from the SAME
 * sources the live components use (src/content/landingContent.js + src/config/plans.js),
 * so the two can never drift. Consumed by vite.config.js, which injects it into
 * index.html's <head> (replacing the <!--SEO:JSONLD--> marker) and then resolves the
 * __SITE_URL__ origin token.
 *
 * Output keeps the __SITE_URL__ token literal — vite.config replaces it after
 * injection, so this module stays origin-agnostic.
 *
 * There is no HTML body generator here any more: the crawlable page body is the real
 * React tree, server-rendered into #root by scripts/prerender.mjs and hydrated by the
 * client, so the prose has exactly one source (the components).
 */

import { SITE_FACTS, FAQS, FEATURES } from '../src/content/landingContent.js'
import { ORBIT_PLANS } from '../src/config/plans.js'
import { REVIEWS, RATING_BEST } from '../src/config/reviews.js'

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
