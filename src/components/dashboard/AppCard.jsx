import { Link } from 'react-router-dom';
import { GitBranch, GitCommit, Cpu, HardDrive, Layers, ExternalLink, Globe } from 'lucide-react';
import StatusBadge from './StatusBadge';

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

export default function AppCard({ app, compact = false }) {
  const repo = repoLabel(app.gitRepo);
  const ramGb = app.ram ? (app.ram / 1000).toFixed(1) : null;

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
          <Globe className="w-3.5 h-3.5 shrink-0 text-text-muted" />
          <a
            href={app.gitRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {repo}
          </a>
          <span className="text-border">·</span>
          <GitBranch className="w-3 h-3 shrink-0 text-text-muted" />
          <span className="text-text-muted">{app.gitBranch}</span>
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
          <span className="flex items-center gap-1 shrink-0">
            <GitCommit className="w-3 h-3" />
            <span className="font-mono">{app.hash ? app.hash.slice(0, 7) : '—'}</span>
          </span>
          {app.gitBranch && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1 min-w-0">
                <GitBranch className="w-3 h-3 shrink-0" />
                <span className="truncate">{app.gitBranch}</span>
              </span>
            </>
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
