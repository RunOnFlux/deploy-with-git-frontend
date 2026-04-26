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

const STATS = [
  { value: '10,000+', label: 'global nodes' },
  { value: '100+',    label: 'frameworks' },
  { value: 'Free',    label: 'forever tier' },
  { value: 'Zero',    label: 'Docker needed' },
];

export default function FrameworkLogosSection() {
  return (
    <div className="border-b border-border/50 bg-surface/20">
      <div className="max-w-xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/40">
        {STATS.map((s) => (
          <div key={s.label} className="bg-background flex flex-col items-center py-5 px-3">
            <span className="text-xl font-bold text-text font-heading">{s.value}</span>
            <span className="text-sm text-text-secondary mt-0.5">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
