import { useQuery, useQueries } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { fetchAppsRaw, parseAppData, fetchAppStatus } from '../services/appsService';
import { decryptEnterpriseSpec } from '../services/enterpriseCrypto';

/**
 * Fetch the list of Orbit apps for the current user.
 * Enterprise apps (compose: []) are decrypted before parseAppData runs so that
 * cpu/ram/repo fields are populated correctly.
 * Disabled in dev-mock mode (zelid starts with 'dev_').
 */
export function useApps() {
  const { zelidauth } = useAuth();
  const zelid = zelidauth?.zelid;
  const isDevMock = zelid?.startsWith('dev_');

  const { data: apps = [], isLoading, error, refetch } = useQuery({
    queryKey: ['apps', zelid],
    queryFn: async () => {
      const rawApps = await fetchAppsRaw(zelid);
      const decrypted = await Promise.all(
        rawApps.map((a) => (a.enterprise && zelidauth ? decryptEnterpriseSpec(a, zelidauth) : a)),
      );
      return decrypted.map(parseAppData);
    },
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

  const locationQueries = useQueries({
    queries: apps.map((app) => ({
      queryKey: ['appLocation', app.name],
      queryFn: async () => {
        const { default: axiosInstance } = await import('../services/axiosInstance');
        const resp = await axiosInstance.get(
          `/flux/apps/location/${encodeURIComponent(app.name)}`,
          { headers: { 'x-apicache-bypass': true } },
        );
        return resp.data?.data ?? [];
      },
      staleTime: 30_000,
      refetchInterval: 30_000,
    })),
  });

  const appsWithStatus = apps.map((app, i) => {
    const q = statusQueries[i];
    const lq = locationQueries[i];
    const statusLoading = !q || q.isPending;
    const nodes = lq?.data ?? [];
    const nodeIp = nodes.find(n => Boolean(n.runningSince))?.ip ?? nodes[0]?.ip ?? null;
    return {
      ...app,
      status: statusLoading ? 'loading' : (q.data ?? 'unknown'),
      nodeIp,
    };
  });

  return {
    apps: appsWithStatus,
    loading: appsLoading,
    error,
    refresh,
  };
}
