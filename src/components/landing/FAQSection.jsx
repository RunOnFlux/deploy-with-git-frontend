import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

const faqs = [
  {
    q: 'What is Orbit?',
    a: 'Orbit is a Git-native deployment platform built on the Flux decentralized cloud network. Push your code and Orbit automatically builds, deploys, and scales your app across 10,000+ nodes worldwide. No server management required.',
  },
  {
    q: 'Do I need to know Docker or Kubernetes?',
    a: "No. Orbit uses Nixpacks to automatically detect your framework and build a container image. No Dockerfile needed; just push your code and Orbit handles the rest.",
  },
  {
    q: 'What frameworks are supported?',
    a: 'Orbit supports 50+ frameworks including Next.js, Remix, SvelteKit, Astro, Nuxt, Create React App, Vite, Django, FastAPI, Flask, Rails, Go, Rust, and more. Framework detection is automatic based on your project files.',
  },
  {
    q: 'Is the free tier really free forever?',
    a: 'Yes. The Free plan (0.5 vCPU, 1 GB RAM, 5 GB storage, 1 instance) is free forever with no credit card required. Paid plans add more resources and instances.',
  },
  {
    q: 'How is Orbit different from Vercel or Netlify?',
    a: "Orbit deploys to the Flux decentralized network, meaning no single company controls your infrastructure. Your app runs on multiple independent nodes globally, providing true redundancy with no vendor lock-in.",
  },
  {
    q: 'Can I use a custom domain?',
    a: 'Yes. Developer and Pro plans support custom domains. Point your DNS to your Orbit deployment and SSL is handled automatically through the Flux reverse proxy network.',
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium text-text text-sm pr-4">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDownIcon className="w-4 h-4 text-text-muted" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm text-text-secondary leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQSection() {
  return (
    <section id="faq" className="py-24 px-6 bg-surface/40">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text">
            Common questions
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-3"
        >
          {faqs.map((item) => (
            <FAQItem key={item.q} {...item} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
