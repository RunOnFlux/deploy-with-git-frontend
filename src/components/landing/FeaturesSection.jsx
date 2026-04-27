import { motion } from 'framer-motion';
import {
  Infinity, Server, Layers, Zap, GitBranch, Globe,
  MapPin, Eye, RotateCcw, FolderGit2, Activity, Shield,
} from 'lucide-react';
import BokehBackground, { BOKEH_FEATURES } from './BokehBackground';

const features = [
  {
    icon: Infinity,
    title: 'Unlimited Builds',
    description: 'No limit on build count or build duration. Ship as often as you need.',
  },
  {
    icon: Server,
    title: 'Dedicated Resources',
    description: 'No shared hardware. Your rented resources are exclusively for your app.',
  },
  {
    icon: Layers,
    title: '100+ Frameworks',
    description: 'Node.js, Python, Rust, Go, Java, .NET, PHP and more, auto-detected every time.',
  },
  {
    icon: Zap,
    title: 'Zero Configuration',
    description: 'Auto-detects project type, installs dependencies, and builds automatically.',
  },
  {
    icon: GitBranch,
    title: 'Built-in CI/CD',
    description: 'GitHub, GitLab, and Bitbucket webhooks plus polling mode. Your workflow, your choice.',
  },
  {
    icon: Globe,
    title: 'Custom Domain + SSL',
    description: "Connect your own domain with automatic SSL via Flux's reverse proxy network.",
  },
  {
    icon: MapPin,
    title: 'Geolocation Selection',
    description: 'Deploy to specific regions worldwide or let Orbit distribute automatically.',
  },
  {
    icon: Eye,
    title: 'Deploy Previews',
    description: 'Automatic preview deployments for branches and pull requests.',
  },
  {
    icon: RotateCcw,
    title: 'Auto Rollback',
    description: 'Failed deployments automatically revert to the last known-good version.',
  },
  {
    icon: FolderGit2,
    title: 'Monorepo Support',
    description: 'Deploy specific folders from a monorepo using the PROJECT_PATH variable.',
  },
  {
    icon: Activity,
    title: 'Health Monitoring',
    description: 'Built-in health checks and process supervision keep your app always available.',
  },
  {
    icon: Shield,
    title: 'Enhanced Security',
    description: 'Non-root execution, automatic log rotation, and encrypted app specs.',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-16 px-6 bg-surface/40 overflow-hidden">
      <BokehBackground orbs={BOKEH_FEATURES} />
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="inline-flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-primary/20 bg-primary/8">
            Features
          </p>
          <h2 className="font-heading text-4xl sm:text-5xl font-bold text-text">
            Your Code. <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">Our Magic.</span>
          </h2>
          <p className="text-text-secondary mt-4 max-w-xl mx-auto">
            Zero Docker headaches. Orbit handles the full build, deploy, and ops pipeline
            so you can focus on shipping.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={cardVariants}
              className="p-5 rounded-2xl border border-border bg-surface hover:border-primary/30 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-[16px] h-[16px] text-primary" />
              </div>
              <h3 className="font-semibold text-text text-sm mb-1">{f.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
