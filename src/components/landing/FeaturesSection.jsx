import { motion } from 'framer-motion';
import {
  Infinity as InfinityIcon, Server, Layers, Zap, GitBranch, Globe,
  MapPin, Eye, RotateCcw, FolderGit2, Activity, Shield,
} from 'lucide-react';
import BokehBackground, { BOKEH_FEATURES } from './BokehBackground';
import { FEATURES } from '../../content/landingContent';

// Icons live with the component (they're React nodes, not serialisable content);
// the titles/descriptions come from the shared source, joined here by `key`.
const FEATURE_ICONS = {
  'unlimited-builds': InfinityIcon,
  'dedicated-resources': Server,
  'frameworks': Layers,
  'zero-config': Zap,
  'cicd': GitBranch,
  'custom-domain': Globe,
  'geolocation': MapPin,
  'deploy-previews': Eye,
  'auto-rollback': RotateCcw,
  'monorepo': FolderGit2,
  'health-monitoring': Activity,
  'enhanced-security': Shield,
};

const features = FEATURES.map((f) => ({ ...f, icon: FEATURE_ICONS[f.key] }));

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
    <section className="relative py-20 lg:py-28 px-6 bg-surface/30 overflow-hidden">
      <BokehBackground orbs={BOKEH_FEATURES} />
      <div id="features" className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <p className="inline-flex items-center gap-2 text-primary/80 text-sm font-medium uppercase tracking-wider mb-4 px-4 py-1.5 rounded-full border border-primary/10 bg-primary/5">
            Features
          </p>
          <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-light text-text mb-5 leading-tight">
            Everything you need to <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent font-normal">ship fast</span>
          </h2>
          <p className="text-text-secondary/70 text-lg max-w-2xl mx-auto leading-relaxed">
            Zero Docker headaches. Orbit handles the full build, deploy, and operations pipeline so you can focus on code.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={cardVariants}
              className="p-6 rounded-xl border border-border/50 bg-surface/60 backdrop-blur-sm hover:border-primary/20 hover:bg-surface/80 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center mb-4 group-hover:from-primary/15 group-hover:to-primary/10 transition-all">
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-text text-base mb-2">{f.title}</h3>
              <p className="text-text-secondary/70 text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
