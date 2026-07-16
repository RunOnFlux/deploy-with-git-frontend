import { motion } from 'framer-motion';
import { ArrowRight, Github } from 'lucide-react';
import deployToFluxImage from '../../assets/deploytoflux.png';

export default function DeployToFluxSection() {
  return (
    <section className="px-6 py-20 lg:py-24 border-b border-border/50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-5xl mx-auto overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-surface to-cyan-400/5"
      >
        <div className="grid md:grid-cols-[1fr_auto] items-center gap-8 p-8 sm:p-10">
          <div>
            <p className="inline-flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-widest mb-4">
              <Github className="w-4 h-4" /> Deploy to Flux
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text leading-tight mb-4">
              Make your repository one-click deployable
            </h2>
            <p className="text-text-secondary leading-relaxed max-w-2xl mb-6">
              Add a Deploy to Flux button to your README so anyone can launch your project with its
              repository, branch, project path, and plan already filled in.
            </p>
            <a
              href="/deploy-to-flux"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:text-cyan-300 transition-colors"
            >
              Create your button
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <a
            href="/deploy-to-flux"
            className="group flex min-h-36 min-w-64 items-center justify-center rounded-2xl border border-border bg-background/60 p-8 shadow-xl shadow-black/20 hover:border-primary/40 transition-colors"
            aria-label="Learn how to add a Deploy to Flux button"
          >
            <img
              src={deployToFluxImage}
              alt="Deploy to Flux"
              width="136"
              height="28"
              className="h-9 w-auto group-hover:scale-105 transition-transform"
            />
          </a>
        </div>
      </motion.div>
    </section>
  );
}
