import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
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
  style: {
    background: '#0f172a',
    color: '#f1f5f9',
    border: '1px solid #1e293b',
  },
  success: {
    iconTheme: { primary: '#10b981', secondary: '#f1f5f9' },
  },
  error: {
    iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' },
  },
};

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <div className="min-h-screen bg-background text-text">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<Home />} />
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

              <Toaster position="top-center" toastOptions={toastOptions} />
            </div>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
