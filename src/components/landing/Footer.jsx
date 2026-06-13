import { useState } from 'react';
import CookieSettingsDialog from '../common/CookieSettingsDialog';
import { version } from '../../../package.json';

const YEAR = new Date().getFullYear();

const links = [
  { label: 'Flux Network', href: 'https://runonflux.io', external: true },
  { label: 'FluxOS', href: 'https://home.runonflux.io', external: true },
  { label: 'GitHub', href: 'https://github.com/runonflux', external: true },
  { label: 'Docs', href: 'https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/', external: true },
  { label: 'Samples', href: 'https://github.com/RunOnFlux/deploy-with-git', external: true },
];

export default function Footer() {
  const [showCookieSettings, setShowCookieSettings] = useState(false);

  return (
    <footer className="border-t border-border py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center">
          <img src="/orbit-logo.svg" alt="Orbit" className="h-6 w-auto" />
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
          <button
            type="button"
            onClick={() => setShowCookieSettings(true)}
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            Cookie Settings
          </button>
        </nav>
      </div>

      <p className="text-center text-sm text-text-muted mt-8">
        © {YEAR} InFlux Technologies. All rights reserved.{' '}
        <span className="text-text-muted/50">v{version}</span>
      </p>

      <CookieSettingsDialog
        isOpen={showCookieSettings}
        onClose={() => setShowCookieSettings(false)}
      />
    </footer>
  );
}
