import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

/**
 * /deploy?plan=standard&repo=...
 *
 * Public entry point that handles auth before forwarding to /dashboard/deploy.
 * - Authenticated  → immediately redirect to /dashboard/deploy preserving all params
 * - Not authed     → redirect to /login with a redirect param so login page sends
 *                    the user to /dashboard/deploy after sign-in
 */
export default function DeployGateway() {
  const { isAuthenticated, authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const dest = `/dashboard/deploy?${searchParams.toString()}`;

  // Prefetch dashboard chunks while the user is on the login page
  useEffect(() => {
    import('./dashboard/DashboardLayout').catch(() => {});
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      navigate(dest, { replace: true });
    } else {
      navigate(`/login?redirect=${encodeURIComponent(dest)}`, { replace: true });
    }
  }, [authLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background relative">
      <LoadingSpinner />
    </div>
  );
}

