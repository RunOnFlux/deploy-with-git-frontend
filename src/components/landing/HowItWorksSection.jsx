import { motion } from 'framer-motion';
import { GitBranch, Settings, Globe } from 'lucide-react';

const steps = [
  {
    icon: GitBranch,
    step: '01',
    title: 'Connect your repo',
    description:
      'Paste a GitHub, GitLab, or any Git URL. Public or private — Orbit supports token-based auth for private repos.',
  },
  {
    icon: Settings,
    step: '02',
    title: 'Configure your app',
    description:
      'Orbit auto-detects your framework and port. Optionally set env vars, choose a geo region, and pick a billing plan.',
  },
  {
    icon: Globe,
    step: '03',
    title: 'Deploy globally',
    description:
      'One click registers your app on the Flux blockchain and deploys it across multiple nodes worldwide. No DevOps required.',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-6">
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
            How it works
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text">
            From commit to live in minutes
          </h2>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-6"
        >
          {steps.map((s) => (
            <motion.div
              key={s.step}
              variants={cardVariants}
              className="relative p-6 rounded-2xl border border-border bg-surface hover:border-primary/30 transition-colors group"
            >
              {/* Step number */}
              <span className="absolute top-5 right-5 text-4xl font-bold text-white/5 font-heading select-none">
                {s.step}
              </span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                <s.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-text text-lg mb-2">{s.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{s.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
