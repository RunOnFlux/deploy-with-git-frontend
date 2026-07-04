/**
 * Single source of truth for the standalone marketing pages (the pillar page and
 * the vs/* comparisons). Consumed by BOTH:
 *   - the live React route (src/pages/MarketingPage.jsx), and
 *   - the build-time prerender (scripts/prerender.mjs via buildSeoContent.mjs)
 * so the crawlable static HTML and the hydrated app can never drift.
 *
 * Content is expressed as structured blocks (not raw markup) so the same data
 * renders as styled JSX and as plain semantic HTML. Inline links inside a `p`
 * block use trusted, build-time HTML (our own anchors only).
 *
 * `__SITE_URL__` tokens in canonical/breadcrumb URLs are resolved at build time
 * by vite.config.js / the prerender, exactly like the rest of the SEO pipeline.
 */

/** Ordered list of marketing routes, reused by the sitemap and the prerender. */
export const MARKETING_ROUTES = ['/decentralized-hosting', '/vs/vercel'];

export const MARKETING_PAGES = {
  '/decentralized-hosting': {
    slug: 'decentralized-hosting',
    title: 'What Is Decentralized (Web3) Hosting? A 2026 Guide | Orbit by Flux',
    description:
      'Decentralized hosting runs your website across thousands of independent nodes instead of one company’s data center. Learn how web3 hosting works, why it is censorship-resistant, and how to deploy on it with Git.',
    breadcrumb: 'Decentralized Hosting',
    h1: 'What Is Decentralized (Web3) Hosting?',
    intro:
      'Decentralized hosting — often called web3 hosting — runs your website or app across a distributed network of independent computers instead of a single provider’s data center. There is no central owner who can take your site down, price-gouge, or lock in your data. This guide explains what decentralized hosting is, how it compares to traditional cloud platforms, and how to deploy on it today using nothing but a Git push.',
    sections: [
      {
        heading: 'Centralized vs. decentralized hosting',
        blocks: [
          {
            type: 'p',
            html: 'Almost every website you use is hosted on centralized infrastructure: Amazon Web Services, Google Cloud, Microsoft Azure, or a platform built on top of them like Vercel or Netlify. Your app lives in one company’s data centers, under one company’s terms of service, billing, and control. That model is convenient, but it concentrates enormous power in a handful of providers. An outage, a policy change, a price hike, or a deplatforming decision at any one of them can take your site offline instantly.',
          },
          {
            type: 'p',
            html: 'Decentralized hosting spreads that same workload across many independently operated nodes. On the <a href="https://runonflux.io" target="_blank" rel="noopener noreferrer">Flux network</a>, for example, thousands of separate operators around the world each run hardware that can host containerized apps. Your application runs as a real container on that shared, permissionless network — redundant by design, with no single point of control and no single point of failure.',
          },
        ],
      },
      {
        heading: 'How does decentralized hosting actually work?',
        blocks: [
          {
            type: 'p',
            html: 'Under the hood, a decentralized cloud looks a lot like a normal container platform — the difference is who owns the machines. Node operators stake collateral and run an operating layer (FluxOS) that schedules and supervises apps. When you deploy, your app is packaged into a container and distributed to multiple nodes across different regions and operators at once.',
          },
          {
            type: 'ul',
            items: [
              '<strong>Redundancy by default:</strong> your app runs on several nodes simultaneously, so one machine (or one operator) going offline does not take your site down.',
              '<strong>Global distribution:</strong> nodes span dozens of countries, placing your app physically closer to users without you configuring regions.',
              '<strong>Permissionless:</strong> anyone can run a node and anyone can deploy — there is no gatekeeper approving or rejecting your project.',
              '<strong>Economic incentives:</strong> operators are paid to keep nodes healthy and online, which keeps the network large and reliable.',
            ],
          },
        ],
      },
      {
        heading: 'Why choose censorship-resistant hosting?',
        blocks: [
          {
            type: 'p',
            html: 'Because no single company controls a decentralized network, no single company can unilaterally remove your app. For journalists, activists, dApp front-ends, and anyone who has watched a platform change its rules overnight, that censorship resistance is the entire point. Your deployment does not depend on staying in one provider’s good graces.',
          },
          {
            type: 'p',
            html: 'Decentralized hosting also eliminates vendor lock-in. Because you deploy a standard container from a standard Git repository, your app is portable — the same build runs anywhere containers run. You are never trapped by a proprietary runtime, a bespoke config format, or a pricing model designed to make leaving expensive.',
          },
        ],
      },
      {
        heading: 'Is decentralized hosting fast and reliable enough for production?',
        blocks: [
          {
            type: 'p',
            html: 'Yes. A common misconception is that “decentralized” means slow or experimental. In practice, apps run on dedicated CPU and RAM on real hardware, and requests are routed through a global reverse-proxy layer that terminates SSL and directs traffic to the nearest healthy node. Because your app runs on multiple nodes at once, the network can absorb hardware failures that would cause downtime on a single-server setup. For most web apps, static sites, APIs, and dApp front-ends, the experience is indistinguishable from a top-tier centralized host — with better redundancy.',
          },
        ],
      },
      {
        heading: 'How to deploy on decentralized hosting with Git',
        blocks: [
          {
            type: 'p',
            html: 'The easiest way to deploy to a decentralized cloud is <a href="/">Orbit</a>, a Git-native platform built on the Flux network. You connect a GitHub, GitLab, or Bitbucket repository, Orbit auto-detects your framework via Nixpacks, builds a container, and deploys it across thousands of Flux nodes — no Dockerfile, no YAML, no server management. Every push redeploys automatically, and failed builds roll back to the last known-good version.',
          },
          {
            type: 'p',
            html: 'It works for static sites and full-stack apps alike: Next.js, React, Vue, Svelte, plus backends like Django, FastAPI, Go and Rust. There is a free-forever tier with no credit card required, so you can put a real app on decentralized infrastructure in a few minutes. See how it stacks up against the incumbents in our <a href="/vs/vercel">Orbit vs. Vercel comparison</a>.',
          },
        ],
      },
    ],
    faqs: [
      {
        q: 'What is decentralized hosting in simple terms?',
        a: 'Decentralized hosting runs your website across many independently owned computers instead of a single company’s data center. No one party controls the infrastructure, so there is no single point of failure and no gatekeeper who can take your site offline.',
      },
      {
        q: 'Is web3 hosting the same as decentralized hosting?',
        a: 'Broadly, yes. “Web3 hosting” usually refers to running apps — especially decentralized app (dApp) front-ends — on decentralized, blockchain-adjacent infrastructure like the Flux network, rather than on a centralized provider such as AWS or Vercel.',
      },
      {
        q: 'Is decentralized hosting secure?',
        a: 'Yes. Apps run in isolated containers with non-root execution and encrypted app specs, and enterprise workloads run inside ArcaneOS, Flux’s hardened environment where data is encrypted at rest. Running across multiple independent nodes also removes the single-provider risk of centralized hosting.',
      },
      {
        q: 'Can I host a normal website on decentralized infrastructure?',
        a: 'Absolutely. Static sites, single-page apps, full-stack frameworks, and backend services all run on the Flux network. With Orbit you deploy any of them straight from a Git repository, with automatic framework detection and a free tier.',
      },
    ],
  },

  '/vs/vercel': {
    slug: 'vs-vercel',
    title: 'Orbit vs. Vercel: Decentralized vs. Centralized Deployment (2026)',
    description:
      'An honest Orbit vs. Vercel comparison. See how a decentralized, Git-native alternative on the Flux network compares to Vercel on price, dedicated resources, backend support, and vendor lock-in.',
    breadcrumb: 'Orbit vs. Vercel',
    h1: 'Orbit vs. Vercel: The Decentralized Alternative',
    intro:
      'Vercel is an excellent centralized platform for deploying front-end apps. Orbit is a Git-native alternative that deploys to the decentralized Flux network instead of a single company’s cloud. Both let you push code and get a live URL — but they differ sharply on infrastructure, price, backend support, and lock-in. This is an honest comparison to help you pick the right one.',
    sections: [
      {
        heading: 'The core difference: decentralized vs. centralized',
        blocks: [
          {
            type: 'p',
            html: 'Vercel runs your app on centralized infrastructure it operates on top of AWS. That delivers a polished, tightly integrated experience — and it also means your app lives in one company’s cloud, under one company’s pricing and policies. <a href="/">Orbit</a> deploys to the <a href="/decentralized-hosting">decentralized Flux network</a>: thousands of independent nodes run by thousands of separate operators worldwide. No single company controls your infrastructure, there is no single point of failure, and there is no vendor lock-in.',
          },
        ],
      },
      {
        heading: 'Orbit vs. Vercel at a glance',
        blocks: [
          {
            type: 'table',
            headers: ['', 'Orbit', 'Vercel'],
            rows: [
              ['Infrastructure', 'Decentralized (Flux network, thousands of nodes)', 'Centralized (Vercel on AWS)'],
              ['Resources', 'Dedicated CPU / RAM per app', 'Shared, metered serverless'],
              ['Paid entry price', 'From $0.99–$3.99/mo', 'Pro from ~$20/mo'],
              ['Free tier', 'Free forever, no card', 'Hobby (non-commercial)'],
              ['Backends & long-running servers', 'Native — full containers', 'Serverless functions, limited'],
              ['Vendor lock-in', 'None — portable containers', 'Proprietary runtime & config'],
              ['Git deploys', 'GitHub, GitLab, Bitbucket', 'GitHub, GitLab, Bitbucket'],
              ['Censorship resistance', 'Yes — no single controller', 'No — single provider'],
            ],
          },
        ],
      },
      {
        heading: 'Price: dedicated resources for a fraction of the cost',
        blocks: [
          {
            type: 'p',
            html: 'Vercel’s Pro plan starts around $20/month and meters usage on shared serverless infrastructure, where heavy traffic or long builds can add overage charges. Orbit’s paid plans start at $0.99–$3.99/month and give you dedicated CPU and RAM — not a shared slice. Orbit’s free tier is genuinely free forever and, unlike Vercel’s Hobby plan, is not restricted to non-commercial use.',
          },
        ],
      },
      {
        heading: 'Backends: full containers vs. serverless functions',
        blocks: [
          {
            type: 'p',
            html: 'Vercel is optimized for front-end and serverless functions. Long-running servers, background workers, WebSocket services, and heavier backend frameworks are awkward or impossible in that model. Orbit runs your app as a full, long-running container, so Django, FastAPI, Flask, Rails, Express, Go and Rust services — including persistent processes and workers — run natively. If you have outgrown serverless, this is the biggest practical difference.',
          },
        ],
      },
      {
        heading: 'When should you use each?',
        blocks: [
          {
            type: 'p',
            html: 'Choose Vercel if you want the most polished front-end experience, deep Next.js integration, and you are happy on centralized infrastructure. Choose Orbit if you want a <a href="/decentralized-hosting">decentralized, censorship-resistant</a> platform, dedicated resources at a lower price, native support for backends and long-running servers, and freedom from vendor lock-in — all from the same simple Git push you already know.',
          },
          {
            type: 'p',
            html: 'The good news: trying Orbit costs nothing. Connect a repository, let Orbit auto-detect your framework, and deploy to the Flux network on the free-forever tier in a few minutes.',
          },
        ],
      },
    ],
    faqs: [
      {
        q: 'Is Orbit a drop-in replacement for Vercel?',
        a: 'For most Git-based deployments, yes — you connect the same GitHub, GitLab, or Bitbucket repository, Orbit auto-detects your framework, and every push redeploys. The main difference is that Orbit runs on the decentralized Flux network with dedicated resources and full container support, rather than Vercel’s centralized serverless platform.',
      },
      {
        q: 'Is Orbit cheaper than Vercel?',
        a: 'Yes. Orbit’s paid plans start at $0.99–$3.99/month for dedicated CPU and RAM, versus roughly $20/month for Vercel Pro on shared, metered infrastructure. Orbit also has a free-forever tier with no credit card and no non-commercial restriction.',
      },
      {
        q: 'Can Orbit run backends that Vercel can’t?',
        a: 'Often, yes. Because Orbit runs full long-running containers, backend frameworks like Django, FastAPI, Rails, Go and Rust — plus background workers and persistent WebSocket servers — run natively, whereas Vercel’s serverless model handles them poorly or not at all.',
      },
      {
        q: 'What does “decentralized” give me over Vercel?',
        a: 'No single company controls your infrastructure, so there is no single point of failure and no deplatforming risk. Your app runs across many independent nodes worldwide, giving true redundancy and censorship resistance, with no vendor lock-in because you deploy standard portable containers.',
      },
    ],
  },
};
