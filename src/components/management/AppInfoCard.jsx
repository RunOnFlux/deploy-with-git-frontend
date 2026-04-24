import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Cpu, HardDrive, MemoryStick, Globe, GitBranch, GitCommit, ExternalLink, Loader2, Server as ServerIcon, Monitor, Copy } from 'lucide-react';
import StatusBadge from '../dashboard/StatusBadge';
import { fetchOrbitStatus, getMgmtPort } from '../../services/managementService';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy(e) {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 rounded text-text-muted hover:text-text transition-colors"
      title="Copy"
    >
      <Copy className={`w-3 h-3 ${copied ? 'text-accent' : ''}`} />
    </button>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false, link, copyable = false }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <Icon className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
      <span className="text-xs text-text-muted w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className={`text-sm text-primary hover:underline flex items-center gap-1 truncate ${mono ? 'font-mono' : ''}`}>
            {value}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <span className={`text-sm text-text break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
        )}
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}

function SitePreview({ url }) {
  const [state, setState] = useState('loading'); // loading | loaded | error
  const screenshotUrl = `/api/screenshot?url=${encodeURIComponent(url)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors group relative mb-4"
      title="Open live site"
    >
      {/* Skeleton shown while loading */}
      {state === 'loading' && (
        <div className="w-full h-48 bg-surface-hover animate-pulse flex items-center justify-center">
          <Monitor className="w-6 h-6 text-text-muted/40" />
        </div>
      )}

      {/* Screenshot */}
      <img
        src={screenshotUrl}
        alt="Live site preview"
        loading="lazy"
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className={`w-full object-cover object-top transition-opacity duration-300 ${state === 'loaded' ? 'opacity-100' : 'opacity-0 absolute inset-0 h-0'}`}
        style={{ aspectRatio: '16/9' }}
      />

      {/* Error fallback */}
      {state === 'error' && (
        <div className="w-full h-48 bg-surface-hover flex flex-col items-center justify-center gap-2">
          <Monitor className="w-6 h-6 text-text-muted/40" />
          <span className="text-xs text-text-muted">Preview unavailable</span>
        </div>
      )}

      {/* Hover overlay */}
      {state === 'loaded' && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      )}
    </a>
  );
}

function ResourceChip({ icon: Icon, label, value, color = 'text-text-muted' }) {
  return (
    <div className="bg-surface-hover rounded-lg px-2 py-2 flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0 flex items-baseline justify-between gap-1">
        <div className="text-xs font-semibold text-text leading-none truncate">{value}</div>
        <div className="text-[11px] text-text-muted leading-none shrink-0">{label}</div>
      </div>
    </div>
  );
}

export default function AppInfoCard({ spec, nodeStatuses, appName }) {
  const [orbitStatus, setOrbitStatus] = useState(null);

  useEffect(() => {
    const port = getMgmtPort(spec);
    if (!appName || !port) return;
    fetchOrbitStatus(appName, port)
      .then(setOrbitStatus)
      .catch(() => {}); // non-critical
  }, [appName, spec]);

    if (!spec) {
    return (
      <div className="card animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="h-5 w-32 bg-surface-hover rounded mb-2" />
            <div className="h-3 w-48 bg-surface-hover rounded" />
          </div>
          <div className="h-6 w-16 bg-surface-hover rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-14 bg-surface-hover rounded-lg" />)}
        </div>
        <div className="w-full bg-surface-hover rounded-xl mb-4" style={{ aspectRatio: '16/9' }} />
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-8 bg-surface-hover rounded" />)}
        </div>
      </div>
    );
  }

  const compose = spec.compose?.[0] ?? {};
  const envObj = {};
  for (const e of (compose.environmentParameters ?? [])) {
    const idx = e.indexOf('=');
    if (idx > 0) envObj[e.slice(0, idx)] = e.slice(idx + 1);
  }

  const gitRepo = (() => {
    const raw = envObj.GIT_REPO_URL || envObj.GIT_REPO || envObj.REPO_URL || '';
    try { const u = new URL(raw); u.username = ''; u.password = ''; return u.toString(); } catch { return raw; }
  })();

  const gitBranch = envObj.GIT_BRANCH || envObj.BRANCH || 'main';

  // Overall status derived from node statuses
  const total = nodeStatuses.length;
  const running = nodeStatuses.filter((n) => n.runningstatus === 'RUNNING').length;
  const overallStatus = total === 0 ? 'unknown'
    : running === total ? 'running'
    : running > 0 ? 'partial'
    : 'stopped';

  // Live URL — always the Flux CDN domain
  const customDomain = compose.domains?.[0];
  const liveUrl = customDomain
    ? `https://${customDomain}`
    : `https://${appName}.app.runonflux.io`;

  // Commit from orbit status
  const commit = orbitStatus?.last_deployment?.commit;
  const commitFull = orbitStatus?.last_deployment?.commit_full;
  const buildStatus = orbitStatus?.last_deployment?.build_status;
  const deployedAt = orbitStatus?.last_deployment?.updated_at
    ? new Date(orbitStatus.last_deployment.updated_at).toLocaleString()
    : null;

  const ram = compose.ram >= 1000 ? `${(compose.ram / 1000).toFixed(1)} GB` : `${compose.ram} MB`;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-text">{spec.name}</h2>
          {spec.description && <p className="text-sm text-text-secondary mt-0.5">{spec.description}</p>}
        </div>
        <StatusBadge status={overallStatus} />
      </div>

      {/* Resource chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <ResourceChip icon={Cpu}        label="CPU"   value={`${compose.cpu} vCPU`}  color="text-blue-400" />
        <ResourceChip icon={MemoryStick} label="RAM"   value={ram}                    color="text-purple-400" />
        <ResourceChip icon={HardDrive}  label="SSD"   value={`${compose.hdd} GB`}    color="text-amber-400" />
        <ResourceChip
          icon={ServerIcon}
          label="Nodes"
          value={`${running}/${spec.instances ?? 3}`}
          color={running === 0 ? 'text-danger' : running < (spec.instances ?? 3) ? 'text-warning' : 'text-accent'}
        />
      </div>

      {/* Site screenshot */}
      {liveUrl && <SitePreview url={liveUrl} />}

      {/* Info rows */}
      <div className="divide-y divide-border/50">
        {liveUrl && (
          <InfoRow icon={Globe} label="Live URL" value={liveUrl} link={liveUrl} copyable />
        )}
        <InfoRow icon={GitBranch} label="Repo" value={gitRepo} link={gitRepo || undefined} />
        <InfoRow icon={GitBranch} label="Branch" value={gitBranch} mono />
        {commit ? (
          <InfoRow
            icon={GitCommit}
            label="Commit"
            value={`${commit}${buildStatus ? ` · ${buildStatus}` : ''}`}
            mono
            link={commitFull && gitRepo ? `${gitRepo.replace(/\.git$/, '')}/commit/${commitFull}` : undefined}
          />
        ) : (
          <div className="flex items-center gap-3 py-2.5">
            <GitCommit className="w-4 h-4 text-text-muted shrink-0" />
            <span className="text-xs text-text-muted w-24 shrink-0">Commit</span>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
          </div>
        )}
        {deployedAt && (
          <InfoRow icon={GitCommit} label="Deployed" value={deployedAt} />
        )}
      </div>
    </div>
  );
}
