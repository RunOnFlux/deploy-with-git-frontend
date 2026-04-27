import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';

import GlobeLoader from './components/common/GlobeLoader';

// Lazy-loaded pages
const Home = lazy(() => import('./pages/Home'));
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout'));
const Overview = lazy(() => import('./pages/dashboard/Overview'));
const Deployments = lazy(() => import('./pages/dashboard/Deployments'));
const DeployWizard = lazy(() => import('./pages/dashboard/DeployWizard'));
const AppDetail = lazy(() => import('./pages/dashboard/AppDetail'));
const Billing = lazy(() => import('./pages/dashboard/Billing'));
const Support = lazy(() => import('./pages/dashboard/Support'));
const NotFound = lazy(() => import('./pages/NotFound'));
const DeployGateway = lazy(() => import('./pages/DeployGateway'));

function StripeSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-text mb-2">Payment successful!</h1>
        <p className="text-text-muted text-sm mb-6">
          Your payment has been processed. You can close this tab and return to your deployment.
        </p>
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

const PageLoader = () => <GlobeLoader />;

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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Router>
              <div className="min-h-screen bg-background text-text">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Public */}
                    <Route path="/" element={<Home />} />
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
            </Router>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
