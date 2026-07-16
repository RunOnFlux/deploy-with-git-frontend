const FRAMEWORKS = [
  // Node.js
  { name: 'Express',      color: '#e2e8f0' },
  { name: 'Fastify',      color: '#94a3b8' },
  { name: 'NestJS',       color: '#e0234e' },
  // Bun
  { name: 'Elysia',       color: '#a78bfa' },
  { name: 'Hono',         color: '#f97316' },
  // Frontend
  { name: 'React',        color: '#61dafb' },
  { name: 'Vue',          color: '#42d392' },
  { name: 'Svelte',       color: '#ff3e00' },
  { name: 'Angular',      color: '#dd0031' },
  { name: 'Preact',       color: '#673ab8' },
  { name: 'Vite',         color: '#646cff' },
  // Full-stack / SSR
  { name: 'Next.js',      color: '#e2e8f0' },
  { name: 'Nuxt',         color: '#00dc82' },
  { name: 'Remix',        color: '#a78bfa' },
  { name: 'Astro',        color: '#ff7b35' },
  { name: 'SolidStart',   color: '#4a90d9' },
  { name: 'TanStack Start',color: '#ef4444' },
  // Static
  { name: 'Gatsby',       color: '#663399' },
  { name: 'Docusaurus',   color: '#3ecc5f' },
  { name: 'Eleventy',     color: '#cbd5e1' },
  // Python
  { name: 'Django',       color: '#44b78b' },
  { name: 'FastAPI',      color: '#009688' },
  { name: 'Flask',        color: '#94a3b8' },
  { name: 'Streamlit',    color: '#ff4b4b' },
  // PHP / Ruby / Java
  { name: 'Laravel',      color: '#ff2d20' },
  { name: 'Rails',        color: '#cc0000' },
  { name: 'Spring Boot',  color: '#6db33f' },
  { name: 'Quarkus',      color: '#4695eb' },
  // .NET
  { name: 'ASP.NET Core', color: '#512bd4' },
  { name: 'Blazor',       color: '#5c2d91' },
  // Go
  { name: 'Gin',          color: '#00acd7' },
  { name: 'Fiber',        color: '#00acd7' },
  // Rust
  { name: 'Actix Web',    color: '#f74c00' },
  { name: 'Rocket',       color: '#d33847' },
];

// Duplicate for seamless loop
const ITEMS = [...FRAMEWORKS, ...FRAMEWORKS];

import { Globe, Layers, Gift, Infinity } from 'lucide-react';
import { useNetworkStats, formatNodeCount } from '../../hooks/useNetworkStats';

const STATS = [
  { key: 'nodes', value: 'thousands of', label: 'global nodes', Icon: Globe },
  { value: '100+',    label: 'frameworks',    Icon: Layers    },
  { value: 'Free',    label: 'forever tier',  Icon: Gift      },
  { value: 'Unlimited', label: 'builds forever', Icon: Infinity  },
];

export default function FrameworkLogosSection() {
  const { stats } = useNetworkStats();
  const items = STATS.map((s) =>
    s.key === 'nodes' ? { ...s, value: formatNodeCount(stats) } : s,
  );

  return (
    <div className="border-b border-border/50 bg-surface/20">
      <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4">
        {items.map((s, i) => (
          <div
            key={s.label}
            className="group relative flex flex-col items-center py-7 px-4 overflow-hidden
                       transition-colors duration-300 hover:bg-primary/5
                       border-r border-b border-border/40 last:border-r-0
                       [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r
                       [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0
                       sm:[&:nth-child(1)]:border-b-0 sm:[&:nth-child(2)]:border-b-0"
          >
            {/* Subtle glow on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                            bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08)_0%,transparent_70%)]" />

            <s.Icon className="w-5 h-5 mb-1 text-text-muted group-hover:text-primary transition-colors duration-300" aria-hidden="true" />
            <span className="relative text-2xl font-extrabold font-heading
                             bg-gradient-to-br from-text to-text-secondary bg-clip-text text-transparent
                             group-hover:from-primary group-hover:to-cyan-400
                             transition-all duration-300">
              {s.value}
            </span>
            <span className="relative text-xs text-text-muted mt-1 tracking-wide uppercase font-medium
                             group-hover:text-text-secondary transition-colors duration-300">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
