import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Plus, Search, RefreshCw, Rocket } from 'lucide-react';
import { useAppsWithStatus } from '../../hooks/useApps';
import { AppCard } from '../../components/dashboard';

export default function Deployments() {
  const { apps, loading, refresh } = useAppsWithStatus();
  const [query, setQuery] = useState('');

  const filtered = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(query.toLowerCase()) ||
      app.gitRepo.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <Helmet>
        <title>Deployments — Orbit</title>
      </Helmet>

      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="font-heading text-2xl font-bold text-text">Deployments</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link to="/dashboard/deploy" className="btn-primary">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Deployment</span>
              <span className="sm:hidden">New</span>
            </Link>
          </div>
        </div>

        {/* Search */}
        {apps.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="search"
              placeholder="Search deployments…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-44 bg-surface-hover" />
            ))}
          </div>
        )}

        {/* App grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((app) => (
              <AppCard key={app.name} app={app} />
            ))}
          </div>
        )}

        {/* No search results */}
        {!loading && apps.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 text-text-secondary">
            <p className="text-sm">No deployments match &ldquo;{query}&rdquo;</p>
            <button
              className="mt-2 text-sm text-primary hover:underline"
              onClick={() => setQuery('')}
            >
              Clear search
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && apps.length === 0 && (
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
        )}
      </div>
    </>
  );
}
