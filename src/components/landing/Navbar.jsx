import { useState, useEffect } from 'react';
import { Rocket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoginModal from '../auth/LoginModal';

const NAV_LINKS = [
  { label: 'Features',   href: '#features'    },
  { label: 'Pricing',    href: '#pricing'      },
  { label: 'FAQ',        href: '#faq'          },
];

export default function Navbar({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-colors duration-500 border-b ${
          scrolled
            ? 'bg-background/90 backdrop-blur-md border-border/60'
            : 'bg-transparent border-transparent'
        }`}
      >
        <div className="w-full px-6 sm:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Rocket className="w-5 h-5 text-primary" />
            <span className="font-heading font-bold text-text text-lg tracking-tight">Orbit</span>
          </div>

          {/* Nav links - hidden on small screens */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3.5 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg
                           hover:bg-white/5 transition-colors"
              >
                {l.label}
              </a>
            ))}
            <a
              href="https://github.com/RunOnFlux/deploy-with-git"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 text-sm text-text-muted hover:text-text rounded-lg
                         hover:bg-white/5 transition-colors"
            >
              Guides
            </a>
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <a href="/dashboard" className="btn-primary text-sm px-4 py-2">
                Dashboard
              </a>
            ) : (
              <button
                onClick={() => setLoginOpen(true)}
                className="btn-primary text-sm px-4 py-2"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

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
