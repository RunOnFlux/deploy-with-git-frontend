/**
 * Single source of truth for landing-page marketing content that is consumed by
 * BOTH the live React components AND the build-time SEO generators
 * (scripts/buildSeoContent.mjs, wired into vite.config.js) that emit the
 * JSON-LD structured data and the <noscript> crawler fallback into index.html.
 *
 * Previously this copy was hand-duplicated in three places (the components, the
 * JSON-LD, and the noscript block) and silently drifted — e.g. the FAQ claimed
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

/** FAQ — rendered by FAQSection and emitted as schema.org FAQPage + noscript. */
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
];

/**
 * Feature cards — rendered by FeaturesSection and emitted into the SoftwareApplication
 * featureList + noscript. `key` maps to an icon in FeaturesSection (data carries no
 * React components so this stays importable from the Node build).
 */
export const FEATURES = [
  { key: 'unlimited-builds', title: 'Unlimited Builds', description: 'No limit on build count or build duration. Ship as often as you need.' },
  { key: 'dedicated-resources', title: 'Dedicated Resources', description: 'No shared hardware. Your rented resources are exclusively for your app.' },
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
