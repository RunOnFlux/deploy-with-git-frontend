import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const LINKS = [
  {
    href: '/deploy-to-flux',
    title: 'Deploy to Flux button',
    desc: 'Let anyone deploy your repository from its README with one click.',
    external: false,
  },
  {
    href: '/free-web-app-hosting',
    title: 'Free web app & static site hosting',
    desc: 'Host apps and static sites free forever — no card, no egress fees. Paid plans from $0.99/mo.',
    external: false,
  },
  {
    href: '/decentralized-hosting',
    title: 'What is decentralized hosting?',
    desc: 'The pillar guide to web3, censorship-resistant hosting with no vendor lock-in.',
    external: false,
  },
  {
    href: '/vs/vercel',
    title: 'Orbit vs. Vercel',
    desc: 'How the decentralized alternative compares on price, dedicated resources, and backends.',
    external: false,
  },
  {
    href: '/vercel-netlify-alternative',
    title: 'Vercel, Netlify & Cloudflare Pages alternative',
    desc: 'A decentralized web3 deploy platform compared head-to-head with all three incumbents.',
    external: false,
  },
  {
    href: '/heroku-alternative',
    title: 'Heroku alternative',
    desc: 'Git push-to-deploy on a decentralized cloud with a free tier that stays free. Paid plans start at $0.99/mo.',
    external: false,
  },
  {
    href: '/railway-alternative',
    title: 'Railway alternative',
    desc: 'The decentralized alternative to Railway with dedicated resources, no egress fees, and predictable pricing.',
    external: false,
  },
  {
    href: '/render-alternative',
    title: 'Render alternative',
    desc: 'A decentralized Render alternative with no single point of failure and no idle spin-down.',
    external: false,
  },
  {
    href: 'https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/',
    title: 'Deploy with Git docs',
    desc: 'Official documentation for deploying any repository to the Flux network.',
    external: true,
  },
  {
    href: 'https://github.com/RunOnFlux/deploy-with-git-samples',
    title: 'Guides & samples',
    desc: 'Example projects and step-by-step deployment guides on GitHub.',
    external: true,
  },
];

export default function RelatedLinksSection() {
  return (
    <section className="py-20 lg:py-28 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="inline-flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-primary/20 bg-primary/8">
            Learn more
          </p>
          <h2 className="font-heading text-4xl sm:text-5xl font-bold text-text">
            Go <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">deeper</span>
          </h2>
          <p className="text-text-secondary/80 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto mt-5">
            If you are weighing decentralized hosting against the platform you use today, these
            guides explain one-click repository deployments, what web3 hosting actually is, how the
            node network keeps your app online, and how Orbit compares head-to-head with Vercel,
            Netlify, Heroku, Railway and Render.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target={l.external ? '_blank' : undefined}
              rel={l.external ? 'noopener noreferrer' : undefined}
              className="group flex items-start justify-between gap-3 p-5 rounded-2xl border border-border hover:border-primary/40 hover:bg-white/[0.02] transition-colors"
            >
              <div>
                <h3 className="font-medium text-text mb-1">{l.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{l.desc}</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
