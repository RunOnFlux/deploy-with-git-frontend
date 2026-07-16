import { lazy, Suspense, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AnalyticsTracker from './components/common/AnalyticsTracker';
import AnalyticsConsentBanner from './components/common/AnalyticsConsentBanner';
import ScrollToTop from './components/ScrollToTop';
import { MARKETING_ROUTES } from './content/pagesContent';

import LoadingSpinner from './components/common/LoadingSpinner';

/**
 * React.lazy + a preload() step.
 *
 * The build-time SSR prerender (scripts/prerender.mjs → src/entry-server.jsx) uses
 * renderToString, which is synchronous: a plain React.lazy component would suspend
 * and the prerender would emit the <Suspense> fallback (a spinner) instead of the
 * page. Once preload() has resolved, the wrapper renders the module synchronously,
 * so the server emits real markup — and the client, which preloads the same route
 * before hydrating, produces an identical first render.
 */
const lazyPage = (factory) => {
  const Lazy = lazy(factory);
  let Loaded = null;
  const Page = (props) => (Loaded ? <Loaded {...props} /> : <Lazy {...props} />);
  Page.preload = () => Promise.resolve(factory()).then((m) => { Loaded = m.default; });
  Page.displayName = 'LazyPage';
  return Page;
};

// Lazy-loaded pages
const Home = lazyPage(() => import('./pages/Home'));
const MarketingPage = lazyPage(() => import('./pages/MarketingPage'));
const DeployToFluxPage = lazyPage(() => import('./pages/DeployToFluxPage'));
const DashboardLayout = lazyPage(() => import('./pages/dashboard/DashboardLayout'));
const Overview = lazyPage(() => import('./pages/dashboard/Overview'));
const Deployments = lazyPage(() => import('./pages/dashboard/Deployments'));
const DeployWizard = lazyPage(() => import('./pages/dashboard/DeployWizard'));
const AppDetail = lazyPage(() => import('./pages/dashboard/AppDetail'));
const Billing = lazyPage(() => import('./pages/dashboard/Billing'));
const Support = lazyPage(() => import('./pages/dashboard/Support'));
const NotFound = lazyPage(() => import('./pages/NotFound'));
const DeployGateway = lazyPage(() => import('./pages/DeployGateway'));
const LoginPage = lazyPage(() => import('./pages/Login'));

// Which page component serves each prerendered/hydrated path. Used to load exactly
// the chunk for the route being rendered (server) or hydrated (client) — never the
// whole app. Every marketing route is served by the same MarketingPage component.
const ROUTE_PAGES = {
  '/': Home,
  '/login': LoginPage,
  '/deploy': DeployGateway,
  ...Object.fromEntries(MARKETING_ROUTES.map((route) => [route, MarketingPage])),
  '/deploy-to-flux': DeployToFluxPage,
};

/** Load the chunk for `pathname` (falling back to NotFound) before render/hydrate. */
export const preloadRoute = (pathname) => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const Page = ROUTE_PAGES[clean] || NotFound;
  return Page.preload();
};

function StripeSuccessPage() {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          window.close();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-text mb-2">Payment successful!</h1>
        <p className="text-text-muted text-sm mb-2">
          Your payment has been processed. You can close this tab and return to your deployment.
        </p>
        <p className="text-text-muted text-xs mb-6">Closing automatically in {countdown}s…</p>
        <button
          onClick={() => window.close()}
          className="btn-primary"
        >
          Close tab
        </button>
      </div>
    </div>
  );
}

const PageLoader = () => <LoadingSpinner />;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const toastOptions = {
  duration: 4000,
};

function ToasterWithTheme() {
  const { theme } = useTheme();
  const style = theme === 'light'
    ? { background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }
    : { background: '#0f172a', color: '#f1f5f9', border: '1px solid #1e293b' };
  const iconTheme = theme === 'light'
    ? { success: { primary: '#047857', secondary: '#0f172a' }, error: { primary: '#b91c1c', secondary: '#0f172a' } }
    : { success: { primary: '#10b981', secondary: '#f1f5f9' }, error: { primary: '#ef4444', secondary: '#f1f5f9' } };
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        ...toastOptions,
        style,
        success: { iconTheme: iconTheme.success },
        error: { iconTheme: iconTheme.error },
      }}
    />
  );
}

/**
 * Everything that must live *inside* a Router. The client wraps this in
 * BrowserRouter, the SSR prerender in StaticRouter (src/entry-server.jsx); both
 * produce the same markup, which is what makes hydration adopt the server HTML.
 */
export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <AnalyticsTracker />
      <div className="min-h-screen bg-background text-text">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/deploy-to-flux" element={<DeployToFluxPage />} />
            {MARKETING_ROUTES.filter((route) => route !== '/deploy-to-flux').map((route) => (
              <Route key={route} path={route} element={<MarketingPage route={route} />} />
            ))}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/deploy" element={<DeployGateway />} />
            <Route path="/successcheckout" element={<StripeSuccessPage />} />

            {/* Dashboard (auth-protected layout) */}
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Overview />} />
              <Route path="deployments" element={<Deployments />} />
              <Route path="deployments/:appName" element={<AppDetail />} />
              <Route path="deploy" element={<DeployWizard />} />
              <Route path="billing" element={<Billing />} />
              <Route path="support" element={<Support />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>

        <ToasterWithTheme />
      </div>
      {/* Client-only: renders null until its effect runs, so it is absent from the
          SSR markup and from the client's first (hydrating) render. */}
      <AnalyticsConsentBanner />
    </>
  );
}

/** Router-agnostic providers. Shared by the client entry and the SSR prerender. */
export function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

AppProviders.propTypes = {
  children: PropTypes.node,
};

/** Client entry tree. The SSR equivalent lives in src/entry-server.jsx. */
function App() {
  return (
    <AppProviders>
      <Router>
        <AppRoutes />
      </Router>
    </AppProviders>
  );
}

export default App;
