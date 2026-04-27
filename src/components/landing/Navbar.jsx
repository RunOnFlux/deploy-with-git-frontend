import { useState, useEffect } from 'react';
import { Zap, DollarSign, HelpCircle, BookOpen, ExternalLink, LogIn, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoginModal from '../auth/LoginModal';

const NAV_LINKS = [
  { label: 'Features', href: '#features', Icon: Zap         },
  { label: 'Pricing',  href: '#pricing',  Icon: DollarSign  },
  { label: 'FAQ',      href: '#faq',      Icon: HelpCircle  },
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
          <div className="flex items-center shrink-0">
            <img src="/orbit-logo.svg" alt="Orbit" className="h-8 w-auto" />
          </div>

          {/* Nav links - hidden on small screens */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ label, href, Icon }) => (
              <a
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg
                           hover:bg-white/5 transition-colors"
              >
                <Icon className="w-3.5 h-3.5 opacity-70" />
                {label}
              </a>
            ))}
            <a
              href="https://github.com/RunOnFlux/deploy-with-git"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg
                         hover:bg-white/5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 opacity-70" />
              Guides
              <ExternalLink className="w-3 h-3 opacity-40" />
            </a>
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <a href="/dashboard" className="btn-cta inline-flex items-center gap-1.5 text-sm px-4 py-2">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </a>
            ) : (
              <button
                onClick={() => setLoginOpen(true)}
                className="btn-cta inline-flex items-center gap-1.5 text-sm px-4 py-2"
              >
                <LogIn className="w-4 h-4" />
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
