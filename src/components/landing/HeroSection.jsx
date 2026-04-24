import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LoginModal from '../auth/LoginModal';
import { useAuth } from '../../context/AuthContext';

// Terminal lines — fixed set, card height never changes
const TERMINAL_LINES = [
  { prefix: '$',  prefixColor: 'text-accent',   text: ' git push origin main' },
  { prefix: '',   prefixColor: '',               text: 'Enumerating objects: 5, done.', dim: true },
  { prefix: '',   prefixColor: '',               text: 'Writing objects: 100% (5/5), 1.2 KiB', dim: true },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Orbit detected push → triggering build…' },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Framework: ', highlight: '__FRAMEWORK__' },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Build complete in 23s' },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Deploying to Flux network…' },
  { prefix: '✓',  prefixColor: 'text-accent',    text: ' Live: ', highlight: '__LIVE__' },
];

// Frameworks that cycle in the terminal on each loop
const FRAMEWORK_CYCLE = [
  { name: 'Next.js 14',  slug: 'my-nextjs-app'  },
  { name: 'React 18',    slug: 'my-react-app'   },
  { name: 'Vue 3',       slug: 'my-vue-app'     },
  { name: 'Django 5',    slug: 'my-django-app'  },
  { name: 'FastAPI',     slug: 'my-fastapi-app' },
  { name: 'NestJS',      slug: 'my-nestjs-app'  },
  { name: 'Svelte 5',    slug: 'my-svelte-app'  },
  { name: 'Astro 4',     slug: 'my-astro-app'   },
  { name: 'Laravel 11',  slug: 'my-laravel-app' },
  { name: 'Go / Gin',    slug: 'my-go-app'      },
];

const FRAMEWORKS_MARQUEE = [
  { name: 'Next.js', color: '#e2e8f0' }, { name: 'React', color: '#61dafb' },
  { name: 'Django', color: '#44b78b' }, { name: 'FastAPI', color: '#009688' },
  { name: 'NestJS', color: '#e0234e' }, { name: 'Vue', color: '#42d392' },
  { name: 'Remix', color: '#a78bfa' }, { name: 'Astro', color: '#ff7b35' },
  { name: 'Rails', color: '#cc0000' }, { name: 'Laravel', color: '#ff2d20' },
  { name: 'Gin', color: '#00acd7' }, { name: 'Actix Web', color: '#f74c00' },
  { name: 'Spring Boot', color: '#6db33f' }, { name: 'Svelte', color: '#ff3e00' },
  { name: 'Flask', color: '#94a3b8' }, { name: 'Nuxt', color: '#00dc82' },
  { name: 'Hono', color: '#f97316' }, { name: 'Blazor', color: '#5c2d91' },
];
const MARQUEE_ITEMS = [...FRAMEWORKS_MARQUEE, ...FRAMEWORKS_MARQUEE];

// Typewriter: reveals lines one by one, then loops
function useTypewriter(lines, { paused = false } = {}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (paused) {
      setVisibleCount(lines.length);
      return;
    }

    function step(count) {
      if (count < lines.length) {
        timerRef.current = setTimeout(() => {
          setVisibleCount(count + 1);
          step(count + 1);
        }, 420);
      } else {
        // Pause at end, fade out, then swap framework + restart
        timerRef.current = setTimeout(() => {
          setVisibleCount(0); // triggers fade-out (300ms transition)
          timerRef.current = setTimeout(() => {
            setLoopCount(c => c + 1); // switch framework only after fade is done
            step(0);
          }, 350);
        }, 3200);
      }
    }

    step(visibleCount);
    return () => clearTimeout(timerRef.current);
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  return { visibleCount, loopCount };
}

export default function HeroSection({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  const { visibleCount: visibleLines, loopCount } = useTypewriter(TERMINAL_LINES, { paused: reducedMotion });
  const currentFramework = FRAMEWORK_CYCLE[loopCount % FRAMEWORK_CYCLE.length];

  function handleCTA() {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      setLoginOpen(true);
    }
  }

  return (
    <>
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">

        {/* ── Background ─────────────────────────────────────────────────── */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          {/* Primary glow */}
          <motion.div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]"
            animate={reducedMotion ? {} : { scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Accent glow */}
          <div className="absolute top-1/3 left-[15%] w-[260px] h-[260px] bg-accent/6 rounded-full blur-[70px]" />
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {/* Bottom fade to next section */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-5 sm:px-6 text-center pt-28 pb-10">

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-7"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Git-native deployment for the Flux network
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-heading font-bold text-text leading-[1.07] tracking-tight mb-5
                       text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Deploy to Flux
            <br />
            {/* Gradient text with solid fallback */}
            <span
              className="text-primary bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: '#3b82f6', // fallback
              }}
            >
              with Git
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-text-secondary leading-relaxed max-w-2xl mx-auto mb-9
                       text-base sm:text-lg md:text-xl"
          >
            Push your code. Orbit handles the rest: builds, deploys, and scales your app
            across 10,000+ Flux nodes worldwide. Free tier, no credit card required.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12"
          >
            <button
              onClick={handleCTA}
              className="btn-primary text-sm sm:text-base px-6 py-3 sm:px-7 sm:py-3.5
                         flex items-center gap-2 w-full sm:w-auto justify-center
                         shadow-lg shadow-primary/20 hover:shadow-primary/35 transition-shadow"
            >
              Start Deploying Free
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary
                         border border-border rounded-xl px-5 py-3 w-full sm:w-auto justify-center
                         hover:border-primary/40 hover:text-text transition-colors"
            >
              How it works ↓
            </a>
          </motion.div>

          {/* Framework logos marquee */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="w-full overflow-hidden"
            aria-label="Supported frameworks"
          >
            <p className="text-xs text-text-muted text-center mb-3">
              Deploys any stack.{' '}
              <a
                href="https://github.com/RunOnFlux/deploy-with-git"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 transition-colors"
              >
                view all framework guides →
              </a>
            </p>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
              <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent" />
              <div className="marquee-track flex gap-2" style={{ width: 'max-content' }}>
                {MARQUEE_ITEMS.map((fw, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/60
                               bg-surface/50 text-[10px] font-mono whitespace-nowrap select-none"
                    style={{ color: fw.color }}
                  >
                    <span
                      className="w-1 h-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: fw.color, opacity: 0.8 }}
                    />
                    {fw.name}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Terminal mockup ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.55, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-xl sm:max-w-2xl mx-auto px-5 sm:px-6 pb-20"
          aria-hidden="true"
        >
          <div
            className="rounded-2xl border border-border bg-surface/80 backdrop-blur
                        overflow-hidden shadow-2xl shadow-primary/10"
          >
            {/* Chrome bar */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-white/[0.025]">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              <span className="ml-3 text-xs text-text-muted font-mono">orbit — bash</span>
            </div>

            {/* Fixed-height body prevents layout shift during typewriter */}
            <div className="p-4 sm:p-5 font-mono text-[11px] sm:text-xs leading-[1.75] h-[168px] sm:h-[186px] overflow-hidden">
              {TERMINAL_LINES.map((line, i) => (
                <div
                  key={i}
                  className={`transition-opacity duration-300 ${
                    i < visibleLines ? 'opacity-100' : 'opacity-0'
                  } ${line.dim ? 'text-text-muted' : 'text-text-secondary'}`}
                >
                  {line.prefix && (
                    <span className={`${line.prefixColor} mr-1`}>{line.prefix}</span>
                  )}
                  {line.text}
                  {line.highlight && (
                    <span className="text-accent font-semibold">
                      {line.highlight === '__FRAMEWORK__'
                        ? currentFramework.name
                        : line.highlight === '__LIVE__'
                        ? `${currentFramework.slug}.app.runonflux.io`
                        : line.highlight}
                    </span>
                  )}
                  {/* Blinking cursor on last visible line */}
                  {i === visibleLines - 1 && !reducedMotion && (
                    <motion.span
                      className="inline-block w-[7px] h-[13px] bg-text-secondary ml-0.5 align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

      </section>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          onLoginSuccess?.();
        }}
      />
    </>
  );
}
