import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, GitCommit, Cpu, HardDrive, Layers, ExternalLink, Globe, Lock, RefreshCw } from 'lucide-react';
import { FaGithub, FaGitlab, FaBitbucket } from 'react-icons/fa';
import StatusBadge from './StatusBadge';
import { fetchNodeOrbitStatus, getMgmtPort, getSpecEnvValue } from '../../services/managementService';

function Skel({ className }) {
  return <div className={`animate-pulse rounded bg-surface-hover ${className}`} />;
}

function AppCardSkeleton({ compact }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <Skel className="h-4 w-2/5 mb-1.5" />
          {!compact && <Skel className="h-3 w-3/5" />}
        </div>
        <Skel className="h-5 w-16 rounded-full shrink-0" />
      </div>

      <Skel className="h-3 w-3/4 mb-3" />

      {!compact && (
        <div className="flex items-center gap-3 mb-4">
          <Skel className="h-3 w-12" />
          <Skel className="h-3 w-14" />
          <Skel className="h-3 w-12" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Skel className="h-3 w-16" />
          <Skel className="h-3 w-20" />
        </div>
        <Skel className="h-3 w-12" />
      </div>
    </div>
  );
}

const REPO_ICONS = {
  'github.com': FaGithub,
  'gitlab.com': FaGitlab,
  'bitbucket.org': FaBitbucket,
};

function getRepoIcon(gitRepo) {
  if (!gitRepo) return Globe;
  try {
    const host = new URL(gitRepo).hostname.replace('www.', '');
    return REPO_ICONS[host] ?? Globe;
  } catch {
    return Globe;
  }
}

/**
 * Derive a short human-readable repo label from a full git URL.
 * e.g. "https://github.com/user/my-app" → "user/my-app"
 */
function repoLabel(gitRepo) {
  if (!gitRepo) return null;
  try {
    const url = new URL(gitRepo);
    return url.pathname.replace(/^\//, '').replace(/\.git$/, '');
  } catch {
    return gitRepo;
  }
}

export default function AppCard({ app, compact = false, onRetry }) {
  const repo = repoLabel(app.gitRepo);
  const ramGb = app.ram ? (app.ram / 1000).toFixed(1) : null;
  const RepoIcon = getRepoIcon(app.gitRepo);

  const mgmtPort = app._decryptFailed ? null : getMgmtPort(app);
  // API_KEY from env params — needed for authenticated management endpoints
  const apiKey = getSpecEnvValue(app, 'API_KEY') || undefined;
  // Use the first running node IP attached by useAppsWithStatus
  const nodeIp = app.nodeIp ?? null;

  const { data: orbitStatus } = useQuery({
    queryKey: ['orbitStatus', app.name, mgmtPort, nodeIp],
    queryFn: () => fetchNodeOrbitStatus(nodeIp, mgmtPort, apiKey),
    enabled: !!mgmtPort && !!nodeIp,
    staleTime: 60_000,
    retry: false,
  });

  const commit = orbitStatus?.last_deployment?.commit;
  const commitFull = orbitStatus?.last_deployment?.commit_full;

  if (app._decryptFailed) {
    return (
      <div className="card border-dashed">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-text truncate">{app.name}</h3>
            <p className="text-xs text-text-muted mt-0.5">Enterprise app — spec encrypted</p>
          </div>
          <Lock className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Could not decrypt via your Flux node. Ensure your session is connected to the correct sticky node.
        </p>
        <div className="flex items-center justify-between">
          {onRetry ? (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              Retry decrypt
            </button>
          ) : <span />}
          <Link
            to={`/dashboard/deployments/${app.name}`}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-primary transition-colors"
          >
            Manage
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card hover:border-primary/30 transition-colors group">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text truncate">{app.name}</h3>
          {app.description && !compact && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{app.description}</p>
          )}
        </div>
        <StatusBadge status={app.status} className="shrink-0 mt-0.5" />
      </div>

      {/* Git info */}
      {repo && (
        <div className="flex items-center gap-2 text-xs text-text-secondary mb-3">
          <RepoIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />
          <a
            href={app.gitRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {repo}
          </a>
        </div>
      )}

      {/* Resources row */}
      {!compact && (
        <div className="flex items-center gap-3 text-xs text-text-muted mb-4">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            {app.cpu} vCPU
          </span>
          {ramGb && (
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {ramGb} GB RAM
            </span>
          )}
          <span className="flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            {app.hdd} GB
          </span>
          <span className="ml-auto text-text-muted">
            ×{app.instances} node{app.instances !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-xs text-text-muted min-w-0">
          {commit && (
            <>
              <a
                href={commitFull && app.gitRepo ? `${app.gitRepo.replace(/\.git$/, '')}/commit/${commitFull}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 shrink-0 font-mono hover:text-primary transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <GitCommit className="w-3 h-3" />
                {commit.slice(0, 7)}
              </a>
              <span className="text-border">·</span>
            </>
          )}
          {app.gitBranch && (
            <span className="flex items-center gap-1 min-w-0">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{app.gitBranch}</span>
            </span>
          )}
        </div>
        <Link
          to={`/dashboard/deployments/${app.name}`}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-primary transition-colors group-hover:text-primary"
        >
          Manage
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
