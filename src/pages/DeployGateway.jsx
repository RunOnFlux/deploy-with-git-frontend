import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginModal from '../components/auth/LoginModal';
import GlobeLoader from '../components/common/GlobeLoader';

/**
 * /deploy?plan=standard&repo=...
 *
 * Public entry point that handles auth before forwarding to /dashboard/deploy.
 * - Authenticated  → immediately redirect to /dashboard/deploy preserving all params
 * - Not authed     → show LoginModal; on success or on auth state change, redirect
 *
 * Note: email login fires onClose (not onSuccess) — LoginModal relies on Firebase's
 * onAuthStateChanged. We stay mounted and watch isAuthenticated via effect.
 */
export default function DeployGateway() {
  const { isAuthenticated, authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginOpen, setLoginOpen] = useState(false);

  const dest = `/dashboard/deploy?${searchParams.toString()}`;

  // Prefetch dashboard chunks while the user fills in the login form
  useEffect(() => {
    import('./dashboard/DashboardLayout');
    import('./dashboard/DeployWizard');
  }, []);

  // Show login as soon as auth state is known
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      navigate(dest, { replace: true });
    } else {
      setLoginOpen(true);
    }
  }, [authLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wallet login: onSuccess fires synchronously after auth is set
  function handleSuccess() {
    setLoginOpen(false);
    navigate(dest, { replace: true });
  }

  // Modal dismissed: stay on /deploy — do NOT navigate away.
  // Email login fires onClose (not onSuccess) and relies on onAuthStateChanged;
  // the isAuthenticated effect above will handle the redirect when Firebase fires.
  // For explicit cancel the user sees the globe + "Go back" link below.
  function handleClose() {
    setLoginOpen(false);
  }

  return (
    <div className="min-h-screen bg-background relative">
      <GlobeLoader />

      {/* Small escape hatch when user dismisses the modal */}
      {!loginOpen && !authLoading && !isAuthenticated && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50">
          <button
            onClick={() => navigate('/', { replace: true })}
            className="text-xs text-text-muted hover:text-text underline underline-offset-2 transition-colors"
          >
            ← Back to home
          </button>
        </div>
      )}

      <LoginModal isOpen={loginOpen} onClose={handleClose} onSuccess={handleSuccess} />
    </div>
  );
}

