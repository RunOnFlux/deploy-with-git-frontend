import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import AppInfoCard from '../../components/management/AppInfoCard';
import SpecEditorCard from '../../components/management/SpecEditorCard';
import InstanceCard from '../../components/management/InstanceCard';
import { fetchAppSpec, fetchNodeStatuses, getMgmtPort, getSpecEnvValue } from '../../services/managementService';

const POLL_INTERVAL_MS = 30_000;

export default function AppDetail() {
  const { appName } = useParams();

  const [spec, setSpec] = useState(null);
  const [nodeStatuses, setNodeStatuses] = useState([]);
  const [specLoading, setSpecLoading] = useState(true);
  const [statusesLoading, setStatusesLoading] = useState(true);
  const [specError, setSpecError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSpec = useCallback(async () => {
    try {
      const s = await fetchAppSpec(appName);
      setSpec(s);
      setSpecError(null);
    } catch (err) {
      setSpecError(err.message);
    } finally {
      setSpecLoading(false);
    }
  }, [appName]);

  const loadStatuses = useCallback(async () => {
    try {
      const statuses = await fetchNodeStatuses(appName);
      setNodeStatuses(statuses);
    } finally {
      setStatusesLoading(false);
    }
  }, [appName]);

  useEffect(() => {
    loadSpec();
    loadStatuses();
  }, [loadSpec, loadStatuses]);

  useEffect(() => {
    const interval = setInterval(loadStatuses, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadStatuses]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadSpec(), loadStatuses()]);
    setRefreshing(false);
  }

  function handleSaved() {
    setTimeout(loadSpec, 3000);
  }

  const isLoading = specLoading || statusesLoading;

  return (
    <>
      <Helmet>
        <title>{appName} — Orbit</title>
      </Helmet>

      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link to="/dashboard/deployments" className="text-text-muted hover:text-text transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-heading text-2xl font-bold text-text">{appName}</h1>
              <p className="text-text-secondary text-sm mt-0.5">App Management</p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {specError && (
          <div className="mb-6 p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
            Failed to load app spec: {specError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <AppInfoCard spec={spec} nodeStatuses={nodeStatuses} appName={appName} />
          <SpecEditorCard spec={spec} onSaved={handleSaved} />
        </div>

        <div>
          <h2 className="font-semibold text-text mb-3">
            Instances
            {!statusesLoading && (
              <span className="ml-2 text-sm font-normal text-text-muted">
                ({nodeStatuses.length} node{nodeStatuses.length !== 1 ? 's' : ''})
              </span>
            )}
          </h2>

          {isLoading && nodeStatuses.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-surface-hover rounded-xl animate-pulse" />
              ))}
            </div>
          ) : nodeStatuses.length === 0 ? (
            <div className="card text-center text-text-muted text-sm py-8">
              No running instances found. The app may still be deploying.
            </div>
          ) : (
            <div className="space-y-3">
              {nodeStatuses.map((node) => (
                <InstanceCard
                  key={`${node.ip}-${node.port}`}
                  node={node}
                  appName={appName}
                  mgmtPort={getMgmtPort(spec)}
                  webhookSecret={getSpecEnvValue(spec, 'WEBHOOK_SECRET')}
                  branch={getSpecEnvValue(spec, 'GIT_BRANCH', 'BRANCH') || 'main'}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
