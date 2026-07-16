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
      'One click deploys to thousands of Flux nodes globally. Live URL in minutes.',
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
          <p className="text-text-secondary/70 text-base leading-relaxed max-w-3xl mx-auto mt-6">
            Deploying is a single Git push. Connect a GitHub, GitLab or Bitbucket repository and
            Orbit inspects the project, detecting the framework, install step, build command and
            start command for you with Nixpacks, with no Dockerfile or YAML required. It packages your app into
            a container, builds it, and distributes it across the Flux nodes you pick, or spreads it
            worldwide automatically. From then on every push to your chosen branch triggers a fresh
            build and redeploy through a webhook, with build logs streaming in real time. If a build
            fails, the last known-good version stays live and Orbit rolls back on its own, so a bad
            commit can never take your site down.
          </p>
          <p className="text-text-secondary/70 text-base leading-relaxed max-w-3xl mx-auto mt-4">
            That detection step is why Orbit is not limited to static sites or to one ecosystem.
            Node.js, Python, Go, Rust, Java, .NET, PHP and Ruby all work out of the box, and
            front-end frameworks like Next.js, Remix, Nuxt, SvelteKit, Astro and Vite build and
            deploy in the same zero-config flow. Because your app runs as a full long-running
            container rather than a serverless function, the backends other platforms handle
            poorly run natively. That includes Django, Flask, FastAPI, Rails, Express, Go and Rust
            services, background workers, and persistent processes. If it builds into a container, Orbit can
            deploy it.
          </p>
          <p className="text-text-secondary/70 text-base leading-relaxed max-w-3xl mx-auto mt-4">
            Every push to your default branch rebuilds and redeploys automatically, so shipping is
            just <code>git push</code>. Environment variables and secrets are set per app and injected
            at runtime rather than baked into the image, which means the same build can be promoted
            without rebuilding it. And because there is no vendor runtime to code against, moving an
            app off Orbit is as straightforward as moving it on. It remains an ordinary container throughout.
          </p>
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
