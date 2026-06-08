import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LayoutDashboard, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing',  href: '#pricing'  },
  { label: 'FAQ',      href: '#faq'      },
  { label: 'Samples',   href: 'https://github.com/RunOnFlux/deploy-with-git', external: true },
];

const NAV_OFFSET = 72; // px — navbar height + a little breathing room

export default function Navbar({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 40); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleHashClick(e, href) {
    if (!href.startsWith('#')) return;
    e.preventDefault();
    const el = document.getElementById(href.slice(1));
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
        scrolled
          ? 'bg-background/90 backdrop-blur-md'
          : 'bg-transparent'
      }`}
    >
      <div className="w-full px-6 sm:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center shrink-0">
          <img src="/orbit-logo.svg" alt="Orbit" className="w-auto" style={{ height: '1.4rem' }} />
        </a>

        {/* Nav links + CTAs */}
        <div className="flex items-center gap-2 shrink-0">
          <nav className="hidden md:flex items-center gap-0.5 mr-2">
            {NAV_LINKS.map(({ label, href, external }) => (
              <a
                key={href}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                onClick={!external ? (e) => handleHashClick(e, href) : undefined}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text rounded-lg hover:bg-white/5 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
          {isAuthenticated ? (
            <a href="/dashboard" className="btn-cta inline-flex items-center gap-1.5 text-sm px-4 py-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </a>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text rounded-lg hover:bg-white/5 transition-colors hidden sm:block"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate('/login')}
                className="btn-cta inline-flex items-center gap-1.5 text-sm px-4 py-2"
              >
                Get started
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
