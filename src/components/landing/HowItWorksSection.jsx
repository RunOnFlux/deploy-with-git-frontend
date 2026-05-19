import { motion } from 'framer-motion';
import { GitBranch, Settings, Rocket } from 'lucide-react';

const steps = [
  {
    icon: GitBranch,
    number: '1',
    title: 'Connect repository',
    description:
      'Paste your GitHub, GitLab, or Bitbucket URL. Public or private repos supported.',
  },
  {
    icon: Settings,
    number: '2',
    title: 'Auto-detect & configure',
    description:
      'Automatic framework detection. Set environment variables and choose your plan.',
  },
  {
    icon: Rocket,
    number: '3',
    title: 'Deploy worldwide',
    description:
      'One click deploys to 10,000+ Flux nodes globally. Live URL in minutes.',
  },
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <p className="inline-flex items-center gap-2 text-primary/80 text-sm font-medium uppercase tracking-wider mb-4 px-4 py-1.5 rounded-full border border-primary/10 bg-primary/5">
            How it works
          </p>
          <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-light text-text leading-tight">
            Deploy in <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent font-normal">three simple steps</span>
          </h2>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-8 lg:gap-10"
        >
          {steps.map((s, idx) => (
            <motion.div
              key={s.number}
              variants={cardVariants}
              className="relative"
            >
              {/* Connector line (not on last item) */}
              {idx < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-full w-full h-px bg-gradient-to-r from-border to-transparent -z-10" />
              )}
              
              {/* Number badge */}
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center">
                  <s.icon className="w-7 h-7 text-primary" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shadow-lg shadow-primary/30">
                  {s.number}
                </div>
              </div>

              <h3 className="font-semibold text-text text-xl mb-3">{s.title}</h3>
              <p className="text-text-secondary/70 text-base leading-relaxed">{s.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
