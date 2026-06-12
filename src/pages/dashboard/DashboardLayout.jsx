import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LayoutDashboard, CreditCard, HelpCircle, LogOut, Menu, X, MoreHorizontal, BookOpen, Github, ExternalLink, Sun, Moon, Rocket } from 'lucide-react';
import OrbitSpinner from '../../components/common/OrbitSpinner';
import CookieSettingsDialog from '../../components/common/CookieSettingsDialog';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/deployments', label: 'Deployments', icon: Rocket },
  { to: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { to: '/dashboard/support', label: 'Support', icon: HelpCircle },
];

function SidebarContent({ user, onNavClick, onLogout, theme, toggleTheme }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <>
      {/* Logo */}
      <div className="flex items-center px-4 py-5 border-b border-border">
        <img src="/orbit-logo.svg" alt="Orbit" className="orbit-logo w-auto" style={{ height: '1.5rem' }} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Help links */}
      <div className="px-3 pb-2 shrink-0 space-y-0.5">
        <a
          href="https://github.com/RunOnFlux/deploy-with-git"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-text-secondary hover:bg-surface-hover hover:text-text transition-colors group"
        >
          <Github className="w-4 h-4 shrink-0" />
          <span className="flex-1">Deployment Samples</span>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </a>
        <a
          href="https://docs.runonflux.com/fluxcloud/register-new-app/deploy-with-git/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-text-secondary hover:bg-surface-hover hover:text-text transition-colors group"
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span className="flex-1">Documentation</span>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </a>
      </div>

      {/* User section */}
      <div className="p-3 border-t border-border shrink-0">
        <div ref={menuRef} className="relative">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors min-w-0">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {user?.email?.[0]?.toUpperCase() ?? user?.displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="text-xs text-text-secondary truncate flex-1">
              {user?.email ?? user?.displayName ?? 'Wallet User'}
            </span>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="shrink-0 p-1 rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
              aria-label="User menu"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {menuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={() => { toggleTheme(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              >
                {theme === 'dark'
                  ? <Sun className="w-4 h-4" />
                  : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <div className="h-px bg-border mx-2 my-1" />
              <button
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout() {
  const { user, isAuthenticated, logout, authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCookieSettings, setShowCookieSettings] = useState(false);

  // (data-theme is managed globally by ThemeProvider in ThemeContext)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner-color"><OrbitSpinner size={56} /></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, static on desktop */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-border bg-surface
          transition-transform duration-200 ease-in-out
          lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:translate-x-0 lg:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Mobile close button */}
        <button
          className="absolute top-4 right-4 lg:hidden text-text-muted hover:text-text"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        <SidebarContent
          user={user}
          onNavClick={() => setSidebarOpen(false)}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </aside>

      {/* Right side: mobile top bar + page content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden h-14 flex items-center gap-3 px-4 border-b border-border bg-surface sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/orbit-logo.svg" alt="Orbit" className="orbit-logo w-auto" style={{ height: '1.5rem' }} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />

          {/* Footer */}
          <footer className="border-t border-border px-6 py-4 mt-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted">
              <span>© {new Date().getFullYear()} InFlux Technologies</span>
              <button
                type="button"
                onClick={() => setShowCookieSettings(true)}
                className="hover:text-text transition-colors"
              >
                Cookie Settings
              </button>
            </div>
          </footer>
        </main>
      </div>

      <CookieSettingsDialog
        isOpen={showCookieSettings}
        onClose={() => setShowCookieSettings(false)}
      />
    </div>
  );
}
