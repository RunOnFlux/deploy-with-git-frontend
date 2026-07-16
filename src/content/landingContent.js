/**
 * Single source of truth for landing-page marketing content that is consumed by
 * BOTH the live React components AND the build-time SEO generators
 * (scripts/buildSeoContent.mjs, wired into vite.config.js) that emit the
 * JSON-LD structured data and the <noscript> crawler fallback into index.html.
 *
 * Previously this copy was hand-duplicated in three places (the components, the
 * JSON-LD, and the noscript block) and silently drifted. For example, the FAQ claimed
 * "50+ frameworks" and a non-existent "Developer" plan. Keep it here, once.
 *
 * Pricing/plan data already lives in src/config/plans.js (ORBIT_PLANS); the SEO
 * generators read it directly, so plans are not duplicated here.
 */

/** Headline facts reused across copy. Keep these vague-but-true. */
export const SITE_FACTS = {
  // Actual network size is ~7k nodes; "thousands" stays accurate as it grows.
  nodeCount: 'thousands',
  frameworkCount: '100+',
};

/**
 * Sibling Flux hosting sites + the cloud, cross-linked from the footer for SEO
 * ("Explore other Flux hosting"). Keyword-rich anchors, opened in a new tab.
 * These are real, followed links (no nofollow) to related Flux ecosystem
 * properties and deliberately excludes Orbit itself. Consumed by BOTH the live
 * React footer (src/components/landing/Footer.jsx) AND the build-time static
 * footer (scripts/buildSeoContent.mjs) so the two never drift.
 */
export const FLUX_HOSTING_LINKS = [
  { href: 'https://minecraft.runonflux.com', label: 'Minecraft Server Hosting' },
  { href: 'https://palworld.runonflux.com', label: 'Palworld Server Hosting' },
  { href: 'https://enshrouded.runonflux.com', label: 'Enshrouded Server Hosting' },
  { href: 'https://rust.runonflux.com', label: 'Rust Server Hosting' },
  { href: 'https://windrose.runonflux.com', label: 'Windrose Server Hosting' },
  { href: 'https://projectzomboid.runonflux.com', label: 'Project Zomboid Server Hosting' },
  { href: 'https://wordpress.runonflux.com', label: 'Web3 WordPress Hosting' },
  { href: 'https://n8n.runonflux.com', label: 'n8n Hosting' },
  { href: 'https://openclaw.runonflux.com', label: 'OpenClaw AI Assistant Hosting' },
  { href: 'https://hermes.runonflux.com', label: 'Hermes AI Agent Hosting' },
  { href: 'https://cloud.runonflux.com', label: 'Flux Cloud' },
];

/** FAQ rendered by FAQSection and emitted as schema.org FAQPage + noscript. */
export const FAQS = [
  {
    q: 'What is Orbit?',
    a: 'Orbit is a Git-native deployment platform built on the Flux decentralized cloud network. Push your code and Orbit automatically builds, deploys, and scales your app across thousands of nodes worldwide. No server management required.',
  },
  {
    q: 'How is my data kept secure?',
    a: "Enterprise apps run inside ArcaneOS, Flux's hardened execution environment, where all data is encrypted at rest. Your code, secrets, and persistent storage are fully isolated and encrypted, with no shared tenancy at the infrastructure level.",
  },
  {
    q: 'What frameworks are supported?',
    a: 'Orbit supports 100+ frameworks including Next.js, Remix, SvelteKit, Astro, Nuxt, Create React App, Vite, Django, FastAPI, Flask, Rails, Go, Rust, and more. Framework detection is automatic based on your project files.',
  },
  {
    q: 'Is the free tier really free forever?',
    a: 'Yes. The Free plan (0.5 vCPU, 1 GB RAM, 5 GB storage, 1 instance) is free forever with no credit card required. Paid plans add more resources and instances.',
  },
  {
    q: 'How is Orbit different from Vercel or Netlify?',
    a: 'Orbit deploys to the Flux decentralized network, meaning no single company controls your infrastructure. Your app runs on multiple independent nodes globally, providing true redundancy with no vendor lock-in.',
  },
  {
    q: 'Can I use a custom domain?',
    a: 'Yes. Custom domains are available on all plans. Create a CNAME record pointing to your Flux deployment domain and SSL is handled automatically through the Flux reverse proxy network.',
  },
  {
    q: 'Is Orbit really decentralized, and where does my app actually run?',
    a: 'Yes. Orbit deploys to the Flux network, where thousands of independent nodes are run by thousands of separate operators across the globe. Your container runs on real, dedicated hardware on those nodes rather than in one company’s data center, so there is no single point of control or failure. This is what makes Orbit a genuinely decentralized, censorship-resistant alternative to centralized clouds.',
  },
  {
    q: 'Can I deploy a Next.js, React, or static site on Orbit?',
    a: 'Absolutely. Orbit auto-detects Next.js, Remix, Nuxt, SvelteKit, Astro, Create React App, Vite and every other popular JavaScript framework, builds the production output, and serves it from the Flux network. Static sites and single-page apps deploy in the same zero-config flow as full-stack apps.',
  },
  {
    q: 'Can I deploy a backend such as Django, FastAPI, Go, or Rust, not just a static site?',
    a: 'Yes, and this is a real advantage over static-first hosts. Orbit runs your app as a full long-running container, so backends and server frameworks like Django, Flask, FastAPI, Rails, Express, Go and Rust services work natively. This includes background workers and persistent processes that serverless platforms handle poorly or not at all.',
  },
  {
    q: 'How does automatic deployment from GitHub work?',
    a: 'Connect a GitHub, GitLab, or Bitbucket repository and Orbit sets up a webhook so every push to your chosen branch triggers a fresh build and deploy automatically. A polling mode is also available if you cannot install a webhook. Pull requests and branches can generate preview deployments.',
  },
  {
    q: 'Do I need crypto to use Orbit, or can I pay with a card?',
    a: 'Both work. You can pay with a normal debit or credit card via Stripe, or with FLUX cryptocurrency through the ZelCore or SSP wallets. You do not need to own any crypto to deploy because the free tier requires no payment method at all.',
  },
  {
    q: 'What happens if a build fails?',
    a: 'Nothing breaks for your users. A failed build never replaces a working deployment. Orbit keeps the last known-good version live and automatically rolls back, so a bad commit cannot take your site down. Build logs stream in real time so you can diagnose and fix the issue.',
  },
  {
    q: 'How is Orbit cheaper than Vercel or Netlify?',
    a: 'Orbit has a genuinely free-forever tier and paid plans that start at $0.99–$3.99/month for dedicated resources, versus roughly $19–$20/month for the comparable Vercel or Netlify Pro tiers on shared infrastructure. Because compute runs on the decentralized Flux network rather than a centralized provider’s margins, the same money buys dedicated CPU and RAM instead of a shared, metered allowance.',
  },
  {
    q: 'Can I deploy from a monorepo?',
    a: 'Yes. Set the PROJECT_PATH variable to the subfolder you want to deploy and Orbit builds just that package from your monorepo, so you can host multiple apps or services from a single repository.',
  },
];

/**
 * Feature cards rendered by FeaturesSection and emitted into the SoftwareApplication
 * featureList + noscript. `key` maps to an icon in FeaturesSection (data carries no
 * React components so this stays importable from the Node build).
 */
export const FEATURES = [
  { key: 'unlimited-builds', title: 'Unlimited Builds', description: 'No limit on build count or build duration. Ship as often as you need.' },
  { key: 'dedicated-resources', title: 'Dedicated Resources', description: 'No shared hardware. Your rented CPU, RAM and storage are exclusively yours, not a metered slice of someone else’s server. Performance stays predictable, and there is no vendor lock-in.' },
  { key: 'frameworks', title: '100+ Frameworks', description: 'Node.js, Python, Rust, Go, Java, .NET, PHP and more, auto-detected every time.' },
  { key: 'zero-config', title: 'Zero Configuration', description: 'Auto-detects project type, installs dependencies, and builds automatically.' },
  { key: 'cicd', title: 'Built-in CI/CD', description: 'GitHub, GitLab, and Bitbucket webhooks plus polling mode. Your workflow, your choice.' },
  { key: 'custom-domain', title: 'Custom Domain + SSL', description: "Connect your own domain with automatic SSL via Flux's reverse proxy network." },
  { key: 'geolocation', title: 'Geolocation Selection', description: 'Deploy to specific regions worldwide or let Orbit distribute automatically.' },
  { key: 'deploy-previews', title: 'Deploy Previews', description: 'Automatic preview deployments for branches and pull requests.' },
  { key: 'auto-rollback', title: 'Auto Rollback', description: 'Failed deployments automatically revert to the last known-good version.' },
  { key: 'monorepo', title: 'Monorepo Support', description: 'Deploy specific folders from a monorepo using the PROJECT_PATH variable.' },
  { key: 'health-monitoring', title: 'Health Monitoring', description: 'Built-in health checks and process supervision keep your app always available.' },
  { key: 'enhanced-security', title: 'Enhanced Security', description: 'Non-root execution, automatic log rotation, and encrypted app specs.' },
];
