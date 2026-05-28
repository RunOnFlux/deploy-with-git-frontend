import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Activity, Globe, Plus, RefreshCw, Rocket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppsWithStatus } from '../../hooks/useApps';
import { AppCard, PageHeader } from '../../components/dashboard';

export default function Overview() {
  const { user } = useAuth();
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'there';
  const { apps, loading, refresh } = useAppsWithStatus();

  const runningCount = apps.filter((a) => a.status === 'running').length;
  const totalNodes = apps.reduce((sum, a) => sum + (a.instances ?? 0), 0);
  const recentApps = [...apps].sort((a, b) => b.height - a.height).slice(0, 3);

  return (
    <>
      <Helmet>
        <title>Overview — Orbit</title>
      </Helmet>

      <div className="p-6">
        <PageHeader
          icon={LayoutDashboard}
          title={`Welcome back, ${displayName}`}
          subtitle="Here's an overview of your Orbit deployments."
          actions={
            <button
              onClick={refresh}
              disabled={loading}
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          }
        />

        {/* Stat cards — only shown once apps are loaded and at least one exists */}
        {!loading && apps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Running</p>
              <p className="text-2xl font-bold text-text">
                {runningCount}
              </p>
            </div>
          </div>

          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Deployments</p>
              <p className="text-2xl font-bold text-text">
                {apps.length}
              </p>
            </div>
          </div>

          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Nodes</p>
              <p className="text-2xl font-bold text-text">
                {totalNodes}
              </p>
            </div>
          </div>
        </div>
        )}

        {/* Recent deployments or empty state */}
        {!loading && apps.length === 0 ? (
          <div className="card border-dashed flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Rocket className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-text mb-2">No deployments yet</h3>
            <p className="text-text-secondary text-sm mb-6 max-w-xs">
              Connect a git repository and deploy it to the Flux decentralized cloud in minutes.
            </p>
            <Link to="/dashboard/deploy" className="btn-primary">
              <Plus className="w-4 h-4" />
              Deploy your first app
            </Link>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-text">Recent deployments</h2>
              <Link
                to="/dashboard/deployments"
                className="text-sm text-text-secondary hover:text-primary transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="card animate-pulse h-36 bg-surface-hover" />
                  ))
                : recentApps.map((app) => <AppCard key={app.name} app={app} onRetry={refresh} />)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
