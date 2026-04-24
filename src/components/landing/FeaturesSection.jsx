import { motion } from 'framer-motion';
import { Repeat2, Box, Layers, Globe, Leaf, Globe2 } from 'lucide-react';

const features = [
  {
    icon: Repeat2,
    title: 'Auto CI/CD',
    description:
      'Every git push triggers a rebuild and rolling redeploy across your Flux nodes — zero downtime.',
  },
  {
    icon: Box,
    title: 'No Docker needed',
    description:
      'Just push your code. Orbit builds your container automatically using Nixpacks — no Dockerfile required.',
  },
  {
    icon: Layers,
    title: '50+ frameworks',
    description:
      'Next.js, Remix, SvelteKit, Astro, Nuxt, Django, FastAPI, Rails, Go — auto-detected and configured.',
  },
  {
    icon: Globe,
    title: '10,000+ global nodes',
    description:
      'Deploy to the Flux network spanning 100+ countries. Choose regions or let Orbit distribute automatically.',
  },
  {
    icon: Leaf,
    title: 'Free tier, always',
    description:
      'The Free plan runs forever at no cost — 0.5 vCPU, 1 GB RAM, 5 GB storage. No credit card needed.',
  },
  {
    icon: Globe2,
    title: 'Custom domains',
    description:
      'Point your domain at your Orbit deployment. SSL is automatic via Flux\'s reverse proxy network.',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-surface/40">
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">
            Features
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text">
            Everything you need to ship
          </h2>
          <p className="text-text-secondary mt-4 max-w-xl mx-auto">
            Orbit abstracts away the complexity of decentralized infrastructure so you can
            focus on building.
          </p>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={cardVariants}
              className="p-5 rounded-2xl border border-border bg-surface hover:border-primary/30 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-4.5 h-4.5 text-primary w-[18px] h-[18px]" />
              </div>
              <h3 className="font-semibold text-text mb-1.5">{f.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
