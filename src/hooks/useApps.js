import { useQuery, useQueries } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { fetchApps, fetchAppStatus } from '../services/appsService';

/**
 * Fetch the list of Orbit apps for the current user.
 * Disabled in dev-mock mode (zelid starts with 'dev_').
 */
export function useApps() {
  const { zelidauth } = useAuth();
  const zelid = zelidauth?.zelid;
  const isDevMock = zelid?.startsWith('dev_');

  const { data: apps = [], isLoading, error, refetch } = useQuery({
    queryKey: ['apps', zelid],
    queryFn: () => fetchApps(zelid),
    enabled: !!zelid && !isDevMock,
    staleTime: 5 * 60 * 1000,
  });

  return { apps, loading: isLoading, error, refresh: refetch };
}

/**
 * Fetch apps and their live node statuses in parallel.
 * Status queries refresh every 30 seconds.
 */
export function useAppsWithStatus() {
  const { apps, loading: appsLoading, error, refresh } = useApps();

  const statusQueries = useQueries({
    queries: apps.map((app) => ({
      queryKey: ['appStatus', app.name],
      queryFn: () => fetchAppStatus(app.name),
      staleTime: 30_000,
      refetchInterval: 30_000,
    })),
  });

  const appsWithStatus = apps.map((app, i) => ({
    ...app,
    status: statusQueries[i]?.isLoading ? 'loading' : (statusQueries[i]?.data ?? 'unknown'),
  }));

  return {
    apps: appsWithStatus,
    loading: appsLoading,
    error,
    refresh,
  };
}
