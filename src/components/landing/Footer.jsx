import { Rocket } from 'lucide-react';

const links = [
  { label: 'Flux Network', href: 'https://runonflux.io', external: true },
  { label: 'FluxOS', href: 'https://home.runonflux.io', external: true },
  { label: 'GitHub', href: 'https://github.com/runonflux', external: true },
  { label: 'Docs', href: '#', external: false },
];

export default function Footer() {
  return (
    <footer className="border-t border-border py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <span className="font-heading font-bold text-text">Orbit</span>
          <span className="text-text-muted text-sm ml-2">
            © {new Date().getFullYear()} Flux Labs
          </span>
        </div>

        {/* Links */}
        <nav className="flex items-center gap-6">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.external ? '_blank' : undefined}
              rel={l.external ? 'noopener noreferrer' : undefined}
              className="text-sm text-text-muted hover:text-text transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
